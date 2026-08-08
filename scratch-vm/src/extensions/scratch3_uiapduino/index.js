// scratch3-uiapduino / index.js
// Created by tarosay (2026)
//
// ブロック定義。scratch3-tello の index.js と同じ構造。
// 通信のことは一切知らず、uiapduinoProcessor に投げるだけ。

// ⚠ このファイルと uiapduinoProcessor.js だけは ESM (import/export) で書く。
//   scratch-vm 本体は CommonJS (require/module.exports) だが、この 2 つは
//   Xcratch 版 (rollup) とデスクトップ版 (webpack) で共有する。
//   webpack は両形式を読めるのに対し rollup は ESM が前提なので、
//   ESM に寄せておけば 1 つのファイルを両方のビルドへ出せる。
//
//   この形式にしたことで、extension-support/extension-manager.js からの取り込みが
//   require('...').default になっている。戻すならあちらも直すこと。
import ArgumentType from '../../extension-support/argument-type';
import BlockType from '../../extension-support/block-type';
import Cast from '../../util/cast';
import defaultFormatMessage from 'format-message';

import UiapduinoProcessor, {
    CMD, MOUSE_BUTTON, REASON, PROTOCOL_VERSION, SKETCH_VARIANT
} from './uiapduinoProcessor';

/**
 * 表示中の言語を知るための formatMessage。
 *
 * デスクトップ版では、拡張も GUI も同じ format-message を共有しているので
 * import したものがそのまま使える。
 *
 * Xcratch では拡張が 1 枚の .mjs に固められ、その中の format-message は
 * GUI のものとは別インスタンスになる。そのままだと locale が既定値のままになり、
 * 日本語を選んでいてもブロックが英語で出る。Xcratch はこれを避けるために
 * 読み込み時に自分の formatMessage を渡してくるので、来たら差し替える。
 * @type {Function}
 */
let formatMessage = defaultFormatMessage;

/**
 * 拡張機能 ID。
 *
 * getInfo() の id、Peripheral Extension API への登録、接続喪失イベントの payload で
 * 同じ値を使う。ここがずれるとステータスボタンが別拡張を見に行く。
 * @type {string}
 */
const EXTENSION_ID = 'uiapduino';

/**
 * Xcratch にモジュールとして読み込ませたときの、このモジュール自身の URL。
 *
 * Xcratch は読み込み時に実際の URL をここへ書き込み、プロジェクトにも保存する。
 * 次にそのプロジェクトを開いたとき、この URL から拡張を読み直す。
 * ここに書いてある値は、書き込まれなかった場合の保険。
 *
 * ⚠ この URL は公開したら二度と変えられない。保存されたプロジェクトが
 *   ここから拡張機能を読み直すため、変えると古い作品が開けなくなる。
 *
 *   だから「それが何か」だけで組み立ててある。ビルドの都合 (xcratch/ や dist/) は
 *   入れていない。中の構成を変えても、成果物をこの置き場へ持ってくれば URL は動かない。
 *   実体は docs/uiapduino.mjs で、GitHub Pages の公開元を /docs にしてある。
 *
 *   xcratch/src/gui/.../entry/index.jsx の extensionURL と必ず同じ値にすること。
 * @type {string}
 */
let extensionURL = 'https://tarosay.github.io/scratch3-uiapduino/uiapduino.mjs';

/**
 * ブロック左端に表示するアイコン (data URI)。
 *
 * 実体は scratch-gui 側の
 * src/lib/libraries/extensions/uiapduino/uiapduino-small.png (80x80, 背景透明) と同じ。
 * scratch-vm は画像ファイルを import できないため data URI で埋め込んでいる。
 * 画像を差し替えたら base64 も入れ直すこと。
 * @type {string}
 */
// eslint-disable-next-line max-len
const blockIconURI = 'data:image/png;base64,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';

/**
 * キーボードのブロックに表示するアイコン (data URI)。
 *
 * 実体は scratch-gui 側の
 * src/lib/libraries/extensions/uiapduino/keyboard-small.png (80x80, 背景透明) と同じ。
 *
 * ブロックごとに blockIconURI を指定すると、拡張機能のアイコンより優先される
 * (scratch-vm の runtime.js: blockInfo.blockIconURI || categoryInfo.blockIconURI)。
 *
 * ⚠ 基板の絵ではなく「動かす物」の絵にしてある。
 *   これらのブロックは Scratch の中ではなく PC 本体のキーボードを動かす。
 *   [ ] と言う のような Scratch の中で完結するブロックと並んだときに、
 *   本物のキーボードが打たれることが一目で分かるようにするため。
 * @type {string}
 */
// eslint-disable-next-line max-len
const keyboardIconURI = 'data:image/png;base64,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';

/**
 * マウスのブロックに表示するアイコン (data URI)。
 *
 * 実体は scratch-gui 側の
 * src/lib/libraries/extensions/uiapduino/mouse-small.png (80x80, 背景透明) と同じ。
 * 理由は keyboardIconURI と同じ。
 * @type {string}
 */
// eslint-disable-next-line max-len
const mouseIconURI = 'data:image/png;base64,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';
/**
 * ブロックパレットのカテゴリ見出しに表示するアイコン (data URI)。
 * ブロック左端と同じ絵でよいので使い回す。
 * @type {string}
 */
const menuIconURI = blockIconURI;

/**
 * `KEY_TEXT` の 1 コマンドに載せられる文字数。
 *
 * Feature Report は 32 バイトで、[0] がコマンド ID、[1] がフラグ、[2..] が本文。
 * 本文に使えるのは [2..31] の 30 バイトに見えるが、デバイス側が
 * `buf[31] = 0` で終端を強制するため、実際に置けるのは [2..30] の 29 バイト。
 *
 * 30 文字入れると最後の 1 文字だけが消える。気づきにくい壊れ方なので、
 * ここを変えるときはデバイス側 ScratchUiapduino.ino の CMD_KEY_TEXT も見ること。
 * @type {number}
 */
const KEY_TEXT_CHUNK = 29;

/**
 * `KEY_TEXT` のフラグ「続きあり」。
 *
 * デバイス側は現状このフラグを読んでいない。29 文字ずつ切って順に送れば、
 * processor のキューが直列化するのでそのまま順番にタイプされる。
 * 将来デバイス側が見るようになったときのために立てておく。
 * @type {number}
 */
const KEY_TEXT_MORE = 0x80;

/**
 * 「[ ] を押しながら〔 〕」で押したままにする修飾キー。
 *
 * 値は arduino_core_ch32 の Keyboard.h の定数 (KEY_LEFT_CTRL 〜 KEY_LEFT_GUI) で、
 * そのまま `KEY_PRESS` / `KEY_RELEASE` のキーコードとして渡す。
 * @type {object}
 */
const KEY_MODIFIER = {
    CTRL: 0x80,
    SHIFT: 0x81,
    ALT: 0x82,
    GUI: 0x83
};

/** `KEY_WRITE` の既定値。Enter (arduino_core_ch32 の KEY_RETURN)。 */
const KEY_CODE_ENTER = 0xB0;

/**
 * メニュー項目を 1 つ作る。値は文字列でなければならない。
 * @param {string} text - 画面に出る文字列
 * @param {number} code - Keyboard.h の定数
 * @returns {{text: string, value: string}} メニュー項目
 */
const keyItem = (text, code) => ({text: text, value: String(code)});

/**
 * 「[ ] キーを押して離す」のメニュー。値は arduino_core_ch32 の Keyboard.h の定数。
 *
 * キー名は日本語にせず英字のまま出す。キートップの刻印と一致する方が分かりやすい。
 *
 * 修飾キー単体 (0x80 LeftCtrl 〜 0x87 RightGUI) は入れない。単体で押しても
 * 意味がなく、押しっぱなしを作る道具にしかならないため。
 * @type {Array<{text: string, value: string}>}
 */
const KEY_MENU_ITEMS = [
    keyItem('Enter', KEY_CODE_ENTER),
    keyItem('Tab', 0xB3),
    keyItem('Backspace', 0xB2),
    keyItem('Delete', 0xD4),
    keyItem('Esc', 0xB1),
    keyItem('↑', 0xDA),
    keyItem('↓', 0xD9),
    keyItem('←', 0xD8),
    keyItem('→', 0xD7),
    keyItem('Home', 0xD2),
    keyItem('End', 0xD5),
    keyItem('PageUp', 0xD3),
    keyItem('PageDown', 0xD6),
    keyItem('Insert', 0xD1),
    // F1 (0xC2) から F12 (0xCD) まで連番
    ...Array.from({length: 12}, (unused, i) => keyItem(`F${i + 1}`, 0xC2 + i)),
    keyItem('CapsLock', 0xC1),
    keyItem('NumLock', 0xDB),
    keyItem('PrintScreen', 0xCE)
];

/**
 * 「サーボ [ ] を [ ] 度にする」のピンのメニュー。
 *
 * PWM を出せる 5 本だけを並べる。Tools → PWM = TIM2 Default のときの
 * TIM1 = D0 / D5 / D6 / D12、TIM2 = D2 がそれにあたる。
 * 数値入力にしていないのは、サーボの繋がらないピンを選べてしまうため。
 *
 * ⚠ 表記と値が食い違って見えるが、間違いではない。
 *   基板のシルクは PA1 = A1、PC4 = A2、PD2 = A3 で、Arduino 番号は 0 / 6 / 12。
 *   基板に書いてある名前で選ばせ、デバイスへは Arduino 番号を送る。
 *
 *   この A1 / A2 / A3 は「A1 の値」のアナログ入力ブロックと同じ物理ピンを指す
 *   (ADC のチャンネル 1 / 2 / 3 が PA1 / PC4 / PD2)。表記は揃っている。
 *
 * D2 はオンボード LED でもあるので、繋がなくても動きが確かめられる。既定値にしてある。
 * @type {Array<{text: string, value: string}>}
 */
const SERVO_PIN_ITEMS = [
    {text: '2', value: '2'},
    {text: '5', value: '5'},
    {text: 'A1', value: '0'},
    {text: 'A2', value: '6'},
    {text: 'A3', value: '12'}
];

/**
 * サーボの角度の上限。
 * @type {number}
 */
const SERVO_ANGLE_MAX = 180;

/**
 * 「ピン [ ] の出力を [ ] にする」で使う周波数 (Hz)。
 *
 * デバイスは周波数を覚えないので、PWM を出すたびに渡す必要がある。
 * サーボが同じタイマーを 50Hz にしていても、これで 1000Hz に戻る。
 * 50Hz のままだと LED が目に見えてちらつく。
 * @type {number}
 */
const PWM_FREQ_HZ = 1000;

/**
 * サーボ設定の既定値。「サーボの設定」ブロックを置かなければこれが使われる。
 *
 * 50Hz・500〜2270µs は手元の SG-90 で 0〜180° が収まった範囲。duty では 6〜29。
 *
 * 可動域はサーボごとに違うので、この値が正しいわけではない。合わないサーボは
 * 「サーボの設定」ブロックで変えられる。uiapruby が生成するファームは
 * 0.5〜2.4ms を使っているが、そちらには合わせていない。
 * @type {{freqHz: number, minUs: number, maxUs: number}}
 */
const SERVO_DEFAULT = {
    freqHz: 50,
    minUs: 500,
    maxUs: 2270
};

/**
 * PWM の分解能。Pwm_write() の duty は 0-255 で、周期は 256 目盛。
 *
 * ⚠ この 8bit がサーボの刻みを決めている。50Hz なら 1 目盛 = 20000/256 = 78µs で、
 *   500〜2270µs の間に 23 段階しか入らない (角度なら約 7.8° 刻み)。
 *   µs は 1 刻みで書けるのに出力は 78µs 刻みにしか落ちないので、
 *   2270 と 2300 は同じ duty になる。周波数を上げれば細かくなる。
 * @type {number}
 */
const PWM_STEPS = 256;

/**
 * duty の上限。Pwm_write() は uint8 を取り、ATRLR = 255 で 1 周する。
 * @type {number}
 */
const PWM_DUTY_MAX = 255;

/**
 * 距離計 (HC-SR04) の既定のピン。
 *
 * ⚠ uiap-hid-web の README の配線例 (TRIG→pin3 / ECHO→pin4) とは逆。
 *   実機で扱いやすい向きがこちらだったため (2026-08-09)。
 *   HC-SR04 のピン並びは VCC / Trig / Echo / GND なので、
 *   基板の D3 / D4 に対して Echo=D3 / Trig=D4 の方が線が交差しない。
 * @type {{trig: number, echo: number}}
 */
const DISTANCE_DEFAULT = {trig: 4, echo: 3};

/**
 * 往復時間 (µs) を cm にする除数。
 *
 * 音速 340m/s = 29µs/cm で、超音波は往復するので 58µs/cm。
 * uiap-hid-web の UIAPrubyVmUs.ino が使っている 2784 は 48 × 58 で、
 * あちらは SysTick の tick から直接 cm にしているぶん 48 が掛かっている。
 * @type {number}
 */
const US_PER_CM = 58;

/**
 * スケッチの入手先。説明ブロックとコンソールの両方がここを案内する。
 *
 * リポジトリ内のパスを案内してはいけない。Xcratch の利用者は URL を貼っただけで、
 * リポジトリを見ていない。スケッチはリリースに sketch.zip として同梱してあり、
 * 「アプリとスケッチは必ず同じリリースの組み合わせで使う」のが決めごとなので、
 * 常に最新リリースを指す。
 * @type {string}
 */
const SKETCH_RELEASE_URL = 'https://github.com/tarosay/scratch3-uiapduino/releases/latest';

/**
 * ブロックの既定ピンについて。
 *
 * CH32V003 では D13 = USB D+ / D14 = USB D- / D17 = RESET で、触ると USB が落ちる。
 * デバイス側スケッチが弾いて RSP_ERR を返すので害はないが、既定値には使えない。
 *
 *   D2  オンボード LED。TIM2 (PWM) でもあるので出力系の既定値はここに揃える
 *   D3  空きピン。入力系の既定値
 *   A0  PA2 (= D1)。アナログ入力の既定値
 *
 * PWM を出せるのは Tools → PWM = TIM2 Default のとき D0 / D2 / D5 / D6 / D12 のみ。
 */
const message = {
    // WebHID を持たないブラウザで開かれたときに、パレットの先頭へ出す 1 行。
    //
    // Firefox や Safari には WebHID が無い。それでも拡張は追加できてブロックも並び、
    // 接続だけが失敗する。しかも接続モーダルは Xcratch の持ち物で、上流の文言は
    // 「デバイスが見つかりませんでした」または「Scratch Link をインストールしてください」
    // しか出せない。原因 (WebHID is not available) は console にしか出ない。
    //
    // つまり利用者から見ると、正しく追加できたのに繋がらず、理由がどこにも出ない。
    // getInfo() が返すブロックの一覧だけはこちらの持ち物なので、そこに出す。
    browserNotSupported: {
        ja: '⚠ このブラウザでは UIAPduino につなげません',
        'ja-Hira': '⚠ このブラウザでは UIAPduino に つなげません',
        en: '⚠ This browser cannot connect to UIAPduino'
    },
    browserNotSupportedWhy: {
        ja: 'このブラウザに WebHID という しくみが ないためです',
        'ja-Hira': 'このブラウザに WebHID という しくみが ないためです',
        en: 'It does not support WebHID'
    },
    browserNotSupportedHow: {
        ja: '同じ URL を Chrome か Edge で開くと つながります',
        'ja-Hira': 'おなじ URL を Chrome か Edge で ひらくと つながります',
        en: 'Open the same URL in Chrome or Edge to connect'
    },
    // 基板のスケッチが噛み合わないときに、ブロックの代わりに出す 3 行。
    // browserNotSupported* と同じ役割で、出し方も同じ (getInfo() を参照)。
    sketchOutdated: {
        ja: '⚠ 基板のスケッチが合わないので つながりません',
        'ja-Hira': '⚠ きばんの スケッチが あわないので つながりません',
        en: '⚠ Cannot connect: the sketch on the board does not match'
    },
    sketchOutdatedHow: {
        ja: '新しいスケッチの(ScratchUiapduino.ino)を書き込んでください。',
        'ja-Hira': 'あたらしい スケッチの(ScratchUiapduino.ino)を かきこんでください。',
        en: 'Flash the new sketch (ScratchUiapduino.ino).'
    },
    // 焼くべきスケッチがどれかを見分けるための番号。
    // 焼き直したのに直らないとき、本当に新しいものを焼いたのかがこれで分かる。
    sketchProtocolLabel: {
        ja: '新しいプロトコルバージョン',
        'ja-Hira': 'あたらしい プロトコルバージョン',
        en: 'new protocol version'
    },
    sketchVariantLabel: {
        ja: 'この拡張機能が使う版',
        'ja-Hira': 'この かくちょうきのうが つかう はん',
        en: 'variant this extension uses'
    },
    // 版違い。焼き直しでは直らないことがあるので、別の言い方にする。
    // 理由は uiapduinoProcessor.js の REASON.VARIANT_MISMATCH のコメント。
    sketchVariant: {
        ja: '⚠ この基板には別の版のスケッチが焼かれています',
        'ja-Hira': '⚠ この きばんには べつの はんの スケッチが やかれています',
        en: '⚠ This board is running a different variant of the sketch'
    },
    sketchVariantHow: {
        ja: 'その版に対応した拡張機能を使うか、書き込み直してください',
        'ja-Hira': 'その はんに たいおうした かくちょうきのうを つかうか、かきこみなおしてください',
        en: 'Use the extension for that variant, or reflash the board'
    },
    connect: {
        ja: 'UIAPduino につなぐ',
        'ja-Hira': 'UIAPduino につなぐ',
        en: 'connect to UIAPduino'
    },
    isConnected: {
        ja: 'つながっている',
        'ja-Hira': 'つながっている',
        en: 'connected'
    },
    pinMode: {
        ja: 'ピン [PIN] を [MODE] にする',
        'ja-Hira': 'ピン [PIN] を [MODE] にする',
        en: 'set pin [PIN] to [MODE]'
    },
    digitalWrite: {
        ja: 'ピン [PIN] を [VALUE] にする',
        'ja-Hira': 'ピン [PIN] を [VALUE] にする',
        en: 'set digital pin [PIN] to [VALUE]'
    },
    digitalRead: {
        ja: 'ピン [PIN] が入っている',
        'ja-Hira': 'ピン [PIN] がはいっている',
        en: 'digital pin [PIN] is on'
    },
    analogWrite: {
        ja: 'ピン [PIN] の出力を [VALUE] にする',
        'ja-Hira': 'ピン [PIN] のしゅつりょくを [VALUE] にする',
        en: 'set analog pin [PIN] to [VALUE]'
    },
    analogRead: {
        ja: 'ピン [PIN] の値',
        'ja-Hira': 'ピン [PIN] のあたい',
        en: 'analog pin [PIN] value'
    },
    analogA0: {
        ja: 'A0 の値',
        'ja-Hira': 'A0 のあたい',
        en: 'A0 value'
    },
    analogA1: {
        ja: 'A1 の値',
        'ja-Hira': 'A1 のあたい',
        en: 'A1 value'
    },
    analogA2: {
        ja: 'A2 の値',
        'ja-Hira': 'A2 のあたい',
        en: 'A2 value'
    },
    analogA3: {
        ja: 'A3 の値',
        'ja-Hira': 'A3 のあたい',
        en: 'A3 value'
    },
    servo: {
        ja: 'サーボ [PIN] を [ANGLE] 度にする',
        'ja-Hira': 'サーボ [PIN] を [ANGLE] どにする',
        en: 'set servo [PIN] to [ANGLE] degrees'
    },
    servoConfig: {
        ja: 'サーボの設定 周波数 [FREQ] Hz 範囲 [MIN] 〜 [MAX] µs',
        'ja-Hira': 'サーボの せってい しゅうはすう [FREQ] Hz はんい [MIN] 〜 [MAX] µs',
        en: 'configure servo: [FREQ] Hz, pulse [MIN] to [MAX] µs'
    },
    distance: {
        ja: '距離',
        'ja-Hira': 'きょり',
        en: 'distance'
    },
    // Echo を先に置いてある。基板の D3 / D4 に対して
    // Echo=D3 / Trig=D4 と繋ぐと線が交差しないので、その並びに合わせた。
    distanceConfig: {
        ja: '距離計(HC-SR04)の設定 Echo [ECHO] Trig [TRIG]',
        'ja-Hira': 'きょりけい(HC-SR04)の せってい Echo [ECHO] Trig [TRIG]',
        en: 'configure rangefinder (HC-SR04): Echo [ECHO] Trig [TRIG]'
    },
    keyType: {
        ja: 'キーボードで [TEXT] と打つ',
        'ja-Hira': 'キーボードで [TEXT] とうつ',
        en: 'type [TEXT] on the keyboard'
    },
    keyWrite: {
        ja: 'キーボードの [KEY] キーを押して離す',
        'ja-Hira': 'キーボードの [KEY] キーをおしてはなす',
        en: 'press and release [KEY] on the keyboard'
    },
    keyModifierWhile: {
        ja: 'キーボードの [MOD] を押しながら',
        'ja-Hira': 'キーボードの [MOD] をおしながら',
        en: 'hold [MOD] on the keyboard while'
    },
    mouseMove: {
        ja: 'マウスを 右へ [X] 下へ [Y] 動かす',
        'ja-Hira': 'マウスを みぎへ [X] したへ [Y] うごかす',
        en: 'move mouse right [X] down [Y]'
    },
    mouseClick: {
        ja: 'マウスの [BUTTON] ボタンをクリックする',
        'ja-Hira': 'マウスの [BUTTON] ボタンをクリックする',
        en: 'click the [BUTTON] mouse button'
    },
    mouseDoubleClick: {
        ja: 'マウスの [BUTTON] ボタンでダブルクリックする',
        'ja-Hira': 'マウスの [BUTTON] ボタンでダブルクリックする',
        en: 'double-click the [BUTTON] mouse button'
    },
    mouseDrag: {
        ja: 'マウスの [BUTTON] ボタンで 右へ [X] 下へ [Y] ドラッグする',
        'ja-Hira': 'マウスの [BUTTON] ボタンで みぎへ [X] したへ [Y] ドラッグする',
        en: 'drag with the [BUTTON] mouse button right [X] down [Y]'
    },
    mouseDragWhile: {
        ja: 'マウスの [BUTTON] ボタンでドラッグしながら',
        'ja-Hira': 'マウスの [BUTTON] ボタンでドラッグしながら',
        en: 'drag with the [BUTTON] mouse button while'
    },
    mouseWheel: {
        ja: 'マウスのホイールを [DIR] に [COUNT] 回す',
        'ja-Hira': 'マウスのホイールを [DIR] に [COUNT] まわす',
        en: 'scroll the mouse wheel [DIR] by [COUNT]'
    },
    releaseAllInput: {
        ja: 'キーとマウスをすべて離す',
        'ja-Hira': 'キーとマウスをぜんぶはなす',
        en: 'release all keys and mouse buttons'
    },
    clearQueue: {
        ja: '実行待ちのコマンドをクリアする',
        'ja-Hira': 'うごくのをまっているコマンドをなくす',
        en: 'clear command queue'
    },
    modeInput: {
        ja: '入力',
        'ja-Hira': 'にゅうりょく',
        en: 'input'
    },
    modeInputPullup: {
        ja: '入力（プルアップ）',
        'ja-Hira': 'にゅうりょく（プルアップ）',
        en: 'input pullup'
    },
    modeOutput: {
        ja: '出力',
        'ja-Hira': 'しゅつりょく',
        en: 'output'
    },
    on: {
        ja: 'オン',
        'ja-Hira': 'オン',
        en: 'on'
    },
    off: {
        ja: 'オフ',
        'ja-Hira': 'オフ',
        en: 'off'
    },
    buttonLeft: {
        ja: '左',
        'ja-Hira': 'ひだり',
        en: 'left'
    },
    buttonRight: {
        ja: '右',
        'ja-Hira': 'みぎ',
        en: 'right'
    },
    buttonMiddle: {
        ja: '真ん中',
        'ja-Hira': 'まんなか',
        en: 'middle'
    },
    wheelUp: {
        ja: '上',
        'ja-Hira': 'うえ',
        en: 'up'
    },
    wheelDown: {
        ja: '下',
        'ja-Hira': 'した',
        en: 'down'
    }
};

/**
 * Class for the UIAPduino
 * @param {Runtime} runtime - the runtime instantiating this block package.
 * @constructor
 */
class Scratch3Uiapduino {
    /**
     * Xcratch がモジュール読み込み時に呼ぶ。GUI の formatMessage を受け取る。
     * デスクトップ版では誰も呼ばないので、import したものが使われ続ける。
     * @param {Function} formatter - GUI 側の formatMessage
     */
    static set formatMessage (formatter) {
        if (formatter) formatMessage = formatter;
    }

    /**
     * Xcratch がモジュール読み込み時に、実際に読み込んだ URL を書き込む。
     * getInfo() で返すと、プロジェクトに「どこから読めばよいか」が残る。
     * デスクトップ版では拡張が組み込みなので、この値は使われない。
     * @param {string} url - このモジュールの URL
     */
    static set extensionURL (url) {
        if (url) extensionURL = url;
    }

    /** @returns {string} このモジュールの URL */
    static get extensionURL () {
        return extensionURL;
    }

    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        // Xcratch の runtime は自分の formatMessage を持っている。
        // scratch-vm 0.2.0 (デスクトップ版) は持っていないので、そのままになる。
        if (runtime.formatMessage) {
            formatMessage = runtime.formatMessage;
        }

        this.processor = new UiapduinoProcessor();

        /**
         * Scratch へ PERIPHERAL_CONNECTED を送った後かどうか。
         *
         * 意図的な切断と物理切断の両方から切断通知の経路があるので、
         * これが無いと PERIPHERAL_DISCONNECTED を二重に送る。
         * @type {boolean}
         */
        this._notifiedConnected = false;

        /**
         * アナログ入力の直前の読み取り値。チャンネル番号で引く。
         *
         * 読み取りに失敗したときの表示に使う。停止ボタンを押すと実行待ちの
         * コマンドを捨てるので、そのとき飛んでいた読み取りも巻き添えで失敗する。
         * そこで 0 を出すと、センサーの値が一瞬 0 に落ちたように見えてしまう。
         * @type {Array<number>}
         */
        this._lastAnalog = [0, 0, 0, 0];

        /**
         * サーボの設定。「サーボの設定」ブロックが書き換える。
         *
         * デバイスは何も覚えない。角度 → パルス幅 → duty の変換はすべてここで行い、
         * デバイスへは duty と周波数だけを送る。
         *
         * そうしている理由は、サーボごとに可動域が違うため。デバイス側に持たせると
         * サーボを変えるたびに基板を焼き直すことになり、Scratch の利用者にはできない。
         * ここに置けばブロックを 1 つ置くだけで変えられる。
         *
         * プロジェクトには保存されない。緑の旗のたびに既定値へ戻したくはないので
         * リセットもしない。設定ブロックを置いた作品は、実行のたびにそれが走る。
         * @type {{freqHz: number, minUs: number, maxUs: number}}
         */
        this._servo = Object.assign({}, SERVO_DEFAULT);

        /**
         * 距離計 (HC-SR04) の Trig / Echo ピン。「距離計の設定」ブロックが書き換える。
         *
         * ここに持たせてあるので、`距離` ブロックが引数を持たずに済む。
         * scratch-vm は「引数を 1 つも持たないレポーター」にしか
         * パレットのチェックボックスを出さないため、これが無いと
         * ステージに距離を表示できない。`A0 の値` を 4 つに分けてあるのと同じ理由。
         * @type {{trig: number, echo: number}}
         */
        this._distance = Object.assign({}, DISTANCE_DEFAULT);

        /**
         * 基板のスケッチが噛み合わなかったときの中身。噛み合っていれば null。
         *
         * `{reason, version, variant}` を持つ。getInfo() がこれを見て、
         * ブロックの代わりに説明を出す。WebHID の無いブラウザで navigator.hid を
         * 見ているのと同じ形で、見るものが違うだけ。
         *
         * ⚠ 判明するのは接続を試した後なので、getInfo() が最初に走る時点では
         *   まだ分からない。だから覚えておいて、パレットを組み直させる
         *   (_setSketchProblem() を参照)。
         * @type {?object}
         */
        this._sketchProblem = null;

        /**
         * キーかマウスのボタンを押したままにした心当たりがあるか。
         *
         * USB が抜かれたときに、OS 側の後始末が要るかどうかの判断に使う。
         * 「押したままにする」を送ったら立て、全部離したら倒す。
         * どのボタンが残っているかまでは数えない。多めに立っていても、
         * 押されていないボタンに「離した」を送るだけなので害はない。
         * @type {boolean}
         */
        this._inputHeld = false;

        /**
         * 「ドラッグしながら」の入れ子の深さ。
         *
         * マウスは 1 つしかないので、押すのは一番外側に入るときだけ、
         * 離すのは一番外側を抜けるときだけにする。これが無いと、内側の
         * 囲みを抜けた時点で離れてしまい、外側のドラッグが途切れる。
         * @type {number}
         */
        this._dragDepth = 0;

        /**
         * 押したままにしている修飾キーと、その囲みの入れ子の深さ。
         *
         * キーコード (KEY_MODIFIER のいずれか) から数を引く。
         * 同じ修飾キーの囲みを入れ子にできるので、押すのは 0 → 1 のときだけ、
         * 離すのは 1 → 0 のときだけにする。マウスの _dragDepth と同じ考え方だが、
         * Ctrl と Shift のように別の修飾キーは同時に押せるのでキーごとに数える。
         * @type {Map<number, number>}
         */
        this._modifierCounts = new Map();

        // USB が抜かれたら processor から呼ばれる。
        this.processor.onDisconnected = () => this._handleDisconnectError();

        // 停止ボタン (と緑の旗) で、キーとマウスのボタンを必ず離す。
        // 押しっぱなしのまま止まると PC が操作不能になり、利用者は
        // Scratch の停止ボタンを押すことすらできなくなる。
        this.runtime.on(this.runtime.constructor.PROJECT_STOP_ALL, () => this._releaseInput());

        // アプリを閉じるときにも離す。
        //
        // ただしこれは best-effort でしかない。beforeunload はページの後始末を
        // 待ってくれないので、Feature Report が飛ぶ前にウィンドウが閉じることがある。
        // 確実に離す役目はデバイス側の見張り (最後のコマンドから 5 秒) が負う。
        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('beforeunload', () => this._releaseInput());
        }

        // ステータスボタンと接続モーダルはこの登録が無いと動かない。
        this.runtime.registerPeripheralExtension(EXTENSION_ID, this);
    }

    /**
     * キーとマウスのボタンをすべて離す。
     *
     * 実行待ちを捨ててから離す。捨てないと、離した後にキューに残った
     * 移動やクリックが動き出して、離した意味が無くなる。
     *
     * @returns {Promise<void>} 離し終わったら resolve。失敗しても reject しない
     */
    _releaseInput () {
        this._inputHeld = false;
        // 「ドラッグしながら」「押しながら」の途中で止められた場合、2 回目の呼び出しは来ない。
        // 深さを戻しておかないと、次に押す処理が飛ばされる。
        this._dragDepth = 0;
        this._modifierCounts.clear();
        if (!this.processor.isConnected()) return Promise.resolve();
        this.processor.resetQueue();
        return this.processor.request(CMD.PANIC).catch(() => {});
    }

    /**
     * 押しっぱなしのまま USB が抜かれたときの後始末を、ホストに依頼する。
     *
     * ボタンを押したまま基板が居なくなると、mousedown を受け取ったウィンドウが
     * 「離された」を受け取れないまま取り残される。取り残されるのは
     * Scratch とは限らない。メモ帳を操作させている最中なら、メモ帳が残る。
     *
     * デバイス側にはもう何もできない。基板はバスから電源を取っているので、
     * 抜かれた時点で止まり、5 秒の見張りも動けない。
     * Scratch も居なくなったデバイスにはコマンドを送れない。
     *
     * 実際の処理は scratch-desktop の main プロセスが持つ。
     * 他アプリのドラッグを打ち切るために前面に出て、Scratch 自身のために
     * mouseUp を送る。OS への入力注入は使わない (理由は main 側のコメント)。
     *
     * ブラウザ版の scratch-gui には Electron が無いので、その場合は何もしない。
     *
     * @returns {void}
     */
    _releaseHeldInput () {
        if (!this._inputHeld) return;
        this._inputHeld = false;

        // require('electron') と直接書くと、Web 版の scratch-gui をビルドするときに
        // webpack が解決しようとして失敗する。実行時にだけ引ける window.require を使う。
        const nodeRequire = typeof window === 'undefined' ? null : window.require;
        if (!nodeRequire) return;

        try {
            nodeRequire('electron').ipcRenderer.send('uiapduino-release-held-input');
        } catch (e) {
            console.warn('[uiapduino] could not release the held input state:', e);
        }
    }

    _getText (key) {
        return message[key][this.locale] || message[key].en;
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        const currentLocale = formatMessage.setup().locale;
        if (Object.keys(message).filter(key => currentLocale in message[key]).length > 0) {
            this.locale = currentLocale;
        } else {
            this.locale = 'en';
        }

        const info = {
            id: EXTENSION_ID,
            // Xcratch がプロジェクトに保存する読み込み元。
            // scratch-vm 0.2.0 (デスクトップ版) はこの項目を見ないので影響しない。
            extensionURL: extensionURL,
            name: 'UIAPduino',
            menuIconURI: menuIconURI,
            blockIconURI: blockIconURI,
            // カテゴリ見出しに接続状態ボタンを出す。未接続なら「!」になる。
            showStatusButton: true,
            blocks: [
                {
                    opcode: 'connect',
                    // opcode は既存プロジェクト互換のため 'connect' のまま。
                    // 実装メソッドは Peripheral Extension API の connect(peripheralId) と
                    // 衝突するので connectBlock() へ分ける。
                    func: 'connectBlock',
                    text: this._getText('connect'),
                    blockType: BlockType.BOOLEAN
                },
                {
                    opcode: 'isConnected',
                    text: this._getText('isConnected'),
                    blockType: BlockType.BOOLEAN
                },
                '---',
                {
                    opcode: 'pinMode',
                    text: this._getText('pinMode'),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        PIN: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 2
                        },
                        MODE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1,
                            menu: 'MODE'
                        }
                    }
                },
                {
                    opcode: 'digitalWrite',
                    text: this._getText('digitalWrite'),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        PIN: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 2
                        },
                        VALUE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1,
                            menu: 'LEVEL'
                        }
                    }
                },
                {
                    opcode: 'digitalRead',
                    text: this._getText('digitalRead'),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        PIN: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 3
                        }
                    }
                },
                '---',
                {
                    opcode: 'analogWrite',
                    text: this._getText('analogWrite'),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        PIN: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 2
                        },
                        VALUE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 128
                        }
                    }
                },
                {
                    opcode: 'analogRead',
                    text: this._getText('analogRead'),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        PIN: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                },
                '---',
                // チャンネルごとに引数の無いレポーターを分けてある。
                // scratch-vm は「引数が 1 つも無いレポーター」にだけ
                // パレットのチェックボックス (checkboxInFlyout) を出すため、
                // 引数付きの analogRead ではステージに値を出せない。
                // ブロックを分ければ A0〜A3 を同時にステージ表示できる。
                {
                    opcode: 'analogA0',
                    text: this._getText('analogA0'),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'analogA1',
                    text: this._getText('analogA1'),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'analogA2',
                    text: this._getText('analogA2'),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'analogA3',
                    text: this._getText('analogA3'),
                    blockType: BlockType.REPORTER
                },
                '---',
                {
                    // 中身は PWM だが、専用のブロックにしてある。
                    // 「ピン [ ] の出力を [ ] にする」で同じことをさせるには
                    // duty 6-31 という数を利用者が知らなければならず、
                    // しかもその数は周波数を変えると意味が変わる。
                    //
                    // ⚠ 出せるのは PWM 対応の 5 本だけ。数値入力ではなくメニューにしてある。
                    //   詳細は SERVO_PIN_ITEMS のコメント。
                    opcode: 'servo',
                    text: this._getText('servo'),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        PIN: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 2,
                            menu: 'SERVO_PIN'
                        },
                        // ArgumentType.ANGLE は使わない。あれは「向き」を選ぶ
                        // 円盤で、上が 0、右回りに ±180 まで回る。サーボの
                        // 0-180 とは目盛の意味が違うので、素直な数値入力にする。
                        ANGLE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 90
                        }
                    }
                },
                {
                    // 置かなくても既定値 (SERVO_DEFAULT) で動く。
                    // サーボを変えて可動域が合わないときだけ置く。
                    //
                    // 周波数と µs 範囲を 1 つのブロックにまとめてあるのは、
                    // 3 つが互いに影響し合うため。周波数を上げると周期が縮むので、
                    // µs 範囲がそのままでは入り切らなくなる (servoConfig() を参照)。
                    // 別々のブロックにすると「半分だけ設定された状態」が作れてしまう。
                    opcode: 'servoConfig',
                    text: this._getText('servoConfig'),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        FREQ: {
                            type: ArgumentType.NUMBER,
                            defaultValue: SERVO_DEFAULT.freqHz
                        },
                        MIN: {
                            type: ArgumentType.NUMBER,
                            defaultValue: SERVO_DEFAULT.minUs
                        },
                        MAX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: SERVO_DEFAULT.maxUs
                        }
                    }
                },
                '---',
                {
                    // 引数を持たせていないのは、パレットにチェックボックスを出して
                    // ステージに距離を表示させるため。距離計は値を見ながら使うものなので、
                    // そこが効く。ピンは「距離計の設定」ブロックが持つ。
                    //
                    // 型番 (HC-SR04) をここに書いていないのは、毎回使う値の方を
                    // 短く保つため。型番が要るのは配線するときなので、設定ブロックに置いてある。
                    opcode: 'distance',
                    text: this._getText('distance'),
                    blockType: BlockType.REPORTER
                },
                {
                    // 置かなくても既定のピン (Echo=D3 / Trig=D4) で動く。
                    //
                    // Trig を出力にする pinMode は要らない。測るたびに
                    // デバイス側 measureEchoUs() が Trig=OUTPUT / Echo=INPUT にする。
                    // 設定した時点ではなく測る時点でやっているので、
                    // このブロックを置かない (既定ピンで使う) 場合も同じように効く。
                    opcode: 'distanceConfig',
                    text: this._getText('distanceConfig'),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        ECHO: {
                            type: ArgumentType.NUMBER,
                            defaultValue: DISTANCE_DEFAULT.echo
                        },
                        TRIG: {
                            type: ArgumentType.NUMBER,
                            defaultValue: DISTANCE_DEFAULT.trig
                        }
                    }
                },
                '---',
                // UIAPduino は HID なのでキーボードとマウスそのものになれる。
                // ここから下のブロックは Scratch ではなく PC 本体を操作する。
                //
                // 動く先はフォーカスのあるウィンドウなので、通常は Scratch 自身になる。
                // メモ帳などを操作させたいときは「n 秒待つ」を挟んで、その間に
                // 利用者が対象のウィンドウをクリックする、という組み方をする。
                //
                // ⚠ 「キーを押したままにする」「キーを離す」を単独のブロックとしては置かない。
                //   離すのを書き忘れると Shift や Ctrl が押されたまま残り、その後の
                //   すべてのキー入力が化ける。マウスのボタンと違って「どこかを 1 回
                //   クリックすれば消える」という逃げ道もないぶん、こちらの方が厄介。
                //
                //   マウスの「ドラッグしながら〔 〕」と同じく、押しっぱなしは
                //   囲みブロックの内側にだけ作れるようにしてある。囲みを抜ければ必ず離れる。
                {
                    opcode: 'keyType',
                    text: this._getText('keyType'),
                    blockIconURI: keyboardIconURI,
                    blockType: BlockType.COMMAND,
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'Hello UIAPduino'
                        }
                    }
                },
                {
                    opcode: 'keyWrite',
                    text: this._getText('keyWrite'),
                    blockIconURI: keyboardIconURI,
                    blockType: BlockType.COMMAND,
                    arguments: {
                        KEY: {
                            type: ArgumentType.NUMBER,
                            defaultValue: KEY_CODE_ENTER,
                            menu: 'KEY'
                        }
                    }
                },
                {
                    // 囲みブロック。中身の前後で修飾キーを押す・離すが自動的に行われる。
                    // マウスの「ドラッグしながら〔 〕」と同じ仕組み (BlockType.LOOP)。
                    //
                    // Ctrl + C は「Ctrl を押しながら〔 [c] とタイプする 〕」と書く。
                    opcode: 'keyModifierWhile',
                    text: this._getText('keyModifierWhile'),
                    blockIconURI: keyboardIconURI,
                    blockType: BlockType.LOOP,
                    arguments: {
                        MOD: {
                            type: ArgumentType.NUMBER,
                            defaultValue: KEY_MODIFIER.CTRL,
                            menu: 'MODIFIER'
                        }
                    }
                },
                '---',
                {
                    opcode: 'mouseMove',
                    text: this._getText('mouseMove'),
                    blockIconURI: mouseIconURI,
                    blockType: BlockType.COMMAND,
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        },
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'mouseClick',
                    text: this._getText('mouseClick'),
                    blockIconURI: mouseIconURI,
                    blockType: BlockType.COMMAND,
                    arguments: {
                        BUTTON: {
                            type: ArgumentType.NUMBER,
                            defaultValue: MOUSE_BUTTON.LEFT,
                            menu: 'BUTTON'
                        }
                    }
                },
                {
                    opcode: 'mouseDoubleClick',
                    text: this._getText('mouseDoubleClick'),
                    blockIconURI: mouseIconURI,
                    blockType: BlockType.COMMAND,
                    arguments: {
                        BUTTON: {
                            type: ArgumentType.NUMBER,
                            defaultValue: MOUSE_BUTTON.LEFT,
                            menu: 'BUTTON'
                        }
                    }
                },
                {
                    opcode: 'mouseDrag',
                    text: this._getText('mouseDrag'),
                    blockIconURI: mouseIconURI,
                    blockType: BlockType.COMMAND,
                    arguments: {
                        BUTTON: {
                            type: ArgumentType.NUMBER,
                            defaultValue: MOUSE_BUTTON.LEFT,
                            menu: 'BUTTON'
                        },
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        },
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                },
                {
                    // 囲みブロック。中身の前後で押す・離すが自動的に行われる。
                    // 直線 1 本では描けない円や折れ線を、中に「動かす」を並べて描くためのもの。
                    //
                    // BlockType.LOOP は「中身が終わったらもう一度呼ばれる」。
                    // repeat ブロックと同じ仕組みで、2 回目の呼び出しで離す。
                    opcode: 'mouseDragWhile',
                    text: this._getText('mouseDragWhile'),
                    blockIconURI: mouseIconURI,
                    blockType: BlockType.LOOP,
                    arguments: {
                        BUTTON: {
                            type: ArgumentType.NUMBER,
                            defaultValue: MOUSE_BUTTON.LEFT,
                            menu: 'BUTTON'
                        }
                    }
                },
                {
                    opcode: 'mouseWheel',
                    text: this._getText('mouseWheel'),
                    blockIconURI: mouseIconURI,
                    blockType: BlockType.COMMAND,
                    arguments: {
                        DIR: {
                            type: ArgumentType.NUMBER,
                            defaultValue: -1,
                            menu: 'WHEEL'
                        },
                        COUNT: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 3
                        }
                    }
                },
                {
                    opcode: 'releaseAllInput',
                    text: this._getText('releaseAllInput'),
                    blockType: BlockType.COMMAND
                },
                '---',
                {
                    opcode: 'clearQueue',
                    text: this._getText('clearQueue'),
                    blockType: BlockType.COMMAND
                }
            ],
            menus: {
                MODE: {
                    acceptReporters: true,
                    items: [
                        {text: this._getText('modeInput'), value: '0'},
                        {text: this._getText('modeOutput'), value: '1'},
                        {text: this._getText('modeInputPullup'), value: '2'}
                    ]
                },
                LEVEL: {
                    acceptReporters: true,
                    items: [
                        {text: this._getText('on'), value: '1'},
                        {text: this._getText('off'), value: '0'}
                    ]
                },
                // 表記は基板のシルク、値は Arduino 番号 (SERVO_PIN_ITEMS を見ること)。
                //
                // acceptReporters を true にしてあるので、変数からメニューに無い
                // 番号も入ってくる。デバイス側が PWM 非対応ピンを RSP_ERR で弾く。
                SERVO_PIN: {
                    acceptReporters: true,
                    items: SERVO_PIN_ITEMS
                },
                // 値は arduino_core_ch32 の Keyboard.h の定数 (KEY_MENU_ITEMS を見ること)
                KEY: {
                    acceptReporters: true,
                    items: KEY_MENU_ITEMS
                },
                // 値は Keyboard.h の KEY_LEFT_CTRL 〜 KEY_LEFT_GUI。
                // 名前は英字のまま出す。キートップの刻印と一致する方が分かりやすい。
                MODIFIER: {
                    acceptReporters: true,
                    items: [
                        {text: 'Ctrl', value: String(KEY_MODIFIER.CTRL)},
                        {text: 'Shift', value: String(KEY_MODIFIER.SHIFT)},
                        {text: 'Alt', value: String(KEY_MODIFIER.ALT)},
                        {text: 'Windows', value: String(KEY_MODIFIER.GUI)}
                    ]
                },
                // 値はデバイス側 Mouse.h の MOUSE_LEFT / RIGHT / MIDDLE と同じ
                BUTTON: {
                    acceptReporters: true,
                    items: [
                        {text: this._getText('buttonLeft'), value: String(MOUSE_BUTTON.LEFT)},
                        {text: this._getText('buttonRight'), value: String(MOUSE_BUTTON.RIGHT)},
                        {text: this._getText('buttonMiddle'), value: String(MOUSE_BUTTON.MIDDLE)}
                    ]
                },
                // USB HID のホイールは「奥に回す = 正」なので、上が +1 になる
                WHEEL: {
                    acceptReporters: true,
                    items: [
                        {text: this._getText('wheelDown'), value: '-1'},
                        {text: this._getText('wheelUp'), value: '1'}
                    ]
                }
            }
        };

        // WebHID が無いブラウザなら、説明だけを出して他のブロックは出さない。
        //
        // 接続できない以上、ピンもキーボードもマウスも動かない。並べておくと
        // 「置いたのに動かない」を試させることになる。接続モーダルは Xcratch の
        // 持ち物で「デバイスが見つかりませんでした」としか言えないので、
        // ここで止めるのが一番早く伝わる。
        //
        // 副作用は承知のうえで、こうすると決めてある (2026-08-08)。
        //
        // 保存済みのプロジェクトを非対応ブラウザで開くと、その中の UIAPduino の
        // ブロックは定義が無い状態になり、画面ではおかしな見た目になる。
        // それでよい。動かないブラウザで開けば動かないのは当たり前で、
        // 中途半端に並べて「置いたのに動かない」を試させる方が不親切だから。
        //
        // 読み込んでもディスク上の .sb3 は変わらない。失われるとしたら、
        // その状態で利用者が上書き保存したときだけ。
        //
        // だからここを「他のブロックも並べたうえで先頭に説明を足す」形へ戻さないこと。
        // 戻すのは、上書き保存で作品が失われる事例が実際に出たときだけでよい。
        if (typeof navigator === 'undefined' || !navigator.hid) {
            info.blocks = [
                'browserNotSupported',
                'browserNotSupportedWhy',
                'browserNotSupportedHow'
            ].map(key => ({
                opcode: key,
                blockType: BlockType.COMMAND,
                text: this._getText(key)
            }));
            info.menus = {};
            // 繋げないのだから、接続状態のボタンを出しても押させるだけになる。
            info.showStatusButton = false;
        }

        // 基板のスケッチが噛み合わないときも、上と同じ形で説明に差し替える。
        //
        // 違うのは「いつ分かるか」だけ。navigator.hid はブラウザに聞けば即答なので
        // getInfo() のその場で判定できるが、基板のバージョンは繋いでみないと
        // 分からない。だから _setSketchProblem() が覚えてから getInfo() を
        // 走らせ直す。ここへ来る頃には答えが揃っている。
        //
        // ⚠ showStatusButton は残す。焼き直した後に繋ぎ直す手段が要るため。
        //   消すと「つなぐ」ブロックもボタンも無くなり、やり直せなくなる。
        //   非対応ブラウザと違って、こちらは焼けば直る。
        if (this._sketchProblem) {
            const variant = this._sketchProblem.reason === REASON.VARIANT_MISMATCH;
            info.blocks = [
                this._getText(variant ? 'sketchVariant' : 'sketchOutdated'),
                this._getText(variant ? 'sketchVariantHow' : 'sketchOutdatedHow'),
                // 焼くべきものを見分けるための番号。基板側の番号は出さない。
                // 直すのに要るのは「何を焼けばよいか」であって、今何が焼かれて
                // いるかではない。基板側の番号はコンソールに出ている。
                variant ?
                    `${this._getText('sketchVariantLabel')}: ${SKETCH_VARIANT}` :
                    `${this._getText('sketchProtocolLabel')}: ${PROTOCOL_VERSION}`,
                SKETCH_RELEASE_URL
            ].map((text, i) => ({
                opcode: `sketchProblem${i}`,
                blockType: BlockType.COMMAND,
                text: text
            }));
            info.menus = {};
        }

        return info;
    }

    /**
     * 非対応ブラウザで出す説明ブロックの実装。
     *
     * 置いてあるのは説明のためで、動作は持たない。
     * opcode に対する実装が無いと Scratch VM が警告を出すので用意している。
     * @returns {void}
     */
    browserNotSupported () {
        // 何もしない
    }

    /** @returns {void} 説明ブロック (理由)。動作は持たない */
    browserNotSupportedWhy () {
        // 何もしない
    }

    /** @returns {void} 説明ブロック (対処)。動作は持たない */
    browserNotSupportedHow () {
        // 何もしない
    }

    /** @returns {void} スケッチが噛み合わないときの説明ブロック。動作は持たない */
    sketchProblem0 () {
        // 何もしない
    }

    /** @returns {void} 同上 (バージョン番号) */
    sketchProblem1 () {
        // 何もしない
    }

    /** @returns {void} 同上 (対処) */
    sketchProblem2 () {
        // 何もしない
    }

    /** @returns {void} 同上 (入手先の URL) */
    sketchProblem3 () {
        // 何もしない
    }

    // --- Peripheral Extension API ---------------------------------------
    // ステータスボタンと接続モーダルから Scratch VM 経由で呼ばれる。
    // ブロックの opcode ではないので getInfo() には出てこない。

    /**
     * 接続モーダルの検索ステップから呼ばれる。
     *
     * Bluetooth 機器と違い、UIAPduino は 1 台だけを前提にした WebHID なので
     * デバイス一覧 (PERIPHERAL_LIST_UPDATE) は作らない。
     * 検索ステップは「検索中」のまま待ち、接続に成功した時点で
     * PERIPHERAL_CONNECTED を受けて接続済み画面へ進む。
     *
     * @returns {Promise<object>} processor の接続結果
     */
    scan () {
        return this._connectAndNotify(true);
    }

    /**
     * デバイス一覧から機器を選ぶ標準経路で呼ばれる Peripheral Extension API。
     *
     * 本拡張は一覧を出さないため通常は呼ばれないが、
     * 登録した API の契約として実装しておく。
     *
     * @param {string} [peripheralId] - 一覧で選ばれた機器の ID。単一接続なので使用しない
     * @returns {Promise<object>} processor の接続結果
     */
    connect (peripheralId) { // eslint-disable-line no-unused-vars
        return this._connectAndNotify(false);
    }

    /**
     * 接続モーダルの「切断」から呼ばれる。
     *
     * Scratch VM 3.29 の disconnectPeripheral() は戻り値の Promise を待たないので、
     * 失敗はここで処理して外へ投げない。
     *
     * 閉じる前に必ずキーとマウスを離す。押しっぱなしのまま閉じると、
     * 基板は生きているので見張りが働くまでの 5 秒間ボタンが押されたままになる。
     *
     * @returns {Promise<void>} 切断完了
     */
    disconnect () {
        return this._releaseInput()
            .then(() => this.processor.disconnect())
            .catch(e => {
                console.warn('[uiapduino] disconnect failed:', e);
            })
            .then(() => {
                // 利用者が自分で切ったので、接続喪失の警告は出さない。
                this._emitDisconnected();
            });
    }

    /**
     * 接続済みかどうか。
     *
     * ブロック「つながっている」と Scratch GUI のステータスボタンが共用する。
     * GUI は同期的に読むので Promise を返してはいけない。
     *
     * @returns {boolean} ハンドシェイクまで終わっていれば true
     */
    isConnected () {
        return this.processor.isConnected();
    }

    // --- 接続処理と Scratch への通知 ------------------------------------

    /**
     * 接続して、結果に応じて Scratch へ通知する。
     *
     * scan()、Peripheral API の connect()、ブロックの connectBlock() が共用する。
     * 接続成功の通知先を 1 箇所にまとめて、経路ごとの食い違いを防ぐ。
     *
     * @param {boolean} fromScan - 接続モーダルの検索から呼ばれたか
     * @returns {Promise<object>} processor の接続結果 {ok, reason?, error?}
     */
    /**
     * 基板のスケッチが噛み合ったか / 噛み合わなかったかを覚え、パレットを組み直させる。
     *
     * `getInfo()` は拡張機能を追加した瞬間に 1 回走るだけで、そのときはまだ
     * 基板に繋いでいないのでバージョンが分からない。分かるのは接続を試した後なので、
     * ここで覚えてから、もう一度 `getInfo()` を走らせる。
     *
     * `TOOLBOX_EXTENSIONS_NEED_UPDATE` は VM が待ち受けていて、受け取ると
     * `extensionManager.refreshBlocks()` → 各拡張の `getInfo()` 呼び直し →
     * `BLOCKSINFO_UPDATE` でパレット更新、と伝わる (virtual-machine.js)。
     * 拡張機能から `extensionManager` へは届かないので、この経路を使う。
     *
     * 変化が無いときは何もしない。接続のたびにパレットを組み直すと、
     * 置いてあるブロックが毎回作り直されて重い。
     *
     * @param {?object} problem - 噛み合わない中身。噛み合っていれば null
     * @returns {void}
     */
    _setSketchProblem (problem) {
        const before = this._sketchProblem && this._sketchProblem.reason;
        const after = problem && problem.reason;
        if (before === after) return;
        this._sketchProblem = problem;
        this.runtime.emit(this.runtime.constructor.TOOLBOX_EXTENSIONS_NEED_UPDATE);
    }

    _connectAndNotify (fromScan) {
        return this.processor.connect().then(result => {
            if (result.ok) {
                // 焼き直して繋がったら説明を消し、ブロックを戻す
                this._setSketchProblem(null);
                // 接続済みの状態で scan() された場合も通知する。
                // 送らないと接続モーダルが「検索中」のまま止まる。
                if (!this._notifiedConnected || fromScan) {
                    this._emitConnected();
                }
            } else {
                console.warn(`[uiapduino] connect failed: ${result.reason}`, result.error || '');
                // スケッチを焼き直せば直る失敗だけを扱う。
                // 「基板が挿さっていない」「選択をキャンセルした」で
                // ブロックを消してしまうと、繋ぐ前に触れなくなる。
                if (result.reason === REASON.PROTOCOL_MISMATCH ||
                    result.reason === REASON.HANDSHAKE_NO_RESPONSE ||
                    result.reason === REASON.VARIANT_MISMATCH) {
                    this._setSketchProblem(result);
                }
                if (fromScan) {
                    // Scratch GUI 3.29 は検索中の PERIPHERAL_REQUEST_ERROR を
                    // 「Scratch Link が入っていない」と解釈して WebHID には無関係な
                    // 案内を出すため、失敗の種類によらず「見つかりません」に寄せる。
                    this.runtime.emit(this.runtime.constructor.PERIPHERAL_SCAN_TIMEOUT);
                }
            }
            return result;
        });
    }

    /**
     * 接続をステータスボタンと接続モーダルへ通知する。
     * @returns {void}
     */
    _emitConnected () {
        this._notifiedConnected = true;
        this.runtime.emit(this.runtime.constructor.PERIPHERAL_CONNECTED);
    }

    /**
     * 切断をステータスボタンへ通知する。接続を通知していなければ何もしない。
     * @returns {boolean} 実際に通知したら true
     */
    _emitDisconnected () {
        if (!this._notifiedConnected) return false;
        this._notifiedConnected = false;
        this.runtime.emit(this.runtime.constructor.PERIPHERAL_DISCONNECTED);
        return true;
    }

    /**
     * USB が抜かれたときに processor から呼ばれる。
     *
     * PERIPHERAL_DISCONNECTED だけではステータスボタンが戻るだけで利用者が気づけない。
     * PERIPHERAL_CONNECTION_LOST_ERROR だけではステータスボタンが接続済みのまま残る。
     * 両方を、この順で送る必要がある。
     *
     * @returns {void}
     */
    _handleDisconnectError () {
        // 押しっぱなしを先に解除する。切断の通知はその後でよい。
        this._releaseHeldInput();

        if (!this._emitDisconnected()) return;
        this.runtime.emit(this.runtime.constructor.PERIPHERAL_CONNECTION_LOST_ERROR, {
            message: 'Scratch lost connection to',
            extensionId: EXTENSION_ID
        });
    }

    // --- 以下、ブロックの実装 ------------------------------------------
    // Promise を返すと Scratch はデバイスの応答を待ってから次のブロックに進む。
    // デバイス側の小型 VM が実行を終えてから次のコマンドが飛ぶので、
    // Tello 拡張のようなキュー詰まりが起きにくい。

    /**
     * 「UIAPduino につなぐ」ブロック。opcode は 'connect' のまま。
     *
     * 接続モーダルを開かずに繋ぐ従来の経路。成功すればステータスボタンも接続済みになる。
     * 失敗しても検索用のイベントは送らない。ブロックから呼ばれただけでモーダルの
     * 「デバイスが見つかりません」を出しても利用者には脈絡がないため。
     *
     * @returns {Promise<boolean>} 接続できたら true
     */
    connectBlock () {
        return this._connectAndNotify(false).then(result => result.ok);
    }

    pinMode (args) {
        return this.processor
            .request(CMD.PIN_MODE, [Cast.toNumber(args.PIN), Cast.toNumber(args.MODE)])
            .catch(() => {});
    }

    digitalWrite (args) {
        return this.processor
            .request(CMD.DIGITAL_WRITE, [Cast.toNumber(args.PIN), Cast.toNumber(args.VALUE)])
            .catch(() => {});
    }

    digitalRead (args) {
        return this.processor
            .request(CMD.DIGITAL_READ, [Cast.toNumber(args.PIN)])
            .then(value => value !== 0)
            .catch(() => false);
    }

    /**
     * 周波数を uint16LE の 2 バイトにする。
     *
     * デバイスは周波数を覚えないので、PWM を出すコマンドは毎回これを伴う。
     * @param {number} hz - 周波数
     * @returns {Array<number>} [下位, 上位]
     */
    _freqBytes (hz) {
        const v = Math.min(0xFFFF, Math.max(1, Math.round(hz)));
        return [v & 0xFF, (v >> 8) & 0xFF];
    }

    analogWrite (args) {
        const params = [Cast.toNumber(args.PIN), Cast.toNumber(args.VALUE)]
            .concat(this._freqBytes(PWM_FREQ_HZ));
        return this.processor.request(CMD.ANALOG_WRITE, params).catch(() => {});
    }

    analogRead (args) {
        return this._analogRead(Cast.toNumber(args.PIN));
    }

    /**
     * アナログ入力を 1 チャンネル読む。
     *
     * ステージ表示 (モニター) にチェックが入っている間、Scratch は毎フレーム
     * このブロックを実行しようとするが、前回のスレッドが Promise を待っている間は
     * 再投入されない (runtime.addMonitorScript)。processor 側もキューで直列化するので、
     * 実際には「応答が返ったら次を投げる」ペースに落ち着く。
     *
     * @param {number} channel - アナログ番号 (A0 なら 0)。デジタルピン番号ではない
     * @returns {Promise<number>} 読み取り値。失敗したら直前の値
     */
    _analogRead (channel) {
        return this.processor
            .request(CMD.ANALOG_READ, [channel])
            .then(value => {
                this._lastAnalog[channel] = value;
                return value;
            })
            // 「ピン [ ] の値」は A0-A3 以外の番号も渡せるので、覚えていなければ 0
            .catch(() => this._lastAnalog[channel] || 0);
    }

    analogA0 () {
        return this._analogRead(0);
    }

    analogA1 () {
        return this._analogRead(1);
    }

    analogA2 () {
        return this._analogRead(2);
    }

    analogA3 () {
        return this._analogRead(3);
    }

    /**
     * サーボの可動域と周波数を設定する。
     *
     * デバイスへは何も送らない。ここに覚えるだけで、実際に使われるのは
     * 次に「サーボ [ ] を [ ] 度にする」が動いたとき。
     *
     * ⚠ 3 つの値は互いに影響する。周波数を上げると周期が縮むので、
     *   µs 範囲がそのままだと入り切らなくなる。
     *
     *     50Hz  → 周期 20000µs  2270µs は duty 29    収まる
     *     500Hz → 周期  2000µs  2270µs は duty 290   収まらない
     *
     *   収まらない場合は _pulseToDuty() が 255 で頭打ちにし、警告を出す。
     *   2270µs を保つなら周波数の実用上限は約 440Hz。
     *
     * @param {object} args - FREQ (Hz)、MIN / MAX (µs)
     * @returns {void}
     */
    servoConfig (args) {
        // 下限 > 上限は禁止しない。逆に書けばサーボの向きが反転するので、
        // 使い道のある書き方になる。
        this._servo = {
            freqHz: Math.min(0xFFFF, Math.max(1, Math.round(Cast.toNumber(args.FREQ)))),
            minUs: Math.max(0, Math.round(Cast.toNumber(args.MIN))),
            maxUs: Math.max(0, Math.round(Cast.toNumber(args.MAX)))
        };
    }

    /**
     * パルス幅 (µs) を duty (0-255) にする。
     *
     * Pwm_write() の 1 周は 256 目盛なので duty = パルス幅 ÷ 周期 × 256。
     *
     * @param {number} pulseUs - パルス幅 (µs)
     * @param {number} freqHz - 周波数 (Hz)
     * @returns {number} duty (0-255)
     */
    _pulseToDuty (pulseUs, freqHz) {
        const periodUs = 1000000 / freqHz;
        const duty = Math.round((pulseUs * PWM_STEPS) / periodUs);
        if (duty > PWM_DUTY_MAX) {
            // 黙って頭打ちにすると「出力が振り切ったまま戻らない」という
            // 一番わかりにくい壊れ方になる。周波数を上げたのに µs 範囲を
            // そのままにした場合に必ずここへ来る。
            console.warn(
                `[uiapduino] パルス幅 ${pulseUs}µs は ${freqHz}Hz の周期 ` +
                `${Math.round(periodUs)}µs に収まりません。出力を最大で頭打ちにします。` +
                '「サーボの設定」で周波数を下げるか、µs の範囲を狭めてください。'
            );
            return PWM_DUTY_MAX;
        }
        return Math.max(0, duty);
    }

    /**
     * サーボを指定の角度へ向ける。
     *
     * 角度 0 が設定の下限 µs、180 が上限 µs。間は比例配分する。
     * 変換をすべてここで済ませ、デバイスへは duty と周波数だけを送る。
     * デバイスは「サーボ」を知らないので、可動域を変えても焼き直しは要らない。
     *
     * ⚠ 刻みは既定の 50Hz なら約 7.8°。8bit PWM で 500〜2270µs の間に
     *   23 段階しか入らないため、90 度と 95 度は同じ位置になる。
     *   「サーボの設定」で周波数を上げれば細かくなる (400Hz で約 1°)。
     *
     * 送ったあとサーボが動き終わるのを待つことはしない。どれだけかかるかは
     * サーボ次第で、デバイス側からは分からない。待たせたいときは
     * Scratch の「[ ] 秒待つ」を続けて置く。
     *
     * @param {object} args - PIN (Arduino 番号) と ANGLE (度)
     * @returns {Promise<void>} 応答が返ったら resolve。失敗しても reject しない
     */
    servo (args) {
        const cfg = this._servo;
        const angle = Math.min(SERVO_ANGLE_MAX, Math.max(0, Cast.toNumber(args.ANGLE)));
        const pulseUs = cfg.minUs + (((cfg.maxUs - cfg.minUs) * angle) / SERVO_ANGLE_MAX);
        const params = [Cast.toNumber(args.PIN), this._pulseToDuty(pulseUs, cfg.freqHz)]
            .concat(this._freqBytes(cfg.freqHz));
        return this.processor.request(CMD.SERVO, params).catch(() => {});
    }

    /**
     * 距離計の Trig / Echo ピンを設定する。
     *
     * デバイスへは何も送らない。次に「距離」が読まれたときに使われる。
     * @param {object} args - TRIG / ECHO (Arduino のピン番号)
     * @returns {void}
     */
    distanceConfig (args) {
        this._distance = {
            trig: Cast.toNumber(args.TRIG),
            echo: Cast.toNumber(args.ECHO)
        };
    }

    /**
     * 距離計 (HC-SR04) で測った距離を cm で返す。
     *
     * デバイスが返すのは往復時間 (µs) で、cm への換算はここでやる。
     * 音速 340m/s = 29µs/cm、超音波は往復するので 58µs/cm。
     * 係数をここに置いてあるので、変えたくなっても基板を焼き直さずに済む。
     *
     * ⚠ 測れなかったときは 0 を返す。アナログ入力のように直前の値を保つことはしない。
     *   未接続でも範囲外でも 0 になり、区別はしない。
     *
     * 小数第 1 位までにしてある。HC-SR04 の分解能は 0.3cm 程度なので、
     * それ以上の桁を出しても意味のある数字にならない。
     *
     * @returns {Promise<number>} 距離 (cm)。測れなければ 0
     */
    distance () {
        const cfg = this._distance;
        return this.processor
            .request(CMD.DISTANCE, [cfg.trig, cfg.echo])
            .then(us => (us === 0 ? 0 : Math.round((us / US_PER_CM) * 10) / 10))
            .catch(() => 0);
    }

    // --- キーボード -----------------------------------------------------
    // ここから下は Scratch ではなく PC 本体を操作する。
    // 動く先はフォーカスのあるウィンドウなので、普通は Scratch 自身になる。

    /**
     * ブロックに渡された文字列を、デバイスへ送れるバイト列にする。
     *
     * デバイス側は HID のキーコードを送るだけで、IME を通らない。
     * 日本語を渡しても意味のある入力にはならず、知らないバイトは
     * Keyboard.cpp の _toHID() が false を返して黙って捨てる。
     * 「ブロックを置いたのに何も起きない」は一番わかりにくい壊れ方なので、
     * 捨てる前に開発者コンソールへ警告を出す。
     *
     * ⚠ 通せるのは印字可能な ASCII (0x20〜0x7E) だけ。それも US 配列前提で、
     *   JIS 配列の PC では @ : _ [ ] \ ^ などがずれる。英数字と空白は配列によらない。
     *
     * @param {string} text - ブロックの引数
     * @param {string} where - 警告に出すブロック名
     * @returns {Array<number>} 送れる文字のバイト列
     */
    _toAsciiBytes (text, where) {
        const bytes = [];
        const dropped = [];
        // 文字単位で回す。サロゲートペア (絵文字など) を半分に割らないため。
        for (const ch of text) {
            const code = ch.codePointAt(0);
            if (code >= 0x20 && code <= 0x7E) {
                bytes.push(code);
            } else {
                dropped.push(ch);
            }
        }
        if (dropped.length > 0) {
            console.warn(
                `[uiapduino] ${where}: dropped characters that the keyboard cannot send: ` +
                `${dropped.join('')} (UIAPduino sends HID key codes, so it cannot type ` +
                'Japanese or any other text that needs an IME)'
            );
        }
        return bytes;
    }

    /**
     * 「[ ] とタイプする」ブロック。
     *
     * 1 コマンドに 29 文字しか載らないので、切って順に送る。
     * 応答を待って繋ぐので、途中で失敗したらそこで止まる。キューが直列化するため
     * 待たなくても順序は崩れないが、失敗した後も送り続ける意味はない。
     *
     * @param {object} args - ブロックの引数
     * @returns {Promise<void>} 打ち終わったら resolve
     */
    keyType (args) {
        const bytes = this._toAsciiBytes(Cast.toString(args.TEXT), 'type');
        if (bytes.length === 0) return Promise.resolve();

        let chain = Promise.resolve();
        for (let i = 0; i < bytes.length; i += KEY_TEXT_CHUNK) {
            const chunk = bytes.slice(i, i + KEY_TEXT_CHUNK);
            const more = (i + KEY_TEXT_CHUNK) < bytes.length ? KEY_TEXT_MORE : 0;
            chain = chain.then(() => this.processor.request(
                CMD.KEY_TEXT,
                [more, ...chunk],
                this._typeTimeout(chunk.length)
            ));
        }
        return chain.catch(() => {});
    }

    /**
     * `KEY_TEXT` の応答待ち時間 (ms)。
     *
     * デバイスは 1 文字ごとに press → 20ms → release → 20ms を行う
     * (arduino_core_ch32 の Keyboard.cpp)。29 文字で約 1.2 秒かかるので、
     * 既定の 3 秒では余裕が乏しい。文字数から見積もって倍の余裕を取る。
     *
     * @param {number} length - このコマンドで送る文字数
     * @returns {number} 待ち時間 (ms)
     */
    _typeTimeout (length) {
        return 1000 + (length * 80);
    }

    /**
     * メニューの値をキーコードにする。
     *
     * メニューは acceptReporters なので、ブロックをはめ込めば何でも渡ってくる。
     * デバイス側は知らないキーコードを黙って捨てるだけなので、範囲に丸めるだけでよい。
     *
     * @param {*} value - ブロックの引数
     * @returns {number} 0〜255
     */
    _toKeyCode (value) {
        return (Math.round(Cast.toNumber(value)) || 0) & 0xFF;
    }

    keyWrite (args) {
        return this.processor
            .request(CMD.KEY_WRITE, [this._toKeyCode(args.KEY)])
            .catch(() => {});
    }

    /**
     * メニューの値を修飾キーのキーコードにする。
     *
     * メニューは acceptReporters なので、ブロックをはめ込めば何でも渡ってくる。
     * 知らない値が来たら Ctrl にしておく。そのまま流すと、押したまま離せない
     * 別のキーを掴んでしまいかねない。
     *
     * @param {*} value - ブロックの引数
     * @returns {number} KEY_MODIFIER のいずれか
     */
    _toModifierKey (value) {
        const key = Math.round(Cast.toNumber(value)) || 0;
        if (key >= KEY_MODIFIER.CTRL && key <= KEY_MODIFIER.GUI) return key;
        return KEY_MODIFIER.CTRL;
    }

    /**
     * 押しっぱなしのものが 1 つでもあるかを数え直す。
     *
     * `_inputHeld` は USB を抜かれたときに後始末が要るかどうかの判断に使う。
     * ドラッグと修飾キーは同時に成立しうる (ドラッグの囲みの中に
     * 修飾キーの囲みを置ける) ので、片方を離しただけで倒してはいけない。
     *
     * @returns {void}
     */
    _updateInputHeld () {
        this._inputHeld = this._dragDepth > 0 || this._modifierCounts.size > 0;
    }

    /**
     * 修飾キーを押したままにする。すでに押していれば数えるだけ。
     *
     * 同じ修飾キーの囲みを入れ子にできるので、押すのは一番外側に入るときだけにする。
     * これが無いと、内側の囲みを抜けた時点で離れて外側が効かなくなる。
     *
     * @param {number} key - KEY_MODIFIER のいずれか
     * @returns {void}
     */
    _pressModifier (key) {
        const count = (this._modifierCounts.get(key) || 0) + 1;
        this._modifierCounts.set(key, count);
        // 送る前に立てる。送信中に USB が抜ける可能性があるため。
        this._updateInputHeld();
        if (count > 1) return;

        this.processor
            .request(CMD.KEY_PRESS, [key])
            .catch(() => {});
    }

    /**
     * 修飾キーを 1 段ぶん離す。まだ外側の囲みが押していれば数えるだけ。
     *
     * @param {number} key - KEY_MODIFIER のいずれか
     * @returns {?Promise<void>} 実際に離すときだけ Promise を返す
     */
    _releaseModifier (key) {
        const count = Math.max(0, (this._modifierCounts.get(key) || 0) - 1);
        if (count === 0) {
            this._modifierCounts.delete(key);
        } else {
            this._modifierCounts.set(key, count);
        }
        this._updateInputHeld();
        if (count > 0) return null;

        return this.processor
            .request(CMD.KEY_RELEASE, [key])
            .catch(() => {});
    }

    /**
     * 「[ ] を押しながら〔 〕」の囲みブロック。
     *
     * マウスの「ドラッグしながら〔 〕」と同じ仕組み。`BlockType.LOOP` は
     * 「中身が終わったらもう一度呼ばれる」ので、1 回目で押して中身へ入り、
     * 2 回目で離して終わる。
     *
     *   1 回目 : KEY_PRESS → util.startBranch(1, true) → 中身が動く
     *   2 回目 : KEY_RELEASE。startBranch を呼ばないのでここで終わる
     *
     * util.startBranch() は同期的に呼ばなければならないので、press の応答は待たない。
     * 待たなくても順序は崩れない。processor のキューが直列化するので、
     * 中身の「とタイプする」は必ず press の後ろに並ぶ。
     *
     * 押したキーはスタックフレームに覚えておく。メニューは acceptReporters なので、
     * 2 回目の呼び出しで別の値が返ってくると、押したものと違うキーを離しかねない。
     *
     * ⚠ 中身の途中で止められると 2 回目が来ない。
     *   停止ボタンは PROJECT_STOP_ALL → PANIC で拾える。
     *   「このスクリプトを止める」のような経路はデバイス側の見張り (5 秒) が受ける。
     *
     * @param {object} args - ブロックの引数
     * @param {BlockUtility} util - スタックフレームと分岐の制御
     * @returns {?Promise} 2 回目だけ、離し終わるまで待つ Promise を返す
     */
    keyModifierWhile (args, util) {
        const held = util.stackFrame.uiapduinoModifier;
        if (held) {
            // 2 回目。中身が終わったので離す。
            util.stackFrame.uiapduinoModifier = 0;
            return this._releaseModifier(held);
        }

        // 1 回目。押してから中身へ入る。
        const key = this._toModifierKey(args.MOD);
        util.stackFrame.uiapduinoModifier = key;
        this._pressModifier(key);
        util.startBranch(1, true);
        return null;
    }

    // --- マウス ---------------------------------------------------------
    // ここから下も Scratch ではなく PC 本体を操作する。

    /**
     * 数値を符号付き 16bit に収める。
     * @param {*} value - ブロックの引数
     * @returns {number} -32768〜32767 の整数
     */
    _toInt16 (value) {
        const rounded = Math.round(Cast.toNumber(value)) || 0;
        return Math.max(-32768, Math.min(32767, rounded));
    }

    /**
     * 符号付き 16bit をリトルエンディアンのバイト列にする。
     * @param {number} value - _toInt16 済みの数値
     * @returns {Array<number>} [下位, 上位]
     */
    _int16Bytes (value) {
        return [value & 0xFF, (value >> 8) & 0xFF];
    }

    /**
     * メニューの値をマウスのボタンにする。
     *
     * メニューは acceptReporters なので、ブロックをはめ込めば何でも渡ってくる。
     * 知らない値が来たら左ボタンにしておく。デバイス側でビットとして解釈されるので、
     * そのまま流すと複数ボタンを同時に押すことになりかねない。
     *
     * @param {*} value - ブロックの引数
     * @returns {number} MOUSE_BUTTON のいずれか
     */
    _toButton (value) {
        const button = Cast.toNumber(value);
        if (button === MOUSE_BUTTON.RIGHT) return MOUSE_BUTTON.RIGHT;
        if (button === MOUSE_BUTTON.MIDDLE) return MOUSE_BUTTON.MIDDLE;
        return MOUSE_BUTTON.LEFT;
    }

    /**
     * マウス移動の応答待ち時間 (ms)。
     *
     * デバイスは 1 ステップが 127px 以下になるように分割し、1 ステップに 10ms かける。
     * 既定の 3 秒のままだと、画面 3 枚分を超える移動でタイムアウトしてしまう。
     *
     * 分割数の式はデバイス側 ScratchUiapduino.ino の stepsForMove() と同じ。
     * 片方だけ変えるとタイムアウトするので、変えるときは両方を直すこと。
     *
     * @param {number} dx - 横の移動量
     * @param {number} dy - 縦の移動量
     * @returns {number} 待ち時間 (ms)
     */
    _moveTimeout (dx, dy) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        const steps = Math.max(10, Math.ceil(distance / 127));
        return 1000 + (steps * 20);
    }

    mouseMove (args) {
        const dx = this._toInt16(args.X);
        const dy = this._toInt16(args.Y);
        return this.processor
            .request(
                CMD.MOUSE_MOVE,
                [...this._int16Bytes(dx), ...this._int16Bytes(dy)],
                this._moveTimeout(dx, dy)
            )
            .catch(() => {});
    }

    mouseClick (args) {
        return this.processor
            .request(CMD.MOUSE_CLICK, [this._toButton(args.BUTTON)])
            .catch(() => {});
    }

    mouseDoubleClick (args) {
        // 2 回目までの間隔はデバイス側が持つ。Scratch から 2 回送ると、
        // 応答待ちの往復で OS のダブルクリック判定時間 (既定 500ms) を超えかねない。
        return this.processor
            .request(CMD.MOUSE_DBLCLICK, [this._toButton(args.BUTTON)])
            .catch(() => {});
    }

    mouseDrag (args) {
        const dx = this._toInt16(args.X);
        const dy = this._toInt16(args.Y);
        // 押す・動かす・離すをデバイス側で完結させる。Scratch から 3 回に分けると
        // その間ずっとボタンが押されたままになり、USB を抜かれたときの窓が広がる。
        return this.processor
            .request(
                CMD.MOUSE_DRAG,
                [...this._int16Bytes(dx), ...this._int16Bytes(dy), this._toButton(args.BUTTON)],
                this._moveTimeout(dx, dy)
            )
            .catch(() => {});
    }

    /**
     * 「[ ] ボタンでドラッグしながら〔 〕」の囲みブロック。
     *
     * BlockType.LOOP は「中身が終わったらもう一度呼ばれる」。repeat ブロックと同じ仕組みで、
     * 1 回目で押して中身へ入り、2 回目で離して終わる。
     *
     *   1 回目 : press → util.startBranch(1, true) → 中身が動く
     *   2 回目 : release。startBranch を呼ばないのでここで終わる
     *
     * util.startBranch() は同期的に呼ばなければならないので、press の応答は待たない。
     * 待たなくても順序は崩れない。processor のキューが直列化するので、
     * 中身の「動かす」は必ず press の後ろに並ぶ。
     *
     * ⚠ 中身の途中で止められると 2 回目が来ない。
     *   停止ボタンは PROJECT_STOP_ALL → PANIC で拾える。
     *   「このスクリプトを止める」のような経路はデバイス側の見張り (5 秒) が受ける。
     *
     * @param {object} args - ブロックの引数
     * @param {BlockUtility} util - スタックフレームと分岐の制御
     * @returns {?Promise} 2 回目だけ、離し終わるまで待つ Promise を返す
     */
    mouseDragWhile (args, util) {
        const button = this._toButton(args.BUTTON);

        if (util.stackFrame.uiapduinoDragging) {
            // 2 回目。中身が終わったので離す。
            util.stackFrame.uiapduinoDragging = false;
            this._dragDepth = Math.max(0, this._dragDepth - 1);
            // 修飾キーの囲みが外側に居るかもしれないので、数え直して判断する。
            this._updateInputHeld();
            if (this._dragDepth > 0) return null; // 外側のドラッグがまだ続いている
            return this.processor
                .request(CMD.MOUSE_RELEASE, [button])
                .catch(() => {});
        }

        // 1 回目。押してから中身へ入る。
        util.stackFrame.uiapduinoDragging = true;
        this._dragDepth += 1;
        // 送る前に立てる。送信中に USB が抜ける可能性があるため。
        this._updateInputHeld();
        if (this._dragDepth === 1) {
            this.processor
                .request(CMD.MOUSE_PRESS, [button])
                .catch(() => {});
        }
        util.startBranch(1, true);
        return null;
    }

    mouseWheel (args) {
        // デバイスは 1 刻みずつ 10ms かけて送る。ホイールの刻みを無視するアプリが
        // あるためだが、そのぶん回数が多いと時間がかかるので上限を置く。
        const count = Math.max(0, Math.min(100, Math.round(Cast.toNumber(args.COUNT)) || 0));
        const direction = Cast.toNumber(args.DIR) < 0 ? -1 : 1;
        return this.processor
            .request(CMD.MOUSE_WHEEL, [direction * count], 1000 + (count * 20))
            .catch(() => {});
    }

    releaseAllInput () {
        // _releaseInput() は使わない。あちらは実行待ちを捨てるが、これは普通の
        // ブロックなので、並行して動いている別のスクリプトのコマンドまで
        // 巻き添えで捨ててはいけない。
        this._inputHeld = false;
        this._dragDepth = 0;
        this._modifierCounts.clear();
        return this.processor
            .request(CMD.PANIC)
            .catch(() => {});
    }

    clearQueue () {
        this.processor.resetQueue();
    }
}

// blockClass という名前でも出すこと。Xcratch のローダはこの名前で拡張本体を探す。
// (rollup の multi-entry が entry と束ねるとき、名前付き export しか拾えない)
// デスクトップ版は default しか見ないので、増えても影響しない。
export {Scratch3Uiapduino as default, Scratch3Uiapduino as blockClass};
