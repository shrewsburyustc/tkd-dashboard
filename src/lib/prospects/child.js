// child.js — one prospect child's full name, age and form answers, worked out the same way
// everywhere (rulebook v0.634, v0.637, v0.639).
// Why it exists: the profile window, the printed visitor sheet and the checks all need the same
// small rules, so they live here once, as plain functions (no React, so the Node checks can run
// them too):
//   - the full name: "Ava Nguyen" (first + last name). Children who signed up before v0.637 have
//     no last name and show their first name only ("Leo").
//   - the age: whole years from the date of birth on the school's today (America/New_York — the
//     screen passes the database's `today`). Children who signed up before v0.634 have no date of
//     birth and keep the age typed on the form.
//   - which of the form's fields are "answers": every question except layout, the children, the
//     free-class booking, the waiver, the parent's three fields and the address (those have rows of
//     their own in the profile and on the sheet).
//   - the home address: the form's Address answer { street, city, state, zip } as one line.
//   - on the printed sheet: which answers take a whole row, and the question in front of its
//     answer when a long sheet prints its answers one line each (v0.641).
//   - how long the signature picture is kept: 90 days after the family's latest free class, or 90
//     days after signing when no class was booked (the same rule as the database's
//     forms_purge_old_signatures, migration 0009; v0.242).
//   - the free class's state: booked, class cancelled (booked, but the class itself was cancelled,
//     e.g. by a closure), booking cancelled, or none — the same for the profile, the List and the
//     printed sheet (rolling check pass 2, P-01: the sheet used to miss a cancelled class).
// Dates are 'YYYY-MM-DD' text (Massachusetts dates); timestamps are the database's ISO text.
import { addDays, localDay } from '../schedule/versions.js';

const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/;

// Whole years from `dob` to `day` (both 'YYYY-MM-DD'), or null when either isn't a date.
// The birthday counts on the day itself; a Feb 29 birthday counts from Mar 1 in other years.
export function ageOn(dob, day) {
  const a = DATE_TEXT.exec(dob ?? '');
  const b = DATE_TEXT.exec(day ?? '');
  if (!a || !b) return null;
  let years = Number(b[1]) - Number(a[1]);
  if (`${b[2]}-${b[3]}` < `${a[2]}-${a[3]}`) years -= 1; // the birthday hasn't come yet this year
  return years;
}

// The free class's state from the child's booking ({ status, classRunning, … } or null):
//   'booked'            booked, and its class still runs
//   'class_gone'        booked, but the class itself was cancelled (a closure): call the family
//   'booking_cancelled' the booking was cancelled
//   'none'              no booking
export function freeClassState(booking) {
  if (!booking) return 'none';
  if (booking.status === 'booked') return booking.classRunning ? 'booked' : 'class_gone';
  if (booking.status === 'cancelled') return 'booking_cancelled';
  return 'none';
}

// The age to show: from the date of birth on `today`, else the age typed on the form (older sign-ups).
export function childAge(p, today) {
  const fromDob = p?.childDob ? ageOn(p.childDob, today) : null;
  return fromDob ?? p?.childAge ?? null;
}

// "Ava Nguyen", or "Leo" for a child who signed up before last names were asked.
export function childFullName(p) {
  return [p?.childFirstName, p?.childLastName]
    .filter((part) => typeof part === 'string' && part.trim() !== '')
    .map((part) => part.trim())
    .join(' ');
}

// The fields that are not "answers" (each has its own place, or nothing to show).
const NOT_ANSWERS = ['heading', 'step', 'children', 'booking', 'waiver', 'parent_name', 'parent_phone', 'parent_email', 'address'];

// The form's own questions, in the form's order.
export const answerFieldsOf = (fields) => (Array.isArray(fields) ? fields : []).filter((f) => f && !NOT_ANSWERS.includes(f.type));
// The form's Address question (at most one per form, migration 0036), or null when it didn't ask.
export const addressFieldOf = (fields) => (Array.isArray(fields) ? fields : []).find((f) => f?.type === 'address') ?? null;
// The form's waiver (at most one per form), or null.
export const waiverFieldOf = (fields) => (Array.isArray(fields) ? fields : []).find((f) => f?.type === 'waiver') ?? null;

// Does a question take the whole row in the answers' two columns (profile and printed sheet)?
// A long answer type, or a question or answer too long to sit beside another one. On a sheet
// that prints its answers one line each (`compact`, v0.641) the question and its answer share the
// line, so their length together counts too (52 characters fill half the paper's width).
const WIDE_TYPES = ['long_text', 'checkboxes'];
export const isWideAnswer = (field, words, compact = false) => {
  const label = String(field?.label ?? '');
  const answer = String(words ?? '');
  return WIDE_TYPES.includes(field?.type) || label.length > 48 || answer.length > 48 || (compact && label.length + answer.length > 52);
};

// The question in front of its answer on one line (v0.641, like the old card): "School Attending:";
// a question that already ends in "?" or ":" keeps its own mark ("How did you hear about us?").
export function questionLead(label) {
  const text = String(label ?? '').trim();
  return text === '' || /[?:]$/.test(text) ? text : `${text}:`;
}

// The Address answer as one line: { street, city, state, zip } → "12 Elm Street, Worcester, MA 01602".
// A plain text (what an old page still open on a kiosk sends) is shown as it is; nothing → ''.
export function addressLine(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const part = (x) => (typeof x === 'string' ? x.trim() : '');
  const stateZip = [part(value.state), part(value.zip)].filter(Boolean).join(' ');
  return [part(value.street), part(value.city), stateZip].filter(Boolean).join(', ');
}

// The last day the signature picture is kept: { until: 'YYYY-MM-DD', afterClass } or null.
// bookingDates: the free-class dates of EVERY child in the sign-up (booked or cancelled — the
// database counts each booking's date); signedAt: when the waiver was signed.
export function signatureKeptUntil(bookingDates, signedAt) {
  const dates = (bookingDates ?? []).filter((d) => typeof d === 'string' && DATE_TEXT.test(d)).sort();
  if (dates.length > 0) return { until: addDays(dates[dates.length - 1], 90), afterClass: true };
  if (!signedAt) return null;
  return { until: addDays(localDay(signedAt), 90), afterClass: false };
}
