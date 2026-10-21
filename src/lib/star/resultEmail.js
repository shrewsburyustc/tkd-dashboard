// resultEmail.js — the result EMAIL of Star testing (build phase 6, Results): which text a row
// uses, the blanks filled in for one candidate, the fixed subject line, the mailto: link, and the
// RULES a result text must follow (the same yes / no as the database).
// Why it exists: "Email result" builds the message in the browser from the row the screen already
// has (rulebook v0.248, gap mockups R2), and admins edit the three texts (R11, migration 0023). Both
// the Results tab and the Rubrics and prices editor need the same blanks and the same rules, and the
// preview database (mockStarResults.js) must refuse exactly what the real one refuses — so they live
// here, once, PURE (no React, no browser, no database), checked by resultsChecks.mjs.
//
// Sources: CONTRACT-0023 §4 (the rules and the blanks per kind), migration
// supabase/migrations/0023_star_result_texts.sql section 1 (star_result_text_problem — this file's
// resultTextProblem must give the SAME answer for every text) and section 4 (the three starting
// texts), the Phase 6 gap mockups' proposals 9, 13, 16, 44 and 46 (TKD-StarTesting-Phase6-Gap-Mockups.html).
//
// PRIVACY: the mailto: link holds the address and the fixed subject ONLY — never a name, a result
// or the message (a web address can end up in browser history and logs). The message goes through
// the clipboard instead (the screen copies it). Nothing here ever sees a date of birth or a payment.
//
// The words of the error messages are in resultsText.js; this file only deals in codes.
import { scoreText, joinNames } from './gradingText.js';
import { starEmailIsValid, trimEmail } from './emailRule.js';

// The subject line, the same for every family (v0.248, R11 proposal 45). Fixed in the app, never
// stored: it goes into the email link, so it must never carry a name or a result.
export const RESULT_SUBJECT = 'Your star testing result — U.S.T.C.';

// The three texts (star_result_texts.kind).
export const RESULT_KINDS = ['passed', 'makeup_d', 'makeup_below'];
export const MAX_RESULT_TEXT_LENGTH = 2000; // characters (code points, like the database's char_length)

// The 12 blanks (proposal 46), exact spelling and capitals.
export const COMMON_BLANKS = ['first name', 'full name', 'event', 'Dan', 'testing day', 'total', 'pass mark', 'max'];
export const ALL_BLANKS = [...COMMON_BLANKS, 'star earned', 'subjects to work on', 'D subjects', 'below-pass-mark note'];
// Which blanks each kind may use, in the order the editor offers them (R11 proposal 47).
export const BLANKS_BY_KIND = {
  passed: [...COMMON_BLANKS, 'star earned'],
  makeup_d: [...COMMON_BLANKS, 'D subjects', 'subjects to work on', 'below-pass-mark note'],
  makeup_below: [...COMMON_BLANKS, 'subjects to work on'],
};
// Which blanks each kind MUST have (v0.141: always the total and the pass mark; a make-up says what
// to work on). The order is the order the database checks them in.
export const REQUIRED_BY_KIND = {
  passed: ['total', 'pass mark'],
  makeup_d: ['total', 'pass mark', 'subjects to work on'],
  makeup_below: ['total', 'pass mark', 'subjects to work on'],
};

// The STARTING texts (R3, word for word, with names and numbers turned into blanks) — exactly the
// migration's seed (0023 section 4; resultsChecks.mjs compares them with the SQL file). The editor's
// "Reset to the starting text" puts these back (R11 proposal 50). Apostrophes are U+2019.
export const STARTING_TEXTS = {
  passed: 'Hello,\n\n{full name} passed the {event} ({Dan}) {testing day}, with a total of {total} out of {max}, and earns {star earned}. Congratulations, {first name}!\n\nThe pass mark is {pass mark} out of {max}, with no D in any subject.\n\nThank you for all the hard work. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury',
  makeup_d: 'Hello,\n\n{full name} took the {event} ({Dan}) {testing day}, with a total of {total} out of {max}. {first name} has a make-up to do before earning the next star.\n\nThe pass mark is {pass mark} out of {max}, with no D in any subject. {first name} received a D in {D subjects}. {below-pass-mark note}\n\nWhat to work on: {subjects to work on}. Every other grade is kept.\n\nWe’ll let you know how and when the make-up happens. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury',
  makeup_below: 'Hello,\n\n{full name} took the {event} ({Dan}) {testing day}, with a total of {total} out of {max}. {first name} has a make-up to do before earning the next star.\n\nThe pass mark is {pass mark} out of {max}, with no D in any subject. {first name}’s total is below the pass mark.\n\nWhat to work on: {subjects to work on}. Every other grade is kept.\n\nWe’ll let you know how and when the make-up happens. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury',
};

// ===== The text rules (= star_result_text_problem, migration 0023 section 1) =====
// Hidden / control characters, built from code points so this file holds no invisible characters
// itself — the database's list exactly: 1–9, 11–31 (a line break, 10, is fine), 127–159, U+200B–200F,
// U+202A–202E, U+2060–2064, U+2066–2069, U+FEFF. Character 0 is added here: PostgreSQL text can't hold
// it at all, so the database could never accept it either (its answer would be an error, not ok).
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
//   { code, blank }   code: 'kind' · 'empty' · 'too_long' · 'bad_character' · 'first_line' ·
//   'unknown_blank' · 'blank_not_for_kind' · 'stray_brace' · 'missing_required'
//   blank: the blank's name for the three blank codes ('frist name'), else null; length: for too_long
// The ORDER of the checks is the database's, so the code is always the one the database would give.
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

// Just the code, or null — the same answer as the database's star_result_text_problem(kind, body).
export function resultTextProblem(kind, body) {
  return resultTextProblemDetail(kind, body)?.code ?? null;
}

// ===== Which text a row uses (gap mockups proposal 7) =====
// result: the row's Result (gradingApi's camelCase shape — status, makeupReasons, needs, choiceNeeded …)
//   'passed'        Passed
//   'makeup_d'      Make-up with a D somewhere (also when the total is below the pass mark too)
//   'makeup_below'  Make-up below the pass mark, no D, after an admin chose the subjects
//   null            no email: Not finished, Testing privately, Withdrawn, or "below the pass mark —
//                   an admin chooses subjects" (the email must say exactly what to work on, v0.141)
export function resultKind(result) {
  if (!result) return null;
  if (result.status === 'passed') return 'passed';
  if (result.status !== 'makeup') return null;
  if ((result.makeupReasons ?? []).includes('d')) return (result.needs ?? []).length > 0 ? 'makeup_d' : null;
  if (result.choiceNeeded || (result.needs ?? []).length === 0) return null;
  return 'makeup_below';
}
// Does the row get an Email result button? (Q4's "Hide private details" is the screen's own rule.)
export const canEmailResult = (result) => resultKind(result) !== null;

// ===== Filling in the blanks for one row =====
// 'YYYY-MM-DD' → "Saturday, November 14, 2026" (a calendar date: never shifts with time zones)
export function longDate(iso) {
  const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return '';
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}
// 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th", 11 → "11th", 21 → "21st"
export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] ?? 'th'}`;
}
// {star earned}: "their first star" / "their 2nd star" (R3 proposal 16)
export const starEarned = (starsTo) => (starsTo === 1 ? 'their first star' : `their ${ordinal(starsTo)} star`);

// The value of every blank for one row (R11 proposals 44 and 46).
//   row:   { firstName, lastName, starsTo, result }  (a Results row — loadResults in resultsApi.js)
//   event: { name, testingDate }  ·  danLabel: "1st Dan" (the event copy's label)
// {testing day} is "on Saturday, November 14, 2026", or for a private student "at a private testing
// on Tuesday, December 1, 2026". {below-pass-mark note} only says something for a D AND below.
export function blankValues(row, { eventName, testingDate, danLabel }) {
  const r = row.result;
  const first = row.firstName;
  const dCount = (r.dSubjects ?? []).length;
  const alsoBelow = (r.makeupReasons ?? []).includes('d') && (r.makeupReasons ?? []).includes('below');
  return {
    'first name': first,
    'full name': `${first} ${row.lastName}`,
    event: eventName,
    Dan: danLabel,
    'testing day': r.private?.on ? `at a private testing on ${longDate(r.private.on)}` : `on ${longDate(testingDate)}`,
    total: scoreText(r.total),
    'pass mark': scoreText(r.passMark),
    max: scoreText(r.maxScore),
    'star earned': starEarned(row.starsTo ?? r.starsTo),
    'subjects to work on': joinNames(r.needs ?? []),
    'D subjects': joinNames(r.dSubjects ?? []),
    // R3 proposal 14's sentence; "subjects … are" when there is more than one D (same meaning)
    'below-pass-mark note': alsoBelow
      ? `${first}’s total is also below the pass mark; only the D ${dCount > 1 ? 'subjects are' : 'subject is'} tested again.`
      : '',
  };
}

// Puts the values into a text. A blank with an empty value takes ONE space next to it away too, so
// "… a D in Breaking. {below-pass-mark note}" doesn't leave a space at the end of the line. Anything
// that isn't a known blank stays as typed (a saved text never has one: the rules refuse it).
export function fillBlanks(body, values) {
  return String(body).replace(/( ?)\{([^{}]*)\}( ?)/g, (whole, before, name, after) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) return whole;
    const value = values[name];
    if (value === '') return before && after ? ' ' : ''; // "a b" stays "a b"; "a. {blank}" → "a."
    return `${before}${value}${after}`;
  });
}

// The whole message for one row (Email result, R2): the CURRENT text of its kind (Q5 = A).
//   texts: loadResultTexts().texts — { passed: { body, … }, makeup_d: …, makeup_below: … }
// → { status:'ok', kind, subject, body } · { status:'no_email' } (this row gets no email, proposal 7)
//   · { status:'no_text' } (that text wasn't loaded — the screen reloads the texts)
export function buildResultMessage({ texts, row, eventName, testingDate, danLabel }) {
  const kind = resultKind(row?.result);
  if (!kind) return { status: 'no_email' };
  const text = texts?.[kind]?.body;
  if (typeof text !== 'string' || text === '') return { status: 'no_text' };
  return { status: 'ok', kind, subject: RESULT_SUBJECT, body: fillBlanks(text, blankValues(row, { eventName, testingDate, danLabel })) };
}

// The email link: "mailto:<address>?subject=<the fixed subject>" — NOTHING else (no body, no cc,
// no name). The address must pass the database's own email rule (emailRule.js); null when it
// doesn't, so the screen opens nothing. Characters that mean something in a link ("?", "&", "#",
// "%", ",", ";" …) are percent-encoded, so an odd address can never add a body or another recipient.
export function mailtoFor(address) {
  if (!starEmailIsValid(address)) return null;
  const a = trimEmail(address).replace(/[?&#%,;"<>\\^`{|}]/g, (c) => encodeURIComponent(c));
  return `mailto:${a}?subject=${encodeURIComponent(RESULT_SUBJECT)}`;
}
