// checks.mjs — plain checks for the Schedule's rule files and its preview database.
// Why it exists: the rules (times, current / planned / past schedules, colors) and the fake
// database must agree with migration 0005. These checks run in Node without a browser:
//   node src/lib/schedule/checks.mjs
// Prints "ALL SCHEDULE LIB CHECKS PASSED", or stops at the first failed check.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { findOverlaps, formatRange, formatTime, hourLabel, hourRange, parseTime, timeProblem, toTimeText } from './time.js';
import { addDays, classifyVersions, copySourceFor, currentOf, endsBefore, formatDate, plannedOf, weekdayOf } from './versions.js';
import { CLASS_COLORS, colorOf, COLOR_KEYS } from './colors.js';
import { createScheduleBackend } from '../mockSchedule.js';

let groups = 0;
function group(name, fn) {
  fn();
  groups += 1;
  console.log(`ok  ${name}`);
}

group('time: parse and format', () => {
  assert.equal(parseTime('16:30'), 990);
  assert.equal(parseTime('16:30:00'), 990);
  assert.equal(parseTime('4:05'), 245);
  assert.equal(parseTime('16:30:30'), null); // seconds are refused
  assert.equal(parseTime('24:00'), null);
  assert.equal(parseTime(''), null);
  assert.equal(toTimeText(990), '16:30');
  assert.equal(formatTime(990), '4:30');
  assert.equal(formatTime(720, true), '12:00 pm');
  assert.equal(formatTime(570, true), '9:30 am');
  assert.equal(formatRange(960, 1005), '4:00–4:45');
  assert.equal(hourLabel(540), '9 am');
  assert.equal(hourLabel(720), '12 pm');
});

group('time: rules match schedule_time_is_valid', () => {
  assert.equal(timeProblem(960, 1005), null);
  assert.equal(timeProblem(null, 1005), 'missing');
  assert.equal(timeProblem(963, 1005), 'step');
  assert.equal(timeProblem(1005, 960), 'order');
  assert.equal(timeProblem(960, 960), 'order');
  assert.equal(timeProblem(960, 970), 'short');
  assert.equal(timeProblem(960, 975), null); // exactly 15 minutes
  assert.equal(timeProblem(600, 840), null); // exactly 4 hours
  assert.equal(timeProblem(600, 845), 'long');
});

group('time: overlaps and the hour range', () => {
  const slots = [
    { id: 'a', weekday: 1, start: 960, end: 1005 },
    { id: 'b', weekday: 1, start: 1005, end: 1050 },
    { id: 'c', weekday: 3, start: 960, end: 1005 },
  ];
  assert.deepEqual(findOverlaps(slots, [1], 990, 1020).map((s) => s.id), ['a', 'b']);
  assert.deepEqual(findOverlaps(slots, [1], 1005, 1050, 'b').map((s) => s.id), []); // back-to-back is fine
  assert.deepEqual(findOverlaps(slots, [1, 3], 970, 980).map((s) => s.id), ['a', 'c']);
  assert.deepEqual(hourRange(slots), { from: 960, to: 1080 });
  assert.deepEqual(hourRange([{ start: 570, end: 615 }, { start: 1140, end: 1200 }]), { from: 540, to: 1200 });
  assert.deepEqual(hourRange([]), { from: 960, to: 1200 });
});

group('versions: current / planned / past', () => {
  const list = classifyVersions(
    [
      { id: 'w', startsOn: '2027-01-04' },
      { id: 'old', startsOn: '2026-01-05' },
      { id: 'now', startsOn: '2026-09-02' },
      { id: 's', startsOn: '2027-06-21' },
    ],
    '2026-10-17',
  );
  assert.deepEqual(list.map((v) => [v.id, v.state]), [['old', 'past'], ['now', 'current'], ['w', 'planned'], ['s', 'planned']]);
  assert.equal(currentOf(list).id, 'now');
  assert.deepEqual(plannedOf(list).map((v) => v.id), ['w', 's']);
  assert.equal(copySourceFor(list, '2027-03-01').id, 'w');
  assert.equal(copySourceFor(list, '2026-12-01').id, 'now');
  assert.equal(endsBefore(list, list[1]), '2027-01-04');
  assert.equal(endsBefore(list, list[3]), null);
  // starting today = current, not planned
  assert.equal(classifyVersions([{ id: 'x', startsOn: '2026-10-17' }], '2026-10-17')[0].state, 'current');
  assert.equal(currentOf(classifyVersions([{ id: 'p', startsOn: '2027-01-01' }], '2026-10-17')), null);
});

group('versions: dates', () => {
  assert.equal(addDays('2026-12-30', 5), '2027-01-04');
  assert.equal(weekdayOf('2027-01-04'), 1); // a Monday
  assert.equal(weekdayOf('2027-01-03'), 7); // a Sunday
  assert.equal(formatDate('2027-01-04'), 'Mon, Jan 4, 2027');
  assert.equal(formatDate('2027-01-04', { weekday: false, year: false }), 'Jan 4');
});

group('colors: 8 soft colors, never red', () => {
  assert.equal(CLASS_COLORS.length, 8);
  assert.ok(!COLOR_KEYS.includes('red'));
  assert.equal(colorOf('nonsense').key, 'gray');
  assert.equal(colorOf('teal').key, 'teal');
});

// ----- The preview database follows migration 0005 -----
const TODAY = '2026-10-17';
const classes = [
  { id: randomUUID(), location_code: 'worcester', name: 'White', position: 0 },
  { id: randomUUID(), location_code: 'worcester', name: 'Group A', position: 1 },
  { id: randomUUID(), location_code: 'shrewsbury', name: 'White', position: 0 },
];
const [W1, W2, S1] = classes.map((c) => c.id);
let store = { schema: 2, versions: [], slots: [], colors: [] };
const backend = createScheduleBackend({
  loadStore: () => store,
  saveStore: (s) => {
    store = JSON.parse(JSON.stringify(s));
  },
  newId: randomUUID,
  getClasses: () => classes,
  today: () => TODAY,
});
const admin = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Admin' };
const staff = { signedIn: true, hasDataAccess: true, isAdmin: false, actorName: 'Desk' };
const locked = { signedIn: true, hasDataAccess: false, isAdmin: true, actorName: 'Admin' };
const call = (name, args, ctx = admin) => backend.rpc(name, args, ctx).data;
const add = (args, ctx) =>
  call('schedule_add_slots', { p_location_code: 'worcester', p_version_id: null, p_class_ids: [W1], p_weekdays: [1, 3], p_starts_at: '16:00', p_ends_at: '16:45', ...args }, ctx);

let currentId;
let slotId;
group('mock: who may do what', () => {
  assert.equal(add({}, locked).status, 'no_access');
  assert.equal(add({}, staff).status, 'not_allowed');
  assert.equal(backend.rpc('schedule_add_slots', {}, { signedIn: false }).error.code, '42501');
  assert.deepEqual(backend.select('schedule_slots', 'id', [], [], locked).data, []);
  assert.equal(backend.select('schedule_slots', '*', [], [], admin).error.code, '42501');
  assert.equal(backend.rpc('schedule_today', {}, staff).data, TODAY);
});

group('mock: first schedule, input rules, overlaps', () => {
  const r = add({});
  assert.equal(r.status, 'ok');
  currentId = r.version_id;
  slotId = r.slots[0].id;
  assert.equal(r.slots.length, 2);
  assert.equal(store.versions[0].starts_on, TODAY);
  assert.equal(add({}).status, 'stale'); // NULL version once one exists
  for (const bad of [
    { p_starts_at: '16:00', p_ends_at: '16:00' },
    { p_starts_at: '16:03' },
    { p_ends_at: '16:10' },
    { p_starts_at: '10:00', p_ends_at: '14:05' },
    { p_starts_at: '16:00:30' },
    { p_weekdays: [] },
    { p_weekdays: [8] },
    { p_weekdays: [2, 2] },
    { p_class_ids: [S1] },
    { p_class_ids: [] },
    { p_class_ids: [W1, W1] },
    { p_class_ids: [W1, S1] },
  ]) {
    assert.equal(add({ p_version_id: currentId, ...bad }).status, 'invalid', JSON.stringify(bad));
  }
  assert.equal(add({ p_version_id: currentId, p_class_ids: [randomUUID()] }).status, 'stale');
  const o = add({ p_version_id: currentId, p_class_ids: [W2], p_weekdays: [1], p_starts_at: '16:30', p_ends_at: '17:15' });
  assert.equal(o.status, 'ok');
  assert.equal(o.overlaps.length, 1);
  assert.equal(o.overlaps[0].class_name, 'White');
});

group('mock: edit, stale, remove', () => {
  assert.equal(call('schedule_update_slot', { p_slot_id: slotId, p_expected_version: 9, p_class_ids: [W1], p_weekday: 1, p_starts_at: '16:00', p_ends_at: '16:50' }).status, 'stale');
  const same = call('schedule_update_slot', { p_slot_id: slotId, p_expected_version: 1, p_class_ids: [W1], p_weekday: 1, p_starts_at: '16:00', p_ends_at: '16:45' });
  assert.equal(same.version, 1); // unchanged → same version
  const changed = call('schedule_update_slot', { p_slot_id: slotId, p_expected_version: 1, p_class_ids: [W2], p_weekday: 1, p_starts_at: '16:00', p_ends_at: '16:50' });
  assert.equal(changed.version, 2);
  const removed = call('schedule_remove_slot', { p_slot_id: slotId, p_expected_version: 2 });
  assert.equal(removed.status, 'ok');
  assert.deepEqual(removed.removed, { version_id: currentId, class_ids: [W2], weekday: 1, starts_at: '16:00', ends_at: '16:50' });
  assert.equal(call('schedule_remove_slot', { p_slot_id: slotId, p_expected_version: 2 }).status, 'not_found');
});

group('mock: planning, moving and deleting schedules', () => {
  const count = store.slots.filter((s) => s.version_id === currentId).length;
  assert.equal(call('schedule_plan_version', { p_location_code: 'worcester', p_name: null, p_starts_on: TODAY, p_copy: true }).status, 'invalid');
  const plan = call('schedule_plan_version', { p_location_code: 'worcester', p_name: '  Winter  ', p_starts_on: '2027-01-04', p_copy: true });
  assert.equal(plan.status, 'ok');
  assert.equal(plan.slot_count, count);
  assert.equal(plan.copied_from, currentId);
  assert.equal(store.versions.find((v) => v.id === plan.id).name, 'Winter');
  assert.equal(call('schedule_plan_version', { p_location_code: 'worcester', p_name: null, p_starts_on: '2027-01-04', p_copy: false }).status, 'duplicate_date');
  assert.equal(call('schedule_update_version', { p_version_id: currentId, p_expected_version: 1, p_name: null, p_starts_on: '2027-02-01' }).status, 'not_allowed');
  const moved = call('schedule_update_version', { p_version_id: plan.id, p_expected_version: 1, p_name: '', p_starts_on: '2027-01-11' });
  assert.equal(moved.version, 2);
  assert.equal(store.versions.find((v) => v.id === plan.id).name, null);
  assert.equal(call('schedule_delete_version', { p_version_id: plan.id, p_expected_version: 2, p_expected_slot_count: count + 1 }).status, 'stale');
  assert.equal(call('schedule_delete_version', { p_version_id: plan.id, p_expected_version: 2, p_expected_slot_count: count }).removed_slot_count, count);
  assert.equal(call('schedule_delete_version', { p_version_id: currentId, p_expected_version: 1, p_expected_slot_count: count }).status, 'not_allowed');
});

group('mock: past schedules are read-only', () => {
  const pastId = randomUUID();
  store.versions.push({ id: pastId, location_code: 'worcester', name: null, starts_on: '2026-01-05', version: 1 });
  store.slots.push({ id: randomUUID(), version_id: pastId, location_code: 'worcester', class_ids: [W1], weekday: 4, starts_at: '18:00:00', ends_at: '18:45:00', version: 1 });
  const pastSlot = store.slots[store.slots.length - 1].id;
  assert.equal(add({ p_version_id: pastId }).status, 'not_allowed');
  assert.equal(call('schedule_remove_slot', { p_slot_id: pastSlot, p_expected_version: 1 }).status, 'not_allowed');
});

group('mock: combined classes (v0.88)', () => {
  const r = add({ p_version_id: currentId, p_class_ids: [W2, W1], p_weekdays: [2], p_starts_at: '07:00', p_ends_at: '07:45' });
  assert.equal(r.status, 'ok');
  const id = r.slots[0].id;
  const rows = backend.select('schedule_slot_classes', 'slot_id, class_id, position', [{ col: 'slot_id', value: id }], [], admin).data;
  assert.deepEqual(rows.map((x) => x.class_id), [W2, W1]);
  const o = add({ p_version_id: currentId, p_class_ids: [W1], p_weekdays: [2], p_starts_at: '07:30', p_ends_at: '08:00' });
  assert.equal(o.overlaps[0].class_name, 'Group A + White');
  const changed = call('schedule_update_slot', { p_slot_id: id, p_expected_version: 1, p_class_ids: [W1], p_weekday: 2, p_starts_at: '07:00', p_ends_at: '07:45' });
  assert.equal(changed.version, 2); // only the classes changed: still a new version
  assert.equal(call('schedule_update_slot', { p_slot_id: id, p_expected_version: 1, p_class_ids: [W1, W2], p_weekday: 2, p_starts_at: '07:00', p_ends_at: '07:45' }).status, 'stale');
  assert.equal(backend.select('schedule_slots', 'class_ids', [], [], admin).error.code, '42501'); // not readable
});

group('mock: colors, and a deleted class takes its slots with it', () => {
  assert.equal(call('schedule_set_class_color', { p_class_id: W1, p_color: 'red' }).status, 'invalid');
  assert.equal(call('schedule_set_class_color', { p_class_id: W1, p_color: 'teal' }).version, 1);
  assert.equal(call('schedule_set_class_color', { p_class_id: W1, p_color: 'teal' }).version, 1);
  assert.equal(call('schedule_set_class_color', { p_class_id: W1, p_color: 'purple' }).version, 2);
  const before = backend.select('schedule_slots', 'id', [], [], admin).data.length;
  classes.splice(0, 1); // "delete" White in Testing
  const rows = backend.select('schedule_slot_classes', 'slot_id, class_id', [], [], admin).data;
  assert.ok(rows.every((r) => r.class_id !== W1));
  // slots that were ONLY White are gone; the others keep their other classes
  const slots = backend.select('schedule_slots', 'id', [], [], admin).data;
  assert.ok(slots.length < before);
  assert.ok(slots.every((s) => rows.some((r) => r.slot_id === s.id)));
  assert.deepEqual(backend.select('schedule_class_colors', 'class_id', [], [], admin).data, []);
});

console.log(`${groups} groups of checks ran.`);
console.log('ALL SCHEDULE LIB CHECKS PASSED');
