[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$packageMetadata = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'package.json') | ConvertFrom-Json
$version = $packageMetadata.version
$productDirectoryName = "HIA-HugeRTE-$version-windows-x64"
$outputRoot = Join-Path $projectRoot 'output'
$stagingDirectory = Join-Path $outputRoot $productDirectoryName
$archivePath = Join-Path $outputRoot "$productDirectoryName.zip"
$executablePath = Join-Path $projectRoot 'src-tauri\target\release\hia-hugerte-tauri.exe'

if (Test-Path -LiteralPath $stagingDirectory) {
    throw "便携版暂存目录已存在，请先人工检查并移除：$stagingDirectory"
}

if (Test-Path -LiteralPath $archivePath) {
    throw "便携版 ZIP 已存在，请先人工检查并移除：$archivePath"
}

Push-Location $projectRoot
try {
    & npm.cmd run tauri:build
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri 构建失败，退出码：$LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
    throw "未找到已构建的应用程序：$executablePath"
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
New-Item -ItemType Directory -Path $stagingDirectory | Out-Null

Copy-Item -LiteralPath $executablePath -Destination (Join-Path $stagingDirectory 'HIA HugeRTE.exe')
Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') -Destination $stagingDirectory
Copy-Item -LiteralPath (Join-Path $projectRoot 'THIRD_PARTY_NOTICES.md') -Destination $stagingDirectory
Copy-Item -LiteralPath (Join-Path $projectRoot 'packaging\portable\README.md') -Destination $stagingDirectory

Compress-Archive -LiteralPath $stagingDirectory -DestinationPath $archivePath
Write-Host "已生成便携版 ZIP：$archivePath"
