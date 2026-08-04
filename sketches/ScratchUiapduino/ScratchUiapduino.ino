/**
 * ScratchUiapduino
 *
 * scratch3-uiapduino 拡張機能のデバイス側スケッチ。
 *
 * ボード: HID ProMicro CH32V003
 *   Tools → Board Version : V1.4
 *   Tools → USB           : WebHID Only
 *   Tools → PWM           : TIM2 Default (pin 2 / PC0)
 *   Tools → Optimize      : Smallest (-Os) with LTO
 *
 * Keyboard+Mouse+WebHID でも動くが、この拡張はキーボード / マウスを使わない。
 * WebHID Only ならインタフェースが 1 つだけになり、
 * Scratch 側が同じ VID/PID のキーボードコレクションを拾う余地がなくなる。
 * VID/PID (0x1209 / 0xD004) と Usage Page (0xFF00 / 0x01)、
 * Input Report 8 バイト / Feature Report 32 バイトは
 * どちらの設定でも同一なので、Scratch 側は無変更で動く。
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

#include <WebHID.h>
#include <PWMmin.h>

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

// ── プロトコルのバージョン ──────────────────────────────────────────────────
//
// PING (0x20) の応答としてこの値を返す。Scratch 側は接続時にこれを読み、
// 自分が期待する値と違えば接続を拒否する。
//
// スケッチは基板に焼かれたまま残るので、Scratch だけ更新される状況が起きる。
// 照合が無いと、噛み合わないコマンドを送って「ブロックが無言で何もしない」
// という一番わかりにくい壊れ方をする。
//
// 互換性の無い変更（コマンド ID の変更、応答形式の変更、パラメータの意味の変更）
// をしたら必ず上げること。Scratch 側 uiapduinoProcessor.js の PROTOCOL_VERSION と
// 同じ値でなければならない。
#define PROTOCOL_VERSION 1

// ── コマンド ID ─────────────────────────────────────────────────────────────
// 0x01 は接続通知で予約。0x01-0x11 は uiapruby が使用中のため 0x20 以降を使う。
#define CMD_CONNECT       0x01
#define CMD_PING          0x20
#define CMD_PIN_MODE      0x21
#define CMD_DIGITAL_WRITE 0x22
#define CMD_DIGITAL_READ  0x23
#define CMD_ANALOG_WRITE  0x24
#define CMD_ANALOG_READ   0x25

// ── 触ってはいけないピン ────────────────────────────────────────────────────
// D13 / D14 は USB D+ / D-。触ると USB が落ちて Scratch との接続が切れる。
// D17 は RESET。
#define PIN_USB_DP 13
#define PIN_USB_DM 14
#define PIN_RESET  17

// アナログ入力側の禁止チャンネル。A4 = D13、A7 = D14 で USB ピンと同じ。
#define ADC_USB_DP 4
#define ADC_USB_DM 7

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

/** デジタルピンとして使ってよいか */
static bool digitalPinOk(uint8_t pin) {
  if (pin >= NUM_DIGITAL_PINS) return false;
  return pin != PIN_USB_DP && pin != PIN_USB_DM && pin != PIN_RESET;
}

/** アナログ入力チャンネルとして使ってよいか（0-7 の A 番号） */
static bool analogChannelOk(uint8_t ch) {
  if (ch >= NUM_ANALOG_INPUTS) return false;
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

void setup() {
  WebHID.begin();
  delay(2000);  // USB 列挙待ち

  uint8_t ready[8] = { READY_MARKER, 0, 0, 0, 0, 0, 0, 0 };
  WebHID.send(ready, 8);
}

void loop() {
  // 必要なのは先頭 3 バイトだけなので 8 バイトで受ける（RAM 2KB のため）
  uint8_t buf[8];
  if (WebHID.recv(buf, sizeof(buf)) == 0) return;

  uint8_t cmd = buf[0];
  uint8_t pin = buf[1];
  uint8_t val = buf[2];

  // 接続通知は WaitAvailable() を解除するためだけのもの。応答しない。
  if (cmd == CMD_CONNECT) return;

  if (cmd == CMD_PING) {
    // バージョンを DATA で返す。RSP_OK だけを返す古いスケッチとはここで区別される。
    rsp_value(PROTOCOL_VERSION, 1);
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

    case CMD_ANALOG_WRITE:
      // analogWrite() は使わない。CH32V003 では HardwareTimer を丸ごと
      // 引き込んで Flash を 2KB 以上食う上に、
      //   - TIM1 と TIM2 の両方に使うと operator new のプールが枯れて無言でフリーズする
      //   - analogWrite → pinMode → analogWrite の往復で RAM が減り続ける
      // という問題がある。Scratch のブロックはどちらも普通にやってしまう。
      // 詳細は arduino_core_ch32 の README「CH32V003 では analogWrite() を使わないでください」。
      if (pwmPinOk(pin)) {
        Pwm_write(pin, val);
        rsp_ok();
      } else {
        // 黙ってデジタル出力にフォールバックせず、はっきり失敗させる
        rsp_err();
      }
      break;

    default:
      rsp_err();
      break;
  }
}
