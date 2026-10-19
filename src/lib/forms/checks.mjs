// checks.mjs — plain checks for the Forms field rules and the Forms preview database.
// Why it exists: the field rules (fields.js) and the fake database (mockForms.js) must agree with
// migration 0009 — the same refusals, the shared spot limit, closures hiding times, the 90-day
// signature clean-up. These checks run in Node without a browser:
//   node src/lib/forms/checks.mjs
// Prints "ALL FORMS LIB CHECKS PASSED", or stops at the first failed check.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { answerProblems, cleanAnswers, fieldsProblem, isVisible, newField, nextFieldId, publishProblem, slugify, slugOk, stepsOf, template } from './fields.js';
import { checkAnswers, createFormsBackend, signatureOk } from '../mockForms.js';

let groups = 0;
function group(name, fn) {
  fn();
  groups += 1;
  console.log(`ok  ${name}`);
}

group('fields: templates are valid, waiver starts empty', () => {
  for (const kind of ['free_class', 'walk_in', 'event', 'blank']) assert.equal(fieldsProblem(template(kind)), null, kind);
  assert.equal(publishProblem(template('free_class')).code, 'waiverEmpty');
  assert.equal(publishProblem(template('blank')), null);
  const withText = template('walk_in').map((f) => (f.type === 'waiver' ? { ...f, text: 'Our wording.' } : f));
  assert.equal(publishProblem(withText), null);
});

group('fields: refusals match forms_fields_are_valid', () => {
  const base = template('blank');
  assert.equal(fieldsProblem(base.slice(1)).code, 'count');
  assert.equal(fieldsProblem([...base, { ...base[0] }]).code, 'id');
  assert.equal(fieldsProblem(base.map((f, i) => (i === 0 ? { ...f, locked: false } : f))).code, 'locked');
  assert.equal(fieldsProblem([...base, { id: 'x', type: 'choice', label: 'Pick', options: ['One'] }]).code, 'options');
  assert.equal(fieldsProblem([...base, { id: 'x', type: 'choice', label: 'Pick', options: ['One', 'one'] }]).code, 'optionTwice');
  assert.equal(fieldsProblem([...base, { id: 'b', type: 'booking', label: 'Book', required: true }]).code, 'bookingRequired');
  assert.equal(fieldsProblem([...base, { id: 'w1', type: 'waiver', label: 'W', text: '' }, { id: 'w2', type: 'waiver', label: 'W', text: '' }]).code, 'oneOnly');
  assert.equal(fieldsProblem([...base, { id: 'x', type: 'short_text', label: 'Q', extra: 1 }]).code, 'shape');
  assert.equal(fieldsProblem([...base, { id: 'x', type: 'short_text', label: 'Q', text: 'no' }]).code, 'shape');
  // show only if: an EARLIER choice and one of its options
  const pick = { id: 'kids', type: 'choice', label: 'Kids?', options: ['Yes', 'No'] };
  const shown = { id: 'ages', type: 'short_text', label: 'Ages', show_if: { field: 'kids', value: 'Yes' } };
  assert.equal(fieldsProblem([...base, pick, shown]), null);
  assert.equal(fieldsProblem([...base, shown, pick]).code, 'showIf');
  assert.equal(fieldsProblem([...base, pick, { ...shown, show_if: { field: 'kids', value: 'Maybe' } }]).code, 'showIf');
  // the waiver is never "show only if" (F5 difference 8)
  const waiver = { id: 'waiver', type: 'waiver', label: 'Waiver', required: true, text: 'Our wording.' };
  assert.equal(fieldsProblem([...base, pick, waiver]), null);
  assert.equal(fieldsProblem([...base, pick, { ...waiver, show_if: { field: 'kids', value: 'Yes' } }]).code, 'showIf');
  assert.equal(isVisible(shown, { kids: 'Yes' }), true);
  assert.equal(isVisible(shown, { kids: 'No' }), false);
});

group('fields: steps, new fields, slugs', () => {
  const steps = stepsOf(template('free_class'));
  assert.deepEqual(steps.map((s) => s.label), ['About you', 'Pick a free class', 'Almost done']);
  assert.equal(nextFieldId(template('blank')), 'f5');
  assert.equal(fieldsProblem([...template('blank'), newField('dropdown', 'f5')]), null);
  assert.equal(slugify('Free class — Instagram!'), 'free-class-instagram');
  assert.equal(slugOk(slugify('A')), true);
  assert.equal(slugOk('admin'), false);
  assert.equal(slugOk('-bad'), false);
});

// ----- A family's answers -----
const SIG = `data:image/png;base64,${'A'.repeat(300)}`;
const walkIn = template('walk_in').map((f) => (f.type === 'waiver' ? { ...f, text: 'Our wording.' } : f));
const goodAnswers = { parent_name: 'Dana Rivera', parent_phone: '508-555-0142', parent_email: 'dana@example.com', heard: 'A friend', waiver: true };
const kids = [{ first_name: 'Maya', age: 7 }];

group('answers: screen rules and database rules agree', () => {
  assert.deepEqual(answerProblems(walkIn, goodAnswers, kids), {});
  assert.equal(checkAnswers(walkIn, cleanAnswers(walkIn, goodAnswers), kids, SIG), true);
  assert.equal(answerProblems(walkIn, { ...goodAnswers, parent_phone: '12' }, kids).parent_phone, 'phone');
  assert.equal(checkAnswers(walkIn, { ...goodAnswers, parent_phone: '12' }, kids, SIG), false);
  assert.equal(answerProblems(walkIn, { ...goodAnswers, parent_email: 'nope' }, kids).parent_email, 'email');
  assert.equal(answerProblems(walkIn, { ...goodAnswers, waiver: false }, kids).waiver, 'required');
  assert.equal(checkAnswers(walkIn, { ...goodAnswers, heard: 'Radio' }, kids, SIG), false);
  assert.equal(checkAnswers(walkIn, goodAnswers, kids, null), false); // agreed waiver needs a signature
  assert.equal(checkAnswers(walkIn, goodAnswers, [{ first_name: 'Maya', age: 1 }], SIG), false);
  assert.equal(answerProblems(walkIn, goodAnswers, []).children, 'children');
  assert.equal(checkAnswers(walkIn, { ...goodAnswers, unknown: 'x' }, kids, SIG), false);
  assert.equal(signatureOk(SIG), true);
  assert.equal(signatureOk('data:image/png;base64,AAAA'), false); // too short (review L7)
});

// ----- The preview database -----
// Monday 2027-01-11, 8:00 am in Massachusetts. White runs Mon/Wed 4:00 pm and Sat 9:30 am.
const TODAY = '2027-01-11';
const NOW = Date.parse('2027-01-11T13:00:00Z');
const white = randomUUID();
const groupA = randomUUID();
const classes = [{ id: white, location_code: 'worcester', name: 'White' }, { id: groupA, location_code: 'worcester', name: 'Group A' }];
const vId = randomUUID();
const slot = (weekday, start, end, ids) => ({ id: randomUUID(), version_id: vId, location_code: 'worcester', weekday, starts_at: `${start}:00`, ends_at: `${end}:00`, class_ids: ids });
const schedule = {
  versions: [{ id: vId, location_code: 'worcester', starts_on: '2026-09-07' }],
  slots: [slot(1, '16:00', '16:45', [white]), slot(3, '16:00', '16:45', [white]), slot(6, '09:30', '10:15', [white]), slot(1, '17:00', '17:45', [groupA])],
};
const calendar = { closures: [], closureClasses: [] };

function makeBackend() {
  let store = { schema: 2, forms: [], offers: [], limits: [], submissions: [], bookings: [], kioskTokens: [], signatureViews: [],
    statuses: [], prospects: [], notes: [], activity: [], opens: [] };
  let clock = NOW;
  let today = TODAY;
  const backend = createFormsBackend({
    loadStore: () => store,
    saveStore: (s) => { store = JSON.parse(JSON.stringify(s)); },
    now: () => clock,
    newId: randomUUID,
    getSchedule: () => schedule,
    getCalendar: () => calendar,
    getClasses: () => classes,
    today: () => today,
  });
  const admin = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Admin' };
  const staff = { ...admin, isAdmin: false, actorName: 'Desk' };
  const call = (name, args, ctx = admin) => backend.rpc(name, args, ctx).data;
  return { backend, call, admin, staff, store: () => store, setDay: (d, ms) => { today = d; clock = ms; } };
}

function liveFreeClass(t, slug = 'free-class') {
  const made = t.call('forms_create', { p_location_code: 'worcester', p_kind: 'free_class', p_name: 'Free class', p_slug: slug });
  assert.equal(made.status, 'ok');
  const draft = template('free_class').map((f) => (f.type === 'waiver' ? { ...f, text: 'Our wording.' } : f));
  const settings = { thank_you: 'Thanks', alert_email: null, confirm_email: true, add_to_calendar: true };
  const saved = t.call('forms_save_draft', { p_form_id: made.id, p_expected_version: made.version, p_name: 'Free class', p_slug: slug, p_draft: draft, p_settings: settings });
  assert.equal(saved.status, 'ok');
  const booked = t.call('forms_set_booking', {
    p_form_id: made.id, p_expected_version: saved.version,
    p_offers: [{ class_id: white, default_limit: 2, days_ahead: 14, min_hours_ahead: 3 }], p_limits: [],
  });
  assert.equal(booked.status, 'ok');
  const pub = t.call('forms_publish', { p_form_id: made.id, p_expected_version: booked.version });
  assert.equal(pub.status, 'ok');
  return { id: made.id, version: pub.version };
}

const sendFor = (t, form, bookings, key = randomUUID(), ctx) => t.call('forms_staff_submit', {
  p_form_id: form.id, p_submission_key: key, p_published_version: 1,
  p_answers: { parent_name: 'Dana', parent_phone: '508-555-0142', parent_email: 'd@example.com', waiver: true },
  p_children: [{ first_name: 'Maya', age: 7 }, { first_name: 'Leo', age: 9 }], p_bookings: bookings, p_signature: SIG,
}, ctx);

group('backend: who may do what, check order', () => {
  const t = makeBackend();
  assert.equal(t.call('forms_create', { p_location_code: 'worcester', p_kind: 'blank', p_name: 'X', p_slug: 'xyz' }, t.staff).status, 'not_allowed');
  assert.equal(t.call('forms_create', { p_location_code: 'worcester', p_kind: 'blank', p_name: 'X', p_slug: 'xyz' }, { ...t.admin, hasDataAccess: false }).status, 'no_access');
  assert.equal(t.call('forms_create', { p_location_code: 'worcester', p_kind: 'nope', p_name: 'X', p_slug: 'xyz' }).status, 'invalid');
  assert.equal(t.call('forms_create', { p_location_code: 'worcester', p_kind: 'blank', p_name: 'X', p_slug: 'admin' }).status, 'invalid');
  const a = t.call('forms_create', { p_location_code: 'worcester', p_kind: 'free_class', p_name: 'X', p_slug: 'xyz' });
  assert.equal(t.call('forms_create', { p_location_code: 'shrewsbury', p_kind: 'blank', p_name: 'Y', p_slug: 'xyz' }).status, 'duplicate_slug');
  // the empty waiver can't be published (v0.145 answer 4)
  assert.equal(t.call('forms_publish', { p_form_id: a.id, p_expected_version: a.version }).status, 'not_publishable');
  assert.equal(t.call('forms_publish', { p_form_id: a.id, p_expected_version: a.version + 5 }).status, 'stale');
  assert.equal(t.call('forms_set_status', { p_form_id: a.id, p_expected_version: a.version, p_status: 'live' }).status, 'not_publishable');
  // hidden columns are refused
  assert.equal(t.backend.select('form_submissions', 'id, signature', [], [], t.admin).error.code, '42501');
  assert.equal(t.backend.select('forms', 'id, booking_key', [], [], t.admin).error.code, '42501');
  // a draft copy; delete works without sign-ups
  const dup = t.call('forms_duplicate', { p_form_id: a.id });
  assert.equal(dup.slug, 'xyz-copy');
  assert.equal(t.call('forms_delete', { p_form_id: dup.id, p_expected_version: dup.version }).status, 'ok');
});

group('backend: free-class times, shared limit, booking', () => {
  const t = makeBackend();
  const f = liveFreeClass(t);
  const open = t.call('forms_open_times', { p_form_id: f.id, p_from: TODAY, p_to: '2027-01-24' }, t.staff);
  assert.equal(open.status, 'ok');
  // Mon 11 (4 pm is 8 hours away → fine), Wed 13, Sat 16, Mon 18, Wed 20, Sat 23; Group A isn't offered
  assert.deepEqual(open.times.map((x) => x.date), ['2027-01-11', '2027-01-13', '2027-01-16', '2027-01-18', '2027-01-20', '2027-01-23']);
  assert.ok(open.times.every((x) => x.class_id === white && x.spots_left === 2));
  // two children take both spots on Wed 13 → that time disappears
  const sent = sendFor(t, f, [{ child: 0, class_id: white, date: '2027-01-13', starts_at: '16:00' }, { child: 1, class_id: white, date: '2027-01-13', starts_at: '16:00' }], undefined, t.staff);
  assert.equal(sent.status, 'ok');
  assert.equal(sent.bookings.length, 2);
  assert.equal(t.store().submissions[0].entered_by, 'Desk');
  const after = t.call('forms_open_times', { p_form_id: f.id, p_from: '2027-01-13', p_to: '2027-01-13' });
  assert.deepEqual(after.times, []);
  // a third booking for that time is refused and changes nothing
  const before = t.store().submissions.length;
  assert.equal(sendFor(t, f, [{ child: 0, class_id: white, date: '2027-01-13', starts_at: '16:00' }]).status, 'time_taken');
  assert.equal(t.store().submissions.length, before);
  // the same Send twice → the same answer (review L2)
  const key = randomUUID();
  const first = sendFor(t, f, [], key);
  const again = sendFor(t, f, [], key);
  assert.equal(again.repeat, true);
  assert.equal(again.id, first.id);
  // a second live form with a lower limit lowers the shared one (v0.145 answer 5)
  const g = liveFreeClass(t, 'free-class-two');
  const g2 = t.call('forms_set_booking', { p_form_id: g.id, p_expected_version: g.version, p_offers: [{ class_id: white, default_limit: 1, days_ahead: 14, min_hours_ahead: 3 }], p_limits: [] });
  assert.equal(g2.status, 'ok');
  const shared = t.call('forms_open_times', { p_form_id: f.id, p_from: '2027-01-18', p_to: '2027-01-18' });
  assert.equal(shared.times[0].spots_left, 1);
  // …but a 0 on the other form only hides that time there (review M2)
  t.call('forms_set_booking', { p_form_id: g.id, p_expected_version: g2.version, p_offers: [{ class_id: white, default_limit: 1, days_ahead: 14, min_hours_ahead: 3 }], p_limits: [{ class_id: white, weekday: 1, starts_at: '16:00', spot_limit: 0 }] });
  assert.equal(t.call('forms_open_times', { p_form_id: f.id, p_from: '2027-01-18', p_to: '2027-01-18' }).times[0].spots_left, 2);
  assert.deepEqual(t.call('forms_open_times', { p_form_id: g.id, p_from: '2027-01-18', p_to: '2027-01-18' }).times, []);
  // a form with sign-ups can't be deleted
  assert.equal(t.call('forms_delete', { p_form_id: f.id, p_expected_version: f.version }).reason, 'has_signups');
});

group('backend: closures hide times; Calendar list flags cancelled classes', () => {
  const t = makeBackend();
  const f = liveFreeClass(t);
  assert.equal(sendFor(t, f, [{ child: 0, class_id: white, date: '2027-01-18', starts_at: '16:00' }]).status, 'ok');
  let list = t.call('forms_bookings_between', { p_location_code: 'worcester', p_from: TODAY, p_to: '2027-01-31' }, t.staff);
  assert.equal(list.bookings.length, 1);
  assert.equal(list.bookings[0].child_first_name, 'Maya');
  assert.equal(list.bookings[0].class_running, true);
  calendar.closures.push({ id: 'c1', location_code: null, starts_on: '2027-01-18', ends_on: '2027-01-18', whole_day: true });
  try {
    list = t.call('forms_bookings_between', { p_location_code: null, p_from: TODAY, p_to: '2027-01-31' });
    assert.equal(list.bookings[0].class_running, false); // amber "Class cancelled — call the family"
    assert.deepEqual(t.call('forms_open_times', { p_form_id: f.id, p_from: '2027-01-18', p_to: '2027-01-18' }).times, []);
  } finally {
    calendar.closures.length = 0;
  }
  assert.equal(t.call('forms_bookings_between', { p_location_code: null, p_from: TODAY, p_to: '2027-04-30' }).status, 'invalid'); // > 62 days
});

group('backend: signatures deleted 90 days after the free class (v0.146)', () => {
  const t = makeBackend();
  const f = liveFreeClass(t);
  const sent = sendFor(t, f, [{ child: 0, class_id: white, date: '2027-01-13', starts_at: '16:00' }]);
  const look = t.call('forms_submission_signature', { p_submission_id: sent.id }, t.staff);
  assert.equal(look.signature, SIG);
  assert.equal(t.store().signatureViews.length, 1); // every look is recorded (review M3)
  t.setDay('2027-04-14', Date.parse('2027-04-14T13:00:00Z')); // 91 days after Jan 13
  const later = t.call('forms_submission_signature', { p_submission_id: sent.id });
  assert.equal(later.signature, null);
  assert.ok(later.signed_at); // "Signed on" stays
});

console.log(`ALL FORMS LIB CHECKS PASSED (${groups} groups)`);
