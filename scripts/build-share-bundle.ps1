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
    return @{ MaxEdge = 1100; Transparent = $false }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$html = [System.IO.File]::ReadAllText((Join-Path $Root "index.html"), [System.Text.Encoding]::UTF8)
$css = [System.IO.File]::ReadAllText((Join-Path $Root "assets/css/styles.css"), [System.Text.Encoding]::UTF8)
$js = [System.IO.File]::ReadAllText((Join-Path $Root "assets/js/main.js"), [System.Text.Encoding]::UTF8)

# Inline the font (unchanged, not resized)
$fontBytes = [System.IO.File]::ReadAllBytes((Join-Path $Root "assets/fonts/PretendardVariable.woff2"))
$fontB64 = [Convert]::ToBase64String($fontBytes)
$css = $css -replace [regex]::Escape('url("../fonts/PretendardVariable.woff2")'), ('url("data:font/woff2;base64,' + $fontB64 + '")')

# Inline every image, resized/recompressed per its role
$cache = @{}
$totalOrig = 0
$totalNew = 0
$imgRegex = [regex]'src="(assets/img/[^"]+)"'
$html = $imgRegex.Replace($html, {
    param($m)
    $relPath = $m.Groups[1].Value
    if (-not $cache.ContainsKey($relPath)) {
        $absPath = Join-Path $Root $relPath
        $origLen = (Get-Item $absPath).Length
        $profile = Get-ImageProfile ([System.IO.Path]::GetFileName($relPath))
        $q = if ($relPath -match "rolling-") { 62 } else { 70 }
        $result = Get-ResizedBytes -Path $absPath -MaxEdge $profile.MaxEdge -Transparent $profile.Transparent -JpegQuality $q
        $b64 = [Convert]::ToBase64String($result.Bytes)
        $script:totalOrig += $origLen
        $script:totalNew += $result.Bytes.Length
        $cache[$relPath] = 'src="data:' + $result.Mime + ';base64,' + $b64 + '"'
        Write-Host ("{0,-45} {1,8:N0} KB -> {2,8:N0} KB" -f $relPath, ($origLen/1KB), ($result.Bytes.Length/1KB))
    }
    return $cache[$relPath]
})

$html = $html -replace '<link rel="stylesheet" href="assets/css/styles\.css">', ("<style>`n" + $css + "`n</style>")
$html = $html -replace '<script src="assets/js/main\.js"></script>', ("<script>`n" + $js + "`n</script>")

[System.IO.File]::WriteAllText($OutPath, $html, $utf8NoBom)

$outSize = (Get-Item $OutPath).Length
Write-Host "----"
Write-Host ("unique images: {0}" -f $cache.Count)
Write-Host ("image bytes: {0:N1} MB -> {1:N1} MB" -f ($totalOrig/1MB), ($totalNew/1MB))
Write-Host ("output file size: {0:N2} MB" -f ($outSize/1MB))
