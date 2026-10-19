// eventRules.js — the rules of a Color Belt testing EVENT, written once for everyone.
// Why it exists: the staff screens, the preview database (mockTestingEvents.js) and the public
// family page (src/register/) must all agree on things like "is registration open today?",
// "what is this student testing for?" and "how much do they pay today?". The real database
// (migration 0005) has the same rules in SQL; checks.mjs tests this file against the same table
// of cases the SQL tests use (contract 0005 §1.3–§1.6, §5).
//
// It is PURE: no React, no database, no browser — so Node can import it, and the public page
// can use it without pulling in any dashboard code.
//
// Words used:
//   today        a date as text 'YYYY-MM-DD' in school time (America/New_York — the only time
//                zone used anywhere). Dates are compared as text: '2026-11-13' < '2026-11-20'
//                works because the format always has the same width.
//   state        where an event's registration stands (eventState): 'finished' | 'open' |
//                'closed_by_date' | 'not_open_yet' | 'closed'
//   tag          the code the staff list shows for an event (stateTag); words live in text.js
//   event copy   the classes and ranks copied into an event when it was created (§1.4)
//
// Objects can be in the app's camelCase (testingDate) or the database's snake_case
// (testing_date): the preview database works with stored rows, the screens with app objects.
// pick() below reads whichever is there.

// ----- Constants shared with the screens, the mock and the public page -----

export const SCHOOL_TIME_ZONE = 'America/New_York';
// The fixed production address used for every registration link and QR code (plan §8).
export const PUBLIC_ORIGIN = 'https://tkd-dashboard.pages.dev';
// The payment methods. Families can only choose cash or check on the form (§1.5).
export const PAYING_BY = ['cash', 'check', 'card'];
export const FORM_PAYING_BY = ['cash', 'check'];
// Which confirmation wording the family ticked (§1.5). Change it when the wording changes.
export const ACK_VERSION = 'cb-2026-10-17';
// The drawn signature: a PNG picture as a data URL, at most 70 000 characters in total (§1.5).
export const SIGNATURE_PREFIX = 'data:image/png;base64,';
export const SIGNATURE_MAX_LENGTH = 70000;
// A staff member may undo their own just-recorded payment for this long (§1.8).
export const UNDO_WINDOW_MS = 10 * 1000;
// Signatures are removed this many days after the testing date (plan answer 3).
export const SIGNATURE_KEEP_DAYS = 90;
// Note for families: at most this many characters (§1.3).
export const NOTE_MAX = 600;
// A new event's automatic closing date defaults to this many days before the testing date.
export const DEFAULT_CLOSE_DAYS_BEFORE = 7;
// The largest single payment, in cents ($1,000) (§1.6).
export const MAX_PAYMENT_CENTS = 100000;
// Preview mode only: the localStorage key where __tkdPreview.setToday('YYYY-MM-DD') keeps its
// pretend date. Kept here so the preview database and eventsApi.js read the same key.
export const PREVIEW_TODAY_KEY = 'tkd.preview.today';

// The five event states, in the order eventState checks them.
export const EVENT_STATES = ['finished', 'open', 'closed_by_date', 'not_open_yet', 'closed'];

// Reads a field in either spelling: pick(e, 'testingDate', 'testing_date').
function pick(object, camel, snake) {
  if (!object) return undefined;
  return object[camel] !== undefined ? object[camel] : object[snake];
}

// ----- Dates -----

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Is this a real calendar date written 'YYYY-MM-DD'? ('2026-02-30' is not.)
export function isIsoDate(text) {
  const m = typeof text === 'string' ? DATE_PATTERN.exec(text) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

// '2026-11-20' plus -7 days → '2026-11-13'. Counted on the calendar, so daylight-saving changes
// don't matter.
export function addDays(dateIso, days) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

// The date it is right now at the school (America/New_York), as 'YYYY-MM-DD'.
// now: a Date or a number of milliseconds (default: this moment).
// Example: 2026-11-14 04:59:59 UTC is still Nov 13 at 11:59:59 PM in Massachusetts.
const SCHOOL_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
export function todayInSchoolTime(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  // formatToParts gives the year, month and day separately, whatever the computer's language.
  const parts = Object.fromEntries(SCHOOL_DATE_FORMAT.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// The default automatic closing date for a new event: 7 days before the testing date
// (the screen fills it in; the database also accepts no closing date at all).
export function defaultAutoCloseOn(testingDateIso) {
  return isIsoDate(testingDateIso) ? addDays(testingDateIso, -DEFAULT_CLOSE_DAYS_BEFORE) : null;
}

// The numbers the Events list and the Delete event dialog need, from the roster rows of one event
// (each row: status and paid_cents, which is that student's payments minus reversals).
// eventsApi puts them on every event it loads.
//   activeCount        students on the list (the "Students" column)
//   withdrawnCount     removed (withdrawn) students — "15 students (plus 3 removed)"
//   registrationCount  all of them, removed ones too (what Delete event sends as the expected count)
//   paymentTotalCents  all payments of the event, minus reversals (what Delete event sends)
//   removedPaymentCents  the part of that total from removed students
//                        ("includes $X from removed students")
export function eventCounts(rows) {
  const cents = (r) => (Number.isInteger(r.paid_cents) ? r.paid_cents : 0);
  const withdrawn = rows.filter((r) => r.status === 'withdrawn');
  return {
    activeCount: rows.filter((r) => r.status === 'active').length,
    withdrawnCount: withdrawn.length,
    registrationCount: rows.length,
    paymentTotalCents: rows.reduce((total, r) => total + cents(r), 0),
    removedPaymentCents: withdrawn.reduce((total, r) => total + cents(r), 0),
  };
}

// ----- The state machine (§1.3) -----

// Where an event's registration stands on `today`. Checked in this exact order:
//   1. 'finished'       today is after the testing date
//   2. 'open'           switched on, and the closing date (if any) hasn't passed — this
//                       includes the testing day itself (families can register that day)
//   3. 'closed_by_date' switched on, but today is after the closing date
//   4. 'not_open_yet'   never been opened (also when its closing date passed without opening)
//   5. 'closed'         closed by hand
export function eventState(event, today) {
  const testingDate = pick(event, 'testingDate', 'testing_date');
  const open = pick(event, 'registrationOpen', 'registration_open') === true;
  const autoCloseOn = pick(event, 'autoCloseOn', 'auto_close_on') ?? null;
  const firstOpenedAt = pick(event, 'firstOpenedAt', 'first_opened_at') ?? null;
  if (today > testingDate) return 'finished';
  if (open && (autoCloseOn === null || today <= autoCloseOn)) return 'open';
  if (open) return 'closed_by_date';
  if (firstOpenedAt === null) return 'not_open_yet';
  return 'closed';
}

// The code the staff Events list shows for an event (Star v0.88). Returns { code, date }:
//   { code: 'finished' }                      Finished
//   { code: 'testing_today' }                 Testing today (on the testing date, whatever the state)
//   { code: 'open_until', date: '2026-11-13' } Open until <date>
//   { code: 'open' }                          Registration open (no closing date)
//   { code: 'closed' }                        Registration closed (by hand or by the date)
//   { code: 'not_open_yet' }                  Not open yet
// `today` is needed for "Testing today" (the state alone can't tell).
export function stateTag(state, event, today) {
  if (state === 'finished') return { code: 'finished' };
  if (today !== undefined && today === pick(event, 'testingDate', 'testing_date')) return { code: 'testing_today' };
  if (state === 'open') {
    const autoCloseOn = pick(event, 'autoCloseOn', 'auto_close_on') ?? null;
    return autoCloseOn === null ? { code: 'open' } : { code: 'open_until', date: autoCloseOn };
  }
  if (state === 'closed_by_date' || state === 'closed') return { code: 'closed' };
  return { code: 'not_open_yet' };
}

// What the family page shows for a state (§1.3 "Public statuses"). Returns { state, closedOn }:
//   open → 'open' (the form) · not_open_yet → 'not_open' (F11) · closed_by_date → 'closed' with
//   closedOn = the closing date (F12) · closed → 'closed' with closedOn null (F13) ·
//   finished → 'finished' (F14). (An unknown code is 'not_found' — that never reaches here.)
export function publicStateFor(state, event) {
  switch (state) {
    case 'open': return { state: 'open', closedOn: null };
    case 'not_open_yet': return { state: 'not_open', closedOn: null };
    case 'closed_by_date': return { state: 'closed', closedOn: pick(event, 'autoCloseOn', 'auto_close_on') ?? null };
    case 'closed': return { state: 'closed', closedOn: null };
    default: return { state: 'finished', closedOn: null };
  }
}

// May this person flip the registration switch to `open` (true) or closed (false) today?
// (§1.3 "Registration switch" — the screens use it to grey out menu items, the preview database
// uses it to answer.) Returns:
//   { status: 'ok', clearsAutoClose }   allowed; clearsAutoClose = opening also removes the
//                                       closing date (an admin reopening after it passed)
//   { status: 'finished' }              the testing date has passed: nothing changes the switch
//   { status: 'not_allowed' }           staff can't reopen once the closing date has passed
export function registrationSwitch({ event, open, isAdmin, today }) {
  const state = eventState(event, today);
  if (state === 'finished') return { status: 'finished' };
  if (!open) return { status: 'ok', clearsAutoClose: false }; // closing: anyone, any time before finished
  const autoCloseOn = pick(event, 'autoCloseOn', 'auto_close_on') ?? null;
  if (autoCloseOn === null || today <= autoCloseOn) return { status: 'ok', clearsAutoClose: false };
  // The closing date has passed: only an admin may open, and that clears the closing date.
  return isAdmin ? { status: 'ok', clearsAutoClose: true } : { status: 'not_allowed' };
}

// ----- Testing for and fees (§1.4) -----

// The five belt values of anything (rank, final award copy), in belts.js's camelCase.
// prefix 'fa_' reads a class's final-award copy (fa_belt_pattern …).
function beltValues(row, prefix = '') {
  const camel = prefix ? 'faBelt' : 'belt';
  const snake = prefix ? 'fa_belt' : 'belt';
  return {
    beltPattern: pick(row, `${camel}Pattern`, `${snake}_pattern`) ?? null,
    beltColor: pick(row, `${camel}Color`, `${snake}_color`) ?? null,
    beltColor2: pick(row, `${camel}Color2`, `${snake}_color_2`) ?? null,
    beltEndStripes: pick(row, `${camel}EndStripes`, `${snake}_end_stripes`) ?? null,
    beltEndStripeColor: pick(row, `${camel}EndStripeColor`, `${snake}_end_stripe_color`) ?? null,
  };
}

// What a rank is testing for, inside the event copy:
//   the next rank of the same event class →            { name, beltPattern, … (the five belt values) }
//   the class's last rank, final award is a rank →     { name: <award name>, …its belt }
//   the class's last rank, final award is None →       null  ("No new rank")
// eventClasses: the event's classes, each with `ranks` (any order) and its final-award copy
//   (finalAwardKind / finalAwardName / faBelt…, or the snake_case columns).
// rank: one of those ranks (found by id).
export function testingFor(eventClasses, rank) {
  const rankId = rank?.id;
  for (const cls of eventClasses ?? []) {
    const ranks = [...(cls.ranks ?? [])].sort((a, b) => a.position - b.position);
    const index = ranks.findIndex((r) => r.id === rankId);
    if (index === -1) continue;
    const next = ranks[index + 1];
    if (next) return { name: next.name, ...beltValues(next) };
    // The last rank: the class's final award copy decides.
    const kind = pick(cls, 'finalAwardKind', 'final_award_kind');
    if (kind !== 'rank') return null;
    return { name: pick(cls, 'finalAwardName', 'final_award_name'), ...beltValues(cls, 'fa_') };
  }
  return null; // not in this event (shouldn't happen)
}

// The fee for a rank, paid on `dateIso`: the early price before the testing day, the
// testing-day price on it (and after it). Private price isn't used in phase 2.
export function feeFor(rank, dateIso, testingDateIso) {
  return dateIso < testingDateIso ? pick(rank, 'earlyCents', 'early_cents') : pick(rank, 'dayCents', 'day_cents');
}

// Paid = more than nothing recorded (net of reversals). No partial payments exist (§1.6).
export function isPaid(paidCents) {
  return typeof paidCents === 'number' && paidCents > 0;
}

// ----- Class times (§1.4, E4–E6) -----

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

// '17:00' or '17:00:00' → minutes after midnight (1020). Anything else → null.
export function timeToMinutes(text) {
  const m = typeof text === 'string' ? TIME_PATTERN.exec(text) : null;
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// '17:00:00' (how the database sends a time) → '17:00' (how the app keeps it). Bad → null.
export function shortTime(text) {
  const minutes = timeToMinutes(text);
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// 1020 → { clock: '5:00', half: 'PM' }
function clockParts(minutes) {
  const h24 = Math.floor(minutes / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { clock: `${h12}:${String(minutes % 60).padStart(2, '0')}`, half: h24 < 12 ? 'AM' : 'PM' };
}

// "5:00 – 6:00 PM" (both in the afternoon: AM/PM once) · "11:30 AM – 12:30 PM" (different halves).
// The dash is an en dash with spaces, as in the mockups. Bad times → ''.
export function classTimeLabel(start, end) {
  const a = timeToMinutes(start);
  const b = timeToMinutes(end);
  if (a === null || b === null) return '';
  const x = clockParts(a);
  const y = clockParts(b);
  return x.half === y.half ? `${x.clock} – ${y.clock} ${y.half}` : `${x.clock} ${x.half} – ${y.clock} ${y.half}`;
}

// Checks the "Classes testing" rows of Add / Edit event. rows: [{ startTime, endTime }] for the
// TICKED classes. Returns one code per row (same order), null = fine:
//   'missingStart' / 'missingEnd'   no time chosen
//   'badTime'                       not a time
//   'endNotAfterStart'              "The end time must be after the start time."
export function validateClassTimes(rows) {
  return (rows ?? []).map((row) => {
    const start = row?.startTime ?? row?.start_time ?? null;
    const end = row?.endTime ?? row?.end_time ?? null;
    if (start === null || start === '') return 'missingStart';
    if (end === null || end === '') return 'missingEnd';
    const a = timeToMinutes(start);
    const b = timeToMinutes(end);
    if (a === null || b === null) return 'badTime';
    if (b <= a) return 'endNotAfterStart';
    return null;
  });
}

// ----- Small checks shared with the preview database -----

// Is this a signature the database would accept? PNG data URL, base64 letters only, ≤ 70 000.
export function signatureIsValid(text) {
  if (typeof text !== 'string' || !text.startsWith(SIGNATURE_PREFIX)) return false;
  if (text.length > SIGNATURE_MAX_LENGTH) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(text.slice(SIGNATURE_PREFIX.length));
}

// The note for families as the database stores it (testing_normalize_note): Windows line breaks
// become plain ones, spaces / tabs / line breaks at the very start and end are removed, and an
// empty note becomes null (no note). Line breaks inside are kept.
export function normalizeNote(note) {
  if (note === null || note === undefined) return null;
  const tidy = String(note).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^[ \t\n]+|[ \t\n]+$/g, '');
  return tidy === '' ? null : tidy;
}

// Invisible characters a note may not contain (tab and line break are fine) — the same list as
// names.js plus vertical tab / form feed, like the database's testing_note_is_valid.
const NOTE_BAD_CHARACTER = /[\u0001-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;

// Is this note acceptable? No note (null, or only spaces) is fine; otherwise, after tidying,
// at most 600 characters (counted as real characters) and no invisible characters.
export function noteIsValid(note) {
  if (note !== null && note !== undefined && typeof note !== 'string') return false;
  const tidy = normalizeNote(note);
  return tidy === null || ([...tidy].length <= NOTE_MAX && !NOTE_BAD_CHARACTER.test(tidy));
}

// The registration link for an event's public code (always the production address).
export function registrationUrl(code) {
  return `${PUBLIC_ORIGIN}/register/${code}`;
}
