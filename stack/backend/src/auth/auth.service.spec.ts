import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

// Wrap compare so a test can assert it ran, without changing its behaviour.
jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof import('bcrypt')>('bcrypt');
  return { ...actual, compare: jest.fn(actual.compare) };
});

type UserRow = { id: number; name: string; email: string; passwordHash: string; createdAt: Date };

function setup() {
  const prisma = {
    user: {
      findFirst: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(null),
      findUnique: jest.fn<Promise<UserRow | null>, [unknown]>().mockResolvedValue(null),
      create: jest.fn(),
    },
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.token.value') };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
  );
  return { service, prisma, jwt };
}

describe('AuthService', () => {
  describe('register', () => {
    it('stores a bcrypt hash, never the plaintext password, and returns a public user', async () => {
      const { service, prisma, jwt } = setup();
      prisma.user.create.mockImplementation(async ({ data }: { data: UserRow }) => ({
        id: 7,
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
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
        createdAt: '2026-01-02T03:04:05.000Z',
      });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.token).toBe('signed.token.value');
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 7, name: 'typist_1' });
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
        email: 'alice@example.com',
        passwordHash,
        createdAt: new Date(0),
      });

      const result = await service.login({ email: 'alice@example.com', password: 'secret-password' });
      expect(result.user.id).toBe(3);
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('gives the same generic 401 for a wrong password and an unknown email', async () => {
      const { service, prisma } = setup();
      const passwordHash = await bcrypt.hash('secret-password', 4);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 3,
        name: 'alice',
        email: 'alice@example.com',
        passwordHash,
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
