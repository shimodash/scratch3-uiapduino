import {addLocaleData} from 'react-intl';

import {localeData, isRtl} from 'scratch-l10n';
import editorMessages from 'scratch-l10n/locales/editor-msgs';

// --- UIAPduino 拡張の訳文を重ねる ---------------------------------------
//
// scratch-l10n は上流の別パッケージで、npm install のたびに上書きされるため
// `gui.extension.uiapduino.*` を直接足せない。訳文はこのリポジトリ側で持ち、
// ここで上流のメッセージへ重ねる。
//
// 同じ ID があればこちらが勝つ。将来 scratch-l10n 側に訳文が入って
// そちらを使いたくなったら、このファイルではなく uiapduino/messages.js から
// 該当ロケールを消すこと。
import uiapduinoMessages from '../lib/libraries/extensions/uiapduino/messages';

addLocaleData(localeData);

const mergeUiapduinoMessages = messagesByLocale => (
    Object.keys(messagesByLocale).reduce((merged, locale) => {
        merged[locale] = uiapduinoMessages[locale] ?
            Object.assign({}, messagesByLocale[locale], uiapduinoMessages[locale]) :
            messagesByLocale[locale];
        return merged;
    }, {})
);

const allMessages = mergeUiapduinoMessages(editorMessages);

const UPDATE_LOCALES = 'scratch-gui/locales/UPDATE_LOCALES';
const SELECT_LOCALE = 'scratch-gui/locales/SELECT_LOCALE';

const initialState = {
    isRtl: false,
    locale: 'en',
    messagesByLocale: allMessages,
    messages: allMessages.en
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SELECT_LOCALE:
        return Object.assign({}, state, {
            isRtl: isRtl(action.locale),
            locale: action.locale,
            messagesByLocale: state.messagesByLocale,
            messages: state.messagesByLocale[action.locale]
        });
    case UPDATE_LOCALES: {
        // 外からメッセージを差し替えられた場合も UIAPduino の訳文は残す
        const messagesByLocale = mergeUiapduinoMessages(action.messagesByLocale);
        return Object.assign({}, state, {
            isRtl: state.isRtl,
            locale: state.locale,
            messagesByLocale: messagesByLocale,
            messages: messagesByLocale[state.locale]
        });
    }
    default:
        return state;
    }
};

const selectLocale = function (locale) {
    return {
        type: SELECT_LOCALE,
        locale: locale
    };
};

const setLocales = function (localesMessages) {
    return {
        type: UPDATE_LOCALES,
        messagesByLocale: localesMessages
    };
};
const initLocale = function (currentState, locale) {
    if (currentState.messagesByLocale.hasOwnProperty(locale)) {
        return Object.assign(
            {},
            currentState,
            {
                isRtl: isRtl(locale),
                locale: locale,
                messagesByLocale: currentState.messagesByLocale,
                messages: currentState.messagesByLocale[locale]
            }
        );
    }
    // don't change locale if it's not in the current messages
    return currentState;
};
export {
    reducer as default,
    initialState as localesInitialState,
    initLocale,
    selectLocale,
    setLocales
};
