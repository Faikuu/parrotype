import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import type { SlowPair } from '@/lib/engine/bigrams';

interface SlowestPairsProps {
  pairs: readonly SlowPair[];
  onPractice: () => void;
}

/** The letter pairs that take longest between keys, accumulated over tests, with a button to practise them. */
export function SlowestPairs({ pairs, onPractice }: SlowestPairsProps) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="slowest-pairs-title" className="flex flex-col gap-3">
      <h3 id="slowest-pairs-title" className="m-0 text-[0.95rem] font-medium text-sub">
        {t('results:slowestPairs')}
      </h3>
      <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
        {pairs.map((p) => (
          <li key={p.pair} className="flex items-baseline gap-2">
            <span className="text-text [font-family:var(--font-test)]">{p.pair}</span>
            <span className="tabular text-[0.95rem] text-sub">{t('results:pairMs', { ms: Math.round(p.avgMs) })}</span>
          </li>
        ))}
      </ul>
      <div>
        <Button variant="ghost" onClick={onPractice}>
          {t('results:practicePairs')}
        </Button>
      </div>
    </section>
  );
}
