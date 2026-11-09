import { z } from 'zod';

export const DATABASE_PROVIDERS = ['sqlite', 'postgresql', 'mysql'] as const;
export type DatabaseProvider = (typeof DATABASE_PROVIDERS)[number];

export const MAIL_TRANSPORTS = ['console', 'smtp'] as const;
export type MailTransportName = (typeof MAIL_TRANSPORTS)[number];

/** The URL scheme each provider needs, with an example for the error message. */
const URL_RULES: Record<DatabaseProvider, { matches: (url: string) => boolean; example: string }> = {
  sqlite: { matches: (url) => url.startsWith('file:'), example: 'file:../dev.db' },
  postgresql: { matches: (url) => /^postgres(ql)?:\/\//.test(url), example: 'postgresql://user:password@host:5432/parrotype' },
  mysql: { matches: (url) => url.startsWith('mysql://'), example: 'mysql://user:password@host:3306/parrotype' },
};

const GENERATE_HINT = 'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"';

/** The placeholder in .env.sample. A server started with it must refuse to run. */
export const SAMPLE_JWT_SECRET = 'change-me-to-a-long-random-string-of-at-least-32-chars';
export const MIN_JWT_SECRET_LENGTH = 32;
export const MIN_JWT_SECRET_DISTINCT_CHARS = 10;
export const JWT_SAMPLE_MESSAGE = `JWT_SECRET is still the sample value. ${GENERATE_HINT}`;

/** Returns the reason a JWT secret is unacceptable, or null when it is fine. */
export function jwtSecretProblem(secret: string): string | null {
  if (secret === SAMPLE_JWT_SECRET || secret.toLowerCase().includes('change-me')) return JWT_SAMPLE_MESSAGE;
  const distinct = new Set(Array.from(secret)).size;
  if (distinct < MIN_JWT_SECRET_DISTINCT_CHARS) {
    return `JWT_SECRET must have at least ${MIN_JWT_SECRET_DISTINCT_CHARS} distinct characters`;
  }
  return null;
}

/** TOTP_ENCRYPTION_KEY uses the same sample and distinct-character rules as JWT_SECRET. */
export const MIN_TOTP_KEY_LENGTH = 32;
export const TOTP_SAMPLE_MESSAGE = `TOTP_ENCRYPTION_KEY is still the sample value. ${GENERATE_HINT}`;

export function totpKeyProblem(key: string): string | null {
  if (key.toLowerCase().includes('change-me')) return TOTP_SAMPLE_MESSAGE;
  const distinct = new Set(Array.from(key)).size;
  if (distinct < MIN_JWT_SECRET_DISTINCT_CHARS) {
    return `TOTP_ENCRYPTION_KEY must have at least ${MIN_JWT_SECRET_DISTINCT_CHARS} distinct characters`;
  }
  return null;
}

export const DEFAULT_MAIL_FROM = 'ParroType <no-reply@localhost>';
export const DEFAULT_APP_URL = 'http://localhost:5173';

/** A URL with one of the given protocols (e.g. http:, https:), or null. */
function parseUrlWith(value: string, protocols: string[]): URL | null {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
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
    /** Key material for the AES-256-GCM encryption of TOTP secrets (the key itself is sha256 of this value). */
    TOTP_ENCRYPTION_KEY: z
      .string({ required_error: 'TOTP_ENCRYPTION_KEY is required. ' + GENERATE_HINT })
      .min(MIN_TOTP_KEY_LENGTH, `TOTP_ENCRYPTION_KEY must be at least ${MIN_TOTP_KEY_LENGTH} characters`)
      .superRefine((key, ctx) => {
        const problem = totpKeyProblem(key);
        if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
      }),
    MAIL_TRANSPORT: z
      .enum(MAIL_TRANSPORTS, {
        errorMap: () => ({ message: `must be one of ${MAIL_TRANSPORTS.join(', ')}` }),
      })
      .default('console'),
    /** Required when MAIL_TRANSPORT=smtp. Checked below. */
    SMTP_URL: z.string().optional(),
    MAIL_FROM: z
      .string()
      .trim()
      .min(1, 'MAIL_FROM must not be empty')
      .max(200, 'MAIL_FROM must be at most 200 characters')
      .refine((v) => !/[\r\n]/.test(v), 'MAIL_FROM must be a single line')
      .default(DEFAULT_MAIL_FROM),
    APP_URL: z
      .string()
      .default(DEFAULT_APP_URL)
      .refine((v) => parseUrlWith(v, ['http:', 'https:']) !== null, 'APP_URL must be an http or https URL, e.g. http://localhost:5173'),
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
    if (e.TOTP_ENCRYPTION_KEY === e.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TOTP_ENCRYPTION_KEY'],
        message: 'TOTP_ENCRYPTION_KEY must differ from JWT_SECRET',
      });
    }
    if (e.MAIL_TRANSPORT === 'smtp') {
      if (!e.SMTP_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_URL'],
          message: 'SMTP_URL is required when MAIL_TRANSPORT=smtp (e.g. smtp://user:password@mail.example.com:587)',
        });
      } else if (!parseUrlWith(e.SMTP_URL, ['smtp:', 'smtps:'])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_URL'],
          message: 'SMTP_URL must be a smtp:// or smtps:// URL',
        });
      }
    }
  });

export interface Env {
  DATABASE_PROVIDER: DatabaseProvider;
  DATABASE_URL: string;
  JWT_SECRET: string;
  TOTP_ENCRYPTION_KEY: string;
  MAIL_TRANSPORT: MailTransportName;
  /** Set when MAIL_TRANSPORT=smtp, null otherwise. */
  SMTP_URL: string | null;
  MAIL_FROM: string;
  /** The public origin of the web app, without a trailing slash. Used for the links in emails. */
  APP_URL: string;
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
    TOTP_ENCRYPTION_KEY: e.TOTP_ENCRYPTION_KEY,
    MAIL_TRANSPORT: e.MAIL_TRANSPORT,
    SMTP_URL: e.MAIL_TRANSPORT === 'smtp' ? (e.SMTP_URL ?? null) : null,
    MAIL_FROM: e.MAIL_FROM,
    APP_URL: e.APP_URL.replace(/\/+$/, ''),
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
