// csv.js — turns rows into CSV text (the format spreadsheets open) and hands it to the browser as a
// downloaded file. Used by Star testing's Download CSV (build phase 6, gap mockups R8 proposals
// 31–32; rulebook v0.144, v0.514).
// Why it exists: the results CSV is built in the browser from the database's rows. Three things must
// be right every time, so they live in one small, checked place (resultsChecks.mjs):
//   1. QUOTING (RFC 4180, the CSV standard): a cell with a comma, a quote mark or a line break is put
//      in "double quotes", and a quote mark inside is doubled ("" ) — otherwise a name like
//      `Kim, Jordan` would split into two columns.
//   2. FORMULA INJECTION: a spreadsheet treats a cell starting with = + - @ (or a tab / carriage
//      return) as a FORMULA and may run it. A family could type such a text into the public form, so
//      those cells get a leading apostrophe ('), which spreadsheets show as plain text.
//   3. PRIVACY: the file holds dates of birth, emails and payments (admins only). It goes from memory
//      straight into a file (a Blob) — never into a web address (a data: link or a ?query), which could
//      end up in the browser's history or a log.
// The text starts with a byte-order mark (BOM) when saved, so Excel reads it as UTF-8 and shows
// "’" and "→" correctly. Lines end with CRLF (\r\n), as RFC 4180 says.

// A cell that would start a formula: = + - @, or a tab / carriage return before one.
const FORMULA_START = /^[=+\-@\t\r]/;

// One value → one CSV cell. null / undefined → empty; numbers and booleans as text.
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

// header: ['Dan', 'Name', …] · rows: [[…], …] → the CSV text (CRLF line ends, one at the end).
export function toCsv(header, rows) {
  return [header, ...rows].map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// The byte-order mark Excel needs to read UTF-8 (U+FEFF, written as a code so this file has no
// invisible character in it).
export const BOM = String.fromCharCode(0xfeff);

// Saves `text` as a file called `fileName` in the browser (the normal download). Browser only.
// The object URL ("blob:…") only points at the file in memory; the content is never in the address.
// Returns true when the download was started.
export function saveCsvFile(fileName, text) {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return false;
  const blob = new Blob([BOM, text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the memory is let go.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
