param(
  [string]$BuildProfile = "lan-demo"
)

$ErrorActionPreference = "Stop"

function Load-LocalEnv {
  $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
  $json = & node -e "require('./scripts/load-env.cjs'); console.log(JSON.stringify({EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL ?? '', EXPO_PUBLIC_WS_BASE_URL: process.env.EXPO_PUBLIC_WS_BASE_URL ?? '', PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER ?? '', APP_BUNDLE_ID: process.env.APP_BUNDLE_ID ?? ''}))"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to load local env configuration"
  }
  $resolved = $json | ConvertFrom-Json
  foreach ($name in "EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_WS_BASE_URL", "PAYMENT_PROVIDER", "APP_BUNDLE_ID") {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name)) -and -not [string]::IsNullOrWhiteSpace($resolved.$name)) {
      Set-Item -Path ("Env:" + $name) -Value $resolved.$name
    }
  }
}

function Require-Env([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing required environment variable: $Name"
  }
  return $value.Trim()
}

function Invoke-Step([scriptblock]$Step, [string]$FailureMessage) {
  & $Step
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }
}

function Assert-NotLocalhost([string]$Url, [string]$Name) {
  if ($Url -match "localhost|127\.0\.0\.1|::1") {
    throw "$Name must not point to localhost for LAN demo builds"
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot
Load-LocalEnv

$apiBaseUrl = Require-Env "EXPO_PUBLIC_API_BASE_URL"
$wsBaseUrl = Require-Env "EXPO_PUBLIC_WS_BASE_URL"
$paymentProvider = Require-Env "PAYMENT_PROVIDER"
$bundleId = [Environment]::GetEnvironmentVariable("APP_BUNDLE_ID")
if ([string]::IsNullOrWhiteSpace($bundleId)) {
  $bundleId = "com.shenghuobang.app"
  Set-Item -Path Env:APP_BUNDLE_ID -Value $bundleId
}
$bundleId = $bundleId.Trim()
$gitCommit = (git rev-parse HEAD).Trim()
$shortSha = $gitCommit.Substring(0, 7)
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$artifactsDir = Join-Path $repoRoot "artifacts\lan-demo-build\$timestamp"
$androidExportDir = Join-Path $repoRoot "artifacts\android-export"

Assert-NotLocalhost $apiBaseUrl "EXPO_PUBLIC_API_BASE_URL"
Assert-NotLocalhost $wsBaseUrl "EXPO_PUBLIC_WS_BASE_URL"

if ($paymentProvider -ne "sandbox") {
  throw "PAYMENT_PROVIDER must be sandbox for LAN demo builds"
}

$apiUri = [Uri]$apiBaseUrl
$cleartextExpected = $apiUri.Scheme -eq "http"

$env:EXPO_PUBLIC_BUILD_PROFILE = $BuildProfile
$env:EXPO_PUBLIC_RELEASE_CHANNEL = "alpha"
$env:EXPO_PUBLIC_GIT_COMMIT = $gitCommit
$env:USERPROFILE = Join-Path $repoRoot ".userhome"
$env:HOME = $env:USERPROFILE
New-Item -ItemType Directory -Force -Path $env:USERPROFILE | Out-Null

New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null
Remove-Item -Recurse -Force $androidExportDir -ErrorAction SilentlyContinue

Invoke-Step { pnpm build:android:export } "expo export failed"
Invoke-Step { node scripts/check-android-export.mjs } "android export validation failed"

Push-Location (Join-Path $repoRoot "android")
try {
  Invoke-Step { .\gradlew.bat assembleRelease bundleRelease "-PlanDemo=$($cleartextExpected.ToString().ToLower())" } "Gradle release build failed"
} finally {
  Pop-Location
}

$apkPath = Get-ChildItem -Path (Join-Path $repoRoot "android\app\build\outputs\apk\release") -Filter "*.apk" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$aabPath = Get-ChildItem -Path (Join-Path $repoRoot "android\app\build\outputs\bundle\release") -Filter "*.aab" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apkPath -or -not $aabPath) {
  throw "APK or AAB output was not generated"
}

$apkSha = (Get-FileHash $apkPath.FullName -Algorithm SHA256).Hash.ToLower()
$aabSha = (Get-FileHash $aabPath.FullName -Algorithm SHA256).Hash.ToLower()

$summary = @(
  "git_commit=$gitCommit",
  "branch=$(git branch --show-current)",
  "version=4.0.0",
  "version_code=400001",
  "build_profile=$BuildProfile",
  "api_host=$($apiUri.Host)",
  "application_id=$bundleId",
  "cleartext_expected=$cleartextExpected",
  "new_architecture=true",
  "hermes=true",
  "apk_sha256=$apkSha",
  "aab_sha256=$aabSha",
  "built_at=$timestamp"
) -join [Environment]::NewLine

$summary | Set-Content -Encoding UTF8 (Join-Path $artifactsDir "summary.txt")
Write-Host $summary
