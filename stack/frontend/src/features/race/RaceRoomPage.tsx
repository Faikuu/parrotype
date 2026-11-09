import '@/features/test/test.css';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/useAuth';
import { LANGUAGE_NAMES } from '@/lib/text/languages';
import { copyText } from './copyText';
import { RaceLanes, type LocalProgress } from './RaceLanes';
import type { RacePlayer, RaceErrorInfo, RaceRoom } from './protocol';
import { isValidNickname, readRememberedNickname, rememberNickname } from './nickname';
import { placements } from './raceProgress';
import { useCountdown } from './useCountdown';
import { useRace, type UseRace } from './useRace';
import { TypingArea } from './TypingArea';

const MAX_PLAYERS = 8;
const COPIED_MS = 2000;

/** /race/:id. Guests pick a nickname first; then the lobby, the countdown, the race and the results. */
export default function RaceRoomPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [guest, setGuest] = useState<string | null>(null);
  // Null until the session check is done, so a signed-in user never joins as a guest.
  const joinName = isLoading ? null : user ? undefined : guest;
  const race = useRace(id, joinName);

  if (isLoading) return <Status>{t('race:room.loading')}</Status>;
  if (!user && guest === null) return <GuestJoin onJoin={setGuest} />;
  if (race.error?.fatal) return <ErrorPanel error={race.error} />;
  if (!race.room) {
    return <Status>{race.connection === 'reconnecting' ? t('race:room.reconnecting') : t('race:room.loading')}</Status>;
  }
  return <RoomBody room={race.room} race={race} />;
}

function Status({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="py-16 text-sub">
      {children}
    </p>
  );
}

function GuestJoin({ onJoin }: { onJoin: (name: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(() => readRememberedNickname());
  const [attempted, setAttempted] = useState(false);
  const valid = isValidNickname(value);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAttempted(true);
    if (!valid) return;
    const name = value.trim();
    rememberNickname(name);
    onJoin(name);
  };

  return (
    <section className="mx-auto flex w-full max-w-sm flex-col gap-6 py-16">
      <h1 className="font-sans text-[2rem] font-semibold">{t('race:lobby.heading')}</h1>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t('race:nickname.label')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="nickname"
          error={attempted && !valid ? t('race:nickname.invalid') : undefined}
        />
        <p className="text-[0.9rem] text-sub">{t('race:nickname.hint')}</p>
        <Button type="submit" className="self-start">
          {t('race:nickname.submit')}
        </Button>
      </form>
    </section>
  );
}

function ErrorPanel({ error }: { error: RaceErrorInfo }) {
  const { t } = useTranslation();
  const message = (() => {
    switch (error.code) {
      case 'full':
        return t('race:errors.full');
      case 'notFound':
        return t('race:errors.notFound');
      case 'expired':
        return t('race:errors.expired');
      case 'connection':
        return t('race:errors.connection');
      default:
        return t('race:errors.rejected', { message: error.message });
    }
  })();
  return (
    <section className="flex flex-col items-start gap-4 py-16">
      <p role="alert" className="text-[1.1rem] text-error">
        {message}
      </p>
      <Link to="/race" className="text-main underline-offset-4 hover:underline">
        {t('race:errors.back')}
      </Link>
    </section>
  );
}

function RoomBody({ room, race }: { room: RaceRoom; race: UseRace }) {
  const { t } = useTranslation();
  const [mine, setMine] = useState<LocalProgress | null>(null);
  const { sendProgress, finish, start } = race;
  const isHost = race.you !== null && room.hostId === race.you;

  const onChange = useCallback(
    (chars: number, wpm: number) => {
      setMine({ startsAt: room.startsAt, chars, wpm });
      sendProgress(chars, wpm);
    },
    [room.startsAt, sendProgress],
  );

  const notice =
    race.error && !race.error.fatal ? (
      <p role="alert" className="text-[0.95rem] text-error">
        {t('race:errors.rejected', { message: race.error.message })}
      </p>
    ) : null;

  if (room.status === 'lobby') {
    return <Lobby room={room} you={race.you} isHost={isHost} onStart={start} notice={notice} />;
  }

  if (room.status === 'finished') {
    return (
      <section className="flex flex-col gap-8 py-10">
        <h1 className="font-sans text-[2rem] font-semibold">{t('race:lobby.heading')}</h1>
        <ResultsTable players={room.players} you={race.you} />
        <div className="flex flex-wrap items-center gap-3">
          {isHost ? (
            <Button onClick={start}>{t('race:results.raceAgain')}</Button>
          ) : (
            <p className="text-sub">{t('race:room.waitingHost')}</p>
          )}
        </div>
        {notice}
      </section>
    );
  }

  return (
    <RaceBody room={room} you={race.you} mine={mine} onChange={onChange} onFinish={finish} notice={notice} />
  );
}

function Lobby({
  room,
  you,
  isHost,
  onStart,
  notice,
}: {
  room: RaceRoom;
  you: string | null;
  isHost: boolean;
  onStart: () => void;
  notice: ReactNode;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (copied === 'idle') return;
    const id = setTimeout(() => setCopied('idle'), COPIED_MS);
    return () => clearTimeout(id);
  }, [copied]);

  const copyLink = async () => {
    const ok = await copyText(window.location.href);
    setCopied(ok ? 'copied' : 'failed');
  };

  return (
    <section className="flex flex-col gap-8 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-sans text-[2rem] font-semibold">{t('race:lobby.heading')}</h1>
        <p className="text-sub">{t('race:room.language', { language: LANGUAGE_NAMES[room.language] })}</p>
      </header>

      <div className="flex flex-col gap-3">
        <h2 className="text-[1.05rem] font-medium">
          {t('race:room.players', { count: room.players.length, max: MAX_PLAYERS })}
        </h2>
        <ul className="flex flex-col gap-2">
          {room.players.map((p) => (
            <PlayerName key={p.id} player={p} isHost={p.id === room.hostId} isYou={p.id === you} />
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" className="bg-surface text-text" onClick={copyLink}>
          {copied === 'copied' ? t('race:room.copied') : t('race:room.copyLink')}
        </Button>
        {copied === 'failed' && <span className="text-[0.9rem] text-sub">{t('race:room.copyFailed')}</span>}
        {isHost ? (
          <Button onClick={onStart}>{t('race:room.startRace')}</Button>
        ) : (
          <p className="text-sub">{t('race:room.waitingHost')}</p>
        )}
      </div>
      {notice}
    </section>
  );
}

function PlayerName({ player, isHost, isYou }: { player: RacePlayer; isHost: boolean; isYou: boolean }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-2 text-[0.95rem]">
      <span className="truncate text-text">{player.name}</span>
      {isHost && <span className="text-[0.85rem] text-main">{t('race:room.host')}</span>}
      {isYou && <span className="text-[0.85rem] text-sub">({t('race:room.you')})</span>}
      {!player.connected && <span className="text-[0.85rem] text-sub">{t('race:room.offline')}</span>}
    </li>
  );
}

function RaceBody({
  room,
  you,
  mine,
  onChange,
  onFinish,
  notice,
}: {
  room: RaceRoom;
  you: string | null;
  mine: LocalProgress | null;
  onChange: (chars: number, wpm: number) => void;
  onFinish: UseRace['finish'];
  notice: ReactNode;
}) {
  const counting = room.status === 'countdown';
  const seconds = useCountdown(room.startsAt, counting);
  const showNumber = counting && seconds !== null && seconds > 0;
  // Typing opens when the racing state arrives, or locally once the countdown reaches zero.
  const open = room.status === 'racing' || (counting && seconds !== null && seconds <= 0);

  return (
    <section className="flex flex-col gap-8 py-8">
      <div className="flex h-24 items-center justify-center">
        {showNumber && (
          <p
            role="status"
            aria-live="assertive"
            className="font-sans text-[5rem] leading-none font-semibold tabular-nums text-main"
          >
            {Math.min(3, seconds)}
          </p>
        )}
      </div>

      <RaceLanes
        players={room.players}
        you={you}
        mine={mine}
        startsAt={room.startsAt}
        textLength={room.text?.length ?? 0}
      />

      {room.text !== null && (
        <div className="flex flex-col gap-4">
          <TypingArea
            key={room.startsAt ?? 'none'}
            text={room.text}
            open={open}
            onChange={onChange}
            onFinish={onFinish}
          />
          {room.source && <SourceLine source={room.source} />}
        </div>
      )}
      {notice}
    </section>
  );
}

function SourceLine({ source }: { source: string }) {
  const { t } = useTranslation();
  return <p className="text-center text-[0.9rem] text-sub">{t('race:room.source', { source })}</p>;
}

function ResultsTable({ players, you }: { players: RacePlayer[]; you: string | null }) {
  const { t } = useTranslation();
  const rows = placements(players);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-left text-[0.95rem]">
        <thead>
          <tr className="text-sub">
            <th scope="col" className="py-2 pr-4 font-normal">
              {t('race:results.place')}
            </th>
            <th scope="col" className="py-2 pr-4 font-normal">
              {t('race:results.player')}
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              {t('race:results.wpm')}
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              {t('race:results.accuracy')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-surface">
              <td className="py-2 pr-4 tabular-nums text-text">{p.place ?? '–'}</td>
              <td className="py-2 pr-4 text-text">
                {p.name}
                {p.id === you && <span className="ml-1.5 text-sub">({t('race:room.you')})</span>}
                {p.place === null && <span className="ml-2 text-[0.85rem] text-sub">{t('race:results.dnf')}</span>}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-main">{Math.round(p.wpm)}</td>
              <td className="py-2 text-right tabular-nums text-text">
                {p.accuracy === null ? '–' : `${Math.round(p.accuracy)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
