import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { cn } from '@/components/cn';
import { useAuth } from '@/features/auth/useAuth';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { buildCommands, resolveLevel, type Command, type CommandContext } from './commands';
import { fuzzyFilter } from './fuzzy';

/** Renders the palette only while it's open, so every open starts fresh (and the open animation runs). */
export function CommandLine() {
  const open = useUi((s) => s.commandLineOpen);
  if (!open) return null;
  return <Palette />;
}

function Highlighted({ text, indices }: { text: string; indices: readonly number[] }) {
  const marks = new Set(indices);
  return (
    <>
      {text.split('').map((ch, i) =>
        marks.has(i) ? (
          <span key={i} className="text-main">
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}

function Palette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const settings = useSettings();
  const { user, logout } = useAuth();

  const ctx: CommandContext = {
    t: (key, options) => String(t(key, options)),
    settings,
    isLoggedIn: user !== null,
    navigate: (to) => navigate(to),
    logout: () => {
      void logout().then(
        () => navigate('/'),
        () => undefined,
      );
    },
    restart: () => useUi.getState().restart(),
    openCustomText: () => useUi.getState().openCustomText(),
    previewTheme: (id) => useUi.getState().setPreviewTheme(id),
  };
  const root = buildCommands(ctx);

  // Opening with a path (e.g. 'theme') starts the palette in that submenu.
  const [ids, setIds] = useState<string[]>(() => {
    const initialPath = useUi.getState().commandLineInitialPath;
    const segments = initialPath ? initialPath.split('/') : [];
    return resolveLevel(root, segments).trail.map((c) => c.id);
  });
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  const listId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { list, trail } = resolveLevel(root, ids);
  const items = query.trim()
    ? fuzzyFilter(list, query, (c) => c.label, (c) => c.keywords ?? [])
    : list.map((item) => ({ item, indices: [] as number[] }));
  const count = items.length;
  const active = count === 0 ? -1 : Math.min(index, count - 1);
  const activeCmd: Command | undefined = active >= 0 ? items[active]!.item : undefined;
  const activeOptionId = active >= 0 ? `${listId}-${active}` : undefined;

  function close() {
    useUi.getState().closeCommandLine();
  }

  function enter(cmd: Command) {
    setIds((prev) => [...prev, cmd.id]);
    setQuery('');
    setIndex(0);
  }

  function up() {
    setIds((prev) => prev.slice(0, -1));
    setQuery('');
    setIndex(0);
  }

  function activate(cmd: Command) {
    if (cmd.children) {
      enter(cmd);
      return;
    }
    if (cmd.run) {
      cmd.run();
      if (!cmd.keepOpen) close();
    }
  }

  function move(delta: number) {
    if (count === 0) return;
    setIndex((active + delta + count) % count);
  }

  // Theme preview: the highlighted command's onPreview runs; onPreviewEnd runs when the highlight moves on or the palette closes.
  const highlightedRef = useRef<Command | null>(null);
  useEffect(() => {
    const prev = highlightedRef.current;
    if (prev?.id === activeCmd?.id) return;
    prev?.onPreviewEnd?.();
    highlightedRef.current = activeCmd ?? null;
    activeCmd?.onPreview?.();
  }, [activeCmd]);

  useEffect(
    () => () => {
      highlightedRef.current?.onPreviewEnd?.();
      highlightedRef.current = null;
    },
    [],
  );

  // Focus trap: keep focus in the palette and restore it on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onFocusIn = (e: FocusEvent) => {
      if (!dialogRef.current?.contains(e.target as Node)) inputRef.current?.focus();
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, listId]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const key = e.key.toLowerCase();
    if (key === 'arrowdown' || (key === 'tab' && !e.shiftKey) || (e.ctrlKey && key === 'j')) {
      e.preventDefault();
      move(1);
    } else if (key === 'arrowup' || (key === 'tab' && e.shiftKey) || (e.ctrlKey && key === 'k')) {
      e.preventDefault();
      move(-1);
    } else if (key === 'enter') {
      e.preventDefault();
      if (activeCmd) activate(activeCmd);
    } else if (key === 'escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (key === 'backspace' && query === '' && ids.length > 0) {
      e.preventDefault();
      up();
    }
  }

  let prevGroup: string | undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-bg/50 px-4 pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('commands:title')}
        className="cl-panel w-full max-w-[640px] self-start overflow-hidden rounded-[10px] bg-surface shadow-[0_20px_60px_-20px_rgb(0_0_0/.5)]"
      >
        {trail.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1 px-4 pt-3 text-[0.85rem] text-sub">
            {trail.map((c) => (
              <span key={c.id} className="flex items-center gap-1">
                {c.label}
                <ChevronRight size={14} aria-hidden="true" />
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-3 px-4 py-3">
          <Search size={18} aria-hidden="true" className="shrink-0 text-sub" />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            role="combobox"
            aria-label={t('commands:placeholder')}
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            placeholder={t('commands:placeholder')}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent text-[1.05rem] text-text outline-none placeholder:text-sub focus-visible:outline-none"
          />
        </div>

        <ul id={listId} role="listbox" aria-label={t('commands:title')} className="max-h-[50vh] overflow-y-auto px-2 pb-2">
          {items.map(({ item: cmd, indices }, i) => {
            const showGroup = !query.trim() && cmd.group && cmd.group !== prevGroup;
            prevGroup = cmd.group;
            const selected = i === active;
            const Icon = cmd.icon;
            return (
              <Fragment key={cmd.id}>
                {showGroup ? (
                  <li role="presentation" className="px-3 pb-1 pt-3 text-[0.8rem] text-sub">
                    {cmd.group}
                  </li>
                ) : null}
                <li
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => {
                    if (index !== i) setIndex(i);
                  }}
                  onClick={() => activate(cmd)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-[6px] px-3 py-2 text-[0.95rem]',
                    selected ? 'bg-bg/40 text-text' : 'text-sub',
                  )}
                >
                  {Icon ? <Icon size={16} aria-hidden="true" className="shrink-0" /> : null}
                  <span className="min-w-0 truncate">
                    <Highlighted text={cmd.label} indices={indices} />
                  </span>
                  {cmd.hint ? (
                    <span className="ml-auto shrink-0 pl-4 text-[0.8rem] text-sub">{cmd.hint}</span>
                  ) : null}
                  {cmd.children ? <ChevronRight size={14} aria-hidden="true" className="shrink-0" /> : null}
                  {cmd.active ? <Check size={16} aria-hidden="true" className="shrink-0 text-main" /> : null}
                </li>
              </Fragment>
            );
          })}
        </ul>
        {count === 0 ? <p className="px-4 pb-4 text-sub">{t('commands:noResults')}</p> : null}
      </div>
    </div>
  );
}
