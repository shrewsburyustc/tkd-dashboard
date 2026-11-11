// checks.mjs — automatic checks for the Black Belt data layer (phases B1 and B2). Run:
//   node src/lib/blackBelt/checks.mjs
// Why it exists: rules.js, money.js, the preview database (mockBlackBelt.js) and the family form's
// preview stand-in (publicApi.preview.js) carry rules that must match migration 0016 exactly.
// These plain `assert` checks run in well under a second without a browser or a database, and
// print ALL BLACK BELT LIB CHECKS PASSED (contracts 0016-B1 §5 and 0016-B2 §5). They replay the
// database test cases (0016_tests.sql T3–T8) that don't need real sign-in sessions, check that
// startingPoint.js holds exactly the migration's seed, and check that no preview function ever
// changes or removes a payment row (payments are append-only).
// Migration 0025 (grading and results, contract 0025 §13.3) adds: every case of the shared
// supabase/tests/0025_grading_cases.json through grading.js (and, when PGlite saved them, a
// key-by-key comparison with the SQL's own answers), the mockup cast, the number formats and
// words, resultEmail.js (the text rules, the seed, the blanks, the CSV), and the preview store's
// new functions: one check per new status, the privacy of every read, Q-G1, S2, Q-G3, Q-G4,
// make-ups, Mark as sent and the purge's kept age.
// Migration 0024 (the rubric editor, contract 0024 §10.2) adds: the v1 → v2 conversion keeps every
// number (rubricDefault.js = rubricFromV1 of the starting point, with the CP1-approved numbers
// typed in), the maxima, the validator (rubric.js danProblems) against its own cases and the
// shared supabase/tests/0024_rubric_cases.json, the editing helpers, and the preview store's
// rubric rules (saves, 15-second undos, the lock at first opening, first opening admin-only).
// Migration 0032 adds: the store's 5-minute time rule, bb_candidate_history (the history rows the
// preview writes like the real log triggers: masks, own rows only, newest first, who may read it)
// and bb_undo_cycle_edit (its refusals, 'registered' after a family registration, and the switch
// and the values together or not at all).
// Design review BB8 (+ migration 0034's record_id) adds: the History line's grouping and words
// (historyWords.js) on made-up rows and on the preview store's own history.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parsePrice, priceIsValid, PRICE_MAX_CENTS, PRICE_MIN_CENTS, parseAmount, formatCents, amountInputText } from './money.js';
import {
  cycleState, cycleTag, timeIsValid, TIME_OPTIONS, timeLabel, timeRangeLabel, dayProblems, partsWithoutDay, cycleFormProblems,
  hasProblems, followApplicationDue, setPaymentDueDate, buildAddPayload, buildUpdatePayload, cycleToForm, planTotals,
  kukkiwonRange, ageOn, isUnder18OnFirstDay, scheduleFor, planSummary, emailIsValid, codeIsValid, waiverVersionOk,
  nextWaiverVersionName, waiverBodyProblem, keepYearsProblem, purgeDueOn, addYears, placeProblem, findDuplicateCycle,
  partsAlsoOnOtherDays, effectiveDueOn, PARTS, FIRST_TIME, LAST_TIME, TIME_STEP_MINUTES,
  candidateItems, candidateMoney, liveLines, hasLivePayment, cycleCandidateItems, predictMoney, dueNowItems, nextItems, defaultTicks,
  sumRemaining, rosterCards, rosterFilter, searchMatches, duplicatePairs, pairReturnedLines,
} from './rules.js';
import { blackBeltLink, qrSvgDataUrl } from './qr.js';
import { qrFileName, qrPngBlob, qrSvgDataUrl as sharedQrSvgDataUrl } from '../qr.js'; // the shared QR helper (BB10)
import { formatDollars, formatMoney } from '../money.js';
import { timeOptions } from '../times.js'; // the shared time list's choices (BB13)
import {
  STARTING_POINT_SCHEDULE, STARTING_POINT_REQUIREMENTS, STARTING_POINT_NAME, SEED_WAIVER_BODY, SEED_WAIVER_VERSION_NAME,
} from './startingPoint.js';
import { todayInSchoolTime } from '../testing/eventRules.js';
import { createBlackBeltBackend, BB_RPC_NAMES, BB_WRITE_RPC_NAMES, BB_TABLES, BB_STORE_KEY } from './mockBlackBelt.js';
import {
  danProblems, problemCodes, rubricProblems, rubricIsValid, rubricFromV1, md5Hex, workedPoints, partMax, mostPoints, partMaxByBracket,
  bracketLabel, handedIn, normalizeDan, splitBracket, removeBracket, splitBrackets, copyFromDan, danDiff, newSubjectId, freshCopy,
  rubricPublic, putDan, stripStamps, sameDanContent, numOk, intOk, round2, rubricNameOk, rubricTextOk, subjectCountsFor,
  SHORT_LETTERS, LONG_LETTERS, CUTOFF_LETTERS, RUBRIC_PART_CODES, RUBRIC_UNDO_WINDOW_MS,
} from './rubric.js';
import { DEFAULT_RUBRIC } from './rubricDefault.js';
import { cycleDateYears, dobYears, dueKey, formDobYears, lastTestingDay, notBeforeToday, pastHint, savedDueDates, testingDayMin, yearRange } from './dateLimits.js';
import { canOpenRegistration, deskSchoolCode, deskSchoolArg, compareDanSchoolName, sortWorcesterFirst, sortMakeupPicker } from './rules.js';
import {
  gradeResult, keptMatch, ageGroups, ageGroupOf, measuredLetter, extraPoints, resultKey, resultKeyInput, trimScaleText, WITHDRAWN_RESULT_KEY,
  RESULT_KEYS, RESULT_SUBJECT_KEYS, danSubjects, subjectNames, minutesFromText, minutesText, parseMeasured, formatMeasured, feetAndInches,
  unitShort, cutoffWords, reachedWords, startingTicks, bestCase, leftWords, notFinishedWords, MEASURED_RANGE_MESSAGE,
} from './grading.js';
import {
  RESULT_KINDS, STARTING_TEXTS, resultTextProblem, resultTextProblemDetail, blankValues, buildResultMessage, resultKind, mailtoFor,
  csvFileName, csvRows, csvText, csvCell, CSV_COLUMNS,
} from './resultEmail.js';
// BB8: the History line's grouping and words (pure; they import only the staff words and grading.js)
import { groupHistory, describeEntry } from '../../blackBelt/staff/candidates/historyWords.js';
import { editValuesToSave, canRecordPayment, restoreHasUndo } from '../../blackBelt/staff/candidates/checks.js';
import * as StaffWords from '../../blackBelt/staff/text.js'; // the Candidates words (R3-01, R3-09, R4-14 checks)
import * as ResultsWords from '../../blackBelt/staff/results/text.js'; // the Cycles / Rubric / Results checks (pass 1 shared parts)
import * as GradingWords from '../../blackBelt/staff/grading/text.js';
import * as SharedWords from '../../components/text.js';

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

// ======================= startingPoint.js = the migration's seed =======================

check('startingPoint.js = the $bbjson$ and $bbwaiver$ blocks of 0016_black_belt.sql', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/0016_black_belt.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const blocks = [...sql.matchAll(/\$bbjson\$([\s\S]*?)\$bbjson\$/g)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2, 'the migration has exactly two $bbjson$ blocks');
  assert.deepEqual(STARTING_POINT_SCHEDULE, blocks[0]);
  assert.deepEqual(STARTING_POINT_REQUIREMENTS, blocks[1]);
  const waiver = /\$bbwaiver\$([\s\S]*?)\$bbwaiver\$/.exec(sql);
  assert.ok(waiver, 'the migration has the $bbwaiver$ block');
  // The tab "Rubric and prices" is now "Rubric and waiver" (v1.023, design review BB17). The applied
  // migration's placeholder waiver keeps the old tab name (applied migrations aren't changed); the
  // preview's copy names the new tab. Otherwise the two texts are the same.
  assert.ok(SEED_WAIVER_BODY.includes('saved on Rubric and waiver'));
  assert.equal(SEED_WAIVER_BODY.replace('Rubric and waiver', 'Rubric and prices'), waiver[1]);
  assert.ok(sql.includes(`select '${SEED_WAIVER_VERSION_NAME}', $bbwaiver$`));
  assert.ok(SEED_WAIVER_BODY.startsWith('PLACEHOLDER'));
  assert.ok(sql.includes(`'prices_from', '${STARTING_POINT_NAME}'`), 'bb_cycle_defaults names the starting point the same');
  // the Fall 2026 values of contract 0016 §3
  assert.deepEqual(STARTING_POINT_SCHEDULE.days.map((d) => [d.name, d.day_date, d.start_time, d.end_time, d.parts.join()]), [
    ['Physical', '2026-09-26', '12:30', '14:30', 'physical'],
    ['Technical', '2026-10-24', '12:30', '15:30', 'technical'],
    ['Curriculum', '2026-11-21', '14:00', '17:00', 'curriculum'],
  ]);
  assert.deepEqual(STARTING_POINT_SCHEDULE.kukkiwon, { 1: 10000, 2: 11000, 3: 14000, 4: 17000 });
  assert.deepEqual(STARTING_POINT_SCHEDULE.plans.map((p) => p.name), ['In full', '3 payments']);
  assert.equal(STARTING_POINT_REQUIREMENTS.schema_version, 1);
  assert.deepEqual(STARTING_POINT_REQUIREMENTS.dans.map((d) => d.dan), [1, 2, 3, 4]);
});

// ======================= money.js =======================

// ======================= dateLimits.js: the calendars' limits (v1.018, BB12) =======================

check('dateLimits: each date calendar grays only what its save rule refuses', () => {
  const today = '2027-04-26';
  // today or later; a saved past date stays choosable (the earlier of the two)
  assert.equal(notBeforeToday(today), today);
  assert.equal(notBeforeToday(today, '2027-03-01'), '2027-03-01');
  assert.equal(notBeforeToday(today, '2027-05-01'), today);
  assert.equal(notBeforeToday(today, ''), today);
  // the testing day: + not before the first day once grading started (unless the date is locked)
  assert.equal(testingDayMin(today), today);
  assert.equal(testingDayMin(today, '2027-04-01'), '2027-04-01');
  assert.equal(testingDayMin(today, null, { minDate: '2027-05-08', dateLocked: false }), '2027-05-08');
  assert.equal(testingDayMin(today, null, { minDate: '2027-04-10', dateLocked: false }), today);
  assert.equal(testingDayMin(today, '2027-04-01', { minDate: '2027-04-10', dateLocked: true }), '2027-04-01');
  // Application due / Submissions due: up to the last testing day
  assert.equal(lastTestingDay([{ date: '2027-06-05' }, { date: '' }, { date: '2027-05-08' }]), '2027-06-05');
  assert.equal(lastTestingDay([]), null);
  assert.equal(lastTestingDay(undefined), null);
  // the hint only while the first day really is today or later
  assert.equal(pastHint(today, today, 'H'), 'H');
  assert.equal(pastHint(today, '2027-05-08', 'H'), 'H');
  assert.equal(pastHint(today, '2027-03-27', 'H'), '');
  // the saved due dates: one map for the calendar and the save rule (a payment without a number
  // counts by its place, as cycleFormProblems does)
  const saved = savedDueDates([
    { id: 'p1', payments: [{ paymentNo: 1, dueOn: '2027-03-27' }, { paymentNo: 2, dueOn: '2027-04-24' }] },
    { id: 'p2', payments: [{ dueOn: '2027-03-01' }, { dueOn: '2027-05-29' }] },
  ]);
  assert.equal(saved.get(dueKey('p1', 2)), '2027-04-24');
  assert.equal(saved.get(dueKey('p2', 1)), '2027-03-01');
  assert.equal(saved.get(dueKey('p2', 2)), '2027-05-29');
  assert.equal(savedDueDates(null).size, 0);
  // …and the save rule agrees with it: the saved past date passes, another past date doesn't
  const editForm = (due) => ({
    name: 'X', applicationDue: '2027-03-27', submissionsDue: '2027-05-29', days: [],
    plans: [{ id: 'p2', name: 'Two', amounts: {}, payments: [{ dueOn: due }, { dueOn: '2027-05-29' }] }],
  });
  const original = { plans: [{ id: 'p2', payments: [{ dueOn: '2027-03-01' }, { dueOn: '2027-05-29' }] }] };
  const dueCode = (due) => cycleFormProblems(editForm(due), { today, mode: 'edit', original }).plans?.[0]?.payments?.[0]?.dueOn ?? null;
  assert.equal(dueCode('2027-03-01'), null);
  assert.equal(dueCode('2027-03-02'), 'past');
  // Year lists
  assert.deepEqual(yearRange(2026, 2028, [2030, 2027, null]), [2026, 2027, 2028, 2030]);
  assert.deepEqual(cycleDateYears(today), [2027, 2028, 2029]);
  assert.deepEqual(cycleDateYears(today, { max: '2027-06-05' }), [2027]);
  assert.deepEqual(cycleDateYears(today, { min: '2026-11-01', value: '2026-11-03' }), [2026, 2027, 2028, 2029]);
  assert.deepEqual(cycleDateYears(null), []);
  const staffYears = dobYears(today);
  assert.equal(staffYears.length, 81);
  assert.deepEqual([staffYears[0], staffYears.at(-1)], [1947, 2027]);
  const formYears = formDobYears(today);
  assert.equal(formYears.length, 101);
  assert.deepEqual([formYears[0], formYears.at(-1)], [1927, 2027]);
});

check('money: parsePrice ($1–$5,000, whole dollars)', () => {
  assert.equal(PRICE_MIN_CENTS, 100);
  assert.equal(PRICE_MAX_CENTS, 500000);
  assert.deepEqual(parsePrice('$0'), { problem: 'tooLow' });
  assert.deepEqual(parsePrice('0'), { problem: 'tooLow' });
  assert.deepEqual(parsePrice('$1'), { cents: 100 });
  assert.deepEqual(parsePrice('$5,000'), { cents: 500000 });
  assert.deepEqual(parsePrice('5000'), { cents: 500000 });
  assert.deepEqual(parsePrice('$5,001'), { problem: 'tooHigh' });
  assert.deepEqual(parsePrice('$290.50'), { problem: 'notWhole' });
  assert.deepEqual(parsePrice('290.00'), { cents: 29000 });
  assert.deepEqual(parsePrice(' $2,700 '), { cents: 270000 });
  assert.deepEqual(parsePrice(''), { problem: 'empty' });
  assert.deepEqual(parsePrice(null), { problem: 'empty' });
  assert.deepEqual(parsePrice('abc'), { problem: 'notNumber' });
  assert.deepEqual(parsePrice('-5'), { problem: 'notNumber' });
  assert.deepEqual(parsePrice('2 90'), { problem: 'notNumber' });
});

check('money: priceIsValid = bb_price_is_valid', () => {
  for (const ok of [100, 29000, 500000]) assert.equal(priceIsValid(ok), true, ok);
  for (const bad of [0, 99, 150, 29050, 500100, -100, null, '29000', 290.5]) assert.equal(priceIsValid(bad), false, bad);
});

// ======================= rules.js: times =======================

check('rules: time rule (06:00–22:00, 5-minute steps)', () => {
  assert.equal(timeIsValid('07:45'), true);
  assert.equal(timeIsValid('22:15'), false); // after 10 PM
  assert.equal(timeIsValid('10:10'), true); // 5-minute steps since 0032 (BB13)
  assert.equal(timeIsValid('10:07'), false); // not on a 5-minute step
  assert.equal(timeIsValid('06:00'), true);
  assert.equal(timeIsValid('22:00'), true);
  assert.equal(timeIsValid('05:45'), false);
  assert.equal(timeIsValid('12:30:00'), true);
  assert.equal(timeIsValid('12:30:15'), false); // seconds
  assert.equal(timeIsValid('25:00'), false);
  assert.equal(timeIsValid(''), false);
  assert.equal(timeIsValid(null), false);
  assert.equal(TIME_OPTIONS.length, 193);
  assert.equal(TIME_OPTIONS[0], '06:00');
  assert.equal(TIME_OPTIONS[TIME_OPTIONS.length - 1], '22:00');
  assert.ok(TIME_OPTIONS.every(timeIsValid));
  // the testing day dialog's list (the shared TimeList) offers exactly these times (BB13)
  assert.deepEqual(timeOptions({ from: FIRST_TIME, to: LAST_TIME, step: TIME_STEP_MINUTES }).map((o) => o.value), TIME_OPTIONS);
  assert.equal(timeLabel('14:30'), '2:30 PM');
  assert.equal(timeLabel('12:00'), '12:00 PM');
  assert.equal(timeRangeLabel('12:30', '14:30'), '12:30–2:30 PM');
  assert.equal(timeRangeLabel('11:30', '12:30'), '11:30 AM–12:30 PM');
  assert.equal(timeRangeLabel('x', '12:30'), '');
});

// ======================= rules.js: cycle state and tags (T4e dates) =======================

// Spring 2027: Application due Mar 27; days Apr 3, May 1, Jun 5.
const SPRING_DAYS = [{ date: '2027-04-03' }, { date: '2027-05-01' }, { date: '2027-06-05' }];
const openCycle = { registrationOpen: true, autoClose: true, applicationDue: '2027-03-27', firstOpenedAt: '2027-02-01T15:00:00Z' };

check('rules: cycleState on the T4e dates', () => {
  const at = (today, cycle = openCycle) => cycleState(cycle, SPRING_DAYS, today);
  // on Application due: still open
  assert.deepEqual(at('2027-03-27'), {
    state: 'open', registration: 'open', past: false, testingToday: false, firstDay: '2027-04-03', lastDay: '2027-06-05',
    nextDay: '2027-04-03', publicStatus: 'open', closedOn: null,
  });
  // the day after: closed by the date
  const after = at('2027-03-28');
  assert.equal(after.state, 'closed_by_date');
  assert.equal(after.publicStatus, 'closed');
  assert.equal(after.closedOn, '2027-03-27');
  // a testing day (after Application due, auto close on, switch on): the day tag only — the form stays closed
  const day1 = at('2027-04-03');
  assert.equal(day1.state, 'testing_today');
  assert.equal(day1.testingToday, true);
  assert.equal(day1.registration, 'closed_by_date');
  assert.equal(day1.publicStatus, 'closed');
  assert.equal(day1.closedOn, '2027-03-27');
  // between testing days
  const between = at('2027-04-20');
  assert.equal(between.state, 'closed_by_date');
  assert.equal(between.nextDay, '2027-05-01');
  // the last day, then the day after it
  assert.equal(at('2027-06-05').state, 'testing_today');
  const past = at('2027-06-06');
  assert.equal(past.state, 'past');
  assert.equal(past.past, true);
  assert.equal(past.publicStatus, 'finished');
  assert.equal(past.closedOn, null);
  assert.equal(past.nextDay, null);
  // reopened by an admin after the date (auto close turned off) → open on a testing day too
  assert.equal(at('2027-04-03', { ...openCycle, autoClose: false }).publicStatus, 'open');
  // never opened / closed by hand
  assert.equal(at('2027-02-15', { registrationOpen: false, autoClose: true, applicationDue: '2027-03-27', firstOpenedAt: null }).state, 'not_open_yet');
  assert.equal(at('2027-02-15', { registrationOpen: false, autoClose: true, applicationDue: '2027-03-27', firstOpenedAt: 'x' }).publicStatus, 'closed');
  assert.equal(at('2027-02-15', { registrationOpen: false, autoClose: true, applicationDue: '2027-03-27', firstOpenedAt: null }).publicStatus, 'not_open');
  // snake_case rows work too
  assert.equal(cycleState({ registration_open: true, auto_close: true, application_due: '2027-03-27', first_opened_at: 'x' },
    SPRING_DAYS.map((d) => ({ day_date: d.date })), '2027-03-01').state, 'open');
});

check('rules: cycleTag', () => {
  const tag = (today, cycle = openCycle) => cycleTag({ ...cycle, state: cycleState(cycle, SPRING_DAYS, today) }, today);
  assert.deepEqual(tag('2027-03-27'), { kind: 'open_until', date: '2027-03-27' });
  assert.deepEqual(tag('2027-03-01', { ...openCycle, autoClose: false }), { kind: 'open', date: null });
  assert.deepEqual(tag('2027-03-28'), { kind: 'registration_closed', date: null }); // before the first day
  assert.deepEqual(tag('2027-04-03'), { kind: 'testing_today', date: null });
  assert.deepEqual(tag('2027-04-20'), { kind: 'next_day', date: '2027-05-01' }); // after the first day
  assert.deepEqual(tag('2027-06-06'), { kind: 'past', date: null });
  assert.deepEqual(tag('2027-02-15', { ...openCycle, registrationOpen: false, firstOpenedAt: null }), { kind: 'not_open_yet', date: null });
  assert.deepEqual(tag('2027-02-15', { ...openCycle, registrationOpen: false }), { kind: 'registration_closed', date: null });
});

// ======================= rules.js: testing days and the cycle form =======================

const TODAY = '2027-02-15';
const goodDay = (over = {}) => ({
  id: null, name: 'Physical', date: '2027-04-03', start: '12:30', end: '14:30', place: { code: 'worcester' },
  second: { start: '14:30', end: '15:30', place: { other: 'Horgan Arena, 403 Oxford St N, Auburn MA 01501' } }, parts: ['physical'], ...over,
});
const goodForm = () => ({
  name: 'Spring 2027', applicationDue: '2027-03-27', submissionsDue: '2027-05-29', autoClose: true, registrationOpen: false,
  days: [goodDay(),
    goodDay({ name: 'Technical', date: '2027-05-01', end: '15:30', place: { code: 'shrewsbury' }, second: null, parts: ['technical'] }),
    goodDay({ name: 'Curriculum', date: '2027-06-05', start: '14:00', end: '17:00', place: { code: 'shrewsbury' }, second: null, parts: ['curriculum'] })],
  plans: [
    { key: 'a', id: null, name: 'In full', payments: [{ paymentNo: 1, dueOn: '2027-03-27', followsApplicationDue: true }], amounts: { 1: [87000], 2: [99000], 3: [150000], 4: [270000] } },
    { key: 'b', id: null, name: '3 payments', payments: [
      { paymentNo: 1, dueOn: '2027-03-27', followsApplicationDue: true }, { paymentNo: 2, dueOn: '2027-04-24', followsApplicationDue: false },
      { paymentNo: 3, dueOn: '2027-05-29', followsApplicationDue: false }],
    amounts: { 1: [29000, 29000, 29000], 2: [33000, 33000, 33000], 3: [50000, 50000, 50000], 4: [90000, 90000, 90000] } },
  ],
  kukkiwon: { 1: 10000, 2: 11000, 3: 14000, 4: 17000 },
  pricesFrom: STARTING_POINT_NAME,
});

check('rules: dayProblems', () => {
  assert.deepEqual(dayProblems(goodDay(), { today: TODAY }), {});
  assert.deepEqual(dayProblems(goodDay({ date: '2027-02-14' }), { today: TODAY }), { date: 'past' });
  assert.deepEqual(dayProblems(goodDay({ date: '2027-02-14' }), { today: TODAY, originalDate: '2027-02-14' }), {}); // kept saved date
  assert.deepEqual(dayProblems(goodDay({ date: '' }), { today: TODAY }), { date: 'missing' });
  assert.deepEqual(dayProblems(goodDay({ end: '12:00' }), { today: TODAY }), { end: 'notAfterStart' }); // end before start
  assert.deepEqual(dayProblems(goodDay({ start: '07:45', end: '08:00', second: null }), { today: TODAY }), {});
  assert.deepEqual(dayProblems(goodDay({ end: '22:15' }), { today: TODAY }), { end: 'badTime' });
  assert.deepEqual(dayProblems(goodDay({ start: '10:07' }), { today: TODAY }), { start: 'badTime' }); // off the 5-minute step
  assert.deepEqual(dayProblems(goodDay({ start: '10:10' }), { today: TODAY }), {}); // on it (BB13)
  assert.deepEqual(dayProblems(goodDay({ name: '  ' }), { today: TODAY }), { name: 'empty' });
  assert.deepEqual(dayProblems(goodDay({ place: null }), { today: TODAY }), { place: 'missing' });
  assert.deepEqual(dayProblems(goodDay({ place: { other: 'x'.repeat(101) } }), { today: TODAY }), { place: 'tooLong' });
  assert.deepEqual(dayProblems(goodDay({ place: { other: 'Gym​' } }), { today: TODAY }), { place: 'badCharacter' });
  // half a second part
  assert.deepEqual(dayProblems(goodDay({ second: { start: '14:30', end: '', place: { code: 'worcester' } } }), { today: TODAY }), { secondEnd: 'missing' });
  assert.deepEqual(dayProblems(goodDay({ second: { start: '14:00', end: '15:00', place: { code: 'worcester' } } }), { today: TODAY }), { secondStart: 'beforeFirstEnd' });
  assert.deepEqual(dayProblems(goodDay({ second: { start: '14:30', end: '15:30', place: null } }), { today: TODAY }), { secondPlace: 'missing' });
  // parts: none ticked / unknown
  assert.deepEqual(dayProblems(goodDay({ parts: [] }), { today: TODAY }), { parts: 'none' });
  assert.deepEqual(dayProblems(goodDay({ parts: ['sparring'] }), { today: TODAY }), { parts: 'invalid' });
  assert.deepEqual(dayProblems(goodDay({ parts: ['physical', 'physical'] }), { today: TODAY }), { parts: 'invalid' });
  assert.equal(placeProblem({ code: 'boston' }), 'missing');
  assert.equal(placeProblem({ other: '   ' }), 'missing');
});

check('rules: part on no day; the same part on two days', () => {
  const form = goodForm();
  assert.deepEqual(partsWithoutDay(form.days), []);
  assert.deepEqual(partsWithoutDay(form.days.slice(0, 1)), ['technical', 'curriculum']);
  assert.deepEqual(partsWithoutDay([]), PARTS);
  const days = [...form.days, goodDay({ name: 'Rain date', date: '2027-06-12', parts: ['curriculum'] })];
  const also = partsAlsoOnOtherDays(days[2], days);
  assert.equal(also.length, 1);
  assert.equal(also[0].part, 'curriculum');
  assert.equal(also[0].day.name, 'Rain date');
});

check('rules: cycleFormProblems (each T4b input)', () => {
  const p = (form, opts = {}) => cycleFormProblems(form, { today: TODAY, mode: 'add', ...opts });
  assert.deepEqual(p(goodForm()), {});
  assert.equal(hasProblems(p(goodForm())), false);
  const edit = (change) => { const f = goodForm(); change(f); return p(f); };
  assert.deepEqual(edit((f) => { f.name = ''; }), { name: 'empty' });
  assert.equal(edit((f) => { f.days[0].date = '2027-01-01'; }).days[0].date, 'past'); // past day
  assert.equal(edit((f) => { f.days[1].end = '12:00'; }).days[1].end, 'notAfterStart'); // end before start
  assert.equal(edit((f) => { f.days[1].start = '07:45'; }).days, undefined); // 07:45 is fine
  assert.equal(edit((f) => { f.days[1].end = '22:15'; }).days[1].end, 'badTime');
  assert.equal(edit((f) => { f.days[1].start = '10:07'; }).days[1].start, 'badTime'); // off the 5-minute step (BB13)
  assert.equal(edit((f) => { f.days[0].second.end = null; }).days[0].secondEnd, 'missing'); // half a second part
  assert.equal(edit((f) => { f.days[0].parts = ['jumping']; }).days[0].parts, 'invalid'); // unknown part
  assert.deepEqual(edit((f) => { f.days = f.days.slice(0, 2); }).partsWithoutDay, ['curriculum']); // part on no day
  assert.equal(edit((f) => { f.days = []; }).daysList, 'none');
  assert.equal(edit((f) => { f.days = Array.from({ length: 21 }, () => goodDay({ parts: ['physical', 'technical', 'curriculum'] })); }).daysList, 'tooMany');
  assert.equal(edit((f) => { f.plans = []; }).plansList, 'none'); // 0 plans
  assert.equal(edit((f) => { f.plans = Array.from({ length: 11 }, (_, i) => ({ ...goodForm().plans[0], key: `k${i}`, name: `Plan ${i}` })); }).plansList, 'tooMany'); // 11 plans
  assert.equal(edit((f) => {
    f.plans[0].payments = Array.from({ length: 13 }, (_, i) => ({ paymentNo: i + 1, dueOn: '2027-03-27', followsApplicationDue: false }));
    for (const d of [1, 2, 3, 4]) f.plans[0].amounts[d] = Array(13).fill(10000);
  }).plans[0].paymentsCount, 'tooMany'); // 13 payments
  assert.equal(edit((f) => { f.plans[0].amounts[1] = [0]; }).plans[0].amounts[1][0], 'invalid'); // $0
  assert.equal(edit((f) => { f.plans[0].amounts[4] = [500100]; }).plans[0].amounts[4][0], 'invalid'); // $5,001
  assert.equal(edit((f) => { f.plans[0].amounts[2] = [29050]; }).plans[0].amounts[2][0], 'invalid'); // $290.50
  assert.equal(edit((f) => { f.plans[0].amounts[3] = [null]; }).plans[0].amounts[3][0], 'missing');
  assert.equal(edit((f) => { f.kukkiwon[2] = 0; }).kukkiwon[2], 'invalid');
  assert.equal(edit((f) => { f.kukkiwon[3] = null; }).kukkiwon[3], 'missing');
  assert.equal(edit((f) => { f.plans[1].payments[1].followsApplicationDue = true; }).plans[1].payments[1].dueOn, 'followsNotFirst'); // follows on payment 2
  assert.equal(edit((f) => { f.plans[1].payments[1].dueOn = '2027-02-01'; }).plans[1].payments[1].dueOn, 'past');
  assert.equal(edit((f) => { f.applicationDue = '2027-06-06'; }).applicationDue, 'afterLastDay'); // deadline after the last day
  assert.equal(edit((f) => { f.submissionsDue = '2027-06-06'; }).submissionsDue, 'afterLastDay');
  assert.equal(edit((f) => { f.submissionsDue = null; }).submissionsDue, 'missing');
  assert.equal(edit((f) => { f.plans[1].name = ' IN  FULL '; }).plans[1].name, 'duplicate'); // plan names differ (case, spaces)
  // OP-11: the starting point's past dates show "Choose today or a later date." from the start
  const fromStartingPoint = goodForm();
  fromStartingPoint.days[0].date = '2026-09-26';
  assert.equal(p(fromStartingPoint).days[0].date, 'past');
});

check('rules: cycleFormProblems in Edit (saved past dates may stay; prices not checked)', () => {
  const original = {
    days: [{ id: 'd1', date: '2027-02-01' }],
    plans: [{ id: 'p1', payments: [{ paymentNo: 1, dueOn: '2027-01-30' }, { paymentNo: 2, dueOn: '2027-04-24' }] }],
  };
  const form = {
    name: 'Spring 2027', applicationDue: '2027-03-27', submissionsDue: '2027-03-27', autoClose: true,
    days: [goodDay({ id: 'd1', date: '2027-02-01', parts: ['physical', 'technical', 'curriculum'], second: null })],
    plans: [{ key: 'p1', id: 'p1', name: 'x', payments: [{ paymentNo: 1, dueOn: '2027-01-30', followsApplicationDue: false }, { paymentNo: 2, dueOn: '2027-04-24', followsApplicationDue: false }], amounts: {} }],
    kukkiwon: {},
  };
  // the deadlines are after the (only, past) day → afterLastDay; fix them for the rest
  form.applicationDue = '2027-02-01';
  form.submissionsDue = '2027-02-01';
  assert.deepEqual(cycleFormProblems(form, { today: TODAY, mode: 'edit', original }), {}); // unchanged past dates are fine
  const moved = { ...form, days: [{ ...form.days[0], date: '2027-02-02' }] };
  assert.equal(cycleFormProblems(moved, { today: TODAY, mode: 'edit', original }).days[0].date, 'past'); // a CHANGED past date
  const due = setPaymentDueDate(form, 'p1', 1, '2027-02-10');
  assert.equal(cycleFormProblems(due, { today: TODAY, mode: 'edit', original }).plans[0].payments[0].dueOn, 'past');
});

check('rules: follows Application due', () => {
  const form = followApplicationDue(goodForm(), '2027-03-20');
  assert.equal(form.applicationDue, '2027-03-20');
  assert.deepEqual(form.plans.map((p) => p.payments[0].dueOn), ['2027-03-20', '2027-03-20']);
  assert.equal(form.plans[1].payments[1].dueOn, '2027-04-24'); // payment 2 doesn't follow
  const typed = setPaymentDueDate(form, 'b', 1, '2027-03-25'); // typing payment 1 clears the flag
  assert.equal(typed.plans[1].payments[0].followsApplicationDue, false);
  assert.equal(typed.plans[1].payments[0].dueOn, '2027-03-25');
  const again = followApplicationDue(typed, '2027-03-22');
  assert.equal(again.plans[1].payments[0].dueOn, '2027-03-25'); // no longer follows
  assert.equal(again.plans[0].payments[0].dueOn, '2027-03-22');
  assert.equal(effectiveDueOn({ paymentNo: 1, followsApplicationDue: true, dueOn: '2000-01-01' }, '2027-03-27'), '2027-03-27');
});

check('rules: payload builders = 0016 §6.2 shapes', () => {
  const add = buildAddPayload(goodForm());
  assert.deepEqual(Object.keys(add).sort(), ['application_due', 'auto_close', 'days', 'kukkiwon', 'name', 'plans', 'prices_from', 'submissions_due']);
  assert.deepEqual(Object.keys(add.days[0]).sort(), ['day_date', 'end_time', 'name', 'parts', 'place', 'second', 'start_time']);
  assert.deepEqual(add.days[0].second, { start: '14:30', end: '15:30', place: { other: 'Horgan Arena, 403 Oxford St N, Auburn MA 01501' } });
  assert.deepEqual(add.days[0].place, { code: 'worcester' });
  assert.equal(add.days[1].second, null);
  assert.deepEqual(Object.keys(add.plans[0]).sort(), ['amounts', 'name', 'payments']);
  assert.deepEqual(add.plans[1].payments[0], { due_on: '2027-03-27', follows_application_due: true });
  assert.deepEqual(add.plans[1].amounts['1'], [29000, 29000, 29000]);
  assert.deepEqual(Object.keys(add.plans[1].amounts), ['1', '2', '3', '4']);
  assert.deepEqual(add.kukkiwon, { 1: 10000, 2: 11000, 3: 14000, 4: 17000 });
  assert.equal(add.prices_from, STARTING_POINT_NAME);
  // the starting point is itself an Add payload without the name (same keys)
  assert.deepEqual(Object.keys(STARTING_POINT_SCHEDULE).sort(), Object.keys(add).filter((k) => k !== 'name' && k !== 'prices_from').sort());
  const form = { ...goodForm(), days: goodForm().days.map((d, i) => ({ ...d, id: i === 0 ? 'day-1' : null })) };
  form.plans = form.plans.map((p, i) => ({ ...p, id: `plan-${i}` }));
  const upd = buildUpdatePayload(form);
  assert.deepEqual(Object.keys(upd).sort(), ['application_due', 'auto_close', 'days', 'due_dates', 'name', 'submissions_due']);
  assert.equal(upd.days[0].id, 'day-1');
  assert.equal(upd.days[1].id, null);
  assert.equal(upd.due_dates.length, 4);
  assert.deepEqual(upd.due_dates[0], { cycle_plan_id: 'plan-0', payment_no: 1, due_on: '2027-03-27', follows_application_due: true });
  assert.deepEqual(upd.due_dates[3], { cycle_plan_id: 'plan-1', payment_no: 3, due_on: '2027-05-29', follows_application_due: false });
});

// ======================= rules.js: ages, prices, schedule =======================

check('rules: ages and under 18 on the first testing day', () => {
  assert.equal(ageOn('2012-03-04', '2027-04-03'), 15);
  assert.equal(ageOn('2009-04-03', '2027-04-03'), 18); // the birthday itself
  assert.equal(ageOn('2009-04-04', '2027-04-03'), 17); // one day short
  assert.equal(ageOn('2008-02-29', '2026-02-28'), 17); // a 29 February birthday
  assert.equal(ageOn('2008-02-29', '2026-03-01'), 18);
  assert.equal(ageOn(null, '2027-04-03'), null);
  assert.equal(isUnder18OnFirstDay('2009-04-04', SPRING_DAYS), true);
  assert.equal(isUnder18OnFirstDay('2009-04-03', SPRING_DAYS), false);
  assert.equal(isUnder18OnFirstDay('2009-04-04', []), false);
  assert.equal(isUnder18OnFirstDay(null, SPRING_DAYS), false);
  assert.equal(addYears('2008-02-29', 21), '2029-02-28');
  assert.equal(addYears('2027-06-05', 3), '2030-06-05');
});

check('rules: plan totals and the Kukkiwon range', () => {
  assert.deepEqual(planTotals(goodForm().plans[1]), { 1: 87000, 2: 99000, 3: 150000, 4: 270000 });
  assert.deepEqual(planTotals({ amounts: { 1: [100, null] } }), { 1: null, 2: null, 3: null, 4: null });
  assert.deepEqual(kukkiwonRange({ 1: 10000, 2: 11000, 3: 14000, 4: 17000 }), [10000, 17000]);
  assert.deepEqual(kukkiwonRange({ '1': 10000, '4': 17000 }), [10000, 17000]);
  assert.equal(kukkiwonRange({}), null);
});

check('rules: schedule lines (incl. the S4 floor) and plan summary', () => {
  const plan = goodForm().plans[1];
  const fees = { 1: 10000, 2: 11000, 3: 14000, 4: 17000 };
  // on time, with Kukkiwon: "Mar 27 payment 1 + Kukkiwon $390", "Apr 24 $290", "May 29 $290"
  const s = scheduleFor({ plan, dan: 1, kukkiwon: true, fees, today: TODAY });
  assert.deepEqual(s.items.map((x) => [x.item, x.dueOn, x.amountCents]), [
    ['p1', '2027-03-27', 29000], ['kukkiwon', '2027-03-27', 10000], ['p2', '2027-04-24', 29000], ['p3', '2027-05-29', 29000]]);
  assert.deepEqual(s.lines, [
    { dueOn: '2027-03-27', items: ['p1', 'kukkiwon'], amountCents: 39000 },
    { dueOn: '2027-04-24', items: ['p2'], amountCents: 29000 },
    { dueOn: '2027-05-29', items: ['p3'], amountCents: 29000 }]);
  assert.equal(s.totalCents, 97000);
  assert.equal(s.testingCents, 87000);
  assert.equal(s.kukkiwonCents, 10000);
  // a late family (Apr 30): passed dates count from today (S4, OP-12)
  const late = scheduleFor({ plan, dan: 1, kukkiwon: true, fees, today: '2027-04-30' });
  assert.deepEqual(late.lines, [
    { dueOn: '2027-04-30', items: ['p1', 'kukkiwon', 'p2'], amountCents: 68000 },
    { dueOn: '2027-05-29', items: ['p3'], amountCents: 29000 }]);
  // without Kukkiwon; the family form's plan shape (snake_case)
  const formPlan = { payments: [{ payment_no: 1, due_on: '2027-03-27' }], amounts: { 1: [87000], 2: [99000], 3: [150000], 4: [270000] } };
  assert.deepEqual(scheduleFor({ plan: formPlan, dan: 2, kukkiwon: false, fees, today: TODAY }).lines, [{ dueOn: '2027-03-27', items: ['p1'], amountCents: 99000 }]);
  assert.equal(scheduleFor({ plan, dan: null, today: TODAY }), null);
  // plan summary lines: before a Dan, equal amounts, unequal amounts (OP-12b)
  assert.deepEqual(planSummary(plan, { today: TODAY }), { paymentsCount: 3, dueDates: ['2027-03-27', '2027-04-24', '2027-05-29'], amounts: null, equalAmounts: null, totalCents: null });
  assert.deepEqual(planSummary(plan, { dan: 1, today: TODAY }), { paymentsCount: 3, dueDates: ['2027-03-27', '2027-04-24', '2027-05-29'], amounts: [29000, 29000, 29000], equalAmounts: true, totalCents: 87000 });
  const uneven = { payments: [{ paymentNo: 1, dueOn: '2027-03-27' }, { paymentNo: 2, dueOn: '2027-05-29' }], amounts: { 1: [40000, 47000] } };
  assert.deepEqual(planSummary(uneven, { dan: 1, today: '2027-04-01' }), { paymentsCount: 2, dueDates: ['2027-04-01', '2027-05-29'], amounts: [40000, 47000], equalAmounts: false, totalCents: 87000 });
});

// ======================= rules.js: small checks =======================

check('rules: email, code, waiver body, keep years, duplicate cycle names', () => {
  assert.equal(emailIsValid('name@example.com'), true);
  assert.equal(emailIsValid('  name@example.com  '), true); // trimmed first
  for (const bad of ['name@example', 'name example@x.com', 'a@@b.com', '', null, `${'a'.repeat(250)}@x.com`, 'na​me@example.com']) {
    assert.equal(emailIsValid(bad), false, String(bad));
  }
  assert.equal(codeIsValid('p4w9tdkm'), true);
  for (const bad of ['p4w9tdk', 'p4w9tdkmm', 'P4W9TDKM', 'p4w9tdk1', 'p4w9tdko', 'p4w9tdki', 'p4w9tdkl', null]) assert.equal(codeIsValid(bad), false, String(bad));
  assert.equal(waiverBodyProblem('  '), 'empty');
  assert.equal(waiverBodyProblem('x'.repeat(20000)), null);
  assert.equal(waiverBodyProblem(` ${'x'.repeat(20000)} `), null);
  assert.equal(waiverBodyProblem('x'.repeat(20001)), 'tooLong');
  assert.equal(keepYearsProblem(null, null), null);
  assert.equal(keepYearsProblem(3, 20), null);
  assert.equal(keepYearsProblem(3, null), 'oneEmpty');
  assert.equal(keepYearsProblem(2, 3), 'outOfRange');
  assert.equal(keepYearsProblem(3, 21), 'outOfRange');
  assert.equal(purgeDueOn({ dateOfBirth: '2017-01-01', lastDay: '2027-06-05', afterLastDay: 3, after18: 3 }), '2038-01-01'); // a 10-year-old
  assert.equal(purgeDueOn({ dateOfBirth: '1990-01-01', lastDay: '2027-06-05', afterLastDay: 3, after18: 3 }), '2030-06-05');
  assert.equal(purgeDueOn({ dateOfBirth: '1990-01-01', lastDay: '2027-06-05', afterLastDay: null, after18: 3 }), null);
  assert.equal(findDuplicateCycle([{ id: 'a', name: 'Spring 2027' }], ' spring   2027 '), 'Spring 2027');
  assert.equal(findDuplicateCycle([{ id: 'a', name: 'Spring 2027' }], 'Spring 2027', 'a'), null);
});

check('rules: nextWaiverVersionName and the 24-hour waiver rule', () => {
  assert.equal(nextWaiverVersionName([{ versionName: '2026-1' }], '2027-02-15'), '2027-1');
  assert.equal(nextWaiverVersionName([{ version_name: '2026-1' }, { version_name: '2027-1' }], '2027-02-15'), '2027-2');
  assert.equal(nextWaiverVersionName([{ versionName: '2026-1' }], '2026-12-31'), '2026-2');
  const now = Date.parse('2027-02-15T15:00:00Z');
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.equal(waiverVersionOk({ isPlaceholder: false, supersededAt: null }, now), true); // current
  assert.equal(waiverVersionOk({ isPlaceholder: false, supersededAt: ago((23 * 60 + 59) * 60000) }, now), true); // 23 h 59 min ago
  assert.equal(waiverVersionOk({ isPlaceholder: false, supersededAt: ago((24 * 60 + 1) * 60000) }, now), false); // 24 h 1 min ago
  assert.equal(waiverVersionOk({ isPlaceholder: true, supersededAt: null }, now), false); // the placeholder, current
  assert.equal(waiverVersionOk({ is_placeholder: true, superseded_at: ago(60000) }, now), false); // the placeholder, a minute ago
});

// ======================= qr.js =======================

check('qr: links, QR picture, file name', () => {
  assert.equal(blackBeltLink('p4w9tdkm'), 'https://tkd-dashboard.pages.dev/black-belt/p4w9tdkm');
  assert.equal(blackBeltLink('bad'), '');
  assert.equal(blackBeltLink(null), '');
  const svg = qrSvgDataUrl('p4w9tdkm');
  assert.ok(svg.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.ok(decodeURIComponent(svg).includes('<svg'));
  assert.equal(qrSvgDataUrl('p4w9tdk'), '');
  // BB10: the file is named by the shared helper now — "[cycle] - [school] QR code.png" (v1.106)
  assert.equal(qrFileName('Spring 2027', 'Shrewsbury'), 'Spring 2027 - Shrewsbury QR code.png');
  assert.equal(qrFileName('Spring/Fall: 2027?', 'Worcester'), 'SpringFall 2027 - Worcester QR code.png');
  // …and the shared picture is the same picture the old Black Belt one drew
  assert.equal(sharedQrSvgDataUrl(blackBeltLink('p4w9tdkm')), svg);
  assert.equal(sharedQrSvgDataUrl(blackBeltLink('bad')), '');
});

// ======================= BB10 / BB7 / BB14 (design review part 2, cycle side) =======================

// check() for a function that waits (it imports a file): the next line runs after it finished.
async function checkAsync(label, fn) {
  try {
    await fn();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
}

await checkAsync('BB10: the Registration link button and box words', async () => {
  const text = await import('../../blackBelt/staff/text.js');
  assert.equal(text.REGISTRATION_LINK, 'Registration link'); // the header button: Star's word
  assert.equal(text.REGISTRATION_LINKS, 'Registration links'); // the box's title
  // the Cycles list's failure words name the new button, not the old ⋯ item
  assert.ok(text.COPY_FAILED.includes('Open Registration link on the cycle page'));
  assert.ok(!text.COPY_FAILED.includes('Registration links'));
  // the box's own words come from the shared parts: Black Belt no longer keeps copies
  for (const name of ['copySchoolLink', 'schoolTitle', 'DOWNLOAD_QR', 'qrAlt', 'QR_FAILED']) assert.equal(text[name], undefined, name);
  assert.equal(text.TOAST_LINK_COPIED, 'Link copied');
  assert.equal(text.TOAST_QR_DOWNLOADED, 'QR code downloaded');
});

await checkAsync('BB7: the confirm boxes\' words (one constant each; the "Keep …" words wait for Jeffrey, Q1)', async () => {
  const text = await import('../../blackBelt/staff/text.js');
  const results = await import('../../blackBelt/staff/results/text.js');
  assert.equal(text.KEEP_CYCLE, 'Keep cycle'); // Delete cycle's left button (decided)
  assert.equal(text.DELETE_CYCLE, 'Delete cycle');
  assert.equal(text.DELETING, 'Deleting…');
  assert.equal(text.KEEP_EDITING, 'Keep editing'); // Discard changes: Keep editing left, Discard right
  assert.equal(text.DISCARD, 'Discard');
  assert.equal(text.DISCARD_CHANGES, 'Discard changes'); // the phones' note keeps v0.56's words
  assert.equal(text.SAVE_AND_DELETE, 'Save and delete');
  assert.equal(results.UNDO_CONFIRM_GO, 'Undo Mark as sent');
  assert.equal(results.UNDO_CONFIRM_BUSY, 'Undoing…');
  // Jeffrey has not answered the "Keep …" question: both safe buttons still say "Cancel", each
  // from ONE constant, so the answer is a one-line change
  assert.equal(text.KEEP_CONFIRM_KEEP, 'Keep details');
  assert.equal(results.UNDO_CONFIRM_KEEP, 'Keep send record');
  // the leave warning's words come from Star's shared grading words
  const gradingText = await import('../../blackBelt/staff/grading/text.js');
  assert.equal(gradingText.S.STAY_ON_PAGE, 'Stay on this page');
  assert.equal(gradingText.S.LEAVE_ANYWAY, 'Leave anyway');
});

await checkAsync('BB14: one money helper — the staff screens say what they said, except a typed 12.5', async () => {
  const { formatCents } = await import('./money.js');
  const { dollarsText } = await import('../../blackBelt/staff/cycle/formValues.js');
  // formatCents (the old name) and formatMoney give the same text for every amount a screen shows
  for (const cents of [0, 1, 99, 100, 5005, 29000, 29050, 87000, 112000, 270000, 500000, 2200000000, -1, -29000, -5005, null, undefined, 290.5, '29000', NaN]) {
    assert.equal(formatCents(cents), formatMoney(cents), String(cents));
  }
  // staff/text.js's sentences use formatMoney
  const text = await import('../../blackBelt/staff/text.js');
  assert.equal(text.historyPayment(29050, 'cash', '2027-03-04'), 'Payment recorded: $290.50 cash, paid Mar 4');
  assert.equal(text.historyRefund(5000, 'cash', '2027-03-04'), 'Refund recorded: $50 cash, Mar 4');
  assert.equal(text.historyCheckReturned(29000), 'Check returned: $290');
  // Whole-dollar prices read exactly as before (the old formatDollars)
  for (const dollars of ['870', '$870', '2,700', '1', '5000', '290.00']) {
    const cents = Number(dollars.replace(/[$,]/g, '')) * 100;
    assert.equal(dollarsText(dollars), formatDollars(cents), dollars);
  }
  assert.equal(dollarsText('870'), '$870');
  assert.equal(dollarsText('2,700'), '$2,700');
  // The ONE difference: the Add cycle grid's preview of a typed "12.5" ("$13" before)
  assert.equal(formatDollars(1250), '$13');
  assert.equal(dollarsText('12.5'), '$12.50');
  assert.equal(dollarsText('12.07'), '$12.07'); // 12.07 * 100 is 1207.0000000000002: rounded first
  assert.equal(dollarsText(''), ''); // nothing typed: an empty spot, never "$0" or "$NaN"
  assert.equal(dollarsText('abc'), '');
});

// ======================= the preview database =======================

// A controllable clock: setDay('2027-02-15') = noon in Massachusetts that day.
let nowMs = Date.parse('2027-02-15T17:00:00Z');
let todayIso = '2027-02-15';
const setDay = (date, hhmm = '12:00') => {
  todayIso = date;
  nowMs = Date.parse(`${date}T${hhmm}:00-05:00`);
};
// Moves the clock on by ms (and "today" with it, as the real school date would).
const advance = (ms) => {
  nowMs += ms;
  todayIso = todayInSchoolTime(nowMs);
};
let saved = null;
let saves = 0;
const backend = createBlackBeltBackend({
  loadStore: () => saved,
  saveStore: (store) => { saved = JSON.parse(JSON.stringify(store)); saves += 1; },
  now: () => nowMs,
  today: () => todayIso,
  newId: randomUUID,
});
const ADMIN = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Jeffrey Berg', userId: 'u1' };
const STAFF = { signedIn: true, hasDataAccess: true, isAdmin: false, actorName: 'Staff', userId: 'u2' };
const LOCKED = { signedIn: true, hasDataAccess: false, isAdmin: true, actorName: 'Jeffrey Berg' };
const call = (name, args = {}, ctx = ADMIN, options) => {
  const res = backend.rpc(name, args, ctx, options);
  assert.equal(res.error, null, `${name}: ${res.error?.message}`);
  return res.data;
};
const db = () => backend.snapshot();
const addArgs = (form = goodForm(), source = null) => ({ p_payload: buildAddPayload(form), p_source_cycle_id: source });

check('store: the seed = 0016 section 11n', () => {
  backend.reset();
  const s = db();
  assert.equal(s.bb_settings.length, 1);
  assert.equal(s.bb_settings[0].keep_years_after_last_day, null);
  assert.equal(s.bb_settings[0].keep_years_after_18, null);
  assert.equal(s.bb_waiver_versions.length, 1);
  assert.equal(s.bb_waiver_versions[0].version_name, '2026-1');
  assert.equal(s.bb_waiver_versions[0].is_placeholder, true);
  assert.equal(s.bb_waiver_versions[0].body, SEED_WAIVER_BODY);
  assert.deepEqual(s.bb_starting_point[0].schedule, STARTING_POINT_SCHEDULE);
  assert.deepEqual(s.bb_starting_point[0].requirements, STARTING_POINT_REQUIREMENTS);
  for (const t of ['bb_cycles', 'bb_candidates', 'bb_payments', 'bb_candidate_waivers']) assert.equal(s[t].length, 0, t);
  assert.equal(s.ref_counter, 5001);
  // a damaged store → the seed
  saved = { schema: 'nope' };
  assert.equal(db().bb_waiver_versions[0].version_name, '2026-1');
  saved = null;
  assert.ok(BB_RPC_NAMES.includes('bb_cycles_list') && BB_WRITE_RPC_NAMES.includes('bb_add_cycle'));
  assert.equal(BB_STORE_KEY, 'tkd.preview.blackBelt');
  assert.equal(BB_TABLES.length, 22); // 0016's 13 + 0024's bb_default_rubric and bb_rubric_undo + 0025's 7
  assert.deepEqual(s.bb_default_rubric[0].sheet, DEFAULT_RUBRIC); // 0024's seed
  assert.deepEqual(s.bb_rubric_undo, []);
});

check('store: who may call what (no_access before not_allowed; staff refused A functions)', () => {
  backend.reset();
  const A = { bb_cycle_defaults: {}, bb_add_cycle: addArgs(), bb_save_waiver: { p_expected_current_id: randomUUID(), p_body: 'x' },
    bb_set_keep_years: { p_expected_version: 1, p_after_last_day: null, p_after_18: null, p_confirm_count: null },
    bb_update_cycle: { p_cycle_id: randomUUID(), p_expected_version: 1, p_payload: {} },
    bb_delete_cycle: { p_cycle_id: randomUUID(), p_expected_version: 1, p_expected_candidate_count: 0 } };
  for (const [name, args] of Object.entries(A)) {
    assert.deepEqual(call(name, args, LOCKED), { status: 'no_access' }, name);
    assert.deepEqual(call(name, args, STAFF), { status: 'not_allowed' }, name);
  }
  // broken input from a locked sign-in is still no_access (access is checked before input)
  assert.deepEqual(call('bb_add_cycle', { p_payload: 'garbage', p_source_cycle_id: null }, LOCKED), { status: 'no_access' });
  assert.deepEqual(call('bb_cycles_list', {}, LOCKED), { status: 'no_access' });
  assert.deepEqual(call('bb_set_registration', { p_cycle_id: randomUUID(), p_expected_version: 1, p_open: true }, LOCKED), { status: 'no_access' });
  assert.equal(call('bb_cycles_list', {}, STAFF).status, 'ok'); // S
  assert.deepEqual(call('bb_set_registration', { p_cycle_id: randomUUID(), p_expected_version: 1, p_open: true }, STAFF), { status: 'not_found' }); // S
  // the public functions and helpers: permission denied for the app
  for (const name of ['bb_public_cycle', 'bb_public_register', 'bb_purge_due', 'bb_cycle_state']) {
    assert.equal(backend.rpc(name, {}, ADMIN).error.code, '42501', name);
  }
  // wrong argument names → "function not found", like PostgREST
  assert.equal(backend.rpc('bb_set_registration', { p_cycle_id: randomUUID() }, ADMIN).error.code, 'PGRST202');
  assert.equal(backend.rpc('bb_set_registration', { p_cycle_id: 'x', p_expected_version: 1, p_open: true }, ADMIN).error.code, '22P02');
  // not signed in → permission denied
  assert.equal(backend.rpc('bb_cycles_list', {}, { signedIn: false }).error.code, '42501');
  // a volatile function as a read-only GET → refused (bb_cycles_list runs the purge)
  assert.equal(backend.rpc('bb_cycles_list', {}, ADMIN, { get: true }).error.code, '25006');
  assert.equal(backend.rpc('bb_add_cycle', addArgs(), ADMIN, { get: true }).error.code, '25006');
  assert.equal(backend.rpc('bb_cycle_defaults', {}, ADMIN, { get: true }).error, null); // stable: a GET is fine
});

check('store: table reads use the column grants (never DOB, email, waivers, login ids)', () => {
  backend.loadSample();
  const sel = (table, cols, ctx = ADMIN, filters = []) => backend.select(table, cols, filters, [], ctx);
  assert.equal(sel('bb_candidates', '*').error.code, '42501');
  assert.equal(sel('bb_candidates', 'id, date_of_birth').error.code, '42501');
  assert.equal(sel('bb_candidates', 'email_for_results').error.code, '42501');
  assert.equal(sel('bb_candidates', 'created_by').error.code, '42501');
  assert.equal(sel('bb_candidate_waivers', 'id').error.code, '42501');
  assert.equal(sel('bb_candidate_waivers', 'signature').error.code, '42501');
  assert.equal(sel('bb_starting_point', 'schedule').error.code, '42501');
  assert.equal(sel('bb_settings', 'singleton').error.code, '42501');
  assert.equal(sel('bb_payments', 'recorded_by').error.code, '42501');
  assert.equal(sel('bb_cycles', 'nope').error.code, '42703');
  assert.equal(sel('bb_nope', 'id').error.code, 'PGRST205');
  const rows = sel('bb_candidates', 'id, status, first_name');
  assert.equal(rows.data.length, 6);
  assert.deepEqual(Object.keys(rows.data[0]), ['id', 'status', 'first_name']);
  assert.deepEqual(sel('bb_candidates', 'id', LOCKED).data, []); // row-level security
  const cycle = db().bb_cycles.find((c) => c.name === 'Spring 2027');
  assert.equal(sel('bb_cycle_days', 'day_date', ADMIN, [{ col: 'cycle_id', value: cycle.id }]).data.length, 3);
  assert.equal(sel('bb_cycle_days', 'day_date', ADMIN, [{ col: 'day_date', value: '2027-06-01', op: 'gte' }]).data.length, 4); // Jun 5 + Fall 2027's 3 days
  const times = sel('bb_cycle_days', 'start_time', ADMIN, [{ col: 'cycle_id', value: cycle.id }]).data.map((d) => d.start_time);
  assert.ok(times.includes('12:30:00')); // the database's time format; the data layer cuts it to 5
});

check('store: cycles list, defaults, add cycle', () => {
  backend.reset();
  setDay('2027-02-15');
  assert.deepEqual(call('bb_cycles_list'), { status: 'ok', today: '2027-02-15', cycles: [] });
  // defaults: no cycle → the starting point (Fall 2026 values exactly)
  const d0 = call('bb_cycle_defaults');
  assert.equal(d0.source_cycle_id, null);
  assert.deepEqual(d0.payload, { ...STARTING_POINT_SCHEDULE, prices_from: STARTING_POINT_NAME });
  // the starting point's past dates are refused as they are (OP-11)
  assert.deepEqual(call('bb_add_cycle', { p_payload: { ...d0.payload, name: 'Spring 2027' }, p_source_cycle_id: null }), { status: 'invalid' });
  // a good Add cycle
  const added = call('bb_add_cycle', addArgs());
  assert.equal(added.status, 'ok');
  assert.equal(added.version, 1);
  assert.ok(codeIsValid(added.public_code_worcester) && codeIsValid(added.public_code_shrewsbury));
  assert.notEqual(added.public_code_worcester, added.public_code_shrewsbury);
  const s = db();
  const c = s.bb_cycles[0];
  assert.equal(c.registration_open, false); // starts Closed
  assert.equal(c.first_opened_at, null);
  assert.deepEqual(c.requirements, freshCopy(DEFAULT_RUBRIC)); // 0024: a fresh copy of the default rubric
  assert.equal(c.prices_from, STARTING_POINT_NAME);
  assert.equal(c.created_by_name, 'Jeffrey Berg');
  assert.equal(s.bb_cycle_days.length, 3);
  assert.equal(s.bb_cycle_days[0].start_time, '12:30:00');
  assert.equal(s.bb_cycle_days[0].second_place_other, 'Horgan Arena, 403 Oxford St N, Auburn MA 01501');
  assert.equal(s.bb_cycle_plans.length, 2);
  assert.deepEqual(s.bb_cycle_plans.map((p) => [p.name, p.position, p.payments_count]), [['In full', 0, 1], ['3 payments', 1, 3]]);
  assert.equal(s.bb_cycle_plan_amounts.length, (1 + 3) * 4); // payments_count × 4 per plan
  assert.equal(s.bb_cycle_kukkiwon_fees.length, 4);
  assert.equal(s.bb_cycle_plan_payments.length, 4);
  // the list
  const list = call('bb_cycles_list');
  assert.equal(list.cycles.length, 1);
  const row = list.cycles[0];
  assert.deepEqual(Object.keys(row).sort(), ['application_due', 'auto_close', 'candidate_count', 'day_count', 'first_day', 'has_form_waivers',
    'has_payments', 'id', 'last_day', 'name', 'next_day', 'registration_open', 'state', 'version'].sort());
  assert.equal(row.state.state, 'not_open_yet');
  assert.equal(row.first_day, '2027-04-03');
  assert.equal(row.day_count, 3);
  // defaults now come from that cycle
  const d1 = call('bb_cycle_defaults');
  assert.equal(d1.source_cycle_id, c.id);
  assert.equal(d1.payload.prices_from, 'Spring 2027');
  assert.deepEqual(d1.payload.days[0], { name: 'Physical', day_date: '2027-04-03', start_time: '12:30', end_time: '14:30', place: { code: 'worcester' },
    second: { start: '14:30', end: '15:30', place: { other: 'Horgan Arena, 403 Oxford St N, Auburn MA 01501' } }, parts: ['physical'] });
  assert.deepEqual(d1.payload.plans[1].amounts, { 1: [29000, 29000, 29000], 2: [33000, 33000, 33000], 3: [50000, 50000, 50000], 4: [90000, 90000, 90000] });
  assert.deepEqual(d1.payload.kukkiwon, { 1: 10000, 2: 11000, 3: 14000, 4: 17000 });
  // duplicate name (case and spaces) → duplicate_name; a source cycle that doesn't exist → invalid
  assert.deepEqual(call('bb_add_cycle', addArgs({ ...goodForm(), name: '  spring   2027 ' })), { status: 'duplicate_name' });
  assert.deepEqual(call('bb_add_cycle', addArgs({ ...goodForm(), name: 'Fall 2027' }, randomUUID())), { status: 'invalid' });
  // 0024: filled in from a cycle, the rubric is still the DEFAULT's (never the source cycle's)
  const fromSpring = call('bb_add_cycle', addArgs({ ...goodForm(), name: 'Summer 2027', pricesFrom: 'Spring 2027' }, c.id));
  assert.equal(fromSpring.status, 'ok');
  assert.deepEqual(db().bb_cycles.find((x) => x.id === fromSpring.id).requirements, freshCopy(DEFAULT_RUBRIC));
  const codes = db().bb_cycles.flatMap((x) => [x.public_code_worcester, x.public_code_shrewsbury]);
  assert.equal(new Set(codes).size, 4); // four different codes
});

check('store: add cycle input rules (T4b) → invalid; part on no day → part_without_day', () => {
  backend.reset();
  setDay('2027-02-15');
  const bad = (change) => {
    const payload = buildAddPayload(goodForm());
    change(payload);
    return call('bb_add_cycle', { p_payload: payload, p_source_cycle_id: null }).status;
  };
  const cases = {
    'past day': (p) => { p.days[0].day_date = '2027-02-14'; },
    'end before start': (p) => { p.days[1].end_time = '12:00'; },
    '07:45 ok': null,
    '22:15': (p) => { p.days[1].end_time = '22:15'; },
    '10:07': (p) => { p.days[1].start_time = '10:07'; }, // 0032: off the 5-minute step (the screens still offer 15)
    'two places': (p) => { p.days[1].place = { code: 'worcester', other: 'Gym' }; },
    'unknown school': (p) => { p.days[1].place = { code: 'boston' }; },
    'other place over 100': (p) => { p.days[1].place = { other: 'x'.repeat(101) }; },
    'half a second part': (p) => { p.days[0].second = { start: '14:30', place: { code: 'worcester' } }; },
    'second part before the first ends': (p) => { p.days[0].second.start = '14:00'; },
    'unknown part': (p) => { p.days[0].parts = ['sparring']; },
    'no part ticked': (p) => { p.days[0].parts = []; },
    'repeated part': (p) => { p.days[0].parts = ['physical', 'physical']; },
    '0 plans': (p) => { p.plans = []; },
    '11 plans': (p) => { p.plans = Array.from({ length: 11 }, (_, i) => ({ ...p.plans[0], name: `Plan ${i}` })); },
    '13 payments': (p) => { p.plans[0].payments = Array.from({ length: 13 }, () => ({ due_on: '2027-03-27', follows_application_due: false })); for (const k of ['1', '2', '3', '4']) p.plans[0].amounts[k] = Array(13).fill(10000); },
    '$0': (p) => { p.plans[0].amounts['1'] = [0]; },
    '$5,001': (p) => { p.plans[0].amounts['1'] = [500100]; },
    '$290.50': (p) => { p.plans[0].amounts['1'] = [29050]; },
    'a missing Dan': (p) => { delete p.plans[0].amounts['4']; },
    'amount count': (p) => { p.plans[1].amounts['2'] = [33000]; },
    'Kukkiwon $0': (p) => { p.kukkiwon['2'] = 0; },
    'Kukkiwon 3 Dans': (p) => { delete p.kukkiwon['4']; },
    'follows on payment 2': (p) => { p.plans[1].payments[1].follows_application_due = true; },
    'follows with another date': (p) => { p.plans[1].payments[0].due_on = '2027-03-26'; },
    'due date in the past': (p) => { p.plans[1].payments[1].due_on = '2027-02-01'; },
    'deadline after the last day': (p) => { p.application_due = '2027-06-06'; },
    'submissions after the last day': (p) => { p.submissions_due = '2027-06-06'; },
    'same plan name': (p) => { p.plans[1].name = 'IN FULL'; },
    'unknown key': (p) => { p.color = 'red'; },
    'day id in Add': (p) => { p.days[0].id = randomUUID(); },
    'auto_close not a yes/no': (p) => { p.auto_close = 'yes'; },
    'name empty': (p) => { p.name = '  '; },
    'bad date': (p) => { p.application_due = '2027-02-30'; },
    '21 days': (p) => { p.days = Array.from({ length: 21 }, () => ({ ...p.days[0], parts: ['physical', 'technical', 'curriculum'] })); },
  };
  for (const [label, change] of Object.entries(cases)) {
    if (change === null) continue;
    assert.equal(bad(change), 'invalid', label);
  }
  assert.equal(bad((p) => { p.days[1].start_time = '07:45'; }), 'ok'); // 07:45 is a good time
  // 0032 (BB13): the database takes every 5 minutes; a second part too
  assert.equal(bad((p) => { p.name = 'Five A'; p.days[1].start_time = '10:05'; }), 'ok');
  assert.equal(bad((p) => { p.name = 'Five B'; p.days[0].second = { start: '14:35', end: '15:05', place: { code: 'worcester' } }; }), 'ok');
  assert.equal(bad((p) => { p.days[0].second = { start: '14:35', end: '15:07', place: { code: 'worcester' } }; }), 'invalid');
  backend.reset();
  const missing = call('bb_add_cycle', addArgs({ ...goodForm(), submissionsDue: '2027-04-03', days: goodForm().days.slice(0, 1) }));
  assert.deepEqual(missing, { status: 'part_without_day', parts: ['technical', 'curriculum'] });
  // part_without_day comes before duplicate_name (step 6 before 7)
  call('bb_add_cycle', addArgs());
  assert.equal(call('bb_add_cycle', addArgs({ ...goodForm(), days: goodForm().days.slice(1) })).status, 'part_without_day');
});

// Builds the Edit cycle form of a stored cycle (what the screens do from loadCycle).
function editForm(cycleId) {
  const s = db();
  const c = s.bb_cycles.find((x) => x.id === cycleId);
  const days = s.bb_cycle_days.filter((d) => d.cycle_id === cycleId).sort((a, b) => (a.day_date < b.day_date ? -1 : 1)).map((d) => ({
    id: d.id, name: d.name, date: d.day_date, start: d.start_time.slice(0, 5), end: d.end_time.slice(0, 5),
    place: d.place_code ? { code: d.place_code } : { other: d.place_other },
    second: d.second_start ? { start: d.second_start.slice(0, 5), end: d.second_end.slice(0, 5), place: d.second_place_code ? { code: d.second_place_code } : { other: d.second_place_other } } : null,
    parts: PARTS.filter((p) => s.bb_cycle_day_parts.some((x) => x.day_id === d.id && x.part === p)), version: d.version,
  }));
  const plans = s.bb_cycle_plans.filter((p) => p.cycle_id === cycleId).sort((a, b) => a.position - b.position).map((p) => ({
    id: p.id, name: p.name, position: p.position, paymentsCount: p.payments_count,
    payments: s.bb_cycle_plan_payments.filter((x) => x.cycle_plan_id === p.id).sort((a, b) => a.payment_no - b.payment_no)
      .map((x) => ({ id: x.id, paymentNo: x.payment_no, dueOn: x.due_on, followsApplicationDue: x.follows_application_due })),
    amounts: { 1: [], 2: [], 3: [], 4: [] },
  }));
  const detail = { name: c.name, applicationDue: c.application_due, submissionsDue: c.submissions_due, autoClose: c.auto_close,
    registrationOpen: c.registration_open, days, plans, kukkiwon: {}, pricesFrom: c.prices_from };
  return { form: cycleToForm(detail), detail, version: c.version };
}

check('store: update cycle (T4d)', () => {
  backend.reset();
  setDay('2027-02-15');
  const { id } = call('bb_add_cycle', addArgs());
  const upd = (form, version) => call('bb_update_cycle', { p_cycle_id: id, p_expected_version: version, p_payload: buildUpdatePayload(form) });
  let { form, version, detail } = editForm(id);
  assert.equal(cycleFormProblems(form, { today: '2027-02-15', mode: 'edit', original: detail }).days, undefined);
  // unchanged → ok, no version bump, nothing written
  const before = JSON.stringify(db());
  assert.deepEqual(upd(form, version), { status: 'ok', version: 1 });
  assert.equal(JSON.stringify(db()), before);
  // stale
  assert.deepEqual(upd(form, 7), { status: 'stale' });
  // change only a day's time → the cycle's version goes up once; the day keeps its id
  const dayIds = form.days.map((d) => d.id);
  form.days[1].end = '16:00';
  assert.deepEqual(upd(form, 1), { status: 'ok', version: 2 });
  ({ form, version } = editForm(id));
  assert.deepEqual(form.days.map((d) => d.id), dayIds);
  assert.equal(form.days[1].end, '16:00');
  // rename + add a day + remove a day + change parts by difference, all in one save → one bump
  form.name = 'Spring 2027 (both schools)';
  form.days[2].parts = ['curriculum', 'technical'];
  form.days.splice(1, 1); // remove Technical
  form.days.push({ ...goodDay(), id: null, name: 'Rain date', date: '2027-06-12', second: null, parts: ['physical'] });
  assert.deepEqual(upd(form, version), { status: 'ok', version: 3 });
  const s = db();
  assert.equal(s.bb_cycle_days.filter((d) => d.cycle_id === id).length, 3);
  assert.ok(!s.bb_cycle_days.some((d) => d.id === dayIds[1]));
  assert.deepEqual(PARTS.filter((p) => s.bb_cycle_day_parts.some((x) => x.day_id === dayIds[2] && x.part === p)), ['technical', 'curriculum']);
  ({ form, version } = editForm(id));
  // a day id of another cycle → invalid
  const other = call('bb_add_cycle', addArgs({ ...goodForm(), name: 'Other' }));
  const otherDay = db().bb_cycle_days.find((d) => d.cycle_id === other.id).id;
  assert.deepEqual(upd({ ...form, days: [...form.days.slice(0, 2), { ...form.days[2], id: otherDay }] }, version), { status: 'invalid' });
  // prices in the payload → invalid (v0.902)
  assert.deepEqual(call('bb_update_cycle', { p_cycle_id: id, p_expected_version: version, p_payload: { ...buildUpdatePayload(form), plans: [] } }), { status: 'invalid' });
  // a missing due date → invalid
  const p = buildUpdatePayload(form);
  p.due_dates.pop();
  assert.deepEqual(call('bb_update_cycle', { p_cycle_id: id, p_expected_version: version, p_payload: p }), { status: 'invalid' });
  // a part on no day → part_without_day
  assert.deepEqual(upd({ ...form, days: form.days.map((d) => ({ ...d, parts: d.parts.filter((x) => x !== 'technical') })) }, version), { status: 'part_without_day', parts: ['technical'] });
  // duplicate name with the other cycle
  assert.deepEqual(upd({ ...form, name: 'OTHER' }, version), { status: 'duplicate_name' });
  // follows keeps payment 1 on Application due
  const moved = followApplicationDue(form, '2027-03-20');
  assert.deepEqual(upd(moved, version), { status: 'ok', version: version + 1 });
  assert.ok(db().bb_cycle_plan_payments.filter((x) => x.payment_no === 1 && form.plans.some((pl) => pl.id === x.cycle_plan_id)).every((x) => x.due_on === '2027-03-20'));
  ({ form, version } = editForm(id));
  // later in the season: unchanged past dates are kept, a CHANGED past date is refused
  setDay('2027-04-10');
  assert.deepEqual(upd(form, version), { status: 'ok', version }); // Apr 3 and Mar 20 are past but unchanged
  const pastMove = { ...form, days: form.days.map((d, i) => (i === 0 ? { ...d, date: '2027-04-05' } : d)) };
  assert.deepEqual(upd(pastMove, version), { status: 'invalid' });
  const pastDue = setPaymentDueDate(form, form.plans[1].id, 2, '2027-04-01');
  assert.deepEqual(upd(pastDue, version), { status: 'invalid' });
  assert.deepEqual(call('bb_update_cycle', { p_cycle_id: randomUUID(), p_expected_version: 1, p_payload: buildUpdatePayload(form) }), { status: 'not_found' });
  setDay('2027-02-15');
});

check('store: registration switch (T4e)', () => {
  backend.reset();
  setDay('2027-02-15');
  const { id } = call('bb_add_cycle', addArgs());
  const sw = (open, version, ctx = ADMIN) => call('bb_set_registration', { p_cycle_id: id, p_expected_version: version, p_open: open }, ctx);
  // the placeholder waiver is current → waiver_needed (OI-1)
  assert.deepEqual(sw(true, 1), { status: 'waiver_needed' });
  const current = db().bb_waiver_versions[0];
  assert.equal(call('bb_save_waiver', { p_expected_current_id: current.id, p_body: 'The school waiver.' }).version_name, '2027-1');
  // closing works even now; same value → no write
  assert.equal(sw(false, 1).version, 1);
  assert.deepEqual(sw(true, 1, STAFF), { status: 'not_allowed' }); // 0024: the first opening is admin-only
  const opened = sw(true, 1);
  assert.equal(opened.first_open, true);
  assert.equal(opened.status, 'ok');
  assert.equal(opened.version, 2);
  assert.equal(opened.state.state, 'open');
  assert.equal(opened.state.public_status, 'open');
  assert.ok(db().bb_cycles[0].first_opened_at);
  assert.deepEqual(sw(true, 1), { status: 'stale' });
  // after Application due: closed by date; staff can't reopen; an admin can and auto close goes off
  setDay('2027-03-28');
  assert.equal(call('bb_cycles_list').cycles[0].state.state, 'closed_by_date');
  assert.equal(sw(false, 2, STAFF).version, 3); // staff close any time
  assert.deepEqual(sw(true, 3, STAFF), { status: 'not_allowed' });
  const reopened = sw(true, 3);
  assert.equal(reopened.version, 4);
  assert.equal(db().bb_cycles[0].auto_close, false);
  assert.equal(reopened.state.state, 'open');
  // a testing day after Application due with auto close on and the switch on → public closed
  setDay('2027-02-15');
  const two = call('bb_add_cycle', addArgs({ ...goodForm(), name: 'Two' }));
  assert.equal(call('bb_set_registration', { p_cycle_id: two.id, p_expected_version: 1, p_open: true }).status, 'ok');
  setDay('2027-04-03');
  const st2 = call('bb_cycles_list').cycles.find((c) => c.id === two.id).state;
  assert.equal(st2.state, 'testing_today');
  assert.equal(st2.public_status, 'closed');
  // past → finished (both directions)
  setDay('2027-06-06');
  assert.deepEqual(sw(false, 4), { status: 'finished' });
  assert.deepEqual(sw(true, 4), { status: 'finished' });
  assert.deepEqual(call('bb_set_registration', { p_cycle_id: id, p_expected_version: null, p_open: true }), { status: 'invalid' });
  setDay('2027-02-15');
});

check('store: delete cycle (T4f)', () => {
  backend.reset();
  setDay('2027-02-15');
  const { id } = call('bb_add_cycle', addArgs());
  const del = (version, n) => call('bb_delete_cycle', { p_cycle_id: id, p_expected_version: version, p_expected_candidate_count: n });
  assert.deepEqual(del(2, 0), { status: 'stale' });
  assert.deepEqual(del(1, 1), { status: 'stale' });
  // with a drawn waiver → has_waivers; with a payment row → has_payments (checked first)
  const s = db();
  const cand = { id: randomUUID(), cycle_id: id, status: 'withdrawn' };
  s.bb_candidates.push(cand);
  s.bb_candidate_waivers.push({ id: randomUUID(), candidate_id: cand.id, how: 'drawn' });
  saved = s;
  assert.deepEqual(del(1, 0), { status: 'stale' }); // withdrawn candidates count too
  assert.deepEqual(del(1, 1), { status: 'has_waivers' });
  const s2 = db();
  s2.bb_payments.push({ id: randomUUID(), candidate_id: cand.id, cycle_id: id, kind: 'payment' });
  saved = s2;
  assert.deepEqual(del(1, 1), { status: 'has_payments' });
  assert.equal(call('bb_cycles_list').cycles[0].has_payments, true);
  assert.equal(call('bb_cycles_list').cycles[0].has_form_waivers, true);
  assert.equal(call('bb_cycles_list').cycles[0].candidate_count, 0); // active only
  // without them → ok, everything under the cycle goes
  const s3 = db();
  s3.bb_payments = [];
  s3.bb_candidate_waivers = [{ id: randomUUID(), candidate_id: cand.id, how: 'paper' }];
  saved = s3;
  assert.deepEqual(del(1, 1), { status: 'ok' });
  const after = db();
  for (const t of ['bb_cycles', 'bb_cycle_days', 'bb_cycle_day_parts', 'bb_cycle_plans', 'bb_cycle_plan_amounts', 'bb_cycle_kukkiwon_fees',
    'bb_cycle_plan_payments', 'bb_candidates', 'bb_candidate_waivers']) assert.equal(after[t].length, 0, t);
  assert.deepEqual(del(1, 0), { status: 'not_found' });
});

check('store: save waiver (T3b)', () => {
  backend.reset();
  setDay('2027-02-15');
  const seed = db().bb_waiver_versions[0];
  const save = (expected, body) => call('bb_save_waiver', { p_expected_current_id: expected, p_body: body });
  assert.deepEqual(save(seed.id, '   '), { status: 'invalid' });
  assert.deepEqual(save(seed.id, 'x'.repeat(20001)), { status: 'invalid' });
  assert.deepEqual(save(randomUUID(), 'New text'), { status: 'stale' });
  // the same text (ignoring spaces at the ends) → the current version, nothing written
  assert.deepEqual(save(seed.id, `  ${seed.body}  `), { status: 'ok', id: seed.id, version_name: '2026-1' });
  assert.equal(db().bb_waiver_versions.length, 1);
  const first = save(seed.id, '  The school waiver.  ');
  assert.equal(first.version_name, '2027-1');
  const s = db();
  assert.equal(s.bb_waiver_versions.length, 2);
  assert.ok(s.bb_waiver_versions.find((v) => v.id === seed.id).superseded_at);
  const now = s.bb_waiver_versions.find((v) => v.id === first.id);
  assert.equal(now.body, 'The school waiver.');
  assert.equal(now.is_placeholder, false);
  assert.equal(save(first.id, 'Second text').version_name, '2027-2');
  assert.deepEqual(save(first.id, 'Third'), { status: 'stale' }); // first is no longer current
  assert.equal(s.bb_waiver_versions.filter((v) => v.superseded_at === null).length, 1);
});

check('store: keep years, confirm_needed → stale → ok + purge (T3c, T8)', () => {
  backend.loadSample();
  setDay('2027-02-15');
  // the sample has 3 / 3 (version 2); start from empty
  const keep = (version, n1, n2, confirm) => call('bb_set_keep_years', { p_expected_version: version, p_after_last_day: n1, p_after_18: n2, p_confirm_count: confirm });
  assert.equal(keep(2, null, null, null).status, 'confirm_needed');
  assert.equal(keep(2, null, null, 0).version, 3); // both empty: nothing is ever purged
  assert.deepEqual(keep(3, 3, null, null), { status: 'invalid' }); // one empty
  assert.deepEqual(keep(3, 2, 3, null), { status: 'invalid' });
  assert.deepEqual(keep(3, 3, 21, null), { status: 'invalid' });
  assert.deepEqual(keep(3, 3, 3, -1), { status: 'invalid' });
  assert.deepEqual(keep(9, 3, 3, null), { status: 'stale' });
  // Spring 2027 ends Jun 5, 2027. On Jun 6, 2030 (3 years + 1 day) the adults are due; Daniel
  // (born Mar 4, 2012) only on his 18th birthday + 3 years = Mar 4, 2033.
  setDay('2030-06-04');
  assert.deepEqual(keep(3, 3, 3, null), { status: 'confirm_needed', remove_count: 0 }); // 3 years − 1 day: kept
  setDay('2030-06-06');
  const confirm = keep(3, 3, 3, null);
  assert.deepEqual(confirm, { status: 'confirm_needed', remove_count: 5 });
  // nothing was saved or purged by the first step
  assert.equal(db().bb_settings[0].keep_years_after_last_day, null);
  assert.ok(db().bb_candidates.every((c) => c.date_of_birth !== null));
  assert.deepEqual(keep(3, 3, 3, 4), { status: 'stale' }); // the count changed since the screen asked
  const done = keep(3, 3, 3, 5);
  assert.deepEqual(done, { status: 'ok', version: 4, removed_count: 5 });
  const s = db();
  const purged = s.bb_candidates.filter((c) => c.personal_removed_at !== null);
  assert.equal(purged.length, 5);
  for (const c of purged) {
    assert.equal(c.date_of_birth, null);
    assert.equal(c.email_for_results, null);
    assert.ok(c.first_name && c.reference); // names, reference kept
    const w = s.bb_candidate_waivers.find((x) => x.candidate_id === c.id);
    assert.equal(w.signature, null);
    assert.equal(w.signer_name, null);
    assert.ok(w.removed_at);
    assert.ok(w.waiver_version_id && w.signed_at); // the version and date stay
  }
  const daniel = s.bb_candidates.find((c) => c.first_name === 'Daniel');
  assert.equal(daniel.date_of_birth, '2012-03-04'); // under 18: kept until 18 + 3 years
  assert.equal(daniel.version, 1); // the purge never bumps a version
  // the purge also runs from bb_cycles_list
  setDay('2033-03-04');
  call('bb_cycles_list');
  assert.equal(db().bb_candidates.find((c) => c.first_name === 'Daniel').date_of_birth, null);
  // a second purge right after changes nothing
  const snap = JSON.stringify(db());
  call('bb_cycles_list');
  assert.equal(JSON.stringify(db()), snap);
  setDay('2027-02-15');
});

check('store: failNextSave, simulateOtherAdminEdit, waiverChanged, links', () => {
  backend.loadSample();
  setDay('2027-02-15');
  const cycle = db().bb_cycles.find((c) => c.name === 'Spring 2027');
  backend.failNextSave();
  assert.equal(call('bb_cycles_list').status, 'ok'); // a read doesn't use it up
  const dropped = backend.rpc('bb_set_registration', { p_cycle_id: cycle.id, p_expected_version: cycle.version, p_open: false }, ADMIN);
  assert.equal(dropped.data, null);
  assert.match(dropped.error.message, /Failed to fetch/);
  assert.equal(db().bb_cycles.find((c) => c.id === cycle.id).registration_open, true); // nothing changed
  backend.simulateOtherAdminEdit();
  assert.deepEqual(call('bb_set_registration', { p_cycle_id: cycle.id, p_expected_version: cycle.version, p_open: false }), { status: 'stale' });
  assert.equal(db().bb_settings[0].version, 3);
  assert.equal(db().bb_waiver_versions.filter((v) => v.superseded_at === null)[0].version_name, '2027-2');
  const changed = backend.waiverChanged();
  assert.deepEqual(changed, { from: '2027-2', to: '2027-3' });
  const links = backend.links();
  assert.equal(links.length, 2);
  assert.ok(links.every((l) => codeIsValid(l.worcester) && codeIsValid(l.shrewsbury)));
});

check('store: the sample (contract 0016-B1 §2.1)', () => {
  backend.loadSample();
  setDay('2027-02-15');
  const list = call('bb_cycles_list');
  assert.deepEqual(list.cycles.map((c) => [c.name, c.first_day, c.state.state, c.candidate_count]), [
    ['Fall 2027', '2027-10-02', 'not_open_yet', 0], ['Spring 2027', '2027-04-03', 'open', 6]]);
  const s = db();
  assert.equal(s.bb_candidate_waivers.length, 6);
  assert.equal(s.bb_candidate_waivers.filter((w) => w.signed_as_minor).length, 1);
  assert.equal(s.bb_candidates.every((c) => c.source === 'form'), true);
  assert.equal(s.ref_counter, 5007);
  assert.equal(s.bb_waiver_versions.find((v) => v.superseded_at === null).version_name, '2027-1');
  assert.equal(call('bb_cycle_defaults').payload.prices_from, 'Fall 2027'); // the most recently created
  assert.deepEqual(s.bb_cycle_plans.filter((p) => p.cycle_id === s.bb_cycles[0].id).map((p) => p.name), ['In full', '3 payments', '2 payments']);
});

// ======================= public path (core) =======================

const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
function sampleCycle() {
  const s = db();
  const c = s.bb_cycles.find((x) => x.name === 'Spring 2027');
  const plans = s.bb_cycle_plans.filter((p) => p.cycle_id === c.id);
  return { c, plan: (name) => plans.find((p) => p.name === name).id };
}
const regInput = (code, plan, over = {}) => ({
  code, clientKey: 'k1', submissionId: randomUUID(), first: 'Jamie', last: 'Testkid', dateOfBirth: '2010-05-01', email: 'parent@example.com',
  dan: 1, cyclePlanId: plan, kukkiwon: true, acknowledged: true, waiverVersion: '2027-1', signerName: 'Jordan Testparent', signature: SIG, ...over,
});
const OK_ANSWER_KEYS = ['status', 'reference', 'first_name', 'last_name', 'dan', 'kukkiwon', 'plan_name', 'items', 'total_cents', 'cycle_name', 'school'].sort();

check('public: bb_public_cycle (T5a)', () => {
  backend.loadSample();
  setDay('2027-02-15');
  const { c } = sampleCycle();
  const w = backend.publicCycle(c.public_code_worcester);
  assert.equal(w.status, 'ok');
  assert.equal(w.state, 'open');
  assert.equal(w.closed_on, null);
  assert.deepEqual(w.school, { code: 'worcester', name: 'Worcester', address: null });
  assert.equal(backend.publicCycle(c.public_code_shrewsbury).school.code, 'shrewsbury');
  assert.deepEqual(Object.keys(w.cycle).sort(), ['application_due', 'days', 'kukkiwon', 'name', 'plans', 'requirements', 'submissions_due']);
  assert.deepEqual(Object.keys(w.cycle.plans[0]).sort(), ['amounts', 'id', 'name', 'payments', 'position']);
  assert.deepEqual(w.waiver, { version_name: '2027-1', body: db().bb_waiver_versions.find((v) => v.version_name === '2027-1').body });
  const text = JSON.stringify(w);
  assert.ok(!text.includes('Kim') && !text.includes('example.com'), 'no candidates in the public answer');
  assert.deepEqual(backend.publicCycle('zzzzzzzz'), { status: 'not_found' });
  assert.deepEqual(backend.publicCycle('BAD'), { status: 'not_found' });
});

check('public: register ok, idempotency, states, input, waiver, rate limit (T5b–T5h)', () => {
  backend.loadSample();
  setDay('2027-02-15');
  const { c, plan } = sampleCycle();
  const code = c.public_code_shrewsbury;
  const input = regInput(code, plan('3 payments'));
  const attemptsBefore = db().public_attempts.length;
  const answer = backend.publicRegister(input);
  assert.equal(answer.status, 'ok');
  assert.deepEqual(Object.keys(answer).sort(), OK_ANSWER_KEYS);
  assert.equal(answer.reference, 'BB-5007');
  assert.deepEqual(answer.school, { code: 'shrewsbury', name: 'Shrewsbury' });
  assert.equal(answer.plan_name, '3 payments');
  assert.equal(answer.cycle_name, 'Spring 2027');
  assert.deepEqual(answer.items, [
    { item: 'p1', due_on: '2027-03-27', amount_cents: 29000 }, { item: 'kukkiwon', due_on: '2027-03-27', amount_cents: 10000 },
    { item: 'p2', due_on: '2027-04-24', amount_cents: 29000 }, { item: 'p3', due_on: '2027-05-29', amount_cents: 29000 }]);
  assert.equal(answer.total_cents, 97000);
  const text = JSON.stringify(answer);
  for (const secret of ['2010-05-01', 'parent@example.com', 'Jordan', 'data:image']) assert.ok(!text.includes(secret), secret);
  let s = db();
  const cand = s.bb_candidates.find((x) => x.reference === 'BB-5007');
  assert.equal(cand.source, 'form');
  assert.equal(cand.location_code, 'shrewsbury');
  assert.equal(cand.kukkiwon_added_on, '2027-02-15');
  assert.equal(cand.created_by_name, 'Family form');
  const waiver = s.bb_candidate_waivers.find((x) => x.candidate_id === cand.id);
  assert.equal(waiver.how, 'drawn');
  assert.equal(waiver.signed_as_minor, true); // 16 on Apr 3
  assert.equal(waiver.signer_name, 'Jordan Testparent');
  assert.equal(s.public_attempts.length, attemptsBefore + 1);
  assert.equal(s.public_attempts[s.public_attempts.length - 1].outcome, 'bb:ok');
  // the same submission id → the same answer, no second row — also after registration closed
  assert.deepEqual(backend.publicRegister(input), answer);
  call('bb_set_registration', { p_cycle_id: c.id, p_expected_version: c.version, p_open: false });
  assert.deepEqual(backend.publicRegister(input), answer);
  assert.equal(db().bb_candidates.length, 7);
  // … and from a client key already over the limit
  assert.deepEqual(backend.publicRegister(input, { forceRateLimited: true }), answer);
  // the same id on another cycle → invalid
  const fall = db().bb_cycles.find((x) => x.name === 'Fall 2027');
  assert.deepEqual(backend.publicRegister({ ...input, code: fall.public_code_worcester }), { status: 'invalid' });
  // states: closed by hand (no date) / not open / closed by the date / finished
  assert.deepEqual(backend.publicRegister(regInput(code, plan('In full'))), { status: 'closed', closed_on: null });
  assert.deepEqual(backend.publicRegister(regInput(fall.public_code_worcester, plan('In full'))), { status: 'not_open' });
  const opened = call('bb_set_registration', { p_cycle_id: c.id, p_expected_version: c.version + 1, p_open: true });
  assert.equal(opened.status, 'ok');
  setDay('2027-03-28');
  assert.deepEqual(backend.publicRegister(regInput(code, plan('In full'))), { status: 'closed', closed_on: '2027-03-27' });
  setDay('2027-04-03'); // a testing day: still closed
  assert.deepEqual(backend.publicRegister(regInput(code, plan('In full'))), { status: 'closed', closed_on: '2027-03-27' });
  setDay('2027-06-06');
  assert.deepEqual(backend.publicRegister(regInput(code, plan('In full'))), { status: 'finished' });
  setDay('2027-02-15');
  // every input rule → invalid, nothing written (T5d)
  const n = db().bb_candidates.length;
  const bads = {
    'future DOB': { dateOfBirth: '2027-02-16' }, 'DOB before 1900': { dateOfBirth: '1899-12-31' }, 'bad email': { email: 'nope' },
    'plan of another cycle': { cyclePlanId: db().bb_cycle_plans.find((p) => p.cycle_id === fall.id).id }, 'Dan 5': { dan: 5 },
    unticked: { acknowledged: false }, 'non-PNG signature': { signature: 'data:image/jpeg;base64,AAAA' },
    'too long signature': { signature: `data:image/png;base64,${'A'.repeat(70000)}` }, 'blank signer': { signerName: '  ' },
    'blank first name': { first: '' }, 'kukkiwon missing': { kukkiwon: null }, 'version shape': { waiverVersion: 'v1' },
    'unknown version': { waiverVersion: '2031-1' }, 'no client key': { clientKey: '' },
  };
  for (const [label, over] of Object.entries(bads)) {
    assert.deepEqual(backend.publicRegister(regInput(code, plan('In full'), over)), { status: 'invalid' }, label);
  }
  assert.equal(db().bb_candidates.length, n);
  assert.deepEqual(backend.publicRegister(regInput('zzzzzzzz', plan('In full'))), { status: 'not_found' });
  // 18 or over on the first day → signed_as_minor false
  const adult = backend.publicRegister(regInput(code, plan('In full'), { first: 'Avery', dateOfBirth: '2009-04-03', kukkiwon: false }));
  assert.equal(adult.status, 'ok');
  assert.deepEqual(adult.items, [{ item: 'p1', due_on: '2027-03-27', amount_cents: 87000 }]);
  s = db();
  assert.equal(s.bb_candidate_waivers.find((w) => w.candidate_id === s.bb_candidates.find((x) => x.reference === adult.reference).id).signed_as_minor, false);
  // a late registrant: passed due dates show as today (S4)
  setDay('2027-03-27');
  const late = backend.publicRegister(regInput(code, plan('3 payments'), { first: 'Late' }));
  assert.equal(late.items[0].due_on, '2027-03-27');
  setDay('2027-02-15');
  // a possible duplicate (same names + DOB, any Dan) is flagged on both rows; the answer has the same shape
  const twin = backend.publicRegister(regInput(code, plan('In full'), { dan: 2, kukkiwon: false }));
  assert.deepEqual(Object.keys(twin).sort(), OK_ANSWER_KEYS);
  s = db();
  const a = s.bb_candidates.find((x) => x.reference === 'BB-5007');
  const b = s.bb_candidates.find((x) => x.reference === twin.reference);
  assert.equal(b.duplicate_state, 'possible');
  assert.equal(b.duplicate_of, a.id);
  assert.equal(a.duplicate_state, 'possible');
  assert.equal(a.duplicate_of, b.id);
  // every call wrote one attempts row; every outcome starts with bb:
  assert.ok(s.public_attempts.every((x) => x.outcome.startsWith('bb:')));
});

check('public: the 24-hour waiver rule (T5f) and the rate limit (T5g)', () => {
  backend.reset();
  setDay('2027-02-15');
  const { id } = call('bb_add_cycle', addArgs());
  const c = db().bb_cycles[0];
  const planId = db().bb_cycle_plans.find((p) => p.cycle_id === id).id;
  // open it straight in the store (the placeholder waiver is current: the switch refuses)
  let s = db();
  Object.assign(s.bb_cycles[0], { registration_open: true, first_opened_at: new Date(nowMs).toISOString() });
  saved = s;
  // the placeholder version (current) → waiver_changed
  assert.deepEqual(backend.publicRegister(regInput(c.public_code_worcester, planId, { waiverVersion: '2026-1' })), { status: 'waiver_changed' });
  const seed = db().bb_waiver_versions[0];
  call('bb_save_waiver', { p_expected_current_id: seed.id, p_body: 'Version one' }); // 2027-1, the placeholder superseded now
  assert.deepEqual(backend.publicRegister(regInput(c.public_code_worcester, planId, { waiverVersion: '2026-1' })), { status: 'waiver_changed' }); // placeholder, a minute ago
  const v1 = db().bb_waiver_versions.find((v) => v.version_name === '2027-1');
  advance(60 * 60000);
  call('bb_save_waiver', { p_expected_current_id: v1.id, p_body: 'Version two' }); // 2027-2: v1 superseded now
  advance((23 * 60 + 59) * 60000);
  const ok = backend.publicRegister(regInput(c.public_code_worcester, planId, { waiverVersion: '2027-1', clientKey: 'k-w' }));
  assert.equal(ok.status, 'ok'); // 23 h 59 min after it was replaced: accepted …
  s = db();
  const stored = s.bb_candidate_waivers.find((w) => w.candidate_id === s.bb_candidates.find((x) => x.reference === ok.reference).id);
  assert.equal(stored.waiver_version_id, v1.id); // … and stored exactly
  advance(2 * 60000);
  assert.deepEqual(backend.publicRegister(regInput(c.public_code_worcester, planId, { waiverVersion: '2027-1' })), { status: 'waiver_changed' }); // 24 h 1 min
  // rate limit: the 21st call within an hour for one key → rate_limited
  setDay('2027-02-17');
  for (let i = 0; i < 20; i += 1) backend.publicRegister(regInput(c.public_code_worcester, planId, { clientKey: 'flood', dan: 9 }));
  assert.deepEqual(backend.publicRegister(regInput(c.public_code_worcester, planId, { clientKey: 'flood', waiverVersion: '2027-2' })), { status: 'rate_limited' });
  assert.equal(backend.publicRegister(regInput(c.public_code_worcester, planId, { clientKey: 'other', waiverVersion: '2027-2' })).status, 'ok');
  // rows older than 2 days are removed by the next call
  setDay('2027-02-20');
  backend.publicRegister(regInput('zzzzzzzz', planId));
  assert.equal(db().public_attempts.length, 1);
  assert.equal(db().public_attempts[0].event_id, null);
  assert.equal(db().public_attempts[0].outcome, 'bb:not_found');
  setDay('2027-02-15');
});

// =====================================================================================
// ======================= Phase B2: candidates and payments (contract 0016-B2 §5) =======================
// =====================================================================================
// The cases of 0016_tests.sql T6–T7 that don't need real sign-in sessions, replayed against
// rules.js, money.js and the preview database.

// ----- money.js: payment amounts -----

check('B2 money: parseAmount ($0.01–$5,000, any cents)', () => {
  assert.deepEqual(parseAmount('0'), { problem: 'tooLow' });
  assert.deepEqual(parseAmount('0.00'), { problem: 'tooLow' });
  assert.deepEqual(parseAmount('0.01'), { cents: 1 });
  assert.deepEqual(parseAmount('290'), { cents: 29000 });
  assert.deepEqual(parseAmount('$290.50'), { cents: 29050 });
  assert.deepEqual(parseAmount('290.5'), { cents: 29050 });
  assert.deepEqual(parseAmount('290.505'), { problem: 'tooManyDecimals' });
  assert.deepEqual(parseAmount('5000'), { cents: 500000 });
  assert.deepEqual(parseAmount('$5,000.00'), { cents: 500000 });
  assert.deepEqual(parseAmount('5000.01'), { problem: 'tooHigh' });
  assert.deepEqual(parseAmount('99999999999999999999'), { problem: 'tooHigh' });
  assert.deepEqual(parseAmount('-5'), { problem: 'notNumber' });
  assert.deepEqual(parseAmount('1,350'), { cents: 135000 });
  assert.deepEqual(parseAmount(' $1,350 '), { cents: 135000 });
  assert.deepEqual(parseAmount('.50'), { cents: 50 });
  assert.deepEqual(parseAmount(''), { problem: 'empty' });
  assert.deepEqual(parseAmount(null), { problem: 'empty' });
  assert.deepEqual(parseAmount('abc'), { problem: 'notNumber' });
  assert.deepEqual(parseAmount('2 90'), { problem: 'notNumber' });
  assert.deepEqual(parseAmount('1.2.3'), { problem: 'notNumber' });
  assert.deepEqual(parseAmount('290.'), { problem: 'notNumber' });
});

check('B2 money: formatCents and amountInputText', () => {
  assert.equal(formatCents(29000), '$290');
  assert.equal(formatCents(29050), '$290.50');
  assert.equal(formatCents(270000), '$2,700');
  assert.equal(formatCents(1), '$0.01');
  assert.equal(formatCents(0), '$0');
  assert.equal(formatCents(-29000), '−$290');
  assert.equal(formatCents(-5005), '−$50.05');
  assert.equal(formatCents(2200000000), '$22,000,000'); // bigint sums arrive as plain numbers
  assert.equal(formatCents(null), '');
  assert.equal(amountInputText(29000), '290');
  assert.equal(amountInputText(29050), '290.50');
  assert.equal(amountInputText(135000), '1350');
  for (const cents of [1, 99, 29050, 135000, 500000]) assert.deepEqual(parseAmount(amountInputText(cents)), { cents });
});

// ----- rules.js: items and money (SQL 10c / 10d, T7b) -----

// The T7 plan: 1st Dan, 3 × $290 or $870 in full, Kukkiwon $100 (dates: Mar 27, Apr 13, Apr 20).
const P3 = [{ paymentNo: 1, dueOn: '2027-03-27' }, { paymentNo: 2, dueOn: '2027-04-13' }, { paymentNo: 3, dueOn: '2027-04-20' }];
const items3 = (over = {}) => candidateItems({ planPayments: P3, amounts: [29000, 29000, 29000], kukkiwon: false, kukkiwonFee: 10000, registeredOn: '2027-03-01', ...over });
const itemsFull = (over = {}) => candidateItems({ planPayments: [{ paymentNo: 1, dueOn: '2027-03-27' }], amounts: [87000], kukkiwonFee: 10000, registeredOn: '2027-03-01', ...over });
let lineN = 0;
// A live line as the detail sends it (recorded one minute apart, in the order written).
const pay = (cents, items, extra = {}) => {
  lineN += 1;
  return { id: `00000000-0000-4000-8000-${String(lineN).padStart(12, '0')}`, kind: 'payment', amountCents: cents, forItems: items, recordedAt: new Date(Date.UTC(2027, 2, 1, 12, lineN)).toISOString(), returned: false, ...extra };
};
const refundLine = (cents) => ({ ...pay(-cents, null), kind: 'refund' });
const returnedLine = (cents) => ({ ...pay(-cents, null), kind: 'returned' });

check('B2 rules: candidateItems = SQL 10c (S4 floor, Kukkiwon, order)', () => {
  assert.deepEqual(items3(), [
    { item: 'p1', label: 'Payment 1', dueOn: '2027-03-27', amountCents: 29000 },
    { item: 'p2', label: 'Payment 2', dueOn: '2027-04-13', amountCents: 29000 },
    { item: 'p3', label: 'Payment 3', dueOn: '2027-04-20', amountCents: 29000 },
  ]);
  // Kukkiwon with payment 1: order p1, kukkiwon, p2, p3
  assert.deepEqual(items3({ kukkiwon: true, kukkiwonAddedOn: '2027-03-01' }).map((x) => `${x.item}@${x.dueOn}`),
    ['p1@2027-03-27', 'kukkiwon@2027-03-27', 'p2@2027-04-13', 'p3@2027-04-20']);
  // a late family (registered after payment 1's date): that date counts from the day they registered
  assert.deepEqual(items3({ registeredOn: '2027-04-01' }).map((x) => `${x.item}@${x.dueOn}`), ['p1@2027-04-01', 'p2@2027-04-13', 'p3@2027-04-20']);
  assert.deepEqual(items3({ registeredOn: '2027-04-15' }).map((x) => `${x.item}@${x.dueOn}`), ['p1@2027-04-15', 'p2@2027-04-15', 'p3@2027-04-20']);
  // Kukkiwon added after payment 2's date: due that day, after p2
  assert.deepEqual(items3({ kukkiwon: true, kukkiwonAddedOn: '2027-04-14' }).map((x) => `${x.item}@${x.dueOn}`),
    ['p1@2027-03-27', 'p2@2027-04-13', 'kukkiwon@2027-04-14', 'p3@2027-04-20']);
  // added on payment 2's own date: the tie order puts kukkiwon (15) before p2 (20)
  assert.deepEqual(items3({ kukkiwon: true, kukkiwonAddedOn: '2027-04-13' }).map((x) => `${x.item}@${x.dueOn}`),
    ['p1@2027-03-27', 'kukkiwon@2027-04-13', 'p2@2027-04-13', 'p3@2027-04-20']);
  // no fee row → no Kukkiwon item (the SQL's join); snake_case payments work too
  assert.equal(items3({ kukkiwon: true, kukkiwonAddedOn: '2027-03-01', kukkiwonFee: null }).length, 3);
  assert.equal(candidateItems({ planPayments: [{ payment_no: 1, due_on: '2027-03-27' }], amounts: [87000], registeredOn: '2027-03-01' })[0].dueOn, '2027-03-27');
});

check('B2 rules: candidateMoney = SQL 10d (every T7b case)', () => {
  // nothing paid: gray Next before and ON the first due date, red Not paid after
  const none = candidateMoney({ items: items3(), lines: [], today: '2027-03-26' });
  assert.equal(none.tag, 'next');
  assert.equal(none.nextOn, '2027-03-27');
  assert.equal(none.nextCents, 29000);
  assert.equal(none.totalDueCents, 87000);
  assert.equal(none.balanceCents, 87000);
  assert.equal(none.lateSince, null);
  assert.equal(candidateMoney({ items: items3(), lines: [], today: '2027-03-27' }).tag, 'next');
  const notPaid = candidateMoney({ items: items3(), lines: [], today: '2027-03-28' });
  assert.equal(notPaid.tag, 'not_paid');
  assert.equal(notPaid.nextOn, null);
  assert.equal(notPaid.lateSince, null); // only set for 'late'
  // three post-dated checks → Paid in full
  const three = candidateMoney({ items: items3(), lines: [pay(29000, ['p1']), pay(29000, ['p2']), pay(29000, ['p3'])], today: '2027-05-01' });
  assert.equal(three.tag, 'paid_in_full');
  assert.equal(three.overpaidCents, 0);
  assert.equal(three.balanceCents, 0);
  // Omar: payments 1–3 paid, the Kukkiwon fee not → Late, Kukkiwon only, since payment 1's date
  const omar = candidateMoney({
    items: items3({ kukkiwon: true, kukkiwonAddedOn: '2027-03-01' }), lines: [pay(29000, ['p1']), pay(29000, ['p2']), pay(29000, ['p3'])], today: '2027-03-28',
  });
  assert.equal(omar.tag, 'late');
  assert.equal(omar.lateKukkiwonOnly, true);
  assert.equal(omar.lateSince, '2027-03-27');
  assert.equal(omar.lateCents, 10000);
  assert.deepEqual(omar.items.map((x) => x.item), ['p1', 'kukkiwon', 'p2', 'p3']);
  // an amount smaller than its ticked items: payment 1 first, Kukkiwon unpaid
  const dee = candidateMoney({ items: items3({ kukkiwon: true, kukkiwonAddedOn: '2027-03-01' }), lines: [pay(20000, ['kukkiwon', 'p1'])], today: '2027-03-01' });
  assert.deepEqual([dee.items[0].paidCents, dee.items[0].remainingCents, dee.items[1].paidCents], [20000, 9000, 0]);
  assert.equal(dee.tag, 'next');
  assert.equal(dee.nextCents, 9000 + 10000);
  // an extra payment → Paid in full + overpaid
  const eve = candidateMoney({ items: itemsFull(), lines: [pay(87000, ['p1']), pay(5000, ['p1'])], today: '2027-03-01' });
  assert.equal(eve.tag, 'paid_in_full');
  assert.equal(eve.overpaidCents, 5000);
  assert.equal(eve.balanceCents, -5000);
  // a late family: a passed due date counts from the day they registered
  const fay = candidateMoney({ items: items3({ registeredOn: '2027-04-01' }), lines: [], today: '2027-04-01' });
  assert.equal(fay.tag, 'next');
  assert.equal(fay.nextOn, '2027-04-01');
  assert.equal(fay.items[0].dueOn, '2027-04-01');
  // Kukkiwon added after payment 1's date: due at once (gray Next that day, Late the next day)
  const kItems = items3({ registeredOn: '2027-04-01', kukkiwon: true, kukkiwonAddedOn: '2027-04-02' });
  const kLines = [pay(29000, ['p1'])];
  const k1 = candidateMoney({ items: kItems, lines: kLines, today: '2027-04-02' });
  assert.deepEqual([k1.tag, k1.nextOn, k1.nextCents], ['next', '2027-04-02', 10000]);
  const k2 = candidateMoney({ items: kItems, lines: kLines, today: '2027-04-03' });
  assert.deepEqual([k2.tag, k2.lateKukkiwonOnly, k2.lateSince], ['late', true, '2027-04-02']);
  // money for an item the plan no longer has → the earliest unpaid item
  const gus = candidateMoney({ items: itemsFull(), lines: [pay(29000, ['p3'])], today: '2027-03-01' });
  assert.equal(gus.items.length, 1);
  assert.deepEqual([gus.items[0].paidCents, gus.items[0].remainingCents], [29000, 58000]);
  // a refund comes off the overpaid amount first …
  const eveRefund = candidateMoney({ items: itemsFull(), lines: [pay(87000, ['p1']), pay(5000, ['p1']), refundLine(3000)], today: '2027-03-01' });
  assert.deepEqual([eveRefund.overpaidCents, eveRefund.items[0].paidCents, eveRefund.paidCents, eveRefund.tag], [2000, 87000, 89000, 'paid_in_full']);
  // … then off the items from the LATEST backwards (T7f: check $290 + cash $50, refund $100 → p1 $240)
  const back = candidateMoney({ items: items3(), lines: [pay(29000, ['p1']), pay(5000, ['p1']), refundLine(10000)], today: '2027-03-01' });
  assert.deepEqual(back.items.map((x) => x.paidCents), [24000, 0, 0]);
  assert.equal(back.paidCents, 24000);
  // a returned check: not counted, but still a live payment row → Late (not Not paid)
  const bounced = candidateMoney({ items: items3(), lines: [pay(29000, ['p1'], { returned: true }), returnedLine(29000)], today: '2027-03-28' });
  assert.deepEqual([bounced.tag, bounced.paidCents, bounced.balanceCents, bounced.items[0].paidCents], ['late', 0, 87000, 0]);
  // T7f: a check, a refund, then the check bounces: the net goes below zero; Late; balance 970
  const max = candidateMoney({ items: items3(), lines: [pay(29000, ['p1'], { returned: true }), refundLine(10000), returnedLine(29000)], today: '2027-03-28' });
  assert.deepEqual([max.tag, max.paidCents, max.balanceCents, max.overpaidCents], ['late', -10000, 97000, 0]);
  // hasLivePayment
  assert.equal(hasLivePayment([]), false);
  assert.equal(hasLivePayment([refundLine(100)]), false);
  assert.equal(hasLivePayment([pay(100, ['p1'], { returned: true })]), true);
});

check('B2 rules: liveLines, Record payment helpers, predictMoney', () => {
  const rows = [
    { id: 'a', kind: 'payment', amount_cents: 29000, for_items: ['p1'], recorded_at: '2027-03-27T15:00:00.000Z', reverses_payment_id: null },
    { id: 'b', kind: 'payment', amount_cents: 29000, for_items: ['p2'], recorded_at: '2027-03-27T15:01:00.000Z', reverses_payment_id: null },
    { id: 'c', kind: 'returned', amount_cents: -29000, for_items: null, recorded_at: '2027-04-26T15:00:00.000Z', reverses_payment_id: 'b' },
    { id: 'd', kind: 'payment', amount_cents: 100, for_items: ['p3'], recorded_at: '2027-03-27T15:02:00.000Z', reverses_payment_id: null },
    { id: 'e', kind: 'reversal', amount_cents: -100, for_items: null, recorded_at: '2027-03-27T15:03:00.000Z', reverses_payment_id: 'd' },
  ];
  const live = liveLines(rows);
  assert.deepEqual(live.map((l) => `${l.id}:${l.kind}:${l.returned}`), ['a:payment:false', 'b:payment:true', 'c:returned:false']);
  // undoing the returned mark makes the check count again
  const unmarked = liveLines([...rows, { id: 'f', kind: 'reversal', amount_cents: 29000, for_items: null, recorded_at: '2027-04-26T16:00:00.000Z', reverses_payment_id: 'c' }]);
  assert.deepEqual(unmarked.map((l) => `${l.id}:${l.returned}`), ['a:false', 'b:false']);
  // the T7 candidate on Apr 15: p1 paid, p2 + p3 owed
  const money = candidateMoney({ items: items3(), lines: [pay(29000, ['p1'])], today: '2027-04-15' });
  assert.deepEqual(dueNowItems(money, '2027-04-15').map((x) => x.item), ['p2']);
  assert.deepEqual(nextItems(money).map((x) => x.item), ['p2']);
  assert.deepEqual(defaultTicks(money, '2027-04-15'), ['p2']);
  assert.deepEqual(defaultTicks(money, '2027-04-01'), ['p2']); // nothing due yet → the next items
  assert.deepEqual(defaultTicks(candidateMoney({ items: items3({ kukkiwon: true, kukkiwonAddedOn: '2027-03-01' }), lines: [], today: '2027-03-27' }), '2027-03-27'), ['p1', 'kukkiwon']);
  assert.deepEqual(defaultTicks(candidateMoney({ items: itemsFull(), lines: [pay(87000, ['p1'])], today: '2027-04-01' }), '2027-04-01'), []); // paid in full
  assert.equal(sumRemaining(money, ['p2', 'p3']), 58000);
  assert.equal(sumRemaining(money, ['p1']), 0);
  // predictMoney: Change plan (Rina: In full → 3 payments + Kukkiwon, chosen today) and a returned check
  const cycle = {
    plans: [
      { id: 'full', payments: [{ paymentNo: 1, dueOn: '2027-03-27' }], amounts: { 1: [87000] } },
      { id: 'three', payments: P3, amounts: { 1: [29000, 29000, 29000] } },
    ],
    kukkiwon: { 1: 10000 },
  };
  const changed = predictMoney({ cycle, planId: 'three', dan: 1, kukkiwon: true, registeredOn: '2027-03-01', lines: [pay(29000, ['p1'])], today: '2027-04-15' });
  assert.equal(changed.totalDueCents, 97000);
  assert.equal(changed.items.find((x) => x.item === 'kukkiwon').dueOn, '2027-04-15'); // newly chosen = today
  const check1 = pay(29000, ['p2']);
  const returned = predictMoney({ cycle, planId: 'three', dan: 1, registeredOn: '2027-03-01', lines: [pay(29000, ['p1']), check1], today: '2027-04-15', returnedPaymentId: check1.id });
  assert.deepEqual([returned.tag, returned.lateSince, returned.lateCents, returned.paidCents], ['late', '2027-04-13', 29000, 29000]);
  assert.deepEqual(cycleCandidateItems(cycle, { planId: 'nope', dan: 1, registeredOn: '2027-03-01' }), []);
});

// ----- rules.js: the roster helpers -----

// A roster row of the preview database (snake_case) → the RosterRow fields the helpers read.
const toRow = (r) => ({
  id: r.id, firstName: r.first_name, lastName: r.last_name, locationCode: r.location_code, status: r.status, reference: r.reference,
  duplicateState: r.duplicate_state, duplicateOf: r.duplicate_of, money: { tag: r.money.tag },
});

check('B2 rules: rosterCards, rosterFilter, searchMatches, duplicatePairs, pairReturnedLines', () => {
  setDay('2027-04-26');
  backend.loadSampleRoster();
  const spring = db().bb_cycles.find((c) => c.name === 'Spring 2027');
  const rows = call('bb_cycle_roster', { p_cycle_id: spring.id }).rows.map(toRow);
  assert.deepEqual(rosterCards(rows), { paidInFull: 2, onSchedule: 2, late: 2, notPaid: 1, duplicatesLeftOut: 2 }); // as drawn
  assert.deepEqual(rosterCards(rows, { school: 'Worcester' }), { paidInFull: 1, onSchedule: 0, late: 1, notPaid: 1, duplicatesLeftOut: 2 });
  assert.deepEqual(rosterCards(rows, { school: 'shrewsbury' }), { paidInFull: 1, onSchedule: 2, late: 1, notPaid: 0, duplicatesLeftOut: 0 });
  // withdrawn rows are left out of the cards
  const withdrawn = rows.map((r) => (r.firstName === 'Mia' ? { ...r, status: 'withdrawn' } : r));
  assert.equal(rosterCards(withdrawn).paidInFull, 1);
  assert.equal(rosterFilter(withdrawn).length, 9); // without a card the Removed rows stay (the screen groups them)
  assert.deepEqual(rosterFilter(rows, { card: 'late' }).map((r) => r.lastName), ['Lee', 'Nguyen']);
  assert.deepEqual(rosterFilter(rows, { card: 'late', school: 'Worcester' }).map((r) => r.lastName), ['Lee']);
  assert.equal(rosterFilter(withdrawn, { card: 'paidInFull' }).length, 1);
  assert.deepEqual(rosterFilter(rows, { search: 'noah' }).length, 2);
  assert.ok(searchMatches(rows.find((r) => r.lastName === 'Kim'), ' Alex  KIM '));
  assert.ok(searchMatches(rows.find((r) => r.lastName === 'Kim'), 'alexkim'));
  const ref = rows.find((r) => r.lastName === 'Kim').reference;
  assert.ok(searchMatches(rows.find((r) => r.lastName === 'Kim'), ref.toLowerCase()));
  assert.ok(searchMatches(rows.find((r) => r.lastName === 'Kim'), ref.slice(3)));
  assert.ok(!searchMatches(rows.find((r) => r.lastName === 'Kim'), 'chen'));
  assert.ok(searchMatches(rows[0], ''));
  const pairs = duplicatePairs(rows);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].row.lastName, pairs[0].partner.lastName], ['Silva', 'Silva']);
  assert.equal(duplicatePairs(rows.filter((r) => r.id !== pairs[0].partner.id)).length, 1);
  // pairReturnedLines: each returned line → the earliest unpaired returned payment of that amount
  const lines = [
    { kind: 'payment', amountCents: 39000, forItems: ['p1', 'kukkiwon'], returned: false },
    { kind: 'payment', amountCents: 29000, forItems: ['p2'], returned: true },
    { kind: 'payment', amountCents: 29000, forItems: ['p3'], returned: true },
    { kind: 'returned', amountCents: -29000, forItems: null, returned: false },
    { kind: 'refund', amountCents: -5000, forItems: null, returned: false },
    { kind: 'returned', amountCents: -29000, forItems: null, returned: false },
    { kind: 'returned', amountCents: -12345, forItems: null, returned: false },
  ];
  assert.deepEqual(pairReturnedLines(lines), [null, null, null, ['p2'], null, ['p3'], null]);
  assert.deepEqual(pairReturnedLines([]), []);
});

// ----- the preview database: candidates and payments -----

// Every B2 call, with throw-away arguments (for the access and role checks).
const B2_CALLS = () => {
  const id = randomUUID();
  return {
    bb_cycle_roster: { p_cycle_id: id },
    bb_candidate_detail: { p_candidate_id: id },
    bb_view_signature: { p_candidate_id: id },
    bb_receipt: { p_candidate_id: id },
    bb_add_candidate: {
      p_cycle_id: id, p_first: 'A', p_last: 'B', p_date_of_birth: '2000-01-01', p_email: 'a@example.com', p_location_code: 'worcester',
      p_dan: 1, p_cycle_plan_id: id, p_kukkiwon: false, p_paper_waiver: true,
    },
    bb_update_candidate: {
      p_candidate_id: id, p_expected_version: 1, p_first: 'A', p_last: 'B', p_date_of_birth: '2000-01-01', p_email: 'a@example.com',
      p_location_code: 'worcester', p_dan: 1,
    },
    bb_change_plan: { p_candidate_id: id, p_expected_version: 1, p_cycle_plan_id: id, p_kukkiwon: false },
    bb_resolve_duplicate: { p_keep_id: id, p_keep_version: 1, p_other_id: randomUUID(), p_other_version: 1, p_keep_both: true },
    bb_withdraw_candidate: { p_candidate_id: id, p_expected_version: 1 },
    bb_restore_candidate: { p_candidate_id: id, p_expected_version: 1 },
    bb_delete_candidate: { p_candidate_id: id, p_expected_version: 1 },
    bb_record_paper_waiver: { p_candidate_id: id, p_expected_version: 1 },
    bb_record_payment: { p_candidate_id: id, p_expected_version: 1, p_amount_cents: 100, p_method: 'cash', p_for_items: ['p1'], p_note: null },
    bb_undo_payment: { p_payment_id: id },
    bb_edit_payment: { p_payment_id: id, p_amount_cents: 100, p_method: 'cash', p_for_items: ['p1'], p_note: null, p_reason: 'x' },
    bb_record_refund: { p_candidate_id: id, p_expected_version: 1, p_amount_cents: 100, p_method: 'cash', p_note: null },
    bb_mark_check_returned: { p_payment_id: id, p_note: null },
  };
};
const B2_ADMIN_ONLY = ['bb_withdraw_candidate', 'bb_delete_candidate', 'bb_edit_payment', 'bb_record_refund', 'bb_mark_check_returned', 'bb_view_signature'];

// The payment rows before a call must still be there, unchanged, after it (append-only).
let paymentsBefore = [];
const keepPayments = () => { paymentsBefore = JSON.parse(JSON.stringify(db().bb_payments)); };
const assertAppendOnly = (label) => {
  const after = db().bb_payments;
  for (const row of paymentsBefore) assert.deepEqual(after.find((p) => p.id === row.id), row, `${label}: a payment row changed or went`);
};
// A B2 write with the append-only check around it.
const w = (name, args, ctx = ADMIN) => {
  keepPayments();
  const answer = call(name, args, ctx);
  assertAppendOnly(name);
  return answer;
};
const springOf = () => db().bb_cycles.find((c) => c.name.startsWith('Spring 2027')); // (one check renames it)
const fallOf = () => db().bb_cycles.find((c) => c.name === 'Fall 2027');
const planOf = (cycle, name) => db().bb_cycle_plans.find((p) => p.cycle_id === cycle.id && p.name === name).id;
const person = (first, last) => db().bb_candidates.find((c) => c.first_name === first && c.last_name === last);
const version = (id) => db().bb_candidates.find((c) => c.id === id).version;
// A 1st Dan desk candidate of Spring 2027 at Worcester (the T7 bbt_add), staff by default.
const addDesk = (first, plan = '3 payments', kukkiwon = false, ctx = STAFF, over = {}) => {
  const spring = springOf();
  const r = w('bb_add_candidate', {
    p_cycle_id: spring.id, p_first: first, p_last: 'Payer', p_date_of_birth: '1990-01-01', p_email: `${first.toLowerCase()}@example.com`,
    p_location_code: 'worcester', p_dan: 1, p_cycle_plan_id: planOf(spring, plan), p_kukkiwon: kukkiwon, p_paper_waiver: true, ...over,
  }, ctx);
  assert.equal(r.status, 'ok', `addDesk ${first}: ${JSON.stringify(r)}`);
  return r.id;
};
const payArgs = (candidateId, cents, method, items, note = null) => ({
  p_candidate_id: candidateId, p_expected_version: version(candidateId), p_amount_cents: cents, p_method: method, p_for_items: items, p_note: note,
});
const fresh = () => {
  setDay('2027-04-26');
  backend.loadSampleRoster();
};
const SECRET_KEYS = ['"date_of_birth"', '"email_for_results"', '"signer_name"', '"signature"', '"recorded_by"'];

check('B2 store: no_access first, then the role (A functions), then the input', () => {
  fresh();
  for (const [name, args] of Object.entries(B2_CALLS())) {
    assert.deepEqual(call(name, args, LOCKED), { status: 'no_access' }, name);
    if (B2_ADMIN_ONLY.includes(name)) assert.deepEqual(call(name, args, STAFF), { status: 'not_allowed' }, name);
    else assert.notEqual(call(name, args, STAFF).status, 'not_allowed', name);
    assert.ok(BB_RPC_NAMES.includes(name), name);
  }
  // the 13 writes are failNextSave's; the roster runs the purge, so it can't be a GET
  const writes = Object.keys(B2_CALLS()).filter((n) => !['bb_cycle_roster', 'bb_candidate_detail', 'bb_view_signature', 'bb_receipt'].includes(n));
  assert.equal(writes.length, 13);
  for (const name of writes) assert.ok(BB_WRITE_RPC_NAMES.includes(name), name);
  assert.equal(backend.rpc('bb_cycle_roster', { p_cycle_id: springOf().id }, ADMIN, { get: true }).error.code, '25006');
  assert.equal(backend.rpc('bb_candidate_detail', { p_candidate_id: randomUUID() }, ADMIN, { get: true }).error, null); // a read
  // the new argument types: a date and a text list
  const bad = { ...B2_CALLS().bb_add_candidate, p_date_of_birth: 'Jan 2' };
  assert.equal(backend.rpc('bb_add_candidate', bad, ADMIN).error.code, '22007');
  assert.equal(backend.rpc('bb_record_payment', { ...B2_CALLS().bb_record_payment, p_for_items: 'p1' }, ADMIN).error.code, '22P02');
  assert.equal(backend.rpc('bb_record_payment', { ...B2_CALLS().bb_record_payment, p_for_items: [['p1']] }, ADMIN).error.code, '22P02');
  // internal helpers: permission denied for the app
  for (const name of ['bb_candidate_money', 'bb_candidate_items', 'bb_lock_candidate', 'bb_find_duplicate', 'bb_purge_is_due']) {
    assert.equal(backend.rpc(name, {}, ADMIN).error.code, '42501', name);
  }
  // null arguments → invalid (the reads too)
  for (const name of ['bb_cycle_roster', 'bb_candidate_detail', 'bb_receipt']) {
    const args = Object.fromEntries(Object.keys(B2_CALLS()[name]).map((k) => [k, null]));
    assert.deepEqual(call(name, args), { status: 'invalid' }, name);
    assert.deepEqual(call(name, B2_CALLS()[name]), { status: 'not_found' }, name);
  }
});

check('B2 store: the roster = 16c (Candidates 1 sample, order, money, no personal data)', () => {
  fresh();
  const spring = springOf();
  const answer = call('bb_cycle_roster', { p_cycle_id: spring.id });
  assert.equal(answer.status, 'ok');
  assert.equal(answer.state.registration, 'closed_by_date');
  assert.deepEqual(answer.rows.map((r) => `${r.dan} ${r.location_code} ${r.last_name}`), [
    '1 worcester Chen', '1 worcester Patel', '1 shrewsbury Kim', '2 worcester Lee', '2 worcester Silva',
    '2 worcester Silva', '2 shrewsbury Brooks', '3 shrewsbury Nguyen', '4 shrewsbury Garcia',
  ]);
  assert.deepEqual(Object.keys(answer.rows[0]).sort(), ['dan', 'duplicate_of', 'duplicate_state', 'first_name', 'has_payment_rows', 'id', 'kukkiwon',
    'last_name', 'location_code', 'money', 'plan_id', 'plan_name', 'reference', 'registered_at', 'source', 'status', 'version', 'withdrawn_reason',
    'is_makeup', 'makeup_of_cycle_name', 'retest_names', 'has_grades'].sort()); // (the last four: 0025 §6.5)
  const byLast = (last, i = 0) => answer.rows.filter((r) => r.last_name === last)[i];
  assert.equal(byLast('Kim').money.items, undefined); // the roster's money has no item list
  const tag = (r) => [r.money.tag, r.money.balance_cents];
  assert.deepEqual(tag(byLast('Kim')), ['paid_in_full', 0]);
  assert.deepEqual(tag(byLast('Chen')), ['paid_in_full', 0]);
  assert.deepEqual(tag(byLast('Patel')), ['not_paid', 87000]);
  assert.deepEqual([...tag(byLast('Brooks')), byLast('Brooks').money.next_on, byLast('Brooks').money.next_cents], ['next', 33000, '2027-05-29', 33000]);
  assert.deepEqual([...tag(byLast('Lee')), byLast('Lee').money.late_since, byLast('Lee').money.late_cents], ['late', 66000, '2027-04-24', 33000]);
  assert.deepEqual([byLast('Silva', 0).duplicate_state, byLast('Silva', 1).duplicate_state], ['possible', 'possible']);
  assert.deepEqual([byLast('Silva', 0).money.balance_cents, byLast('Silva', 1).money.balance_cents].sort(), [110000, 99000].sort());
  assert.deepEqual([...tag(byLast('Nguyen')), byLast('Nguyen').money.late_cents, byLast('Nguyen').money.late_since], ['late', 100000, 50000, '2027-04-24']);
  assert.deepEqual([...tag(byLast('Garcia')), byLast('Garcia').money.next_on], ['next', 135000, '2027-05-29']);
  assert.equal(byLast('Kim').has_payment_rows, true);
  assert.equal(byLast('Patel').has_payment_rows, false);
  const text = JSON.stringify(answer);
  for (const key of SECRET_KEYS) assert.ok(!text.includes(key), key);
  assert.ok(!text.includes('2012-03-04') && !text.includes('@example.com'));
  // the edge sample: Candidates 9 and the rest
  backend.loadSampleEdge();
  const edge = call('bb_cycle_roster', { p_cycle_id: springOf().id }).rows;
  const e = (last) => edge.find((r) => r.last_name === last);
  assert.deepEqual([e('Owens').money.tag, e('Owens').money.overpaid_cents, e('Owens').money.balance_cents], ['paid_in_full', 5000, -5000]);
  assert.deepEqual([e('Haddad').money.tag, e('Haddad').money.late_kukkiwon_only, e('Haddad').money.late_cents, e('Haddad').money.late_since], ['late', true, 11000, '2027-03-27']);
  assert.deepEqual([e('Tran').money.tag, e('Tran').money.next_cents, e('Tran').money.next_on], ['next', 29000, '2027-05-29']);
  assert.deepEqual([e('Price').status, e('Price').withdrawn_reason, e('Price').money.paid_cents], ['withdrawn', 'withdrawn', 20000]);
  assert.equal(e('Reyes').source, 'desk');
  assert.equal(edge.length, 15);
  assert.deepEqual(rosterCards(edge.map(toRow)), { paidInFull: 4, onSchedule: 3, late: 4, notPaid: 1, duplicatesLeftOut: 2 });
});

check('B2 store: the detail = 16d, the signature = 16e, the receipt = 16f', () => {
  setDay('2027-04-26');
  backend.loadSampleEdge();
  const alex = person('Alex', 'Kim');
  const d = call('bb_candidate_detail', { p_candidate_id: alex.id }, STAFF);
  assert.equal(d.status, 'ok');
  assert.deepEqual(Object.keys(d).sort(), ['candidate', 'money', 'needs_parent_signature', 'payments', 'status', 'waiver']);
  assert.deepEqual(Object.keys(d.candidate).sort(), ['age_on_first_day', 'created_at', 'created_by_name', 'cycle_id', 'cycle_plan_id', 'dan', 'date_of_birth',
    'duplicate_of', 'duplicate_state', 'email_for_results', 'first_name', 'id', 'kukkiwon', 'kukkiwon_added_on', 'last_name', 'location_code',
    'personal_removed_at', 'plan', 'reference', 'registered_at', 'source', 'status', 'under_18_on_first_day', 'updated_at', 'updated_by_name',
    'version', 'withdrawn_at', 'withdrawn_by_name', 'withdrawn_reason', 'is_makeup', 'makeup_of_cycle_name', 'retest_names', 'has_grades'].sort());
  assert.deepEqual([d.candidate.date_of_birth, d.candidate.age_on_first_day, d.candidate.under_18_on_first_day], ['2012-03-04', 15, true]);
  assert.deepEqual(d.candidate.plan, { name: '3 payments', payments_count: 3 });
  assert.deepEqual(d.waiver, {
    how: 'drawn', version_name: '2027-1', signed_at: d.waiver.signed_at, signer_name: 'Jordan Kim', signed_as_minor: true, ticked_by_name: null,
    signature_on_file: true, removed_at: null,
  });
  assert.ok(!JSON.stringify(d).includes('data:image')); // never the picture
  assert.equal(d.needs_parent_signature, false);
  assert.deepEqual(d.payments.map((p) => `${p.kind} ${p.amount_cents} ${p.for_items.join('+')} ${p.note ?? '-'}`),
    ['payment 39000 p1+kukkiwon -', 'payment 29000 p2 post-dated Apr 24', 'payment 29000 p3 post-dated May 29']);
  assert.deepEqual(Object.keys(d.payments[0]).sort(), ['amount_cents', 'for_items', 'id', 'kind', 'method', 'note', 'paid_on', 'reason', 'recorded_at',
    'recorded_by_name', 'returned', 'reverses_payment_id'].sort());
  assert.deepEqual(d.money.items.map((x) => `${x.item} ${x.label} ${x.due_on} ${x.remaining_cents}`),
    ['p1 Payment 1 2027-03-27 0', 'kukkiwon Kukkiwon certificate 2027-03-27 0', 'p2 Payment 2 2027-04-24 0', 'p3 Payment 3 2027-05-29 0']);
  // under 18 with an adult-signed waiver → needs a parent's signature; a paper re-sign clears it
  const zoe = person('Zoe', 'Martin');
  assert.equal(call('bb_candidate_detail', { p_candidate_id: zoe.id }).needs_parent_signature, true);
  // the desk candidate's paper waiver
  const tom = call('bb_candidate_detail', { p_candidate_id: person('Tom', 'Reyes').id });
  assert.deepEqual([tom.waiver.how, tom.waiver.ticked_by_name, tom.waiver.signer_name, tom.waiver.signature_on_file], ['paper', 'Staff', null, false]);
  assert.equal(tom.candidate.source, 'desk');
  // a withdrawn candidate: when and by whom are in the detail
  const owen = call('bb_candidate_detail', { p_candidate_id: person('Owen', 'Price').id });
  assert.deepEqual([owen.candidate.status, owen.candidate.withdrawn_by_name], ['withdrawn', 'Jeffrey Berg']);
  // View signature (A)
  const sig = call('bb_view_signature', { p_candidate_id: alex.id });
  assert.deepEqual([sig.status, sig.signer_name, sig.signature.startsWith('data:image/png'), sig.removed_at], ['ok', 'Jordan Kim', true, null]);
  assert.deepEqual(call('bb_view_signature', { p_candidate_id: alex.id }, STAFF), { status: 'not_allowed' });
  assert.deepEqual(call('bb_view_signature', { p_candidate_id: person('Tom', 'Reyes').id }), { status: 'ok', signature: null, signer_name: null, signed_at: null, removed_at: null });
  // the receipt
  const r = call('bb_receipt', { p_candidate_id: alex.id }, STAFF);
  assert.deepEqual(Object.keys(r).sort(), ['candidate', 'cycle', 'kukkiwon', 'lines', 'money', 'plan', 'printed_by_name', 'printed_on', 'schools', 'status']);
  assert.deepEqual(r.candidate, { first_name: 'Alex', last_name: 'Kim', dan: 1, reference: alex.reference, location_code: 'shrewsbury' });
  assert.deepEqual([r.cycle.name, r.plan.name, r.kukkiwon, r.printed_on, r.printed_by_name], ['Spring 2027', '3 payments', true, '2027-04-26', 'Staff']);
  assert.deepEqual(r.lines[0], { paid_on: '2027-03-27', for_items: ['p1', 'kukkiwon'], kind: 'payment', method: 'check', amount_cents: 39000, returned: false });
  assert.deepEqual(r.money, { total_due_cents: 97000, paid_cents: 97000, balance_cents: 0, next_on: null, next_cents: null });
  assert.deepEqual(r.schools.map((s) => s.code), ['worcester', 'shrewsbury']);
  assert.deepEqual(Object.keys(r.schools[0]).sort(), ['address', 'code', 'name']);
  const receiptText = JSON.stringify(r);
  for (const key of [...SECRET_KEYS, '"note"', '"reason"', '"recorded_by_name"']) assert.ok(!receiptText.includes(key), key);
  assert.ok(!receiptText.includes('post-dated') && !receiptText.includes('2012-03-04'));
});

check('B2 store: Add candidate (15g) — input, not_found, finished, the paper waiver, duplicates', () => {
  fresh();
  const spring = springOf();
  const good = {
    p_cycle_id: spring.id, p_first: '  ethan ', p_last: 'Park', p_date_of_birth: '2011-06-01', p_email: ' park.family@example.com ',
    p_location_code: 'shrewsbury', p_dan: 1, p_cycle_plan_id: planOf(spring, '3 payments'), p_kukkiwon: true, p_paper_waiver: true,
  };
  const before = JSON.stringify(db());
  for (const over of [{ p_first: '' }, { p_last: '   ' }, { p_date_of_birth: null }, { p_date_of_birth: '2027-04-27' }, { p_date_of_birth: '1899-12-31' },
    { p_email: 'nope' }, { p_email: null }, { p_location_code: 'boston' }, { p_location_code: null }, { p_dan: 0 }, { p_dan: 5 }, { p_cycle_plan_id: null },
    { p_kukkiwon: null }, { p_paper_waiver: false }, { p_paper_waiver: null }, { p_cycle_id: null }]) {
    assert.deepEqual(w('bb_add_candidate', { ...good, ...over }, STAFF), { status: 'invalid' }, JSON.stringify(over));
  }
  assert.deepEqual(w('bb_add_candidate', { ...good, p_cycle_id: randomUUID() }, STAFF), { status: 'not_found' });
  assert.deepEqual(w('bb_add_candidate', { ...good, p_cycle_plan_id: planOf(fallOf(), '3 payments') }, STAFF), { status: 'invalid' }); // another cycle's plan
  assert.equal(JSON.stringify(db()), before, 'a refused add changed something');
  // works while registration is closed (closed by its date on Apr 26), by staff
  const r = w('bb_add_candidate', good, STAFF);
  assert.deepEqual(Object.keys(r).sort(), ['id', 'reference', 'status', 'version']);
  assert.deepEqual([r.status, r.version], ['ok', 1]);
  assert.match(r.reference, /^BB-50\d\d$/);
  const c = db().bb_candidates.find((x) => x.id === r.id);
  assert.deepEqual([c.first_name, c.email_for_results, c.source, c.kukkiwon_added_on, c.created_by_name, c.duplicate_state],
    ['ethan', 'park.family@example.com', 'desk', '2027-04-26', 'Staff', 'none']);
  const waivers = db().bb_candidate_waivers.filter((x) => x.candidate_id === r.id);
  assert.deepEqual(waivers.map((x) => [x.how, x.signed_as_minor, x.ticked_by_name, x.signer_name, x.signature, x.submission_id]),
    [['paper', true, 'Staff', null, null, null]]); // 15 on Apr 3 → signed as a minor
  // the same name + DOB (any Dan): both possible duplicates
  const rina = person('Rina', 'Patel');
  const copy = w('bb_add_candidate', { ...good, p_first: 'RINA', p_last: 'patel', p_date_of_birth: rina.date_of_birth, p_dan: 2, p_cycle_plan_id: planOf(spring, 'In full') }, STAFF);
  assert.equal(copy.status, 'ok');
  assert.deepEqual([person('Rina', 'Patel').duplicate_state, db().bb_candidates.find((x) => x.id === copy.id).duplicate_of], ['possible', rina.id]);
  assert.equal(person('Rina', 'Patel').version, rina.version + 1);
  // the cycle is Past → finished
  setDay('2027-06-06');
  assert.deepEqual(w('bb_add_candidate', good, STAFF), { status: 'finished' });
  setDay('2027-04-26');
});

check('B2 store: Edit details (15h) and the paper waiver (15n)', () => {
  fresh();
  const sam = person('Sam', 'Lee'); // has a payment
  const args = (c, over = {}) => ({
    p_candidate_id: c.id, p_expected_version: version(c.id), p_first: c.first_name, p_last: c.last_name, p_date_of_birth: c.date_of_birth,
    p_email: c.email_for_results, p_location_code: c.location_code, p_dan: c.dan, ...over,
  });
  assert.deepEqual(w('bb_update_candidate', args(sam, { p_expected_version: 99 }), STAFF), { status: 'stale' });
  assert.deepEqual(w('bb_update_candidate', args(sam, { p_date_of_birth: null, p_email: null }), STAFF), { status: 'invalid' }); // required
  assert.deepEqual(w('bb_update_candidate', args(sam, { p_email: null }), STAFF), { status: 'invalid' }); // DOB without email
  assert.deepEqual(w('bb_update_candidate', args(sam, { p_date_of_birth: '2030-01-01' }), STAFF), { status: 'invalid' });
  assert.deepEqual(w('bb_update_candidate', args(sam, { p_candidate_id: randomUUID() }), STAFF), { status: 'not_found' });
  // the same values write nothing
  const v = version(sam.id);
  const saveCount = saves;
  assert.deepEqual(w('bb_update_candidate', args(sam), STAFF), { status: 'ok', version: v, needs_parent_signature: false });
  assert.equal(saves, saveCount);
  // an email fix alone bumps the version
  assert.equal(w('bb_update_candidate', args(sam, { p_email: 'sam.new@example.com' }), STAFF).version, v + 1);
  // a school change moves the candidate; the payment keeps its school
  w('bb_update_candidate', args(person('Sam', 'Lee'), { p_location_code: 'shrewsbury' }), STAFF);
  assert.equal(person('Sam', 'Lee').location_code, 'shrewsbury');
  assert.equal(db().bb_payments.find((p) => p.candidate_id === sam.id).location_code, 'worcester');
  // a Dan change after a payment: staff not_allowed, admin ok
  assert.deepEqual(w('bb_update_candidate', args(person('Sam', 'Lee'), { p_dan: 3 }), STAFF), { status: 'not_allowed' });
  assert.equal(w('bb_update_candidate', args(person('Sam', 'Lee'), { p_dan: 3 }), ADMIN).status, 'ok');
  // a Dan change before any payment: staff ok
  assert.equal(w('bb_update_candidate', args(person('Rina', 'Patel'), { p_dan: 2 }), STAFF).status, 'ok');
  // a DOB fix making a minor → needs a parent's signature; a paper re-sign clears it
  const mia = person('Mia', 'Chen');
  const fixed = w('bb_update_candidate', args(mia, { p_date_of_birth: '2011-01-01' }), STAFF);
  assert.deepEqual([fixed.status, fixed.needs_parent_signature], ['ok', true]);
  assert.deepEqual(w('bb_record_paper_waiver', { p_candidate_id: mia.id, p_expected_version: fixed.version - 1 }, STAFF), { status: 'stale' });
  const paper = w('bb_record_paper_waiver', { p_candidate_id: mia.id, p_expected_version: fixed.version }, STAFF);
  assert.deepEqual(paper, { status: 'ok', version: fixed.version + 1, needs_parent_signature: false });
  assert.equal(db().bb_candidate_waivers.filter((x) => x.candidate_id === mia.id).length, 2);
  // a name change rechecks the duplicate marks (one Noah renamed → neither is possible any more)
  const noah = db().bb_candidates.filter((c) => c.first_name === 'Noah');
  w('bb_update_candidate', args(noah[1], { p_first: 'Noel' }), STAFF);
  assert.deepEqual(db().bb_candidates.filter((c) => c.last_name === 'Silva').map((c) => c.duplicate_state), ['none', 'none']);
  // Past → the paper waiver is finished
  setDay('2027-06-06');
  assert.deepEqual(w('bb_record_paper_waiver', { p_candidate_id: mia.id, p_expected_version: version(mia.id) }, STAFF), { status: 'finished' });
  setDay('2027-04-26');
});

check('B2 store: Change plan or Kukkiwon (15i)', () => {
  fresh();
  const spring = springOf();
  const rina = person('Rina', 'Patel');
  const cp = (c, plan, kukkiwon, ctx = STAFF, v = version(c.id)) => w('bb_change_plan', {
    p_candidate_id: c.id, p_expected_version: v, p_cycle_plan_id: plan, p_kukkiwon: kukkiwon,
  }, ctx);
  assert.deepEqual(cp(rina, planOf(spring, '3 payments'), false, STAFF, 99), { status: 'stale' });
  const r = cp(rina, planOf(spring, '3 payments'), true);
  assert.deepEqual([r.status, r.version, r.money.total_due_cents, r.money.items.length], ['ok', rina.version + 1, 97000, 4]);
  assert.equal(person('Rina', 'Patel').kukkiwon_added_on, '2027-04-26'); // newly chosen → due today
  assert.equal(r.money.items.find((x) => x.item === 'kukkiwon').due_on, '2027-04-26');
  // the same values write nothing (and keep the version)
  assert.equal(cp(rina, planOf(spring, '3 payments'), true).version, r.version);
  // Kukkiwon off clears its date
  cp(rina, planOf(spring, '3 payments'), false);
  assert.equal(person('Rina', 'Patel').kukkiwon_added_on, null);
  assert.deepEqual(cp(rina, planOf(fallOf(), 'In full'), false), { status: 'invalid' }); // another cycle's plan
  // after a payment: staff not_allowed, admin ok (the money is worked out again)
  const sam = person('Sam', 'Lee');
  assert.deepEqual(cp(sam, planOf(spring, 'In full'), false), { status: 'not_allowed' });
  const admin = cp(sam, planOf(spring, 'In full'), false, ADMIN);
  assert.deepEqual([admin.status, admin.money.items.length, admin.money.items[0].paid_cents, admin.money.tag], ['ok', 1, 33000, 'late']);
  // withdrawn → withdrawn
  w('bb_withdraw_candidate', { p_candidate_id: rina.id, p_expected_version: version(rina.id) });
  assert.deepEqual(cp(rina, planOf(spring, 'In full'), false), { status: 'withdrawn' });
});

check('B2 store: duplicates, withdraw, restore (15j–15l)', () => {
  fresh();
  const [a, b] = db().bb_candidates.filter((c) => c.first_name === 'Noah').sort((x, y) => (x.registered_at < y.registered_at ? -1 : 1));
  const res = (keep, other, keepBoth, ctx = STAFF) => w('bb_resolve_duplicate', {
    p_keep_id: keep.id, p_keep_version: version(keep.id), p_other_id: other.id, p_other_version: version(other.id), p_keep_both: keepBoth,
  }, ctx);
  assert.deepEqual(w('bb_resolve_duplicate', { p_keep_id: a.id, p_keep_version: 1, p_other_id: a.id, p_other_version: 1, p_keep_both: true }, STAFF), { status: 'invalid' });
  assert.deepEqual(w('bb_resolve_duplicate', { p_keep_id: a.id, p_keep_version: 99, p_other_id: b.id, p_other_version: version(b.id), p_keep_both: true }, STAFF), { status: 'stale' });
  assert.deepEqual(w('bb_resolve_duplicate', { p_keep_id: a.id, p_keep_version: 1, p_other_id: randomUUID(), p_other_version: 1, p_keep_both: true }, STAFF), { status: 'not_found' });
  // two cycles → invalid
  const fallPlan = planOf(fallOf(), 'In full');
  const inFall = w('bb_add_candidate', {
    p_cycle_id: fallOf().id, p_first: 'Noah', p_last: 'Silva', p_date_of_birth: a.date_of_birth, p_email: 'n@example.com', p_location_code: 'worcester',
    p_dan: 2, p_cycle_plan_id: fallPlan, p_kukkiwon: false, p_paper_waiver: true,
  }, STAFF);
  assert.deepEqual(res(a, { id: inFall.id }, true), { status: 'invalid' });
  // keep both
  const both = res(a, b, true);
  assert.deepEqual([both.status, both.keep_version, both.other_version], ['ok', version(a.id), version(b.id)]);
  assert.deepEqual([person('Noah', 'Silva').duplicate_state], ['kept_both']);
  assert.deepEqual(res(a, b, true), { status: 'stale' }); // no longer marked
  // keep one (staff), then the staff's own Undo within 10 seconds restores and re-marks
  fresh();
  const [c, d] = db().bb_candidates.filter((x) => x.first_name === 'Noah').sort((x, y) => (x.registered_at < y.registered_at ? -1 : 1));
  const one = res(c, d, false);
  assert.equal(one.status, 'ok');
  const gone = db().bb_candidates.find((x) => x.id === d.id);
  assert.deepEqual([gone.status, gone.withdrawn_reason, gone.withdrawn_by_name, gone.duplicate_state], ['withdrawn', 'duplicate_copy', 'Staff', 'none']);
  assert.equal(db().bb_candidates.find((x) => x.id === c.id).duplicate_state, 'none');
  assert.deepEqual(res(c, d, false), { status: 'withdrawn' }); // the other one is withdrawn now (checked before the marks)
  advance(3000);
  const back = w('bb_restore_candidate', { p_candidate_id: d.id, p_expected_version: version(d.id) }, STAFF);
  assert.equal(back.status, 'ok');
  assert.deepEqual(db().bb_candidates.filter((x) => x.first_name === 'Noah').map((x) => x.duplicate_state), ['possible', 'possible']);
  // after 10 seconds: staff not_allowed, an admin any time; restoring an active candidate → stale
  res(c, d, false);
  advance(11000);
  assert.deepEqual(w('bb_restore_candidate', { p_candidate_id: d.id, p_expected_version: version(d.id) }, STAFF), { status: 'not_allowed' });
  assert.deepEqual(w('bb_restore_candidate', { p_candidate_id: d.id, p_expected_version: version(d.id) }, { ...STAFF, userId: 'someone-else' }), { status: 'not_allowed' });
  assert.equal(w('bb_restore_candidate', { p_candidate_id: d.id, p_expected_version: version(d.id) }, ADMIN).status, 'ok');
  assert.deepEqual(w('bb_restore_candidate', { p_candidate_id: d.id, p_expected_version: version(d.id) }, ADMIN), { status: 'stale' });
  assert.deepEqual(w('bb_restore_candidate', { p_candidate_id: d.id, p_expected_version: 99 }, ADMIN), { status: 'stale' });
  // withdraw (A): the partner's mark is worked out again; twice → withdrawn
  const wd = w('bb_withdraw_candidate', { p_candidate_id: d.id, p_expected_version: version(d.id) });
  assert.equal(wd.status, 'ok');
  assert.equal(db().bb_candidates.find((x) => x.id === c.id).duplicate_state, 'none');
  assert.deepEqual(w('bb_withdraw_candidate', { p_candidate_id: d.id, p_expected_version: version(d.id) }), { status: 'withdrawn' });
  assert.deepEqual(w('bb_withdraw_candidate', { p_candidate_id: d.id, p_expected_version: 99 }), { status: 'stale' });
  setDay('2027-04-26');
});

check('B2 store: Delete permanently (15m) — has_payments even after an undo', () => {
  fresh();
  const kim = person('Alex', 'Kim');
  assert.deepEqual(w('bb_delete_candidate', { p_candidate_id: kim.id, p_expected_version: version(kim.id) }), { status: 'has_payments' });
  const hal = addDesk('Hal');
  const p = w('bb_record_payment', payArgs(hal, 29000, 'cash', ['p1']), STAFF);
  w('bb_undo_payment', { p_payment_id: p.payment_id }, STAFF);
  assert.deepEqual(w('bb_delete_candidate', { p_candidate_id: hal, p_expected_version: version(hal) }), { status: 'has_payments' });
  const rina = person('Rina', 'Patel');
  assert.deepEqual(w('bb_delete_candidate', { p_candidate_id: rina.id, p_expected_version: 99 }), { status: 'stale' });
  // a duplicate pointing at the deleted one is worked out again
  const [, noah2] = db().bb_candidates.filter((x) => x.first_name === 'Noah').sort((x, y) => (x.registered_at < y.registered_at ? -1 : 1));
  const noah1 = db().bb_candidates.find((x) => x.id === noah2.duplicate_of);
  assert.deepEqual(w('bb_delete_candidate', { p_candidate_id: noah1.id, p_expected_version: version(noah1.id) }), { status: 'ok' });
  assert.equal(db().bb_candidates.find((x) => x.id === noah1.id), undefined);
  assert.equal(db().bb_candidate_waivers.filter((x) => x.candidate_id === noah1.id).length, 0); // its waivers went with it
  assert.deepEqual([db().bb_candidates.find((x) => x.id === noah2.id).duplicate_state, db().bb_candidates.find((x) => x.id === noah2.id).duplicate_of], ['none', null]);
  assert.deepEqual(w('bb_delete_candidate', { p_candidate_id: noah1.id, p_expected_version: 1 }), { status: 'not_found' });
});

check('B2 store: Record payment (15o, T7a)', () => {
  fresh();
  const ava = addDesk('Ava');
  const r = w('bb_record_payment', payArgs(ava, 1, 'cash', ['p1'], '  first  '), STAFF);
  assert.deepEqual(Object.keys(r).sort(), ['money', 'payment_id', 'status', 'version']);
  assert.deepEqual([r.status, r.version, r.money.paid_cents, r.money.items.length], ['ok', 2, 1, 3]);
  const row = db().bb_payments.find((p) => p.id === r.payment_id);
  assert.deepEqual([row.kind, row.amount_cents, row.method, row.paid_on, row.location_code, row.cycle_name, row.note, row.recorded_by, row.recorded_by_name,
    row.for_items.join(), row.cycle_id, row.reverses_payment_id], ['payment', 1, 'cash', '2027-04-26', 'worcester', 'Spring 2027', 'first', 'u2', 'Staff', 'p1', springOf().id, null]);
  assert.equal(w('bb_record_payment', payArgs(ava, 500000, 'check', ['p2', 'p3'], 'post-dated'), STAFF).status, 'ok');
  assert.deepEqual(w('bb_record_payment', { ...payArgs(ava, 100, 'cash', ['p1']), p_expected_version: 2 }, STAFF), { status: 'stale' }); // a double click
  const before = JSON.stringify(db());
  for (const [cents, method, items, note] of [[0, 'cash', ['p1']], [500001, 'cash', ['p1']], [100, 'bitcoin', ['p1']], [100, 'cash', ['p4']],
    [100, 'cash', ['kukkiwon']], [100, 'cash', ['p13']], [100, 'cash', ['p1', 'p1']], [100, 'cash', []], [100, 'cash', null], [100, 'cash', ['p1', null]],
    [100, 'cash', ['p1'], 'x'.repeat(601)], [100, null, ['p1']], [null, 'cash', ['p1']]]) {
    assert.deepEqual(w('bb_record_payment', payArgs(ava, cents, method, items, note ?? null), STAFF), { status: 'invalid' }, `${cents} ${method} ${items}`);
  }
  assert.equal(JSON.stringify(db()), before, 'a refused payment changed something');
  assert.deepEqual(w('bb_record_payment', { ...payArgs(ava, 100, 'cash', ['p1']), p_candidate_id: randomUUID() }, STAFF), { status: 'not_found' });
  // a later school fix and a cycle rename don't move stored values; a new payment stores today's
  const c = db().bb_candidates.find((x) => x.id === ava);
  w('bb_update_candidate', {
    p_candidate_id: ava, p_expected_version: c.version, p_first: 'Ava', p_last: 'Payer', p_date_of_birth: c.date_of_birth, p_email: c.email_for_results,
    p_location_code: 'shrewsbury', p_dan: 1,
  }, STAFF);
  const spring = springOf();
  const s = saved;
  s.bb_cycles.find((x) => x.id === spring.id).name = 'Spring 2027 Renamed'; // (as bb_update_cycle would)
  const later = w('bb_record_payment', payArgs(ava, 100, 'card', ['p1']), STAFF);
  assert.deepEqual([db().bb_payments.find((p) => p.id === later.payment_id).location_code, db().bb_payments.find((p) => p.id === later.payment_id).cycle_name],
    ['shrewsbury', 'Spring 2027 Renamed']);
  assert.deepEqual([db().bb_payments.find((p) => p.id === r.payment_id).location_code, db().bb_payments.find((p) => p.id === r.payment_id).cycle_name],
    ['worcester', 'Spring 2027']);
  // withdrawn → withdrawn
  w('bb_withdraw_candidate', { p_candidate_id: ava, p_expected_version: version(ava) });
  assert.deepEqual(w('bb_record_payment', payArgs(ava, 100, 'cash', ['p1']), STAFF), { status: 'withdrawn' });
  // failNextSave covers it: a dropped connection changes nothing
  const bea = addDesk('Bea');
  const snapshot = JSON.stringify(db());
  backend.failNextSave();
  assert.equal(backend.rpc('bb_record_payment', payArgs(bea, 100, 'cash', ['p1']), STAFF).error.message.includes('failNextSave'), true);
  assert.equal(JSON.stringify(db()), snapshot);
});

check('B2 store: Undo (15p, T7c) — own row < 10 s, twice stale, a reversal invalid', () => {
  fresh();
  const hal = addDesk('Hal');
  const p = w('bb_record_payment', payArgs(hal, 29000, 'cash', ['p1']), STAFF);
  advance(4000);
  const u = w('bb_undo_payment', { p_payment_id: p.payment_id }, STAFF);
  assert.deepEqual([u.status, u.version, u.money.paid_cents], ['ok', 3, 0]);
  const rev = db().bb_payments.find((x) => x.reverses_payment_id === p.payment_id);
  assert.deepEqual([rev.kind, rev.amount_cents, rev.method, rev.paid_on, rev.location_code, rev.cycle_name], ['reversal', -29000, 'cash', '2027-04-26', 'worcester', 'Spring 2027']);
  assert.deepEqual(w('bb_undo_payment', { p_payment_id: p.payment_id }, STAFF), { status: 'stale' });
  assert.deepEqual(w('bb_undo_payment', { p_payment_id: rev.id }, ADMIN), { status: 'invalid' });
  // someone else's row → not_allowed for staff
  const q = w('bb_record_payment', payArgs(hal, 29000, 'cash', ['p1']), ADMIN);
  assert.deepEqual(w('bb_undo_payment', { p_payment_id: q.payment_id }, STAFF), { status: 'not_allowed' });
  // the staff's own row after bbExpireUndo → not_allowed; an admin any time
  advance(1000);
  const mine = w('bb_record_payment', payArgs(hal, 100, 'cash', ['p2']), STAFF);
  assert.deepEqual(backend.expireUndo(), { kind: 'payment', amountCents: 100 });
  assert.deepEqual(w('bb_undo_payment', { p_payment_id: mine.payment_id }, STAFF), { status: 'not_allowed' });
  assert.equal(w('bb_undo_payment', { p_payment_id: mine.payment_id }, ADMIN).status, 'ok');
  // and simply after 10 seconds
  const again = w('bb_record_payment', payArgs(hal, 100, 'cash', ['p2']), STAFF);
  advance(10001);
  assert.deepEqual(w('bb_undo_payment', { p_payment_id: again.payment_id }, STAFF), { status: 'not_allowed' });
  assert.deepEqual(w('bb_undo_payment', { p_payment_id: randomUUID() }, ADMIN), { status: 'not_found' });
  assert.deepEqual(w('bb_undo_payment', { p_payment_id: null }, ADMIN), { status: 'invalid' });
  // works on a withdrawn candidate
  w('bb_withdraw_candidate', { p_candidate_id: hal, p_expected_version: version(hal) });
  assert.equal(w('bb_undo_payment', { p_payment_id: again.payment_id }, ADMIN).status, 'ok');
  setDay('2027-04-26');
});

check('B2 store: Edit payment (15q, T7d) — exactly two rows, same recorded_at, the old date', () => {
  fresh();
  const ida = addDesk('Ida');
  const old = w('bb_record_payment', payArgs(ida, 29000, 'cash', ['p1']), STAFF);
  advance(24 * 60 * 60 * 1000); // the next day (Apr 27)
  const edit = (args, ctx = ADMIN) => w('bb_edit_payment', { p_payment_id: old.payment_id, p_amount_cents: 30000, p_method: 'card', p_for_items: ['p1', 'p2'], p_note: 'new note', p_reason: '  typed the wrong amount ', ...args }, ctx);
  assert.deepEqual(edit({ p_reason: null }), { status: 'invalid' });
  assert.deepEqual(edit({ p_reason: '   ' }), { status: 'invalid' });
  assert.deepEqual(edit({}, STAFF), { status: 'not_allowed' });
  assert.deepEqual(edit({ p_for_items: ['kukkiwon'] }), { status: 'invalid' }); // not in the plan
  const n = db().bb_payments.length;
  const r = edit({});
  assert.equal(r.status, 'ok');
  assert.equal(db().bb_payments.length, n + 2);
  const rev = db().bb_payments.find((p) => p.reverses_payment_id === old.payment_id);
  const neu = db().bb_payments.find((p) => p.id === r.payment_id);
  assert.deepEqual([rev.kind, rev.amount_cents, rev.method, rev.reason, rev.paid_on, rev.recorded_by, rev.recorded_by_name],
    ['reversal', -29000, 'cash', 'typed the wrong amount', '2027-04-27', 'u1', 'Jeffrey Berg']);
  assert.deepEqual([neu.kind, neu.amount_cents, neu.method, neu.reason, neu.paid_on, neu.note, neu.for_items.join(), neu.recorded_by],
    ['payment', 30000, 'card', 'typed the wrong amount', '2027-04-26', 'new note', 'p1,p2', 'u1']);
  assert.equal(rev.recorded_at, neu.recorded_at);
  assert.equal(r.money.paid_cents, 30000);
  assert.deepEqual(edit({ p_reason: 'again' }), { status: 'stale' }); // edited away
  // an active refund → invalid; editing a refund row → invalid
  const refund = w('bb_record_refund', { p_candidate_id: ida, p_expected_version: version(ida), p_amount_cents: 1000, p_method: 'cash', p_note: null });
  assert.deepEqual(w('bb_edit_payment', { p_payment_id: r.payment_id, p_amount_cents: 30000, p_method: 'card', p_for_items: ['p1'], p_note: null, p_reason: 'again' }), { status: 'invalid' });
  assert.deepEqual(w('bb_edit_payment', { p_payment_id: refund.payment_id, p_amount_cents: 30000, p_method: 'card', p_for_items: ['p1'], p_note: null, p_reason: 'again' }), { status: 'invalid' });
  // a returned check → stale; a withdrawn candidate → withdrawn
  const jo = addDesk('Jo');
  const check1 = w('bb_record_payment', payArgs(jo, 29000, 'check', ['p1']), STAFF);
  w('bb_mark_check_returned', { p_payment_id: check1.payment_id, p_note: 'bounced' });
  assert.deepEqual(w('bb_edit_payment', { p_payment_id: check1.payment_id, p_amount_cents: 29000, p_method: 'check', p_for_items: ['p1'], p_note: null, p_reason: 'fix' }), { status: 'stale' });
  const kay = addDesk('Kay');
  const kp = w('bb_record_payment', payArgs(kay, 29000, 'cash', ['p1']), STAFF);
  w('bb_withdraw_candidate', { p_candidate_id: kay, p_expected_version: version(kay) });
  assert.deepEqual(w('bb_edit_payment', { p_payment_id: kp.payment_id, p_amount_cents: 100, p_method: 'cash', p_for_items: ['p1'], p_note: null, p_reason: 'x' }), { status: 'withdrawn' });
  assert.deepEqual(w('bb_edit_payment', { p_payment_id: randomUUID(), p_amount_cents: 100, p_method: 'cash', p_for_items: ['p1'], p_note: null, p_reason: 'x' }), { status: 'not_found' });
  setDay('2027-04-26');
});

// R1-01 (0046, rulebook v1.035): a payment or refund counts at the DESK's school (This device), not the candidate's.
check('R1-01: the desk school helper — known schools become codes, anything else sends nothing', () => {
  assert.equal(deskSchoolCode('Worcester'), 'worcester');
  assert.equal(deskSchoolCode('Shrewsbury'), 'shrewsbury');
  assert.equal(deskSchoolCode('shrewsbury'), 'shrewsbury');
  for (const bad of [undefined, null, '', 'Both', 'Boston', 7, {}]) assert.equal(deskSchoolCode(bad), null, String(bad));
  assert.deepEqual(deskSchoolArg('Shrewsbury'), { p_school: 'shrewsbury' });
  assert.deepEqual(deskSchoolArg('Both'), {}); // no p_school key at all: the old call
  assert.deepEqual(deskSchoolArg(undefined), {});
});

check('R1-01 store: payment and refund count at the desk school; blank = the old rule; undo and edit keep it', () => {
  fresh();
  const sam = addDesk('Sam'); // a Worcester candidate
  // Recorded at a Shrewsbury desk: the payment's school is shrewsbury, not worcester
  const p = w('bb_record_payment', { ...payArgs(sam, 29000, 'cash', ['p1']), ...deskSchoolArg('Shrewsbury') }, STAFF);
  assert.equal(p.status, 'ok');
  assert.equal(db().bb_payments.find((x) => x.id === p.payment_id).location_code, 'shrewsbury');
  // No device school: the candidate's own school (the old rule)
  const q = w('bb_record_payment', { ...payArgs(sam, 100, 'cash', ['p2']), ...deskSchoolArg('Both') }, STAFF);
  assert.equal(db().bb_payments.find((x) => x.id === q.payment_id).location_code, 'worcester');
  // A school that isn't one of ours is refused, nothing stored
  const n = db().bb_payments.length;
  assert.deepEqual(w('bb_record_payment', { ...payArgs(sam, 100, 'cash', ['p3']), p_school: 'boston' }, STAFF), { status: 'invalid' });
  assert.equal(db().bb_payments.length, n);
  // Edit payment (admin) and Undo copy the school of the payment they correct, whatever the desk
  const e = w('bb_edit_payment', { p_payment_id: p.payment_id, p_amount_cents: 29000, p_method: 'card', p_for_items: ['p1'], p_note: null, p_reason: 'was card' });
  assert.equal(e.status, 'ok');
  assert.equal(db().bb_payments.find((x) => x.id === e.payment_id).location_code, 'shrewsbury');
  assert.equal(db().bb_payments.find((x) => x.reverses_payment_id === p.payment_id).location_code, 'shrewsbury');
  const u = w('bb_undo_payment', { p_payment_id: e.payment_id });
  assert.equal(u.status, 'ok');
  assert.equal(db().bb_payments.find((x) => x.reverses_payment_id === e.payment_id).location_code, 'shrewsbury');
  // A refund at a Shrewsbury desk counts at shrewsbury; without a device school it takes the latest live payment's school
  const sue = addDesk('Sue');
  w('bb_record_payment', payArgs(sue, 29000, 'cash', ['p1']), STAFF); // worcester
  const r1 = w('bb_record_refund', { p_candidate_id: sue, p_expected_version: version(sue), p_amount_cents: 1000, p_method: 'cash', p_note: null, ...deskSchoolArg('Shrewsbury') });
  assert.equal(db().bb_payments.find((x) => x.id === r1.payment_id).location_code, 'shrewsbury');
  const r2 = w('bb_record_refund', { p_candidate_id: sue, p_expected_version: version(sue), p_amount_cents: 1000, p_method: 'cash', p_note: null });
  assert.equal(db().bb_payments.find((x) => x.id === r2.payment_id).location_code, 'worcester');
  // Undo of the Shrewsbury refund keeps its school
  const ru = w('bb_undo_payment', { p_payment_id: r1.payment_id });
  assert.equal(db().bb_payments.find((x) => x.id !== r1.payment_id && x.reverses_payment_id === r1.payment_id).location_code, 'shrewsbury');
  // A returned check keeps the check's school
  const cs = addDesk('Cy');
  const ck = w('bb_record_payment', { ...payArgs(cs, 29000, 'check', ['p1']), ...deskSchoolArg('Shrewsbury') }, STAFF);
  const ret = w('bb_mark_check_returned', { p_payment_id: ck.payment_id, p_note: null });
  assert.equal(db().bb_payments.find((x) => x.id === ret.payment_id).location_code, 'shrewsbury');
  assert.equal(ru.status, 'ok');
});

check('B2 store: Refund (15r, T7e) — up to the net paid, refund_too_large, its Undo, the net floor', () => {
  fresh();
  const kit = addDesk('Kit');
  w('bb_record_payment', payArgs(kit, 29000, 'cash', ['p1']), STAFF);
  const c = db().bb_candidates.find((x) => x.id === kit);
  w('bb_update_candidate', {
    p_candidate_id: kit, p_expected_version: c.version, p_first: 'Kit', p_last: 'Payer', p_date_of_birth: c.date_of_birth, p_email: c.email_for_results,
    p_location_code: 'shrewsbury', p_dan: 1,
  }, STAFF);
  w('bb_withdraw_candidate', { p_candidate_id: kit, p_expected_version: version(kit) });
  const ref = (cents, method = 'check', note = null, ctx = ADMIN) => w('bb_record_refund', {
    p_candidate_id: kit, p_expected_version: version(kit), p_amount_cents: cents, p_method: method, p_note: note,
  }, ctx);
  assert.deepEqual(ref(100, 'cash', null, STAFF), { status: 'not_allowed' });
  assert.deepEqual(ref(0), { status: 'invalid' });
  assert.deepEqual(ref(100, 'bitcoin'), { status: 'invalid' });
  assert.deepEqual(ref(29001), { status: 'refund_too_large', paid_cents: 29000 });
  assert.deepEqual(w('bb_record_refund', { p_candidate_id: kit, p_expected_version: 99, p_amount_cents: 100, p_method: 'cash', p_note: null }), { status: 'stale' });
  const r = ref(29000, 'check', 'gave it back'); // allowed on a withdrawn candidate
  assert.deepEqual([r.status, r.money.paid_cents], ['ok', 0]);
  const row = db().bb_payments.find((p) => p.id === r.payment_id);
  assert.deepEqual([row.kind, row.amount_cents, row.location_code, row.cycle_name, row.paid_on, row.method, row.note],
    ['refund', -29000, 'worcester', 'Spring 2027', '2027-04-26', 'check', 'gave it back']); // the latest live payment's school
  const u = w('bb_undo_payment', { p_payment_id: r.payment_id });
  assert.deepEqual([u.status, u.money.paid_cents], ['ok', 29000]);
  // undoing the payment under an active refund would go below zero → invalid
  ref(1000, 'cash');
  const payment = db().bb_payments.find((p) => p.candidate_id === kit && p.kind === 'payment');
  assert.deepEqual(w('bb_undo_payment', { p_payment_id: payment.id }), { status: 'invalid' });
  // no live payment: the candidate's own school and cycle name
  const lu = addDesk('Lu', '3 payments', false, STAFF, { p_location_code: 'shrewsbury' });
  assert.deepEqual(w('bb_record_refund', { p_candidate_id: lu, p_expected_version: version(lu), p_amount_cents: 1, p_method: 'cash', p_note: null }), { status: 'refund_too_large', paid_cents: 0 });
});

check('B2 store: Returned checks (15s, T7f) — its own kind, dated today, once ever', () => {
  fresh();
  const lu = addDesk('Lu');
  const cash = w('bb_record_payment', payArgs(lu, 29000, 'cash', ['p1']), STAFF);
  assert.deepEqual(w('bb_mark_check_returned', { p_payment_id: cash.payment_id, p_note: null }), { status: 'invalid' }); // cash
  assert.deepEqual(w('bb_mark_check_returned', { p_payment_id: cash.payment_id, p_note: null }, STAFF), { status: 'not_allowed' });
  // a check, a refund, then the check bounces: the net goes below zero
  const max = addDesk('Max');
  const chk = w('bb_record_payment', payArgs(max, 29000, 'check', ['p1']), STAFF);
  w('bb_record_refund', { p_candidate_id: max, p_expected_version: version(max), p_amount_cents: 10000, p_method: 'cash', p_note: null });
  advance(24 * 60 * 60 * 1000); // marked the next day
  const ret = w('bb_mark_check_returned', { p_payment_id: chk.payment_id, p_note: 'NSF' });
  assert.deepEqual([ret.status, ret.money.paid_cents], ['ok', -10000]);
  const row = db().bb_payments.find((p) => p.id === ret.payment_id);
  assert.deepEqual([row.kind, row.amount_cents, row.method, row.note, row.paid_on, row.reverses_payment_id], ['returned', -29000, 'check', 'NSF', '2027-04-27', chk.payment_id]);
  assert.equal(db().bb_payments.filter((p) => p.reverses_payment_id === chk.payment_id && p.kind === 'reversal').length, 0); // never a reversal
  // Late, the balance comes back; the detail flags the check and lists the returned line
  const detail = call('bb_candidate_detail', { p_candidate_id: max });
  assert.deepEqual([detail.money.tag, detail.money.balance_cents], ['late', 87000 + 10000]);
  assert.equal(detail.payments.find((p) => p.id === chk.payment_id).returned, true);
  assert.equal(detail.payments.find((p) => p.kind === 'returned').reverses_payment_id, chk.payment_id);
  // while the net is below zero a part payment is accepted
  const part = w('bb_record_payment', payArgs(max, 5000, 'cash', ['p1']), STAFF);
  assert.deepEqual([part.status, part.money.paid_cents], ['ok', -5000]);
  // the same check can't be marked twice; its payment can't be undone while the mark is live
  assert.deepEqual(w('bb_mark_check_returned', { p_payment_id: chk.payment_id, p_note: null }), { status: 'stale' });
  assert.deepEqual(w('bb_undo_payment', { p_payment_id: chk.payment_id }), { status: 'invalid' });
  // undoing the mark makes the check count again (p1: 290 − 100 refund + 50 = 240)
  const unmark = w('bb_undo_payment', { p_payment_id: ret.payment_id });
  assert.deepEqual([unmark.status, unmark.money.paid_cents, unmark.money.items[0].paid_cents], ['ok', 24000, 29000 - 10000 + 5000]);
  // … but it can't be marked again
  assert.deepEqual(w('bb_mark_check_returned', { p_payment_id: chk.payment_id, p_note: null }), { status: 'stale' });
  // a reversed check → stale
  const ned = addDesk('Ned');
  const nc = w('bb_record_payment', payArgs(ned, 29000, 'check', ['p1']), STAFF);
  w('bb_undo_payment', { p_payment_id: nc.payment_id }, STAFF);
  assert.deepEqual(w('bb_mark_check_returned', { p_payment_id: nc.payment_id, p_note: null }), { status: 'stale' });
  // the full sequence: returned → undo the mark → undo the payment → record again → mark the new row
  const oz = addDesk('Oz');
  const o1 = w('bb_record_payment', payArgs(oz, 29000, 'check', ['p1']), STAFF);
  const m1 = w('bb_mark_check_returned', { p_payment_id: o1.payment_id, p_note: null });
  w('bb_undo_payment', { p_payment_id: m1.payment_id });
  w('bb_undo_payment', { p_payment_id: o1.payment_id });
  const o2 = w('bb_record_payment', payArgs(oz, 29000, 'check', ['p1']), STAFF);
  const m2 = w('bb_mark_check_returned', { p_payment_id: o2.payment_id, p_note: null });
  assert.deepEqual([m2.status, m2.money.paid_cents], ['ok', 0]);
  assert.deepEqual(w('bb_mark_check_returned', { p_payment_id: randomUUID(), p_note: null }), { status: 'not_found' });
  // the receipt never says which row: pairReturnedLines names the bounced payment
  const receipt = call('bb_receipt', { p_candidate_id: oz });
  const pairs = pairReturnedLines(receipt.lines.map((l) => ({ kind: l.kind, amountCents: l.amount_cents, forItems: l.for_items, returned: l.returned })));
  assert.deepEqual(pairs.filter(Boolean), [['p1']]);
  setDay('2027-04-26');
});

check('B2 store: the guard (11l) refuses bad rows; nothing ever changes or removes a payment row', () => {
  fresh();
  // every handler and helper in the store file: no assignment to a bb_payments row's column, no filter of the list
  const source = readFileSync(new URL('./mockBlackBelt.js', import.meta.url), 'utf8');
  assert.ok(!/bb_payments\s*=\s*/.test(source.replace(/bb_payments: \[\]/g, '')), 'bb_payments is never re-assigned (filtered)');
  assert.ok(!/bb_payments\.(splice|pop|shift|length\s*=)/.test(source), 'no row is ever removed');
  // a cycle with payments can't be deleted (B1), and a candidate with any row can't be either
  const spring = springOf();
  const s = db();
  assert.deepEqual(call('bb_delete_cycle', { p_cycle_id: spring.id, p_expected_version: spring.version, p_expected_candidate_count: s.bb_candidates.filter((c) => c.cycle_id === spring.id).length }), { status: 'has_payments' });
  // simulateOtherAdminEdit also bumps every candidate (open dialogs get stale)
  const kim = person('Alex', 'Kim');
  backend.simulateOtherAdminEdit();
  assert.equal(person('Alex', 'Kim').version, kim.version + 1);
  assert.deepEqual(w('bb_record_payment', { ...payArgs(kim.id, 100, 'cash', ['p1']), p_expected_version: kim.version }, STAFF), { status: 'stale' });
  // bbAddDuplicate: the newest cycle's first active candidate gets a copy → both possible
  backend.loadSampleRoster();
  const fallFirst = w('bb_add_candidate', {
    p_cycle_id: fallOf().id, p_first: 'Ann', p_last: 'Early', p_date_of_birth: '1990-02-02', p_email: 'ann@example.com', p_location_code: 'worcester',
    p_dan: 1, p_cycle_plan_id: planOf(fallOf(), 'In full'), p_kukkiwon: false, p_paper_waiver: true,
  }, STAFF);
  const added = backend.addDuplicate();
  assert.equal(added.name, 'Ann Early');
  assert.ok(!JSON.stringify(added).includes('1990-02-02'));
  assert.deepEqual(db().bb_candidates.filter((c) => c.last_name === 'Early').map((c) => c.duplicate_state), ['possible', 'possible']);
  assert.equal(db().bb_candidates.find((c) => c.reference === added.reference).duplicate_of, fallFirst.id);
  backend.reset();
  assert.equal(backend.addDuplicate(), null);
  assert.equal(backend.expireUndo(), null);
});

check('B2 store: the keeping time (T6f) — purged candidates: invalid where the SQL says', () => {
  fresh();
  const alex = person('Alex', 'Kim'); // 18 on 2030-03-04 → purge day 2033-03-04 (3 + 3 years)
  setDay('2033-03-05');
  // the purge day has passed but the purge hasn't run yet: the detail already hides everything personal
  assert.ok(db().bb_candidates.find((c) => c.id === alex.id).date_of_birth !== null);
  const d = call('bb_candidate_detail', { p_candidate_id: alex.id });
  assert.deepEqual([d.candidate.date_of_birth, d.candidate.email_for_results, d.candidate.age_on_first_day, d.candidate.under_18_on_first_day, d.waiver.signer_name],
    [null, null, null, null, null]);
  assert.deepEqual(call('bb_view_signature', { p_candidate_id: alex.id }).signature, null);
  // the roster runs the purge (after building its rows)
  assert.equal(call('bb_cycle_roster', { p_cycle_id: springOf().id }).status, 'ok');
  const purged = db().bb_candidates.find((c) => c.id === alex.id);
  assert.deepEqual([purged.date_of_birth, purged.email_for_results, purged.personal_removed_at !== null], [null, null, true]);
  assert.equal(db().bb_candidate_waivers.find((x) => x.candidate_id === alex.id).signature, null);
  const v = () => version(alex.id);
  // what needs the DOB → invalid (the cycle is Past now too: the purged check comes first)
  assert.deepEqual(w('bb_record_paper_waiver', { p_candidate_id: alex.id, p_expected_version: v() }, STAFF), { status: 'invalid' });
  assert.deepEqual(w('bb_change_plan', { p_candidate_id: alex.id, p_expected_version: v(), p_cycle_plan_id: alex.cycle_plan_id, p_kukkiwon: false }, ADMIN), { status: 'invalid' });
  const noah = db().bb_candidates.filter((c) => c.first_name === 'Noah');
  assert.deepEqual(w('bb_resolve_duplicate', { p_keep_id: noah[0].id, p_keep_version: version(noah[0].id), p_other_id: noah[1].id, p_other_version: version(noah[1].id), p_keep_both: true }, STAFF), { status: 'invalid' });
  const edit = (dob, email, first = 'Alex') => w('bb_update_candidate', {
    p_candidate_id: alex.id, p_expected_version: v(), p_first: first, p_last: 'Kim', p_date_of_birth: dob, p_email: email, p_location_code: 'shrewsbury', p_dan: 1,
  }, STAFF);
  assert.deepEqual(edit('2012-03-04', 'x@example.com'), { status: 'invalid' }); // can't come back
  assert.equal(edit(null, null, 'Alexander').status, 'ok'); // a name change is fine
  // payments, withdraw, restore still work
  assert.equal(w('bb_record_payment', payArgs(alex.id, 100, 'cash', ['p1']), STAFF).status, 'ok');
  assert.equal(w('bb_withdraw_candidate', { p_candidate_id: alex.id, p_expected_version: v() }).status, 'ok');
  assert.equal(w('bb_restore_candidate', { p_candidate_id: alex.id, p_expected_version: v() }).status, 'ok');
  setDay('2027-02-15');
});

// =====================================================================================
// ======================= The rubric editor (migration 0024, contract 0024 §10.2) =======================
// =====================================================================================

// ----- rubric.js: the MD5 fingerprint (the converted subjects' ids) -----

check('rubric: md5Hex = Postgres md5() (checked against Node\'s own MD5)', () => {
  for (const text of ['', 'abc', '1/physical/Long jump', '4/other/Egg test', 'é ü 漢字 😀', 'x'.repeat(500)]) {
    assert.equal(md5Hex(text), createHash('md5').update(text, 'utf8').digest('hex'), text.slice(0, 20));
  }
});

// ----- rubric.js: the v1 → v2 conversion keeps every number (contract §4.3) -----

const V2 = rubricFromV1(STARTING_POINT_REQUIREMENTS);
const danOf = (doc, n) => doc.dans[n - 1];
const partOf = (dan, code) => dan.parts.find((p) => p.code === code);
const subjectOf = (dan, code, name) => partOf(dan, code).subjects.find((s) => s.name === name);

check('rubric: rubricFromV1(starting point) = rubricDefault.js, and it is valid', () => {
  assert.deepEqual(V2, DEFAULT_RUBRIC);
  assert.equal(V2.schema_version, 2);
  assert.equal(V2.source, 'Fall 2026 (old Sheet)');
  assert.deepEqual(rubricProblems(V2), []);
  assert.equal(rubricIsValid(V2), true);
  for (const n of [1, 2, 3, 4]) assert.deepEqual(danProblems(danOf(V2, n), n), [], `Dan ${n}`);
  for (const d of V2.dans) {
    assert.equal(d.rev, 1);
    assert.equal(d.saved_at, null);
    assert.equal(d.saved_by_name, null);
    assert.deepEqual(d.parts.map((p) => p.code), RUBRIC_PART_CODES);
  }
  // the ids: left(md5(dan || '/' || code || '/' || name), 8), unique in each Dan
  assert.equal(subjectOf(danOf(V2, 1), 'physical', 'Long jump').id, md5Hex('1/physical/Long jump').slice(0, 8));
  for (const d of V2.dans) {
    const ids = d.parts.flatMap((p) => p.subjects.map((s) => s.id));
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => /^[a-z0-9]{8}$/.test(id)));
  }
  // a surprise shape stops the conversion instead of guessing
  const odd = JSON.parse(JSON.stringify(STARTING_POINT_REQUIREMENTS));
  odd.dans[0].parts[0].subjects[6].scoring.groups[0].method = 'swing';
  assert.throws(() => rubricFromV1(odd), /unknown method/);
  const odd2 = JSON.parse(JSON.stringify(STARTING_POINT_REQUIREMENTS));
  odd2.dans[1].parts[2].subjects[0].colour = 'red';
  assert.throws(() => rubricFromV1(odd2), /unknown key/);
  assert.throws(() => rubricFromV1(V2), /not a v1 sheet/);
});

check('rubric: no number changed — every v1 value is in v2 and the other way round (§4.3)', () => {
  const v1 = STARTING_POINT_REQUIREMENTS;
  const rows = { points: [[], []], cutoffs: [[], []], facts: [[], []], units: [[], []], max: [[], []], pass: [[], []] };
  // "Pull-up or hold": reps ↔ the way "Pull-up" (unit reps), hold ↔ "Hold" (unit seconds)
  const wayOfMethod = { reps: 'Pull-up', hold: 'Hold' };
  const unitOfMethod = { reps: 'reps', hold: 'seconds' };
  for (const d of v1.dans) {
    for (const p of d.parts) {
      for (const s of p.subjects) {
        for (const [g, v] of Object.entries(s.scoring.points)) rows.points[0].push([d.dan, p.code, s.name, g, v]);
        rows.facts[0].push([d.dan, p.code, s.name, s.credits, s.outdoor === true, s.hand_in === true, s.scoring.note ?? null, s.scoring.kind === 'grades' ? 'graded' : 'measured']);
        for (const grp of s.scoring.groups ?? []) {
          const way = grp.method ? wayOfMethod[grp.method] : null;
          for (const c of grp.cutoffs) rows.cutoffs[0].push([d.dan, p.code, s.name, way, grp.ages.min, grp.ages.max, c.grade, c.value]);
        }
        if (s.scoring.kind === 'table') {
          const methods = [...new Set(s.scoring.groups.map((g) => g.method ?? null))];
          for (const m of methods) rows.units[0].push([d.dan, p.code, s.name, m ? wayOfMethod[m] : null, m ? unitOfMethod[m] : s.scoring.unit, s.scoring.direction]);
        }
      }
      rows.max[0].push([d.dan, p.code, null, 17, p.max_points]);
      rows.max[0].push([d.dan, p.code, 18, null, p.max_points_adult ?? p.max_points]);
    }
    rows.pass[0].push([d.dan, null, 17, d.pass_rule.points], [d.dan, 18, null, d.pass_rule.points_adult ?? d.pass_rule.points]);
  }
  for (const d of V2.dans) {
    for (const p of d.parts) {
      for (const s of p.subjects) {
        for (const [g, v] of Object.entries(s.points)) rows.points[1].push([d.dan, p.code, s.name, g, v]);
        rows.facts[1].push([d.dan, p.code, s.name, s.credits, s.outdoor, s.handed_in, s.note, s.scoring]);
        for (const w of s.ways) {
          for (const b of w.brackets) for (const [g, v] of Object.entries(b.cutoffs)) rows.cutoffs[1].push([d.dan, p.code, s.name, w.name, b.from, b.to, g, v]);
          rows.units[1].push([d.dan, p.code, s.name, w.name, w.unit, w.direction]);
        }
      }
      // the v1 maxima (children / adults) = the worked-out maximum of the matching bracket
      rows.max[1].push([d.dan, p.code, null, 17, partMax(p, { from: null, to: 17 })]);
      rows.max[1].push([d.dan, p.code, 18, null, partMax(p, { from: 18, to: null })]);
    }
    // a Dan with one bracket passes children and adults at the same mark
    const markFor = (age) => d.pass.brackets.find((b) => (b.from ?? 0) <= age && (b.to ?? 99) >= age).pass_mark;
    rows.pass[1].push([d.dan, null, 17, markFor(17)], [d.dan, 18, null, markFor(18)]);
  }
  const key = (r) => JSON.stringify(r);
  for (const [name, [a, b]] of Object.entries(rows)) {
    const inB = new Set(b.map(key));
    const inA = new Set(a.map(key));
    assert.deepEqual(a.filter((r) => !inB.has(key(r))), [], `${name}: in v1, not in v2`);
    assert.deepEqual(b.filter((r) => !inA.has(key(r))), [], `${name}: in v2, not in v1`);
    assert.equal(a.length, b.length, name);
  }
  // no_d, makeup, extra points (equal apart from the added null note), the hand-in list
  for (const d of v1.dans) {
    const n = danOf(V2, d.dan);
    assert.equal(n.pass.no_d, d.pass_rule.no_d);
    assert.equal(n.pass.makeup, d.pass_rule.makeup);
    assert.deepEqual(n.extra_points, { note: null, ...d.extra_points });
    assert.deepEqual(handedIn(n).map((x) => x.subject.name), d.hand_in.map((x) => x.name));
    // each Dan's grade points = the v1 scales (Other = a copy of Technical's)
    for (const code of ['physical', 'technical', 'curriculum']) assert.deepEqual(partOf(n, code).grade_points, v1.grade_scales[code]);
    assert.deepEqual(partOf(n, 'other').grade_points, v1.grade_scales.technical);
  }
});

check('rubric: the CP1-approved numbers, typed from supabase/tests/0016_seed_review.txt', () => {
  const d1 = danOf(V2, 1);
  const d4 = danOf(V2, 4);
  // the 19 subjects with their own points (v0.924): Dans 1–3 four each, Dan 4 seven
  const own = V2.dans.flatMap((d) => d.parts.flatMap((p) => p.subjects.filter((s) => s.points_mode === 'own').map((s) => `${d.dan}:${s.name}`)));
  const expected = [];
  for (const n of [1, 2, 3]) expected.push(...['Egg test', 'Meditation', 'Assistant instructor course', 'TKD project'].map((s) => `${n}:${s}`));
  expected.push(...['Free sparring', 'Target kick (30 sec)', 'Korean terminology', 'TKD knowledge', 'Egg test', 'Meditation', 'Appreciation letter'].map((s) => `4:${s}`));
  assert.deepEqual(own.sort(), expected.sort());
  assert.equal(own.length, 19);
  // review line 439 (Dan 4 Technical): Target kick B = 9 (not 4 credits × 2.5 = 10)
  assert.equal(subjectOf(d4, 'technical', 'Target kick (30 sec)').points.B, 9);
  assert.deepEqual(subjectOf(d4, 'technical', 'Target kick (30 sec)').points, { 'A+': 16, A: 14, 'B+': 12, B: 9, C: 8, D: 0 });
  // review line 139 (Dan 1 Other): Egg test B = 11
  assert.equal(subjectOf(d1, 'other', 'Egg test').points.B, 11);
  assert.deepEqual(subjectOf(d1, 'other', 'Egg test').points, { 'A+': 20, A: 17.5, 'A-': 16.25, 'B+': 15, B: 11, 'B-': 10.5, C: 10, 'C-': 5, D: 0 });
  // review line 51: 1st Dan passes at 275 (children) / 293 (adults) → brackets 17 and under / 18 and over
  assert.deepEqual(d1.pass.brackets, [{ from: null, to: 17, pass_mark: 275 }, { from: 18, to: null, pass_mark: 293 }]);
  // review lines 157, 265, 373: 2nd 261, 3rd 293, 4th 453, one bracket each
  assert.deepEqual(V2.dans.slice(1).map((d) => d.pass.brackets), [
    [{ from: null, to: null, pass_mark: 261 }], [{ from: null, to: null, pass_mark: 293 }], [{ from: null, to: null, pass_mark: 453 }]]);
  // review line 129: One Step Sparring (1-24) [adults only] → only 18 and over
  assert.deepEqual(subjectOf(d1, 'curriculum', 'One Step Sparring (1-24)').limited_to, [{ from: 18, to: null }]);
  assert.equal(V2.dans.flatMap((d) => d.parts.flatMap((p) => p.subjects.filter((s) => s.limited_to !== null))).length, 1);
  // review lines 89–93: Pull-up or hold, 2 credits, outdoor = two ways with the CP1 numbers
  for (const d of V2.dans) {
    const s = subjectOf(d, 'physical', 'Pull-up or hold');
    assert.equal(s.credits, 2);
    assert.equal(s.outdoor, true);
    assert.equal(s.scoring, 'measured');
    assert.deepEqual(s.ways, [
      { name: 'Pull-up', unit: 'reps', direction: 'at_least', brackets: [
        { from: null, to: 12, cutoffs: { 'A+': 6, A: 5, 'B+': 3, B: 2, C: 1 } },
        { from: 13, to: null, cutoffs: { 'A+': 10, A: 8, 'B+': 6, B: 4, C: 2 } }] },
      { name: 'Hold', unit: 'seconds', direction: 'at_least', brackets: [
        { from: null, to: null, cutoffs: { 'A+': 31, A: 26, 'B+': 21, B: 11, C: 9 } }] },
    ]);
  }
  // review lines 47–49: each Dan's grade points = the shared scales
  for (const d of V2.dans) {
    assert.deepEqual(partOf(d, 'physical').grade_points, { 'A+': 4, A: 3.5, 'B+': 3, B: 2.5, C: 2, D: 0 });
    assert.deepEqual(partOf(d, 'technical').grade_points, { 'A+': 4, A: 3.5, 'A-': 3.25, 'B+': 3, B: 2.5, 'B-': 2.25, C: 2, 'C-': 1, D: 0 });
    assert.deepEqual(partOf(d, 'curriculum').grade_points, { 'A+': 4.5, A: 4, 'A-': 3.8, 'B+': 3.5, B: 3.3, 'B-': 3, C: 2.5, 'C-': 2, D: 0 });
    assert.deepEqual(partOf(d, 'other').grade_points, { 'A+': 4, A: 3.5, 'A-': 3.25, 'B+': 3, B: 2.5, 'B-': 2.25, C: 2, 'C-': 1, D: 0 });
  }
  // the unit text is copied exactly (the screens may draw ×)
  assert.equal(subjectOf(d1, 'physical', 'Long jump').ways[0].unit, 'inches (feet x 12 + inches)');
  // 4th Dan keeps its extra-points note
  assert.equal(d4.extra_points.note, '4th Dan uses the 3rd Dan numbers for now');
});

// ----- rubric.js: maxima, labels, letters -----

check('rubric: most points 339 / 361.5 / 343.5 / 384 / 595; Curriculum 135 (157.5 for 18 and over)', () => {
  const young = { from: null, to: 17 };
  const adult = { from: 18, to: null };
  const all = { from: null, to: null };
  assert.equal(mostPoints(danOf(V2, 1), young), 339);
  assert.equal(mostPoints(danOf(V2, 1), adult), 361.5);
  assert.equal(mostPoints(danOf(V2, 2), all), 343.5);
  assert.equal(mostPoints(danOf(V2, 3), all), 384);
  assert.equal(mostPoints(danOf(V2, 4), all), 595);
  assert.equal(partMax(partOf(danOf(V2, 1), 'curriculum'), young), 135);
  assert.equal(partMax(partOf(danOf(V2, 1), 'curriculum'), adult), 157.5);
  assert.deepEqual(partMaxByBracket(danOf(V2, 1), 'curriculum'), [{ max: 135, brackets: [young] }, { max: 157.5, brackets: [adult] }]);
  assert.deepEqual(partMaxByBracket(danOf(V2, 1), 'physical'), [{ max: 80, brackets: [young, adult] }]);
  assert.deepEqual(partMaxByBracket(danOf(V2, 4), partOf(danOf(V2, 4), 'technical')), [{ max: 144, brackets: [all] }]);
  // the v1 maxima of every Dan (review lines 52, 108, 122, 137 … 465)
  assert.deepEqual(V2.dans.map((d) => d.parts.map((p) => partMax(p, d.pass.brackets[0]))), [[80, 44, 135, 80], [80, 44, 139.5, 80], [80, 44, 180, 80], [80, 144, 243, 128]]);
  assert.equal(bracketLabel({ from: null, to: null }), 'All ages');
  assert.equal(bracketLabel({ from: null, to: 8 }), '8 and under');
  assert.equal(bracketLabel({ from: 13, to: null }), '13 and over');
  assert.equal(bracketLabel({ from: 9, to: 12 }), '9–12');
  assert.equal(bracketLabel({ from: 9, to: 9 }), '9');
  const sparring = subjectOf(danOf(V2, 1), 'curriculum', 'One Step Sparring (1-24)');
  assert.equal(subjectCountsFor(sparring, adult), true);
  assert.equal(subjectCountsFor(sparring, young), false);
  assert.deepEqual(SHORT_LETTERS, ['A+', 'A', 'B+', 'B', 'C', 'D']);
  assert.deepEqual(LONG_LETTERS, ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'C-', 'D']);
  assert.deepEqual(CUTOFF_LETTERS, ['A+', 'A', 'B+', 'B', 'C']);
  // worked-out points: credits × the part's grade points, exact to the cent
  const curriculum = partOf(danOf(V2, 2), 'curriculum');
  assert.deepEqual(workedPoints(curriculum, subjectOf(danOf(V2, 2), 'curriculum', 'Go-Ryo Poomsae')),
    { 'A+': 13.5, A: 12, 'A-': 11.4, 'B+': 10.5, B: 9.9, 'B-': 9, C: 7.5, 'C-': 6, D: 0 }); // 3 × 3.3 = 9.9, not 9.899…
  assert.deepEqual(workedPoints(partOf(danOf(V2, 4), 'technical'), subjectOf(danOf(V2, 4), 'technical', 'Target kick (30 sec)')),
    { 'A+': 16, A: 14, 'B+': 12, B: 10, C: 8, D: 0 }); // a measured subject uses the six short letters
});

check('rubric: numbers — 2 decimals, whole numbers, the decimal edge cases (§1.4, §3.4)', () => {
  assert.equal(round2(3 * 3.35), 10.05);
  assert.equal(round2(7 * 2.15), 15.05);
  assert.equal(round2(3 * 3.3), 9.9);
  assert.equal(numOk(10.05, 0, 999), true);
  assert.equal(numOk(15.05, 0, 999), true);
  assert.equal(numOk(0.05, 0.01, 999), true);
  assert.equal(numOk(2.555, 0, 999), false);
  assert.equal(numOk(1.005, 0, 999), false);
  assert.equal(numOk(1e30, 0, 999), false);
  assert.equal(numOk('3', 0, 999), false);
  assert.equal(numOk(null, 0, 999), false);
  assert.equal(numOk(Number.NaN, 0, 999), false);
  assert.equal(intOk(2.5, 1, 20), false);
  assert.equal(intOk(1e30, 1, 20), false);
  assert.equal(intOk(20, 1, 20), true);
  // the name and text rules (shared helpers + 0024's extra characters)
  const ch = (cp) => String.fromCodePoint(cp);
  assert.equal(rubricNameOk('Long jump'), true);
  assert.equal(rubricNameOk(' Long jump'), false); // not normalized
  assert.equal(rubricNameOk('Long  jump'), false);
  assert.equal(rubricNameOk('x'.repeat(61)), false);
  assert.equal(rubricTextOk('reps', 40), true);
  assert.equal(rubricTextOk('two\nlines', 200), false);
  assert.equal(rubricTextOk('tab\there', 200), false);
  assert.equal(rubricTextOk('', 200), false);
  for (const cp of [0x202e, 0x200b, 0x07, 0x061c, 0x2028, 0x2029, 0x00ad, 0x180e, 0xe0001, 0xe007f]) {
    assert.equal(rubricNameOk(`Long${ch(cp)}jump`), false, cp.toString(16));
    assert.equal(rubricTextOk(`Long${ch(cp)}jump`, 200), false, cp.toString(16));
  }
});

// ----- rubric.js: the validator against the shared test cases (contract §3.4) -----
// Each case: { name, dan_no, base: 'default:<1-4>' (one Dan) or 'default' (the whole document,
// through rubricProblems = bb_rubric_is_valid), ops: [{ op: 'set'|'remove', path, value }],
// expect: [codes, sorted, unique] }. The SAME cases run through the SQL validator in PGlite.

function applyOps(target, ops) {
  const doc = JSON.parse(JSON.stringify(target));
  let root = { v: doc };
  for (const { op, path, value, value_json: valueJson } of ops) {
    const keys = ['v', ...path];
    let at = root;
    for (const k of keys.slice(0, -1)) at = at[k];
    const last = keys[keys.length - 1];
    // "value_json" is the value as raw JSON text (e.g. "18.0", which the SQL side keeps as 18.0;
    // in JavaScript it is simply the number 18)
    if (op === 'set' && typeof valueJson === 'string') at[last] = JSON.parse(valueJson);
    else if (op === 'set') at[last] = JSON.parse(JSON.stringify(value === undefined ? null : value));
    else if (Array.isArray(at)) at.splice(last, 1);
    else delete at[last];
  }
  return root.v;
}

function runCase(c) {
  const [, n] = /^default(?::([1-4]))?$/.exec(c.base) ?? [];
  if (n) {
    const dan = applyOps(DEFAULT_RUBRIC.dans[Number(n) - 1], c.ops ?? []);
    return problemCodes(danProblems(dan, c.dan_no ?? Number(n)));
  }
  return problemCodes(rubricProblems(applyOps(DEFAULT_RUBRIC, c.ops ?? [])));
}

// This file's own cases (one or more per problem code, the §3.4 required ones). The SQL twin
// runs supabase/tests/0024_rubric_cases.json; when that file exists, it runs here too.
const PHYS = ['parts', 0, 'subjects'];
const TECH = ['parts', 1, 'subjects'];
const CURR = ['parts', 2, 'subjects'];
const OTHER = ['parts', 3, 'subjects'];
const STRETCH_B = [...PHYS, 0, 'ways', 0, 'brackets'];
const PULL = [...PHYS, 6];
const ITEMS = ['extra_points', 'items'];
const set = (path, value) => ({ op: 'set', path, value });
const remove = (path) => ({ op: 'remove', path });
const D1 = 'default:1';
const JS_RUBRIC_CASES = [
  { name: 'every Dan of the default is valid', dan_no: 1, base: D1, ops: [], expect: [] },
  { name: 'default Dan 2', dan_no: 2, base: 'default:2', ops: [], expect: [] },
  { name: 'default Dan 3', dan_no: 3, base: 'default:3', ops: [], expect: [] },
  { name: 'default Dan 4', dan_no: 4, base: 'default:4', ops: [], expect: [] },
  { name: 'the whole default', base: 'default', ops: [], expect: [] },
  // V1 / V20b shape, dan number, stamps
  { name: 'unknown key in a Dan', dan_no: 1, base: D1, ops: [set(['colour'], 'red')], expect: ['shape'] },
  { name: 'Dan: missing key', dan_no: 1, base: D1, ops: [remove(['pass'])], expect: ['shape'] },
  { name: 'Dan: wrong type (rev as text)', dan_no: 1, base: D1, ops: [set(['rev'], '1')], expect: ['shape'] },
  { name: 'dan number', dan_no: 1, base: D1, ops: [set(['dan'], 2)], expect: ['dan_number'] },
  { name: 'rev 1 000 001', dan_no: 1, base: D1, ops: [set(['rev'], 1000001)], expect: ['shape'] },
  { name: 'saved_at not the pattern', dan_no: 1, base: D1, ops: [set(['saved_at'], '2026-10-21 10:00')], expect: ['shape'] },
  { name: 'saved_by_name 61 characters', dan_no: 1, base: D1, ops: [set(['saved_by_name'], 'x'.repeat(61))], expect: ['shape'] },
  { name: 'parts: five parts', dan_no: 1, base: D1, ops: [set(['parts', 4], DEFAULT_RUBRIC.dans[0].parts[3])], expect: ['shape'] },
  { name: 'parts out of order', dan_no: 1, base: D1, ops: [set(['parts', 0, 'code'], 'technical')], expect: ['shape'] },
  { name: 'Rubric: missing key (source)', base: 'default', ops: [remove(['source'])], expect: ['shape'] },
  { name: 'Rubric: wrong type (dans an object)', base: 'default', ops: [set(['dans'], {})], expect: ['shape'] },
  { name: 'Rubric: schema_version 1', base: 'default', ops: [set(['schema_version'], 1)], expect: ['shape'] },
  // Pass, pass bracket
  { name: 'Pass: missing key', dan_no: 1, base: D1, ops: [remove(['pass', 'no_d'])], expect: ['shape'] },
  { name: 'Pass: wrong type (no_d)', dan_no: 1, base: D1, ops: [set(['pass', 'no_d'], 'yes')], expect: ['shape'] },
  { name: 'pass bracket: missing key', dan_no: 1, base: D1, ops: [remove(['pass', 'brackets', 0, 'pass_mark'])], expect: ['shape'] },
  { name: 'pass bracket: wrong type', dan_no: 1, base: D1, ops: [set(['pass', 'brackets', 0], 'x')], expect: ['shape'] },
  { name: 'pass mark 0', dan_no: 1, base: D1, ops: [set(['pass', 'brackets', 0, 'pass_mark'], 0)], expect: ['pass_mark_range'] },
  { name: 'pass mark null', dan_no: 1, base: D1, ops: [set(['pass', 'brackets', 0, 'pass_mark'], null)], expect: ['pass_mark_range'] },
  { name: 'pass mark 10000', dan_no: 2, base: 'default:2', ops: [set(['pass', 'brackets', 0, 'pass_mark'], 10000)], expect: ['pass_mark_range'] },
  { name: 'pass mark above the most points', dan_no: 1, base: D1, ops: [set(['pass', 'brackets', 0, 'pass_mark'], 339.01)], expect: ['pass_mark_too_high'] },
  { name: 'pass mark = the most points', dan_no: 1, base: D1, ops: [set(['pass', 'brackets', 0, 'pass_mark'], 339)], expect: [] },
  { name: 'make-up empty', dan_no: 1, base: D1, ops: [set(['pass', 'makeup'], '')], expect: ['makeup'] },
  { name: 'make-up 301', dan_no: 1, base: D1, ops: [set(['pass', 'makeup'], 'x'.repeat(301))], expect: ['makeup'] },
  { name: 'make-up null', dan_no: 1, base: D1, ops: [set(['pass', 'makeup'], null)], expect: [] },
  { name: 'pass brackets: none', dan_no: 1, base: D1, ops: [set(['pass', 'brackets'], [])], expect: ['brackets_count'] }, // limited_to is only compared with usable pass brackets
  { name: 'pass brackets: a gap', dan_no: 1, base: D1, ops: [set(['pass', 'brackets', 1, 'from'], 19), set([...CURR, 3, 'limited_to'], [{ from: 19, to: null }])], expect: ['brackets_gap'] },
  { name: 'pass brackets: closed last', dan_no: 1, base: D1, ops: [set(['pass', 'brackets', 1, 'to'], 99), set([...CURR, 3, 'limited_to'], [{ from: 18, to: 99 }])], expect: ['brackets_ends'] },
  { name: 'bracket with no subject', dan_no: 1, base: D1, ops: [
    set([...PHYS], [{ ...subjectOf(danOf(V2, 1), 'physical', 'Stretching'), limited_to: [{ from: 18, to: null }] }]),
    set([...TECH], [{ ...subjectOf(danOf(V2, 1), 'technical', 'Referee seminar'), limited_to: [{ from: 18, to: null }] }]),
    set([...CURR], [subjectOf(danOf(V2, 1), 'curriculum', 'One Step Sparring (1-24)')]),
    set([...OTHER], [{ ...subjectOf(danOf(V2, 1), 'other', 'Egg test'), limited_to: [{ from: 18, to: null }] }]),
  ], expect: ['bracket_empty', 'pass_mark_too_high'] },
  // Part
  { name: 'Part: missing key', dan_no: 1, base: D1, ops: [remove(['parts', 0, 'grade_points'])], expect: ['shape'] },
  { name: 'Part: wrong type (subjects)', dan_no: 1, base: D1, ops: [set(['parts', 1, 'subjects'], {})], expect: ['shape'] },
  { name: 'part name empty', dan_no: 1, base: D1, ops: [set(['parts', 0, 'name'], '')], expect: ['part_name'] },
  { name: 'part name used twice', dan_no: 1, base: D1, ops: [set(['parts', 1, 'name'], 'PHYSICAL')], expect: ['part_name_duplicate'] },
  { name: 'grade point above 999', dan_no: 1, base: D1, ops: [set(['parts', 0, 'grade_points', 'A+'], 1000)], expect: ['grade_points_range'] },
  { name: 'grade point going up', dan_no: 1, base: D1, ops: [set(['parts', 0, 'grade_points', 'A'], 4.5)], expect: ['grade_points_order', 'points_not_worked_out'] }, // usable numbers: the worked-out check still runs
  { name: 'grade points: not an object', dan_no: 1, base: D1, ops: [set(['parts', 1, 'grade_points'], [])], expect: ['shape'] },
  { name: 'grade points: a missing letter', dan_no: 1, base: D1, ops: [remove(['parts', 1, 'grade_points', 'C-'])], expect: ['grade_points_range'] },
  { name: '0 subjects', dan_no: 1, base: D1, ops: [set([...TECH], [])], expect: ['subject_count'] },
  { name: '31 subjects', dan_no: 1, base: D1, ops: [set([...TECH], Array.from({ length: 31 }, (_, i) => ({ ...subjectOf(danOf(V2, 1), 'technical', 'Referee seminar'), id: `s${String(i).padStart(7, '0')}`, name: `Seminar ${i}` })))], expect: ['subject_count'] },
  // Subject
  { name: 'Subject: missing key', dan_no: 1, base: D1, ops: [remove([...PHYS, 0, 'outdoor'])], expect: ['shape'] },
  { name: 'Subject: wrong type (outdoor)', dan_no: 1, base: D1, ops: [set([...PHYS, 0, 'outdoor'], 'no')], expect: ['shape'] },
  { name: 'subject id used twice', dan_no: 1, base: D1, ops: [set([...TECH, 0, 'id'], subjectOf(danOf(V2, 1), 'physical', 'Stretching').id)], expect: ['subject_id'] },
  { name: 'subject id capitals', dan_no: 1, base: D1, ops: [set([...TECH, 0, 'id'], 'ABCDEFGH')], expect: ['subject_id'] },
  { name: 'subject name 61 characters', dan_no: 1, base: D1, ops: [set([...PHYS, 4, 'name'], 'x'.repeat(61))], expect: ['subject_name'] },
  { name: 'subject name not normalized', dan_no: 1, base: D1, ops: [set([...PHYS, 4, 'name'], 'Long  jump')], expect: ['subject_name'] },
  { name: 'subject name used twice in its part', dan_no: 1, base: D1, ops: [set([...PHYS, 4, 'name'], 'STRETCHING')], expect: ['subject_name_duplicate'] },
  { name: 'the same name in another part is fine', dan_no: 1, base: D1, ops: [set([...TECH, 0, 'name'], 'Stretching')], expect: [] },
  { name: 'credits 2.5', dan_no: 1, base: D1, ops: [set([...PHYS, 4, 'credits'], 2.5)], expect: ['credits'] },
  { name: 'credits 1e30', dan_no: 1, base: D1, ops: [set([...PHYS, 4, 'credits'], 1e30)], expect: ['credits'] },
  { name: 'credits null', dan_no: 1, base: D1, ops: [set([...PHYS, 4, 'credits'], null)], expect: ['credits'] },
  { name: 'credits 21', dan_no: 1, base: D1, ops: [set([...OTHER, 0, 'credits'], 21)], expect: ['credits'] },
  { name: 'points above 999', dan_no: 1, base: D1, ops: [set([...OTHER, 0, 'points', 'A+'], 1000)], expect: ['points_range'] },
  { name: 'points A+ 0', dan_no: 1, base: D1, ops: [set([...OTHER, 0, 'points'], { 'A+': 0, A: 0, 'A-': 0, 'B+': 0, B: 0, 'B-': 0, C: 0, 'C-': 0, D: 0 })], expect: ['points_order'] }, // A+ above 0 is an order rule
  { name: 'own points going up', dan_no: 1, base: D1, ops: [set([...OTHER, 0, 'points', 'B'], 18)], expect: ['points_order'] },
  { name: 'points: a missing letter', dan_no: 1, base: D1, ops: [remove([...OTHER, 0, 'points', 'C-'])], expect: ['points_range'] },
  { name: 'points: not an object', dan_no: 1, base: D1, ops: [set([...OTHER, 0, 'points'], 5)], expect: ['shape'] },
  { name: 'worked out ≠ credits × grade points', dan_no: 1, base: D1, ops: [set([...PHYS, 4, 'points', 'B'], 4.5)], expect: ['points_not_worked_out'] },
  { name: 'credits changed, points not worked out again', dan_no: 1, base: D1, ops: [set([...PHYS, 4, 'credits'], 3)], expect: ['points_not_worked_out'] },
  { name: '3 credits × 3.35 = 10.05', dan_no: 1, base: D1, ops: [
    set(['parts', 3, 'grade_points', 'A-'], 3.35), set([...OTHER, 3, 'credits'], 3),
    set([...OTHER, 3, 'points'], { 'A+': 12, A: 10.5, 'A-': 10.05, 'B+': 9, B: 7.5, 'B-': 6.75, C: 6, 'C-': 3, D: 0 })], expect: [] },
  { name: 'graded subject with a way', dan_no: 1, base: D1, ops: [set([...TECH, 0, 'ways'], [subjectOf(danOf(V2, 1), 'physical', 'Stretching').ways[0]])], expect: ['ways_count'] },
  { name: 'three ways', dan_no: 1, base: D1, ops: [set([...PULL, 'ways', 2], { ...subjectOf(danOf(V2, 1), 'physical', 'Pull-up or hold').ways[1], name: 'Hang' })], expect: ['ways_count'] },
  { name: 'measured with no way', dan_no: 1, base: D1, ops: [set([...PHYS, 0, 'ways'], [])], expect: ['ways_count'] },
  { name: 'two ways, one unnamed', dan_no: 1, base: D1, ops: [set([...PULL, 'ways', 0, 'name'], null)], expect: ['way_name'] },
  { name: 'two ways, the same name', dan_no: 1, base: D1, ops: [set([...PULL, 'ways', 1, 'name'], 'pull-up')], expect: ['way_name'] },
  { name: 'one way, named', dan_no: 1, base: D1, ops: [set([...PHYS, 0, 'ways', 0, 'name'], 'Sit and reach')], expect: [] },
  { name: 'limited to a bracket that does not exist', dan_no: 1, base: D1, ops: [set([...CURR, 3, 'limited_to'], [{ from: 21, to: null }])], expect: ['limited_to'] },
  { name: 'limited to the same bracket twice', dan_no: 1, base: D1, ops: [set([...CURR, 3, 'limited_to'], [{ from: 18, to: null }, { from: 18, to: null }])], expect: ['limited_to'] },
  { name: 'limited to an empty list', dan_no: 1, base: D1, ops: [set([...CURR, 3, 'limited_to'], [])], expect: ['limited_to'] },
  { name: 'note 201', dan_no: 1, base: D1, ops: [set([...PHYS, 8, 'note'], 'x'.repeat(201))], expect: ['note'] },
  { name: 'note empty', dan_no: 1, base: D1, ops: [set([...PHYS, 8, 'note'], '')], expect: ['note'] },
  // Way, way bracket, cut-offs
  { name: 'Way: missing key', dan_no: 1, base: D1, ops: [remove([...PHYS, 0, 'ways', 0, 'unit'])], expect: ['shape'] },
  { name: 'Way: wrong type', dan_no: 1, base: D1, ops: [set([...PHYS, 0, 'ways', 0], [])], expect: ['shape'] },
  { name: 'unit empty', dan_no: 1, base: D1, ops: [set([...PHYS, 0, 'ways', 0, 'unit'], '')], expect: ['unit'] },
  { name: 'unit 41', dan_no: 1, base: D1, ops: [set([...PHYS, 0, 'ways', 0, 'unit'], 'x'.repeat(41))], expect: ['unit'] },
  { name: 'direction unknown', dan_no: 1, base: D1, ops: [set([...PHYS, 0, 'ways', 0, 'direction'], 'more')], expect: ['direction'] },
  { name: 'way bracket: missing key', dan_no: 1, base: D1, ops: [remove([...STRETCH_B, 0, 'cutoffs'])], expect: ['shape'] },
  { name: 'way bracket: wrong type', dan_no: 1, base: D1, ops: [set([...STRETCH_B, 0], 5)], expect: ['shape'] },
  { name: 'cut-offs: missing key', dan_no: 1, base: D1, ops: [remove([...STRETCH_B, 0, 'cutoffs', 'C'])], expect: ['cutoffs_range'] },
  { name: 'cut-offs: wrong type', dan_no: 1, base: D1, ops: [set([...STRETCH_B, 0, 'cutoffs'], [])], expect: ['shape'] },
  { name: 'cut-off 2.555', dan_no: 1, base: D1, ops: [set([...STRETCH_B, 0, 'cutoffs', 'B'], 2.555)], expect: ['cutoffs_range'] },
  { name: 'cut-off null', dan_no: 1, base: D1, ops: [set([...STRETCH_B, 0, 'cutoffs', 'B'], null)], expect: ['cutoffs_range'] },
  { name: 'at-least cut-off going up', dan_no: 1, base: D1, ops: [set([...STRETCH_B, 0, 'cutoffs', 'A'], 5)], expect: ['cutoffs_order'] },
  { name: 'at-least cut-offs equal', dan_no: 1, base: D1, ops: [set([...STRETCH_B, 0, 'cutoffs', 'A'], 4)], expect: ['cutoffs_order'] },
  { name: 'at-most cut-off going down', dan_no: 1, base: D1, ops: [set([...PHYS, 5, 'ways', 0, 'brackets', 0, 'cutoffs', 'A'], 9)], expect: ['cutoffs_order'] },
  { name: '7 brackets', dan_no: 1, base: D1, ops: [set([...STRETCH_B], [
    { from: null, to: 5 }, { from: 6, to: 7 }, { from: 8, to: 9 }, { from: 10, to: 11 }, { from: 12, to: 13 }, { from: 14, to: 15 }, { from: 16, to: null },
  ].map((b) => ({ ...b, cutoffs: { 'A+': 4, A: 3.5, 'B+': 3, B: 2.5, C: 2 } })))], expect: ['brackets_count'] },
  { name: 'no brackets', dan_no: 1, base: D1, ops: [set([...STRETCH_B], [])], expect: ['brackets_count'] },
  { name: 'age 100', dan_no: 1, base: D1, ops: [set([...STRETCH_B, 1, 'to'], 100)], expect: ['bracket_ages'] },
  { name: 'from after to', dan_no: 1, base: D1, ops: [set([...STRETCH_B, 1, 'from'], 13)], expect: ['bracket_ages'] },
  { name: 'a gap', dan_no: 1, base: D1, ops: [set([...STRETCH_B, 1, 'from'], 10)], expect: ['brackets_gap'] },
  { name: 'an overlap', dan_no: 1, base: D1, ops: [set([...STRETCH_B, 1, 'from'], 8)], expect: ['brackets_overlap'] },
  { name: 'the first not from the youngest', dan_no: 1, base: D1, ops: [set([...STRETCH_B, 0, 'from'], 3)], expect: ['brackets_ends'] },
  { name: 'a closed last bracket', dan_no: 1, base: D1, ops: [set([...STRETCH_B, 2, 'to'], 99)], expect: ['brackets_ends'] },
  { name: 'a middle bracket with to: null', dan_no: 1, base: D1, ops: [set([...STRETCH_B, 1, 'to'], null)], expect: ['brackets_overlap'] }, // the next one starts inside "9 and over"
  { name: 'not youngest first', dan_no: 1, base: D1, ops: [set([...STRETCH_B], [2, 1, 0].map((i) => subjectOf(danOf(V2, 1), 'physical', 'Stretching').ways[0].brackets[i]))], expect: ['brackets_ends', 'brackets_order', 'brackets_overlap'] },
  // Extra points, item, rule, step
  { name: 'Extra: missing key', dan_no: 1, base: D1, ops: [remove(['extra_points', 'items'])], expect: ['shape'] },
  { name: 'Extra: wrong type (to_confirm)', dan_no: 1, base: D1, ops: [set(['extra_points', 'to_confirm'], 1)], expect: ['shape'] },
  { name: 'extra limit 0', dan_no: 1, base: D1, ops: [set(['extra_points', 'limit'], 0)], expect: ['extra_limit'] },
  { name: 'extra limit 1000', dan_no: 1, base: D1, ops: [set(['extra_points', 'limit'], 1000)], expect: ['extra_limit'] },
  { name: 'extra note empty', dan_no: 1, base: D1, ops: [set(['extra_points', 'note'], '')], expect: ['extra_note'] },
  { name: '13 extra items', dan_no: 1, base: D1, ops: [set([...ITEMS], Array.from({ length: 13 }, (_, i) => ({ name: `Item ${i}`, rule: { kind: 'per_count', points_each: 1 } })))], expect: ['extra_item_count'] },
  { name: 'no extra items is fine', dan_no: 1, base: D1, ops: [set([...ITEMS], [])], expect: [] },
  { name: 'item: missing key', dan_no: 1, base: D1, ops: [remove([...ITEMS, 0, 'rule'])], expect: ['shape'] },
  { name: 'item: wrong type', dan_no: 1, base: D1, ops: [set([...ITEMS, 0], 'x')], expect: ['shape'] },
  { name: 'item name empty', dan_no: 1, base: D1, ops: [set([...ITEMS, 0, 'name'], '')], expect: ['extra_item_name'] },
  { name: 'item name used twice', dan_no: 1, base: D1, ops: [set([...ITEMS, 1, 'name'], 'extra stripes')], expect: ['extra_item_name_duplicate'] },
  { name: 'rule: missing key', dan_no: 1, base: D1, ops: [remove([...ITEMS, 0, 'rule', 'kind'])], expect: ['extra_rule'] }, // any rule that isn't one of the two kinds
  { name: 'rule: wrong type', dan_no: 1, base: D1, ops: [set([...ITEMS, 0, 'rule'], 3)], expect: ['extra_rule'] },
  { name: 'rule kind unknown', dan_no: 1, base: D1, ops: [set([...ITEMS, 0, 'rule', 'kind'], 'bonus')], expect: ['extra_rule'] },
  { name: 'points each 0', dan_no: 1, base: D1, ops: [set([...ITEMS, 0, 'rule', 'points_each'], 0)], expect: ['extra_points_each'] },
  { name: 'no steps', dan_no: 1, base: D1, ops: [set([...ITEMS, 2, 'rule', 'steps'], [])], expect: ['extra_steps_count'] },
  { name: '11 steps', dan_no: 1, base: D1, ops: [set([...ITEMS, 2, 'rule', 'steps'], Array.from({ length: 11 }, (_, i) => ({ at_least: i + 1, points: i + 1 })))], expect: ['extra_steps_count'] },
  { name: 'step: missing key', dan_no: 1, base: D1, ops: [remove([...ITEMS, 2, 'rule', 'steps', 0, 'points'])], expect: ['shape'] },
  { name: 'step: wrong type', dan_no: 1, base: D1, ops: [set([...ITEMS, 2, 'rule', 'steps', 0], null)], expect: ['shape'] },
  { name: 'step at least 0', dan_no: 1, base: D1, ops: [set([...ITEMS, 2, 'rule', 'steps', 0, 'at_least'], 0)], expect: ['extra_step_range'] },
  { name: 'step points going down', dan_no: 1, base: D1, ops: [set([...ITEMS, 2, 'rule', 'steps', 1, 'points'], 2)], expect: ['extra_steps_order'] },
  { name: 'steps of 0.05', dan_no: 1, base: D1, ops: [set([...ITEMS, 1, 'rule', 'steps'], [{ at_least: 5, points: 0.05 }, { at_least: 6, points: 0.1 }])], expect: [] },
  // V2 far over the size cap (the JS twin measures JSON.stringify, the SQL jsonb::text)
  { name: 'a Dan of 130 000 bytes', dan_no: 1, base: D1, ops: [set([...PHYS, 8, 'note'], 'x'.repeat(130000))], expect: ['too_big'] },
  { name: 'a document of 300 000 bytes', base: 'default', ops: [set(['source'], 'x'.repeat(300000))], expect: ['too_big'] },
];
// The bad characters in EVERY text field (§3.4): U+202E, U+200B, \x07, and 0024's extras.
const BAD_CHARS = [0x202e, 0x200b, 0x07, 0x061c, 0x2028, 0x2029, 0x00ad, 0x180e, 0xe0001].map((cp) => String.fromCodePoint(cp));
const TEXT_FIELDS = [
  ['part name', ['parts', 0, 'name'], 'Phys', 'part_name'],
  ['subject name', [...PHYS, 4, 'name'], 'Long jump', 'subject_name'],
  ['way name', [...PULL, 'ways', 0, 'name'], 'Pull-up', 'way_name'],
  ['extra item name', [...ITEMS, 0, 'name'], 'Extra stripes', 'extra_item_name'],
  ['unit', [...PHYS, 0, 'ways', 0, 'unit'], 'inches', 'unit'],
  ['subject note', [...PHYS, 8, 'note'], 'A note', 'note'],
  ['make-up', ['pass', 'makeup'], 'Made up later', 'makeup'],
  ['extra points note', ['extra_points', 'note'], 'For now', 'extra_note'],
];
for (const bad of BAD_CHARS) {
  const label = `U+${bad.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  for (const [field, path, text, code] of TEXT_FIELDS) {
    JS_RUBRIC_CASES.push({ name: `${label} in the ${field}`, dan_no: 1, base: D1, ops: [set(path, `${text.slice(0, 2)}${bad}${text.slice(2)}`)], expect: [code] });
  }
  JS_RUBRIC_CASES.push({ name: `${label} in the source`, base: 'default', ops: [set(['source'], `Fall${bad} 2026`)], expect: ['shape'] });
}

check(`rubric: the validator's own ${JS_RUBRIC_CASES.length} cases (one or more per problem code)`, () => {
  for (const c of JS_RUBRIC_CASES) assert.deepEqual(runCase(c), c.expect, c.name);
  // every problem code of contract §3.1 has a failing case
  const codes = ['shape', 'dan_number', 'too_big', 'part_name', 'part_name_duplicate', 'grade_points_range', 'grade_points_order', 'subject_count',
    'subject_id', 'subject_name', 'subject_name_duplicate', 'credits', 'points_range', 'points_order', 'points_not_worked_out', 'ways_count',
    'way_name', 'unit', 'direction', 'brackets_count', 'bracket_ages', 'brackets_order', 'brackets_gap', 'brackets_overlap', 'brackets_ends',
    'cutoffs_range', 'cutoffs_order', 'limited_to', 'note', 'pass_mark_range', 'pass_mark_too_high', 'makeup', 'bracket_empty', 'extra_limit',
    'extra_note', 'extra_item_count', 'extra_item_name', 'extra_item_name_duplicate', 'extra_rule', 'extra_points_each', 'extra_steps_count',
    'extra_steps_order', 'extra_step_range'];
  const covered = new Set(JS_RUBRIC_CASES.flatMap((c) => c.expect));
  assert.deepEqual(codes.filter((c) => !covered.has(c)), []);
  // problems carry where they are; never more than 100; never throws on rubbish
  const where = danProblems(applyOps(danOf(V2, 1), [set([...PHYS, 4, 'credits'], 2.5)]), 1);
  assert.deepEqual(where, [{ code: 'credits', part: 'physical', subject: subjectOf(danOf(V2, 1), 'physical', 'Long jump').id }]);
  for (const rubbish of [null, undefined, 3, 'x', [], {}, { dan: 1 }]) assert.deepEqual(problemCodes(danProblems(rubbish, 1)), ['shape']);
  const many = applyOps(danOf(V2, 1), [set([...TECH], Array.from({ length: 30 }, (_, i) => ({ ...subjectOf(danOf(V2, 1), 'technical', 'Referee seminar'), id: 'X', name: '', credits: 0, note: '', limited_to: [] }))), set(['pass', 'brackets', 0, 'pass_mark'], 0)]);
  assert.equal(danProblems(many, 1).length, 100);
  assert.equal(rubricIsValid(null), false);
});

check('rubric: the shared test cases supabase/tests/0024_rubric_cases.json (when Builder A has written it)', () => {
  let text = null;
  try {
    text = readFileSync(new URL('../../../supabase/tests/0024_rubric_cases.json', import.meta.url), 'utf8');
  } catch {
    console.log('NOTE: supabase/tests/0024_rubric_cases.json is not there yet; only this file\'s own cases ran.');
    return;
  }
  const file = JSON.parse(text);
  const cases = Array.isArray(file) ? file : file.cases;
  assert.ok(Array.isArray(cases) && cases.length > 0, 'the file has cases');
  // Dan cases list the exact problem codes ("expect"); whole-rubric cases (dan_no null) only
  // say whether the rubric is valid ("expect_valid"), as the SQL's bb_rubric_is_valid does.
  const ok = (c) => (c.dan_no == null && typeof c.expect_valid === 'boolean'
    ? (runCase(c).length === 0) === c.expect_valid
    : JSON.stringify(runCase(c)) === JSON.stringify(c.expect));
  const wrong = cases.filter((c) => !ok(c))
    .map((c) => `${c.name}: expected ${JSON.stringify(c.dan_no == null ? { valid: c.expect_valid } : c.expect)}, JS gives ${JSON.stringify(runCase(c))}`);
  assert.deepEqual(wrong, []);
});

// ----- rubric.js: the editing helpers -----

check('rubric: normalizeDan, splitBracket, removeBracket, copyFromDan, newSubjectId, stamps', () => {
  const d1 = danOf(V2, 1);
  // tidying: names collapsed, empty texts → null, worked-out points follow the credits
  const messy = applyOps(d1, [set([...PHYS, 4, 'name'], '  Long   jump '), set([...PHYS, 4, 'credits'], 3), set([...PHYS, 8, 'note'], '  '),
    set(['pass', 'makeup'], ' line one\nline two '), set([...PHYS, 0, 'ways', 0, 'name'], '  ')]);
  const tidy = normalizeDan(messy);
  assert.equal(tidy.parts[0].subjects[4].name, 'Long jump');
  assert.deepEqual(tidy.parts[0].subjects[4].points, { 'A+': 12, A: 10.5, 'B+': 9, B: 7.5, C: 6, D: 0 });
  assert.equal(tidy.parts[0].subjects[8].note, null);
  assert.equal(tidy.pass.makeup, 'line one line two');
  assert.equal(tidy.parts[0].subjects[0].ways[0].name, null);
  assert.deepEqual(danProblems(tidy, 1), []);
  assert.equal(messy.parts[0].subjects[4].name, '  Long   jump '); // the input is never changed
  // own points are never recomputed
  assert.deepEqual(normalizeDan(applyOps(d1, [set([...OTHER, 0, 'credits'], 6)])).parts[3].subjects[0].points, subjectOf(d1, 'other', 'Egg test').points);
  // split 2nd Dan's one bracket at 18: both halves keep the pass mark
  const split2 = splitBracket(danOf(V2, 2), 0, 18);
  assert.deepEqual(split2.pass.brackets, [{ from: null, to: 17, pass_mark: 261 }, { from: 18, to: null, pass_mark: 261 }]);
  assert.deepEqual(danProblems(split2, 2), []);
  // split 1st Dan's 18 and over at 30: One Step Sparring is limited to both halves
  const split1 = splitBracket(d1, 1, 30);
  assert.deepEqual(split1.pass.brackets.map((b) => [b.from, b.to, b.pass_mark]), [[null, 17, 275], [18, 29, 293], [30, null, 293]]);
  assert.deepEqual(subjectOf(split1, 'curriculum', 'One Step Sparring (1-24)').limited_to, [{ from: 18, to: 29 }, { from: 30, to: null }]);
  assert.deepEqual(danProblems(split1, 1), []);
  assert.equal(splitBracket(d1, 1, 18), null); // 18 isn't inside 18 and over (nothing below it)
  assert.equal(splitBracket(d1, 0, 18), null);
  assert.equal(splitBracket(d1, 5, 10), null);
  // remove 1st Dan's 18 and over: 17 and under takes it over → All ages; One Step counts for everyone
  const merged = removeBracket(d1, 1);
  assert.deepEqual(merged.pass.brackets, [{ from: null, to: null, pass_mark: 275 }]);
  assert.equal(subjectOf(merged, 'curriculum', 'One Step Sparring (1-24)').limited_to, null);
  assert.deepEqual(danProblems(merged, 1), []);
  assert.equal(removeBracket(danOf(V2, 2), 0), null); // the last bracket can't go
  const back = removeBracket(split1, 2); // 18–29 takes over 30 and over → 18 and over again
  assert.deepEqual(back.pass.brackets, d1.pass.brackets);
  assert.deepEqual(subjectOf(back, 'curriculum', 'One Step Sparring (1-24)').limited_to, [{ from: 18, to: null }]);
  assert.deepEqual(splitBrackets([{ from: null, to: null, cutoffs: { x: 1 } }], 0, 13), [{ from: null, to: 12, cutoffs: { x: 1 } }, { from: 13, to: null, cutoffs: { x: 1 } }]);
  // copy from another Dan: renumbered, ids kept, the target's rev kept
  const target = { ...danOf(V2, 2), rev: 7 };
  const copy = copyFromDan(d1, 2, target);
  assert.equal(copy.dan, 2);
  assert.equal(copy.rev, 7);
  assert.deepEqual(copy.parts.map((p) => p.subjects.map((s) => s.id)), d1.parts.map((p) => p.subjects.map((s) => s.id)));
  assert.deepEqual(danProblems(copy, 2), []);
  assert.equal(d1.dan, 1); // the source is never changed
  // a new subject id: 8 characters a–z 0–9, not used in the Dan
  const used = new Set(d1.parts.flatMap((p) => p.subjects.map((s) => s.id)));
  for (let i = 0; i < 50; i += 1) {
    const id = newSubjectId(d1);
    assert.match(id, /^[a-z0-9]{8}$/);
    assert.ok(!used.has(id));
  }
  // stamps: stripped for the comparison; same content whatever the stamps and key order
  assert.deepEqual(stripStamps({ ...d1, rev: 9, saved_at: '2026-10-21T10:00:00Z', saved_by_name: 'Sam P.' }, 3), { ...d1, rev: 3 });
  const reordered = Object.fromEntries(Object.entries(d1).reverse());
  assert.equal(sameDanContent({ ...reordered, rev: 4, saved_by_name: 'X' }, d1), true);
  assert.equal(sameDanContent(tidy, d1), false);
  assert.deepEqual(putDan(V2, 2, copy).dans[1], copy);
  assert.deepEqual(freshCopy(V2).source, 'Default rubric');
});

check('rubric: danDiff — the change lines (R11)', () => {
  const d1 = danOf(V2, 1);
  assert.deepEqual(danDiff(d1, { ...d1, rev: 5, saved_by_name: 'Sam P.' }), []); // stamps don't count
  const longJump = subjectOf(d1, 'physical', 'Long jump');
  const edited = normalizeDan(applyOps(d1, [set([...PHYS, 4, 'credits'], 3)]));
  assert.deepEqual(danDiff(d1, edited), ['Long jump credits 2 → 3']);
  const more = applyOps(edited, [
    set(['pass', 'brackets', 0, 'pass_mark'], 280),
    remove([...TECH, 0]),
    set([...OTHER, 0, 'points', 'B'], 12),
    set(['extra_points', 'limit'], 20),
  ]);
  more.parts[1].subjects.push({ ...subjectOf(d1, 'technical', 'Korean terminology'), id: 'newsubj1', name: 'Poomsae theory' });
  const lines = danDiff(edited, more);
  assert.ok(lines.includes('To pass (17 and under) 275 → 280'), lines.join(' | '));
  assert.ok(lines.includes('Removed Referee seminar (Technical)'));
  assert.ok(lines.includes('Added Poomsae theory (Technical)'));
  assert.ok(lines.includes('Egg test points B 11 → 12'));
  assert.ok(lines.includes('Extra points limit — → 20'));
  assert.equal(lines.length, 5);
  // a reorder is one line
  const moved = applyOps(d1, [set([...PHYS, 4], subjectOf(d1, 'physical', 'Static jump')), set([...PHYS, 3], longJump)]);
  assert.deepEqual(danDiff(d1, moved), ['Physical subjects reordered']);
});

check('rubric: rubricPublic — the allow-list (no revs, stamps, source or unknown keys)', () => {
  const stamped = putDan(V2, 1, { ...danOf(V2, 1), rev: 3, saved_at: '2026-10-21T10:00:00Z', saved_by_name: 'Jeffrey Berg', secret: 'x' });
  stamped.dans[0].parts[0].subjects[0].hidden = 'y';
  stamped.extra = 'z';
  const pub = rubricPublic(stamped);
  const text = JSON.stringify(pub);
  for (const word of ['"rev"', '"saved_at"', '"saved_by_name"', '"source"', 'secret', 'hidden', '"extra"', 'Jeffrey']) assert.ok(!text.includes(word), word);
  assert.deepEqual(Object.keys(pub), ['schema_version', 'dans']);
  assert.deepEqual(Object.keys(pub.dans[0]).sort(), ['dan', 'extra_points', 'parts', 'pass']);
  // everything the form draws is there, unchanged
  assert.equal(subjectOf(pub.dans[3], 'technical', 'Target kick (30 sec)').points.B, 9);
  assert.deepEqual(pub.dans[0].pass, danOf(V2, 1).pass);
  assert.deepEqual(pub.dans[0].parts, danOf(V2, 1).parts.map((p) => ({ ...p, subjects: p.subjects.map((s) => ({ ...s })) })));
  assert.deepEqual(pub.dans[3].extra_points, danOf(V2, 4).extra_points);
  assert.equal(rubricPublic(null), null);
});

check('rules: canOpenRegistration — the first opening is admin-only (v0.930)', () => {
  const never = { firstOpenedAt: null, autoClose: true, applicationDue: '2027-03-27' };
  const opened = { firstOpenedAt: '2027-02-01T15:00:00.000Z', autoClose: true, applicationDue: '2027-03-27' };
  assert.deepEqual(canOpenRegistration(never, true, '2027-02-15'), { allowed: true, reason: null });
  assert.deepEqual(canOpenRegistration(never, false, '2027-02-15'), { allowed: false, reason: 'firstOpenNeedsAdmin' });
  assert.deepEqual(canOpenRegistration(opened, false, '2027-02-15'), { allowed: true, reason: null });
  assert.deepEqual(canOpenRegistration(opened, false, '2027-03-28'), { allowed: false, reason: 'reopenNeedsAdmin' });
  assert.deepEqual(canOpenRegistration({ ...opened, autoClose: false }, false, '2027-03-28'), { allowed: true, reason: null });
  assert.deepEqual(canOpenRegistration(opened, true, '2027-03-28'), { allowed: true, reason: null });
  assert.deepEqual(canOpenRegistration({ first_opened_at: null }, false), { allowed: false, reason: 'firstOpenNeedsAdmin' }); // a stored row
});

// ----- the preview database: the rubric functions (contract 0024 §6–§7, U1–U12) -----

const ADMIN2 = { ...ADMIN, actorName: 'Sam P.', userId: 'u3' };
const defaultDan = (n = 1) => db().bb_default_rubric[0].sheet.dans[n - 1];
const saveDefault = (sheet, rev, ctx = ADMIN, dan = sheet?.dan ?? 1) => call('bb_save_default_dan', { p_dan: dan, p_expected_rev: rev, p_sheet: sheet }, ctx);
const undoDefault = (rev, ctx = ADMIN, dan = 1) => call('bb_undo_default_dan', { p_dan: dan, p_expected_rev: rev }, ctx);
const withCredits = (dan, credits) => normalizeDan(applyOps(dan, [set([...PHYS, 4, 'credits'], credits)]));
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

check('store: rubric tables and who may call the rubric functions (U1, U1b)', () => {
  backend.reset();
  setDay('2027-02-15');
  const sel = (table, cols, ctx = ADMIN) => backend.select(table, cols, [], [], ctx);
  const row = sel('bb_default_rubric', 'id, sheet, version, updated_at, updated_by_name');
  assert.equal(row.error, null);
  assert.equal(row.data.length, 1);
  assert.deepEqual(row.data[0].sheet, DEFAULT_RUBRIC);
  assert.equal(row.data[0].version, 1);
  assert.equal(sel('bb_default_rubric', 'id, sheet', STAFF).data.length, 1); // staff read it too
  assert.deepEqual(sel('bb_default_rubric', 'id', LOCKED).data, []); // row-level security
  for (const col of ['*', 'singleton', 'created_by', 'updated_by']) assert.equal(sel('bb_default_rubric', col).error.code, '42501', col);
  for (const col of ['*', 'id', 'previous', 'saved_by']) assert.equal(sel('bb_rubric_undo', col).error.code, '42501', col);
  const cycleId = randomUUID();
  const calls = {
    bb_save_default_dan: { p_dan: 1, p_expected_rev: 1, p_sheet: defaultDan() },
    bb_undo_default_dan: { p_dan: 1, p_expected_rev: 1 },
    bb_save_cycle_dan: { p_cycle_id: cycleId, p_dan: 1, p_expected_rev: 1, p_sheet: defaultDan() },
    bb_undo_cycle_dan: { p_cycle_id: cycleId, p_dan: 1, p_expected_rev: 1 },
    bb_undo_first_open: { p_cycle_id: cycleId, p_expected_version: 1 },
  };
  for (const [name, args] of Object.entries(calls)) {
    assert.deepEqual(call(name, args, LOCKED), { status: 'no_access' }, name);
    assert.deepEqual(call(name, args, STAFF), { status: 'not_allowed' }, name);
    assert.ok(BB_WRITE_RPC_NAMES.includes(name) && BB_RPC_NAMES.includes(name), name);
    assert.equal(backend.rpc(name, args, ADMIN, { get: true }).error.code, '25006', name); // writes: never a GET
  }
  // rubbish from a locked or staff sign-in: still no_access / not_allowed (role before input)
  assert.deepEqual(call('bb_save_default_dan', { p_dan: 9, p_expected_rev: null, p_sheet: 'x' }, LOCKED), { status: 'no_access' });
  assert.deepEqual(call('bb_save_default_dan', { p_dan: 9, p_expected_rev: null, p_sheet: 'x' }, STAFF), { status: 'not_allowed' });
  for (const name of ['bb_rubric_dan_problems', 'bb_rubric_is_valid', 'bb_rubric_public', 'bb_rubric_from_v1', 'bb_default_rubric_guard']) {
    assert.equal(backend.rpc(name, {}, ADMIN).error.code, '42501', name);
  }
  assert.equal(backend.rpc('bb_save_default_dan', { p_dan: 1, p_expected_rev: 1 }, ADMIN).error.code, 'PGRST202'); // a missing argument
  assert.equal(JSON.stringify(db().bb_rubric_undo), '[]'); // nothing written
});

check('store: save / undo a Dan of the default rubric (U4, U12)', () => {
  backend.reset();
  setDay('2027-02-15');
  // arguments → invalid (expected rev checked before anything adds 1 to it)
  for (const [label, args] of Object.entries({
    'rev 0': { p_dan: 1, p_expected_rev: 0, p_sheet: defaultDan() },
    'rev 1 000 001': { p_dan: 1, p_expected_rev: 1000001, p_sheet: defaultDan() },
    'rev null': { p_dan: 1, p_expected_rev: null, p_sheet: defaultDan() },
    'Dan 5': { p_dan: 5, p_expected_rev: 1, p_sheet: { ...defaultDan(), dan: 5 } },
    'Dan null': { p_dan: null, p_expected_rev: 1, p_sheet: defaultDan() },
    'sheet text': { p_dan: 1, p_expected_rev: 1, p_sheet: 'x' },
    'sheet null': { p_dan: 1, p_expected_rev: 1, p_sheet: null },
    'sheet of another Dan': { p_dan: 1, p_expected_rev: 1, p_sheet: defaultDan(2) },
  })) assert.deepEqual(call('bb_save_default_dan', args), { status: 'invalid' }, label);
  // the validator: problems, nothing written
  const bad = call('bb_save_default_dan', { p_dan: 1, p_expected_rev: 1, p_sheet: applyOps(defaultDan(), [set([...PHYS, 4, 'credits'], 2.5)]) });
  assert.deepEqual(bad, { status: 'invalid', problems: [{ code: 'credits', part: 'physical', subject: subjectOf(defaultDan(), 'physical', 'Long jump').id }] });
  assert.deepEqual(problemCodes(call('bb_save_default_dan', { p_dan: 1, p_expected_rev: 1, p_sheet: applyOps(defaultDan(), [set([...PHYS, 4, 'credits'], 1e30)]) }).problems), ['credits']);
  assert.equal(db().bb_default_rubric[0].version, 1);
  // a good save: rev + 1, stamps, the row's version + 1, the other Dans untouched, one undo slot
  const sent = { ...withCredits(defaultDan(), 3), rev: 99, saved_at: '2020-01-01T00:00:00Z', saved_by_name: 'Somebody' }; // stamps sent are ignored
  const ok1 = saveDefault(sent, 1);
  assert.deepEqual(Object.keys(ok1).sort(), ['changed', 'previous_rev', 'rev', 'saved_at', 'saved_by_name', 'status', 'undo_available']);
  assert.equal(ok1.status, 'ok');
  assert.equal(ok1.rev, 2);
  assert.equal(ok1.changed, true);
  assert.equal(ok1.undo_available, true);
  assert.equal(ok1.previous_rev, 1);
  assert.equal(ok1.saved_by_name, 'Jeffrey Berg');
  assert.match(ok1.saved_at, STAMP);
  let s = db();
  assert.equal(s.bb_default_rubric[0].version, 2);
  assert.equal(s.bb_default_rubric[0].updated_by_name, 'Jeffrey Berg');
  assert.deepEqual({ ...s.bb_default_rubric[0].sheet.dans[0], saved_at: null }, { ...withCredits(DEFAULT_RUBRIC.dans[0], 3), rev: 2, saved_by_name: 'Jeffrey Berg' });
  assert.deepEqual(s.bb_default_rubric[0].sheet.dans.slice(1), DEFAULT_RUBRIC.dans.slice(1));
  assert.equal(s.bb_default_rubric[0].sheet.source, DEFAULT_RUBRIC.source);
  assert.deepEqual(s.bb_rubric_undo.map((x) => [x.kind, x.cycle_id, x.dan, x.after_version, x.saved_by]), [['default_dan', null, 1, 2, 'u1']]);
  assert.deepEqual(s.bb_rubric_undo[0].previous, DEFAULT_RUBRIC.dans[0]);
  // the same content again → changed false, nothing written, and the earlier Undo is gone
  const same = saveDefault(withCredits(defaultDan(), 3), 2);
  assert.deepEqual({ ...same, saved_at: null }, { status: 'ok', rev: 2, saved_at: null, saved_by_name: 'Jeffrey Berg', changed: false, undo_available: false, previous_rev: null });
  assert.equal(db().bb_default_rubric[0].version, 2);
  assert.deepEqual(undoDefault(2), { status: 'stale' });
  // an old rev → stale; two saves with the same rev → the second stale (U12)
  assert.deepEqual(saveDefault(withCredits(defaultDan(), 4), 1), { status: 'stale' });
  assert.equal(saveDefault(withCredits(defaultDan(), 4), 2).rev, 3);
  assert.deepEqual(saveDefault(withCredits(defaultDan(), 5), 2), { status: 'stale' });
  // Undo by another admin → stale; by the saver → the rev-2 content back, as rev 4
  assert.deepEqual(undoDefault(3, ADMIN2), { status: 'stale' });
  const undone = undoDefault(3);
  assert.equal(undone.status, 'ok');
  assert.equal(undone.rev, 4);
  assert.deepEqual(Object.keys(undone).sort(), ['rev', 'saved_at', 'saved_by_name', 'status']);
  assert.equal(subjectOf(defaultDan(), 'physical', 'Long jump').credits, 3);
  assert.equal(defaultDan().rev, 4);
  assert.deepEqual(undoDefault(4), { status: 'stale' }); // undo twice
  assert.deepEqual(db().bb_rubric_undo, []);
  // save after an undo with the old rev → stale (U12)
  assert.deepEqual(saveDefault(withCredits(defaultDan(), 6), 3), { status: 'stale' });
  // undo after another admin's save → stale
  assert.equal(saveDefault(withCredits(defaultDan(), 2), 4).rev, 5);
  assert.equal(saveDefault(applyOps(defaultDan(), [set(['pass', 'brackets', 0, 'pass_mark'], 280)]), 5, ADMIN2).rev, 6);
  assert.deepEqual(undoDefault(6), { status: 'stale' });
  // the 15-second window: 14 s → ok; 16 s → stale
  assert.equal(saveDefault(withCredits(defaultDan(), 3), 6).rev, 7);
  advance(14 * 1000);
  assert.equal(undoDefault(7).status, 'ok');
  assert.equal(saveDefault(withCredits(defaultDan(), 4), 8).rev, 9);
  advance(16 * 1000);
  assert.deepEqual(undoDefault(9), { status: 'stale' });
  // another Dan has its own rev and its own slot
  const dan4 = saveDefault(applyOps(defaultDan(4), [set(['extra_points', 'note'], null)]), 1, ADMIN, 4);
  assert.equal(dan4.rev, 2);
  assert.equal(undoDefault(2, ADMIN, 4).status, 'ok');
  assert.equal(defaultDan(4).extra_points.note, '4th Dan uses the 3rd Dan numbers for now');
  // the "saved by" stamp: a long name is cut to 60 characters; an odd one → null
  const long = saveDefault(withCredits(defaultDan(), 5), defaultDan().rev, { ...ADMIN, actorName: 'A'.repeat(70) });
  assert.equal(long.saved_by_name, 'A'.repeat(60));
  const odd = saveDefault(withCredits(defaultDan(), 6), defaultDan().rev, { ...ADMIN, actorName: `Jeff${String.fromCodePoint(7)}rey` });
  assert.equal(odd.status, 'ok');
  assert.equal(odd.saved_by_name, null);
  assert.deepEqual(danProblems(defaultDan(), 1), []);
  // the stored default is always a valid whole document
  assert.equal(rubricIsValid(db().bb_default_rubric[0].sheet), true);
  setDay('2027-02-15');
});

check('store: a cycle\'s copy — editable until registration first opens, then locked (U5, U7)', () => {
  backend.reset();
  setDay('2027-02-15');
  // a default save first: Add cycle copies the NEW numbers
  assert.equal(saveDefault(withCredits(defaultDan(), 3), 1).rev, 2);
  const { id } = call('bb_add_cycle', addArgs());
  let cycle = db().bb_cycles.find((c) => c.id === id);
  assert.equal(cycle.registration_open, false); // always closed (v0.933)
  assert.deepEqual(cycle.requirements, freshCopy(db().bb_default_rubric[0].sheet));
  assert.equal(cycle.requirements.source, 'Default rubric');
  assert.ok(cycle.requirements.dans.every((d) => d.rev === 1 && d.saved_at === null && d.saved_by_name === null));
  assert.equal(subjectOf(cycle.requirements.dans[0], 'physical', 'Long jump').credits, 3);
  const cdan = (n = 1) => db().bb_cycles.find((c) => c.id === id).requirements.dans[n - 1];
  const saveC = (sheet, rev, ctx = ADMIN, cycleId = id) => call('bb_save_cycle_dan', { p_cycle_id: cycleId, p_dan: sheet.dan, p_expected_rev: rev, p_sheet: sheet }, ctx);
  const undoC = (rev, ctx = ADMIN, dan = 1) => call('bb_undo_cycle_dan', { p_cycle_id: id, p_dan: dan, p_expected_rev: rev }, ctx);
  assert.deepEqual(call('bb_save_cycle_dan', { p_cycle_id: null, p_dan: 1, p_expected_rev: 1, p_sheet: cdan() }), { status: 'invalid' });
  assert.deepEqual(saveC(cdan(), 1, ADMIN, randomUUID()), { status: 'not_found' });
  assert.equal(saveC(withCredits(cdan(), 4), 1, ADMIN, randomUUID()).status, 'not_found');
  // a save on a never-opened cycle: ok, and the cycle's version (Edit cycle) doesn't move
  const before = db().bb_cycles.find((c) => c.id === id);
  const saved1 = saveC(withCredits(cdan(), 4), 1);
  assert.equal(saved1.rev, 2);
  assert.equal(saved1.undo_available, true);
  cycle = db().bb_cycles.find((c) => c.id === id);
  assert.equal(cycle.version, before.version);
  assert.equal(cycle.updated_at, before.updated_at);
  assert.deepEqual(db().bb_rubric_undo.filter((x) => x.cycle_id !== null).map((x) => [x.kind, x.cycle_id, x.dan]), [['cycle_dan', id, 1]]);
  assert.equal(undoC(2).rev, 3);
  assert.equal(subjectOf(cdan(), 'physical', 'Long jump').credits, 3);
  assert.equal(saveC(withCredits(cdan(), 5), 3).rev, 4);
  // a later default save never touches an existing cycle (v0.921)
  const copyBefore = JSON.stringify(db().bb_cycles.find((c) => c.id === id).requirements);
  assert.equal(saveDefault(withCredits(defaultDan(), 6), 2).rev, 3);
  assert.equal(JSON.stringify(db().bb_cycles.find((c) => c.id === id).requirements), copyBefore);
  // first opening (an admin, with the school's waiver) → locked
  const current = db().bb_waiver_versions[0];
  call('bb_save_waiver', { p_expected_current_id: current.id, p_body: 'The school waiver.' });
  const opened = call('bb_set_registration', { p_cycle_id: id, p_expected_version: 1, p_open: true });
  assert.equal(opened.first_open, true);
  const at = db().bb_cycles.find((c) => c.id === id).first_opened_at;
  assert.deepEqual(saveC(withCredits(cdan(), 6), 4), { status: 'locked', first_opened_at: at });
  assert.deepEqual(saveC(withCredits(cdan(), 6), 1), { status: 'locked', first_opened_at: at }); // locked wins over stale
  assert.deepEqual(undoC(4), { status: 'locked', first_opened_at: at });
  // closing later doesn't unlock it (v0.929)
  assert.equal(call('bb_set_registration', { p_cycle_id: id, p_expected_version: 2, p_open: false }, STAFF).status, 'ok');
  assert.equal(saveC(withCredits(cdan(), 6), 4).status, 'locked');
  // Delete cycle takes its undo slots with it
  const two = call('bb_add_cycle', addArgs({ ...goodForm(), name: 'Two' }));
  const twoDan = db().bb_cycles.find((c) => c.id === two.id).requirements.dans[0];
  assert.equal(saveC(withCredits(twoDan, 4), 1, ADMIN, two.id).rev, 2);
  assert.ok(db().bb_rubric_undo.some((x) => x.cycle_id === two.id));
  assert.equal(call('bb_delete_cycle', { p_cycle_id: two.id, p_expected_version: 1, p_expected_candidate_count: 0 }).status, 'ok');
  assert.ok(!db().bb_rubric_undo.some((x) => x.cycle_id === two.id));
});

check('store: first opening admin-only, its Undo, has_registrations (U6)', () => {
  backend.reset();
  setDay('2027-02-15');
  const current = db().bb_waiver_versions[0];
  call('bb_save_waiver', { p_expected_current_id: current.id, p_body: 'The school waiver.' });
  const add = (name) => call('bb_add_cycle', addArgs({ ...goodForm(), name })).id;
  const row = (id) => db().bb_cycles.find((c) => c.id === id);
  const sw = (id, open, ctx = ADMIN) => call('bb_set_registration', { p_cycle_id: id, p_expected_version: row(id).version, p_open: open }, ctx);
  const undoOpen = (id, ctx = ADMIN, version = row(id).version) => call('bb_undo_first_open', { p_cycle_id: id, p_expected_version: version }, ctx);
  const a = add('A');
  // staff first opening → not_allowed, nothing written
  assert.deepEqual(sw(a, true, STAFF), { status: 'not_allowed' });
  assert.equal(row(a).version, 1);
  assert.deepEqual(db().bb_rubric_undo, []);
  // an admin's first opening → first_open, the slot remembers the cycle as it was
  const opened = sw(a, true);
  assert.equal(opened.first_open, true);
  assert.equal(opened.version, 2);
  assert.deepEqual(db().bb_rubric_undo.map((x) => [x.kind, x.cycle_id, x.dan, x.after_version, x.saved_by]), [['first_open', a, null, 2, 'u1']]);
  assert.deepEqual(db().bb_rubric_undo[0].previous, { registration_open: false, first_opened_at: null, auto_close: true });
  // staff may close and reopen once an admin opened it (later openings are not first openings)
  assert.equal(sw(a, false, STAFF).first_open, false);
  const reopened = sw(a, true, STAFF);
  assert.equal(reopened.status, 'ok');
  assert.equal(reopened.first_open, false);
  assert.deepEqual(db().bb_rubric_undo, []); // the close cleared the first-opening slot
  assert.deepEqual(undoOpen(a), { status: 'stale' });
  // Undo within 15 seconds → never opened again, the rubric editable again
  const b = add('B');
  sw(b, true);
  advance(14 * 1000);
  const back = undoOpen(b);
  assert.equal(back.status, 'ok');
  assert.equal(back.version, 3);
  assert.equal(back.state.registration, 'not_open_yet');
  assert.equal(back.state.state, 'not_open_yet');
  assert.equal(row(b).first_opened_at, null);
  assert.equal(row(b).registration_open, false);
  assert.deepEqual(db().bb_rubric_undo, []);
  const bDan = row(b).requirements.dans[0];
  assert.equal(call('bb_save_cycle_dan', { p_cycle_id: b, p_dan: 1, p_expected_rev: 1, p_sheet: withCredits(bDan, 4) }).status, 'ok');
  // the public form shows no rubric again
  assert.equal(backend.publicCycle(row(b).public_code_worcester).cycle.requirements, null);
  // stale: another admin, a wrong version, too late (16 s), already closed
  const c = add('C');
  sw(c, true);
  assert.deepEqual(undoOpen(c, ADMIN2), { status: 'stale' });
  assert.deepEqual(undoOpen(c, ADMIN, 1), { status: 'stale' });
  advance(16 * 1000);
  assert.deepEqual(undoOpen(c), { status: 'stale' });
  assert.ok(row(c).first_opened_at);
  const d = add('D');
  sw(d, true);
  backend.expireUndo(); // the console helper: the newest slot looks 16 seconds old
  assert.deepEqual(undoOpen(d), { status: 'stale' });
  // a first opening after Application due turned the automatic close off: Undo puts it back on
  const e = add('E');
  setDay('2027-03-28');
  const late = sw(e, true);
  assert.equal(late.first_open, true);
  assert.equal(row(e).auto_close, false);
  assert.equal(undoOpen(e).status, 'ok');
  assert.equal(row(e).auto_close, true);
  setDay('2027-02-15');
  // has_registrations: a family registered through the form since it opened
  const f = add('F');
  sw(f, true);
  const plan = db().bb_cycle_plans.find((p) => p.cycle_id === f).id;
  assert.equal(backend.publicRegister(regInput(row(f).public_code_worcester, plan)).status, 'ok');
  assert.deepEqual(undoOpen(f), { status: 'has_registrations' });
  assert.ok(row(f).first_opened_at); // the lock stays
  // … even when that family's candidate was deleted again (change_log still has the insert)
  const g = add('G');
  sw(g, true);
  const planG = db().bb_cycle_plans.find((p) => p.cycle_id === g).id;
  assert.equal(backend.publicRegister(regInput(row(g).public_code_shrewsbury, planG)).status, 'ok');
  const cand = db().bb_candidates.find((x) => x.cycle_id === g);
  assert.equal(call('bb_delete_candidate', { p_candidate_id: cand.id, p_expected_version: cand.version }).status, 'ok');
  assert.equal(db().bb_candidates.filter((x) => x.cycle_id === g).length, 0);
  assert.deepEqual(undoOpen(g), { status: 'has_registrations' });
  assert.deepEqual(call('bb_undo_first_open', { p_cycle_id: null, p_expected_version: 1 }), { status: 'invalid' });
  assert.deepEqual(call('bb_undo_first_open', { p_cycle_id: randomUUID(), p_expected_version: 1 }), { status: 'not_found' });
});

check('store: the public form sees the rubric only once registration opened, as the public view (U8)', () => {
  backend.reset();
  setDay('2027-02-15');
  const current = db().bb_waiver_versions[0];
  call('bb_save_waiver', { p_expected_current_id: current.id, p_body: 'The school waiver.' });
  const { id } = call('bb_add_cycle', addArgs());
  const row = () => db().bb_cycles.find((c) => c.id === id);
  const pub = () => backend.publicCycle(row().public_code_worcester);
  assert.equal(pub().state, 'not_open');
  assert.equal(pub().cycle.requirements, null); // a never-opened cycle's rubric is a draft
  // a Past, never-opened cycle ('finished') → still null
  setDay('2027-06-06');
  assert.equal(pub().state, 'finished');
  assert.equal(pub().cycle.requirements, null);
  setDay('2027-02-15');
  call('bb_set_registration', { p_cycle_id: id, p_expected_version: 1, p_open: true });
  const shown = pub().cycle.requirements;
  assert.deepEqual(shown, rubricPublic(row().requirements));
  const text = JSON.stringify(shown);
  for (const word of ['"rev"', '"saved_at"', '"saved_by_name"', '"source"']) assert.ok(!text.includes(word), word);
  assert.equal(subjectOf(shown.dans[3], 'technical', 'Target kick (30 sec)').points.B, 9);
  // an unknown key planted in the stored copy never reaches the public (allow-list)
  const s = db();
  s.bb_cycles.find((c) => c.id === id).requirements.dans[0].secret = 'planted';
  saved = s;
  assert.ok(!JSON.stringify(pub()).includes('planted'));
  // the sample: Spring 2027 (opened) shows its rubric, Fall 2027 (never opened) doesn't
  backend.loadSample();
  const spring = db().bb_cycles.find((c) => c.name === 'Spring 2027');
  const fall = db().bb_cycles.find((c) => c.name === 'Fall 2027');
  assert.equal(backend.publicCycle(spring.public_code_worcester).cycle.requirements.dans.length, 4);
  assert.equal(backend.publicCycle(fall.public_code_worcester).cycle.requirements, null);
  assert.deepEqual(spring.requirements, freshCopy(DEFAULT_RUBRIC));
});

check('store: console helpers for the rubric — other admin, expire undo, failNextSave, old store', () => {
  backend.loadSample();
  setDay('2027-02-15');
  const spring = () => db().bb_cycles.find((c) => c.name === 'Spring 2027');
  const fall = () => db().bb_cycles.find((c) => c.name === 'Fall 2027');
  // my save, then "Sam P." saves 1st Dan of the default and of every never-opened cycle
  assert.equal(saveDefault(applyOps(defaultDan(), [set(['pass', 'brackets', 0, 'pass_mark'], 280)]), 1).rev, 2);
  const fallBefore = fall().requirements.dans[0];
  const springBefore = JSON.stringify(spring().requirements);
  backend.simulateOtherAdminEdit();
  assert.equal(defaultDan().rev, 3);
  assert.equal(defaultDan().saved_by_name, 'Sam P.');
  assert.equal(subjectOf(defaultDan(), 'physical', 'Long jump').credits, 3);
  assert.deepEqual(danDiff(DEFAULT_RUBRIC.dans[0], applyOps(defaultDan(), [set(['pass', 'brackets', 0, 'pass_mark'], 275)])), ['Long jump credits 2 → 3']);
  assert.deepEqual(undoDefault(2), { status: 'stale' }); // my Undo is out of date
  assert.deepEqual(saveDefault(defaultDan(), 2), { status: 'stale' }); // so is my open editor
  assert.equal(fall().requirements.dans[0].rev, fallBefore.rev + 1);
  assert.equal(fall().requirements.dans[0].saved_by_name, 'Sam P.');
  assert.equal(JSON.stringify(spring().requirements), springBefore); // an opened cycle is locked
  assert.deepEqual(danProblems(defaultDan(), 1), []);
  // expireUndo: my newest slot is 16 seconds old → stale
  advance(1000); // so my slot is the newest one
  assert.equal(saveDefault(withCredits(defaultDan(), 4), 3).rev, 4);
  backend.expireUndo();
  assert.deepEqual(undoDefault(4), { status: 'stale' });
  // failNextSave covers the rubric saves: nothing changes
  backend.failNextSave();
  const dropped = backend.rpc('bb_save_default_dan', { p_dan: 1, p_expected_rev: 4, p_sheet: withCredits(defaultDan(), 5) }, ADMIN);
  assert.equal(dropped.data, null);
  assert.match(dropped.error.message, /Failed to fetch/);
  assert.equal(defaultDan().rev, 4);
  // a preview store from before 0024 (schema 'bb-1', v1 sheets): upgraded on read
  const old = db();
  old.schema = 'bb-1';
  delete old.bb_default_rubric;
  delete old.bb_rubric_undo;
  delete old.bb_register_log;
  for (const c of old.bb_cycles) c.requirements = JSON.parse(JSON.stringify(STARTING_POINT_REQUIREMENTS));
  saved = old;
  const up = db();
  assert.equal(up.schema, 'bb-2');
  assert.deepEqual(up.bb_default_rubric[0].sheet, DEFAULT_RUBRIC);
  assert.deepEqual(up.bb_rubric_undo, []);
  assert.equal(up.bb_register_log.length, 6); // the sample's six form registrations
  for (const c of up.bb_cycles) {
    assert.deepEqual(c.requirements, rubricFromV1(STARTING_POINT_REQUIREMENTS)); // source "Fall 2026 (old Sheet)"
    assert.equal(c.version, old.bb_cycles.find((x) => x.id === c.id).version); // no version bump
  }
  assert.equal(up.bb_candidates.length, 6); // nothing else lost
  // a store we can't upgrade → the seed
  const broken = db();
  broken.bb_cycles[0].requirements = { schema_version: 1, dans: [] };
  saved = { ...broken, schema: 'bb-1' };
  assert.equal(db().bb_cycles.length, 0);
});

// =====================================================================================
// ======================= Grading and results (migration 0025, contract 0025 §13) =======================
// =====================================================================================
// grading.js (the JS twin of bb_grade_result and friends) against the shared fixture
// supabase/tests/0025_grading_cases.json — the SAME cases PGlite runs through the SQL — plus the
// helpers, resultEmail.js, and the preview store's new functions (mockGrading.js): one check per
// new status (kept, already_added, choice_needed, not_finished, no_email, has_grades), the
// privacy of every read, Q-G1, S2, Q-G3, Q-G4, the purge's kept age, and the cast sample.

const GRADING_CASES_URL = new URL('../../../supabase/tests/0025_grading_cases.json', import.meta.url);
const CAST_URL = new URL('../../../docs/Testing/Black Belt Testing/TKD-BlackBelt-Mockup-Cast.json', import.meta.url);
const CAST = JSON.parse(readFileSync(CAST_URL, 'utf8'));

// A fixture Dan: the default rubric's Dan n with the ops applied (the 0024 runner's applyOps).
function caseDan(base, ops) {
  const [, n] = /^default:([1-4])$/.exec(base) ?? [];
  assert.ok(n, `a fixture base: ${base}`);
  return applyOps(DEFAULT_RUBRIC.dans[Number(n) - 1], ops ?? []);
}
// Names → ids in a Dan (subjects by part + name; items stay names).
function caseInput(c, dan) {
  const subjects = danSubjects(dan);
  const idOf = (name, part = null) => {
    const found = subjects.find((s) => s.subject.name === name && (part === null || s.part === part));
    assert.ok(found, `${c.name ?? ''}: no subject "${name}"${part ? ` in ${part}` : ''}`);
    return found.subject.id;
  };
  return {
    grades: (c.grades ?? []).map((g) => ({
      subject_id: idOf(g.subject, g.part), letter: g.letter ?? null, measured: g.measured ?? null, way: g.way ?? null,
      kept: g.kept === true, kept_from_cycle_name: g.kept_from_cycle_name ?? null,
    })),
    counts: (c.counts ?? []).map((x) => ({ item_name: x.item, count: x.count, kept: x.kept === true })),
    retest: (c.retest ?? []).map((name) => idOf(name)),
    chosen: (c.chosen ?? []).map((name) => idOf(name)),
    idOf,
  };
}
function runResultCase(c) {
  const dan = caseDan(c.base, c.ops);
  const input = caseInput(c, dan);
  return { dan, input, answer: gradeResult(dan, c.age, input.grades, input.counts, input.retest, input.chosen, c.today, c.submissions_due) };
}
// Compares one answer with a case's expect (every key expect names).
function compareResult(c, dan, input, r) {
  const e = c.expect;
  const names = (ids) => subjectNames(dan, ids);
  const label = (k) => `${c.name}: ${k}`;
  for (const k of ['status', 'reasons', 'complete', 'total', 'maximum', 'pass_mark', 'pass_bracket', 'age_group', 'choice_needed', 'counts']) {
    if (k in e) assert.deepEqual(r[k], e[k], label(k));
  }
  if ('parts' in e) assert.deepEqual(Object.fromEntries(r.parts.map((p) => [p.code, p.points])), e.parts, label('parts'));
  if ('extra_total' in e) assert.equal(r.extra ? r.extra.total : null, e.extra_total, label('extra_total'));
  for (const k of ['d_subjects', 'needs', 'late', 'missing']) if (k in e) assert.deepEqual(names(r[k]), e[k], label(k));
  if ('subjects' in e) {
    const byName = new Map(r.subjects.map((s) => [names([s.id])[0], s]));
    assert.equal(r.subjects.length, Object.keys(e.subjects).length === 0 ? 0 : r.subjects.length);
    for (const [name, want] of Object.entries(e.subjects)) {
      const got = byName.get(name);
      assert.ok(got, label(`subject ${name}`));
      for (const [k, v] of Object.entries(want)) assert.deepEqual(got[k], v, label(`${name}.${k}`));
    }
  }
  if ('result_key_input' in e) {
    // the 4th field is written with NAMES in the file; rebuilt with the ids of expect.needs
    const [status, reasons, total] = e.result_key_input.split('|');
    const ids = (e.needs ?? []).map((n) => input.idOf(n));
    const text = `${status}|${reasons}|${total}|${ids.join(',')}`;
    assert.equal(md5Hex(text), r.result_key, label('result_key'));
    assert.equal(resultKeyInput(r.status, r.reasons, r.total, r.needs), text, label('result_key_input'));
  }
}
// The exact key sets at every level (§4.2), and no age / DOB / email / money anywhere.
function checkResultShape(r, label) {
  assert.deepEqual(Object.keys(r).sort(), [...RESULT_KEYS].sort(), `${label}: the result's keys`);
  for (const s of r.subjects) assert.deepEqual(Object.keys(s).sort(), [...RESULT_SUBJECT_KEYS].sort(), `${label}: a subject's keys`);
  for (const p of r.parts) assert.deepEqual(Object.keys(p).sort(), ['applying', 'code', 'graded', 'points'], `${label}: a part's keys`);
  if (r.extra) {
    assert.deepEqual(Object.keys(r.extra).sort(), ['counted', 'items', 'total']);
    for (const i of r.extra.items) assert.deepEqual(Object.keys(i).sort(), ['count', 'kept', 'name', 'points']);
  }
  if (r.counts) assert.deepEqual(Object.keys(r.counts).sort(), ['applying', 'graded', 'left']);
  if (r.pass_bracket) assert.deepEqual(Object.keys(r.pass_bracket).sort(), ['from', 'to']);
  if (r.age_group) assert.deepEqual(Object.keys(r.age_group).sort(), ['from', 'to']);
  assert.match(r.result_key, /^[0-9a-f]{32}$/);
  assert.equal(r.parts.length, r.status === 'no_age' ? 0 : 4);
}
// Two JSON values the same, with the SAME key set at every level (the SQL-answer comparison).
function sameJson(a, b, path = '') {
  if (Array.isArray(a) || Array.isArray(b)) {
    assert.ok(Array.isArray(a) && Array.isArray(b), `${path}: array vs not`);
    assert.equal(a.length, b.length, `${path}: length`);
    a.forEach((x, i) => sameJson(x, b[i], `${path}[${i}]`));
    return;
  }
  if (a !== null && typeof a === 'object') {
    assert.ok(b !== null && typeof b === 'object', `${path}: object vs not`);
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${path}: key set`);
    for (const k of Object.keys(a)) sameJson(a[k], b[k], `${path}.${k}`);
    return;
  }
  if (typeof a === 'number' && typeof b === 'number') assert.ok(Math.abs(a - b) < 1e-9, `${path}: ${a} vs ${b}`);
  else assert.equal(a, b, path);
}

let gradingFixture = null;
try {
  gradingFixture = JSON.parse(readFileSync(GRADING_CASES_URL, 'utf8'));
} catch {
  gradingFixture = null;
}

check('grading: every result_cases entry of 0025_grading_cases.json through grading.js = expect', () => {
  if (!gradingFixture) {
    console.log('NOTE: supabase/tests/0025_grading_cases.json is not there yet; only this file\'s own grading cases ran.');
    return;
  }
  assert.ok(gradingFixture.result_cases.length >= 40, 'the required cases are there');
  for (const c of gradingFixture.result_cases) {
    const { dan, input, answer } = runResultCase(c);
    checkResultShape(answer, c.name);
    compareResult(c, dan, input, answer);
  }
});

check('grading: every kept_cases entry through keptMatch = expect', () => {
  if (!gradingFixture) return;
  assert.ok(gradingFixture.kept_cases.length >= 8);
  for (const k of gradingFixture.kept_cases) {
    const earlier = runResultCase(k.earlier);
    const laterDan = caseDan(k.later.base, k.later.ops);
    const m = keptMatch(earlier.answer, earlier.dan, earlier.input.counts, laterDan, k.later.age);
    assert.deepEqual(Object.keys(m).sort(), ['dropped', 'dropped_extra', 'kept', 'kept_counts', 'new', 'retest'], k.name);
    const laterNames = (ids) => subjectNames(laterDan, ids);
    const e = k.expect;
    assert.deepEqual(m.kept.map((x) => ({ subject: laterNames([x.subject_id])[0], part: x.part, letter: x.letter })), e.kept, `${k.name}: kept`);
    assert.deepEqual(laterNames(m.retest), e.retest, `${k.name}: retest`);
    assert.deepEqual(laterNames(m.new), e.new, `${k.name}: new`);
    assert.deepEqual(m.dropped, e.dropped, `${k.name}: dropped`);
    assert.deepEqual(m.kept_counts, e.kept_counts, `${k.name}: kept_counts`);
    assert.deepEqual(m.dropped_extra, e.dropped_extra, `${k.name}: dropped_extra`);
  }
});

check('grading: grading.js = the SQL\'s full saved answers, key sets included (PGlite step0025 f, when it ran)', () => {
  const path = process.env.BB_0025_SQL_ANSWERS;
  if (!gradingFixture || !path) {
    console.log('NOTE: no saved SQL answers (set BB_0025_SQL_ANSWERS to the file PGlite writes); the key-by-key comparison with the SQL was skipped.');
    return;
  }
  let saved;
  try {
    saved = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    console.log(`NOTE: BB_0025_SQL_ANSWERS (${path}) can't be read yet; the key-by-key comparison with the SQL was skipped.`);
    return;
  }
  // { result_cases: [{ name, answer }], kept_cases: [{ name, answer }] } or { "<case name>": answer }
  const find = (list, name) => (Array.isArray(saved?.[list]) ? saved[list].find((x) => x.name === name)?.answer : saved?.[name]);
  let compared = 0;
  for (const c of gradingFixture.result_cases) {
    const sql = find('result_cases', c.name);
    if (sql === undefined) continue;
    sameJson(runResultCase(c).answer, sql, c.name);
    compared += 1;
  }
  for (const k of gradingFixture.kept_cases) {
    const sql = find('kept_cases', k.name);
    if (sql === undefined) continue;
    const earlier = runResultCase(k.earlier);
    sameJson(keptMatch(earlier.answer, earlier.dan, earlier.input.counts, caseDan(k.later.base, k.later.ops), k.later.age), sql, k.name);
    compared += 1;
  }
  assert.ok(compared > 0, 'the saved answers name the fixture\'s cases');
});

check('grading: the cast (TKD-BlackBelt-Mockup-Cast.json) on the default rubric = its typed totals and letters', () => {
  for (const c of CAST.candidates) {
    const dan = DEFAULT_RUBRIC.dans[c.dan - 1];
    const subjects = danSubjects(dan);
    const grades = [];
    const want = {};
    for (const [name, text] of Object.entries(c.grades)) {
      if (/not for this age|Late/.test(text)) continue;
      const s = subjects.find((x) => x.subject.name === name);
      assert.ok(s, `${c.name}: ${name}`);
      const m = /^(?:(Pull-up|Hold) )?([\d.:]+) \S+ = (\S+)$/.exec(text);
      if (m) {
        grades.push({ subject_id: s.subject.id, letter: null, measured: m[2].includes(':') ? minutesFromText(m[2]) : Number(m[2]), way: m[1] === 'Hold' ? 1 : 0, kept: false, kept_from_cycle_name: null });
        want[s.subject.id] = m[3];
      } else {
        grades.push({ subject_id: s.subject.id, letter: text, measured: null, way: null, kept: false, kept_from_cycle_name: null });
        want[s.subject.id] = text;
      }
    }
    const counts = Object.entries(c.extraCounts).filter(([, v]) => v).map(([k, v]) => ({ item_name: k, count: v.count, kept: false }));
    const r = gradeResult(dan, c.age, grades, counts, [], [], '2027-06-09', '2027-05-29');
    assert.equal(r.total, c.total, c.name);
    assert.equal(r.maximum, c.maxBeforeExtra, c.name);
    assert.equal(r.pass_mark, c.passMark, c.name);
    assert.equal(r.extra.total, c.extraPoints, c.name);
    assert.equal(r.complete, c.finished, c.name);
    assert.equal(bracketLabel(r.age_group), c.ageGroup, c.name);
    for (const s of r.subjects) if (want[s.id]) assert.equal(s.letter, want[s.id], `${c.name}: ${subjectNames(dan, [s.id])}`);
    const tag = { passed: 'Passed', not_finished: 'Not finished', makeup: 'Make-up' }[r.status];
    assert.ok(c.resultResultsTab.startsWith(tag), `${c.name}: ${r.status}`);
  }
});

check('grading: age groups, measured letters, extra points, the key, number formats (§4.4–§4.6, §1.4, G 3, G 4)', () => {
  const d1 = DEFAULT_RUBRIC.dans[0];
  // 1st Dan: 8 and under · 9 · 10–12 · 13–17 · 18 and over (G 2)
  assert.deepEqual(ageGroups(d1).map(bracketLabel), ['8 and under', '9', '10–12', '13–17', '18 and over']);
  assert.deepEqual(ageGroupOf(d1, 9), { from: 9, to: 9 });
  assert.equal(ageGroupOf(d1, null), null);
  const subject = (name) => danSubjects(d1).find((s) => s.subject.name === name).subject;
  const hold = subject('Pull-up or hold').ways[1];
  const mile = subject('1/2 or 1 mile').ways[0];
  const sprint = subject('Sprint 100 m').ways[0];
  assert.equal(measuredLetter(hold, 15, 31), 'A+'); // at_least: exactly the cut-off
  assert.equal(measuredLetter(hold, 15, 30.9), 'A');
  assert.equal(measuredLetter(mile, 15, 8.5), 'A'); // at_most: exactly 8:30
  assert.equal(measuredLetter(sprint, 11, 19), 'B'); // under 19 for B+: 19 is NOT under 19
  assert.equal(measuredLetter(sprint, 11, 18.9), 'B+');
  assert.equal(measuredLetter(sprint, 11, 99), 'D'); // none met → D (v0.944)
  assert.equal(measuredLetter(sprint, null, 18), null);
  assert.equal(measuredLetter(sprint, 11, null), null);
  // extra points: per count, steps chosen by at_least (not list position), a limit, not counted
  const extra = {
    counts_toward_total: true, limit: 12, to_confirm: false, note: null,
    items: [
      { name: 'Stripes', rule: { kind: 'per_count', points_each: 1.5 } },
      { name: 'Comps', rule: { kind: 'steps', steps: [{ at_least: 5, points: 15 }, { at_least: 1, points: 3 }, { at_least: 3, points: 7 }] } },
    ],
  };
  assert.deepEqual(extraPoints(extra, [{ item_name: 'Stripes', count: 3, kept: false }, { item_name: 'Comps', count: 4, kept: true }]), {
    counted: true, total: 11.5, items: [{ name: 'Stripes', count: 3, points: 4.5, kept: false }, { name: 'Comps', count: 4, points: 7, kept: true }],
  });
  assert.equal(extraPoints(extra, [{ item_name: 'Comps', count: 9, kept: false }]).total, 12); // over the limit
  assert.deepEqual(extraPoints(extra, [{ item_name: 'Comps', count: 0, kept: false }, { item_name: 'comps', count: 5, kept: false }]).items[1],
    { name: 'Comps', count: 0, points: 0, kept: false }); // below the first step; the name must match exactly
  assert.equal(extraPoints({ ...extra, counts_toward_total: false }, []).counted, false);
  // the key: trailing zeros never change it; reasons are in it
  assert.equal(trimScaleText(263), '263');
  assert.equal(trimScaleText(300.9), '300.9');
  assert.equal(trimScaleText(null), '');
  assert.equal(resultKey('makeup', ['below'], 263, []), md5Hex('makeup|below|263|'));
  assert.equal(resultKey('makeup', ['below'], 263.0, []), resultKey('makeup', ['below'], 263, []));
  assert.notEqual(resultKey('makeup', ['d'], 252.5, ['x']), resultKey('makeup', ['d', 'below'], 252.5, ['x']));
  assert.equal(WITHDRAWN_RESULT_KEY, md5Hex('withdrawn|||'));
  // m:ss in whole seconds (§1.4): 8:30 = 8.5, 8:40 = 8.6667, 8:13 = 8.2167, 12:40 = 12.6667 — and back
  for (const [text, value] of [['8:30', 8.5], ['8:40', 8.6667], ['8:13', 8.2167], ['12:40', 12.6667]]) {
    assert.equal(minutesFromText(text), value, text);
    assert.equal(minutesText(value), text, text);
    assert.deepEqual(parseMeasured('minutes', text), { status: 'ok', value });
    assert.equal(formatMeasured('minutes', value), text);
  }
  // number formats per unit (G 4, OI-7)
  assert.deepEqual(parseMeasured('inches', '70.5'), { status: 'ok', value: 70.5 });
  assert.equal(parseMeasured('inches', '70.25').status, 'invalid');
  assert.deepEqual(parseMeasured('seconds', '11.8'), { status: 'ok', value: 11.8 });
  assert.equal(parseMeasured('seconds', '11.85').status, 'invalid');
  assert.equal(parseMeasured('reps', '8.5').status, 'invalid');
  assert.deepEqual(parseMeasured('count', ''), { status: 'ok', value: null }); // empty = Clear
  assert.deepEqual(parseMeasured('kicks', '1000'), { status: 'invalid', reason: 'range' });
  assert.equal(parseMeasured('laps', '2.25').status, 'ok');
  assert.equal(parseMeasured('laps', '2.255').status, 'invalid');
  assert.equal(MEASURED_RANGE_MESSAGE, 'Type a number from 0 to 999.');
  assert.equal(feetAndInches(70), '70 in = 5 ft 10 in');
  assert.deepEqual(['inches', 'count', 'seconds', 'minutes', 'kicks', 'reps', 'laps'].map(unitShort), ['in', 'count', 'sec', 'min', 'kicks', 'reps', 'laps']);
  // the cut-off in the rubric's words (G 3): "31 sec or more", "8:30 or less", "under 19 sec"
  assert.equal(cutoffWords(hold, { from: 13, to: 17 }, 'A+'), '31 sec or more');
  assert.equal(cutoffWords(mile, { from: 13, to: 17 }, 'A'), '8:30 or less');
  assert.equal(cutoffWords(sprint, { from: 10, to: 12 }, 'B+'), 'under 19 sec');
  assert.equal(reachedWords(sprint, { from: 10, to: 12 }, 'D'), '');
});

check('grading: Choose subjects starting ticks + best case (G 21–G 23), the left / not-finished words (G 7, R 10)', () => {
  const d1 = DEFAULT_RUBRIC.dans[0];
  const zoe = CAST.candidates.find((c) => c.key === 'zoe');
  const fixtureZoe = gradingFixture?.result_cases.find((c) => c.name.startsWith('cast: Zoe Martin'));
  if (fixtureZoe) {
    const { answer } = runResultCase(fixtureZoe);
    assert.equal(answer.choice_needed, true);
    const { offered, ticked } = startingTicks(answer);
    assert.deepEqual(subjectNames(d1, ticked).sort(), [...zoe.makeupChoiceIfAdminSaves.retests].sort()); // every subject below B
    assert.equal(offered[0].letter, 'C-'); // lowest grade first
    assert.ok(!offered.some((s) => !s.applies)); // One Step Sparring isn't offered at 16
    const best = bestCase(answer, d1, ticked);
    assert.deepEqual(best, { total: zoe.makeupChoiceIfAdminSaves.bestCaseIfAllAPlus, passMark: 275, stillBelow: false });
    assert.deepEqual(bestCase(answer, d1, []), { total: 263, passMark: 275, stillBelow: true }); // amber: even all A+ stays below
  }
  // no subject below B → every subject tied for the lowest grade
  const fake = { subjects: [{ id: 'a', applies: true, letter: 'A' }, { id: 'b', applies: true, letter: 'B' }, { id: 'c', applies: true, letter: 'B' }, { id: 'd', applies: false, letter: 'C' }] };
  assert.deepEqual(startingTicks(fake).ticked, ['b', 'c']);
  const lucas = gradingFixture?.result_cases.find((c) => c.name.startsWith('cast: Lucas Ferreira'));
  if (lucas) {
    const { answer, dan } = runResultCase(lucas);
    assert.equal(leftWords(answer, dan, '2027-05-29'), 'TKD project late (due May 29)');
    assert.equal(notFinishedWords(answer, dan, '2027-05-29'), 'TKD project late (due May 29)');
  }
  const r = gradeResult(d1, 15, [], [], [], [], '2027-04-03', '2027-05-29');
  assert.equal(leftWords(r, d1, '2027-05-29'), '25 of 25 left');
  assert.equal(notFinishedWords(r, d1, '2027-05-29'), 'Nothing graded yet');
  const late3 = { counts: { applying: 25, graded: 20, left: 5 }, late: ['a', 'b', 'c'], missing: ['a', 'b', 'c', 'x', 'y'] };
  assert.equal(leftWords(late3, d1, '2027-05-29'), '3 hand-ins late (due May 29)');
  assert.equal(notFinishedWords(late3, d1, '2027-05-29'), '3 hand-ins late (due May 29) · 2 more not graded');
  const ids = danSubjects(d1).map((s) => s.subject.id);
  assert.equal(notFinishedWords({ counts: { applying: 25, graded: 23, left: 2 }, late: [], missing: [ids[0], ids[1]] }, d1, null), 'Stretching and Sit-up (20 sec) not graded yet');
  assert.equal(notFinishedWords({ counts: { applying: 25, graded: 14, left: 11 }, late: [], missing: ids.slice(0, 11) }, d1, null), '11 subjects not graded yet');
});

check('resultEmail.js: the texts\' rules (= bb_result_text_problem), the seed, the blanks, mailto, the CSV', () => {
  // the starting texts are the contract's §2.4 seed word for word (and, once it exists, the migration's)
  const contract = readFileSync(new URL('../../../docs/Dashboard Docs/Build contracts/CONTRACT-0025.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const kind of RESULT_KINDS) {
    const m = new RegExp(`^- \`${kind}\`: \`(.*)\`$`, 'm').exec(contract);
    assert.ok(m, `the contract's ${kind} text`);
    assert.equal(STARTING_TEXTS[kind], m[1].replace(/\\n/g, '\n'), kind);
    assert.equal(resultTextProblem(kind, STARTING_TEXTS[kind]), null, kind);
  }
  let migration = null;
  try {
    migration = readFileSync(new URL('../../../supabase/migrations/0025_black_belt_grading.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  } catch {
    console.log('NOTE: 0025_black_belt_grading.sql is not there yet; the seeded texts were checked against the contract only.');
  }
  if (migration) {
    // every seeded text appears in the migration as an E-string (line breaks as \n), md5-equal
    for (const kind of RESULT_KINDS) {
      const escaped = STARTING_TEXTS[kind].replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\n/g, '\\n');
      assert.ok(migration.includes(escaped), `the migration seeds the ${kind} text word for word`);
      assert.equal(md5Hex(escaped.replace(/\\n/g, '\n').replace(/''/g, "'")), md5Hex(STARTING_TEXTS[kind]));
    }
  }
  // every rule code, in the database's order
  const P = (kind, body) => resultTextProblem(kind, body);
  assert.equal(P('nope', 'x'), 'kind');
  assert.equal(P('passed', ''), 'empty');
  assert.equal(P('passed', `{total} {pass mark}${'x'.repeat(2000)}`), 'too_long');
  assert.equal(P('passed', `Hi​ {total} {pass mark}`), 'bad_character');
  assert.equal(P('passed', '  \n{total} {pass mark}'), 'first_line');
  assert.equal(P('passed', 'Hi {frist name} {total} {pass mark}'), 'unknown_blank');
  assert.equal(resultTextProblemDetail('passed', 'Hi {frist name}').blank, 'frist name');
  assert.equal(P('passed', 'Hi {D subjects} {total} {pass mark}'), 'blank_not_for_kind');
  assert.equal(P('makeup_below', 'Hi {below-pass-mark note} {total} {pass mark} {subjects to work on}'), 'blank_not_for_kind');
  assert.equal(P('passed', 'Hi { {total} {pass mark}'), 'stray_brace');
  assert.equal(P('passed', 'Hi {total}'), 'missing_required');
  assert.equal(P('makeup_d', 'Hi {total} {pass mark}'), 'missing_required');
  assert.equal(P('passed', 'Hi {max} {total} {pass mark}'), 'unknown_blank'); // no {max} / {testing day} in Black Belt (R 24)
  assert.equal(P('makeup_d', 'Hi {first name}, {total} {pass mark} {subjects to work on} {D subjects} {below-pass-mark note} {cycle} {Dan} {full name}'), null);
  // the blanks for one candidate (R 24): Rina Patel, D + below
  const rina = { firstName: 'Rina', lastName: 'Patel', cycleName: 'Spring 2027', dan: 1, total: 252.5, passMark: 293, reasons: ['d', 'below'], needs: ['1/2 or 1 mile'], dSubjects: ['1/2 or 1 mile'] };
  const v = blankValues(rina);
  assert.deepEqual([v['full name'], v.cycle, v.Dan, v.total, v['pass mark'], v['subjects to work on']], ['Rina Patel', 'Spring 2027', '1st Dan', '252.5', '293', '1/2 or 1 mile']);
  assert.equal(v['below-pass-mark note'], 'Rina’s total is also below the pass mark; only the D subject is tested again.');
  assert.equal(blankValues({ ...rina, reasons: ['d'] })['below-pass-mark note'], '');
  const texts = Object.fromEntries(RESULT_KINDS.map((k) => [k, { body: STARTING_TEXTS[k] }]));
  const msg = buildResultMessage({ texts, answer: { ...rina, kind: 'makeup_d' } });
  assert.equal(msg.status, 'ok');
  assert.equal(msg.subject, 'Your black belt testing result — U.S.T.C.');
  assert.ok(msg.body.startsWith('Hello,\n\nRina Patel took the Spring 2027 Black Belt testing (1st Dan), with a total of 252.5 points.'));
  assert.ok(!msg.body.includes('{'));
  const noNote = buildResultMessage({ texts, answer: { ...rina, reasons: ['d'], kind: 'makeup_d' } }).body;
  assert.ok(noNote.includes('received a D in 1/2 or 1 mile.\n\n'), 'an empty blank takes its space away too');
  assert.deepEqual(buildResultMessage({ texts: {}, answer: { kind: 'passed' } }), { status: 'no_text' });
  assert.deepEqual(buildResultMessage({ texts, answer: { kind: null } }), { status: 'not_finished' });
  assert.equal(resultKind({ status: 'makeup', reasons: ['below'], needs: [], choice_needed: true }), null);
  assert.equal(resultKind({ status: 'makeup', reasons: ['d'], needs: ['x'], choice_needed: false }), 'makeup_d');
  assert.equal(resultKind({ status: 'not_finished', reasons: [], needs: [] }), null);
  assert.equal(mailtoFor('mia.chen@example.com'), 'mailto:mia.chen@example.com?subject=Your%20black%20belt%20testing%20result%20%E2%80%94%20U.S.T.C.');
  assert.equal(mailtoFor('nope'), null);
  assert.equal(mailtoFor('a@b.com?body=x').split('?').length, 2); // an odd address can never add a body: its ? is encoded
  // the CSV (R 45–R 49)
  assert.equal(csvFileName('Spring 2027', '2027-06-09'), 'Spring-2027-Black-Belt-results-2027-06-09.csv');
  assert.equal(CSV_COLUMNS.length, 21);
  assert.deepEqual(CSV_COLUMNS, ['Dan', 'Name', 'School', 'Make-up from', 'Date of birth', 'Pass-mark bracket', 'Email', 'Plan', 'Kukkiwon',
    'Payments', 'Balance', 'Physical', 'Technical', 'Curriculum', 'Other requirements', 'Extra points', 'Total', 'Pass mark', 'Result', 'Needs', 'Result sent']);
  const csv = csvRows({
    rows: [{
      candidate_id: 'x', result_status: 'not_finished', dan: 1, first_name: 'Lucas', last_name: 'Ferreira', location_code: 'worcester', makeup_of_cycle_name: null,
      date_of_birth: '2015-09-12', pass_bracket: { from: null, to: 17 }, email_for_results: 'f@example.com', plan_name: '3 payments', kukkiwon: false,
      money: { tag: 'late', late_cents: 33000, late_since: '2027-05-29', balance_cents: 33000, overpaid_cents: 0 },
      parts: [{ code: 'physical', points: 60, graded: 9, applying: 9 }, { code: 'technical', points: 0, graded: 0, applying: 5 }], extra_total: 12, total: 275.5, pass_mark: 275,
      result: { status: 'not_finished', reasons: [], complete: false, choice_needed: false, needs: [], late: ['TKD project'], missing: ['TKD project'] },
      sent: { sent: { marked_at: '2027-06-07T14:20:00Z', marked_by_name: 'Staff', result_status: 'passed' }, matches: false },
    }],
  });
  assert.deepEqual(csv[0], CSV_COLUMNS);
  assert.deepEqual(csv[1], ['1st Dan', 'Lucas Ferreira', 'Worcester', '', '2015-09-12', '17 and under', 'f@example.com', '3 payments', 'No',
    'Late · $330 since May 29', '$330', '60', '', '', '', '12', '275.5', '275', 'Not finished', 'TKD project (late)', 'Not sent yet (Passed sent 2027-06-07)']);
  // formula guard (OWASP): = + - @ tab and carriage return at the start of TEXT get a leading ';
  // a plain number (also negative) stays a number
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-cmd'), "'-cmd");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('\tx'), "'\tx");
  assert.equal(csvCell('\rx'), `"'\rx"`); // guarded, then quoted (it holds a line break)
  assert.equal(csvCell('-12.50'), '-12.50');
  assert.equal(csvCell('-12'), '-12');
  assert.equal(csvCell('305.75'), '305.75');
  assert.equal(csvCell('-12.50 x'), "'-12.50 x");
  const text = csvText([['a', 'b,c'], ['=1', 'x"y']]);
  assert.equal(text, '﻿a,"b,c"\r\n\'=1,"x""y"\r\n');
});

// ----- the preview store: grading and results (mockGrading.js) -----

const castCall = (name, args, ctx = ADMIN) => call(name, args, ctx);
const GRADING_SECRET = ['"date_of_birth"', '"email_for_results"', '"money"', '"reference"', '"age"', '"makeup_of_candidate_id"', '"age_kept"', '"plan_id"'];
const noSecrets = (answer, label, allowed = []) => {
  const text = JSON.stringify(answer);
  for (const k of GRADING_SECRET) if (!allowed.includes(k)) assert.ok(!text.includes(k), `${label}: no ${k}`);
};
const springCycle = () => db().bb_cycles.find((c) => c.name === 'Spring 2027');
const fallCycle = () => db().bb_cycles.find((c) => c.name === 'Fall 2027');
const castRow = (first, last, cycle = springCycle()) => db().bb_candidates.find((c) => c.first_name === first && c.last_name === last && c.cycle_id === cycle.id);
const subjectId = (dan, name) => danSubjects(DEFAULT_RUBRIC.dans[dan - 1]).find((s) => s.subject.name === name).subject.id;
const loadCast = () => {
  backend.loadGradingSample(CAST);
  setDay('2027-06-09');
};

check('grading store: the cast sample = the cast (grid, Results, the Fall make-up) and the reads keep their privacy', () => {
  loadCast();
  const spring = springCycle();
  for (const dan of [1, 2, 3, 4]) {
    const g = castCall('bb_grading_grid', { p_cycle_id: spring.id, p_dan: dan }, STAFF);
    assert.equal(g.status, 'ok');
    assert.deepEqual(Object.keys(g).sort(), ['cycle', 'dan_counts', 'rows', 'rubric', 'status', 'today']);
    assert.deepEqual(Object.keys(g.cycle).sort(), ['days', 'first_day', 'id', 'name', 'submissions_due']);
    noSecrets(g, `grid ${dan}`);
    for (const row of g.rows) {
      assert.deepEqual(Object.keys(row).sort(), ['first_name', 'id', 'is_makeup', 'last_name', 'location_code', 'makeup_of_cycle_name', 'result']);
      checkResultShape(row.result, `${row.first_name} ${row.last_name}`);
      const c = CAST.candidates.find((x) => x.name === `${row.first_name} ${row.last_name}`);
      assert.equal(row.result.total, c.total, c.name);
      assert.equal(row.result.pass_mark, c.passMark, c.name);
    }
  }
  const g1 = castCall('bb_grading_grid', { p_cycle_id: spring.id, p_dan: 1 }, STAFF);
  assert.deepEqual(g1.rows.map((r) => r.last_name), ['Chen', 'Ferreira', 'Patel', 'Kim', 'Martin']); // Worcester, then Shrewsbury, last name (S-1)
  assert.deepEqual(g1.dan_counts, [{ dan: 1, location_code: 'shrewsbury', count: 2 }, { dan: 1, location_code: 'worcester', count: 3 },
    { dan: 2, location_code: 'shrewsbury', count: 1 }, { dan: 2, location_code: 'worcester', count: 2 }, { dan: 3, location_code: 'shrewsbury', count: 1 },
    { dan: 4, location_code: 'shrewsbury', count: 1 }]);
  assert.equal(g1.today, '2027-06-09');
  const res = castCall('bb_cycle_results', { p_cycle_id: spring.id, p_dan: null }, STAFF);
  assert.deepEqual(Object.keys(res).sort(), ['cycle', 'dan_counts', 'rows', 'rubrics', 'status', 'today']);
  assert.equal(res.rows.length, 10);
  noSecrets(res, 'results');
  for (const row of res.rows) {
    assert.deepEqual(Object.keys(row).sort(), ['dan', 'first_name', 'has_email', 'id', 'is_makeup', 'last_name', 'location_code', 'makeup_of_cycle_name',
      'result', 'sent']);
    assert.equal(row.has_email, true);
  }
  const alex = res.rows.find((r) => r.first_name === 'Alex');
  assert.equal(alex.sent.sent.marked_by_name, 'Staff');
  assert.equal(alex.sent.matches, true);
  assert.equal(res.rows.find((r) => r.first_name === 'Zoe').result.choice_needed, true);
  // Fall 2027: Mia Chen's make-up (kept grades + 15 kept extra; Free sparring to retest) at the end of the 1st Dan
  const fall = fallCycle();
  const gf = castCall('bb_grading_grid', { p_cycle_id: fall.id, p_dan: 1 }, STAFF);
  const mia = gf.rows[gf.rows.length - 1];
  assert.deepEqual([mia.first_name, mia.is_makeup, mia.makeup_of_cycle_name], ['Mia', true, 'Spring 2027']);
  assert.equal(mia.result.total, CAST.laterCycle.makeup.totalBeforeRetest);
  assert.equal(mia.result.extra.total, CAST.laterCycle.makeup.keptExtraPoints);
  assert.ok(mia.result.extra.items.every((i) => i.kept));
  const fs = mia.result.subjects.find((s) => s.id === subjectId(1, 'Free sparring'));
  assert.deepEqual([fs.retest, fs.gradable, fs.kept, fs.letter], [true, true, false, null]);
  assert.ok(mia.result.subjects.filter((s) => s.id !== fs.id && s.applies).every((s) => s.kept && !s.gradable && s.kept_from_cycle_name === 'Spring 2027'));
  // the roster lists the make-up with no plan and the four new keys
  const roster = castCall('bb_cycle_roster', { p_cycle_id: fall.id }, STAFF);
  const mr = roster.rows.find((r) => r.is_makeup);
  assert.deepEqual([mr.plan_id, mr.plan_name, mr.retest_names, mr.has_grades, mr.makeup_of_cycle_name], [null, null, ['Free sparring'], false, 'Spring 2027']);
  assert.equal(mr.money.total_due_cents, 0);
  const detail = castCall('bb_candidate_detail', { p_candidate_id: mr.id }, STAFF);
  assert.equal(detail.candidate.plan, null);
  assert.equal(detail.candidate.is_makeup, true);
  assert.ok(!('makeup_of_candidate_id' in detail.candidate) && !('age_kept' in detail.candidate));
  // Free sparring B+ on Fall → 333.5 Passed (the cast)
  setDay('2027-10-30');
  const after = castCall('bb_set_grade', { p_candidate_id: mr.id, p_dan: 1, p_subject_id: subjectId(1, 'Free sparring'), p_letter: 'B+' }, STAFF);
  assert.equal(after.status, 'ok');
  assert.deepEqual([after.result.total, after.result.status], [CAST.laterCycle.makeup.afterFreeSparringBPlus.total, 'passed']);
  // the new tables can't be read; the make-up columns of bb_candidates neither; the texts can (granted columns)
  for (const t of ['bb_grades', 'bb_extra_counts', 'bb_makeup_subjects', 'bb_result_sends', 'bb_downloads', 'bb_cycle_grading_started']) {
    assert.equal(backend.select(t, 'id', [], [], STAFF).error.code, '42501', t);
  }
  for (const col of ['makeup_of_candidate_id', 'makeup_of_cycle_name', 'age_kept']) assert.equal(backend.select('bb_candidates', `id, ${col}`, [], [], STAFF).error.code, '42501');
  const texts = backend.select('bb_result_texts', 'id, kind, body, version, created_at, updated_at, created_by_name, updated_by_name', [], [], STAFF);
  assert.equal(texts.data.length, 3);
  assert.equal(backend.select('bb_result_texts', 'created_by', [], [], STAFF).error.code, '42501');
  assert.deepEqual(backend.select('bb_result_texts', 'id', [], [], LOCKED).data, []);
  // the internal helpers are nobody's
  for (const name of ['bb_grade_result', 'bb_kept_match', 'bb_candidate_result', 'bb_update_candidate_core']) {
    assert.equal(backend.rpc(name, {}, ADMIN).error.code, '42501', name);
  }
});

check('grading store: grade writes — refusals in order (invalid, not_found, withdrawn, stale, kept), Clear, the same value, measured, counts', () => {
  loadCast();
  const spring = springCycle();
  const lucas = castRow('Lucas', 'Ferreira');
  const free = subjectId(1, 'Free sparring');
  const sprint = subjectId(1, 'Sprint 100 m');
  const pull = subjectId(1, 'Pull-up or hold');
  const g = (args, ctx = STAFF) => castCall('bb_set_grade', { p_candidate_id: lucas.id, p_dan: 1, p_subject_id: free, p_letter: 'A', ...args }, ctx);
  const m = (args, ctx = STAFF) => castCall('bb_set_measured', { p_candidate_id: lucas.id, p_dan: 1, p_subject_id: sprint, p_value: 18.5, p_way: 0, ...args }, ctx);
  assert.deepEqual(g({}, LOCKED), { status: 'no_access' });
  assert.deepEqual(g({ p_dan: 5 }), { status: 'invalid' });
  assert.deepEqual(g({ p_subject_id: 'BAD' }), { status: 'invalid' });
  assert.deepEqual(g({ p_candidate_id: randomUUID() }), { status: 'not_found' });
  assert.deepEqual(g({ p_dan: 2 }), { status: 'stale' }); // a stale tablet's old Dan
  assert.deepEqual(g({ p_letter: 'Z' }), { status: 'invalid' });
  assert.deepEqual(g({ p_letter: 'A-', p_subject_id: subjectId(1, 'Stretching') }), { status: 'invalid' }); // a measured subject via set_grade
  assert.deepEqual(g({ p_subject_id: subjectId(1, 'One Step Sparring (1-24)') }), { status: 'invalid' }); // not for 10–12
  assert.deepEqual(g({ p_subject_id: subjectId(1, 'Basic 10 Motions (1-7)'), p_letter: 'B+' }).status, 'ok');
  assert.deepEqual(castCall('bb_set_grade', { p_candidate_id: lucas.id, p_dan: 1, p_subject_id: subjectId(1, 'Stretching'), p_letter: 'A-' }, STAFF), { status: 'invalid' });
  // Physical letters are the short list: A- isn't one
  const phys = castCall('bb_set_grade', { p_candidate_id: castRow('Alex', 'Kim').id, p_dan: 1, p_subject_id: subjectId(1, 'Pull-up or hold'), p_letter: 'A' }, STAFF);
  assert.equal(phys.status, 'invalid'); // Pull-up or hold is measured
  // a set, then the same letter again (writes nothing), then Clear
  const ok = g({ p_letter: 'A' });
  assert.deepEqual([ok.status, ok.letter], ['ok', 'A']);
  const before = saves;
  g({ p_letter: 'A' });
  assert.equal(saves, before, 'the same letter writes nothing');
  const cleared = g({ p_letter: null });
  assert.equal(cleared.result.subjects.find((s) => s.id === free).letter, null);
  // measured: ≤ 4 decimals (refused, never rounded), 0–999, way 0/1 and a real way, Clear, switching the way
  assert.deepEqual(m({ p_value: 18.12345 }), { status: 'invalid' });
  assert.deepEqual(m({ p_value: 1000 }), { status: 'invalid' });
  assert.deepEqual(m({ p_value: -1 }), { status: 'invalid' });
  assert.deepEqual(m({ p_way: 2 }), { status: 'invalid' });
  assert.deepEqual(m({ p_way: null }), { status: 'invalid' });
  assert.deepEqual(m({ p_way: 1 }), { status: 'invalid' }); // way 1 on a one-way subject
  assert.deepEqual(m({ p_subject_id: free }), { status: 'invalid' }); // a graded subject via set_measured
  assert.equal(backend.rpc('bb_set_measured', { p_candidate_id: lucas.id, p_dan: 1, p_subject_id: sprint, p_value: 'NaN', p_way: 0 }, STAFF).error.code, '22P02');
  const sm = m({ p_value: 19 });
  assert.deepEqual([sm.status, sm.value, sm.way, sm.result.subjects.find((s) => s.id === sprint).letter], ['ok', 19, 0, 'B']);
  const hold = castCall('bb_set_measured', { p_candidate_id: lucas.id, p_dan: 1, p_subject_id: pull, p_value: 31, p_way: 1 }, STAFF);
  assert.equal(hold.result.subjects.find((s) => s.id === pull).letter, 'A+');
  const back = castCall('bb_set_measured', { p_candidate_id: lucas.id, p_dan: 1, p_subject_id: pull, p_value: null, p_way: null }, STAFF);
  assert.equal(back.result.subjects.find((s) => s.id === pull).letter, null);
  // counts: 0–9 999, an exact item name, Clear; no age needed
  const cnt = (args) => castCall('bb_set_extra_count', { p_candidate_id: lucas.id, p_dan: 1, p_item_name: 'Breaking class', p_count: 20, ...args }, STAFF);
  assert.deepEqual(cnt({ p_count: 10000 }), { status: 'invalid' });
  assert.deepEqual(cnt({ p_item_name: 'Nope' }), { status: 'invalid' });
  assert.deepEqual(cnt({ p_item_name: 'breaking class' }), { status: 'invalid' }); // the exact name
  const c20 = cnt({});
  assert.deepEqual([c20.status, c20.count, c20.result.extra.items.find((i) => i.name === 'Breaking class').points], ['ok', 20, 5]);
  assert.equal(cnt({ p_count: null }).result.extra.items.find((i) => i.name === 'Breaking class').count, null);
  // kept: a make-up's kept grade and kept count can't be changed
  const miaFall = castRow('Mia', 'Chen', fallCycle());
  assert.deepEqual(castCall('bb_set_grade', { p_candidate_id: miaFall.id, p_dan: 1, p_subject_id: subjectId(1, 'Korean terminology'), p_letter: 'A' }, STAFF), { status: 'kept' });
  assert.deepEqual(castCall('bb_set_measured', { p_candidate_id: miaFall.id, p_dan: 1, p_subject_id: sprint, p_value: 14, p_way: 0 }, STAFF), { status: 'kept' });
  assert.deepEqual(castCall('bb_set_extra_count', { p_candidate_id: miaFall.id, p_dan: 1, p_item_name: 'Extra stripes', p_count: 3 }, STAFF), { status: 'kept' });
  // withdrawn
  const w = castCall('bb_withdraw_candidate', { p_candidate_id: lucas.id, p_expected_version: db().bb_candidates.find((c) => c.id === lucas.id).version });
  assert.equal(w.status, 'ok');
  assert.deepEqual(g({}), { status: 'withdrawn' });
  // no age: a purged row with no kept age can't be graded (counts can)
  const s = db();
  const leo = s.bb_candidates.find((c) => c.first_name === 'Leo');
  leo.date_of_birth = null;
  leo.personal_removed_at = '2030-01-01T00:00:00Z';
  saved = s;
  assert.deepEqual(castCall('bb_set_grade', { p_candidate_id: leo.id, p_dan: 4, p_subject_id: subjectId(4, 'Referee seminar'), p_letter: 'A' }, STAFF), { status: 'invalid' });
  assert.equal(castCall('bb_set_extra_count', { p_candidate_id: leo.id, p_dan: 4, p_item_name: 'Extra stripes', p_count: 1 }, STAFF).status, 'ok');
  assert.equal(castCall('bb_grading_grid', { p_cycle_id: spring.id, p_dan: 4 }, STAFF).rows[0].result.status, 'no_age');
});

check('grading store: Choose subjects (A) — stale, already_added, invalid; choice_needed and Add make-up', () => {
  loadCast();
  const zoe = castRow('Zoe', 'Martin');
  const ids = CAST.candidates.find((c) => c.key === 'zoe').makeupChoiceIfAdminSaves.retests.map((n) => subjectId(1, n));
  const choose = (args, ctx = ADMIN) => castCall('bb_set_makeup_subjects', { p_candidate_id: zoe.id, p_expected_ids: [], p_ids: ids, ...args }, ctx);
  assert.deepEqual(choose({}, STAFF), { status: 'not_allowed' });
  assert.deepEqual(choose({ p_ids: [] }), { status: 'invalid' });
  assert.deepEqual(choose({ p_ids: [ids[0], ids[0]] }), { status: 'invalid' });
  assert.deepEqual(choose({ p_ids: [subjectId(1, 'One Step Sparring (1-24)')] }), { status: 'invalid' }); // not for 16
  assert.deepEqual(castCall('bb_set_makeup_subjects', { p_candidate_id: castRow('Alex', 'Kim').id, p_expected_ids: [], p_ids: [ids[0]] }), { status: 'invalid' }); // Passed
  assert.deepEqual(choose({ p_expected_ids: [ids[0]] }), { status: 'stale' });
  // Add make-up of a below result before any choice → choice_needed (Fall 2027, any day before its first day)
  const fall = fallCycle();
  setDay('2027-09-01');
  assert.deepEqual(castCall('bb_add_makeup', { p_cycle_id: fall.id, p_earlier_candidate_id: zoe.id }, STAFF), { status: 'choice_needed' });
  const list0 = castCall('bb_makeup_list', { p_cycle_id: fall.id }, STAFF);
  noSecrets(list0, 'make-up list');
  assert.deepEqual(list0.rows.map((r) => r.first_name).sort(), ['Mia', 'Rina', 'Zoe']); // every Spring make-up result (Mia's make-up is on Fall already)
  assert.equal(list0.rows.find((r) => r.first_name === 'Mia').already_added, true);
  const zr = list0.rows.find((r) => r.first_name === 'Zoe');
  assert.deepEqual([zr.choice_needed, zr.already_added, zr.cycle_name, zr.age_group], [true, false, 'Spring 2027', { from: 13, to: 17 }]);
  const chosen = choose({});
  assert.equal(chosen.status, 'ok');
  assert.deepEqual(chosen.ids, [subjectId(1, '1/2 or 1 mile'), subjectId(1, 'Korean terminology'), subjectId(1, 'TKD knowledge'), subjectId(1, 'Power Break')]);
  assert.deepEqual(chosen.result.needs, chosen.ids);
  // Add make-up: ok, then already_added (a second time, or from another cycle)
  const added = castCall('bb_add_makeup', { p_cycle_id: fall.id, p_earlier_candidate_id: zoe.id }, STAFF);
  assert.equal(added.status, 'ok');
  assert.deepEqual(Object.keys(added).sort(), ['id', 'kept_count', 'reference', 'retest_count', 'status', 'version']);
  assert.equal(added.retest_count, 4);
  assert.equal(added.reference, zoe.reference); // the make-up keeps the earlier reference (G 27)
  assert.deepEqual(castCall('bb_add_makeup', { p_cycle_id: fall.id, p_earlier_candidate_id: zoe.id }, STAFF), { status: 'already_added' });
  assert.deepEqual(choose({ p_expected_ids: ids }), { status: 'already_added' }); // Choose subjects after a make-up was added
  assert.equal(castCall('bb_makeup_list', { p_cycle_id: fall.id }, STAFF).rows.find((r) => r.first_name === 'Zoe').already_added, true);
  // the make-up has no fee, ever: a payment of any kind is refused, and Change plan is invalid
  const mk = db().bb_candidates.find((c) => c.id === added.id);
  assert.deepEqual(castCall('bb_record_payment', { p_candidate_id: mk.id, p_expected_version: mk.version, p_amount_cents: 100, p_method: 'cash', p_for_items: ['p1'], p_note: null }), { status: 'invalid' });
  assert.deepEqual(castCall('bb_change_plan', { p_candidate_id: mk.id, p_expected_version: mk.version, p_cycle_plan_id: db().bb_cycle_plans.find((p) => p.cycle_id === fall.id).id, p_kukkiwon: false }), { status: 'invalid' });
  // Undo = Delete permanently (admins): fine with only kept / retest rows
  assert.deepEqual(castCall('bb_delete_candidate', { p_candidate_id: mk.id, p_expected_version: mk.version }), { status: 'ok' });
  // stale: the earlier result isn't a make-up any more (Alex passed); invalid: the same cycle
  assert.deepEqual(castCall('bb_add_makeup', { p_cycle_id: fall.id, p_earlier_candidate_id: castRow('Alex', 'Kim').id }, STAFF), { status: 'stale' });
  assert.deepEqual(castCall('bb_add_makeup', { p_cycle_id: springCycle().id, p_earlier_candidate_id: zoe.id }, STAFF), { status: 'finished' }); // Spring is Past on Sep 1
  setDay('2027-12-01');
  assert.deepEqual(castCall('bb_add_makeup', { p_cycle_id: fall.id, p_earlier_candidate_id: zoe.id }, STAFF), { status: 'finished' });
});

check('S-1: Worcester before Shrewsbury inside each Dan (roster, Grading, Results, make-up picker, fake CSV); the other keys stay', () => {
  const row = (id, dan, locationCode, lastName, firstName, extra = {}) => ({ id, dan, locationCode, lastName, firstName, ...extra });
  const rows = [
    row('a', 2, 'shrewsbury', 'Brooks', 'Ava'), row('b', 1, 'shrewsbury', 'Kim', 'Alex'), row('c', 1, 'worcester', 'patel', 'Rina'),
    row('d', 1, 'worcester', 'Chen', 'Mia'), row('e', 2, 'worcester', 'Silva', 'Zed'), row('f', 2, 'worcester', 'silva', 'Amy'),
    row('g', 1, 'worcester', 'Chen', 'Al'), row('h', 3, 'shrewsbury', 'Nguyen', 'Li'),
  ];
  const ids = (list) => list.map((r) => r.id).join('');
  // Dan, then Worcester before Shrewsbury, then last name (capitals ignored), first name
  assert.equal(ids(sortWorcesterFirst(rows)), 'gdcbfeah');
  assert.equal(ids(rows), 'abcdefgh', 'the input is not changed');
  // same everything but id → by id
  assert.equal(ids(sortWorcesterFirst([row('z', 1, 'worcester', 'Chen', 'Mia'), row('y', 1, 'worcester', 'Chen', 'Mia')])), 'yz');
  // one school: nothing but last / first name decides, exactly as before
  const shrewsbury = rows.filter((r) => r.locationCode === 'shrewsbury');
  assert.equal(ids(sortWorcesterFirst(shrewsbury)), 'bah');
  assert.equal(compareDanSchoolName(row('w', 1, 'worcester', 'Z', 'Z'), row('s', 1, 'shrewsbury', 'A', 'A')) < 0, true);
  // Grading grid: make-ups stay last, each group in the new order
  const grid = [
    row('m1', 1, 'worcester', 'Aaa', 'A', { isMakeup: true }), row('s1', 1, 'shrewsbury', 'Kim', 'K'), row('w1', 1, 'worcester', 'Zee', 'Z'),
    row('m2', 1, 'shrewsbury', 'Bbb', 'B', { isMakeup: true }), row('w2', 1, 'worcester', 'Chen', 'C'),
  ];
  assert.equal(ids(sortWorcesterFirst(grid, { makeupsLast: true })), 'w2w1s1m1m2');
  // the make-up picker: newest earlier cycle first, then Dan, Worcester, names
  const picker = [
    row('p1', 1, 'shrewsbury', 'Kim', 'K', { cycleFirstDay: '2026-10-03' }), row('p2', 1, 'worcester', 'Chen', 'C', { cycleFirstDay: '2026-10-03' }),
    row('p3', 2, 'shrewsbury', 'Lee', 'L', { cycleFirstDay: '2027-04-03' }), row('p4', 1, 'worcester', 'Zee', 'Z', { cycleFirstDay: '2027-04-03' }),
  ];
  assert.equal(ids(sortMakeupPicker(picker)), 'p4p3p2p1');
  // two earlier cycles that start the same day stay apart (the database keeps each cycle's rows together)
  const sameDay = [
    row('b1', 1, 'worcester', 'Aaa', 'A', { cycleFirstDay: '2026-10-03', cycleId: 'cyc-b' }),
    row('a2', 2, 'worcester', 'Bbb', 'B', { cycleFirstDay: '2026-10-03', cycleId: 'cyc-a' }),
    row('a1', 1, 'shrewsbury', 'Ccc', 'C', { cycleFirstDay: '2026-10-03', cycleId: 'cyc-a' }),
  ];
  assert.equal(ids(sortMakeupPicker(sameDay)), 'a1a2b1');
  // the fake stores the preview and these checks run on send the same order, the CSV included
  loadCast();
  const spring = springCycle();
  const order = (list) => list.map((r) => `${r.dan} ${r.location_code}`);
  const results = castCall('bb_cycle_results', { p_cycle_id: spring.id, p_dan: null }, STAFF).rows;
  for (const rowsOf of [results, castCall('bb_results_csv', { p_cycle_id: spring.id }).rows]) {
    const list = order(rowsOf);
    for (let i = 1; i < list.length; i += 1) {
      const [dA, sA] = list[i - 1].split(' ');
      const [dB, sB] = list[i].split(' ');
      assert.ok(Number(dA) < Number(dB) || (dA === dB && !(sA === 'shrewsbury' && sB === 'worcester')), `${list[i - 1]} then ${list[i]}`);
    }
  }
  assert.ok(results.some((r) => r.location_code === 'worcester') && results.some((r) => r.location_code === 'shrewsbury'));
});

check('grading store: Mark as sent / Undo (10 s own, admins later), Email result, no_email, not_finished, the CSV (A, logged first)', () => {
  loadCast();
  const spring = springCycle();
  const ava = castRow('Ava', 'Brooks');
  const res = () => castCall('bb_cycle_results', { p_cycle_id: spring.id, p_dan: 2 }, STAFF).rows.find((r) => r.id === ava.id);
  const key = res().result.result_key;
  assert.deepEqual(castCall('bb_mark_result_sent', { p_candidate_id: ava.id, p_expected_result_key: 'f'.repeat(32) }, STAFF), { status: 'stale' });
  const sent = castCall('bb_mark_result_sent', { p_candidate_id: ava.id, p_expected_result_key: key }, STAFF);
  assert.deepEqual(Object.keys(sent).sort(), ['marked_at', 'sent_id', 'status']);
  assert.equal(res().sent.matches, true);
  // "changed since sent": a later count changes the key
  castCall('bb_set_extra_count', { p_candidate_id: ava.id, p_dan: 2, p_item_name: 'Competitions', p_count: 1 }, STAFF);
  assert.deepEqual([res().result.total, res().sent.matches], [303.95, false]);
  // a text change never resets Sent
  const t = db().bb_result_texts.find((x) => x.kind === 'passed');
  assert.deepEqual(castCall('bb_set_result_text', { p_kind: 'passed', p_expected_version: t.version, p_body: `${t.body}!` }, STAFF), { status: 'not_allowed' });
  assert.deepEqual(castCall('bb_set_result_text', { p_kind: 'passed', p_expected_version: t.version, p_body: 'no blanks' }), { status: 'invalid' });
  assert.deepEqual(castCall('bb_set_result_text', { p_kind: 'passed', p_expected_version: t.version + 1, p_body: `${t.body}!` }), { status: 'stale' });
  const saved1 = castCall('bb_set_result_text', { p_kind: 'passed', p_expected_version: t.version, p_body: `${t.body}!` });
  assert.deepEqual([saved1.status, saved1.version], ['ok', t.version + 1]);
  const before = saves;
  assert.equal(castCall('bb_set_result_text', { p_kind: 'passed', p_expected_version: saved1.version, p_body: `${t.body}!` }).version, saved1.version);
  assert.equal(saves, before, 'the same text writes nothing');
  // undo: own within 10 s; then not_allowed for staff, ok for admins; twice → stale
  const undoOwn = castCall('bb_undo_result_sent', { p_send_id: sent.sent_id }, STAFF);
  assert.deepEqual(undoOwn, { status: 'ok' });
  assert.deepEqual(castCall('bb_undo_result_sent', { p_send_id: sent.sent_id }, STAFF), { status: 'stale' });
  const key2 = res().result.result_key;
  const sent2 = castCall('bb_mark_result_sent', { p_candidate_id: ava.id, p_expected_result_key: key2 }, STAFF);
  advance(11 * 1000);
  assert.deepEqual(castCall('bb_undo_result_sent', { p_send_id: sent2.sent_id }, STAFF), { status: 'not_allowed' });
  assert.deepEqual(castCall('bb_undo_result_sent', { p_send_id: sent2.sent_id }, ADMIN), { status: 'ok' });
  // expireUndo ages the newest send
  const sent3 = castCall('bb_mark_result_sent', { p_candidate_id: ava.id, p_expected_result_key: key2 }, STAFF);
  backend.expireUndo();
  assert.deepEqual(castCall('bb_undo_result_sent', { p_send_id: sent3.sent_id }, STAFF), { status: 'not_allowed' });
  // not_finished: Lucas (late), Zoe (an admin chooses first); Email result the same
  const lucas = castRow('Lucas', 'Ferreira');
  const zoe = castRow('Zoe', 'Martin');
  const anyKey = 'a'.repeat(32);
  assert.deepEqual(castCall('bb_mark_result_sent', { p_candidate_id: lucas.id, p_expected_result_key: anyKey }, STAFF), { status: 'not_finished' });
  assert.deepEqual(castCall('bb_mark_result_sent', { p_candidate_id: zoe.id, p_expected_result_key: anyKey }, STAFF), { status: 'not_finished' });
  assert.deepEqual(castCall('bb_result_email', { p_candidate_id: lucas.id }, STAFF), { status: 'not_finished' });
  // Email result: one candidate's email at the click (R 12)
  const rina = castCall('bb_result_email', { p_candidate_id: castRow('Rina', 'Patel').id }, STAFF);
  assert.deepEqual(Object.keys(rina).sort(), ['cycle_name', 'd_subjects', 'dan', 'email', 'first_name', 'kind', 'last_name', 'needs', 'pass_mark', 'reasons',
    'result_key', 'status', 'total']);
  assert.deepEqual([rina.kind, rina.needs, rina.d_subjects, rina.email], ['makeup_d', ['1/2 or 1 mile'], ['1/2 or 1 mile'], 'rina.patel@example.com']);
  noSecrets(rina, 'result email', ['"email"']);
  // no_email: on the purge day before the purge ran (keep-years 3 / 3: Rina's day is Spring's last
  // day + 3 years; Alex is a child, kept until 3 years after 18; Mia's make-up keeps hers longer)
  setDay('2030-06-06');
  const after = castCall('bb_cycle_results', { p_cycle_id: spring.id, p_dan: 1 }, STAFF);
  const rinaRow = after.rows.find((r) => r.first_name === 'Rina');
  assert.deepEqual(after.rows.map((r) => [r.first_name, r.has_email]), [['Mia', true], ['Lucas', true], ['Rina', false], ['Alex', true], ['Zoe', true]]); // Worcester first (S-1)
  assert.deepEqual(castCall('bb_result_email', { p_candidate_id: rinaRow.id }, STAFF), { status: 'no_email' });
  assert.deepEqual(castCall('bb_mark_result_sent', { p_candidate_id: rinaRow.id, p_expected_result_key: rinaRow.result.result_key }, STAFF), { status: 'no_email' });
  // the CSV: admins only; the log row first; DOB and email null from the purge day on
  assert.deepEqual(castCall('bb_results_csv', { p_cycle_id: spring.id }, STAFF), { status: 'not_allowed' });
  const downloadsBefore = db().bb_downloads.length;
  assert.deepEqual(castCall('bb_results_csv', { p_cycle_id: randomUUID() }), { status: 'not_found' });
  assert.equal(db().bb_downloads.length, downloadsBefore, 'a refused call writes nothing');
  const csv = castCall('bb_results_csv', { p_cycle_id: spring.id });
  assert.equal(csv.rows.length, 10);
  assert.equal(db().bb_downloads.length, downloadsBefore + 1);
  assert.equal(db().bb_downloads.at(-1).row_count, 10);
  assert.deepEqual(Object.keys(csv.rows[0]).sort(), ['candidate_id', 'date_of_birth', 'dan', 'email_for_results', 'extra_total', 'first_name', 'kukkiwon',
    'last_name', 'location_code', 'makeup_of_cycle_name', 'money', 'parts', 'pass_bracket', 'pass_mark', 'plan_name', 'result', 'result_status', 'sent', 'total'].sort());
  const csvRina = csv.rows.find((r) => r.first_name === 'Rina');
  assert.deepEqual([csvRina.date_of_birth, csvRina.email_for_results], [null, null]);
  assert.equal(csv.rows.find((r) => r.first_name === 'Alex').date_of_birth, '2012-03-04');
  assert.equal(csv.rows[0].money.items, undefined);
  assert.equal(csvRows(csv).length, 11);
  setDay('2027-06-09');
  const csv2 = castCall('bb_results_csv', { p_cycle_id: spring.id });
  assert.equal(csv2.rows.find((r) => r.first_name === 'Rina').date_of_birth, '1997-04-30');
});

check('grading store: has_grades — Q-G1 (locked for good), Q-G3 (delete), Q-G4 (Dan change + clear), S2 (Edit cycle)', () => {
  loadCast();
  const spring = springCycle();
  const fall = fallCycle();
  // Q-G1: Fall 2027 was never opened, but its make-up's kept rows started grading → the copy is locked for good
  const st0 = castCall('bb_cycle_grading_state', { p_cycle_id: fall.id }, STAFF);
  assert.deepEqual(Object.keys(st0).sort(), ['first_day', 'first_day_frozen', 'grading_started_at', 'has_grading', 'parts_with_grades', 'protected_days', 'status']);
  assert.ok(st0.grading_started_at);
  const rev = db().bb_cycles.find((c) => c.id === fall.id).requirements.dans[0].rev;
  const sheet = db().bb_cycles.find((c) => c.id === fall.id).requirements.dans[0];
  const save = castCall('bb_save_cycle_dan', { p_cycle_id: fall.id, p_dan: 1, p_expected_rev: rev, p_sheet: sheet });
  assert.deepEqual(save, { status: 'has_grades', grading_started_at: st0.grading_started_at });
  assert.deepEqual(castCall('bb_undo_cycle_dan', { p_cycle_id: fall.id, p_dan: 1, p_expected_rev: rev }), { status: 'has_grades', grading_started_at: st0.grading_started_at });
  // …and stays locked after the make-up's Undo (admin delete) removes every grading row
  const mk = castRow('Mia', 'Chen', fall);
  assert.deepEqual(castCall('bb_delete_candidate', { p_candidate_id: mk.id, p_expected_version: mk.version }), { status: 'ok' });
  assert.equal(castCall('bb_cycle_grading_state', { p_cycle_id: fall.id }, STAFF).has_grading, false);
  assert.equal(castCall('bb_cycle_grading_state', { p_cycle_id: fall.id }, STAFF).grading_started_at, st0.grading_started_at);
  assert.equal(castCall('bb_save_cycle_dan', { p_cycle_id: fall.id, p_dan: 1, p_expected_rev: rev, p_sheet: sheet }).status, 'has_grades');
  // Q-G3: Delete permanently / Delete cycle with real grades → has_grades
  const alex = castRow('Alex', 'Kim');
  assert.deepEqual(castCall('bb_delete_candidate', { p_candidate_id: alex.id, p_expected_version: alex.version }), { status: 'has_payments' }); // (payments first, as 0016)
  const s = db();
  const lucas = s.bb_candidates.find((c) => c.first_name === 'Lucas');
  s.bb_payments = s.bb_payments.filter((p) => p.candidate_id !== lucas.id);
  saved = s;
  assert.deepEqual(castCall('bb_delete_candidate', { p_candidate_id: lucas.id, p_expected_version: lucas.version }), { status: 'has_grades' });
  const roster = castCall('bb_cycle_roster', { p_cycle_id: spring.id }, STAFF);
  assert.ok(roster.rows.filter((r) => r.status === 'active').every((r) => r.has_grades));
  // Q-G4: a Dan change with grades → has_grades + counts, nothing written; _clear with the right counts clears
  const ava = castRow('Ava', 'Brooks');
  const edit = (dan, extra = {}, name = 'bb_update_candidate', ctx = ADMIN) => castCall(name, {
    p_candidate_id: ava.id, p_expected_version: db().bb_candidates.find((c) => c.id === ava.id).version, p_first: 'Ava', p_last: 'Brooks',
    p_date_of_birth: ava.date_of_birth, p_email: ava.email_for_results, p_location_code: ava.location_code, p_dan: dan, ...extra,
  }, ctx);
  const refused = edit(3);
  assert.deepEqual(refused, { status: 'has_grades', grade_count: 27, count_count: 5, chosen_count: 0 });
  assert.equal(db().bb_candidates.find((c) => c.id === ava.id).dan, 2, 'nothing written');
  assert.equal(edit(2).status, 'ok'); // no Dan change: fine
  const clr = (n) => edit(3, { p_expected_grade_count: n[0], p_expected_count_count: n[1], p_expected_chosen_count: n[2] }, 'bb_update_candidate_clear');
  assert.deepEqual(clr([27, 5, null]), { status: 'invalid' });
  assert.deepEqual(clr([27, -1, 0]), { status: 'invalid' });
  assert.deepEqual(clr([26, 5, 0]), { status: 'has_grades', grade_count: 27, count_count: 5, chosen_count: 0 });
  const done = clr([27, 5, 0]);
  assert.deepEqual([done.status, done.cleared], ['ok', { grades: 27, counts: 5, chosen: 0 }]);
  assert.deepEqual(Object.keys(done).sort(), ['cleared', 'needs_parent_signature', 'status', 'version']);
  assert.equal(db().bb_candidates.find((c) => c.id === ava.id).dan, 3);
  assert.equal(db().bb_grades.filter((g) => g.candidate_id === ava.id).length, 0);
  assert.deepEqual(castCall('bb_set_grade', { p_candidate_id: ava.id, p_dan: 2, p_subject_id: subjectId(2, 'Referee seminar'), p_letter: 'A' }, STAFF), { status: 'stale' }); // the stale tablet
  // a make-up row's Dan never changes; an earlier row with an active make-up → already_added
  loadCast();
  const mia = castRow('Mia', 'Chen');
  const miaFall = castRow('Mia', 'Chen', fallCycle());
  const editRow = (row, dan, name = 'bb_update_candidate', extra = {}) => castCall(name, {
    p_candidate_id: row.id, p_expected_version: row.version, p_first: row.first_name, p_last: row.last_name, p_date_of_birth: row.date_of_birth,
    p_email: row.email_for_results, p_location_code: row.location_code, p_dan: dan, ...extra,
  });
  assert.deepEqual(editRow(miaFall, 2), { status: 'invalid' });
  assert.deepEqual(editRow(mia, 2), { status: 'already_added' });
  assert.deepEqual(editRow(mia, 2, 'bb_update_candidate_clear', { p_expected_grade_count: 26, p_expected_count_count: 6, p_expected_chosen_count: 0 }), { status: 'already_added' });
  // Restore of a withdrawn make-up while another is active → already_added
  const w = castCall('bb_withdraw_candidate', { p_candidate_id: miaFall.id, p_expected_version: miaFall.version });
  assert.equal(w.status, 'ok');
  setDay('2027-09-01');
  const again = castCall('bb_add_makeup', { p_cycle_id: fallCycle().id, p_earlier_candidate_id: mia.id }, STAFF);
  assert.equal(again.status, 'ok');
  assert.deepEqual(castCall('bb_restore_candidate', { p_candidate_id: miaFall.id, p_expected_version: w.version }), { status: 'already_added' });
  // S2: Edit cycle can't move a past graded day, untick its part, or move the first day once grading started
  loadCast();
  setDay('2027-06-09');
  const { form } = editForm(springCycle().id);
  const original = JSON.parse(JSON.stringify(form));
  const upd = (f) => castCall('bb_update_cycle', { p_cycle_id: springCycle().id, p_expected_version: springCycle().version, p_payload: buildUpdatePayload(f) });
  form.days[1].date = '2027-06-12'; // Technical (May 1, graded) moved
  assert.deepEqual(upd(form), { status: 'has_grades' });
  const f2 = JSON.parse(JSON.stringify(original));
  f2.days[0].date = '2027-06-19'; // the first day (graded, past) moved
  assert.deepEqual(upd(f2), { status: 'has_grades' });
  const f4 = JSON.parse(JSON.stringify(original));
  f4.days[2].parts = ['curriculum', 'technical']; // a part added to a past day: fine (only removing is refused)
  f4.days[1].parts = ['technical'];
  assert.equal(upd(f4).status, 'ok');
  assert.deepEqual(upd(original), { status: 'has_grades' }); // …but taking that part off a past day again is refused (technical has grades)
  const f3 = editForm(springCycle().id).form;
  f3.days.push({ ...JSON.parse(JSON.stringify(f3.days[0])), id: null, name: 'Make-up day', date: '2027-06-19', parts: ['technical'] });
  assert.equal(castCall('bb_update_cycle', { p_cycle_id: springCycle().id, p_expected_version: springCycle().version, p_payload: buildUpdatePayload(f3) }).status, 'ok'); // a later new day is fine
  const gs = castCall('bb_cycle_grading_state', { p_cycle_id: springCycle().id }, STAFF);
  assert.deepEqual([gs.has_grading, gs.first_day, gs.first_day_frozen, gs.parts_with_grades], [true, '2027-04-03', true, ['physical', 'technical', 'curriculum', 'other']]);
  assert.deepEqual(gs.protected_days.map((d) => d.day_date), ['2027-04-03', '2027-05-01', '2027-06-05']);
  assert.deepEqual(castCall('bb_cycle_results', { p_cycle_id: springCycle().id, p_dan: 2 }, STAFF).rubrics.map((d) => d.dan), [2]); // the requested Dan only
  // Delete cycle: has_grades (after has_payments / has_waivers, as 0016)
  const fall2 = fallCycle();
  const st = db();
  st.bb_payments = st.bb_payments.filter((p) => p.cycle_id !== fall2.id);
  st.bb_candidate_waivers = st.bb_candidate_waivers.filter((x) => !st.bb_candidates.some((c) => c.id === x.candidate_id && c.cycle_id === fall2.id));
  const miaF = st.bb_candidates.find((c) => c.cycle_id === fall2.id && c.source === 'makeup');
  st.bb_grades.push({ ...st.bb_grades.find((g) => g.candidate_id === miaF.id), id: randomUUID(), subject_id: subjectId(1, 'Free sparring'), letter: 'B', kept: false, kept_from_cycle_id: null, kept_from_cycle_name: null });
  saved = st;
  assert.deepEqual(castCall('bb_delete_cycle', { p_cycle_id: fall2.id, p_expected_version: fall2.version, p_expected_candidate_count: st.bb_candidates.filter((c) => c.cycle_id === fall2.id).length }), { status: 'has_grades' });
});

check('grading store: the purge keeps the age (age_kept) and the result; a purge day is the latest of the make-up chain', () => {
  loadCast();
  // Mia's Spring row: her own purge day is Spring's last day + 3 years; her Fall make-up's is later
  const mia = castRow('Mia', 'Chen');
  setDay('2030-06-10'); // after Spring's purge day (2030-06-05), before Fall's (2030-11-20)
  const res = castCall('bb_cycle_results', { p_cycle_id: springCycle().id, p_dan: 1 }, STAFF); // a read: no purge
  assert.equal(res.rows.find((r) => r.id === mia.id).has_email, true, "the chain keeps Mia's details as long as her make-up's");
  castCall('bb_cycle_roster', { p_cycle_id: springCycle().id }, STAFF); // runs the purge
  const rina = db().bb_candidates.find((c) => c.first_name === 'Rina' && c.cycle_id === springCycle().id);
  assert.deepEqual([rina.date_of_birth, rina.email_for_results, rina.age_kept], [null, null, 29]);
  assert.equal(db().bb_candidates.find((c) => c.id === mia.id).date_of_birth, '1995-02-11');
  const after = castCall('bb_cycle_results', { p_cycle_id: springCycle().id, p_dan: 1 }, STAFF);
  assert.equal(after.rows.find((r) => r.first_name === 'Rina').result.total, 252.5, 'the result stays exact');
  assert.deepEqual(after.rows.find((r) => r.first_name === 'Rina').result.reasons, ['d', 'below']);
  const detail = castCall('bb_candidate_detail', { p_candidate_id: rina.id }, STAFF);
  assert.equal(detail.candidate.age_on_first_day, null); // never from age_kept
  assert.ok(!JSON.stringify(detail).includes('age_kept'));
});

check('grading store: failNextSave covers the new writes; simulateOtherAdminEdit changes one grade', () => {
  loadCast();
  for (const name of ['bb_set_grade', 'bb_set_measured', 'bb_set_extra_count', 'bb_set_makeup_subjects', 'bb_add_makeup', 'bb_mark_result_sent',
    'bb_undo_result_sent', 'bb_set_result_text', 'bb_update_candidate_clear', 'bb_results_csv']) {
    assert.ok(BB_WRITE_RPC_NAMES.includes(name), name);
  }
  backend.failNextSave();
  const lucas = castRow('Lucas', 'Ferreira');
  const r = backend.rpc('bb_set_grade', { p_candidate_id: lucas.id, p_dan: 1, p_subject_id: subjectId(1, 'Free sparring'), p_letter: 'A' }, STAFF);
  assert.equal(r.data, null);
  const before = JSON.stringify(db().bb_grades.map((g) => g.letter));
  backend.simulateOtherAdminEdit();
  assert.notEqual(JSON.stringify(db().bb_grades.map((g) => g.letter)), before);
  assert.equal(backend.rpc('bb_cycle_results', { p_cycle_id: springCycle().id, p_dan: null }, STAFF, { get: true }).error, null); // a read may be a GET
  assert.equal(backend.rpc('bb_results_csv', { p_cycle_id: springCycle().id }, ADMIN, { get: true }).error.code, '25006'); // it writes
});

// =====================================================================================
// ======================= Migration 0032: history and Edit cycle's Undo in one call =======================
// =====================================================================================

// No login id, send id or earlier-row id key anywhere in a text (bb_history_strip's list + the
// change_log columns the reader never answers).
const HISTORY_SECRET_KEYS = /"(created_by|updated_by|withdrawn_by|recorded_by|marked_by|undone_by|submission_id|makeup_of_candidate_id|actor_id|session_id|batch_id)"/;

check('0032 store: bb_candidate_history — masks, own rows only, newest first, who may read it', () => {
  backend.loadSample();
  setDay('2027-02-15');
  const spring = db().bb_cycles.find((c) => c.name === 'Spring 2027');
  const full = db().bb_cycle_plans.find((p) => p.cycle_id === spring.id && p.name === 'In full').id;
  // a desk candidate with a date of birth, an email and a paper waiver; a date-of-birth change;
  // a payment and its undo
  const added = call('bb_add_candidate', {
    p_cycle_id: spring.id, p_first: 'Kim', p_last: 'Zzhistory', p_date_of_birth: '1990-01-01', p_email: 'kim.zz@example.com',
    p_location_code: 'worcester', p_dan: 1, p_cycle_plan_id: full, p_kukkiwon: false, p_paper_waiver: true,
  }, STAFF);
  assert.equal(added.status, 'ok');
  const kim = added.id;
  const kimVersion = () => db().bb_candidates.find((c) => c.id === kim).version;
  assert.equal(call('bb_update_candidate', {
    p_candidate_id: kim, p_expected_version: kimVersion(), p_first: 'Kim', p_last: 'Zzhistory', p_date_of_birth: '1989-03-03',
    p_email: 'kim.zz@example.com', p_location_code: 'worcester', p_dan: 1,
  }).status, 'ok');
  const paid = call('bb_record_payment', { p_candidate_id: kim, p_expected_version: kimVersion(), p_amount_cents: 1000, p_method: 'cash', p_for_items: ['p1'], p_note: null }, STAFF);
  assert.equal(paid.status, 'ok');
  assert.equal(call('bb_undo_payment', { p_payment_id: paid.payment_id }, STAFF).status, 'ok');
  // a family registers through the form (drawn waiver)
  const fam = backend.publicRegister(regInput(spring.public_code_worcester, full, { first: 'Fay', last: 'Zzfamily', email: 'fay.zz@example.com' }));
  assert.equal(fam.status, 'ok');
  const fay = db().bb_candidates.find((c) => c.reference === fam.reference).id;

  const h = call('bb_candidate_history', { p_candidate_id: kim }, STAFF);
  assert.equal(h.status, 'ok');
  assert.deepEqual(Object.keys(h).sort(), ['rows', 'status']);
  for (const row of h.rows) assert.deepEqual(Object.keys(row).sort(), ['action', 'actor_name', 'after', 'before', 'occurred_at', 'op', 'record_id', 'table_name']);
  // 0034: record_id = the logged row's own id (the candidate's for her own rows; an insert row's id
  // for a child row) — and no other candidate's id
  for (const row of h.rows) {
    assert.equal(typeof row.record_id, 'string');
    if (row.table_name === 'bb_candidates') assert.equal(row.record_id, kim);
    if (row.op === 'insert' && row.after?.id) assert.equal(row.record_id, row.after.id);
  }
  const text = JSON.stringify(h);
  for (const secret of ['1990-01-01', '1989-03-03', 'kim.zz@example.com', 'Zzfamily', fay, 'u1', 'u2']) assert.ok(!text.includes(secret), secret);
  assert.ok(!HISTORY_SECRET_KEYS.test(text), 'a removed key in the history');
  // exactly Kim's own rows: her insert and update(s), the waiver, the payment and its reversal
  const tables = new Set(h.rows.map((r) => r.table_name));
  assert.deepEqual([...tables].sort(), ['bb_candidate_waivers', 'bb_candidates', 'bb_payments']);
  const own = db().change_log.filter((l) => (l.table_name === 'bb_candidates' && l.record_id === kim)
    || (l.table_name !== 'bb_candidates' && [...db().bb_payments, ...db().bb_candidate_waivers].some((x) => x.id === l.record_id && x.candidate_id === kim)));
  assert.equal(h.rows.length, own.length);
  assert.ok(h.rows.some((r) => r.table_name === 'bb_payments' && r.after?.reverses_payment_id === paid.payment_id), 'the reversal row');
  // the date-of-birth change: "on file" → "changed"; the insert: the names, the email "on file"
  assert.ok(h.rows.some((r) => r.op === 'update' && r.before?.date_of_birth === 'on file' && r.after?.date_of_birth === 'changed'));
  const insert = h.rows[h.rows.length - 1];
  assert.deepEqual([insert.table_name, insert.op, insert.after.first_name, insert.after.email_for_results, insert.actor_name, insert.action],
    ['bb_candidates', 'insert', 'Kim', 'on file', 'Staff', 'bb_add_candidate']);
  // newest first (same moment → the later row first)
  assert.equal(h.rows[0].table_name, 'bb_payments');
  assert.equal(h.rows[0].action, 'bb_undo_payment');
  // the family: the drawn waiver "on file", no signature, signer or send id; "Family form"
  const hf = call('bb_candidate_history', { p_candidate_id: fay }, ADMIN);
  const ftext = JSON.stringify(hf);
  for (const secret of ['data:image', 'Jordan Testparent', 'fay.zz@example.com', '2010-05-01', kim]) assert.ok(!ftext.includes(secret), secret);
  assert.ok(!HISTORY_SECRET_KEYS.test(ftext));
  assert.ok(hf.rows.some((r) => r.table_name === 'bb_candidate_waivers' && r.op === 'insert' && r.after.signature === 'on file'
    && r.after.signer_name === 'on file' && r.after.how === 'drawn' && r.actor_name === 'Family form'));
  // the samples' own candidates have their insert rows too
  const alex = db().bb_candidates.find((c) => c.first_name === 'Alex' && c.last_name === 'Kim').id;
  const ha = call('bb_candidate_history', { p_candidate_id: alex });
  assert.ok(ha.rows.some((r) => r.table_name === 'bb_candidates' && r.op === 'insert'));
  assert.ok(!JSON.stringify(ha).includes('alex.kim@example.com') && !JSON.stringify(ha).includes('1990-06-12'));
  // who may read it, and the order of the checks
  assert.deepEqual(call('bb_candidate_history', { p_candidate_id: kim }, LOCKED), { status: 'no_access' });
  assert.deepEqual(call('bb_candidate_history', { p_candidate_id: null }, LOCKED), { status: 'no_access' });
  assert.deepEqual(call('bb_candidate_history', { p_candidate_id: null }, STAFF), { status: 'invalid' });
  assert.deepEqual(call('bb_candidate_history', { p_candidate_id: randomUUID() }, STAFF), { status: 'not_found' });
  assert.equal(backend.rpc('bb_history_strip', { p_row: {} }, ADMIN).error.code, '42501'); // nobody may call the helper
  assert.equal(backend.rpc('bb_candidate_history', { p_candidate_id: kim }, ADMIN, { get: true }).error, null); // a read may be a GET
  // a candidate removed for good → not_found
  const zed = call('bb_add_candidate', {
    p_cycle_id: spring.id, p_first: 'Zed', p_last: 'Zzremoved', p_date_of_birth: '1990-01-01', p_email: 'zed.zz@example.com',
    p_location_code: 'worcester', p_dan: 1, p_cycle_plan_id: full, p_kukkiwon: false, p_paper_waiver: true,
  }, ADMIN).id;
  assert.equal(call('bb_delete_candidate', { p_candidate_id: zed, p_expected_version: 1 }).status, 'ok');
  assert.deepEqual(call('bb_candidate_history', { p_candidate_id: zed }), { status: 'not_found' });
  // the change log is never readable as a table
  assert.ok(!BB_TABLES.includes('change_log'));
});

// ----- BB8: the History line's words (src/blackBelt/staff/candidates/historyWords.js, v0.971 / v0.972) -----

// A history row as api.js hands it to the screens (camelCase around the snake_case before / after).
const historyRowOf = (r) => ({
  occurredAt: r.occurred_at, actorName: r.actor_name, action: r.action, tableName: r.table_name, op: r.op,
  before: r.before ?? null, after: r.after ?? null, recordId: typeof r.record_id === 'string' ? r.record_id : null,
});
// The words of a list of history rows, newest first (null lines left out).
const historyTexts = (rows, ctx) => groupHistory(rows).map((e) => describeEntry(e, ctx)).filter(Boolean).map((w) => w.text ?? w);

check('BB8 words: grades, counts, batches, money, the candidate row (synthetic rows)', () => {
  const rubric = DEFAULT_RUBRIC;
  const push = subjectId(1, 'Push-up (1 min)');
  const free = subjectId(1, 'Free sparring');
  const mile = subjectId(1, '1/2 or 1 mile');
  const pull = subjectId(1, 'Pull-up or hold');
  let n = 0;
  // one row; `at` = its moment (rows are written oldest first here, then reversed like the reader)
  const r = (tableName, op, before, after, extra = {}) => ({ occurredAt: `2027-03-${String(10 + (n += 1)).padStart(2, '0')}T15:00:00Z`, actorName: 'Jeffrey Berg', action: 'x', tableName, op, before, after, recordId: null, ...extra });
  const words = (rows, ctx = { rubric }) => historyTexts([...rows].reverse(), ctx);
  const one = (row, ctx) => words([row], ctx)[0];

  // grades: insert / update / delete, the Grading tab's number formats, two ways, no subject name
  const gIns = r('bb_grades', 'insert', null, { id: 'g1', dan: 1, subject_id: push, letter: null, measured: 28, way: 0, kept: false }, { recordId: 'g1' });
  const gUpd = r('bb_grades', 'update', { measured: 28, version: 1 }, { measured: 32, version: 2 }, { recordId: 'g1' });
  assert.deepEqual(words([gIns, gUpd]), ['Grade changed: Push-up (1 min) 28 → 32', 'Graded: Push-up (1 min) 28']);
  // before 0034 (no record id): the change without its subject; the insert still names it
  assert.deepEqual(words([{ ...gIns, recordId: null }, { ...gUpd, recordId: null }]), ['Grade changed: 28 → 32', 'Graded: Push-up (1 min) 28']);
  // the insert past the 500 rows: no subject either
  assert.equal(one(gUpd), 'Grade changed: 28 → 32');
  const lIns = r('bb_grades', 'insert', null, { id: 'g2', dan: 1, subject_id: free, letter: 'B', measured: null, way: null, kept: false }, { recordId: 'g2' });
  const lUpd = r('bb_grades', 'update', { letter: 'B' }, { letter: 'B+' }, { recordId: 'g2' });
  const lDel = r('bb_grades', 'delete', { id: 'g2', dan: 1, subject_id: free, letter: 'B+', measured: null, way: null, kept: false }, null, { recordId: 'g2' });
  assert.deepEqual(words([lIns, lUpd, lDel]), ['Grade cleared: Free sparring (was B+)', 'Grade changed: Free sparring · B → B+', 'Graded: Free sparring · B']);
  assert.equal(one(r('bb_grades', 'insert', null, { dan: 1, subject_id: mile, letter: null, measured: 2.1667, way: 0 })), 'Graded: 1/2 or 1 mile 2:10');
  assert.equal(one(r('bb_grades', 'insert', null, { dan: 1, subject_id: pull, letter: null, measured: 31, way: 1 })), 'Graded: Pull-up or hold · Hold 31');
  // the way switched (Pull-up 5 → Hold 31): the old value in the old way's words
  const wIns = r('bb_grades', 'insert', null, { id: 'g3', dan: 1, subject_id: pull, letter: null, measured: 5, way: 0 }, { recordId: 'g3' });
  const wUpd = r('bb_grades', 'update', { measured: 5, way: 0 }, { measured: 31, way: 1 }, { recordId: 'g3' });
  assert.equal(words([wIns, wUpd])[0], 'Grade changed: Pull-up or hold · Pull-up 5 → Hold 31');
  // a possible duplicate cleared: "kept this" only from the duplicate choice itself; Withdraw (status
  // changes in the same row) and the re-check after an edit add no duplicate words
  const dup = (action, extraAfter = {}, extraBefore = {}) => one(r('bb_candidates', 'update',
    { duplicate_state: 'possible', ...extraBefore }, { duplicate_state: 'none', ...extraAfter }, { action }));
  assert.equal(dup('bb_resolve_duplicate'), 'Possible duplicate: kept this registration');
  assert.equal(dup('bb_withdraw_candidate', { status: 'withdrawn', withdrawn_reason: 'withdrawn' }, { status: 'active' }), 'Withdrawn');
  assert.equal(dup('bb_resolve_duplicate', { status: 'withdrawn', withdrawn_reason: 'duplicate_copy' }, { status: 'active' }), 'Moved to Removed as a duplicate copy');
  assert.equal(dup('bb_update_candidate'), undefined);
  // a subject the rubric doesn't have; no rubric at all (the read failed) → no subject, never an error
  assert.equal(one(r('bb_grades', 'insert', null, { dan: 1, subject_id: 'zzzzzzzz', letter: 'B+' })), 'Graded: a subject · B+');
  assert.equal(one(r('bb_grades', 'insert', null, { dan: 1, subject_id: free, letter: 'B+' }), { rubric: null }), 'Graded: B+');
  assert.equal(one(lDel, { rubric: null }), 'Grade cleared (was B+)');
  // an update that only moved the version says nothing
  assert.equal(one(r('bb_grades', 'update', { version: 1 }, { version: 2 }, { recordId: 'g9' })), undefined);

  // extra-points counts (the same rule, with the item's name)
  const cIns = r('bb_extra_counts', 'insert', null, { id: 'c1', dan: 1, item_name: 'Competitions', count: 3, kept: false }, { recordId: 'c1' });
  const cUpd = r('bb_extra_counts', 'update', { count: 3 }, { count: 4 }, { recordId: 'c1' });
  const cDel = r('bb_extra_counts', 'delete', { id: 'c1', dan: 1, item_name: 'Competitions', count: 4, kept: false }, null, { recordId: 'c1' });
  assert.deepEqual(words([cIns, cUpd, cDel]), ['Extra points cleared: Competitions (was 4)', 'Extra points: Competitions 3 → 4', 'Extra points: Competitions 3']);
  assert.equal(one({ ...cUpd, recordId: null }), 'Extra points: 3 → 4');

  // make-up subjects (chosen: added / removed)
  assert.equal(one(r('bb_makeup_subjects', 'insert', null, { dan: 1, subject_id: free, kind: 'chosen' })), 'Make-up subject added: Free sparring');
  assert.equal(one(r('bb_makeup_subjects', 'delete', { dan: 1, subject_id: free, kind: 'chosen' }, null)), 'Make-up subject removed: Free sparring');

  // BATCH 1: a Dan change that clears the grades = ONE line (the deletes carry the clear's tag)
  const at = '2027-04-01T15:00:00Z';
  const dan = [
    ...[push, free, mile].map((s, i) => ({ ...r('bb_grades', 'delete', { id: `d${i}`, dan: 1, subject_id: s, letter: 'B', kept: false }, null), occurredAt: at, action: 'bb_clear_dan_grading' })),
    { ...r('bb_extra_counts', 'delete', { dan: 1, item_name: 'Competitions', count: 3, kept: false }, null), occurredAt: at, action: 'bb_clear_dan_grading' },
    { ...r('bb_candidates', 'update', { dan: 1, version: 3 }, { dan: 2, version: 4 }), occurredAt: at, action: 'bb_update_candidate' },
  ];
  assert.deepEqual(words(dan), ['Dan: 1st → 2nd Dan · 3 grades cleared · 1 extra-points count cleared']);
  assert.equal(one(r('bb_candidates', 'update', { dan: 1 }, { dan: 2 })), 'Dan: 1st → 2nd Dan');

  // BATCH 2: Add make-up — the make-up row + its kept grades / count + retest subjects = ONE line
  const at2 = '2027-09-01T15:00:00Z';
  const mk = [
    { ...r('bb_candidates', 'insert', null, { source: 'makeup', makeup_of_cycle_name: 'Spring 2027', first_name: 'Mia', dan: 1 }), occurredAt: at2, action: 'bb_add_makeup' },
    ...[free, push].map((s) => ({ ...r('bb_grades', 'insert', null, { dan: 1, subject_id: s, letter: 'A', kept: true, kept_from_cycle_name: 'Spring 2027' }), occurredAt: at2, action: 'bb_add_makeup' })),
    { ...r('bb_extra_counts', 'insert', null, { dan: 1, item_name: 'Competitions', count: 2, kept: true }), occurredAt: at2, action: 'bb_add_makeup' },
    { ...r('bb_makeup_subjects', 'insert', null, { dan: 1, subject_id: mile, kind: 'retest' }), occurredAt: at2, action: 'bb_add_makeup' },
  ];
  assert.deepEqual(words(mk), ['Added as a make-up from Spring 2027 · 2 kept grades copied · 1 kept extra-points count copied']);

  // money: payments, refunds, undos, returned checks; Edit payment (BATCH 3) = one line; "$870" as the page
  const pay = r('bb_payments', 'insert', null, { id: 'p1', kind: 'payment', amount_cents: 87000, method: 'card', paid_on: '2027-03-20' });
  const at3 = '2027-03-25T15:00:00Z';
  const edit = [
    { ...r('bb_payments', 'insert', null, { id: 'p2', kind: 'reversal', amount_cents: -87000, method: 'card', paid_on: '2027-03-20', reverses_payment_id: 'p1' }), occurredAt: at3, action: 'bb_edit_payment' },
    { ...r('bb_payments', 'insert', null, { id: 'p3', kind: 'payment', amount_cents: 90000, method: 'check', paid_on: '2027-03-21' }), occurredAt: at3, action: 'bb_edit_payment' },
  ];
  assert.deepEqual(words([pay, ...edit]), ['Payment changed: $900 check, paid Mar 21', 'Payment recorded: $870 card, paid Mar 20']);
  const undo = r('bb_payments', 'insert', null, { id: 'p4', kind: 'reversal', amount_cents: -87000, method: 'card', paid_on: '2027-03-26', reverses_payment_id: 'p1' });
  assert.equal(words([pay, undo])[0], 'Payment undone: $870');
  assert.equal(one(r('bb_payments', 'insert', null, { kind: 'refund', amount_cents: -5000, method: 'cash', paid_on: '2027-03-22' })), 'Refund recorded: $50 cash, Mar 22');
  const ret = r('bb_payments', 'insert', null, { id: 'p5', kind: 'returned', amount_cents: -87000, method: 'check', paid_on: '2027-03-27', reverses_payment_id: 'p1' });
  const retUndo = r('bb_payments', 'insert', null, { id: 'p6', kind: 'reversal', amount_cents: 87000, method: 'check', paid_on: '2027-03-28', reverses_payment_id: 'p5' });
  assert.deepEqual(words([pay, ret, retUndo]).slice(0, 2), ['Returned check undone: $870', 'Check returned: $870']);
  assert.equal(one(r('bb_payments', 'insert', null, { kind: 'payment', amount_cents: 29050, method: 'cash', paid_on: '2027-03-20' })), 'Payment recorded: $290.50 cash, paid Mar 20');
  // hidden: every money row is left out (counted for the gray line), and so are the plan and
  // Kukkiwon lines (PROPOSAL, step 1 mockup: v0.972 kept them; v1.036 hides the plan)
  const plansCtx = { rubric, plans: [{ id: 'pl1', name: 'In full' }, { id: 'pl3', name: '3 payments' }] };
  const hiddenCtx = { ...plansCtx, hidden: true };
  const described = (row, ctx) => groupHistory([row]).map((e) => describeEntry(e, ctx))[0];
  assert.deepEqual(groupHistory([...edit].reverse()).map((e) => describeEntry(e, hiddenCtx)), [{ hiddenPayment: true }]);
  const planRow = r('bb_candidates', 'update', { cycle_plan_id: 'pl1', version: 2 }, { cycle_plan_id: 'pl3', version: 3 });
  const kukRow = r('bb_candidates', 'update', { kukkiwon: false, kukkiwon_added_on: null }, { kukkiwon: true, kukkiwon_added_on: '2027-03-01' });
  assert.deepEqual(described(planRow, hiddenCtx), { hiddenPayment: true });
  assert.deepEqual(described(kukRow, hiddenCtx), { hiddenPayment: true });
  // switch off: the plan and Kukkiwon lines come back exactly as before
  assert.equal(one(planRow, plansCtx), 'Plan: In full → 3 payments');
  assert.equal(one(kukRow, plansCtx), 'Kukkiwon certificate added');
  // one change that also changed something else keeps its other words, without the plan
  const mixed = r('bb_candidates', 'update', { first_name: 'Mia', cycle_plan_id: 'pl1' }, { first_name: 'Mya', cycle_plan_id: 'pl3' });
  assert.equal(one(mixed, hiddenCtx), 'First name: Mia → Mya');
  assert.equal(one(mixed, plansCtx), 'First name: Mia → Mya; Plan: In full → 3 payments');
  // other candidate lines still show while hidden
  assert.equal(one(r('bb_candidates', 'update', { dan: 1 }, { dan: 2 }), hiddenCtx), 'Dan: 1st → 2nd Dan');

  // the candidate row: registered, edits joined with "; ", DOB and email only "changed", the purge, states
  const form = one(r('bb_candidates', 'insert', null, { source: 'form' }, { actorName: 'Family form' }), { rubric });
  assert.equal(form, 'Registered on the family form');
  const formEntry = groupHistory([r('bb_candidates', 'insert', null, { source: 'form' }, { actorName: 'Family form' })]).map((e) => describeEntry(e, {}))[0];
  assert.equal(formEntry.who, 'Family form');
  assert.equal(groupHistory([r('bb_candidates', 'insert', null, { source: 'desk' }, { actorName: null })]).map((e) => describeEntry(e, {}))[0].who, 'Staff');
  assert.equal(one(r('bb_candidates', 'insert', null, { source: 'desk' })), 'Added at the desk');
  assert.equal(one(r('bb_candidates', 'update', { first_name: 'Mia', location_code: 'worcester', version: 1, updated_at: 'x', updated_by_name: 'A' }, { first_name: 'Mya', location_code: 'shrewsbury', version: 2, updated_at: 'y', updated_by_name: 'B' })),
    'First name: Mia → Mya; School: Worcester → Shrewsbury');
  assert.equal(one(r('bb_candidates', 'update', { date_of_birth: 'on file', email_for_results: 'on file' }, { date_of_birth: 'changed', email_for_results: 'changed' })), 'Date of birth changed; Email for results changed');
  assert.equal(one(r('bb_candidates', 'update', { date_of_birth: 'on file', email_for_results: 'on file', personal_removed_at: null, version: 2 }, { date_of_birth: null, email_for_results: null, personal_removed_at: '2031-01-01T00:00:00Z', version: 3 })),
    'Date of birth and email removed (after the keeping time)');
  assert.equal(one(r('bb_candidates', 'update', { version: 1 }, { version: 2 })), undefined); // a payment's version bump
  assert.equal(one(r('bb_candidates', 'update', { status: 'active', withdrawn_reason: null }, { status: 'withdrawn', withdrawn_reason: 'withdrawn' })), 'Withdrawn');
  assert.equal(one(r('bb_candidates', 'update', { status: 'active' }, { status: 'withdrawn', withdrawn_reason: 'duplicate_copy' })), 'Moved to Removed as a duplicate copy');
  assert.equal(one(r('bb_candidates', 'update', { status: 'withdrawn' }, { status: 'active' })), 'Restored');
  assert.equal(one(r('bb_candidates', 'update', { duplicate_state: 'none' }, { duplicate_state: 'possible' })), 'Possible duplicate found');
  // the waiver, the result email
  assert.equal(one(r('bb_candidate_waivers', 'insert', null, { how: 'drawn', signature: 'on file', signer_name: 'on file' })), 'Waiver signed on the family form');
  assert.equal(one(r('bb_candidate_waivers', 'insert', null, { how: 'paper' })), 'Waiver signed on paper');
  assert.equal(one(r('bb_candidate_waivers', 'update', { signature: 'on file', removed_at: null }, { signature: null, removed_at: '2031-01-01' })), 'Signature removed (after the keeping time)');
  assert.equal(one(r('bb_result_sends', 'insert', null, { result_status: 'makeup' })), 'Result email marked sent (Make-up)');
  assert.equal(one(r('bb_result_sends', 'insert', null, { result_status: 'passed' })), 'Result email marked sent (Passed)');
  assert.equal(one(r('bb_result_sends', 'update', { undone_at: null }, { undone_at: '2027-06-12T15:00:00Z' })), 'Mark as sent undone');
  // rows of other shapes never break the list
  assert.deepEqual(groupHistory(null), []);
  assert.deepEqual(historyTexts([null, { tableName: 'bb_other', op: 'insert' }], {}), []);
});

// R4-04 (v1.037): Edit details while private details are hidden saves the STORED date of birth and
// email (they can't be seen or changed), and staff's stored Dan; switch off: exactly as typed.
check('R4-04 Edit details while hidden: what Save sends', () => {
  const initial = { first: 'Mia', last: 'Chen', dob: '2012-03-04', email: 'mia@example.com', school: 'worcester', dan: 1 };
  const typed = { first: 'Mya', last: 'Chen', dob: '2012-03-05', email: 'new@example.com', school: 'shrewsbury', dan: 2 };
  // off: as typed (the same object — nothing changes when the switch is off)
  assert.equal(editValuesToSave(typed, initial, { hidden: false, isAdmin: false }), typed);
  assert.equal(editValuesToSave(typed, initial), typed);
  // on, admin: the stored date of birth and email; the name, school and Dan as typed
  assert.deepEqual(editValuesToSave(typed, initial, { hidden: true, isAdmin: true }), { ...typed, dob: initial.dob, email: initial.email });
  // on, staff: also the stored Dan (grayed on every row)
  assert.deepEqual(editValuesToSave(typed, initial, { hidden: true, isAdmin: false }), { ...typed, dob: initial.dob, email: initial.email, dan: 1 });
  // nothing typed = the stored values
  assert.deepEqual(editValuesToSave(initial, initial, { hidden: true }), initial);
  // a REAL name-only change while hidden is still a change: the name is kept, dob and email stay stored
  const nameOnly = editValuesToSave({ ...initial, first: 'Mya' }, initial, { hidden: true });
  assert.equal(nameOnly.first, 'Mya');
  assert.equal(nameOnly.dob, initial.dob);
  assert.equal(nameOnly.email, initial.email);
  assert.notDeepEqual(nameOnly, initial);
  // a purged candidate (nothing stored for date of birth and email): stays as stored, never typed text
  for (const blank of [null, '']) {
    const purged = { ...initial, dob: blank, email: blank };
    const sent = editValuesToSave({ ...purged, dob: '2012-03-05', email: 'x@example.com' }, purged, { hidden: true, isAdmin: true });
    assert.equal(sent.dob, blank);
    assert.equal(sent.email, blank);
  }
  // staff (not admin) gets the stored Dan back; an admin keeps the typed Dan
  assert.equal(editValuesToSave({ ...initial, dan: 2 }, initial, { hidden: true, isAdmin: false }).dan, 1);
  assert.equal(editValuesToSave({ ...initial, dan: 2 }, initial, { hidden: true, isAdmin: true }).dan, 2);
  // cancelEdit's idea: for staff who changed only the Dan (and typed dob/email) while hidden, what
  // Save WOULD send equals the stored values, so Cancel/Esc has no "unsaved changes" to warn about
  const staffTyped = { ...initial, dan: 2, dob: '2012-03-05', email: 'new@example.com' };
  assert.deepEqual(editValuesToSave(staffTyped, initial, { hidden: true, isAdmin: false }), initial);
});

// Design review, rolling check, Black Belt Candidates small fixes (v1.043, v1.044, v1.046 (8), v1.050)
check('rolling check: Not paid is amber, Find a candidate, Record payment and Restore rules, one stale sentence', () => {
  // R3-01 (v1.044): the past-due "Not paid" is amber, the same kind as Late; nothing is red any more
  assert.deepEqual(StaffWords.moneyTag({ tag: 'not_paid' }), { kind: 'warn', text: 'Not paid' });
  assert.equal(StaffWords.moneyTag({ tag: 'late', lateCents: 5000, lateSince: '2027-03-01' }).kind, 'warn');
  for (const m of [{ tag: 'not_paid' }, { tag: 'late', lateCents: 5000, lateSince: '2027-03-01' }, { tag: 'paid_in_full' }, { tag: 'next', nextCents: 100, nextOn: '2027-03-01' }, null]) {
    assert.notEqual(StaffWords.moneyTag(m).kind, 'red');
  }
  // R3-09 (v1.050): the box reads "Find a candidate"; the no-match words are unchanged
  assert.equal(StaffWords.FIND_CANDIDATE, 'Find a candidate');
  assert.equal(StaffWords.SEARCH_CANDIDATES, undefined);
  assert.equal(StaffWords.noMatch('zz'), 'No candidates match "zz".');
  assert.equal(StaffWords.CLEAR_SEARCH, 'Clear search');
  // R3-02 (v1.046 (8)): a possible duplicate offers no Record payment; a removed row or a make-up never did
  assert.equal(canRecordPayment({ duplicateState: 'possible' }), false);
  assert.equal(canRecordPayment({ duplicateState: null }), true);
  assert.equal(canRecordPayment({ duplicateState: 'resolved' }), true);
  assert.equal(canRecordPayment({ withdrawn: true }), false);
  assert.equal(canRecordPayment({ isMakeup: true }), false);
  assert.equal(canRecordPayment({}), true);
  // R2-03 (v1.043): restoring a Duplicate copy has no Undo; other restores keep theirs
  assert.equal(restoreHasUndo({ withdrawnReason: 'duplicate_copy' }), false);
  assert.equal(restoreHasUndo({ withdrawnReason: 'manual' }), true);
  assert.equal(restoreHasUndo({ withdrawnReason: null }), true);
  assert.equal(restoreHasUndo({}), true);
  assert.equal(StaffWords.toastRestored('Noah Silva'), 'Noah Silva restored');
  // R4-14: one sentence for a refused Undo; the old one is retired
  assert.equal(StaffWords.UNDO_STALE_CANDIDATE, undefined);
  assert.equal(StaffWords.candidateStale('Sam Lee'), 'Someone else changed Sam Lee just now, so nothing was done. Their change is shown.');
});

await checkAsync('Candidates shared-parts switch (pass 1): shared words, queued Undo, shared Choice and Paid by — no leftover copies', async () => {
  const Shared = await import('../../components/text.js');
  // R2-07: the three sentences are the shared file's own (an alias, never a second copy of the words)
  assert.equal(StaffWords.candidateStale, Shared.someoneElseChanged);
  assert.equal(StaffWords.UNDO_FAILED, Shared.UNDO_DIDNT_SAVE);
  assert.equal(StaffWords.TOAST_UNDONE, Shared.UNDONE);
  assert.equal(StaffWords.LOAD_FAILED, Shared.LOAD_FAILED);
  assert.equal(StaffWords.LOAD_FAILED, "Couldn't load. Check the connection, then retry."); // S-2
  // a refused Undo with its own reason: "Couldn't undo: [reason]." (one closing period, from the shared helper)
  assert.equal(StaffWords.undoWhy.paymentGone, "Couldn't undo: this payment was already undone or changed.");
  assert.equal(StaffWords.undoWhy.hasGrades('Sam Lee'), "Couldn't undo: Sam Lee has grades, so they can't be deleted. Withdraw them instead.");
  for (const value of Object.values(StaffWords.undoWhy)) {
    const text = typeof value === 'function' ? value('Sam Lee') : value;
    assert.match(text, /^Couldn't undo: .+[^.]\.$/, `"${text}" must be "Couldn't undo: reason."`);
  }
  // R1-07: the toasts after Record payment / Undo payment are the shared set
  assert.equal(StaffWords.toastPaymentRecorded(33000, 'cash', 'Sam Lee'), 'Sam Lee marked paid · $330 cash');
  assert.equal(StaffWords.toastPaymentRecorded(29050, 'card', 'Mia Chen'), 'Mia Chen marked paid · $290.50 card');
  assert.equal(StaffWords.toastPaymentUndone('Sam Lee'), 'Payment undone for Sam Lee');
  // R1-06: the Undo payment box reads as before, its title and "Paid on" built from the shared words
  assert.equal(StaffWords.undoPaymentTitle('Sam Lee', 33000, 'cash'), "Undo Sam Lee's $330 cash payment?");
  assert.equal(StaffWords.undoPaymentBody('2027-03-20', 'payments 1 and 2'), 'Paid on Mar 20 for payments 1 and 2. It comes off the balance; the history keeps it.');
  assert.equal(StaffWords.undoPaymentBody('2027-03-20', ''), 'Paid on Mar 20. It comes off the balance; the history keeps it.');

  // No leftover copies in the Candidates files (each source is read as text)
  const read = (name) => readFileSync(new URL(`../../blackBelt/staff/candidates/${name}`, import.meta.url), 'utf8');
  const files = ['AddCandidateDialog.jsx', 'CandidateDialog.jsx', 'ChangePlanDialog.jsx', 'CandidatesTab.jsx', 'MakeupPickerDialog.jsx', 'RefundDialog.jsx', 'SignatureDialog.jsx', 'UndoPaymentDialog.jsx', 'dialogParts.jsx', 'useCandidateActions.js', 'useMakeupPicker.js'];
  for (const name of files) {
    const source = read(name);
    assert.ok(!/<Choice[\s\n]/.test(source) && !source.includes("parts/Choice.jsx"), `${name}: still uses Black Belt's own Choice`);
    assert.ok(!source.includes('RefundedByBox'), `${name}: the local Refunded by copy is back`);
    assert.ok(!source.includes('LOAD_FAILED_NO_RETRY'), `${name}: a load failure without a Retry`);
    assert.ok(!source.includes('UNDO_STALE_CANDIDATE'), `${name}: the retired Undo sentence`);
    assert.ok(!/Someone else changed|Couldn't undo|Couldn’t undo|Undo didn't save/.test(source.replace(/^\s*\/\/.*$/gm, '')), `${name}: a refusal sentence typed here instead of from the shared words`);
  }
  // R2-05: every toast Undo goes through the save line (no early-return guard, no direct onAction)
  const actions = read('useCandidateActions.js');
  const picker = read('useMakeupPicker.js');
  assert.ok(actions.includes('useSaveLine') && actions.includes('saveLine.undoAction'), 'the Candidates actions use the queued Undo');
  assert.ok(!/undoAction\(\(\) =>/.test(actions) && !actions.includes('busyRef'), 'the old Undo helper or busy flag is back');
  assert.ok(!/label: T\.UNDO,\s*onAction/.test(actions + picker), 'a toast Undo that skips the save line');
  assert.ok(picker.includes('saveLine.undoAction') && !picker.includes('undoBusy'), 'the make-up picker Undo uses the save line');
  // the shared Choice and Paid by: Dan locked, School / Dan / Kukkiwon filled, Refunded by through the shared field
  const detail = read('CandidateDialog.jsx');
  assert.ok(/<ChoiceGroup[^>]*fill locked=\{danLocked\}/.test(detail), 'the locked Dan uses the shared locked look');
  assert.ok(read('RefundDialog.jsx').includes('label={T.REFUNDED_BY}'), 'Record refund says "Refunded by" through the shared field');
  assert.ok(read('dialogParts.jsx').includes('<PaidByField') && read('dialogParts.jsx').includes('label={label}'), 'the Paid by box passes its label to the shared field');
});

check('BB8 words: the preview store end to end — grade changes name the subject, a Dan change and Add make-up are one line', () => {
  loadCast();
  const spring = springCycle();
  const ctx = { rubric: spring.requirements, plans: db().bb_cycle_plans.filter((p) => p.cycle_id === spring.id) };
  const read = (id) => call('bb_candidate_history', { p_candidate_id: id }, STAFF).rows.map(historyRowOf);
  const ava = castRow('Ava', 'Brooks');
  // a grade correction: names the subject (through its insert row, record_id)
  const ref = subjectId(2, 'Referee seminar');
  const old = db().bb_grades.find((g) => g.candidate_id === ava.id && g.subject_id === ref)?.letter ?? null;
  const next = old === 'C' ? 'B' : 'C';
  advance(60 * 1000);
  assert.equal(call('bb_set_grade', { p_candidate_id: ava.id, p_dan: 2, p_subject_id: ref, p_letter: next }, STAFF).status, 'ok');
  const texts = historyTexts(read(ava.id), ctx);
  assert.equal(texts[0], old ? `Grade changed: Referee seminar · ${old} → ${next}` : `Graded: Referee seminar · ${next}`);
  // without record_id (a database before 0034): the same change without the subject
  if (old) assert.equal(historyTexts(read(ava.id).map((x) => ({ ...x, recordId: null })), ctx)[0], `Grade changed: ${old} → ${next}`);
  // a Dan change that clears 27 grades and 5 counts: ONE line, no "Grade cleared" lines
  advance(60 * 1000);
  const v = db().bb_candidates.find((c) => c.id === ava.id).version;
  const done = call('bb_update_candidate_clear', {
    p_candidate_id: ava.id, p_expected_version: v, p_first: 'Ava', p_last: 'Brooks', p_date_of_birth: ava.date_of_birth, p_email: ava.email_for_results,
    p_location_code: ava.location_code, p_dan: 3, p_expected_grade_count: 27, p_expected_count_count: 5, p_expected_chosen_count: 0,
  });
  assert.equal(done.status, 'ok');
  const after = historyTexts(read(ava.id), ctx);
  assert.equal(after[0], 'Dan: 2nd → 3rd Dan · 27 grades cleared · 5 extra-points counts cleared');
  assert.ok(!after.some((t) => t.startsWith('Grade cleared')));
  // the cast's Fall make-up (Mia): its own row and the kept grades it copied in = one line
  const miaFall = castRow('Mia', 'Chen', fallCycle());
  const fallCtx = { rubric: fallCycle().requirements, plans: [] };
  const mt = historyTexts(read(miaFall.id), fallCtx);
  assert.ok(mt.some((t) => /^Added as a make-up from Spring 2027 · \d+ kept grades copied/.test(t)), JSON.stringify(mt));
  assert.ok(!mt.some((t) => t.startsWith('Graded:')), JSON.stringify(mt));
  // no login id, date of birth or email anywhere in the words
  for (const t of [...after, ...mt]) assert.ok(!/@|\d{4}-\d{2}-\d{2}/.test(t), t);
});

check('0032 store: the purge inside a read logs its own rows as bb_purge_due (as the real database), once', () => {
  backend.loadSample(); // keep 3 years after the last day / 3 years after 18
  setDay('2040-01-02'); // long past every purge day
  const before = db().change_log.length;
  assert.equal(call('bb_cycles_list', {}, STAFF).status, 'ok');
  const rows = db().change_log.slice(before);
  assert.ok(rows.length > 0, 'the purge wrote history rows');
  assert.ok(rows.every((r) => r.action === 'bb_purge_due' && r.actor_name === 'Staff'), JSON.stringify(rows.map((r) => r.action)));
  // each purged row once: the call's own comparison doesn't repeat it
  const keys = rows.map((r) => `${r.table_name}|${r.record_id}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(rows.some((r) => r.table_name === 'bb_candidates' && r.before?.date_of_birth === 'on file' && r.after?.date_of_birth === null));
  assert.ok(rows.some((r) => r.table_name === 'bb_candidate_waivers' && r.before?.signature === 'on file' && r.after?.signature === null));
  assert.ok(!JSON.stringify(rows).includes('data:image') && !JSON.stringify(rows).includes('@example.com'));
  // a second read finds nothing more to purge, so it writes nothing
  const after = db().change_log.length;
  call('bb_cycles_list', {}, STAFF);
  assert.equal(db().change_log.length, after);
  setDay('2027-02-15');
});

check('0032 store: bb_undo_cycle_edit — refusals, a family after the save, the switch and the values together', () => {
  backend.loadSample();
  setDay('2027-02-15');
  const springNow = () => db().bb_cycles.find((c) => c.name.startsWith('Spring 2027'));
  const id = springNow().id;
  const full = db().bb_cycle_plans.find((p) => p.cycle_id === id && p.name === 'In full').id;
  const rosterIds = () => db().bb_candidates.filter((c) => c.cycle_id === id).map((c) => c.id);
  assert.ok(BB_WRITE_RPC_NAMES.includes('bb_undo_cycle_edit') && BB_RPC_NAMES.includes('bb_candidate_history'));

  // Save 1: rename and close (as Edit cycle does: values, then the switch)
  let known = rosterIds();
  const old = editForm(id);
  const saved = call('bb_update_cycle', { p_cycle_id: id, p_expected_version: old.version, p_payload: buildUpdatePayload({ ...old.form, name: 'Spring 2027 renamed' }) });
  assert.equal(saved.status, 'ok');
  const closed = call('bb_set_registration', { p_cycle_id: id, p_expected_version: saved.version, p_open: false });
  assert.equal(closed.status, 'ok');
  const args = (over = {}) => ({ p_cycle_id: id, p_expected_version: closed.version, p_payload: buildUpdatePayload(old.form), p_open: true, p_known_ids: known, ...over });

  // refusals: nothing changes
  let snapshot = JSON.stringify(db());
  assert.deepEqual(call('bb_undo_cycle_edit', args(), LOCKED), { status: 'no_access' });
  assert.deepEqual(call('bb_undo_cycle_edit', args(), STAFF), { status: 'not_allowed' });
  for (const over of [{ p_cycle_id: null }, { p_expected_version: null }, { p_known_ids: null }, { p_known_ids: [...known, null] },
    { p_known_ids: Array.from({ length: 2001 }, () => randomUUID()) }, { p_payload: { name: 5 } }, { p_payload: null }]) {
    assert.deepEqual(call('bb_undo_cycle_edit', args(over)), { status: 'invalid' }, JSON.stringify(over).slice(0, 80));
  }
  assert.equal(backend.rpc('bb_undo_cycle_edit', args({ p_known_ids: ['not an id'] }), ADMIN).error.code, '22P02');
  assert.deepEqual(call('bb_undo_cycle_edit', args({ p_cycle_id: randomUUID() })), { status: 'not_found' });
  assert.deepEqual(call('bb_undo_cycle_edit', args({ p_expected_version: closed.version - 1 })), { status: 'stale' });
  assert.equal(JSON.stringify(db()), snapshot);

  // the rollback: the switch goes through, the values are refused (Fall 2027's name) → duplicate_name,
  // and the switch is back as the save left it (closed), with the same version
  assert.deepEqual(call('bb_undo_cycle_edit', args({ p_payload: buildUpdatePayload({ ...old.form, name: 'Fall 2027' }) })), { status: 'duplicate_name' });
  assert.equal(JSON.stringify(db()), snapshot);
  assert.deepEqual([springNow().registration_open, springNow().version], [false, closed.version]);
  // part_without_day keeps its parts
  const oneDay = { ...old.form, days: old.form.days.slice(0, 1), submissionsDue: old.form.days[0].date };
  assert.deepEqual(call('bb_undo_cycle_edit', args({ p_payload: buildUpdatePayload(oneDay) })), { status: 'part_without_day', parts: ['technical', 'curriculum'] });
  // a lost connection (failNextSave) changes nothing either
  backend.failNextSave();
  assert.equal(backend.rpc('bb_undo_cycle_edit', args(), ADMIN).data, null);
  assert.equal(JSON.stringify(db()), snapshot);

  // the Undo with the switch: open again, the old name back, one new version
  const undone = call('bb_undo_cycle_edit', args());
  assert.equal(undone.status, 'ok');
  assert.deepEqual(Object.keys(undone).sort(), ['status', 'version']);
  assert.deepEqual([springNow().name, springNow().registration_open, springNow().version], ['Spring 2027', true, undone.version]);

  // Save 2: rename only; a DESK candidate added after it doesn't block the Undo (p_open null)
  known = rosterIds();
  const before2 = editForm(id);
  const saved2 = call('bb_update_cycle', { p_cycle_id: id, p_expected_version: before2.version, p_payload: buildUpdatePayload({ ...before2.form, name: 'Spring 2027 two' }) });
  assert.equal(call('bb_add_candidate', {
    p_cycle_id: id, p_first: 'Dee', p_last: 'Zzdesk', p_date_of_birth: '1990-01-01', p_email: 'dee.zz@example.com',
    p_location_code: 'worcester', p_dan: 1, p_cycle_plan_id: full, p_kukkiwon: false, p_paper_waiver: true,
  }, STAFF).status, 'ok');
  const undone2 = call('bb_undo_cycle_edit', { p_cycle_id: id, p_expected_version: saved2.version, p_payload: buildUpdatePayload(before2.form), p_open: null, p_known_ids: known });
  assert.equal(undone2.status, 'ok');
  assert.deepEqual([springNow().name, springNow().registration_open], ['Spring 2027', true]);

  // Save 3: rename only; a FAMILY registers before the Undo → registered, nothing changes
  known = rosterIds();
  const before3 = editForm(id);
  const saved3 = call('bb_update_cycle', { p_cycle_id: id, p_expected_version: before3.version, p_payload: buildUpdatePayload({ ...before3.form, name: 'Spring 2027 three' }) });
  const fam = backend.publicRegister(regInput(springNow().public_code_shrewsbury, full, { first: 'Lou', last: 'Zzlate' }));
  assert.equal(fam.status, 'ok');
  const lou = db().bb_candidates.find((c) => c.reference === fam.reference).id;
  const undo3 = (over = {}) => call('bb_undo_cycle_edit', { p_cycle_id: id, p_expected_version: saved3.version, p_payload: buildUpdatePayload(before3.form), p_open: null, p_known_ids: known, ...over });
  snapshot = JSON.stringify(db());
  assert.deepEqual(undo3(), { status: 'registered' });
  assert.deepEqual(undo3({ p_open: false }), { status: 'registered' });
  assert.equal(JSON.stringify(db()), snapshot);
  assert.equal(springNow().name, 'Spring 2027 three');
  // withdrawn, the family still counts; once the list names them, the Undo goes through
  assert.equal(call('bb_withdraw_candidate', { p_candidate_id: lou, p_expected_version: db().bb_candidates.find((c) => c.id === lou).version }).status, 'ok');
  assert.deepEqual(undo3(), { status: 'registered' });
  assert.equal(undo3({ p_known_ids: [...known, lou] }).status, 'ok');
  assert.equal(springNow().name, 'Spring 2027');
});

// ======================= the family form's preview stand-in =======================

// A tiny fake browser (localStorage + window) so publicApi.preview.js runs in Node.
const fakeStorage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (fakeStorage.has(k) ? fakeStorage.get(k) : null),
    setItem: (k, v) => fakeStorage.set(k, String(v)),
    removeItem: (k) => fakeStorage.delete(k),
  },
};
const previewApi = await import('./publicApi.preview.js');
previewApi.setFakeDelay(0);

await (async () => {
  const label = 'stand-in: the Function order, answers and helpers (§2.6)';
  try {
    // the staff preview's store (same key) with the sample, "today" Feb 15 2027
    const staffSide = createBlackBeltBackend({
      loadStore: () => JSON.parse(fakeStorage.get(BB_STORE_KEY) ?? 'null'),
      saveStore: (s) => fakeStorage.set(BB_STORE_KEY, JSON.stringify(s)),
      now: () => Date.now(), today: () => previewApi.previewToday(), newId: randomUUID,
    });
    fakeStorage.set('tkd.preview.today', '2027-02-15');
    staffSide.loadSample();
    const spring = staffSide.snapshot().bb_cycles.find((c) => c.name === 'Spring 2027');
    const code = spring.public_code_worcester;
    const got = await previewApi.getCycle(code.toUpperCase()); // codes are lower-cased
    assert.equal(got.status, 'ok');
    assert.deepEqual(Object.keys(got).sort(), ['closed_on', 'cycle', 'school', 'state', 'status', 'turnstile_site_key', 'waiver']);
    assert.equal(got.turnstile_site_key, null);
    assert.equal(got.state, 'open');
    assert.equal(typeof globalThis.window.__tkdPreview.setBlackBeltRegistration, 'function'); // installed on first use
    assert.deepEqual(await previewApi.getCycle('nope'), { status: 'not_found' });
    const plan = got.cycle.plans.find((p) => p.name === '2 payments');
    const started = Date.now() - 60000;
    const body = (over = {}) => ({
      submission_id: randomUUID(), first_name: 'Ivy', last_name: 'Testkid', date_of_birth: '2000-01-02', email: 'ivy@example.com', dan: 3,
      cycle_plan_id: plan.id, kukkiwon: false, acknowledged: true, waiver_version: got.waiver.version_name, signer_name: 'Ivy Testkid',
      signature: SIG, website: '', started_at: started, sent_at: started + 30000, turnstile_token: null, ...over,
    });
    const first = body();
    const ok = await previewApi.register(code, first);
    assert.equal(ok.status, 'ok');
    assert.deepEqual(Object.keys(ok).sort(), OK_ANSWER_KEYS);
    assert.deepEqual(ok.items, [{ item: 'p1', due_on: '2027-03-27', amount_cents: 75000 }, { item: 'p2', due_on: '2027-05-29', amount_cents: 75000 }]);
    assert.ok(!JSON.stringify(ok).includes('ivy@example.com') && !JSON.stringify(ok).includes('2000-01-02'));
    // the staff preview (same store) sees the registration
    assert.equal(staffSide.snapshot().bb_candidates.find((c) => c.reference === ok.reference).first_name, 'Ivy');
    // the same submission id → the same answer
    assert.deepEqual(await previewApi.register(code, first), ok);
    // the Function's own refusals, in its order
    assert.deepEqual(await previewApi.register('nope', body()), { status: 'not_found' });
    assert.deepEqual(await previewApi.register(code, body({ website: 'http://spam' })), { status: 'bad_request' }); // honeypot
    assert.deepEqual(await previewApi.register(code, body({ sent_at: started + 3999 })), { status: 'bad_request' }); // too fast
    assert.deepEqual(await previewApi.register(code, body({ dan: '3' })), { status: 'bad_request' }); // field types
    assert.deepEqual(await previewApi.register(code, body({ cycle_plan_id: 'x' })), { status: 'bad_request' });
    assert.deepEqual(await previewApi.register(code, body({ date_of_birth: 'Jan 2' })), { status: 'bad_request' });
    assert.deepEqual(await previewApi.register(code, body({ signature: `x${'A'.repeat(100 * 1024)}` })), { status: 'bad_request' }); // 100 KB
    assert.deepEqual(await previewApi.register(code, [1, 2]), { status: 'bad_request' });
    assert.deepEqual(await previewApi.register(code, body({ email: 'nope' })), { status: 'invalid' }); // the database's rule
    const helpers = globalThis.window.__tkdPreview;
    helpers.forceVerifyFailed(true);
    assert.deepEqual(await previewApi.register(code, body()), { status: 'verify_failed' });
    assert.equal((await previewApi.register(code, body())).status, 'ok'); // only the next one failed
    helpers.forceRateLimited(true);
    assert.deepEqual(await previewApi.register(code, body()), { status: 'rate_limited' });
    helpers.forceRateLimited(false);
    // the waiver changed more than 24 hours ago → waiver_changed
    const before = staffSide.waiverChanged();
    assert.deepEqual(await previewApi.register(code, body({ waiver_version: before.from })), { status: 'waiver_changed' });
    // closing on the staff side shows "closed" here
    const now = staffSide.snapshot().bb_cycles.find((c) => c.id === spring.id);
    staffSide.rpc('bb_set_registration', { p_cycle_id: spring.id, p_expected_version: now.version, p_open: false }, ADMIN);
    assert.equal((await previewApi.getCycle(code)).state, 'closed');
    assert.deepEqual(await previewApi.register(code, body({ waiver_version: before.to })), { status: 'closed', closed_on: null });
    assert.deepEqual(await previewApi.register(code, first), ok); // a retry still gets its first answer
    // the kill switch
    helpers.setBlackBeltRegistration(false);
    assert.deepEqual(await previewApi.getCycle(code), { status: 'not_open' });
    assert.deepEqual(await previewApi.register(code, first), { status: 'not_open' });
    helpers.setBlackBeltRegistration(true);
    assert.equal((await previewApi.getCycle(code)).status, 'ok');
    assert.match(helpers.setToday('nope'), /Use a date/);
    // no canvas in Node: the PNG download resolves to null instead of failing
    assert.equal(await qrPngBlob(blackBeltLink(code)), null);
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
})();

// Step 1b words and the family form's "Date signed" (rulebook v0.638, v1.045, v1.051, v1.123).
await (async () => {
  const label = 'step 1b: Date signed day, Undo toast words, staff words, offline lines';
  try {
    // The family form draws the shared DateSigned part (no Black Belt box of its own any more):
    // the day shows with its weekday, and the words are the shared ones.
    const formFormat = await import('../../blackBelt/form/format.js');
    assert.equal(formFormat.signedDayLabel, undefined);
    const { shortDate } = await import('../calendarDates.js');
    assert.equal(shortDate('2027-03-10'), 'Wed, Mar 10, 2027');
    const sharedText = await import('../../components/text.js');
    assert.equal(sharedText.DATE_SIGNED, 'Date signed');
    assert.equal(sharedText.DATE_SIGNED_HINT, "Filled in automatically with today's date."); // the shared words
    const stepCheckSource = (await import('node:fs')).readFileSync(new URL('../../blackBelt/form/StepCheck.jsx', import.meta.url), 'utf8');
    assert.ok(stepCheckSource.includes('<DateSigned id="bbf-signed" day={today} />'));
    assert.ok(!stepCheckSource.includes('bbf-field--signed'));
    // R2-07: the Undo that puts registration back to open says so; the plain one stays plain
    const staffText = await import('../../blackBelt/staff/text.js');
    assert.equal(staffText.TOAST_UNDONE, 'Undone');
    assert.equal(staffText.TOAST_UNDONE_OPEN_AGAIN, 'Undone. Registration is open again.');
    // R4-13: "open it", never "reopen", in the staff's words
    assert.equal(staffText.REOPEN_NEEDS_ADMIN, 'The application date has passed. Ask an admin to open it.');
    assert.equal(staffText.registrationClosedStaff('2027-03-27'), 'Registration closed on Sat, Mar 27. Ask an admin to open it.');
    for (const [name, value] of Object.entries(staffText)) {
      if (typeof value === 'string') assert.ok(!/reopen/i.test(value), `"reopen" in ${name}`);
    }
    // Pass 1b: the ⋯ names start with "More actions for"
    assert.equal(staffText.subjectMore('Sparring'), 'More actions for Sparring');
    assert.equal(staffText.subjectMore(''), 'More actions for subject');
    assert.equal(staffText.itemMore(''), 'More actions for item');
    assert.equal(staffText.bracketMore('18–24'), 'More actions for 18–24');
    // M12: the Results tab's two gray offline lines
    const resultsText = await import('../../blackBelt/staff/results/text.js');
    assert.equal(resultsText.OFFLINE_WHY_BUTTONS, "Print results and Download CSV are off while you're offline. Try again when the connection is back.");
    assert.equal(resultsText.OFFLINE_WHY_ROWS, "Email result and Mark as sent are off while you're offline. Try again when the connection is back.");
    assert.equal(resultsText.OFFLINE, undefined); // the tab's own amber bar is gone
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
})();

// ----- Candidates page, BB15 / BB1 / BB2 / BB7 / R4-11 / C-05 / M-03 (design review, rulebook v1.008 ... v1.105) -----
await (async () => {
  const label = 'Candidates page: Print receipt rule, count cards, empty lines, compare rows, receipt, failed reads, words';
  try {
    const checksJs = await import('../../blackBelt/staff/candidates/checks.js');
    const { printReceiptOffered, rosterCardList, rosterEmptyText, isMoneyChild, MONEY_CHILD_KINDS } = checksJs;
    // P1: which child dialogs are money dialogs (none may be drawn or opened while Hide private details is on)
    for (const kind of ['record', 'editPayment', 'undo', 'refund', 'returned', 'receipt', 'plan']) assert.equal(isMoneyChild(kind), true, kind);
    for (const kind of ['add', 'deleteConfirm', 'danChange', 'compare', 'signature', undefined]) assert.equal(isMoneyChild(kind), false, String(kind));
    assert.equal(MONEY_CHILD_KINDS.length, 7);
    const { compareRows } = await import('../../blackBelt/staff/candidates/compareRows.js');
    const { buildBlackBeltReceipt } = await import('../../blackBelt/staff/receipt/buildReceipt.js');
    const W = await import('../../blackBelt/staff/text.js');

    // M-03 / BB2: Print receipt only with a payment or refund that still stands, active or withdrawn
    const live = (...kinds) => kinds.map((kind) => ({ kind }));
    assert.equal(printReceiptOffered({ lines: [] }), false, 'nothing paid: none');
    assert.equal(printReceiptOffered({ lines: live('payment') }), true);
    assert.equal(printReceiptOffered({ lines: live('payment', 'refund') }), true);
    assert.equal(printReceiptOffered({ lines: live('refund') }), true, 'a refund that stands is enough');
    assert.equal(printReceiptOffered({ lines: live('returned') }), false, 'a returned mark alone is no money');
    assert.equal(printReceiptOffered({ lines: live('payment'), hidden: true }), false, 'never while hidden');
    assert.equal(printReceiptOffered({ lines: live('payment'), isMakeup: true }), false, 'a make-up has no fee');
    // from the roster row alone (a withdrawn row keeps it when it has money)
    assert.equal(printReceiptOffered({ paidCents: 29000, hasPaymentRows: true, tag: 'next' }), true);
    assert.equal(printReceiptOffered({ paidCents: 0, hasPaymentRows: false, tag: 'not_paid' }), false);
    assert.equal(printReceiptOffered({ paidCents: 0, hasPaymentRows: false, tag: 'next' }), false, 'no payment row at all');
    assert.equal(printReceiptOffered({ paidCents: 0, hasPaymentRows: true, tag: 'not_paid' }), false, 'all undone and overdue');
    assert.equal(printReceiptOffered({ paidCents: 0, hasPaymentRows: true, tag: 'late' }), false, 'net 0 and no lines loaded: the only payment may have been undone (M-03)');
    assert.equal(printReceiptOffered({ paidCents: 0, hasPaymentRows: true, tag: 'next' }), false, 'net 0, any tag: not offered from the row alone');
    assert.equal(printReceiptOffered({ lines: live('payment', 'refund'), paidCents: 0 }), true, 'loaded lines decide: paid then refunded to zero still stands');
    assert.equal(printReceiptOffered({ paidCents: 29000, hasPaymentRows: true, tag: 'next', hidden: true }), false);

    // BB15 / C-05 (a) / v1.046 (9): the count cards as data
    const counts = { paidInFull: 2, onSchedule: 3, late: 1, notPaid: 0, duplicatesLeftOut: 2 };
    const four = rosterCardList({ counts, total: 9, hidden: false, hasAny: true });
    assert.deepEqual(four.cards.map((c) => [c.key, c.label, c.value, c.kind]), [
      ['paidInFull', 'Paid in full', 2, 'filter'], ['onSchedule', 'Paying on schedule', 3, 'filter'], ['late', 'Late', 1, 'filter'], ['notPaid', 'Not paid', 0, 'filter'],
    ]);
    assert.equal(four.note, W.duplicatesLeftOut(2), 'the gray note names the duplicates left out');
    assert.equal(rosterCardList({ counts: { ...counts, duplicatesLeftOut: 0 }, total: 9 }).note, null);
    const one = rosterCardList({ counts, total: 9, hidden: true, hasAny: true });
    assert.deepEqual(one.cards, [{ key: 'all', label: 'Candidates', value: 9, kind: 'total' }], 'hidden: ONE Candidates card (plain, not a button), no money cards');
    assert.equal(one.note, null);
    assert.deepEqual(rosterCardList({ counts, total: 0, hidden: false, hasAny: false }), { cards: [], note: null }, 'empty roster: no cards');
    assert.deepEqual(rosterCardList({ counts, total: 0, hidden: true, hasAny: false }), { cards: [], note: null }, 'empty and hidden: no cards either');
    assert.ok(four.cards.length <= 4, '§8: at most four in a row');

    // C-05 (b) and the empty roster line
    assert.equal(rosterEmptyText({ searchText: 'zz' }), 'No candidates match "zz".');
    assert.equal(rosterEmptyText({ searchText: 'zz', card: 'late' }), 'No candidates match "zz".', 'a search outranks a card');
    const lines = ['paidInFull', 'onSchedule', 'late', 'notPaid'].map((card) => rosterEmptyText({ card }));
    assert.equal(new Set(lines).size, 4, 'each card says its own thing');
    for (const line of lines) assert.ok(line !== W.NO_FILTER_MATCH && line !== W.NO_CANDIDATES, line);
    assert.deepEqual(lines, ['No one has paid in full yet.', 'No one is paying on schedule right now.', 'No one is late.', 'No one is overdue with nothing paid.']);
    assert.equal(rosterEmptyText({}), W.NO_CANDIDATES);
    assert.ok(W.NO_CANDIDATES.includes('Add candidate'), 'the empty roster line names the button (v1.028)');

    // BB15: the compare's rows; hidden lines carry no value and are never marked
    const reg = (id, ref, dob, email, paid) => ({
      candidate: { id, registeredAt: '2027-03-25T14:14:00Z', reference: ref, source: 'form', dateOfBirth: dob, emailForResults: email, dan: 1, locationCode: 'worcester', plan: { name: 'In full' }, kukkiwon: true },
      money: { paidCents: paid },
    });
    const a = reg('a', 'BB-5001', '2012-03-04', 'a@example.com', 0);
    const b = reg('b', 'BB-5002', '2012-03-04', 'a@example.com', 39000);
    const open = compareRows(a, b, { hidden: false });
    assert.deepEqual(open.map((r) => r.key), ['registered', 'reference', 'source', 'dob', 'email', 'dan', 'school', 'plan', 'paid']);
    assert.deepEqual(open.filter((r) => r.plain).map((r) => r.key), ['registered', 'reference']);
    assert.equal(open.find((r) => r.key === 'dob').first, 'Mar 4, 2012');
    assert.equal(open.find((r) => r.key === 'paid').first, '$0');
    assert.equal(open.find((r) => r.key === 'paid').second, '$390');
    const masked = compareRows(a, b, { hidden: true });
    assert.deepEqual(masked.filter((r) => r.hidden).map((r) => r.key), ['dob', 'email', 'plan', 'paid']);
    for (const row of masked.filter((r) => r.hidden)) assert.deepEqual([row.first, row.second], ['', ''], `${row.key} carries no value while hidden`);
    assert.ok(!JSON.stringify(masked).includes('a@example.com') && !JSON.stringify(masked).includes('2012-03-04') && !JSON.stringify(masked).includes('Mar 4, 2012'));
    assert.equal(masked.find((r) => r.key === 'dan').first, '1st Dan', 'the other lines stay');

    // BB2: the plain receipt the shared box draws
    const plainReceipt = buildBlackBeltReceipt({
      candidate: { firstName: 'Alex', lastName: 'Kim', dan: 1, reference: 'BB-5001', locationCode: 'worcester' },
      cycleName: 'Spring 2027',
      planName: 'In full',
      kukkiwon: false,
      lines: [
        { paidOn: '2027-03-27', forItems: ['p1'], kind: 'payment', method: 'check', amountCents: 87000, returned: true },
        { paidOn: '2027-04-02', forItems: null, kind: 'returned', method: 'check', amountCents: -87000, returned: false },
        { paidOn: '2027-04-05', forItems: ['p1'], kind: 'payment', method: 'card', amountCents: 87000, returned: false },
        { paidOn: '2027-04-06', forItems: null, kind: 'refund', method: 'cash', amountCents: -5000, returned: false },
      ],
      money: { totalDueCents: 87000, paidCents: 82000, balanceCents: 5000, nextOn: null, nextCents: null },
      schools: [{ code: 'worcester', name: 'Worcester', address: { street: '1141 Main St' }, phone: '(508) 767-1717' }, { code: 'shrewsbury', name: 'Shrewsbury', address: null, phone: null }],
      printedOn: '2027-04-26',
      printedByName: ' Jeffrey Berg ',
    }, { plans: [], state: { firstDay: '2027-04-03' } });
    assert.equal(plainReceipt.kindLine, 'Black Belt testing · payment receipt');
    assert.deepEqual(plainReceipt.facts.map(([k]) => k), ['Candidate', 'Cycle', 'Reference', 'School', 'Plan']);
    assert.equal(plainReceipt.facts[0][1], 'Alex Kim · 1st Dan');
    assert.equal(plainReceipt.facts[3][1], 'Worcester');
    assert.deepEqual(plainReceipt.lines.map((l) => [l.date, l.forText, l.how, l.amountCents]), [
      ['2027-03-27', 'Payment 1', 'check', 87000], // (no plan in this cycle: the item's own name)
      ['2027-04-02', 'Payment 1 · check returned', '—', -87000], // paired with the bounced check; no money moved that day
      ['2027-04-05', 'Payment 1', 'card', 87000],
      ['2027-04-06', 'Refund', 'cash', -5000],
    ]);
    assert.equal(plainReceipt.totalDueCents, 87000);
    assert.equal(plainReceipt.paidCents, 82000);
    assert.equal(plainReceipt.balanceNote, 'overdue');
    assert.deepEqual(plainReceipt.schools, [{ name: 'Worcester', street: '1141 Main St', phone: '(508) 767-1717' }, { name: 'Shrewsbury', street: '', phone: '' }]);
    assert.equal(plainReceipt.printedByName, 'Jeffrey Berg');
    assert.ok(!JSON.stringify(plainReceipt).match(/dateOfBirth|email|"note"|"reason"|signature/i),'never a date of birth, email, note or signature');

    // R4-11 / S-2: a failed READ in the preview store (failNextSave never fails one)
    const pending = [];
    let stored = null;
    const store = createBlackBeltBackend({
      loadStore: () => stored,
      saveStore: (s) => { stored = JSON.parse(JSON.stringify(s)); },
      now: () => nowMs,
      today: () => todayIso,
      newId: randomUUID,
      defer: (fn) => pending.push(fn),
    });
    setDay('2027-02-15');
    store.loadSample();
    const candidateId = store.snapshot().bb_candidates[0].id;
    const read = (name, args = {}) => store.rpc(name, args, ADMIN);
    const detail = () => read('bb_candidate_detail', { p_candidate_id: candidateId });
    assert.equal(detail().error, null);
    store.failNextRead();
    assert.match(detail().error.message, /Failed to fetch/, 'the next read fails');
    assert.match(read('bb_receipt', { p_candidate_id: candidateId }).error.message, /Failed to fetch/, 'every read in the same moment fails too');
    assert.equal(read('bb_cycle_roster', { p_cycle_id: store.snapshot().bb_cycles[0].id }).error, null, 'the lists that refresh by themselves are skipped with no name');
    assert.equal(pending.length, 1, 'one moment, armed once');
    pending.shift()(); // the moment ends
    assert.equal(detail().error, null, 'then reads work again');
    store.failNextRead('bb_view_signature');
    assert.equal(detail().error, null, 'a named read leaves the others alone');
    assert.match(read('bb_view_signature', { p_candidate_id: candidateId }).error.message, /Failed to fetch/);
    pending.shift()();
    store.failNextRead('bb_cycle_roster');
    assert.match(read('bb_cycle_roster', { p_cycle_id: store.snapshot().bb_cycles[0].id }).error.message, /Failed to fetch/, 'a name can target the roster');
    pending.shift()();
    store.failNextRead();
    const withdrawn = store.rpc('bb_withdraw_candidate', { p_candidate_id: candidateId, p_expected_version: store.snapshot().bb_candidates[0].version }, ADMIN);
    assert.equal(withdrawn.error, null, 'a write is not a read: failNextRead leaves it alone');
    assert.match(read('bb_receipt', { p_candidate_id: candidateId }).error.message, /Failed to fetch/, '(the armed read failure was still waiting)');
    pending.shift()();
    store.failNextSave();
    assert.equal(read('bb_receipt', { p_candidate_id: candidateId }).error, null, 'failNextSave leaves reads alone');

    // the words (BB1, BB7, BB15, S-2)
    assert.equal(W.LOAD_FAILED, "Couldn't load. Check the connection, then retry.");
    assert.equal(W.LOAD_FAILED_NO_RETRY, undefined, 'S-2: every failed read has a Retry, so the no-Retry sentence is gone');
    assert.equal(W.REFUNDED_BY, 'Refunded by');
    assert.equal(W.METHOD, undefined, '"Method" is gone');
    assert.deepEqual([W.KEEP_PAYMENT, W.KEEP_REFUND, W.KEEP_MARK], ['Keep payment', 'Keep refund', 'Keep mark']);
    assert.equal(W.UNDO_RETURNED_CONFIRM, W.UNDO_RETURNED, 'the action repeats the menu: Undo returned mark');
    assert.equal(W.UNDO_RETURNED_CONFIRM, 'Undo returned mark');
    assert.deepEqual([W.UNDOING, W.DELETING, W.CHANGING], ['Undoing…', 'Deleting…', 'Changing…']);
    assert.equal(W.keepDan(1), 'Keep 1st Dan');
    assert.equal(W.keepDan(3), 'Keep 3rd Dan');
    assert.equal(W.duplicatesLeftOutPhone, undefined, 'phones use the shared cards and the same note');
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
})();

// ======================= Cycles, Cycle page, Rubric, Results: the shared parts (pass 1) =======================
// R2-05 (queued Undo), R2-07 (shared refusal words), S-2 (load sentence + Retry), R3-06 (BackLink), R3-13 (past days),
// L-06 (shared Grip), choice swap (shared ChoiceGroup), S-10 (shared Select), R4-08 (Email result's unavailable look).
// Pure text checks on the sources and the words: no browser.
check('Cycles, Rubric, Results: shared words, shared parts, no leftover copies', () => {
  const root = (rel) => new URL(`../../blackBelt/staff/${rel}`, import.meta.url);
  const source = (rel) => readFileSync(root(rel), 'utf8');
  // the code without its comments, so a comment may still name the old thing
  const code = (rel) => source(rel).replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const mine = [
    'BlackBeltTesting.jsx',
    'cycle/CycleDialog.jsx', 'cycle/CyclePage.jsx', 'cycle/DayDialog.jsx', 'cycle/PricesSection.jsx', 'cycle/useCycleEditor.jsx',
    'cycles/CyclesTab.jsx', 'cycles/useCycleActions.js',
    'grading/GradingTab.jsx',
    'results/ResultRows.jsx', 'results/ResultsTab.jsx',
    'rubric/ResultEmailsBlock.jsx', 'rubric/ResultTextDialog.jsx', 'rubric/RubricCard.jsx', 'rubric/RubricEditor.jsx', 'rubric/RubricTab.jsx', 'rubric/SubjectDialog.jsx',
  ];

  // the parts Black Belt used to carry itself are gone, and no file still imports them
  assert.ok(!existsSync(root('parts/Choice.jsx')), 'parts/Choice.jsx is back');
  assert.ok(!existsSync(root('parts/Grip.jsx')), 'parts/Grip.jsx is back');
  for (const rel of mine) {
    const text = code(rel);
    assert.ok(!text.includes('parts/Choice.jsx') && !/<Choice[\s\n]/.test(text), `${rel}: still uses Black Belt's own Choice`);
    assert.ok(!text.includes('parts/Grip.jsx'), `${rel}: still uses Black Belt's own Grip`);
    assert.ok(!text.includes('screens/testing/events/ChoiceGroup.jsx'), `${rel}: the shared ChoiceGroup is taken from components/`);
    assert.ok(!text.includes('LOAD_FAILED_NO_RETRY'), `${rel}: a load failure without a Retry`);
    assert.ok(!text.includes('PAST_DATES_HINT'), `${rel}: the old "dates" hint`);
    assert.ok(!/label: T\.UNDO,\s*onAction/.test(text), `${rel}: a toast Undo that skips the save line`);
    assert.ok(!/<select[\s>]/.test(text), `${rel}: a browser dropdown instead of the shared Select`);
    assert.ok(!/Someone else changed|Couldn't undo|Couldn’t undo|Undo didn't save|Undo didn’t save/.test(text), `${rel}: a refusal sentence typed here instead of from the shared words`);
  }
  assert.ok(!/\.bb-back(?![\w-])/.test(code('blackBelt.css')) && !code('blackBelt.css').includes('.bb-segmented'), 'blackBelt.css: .bb-back (our own back link) / .bb-segmented are unused');

  // R3-06: both back links are the shared one
  assert.ok(code('BlackBeltTesting.jsx').includes('<BackLink') && !/bb-back(?![\w-])/.test(code('BlackBeltTesting.jsx')), 'the page back link is the shared BackLink (class bb-back-link only sizes it)');
  assert.ok(code('cycle/CyclePage.jsx').includes('<BackLink') && !/bb-back(?![\w-])/.test(code('cycle/CyclePage.jsx')), 'the cycle page back link is the shared BackLink (class bb-back-link only sizes it)');

  // L-06: both grips are the shared Grip (gray while a save runs)
  for (const rel of ['cycle/PricesSection.jsx', 'rubric/RubricEditor.jsx']) assert.ok(code(rel).includes("components/Grip.jsx"), `${rel}: the shared Grip`);
  assert.ok(code('rubric/RubricEditor.jsx').includes('disabled={saving}'), 'the rubric grips go gray while a save runs');

  // R2-05: every toast Undo of these screens goes through a save line; the old early-return guards are gone
  const lineUsers = ['candidates/useCandidateActions.js', 'cycle/CyclePage.jsx', 'cycles/CyclesTab.jsx', 'results/ResultsTab.jsx', 'rubric/ResultEmailsBlock.jsx', 'rubric/RubricCard.jsx', 'rubric/RubricTab.jsx'];
  for (const rel of lineUsers) assert.ok(code(rel).includes('useSaveLine('), `${rel}: has a save line`);
  assert.ok(code('cycle/useCycleEditor.jsx').includes('undoAction(') && code('cycles/useCycleActions.js').includes('undoAction('), 'the editor and the quick actions take the line\'s undoAction');
  assert.ok(!/undoBusy|busyRef/.test(code('rubric/RubricTab.jsx') + code('rubric/ResultEmailsBlock.jsx') + code('results/ResultsTab.jsx') + code('cycles/CyclesTab.jsx') + code('cycle/CyclePage.jsx')), 'an old busy flag is back');
  // the Undo run functions answer the line's shape, never show "Undone" themselves
  for (const rel of ['cycle/useCycleEditor.jsx', 'cycles/useCycleActions.js', 'results/ResultsTab.jsx', 'rubric/RubricCard.jsx', 'rubric/ResultEmailsBlock.jsx', 'rubric/RubricTab.jsx']) {
    assert.ok(!/showToast\((T\.)?TOAST_UNDONE/.test(code(rel)), `${rel}: shows "Undone" itself (the line does)`);
  }

  // R2-07: the shared sentences, typed once
  assert.equal(StaffWords.candidateStale('Spring 2027'), SharedWords.someoneElseChanged('Spring 2027'));
  assert.equal(StaffWords.someoneElseChanged('this cycle'), 'Someone else changed this cycle just now, so nothing was done. Their change is shown.');
  assert.equal(StaffWords.UNDO_FAILED, SharedWords.UNDO_DIDNT_SAVE);
  assert.equal(ResultsWords.undoSentRefusal('error'), SharedWords.UNDO_DIDNT_SAVE, 'a failed Undo Mark as sent says the shared sentence');
  assert.equal(StaffWords.switchProblem('stale'), 'Someone else changed this cycle just now, so nothing was done. Their change is shown.');
  for (const gone of ['SWITCH_STALE', 'DELETE_STALE', 'UNDO_STALE', 'UNDO_RUBRIC_STALE', 'RUBRIC_UNDO_FAILED']) assert.equal(StaffWords[gone], undefined, `StaffWords.${gone} is gone`);
  for (const gone of ['UNDO_STALE', 'UNDO_FAILED', 'TOAST_UNDONE']) assert.equal(ResultsWords[gone], undefined, `ResultsWords.${gone} is gone`);
  assert.equal(StaffWords.UNDO_SECTION, 'Black Belt');

  // S-2: every load sentence ends "then retry." (and each has a Retry button on its screen)
  assert.equal(StaffWords.LOAD_FAILED, SharedWords.LOAD_FAILED);
  for (const [name, text] of Object.entries({
    results: ResultsWords.LOAD_FAILED,
    print: ResultsWords.PRINT_FAILED,
    texts: ResultsWords.TEXTS_LOAD_FAILED,
    address: ResultsWords.addressFailed('Mia Chen'),
    grades: GradingWords.LOAD_GRADES_FAILED,
    rubric: StaffWords.RUBRIC_LOAD_FAILED,
  })) assert.match(text, /Check the connection, then retry\.$/, `${name}: "${text}" must end "Check the connection, then retry."`);
  assert.equal(ResultsWords.LOAD_FAILED, "Couldn't load the results. Check the connection, then retry.");
  // the two reads that showed no Retry now have one: opening Edit cycle and the read before Delete cycle
  assert.ok(/handleLoadProblem\(result\.status, \(\) => openEdit\(/.test(code('cycle/useCycleEditor.jsx')), 'Edit cycle: a failed read repeats itself');
  assert.ok(/handleLoadProblem\(result\.status, \(\) => openAdd\(/.test(code('cycle/useCycleEditor.jsx')), 'Add cycle: a failed read repeats itself');
  assert.ok(/startDelete\(cycle, anchor\)/.test(code('cycles/CyclesTab.jsx').split('async function confirmDelete')[0].split('async function startDelete')[1] ?? ''), 'Delete cycle: the failed read repeats itself');

  // R3-13: the staff calendars say "days" (the shared words)
  assert.equal(StaffWords.PAST_DAYS_HINT, "Past days can't be chosen.");
  assert.ok(code('cycle/DayDialog.jsx').includes('T.PAST_DAYS_HINT') && code('cycle/PricesSection.jsx').includes('T.PAST_DAYS_HINT'), 'both staff calendars use the shared hint');

  // S-10: the browser dropdown of the result-text box is the shared Select
  assert.ok(code('rubric/ResultTextDialog.jsx').includes("components/Select.jsx") && code('rubric/ResultTextDialog.jsx').includes('<Select'), 'Preview with is the shared Select');

  // R4-08: Email result's unavailable look and its description (both ids when both lines show)
  const css = source('results/results.css');
  const block = css.slice(css.indexOf(".bbres-panel .bbres-email[aria-disabled='true']"));
  assert.ok(block.includes('var(--color-border-strong)') && block.slice(0, block.indexOf('}')).includes('cursor: not-allowed'), 'Email result: the v1.103 gray look');
  assert.ok(code('results/ResultRows.jsx').includes('aria-describedby={ctx.emailWhyId}'), 'Email result points at its why lines');
  assert.ok(/emailWhyId:[^\n]*-hidden[^\n]*-rows/.test(code('results/ResultsTab.jsx')), 'emailWhyId lists the hidden-details line and the offline line');
  assert.ok(code('results/ResultsTab.jsx').includes('id={`${whyId}-hidden`}'), 'the hidden-details line has the id Email result points at');

  // ----- Review of batch 4 (privacy and the queued Undo) -----
  // C5: all six lines name the section the same way (the bar after the person left says "(Black Belt)")
  for (const rel of [...lineUsers]) assert.ok(!/section: T\.PAGE_TITLE/.test(code(rel)), `${rel}: the line's section is UNDO_SECTION, not the page title`);
  assert.ok(/section: T\.UNDO_SECTION/.test(code('candidates/useCandidateActions.js')), 'the Candidates line names the section "Black Belt"');
  // C1 / C8: a save always ends the line in a finally with its real status — no end() without a status in the cycle side
  // and Results (the one read, Email result's address, is the only bare end()), and no end() that forgets the retry
  const resultsCode = code('results/ResultsTab.jsx');
  assert.equal((resultsCode.match(/\bend\(\)/g) ?? []).length, 1, 'Results: only the address read ends without a status');
  assert.ok(/end\(answer\.status, \(\) => markAsSent\(/.test(resultsCode) && /end\(answer\.status, \(\) => confirmUndo\(/.test(resultsCode), 'Results: Mark as sent and its Undo end with the real status and a retry');
  assert.ok(!/line\.end\(status\);/.test(resultsCode + code('cycles/CyclesTab.jsx') + code('cycle/CyclePage.jsx')), 'a save ends the line with a retry and its token');
  for (const rel of ['cycles/CyclesTab.jsx', 'cycle/CyclePage.jsx']) assert.ok(/line\.end\(status, \{ retry, token: tokenRef\.current \}\)/.test(code(rel)), `${rel}: endWrite(status, retry) with the save's token`);
  const editorCode = code('cycle/useCycleEditor.jsx');
  assert.ok(editorCode.includes('const finish = (status)') && !/\bendWrite\('ok'\)/.test(editorCode) && !/endWrite\(result\.status\);\n\s*const status/.test(editorCode), 'Edit cycle: save() frees the line once, through finish()');
  assert.ok(/finally \{[^}]*a\.endWrite\(again\.status, \(\) => retrySwitch\(/.test(editorCode), 'the registration switch Retry ends the line in a finally with a retry');
  assert.ok(/finally \{[\s\S]{0,160}a\.endWrite\(result\.status, \(\) => switchRegistration\(/.test(code('cycles/useCycleActions.js')), 'Close / Open registration ends the line in a finally with a retry');
  assert.ok(/saveCall\(/.test(code('candidates/useCandidateActions.js')) && !/\n\s*endWrite\(result\.status, \(\) =>/.test(code('candidates/useCandidateActions.js')), 'Candidates: every save goes through saveCall (always ended)');
  // C2 (v1.128): the page bars the save line can fill are the shared PageBar, drawn under the top bar (it takes the
  // focus the line asks for); a bar INSIDE a box stays inside it: the candidate detail's is a LineBar, the rubric
  // editor's on the phone's full-screen page too. Every page bar is cleared with focus returned to the tab (useBarFocusReturn).
  for (const rel of ['cycles/CyclesTab.jsx', 'cycle/CyclePage.jsx', 'rubric/RubricTab.jsx', 'rubric/ResultEmailsBlock.jsx', 'results/ResultsTab.jsx']) {
    const src = code(rel);
    assert.ok(/<PageBar[\s\S]{0,120}takeFocus=\{banner\.takeFocus === true\}/.test(src), `${rel}: its line bar is a PageBar`);
    assert.ok(!/<LineBar/.test(src), `${rel}: no LineBar is left on a page`);
    assert.ok(src.includes('useBarFocusReturn('), `${rel}: focus returns to the tab when the bar goes`);
  }
  const cardSrc = code('rubric/RubricCard.jsx');
  assert.ok(/<PageBar \{\.\.\.barProps\}/.test(cardSrc) && /<LineBar focusKey=\{banner\} \{\.\.\.barProps\}/.test(cardSrc), 'RubricCard: PageBar in the page, LineBar inside the phone editor page');
  assert.ok(/phoneEditorOpen = isPhone && editing/.test(cardSrc) && /banner && !phoneEditorOpen \? <PageBar/.test(cardSrc) && /banner && phoneEditorOpen \? <LineBar/.test(cardSrc), 'RubricCard: only one of the two bars is drawn');
  for (const rel of ['cycle/CyclePage.jsx', 'cycle/CycleRubricTab.jsx', 'cycles/CyclesTab.jsx', 'candidates/CandidatesTab.jsx', 'results/ResultsTab.jsx', 'rubric/RubricTab.jsx', 'rubric/ResultEmailsBlock.jsx', 'rubric/DefaultRubricCard.jsx', 'grading/GradingTab.jsx']) {
    assert.ok(code(rel).includes('<PageBar') && !/<ErrorBanner/.test(code(rel)), `${rel}: its page bars (including "couldn't load") are PageBars, none is an ErrorBanner`);
  }
  assert.ok(/<LineBar/.test(code('candidates/CandidateDialog.jsx')) && !/<PageBar/.test(code('candidates/CandidateDialog.jsx')), 'the candidate detail keeps its bar INSIDE the detail (LineBar, never PageBar)');
  for (const rel of ['candidates/CandidateDialog.jsx', 'cycle/CycleDialog.jsx', 'candidates/dialogParts.jsx', 'rubric/KeepYearsDialog.jsx', 'rubric/WaiverDialog.jsx', 'candidates/MakeupPickerDialog.jsx', 'candidates/SignatureDialog.jsx']) {
    assert.ok(!/<PageBar/.test(code(rel)), `${rel}: a bar inside a box is never a PageBar`);
  }
  assert.ok(code('parts/LineBar.jsx').includes('.errbar-retry') && code('parts/LineBar.jsx').includes('.errbar-dismiss'), 'LineBar moves focus to Retry, else ×');
  const returnSrc = code('parts/useBarFocusReturn.js');
  assert.ok(returnSrc.includes("'.shell-pagebars'") && returnSrc.includes('focusin') && returnSrc.includes('toast-region'), 'useBarFocusReturn: watches focus in the page bar slot and only moves focus that fell');
  // C3: Results' Email result / Mark as sent are unavailable while the line is busy
  assert.ok(/ctx\.lineBusy/.test(code('results/ResultRows.jsx')) && /lineBusy: line\.busy/.test(resultsCode), 'Results rows go gray while the save line is busy');
  // C4: the locked Dan is described by its hint whoever is locked out
  assert.ok(/describedBy=\{danLocked \?/.test(code('candidates/CandidateDialog.jsx')), 'the locked Dan points at its hint');
  // S3: while Hide private details is on, an Undo's refusal is one neutral sentence — no payment words
  assert.equal(StaffWords.UNDO_AT_DESK, "Couldn't undo. Do it at the desk.");
  assert.ok(!/pay|paid|\$|grade/i.test(StaffWords.UNDO_AT_DESK), 'the neutral Undo sentence says nothing about money');
  assert.ok(/paymentsHidden\s*\?\s*T\.UNDO_AT_DESK/.test(code('candidates/useCandidateActions.js')), 'undoRun: neutral refusal while hidden');
  assert.ok(/a\.paymentsHidden\s*\?\s*T\.UNDO_AT_DESK/.test(code('candidates/useMakeupPicker.js')), 'undoAdd: neutral refusal while hidden');
  // S2: a money Undo's bar is marked, and the switch removes it
  assert.ok(/moneyUndo/.test(code('candidates/useCandidateActions.js')) && /current\?\.moneyUndo \? null/.test(code('candidates/useCandidateActions.js')), 'paymentsHiddenNow removes the bar of a money Undo');
  // SEC1: a money Undo that FAILS after the switch turned on draws no bar (its Retry would run a payment Undo on the hidden tablet)
  assert.ok(/if \(lastUndoMoney\.current && latest\.current\.paymentsHidden\) return;\s*\n\s*report\(\{ text: bar\.text/.test(code('candidates/useCandidateActions.js')), 'undoBar: a money Undo failing while hidden shows no bar and no Retry');
  // C1: the focus-return hook runs above RubricCard's early return (same hooks on every render)
  const cardCode = code('rubric/RubricCard.jsx');
  assert.ok(cardCode.indexOf('useBarFocusReturn(Boolean(banner)') > -1 && cardCode.indexOf('useBarFocusReturn(Boolean(banner)') < cardCode.indexOf('if (!rubric) return null;'), 'RubricCard: useBarFocusReturn is called before the early return');
  // C5: "couldn't load" bars (drawn from the load's status) are covered by the focus return too
  for (const rel of ['cycle/CyclePage.jsx', 'cycle/CycleRubricTab.jsx', 'rubric/RubricTab.jsx', 'rubric/DefaultRubricCard.jsx', 'rubric/ResultEmailsBlock.jsx', 'grading/GradingTab.jsx', 'results/ResultsTab.jsx', 'candidates/CandidatesTab.jsx', 'cycles/CyclesTab.jsx']) {
    assert.ok(/useBarFocusReturn\([^\n]*(status === 'error'|live\.status !== 'loading')/.test(code(rel)), `${rel}: its "couldn't load" bar hands focus to the tab when it closes`);
  }
  // C6: leaving the bar by a click on blank space (focusout, no new target) clears the hook's memory
  assert.ok(/addEventListener\('focusout'/.test(code('parts/useBarFocusReturn.js')), 'useBarFocusReturn: a focusout away from the bar clears the memory');
  // S4: the words a money Undo gives the line (shown on any page after the person left) never hold an amount
  for (const fn of ['paymentUndoWords', 'refundUndoWords', 'returnedUndoWords', 'planUndoWords']) {
    const words = StaffWords[fn]('Sam Lee');
    assert.ok(words.includes('Sam Lee') && !/[$\d]/.test(words), `${fn}: "${words}" names who and what, never an amount`);
  }
  assert.ok(!/undoToast\(words, \(\) => undoPayment/.test(code('candidates/useCandidateActions.js')), 'no money Undo gives the line the toast words (they hold the amount)');
});

// ----- R1-07 second part (rulebook v1.135): one set of payment-line and History words -----
check('v1.135 payment line: the shared base, Black Belt extras in order, phone variant, refund, History words, old wording gone', () => {
  const W = StaffWords;
  // the base, Star's: "$140 card · paid Nov 3" for cash / check / card
  assert.equal(W.paidDetail(14000, 'card', '2027-03-20'), '$140 card · paid Mar 20');
  assert.equal(W.paidDetail(14000, 'cash', '2027-03-20'), '$140 cash · paid Mar 20');
  assert.equal(W.paidDetail(33000, 'check', '2027-03-27'), '$330 check · paid Mar 27');
  // a refund and the phone variants
  assert.equal(W.refundedDetail(2300, 'cash', '2027-03-20'), 'refunded $23 cash Mar 20');
  assert.equal(W.paidOnPhone('card', '2027-03-20'), 'Card · paid Mar 20');
  assert.equal(W.refundedOnPhone('cash', '2027-03-20'), 'Cash · refunded Mar 20');
  // Black Belt's extras, in the decided order: paid date, for what, (no school), by who
  assert.equal(
    W.paymentLine({ kind: 'payment', cents: 87000, method: 'card', iso: '2027-03-20', what: 'payments 1, 2 and 3', by: 'Jeffrey Berg' }),
    '$870 card · paid Mar 20 · for payments 1, 2 and 3 · by Jeffrey Berg',
  );
  assert.equal(W.paymentLine({ kind: 'payment', cents: 33000, method: 'check', iso: '2027-03-27', what: '', by: '' }), '$330 check · paid Mar 27');
  assert.equal(W.paymentLine({ kind: 'refund', cents: -2300, method: 'cash', iso: '2027-03-20', what: 'Refund', by: 'Jeffrey Berg' }), 'refunded $23 cash Mar 20 · by Jeffrey Berg');
  // History: "Payment recorded: $330 check, paid Mar 27" and "Payment undone: $330" (no extra words)
  assert.equal(W.historyPayment(33000, 'check', '2027-03-27'), 'Payment recorded: $330 check, paid Mar 27');
  assert.equal(W.historyPaymentUndone(33000), 'Payment undone: $330');
  // the real source: the phone block and the ⋯ sheet use the shared line, and the old wording is gone
  const dialog = readFileSync(new URL('../../blackBelt/staff/candidates/CandidateDialog.jsx', import.meta.url), 'utf8');
  assert.ok(/T\.paidOnPhone\(/.test(dialog) && /T\.refundedOnPhone\(/.test(dialog), 'the phone block uses the shared phone variant');
  assert.ok(/T\.paymentLine\(/.test(dialog), 'the ⋯ sheet subtitle is the shared payment line');
  assert.ok(!/\[T\.monthDay\(line\.paidOn\), w\.how/.test(dialog), 'the old "date · how" phone line is gone');
  // the old money wording came from a local formatCents; the shared formatMoney replaced it, so any return of it fails here
  assert.ok(!/formatCents/.test(dialog), 'the dialog formats money with the shared formatMoney, never a local formatCents');
  assert.ok(/line\.kind === 'returned'\) return `\$\{T\.monthDay\(line\.paidOn\)\} · \$\{formatMoney\(line\.amountCents\)\}`/.test(dialog), 'only a returned check keeps the "Mar 20 · $870" subtitle, built with formatMoney');
  // Black Belt stores no Paying by on a candidate (the method is chosen per payment at the desk), so no Paying by line
  assert.ok(!/payingBy|chosen on the form/i.test(dialog), 'no Paying by line: Black Belt has no such data (v1.135 note)');
});
// Rulebook v1.051 (2) + Jeffrey "A for both" (Finance v0.826): every connection-failure sentence in the staff screens ends
// "Check the connection, then retry." (the public family forms keep "try again" beside a "Try again" button)
check('Connection-failure sentences say "then retry", not "then try again"', async () => {
  const staff = await import('../../blackBelt/staff/text.js');
  const results = await import('../../blackBelt/staff/results/text.js');
  const grading = await import('../../blackBelt/staff/grading/text.js');
  const sentences = [
    staff.SAVE_FAILED, staff.DELETE_FAILED, staff.ACTION_FAILED, staff.UNDO_BOX_FAILED, staff.LOAD_FAILED,
    results.MESSAGE_NOT_READY, results.CSV_FAILED, results.TEXT_SAVE_FAILED, results.LOAD_FAILED,
    results.addressFailed('Mia'), grading.LOAD_GRADES_FAILED,
  ];
  for (const s of sentences) {
    assert.ok(typeof s === 'string' && s.length > 0, 'a sentence is missing: ' + s);
    assert.ok(/Check the connection, then retry\.$/.test(s), 'ends "Check the connection, then retry.": ' + s);
  }
  // none of Black Belt's staff text still says "then try again" (validation messages keep "Check the fields and try again.")
  for (const [name, mod] of Object.entries({ staff, results, grading })) {
    for (const [key, value] of Object.entries(mod)) {
      if (typeof value !== 'string') continue; // only the plain sentences (the one function sentence, addressFailed, is checked above)
      const text = value;
      assert.ok(!/then try again/i.test(text), name + '.' + key + ' still says "then try again": ' + text);
    }
  }
});
// Design review R4-03 + Jeffrey's rule: the hidden-payments line and the failed-Undo line are the shared sentences, and
// every Black Belt sentence a person reads uses straight apostrophes and quotes (the starting result emails in
// resultEmail.js are stored texts and are left alone; so are code comments).
check('R4-03: shared hidden / failed-Undo words, straight apostrophes in Black Belt sentences', async () => {
  const staff = await import('../../blackBelt/staff/text.js');
  const shared = await import('../../components/text.js');
  const priv = await import('../privateDetails.js');
  assert.equal(staff.PAYMENTS_HIDDEN, priv.PAYMENT_DETAILS_HIDDEN);
  assert.equal(staff.PAYMENTS_HIDDEN, 'Payment details are hidden on this tablet.');
  assert.equal(staff.HIDDEN_ON_DEVICE, priv.HIDDEN_ON_THIS_TABLET);
  assert.equal(staff.UNDO_BOX_FAILED, shared.UNDO_DIDNT_SAVE);
  assert.equal(staff.UNDO_BOX_FAILED, "Undo didn't save. Check the connection, then retry.");
  for (const rel of ['staff/text.js', 'form/text.js', 'staff/results/text.js', 'staff/grading/text.js', 'staff/rubric/problemText.js', 'staff/receipt/text.js']) {
    const text = readFileSync(new URL(`../../blackBelt/${rel}`, import.meta.url), 'utf8');
    const code = text.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    assert.ok(!/[‘’“”]/.test(code.replace(/\/\/.*$/gm, '')), `${rel}: a curly apostrophe or quote in a sentence`);
  }
});
// Design review D1 + D3 + D2 (source checks, pure text): the bar code never scrolls the page by focusing, the rubric
// card clears its bar when the editor closes, and the failure bars inside dialogs scroll into view.
check('D1/D2/D3: focus keeps the page still; the rubric bar goes with its draft; dialog bars scroll into view', () => {
  const read = (rel) => readFileSync(new URL(`../../blackBelt/${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // D1: × / a Retry that works hands focus to the tab WITHOUT scrolling the page (rulebook v1.124)
  const focusTab = read('staff/parts/focusCurrentTab.js');
  assert.ok(/tab\?\.focus\(\{ preventScroll: true \}\)/.test(focusTab), 'focusCurrentTab must focus with preventScroll');
  assert.ok(!/\.focus\(\)/.test(focusTab.replace(/\/\/.*$/gm, '')), 'focusCurrentTab has a focus() call without preventScroll');
  assert.ok(/target\.focus\(\{ preventScroll: true \}\)/.test(read('staff/parts/LineBar.jsx')), 'LineBar must focus with preventScroll');
  // D3: closing the editor clears the card's bar, and a Retry always runs the latest save
  const card = read('staff/rubric/RubricCard.jsx');
  const stop = card.slice(card.indexOf('function stopEdit()'), card.indexOf('// A newer version of the Dan being edited'));
  assert.ok(/d\.stop\(\);/.test(stop) && /setBanner\(null\)/.test(stop), 'stopEdit must clear the card bar');
  assert.ok(/retry: \(\) => saveRef\.current\?\.\(\)/.test(card), 'the failed-save Retry must go through saveRef');
  assert.ok(!/retry: \(\) => save\(\)/.test(card), 'a Retry that calls the save of an old render can save a discarded draft');
  // D2: every failed-save bar inside a dialog is a DialogBar (scrolls into view) and the bar itself scrolls with block 'nearest'
  const bar = read('staff/parts/DialogBar.jsx');
  assert.ok(/scrollIntoView\?\.\(\{ block: 'nearest' \}\)/.test(bar) && /\.errbar/.test(bar), 'DialogBar must scroll its .errbar into view');
  assert.ok(!/\.focus\(/.test(bar.replace(/\/\/.*$/gm, '')), 'DialogBar must not take focus');
  for (const rel of ['staff/candidates/dialogParts.jsx', 'staff/rubric/WaiverDialog.jsx', 'staff/rubric/KeepYearsDialog.jsx', 'staff/candidates/MakeupPickerDialog.jsx']) {
    assert.ok(read(rel).includes("import DialogBar from '../parts/DialogBar.jsx'"), `${rel} must use DialogBar`);
  }
  assert.ok(/failed \? <DialogBar/.test(read('staff/candidates/dialogParts.jsx')) || /state\.failed \? <DialogBar/.test(read('staff/candidates/dialogParts.jsx')), 'FailedBanner must draw a DialogBar');
  assert.ok(/e\.failed && <DialogBar/.test(read('staff/candidates/CandidateDialog.jsx')), 'the candidate edit bar must be a DialogBar');
});
// Focus after the rubric editor closes (source check, pure text): Cancel / Discard / a finished save removes the
// button that had focus, so stopEdit hands focus to the current tab button (only when focus was in the editor, its
// dialogs or nowhere, and only if it has fallen by the next frame), and the helper never scrolls.
check('rubric editor close: focus goes to the current tab, only when it was in the editor, without scrolling', () => {
  const read = (rel) => readFileSync(new URL(`../../blackBelt/${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const card = read('staff/rubric/RubricCard.jsx');
  const stop = card.slice(card.indexOf('function stopEdit()'), card.indexOf('// A newer version of the Dan being edited'));
  assert.ok(/focusWasHere/.test(stop) && /editTopRef\.current\?\.contains\(active\)/.test(stop), 'stopEdit must remember whether focus was in the editor');
  assert.ok(/document\.body/.test(stop) && /\[aria-modal="true"\]/.test(stop), 'stopEdit must also count focus on the body or in a dialog');
  assert.ok(/if \(focusWasHere\)/.test(stop) && /requestAnimationFrame/.test(stop), 'stopEdit must wait one frame');
  assert.ok(/if \(fallen\) focusCurrentTab\(\)/.test(stop), 'stopEdit must only hand focus over when it has fallen');
  assert.ok(/import \{ focusCurrentTab \} from '\.\.\/parts\/focusCurrentTab\.js'/.test(card), 'RubricCard must import focusCurrentTab');
  const focusTab = read('staff/parts/focusCurrentTab.js');
  assert.ok(/tab\?\.focus\(\{ preventScroll: true \}\)/.test(focusTab), 'focusCurrentTab must keep preventScroll');
});
console.log(`${count} groups of checks ran.`);
console.log('ALL BLACK BELT LIB CHECKS PASSED');
