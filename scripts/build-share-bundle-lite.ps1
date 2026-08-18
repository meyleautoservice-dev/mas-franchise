param(
    [Parameter(Mandatory=$true)][string]$Root,
    [Parameter(Mandatory=$true)][string]$OutPath
)

# 저사양/iOS Safari 대응 경량판: main.js의 스크롤 모션 감시 시스템 전체를 꺼서
# (LIGHT_MODE=true) 메인 스레드 부담을 없애고, CSS로 모든 모션 요소를 즉시
# 최종 상태로 고정한다. 무한 롤링(부품 갤러리/티커/마퀴) 애니메이션도 정지.
# 이미지도 일반판보다 더 작고 더 압축해서 넣는다.

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
    if ($FileName -match "owner-") { return @{ MaxEdge = 200; Transparent = $true } }
    if ($FileName -match "badge-|point-") { return @{ MaxEdge = 260; Transparent = $true } }
    if ($FileName -match "logo-.*horizontal") { return @{ MaxEdge = 320; Transparent = $true } }
    if ($FileName -match "symbol-|logo-") { return @{ MaxEdge = 220; Transparent = $true } }
    if ($FileName -match "^rolling-") { return @{ MaxEdge = 700; Transparent = $false } }
    return @{ MaxEdge = 900; Transparent = $false }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$html = [System.IO.File]::ReadAllText((Join-Path $Root "index.html"), [System.Text.Encoding]::UTF8)
$css = [System.IO.File]::ReadAllText((Join-Path $Root "assets/css/styles.css"), [System.Text.Encoding]::UTF8)
$js = [System.IO.File]::ReadAllText((Join-Path $Root "assets/js/main.js"), [System.Text.Encoding]::UTF8)

# 경량 빌드 스위치 켜기
$js = $js -replace 'var LIGHT_MODE = false;', 'var LIGHT_MODE = true;'

# loading="lazy"는 data URI로 이미 전부 인라인된 이미지에는 의미가 없고,
# 계속 transform되는 롤링 갤러리 안에서는 일부 모바일 브라우저가 "뷰포트 근접" 판정을
# 못해 이미지가 영영 렌더링되지 않는 문제가 있었다. 번들 전용으로 제거.
$html = $html -replace ' loading="lazy"', ''

# 모션 요소를 처음부터 최종 상태로 고정하는 오버라이드 (noscript 폴백과 동일한 선택자 사용)
$lightCss = @"

/* ---------- 경량(iOS) 빌드: 모든 모션 비활성화, 정적 노출 ---------- */
.reveal, .reveal-img, .reveal-line, .reveal-lines .hl, .reveal-group > * {
  opacity: 1 !important;
  transform: none !important;
}
.hl.hl-pop { animation: none !important; }
.promo-banner .hl--shine.hl-pulsing { animation: none !important; }
.bar-chart__bar { transition: none !important; height: var(--h) !important; }
.bar-chart__trend path { transition: none !important; stroke-dashoffset: 0 !important; }
.bar-chart__trend polygon { transition: none !important; opacity: 1 !important; }
.ticker__track, .review-marquee__track, .rolling-gallery__track { animation: none !important; }
"@
$css = $css + $lightCss

# 폰트 인라인 (리사이즈 대상 아님)
$fontBytes = [System.IO.File]::ReadAllBytes((Join-Path $Root "assets/fonts/PretendardVariable.woff2"))
$fontB64 = [Convert]::ToBase64String($fontBytes)
$css = $css -replace [regex]::Escape('url("../fonts/PretendardVariable.woff2")'), ('url("data:font/woff2;base64,' + $fontB64 + '")')

# 이미지: 일반판보다 더 작고 더 압축된 프로필로 인라인
# (주의: [regex]::Replace($html,{scriptblock}) 형태의 자동 MatchEvaluator 변환은
# 이 환경에서 종종 스코프 캡처가 깨져 $cache가 null이 되는 문제가 있었다.
# 그래서 매치를 먼저 모아 고유 경로만 순회하며 일반 문자열 치환으로 처리한다.)
$totalOrig = 0
$totalNew = 0
$imgRegex = [regex]'src="(assets/img/[^"]+)"'
$uniquePaths = $imgRegex.Matches($html) | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
foreach ($relPath in $uniquePaths) {
    $absPath = Join-Path $Root $relPath
    $origLen = (Get-Item $absPath).Length
    $profile = Get-ImageProfile ([System.IO.Path]::GetFileName($relPath))
    $q = if ($relPath -match "rolling-") { 55 } else { 62 }
    $result = Get-ResizedBytes -Path $absPath -MaxEdge $profile.MaxEdge -Transparent $profile.Transparent -JpegQuality $q
    $b64 = [Convert]::ToBase64String($result.Bytes)
    $totalOrig += $origLen
    $totalNew += $result.Bytes.Length
    $html = $html.Replace('src="' + $relPath + '"', 'src="data:' + $result.Mime + ';base64,' + $b64 + '"')
    Write-Host ("{0,-45} {1,8:N0} KB -> {2,8:N0} KB" -f $relPath, ($origLen/1KB), ($result.Bytes.Length/1KB))
}

$html = $html -replace '<link rel="stylesheet" href="assets/css/styles\.css">', ("<style>`n" + $css + "`n</style>")
$html = $html -replace '<script src="assets/js/main\.js"></script>', ("<script>`n" + $js + "`n</script>")

[System.IO.File]::WriteAllText($OutPath, $html, $utf8NoBom)

$outSize = (Get-Item $OutPath).Length
Write-Host "----"
Write-Host ("unique images: {0}" -f $uniquePaths.Count)
Write-Host ("image bytes: {0:N1} MB -> {1:N1} MB" -f ($totalOrig/1MB), ($totalNew/1MB))
Write-Host ("output file size: {0:N2} MB" -f ($outSize/1MB))
