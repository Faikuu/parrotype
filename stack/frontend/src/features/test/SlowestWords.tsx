import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import type { WordTiming } from '@/lib/engine/timings';

interface SlowestWordsProps {
  words: readonly WordTiming[];
  onPractice: () => void;
}

/** The slowest words of a test, with their speed, and a button to practise them. */
export function SlowestWords({ words, onPractice }: SlowestWordsProps) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="slowest-words-title" className="flex flex-col gap-3">
      <h3 id="slowest-words-title" className="m-0 text-[0.95rem] font-medium text-sub">
        {t('results:slowestWords')}
      </h3>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {words.map((w) => (
          <li key={w.index} className="flex items-baseline justify-between gap-6 border-b border-surface pb-1.5">
            <span className="text-text [font-family:var(--font-test)]">{w.word}</span>
            <span className="tabular text-[0.95rem] text-sub">{t('results:slowestWpm', { wpm: Math.round(w.wpm) })}</span>
          </li>
        ))}
      </ol>
      <div>
        <Button variant="ghost" onClick={onPractice}>
          {t('results:practiceWords')}
        </Button>
      </div>
    </section>
  );
}
