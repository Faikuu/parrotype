import { getEnv } from '../config/env';

/**
 * Quotes a fixed table or column name for the engine in use (backticks on MySQL, double quotes elsewhere).
 * The names come from code, never from request input.
 */
export function quoteIdent(name: string): string {
  return getEnv().DATABASE_PROVIDER === 'mysql' ? `\`${name}\`` : `"${name}"`;
}
