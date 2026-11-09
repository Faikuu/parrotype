import { badgeQuerySchema } from '../results/results.schemas';
import { badgeValue, BADGE_HEADERS, escapeXml, renderBadge } from './badge';

describe('escapeXml', () => {
  it('escapes markup and quotes so no tag or attribute can be opened', () => {
    expect(escapeXml(`<script>&"'`)).toBe('&lt;script&gt;&amp;&quot;&#39;');
  });

  it('escapes the ampersand first, so entities are not double-decoded', () => {
    expect(escapeXml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves plain text alone', () => {
    expect(escapeXml('92 wpm · time 60')).toBe('92 wpm · time 60');
  });
});

describe('renderBadge', () => {
  it('renders a two-part svg with the label and value', () => {
    const svg = renderBadge({ label: 'parrotype', value: '92 wpm · time 60' });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('>parrotype</text>');
    expect(svg).toContain('>92 wpm · time 60</text>');
    // Kea colours: label on the surface, value on the main colour.
    expect(svg).toContain('fill="#272c22"');
    expect(svg).toContain('fill="#9db35f"');
  });

  it('escapes a malicious value in every place it appears', () => {
    const svg = renderBadge({ label: 'parrotype', value: `<script>&"'` });
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<script');
    expect(svg).toContain('&lt;script&gt;&amp;&quot;&#39;');
    // The title and aria-label carry the escaped text too.
    expect(svg).toContain('<title>parrotype: &lt;script&gt;&amp;&quot;&#39;</title>');
    expect(svg).toContain('aria-label="parrotype: &lt;script&gt;&amp;&quot;&#39;"');
  });

  it('escapes a malicious label', () => {
    const svg = renderBadge({ label: `"><img src=x onerror=alert(1)>`, value: 'v' });
    expect(svg).not.toContain('<img');
    expect(svg).toContain('&quot;&gt;&lt;img');
  });

  it('gives a wider badge for a longer value', () => {
    const short = renderBadge({ label: 'parrotype', value: 'no result' });
    const long = renderBadge({ label: 'parrotype', value: '120 wpm · daily 2026-11-09' });
    const width = (svg: string) => Number(/<svg[^>]*width="(\d+)"/.exec(svg)?.[1]);
    expect(width(long)).toBeGreaterThan(width(short));
  });
});

describe('badgeValue', () => {
  it('rounds the wpm and names the filter', () => {
    const query = badgeQuerySchema.parse({ mode: 'time', mode2: '60' });
    expect(badgeValue(91.6, query)).toBe('92 wpm · time 60');
  });
});

describe('BADGE_HEADERS', () => {
  it('sets the svg type, caching, CSP, nosniff and a cross-origin policy that lets embeds load', () => {
    expect(BADGE_HEADERS).toEqual({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
  });
});
