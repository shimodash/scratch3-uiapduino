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
const {CMD} = UiapduinoProcessor;

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
            id: 'uiapduino',
            name: 'UIAPduino',
            menuIconURI: menuIconURI,
            blockIconURI: blockIconURI,
            blocks: [
                {
                    opcode: 'connect',
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
                }
            }
        };
    }

    // --- 以下、ブロックの実装 ------------------------------------------
    // Promise を返すと Scratch はデバイスの応答を待ってから次のブロックに進む。
    // デバイス側の小型 VM が実行を終えてから次のコマンドが飛ぶので、
    // Tello 拡張のようなキュー詰まりが起きにくい。

    connect () {
        return this.processor.connect();
    }

    isConnected () {
        return this.processor.isConnected();
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
        return this.processor
            .request(CMD.ANALOG_READ, [Cast.toNumber(args.PIN)])
            .catch(() => 0);
    }

    clearQueue () {
        this.processor.resetQueue();
    }
}

module.exports = Scratch3Uiapduino;
