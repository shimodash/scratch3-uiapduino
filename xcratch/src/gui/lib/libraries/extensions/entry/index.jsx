/**
 * Xcratch の拡張機能一覧に出す情報。
 *
 * デスクトップ版の scratch-gui/src/lib/libraries/extensions/index.jsx に相当する。
 * 向こうは React 要素 (FormattedMessage) を返すが、Xcratch は読み込み時に
 * setFormatMessage で自分の formatMessage を渡してくるので、こちらは文字列で作る。
 *
 * 画像はデスクトップ版と同じものを直接参照している。rollup の image プラグインが
 * data URI に変換して .mjs に埋め込むので、リポジトリに複製を置く必要はない。
 */

import iconURL from '../../../../../../../scratch-gui/src/lib/libraries/extensions/uiapduino/uiapduino.png';
import insetIconURL from '../../../../../../../scratch-gui/src/lib/libraries/extensions/uiapduino/uiapduino-small.png';
import connectionIconURL from '../../../../../../../scratch-gui/src/lib/libraries/extensions/uiapduino/uiapduino-illustration.png';
import translations from './translations.json';
import {version as packageVersion} from '../../../../../../package.json';

/**
 * 訳文を引く関数。読み込み時に Xcratch のものへ差し替わる。
 * 差し替わるまでは defaultMessage をそのまま返す。
 * @param {object} messageData - format-message へ渡す形
 * @returns {string} 現在の言語の文字列
 */
let formatMessage = messageData => messageData.defaultMessage;

const version = `v${packageVersion}`;

const entry = {
    get name () {
        return formatMessage({
            id: 'uiapduino.entry.name',
            defaultMessage: 'UIAPduino',
            description: 'name of the extension'
        });
    },
    extensionId: 'uiapduino',
    // ⚠ 公開したら二度と変えられない。Xcratch はプロジェクトにこの URL を書き込み、
    //   次に開くときここから読み直すため。理由と組み立て方は
    //   scratch-vm/src/extensions/scratch3_uiapduino/index.js の extensionURL を参照。
    //   あちらと必ず同じ値にすること。
    extensionURL: 'https://tarosay.github.io/scratch3-uiapduino/uiapduino.mjs',
    collaborator: 'tarosay',
    iconURL: iconURL,
    insetIconURL: insetIconURL,
    get description () {
        // ⚠ 対応ブラウザをここに書いてあるのは、間違えたときに何も分からないため。
        //   Firefox には WebHID が無い。それでも拡張は追加できてブロックも並び、
        //   接続だけが失敗する。しかもモーダルは「デバイスが見つかりませんでした」としか
        //   言わない (本当の理由 WebHID is not available は console にしか出ない)。
        //
        //   だから「つなぐには要る」と書く。ブロックが出ているのに繋がらない人が、
        //   自分の話だと気づけるようにするため。ブロックの「UIAPduino につなぐ」と
        //   同じ言葉にしてあるのも同じ理由。
        //
        //   対応していないブラウザを名指ししないのは、数え上げると必ず漏れるから
        //   (Firefox だけでなく Safari にも WebHID は無い)。
        return `${formatMessage({
            id: 'uiapduino.entry.description',
            defaultMessage: 'Create your own controller! Chrome or Edge is required to connect to UIAPduino.',
            description: 'description of the extension'
        })} (${version})`;
    },
    tags: ['hardware', 'usb', 'keyboard', 'mouse'],
    featured: true,
    disabled: false,
    // Bluetooth ではなく WebHID を使う。Scratch Link も要らない。
    bluetoothRequired: false,
    internetConnectionRequired: false,
    // 拡張を追加した直後に接続モーダルを開く。
    // キャンセルされても拡張は追加済みのままで、後からステータスボタンで接続できる。
    launchPeripheralConnectionFlow: true,
    // Bluetooth 機器向けの「本体のボタンを押してください」画面を使わず、通常の検索ステップにする。
    useAutoScan: false,
    // 接続モーダルの絵。高さ 165px ちょうどで作ってある
    // (理由はデスクトップ版の index.jsx のコメントを参照)。
    connectionIconURL: connectionIconURL,
    connectionSmallIconURL: insetIconURL,
    get connectingMessage () {
        return formatMessage({
            id: 'uiapduino.entry.connectingMessage',
            defaultMessage: 'Connecting to UIAPduino',
            description: 'message shown while connecting'
        });
    },
    helpLink: 'https://github.com/tarosay/scratch3-uiapduino#readme',
    setFormatMessage: formatter => {
        formatMessage = formatter;
    },
    translationMap: translations
};

export {entry}; // loadable-extension needs this line.
export default entry;
