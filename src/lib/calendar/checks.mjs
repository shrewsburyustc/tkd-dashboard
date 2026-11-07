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
import { toItem } from './items.js';
import * as T from '../../screens/calendar/text.js';
import { KINDS, applyShow, hiddenKey, loadHidden, saveHidden, shownCount, toggleKind } from './showKinds.js';
import { calendarFollowUps, childInitial, isDueToday, lastInitial, openFollowUpOn } from '../prospects/followUps.js';
import { clearOpenProspect, requestOpenProspect, takeOpenProspect } from '../prospects/openRequest.js';

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
const ctx = (extra = {}) => ({ schools: [school], events: [], closures: [], closureClasses: new Map(), items: [], ...extra });

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

group('follow-ups: which count, and what the Calendar keeps (v0.612 / v0.615)', () => {
  const statuses = [
    { id: 's-new', builtin: 'new' }, { id: 's-con', builtin: null }, { id: 's-joined', builtin: 'joined' },
    { id: 's-ni', builtin: 'not_interested' }, { id: 's-noshow', builtin: 'no_show' },
  ];
  const p = (id, statusId, followUpOn, parentName = 'Jo Allen') => ({ id, statusId, followUpOn, parentName, childFirstName: id, booking: { secret: 1 }, familyId: 'f' });
  const list = [p('Ruby', 's-con', '2027-01-15'), p('Owen', 's-joined', '2027-01-14'), p('Zoe', 's-ni', '2027-01-16'), p('Ethan', 's-noshow', '2027-01-13'), p('Liam', 's-new', null), p('Ann', 's-con', '2027-01-15', 'Cher')];
  const out = calendarFollowUps(list, statuses, 'worcester');
  // Joined and Not interested never count, even with a date left on them; no date = no follow-up
  assert.deepEqual(out.map((f) => f.id), ['Ruby', 'Ethan', 'Ann']);
  // only what the Calendar shows — nothing else from the list answer
  assert.deepEqual(out[0], { id: 'Ruby', code: 'worcester', childFirstName: 'Ruby', initial: 'A', followUpOn: '2027-01-15' });
  assert.equal(out[2].initial, ''); // one-word parent name
  assert.equal(lastInitial('  dan  de la cruz '), 'C');
  // "Ava N.": the child's own last initial since last names are asked (v0.637); older sign-ups
  // (no last name) keep the parent's, as above
  const own = calendarFollowUps([{ ...p('Ava', 's-con', '2027-01-15'), childLastName: 'Nguyen' }], statuses, 'worcester');
  assert.deepEqual(own[0], { id: 'Ava', code: 'worcester', childFirstName: 'Ava', initial: 'N', followUpOn: '2027-01-15' });
  assert.equal(childInitial({ childLastName: ' de la Cruz ', parentName: 'Jo Allen' }), 'D');
  assert.equal(childInitial({ childLastName: null, parentName: 'Jo Allen' }), 'A');
  assert.equal(openFollowUpOn({ followUpOn: '2027-01-15' }, 'joined'), null);
  // Prospects' "Follow up today" uses the same rule
  assert.equal(isDueToday({ followUpOn: '2027-01-14' }, 'joined', '2027-01-15'), false);
  assert.equal(isDueToday({ followUpOn: '2027-01-14' }, null, '2027-01-15'), true);
  assert.equal(isDueToday({ followUpOn: '2027-01-16' }, null, '2027-01-15'), false);
  assert.equal(isDueToday({ followUpOn: null }, 'new', '2027-01-15'), true);
  // buildDay: that day's follow-ups of the shown schools, by name
  const followUps = [...out, { id: 'S1', code: 'shrewsbury', childFirstName: 'Sam', initial: 'B', followUpOn: '2027-01-15' }];
  const day = buildDay('2027-01-15', ctx({ followUps }));
  assert.deepEqual(day.followUps.map((f) => f.id), ['Ann', 'Ruby']);
  assert.equal(day.followUpCount, 2);
  assert.equal(buildDay('2027-01-17', ctx({ followUps })).followUpCount, 0);
  assert.equal(buildDay('2027-01-15', ctx()).followUpCount, 0); // none loaded → none
});

group('Show menu: what each kind hides (v0.613 / v0.615)', () => {
  const whole = { id: 'c1', locationCode: null, startsOn: '2027-01-15', endsOn: '2027-01-15', reason: 'Storm', wholeDay: true };
  const event = { id: 'e1', locationCode: 'worcester', typeId: 't', title: 'Party', startsOn: '2027-01-15', endsOn: '2027-01-15', allDay: true, start: null, end: null };
  const booking = { id: 'b1', locationCode: 'worcester', classId: W.white, className: 'White', date: '2027-01-15', start: '17:00', end: '17:45', childFirstName: 'Maya', formName: 'Free class', status: 'booked', classRunning: true };
  const followUps = [{ id: 'f1', code: 'worcester', childFirstName: 'Ruby', initial: 'A', followUpOn: '2027-01-15' }];
  const day = buildDay('2027-01-15', ctx({ closures: [whole], events: [event], bookings: [booking], followUps }));
  assert.ok(day.classCount > 0 && day.cancelledCount === day.classCount && day.events.length === 1 && day.bookingCount === 1 && day.followUpCount === 1);
  // nothing hidden: unchanged
  const all = applyShow(day, new Set());
  assert.equal(all.classCount, day.classCount);
  assert.deepEqual(all.shows, Object.fromEntries(KINDS.map((k) => [k.key, true])));
  // Classes hidden: no classes, no counts, no "schedule starts"; the rest stays
  const noCls = applyShow(day, new Set(['classes']));
  assert.equal(noCls.classCount, 0);
  assert.equal(noCls.cancelledCount, 0);
  assert.deepEqual(noCls.schools[0].classes, []);
  assert.deepEqual(noCls.scheduleStarts, []);
  assert.equal(noCls.closures.length, 1);
  assert.equal(noCls.shows.classes, false);
  // Closures hidden: closure gone, but the classes stay CANCELLED (crossed out)
  const noClo = applyShow(day, new Set(['closures']));
  assert.equal(noClo.closures.length, 0);
  assert.equal(noClo.cancelledCount, day.cancelledCount);
  assert.ok(noClo.schools[0].classes.every((c) => c.cancelled));
  // Events / Free classes / Follow-ups hidden
  assert.equal(applyShow(day, new Set(['events'])).events.length, 0);
  const noFree = applyShow(day, new Set(['free']));
  assert.equal(noFree.bookingCount, 0);
  assert.equal(noFree.bookingProblems, 0);
  assert.ok(noFree.schools[0].classes.every((c) => c.bookings === 0)); // Week view's ti-user-plus badge
  assert.equal(applyShow(day, new Set(['followUps'])).followUpCount, 0);
  // the original day is never changed
  assert.equal(day.followUpCount, 1);
});

group('Show menu: saved per person, hidden kinds only (v0.613)', () => {
  const store = new Map();
  const read = (k) => (store.has(k) ? store.get(k) : null);
  const write = (k, v) => store.set(k, v);
  assert.deepEqual(KINDS.map((k) => k.key), ['classes', 'closures', 'events', 'testing', 'blackBelt', 'camps', 'deadlines', 'free', 'followUps', 'signups']);
  assert.equal(loadHidden('u1', read).size, 0); // nothing saved → everything shown
  let h = toggleKind(new Set(), 'classes');
  h = toggleKind(h, 'nonsense'); // unknown kinds are ignored
  assert.deepEqual([...h], ['classes']);
  saveHidden('u1', h, write);
  assert.equal(store.get(hiddenKey('u1')), '["classes"]');
  assert.deepEqual([...loadHidden('u1', read)], ['classes']);
  assert.equal(loadHidden('u2', read).size, 0); // another person on this device: their own choice
  assert.deepEqual(shownCount(h), { shown: 9, total: 10 });
  // a choice saved before the new kinds existed: only its old keys count, the new kinds start shown
  store.set(hiddenKey('old'), '["classes","followUps"]');
  const old = loadHidden('old', read);
  assert.deepEqual([...old], ['classes', 'followUps']);
  assert.ok(['testing', 'blackBelt', 'camps', 'deadlines', 'signups'].every((k) => !old.has(k)));
  assert.equal(shownCount(new Set()), null); // no badge while everything is shown
  assert.equal(toggleKind(h, 'classes').size, 0);
  store.set(hiddenKey('u3'), '{bad json');
  assert.equal(loadHidden('u3', read).size, 0); // unreadable → everything shown
  store.set(hiddenKey('u4'), '["events","gone-kind"]');
  assert.deepEqual([...loadHidden('u4', read)], ['events']);
  assert.equal(loadHidden('u5', () => { throw new Error('blocked'); }).size, 0); // storage blocked
});

// ----- Every other section's dates (v0.645, migration 0045) -----
const I = (kind, id, extra = {}) => ({ kind, id, date: '2027-01-15', start: null, end: null, locationCode: 'worcester', title: 'T', child: null, what: null, place: null, opens: 'camp', refId: 'r', eventId: null, ...extra });
const sampleItems = [
  I('camp_day', 'camp:1', { start: 540, end: 900, locationCode: null, title: 'Fall camp' }),
  I('colorbelt_event', 'cb1', { start: 750, end: 900, title: 'Fall testing', opens: 'colorbelt_event' }),
  I('colorbelt_private', 'cp1', { start: 915, title: 'Private', child: 'Ava N.', opens: 'colorbelt_private' }),
  I('star_event', 'se1', { locationCode: null, title: 'Star testing', opens: 'star_event' }),
  I('star_private', 'sp1', { start: 900, title: 'Private', child: 'Leo N.', opens: 'star_private', eventId: 'se1' }),
  I('bb_day', 'bb1', { start: 540, end: 720, title: 'Black Belt', what: 'Physical day', opens: 'bb_cycle' }),
  I('deadline', 'x:early_price_ends', { what: 'early_price_ends', title: 'Fall camp', locationCode: null }),
  I('signup', 'p1', { title: 'Free class', child: 'Liam P.', opens: 'prospect' }),
  I('signup', 'p2', { title: 'Free class', child: 'Mia R.', opens: 'prospect' }),
  I('signup', 'p3', { title: 'Free class', child: 'Zoe T.', locationCode: 'shrewsbury', opens: 'prospect' }),
  I('camp_day', 'camp:2', { date: '2027-01-16', start: 540, end: 900 }),
];

group('days: other sections\' items (v0.645)', () => {
  const day = buildDay('2027-01-15', ctx({ items: sampleItems }));
  // all day first, then by time; deadlines and sign-ups kept apart
  assert.deepEqual(day.items.map((i) => i.id), ['se1', 'bb1', 'camp:1', 'cb1', 'sp1', 'cp1']);
  assert.deepEqual(day.deadlines.map((i) => i.id), ['x:early_price_ends']);
  // Worcester shown: the Shrewsbury sign-up is left out, the two Worcester ones counted
  assert.deepEqual(day.signups.map((i) => i.child), ['Liam P.', 'Mia R.']);
  assert.equal(day.signupCount, 2);
  assert.equal(buildDay('2027-01-17', ctx({ items: sampleItems })).items.length, 0); // other days
  // an item with no school (camp, Star) shows on a Shrewsbury-only view too; a Worcester one doesn't
  const shr = { ...school, code: 'shrewsbury', name: 'Shrewsbury' };
  const shrDay = buildDay('2027-01-15', { ...ctx({ items: sampleItems }), schools: [shr] });
  assert.deepEqual(shrDay.items.map((i) => i.id), ['se1', 'camp:1']);
  assert.deepEqual(shrDay.signups.map((i) => i.child), ['Zoe T.']);
  assert.equal(shrDay.deadlines.length, 1);
  // Both: everything
  const both = buildDay('2027-01-15', { ...ctx({ items: sampleItems }), schools: [school, shr] });
  assert.equal(both.signupCount, 3);
  assert.equal(both.items.length, 6);
  assert.equal(buildDay('2027-01-15', ctx()).signupCount, 0); // none loaded → none
});

group('Show menu: the new kinds hide their items (v0.645)', () => {
  const day = buildDay('2027-01-15', ctx({ items: sampleItems }));
  const ids = (d) => d.items.map((i) => i.id);
  assert.deepEqual(ids(applyShow(day, new Set())), ids(day));
  assert.deepEqual(ids(applyShow(day, new Set(['testing']))), ['bb1', 'camp:1']); // Color belt + Star, events and private tests
  assert.deepEqual(ids(applyShow(day, new Set(['blackBelt']))), ['se1', 'camp:1', 'cb1', 'sp1', 'cp1']);
  assert.deepEqual(ids(applyShow(day, new Set(['camps']))), ['se1', 'bb1', 'cb1', 'sp1', 'cp1']);
  assert.equal(applyShow(day, new Set(['deadlines'])).deadlines.length, 0);
  const noSign = applyShow(day, new Set(['signups']));
  assert.equal(noSign.signupCount, 0);
  assert.equal(noSign.signups.length, 0);
  assert.equal(noSign.items.length, 6); // hiding sign-ups hides nothing else
  assert.equal(day.signupCount, 2); // the original day is never changed
});

group('words: the spoken day summary names the items and respects hiding (v0.645)', () => {
  const day = buildDay('2027-01-15', ctx({ items: sampleItems }));
  const said = T.dayLabel('2027-01-15', applyShow(day, new Set()), false);
  for (const part of ['Fall camp', 'Private · Ava N.', 'Private Star · Leo N.', 'Black Belt · Physical day', 'Early price ends · Fall camp', '2 new sign-ups']) assert.ok(said.includes(part), part);
  const quiet = T.dayLabel('2027-01-15', applyShow(day, new Set(['testing', 'blackBelt', 'camps', 'deadlines', 'signups'])), false);
  for (const part of ['Fall camp', 'Private', 'Black Belt', 'sign-up']) assert.ok(!quiet.includes(part), part);
  assert.equal(T.newSignups(1), '1 new sign-up');
  assert.equal(T.openItem(sampleItems[0]), 'Open Fall camp in Camps');
});
group('mock calendar_items: the contract\'s shape and rules (CONTRACT-0045)', () => {
  const store = { current: null };
  const backend = createCalendarBackend({ loadStore: () => store.current, saveStore: (s) => { store.current = s; }, newId: randomUUID, getSchedule: () => ({ versions: [], slots: [] }), getClasses: () => [], today: () => '2026-11-06' });
  const ctxOk = { signedIn: true, hasDataAccess: true, isAdmin: false, actorName: 'Staff' };
  const call = (args, c = ctxOk) => backend.rpc('calendar_items', args, c);
  const res = call({ p_from: '2026-11-01', p_to: '2026-11-30' });
  assert.equal(res.data.status, 'ok'); // staff may read (no admin needed)
  const keys = ['kind', 'id', 'date', 'start', 'end', 'location_code', 'title', 'child', 'what', 'place', 'opens', 'ref_id', 'event_id'];
  for (const it of res.data.items) assert.deepEqual(Object.keys(it).sort(), [...keys].sort());
  assert.ok(new Set(res.data.items.map((i) => i.id)).size === res.data.items.length); // ids unique in one answer
  assert.ok(res.data.items.every((i) => i.date >= '2026-11-01' && i.date <= '2026-11-30'));
  const sorted = [...res.data.items].sort((a, b) => (a.date + (a.start ?? '')) < (b.date + (b.start ?? '')) ? -1 : (a.date + (a.start ?? '')) > (b.date + (b.start ?? '')) ? 1 : 0);
  assert.deepEqual(res.data.items.map((i) => i.date), sorted.map((i) => i.date));
  assert.ok(res.data.items.every((i) => i.child === null || /^[A-Z][a-z]+( [A-Z]\.)?$/.test(i.child))); // "Ava N." only
  assert.equal(call({ p_from: '2026-11-10', p_to: '2026-11-10' }).data.items.every((i) => i.date === '2026-11-10'), true);
  assert.equal(call({ p_from: '2026-11-01', p_to: '2027-01-02' }).data.status, 'ok'); // 63 days
  assert.equal(call({ p_from: '2026-11-01', p_to: '2027-01-03' }).data.status, 'invalid'); // 64 days
  assert.equal(call({ p_from: '2026-11-05', p_to: '2026-11-01' }).data.status, 'invalid');
  assert.equal(call({ p_from: '2026-11-01', p_to: '2026-11-30' }, { ...ctxOk, hasDataAccess: false }).data.status, 'no_access');
  assert.ok(call({ p_from: '2026-11-01', p_to: '2026-11-30' }, { ...ctxOk, signedIn: false }).error); // signed out: refused
  // an armed read failure hits only the read, once
  backend.failNextItems();
  assert.ok(call({ p_from: '2026-11-01', p_to: '2026-11-30' }).error);
  assert.equal(call({ p_from: '2026-11-01', p_to: '2026-11-30' }).data.status, 'ok');
  // reading writes nothing
  assert.equal(store.current, null);
});

group('api: the database answer becomes camelCase items (v0.645)', () => {
  const row = { kind: 'star_private', id: 'c1', date: '2026-11-06', start: '15:00', end: null, location_code: null, title: 'Private', child: 'Leo N.', what: null, place: null, opens: 'star_private', ref_id: 'c1', event_id: 'e1' };
  assert.deepEqual(toItem(row), { kind: 'star_private', id: 'c1', date: '2026-11-06', start: 900, end: null, locationCode: null, title: 'Private', child: 'Leo N.', what: null, place: null, opens: 'star_private', refId: 'c1', eventId: 'e1' });
  assert.equal(toItem({ ...row, start: null }).end, null);
  assert.equal(toItem({ ...row, kind: 'something_new' }), null); // a kind from a later version: left out, never breaks
  assert.equal(toItem({ ...row, start: 'nonsense' }), null);
  assert.equal(toItem({ ...row, ref_id: null }), null);
  // the app never builds a child's name: "Ava N." arrives made and is shown as it is
  assert.equal(toItem({ ...row, child: 'Ava N.' }).child, 'Ava N.');
  assert.equal(Object.keys(toItem(row)).some((k) => /dob|birth|last|phone|email/i.test(k)), false);
});

group('Calendar → Prospects hand-over: once, fresh, cleared at sign-out (v0.615)', () => {
  requestOpenProspect('p1', 1000);
  assert.equal(takeOpenProspect(2000), 'p1');
  assert.equal(takeOpenProspect(2000), null); // used once
  requestOpenProspect('p2', 1000);
  assert.equal(takeOpenProspect(1000 + 61000), null); // older than a minute: dropped
  requestOpenProspect('p3', 1000);
  clearOpenProspect(); // sign-out
  assert.equal(takeOpenProspect(1500), null);
  requestOpenProspect(42, 1000);
  assert.equal(takeOpenProspect(1500), null); // only real ids
});

console.log(`${groups} groups of checks ran.`);
console.log('ALL CALENDAR LIB CHECKS PASSED');
