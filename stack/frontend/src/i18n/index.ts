import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { useSettings } from '@/store/settings';
import en from './en.json';
import pl from './pl.json';

export const resources = { en, pl } as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: useSettings.getState().uiLanguage,
  fallbackLng: 'en',
  supportedLngs: ['en', 'pl'],
  ns: Object.keys(en),
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
