/**
 * Export of a user's results as CSV or JSON. The rows come in batches through a fetch function
 * (cursor pagination on id), so the whole history never sits in memory.
 */

export const EXPORT_BATCH_SIZE = 5000;
export const EXPORT_FORMATS = ['csv', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_COLUMNS = [
  'createdAt',
  'mode',
  'mode2',
  'language',
  'wpm',
  'rawWpm',
  'accuracy',
  'consistency',
  'durationMs',
  'correct',
  'incorrect',
  'extra',
  'missed',
  'punctuation',
  'numbers',
] as const;
export type ExportColumn = (typeof EXPORT_COLUMNS)[number];

/** A result row as the export reads it. `id` is only the pagination cursor. */
export interface ExportRow {
  id: number;
  createdAt: Date;
  mode: string;
  mode2: string;
  language: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  durationMs: number;
  correctChars: number;
  incorrectChars: number;
  extraChars: number;
  missedChars: number;
  punctuation: boolean;
  numbers: boolean;
}

export type ExportValue = string | number | boolean;

export function exportRecord(row: ExportRow): Record<ExportColumn, ExportValue> {
  return {
    createdAt: row.createdAt.toISOString(),
    mode: row.mode,
    mode2: row.mode2,
    language: row.language,
    wpm: row.wpm,
    rawWpm: row.rawWpm,
    accuracy: row.accuracy,
    consistency: row.consistency,
    durationMs: row.durationMs,
    correct: row.correctChars,
    incorrect: row.incorrectChars,
    extra: row.extraChars,
    missed: row.missedChars,
    punctuation: row.punctuation,
    numbers: row.numbers,
  };
}

/** Cells that spreadsheets would read as a formula, or that could hide one behind whitespace. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV cell per RFC 4180: quoted when it holds a comma, quote or line break, with quotes
 * doubled. A formula-like cell gets a leading apostrophe first (formula injection guard).
 */
export function csvCell(value: ExportValue): string {
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvLine = (cells: readonly string[]): string => `${cells.join(',')}\r\n`;

export const CSV_HEADER = csvLine(EXPORT_COLUMNS);

/**
 * The export body as string chunks. CSV starts with the header row; JSON is one array. The first
 * batch is fetched before anything is yielded, so a database error can still become an error
 * response instead of a half-written file.
 */
export async function* exportChunks(
  format: ExportFormat,
  fetchAfter: (afterId: number) => Promise<ExportRow[]>,
  batchSize: number = EXPORT_BATCH_SIZE,
): AsyncGenerator<string> {
  let batch = await fetchAfter(0);
  if (format === 'csv') {
    yield CSV_HEADER;
  } else {
    yield '[';
  }

  let first = true;
  for (;;) {
    let out = '';
    for (const row of batch) {
      const record = exportRecord(row);
      if (format === 'csv') {
        out += csvLine(EXPORT_COLUMNS.map((column) => csvCell(record[column])));
      } else {
        out += `${first ? '' : ','}${JSON.stringify(record)}`;
        first = false;
      }
    }
    if (out.length > 0) yield out;
    if (batch.length < batchSize) break;
    batch = await fetchAfter(batch[batch.length - 1].id);
  }

  if (format === 'json') yield ']';
}
