import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { PermissionsService } from '../permissions/permissions.service';
import { AuthService } from './auth.service';

// Wrap compare so a test can assert it ran, without changing its behaviour.
jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof import('bcrypt')>('bcrypt');
  return { ...actual, compare: jest.fn(actual.compare) };
});

type UserRow = {
  id: number;
  name: string;
  nameLower: string;
  email: string;
  passwordHash: string;
  tokenVersion: number;
  bannedAt: Date | null;
  createdAt: Date;
};

function setup() {
  const prisma = {
    user: {
      findFirst: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(null),
      findUnique: jest.fn<Promise<UserRow | null>, [unknown]>().mockResolvedValue(null),
      create: jest.fn(),
    },
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.token.value') };
  const permissions = { effective: jest.fn().mockResolvedValue(new Set()) };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    permissions as unknown as PermissionsService,
  );
  return { service, prisma, jwt, permissions };
}

describe('AuthService', () => {
  describe('register', () => {
    it('stores a bcrypt hash, never the plaintext password, and returns a public user', async () => {
      const { service, prisma, jwt } = setup();
      prisma.user.create.mockImplementation(async ({ data }: { data: UserRow }) => ({
        id: 7,
        name: data.name,
        nameLower: data.nameLower,
        email: data.email,
        passwordHash: data.passwordHash,
        tokenVersion: 0,
        bannedAt: null,
        createdAt: new Date('2026-01-02T03:04:05Z'),
      }));

      const result = await service.register({
        name: 'typist_1',
        email: 'typist@example.com',
        password: 'correct horse',
      });

      const stored = prisma.user.create.mock.calls[0][0].data as UserRow;
      expect(stored.passwordHash).not.toBe('correct horse');
      expect(await bcrypt.compare('correct horse', stored.passwordHash)).toBe(true);

      expect(result.user).toEqual({
        id: 7,
        name: 'typist_1',
        email: 'typist@example.com',
        permissions: [],
        createdAt: '2026-01-02T03:04:05.000Z',
        emailVerified: false,
        twoFactorEnabled: false,
      });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.token).toBe('signed.token.value');
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 7, name: 'typist_1', v: 0 });
      expect(stored.nameLower).toBe('typist_1');
    });

    it('stores the lower-case name for lookups but keeps the display casing', async () => {
      const { service, prisma } = setup();
      prisma.user.create.mockImplementation(async ({ data }: { data: UserRow }) => ({
        id: 8,
        name: data.name,
        nameLower: data.nameLower,
        email: data.email,
        passwordHash: data.passwordHash,
        tokenVersion: 0,
        bannedAt: null,
        createdAt: new Date(0),
      }));

      const result = await service.register({ name: 'TypistOne', email: 'o@example.com', password: 'password123' });

      expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({ name: 'TypistOne', nameLower: 'typistone' });
      expect(result.user.name).toBe('TypistOne');
    });

    it('rejects a name that differs only by case from an existing one (ALICE after alice) with 409', async () => {
      const { service, prisma } = setup();
      // Behaves like the database: a row exists with nameLower 'alice'.
      prisma.user.findFirst.mockImplementation(async (args: unknown) => {
        const { where } = args as { where: { OR: Array<{ nameLower?: string }> } };
        return where.OR.some((c) => c.nameLower === 'alice') ? { id: 1 } : null;
      });

      await expect(
        service.register({ name: 'ALICE', email: 'new@example.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate name or email with 409', async () => {
      const { service, prisma } = setup();
      prisma.user.findFirst.mockResolvedValue({ id: 1 });

      await expect(
        service.register({ name: 'taken', email: 'a@example.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns a public user and token for correct credentials', async () => {
      const { service, prisma } = setup();
      const passwordHash = await bcrypt.hash('secret-password', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 3,
        name: 'alice',
        nameLower: 'alice',
        email: 'alice@example.com',
        passwordHash,
        tokenVersion: 0,
        bannedAt: null,
        createdAt: new Date(0),
      });

      const result = await service.login({ email: 'alice@example.com', password: 'secret-password' });
      if (result.kind !== 'session') throw new Error('expected a session, not a two-factor ticket');
      expect(result.user.id).toBe(3);
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user.permissions).toEqual([]);
      expect(result.user).not.toHaveProperty('role');
    });

    it('refuses a suspended account with 403, but only after the password matched', async () => {
      const { service, prisma } = setup();
      const passwordHash = await bcrypt.hash('secret-password', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 3,
        name: 'alice',
        nameLower: 'alice',
        email: 'alice@example.com',
        passwordHash,
        tokenVersion: 0,
        bannedAt: new Date(0),
        createdAt: new Date(0),
      });

      const err = await service.login({ email: 'alice@example.com', password: 'secret-password' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toBe('This account has been suspended');

      // A wrong password still gets the generic 401, so a suspension is not revealed to strangers.
      const wrong = await service.login({ email: 'alice@example.com', password: 'nope-nope' }).catch((e: unknown) => e);
      expect(wrong).toBeInstanceOf(UnauthorizedException);
    });

    it('gives the same generic 401 for a wrong password and an unknown email', async () => {
      const { service, prisma } = setup();
      const passwordHash = await bcrypt.hash('secret-password', 4);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 3,
        name: 'alice',
        nameLower: 'alice',
        email: 'alice@example.com',
        passwordHash,
        tokenVersion: 0,
        bannedAt: null,
        createdAt: new Date(0),
      });
      prisma.user.findUnique.mockResolvedValueOnce(null);

      const wrongPassword = await service
        .login({ email: 'alice@example.com', password: 'nope-nope' })
        .catch((e: unknown) => e);
      const unknownEmail = await service
        .login({ email: 'ghost@example.com', password: 'nope-nope' })
        .catch((e: unknown) => e);

      expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
      expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
      expect((wrongPassword as UnauthorizedException).message).toBe('Invalid email or password');
      expect((unknownEmail as UnauthorizedException).message).toBe('Invalid email or password');
    });

    it('still runs a bcrypt compare when the email is unknown', async () => {
      const compare = bcrypt.compare as unknown as jest.Mock;
      compare.mockClear();
      const { service, prisma } = setup();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@example.com', password: 'whatever12' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(compare).toHaveBeenCalledTimes(1);
      expect(compare).toHaveBeenCalledWith('whatever12', expect.stringMatching(/^\$2b\$12\$/));
    });
  });
});

describe('AuthService.changePassword', () => {
  it('rejects a new password equal to the current one with 400, before any database read', async () => {
    const { service, prisma } = setup();

    const error = await service
      .changePassword(3, { currentPassword: 'same-password', newPassword: 'same-password' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect((error as BadRequestException).message).toBe('New password must be different from the current one');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('still checks the current password when the new one is different', async () => {
    const { service, prisma } = setup();
    const passwordHash = await bcrypt.hash('old-password', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 3, name: 'alice', nameLower: 'alice', email: 'a@example.com', passwordHash, tokenVersion: 0, bannedAt: null, createdAt: new Date(0),
    });

    await expect(
      service.changePassword(3, { currentPassword: 'not-it', newPassword: 'brand-new-one' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
