import { useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivityDay } from '@/lib/api/types';
import { buildCalendar, formatUtcDay, monthLabels, todayUtc } from './calendar';

const CELL = 11;
const GAP = 3;
const WEEKDAY_COL = 28;
const MONTH_ROW = 14;
/** Level 0 is the plain surface; levels 1-4 mix the accent into it. */
const LEVEL_COLOR = [
  'var(--surface)',
  'color-mix(in oklab, var(--main) 25%, var(--surface))',
  'color-mix(in oklab, var(--main) 45%, var(--surface))',
  'color-mix(in oklab, var(--main) 65%, var(--surface))',
  'color-mix(in oklab, var(--main) 90%, var(--surface))',
];

/**
 * A GitHub-style grid of the last 53 weeks, one cell per UTC day. The grid is decorative for
 * screen readers; the <details> table under it lists the same days.
 */
export function ActivityCalendar({ activity, today }: { activity: ActivityDay[]; today?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const scrollRef = useRef<HTMLDivElement>(null);

  const grid = useMemo(
    () => buildCalendar(activity, today ?? todayUtc()),
    [activity, today],
  );
  const months = useMemo(() => monthLabels(grid), [grid]);

  // Start scrolled to the end, so the most recent weeks (today) are in view on narrow screens.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [grid]);

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' });
    // 2026-11-02 is a Monday; rows 0, 2 and 4 are Mon, Wed and Fri.
    return [0, 2, 4].map((row) => ({
      row,
      label: fmt.format(new Date(Date.UTC(2026, 10, 2 + row))),
    }));
  }, [lang]);

  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' }),
    [lang],
  );

  const days = useMemo(
    () => [...activity].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [activity],
  );

  const columns = grid.length;

  return (
    <div className="w-full">
      <div
        ref={scrollRef}
        role="region"
        aria-label={t('insights.calendar.label')}
        tabIndex={0}
        className="overflow-x-auto pb-2"
      >
        <div
          aria-hidden="true"
          className="inline-grid text-[0.75rem] text-sub"
          style={{
            gridTemplateColumns: `${WEEKDAY_COL}px repeat(${columns}, ${CELL}px)`,
            gridTemplateRows: `${MONTH_ROW}px repeat(7, ${CELL}px)`,
            columnGap: GAP,
            rowGap: GAP,
          }}
        >
          {months.map((m) => (
            <span
              key={`m-${m.column}`}
              className="leading-[14px] whitespace-nowrap"
              style={{ gridColumn: m.column + 2, gridRow: 1 }}
            >
              {monthFmt.format(new Date(Date.UTC(2026, m.month, 1)))}
            </span>
          ))}
          {weekdays.map((w) => (
            <span
              key={`w-${w.row}`}
              className="leading-[11px] whitespace-nowrap"
              style={{ gridColumn: 1, gridRow: w.row + 2 }}
            >
              {w.label}
            </span>
          ))}
          {grid.map((week, column) =>
            week.map((cell, row) =>
              cell === null ? null : (
                <span
                  key={cell.date}
                  title={
                    cell.tests > 0
                      ? t('insights.calendar.cell', {
                          count: cell.tests,
                          date: formatUtcDay(cell.date, lang),
                        })
                      : t('insights.calendar.none', { date: formatUtcDay(cell.date, lang) })
                  }
                  className="rounded-[2px]"
                  style={{
                    gridColumn: column + 2,
                    gridRow: row + 2,
                    background: LEVEL_COLOR[cell.level],
                  }}
                />
              ),
            ),
          )}
        </div>
      </div>

      <div aria-hidden="true" className="mt-2 flex items-center gap-1 text-[0.75rem] text-sub">
        <span className="mr-1">{t('insights.calendar.less')}</span>
        {LEVEL_COLOR.map((color, i) => (
          <span
            key={i}
            className="rounded-[2px]"
            style={{ width: CELL, height: CELL, background: color }}
          />
        ))}
        <span className="ml-1">{t('insights.calendar.more')}</span>
      </div>

      <details className="mt-4 text-[0.95rem]">
        <summary className="cursor-pointer text-main underline underline-offset-4">
          {t('insights.calendar.tableSummary')}
        </summary>
        {days.length === 0 ? (
          <p className="mt-3 text-sub">{t('insights.calendar.tableEmpty')}</p>
        ) : (
          <div className="mt-3 max-h-[320px] overflow-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-sub">
                  <th scope="col" className="py-1 pr-4 font-normal">
                    {t('insights.calendar.tableDate')}
                  </th>
                  <th scope="col" className="py-1 text-right font-normal">
                    {t('insights.calendar.tableTests')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date} className="border-t border-surface">
                    <td className="py-1 pr-4 text-text">
                      <time dateTime={d.date}>{formatUtcDay(d.date, lang)}</time>
                    </td>
                    <td className="tabular py-1 text-right text-text">{d.tests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </div>
  );
}
