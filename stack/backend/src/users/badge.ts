import type { BadgeQuery } from '../results/results.schemas';

/**
 * Headers for every badge response, 200 and 404 alike. helmet's defaults would block an embed:
 * its Cross-Origin-Resource-Policy: same-origin stops other sites loading the image, so it is
 * overridden here. The CSP only allows inline styles, since the SVG has no scripts or links.
 */
export const BADGE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  'Cache-Control': 'public, max-age=600',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

/** Kea theme colours (stack/frontend/src/themes/themes.ts). */
const COLOURS = {
  surface: '#272c22',
  text: '#e4e3d3',
  main: '#9db35f',
  bg: '#1d2119',
};
const HEIGHT = 20;
const FONT_SIZE = 11;
/** Average glyph width of the font stack below at 11px, plus padding on each side. */
const CHAR_WIDTH = 6.8;
const PADDING = 8;
// Single quotes inside: the value goes into a double-quoted XML attribute.
const FONT = "Verdana, 'DejaVu Sans', Geneva, sans-serif";

export const NO_RESULT_VALUE = 'no result';
export const BADGE_LABEL = 'parrotype';

const XML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for element content and double-quoted attributes. */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => XML_ENTITIES[ch] ?? ch);
}

function segmentWidth(text: string): number {
  return Math.ceil(text.length * CHAR_WIDTH) + PADDING * 2;
}

/** A flat two-part badge: the label on the surface colour, the value on the main colour. */
export function renderBadge({ label, value }: { label: string; value: string }): string {
  const labelWidth = segmentWidth(label);
  const valueWidth = segmentWidth(value);
  const total = labelWidth + valueWidth;
  const aria = escapeXml(`${label}: ${value}`);
  const textY = 14;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${HEIGHT}" role="img" aria-label="${aria}">`,
    `<title>${aria}</title>`,
    `<rect width="${labelWidth}" height="${HEIGHT}" fill="${COLOURS.surface}"/>`,
    `<rect x="${labelWidth}" width="${valueWidth}" height="${HEIGHT}" fill="${COLOURS.main}"/>`,
    `<g font-family="${FONT}" font-size="${FONT_SIZE}" text-anchor="middle">`,
    `<text x="${labelWidth / 2}" y="${textY}" fill="${COLOURS.text}">${escapeXml(label)}</text>`,
    `<text x="${labelWidth + valueWidth / 2}" y="${textY}" fill="${COLOURS.bg}">${escapeXml(value)}</text>`,
    '</g>',
    '</svg>',
  ].join('');
}

/** "92 wpm · time 60": the best wpm and the filter it belongs to. The middle dot is valid in an SVG (UTF-8). */
export function badgeValue(wpm: number, query: BadgeQuery): string {
  return `${Math.round(wpm)} wpm · ${query.mode} ${query.mode2}`;
}
