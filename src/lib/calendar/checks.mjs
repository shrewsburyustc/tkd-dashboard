// checks.mjs — plain checks for the Calendar's rule files and its preview database.
// Why it exists: the rules (31 days, times, text), the date maths (month weeks, which schedule
// is in effect, cancelled classes) and the fake database must agree with migration 0008.
// These checks run in Node without a browser:
//   node src/lib/calendar/checks.mjs
// Prints "ALL CALENDAR LIB CHECKS PASSED", or stops at the first failed check.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cleanNotes, datesProblem, eventTimesProblem, notesProblem, textProblem } from './rules.js';
import { addMonths, buildDay, eventTimeOn, monthWeeks, recordMatches, versionInEffect, weekDates } from './days.js';
import { createCalendarBackend } from '../mockCalendar.js';

let groups = 0;
function group(name, fn) {
  fn();
  groups += 1;
  console.log(`ok  ${name}`);
}

group('rules: text, notes', () => {
  assert.equal(textProblem('  Parent   meeting ', 80), null);
  assert.equal(textProblem('   ', 80), 'empty');
  assert.equal(textProblem('x'.repeat(81), 80), 'tooLong');
  assert.equal(textProblem('x'.repeat(80), 80), null);
  assert.equal(textProblem(`a${String.fromCharCode(0x200b)}b`, 80), 'badCharacter');
  assert.equal(textProblem(`a${String.fromCharCode(7)}b`, 80), 'badCharacter');
  assert.equal(cleanNotes('  one\r\ntwo  '), 'one\ntwo');
  assert.equal(cleanNotes(' \n '), null);
  assert.equal(notesProblem('a\nb'), null);
  assert.equal(notesProblem('a\tb'), 'badCharacter');
  assert.equal(notesProblem('n'.repeat(1001)), 'tooLong');
  assert.equal(notesProblem(null), null);
});

group('rules: dates (31 days) and times', () => {
  assert.equal(datesProblem('2027-01-01', '2027-01-31'), null); // 31 days
  assert.equal(datesProblem('2027-01-01', '2027-02-01'), 'tooLong'); // 32
  assert.equal(datesProblem('2027-01-05', '2027-01-04'), 'endsBefore');
  assert.equal(datesProblem('2206-01-01', '2206-01-01'), 'outOfRange');
  assert.equal(datesProblem('2027-02-30', '2027-03-01'), 'missing');
  const base = { startsOn: '2027-01-11', endsOn: '2027-01-11', allDay: false };
  assert.equal(eventTimesProblem({ ...base, start: 1170, end: 1230 }), null);
  assert.equal(eventTimesProblem({ ...base, start: 1170, end: 1170 }), 'endsBefore');
  assert.equal(eventTimesProblem({ ...base, start: 1173, end: 1230 }), 'step');
  assert.equal(eventTimesProblem({ ...base, start: null, end: 1230 }), 'missing');
  assert.equal(eventTimesProblem({ ...base, endsOn: '2027-01-13', start: 1170, end: 720 }), null); // Fri 7:30 pm → Sun 12 pm
  assert.equal(eventTimesProblem({ ...base, allDay: true, start: null, end: null }), null);
});

group('days: weeks, months', () => {
  const jan = monthWeeks('2027-01-11');
  assert.equal(jan.length, 5);
  assert.deepEqual(jan[0], ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  assert.equal(jan[4][6], '2027-01-31');
  assert.equal(monthWeeks('2027-02-15').length, 4); // Feb 2027 starts on a Monday, 28 days
  assert.equal(monthWeeks('2026-08-01').length, 6); // Aug 2026: Sat 1st … Mon 31st
  assert.deepEqual(weekDates('2027-01-13'), ['2027-01-11', '2027-01-12', '2027-01-13', '2027-01-14', '2027-01-15', '2027-01-16', '2027-01-17']);
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(addMonths('2027-01-15', -1), '2026-12-15');
});

// ----- One school's schedule, for buildDay -----
const W = { white: randomUUID(), a: randomUUID(), b: randomUUID() };
const vNow = { id: 'v-now', startsOn: '2026-09-07', name: null };
const vWinter = { id: 'v-winter', startsOn: '2027-01-04', name: 'Winter' };
const slot = (id, versionId, weekday, start, end, classIds) => ({ id, versionId, weekday, start, end, classIds });
const school = {
  code: 'worcester',
  name: 'Worcester',
  versions: [vNow, vWinter],
  slots: [
    slot('n1', 'v-now', 5, 1020, 1065, [W.white]),
    slot('w1', 'v-winter', 5, 1020, 1065, [W.b]),
    slot('w2', 'v-winter', 5, 1065, 1110, [W.white, W.a]),
    slot('w3', 'v-winter', 1, 960, 1005, [W.a]),
  ],
  classNames: new Map([[W.white, 'White'], [W.a, 'Group A'], [W.b, 'Group B']]),
  colors: { [W.white]: 'gray', [W.a]: 'yellow' },
};
const ctx = (extra = {}) => ({ schools: [school], events: [], closures: [], closureClasses: new Map(), testingEvents: [], ...extra });

group('days: the schedule in effect on a date', () => {
  assert.equal(versionInEffect(school.versions, '2027-01-03').id, 'v-now');
  assert.equal(versionInEffect(school.versions, '2027-01-04').id, 'v-winter');
  assert.equal(versionInEffect(school.versions, '2026-01-01'), null);
  const fri = buildDay('2027-01-15', ctx());
  assert.deepEqual(fri.schools[0].classes.map((c) => c.name), ['Group B', 'White + Group A']);
  assert.equal(fri.classCount, 2);
  const oldFri = buildDay('2027-01-01', ctx());
  assert.deepEqual(oldFri.schools[0].classes.map((c) => c.name), ['White']);
  assert.deepEqual(buildDay('2027-01-04', ctx()).scheduleStarts, [{ code: 'worcester', name: 'Winter' }]);
  assert.deepEqual(buildDay('2027-01-11', ctx()).scheduleStarts, []);
});

group('days: closures, records and "no longer on the schedule"', () => {
  const whole = { id: 'c1', locationCode: null, startsOn: '2027-01-15', endsOn: '2027-01-16', reason: 'Storm', wholeDay: true };
  const day = buildDay('2027-01-15', ctx({ closures: [whole] }));
  assert.equal(day.cancelledCount, 2);
  assert.equal(day.closures[0].cancelledCount, 2);
  const some = { id: 'c2', locationCode: 'worcester', startsOn: '2027-01-15', endsOn: '2027-01-15', reason: 'Snow', wholeDay: false };
  const records = [
    { locationCode: 'worcester', weekday: 5, start: 1065, end: 1110, classIds: [W.white, W.a], classNames: 'White + Group A', slotId: 'w2' },
    { locationCode: 'worcester', weekday: 5, start: 1200, end: 1260, classIds: [W.b], classNames: 'Group B', slotId: 'gone' },
  ];
  const d2 = buildDay('2027-01-15', ctx({ closures: [some], closureClasses: new Map([['c2', records]]) }));
  assert.deepEqual(d2.schools[0].classes.map((c) => c.cancelled), [false, true]);
  assert.equal(d2.closures[0].cancelledCount, 1);
  assert.deepEqual(d2.closures[0].orphans.map((r) => r.classNames), ['Group B']); // the amber line
  // order matters: "Group A + White" is not the same slot
  assert.equal(recordMatches({ ...records[0], classIds: [W.a, W.white] }, school.slots[2], 'worcester'), false);
  // a closure for the other school doesn't cancel anything here
  const other = { ...whole, id: 'c3', locationCode: 'shrewsbury' };
  assert.equal(buildDay('2027-01-15', ctx({ closures: [other] })).cancelledCount, 0);
});

group('days: events (all day, timed, several days)', () => {
  const events = [
    { id: 'e1', locationCode: 'worcester', typeId: 't', title: 'Parent meeting', startsOn: '2027-01-11', endsOn: '2027-01-11', allDay: false, start: 1170, end: 1230 },
    { id: 'e2', locationCode: null, typeId: 't', title: 'Winter camp', startsOn: '2027-01-10', endsOn: '2027-01-12', allDay: true, start: null, end: null },
    { id: 'e3', locationCode: 'shrewsbury', typeId: 't', title: 'Belt ceremony', startsOn: '2027-01-11', endsOn: '2027-01-11', allDay: true, start: null, end: null },
  ];
  const day = buildDay('2027-01-11', ctx({ events }));
  assert.deepEqual(day.events.map((e) => e.event.id), ['e2', 'e1']); // Shrewsbury's is not shown on Worcester
  assert.deepEqual(day.events[0].part, { index: 2, total: 3 });
  const weekend = { startsOn: '2027-01-15', endsOn: '2027-01-17', allDay: false, start: 1170, end: 720 };
  assert.deepEqual(eventTimeOn(weekend, '2027-01-15'), { kind: 'from', start: 1170 });
  assert.deepEqual(eventTimeOn(weekend, '2027-01-16'), { kind: 'allDay' });
  assert.deepEqual(eventTimeOn(weekend, '2027-01-17'), { kind: 'until', end: 720 });
});

// ----- The preview database follows migration 0008 -----
const TODAY = '2027-01-11';
const sched = {
  versions: [{ id: 'sv-now', location_code: 'worcester', starts_on: '2027-01-04' }, { id: 'sv-s', location_code: 'shrewsbury', starts_on: '2027-01-04' }],
  slots: [
    { id: randomUUID(), version_id: 'sv-now', location_code: 'worcester', weekday: 5, starts_at: '17:00:00', ends_at: '17:45:00', class_ids: [W.b] },
    { id: randomUUID(), version_id: 'sv-now', location_code: 'worcester', weekday: 4, starts_at: '17:00:00', ends_at: '17:45:00', class_ids: [W.a] },
    { id: randomUUID(), version_id: 'sv-s', location_code: 'shrewsbury', weekday: 5, starts_at: '17:00:00', ends_at: '17:45:00', class_ids: [W.white] },
  ],
};
const [slotFri, slotThu, slotShr] = sched.slots.map((s) => s.id);
let store = null;
const backend = createCalendarBackend({
  loadStore: () => store,
  saveStore: (s) => {
    store = JSON.parse(JSON.stringify(s));
  },
  newId: randomUUID,
  getSchedule: () => sched,
  getClasses: () => [{ id: W.b, location_code: 'worcester', name: 'Group B' }, { id: W.a, location_code: 'worcester', name: 'Group A' }, { id: W.white, location_code: 'shrewsbury', name: 'White' }],
  today: () => TODAY,
});
const admin = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Jeffrey' };
const call = (name, args, c = admin) => backend.rpc(name, args, c).data;

group('mock: five starting types; reads hide the login ids', () => {
  const types = backend.select('calendar_event_types', 'id, name, color, position', [], [{ col: 'position' }], admin).data;
  assert.deepEqual(types.map((t) => `${t.name}:${t.color}`), ['Testing:purple', 'Tournament:sky', 'Camp:teal', 'Meeting:orange', 'Party:pink']);
  assert.equal(backend.select('calendar_closures', 'class_key', [], [], admin).error.code, '42501');
  assert.equal(backend.select('calendar_events', 'created_by', [], [], admin).error.code, '42501');
  assert.deepEqual(backend.select('calendar_events', 'id', [], [], { signedIn: true, hasDataAccess: false }).data, []);
});

const typeId = () => backend.select('calendar_event_types', 'id, name', [], [{ col: 'position' }], admin).data[0].id;
const ev = (over = {}) => ({
  p_location_code: 'worcester', p_type_id: typeId(), p_title: 'Parent meeting', p_starts_on: '2027-01-14', p_ends_on: '2027-01-14',
  p_all_day: false, p_starts_at: '19:30', p_ends_at: '20:30', p_notes: null, ...over,
});

group('mock: events (same answers as 0008)', () => {
  const r = call('calendar_add_event', ev());
  assert.equal(r.status, 'ok');
  assert.equal(call('calendar_add_event', ev({ p_ends_on: '2027-02-14' })).status, 'invalid'); // 32 days
  assert.equal(call('calendar_add_event', ev({ p_all_day: true })).status, 'invalid'); // all day with times
  assert.equal(call('calendar_add_event', ev({ p_type_id: randomUUID() })).status, 'stale');
  assert.equal(call('calendar_add_event', ev({ p_location_code: 'boston' })).status, 'invalid');
  assert.equal(call('calendar_add_event', ev({ p_location_code: null, p_all_day: true, p_starts_at: null, p_ends_at: null })).status, 'ok');
  assert.equal(backend.rpc('calendar_add_event', ev(), { ...admin, isAdmin: false }).data.status, 'not_allowed');
  assert.equal(backend.rpc('calendar_add_event', ev(), { ...admin, hasDataAccess: false }).data.status, 'no_access');
  const up = call('calendar_update_event', { p_event_id: r.id, p_expected_version: 1, ...ev({ p_title: 'Parent night' }) });
  assert.equal(up.version, 2);
  assert.equal(call('calendar_update_event', { p_event_id: r.id, p_expected_version: 1, ...ev() }).status, 'stale');
  const same = call('calendar_update_event', { p_event_id: r.id, p_expected_version: 2, ...ev({ p_title: 'Parent night' }) });
  assert.equal(same.version, 2); // nothing changed
  const rm = call('calendar_remove_event', { p_event_id: r.id, p_expected_version: 2 });
  assert.equal(rm.removed.title, 'Parent night');
  assert.equal(rm.removed.starts_at, '19:30');
});

group('mock: closures keep a record of each cancelled class', () => {
  const base = { p_location_code: 'worcester', p_starts_on: '2027-01-15', p_ends_on: '2027-01-15', p_reason: 'Snow storm', p_whole_day: false, p_slot_ids: [slotFri] };
  const r = call('calendar_add_closure', base);
  assert.equal(r.status, 'ok');
  const recs = backend.select('calendar_closure_classes', 'closure_id, class_ids, class_names, slot_id', [{ col: 'closure_id', value: [r.id], op: 'in' }], [], admin).data;
  assert.deepEqual(recs.map((x) => x.class_names), ['Group B']);
  assert.equal(call('calendar_add_closure', { ...base, p_slot_ids: [slotThu] }).status, 'stale'); // not that weekday
  assert.equal(call('calendar_add_closure', { ...base, p_slot_ids: [slotShr] }).status, 'invalid'); // other school
  assert.equal(call('calendar_add_closure', { ...base, p_location_code: null, p_slot_ids: [slotFri, slotShr] }).status, 'ok'); // Both
  assert.equal(call('calendar_add_closure', { ...base, p_ends_on: '2027-01-16' }).status, 'invalid'); // some classes = one day
  assert.equal(call('calendar_add_closure', { ...base, p_whole_day: true }).status, 'invalid'); // whole day + classes
  assert.equal(call('calendar_add_closure', { ...base, p_whole_day: true, p_slot_ids: [], p_ends_on: '2027-02-10' }).status, 'ok');
  // the schedule changes later: the record stays exactly as it was
  sched.slots[0].weekday = 3;
  const after = backend.select('calendar_closure_classes', 'closure_id, class_names', [{ col: 'closure_id', value: [r.id], op: 'in' }], [], admin).data;
  assert.deepEqual(after.map((x) => x.class_names), ['Group B']);
  assert.equal(call('calendar_update_closure', { p_closure_id: r.id, p_expected_version: 1, ...base }).status, 'ok'); // same list: kept
  assert.equal(call('calendar_update_closure', { p_closure_id: r.id, p_expected_version: 1, ...base, p_slot_ids: [slotFri, slotFri] }).status, 'invalid');
  sched.slots[0].weekday = 5;
  const rm = call('calendar_remove_closure', { p_closure_id: r.id, p_expected_version: 1 });
  assert.deepEqual(rm.removed.slot_ids, [slotFri]);
});

group('mock: event types (duplicate, recolor, reorder, delete + move)', () => {
  const t = call('calendar_add_type', { p_name: '  Seminar ', p_color: 'teal' });
  assert.equal(t.status, 'ok');
  assert.equal(call('calendar_add_type', { p_name: 'SEMINAR', p_color: 'sky' }).status, 'duplicate_name');
  assert.equal(call('calendar_add_type', { p_name: 'Red one', p_color: 'red' }).status, 'invalid');
  const order = backend.select('calendar_event_types', 'id', [], [{ col: 'position' }], admin).data.map((x) => x.id);
  assert.equal(call('calendar_reorder_types', { p_expected_ids: order, p_new_ids: [...order].reverse() }).status, 'ok');
  assert.equal(call('calendar_reorder_types', { p_expected_ids: order, p_new_ids: order }).status, 'stale');
  const used = call('calendar_add_event', ev({ p_type_id: t.id }));
  assert.equal(used.status, 'ok');
  assert.equal(call('calendar_delete_type', { p_type_id: t.id, p_expected_version: 1, p_expected_event_count: 0, p_move_to_type_id: null }).status, 'stale');
  assert.equal(call('calendar_delete_type', { p_type_id: t.id, p_expected_version: 1, p_expected_event_count: 1, p_move_to_type_id: null }).status, 'invalid');
  const del = call('calendar_delete_type', { p_type_id: t.id, p_expected_version: 1, p_expected_event_count: 1, p_move_to_type_id: order[0] });
  assert.equal(del.moved, 1);
});

group('days: free-class bookings (Forms, v0.241 answer 6)', () => {
  // Friday 2026-12-18 runs White at 17:00 (slot n1). One booking on it, one on a time that isn't
  // a class any more (classRunning false → amber), one cancelled (not shown), one at the other school.
  const b = (id, extra) => ({ id, locationCode: 'worcester', classId: W.white, className: 'White', date: '2026-12-18', start: '17:00', end: '17:45',
    childFirstName: 'Maya', formName: 'Free class', status: 'booked', classRunning: true, ...extra });
  const bookings = [b('b1'), b('b2', { start: '18:00', classRunning: false }), b('b3', { status: 'cancelled' }), b('b4', { locationCode: 'shrewsbury' })];
  const day = buildDay('2026-12-18', ctx({ bookings }));
  assert.equal(day.bookingCount, 2);
  assert.equal(day.bookingProblems, 1);
  assert.deepEqual(day.bookings.map((x) => x.id), ['b1', 'b2']);
  assert.equal(day.schools[0].classes.find((c) => c.slot.id === 'n1').bookings, 1);
  assert.equal(buildDay('2026-12-19', ctx({ bookings })).bookingCount, 0);
  assert.equal(buildDay('2026-12-18', ctx()).bookingCount, 0); // no Forms yet → none
});

console.log(`${groups} groups of checks ran.`);
console.log('ALL CALENDAR LIB CHECKS PASSED');
