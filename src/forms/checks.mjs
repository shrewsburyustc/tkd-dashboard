// checks.mjs — plain checks for the PUBLIC forms page (src/forms/), run in Node:
//   node src/forms/checks.mjs          (after `npm run build` — it reads the real dist/ folder)
// Why it exists:
//   1. The pure parts of the page: reading the Function's answers (publicApi.js), the
//      "Add to calendar" file (ics.js), the thank-you text (text.js) and the preview database's
//      public functions (mockForms.js publicGet / publicSubmit) behave as planned.
//   2. Build plan §3: "A check confirms the real dist/ bundle contains no preview code." It opens
//      dist/forms.html, follows every JavaScript file that page can load (its script, preloads and
//      the files those import), and fails if any of them holds preview-only code, Supabase, or
//      anything that looks like a key. (Run `npm run build` first: `npm run build:preview-mode`
//      writes into dist/ too, and that build is SUPPOSED to hold the preview code.)
// Prints "ALL PUBLIC FORMS PAGE CHECKS PASSED", or stops at the first failed check.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readForm, readSubmit, toTimes } from './publicApi.js';
import { icsText, schoolTimeToUtc } from './ics.js';
import { fillThankYou, NO_CLASS_TIME, thankYouBody, thanksHeading } from './text.js';
import { template } from '../lib/forms/fields.js';
import { createFormsBackend } from '../lib/mockForms.js';

let groups = 0;
function group(name, fn) {
  fn();
  groups += 1;
  console.log(`ok  ${name}`);
}

group('publicApi: answers are read field by field', () => {
  const good = { class_id: 'c1', class_name: 'White', date: '2027-01-13', starts_at: '16:00', ends_at: '16:40', spots_left: 1 };
  assert.deepEqual(toTimes([good, { ...good, spots_left: null }, 'x', null]), [
    { classId: 'c1', className: 'White', date: '2027-01-13', start: '16:00', end: '16:40', spotsLeft: 1, ageFrom: null, ageTo: null },
  ]);
  // the class's ages (migration 0031, v0.619): whole numbers pass, anything else means none
  assert.deepEqual(toTimes([{ ...good, age_from: 7, age_to: 12 }]).map((t) => [t.ageFrom, t.ageTo]), [[7, 12]]);
  assert.deepEqual(toTimes([{ ...good, age_from: 13, age_to: null }]).map((t) => [t.ageFrom, t.ageTo]), [[13, null]]);
  assert.deepEqual(toTimes([{ ...good, age_from: '7', age_to: 12 }]).map((t) => [t.ageFrom, t.ageTo]), [[null, null]]);
  const form = readForm({ status: 'ok', form_name: 'Free class', fields: template('blank'), published_version: 2, school_name: 'Worcester', school_phone: null,
    thank_you: 'Hi {parent}', add_to_calendar: true, times: [good], turnstile_site_key: 'key' });
  assert.equal(form.status, 'ok');
  assert.equal(form.publishedVersion, 2);
  assert.equal(form.turnstileSiteKey, 'key');
  assert.equal(form.times.length, 1);
  assert.equal(readForm({ status: 'ok', fields: 'nope', published_version: 1 }).status, 'unavailable'); // fail closed
  assert.deepEqual(readForm({ status: 'closed', school_name: 'Worcester', school_phone: '508' }), { status: 'closed', schoolName: 'Worcester', schoolPhone: '508' });
  assert.deepEqual(readForm({ status: 'not_open' }), { status: 'not_open' });
  assert.deepEqual(readSubmit({ status: 'ok', repeat: true, bookings: [{ child: 0, class_name: 'White', date: '2027-01-13', starts_at: '16:00', ends_at: '16:40' }] }),
    { status: 'ok', bookings: [{ child: 0, className: 'White', date: '2027-01-13', start: '16:00', end: '16:40' }], kioskEnded: false });
  // the kiosk is told when its kiosk mode had ended (saved as a normal sign-up — kiosk plan K4)
  assert.equal(readSubmit({ status: 'ok', bookings: [], kiosk_ended: true }).kioskEnded, true);
  assert.equal(readSubmit({ status: 'ok', bookings: [], kiosk_ended: 'yes' }).kioskEnded, false);
  assert.deepEqual(readSubmit({ status: 'time_taken', times: [good] }).times.length, 1);
  assert.deepEqual(readSubmit({ status: 'verify_failed' }), { status: 'verify_failed' });
});

group('ics: Massachusetts times in UTC, across the clock changes', () => {
  assert.equal(new Date(schoolTimeToUtc('2027-01-13', '16:00')).toISOString(), '2027-01-13T21:00:00.000Z'); // EST = UTC-5
  assert.equal(new Date(schoolTimeToUtc('2027-07-14', '16:00')).toISOString(), '2027-07-14T20:00:00.000Z'); // EDT = UTC-4
  assert.equal(new Date(schoolTimeToUtc('2027-03-14', '09:30')).toISOString(), '2027-03-14T13:30:00.000Z'); // the spring-forward day
  assert.equal(new Date(schoolTimeToUtc('2027-11-07', '17:15')).toISOString(), '2027-11-07T22:15:00.000Z'); // the fall-back day
  const text = icsText({ events: [{ title: 'Free class for Sofia: White, ages 5+', date: '2027-01-13', start: '16:00', end: '16:40', location: 'U.S.T.C.; Worcester' }], now: Date.parse('2027-01-10T12:00:00Z') });
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(text.includes('\r\nDTSTART:20270113T210000Z\r\n'));
  assert.ok(text.includes('\r\nDTEND:20270113T214000Z\r\n'));
  assert.ok(text.includes('SUMMARY:Free class for Sofia: White\\, ages 5+'));
  assert.ok(text.includes('LOCATION:U.S.T.C.\\; Worcester'));
  assert.ok(text.endsWith('END:VCALENDAR\r\n'));
  assert.ok(text.split('\r\n').every((line) => line.length <= 75));
});

group('thank-you text: {parent} and {class time}; no email wording', () => {
  const b = { child: 0, className: 'White', date: '2027-01-13', start: '16:00', end: '16:40' };
  assert.equal(fillThankYou('Thanks, {parent}! See you {class time}.', { parentName: ' Maria  Lopez ', bookings: [b] }), 'Thanks, Maria! See you Wednesday, January 13 at 4:00 pm.');
  assert.equal(fillThankYou('{class time}', { parentName: 'A', bookings: [b, { ...b, child: 1 }] }), 'Wednesday, January 13 at 4:00 pm');
  assert.equal(fillThankYou('{class time}', { parentName: 'A', bookings: [] }), NO_CLASS_TIME);
  assert.match(fillThankYou(null, { parentName: 'Maria', bookings: [] }), /touch/);
  // the short heading + the message under it (F3 difference 3)
  assert.equal(thanksHeading(' Maria  Lopez '), 'Thanks, Maria!');
  assert.equal(thanksHeading(''), 'Thanks!');
  const info = { parentName: 'Maria', bookings: [b] };
  assert.equal(thankYouBody("Thank you, {parent}! We'll see you soon.", info), "We'll see you soon.");
  assert.equal(thankYouBody('Thanks {parent}!! See you {class time}.', info), 'See you Wednesday, January 13 at 4:00 pm.');
  assert.equal(thankYouBody('Hi {parent}', info), '');
  assert.equal(thankYouBody('See you {class time}, {parent}.', info), 'See you Wednesday, January 13 at 4:00 pm, Maria.');
  assert.equal(thankYouBody('Thank you! Bring water.', info), 'Thank you! Bring water.');
  assert.equal(thankYouBody(null, info), 'We will be in touch soon.');
  // Emails are off (rulebook v0.601): no page wording may promise one.
  const here = dirname(fileURLToPath(import.meta.url));
  for (const file of ['text.js', 'ThankYou.jsx', 'FormsApp.jsx', 'parts.jsx']) {
    const source = readFileSync(join(here, file), 'utf8').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(source, /we sent|sent a confirmation|confirmation email|check your (e-?mail|inbox)/i, file);
  }
});

group('preview database: forms_public_get / forms_public_submit', () => {
  const classes = [{ id: randomUUID(), location_code: 'worcester', name: 'White' }];
  const versionId = randomUUID();
  const schedule = { versions: [{ id: versionId, location_code: 'worcester', starts_on: '2026-01-01' }],
    slots: [{ id: randomUUID(), version_id: versionId, weekday: 3, starts_at: '16:00:00', ends_at: '16:40:00', class_ids: [classes[0].id] }] };
  let store = { schema: 2, forms: [], offers: [], limits: [], submissions: [], bookings: [], kioskTokens: [], signatureViews: [], statuses: [], prospects: [], notes: [], activity: [], opens: [] };
  const b = createFormsBackend({
    loadStore: () => store, saveStore: (s) => { store = JSON.parse(JSON.stringify(s)); }, now: () => Date.parse('2027-01-11T13:00:00Z'), newId: randomUUID,
    getSchedule: () => schedule, getCalendar: () => ({ closures: [], closureClasses: [] }), getClasses: () => classes, today: () => '2027-01-11',
  });
  const admin = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Admin' };
  const call = (name, args) => b.rpc(name, args, admin).data;
  const made = call('forms_create', { p_location_code: 'worcester', p_kind: 'free_class', p_name: 'Free class', p_slug: 'free-class' });
  const draft = template('free_class').map((f) => (f.type === 'waiver' ? { ...f, text: 'Our wording.' } : f));
  const saved = call('forms_save_draft', { p_form_id: made.id, p_expected_version: made.version, p_name: 'Free class', p_slug: 'free-class', p_draft: draft,
    p_settings: { thank_you: 'Thanks {parent}', alert_email: null, confirm_email: false, add_to_calendar: true } });
  const booked = call('forms_set_booking', { p_form_id: made.id, p_expected_version: saved.version, p_offers: [{ class_id: classes[0].id, default_limit: 1, days_ahead: 14, min_hours_ahead: 3 }], p_limits: [] });
  assert.equal(b.publicGet('free-class').status, 'not_found'); // still a Draft
  call('forms_publish', { p_form_id: made.id, p_expected_version: booked.version });
  const got = b.publicGet('free-class');
  assert.equal(got.status, 'ok');
  assert.equal(got.school_name, 'Worcester');
  assert.equal(got.alert_email, undefined); // never the school's alert address
  assert.deepEqual(got.times.map((t) => t.date), ['2027-01-13', '2027-01-20']);
  assert.equal(b.publicGet('admin').status, 'not_found');
  const sig = `data:image/png;base64,${'A'.repeat(300)}`;
  const send = (key, extra = {}) => b.publicSubmit({ slug: 'free-class', submissionKey: key, publishedVersion: 1,
    answers: { parent_name: 'Maria Lopez', parent_phone: '508-555-0142', parent_email: 'm@example.com', waiver: true },
    children: [{ first_name: 'Sofia', age: 8 }], bookings: [{ child: 0, class_id: classes[0].id, date: '2027-01-13', starts_at: '16:00' }], signature: sig, ...extra });
  const key = randomUUID();
  const ok = send(key);
  assert.equal(ok.status, 'ok');
  assert.equal(ok.bookings[0].date, '2027-01-13');
  assert.equal(send(key).repeat, true); // the same key twice saves once
  assert.equal(store.submissions.length, 1);
  assert.equal(store.submissions[0].source, 'public');
  assert.equal(store.submissions[0].entered_by, null);
  const taken = send(randomUUID());
  assert.equal(taken.status, 'time_taken'); // the only spot is gone
  assert.deepEqual(taken.times.map((t) => t.date), ['2027-01-20']);
  assert.equal(store.submissions.length, 1); // nothing saved
  assert.equal(send(randomUUID(), { publishedVersion: 9 }).status, 'form_changed');
  assert.equal(send(randomUUID(), { bookings: [], answers: { parent_name: 'Maria' } }).status, 'invalid');
  assert.equal(send('not-a-key').status, 'invalid');
  call('forms_set_status', { p_form_id: made.id, p_expected_version: store.forms[0].version, p_status: 'closed' });
  assert.equal(b.publicGet('free-class').status, 'closed');
  assert.equal(send(randomUUID(), { bookings: [] }).status, 'closed');
});

group('dist/: the real build of the forms page has no preview code, Supabase or keys', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
  const page = join(root, 'forms.html');
  assert.ok(existsSync(page), 'dist/forms.html is missing — run `npm run build` first');
  const html = readFileSync(page, 'utf8');
  // Every JavaScript file the page can load: its own script and preloads, then (repeatedly) what
  // those files import, statically or with import().
  const seen = new Set();
  const queue = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  assert.ok(queue.length > 0, 'forms.html loads no script?');
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const code = readFileSync(join(root, file), 'utf8');
    for (const m of code.matchAll(/["'`](?:\.\/|\/assets\/)([A-Za-z0-9_.-]+\.js)["'`]/g)) queue.push(`assets/${m[1]}`);
  }
  const forbidden = [
    /publicApi\.preview|formsPublicPreviewHelpers|__tkdPreview/, // the preview stand-in
    /tkd\.preview\./, // the preview's browser storage
    /createFormsBackend|createScheduleBackend|createTestingBackend|mockForms|mockClient/, // the fake database
    /supabase/i, // the dashboard's database library and address
    /sb_publishable_|sb_secret_|service_role|eyJhbGciOi/, // anything that looks like a key or token
    /VITE_SUPABASE/,
  ];
  for (const file of seen) {
    const code = readFileSync(join(root, file), 'utf8');
    for (const pattern of forbidden) assert.doesNotMatch(code, pattern, `${file} matches ${pattern}`);
  }
  // …and the page itself still talks to the Function.
  assert.ok([...seen].some((file) => readFileSync(join(root, file), 'utf8').includes('/api/forms/')), 'the page should call /api/forms/');
  console.log(`    (${seen.size} files checked: ${[...seen].join(', ')})`);
});

console.log(`ALL PUBLIC FORMS PAGE CHECKS PASSED (${groups} groups)`);
