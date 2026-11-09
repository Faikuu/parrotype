import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import type { SortOrder } from '@/lib/api/types';
import { formatNumber } from '@/features/account/format';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** When set, the header sorts by this key. */
  sortKey?: string;
  /** The order a column starts in when first chosen (dates and counts start descending). */
  defaultOrder?: SortOrder;
  align?: 'start' | 'end';
  cellClassName?: string;
}

export interface TableSort {
  key: string;
  order: SortOrder;
}

export interface TablePage {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  /** Shown when there are no rows and nothing is loading. */
  empty: ReactNode;
  sort?: TableSort;
  onSort?: (sort: TableSort) => void;
  pagination?: TablePage;
  /** The table's minimum width. Below it the table scrolls sideways inside its wrapper. */
  minWidth?: string;
  rowClassName?: (row: T) => string | undefined;
}

/**
 * A dense table: sortable headers, a pagination footer, and empty and loading rows. The sort and the
 * page belong to the caller (usually the URL), so this component only reports changes.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  sort,
  onSort,
  pagination,
  minWidth = 'min-w-[640px]',
  rowClassName,
}: DataTableProps<T>) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const colCount = columns.length;

  function sortBy(col: Column<T>) {
    if (!col.sortKey || !onSort) return;
    if (sort?.key === col.sortKey) {
      onSort({ key: col.sortKey, order: sort.order === 'asc' ? 'desc' : 'asc' });
    } else {
      onSort({ key: col.sortKey, order: col.defaultOrder ?? 'asc' });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className={cn('w-full border-collapse text-left', minWidth)}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-[0.9rem] text-sub">
              {columns.map((col) => {
                const active = sort && col.sortKey === sort.key;
                const ariaSort = active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined;
                const Icon = !col.sortKey ? null : active ? (sort.order === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={col.sortKey ? (ariaSort ?? 'none') : undefined}
                    className={cn('whitespace-nowrap border-b border-surface py-2 pr-4 font-normal last:pr-0', col.align === 'end' && 'text-right')}
                  >
                    {col.sortKey && onSort ? (
                      <button
                        type="button"
                        onClick={() => sortBy(col)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-[6px] hover:text-text',
                          active && 'text-text',
                        )}
                      >
                        {col.header}
                        {Icon && <Icon size={14} aria-hidden="true" className={cn(!active && 'opacity-50')} />}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className={cn('group border-b border-surface align-top hover:bg-surface/50', rowClassName?.(row))}>
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={cn('py-3 pr-4 last:pr-0', col.align === 'end' && 'text-right tabular', col.cellClassName)}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-8 text-text">
                  {empty}
                </td>
              </tr>
            )}
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-8 text-sub" aria-live="polite">
                  {t('common:loading')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total > 0 && (
        <PageFooter pagination={pagination} lang={lang} />
      )}
    </div>
  );
}

function PageFooter({ pagination, lang }: { pagination: TablePage; lang: string }) {
  const { t } = useTranslation();
  const { page, pageSize, total, onPageChange } = pagination;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label={t('admin:table.pages')} className="flex flex-wrap items-center justify-between gap-3 text-[0.9rem] text-sub">
      <span className="tabular" aria-live="polite">
        {t('admin:table.range', { from: formatNumber(from, lang), to: formatNumber(to, lang), total: formatNumber(total, lang) })}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" className="px-2.5 py-1.5" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={16} aria-hidden="true" />
          {t('admin:table.prev')}
        </Button>
        <span className="tabular px-2 text-text">
          {t('admin:table.pageOf', { page: formatNumber(page, lang), pages: formatNumber(pages, lang) })}
        </span>
        <Button variant="ghost" className="px-2.5 py-1.5" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          {t('admin:table.next')}
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
