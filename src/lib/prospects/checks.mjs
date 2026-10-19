// checks.mjs — plain checks for the Prospects preview database (mockProspects.js, inside
// mockForms.js). Why it exists: the fake database must answer like migration 0010 — prospects
// made from sign-ups, New ↔ Booked from bookings, the list without contact details, check in and
// "did they come?", booking from the panel with the shared limit, each school's statuses, deleting
// and the 2-year clean-up. Runs in Node without a browser:
//   node src/lib/prospects/checks.mjs
// Prints "ALL PROSPECTS LIB CHECKS PASSED", or stops at the first failed check.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { template } from '../forms/fields.js';
import { createFormsBackend } from '../mockForms.js';

let groups = 0;
function group(name, fn) {
  fn();
  groups += 1;
  console.log(`ok  ${name}`);
}

// Monday 2027-01-11, 8:00 am in Massachusetts. White runs Mon/Wed 4:00 pm.
const TODAY = '2027-01-11';
const NOW = Date.parse('2027-01-11T13:00:00Z');
const white = randomUUID();
const classes = [{ id: white, location_code: 'worcester', name: 'White' }];
const vId = randomUUID();
const slot = (weekday, start, end) => ({ id: randomUUID(), version_id: vId, location_code: 'worcester', weekday, starts_at: `${start}:00`, ends_at: `${end}:00`, class_ids: [white] });
const schedule = { versions: [{ id: vId, location_code: 'worcester', starts_on: '2026-09-07' }], slots: [slot(1, '16:00', '16:45'), slot(3, '16:00', '16:45'), slot(1, '06:00', '06:30')] };
const calendar = { closures: [], closureClasses: [] };
const SIG = `data:image/png;base64,${'A'.repeat(300)}`;

let clock = NOW;
let store = { schema: 2, forms: [], offers: [], limits: [], submissions: [], bookings: [], kioskTokens: [], signatureViews: [], statuses: [], prospects: [], notes: [], activity: [], opens: [] };
const backend = createFormsBackend({
  loadStore: () => store,
  saveStore: (s) => { store = JSON.parse(JSON.stringify(s)); },
  now: () => clock,
  newId: randomUUID,
  getSchedule: () => schedule,
  getCalendar: () => calendar,
  getClasses: () => classes,
  today: () => TODAY,
});
const admin = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Admin' };
const desk = { ...admin, isAdmin: false, actorName: 'Front Desk' };
const call = (name, args, ctx = desk) => backend.rpc(name, args, ctx).data;
const ver = (id) => store.prospects.find((p) => p.id === id).version;
const statusId = (builtin, code = 'worcester') => store.statuses.find((s) => s.location_code === code && s.builtin === builtin).id;

// a Live free-class form with 2 spots a time
const made = call('forms_create', { p_location_code: 'worcester', p_kind: 'free_class', p_name: 'Free class', p_slug: 'free-class' }, admin);
const draft = template('free_class').map((f) => (f.type === 'waiver' ? { ...f, text: 'Our wording.' } : f));
let v = call('forms_save_draft', { p_form_id: made.id, p_expected_version: made.version, p_name: 'Free class', p_slug: 'free-class', p_draft: draft,
  p_settings: { thank_you: '', alert_email: null, confirm_email: false, add_to_calendar: false } }, admin).version;
v = call('forms_set_booking', { p_form_id: made.id, p_expected_version: v, p_offers: [{ class_id: white, default_limit: 2, days_ahead: 14, min_hours_ahead: 0 }], p_limits: [] }, admin).version;
call('forms_publish', { p_form_id: made.id, p_expected_version: v }, admin);
const formId = made.id;
const send = (children, bookings = []) => call('forms_staff_submit', {
  p_form_id: formId, p_submission_key: randomUUID(), p_published_version: 1,
  p_answers: { parent_name: 'Kim Ruiz', parent_phone: '(508) 555-7731', parent_email: 'kim@example.com', waiver: true },
  p_children: children, p_bookings: bookings, p_signature: SIG,
});

let ava;
let max;
group('a sign-up makes one prospect per child (Booked / New)', () => {
  const r = send([{ first_name: 'Ava', age: 10 }, { first_name: 'Max', age: 7 }], [{ child: 0, class_id: white, date: '2027-01-13', starts_at: '16:00' }]);
  assert.equal(r.status, 'ok');
  ava = store.prospects.find((p) => p.child_first_name === 'Ava');
  max = store.prospects.find((p) => p.child_first_name === 'Max');
  assert.equal(ava.status_id, statusId('booked'));
  assert.equal(max.status_id, statusId('new'));
  assert.equal(store.statuses.filter((s) => s.location_code === 'worcester').length, 7);
});

group('the list has list columns only; search; badge per person', () => {
  const l = call('prospects_list', { p_location_code: 'worcester' });
  assert.equal(l.status, 'ok');
  assert.equal(l.prospects.length, 2);
  assert.ok(!JSON.stringify(l.prospects).includes('555-7731') && !JSON.stringify(l.prospects).includes('kim@'));
  assert.deepEqual(call('prospects_search', { p_location_code: 'worcester', p_text: '7731' }).ids.sort(), [ava.id, max.id].sort());
  assert.deepEqual(call('prospects_search', { p_location_code: 'worcester', p_text: '77' }).ids, []);
  assert.equal(call('prospects_search', { p_location_code: 'worcester', p_text: 'x' }).status, 'invalid');
  assert.equal(call('prospects_badge', { p_location_code: 'worcester' }).count, 2);
  call('prospects_mark_opened', { p_prospect_id: ava.id });
  assert.equal(call('prospects_badge', { p_location_code: 'worcester' }).count, 1);
  assert.equal(call('prospects_badge', { p_location_code: 'worcester' }, admin).count, 2);
  const g = call('prospects_get', { p_prospect_id: ava.id });
  assert.equal(g.prospect.parent_phone, '(508) 555-7731');
  assert.equal(g.prospect.siblings.length, 1);
});

group('status, Joined date, notes, follow-up', () => {
  const contacted = store.statuses.find((s) => s.location_code === 'worcester' && s.name === 'Contacted').id;
  assert.equal(call('prospects_set_status', { p_prospect_id: max.id, p_expected_version: 99, p_status_id: contacted, p_joined_on: null }).status, 'stale');
  assert.equal(call('prospects_set_status', { p_prospect_id: max.id, p_expected_version: ver(max.id), p_status_id: statusId('joined'), p_joined_on: null }).status, 'invalid');
  assert.equal(call('prospects_set_status', { p_prospect_id: max.id, p_expected_version: ver(max.id), p_status_id: contacted, p_joined_on: TODAY }).status, 'invalid');
  assert.equal(call('prospects_set_status', { p_prospect_id: max.id, p_expected_version: ver(max.id), p_status_id: contacted, p_joined_on: null }).status, 'ok');
  assert.equal(call('prospects_add_note', { p_prospect_id: max.id, p_body: ' ', p_set_follow_up: false, p_follow_up_on: null }).status, 'invalid');
  assert.equal(call('prospects_add_note', { p_prospect_id: max.id, p_body: 'Left voicemail', p_set_follow_up: true, p_follow_up_on: '2027-01-14' }).status, 'ok');
  assert.equal(store.prospects.find((p) => p.id === max.id).follow_up_on, '2027-01-14');
  assert.equal(call('prospects_get', { p_prospect_id: max.id }).prospect.notes[0].created_by_name, 'Front Desk');
});

group('free classes from the panel share the limit', () => {
  const t = call('prospects_open_times', { p_prospect_id: max.id, p_from: '2027-01-13', p_to: '2027-01-13' });
  assert.equal(t.times.length, 1);
  assert.equal(t.times[0].spots_left, 1);
  assert.equal(call('prospects_book_time', { p_prospect_id: max.id, p_expected_version: ver(max.id), p_form_id: formId, p_class_id: white, p_date: '2027-01-13', p_starts_at: '16:00' }).status, 'ok');
  assert.equal(store.prospects.find((p) => p.id === max.id).status_id, store.statuses.find((s) => s.name === 'Contacted' && s.location_code === 'worcester').id);
  send([{ first_name: 'Zoe', age: 8 }]);
  const zoe = store.prospects.find((p) => p.child_first_name === 'Zoe');
  assert.equal(call('prospects_book_time', { p_prospect_id: zoe.id, p_expected_version: ver(zoe.id), p_form_id: formId, p_class_id: white, p_date: '2027-01-13', p_starts_at: '16:00' }).status, 'time_taken');
  const c = call('prospects_cancel_time', { p_prospect_id: ava.id, p_expected_version: ver(ava.id) });
  assert.equal(c.status, 'ok');
  assert.equal(store.prospects.find((p) => p.id === ava.id).status_id, statusId('new'));
  assert.equal(call('prospects_book_time', { p_prospect_id: zoe.id, p_expected_version: ver(zoe.id), p_form_id: formId, p_class_id: white, p_date: '2027-01-13', p_starts_at: '16:00' }).status, 'ok');
  assert.equal(store.prospects.find((p) => p.id === zoe.id).status_id, statusId('booked'));
  assert.equal(store.bookings.filter((b) => b.submission_id === zoe.submission_id).length, 1);
});

group('check in, Undo, did they come?', () => {
  // Max's class is on Wed: no check-in on Monday
  assert.equal(call('prospects_check_in', { p_prospect_id: max.id, p_expected_version: ver(max.id), p_came: true, p_after_class: false }).status, 'not_allowed');
  // book Max into today's 6:00 am class (already over at 8:00): he can be asked "did he come?"
  clock = Date.parse('2027-01-11T10:00:00Z'); // 5:00 am — the 6:00 class is still ahead
  assert.equal(call('prospects_book_time', { p_prospect_id: max.id, p_expected_version: ver(max.id), p_form_id: formId, p_class_id: white, p_date: TODAY, p_starts_at: '06:00' }).status, 'ok');
  clock = NOW;
  const l = call('prospects_list', { p_location_code: 'worcester' });
  assert.equal(l.prospects.find((p) => p.id === max.id).ask_came, true);
  const r = call('prospects_check_in', { p_prospect_id: max.id, p_expected_version: ver(max.id), p_came: false, p_after_class: true });
  assert.equal(r.status, 'ok');
  assert.equal(store.prospects.find((p) => p.id === max.id).status_id, statusId('no_show'));
  assert.equal(store.prospects.find((p) => p.id === max.id).follow_up_on, '2027-01-12');
  const u = call('prospects_undo_check_in', { p_prospect_id: max.id, p_expected_version: ver(max.id), p_previous_status_id: r.previous_status_id, p_previous_follow_up_on: r.previous_follow_up_on });
  assert.equal(u.status, 'ok');
  assert.equal(store.prospects.find((p) => p.id === max.id).follow_up_on, '2027-01-14');
  const ci = call('prospects_check_in', { p_prospect_id: max.id, p_expected_version: ver(max.id), p_came: true, p_after_class: false });
  assert.equal(ci.status, 'ok');
  assert.equal(store.prospects.find((p) => p.id === max.id).status_id, statusId('came'));
});

group('statuses per school; only admins delete', () => {
  const add = call('prospect_statuses_add', { p_location_code: 'worcester', p_name: 'Left voicemail', p_kind: 'stage', p_color: 'pink' });
  assert.equal(add.status, 'ok');
  assert.equal(call('prospect_statuses_add', { p_location_code: 'worcester', p_name: 'left voicemail', p_kind: 'stage', p_color: 'pink' }).status, 'duplicate_name');
  assert.equal(call('prospect_statuses_add', { p_location_code: 'worcester', p_name: 'Red', p_kind: 'stage', p_color: 'red' }).status, 'invalid');
  assert.equal(call('prospect_statuses_delete', { p_status_id: add.id, p_expected_version: 1, p_expected_count: 0, p_move_to_id: null }).status, 'not_allowed');
  assert.equal(call('prospect_statuses_delete', { p_status_id: add.id, p_expected_version: 1, p_expected_count: 0, p_move_to_id: null }, admin).status, 'ok');
  assert.equal(call('prospect_statuses_delete', { p_status_id: statusId('new'), p_expected_version: 1, p_expected_count: 0, p_move_to_id: null }, admin).status, 'not_allowed');
});

group('deleting (admins; the sign-up goes with its last child) and the 2-year clean-up', () => {
  assert.equal(call('prospects_delete', { p_prospect_id: max.id, p_expected_version: ver(max.id) }).status, 'not_allowed');
  const d1 = call('prospects_delete', { p_prospect_id: max.id, p_expected_version: ver(max.id) }, admin);
  assert.equal(d1.family_removed, false);
  assert.ok(store.submissions.some((s) => s.id === ava.submission_id));
  const d2 = call('prospects_delete', { p_prospect_id: ava.id, p_expected_version: ver(ava.id) }, admin);
  assert.equal(d2.family_removed, true);
  assert.ok(!store.submissions.some((s) => s.id === ava.submission_id));
  // Zoe's family goes quiet for 25 months -> the next list removes it
  for (const p of store.prospects) p.last_activity_at = '2024-12-01T00:00:00.000Z';
  call('prospects_list', { p_location_code: 'worcester' });
  assert.equal(store.prospects.length, 0);
});

console.log(`ALL PROSPECTS LIB CHECKS PASSED (${groups} groups)`);
