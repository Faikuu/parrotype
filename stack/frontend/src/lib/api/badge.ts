import { API_BASE } from './client';

export type BadgeMode = 'time' | 'words';

/**
 * The badge image URL for a user's best in one option. Relative to the page when the API base is a path
 * (the default /api), so use `absoluteBadgeUrl` when the URL goes into copied markup.
 */
export function badgeUrl(name: string, mode: BadgeMode, mode2: string, language: string): string {
  const query = new URLSearchParams({ mode, mode2, language }).toString();
  return `${API_BASE}/users/${encodeURIComponent(name)}/badge.svg?${query}`;
}

/** The badge URL made absolute from the current origin, for Markdown and HTML embeds. */
export function absoluteBadgeUrl(name: string, mode: BadgeMode, mode2: string, language: string, origin: string): string {
  return new URL(badgeUrl(name, mode, mode2, language), origin).toString();
}
