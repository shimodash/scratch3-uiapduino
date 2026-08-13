# スケッチ書き込みブロック 実装仕様

Scratch のブロックから UIAPduino にスケッチ（`.bin`）を書き込めるようにする。
Arduino IDE を持っていなくても、Xcratch を開くだけで基板が使えるようにするのが目的。

**これは実装前の仕様。打ち合わせで決まったところまでを書いてある（2026-08-14）。**

---

## 0. 決まったこと

| | |
|---|---|
| ブロックの形 | **BOOLEAN 1 個**（「つなぐ」ブロックと同じ形。成功したら `true`） |
| 進み具合 | **レポーターブロック**「書き込みの ようす」で見せる |
| `.bin` の持ち方 | **拡張機能に同梱**（base64 で `.mjs` に焼き込む） |
| 対象 | Xcratch 版とデスクトップ版の**両方**（下記）。スケッチの seamless switch は今回やらない |

### 対象について（打ち合わせで詰めた）

当初は「Xcratch 版のみ」としたが、**分ける意味が無かったので両方に入れる。**

拡張本体は `scratch-vm/src/extensions/scratch3_uiapduino/index.js` の 1 ファイルで、
Xcratch 版はそれを `sync-block.mjs` が複製してビルドしている。
**ブロックはもともと同じものが両方に出る。**

違うのは Electron 側の WebHID 許可が `D004` 決め打ちで、ブートローダの `B803` が
レンダラに見えないことだけ。「Xcratch 版のみ」にすると、
**デスクトップ版には押しても書けないブロックが並ぶ**ことになる。

デスクトップ版のビルドに 10 分かかるのは事実だが、それはビルドを回す時機の話であって、
コードを分ける理由ではない。**変更は両方に入れ、デスクトップ版のビルドは
次にリリースを作るときに乗せる。**

### これが効く理由は、版ズレの根治

今は `PROTOCOL_VERSION` を上げるたびに「基板を書き込み直してください」を出している。
利用者は Arduino IDE を入れ、ボードマネージャを入れ、書き込みモードに入れて焼く。
ここで脱落する人がいる。

**`.bin` を拡張機能に同梱すると、拡張機能とスケッチの版は必ず一致する。**
拡張機能が新しくなれば、同梱されている `.bin` も必ずその版のものになる。
「合わないので焼いてください」の案内は残るが、その場でブロックを押せば直る。

---

## 1. 前提：分かっている制約

### ⚠ パレットのボタンは使えない

`BlockType.BUTTON` は scratch-vm にあるが、`runtime.js` の
`_convertButtonForScratchBlocks()` が受け付けるのは `MAKE_A_VARIABLE` /
`MAKE_A_LIST` / `MAKE_A_PROCEDURE` の 3 つだけで、それ以外は
`Custom button callbacks not supported yet` を出す。GUI 側
（`scratch-gui/src/containers/blocks.jsx`）もその 3 つしか
`registerButtonCallback()` していない。

デスクトップ版は GUI を差し替えられるが、**Xcratch 版は xcratch.org の GUI に乗る**ので
手が出せない。だから普通のブロックにする。

### ブートローダは別のデバイス

| | VID:PID | いつ見えるか |
|---|---|---|
| 通常のスケッチ | `1209:D004` | 電源投入後、スケッチが走っているとき |
| ブートローダ | `1209:B803` | 書き込みモードのとき |

**書き込み中は `D004` は存在しない。** だからこのブロックは「つながっていること」を
前提にしてはいけない。未接続でも押せる必要がある。

### 書き込みモードには手で入る

今のスケッチに seamless switch は入っていないので、**基板のボタンを押しながら
USB を挿す**手順は残る（README「書き込み方法」の 2 と同じ）。
ここを消すのはスケッチ側の仕事で、Flash は現在 12,040 / 16,384 バイト（73%）。
今回はやらない。

### ユーザ操作（transient activation）

`navigator.hid.requestDevice()` はクリック直後の一過性の活性化を要求する。
Chrome ではクリックから約 5 秒間ウィンドウに残る状態なので、
**パレットのブロックを直接クリックする経路なら通る見込み。**
緑の旗から走った場合は活性化が無く `SecurityError` になる
（= クリックからしか書けない。事故防止として都合がよい）。

`uiapduinoProcessor.js` の `_connect()` に同じ懸念が
「実機で最初に検証すべき箇所」として書いてあり、まだ踏まれていない。
**このブロックが、その検証を兼ねる。**

### デスクトップ版は `B803` の許可を足す

`scratch-desktop/src/main/index.js` の `isUiapduino` が `D004` 決め打ちで、
`setDevicePermissionHandler`（169 行）と `select-hid-device`（177 行）の両方が
そこで弾く。**これを足さないと、ブロックは出るのに書けない。**

```js
const UIAPDUINO_PRODUCT_ID = 0xD004;
const UIAPDUINO_BOOTLOADER_PRODUCT_ID = 0xB803;   // ← 足す

const isUiapduino = device => (
    device.vendorId === UIAPDUINO_VENDOR_ID && (
        device.productId === UIAPDUINO_PRODUCT_ID ||
        device.productId === UIAPDUINO_BOOTLOADER_PRODUCT_ID
    )
);
```

`isUiapduino` はこの 2 か所でしか使われていない。**抜線時の後始末には関与していない**ので、
広げても副作用は無い。

`select-hid-device` は最初に見つかったものを自動選択するが、`details.deviceList` は
`requestDevice()` のフィルタで絞られた後のものなので、`B803` を要求したときに
`D004` を掴むことはない。**ここは実機で確かめる**（7 章）。

デスクトップ版は `getDevices()` で拾えるため、**ユーザ操作の壁が無い。**
ブラウザ版で `requestDevice()` が通らなかった場合でも、デスクトップ版は動く見込み。

---

## 2. ブロック

パレットの末尾、`clearQueue` の後ろに `'---'` を挟んで 2 個置く。
普段使うものではないので、先頭には置かない。

| opcode | 種別 | ja | ja-Hira | en |
|---|---|---|---|---|
| `flashSketch` | BOOLEAN | スケッチを書き込む | スケッチを かきこむ | flash the sketch |
| `flashStatus` | REPORTER | 書き込みの ようす | かきこみの ようす | flashing status |

引数は無い。メニューも増やさない（スケッチ不一致時は `info.menus` を空にするため、
引数付きにするとその場面で出せなくなる）。

### スケッチが噛み合わないときは、説明の中にも出す

`getInfo()` は `_sketchProblem` があるとパレットを説明 4 行に差し替える。
**そこに `flashSketch` と `flashStatus` を足す。** 詰まったその場で直せるようにする。

差し替え後の並び:

```
⚠ 基板のスケッチが合わないので つながりません
新しいスケッチの(ScratchUiapduino.ino)を書き込んでください。
新しいプロトコルバージョン: 8
https://github.com/tarosay/scratch3-uiapduino/releases/latest
───
[スケッチを書き込む]      ← 押せる
[書き込みの ようす]
```

URL の行は残す。ブロックで書けなかった人の逃げ道が要る。

### `flashStatus` が返す文字列

| 状態 | ja | ja-Hira | en |
|---|---|---|---|
| 未実行 | まだ書き込んでいません | まだ かきこんで いません | not started |
| step 0,2,3 | 準備中 | じゅんびちゅう | preparing |
| step 1 | 基板をさがしています | きばんを さがして います | looking for the board |
| step 4 | 書き込み中 45% | かきこみちゅう 45% | writing 45% |
| step 5 | たしかめ中 45% | たしかめちゅう 45% | verifying 45% |
| step 6 | 再起動中 | さいきどうちゅう | restarting |
| step 7 | 書き込めました | かきこめました | done |
| 書き込みモードでない | 基板が書き込みモードになっていません | きばんが かきこみモードに なって いません | the board is not in flashing mode |
| 活性化が無い | ブロックをクリックしてください | ブロックを クリックして ください | click the block to flash |
| 失敗 | 書き込めませんでした | かきこめませんでした | flashing failed |
| 実行中に再度押された | 書き込み中です | かきこみちゅう です | already flashing |

割合は `Math.floor(offset / size * 100)`。

> **step 4 と 5 の出方に癖がある。** webflasher は
> `status_callback({step: difference_found ? 4 : 5, ...})` を送るので、
> 差分が見つかるまでは 5（たしかめ中）になる。まっさらな基板では最初の 1 セクタだけ
> 「たしかめ中 0%」が出て、その後ずっと「書き込み中」になる。2 周目は全部
> 「たしかめ中」で終わる。**これは正常。**

---

## 3. 書き込みの流れ

`flashSketch()` は `Promise<boolean>` を返す。クリックしたブロックだけが待ち、
他のスクリプトは止まらない。

1. **多重実行を弾く。** `_flashing` が立っていたら「書き込み中です」で `false`
2. **同梱 `.bin` を用意する。** base64 → `Uint8Array`。初回だけ復号して覚える
3. **版を照合する。** 生成物に書いてある `PROTOCOL_VERSION` が
   `uiapduinoProcessor.js` の定数と違えば、**焼かずに** `false`。
   `.bin` の作り直しを忘れたまま配るのを防ぐ
4. **繋がっていれば切る。** 実際には書き込みモードに入った時点で切れているが、念のため
5. **`B803` を取る。** `getDevices()` に居ればそれを使い、無ければ `requestDevice()`
   - `SecurityError` → 「ブロックをクリックしてください」で `false`
   - 空 → 「基板が書き込みモードになっていません」で `false`
6. **`rv003usb_webflasher(bin, cb, device)` を呼ぶ。** `cb` で `flashStatus` を更新
7. **成功したら繋ぎ直す**（次節）。`true` を返す
8. **失敗したら**「書き込めませんでした」で `false`。理由は console に出す

### 書き込みの後、繋ぎ直す

`run_app` で基板は再起動し、`D004` として列挙し直される。
**`getDevices()` に `D004` が現れたときだけ `processor.connect()` を呼ぶ。**
500ms 間隔で最大 20 回（10 秒）見て、現れなければ何もしない。

`requestDevice()` は呼ばない。ここで呼ぶと活性化が切れていて失敗するうえ、
運が良くてもダイアログが 2 回出る。繋がらなければステータスボタンから繋いでもらう。

繋ぎ直しに成功すると `_setSketchProblem(null)` が走り、パレットが元のブロックに戻る。
**「押す → 焼ける → ブロックが戻る」が一続きになる。**

### 緑の旗から走った場合

**ブラウザ版**は、初回は活性化が無いので `SecurityError` で止まる。
一度 `B803` を許可した後は `getDevices()` で拾えるため、書き込みモードのまま
放置した基板が挿さっていれば緑の旗でも始まる。

**デスクトップ版**は `setDevicePermissionHandler` が許可するので、
最初から `getDevices()` で拾える。**活性化の壁は無い。**

どちらも、**書き込む中身は同梱 `.bin` と同一で、差分のあるセクタしか書かない。**
既に同じものが入っていれば照合だけで終わる。しかも基板が書き込みモードで
挿さっていなければ何も起きない。実害は数秒の待ちだけなので、
これ以上のガードは今回入れない。

---

## 4. `.bin` の同梱

### 生成物

`scratch-vm/src/extensions/scratch3_uiapduino/sketchBin.js` を**自動生成**する。
手で書かない。中身は base64 の文字列と、確認用のメタ情報。

```js
// このファイルは scripts/embed-bin.mjs が作る。手で直さない。
export const SKETCH_BIN_BASE64 = '...';
export const SKETCH_BIN_SIZE = 12204;
export const SKETCH_BIN_SHA256 = '16e3f82d...';
export const SKETCH_BIN_PROTOCOL_VERSION = 8;
export const SKETCH_BIN_BUILT_AT = '2026-08-14';
```

base64 は 12,204 バイト → 約 16.3KB。今の `uiapduino.mjs` は 715KB なので約 +2%。

生の `.bin` を `import` しないのは、rollup（Xcratch 版）と webpack（デスクトップ版）の
両方でローダの設定が要るため。**ただの `.js` にしておけば、どちらもそのまま通る。**

### `.bin` の置き場は `sketches/ScratchUiapduino.ino.bin`

**リポジトリに追跡させる。** 置かないと `sketchBin.js` を作り直せず、
リリースに付ける `.bin` も出せなくなる。12KB なので大きさは問題にならない。

`sketches/ScratchUiapduino/` の**中には置かない。** そこはリリースの
`Scratch-UIAPduino-<ver>-sketch.zip` を固める元なので、中に入れると
ソースの zip に生成物が混ざる。`.ino` の隣（`sketches/` 直下）に置けば混ざらない。

名前は arduino-cli の出力そのまま。webflasher の
`<input type="file" accept=".bin">` で選ぶときに何のファイルか分かる。

`.gitignore` に、同じ場所へ落ちる残りの生成物を足しておく:

```
/sketches/*.elf
/sketches/*.hex
/sketches/*.map
```

### 生成スクリプト

`xcratch/scripts/embed-bin.mjs`。**引数は要らない。**

```
node ./scripts/embed-bin.mjs
```

やること:

1. `sketches/ScratchUiapduino.ino.bin` を読んで base64 と sha256 を出す
2. 16,384 バイト（CH32V003 の Flash）を超えていたら止める
3. `sketches/ScratchUiapduino/ScratchUiapduino.ino` から `#define PROTOCOL_VERSION` を読む
4. `sketchBin.js` を書き出す

置き場を変えたいときのために、パスを引数で渡せる逃げ道は残す（既定は上記）。

`npm run build` には**繋がない。** `.bin` を作るには arduino-cli が要るので、
ビルドのたびに走らせられない。**`.ino` を直したときだけ手で走らせる。**

### 更新手順（`.ino` を直したとき）

1. arduino-cli でビルドする（グローバルメモリ `arduino_cli_build.md`）。
   `--output-dir` は作業用のどこかにして、**`.bin` だけを
   `sketches/ScratchUiapduino.ino.bin` へ上書きコピーする**
   （`.elf` / `.hex` / `.map` は要らない）
2. `cd xcratch; node ./scripts/embed-bin.mjs`
3. `npm run build`
4. `.bin` と `sketchBin.js` と `docs/uiapduino.mjs` を**一緒にコミットする**

**2 を忘れると、3 の照合（流れの手順 3）が実行時に弾く。**
配ってしまう前に気づけるのはビルド時ではなく実行時なので、
リリース前に一度ブロックを押して確かめること。

### ビルドは再現する（確認済み）

2026-08-14 に、`sketches/ScratchUiapduino` を arduino-cli 1.5.1 でビルドし直したところ、
配布用の `.bin` と**バイト単位で一致**した。

```
size   12,204
sha256 16e3f82d30db48e26d0f4108158a44c8bc9141c84c390204c5021100ba35375b
```

**同じソースからは同じ `.bin` が出る。** だから `sketchBin.js` が正しいかどうかは、
いつでも焼き直して確かめられる。

---

## 5. 書き込み処理の同梱

`scratch-vm/src/extensions/scratch3_uiapduino/rv003usbFlasher.js` として置く。

出どころは <https://yuukiumeta-uiap.github.io/rv003usb-webflasher/rv003usb_webflasher.js>。
**MIT License**（Copyright (c) 2026 Wong Cho Ching / (c) 2023-2024 CNLohr, et al. ほか）。
14KB・依存なしの関数 1 個で、`minichlink` から移植されたもの。

### ライセンス表記

- ファイル冒頭の著作権表示とライセンス全文を**そのまま残す**
- 改変したことをその下に明記する（MIT の要求ではないが、出どころが追えなくなる）
- README に第三者ライセンスの節を作り、同梱していることを書く

拡張機能自体は BSD-3-Clause（`xcratch/package.json`）。MIT のものを同梱するのは問題ない。

### 改変は 1 箇所だけ

デバイスを引数で受け取れるようにする。元は関数の中で `requestDevice()` を呼ぶので、
「書き込みモードでない」と「書き込みに失敗した」を区別できず、
自分で先に取ろうとするとダイアログが 2 回出る。

```js
// 元
async function rv003usb_webflasher(uint8arraycontent, status_callback) {
    ...
    device = await navigator.hid.requestDevice({filters: [...]})
    device = device[0]
    await device.open()

// 後
async function rv003usb_webflasher(uint8arraycontent, status_callback, device = null) {
    ...
    if (!device) {
        device = await navigator.hid.requestDevice({filters: [...]})
        device = device[0]
    }
    await device.open()
```

**これ以外は触らない。** 上流が更新されたときに差分を当て直せるようにしておく。

---

## 6. 触るファイル

| ファイル | 何をするか |
|---|---|
| `scratch-vm/src/extensions/scratch3_uiapduino/index.js` | ブロック 2 個、文言、`getInfo()` の差し替え箇所、書き込みの流れ |
| `scratch-vm/src/extensions/scratch3_uiapduino/rv003usbFlasher.js` | **新規**。MIT の同梱物（改変 1 箇所） |
| `scratch-vm/src/extensions/scratch3_uiapduino/sketchBin.js` | **新規・自動生成**。手で書かない |
| `xcratch/scripts/sync-block.mjs` | `files` に上の 2 つを足す |
| `xcratch/scripts/embed-bin.mjs` | **新規**。`.bin` → `sketchBin.js` |
| `xcratch/package.json` | `version` を上げる。`embed-bin` を `scripts` に足す |
| `scratch-desktop/src/main/index.js` | `isUiapduino` に `B803` を足す（1 章） |
| `sketches/ScratchUiapduino.ino.bin` | **新規**。埋め込みの元。追跡する |
| `.gitignore` | `sketches/` に落ちる `.elf` / `.hex` / `.map` を外す |
| `README.md` | 書き込みブロックの説明、第三者ライセンス、`.bin` の更新手順 |

### ⚠ `sync-block.mjs` の `files` を忘れないこと

```js
const files = ['index.js', 'uiapduinoProcessor.js'];
```

ここに足さないと、新しいファイルが `xcratch/src/vm/extensions/block/` に複製されず、
rollup が解決できずにビルドが落ちる。

### ⚠ `xcratch/src/vm/extensions/block/` は手で書かない

そこにあるのは `sync-block.mjs` が置いた複製で、ビルドのたびに上書きされる。
直すのは必ず `scratch-vm/src/extensions/scratch3_uiapduino/` の方。

### 今回触らないもの

- `sketches/ScratchUiapduino/` — スケッチは変えない。`PROTOCOL_VERSION` も 8 のまま。
  seamless switch（ボタンを押しながら挿す手順を消す）も今回はやらない

### デスクトップ版のビルドは別の話

`main/index.js` の変更はコミットに含めるが、**デスクトップ版のビルド（10 分）は
指示があったときだけ走らせる。** 次にリリースを作るときに一緒に乗る。
それまでの間、配布済みのデスクトップ版は `B803` を許可していないので、
仮にブロックだけ先に入った版が手元にあっても「書き込みモードになっていません」で止まる。

---

## 7. 実機で確認すること

**すべて未確認。** 実装したら上から順に踏む。

1. **パレットのブロックをクリックして `requestDevice()` が通るか。**
   ここが通らなければ設計をやり直す。最初に確かめる
2. 書き込みモードでない基板で押したとき、「書き込みモードになっていません」で
   止まるか（勝手にダイアログを出し続けないか）
3. まっさらでない基板（同じ `.bin` が既に入っている）で押したとき、
   全セクタが一致して速く終わるか
4. 書き込み後、`D004` として現れて自動で繋ぎ直るか。パレットがブロックに戻るか
5. スケッチ不一致の状態（古い基板）から、説明の中のブロックを押して直せるか。
   **これが本命の経路**
6. 書き込み中に `flashStatus` が割合を返すか。step 4 と 5 の出方が上記のとおりか
7. 緑の旗から走らせたとき `SecurityError` で止まるか（ブラウザ版・活性化なしの確認）
8. 書き込みの途中で USB を抜いたとき、`_flashing` が下りて次に押せるか
9. **デスクトップ版で書けるか。** `getDevices()` だけで `B803` が拾えるか
   （活性化の壁が無いことの確認）
10. デスクトップ版で `B803` を要求したときに `D004` を掴まないか。
    `select-hid-device` の `deviceList` がフィルタ済みであることの確認

---

## 8. 引き継ぎメモ

### なぜ BOOLEAN なのか

既存の「つなぐ」ブロックと同じ形にした。押した先端に `true` / `false` が出るので、
成功したかどうかがその場で分かる。COMMAND だと結果を出す先が無い。

### なぜレポーターで進み具合を出すのか

パレットの説明行を書き換える案もあったが、`TOOLBOX_EXTENSIONS_NEED_UPDATE` は
パレットを組み直すので、置いてあるブロックが毎回作り直されて重い
（`_setSketchProblem()` が「変化が無いときは何もしない」としているのはそのため）。
書き込み中に何度も走らせるものではない。

### なぜ URL 取得ではなく同梱なのか

版が必ず一致するから。URL から取ると、拡張機能と `.bin` が別々に更新されうる。
それは今ある版ズレ問題を、置き場所を変えて作り直すだけになる。
オフラインでも書けるという利点も付いてくる。
