param(
    [Parameter(Mandatory=$true)][string]$Root,
    [Parameter(Mandatory=$true)][string]$OutPath
)

Add-Type -AssemblyName System.Drawing

function Get-ResizedBytes {
    param([string]$Path, [int]$MaxEdge, [bool]$Transparent, [int]$JpegQuality)

    $orig = [System.Drawing.Bitmap]::FromFile($Path)
    try {
        $longEdge = [Math]::Max($orig.Width, $orig.Height)
        $scale = if ($longEdge -gt $MaxEdge) { $MaxEdge / $longEdge } else { 1.0 }
        $w = [Math]::Max(1, [int]([Math]::Round($orig.Width * $scale)))
        $h = [Math]::Max(1, [int]([Math]::Round($orig.Height * $scale)))

        $pixelFormat = if ($Transparent) { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb } else { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb }
        $resized = New-Object System.Drawing.Bitmap $w, $h, $pixelFormat
        $g = [System.Drawing.Graphics]::FromImage($resized)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        if (-not $Transparent) {
            $g.Clear([System.Drawing.Color]::White)
        }
        $g.DrawImage($orig, 0, 0, $w, $h)
        $g.Dispose()

        $ms = New-Object System.IO.MemoryStream
        if ($Transparent) {
            $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
            $mime = "image/png"
        } else {
            $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
            $encParams = New-Object System.Drawing.Imaging.EncoderParameters 1
            $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [int64]$JpegQuality)
            $resized.Save($ms, $jpegCodec, $encParams)
            $mime = "image/jpeg"
        }
        $bytes = $ms.ToArray()
        $resized.Dispose()
        $ms.Dispose()
        return @{ Bytes = $bytes; Mime = $mime }
    } finally {
        $orig.Dispose()
    }
}

function Get-ImageProfile {
    param([string]$FileName)
    if ($FileName -match "owner-") { return @{ MaxEdge = 240; Transparent = $true } }
    if ($FileName -match "badge-|point-") { return @{ MaxEdge = 320; Transparent = $true } }
    if ($FileName -match "logo-.*horizontal") { return @{ MaxEdge = 360; Transparent = $true } }
    if ($FileName -match "symbol-|logo-") { return @{ MaxEdge = 260; Transparent = $true } }
    if ($FileName -match "^rolling-") { return @{ MaxEdge = 950; Transparent = $false } }
    # 100vw 풀블리드 히어로 배너 + luminance 마스크 소스로도 재사용되는 이미지 — 기본
    # 프로필(1100px/quality 70)로 재압축하면 어두운 그라디언트 배경에 블록 노이즈가
    # 두드러져 "깨져 보인다"는 피드백을 받았다. 더 높은 해상도/품질로 예외 처리.
    if ($FileName -eq "ev-hero-charging.jpg") { return @{ MaxEdge = 2400; Transparent = $false } }
    return @{ MaxEdge = 1100; Transparent = $false }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$html = [System.IO.File]::ReadAllText((Join-Path $Root "index.html"), [System.Text.Encoding]::UTF8)
$css = [System.IO.File]::ReadAllText((Join-Path $Root "assets/css/styles.css"), [System.Text.Encoding]::UTF8)
$js = [System.IO.File]::ReadAllText((Join-Path $Root "assets/js/main.js"), [System.Text.Encoding]::UTF8)

# loading="lazy" defers the network fetch of an image until it nears the
# viewport -- meaningless once every image is an inline data URI (already
# fully downloaded as part of the HTML), and on some mobile browsers the
# lazy "near viewport" check never fires for images sitting inside a
# continuously CSS-transformed strip (the rolling gallery), leaving them
# permanently unrendered. Strip it for the standalone bundle only.
$html = $html -replace ' loading="lazy"', ''

# Inline the font (unchanged, not resized)
$fontBytes = [System.IO.File]::ReadAllBytes((Join-Path $Root "assets/fonts/PretendardVariable.woff2"))
$fontB64 = [Convert]::ToBase64String($fontBytes)
$css = $css -replace [regex]::Escape('url("../fonts/PretendardVariable.woff2")'), ('url("data:font/woff2;base64,' + $fontB64 + '")')

# Rolling gallery: the seamless loop duplicates every <img> (once per copy
# of the group), so as data URIs each image's full base64 text would sit
# in the DOM twice -- real memory just to hold the string, on top of
# whatever the browser does for decode. Define each unique rolling image's
# background-image ONCE in CSS and have both loop copies reference it by
# class, instead of inlining the same data URI into two <img src="..."> .
$rollingDir = Join-Path $Root "assets/img/rolling"
$rollingCss = "`n/* 롤링 갤러리: 배경이미지를 클래스로 1회만 정의, 양쪽 루프 그룹이 공유 (DOM 중복 방지) */`n"
$rollingCss += @"
.rolling-gallery__img {
  height: 630px;
  aspect-ratio: 3 / 2;
  background-size: cover;
  background-position: center;
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  flex-shrink: 0;
}
@media (max-width: 768px) {
  .rolling-gallery__img { height: 320px; }
}
"@
Get-ChildItem $rollingDir -Filter "rolling-*.jpg" | ForEach-Object {
    $slug = $_.BaseName -replace '^rolling-', ''
    $origLen = $_.Length
    $result = Get-ResizedBytes -Path $_.FullName -MaxEdge 950 -Transparent $false -JpegQuality 62
    $b64 = [Convert]::ToBase64String($result.Bytes)
    $rollingCss += (".rolling-gallery__img--{0} {{ background-image: url(data:{1};base64,{2}); }}`n" -f $slug, $result.Mime, $b64)
    $imgTagPattern = '<img src="assets/img/rolling/' + [regex]::Escape($_.Name) + '"[^>]*>'
    $replacement = '<div class="rolling-gallery__img rolling-gallery__img--' + $slug + '"></div>'
    $html = $html -replace $imgTagPattern, $replacement
    Write-Host ("{0,-45} {1,8:N0} KB -> {2,8:N0} KB (shared by both loop copies)" -f $_.Name, ($origLen/1KB), ($result.Bytes.Length/1KB))
}
$css = $css + $rollingCss

# Inline every image, resized/recompressed per its role.
# (Note: [regex]::Replace($html,{scriptblock}) via automatic MatchEvaluator
# conversion has been observed to silently lose its closure over $cache in
# this environment. Collect unique paths first and use plain string replace
# instead of relying on that conversion.)
$totalOrig = 0
$totalNew = 0
$heroDataUri = $null
$imgRegex = [regex]'src="(assets/img/[^"]+)"'
$uniquePaths = $imgRegex.Matches($html) | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
foreach ($relPath in $uniquePaths) {
    $absPath = Join-Path $Root $relPath
    $origLen = (Get-Item $absPath).Length
    $profile = Get-ImageProfile ([System.IO.Path]::GetFileName($relPath))
    $q = if ($relPath -match "rolling-") { 62 } elseif ([System.IO.Path]::GetFileName($relPath) -eq "ev-hero-charging.jpg") { 85 } else { 70 }
    $result = Get-ResizedBytes -Path $absPath -MaxEdge $profile.MaxEdge -Transparent $profile.Transparent -JpegQuality $q
    $b64 = [Convert]::ToBase64String($result.Bytes)
    $totalOrig += $origLen
    $totalNew += $result.Bytes.Length
    $dataUri = 'data:' + $result.Mime + ';base64,' + $b64
    $html = $html.Replace('src="' + $relPath + '"', 'src="' + $dataUri + '"')
    if ([System.IO.Path]::GetFileName($relPath) -eq "ev-hero-charging.jpg") { $heroDataUri = $dataUri }
    Write-Host ("{0,-45} {1,8:N0} KB -> {2,8:N0} KB" -f $relPath, ($origLen/1KB), ($result.Bytes.Length/1KB))
}

# CSS의 mask-image: url("../img/ev-hero-charging-mask.png")는 위 <img src="...">
# 인라인 루프가 건드리지 않는 상대경로라(이 파일은 어떤 <img> 태그에도 안 쓰이고
# CSS에서만 참조됨), 번들 단일 HTML에서는 파일을 찾지 못해 마스크가 통째로 비어버려
# (= 빛 효과가 안 보임) 로컬 프리뷰와 다르게 보이는 원인이었다. 별도로 직접 읽어 인라인.
# object-fit/mask-size 모두 cover+center라 히어로 이미지와 화소수가 달라도(둘 다 같은
# 원본에서 뽑은 동일 비율이라) 어긋나지 않으므로, 번들 용량을 위해 같은 해상도로 축소.
$maskPath = Join-Path $Root "assets/img/ev-hero-charging-mask.png"
if (Test-Path $maskPath) {
    $maskOrigLen = (Get-Item $maskPath).Length
    $maskResult = Get-ResizedBytes -Path $maskPath -MaxEdge 2400 -Transparent $true -JpegQuality 100
    $maskB64 = [Convert]::ToBase64String($maskResult.Bytes)
    $maskDataUri = 'data:' + $maskResult.Mime + ';base64,' + $maskB64
    $css = $css.Replace('url("../img/ev-hero-charging-mask.png")', 'url("' + $maskDataUri + '")')
    Write-Host ("{0,-45} {1,8:N0} KB -> {2,8:N0} KB" -f "assets/img/ev-hero-charging-mask.png", ($maskOrigLen/1KB), ($maskResult.Bytes.Length/1KB))
}

$html = $html -replace '<link rel="stylesheet" href="assets/css/styles\.css(\?[^"]*)?">', ("<style>`n" + $css + "`n</style>")
$html = $html -replace '<script src="assets/js/main\.js"></script>', ("<script>`n" + $js + "`n</script>")

[System.IO.File]::WriteAllText($OutPath, $html, $utf8NoBom)

$outSize = (Get-Item $OutPath).Length
Write-Host "----"
Write-Host ("unique images: {0}" -f $uniquePaths.Count)
Write-Host ("image bytes: {0:N1} MB -> {1:N1} MB" -f ($totalOrig/1MB), ($totalNew/1MB))
Write-Host ("output file size: {0:N2} MB" -f ($outSize/1MB))
