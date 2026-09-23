$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $env:VITE_API_BASE) {
  Write-Warning "VITE_API_BASE is empty. Store builds should point at your Cloud Run URL."
}

npm run build:mobile
npx cap sync android

$gradlew = Join-Path $root "android\gradlew.bat"
if (-not (Test-Path $gradlew)) { throw "android/gradlew.bat missing. Run: npx cap add android" }

Set-Location (Join-Path $root "android")
& .\gradlew.bat bundleRelease
if ($LASTEXITCODE -ne 0) { throw "Gradle bundleRelease failed" }

$aab = Join-Path $root "android\app\build\outputs\bundle\release\app-release.aab"
Write-Host "Play Store bundle: $aab"
