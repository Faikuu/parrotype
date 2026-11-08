import { z } from 'zod';

export const DATABASE_PROVIDERS = ['sqlite', 'postgresql', 'mysql'] as const;
export type DatabaseProvider = (typeof DATABASE_PROVIDERS)[number];

/** The URL scheme each provider needs, with an example for the error message. */
const URL_RULES: Record<DatabaseProvider, { matches: (url: string) => boolean; example: string }> = {
  sqlite: { matches: (url) => url.startsWith('file:'), example: 'file:../dev.db' },
  postgresql: { matches: (url) => /^postgres(ql)?:\/\//.test(url), example: 'postgresql://user:password@host:5432/parrotype' },
  mysql: { matches: (url) => url.startsWith('mysql://'), example: 'mysql://user:password@host:3306/parrotype' },
};

/** The placeholder in .env.sample. A server started with it must refuse to run. */
export const SAMPLE_JWT_SECRET = 'change-me-to-a-long-random-string-of-at-least-32-chars';
export const MIN_JWT_SECRET_LENGTH = 32;
export const MIN_JWT_SECRET_DISTINCT_CHARS = 10;
export const JWT_SAMPLE_MESSAGE =
  'JWT_SECRET is still the sample value. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"';

/** Returns the reason a JWT secret is unacceptable, or null when it is fine. */
export function jwtSecretProblem(secret: string): string | null {
  if (secret === SAMPLE_JWT_SECRET || secret.toLowerCase().includes('change-me')) return JWT_SAMPLE_MESSAGE;
  const distinct = new Set(Array.from(secret)).size;
  if (distinct < MIN_JWT_SECRET_DISTINCT_CHARS) {
    return `JWT_SECRET must have at least ${MIN_JWT_SECRET_DISTINCT_CHARS} distinct characters`;
  }
  return null;
}

const envSchema = z
  .object({
    DATABASE_PROVIDER: z
      .enum(DATABASE_PROVIDERS, {
        errorMap: () => ({ message: `must be one of ${DATABASE_PROVIDERS.join(', ')}` }),
      })
      .default('sqlite'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z
      .string()
      .min(MIN_JWT_SECRET_LENGTH, `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`)
      .superRefine((secret, ctx) => {
        const problem = jwtSecretProblem(secret);
        if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
      }),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    /** Number of reverse proxies in front of the API. 0 means connections come straight from the client. */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((e, ctx) => {
    const rule = URL_RULES[e.DATABASE_PROVIDER];
    if (!rule.matches(e.DATABASE_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: `does not match DATABASE_PROVIDER=${e.DATABASE_PROVIDER} (expected a URL like ${rule.example})`,
      });
    }
  });

export interface Env {
  DATABASE_PROVIDER: DatabaseProvider;
  DATABASE_URL: string;
  JWT_SECRET: string;
  PORT: number;
  NODE_ENV: 'development' | 'test' | 'production';
  corsOrigins: string[];
  cookieSecure: boolean;
  trustProxy: number;
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
    DATABASE_PROVIDER: e.DATABASE_PROVIDER,
    DATABASE_URL: e.DATABASE_URL,
    JWT_SECRET: e.JWT_SECRET,
    PORT: e.PORT,
    NODE_ENV: e.NODE_ENV,
    corsOrigins: e.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    cookieSecure: e.COOKIE_SECURE !== undefined
      ? e.COOKIE_SECURE === 'true'
      : e.NODE_ENV === 'production',
    trustProxy: e.TRUST_PROXY,
  };
}

let cached: Env | undefined;

/** Memoised loadEnv() for the running process. */
export function getEnv(): Env {
  cached ??= loadEnv(process.env);
  return cached;
}
