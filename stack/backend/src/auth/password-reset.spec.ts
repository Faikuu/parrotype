import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

// Count the hashes, without changing them: a bad link must never reach bcrypt.
jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof import('bcrypt')>('bcrypt');
  return { ...actual, hash: jest.fn(actual.hash) };
});
import type { PrismaService } from '../prisma/prisma.service';
import type { MailService } from '../mail/mail.service';
import { PasswordResetService, INVALID_RESET } from './password-reset.service';
import { sha256Hex } from './tokens';

interface FakeUser {
  id: number;
  email: string;
  passwordHash: string;
  tokenVersion: number;
  bannedAt: Date | null;
}

interface FakeToken {
  id: number;
  userId: number;
  purpose: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/**
 * A small in-memory stand-in for the Prisma calls the reset service makes. It understands the
 * where-clauses the service uses (equality, null, gte, gt, lte-free) and nothing more.
 */
function fakeDb(users: FakeUser[]) {
  const tokens: FakeToken[] = [];
  let nextId = 1;
  const byId = new Map(users.map((u) => [u.id, u]));

  const matches = (t: FakeToken, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, cond]) => {
      const value = (t as unknown as Record<string, unknown>)[key];
      if (cond === null) return value === null;
      if (cond && typeof cond === 'object' && 'gte' in cond) return (value as Date).getTime() >= (cond.gte as Date).getTime();
      if (cond && typeof cond === 'object' && 'gt' in cond) return (value as Date).getTime() > (cond.gt as Date).getTime();
      return value === cond;
    });

  // The transaction runs against the same fake; the holder breaks the self-reference in the type.
  const holder: { prisma?: unknown } = {};
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id?: number; email?: string } }) =>
        users.find((u) => (where.id !== undefined ? u.id === where.id : u.email === where.email)) ?? null,
      ),
      update: jest.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        const user = byId.get(where.id)!;
        if (data.passwordHash !== undefined) user.passwordHash = data.passwordHash as string;
        if (data.tokenVersion !== undefined) {
          user.tokenVersion = (data.tokenVersion as { increment: number }).increment + user.tokenVersion;
        }
        return user;
      }),
    },
    authToken: {
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => tokens.filter((t) => matches(t, where)).length),
      create: jest.fn(async ({ data }: { data: Omit<FakeToken, 'id' | 'usedAt' | 'createdAt'> }) => {
        const row: FakeToken = { ...data, id: nextId++, usedAt: null, createdAt: new Date(clock.now().getTime()) };
        tokens.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const row = tokens.find((t) => t.tokenHash === where.tokenHash);
        if (!row) return null;
        return { ...row, user: { bannedAt: byId.get(row.userId)!.bannedAt } };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: { usedAt: Date } }) => {
        const hit = tokens.filter((t) => matches(t, where));
        for (const t of hit) t.usedAt = data.usedAt;
        return { count: hit.length };
      }),
    },
    writeTx: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(holder.prisma)),
  };
  holder.prisma = prisma;
  return { prisma, tokens };
}

/** A clock the test moves by hand. */
const clock = {
  current: new Date('2026-11-09T10:00:00Z'),
  now(): Date {
    return new Date(this.current.getTime());
  },
  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  },
};

const MINUTE = 60_000;

async function setup(hashOf: (pw: string) => Promise<string> = (pw) => bcrypt.hash(pw, 4)) {
  const users: FakeUser[] = [
    { id: 1, email: 'typist@example.com', passwordHash: await hashOf('old-password-1'), tokenVersion: 3, bannedAt: null },
    { id: 2, email: 'banned@example.com', passwordHash: await hashOf('whatever-1'), tokenVersion: 0, bannedAt: new Date(0) },
  ];
  const db = fakeDb(users);
  const mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
  const service = new PasswordResetService(db.prisma as unknown as PrismaService, mail as unknown as MailService, () =>
    clock.now(),
  );
  return { service, db, mail, users };
}

/** The raw token from the most recent reset email. */
const tokenFromMail = (mail: { sendPasswordReset: jest.Mock }): string => {
  const calls = mail.sendPasswordReset.mock.calls;
  return calls[calls.length - 1][2] as string;
};

describe('password reset (stub clock)', () => {
  beforeEach(() => {
    clock.current = new Date('2026-11-09T10:00:00Z');
  });

  it('for an unknown email: stores nothing and sends nothing', async () => {
    const { service, db, mail } = await setup();
    await service.forgot('nobody@example.com', 'en');
    expect(db.tokens).toHaveLength(0);
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('for a suspended account: stores nothing and sends nothing', async () => {
    const { service, db, mail } = await setup();
    await service.forgot('banned@example.com', 'en');
    expect(db.tokens).toHaveLength(0);
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('for a known email: stores only the sha256 of a 30-minute token and mails the raw one', async () => {
    const { service, db, mail } = await setup();
    await service.forgot('typist@example.com', 'pl');

    expect(db.tokens).toHaveLength(1);
    const token = tokenFromMail(mail);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(db.tokens[0].tokenHash).toBe(sha256Hex(token));
    expect(db.tokens[0].tokenHash).not.toContain(token);
    expect(db.tokens[0].expiresAt.getTime()).toBe(clock.now().getTime() + 30 * MINUTE);
    expect(mail.sendPasswordReset.mock.calls[0][1]).toBe('pl');
  });

  it('a new request invalidates the earlier unused link', async () => {
    const { service, db, mail } = await setup();
    await service.forgot('typist@example.com', 'en');
    const first = tokenFromMail(mail);
    clock.advanceMinutes(1);
    await service.forgot('typist@example.com', 'en');

    expect(db.tokens[0].usedAt).not.toBeNull();
    await expect(service.reset(first, 'brand-new-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows three requests per email per hour, then stays silent until the window passes', async () => {
    const { service, db, mail } = await setup();
    for (let i = 0; i < 4; i++) {
      await service.forgot('typist@example.com', 'en');
      clock.advanceMinutes(5);
    }
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(3);
    expect(db.tokens).toHaveLength(3);

    // Only the requests of the last hour count, so an hour later a new one goes out.
    clock.advanceMinutes(60);
    await service.forgot('typist@example.com', 'en');
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(4);
  });

  it('resets the password, bumps tokenVersion, and uses up the token and any other reset token', async () => {
    const { service, db, mail, users } = await setup();
    await service.forgot('typist@example.com', 'en');
    const token = tokenFromMail(mail);

    await service.reset(token, 'new-password-2');

    expect(await bcrypt.compare('new-password-2', users[0].passwordHash)).toBe(true);
    expect(users[0].tokenVersion).toBe(4);
    expect(db.tokens[0].usedAt).not.toBeNull();
    // The same link cannot be used twice.
    await expect(service.reset(token, 'another-pass-3')).rejects.toThrow(INVALID_RESET);
  });

  it('accepts the link up to 30 minutes after it was issued and refuses it after', async () => {
    const { service, mail } = await setup();
    await service.forgot('typist@example.com', 'en');
    const token = tokenFromMail(mail);

    clock.advanceMinutes(29);
    await expect(service.reset(token, 'late-but-ok-1')).resolves.toBeUndefined();

    const { service: s2, mail: m2 } = await setup();
    await s2.forgot('typist@example.com', 'en');
    const expired = tokenFromMail(m2);
    clock.advanceMinutes(31);
    await expect(s2.reset(expired, 'too-late-pass-1')).rejects.toThrow(INVALID_RESET);
  });

  it('refuses an unknown token with the generic message', async () => {
    const { service } = await setup();
    await expect(service.reset('not-a-real-token', 'some-password-1')).rejects.toThrow(
      'This reset link is invalid or has expired',
    );
  });

  it('refuses a verification token presented as a reset token', async () => {
    const { service, db } = await setup();
    const token = 'a-verify-token-that-is-long-enough-for-the-test';
    db.tokens.push({
      id: 99,
      userId: 1,
      purpose: 'verify',
      tokenHash: sha256Hex(token),
      expiresAt: new Date(clock.now().getTime() + 60 * MINUTE),
      usedAt: null,
      createdAt: clock.now(),
    });
    await expect(service.reset(token, 'some-password-1')).rejects.toThrow(INVALID_RESET);
  });

  it('refuses a reset for an account suspended after the link was sent', async () => {
    const { service, mail, users } = await setup();
    await service.forgot('typist@example.com', 'en');
    const token = tokenFromMail(mail);
    users[0].bannedAt = new Date();
    await expect(service.reset(token, 'some-password-1')).rejects.toThrow(INVALID_RESET);
  });

  it('refuses an unknown, used or expired link before any bcrypt work', async () => {
    const { service, mail } = await setup();
    const hash = bcrypt.hash as unknown as jest.Mock;

    hash.mockClear();
    await expect(service.reset('not-a-real-token', 'some-password-1')).rejects.toThrow(INVALID_RESET);
    expect(hash).not.toHaveBeenCalled();

    await service.forgot('typist@example.com', 'en');
    const used = tokenFromMail(mail);
    await service.reset(used, 'first-new-pass-1');
    hash.mockClear();
    await expect(service.reset(used, 'second-new-pass-2')).rejects.toThrow(INVALID_RESET);
    expect(hash).not.toHaveBeenCalled();

    await service.forgot('typist@example.com', 'en');
    const expired = tokenFromMail(mail);
    clock.advanceMinutes(31);
    hash.mockClear();
    await expect(service.reset(expired, 'third-new-pass-3')).rejects.toThrow(INVALID_RESET);
    expect(hash).not.toHaveBeenCalled();
  });

  it('hashes exactly once for a valid link', async () => {
    const { service, mail } = await setup();
    await service.forgot('typist@example.com', 'en');
    const token = tokenFromMail(mail);
    const hash = bcrypt.hash as unknown as jest.Mock;
    hash.mockClear();
    await service.reset(token, 'valid-new-pass-1');
    expect(hash).toHaveBeenCalledTimes(1);
  });

  it('does the same database work for an unknown email as for a known one', async () => {
    const work = async (email: string) => {
      const { service, db } = await setup();
      await service.forgot(email, 'en');
      return {
        findUnique: db.prisma.user.findUnique.mock.calls.length,
        count: db.prisma.authToken.count.mock.calls.length,
        updateMany: db.prisma.authToken.updateMany.mock.calls.length,
        writeTx: db.prisma.writeTx.mock.calls.length,
      };
    };
    expect(await work('nobody@example.com')).toEqual(await work('typist@example.com'));
  });
});
