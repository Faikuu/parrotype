import { useTranslation } from 'react-i18next';
import type { BestEntry } from '@/lib/api/types';
import { buildBestRows, formatDate, formatNumber } from './format';
import { languageLabel, modeLabel, optionLabel, type Tr } from './labels';

/** Personal bests table, shared by the account page and public profiles. */
export function BestsTable({ bests, lang }: { bests: BestEntry[]; lang: string }) {
  const { t } = useTranslation();
  const tr: Tr = (k, o) => String(t(k, o));
  const rows = buildBestRows(bests);
  const dash = '–';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-collapse text-left">
        <thead>
          <tr className="text-[0.9rem] text-sub">
            <th scope="col" className="py-2 pr-4 font-normal">{t('account:bests.mode')}</th>
            <th scope="col" className="py-2 pr-4 font-normal">{t('account:bests.option')}</th>
            <th scope="col" className="py-2 pr-4 font-normal">{t('account:bests.language')}</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">{t('account:colWpm')}</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">{t('account:colAcc')}</th>
            <th scope="col" className="py-2 font-normal">{t('account:bests.date')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const first = i === 0 || rows[i - 1]?.mode !== row.mode;
            const b = row.best;
            return (
              <tr key={`${row.mode}-${row.mode2}-${b?.language ?? 'none'}-${i}`} className="border-t border-surface">
                <td className="py-2 pr-4 text-text">{first ? modeLabel(row.mode, tr) : ''}</td>
                <td className="py-2 pr-4 text-sub">
                  {optionLabel(row.mode, row.mode2, tr, lang) || dash}
                </td>
                <td className="py-2 pr-4 text-sub">{b ? languageLabel(b.language) : dash}</td>
                <td className="tabular py-2 pr-4 text-right text-text">{b ? formatNumber(b.wpm, lang) : dash}</td>
                <td className="tabular py-2 pr-4 text-right text-text">
                  {b ? `${formatNumber(b.accuracy, lang, 1)}%` : dash}
                </td>
                <td className="py-2 text-sub">{b ? formatDate(b.createdAt, lang) : dash}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
