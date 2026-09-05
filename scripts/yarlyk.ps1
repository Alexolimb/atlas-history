# Ярлык Atlas на рабочий стол.
#
# Открывает приложение в отдельном окне браузера (--app), без вкладок и адресной
# строки — выглядит как обычная программа.
#
# Ничего не удаляет: если ярлык уже есть, он перезаписывается тем же именем.
# Кириллица в пути ярлыка ломает чтение цели, поэтому имя файла — латиницей,
# а русское название видно в свойствах и подписи.

$ErrorActionPreference = 'Stop'

$appUrl = 'https://alexolimb.github.io/atlas-history/'

# Ищем браузер: Chrome, потом Edge. Оба умеют режим отдельного окна.
$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop 'Atlas.lnk'
$iconPath = Join-Path $PSScriptRoot '..\public\icons\atlas.ico'
$iconPath = [System.IO.Path]::GetFullPath($iconPath)

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($linkPath)

if ($browser) {
  $link.TargetPath = $browser
  $link.Arguments  = "--app=$appUrl"
} else {
  # Браузера в обычном месте нет — открываем адрес системным способом.
  $link.TargetPath = $appUrl
}

$link.Description = 'Atlas - vsya istoriya mira'
if (Test-Path $iconPath) { $link.IconLocation = $iconPath }
$link.Save()

Write-Output "Yarlyk sozdan: $linkPath"
if ($browser) { Write-Output "Brauzer: $browser" } else { Write-Output 'Brauzer ne nayden - yarlyk otkroet adres sistemnym sposobom' }
