$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [IO.Compression.ZipFile]::OpenRead('d:\资料\HarmonyOS-Sans.zip')
$sha = [Security.Cryptography.SHA256]::Create()
$allOk = $true

foreach ($w in 'Regular', 'Medium', 'Bold') {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq "HarmonyOS Sans/HarmonyOS_Sans_SC/HarmonyOS_Sans_SC_$w.ttf" }
    $stream = $entry.Open()
    $ms = New-Object IO.MemoryStream
    $stream.CopyTo($ms)
    $stream.Close()
    $origHash = ($sha.ComputeHash($ms.ToArray()) | ForEach-Object { $_.ToString('x2') }) -join ''
    $ms.Dispose()

    foreach ($dir in 'public', 'dist') {
        $path = "d:\Code\ZTmusic\$dir\fonts\HarmonyOS_Sans_SC_$w.ttf"
        $h = (Get-FileHash $path -Algorithm SHA256).Hash.ToLower()
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
