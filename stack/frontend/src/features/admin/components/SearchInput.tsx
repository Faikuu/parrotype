import { useEffect, useId, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const SEARCH_DELAY_MS = 300;

/**
 * A search box that reports its text 300ms after the last keystroke. The caller keeps the committed
 * value (usually in the URL), and the box follows it when it changes from outside.
 */
export function SearchInput({
  value,
  onCommit,
  label,
  placeholder,
  disabled,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // The committed value changed outside this box (a filter reset, the back button): follow it.
    setSeen(value);
    setDraft(value);
  }

  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  });

  useEffect(() => {
    const next = draft.trim();
    if (next === value) return;
    const timer = window.setTimeout(() => commitRef.current(next), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, value]);

  return (
    <div className="relative flex min-w-[14rem] flex-1 flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.85rem] text-sub">
        {label}
      </label>
      <div className="relative">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sub" />
        <input
          id={id}
          type="search"
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          className="h-9 w-full rounded-[6px] bg-surface pl-8 pr-8 text-[0.95rem] text-text outline-none placeholder:text-sub disabled:opacity-50 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {draft !== '' && (
          <button
            type="button"
            aria-label={t('admin:search.clear')}
            title={t('admin:search.clear')}
            onClick={() => {
              setDraft('');
              commitRef.current('');
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-sub hover:text-text"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
