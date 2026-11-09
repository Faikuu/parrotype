import type { SecondSample } from '@/lib/engine/types';

/**
 * The shareable result image: 1200 x 630 PNG in the current theme. drawShareCard is pure drawing on any 2D
 * context (unit-tested with a mock); renderShareCard prepares the canvas, and shareResultCard shares the
 * file through the Web Share API when it can share files, otherwise downloads it.
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
export const CARD_FILE_NAME = 'parrotype-result.png';

export interface CardPalette {
  bg: string;
  text: string;
  sub: string;
  main: string;
  surface: string;
  /** The UI font family list, as a CSS font-family value. */
  font: string;
}

export interface ShareCardLabels {
  /** The wordmark, "parrotype". */
  brand: string;
  wpm: string;
  acc: string;
}

export interface ShareCardInput {
  wpm: number;
  accuracy: number;
  /** The test label, e.g. "time 30 en". */
  testLabel: string;
  /** The date already formatted for the reader. */
  date: string;
  /** Signed-in user name, or null. */
  username: string | null;
  samples: readonly SecondSample[];
  labels: ShareCardLabels;
}

const MARGIN = 80;
const CHART = { x: 730, y: 250, width: 390, height: 230 };

/** Reads the palette from the theme tokens on <html>. Call after the theme is applied. */
export function readCardPalette(): CardPalette {
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: get('--bg', '#1d2119'),
    text: get('--text', '#e4e3d3'),
    sub: get('--sub', '#6f7562'),
    main: get('--main', '#9db35f'),
    surface: get('--surface', '#272c22'),
    font: get('--font-ui', 'sans-serif'),
  };
}

/** The parrot mark from ParrotHead.tsx (24-unit viewBox), drawn at (x, y) with the given size. */
const BEAK_PATH =
  'M17.6 8.2c3-.6 5 1 4.4 4-.3 1.6-1.4 2.6-2.8 2.6-.5-.1-.9-.4-1.1-.9-.2-.6-.4-1.3-1.2-1.8-.7-.4-1.4-.6-2.3-.6l.3-2.6c.6 0 1.4 0 2.7-.7Z';

function drawParrotMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, palette: CardPalette): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = palette.text;
  ctx.beginPath();
  ctx.arc(11, 12, 8.5, 0, Math.PI * 2);
  ctx.fill();
  if (typeof Path2D !== 'undefined') ctx.fill(new Path2D(BEAK_PATH));
  ctx.fillStyle = palette.bg;
  ctx.beginPath();
  ctx.arc(14.4, 9.7, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The wpm line over the test, scaled to the highest sample. Nothing with fewer than two samples. */
function drawChart(ctx: CanvasRenderingContext2D, samples: readonly SecondSample[], palette: CardPalette): void {
  if (samples.length < 2) return;
  const { x, y, width, height } = CHART;
  const top = Math.max(1, ...samples.map((s) => s.wpm));
  ctx.save();
  ctx.strokeStyle = palette.sub;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + height);
  ctx.lineTo(x + width, y + height);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.main;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  samples.forEach((s, i) => {
    const px = x + (i / (samples.length - 1)) * width;
    const py = y + height - (s.wpm / top) * height;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
}

/** Paints the whole card. The background is filled first, so the context may start blank. */
export function drawShareCard(ctx: CanvasRenderingContext2D, input: ShareCardInput, palette: CardPalette): void {
  ctx.save();
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.textBaseline = 'alphabetic';

  drawParrotMark(ctx, MARGIN, 64, 64, palette);
  ctx.fillStyle = palette.text;
  ctx.font = `600 36px ${palette.font}`;
  ctx.textAlign = 'left';
  ctx.fillText(input.labels.brand, MARGIN + 84, 110);

  if (input.username) {
    ctx.font = `500 30px ${palette.font}`;
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'right';
    ctx.fillText(input.username, CARD_WIDTH - MARGIN, 104);
  }
  ctx.font = `400 26px ${palette.font}`;
  ctx.fillStyle = palette.sub;
  ctx.textAlign = 'right';
  ctx.fillText(input.date, CARD_WIDTH - MARGIN, input.username ? 146 : 110);

  ctx.textAlign = 'left';
  ctx.fillStyle = palette.main;
  ctx.font = `700 190px ${palette.font}`;
  ctx.fillText(String(Math.round(input.wpm)), MARGIN - 6, 380);
  ctx.fillStyle = palette.sub;
  ctx.font = `400 34px ${palette.font}`;
  ctx.fillText(input.labels.wpm, MARGIN, 436);

  ctx.fillStyle = palette.text;
  ctx.font = `700 96px ${palette.font}`;
  ctx.fillText(`${Math.round(input.accuracy)}%`, 420, 340);
  ctx.fillStyle = palette.sub;
  ctx.font = `400 34px ${palette.font}`;
  ctx.fillText(input.labels.acc, 420, 390);

  ctx.fillStyle = palette.sub;
  ctx.font = `400 30px ${palette.font}`;
  ctx.fillText(input.testLabel, MARGIN, 530);

  drawChart(ctx, input.samples, palette);
  ctx.restore();
}

/** Renders the card to a PNG blob. Waits for the UI font so the text is set in it. */
export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  drawShareCard(ctx, input, readCardPalette());
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png');
  });
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked later: some browsers start the download after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Shares the card as a file when the browser can share files, otherwise downloads parrotype-result.png.
 * A share the user dismisses is 'cancelled'. A share that fails for another reason downloads instead.
 */
export async function shareResultCard(input: ShareCardInput): Promise<ShareOutcome> {
  const blob = await renderShareCard(input);
  const file = new File([blob], CARD_FILE_NAME, { type: 'image/png' });
  if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'parrotype' });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(blob, CARD_FILE_NAME);
  return 'downloaded';
}
