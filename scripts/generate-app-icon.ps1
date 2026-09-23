Add-Type -AssemblyName System.Drawing
$size = 1024
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'

# Rounded background using a path
$rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 180.0
$diameter = $radius * 2.0
$path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
$path.AddArc($rect.X + $rect.Width - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
$path.AddArc($rect.X + $rect.Width - $diameter, $rect.Y + $rect.Height - $diameter, $diameter, $diameter, 0, 90)
$path.AddArc($rect.X, $rect.Y + $rect.Height - $diameter, $diameter, $diameter, 90, 90)
$path.CloseFigure()

$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(99, 102, 241)), ([System.Drawing.Color]::FromArgb(67, 56, 202)), 90.0
$g.FillPath($bg, $path)

# Dollar sign
$font = New-Object System.Drawing.Font('Segoe UI', 520, [System.Drawing.FontStyle]::Bold)
$fg = [System.Drawing.Brushes]::White
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$fmt.LineAlignment = 'Center'
$textRect = New-Object System.Drawing.RectangleF 0, 30, $size, $size
$g.DrawString('$', $font, $fg, $textRect, $fmt)

$g.Dispose()
$out = Join-Path $PSScriptRoot '..\build\icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "wrote $out"
