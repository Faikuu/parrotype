import { i18n } from '../i18n.ts'; 

const Translator = (key: string) => {
    return i18n.t(key);
}

export { Translator };