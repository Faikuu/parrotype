import { CARD_FILE_NAME, drawShareCard, shareResultCard, type CardPalette, type ShareCardInput } from './shareCard';

const palette: CardPalette = {
  bg: '#1d2119',
  text: '#e4e3d3',
  sub: '#6f7562',
  main: '#9db35f',
  surface: '#272c22',
  font: '"Familjen Grotesk", sans-serif',
};

const input: ShareCardInput = {
  wpm: 92.4,
  accuracy: 97.6,
  testLabel: 'time 30 en',
  date: '9 Nov 2026',
  username: 'alice',
  samples: [
    { second: 1, wpm: 60, raw: 62, errors: 0 },
    { second: 2, wpm: 80, raw: 84, errors: 1 },
    { second: 3, wpm: 92, raw: 95, errors: 0 },
  ],
  labels: { brand: 'parrotype', wpm: 'wpm', acc: 'acc' },
};

/** A 2D context with every method the card uses as a spy, and the text it draws recorded. */
function mockContext() {
  const drawn: string[] = [];
  const spy = () => vi.fn();
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    lineJoin: 'miter',
    globalAlpha: 1,
    save: spy(),
    restore: spy(),
    translate: spy(),
    scale: spy(),
    fillRect: spy(),
    beginPath: spy(),
    arc: spy(),
    fill: spy(),
    stroke: spy(),
    moveTo: spy(),
    lineTo: spy(),
    fillText: vi.fn((text: string) => {
      drawn.push(text);
    }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, raw: ctx, drawn };
}

beforeEach(() => {
  // jsdom has no Path2D; the card only passes it on to the (mock) context.
  vi.stubGlobal('Path2D', class {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  const url = URL as unknown as Record<string, unknown>;
  delete url.createObjectURL;
  delete url.revokeObjectURL;
});

describe('drawShareCard', () => {
  it('draws the wordmark, the big wpm, accuracy, the test label, the date and the username', () => {
    const { ctx, drawn } = mockContext();
    drawShareCard(ctx, input, palette);
    expect(drawn).toContain('parrotype');
    expect(drawn).toContain('92');
    expect(drawn).toContain('wpm');
    expect(drawn).toContain('98%');
    expect(drawn).toContain('acc');
    expect(drawn).toContain('time 30 en');
    expect(drawn).toContain('9 Nov 2026');
    expect(drawn).toContain('alice');
  });

  it('paints the background first and draws the wpm line through every sample', () => {
    const { ctx, raw } = mockContext();
    drawShareCard(ctx, input, palette);
    expect(raw.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 1200, 630);
    // One moveTo for the first sample and a lineTo for each of the rest.
    expect(raw.moveTo).toHaveBeenCalledTimes(2); // the baseline, then the wpm line
    expect(raw.lineTo).toHaveBeenCalledTimes(1 + 2);
  });

  it('leaves out the username when nobody is signed in', () => {
    const { ctx, drawn } = mockContext();
    drawShareCard(ctx, { ...input, username: null }, palette);
    expect(drawn).not.toContain('alice');
    expect(drawn).toContain('parrotype');
  });

  it('draws no chart with fewer than two samples', () => {
    const { ctx, raw } = mockContext();
    drawShareCard(ctx, { ...input, samples: [input.samples[0]!] }, palette);
    expect(raw.lineTo).not.toHaveBeenCalled();
  });
});

describe('shareResultCard', () => {
  /** A canvas stand-in whose toBlob hands back a PNG blob, and whose context is the mock. */
  function stubCanvas() {
    const { ctx, drawn } = mockContext();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toBlob: vi.fn((cb: (blob: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' }))),
    };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) =>
      tag === 'canvas' ? canvas : realCreate(tag, options)) as typeof document.createElement);
    return { canvas, drawn };
  }

  it('shares a PNG file when the browser can share files', async () => {
    const { canvas, drawn } = stubCanvas();
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => true), configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    await expect(shareResultCard(input)).resolves.toBe('shared');
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(630);
    expect(drawn).toContain('92');
    const [arg] = share.mock.calls[0] as unknown as [{ files: File[] }];
    expect(arg.files[0]?.name).toBe(CARD_FILE_NAME);
    expect(arg.files[0]?.type).toBe('image/png');
  });

  it('downloads parrotype-result.png when files cannot be shared', async () => {
    stubCanvas();
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    const createObjectURL = vi.fn(() => 'blob:card');
    const url = URL as unknown as Record<string, unknown>;
    url.createObjectURL = createObjectURL;
    url.revokeObjectURL = vi.fn();
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });

    await expect(shareResultCard(input)).resolves.toBe('downloaded');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicks).toEqual([CARD_FILE_NAME]);
  });
});
