// candidatesChecks.mjs — automatic checks for the Star testing candidates data layer (build phase 3).
// Run:  node src/lib/star/candidatesChecks.mjs      (prints ALL STAR CANDIDATE CHECKS PASSED, exits 0)
// Why it exists: the preview database (mockStarCandidates.js) must refuse exactly what migration 0006
// refuses, in the same order (contract 0006 §1.1, §6.3, §6.4), and the API layer (candidatesCore.js,
// which candidatesApi.js uses) must send the right argument names and turn every answer into the
// right camelCase object. These plain `assert` checks run in a second without a browser or a database.
// They go THROUGH the API layer, using a small fake client that hands each call to the preview
// database — the same path the screens take in preview mode.
//
// Covered: the fee rules incl. OPEN-17 / OPEN-18 (feeRules.js) · the result and Assistant Instructor
// rules (resultRules.js, handoff Appendix B) · every §6.3 / §6.4 status in the contract's check order ·
// the refund cap (S7) · a Dan change on a paid row is admin-only (S8) · the 10-second staff Undo
// windows · Undo / Edit payment refused while a refund stands · the net total never below zero ·
// duplicates (§5.6) · make-ups: kept / retest rows, OPEN-8 / OPEN-10 / OPEN-11, already_added ·
// "no DOB or email in any list read" (the column lists, the view, the make-up list) · History and
// View signature incl. the 90-day removal · the make-up list is a POST · the Events tab's counts and
// Delete event after the takeover · the console helpers · words for every status · the ⋯ menu's one
// order in three groups (candidateMenu.js, DR G1) · the toasts' Undo calls (DR G2 / G3).
import assert from 'node:assert/strict';
import { readSource } from './readSource.js';
import { randomUUID } from 'node:crypto';
import { createSaveLine } from '../saveLine.js';
import { createToastLine } from '../toastLine.js';
import { UNDO_DIDNT_SAVE, paidOnOpening } from '../../components/text.js';
import * as GRADING_TEXT from '../../screens/testing/star/grading/text.js';
import { createStarBackend } from '../mockStarTesting.js';
import { createStarEventsBackend, STAR_EVENT_RPC_NAMES, STAR_EVENT_TABLES } from '../mockStarEvents.js';
import {
  createStarCandidatesBackend, defaultStarCandidatesData, starCandidatesSeedIsCurrent, STAR_CANDIDATE_RPC_NAMES,
  STAR_CANDIDATE_WRITE_RPC_NAMES, STAR_CANDIDATE_TABLES, SEED_CANDIDATE_EVENT_IDS,
} from '../mockStarCandidates.js';
import { createStarCandidatesApi, STAR_CANDIDATE_STATUSES, STAR_CANDIDATE_LIST_COLUMNS, sortBeltOrder, historyPrivacy, starEmailIsValid } from './candidatesCore.js';
import { createStarEventsApi } from './eventsCore.js';
import { feeKind, feeCentsFor, overpaidCents, paymentSummary, lastUnreversedPayment, refundedCents } from './feeRules.js';
import { candidateResult, assistantGrade, ageGroupOf, ageOn } from './resultRules.js';
import { statusMessage, refundTooLarge, NOTHING_OVERPAID, UNDO_PAYMENT_TOO_LATE, UNDO_REFUND_FIRST, DAN_NEEDS_ADMIN, choiceNeededLine, rowStale, paymentUndoneToast } from './candidatesText.js';
import { addDays } from '../testing/eventRules.js';
import { takeSnapshot, writeArgs } from './dialogSnapshot.js';
import { candidateMenuKeys, canPrintReceipt } from './candidateMenu.js';
import { candidateCardNumbers, filterRows, emptyLineKind } from './candidateCards.js';
import {
  includesRemoved, dupNotCounted, NO_PAID_DAN, EVERY_PAID_DAN, NO_CANDIDATES_DAN, paymentRecordedToast, undoPaymentTitle, undoPaymentBody,
  markedPaidWords, movedBackToast, UNDO_BOX_FAILED, PRIVATE_DAY_HINT, EDIT_PAYMENT_DATE_HINT, LOAD_DETAIL_FAILED, LOAD_LIST_FAILED,
} from '../../screens/testing/star/candidates/text.js';
import { buildStarReceipt } from './candidatesReceipt.js';
import { linesFor, isBookkeepingColumn, groupHistoryRows, describeHistoryEntry } from './candidateHistoryLines.js';
import { payingByWhere } from './payingByWhere.js';
import { deskSchoolFor } from './deskSchool.js';

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
const NOW = Date.parse('2026-10-19T18:00:00Z'); // 2 PM at the school
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const DESK_ID = '00000000-0000-4000-8000-0000000000d1';
const OTHER_ID = '00000000-0000-4000-8000-0000000000d2';
const IDS = SEED_CANDIDATE_EVENT_IDS; // summer (past), fall (upcoming), spring (later)

// ----- A test rig: in-memory store + the three Star fakes + a fake client + the APIs on top -----
function makeRig() {
  let store = null;
  let today = TODAY;
  let now = NOW;
  const ctx = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Test Admin', userId: ADMIN_ID };
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
  const calls = []; // every rpc sent: [name, args, options]
  const client = {
    from(table) {
      const q = { columns: '*', filters: [], orders: [] };
      const builder = {
        select(columns) { q.columns = columns; return builder; },
        eq(col, value) { q.filters.push({ col, value }); return builder; },
        in(col, values) { q.filters.push({ col, value: values, op: 'in' }); return builder; },
        order(col, { ascending = true } = {}) { q.orders.push({ col, ascending }); return builder; },
        then(resolve, reject) {
          // the same routing as mockClient.js: candidates first (star_roster), then events, then rubrics
          const backend = STAR_CANDIDATE_TABLES.includes(table) ? cands : STAR_EVENT_TABLES.includes(table) ? events : star;
          return Promise.resolve().then(() => backend.select(table, q.columns, q.filters, q.orders, ctx)).then(resolve, reject);
        },
      };
      return builder;
    },
    async rpc(name, args, options) {
      const sent = JSON.parse(JSON.stringify(args ?? {})); // JSON drops undefined values, like the network
      calls.push([name, sent, options]);
      if (STAR_CANDIDATE_RPC_NAMES.includes(name)) return cands.rpc(name, sent, ctx, options);
      if (STAR_EVENT_RPC_NAMES.includes(name)) return events.rpc(name, sent, ctx);
      return star.rpc(name, sent, ctx); // has_data_access and the rubric functions
    },
  };
  const api = createStarCandidatesApi(() => client, () => today);
  const eventsApi = createStarEventsApi(() => client, () => today);
  const editStore = (fn) => {
    const s = JSON.parse(store ?? JSON.stringify(cands.snapshot()));
    fn(s);
    store = JSON.stringify(s);
  };
  return {
    api, eventsApi, cands, events, ctx, client, calls, editStore,
    snap: () => cands.snapshot(),
    setToday: (d) => { today = d; },
    later: (ms) => { now += ms; },
    staff: (userId = DESK_ID) => { ctx.isAdmin = false; ctx.actorName = 'Staff'; ctx.userId = userId; },
    admin: () => { ctx.isAdmin = true; ctx.actorName = 'Test Admin'; ctx.userId = ADMIN_ID; },
    lock: () => { ctx.hasDataAccess = false; },
    unlock: () => { ctx.hasDataAccess = true; },
  };
}

const statusOf = (r) => r.status;
async function roster(rig, key) {
  const r = await rig.api.loadCandidates(IDS[key]);
  assert.equal(r.status, 'ok');
  return r.candidates;
}
// The candidate called `first` (n = which one, for Ava Reed's two rows) in an event's roster.
async function cand(rig, key, first, n = 0) {
  const list = (await roster(rig, key)).filter((c) => c.firstName === first);
  assert.ok(list[n], `no ${first} in ${key}`);
  return list[n];
}
const editOf = (c, detail, over = {}) => ({
  candidateId: c.id, expectedVersion: c.version, firstName: c.firstName, lastName: c.lastName,
  dateOfBirth: detail.candidate.dateOfBirth, email: detail.candidate.emailForResults, locationCode: c.locationCode,
  dan: c.dan, starsFrom: c.starsFrom, clearGradeCount: null, ...over,
});
async function detailOf(rig, c) {
  const d = await rig.api.loadCandidateDetail(c.id);
  assert.equal(d.status, 'ok');
  return d;
}
const newDesk = (over = {}) => ({
  eventId: IDS.fall, firstName: 'Zoe', lastName: 'Grant', dateOfBirth: '2012-05-05', email: 'grant@example.com',
  locationCode: 'worcester', dan: 1, starsFrom: 0, payingBy: 'cash', ...over,
});
const pay = (c, over = {}) => ({ candidateId: c.id, expectedVersion: c.version, method: 'cash', amountCents: c.expectedFeeCents, paidOn: TODAY, ...over });

// =====================================================================================
// 1. The pure rules: fees (§5.2–§5.3) and results (§5.4–§5.5)
// =====================================================================================

await check('fee rules: the order of §5.2 — make-up, private, paid by date, not paid by today', async () => {
  const base = { isMakeup: false, privateOn: null, paidCents: 0, lastPaidOn: null, testingDate: '2026-11-14', today: '2026-11-13' };
  assert.equal(feeKind({ ...base, isMakeup: true, privateOn: '2026-12-01', paidCents: 500 }), 'none'); // make-up wins
  assert.equal(feeKind({ ...base, privateOn: '2026-12-01' }), 'private');
  // not paid: the day before → standard; on AND after the testing day → same day (v0.167)
  assert.equal(feeKind(base), 'standard');
  assert.equal(feeKind({ ...base, today: '2026-11-14' }), 'same_day');
  assert.equal(feeKind({ ...base, today: '2026-11-20' }), 'same_day');
  // paid: decided by the latest unreversed payment's date
  assert.equal(feeKind({ ...base, paidCents: 14000, lastPaidOn: '2026-11-13', today: '2026-11-20' }), 'standard');
  assert.equal(feeKind({ ...base, paidCents: 15000, lastPaidOn: '2026-11-14' }), 'same_day');
  const dan = { standard_cents: 14000, same_day_cents: 15000, private_cents: 16000 };
  assert.deepEqual(['none', 'private', 'standard', 'same_day'].map((k) => feeCentsFor(k, dan)), [0, 16000, 14000, 15000]);
  assert.equal(feeCentsFor('standard', { standardCents: 14000 }), 14000); // camelCase too
  assert.equal(overpaidCents(16000, 14000), 2000);
  assert.equal(overpaidCents(14000, 16000), 0); // no underpaid state (v0.167)
  assert.equal(overpaidCents(0, 14000), 0);
});

await check('fee rules: OPEN-17 (Back to the testing day ON the testing day: the payment date decides) and OPEN-18 (private stays private)', async () => {
  const dan = { standard_cents: 14000, same_day_cents: 15000, private_cents: 16000 };
  const sum = (payments, over = {}) => paymentSummary({
    candidate: { is_makeup: false, private_on: null, ...over }, payments, dan, testingDate: '2026-11-14', today: '2026-11-14',
  });
  const p = (id, cents, paidOn, at, kind = 'payment', reverses = null) => ({ id, kind, amount_cents: cents, paid_on: paidOn, recorded_at: at, reverses_payment_id: reverses });
  // paid the private fee BEFORE the testing day, back to the testing day ON it → standard, $20 overpaid
  let s = sum([p('a', 16000, '2026-11-10', '2026-11-10T15:00:00Z')]);
  assert.deepEqual([s.feeKind, s.expectedFeeCents, s.overpaidCents, s.paid], ['standard', 14000, 2000, true]);
  // paid ON the testing day → same day, $10 overpaid
  s = sum([p('a', 16000, '2026-11-14', '2026-11-14T15:00:00Z')]);
  assert.deepEqual([s.feeKind, s.overpaidCents], ['same_day', 1000]);
  // OPEN-18: a private student paying after their private day → still the private fee
  s = sum([p('a', 16000, '2026-12-05', '2026-12-05T15:00:00Z')], { private_on: '2026-12-01' });
  assert.deepEqual([s.feeKind, s.expectedFeeCents, s.overpaidCents], ['private', 16000, 0]);
  // a reversed payment doesn't count as "the latest"; refunds count in the net total
  const rows = [
    p('a', 15000, '2026-11-14', '2026-11-14T15:00:00Z'), p('b', -15000, '2026-11-14', '2026-11-14T15:01:00Z', 'reversal', 'a'),
    p('c', 16000, '2026-11-10', '2026-11-14T15:02:00Z'), p('d', -2000, '2026-11-14', '2026-11-14T15:03:00Z', 'refund'),
  ];
  assert.equal(lastUnreversedPayment(rows).id, 'c');
  assert.equal(refundedCents(rows), 2000);
  s = sum(rows);
  assert.deepEqual([s.paidCents, s.feeKind, s.overpaidCents], [14000, 'standard', 0]);
});

await check('result rules: Assistant Instructor letters and age groups (handoff Appendix B)', async () => {
  const a = {
    child_max_age: 12, child_a_plus: 15, child_a: 14, child_b_plus: 13, child_b: 12, child_c_plus: 11, child_c: 10,
    adult_a_plus: 20, adult_a: 18, adult_b_plus: 16, adult_b: 14, adult_c_plus: 12, adult_c: 10,
  };
  const letter = (age, n) => assistantGrade(a, age === null ? 'adult' : age <= 12 ? 'child' : 'adult', n);
  assert.deepEqual([letter(12, 14), letter(13, 19), letter(13, 18), letter(13, 17), letter(12, 9), letter(null, 14)], ['A', 'A', 'A', 'B+', 'D', 'B']);
  assert.equal(assistantGrade(a, 'adult', null), null); // not entered → not graded
  assert.equal(assistantGrade(a, 'adult', 0), 'D'); // 0 is a real count
  // age on the TESTING date
  assert.equal(ageOn('2014-11-14', '2026-11-14'), 12);
  assert.equal(ageOn('2014-11-15', '2026-11-14'), 11);
  assert.equal(ageGroupOf('2013-11-14', '2026-11-14', 12), 'adult'); // 13 that day
  assert.equal(ageGroupOf('2013-11-15', '2026-11-14', 12), 'child'); // still 12
  assert.equal(ageGroupOf(null, '2026-11-14', 12), 'adult'); // no DOB → 13 and up (S3)
});

await check('result rules: totals, status order, needs (OPEN-11, OPEN-12, OPEN-13), result key', async () => {
  // 1st Dan: 11 subjects, 70 credits (Assistant Instructor 5, from the count)
  const credits = [15, 10, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  const categories = credits.map((cr, i) => ({ id: `k${i}`, event_id: 'e', dan: 1, name: `S${i}`, credits: cr, position: i, from_class_count: i === 8 }));
  const gradeValues = [['A+', 4.5], ['A', 4.0], ['B+', 3.5], ['B', 3.0], ['C+', 2.5], ['C', 2.0], ['D', 0]].map(([grade, value]) => ({ grade, value }));
  const assistant = { child_max_age: 12, adult_a_plus: 20, adult_a: 18, adult_b_plus: 16, adult_b: 14, adult_c_plus: 12, adult_c: 10, child_a_plus: 15, child_a: 14, child_b_plus: 13, child_b: 12, child_c_plus: 11, child_c: 10 };
  const c = { id: 'c', event_id: 'e', dan: 1, stars_from: 1, status: 'active', date_of_birth: null, private_on: null, private_time: null, assistant_classes: 20 };
  const all = (letter, over = {}) => categories.filter((k) => !k.from_class_count).map((k) => ({ candidate_id: 'c', event_category_id: k.id, grade: over[k.id] ?? letter }));
  const result = (grades, cand = {}, moves = []) => candidateResult({
    candidate: { ...c, ...cand }, testingDate: '2026-11-14', dan: { pass_mark: 245 }, categories, gradeValues, assistant, grades, makeupSubjects: moves,
  });
  let r = result(all('A+'));
  assert.deepEqual([r.total, r.max_score, r.status, r.complete], [315, 315, 'passed', true]);
  r = result(all('B+'), { assistant_classes: 16 });
  assert.deepEqual([r.total, r.status], [245, 'passed']); // exactly the pass mark passes
  r = result(all('A+', { k3: 'D' }));
  assert.deepEqual([r.total, r.status, r.needs, r.makeup_reasons, r.choice_needed], [292.5, 'makeup', ['S3'], ['d'], false]);
  r = result([], { assistant_classes: 20 });
  assert.deepEqual([r.status, r.graded_count, r.total], ['not_finished', 1, 22.5]); // a running total "so far"
  r = result(all('A'), { private_on: '2026-12-01', private_time: '16:00:00', assistant_classes: null });
  assert.deepEqual([r.status, r.private], ['testing_privately', { on: '2026-12-01', time: '16:00' }]); // OPEN-13
  r = result(all('B'), { assistant_classes: 14 });
  assert.deepEqual([r.total, r.status, r.makeup_reasons, r.needs, r.choice_needed], [210, 'makeup', ['below'], [], true]); // OPEN-11
  r = result(all('B'), { assistant_classes: 14 }, [{ candidate_id: 'c', event_category_id: 'k6', kind: 'chosen' }, { candidate_id: 'c', event_category_id: 'k2', kind: 'chosen' }]);
  assert.deepEqual([r.needs, r.needs_ids, r.choice_needed], [['S2', 'S6'], ['k2', 'k6'], false]); // in position order
  r = result(all('B', { k4: 'D' }), { assistant_classes: 14 }, [{ candidate_id: 'c', event_category_id: 'k6', kind: 'chosen' }]);
  assert.deepEqual([r.makeup_reasons, r.needs], [['d', 'below'], ['S4']]); // OPEN-12: D only
  r = result(all('A+'), { status: 'withdrawn' });
  assert.equal(r.status, 'withdrawn');
  // the key changes with status, total or needs — and only then
  assert.equal(result(all('A+')).result_key, result(all('A+')).result_key);
  assert.notEqual(result(all('A+')).result_key, result(all('A+', { k0: 'A' })).result_key);
  assert.equal(JSON.stringify(result(all('A+'))).includes('date_of_birth'), false); // no DOB in a result
});

await check('email rule (star_email_is_valid): trimmed, one @, a dot after it, no spaces or invisible characters', async () => {
  for (const ok of ['a@b.co', '  ortiz.family@example.com ', 'Mixed.Case@Example.ORG']) assert.equal(starEmailIsValid(ok), true, ok);
  for (const bad of [null, '', ' ', 'a@b', 'a b@c.de', 'a@@b.co', '@b.co', 'a@b.', 'a​@b.co', 'a b@c.de', `${'x'.repeat(250)}@b.co`]) {
    assert.equal(starEmailIsValid(bad), false, String(bad));
  }
});

// =====================================================================================
// 2. Reading: the seed, the roster, privacy of every list
// =====================================================================================

await check('the seed: Summer finished with make-ups owed, Fall with every kind of row, Spring empty', async () => {
  const rig = makeRig();
  const fall = await roster(rig, 'fall');
  const summer = await roster(rig, 'summer');
  assert.equal((await roster(rig, 'spring')).length, 0);
  const row = (list, first, n = 0) => list.filter((c) => c.firstName === first)[n];
  assert.deepEqual(fall.map((c) => c.firstName).sort(), ['Alex', 'Ava', 'Ava', 'Chris', 'Ethan', 'Grace', 'Jordan', 'Lily', 'Mia', 'Noah', 'Owen', 'Ruby', 'Sam', 'Sofia']);
  assert.deepEqual([row(fall, 'Mia').paid, row(fall, 'Mia').paidCents, row(fall, 'Mia').feeKind], [true, 14000, 'standard']);
  assert.deepEqual([row(fall, 'Lily').paid, row(fall, 'Lily').expectedFeeCents], [false, 14000]);
  assert.deepEqual([row(fall, 'Chris').overpaidCents, row(fall, 'Chris').privateOn, row(fall, 'Chris').paidCents], [2000, null, 16000]);
  assert.deepEqual([row(fall, 'Ruby').feeKind, row(fall, 'Ruby').expectedFeeCents, row(fall, 'Ruby').privateTime], ['private', 18000, '16:00']);
  assert.deepEqual([row(fall, 'Ava', 0).duplicateState, row(fall, 'Ava', 1).duplicateState], ['possible', 'possible']);
  assert.equal(row(fall, 'Ava', 0).duplicateOf, row(fall, 'Ava', 1).id);
  assert.equal(row(fall, 'Ava', 1).duplicateOf, row(fall, 'Ava', 0).id);
  assert.deepEqual([row(fall, 'Owen').status, row(fall, 'Owen').withdrawnReason], ['withdrawn', 'withdrawn']);
  const grace = row(fall, 'Grace');
  assert.deepEqual([grace.isMakeup, grace.feeKind, grace.expectedFeeCents, grace.payingBy, grace.makeupOfEventName], [true, 'none', 0, null, 'Summer Star Testing']);
  assert.deepEqual(grace.makeupSubjects.map((m) => m.kind), ['retest']); // Two Step Sparring
  assert.equal(row(fall, 'Sam').source, 'desk');
  assert.deepEqual([row(fall, 'Jordan').danLabel, row(fall, 'Jordan').expectedFeeCents], ['2nd Dan', 15000]);
  assert.equal(row(fall, 'Mia').reference, 'ST-4007');
  assert.equal(row(summer, 'Taylor').paidCents, 16000); // paid ON the testing day: the same-day fee
  // belt order (v0.117; school order changed to Worcester first by v0.519 / 0038, S-1): Dan, stars,
  // Worcester before Shrewsbury, last, first
  assert.deepEqual(fall.map((c) => c.id), sortBeltOrder(fall).map((c) => c.id));
  assert.equal(fall[0].dan, 1);
  assert.equal(fall.at(-1).firstName, 'Ruby'); // 3rd Dan last
  const firstTwo = fall.filter((c) => c.dan === 1 && c.starsFrom === 0).map((c) => c.locationCode);
  assert.ok(firstTwo.includes('worcester') && firstTwo.includes('shrewsbury'));
  assert.deepEqual(firstTwo, [...firstTwo].sort((a, b) => (a === 'worcester' ? -1 : 1) - (b === 'worcester' ? -1 : 1)));
  // the rule itself, on made-up rows: Dan, then stars, then Worcester before Shrewsbury, then last and first name
  const mk = (id, dan, starsFrom, locationCode, lastName, firstName) => ({ id, dan, starsFrom, locationCode, lastName, firstName });
  assert.deepEqual(sortBeltOrder([
    mk('a', 1, 1, 'worcester', 'Zed', 'Al'), mk('b', 1, 0, 'shrewsbury', 'Abe', 'Zoe'), mk('c', 1, 0, 'worcester', 'Yu', 'Al'),
    mk('d', 1, 0, 'shrewsbury', 'Abe', 'Al'), mk('e', 1, 0, 'worcester', 'Yu', 'Ab'), mk('f', 2, 0, 'worcester', 'Aaa', 'Aaa'),
  ]).map((c) => c.id), ['e', 'c', 'd', 'b', 'a', 'f']);
});

await check('privacy: no date of birth or email in ANY list read (column lists, the view, the make-up list)', async () => {
  for (const [table, columns] of Object.entries(STAR_CANDIDATE_LIST_COLUMNS)) {
    const list = columns.split(',').map((c) => c.trim());
    for (const banned of ['date_of_birth', 'email_for_results', 'email', 'signature', 'submission_id', 'created_by', 'updated_by', 'withdrawn_by', 'recorded_by']) {
      assert.equal(list.includes(banned), false, `${table} reads ${banned}`);
    }
    assert.equal(list.includes('*'), false);
  }
  const rig = makeRig();
  // the view has no such columns at all; '*' is refused
  assert.equal(rig.cands.select('star_roster', 'id, date_of_birth', [], [], rig.ctx).error.code, '42703');
  assert.equal(rig.cands.select('star_roster', 'id, email_for_results', [], [], rig.ctx).error.code, '42703');
  assert.equal(rig.cands.select('star_roster', '*', [], [], rig.ctx).error.code, '42501');
  assert.equal(rig.cands.select('star_makeup_subjects', 'id, created_by', [], [], rig.ctx).error.code, '42501');
  // what the screens get from the lists has no DOB / email anywhere
  const fall = await rig.api.loadCandidates(IDS.fall);
  const text = JSON.stringify(fall);
  for (const word of ['dateOfBirth', 'date_of_birth', 'email', '@example.com', '2013-04-02']) assert.equal(text.includes(word), false, word);
  const list = await rig.api.loadMakeupList(IDS.spring);
  assert.equal(list.status, 'ok');
  assert.equal(/date_of_birth|dateOfBirth|email|@/.test(JSON.stringify(list)), false);
  const raw = rig.cands.rpc('star_makeup_list', { p_event_id: IDS.spring }, rig.ctx).data;
  assert.equal(/date_of_birth|email/.test(JSON.stringify(raw)), false);
  // …and they DO come from the detail (v0.160)
  const mia = await cand(rig, 'fall', 'Mia');
  const d = await detailOf(rig, mia);
  assert.deepEqual([d.candidate.dateOfBirth, d.candidate.emailForResults, d.candidate.ageOnTestingDay], ['2013-04-02', 'patel.family@example.com', 13]);
  assert.equal(JSON.stringify(d).includes('created_by"'), false); // no login ids
});

await check('reads answer no_access when locked (empty lists never look like "no candidates")', async () => {
  const rig = makeRig();
  const mia = await cand(rig, 'fall', 'Mia');
  rig.lock();
  assert.equal(statusOf(await rig.api.loadCandidates(IDS.fall)), 'no_access');
  for (const r of [await rig.api.loadCandidateDetail(mia.id), await rig.api.loadCandidateHistory(mia.id), await rig.api.viewSignature(mia.id), await rig.api.loadMakeupList(IDS.fall)]) {
    assert.equal(r.status, 'no_access');
  }
  assert.deepEqual(rig.cands.select('star_roster', 'id', [], [], rig.ctx).data, []); // RLS: no rows
  rig.unlock();
  assert.equal(statusOf(await rig.api.loadCandidates('not-an-id')), 'not_found');
  assert.equal(statusOf(await rig.api.loadCandidateDetail('not-an-id')), 'not_found');
  assert.equal(statusOf(await rig.api.loadCandidateDetail(randomUUID())), 'not_found');
  assert.equal(statusOf(await rig.api.loadCandidateDetail(null)), 'invalid');
  // no connection / a broken answer → 'error', never a throw
  const none = createStarCandidatesApi(() => null, () => TODAY);
  for (const r of [await none.loadCandidates(IDS.fall), await none.loadCandidateDetail(mia.id), await none.recordPayment(pay(mia))]) assert.equal(r.status, 'error');
  const boom = createStarCandidatesApi(() => ({ rpc: async () => { throw new Error('offline'); }, from: () => { throw new Error('offline'); } }), () => TODAY);
  assert.equal(statusOf(await boom.loadCandidates(IDS.fall)), 'error');
  assert.equal(statusOf(await boom.undoPayment({ paymentId: mia.lastPaymentId })), 'error');
  const odd = createStarCandidatesApi(() => ({ rpc: async () => ({ data: { status: 'weird' }, error: null }) }), () => TODAY);
  assert.equal(statusOf(await odd.withdrawCandidate({ candidateId: mia.id, expectedVersion: 1 })), 'error');
});

await check('the make-up list (§5.8, OPEN-11): newest earlier event first, already_added here, left out when added elsewhere; a POST', async () => {
  const rig = makeRig();
  const spring = await rig.api.loadMakeupList(IDS.spring);
  assert.deepEqual(spring.rows.map((r) => [r.firstName, r.needs, r.choiceNeeded, r.alreadyAdded]), [
    // Fall (phase 5's graded seed) is earlier than Spring, so its make-ups come first
    ['Noah', ['Breaking'], false, false],
    ['Sam', ['Breaking', 'Knowledge'], false, false],
    ['Ethan', [], true, false],
    ['Drew', ['Breaking', 'Knowledge'], false, false],
    ['Taylor', ['Breaking'], false, false],
    ['Avery', [], true, false], // "Can't add yet"
  ]); // Grace and Sofia are left out: they are already make-ups in Fall; Morgan passed; Casey withdrew
  assert.deepEqual([spring.rows[3].earlierEventName, spring.rows[3].earlierTestingDate, spring.rows[3].starsTo], ['Summer Star Testing', '2026-07-11', 1]);
  assert.deepEqual([spring.rows[0].earlierEventName, spring.rows[0].earlierTestingDate], ['Fall Star Testing', '2026-11-14']);
  const fall = await rig.api.loadMakeupList(IDS.fall);
  assert.deepEqual(fall.rows.map((r) => [r.firstName, r.alreadyAdded]), [['Drew', false], ['Sofia', true], ['Grace', true], ['Taylor', false], ['Avery', false]]);
  assert.deepEqual((await rig.api.loadMakeupList(IDS.summer)).rows, []); // nothing earlier
  assert.equal(statusOf(await rig.api.loadMakeupList(randomUUID())), 'not_found');
  // the data layer never sends { get: true }; a GET would fail (it writes: the signature clean-up)
  assert.ok(rig.calls.filter(([n]) => n === 'star_makeup_list').every(([, , options]) => options === undefined));
  assert.equal(rig.cands.rpc('star_makeup_list', { p_event_id: IDS.fall }, rig.ctx, { get: true }).error.code, '25006');
  assert.equal(rig.cands.rpc('star_candidate_detail', { p_candidate_id: spring.rows[0].candidateId }, rig.ctx, { get: true }).data.status, 'ok');
  assert.equal(choiceNeededLine('Fall 2026', 245), 'Fall 2026 · scored below 245. An admin chooses the subjects to retest on Fall 2026’s Grading tab first.');
});

await check('detail: payments oldest first with "reversed", the fee, the make-up result with kept grades, signature states', async () => {
  const rig = makeRig();
  const grace = await detailOf(rig, await cand(rig, 'fall', 'Grace'));
  assert.equal(grace.result.status, 'not_finished'); // Two Step Sparring still to retest
  const kept = grace.result.subjects.filter((s) => s.kept);
  assert.equal(kept.length, 9);
  assert.ok(kept.every((s) => s.grade === 'A+' && s.keptFromEventName === 'Summer Star Testing'));
  assert.deepEqual(grace.result.missing, ['Two Step Sparring']);
  assert.deepEqual(grace.makeupSubjects, [{ eventCategoryId: grace.result.subjects.find((s) => s.retest).eventCategoryId, name: 'Two Step Sparring', kind: 'retest' }]);
  assert.deepEqual([grace.candidate.assistantClasses, grace.result.ai.grade], [20, 'A+']); // counts copied (OPEN-10)
  assert.deepEqual([grace.feeKind, grace.expectedFeeCents, grace.signature.state], ['none', 0, 'none']);
  const alex = await detailOf(rig, await cand(rig, 'fall', 'Chris'));
  assert.deepEqual(alex.payments.map((p) => [p.kind, p.amountCents, p.method, p.reversed]), [['payment', 16000, 'check', false]]);
  assert.deepEqual([alex.overpaidCents, alex.feeKind, alex.signature.state], [2000, 'standard', 'on_file']);
  const morgan = await detailOf(rig, await cand(rig, 'summer', 'Morgan'));
  assert.deepEqual([morgan.result.status, morgan.result.total, morgan.signature.state], ['passed', 280, 'removed']);
  assert.ok(morgan.signature.signatureDeletedAt);
  // Date signed (v0.522): the day the form was sent comes with the detail — on file and removed, never for a desk row
  assert.ok(alex.signature.signedAt && morgan.signature.signedAt, 'on-file and removed signatures keep their signed-at');
  assert.equal(grace.signature.signedAt, null);
  const WORDS = await import('../../screens/testing/star/candidates/text.js');
  assert.equal(WORDS.DATE_SIGNED, 'Date signed');
  assert.match(WORDS.dateSignedDetail(alex.signature.signedAt), /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, \d{4}$/); // "Sat, Oct 31, 2026", like Registered
  const drew = await detailOf(rig, await cand(rig, 'summer', 'Drew'));
  assert.deepEqual([drew.result.status, drew.result.total, drew.result.needs, drew.result.makeupReasons], ['makeup', 210, ['Breaking', 'Knowledge'], ['below']]);
  assert.deepEqual(drew.sent, { sent: null, matches: false });
});

await check('View signature: the drawing on file, removed after 90 days, none for a desk row', async () => {
  const rig = makeRig();
  const mia = await rig.api.viewSignature((await cand(rig, 'fall', 'Mia')).id);
  assert.equal(mia.status, 'ok');
  assert.ok(mia.signature.startsWith('data:image/png;base64,'));
  const morgan = await rig.api.viewSignature((await cand(rig, 'summer', 'Morgan')).id);
  assert.deepEqual([morgan.signature, Boolean(morgan.signatureDeletedAt)], [null, true]);
  const sam = await rig.api.viewSignature((await cand(rig, 'fall', 'Sam')).id);
  assert.deepEqual(sam, { status: 'ok', signature: null, signedAt: null, signatureDeletedAt: null });
  // Anything that isn't a PNG data URL is never passed on to the screen (it would go into <img src>)
  const miaId = (await cand(rig, 'fall', 'Mia')).id;
  rig.editStore((st) => {
    st.signatures.find((x) => x.candidate_id === miaId).signature = 'javascript:alert(1)';
  });
  assert.equal((await rig.api.viewSignature(miaId)).signature, null);
});

await check('the 90-day signature clean-up: 91 days after the testing day removed by the next purging call, 90 kept, no version change', async () => {
  const rig = makeRig();
  const mia = await cand(rig, 'fall', 'Mia');
  rig.setToday(addDays('2026-11-14', 90));
  await rig.api.loadMakeupList(IDS.spring);
  assert.equal(rig.snap().signatures.find((s) => s.candidate_id === mia.id).signature === null, false); // 90 days: kept
  rig.setToday(addDays('2026-11-14', 91));
  await rig.api.loadMakeupList(IDS.spring); // a read that purges (§5.7)
  const sig = rig.snap().signatures.find((s) => s.candidate_id === mia.id);
  assert.deepEqual([sig.signature, Boolean(sig.signature_deleted_at), sig.version], [null, true, 1]);
  assert.equal((await cand(rig, 'fall', 'Mia')).version, mia.version);
  const h = await rig.api.loadCandidateHistory(mia.id);
  const purge = h.rows.find((r) => r.action === 'star_purge_old_signatures');
  assert.deepEqual([purge.before.signature, purge.after.signature], ['on file', null]);
});

await check('History (v0.169): this candidate and its own child rows, newest first, no login ids; DOB / email in full; the signature only "on file"', async () => {
  const rig = makeRig();
  const alex = await cand(rig, 'fall', 'Chris');
  const h = await rig.api.loadCandidateHistory(alex.id);
  assert.equal(h.status, 'ok');
  // (phase 5's seed then graded Chris: those rows are the newest — the grading checks cover them)
  assert.deepEqual(h.rows.slice(0, 3).map((r) => r.action), ['star_set_count', 'star_set_count', 'star_set_grade']);
  const actions = h.rows.map((r) => r.action).filter((a) => a !== 'star_set_grade' && a !== 'star_set_count');
  assert.deepEqual(actions.slice(0, 3), ['star_clear_private', 'star_record_payment', 'star_record_payment']); // newest first
  assert.ok(actions.includes('star_set_private') && actions.includes('star_public_register'));
  const insert = h.rows.find((r) => r.tableName === 'star_candidates' && r.op === 'insert');
  assert.deepEqual([insert.actorName, insert.after.date_of_birth, insert.after.email_for_results], ['Family form', '2011-12-01', 'kim.family@example.com']);
  const sig = h.rows.find((r) => r.tableName === 'star_candidate_signatures');
  assert.deepEqual([sig.after.signature, 'submission_id' in sig.after], ['on file', false]);
  const text = JSON.stringify(h.rows);
  for (const key of ['created_by"', 'updated_by"', 'recorded_by"', 'withdrawn_by"', 'actor_id', 'session_id', 'batch_id', 'data:image']) assert.equal(text.includes(key), false, key);
  // nobody else's rows: Jordan Kim (same last name) and his payment are not in Chris's history
  const jordan = await cand(rig, 'fall', 'Jordan');
  assert.equal(text.includes(jordan.id), false);
  assert.equal(h.rows.filter((r) => r.tableName === 'star_payments').length, 1);
  // what to hide while Hide private details is on (G6)
  const payRow = h.rows.find((r) => r.tableName === 'star_payments');
  assert.deepEqual(historyPrivacy(payRow), { payment: true, privateFields: [] });
  assert.deepEqual(historyPrivacy(insert).privateFields, ['date_of_birth', 'email_for_results']);
  // the insert sets paying_by too, but its line ("Registered on the family form") shows no money:
  // it stays while hidden (Q4 A, v0.518); a later CHANGE of Paying by is a payment row
  assert.equal(historyPrivacy(insert).payment, false);
  assert.equal(historyPrivacy({ tableName: 'star_candidates', op: 'update', before: { paying_by: 'cash' }, after: { paying_by: 'check' } }).payment, true);
  // a duplicate link pointing at a candidate doesn't bring the other's rows in
  const [ava1, ava2] = [await cand(rig, 'fall', 'Ava', 0), await cand(rig, 'fall', 'Ava', 1)];
  const h1 = await rig.api.loadCandidateHistory(ava1.id);
  assert.equal(JSON.stringify((await rig.api.loadCandidateHistory(ava2.id)).rows.filter((r) => r.op === 'insert' && r.tableName === 'star_candidates')).includes(ava1.id), true); // its own insert names the pair
  assert.equal(h1.rows.some((r) => r.tableName === 'star_candidates' && r.op === 'insert' && r.after?.id === ava2.id), false);
});

// =====================================================================================
// 3. §6.3 — every status in the contract's check order
// =====================================================================================

await check('star_add_candidate: no_access → invalid → not_found → finished → invalid (Dan/stars) → ok (+ duplicate, email trimmed, purge)', async () => {
  const rig = makeRig();
  rig.lock();
  assert.equal(statusOf(await rig.api.addCandidate({})), 'no_access'); // access first, even with nothing sent
  rig.unlock();
  const bad = [
    { firstName: '' }, { lastName: '​X' }, { dateOfBirth: '2026-10-20' }, { dateOfBirth: '1899-12-31' }, { email: null },
    { email: '' }, { email: 'a@b' }, { locationCode: 'boston' }, { dan: null }, { starsFrom: null }, { starsFrom: -1 }, { payingBy: 'venmo' },
    { payingBy: null }, { dateOfBirth: 'soon' }, { dan: 1.5 },
  ];
  for (const over of bad) assert.equal(statusOf(await rig.api.addCandidate(newDesk(over))), 'invalid', JSON.stringify(over));
  assert.equal(statusOf(await rig.api.addCandidate(newDesk({ eventId: randomUUID(), email: 'bad' }))), 'invalid'); // input before lookup
  assert.equal(statusOf(await rig.api.addCandidate(newDesk({ eventId: randomUUID() }))), 'not_found');
  assert.equal(statusOf(await rig.api.addCandidate(newDesk({ eventId: 'nope' }))), 'not_found');
  assert.equal(statusOf(await rig.api.addCandidate(newDesk({ eventId: IDS.summer, dan: 9 }))), 'finished'); // finished before the Dan rule
  assert.equal(statusOf(await rig.api.addCandidate(newDesk({ dan: 9 }))), 'invalid');
  assert.equal(statusOf(await rig.api.addCandidate(newDesk({ starsFrom: 4 }))), 'invalid'); // 1st Dan's highest star is 4
  assert.equal(statusOf(await rig.api.addCandidate(newDesk({ dan: 2, starsFrom: 3 }))), 'invalid'); // 2nd Dan: 3
  rig.staff();
  const added = await rig.api.addCandidate(newDesk({ email: '  grant@example.com ' }));
  assert.deepEqual([added.status, added.version], ['ok', 1]);
  const d = await rig.api.loadCandidateDetail(added.id);
  assert.deepEqual([d.candidate.emailForResults, d.candidate.source, d.candidate.reference, d.signature.state], ['grant@example.com', 'desk', null, 'none']);
  // works while registration is closed (Spring, not open yet) and on the testing day; not the day after
  assert.equal(statusOf(await rig.api.addCandidate(newDesk({ eventId: IDS.spring }))), 'ok');
  rig.setToday('2026-11-14');
  assert.equal(statusOf(await rig.api.addCandidate(newDesk({ firstName: 'Day', lastName: 'Of' }))), 'ok');
  rig.setToday('2026-11-15');
  assert.equal(statusOf(await rig.api.addCandidate(newDesk({ firstName: 'Day', lastName: 'After' }))), 'finished');
  rig.setToday(TODAY);
  // a possible duplicate (§5.6): same names (any case / spaces) + same DOB → both rows marked
  const mia = await cand(rig, 'fall', 'Mia');
  const dup = await rig.api.addCandidate(newDesk({ firstName: ' mia ', lastName: 'PATEL', dateOfBirth: '2013-04-02', locationCode: 'shrewsbury' }));
  const [m1, m2] = [await cand(rig, 'fall', 'Mia'), (await roster(rig, 'fall')).find((c) => c.id === dup.id)];
  assert.deepEqual([m2.firstName, m2.duplicateState, m2.duplicateOf, m1.duplicateState, m1.duplicateOf], ['mia', 'possible', mia.id, 'possible', dup.id]);
  assert.equal(m1.version, mia.version + 1); // the mark on the other row is a change too
  // another DOB → not a duplicate; no DOB on either side → the names alone (S3)
  const other = await rig.api.addCandidate(newDesk({ firstName: 'Noah', lastName: 'Chen', dateOfBirth: '2001-01-01' }));
  assert.equal((await roster(rig, 'fall')).find((c) => c.id === other.id).duplicateState, 'none');
  const sam2 = await rig.api.addCandidate(newDesk({ firstName: 'Sam', lastName: 'Ortiz', dateOfBirth: '2011-02-02' }));
  assert.equal((await roster(rig, 'fall')).find((c) => c.id === sam2.id).duplicateState, 'possible');
});

await check('star_add_makeup: no_access → invalid → not_found → finished → invalid → already_added → stale → choice_needed → invalid (Dan/stars) → ok', async () => {
  const rig = makeRig();
  const s = Object.fromEntries((await roster(rig, 'summer')).map((c) => [c.firstName, c]));
  const fallMia = await cand(rig, 'fall', 'Mia');
  const add = (eventId, earlierCandidateId) => rig.api.addMakeup({ eventId, earlierCandidateId });
  rig.lock();
  assert.equal(statusOf(await add(null, null)), 'no_access');
  rig.unlock();
  assert.equal(statusOf(await add(IDS.spring, null)), 'invalid');
  assert.equal(statusOf(await add(randomUUID(), s.Taylor.id)), 'not_found');
  assert.equal(statusOf(await add(IDS.spring, randomUUID())), 'not_found');
  assert.equal(statusOf(await add(IDS.summer, s.Morgan.id)), 'finished'); // this event is finished
  assert.equal(statusOf(await add(IDS.fall, fallMia.id)), 'invalid'); // the earlier event isn't earlier
  assert.equal(statusOf(await add(IDS.spring, s.Casey.id)), 'invalid'); // the earlier candidate withdrew
  assert.equal(statusOf(await add(IDS.spring, s.Grace.id)), 'already_added'); // a make-up in Fall already
  assert.equal(statusOf(await add(IDS.fall, s.Grace.id)), 'already_added'); // …and here
  assert.equal(statusOf(await add(IDS.spring, s.Morgan.id)), 'stale'); // passed: no make-up owed
  assert.equal(statusOf(await add(IDS.spring, s.Avery.id)), 'choice_needed'); // OPEN-11
  rig.editStore((st) => { st.event_dans.find((d) => d.event_id === IDS.spring && d.dan === 2).star_limit = 0; });
  assert.equal(statusOf(await add(IDS.spring, s.Taylor.id)), 'invalid'); // the star is at this event's limit
  rig.editStore((st) => { st.event_dans.find((d) => d.event_id === IDS.spring && d.dan === 2).star_limit = 3; });
  rig.staff();
  // Taylor (2nd Dan, D in Breaking): 11 kept grades, Breaking retested; counts copied (OPEN-10)
  const t = await add(IDS.spring, s.Taylor.id);
  assert.deepEqual([t.status, t.keptCount, t.retestCount, t.version], ['ok', 11, 1, 1]);
  const td = await detailOf(rig, (await roster(rig, 'spring')).find((c) => c.id === t.id));
  assert.deepEqual([td.candidate.isMakeup, td.candidate.payingBy, td.candidate.makeupOfCandidateId, td.candidate.assistantClasses], [true, null, s.Taylor.id, 18]);
  assert.deepEqual([td.candidate.dateOfBirth, td.candidate.emailForResults], ['2009-11-02', 'quinn.desk@example.com']); // copied
  assert.deepEqual(td.makeupSubjects.map((m) => [m.name, m.kind]), [['Breaking', 'retest']]);
  assert.equal(statusOf(await add(IDS.spring, s.Taylor.id)), 'already_added');
  // Drew (below 245, chosen Breaking + Knowledge): 8 kept, 2 retested
  const dr = await add(IDS.spring, s.Drew.id);
  assert.deepEqual([dr.keptCount, dr.retestCount], [8, 2]);
  // the make-up list now shows them as "Already added" here
  const list = await rig.api.loadMakeupList(IDS.spring);
  assert.deepEqual(list.rows.filter((r) => r.alreadyAdded).map((r) => r.firstName).sort(), ['Drew', 'Taylor']);
  // a make-up counts as a candidate but has no fee (v0.508 item 6)
  const spring = await roster(rig, 'spring');
  assert.ok(spring.every((c) => c.feeKind === 'none' && c.expectedFeeCents === 0 && !c.paid));
});

await check('star_add_makeup: OPEN-8 (a renamed subject is retested), OPEN-10 (Assistant Instructor retested → counts left empty), a later correction does not change the copy', async () => {
  const rig = makeRig();
  const taylor = await cand(rig, 'summer', 'Taylor');
  // Spring's copy calls one 2nd Dan subject differently; Taylor's Assistant Instructor count is too low (D)
  rig.editStore((st) => {
    st.event_categories.find((k) => k.event_id === IDS.spring && k.dan === 2 && k.name === 'Korean Terminology').name = 'Korean Words';
    st.candidates.find((c) => c.id === taylor.id).assistant_classes = 5;
  });
  const r = await rig.api.addMakeup({ eventId: IDS.spring, earlierCandidateId: taylor.id });
  assert.deepEqual([r.status, r.keptCount, r.retestCount], ['ok', 10, 3]); // Breaking + Assistant Instructor + Korean Words
  const d = await detailOf(rig, (await roster(rig, 'spring'))[0]);
  assert.deepEqual(d.makeupSubjects.map((m) => m.name).sort(), ['Assistant Instructor', 'Breaking', 'Korean Words']);
  assert.deepEqual([d.candidate.classesAttended, d.candidate.assistantClasses], [null, null]);
  // a later correction on the earlier event doesn't reach the copy (v0.163)
  rig.editStore((st) => { st.candidate_grades.filter((g) => g.candidate_id === taylor.id && g.grade === 'A').forEach((g) => { g.grade = 'B'; }); });
  const again = await detailOf(rig, (await roster(rig, 'spring'))[0]);
  assert.ok(again.result.subjects.filter((x) => x.kept).every((x) => x.grade === 'A'));
});

await check('star_update_candidate: no_access → invalid → not_found → stale → invalid (form DOB) → not_allowed (S8) → invalid (Dan/stars) → grades_exist → stale (count) → ok', async () => {
  const rig = makeRig();
  const mia = await cand(rig, 'fall', 'Mia');
  const miaD = await detailOf(rig, mia);
  rig.lock();
  assert.equal(statusOf(await rig.api.updateCandidate({})), 'no_access');
  rig.unlock();
  for (const over of [{ firstName: '' }, { email: null }, { email: 'x' }, { dateOfBirth: '2030-01-01' }, { locationCode: 'x' }, { dan: null }, { starsFrom: -1 }, { clearGradeCount: -1 }, { expectedVersion: null }]) {
    assert.equal(statusOf(await rig.api.updateCandidate(editOf(mia, miaD, over))), 'invalid', JSON.stringify(over));
  }
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(mia, miaD, { candidateId: randomUUID() }))), 'not_found');
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(mia, miaD, { expectedVersion: mia.version + 1, dateOfBirth: null }))), 'stale'); // stale before the DOB rule
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(mia, miaD, { dateOfBirth: null }))), 'invalid'); // a family-form row keeps its DOB
  rig.staff();
  // S8: staff can't change the Dan of a PAID row — before the Dan rule
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(mia, miaD, { dan: 9 }))), 'not_allowed');
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(mia, miaD, { dan: 2 }))), 'not_allowed');
  // …but may edit everything else on a paid row (OPEN-4)
  const renamed = await rig.api.updateCandidate(editOf(mia, miaD, { firstName: 'Mila', starsFrom: 1 }));
  assert.deepEqual([renamed.status, renamed.version, renamed.clearedGradeCount], ['ok', mia.version + 1, 0]);
  rig.admin();
  const mia2 = await cand(rig, 'fall', 'Mila');
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(mia2, miaD, { dan: 9 }))), 'invalid');
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(mia2, miaD, { starsFrom: 4 }))), 'invalid');
  // an admin changes a paid row's Dan: the payment stays, the fee follows the new Dan (OPEN-5)
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(mia2, miaD, { dan: 2, starsFrom: 0 }))), 'ok');
  const mia3 = await cand(rig, 'fall', 'Mila');
  assert.deepEqual([mia3.dan, mia3.paid, mia3.paidCents, mia3.expectedFeeCents, mia3.overpaidCents], [2, true, 14000, 15000, 0]);
  // grades_exist: Grace (make-up) has 9 kept grades; a Dan change asks first, then clears them all (OPEN-7)
  const grace = await cand(rig, 'fall', 'Grace');
  const graceD = await detailOf(rig, grace);
  rig.staff(); // unpaid: staff may
  assert.deepEqual(await rig.api.updateCandidate(editOf(grace, graceD, { dan: 2, starsFrom: 0 })), { status: 'grades_exist', gradeCount: 9 });
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(grace, graceD, { dan: 2, starsFrom: 0, clearGradeCount: 8 }))), 'stale');
  // a stars change in the same Dan keeps the grades (v0.164)
  const stars = await rig.api.updateCandidate(editOf(grace, graceD, { starsFrom: 3 }));
  assert.deepEqual([stars.status, stars.clearedGradeCount], ['ok', 0]);
  assert.equal(rig.snap().candidate_grades.filter((g) => g.candidate_id === grace.id).length, 9);
  const g2 = await cand(rig, 'fall', 'Grace');
  const cleared = await rig.api.updateCandidate(editOf(g2, graceD, { dan: 2, starsFrom: 0, clearGradeCount: 9 }));
  assert.deepEqual([cleared.status, cleared.clearedGradeCount], ['ok', 9]);
  const after = rig.snap();
  assert.equal(after.candidate_grades.filter((g) => g.candidate_id === grace.id).length, 0);
  assert.equal(after.makeup_subjects.filter((m) => m.candidate_id === grace.id).length, 0);
  assert.equal(after.candidates.find((c) => c.id === grace.id).assistant_classes, 20); // counts kept (OPEN-6)
  // no grades → no question; the same values → nothing written
  const lily = await cand(rig, 'fall', 'Lily');
  const lilyD = await detailOf(rig, lily);
  const lilyOk = await rig.api.updateCandidate(editOf(lily, lilyD, { dan: 2, starsFrom: 0 }));
  assert.deepEqual([lilyOk.status, lilyOk.clearedGradeCount], ['ok', 0]);
  const lily2 = await cand(rig, 'fall', 'Lily');
  assert.equal((await rig.api.updateCandidate(editOf(lily2, lilyD, { dan: 2, starsFrom: 0 }))).version, lily2.version);
  // a desk row may lose its DOB (S3)
  const sam = await cand(rig, 'fall', 'Sam');
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(sam, await detailOf(rig, sam), { dateOfBirth: null }))), 'ok');
  // a withdrawn candidate can be edited too (as Color Belt)
  const owen = await cand(rig, 'fall', 'Owen');
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(owen, await detailOf(rig, owen), { lastName: 'Harte' }))), 'ok');
});

await check('star_update_candidate: a name / DOB change works out the duplicate marks again (both sides)', async () => {
  const rig = makeRig();
  const ava2 = await cand(rig, 'fall', 'Ava', 1);
  const d = await detailOf(rig, ava2);
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(ava2, d, { dateOfBirth: '2013-05-10' }))), 'ok');
  const [a1, a2] = [await cand(rig, 'fall', 'Ava', 0), await cand(rig, 'fall', 'Ava', 1)];
  assert.deepEqual([a1.duplicateState, a1.duplicateOf, a2.duplicateState, a2.duplicateOf], ['none', null, 'none', null]);
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(a2, d, { dateOfBirth: '2013-05-09' }))), 'ok');
  assert.equal((await cand(rig, 'fall', 'Ava', 0)).duplicateState, 'possible');
});

await check('star_change_paying_by: no_access → invalid → not_found → stale → withdrawn → no_fee → already_paid → ok', async () => {
  const rig = makeRig();
  const lily = await cand(rig, 'fall', 'Lily');
  const call = (c, over = {}) => rig.api.changePayingBy({ candidateId: c.id, expectedVersion: c.version, payingBy: 'check', ...over });
  rig.lock();
  assert.equal(statusOf(await call(lily, { payingBy: 'venmo' })), 'no_access');
  rig.unlock();
  assert.equal(statusOf(await call(lily, { payingBy: 'venmo' })), 'invalid');
  assert.equal(statusOf(await call(lily, { payingBy: null })), 'invalid');
  assert.equal(statusOf(await call(lily, { candidateId: randomUUID() })), 'not_found');
  assert.equal(statusOf(await call(lily, { expectedVersion: 99 })), 'stale');
  assert.equal(statusOf(await call(await cand(rig, 'fall', 'Owen'))), 'withdrawn');
  const grace = await cand(rig, 'fall', 'Grace');
  assert.equal(statusOf(await call(grace)), 'no_fee');
  assert.equal(statusOf(await rig.api.withdrawCandidate({ candidateId: grace.id, expectedVersion: grace.version })), 'ok');
  assert.equal(statusOf(await call(await cand(rig, 'fall', 'Grace'))), 'withdrawn'); // withdrawn before no_fee
  assert.equal(statusOf(await call(await cand(rig, 'fall', 'Mia'))), 'already_paid');
  rig.staff();
  const r = await call(lily);
  assert.deepEqual([r.status, r.version], ['ok', lily.version + 1]);
  assert.equal((await cand(rig, 'fall', 'Lily')).payingBy, 'check');
  const same = await call(await cand(rig, 'fall', 'Lily'));
  assert.equal(same.version, lily.version + 1); // unchanged → no write
});

await check('star_resolve_duplicate: invalid → not_found → invalid (two events) → stale → withdrawn → stale (not a pair) → keep both / keep one; the 10-second staff Undo', async () => {
  const rig = makeRig();
  const [a1, a2] = [await cand(rig, 'fall', 'Ava', 0), await cand(rig, 'fall', 'Ava', 1)];
  const mia = await cand(rig, 'fall', 'Mia');
  const noah = await cand(rig, 'fall', 'Noah');
  const call = (keep, other, over = {}) => rig.api.resolveDuplicate({ keepId: keep.id, keepVersion: keep.version, otherId: other.id, otherVersion: other.version, keepBoth: false, ...over });
  rig.lock();
  assert.equal(statusOf(await call(a1, a1)), 'no_access');
  rig.unlock();
  assert.equal(statusOf(await call(a1, a1)), 'invalid'); // the same row twice
  assert.equal(statusOf(await call(a1, a2, { keepBoth: null })), 'invalid');
  assert.equal(statusOf(await call(a1, a2, { otherId: randomUUID() })), 'not_found');
  assert.equal(statusOf(await call(a1, await cand(rig, 'summer', 'Morgan'))), 'invalid'); // different events
  assert.equal(statusOf(await call(a1, a2, { keepVersion: 99 })), 'stale');
  assert.equal(statusOf(await call(a1, await cand(rig, 'fall', 'Owen'))), 'withdrawn');
  assert.equal(statusOf(await call(mia, noah)), 'stale'); // not each other's pair
  // keep both: both kept_both, pointing at each other; no longer "possible"
  const both = await call(a1, a2, { keepBoth: true });
  assert.deepEqual([both.status, both.keepVersion, both.otherVersion], ['ok', a1.version + 1, a2.version + 1]);
  const [k1, k2] = [await cand(rig, 'fall', 'Ava', 0), await cand(rig, 'fall', 'Ava', 1)];
  assert.deepEqual([k1.duplicateState, k1.duplicateOf, k2.duplicateState, k2.duplicateOf], ['kept_both', a2.id, 'kept_both', a1.id]);
  assert.equal(statusOf(await call(k1, k2)), 'stale'); // no longer "possible"
  // keep one (staff): the other goes to Removed as a duplicate copy; Undo within 10 s
  const rig2 = makeRig();
  const [b1, b2] = [await cand(rig2, 'fall', 'Ava', 0), await cand(rig2, 'fall', 'Ava', 1)];
  rig2.staff();
  const one = await rig2.api.resolveDuplicate({ keepId: b1.id, keepVersion: b1.version, otherId: b2.id, otherVersion: b2.version, keepBoth: false });
  assert.equal(one.status, 'ok');
  const removed = (await roster(rig2, 'fall')).find((c) => c.id === b2.id);
  assert.deepEqual([removed.status, removed.withdrawnReason, removed.withdrawnByName, removed.duplicateState], ['withdrawn', 'duplicate_copy', 'Staff', 'none']);
  assert.equal((await cand(rig2, 'fall', 'Ava', 0)).duplicateState, 'none'); // the kept one, rechecked
  rig2.later(9000);
  rig2.staff(OTHER_ID);
  assert.equal(statusOf(await rig2.api.restoreCandidate({ candidateId: b2.id, expectedVersion: removed.version })), 'not_allowed'); // someone else's
  rig2.staff();
  const undo = await rig2.api.restoreCandidate({ candidateId: b2.id, expectedVersion: removed.version });
  assert.equal(undo.status, 'ok');
  const back = await cand(rig2, 'fall', 'Ava', 1);
  assert.deepEqual([back.status, back.duplicateState], ['active', 'possible']);
  // after the window: staff can't, admins can
  const again = await rig2.api.resolveDuplicate({ keepId: b1.id, keepVersion: (await cand(rig2, 'fall', 'Ava', 0)).version, otherId: b2.id, otherVersion: back.version, keepBoth: false });
  assert.equal(again.status, 'ok');
  rig2.later(10001);
  const gone = (await roster(rig2, 'fall')).find((c) => c.id === b2.id);
  assert.equal(statusOf(await rig2.api.restoreCandidate({ candidateId: b2.id, expectedVersion: gone.version })), 'not_allowed');
  rig2.admin();
  assert.equal(statusOf(await rig2.api.restoreCandidate({ candidateId: b2.id, expectedVersion: gone.version })), 'ok');
});

await check('star_set_private / clear: no_access → invalid → not_found → stale → withdrawn → ok; the fee becomes private and back; payments untouched', async () => {
  const rig = makeRig();
  const lily = await cand(rig, 'fall', 'Lily');
  const call = (c, over = {}) => rig.api.setPrivate({ candidateId: c.id, expectedVersion: c.version, privateOn: '2026-12-01', privateTime: '16:00', ...over });
  rig.lock();
  assert.equal(statusOf(await call(lily, { privateTime: null })), 'no_access');
  rig.unlock();
  for (const over of [{ privateTime: null }, { privateOn: null }, { privateTime: '05:55' }, { privateTime: '22:05' }, { privateTime: '16:03' }, { privateTime: 'late' }]) {
    assert.equal(statusOf(await call(lily, over)), 'invalid', JSON.stringify(over));
  }
  assert.equal(statusOf(await call(lily, { candidateId: randomUUID() })), 'not_found');
  assert.equal(statusOf(await call(lily, { expectedVersion: 0 })), 'stale');
  assert.equal(statusOf(await call(await cand(rig, 'fall', 'Owen'))), 'withdrawn');
  rig.staff();
  const r = await call(lily, { privateOn: '2026-11-01' }); // before the testing day is fine too (v0.168)
  assert.deepEqual([r.status, r.expectedFeeCents], ['ok', 16000]);
  const p = await cand(rig, 'fall', 'Lily');
  assert.deepEqual([p.privateOn, p.privateTime, p.feeKind], ['2026-11-01', '16:00', 'private']);
  const back = await rig.api.clearPrivate({ candidateId: p.id, expectedVersion: p.version });
  assert.deepEqual([back.status, back.expectedFeeCents], ['ok', 14000]);
  const h = await rig.api.loadCandidateHistory(lily.id);
  assert.deepEqual(h.rows.slice(0, 2).map((x) => x.action), ['star_clear_private', 'star_set_private']);
  // paid at the private fee, then Back to the testing day → overpaid (v0.152); the payment is untouched
  const ruby = await cand(rig, 'fall', 'Ruby');
  const rb = await rig.api.clearPrivate({ candidateId: ruby.id, expectedVersion: ruby.version });
  assert.deepEqual([rb.status, rb.expectedFeeCents], ['ok', 16000]); // 3rd Dan standard
  const r2 = await cand(rig, 'fall', 'Ruby');
  assert.deepEqual([r2.paidCents, r2.overpaidCents], [18000, 2000]);
});

await check('star_withdraw_candidate (A): no_access → not_allowed → invalid → not_found → stale → withdrawn → ok (rechecks the pair)', async () => {
  const rig = makeRig();
  const a1 = await cand(rig, 'fall', 'Ava', 0);
  rig.lock();
  assert.equal(statusOf(await rig.api.withdrawCandidate({})), 'no_access');
  rig.unlock();
  rig.staff();
  assert.equal(statusOf(await rig.api.withdrawCandidate({})), 'not_allowed'); // role before input
  rig.admin();
  assert.equal(statusOf(await rig.api.withdrawCandidate({ candidateId: a1.id, expectedVersion: null })), 'invalid');
  assert.equal(statusOf(await rig.api.withdrawCandidate({ candidateId: randomUUID(), expectedVersion: 1 })), 'not_found');
  assert.equal(statusOf(await rig.api.withdrawCandidate({ candidateId: a1.id, expectedVersion: 99 })), 'stale');
  const owen = await cand(rig, 'fall', 'Owen');
  assert.equal(statusOf(await rig.api.withdrawCandidate({ candidateId: owen.id, expectedVersion: owen.version })), 'withdrawn');
  const r = await rig.api.withdrawCandidate({ candidateId: a1.id, expectedVersion: a1.version });
  assert.deepEqual([r.status, r.version], ['ok', a1.version + 1]);
  const [w1, w2] = [await cand(rig, 'fall', 'Ava', 0), await cand(rig, 'fall', 'Ava', 1)];
  assert.deepEqual([w1.status, w1.withdrawnReason, w1.withdrawnByName, w2.duplicateState], ['withdrawn', 'withdrawn', 'Test Admin', 'none']);
  // payments and grades stay with a withdrawn candidate
  const mia = await cand(rig, 'fall', 'Mia');
  await rig.api.withdrawCandidate({ candidateId: mia.id, expectedVersion: mia.version });
  assert.equal((await cand(rig, 'fall', 'Mia')).paidCents, 14000);
});

await check('star_restore_candidate: no_access → invalid → not_found → stale → not_allowed → stale (not withdrawn) → ok; a second active make-up → stale', async () => {
  const rig = makeRig();
  const owen = await cand(rig, 'fall', 'Owen');
  rig.lock();
  assert.equal(statusOf(await rig.api.restoreCandidate({})), 'no_access');
  rig.unlock();
  assert.equal(statusOf(await rig.api.restoreCandidate({ candidateId: owen.id })), 'invalid');
  assert.equal(statusOf(await rig.api.restoreCandidate({ candidateId: randomUUID(), expectedVersion: 1 })), 'not_found');
  assert.equal(statusOf(await rig.api.restoreCandidate({ candidateId: owen.id, expectedVersion: 99 })), 'stale');
  rig.staff();
  assert.equal(statusOf(await rig.api.restoreCandidate({ candidateId: owen.id, expectedVersion: owen.version })), 'not_allowed'); // a normal withdrawal: admins only
  rig.admin();
  const mia = await cand(rig, 'fall', 'Mia');
  assert.equal(statusOf(await rig.api.restoreCandidate({ candidateId: mia.id, expectedVersion: mia.version })), 'stale'); // not withdrawn
  const r = await rig.api.restoreCandidate({ candidateId: owen.id, expectedVersion: owen.version });
  assert.equal(r.status, 'ok');
  const o = await cand(rig, 'fall', 'Owen');
  assert.deepEqual([o.status, o.withdrawnReason, o.withdrawnAt, o.withdrawnByName], ['active', null, null, null]);
  // one active make-up per earlier candidate: withdraw Grace's Fall make-up, add her to Spring, restore Fall's
  const grace = await cand(rig, 'fall', 'Grace');
  await rig.api.withdrawCandidate({ candidateId: grace.id, expectedVersion: grace.version });
  const earlier = await cand(rig, 'summer', 'Grace');
  assert.equal(statusOf(await rig.api.addMakeup({ eventId: IDS.spring, earlierCandidateId: earlier.id })), 'ok'); // a withdrawn make-up row doesn't block
  const g = await cand(rig, 'fall', 'Grace');
  const before = JSON.stringify(rig.snap().candidates);
  assert.equal(statusOf(await rig.api.restoreCandidate({ candidateId: g.id, expectedVersion: g.version })), 'stale');
  assert.equal(JSON.stringify(rig.snap().candidates), before); // nothing changed
});

await check('star_delete_candidate (A): no_access → not_allowed → invalid → not_found → stale (version, payments) → ok (cascade, make-up link set null)', async () => {
  const rig = makeRig();
  const mia = await cand(rig, 'fall', 'Mia');
  const miaD = await detailOf(rig, mia);
  const ids = miaD.payments.map((p) => p.id);
  const del = (over = {}) => rig.api.deleteCandidate({ candidateId: mia.id, expectedVersion: mia.version, expectedPaymentIds: ids, ...over });
  rig.lock();
  assert.equal(statusOf(await del({ expectedPaymentIds: null })), 'no_access');
  rig.unlock();
  rig.staff();
  assert.equal(statusOf(await del({ expectedPaymentIds: null })), 'not_allowed');
  rig.admin();
  assert.equal(statusOf(await del({ expectedPaymentIds: null })), 'invalid');
  assert.equal(statusOf(await del({ expectedPaymentIds: [ids[0], ids[0]] })), 'invalid'); // the same id twice
  assert.equal(statusOf(rig.cands.rpc('star_delete_candidate', { p_candidate_id: mia.id, p_expected_version: 1, p_expected_payment_ids: [null] }, rig.ctx).data), 'invalid');
  assert.equal(statusOf(await del({ expectedPaymentIds: ['nope'] })), 'invalid');
  assert.equal(statusOf(await del({ candidateId: randomUUID() })), 'not_found');
  assert.equal(statusOf(await del({ expectedVersion: 99 })), 'stale');
  assert.equal(statusOf(await del({ expectedPaymentIds: [] })), 'stale'); // the warning named a payment
  assert.equal(statusOf(await del()), 'ok');
  const s = rig.snap();
  assert.equal(s.candidates.some((c) => c.id === mia.id), false);
  assert.equal(s.payments.some((p) => p.candidate_id === mia.id), false);
  assert.equal(s.signatures.some((p) => p.candidate_id === mia.id), false);
  // DOB and email stay in the change log (S10)
  assert.ok(s.change_log.some((l) => l.op === 'delete' && l.table_name === 'star_candidates' && l.before.date_of_birth === '2013-04-02'));
  // deleting the earlier candidate keeps the later make-up row, without the link
  const earlier = await cand(rig, 'summer', 'Grace');
  const ed = await detailOf(rig, earlier);
  assert.equal(statusOf(await rig.api.deleteCandidate({ candidateId: earlier.id, expectedVersion: earlier.version, expectedPaymentIds: ed.payments.map((p) => p.id) })), 'ok');
  const makeup = await cand(rig, 'fall', 'Grace');
  assert.deepEqual([makeup.isMakeup, makeup.makeupOfCandidateId, makeup.makeupOfEventName], [true, null, 'Summer Star Testing']);
  // deleting one of a pair: the other goes back to "none"
  const a1 = await cand(rig, 'fall', 'Ava', 0);
  assert.equal(statusOf(await rig.api.deleteCandidate({ candidateId: a1.id, expectedVersion: a1.version, expectedPaymentIds: [] })), 'ok');
  assert.deepEqual([(await cand(rig, 'fall', 'Ava')).duplicateState, (await cand(rig, 'fall', 'Ava')).duplicateOf], ['none', null]);
});

// =====================================================================================
// 4. §6.4 — payments: statuses, the refund cap, the Undo window, the net total
// =====================================================================================

await check('star_record_payment: no_access → invalid → not_found → stale → withdrawn → no_fee → already_paid → invalid (before registration) → ok (+ version, double click stale)', async () => {
  const rig = makeRig();
  const lily = await cand(rig, 'fall', 'Lily');
  rig.lock();
  assert.equal(statusOf(await rig.api.recordPayment({})), 'no_access');
  rig.unlock();
  for (const over of [{ method: 'venmo' }, { method: null }, { amountCents: 0 }, { amountCents: 100001 }, { amountCents: 12.5 }, { paidOn: null }, { paidOn: '2026-10-20' }, { expectedVersion: null }]) {
    assert.equal(statusOf(await rig.api.recordPayment(pay(lily, over))), 'invalid', JSON.stringify(over));
  }
  assert.equal(statusOf(await rig.api.recordPayment(pay(lily, { candidateId: randomUUID() }))), 'not_found');
  assert.equal(statusOf(await rig.api.recordPayment(pay(lily, { expectedVersion: 99 }))), 'stale');
  assert.equal(statusOf(await rig.api.recordPayment(pay(await cand(rig, 'fall', 'Owen')))), 'withdrawn');
  assert.equal(statusOf(await rig.api.recordPayment(pay(await cand(rig, 'fall', 'Grace'), { amountCents: 100 }))), 'no_fee');
  assert.equal(statusOf(await rig.api.recordPayment(pay(await cand(rig, 'fall', 'Mia')))), 'already_paid');
  assert.equal(statusOf(await rig.api.recordPayment(pay(lily, { paidOn: '2026-10-13' }))), 'invalid'); // Lily registered Oct 14 (v0.175)
  rig.staff();
  const r = await rig.api.recordPayment(pay(lily, { amountCents: 12550, paidOn: '2026-10-14' })); // a typed discount, any cents
  assert.deepEqual([r.status, r.version], ['ok', lily.version + 1]);
  const l = await cand(rig, 'fall', 'Lily');
  assert.deepEqual([l.paid, l.paidCents, l.paidOn, l.paidMethod, l.lastPaymentId, l.lastPaymentRecordedByName], [true, 12550, '2026-10-14', 'cash', r.paymentId, 'Staff']);
  assert.equal(statusOf(await rig.api.recordPayment(pay(lily))), 'stale'); // a double click with the old version
  // allowed in every event state: after the testing day, the same-day fee is pre-filled
  rig.setToday('2026-11-20');
  const ethan = await cand(rig, 'fall', 'Ethan');
  assert.deepEqual([ethan.feeKind, ethan.expectedFeeCents], ['same_day', 15000]);
  assert.equal(statusOf(await rig.api.recordPayment(pay(ethan, { paidOn: '2026-11-20' }))), 'ok');
});

await check('star_undo_payment: the 10-second staff window (own payment only), admins any time; reversal / already undone / refund standing', async () => {
  const rig = makeRig();
  const lily = await cand(rig, 'fall', 'Lily');
  rig.lock();
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: null })), 'no_access');
  rig.unlock();
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: null })), 'invalid');
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: randomUUID() })), 'not_found');
  rig.staff();
  const r = await rig.api.recordPayment(pay(lily));
  rig.later(9999);
  const u = await rig.api.undoPayment({ paymentId: r.paymentId }); // the toast's Undo, within 10 s
  assert.deepEqual([u.status, u.version], ['ok', r.version + 1]);
  const l = await cand(rig, 'fall', 'Lily');
  assert.deepEqual([l.paid, l.paidCents, l.lastPaymentId], [false, 0, null]);
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: r.paymentId })), 'stale'); // already undone
  const reversal = (await detailOf(rig, l)).payments.find((p) => p.kind === 'reversal');
  rig.admin();
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: reversal.id })), 'invalid'); // a reversal can't be undone
  rig.staff();
  const r2 = await rig.api.recordPayment(pay(await cand(rig, 'fall', 'Lily')));
  rig.later(10001);
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: r2.paymentId })), 'not_allowed'); // too late (UNDO_PAYMENT_TOO_LATE)
  const r3 = await rig.api.recordPayment(pay(await cand(rig, 'fall', 'Ethan')));
  rig.staff(OTHER_ID);
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: r3.paymentId })), 'not_allowed'); // not their own
  rig.staff();
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: (await cand(rig, 'fall', 'Mia')).lastPaymentId })), 'not_allowed'); // seeded days ago
  rig.admin();
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: r2.paymentId })), 'ok'); // admins any time
});

await check('star_record_refund (A, S7): no_access → not_allowed → invalid → not_found → stale → withdrawn → invalid (date) → refund_too_large (+ overpaidCents) → ok; Undo refused while a refund stands', async () => {
  const rig = makeRig();
  const alex = await cand(rig, 'fall', 'Chris'); // paid $160, owes $140 → $20 overpaid
  const refund = (c, over = {}) => rig.api.recordRefund({ candidateId: c.id, expectedVersion: c.version, method: 'cash', amountCents: 2000, refundedOn: TODAY, ...over });
  rig.lock();
  assert.equal(statusOf(await rig.api.recordRefund({})), 'no_access');
  rig.unlock();
  rig.staff();
  assert.equal(statusOf(await refund(alex)), 'not_allowed'); // admins only
  rig.admin();
  for (const over of [{ method: 'card' }, { amountCents: 0 }, { amountCents: 100001 }, { refundedOn: '2026-10-20' }, { refundedOn: null }]) {
    assert.equal(statusOf(await refund(alex, over)), 'invalid', JSON.stringify(over));
  }
  assert.equal(statusOf(await refund(alex, { candidateId: randomUUID() })), 'not_found');
  assert.equal(statusOf(await refund(alex, { expectedVersion: 99 })), 'stale');
  assert.equal(statusOf(await refund(await cand(rig, 'fall', 'Owen'))), 'withdrawn');
  assert.equal(statusOf(await refund(alex, { refundedOn: '2026-10-13' })), 'invalid'); // before he registered (Oct 14)
  assert.deepEqual(await refund(await cand(rig, 'fall', 'Mia')), { status: 'refund_too_large', overpaidCents: 0 }); // nothing overpaid
  assert.deepEqual(await refund(alex, { amountCents: 2001 }), { status: 'refund_too_large', overpaidCents: 2000 });
  rig.later(1000); // each call at its own moment, like the database's now()
  const r = await refund(alex, { amountCents: 2000, method: 'check' });
  assert.deepEqual([r.status, r.version], ['ok', alex.version + 1]);
  rig.later(1000);
  const a = await cand(rig, 'fall', 'Chris');
  assert.deepEqual([a.paidCents, a.overpaidCents, a.refundedCents, a.paid, a.lastPaymentId], [14000, 0, 2000, true, alex.lastPaymentId]);
  assert.deepEqual(await refund(a, { amountCents: 1 }), { status: 'refund_too_large', overpaidCents: 0 }); // someone else refunded first
  // while the refund stands: Undo / Edit payment are refused ("Undo the refund first.")
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: a.lastPaymentId })), 'invalid');
  assert.equal(statusOf(await rig.api.editPayment({ paymentId: a.lastPaymentId, method: 'cash', amountCents: 14000, paidOn: TODAY })), 'invalid');
  // undo the refund (admin): overpaid again; then the payment can be undone
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: r.paymentId })), 'ok');
  rig.later(1000);
  const a2 = await cand(rig, 'fall', 'Chris');
  assert.deepEqual([a2.overpaidCents, a2.refundedCents], [2000, 0]);
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: a2.lastPaymentId })), 'ok');
  assert.equal((await cand(rig, 'fall', 'Chris')).paidCents, 0);
  // the detail's payment rows tell the story
  const d = await detailOf(rig, a2);
  assert.deepEqual(d.payments.map((p) => [p.kind, p.amountCents, p.reversed]), [
    ['payment', 16000, true], ['refund', -2000, true], ['reversal', 2000, false], ['reversal', -16000, false],
  ]);
});

await check('star_edit_payment (A): not_allowed → invalid → not_found → invalid (not a payment) → stale → invalid (refund standing, date) → ok = reversal + new payment', async () => {
  const rig = makeRig();
  const mia = await cand(rig, 'fall', 'Mia');
  const edit = (over = {}) => rig.api.editPayment({ paymentId: mia.lastPaymentId, method: 'check', amountCents: 13000, paidOn: '2026-10-15', ...over });
  rig.lock();
  assert.equal(statusOf(await edit()), 'no_access');
  rig.unlock();
  rig.staff();
  assert.equal(statusOf(await edit()), 'not_allowed');
  rig.admin();
  for (const over of [{ method: 'venmo' }, { amountCents: 0 }, { paidOn: '2026-10-20' }, { paidOn: null }, { paymentId: null }]) assert.equal(statusOf(await edit(over)), 'invalid', JSON.stringify(over));
  assert.equal(statusOf(await edit({ paymentId: randomUUID() })), 'not_found');
  assert.equal(statusOf(await edit({ paidOn: '2026-10-11' })), 'invalid'); // Mia registered Oct 12
  const r = await edit();
  assert.deepEqual([r.status, r.version], ['ok', mia.version + 1]);
  const m = await cand(rig, 'fall', 'Mia');
  assert.deepEqual([m.paidCents, m.paidMethod, m.paidOn, m.lastPaymentId], [13000, 'check', '2026-10-15', r.paymentId]);
  assert.equal(statusOf(await edit()), 'stale'); // the old payment is already reversed
  const reversal = (await detailOf(rig, m)).payments.find((p) => p.kind === 'reversal');
  assert.equal(statusOf(await edit({ paymentId: reversal.id })), 'invalid'); // not a payment
});

await check('the payments table rule: the net total never goes below zero (star_payments_net_check → invalid, nothing saved)', async () => {
  const rig = makeRig();
  const alex = await cand(rig, 'fall', 'Chris');
  // A damaged store where the refund-first rule can't see the refund (kind written wrongly): the
  // table rule still refuses an undo that would leave the total below zero.
  rig.editStore((s) => {
    s.payments.push({ id: randomUUID(), candidate_id: alex.id, kind: 'reversal_like', amount_cents: -2000, method: 'cash', paid_on: TODAY, recorded_at: new Date(NOW).toISOString(), recorded_by: null, recorded_by_name: 'x', reverses_payment_id: null });
  });
  const before = JSON.stringify(rig.snap().payments);
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: alex.lastPaymentId })), 'invalid');
  assert.equal(JSON.stringify(rig.snap().payments), before);
});

// =====================================================================================
// 5. The takeover: the Events tab's counts and Delete event, the console helpers
// =====================================================================================

await check('Events counts after the takeover: the Events list and Delete event read the candidates fake', async () => {
  const rig = makeRig();
  const r = await rig.eventsApi.loadStarEvents();
  assert.equal(r.status, 'ok');
  const by = Object.fromEntries(r.events.map((e) => [e.name, e]));
  assert.deepEqual(Object.keys(by).sort(), ['Fall Star Testing', 'Spring Star Testing', 'Summer Star Testing']);
  const nums = (e) => [e.activeCount, e.withdrawnCount, e.registrationCount, e.paymentTotalCents];
  assert.deepEqual(nums(by['Fall Star Testing']), [13, 1, 14, 93000]);
  // (phase 6 added six Summer desk rows for the Results states: Lucas, Nina, Ben, Zoe, Ivy, Ella —
  // four paid: 14000 + 14000 + 16000 + 14000)
  assert.deepEqual(nums(by['Summer Star Testing']), [12, 1, 13, 146000]);
  assert.deepEqual(nums(by['Spring Star Testing']), [0, 0, 0, 0]);
  assert.deepEqual([by['Summer Star Testing'].state, by['Fall Star Testing'].state, by['Spring Star Testing'].state], ['finished', 'open', 'not_open_yet']);
  // the counts follow the candidates fake's writes
  const lily = await cand(rig, 'fall', 'Lily');
  await rig.api.recordPayment(pay(lily));
  const fall = (await rig.eventsApi.loadStarEvent(IDS.fall)).event;
  assert.deepEqual(nums(fall), [13, 1, 14, 107000]);
  // Delete event with the counted numbers: candidates, payments, signatures, grades all go
  assert.equal(statusOf(await rig.eventsApi.deleteStarEvent({ eventId: fall.id, expectedVersion: fall.version, expectedCandidateCount: 13, expectedPaymentTotalCents: 107000 })), 'stale');
  assert.equal(statusOf(await rig.eventsApi.deleteStarEvent({ eventId: fall.id, expectedVersion: fall.version, expectedCandidateCount: 14, expectedPaymentTotalCents: 107000 })), 'ok');
  const s = rig.snap();
  const fallIds = new Set(s.candidates.filter((c) => c.event_id === IDS.fall).map((c) => c.id));
  assert.equal(fallIds.size, 0);
  for (const list of ['payments', 'signatures', 'makeup_subjects', 'candidate_grades']) {
    assert.ok(s[list].every((row) => s.candidates.some((c) => c.id === row.candidate_id)), list);
  }
  assert.ok(starCandidatesSeedIsCurrent(s)); // still the candidates fake's store
  assert.equal((await rig.api.loadMakeupList(IDS.spring)).rows.some((x) => x.firstName === 'Grace'), true); // her Fall make-up went with Fall
  // the seed itself agrees with the events fake: both read the same store
  assert.deepEqual(rig.events.snapshot().events.map((e) => e.id).sort(), s.events.map((e) => e.id).sort());
});

await check('a store saved before phase 3 (the phase 2 seed) is replaced by this seed — in both fakes at once', async () => {
  let store = null;
  const saveStore = (x) => { store = JSON.stringify(x); };
  const loadStore = () => (store === null ? null : JSON.parse(store));
  const star = createStarBackend({ loadStore, saveStore, now: () => NOW, newId: randomUUID });
  const plain = createStarEventsBackend({ readBase: () => star.snapshot(), saveStore, now: () => NOW, today: () => TODAY, newId: randomUUID });
  assert.ok(plain.snapshot().events.some((e) => e.name === 'Winter Star Testing')); // the phase 2 store
  const events = createStarEventsBackend({
    readBase: () => star.snapshot(), saveStore, now: () => NOW, today: () => TODAY, newId: randomUUID,
    seed: defaultStarCandidatesData, seedIsCurrent: starCandidatesSeedIsCurrent,
  });
  assert.deepEqual(events.snapshot().events.map((e) => e.name).sort(), ['Fall Star Testing', 'Spring Star Testing', 'Summer Star Testing']);
  assert.ok(starCandidatesSeedIsCurrent(JSON.parse(store)));
});

await check('failNextSave: the next write fails like a dropped connection and changes nothing; simulateOtherAdminEdit makes candidates stale; reset', async () => {
  const rig = makeRig();
  const lily = await cand(rig, 'fall', 'Lily');
  const before = JSON.stringify(rig.snap());
  rig.cands.failNextSave();
  assert.equal(statusOf(await rig.api.recordPayment(pay(lily))), 'error');
  assert.equal(JSON.stringify(rig.snap()), before);
  assert.equal(statusOf(await rig.api.recordPayment(pay(lily))), 'ok'); // only once
  rig.events.simulateOtherAdminEdit(); // "another admin" changed every event and candidate
  const ethan = (await roster(rig, 'fall')).find((c) => c.firstName === 'Ethan');
  assert.equal(ethan.updatedByName, 'Other Admin');
  assert.equal(statusOf(await rig.api.changePayingBy({ candidateId: ethan.id, expectedVersion: ethan.version - 1, payingBy: 'card' })), 'stale');
  rig.cands.reset();
  assert.equal((await cand(rig, 'fall', 'Lily')).paid, false);
  // the write list (failNextSave('star') in mockClient targets these) and every function's argument names
  assert.equal(STAR_CANDIDATE_WRITE_RPC_NAMES.length, 13);
  assert.ok(!STAR_CANDIDATE_WRITE_RPC_NAMES.includes('star_makeup_list'));
  const missing = rig.cands.rpc('star_record_payment', { p_candidate_id: lily.id }, rig.ctx);
  assert.equal(missing.error.code, 'PGRST202');
  const extra = rig.cands.rpc('star_withdraw_candidate', { p_candidate_id: lily.id, p_expected_version: 1, p_reason: 'x' }, rig.ctx);
  assert.equal(extra.error.code, 'PGRST202');
  assert.equal(rig.cands.rpc('star_record_payment', { p_candidate_id: lily.id, p_expected_version: 1, p_method: 'cash', p_amount_cents: 100, p_paid_on: 'today' }, rig.ctx).error.code, '22007');
  rig.ctx.signedIn = false;
  assert.equal(rig.cands.rpc('star_candidate_detail', { p_candidate_id: lily.id }, rig.ctx).error.code, '42501');
});

await check('dialogs send the version / payment id they OPENED with: after a 15-second refresh brings a newer row, Save answers stale', async () => {
  const rig = makeRig();
  // Another person's change while the dialog is open; then the refresh (a fresh roster read).
  // (always a DIFFERENT method, so the row really changes and its version goes up)
  const otherChangesPayingBy = async (c) => {
    const payingBy = ['cash', 'check', 'card'].find((m) => m !== c.payingBy);
    assert.equal(statusOf(await rig.api.changePayingBy({ candidateId: c.id, expectedVersion: c.version, payingBy })), 'ok');
    assert.equal((await rig.api.loadCandidateDetail(c.id)).candidate.version, c.version + 1);
  };
  const otherRenames = async (c) => assert.equal(statusOf(await rig.api.updateCandidate(editOf(c, await detailOf(rig, c), { firstName: `${c.firstName}a` }))), 'ok');

  // Record payment: opened on Lily, someone changes how she'll pay, the roster refreshes.
  const lily = await cand(rig, 'fall', 'Lily');
  const recordSnap = takeSnapshot(lily);
  assert.equal(recordSnap.expectedFeeCents, lily.expectedFeeCents); // the pre-filled amount is the database's
  await otherChangesPayingBy(lily);
  const lilyNow = await cand(rig, 'fall', 'Lily');
  assert.equal(lilyNow.version, lily.version + 1);
  const payment = { method: 'cash', amountCents: recordSnap.expectedFeeCents, paidOn: TODAY };
  assert.equal(statusOf(await rig.api.recordPayment(writeArgs('record', recordSnap, payment))), 'stale');
  // (the newest version would have gone through: exactly the silent overwrite this prevents)
  assert.equal(writeArgs('record', takeSnapshot(lilyNow), payment).expectedVersion, lilyNow.version);

  // Change how they'll pay
  const ethan = await cand(rig, 'fall', 'Ethan');
  const payingSnap = takeSnapshot(ethan);
  await otherChangesPayingBy(ethan);
  assert.equal(statusOf(await rig.api.changePayingBy(writeArgs('payingBy', payingSnap, { payingBy: ethan.payingBy }))), 'stale');

  // Set private testing
  const lily2 = await cand(rig, 'fall', 'Lily');
  const privateSnap = takeSnapshot(lily2);
  await otherChangesPayingBy(lily2);
  assert.equal(statusOf(await rig.api.setPrivate(writeArgs('private', privateSnap, { privateOn: '2026-11-20', privateTime: '15:00' }))), 'stale');

  // Edit details: the snapshot is the DETAIL's version (what the form was filled from)
  const ethan2 = await cand(rig, 'fall', 'Ethan');
  const ethanDetail = await detailOf(rig, ethan2);
  const editSnap = takeSnapshot(ethanDetail.candidate);
  assert.equal(editSnap.version, ethan2.version);
  await otherRenames(ethan2);
  const form = editOf(ethan2, ethanDetail, { lastName: 'Changed' });
  assert.equal(statusOf(await rig.api.updateCandidate(writeArgs('edit', editSnap, form))), 'stale');

  // Record refund (admin): Chris is $20 overpaid
  const alex = await cand(rig, 'fall', 'Chris');
  const refundSnap = takeSnapshot(alex);
  await otherRenames(alex);
  assert.equal(statusOf(await rig.api.recordRefund(writeArgs('refund', refundSnap, { method: 'cash', amountCents: 2000, paidOn: TODAY }))), 'stale');

  // Edit payment / Undo payment: the PAYMENT id on screen. Another admin edits Mia's payment first
  // (that reverses it and records a new one), the refresh shows the new id; ours is the old one.
  const mia = await cand(rig, 'fall', 'Mia');
  const paySnap = takeSnapshot(mia);
  assert.equal(statusOf(await rig.api.editPayment({ paymentId: mia.lastPaymentId, method: 'check', amountCents: 13000, paidOn: '2026-10-15' })), 'ok');
  const miaNow = await cand(rig, 'fall', 'Mia');
  assert.notEqual(miaNow.lastPaymentId, paySnap.lastPaymentId);
  assert.equal(statusOf(await rig.api.editPayment(writeArgs('editPayment', paySnap, { method: 'cash', amountCents: 14000, paidOn: '2026-10-15' }))), 'stale');
  assert.equal(statusOf(await rig.api.undoPayment(writeArgs('undoPayment', paySnap))), 'stale');
  // and nothing was undone: Mia still shows the other admin's payment
  const miaAfter = await cand(rig, 'fall', 'Mia');
  assert.deepEqual([miaAfter.paidCents, miaAfter.lastPaymentId], [13000, miaNow.lastPaymentId]);
  assert.throws(() => writeArgs('nope', paySnap));
});

await check('the data layer sends exactly the migration\'s argument names', async () => {
  const rig = makeRig();
  const lily = await cand(rig, 'fall', 'Lily');
  const d = await detailOf(rig, lily);
  await rig.api.addCandidate(newDesk());
  await rig.api.updateCandidate(editOf(lily, d));
  await rig.api.changePayingBy({ candidateId: lily.id, expectedVersion: lily.version, payingBy: 'card' });
  await rig.api.setPrivate({ candidateId: lily.id, expectedVersion: 1, privateOn: '2026-12-01', privateTime: '16:00' });
  await rig.api.resolveDuplicate({ keepId: lily.id, keepVersion: 1, otherId: d.candidate.id, otherVersion: 1, keepBoth: true });
  await rig.api.deleteCandidate({ candidateId: lily.id, expectedVersion: 1, expectedPaymentIds: [] });
  await rig.api.recordRefund({ candidateId: lily.id, expectedVersion: 1, method: 'cash', amountCents: 1, refundedOn: TODAY });
  await rig.api.editPayment({ paymentId: randomUUID(), method: 'cash', amountCents: 1, paidOn: TODAY });
  await rig.api.addMakeup({ eventId: IDS.spring, earlierCandidateId: lily.id });
  const sent = Object.fromEntries(rig.calls.filter(([n]) => n.startsWith('star_')).map(([n, args]) => [n, Object.keys(args).join(',')]));
  assert.equal(sent.star_add_candidate, 'p_event_id,p_first,p_last,p_date_of_birth,p_email,p_location_code,p_dan,p_stars_from,p_paying_by');
  assert.equal(sent.star_update_candidate, 'p_candidate_id,p_expected_version,p_first,p_last,p_date_of_birth,p_email,p_location_code,p_dan,p_stars_from,p_clear_grade_count');
  assert.equal(sent.star_set_private, 'p_candidate_id,p_expected_version,p_private_on,p_private_time');
  assert.equal(sent.star_resolve_duplicate, 'p_keep_id,p_keep_version,p_other_id,p_other_version,p_keep_both');
  assert.equal(sent.star_delete_candidate, 'p_candidate_id,p_expected_version,p_expected_payment_ids');
  assert.equal(sent.star_record_refund, 'p_candidate_id,p_expected_version,p_method,p_amount_cents,p_refunded_on,p_school'); // 0038: + the desk's school (null = the candidate's)
  assert.equal(sent.star_edit_payment, 'p_payment_id,p_method,p_amount_cents,p_paid_on');
  assert.equal(sent.star_add_makeup, 'p_event_id,p_earlier_candidate_id');
  assert.equal(rig.calls.find(([n]) => n === 'star_set_private')[1].p_private_time, '16:00:00');
  assert.ok(rig.calls.every(([, , options]) => options === undefined)); // every call a POST
});

// =====================================================================================
// 6. Words
// =====================================================================================

await check('words: every status of every action has a message (ok and no_access have none)', async () => {
  const actions = ['withdraw', 'restore', 'undo_duplicate', 'undo_payment', 'admin_undo_payment', 'undo_refund', 'duplicate', 'undo_edit_payment', 'undo_paying_by', 'add',
    'edit', 'paying_by', 'private', 'record_payment', 'edit_payment', 'refund', 'delete', 'add_makeup'];
  for (const action of actions) {
    for (const status of STAR_CANDIDATE_STATUSES) {
      const m = statusMessage(action, status, { name: 'Alex Kim', overpaidCents: 2000, gradeCount: 4 });
      if (status === 'ok' || status === 'no_access') assert.equal(m, null);
      else if (status === 'grades_exist') assert.deepEqual(m, { confirm: true, gradeCount: 4 });
      else assert.ok(m && typeof m.text === 'string' && m.text.length > 0, `${action}/${status}`);
    }
  }
  assert.equal(statusMessage('undo_payment', 'not_allowed').text, UNDO_PAYMENT_TOO_LATE);
  assert.equal(statusMessage('admin_undo_payment', 'invalid').text, UNDO_REFUND_FIRST);
  assert.equal(statusMessage('edit', 'not_allowed').text, DAN_NEEDS_ADMIN);
  assert.deepEqual(statusMessage('refund', 'refund_too_large', { overpaidCents: 2000 }), { field: 'amount', text: refundTooLarge(2000) });
  assert.equal(refundTooLarge(2000), 'Can’t be more than the $20 overpaid.');
  assert.equal(statusMessage('refund', 'refund_too_large', { overpaidCents: 0 }).text, NOTHING_OVERPAID);
  assert.equal(statusMessage('paying_by', 'already_paid').text, 'Already marked paid. Close this and use ⋯ → Edit payment instead.');
  assert.equal(statusMessage('withdraw', 'withdrawn', { name: 'Alex Kim' }).text, 'Alex Kim was withdrawn. An admin can restore them first.');
  assert.equal(statusMessage('add_makeup', 'already_added').row, 'already_added');
  assert.ok(statusMessage('edit', 'stale', { phone: true }).text.includes('Discard changes'));
  assert.equal(statusMessage('withdraw', 'error').text, "That didn't save. Check the connection, then retry.");
  assert.equal(statusMessage('record_payment', 'error').text, "Couldn't save. Check the connection, then try again.");
});

// =====================================================================================
// 7. The ⋯ menu's order (candidateMenu.js, DR G1, v0.517)
// =====================================================================================

// "key|key" with a "/" before each item that starts a new group (the line in the menu)
const menuOf = (row, opts) => candidateMenuKeys(row, opts).map((k) => `${k.separatorBefore ? '/' : ''}${k.key}`).join(' ');
const baseRow = { status: 'active', privateOn: null, paid: false, isMakeup: false, refundedCents: 0, overpaidCents: 0 };

await check('menu: not paid row, staff (a) — Edit details first, no money items, no group 3', () => {
  assert.equal(menuOf(baseRow, { isAdmin: false, hidden: false }), 'edit setPrivate payingBy');
});
await check('menu: not paid row with a private testing, admin (b)', () => {
  const row = { ...baseRow, privateOn: '2026-11-18' };
  assert.equal(menuOf(row, { isAdmin: true, hidden: false, canGradePrivate: true }), 'edit changePrivate backToDay gradePrivate payingBy /withdraw delete');
  assert.equal(menuOf(row, { isAdmin: true, hidden: false }), 'edit changePrivate backToDay payingBy /withdraw delete');
});
await check('menu: paid and overpaid, admin (c) — the money group between two lines', () => {
  const row = { ...baseRow, paid: true, overpaidCents: 2000 };
  assert.equal(menuOf(row, { isAdmin: true, hidden: false }), 'edit setPrivate /editPayment undoPayment recordRefund printReceipt /withdraw delete');
  assert.equal(menuOf({ ...row, overpaidCents: 0 }, { isAdmin: true, hidden: false }), 'edit setPrivate /editPayment undoPayment printReceipt /withdraw delete');
});
await check('menu: paid row, staff (d) — only Print receipt in the money group (S2, v0.518)', () => {
  assert.equal(menuOf({ ...baseRow, paid: true }, { isAdmin: false, hidden: false }), 'edit setPrivate /printReceipt');
  assert.equal(menuOf({ ...baseRow, paid: true }, { isAdmin: false, hidden: true }), 'edit setPrivate'); // hidden: no Print receipt (Q8 B)
  // the summary uses the same rule (canPrintReceipt): Print receipt on any row with money that stands, but not a make-up or a hidden row
  assert.equal(canPrintReceipt({ ...baseRow, paid: true }, false), true);
  assert.equal(canPrintReceipt({ ...baseRow, paid: true, status: 'withdrawn' }, false), true); // M-03
  assert.equal(canPrintReceipt({ ...baseRow, status: 'withdrawn' }, false), false); // nothing paid
  assert.equal(canPrintReceipt({ ...baseRow, paid: true, status: 'withdrawn' }, true), false);
  assert.equal(canPrintReceipt({ ...baseRow, paid: true, isMakeup: true }, false), false);
  assert.equal(canPrintReceipt({ ...baseRow, paid: true }, true), false);
  assert.equal(canPrintReceipt({ ...baseRow, refundedCents: 2000 }, false), true);
});
await check('menu: withdrawn row (e) — nothing paid: Restore · line · Delete permanently; nothing for staff', () => {
  const row = { ...baseRow, status: 'withdrawn' };
  assert.equal(menuOf(row, { isAdmin: true, hidden: false }), 'restore /delete');
  assert.equal(menuOf(row, { isAdmin: false, hidden: false }), '');
});
await check('menu: withdrawn row that paid (M-03, v1.055) — Print receipt for staff and admins; hidden and make-up rules', () => {
  const row = { ...baseRow, status: 'withdrawn', paid: true };
  assert.equal(menuOf(row, { isAdmin: true, hidden: false }), 'printReceipt /restore /delete');
  assert.equal(menuOf(row, { isAdmin: false, hidden: false }), 'printReceipt');
  assert.equal(menuOf(row, { isAdmin: true, hidden: true }), 'restore /delete'); // Hide private details on
  assert.equal(menuOf(row, { isAdmin: false, hidden: true }), '');
  // a refund that still stands counts as money too
  assert.equal(menuOf({ ...baseRow, status: 'withdrawn', refundedCents: 500 }, { isAdmin: false, hidden: false }), 'printReceipt');
  assert.equal(menuOf({ ...row, isMakeup: true }, { isAdmin: false, hidden: false }), '');
});
await check('menu: a refund stands (f) — Undo refund takes Record refund’s place', () => {
  const row = { ...baseRow, paid: true, overpaidCents: 0, refundedCents: 2000 };
  assert.equal(menuOf(row, { isAdmin: true, hidden: false }), 'edit setPrivate /editPayment undoPayment undoRefund printReceipt /withdraw delete');
});
await check('menu: make-up row, or Hide private details on (g) — no money items', () => {
  assert.equal(menuOf({ ...baseRow, isMakeup: true }, { isAdmin: true, hidden: false }), 'edit setPrivate /withdraw delete');
  assert.equal(menuOf({ ...baseRow, paid: true }, { isAdmin: true, hidden: true }), 'edit setPrivate /withdraw delete');
  assert.equal(menuOf(baseRow, { isAdmin: false, hidden: true }), 'edit setPrivate');
});
await check('menu: a flagged "Possible duplicate" row — Review possible duplicate after Change how they’ll pay', () => {
  assert.equal(menuOf(baseRow, { isAdmin: true, hidden: false, flagged: true }), 'edit setPrivate payingBy reviewDuplicate /withdraw delete');
  assert.equal(menuOf(baseRow, { isAdmin: false, hidden: true, flagged: true }), 'edit setPrivate reviewDuplicate');
  assert.equal(menuOf({ ...baseRow, paid: true }, { isAdmin: true, hidden: false, flagged: true }), 'edit setPrivate reviewDuplicate /editPayment undoPayment printReceipt /withdraw delete');
});

// =====================================================================================
// 7b. The count cards (candidateCards.js; R5-05, R3-02, S-1, C-05 (b), Step B of pass 1)
// =====================================================================================
{
  const mk = (id, over) => ({ id, status: 'active', locationCode: 'worcester', dan: 1, paid: false, paidCents: 0, feeKind: 'standard', isMakeup: false, duplicateState: 'none', duplicateOf: null, ...over });
  const rows = [
    mk('a', { paid: true, paidCents: 7000 }),
    mk('b', { locationCode: 'shrewsbury', paid: true, paidCents: 7000 }),
    mk('c'), // not paid
    mk('d', { locationCode: 'shrewsbury', feeKind: 'none' }), // no fee: in neither Paid nor Not paid
    mk('e', { isMakeup: true }),
    mk('f', { duplicateState: 'possible', duplicateOf: 'g' }), // one pair, both Worcester
    mk('g', { duplicateState: 'possible', duplicateOf: 'f', paid: true, paidCents: 7000 }),
    mk('h', { locationCode: 'shrewsbury', duplicateState: 'possible', duplicateOf: 'i' }), // a pair split across schools
    mk('i', { duplicateState: 'possible', duplicateOf: 'h' }),
    mk('x', { status: 'withdrawn', paid: true, paidCents: 14000 }), // removed, paid (Worcester)
    mk('y', { status: 'withdrawn', locationCode: 'shrewsbury', paid: true, paidCents: 3000 }),
    mk('z', { status: 'withdrawn' }),
  ];
  const both = candidateCardNumbers(rows, () => true);
  const worc = candidateCardNumbers(rows, (c) => c.locationCode === 'worcester');
  await check('cards: Paid / Not paid leave out make-ups and flagged rows by the row’s own state', () => {
    assert.equal(both.candidates, 9);
    assert.equal(both.paid, 2); // a, b (g is flagged)
    assert.equal(both.notPaid, 1); // c (d has no fee, e make-up, f/h/i flagged)
    assert.deepEqual(filterRows(both.active, both.countable, 'paid').map((c) => c.id), ['a', 'b']);
    assert.deepEqual(filterRows(both.active, both.countable, 'notPaid').map((c) => c.id), ['c']);
    assert.equal(filterRows(both.active, both.countable, null).length, 9);
    // Worcester only: h (Shrewsbury) is out of view, but i's own flag still keeps i out of Not paid
    assert.equal(worc.notPaid, 1);
    assert.equal(worc.countable.some((c) => c.id === 'i'), false);
  });
  await check('cards: Payments recorded includes removed candidates’ money, with the removed part named (R5-05)', () => {
    assert.equal(both.payments, 7000 + 7000 + 7000 + 14000 + 3000);
    assert.equal(both.removedPaidCents, 17000);
    assert.equal(worc.payments, 7000 + 7000 + 14000);
    assert.equal(worc.removedPaidCents, 14000);
    assert.equal(includesRemoved(14000), 'includes $140 from removed candidates');
    assert.equal(candidateCardNumbers([mk('p', { paid: true, paidCents: 7000 })], () => true).removedPaidCents, 0);
  });
  await check('cards: possible duplicates are counted in pairs, a split pair once (R3-02)', () => {
    assert.equal(both.dupLeftOut, 2); // f+g, h+i
    assert.equal(worc.dupLeftOut, 2); // f+g, and h+i because i is in view
    assert.equal(candidateCardNumbers(rows, (c) => c.locationCode === 'shrewsbury').dupLeftOut, 1); // only h+i (h in view)
    assert.equal(candidateCardNumbers([mk('o', { duplicateState: 'possible', duplicateOf: 'zz' })], () => true).dupLeftOut, 1); // no partner
    assert.equal(dupNotCounted(1), '1 possible duplicate isn’t counted in Paid or Not paid until it’s reviewed.');
    assert.equal(dupNotCounted(2), '2 possible duplicates aren’t counted in Paid or Not paid until they’re reviewed.');
  });
  await check('cards: the Candidates card lists Worcester first, then Shrewsbury (S-1)', () => {
    assert.deepEqual(both.bySchool.map((s) => s.code), ['worcester', 'shrewsbury']);
    assert.deepEqual(both.bySchool.map((s) => s.n), [6, 3]);
  });
  await check('cards: each filter card’s own empty line; an empty Dan keeps its own (C-05 (b))', () => {
    assert.equal(emptyLineKind('paid', true), 'noPaid');
    assert.equal(emptyLineKind('notPaid', true), 'everyPaid');
    assert.equal(emptyLineKind(null, true), 'dan');
    assert.equal(emptyLineKind('notPaid', false), 'dan');
    assert.equal(emptyLineKind('paid', false), 'dan');
    assert.equal(NO_PAID_DAN, 'No paid candidates in this Dan.');
    assert.equal(EVERY_PAID_DAN, 'Every candidate in this Dan has paid.');
    assert.equal(NO_CANDIDATES_DAN, 'No candidates for this Dan.');
  });
}
// =====================================================================================
// 7b. The payment receipt (candidatesReceipt.js, S2, DR2-P4, v0.518)
// =====================================================================================

await check('receipt: facts, lines oldest first without undone payments and their reversals, a refund with a minus, totals, schools, printed by', async () => {
  const rig = makeRig();
  const lily = await cand(rig, 'fall', 'Lily');
  // a payment that is undone (left out with its reversal), then a payment of $160 (paid before the
  // testing day), then a $20 refund
  const p1 = await rig.api.recordPayment({ candidateId: lily.id, expectedVersion: lily.version, method: 'cash', amountCents: 14000, paidOn: TODAY });
  assert.equal(p1.status, 'ok');
  assert.equal((await rig.api.undoPayment({ paymentId: p1.paymentId })).status, 'ok');
  rig.later(60000);
  const again = await cand(rig, 'fall', 'Lily');
  const p2 = await rig.api.recordPayment({ candidateId: again.id, expectedVersion: again.version, method: 'check', amountCents: 16000, paidOn: TODAY });
  assert.equal(p2.status, 'ok');
  rig.later(60000); // a minute later (the payments are in the order they were recorded)
  const paid = await cand(rig, 'fall', 'Lily');
  const refund = await rig.api.recordRefund({ candidateId: paid.id, expectedVersion: paid.version, method: 'cash', amountCents: 2000, refundedOn: TODAY });
  assert.equal(refund.status, 'ok');
  const detail = await rig.api.loadCandidateDetail(lily.id);
  const schools = [
    { name: 'Worcester', address: { street: '1141 Main St' }, phone: '(508) 767-1717' },
    { name: 'Shrewsbury', address: null, phone: null },
  ];
  const r = buildStarReceipt({ detail, eventName: 'Fall Star Testing', schools, printedOn: TODAY, printedByName: ' Jeffrey Berg ' });
  assert.equal(r.kindLine, 'Star testing · payment receipt');
  assert.deepEqual(r.facts.map(([label]) => label), ['Candidate', 'Event', 'School']);
  assert.match(r.facts[0][1], /^Lily \S+ · \d(st|nd|rd|th) Dan · \d stars? → \d stars?$/);
  assert.match(r.facts[1][1], /^Fall Star Testing · [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, 2026$/);
  assert.deepEqual(r.lines.map((l) => [l.forText, l.how, l.amountCents]), [['Testing fee', 'check', 16000], ['Refund', 'cash', -2000]]);
  assert.equal(r.paidCents, detail.paidCents);
  assert.equal(r.totalDueCents, detail.expectedFeeCents);
  assert.deepEqual(r.schools, [{ name: 'Worcester', street: '1141 Main St', phone: '(508) 767-1717' }, { name: 'Shrewsbury', street: '', phone: '' }]);
  assert.equal(r.printedByName, 'Jeffrey Berg');
  assert.equal(buildStarReceipt({ detail, eventName: 'X', printedOn: TODAY, printedByName: null }).printedByName, null);
  // never a date of birth or an email
  const text = JSON.stringify(r);
  for (const value of [detail.candidate.dateOfBirth, detail.candidate.emailForResults].filter(Boolean)) assert.equal(text.includes(value), false, value);
  // a private testing: the extra fact; a payment line still reads the neutral "Testing fee" (a payment
  // row doesn't say which fee it paid — it may predate the private testing)
  const priv = { ...detail, candidate: { ...detail.candidate, privateOn: '2026-12-10', privateTime: '16:00' } };
  const rp = buildStarReceipt({ detail: priv, eventName: 'Fall Star Testing', printedOn: TODAY });
  assert.deepEqual(rp.facts[3], ['Private testing', 'Thu, Dec 10, 4:00 PM']);
  assert.equal(rp.lines[0].forText, 'Testing fee');
});

// =====================================================================================
// 8. The toasts' Undo calls (CandidatesTab, DR G2 / G3, v0.517) — the same arguments the screen sends
// =====================================================================================

await check('Undo after Edit payment: editPayment on the NEW payment id with the old method, amount and date → old values back; a second Undo → stale', async () => {
  const rig = makeRig();
  const mia = await cand(rig, 'fall', 'Mia');
  // what openEditPayment keeps as `old`, before the edit
  const old = { method: mia.paidMethod, amountCents: mia.paidCents, paidOn: mia.paidOn };
  const r = await rig.api.editPayment({ paymentId: mia.lastPaymentId, method: old.method === 'cash' ? 'check' : 'cash', amountCents: old.amountCents - 1000, paidOn: '2026-10-15' });
  assert.equal(r.status, 'ok');
  const undo = () => rig.api.editPayment({ paymentId: r.paymentId, method: old.method, amountCents: old.amountCents, paidOn: old.paidOn });
  const u = await undo();
  assert.equal(u.status, 'ok');
  const m = await cand(rig, 'fall', 'Mia');
  assert.deepEqual([m.paidMethod, m.paidCents, m.paidOn, m.paid], [old.method, old.amountCents, old.paidOn, true]);
  assert.equal(m.lastPaymentId, u.paymentId);
  assert.equal(statusOf(await undo()), 'stale'); // the edited payment is already replaced
});

await check('Undo after Restore: withdrawCandidate with the version the restore returned → withdrawn again; the roster’s older version → stale', async () => {
  const rig = makeRig();
  const owen = await cand(rig, 'fall', 'Owen');
  assert.equal(owen.status, 'withdrawn');
  const r = await rig.api.restoreCandidate({ candidateId: owen.id, expectedVersion: owen.version });
  assert.equal(r.status, 'ok');
  assert.equal(statusOf(await rig.api.withdrawCandidate({ candidateId: owen.id, expectedVersion: owen.version })), 'stale');
  assert.equal(statusOf(await rig.api.withdrawCandidate({ candidateId: owen.id, expectedVersion: r.version })), 'ok');
  const o = await cand(rig, 'fall', 'Owen');
  assert.deepEqual([o.status, o.withdrawnReason], ['withdrawn', 'withdrawn']);
});

await check('Undo after Change how they’ll pay: changePayingBy back to the old choice with the version the save returned', async () => {
  const rig = makeRig();
  const lily = await cand(rig, 'fall', 'Lily');
  const oldPayingBy = lily.payingBy;
  const next = oldPayingBy === 'card' ? 'cash' : 'card';
  const r = await rig.api.changePayingBy({ candidateId: lily.id, expectedVersion: lily.version, payingBy: next });
  assert.equal(r.status, 'ok');
  assert.equal((await cand(rig, 'fall', 'Lily')).payingBy, next);
  assert.equal(statusOf(await rig.api.changePayingBy({ candidateId: lily.id, expectedVersion: r.version, payingBy: oldPayingBy })), 'ok');
  assert.equal((await cand(rig, 'fall', 'Lily')).payingBy, oldPayingBy);
});

// R1-03: the History line shows a Paying by change ("Paying by: Cash to Check"); only the database's own
// who/when columns are skipped, and by exact name (the old rule skipped anything ending in "_by").
await check('R1-03 History lines: Paying by change shown, bookkeeping columns skipped by name, hidden details still hide it', async () => {
  const row = (before, after) => ({ tableName: 'star_candidates', op: 'update', before, after });
  assert.deepEqual(linesFor(row({ paying_by: 'cash' }, { paying_by: 'check' }), false), ['Paying by: Cash → Check']);
  assert.deepEqual(linesFor(row({ paying_by: null }, { paying_by: 'card' }), false), ['Paying by: — → Card']);
  // who / when / version columns alone make no line
  assert.deepEqual(linesFor(row({ updated_by: 'a' }, { updated_by: 'b', updated_at: 'x', version: 3, withdrawn_by: 'c', withdrawn_by_name: 'D', created_by: 'e' }), false), []);
  assert.deepEqual(['created_by', 'updated_by', 'withdrawn_by', 'version', 'updated_at', 'withdrawn_by_name'].map(isBookkeepingColumn), [true, true, true, true, true, true]);
  assert.equal(isBookkeepingColumn('paying_by'), false);
  // a Paying by change is a payment row for Hide private details: the screen leaves it out there
  assert.equal(historyPrivacy(row({ paying_by: 'cash' }, { paying_by: 'check' })).payment, true);
});

// ===== Migration 0038 (batch 3): R1-01 the desk's school, R1-02 Paying by, M-02 one save one entry =====
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const paymentsOfCand = (rig, id) => rig.snap().payments.filter((p) => p.candidate_id === id);

await check('R1-01: deskSchoolFor — This device\'s school becomes the code; unset, Both or nonsense send nothing', async () => {
  assert.equal(deskSchoolFor('Worcester'), 'worcester');
  assert.equal(deskSchoolFor('Shrewsbury'), 'shrewsbury');
  assert.equal(deskSchoolFor('shrewsbury'), 'shrewsbury');
  for (const none of ['Both', '', null, undefined, 'Boston', 5]) assert.equal(deskSchoolFor(none), null, String(none));
  // the save call carries it, for Record payment and Record refund only
  const snap = { candidateId: 'c', version: 3, lastPaymentId: 'p', expectedFeeCents: 14000 };
  assert.equal(writeArgs('record', snap, { method: 'cash', amountCents: 1, paidOn: TODAY, school: 'shrewsbury' }).school, 'shrewsbury');
  assert.equal(writeArgs('record', snap, { method: 'cash', amountCents: 1, paidOn: TODAY }).school, null);
  assert.equal(writeArgs('refund', snap, { method: 'cash', amountCents: 1, paidOn: TODAY, school: 'worcester' }).school, 'worcester');
  assert.equal('school' in writeArgs('editPayment', snap, { method: 'cash', amountCents: 1, paidOn: TODAY }), false); // Edit copies the payment's own
});

await check('R1-01 (0038): a payment and a refund are stored with the desk\'s school; undo and edit copy it; blank = the candidate\'s school', async () => {
  const rig = makeRig();
  const lily = await cand(rig, 'fall', 'Lily');
  const home = lily.locationCode;
  const other = home === 'worcester' ? 'shrewsbury' : 'worcester';
  // an invalid school is refused with field "school" and writes nothing
  const raw = rig.cands.rpc('star_record_payment', { p_candidate_id: lily.id, p_expected_version: lily.version, p_method: 'cash', p_amount_cents: 14000, p_paid_on: TODAY, p_school: 'boston' }, rig.ctx).data;
  assert.deepEqual(raw, { status: 'invalid', field: 'school' });
  assert.equal(statusOf(await rig.api.recordPayment({ ...pay(lily), school: 'boston' })), 'invalid');
  assert.equal(paymentsOfCand(rig, lily.id).length, 0);
  // the live app from before 0038 sends 5 inputs: it still works, school = the candidate's
  const old = rig.cands.rpc('star_record_payment', { p_candidate_id: lily.id, p_expected_version: lily.version, p_method: lily.payingBy, p_amount_cents: 14000, p_paid_on: TODAY }, rig.ctx).data;
  assert.equal(old.status, 'ok');
  assert.equal(paymentsOfCand(rig, lily.id)[0].school, home);
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: old.payment_id })), 'ok');
  assert.deepEqual(paymentsOfCand(rig, lily.id).map((p) => p.school), [home, home]); // the reversal has it too
  // the desk is the OTHER school: stored on the payment, the candidate's own school does not move
  rig.later(1000);
  const row = await cand(rig, 'fall', 'Lily');
  const paid = await rig.api.recordPayment({ ...pay(row), school: other });
  assert.equal(statusOf(paid), 'ok');
  assert.equal(paymentsOfCand(rig, lily.id).find((p) => p.id === paid.paymentId).school, other);
  assert.equal((await cand(rig, 'fall', 'Lily')).locationCode, home);
  // editing the candidate's school later does not move money already counted
  const after = await cand(rig, 'fall', 'Lily');
  assert.equal(statusOf(await rig.api.updateCandidate(editOf(after, await detailOf(rig, after), { locationCode: other }))), 'ok');
  assert.equal((await cand(rig, 'fall', 'Lily')).locationCode, other);
  assert.equal(paymentsOfCand(rig, lily.id).find((p) => p.id === paid.paymentId).school, other);
  // Edit payment (admin): the reversal AND the new payment carry the school of the payment edited
  rig.later(1000);
  const edited = await rig.api.editPayment({ paymentId: paid.paymentId, method: 'card', amountCents: 13000, paidOn: TODAY });
  assert.equal(statusOf(edited), 'ok');
  const rows = paymentsOfCand(rig, lily.id);
  assert.deepEqual(rows.slice(-2).map((p) => [p.kind, p.school]), [['reversal', other], ['payment', other]]);
  // Undo payment copies the school too (a candidate whose own school is now `other` - use a desk of `home`)
  rig.later(1000);
  const row2 = await cand(rig, 'fall', 'Lily');
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: edited.paymentId })), 'ok');
  assert.equal(paymentsOfCand(rig, lily.id).at(-1).school, other);
  assert.ok(row2.version > 0);
  // Record refund: the desk that hands the money back (v1.040); Undo refund copies it
  const chris = await cand(rig, 'fall', 'Chris');
  assert.equal(chris.overpaidCents, 2000);
  const refunded = await rig.api.recordRefund({ candidateId: chris.id, expectedVersion: chris.version, method: 'cash', amountCents: 2000, refundedOn: TODAY, school: 'worcester' });
  assert.equal(statusOf(refunded), 'ok');
  assert.equal(paymentsOfCand(rig, chris.id).at(-1).school, 'worcester');
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: refunded.paymentId })), 'ok');
  assert.deepEqual(paymentsOfCand(rig, chris.id).slice(-2).map((p) => [p.kind, p.school]), [['refund', 'worcester'], ['reversal', 'worcester']]);
  rig.later(1000);
  const chris2 = await cand(rig, 'fall', 'Chris');
  const blank = await rig.api.recordRefund({ candidateId: chris2.id, expectedVersion: chris2.version, method: 'cash', amountCents: 500, refundedOn: TODAY });
  assert.equal(paymentsOfCand(rig, chris.id).find((p) => p.id === blank.paymentId).school, chris.locationCode); // blank = the candidate's
  assert.equal(rig.cands.rpc('star_record_refund', { p_candidate_id: chris.id, p_expected_version: 1, p_method: 'cash', p_amount_cents: 1, p_refunded_on: TODAY, p_school: 'x' }, rig.ctx).data.field, 'school');
  // every stored payment has a school (the column is not null in the database)
  assert.ok(rig.snap().payments.every((p) => p.school === 'worcester' || p.school === 'shrewsbury'));
});

await check('R1-02: payingByWhere — same as the form\'s choice = on the form; different or none = at the desk', async () => {
  assert.equal(payingByWhere({ payingBy: 'check', payingByOnForm: 'check' }), 'form');
  assert.equal(payingByWhere({ payingBy: 'card', payingByOnForm: 'check' }), 'desk');
  assert.equal(payingByWhere({ payingBy: 'cash', payingByOnForm: null }), 'desk'); // added at the desk, or no insert row to read
  assert.equal(payingByWhere({ payingBy: 'cash' }), 'desk');
  assert.equal(payingByWhere({ payingBy: 'cash', payingByOnForm: '' }), 'desk');
  assert.equal(payingByWhere(null), 'desk');
  assert.equal(payingByWhere(undefined), 'desk');
});

await check('R1-02 (0038): the roster carries the form\'s own choice; Change how they\'ll pay never changes it', async () => {
  const rig = makeRig();
  const lily = await cand(rig, 'fall', 'Lily'); // a family-form sign-up
  const sam = await cand(rig, 'fall', 'Sam'); // added at the desk
  assert.equal(lily.source, 'form');
  assert.equal(lily.payingByOnForm, lily.payingBy);
  assert.equal(payingByWhere(lily), 'form');
  assert.equal(sam.source, 'desk');
  assert.equal(sam.payingByOnForm, null); // a desk row stays empty, so it keeps reading "at the desk"
  assert.equal(payingByWhere(sam), 'desk');
  const next = lily.payingBy === 'card' ? 'cash' : 'card';
  const changed = await rig.api.changePayingBy({ candidateId: lily.id, expectedVersion: lily.version, payingBy: next });
  assert.equal(statusOf(changed), 'ok');
  const row = await cand(rig, 'fall', 'Lily');
  assert.deepEqual([row.payingBy, row.payingByOnForm, payingByWhere(row)], [next, lily.payingBy, 'desk']);
  await rig.api.changePayingBy({ candidateId: lily.id, expectedVersion: changed.version, payingBy: lily.payingBy });
  assert.equal(payingByWhere(await cand(rig, 'fall', 'Lily')), 'form'); // back to the form's own choice
  // a candidate ADDED now at the desk has none; the detail does not carry the column (0038 left it alone)
  const added = await rig.api.addCandidate(newDesk());
  assert.equal((await cand(rig, 'fall', 'Zoe')).payingByOnForm, null);
  assert.equal(added.status, 'ok');
  assert.equal('payingByOnForm' in (await detailOf(rig, lily)).candidate, false);
  // the private columns stay out of the list read
  assert.equal(STAR_CANDIDATE_LIST_COLUMNS.star_roster.split(',').map((c) => c.trim()).at(-1), 'paying_by_on_form');
});

await check('R1-02 (0038): Record payment by another way also changes Paying by; Undo payment puts it back; Edit payment follows the way', async () => {
  const rig = makeRig();
  const lily = await cand(rig, 'fall', 'Lily');
  const choice = lily.payingBy;
  const alt = choice === 'check' ? 'cash' : 'check';
  const third = ['cash', 'check', 'card'].find((m) => m !== choice && m !== alt);
  // the SAME way as Paying by: nothing remembered, nothing changed
  const same = await rig.api.recordPayment({ ...pay(lily), method: choice });
  assert.equal(paymentsOfCand(rig, lily.id)[0].paying_by_before ?? null, null);
  assert.equal((await cand(rig, 'fall', 'Lily')).payingBy, choice);
  rig.later(1000);
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: same.paymentId })), 'ok');
  // ANOTHER way: Paying by becomes it, the payment remembers the old one
  rig.later(1000);
  const paid = await rig.api.recordPayment({ ...pay(await cand(rig, 'fall', 'Lily')), method: alt });
  assert.equal(statusOf(paid), 'ok');
  let row = await cand(rig, 'fall', 'Lily');
  assert.deepEqual([row.payingBy, row.payingByOnForm, payingByWhere(row)], [alt, choice, 'desk']);
  assert.equal(paymentsOfCand(rig, lily.id).find((p) => p.id === paid.paymentId).paying_by_before, choice);
  // Undo payment: the old Paying by comes back (the hint says "on the form" again)
  rig.later(1000);
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: paid.paymentId })), 'ok');
  row = await cand(rig, 'fall', 'Lily');
  assert.deepEqual([row.payingBy, payingByWhere(row)], [choice, 'form']);
  // if someone changed Paying by again since, Undo leaves it alone
  rig.later(1000);
  const paid2 = await rig.api.recordPayment({ ...pay(await cand(rig, 'fall', 'Lily')), method: alt });
  // (Change how they'll pay is refused on a paid candidate, so this is made in the store directly)
  rig.editStore((s) => { s.candidates.find((c) => c.id === lily.id).paying_by = third; });
  rig.later(1000);
  assert.equal(statusOf(await rig.api.undoPayment({ paymentId: paid2.paymentId })), 'ok');
  assert.equal((await cand(rig, 'fall', 'Lily')).payingBy, third);
  // Edit payment (admin): a changed way becomes Paying by; the new payment remembers the family's choice
  const noah = await cand(rig, 'fall', 'Noah'); // paid, Paying by = his own choice
  const noahChoice = noah.payingBy;
  const noahAlt = noahChoice === 'card' ? 'cash' : 'card';
  rig.later(1000);
  const edit1 = await rig.api.editPayment({ paymentId: noah.lastPaymentId, method: noahAlt, amountCents: noah.paidCents, paidOn: noah.paidOn });
  assert.equal(statusOf(edit1), 'ok');
  assert.equal((await cand(rig, 'fall', 'Noah')).payingBy, noahAlt);
  assert.equal(paymentsOfCand(rig, noah.id).find((p) => p.id === edit1.paymentId).paying_by_before, noahChoice);
  // editing it back to the family's way: Paying by is the choice again, nothing left to remember
  rig.later(1000);
  const edit2 = await rig.api.editPayment({ paymentId: edit1.paymentId, method: noahChoice, amountCents: noah.paidCents, paidOn: noah.paidOn });
  assert.equal(statusOf(edit2), 'ok');
  assert.equal((await cand(rig, 'fall', 'Noah')).payingBy, noahChoice);
  assert.equal(paymentsOfCand(rig, noah.id).find((p) => p.id === edit2.paymentId).paying_by_before ?? null, null);
  // only the amount changed: Paying by is left alone
  rig.later(1000);
  const edit3 = await rig.api.editPayment({ paymentId: edit2.paymentId, method: noahChoice, amountCents: noah.paidCents - 100, paidOn: noah.paidOn });
  assert.equal(statusOf(edit3), 'ok');
  assert.equal((await cand(rig, 'fall', 'Noah')).payingBy, noahChoice);
});

await check('M-02 (pass 2): the rows of ONE save make ONE History entry, money first, joined with "; "', async () => {
  const rig = makeRig();
  const lily = await cand(rig, 'fall', 'Lily');
  const choice = lily.payingBy;
  const alt = choice === 'check' ? 'cash' : 'check';
  const entriesOf = async () => groupHistoryRows((await rig.api.loadCandidateHistory(lily.id)).rows);
  const textOf = (entry, hidden = false) => describeHistoryEntry(entry, { hidden });
  const before = (await entriesOf()).length;
  // Record payment by another way: two change-log rows (the payment, Paying by) -> one entry
  rig.later(1000);
  const paid = await rig.api.recordPayment({ ...pay(await cand(rig, 'fall', 'Lily')), method: alt });
  let entries = await entriesOf();
  assert.equal(entries.length, before + 1);
  assert.equal(entries[0].action, 'star_record_payment');
  assert.equal(entries[0].rows.length, 2);
  const line = textOf(entries[0]);
  assert.match(line.text, /^Payment recorded: \$140 \w+, paid [A-Z][a-z]{2} \d+; Paying by: \w+ → \w+$/); // money first
  assert.ok(line.text.includes(`Paying by: ${cap(choice)} → ${cap(alt)}`));
  assert.ok(line.text.includes(`$140 ${alt}`));
  // Hide private details: the whole entry is money, so it is left out
  assert.deepEqual(textOf(entries[0], true), { hiddenPayment: true });
  // Undo payment: "Payment undone; Paying by …" is one entry too
  rig.later(1000);
  await rig.api.undoPayment({ paymentId: paid.paymentId });
  entries = await entriesOf();
  assert.equal(entries.length, before + 2);
  assert.equal(entries[0].action, 'star_undo_payment');
  assert.equal(textOf(entries[0]).text, `Payment undone: $140; Paying by: ${cap(alt)} → ${cap(choice)}`);
  // Mark paid with the same way as Paying by: only the payment says something (the version-only row is silent)
  rig.later(1000);
  await rig.api.recordPayment({ ...pay(await cand(rig, 'fall', 'Lily')), method: choice });
  entries = await entriesOf();
  assert.equal(entries.length, before + 3); // a save at another time is a new entry, never joined to an older one
  assert.match(textOf(entries[0]).text, /^Payment recorded: \$140 \w+, paid [A-Z][a-z]{2} \d+$/);
  // Edit payment (admin): the reversal, the new payment and Paying by -> one entry, the undone payment first
  rig.later(1000);
  const row = await cand(rig, 'fall', 'Lily');
  await rig.api.editPayment({ paymentId: row.lastPaymentId, method: alt, amountCents: 13000, paidOn: TODAY });
  entries = await entriesOf();
  assert.equal(entries.length, before + 4);
  assert.equal(entries[0].action, 'star_edit_payment');
  const edit = textOf(entries[0]).text.split('; ');
  assert.equal(edit[0], 'Payment undone: $140');
  assert.ok(edit[1].startsWith('Payment recorded: $130'));
  assert.equal(edit[2], `Paying by: ${cap(choice)} → ${cap(alt)}`);
  // the count the History line shows is the number of entries (one per save)
  assert.equal((await entriesOf()).filter((e) => e.action.startsWith('star_') && textOf(e)).length >= 4, true);
});

await check('M-02: other saves keep their own words; the family form\'s registration stays visible while details are hidden; same words say once', async () => {
  const rig = makeRig();
  const mia = await cand(rig, 'fall', 'Mia'); // a family-form sign-up: the candidate row and the signature, one save
  const entries = groupHistoryRows((await rig.api.loadCandidateHistory(mia.id)).rows);
  const reg = entries.find((e) => e.action === 'star_public_register');
  assert.equal(reg.rows.length, 2);
  assert.equal(describeHistoryEntry(reg, { hidden: false }).text, 'Registered on the family form; Signed the acknowledgment on the family form');
  assert.equal(describeHistoryEntry(reg, { hidden: true }).text, 'Registered on the family form; Signed the acknowledgment on the family form'); // no money in it
  assert.equal(describeHistoryEntry(reg, { hidden: false }).who, 'Family form');
  // rows with no time or no action name are never joined to anything
  const lone = groupHistoryRows([
    { occurredAt: null, action: 'a', tableName: 'star_candidates', op: 'update', before: {}, after: { first_name: 'B' } },
    { occurredAt: null, action: 'a', tableName: 'star_candidates', op: 'update', before: {}, after: { first_name: 'C' } },
    { occurredAt: 't', action: null, tableName: 'star_candidates', op: 'update', before: {}, after: { first_name: 'D' } },
  ]);
  assert.equal(lone.length, 3);
  // a mixed save while hidden: the money row's words go, the rest stays
  const mixed = { rows: [
    { tableName: 'star_payments', op: 'insert', before: null, after: { kind: 'payment', amount_cents: 14000, method: 'cash', paid_on: '2026-10-19' } },
    { tableName: 'star_candidates', op: 'update', before: { first_name: 'A' }, after: { first_name: 'B' } },
  ], occurredAt: 't', actorName: 'Staff', action: 'x' };
  assert.equal(describeHistoryEntry(mixed, { hidden: true }).text, 'First name: A → B');
  assert.equal(describeHistoryEntry(mixed, { hidden: false }).text, 'Payment recorded: $140 cash, paid Oct 19; First name: A → B');
  // the same words twice are said once; an entry with nothing to say is left out
  const twice = { rows: [
    { tableName: 'star_grades', op: 'update', before: {}, after: {} },
    { tableName: 'star_grades', op: 'update', before: {}, after: {} },
  ], occurredAt: 't', actorName: null, action: 'x' };
  assert.deepEqual(describeHistoryEntry(twice, { hidden: false }), { text: 'Grade changed', at: 't', who: 'Staff' });
  assert.equal(describeHistoryEntry({ rows: [{ tableName: 'star_candidates', op: 'update', before: { version: 1 }, after: { version: 2 } }], occurredAt: 't', actorName: 'A', action: 'x' }, { hidden: false }), null);
});

// R2-08: the toasts' Undo. Private testing set: Undo clears a new private day, or puts the old day and
// time back, with the version the save returned. Make-up added (admins): Undo deletes the new row, and
// the earlier candidate can be added again afterwards (the picker's "Already added" mark is gone).
await check('R2-08 Undo plumbing: Private testing set and Make-up added', async () => {
  const rig = makeRig();
  const lily = await cand(rig, 'fall', 'Lily');
  const set = await rig.api.setPrivate({ candidateId: lily.id, expectedVersion: lily.version, privateOn: '2026-12-01', privateTime: '16:00' });
  assert.equal(statusOf(set), 'ok');
  const cleared = await rig.api.clearPrivate({ candidateId: lily.id, expectedVersion: set.version }); // Undo of a NEW private day
  assert.equal(statusOf(cleared), 'ok');
  const set2 = await rig.api.setPrivate({ candidateId: lily.id, expectedVersion: cleared.version, privateOn: '2026-12-01', privateTime: '16:00' });
  const changed = await rig.api.setPrivate({ candidateId: lily.id, expectedVersion: set2.version, privateOn: '2026-12-08', privateTime: '17:30' });
  const restored = await rig.api.setPrivate({ candidateId: lily.id, expectedVersion: changed.version, privateOn: '2026-12-01', privateTime: '16:00' }); // Undo of a CHANGE
  assert.equal(statusOf(restored), 'ok');
  const row = (await roster(rig, 'fall')).find((c) => c.id === lily.id);
  assert.equal(row.privateOn, '2026-12-01');
  // make-up: add, Undo (delete), add again
  const s = Object.fromEntries((await roster(rig, 'summer')).map((c) => [c.firstName, c]));
  const added = await rig.api.addMakeup({ eventId: IDS.spring, earlierCandidateId: s.Taylor.id });
  assert.equal(statusOf(added), 'ok');
  const undone = await rig.api.deleteCandidate({ candidateId: added.id, expectedVersion: added.version, expectedPaymentIds: [] });
  assert.equal(statusOf(undone), 'ok');
  assert.equal((await roster(rig, 'spring')).some((c) => c.id === added.id), false);
  assert.equal(statusOf(await rig.api.addMakeup({ eventId: IDS.spring, earlierCandidateId: s.Taylor.id })), 'ok');
  // the two new Undo actions give a row bar's words (not a dialog's "Cancel, then open it again")
  assert.equal(statusMessage('undo_private', 'stale').text, statusMessage('undo_paying_by', 'stale').text);
  assert.equal(statusMessage('undo_makeup', 'stale').text, statusMessage('undo_paying_by', 'stale').text);
});

// =====================================================================================
// 8. Step D (after Dashboard core): the queued Undo, the shared words, S-2's failed read, R3-06
// =====================================================================================

// R2-05: a toast's Undo pressed while another save runs WAITS, then runs (v1.125–v1.127). This drives the
// same two parts CandidatesTab uses (lib/saveLine.js and lib/toastLine.js) with the real Star fake:
// Withdraw A, Withdraw B (slow), press A's Undo during B's save → A is restored after B's save ends, and
// the toast says "Undone". Then an Undo whose call fails leaves the shared bar (retry kept).
await check('R2-05: an Undo pressed during another save waits its turn, then runs and says Undone', async () => {
  const rig = makeRig();
  const a = await cand(rig, 'fall', 'Lily');
  const b = await cand(rig, 'fall', 'Noah');
  const bars = [];
  const toasts = createToastLine();
  const line = createSaveLine(() => ({ section: 'Star testing', showToast: (text, o) => toasts.show(text, o), undoBar: (bar) => bars.push(bar) }));
  // Withdraw A (a quick save), with its toast and Undo through the line
  const tokenA = line.begin();
  assert.ok(tokenA);
  const withdrawnA = await rig.api.withdrawCandidate({ candidateId: a.id, expectedVersion: a.version });
  line.end(withdrawnA.status, { token: tokenA });
  const runUndoA = async () => rig.api.restoreCandidate({ candidateId: a.id, expectedVersion: withdrawnA.version });
  toasts.show('Lily withdrawn', { icon: false, action: line.undoAction(runUndoA, { words: 'Lily withdrawn' }) });
  // Withdraw B starts and has not ended yet
  const tokenB = line.begin();
  assert.ok(tokenB);
  assert.equal(line.begin(), false, 'a second save while one runs is refused, as before');
  const idA = toasts.get().id;
  const pressed = toasts.pressUndo(idA);
  assert.equal(toasts.get().busy, true, 'the toast says Undoing… at once');
  assert.equal((await roster(rig, 'fall')).find((c) => c.id === a.id).status, 'withdrawn', 'A is still withdrawn: the Undo waits');
  const withdrawnB = await rig.api.withdrawCandidate({ candidateId: b.id, expectedVersion: b.version });
  line.end(withdrawnB.status, { token: tokenB });
  await pressed;
  assert.equal((await roster(rig, 'fall')).find((c) => c.id === a.id).status, 'active', 'A is back once B\'s save ended');
  assert.equal(toasts.get()?.text, 'Undone');
  assert.equal(bars.filter(Boolean).length, 0, 'no bar: nothing failed');
});
await check('R2-05 / C-06 (b): an Undo that did not reach the database says the shared sentence, with Retry', async () => {
  const bars = [];
  const toasts = createToastLine();
  const line = createSaveLine(() => ({ section: 'Star testing', showToast: (text, o) => toasts.show(text, o), undoBar: (bar) => bars.push(bar) }));
  let attempts = 0;
  toasts.show('Lily withdrawn', { icon: false, action: line.undoAction(async () => ({ status: ++attempts === 1 ? 'error' : 'ok' }), { words: 'Lily withdrawn' }) });
  await toasts.pressUndo(toasts.get().id);
  const bar = bars.at(-1);
  assert.equal(bar.text, UNDO_DIDNT_SAVE);
  assert.equal(bar.text, "Undo didn't save. Check the connection, then retry.");
  assert.equal(typeof bar.retry, 'function');
  await bar.retry();
  assert.equal(attempts, 2);
  assert.equal(bars.at(-1), null, 'the bar goes when the Retry works');
  // a refused Undo (someone else changed it) shows the reason without Retry
  const toasts2 = createToastLine();
  const bars2 = [];
  const line2 = createSaveLine(() => ({ section: 'Star testing', showToast: (text, o) => toasts2.show(text, o), undoBar: (b) => bars2.push(b) }));
  toasts2.show('Lily withdrawn', { icon: false, action: line2.undoAction(async () => ({ status: 'stale', reason: rowStale('Lily Brooks') }), { words: 'Lily withdrawn' }) });
  await toasts2.pressUndo(toasts2.get().id);
  assert.equal(bars2.at(-1).text, 'Someone else changed Lily Brooks just now, so nothing was done. Their change is shown.');
  assert.equal(bars2.at(-1).retry, null);
});

// R1-06 / R1-07 / R2-07 / R3-13 / S-2: Star takes the shared sentences from components/text.js.
await check('shared words: payment toast, Undo payment box, stale line, failed Undo, day hints, load lines', () => {
  assert.equal(paymentRecordedToast('Lily Brooks', 14000, 'card'), 'Lily Brooks marked paid · $140 card');
  assert.equal(paymentRecordedToast('Lily Brooks', 14000, 'card', true), 'Lily Brooks marked paid'); // hidden (v0.722)
  assert.equal(paymentUndoneToast('Lily Brooks'), 'Payment undone for Lily Brooks');
  assert.equal(undoPaymentTitle('Lily Brooks', 14000, 'card'), 'Undo Lily Brooks’s $140 card payment?');
  assert.equal(undoPaymentBody('2026-11-03'), 'Paid on Nov 3. It is reversed and the row goes back to Not paid. Both stay in the history.');
  assert.ok(undoPaymentBody('2026-11-03').startsWith(paidOnOpening('Nov 3')));
  assert.equal(rowStale('Lily Brooks'), 'Someone else changed Lily Brooks just now, so nothing was done. Their change is shown.');
  assert.equal(statusMessage('withdraw', 'stale', { name: 'Lily Brooks' }).text, rowStale('Lily Brooks'));
  assert.equal(statusMessage('undo_payment', 'not_found', { name: 'Lily Brooks' }).text, rowStale('Lily Brooks'));
  assert.equal(rowStale(''), 'Someone else changed this candidate just now, so nothing was done. Their change is shown.');
  assert.equal(UNDO_BOX_FAILED, UNDO_DIDNT_SAVE); // the Undo payment / Undo refund boxes' failed line
  assert.equal(PRIVATE_DAY_HINT, "Past days can't be chosen.");
  assert.equal(EDIT_PAYMENT_DATE_HINT, "Days after today can't be chosen.");
  assert.equal(LOAD_DETAIL_FAILED, "Couldn't load this candidate. Check the connection, then retry.");
  assert.equal(LOAD_LIST_FAILED, "Couldn't load the make-up list. Check the connection, then retry.");
  // the two Grading lines S-2 names end "then retry" now
  assert.equal(GRADING_TEXT.LOAD_PRIVATE_FAILED, "Couldn't load the private testing. Check the connection, then retry.");
  assert.equal(GRADING_TEXT.LOAD_GRADES_FAILED, "Couldn't load the grades. Check the connection, then retry.");
});

// S-2: the fake store's failed-read helper (the app's `__tkdPreview.failNextStarRead`): the next read of
// that one function fails like a dropped connection, once; the summary and the signature box then show
// "Couldn't load this candidate. Check the connection, then retry." with a Retry that reads again.
await check('S-2: failNextRead fails exactly one read of the named function', async () => {
  const rig = makeRig();
  const c = await cand(rig, 'fall', 'Lily');
  assert.equal(rig.cands.failNextRead('star_nothing'), null);
  assert.equal(rig.cands.failNextRead(), 'star_candidate_detail');
  assert.equal((await rig.api.loadCandidateDetail(c.id)).status, 'error'); // the summary can't load
  assert.equal((await rig.api.loadCandidateDetail(c.id)).status, 'ok'); // Retry reads again and it works
  assert.equal(rig.cands.failNextRead('star_view_signature'), 'star_view_signature');
  assert.equal((await rig.api.loadCandidateDetail(c.id)).status, 'ok'); // only the signature read is armed
  assert.equal((await rig.api.viewSignature(c.id)).status, 'error');
  assert.notEqual((await rig.api.viewSignature(c.id)).status, 'error');
  // armed writes are untouched: failNextRead never fails a save
  rig.cands.failNextRead();
  assert.equal(statusOf(await rig.api.withdrawCandidate({ candidateId: c.id, expectedVersion: c.version })), 'ok');
});

// How the screens are wired (the parts of Step D that live in JSX, which Node can't draw): read the files.
await check('Step D wiring: save line, shared back link, Mark paid busy, signature Retry, preview helper', () => {
  const here = (path) => readSource(new URL(`../../${path}`, import.meta.url));
  const tab = here('screens/testing/star/candidates/CandidatesTab.jsx');
  assert.ok(tab.includes("useSaveLine({"), 'the tab keeps its one-at-a-time flag in the save line');
  assert.ok(!tab.includes('onAction:'), 'no toast builds its own Undo: every one goes through line.undoAction');
  assert.ok(!tab.includes('busyRef'), 'the old busy flag is gone');
  assert.ok(tab.includes('<PageBar'), 'the page bar (v1.128)');
  assert.ok(tab.includes('onRetry={retrySignature}'));
  assert.ok(here('screens/testing/star/candidates/CandidateRows.jsx').includes("aria-busy={ctx.busy ? 'true' : undefined}"), 'R1-08: the grayed Mark paid keeps the busy cursor');
  assert.ok(here('screens/testing/star/candidates/SignatureDialog.jsx').includes('onClick={onRetry}'));
  for (const file of ['screens/testing/star/StarTesting.jsx', 'screens/testing/star/grading/PrivateGradingPage.jsx']) {
    const source = here(file);
    assert.ok(source.includes('<BackLink'), `${file} uses the shared back link`);
    assert.ok(!source.includes('st-back'), `${file} has no .st-back`);
  }
  assert.ok(here('lib/mockClient.js').includes('failNextStarRead'), 'registered in the preview client');
});

// Review of batch 4, SHOULD 1 and 3: the words a failed Undo names after the person left the page never
// carry money, and every save ends the line from a `finally`.
await check('privacy + pass 3: Undo words carry no amount or way; every save ends its line from a finally', () => {
  const here = (path) => readSource(new URL(`../../${path}`, import.meta.url));
  assert.equal(markedPaidWords('Lily Brooks'), 'Lily Brooks marked paid');
  assert.ok(!/[$0-9]/.test(markedPaidWords('Lily Brooks')), 'no amount, no way');
  assert.ok(!/[$0-9]/.test(movedBackToast('Lily Brooks', null)), 'no fee');
  const tab = here('screens/testing/star/candidates/CandidatesTab.jsx');
  assert.ok(tab.includes('words: T.markedPaidWords('), 'the payment toast\'s Undo names the payment without the amount and way');
  assert.ok(tab.includes('words: T.movedBackToast(T.candidateName(row), null)'), 'the moved-back toast\'s Undo names it without the fee');
  assert.ok(tab.includes('{ words: undo.words ?? text }'), 'words default to the toast\'s own text, which has no money in it');
  assert.equal((tab.match(/\bendWrite\(/g) ?? []).length, 2, 'endWrite is called only from the finally of inWrite (plus its own definition)');
  assert.ok(tab.includes('} finally {\n      endWrite(ended, retry);'), 'inWrite ends the line from a finally');
  assert.equal((tab.match(/\bbeginWrite\(\)/g) ?? []).length - 1, 15, 'every begin has its call inside inWrite (15 saves)');
  assert.ok((tab.match(/await inWrite\(/g) ?? []).length >= 15, 'each save runs its call through inWrite');
});
console.log(`ALL STAR CANDIDATE CHECKS PASSED (${count} checks)`);
