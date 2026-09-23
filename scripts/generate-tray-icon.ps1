Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 32, 32
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(99, 102, 241))
$g.FillEllipse($bg, 2, 2, 28, 28)
$font = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
$fg = [System.Drawing.Brushes]::White
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$fmt.LineAlignment = 'Center'
$rect = New-Object System.Drawing.RectangleF 0, 1, 32, 32
$g.DrawString('$', $font, $fg, $rect, $fmt)
$g.Dispose()
$out = Join-Path $PSScriptRoot '..\build\tray-icon.png'
New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "wrote $out"
