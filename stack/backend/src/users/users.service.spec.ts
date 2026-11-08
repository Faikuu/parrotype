import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { PROFILE_RECENT_SIZE, toPublicProfile, UsersService, type ProfileSource } from './users.service';

const source = (overrides: Partial<ProfileSource> = {}): ProfileSource => ({
  name: 'Typist_1',
  createdAt: new Date('2026-01-02T03:04:05Z'),
  totalTests: 3,
  totalTimeMs: 180_000,
  bests: [{ mode: 'time', mode2: '60', language: 'en', wpm: 90, accuracy: 97, createdAt: '2026-02-01T00:00:00.000Z' }],
  recent: [
    { mode: 'time', mode2: '60', language: 'en', wpm: 88, accuracy: 96, createdAt: new Date('2026-03-01T00:00:00Z') },
  ],
  ...overrides,
});

describe('toPublicProfile', () => {
  it('maps the public fields and never includes an email', () => {
    // Simulate a row that carries an email: the mapping must still drop it.
    const withEmail = { ...source(), email: 'secret@example.com' } as ProfileSource;
    const profile = toPublicProfile(withEmail);

    expect(profile).toEqual({
      name: 'Typist_1',
      createdAt: '2026-01-02T03:04:05.000Z',
      totalTests: 3,
      totalTimeMs: 180_000,
      bests: [{ mode: 'time', mode2: '60', language: 'en', wpm: 90, accuracy: 97, createdAt: '2026-02-01T00:00:00.000Z' }],
      recent: [{ mode: 'time', mode2: '60', language: 'en', wpm: 88, accuracy: 96, createdAt: '2026-03-01T00:00:00.000Z' }],
    });
    expect(Object.keys(profile)).not.toContain('email');
    expect(JSON.stringify(profile)).not.toContain('secret@example.com');
  });

  it('keeps only the fields of each recent result', () => {
    const profile = toPublicProfile(
      source({
        recent: [
          {
            mode: 'words', mode2: '25', language: 'pl', wpm: 70, accuracy: 95, createdAt: new Date(0),
            // Extra columns from the database must not leak through.
            id: 9, userId: 1, rawWpm: 75,
          } as unknown as ProfileSource['recent'][number],
        ],
      }),
    );
    expect(Object.keys(profile.recent[0]).sort()).toEqual(
      ['accuracy', 'createdAt', 'language', 'mode', 'mode2', 'wpm'],
    );
  });
});

describe('UsersService.profile', () => {
  function setup(user: { id: number; name: string; createdAt: Date } | null) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      result: {
        aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { durationMs: null } }),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    return { service: new UsersService(prisma as unknown as PrismaService), prisma };
  }

  it('looks the name up case-insensitively', async () => {
    const { service, prisma } = setup({ id: 4, name: 'Typist_1', createdAt: new Date(0) });
    const profile = await service.profile('TYPIST_1');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { nameLower: 'typist_1' } }));
    expect(profile.name).toBe('Typist_1');
  });

  it('restricts bests to the ranked modes and recent to the last 10', async () => {
    const { service, prisma } = setup({ id: 4, name: 'typist', createdAt: new Date(0) });
    await service.profile('typist');
    expect(prisma.result.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 4, mode: { in: ['time', 'words', 'quote', 'pangram', 'daily'] } } }),
    );
    expect(prisma.result.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: PROFILE_RECENT_SIZE }));
    expect(PROFILE_RECENT_SIZE).toBe(10);
  });

  it('gives a 404 for an invalid name without querying the database', async () => {
    const { service, prisma } = setup(null);
    await expect(service.profile('ab')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.profile('bad-name!')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('gives a 404 with the spec message for an unknown user', async () => {
    const { service } = setup(null);
    await expect(service.profile('nobody')).rejects.toThrow('No user with that name');
  });
});
