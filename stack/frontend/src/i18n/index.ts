import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { useSettings } from '@/store/settings';
import en from './en.json';
import de from './de.json';
import es from './es.json';
import pl from './pl.json';
import { testLocale } from '@/features/test/locale';
import { pagesLocale } from '@/features/auth/locale';
import { raceLocale } from '@/features/race/locale';
import { learnLocale } from '@/features/learn/locale';
import { adminLocale } from '@/features/admin/locale';
import { notificationsLocale } from '@/features/notifications/locale';
import { announcementsLocale } from '@/features/announcements/locale';
import { eventsLocale } from '@/features/events/locale';

export const resources = {
  en: { ...en, ...testLocale.en, ...pagesLocale.en, ...raceLocale.en, ...learnLocale.en, ...adminLocale.en, ...notificationsLocale.en, ...announcementsLocale.en, ...eventsLocale.en },
  de: { ...de, ...testLocale.de, ...pagesLocale.de, ...raceLocale.de, ...learnLocale.de, ...adminLocale.de, ...notificationsLocale.de, ...announcementsLocale.de, ...eventsLocale.de },
  es: { ...es, ...testLocale.es, ...pagesLocale.es, ...raceLocale.es, ...learnLocale.es, ...adminLocale.es, ...notificationsLocale.es, ...announcementsLocale.es, ...eventsLocale.es },
  pl: { ...pl, ...testLocale.pl, ...pagesLocale.pl, ...raceLocale.pl, ...learnLocale.pl, ...adminLocale.pl, ...notificationsLocale.pl, ...announcementsLocale.pl, ...eventsLocale.pl },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: useSettings.getState().uiLanguage,
  fallbackLng: 'en',
  supportedLngs: ['en', 'pl', 'de', 'es'],
  ns: Object.keys(resources.en),
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
