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
 * TODO: UIAPduino のアイコンに差し替える。今は 1x1 の透明 PNG。
 * @type {string}
 */
// eslint-disable-next-line max-len
const blockIconURI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * 拡張機能メニューに表示するアイコン (data URI)。
 * TODO: UIAPduino のアイコンに差し替える。
 * @type {string}
 */
// eslint-disable-next-line max-len
const menuIconURI = blockIconURI;

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
                            defaultValue: 13
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
                            defaultValue: 13
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
                            defaultValue: 2
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
                            defaultValue: 9
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
