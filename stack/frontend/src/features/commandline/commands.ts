import {
  ArrowRight,
  CaseSensitive,
  Crown,
  Gauge,
  Hash,
  Keyboard,
  Languages,
  LogIn,
  LogOut,
  Paintbrush,
  Palette,
  Pencil,
  Quote,
  RotateCcw,
  Shuffle,
  Sparkles,
  Timer,
  Type,
  User,
  UserPlus,
  Volume2,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react';
import type { CodeLanguage, Language, Mode, PangramCount, QuoteLength, TestConfig, TimeOption, WordsOption } from '@/lib/engine/types';
import { LANGUAGES as LANGUAGE_LIST } from '@/lib/text/languages';
import { LAYOUT_IDS, LAYOUTS } from '@/lib/text/layouts';
import { FONT_IDS, FONTS, THEMES, type ThemeChoice } from '@/themes/themes';
import type {
  CaretStyle,
  FontSize,
  LiveStats,
  PaceCaret,
  QuickRestart,
  Settings,
  SettingsData,
  SoundProfile,
  UiLanguage,
} from '@/store/settings';

export interface Command {
  id: string;
  label: string;
  group?: string;
  icon?: LucideIcon;
  hint?: string;
  keywords?: string[];
  /** Shows a check mark (the current value). */
  active?: boolean;
  /** Leaf action. The palette closes after it unless keepOpen. */
  run?: () => void;
  keepOpen?: boolean;
  /** Submenu. */
  children?: () => Command[];
  /** Called when the command becomes highlighted (theme preview). */
  onPreview?: () => void;
  /** Called when the highlight moves away or the palette closes. */
  onPreviewEnd?: () => void;
}

export interface CommandContext {
  t: (key: string, options?: Record<string, unknown>) => string;
  settings: Settings;
  isLoggedIn: boolean;
  navigate: (to: string) => void;
  logout: () => void;
  restart: () => void;
  openCustomText: () => void;
  openThemeEditor: () => void;
  previewTheme: (id: ThemeChoice | null) => void;
}

type BooleanKey =
  | 'punctuation'
  | 'numbers'
  | 'smoothCaret'
  | 'blindMode'
  | 'focusMode'
  | 'tapeMode'
  | 'noBackspace'
  | 'suddenDeath'
  | 'ghost';

interface Option<V> {
  value: V;
  label: string;
}

function toggle(ctx: CommandContext, id: string, key: BooleanKey, label: string, group: string): Command {
  const on = ctx.settings[key];
  return {
    id,
    label,
    group,
    hint: ctx.t(on ? 'common:on' : 'common:off'),
    keepOpen: true,
    run: () => ctx.settings.set(key, !on),
  };
}

interface ChoiceSpec<K extends keyof SettingsData> {
  id: string;
  key: K;
  label: string;
  group: string;
  icon?: LucideIcon;
  keywords?: string[];
  options: Option<SettingsData[K]>[];
  /** Extra work after the value is set, e.g. opening the custom text modal. */
  onPick?: (value: SettingsData[K]) => void;
}

function choice<K extends keyof SettingsData>(ctx: CommandContext, spec: ChoiceSpec<K>): Command {
  const current = ctx.settings[spec.key];
  const currentOption = spec.options.find((o) => o.value === current);
  return {
    id: spec.id,
    label: spec.label,
    group: spec.group,
    icon: spec.icon,
    keywords: spec.keywords,
    hint: currentOption?.label,
    children: () =>
      spec.options.map((o) => ({
        id: `${spec.id}.${String(o.value)}`,
        label: o.label,
        active: o.value === current,
        run: () => {
          ctx.settings.set(spec.key, o.value);
          spec.onPick?.(o.value);
        },
      })),
  };
}

const MODES: Mode[] = ['time', 'words', 'quote', 'zen', 'pangram', 'custom', 'daily', 'weak', 'code'];
const CODE_LANGUAGES: { value: CodeLanguage; label: string }[] = [
  { value: 'js', label: 'JavaScript' },
  { value: 'py', label: 'Python' },
  { value: 'rs', label: 'Rust' },
  { value: 'go', label: 'Go' },
];
const TIMES: TimeOption[] = [15, 30, 60, 120];
const WORDS: WordsOption[] = [10, 25, 50, 100];
const QUOTE_LENGTHS: QuoteLength[] = ['short', 'medium', 'long', 'any'];
const PANGRAMS: PangramCount[] = [1, 3, 5];
const LANGUAGES: Language[] = [...LANGUAGE_LIST];
const PACE_CARETS: Exclude<PaceCaret, 'custom'>[] = ['off', 'pb', 'average'];
/** Speeds offered under Pace caret → Custom speed. */
const PACE_SPEEDS = [40, 60, 80, 100, 120];
const SOUNDS: SoundProfile[] = ['off', 'click', 'soft', 'typewriter'];
const SOUND_VOLUMES = [0.25, 0.5, 0.75, 1];
const FONT_SIZES: FontSize[] = [1, 1.25, 1.5, 2, 2.5, 3];
const CARET_STYLES: CaretStyle[] = ['line', 'block', 'underline', 'off'];
const LIVE_STATS: LiveStats[] = ['wpm', 'acc', 'both', 'off'];
const STOP_ON_ERROR: TestConfig['stopOnError'][] = ['off', 'letter', 'word'];
const QUICK_RESTART: QuickRestart[] = ['tab', 'esc', 'off'];
const UI_LANGUAGES: UiLanguage[] = ['en', 'pl', 'de', 'es'];

/** Builds the palette's command tree for the current state. Pure apart from calling the ctx functions. */
export function buildCommands(ctx: CommandContext): Command[] {
  const { t, settings: s } = ctx;
  const g = {
    test: t('commands:groups.test'),
    appearance: t('commands:groups.appearance'),
    behaviour: t('commands:groups.behaviour'),
    navigate: t('commands:groups.navigate'),
    account: t('commands:groups.account'),
  };

  const commands: Command[] = [
    choice(ctx, {
      id: 'mode',
      key: 'mode',
      label: t('commands:mode'),
      group: g.test,
      icon: Type,
      keywords: ['test', 'type'],
      options: MODES.map((m) => ({ value: m, label: t(`settings:modes.${m}`) })),
      onPick: (m) => {
        if (m === 'custom' && !ctx.settings.customText) ctx.openCustomText();
      },
    }),
    choice(ctx, {
      id: 'time',
      key: 'time',
      label: t('commands:time'),
      group: g.test,
      icon: Timer,
      options: TIMES.map((n) => ({ value: n, label: t('settings:seconds', { count: n }) })),
    }),
    choice(ctx, {
      id: 'words',
      key: 'words',
      label: t('commands:words'),
      group: g.test,
      icon: Hash,
      options: WORDS.map((n) => ({ value: n, label: t('settings:wordCount', { count: n }) })),
    }),
    choice(ctx, {
      id: 'quoteLength',
      key: 'quoteLength',
      label: t('commands:quoteLength'),
      group: g.test,
      icon: Quote,
      options: QUOTE_LENGTHS.map((q) => ({ value: q, label: t(`settings:quoteLengths.${q}`) })),
    }),
    choice(ctx, {
      id: 'pangramCount',
      key: 'pangramCount',
      label: t('commands:pangramCount'),
      group: g.test,
      icon: Sparkles,
      options: PANGRAMS.map((n) => ({ value: n, label: t('settings:pangrams', { count: n }) })),
    }),
    toggle(ctx, 'punctuation', 'punctuation', t('commands:punctuation'), g.test),
    toggle(ctx, 'numbers', 'numbers', t('commands:numbers'), g.test),
    choice(ctx, {
      id: 'codeLanguage',
      key: 'codeLanguage',
      label: t('commands:codeLanguage'),
      group: g.test,
      keywords: ['code', 'snippet', 'programming'],
      options: CODE_LANGUAGES,
    }),
    choice(ctx, {
      id: 'layout',
      key: 'layout',
      label: t('commands:layout'),
      group: g.test,
      keywords: ['keyboard', 'dvorak', 'colemak', 'workman', 'azerty', 'qwertz', 'emulate'],
      options: LAYOUT_IDS.map((id) => ({ value: id, label: LAYOUTS[id].name })),
    }),
    choice(ctx, {
      id: 'language',
      key: 'language',
      label: t('commands:language'),
      group: g.test,
      icon: Languages,
      options: LANGUAGES.map((l) => ({ value: l, label: t(`settings:languages.${l}`) })),
    }),
    {
      id: 'restart',
      label: t('commands:restart'),
      group: g.test,
      icon: RotateCcw,
      keywords: ['reset', 'new'],
      run: () => ctx.restart(),
    },
    {
      id: 'customText',
      label: t('commands:customText'),
      group: g.test,
      icon: Pencil,
      keywords: ['paste', 'own'],
      run: () => ctx.openCustomText(),
    },

    {
      id: 'theme',
      label: t('commands:theme'),
      group: g.appearance,
      icon: Palette,
      keywords: ['color', 'colour', 'colors'],
      hint: s.theme === 'custom' ? t('commands:themeCustom') : THEMES.find((th) => th.id === s.theme)?.name,
      children: () => {
        const entries: Command[] = THEMES.map((th) => ({
          id: `theme.${th.id}`,
          label: th.name,
          active: th.id === s.theme,
          onPreview: () => ctx.previewTheme(th.id),
          onPreviewEnd: () => ctx.previewTheme(null),
          run: () => {
            ctx.settings.set('theme', th.id);
            ctx.previewTheme(null);
          },
        }));
        if (s.customTheme) {
          entries.push({
            id: 'theme.custom',
            label: t('commands:themeCustom'),
            active: s.theme === 'custom',
            onPreview: () => ctx.previewTheme('custom'),
            onPreviewEnd: () => ctx.previewTheme(null),
            run: () => {
              ctx.settings.set('theme', 'custom');
              ctx.previewTheme(null);
            },
          });
        }
        entries.push({
          id: 'theme.customise',
          label: t('commands:customiseTheme'),
          icon: Paintbrush,
          keywords: ['custom', 'edit', 'colours', 'colors'],
          run: () => ctx.openThemeEditor(),
        });
        return entries;
      },
    },
    {
      id: 'randomTheme',
      label: t('commands:randomTheme'),
      group: g.appearance,
      icon: Shuffle,
      run: () => {
        const others = THEMES.filter((th) => th.id !== s.theme);
        const pick = others[Math.floor(Math.random() * others.length)];
        if (pick) ctx.settings.set('theme', pick.id);
      },
    },
    choice(ctx, {
      id: 'font',
      key: 'font',
      label: t('commands:font'),
      group: g.appearance,
      icon: CaseSensitive,
      options: FONT_IDS.map((f) => ({ value: f, label: FONTS[f].name })),
    }),
    choice(ctx, {
      id: 'fontSize',
      key: 'fontSize',
      label: t('commands:fontSize'),
      group: g.appearance,
      icon: ZoomIn,
      options: FONT_SIZES.map((n) => ({ value: n, label: `${n}×` })),
    }),
    choice(ctx, {
      id: 'caretStyle',
      key: 'caretStyle',
      label: t('commands:caretStyle'),
      group: g.appearance,
      options: CARET_STYLES.map((c) => ({ value: c, label: t(`settings:caretStyles.${c}`) })),
    }),
    toggle(ctx, 'smoothCaret', 'smoothCaret', t('commands:smoothCaret'), g.appearance),
    choice(ctx, {
      id: 'liveStats',
      key: 'liveStats',
      label: t('commands:liveStats'),
      group: g.appearance,
      options: LIVE_STATS.map((l) => ({ value: l, label: t(`settings:liveStatsOptions.${l}`) })),
    }),
    toggle(ctx, 'blindMode', 'blindMode', t('commands:blindMode'), g.appearance),
    toggle(ctx, 'focusMode', 'focusMode', t('commands:focusMode'), g.appearance),
    toggle(ctx, 'tapeMode', 'tapeMode', t('commands:tapeMode'), g.appearance),
    toggle(ctx, 'ghost', 'ghost', t('commands:ghost'), g.test),
    {
      id: 'paceCaret',
      label: t('commands:paceCaret'),
      group: g.appearance,
      icon: Gauge,
      hint: s.paceCaret === 'custom' ? t('settings:paceWpmValue', { wpm: s.paceWpm }) : t(`settings:paceCaretOptions.${s.paceCaret}`),
      children: () => [
        ...PACE_CARETS.map((p) => ({
          id: `paceCaret.${p}`,
          label: t(`settings:paceCaretOptions.${p}`),
          active: s.paceCaret === p,
          run: () => ctx.settings.set('paceCaret', p),
        })),
        {
          id: 'paceCaret.custom',
          label: t('settings:paceCaretOptions.custom'),
          active: s.paceCaret === 'custom',
          children: () =>
            PACE_SPEEDS.map((wpm) => ({
              id: `paceCaret.custom.${wpm}`,
              label: t('settings:paceWpmValue', { wpm }),
              active: s.paceCaret === 'custom' && s.paceWpm === wpm,
              run: () => {
                ctx.settings.setMany({ paceCaret: 'custom', paceWpm: wpm });
              },
            })),
        },
      ],
    },
    choice(ctx, {
      id: 'sound',
      key: 'sound',
      label: t('commands:sound'),
      group: g.appearance,
      icon: Volume2,
      options: SOUNDS.map((v) => ({ value: v, label: t(`settings:soundOptions.${v}`) })),
    }),
    choice(ctx, {
      id: 'soundVolume',
      key: 'soundVolume',
      label: t('commands:soundVolume'),
      group: g.appearance,
      options: SOUND_VOLUMES.map((v) => ({ value: v, label: `${Math.round(v * 100)}%` })),
    }),

    toggle(ctx, 'noBackspace', 'noBackspace', t('commands:noBackspace'), g.behaviour),
    toggle(ctx, 'suddenDeath', 'suddenDeath', t('commands:suddenDeath'), g.behaviour),
    choice(ctx, {
      id: 'stopOnError',
      key: 'stopOnError',
      label: t('commands:stopOnError'),
      group: g.behaviour,
      options: STOP_ON_ERROR.map((v) => ({ value: v, label: t(`settings:stopOnErrorOptions.${v}`) })),
    }),
    choice(ctx, {
      id: 'quickRestart',
      key: 'quickRestart',
      label: t('commands:quickRestart'),
      group: g.behaviour,
      keywords: ['restart', 'key'],
      options: QUICK_RESTART.map((q) => ({ value: q, label: t(`settings:quickRestartOptions.${q}`) })),
    }),
    choice(ctx, {
      id: 'uiLanguage',
      key: 'uiLanguage',
      label: t('commands:uiLanguage'),
      group: g.behaviour,
      icon: Languages,
      options: UI_LANGUAGES.map((l) => ({ value: l, label: t(`settings:languages.${l}`) })),
    }),
    {
      id: 'resetSettings',
      label: t('commands:resetSettings'),
      group: g.behaviour,
      icon: RotateCcw,
      children: () => [
        {
          id: 'resetSettings.yes',
          label: t('commands:resetYes'),
          icon: RotateCcw,
          run: () => ctx.settings.reset(),
        },
      ],
    },

    {
      id: 'go',
      label: t('commands:go'),
      group: g.navigate,
      icon: ArrowRight,
      children: () => {
        const items: Command[] = [
          { id: 'go.test', label: t('commands:goTest'), icon: Keyboard, run: () => ctx.navigate('/') },
          { id: 'go.leaderboard', label: t('commands:goLeaderboard'), icon: Crown, run: () => ctx.navigate('/leaderboard') },
        ];
        if (ctx.isLoggedIn) {
          items.push({ id: 'go.account', label: t('commands:goAccount'), icon: User, run: () => ctx.navigate('/account') });
        } else {
          items.push(
            { id: 'go.login', label: t('commands:goLogin'), icon: LogIn, run: () => ctx.navigate('/login') },
            { id: 'go.register', label: t('commands:goRegister'), icon: UserPlus, run: () => ctx.navigate('/register') },
          );
        }
        return items;
      },
    },
  ];

  if (ctx.isLoggedIn) {
    commands.push({
      id: 'logout',
      label: t('commands:logout'),
      group: g.account,
      icon: LogOut,
      run: () => ctx.logout(),
    });
  }

  return commands;
}

/** Walks the command tree along a list of ids. Returns the visible list and the parents passed. */
export function resolveLevel(root: Command[], ids: readonly string[]): { list: Command[]; trail: Command[] } {
  let list = root;
  const trail: Command[] = [];
  for (const id of ids) {
    const cmd = list.find((c) => c.id === id);
    if (!cmd?.children) break;
    trail.push(cmd);
    list = cmd.children();
  }
  return { list, trail };
}

