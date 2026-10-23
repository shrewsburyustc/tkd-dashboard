// resultEmail.js — the result EMAIL of Black Belt testing and its CSV file (migration 0025): which
// text a result uses, the blanks filled in for one candidate, the fixed subject line, the mailto:
// link, the RULES a result text must follow (the same yes / no as the database), and the rows of
// the admins' "Download CSV".
// Why it exists: "Email result" builds the message in the browser (Results mockups R 12), admins
// edit the three texts (R 21–R 29), and the preview database (mockGrading.js) must refuse exactly
// what the real one refuses — so the rules live here, once, PURE (no React, no browser, no
// database), checked by checks.mjs. Copied from Star's src/lib/star/resultEmail.js with Black
// Belt's names and blanks (contract 0025 §2.4, §13.1); nothing is imported from Star (each
// section keeps its own copy).
//
// Sources: contract 0025 §2.4 (the starting texts word for word, the blanks per kind, the rule
// codes) — the database's twin is bb_result_text_problem in 0025_black_belt_grading.sql; the
// Results mockups' proposals R 12–R 28 (email) and R 45–R 49 (CSV).
//
// PRIVACY: the mailto: link holds the address and the fixed subject ONLY — never a name, a result
// or the message (a web address can end up in browser history and logs). The message goes through
// the clipboard instead (the screen copies it). The CSV is made in the browser (nothing in a web
// address) and only from bb_results_csv's answer (admins only, logged before it leaves the database).
import { emailIsValid, trimSpaces } from './rules.js';
import { formatCents } from './money.js';
import { trimScaleText, joinNames } from './grading.js';

// The subject line, the same for every family (R 13, R 28). Fixed in the app, never stored: it
// goes into the email link, so it must never carry a name or a result.
export const RESULT_SUBJECT = 'Your black belt testing result — U.S.T.C.';

// The three texts (bb_result_texts.kind).
export const RESULT_KINDS = ['passed', 'makeup_d', 'makeup_below'];
export const MAX_RESULT_TEXT_LENGTH = 2000; // characters (code points, like the database's char_length)

// The blanks (R 24), exact spelling and capitals.
export const COMMON_BLANKS = ['first name', 'full name', 'cycle', 'Dan', 'total', 'pass mark'];
export const ALL_BLANKS = [...COMMON_BLANKS, 'D subjects', 'subjects to work on', 'below-pass-mark note'];
// Which blanks each kind may use, in the order the editor offers them.
export const BLANKS_BY_KIND = {
  passed: [...COMMON_BLANKS],
  makeup_d: [...COMMON_BLANKS, 'D subjects', 'subjects to work on', 'below-pass-mark note'],
  makeup_below: [...COMMON_BLANKS, 'subjects to work on'],
};
// Which blanks each kind MUST have (the order the database checks them in).
export const REQUIRED_BY_KIND = {
  passed: ['total', 'pass mark'],
  makeup_d: ['total', 'pass mark', 'subjects to work on'],
  makeup_below: ['total', 'pass mark', 'subjects to work on'],
};

// The STARTING texts (R03 proposal 26, word for word) — exactly the migration's seed (checks.mjs
// compares their md5 with the SQL file's). "Reset to the starting text" puts these back.
// Apostrophes are U+2019.
export const STARTING_TEXTS = {
  passed: 'Hello,\n\n{full name} passed the {cycle} Black Belt testing ({Dan}), with a total of {total} points. Congratulations, {first name}!\n\nThe pass mark for {first name}’s age group is {pass mark} points, with no D in any subject.\n\nThank you for all the hard work. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury',
  makeup_d: 'Hello,\n\n{full name} took the {cycle} Black Belt testing ({Dan}), with a total of {total} points. {first name} has a make-up to do before earning {Dan}.\n\nThe pass mark for {first name}’s age group is {pass mark} points, with no D in any subject. {first name} received a D in {D subjects}. {below-pass-mark note}\n\nWhat to work on: {subjects to work on}. Every other grade is kept; only this is tested again.\n\nThe make-up is graded at a later testing cycle, with no extra fee. We’ll let you know when. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury',
  makeup_below: 'Hello,\n\n{full name} took the {cycle} Black Belt testing ({Dan}), with a total of {total} points. {first name} has a make-up to do before earning {Dan}.\n\nThe pass mark for {first name}’s age group is {pass mark} points, with no D in any subject. {first name}’s total is below the pass mark.\n\nWhat to work on: {subjects to work on}. Every other grade is kept; only these subjects are tested again.\n\nThe make-up is graded at a later testing cycle, with no extra fee. We’ll let you know when. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury',
};

// ===== The text rules (= bb_result_text_problem, the same list and order as Star's 0023) =====
// Hidden / control characters, built from code points so this file holds no invisible characters
// itself: 1–9, 11–31 (a line break, 10, is fine), 127–159, U+200B–200F, U+202A–202E, U+2060–2064,
// U+2066–2069, U+FEFF. Character 0 is added here: PostgreSQL text can't hold it at all.
const cp = (a, b) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`;
const BAD_CHARACTER = new RegExp(`[${cp(0, 9)}${cp(11, 31)}${cp(127, 159)}${cp(0x200b, 0x200f)}${cp(0x202a, 0x202e)}${cp(0x2060, 0x2064)}${cp(0x2066, 0x2069)}${cp(0xfeff, 0xfeff)}]`);
// "only spaces and no-break spaces" (the empty-first-line guard)
const ONLY_SPACES = new RegExp(`^[ ${String.fromCharCode(160)}]*$`);
// every {…} with no brace inside (the SQL's '\{([^{}]*)\}')
const BLANK_PATTERN = /\{([^{}]*)\}/g;

// The blank names in a text, in order (duplicates kept), e.g. ['full name', 'total', …].
export function blanksIn(body) {
  return [...String(body ?? '').matchAll(BLANK_PATTERN)].map((m) => m[1]);
}

// The FIRST problem of a text, with the blank it is about (for the editor's message), or null.
//   { code, blank, length? }   code: 'kind' · 'empty' · 'too_long' · 'bad_character' ·
//   'first_line' · 'unknown_blank' · 'blank_not_for_kind' · 'stray_brace' · 'missing_required'
// The ORDER of the checks is the database's, so the code is always the one the database gives.
export function resultTextProblemDetail(kind, body) {
  if (kind === null || kind === undefined || !RESULT_KINDS.includes(kind)) return { code: 'kind', blank: null };
  if (body === null || body === undefined || body === '') return { code: 'empty', blank: null };
  const text = String(body);
  const length = [...text].length; // code points, like char_length
  if (length > MAX_RESULT_TEXT_LENGTH) return { code: 'too_long', blank: null, length };
  if (BAD_CHARACTER.test(text)) return { code: 'bad_character', blank: null };
  if (ONLY_SPACES.test(text.split('\n')[0])) return { code: 'first_line', blank: null };
  const found = blanksIn(text);
  const unknown = found.find((name) => !ALL_BLANKS.includes(name));
  if (unknown !== undefined) return { code: 'unknown_blank', blank: unknown };
  const notForKind = found.find((name) => !BLANKS_BY_KIND[kind].includes(name));
  if (notForKind !== undefined) return { code: 'blank_not_for_kind', blank: notForKind };
  if (/[{}]/.test(text.replace(BLANK_PATTERN, ''))) return { code: 'stray_brace', blank: null };
  const missing = REQUIRED_BY_KIND[kind].find((name) => !found.includes(name));
  if (missing !== undefined) return { code: 'missing_required', blank: missing };
  return null;
}

// Just the code, or null — the same answer as the database's bb_result_text_problem(kind, body).
export function resultTextProblem(kind, body) {
  return resultTextProblemDetail(kind, body)?.code ?? null;
}

// ===== Which text a result uses =====
// result: a Results / Grading row's result — the database's own object, snake_case as
// grading.js gradeResult (status, reasons, needs, choice_needed). Q-G6 B: a Make-up · D that
// isn't complete yet may be emailed too.
//   'passed' · 'makeup_d' (a D somewhere, also when below the mark too) · 'makeup_below' (below
//   the mark with no D, after an admin chose the subjects) · null (no email: Not finished, no age,
//   Withdrawn, or "an admin chooses subjects" — the email must say exactly what to work on).
export function resultKind(result) {
  if (!result) return null;
  if (result.status === 'passed') return 'passed';
  if (result.status !== 'makeup') return null;
  if ((result.reasons ?? []).includes('d')) return (result.needs ?? []).length > 0 ? 'makeup_d' : null;
  if (result.choice_needed || (result.needs ?? []).length === 0) return null;
  return 'makeup_below';
}
// Does the row get an Email result button? ("Hide payments" and "no email on file" are the
// screen's own rules.)
export const canEmailResult = (result) => resultKind(result) !== null;

// ===== Filling in the blanks =====
// 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th", 11 → "11th"
export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] ?? 'th'}`;
}
// {Dan}: 1 → "1st Dan"
export const danLabel = (dan) => (Number.isInteger(dan) ? `${ordinal(dan)} Dan` : '');

// The value of every blank, from loadResultEmail's answer (bb_result_email in camelCase):
//   { firstName, lastName, cycleName, dan, total, passMark, reasons, needs (names), dSubjects (names) }
// {below-pass-mark note} only says something for a D AND below (Star's sentence).
export function blankValues(answer) {
  const first = answer?.firstName ?? '';
  const reasons = answer?.reasons ?? [];
  const dCount = (answer?.dSubjects ?? []).length;
  const alsoBelow = reasons.includes('d') && reasons.includes('below');
  return {
    'first name': first,
    'full name': `${first} ${answer?.lastName ?? ''}`.trim(),
    cycle: answer?.cycleName ?? '',
    Dan: danLabel(answer?.dan),
    total: trimScaleText(answer?.total),
    'pass mark': trimScaleText(answer?.passMark),
    'subjects to work on': joinNames(answer?.needs ?? []),
    'D subjects': joinNames(answer?.dSubjects ?? []),
    'below-pass-mark note': alsoBelow
      ? `${first}’s total is also below the pass mark; only the D ${dCount > 1 ? 'subjects are' : 'subject is'} tested again.`
      : '',
  };
}

// Puts the values into a text. A blank with an empty value takes ONE space next to it away too, so
// "… a D in Free sparring. {below-pass-mark note}" doesn't leave a space at the end of the line.
// Anything that isn't a known blank stays as typed (a saved text never has one: the rules refuse it).
export function fillBlanks(body, values) {
  return String(body).replace(/( ?)\{([^{}]*)\}( ?)/g, (whole, before, name, after) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) return whole;
    const value = values[name];
    if (value === '') return before && after ? ' ' : '';
    return `${before}${value}${after}`;
  });
}

// The whole message for one candidate (Email result, R 12): the CURRENT text of the answer's kind.
//   texts: loadResultTexts().texts — { passed: { body, … }, makeup_d: …, makeup_below: … }
//   answer: loadResultEmail's ok answer (its kind decides the text)
// → { status:'ok', kind, subject, body } · { status:'no_text' } (that text wasn't loaded — reload)
//   · { status:'not_finished' } (no kind: nothing to email)
export function buildResultMessage({ texts, answer }) {
  const kind = answer?.kind;
  if (!RESULT_KINDS.includes(kind)) return { status: 'not_finished' };
  const text = texts?.[kind]?.body;
  if (typeof text !== 'string' || text === '') return { status: 'no_text' };
  return { status: 'ok', kind, subject: RESULT_SUBJECT, body: fillBlanks(text, blankValues(answer)) };
}

// The email link: "mailto:<address>?subject=<the fixed subject>" — NOTHING else (no body, no cc,
// no name). The address must pass the database's own email rule (rules.js); null when it doesn't,
// so the screen opens nothing. Characters that mean something in a link ("?", "&", "#", "%", ",",
// ";" …) are percent-encoded, so an odd address can never add a body or another recipient.
export function mailtoFor(address) {
  const trimmed = typeof address === 'string' ? trimSpaces(address) : null;
  if (!trimmed || !emailIsValid(trimmed)) return null;
  const a = trimmed.replace(/[?&#%,;"<>\\^`{|}]/g, (c) => encodeURIComponent(c));
  return `mailto:${a}?subject=${encodeURIComponent(RESULT_SUBJECT)}`;
}

// ===== Download CSV (R 45–R 49) =====

// The file name (R 45): the cycle name with hyphens, "Black-Belt-results", the download day.
//   ('Spring 2027', '2027-06-09') → 'Spring-2027-Black-Belt-results-2027-06-09.csv'
export function csvFileName(cycleName, day) {
  const name = String(cycleName ?? '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-') || 'Cycle';
  return `${name}-Black-Belt-results-${day}.csv`;
}

// R 47's 21 columns, in order.
export const CSV_COLUMNS = ['Dan', 'Name', 'School', 'Make-up from', 'Date of birth', 'Pass-mark bracket', 'Email', 'Plan', 'Kukkiwon',
  'Payments', 'Balance', 'Physical', 'Technical', 'Curriculum', 'Other requirements', 'Extra points', 'Total', 'Pass mark', 'Result',
  'Needs', 'Result sent'];

const SCHOOL_NAMES = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
const RESULT_WORDS = { passed: 'Passed', makeup: 'Make-up', not_finished: 'Not finished', no_age: 'Not finished', withdrawn: 'Withdrawn' };
const PART_CODES = ['physical', 'technical', 'curriculum', 'other'];

// "8 and under", "13–17", "18 and over", "All ages" (the same words as rubric.js bracketLabel)
function bracketWords(b) {
  if (!b) return '';
  const from = b.from ?? null;
  const to = b.to ?? null;
  if (from === null && to === null) return 'All ages';
  if (from === null) return `${to} and under`;
  if (to === null) return `${from} and over`;
  return from === to ? `${from}` : `${from}–${to}`;
}
// "May 29" for the Payments words (a calendar date: never shifts with time zones)
function monthDay(iso) {
  const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return '';
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
}
// The Candidates tab's Payments tag words (R 48): "Paid in full", "Late · $330 since May 29" …
// money = the CSV row's money (snake_case, bb_candidate_money without its items).
function paymentWords(money, isMakeup) {
  if (isMakeup) return 'Make-up';
  if (!money) return '';
  switch (money.tag) {
    case 'paid_in_full':
      return money.overpaid_cents > 0 ? `Paid in full · ${formatCents(money.overpaid_cents)} overpaid` : 'Paid in full';
    case 'next':
      return `Next ${formatCents(money.next_cents)} by ${monthDay(money.next_on)}`;
    case 'late':
      return `Late · ${formatCents(money.late_cents)}${money.late_kukkiwon_only ? ' Kukkiwon' : ''} since ${monthDay(money.late_since)}`;
    case 'not_paid':
      return 'Not paid';
    default:
      return '';
  }
}
// "2027-06-07 Staff" or "Not sent yet (Passed sent 2027-06-07)" — sent = the row's bb_sent_state
// { sent: { marked_at, marked_by_name, result_status } | null, matches }; markedOn = its school date.
function sentWords(sent, schoolDateOf) {
  const s = sent?.sent;
  if (!s) return 'Not sent yet';
  const day = schoolDateOf(s.marked_at);
  if (sent.matches) return `${day} ${s.marked_by_name ?? ''}`.trim();
  return `Not sent yet (${RESULT_WORDS[s.result_status] ?? s.result_status} sent ${day})`;
}

// bb_results_csv's rows (snake_case, R 49's order already) → arrays of cell texts, R 48's values:
// parts and extra points as points (blank while a part has no grade at all); Total a plain number;
// Needs "Free sparring" or "Admin chooses", and for Late "TKD project (late)"; dates YYYY-MM-DD.
//   schoolDateOf(timestamp) → 'YYYY-MM-DD' at the school (the screens pass the app's own).
// → [CSV_COLUMNS, ...rows]
export function csvRows(answer, { schoolDateOf = (iso) => String(iso ?? '').slice(0, 10) } = {}) {
  const rows = (answer?.rows ?? []).map((r) => {
    const parts = Object.fromEntries((r.parts ?? []).map((p) => [p.code, p]));
    const partCell = (code) => {
      const p = parts[code];
      return p && p.graded > 0 ? trimScaleText(p.points) : '';
    };
    const res = r.result ?? {};
    let needs = '';
    if (res.choice_needed) needs = 'Admin chooses';
    else if ((res.needs ?? []).length > 0) needs = (res.needs ?? []).join(', ');
    else if ((res.late ?? []).length > 0) needs = (res.late ?? []).map((n) => `${n} (late)`).join(', ');
    const isMakeup = typeof r.makeup_of_cycle_name === 'string' && r.makeup_of_cycle_name !== '';
    return [
      Number.isInteger(r.dan) ? danLabel(r.dan) : '',
      `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      SCHOOL_NAMES[r.location_code] ?? r.location_code ?? '',
      r.makeup_of_cycle_name ?? '',
      r.date_of_birth ?? '',
      bracketWords(r.pass_bracket),
      r.email_for_results ?? '',
      isMakeup ? 'No fee' : r.plan_name ?? '',
      r.kukkiwon ? 'Yes' : 'No',
      paymentWords(r.money, isMakeup),
      isMakeup || !r.money ? '' : formatCents(r.money.balance_cents),
      ...PART_CODES.map(partCell),
      r.extra_total === null || r.extra_total === undefined ? '' : trimScaleText(r.extra_total),
      trimScaleText(r.total),
      trimScaleText(r.pass_mark),
      RESULT_WORDS[r.result_status] ?? r.result_status ?? '',
      needs,
      sentWords(r.sent, schoolDateOf),
    ];
  });
  return [CSV_COLUMNS, ...rows];
}

// One CSV cell: quoted when it holds a comma, a quote or a line break (quotes doubled). A cell
// starting with = + - @ gets a leading ' so a spreadsheet never runs it as a formula.
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// The whole file's text: UTF-8 with a byte-order mark (R 49, so Excel shows ’ and — right),
// CRLF line ends.
export function csvText(rows) {
  return `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
