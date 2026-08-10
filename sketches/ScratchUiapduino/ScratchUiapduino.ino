/**
 * ScratchUiapduino
 *
 * scratch3-uiapduino 拡張機能のデバイス側スケッチ。
 *
 * ボード: HID ProMicro CH32V003
 *   Tools → Board Version : V1.4
 *   Tools → USB           : Keyboard+Mouse+WebHID
 *   Tools → PWM           : TIM2 Default (pin 2 / PC0)
 *   Tools → U(S)ART       : None (use UIAPSerial)   ← 既定のまま
 *   Tools → Optimize      : Smallest (-Os) with LTO
 *
 * U(S)ART を HardwareSerial にしてはいけない。標準の `Serial` は一度も呼ばなくても
 * Flash を約 4748 バイト消費する (boards.txt のコメント)。16KB には入らない。
 * シリアル通信は同梱の UIAPSerial (USART1 の軽量ラッパー) で行う。
 *
 * USB は Keyboard+Mouse+WebHID でなければならない。
 * UIAPduino は HID なのでキーボードとマウスそのものになれる。これが他にない機能で、
 * Scratch から PC のキーボード入力とマウス操作ができる。WebHID Only では
 * インタフェースが 1 つだけになり、キーボードとマウスのブロックが動かない。
 *
 * VID/PID (0x1209 / 0xD004) と Usage Page (0xFF00 / 0x01)、
 * Input Report 8 バイト / Feature Report 32 バイトはどちらの設定でも同一。
 * Scratch 側は同じ VID/PID のキーボードコレクションを拾わないよう、
 * uiapduinoProcessor.js の _findDevice() が 0xFF00/0x01 を持つものを優先して選ぶ。
 *
 * 動作:
 *   Scratch から Feature Report で届いたコマンドを実行し、
 *   Input Report で応答を返すだけ。1 コマンド 1 応答のロックステップ。
 *
 * ワイヤフォーマットは uiap-hid-web (uiapruby.html) の rsp() と同一。
 * 独自定義ではないので、hid-console.html などの既存ツールからも観測できる。
 *
 *   Scratch → UIAPduino   Feature Report 32 バイト
 *     [0] コマンド ID  [1..] パラメータ
 *
 *   UIAPduino → Scratch   Input Report 8 バイト
 *     [0] 0x52  [1] ステータス  [2] ペイロード長(0-5)  [3..7] ペイロード
 *
 *   戻り値のないコマンド : OK のみ
 *   戻り値のあるコマンド : DATA を繰り返して END で終端
 */

// ── Tools → USB の設定を確かめる ────────────────────────────────────────────
//
// このスケッチは Keyboard+Mouse+WebHID でなければ動かない。
// **ボードの既定は WebHID Only なので、選び忘れがまず起きる。**
//
// 選び忘れたまま進むと、Mouse / Keyboard ライブラリの中で
// 「uiapkbd_mouse_set が無い」といった、原因の分からないエラーになる。
// Keyboard.h と Mouse.h は自前のガードを持っていないので、ここで止める。
//
// ヘッダより前に置くこと。後ろに置くと、ライブラリ側のエラーが先に出て埋もれる。
//
//   Tools → USB          立つマクロ
//   WebHID Only          UIAP_WEBHID_ONLY
//   Keyboard+Mouse       UIAP_COMPOSITE_HID
//   Keyboard+Mouse+WebHID   UIAP_COMPOSITE_HID + UIAP_WEBHID   ← これでなければならない
#if !defined(UIAP_COMPOSITE_HID) || !defined(UIAP_WEBHID)
#error "Tools -> USB を Keyboard+Mouse+WebHID にしてください。既定の WebHID Only ではキーボードとマウスのブロックが動きません。"
#endif

#include <WebHID.h>
#include <PWMmin.h>
#include <Keyboard.h>
#include <Mouse.h>
#include "UIAPSerial.h"

// Tools → PWM が TIM2 Default になっていなければコンパイルエラーにする
PWMMIN_REQUIRE_DEFAULT();

// ── 応答ステータス ──────────────────────────────────────────────────────────
#define RSP_MARKER 0x52
#define RSP_OK     0
#define RSP_ERR    1
#define RSP_DATA   2
#define RSP_END    3

// 準備完了通知（Hid.h の Ready プロトコル）。hid-console.html でも観測できる。
#define READY_MARKER 0x53

// シリアル受信の通知。コマンドの応答ではなく、デバイスから勝手に送る。
//
// 「割り込み」を Scratch まで届けるための経路。区切り文字の判定はここではしない。
// 「読むものがある」とだけ伝え、何行あるか・どこで切るかは Scratch 側が決める。
// デバイスに区切り文字を教えると、ブロックのメニューを増やすたびに焼き直しになる。
//
// 送るのはコマンドを処理していない間だけ。応答の途中に割り込ませると、
// レポートが上書きされて応答が消える (rsp() のコメントを参照)。
#define SERIAL_MARKER 0x54

// ── プロトコルのバージョン ──────────────────────────────────────────────────
//
// PING (0x20) の応答としてこの値を返す。Scratch 側は接続時にこれを読み、
// 自分が期待する値と違えば接続を拒否する。
//
// スケッチは基板に焼かれたまま残るので、Scratch だけ更新される状況が起きる。
// 照合が無いと、噛み合わないコマンドを送って「ブロックが無言で何もしない」
// という一番わかりにくい壊れ方をする。
//
// Scratch 側 uiapduinoProcessor.js の PROTOCOL_VERSION と同じ値でなければならない。
//
// ⚠ 上げる条件は「プロトコルを変えたとき」ではなく「今の番号が公開済みのとき」。
//
//   守る相手は "誰かの手元にある基板" なので、まだ配っていない番号には
//   守るべき基板が存在しない。開発中に番号を上げても、噛み合わない相手は居ない。
//
//   今の番号がタグ付き / docs 公開済み / 基板を配った、のどれかなら → 上げる
//   どれでもないなら → 番号は据え置き、中身だけ作り直して焼き直す
//
//   実際、公開されたのは 1 の次が 5 だった。2 と 4 はコミットにも残っていない。
//   検証のたびに機械的に上げたためで、公開番号を無駄に消費していた (2026-08-08)。
//
//   1 : ピン操作のみ
//   2 : キーボード / マウス / 非常停止を追加。USB 設定が Keyboard+Mouse+WebHID になった
//   3 : ダブルクリックとドラッグを追加
//   4 : KEY_TEXT / KEY_WRITE が押しっぱなしの修飾キーを壊さなくなった
//       (「[Ctrl] を押しながら〔 〕」の囲みブロックのため。keyTap() を参照)
//   5 : 大文字と記号が打てるようになった。押しっぱなしの Shift は
//       大文字小文字を反転させる (バージョン 4 は大文字が黙って消えていた)
//   6 : サーボと距離計を追加。ANALOG_WRITE と SERVO が周波数を伴うようになった
//       ([3..4] に Hz。それまで ANALOG_WRITE は [1]=pin [2]=duty の 3 バイトだった)
//   7 : シリアル通信を追加。SERIAL_BEGIN / WRITE / READ と受信通知 (0x54)。
//       begin 後は D15 / D16 (= A5 / A6) が TX / RX になるので弾くようになった
//       (6 は v0.2.1 として公開済みなので据え置けない)
#define PROTOCOL_VERSION 7

// このスケッチがどの版かを表す番号。PING の応答の上位バイトで返す。
//
// UIAPduino は Flash が 16KB しかないので、機能を全部載せることができない。
// 将来「HID の代わりに I2C を積んだ版」のような派生が出る前提で、
// どの版が焼かれているかを名乗れるようにしてある。
//
// 名乗らないと、拡張機能は「プロトコルのバージョンが違う」としか言えない。
// 本当の原因は「別の版のスケッチが焼かれている」なのに、
// 利用者は同じスケッチを書き込み直そうとして、また失敗する。
//
// ⚠ 0 は変えないこと。0 を返すのは PROTOCOL_VERSION だけを 1 バイトで返していた
//   世代のスケッチと同じ値になり、そのまま HID 版として扱われる。
//   つまり既に配ってしまった基板が、この変更で弾かれずに済む。
//   新しい版を作るときは 1 から順に振り、Scratch 側 uiapduinoProcessor.js の
//   VARIANT にも同じ番号と名前を足すこと。
//
//   0 : HID 版 (キーボード / マウス / ピン操作)
#define SKETCH_VARIANT 0

// ── コマンド ID ─────────────────────────────────────────────────────────────
// 0x01 は接続通知で予約。0x01-0x11 は uiapruby が使用中のため 0x20 以降を使う。
#define CMD_CONNECT       0x01
#define CMD_PING          0x20
#define CMD_PIN_MODE      0x21
#define CMD_DIGITAL_WRITE 0x22
#define CMD_DIGITAL_READ  0x23
#define CMD_ANALOG_WRITE  0x24
#define CMD_ANALOG_READ   0x25
#define CMD_SERVO         0x26
#define CMD_DISTANCE      0x27

// シリアル通信 (0x28-0x2A)。
//
// デバイスは「文字列」も「行」も知らない。運ぶのはバイト列だけで、
// CSV の組み立ても区切り文字の判定も Scratch 側が持つ。サーボの角度と同じ理由
// (ブロックの書式を変えても基板を焼き直さずに済む)。
#define CMD_SERIAL_BEGIN  0x28
#define CMD_SERIAL_WRITE  0x29
#define CMD_SERIAL_READ   0x2A

#define CMD_PANIC         0x2F

// キーボード (0x30 台)。
//
// KEY_PRESS / KEY_RELEASE は「[Ctrl] を押しながら〔 〕」の囲みブロックが
// 中身の前後で使う。修飾キー (KEY_LEFT_CTRL 0x80 〜 KEY_LEFT_GUI 0x83) を渡す。
//
// 0x35 は空けてある。「修飾キーと組み合わせて押す」を 1 コマンドで行う
// KEY_SHORTCUT を置いていたが、消した。キーボードにそんなキーは無い。
// あるのは「キーを押す」と「修飾キーを押したままにする」だけで、
// 組み合わせは囲みブロックが表す。
#define CMD_KEY_TEXT        0x30
#define CMD_KEY_WRITE       0x31
#define CMD_KEY_PRESS       0x32
#define CMD_KEY_RELEASE     0x33
#define CMD_KEY_RELEASE_ALL 0x34

// マウス (0x40 台)。
// 0x44 は空けてある。デバイス → Scratch のログマーカー (0x44) と同じ値で、
// 方向が逆なので衝突はしないが、hid-console.html でログを追うときに紛らわしい。
#define CMD_MOUSE_MOVE        0x40
#define CMD_MOUSE_WHEEL       0x41
#define CMD_MOUSE_CLICK       0x42
#define CMD_MOUSE_PRESS       0x43
#define CMD_MOUSE_RELEASE     0x45
#define CMD_MOUSE_RELEASE_ALL 0x46
#define CMD_MOUSE_DBLCLICK    0x47
#define CMD_MOUSE_DRAG        0x48

// ダブルクリックの 2 回の間隔 (ms)。
// Windows の既定の判定時間は 500ms なので、それより十分に短くする。
// Scratch から click を 2 回送る形では、応答待ちの往復で 500ms を超えかねない。
// だからダブルクリックはデバイス側で完結させている。
#define DBLCLICK_GAP_MS 60

// ── 押しっぱなしの見張り ────────────────────────────────────────────────────
//
// キーやマウスのボタンを押したまま Scratch が落ちる / USB が抜ける / 利用者が
// 止め方を見失う、ということが起きる。押しっぱなしのまま放置されると PC が
// 操作不能になり、Scratch の停止ボタンを押すことすらできない。
//
// そこで、最後にコマンドを受け取ってからこの時間が過ぎても何か押されたままなら、
// デバイス側の判断で全部離す。
//
// 「押したままにする」→「1 秒待つ」→「離す」のような使い方は 5 秒以内なので通る。
// 「押したままにする」だけ実行して手で何か操作する、という使い方は 5 秒で離れる。
// 起点は「最後のコマンド」なので、時間のかかる移動の途中で離れることはない。
#define HOLD_TIMEOUT_MS 5000

// ── 触ってはいけないピン ────────────────────────────────────────────────────
// D13 / D14 は USB D+ / D-。触ると USB が落ちて Scratch との接続が切れる。
// D17 は RESET。
#define PIN_USB_DP 13
#define PIN_USB_DM 14
#define PIN_RESET  17

// アナログ入力側の禁止チャンネル。A4 = D13、A7 = D14 で USB ピンと同じ。
#define ADC_USB_DP 4
#define ADC_USB_DM 7

// ── シリアルが使うピン ──────────────────────────────────────────────────────
//
// USART1 の TX / RX は CH32V003 では動かせない。D15 = PD5、D16 = PD6 で、
// アナログ番号でいうと A5 / A6 と同じ足。
//
// ⚠ 弾くのは begin した後だけ。シリアルを使わない人からこの 4 つを
//   取り上げる理由がない。
#define PIN_UART_TX 15
#define PIN_UART_RX 16
#define ADC_UART_TX 5
#define ADC_UART_RX 6

/**
 * 何か押したまま、コマンドが来ないまま過ぎた時間 (ms)。
 *
 * millis() は使わない。CH32V003 の millis() は uint64_t の除算を引き込んで
 * Flash を 2.2KB (全体の 14%) 食う。16KB しかないので割に合わない。
 * 何か押されている間だけ 1ms ずつ待って数えれば、delay() だけで正確に測れる。
 * 待つのはどうせ次のコマンドが来るまでの空き時間で、USB のポーリングが 10ms
 * 間隔なのだから 1ms の遅れは表に出ない。
 */
static uint16_t heldMs = 0;

/**
 * キーボードのキーを押したままにしているか。
 *
 * Mouse には isPressed() があるがキーボードには無いので、こちらは自分で覚える。
 * どのキーかまでは覚えない。見張りが離すときは releaseAll() で全部離すため。
 */
static bool keyHeld = false;

/**
 * Shift を押したままにしているか（KEY_PRESS で押されたぶん）。
 *
 * keyTap() が「押しっぱなしの Shift は大文字小文字を反転させる」を
 * 実現するために見る。keyHeld と違って、どのキーかを区別する必要がある。
 */
static bool shiftHeld = false;

/**
 * シリアルを begin 済みか。
 *
 * 立つと TX / RX の 4 つ (D15 / D16 / A5 / A6) を弾くようになる。
 * 一度立てたら降ろす手段は無い。閉じるブロックを置いていないため。
 */
static bool serialOpen = false;

/**
 * 受信の通知をまだ送っていないか。
 *
 * 受信があるたびに送ると、1 バイトごとにレポートが飛んで応答を潰しかねない。
 * 「読むものがある」と一度伝えたら、Scratch が読みに来るまで黙る。
 * 読みに来た時点で、まだ残っていれば再び知らせる (doSerial を参照)。
 */
static bool notifyArmed = false;

/**
 * 応答を 1 レポート送る。uiapruby が生成するファームの rsp() と同じ。
 *
 * 送信前に前レポートのホスト回収を待つ。uiapwebhid_send 内蔵の待ち
 * （~200000 ループ）だけでは、ホストのポーリングのばらつきで前のレポートが
 * 上書きされて消えることがあるため。uiapruby の consoleWriteChunk() と同じ対策。
 * DATA が消えて END だけ届くと、Scratch 側は 0 を正常値として受け取ってしまう。
 * millis() は uint64_t のソフト演算を引き込んで Flash を食うのでカウンタ方式。
 */
static void rsp(uint8_t status, const uint8_t *d, uint8_t len) {
  uint8_t buf[8] = { RSP_MARKER, status, len, 0, 0, 0, 0, 0 };
  if (d && len) {
    uint8_t n = len > 5 ? 5 : len;
    for (uint8_t i = 0; i < n; i++) buf[3 + i] = d[i];
  }
  for (uint32_t t = 0; WebHID.busy() && t < 800000UL; t++) {}
  WebHID.send(buf, 8);
  delay(12);
}

#define rsp_ok()  rsp(RSP_OK,  0, 0)
#define rsp_err() rsp(RSP_ERR, 0, 0)

/**
 * 数値を DATA → END の 2 レポートで返す。
 * len = 1 なら 0/1、len = 2 ならリトルエンディアン 16bit。
 */
static void rsp_value(uint16_t v, uint8_t len) {
  uint8_t d[2] = { (uint8_t)(v & 0xFF), (uint8_t)(v >> 8) };
  rsp(RSP_DATA, d, len);
  rsp(RSP_END, 0, 0);
}

/**
 * バイト列を DATA の繰り返しで返して END で終端する。
 *
 * 1 レポートに載るのは 5 バイトなので、長さに応じて何通にも分かれる。
 * 1 通ごとに rsp() が 12ms 待つため、30 バイトで約 85ms かかる。
 * これがシリアル読み出しの速さの上限になっている (毎秒 330 バイト程度)。
 *
 * len が 0 でも DATA を 1 通は送る。DATA が 1 通も無い END を、Scratch 側は
 * 「ペイロードが消えた」とみなしてエラーにするため (uiapduinoProcessor.js)。
 */
static void rsp_bytes(const uint8_t *d, uint8_t len) {
  uint8_t i = 0;
  do {
    uint8_t n = (uint8_t)(len - i) > 5 ? 5 : (uint8_t)(len - i);
    rsp(RSP_DATA, &d[i], n);
    i = (uint8_t)(i + n);
  } while (i < len);
  rsp(RSP_END, 0, 0);
}

/** デジタルピンとして使ってよいか */
static bool digitalPinOk(uint8_t pin) {
  if (pin >= NUM_DIGITAL_PINS) return false;
  if (serialOpen && (pin == PIN_UART_TX || pin == PIN_UART_RX)) return false;
  return pin != PIN_USB_DP && pin != PIN_USB_DM && pin != PIN_RESET;
}

/** アナログ入力チャンネルとして使ってよいか（0-7 の A 番号） */
static bool analogChannelOk(uint8_t ch) {
  if (ch >= NUM_ANALOG_INPUTS) return false;
  if (serialOpen && (ch == ADC_UART_TX || ch == ADC_UART_RX)) return false;
  return ch != ADC_USB_DP && ch != ADC_USB_DM;
}

/**
 * PWM を出せるピンか。Tools → PWM = TIM2 Default のときの一覧。
 * TIM1: 0 / 5 / 6 / 12   TIM2: 2
 * （Remap3 にすると TIM2 が 3 / 9 / 15 / 16 に変わる）
 */
static bool pwmPinOk(uint8_t pin) {
  return pin == 0 || pin == 2 || pin == 5 || pin == 6 || pin == 12;
}

// ── PWM の周波数 ────────────────────────────────────────────────────────────
//
// ⚠ このスケッチは「サーボ」を知らない。
//
//   角度・パルス幅・可動域はすべて Scratch 側が持っている。ここへ届くのは
//   「このピンに、この周波数で、この duty を出せ」だけ。だからサーボを
//   変えても、可動域を変えても、このスケッチを焼き直す必要がない。
//   ブロックの設定を変えるだけで済む。
//
//   デバイスに角度を解釈させると、可動域を変えるたびに焼き直しになる。
//   Scratch の利用者にそれはできない。
//
// PWMmin の周波数は「ピンごと」ではなく「タイマーごと」にしか設定できない。
// Tools → PWM = TIM2 Default では TIM2 は D2 だけ、残りの D0/D5/D6/D12 が TIM1。
//
// しかも Pwm_write() は呼ばれるたびに TIMn->PSC を書き戻す。つまり最後に
// 周波数を言った者が勝つ。だから PWM を出すコマンドは毎回それを持ってくる。
//
// ⚠ 残る制約は消せない。同じタイマーのピンでサーボとアナログ出力を同時に使うと、
//   後から出した方の周波数に揃う。TIM1 は D0/D5/D6/D12 を共有しているため。
//   ハードウェアの制約なので、ここで直せるものではない。

/**
 * ピンの属するタイマーだけ周波数を変える。
 *
 * Pwm_freq() は TIM1 と TIM2 の両方を変えてしまうので使わない。
 * サーボを D5 (TIM1) に出しただけで、LED の D2 (TIM2) まで 50Hz になる。
 *
 * Tools → PWM = TIM2 Default 前提。TIM2 は D2 だけで、残りは TIM1。
 * Remap3 では TIM2 が D3/D9/D15/D16 に変わるが、このスケッチは
 * 先頭の PWMMIN_REQUIRE_DEFAULT() で Default 以外をコンパイルエラーにしてある。
 */
static void pwmSetFreq(uint8_t pin, uint32_t hz) {
  if (pin == 2) Pwm_freq_TIM2(hz);
  else          Pwm_freq_TIM1(hz);
}

// ── 距離計 (HC-SR04) ────────────────────────────────────────────────────────
//
// Trig にパルスを出し、Echo が High になっている時間を測って返す。
// 返すのは往復時間 (µs) だけで、cm への換算は Scratch 側でやる。
// 係数を変えたくなったときに基板を焼き直さずに済む。
//
// ⚠ micros() を使わない。CH32V003 の micros() は millis() と同じ uint64_t の
//   除算を引き込むので、これ 1 つで Flash が 2.2KB 増える (README の Flash 使用量を参照)。
//   pulseIn() も内部で micros() を呼ぶので同じ。
//
//   代わりに SysTick->CNT を直接読む。SystemInit() 済みの free-running カウンタで、
//   micros() が内部で使っているものと同じ。uiap-hid-web の UIAPrubyVmUs.ino が
//   実機で使っている方法でもある。
//
//   32bit の引き算なので折り返しも安全。48MHz なら約 89 秒で 1 周する。
//   計測は長くても数十 ms なので届かない。

/** SysTick の 1µs あたりのカウント数。core の wiring_time.h の DELAY_US_TICKS と同じ */
#define SYSTICK_PER_US (F_CPU / 1000000UL)

// 待ちの上限。時間ではなくループの回数で数える (UIAPrubyVmUs.ino と同じ)。
// 時間で測ろうとすると、その時計のために micros() が要る。
#define ECHO_WAIT_RISE  60000UL   /* Echo が High になるまで */
#define ECHO_WAIT_FALL 400000UL   /* Echo が Low に戻るまで */

/**
 * HC-SR04 で往復時間を測る。
 *
 * Trig の High は 1ms。データシートの 10µs より長いが、
 * uiap-hid-web の UIAPrubyVmUs.ino が実機で使っている値に合わせてある。
 *
 * @param trig Trig ピン
 * @param echo Echo ピン
 * @return 往復時間 (µs)。測れなければ 0
 */
static uint16_t measureEchoUs(uint8_t trig, uint8_t echo) {
  // PWM 中のピンを指定された場合に備える。PWM 中でなければ何も起きない。
  Pwm_stop(trig);
  Pwm_stop(echo);
  pinMode(trig, OUTPUT);
  pinMode(echo, INPUT);

  digitalWrite(trig, HIGH);
  delay(1);
  digitalWrite(trig, LOW);

  // 反応が返ってこない (未接続 / 電源なし)
  uint32_t cnt = ECHO_WAIT_RISE;
  while (!digitalRead(echo) && --cnt) {}
  if (cnt == 0) return 0;

  uint32_t t0 = SysTick->CNT;
  cnt = ECHO_WAIT_FALL;
  while (digitalRead(echo) && --cnt) {}
  // High のまま戻らない (測定範囲外)
  if (cnt == 0) return 0;

  uint32_t us = (uint32_t)(SysTick->CNT - t0) / SYSTICK_PER_US;
  // 16bit に収まらない値は Scratch へ渡せない。測れなかったものとして扱う。
  return us > 0xFFFF ? 0 : (uint16_t)us;
}

// ── シリアル通信 ────────────────────────────────────────────────────────────
//
// ⚠ このスケッチは「行」も「CSV」も知らない。
//
//   運ぶのはバイト列だけ。区切り文字がどれか、何行たまっているか、数値をどう
//   並べるかは Scratch 側が決める。サーボが角度を知らないのと同じ理由で、
//   ブロックの書式を変えても基板を焼き直さずに済む。

/** 1 コマンドで運べるバイト数。Feature Report 32 バイトのうち [2..31] */
#define SERIAL_CHUNK 30

/**
 * シリアル通信のコマンドを実行する。
 * @param cmd コマンド ID (0x28-0x2A)
 * @param buf 受信した Feature Report 32 バイト
 */
static void doSerial(uint8_t cmd, const uint8_t *buf) {
  if (cmd == CMD_SERIAL_BEGIN) {
    // [1..4] = ボーレート (uint32LE)
    uint32_t baud = (uint32_t)buf[1] | ((uint32_t)buf[2] << 8) |
                    ((uint32_t)buf[3] << 16) | ((uint32_t)buf[4] << 24);
    // 0 を弾く。BRR = 48000000 / baud なのでゼロ除算になる。
    if (baud == 0) {
      rsp_err();
      return;
    }
    uart.begin(baud);
    serialOpen = true;
    notifyArmed = true;
    rsp_ok();
    return;
  }

  // begin していなければ、ピンはまだ普通の GPIO として使われているかもしれない。
  // 黙って USART を動かすと、そのピンに繋がっているものを壊す。
  if (!serialOpen) {
    rsp_err();
    return;
  }

  if (cmd == CMD_SERIAL_WRITE) {
    // [1] = バイト数  [2..31] = 中身
    //
    // 0 終端にしていないのは、数値をそのまま送る使い方を塞がないため。
    // 文字列とは限らないので、途中に 0 があっても切らない。
    uint8_t n = buf[1];
    if (n > SERIAL_CHUNK) n = SERIAL_CHUNK;
    for (uint8_t i = 0; i < n; i++) uart.write(buf[2 + i]);
    rsp_ok();
    return;
  }

  // CMD_SERIAL_READ : [1] = 最大バイト数
  //
  // 先頭に実際に読めた数を付けて返す。0 バイトのときも「0 が 1 バイト」を返す
  // ことになるので、rsp_bytes() の「DATA が 1 通も無い END」を踏まない。
  uint8_t max = buf[1];
  if (max > SERIAL_CHUNK - 1) max = SERIAL_CHUNK - 1;
  uint8_t out[SERIAL_CHUNK];
  uint8_t n = 0;
  while (n < max && uart.available()) {
    out[1 + n] = uart.read();
    n++;
  }
  out[0] = n;
  // 読み切れずに残っていれば、次の空き時間にまた知らせる。
  // これが Scratch 側の「残りが無くなるまで読む」を回す仕掛けになっている。
  notifyArmed = true;
  rsp_bytes(out, (uint8_t)(n + 1));
}

/**
 * 受信があることを Scratch へ知らせる。応答ではないので、勝手に送る。
 *
 * コマンドを処理していない間だけ呼ぶこと。応答の途中に割り込ませると、
 * ホストが回収する前に上書きして応答を消す (rsp() のコメントを参照)。
 */
static void serialNotify() {
  if (!serialOpen || !notifyArmed || !uart.available()) return;
  uint8_t d[8] = { SERIAL_MARKER, 0, 0, 0, 0, 0, 0, 0 };
  for (uint32_t t = 0; WebHID.busy() && t < 800000UL; t++) {}
  WebHID.send(d, 8);
  notifyArmed = false;
  delay(12);
}

/** マウスのボタンをすべて離す */
static void releaseAllMouse() {
  Mouse.release(MOUSE_LEFT);
  Mouse.release(MOUSE_RIGHT);
  Mouse.release(MOUSE_MIDDLE);
}

/** キーもマウスもすべて離す。非常停止と見張りが使う。 */
static void releaseAllInput() {
  Keyboard.releaseAll();
  keyHeld = false;
  shiftHeld = false;
  releaseAllMouse();
  // 見張りが離した直後に数えた分を残さない。
  // 残すと、次に押したときいきなり時間切れになる。
  heldMs = 0;
}

/** 何か押したままになっているか */
static bool anythingHeld() {
  return keyHeld ||
         Mouse.isPressed(MOUSE_LEFT) ||
         Mouse.isPressed(MOUSE_RIGHT) ||
         Mouse.isPressed(MOUSE_MIDDLE);
}

/** パラメータのリトルエンディアン 16bit を符号付きで読む */
static int16_t le16(const uint8_t *p) {
  return (int16_t)((uint16_t)p[0] | ((uint16_t)p[1] << 8));
}

/**
 * Mouse.moveLarge() に渡す分割数を移動量から決める。
 *
 * moveLarge(x, y, wheel, steps) は 1 ステップあたり x/steps px を送るが、
 * USB の相対移動は 1 レポート ±127 px までで、超えた分は黙って切り捨てられる。
 * つまり steps を固定にすると「127 × steps px より大きい移動が途中で止まる」
 * という、エラーも出ない壊れ方をする。
 *
 * そこで 1 ステップが必ず 127 px 以下になるように分割数を決める。
 * 下限は 10（ライブラリの既定値）。小さな移動が 1 ステップで飛ばず、
 * ちょうど良い速さになる。1 ステップにつき 10 ms かかるので、
 * 画面の端から端 (1920 px) でも 16 ステップ = 約 160 ms で収まる。
 *
 * Scratch 側 index.js の mouseMove() が同じ式で応答待ち時間を計算している。
 * 片方だけ変えるとタイムアウトするので、変えるときは両方を直すこと。
 */
static int stepsForMove(int dx, int dy) {
  int ax = dx < 0 ? -dx : dx;
  int ay = dy < 0 ? -dy : dy;
  int m = ax > ay ? ax : ay;
  int steps = (m + 126) / 127;
  return steps < 10 ? 10 : steps;
}

/**
 * ASCII 文字を「刻印どおりに押せるキー」と「Shift が要るか」に分解する。
 *
 * 実際のキーボードに 'H' というキーは無い。あるのは 'h' のキーで、
 * Shift と一緒に押すと 'H' になる。ここではその対応を戻す。
 *
 * 表は arduino_core_ch32 の Keyboard.cpp の _toHID() と同じ組み合わせ。
 * 片方だけ変えないこと。
 *
 * @param k    元の文字
 * @param base Shift 無しで押せるキーを受け取る（特殊キーや小文字はそのまま）
 * @return Shift が要るなら true
 */
static bool needsShift(uint8_t k, uint8_t *base) {
  if (k >= 'A' && k <= 'Z') {
    *base = (uint8_t)(k - 'A' + 'a');
    return true;
  }
  static const char shifted[] = "!@#$%^&*()_+{}|:\"~<>?";
  static const char plain[]   = "1234567890-=[]\\;'`,./";
  for (uint8_t i = 0; shifted[i]; i++) {
    if (k == (uint8_t)shifted[i]) {
      *base = (uint8_t)plain[i];
      return true;
    }
  }
  *base = k;
  return false;
}

/**
 * キーを 1 つ押して離す。押しっぱなしの修飾キーを壊さない。
 *
 * ⚠ ここで Keyboard.write() を使ってはいけない。
 *   write() は内部で
 *       _modifier = modBit;  memset(_keys, 0, 6);  ...  releaseAll();
 *   とレポート全体を組み立て直すので、KEY_PRESS で押したままにしてある
 *   Ctrl や Shift が消え、さらに最後の releaseAll() で全部離れる。
 *   「[Ctrl] を押しながら〔 〕」の中身が無言で修飾キー無しになってしまう。
 *
 *   press() / release() は該当のキーだけを足し引きするので、
 *   外側で押している修飾キーがそのまま残る。
 *
 * 待ちは write() と同じ 20ms ずつ。USB のポーリング (10ms) に確実に拾わせるため。
 * 10ms に縮めると "ll" のような連続する同一文字で 1 文字欠ける
 * (arduino_core_ch32 の Keyboard.cpp のコメント)。1 文字あたり 40ms かかる。
 * Scratch 側 index.js の _typeTimeout() がこの値を見込んでいる。
 *
 * ⚠ Shift は自分で押す。press() に大文字を渡してはいけない。
 *
 *   press('H') は _toHID() が「Shift ビットとキーコードの両方」を返すのに、
 *       if (modBit) { _modifier |= modBit; _sendReport(); return 1; }
 *   と修飾キーだけ立てて戻ってしまい、キーが _keys[] に入らない。
 *   つまり Shift を押しただけで 'H' は打たれない。
 *   write() は _modifier と _keys[0] の両方を組み立てるので問題にならなかったが、
 *   press() に切り替えたときにこの違いを踏んだ (バージョン 4 の不具合)。
 *
 *   そこで needsShift() で「'h' + Shift」に分解してから、Shift は自分で press する。
 *
 * ⚠ 押しっぱなしの Shift は、文字ごとの Shift 要否を「反転」させる。
 *
 *   [Shift] を押しながら〔 "Hello" とタイプする 〕 → hELLO
 *
 *   大文字を打つのに内部で Shift を使う以上、外側の Shift と重なったときの
 *   振る舞いを決めておかないと、どちらが勝つのか説明できない。
 *   反転なら「Shift を押しながらタイプすると大文字小文字が入れ替わる」の
 *   一文で説明できる。
 *
 * @param k キーコード (ASCII または KEY_* 定数)
 */
static void keyTap(uint8_t k) {
  uint8_t base;
  bool charShift = needsShift(k, &base);
  bool useShift  = shiftHeld ? !charShift : charShift;

  // この 1 文字のために Shift の状態を合わせる
  if (useShift != shiftHeld) {
    if (useShift) Keyboard.press(KEY_LEFT_SHIFT);
    else          Keyboard.release(KEY_LEFT_SHIFT);
  }

  Keyboard.press(base);
  delay(20);
  Keyboard.release(base);

  // 押しっぱなしの状態へ戻す
  if (useShift != shiftHeld) {
    if (shiftHeld) Keyboard.press(KEY_LEFT_SHIFT);
    else           Keyboard.release(KEY_LEFT_SHIFT);
  }
  delay(20);
}

/**
 * キーボードのコマンドを実行する。
 * @param cmd コマンド ID (0x30 台)
 * @param buf 受信した Feature Report 32 バイト
 */
static void doKeyboard(uint8_t cmd, uint8_t *buf) {
  uint8_t a = buf[1];

  switch (cmd) {
    case CMD_KEY_TEXT:
      // [2..31] が本体。終端が無いまま 32 バイト使い切っている場合に備えて
      // 最後の 1 バイトを 0 で潰してから渡す。
      //
      // ⚠ この 1 行のせいで、Scratch から置けるのは [2..30] の 29 バイトになる。
      //   30 文字送ると最後の 1 文字だけが消える。Scratch 側 index.js の
      //   KEY_TEXT_CHUNK が 29 なのはこのため。片方だけ変えないこと。
      //
      // 1 文字あたり 40ms かかる (keyTap を参照)。29 文字で約 1.2 秒。
      // Scratch 側 index.js の _typeTimeout() がこの値を見込んでいる。
      //
      // Keyboard.print() は使わない。あれは 1 文字ずつ write() を呼ぶので、
      // 「[Ctrl] を押しながら〔 〕」の中で使うと修飾キーが消える (keyTap を参照)。
      buf[31] = 0;
      for (uint8_t *p = &buf[2]; *p; p++) keyTap(*p);
      rsp_ok();
      break;

    case CMD_KEY_WRITE:
      keyTap(a);
      rsp_ok();
      break;

    case CMD_KEY_PRESS:
      // 渡ってくるのは修飾キー (0x80-0x87) だけ。press() は修飾キー単体なら
      // 正しく動く (キーコードを持たないので早期 return が問題にならない)。
      Keyboard.press(a);
      keyHeld = true;
      if (a == KEY_LEFT_SHIFT || a == KEY_RIGHT_SHIFT) shiftHeld = true;
      rsp_ok();
      break;

    case CMD_KEY_RELEASE:
      Keyboard.release(a);
      if (a == KEY_LEFT_SHIFT || a == KEY_RIGHT_SHIFT) shiftHeld = false;
      // どのキーが残っているかは数えていないので、ここでは見張りを解かない。
      // 押しっぱなしが本当に無ければ、次の全解放か見張りで片付く。
      rsp_ok();
      break;

    case CMD_KEY_RELEASE_ALL:
      Keyboard.releaseAll();
      keyHeld = false;
      shiftHeld = false;
      rsp_ok();
      break;

    default:
      rsp_err();
      break;
  }
}

/**
 * マウスのコマンドを実行する。
 * @param cmd コマンド ID (0x40 台)
 * @param buf 受信した Feature Report 32 バイト
 */
static void doMouse(uint8_t cmd, const uint8_t *buf) {
  uint8_t a = buf[1];

  switch (cmd) {
    case CMD_MOUSE_MOVE: {
      int dx = le16(&buf[1]);
      int dy = le16(&buf[3]);
      Mouse.moveLarge(dx, dy, 0, stepsForMove(dx, dy));
      rsp_ok();
      break;
    }

    case CMD_MOUSE_WHEEL: {
      // [1] は符号付きの回す回数。1 レポートにまとめて送るとホイールの刻みを
      // 無視するアプリがあるので、1 刻みずつ送る。
      int8_t n = (int8_t)a;
      int8_t dir = n < 0 ? -1 : 1;
      int count = n < 0 ? -n : n;
      for (int i = 0; i < count; i++) {
        Mouse.move(0, 0, dir);
        delay(10);
      }
      rsp_ok();
      break;
    }

    case CMD_MOUSE_CLICK:
      Mouse.click(a);
      rsp_ok();
      break;

    case CMD_MOUSE_DBLCLICK:
      Mouse.click(a);
      delay(DBLCLICK_GAP_MS);
      Mouse.click(a);
      rsp_ok();
      break;

    case CMD_MOUSE_DRAG: {
      // [1..2]=dx  [3..4]=dy  [5]=ボタン
      //
      // 押す・動かす・離すを 1 コマンドで完結させる。
      // Scratch 側から 3 回に分けて送る形にすると、その間ずっとボタンが
      // 押されたままになり、USB を抜かれたときに押しっぱなしが残る窓が広がる。
      int dx = le16(&buf[1]);
      int dy = le16(&buf[3]);
      uint8_t button = buf[5];
      Mouse.press(button);
      delay(20);  // press を確実にホストへ届けてから動かす
      Mouse.moveLarge(dx, dy, 0, stepsForMove(dx, dy));
      delay(20);
      Mouse.release(button);
      rsp_ok();
      break;
    }

    case CMD_MOUSE_PRESS:
      // ブロックとしては露出していない。「ドラッグしながら〔〕」の囲みブロックが
      // 中身の前後で使う。押しっぱなしがブロックの内側に閉じ込められる形。
      Mouse.press(a);
      rsp_ok();
      break;

    case CMD_MOUSE_RELEASE:
      Mouse.release(a);
      rsp_ok();
      break;

    case CMD_MOUSE_RELEASE_ALL:
      releaseAllMouse();
      rsp_ok();
      break;

    default:
      rsp_err();
      break;
  }
}

void setup() {
  WebHID.begin();
  Keyboard.begin();
  Mouse.begin();
  delay(2000);  // USB 列挙待ち

  // 前回の書き込み前に押しっぱなしだったものが残っている可能性がある
  releaseAllInput();

  uint8_t ready[8] = { READY_MARKER, 0, 0, 0, 0, 0, 0, 0 };
  WebHID.send(ready, 8);
}

void loop() {
  // キーボードのタイプは 1 コマンドで最大 30 文字送られてくるので 32 バイト受ける
  uint8_t buf[32];
  if (WebHID.recv(buf, sizeof(buf)) == 0) {
    // コマンドの合間だけ、シリアルの受信を知らせる。
    // 応答を送っている最中に割り込ませないよう、ここ以外では呼ばない。
    serialNotify();

    // 押しっぱなしのまま Scratch が黙り込んだら、こちらの判断で離す。
    // 何も押されていないときは数えないので、普段のループは今までどおり空回りする。
    if (anythingHeld()) {
      delay(1);
      if (++heldMs >= HOLD_TIMEOUT_MS) releaseAllInput();
    }
    return;
  }

  heldMs = 0;

  uint8_t cmd = buf[0];
  uint8_t pin = buf[1];
  uint8_t val = buf[2];

  // 接続通知は WaitAvailable() を解除するためだけのもの。応答しない。
  if (cmd == CMD_CONNECT) return;

  if (cmd == CMD_PING) {
    // 下位バイト = プロトコルのバージョン、上位バイト = どの版のスケッチか。
    // RSP_OK だけを返す古いスケッチとはここで区別される。
    //
    // HID 版は SKETCH_VARIANT が 0 なので、この値は PROTOCOL_VERSION 単体と
    // 一致する。1 バイトで返していた頃の拡張機能に繋いでも今までどおり通る。
    rsp_value(PROTOCOL_VERSION | ((uint16_t)SKETCH_VARIANT << 8), 2);
    return;
  }

  // 非常停止。Scratch の停止ボタンから飛んでくる。
  if (cmd == CMD_PANIC) {
    releaseAllInput();
    rsp_ok();
    return;
  }

  if (cmd >= CMD_MOUSE_MOVE) {
    doMouse(cmd, buf);
    return;
  }

  if (cmd >= CMD_KEY_TEXT) {
    doKeyboard(cmd, buf);
    return;
  }

  // シリアルはピン番号を取らないので、下のピン検査より前に分岐する
  if (cmd >= CMD_SERIAL_BEGIN && cmd <= CMD_SERIAL_READ) {
    doSerial(cmd, buf);
    return;
  }

  if (cmd == CMD_ANALOG_READ) {
    if (analogChannelOk(pin)) {
      rsp_value((uint16_t)analogRead(pin), 2);
    } else {
      rsp_err();
    }
    return;
  }

  if (!digitalPinOk(pin)) {
    rsp_err();
    return;
  }

  switch (cmd) {
    case CMD_PIN_MODE:
      // PWM 中のピンを普通の GPIO に戻す。止めずに pinMode すると
      // タイマーが回りっぱなしになる。PWM 中でないピンでは何も起きない。
      Pwm_stop(pin);
      // Scratch 側メニューの値: 0=入力 1=出力 2=入力(プルアップ)
      pinMode(pin, val == 0 ? INPUT : (val == 2 ? INPUT_PULLUP : OUTPUT));
      rsp_ok();
      break;

    case CMD_DIGITAL_WRITE:
      digitalWrite(pin, val ? HIGH : LOW);
      rsp_ok();
      break;

    case CMD_DIGITAL_READ:
      rsp_value(digitalRead(pin) ? 1 : 0, 1);
      break;

    // アナログ出力とサーボは同じ処理。どちらも「このピンに、この周波数で、
    // この duty を出せ」でしかない。違うのは Scratch 側が渡してくる値だけで、
    // アナログ出力は 1000Hz、サーボは既定なら 50Hz を持ってくる。
    //
    // ID を 2 つに分けてあるのは hid-console.html でログを追うため。
    // どちらのブロックが出したものか、生バイトを見て区別できる。
    //
    // analogWrite() は使わない。CH32V003 では HardwareTimer を丸ごと
    // 引き込んで Flash を 2KB 以上食う上に、
    //   - TIM1 と TIM2 の両方に使うと operator new のプールが枯れて無言でフリーズする
    //   - analogWrite → pinMode → analogWrite の往復で RAM が減り続ける
    // という問題がある。Scratch のブロックはどちらも普通にやってしまう。
    // 詳細は arduino_core_ch32 の README「CH32V003 では analogWrite() を使わないでください」。
    case CMD_ANALOG_WRITE:
    case CMD_SERVO: {
      // [1]=pin [2]=duty(0-255) [3..4]=周波数 Hz (uint16LE)
      uint16_t hz = (uint16_t)buf[3] | ((uint16_t)buf[4] << 8);

      // 周波数 0 を弾く。Pwm_freq_TIM*() は 0 を渡されると何もせずに戻るので、
      // 直前の周波数のまま出てしまう。黙って別の周波数で出すより失敗させる。
      //
      // ピンの方は、Scratch 側メニューが PWM を出せる 5 本しか並べていないが、
      // メニューは acceptReporters なので変数からどんな番号でも入ってくる。
      // 黙ってデジタル出力にフォールバックせず、はっきり失敗させる。
      if (!pwmPinOk(pin) || hz == 0) {
        rsp_err();
        break;
      }
      pwmSetFreq(pin, hz);
      Pwm_write(pin, val);
      rsp_ok();
      break;
    }

    case CMD_DISTANCE:
      // [1]=Trig [2]=Echo。往復時間 (µs) を返す。測れなければ 0。
      //
      // Trig は上の digitalPinOk(pin) で確認済み。Echo はここで見る。
      // cm への換算は Scratch 側 (µs ÷ 58)。
      if (digitalPinOk(val)) {
        rsp_value(measureEchoUs(pin, val), 2);
      } else {
        rsp_err();
      }
      break;

    default:
      rsp_err();
      break;
  }
}
