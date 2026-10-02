param(
    [Parameter(Mandatory)]
    [string]$ArchivePath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ArchivePath).Path)
$sha = [Security.Cryptography.SHA256]::Create()
$allOk = $true

foreach ($w in 'Regular', 'Medium', 'Bold') {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq "HarmonyOS Sans/HarmonyOS_Sans_SC/HarmonyOS_Sans_SC_$w.ttf" }
    if (-not $entry) { throw "Archive is missing HarmonyOS_Sans_SC_$w.ttf" }
    $stream = $entry.Open()
    $ms = New-Object IO.MemoryStream
    $stream.CopyTo($ms)
    $stream.Close()
    $origHash = ($sha.ComputeHash($ms.ToArray()) | ForEach-Object { $_.ToString('x2') }) -join ''
    $ms.Dispose()

    foreach ($dir in 'public', 'dist') {
        $path = Join-Path $projectRoot "$dir/fonts/HarmonyOS_Sans_SC_$w.ttf"
        if ($dir -eq 'dist' -and -not (Test-Path -LiteralPath $path)) {
            Write-Output "SKIP  $dir/$w  无本地构建产物"
            continue
        }
        $h = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLower()
        if ($h -eq $origHash) {
            Write-Output "OK    $dir/$w  逐字节等于 zip 原件"
        } else {
            Write-Output "DIFF  $dir/$w  zip=$origHash  file=$h"
            $allOk = $false
        }
    }
}
$zip.Dispose()
if ($allOk) { Write-Output "`n全部字体文件未被修改（符合许可证第 2 条）" } else { exit 1 }
