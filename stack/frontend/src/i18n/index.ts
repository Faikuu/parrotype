import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { useSettings } from '@/store/settings';
import en from './en.json';
import pl from './pl.json';
import { testLocale } from '@/features/test/locale';
import { pagesLocale } from '@/features/auth/locale';
import { raceLocale } from '@/features/race/locale';

export const resources = {
  en: { ...en, ...testLocale.en, ...pagesLocale.en, ...raceLocale.en },
  pl: { ...pl, ...testLocale.pl, ...pagesLocale.pl, ...raceLocale.pl },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: useSettings.getState().uiLanguage,
  fallbackLng: 'en',
  supportedLngs: ['en', 'pl'],
  ns: Object.keys(resources.en),
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
