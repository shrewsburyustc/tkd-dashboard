// checks.mjs — automatic checks for the Black Belt data layer (phases B1 and B2). Run:
//   node src/lib/blackBelt/checks.mjs
// Why it exists: rules.js, money.js, the preview database (mockBlackBelt.js) and the family form's
// preview stand-in (publicApi.preview.js) carry rules that must match migration 0016 exactly.
// These plain `assert` checks run in well under a second without a browser or a database, and
// print ALL BLACK BELT LIB CHECKS PASSED (contracts 0016-B1 §5 and 0016-B2 §5). They replay the
// database test cases (0016_tests.sql T3–T8) that don't need real sign-in sessions, check that
// startingPoint.js holds exactly the migration's seed, and check that no preview function ever
// changes or removes a payment row (payments are append-only).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parsePrice, priceIsValid, PRICE_MAX_CENTS, PRICE_MIN_CENTS, parseAmount, formatCents, amountInputText } from './money.js';
import {
  cycleState, cycleTag, timeIsValid, TIME_OPTIONS, timeLabel, timeRangeLabel, dayProblems, partsWithoutDay, cycleFormProblems,
  hasProblems, followApplicationDue, setPaymentDueDate, buildAddPayload, buildUpdatePayload, cycleToForm, planTotals,
  kukkiwonRange, ageOn, isUnder18OnFirstDay, scheduleFor, planSummary, emailIsValid, codeIsValid, waiverVersionOk,
  nextWaiverVersionName, waiverBodyProblem, keepYearsProblem, purgeDueOn, addYears, placeProblem, findDuplicateCycle,
  partsAlsoOnOtherDays, effectiveDueOn, PARTS,
  candidateItems, candidateMoney, liveLines, hasLivePayment, cycleCandidateItems, predictMoney, dueNowItems, nextItems, defaultTicks,
  sumRemaining, rosterCards, rosterFilter, searchMatches, duplicatePairs, pairReturnedLines,
} from './rules.js';
import { blackBeltLink, qrSvgDataUrl, qrFileName, qrPngBlob } from './qr.js';
import {
  STARTING_POINT_SCHEDULE, STARTING_POINT_REQUIREMENTS, STARTING_POINT_NAME, SEED_WAIVER_BODY, SEED_WAIVER_VERSION_NAME,
} from './startingPoint.js';
import { todayInSchoolTime } from '../testing/eventRules.js';
import { createBlackBeltBackend, BB_RPC_NAMES, BB_WRITE_RPC_NAMES, BB_TABLES, BB_STORE_KEY } from './mockBlackBelt.js';

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
  assert.equal(SEED_WAIVER_BODY, waiver[1]);
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

check('rules: time rule (06:00–22:00, 15-minute steps)', () => {
  assert.equal(timeIsValid('07:45'), true);
  assert.equal(timeIsValid('22:15'), false); // after 10 PM
  assert.equal(timeIsValid('10:10'), false); // not on a 15-minute step
  assert.equal(timeIsValid('06:00'), true);
  assert.equal(timeIsValid('22:00'), true);
  assert.equal(timeIsValid('05:45'), false);
  assert.equal(timeIsValid('12:30:00'), true);
  assert.equal(timeIsValid('12:30:15'), false); // seconds
  assert.equal(timeIsValid('25:00'), false);
  assert.equal(timeIsValid(''), false);
  assert.equal(timeIsValid(null), false);
  assert.equal(TIME_OPTIONS.length, 65);
  assert.equal(TIME_OPTIONS[0], '06:00');
  assert.equal(TIME_OPTIONS[TIME_OPTIONS.length - 1], '22:00');
  assert.ok(TIME_OPTIONS.every(timeIsValid));
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
  assert.deepEqual(dayProblems(goodDay({ start: '10:10' }), { today: TODAY }), { start: 'badTime' });
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
  assert.equal(edit((f) => { f.days[1].start = '10:10'; }).days[1].start, 'badTime');
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
  assert.equal(qrFileName('Spring 2027', 'Shrewsbury'), 'Black Belt Spring 2027 - Shrewsbury QR.png');
  assert.equal(qrFileName('Spring/Fall: 2027?', 'Worcester'), 'Black Belt SpringFall 2027 - Worcester QR.png');
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
  assert.equal(BB_TABLES.length, 13);
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
  assert.deepEqual(c.requirements, STARTING_POINT_REQUIREMENTS); // copied from the starting point
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
  // copying from a cycle copies ITS requirements
  const fromSpring = call('bb_add_cycle', addArgs({ ...goodForm(), name: 'Summer 2027', pricesFrom: 'Spring 2027' }, c.id));
  assert.equal(fromSpring.status, 'ok');
  assert.deepEqual(db().bb_cycles.find((x) => x.id === fromSpring.id).requirements, c.requirements);
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
    '10:10': (p) => { p.days[1].start_time = '10:10'; },
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
  const opened = sw(true, 1, STAFF); // staff may open before Application due
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
    '1 shrewsbury Kim', '1 worcester Chen', '1 worcester Patel', '2 shrewsbury Brooks', '2 worcester Lee', '2 worcester Silva',
    '2 worcester Silva', '3 shrewsbury Nguyen', '4 shrewsbury Garcia',
  ]);
  assert.deepEqual(Object.keys(answer.rows[0]).sort(), ['dan', 'duplicate_of', 'duplicate_state', 'first_name', 'has_payment_rows', 'id', 'kukkiwon',
    'last_name', 'location_code', 'money', 'plan_id', 'plan_name', 'reference', 'registered_at', 'source', 'status', 'version', 'withdrawn_reason'].sort());
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
    'version', 'withdrawn_at', 'withdrawn_by_name', 'withdrawn_reason'].sort());
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
    assert.equal(await qrPngBlob(code), null);
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
})();

console.log(`${count} groups of checks ran.`);
console.log('ALL BLACK BELT LIB CHECKS PASSED');
