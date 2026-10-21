// checks.js — what is wrong with a Candidates form, as CODES (text.js turns them into words).
// Why it exists: contract CONTRACT-0016-B2 §3.3–§3.7. Record payment, Edit payment, Record refund,
// Edit details and Add candidate check their fields the same way the database does, so a mistake
// shows under the field before anything is sent. The database still checks everything again (it
// decides); these checks only save a round trip. Pure functions: no React, no browser.
import { nameProblem } from '../../../lib/testing/names.js';
import { parseAmount } from '../../../lib/blackBelt/money.js';
import { DANS, METHODS, NOTE_MAX, SCHOOL_CODES, emailIsValid, trimSpaces } from '../../../lib/blackBelt/rules.js';

const DOB_MIN = '1900-01-01';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// How many characters a note has after trimming the spaces at both ends ([...text] counts an
// emoji as one character, like the database).
export const noteLength = (text) => [...trimSpaces(String(text ?? ''))].length;

// A date of birth: filled in, a real date, not in the future, not before 1900 → null or 'missing'.
export function dobProblem(dob, today) {
  if (typeof dob !== 'string' || !ISO.test(dob) || dob < DOB_MIN || dob > today) return 'missing';
  return null;
}

// Record payment / Edit payment / Record refund.
//   values  { ticks: ['p1', …], amount: '290', method: 'check' | null, note, reason }
//   options { needTicks (Record / Edit), needReason (Edit), maxCents (Refund: what's been paid) }
// → { ticks, amount, method, note, reason, tooLarge } each null (fine) or a code; `cents` is the
//   amount read (or null).
export function paymentProblems(values, { needTicks = true, needReason = false, maxCents = null } = {}) {
  const read = parseAmount(values.amount);
  const cents = read.cents ?? null;
  const problems = {
    ticks: needTicks && (values.ticks ?? []).length === 0 ? 'missing' : null,
    amount: read.problem ?? null,
    method: METHODS.includes(values.method) ? null : 'missing',
    note: noteLength(values.note) > NOTE_MAX ? 'tooLong' : null,
    reason: null,
    tooLarge: cents !== null && maxCents !== null && cents > maxCents ? 'tooLarge' : null,
  };
  if (needReason) {
    const length = noteLength(values.reason);
    problems.reason = length === 0 ? 'missing' : length > NOTE_MAX ? 'tooLong' : null;
  }
  return { problems, cents };
}

// Edit details (Star v0.112). purged = the date of birth and email were deleted after the
// keeping time: they stay empty and aren't checked.
export function detailsProblems(values, { today, purged = false }) {
  return {
    first: nameProblem(values.first),
    last: nameProblem(values.last),
    dob: purged ? null : dobProblem(values.dob, today),
    email: purged || emailIsValid(values.email) ? null : 'invalid',
    school: SCHOOL_CODES.includes(values.school) ? null : 'missing',
    dan: DANS.includes(Number(values.dan)) ? null : 'missing',
  };
}

// Add candidate (the family form's fields + School + "Waiver signed on paper").
export function addProblems(values, { today, planIds }) {
  return {
    ...detailsProblems(values, { today }),
    plan: planIds.includes(values.planId) ? null : 'missing',
    waiver: values.paperWaiver === true ? null : 'missing',
  };
}

export const anyProblem = (problems) => Object.values(problems).some((code) => code !== null && code !== undefined);
