// scratch3-uiapduino / index.js
// Created by tarosay (2026)
//
// ブロック定義。scratch3-tello の index.js と同じ構造。
// 通信のことは一切知らず、uiapduinoProcessor に投げるだけ。

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');

const UiapduinoProcessor = require('./uiapduinoProcessor');
const {CMD, MOUSE_BUTTON} = UiapduinoProcessor;

/**
 * 拡張機能 ID。
 *
 * getInfo() の id、Peripheral Extension API への登録、接続喪失イベントの payload で
 * 同じ値を使う。ここがずれるとステータスボタンが別拡張を見に行く。
 * @type {string}
 */
const EXTENSION_ID = 'uiapduino';

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
 * ブロックパレットのカテゴリ見出しに表示するアイコン (data URI)。
 * ブロック左端と同じ絵でよいので使い回す。
 * @type {string}
 */
const menuIconURI = blockIconURI;

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
    mouseMove: {
        ja: 'マウスを 右へ [X] 下へ [Y] 動かす',
        'ja-Hira': 'マウスを みぎへ [X] したへ [Y] うごかす',
        en: 'move mouse right [X] down [Y]'
    },
    mouseClick: {
        ja: '[BUTTON] ボタンをクリックする',
        'ja-Hira': '[BUTTON] ボタンをクリックする',
        en: 'click [BUTTON] button'
    },
    mouseDoubleClick: {
        ja: '[BUTTON] ボタンでダブルクリックする',
        'ja-Hira': '[BUTTON] ボタンでダブルクリックする',
        en: 'double-click [BUTTON] button'
    },
    mouseDrag: {
        ja: '[BUTTON] ボタンで 右へ [X] 下へ [Y] ドラッグする',
        'ja-Hira': '[BUTTON] ボタンで みぎへ [X] したへ [Y] ドラッグする',
        en: 'drag [BUTTON] button right [X] down [Y]'
    },
    mouseDragWhile: {
        ja: '[BUTTON] ボタンでドラッグしながら',
        'ja-Hira': '[BUTTON] ボタンでドラッグしながら',
        en: 'drag with [BUTTON] button while'
    },
    mouseWheel: {
        ja: 'ホイールを [DIR] に [COUNT] 回す',
        'ja-Hira': 'ホイールを [DIR] に [COUNT] まわす',
        en: 'scroll wheel [DIR] by [COUNT]'
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
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

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
        // 「ドラッグしながら」の途中で止められた場合、2 回目の呼び出しは来ない。
        // 深さを戻しておかないと、次のドラッグで押す処理が飛ばされる。
        this._dragDepth = 0;
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

        return {
            id: EXTENSION_ID,
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
                // UIAPduino は HID なのでキーボードとマウスそのものになれる。
                // ここから下のブロックは Scratch ではなく PC 本体を操作する。
                //
                // 動く先はフォーカスのあるウィンドウなので、通常は Scratch 自身になる。
                // メモ帳などを操作させたいときは「n 秒待つ」を挟んで、その間に
                // 利用者が対象のウィンドウをクリックする、という組み方をする。
                {
                    opcode: 'mouseMove',
                    text: this._getText('mouseMove'),
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
    _connectAndNotify (fromScan) {
        return this.processor.connect().then(result => {
            if (result.ok) {
                // 接続済みの状態で scan() された場合も通知する。
                // 送らないと接続モーダルが「検索中」のまま止まる。
                if (!this._notifiedConnected || fromScan) {
                    this._emitConnected();
                }
            } else {
                console.warn(`[uiapduino] connect failed: ${result.reason}`, result.error || '');
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

    analogWrite (args) {
        return this.processor
            .request(CMD.ANALOG_WRITE, [Cast.toNumber(args.PIN), Cast.toNumber(args.VALUE)])
            .catch(() => {});
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

    // --- マウス ---------------------------------------------------------
    // ここから下は Scratch ではなく PC 本体を操作する。
    // 動く先はフォーカスのあるウィンドウなので、普通は Scratch 自身になる。

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
            if (this._dragDepth > 0) return null; // 外側のドラッグがまだ続いている
            this._inputHeld = false;
            return this.processor
                .request(CMD.MOUSE_RELEASE, [button])
                .catch(() => {});
        }

        // 1 回目。押してから中身へ入る。
        util.stackFrame.uiapduinoDragging = true;
        this._dragDepth += 1;
        if (this._dragDepth === 1) {
            // 送る前に立てる。送信中に USB が抜ける可能性があるため。
            this._inputHeld = true;
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
        return this.processor
            .request(CMD.PANIC)
            .catch(() => {});
    }

    clearQueue () {
        this.processor.resetQueue();
    }
}

module.exports = Scratch3Uiapduino;
