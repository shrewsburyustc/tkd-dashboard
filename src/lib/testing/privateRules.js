// privateRules.js — the rules of a Color Belt PRIVATE TESTING (phase 4), written once for everyone.
// Why it exists: a private testing is its own record on the Private testing tab (not part of any
// event, rulebook v0.401). The staff screens, the preview database (mockTestingEvents.js) and the
// real database (migration 0014, contract 0014 §1) must agree on the day and time rules, on what
// is owed, on which ⋯ items show and on how the Upcoming / Past lists and their cards count.
// checks.mjs tests this file with the contract's worked examples E1–E13.
//
// It is PURE: no React, no database, no browser — so Node can import it.
//
// Words used:
//   today      'YYYY-MM-DD' in school time (America/New_York); dates compare as plain text
//   net paid   the sum of a private testing's payments, reversals counted negative (paidCents)
//   owed       what Mark paid would record now: the private price minus what's paid, never < 0
//   upcoming   active and its day is today or later; past = its day is before today, or cancelled
//   row        a private testing as privateApi.js returns it (camelCase)
import { isIsoDate } from './eventRules.js';

// ----- Day and time (contract 0014 §1.2) -----

// The start times a private testing may have: 6:00 AM to 10:00 PM in 5-minute steps, both ends
// included (the same list as Add event's class times, v0.157). 16 hours × 12 + 1 = 193 choices,
// written '06:00', '06:05', … '22:00'.
export const PRIVATE_TIME_CHOICES = (() => {
  const list = [];
  for (let minutes = 6 * 60; minutes <= 22 * 60; minutes += 5) {
    list.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }
  return list;
})();
const PRIVATE_TIME_SET = new Set(PRIVATE_TIME_CHOICES);

// Is this a start time the database accepts? 'HH:MM' or 'HH:MM:SS' with seconds 00, and one of
// the 193 choices above. ('16:03', '22:05', '16:00:30' → false.)
export function privateTimeIsValid(text) {
  const m = typeof text === 'string' ? /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text) : null;
  if (!m) return false;
  if (m[3] !== undefined && m[3] !== '00') return false;
  return PRIVATE_TIME_SET.has(`${m[1]}:${m[2]}`);
}

// The latest day allowed: today plus one year, as Postgres counts it (date + interval '1 year'):
// Feb 29 becomes Feb 28 of the next year. Not a date → null. (Only a typo guard, §10 point 1.)
export function privateDayLimit(today) {
  if (!isIsoDate(today)) return null;
  const [y, m, d] = today.split('-');
  const next = `${Number(y) + 1}-${m}-${d}`;
  return isIsoDate(next) ? next : `${Number(y) + 1}-${m}-28`; // only Feb 29 can fail
}

// What's wrong with a day the desk typed, as a code (text.js has the words):
//   null      fine (today counts, at any time of day — only the day is checked)
//   'missing' not a 'YYYY-MM-DD' date (empty, half typed)
//   'past'    before today                       (the database answers past_day)
//   'tooFar'  more than a year from today         (the database answers invalid)
export function privateDayProblem(day, today) {
  if (!isIsoDate(day)) return 'missing';
  if (day < today) return 'past';
  const limit = privateDayLimit(today);
  if (limit !== null && day > limit) return 'tooFar';
  return null;
}

// ----- Money (contract 0014 §1.3 — the same rule as the database's testing_private_amount_due) -----

// owed = greatest(private_cents − greatest(net, 0), 0). Whole cents, 0 or more. A missing paid
// amount counts as 0.
export function amountDue({ privateCents, paidCents }) {
  const price = Number.isInteger(privateCents) ? privateCents : 0;
  const net = Number.isInteger(paidCents) ? paidCents : 0;
  return Math.max(price - Math.max(net, 0), 0);
}

// Paid, but still owes more (the amber "Paid $65 · $20 more to collect" line).
export function owesMore(row) {
  return row?.paid === true && row.amountDueCents > 0;
}

// Does the row show Mark paid? Active and something to collect (also next to a Paid tag while a
// top-up is owed). A $0 price never shows it (E10).
export function showMarkPaid(row) {
  return row?.status === 'active' && row.amountDueCents > 0;
}

// May the desk change how they'll pay? Active, and not paid yet or still owing.
export function canChangePayingBy(row) {
  return row?.status === 'active' && (row.paid !== true || row.amountDueCents > 0);
}

// ----- Upcoming / Past and the cards (§1.1, P1) -----

// Which list a private testing is on: 'upcoming' (active, today or later) or 'past'.
export function privateSide(row, today) {
  if (row?.status === 'cancelled') return 'past';
  return row?.privateDate < today ? 'past' : 'upcoming';
}

const byText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'accent' });
const byPlain = (a, b) => (a === b ? 0 : (a ?? '') < (b ?? '') ? -1 : 1);
const byName = (a, b) => byText(a.lastName, b.lastName) || byText(a.firstName, b.firstName);

// The two lists: { upcoming, past }. Upcoming soonest first (day, time, last name, first name);
// past latest first (day, then time, newest first; then by name). New arrays — the input isn't
// re-ordered.
export function splitPrivate(rows, today) {
  const list = Array.isArray(rows) ? rows : [];
  const upcoming = list.filter((r) => privateSide(r, today) === 'upcoming')
    .sort((a, b) => byPlain(a.privateDate, b.privateDate) || byPlain(a.privateTime, b.privateTime) || byName(a, b));
  const past = list.filter((r) => privateSide(r, today) === 'past')
    .sort((a, b) => byPlain(b.privateDate, a.privateDate) || byPlain(b.privateTime, a.privateTime) || byName(a, b));
  return { upcoming, past };
}

// The cards over ONE side's rows:
//   count / paid / notPaid / owesMore   ACTIVE rows only (a cancelled one isn't counted)
//   paymentsCents   net payments of ALL rows on the side, cancelled ones included (E11)
//   cancelledCents  the cancelled rows' part of it ("includes $85 from cancelled")
export function privateCards(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const cents = (r) => (Number.isInteger(r.paidCents) ? r.paidCents : 0);
  const active = list.filter((r) => r.status === 'active');
  return {
    count: active.length,
    paid: active.filter((r) => r.paid === true).length,
    notPaid: active.filter((r) => r.paid !== true).length,
    owesMore: active.filter(owesMore).length,
    paymentsCents: list.reduce((total, r) => total + cents(r), 0),
    cancelledCents: list.filter((r) => r.status === 'cancelled').reduce((total, r) => total + cents(r), 0),
  };
}

// ----- The ⋯ menu (P3, P7) -----

// Which ⋯ items a row shows (booleans). Only a RESULT counts as graded (a note alone never
// blocks anything): a Pass / Not passed locks Edit details, Change day or time, Change how
// they'll pay and Cancel; a No show doesn't (a new day clears it).
//   active:    grade always · editDetails while no Pass / Not passed, and for admins always
//              (v0.405: an admin can still fix a graded one; a belt change clears its result) ·
//              changeDay / cancel while no Pass / Not passed ·
//              changePayingBy the same AND canChangePayingBy · admins: editPayment / undoPayment
//              when paid, delete
//   cancelled: admins only — restore while its day is today or later, delete
//   hidden:    "Hide private details" is on (v0.506) → no payment items: changePayingBy,
//              editPayment and undoPayment are false (as Star's ⋯ menus, v0.508 G4)
export function privateMenu(row, { today, isAdmin, hidden = false } = {}) {
  const admin = isAdmin === true;
  const none = {
    editDetails: false, changePayingBy: false, changeDay: false, grade: false, editPayment: false,
    undoPayment: false, cancel: false, restore: false, delete: false,
  };
  if (row?.status === 'cancelled') {
    return { ...none, restore: admin && row.privateDate >= today, delete: admin };
  }
  if (row?.status !== 'active') return none;
  const result = row.result ?? null;
  const open = result === null || result === 'no_show';
  const money = hidden !== true; // payment items only while money is shown
  return {
    ...none,
    editDetails: open || admin,
    changePayingBy: money && open && canChangePayingBy(row),
    changeDay: open,
    grade: true,
    editPayment: money && admin && row.paid === true,
    undoPayment: money && admin && row.paid === true,
    cancel: open,
    delete: admin,
  };
}

// ----- Move to private testing (event page, P5) -----

// May this event roster row be moved to a private testing? Active, and no Pass / Not passed on
// the testing day (a No show is cleared by the move; a note alone stays with the registration).
export function canMoveToPrivate(regRow) {
  const result = regRow?.result ?? null;
  return regRow?.status === 'active' && (result === null || result === 'no_show');
}

// The money line of the Move dialog: what the event payments mean at the private price.
//   { kind: 'notPaid', dueCents }  nothing paid → Mark paid will record the private price
//   { kind: 'owes', dueCents }     paid less than the private price → the difference (E2)
//   { kind: 'enough', dueCents:0 } paid the price or more — nothing is refunded (E5, E13)
export function moveMoney({ paidCents, privateCents }) {
  const dueCents = amountDue({ privateCents, paidCents });
  const paid = Number.isInteger(paidCents) && paidCents > 0;
  if (!paid) return { kind: 'notPaid', dueCents };
  return dueCents > 0 ? { kind: 'owes', dueCents } : { kind: 'enough', dueCents: 0 };
}
