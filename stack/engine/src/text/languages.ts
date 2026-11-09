import type { Language } from '../engine/types';
import { de } from './wordlists/de';
import { en } from './wordlists/en';
import { es } from './wordlists/es';
import { pl } from './wordlists/pl';

export const LANGUAGES: readonly Language[] = ['en', 'pl', 'de', 'es'];

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  pl: 'Polski',
  de: 'Deutsch',
  es: 'Español',
};

/** Word list per language (lowercase, no duplicates). */
export const WORDLISTS: Record<Language, readonly string[]> = { en, pl, de, es };
