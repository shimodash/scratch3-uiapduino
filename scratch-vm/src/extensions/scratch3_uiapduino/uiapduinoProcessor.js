// scratch3-uiapduino / uiapduinoProcessor.js
// Created by tarosay (2026)
//
// UIAPduino との USB-HID (WebHID) 通信層。
//
// scratch3-tello の telloProcessor.js と同じ役割・同じ外部インタフェースを持つ。
// 違いは transport が dgram (UDP) ではなく WebHID である点だけで、
// 「1コマンド送って ACK を待ってから次を送る」というキュー方式は共通。
//
// ブロック定義 (index.js) はこのファイルの実装を一切知らない。
// プロトコルを変更する場合もこのファイルだけを直せばよい。

/**
 * WebHID デバイスフィルタ。
 * 値は https://tarosay.github.io/uiap-hid-web/ の実装に合わせてある。
 * HID ProMicro CH32V003 (Board Version V1.4)
 */
const DEVICE_FILTER = {
    vendorId: 0x1209,
    productId: 0xD004,
    usagePage: 0xFF00,
    usage: 0x01
};

/**
 * Feature Report (Web → UIAPduino) のサイズ。
 * arduino_core_ch32 v1.1.5 以降は 32 バイト。
 * それ以前は 16 バイトなので、実際のサイズは接続時にディスクリプタから取得する。
 */
const FEATURE_REPORT_SIZE = 32;

/**
 * Input Report (UIAPduino → Web) のサイズ。
 * Low-Speed USB の EP3 IN は 8 バイト固定。
 */
const INPUT_REPORT_SIZE = 8;

/** sendFeatureReport / inputreport で使うレポート ID。番号なしレポートなら 0。 */
const REPORT_ID = 0;

/**
 * コマンド ID。
 *
 * TODO: UIAPduino 側の小型 VM と突き合わせて確定させること。
 *       ここでは「コマンドを送ると ACK が返る」という最小の契約だけを定義している。
 */
const CMD = {
    /** 疎通確認。デバイスは ACK を返すだけ。 */
    PING: 0x01,
    /** ピンのモード設定。 [2]=pin [3]=mode */
    PIN_MODE: 0x10,
    /** デジタル出力。 [2]=pin [3]=value(0/1) */
    DIGITAL_WRITE: 0x11,
    /** デジタル入力。ACK の value に 0/1 が入る。 [2]=pin */
    DIGITAL_READ: 0x12,
    /** アナログ出力 (PWM)。 [2]=pin [3]=value(0-255) */
    ANALOG_WRITE: 0x13,
    /** アナログ入力。ACK の value に読み取り値が入る。 [2]=pin */
    ANALOG_READ: 0x14
};

/**
 * UIAPduino → Web の応答種別 (Input Report の先頭バイト)。
 */
const RES = {
    /** コマンド完了応答 */
    ACK: 0x80
};

/** ACK が返らない場合に諦めるまでの時間 (ms) */
const COMMAND_TIMEOUT = 3000;

/**
 * Input Report のレイアウト (8 バイト)
 *
 *   [0] 応答種別 (RES.ACK)
 *   [1] シーケンス番号 (送信したコマンドのエコー)
 *   [2] ステータス     (0 = 正常, それ以外 = エラー)
 *   [3] 戻り値 下位バイト
 *   [4] 戻り値 上位バイト
 *   [5..7] 予約
 *
 * Feature Report のレイアウト (32 バイト)
 *
 *   [0] コマンド ID (CMD.*)
 *   [1] シーケンス番号 (1..255, 0 は未使用)
 *   [2..] パラメータ
 */

class UiapduinoProcessor {
    constructor () {
        this.device = null;
        this.featureReportSize = FEATURE_REPORT_SIZE;

        /** 送信待ちコマンドの配列。要素は {payload, resolve, reject} */
        this.queue = [];
        /** 現在 ACK 待ちのコマンド。null なら送信可能。 */
        this.pending = null;
        /** 次に振るシーケンス番号 */
        this.sequence = 0;

        this._onInputReport = this._onInputReport.bind(this);
    }

    /**
     * 接続済みかどうか。
     * @returns {boolean} デバイスが open 済みなら true
     */
    isConnected () {
        return !!(this.device && this.device.opened);
    }

    /**
     * UIAPduino に接続する。
     *
     * 既に許可済みのデバイスがあれば getDevices() で拾う。無ければ requestDevice() を試す。
     *
     * NOTE: requestDevice() は Chromium 側でユーザ操作 (実際のクリック) を要求する。
     *       Scratch のブロック実行は VM のループから呼ばれておりユーザ操作とみなされないため、
     *       ブロックから呼ぶと失敗する可能性がある。
     *       scratch-desktop の main プロセスで setDevicePermissionHandler を設定してあるので
     *       通常は getDevices() だけで取得できる想定。
     *       ここは実機で最初に検証すべき箇所。
     *
     * @returns {Promise<boolean>} 接続できたら true
     */
    async connect () {
        if (this.isConnected()) return true;

        if (!navigator.hid) {
            console.error('[uiapduino] WebHID is not available in this environment');
            return false;
        }

        try {
            let device = (await navigator.hid.getDevices()).find(d => (
                d.vendorId === DEVICE_FILTER.vendorId &&
                d.productId === DEVICE_FILTER.productId
            ));

            if (!device) {
                const devices = await navigator.hid.requestDevice({filters: [DEVICE_FILTER]});
                device = devices[0];
            }

            if (!device) {
                console.warn('[uiapduino] device not found');
                return false;
            }

            if (!device.opened) {
                await device.open();
            }

            device.addEventListener('inputreport', this._onInputReport);
            this.device = device;
            this.featureReportSize = this._detectFeatureReportSize(device);

            return true;
        } catch (e) {
            console.error('[uiapduino] connect failed:', e);
            return false;
        }
    }

    /**
     * 切断する。
     * @returns {Promise<void>} 切断完了
     */
    async disconnect () {
        this.resetQueue();
        if (!this.device) return;
        this.device.removeEventListener('inputreport', this._onInputReport);
        if (this.device.opened) {
            await this.device.close();
        }
        this.device = null;
    }

    /**
     * HID ディスクリプタから Feature Report の実サイズを取得する。
     * arduino_core_ch32 のバージョンによって 16 / 32 バイトと異なるため。
     * @param {HIDDevice} device - 接続済みデバイス
     * @returns {number} Feature Report のバイト数
     */
    _detectFeatureReportSize (device) {
        for (const collection of device.collections || []) {
            for (const report of collection.featureReports || []) {
                const bits = (report.items || []).reduce(
                    (sum, item) => sum + ((item.reportSize || 0) * (item.reportCount || 0)),
                    0
                );
                if (bits > 0) return Math.ceil(bits / 8);
            }
        }
        return FEATURE_REPORT_SIZE;
    }

    /**
     * コマンドをキューに積む。
     *
     * telloProcessor.request() と同じ役割。ただし ACK を待つ Promise を返すので、
     * ブロック側でそのまま return すれば Scratch がデバイスの完了を待ってくれる。
     *
     * @param {number} command - CMD.* のいずれか
     * @param {Array<number>} params - パラメータのバイト列
     * @returns {Promise<number>} ACK に含まれる戻り値
     */
    request (command, params = []) {
        if (!this.isConnected()) {
            return Promise.reject(new Error('uiapduino is not connected'));
        }

        this.sequence = (this.sequence % 255) + 1;

        const payload = new Uint8Array(this.featureReportSize);
        payload[0] = command;
        payload[1] = this.sequence;
        params.forEach((value, i) => {
            payload[2 + i] = value & 0xFF;
        });

        return new Promise((resolve, reject) => {
            this.queue.push({sequence: this.sequence, payload, resolve, reject});
            this._dequeue();
        });
    }

    /**
     * 実行待ちのコマンドをすべて捨てる。
     * Tello 拡張の「実行待ちのコマンドをクリアする」ブロックと同じ用途。
     * @returns {void}
     */
    resetQueue () {
        const dropped = this.queue.splice(0, this.queue.length);
        for (const item of dropped) {
            item.reject(new Error('command queue cleared'));
        }
        this._clearPending(new Error('command queue cleared'));
    }

    /**
     * キューの先頭を送信する。ACK 待ちの間は何もしない。
     * @returns {void}
     */
    _dequeue () {
        if (this.pending || this.queue.length === 0) return;

        const item = this.queue.shift();
        this.pending = item;

        item.timer = setTimeout(() => {
            this._clearPending(new Error(`command timed out (seq=${item.sequence})`));
            this._dequeue();
        }, COMMAND_TIMEOUT);

        this.device.sendFeatureReport(REPORT_ID, item.payload)
            .catch(e => {
                this._clearPending(e);
                this._dequeue();
            });
    }

    /**
     * ACK 待ちを解除する。理由が渡されたら reject する。
     * @param {Error} [error] - 失敗理由
     * @returns {void}
     */
    _clearPending (error) {
        if (!this.pending) return;
        clearTimeout(this.pending.timer);
        if (error) this.pending.reject(error);
        this.pending = null;
    }

    /**
     * UIAPduino からの Input Report を処理する。
     * @param {HIDInputReportEvent} event - inputreport イベント
     * @returns {void}
     */
    _onInputReport (event) {
        const data = event.data;
        if (data.byteLength < INPUT_REPORT_SIZE) return;

        const type = data.getUint8(0);
        if (type !== RES.ACK) {
            // ACK 以外の非同期通知。必要になったらここで扱う。
            return;
        }

        const sequence = data.getUint8(1);
        if (!this.pending || this.pending.sequence !== sequence) {
            // タイムアウト後に遅れて届いた ACK は捨てる
            return;
        }

        const status = data.getUint8(2);
        const value = data.getUint8(3) | (data.getUint8(4) << 8);

        const item = this.pending;
        clearTimeout(item.timer);
        this.pending = null;

        if (status === 0) {
            item.resolve(value);
        } else {
            item.reject(new Error(`uiapduino returned status ${status}`));
        }

        this._dequeue();
    }
}

module.exports = UiapduinoProcessor;
module.exports.CMD = CMD;
