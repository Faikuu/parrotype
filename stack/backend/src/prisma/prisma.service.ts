import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { getEnv } from '../config/env';

/** How long an interactive transaction may wait to start (its maxWait) and how long it may run (its timeout). */
export const TX_MAX_WAIT_MS = 5_000;
export const TX_TIMEOUT_MS = 10_000;

export interface WriteTxOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /** SQLite only: the last interactive transaction queued in this process. See writeTx. */
  private sqliteQueue: Promise<unknown> = Promise.resolve();

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Runs an interactive transaction with explicit limits. Use this for every write that reads inside its
   * transaction. Do not call it, or any other query through the client, from inside `fn` other than through
   * `tx`, and do not nest writeTx calls (the nested one would wait for the outer one, which waits for it).
   *
   * SQLite runs one writer at a time, and a second interactive transaction blocks inside the engine while the
   * first is still open. Measured with the moderation concurrency tests: the first transaction's COMMIT then
   * waited behind the second's busy wait, and both ran into the 5 s busy timeout (1 in 3 runs failed).
   * So on SQLite the transactions run one after another within this process. Other engines take row locks
   * and run them in parallel.
   */
  writeTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, options: WriteTxOptions = {}): Promise<T> {
    const run = () => this.$transaction(fn, { maxWait: TX_MAX_WAIT_MS, timeout: TX_TIMEOUT_MS, ...options });
    if (getEnv().DATABASE_PROVIDER !== 'sqlite') return run();
    const next = this.sqliteQueue.then(run);
    // The queue continues after a failed transaction too; the caller gets the failure through `next`.
    this.sqliteQueue = next.catch(() => undefined);
    return next;
  }
}
