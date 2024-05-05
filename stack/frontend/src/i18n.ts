import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import enJSON from './locale/en.json';
import plJSON from './locale/pl.json';

i18n
.use(initReactI18next)
.use(LanguageDetector)
.init({
    fallbackLng: "en-US",
    resources: {
        en: { ...enJSON },
        pl: { ...plJSON },
    },
});

export { i18n };