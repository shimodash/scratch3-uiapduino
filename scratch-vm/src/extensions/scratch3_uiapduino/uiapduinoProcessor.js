// scratch3-uiapduino / uiapduinoProcessor.js
// Created by tarosay (2026)
//
// UIAPduino との USB-HID (WebHID) 通信層。
//
// 「1コマンド送って応答を待ってから次を送る」というキュー方式は
// scratch3-tello の telloProcessor.js と同じ。違いは transport が
// dgram (UDP) ではなく WebHID である点だけ。
//
// ブロック定義 (index.js) はこのファイルの実装を一切知らない。
// index.js が使うのは connect() / isConnected() / request() / resetQueue() の 4 つだけで、
// プロトコルを変更する場合もこのファイルだけを直せばよい。
//
// ── プロトコルの出典 ────────────────────────────────────────────────────────
// ワイヤフォーマットは uiap-hid-web (https://tarosay.github.io/uiap-hid-web/) の
// uiapruby.html が実機に対して使っているものに合わせてある。
// デバイス側ライブラリ (Hid.h) が既に持っている契約なので、
// 既存スケッチ資産と同じ経路で動く。

/**
 * WebHID デバイスフィルタ。
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
 * コマンド ID (Web → UIAPduino, Feature Report の先頭バイト)。
 *
 * 0x01 は Hid.h の「接続通知」で予約済み。
 * 0x01〜0x11 は uiapruby の SD ファイル操作と RUN/STOP が使っているため、
 * Scratch 拡張は衝突しない 0x20〜 を使う。
 * こうしておけば将来 1 つのスケッチに UIAPruby VM と Scratch 対応を同居させられる。
 */
const CMD = {
    /** 接続通知。デバイス側 WaitAvailable() を解除する。応答は返らない。 */
    CONNECT_NOTIFY: 0x01,
    /** 疎通確認。デバイスは RSP_OK を返すだけ。 */
    PING: 0x20,
    /** ピンのモード設定。 [1]=pin [2]=mode */
    PIN_MODE: 0x21,
    /** デジタル出力。 [1]=pin [2]=value(0/1) */
    DIGITAL_WRITE: 0x22,
    /** デジタル入力。RSP_DATA で 0/1 が返る。 [1]=pin */
    DIGITAL_READ: 0x23,
    /** アナログ出力 (PWM)。 [1]=pin [2]=value(0-255) */
    ANALOG_WRITE: 0x24,
    /** アナログ入力。RSP_DATA で読み取り値が返る。 [1]=pin */
    ANALOG_READ: 0x25
};

/**
 * UIAPduino → Web の Input Report 先頭バイト (マーカー)。
 * コマンド応答以外にも、デバイスは非同期にコンソール出力とログを投げてくる。
 */
const MARKER = {
    /** コンソール出力 (hid.Print / hid.Println 相当) */
    CONSOLE: 0x50,
    /** コマンド応答 */
    RSP: 0x52,
    /** デバイスログ ('D') */
    LOG: 0x44
};

/**
 * コマンド応答のステータス (Input Report の [1])。
 * uiapruby の rsp() と同じ値。
 */
const RSP = {
    /** 正常終了。戻り値なし。 */
    OK: 0,
    /** エラー終了。 */
    ERR: 1,
    /** 戻り値の一部。[2]=このレポートに載っているバイト数 (0..5)、[3..7]=中身。 */
    DATA: 2,
    /** 戻り値の終端。 */
    END: 3
};

/** コンソール出力のフラグ (Input Report の [1]) */
const CONSOLE_MORE = 0x80;

/** 応答が返らない場合に諦めるまでの時間 (ms) */
const COMMAND_TIMEOUT = 3000;

/**
 * ── ワイヤフォーマット ──────────────────────────────────────────────────────
 *
 * Web → UIAPduino  Feature Report (32 バイト)
 *
 *   [0]    コマンド ID (CMD.*)
 *   [1..]  パラメータ
 *
 * UIAPduino → Web  Input Report (8 バイト)
 *
 *   コマンド応答
 *     [0]    0x52 (MARKER.RSP)
 *     [1]    ステータス (RSP.*)
 *     [2]    ペイロード長 (0..5)
 *     [3..7] ペイロード
 *
 *   コンソール出力
 *     [0]    0x50 (MARKER.CONSOLE)
 *     [1]    フラグ (0x80 = 続きあり)
 *     [2..7] テキスト (0 終端)
 *
 *   デバイスログ
 *     [0]    0x44 (MARKER.LOG)
 *     [1]    ログ種別
 *     [2..7] 付随データ
 *
 * 戻り値を返すコマンドは RSP.DATA を必要な回数繰り返してから RSP.END で終端する。
 * 戻り値のないコマンドは RSP.OK だけを返す。
 *
 * ── シーケンス番号がないことによる制約 ──────────────────────────────────────
 * このワイヤフォーマットには送受を対応付ける番号がない。
 * したがってタイムアウト後に遅れて届いた応答は、次のコマンドの応答と区別できない。
 * ここでは「待ち手がいない応答は捨てる」ことしかできないので、
 * タイムアウトが起きた時点で警告を出し、キューのクリアか再接続を促す。
 */

class UiapduinoProcessor {
    constructor () {
        this.device = null;
        this.featureReportSize = FEATURE_REPORT_SIZE;

        /** 送信待ちコマンドの配列。要素は {payload, resolve, reject} */
        this.queue = [];
        /** 現在応答待ちのコマンド。null なら送信可能。 */
        this.pending = null;
        /** タイムアウトが起きて送受のずれが疑われる状態か */
        this.desyncSuspected = false;

        /** コンソール出力の組み立てバッファ (マルチバイト文字がチャンクをまたぐため) */
        this.consoleBytes = [];

        /** navigator.hid の disconnect を購読済みか (重複登録を避ける) */
        this.disconnectHooked = false;

        /**
         * デバイスのコンソール出力を受け取るコールバック。
         * 既定では開発者コンソールに出す。差し替えれば Scratch 側に見せられる。
         * @param {string} text - デコード済みテキスト
         */
        this.onConsoleText = text => console.log(`[uiapduino] ${text}`);

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
     *       uiap-hid-web は全ページ requestDevice() のみで getDevices() を使っていないため、
     *       この経路はサイト側では一度も踏まれていない。実機で最初に検証すべき箇所。
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
            const granted = (await navigator.hid.getDevices()).filter(d => (
                d.vendorId === DEVICE_FILTER.vendorId &&
                d.productId === DEVICE_FILTER.productId
            ));
            // USB 設定が Keyboard+Mouse+WebHID の場合、同じ VID/PID で
            // キーボード / マウスのコレクションも見えることがある。
            // ベンダー定義コレクション (0xFF00 / 0x01) を持つものを優先する。
            let device = granted.find(d => (d.collections || []).some(c => (
                c.usagePage === DEVICE_FILTER.usagePage &&
                c.usage === DEVICE_FILTER.usage
            ))) || granted[0];

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

            this._hookDisconnect();

            // 再接続時に Chromium が同じ HIDDevice を使い回すことがあるため、
            // 二重登録にならないよう一度外してから付ける。
            device.removeEventListener('inputreport', this._onInputReport);
            device.addEventListener('inputreport', this._onInputReport);
            this.device = device;
            this.featureReportSize = this._detectFeatureReportSize(device);
            this.consoleBytes = [];
            this.desyncSuspected = false;

            await this._sendConnectNotify();

            return true;
        } catch (e) {
            console.error('[uiapduino] connect failed:', e);
            return false;
        }
    }

    /**
     * USB が抜かれたことを検知できるようにする。
     *
     * WebHID では物理的に切断されても HIDDevice.opened は自動的に false にならない。
     * これを購読しないと isConnected() が true を返し続け、さらに再接続時に
     * Chromium が新しい HIDDevice を作るため、古いハンドルへの送信が無視される。
     * uiap-hid-web の各ページも同じ購読をしている。
     *
     * @returns {void}
     */
    _hookDisconnect () {
        if (this.disconnectHooked || !navigator.hid) return;
        navigator.hid.addEventListener('disconnect', event => {
            if (!this.device || event.device !== this.device) return;
            console.warn('[uiapduino] device disconnected');
            this._teardown();
        });
        this.disconnectHooked = true;
    }

    /**
     * 接続状態を捨てる。実行待ちのコマンドはすべて reject する。
     * 物理的に外れている場合を含むので close() は呼ばない。
     * @returns {void}
     */
    _teardown () {
        if (this.device) {
            this.device.removeEventListener('inputreport', this._onInputReport);
            this.device = null;
        }
        this.consoleBytes = [];
        // device を null にしてから捨てる (_dequeue が送信を試みないように)
        this.resetQueue();
    }

    /**
     * 切断する。
     * @returns {Promise<void>} 切断完了
     */
    async disconnect () {
        const device = this.device;
        this._teardown();
        if (device && device.opened) {
            try {
                await device.close();
            } catch (e) {
                // 既に物理的に外れている場合は close() が失敗する
                console.warn('[uiapduino] close failed:', e);
            }
        }
    }

    /**
     * 接続通知 (0x01) を送る。
     * デバイス側で WaitAvailable() が待っている場合、これを送らないと起動しない。
     * 応答は返らないので待たない。
     * @returns {Promise<void>} 送信完了
     */
    async _sendConnectNotify () {
        const payload = new Uint8Array(this.featureReportSize);
        payload[0] = CMD.CONNECT_NOTIFY;
        try {
            await this.device.sendFeatureReport(REPORT_ID, payload);
        } catch (e) {
            // 接続通知を受け取らないスケッチもあるので、失敗しても接続自体は続行する
            console.warn('[uiapduino] connect notify failed:', e);
        }
    }

    /**
     * HID ディスクリプタから Feature Report の実サイズを取得する。
     * arduino_core_ch32 のバージョンによって 16 / 32 バイトと異なるため。
     * @param {HIDDevice} device - 接続済みデバイス
     * @returns {number} Feature Report のバイト数
     */
    _detectFeatureReportSize (device) {
        for (const collection of device.collections || []) {
            const reports = collection.featureReports || [];
            // 番号なしレポート (reportId === 0) を優先する。uiap-hid-web と同じ選び方。
            const report = reports.find(r => r.reportId === REPORT_ID) || reports[0];
            if (!report) continue;
            const bits = (report.items || []).reduce(
                (sum, item) => sum + ((item.reportSize || 0) * (item.reportCount || 0)),
                0
            );
            if (bits > 0) return Math.ceil(bits / 8);
        }
        return FEATURE_REPORT_SIZE;
    }

    /**
     * コマンドをキューに積む。
     *
     * 応答を待つ Promise を返すので、ブロック側でそのまま return すれば
     * Scratch がデバイスの完了を待ってから次のブロックに進む。
     *
     * @param {number} command - CMD.* のいずれか
     * @param {Array<number>} params - パラメータのバイト列
     * @param {number} [timeout] - 応答を諦めるまでの時間 (ms)
     * @returns {Promise<number>} 戻り値。戻り値のないコマンドは 0
     */
    request (command, params = [], timeout = COMMAND_TIMEOUT) {
        if (!this.isConnected()) {
            return Promise.reject(new Error('uiapduino is not connected'));
        }

        const payload = new Uint8Array(this.featureReportSize);
        payload[0] = command;
        params.forEach((value, i) => {
            payload[1 + i] = value & 0xFF;
        });

        return new Promise((resolve, reject) => {
            this.queue.push({command, payload, timeout, resolve, reject, data: []});
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
        this.desyncSuspected = false;
    }

    /**
     * キューの先頭を送信する。応答待ちの間は何もしない。
     * @returns {void}
     */
    _dequeue () {
        if (this.pending || this.queue.length === 0) return;
        if (!this.isConnected()) {
            // 応答の処理中に切断された場合。残りは捨てる。
            this.resetQueue();
            return;
        }

        const item = this.queue.shift();
        this.pending = item;
        this._armTimer(item);

        this.device.sendFeatureReport(REPORT_ID, item.payload)
            .catch(e => {
                this._clearPending(e);
                this._dequeue();
            });
    }

    /**
     * 応答待ちのタイムアウトを (再) 設定する。
     * RSP.DATA が届くたびに掛け直すので、長い戻り値でも途中で切れない。
     * @param {object} item - 応答待ちのコマンド
     * @returns {void}
     */
    _armTimer (item) {
        clearTimeout(item.timer);
        item.timer = setTimeout(() => {
            // シーケンス番号がないため、ここで遅れて届く応答と次のコマンドの応答は区別できない
            this.desyncSuspected = true;
            console.warn(
                `[uiapduino] command 0x${item.command.toString(16)} timed out. ` +
                '応答がずれている可能性があります。キューをクリアするか再接続してください。'
            );
            this._clearPending(new Error(`command timed out (0x${item.command.toString(16)})`));
            this._dequeue();
        }, item.timeout);
    }

    /**
     * 応答待ちを解除する。理由が渡されたら reject する。
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
     * 応答待ちを完了させて次へ進む。
     * @param {Error} [error] - 失敗理由。無ければ value で resolve する
     * @param {number} [value] - 戻り値
     * @returns {void}
     */
    _finishPending (error, value) {
        const item = this.pending;
        if (!item) return;
        clearTimeout(item.timer);
        this.pending = null;
        if (error) {
            item.reject(error);
        } else {
            item.resolve(value);
        }
        this._dequeue();
    }

    /**
     * UIAPduino からの Input Report を処理する。
     * コマンド応答のほかに、コンソール出力とデバイスログが非同期に届く。
     * @param {HIDInputReportEvent} event - inputreport イベント
     * @returns {void}
     */
    _onInputReport (event) {
        const view = event.data;
        if (view.byteLength < INPUT_REPORT_SIZE) return;

        const d = new Uint8Array(INPUT_REPORT_SIZE);
        for (let i = 0; i < INPUT_REPORT_SIZE; i++) {
            d[i] = view.getUint8(i);
        }

        switch (d[0]) {
        case MARKER.RSP:
            this._handleResponse(d);
            break;
        case MARKER.CONSOLE:
            this._handleConsole(d);
            break;
        case MARKER.LOG:
            this._handleLog(d);
            break;
        default:
            // 未知のパケット。将来 0x51 (GetPos) などを扱うならここに足す。
            break;
        }
    }

    /**
     * コマンド応答 (0x52) を処理する。
     * @param {Uint8Array} d - Input Report 8 バイト
     * @returns {void}
     */
    _handleResponse (d) {
        if (!this.pending) {
            // タイムアウト後に遅れて届いた応答。対応付ける手段がないので捨てる。
            console.warn('[uiapduino] response arrived with no pending command; dropped');
            return;
        }

        const status = d[1];
        const length = Math.min(d[2], INPUT_REPORT_SIZE - 3);

        switch (status) {
        case RSP.OK:
            this._finishPending(null, 0);
            break;
        case RSP.ERR:
            this._finishPending(new Error(`uiapduino returned RSP_ERR (0x${this.pending.command.toString(16)})`));
            break;
        case RSP.DATA:
            for (let i = 0; i < length; i++) {
                this.pending.data.push(d[3 + i]);
            }
            // まだ続きが来るので待ち直す
            this._armTimer(this.pending);
            break;
        case RSP.END:
            // END で終わる応答は必ず 1 つ以上の DATA を伴う。
            // DATA が 1 つも無いのは、ホストのポーリングのばらつきで
            // DATA レポートが上書き消失した場合。0 を正常値として返すと
            // センサー値が黙って 0 になるので、エラーとして表に出す。
            if (this.pending.data.length === 0) {
                this._finishPending(new Error('uiapduino response lost its payload (RSP_DATA missing)'));
            } else {
                this._finishPending(null, this._toValue(this.pending.data));
            }
            break;
        default:
            this._finishPending(new Error(`uiapduino returned unknown status ${status}`));
            break;
        }
    }

    /**
     * RSP.DATA で集めたバイト列をリトルエンディアンの数値にする。
     * @param {Array<number>} bytes - 集めたバイト列
     * @returns {number} 数値。バイトが無ければ 0
     */
    _toValue (bytes) {
        let value = 0;
        for (let i = bytes.length - 1; i >= 0; i--) {
            value = (value * 256) + bytes[i];
        }
        return value;
    }

    /**
     * コンソール出力 (0x50) を処理する。
     * 続きありフラグが落ちた時点でまとめて UTF-8 デコードする。
     * チャンク境界をマルチバイト文字がまたぐため、1 レポートずつデコードしてはいけない。
     * @param {Uint8Array} d - Input Report 8 バイト
     * @returns {void}
     */
    _handleConsole (d) {
        for (let i = 2; i < INPUT_REPORT_SIZE; i++) {
            if (d[i] === 0) break;
            this.consoleBytes.push(d[i]);
        }
        if (d[1] & CONSOLE_MORE) return;

        const text = new TextDecoder().decode(new Uint8Array(this.consoleBytes));
        this.consoleBytes = [];
        if (text.length > 0 && this.onConsoleText) {
            this.onConsoleText(text);
        }
    }

    /**
     * デバイスログ (0x44) を処理する。
     * 種別はスケッチごとに異なるので、ここでは開発者コンソールに素通しする。
     * @param {Uint8Array} d - Input Report 8 バイト
     * @returns {void}
     */
    _handleLog (d) {
        const body = Array.from(d.slice(2))
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ');
        console.log(`[uiapduino] log type=0x${d[1].toString(16).padStart(2, '0')} ${body}`);
    }
}

module.exports = UiapduinoProcessor;
module.exports.CMD = CMD;
module.exports.MARKER = MARKER;
module.exports.RSP = RSP;
