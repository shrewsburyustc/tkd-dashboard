// resultsChecks.mjs — automatic checks for Star testing RESULTS' data layer, rules, email builder and
// CSV (build phase 6).
// Run:  node src/lib/star/resultsChecks.mjs      (prints ALL STAR RESULTS CHECKS PASSED, exits 0)
// Why it exists: the preview database (mockStarResults.js, inside mockStarCandidates.js) must answer
// exactly like migrations 0006 and 0023 (contract 0006 §6.6, CONTRACT-0023 §4–§5) — the same checks
// in the same order, the same statuses and shapes — and the API (resultsCore.js, which resultsApi.js
// uses) must send the right argument names and convert every answer. The pure parts (the reason and
// sent wording, the late-grade note, the email's blanks, the mailto: link, the text rules, the CSV's
// columns, quoting and formula guard, the file name) are checked here too, so the screens can rely on
// them. Plain `assert`, no browser, no database.
//
// Covered: the seed's Results states (Summer) · star_event_results incl. private rows and the sent
// state · the late-grade read · Mark as sent: not_finished / withdrawn / not_found / invalid / stale
// (wrong key, and after a change on "another device") / ok with its snapshot · Undo: the same person
// within 10 s, not after, admins any time, already undone → stale, the fallback to the send before ·
// the CSV: admins only, v0.144's 15 columns exactly, belt order, active only, the download log, the
// values of proposal 32, 0023's row keys (candidate_id, paid_on = newest payment not reversed,
// sent.result_status) and one call only, look-alike candidates' own paid dates, the formula guard, the file name · the email for all three kinds incl. a
// private testing and a D-and-below · mailto: holds only the address and the subject ·
// loadEmailAddress keeps only the address · the text rules give the SAME answers as
// star_result_text_problem for every case of supabase/tests/0023_tests.sql · the starting texts equal
// the migration's seed · star_set_result_text (admin, invalid, stale, same text, history).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createStarBackend } from '../mockStarTesting.js';
import { createStarEventsBackend, STAR_EVENT_RPC_NAMES, STAR_EVENT_TABLES } from '../mockStarEvents.js';
import {
  createStarCandidatesBackend, defaultStarCandidatesData, starCandidatesSeedIsCurrent, STAR_CANDIDATE_RPC_NAMES,
  STAR_CANDIDATE_TABLES, SEED_CANDIDATE_EVENT_IDS,
} from '../mockStarCandidates.js';
import { RESULTS_RPC_ARGS, STAR_RESULTS_RPC_NAMES } from '../mockStarResults.js';
import { createStarEventsApi } from './eventsCore.js';
import {
  createStarResultsApi, summaryCounts, resultTag, resultReason, lateNote, resultsTotalText, sentLine, isSent, canMarkSent,
  csvFileName, undoTimeLeft, UNDO_CAP_MS, UNDO_TOAST_MS, STAR_RESULTS_STATUSES,
} from './resultsCore.js';
import {
  RESULT_SUBJECT, STARTING_TEXTS, BLANKS_BY_KIND, resultTextProblem, resultTextProblemDetail, resultKind, canEmailResult,
  buildResultMessage, mailtoFor, fillBlanks, longDate, starEarned, ordinal,
} from './resultEmail.js';
import { csvCell, toCsv } from './csv.js';
import * as T from './resultsText.js';

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

const TODAY = '2026-10-19'; // Summer's testing day was 100 days earlier: Sat, Jul 11, 2026
const NOW = Date.parse('2026-10-19T18:00:00Z');
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const DESK_ID = '00000000-0000-4000-8000-0000000000d1';
const IDS = SEED_CANDIDATE_EVENT_IDS;
const SQL_0023 = new URL('../../../supabase/migrations/0023_star_result_texts.sql', import.meta.url);
const TESTS_0023 = new URL('../../../supabase/tests/0023_tests.sql', import.meta.url);

// ----- A test rig: in-memory store + the Star fakes + a fake client + the APIs on top -----
// rig.tick(ms) moves the clock (the 10-second Undo window).
function makeRig() {
  let store = null;
  let now = NOW;
  const ctx = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Test Admin', userId: ADMIN_ID };
  const saveStore = (s) => {
    store = JSON.stringify(s);
  };
  const loadStore = () => (store === null ? null : JSON.parse(store));
  const clock = () => now;
  const star = createStarBackend({ loadStore, saveStore, now: clock, newId: randomUUID });
  const events = createStarEventsBackend({
    readBase: () => star.snapshot(), saveStore, now: clock, today: () => TODAY, newId: randomUUID,
    seed: defaultStarCandidatesData, seedIsCurrent: starCandidatesSeedIsCurrent,
  });
  const cands = createStarCandidatesBackend({ readBase: () => events.snapshot(), saveStore, now: clock, today: () => TODAY, newId: randomUUID });
  const calls = [];
  const saved = []; // files the CSV "saved"
  const client = {
    from(table) {
      const q = { columns: '*', filters: [], orders: [] };
      const builder = {
        select(columns) { q.columns = columns; return builder; },
        eq(col, value) { q.filters.push({ col, value }); return builder; },
        in(col, values) { q.filters.push({ col, value: values, op: 'in' }); return builder; },
        order(col, { ascending = true } = {}) { q.orders.push({ col, ascending }); return builder; },
        then(resolve, reject) {
          calls.push(['from', table, q.columns]);
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
    api: createStarResultsApi(() => client, { getToday: () => TODAY, nowMs: clock, saveFile: (fileName, text) => saved.push({ fileName, text }) }),
    eventsApi: createStarEventsApi(() => client, () => TODAY),
    cands, ctx, calls, saved, client,
    tick: (ms) => { now += ms; },
    snap: () => cands.snapshot(),
    editStore: (fn) => {
      const s = JSON.parse(store);
      fn(s);
      store = JSON.stringify(s);
    },
    staff: () => { ctx.isAdmin = false; ctx.actorName = 'Staff'; ctx.userId = DESK_ID; },
    admin: () => { ctx.isAdmin = true; ctx.actorName = 'Test Admin'; ctx.userId = ADMIN_ID; },
    lock: () => { ctx.hasDataAccess = false; },
    unlock: () => { ctx.hasDataAccess = true; },
  };
}

// The results of an event (every Dan), and helpers to find a row by first name.
async function results(rig, key = 'summer') {
  const ev = await rig.eventsApi.loadStarEvent(IDS[key]);
  assert.equal(ev.status, 'ok');
  const r = await rig.api.loadResults(IDS[key], ev.copy.dans.map((d) => d.dan));
  assert.equal(r.status, 'ok');
  return { ...r, event: ev.event, copy: ev.copy };
}
const allRows = (res) => Object.values(res.dans).flatMap((d) => d.rows);
const rowOf = (res, first) => {
  const row = allRows(res).find((r) => r.firstName === first);
  assert.ok(row, `no row for ${first}`);
  return row;
};
const reasonOf = (res, first, isAdmin = true) => resultReason(rowOf(res, first), { testingDate: res.event.testingDate, isAdmin });

// =====================================================================================
// 1. Reading: the seed's Results states (Summer, finished)
// =====================================================================================

await check('loadResults: Summer — private rows included, belt order, the database counts, no DOB / email / payment anywhere', async () => {
  const rig = makeRig();
  const res = await results(rig);
  assert.equal(res.event.testingDate, '2026-07-11');
  const d1 = res.dans[1];
  // private candidates (Zoe, Ivy) ARE on the Results tab (v0.150), unlike Grading
  assert.ok(d1.rows.some((r) => r.firstName === 'Zoe') && d1.rows.some((r) => r.firstName === 'Ivy'));
  assert.deepEqual(d1.counts, summaryCounts(d1.rows));
  assert.equal(d1.rows.some((r) => r.firstName === 'Casey'), false); // withdrawn: never listed
  // belt order: stars, Shrewsbury before Worcester, last name
  const order = d1.rows.map((r) => [r.starsFrom, r.locationCode === 'shrewsbury' ? 0 : 1, r.lastName.toLowerCase()]);
  assert.deepEqual(order, [...order].sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0)));
  assert.equal(d1.passMark, 245);
  assert.equal(d1.maxScore, 315);
  const text = JSON.stringify(res.dans);
  for (const banned of ['example.com', 'date_of_birth', 'dateOfBirth', 'email', '2011-03-04', 'paid', 'cents']) assert.equal(text.includes(banned), false, banned);
  // the API asked only for granted, non-private columns
  const first = rig.calls.findIndex(([n]) => n === 'star_event_results'); // (the event page's own reads come before)
  const reads = rig.calls.slice(first).filter(([n]) => n === 'from').map(([, table, cols]) => [table, cols]);
  assert.deepEqual(reads, [['star_roster', 'id, is_makeup, makeup_of_event_name'], ['star_grades', 'candidate_id, event_category_id, kept, updated_at']]);
});

await check('the reason wording (proposal 4) and the late-grade note (26) for every Summer state', async () => {
  const rig = makeRig();
  const res = await results(rig);
  assert.deepEqual(reasonOf(res, 'Lucas'), { text: 'Earns 1 star', link: null });
  assert.deepEqual(reasonOf(res, 'Morgan'), { text: 'Earns 2nd star', link: null });
  assert.deepEqual(reasonOf(res, 'Nina'), { text: 'Earns 2nd star · Korean Terminology graded Jul 14', link: null }); // 3 days late
  assert.deepEqual(reasonOf(res, 'Ivy'), { text: 'Earns 2nd star · private testing Jul 13', link: null }); // graded on her private day
  assert.deepEqual(reasonOf(res, 'Ella'), { text: 'Earns 1 star · Breaking graded Jul 15', link: null }); // corrected after the day
  assert.deepEqual(reasonOf(res, 'Ben'), { text: 'Korean Terminology not graded yet', link: null });
  assert.deepEqual(reasonOf(res, 'Zoe'), { text: 'Private · Sat, Oct 24 · 4:00 PM', link: null }); // before her private day
  assert.deepEqual(reasonOf(res, 'Grace'), { text: 'D in Two Step Sparring · retests Two Step Sparring', link: null });
  assert.deepEqual(reasonOf(res, 'Sofia'), { text: 'D in Breaking, Korean Terminology · below 245 · retests Breaking, Korean Terminology', link: null });
  assert.deepEqual(reasonOf(res, 'Drew'), { text: 'Below 245 · retests Breaking, Knowledge', link: null });
  assert.deepEqual(reasonOf(res, 'Avery'), { text: 'Below 245 · an admin chooses subjects', link: 'choose_subjects' });
  assert.deepEqual(reasonOf(res, 'Avery', false), { text: 'Below 245 · an admin chooses subjects', link: null }); // staff: no link
  assert.equal(reasonOf(res, 'Taylor').text, 'D in Breaking · retests Breaking');
  // the tag, the total, and who gets Email result (7)
  assert.deepEqual(resultTag(rowOf(res, 'Zoe').result), { tone: 'gray', text: 'Testing privately', icon: 'calendar' });
  assert.deepEqual(resultTag(rowOf(res, 'Grace').result), { tone: 'amber', text: 'Make-up', icon: null });
  assert.deepEqual(resultTag(rowOf(res, 'Ben').result), { tone: 'gray', text: 'Not finished', icon: null });
  assert.equal(resultsTotalText(rowOf(res, 'Zoe').result, false), '—');
  assert.equal(resultsTotalText(rowOf(res, 'Lucas').result, false), '280');
  const emailable = allRows(res).filter((r) => canEmailResult(r.result)).map((r) => r.firstName).sort();
  assert.deepEqual(emailable, ['Drew', 'Ella', 'Grace', 'Ivy', 'Lucas', 'Morgan', 'Nina', 'Sofia', 'Taylor']); // not Ben, Zoe, Avery
  // the late note only counts judged grades after the day; kept grades never do; class counts have no date
  const nina = rowOf(res, 'Nina');
  assert.equal(lateNote({ ...nina, grades: nina.grades.map((g) => ({ ...g, kept: true })) }, res.event.testingDate), '');
  const two = { ...nina, grades: [...nina.grades, { eventCategoryId: nina.result.subjects[0].eventCategoryId, gradedOn: '2026-07-20', kept: false }] };
  assert.equal(lateNote(two, res.event.testingDate), '2 subjects graded Jul 20'); // several: a count and the newest date
  assert.equal(lateNote({ ...nina, result: { ...nina.result, status: 'not_finished' } }, res.event.testingDate), ''); // Passed / Make-up only
});

await check('the sent line (R1, 21, 25): sent, re-sent, changed after sending, not sent, none for Not finished', async () => {
  const rig = makeRig();
  const res = await results(rig);
  assert.deepEqual(sentLine(rowOf(res, 'Morgan')), { kind: 'sent', text: 'Sent Jul 16 · Jeffrey' }); // only the newest send, first name
  assert.deepEqual(sentLine(rowOf(res, 'Taylor')), { kind: 'sent', text: 'Sent Jul 12 · Staff' });
  assert.deepEqual(sentLine(rowOf(res, 'Ella')), { kind: 'changed', text: 'Not sent yet · an earlier Make-up result was sent Jul 12' });
  assert.deepEqual(sentLine(rowOf(res, 'Lucas')), { kind: 'not_sent', text: 'Not sent yet' });
  assert.equal(sentLine(rowOf(res, 'Ben')), null);
  assert.equal(sentLine(rowOf(res, 'Zoe')), null);
  assert.equal(isSent(rowOf(res, 'Morgan')), true);
  assert.equal(isSent(rowOf(res, 'Ella')), false);
  assert.equal(canMarkSent(rowOf(res, 'Avery')), false);
  assert.equal(T.earlierSent('passed', '2026-12-03'), 'Not sent yet · an earlier Passed result was sent Dec 3');
});

await check('summary line (3) and the small wording rules', async () => {
  assert.equal(T.summaryLine('1st Dan', { candidates: 8, passed: 3, makeup: 2, notFinished: 2, testingPrivately: 1 }),
    '1st Dan · 8 candidates · 3 passed · 2 make-ups · 2 not finished · 1 testing privately');
  assert.equal(T.summaryLine('3rd Dan', { candidates: 1, passed: 0, makeup: 1, notFinished: 0, testingPrivately: 0 }),
    '3rd Dan · 1 candidate · 0 passed · 1 make-up · 0 not finished');
  // Not finished: more than two subjects, nothing graded, the class count
  const subject = (name, grade, fromClassCount = false) => ({ eventCategoryId: name, name, grade, fromClassCount });
  const nf = (subjects, gradedCount) => ({ result: { status: 'not_finished', gradedCount, subjects } });
  assert.equal(resultReason(nf([subject('A', null), subject('B', null), subject('C', null), subject('D', 'A')], 1)).text, '3 subjects not graded yet');
  assert.equal(resultReason(nf([subject('Breaking', null), subject('Knowledge', null), subject('X', 'A')], 1)).text, 'Breaking and Knowledge not graded yet');
  assert.equal(resultReason(nf([subject('A', null), subject('AI', null, true)], 0)).text, 'Nothing graded yet');
  assert.equal(resultReason(nf([subject('A', 'A'), subject('AI', null, true)], 1)).text, 'Assistant classes not entered yet');
  assert.equal(T.earnsStar(1), 'Earns 1 star');
  assert.equal(T.earnsStar(3), 'Earns 3rd star');
  assert.deepEqual([ordinal(1), ordinal(2), ordinal(3), ordinal(4), ordinal(11), ordinal(12), ordinal(21)], ['1st', '2nd', '3rd', '4th', '11th', '12th', '21st']);
  // the toast's Undo is capped 9 s after the click (20)
  assert.equal(UNDO_TOAST_MS, 5000);
  assert.equal(UNDO_CAP_MS, 9000);
  assert.equal(undoTimeLeft(1000, 1000), 9000);
  assert.equal(undoTimeLeft(1000, 8000), 2000);
  assert.equal(undoTimeLeft(1000, 12000), 0);
  assert.equal(T.markedAsSent('Noah Chen'), 'Marked as sent · Noah Chen');
  // refusal wordings (24)
  assert.equal(T.markSentRefusal('stale', 'Noah Chen'), 'Noah Chen’s result changed just now, so it wasn’t marked as sent. Check the new result, then email it again.');
  assert.equal(T.markSentRefusal('not_finished', 'Noah Chen'), 'Noah Chen’s result isn’t finished any more, so it wasn’t marked as sent.');
  assert.equal(T.markSentRefusal('withdrawn', 'Noah Chen'), 'Noah Chen was removed from this testing. It wasn’t marked as sent.');
  assert.equal(T.markSentRefusal('not_found', 'Noah Chen'), 'Noah Chen was deleted on another device. Nothing was marked.');
  assert.equal(T.markSentRefusal('error', 'Noah Chen'), 'Couldn’t mark Noah Chen as sent. Check the connection, then try again.');
  assert.equal(T.undoSentRefusal('stale'), 'That was already undone.');
  assert.equal(T.undoSentRefusal('not_allowed'), 'Too late to undo here. Ask an admin to undo Mark as sent.');
  assert.equal(T.noEmailOnFile('Noah Chen'), 'Noah Chen has no email for results. Add it with Edit details on the Candidates tab, then try again.');
  assert.equal(T.addressFailed('Noah Chen'), 'Couldn’t get Noah Chen’s email address. Check the connection, then try again.');
  assert.equal(T.csvDownloaded('Fall-2026-Star-Testing-results-2026-11-16.csv', 11),
    'Downloaded Fall-2026-Star-Testing-results-2026-11-16.csv (11 candidates). It has dates of birth, emails and payments — keep it private.');
  for (const s of STAR_RESULTS_STATUSES) assert.equal(typeof T.markSentRefusal(s, 'X'), 'string');
});

// =====================================================================================
// 2. Mark as sent and Undo (§6.6)
// =====================================================================================

await check('star_mark_result_sent: argument names, check order (invalid · not_found · withdrawn · not_finished · stale), ok + snapshot', async () => {
  const rig = makeRig();
  assert.deepEqual(RESULTS_RPC_ARGS.star_mark_result_sent.map(([n]) => n), ['p_candidate_id', 'p_expected_result_key']);
  let res = await results(rig);
  const lucas = rowOf(res, 'Lucas');
  assert.equal((await rig.api.markSent({ candidateId: null, resultKey: 'x' })).status, 'invalid');
  assert.equal((await rig.api.markSent({ candidateId: lucas.id, resultKey: '' })).status, 'invalid');
  assert.equal((await rig.api.markSent({ candidateId: randomUUID(), resultKey: 'x' })).status, 'not_found');
  assert.equal((await rig.api.markSent({ candidateId: 'not-a-uuid', resultKey: 'x' })).status, 'not_found');
  const casey = rig.snap().candidates.find((c) => c.first_name === 'Casey');
  assert.equal((await rig.api.markSent({ candidateId: casey.id, resultKey: 'x' })).status, 'withdrawn');
  assert.equal((await rig.api.markSent({ candidateId: rowOf(res, 'Ben').id, resultKey: rowOf(res, 'Ben').result.resultKey })).status, 'not_finished');
  assert.equal((await rig.api.markSent({ candidateId: rowOf(res, 'Zoe').id, resultKey: rowOf(res, 'Zoe').result.resultKey })).status, 'not_finished'); // testing privately
  assert.equal((await rig.api.markSent({ candidateId: lucas.id, resultKey: 'passed|1.0|' })).status, 'stale');
  // no_access first
  rig.lock();
  assert.equal((await rig.api.markSent({ candidateId: lucas.id, resultKey: lucas.result.resultKey })).status, 'no_access');
  rig.unlock();
  // staff may mark (S)
  rig.staff();
  const ok = await rig.api.markSent({ candidateId: lucas.id, resultKey: lucas.result.resultKey });
  assert.equal(ok.status, 'ok');
  assert.ok(ok.sentId && ok.markedAt);
  const row = rig.snap().result_emails.find((r) => r.id === ok.sentId);
  assert.deepEqual([row.result_status, row.result_total, row.result_needs, row.result_key, row.marked_by_name, row.marked_by, row.undone_at, row.sent_via],
    ['passed', 280, [], lucas.result.resultKey, 'Staff', DESK_ID, null, 'manual']);
  assert.ok(rig.snap().change_log.some((l) => l.action === 'star_mark_result_sent' && l.table_name === 'star_result_emails' && l.record_id === ok.sentId));
  res = await results(rig);
  assert.deepEqual(sentLine(rowOf(res, 'Lucas')), { kind: 'sent', text: 'Sent Oct 19 · Staff' });
  // it's a POST (the function writes), never a read-only GET
  assert.equal(rig.calls.filter(([n]) => n === 'star_mark_result_sent').every(([, , options]) => !options?.get), true);
});

await check('stale after a change on "another device" (simulateStarResultChange); a changed result asks again; Mark as sent on the new key works', async () => {
  const rig = makeRig();
  let fall = await results(rig, 'fall');
  const noah = rowOf(fall, 'Noah');
  const message = rig.cands.simulateResultChange('Noah');
  assert.match(message, /Noah Chen's .* is now A\+? \(changed on "another device"\)/);
  assert.equal((await rig.api.markSent({ candidateId: noah.id, resultKey: noah.result.resultKey })).status, 'stale');
  fall = await results(rig, 'fall');
  assert.notEqual(rowOf(fall, 'Noah').result.resultKey, noah.result.resultKey);
  assert.equal((await rig.api.markSent({ candidateId: noah.id, resultKey: rowOf(fall, 'Noah').result.resultKey })).status, 'ok');
  // Ella (changed after her send): Email result is offered again; a new Mark as sent → "Sent"
  const summer = await results(rig);
  const ella = rowOf(summer, 'Ella');
  assert.equal(canMarkSent(ella), true);
  assert.equal((await rig.api.markSent({ candidateId: ella.id, resultKey: ella.result.resultKey })).status, 'ok');
  assert.equal(sentLine(rowOf(await results(rig), 'Ella')).kind, 'sent');
  assert.equal(rig.cands.simulateResultChange('Nobody'), 'No active candidate called Nobody.');
});

await check('star_undo_result_sent: own send within 10 s, not after (not_allowed), admins any time, already undone → stale, falls back to the send before', async () => {
  const rig = makeRig();
  assert.deepEqual(RESULTS_RPC_ARGS.star_undo_result_sent.map(([n]) => n), ['p_sent_id']);
  let res = await results(rig);
  const lucas = rowOf(res, 'Lucas');
  rig.staff();
  const a = await rig.api.markSent({ candidateId: lucas.id, resultKey: lucas.result.resultKey });
  rig.tick(9000);
  assert.equal((await rig.api.undoSent(a.sentId)).status, 'ok'); // the toast's Undo, in time
  assert.equal(sentLine(rowOf(await results(rig), 'Lucas')).kind, 'not_sent');
  assert.equal((await rig.api.undoSent(a.sentId)).status, 'stale'); // already undone
  const b = await rig.api.markSent({ candidateId: lucas.id, resultKey: lucas.result.resultKey });
  rig.tick(10001);
  assert.equal((await rig.api.undoSent(b.sentId)).status, 'not_allowed'); // too late for staff
  rig.admin();
  assert.equal((await rig.api.undoSent(b.sentId)).status, 'ok'); // an admin, any time
  // another staff login can't undo someone else's send, even at once
  const c = await rig.api.markSent({ candidateId: lucas.id, resultKey: lucas.result.resultKey });
  rig.staff();
  assert.equal((await rig.api.undoSent(c.sentId)).status, 'not_allowed');
  rig.admin();
  assert.equal((await rig.api.undoSent(randomUUID())).status, 'not_found');
  assert.equal((await rig.api.undoSent(null)).status, 'invalid');
  // the fallback (21): Morgan was sent by Staff, then re-sent by Jeffrey; undoing the newer one
  // shows the older send again
  res = await results(rig);
  const morgan = rowOf(res, 'Morgan');
  assert.equal(sentLine(morgan).text, 'Sent Jul 16 · Jeffrey');
  assert.equal((await rig.api.undoSent(morgan.sent.sent.id)).status, 'ok');
  assert.deepEqual(sentLine(rowOf(await results(rig), 'Morgan')), { kind: 'sent', text: 'Sent Jul 12 · Staff' });
  // the undo is logged (undone_* set, before → after)
  assert.ok(rig.snap().change_log.some((l) => l.action === 'star_undo_result_sent' && l.op === 'update' && l.after.undone_by_name === 'Test Admin'));
  // the Undo confirmation (21)
  assert.equal(T.undoConfirmTitle('Noah Chen'), 'Undo Mark as sent for Noah Chen?');
  assert.equal(T.undoConfirmBody('2026-11-16'),
    'This removes the Nov 16 send record. The row then shows the send before it, if there was one — otherwise “Not sent yet”. Use this only if the email wasn’t really sent.');
});

// =====================================================================================
// 3. The CSV (§6.6, v0.144, proposals 29–33)
// =====================================================================================

// A small CSV reader for the checks (RFC 4180: quotes, doubled quotes, CRLF).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 1; } else cell += ch;
  }
  return rows;
}

await check('Download CSV: admins only (nothing logged for staff), the whole event, v0.144\'s 15 columns exactly, belt order, active only, the download logged', async () => {
  const rig = makeRig();
  assert.deepEqual(RESULTS_RPC_ARGS.star_results_csv.map(([n]) => n), ['p_event_id', 'p_dan']);
  const { event, copy } = await results(rig);
  rig.staff();
  assert.equal((await rig.api.downloadCsv({ event, dans: copy.dans })).status, 'not_allowed');
  assert.equal(rig.saved.length, 0);
  assert.equal(rig.cands.downloads().length, 0);
  rig.admin();
  const r = await rig.api.downloadCsv({ event, dans: copy.dans });
  assert.equal(r.status, 'ok');
  assert.equal(r.fileName, 'Summer-Star-Testing-results-2026-10-19.csv');
  assert.deepEqual(rig.saved.map((f) => f.fileName), [r.fileName]);
  const call = rig.calls.find(([n]) => n === 'star_results_csv');
  assert.deepEqual(call[1], { p_event_id: event.id, p_dan: null }); // the whole event (Q2 = A)
  assert.equal(call[2], undefined); // a POST: the function writes the download log
  const lines = parseCsv(r.text);
  assert.deepEqual(lines[0], ['Dan', 'Name', 'School', 'Stars from', 'Stars to', 'Date of birth', 'Email', 'Paying by', 'Paid',
    'Classes attended', 'Assistant classes', 'Total', 'Result', 'Needs', 'Result sent']);
  assert.equal(lines[0].length, 15);
  const body = lines.slice(1);
  assert.ok(body.every((l) => l.length === 15));
  const active = rig.snap().candidates.filter((c) => c.event_id === IDS.summer && c.status === 'active');
  assert.equal(body.length, active.length);
  assert.equal(r.rowCount, active.length);
  assert.equal(body.some((l) => l[1] === 'Casey Lund'), false); // withdrawn: left out
  // belt order: Dan, stars, Shrewsbury before Worcester, last name, first name
  const dans = body.map((l) => l[0]);
  assert.deepEqual(dans, [...dans].sort());
  const logged = rig.cands.downloads();
  assert.equal(logged.length, 1);
  assert.deepEqual([logged[0].event_id, logged[0].dan, logged[0].row_count, logged[0].downloaded_by_name], [IDS.summer, null, active.length, 'Test Admin']);
  // a download isn't a data change: no change_log row (S1)
  assert.equal(rig.snap().change_log.some((l) => l.table_name === 'star_downloads'), false);
  // the text starts with no BOM (csv.saveCsvFile adds it when it writes the file) and uses CRLF
  assert.equal(r.text.charCodeAt(0), 'D'.charCodeAt(0));
  assert.ok(r.text.endsWith('\r\n'));
  // a Dan-only call and the checks of the function itself
  assert.equal((await rig.client.rpc('star_results_csv', { p_event_id: event.id, p_dan: 0 })).data.status, 'invalid');
  assert.equal((await rig.client.rpc('star_results_csv', { p_event_id: event.id, p_dan: 9 })).data.status, 'invalid');
  assert.equal((await rig.client.rpc('star_results_csv', { p_event_id: randomUUID(), p_dan: null })).data.status, 'not_found');
  assert.equal((await rig.client.rpc('star_results_csv', { p_event_id: event.id, p_dan: 2 })).data.rows.every((x) => x.dan === 2), true);
  assert.equal((await rig.client.rpc('star_results_csv', { p_event_id: event.id, p_dan: null }, { get: true })).error.code, '25006'); // never a GET
  rig.lock();
  assert.equal((await rig.api.downloadCsv({ event, dans: copy.dans })).status, 'no_access');
});

await check('the CSV values (proposal 32): Dan label, paid date, paying by / No fee, total, needs / Admin chooses, result sent words', async () => {
  const rig = makeRig();
  const { event, copy } = await results(rig);
  const r = await rig.api.downloadCsv({ event, dans: copy.dans });
  const body = parseCsv(r.text).slice(1);
  const line = (name) => {
    const l = body.find((x) => x[1] === name);
    assert.ok(l, `no CSV line for ${name}`);
    return l;
  };
  // Morgan: paid at the desk 121 days ago; sent by Staff, then re-sent by Jeffrey Berg (the newest)
  assert.deepEqual(line('Morgan Hale'), ['1st Dan', 'Morgan Hale', 'Worcester', '1', '2', '2011-03-04', 'hale.family@example.com', 'Cash',
    '2026-06-20', '24', '18', '280', 'Passed', '', '2026-07-16 Jeffrey Berg']);
  assert.deepEqual(line('Lucas Grant').slice(7), ['Cash', '2026-07-06', '24', '18', '280', 'Passed', '', 'Not sent yet']);
  assert.deepEqual(line('Ella Moss').slice(11), ['277.5', 'Passed', '', 'Not sent yet (Make-up sent 2026-07-12)']);
  assert.deepEqual(line('Drew Park').slice(11), ['210', 'Make-up', 'Breaking, Knowledge', 'Not sent yet']);
  assert.deepEqual(line('Avery Lin').slice(0, 1).concat(line('Avery Lin').slice(12)), ['3rd Dan', 'Make-up', 'Admin chooses', 'Not sent yet']);
  assert.deepEqual(line('Taylor Quinn').slice(0, 1).concat(line('Taylor Quinn').slice(12)), ['2nd Dan', 'Make-up', 'Breaking', '2026-07-12 Staff']);
  assert.deepEqual(line('Ben Ward').slice(7), ['Cash', '', '20', '16', line('Ben Ward')[11], 'Not finished', '', '']); // not paid: blank
  assert.notEqual(line('Ben Ward')[11], ''); // a running total as the plain number
  assert.deepEqual(line('Zoe Bell').slice(7), ['Card', '2026-07-07', '', '', '', 'Testing privately', '', '']); // total blank while testing privately
  // a make-up row: "No fee"; a walk-in with no date of birth: blank (Fall's Sam Ortiz)
  const { event: fallEvent, copy: fallCopy } = await results(rig, 'fall');
  const fall = parseCsv((await rig.api.downloadCsv({ event: fallEvent, dans: fallCopy.dans })).text).slice(1);
  assert.equal(fall.find((x) => x[1] === 'Grace Liu')[7], 'No fee');
  assert.equal(fall.find((x) => x[1] === 'Sam Ortiz')[5], '');
  assert.equal(fall.filter((x) => x[1] === 'Ava Reed').length, 2);
  assert.equal(rig.saved.at(-1).fileName, 'Fall-Star-Testing-results-2026-10-19.csv');
});

await check('star_results_csv rows carry 0023\'s keys (candidate_id, paid_on, sent.result_status); Download CSV reads nothing else; look-alikes keep their own paid dates', async () => {
  const rig = makeRig();
  const { event, copy } = await results(rig);
  // the row shape, key for key, as 0023 section 7 builds it
  const answer = (await rig.client.rpc('star_results_csv', { p_event_id: event.id, p_dan: null })).data;
  assert.equal(answer.status, 'ok');
  for (const row of answer.rows) {
    assert.deepEqual(Object.keys(row).sort(), ['assistant_classes', 'candidate_id', 'classes_attended', 'dan', 'date_of_birth',
      'email_for_results', 'first_name', 'is_makeup', 'last_name', 'location_code', 'needs', 'paid', 'paid_cents', 'paid_on',
      'paying_by', 'result_status', 'sent', 'stars_from', 'stars_to', 'total']);
    if (row.sent !== null) assert.deepEqual(Object.keys(row.sent).sort(), ['marked_at', 'marked_by_name', 'matches', 'result_status']);
  }
  const ella = answer.rows.find((x) => x.first_name === 'Ella');
  assert.equal(ella.candidate_id, rig.snap().candidates.find((c) => c.event_id === IDS.summer && c.first_name === 'Ella').id);
  assert.equal(ella.sent.result_status, 'makeup'); // the earlier send was for a Make-up
  assert.equal(ella.sent.matches, false);
  // Download CSV makes ONE call: no star_roster / star_result_emails reads any more
  rig.calls.length = 0;
  assert.equal((await rig.api.downloadCsv({ event, dans: copy.dans })).status, 'ok');
  assert.deepEqual(rig.calls.map(([n]) => n), ['star_results_csv']);

  // paid_on = the newest payment that still counts: a reversed newer payment doesn't count, a refund
  // never changes it. Two look-alike candidates (Fall's Ava Reeds) each get their OWN date.
  const avas = rig.snap().candidates.filter((c) => c.event_id === IDS.fall && c.first_name === 'Ava' && c.last_name === 'Reed' && c.status === 'active');
  assert.equal(avas.length, 2);
  const [a1, a2] = avas;
  const pay = (id, cid, kind, cents, paidOn, at, reverses = null) => ({
    id, candidate_id: cid, kind, amount_cents: cents, method: 'cash', paid_on: paidOn, recorded_at: at,
    recorded_by: ADMIN_ID, recorded_by_name: 'Test Admin', reverses_payment_id: reverses,
  });
  rig.editStore((s) => {
    s.payments = s.payments.filter((p) => p.candidate_id !== a1.id && p.candidate_id !== a2.id);
    s.payments.push(
      pay(randomUUID(), a1.id, 'payment', 6500, '2026-09-01', '2026-09-01T14:00:00Z'),
      pay(randomUUID(), a1.id, 'refund', -1000, '2026-10-01', '2026-10-01T14:00:00Z'), // a later refund: no change
      pay(randomUUID(), a2.id, 'payment', 6500, '2026-09-20', '2026-09-20T14:00:00Z'),
    );
    const newer = pay(randomUUID(), a2.id, 'payment', 6500, '2026-10-05', '2026-10-05T14:00:00Z');
    s.payments.push(newer, pay(randomUUID(), a2.id, 'reversal', -6500, '2026-10-06', '2026-10-06T14:00:00Z', newer.id)); // reversed: doesn't count
  });
  const fallRows = (await rig.client.rpc('star_results_csv', { p_event_id: IDS.fall, p_dan: null })).data.rows;
  assert.equal(fallRows.find((x) => x.candidate_id === a1.id).paid_on, '2026-09-01');
  assert.equal(fallRows.find((x) => x.candidate_id === a2.id).paid_on, '2026-09-20');
  const { event: fallEvent, copy: fallCopy } = await results(rig, 'fall');
  const fall = parseCsv((await rig.api.downloadCsv({ event: fallEvent, dans: fallCopy.dans })).text).slice(1);
  const order = fallRows.filter((x) => x.first_name === 'Ava' && x.last_name === 'Reed').map((x) => (x.candidate_id === a1.id ? '2026-09-01' : '2026-09-20'));
  assert.deepEqual(fall.filter((x) => x[1] === 'Ava Reed').map((x) => x[8]), order);
  // its only payment reversed: nothing counts any more → paid_on null
  rig.editStore((s) => {
    const p = s.payments.find((x) => x.candidate_id === a1.id && x.kind === 'payment');
    s.payments.push(pay(randomUUID(), a1.id, 'reversal', -6500, '2026-10-07', '2026-10-07T14:00:00Z', p.id));
  });
  const after = (await rig.client.rpc('star_results_csv', { p_event_id: IDS.fall, p_dan: null })).data.rows.find((x) => x.candidate_id === a1.id);
  assert.equal(after.paid_on, null);
  assert.equal(after.paid, false);
});

await check('CSV safety: RFC 4180 quoting, the formula-injection guard (= + - @ tab CR), a typed formula in a name, the file name', async () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(280), '280');
  assert.equal(csvCell('Kim, Jordan'), '"Kim, Jordan"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell('=HYPERLINK("http://x","y")'), '"\'=HYPERLINK(""http://x"",""y"")"');
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-1+2'), "'-1+2");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('\t=1'), "'\t=1");
  assert.equal(csvCell('Breaking, Advanced Motion'), '"Breaking, Advanced Motion"');
  assert.equal(toCsv(['a', 'b'], [[1, '=x']]), "a,b\r\n1,'=x\r\n");
  // through the whole path: a family types a formula as a name on the public form
  const rig = makeRig();
  const { event, copy } = await results(rig);
  rig.editStore((s) => { s.candidates.find((c) => c.first_name === 'Lucas').last_name = '=cmd|calc'; });
  const r = await rig.api.downloadCsv({ event, dans: copy.dans });
  assert.ok(r.text.includes(',Lucas =cmd|calc,'));
  rig.editStore((s) => { s.candidates.find((c) => c.first_name === 'Lucas').first_name = '=Lucas'; });
  const r2 = await rig.api.downloadCsv({ event, dans: copy.dans });
  assert.ok(r2.text.includes(",'=Lucas =cmd|calc,"));
  // the file name (31): the event name with hyphens, "results", the download day; nothing doubled
  assert.equal(csvFileName('Fall 2026 Star Testing', '2026-11-16'), 'Fall-2026-Star-Testing-results-2026-11-16.csv');
  assert.equal(csvFileName('  Spring / Summer: Star   Testing? ', '2027-04-02'), 'Spring-Summer-Star-Testing-results-2027-04-02.csv');
  assert.equal(csvFileName('', '2027-04-02'), 'Star-testing-results-2027-04-02.csv');
  assert.equal(csvFileName('Mia’s Star Testing', '2027-04-02'), 'Mia’s-Star-Testing-results-2027-04-02.csv');
});

// =====================================================================================
// 4. The email (R2, R3, R11)
// =====================================================================================

await check('the email for all three kinds: blanks, a private testing, a D AND below, the subject, nothing private', async () => {
  const rig = makeRig();
  const res = await results(rig);
  const t = await rig.api.loadResultTexts();
  assert.equal(t.status, 'ok');
  assert.deepEqual(Object.keys(t.texts).sort(), ['makeup_below', 'makeup_d', 'passed']);
  const build = (first) => buildResultMessage({
    texts: t.texts, row: rowOf(res, first), eventName: res.event.name, testingDate: res.event.testingDate,
    danLabel: res.copy.dans.find((d) => d.dan === rowOf(res, first).dan).label,
  });
  const lucas = build('Lucas');
  assert.equal(lucas.status, 'ok');
  assert.equal(lucas.kind, 'passed');
  assert.equal(lucas.subject, 'Your star testing result — U.S.T.C.');
  assert.equal(lucas.body, 'Hello,\n\nLucas Grant passed the Summer Star Testing (1st Dan) on Saturday, July 11, 2026, with a total of 280 out of 315, and earns their first star. Congratulations, Lucas!\n\nThe pass mark is 245 out of 315, with no D in any subject.\n\nThank you for all the hard work. If you have any questions, please contact the school.\n\nJae H. Jeong’s U.S. Taekwondo Center\nWorcester and Shrewsbury');
  // a private student: the private day, and "their 2nd star"
  assert.ok(build('Ivy').body.includes('Ivy Cole passed the Summer Star Testing (1st Dan) at a private testing on Monday, July 13, 2026, with a total of 315 out of 315, and earns their 2nd star.'));
  // a D (no below): no note, and no space left at the end of the line
  const grace = build('Grace');
  assert.equal(grace.kind, 'makeup_d');
  assert.ok(grace.body.includes('Grace received a D in Two Step Sparring.\n\nWhat to work on: Two Step Sparring. Every other grade is kept.'));
  // a D AND below 245 (OPEN-12): the note, the D subjects joined "A and B"
  const sofia = build('Sofia');
  assert.equal(sofia.kind, 'makeup_d');
  assert.ok(sofia.body.includes('Sofia received a D in Breaking and Korean Terminology. Sofia’s total is also below the pass mark; only the D subjects are tested again.\n\nWhat to work on: Breaking and Korean Terminology.'));
  assert.ok(sofia.body.includes('with a total of 237.5 out of 315'));
  // below 245, subjects chosen
  const drew = build('Drew');
  assert.equal(drew.kind, 'makeup_below');
  assert.ok(drew.body.includes('Drew’s total is below the pass mark.\n\nWhat to work on: Breaking and Knowledge.'));
  // no email: an admin still has to choose; not finished; testing privately
  assert.deepEqual(build('Avery'), { status: 'no_email' });
  assert.deepEqual(build('Ben'), { status: 'no_email' });
  assert.deepEqual(build('Zoe'), { status: 'no_email' });
  assert.deepEqual(buildResultMessage({ texts: {}, row: rowOf(res, 'Lucas'), eventName: 'x', testingDate: '2026-07-11', danLabel: '1st Dan' }), { status: 'no_text' });
  // never another candidate, a date of birth, an email, a payment or a staff name
  for (const first of ['Lucas', 'Ivy', 'Grace', 'Sofia', 'Drew']) {
    const body = build(first).body;
    for (const banned of ['@', '2011-', '2012-', '$', 'Staff', 'Jeffrey', 'Morgan', '{', '}']) assert.equal(body.includes(banned), false, `${first}: ${banned}`);
  }
  // the 1-subject note wording; a single-D make-up's note when also below
  const one = { firstName: 'Noah', lastName: 'Chen', starsTo: 1, result: { status: 'makeup', makeupReasons: ['d', 'below'], dSubjects: ['Breaking'], needs: ['Breaking'], total: 227.5, passMark: 245, maxScore: 315, private: null } };
  const noah = buildResultMessage({ texts: t.texts, row: one, eventName: 'Fall 2026 Star Testing', testingDate: '2026-11-14', danLabel: '1st Dan' });
  assert.ok(noah.body.includes('Noah received a D in Breaking. Noah’s total is also below the pass mark; only the D subject is tested again.'));
  assert.ok(noah.body.includes('took the Fall 2026 Star Testing (1st Dan) on Saturday, November 14, 2026, with a total of 227.5 out of 315.'));
  // pieces
  assert.equal(longDate('2026-12-01'), 'Tuesday, December 1, 2026');
  assert.equal(starEarned(1), 'their first star');
  assert.equal(starEarned(2), 'their 2nd star');
  assert.equal(fillBlanks('a {x} b', { x: '' }), 'a b');
  assert.equal(fillBlanks('a. {x}\nb', { x: '' }), 'a.\nb');
  assert.equal(fillBlanks('{x} b', { x: '' }), 'b');
  assert.equal(fillBlanks('{total} {pass mark}', { total: '1', 'pass mark': '2' }), '1 2');
  assert.equal(resultKind({ status: 'makeup', makeupReasons: ['below'], needs: [], choiceNeeded: true }), null);
});

await check('mailto: holds ONLY the address and the fixed subject; odd addresses can\'t add anything', async () => {
  const link = mailtoFor('lucas.family@example.com');
  assert.equal(link, 'mailto:lucas.family@example.com?subject=Your%20star%20testing%20result%20%E2%80%94%20U.S.T.C.');
  const url = new URL(link);
  assert.equal(url.protocol, 'mailto:');
  assert.equal(url.pathname, 'lucas.family@example.com');
  assert.deepEqual([...url.searchParams.keys()], ['subject']);
  assert.equal(url.searchParams.get('subject'), RESULT_SUBJECT);
  assert.equal(mailtoFor('  lucas@example.com '), 'mailto:lucas@example.com?subject=Your%20star%20testing%20result%20%E2%80%94%20U.S.T.C.');
  const odd = mailtoFor('a?body=hi&cc=x@example.com');
  assert.equal(odd === null || (!odd.includes('&') && odd.indexOf('?') === odd.lastIndexOf('?subject=')), true);
  const odd2 = mailtoFor('a&cc=b@example.com');
  assert.ok(odd2.startsWith('mailto:a%26cc=b@example.com?subject='));
  assert.equal(new URL(odd2).searchParams.has('cc'), false);
  assert.equal(new URL(odd2).searchParams.has('body'), false);
  assert.equal(mailtoFor(''), null);
  assert.equal(mailtoFor(null), null);
  assert.equal(mailtoFor('not an address'), null);
  assert.equal(mailtoFor('a@b.com\nbcc: x@y.com'), null);
});

await check('loadEmailAddress: star_candidate_detail at the click, ONLY the address passed on; blank → no_email; not_found; no_access', async () => {
  const rig = makeRig();
  const res = await results(rig);
  const lucas = rowOf(res, 'Lucas');
  const r = await rig.api.loadEmailAddress(lucas.id);
  assert.deepEqual(r, { status: 'ok', email: 'grant.desk@example.com' }); // nothing else (no DOB, payments …)
  assert.deepEqual(rig.calls.at(-1), ['star_candidate_detail', { p_candidate_id: lucas.id }, undefined]);
  rig.editStore((s) => { s.candidates.find((c) => c.id === lucas.id).email_for_results = null; });
  assert.deepEqual(await rig.api.loadEmailAddress(lucas.id), { status: 'no_email' });
  assert.equal((await rig.api.loadEmailAddress(randomUUID())).status, 'not_found');
  assert.equal((await rig.api.loadEmailAddress(null)).status, 'invalid');
  rig.lock();
  assert.equal((await rig.api.loadEmailAddress(lucas.id)).status, 'no_access');
});

// =====================================================================================
// 5. The result email texts (migration 0023)
// =====================================================================================

// The 0023 seed texts, read from the migration file itself (E'…' strings: \n = line break, '' = ').
function sqlSeedTexts() {
  const sql = readFileSync(SQL_0023, 'utf8');
  const out = {};
  for (const m of sql.matchAll(/\('(passed|makeup_d|makeup_below)',\s*\r?\n\s*E'((?:[^']|'')*)'/g)) {
    out[m[1]] = m[2].replace(/''/g, "'").replace(/\\n/g, '\n');
  }
  return out;
}

await check('the starting texts are the migration\'s seed word for word, and every one passes the rules', async () => {
  const seed = sqlSeedTexts();
  assert.deepEqual(Object.keys(seed).sort(), ['makeup_below', 'makeup_d', 'passed']);
  for (const kind of Object.keys(seed)) {
    assert.equal(STARTING_TEXTS[kind], seed[kind], kind);
    assert.equal(resultTextProblem(kind, STARTING_TEXTS[kind]), null, kind);
    assert.ok(STARTING_TEXTS[kind].startsWith('Hello,\n\n')); // the empty-body guard (11)
  }
  // the preview database is seeded with the same texts (version 1, "Database admin")
  const rig = makeRig();
  const t = await rig.api.loadResultTexts();
  for (const kind of Object.keys(seed)) {
    assert.deepEqual([t.texts[kind].body, t.texts[kind].version, t.texts[kind].updatedByName], [seed[kind], 1, 'Database admin']);
  }
  // a locked session sees no rows → no_access; the login ids are never readable
  assert.equal(rig.cands.select('star_result_texts', 'id, created_by', [], [], rig.ctx).error.code, '42501');
  assert.equal(rig.cands.select('star_result_emails', 'id, marked_by', [], [], rig.ctx).error.code, '42501');
  assert.equal(rig.cands.select('star_grades', 'id, updated_by', [], [], rig.ctx).error.code, '42501');
  rig.lock();
  assert.equal((await rig.api.loadResultTexts()).status, 'no_access');
});

await check('the text rules give the SAME answers as star_result_text_problem — every case of 0023_tests.sql R3 and R5', async () => {
  const D = String.fromCharCode;
  const base = 'Hello, {total} of {pass mark}';
  // R3: every one of these is refused (invalid)
  const invalid = [
    [null, base], ['Passed', base], ['not_finished', base], ['passed', null], ['passed', ''],
    ['passed', `\n${base}`], ['passed', `   \n${base}`], ['passed', `${D(160)}\n${base}`],
    ['passed', base + 'x'.repeat(2001 - 29)], ['passed', `${base}${D(13)}${D(10)}Bye`], ['passed', `Hello,${D(9)}{total} of {pass mark}`],
    ['passed', base + D(127)], ['passed', base + D(8203)], ['passed', base + D(8238)], ['passed', base + D(65279)],
    ['passed', `${base} {frist name}`], ['passed', `${base} {dan}`], ['passed', 'Hello, { total } of {pass mark}'], ['passed', `${base} {}`],
    ['passed', `${base} {D subjects}`], ['passed', `${base} {subjects to work on}`], ['passed', `${base} {below-pass-mark note}`],
    ['makeup_d', `${base} {subjects to work on} {star earned}`], ['makeup_below', `${base} {subjects to work on} {star earned}`],
    ['makeup_below', `${base} {subjects to work on} {D subjects}`], ['makeup_below', `${base} {subjects to work on} {below-pass-mark note}`],
    ['passed', `${base} {first name`], ['passed', `${base} first name}`], ['passed', 'Hello, {{total}} of {pass mark}'],
    ['passed', 'Hello, of {pass mark}'], ['passed', 'Hello, {total} of'], ['makeup_d', 'Hello, of {pass mark}, {subjects to work on}'],
    ['makeup_d', 'Hello, {total} of {pass mark}, {D subjects}'], ['makeup_below', 'Hello, {total}, {subjects to work on}'],
    ['makeup_below', 'Hello, {total} of {pass mark}'],
  ];
  assert.equal(invalid.length, 35);
  for (const [kind, body] of invalid) assert.notEqual(resultTextProblem(kind, body), null, `${kind}: ${JSON.stringify(body)}`);
  // R5: the exact codes
  const codes = [
    ['makeup_d', null, 'empty'], ['x', 'Hello', 'kind'], ['passed', '', 'empty'], ['passed', 'x'.repeat(2001), 'too_long'],
    ['passed', `a${D(13)}`, 'bad_character'], ['passed', ' \n{total} {pass mark}', 'first_line'], ['passed', 'Hi {Total} {total} {pass mark}', 'unknown_blank'],
    ['passed', 'Hi {D subjects} {total} {pass mark}', 'blank_not_for_kind'], ['passed', 'Hi {total} {pass mark} }', 'stray_brace'],
    ['passed', 'Hi {total}', 'missing_required'], ['makeup_d', 'Hi {total} {pass mark}', 'missing_required'],
    ['makeup_below', 'Hi {total} {pass mark}', 'missing_required'], ['passed', 'Hi {total} {pass mark}', null],
    ['makeup_d', 'Hi {total} {pass mark} {subjects to work on}', null], ['makeup_below', 'Hi\n\n{total} {pass mark} {subjects to work on}\n', null],
  ];
  for (const [kind, body, code] of codes) assert.equal(resultTextProblem(kind, body), code, `${kind}: ${JSON.stringify(body)}`);
  // R4's accepted texts: exactly 2,000 characters, every blank of a kind, typographic marks
  assert.equal(resultTextProblem('passed', base + 'x'.repeat(2000 - 29)), null);
  assert.equal(resultTextProblem('passed', 'Hello,\n\n{full name} — {event} ({Dan}) {testing day}: {total} / {max}, pass {pass mark}, {star earned}. We’ll see you, {first name}!'), null);
  assert.equal(resultTextProblem('makeup_d', '{first name} {full name} {event} {Dan} {testing day} {total} {pass mark} {max} {D subjects} {subjects to work on} {below-pass-mark note}'), null);
  // the length is counted in characters (code points), like char_length: an emoji is ONE
  assert.equal(resultTextProblem('passed', base + '😀'.repeat(2000 - 29)), null);
  assert.equal(resultTextProblem('passed', base + '😀'.repeat(2001 - 29)), 'too_long');
  // the 0023 tests file still has the cases this check copies (so a change there is noticed)
  const tests = readFileSync(TESTS_0023, 'utf8');
  for (const label of ['first line no-break sp', 'double braces', 'below no subjects', 'direction override']) assert.ok(tests.includes(label), label);
  // the editor's details and messages (48)
  assert.deepEqual(resultTextProblemDetail('passed', `${base} {frist name}`), { code: 'unknown_blank', blank: 'frist name' });
  assert.equal(T.resultTextProblemText(resultTextProblemDetail('passed', `${base} {frist name}`)), '{frist name} isn’t one of the blanks. Check the spelling, or pick one below.');
  assert.equal(T.resultTextProblemText(resultTextProblemDetail('passed', `${base} {D subjects}`)), '{D subjects} only works in a Make-up with a D email.');
  assert.equal(T.resultTextProblemText(resultTextProblemDetail('makeup_below', base)), 'A make-up email has to say what to work on. Add {subjects to work on}.');
  for (const [kind, body] of invalid) assert.equal(typeof T.resultTextProblemText(resultTextProblemDetail(kind, body)), 'string');
  assert.deepEqual(BLANKS_BY_KIND.passed.length, 9);
  assert.deepEqual(BLANKS_BY_KIND.makeup_d.length, 11);
  assert.deepEqual(BLANKS_BY_KIND.makeup_below.length, 9);
});

await check('star_set_result_text: admins only, invalid (the same rules, before stale), stale, ok + version + history, same text writes nothing, Undo', async () => {
  const rig = makeRig();
  assert.deepEqual(RESULTS_RPC_ARGS.star_set_result_text.map(([n]) => n), ['p_kind', 'p_expected_version', 'p_body']);
  const rpc = async (kind, version, body) => (await rig.client.rpc('star_set_result_text', { p_kind: kind, p_expected_version: version, p_body: body })).data;
  const start = (await rig.api.loadResultTexts()).texts.makeup_d;
  const changed = STARTING_TEXTS.makeup_d.replace('Every other grade is kept.', 'Every other grade stays.');
  rig.lock();
  assert.deepEqual(await rpc('makeup_d', 1, changed), { status: 'no_access' });
  rig.unlock();
  rig.staff();
  assert.deepEqual(await rpc('makeup_d', 1, changed), { status: 'not_allowed' });
  assert.equal((await rig.api.setResultText({ kind: 'makeup_d', expectedVersion: 1, body: changed })).status, 'not_allowed');
  rig.admin();
  // the database's own refusals (straight to the function), in its order
  assert.deepEqual(await rpc('makeup_d', 1, '{frist name}'), { status: 'invalid' });
  assert.deepEqual(await rpc('makeup_d', 99, '{frist name}'), { status: 'invalid' }); // invalid before stale
  assert.deepEqual(await rpc(null, 1, changed), { status: 'invalid' });
  assert.deepEqual(await rpc('makeup_d', null, changed), { status: 'invalid' });
  assert.deepEqual(await rpc('makeup_d', 2, changed), { status: 'stale' });
  assert.deepEqual(await rpc('makeup_d', 0, changed), { status: 'stale' });
  // the API doesn't even send a text that breaks the rules
  const before = rig.calls.length;
  assert.equal((await rig.api.setResultText({ kind: 'makeup_d', expectedVersion: 1, body: 'no blanks' })).status, 'invalid');
  assert.equal(rig.calls.length, before);
  // ok: version + 1, the text exactly as sent, logged before → after
  const ok = await rig.api.setResultText({ kind: 'makeup_d', expectedVersion: start.version, body: changed });
  assert.deepEqual(ok, { status: 'ok', version: 2, body: changed });
  const log = rig.snap().change_log.filter((l) => l.table_name === 'star_result_texts');
  assert.equal(log.length, 1);
  assert.deepEqual([log[0].action, log[0].op, log[0].before.body, log[0].after.body, log[0].before.version, log[0].after.version, log[0].location_code],
    ['star_set_result_text', 'update', STARTING_TEXTS.makeup_d, changed, 1, 2, null]);
  // the same text again: ok, nothing written, nothing logged
  assert.deepEqual(await rig.api.setResultText({ kind: 'makeup_d', expectedVersion: 2, body: changed }), { status: 'ok', version: 2, body: changed });
  assert.equal(rig.snap().change_log.filter((l) => l.table_name === 'star_result_texts').length, 1);
  // Undo = the old text saved back with the new version
  assert.deepEqual(await rig.api.setResultText({ kind: 'makeup_d', expectedVersion: 2, body: STARTING_TEXTS.makeup_d }), { status: 'ok', version: 3, body: STARTING_TEXTS.makeup_d });
  const after = (await rig.api.loadResultTexts()).texts.makeup_d;
  assert.deepEqual([after.body, after.version, after.updatedByName], [STARTING_TEXTS.makeup_d, 3, 'Test Admin']);
  // the text is stored exactly as typed (no trimming) and a changed text never changes "Sent" (52)
  const spaced = `${STARTING_TEXTS.passed}  \n`;
  assert.equal((await rig.api.setResultText({ kind: 'passed', expectedVersion: 1, body: spaced })).status, 'ok');
  assert.equal((await rig.api.loadResultTexts()).texts.passed.body, spaced);
  assert.equal(sentLine(rowOf(await results(rig), 'Morgan')).kind, 'sent');
  // a missing row (only possible outside the app) → not_found
  rig.editStore((s) => { s.result_texts = s.result_texts.filter((x) => x.kind !== 'makeup_below'); });
  assert.deepEqual(await rpc('makeup_below', 1, STARTING_TEXTS.makeup_below), { status: 'not_found' });
});

await check('the fake: every results write is a POST-only write, failNextSave reaches it, an older store gets the texts added', async () => {
  const rig = makeRig();
  assert.deepEqual(STAR_RESULTS_RPC_NAMES, ['star_mark_result_sent', 'star_undo_result_sent', 'star_results_csv', 'star_set_result_text']);
  const res = await results(rig);
  const lucas = rowOf(res, 'Lucas');
  const get = await rig.client.rpc('star_mark_result_sent', { p_candidate_id: lucas.id, p_expected_result_key: lucas.result.resultKey }, { get: true });
  assert.equal(get.error.code, '25006');
  rig.cands.failNextSave();
  const failed = await rig.api.markSent({ candidateId: lucas.id, resultKey: lucas.result.resultKey });
  assert.equal(failed.status, 'error');
  assert.equal(sentLine(rowOf(await results(rig), 'Lucas')).kind, 'not_sent'); // nothing changed
  // a store saved before phase 6 (no texts, no download log) gets them on the next read, nothing else changes
  const countBefore = rig.snap().candidates.length;
  rig.editStore((s) => { delete s.result_texts; delete s.downloads; });
  const t = await rig.api.loadResultTexts();
  assert.equal(t.status, 'ok');
  assert.equal(Object.keys(t.texts).length, 3);
  assert.equal(rig.snap().candidates.length, countBefore);
  assert.deepEqual(rig.snap().downloads, []);
});

console.log(`ALL STAR RESULTS CHECKS PASSED (${count} checks)`);
