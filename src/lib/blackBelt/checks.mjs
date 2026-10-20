// checks.mjs — automatic checks for the Black Belt data layer (phase B1). Run:
//   node src/lib/blackBelt/checks.mjs
// Why it exists: rules.js, money.js, the preview database (mockBlackBelt.js) and the family form's
// preview stand-in (publicApi.preview.js) carry rules that must match migration 0016 exactly.
// These plain `assert` checks run in well under a second without a browser or a database, and
// print ALL BLACK BELT LIB CHECKS PASSED (contract 0016-B1 §5). They replay the database test
// cases (0016_tests.sql T3–T5, T8) that don't need real sign-in sessions, and check that
// startingPoint.js holds exactly the migration's seed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parsePrice, priceIsValid, PRICE_MAX_CENTS, PRICE_MIN_CENTS } from './money.js';
import {
  cycleState, cycleTag, timeIsValid, TIME_OPTIONS, timeLabel, timeRangeLabel, dayProblems, partsWithoutDay, cycleFormProblems,
  hasProblems, followApplicationDue, setPaymentDueDate, buildAddPayload, buildUpdatePayload, cycleToForm, planTotals,
  kukkiwonRange, ageOn, isUnder18OnFirstDay, scheduleFor, planSummary, emailIsValid, codeIsValid, waiverVersionOk,
  nextWaiverVersionName, waiverBodyProblem, keepYearsProblem, purgeDueOn, addYears, placeProblem, findDuplicateCycle,
  partsAlsoOnOtherDays, effectiveDueOn, PARTS,
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
