// rules.js — the rules of Black Belt testing, written once for the staff screens, the family form,
// the preview database (mockBlackBelt.js) and checks.mjs.
// Why it exists: the real database (migration 0016) decides everything, but the screens must
// know the same rules to gray out Save BEFORE the database would answer "invalid", to show the
// right tag on a cycle, and to show families what they will pay. Every rule here has a twin in
// the SQL (the section number is given) and checks.mjs tests this file against the same cases the
// SQL tests use (contract 0016-B1 §5). If a rule changes, change it in the SQL AND here.
//
// It is PURE: no React, no database, no browser — so Node can import it, and the public family
// form can use it without pulling in any dashboard code.
//
// It returns CODES, never words: the screens' text.js files turn codes into sentences.
// Phase B2 (candidates and payments: what is owed, paid, late; the roster's cards and filters)
// is the last part of this file.
//
// Words used:
//   today      a school date 'YYYY-MM-DD' (Massachusetts). Dates are compared as text:
//              '2027-03-27' < '2027-04-03' works because the format always has the same width.
//              Never new Date('YYYY-MM-DD') for a school date (it would be read as UTC).
//   time       'HH:MM' (24-hour). The database sends '12:30:00'; the data layer cuts it to 5.
//   cents      money as whole cents (87000 = $870).
//   part       'physical' | 'technical' | 'curriculum' — what is graded on a testing day.
//   CycleForm  what Add / Edit cycle edit (contract 0016-B1 §1.3):
//              { name, applicationDue, submissionsDue, autoClose, registrationOpen,
//                days: [{ id|null, name, date, start, end, place, second|null, parts, version }],
//                plans: [{ key, id|null, name, payments: [{ id?, paymentNo, dueOn,
//                          followsApplicationDue }], amounts: { 1: [cents…], 2, 3, 4 } }],
//                kukkiwon: { 1: cents, 2, 3, 4 }, pricesFrom }
//              place = { code: 'worcester' } | { other: 'Horgan Arena, …' }
//              second = { start, end, place } (the optional second part of a day) or null
// Objects may be in the app's camelCase (applicationDue) or the database's snake_case
// (application_due): the preview database works with stored rows. pick() reads either.
import { nameProblem, nameKey } from '../testing/names.js';
import { isIsoDate, normalizeNote, noteIsValid } from '../testing/eventRules.js';
import { priceIsValid } from './money.js';

// ----- Constants (the same numbers as migration 0016) -----

export const PARTS = ['physical', 'technical', 'curriculum']; // always in this order
export const DANS = [1, 2, 3, 4];
export const SCHOOL_CODES = ['worcester', 'shrewsbury'];
export const MAX_DAYS = 20; // 1–20 testing days per cycle
export const MAX_PLANS = 10; // 1–10 payment plans per cycle
export const MAX_PAYMENTS = 12; // 1–12 payments per plan
export const PLACE_OTHER_MAX = 100; // "Other place" text, characters
export const WAIVER_BODY_MAX = 20000; // waiver text, characters after trimming
export const KEEP_YEARS_MIN = 3; // keep-years settings: both empty, or both 3–20
export const KEEP_YEARS_MAX = 20;
export const EMAIL_MAX = 254;
export const WAIVER_GRACE_MS = 24 * 60 * 60 * 1000; // a replaced waiver can still be signed for 24 h
export const FIRST_TIME = '06:00'; // the time dropdown (v0.51): 6:00 AM …
export const LAST_TIME = '22:00'; // … to 10:00 PM, on 15-minute steps
export const TIME_STEP_MINUTES = 15;
// The family links' codes: 8 characters from a–z and 2–9 without the look-alikes i, l, o.
export const CODE_PATTERN = /^[a-hjkmnp-z2-9]{8}$/;

// Reads a field in either spelling: pick(c, 'applicationDue', 'application_due').
function pick(object, camel, snake) {
  if (!object) return undefined;
  return object[camel] !== undefined ? object[camel] : object[snake];
}

// Only plain spaces are trimmed, like the database's btrim(text).
export function trimSpaces(text) {
  return typeof text === 'string' ? text.replace(/^ +| +$/g, '') : text;
}

const charCount = (text) => [...text].length; // real characters (an emoji counts as 1)
const later = (a, b) => (a > b ? a : b); // the later of two 'YYYY-MM-DD' dates

// ----- Times (SQL 1c bb_time_is_valid) -----

const TIME_TEXT = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

// '12:30' / '12:30:00' → minutes after midnight (750). Not a time → null.
export function minutesOf(text) {
  const m = typeof text === 'string' ? TIME_TEXT.exec(text) : null;
  if (!m) return null;
  const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || min > 59 || s > 59) return null;
  return h * 60 + min + s / 60;
}

// A testing day's start or end time: 6:00 AM to 10:00 PM on a 15-minute step, no seconds.
// '07:45' ok · '22:15' no (too late) · '10:10' no (not on a step) · '05:45' no (too early).
export function timeIsValid(text) {
  const minutes = minutesOf(text);
  return minutes !== null && Number.isInteger(minutes) && minutes >= 360 && minutes <= 1320 && minutes % TIME_STEP_MINUTES === 0;
}

const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Every time the dropdown lists: '06:00', '06:15', … '22:00' (65 choices).
export const TIME_OPTIONS = Array.from({ length: (1320 - 360) / TIME_STEP_MINUTES + 1 }, (_, i) => hhmm(360 + i * TIME_STEP_MINUTES));

function clockParts(minutes) {
  const h24 = Math.floor(minutes / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { clock: `${h12}:${String(minutes % 60).padStart(2, '0')}`, half: h24 < 12 ? 'AM' : 'PM' };
}

// '14:30' → '2:30 PM'. Not a time → ''.
export function timeLabel(text) {
  const minutes = minutesOf(text);
  if (minutes === null) return '';
  const p = clockParts(Math.floor(minutes));
  return `${p.clock} ${p.half}`;
}

// '12:30', '14:30' → '12:30–2:30 PM' (AM/PM once when both match, as the mockups draw it);
// '11:30', '12:30' → '11:30 AM–12:30 PM'. Bad times → ''.
export function timeRangeLabel(start, end) {
  const a = minutesOf(start);
  const b = minutesOf(end);
  if (a === null || b === null) return '';
  const x = clockParts(Math.floor(a));
  const y = clockParts(Math.floor(b));
  return x.half === y.half ? `${x.clock}–${y.clock} ${y.half}` : `${x.clock} ${x.half}–${y.clock} ${y.half}`;
}

// ----- Dates -----

const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/;

// '2009-02-28' plus 21 years → '2030-02-28'. A 29 February that doesn't exist in the new year
// becomes 28 February, like PostgreSQL's date + interval 'n years'.
export function addYears(dateIso, years) {
  const m = isIsoDate(dateIso) ? DATE_TEXT.exec(dateIso) : null;
  if (!m || !Number.isInteger(years)) return null;
  const y = Number(m[1]) + years;
  let d = Number(m[3]);
  const mo = Number(m[2]);
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // day 0 of next month = last day
  if (d > lastDay) d = lastDay;
  return `${String(y).padStart(4, '0')}-${m[2]}-${String(d).padStart(2, '0')}`;
}

// Whole years old on a date (SQL 10a bb_age_on). '2012-03-04' on '2027-04-03' → 15. Bad → null.
export function ageOn(dob, date) {
  const a = isIsoDate(dob) ? DATE_TEXT.exec(dob) : null;
  const b = isIsoDate(date) ? DATE_TEXT.exec(date) : null;
  if (!a || !b) return null;
  let years = Number(b[1]) - Number(a[1]);
  if (`${b[2]}-${b[3]}` < `${a[2]}-${a[3]}`) years -= 1; // birthday not reached yet this year
  return years;
}

// The first testing day of a list of days (Day objects or rows), or null.
export function firstDayOf(days) {
  const dates = (days ?? []).map((d) => pick(d, 'date', 'day_date')).filter(isIsoDate).sort();
  return dates[0] ?? null;
}

// Under 18 on the cycle's first testing day (v0.213: then a parent or guardian signs).
// No date of birth or no day → false (SQL: coalesce(… < 18, false)).
export function isUnder18OnFirstDay(dob, days) {
  const age = ageOn(dob, firstDayOf(days));
  return age !== null && age < 18;
}

// ----- Cycle state and tag (SQL 10b bb_cycle_state) -----

// Where a cycle stands on `today`. cycle: a CycleDetail / CycleSummary / bb_cycles row; days:
// its testing days. Returns the CycleState of contract 0016-B1 §1.3:
//   { state, registration, past, testingToday, firstDay, lastDay, nextDay, publicStatus, closedOn }
//   registration (from the switch alone):
//     'open'           switched on, and (auto close off, or today is on or before Application due)
//     'closed_by_date' switched on, auto close on, today after Application due
//     'not_open_yet'   never opened
//     'closed'         closed by hand
//   state: 'past' (after the last day) → 'testing_today' (a day is today) → the registration value
//   publicStatus (what the family form says, from the registration value alone — the day tags
//     never open the form): 'finished' | 'open' | 'closed' | 'not_open'; closedOn = Application due
//     when it closed by the date.
export function cycleState(cycle, days, today) {
  const dates = (days ?? []).map((d) => pick(d, 'date', 'day_date')).filter(isIsoDate).sort();
  const firstDay = dates[0] ?? null;
  const lastDay = dates.length > 0 ? dates[dates.length - 1] : null;
  const nextDay = dates.find((d) => d >= today) ?? null;
  const past = lastDay !== null && today > lastDay;
  const testingToday = dates.includes(today);
  const open = pick(cycle, 'registrationOpen', 'registration_open') === true;
  const autoClose = pick(cycle, 'autoClose', 'auto_close') !== false;
  const applicationDue = pick(cycle, 'applicationDue', 'application_due') ?? null;
  const firstOpenedAt = pick(cycle, 'firstOpenedAt', 'first_opened_at') ?? null;
  let registration;
  if (open && (!autoClose || today <= applicationDue)) registration = 'open';
  else if (open) registration = 'closed_by_date';
  else if (firstOpenedAt === null) registration = 'not_open_yet';
  else registration = 'closed';
  const state = past ? 'past' : testingToday ? 'testing_today' : registration;
  let publicStatus;
  if (past) publicStatus = 'finished';
  else if (registration === 'open') publicStatus = 'open';
  else if (registration === 'not_open_yet') publicStatus = 'not_open';
  else publicStatus = 'closed';
  const closedOn = !past && registration === 'closed_by_date' ? applicationDue : null;
  return { state, registration, past, testingToday, firstDay, lastDay, nextDay, publicStatus, closedOn };
}

// The ONE tag a cycle shows on the Cycles list (v0.900) → { kind, date }:
//   'testing_today'        "Testing today"
//   'open_until' + date    "Open until [Application due]"   (auto close off: 'open', "Open")
//   'not_open_yet'         "Not open yet"
//   'next_day' + date      "Next day [date]"  — closed, after the first testing day
//   'registration_closed'  "Registration closed" — closed, before the first testing day
//   'past'                 "Past"
// summary: a CycleSummary / CycleDetail (with .state = CycleState, .applicationDue, .autoClose).
export function cycleTag(summary, today) {
  const st = summary?.state ?? {};
  switch (st.state) {
    case 'testing_today':
      return { kind: 'testing_today', date: null };
    case 'open':
      return pick(summary, 'autoClose', 'auto_close') === false
        ? { kind: 'open', date: null }
        : { kind: 'open_until', date: pick(summary, 'applicationDue', 'application_due') ?? null };
    case 'not_open_yet':
      return { kind: 'not_open_yet', date: null };
    case 'closed':
    case 'closed_by_date':
      return st.firstDay && today > st.firstDay
        ? { kind: 'next_day', date: st.nextDay ?? null }
        : { kind: 'registration_closed', date: null };
    case 'past':
      return { kind: 'past', date: null };
    default:
      return { kind: 'registration_closed', date: null };
  }
}

// ----- One testing day (SQL 15c / 15d day rules) -----

// What's wrong with a place → null (fine) or a code:
//   'missing'      nothing chosen, an unknown school, or empty "Other place" text
//   'badCharacter' an invisible character in the text
//   'tooLong'      "Other place" over 100 characters
export function placeProblem(place) {
  if (!place || typeof place !== 'object') return 'missing';
  if (typeof place.code === 'string' && place.code !== '') return SCHOOL_CODES.includes(place.code) ? null : 'missing';
  if (typeof place.other !== 'string') return 'missing';
  const tidy = normalizeNote(place.other);
  if (tidy === null) return 'missing';
  if (!noteIsValid(place.other)) return charCount(tidy) > 600 ? 'tooLong' : 'badCharacter';
  if (charCount(tidy) > PLACE_OTHER_MAX) return 'tooLong';
  return null;
}

function timePairProblems(start, end, out, startKey, endKey) {
  if (start === null || start === undefined || start === '') out[startKey] = 'missing';
  else if (!timeIsValid(start)) out[startKey] = 'badTime';
  if (end === null || end === undefined || end === '') out[endKey] = 'missing';
  else if (!timeIsValid(end)) out[endKey] = 'badTime';
  else if (!out[startKey] && minutesOf(end) <= minutesOf(start)) out[endKey] = 'notAfterStart';
}

// What's wrong with one testing day (Add / edit testing day, Cycles 5). Returns an object with
// one key per field that has a problem ({} = the day is fine):
//   name           'empty' | 'tooLong' | 'badCharacter'                    (names.js)
//   date           'missing' | 'past' (before today — unless it is the day's saved date, so a
//                  cycle under way can still be edited; options.originalDate)
//   start, end     'missing' | 'badTime' (not on the 6 AM–10 PM, 15-minute list) |
//                  end: 'notAfterStart'
//   place          placeProblem codes
//   secondStart    + 'beforeFirstEnd' (the second part must start at or after the first's end)
//   secondEnd, secondPlace   as above, for the second part when it is ticked
//   parts          'none' (tick at least one part) | 'invalid' (unknown or repeated)
// options: { today, originalDate }
export function dayProblems(day, { today, originalDate = null } = {}) {
  const p = {};
  const nameCode = nameProblem(day?.name);
  if (nameCode) p.name = nameCode;
  const date = day?.date;
  if (!isIsoDate(date)) p.date = 'missing';
  else if (today && date < today && date !== originalDate) p.date = 'past';
  timePairProblems(day?.start, day?.end, p, 'start', 'end');
  const placeCode = placeProblem(day?.place);
  if (placeCode) p.place = placeCode;
  const second = day?.second;
  if (second) {
    timePairProblems(second.start, second.end, p, 'secondStart', 'secondEnd');
    if (!p.secondStart && !p.end && !p.start && minutesOf(second.start) < minutesOf(day.end)) p.secondStart = 'beforeFirstEnd';
    const secondPlace = placeProblem(second.place);
    if (secondPlace) p.secondPlace = secondPlace;
  }
  const parts = Array.isArray(day?.parts) ? day.parts : [];
  if (parts.length === 0) p.parts = 'none';
  else if (parts.some((x) => !PARTS.includes(x)) || new Set(parts).size !== parts.length) p.parts = 'invalid';
  return p;
}

// The parts graded on NO day, in the order physical, technical, curriculum (SQL: the
// part_without_day answer). [] = every part has a day.
export function partsWithoutDay(days) {
  return PARTS.filter((part) => !(days ?? []).some((d) => Array.isArray(d?.parts) && d.parts.includes(part)));
}

// Another day of the form that grades the same part (Cycles 5 detail 2 hint: "Curriculum is
// also graded on …"). → [{ part, day }] for each ticked part of `day` also ticked on another day.
export function partsAlsoOnOtherDays(day, days) {
  const out = [];
  for (const part of PARTS) {
    if (!day?.parts?.includes(part)) continue;
    for (const other of days ?? []) {
      if (other === day || (day.id && other.id === day.id)) continue;
      if (other?.parts?.includes(part)) out.push({ part, day: other });
    }
  }
  return out;
}

// ----- The whole cycle form (Add cycle / Edit cycle, Cycles 4) -----

// Is there another cycle with this name (ignoring capitals and extra spaces)? → its stored name
// or null. cycles: the Cycles list; exceptId: the cycle being edited.
export function findDuplicateCycle(cycles, name, exceptId = null) {
  const key = nameKey(name);
  if (key === '') return null;
  const match = (cycles ?? []).find((c) => c.id !== exceptId && nameKey(c.name) === key);
  return match ? match.name : null;
}

const amountOf = (amounts, dan) => (amounts ? amounts[dan] ?? amounts[String(dan)] : undefined);

// The due date a payment really has: payment 1 with "follows Application due" ticked is ALWAYS
// Application due (the database keeps them equal, v0.900).
export function effectiveDueOn(payment, applicationDue) {
  return payment?.followsApplicationDue && payment.paymentNo === 1 ? applicationDue ?? null : payment?.dueOn ?? null;
}

// Every input rule of bb_add_cycle / bb_update_cycle (SQL 15c, 15d), so Save is gray before the
// database would say 'invalid' or 'part_without_day'. options: { today, mode: 'add'|'edit',
// original } — original = the CycleDetail the Edit dialog opened (its saved day dates and due
// dates may stay in the past). Returns an object with a key only where something is wrong
// ({} = Save can be blue; hasProblems tells):
//   name                 'empty' | 'tooLong' | 'badCharacter'
//   applicationDue       'missing' | 'afterLastDay'
//   submissionsDue       'missing' | 'afterLastDay'
//   daysList             'none' | 'tooMany'
//   days                 [dayProblems per day] (same order as form.days)
//   partsWithoutDay      ['curriculum', …]
//   plansList            'none' | 'tooMany'                         (Add only)
//   plans                [{ name: … | 'duplicate', paymentsCount: 'none'|'tooMany',
//                           payments: [{ dueOn: 'missing'|'past'|'followsNotFirst' }],
//                           amounts: { 1: ['missing'|'invalid'|null …], … } }]
//                        (Add: everything; Edit: only payments' due dates — prices never change)
//   kukkiwon             { 1: 'missing'|'invalid', … }               (Add only)
export function cycleFormProblems(form, { today, mode = 'add', original = null } = {}) {
  const problems = {};
  const nameCode = nameProblem(form?.name);
  if (nameCode) problems.name = nameCode;

  const days = Array.isArray(form?.days) ? form.days : [];
  if (days.length === 0) problems.daysList = 'none';
  else if (days.length > MAX_DAYS) problems.daysList = 'tooMany';
  const originalDays = new Map((original?.days ?? []).map((d) => [d.id, d.date]));
  const dayList = days.map((day) => dayProblems(day, {
    today, originalDate: mode === 'edit' && day?.id ? originalDays.get(day.id) ?? null : null,
  }));
  if (dayList.some(hasProblems)) problems.days = dayList;
  const dates = days.map((d) => d?.date).filter(isIsoDate).sort();
  const lastDay = dates.length > 0 ? dates[dates.length - 1] : null;

  for (const key of ['applicationDue', 'submissionsDue']) {
    const value = form?.[key];
    if (!isIsoDate(value)) problems[key] = 'missing';
    else if (lastDay !== null && value > lastDay) problems[key] = 'afterLastDay';
  }

  if (days.length > 0) {
    const missing = partsWithoutDay(days);
    if (missing.length > 0) problems.partsWithoutDay = missing;
  }

  const plans = Array.isArray(form?.plans) ? form.plans : [];
  const originalDue = new Map();
  for (const plan of original?.plans ?? []) {
    for (const pay of plan.payments ?? []) originalDue.set(`${plan.id}|${pay.paymentNo}`, pay.dueOn);
  }

  if (mode === 'add') {
    if (plans.length === 0) problems.plansList = 'none';
    else if (plans.length > MAX_PLANS) problems.plansList = 'tooMany';
  }
  const seenNames = new Set();
  const planList = plans.map((plan) => {
    const pp = {};
    const payments = Array.isArray(plan?.payments) ? plan.payments : [];
    if (mode === 'add') {
      const planName = nameProblem(plan?.name);
      if (planName) pp.name = planName;
      else if (seenNames.has(nameKey(plan.name))) pp.name = 'duplicate';
      if (!planName) seenNames.add(nameKey(plan.name));
      if (payments.length === 0) pp.paymentsCount = 'none';
      else if (payments.length > MAX_PAYMENTS) pp.paymentsCount = 'tooMany';
    }
    const payList = payments.map((pay, i) => {
      const x = {};
      if (pay?.followsApplicationDue && (pay.paymentNo ?? i + 1) !== 1) {
        x.dueOn = 'followsNotFirst';
        return x;
      }
      const due = effectiveDueOn({ ...pay, paymentNo: pay?.paymentNo ?? i + 1 }, form?.applicationDue);
      if (!isIsoDate(due)) x.dueOn = 'missing';
      else if (today && due < today) {
        const saved = mode === 'edit' ? originalDue.get(`${plan?.id}|${pay?.paymentNo ?? i + 1}`) : undefined;
        if (due !== saved) x.dueOn = 'past';
      }
      return x;
    });
    if (payList.some(hasProblems)) pp.payments = payList;
    if (mode === 'add') {
      const amountProblems = {};
      let any = false;
      for (const dan of DANS) {
        const list = amountOf(plan?.amounts, dan);
        const row = payments.map((_, i) => {
          const cents = Array.isArray(list) ? list[i] : undefined;
          if (cents === null || cents === undefined || cents === '') return 'missing';
          return priceIsValid(cents) ? null : 'invalid';
        });
        if (row.some((x) => x !== null)) any = true;
        amountProblems[dan] = row;
      }
      if (any) pp.amounts = amountProblems;
    }
    return pp;
  });
  if (planList.some(hasProblems)) problems.plans = planList;

  if (mode === 'add') {
    const fees = {};
    let any = false;
    for (const dan of DANS) {
      const cents = amountOf(form?.kukkiwon, dan);
      if (cents === null || cents === undefined || cents === '') fees[dan] = 'missing';
      else if (!priceIsValid(cents)) fees[dan] = 'invalid';
      else continue;
      any = true;
    }
    if (any) problems.kukkiwon = fees;
  }
  return problems;
}

// Does a problems object (from dayProblems / cycleFormProblems) hold any problem?
export function hasProblems(problems) {
  if (problems === null || problems === undefined) return false;
  if (Array.isArray(problems)) return problems.some((x) => (typeof x === 'object' ? hasProblems(x) : x !== null && x !== undefined));
  if (typeof problems === 'object') return Object.values(problems).some((x) => (typeof x === 'object' ? hasProblems(x) : x !== null && x !== undefined));
  return true;
}

// Application due changed: every plan's payment 1 that "follows Application due" moves with it
// (v0.900). Returns a NEW form (the old one is not changed).
export function followApplicationDue(form, newDate) {
  return {
    ...form,
    applicationDue: newDate,
    plans: (form?.plans ?? []).map((plan) => ({
      ...plan,
      payments: (plan.payments ?? []).map((p) => (p.followsApplicationDue && p.paymentNo === 1 ? { ...p, dueOn: newDate } : p)),
    })),
  };
}

// Someone typed a payment's due date: the date is set and "follows Application due" is cleared
// (typing a payment-1 date stops it following, v0.900). plan = its key or id. Returns a NEW form.
export function setPaymentDueDate(form, plan, paymentNo, date) {
  return {
    ...form,
    plans: (form?.plans ?? []).map((p) => (p.key === plan || (p.id && p.id === plan)
      ? { ...p, payments: p.payments.map((x) => (x.paymentNo === paymentNo ? { ...x, dueOn: date, followsApplicationDue: false } : x)) }
      : p)),
  };
}

// ----- From the screens' form to the database's payload (0016 §6.2 shapes) -----

const placePayload = (place) => (place && typeof place.code === 'string' && place.code !== ''
  ? { code: place.code }
  : { other: place?.other ?? '' });

function dayPayload(day, withId) {
  return {
    ...(withId ? { id: day.id ?? null } : {}),
    name: day.name,
    day_date: day.date,
    start_time: day.start,
    end_time: day.end,
    place: placePayload(day.place),
    second: day.second ? { start: day.second.start, end: day.second.end, place: placePayload(day.second.place) } : null,
    parts: PARTS.filter((part) => (day.parts ?? []).includes(part)),
  };
}

const danObject = (source) => Object.fromEntries(DANS.map((dan) => [String(dan), amountOf(source, dan)]));

// The bb_add_cycle payload: { name, application_due, submissions_due, auto_close, days, plans,
// kukkiwon, prices_from }. Days have no id. Payment 1 that follows Application due is sent with
// that date. (Registration is set by a second call — contract 0016-B1 OP-4.)
export function buildAddPayload(form) {
  return {
    name: form.name,
    application_due: form.applicationDue,
    submissions_due: form.submissionsDue,
    auto_close: form.autoClose === true,
    days: (form.days ?? []).map((day) => dayPayload(day, false)),
    plans: (form.plans ?? []).map((plan) => ({
      name: plan.name,
      payments: (plan.payments ?? []).map((pay, i) => {
        const paymentNo = pay.paymentNo ?? i + 1;
        const follows = pay.followsApplicationDue === true && paymentNo === 1;
        return { due_on: follows ? form.applicationDue : pay.dueOn, follows_application_due: follows };
      }),
      amounts: Object.fromEntries(DANS.map((dan) => [String(dan), [...(amountOf(plan.amounts, dan) ?? [])]])),
    })),
    kukkiwon: danObject(form.kukkiwon),
    prices_from: form.pricesFrom ?? null,
  };
}

// The bb_update_cycle payload: { name, application_due, submissions_due, auto_close, days (with
// their id; null = a new day), due_dates: one per plan payment }. Prices are never sent (v0.902).
export function buildUpdatePayload(form) {
  return {
    name: form.name,
    application_due: form.applicationDue,
    submissions_due: form.submissionsDue,
    auto_close: form.autoClose === true,
    days: (form.days ?? []).map((day) => dayPayload(day, true)),
    due_dates: (form.plans ?? []).flatMap((plan) => (plan.payments ?? []).map((pay) => {
      const follows = pay.followsApplicationDue === true && pay.paymentNo === 1;
      return {
        cycle_plan_id: plan.id,
        payment_no: pay.paymentNo,
        due_on: follows ? form.applicationDue : pay.dueOn,
        follows_application_due: follows,
      };
    })),
  };
}

// A CycleDetail (loadCycle) → the CycleForm Edit cycle starts from. Plans and Kukkiwon are
// read-only there; only due dates may change.
export function cycleToForm(cycle) {
  return {
    name: cycle.name,
    applicationDue: cycle.applicationDue,
    submissionsDue: cycle.submissionsDue,
    autoClose: cycle.autoClose,
    registrationOpen: cycle.registrationOpen,
    days: (cycle.days ?? []).map((d) => ({ ...d, parts: [...d.parts], place: { ...d.place }, second: d.second ? { ...d.second, place: { ...d.second.place } } : null })),
    plans: (cycle.plans ?? []).map((p) => ({
      key: p.id, id: p.id, name: p.name,
      payments: p.payments.map((x) => ({ id: x.id, paymentNo: x.paymentNo, dueOn: x.dueOn, followsApplicationDue: x.followsApplicationDue })),
      amounts: Object.fromEntries(DANS.map((dan) => [dan, [...(amountOf(p.amounts, dan) ?? [])]])),
    })),
    kukkiwon: { ...cycle.kukkiwon },
    pricesFrom: cycle.pricesFrom ?? null,
  };
}

// ----- Prices and what a family pays -----

// A plan's total per Dan → { 1: cents, 2, 3, 4 } (null for a Dan with a missing amount).
export function planTotals(plan) {
  return Object.fromEntries(DANS.map((dan) => {
    const list = amountOf(plan?.amounts, dan);
    if (!Array.isArray(list) || list.length === 0 || !list.every(Number.isInteger)) return [dan, null];
    return [dan, list.reduce((a, b) => a + b, 0)];
  }));
}

// The lowest and highest Kukkiwon fee → [min, max] ("$100 to $170"), or null.
export function kukkiwonRange(fees) {
  const values = DANS.map((dan) => amountOf(fees, dan)).filter(Number.isInteger);
  if (values.length === 0) return null;
  return [Math.min(...values), Math.max(...values)];
}

const paymentsOf = (plan) => [...(plan?.payments ?? [])]
  .map((p, i) => ({ paymentNo: pick(p, 'paymentNo', 'payment_no') ?? i + 1, dueOn: pick(p, 'dueOn', 'due_on') ?? null }))
  .sort((a, b) => a.paymentNo - b.paymentNo);

// What a family will pay, worked out exactly like the database's bb_candidate_items (SQL 10c)
// for someone registering today:
//   payment N  the plan's amount for the Dan, due the later of its due date and today (S4: a
//              passed due date counts from the day they register — OP-12 shows it as "Today")
//   kukkiwon   if chosen, the Dan's fee, due with payment 1 (the later of p1's date and today)
// Order: by due date, then p1, kukkiwon, p2, p3 …
// plan: an app Plan or the family form's plan ({ payments:[{payment_no, due_on}], amounts:{"1":…} }).
// → { items: [{ item:'p1'|'kukkiwon'…, dueOn, amountCents }],
//     lines: [{ dueOn, items: ['p1','kukkiwon'], amountCents }]  (one line per due date),
//     testingCents, kukkiwonCents, totalCents }   — or null without a plan or a Dan.
export function scheduleFor({ plan, dan, kukkiwon = false, fees = null, today }) {
  if (!plan || !DANS.includes(Number(dan))) return null;
  const amounts = amountOf(plan.amounts, Number(dan)) ?? [];
  const pays = paymentsOf(plan);
  const items = pays.map((p, i) => ({
    item: `p${p.paymentNo}`, dueOn: today ? later(p.dueOn, today) : p.dueOn, amountCents: amounts[i] ?? null, tie: p.paymentNo * 10,
  }));
  if (kukkiwon) {
    const p1 = items.find((x) => x.item === 'p1');
    const due = p1 ? p1.dueOn : today;
    items.push({ item: 'kukkiwon', dueOn: today ? later(due, today) : due, amountCents: amountOf(fees, Number(dan)) ?? null, tie: 15 });
  }
  items.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : a.tie - b.tie));
  const lines = [];
  for (const it of items) {
    const last = lines[lines.length - 1];
    if (last && last.dueOn === it.dueOn) {
      last.items.push(it.item);
      last.amountCents += it.amountCents ?? 0;
    } else {
      lines.push({ dueOn: it.dueOn, items: [it.item], amountCents: it.amountCents ?? 0 });
    }
  }
  const testingCents = items.filter((x) => x.item !== 'kukkiwon').reduce((a, x) => a + (x.amountCents ?? 0), 0);
  const kukkiwonCents = items.filter((x) => x.item === 'kukkiwon').reduce((a, x) => a + (x.amountCents ?? 0), 0);
  return {
    items: items.map(({ item, dueOn, amountCents }) => ({ item, dueOn, amountCents })),
    lines,
    testingCents,
    kukkiwonCents,
    totalCents: testingCents + kukkiwonCents,
  };
}

// The facts a plan card on the family form shows (Form 1/2, OP-12b) — codes and numbers, no
// words: { paymentsCount, dueDates (each floored to today), amounts (for the Dan, or null before
// a Dan is chosen), equalAmounts (true → "3 × $290", false → "$400 + $470", null without a Dan),
// totalCents (null without a Dan) }.
export function planSummary(plan, { dan = null, today = null } = {}) {
  const pays = paymentsOf(plan);
  const dueDates = pays.map((p) => (today ? later(p.dueOn, today) : p.dueOn));
  if (!DANS.includes(Number(dan))) {
    return { paymentsCount: pays.length, dueDates, amounts: null, equalAmounts: null, totalCents: null };
  }
  const amounts = [...(amountOf(plan?.amounts, Number(dan)) ?? [])];
  return {
    paymentsCount: pays.length,
    dueDates,
    amounts,
    equalAmounts: amounts.every((a) => a === amounts[0]),
    totalCents: amounts.reduce((a, b) => a + b, 0),
  };
}

// ----- Small checks (the same rules as the database) -----

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_BAD_CHARACTER = /[\u0001-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/;

// The "email for results" (SQL 1b bb_email_is_valid, after the functions' btrim): at most 254
// characters, something@something.something, no spaces, one "@", no invisible characters.
export function emailIsValid(text) {
  if (typeof text !== 'string') return false;
  const email = trimSpaces(text);
  return charCount(email) <= EMAIL_MAX && EMAIL_PATTERN.test(email) && !EMAIL_BAD_CHARACTER.test(email);
}

// Is this a family-link code the database can make? (8 characters, a–z and 2–9, no i/l/o.)
export function codeIsValid(code) {
  return typeof code === 'string' && CODE_PATTERN.test(code);
}

// May the family form still sign this waiver version? (SQL 10g bb_waiver_version_ok, v0.905)
// Yes when it is NOT the placeholder and it is current, or was replaced less than 24 hours ago.
// version: a Waiver / bb_waiver_versions row; nowMs: the time in milliseconds.
export function waiverVersionOk(version, nowMs) {
  if (!version || pick(version, 'isPlaceholder', 'is_placeholder') === true) return false;
  const superseded = pick(version, 'supersededAt', 'superseded_at') ?? null;
  return superseded === null || Date.parse(superseded) > nowMs - WAIVER_GRACE_MS;
}

// The name the next saved waiver gets (SQL 15a): the year of today + "-" + (that year's count + 1).
// Versions 2026-1 and 2027-1 saved, today 2027-02-15 → '2027-2'.
export function nextWaiverVersionName(versions, today) {
  const year = String(today ?? '').slice(0, 4);
  const count = (versions ?? []).filter((v) => String(pick(v, 'versionName', 'version_name') ?? '').startsWith(`${year}-`)).length;
  return `${year}-${count + 1}`;
}

// What's wrong with a waiver text → null | 'empty' | 'tooLong' (1–20 000 characters, after
// trimming spaces at the ends).
export function waiverBodyProblem(body) {
  const text = trimSpaces(typeof body === 'string' ? body : '');
  if (text === '') return 'empty';
  if (charCount(text) > WAIVER_BODY_MAX) return 'tooLong';
  return null;
}

// The two keep-years numbers (S12): both empty (nothing is ever deleted) or both whole years from
// 3 to 20. → null (fine) | 'oneEmpty' | 'outOfRange'.
export function keepYearsProblem(afterLastDay, after18) {
  const empty = (v) => v === null || v === undefined || v === '';
  if (empty(afterLastDay) && empty(after18)) return null;
  if (empty(afterLastDay) || empty(after18)) return 'oneEmpty';
  const ok = (v) => Number.isInteger(v) && v >= KEEP_YEARS_MIN && v <= KEEP_YEARS_MAX;
  return ok(afterLastDay) && ok(after18) ? null : 'outOfRange';
}

// The day a candidate's personal data may be removed (SQL 10e bb_purge_due_on): the later of
// (the cycle's last testing day + N1 years) and (the 18th birthday + N2 years). null when either
// setting is empty (= never).
export function purgeDueOn({ dateOfBirth, lastDay, afterLastDay, after18 }) {
  if (!Number.isInteger(afterLastDay) || !Number.isInteger(after18)) return null;
  const a = lastDay ? addYears(lastDay, afterLastDay) : null;
  const b = dateOfBirth ? addYears(dateOfBirth, 18 + after18) : null;
  if (a === null) return b;
  if (b === null) return a;
  return later(a, b);
}

// =====================================================================================
// ----- Candidates and payments (phase B2, contract 0016-B2 §1.4) -----
// =====================================================================================
// Words used here:
//   item        one thing a candidate owes: 'p1' … 'p12' (a payment of their plan) or 'kukkiwon'
//   live row    a payment, refund or returned-check row that no undo (reversal) points at
//   line        a live row as the screens and these rules use it:
//               { id, kind: 'payment'|'refund'|'returned', amountCents (refund/returned negative),
//                 method, paidOn, forItems, recordedAt, reversesPaymentId, returned }
//               returned = a payment whose check is marked returned (shown crossed out, NOT counted)
//   Money       the money picture of one candidate (SQL 10d bb_candidate_money), camelCase:
//               { items: [{ item, label, dueOn, amountCents, paidCents, remainingCents }],
//                 totalDueCents, paidCents, balanceCents, overpaidCents,
//                 tag: 'paid_in_full'|'next'|'late'|'not_paid', nextOn, nextCents,
//                 lateSince, lateCents, lateKukkiwonOnly }
// The preview database uses the SAME functions (so its answers match the SQL), and checks.mjs
// replays the SQL's test cases (0016_tests.sql T7b) against them.

// A ticked item's code (bb_record_payment's check): p1 … p12 or kukkiwon.
export const ITEM_PATTERN = /^(p([1-9]|1[0-2])|kukkiwon)$/;
export const METHODS = ['cash', 'check', 'card'];
export const PAYMENT_MAX_CENTS = 500000; // $5,000 per payment, refund or returned check
export const NOTE_MAX = 600; // a payment's note or reason, characters after tidying
export const MAX_FOR_ITEMS = 13; // p1 … p12 + kukkiwon
export const UNDO_WINDOW_MS = 10 * 1000; // staff may undo their own payment for 10 seconds

// Compares two timestamps (ISO text): by the moment first, then as text (the text keeps
// microseconds the moment loses), so the order matches the database's "order by recorded_at".
const byTime = (a, b) => {
  const x = Date.parse(a ?? '');
  const y = Date.parse(b ?? '');
  if (x !== y) return (Number.isNaN(x) ? 0 : x) - (Number.isNaN(y) ? 0 : y);
  return a < b ? -1 : a > b ? 1 : 0;
};
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// What a candidate owes, item by item — SQL 10c bb_candidate_items exactly:
//   pN        the plan's amount for the Dan, due the LATER of the plan's due date and the school
//             day the candidate registered (S4: a late family's passed dates count from then)
//   kukkiwon  if chosen, the Dan's fee, due the later of p1's due date and the day it was chosen
//             (added late = due that day, v0.900)
// Order: by due date, then p1, kukkiwon, p2, p3 …
// planPayments: [{ paymentNo, dueOn }] (or the database's payment_no / due_on); amounts: this
// Dan's amounts in payment order (cents); kukkiwonFee: cents or null (no fee row = no item, as
// the SQL's join). → [{ item, label, dueOn, amountCents }] — label is the database's own
// ("Payment 1", "Kukkiwon certificate"), so the preview's answers match the SQL; the screens
// use their own words.
export function candidateItems({ planPayments, amounts, kukkiwon = false, kukkiwonAddedOn = null, kukkiwonFee = null, registeredOn }) {
  const list = Array.isArray(amounts) ? amounts : [];
  const items = [...(planPayments ?? [])]
    .map((p) => ({ paymentNo: pick(p, 'paymentNo', 'payment_no'), dueOn: pick(p, 'dueOn', 'due_on') }))
    .filter((p) => Number.isInteger(p.paymentNo) && Number.isInteger(list[p.paymentNo - 1])) // the SQL joins the amount
    .map((p) => ({
      item: `p${p.paymentNo}`,
      label: `Payment ${p.paymentNo}`,
      dueOn: registeredOn && registeredOn > p.dueOn ? registeredOn : p.dueOn,
      amountCents: list[p.paymentNo - 1],
      tie: p.paymentNo * 10,
    }));
  if (kukkiwon && Number.isInteger(kukkiwonFee)) {
    const p1 = items.find((x) => x.item === 'p1')?.dueOn ?? null;
    // PostgreSQL's greatest() skips a null
    const due = p1 === null ? kukkiwonAddedOn : kukkiwonAddedOn === null ? p1 : later(p1, kukkiwonAddedOn);
    items.push({ item: 'kukkiwon', label: 'Kukkiwon certificate', dueOn: due, amountCents: kukkiwonFee, tie: 15 }); // between p1 (10) and p2 (20)
  }
  items.sort((a, b) => byText(a.dueOn, b.dueOn) || a.tie - b.tie);
  return items.map(({ item, label, dueOn, amountCents }) => ({ item, label, dueOn, amountCents }));
}

// The live lines of a candidate's payment rows (SQL 10d / 16d "live"): every bb_payments row of
// ONE candidate, all kinds including the reversals (snake_case store rows or camelCase lines)
// → the payment, refund and returned rows no reversal points at, oldest first (recorded_at,
// then id), each with `returned` (a payment whose check has a live returned mark). Reversals
// themselves are never lines.
export function liveLines(rows) {
  const all = (rows ?? []).map((r) => ({
    id: pick(r, 'id', 'id'),
    kind: pick(r, 'kind', 'kind'),
    amountCents: pick(r, 'amountCents', 'amount_cents'),
    method: pick(r, 'method', 'method') ?? null,
    paidOn: pick(r, 'paidOn', 'paid_on') ?? null,
    forItems: pick(r, 'forItems', 'for_items') ?? null,
    recordedAt: pick(r, 'recordedAt', 'recorded_at') ?? null,
    reversesPaymentId: pick(r, 'reversesPaymentId', 'reverses_payment_id') ?? null,
  }));
  const reversed = new Set(all.filter((r) => r.kind === 'reversal').map((r) => r.reversesPaymentId));
  const live = all.filter((r) => ['payment', 'refund', 'returned'].includes(r.kind) && !reversed.has(r.id));
  const liveReturnedOf = new Set(live.filter((r) => r.kind === 'returned').map((r) => r.reversesPaymentId));
  return live
    .map((r) => ({ ...r, returned: r.kind === 'payment' && liveReturnedOf.has(r.id) }))
    .sort((a, b) => byTime(a.recordedAt, b.recordedAt) || byText(a.id, b.id));
}

// "Has a payment" (the staff / admin split for Change plan and a Dan change, CONTRACT-0016 §6;
// also Not paid vs Late): at least one live payment row — a payment whose check bounced still
// counts (§7.3). lines: live lines (liveLines, or the detail's payments list).
export function hasLivePayment(lines) {
  return (lines ?? []).some((l) => pick(l, 'kind', 'kind') === 'payment');
}

// The money picture — SQL 10d bb_candidate_money exactly. items: candidateItems(…); lines: the
// LIVE lines (liveLines, or the detail's payments list as it comes); today: 'YYYY-MM-DD'.
// paidCents = every live line added up (the same as every row added up, because each undo
// cancels exactly the row it undoes).
//   1. Allocation (S1): the live payments that aren't returned checks, oldest first (ties by id):
//      first to the items they were ticked for (in item order, up to what each still owes; an
//      item the plan no longer has is skipped), then to the earliest unpaid items; the rest is
//      overpaid.
//   2. Refunds come off the overpaid amount first, then off the items from the LATEST backwards.
//   3. The tag on `today`: nothing left → 'paid_in_full'; an item with money left due BEFORE
//      today → 'late' (or 'not_paid' when there is no live payment row at all); otherwise 'next'
//      (also ON the due date) with the earliest date that has money left and what is left on it.
export function candidateMoney({ items, lines, today }) {
  const list = (items ?? []).map((x) => ({
    item: x.item, label: x.label ?? null, dueOn: x.dueOn ?? x.due_on, amountCents: x.amountCents ?? x.amount_cents, paidCents: 0,
  }));
  const rows = (lines ?? []).map((l) => ({
    id: pick(l, 'id', 'id'),
    kind: pick(l, 'kind', 'kind'),
    amountCents: pick(l, 'amountCents', 'amount_cents'),
    forItems: pick(l, 'forItems', 'for_items') ?? [],
    recordedAt: pick(l, 'recordedAt', 'recorded_at'),
    returned: pick(l, 'returned', 'returned') === true,
  }));
  // 1. allocation
  let over = 0;
  const payments = rows.filter((r) => r.kind === 'payment' && !r.returned)
    .sort((a, b) => byTime(a.recordedAt, b.recordedAt) || byText(a.id, b.id));
  for (const p of payments) {
    let left = p.amountCents;
    for (const x of list) { // first to the ticked items, in item order
      if (left <= 0) break;
      if (!p.forItems.includes(x.item)) continue;
      const take = Math.min(left, x.amountCents - x.paidCents);
      if (take > 0) {
        x.paidCents += take;
        left -= take;
      }
    }
    for (const x of list) { // then to the earliest unpaid items
      if (left <= 0) break;
      const take = Math.min(left, x.amountCents - x.paidCents);
      if (take > 0) {
        x.paidCents += take;
        left -= take;
      }
    }
    over += Math.max(left, 0);
  }
  // 2. refunds (stored negative: minus makes them positive here)
  let refund = rows.filter((r) => r.kind === 'refund').reduce((sum, r) => sum - r.amountCents, 0);
  const fromOver = Math.min(refund, over);
  over -= fromOver;
  refund -= fromOver;
  for (let i = list.length - 1; i >= 0 && refund > 0; i -= 1) {
    const take = Math.min(refund, list[i].paidCents);
    list[i].paidCents -= take;
    refund -= take;
  }
  // 3. totals and the tag
  const net = rows.reduce((sum, r) => sum + r.amountCents, 0);
  const any = hasLivePayment(rows);
  let total = 0;
  let lateCents = 0;
  let lateSince = null;
  let kukkiwonOnly = true;
  let nextOn = null;
  for (const x of list) {
    total += x.amountCents;
    const remaining = x.amountCents - x.paidCents;
    if (remaining > 0) {
      if (x.dueOn < today) {
        lateCents += remaining;
        lateSince = lateSince === null || x.dueOn < lateSince ? x.dueOn : lateSince;
        if (x.item !== 'kukkiwon') kukkiwonOnly = false;
      }
      if (nextOn === null || x.dueOn < nextOn) nextOn = x.dueOn;
    }
  }
  let tag;
  let nextCents = 0;
  if (nextOn === null) tag = 'paid_in_full';
  else if (lateSince !== null) tag = any ? 'late' : 'not_paid';
  else {
    tag = 'next';
    for (const x of list) if (x.dueOn === nextOn) nextCents += x.amountCents - x.paidCents;
  }
  return {
    items: list.map((x) => ({
      item: x.item, label: x.label, dueOn: x.dueOn, amountCents: x.amountCents, paidCents: x.paidCents, remainingCents: x.amountCents - x.paidCents,
    })),
    totalDueCents: total,
    paidCents: net,
    balanceCents: total - net,
    overpaidCents: Math.max(net - total, 0),
    tag,
    nextOn: tag === 'next' ? nextOn : null,
    nextCents: tag === 'next' ? nextCents : null,
    lateSince: tag === 'late' ? lateSince : null,
    lateCents: tag === 'late' ? lateCents : null,
    lateKukkiwonOnly: tag === 'late' ? kukkiwonOnly : null,
  };
}

// The items of a candidate under a plan of a CycleDetail (loadCycle) — the screens' way to call
// candidateItems: cycle.plans[].payments / .amounts[dan] and cycle.kukkiwon[dan].
// → [{ item, label, dueOn, amountCents }] ([] when the plan isn't in the cycle).
export function cycleCandidateItems(cycle, { planId, dan, kukkiwon = false, kukkiwonAddedOn = null, registeredOn }) {
  const plan = (cycle?.plans ?? []).find((p) => p.id === planId);
  if (!plan) return [];
  return candidateItems({
    planPayments: plan.payments ?? [],
    amounts: amountOf(plan.amounts, Number(dan)) ?? [],
    kukkiwon,
    kukkiwonAddedOn,
    kukkiwonFee: amountOf(cycle?.kukkiwon, Number(dan)) ?? null,
    registeredOn,
  });
}

// "What would the money look like if …" — candidateItems + candidateMoney with a changed plan
// or Kukkiwon (Change plan's "New total …" line) or with one check marked returned (Mark check
// returned's sentence). Nothing is saved.
//   cycle, planId, dan, kukkiwon, kukkiwonAddedOn, registeredOn — as cycleCandidateItems; a
//     Kukkiwon NEWLY chosen (kukkiwon true, kukkiwonAddedOn null) is dated today, like the
//     database stamps it
//   lines: the candidate's live lines; today
//   returnedPaymentId: a check payment's id to pretend it is marked returned (null = none)
// → Money
export function predictMoney({ cycle, planId, dan, kukkiwon = false, kukkiwonAddedOn = null, registeredOn, lines, today, returnedPaymentId = null }) {
  const items = cycleCandidateItems(cycle, {
    planId, dan, kukkiwon, kukkiwonAddedOn: kukkiwon ? kukkiwonAddedOn ?? today : null, registeredOn,
  });
  let list = [...(lines ?? [])];
  if (returnedPaymentId) {
    const check = list.find((l) => pick(l, 'id', 'id') === returnedPaymentId);
    if (check) {
      list = list.map((l) => (l === check ? { ...l, returned: true } : l));
      list.push({ id: 'predicted-returned', kind: 'returned', amountCents: -pick(check, 'amountCents', 'amount_cents'), forItems: null, recordedAt: null, returned: false });
    }
  }
  return candidateMoney({ items, lines: list, today });
}

// The items with money left that are due on or before today (Record payment's "due now" line).
// money: a Money with items. → [item, …] in item order.
export function dueNowItems(money, today) {
  return (money?.items ?? []).filter((x) => x.remainingCents > 0 && x.dueOn <= today);
}

// The items with money left on the earliest date that still has money left ("next: $290 by
// Apr 24"). → [item, …] ([] when nothing is owed).
export function nextItems(money) {
  const open = (money?.items ?? []).filter((x) => x.remainingCents > 0);
  if (open.length === 0) return [];
  const first = open.map((x) => x.dueOn).sort()[0];
  return open.filter((x) => x.dueOn === first);
}

// What Record payment ticks at first: the due-now items, else the next items, else nothing.
// → item codes ['p1', 'kukkiwon'].
export function defaultTicks(money, today) {
  const now = dueNowItems(money, today);
  return (now.length > 0 ? now : nextItems(money)).map((x) => x.item);
}

// What is still owed on the ticked items (Record payment's Amount fills with this).
// codes: ['p1', 'kukkiwon'] → cents.
export function sumRemaining(money, codes) {
  const set = new Set(codes ?? []);
  return (money?.items ?? []).filter((x) => set.has(x.item)).reduce((sum, x) => sum + Math.max(x.remainingCents, 0), 0);
}

// ----- The roster (Candidates 1) -----

// Is this row shown for the location switcher's school? school: 'Worcester' | 'Shrewsbury' |
// 'Both' (or a code, or null = both).
function shownFor(row, school) {
  if (school === null || school === undefined || String(school).toLowerCase() === 'both') return true;
  return pick(row, 'locationCode', 'location_code') === String(school).toLowerCase();
}

// Which card each money tag counts under.
export const CARD_OF_TAG = { paid_in_full: 'paidInFull', next: 'onSchedule', late: 'late', not_paid: 'notPaid' };

// The four summary cards (v0.219) → { paidInFull, onSchedule, late, notPaid, duplicatesLeftOut }.
// Counted from the ACTIVE rows of the shown school(s); possible duplicates are left out (and
// counted in duplicatesLeftOut) until they're resolved; withdrawn rows are left out.
// paid_in_full (also overpaid) → paidInFull · next → onSchedule · late → late · not_paid → notPaid.
// rows: RosterRow[] (loadRoster); school: as the location switcher.
export function rosterCards(rows, { school = 'Both' } = {}) {
  const out = { paidInFull: 0, onSchedule: 0, late: 0, notPaid: 0, duplicatesLeftOut: 0 };
  for (const row of rows ?? []) {
    if (row.status !== 'active' || !shownFor(row, school)) continue;
    if (row.duplicateState === 'possible') {
      out.duplicatesLeftOut += 1;
      continue;
    }
    const key = CARD_OF_TAG[row.money?.tag];
    if (key) out[key] += 1;
  }
  return out;
}

// Does a row match the search box? First name, last name, "first last" and the reference;
// capitals and spaces don't matter ("alex kim", "AlexKim", "bb-5001", "5001" all find Alex Kim
// BB-5001). Empty text → every row.
export function searchMatches(row, text) {
  const squash = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
  const needle = squash(text);
  if (needle === '') return true;
  const first = squash(row?.firstName);
  const last = squash(row?.lastName);
  return [first, last, `${first}${last}`, squash(row?.reference)].some((hay) => hay.includes(needle));
}

// The rows the list shows, in the order given (the database's: Dan, Shrewsbury then Worcester,
// last name, first name):
//   school  the location switcher (Both = everyone)
//   card    null (all) | 'paidInFull' | 'onSchedule' | 'late' | 'notPaid' — exactly the rows the
//           card counts (active, not a possible duplicate, that tag)
//   search  the search box (searchMatches)
// Without a card the withdrawn rows stay in (the screen puts them in the Removed group).
export function rosterFilter(rows, { school = 'Both', card = null, search = '' } = {}) {
  return (rows ?? []).filter((row) => {
    if (!shownFor(row, school) || !searchMatches(row, search)) return false;
    if (card === null || card === undefined) return true;
    return row.status === 'active' && row.duplicateState !== 'possible' && CARD_OF_TAG[row.money?.tag] === card;
  });
}

// The possible-duplicate pairs among the rows (the amber box above the cards): each ACTIVE
// 'possible' row with the row it points at — every pair once, in the order the rows come.
// → [{ row, partner }] (partner = null when it isn't among the rows, e.g. the other school is
// filtered out).
export function duplicatePairs(rows) {
  const list = rows ?? [];
  const rowById = new Map(list.map((r) => [r.id, r]));
  const seen = new Set();
  const out = [];
  for (const row of list) {
    if (row.status !== 'active' || row.duplicateState !== 'possible') continue;
    const key = [row.id, row.duplicateOf].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ row, partner: rowById.get(row.duplicateOf) ?? null });
  }
  return out;
}

// The receipt's "check returned" lines say which payment bounced ("Payment 2 · check returned"),
// but bb_receipt sends no row ids (§7.3). This pairs each 'returned' line with the EARLIEST
// payment line marked returned: true of the same amount that isn't paired yet.
// lines: the receipt's lines ({ kind, amountCents, forItems, returned }) in their order.
// → an array as long as lines: for a 'returned' line the paired payment's forItems (null when
//   none is found → the receipt prints "Check returned"); null for every other line.
export function pairReturnedLines(lines) {
  const list = lines ?? [];
  const used = new Set();
  return list.map((line) => {
    if (line?.kind !== 'returned') return null;
    const index = list.findIndex((p, i) => !used.has(i) && p?.kind === 'payment' && p.returned === true
      && p.amountCents === -line.amountCents);
    if (index === -1) return null;
    used.add(index);
    return list[index].forItems ?? null;
  });
}
