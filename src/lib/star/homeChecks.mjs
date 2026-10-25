// homeChecks.mjs — automatic checks for Home's Star "Today" cards (Star build phase 7, rulebook v0.515).
// Run:  node src/lib/star/homeChecks.mjs      (prints ALL STAR HOME CHECKS PASSED, exits 0)
// Why it exists: the preview database's star_home_today (mockStarCandidates.js) must answer like
// migration 0006's 19g (contract §7), the API (homeCore.js) must call it as a POST and turn every
// answer into cards or a status, and the cards' order, school filter and words must be the approved
// ones (proposals 4, 6, 9, 12, 14). The Grade hand-off (homeHandoff.js) is checked too: one shot,
// only for its event, only for a short while. Plain `assert`, no browser, no database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStarBackend } from '../mockStarTesting.js';
import { createStarEventsBackend, STAR_EVENT_RPC_NAMES } from '../mockStarEvents.js';
import {
  createStarCandidatesBackend, defaultStarCandidatesData, starCandidatesSeedIsCurrent, STAR_CANDIDATE_RPC_NAMES,
  STAR_CANDIDATE_WRITE_RPC_NAMES, SEED_CANDIDATE_EVENT_IDS,
} from '../mockStarCandidates.js';
import { createStarHomeApi, homeItems, answerAction, toHomeAnswer } from './homeCore.js';
import { handOffPrivate, peekPrivateHandoff, takePrivateHandoff, clearPrivateHandoff } from './homeHandoff.js';
import * as T from './homeText.js';

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

const TODAY = '2026-10-19'; // the seed's Fall testing day is 26 days later
const NOW = Date.parse('2026-10-19T18:00:00Z');
const IDS = SEED_CANDIDATE_EVENT_IDS;

// ----- A test rig: in-memory store + the Star fakes + a fake client + the API on top -----
function makeRig() {
  let store = null;
  const ctx = { signedIn: true, hasDataAccess: true, isAdmin: false, actorName: 'Staff', userId: '00000000-0000-4000-8000-0000000000d1' };
  const saveStore = (s) => {
    store = JSON.stringify(s);
  };
  const loadStore = () => (store === null ? null : JSON.parse(store));
  const star = createStarBackend({ loadStore, saveStore, now: () => NOW, newId: randomUUID });
  const events = createStarEventsBackend({
    readBase: () => star.snapshot(), saveStore, now: () => NOW, today: () => TODAY, newId: randomUUID,
    seed: defaultStarCandidatesData, seedIsCurrent: starCandidatesSeedIsCurrent,
  });
  const cands = createStarCandidatesBackend({ readBase: () => events.snapshot(), saveStore, now: () => NOW, today: () => TODAY, newId: randomUUID });
  const calls = [];
  let answerOverride = null; // a made-up answer for the API checks
  const client = {
    async rpc(name, args, options) {
      calls.push([name, args, options]);
      if (answerOverride) return answerOverride();
      if (STAR_CANDIDATE_RPC_NAMES.includes(name)) return cands.rpc(name, args ?? {}, ctx, options);
      if (STAR_EVENT_RPC_NAMES.includes(name)) return events.rpc(name, args ?? {}, ctx);
      return star.rpc(name, args ?? {}, ctx);
    },
  };
  return {
    api: createStarHomeApi(() => client),
    cands, ctx, calls,
    answer: (fn) => {
      answerOverride = fn;
    },
  };
}

await check('star_home_today: listed as a read that writes (POST) — never a save target of failNextSave', () => {
  assert.ok(STAR_CANDIDATE_RPC_NAMES.includes('star_home_today'));
  assert.ok(!STAR_CANDIDATE_WRITE_RPC_NAMES.includes('star_home_today'));
});

await check('an ordinary day: no events, no private testings', async () => {
  const rig = makeRig();
  const r = await rig.api.loadStarHomeToday();
  assert.equal(r.status, 'ok');
  assert.equal(r.today, TODAY);
  assert.deepEqual(r.events, []);
  assert.deepEqual(r.privates, []);
  assert.deepEqual(homeItems(r, null), []);
  // A normal POST: no { get: true } (contract §7 — the function runs the signature clean-up)
  assert.deepEqual(rig.calls.map(([name, , options]) => [name, options?.get ?? false]), [['star_home_today', false]]);
});

await check('a GET request is refused (the function writes), and no_access comes first', async () => {
  const rig = makeRig();
  const get = rig.cands.rpc('star_home_today', {}, rig.ctx, { get: true });
  assert.equal(get.error?.code, '25006');
  rig.ctx.hasDataAccess = false;
  const r = await rig.api.loadStarHomeToday();
  assert.equal(r.status, 'no_access');
  assert.equal(answerAction(r), 'lock');
});

await check('the testing day: one event card, counts per school WITHOUT private students or withdrawn', async () => {
  const rig = makeRig();
  assert.match(rig.cands.homeToday('event'), /is now today/);
  const r = await rig.api.loadStarHomeToday();
  assert.equal(r.status, 'ok');
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.id, IDS.fall);
  assert.equal(e.startTime, '10:00');
  assert.equal(e.whereCode, 'shrewsbury');
  // Worked out from the store the same way as the SQL: active, no private day, per school
  const db = rig.cands.snapshot();
  const expect = (code) => db.candidates.filter((c) => c.event_id === IDS.fall && c.status === 'active' && c.private_on === null && c.location_code === code).length;
  assert.deepEqual(e.counts, { worcester: expect('worcester'), shrewsbury: expect('shrewsbury') });
  const all = db.candidates.filter((c) => c.event_id === IDS.fall).length;
  assert.ok(e.counts.worcester + e.counts.shrewsbury < all, 'private and withdrawn candidates are left out');
  // Private students of the event whose day isn't today: no private card
  assert.deepEqual(r.privates, []);
  const items = homeItems(r, null);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'event');
  assert.equal(items[0].count, e.counts.worcester + e.counts.shrewsbury);
});

await check('the answer carries no date of birth, email, fee or payment', async () => {
  const rig = makeRig();
  rig.cands.homeToday('event');
  rig.cands.homeToday('private');
  const raw = rig.cands.rpc('star_home_today', {}, rig.ctx).data;
  const text = JSON.stringify(raw);
  for (const word of ['date_of_birth', 'email', 'cents', 'paid', 'fee', 'signature']) assert.ok(!text.includes(word), word);
});

await check('a private testing day: Alex Kim 4:00 PM (Shrewsbury), Ethan Lopez 5:30 PM (Worcester)', async () => {
  const rig = makeRig();
  assert.match(rig.cands.homeToday('private'), /Alex Kim and Ethan Lopez/);
  const r = await rig.api.loadStarHomeToday();
  assert.deepEqual(r.events, []);
  assert.deepEqual(r.privates.map((p) => [p.firstName, p.time, p.locationCode, p.dan, p.starsFrom, p.starsTo, p.eventId]), [
    ['Alex', '16:00', 'shrewsbury', 1, 1, 2, IDS.fall],
    ['Ethan', '17:30', 'worcester', 1, 2, 3, IDS.fall],
  ]);
  // Proposal 14: one school → only that school's private students
  assert.deepEqual(homeItems(r, 'shrewsbury').map((i) => i.firstName), ['Alex']);
  assert.deepEqual(homeItems(r, 'worcester').map((i) => i.firstName), ['Ethan']);
  assert.deepEqual(homeItems(r, null).map((i) => i.firstName), ['Alex', 'Ethan']);
  // Ethan is now off the testing-day count; 'none' brings him back and empties Home's Star part
  rig.cands.homeToday('event');
  const before = (await rig.api.loadStarHomeToday()).events[0].counts.worcester;
  assert.match(rig.cands.homeToday('none'), /Nothing is on today/);
  const after = await rig.api.loadStarHomeToday();
  assert.deepEqual([after.events, after.privates], [[], []]);
  rig.cands.homeToday('event');
  assert.equal((await rig.api.loadStarHomeToday()).events[0].counts.worcester, before + 1);
});

await check('a withdrawn private student has no card', async () => {
  const rig = makeRig();
  rig.cands.homeToday('private');
  const db = rig.cands.snapshot();
  const alex = db.candidates.find((c) => c.first_name === 'Alex' && c.last_name === 'Kim' && c.event_id === IDS.fall);
  rig.ctx.isAdmin = true;
  assert.equal(rig.cands.rpc('star_withdraw_candidate', { p_candidate_id: alex.id, p_expected_version: alex.version }, rig.ctx).data.status, 'ok');
  const r = await rig.api.loadStarHomeToday();
  assert.deepEqual(r.privates.map((p) => p.firstName), ['Ethan']);
});

// ----- The API: odd answers and statuses -----
const goodEvent = {
  id: IDS.fall, name: 'Fall 2026 Star Testing', start_time: '10:00', where_code: 'shrewsbury', where_name: 'Shrewsbury',
  counts: { worcester: 12, shrewsbury: 10 },
};
const goodPrivate = (first, last, time, code, id) => ({
  candidate_id: id, event_id: IDS.fall, event_name: 'Fall 2026 Star Testing', private_time: time, first_name: first, last_name: last,
  location_code: code, dan: 1, stars_from: 1, stars_to: 2,
});
const okData = (events, privates) => ({ data: { status: 'ok', today: TODAY, events, private: privates }, error: null });

await check('statuses: stale / invalid pass through (a failed ask: keep); odd answers and lost connections are errors', async () => {
  const rig = makeRig();
  for (const status of ['stale', 'invalid']) {
    rig.answer(() => ({ data: { status }, error: null }));
    const r = await rig.api.loadStarHomeToday();
    assert.equal(r.status, status);
    assert.equal(answerAction(r), 'keep');
  }
  const odd = [
    { data: { status: 'surprise' }, error: null },
    { data: null, error: { message: 'Failed to fetch' } },
    okData([{ ...goodEvent, counts: { worcester: -1, shrewsbury: 0 } }], []),
    okData([{ ...goodEvent, id: 'not-a-uuid' }], []),
    okData([], [{ ...goodPrivate('A', 'B', '16:00', 'boston', randomUUID()) }]),
    { data: { status: 'ok', today: 'tomorrow', events: [], private: [] }, error: null },
  ];
  for (const answer of odd) {
    rig.answer(() => answer);
    const r = await rig.api.loadStarHomeToday();
    assert.equal(r.status, 'error');
    assert.equal(answerAction(r), 'keep');
  }
  rig.answer(() => {
    throw new Error('network down');
  });
  assert.equal((await rig.api.loadStarHomeToday()).status, 'error');
  assert.equal(answerAction({ status: 'ok' }), 'show');
});

await check('order (proposal 6): by time; at the same time the event first, then private by last name', () => {
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const answer = toHomeAnswer({
    today: TODAY,
    events: [{ ...goodEvent, start_time: '16:00:00' }],
    private: [
      goodPrivate('Ethan', 'Lopez', '17:30', 'worcester', ids[0]),
      goodPrivate('Zoe', 'Young', '16:00', 'shrewsbury', ids[1]),
      goodPrivate('Alex', 'Kim', '16:00:00', 'shrewsbury', ids[2]),
      goodPrivate('Lily', 'Nguyen', '09:30', 'worcester', ids[3]),
    ],
  });
  assert.ok(answer);
  assert.deepEqual(homeItems(answer, null).map((i) => (i.kind === 'event' ? 'event' : i.lastName)), ['Nguyen', 'event', 'Kim', 'Young', 'Lopez']);
});

// ----- The words (approved mockups) -----
await check('wording: titles, lines and the count for many / one / none, Both and one school', () => {
  const answer = toHomeAnswer(okData([goodEvent], [goodPrivate('Alex', 'Kim', '16:00', 'shrewsbury', randomUUID())]).data);
  const [event, alex] = homeItems(answer, null);
  assert.equal(T.eventTitle(event), 'Fall 2026 Star Testing · 10:00 AM');
  assert.equal(T.eventLine(event), 'Shrewsbury school · 22 candidates testing today');
  assert.equal(T.privateTitle(alex), 'Private star testing · 4:00 PM');
  assert.equal(T.privateLine(alex), 'Alex Kim · 1st Dan · 1 star → 2 stars');
  assert.equal(T.eventLine(homeItems(answer, 'worcester')[0]), 'Shrewsbury school · 12 Worcester candidates testing today');
  assert.equal(T.eventLine(homeItems(answer, 'shrewsbury')[0]), 'Shrewsbury school · 10 Shrewsbury candidates testing today');
  assert.equal(T.countText(1), '1 candidate testing today');
  assert.equal(T.countText(0), 'No candidates testing today');
  assert.equal(T.countText(1, 'worcester'), '1 Worcester candidate testing today');
  assert.equal(T.countText(0, 'worcester'), 'No Worcester candidates testing today');
  assert.equal(T.privateLine({ firstName: 'Ethan', lastName: 'Lopez', dan: 1, starsFrom: 2, starsTo: 3 }), 'Ethan Lopez · 1st Dan · 2 stars → 3 stars');
  // Proposal 12: the event card stays on a school with none of its candidates
  const none = toHomeAnswer(okData([{ ...goodEvent, counts: { worcester: 0, shrewsbury: 22 } }], []).data);
  assert.equal(T.eventLine(homeItems(none, 'worcester')[0]), 'Shrewsbury school · No Worcester candidates testing today');
  assert.equal(T.TODAY_HEADING, 'Today');
  assert.equal(T.OPEN_GRADING, 'Open grading');
  assert.equal(T.GRADE, 'Grade');
});

// ----- The Grade hand-off (proposal 10): page memory only, one shot -----
await check('hand-off: taken once, only by its own event, only for a minute', () => {
  const a = randomUUID();
  const b = randomUUID();
  const kid = randomUUID();
  handOffPrivate({ eventId: a, candidateId: kid, name: 'Alex Kim' }, 1000);
  assert.equal(peekPrivateHandoff(b, 1500), null, 'peek: only its own event');
  assert.deepEqual(peekPrivateHandoff(a, 1500), { candidateId: kid, name: 'Alex Kim' });
  assert.deepEqual(peekPrivateHandoff(a, 1500), { candidateId: kid, name: 'Alex Kim' }, 'peek only looks (a draw may run twice)');
  assert.deepEqual(takePrivateHandoff(a, 2000), { candidateId: kid, name: 'Alex Kim' });
  assert.equal(peekPrivateHandoff(a, 2001), null, 'taken = gone');
  assert.equal(takePrivateHandoff(a, 2001), null, 'one shot');
  handOffPrivate({ eventId: a, candidateId: kid }, 1000);
  assert.equal(takePrivateHandoff(b, 1500), null, 'another event takes nothing …');
  assert.equal(takePrivateHandoff(a, 1600), null, '… and empties it');
  handOffPrivate({ eventId: a, candidateId: kid }, 1000);
  assert.equal(takePrivateHandoff(a, 1000 + 61 * 1000), null, 'too old');
  handOffPrivate({ eventId: a, candidateId: kid }, 1000);
  clearPrivateHandoff();
  assert.equal(takePrivateHandoff(a, 1001), null, 'Home cleared it');
});

console.log(`ALL STAR HOME CHECKS PASSED (${count} checks)`);
