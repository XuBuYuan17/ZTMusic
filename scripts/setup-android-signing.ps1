param(
  [string]$Repo = "XuBuYuan17/ZTMusic",
  [string]$Alias = "upload",
  [string]$OutputDir = ".android-signing",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Find-CommandPath([string]$Name, [string[]]$Fallbacks) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  foreach ($path in $Fallbacks) {
    if (Test-Path -LiteralPath $path) {
      return $path
    }
  }

  return $null
}

$keytool = Find-CommandPath "keytool.exe" @(
  "C:\Program Files\Java\jdk-26.0.1\bin\keytool.exe",
  "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe",
  "$env:JAVA_HOME\bin\keytool.exe"
)

if (-not $keytool) {
  throw "keytool.exe was not found. Install a JDK or Android Studio, then rerun this script."
}

$gh = Find-CommandPath "gh.exe" @(
  "C:\Program Files\GitHub CLI\gh.exe"
)

if (-not $gh) {
  throw "GitHub CLI gh.exe was not found. Install GitHub CLI or set the Android secrets manually."
}

& $gh auth status --active 1>$null
if ($LASTEXITCODE -ne 0) {
  throw "GitHub CLI is not logged in. Run 'gh auth login -h github.com' first, then rerun this script."
}

$outputPath = Join-Path (Get-Location) $OutputDir
$keystorePath = Join-Path $outputPath "upload-keystore.jks"
$passwordPath = Join-Path $outputPath "android-keystore-password.txt"

if ((Test-Path -LiteralPath $keystorePath) -and -not $Force) {
  throw "Keystore already exists at $keystorePath. Rerun with -Force only if you intentionally want a new Android signing identity."
}

New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$passwordBytes = New-Object byte[] 24
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $rng.GetBytes($passwordBytes)
} finally {
  $rng.Dispose()
}
$password = [Convert]::ToBase64String($passwordBytes).TrimEnd("=")

& $keytool `
  -genkeypair `
  -v `
  -keystore $keystorePath `
  -storetype PKCS12 `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -alias $Alias `
  -storepass $password `
  -keypass $password `
  -dname "CN=ZTMusic, OU=ZTMusic, O=ZTMusic, L=Unknown, S=Unknown, C=CN"

if ($LASTEXITCODE -ne 0) {
  throw "keytool failed to create the Android keystore."
}

Set-Content -LiteralPath $passwordPath -Value @(
  "ANDROID_KEY_ALIAS=$Alias"
  "ANDROID_KEYSTORE_PASSWORD=$password"
  "ANDROID_KEY_PASSWORD=$password"
) -Encoding UTF8

$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keystorePath))

$base64 | & $gh secret set ANDROID_KEY_BASE64 --repo $Repo
$Alias | & $gh secret set ANDROID_KEY_ALIAS --repo $Repo
$password | & $gh secret set ANDROID_KEYSTORE_PASSWORD --repo $Repo
$password | & $gh secret set ANDROID_KEY_PASSWORD --repo $Repo

Write-Host "Android signing secrets were set for $Repo."
Write-Host "Keystore backup: $keystorePath"
Write-Host "Password backup: $passwordPath"
