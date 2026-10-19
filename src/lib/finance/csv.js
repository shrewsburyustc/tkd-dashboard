// csv.js — turns the rows of finance_export into the text of a CSV file (Excel / Google Sheets).
// Why it exists: Export… (admins) downloads a date range of payments as a spreadsheet file
// (contract 0011 §1.4 finance_export, §3). Building the file in the browser needs no library,
// but three things must be exactly right, so they live here and are tested by checks.mjs:
//   1. Quoting (RFC 4180, the CSV standard): a cell with a comma, a double quote or a line break
//      is wrapped in double quotes, and each " inside it is written twice ("").
//   2. Lines end with CRLF (carriage return + line feed), what Excel expects.
//   3. The FORMULA GUARD: students' names come from the public family form, so they can't be
//      trusted. A cell starting with = + - @ (or a tab / carriage return) could run as a formula
//      when the file is opened in Excel. Text cells starting with one of those get a leading '
//      so Excel shows them as plain text. Spaces before the sign don't hide it ("  =1+1"), and the
//      full-width signs ＝ ＋ － ＠ (which Excel may also treat as formulas) count too. Amount cells
//      are NOT guarded: they are numbers we write ourselves, like -35.00 (a guard would turn them
//      into text and break sums).
//   4. The file starts with a UTF-8 "byte-order mark" (BOM, the invisible character U+FEFF).
//      Without it Excel guesses an old Windows encoding and shows "José" as "JosÃ©".
// It is PURE (no browser), so Node can test it.

// The columns of the file, in order: [key in the export row, how the cell is written].
//   'text'  → untrusted text: formula guard + quoting
//   'code'  → one of our own codes, written through a label map (also guarded, to be safe)
//   'plain' → dates / times we produce ('2026-10-24', '10:04'): quoting only
//   'money' → cents written as a plain number with two decimals: 6500 → 65.00, -3500 → -35.00
export const CSV_COLUMNS = [
  ['day', 'plain'],
  ['school', 'code'],
  ['time', 'plain'],
  ['first_name', 'text'],
  ['last_name', 'text'],
  ['what', 'code'],
  ['event_date', 'plain'],
  ['kind', 'code'],
  ['method', 'code'],
  ['amount_cents', 'money'],
  ['counted_cents', 'money'],
  ['recorded_by_name', 'text'],
  ['state', 'code'],
  ['note', 'text'],
];

// Default header words and value labels. The screens may pass their own (from text.js) — see toCsv.
export const DEFAULT_CSV_HEADERS = {
  day: 'Date', school: 'School', time: 'Time', first_name: 'First name', last_name: 'Last name', what: 'For',
  event_date: 'Testing date', kind: 'Kind', method: 'Paid by', amount_cents: 'Amount', counted_cents: 'Counted in total',
  recorded_by_name: 'Recorded by', state: 'Status', note: 'Note',
};
export const DEFAULT_CSV_LABELS = {
  school: { worcester: 'Worcester', shrewsbury: 'Shrewsbury' },
  what: { color_belt: 'Color belt testing', star: 'Star testing' },
  kind: { payment: 'Payment', refund: 'Refund' },
  method: { cash: 'Cash', check: 'Check', card: 'Card' },
  state: { counted: 'Counted', undone: 'Undone', edited: 'Edited', moved_out: 'Moved out', moved_in: 'Moved in' },
};

// The characters that make a spreadsheet treat a cell as a formula (or that hide one): a tab or
// carriage return first, or = + - @ (or their full-width forms) after any spaces.
const FORMULA_START = /^(?:[\t\r]|[\s\u3000]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/;
// The UTF-8 byte-order mark: tells Excel the file is UTF-8.
export const CSV_BOM = '\uFEFF';

// Formula guard for one text cell: "=SUM(A1)" → "'=SUM(A1)". Other text is unchanged.
export function guardFormula(text) {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

// RFC 4180 quoting for one cell: wrapped in quotes only when it holds , " CR or LF.
export function quoteCell(text) {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Cents → '65.00' / '-35.00' (no $ and no thousands commas, so spreadsheets read a number).
export function centsToCsvNumber(cents) {
  if (!Number.isInteger(cents)) return '';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// One cell's text, ready for the file.
function cellText(row, key, type, labels) {
  const value = row?.[key];
  if (value === null || value === undefined) return '';
  if (type === 'money') return centsToCsvNumber(value);
  if (type === 'plain') return quoteCell(String(value));
  const shown = type === 'code' ? (labels[key]?.[value] ?? String(value)) : String(value);
  return quoteCell(guardFormula(shown));
}

// The whole file: a byte-order mark, a header line, then one line per row, every line ending with CRLF.
//   rows: finance_export's `rows` (snake_case, exactly as the database sends them)
//   options.headers: { key: 'Header words' } to replace any default header
//   options.labels:  { school | what | kind | method | state: { code: 'Words' } } to replace labels
// Summing the "Counted in total" column always gives the right total (counted_cents is 0 for
// rows that don't add up: undone and moved-out lines).
export function toCsv(rows, { headers = {}, labels = {} } = {}) {
  const head = { ...DEFAULT_CSV_HEADERS, ...headers };
  const words = Object.fromEntries(Object.keys(DEFAULT_CSV_LABELS).map((k) => [k, { ...DEFAULT_CSV_LABELS[k], ...(labels[k] ?? {}) }]));
  const lines = [CSV_COLUMNS.map(([key]) => quoteCell(guardFormula(String(head[key] ?? key)))).join(',')];
  for (const row of rows ?? []) lines.push(CSV_COLUMNS.map(([key, type]) => cellText(row, key, type, words)).join(','));
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}

// The download's file name (D7): 'Shrewsbury-2026-10-01-to-2026-10-31.csv'.
export function csvFileName(schoolName, from, to) {
  const safe = String(schoolName ?? 'School').replace(/[^A-Za-z0-9-]+/g, '');
  return `${safe || 'School'}-${from}-to-${to}.csv`;
}
