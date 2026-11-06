// checks.mjs — plain checks for the Prospects preview database (mockProspects.js, inside
// mockForms.js). Why it exists: the fake database must answer like migration 0012 — prospects
// made from sign-ups, New ↔ Booked from bookings, the list without contact details, check in and
// "did they come?", booking from the panel with the shared limit, each school's statuses, deleting
// and the 2-year clean-up — and like 0036: each child's last name and date of birth (the list
// carries the last name only). Also the profile's small rules (child.js, followUps.js): "Ava N.",
// the age from the date of birth, the address line, how long the signature picture is kept; and
// how a long visitor sheet fits its paper (sheetPlan.js, v0.641).
// Runs in Node without a browser:
//   node src/lib/prospects/checks.mjs
// Prints "ALL PROSPECTS LIB CHECKS PASSED", or stops at the first failed check.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { template } from '../forms/fields.js';
import { createFormsBackend } from '../mockForms.js';
import { addressFieldOf, addressLine, ageOn, answerFieldsOf, childAge, childFullName, isWideAnswer, questionLead, signatureKeptUntil, waiverFieldOf } from './child.js';
import { childInitial } from './followUps.js';
import { LIMIT_PX, answersThatFit, planSheet } from './sheetPlan.js';

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
// schema 3: the store's version since migration 0036 (mockForms.js FORMS_STORE_SCHEMA)
let store = { schema: 3, forms: [], offers: [], limits: [], submissions: [], bookings: [], kioskTokens: [], signatureViews: [], statuses: [], prospects: [], notes: [], activity: [], opens: [] };
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
// Since 0036 the Free class template asks the home address (required): answer it when the form has it.
const ADDRESS_FIELD = addressFieldOf(draft);
const ADDRESS = ADDRESS_FIELD ? { [ADDRESS_FIELD.id]: { street: '1 Main Street', city: 'Worcester', state: 'MA', zip: '01602' } } : {};
const send = (children, bookings = []) => call('forms_staff_submit', {
  p_form_id: formId, p_submission_key: randomUUID(), p_published_version: 1,
  p_answers: { parent_name: 'Kim Ruiz', parent_phone: '(508) 555-7731', parent_email: 'kim@example.com', waiver: true, ...ADDRESS },
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
  // never an age or a date of birth in the list (v0.245, rule 5); an older child has no last name
  assert.ok(l.prospects.every((p) => !('child_age' in p) && !('child_dob' in p)));
  assert.ok(l.prospects.every((p) => p.child_last_name === null));
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

group('Not interested families go after 6 months (migration 0021, rulebook v0.611)', () => {
  const famOf = (r) => store.prospects.filter((p) => p.submission_id === r.id);
  const quiet = (r, iso, builtin = null, index = null) => {
    for (const p of famOf(r)) {
      if (index !== null && p.child_index !== index) continue;
      p.last_activity_at = iso;
      if (builtin) p.status_id = statusId(builtin);
    }
  };
  const sevenMonths = '2026-06-01T00:00:00.000Z'; // NOW is 2027-01-11
  const fiveMonths = '2026-08-15T00:00:00.000Z';
  const niOld = send([{ first_name: 'Nina', age: 8 }]);
  const niRecent = send([{ first_name: 'Remy', age: 7 }]);
  const mixed = send([{ first_name: 'Mona', age: 9 }, { first_name: 'Milo', age: 6 }]);
  const newMid = send([{ first_name: 'Nate', age: 8 }]);
  quiet(niOld, sevenMonths, 'not_interested');
  quiet(niRecent, fiveMonths, 'not_interested');
  quiet(mixed, sevenMonths, 'not_interested', 0);
  quiet(mixed, sevenMonths, null, 1); // the brother is still New
  quiet(newMid, sevenMonths);
  call('prospects_list', { p_location_code: 'worcester' });
  const kept = (r) => store.submissions.some((s) => s.id === r.id);
  assert.equal(kept(niOld), false, 'all Not interested, quiet 7 months: deleted');
  assert.equal(kept(niRecent), true, 'Not interested 5 months: kept');
  assert.equal(kept(mixed), true, 'one child not Not interested: the 2 years apply');
  assert.equal(kept(newMid), true, 'New, quiet 7 months: kept (2 years)');
});

group("each child's last name and date of birth (migration 0036, rulebook v0.634 / v0.637)", () => {
  const r = send([{ first_name: 'Ivy', last_name: 'Chen', dob: '2019-03-04' }, { first_name: 'Ben', last_name: 'Chen-Ortiz', dob: '2016-01-20' }]);
  assert.equal(r.status, 'ok', 'a sign-up with { first_name, last_name, dob } children is accepted');
  const ivy = store.prospects.find((p) => p.child_first_name === 'Ivy');
  const ben = store.prospects.find((p) => p.child_first_name === 'Ben');
  // the prospect copies both; the age is worked out from the date of birth on the school's today
  assert.equal(ivy.child_last_name, 'Chen');
  assert.equal(ivy.child_dob, '2019-03-04');
  assert.equal(ivy.child_age, 7); // Jan 11, 2027: her March birthday is still ahead
  assert.equal(ben.child_age, 10);
  // the list: the last name (for "Ivy C."), never the date of birth or age
  const row = call('prospects_list', { p_location_code: 'worcester' }).prospects.find((p) => p.id === ivy.id);
  assert.equal(row.child_last_name, 'Chen');
  assert.ok(!('child_dob' in row) && !('child_age' in row) && !JSON.stringify(row).includes('2019-03-04'));
  // the search finds the child's last name too
  assert.deepEqual(call('prospects_search', { p_location_code: 'worcester', p_text: 'chen' }).ids.sort(), [ivy.id, ben.id].sort());
  assert.deepEqual(call('prospects_search', { p_location_code: 'worcester', p_text: 'ORTIZ' }).ids, [ben.id]);
  // the profile: both, and the brother's last name and date of birth (his age is worked out from it)
  const g = call('prospects_get', { p_prospect_id: ivy.id }).prospect;
  assert.equal(g.child_last_name, 'Chen');
  assert.equal(g.child_dob, '2019-03-04');
  assert.deepEqual(g.siblings.map((s) => [s.child_last_name, s.child_dob]), [['Chen-Ortiz', '2016-01-20']]);
  assert.equal(childAge({ childDob: g.siblings[0].child_dob, childAge: g.siblings[0].child_age }, '2027-01-20'), 11); // his birthday
  // a child sent the old way (first name and age, an old page on a kiosk) has neither
  assert.equal(send([{ first_name: 'Olga', age: 9 }]).status, 'ok');
  const olga = store.prospects.find((p) => p.child_first_name === 'Olga');
  const go = call('prospects_get', { p_prospect_id: olga.id }).prospect;
  assert.equal(go.child_last_name, null);
  assert.equal(go.child_dob, null);
  assert.equal(go.child_age, 9);
});

group('the profile\'s small rules: "Ava N.", the age, the address line, how long the signature is kept', () => {
  // "Ava N." from the child's own last name (v0.637); without one, the parent's last initial (v0.245)
  assert.equal(childInitial({ childLastName: 'Nguyen', parentName: 'Jo Allen' }), 'N');
  assert.equal(childInitial({ childLastName: '  martinez ', parentName: 'Jo Allen' }), 'M');
  assert.equal(childInitial({ childLastName: null, parentName: 'Jo Allen' }), 'A');
  assert.equal(childInitial({ childLastName: '', parentName: 'Cher' }), '');
  // whole years on the school's today; the birthday counts on the day itself
  assert.equal(ageOn('2019-03-04', '2027-03-03'), 7);
  assert.equal(ageOn('2019-03-04', '2027-03-04'), 8);
  assert.equal(ageOn('2020-02-29', '2027-02-28'), 6); // a leap-day birthday counts from Mar 1
  assert.equal(ageOn('2020-02-29', '2027-03-01'), 7);
  assert.equal(ageOn(null, '2027-03-01'), null);
  assert.equal(childAge({ childDob: '2019-03-04', childAge: 6 }, '2027-03-04'), 8); // the date of birth wins
  assert.equal(childAge({ childDob: null, childAge: 9 }, '2027-03-04'), 9); // older sign-ups keep the typed age
  assert.equal(childFullName({ childFirstName: 'Ava', childLastName: 'Nguyen' }), 'Ava Nguyen');
  assert.equal(childFullName({ childFirstName: 'Leo', childLastName: null }), 'Leo');
  // the home address on one line; a plain text (an old kiosk page) as it is
  assert.equal(addressLine({ street: '12 Elm Street', city: 'Worcester', state: 'MA', zip: '01602' }), '12 Elm Street, Worcester, MA 01602');
  assert.equal(addressLine(' 12 Elm St, Worcester '), '12 Elm St, Worcester');
  assert.equal(addressLine(null), '');
  // the answers: never layout, the children, the booking, the waiver, the parent's fields or the address
  const fields = [
    { id: 'parent_name', type: 'parent_name' }, { id: 'parent_phone', type: 'parent_phone' }, { id: 'parent_email', type: 'parent_email' },
    { id: 'address', type: 'address' }, { id: 'children', type: 'children' }, { id: 'step_2', type: 'step' }, { id: 'booking', type: 'booking' },
    { id: 'h1', type: 'heading' }, { id: 'heard', type: 'choice' }, { id: 'notes', type: 'long_text' }, { id: 'waiver', type: 'waiver', text: 'Our wording.' },
  ];
  assert.deepEqual(answerFieldsOf(fields).map((f) => f.id), ['heard', 'notes']);
  assert.equal(addressFieldOf(fields).id, 'address');
  assert.equal(addressFieldOf(fields.filter((f) => f.type !== 'address')), null); // "Not asked on this form"
  assert.equal(waiverFieldOf(fields).text, 'Our wording.');
  // the signature picture: 90 days after the family's latest free class, else after signing (v0.242, 0009)
  assert.deepEqual(signatureKeptUntil(['2027-01-13', '2027-02-01'], '2027-01-10T15:00:00Z'), { until: '2027-05-02', afterClass: true });
  assert.deepEqual(signatureKeptUntil([], '2027-01-11T01:30:00Z'), { until: '2027-04-10', afterClass: false }); // signed Jan 10, 8:30 pm in Massachusetts
  assert.equal(signatureKeptUntil([], null), null);
});

group('a long visitor sheet keeps the signature on its first page: one-line answers, then up to 10% smaller, then a next page (v0.641)', () => {
  // (limit 967 px: the paper inside its margins, 979, less 12 for rounding). The signature row,
  // the 15 boxes and the footer take 335 px below the part that may print smaller ("top").
  assert.equal(LIMIT_PX, 967);
  const base = { grid: 0, bottoms: [], waiverText: 94, more: 20 };
  const sheet = (normal, compact) => ({ ...base, normal, compact, top: compact - 335 });
  // fits as it is → as today
  assert.deepEqual(planSheet(sheet(900, 860)), { kind: 'whole', compact: false, zoom: 1 });
  // fits with the answers one line each
  assert.deepEqual(planSheet(sheet(1111, 960)), { kind: 'whole', compact: true, zoom: 1 });
  // a sheet 981 px tall with its answers one line each (Shrewsbury's Visitor Information measured
  // that before v0.643's two boxes; it now fits as it is): the part above the signature at 97.8% —
  // (967 − 335) / 646 — and the signature and the boxes at their own size
  assert.deepEqual(planSheet(sheet(1111, 981)), { kind: 'whole', compact: true, zoom: 0.978 });
  // never more than 10% smaller: a 702 px top fits at 0.9, a 703 px top doesn't
  assert.deepEqual(planSheet(sheet(1300, 335 + 702)), { kind: 'whole', compact: true, zoom: 0.9 });
  assert.equal(planSheet(sheet(1300, 335 + 703)).kind, 'split');
  // a much longer form (24 answers, 12 rows): the first page keeps the rows that fit beside one
  // "More answers on the next page." line, at full size
  const bottoms = Array.from({ length: 24 }, (_, i) => 21 + Math.floor(i / 2) * 24);
  const long = { ...sheet(1500, 800 + 285), grid: 285, bottoms };
  assert.deepEqual(planSheet(long), { kind: 'split', compact: true, zoom: 1, cut: 12, waiverBack: false });
  // beside a very long waiver not even one answer fits: its wording goes on too, and then all 24 fit
  assert.deepEqual(planSheet({ ...sheet(1500, 1000 + 285), grid: 285, bottoms, waiverText: 400 }), { kind: 'split', compact: true, zoom: 1, cut: 24, waiverBack: true });
  // no other questions and a very long waiver: the first page keeps the signature, the next page the wording
  assert.deepEqual(planSheet({ ...sheet(1400, 1300), waiverText: 500 }), { kind: 'split', compact: true, zoom: 1, cut: 0, waiverBack: true });
  // a very long FIRST answer beside a short waiver: moving the wording wouldn't let it fit, so it stays
  // (the answers go on; the first page keeps the waiver whole)
  assert.deepEqual(planSheet({ ...sheet(1500, 700 + 400), grid: 400, bottoms: [400], waiverText: 94 }), { kind: 'split', compact: true, zoom: 1, cut: 0, waiverBack: false });
  // the answers that fit, from the first (a row's two answers share its bottom)
  assert.equal(answersThatFit([10, 10, 30, 30], 29), 2);
  assert.equal(answersThatFit([10, 10, 30, 30], 9), 0);
  assert.equal(answersThatFit([10, 10, 30, 30], 100), 4);
  // "School Attending:" — a question that ends in ? or : keeps its own mark
  assert.equal(questionLead('School Attending'), 'School Attending:');
  assert.equal(questionLead('How did you hear about us?'), 'How did you hear about us?');
  assert.equal(questionLead('Address:'), 'Address:');
  assert.equal(questionLead('  Occupation '), 'Occupation:');
  assert.equal(questionLead(''), '');
  // on one line a question and its answer share half the paper: together over 52 characters, the whole row
  const exp = { type: 'dropdown', label: 'Any Previous Martial Art experience?' };
  assert.equal(isWideAnswer(exp, 'No', true), false);
  assert.equal(isWideAnswer(exp, 'Yes, two years of karate', true), true);
  assert.equal(isWideAnswer(exp, 'Yes, two years of karate'), false); // question above answer: room for both
  assert.equal(isWideAnswer({ type: 'checkboxes', label: 'Benefits' }, 'Fun'), true); // a list is always the whole row
});

console.log(`ALL PROSPECTS LIB CHECKS PASSED (${groups} groups)`);
