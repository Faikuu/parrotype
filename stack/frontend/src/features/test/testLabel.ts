import type { TestConfig } from '@/lib/engine/types';

/** Snippet language names, as they are written (not translated). */
const CODE_NAMES: Record<TestConfig['codeLanguage'], string> = { js: 'JavaScript', py: 'Python', rs: 'Rust', go: 'Go' };

export function testLabel(cfg: TestConfig, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const mode = t(`settings:modes.${cfg.mode}`).toLowerCase();
  let value = '';
  switch (cfg.mode) {
    case 'code':
      value = CODE_NAMES[cfg.codeLanguage];
      break;
    case 'time':
      value = String(cfg.time);
      break;
    case 'words':
      value = String(cfg.words);
      break;
    case 'quote':
      value = t(`settings:quoteLengths.${cfg.quoteLength}`).toLowerCase();
      break;
    case 'pangram':
      value = String(cfg.pangramCount);
      break;
    default:
      break;
  }
  // Code snippets are not in a spoken language, so the language is left out of their label.
  const code = cfg.mode === 'code';
  return [
    mode,
    value,
    code ? '' : cfg.language,
    !code && cfg.punctuation ? t('results:punctuationOn') : '',
    !code && cfg.numbers ? t('results:numbersOn') : '',
  ]
    .filter((p) => p.length > 0)
    .join(' ');
}
