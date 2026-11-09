import { describe, expect, it } from 'vitest';
import i18n, { resources } from './index';

// Checks the merged i18next resources (all feature modules included) against the English source.

const TRANSLATED = ['de', 'es', 'pl'] as const;
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /{{\s*([\w.]+)\s*}}/g;

/** Every string leaf under a namespace object, keyed by its dotted path. */
function flatten(node: unknown, prefix = '', out = new Map<string, string>()): Map<string, string> {
  if (typeof node === 'string') {
    out.set(prefix, node);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1] ?? ''))].sort();
}

const en = flatten(resources.en);
const enKeys = [...en.keys()];
/** English plural bases, e.g. `settings.seconds` for `settings.seconds_one` and `settings.seconds_other`. */
const enPluralBases = [
  ...new Set(enKeys.filter((k) => PLURAL_SUFFIX.test(k)).map((k) => k.replace(PLURAL_SUFFIX, ''))),
];

/** The English string a translated key stands for. Extra pl plural forms fall back to the `_other` form. */
function englishFor(key: string): string | undefined {
  return en.get(key) ?? en.get(key.replace(/_(few|many)$/, '_other'));
}

describe('i18n resources', () => {
  it('English has plural bases, so the plural checks below are not vacuous', () => {
    expect(enPluralBases).toContain('settings.seconds');
  });

  for (const lang of ['de', 'es'] as const) {
    describe(lang, () => {
      const translated = flatten(resources[lang]);
      const keys = [...translated.keys()];

      it('has exactly the keys English has', () => {
        const missing = enKeys.filter((k) => !translated.has(k));
        const extra = keys.filter((k) => !en.has(k));
        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
      });

      it('has both _one and _other for every English plural', () => {
        const missing = enPluralBases.flatMap((base) =>
          (['_one', '_other'] as const).filter((s) => !translated.has(base + s)).map((s) => base + s),
        );
        expect(missing).toEqual([]);
      });

      it('has no plural forms that English does not use (_few, _many, ...)', () => {
        const extra = keys.filter((k) => PLURAL_SUFFIX.test(k) && !en.has(k));
        expect(extra).toEqual([]);
      });

      it('has no empty values', () => {
        const empty = keys.filter((k) => translated.get(k)!.trim() === '');
        expect(empty).toEqual([]);
      });

      it('keeps the same placeholders as English', () => {
        const mismatched = keys
          .filter((k) => en.has(k))
          .filter((k) => {
            const want = placeholders(en.get(k)!);
            const got = placeholders(translated.get(k)!);
            return want.join(',') !== got.join(',');
          })
          .map((k) => `${k}: want {${placeholders(en.get(k)!).join(', ')}}`);
        expect(mismatched).toEqual([]);
      });
    });
  }

  describe('pl', () => {
    const translated = flatten(resources.pl);
    const keys = [...translated.keys()];

    it('has every key English has', () => {
      const missing = enKeys.filter((k) => !translated.has(k));
      expect(missing).toEqual([]);
    });

    it('only adds _few and _many plural forms on top of English', () => {
      const extra = keys.filter((k) => !en.has(k));
      const unexpected = extra.filter((k) => !/_(few|many)$/.test(k) || englishFor(k) === undefined);
      expect(unexpected).toEqual([]);
    });

    it('has no empty values', () => {
      const empty = keys.filter((k) => translated.get(k)!.trim() === '');
      expect(empty).toEqual([]);
    });

    it('keeps the same placeholders as English', () => {
      const mismatched = keys
        .filter((k) => englishFor(k) !== undefined)
        .filter((k) => placeholders(englishFor(k)!).join(',') !== placeholders(translated.get(k)!).join(','))
        .map((k) => `${k}: want {${placeholders(englishFor(k)!).join(', ')}}`);
      expect(mismatched).toEqual([]);
    });
  });

  it('registers all four languages with i18next', () => {
    expect(i18n.options.supportedLngs).toEqual(expect.arrayContaining(['en', 'pl', 'de', 'es']));
    for (const lang of TRANSLATED) {
      // Top-level keys are i18next namespaces, so `nav` is the namespace and `test` the key.
      expect(i18n.getResource(lang, 'nav', 'test')).toBeTruthy();
    }
  });
});
