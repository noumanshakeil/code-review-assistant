$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path package.json)) {
  Write-Host 'Unpack PocketMind-1.0.3-source.zip first, then run this script from the unpacked folder.'
  exit 1
}
npm ci
npm run assets:brand
npm run build:msix
Get-ChildItem release\*.appx | Format-Table Name, Length, LastWriteTime
Write-Host "Upload release\PocketMindAIReviewerAndHumanizer-1.0.3-x64.appx to Partner Center."
