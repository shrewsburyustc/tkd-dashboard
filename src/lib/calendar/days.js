// days.js — works out what the Calendar shows on each date. Plain functions, no screen code.
// Why it exists: the month boxes, the side panel, the phone's dots and the week view all need
// the same answers — which classes run that day (from the Schedule), which are cancelled, which
// events and closures cover it — so they are computed once, here, and tested in checks.mjs.
//
// Rules (rulebook v0.234 / v0.239):
//   - Classes come from the Schedule: on a date, a school uses the schedule with the LATEST
//     start date on or before that date (nothing is copied into the Calendar).
//   - A whole-day closure cancels every class of its school(s) that day (NULL school = both).
//   - A "some classes" closure keeps a RECORD of each cancelled class (day, time, classes). A
//     class is cancelled when it matches a record exactly. A record that matches nothing any
//     more ("the schedule changed later") is shown as an amber line (v0.239 answer 2).
//   - Events and closures cover every date from their first to their last day.
// Dates are 'YYYY-MM-DD' text (Massachusetts dates); times are minutes after midnight.
import { addDays, weekdayOf } from '../schedule/versions.js';

// ----- Dates -----

// Monday of the week that holds `date`.
export function weekStart(date) {
  return addDays(date, 1 - weekdayOf(date));
}

// The 7 dates (Mon … Sun) of the week that holds `date`.
export function weekDates(date) {
  const first = weekStart(date);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(first, i));
}

// 'YYYY-MM' of a date, and the first day of that month.
export const monthKey = (date) => date.slice(0, 7);
export const firstOfMonth = (date) => `${monthKey(date)}-01`;

// The same day-of-month n months later (clamped: Jan 31 + 1 month → Feb 28).
export function addMonths(date, n) {
  const [y, m] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Number(date.slice(8, 10)), last);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// The weeks shown for a month (Mon … Sun rows; only weeks that hold days of that month, so
// 4–6 rows). Days of the months before / after are still there — the screen grays them.
export function monthWeeks(date) {
  const first = firstOfMonth(date);
  const key = monthKey(date);
  const weeks = [];
  let start = weekStart(first);
  while (monthKey(start) <= key || weeks.length === 0) {
    const week = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i));
    if (!week.some((d) => monthKey(d) === key)) break;
    weeks.push(week);
    start = addDays(start, 7);
  }
  return weeks;
}

// ----- What runs on a date -----

// The schedule (version) a school uses on `date`: the latest start date on or before it.
export function versionInEffect(versions, date) {
  let best = null;
  for (const v of versions) {
    if (v.startsOn <= date && (!best || v.startsOn > best.startsOn)) best = v;
  }
  return best;
}

export const covers = (row, date) => row.startsOn <= date && date <= row.endsOn;
const forSchool = (row, code) => row.locationCode === null || row.locationCode === code;
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Does a cancelled-class record describe this slot (same day, times and classes in order)?
export function recordMatches(record, slot, code) {
  return record.locationCode === code && record.weekday === slot.weekday && record.start === slot.start
    && record.end === slot.end && sameList(record.classIds, slot.classIds);
}

// Everything on one date.
//   ctx.schools        [{ code, name, versions, slots, classNames (Map id → name), colors }]
//                      — one school, or both on "Both" (in the order to show them)
//   ctx.events         [{ id, locationCode, typeId, title, startsOn, endsOn, allDay, start, end, notes, version }]
//   ctx.closures       [{ id, locationCode, startsOn, endsOn, reason, wholeDay, version }]
//   ctx.closureClasses Map closureId → [{ locationCode, weekday, start, end, classIds, classNames, slotId }]
//   ctx.testingEvents  [{ id, locationCode, title, date, start }] — read from Testing (v0.239 answer 1)
//   ctx.bookings       [{ id, locationCode, classId, className, date, start 'HH:MM', end, childFirstName,
//                        formName, status, classRunning }] — free classes from Forms (v0.241 answer 6)
//   ctx.followUps      [{ id, code, childFirstName, initial, followUpOn }] — prospects' open follow-ups
//                      (v0.612 / v0.615; made by prospects/followUps.js calendarFollowUps)
// Returns {
//   date, weekday,
//   schools:  [{ code, name, classes: [{ slot, name, colorKeys, cancelled }] }]   (by start time)
//   events:   [{ event, part: { index, total } | null }]                           (all day first, then by time)
//   testing:  [testing event]
//   closures: [{ closure, cancelledCount, orphans: [record] }]
//   scheduleStarts: [{ code, name }]   a schedule (not the very first one) starts that day
//   bookings: [booking]  this day's free classes (booked, shown schools), by time
//   bookingCount, bookingProblems (how many are on a class that no longer runs then)
//   classCount, cancelledCount
//   (each class also has bookings: how many free classes are booked on it)
//   followUps: [follow-up]  this day's open follow-ups (shown schools), by child's name; followUpCount
// }
// What the Show menu hides is taken out afterwards (showKinds.js applyShow).
export function buildDay(date, ctx) {
  const weekday = weekdayOf(date);
  const closures = ctx.closures.filter((c) => covers(c, date));
  const schools = ctx.schools.map((school) => {
    const version = versionInEffect(school.versions, date);
    const slots = version ? school.slots.filter((s) => s.versionId === version.id && s.weekday === weekday) : [];
    const mine = closures.filter((c) => forSchool(c, school.code));
    const closedAllDay = mine.some((c) => c.wholeDay);
    const records = mine.filter((c) => !c.wholeDay).flatMap((c) => ctx.closureClasses.get(c.id) ?? []);
    const booked = (ctx.bookings ?? []).filter((b) => b.date === date && b.status === 'booked' && b.locationCode === school.code);
    const classes = [...slots]
      .sort((a, b) => a.start - b.start || a.end - b.end)
      .map((slot) => ({
        slot,
        bookings: booked.filter((b) => b.classId && slot.classIds.includes(b.classId) && toMinutes(b.start) === slot.start).length,
        name: slot.classIds.map((id) => school.classNames.get(id) ?? '').join(' + '),
        colorKeys: slot.classIds.map((id) => school.colors[id]),
        cancelled: closedAllDay || records.some((r) => recordMatches(r, slot, school.code)),
      }));
    return { code: school.code, name: school.name, classes, slots };
  });

  const closureInfo = closures.map((closure) => {
    if (closure.wholeDay) {
      const count = schools.filter((s) => forSchool(closure, s.code)).reduce((n, s) => n + s.classes.length, 0);
      return { closure, cancelledCount: count, orphans: [] };
    }
    const records = ctx.closureClasses.get(closure.id) ?? [];
    let count = 0;
    const orphans = [];
    for (const record of records) {
      const school = schools.find((s) => s.code === record.locationCode);
      if (school && school.slots.some((slot) => recordMatches(record, slot, school.code))) count += 1;
      else orphans.push(record);
    }
    return { closure, cancelledCount: count, orphans };
  });

  const codes = new Set(ctx.schools.map((s) => s.code));
  const both = ctx.schools.length > 1;
  const relevant = (row) => both || row.locationCode === null || codes.has(row.locationCode);
  const events = ctx.events
    .filter((e) => covers(e, date) && relevant(e))
    .map((event) => {
      const total = daysOf(event.startsOn, event.endsOn);
      return { event, part: total > 1 ? { index: daysOf(event.startsOn, date), total } : null };
    })
    .sort((a, b) => sortKey(a.event, date) - sortKey(b.event, date) || a.event.title.localeCompare(b.event.title));

  const scheduleStarts = [];
  for (const school of ctx.schools) {
    const sorted = [...school.versions].sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));
    sorted.forEach((v, i) => {
      if (i > 0 && v.startsOn === date) scheduleStarts.push({ code: school.code, name: v.name });
    });
  }

  const bookings = (ctx.bookings ?? [])
    .filter((b) => b.date === date && b.status === 'booked' && codes.has(b.locationCode))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.className.localeCompare(b.className)));

  const followUps = (ctx.followUps ?? [])
    .filter((f) => f.followUpOn === date && codes.has(f.code))
    .sort((a, b) => a.childFirstName.localeCompare(b.childFirstName) || a.initial.localeCompare(b.initial));

  return {
    date,
    weekday,
    schools: schools.map(({ code, name, classes }) => ({ code, name, classes })),
    bookings,
    bookingCount: bookings.length,
    bookingProblems: bookings.filter((b) => !b.classRunning).length,
    events,
    testing: (ctx.testingEvents ?? []).filter((t) => t.date === date && relevant(t)),
    closures: closureInfo.filter((c) => relevant(c.closure)),
    scheduleStarts,
    classCount: schools.reduce((n, s) => n + s.classes.length, 0),
    cancelledCount: schools.reduce((n, s) => n + s.classes.filter((c) => c.cancelled).length, 0),
    followUps,
    followUpCount: followUps.length,
  };
}

// 'HH:MM' → minutes after midnight.
const toMinutes = (text) => Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5));

// 1-based number of days from a to b (a = b → 1).
function daysOf(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000) + 1;
}

// All-day (and the middle days of a long event) first, then by start time.
function sortKey(event, date) {
  const time = eventTimeOn(event, date);
  return time.kind === 'allDay' ? -1 : time.start ?? 0;
}

// How an event shows on one of its days:
//   { kind: 'allDay' }                      all day, or a middle day of a timed several-day event
//   { kind: 'range', start, end }           a timed one-day event
//   { kind: 'from', start }                 the first day of a timed several-day event
//   { kind: 'until', end }                  its last day
export function eventTimeOn(event, date) {
  if (event.allDay) return { kind: 'allDay' };
  if (event.startsOn === event.endsOn) return { kind: 'range', start: event.start, end: event.end };
  if (date === event.startsOn) return { kind: 'from', start: event.start };
  if (date === event.endsOn) return { kind: 'until', end: event.end };
  return { kind: 'allDay' };
}
