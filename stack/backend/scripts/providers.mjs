// Database providers and the URL scheme each one needs. Shared by the scripts; src/config/env.ts repeats the rules for the app.

export const PROVIDERS = ['sqlite', 'postgresql', 'mysql'];
export const DEFAULT_PROVIDER = 'sqlite';

const RULES = {
  sqlite: {
    matches: (url) => url.startsWith('file:'),
    example: 'file:../dev.db (relative to prisma/sqlite/, the schema folder)',
  },
  postgresql: {
    matches: (url) => /^postgres(ql)?:\/\//.test(url),
    example: 'postgresql://user:password@localhost:5432/parrotype',
  },
  mysql: {
    matches: (url) => url.startsWith('mysql://'),
    example: 'mysql://user:password@localhost:3306/parrotype',
  },
};

/** Returns a problem description, or null when the URL fits the provider. */
export function checkUrl(provider, url) {
  const rule = RULES[provider];
  if (!rule) return `unknown DATABASE_PROVIDER "${provider}" (expected ${PROVIDERS.join(', ')})`;
  if (rule.matches(url)) return null;
  return `DATABASE_URL does not match DATABASE_PROVIDER=${provider} (expected a URL like ${rule.example})`;
}

/** Picks the provider from a URL's scheme, or undefined when no scheme is known. */
export function providerFromUrl(url) {
  return PROVIDERS.find((p) => RULES[p].matches(url));
}

/** Reads DATABASE_PROVIDER, falling back to the default. Throws for unknown values. */
export function resolveProvider(value) {
  const provider = (value ?? '').trim() || DEFAULT_PROVIDER;
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`DATABASE_PROVIDER must be one of ${PROVIDERS.join(', ')} (got "${provider}")`);
  }
  return provider;
}
