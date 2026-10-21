// gradingChecks.mjs — automatic checks for Star testing GRADING's data layer, rules and save engine's
// pure part (build phase 5).
// Run:  node src/lib/star/gradingChecks.mjs      (prints ALL STAR GRADING CHECKS PASSED, exits 0)
// Why it exists: the preview database (mockStarGrading.js, inside mockStarCandidates.js) must answer
// exactly like migration 0006 (contract §6.5, §7) — the same checks in the same order, the same
// statuses and shapes — and the API (gradingCore.js, which gradingApi.js uses) must send the right
// argument names and convert every answer. The pure rules (Result wording, "N of M left", the next
// cell, typed letters, banners, the retry-drop rule of proposal 4) are checked here too, so the
// screens and the save engine can rely on them. Plain `assert`, no browser, no database.
//
// Covered: Appendix B (Assistant Instructor) · the result's status order incl. OPEN-12 / OPEN-13 ·
// star_set_grade / star_set_count / star_set_makeup_subjects in the contract's check order (kept,
// stale after a Dan change, withdrawn) · star_event_results / star_age_groups · result_key changes
// only with status, total or needs (OPEN-15) · the seed's grading states · the private page's read
// has no DOB / email / payments · the Result wording table · N of M · next cell · typed letters ·
// banner, offline and leave texts · the retry decision · a retry waits for a read started after the
// failure · an older send's answer never drops a newer pick · a private row puts no ⚠ on a Dan · the
// console helper simulateDanChange.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStarBackend } from '../mockStarTesting.js';
import { createStarEventsBackend, STAR_EVENT_RPC_NAMES, STAR_EVENT_TABLES } from '../mockStarEvents.js';
import {
  createStarCandidatesBackend, defaultStarCandidatesData, starCandidatesSeedIsCurrent, STAR_CANDIDATE_RPC_NAMES,
  STAR_CANDIDATE_WRITE_RPC_NAMES, STAR_CANDIDATE_TABLES, SEED_CANDIDATE_EVENT_IDS,
} from '../mockStarCandidates.js';
import { STAR_GRADING_RPC_NAMES, STAR_GRADING_WRITE_RPC_NAMES, GRADING_RPC_ARGS } from '../mockStarGrading.js';
import { createStarCandidatesApi } from './candidatesCore.js';
import { createStarEventsApi } from './eventsCore.js';
import {
  createStarGradingApi, gradeLetters, judgedSubjects, toggleGrade, serverValue, keptSubject, leftOfCount, resultTag, totalText,
  nextCell, typingStep, retryDecision, answerKind, refusalText, unsavedSummary, cellKey, STAR_GRADING_STATUSES,
  retryReady, refreshStep, answerStep,
} from './gradingCore.js';
import { candidateResult, assistantGrade } from './resultRules.js';
import * as T from './gradingText.js';

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

const TODAY = '2026-10-19'; // Fall's testing day is 26 days later: 2026-11-14
const NOW = Date.parse('2026-10-19T18:00:00Z');
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const DESK_ID = '00000000-0000-4000-8000-0000000000d1';
const IDS = SEED_CANDIDATE_EVENT_IDS;

// ----- A test rig: in-memory store + the Star fakes + a fake client + the APIs on top -----
function makeRig() {
  let store = null;
  const ctx = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Test Admin', userId: ADMIN_ID };
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
  const client = {
    from(table) {
      const q = { columns: '*', filters: [], orders: [] };
      const builder = {
        select(columns) { q.columns = columns; return builder; },
        eq(col, value) { q.filters.push({ col, value }); return builder; },
        in(col, values) { q.filters.push({ col, value: values, op: 'in' }); return builder; },
        order(col, { ascending = true } = {}) { q.orders.push({ col, ascending }); return builder; },
        then(resolve, reject) {
          const backend = STAR_CANDIDATE_TABLES.includes(table) ? cands : STAR_EVENT_TABLES.includes(table) ? events : star;
          return Promise.resolve().then(() => backend.select(table, q.columns, q.filters, q.orders, ctx)).then(resolve, reject);
        },
      };
      return builder;
    },
    async rpc(name, args, options) {
      const sent = JSON.parse(JSON.stringify(args ?? {}));
      calls.push([name, sent, options]);
      if (STAR_CANDIDATE_RPC_NAMES.includes(name)) return cands.rpc(name, sent, ctx, options);
      if (STAR_EVENT_RPC_NAMES.includes(name)) return events.rpc(name, sent, ctx);
      return star.rpc(name, sent, ctx);
    },
  };
  return {
    api: createStarGradingApi(() => client, () => NOW),
    candidatesApi: createStarCandidatesApi(() => client, () => TODAY),
    eventsApi: createStarEventsApi(() => client, () => TODAY),
    cands, ctx, calls,
    snap: () => cands.snapshot(),
    staff: () => { ctx.isAdmin = false; ctx.actorName = 'Staff'; ctx.userId = DESK_ID; },
    admin: () => { ctx.isAdmin = true; ctx.actorName = 'Test Admin'; ctx.userId = ADMIN_ID; },
    lock: () => { ctx.hasDataAccess = false; },
    unlock: () => { ctx.hasDataAccess = true; },
  };
}

// The Fall event's grid (every Dan) and helpers to find a row / a subject by name.
async function grid(rig, key = 'fall') {
  const ev = await rig.eventsApi.loadStarEvent(IDS[key]);
  assert.equal(ev.status, 'ok');
  const dans = ev.copy.dans.map((d) => d.dan);
  const g = await rig.api.loadGrading(IDS[key], dans);
  assert.equal(g.status, 'ok');
  return { ...g, copy: ev.copy };
}
const rowNamed = (g, first, dan = 1, n = 0) => g.dans[dan].rows.filter((r) => r.firstName === first)[n];
const subjectId = (row, name) => row.result.subjects.find((s) => s.name === name).eventCategoryId;
async function rowOf(rig, first, dan = 1, n = 0) {
  const r = rowNamed(await grid(rig), first, dan, n);
  assert.ok(r, `no ${first} on the ${dan} Dan grid`);
  return r;
}
async function candidateId(rig, key, first) {
  const r = await rig.candidatesApi.loadCandidates(IDS[key]);
  return r.candidates.find((c) => c.firstName === first && c.status === 'active').id;
}

// =====================================================================================
// 1. The pure result rules (resultRules.js, the fake's §5.5)
// =====================================================================================

await check('Appendix B: Assistant Instructor letter from the exact count; unknown age → the adult scale', async () => {
  const a = {
    child_max_age: 12, child_a_plus: 15, child_a: 14, child_b_plus: 13, child_b: 12, child_c_plus: 11, child_c: 10,
    adult_a_plus: 20, adult_a: 18, adult_b_plus: 16, adult_b: 14, adult_c_plus: 12, adult_c: 10,
  };
  // assistLetter(age, taught): band = (age == null || age >= 13) ? adult : child; first min ≤ taught; else D
  const band = (age) => (age === null || age >= 13 ? 'adult' : 'child');
  const cases = [
    [null, 20, 'A+'], [null, 15, 'B'], [13, 20, 'A+'], [13, 19, 'A'], [13, 9, 'D'], [40, 10, 'C'],
    [12, 15, 'A+'], [12, 14, 'A'], [12, 13, 'B+'], [12, 12, 'B'], [12, 11, 'C+'], [12, 10, 'C'], [12, 9, 'D'], [8, 0, 'D'],
  ];
  for (const [age, taught, letter] of cases) assert.equal(assistantGrade(a, band(age), taught), letter, `${age} / ${taught}`);
  assert.equal(assistantGrade(a, 'child', null), null); // effectiveGrade: no count → not graded ("")
});

await check('result status order: withdrawn → testing_privately (OPEN-13) → not_finished → passed → makeup; needs (OPEN-12)', async () => {
  const credits = [15, 10, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  const categories = credits.map((cr, i) => ({ id: `k${i}`, event_id: 'e', dan: 1, name: `S${i}`, credits: cr, position: i, from_class_count: i === 8 }));
  const gradeValues = [['A+', 4.5], ['A', 4.0], ['B+', 3.5], ['B', 3.0], ['C+', 2.5], ['C', 2.0], ['D', 0]].map(([grade, value]) => ({ grade, value }));
  const assistant = { child_max_age: 12, adult_a_plus: 20, adult_a: 18, adult_b_plus: 16, adult_b: 14, adult_c_plus: 12, adult_c: 10, child_a_plus: 15, child_a: 14, child_b_plus: 13, child_b: 12, child_c_plus: 11, child_c: 10 };
  const c = { id: 'c', event_id: 'e', dan: 1, stars_from: 0, status: 'active', date_of_birth: null, private_on: null, private_time: null, assistant_classes: 18 };
  const all = (letter, over = {}) => categories.filter((k) => !k.from_class_count).map((k) => ({ candidate_id: 'c', event_category_id: k.id, grade: over[k.id] ?? letter }));
  const res = (grades, cand = {}, moves = []) => candidateResult({
    candidate: { ...c, ...cand }, testingDate: '2026-11-14', dan: { pass_mark: 245 }, categories, gradeValues, assistant, grades, makeupSubjects: moves,
  });
  // withdrawn beats everything; a private day only while incomplete (OPEN-13)
  assert.equal(res(all('A'), { status: 'withdrawn', private_on: '2026-12-01' }).status, 'withdrawn');
  assert.equal(res(all('A').slice(1), { private_on: '2026-12-01', private_time: '16:00:00' }).status, 'testing_privately');
  assert.equal(res(all('A'), { private_on: '2026-12-01', private_time: '16:00:00' }).status, 'passed'); // complete: the real result
  assert.equal(res(all('A').slice(1)).status, 'not_finished');
  assert.equal(res(all('A'), { assistant_classes: null }).status, 'not_finished'); // Assistant Instructor counts as a subject
  // D and below together: needs = the D subjects only, no choice offered (OPEN-12)
  const both = res(all('B', { k1: 'D' }), { assistant_classes: 14 }, [{ candidate_id: 'c', event_category_id: 'k2', kind: 'chosen' }]);
  assert.deepEqual([both.status, both.makeup_reasons, both.needs, both.choice_needed], ['makeup', ['d', 'below'], ['S1'], false]);
});

// =====================================================================================
// 2. The database functions through the API (contract §6.5 order)
// =====================================================================================

await check('star_set_grade: no_access → invalid → not_found → withdrawn → invalid (other event) → stale (other Dan) → invalid (letter / Assistant Instructor) → kept → ok', async () => {
  const rig = makeRig();
  const noah = await rowOf(rig, 'Noah');
  const breaking = subjectId(noah, 'Breaking');
  rig.lock();
  assert.equal((await rig.api.setGrade({ candidateId: noah.id, eventCategoryId: breaking, grade: 'A' })).status, 'no_access');
  rig.unlock();
  assert.equal((await rig.api.setGrade({ candidateId: noah.id, eventCategoryId: breaking, grade: 'E' })).status, 'invalid');
  assert.equal((await rig.api.setGrade({ candidateId: null, eventCategoryId: breaking, grade: 'A' })).status, 'invalid');
  assert.equal(rig.cands.rpc('star_set_grade', { p_candidate_id: noah.id, p_event_category_id: breaking, p_grade: 'Z' }, rig.ctx).data.status, 'invalid');
  assert.equal((await rig.api.setGrade({ candidateId: randomUUID(), eventCategoryId: breaking, grade: 'A' })).status, 'not_found');
  assert.equal((await rig.api.setGrade({ candidateId: 'nope', eventCategoryId: breaking, grade: 'A' })).status, 'not_found');
  // withdrawn comes before the subject checks (Owen Hart withdrew; a subject of another event)
  const owen = rig.snap().candidates.find((c) => c.first_name === 'Owen');
  const summerSubject = rig.snap().event_categories.find((k) => k.event_id === IDS.summer && k.dan === 1).id;
  assert.equal((await rig.api.setGrade({ candidateId: owen.id, eventCategoryId: summerSubject, grade: 'A' })).status, 'withdrawn');
  assert.equal((await rig.api.setGrade({ candidateId: noah.id, eventCategoryId: summerSubject, grade: 'A' })).status, 'invalid');
  // a subject of the event's 2nd Dan → stale (v0.164: a stale tablet can't bring cleared grades back)
  const dan2Subject = rig.snap().event_categories.find((k) => k.event_id === IDS.fall && k.dan === 2 && !k.from_class_count).id;
  assert.equal((await rig.api.setGrade({ candidateId: noah.id, eventCategoryId: dan2Subject, grade: 'A' })).status, 'stale');
  // Assistant Instructor is never stored → invalid
  const ai = noah.result.subjects.find((s) => s.fromClassCount).eventCategoryId;
  assert.equal((await rig.api.setGrade({ candidateId: noah.id, eventCategoryId: ai, grade: 'A' })).status, 'invalid');
  // a kept grade → kept, also when clearing
  const sofia = await rowOf(rig, 'Sofia');
  const keptId = sofia.result.subjects.find((s) => s.kept).eventCategoryId;
  assert.equal((await rig.api.setGrade({ candidateId: sofia.id, eventCategoryId: keptId, grade: 'B' })).status, 'kept');
  assert.equal((await rig.api.setGrade({ candidateId: sofia.id, eventCategoryId: keptId, grade: null })).status, 'kept');
  // ok: { status, grade, result } — the D becomes A, the result passes
  const ok = await rig.api.setGrade({ candidateId: noah.id, eventCategoryId: breaking, grade: 'A' });
  assert.deepEqual([ok.status, ok.grade, ok.result.status, ok.result.total], ['ok', 'A', 'passed', 272.5]);
  assert.deepEqual(rig.calls.at(-1)[1], { p_candidate_id: noah.id, p_event_category_id: breaking, p_grade: 'A' });
});

await check('star_set_grade writes: same grade → no write; null clears (the row goes); every save logged; no version check (last save wins)', async () => {
  const rig = makeRig();
  const noah = await rowOf(rig, 'Noah');
  const breaking = subjectId(noah, 'Breaking');
  const logBefore = rig.snap().change_log.length;
  assert.equal((await rig.api.setGrade({ candidateId: noah.id, eventCategoryId: breaking, grade: 'D' })).status, 'ok');
  assert.equal(rig.snap().change_log.length, logBefore); // same grade: nothing written
  await rig.api.setGrade({ candidateId: noah.id, eventCategoryId: breaking, grade: 'B' });
  const log = rig.snap().change_log.at(-1);
  assert.deepEqual([log.action, log.table_name, log.op, log.before.grade, log.after.grade], ['star_set_grade', 'star_grades', 'update', 'D', 'B']);
  // "another device" saves A+ seconds later: no version check, it simply wins
  await rig.api.setGrade({ candidateId: noah.id, eventCategoryId: breaking, grade: 'A+' });
  const cleared = await rig.api.setGrade({ candidateId: noah.id, eventCategoryId: breaking, grade: null });
  assert.deepEqual([cleared.status, cleared.grade, cleared.result.status], ['ok', null, 'not_finished']);
  assert.equal(rig.snap().candidate_grades.some((g) => g.candidate_id === noah.id && g.event_category_id === breaking), false);
  assert.equal(rig.snap().change_log.at(-1).op, 'delete');
  assert.deepEqual(cleared.result.missing, ['Breaking']);
});

await check('star_set_count: invalid (field, 0–999) → not_found → withdrawn → ok (no version bump, logged; Assistant Instructor follows)', async () => {
  const rig = makeRig();
  const noah = await rowOf(rig, 'Noah');
  const call = (over) => rig.api.setCount({ candidateId: noah.id, field: 'assistantClasses', value: 18, ...over });
  assert.equal((await call({ field: 'classes' })).status, 'invalid');
  assert.equal((await call({ value: 1000 })).status, 'invalid');
  assert.equal((await call({ value: -1 })).status, 'invalid');
  assert.equal(rig.cands.rpc('star_set_count', { p_candidate_id: noah.id, p_field: 'other', p_value: 1 }, rig.ctx).data.status, 'invalid');
  assert.equal((await call({ candidateId: randomUUID() })).status, 'not_found');
  const owen = rig.snap().candidates.find((c) => c.first_name === 'Owen');
  assert.equal((await call({ candidateId: owen.id })).status, 'withdrawn');
  const version = rig.snap().candidates.find((c) => c.id === noah.id).version;
  const ok = await call({});
  assert.deepEqual([ok.status, ok.result.ai.count, ok.result.ai.grade], ['ok', 18, 'A']);
  assert.equal(rig.snap().candidates.find((c) => c.id === noah.id).version, version); // S6: no bump
  assert.equal(rig.snap().change_log.at(-1).action, 'star_set_count');
  assert.deepEqual(rig.calls.at(-1)[1], { p_candidate_id: noah.id, p_field: 'assistant_classes', p_value: 18 });
  const empty = await call({ value: null });
  assert.deepEqual([empty.result.ai.grade, empty.result.status], [null, 'not_finished']); // not entered → not graded
  const attended = await rig.api.setCount({ candidateId: noah.id, field: 'classesAttended', value: 30 });
  assert.equal(attended.status, 'ok');
  assert.equal((await rowOf(rig, 'Noah')).classesAttended, 30);
});

await check('star_set_makeup_subjects: not_allowed (staff) → invalid → not_found → stale → withdrawn → invalid (has D / not below) → ok', async () => {
  const rig = makeRig();
  const ethan = await rowOf(rig, 'Ethan');
  const ids = ['Breaking', 'Knowledge'].map((n) => subjectId(ethan, n));
  const call = (over) => rig.api.setMakeupSubjects({ candidateId: ethan.id, expectedCategoryIds: [], categoryIds: ids, ...over });
  assert.deepEqual([ethan.result.choiceNeeded, ethan.result.total], [true, 210]);
  rig.staff();
  assert.equal((await call({})).status, 'not_allowed');
  rig.admin();
  assert.equal((await call({ categoryIds: [] })).status, 'invalid');
  assert.equal(rig.cands.rpc('star_set_makeup_subjects', { p_candidate_id: ethan.id, p_expected_category_ids: [], p_category_ids: [ids[0], ids[0]] }, rig.ctx).data.status, 'invalid');
  assert.equal((await call({ candidateId: randomUUID() })).status, 'not_found');
  assert.equal((await call({ expectedCategoryIds: [ids[0]] })).status, 'stale'); // nothing was chosen yet
  const noah = await rowOf(rig, 'Noah'); // has a D → invalid
  assert.equal((await rig.api.setMakeupSubjects({ candidateId: noah.id, expectedCategoryIds: [], categoryIds: [subjectId(noah, 'Knowledge')] })).status, 'invalid');
  const chris = await rowOf(rig, 'Chris'); // passed (not below) → invalid
  assert.equal((await rig.api.setMakeupSubjects({ candidateId: chris.id, expectedCategoryIds: [], categoryIds: [subjectId(chris, 'Knowledge')] })).status, 'invalid');
  const dan2Subject = rig.snap().event_categories.find((k) => k.event_id === IDS.fall && k.dan === 2).id;
  assert.equal((await call({ categoryIds: [dan2Subject] })).status, 'invalid'); // another Dan's subject
  const ok = await call({});
  assert.deepEqual([ok.status, ok.result.needs, ok.result.choiceNeeded], ['ok', ['Breaking', 'Knowledge'], false]);
  // the next choice must name the set the screen showed (any order); else stale
  assert.equal((await call({ expectedCategoryIds: [], categoryIds: [ids[0]] })).status, 'stale');
  const again = await call({ expectedCategoryIds: [ids[1], ids[0]], categoryIds: [ids[0]] });
  assert.deepEqual(again.result.needs, ['Breaking']);
  // withdrawn: after the stale check (the expected set is right)
  rig.snap(); // (no withdraw helper needed: Owen is withdrawn and has no chosen rows)
  const owen = rig.snap().candidates.find((c) => c.first_name === 'Owen');
  assert.equal((await rig.api.setMakeupSubjects({ candidateId: owen.id, expectedCategoryIds: [], categoryIds: [ids[0]] })).status, 'withdrawn');
});

await check('star_event_results / loadGrading: belt order, private candidates left off the grid, counts, invalid Dan, no_access, GET allowed', async () => {
  const rig = makeRig();
  const g = await grid(rig);
  const first = g.dans[1].rows;
  // belt order: stars, Shrewsbury before Worcester, last name, first name
  assert.deepEqual(first.map((r) => `${r.firstName} ${r.lastName}`), [
    'Mia Patel', 'Noah Chen', 'Ava Reed', 'Ava Reed', 'Chris Kim', 'Lily Brooks', 'Sam Ortiz', 'Sofia Reyes', 'Grace Liu', 'Ethan Lopez',
  ]);
  assert.equal(first.some((r) => r.firstName === 'Alex'), false); // testing privately: own page (v0.151)
  assert.equal(g.dans[3].rows.length, 0); // Ruby Diaz is private too
  assert.deepEqual(g.dans[2].rows.map((r) => r.firstName), ['Jordan']);
  assert.deepEqual([g.dans[1].passMark, g.dans[1].maxScore, g.dans[2].maxScore], [245, 315, 315]);
  // the SQL's own rows and counts still include private candidates (the Results tab needs them)
  const raw = rig.cands.rpc('star_event_results', { p_event_id: IDS.fall, p_dan: 1 }, rig.ctx).data;
  assert.equal(raw.rows.length, 11);
  assert.deepEqual(raw.counts, { candidates: 11, passed: 1, makeup: 3, not_finished: 6, testing_privately: 1 });
  assert.equal(rig.cands.rpc('star_event_results', { p_event_id: IDS.fall, p_dan: 9 }, rig.ctx).data.status, 'invalid');
  assert.equal((await rig.api.loadGrading(IDS.fall, [1, 9])).status, 'invalid');
  assert.equal((await rig.api.loadGrading(randomUUID(), [1])).status, 'not_found');
  assert.equal(rig.cands.rpc('star_event_results', { p_event_id: IDS.fall, p_dan: 1 }, rig.ctx, { get: true }).data.status, 'ok'); // stable
  assert.equal(rig.cands.rpc('star_set_grade', { p_candidate_id: first[0].id, p_event_category_id: first[0].result.subjects[0].eventCategoryId, p_grade: 'A' }, rig.ctx, { get: true }).error.code, '25006');
  rig.lock();
  assert.equal((await rig.api.loadGrading(IDS.fall, [1])).status, 'no_access');
  rig.unlock();
  // privacy: nothing the grid read returns has a DOB, an email or a payment
  const text = JSON.stringify(g.dans);
  for (const word of ['date_of_birth', 'dateOfBirth', 'email', '@example.com', 'paid', 'Cents', '2013-04-02']) assert.equal(text.includes(word), false, word);
  // star_age_groups: the group only
  const ages = await rig.api.loadAgeGroups(IDS.fall);
  assert.equal(ages.status, 'ok');
  assert.equal(ages.groups[first[0].id], 'adult'); // Mia Patel is 13 on Nov 14, 2026
  assert.ok(Object.values(ages.groups).every((v) => v === 'child' || v === 'adult'));
  assert.equal(JSON.stringify(ages).includes('20'), false); // no dates or ages
});

await check('the seed: every grading state of H1–H6 is there', async () => {
  const rig = makeRig();
  const g = await grid(rig);
  const row = (first, n = 0) => rowNamed(g, first, 1, n);
  const tag = (r, opts = {}) => resultTag(r.result, { isMakeup: r.isMakeup, ...opts }).text;
  assert.equal(tag(row('Chris')), 'Passed');
  assert.equal(totalText(row('Chris').result, false), '280');
  assert.equal(tag(row('Noah')), '⚠ Make-up · D in Breaking');
  assert.equal(tag(row('Ethan')), '⚠ Make-up · below 245');
  assert.deepEqual(resultTag(row('Ethan').result, { isAdmin: true }), { tone: 'amber', text: '⚠ Make-up · below 245', link: 'choose_subjects', after: null });
  assert.equal(resultTag(row('Ethan').result, { isAdmin: false }).after, '· an admin chooses subjects');
  assert.equal(tag(row('Sam')), '⚠ Make-up · retests Breaking, Knowledge');
  assert.equal(tag(row('Ava', 0)), '7 of 11 left');
  assert.equal(totalText(row('Ava', 0).result, false), '—');
  for (const name of ['Mia', 'Lily']) assert.equal(tag(row(name)), 'Not started');
  assert.equal(tag(row('Ava', 1)), 'Not started');
  // Sofia: a make-up with kept grades; retests Breaking (graded) and Korean Terminology → "1 of 2 left"
  const sofia = row('Sofia');
  assert.equal(sofia.isMakeup, true);
  assert.deepEqual(sofia.result.subjects.filter((s) => s.retest).map((s) => s.name), ['Breaking', 'Korean Terminology']);
  assert.equal(sofia.result.subjects.filter((s) => s.kept).length, 8);
  assert.ok(sofia.result.subjects.filter((s) => s.kept).every((s) => s.keptFromEventName === 'Summer Star Testing'));
  assert.equal(tag(sofia), '1 of 2 left');
  assert.equal(totalText(sofia.result, true), '257.5 so far');
  assert.equal(sofia.assistantClasses, 16); // counts copied (OPEN-10: Assistant Instructor not retested)
  // Grace: retests Two Step Sparring only
  assert.equal(tag(row('Grace')), 'Not started');
  // Alex Kim: testing privately, half graded, on his own page
  const alexId = await candidateId(rig, 'fall', 'Alex');
  const p = await rig.api.loadPrivateGrading(alexId);
  assert.equal(p.status, 'ok');
  assert.deepEqual([p.row.privateOn, p.row.privateTime, p.row.result.status, p.row.danLabel, p.row.starsTo], ['2026-12-01', '16:00', 'testing_privately', '1st Dan', 2]);
  assert.equal(tag(p.row), '8 of 11 left');
  const privateText = JSON.stringify(p);
  for (const word of ['dateOfBirth', 'date_of_birth', 'email', '@example.com', 'payments', 'paidCents', '2012-09-15']) assert.equal(privateText.includes(word), false, word);
  // Spring's make-up list now lists Fall's make-ups too (Fall is earlier than Spring)
  const list = await rig.candidatesApi.loadMakeupList(IDS.spring);
  assert.deepEqual(list.rows.slice(0, 3).map((r) => r.firstName), ['Noah', 'Sam', 'Ethan']);
});

await check('stale after a Dan change on another device (simulateDanChange); withdrawn; the key changes only with status, total or needs (OPEN-15)', async () => {
  const rig = makeRig();
  const noah = await rowOf(rig, 'Noah');
  const knowledge = subjectId(noah, 'Knowledge');
  assert.match(rig.cands.simulateDanChange('Noah', 2), /moved to 2nd Dan/);
  assert.equal((await rig.api.setGrade({ candidateId: noah.id, eventCategoryId: knowledge, grade: 'A' })).status, 'stale');
  const d = await rig.api.loadCandidateDan(noah.id);
  assert.deepEqual([d.status, d.dan, d.danLabel, d.candidateStatus], ['ok', 2, '2nd Dan', 'active']);
  const g = await grid(rig);
  assert.equal(g.dans[1].rows.some((r) => r.id === noah.id), false);
  assert.equal(g.dans[2].rows.find((r) => r.id === noah.id).result.gradedCount, 1); // grades cleared, counts kept (Assistant Instructor)
  // withdrawn on another device
  const mia = await rowOf(rig, 'Mia');
  const c = rig.snap().candidates.find((x) => x.id === mia.id);
  assert.equal((await rig.candidatesApi.withdrawCandidate({ candidateId: mia.id, expectedVersion: c.version })).status, 'ok');
  assert.equal((await rig.api.setGrade({ candidateId: mia.id, eventCategoryId: knowledge, grade: 'A' })).status, 'withdrawn');
  // OPEN-15: a new grade that leaves status, total and needs alone keeps the key
  const chris = await rowOf(rig, 'Chris');
  const key0 = chris.result.resultKey;
  const swap1 = await rig.api.setGrade({ candidateId: chris.id, eventCategoryId: subjectId(chris, 'Breaking'), grade: 'A+' });
  const swap2 = await rig.api.setGrade({ candidateId: chris.id, eventCategoryId: subjectId(chris, 'Knowledge'), grade: 'B+' });
  assert.notEqual(swap1.result.resultKey, key0); // the total moved
  assert.equal(swap2.result.resultKey, key0); // back to 280, still passed, no needs
  const counted = await rig.api.setCount({ candidateId: chris.id, field: 'classesAttended', value: 5 });
  assert.equal(counted.result.resultKey, key0); // classes attended changes nothing (OPEN-23)
  const lower = await rig.api.setGrade({ candidateId: chris.id, eventCategoryId: subjectId(chris, 'Breaking'), grade: 'D' });
  assert.notEqual(lower.result.resultKey, key0);
});

await check('the API: argument names, statuses, no throw on a dead connection', async () => {
  for (const name of STAR_GRADING_RPC_NAMES) assert.ok(STAR_CANDIDATE_RPC_NAMES.includes(name), name);
  for (const name of STAR_GRADING_WRITE_RPC_NAMES) assert.equal(STAR_CANDIDATE_WRITE_RPC_NAMES.includes(name), false); // listed apart
  assert.deepEqual(Object.keys(GRADING_RPC_ARGS).sort(), [...STAR_GRADING_RPC_NAMES].sort());
  const rig = makeRig();
  const noah = await rowOf(rig, 'Noah');
  assert.equal(rig.cands.rpc('star_set_grade', { p_candidate_id: noah.id, p_grade: 'A' }, rig.ctx).error.code, 'PGRST202');
  assert.equal(rig.cands.rpc('star_set_count', { p_candidate_id: noah.id, p_field: 'classes_attended', p_value: 'x' }, rig.ctx).error.code, '22P02');
  const dead = createStarGradingApi(() => null);
  for (const r of [await dead.loadGrading(IDS.fall, [1]), await dead.setGrade({ candidateId: noah.id, eventCategoryId: noah.id, grade: 'A' }),
    await dead.setCount({ candidateId: noah.id, field: 'classesAttended', value: 1 }), await dead.loadPrivateGrading(noah.id)]) {
    assert.equal(r.status, 'error');
  }
  const odd = createStarGradingApi(() => ({ rpc: async () => ({ data: { status: 'weird' }, error: null }) }));
  assert.equal((await odd.setGrade({ candidateId: noah.id, eventCategoryId: noah.id, grade: 'A' })).status, 'error');
  assert.ok(STAR_GRADING_STATUSES.includes('kept'));
  rig.cands.failNextSave();
  assert.equal((await rig.api.setGrade({ candidateId: noah.id, eventCategoryId: subjectId(noah, 'Breaking'), grade: 'A' })).status, 'error');
  assert.equal((await rowOf(rig, 'Noah')).result.dSubjects.length, 1); // nothing changed
});

// =====================================================================================
// 3. The pure screen rules and words
// =====================================================================================

await check('grade letters, judged subjects, toggle, server values, kept cells', async () => {
  const rig = makeRig();
  const g = await grid(rig);
  assert.deepEqual(gradeLetters(g.copy), ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D']);
  const subjects = judgedSubjects(g.copy, 1);
  assert.equal(subjects.length, 10); // Assistant Instructor is not a column (v0.126)
  assert.equal(subjects[0].name, 'White–Deputy Curriculum');
  assert.equal(toggleGrade('A', 'A'), null);
  assert.equal(toggleGrade('A', 'B+'), 'B+');
  const noah = rowNamed(g, 'Noah');
  assert.equal(serverValue(noah, 'grade', subjectId(noah, 'Breaking')), 'D');
  assert.equal(serverValue(noah, 'count', 'assistantClasses'), 12);
  assert.equal(serverValue(noah, 'count', 'classesAttended'), 22);
  const sofia = rowNamed(g, 'Sofia');
  assert.equal(keptSubject(sofia, subjectId(sofia, 'Go-Ryo Poomse')).grade, 'A');
  assert.equal(keptSubject(sofia, subjectId(sofia, 'Breaking')), null);
});

await check('Result wording table (proposal 25) and N of M (proposal 26)', async () => {
  const base = { status: 'not_finished', makeupReasons: [], dSubjects: [], needs: [], choiceNeeded: false, passMark: 245, missing: [], subjectCount: 11, subjects: [], ai: { count: null } };
  assert.equal(resultTag({ ...base, status: 'passed' }).text, 'Passed');
  assert.equal(resultTag({ ...base, status: 'passed' }).tone, 'green');
  assert.equal(resultTag({ ...base, status: 'makeup', makeupReasons: ['d'], dSubjects: ['Breaking', 'Knowledge'] }).text, '⚠ Make-up · D in Breaking, Knowledge');
  assert.equal(resultTag({ ...base, status: 'makeup', makeupReasons: ['d', 'below'], dSubjects: ['Breaking'], needs: ['Breaking'] }).text, '⚠ Make-up · D in Breaking');
  assert.equal(resultTag({ ...base, status: 'makeup', makeupReasons: ['below'], choiceNeeded: true }).text, '⚠ Make-up · below 245');
  assert.equal(resultTag({ ...base, status: 'makeup', makeupReasons: ['below'], needs: ['Breaking', 'Knowledge'] }).text, '⚠ Make-up · retests Breaking, Knowledge');
  // a normal candidate: the database's missing list, Assistant Instructor included (8 of 13 on 2nd Dan)
  const missing = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'Assistant Instructor'];
  assert.equal(resultTag({ ...base, missing, subjectCount: 13 }).text, '8 of 13 left');
  assert.equal(resultTag({ ...base, missing: Array(11).fill('x') }).text, 'Not started');
  // a make-up: retest subjects, + Assistant Instructor only while its count is empty
  const s = (name, over = {}) => ({ name, grade: null, retest: false, fromClassCount: false, ...over });
  const mk = (aiCount) => ({ ...base, ai: { count: aiCount }, subjects: [s('Breaking', { retest: true, grade: 'A' }), s('Korean', { retest: true }), s('AI', { fromClassCount: true, grade: aiCount === null ? null : 'A' }), s('Kept', { grade: 'A' })] });
  assert.deepEqual(leftOfCount(mk(16), true), { left: 1, of: 2 });
  assert.deepEqual(leftOfCount(mk(null), true), { left: 2, of: 3 });
  assert.equal(resultTag(mk(16), { isMakeup: true }).text, '1 of 2 left');
  // the save states win over the result (proposals 2 and 4)
  assert.deepEqual(resultTag({ ...base, status: 'passed' }, { save: { grades: 2, counts: 0, retrying: false } }), { tone: 'amber', text: '⚠ Not saved · 2 grades', link: null, after: null });
  assert.equal(resultTag(null, { save: { grades: 0, counts: 1, retrying: false } }).text, '⚠ Not saved · 1 count');
  assert.equal(resultTag(null, { save: { grades: 2, counts: 1, retrying: false } }).text, '⚠ Not saved · 2 grades and 1 count');
  assert.deepEqual(resultTag(null, { save: { grades: 1, counts: 0, retrying: true } }), { tone: 'gray', text: 'Saving…', link: null, after: null });
  assert.equal(totalText({ complete: true, total: 227.5 }, false), '227.5');
});

await check('next cell after a choice (proposal 28): right, then the next row\'s first empty cell; kept cells skipped', async () => {
  const cols = ['s1', 's2', 's3'];
  const rows = [
    { id: 'r1', cells: { s1: 'A', s2: null, s3: 'kept' } },
    { id: 'r2', cells: { s1: 'A', s2: 'B', s3: 'C' } }, // full: skipped
    { id: 'r3', cells: { s1: 'kept', s2: 'A', s3: null } },
  ];
  const editable = (row, k) => row.cells[k] !== 'kept';
  const empty = (row, k) => row.cells[k] === null;
  assert.deepEqual(nextCell(rows, cols, { rowId: 'r1', categoryId: 's1' }, editable, empty), { rowId: 'r1', categoryId: 's2' }); // right, filled or not
  assert.deepEqual(nextCell(rows, cols, { rowId: 'r1', categoryId: 's2' }, editable, empty), { rowId: 'r3', categoryId: 's3' }); // s3 kept → next rows
  assert.deepEqual(nextCell(rows, cols, { rowId: 'r2', categoryId: 's1' }, editable, empty), { rowId: 'r2', categoryId: 's2' });
  assert.equal(nextCell(rows, cols, { rowId: 'r3', categoryId: 's3' }, editable, empty), null);
});

await check('typed letters on a PC: A, B, C, D then "+", Delete clears', async () => {
  const run = (keys, letters) => {
    let state = { pending: null };
    const out = [];
    for (const key of keys) {
      const step = typingStep(state, key, letters);
      state = step.state;
      out.push(...step.effects.map((e) => (e.type === 'set' ? e.grade : e.type)));
    }
    return out;
  };
  assert.deepEqual(run(['a', '+']), ['A', 'A+', 'move']);
  assert.deepEqual(run(['b', 'c']), ['B', 'move', 'C']); // a second letter: the first cell is done
  assert.deepEqual(run(['d']), ['D', 'move']);
  assert.deepEqual(run(['c', 'Enter']), ['C', 'move']);
  assert.deepEqual(run(['+']), []);
  assert.deepEqual(run(['Delete']), ['clear']);
  assert.deepEqual(run(['x', 'ArrowRight', '+']), []);
  assert.deepEqual(run(['a', '+'], ['A', 'B', 'D']), ['A']); // no A+ in this copy: "+" does nothing
});

await check('banner, offline, leave and kept texts (proposals 3, 6, 7, 9–12)', async () => {
  assert.equal(T.saveFailedBanner(3, 1, ['Mia Patel', 'Noah Chen', 'Ethan Lopez']),
    'Couldn’t save 3 grades and 1 count (Mia Patel, Noah Chen and Ethan Lopez). Check the connection, then try again.');
  assert.equal(T.saveFailedBanner(2, 0, ['Noah Chen']), 'Couldn’t save 2 grades (Noah Chen). Check the connection, then try again.');
  assert.equal(T.saveFailedBanner(5, 0, ['A B', 'C D', 'E F', 'G H', 'I J']), 'Couldn’t save 5 grades (A B, C D, E F and 2 more). Check the connection, then try again.');
  assert.equal(T.offlineBanner(9, 1), 'You’re offline. 9 grades and 1 count aren’t saved yet. They save by themselves when the connection is back. Keep this page open.');
  assert.equal(T.offlineBanner(1, 0), 'You’re offline. 1 grade isn’t saved yet. They save by themselves when the connection is back. Keep this page open.');
  assert.equal(T.leaveTitle(3, 1), '3 grades and 1 count aren’t saved');
  assert.equal(T.leaveTitle(1, 0), '1 grade isn’t saved');
  assert.equal(T.leaveBody([{ name: 'Mia Patel', items: ['Korean Terminology'] }, { name: 'Noah Chen', items: ['Breaking', 'Knowledge'] }, { name: 'Ethan Lopez', items: ['Assistant classes'] }]),
    'Mia Patel (Korean Terminology), Noah Chen (Breaking, Knowledge) and Ethan Lopez (Assistant classes) weren’t saved because the connection dropped. If you leave now, they’re lost. Stay, and they’ll save when the Wi-Fi is back.');
  assert.equal(T.keptNoteTitle('Spring 2026', 'A'), 'Kept from Spring 2026 · A');
  assert.equal(T.keptNoteBody('Spring 2026'), 'Kept grades can’t be changed on this testing. To correct one, fix it on Spring 2026, then an admin removes this make-up and adds it again (if it’s still a make-up).');
  assert.equal(refusalText('kept', 'grade', 'Sofia Reyes'), 'That grade was kept from an earlier testing, so it can’t be changed here. Your change wasn’t saved.');
  assert.equal(refusalText('stale', 'grade', 'Jordan Kim', '2nd Dan'), 'Jordan Kim was moved to 2nd Dan on another device. Your grade wasn’t saved.');
  assert.equal(refusalText('withdrawn', 'grade', 'Mia Patel'), 'Mia Patel was removed from this testing. Your grade wasn’t saved.');
  assert.equal(refusalText('invalid', 'grade', 'Mia Patel'), 'That grade couldn’t be saved. The grid has been reloaded.');
  assert.equal(refusalText('not_found', 'grade', 'Mia Patel'), T.GRADE_RELOADED);
  assert.equal(T.CHANGED_ELSEWHERE_GRADE, 'Changed on another device — your grade wasn’t saved.');
});

await check('the save engine\'s pure part: answer kinds, the retry decision (proposal 4), the unsaved summary', async () => {
  assert.equal(answerKind('ok', 'grade'), 'saved');
  assert.equal(answerKind('error', 'grade'), 'retry');
  assert.equal(answerKind('no_access', 'count'), 'lock');
  assert.equal(answerKind('stale', 'grade'), 'check_dan');
  assert.equal(answerKind('stale', 'count'), 'retry'); // star_set_count has no stale of its own
  for (const s of ['kept', 'withdrawn', 'invalid', 'not_found', 'not_allowed', 'duplicate_name']) assert.equal(answerKind(s, 'grade'), 'refused', s);
  // base: the database's value when chosen; latest: the newest value read after the choice
  assert.equal(retryDecision({ base: null, wanted: 'A', latest: undefined }), 'send'); // no refresh since
  assert.equal(retryDecision({ base: null, wanted: 'A', latest: null }), 'send'); // nobody changed it
  assert.equal(retryDecision({ base: null, wanted: 'A', latest: 'A' }), 'already_saved'); // the lost answer
  assert.equal(retryDecision({ base: null, wanted: 'A', latest: 'B+' }), 'changed_elsewhere'); // the desk typed B+: drop
  assert.equal(retryDecision({ base: 'C', wanted: null, latest: 'C' }), 'send'); // a clear, unchanged
  assert.equal(retryDecision({ base: 'C', wanted: null, latest: null }), 'already_saved');
  assert.equal(retryDecision({ base: 12, wanted: 14, latest: 16 }), 'changed_elsewhere'); // counts too
  const rows = [
    { id: 'm', firstName: 'Mia', lastName: 'Patel', dan: 1, result: { subjects: [{ eventCategoryId: 'k', name: 'Korean Terminology', position: 10 }] } },
    { id: 'n', firstName: 'Noah', lastName: 'Chen', dan: 1, result: { subjects: [{ eventCategoryId: 'b', name: 'Breaking', position: 6 }, { eventCategoryId: 'w', name: 'Knowledge', position: 9 }] } },
    { id: 'j', firstName: 'Jordan', lastName: 'Kim', dan: 2, result: { subjects: [] } },
  ];
  const entries = {
    [cellKey('n', 'grade', 'w')]: { state: 'unsaved' },
    [cellKey('n', 'grade', 'b')]: { state: 'retrying' },
    [cellKey('m', 'grade', 'k')]: { state: 'unsaved' },
    [cellKey('j', 'count', 'assistantClasses')]: { state: 'unsaved' },
    [cellKey('m', 'count', 'classesAttended')]: { state: 'saving' }, // not counted: still on its way
  };
  const name = (row, id) => row.result.subjects.find((s) => s.eventCategoryId === id)?.name ?? '';
  const sum = unsavedSummary(entries, rows, name);
  assert.deepEqual([sum.grades, sum.counts, sum.names, sum.dans], [3, 1, ['Mia Patel', 'Noah Chen', 'Jordan Kim'], [1, 2]]);
  assert.deepEqual(sum.people.map((p) => p.items), [['Korean Terminology'], ['Breaking', 'Knowledge'], ['Assistant classes']]);
  // A private candidate's Not saved cell: counted for the leave question, but no ⚠ on a Dan (fix 8)
  const withPrivate = [...rows, { id: 'a', firstName: 'Alex', lastName: 'Kim', dan: 3, privateOn: '2026-12-01', result: { subjects: [{ eventCategoryId: 'k', name: 'Korean Terminology', position: 10 }] } }];
  const sum2 = unsavedSummary({ ...entries, [cellKey('a', 'grade', 'k')]: { state: 'unsaved' } }, withPrivate, name);
  assert.deepEqual([sum2.grades, sum2.dans], [4, [1, 2]]);
  assert.deepEqual(sum2.names, ['Mia Patel', 'Noah Chen', 'Jordan Kim', 'Alex Kim']);
  assert.deepEqual(unsavedSummary({ [cellKey('a', 'grade', 'k')]: { state: 'unsaved' } }, withPrivate, name).dans, []);
});

await check('save engine: a retry waits for a read that started after the failure (fix 9a)', () => {
  // retryReady: unsaved, not on its way, and checkedAt (the read's start) later than failedAt
  assert.equal(retryReady({ state: 'unsaved', inFlight: false, failedAt: 1000, checkedAt: null }), false); // no read yet
  assert.equal(retryReady({ state: 'unsaved', inFlight: false, failedAt: 1000, checkedAt: 900 }), false); // read started BEFORE the failure
  assert.equal(retryReady({ state: 'unsaved', inFlight: false, failedAt: 1000, checkedAt: 1000 }), false);
  assert.equal(retryReady({ state: 'unsaved', inFlight: false, failedAt: 1000, checkedAt: 1500 }), true);
  assert.equal(retryReady({ state: 'unsaved', inFlight: true, failedAt: 1000, checkedAt: 1500 }), false); // already on its way
  assert.equal(retryReady({ state: 'saving', inFlight: false, failedAt: 1000, checkedAt: 1500 }), false);
  assert.equal(retryReady({ state: 'unsaved', inFlight: false, failedAt: null, checkedAt: 1500 }), false);
  assert.equal(retryReady(undefined), false);
  // refreshStep: what a read (started at loadedAt) does to one cell
  assert.equal(refreshStep({ state: 'saved', inFlight: false, answeredAt: 500, chosenAt: 100 }, 600, 'A'), 'drop');
  assert.equal(refreshStep({ state: 'saved', inFlight: false, answeredAt: 500, chosenAt: 100 }, 400, 'A'), 'keep'); // older read
  assert.equal(refreshStep({ state: 'unsaved', inFlight: false, chosenAt: 100 }, 1500, 'B+'), 'check');
  assert.equal(refreshStep({ state: 'unsaved', inFlight: false, chosenAt: 100 }, 1500, null), 'check'); // empty in the database
  assert.equal(refreshStep({ state: 'unsaved', inFlight: false, chosenAt: 2000 }, 1500, 'B+'), 'keep'); // read older than the choice
  assert.equal(refreshStep({ state: 'unsaved', inFlight: false, chosenAt: 100 }, 1500, undefined), 'keep'); // row not in the read
  assert.equal(refreshStep({ state: 'retrying', inFlight: true, chosenAt: 100 }, 1500, 'B+'), 'keep');
  // The two together: failed at 1000; a read started at 900 answers late → not ready; one at 1200 → ready,
  // and retryDecision then compares with THAT read's value (another device's B+ → drop with the note).
  let e = { state: 'unsaved', inFlight: false, chosenAt: 100, failedAt: 1000, checkedAt: null, base: null, wanted: 'A', latest: undefined };
  if (refreshStep(e, 900, 'B+') === 'check') e = { ...e, latest: 'B+', checkedAt: 900 };
  assert.equal(retryReady(e), false);
  if (refreshStep(e, 1200, 'B+') === 'check') e = { ...e, latest: 'B+', checkedAt: 1200 };
  assert.equal(retryReady(e), true);
  assert.equal(retryDecision(e), 'changed_elsewhere');
});

await check('save engine: an older send\'s answer never drops a newer pick (fix 9b)', () => {
  for (const what of ['saved', 'retry', 'refused']) {
    assert.equal(answerStep(what, 'B', 'A'), 'send_newer', what); // the grader picked A while B was on its way
    assert.equal(answerStep(what, 'B', 'B'), what, what); // the answer is about what the cell shows
  }
  assert.equal(answerStep('refused', null, 'C'), 'send_newer'); // a refused clear, then a new grade
  assert.equal(answerStep('refused', 12, 14), 'send_newer'); // counts too
  assert.equal(answerStep('lock', 'B', 'A'), 'lock'); // no_access always locks the screen
});

console.log(`ALL STAR GRADING CHECKS PASSED (${count} checks)`);
