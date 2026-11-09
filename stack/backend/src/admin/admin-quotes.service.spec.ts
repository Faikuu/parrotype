import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/jwt-auth.guard';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminQuotesService } from './admin-quotes.service';
import { LAST_QUOTE } from './quote-rules';

const me: AuthUser = { id: 1, name: 'root' };

interface QuoteRow {
  id: number;
  language: string;
  text: string;
  source: string;
  length: number;
}

/**
 * A quote table in memory. writeTx runs its callback against the same table, so each test can check the rows
 * and the audit rows together. `conflicts` makes the next N writeTx calls fail with a serializable conflict.
 */
function setup(initial: QuoteRow[], conflicts = 0) {
  const rows = [...initial];
  const audit: Array<{ action: string; target: string; note: string | null }> = [];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
  let pendingConflicts = conflicts;
  const tx = {
    quote: {
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) => rows.find((r) => r.id === where.id) ?? null),
      count: jest.fn(async ({ where }: { where: { language: string; id: { not: number } } }) =>
        rows.filter((r) => r.language === where.language && r.id !== where.id.not).length,
      ),
      create: jest.fn(async ({ data }: { data: Omit<QuoteRow, 'id'> }) => {
        const row = { id: nextId++, ...data };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: number }; data: Partial<QuoteRow> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      delete: jest.fn(async ({ where }: { where: { id: number } }) => {
        const i = rows.findIndex((r) => r.id === where.id);
        if (i === -1) throw new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'test' });
        rows.splice(i, 1);
        return {};
      }),
    },
    adminAction: {
      create: jest.fn(async ({ data }: { data: { action: string; target: string; note: string | null } }) => {
        audit.push(data);
        return data;
      }),
    },
  };
  const prisma = {
    writeTx: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      if (pendingConflicts > 0) {
        pendingConflicts--;
        throw new Prisma.PrismaClientKnownRequestError('write conflict', { code: 'P2034', clientVersion: 'test' });
      }
      return fn(tx);
    }),
  };
  return { service: new AdminQuotesService(prisma as unknown as PrismaService), rows, audit, prisma };
}

const q = (id: number, language: string, text = `quote number ${id}`): QuoteRow => ({
  id,
  language,
  text,
  source: 'Source',
  length: text.length,
});

describe('AdminQuotesService: the last-quote guard', () => {
  it('refuses to delete the only quote of a language, and changes nothing', async () => {
    const { service, rows, audit } = setup([q(1, 'en'), q(2, 'pl')]);
    await expect(service.remove(me, 2)).rejects.toThrow(BadRequestException);
    await expect(service.remove(me, 2)).rejects.toThrow(LAST_QUOTE);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
    expect(audit).toEqual([]);
  });

  it('deletes a quote when another quote in its language remains, and logs quote_delete with the language', async () => {
    const { service, rows, audit } = setup([q(1, 'en'), q(2, 'en'), q(3, 'pl')]);
    expect(await service.remove(me, 1)).toEqual({ ok: true });
    expect(rows.map((r) => r.id)).toEqual([2, 3]);
    expect(audit).toEqual([expect.objectContaining({ action: 'quote_delete', target: 'quote:1', note: '{"language":"en"}' })]);
  });

  it('refuses to move the only quote of a language to another language', async () => {
    const { service, rows } = setup([q(1, 'pl'), q(2, 'en')]);
    await expect(service.update(me, 1, { language: 'de' })).rejects.toThrow(LAST_QUOTE);
    expect(rows.find((r) => r.id === 1)?.language).toBe('pl');
  });

  it('allows a language change when another quote stays behind', async () => {
    const { service, rows } = setup([q(1, 'pl'), q(2, 'pl'), q(3, 'en')]);
    await service.update(me, 1, { language: 'de' });
    expect(rows.find((r) => r.id === 1)?.language).toBe('de');
  });

  it('does not check the guard when the language stays the same', async () => {
    const { service, prisma } = setup([q(1, 'en')]);
    await expect(service.update(me, 1, { language: 'en', source: 'Again' })).resolves.toMatchObject({ source: 'Again' });
    expect(prisma.writeTx).toHaveBeenCalledTimes(1);
  });
});

describe('AdminQuotesService: writes', () => {
  it('computes the length from the text on create, and logs quote_create', async () => {
    const { service, rows, audit } = setup([]);
    const created = await service.create(me, { language: 'en', text: 'Hello there, world.', source: 'Test' });
    expect(created).toMatchObject({ language: 'en', length: 19 });
    expect(rows).toHaveLength(1);
    expect(audit).toEqual([expect.objectContaining({ action: 'quote_create', target: `quote:${created.id}` })]);
  });

  it('recomputes the length when the text changes, and logs the changed fields', async () => {
    const { service, rows, audit } = setup([q(1, 'en', 'short text here')]);
    await service.update(me, 1, { text: 'a much longer piece of text' });
    expect(rows[0].length).toBe('a much longer piece of text'.length);
    expect(audit[0]).toEqual(expect.objectContaining({ action: 'quote_update', target: 'quote:1', note: '{"changed":["text"]}' }));
  });

  it('answers 404 for a quote that does not exist', async () => {
    const { service } = setup([q(1, 'en')]);
    await expect(service.update(me, 9, { source: 'x' })).rejects.toThrow(NotFoundException);
    await expect(service.remove(me, 9)).rejects.toThrow(NotFoundException);
  });

  it('runs a write again when a concurrent one aborted it (P2034), then gives up after three attempts', async () => {
    const retried = setup([q(1, 'en'), q(2, 'en')], 1);
    await expect(retried.service.remove(me, 1)).resolves.toEqual({ ok: true });
    expect(retried.prisma.writeTx).toHaveBeenCalledTimes(2);

    const stuck = setup([q(1, 'en'), q(2, 'en')], 5);
    await expect(stuck.service.remove(me, 1)).rejects.toMatchObject({ code: 'P2034' });
    expect(stuck.prisma.writeTx).toHaveBeenCalledTimes(3);
  });
});

describe('AdminQuotesService: list', () => {
  it('pages with skip and take, filters by language, and searches text and source', async () => {
    const reads: unknown[] = [];
    const reader = {
      quote: {
        findMany: jest.fn(async (args: unknown) => (reads.push(args), [])),
        count: jest.fn(async () => 0),
      },
    };
    const service = new AdminQuotesService(reader as unknown as PrismaService);
    const page = await service.list({ page: 3, pageSize: 10, language: 'es', q: 'dickens' });
    expect(page).toEqual({ items: [], total: 0, page: 3, pageSize: 10 });
    expect(reads[0]).toMatchObject({
      where: { language: 'es', OR: [{ text: { contains: 'dickens' } }, { source: { contains: 'dickens' } }] },
      skip: 20,
      take: 10,
    });
  });
});
