// publicChecks.mjs — automatic checks for the Star family form's preview database (build phase 4).
// Run:  node src/lib/star/publicChecks.mjs      (prints ALL STAR PUBLIC FORM CHECKS PASSED, exits 0)
// Why it exists: the preview stand-in for star_public_event / star_public_register
// (mockStarCandidates.js publicEvent / publicRegister) must answer what migration 0006 answers, in the
// contract's order (§8.2, §8.3), so the family page can be tried in preview and the registrations it
// makes look right on the Candidates tab. The real Function and database are checked separately
// (functions/tests/starRegister.test.mjs, supabase/tests/0006_tests.sql).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStarBackend } from '../mockStarTesting.js';
import { createStarEventsBackend } from '../mockStarEvents.js';
import { createStarCandidatesBackend, defaultStarCandidatesData, starCandidatesSeedIsCurrent, SEED_CANDIDATE_EVENT_IDS } from '../mockStarCandidates.js';
import { STAR_ACK_VERSION } from './starEventRules.js';

let count = 0;
function check(label, fn) {
  try {
    fn();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
}

const TODAY = '2026-10-19';
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function makeRig() {
  let store = null;
  let today = TODAY;
  let now = Date.parse('2026-10-19T18:00:00Z');
  const saveStore = (s) => {
    store = JSON.stringify(s);
  };
  const loadStore = () => (store === null ? null : JSON.parse(store));
  const star = createStarBackend({ loadStore, saveStore, now: () => now, newId: randomUUID });
  const events = createStarEventsBackend({
    readBase: () => star.snapshot(), saveStore, now: () => now, today: () => today, newId: randomUUID,
    seed: defaultStarCandidatesData, seedIsCurrent: starCandidatesSeedIsCurrent,
  });
  const cands = createStarCandidatesBackend({ readBase: () => events.snapshot(), saveStore, now: () => now, today: () => today, newId: randomUUID });
  const db = () => cands.snapshot();
  const fall = () => db().events.find((e) => e.id === SEED_CANDIDATE_EVENT_IDS.fall);
  const address = (code) => (code === 'shrewsbury' ? { street: '1 Main St', city: 'Shrewsbury', state: 'MA', zip: '01545' } : null);
  return {
    cands, db, fall, address,
    setToday: (d) => { today = d; },
    later: (ms) => { now += ms; },
  };
}

const body = (code, over = {}) => ({
  code, clientKey: 'k1', submissionId: randomUUID(), first: 'Alex', last: 'Test', dateOfBirth: '2012-03-04',
  email: 'kim.family@example.com', dan: 1, starsFrom: 1, payingBy: 'cash', acknowledged: true, signature: SIG,
  ackVersion: STAR_ACK_VERSION, ...over,
});

check('publicEvent: bad / unknown code → not_found; a code sets the school; no ids, counts or private fee', () => {
  const r = makeRig();
  assert.deepEqual(r.cands.publicEvent('nope'), { status: 'not_found' });
  assert.deepEqual(r.cands.publicEvent('aaaaaaaa'), { status: 'not_found' });
  const e = r.fall();
  const w = r.cands.publicEvent(e.public_code_worcester, { schoolAddress: r.address });
  assert.equal(w.status, 'ok');
  assert.equal(w.state, 'open');
  assert.deepEqual(w.school, { code: 'worcester', name: 'Worcester' });
  assert.equal(r.cands.publicEvent(e.public_code_shrewsbury).school.code, 'shrewsbury');
  assert.deepEqual(Object.keys(w).sort(), ['closed_on', 'dans', 'event', 'school', 'state', 'status']);
  assert.deepEqual(Object.keys(w.event).sort(), ['auto_close_on', 'name', 'note', 'start_time', 'testing_date', 'where']);
  assert.equal(w.event.start_time, '10:00');
  assert.deepEqual(w.event.where, { name: 'Shrewsbury', address: { street: '1 Main St', city: 'Shrewsbury', state: 'MA', zip: '01545' } });
  const d1 = w.dans.find((d) => d.dan === 1);
  assert.deepEqual(Object.keys(d1).sort(), ['categories', 'dan', 'label', 'max_score', 'pass_mark', 'same_day_cents', 'standard_cents', 'star_limit']);
  assert.ok(d1.categories.length > 0 && d1.categories.every((k) => Object.keys(k).join() === 'name,credits'));
  assert.ok(d1.max_score > d1.pass_mark);
});

check('publicRegister: ok answer (no DOB / email / signature), form row with reference, signature and school from the link', () => {
  const r = makeRig();
  const e = r.fall();
  const before = r.db().next_reference;
  const a = r.cands.publicRegister(body(e.public_code_worcester), { schoolAddress: r.address });
  assert.equal(a.status, 'ok');
  assert.equal(a.reference, `ST-${before}`);
  assert.equal(a.stars_to, 2);
  assert.ok(!('date_of_birth' in a) && !('email' in a) && !('signature' in a));
  const c = r.db().candidates.find((x) => x.reference === a.reference);
  assert.equal(c.source, 'form');
  assert.equal(c.location_code, 'worcester');
  assert.equal(c.email_for_results, 'kim.family@example.com');
  assert.ok(r.db().signatures.some((s) => s.candidate_id === c.id && s.ack_version === STAR_ACK_VERSION));
});

check('publicRegister: the same submission id twice → the same answer, one row; on another event → invalid', () => {
  const r = makeRig();
  const e = r.fall();
  const b = body(e.public_code_shrewsbury);
  const first = r.cands.publicRegister(b);
  const n = r.db().candidates.length;
  assert.deepEqual(r.cands.publicRegister(b), first);
  assert.equal(r.db().candidates.length, n);
  const spring = r.db().events.find((x) => x.id === SEED_CANDIDATE_EVENT_IDS.spring);
  assert.equal(r.cands.publicRegister({ ...b, code: spring.public_code_worcester }).status, 'invalid');
});

check('publicRegister: refusals — top star, unknown Dan, future DOB, bad email, card, no tick, wrong ack label', () => {
  const r = makeRig();
  const code = r.fall().public_code_worcester;
  const limit = r.db().event_dans.find((d) => d.event_id === r.fall().id && d.dan === 1).star_limit;
  for (const over of [{ starsFrom: limit }, { dan: 9 }, { dateOfBirth: '2026-10-20' }, { dateOfBirth: '1899-12-31' },
    { email: 'kim.family@example' }, { payingBy: 'card' }, { acknowledged: false }, { ackVersion: 'cb-2026-10-17' }, { first: '' }]) {
    assert.equal(r.cands.publicRegister(body(code, over)).status, 'invalid', JSON.stringify(over));
  }
});

check('publicRegister: a duplicate (same names + DOB) is accepted silently and flagged for staff', () => {
  const r = makeRig();
  const code = r.fall().public_code_worcester;
  const a = r.cands.publicRegister(body(code, { first: 'Sam', last: 'Twin' }));
  const b = r.cands.publicRegister(body(code, { first: 'sam', last: 'TWIN' }));
  assert.equal(a.status, 'ok');
  assert.equal(b.status, 'ok');
  const rows = r.db().candidates.filter((c) => c.last_name.toLowerCase() === 'twin');
  assert.ok(rows.every((c) => c.duplicate_state === 'possible'));
});

check('publicRegister: closed (+ closed_on), not_open, finished follow the event state', () => {
  const r = makeRig();
  const e = r.fall();
  r.setToday(e.auto_close_on.replace(/\d\d$/, (dd) => String(Number(dd) + 1).padStart(2, '0')));
  const closed = r.cands.publicRegister(body(e.public_code_worcester));
  assert.deepEqual(closed, { status: 'closed', closed_on: e.auto_close_on });
  assert.equal(r.cands.publicEvent(e.public_code_worcester).state, 'closed');
  r.setToday('2030-01-01');
  assert.equal(r.cands.publicRegister(body(e.public_code_worcester)).status, 'finished');
  r.setToday(TODAY);
  const spring = r.db().events.find((x) => x.id === SEED_CANDIDATE_EVENT_IDS.spring);
  assert.equal(r.cands.publicRegister(body(spring.public_code_worcester)).status, 'not_open');
});

check('publicRegister: 20 tries an hour per client key (refusals count too), then rate_limited; forced too', () => {
  const r = makeRig();
  const code = r.fall().public_code_worcester;
  for (let i = 0; i < 20; i += 1) r.cands.publicRegister(body(code, { first: '' })); // 20 refusals
  assert.equal(r.cands.publicRegister(body(code)).status, 'rate_limited');
  assert.equal(r.cands.publicRegister(body(code, { clientKey: 'k2' })).status, 'ok');
  r.later(61 * 60 * 1000);
  assert.equal(r.cands.publicRegister(body(code)).status, 'ok');
  assert.equal(r.cands.publicRegister(body(code, { clientKey: 'k3' }), { forceRateLimited: true }).status, 'rate_limited');
  assert.ok(r.db().public_attempts.every((row) => row.outcome.startsWith('star:')));
});

console.log(`ALL STAR PUBLIC FORM CHECKS PASSED (${count} checks)`);
