// resultsCsv.js — turns migration 0030's testing_results_csv answer into the rows of Color Belt's
// results CSV (design review CB18, rulebook v0.416 and v0.418 Q3).
// Why it exists: the admin's Download CSV on an event's Grading tab builds the file in the browser
// from the database's raw rows. Which columns, in which order, and how each value is written must be
// right every time, so they live here, PURE (no React, no database), checked by checks.mjs.
// The file itself (quoting, the formula-injection guard, the BOM, the download) is Star's
// src/lib/star/csv.js, used as it is — one copy of those rules (the design review's brief: reuse it
// rather than make a third copy).
//
// The columns (v0.418 Q3, in this order; T.CB_CSV_HEADINGS holds the words):
//   Reference (CB-3101) · First name · Last name · Class · Class time ("5:00 – 6:00 PM") · Belt
//   (the belt now) · Testing for (the next rank, or "No new rank") · Result (Passed / Not passed /
//   No show / blank = not graded) · Grader's note (free text) · Paying by (Cash / Check / Card, the
//   family's choice) · Paid (Yes / No) · Amount paid (net paid as a plain number, 65.00, so a
//   spreadsheet can add it up) · Paid on (YYYY-MM-DD) · Paid by (how the newest payment that still
//   counts was paid: Cash / Check / Card) · Registration id (the database's id, last — for matching
//   rows later).
// Paid on and Paid by are blank while nothing is paid (Star's rule for its Paid column).
// The rows come in the database's order (class, belt, last name, first name) and are kept so.
// Never in the file: signatures, login ids, staff names (the database doesn't send them).
import { classTimeLabel } from './eventRules.js';
import * as T from '../../screens/testing/text.js';

// 6500 → '65.00', 0 → '0.00' (no $ and no thousands commas, so spreadsheets read a number).
// Not a whole number of cents → '' (never a guess).
export function centsToCsvNumber(cents) {
  if (!Number.isInteger(cents)) return '';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Formula injection, the cases csv.js leaves open: csv.js puts a ' in front of a cell that STARTS
// with = + - @ (or a tab / carriage return), but not of
//   - one where spaces or a line break come first (" =1+1") — migration 0030 asks the app to cover it;
//   - one where an INVISIBLE character comes first: zero-width space / non-joiner / joiner
//     (U+200B–U+200D), word joiner (U+2060), byte-order mark (U+FEFF) — counted as leading space;
//   - one starting with a look-alike sign some spreadsheets also read as a formula: full-width
//     ＝ ＋ － ＠ (U+FF1D, U+FF0B, U+FF0D, U+FF20) or the minus sign − (U+2212), with or without
//     leading space.
// Such a text gets its ' here, before csv.js sees it (csv.js then leaves it alone: it no longer
// starts with = + - @). A cell that starts with a plain = + - @ is left to csv.js, as before.
// (Written as \u codes so this file has no invisible characters in it.)
const LEADING = '[\\s\\u200B-\\u200D\\u2060\\uFEFF]';
const LOOK_ALIKE = '\\uFF1D\\uFF0B\\uFF0D\\uFF20\\u2212';
const HIDDEN_FORMULA = new RegExp(`^(?:${LEADING}+[=+\\-@${LOOK_ALIKE}]|[${LOOK_ALIKE}])`);
export function guardLeadingSpace(value) {
  return typeof value === 'string' && HIDDEN_FORMULA.test(value) ? `'${value}` : value;
}

// One testing_results_csv row → the 15 cells, in T.CB_CSV_HEADINGS's order (plain values; csv.js
// quotes them and makes = + - @ cells safe when it writes the text).
export function csvRow(row) {
  return csvCells(row).map(guardLeadingSpace);
}
function csvCells(row) {
  const paid = row.paid === true;
  return [
    row.reference ?? '',
    row.first_name ?? '',
    row.last_name ?? '',
    row.class_name ?? '',
    classTimeLabel(row.start_time, row.end_time),
    row.current_belt ?? '',
    row.testing_for ?? T.NO_NEW_RANK,
    T.resultTagText(row.result),
    row.note ?? '',
    T.payingByText(row.paying_by),
    paid ? T.CB_CSV_YES : T.CB_CSV_NO,
    centsToCsvNumber(row.paid_cents ?? 0),
    paid && row.paid_on ? row.paid_on : '',
    paid ? T.payingByText(row.paid_method) : '',
    row.registration_id ?? '',
  ];
}

export const csvRows = (rows) => rows.map(csvRow);

// "November Children Testing", "2026-11-20" → "November-Children-Testing-results-2026-11-20.csv"
// (Star's file name rule: the event name with hyphens — characters a file name can't hold are left
// out — "results", the download day at the school).
export function csvFileName(eventName, today) {
  const base = String(eventName ?? '')
    .normalize('NFC')
    // Direction controls (U+202A–U+202E, U+2066–U+2069, U+200E, U+200F) are taken out: invisible,
    // they can make part of a file name show backwards, so it reads as something it isn't.
    .replace(/[‪-‮⁦-⁩‎‏]+/g, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return `${base || 'Color-Belt-testing'}-results-${today}.csv`;
}

// Is this one testing_results_csv row the shape 0030 promises? (A wrong shape → 'error' in
// eventsApi, never a half-right file.)
const textOrNull = (v) => v === null || typeof v === 'string';
export function isCsvRow(r) {
  return (
    r !== null && typeof r === 'object' &&
    typeof r.registration_id === 'string' && typeof r.reference === 'string' &&
    typeof r.first_name === 'string' && typeof r.last_name === 'string' &&
    typeof r.class_name === 'string' && typeof r.current_belt === 'string' &&
    textOrNull(r.start_time) && textOrNull(r.end_time) && textOrNull(r.testing_for) &&
    textOrNull(r.result) && textOrNull(r.note) && textOrNull(r.paying_by) &&
    typeof r.paid === 'boolean' && Number.isInteger(r.paid_cents) &&
    textOrNull(r.paid_on) && textOrNull(r.paid_method)
  );
}
