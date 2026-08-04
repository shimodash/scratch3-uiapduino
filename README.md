# scratch3-uiapduino

Scratch 3.0 から **UIAPduino** を USB-HID (WebHID) で操作する拡張機能です。

構成は [scratch3-tello](https://github.com/tarosay/scratch3-tello) と同じ **オーバーレイ方式** です。
このリポジトリ単体では動きません。上流の scratch-vm / scratch-gui / scratch-desktop を
clone した上に、このリポジトリのファイルを被せてビルドします。

---

## 🚧 現在の状態

**骨組みのみ。実機での動作は未検証です。**

| 項目 | 状態 |
|---|---|
| ブロック定義 | 仮のブロックセット（汎用 Arduino 相当） |
| WebHID 通信層 | 実装済み・**未検証** |
| コマンドプロトコル | **仮。UIAPduino 側の小型 VM と要すり合わせ** |
| アイコン | プレースホルダ（青地に "U"） |
| ビルドスクリプト | scratch3-tello の実績あるものを流用 |

---

## 📐 構成

```
scratch-vm/src/
  extension-support/extension-manager.js      … uiapduino を builtinExtensions に登録
  extensions/scratch3_uiapduino/
    index.js                                   … ブロック定義（通信を知らない）
    uiapduinoProcessor.js                      … WebHID 通信 + コマンドキュー

scratch-gui/src/lib/libraries/extensions/
  index.jsx                                    … 拡張機能ライブラリに UIAPduino を追加
  uiapduino/{uiapduino.png, uiapduino-small.png}

scratch-desktop/src/
  main/index.js                                … WebHID の許可設定（後述）
```

`index.js` と `uiapduinoProcessor.js` の分離は Tello 拡張と同じで、
ブロック層は通信方式を一切知りません。プロトコルを変える場合も
`uiapduinoProcessor.js` だけを直せば済みます。

---

## 🔌 WebHID について

### デバイス

| 項目 | 値 |
|---|---|
| vendorId | `0x1209` |
| productId | `0xD004` |
| usagePage | `0xFF00`（ベンダー定義） |
| usage | `0x01` |

Usage Page がベンダー定義であることが重要です。キーボード／マウスの Usage Page を
使うと、Windows がアプリからのアクセスをブロックします。

### レポート

| 方向 | 種別 | サイズ |
|---|---|---|
| Scratch → UIAPduino | Feature Report (EP0) | 32 バイト |
| UIAPduino → Scratch | Input Report (EP3 IN) | 8 バイト |

Feature Report は `arduino_core_ch32` v1.1.5 以降で 16 → 32 バイトに拡張されました。
実サイズは接続時に HID ディスクリプタから自動取得します。

### scratch-desktop 側のパッチが必須

Electron は既定で HID デバイスをレンダラに一切見せません。
`scratch-desktop/src/main/index.js` に以下を追加してあります。

- `setPermissionRequestHandler` … `'hid'` を許可（上流は `'media'` 以外すべて拒否）
- `setDevicePermissionHandler` … VID/PID が一致するデバイスだけ許可
- `'select-hid-device'` … Electron はネイティブのデバイス選択ダイアログを出さないため、
  ここで自動選択しないと `requestDevice()` は必ず空で返る

Electron 15.3.1 にこれらの API が存在することは確認済みです。

### ⚠ 最初に検証すべき点

`navigator.hid.requestDevice()` は Chromium 側で**ユーザ操作（実際のクリック）**を要求します。
Scratch のブロック実行は VM のループから呼ばれるためユーザ操作とはみなされず、
「つなぐ」ブロックから `requestDevice()` を呼ぶと失敗する可能性があります。

`uiapduinoProcessor.connect()` は先に `getDevices()` を試すので、
`setDevicePermissionHandler` が効いていればユーザ操作なしで取得できる想定です。
**この挙動を最初に実機で確認してください。** 駄目な場合は、
Scratch のペリフェラル接続モーダル（実際のクリックが発生する）から接続する方式に変更します。

---

## 📡 コマンドプロトコル（仮）

Tello の「コマンドを送る → `ok` を待つ → 次を送る」と同じ契約です。
UIAPduino 側の小型 VM は、届いたコマンドを実行して ACK を返すだけで済みます。

### Scratch → UIAPduino（Feature Report / 32 バイト）

| バイト | 内容 |
|---|---|
| 0 | コマンド ID |
| 1 | シーケンス番号（1..255） |
| 2.. | パラメータ |

### UIAPduino → Scratch（Input Report / 8 バイト）

| バイト | 内容 |
|---|---|
| 0 | 応答種別（`0x80` = ACK） |
| 1 | シーケンス番号（受け取ったコマンドのエコー） |
| 2 | ステータス（0 = 正常、それ以外 = エラー） |
| 3–4 | 戻り値（リトルエンディアン 16bit） |
| 5–7 | 予約 |

### コマンド ID（仮）

| ID | 名前 | パラメータ | 戻り値 |
|---|---|---|---|
| `0x01` | PING | なし | なし |
| `0x10` | PIN_MODE | pin, mode | なし |
| `0x11` | DIGITAL_WRITE | pin, value | なし |
| `0x12` | DIGITAL_READ | pin | 0 / 1 |
| `0x13` | ANALOG_WRITE | pin, value | なし |
| `0x14` | ANALOG_READ | pin | 読み取り値 |

シーケンス番号で ACK を対応付けているので、タイムアウト後に遅れて届いた応答を
取り違えません。ブロックは Promise を返すため、Scratch はデバイスの実行完了を
待ってから次のブロックに進みます（ロックステップ動作）。

---

## 🚀 ビルド方法（Windows / PowerShell）

```powershell
mkdir scratch3-uiapduino-build
cd scratch3-uiapduino-build

curl -o build-scratch3-uiapduino.ps1 https://raw.githubusercontent.com/tarosay/scratch3-uiapduino/master/build-scratch3-uiapduino.ps1
./build-scratch3-uiapduino.ps1
```

**空のディレクトリで実行してください。** このリポジトリの中では実行できません
（`scratch-vm` などが既に存在するため停止します）。

成果物:

```
scratch-desktop/dist/Scratch 3.29.1 Setup.exe    … インストーラ
scratch-desktop/dist/win-unpacked/Scratch 3.exe  … インストール不要
```

### 動作確認済み環境

```
Node.js : v16.20.0
npm     : 8.19.4
Electron: 15.3.1
```

npm v7 以降は peerDependencies が厳格なため `react-responsive@5.x` が
インストールエラーになります。`react-responsive@4.1.0` を強制指定して解決しています。

### 既知のハマりどころ

- **シンボリックリンク**: 開発者モード OFF・非管理者では `New-Item -ItemType SymbolicLink`
  が失敗します。ビルドスクリプトはジャンクションを使うので管理者権限は不要です。
- **AppX ビルド**: `npm run build` は AppX（Microsoft Store 用）を先にビルドしますが、
  Windows SDK の `makeappx.exe` が無いと失敗し、NSIS インストーラまで到達しません。
  ビルドスクリプトは `electron-builder` を直接呼んで NSIS だけを作ります。
- **PowerShell の文字コード**: 日本語コメントを含む `.ps1` は **UTF-8 BOM 付き**で
  保存してください。BOM が無いと PowerShell 5.1 が cp932 として読み、構文エラーになります。

---

## 🔗 関連

- [tarosay/scratch3-tello](https://github.com/tarosay/scratch3-tello) — 同じ構成の Tello 拡張
- [tarosay/uiap-hid-web](https://github.com/tarosay/uiap-hid-web) — UIAPduino の WebHID 実験サイト

### Tello 拡張との共存について

両者とも `extension-manager.js` と `scratch-gui` の `index.jsx` の同じ箇所を
上書きします。1 つのアプリに Tello と UIAPduino の両方を載せる場合は、
オーバーレイを単純にコピーするのではなくマージが必要です。

---

## License

オリジナルの Scratch 各プロジェクトのライセンスに従います。`LICENSE` を参照してください。
