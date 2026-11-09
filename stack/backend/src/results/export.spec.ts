import {
  CSV_HEADER,
  EXPORT_BATCH_SIZE,
  EXPORT_COLUMNS,
  csvCell,
  exportChunks,
  exportRecord,
  type ExportRow,
} from './export';

const exportRow = (id: number, overrides: Partial<ExportRow> = {}): ExportRow => ({
  id,
  createdAt: new Date(Date.UTC(2026, 0, id, 12, 30, 0)),
  mode: 'time',
  mode2: '60',
  language: 'en',
  wpm: 80,
  rawWpm: 85,
  accuracy: 97.5,
  consistency: 90,
  durationMs: 60_000,
  correctChars: 400,
  incorrectChars: 10,
  extraChars: 0,
  missedChars: 2,
  punctuation: true,
  numbers: false,
  ...overrides,
});

/** A fetch that behaves like the service: rows after the cursor, at most `batchSize`. */
function pagedFetch(rows: ExportRow[], batchSize: number, calls: number[]) {
  return async (afterId: number): Promise<ExportRow[]> => {
    calls.push(afterId);
    return rows.filter((r) => r.id > afterId).slice(0, batchSize);
  };
}

async function collect(gen: AsyncGenerator<string>): Promise<{ text: string; chunks: number }> {
  let text = '';
  let chunks = 0;
  for await (const chunk of gen) {
    text += chunk;
    chunks += 1;
  }
  return { text, chunks };
}

describe('csvCell', () => {
  it('leaves plain text and numbers as they are', () => {
    expect(csvCell('time')).toBe('time');
    expect(csvCell('a=b')).toBe('a=b');
    expect(csvCell(80)).toBe('80');
    expect(csvCell(97.5)).toBe('97.5');
  });

  it('writes booleans as true and false', () => {
    expect(csvCell(true)).toBe('true');
    expect(csvCell(false)).toBe('false');
  });

  it('quotes a cell with a comma', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
  });

  it('quotes a cell with a quote and doubles the quote', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes a cell with a line feed or a carriage return', () => {
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
    expect(csvCell('a\r\nb')).toBe('"a\r\nb"');
  });

  it('prefixes a formula-like cell with an apostrophe', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('prefixes a cell that starts with a tab or a carriage return', () => {
    expect(csvCell('\tcalc')).toBe("'\tcalc");
    expect(csvCell('\rcalc')).toBe(`"'\rcalc"`);
  });

  it('prefixes and then quotes a formula that also has a comma', () => {
    expect(csvCell('=A1,B1')).toBe(`"'=A1,B1"`);
  });
});

describe('exportRecord', () => {
  it('maps the row to the export columns, in order', () => {
    const record = exportRecord(exportRow(3));
    expect(Object.keys(record)).toEqual([...EXPORT_COLUMNS]);
    expect(record).toEqual({
      createdAt: '2026-01-03T12:30:00.000Z',
      mode: 'time',
      mode2: '60',
      language: 'en',
      wpm: 80,
      rawWpm: 85,
      accuracy: 97.5,
      consistency: 90,
      durationMs: 60_000,
      correct: 400,
      incorrect: 10,
      extra: 0,
      missed: 2,
      punctuation: true,
      numbers: false,
    });
  });
});

describe('exportChunks', () => {
  it('writes the header row, then one CRLF line per result', async () => {
    const rows = [exportRow(1), exportRow(2, { mode2: '=2+2', mode: 'words' })];
    const calls: number[] = [];
    const { text } = await collect(exportChunks('csv', pagedFetch(rows, EXPORT_BATCH_SIZE, calls)));

    const lines = text.split('\r\n');
    expect(lines[0]).toBe(
      'createdAt,mode,mode2,language,wpm,rawWpm,accuracy,consistency,durationMs,correct,incorrect,extra,missed,punctuation,numbers',
    );
    expect(text.startsWith(CSV_HEADER)).toBe(true);
    expect(lines[1]).toBe('2026-01-01T12:30:00.000Z,time,60,en,80,85,97.5,90,60000,400,10,0,2,true,false');
    expect(lines[2]).toBe("2026-01-02T12:30:00.000Z,words,'=2+2,en,80,85,97.5,90,60000,400,10,0,2,true,false");
    expect(text.endsWith('\r\n')).toBe(true);
    expect(calls).toEqual([0]);
  });

  it('pages through the rows with the id cursor and yields one chunk per batch', async () => {
    const rows = [1, 2, 3, 4, 5].map((id) => exportRow(id));
    const calls: number[] = [];
    const { text, chunks } = await collect(exportChunks('csv', pagedFetch(rows, 2, calls), 2));

    expect(calls).toEqual([0, 2, 4]);
    expect(chunks).toBe(1 + 3); // header, then batches of 2, 2 and 1
    expect(text.split('\r\n').filter((l) => l !== '')).toHaveLength(1 + 5);
  });

  it('writes only the header for an account with no results', async () => {
    const { text } = await collect(exportChunks('csv', pagedFetch([], EXPORT_BATCH_SIZE, [])));
    expect(text).toBe(CSV_HEADER);
  });

  it('writes a JSON array with the same fields, across batches', async () => {
    const rows = [1, 2, 3].map((id) => exportRow(id, { mode2: id === 2 ? 'a"b' : '60' }));
    const { text } = await collect(exportChunks('json', pagedFetch(rows, 2, []), 2));

    const parsed = JSON.parse(text) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(3);
    expect(parsed[1].mode2).toBe('a"b');
    expect(parsed[0]).toEqual(exportRecord(rows[0]));
    expect(parsed[2]).toEqual(exportRecord(rows[2]));
  });

  it('writes [] for JSON with no results', async () => {
    const { text } = await collect(exportChunks('json', pagedFetch([], EXPORT_BATCH_SIZE, [])));
    expect(text).toBe('[]');
  });

  it('does not prefix JSON values', async () => {
    const rows = [exportRow(1, { mode2: '=2+2' })];
    const { text } = await collect(exportChunks('json', pagedFetch(rows, EXPORT_BATCH_SIZE, [])));
    expect(JSON.parse(text)[0].mode2).toBe('=2+2');
  });

  it('uses 5000 rows per batch by default', () => {
    expect(EXPORT_BATCH_SIZE).toBe(5000);
  });
});
