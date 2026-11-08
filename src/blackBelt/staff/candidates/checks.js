// checks.js — what is wrong with a Candidates form, as CODES (text.js turns them into words).
// Why it exists: contract CONTRACT-0016-B2 §3.3–§3.7. Record payment, Edit payment, Record refund,
// Edit details and Add candidate check their fields the same way the database does, so a mistake
// shows under the field before anything is sent. The database still checks everything again (it
// decides); these checks only save a round trip. Pure functions (no React, no browser); they read
// their words from text.js.
// It also holds editValuesToSave: what Edit details SENDS while Hide private details is on (the
// stored date of birth and email, and for staff the stored Dan, go back unchanged), and two small
// yes/no rules the screens share: canRecordPayment (no Record payment on a possible duplicate),
// printReceiptOffered (Print receipt only with money that stands, BB2), restoreHasUndo (no Undo
// after restoring a Duplicate copy), and two small "what does the roster show" helpers
// (rosterCardList, rosterEmptyText: the count cards and the empty lines, BB15 / C-05).
import { nameProblem } from '../../../lib/testing/names.js';
import { parseAmount } from '../../../lib/blackBelt/money.js';
import { DANS, METHODS, NOTE_MAX, SCHOOL_CODES, emailIsValid, trimSpaces } from '../../../lib/blackBelt/rules.js';
import * as T from '../text.js';

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

// Edit details with Hide private details on (R4-04, v1.037, as Star's Save): the date of birth and
// email read "Hidden on this tablet" and can't be changed, so Save sends the STORED values
// (`initial`) for them — even if something was typed before the switch turned on. For staff the
// Dan is grayed on every row, so theirs goes back to the stored Dan too (what is shown is what is
// saved). With the switch off the values go as typed.
export function editValuesToSave(values, initial, { hidden = false, isAdmin = false } = {}) {
  if (!hidden) return values;
  const out = { ...values, dob: initial.dob, email: initial.email };
  if (!isAdmin) out.dan = initial.dan;
  return out;
}

// Does this candidate offer Record payment at all (R3-02, v1.046 (8))? Not a removed one, not a
// make-up (no fee), and not a row marked "Possible duplicate": a payment could land on the copy that
// is later withdrawn, so it waits until the pair is resolved. The three places that draw it (the PC
// row button, the row ⋯ and the detail's button) all ask here. Hide private details and "has a
// balance" are still checked where the button is drawn.
//   who  { withdrawn: boolean, isMakeup: boolean, duplicateState: string | null }
export const canRecordPayment = ({ withdrawn = false, isMakeup = false, duplicateState = null } = {}) =>
  !withdrawn && !isMakeup && duplicateState !== 'possible';

// Is Print receipt offered (BB2 / M-03, v1.055 (b), v1.105)? On any candidate with a payment or a
// refund that still stands — active OR withdrawn (a removed person's money still counts, v1.038);
// never with nothing paid; never while Hide private details is on; never on a make-up (no fee).
// Star's rule drops it on a withdrawn row with money; Black Belt keeps it.
//   who.lines   the candidate's LIVE payment lines when they are known (the open detail, or an
//               admin's ⋯ that read the candidate first): exact — a payment or a refund among them
//   otherwise   the roster row's own fact: paidCents (the net that stands). More than zero → offered.
//               A row whose net is zero is NOT offered from the row alone: its only payment may have
//               been undone (M-03). An admin's ⋯ reads the live lines first, so a payment that was
//               refunded back to zero still gets its receipt there.
export function printReceiptOffered({ hidden = false, isMakeup = false, lines = null, paidCents = 0 } = {}) {
  if (hidden || isMakeup) return false;
  if (Array.isArray(lines)) return lines.some((line) => line.kind === 'payment' || line.kind === 'refund');
  return paidCents > 0;
}

// What the roster says when it has no rows to draw (C-05 (b), v1.055; R3-09): a search that found
// nobody names the search; a count card's filter says what is true for that card; otherwise the
// empty-roster line that names Add candidate.
export function rosterEmptyText({ searchText = '', card = null } = {}) {
  if (searchText) return T.noMatch(searchText);
  if (card) return T.EMPTY_FOR_CARD[card] ?? T.NO_FILTER_MATCH;
  return T.NO_CANDIDATES;
}

// The count cards above the roster, as plain data (CandidatesTab adds the icons).
//   counts   rules.rosterCards' answer for the shown school(s) (the four plan cards, make-ups left out)
//   total    how many ACTIVE candidates the shown school(s) have (make-ups included)
//   hidden   Hide private details is on: no money cards, so ONE Candidates card stays instead of no
//            row (v1.046 (9)); it is a plain card (kind 'total'), not a button: nothing to filter; with it off, the four plan cards (a fifth would break §8's four in a row)
//   hasAny   false (nobody is registered at the shown school(s)): no cards at all (C-05 (a), as Star)
// → { cards: [{ key, label, value, kind }], note } — note is the gray line under the row (possible
//   duplicates left out of the plan cards), null while hidden or when none were left out.
export function rosterCardList({ counts, total, hidden = false, hasAny = true } = {}) {
  if (!hasAny) return { cards: [], note: null };
  if (hidden) return { cards: [{ key: 'all', label: T.CARD_CANDIDATES, value: total ?? 0, kind: 'total' }], note: null };
  const cards = [
    { key: 'paidInFull', label: T.CARD_PAID_IN_FULL, value: counts?.paidInFull ?? 0, kind: 'filter' },
    { key: 'onSchedule', label: T.CARD_ON_SCHEDULE, value: counts?.onSchedule ?? 0, kind: 'filter' },
    { key: 'late', label: T.CARD_LATE, value: counts?.late ?? 0, kind: 'filter' },
    { key: 'notPaid', label: T.CARD_NOT_PAID, value: counts?.notPaid ?? 0, kind: 'filter' },
  ];
  const left = counts?.duplicatesLeftOut ?? 0;
  return { cards, note: left > 0 ? T.duplicatesLeftOut(left) : null };
}

// Does Restore's toast carry an Undo (R2-03, v1.043, as Star's v0.517 G3)? Not for a row that was
// set aside as a "Duplicate copy": an Undo would withdraw it again as a plain "Removed" and lose the
// reason (an admin uses Review, then Keep this one, instead). Every other restore keeps its Undo.
export const restoreHasUndo = (target) => target?.withdrawnReason !== 'duplicate_copy';

// Add candidate (the family form's fields + School + "Waiver signed on paper").
export function addProblems(values, { today, planIds }) {
  return {
    ...detailsProblems(values, { today }),
    plan: planIds.includes(values.planId) ? null : 'missing',
    waiver: values.paperWaiver === true ? null : 'missing',
  };
}

// The child dialogs that show money or the plan (v1.036): none of them may be on screen, nor open,
// while Hide private details is on. useCandidateActions closes them when the switch turns on and
// CandidatesTab's Dialogs draws none of them while it is on (belt and braces).
export const MONEY_CHILD_KINDS = ['record', 'editPayment', 'undo', 'refund', 'returned', 'receipt', 'plan'];
export const isMoneyChild = (kind) => MONEY_CHILD_KINDS.includes(kind);

export const anyProblem = (problems) => Object.values(problems).some((code) => code !== null && code !== undefined);
