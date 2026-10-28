// ages.js — a class's age range: how it is checked and how it is written (rulebook v0.619).
// Why it exists: admins type a class's ages in the Schedule as two whole numbers, From and To
// (migration 0031, table schedule_class_ages). Every screen that shows them — the family form,
// the kiosk, staff's Fill in and Prospects' Book a free class — writes them the SAME way, so the
// words live here once. The ages are only shown: nothing is hidden or blocked by a child's age.
//
//   agesLabel(7, 12)    → 'Ages 7–12'
//   agesLabel(7, null)  → 'Ages 7+'      (no top age)
//   agesLabel(7, 7)     → 'Age 7'
//   agesLabel(null, …)  → ''             (no ages set: show nothing)
//   agesProblem('7', '12')  → null | 'from_missing' | 'not_number' | 'range' | 'order'
//   readAges('7', '')       → { from: 7, to: null }   (only when agesProblem(...) is null)

export const AGE_MIN = 0;
export const AGE_MAX = 99;

export function agesLabel(from, to) {
  if (!Number.isInteger(from)) return '';
  if (!Number.isInteger(to)) return `Ages ${from}+`;
  if (to === from) return `Age ${from}`;
  return `Ages ${from}–${to}`;
}

const WHOLE = /^\d{1,2}$/; // 0–99, digits only

// What is wrong with the two typed boxes (both empty = fine: the class shows no ages).
export function agesProblem(fromText, toText) {
  const f = String(fromText ?? '').trim();
  const t = String(toText ?? '').trim();
  if (f === '' && t === '') return null;
  if (f === '') return 'from_missing';
  if (!WHOLE.test(f) || (t !== '' && !WHOLE.test(t))) return 'not_number';
  const from = Number(f);
  const to = t === '' ? null : Number(t);
  if (from < AGE_MIN || from > AGE_MAX || (to !== null && to > AGE_MAX)) return 'range';
  if (to !== null && to < from) return 'order';
  return null;
}

// A class time's class with its ages, as the booking lists show it: "White · Ages 7–12"
// (just "White" when the class has no ages). time = { className, ageFrom, ageTo }.
// "Group A · Ages 7–12" never splits: its spaces don't break (\u00a0) and nothing breaks after
// the dash (\u2060), so on a narrow phone the class and its ages move to the next line together
// instead of ending up as "Group" / "A · Ages 7–" / "12".
const NBSP = '\u00a0';
const keepTogether = (text) => text.replace(/ /g, NBSP).replace(/–/g, '–\u2060');
export function classWithAges(time) {
  const label = agesLabel(time?.ageFrom ?? null, time?.ageTo ?? null);
  return label ? keepTogether(`${time.className} · ${label}`) : time?.className ?? '';
}

// The typed boxes as numbers for the database ({ from: null, to: null } = no ages).
export function readAges(fromText, toText) {
  const f = String(fromText ?? '').trim();
  const t = String(toText ?? '').trim();
  return { from: f === '' ? null : Number(f), to: t === '' ? null : Number(t) };
}

// A saved age range as the dialog's two boxes.
export function agesToText(ages) {
  return { from: Number.isInteger(ages?.from) ? String(ages.from) : '', to: Number.isInteger(ages?.to) ? String(ages.to) : '' };
}

// From the database's age_from / age_to (any other shape = no ages).
export function agesFromRow(row) {
  const from = Number.isInteger(row?.age_from) ? row.age_from : null;
  const to = from !== null && Number.isInteger(row?.age_to) ? row.age_to : null;
  return { from, to };
}
