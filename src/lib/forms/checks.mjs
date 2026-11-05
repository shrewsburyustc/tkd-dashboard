// checks.mjs — plain checks for the Forms field rules and the Forms preview database.
// Why it exists: the field rules (fields.js) and the fake database (mockForms.js) must agree with
// migration 0009 — the same refusals, the shared spot limit, closures hiding times, the 90-day
// signature clean-up — and with 0036 (each child's last name and date of birth, the Address
// question). These checks run in Node without a browser:
//   node src/lib/forms/checks.mjs
// Prints "ALL FORMS LIB CHECKS PASSED", or stops at the first failed check.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  addressPartProblems, ageOn, answerProblems, bookingsWithoutChild, childBoxProblems, childrenProblemKinds, cleanAnswers, emptyFillValues, fieldsProblem,
  isVisible, newField, nextFieldId, PALETTE, publishProblem, removedChildIndex, slugify, slugOk, stepProblems, stepsOf, template,
} from './fields.js';
import { addressProblemLine, childrenProblemLine } from '../../screens/forms/text.js';
import { checkAnswers, createFormsBackend, defaultFormsData, signatureOk } from '../mockForms.js';

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
  // the Address question (0036 = forms_template): right after Email, before the children —
  // required on Free class and Walk-in, not on Event; Blank has only the four fixed fields
  for (const [kind, required] of [['free_class', true], ['walk_in', true], ['event', false]]) {
    const list = template(kind);
    assert.deepEqual(list.slice(2, 5).map((f) => f.id), ['parent_email', 'address', 'children'], kind);
    assert.deepEqual(list[3], { id: 'address', type: 'address', label: 'Home address', required }, kind);
  }
  assert.deepEqual(template('blank').map((f) => f.type), ['parent_name', 'parent_phone', 'parent_email', 'children']);
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
  // the Address question: at most one per form, no options or wording, "Show only if" allowed
  const address = newField('address', 'f9');
  assert.deepEqual(address, { id: 'f9', type: 'address', label: 'Home address', required: false });
  assert.equal(fieldsProblem([...base, address]), null);
  assert.equal(fieldsProblem([...base, address, { ...address, id: 'f10' }]).code, 'oneOnly');
  assert.equal(fieldsProblem([...base, { ...address, options: ['A', 'B'] }]).code, 'shape');
  assert.equal(fieldsProblem([...base, { ...address, text: '' }]).code, 'shape');
  assert.equal(fieldsProblem([...base, pick, { ...address, show_if: { field: 'kids', value: 'Yes' } }]), null);
});

group('fields: steps, new fields, slugs', () => {
  const steps = stepsOf(template('free_class'));
  assert.deepEqual(steps.map((s) => s.label), ['About you', 'Pick a free class', 'Almost done']);
  assert.deepEqual(PALETTE[0].types.slice(-2), ['date', 'address']); // Contact: Address after Date
  assert.equal(nextFieldId(template('blank')), 'f5');
  assert.equal(fieldsProblem([...template('blank'), newField('dropdown', 'f5')]), null);
  assert.equal(slugify('Free class — Instagram!'), 'free-class-instagram');
  assert.equal(slugOk(slugify('A')), true);
  assert.equal(slugOk('admin'), false);
  assert.equal(slugOk('-bad'), false);
});

// ----- A family's answers -----
const SIG = `data:image/png;base64,${'A'.repeat(300)}`;
const DAY = '2026-11-04'; // the school's "today" for the children's ages in these checks
const walkIn = template('walk_in').map((f) => (f.type === 'waiver' ? { ...f, text: 'Our wording.' } : f));
const HOME = { street: '12 Elm Street', city: 'Worcester', state: 'MA', zip: '01602' };
const goodAnswers = { parent_name: 'Dana Rivera', parent_phone: '508-555-0142', parent_email: 'dana@example.com', address: HOME, heard: 'A friend', waiver: true };
const kids = [{ first_name: 'Maya', last_name: 'Rivera', dob: '2019-03-04' }];

group('answers: screen rules and database rules agree', () => {
  assert.deepEqual(answerProblems(walkIn, goodAnswers, kids, DAY), {});
  assert.equal(checkAnswers(walkIn, cleanAnswers(walkIn, goodAnswers), kids, SIG), true);
  assert.equal(answerProblems(walkIn, { ...goodAnswers, parent_phone: '12' }, kids, DAY).parent_phone, 'phone');
  assert.equal(checkAnswers(walkIn, { ...goodAnswers, parent_phone: '12' }, kids, SIG), false);
  assert.equal(answerProblems(walkIn, { ...goodAnswers, parent_email: 'nope' }, kids, DAY).parent_email, 'email');
  assert.equal(answerProblems(walkIn, { ...goodAnswers, waiver: false }, kids, DAY).waiver, 'required');
  assert.equal(checkAnswers(walkIn, { ...goodAnswers, heard: 'Radio' }, kids, SIG), false);
  assert.equal(checkAnswers(walkIn, goodAnswers, kids, null), false); // agreed waiver needs a signature
  assert.equal(checkAnswers(walkIn, goodAnswers, [{ first_name: 'Maya', age: 1 }], SIG), false);
  assert.equal(answerProblems(walkIn, goodAnswers, [], DAY).children, 'children');
  assert.equal(checkAnswers(walkIn, { ...goodAnswers, unknown: 'x' }, kids, SIG), false);
  assert.equal(signatureOk(SIG), true);
  assert.equal(signatureOk('data:image/png;base64,AAAA'), false); // too short (review L7)
});

group('children: first name, last name, date of birth (0036, v0.634 / v0.637)', () => {
  // the age, counted like the database's age(): the birthday counts on its own day
  assert.equal(ageOn('2019-03-04', DAY), 7);
  assert.equal(ageOn('2019-11-04', DAY), 7);
  assert.equal(ageOn('2019-11-05', DAY), 6);
  assert.equal(ageOn('2020-02-29', '2027-02-28'), 6); // a Feb 29 birthday counts on Mar 1
  assert.equal(ageOn('2020-02-29', '2027-03-01'), 7);
  assert.equal(ageOn('2019-02-30', DAY), null);
  // each box has its own code; a child with any wrong box gets its own key ('child-0' …)
  const box = (c) => childBoxProblems(c, DAY);
  const maya = kids[0];
  assert.equal(box({ ...maya, first_name: ' ' }).first_name, 'child_first');
  assert.equal(box({ ...maya, last_name: '' }).last_name, 'child_last');
  assert.equal(box({ ...maya, last_name: 'R'.repeat(41) }).last_name, 'child_name_long');
  assert.equal(box({ ...maya, first_name: `Ma${String.fromCharCode(0x200b)}ya` }).first_name, 'child_name_bad');
  assert.equal(box({ ...maya, dob: null }).dob, 'child_dob');
  assert.equal(box({ ...maya, dob: '2025-11-05' }).dob, 'child_age'); // 0 years old
  assert.equal(box({ ...maya, dob: '2024-11-05' }).dob, 'child_age'); // 1 (2 tomorrow)
  assert.equal(box({ ...maya, dob: '2024-11-04' }).dob, null); // 2 today
  assert.equal(box({ ...maya, dob: '1926-11-05' }).dob, null); // 99
  assert.equal(box({ ...maya, dob: '1926-11-04' }).dob, 'child_age'); // 100
  const leo = { first_name: 'Leo', last_name: '', dob: null };
  assert.deepEqual(box(leo), { first_name: null, last_name: 'child_last', dob: 'child_dob' });
  assert.deepEqual(answerProblems(walkIn, goodAnswers, [maya, leo, { first_name: 'Ava', last_name: 'N', dob: '2019-03-04' }], DAY), { 'child-1': 'child' });
  // ONE line for every kind at once (design review): a blank child names all three boxes
  const line = (list) => childrenProblemLine(childrenProblemKinds(list, DAY));
  assert.equal(line([{ first_name: '', last_name: '', dob: null }]), "Enter each child's first name, last name and date of birth.");
  assert.equal(line([maya, leo]), "Enter each child's last name and date of birth.");
  assert.equal(line([{ ...maya, last_name: ' ' }]), "Enter each child's last name.");
  assert.equal(line([{ ...maya, dob: null }]), "Pick each child's date of birth.");
  assert.equal(line([{ ...maya, first_name: '' }, { ...maya, dob: '2025-11-05' }]), "Enter each child's first name. Each child needs to be 2 to 99 years old. Check the date of birth.");
  assert.equal(line([maya]), '');
  // a fresh form has one empty child; its key comes with the step that has the children
  const fresh = emptyFillValues();
  assert.deepEqual(fresh.children, [{ first_name: '', last_name: '', dob: null }]);
  const freeClass = template('free_class');
  assert.deepEqual(stepProblems(stepsOf(freeClass)[0].fields, freeClass, { ...fresh, answers: goodAnswers }, null, DAY), { 'child-0': 'child' });
  assert.deepEqual(stepProblems(stepsOf(freeClass)[1].fields, freeClass, { ...fresh, answers: goodAnswers }, null, DAY), {}); // not on step 2
  // removing a child: its free-class pick goes, the later children's picks move down one (code review)
  const [a, b, c] = [{ first_name: 'A' }, { first_name: 'B' }, { first_name: 'C' }];
  assert.equal(removedChildIndex([a, b, c], [a, c]), 1);
  assert.equal(removedChildIndex([a, b, c], [a, b]), 2);
  assert.equal(removedChildIndex([a, b, c], [a, { ...b }, c]), -1); // a change, not a removal
  assert.deepEqual(bookingsWithoutChild({ 0: 'x|d|1', 1: 'none', 2: 'y|d|2' }, 1), { 0: 'x|d|1', 1: 'y|d|2' });
  assert.deepEqual(bookingsWithoutChild({ 0: 'x|d|1', 2: 'y|d|2' }, 0), { 1: 'y|d|2' });
  // the database: the new shape or the old one (a page opened before 0036), exactly those keys
  assert.equal(checkAnswers(walkIn, goodAnswers, kids, SIG), true);
  assert.equal(checkAnswers(walkIn, goodAnswers, [{ first_name: 'Maya', age: 7 }], SIG), true);
  assert.equal(checkAnswers(walkIn, goodAnswers, [maya, { first_name: 'Leo', age: 9 }], SIG), true);
  assert.equal(checkAnswers(walkIn, goodAnswers, [{ ...maya, age: 7 }], SIG), false);
  assert.equal(checkAnswers(walkIn, goodAnswers, [{ first_name: 'Maya', dob: '2019-03-04' }], SIG), false);
  assert.equal(checkAnswers(walkIn, goodAnswers, [{ ...maya, last_name: '' }], SIG), false);
  assert.equal(checkAnswers(walkIn, goodAnswers, [{ ...maya, last_name: 'R'.repeat(41) }], SIG), false);
  assert.equal(checkAnswers(walkIn, goodAnswers, [{ ...maya, dob: '2019-02-30' }], SIG), false);
  assert.equal(checkAnswers(walkIn, goodAnswers, [{ ...maya, dob: '1899-12-31' }], SIG), false);
  assert.equal(checkAnswers(walkIn, goodAnswers, [{ ...maya, dob: null }], SIG), false);
});

group('address: street, city, state, ZIP code (0036, v0.634)', () => {
  // the screens: street, city and ZIP code all blank = no answer (the State box starts as MA)
  const code = (v, fields = walkIn) => answerProblems(fields, { ...goodAnswers, address: v }, kids, DAY).address;
  assert.equal(code(undefined), 'required');
  assert.equal(code({ street: '', city: ' ', state: 'MA', zip: '' }), 'required');
  assert.equal(code({ ...HOME, city: '' }), 'address');
  assert.equal(code({ ...HOME, state: '' }), 'address');
  assert.equal(code({ ...HOME, zip: '1602' }), 'zip');
  assert.equal(code({ ...HOME, zip: '01602-12' }), 'zip');
  assert.equal(code({ ...HOME, zip: '01602-1234' }), undefined);
  assert.equal(code({ ...HOME, street: 'x'.repeat(121) }), 'text');
  assert.equal(code({ street: '12 Elm Street', city: '', state: 'MA', zip: '1' }), 'address'); // the first box on screen
  // every wrong box at once, in one line (design review)
  const wrong = addressPartProblems({ street: '', city: 'Worcester', state: 'MA', zip: '1602' });
  assert.deepEqual(wrong, { street: 'address', zip: 'zip' });
  assert.equal(addressProblemLine(Object.values(wrong)), 'Enter the whole address: street, city, state and ZIP code. Enter a 5-digit ZIP code.');
  // not required: blank is fine, a half-typed one isn't
  const optional = walkIn.map((f) => (f.type === 'address' ? { ...f, required: false } : f));
  assert.equal(code(undefined, optional), undefined);
  assert.equal(code({ street: '', city: '', state: 'MA', zip: '' }, optional), undefined);
  assert.equal(code({ ...HOME, street: '' }, optional), 'address');
  // what is sent: each part tidied; a blank one isn't sent
  assert.deepEqual(cleanAnswers(walkIn, { ...goodAnswers, address: { street: ' 12  Elm Street ', city: 'Worcester ', state: ' MA', zip: ' 01602 ' } }).address, HOME);
  assert.equal('address' in cleanAnswers(walkIn, { ...goodAnswers, address: { street: '', city: '', state: 'MA', zip: '' } }), false);
  // the database: exactly the four parts, all filled — or a plain text (from a page opened before)
  const { address: _gone, ...noAddress } = goodAnswers;
  const db = (v, fields = walkIn) => checkAnswers(fields, v === undefined ? noAddress : { ...goodAnswers, address: v }, kids, SIG);
  assert.equal(db(HOME), true);
  assert.equal(db({ ...HOME, zip: '01602-1234' }), true);
  assert.equal(db('12 Elm Street, Worcester MA 01602'), true);
  assert.equal(db('x'.repeat(201)), false);
  assert.equal(db({ ...HOME, country: 'US' }), false);
  assert.equal(db({ street: HOME.street, city: HOME.city, zip: HOME.zip }), false);
  assert.equal(db({ ...HOME, state: '' }), false);
  assert.equal(db({ ...HOME, zip: '1602' }), false);
  assert.equal(db({ ...HOME, zip: ' 01602' }), false);
  assert.equal(db({ ...HOME, street: 'x'.repeat(121) }), false);
  assert.equal(db({ ...HOME, city: 'x'.repeat(61) }), false);
  assert.equal(db({ ...HOME, state: 'x'.repeat(31) }), false);
  assert.equal(db(undefined), false); // required
  assert.equal(db(undefined, optional), true);
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
  let store = { schema: 3, forms: [], offers: [], limits: [], submissions: [], bookings: [], kioskTokens: [], signatureViews: [],
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

// (the Free class template asks the home address, required — 0036)
const ANSWERS = { parent_name: 'Dana', parent_phone: '508-555-0142', parent_email: 'd@example.com', address: HOME, waiver: true };
const sendFor = (t, form, bookings, key = randomUUID(), ctx) => t.call('forms_staff_submit', {
  p_form_id: form.id, p_submission_key: key, p_published_version: 1, p_answers: ANSWERS,
  p_children: [{ first_name: 'Maya', last_name: 'Rivera', dob: '2019-03-04' }, { first_name: 'Leo', last_name: 'Rivera', dob: '2017-06-20' }], p_bookings: bookings, p_signature: SIG,
}, ctx);

group('backend: who may do what, check order', () => {
  const t = makeBackend();
  assert.equal(t.call('forms_create', { p_location_code: 'worcester', p_kind: 'blank', p_name: 'X', p_slug: 'xyz' }, t.staff).status, 'not_allowed');
  assert.equal(t.call('forms_create', { p_location_code: 'worcester', p_kind: 'blank', p_name: 'X', p_slug: 'xyz' }, { ...t.admin, hasDataAccess: false }).status, 'no_access');
  assert.equal(t.call('forms_create', { p_location_code: 'worcester', p_kind: 'nope', p_name: 'X', p_slug: 'xyz' }).status, 'invalid');
  assert.equal(t.call('forms_create', { p_location_code: 'worcester', p_kind: 'blank', p_name: 'X', p_slug: 'admin' }).status, 'invalid');
  const a = t.call('forms_create', { p_location_code: 'worcester', p_kind: 'free_class', p_name: 'X', p_slug: 'xyz' });
  assert.equal(t.call('forms_create', { p_location_code: 'shrewsbury', p_kind: 'blank', p_name: 'Y', p_slug: 'xyz' }).status, 'duplicate_slug');
  // the empty waiver can't be published (v0.241 answer 4)
  assert.equal(t.call('forms_publish', { p_form_id: a.id, p_expected_version: a.version }).status, 'not_publishable');
  assert.equal(t.call('forms_publish', { p_form_id: a.id, p_expected_version: a.version + 5 }).status, 'stale');
  assert.equal(t.call('forms_set_status', { p_form_id: a.id, p_expected_version: a.version, p_status: 'live' }).status, 'not_publishable');
  // hidden columns are refused
  assert.equal(t.backend.select('form_submissions', 'id, signature', [], [], t.admin).error.code, '42501');
  // 0036: staff read only id, form_id, location_code and created_at of a sign-up (security review)
  assert.equal(t.backend.select('form_submissions', 'id, form_id, location_code, created_at', [], [], t.staff).error, null);
  for (const col of ['answers', 'children', 'parent_name', 'parent_phone', 'parent_email', 'fields', 'signed_at']) {
    assert.equal(t.backend.select('form_submissions', `id, ${col}`, [], [], t.admin).error.code, '42501', col);
  }
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
  // a second live form with a lower limit lowers the shared one (v0.241 answer 5)
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

group("backend: a child's age from the date of birth; the old shape still saved (0036)", () => {
  const t = makeBackend();
  const f = liveFreeClass(t);
  // today is Mon 2027-01-11 (TODAY)
  const send = (children) => t.call('forms_staff_submit', {
    p_form_id: f.id, p_submission_key: randomUUID(), p_published_version: 1, p_answers: ANSWERS, p_children: children, p_bookings: [], p_signature: SIG,
  });
  const last = () => t.store().submissions.at(-1);
  const maya = { first_name: ' Maya ', last_name: ' Rivera  Lopez ', dob: '2019-03-04' };
  assert.equal(send([maya]).status, 'ok');
  assert.deepEqual(last().children, [{ first_name: 'Maya', last_name: 'Rivera Lopez', dob: '2019-03-04', age: 7 }]);
  assert.deepEqual(last().answers.address, HOME);
  // 2 on the 2nd birthday; 99 the day before the 100th — anything else is refused, nothing saved
  assert.equal(send([{ ...maya, dob: '2025-01-11' }]).status, 'ok');
  assert.equal(last().children[0].age, 2);
  assert.equal(send([{ ...maya, dob: '1927-01-12' }]).status, 'ok');
  assert.equal(last().children[0].age, 99);
  const before = t.store().submissions.length;
  for (const dob of ['2025-01-12', '1927-01-11', '2027-01-12']) assert.equal(send([{ ...maya, dob }]).status, 'invalid', dob);
  assert.equal(t.store().submissions.length, before);
  // a page opened before 0036 still sends { first_name, age }: saved as before, a mix too
  assert.equal(send([{ first_name: 'Leo', age: 9 }]).status, 'ok');
  assert.deepEqual(last().children, [{ first_name: 'Leo', age: 9 }]);
  assert.equal(send([{ first_name: 'Leo', age: 9 }, maya]).status, 'ok');
  assert.deepEqual(last().children.map((c) => c.age), [9, 7]);
  // the Address question is required on this form; a wrong ZIP code is refused
  const { address: _gone, ...noAddress } = ANSWERS;
  const answers = (a) => t.call('forms_staff_submit', {
    p_form_id: f.id, p_submission_key: randomUUID(), p_published_version: 1, p_answers: a, p_children: [maya], p_bookings: [], p_signature: SIG,
  }).status;
  assert.equal(answers(noAddress), 'invalid');
  assert.equal(answers({ ...ANSWERS, address: { ...HOME, zip: '160' } }), 'invalid');
});

group('preview samples: a store from before 0036 is replaced; the samples follow 0036', () => {
  // a preview store saved by an older build (schema 2) is put aside for fresh samples (schema 3)
  let store = { schema: 2, forms: [], offers: [], limits: [], submissions: [], bookings: [], kioskTokens: [], signatureViews: [],
    statuses: [], prospects: [], notes: [], activity: [], opens: [] };
  const backend = createFormsBackend({
    loadStore: () => store, saveStore: (s) => { store = JSON.parse(JSON.stringify(s)); }, now: () => NOW, newId: randomUUID,
    getSchedule: () => schedule, getCalendar: () => calendar, getClasses: () => classes, today: () => TODAY,
  });
  assert.equal(backend.snapshot().schema, 3);
  assert.equal(store.schema, 3);
  // the Forms samples: every child in the new shape with its age; the answers pass the database's
  // rules for the form as it was sent; one form (the older walk-in) doesn't ask the address
  const db = defaultFormsData({ today: TODAY, newId: randomUUID, stamp: new Date(NOW).toISOString(), classes, schedule, calendar });
  assert.equal(db.submissions.length, 3);
  for (const s of db.submissions) {
    for (const c of s.children) {
      assert.deepEqual(Object.keys(c), ['first_name', 'last_name', 'dob', 'age'], s.parent_name);
      assert.equal(c.age, ageOn(c.dob, TODAY), s.parent_name);
    }
    const sent = s.children.map(({ age: _age, ...c }) => c);
    assert.equal(checkAnswers(s.fields, s.answers, sent, s.signature), true, s.parent_name);
  }
  assert.equal(db.submissions.filter((s) => s.answers.address).length, 2);
  const walkInForm = db.forms.find((f) => f.slug === 'walk-in-shrewsbury');
  assert.equal(walkInForm.published.some((f) => f.type === 'address'), false);
  assert.equal(db.forms.find((f) => f.slug === 'free-class-instagram').published[3].type, 'address');
});

group('backend: signatures deleted 90 days after the free class (v0.242)', () => {
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
