import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
});

export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  PORT: number;
  NODE_ENV: 'development' | 'test' | 'production';
  corsOrigins: string[];
  cookieSecure: boolean;
}

/** Parses and validates the environment. Throws with a readable list of problems. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (i) => `  - ${i.path.join('.')}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  const e = parsed.data;
  return {
    DATABASE_URL: e.DATABASE_URL,
    JWT_SECRET: e.JWT_SECRET,
    PORT: e.PORT,
    NODE_ENV: e.NODE_ENV,
    corsOrigins: e.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    cookieSecure: e.COOKIE_SECURE !== undefined
      ? e.COOKIE_SECURE === 'true'
      : e.NODE_ENV === 'production',
  };
}

let cached: Env | undefined;

/** Memoised loadEnv() for the running process. */
export function getEnv(): Env {
  cached ??= loadEnv(process.env);
  return cached;
}
