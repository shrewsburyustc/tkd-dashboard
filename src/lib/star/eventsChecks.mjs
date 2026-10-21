// eventsChecks.mjs — automatic checks for the Star testing events data layer (build phase 2).
// Run:  node src/lib/star/eventsChecks.mjs      (prints ALL STAR EVENT CHECKS PASSED, exits 0)
// Why it exists: the preview database (mockStarEvents.js) must refuse exactly what migration 0006
// refuses, in the same order (contract 0006 §1.1, §6.2), and the API layer (eventsCore.js, which
// eventsApi.js uses) must send the right argument names and turn every answer into the right
// camelCase object. These plain `assert` checks run in milliseconds without a browser or a database.
// They go THROUGH the API layer, using a small fake client that hands each call to the preview
// database — the same path the screens take in preview mode.
//
// Covered: every §6.2 status in check order · copy-at-create (v0.61) · unique names (v0.92) ·
// start-time steps (§2.2) · the staff reopen rule (v0.86) · the closing-date rules (v0.85, v0.88) ·
// the state tags of v0.88 through eventRules · versions and "same values write nothing" · Delete
// event's counted candidates and net payment total · the links (production address, code pattern) ·
// the console helpers (failNextSave, simulateOtherAdminEdit, reset) · words for every status ·
// v0.504: an Edit save never reopens registration by itself (case 1 closes first, case 2 saves
// first, a normal edit, a refused / failed close, the midnight case, Undo reopening only).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStarBackend } from '../mockStarTesting.js';
import { createStarEventsBackend, STAR_EVENT_RPC_NAMES, STAR_EVENT_TABLES, SEED_EVENT_IDS } from '../mockStarEvents.js';
import { createRubricsApi } from './rubricsCore.js';
import { createStarEventsApi, STAR_EVENT_STATUSES, splitUpcomingPast, latestCreatedEvent } from './eventsCore.js';
import {
  startTimeIsValid, startTimeOptions, startTimeLabel, shortStartTime, STAR_CODE_PATTERN, WHERE_CODES, editWouldReopen,
} from './starEventRules.js';
import { starRegistrationLink, starQrSvgDataUrl, starSchoolLinks, isStarCode } from './links.js';
import { tagText, statusMessage, eventSummary, registrationStatusLine, switchOnlyHint } from './eventsText.js';
import { eventState, stateTag, addDays, PUBLIC_ORIGIN } from '../testing/eventRules.js';

let count = 0;
async function check(label, fn) {
  try {
    await fn();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
}

const TODAY = '2026-10-19';
const NOW = Date.parse('2026-10-19T16:00:00Z');

// ----- A test rig: in-memory store + both Star fakes + a fake client + the APIs on top -----
// ctx is who is asking; rig.setToday(date) moves "today" (like __tkdPreview.setToday).
function makeRig() {
  let store = null;
  let today = TODAY;
  const ctx = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Test Admin' };
  const saveStore = (s) => {
    store = JSON.stringify(s);
  };
  const star = createStarBackend({ loadStore: () => (store === null ? null : JSON.parse(store)), saveStore, now: () => NOW, newId: randomUUID });
  const events = createStarEventsBackend({ readBase: () => star.snapshot(), saveStore, now: () => NOW, today: () => today, newId: randomUUID });
  const calls = []; // every rpc sent: [name, args]
  const client = {
    from(table) {
      const q = { columns: '*', filters: [], orders: [] };
      const builder = {
        select(columns) { q.columns = columns; return builder; },
        eq(col, value) { q.filters.push({ col, value }); return builder; },
        in(col, values) { q.filters.push({ col, value: values, op: 'in' }); return builder; },
        order(col, { ascending = true } = {}) { q.orders.push({ col, ascending }); return builder; },
        then(resolve, reject) {
          const backend = STAR_EVENT_TABLES.includes(table) ? events : star;
          return Promise.resolve().then(() => backend.select(table, q.columns, q.filters, q.orders, ctx)).then(resolve, reject);
        },
      };
      return builder;
    },
    async rpc(name, args) {
      const sent = JSON.parse(JSON.stringify(args ?? {})); // JSON drops undefined values, like the network
      calls.push([name, sent]);
      if (STAR_EVENT_RPC_NAMES.includes(name)) return events.rpc(name, sent, ctx);
      return star.rpc(name, sent, ctx); // has_data_access and the rubric functions
    },
  };
  const api = createStarEventsApi(() => client, () => today);
  const rubrics = createRubricsApi(() => client);
  const editStore = (fn) => {
    const s = JSON.parse(store ?? JSON.stringify(events.snapshot()));
    fn(s);
    store = JSON.stringify(s);
  };
  return {
    api, rubrics, star, events, ctx, client, calls, editStore,
    setToday: (d) => { today = d; },
    staff: () => { ctx.isAdmin = false; },
    admin: () => { ctx.isAdmin = true; },
    lock: () => { ctx.hasDataAccess = false; },
  };
}

const statusOf = (r) => r.status;
const byName = (list, name) => list.find((e) => e.name === name);
// A valid Add event, changed by `over`.
const newEvent = (over = {}) => ({
  name: 'Summer Star Testing', testingDate: '2026-12-12', startTime: '10:00', whereCode: 'worcester',
  registrationOpen: false, autoCloseOn: '2026-12-05', note: null, ...over,
});
// Edit event's arguments for an event as loaded, changed by `over`.
const editOf = (e, over = {}) => ({
  eventId: e.id, expectedVersion: e.version, name: e.name, testingDate: e.testingDate, startTime: e.startTime,
  whereCode: e.whereCode, autoCloseOn: e.autoCloseOn, note: e.note, ...over,
});
async function loaded(rig, name) {
  const r = await rig.api.loadStarEvents();
  assert.equal(r.status, 'ok');
  return byName(r.events, name);
}

// =====================================================================================
// 1. The pure rules: start times, links, tags
// =====================================================================================

await check('start time: 8:00 AM to 8:00 PM on a 15-minute step, no seconds (star_start_time_is_valid)', async () => {
  for (const ok of ['08:00', '08:15', '10:00', '12:45', '19:45', '20:00', '10:00:00']) assert.equal(startTimeIsValid(ok), true, ok);
  for (const bad of ['07:45', '07:59', '20:15', '20:01', '10:05', '10:10', '10:00:30', '24:00', '8:00', 'abc', '', null, undefined, 1000]) {
    assert.equal(startTimeIsValid(bad), false, String(bad));
  }
  const options = startTimeOptions();
  assert.equal(options.length, 49); // 12 hours × 4 + the last one
  assert.deepEqual(options[0], { value: '08:00', label: '8:00 AM' });
  assert.deepEqual(options[16], { value: '12:00', label: '12:00 PM' });
  assert.deepEqual(options.at(-1), { value: '20:00', label: '8:00 PM' });
  assert.ok(options.every((o) => startTimeIsValid(o.value)));
  assert.equal(startTimeLabel('10:00:00'), '10:00 AM');
  assert.equal(shortStartTime('13:15:00'), '13:15');
  assert.equal(shortStartTime('nope'), null);
});

await check('links: production address, /star/<code>, one per school, code pattern ^[a-hjkmnp-z2-9]{8}$', async () => {
  assert.equal(PUBLIC_ORIGIN, 'https://tkd-dashboard.pages.dev');
  assert.equal(starRegistrationLink('fa2kxm7p'), 'https://tkd-dashboard.pages.dev/star/fa2kxm7p');
  // Not codes: upper case, look-alikes (i, l, o, 0, 1), too short / long, anything with a slash.
  for (const bad of ['FA2KXM7P', 'fa2kxm7i', 'fa2kxm7l', 'fa2kxm7o', 'fa2kxm70', 'fa2kxm71', 'fa2kxm7', 'fa2kxm7pp', 'fa2k/m7p', '', null, undefined, 12345678]) {
    assert.equal(starRegistrationLink(bad), '', String(bad));
    assert.equal(starQrSvgDataUrl(bad), '', String(bad));
    assert.equal(isStarCode(bad), false);
  }
  assert.equal(STAR_CODE_PATTERN.source, '^[a-hjkmnp-z2-9]{8}$');
  const qr = starQrSvgDataUrl('fa2kxm7p');
  assert.ok(qr.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.ok(decodeURIComponent(qr.slice(qr.indexOf(',') + 1)).startsWith('<svg'));
  const links = starSchoolLinks({ publicCodeWorcester: 'w7nd4hqe', publicCodeShrewsbury: 's3vb8tcr' });
  assert.deepEqual(links.map((l) => [l.locationCode, l.school, l.link]), [
    ['worcester', 'Worcester', 'https://tkd-dashboard.pages.dev/star/w7nd4hqe'],
    ['shrewsbury', 'Shrewsbury', 'https://tkd-dashboard.pages.dev/star/s3vb8tcr'],
  ]);
  // Database rows work too; a damaged code gives no link for that school.
  const fromRow = starSchoolLinks({ public_code_worcester: 'w7nd4hqe', public_code_shrewsbury: 'BAD' });
  assert.equal(fromRow[0].link, 'https://tkd-dashboard.pages.dev/star/w7nd4hqe');
  assert.equal(fromRow[1].link, '');
  assert.equal(fromRow[1].code, null);
});

await check('state tags of v0.88 through eventRules (the same rule as 0006 §5.1)', async () => {
  const ev = (over) => ({ testingDate: '2026-11-14', registrationOpen: false, autoCloseOn: null, firstOpenedAt: null, ...over });
  const tag = (e, today) => stateTag(eventState(e, today), e, today);
  assert.deepEqual(tag(ev({}), '2026-10-19'), { code: 'not_open_yet' });
  assert.deepEqual(tag(ev({ registrationOpen: true, firstOpenedAt: 'x', autoCloseOn: '2026-11-07' }), '2026-10-19'), { code: 'open_until', date: '2026-11-07' });
  assert.deepEqual(tag(ev({ registrationOpen: true, firstOpenedAt: 'x' }), '2026-10-19'), { code: 'open' });
  assert.deepEqual(tag(ev({ registrationOpen: true, firstOpenedAt: 'x', autoCloseOn: '2026-11-07' }), '2026-11-08'), { code: 'closed' }); // closed by the date
  assert.deepEqual(tag(ev({ firstOpenedAt: 'x' }), '2026-10-19'), { code: 'closed' }); // closed by hand
  assert.deepEqual(tag(ev({ registrationOpen: true, firstOpenedAt: 'x' }), '2026-11-14'), { code: 'testing_today' }); // date tags win
  assert.deepEqual(tag(ev({}), '2026-11-14'), { code: 'testing_today' });
  assert.deepEqual(tag(ev({ registrationOpen: true, firstOpenedAt: 'x' }), '2026-11-15'), { code: 'finished' });
  // Registration open on the testing day itself, closed (finished) the day after (v0.88).
  assert.equal(eventState(ev({ registrationOpen: true, firstOpenedAt: 'x' }), '2026-11-14'), 'open');
  assert.equal(eventState(ev({ registrationOpen: true, firstOpenedAt: 'x' }), '2026-11-15'), 'finished');
  // Words for every tag.
  assert.equal(tagText({ code: 'open_until', date: '2026-11-07' }), 'Open until Nov 7');
  for (const code of ['finished', 'testing_today', 'open', 'closed', 'not_open_yet']) assert.notEqual(tagText({ code }), '');
});

// =====================================================================================
// 2. Reading: the seed, counts, column lists
// =====================================================================================

await check('the seed: three made-up events, one upcoming open, one upcoming not open yet, one past', async () => {
  const rig = makeRig();
  const r = await rig.api.loadStarEvents();
  assert.equal(r.status, 'ok');
  assert.equal(r.today, TODAY);
  assert.equal(r.events.length, 3);
  const fall = byName(r.events, 'Fall Star Testing');
  const winter = byName(r.events, 'Winter Star Testing');
  const spring = byName(r.events, 'Spring Star Testing');
  assert.equal(fall.state, 'open');
  assert.deepEqual(fall.tag, { code: 'open_until', date: '2026-11-07' });
  assert.equal(fall.testingDate, '2026-11-14');
  assert.equal(fall.startTime, '10:00');
  assert.equal(fall.whereCode, 'shrewsbury');
  assert.equal(winter.state, 'not_open_yet');
  assert.equal(winter.firstOpenedAt, null);
  assert.equal(spring.state, 'finished');
  assert.equal(spring.isPast, true);
  // Counts: Fall has 3 active + 1 withdrawn, $140 paid; Spring 2 paid ($140 standard + $160 2nd Dan same day).
  assert.deepEqual([fall.activeCount, fall.withdrawnCount, fall.registrationCount, fall.paymentTotalCents], [3, 1, 4, 14000]);
  assert.deepEqual([spring.activeCount, spring.registrationCount, spring.paymentTotalCents], [2, 2, 30000]);
  assert.deepEqual([winter.activeCount, winter.registrationCount, winter.paymentTotalCents], [0, 0, 0]);
  for (const e of r.events) {
    assert.ok(isStarCode(e.publicCodeWorcester) && isStarCode(e.publicCodeShrewsbury));
    assert.notEqual(e.publicCodeWorcester, e.publicCodeShrewsbury);
  }
  const { upcoming, past } = splitUpcomingPast(r.events);
  assert.deepEqual(upcoming.map((e) => e.name), ['Fall Star Testing', 'Winter Star Testing']); // soonest first
  assert.deepEqual(past.map((e) => e.name), ['Spring Star Testing']);
  assert.equal(latestCreatedEvent(r.events).name, 'Winter Star Testing'); // added most recently
  assert.equal(latestCreatedEvent([]), null);
  // The summary line and the links dialog's status line.
  assert.equal(eventSummary(fall), 'Sat, Nov 14, 2026 · 10:00 AM at Shrewsbury school · both schools · 3 candidates');
  assert.equal(registrationStatusLine(fall), 'Registration is open until Sat, Nov 7.');
  assert.equal(registrationStatusLine(winter), "Registration hasn't been opened yet, so families can't sign up.");
  assert.equal(registrationStatusLine(spring), "Registration is closed, so families can't sign up right now.");
  assert.equal(switchOnlyHint(true), 'Registration stays open until you close it, or until the end of the testing day.');
});

await check('loadStarEvent: the event, its counts and its own copy of the rubrics and prices', async () => {
  const rig = makeRig();
  const r = await rig.api.loadStarEvent(SEED_EVENT_IDS.fall);
  assert.equal(r.status, 'ok');
  assert.equal(r.event.name, 'Fall Star Testing');
  assert.equal(r.event.activeCount, 3);
  assert.deepEqual(r.copy.dans.map((d) => [d.dan, d.label, d.passMark, d.starLimit, d.standardCents, d.sameDayCents, d.privateCents]), [
    [1, '1st Dan', 245, 4, 14000, 15000, 16000], [2, '2nd Dan', 245, 3, 15000, 16000, 17000], [3, '3rd Dan', 245, 5, 16000, 17000, 18000],
  ]);
  assert.deepEqual(r.copy.dans.map((d) => d.categories.length), [11, 13, 10]);
  assert.ok(r.copy.dans.every((d) => d.categories.filter((k) => k.fromClassCount).length === 1));
  assert.deepEqual(r.copy.grades.map((g) => [g.grade, g.value]), [['A+', 4.5], ['A', 4], ['B+', 3.5], ['B', 3], ['C+', 2.5], ['C', 2], ['D', 0]]);
  assert.deepEqual(r.copy.assistant.childMins, [15, 14, 13, 12, 11, 10]);
  assert.equal(r.copy.assistant.childMaxAge, 12);
  assert.equal(statusOf(await rig.api.loadStarEvent(randomUUID())), 'not_found');
  assert.equal(statusOf(await rig.api.loadStarEvent('not-a-uuid')), 'not_found');
});

await check('reads use explicit column lists; "*", login ids and DOB / email are refused by the fake', async () => {
  const rig = makeRig();
  const ctx = rig.ctx;
  const sel = (table, cols) => rig.events.select(table, cols, [], [], ctx);
  assert.equal(sel('star_events', '*').error.code, '42501');
  assert.equal(sel('star_events', 'id, created_by').error.code, '42501');
  assert.equal(sel('star_roster', 'id, date_of_birth').error.code, '42703'); // not in the view at all
  assert.equal(sel('star_roster', 'email_for_results').error.code, '42703');
  assert.equal(sel('star_event_dans', 'id, nope').error.code, '42703');
  assert.equal(sel('star_nope', 'id').error.code, 'PGRST205');
  // Every read the API made listed its columns (it would have failed otherwise) — and a locked
  // sign-in sees "no_access", never an empty list.
  rig.lock();
  assert.equal(statusOf(await rig.api.loadStarEvents()), 'no_access');
  assert.equal(statusOf(await rig.api.loadStarEvent(SEED_EVENT_IDS.fall)), 'no_access');
  assert.deepEqual(sel('star_events', 'id').data, []);
  rig.ctx.signedIn = false;
  assert.equal(sel('star_events', 'id').error.code, '42501');
});

await check('the API never throws: no client, a throwing client, unexpected answers → error', async () => {
  const none = createStarEventsApi(() => null, () => TODAY);
  for (const r of [await none.loadStarEvents(), await none.loadStarEvent(SEED_EVENT_IDS.fall), await none.addStarEvent(newEvent())]) assert.equal(r.status, 'error');
  const boom = createStarEventsApi(() => { throw new Error('boom'); }, () => TODAY);
  assert.equal(statusOf(await boom.loadStarEvents()), 'error');
  assert.equal(statusOf(await boom.setStarRegistration({ eventId: SEED_EVENT_IDS.fall, expectedVersion: 1, open: false })), 'error');
  const odd = createStarEventsApi(() => ({ rpc: async () => ({ data: { status: 'surprise' }, error: null }) }), () => TODAY);
  assert.equal(statusOf(await odd.addStarEvent(newEvent())), 'error');
  const badOk = createStarEventsApi(() => ({ rpc: async () => ({ data: { status: 'ok', id: 'x' }, error: null }) }), () => TODAY);
  assert.equal(statusOf(await badOk.addStarEvent(newEvent())), 'error');
});

// =====================================================================================
// 3. Add event: statuses in check order, copy-at-create, codes, names, times, closing date
// =====================================================================================

await check('star_add_event: argument names and ok answer (two codes, version 1); starts Closed', async () => {
  const rig = makeRig();
  const r = await rig.api.addStarEvent(newEvent({ note: '  Bring water.  ' }));
  assert.equal(r.status, 'ok');
  assert.equal(r.version, 1);
  assert.ok(isStarCode(r.publicCodeWorcester) && isStarCode(r.publicCodeShrewsbury));
  assert.notEqual(r.publicCodeWorcester, r.publicCodeShrewsbury);
  const [name, args] = rig.calls.at(-1);
  assert.equal(name, 'star_add_event');
  assert.deepEqual(Object.keys(args).sort(), ['p_auto_close_on', 'p_name', 'p_note', 'p_registration_open', 'p_start_time', 'p_testing_date', 'p_where_code']);
  assert.equal(args.p_start_time, '10:00:00');
  const e = await loaded(rig, 'Summer Star Testing');
  assert.equal(e.state, 'not_open_yet');
  assert.equal(e.note, 'Bring water.'); // stored tidied
  assert.equal(e.createdByName, 'Test Admin');
  // Opening straight away sets first_opened_at.
  const open = await rig.api.addStarEvent(newEvent({ name: 'Open Now', registrationOpen: true }));
  assert.equal(open.status, 'ok');
  assert.equal((await loaded(rig, 'Open Now')).state, 'open');
  assert.notEqual((await loaded(rig, 'Open Now')).firstOpenedAt, null);
  // Every code is unique across both columns of every event.
  for (let i = 0; i < 20; i += 1) assert.equal(statusOf(await rig.api.addStarEvent(newEvent({ name: `Many ${i}` }))), 'ok');
  const all = (await rig.api.loadStarEvents()).events.flatMap((x) => [x.publicCodeWorcester, x.publicCodeShrewsbury]);
  assert.equal(new Set(all).size, all.length);
});

await check('star_add_event: status check order no_access → not_allowed → invalid → template → duplicate_name', async () => {
  const rig = makeRig();
  const worst = newEvent({ name: 'Fall Star Testing', testingDate: '2020-01-01' }); // duplicate AND invalid
  rig.lock();
  assert.equal(statusOf(await rig.api.addStarEvent(worst)), 'no_access');
  rig.ctx.hasDataAccess = true;
  rig.staff();
  assert.equal(statusOf(await rig.api.addStarEvent(worst)), 'not_allowed');
  rig.admin();
  assert.equal(statusOf(await rig.api.addStarEvent(worst)), 'invalid'); // invalid beats duplicate_name
  // A template Dan with no subjects → invalid (step 6), before the duplicate name (step 7).
  rig.editStore((s) => { s.categories = s.categories.filter((k) => k.dan !== 3); });
  assert.equal(statusOf(await rig.api.addStarEvent(newEvent({ name: 'Fall Star Testing' }))), 'invalid');
  assert.equal(statusOf(await rig.api.addStarEvent(newEvent())), 'invalid');
  // Two Assistant Instructor subjects in one Dan → invalid too.
  const rig2 = makeRig();
  rig2.editStore((s) => { s.categories.find((k) => k.dan === 1 && !k.from_class_count).from_class_count = true; });
  assert.equal(statusOf(await rig2.api.addStarEvent(newEvent())), 'invalid');
  const rig3 = makeRig();
  assert.equal(statusOf(await rig3.api.addStarEvent(newEvent({ name: 'Fall Star Testing' }))), 'duplicate_name');
});

await check('star_add_event: unique names across every Star event, any case and spacing (v0.92)', async () => {
  const rig = makeRig();
  for (const name of ['Fall Star Testing', 'fall star testing', '  FALL  STAR   Testing ', 'Spring Star Testing']) {
    assert.equal(statusOf(await rig.api.addStarEvent(newEvent({ name }))), 'duplicate_name', name);
  }
  assert.equal(statusOf(await rig.api.addStarEvent(newEvent({ name: '  Summer   Star Testing ' }))), 'ok');
  assert.ok(await loaded(rig, 'Summer Star Testing')); // stored normalized
  assert.equal(statusOf(await rig.api.addStarEvent(newEvent({ name: 'SUMMER star testing' }))), 'duplicate_name');
});

await check('star_add_event: invalid values (name, date, start time steps, where, switch, closing date, note)', async () => {
  const rig = makeRig();
  const bad = [
    { name: '' }, { name: '   ' }, { name: 'x'.repeat(61) }, { name: null },
    { testingDate: null }, { testingDate: '2026-10-18' }, { testingDate: 'soon' }, { testingDate: '2026-02-30' },
    { startTime: null }, { startTime: '07:45' }, { startTime: '20:15' }, { startTime: '10:05' }, { startTime: '10:00:30' }, { startTime: 'ten' },
    { whereCode: null }, { whereCode: 'boston' }, { whereCode: 'Worcester' },
    { registrationOpen: null }, { registrationOpen: 'yes' },
    { autoCloseOn: '2026-12-13' }, // after the testing date
    { autoCloseOn: '2026-10-18' }, // before today
    { autoCloseOn: 'later' },
    { note: 'x'.repeat(601) }, { note: 'bad​note' },
  ];
  for (const over of bad) assert.equal(statusOf(await rig.api.addStarEvent(newEvent(over))), 'invalid', JSON.stringify(over));
  // Fine: today as the testing date, the closing date ON the testing date or today, no closing date,
  // both ends of the start-time range, no note / an empty note.
  const fine = [
    { testingDate: TODAY, autoCloseOn: TODAY }, { autoCloseOn: '2026-12-12' }, { autoCloseOn: null },
    { startTime: '08:00' }, { startTime: '20:00' }, { startTime: '13:45:00' }, { note: '' }, { note: 'x'.repeat(600) },
    { whereCode: 'shrewsbury' },
  ];
  for (const [i, over] of fine.entries()) assert.equal(statusOf(await rig.api.addStarEvent(newEvent({ name: `Fine ${i}`, ...over }))), 'ok', JSON.stringify(over));
  assert.deepEqual(WHERE_CODES, ['worcester', 'shrewsbury']);
});

await check('copy-at-create: the event keeps the rubric of the moment it was added (v0.61)', async () => {
  const rig = makeRig();
  assert.equal(statusOf(await rig.api.addStarEvent(newEvent({ name: 'Before' }))), 'ok');
  const before = await loaded(rig, 'Before');
  // An admin changes the template: 1st Dan's pass mark and fees, a subject's credits, a new subject,
  // the grade values and the assistant table.
  const rub = await rig.rubrics.loadRubrics();
  const d1 = rub.dans[0];
  assert.equal(statusOf(await rig.rubrics.updateDanSettings(1, d1.version, { passMark: 250, starLimit: 4, standardCents: 20000, sameDayCents: 21000, privateCents: 22000 })), 'ok');
  assert.equal(statusOf(await rig.rubrics.updateCategory(d1.categories[0].id, d1.categories[0].version, 'Curriculum', 20)), 'ok');
  assert.equal(statusOf(await rig.rubrics.addCategory(1, 'Sparring', 5)), 'ok');
  assert.equal(statusOf(await rig.rubrics.updateGradeValues(rub.grades.map((g) => g.version), [5, 4, 3.5, 3, 2.5, 2, 0])), 'ok');
  // The earlier event's copy (and the seeded ones') didn't move.
  const old = await rig.api.loadStarEvent(before.id);
  assert.equal(old.copy.dans[0].passMark, 245);
  assert.equal(old.copy.dans[0].standardCents, 14000);
  assert.equal(old.copy.dans[0].categories[0].name, 'White–Deputy Curriculum');
  assert.equal(old.copy.dans[0].categories[0].credits, 15);
  assert.equal(old.copy.dans[0].categories.length, 11);
  assert.equal(old.copy.grades[0].value, 4.5);
  // A new event copies the template as it is NOW.
  assert.equal(statusOf(await rig.api.addStarEvent(newEvent({ name: 'After' }))), 'ok');
  const fresh = await rig.api.loadStarEvent((await loaded(rig, 'After')).id);
  assert.equal(fresh.copy.dans[0].passMark, 250);
  assert.equal(fresh.copy.dans[0].standardCents, 20000);
  assert.equal(fresh.copy.dans[0].categories[0].name, 'Curriculum');
  assert.equal(fresh.copy.dans[0].categories.length, 12);
  assert.equal(fresh.copy.grades[0].value, 5);
  // Each copied subject remembers which template subject it came from.
  assert.equal(fresh.copy.dans[0].categories[0].templateCategoryId, d1.categories[0].id);
  // Deleting a template subject doesn't touch an event either.
  const now = await rig.rubrics.loadRubrics();
  const extra = now.dans[0].categories.find((k) => k.name === 'Sparring');
  assert.equal(statusOf(await rig.rubrics.deleteCategory(extra.id, extra.version)), 'ok');
  assert.equal((await rig.api.loadStarEvent(fresh.event.id)).copy.dans[0].categories.length, 12);
});

// =====================================================================================
// 4. Edit event
// =====================================================================================

await check('star_update_event: status check order no_access → not_allowed → invalid → not_found → stale → date rules → duplicate_name', async () => {
  const rig = makeRig();
  const fall = await loaded(rig, 'Fall Star Testing');
  rig.lock();
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { eventId: null }))), 'no_access');
  rig.ctx.hasDataAccess = true;
  rig.staff();
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { eventId: null }))), 'not_allowed');
  rig.admin();
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { eventId: null }))), 'invalid');
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { expectedVersion: null }))), 'invalid');
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { eventId: randomUUID(), startTime: '10:05' }))), 'invalid'); // invalid before not_found
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { eventId: randomUUID() }))), 'not_found');
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { expectedVersion: 9, testingDate: '2026-10-01' }))), 'stale'); // stale before the date rule
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { testingDate: '2026-10-01', name: 'Winter Star Testing' }))), 'invalid'); // date rule before duplicate
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { name: 'winter star testing' }))), 'duplicate_name');
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { name: 'FALL STAR TESTING' }))), 'ok'); // its own name (another case) is fine
});

await check('star_update_event: versions, same values write nothing, the copy and the switch untouched', async () => {
  const rig = makeRig();
  const fall = await loaded(rig, 'Fall Star Testing');
  const same = await rig.api.updateStarEvent(editOf(fall));
  assert.deepEqual(same, { status: 'ok', version: fall.version });
  const changed = await rig.api.updateStarEvent(editOf(fall, { startTime: '11:30', whereCode: 'worcester', note: 'New note' }));
  assert.deepEqual(changed, { status: 'ok', version: fall.version + 1 });
  const after = await loaded(rig, 'Fall Star Testing');
  assert.deepEqual([after.startTime, after.whereCode, after.note, after.registrationOpen], ['11:30', 'worcester', 'New note', true]);
  assert.equal(after.updatedByName, 'Test Admin');
  const [name, args] = rig.calls.filter(([n]) => n === 'star_update_event').at(-1);
  assert.equal(name, 'star_update_event');
  assert.equal('p_registration_open' in args, false); // §11 item 7
  // The old version is now stale.
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { name: 'X' }))), 'stale');
});

await check('star_update_event: date and closing-date rules (v0.85, v0.92)', async () => {
  const rig = makeRig();
  const fall = await loaded(rig, 'Fall Star Testing');
  // Closing date after the (new) testing date → invalid; on it → fine.
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { autoCloseOn: '2026-11-15' }))), 'invalid');
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { testingDate: '2026-11-06' }))), 'invalid'); // closing Nov 7 is now after it
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { autoCloseOn: '2026-11-14' }))), 'ok');
  // A changed closing date in the past → invalid.
  const f2 = await loaded(rig, 'Fall Star Testing');
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(f2, { autoCloseOn: '2026-10-18' }))), 'invalid');
  // A PAST event may keep its date and its (past) closing date when another field changes …
  const spring = await loaded(rig, 'Spring Star Testing');
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(spring, { note: 'Typo fixed' }))), 'ok');
  // … but can't be moved to another past date; moving it into the future makes it Upcoming again.
  const s2 = await loaded(rig, 'Spring Star Testing');
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(s2, { testingDate: addDays(s2.testingDate, 1) }))), 'invalid');
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(s2, { testingDate: '2027-04-10', autoCloseOn: null }))), 'ok');
  const moved = await loaded(rig, 'Spring Star Testing');
  assert.equal(moved.isPast, false);
  assert.equal(moved.state, 'closed'); // it had been opened before, and is closed
});

// =====================================================================================
// 5. Open / Close registration (staff and admins)
// =====================================================================================

await check('star_set_registration: status check order no_access → invalid → not_found → stale → finished → not_allowed', async () => {
  const rig = makeRig();
  const spring = await loaded(rig, 'Spring Star Testing');
  rig.lock();
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: null, expectedVersion: 1, open: true })), 'no_access');
  rig.ctx.hasDataAccess = true;
  rig.staff(); // staff may call it: no not_allowed at step 2
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: null, expectedVersion: 1, open: true })), 'invalid');
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: spring.id, expectedVersion: null, open: true })), 'invalid');
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: spring.id, expectedVersion: 1, open: null })), 'invalid');
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: randomUUID(), expectedVersion: 1, open: true })), 'not_found');
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: spring.id, expectedVersion: 99, open: true })), 'stale');
  // Finished beats the staff date rule (Spring's closing date has passed too).
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: spring.id, expectedVersion: spring.version, open: true })), 'finished');
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: spring.id, expectedVersion: spring.version, open: false })), 'finished');
  rig.admin();
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: spring.id, expectedVersion: spring.version, open: true })), 'finished');
});

await check('staff reopen rule (v0.86): staff close any time, open only until the closing date; admins reopen and the date goes', async () => {
  const rig = makeRig();
  rig.staff();
  let fall = await loaded(rig, 'Fall Star Testing');
  // Before the closing date: staff close and open again.
  const closed = await rig.api.setStarRegistration({ eventId: fall.id, expectedVersion: fall.version, open: false });
  assert.deepEqual(closed, { status: 'ok', version: fall.version + 1, state: 'closed' });
  const reopened = await rig.api.setStarRegistration({ eventId: fall.id, expectedVersion: closed.version, open: true });
  assert.deepEqual(reopened, { status: 'ok', version: closed.version + 1, state: 'open' });
  // The closing date (Nov 7) is still allowed on the day itself …
  rig.setToday('2026-11-07');
  fall = await loaded(rig, 'Fall Star Testing');
  assert.equal(fall.state, 'open');
  // … and closes by itself at the end of it.
  rig.setToday('2026-11-08');
  fall = await loaded(rig, 'Fall Star Testing');
  assert.equal(fall.state, 'closed_by_date');
  assert.deepEqual(fall.tag, { code: 'closed' });
  // Staff can't reopen now; closing still works.
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: fall.id, expectedVersion: fall.version, open: true })), 'not_allowed');
  const staffClose = await rig.api.setStarRegistration({ eventId: fall.id, expectedVersion: fall.version, open: false });
  assert.deepEqual(staffClose, { status: 'ok', version: fall.version + 1, state: 'closed' });
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: fall.id, expectedVersion: staffClose.version, open: true })), 'not_allowed');
  // An admin reopens: the closing date is removed (it would close again at once otherwise).
  rig.admin();
  const adminOpen = await rig.api.setStarRegistration({ eventId: fall.id, expectedVersion: staffClose.version, open: true });
  assert.deepEqual(adminOpen, { status: 'ok', version: staffClose.version + 1, state: 'open' });
  fall = await loaded(rig, 'Fall Star Testing');
  assert.equal(fall.autoCloseOn, null);
  assert.deepEqual(fall.tag, { code: 'open' });
  // With no closing date it stays open through the testing day and is finished the day after (v0.88).
  rig.setToday('2026-11-14');
  fall = await loaded(rig, 'Fall Star Testing');
  assert.equal(fall.state, 'open');
  assert.deepEqual(fall.tag, { code: 'testing_today' });
  assert.equal(fall.isPast, false); // the testing day stays in Upcoming (v0.89)
  rig.setToday('2026-11-15');
  fall = await loaded(rig, 'Fall Star Testing');
  assert.equal(fall.state, 'finished');
  assert.deepEqual(fall.tag, { code: 'finished' });
  assert.equal(fall.isPast, true);
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: fall.id, expectedVersion: fall.version, open: false })), 'finished');
});

await check('star_set_registration: same value writes nothing; first opening sets first_opened_at once; admin reopen of a closed_by_date event that is still switched on', async () => {
  const rig = makeRig();
  let winter = await loaded(rig, 'Winter Star Testing');
  const same = await rig.api.setStarRegistration({ eventId: winter.id, expectedVersion: winter.version, open: false });
  assert.deepEqual(same, { status: 'ok', version: winter.version, state: 'not_open_yet' });
  const opened = await rig.api.setStarRegistration({ eventId: winter.id, expectedVersion: winter.version, open: true });
  winter = await loaded(rig, 'Winter Star Testing');
  const firstOpened = winter.firstOpenedAt;
  assert.notEqual(firstOpened, null);
  const closed = await rig.api.setStarRegistration({ eventId: winter.id, expectedVersion: opened.version, open: false });
  assert.equal(closed.state, 'closed'); // was open, now closed (not "not open yet")
  await rig.api.setStarRegistration({ eventId: winter.id, expectedVersion: closed.version, open: true });
  assert.equal((await loaded(rig, 'Winter Star Testing')).firstOpenedAt, firstOpened);
  // Fall is switched on; after its closing date an admin "opens" it again: the date is cleared and
  // the version goes up although the switch itself didn't change.
  rig.setToday('2026-11-08');
  const fall = await loaded(rig, 'Fall Star Testing');
  const r = await rig.api.setStarRegistration({ eventId: fall.id, expectedVersion: fall.version, open: true });
  assert.deepEqual(r, { status: 'ok', version: fall.version + 1, state: 'open' });
});

await check('saveStarEventEdit: the switch is sent afterwards with the NEW version, only when it changed (§11 item 7)', async () => {
  const rig = makeRig();
  let winter = await loaded(rig, 'Winter Star Testing');
  // Switch unchanged → one call only.
  rig.calls.length = 0;
  let r = await rig.api.saveStarEventEdit({ ...editOf(winter, { note: 'A' }), registrationOpen: false, previousRegistrationOpen: false });
  assert.deepEqual(r, { status: 'ok', version: winter.version + 1, registration: null });
  assert.deepEqual(rig.calls.map(([n]) => n), ['star_update_event']);
  // Switch changed → update, then set_registration with the version the update returned.
  winter = await loaded(rig, 'Winter Star Testing');
  rig.calls.length = 0;
  r = await rig.api.saveStarEventEdit({ ...editOf(winter, { note: 'B' }), registrationOpen: true, previousRegistrationOpen: false });
  assert.deepEqual(r, { status: 'ok', version: winter.version + 2, registration: { status: 'ok', open: true, state: 'open' } });
  assert.deepEqual(rig.calls.map(([n]) => n), ['star_update_event', 'star_set_registration']);
  assert.equal(rig.calls[1][1].p_expected_version, winter.version + 1);
  // Details unchanged but switch changed: the update writes nothing, the switch still uses its version.
  winter = await loaded(rig, 'Winter Star Testing');
  r = await rig.api.saveStarEventEdit({ ...editOf(winter), registrationOpen: false, previousRegistrationOpen: true });
  assert.deepEqual(r, { status: 'ok', version: winter.version + 1, registration: { status: 'ok', open: false, state: 'closed' } });
  // A refused update sends nothing else.
  rig.calls.length = 0;
  r = await rig.api.saveStarEventEdit({ ...editOf(winter), registrationOpen: true, previousRegistrationOpen: false });
  assert.deepEqual(r, { status: 'stale' });
  assert.equal(rig.calls.length, 1);
  // Details saved but the switch refused (a past event can't change its switch): reported apart.
  const spring = await loaded(rig, 'Spring Star Testing');
  r = await rig.api.saveStarEventEdit({ ...editOf(spring, { note: 'C' }), registrationOpen: true, previousRegistrationOpen: false });
  assert.deepEqual(r, { status: 'ok', version: spring.version + 1, registration: { status: 'finished', open: true } });
});

await check('v0.504 pure rule: editWouldReopen only for an Open switch left Open on an event that was not open', async () => {
  const saved = { testingDate: '2026-12-12', autoCloseOn: null };
  assert.equal(editWouldReopen({ previousState: 'closed_by_date', registrationOpen: true, previousRegistrationOpen: true, saved, today: TODAY }), true);
  assert.equal(editWouldReopen({ previousState: 'finished', registrationOpen: true, previousRegistrationOpen: true, saved, today: TODAY }), true);
  assert.equal(editWouldReopen({ previousState: 'open', registrationOpen: true, previousRegistrationOpen: true, saved, today: TODAY }), false); // already open
  assert.equal(editWouldReopen({ previousState: 'not_open_yet', registrationOpen: true, previousRegistrationOpen: false, saved, today: TODAY }), false); // the person opens it
  assert.equal(editWouldReopen({ previousState: 'closed', registrationOpen: false, previousRegistrationOpen: false, saved, today: TODAY }), false); // switch Closed
  // still closed by its (passed) date after the save: nothing to do
  assert.equal(editWouldReopen({ previousState: 'closed_by_date', registrationOpen: true, previousRegistrationOpen: true, saved: { testingDate: '2026-12-12', autoCloseOn: '2026-10-10' }, today: TODAY }), false);
});

// Edit as the dialog sends it (v0.504: with the state the event had before the save).
// previous = the record as loaded; saveStarEventEdit works its state out fresh at save time.
const editSave = (e, over = {}) => ({
  ...editOf(e), registrationOpen: e.registrationOpen, previousRegistrationOpen: e.registrationOpen,
  previous: { testingDate: e.testingDate, registrationOpen: e.registrationOpen, autoCloseOn: e.autoCloseOn, firstOpenedAt: e.firstOpenedAt },
  ...over,
});

await check('v0.504 case 1: unticking a passed closing date (switch Open) → closed FIRST, then saved with the close\'s version', async () => {
  const rig = makeRig();
  let fall = await loaded(rig, 'Fall Star Testing');
  rig.setToday(addDays(fall.autoCloseOn, 2)); // the closing date has passed
  fall = await loaded(rig, 'Fall Star Testing');
  assert.equal(fall.state, 'closed_by_date');
  rig.calls.length = 0;
  const r = await rig.api.saveStarEventEdit(editSave(fall, { autoCloseOn: null }));
  assert.deepEqual(rig.calls.map(([n]) => n), ['star_set_registration', 'star_update_event']);
  assert.equal(rig.calls[0][1].p_open, false);
  assert.equal(rig.calls[0][1].p_expected_version, fall.version);
  assert.equal(rig.calls[1][1].p_expected_version, fall.version + 1); // the version the close returned
  assert.deepEqual(r, { status: 'ok', version: fall.version + 2, registration: null, keptClosed: { status: 'ok', state: 'closed' } });
  const after = await loaded(rig, 'Fall Star Testing');
  assert.equal(after.state, 'closed');
  assert.equal(after.autoCloseOn, null);
  // Undo undoes only the close: the switch back to Open with the version then current.
  const undo = await rig.api.setStarRegistration({ eventId: after.id, expectedVersion: r.version, open: true });
  assert.equal(undo.status, 'ok');
  const reopened = await loaded(rig, 'Fall Star Testing');
  assert.equal(reopened.state, 'open');
  assert.equal(reopened.autoCloseOn, null); // the edit itself stays
});

await check('v0.504 case 1, a refused close: nothing is saved (the close\'s answer is the save\'s answer)', async () => {
  const rig = makeRig();
  let fall = await loaded(rig, 'Fall Star Testing');
  rig.setToday(addDays(fall.autoCloseOn, 2));
  fall = await loaded(rig, 'Fall Star Testing');
  const realRpc = rig.client.rpc;
  rig.client.rpc = async (name, args) => (name === 'star_set_registration' ? { data: null, error: new Error('dropped') } : realRpc(name, args));
  rig.calls.length = 0;
  const r = await rig.api.saveStarEventEdit(editSave(fall, { autoCloseOn: null }));
  rig.client.rpc = realRpc;
  assert.equal(r.status, 'error');
  const after = await loaded(rig, 'Fall Star Testing');
  assert.equal(after.version, fall.version);
  assert.equal(after.autoCloseOn, fall.autoCloseOn); // details not saved
  assert.equal(after.state, 'closed_by_date'); // still not open
});

await check('v0.504 security: the state is worked out at save time — list loaded on the closing day, saved after midnight', async () => {
  const rig = makeRig();
  let fall = await loaded(rig, 'Fall Star Testing');
  rig.setToday(fall.autoCloseOn); // the list loads on the closing day: still open
  fall = await loaded(rig, 'Fall Star Testing');
  assert.equal(fall.state, 'open');
  rig.setToday(addDays(fall.autoCloseOn, 1)); // after midnight it closed by its date
  rig.calls.length = 0;
  const r = await rig.api.saveStarEventEdit(editSave(fall, { autoCloseOn: null })); // the stale list said "open"
  assert.deepEqual(rig.calls.map(([n]) => n), ['star_set_registration', 'star_update_event']);
  assert.equal(r.keptClosed?.status, 'ok');
  assert.equal((await loaded(rig, 'Fall Star Testing')).state, 'closed');
});

await check('v0.504 case 2: a finished event (switch Open, no closing date) moved into the future → closed after the save', async () => {
  const rig = makeRig();
  let spring = await loaded(rig, 'Spring Star Testing');
  rig.editStore((s) => {
    const e = s.events.find((x) => x.id === spring.id);
    e.registration_open = true;
    e.auto_close_on = null;
  });
  spring = await loaded(rig, 'Spring Star Testing');
  assert.equal(spring.state, 'finished');
  rig.calls.length = 0;
  const r = await rig.api.saveStarEventEdit(editSave(spring, { testingDate: addDays(TODAY, 30) }));
  // details first (it stays "finished" until the new date is saved), then the close
  assert.deepEqual(rig.calls.map(([n]) => n), ['star_update_event', 'star_set_registration']);
  // M5 (migration 0023): the save itself already turned the switch to Closed (one write, one version
  // step), so the follow-up close finds it closed and writes nothing
  assert.deepEqual(r, { status: 'ok', version: spring.version + 1, registration: null, keptClosed: { status: 'ok', state: 'closed' } });
  assert.equal((await loaded(rig, 'Spring Star Testing')).state, 'closed');
});

await check('v0.504: a normal edit never touches the switch', async () => {
  const rig = makeRig();
  const fall = await loaded(rig, 'Fall Star Testing'); // open, with a closing date
  rig.calls.length = 0;
  let r = await rig.api.saveStarEventEdit(editSave(fall, { note: 'Bring water.' }));
  assert.deepEqual(r, { status: 'ok', version: fall.version + 1, registration: null });
  assert.deepEqual(rig.calls.map(([n]) => n), ['star_update_event']);
  const winter = await loaded(rig, 'Winter Star Testing'); // not open yet, switch Closed
  rig.calls.length = 0;
  r = await rig.api.saveStarEventEdit(editSave(winter, { autoCloseOn: null }));
  assert.deepEqual(r, { status: 'ok', version: winter.version + 1, registration: null });
  assert.deepEqual(rig.calls.map(([n]) => n), ['star_update_event']);
});

await check('v0.504 case 2, the close fails after the save → reported (registration IS open), version = the save\'s', async () => {
  const rig = makeRig();
  let spring = await loaded(rig, 'Spring Star Testing');
  rig.editStore((s) => {
    const e = s.events.find((x) => x.id === spring.id);
    e.registration_open = true;
    e.auto_close_on = null;
  });
  spring = await loaded(rig, 'Spring Star Testing');
  const realRpc = rig.client.rpc;
  rig.client.rpc = async (name, args) => (name === 'star_set_registration' ? { data: null, error: new Error('dropped') } : realRpc(name, args));
  let r = await rig.api.saveStarEventEdit(editSave(spring, { testingDate: addDays(TODAY, 30) }));
  assert.equal(r.status, 'ok');
  assert.equal(r.version, spring.version + 1);
  assert.deepEqual(r.keptClosed, { status: 'error' });
  // M5 (migration 0023): the save turned the switch to Closed in the same write, so registration is
  // closed even though the follow-up call failed (before 0023 it stayed open here)
  assert.equal((await loaded(rig, 'Spring Star Testing')).state, 'closed');
  // A stale close is reported the same way.
  rig.client.rpc = async (name, args) => (name === 'star_set_registration' ? { data: { status: 'stale' }, error: null } : realRpc(name, args));
  rig.editStore((s) => {
    const e = s.events.find((x) => x.id === spring.id);
    e.testing_date = addDays(TODAY, -20); // finished again…
    e.registration_open = true; // …with the switch Open again (M5 closed it in the save above)
  });
  spring = await loaded(rig, 'Spring Star Testing');
  assert.equal(spring.state, 'finished');
  r = await rig.api.saveStarEventEdit(editSave(spring, { testingDate: addDays(TODAY, 40) }));
  assert.deepEqual(r.keptClosed, { status: 'stale' });
  rig.client.rpc = realRpc;
  // "Close registration" (the screen re-reads the event, then closes it with its current version)
  spring = await loaded(rig, 'Spring Star Testing');
  assert.equal(spring.state, 'closed'); // M5: already closed by the save; the close below writes nothing
  const retry = await rig.api.setStarRegistration({ eventId: spring.id, expectedVersion: spring.version, open: false });
  assert.equal(retry.status, 'ok');
  assert.equal((await loaded(rig, 'Spring Star Testing')).state, 'closed');
});

// =====================================================================================
// 6. Delete event
// =====================================================================================

await check('star_delete_event: status check order no_access → not_allowed → invalid → not_found → stale (version, count, total) → ok', async () => {
  const rig = makeRig();
  const fall = await loaded(rig, 'Fall Star Testing');
  const del = (over = {}) => rig.api.deleteStarEvent({
    eventId: fall.id, expectedVersion: fall.version, expectedCandidateCount: fall.registrationCount,
    expectedPaymentTotalCents: fall.paymentTotalCents, ...over,
  });
  rig.lock();
  assert.equal(statusOf(await del({ eventId: null })), 'no_access');
  rig.ctx.hasDataAccess = true;
  rig.staff();
  assert.equal(statusOf(await del({ eventId: null })), 'not_allowed');
  rig.admin();
  for (const key of ['eventId', 'expectedVersion', 'expectedCandidateCount', 'expectedPaymentTotalCents']) {
    assert.equal(statusOf(await del({ [key]: null, ...(key === 'eventId' ? {} : { eventId: randomUUID() }) })), 'invalid', key); // invalid before not_found
  }
  assert.equal(statusOf(await del({ eventId: randomUUID() })), 'not_found');
  assert.equal(statusOf(await del({ expectedVersion: 99 })), 'stale');
  assert.equal(statusOf(await del({ expectedCandidateCount: 3 })), 'stale'); // the active count isn't enough: ALL 4
  assert.equal(statusOf(await del({ expectedPaymentTotalCents: 0 })), 'stale');
  const [name, args] = rig.calls.at(-1);
  assert.equal(name, 'star_delete_event');
  assert.deepEqual(Object.keys(args).sort(), ['p_event_id', 'p_expected_candidate_count', 'p_expected_payment_total_cents', 'p_expected_version']);
  assert.equal(statusOf(await del()), 'ok');
  assert.equal(statusOf(await rig.api.loadStarEvent(fall.id)), 'not_found');
  assert.equal(statusOf(await del()), 'not_found');
  // The copy, the candidates and their payments went with it; the other events stayed.
  const snap = rig.events.snapshot();
  assert.equal(snap.event_dans.some((d) => d.event_id === fall.id), false);
  assert.equal(snap.event_categories.some((d) => d.event_id === fall.id), false);
  assert.equal(snap.event_grades.some((d) => d.event_id === fall.id), false);
  assert.equal(snap.event_assistant.some((d) => d.event_id === fall.id), false);
  assert.equal(snap.candidates.some((c) => c.event_id === fall.id), false);
  assert.equal(snap.payments.length, 2); // Spring's two
  assert.equal((await rig.api.loadStarEvents()).events.length, 2);
});

await check('star_delete_event: a candidate or payment added since the dialog counted → stale (net total, refunds included)', async () => {
  const rig = makeRig();
  const spring = await loaded(rig, 'Spring Star Testing');
  const args = { eventId: spring.id, expectedVersion: spring.version, expectedCandidateCount: 2, expectedPaymentTotalCents: 30000 };
  // A refund of $20 on one candidate (as phase 3 will record it): the net total is now $280.
  rig.editStore((s) => {
    const c = s.candidates.find((x) => x.event_id === spring.id);
    s.payments.push({ id: randomUUID(), candidate_id: c.id, kind: 'refund', amount_cents: -2000, method: 'cash', paid_on: TODAY, recorded_at: new Date(NOW).toISOString(), recorded_by: null, recorded_by_name: 'Staff', reverses_payment_id: null });
  });
  assert.equal(statusOf(await rig.api.deleteStarEvent(args)), 'stale');
  const now = await loaded(rig, 'Spring Star Testing');
  assert.equal(now.paymentTotalCents, 28000);
  // A withdrawn candidate still counts.
  rig.editStore((s) => {
    const c = { ...s.candidates.find((x) => x.event_id === spring.id), id: randomUUID(), status: 'withdrawn', withdrawn_reason: 'withdrawn' };
    s.candidates.push(c);
  });
  const later = await loaded(rig, 'Spring Star Testing');
  assert.deepEqual([later.activeCount, later.withdrawnCount, later.registrationCount], [2, 1, 3]);
  assert.equal(statusOf(await rig.api.deleteStarEvent({ ...args, expectedPaymentTotalCents: 28000 })), 'stale');
  assert.equal(statusOf(await rig.api.deleteStarEvent({ ...args, expectedCandidateCount: 3, expectedPaymentTotalCents: 28000 })), 'ok');
});

await check('star_delete_event: a make-up row in a later event keeps its row, with the link set to null', async () => {
  const rig = makeRig();
  const spring = await loaded(rig, 'Spring Star Testing');
  const fall = await loaded(rig, 'Fall Star Testing');
  let earlierId = null;
  rig.editStore((s) => {
    const earlier = s.candidates.find((x) => x.event_id === spring.id);
    earlierId = earlier.id;
    s.candidates.push({ ...earlier, id: randomUUID(), event_id: fall.id, is_makeup: true, makeup_of_candidate_id: earlier.id, makeup_of_event_name: spring.name, paying_by: null });
  });
  assert.equal(statusOf(await rig.api.deleteStarEvent({ eventId: spring.id, expectedVersion: spring.version, expectedCandidateCount: 2, expectedPaymentTotalCents: 30000 })), 'ok');
  const makeup = rig.events.snapshot().candidates.find((c) => c.is_makeup);
  assert.equal(makeup.makeup_of_candidate_id, null);
  assert.equal(makeup.makeup_of_event_name, 'Spring Star Testing'); // the name snapshot stays
  assert.notEqual(earlierId, null);
});

// =====================================================================================
// 7. The console helpers, the store, the words
// =====================================================================================

await check('failNextSave: the next call fails like a dropped connection and changes nothing', async () => {
  const rig = makeRig();
  const fall = await loaded(rig, 'Fall Star Testing');
  const before = JSON.stringify(rig.events.snapshot());
  rig.events.failNextSave();
  const r = await rig.api.setStarRegistration({ eventId: fall.id, expectedVersion: fall.version, open: false });
  assert.equal(r.status, 'error');
  assert.equal(JSON.stringify(rig.events.snapshot()), before);
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: fall.id, expectedVersion: fall.version, open: false })), 'ok'); // only once
});

await check('simulateOtherAdminEdit: every open dialog, menu and Undo goes stale', async () => {
  const rig = makeRig();
  const fall = await loaded(rig, 'Fall Star Testing');
  rig.events.simulateOtherAdminEdit();
  assert.equal(statusOf(await rig.api.updateStarEvent(editOf(fall, { note: 'x' }))), 'stale');
  assert.equal(statusOf(await rig.api.setStarRegistration({ eventId: fall.id, expectedVersion: fall.version, open: false })), 'stale');
  assert.equal(statusOf(await rig.api.deleteStarEvent({ eventId: fall.id, expectedVersion: fall.version, expectedCandidateCount: 4, expectedPaymentTotalCents: 14000 })), 'stale');
  assert.equal((await loaded(rig, 'Fall Star Testing')).updatedByName, 'Other Admin');
});

await check('reset / a damaged store: back to the seed; only an ok answer is saved; the rubric template is kept', async () => {
  const rig = makeRig();
  await rig.api.addStarEvent(newEvent());
  const rub = await rig.rubrics.loadRubrics();
  await rig.rubrics.addCategory(2, 'Extra', 5);
  rig.events.reset();
  const r = await rig.api.loadStarEvents();
  assert.deepEqual(r.events.map((e) => e.name).sort(), ['Fall Star Testing', 'Spring Star Testing', 'Winter Star Testing']);
  assert.equal((await rig.rubrics.loadRubrics()).dans[1].categories.length, rub.dans[1].categories.length + 1); // template kept
  rig.editStore((s) => { s.events = 'damaged'; });
  assert.equal((await rig.api.loadStarEvents()).events.length, 3);
  const before = JSON.stringify(rig.events.snapshot());
  assert.equal(statusOf(await rig.api.addStarEvent(newEvent({ name: 'Fall Star Testing' }))), 'duplicate_name');
  assert.equal(statusOf(await rig.api.addStarEvent(newEvent({ startTime: '10:05' }))), 'invalid');
  assert.equal(JSON.stringify(rig.events.snapshot()), before);
  // The seed is made relative to "today": with another today the dates move along.
  const later = makeRig();
  later.setToday('2027-01-01');
  const f = await loaded(later, 'Fall Star Testing');
  assert.equal(f.testingDate, addDays('2027-01-01', 26));
});

await check('the fake answers every §6.2 function by its argument names (missing / extra → not found)', async () => {
  const rig = makeRig();
  assert.deepEqual(STAR_EVENT_RPC_NAMES, ['star_add_event', 'star_update_event', 'star_set_registration', 'star_delete_event']);
  const missing = rig.events.rpc('star_set_registration', { p_event_id: SEED_EVENT_IDS.fall, p_open: true }, rig.ctx);
  assert.equal(missing.error.code, 'PGRST202');
  const extra = rig.events.rpc('star_update_event', { p_event_id: SEED_EVENT_IDS.fall, p_expected_version: 1, p_name: 'x', p_testing_date: TODAY, p_start_time: '10:00', p_where_code: 'worcester', p_auto_close_on: null, p_note: null, p_registration_open: true }, rig.ctx);
  assert.equal(extra.error.code, 'PGRST202');
  const badDate = rig.events.rpc('star_add_event', { p_name: 'x', p_testing_date: 'soon', p_start_time: '10:00', p_where_code: 'worcester', p_registration_open: false, p_auto_close_on: null, p_note: null }, rig.ctx);
  assert.equal(badDate.error.code, '22007');
});

await check('words: every status of every action has a message (ok and no_access have none)', async () => {
  for (const action of ['add', 'edit', 'open', 'close', 'delete']) {
    for (const status of STAR_EVENT_STATUSES) {
      const m = statusMessage(action, status, { name: 'Fall Star Testing' });
      if (status === 'ok' || status === 'no_access') assert.equal(m, null);
      else assert.ok(m && typeof m.text === 'string' && m.text.length > 0, `${action}/${status}`);
    }
  }
  assert.deepEqual(statusMessage('add', 'duplicate_name', { name: 'Fall 2026 Star Testing' }), {
    field: 'name', text: "There's already an event called Fall 2026 Star Testing. Try another name.",
  });
  assert.equal(statusMessage('open', 'not_allowed').text, "The closing date has passed. Ask an admin to reopen. Registration wasn't opened.");
  assert.equal(statusMessage('edit', 'stale', { phone: true }).text.includes('Discard changes'), true);
  assert.equal(statusMessage('close', 'error', { name: 'Fall 2026 Star Testing' }).text, "Registration for Fall 2026 Star Testing wasn't closed. Check the connection and try again.");
});

console.log(`ALL STAR EVENT CHECKS PASSED (${count} checks)`);
