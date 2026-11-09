import type { Language } from '@/lib/engine/types';

export interface BuiltinQuote {
  text: string;
  source: string;
}

// Public-domain sentences used when the quotes API is unreachable or has nothing for the request.
const BUILTIN: Record<Language, readonly BuiltinQuote[]> = {
  en: [
    {
      text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
      source: 'Jane Austen, Pride and Prejudice',
    },
    {
      text: 'I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach.',
      source: 'Henry David Thoreau, Walden',
    },
  ],
  de: [
    {
      text: 'Übung macht den Meister.',
      source: 'Sprichwort',
    },
    {
      text: 'Fest gemauert in der Erden steht die Form, aus Lehm gebrannt. Heute muß die Glocke werden! Frisch, Gesellen, seid zur Hand!',
      source: 'Friedrich Schiller, Das Lied von der Glocke',
    },
  ],
  es: [
    {
      text: 'Más vale pájaro en mano que cien volando.',
      source: 'Refrán',
    },
    {
      text: 'Polvo serán, mas polvo enamorado.',
      source: 'Francisco de Quevedo',
    },
  ],
  pl: [
    {
      text: 'Litwo! Ojczyzno moja! ty jesteś jak zdrowie: ile cię trzeba cenić, ten tylko się dowie, kto cię stracił.',
      source: 'Adam Mickiewicz, Pan Tadeusz',
    },
  ],
};

export function pickBuiltinQuote(language: Language, rng: () => number = Math.random): BuiltinQuote {
  const list = BUILTIN[language];
  const index = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return list[index] ?? list[0]!;
}
