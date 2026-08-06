# scratch3-uiapduino

Scratch 3.0 から **UIAPduino** を USB-HID (WebHID) で操作する拡張機能です。

構成は [scratch3-tello](https://github.com/tarosay/scratch3-tello) と同じ **オーバーレイ方式** です。
このリポジトリ単体では動きません。上流の scratch-vm / scratch-gui / scratch-desktop を
clone した上に、このリポジトリのファイルを被せてビルドします。

---

## 🚧 現在の状態

**Scratch から実機の LED を点灯するところまで確認済みです。**

| 項目 | 状態 |
|---|---|
| ブロック定義 | 汎用 Arduino 相当。**全ブロック実機確認済み** |
| WebHID 通信層 | **実機で確認済み**（接続・切断・再接続・入出力） |
| 接続フロー | ステータスボタンと接続モーダルに対応。**実機確認済み** |
| GUI の日本語 | 拡張カードと接続モーダルを `ja` / `ja-Hira` で表示。実機確認済み |
| コマンドプロトコル | uiap-hid-web と同じ `0x52` 方式に統一済み |
| デバイス側スケッチ | `sketches/ScratchUiapduino/` にあり・実機で全コマンド確認済み |
| バージョン照合 | 実機確認済み |
| ビルド | Windows で通過。インストーラ生成まで確認済み |
| アイコン | 差し替え済み（カード 600x372 / 小アイコン 80x80） |
| ビルドスクリプト | scratch3-tello の実績あるものを流用 |

**全ブロックを実機で確認済みです。** そのほか以下も確認しています。

- 「つなぐ」がユーザ操作なしで `true` を返す
- USB を抜くと「つながっている」が false になり、挿し直して「つなぐ」で復帰する
- デバイスが無い状態で「つなぐ」を繰り返しても落ちず `false` を返す
- 拡張機能一覧で UIAPduino を選ぶと接続モーダルが自動で開く
- モーダルは機器一覧を出さず、そのまま接続済み画面へ進む
- 「つながっている」はバージョン照合の完了後だけ true になる
- USB を抜くとステータスボタンが「!」に戻り、接続が切れた旨の警告が出る
- 接続に失敗しても Scratch Link / Bluetooth の案内は表示されない
- 接続バッジが Bluetooth ではなく USB マークになる
- 拡張カードと接続モーダルが日本語・ひらがな・英語で切り替わる
- `A0 の値`〜`A3 の値` はチェックを入れるとステージに 4 つ別々に並び、
  緑の旗を押していなくても値が更新される

---

## 📐 構成

このリポジトリのファイルは 2 種類に分かれます。**どちらなのかで扱いが変わります。**

### 🆕 新規ファイル（すべて tarosay のオリジナル）

上流には存在しないファイルです。オーバーレイ時に新規追加されます。

| ファイル | 内容 |
|---|---|
| `scratch-vm/src/extensions/scratch3_uiapduino/index.js` | ブロック定義。通信方式を一切知らない |
| `scratch-vm/src/extensions/scratch3_uiapduino/uiapduinoProcessor.js` | WebHID 通信 + コマンドキュー |
| `scratch-gui/src/lib/libraries/extensions/uiapduino/uiapduino.png` | 拡張機能ライブラリのカード画像 (600x372) |
| `scratch-gui/src/lib/libraries/extensions/uiapduino/uiapduino-small.png` | 小アイコン (80x80) |
| `scratch-gui/src/lib/libraries/extensions/uiapduino/uiapduino-illustration.png` | 接続モーダル用の画像 (266x165) |
| `scratch-gui/src/lib/libraries/extensions/uiapduino/usb-hid-white.svg` | 接続バッジの USB マーク (20x20) |
| `scratch-gui/src/lib/libraries/extensions/uiapduino/messages.js` | GUI 側の日本語訳（`ja` / `ja-Hira`） |
| `sketches/ScratchUiapduino/ScratchUiapduino.ino` | デバイス側スケッチ |
| `sketches/ScratchUiapduino/sketch.yaml` | ボードと Tools メニューの設定 |
| `build-scratch3-uiapduino.ps1` | ビルドスクリプト |
| `README.md` / `LICENSE` | このファイルとライセンス |

`index.js` と `uiapduinoProcessor.js` の分離は Tello 拡張と同じで、
ブロック層は通信方式を一切知りません。プロトコルを変える場合も
`uiapduinoProcessor.js` だけを直せば済みます。

`ScratchUiapduino.ino` はデバイス側で動くもので、**Scratch のビルドには含まれません。**
Arduino IDE から別途 UIAPduino に書き込みます。

### ✏️ 上流ファイルへのパッチ（Scratch Foundation / MIT のコードを改変）

**上流のファイルを丸ごと上書きします。** 上流が更新されたら追従が必要です。

| ファイル | 変更点 |
|---|---|
| `scratch-vm/src/extension-support/extension-manager.js` | `builtinExtensions` に `uiapduino` を 1 行追加 |
| `scratch-gui/src/lib/libraries/extensions/index.jsx` | 拡張機能ライブラリの配列に UIAPduino の項目を追加 |
| `scratch-gui/src/reducers/locales.js` | `scratch-l10n` のメッセージに UIAPduino の訳文を重ねる |
| `scratch-gui/src/containers/connection-modal.jsx` | 接続バッジの絵を下位コンポーネントへ渡す |
| `scratch-gui/src/components/connection-modal/connected-step.jsx` | 接続バッジを差し替え可能にする |
| `scratch-gui/src/components/connection-modal/connecting-step.jsx` | 同上 |
| `scratch-desktop/src/main/index.js` | WebHID の許可設定を追加（後述） |

上流のどのバージョンに対するパッチかは `build-scratch3-uiapduino.ps1` の
clone 時のタグで固定されています。

| 上流 | タグ |
|---|---|
| scratch-vm | `0.2.0-prerelease.20220222132735` |
| scratch-gui | `scratch-desktop-v3.29.0` |
| scratch-desktop | `v3.29.1` |

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
| UIAPduino → Scratch | Input Report (EP1 IN) | 8 バイト |

Input Report のエンドポイントは USB 設定によって変わります
（`WebHID Only` は EP1、`Keyboard+Mouse+WebHID` は EP3）。
ホスト側からは見えないので Scratch 側の実装には影響しません。

Feature Report は `arduino_core_ch32` v1.1.5 以降で 16 → 32 バイトに拡張されました。
実サイズは接続時に HID ディスクリプタから自動取得します。

### scratch-desktop 側のパッチが必須

Electron は既定で HID デバイスをレンダラに一切見せません。
`scratch-desktop/src/main/index.js` に以下を追加してあります。

- `setPermissionCheckHandler` … `'hid'` を許可。**実際に効いているのはこれ**
- `setDevicePermissionHandler` … VID/PID が一致するデバイスだけ許可
- `'select-hid-device'` … Electron はネイティブのデバイス選択ダイアログを出さないため、
  ここで自動選択しないと `requestDevice()` は必ず空で返る

Electron 15.3.1 にこれらの API が存在することは確認済みです。

### ⚠ ハンドラは 1 つの session に一度だけ登録すること

`createWindow` は **main / about / privacy の 3 つのウィンドウで呼ばれ、
いずれも既定 session を共有します。**

`setXxxHandler` 系は上書きなので何度呼んでも無害ですが、
`'select-hid-device'` は `on()` なのでリスナが積み上がります。
3 つ登録された状態でイベントが起きると `callback` が 3 回呼ばれ、

```
A JavaScript error occurred in the main process
TypeError: One-time callback was called more than once
```

で main プロセスが落ちます。`setupWebHid()` が `WeakSet` で二重登録を防いでいます。

**この不具合はデバイスが繋がっていないときにしか出ません。**
`connect()` は先に `getDevices()` を試すので、デバイスがあれば
`requestDevice()` に到達せず `'select-hid-device'` も発火しないためです。

デバイスが見つからないときは `callback()` を**引数なし**で呼びます。
Electron のドキュメントどおりで、これがリクエストのキャンセルになります
（`deviceId` の型は `String` なので `callback(null)` は仕様外）。

### ✅ ユーザ操作なしの接続について（検証済み）

`navigator.hid.requestDevice()` は Chromium 側で**ユーザ操作（実際のクリック）**を要求します。
Scratch のブロック実行は VM のループから呼ばれるためユーザ操作とはみなされないので、
「つなぐ」ブロックから `requestDevice()` を呼んでも失敗するのではないか、というのが
当初いちばん危惧していた点でした。

**実機で確認した結果、問題ありませんでした。**
`uiapduinoProcessor.connect()` は先に `getDevices()` を試します。
`setDevicePermissionHandler` が true を返していれば、Electron は
`requestDevice()` を一度も呼んでいないデバイスも `getDevices()` で返すため、
ユーザ操作なしに接続できます。「つなぐ」ブロックは `true` を返します。

したがって「つなぐ」ブロックだけでも接続できます。後から追加した接続モーダルは、
このブロックを置き換えるものではなく、接続経路を増やすものです（次項）。

なお uiap-hid-web は全ページ `requestDevice()` のみで `getDevices()` を使っていないため、
この経路はサイト側では一度も踏まれていません。この拡張が初めて通した経路です。

### 🔘 ステータスボタンと接続モーダル

Scratch 標準のハードウェア拡張と同じ接続フローに対応しています。
`showStatusButton` と `runtime.registerPeripheralExtension()` で
Scratch VM の Peripheral Extension API に繋いであります。

- 拡張機能一覧で UIAPduino を選ぶと、接続モーダルが自動的に開いて検索が始まります
- ブロックパレットのカテゴリ見出しに接続状態ボタンが出ます（未接続なら「!」）
- 「!」をクリックすると同じモーダルが開き、接続をやり直せます
- 接続済みのボタンからは状態の確認と切断ができます

**機器の一覧は出しません。** Bluetooth 機器と違い UIAPduino は 1 台だけを前提とし、
Electron 側が該当デバイスを自動選択するため、一覧に 1 台だけ出して
もう一度選ばせる操作を省いています。検索画面から直接接続済み画面へ進みます。

接続に失敗したときは「デバイスが見つかりません」になります。失敗の理由
（デバイスなし・open 失敗・PING 無応答・バージョン不一致など）は
開発者コンソールに出ます。Scratch GUI 3.29 の接続エラー画面は Scratch Link 用の
文言が固定で入っており、WebHID には誤案内になるため使っていません。

既存の「つなぐ」ブロックはそのまま残してあります。opcode も変えていないので
既存のプロジェクトはそのまま読めます。ブロックで接続した場合も
ステータスボタンは接続済みに変わります。

### 🌐 GUI 側の日本語について

日本語は **2 か所に分かれています。**

| 表示場所 | 訳文のありか |
|---|---|
| ブロックパレットの文字列 | `scratch-vm/.../scratch3_uiapduino/index.js` の `message` 定数 |
| 拡張機能一覧のカード・接続モーダル | `scratch-gui/src/lib/libraries/extensions/uiapduino/messages.js` |

後者がややこしいところです。`index.jsx` にあるのは `FormattedMessage` の `id` だけで、
`gui.*` の訳文は上流の **`scratch-l10n` パッケージ**から供給されます。
これは Transifex から生成される別リポジトリの成果物で、`npm install` のたびに
上書きされるため、`gui.extension.uiapduino.*` を直接書き足すことはできません。
実際、固定版の `editor-msgs.js` に日本語は 758 件ありますが、
UIAPduino の ID は 1 件もありません。

そこで訳文をこのリポジトリ側に持ち、`src/reducers/locales.js` で上流のメッセージに
重ねています。`ja` と `ja-Hira` を用意していて、それ以外のロケールでは
`index.jsx` の `defaultMessage`（英語）が出ます。
`defaultMessage` に日本語を書かないのは、未翻訳のロケール全部に日本語が出てしまうためです。

USB を抜いたときの警告文は上流に訳があるので、この対応なしで日本語になります。

### 🖼 接続モーダルの画像サイズ

**接続モーダルの画像は、あらかじめ小さく作っておく必要があります。**

上流の `connection-modal.css` は画像のサイズ指定をコメントアウトしているため、
画像は**原寸で表示されます**。置き場所の `.activityArea` は高さ 165px、
モーダルの幅は 480px しかありません。

一覧用の `uiapduino.png` (600x372) をそのまま渡すと枠を大きくはみ出し、
「接続しました」の文言やボタンの上に重なります。透過画像だと下の要素が
透けて見えるので気づきにくいのですが、はみ出し自体は透過の有無に関係なく起きています。

そのため接続モーダルには専用の `uiapduino-illustration.png` (266x165) を使っています。
**高さは `.activityArea` と同じ 165px ちょうど**にしてください。

内側の余白 (padding 0.5rem) を引いた 149px で作ると、上下に 8px ずつ背景色の帯が出ます。
165px にすると余白の分まで覆うので帯が消えます
（`.activityArea` は `overflow` を指定しておらず、flex の中央寄せで上下へ均等にはみ出すため）。

全幅 (480x165) にすると左右の帯も消えますが、元絵の縦を 44% 切り落とすことになり、
さらに接続バッジが `left: -15px` で絵の左外に出るため、
`.modal-content` の `overflow: hidden` で見切れます。左右の帯は残す方が無難です。

上流の画像も micro:bit が 116x95、EV3 が 92x128、WeDo 2.0 が 108x48 と、
いずれも枠に収まる大きさで用意されています。

### 🔵 接続バッジを Bluetooth から USB に変えている

接続中・接続済みの画面では、機器の絵の右上に小さなバッジが重なります。
上流の `connecting-step.jsx` と `connected-step.jsx` は
**Bluetooth マークを無条件で描画**しており、拡張機能ごとに切り替える仕組みがありません。
UIAPduino は WebHID なので、そのままだと嘘の表示になります。

そこで extension data に `connectionBadgeIconURL` を追加し、
指定があればそれを、無ければ従来どおり Bluetooth マークを出すようにしています。

**CSS で一律に消す方法は採っていません。** `display: none` で消せば 1 ファイルで済みますが、
micro:bit・EV3・WeDo 2.0・Go Direct のモーダルからもマークが消えます。
それらは Scratch Link を使う本物の Bluetooth 機器なので、表示を壊してはいけません。

バッジの絵は上流の `bluetooth-white.svg` に合わせて **20x20 の白 1 色**です。
`.bluetooth-connected-icon` は padding 5px の丸の中に置かれるため、この寸法から外れると収まりません。
文字入りの図案は 20px では読めないので使えません。

### USB を抜いたとき

**WebHID では物理的に切断されても `HIDDevice.opened` は自動的に false になりません。**
`navigator.hid` の `disconnect` イベントを購読しないと、
「つながっている」ブロックが true を返し続けます。
さらに再接続時 Chromium は**新しい `HIDDevice` オブジェクト**を作るため、
古いハンドルを握ったままだと挿し直しても送信が無視されます。

`uiapduinoProcessor` は `disconnect` を購読し、自分が使っているデバイスなら
接続状態を捨てて実行待ちのコマンドをすべて reject します。
そのうえで Scratch へ切断と接続喪失の両方を通知するので、
ステータスボタンが「!」に戻り、接続が切れた旨の警告も表示されます。

**挿し直したら「!」をクリックするか、「つなぐ」ブロックをもう一度実行してください。**
自動再接続はしません。

### ⚠ 権限ハンドラの注意点

Electron 15 では `'hid'` は `setPermissionRequestHandler` の許可種別に**含まれません**。
`setPermissionCheckHandler` 側の種別です。

さらに `setPermissionCheckHandler` を設定すると、**すべてのパーミッションチェックの
既定動作を奪います。** Electron はハンドラ未設定のとき `CheckPermissionWithDetails` で
`true` を返すため、`'hid'` 以外で `false` を返すとカメラ・マイクなど既存機能が壊れます。
`scratch-desktop/src/main/index.js` の `handlePermissionCheck` は
`'hid'` 以外で `true` を返して既定に合わせています。

---

## 📡 コマンドプロトコル

Tello の「コマンドを送る → 応答を待つ → 次を送る」と同じ契約です。

ワイヤフォーマットは **独自定義ではなく、[uiap-hid-web](https://github.com/tarosay/uiap-hid-web) の
`uiapruby.html` が実機に対して使っているものと同一**です。デバイス側ライブラリ
（`Hid.h`）が既に持っている契約なので、既存スケッチ資産と同じ経路で動きます。

### Scratch → UIAPduino（Feature Report / 32 バイト）

| バイト | 内容 |
|---|---|
| 0 | コマンド ID |
| 1.. | パラメータ |

### UIAPduino → Scratch（Input Report / 8 バイト）

先頭バイトがマーカーです。コマンド応答のほかに、コンソール出力とログが非同期に届きます。

| マーカー | 用途 |
|---|---|
| `0x52` | コマンド応答 |
| `0x50` | コンソール出力（`hid.Print` / `hid.Println`） |
| `0x44` | デバイスログ |

コマンド応答（`0x52`）の中身:

| バイト | 内容 |
|---|---|
| 0 | `0x52` |
| 1 | ステータス（`0`=OK / `1`=ERR / `2`=DATA / `3`=END） |
| 2 | ペイロード長（0–5） |
| 3–7 | ペイロード |

戻り値のないコマンドは `OK` だけを返します。戻り値のあるコマンドは
`DATA` を必要な回数繰り返してから `END` で終端します（`stream_bytes()` と同じ）。
数値はリトルエンディアンです。

### コマンド ID

`0x01` は `Hid.h` の接続通知で予約済み、`0x01`–`0x11` は uiapruby の SD ファイル操作と
RUN/STOP が使用中のため、Scratch 拡張は衝突しない `0x20` 以降を使います。
これにより、将来 1 つのスケッチに UIAPruby VM と Scratch 対応を同居させられます。

| ID | 名前 | パラメータ | 応答 |
|---|---|---|---|
| `0x01` | （接続通知・予約） | なし | なし |
| `0x20` | PING | なし | DATA(1) → END（プロトコルのバージョン） |
| `0x21` | PIN_MODE | pin, mode | OK |
| `0x22` | DIGITAL_WRITE | pin, value | OK |
| `0x23` | DIGITAL_READ | pin | DATA(1) → END |
| `0x24` | ANALOG_WRITE | pin, value | OK |
| `0x25` | ANALOG_READ | pin | DATA(2) → END |

接続時には `uiapduinoProcessor.connect()` が接続通知（`0x01`）を送ります。
デバイス側が `WaitAvailable()` で待っている場合、これが無いと起動しません。

### バージョン照合

**スケッチは基板に焼かれたまま残るので、Scratch だけ更新される状況が起こります。**
噛み合わないコマンドを送ると「ブロックが無言で何もしない」という
一番わかりにくい壊れ方をするため、接続時に照合します。

```
接続 → 接続通知(0x01) → PING(0x20) → バージョン照合 → 成否
```

デバイスは PING に `DATA(1) = PROTOCOL_VERSION` → `END` を返します。
一致しなければ**接続を拒否**し、「つなぐ」ブロックは `false` を返します。

| 状況 | 判別 | 開発者コンソールの表示 |
|---|---|---|
| スケッチ未書き込み / 別のスケッチ | PING が無応答 | デバイスが応答しません |
| 旧世代スケッチ | PING に `RSP_OK` だけ（値 0） | スケッチが古すぎます |
| バージョン不一致 | 値が違う | デバイス=N / この拡張機能=M |

旧世代の判別は自然にできます。以前 PING は `RSP_OK` を返していたので、
**値なし = 0 が「バージョンを持たない世代」を意味する**ためです。

バージョンは以下の 2 箇所にあり、**必ず同じ値**でなければなりません。
互換性の無い変更（コマンド ID・応答形式・パラメータの意味の変更）をしたら両方を上げます。

- `scratch-vm/src/extensions/scratch3_uiapduino/uiapduinoProcessor.js` の `PROTOCOL_VERSION`
- `sketches/ScratchUiapduino/ScratchUiapduino.ino` の `PROTOCOL_VERSION`

この照合には副次的な効果もあります。以前は**デバイスを開けただけで `connect()` が `true`**
を返していたため、スケッチが書かれていない基板でも「つながっている」状態になり、
その後すべてのブロックが無言で失敗していました。今はその場で `false` になります。

ブロックは Promise を返すため、Scratch はデバイスの実行完了を待ってから
次のブロックに進みます（ロックステップ動作）。

### ⚠ シーケンス番号がないことによる制約

このワイヤフォーマットには送受を対応付ける番号がありません。
タイムアウト後に遅れて届いた応答は、次のコマンドの応答と区別できません。

`uiapduinoProcessor` は「待ち手がいない応答は捨てる」ことしかできないため、
タイムアウトが起きた時点で警告を出し、`desyncSuspected` を立てます。
この状態になったら「実行待ちのコマンドをクリアする」ブロックか再接続で復帰してください。

---

## 🔧 デバイス側スケッチ

`sketches/ScratchUiapduino/ScratchUiapduino.ino`

```
sketches/ScratchUiapduino/
  ScratchUiapduino.ino   … 本体
  sketch.yaml            … ボードと Tools メニューの設定
```

### 書き込み設定

**`sketch.yaml` に固定してあるので、手で設定し直す必要はありません。**
Arduino IDE 2.x はスケッチを開いたときにこのプロファイルを読みます。

参考までに、`sketch.yaml` の `fqbn` は以下と対応します。

| Tools | 値 | fqbn |
|---|---|---|
| Board | HID ProMicro CH32V003 | `UIAP_HID:ch32v:CH32V003` |
| Board Version | V1.4 | `pnum=V14` |
| USB | **WebHID Only** | `usb=webhid` |
| PWM | **TIM2 Default (pin 2 / PC0)** | `pwm=default` |
| Optimize | Smallest (-Os) with LTO | `opt=oslto` |

PWM の設定を間違えると `PWMMIN_REQUIRE_DEFAULT()` がコンパイル時に止めます。

プラットフォームは `UIAP_HID:ch32v (1.2.8)` に固定してあります。
再現性のためですが、**新しい版が出ても 1.2.8 が使われ続ける**点に注意してください。
上げる場合は `sketch.yaml` の `platforms` を書き換えます。

arduino-cli なら引数なしでビルドできます。

```
arduino-cli compile sketches/ScratchUiapduino
```

`Keyboard+Mouse+WebHID` でも動きますが、この拡張はキーボード／マウスを使いません。
`WebHID Only` ならインタフェースが 1 つだけになるため、
Scratch 側の `getDevices()` が同じ VID/PID のキーボードコレクションを拾う余地がなくなります。

ホストから見える形は両設定で同一です（エンドポイント番号だけが EP3 → EP1 に変わりますが、
これはホスト側からは見えません）。したがって Scratch 側は無変更で動きます。

| | Keyboard+Mouse+WebHID | WebHID Only |
|---|---|---|
| VID / PID | `0x1209` / `0xD004` | 同じ |
| Usage Page / Usage | `0xFF00` / `0x01` | 同じ |
| Input Report | 8 バイト | 同じ |
| Feature Report | 32 バイト | 同じ |
| エンドポイント | EP3 IN | EP1 IN |
| インタフェース数 | 3 | 1 |
| Flash | 7404 / 16384 (45%) | **7108 / 16384 (43%)** |
| RAM | 528 / 2048 (25%) | **448 / 2048 (21%)** |

### ⚠ 使ってはいけないピン

CH32V003 では以下が潰せないピンです。スケッチ側で弾いて `RSP_ERR` を返します。

| ピン | 用途 |
|---|---|
| D13 (= A4) | USB D+ |
| D14 (= A7) | USB D− |
| D17 | RESET |

**D13 / D14 に触ると USB が落ちて Scratch との接続が切れます。**
オンボード LED は **D2** です。

`analogRead` は Arduino 標準どおり**アナログ番号 (A0–A7)** 解釈で、デジタルピン番号ではありません。

| A 番号 | 実ピン |
|---|---|
| A0 | PA2 (D1) |
| A1 | PA1 (D0) |
| A2 | PC4 (D6) |
| A3 | PD2 (D12) |
| A5 | PD5 (D15) |
| A6 | PD6 (D16) |

### 📺 アナログ値のステージ表示

`A0 の値`〜`A3 の値` は、パレットのチェックボックスでステージに値を出すための
**引数を持たないレポーターブロック**です。中身は `ピン [PIN] の値` と同じ `CMD_ANALOG_READ` で、
チャンネル番号を固定しているだけです。

**なぜ `ピン [PIN] の値` にチェックボックスが出ないのか。**
scratch-vm は「入力を 1 つも持たないレポーター」にだけ
チェックボックス (`checkboxInFlyout`) を付けます (`scratch-vm/src/engine/runtime.js`)。
`ピン [PIN] の値` は数値入力を持つため対象外です。

ドロップダウン (`acceptReporters: false`) にすればチェックボックス自体は出せますが、
モニターのラベルは `getLabelForOpcode()` がブロックのテキストをそのまま使うため
`UIAPduino: ピン [PIN] の値` のままになり、A0 と A1 の区別が付きません。
そのため scratch3-tello のピッチ／ロール／ヨーと同じく、チャンネルごとにブロックを分けています。

チェックが入っている間は、**緑の旗を押していなくても** Scratch が毎フレーム値を読みにきます。
ただし前回の応答を待っている間はスレッドが再投入されず (`runtime.addMonitorScript()`)、
`uiapduinoProcessor` 側もコマンドを直列化するため、実際は「応答が返ったら次を送る」ペースになります。

A4 / A7 は USB ピンなのでブロックを用意していません。A5 / A6 は `ピン [PIN] の値` で読めます。

### ⚠ PWM は `analogWrite()` を使いません

**CH32V003 で `analogWrite()` を使ってはいけません。**
[arduino_core_ch32 の README](https://github.com/tarosay/arduino_core_ch32) に明記されています。

`analogWrite()` は `HardwareTimer` を丸ごと引き込むため 16KB Flash には重すぎる上に、
Scratch のブロックが普通にやってしまう操作で壊れます。

| 症状 | Scratch でいつ起きるか |
|---|---|
| TIM1 と TIM2 の両方に `analogWrite()` すると**無言でフリーズ** | 別々のピンに PWM を出しただけ |
| `analogWrite()` → `pinMode()` → `analogWrite()` の往復で**RAM が減り続ける** | ループの中で PWM とピン設定を往復しただけ |

このスケッチは `PWMmin` の `Pwm_write()` を使います。動的確保をしないのでどちらも起きません。

PWM を出せるピンは **Tools → PWM の設定で変わります**。`TIM2 Default` の場合:

| タイマー | ピン |
|---|---|
| TIM1 | D0 / D5 / D6 / D12 |
| TIM2 | **D2**（オンボード LED） |

`Remap3` にすると TIM2 が D3 / D9 / D15 / D16 に変わります。
PWM 非対応ピンに `analogWrite` ブロックを使った場合、
黙ってデジタル出力にフォールバックせず `RSP_ERR` を返します。

「ピンを入力／出力にする」ブロック（`PIN_MODE`）は先に `Pwm_stop()` を呼ぶので、
PWM 中のピンを普通の GPIO に戻せます。

### 実機確認の記録

`hid-console.html` から生バイトを送って確認したものです。

| 送信 | 結果 |
|---|---|
| `20` | `52 00 00` — PING（**バージョン照合を入れる前の版**での記録） |
| `21 02 01` | `52 00 00` — D2 を出力に。LED 消灯（出力ラッチが 0 のため。Arduino 標準の挙動） |
| `22 02 01` / `22 02 00` | `52 00 00` — 全点灯 / 消灯 |
| `23 02` | `52 02 01 ...` → `52 03 00 ...` を **100 回連続で取りこぼしなし** |
| `24 02 80` | `52 00 00` — LED が半分の明るさに |
| `24 09 80` | `52 01 00` — PWM 非対応ピンを正しく拒否 |
| `25 00`（3.3V） | `0x3FF` = 1023 |
| `25 00`（GND） | 1〜2（ADC ノイズフロア） |

`0x3FF` が返ることで、`DATA(2)` のリトルエンディアン 16bit が
上位バイトまで届いていることが確認できます（下位だけなら 255 で頭打ちになる）。

`24 02 80` の直後に `21 02 01` → `22 02 01` で全点灯に変わることから、
`PIN_MODE` の `Pwm_stop()` が PWM 中のピンを GPIO に戻せていることも確認済みです。

**バージョン照合は実機未検証です。** この記録を取った時点の `0x20` は `RSP_OK` を返す版でした。
現在の版は `52 02 01 01` → `52 03 00` を返すはずです。

### レポート消失対策

`uiapwebhid_send` 内蔵の待ちだけでは、ホストのポーリングのばらつきで
前のレポートが上書きされて消えることがあります（uiapruby の `consoleWriteChunk()` に同じ記述あり）。
`DATA` → `END` の 2 レポートでこれが起きると `DATA` が消えて `END` だけが届き、
**Scratch 側はセンサー値 0 を正常値として受け取ってしまいます。**

- スケッチ側: 送信前に `WebHID.busy()` が下りるまで待つ
- Scratch 側: `DATA` を伴わない `END` はエラーとして reject する

の両方で塞いであります。

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
scratch-desktop/dist/
  Scratch-UIAPduino-3.29.1-Setup.exe        … インストーラ (約 163 MB)
  win-ia32-unpacked/                        … インストール不要版 (約 341 MB)
    Scratch UIAPduino.exe
    resources/  locales/  *.dll  ...
```

ディレクトリ名は `win-unpacked` ではなく **`win-ia32-unpacked`** です。
ビルドスクリプトが `nsis:ia32` を指定しているため、
electron-builder がアーキテクチャ名付きのディレクトリを作ります。

**インストール不要版は `.exe` 単体では動きません。**
`Scratch UIAPduino.exe` は Electron の実行ファイルで、
アプリ本体は `resources/app.asar` にあります。
Chromium の DLL や言語ファイルも必要なので、フォルダごと扱ってください。

### 公式 Scratch Desktop との共存

上流の `electron-builder.yaml` は `appId` も `productName` も公式と同じです。
そのままビルドすると、公式 Scratch Desktop を入れている人が
インストールしたときに**同じアプリとみなされて上書きされます。**

ビルドスクリプトが clone 後に以下を差し替えて、共存できるようにしています。

| | 上流 | このビルド |
|---|---|---|
| `appId` | `edu.mit.scratch.scratch-desktop` | `jp.uiap.scratch-uiapduino` |
| `productName` | `Scratch 3` | `Scratch UIAPduino` |
| `nsis.artifactName` | `Scratch ${version} Setup.${ext}` | `Scratch-UIAPduino-${version}-Setup.${ext}` |

`artifactName` は `productName` を参照せず `Scratch` が直書きされているため、
ここも変えないとインストーラのファイル名が変わりません。

さらに `scratch-desktop/src/main/index.js` で `app.setName()` を呼び、
ユーザデータの保存先を `%APPDATA%\Scratch UIAPduino` に分けています。
これが無いと公式と同じ `%APPDATA%\Scratch` を共有します。

`version` は上流の `3.29.1` のままです。土台にした scratch-desktop の版を表します。

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
- **コア数の多い機械での Terser クラッシュ**（ビルドスクリプトが対処済み）:
  素の状態では 92% の Terser で
  `spawn UNKNOWN` / `node_platform.cc:61: Assertion (0) == (uv_thread_create(...)) failed`
  となってビルドが落ちます。原因は electron-webpack の `out/targets/BaseTarget.js` で

  ```js
  if (configurator.env.minify !== false) { optimization.minimizer = [...]; }
  optimization.minimize = true;   // ← 条件の外
  ```

  となっているため、`compile` が渡している `--env.minify=false` が効かず、
  webpack 4 の既定 minimizer（TerserPlugin, `parallel: true`）が動くことです。
  `parallel: true` は `os.cpus().length - 1` 個のワーカープロセスを起こすので、
  64 コアなら 63 プロセスとなりスレッド生成に失敗します。

  `build-scratch3-uiapduino.ps1` が clone 後に
  `scratch-desktop/webpack.makeConfig.js` へ以下を挿入して回避します。
  `cache` / `sourceMap` は webpack 4 の既定と同じ値なので、**成果物は変わりません。**

  ```js
  config.optimization = Object.assign({}, config.optimization, {
      minimizer: [new (require('terser-webpack-plugin'))({
          cache: true, parallel: 4, sourceMap: true
      })]
  });
  ```

  パッチは冪等で、挿入位置が見つからない場合はビルドを中断します
  （上流が変わったことに気づかず素通りしないため）。

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

このリポジトリには**著作権者の異なるものが混在**しています。

### tarosay の成果物

ルートの [`LICENSE`](LICENSE)（BSD-3-Clause / Copyright (c) 2026, tarosay）が適用されます。
対象は「🆕 新規ファイル」の表に挙げたものです。

- `scratch-vm/src/extensions/scratch3_uiapduino/` 以下
- `scratch-gui/src/lib/libraries/extensions/uiapduino/` 以下
- `sketches/` 以下
- `build-scratch3-uiapduino.ps1`
- `README.md`

### 上流 Scratch のコード

「✏️ 上流ファイルへのパッチ」の 3 ファイルは、Scratch のコードを改変したものです。
著作権は元の権利者に帰属し、それぞれの上流リポジトリのライセンスに従います。

| 上流 | 著作権表示 |
|---|---|
| scratch-vm | Copyright (c) 2016, Massachusetts Institute of Technology |
| scratch-gui | Copyright (c) 2016, Massachusetts Institute of Technology |
| scratch-desktop | Copyright (c) 2019, Scratch Foundation |

いずれも BSD-3-Clause です。**このリポジトリは上流の `LICENSE` ファイルを含みません。**
オーバーレイ後も clone した各リポジトリの `LICENSE` がそのまま残り、
上記の著作権表示が保持されます。

### プロトコル仕様

ワイヤフォーマットは [tarosay/uiap-hid-web](https://github.com/tarosay/uiap-hid-web) の
`uiapruby.html` および `arduino_core_ch32` の `Hid` ライブラリが持つ既存の契約に合わせたものです。

### ビルド成果物

ビルドして得られる Scratch アプリには上流 Scratch のコードが大量に含まれます。
**配布する場合は上流各プロジェクトのライセンス条項に従ってください。**
