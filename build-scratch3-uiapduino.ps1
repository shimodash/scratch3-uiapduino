# build-scratch3-uiapduino.ps1
# Created by tarosay (2026)
# Windows build helper script.
# Original project licenses apply; see LICENSE.
#
# scratch3-tello の build-scratch3-tello.ps1 と同じ構成。
# 違いは overlay する拡張が UIAPduino である点と、
# scratch-desktop の main プロセスにも WebHID 用のパッチを当てる点。
#
# 成果物: scratch-desktop\dist\Scratch <version> Setup.exe  (NSIS インストーラ)
#         scratch-desktop\dist\win-unpacked\Scratch 3.exe   (インストール不要の実行ファイル)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "=== Scratch3 UIAPduino build script (Windows PowerShell) ==="

# ネイティブコマンド (git / npm) は終了コードを返すだけで PowerShell の例外にはならないため、
# $ErrorActionPreference = "Stop" では止まらない。明示的に終了コードを確認する。
function Invoke-Checked([string]$File, [string[]]$CmdArgs) {
    Write-Host ">>> $File $($CmdArgs -join ' ')" -ForegroundColor Cyan
    & $File @CmdArgs
    if ($LASTEXITCODE -ne 0) {
        throw "FAILED (exit $LASTEXITCODE): $File $($CmdArgs -join ' ')"
    }
}

# 動作確認済みは Node.js v16.20.0 / npm 8.19.4。
# Node 17 以降は OpenSSL 3 のため webpack 4 が ERR_OSSL_EVP_UNSUPPORTED で失敗することがある。
$nodeVersion = (& node -v)
Write-Host "Node.js : $nodeVersion"
Write-Host "npm     : $(& npm.cmd -v)"
if ($nodeVersion -notmatch '^v16\.') {
    Write-Warning "Node.js v16 系 (v16.20.0 で動作確認) を推奨します。現在: $nodeVersion"
    Write-Warning "nvm-windows を使っている場合は 'nvm use 16.20.0' で切り替えてください。"
}

function Assert-DirNotExists([string]$name) {
    if (Test-Path $name) {
        throw "Directory '$name' already exists. Please remove it or run in a clean directory. ($name)"
    }
}

Assert-DirNotExists "scratch-vm"
Assert-DirNotExists "scratch-gui"
Assert-DirNotExists "scratch-desktop"
Assert-DirNotExists "scratch3-uiapduino"

# --- clone ---

Invoke-Checked "git" @("clone", "--filter=blob:none", "https://github.com/scratchfoundation/scratch-vm.git", "-b", "0.2.0-prerelease.20220222132735")
Invoke-Checked "git" @("clone", "--filter=blob:none", "https://github.com/scratchfoundation/scratch-gui.git", "-b", "scratch-desktop-v3.29.0")
Invoke-Checked "git" @("clone", "--filter=blob:none", "https://github.com/scratchfoundation/scratch-desktop.git", "-b", "v3.29.1")

# --- scratch-vm ---

Push-Location scratch-vm
Invoke-Checked "npm.cmd" @("install")
Invoke-Checked "npm.cmd" @("link")
Pop-Location

# --- scratch-gui ---

Push-Location scratch-gui
Invoke-Checked "npm.cmd" @("install")

# react-responsive の peer dependency を scratch-paint に合わせる (4.x)
# 未インストールでも失敗しないよう uninstall だけは終了コードを見ない
& npm.cmd uninstall react-responsive
Invoke-Checked "npm.cmd" @("install", "react-responsive@4.1.0", "--save-exact")

Invoke-Checked "npm.cmd" @("link", "scratch-vm")
Invoke-Checked "npm.cmd" @("link")
Pop-Location

# --- scratch-desktop ---

Push-Location scratch-desktop
Invoke-Checked "npm.cmd" @("install")

Push-Location node_modules

if (Test-Path "scratch-gui") {
    Remove-Item -Recurse -Force "scratch-gui"
}

# Linux の `ln -s ../../scratch-gui scratch-gui` 相当。
# SymbolicLink は「開発者モード」有効か管理者権限が必要だが、
# ディレクトリジャンクションなら一般ユーザ権限で作成でき、npm からは同じように扱われる。
New-Item -ItemType Junction -Path "scratch-gui" -Target "..\..\scratch-gui" | Out-Null

Pop-Location  # node_modules
Pop-Location  # scratch-desktop

# --- UIAPduino 拡張の取り込み ---
# scratch-vm / scratch-gui に加えて scratch-desktop/src/main/index.js も上書きする。
# main プロセス側で WebHID の許可 (setDevicePermissionHandler / select-hid-device) を
# 設定しないと、navigator.hid はデバイスを一切返さない。

Invoke-Checked "git" @("clone", "https://github.com/tarosay/scratch3-uiapduino/")

# Linux の `cp -r scratch3-uiapduino/. ./` 相当（.git は除外）
Get-ChildItem -Path ".\scratch3-uiapduino" -Force |
    Where-Object { $_.Name -ne ".git" } |
    ForEach-Object { Copy-Item -Path $_.FullName -Destination ".\" -Recurse -Force }

Remove-Item -Recurse -Force ".\scratch3-uiapduino"

# --- ビルド (Electron) ---
Push-Location scratch-desktop
Invoke-Checked "npm.cmd" @("run", "fetch")

# webpack バンドル生成 (dist\main, dist\renderer)
Invoke-Checked "npm.cmd" @("run", "compile")

# ここで `npm run build` を使わないこと:
#   npm run build は electron-builder-wrapper.js 経由で AppX (Microsoft Store 用) を
#   先にビルドするが、AppX には Windows SDK の makeappx.exe が必要で、
#   無い環境では "spawn UNKNOWN" で失敗し、そこで例外停止して
#   肝心の NSIS インストーラまで到達しない。
#   よって electron-builder を直接呼び、NSIS ターゲットのみをビルドする。
#   (upstream のリリースと同じ nsis:ia32。32bit 版だが 64bit Windows でも動作する)

# コード署名は行わない（証明書があると electron-builder が署名を試みて失敗するため除去）
Remove-Item Env:CSC_LINK, Env:CSC_KEY_PASSWORD, Env:WIN_CSC_LINK, Env:WIN_CSC_KEY_PASSWORD -ErrorAction SilentlyContinue

Invoke-Checked ".\node_modules\.bin\electron-builder.cmd" @("--windows", "nsis:ia32")

Get-ChildItem dist -File -Filter *.exe |
    Select-Object Name, @{n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } } |
    Format-Table

Pop-Location

Write-Host "=== Done. Built artifacts are in scratch-desktop\dist ===" -ForegroundColor Green
