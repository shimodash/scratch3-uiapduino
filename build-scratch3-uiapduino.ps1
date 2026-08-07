# build-scratch3-uiapduino.ps1
# Created by tarosay (2026)
# Windows build helper script.
# Original project licenses apply; see LICENSE.
#
# scratch3-tello の build-scratch3-tello.ps1 と同じ構成。
# 違いは overlay する拡張が UIAPduino である点と、
# scratch-desktop の main プロセスにも WebHID 用のパッチを当てる点。
#
# 成果物: scratch-desktop\dist\Scratch-UIAPduino-<version>-Setup.exe     (NSIS インストーラ)
#         scratch-desktop\dist\Scratch-UIAPduino-<version>-portable.zip  (インストール不要版)
#         scratch-desktop\dist\Scratch-UIAPduino-<version>-sketch.zip    (デバイス側スケッチ)

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

# --- Terser のワーカー数を制限する ---
#
# electron-webpack の out/targets/BaseTarget.js が
#     if (env.minify !== false) { optimization.minimizer = [new TerserPlugin({parallel: true, ...})]; }
#     optimization.minimize = true;   // ← 条件の外にある
# となっており、scratch-desktop の compile が渡している --env.minify=false が効かない。
# その結果 webpack 4 の既定 minimizer (TerserPlugin, parallel: true) が使われ、
# os.cpus().length - 1 個のワーカープロセスを起こそうとする。
# コア数の多い機械ではスレッド生成に失敗し、92% の Terser で
#     spawn UNKNOWN
#     node_platform.cc:61: Assertion `(0) == (uv_thread_create(...))' failed
# となってビルドが落ちる (64 コアなら 63 プロセス)。
#
# 既定と同じ設定のまま parallel だけを絞るので、成果物は変わらない。
# cache / sourceMap の値は webpack 4 の WebpackOptionsDefaulter.js の既定に合わせてある。

$makeConfigPath = "scratch-desktop\webpack.makeConfig.js"
$makeConfigSrc = Get-Content $makeConfigPath -Raw

if ($makeConfigSrc -match 'parallel: 4') {
    Write-Host ">>> webpack.makeConfig.js: Terser パッチは適用済み" -ForegroundColor DarkGray
} else {
    $anchor = "    return config;"
    $hits = ([regex]::Matches($makeConfigSrc, [regex]::Escape($anchor))).Count
    if ($hits -ne 1) {
        throw "webpack.makeConfig.js のパッチ位置が特定できません (該当 $hits 箇所)。上流の変更を確認してください。"
    }

    $inject = @'
    // Terser のワーカー数を制限する (多コア環境でのビルド失敗対策)
    // build-scratch3-uiapduino.ps1 が挿入している。理由はそちらのコメントを参照。
    config.optimization = Object.assign({}, config.optimization, {
        minimizer: [new (require('terser-webpack-plugin'))({
            cache: true,
            parallel: 4,
            sourceMap: true
        })]
    });

    return config;
'@
    # このスクリプトは CRLF 保存なので、挿入する JS 側は LF に揃える
    $inject = $inject -replace "`r`n", "`n"

    $makeConfigSrc = $makeConfigSrc.Replace($anchor, $inject)
    Set-Content -Path $makeConfigPath -Value $makeConfigSrc -NoNewline
    Write-Host ">>> webpack.makeConfig.js: Terser のワーカー数を 4 に制限しました" -ForegroundColor Cyan
}

# --- 公式 Scratch Desktop と区別する ---
#
# 上流の electron-builder.yaml は
#     appId: edu.mit.scratch.scratch-desktop
#     productName: "Scratch 3"
# であり、そのままビルドすると公式 Scratch Desktop と
# アプリ名・appId・バージョンがすべて同一になる。
# 公式を入れている人がインストールすると同じアプリとみなされて上書きされ、
# スタートメニューでも見分けがつかない。
#
# nsis.artifactName は productName ではなく "Scratch" が直書きされているので、
# ここも変えないとインストーラのファイル名が変わらない。

$ebPath = "scratch-desktop\electron-builder.yaml"
$ebSrc = Get-Content $ebPath -Raw

$ebEdits = @(
    @{ From = 'appId: edu.mit.scratch.scratch-desktop'; To = 'appId: jp.uiap.scratch-uiapduino' },
    @{ From = 'productName: "Scratch 3"'; To = 'productName: "Scratch UIAPduino"' },
    @{ From = 'artifactName: "Scratch ${version} Setup.${ext}"'; To = 'artifactName: "Scratch-UIAPduino-${version}-Setup.${ext}"' }
)

if ($ebSrc -match 'scratch-uiapduino') {
    Write-Host ">>> electron-builder.yaml: パッチは適用済み" -ForegroundColor DarkGray
} else {
    foreach ($e in $ebEdits) {
        $hits = ([regex]::Matches($ebSrc, [regex]::Escape($e.From))).Count
        if ($hits -ne 1) {
            throw "electron-builder.yaml のパッチ位置が特定できません: '$($e.From)' (該当 $hits 箇所)"
        }
        $ebSrc = $ebSrc.Replace($e.From, $e.To)
    }
    # zip (インストール不要版) のファイル名も揃える。
    # 既定のままだと "Scratch UIAPduino-3.29.1-ia32-win.zip" とスペース入りになり、
    # インストーラ側の命名と揃わない。
    #
    # electron-builder 22 はトップレベルの zip: を受け付けない
    # ("configuration has an unknown property 'zip'") ので win 側に置く。
    # nsis と appx は自前の artifactName を持つため、これが効くのは zip だけ。
    $winAnchor = '  icon: buildResources/ScratchDesktop.ico'
    $winHits = ([regex]::Matches($ebSrc, [regex]::Escape($winAnchor))).Count
    if ($winHits -ne 1) {
        throw "electron-builder.yaml の win セクションが特定できません (該当 $winHits 箇所)"
    }
    $zipName = @'
  icon: buildResources/ScratchDesktop.ico
  artifactName: "Scratch-UIAPduino-${version}-portable.${ext}"
'@
    $zipName = ($zipName -replace "`r`n", "`n").TrimEnd("`n")
    $ebSrc = $ebSrc.Replace($winAnchor, $zipName)

    Set-Content -Path $ebPath -Value $ebSrc -NoNewline
    Write-Host ">>> electron-builder.yaml: appId / productName / artifactName を差し替えました" -ForegroundColor Cyan
}

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

# nsis  … インストーラ
# zip   … インストール不要版（インストール権限が無い環境向け）
Invoke-Checked ".\node_modules\.bin\electron-builder.cmd" @("--windows", "nsis:ia32", "zip:ia32")

# --- デバイス側スケッチの zip ---
#
# 以前は手作業で作っていたため、.ino を変えても古い zip が残り続けた。
# アプリと一緒に配るものなので、同じビルドで作る。
#
# Arduino IDE は .ino と同じ名前のフォルダに入っていることを要求するので、
# フォルダごと固める（中身だけを固めてはいけない）。
#
# ⚠ プロトコルのバージョンが基板とアプリの対応を決める。
#   ファイル名には出ないので、ここで表示して取り違えに気づけるようにする。

# overlay でビルドディレクトリ直下に置かれる。ここは scratch-desktop の中なので 1 つ上。
$sketchDir = "..\sketches\ScratchUiapduino"
if (-not (Test-Path $sketchDir)) {
    throw "スケッチが見つかりません: $sketchDir (overlay が効いていない可能性があります)"
}

$ino = Join-Path $sketchDir "ScratchUiapduino.ino"
if ((Get-Content $ino -Raw) -notmatch '#define\s+PROTOCOL_VERSION\s+(\d+)') {
    throw "PROTOCOL_VERSION を $ino から読めません"
}
$protocol = $Matches[1]

$version    = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
$sketchZip  = "dist\Scratch-UIAPduino-$version-sketch.zip"

Compress-Archive -Path $sketchDir -DestinationPath $sketchZip -Force
Write-Host ">>> $sketchZip (protocol $protocol)" -ForegroundColor Cyan

Get-ChildItem dist -File |
    Where-Object { $_.Extension -in '.exe', '.zip' } |
    Select-Object Name, @{n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } } |
    Format-Table

Pop-Location

Write-Host "=== Done. Built artifacts are in scratch-desktop\dist ===" -ForegroundColor Green
