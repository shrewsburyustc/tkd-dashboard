// checks.mjs — automatic checks for the Camps data layer. Run:  node src/lib/camps/checks.mjs
// Why it exists: campRules.js, qr.js and the preview database (mockCamps.js) carry rules that must
// match the real database (migration 0013) exactly — above all the shared price case table of
// contract 0013 §1.20, which the SQL tests (0013_tests.sql) check with the same rows. These plain
// `assert` checks run in well under a second without a browser or a database, and print
// ALL CAMPS LIB CHECKS PASSED (contract 0013 §5.5).
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import {
  CAMP_ACK_VERSION, DEFAULT_AGES, AGE_LIMITS, MAX_DAYS, MAX_EXTRAS, MAX_CHILDREN, MAX_CAMPER_CENTS, SIGNATURE_KEEP_YEARS,
  CAMP_TRIES_PER_HOUR, UNDO_WINDOW_MS, PAYING_BY, DEFAULT_EARLY_DAYS_BEFORE, DEFAULT_CLOSES_DAYS_BEFORE,
  signupState, campTag, isCampWeek, defaultCampTab, defaultCheckInDay, campsForLocation, campCounts, priceKind, baseCents,
  priceChild, familyTotal, isAllDays, payTag, toCollectCents, checkInRule, checkInNote, attendanceCell, cameCount, validateAges,
  ageAllowed, phoneDigits, formatPhone, templateFromCamp, campDatesFromTemplate, gridRowsFor, campLink, toCamel, toSnake,
  childProblem, offsetsAreValid, todayInSchoolTime, campTextIsValid, normalizeCampText, extraDaysRemoved,
  gridSizeFor, comesAllWeek, MAX_WEEK_DAYS,
  campWeeks, defaultWeekIndex, paymentSchoolFor, extraDaysFor, extraOfferedOn, extraCountOnDay, missingExtraOnDay, onlyOnToWeekdays, weekdaysToOnlyOn, isoWeekday,
} from './campRules.js';
import { qrFileName, campQrSvgDataUrl, campLink as qrCampLink } from './qr.js';
import { campArgs, templateArgs, toExtra, toTemplate, EXTRA_COLUMNS, TEMPLATE_COLUMNS } from './campsArgs.js';
import {
  createCampsBackend, defaultCampsData, md5, schoolClockToIso, DEFAULT_CAMP_CODES, CAMP_RPC_NAMES, CAMP_RESTRICTED_RPC_NAMES, CAMP_TABLES,
} from '../mockCamps.js';

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

// ======================= constants =======================

check('constants (§5.1)', () => {
  assert.equal(CAMP_ACK_VERSION, 'camp-2026-10-18');
  assert.deepEqual(DEFAULT_AGES, { min: 3, max: 17 });
  assert.deepEqual(AGE_LIMITS, { min: 1, max: 99 });
  assert.equal(MAX_DAYS, 60); // weekly pricing R4 (was 10)
  assert.equal(MAX_EXTRAS, 10);
  assert.equal(MAX_CHILDREN, 3);
  assert.equal(MAX_CAMPER_CENTS, 1000000); // weekly pricing R5 (was 200000)
  assert.equal(SIGNATURE_KEEP_YEARS, 3);
  assert.equal(CAMP_TRIES_PER_HOUR, 30);
  assert.equal(UNDO_WINDOW_MS, 10000);
  assert.deepEqual(PAYING_BY, ['cash', 'check', 'card']);
  assert.equal(DEFAULT_EARLY_DAYS_BEFORE, 7);
  assert.equal(DEFAULT_CLOSES_DAYS_BEFORE, 1);
});

// ======================= the April Vacation Camp of the case table (§1.20) =======================

const DAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri'].map((d, i) => `00000000-0000-4000-8000-00000000d00${i + 1}`);
const [MON, TUE, WED, THU, FRI] = DAY_IDS;
const APRIL_DAYS = ['2027-04-19', '2027-04-20', '2027-04-21', '2027-04-22', '2027-04-23'].map((day, i) => ({ dayId: DAY_IDS[i], day }));
const grid = (rows) => rows.map(([dayCount, a, b, c, d]) => ({
  dayCount, memberEarlyCents: a * 100, memberRegularCents: b * 100, nonmemberEarlyCents: c * 100, nonmemberRegularCents: d * 100,
}));
const APRIL_PRICES = grid([[1, 75, 80, 85, 90], [2, 140, 150, 150, 160], [3, 195, 210, 205, 220], [4, 260, 280, 270, 290], [5, 275, 325, 285, 335]]);
const DROP = '00000000-0000-4000-8000-0000000000e1';
const PICK = '00000000-0000-4000-8000-0000000000e2';
const PIZZA = '00000000-0000-4000-8000-0000000000e3';
const APRIL_EXTRAS = [
  { extraId: DROP, name: 'Early drop-off', priceCents: 1500, per: 'day', notForAllDays: false, onlyOn: [], sort: 0 },
  { extraId: PICK, name: 'Late pick-up', priceCents: 800, per: 'day', notForAllDays: false, onlyOn: [], sort: 1 },
  // Owner decision 2026-10-19: the pizza party is a per-day extra offered only on Wed and Fri.
  { extraId: PIZZA, name: 'Pizza party', priceCents: 500, per: 'day', notForAllDays: true, onlyOn: ['2027-04-21', '2027-04-23'], sort: 2 },
];
const APRIL_CAMP = {
  id: 'april', locationCode: 'worcester', bothSchools: true, name: 'April Vacation Camp', startTime: '09:00', endTime: '15:00',
  signupOpensOn: '2027-03-01', signupClosesOn: '2027-04-18', earlyUntil: '2027-04-12', closedByHand: false, minAge: 5, maxAge: 12,
  description: null, waiverText: 'Waiver', publicCode: 'k7m2qp4x', version: 1,
};
const child = (dayIds, member, extras = []) => ({ firstName: 'X', lastName: 'Y', age: 8, member, dayIds, extras });
const price = (c, kind) => priceChild(c, APRIL_PRICES, APRIL_EXTRAS, APRIL_DAYS, kind);
const problem = (c, kind) => childProblem(c, APRIL_PRICES, APRIL_EXTRAS, APRIL_DAYS, kind);

check('§1.20 price case table P1–P10', () => {
  // P1 Mia: Mon, Wed · non-member · early · pick-up Mon, Wed → $150 + $16
  const p1 = price(child([MON, WED], false, [{ extraId: PICK, dayIds: [MON, WED] }]), 'early');
  assert.equal(p1.totalCents, 16600);
  assert.equal(p1.baseCents, 15000);
  assert.deepEqual(p1.extras, [{ extraId: PICK, name: 'Late pick-up', per: 'day', count: 2, cents: 1600 }]);
  // P2 Ava: all 5 · member · early · drop-off ×5, pick-up ×5 → $275 + $75 + $40
  const p2 = price(child(DAY_IDS, true, [{ extraId: DROP, dayIds: DAY_IDS }, { extraId: PICK, dayIds: DAY_IDS }]), 'early');
  assert.equal(p2.totalCents, 39000);
  // P3 Ethan: Mon, Thu, Fri · member · early · drop-off ×3, pizza (Fri — his only pizza day) → $195 + $45 + $5
  const ethan = child([MON, THU, FRI], true, [{ extraId: DROP, dayIds: [MON, THU, FRI] }, { extraId: PIZZA, dayIds: [FRI] }]);
  assert.equal(price(ethan, 'early').totalCents, 24500);
  assert.equal(problem(ethan, 'early'), null);
  // P4 Leo: all 5 · member · early · drop-off ×5 → 35000; paid 33500 → owes 1500 → "Owes $15"
  const p4 = price(child(DAY_IDS, true, [{ extraId: DROP, dayIds: DAY_IDS }]), 'early');
  assert.equal(p4.totalCents, 35000);
  assert.equal(payTag({ duplicateState: 'none', paidCents: 33500, owesCents: p4.totalCents - 33500 }), 'owes');
  assert.equal(p4.totalCents - 33500, 1500);
  // P5 Noah: Mon, Tue, Wed · member · early · pick-up ×3 → $195 + $24
  assert.equal(price(child([MON, TUE, WED], true, [{ extraId: PICK, dayIds: [MON, TUE, WED] }]), 'early').totalCents, 21900);
  // P6 Liam: all 5 · member · regular → 32500
  assert.equal(price(child(DAY_IDS, true), 'regular').totalCents, 32500);
  // P7 Sofia: Mon, Tue · non-member · regular → 16000
  assert.equal(price(child([MON, TUE], false), 'regular').totalCents, 16000);
  // P8 Ava: all 5 · pizza → refused (not for all-days campers)
  assert.equal(problem(child(DAY_IDS, true, [{ extraId: PIZZA, dayIds: [WED, FRI] }]), 'early'), 'not_for_all_days');
  // P9 Ava (paid 39000) → pick-up only → 31500; owes −7500 → Paid
  const p9 = price(child(DAY_IDS, true, [{ extraId: PICK, dayIds: DAY_IDS }]), 'early');
  assert.equal(p9.totalCents, 31500);
  assert.equal(p9.totalCents - 39000, -7500);
  assert.equal(payTag({ duplicateState: 'none', paidCents: 39000, owesCents: -7500 }), 'paid');
  // P10 Mon Apr 12 11:59:59 PM vs Tue Apr 13 12:00:00 AM in New York (EDT, UTC−4)
  const before = todayInSchoolTime(Date.parse('2027-04-13T03:59:59Z'));
  const after = todayInSchoolTime(Date.parse('2027-04-13T04:00:00Z'));
  assert.equal(before, '2027-04-12');
  assert.equal(after, '2027-04-13');
  assert.equal(priceKind(before, '2027-04-12'), 'early');
  assert.equal(priceKind(after, '2027-04-12'), 'regular');
  assert.equal(price(child([MON], true), priceKind(before, '2027-04-12')).totalCents, 7500);
  assert.equal(price(child([MON], true), priceKind(after, '2027-04-12')).totalCents, 8000);
});

check('prices: every day count × member × early / regular is the grid cell', () => {
  for (const row of APRIL_PRICES) {
    const ids = DAY_IDS.slice(0, row.dayCount);
    assert.equal(price(child(ids, true), 'early').baseCents, row.memberEarlyCents);
    assert.equal(price(child(ids, true), 'regular').baseCents, row.memberRegularCents);
    assert.equal(price(child(ids, false), 'early').baseCents, row.nonmemberEarlyCents);
    assert.equal(price(child(ids, false), 'regular').baseCents, row.nonmemberRegularCents);
  }
  assert.equal(baseCents(APRIL_PRICES, 6, true, 'early'), null); // no such row
  assert.equal(familyTotal([{ totalCents: 16600 }, { totalCents: 21900 }]), 38500);
  assert.equal(familyTotal([]), 0);
  // A day id that isn't a camp day doesn't count; extras on days the child doesn't come don't either.
  assert.equal(price(child([MON, 'nope'], true), 'early').dayCount, 1);
  assert.equal(price(child([MON], true, [{ extraId: DROP, dayIds: [MON, TUE] }]), 'early').totalCents, 7500 + 1500);
});

check('extras rules (childProblem)', () => {
  assert.equal(problem(child([], true), 'early'), 'no_days');
  assert.equal(problem(child([MON, '00000000-0000-4000-8000-000000000999'], true), 'early'), 'unknown_day');
  assert.equal(problem(child([MON], true, [{ extraId: '00000000-0000-4000-8000-000000000998', dayIds: [] }]), 'early'), 'unknown_extra');
  const lunch = [{ extraId: PIZZA, name: 'Lunch', priceCents: 600, per: 'once', notForAllDays: false, onlyOn: [], sort: 0 }];
  assert.equal(childProblem(child([MON], true, [{ extraId: PIZZA, dayIds: [MON] }]), APRIL_PRICES, lunch, APRIL_DAYS, 'early'), 'once_with_days');
  assert.equal(price(child([MON], true), 'early').totalCents, 7500);
  assert.equal(problem(child([MON], true, [{ extraId: DROP, dayIds: [] }]), 'early'), 'no_extra_days');
  assert.equal(problem(child([MON], true, [{ extraId: DROP, dayIds: [TUE] }]), 'early'), 'extra_day_not_child_day');
  assert.equal(problem(child([MON, FRI], true, [{ extraId: PIZZA, dayIds: [FRI] }]), 'early'), null); // not all days: fine
  assert.equal(isAllDays(DAY_IDS, APRIL_DAYS), true);
  assert.equal(isAllDays([MON, TUE], APRIL_DAYS), false);
  assert.equal(isAllDays([], []), false);
  // Over $10,000 for one camper (weekly pricing R5)
  const costly = [{ extraId: DROP, name: 'Costly', priceCents: 500000, per: 'day', notForAllDays: false, sort: 0 }];
  assert.equal(childProblem(child([MON, TUE], true, [{ extraId: DROP, dayIds: [MON, TUE] }]), APRIL_PRICES, costly, APRIL_DAYS, 'early'), 'too_expensive');
});

check('extras offered only on some days (onlyOn, owner decision 2026-10-19)', () => {
  const pizza = APRIL_EXTRAS[2];
  assert.equal(extraOfferedOn(pizza, '2027-04-21'), true);
  assert.equal(extraOfferedOn(pizza, '2027-04-20'), false);
  assert.equal(extraOfferedOn(APRIL_EXTRAS[0], '2027-04-20'), true); // [] = every day
  // extraDaysFor = the child's days ∩ onlyOn (or the child's days when onlyOn is empty).
  const mtw = APRIL_DAYS.slice(0, 3);
  assert.deepEqual(extraDaysFor(pizza, mtw).map((d) => d.day), ['2027-04-21']);
  assert.deepEqual(extraDaysFor(APRIL_EXTRAS[0], mtw).map((d) => d.day), ['2027-04-19', '2027-04-20', '2027-04-21']);
  assert.deepEqual(extraDaysFor(pizza, [APRIL_DAYS[0]]), []);
  // Charged only when chosen, and only on offered days the child comes.
  const noah = (extras) => child([MON, TUE, WED], true, extras);
  assert.equal(price(noah([]), 'early').totalCents, 19500); // not chosen → not charged
  assert.equal(price(noah([{ extraId: PIZZA, dayIds: [WED] }]), 'early').totalCents, 20000);
  assert.equal(problem(noah([{ extraId: PIZZA, dayIds: [WED] }]), 'early'), null);
  assert.equal(problem(noah([{ extraId: PIZZA, dayIds: [MON, WED] }]), 'early'), 'extra_day_not_offered');
  assert.equal(price(noah([{ extraId: PIZZA, dayIds: [MON, WED] }]), 'early').totalCents, 20000); // Mon never counts
  assert.equal(problem(child([MON, WED, THU, FRI], false, [{ extraId: PIZZA, dayIds: [WED, FRI] }]), 'early'), null);
  assert.equal(price(child([MON, WED, THU, FRI], false, [{ extraId: PIZZA, dayIds: [WED, FRI] }]), 'early').totalCents, 27000 + 1000);
  // The days an edit takes away from an extra (among the remaining camp days).
  assert.deepEqual(extraDaysRemoved(['2027-04-21', '2027-04-23'], ['2027-04-23'], APRIL_DAYS), ['2027-04-21']);
  assert.deepEqual(extraDaysRemoved([], ['2027-04-21'], APRIL_DAYS), ['2027-04-19', '2027-04-20', '2027-04-22', '2027-04-23']);
  assert.deepEqual(extraDaysRemoved(['2027-04-21'], [], APRIL_DAYS), []); // widening never removes
  assert.deepEqual(extraDaysRemoved(['2027-04-21'], ['2027-04-21'], APRIL_DAYS.slice(0, 2)), []); // a removed camp day isn't counted here
  // Weekdays ↔ dates (templates keep weekdays).
  assert.equal(isoWeekday('2027-04-19'), 1);
  assert.equal(isoWeekday('2027-04-25'), 7);
  assert.deepEqual(onlyOnToWeekdays(['2027-04-23', '2027-04-21', '2027-04-28']), [3, 5]);
  assert.deepEqual(onlyOnToWeekdays([]), []);
  assert.deepEqual(weekdaysToOnlyOn([3, 5], APRIL_DAYS), ['2027-04-21', '2027-04-23']);
  assert.deepEqual(weekdaysToOnlyOn([3, 5], ['2026-11-25', '2026-11-27']), ['2026-11-25', '2026-11-27']); // Thanksgiving Wed & Fri
  assert.deepEqual(weekdaysToOnlyOn([6], APRIL_DAYS), []); // no Saturday in camp: nothing (the screen must catch this)
  assert.deepEqual(weekdaysToOnlyOn([], APRIL_DAYS), []);
  // "Pizza party today: N" and the "No pizza party" note.
  const r = (id, dayIds, extras = [], o = {}) => ({
    id, status: 'active', duplicateState: 'none', paidCents: 100, owesCents: 0,
    days: dayIds.map((dayId) => ({ dayId, day: APRIL_DAYS.find((d) => d.dayId === dayId).day, checkedInAt: null })),
    extras: extras.map(([extraId, dayId]) => ({ extraId, name: APRIL_EXTRAS.find((e) => e.extraId === extraId).name, per: 'day', dayId })), ...o,
  });
  const rows = [
    r('ava', DAY_IDS), // all days: pizza included
    r('noah', [MON, TUE, WED]), // no pizza
    r('mia', [MON, WED], [[PIZZA, WED], [PICK, WED]]),
    r('leo', DAY_IDS, [], { status: 'withdrawn' }),
    r('ethan', [MON, THU, FRI], [[PIZZA, FRI], [DROP, FRI]]),
  ];
  assert.equal(extraCountOnDay(rows, pizza, WED, APRIL_DAYS), 2); // Ava (all days) + Mia
  assert.equal(extraCountOnDay(rows, pizza, FRI, APRIL_DAYS), 2); // Ava + Ethan
  assert.equal(extraCountOnDay(rows, pizza, MON, APRIL_DAYS), 0); // not offered on Mon
  assert.equal(extraCountOnDay(rows, APRIL_EXTRAS[1], WED, APRIL_DAYS), 1); // pick-up: Mia only (not "included")
  assert.equal(missingExtraOnDay(rows[1], pizza, WED, APRIL_DAYS), true); // Noah
  assert.equal(missingExtraOnDay(rows[0], pizza, WED, APRIL_DAYS), false); // all days
  assert.equal(missingExtraOnDay(rows[2], pizza, WED, APRIL_DAYS), false); // chose it
  assert.equal(missingExtraOnDay(rows[1], pizza, MON, APRIL_DAYS), false); // not offered
  assert.equal(missingExtraOnDay(rows[4], pizza, WED, APRIL_DAYS), false); // doesn't come Wed
  // checkInNote: pay notes first, then "No pizza party", then drop-off / pick-up.
  assert.deepEqual(checkInNote(rows[1], WED, APRIL_EXTRAS, APRIL_DAYS), { kind: 'no_extra', name: 'Pizza party' });
  assert.deepEqual(checkInNote({ ...rows[1], paidCents: 0, owesCents: 19500 }, WED, APRIL_EXTRAS, APRIL_DAYS), { kind: 'not_paid' });
  assert.deepEqual(checkInNote(rows[2], WED, APRIL_EXTRAS, APRIL_DAYS), { kind: 'extra', name: 'Late pick-up' }); // the pizza is no note
  assert.deepEqual(checkInNote(rows[4], FRI, APRIL_EXTRAS, APRIL_DAYS), { kind: 'extra', name: 'Early drop-off' });
  assert.equal(checkInNote(rows[1], TUE, APRIL_EXTRAS, APRIL_DAYS), null);
  assert.equal(checkInNote(rows[0], WED, APRIL_EXTRAS, APRIL_DAYS), null);
});

// ======================= states and tags =======================

check('signupState and campTag at the date boundaries', () => {
  const s = (today, camp = APRIL_CAMP) => signupState(camp, APRIL_DAYS, today);
  assert.equal(s('2027-02-28'), 'not_open_yet');
  assert.equal(s('2027-03-01'), 'open'); // the opening day
  assert.equal(s('2027-04-18'), 'open'); // the closing day itself
  assert.equal(s('2027-04-19'), 'closed'); // after the closing date
  assert.equal(s('2027-04-23'), 'closed'); // the last day: not finished yet
  assert.equal(s('2027-04-24'), 'finished');
  assert.equal(s('2027-03-10', { ...APRIL_CAMP, closedByHand: true }), 'closed');
  assert.equal(s('2027-02-01', { ...APRIL_CAMP, closedByHand: true }), 'closed'); // closed beats not open yet
  assert.equal(s('2027-05-01', { ...APRIL_CAMP, closedByHand: true }), 'finished'); // finished beats closed
  const tag = (today, camp = APRIL_CAMP, days = APRIL_DAYS) => campTag(camp, days, today);
  assert.deepEqual(tag('2027-02-28'), { kind: 'not_open_yet', closesOn: null });
  assert.deepEqual(tag('2027-03-10'), { kind: 'open', closesOn: '2027-04-18' });
  assert.deepEqual(tag('2027-04-19'), { kind: 'camp_today', closesOn: null });
  assert.deepEqual(tag('2027-04-23'), { kind: 'camp_today', closesOn: null });
  assert.deepEqual(tag('2027-04-24'), { kind: 'done', closesOn: null });
  // Thanksgiving: Wed & Fri. Thu (between camp days) isn't "Camp today" — it falls through to Closed.
  const tgDays = [{ dayId: 'a', day: '2026-11-25' }, { dayId: 'b', day: '2026-11-27' }];
  const tg = { ...APRIL_CAMP, signupOpensOn: '2026-10-05', signupClosesOn: '2026-11-24', earlyUntil: '2026-11-18' };
  assert.deepEqual(tag('2026-11-26', tg, tgDays), { kind: 'closed', closesOn: null });
  assert.equal(isCampWeek(tgDays, '2026-11-26'), true);
  assert.deepEqual(tag('2026-11-24', tg, tgDays), { kind: 'open', closesOn: '2026-11-24' });
  assert.equal(defaultCampTab(tgDays, '2026-11-26'), 'checkin');
  assert.equal(defaultCampTab(tgDays, '2026-11-24'), 'payments');
  assert.equal(defaultCampTab(tgDays, '2026-11-28'), 'payments');
  assert.deepEqual(defaultCheckInDay(tgDays, '2026-11-25'), tgDays[0]); // today
  assert.deepEqual(defaultCheckInDay(tgDays, '2026-11-26'), tgDays[1]); // the next camp day
  assert.deepEqual(defaultCheckInDay(tgDays, '2026-11-20'), tgDays[0]);
  assert.deepEqual(defaultCheckInDay(tgDays, '2026-12-01'), tgDays[1]); // after: the last
  assert.equal(defaultCheckInDay([], '2026-12-01'), null);
});

check('Both-school filtering and counts', () => {
  const camps = [
    { id: 'w', locationCode: 'worcester', bothSchools: false },
    { id: 's', locationCode: 'shrewsbury', bothSchools: false },
    { id: 'b', locationCode: 'worcester', bothSchools: true },
  ];
  assert.deepEqual(campsForLocation(camps, 'worcester').map((c) => c.id), ['w', 'b']);
  assert.deepEqual(campsForLocation(camps, 'shrewsbury').map((c) => c.id), ['s', 'b']);
  assert.deepEqual(campsForLocation(camps, 'both').map((c) => c.id), ['w', 's', 'b']);
  assert.deepEqual(campCounts([{ campId: 'w', status: 'active' }, { campId: 'w', status: 'active' }, { campId: 'w', status: 'withdrawn' }, { campId: 'b', status: 'active' }]), { w: 2, b: 1 });
});

// ======================= toCamel / toSnake =======================

check('toCamel on a sample roster row, toSnake back', () => {
  const row = {
    id: 'r1', camp_id: 'c1', first_name: 'Mia', duplicate_state: 'none', signup_version: 2, owes_cents: 16600, last_payment_recorded_at: null,
    days: [{ day_id: MON, day: '2027-04-19', checked_in_at: null, checked_in_by_name: null }],
    extras: [{ extra_id: PICK, name: 'Late pick-up', per: 'day', day_id: MON, day: '2027-04-19', price_cents: 800 }],
  };
  assert.deepEqual(toCamel(row), {
    id: 'r1', campId: 'c1', firstName: 'Mia', duplicateState: 'none', signupVersion: 2, owesCents: 16600, lastPaymentRecordedAt: null,
    days: [{ dayId: MON, day: '2027-04-19', checkedInAt: null, checkedInByName: null }],
    extras: [{ extraId: PICK, name: 'Late pick-up', per: 'day', dayId: MON, day: '2027-04-19', priceCents: 800 }],
  });
  assert.deepEqual(toCamel({ member_early_cents: 1, nonmember_regular_cents: 2, not_for_all_days: true, price_kind_today: 'early' }),
    { memberEarlyCents: 1, nonmemberRegularCents: 2, notForAllDays: true, priceKindToday: 'early' });
  assert.deepEqual(toSnake({ extraId: 'x', dayIds: ['a'] }), { extra_id: 'x', day_ids: ['a'] });
  assert.deepEqual(toSnake(toCamel(row)), row); // the round trip is exact
  assert.equal(toCamel(null), null);
  assert.equal(toCamel('text'), 'text');
});

// ======================= qr.js =======================

check('qrFileName, campLink and the QR picture', () => {
  assert.equal(qrFileName('April Vacation Camp'), 'april-vacation-camp-qr.png');
  assert.equal(qrFileName('  Thanksgiving Camp!! (2026) '), 'thanksgiving-camp-2026-qr.png');
  assert.equal(qrFileName('Été'), 't-qr.png'); // only a–z and 0–9 are kept
  assert.equal(qrFileName(''), 'camp-qr.png');
  assert.equal(qrFileName('!!!'), 'camp-qr.png');
  assert.equal(qrFileName(null), 'camp-qr.png');
  assert.equal(qrFileName('x'.repeat(50)), `${'x'.repeat(40)}-qr.png`);
  assert.equal(campLink('k7m2qp4x'), 'https://tkd-dashboard.pages.dev/camp/k7m2qp4x');
  assert.equal(qrCampLink, campLink); // the one definition
  assert.equal(campLink('k7m2qp'), ''); // 6 characters: not a code
  assert.equal(campLink('k7m2qp4l'), ''); // "l" is never in a code
  assert.equal(campLink('K7M2QP4X'), '');
  assert.equal(campLink(null), '');
  assert.match(campQrSvgDataUrl('k7m2qp4x'), /^data:image\/svg\+xml;charset=utf-8,/);
  assert.equal(campQrSvgDataUrl('bad'), '');
});

// ======================= money: totals, owes, pay tag =======================

check('pay tag priority and the to-collect amount', () => {
  const row = (o) => ({ status: 'active', duplicateState: 'none', paidCents: 0, owesCents: 0, ...o });
  assert.equal(payTag(row({ duplicateState: 'possible', paidCents: 0, owesCents: 31500 })), 'duplicate');
  assert.equal(payTag(row({ duplicateState: 'possible', paidCents: 39000, owesCents: 0 })), 'duplicate'); // duplicate first
  assert.equal(payTag(row({ paidCents: 33500, owesCents: 1500 })), 'owes');
  assert.equal(payTag(row({ paidCents: 16600, owesCents: 0 })), 'paid');
  assert.equal(payTag(row({ paidCents: 39000, owesCents: -7500 })), 'paid');
  assert.equal(payTag(row({ paidCents: 0, owesCents: 21900 })), 'not_paid');
  assert.equal(payTag(row({ duplicateState: 'kept_both', paidCents: 0, owesCents: 100 })), 'not_paid');
  const rows = [
    row({ owesCents: 21900 }), row({ owesCents: 1500, paidCents: 33500 }), row({ owesCents: -7500, paidCents: 39000 }),
    row({ owesCents: 31500, duplicateState: 'possible' }), row({ status: 'withdrawn', owesCents: 14000 }),
  ];
  assert.equal(toCollectCents(rows), 21900 + 1500 + 31500); // overpaid never lowers it; withdrawn don't count
});

// ======================= check-in and attendance =======================

check('check-in rule and notes', () => {
  // Owner decision 2026-10-19: any camp day, staff and admins.
  for (const day of ['2027-04-19', '2027-04-21', '2027-04-23', { day: '2027-04-22' }]) {
    assert.equal(checkInRule(day, '2027-04-21', false), 'allowed');
    assert.equal(checkInRule(day, '2027-04-21', true), 'allowed');
  }
  const base = { duplicateState: 'none', paidCents: 16600, owesCents: 0, extras: [
    { extraId: DROP, name: 'Early drop-off', per: 'day', dayId: MON, day: '2027-04-19', priceCents: 1500 },
    { extraId: PICK, name: 'Late pick-up', per: 'day', dayId: MON, day: '2027-04-19', priceCents: 800 },
    { extraId: PICK, name: 'Late pick-up', per: 'day', dayId: WED, day: '2027-04-21', priceCents: 800 },
    { extraId: PIZZA, name: 'Pizza party', per: 'day', dayId: WED, day: '2027-04-21', priceCents: 500 },
  ] };
  assert.deepEqual(checkInNote({ ...base, duplicateState: 'possible' }, MON), { kind: 'duplicate' });
  assert.deepEqual(checkInNote({ ...base, paidCents: 0, owesCents: 16600 }, MON), { kind: 'not_paid' });
  assert.deepEqual(checkInNote({ ...base, paidCents: 15000, owesCents: 1600 }, MON), { kind: 'owes', cents: 1600 });
  assert.deepEqual(checkInNote(base, MON), { kind: 'extra', name: 'Early drop-off' }); // first by sort
  assert.deepEqual(checkInNote(base, WED), { kind: 'extra', name: 'Late pick-up' });
  assert.equal(checkInNote(base, TUE), null); // once extras are never a day note
});

check('attendance cells and "Came X of Y"', () => {
  const today = '2027-04-21';
  const noah = { days: [
    { dayId: MON, day: '2027-04-19', checkedInAt: '2027-04-19T12:55:00Z' },
    { dayId: TUE, day: '2027-04-20', checkedInAt: null },
    { dayId: WED, day: '2027-04-21', checkedInAt: null },
  ] };
  assert.deepEqual(APRIL_DAYS.map((d) => attendanceCell(noah, d, today)), ['came', 'missed', 'upcoming', 'not_signed_up', 'not_signed_up']);
  assert.deepEqual(cameCount(noah, APRIL_DAYS, today), { came: 1, soFar: 2 });
  const ava = { days: APRIL_DAYS.map((d, i) => ({ dayId: d.dayId, day: d.day, checkedInAt: i < 3 ? 'x' : null })) };
  assert.deepEqual(cameCount(ava, APRIL_DAYS, today), { came: 3, soFar: 3 }); // today counts once checked in
  assert.equal(attendanceCell(ava, APRIL_DAYS[3], today), 'upcoming');
  const ethan = { days: [{ dayId: MON, day: '2027-04-19', checkedInAt: null }, { dayId: THU, day: '2027-04-22', checkedInAt: null }] };
  assert.deepEqual(cameCount(ethan, APRIL_DAYS, today), { came: 0, soFar: 1 });
  assert.deepEqual(cameCount(ava, APRIL_DAYS, '2027-04-24'), { came: 3, soFar: 5 }); // after the week: "3 of 5"
});

// ======================= templates, ages, phones, text =======================

check('template offsets both ways', () => {
  const offsets = templateFromCamp(APRIL_CAMP, APRIL_DAYS);
  assert.deepEqual(offsets, { opensDaysBefore: 49, closesDaysBefore: 1, earlyDaysBefore: 7 });
  assert.deepEqual(campDatesFromTemplate(offsets, '2027-04-19'), { signupOpensOn: '2027-03-01', signupClosesOn: '2027-04-18', earlyUntil: '2027-04-12' });
  assert.deepEqual(campDatesFromTemplate(offsets, '2027-07-12'), { signupOpensOn: '2027-05-24', signupClosesOn: '2027-07-11', earlyUntil: '2027-07-05' });
  assert.deepEqual(campDatesFromTemplate({ opensDaysBefore: 10, closesDaysBefore: -2, earlyDaysBefore: 0 }, '2027-01-01'),
    { signupOpensOn: '2026-12-22', signupClosesOn: '2027-01-03', earlyUntil: '2027-01-01' }); // negative = after the first day
  assert.equal(offsetsAreValid(offsets), true);
  assert.equal(offsetsAreValid({ opensDaysBefore: 366, closesDaysBefore: 1, earlyDaysBefore: 7 }), false);
  assert.equal(offsetsAreValid({ opensDaysBefore: 0, closesDaysBefore: 1, earlyDaysBefore: 7 }), false); // opens before closes
  assert.equal(offsetsAreValid({ opensDaysBefore: 10, closesDaysBefore: 5, earlyDaysBefore: 4 }), false); // early after closing
  assert.equal(offsetsAreValid({ opensDaysBefore: 1.5, closesDaysBefore: 1, earlyDaysBefore: 1 }), false);
  const rows = gridRowsFor(3, APRIL_PRICES.slice(0, 2));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], APRIL_PRICES[1]);
  assert.deepEqual(rows[2], { dayCount: 3, memberEarlyCents: null, memberRegularCents: null, nonmemberEarlyCents: null, nonmemberRegularCents: null });
  assert.equal(gridRowsFor(1, APRIL_PRICES).length, 1); // fewer days drop rows
});

check('ages, phones and the text rule', () => {
  assert.equal(validateAges(3, 17), null);
  assert.equal(validateAges(8, 8), null); // from may equal to
  assert.equal(validateAges(12, 5), 'order');
  assert.equal(validateAges('', 5), 'blank');
  assert.equal(validateAges(null, 5), 'blank');
  assert.equal(validateAges(5, Number.NaN), 'blank');
  assert.equal(validateAges(0, 5), 'range');
  assert.equal(validateAges(5, 100), 'range');
  assert.equal(validateAges(5.5, 8), 'range');
  assert.equal(ageAllowed(5, APRIL_CAMP), true);
  assert.equal(ageAllowed(12, APRIL_CAMP), true);
  assert.equal(ageAllowed(4, APRIL_CAMP), false);
  assert.equal(ageAllowed(13, APRIL_CAMP), false);
  assert.equal(ageAllowed(8.5, APRIL_CAMP), false);
  assert.equal(phoneDigits('(508) 555-0142'), '5085550142');
  assert.equal(phoneDigits('+1 508 555 0142'), '5085550142');
  assert.equal(phoneDigits('1-508-555-0142'), '5085550142');
  assert.equal(phoneDigits('555-0142'), null);
  assert.equal(phoneDigits('508555014299'), null);
  assert.equal(phoneDigits(null), null);
  assert.equal(formatPhone('5085550142'), '(508) 555-0142');
  assert.equal(formatPhone('123'), '123');
  assert.equal(campTextIsValid('Bring a lunch.\nAnd water.', 2000), true);
  assert.equal(campTextIsValid('   ', 2000), false);
  assert.equal(campTextIsValid('x'.repeat(2001), 2000), false);
  assert.equal(campTextIsValid('bad​char', 2000), false);
  assert.equal(normalizeCampText(' a\r\nb \n'), 'a\nb');
});

check('md5 is the standard algorithm (the waiver version)', () => {
  for (const text of ['', 'abc', 'I give permission…', 'x'.repeat(1000), 'Jae H. Jeong’s']) {
    assert.equal(md5(text), createHash('md5').update(text, 'utf8').digest('hex'));
  }
});

// ======================= the preview database =======================

// A tiny in-memory store and a clock we can move.
function makeBackend({ today = '2026-10-19', clock = Date.parse('2026-10-19T14:00:00Z') } = {}) {
  let store = null;
  const env = { today, clock };
  const backend = createCampsBackend({
    loadStore: () => store,
    saveStore: (s) => { store = JSON.parse(JSON.stringify(s)); },
    now: () => env.clock,
    today: () => env.today,
    newId: () => randomUUID(),
    locations: () => [{ code: 'worcester', name: 'Worcester', address_street: '1 Main St', address_city: 'Worcester', address_state: 'MA', address_zip: '01608' }],
  });
  return { backend, env, store: () => store };
}
const ADMIN = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Jeffrey Berg', userId: '00000000-0000-4000-8000-000000000001' };
const STAFF = { signedIn: true, hasDataAccess: true, isAdmin: false, actorName: 'Staff', userId: '00000000-0000-4000-8000-0000000000d1' };
const LOCKED = { ...ADMIN, hasDataAccess: false };
const rpcOk = (b, name, args, ctx = ADMIN) => {
  const res = b.rpc(name, args, ctx);
  assert.equal(res.error, null, `${name}: ${res.error?.message}`);
  return res.data;
};
const rows = (b, table, columns, filters = [], ctx = ADMIN) => {
  const res = b.select(table, columns, filters, [], ctx);
  assert.equal(res.error, null, `${table}: ${res.error?.message}`);
  return res.data;
};
const ROSTER = 'id, camp_id, signup_id, first_name, last_name, member, status, duplicate_state, duplicate_of, version, signup_version, days, extras, total_cents, paid_cents, owes_cents, last_payment_id';

check('mock: the default data matches the approved mockups', () => {
  const { backend: b } = makeBackend({ today: '2027-04-21' }); // campWeek
  const camps = rows(b, 'camps', 'id, name, location_code, both_schools, public_code, closed_by_hand');
  assert.deepEqual(camps.map((c) => c.name), ['Columbus Day Camp', 'Veterans Day Camp', 'Thanksgiving Camp', 'Winter Break Camp', 'April Vacation Camp', 'Two-Week Summer Camp']);
  const april = camps.find((c) => c.name === 'April Vacation Camp');
  assert.equal(april.both_schools, true);
  assert.equal(april.public_code, DEFAULT_CAMP_CODES.april);
  const roster = toCamel(rows(b, 'camp_roster', ROSTER, [{ col: 'camp_id', value: april.id }]));
  const active = roster.filter((r) => r.status === 'active');
  assert.equal(active.length, 19); // incl. Ava's second sign-up
  assert.equal(roster.filter((r) => r.status === 'withdrawn').map((r) => r.firstName).join(), 'Owen');
  assert.equal(active.filter((r) => payTag(r) === 'paid').length, 13);
  assert.equal(active.filter((r) => payTag(r) === 'duplicate').length, 1);
  assert.equal(toCollectCents(active.filter((r) => r.duplicateState !== 'possible')), 104000); // "5 to collect · $1,040"
  const leo = active.find((r) => r.firstName === 'Leo');
  assert.equal(leo.owesCents, 1500);
  assert.equal(payTag(leo), 'owes');
  const mia = active.find((r) => r.firstName === 'Mia');
  assert.equal(mia.totalCents, 16600);
  const byDay = (i) => active.filter((r) => r.duplicateState !== 'possible' && r.days.some((d) => d.dayId === r.days.find((x) => x.day === APRIL_DAYS[i].day)?.dayId)).length;
  assert.deepEqual([0, 1, 2, 3, 4].map(byDay), [14, 16, 15, 14, 13]);
  // Check-ins on Mon 13 of 14, Tue 15 of 16, Wed 9 of 15 (Ava's duplicate isn't checked in).
  const here = (day) => active.filter((r) => r.duplicateState !== 'possible' && r.days.some((d) => d.day === day && d.checkedInAt)).length;
  assert.deepEqual(['2027-04-19', '2027-04-20', '2027-04-21', '2027-04-22'].map(here), [13, 15, 9, 0]);
  const noah = active.find((r) => r.firstName === 'Noah');
  assert.deepEqual(cameCount(noah, APRIL_DAYS.map((d, i) => ({ ...d, dayId: noah.days[i]?.dayId ?? `x${i}` })), '2027-04-21'), { came: 1, soFar: 2 });
  // With the real date (before the camp) nobody at April camp is checked in.
  const { backend: b2 } = makeBackend({ today: '2026-10-19' });
  const roster2 = toCamel(rows(b2, 'camp_roster', ROSTER, [{ col: 'camp_id', value: april.id }]));
  assert.equal(roster2.filter((r) => r.days.some((d) => d.checkedInAt)).length, 0);
  // Columbus Day (Oct 12, past): 9 campers, all checked in. Veterans 16, Thanksgiving 12, Winter 0,
  // April 19, Two-Week Summer Camp 6 (added 2026-10-21 for the roster's week switcher).
  const counts = campCounts(toCamel(rows(b2, 'camp_roster', 'camp_id, status')));
  assert.deepEqual(camps.map((c) => counts[c.id] ?? 0), [9, 16, 12, 0, 19, 6]);
  const columbus = toCamel(rows(b2, 'camp_roster', ROSTER, [{ col: 'camp_id', value: camps[0].id }]));
  assert.equal(columbus.every((r) => r.days[0].checkedInAt), true);
  assert.equal(rows(b2, 'camp_templates', 'name').length, 4);
  // Thanksgiving tag on the real date: Open until Nov 24; Veterans: Closed (by hand).
  const days = (campId) => toCamel(rows(b2, 'camp_days', 'id, day', [{ col: 'camp_id', value: campId }])).map((d) => ({ dayId: d.id, day: d.day }));
  const full = toCamel(rows(b2, 'camps', 'id, signup_opens_on, signup_closes_on, early_until, closed_by_hand'));
  const tagOf = (i) => campTag(full[i], days(full[i].id), '2026-10-19').kind;
  assert.deepEqual([0, 1, 2, 3, 4].map(tagOf), ['done', 'closed', 'open', 'not_open_yet', 'not_open_yet']);
});

check('mock: table permissions and restricted functions', () => {
  const { backend: b } = makeBackend();
  assert.equal(CAMP_TABLES.includes('camp_public_attempts'), false);
  assert.equal(b.select('camp_public_attempts', 'id', [], [], ADMIN).error.code, 'PGRST205');
  assert.equal(b.select('camp_signups', 'parent_phone', [], [], ADMIN).error.code, '42501'); // phones never in a list
  assert.equal(b.select('camp_signups', 'signature', [], [], ADMIN).error.code, '42501');
  assert.equal(b.select('camps', '*', [], [], ADMIN).error.code, '42501');
  assert.equal(b.select('camp_campers', 'withdrawn_by', [], [], ADMIN).error.code, '42501');
  assert.deepEqual(b.select('camps', 'id', [], [], LOCKED).data, []); // RLS hides rows
  assert.equal(b.select('camps', 'id', [], [], { signedIn: false }).error.code, '42501');
  for (const name of CAMP_RESTRICTED_RPC_NAMES) assert.equal(b.rpc(name, {}, ADMIN).error.code, '42501');
  assert.equal(CAMP_RPC_NAMES.includes('camp_camper_detail'), true);
  assert.equal(rpcOk(b, 'camp_mark_paid', { p_camper_id: randomUUID(), p_expected_version: 1, p_school: 'worcester' }, LOCKED).status, 'no_access');
  assert.equal(rpcOk(b, 'camp_delete_template', { p_template_id: randomUUID(), p_expected_version: 1 }, STAFF).status, 'not_allowed');
  assert.equal(b.rpc('camp_mark_paid', { p_camper_id: 'nope', p_expected_version: 1, p_school: 'worcester' }, ADMIN).error.code, '22P02');
  assert.equal(b.rpc('camp_mark_paid', { p_camper_id: randomUUID() }, ADMIN).error.code, 'PGRST202'); // a missing argument
});

// The arguments of Add camp for a small 3-day camp starting at `first`.
function addCampArgs(first, overrides = {}) {
  return {
    p_location_code: 'worcester', p_both_schools: false, p_name: '  Spring   Camp ', p_days: [first, addD(first, 1), addD(first, 2)],
    p_start_time: '09:00', p_end_time: '15:00', p_signup_opens_on: addD(first, -30), p_signup_closes_on: addD(first, -1),
    p_early_until: addD(first, -7), p_min_age: 5, p_max_age: 12,
    p_prices: [1, 2, 3].map((n) => ({ day_count: n, member_early_cents: 7500 * n, member_regular_cents: 8000 * n, nonmember_early_cents: 8500 * n, nonmember_regular_cents: 9000 * n })),
    p_extras: [
      { name: 'Early drop-off', price_cents: 1500, per: 'day', not_for_all_days: false, only_on: [] },
      { name: 'Pizza party', price_cents: 500, per: 'once', not_for_all_days: true, only_on: [] },
    ],
    p_description: 'Bring a lunch.', p_waiver_text: 'I agree.', ...overrides,
  };
}
function addD(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
// A family-form body for the public signup (database argument names without "p_").
function signupArgs(b, code, children, extra = {}) {
  const answer = b.publicCamp(code);
  return {
    code, client_key: 'test-key', submission_id: randomUUID(), children,
    parent_name: 'Laura Rossi', parent_phone: '5085550142', parent_relation: 'Mother',
    emergency_name: 'Paul Rossi', emergency_phone: '5085550187', emergency_relation: 'Uncle',
    paying_by: 'cash', acknowledged: true, signature: 'data:image/png;base64,iVBORw0KGgo=', ack_version: CAMP_ACK_VERSION,
    waiver_version: answer.waiver_version, expected_total_cents: 0, ...extra,
  };
}

check('mock: scripted run — add camp → sign up → check in → mark paid → edit → duplicate → delete', () => {
  const { backend: b, env, store } = makeBackend({ today: '2027-05-01', clock: Date.parse('2027-05-01T14:00:00Z') });
  // Add camp: admin only; staff → not_allowed; a day in the past → invalid; bad grid → invalid.
  assert.equal(rpcOk(b, 'camp_add_camp', addCampArgs('2027-06-07'), STAFF).status, 'not_allowed');
  assert.equal(rpcOk(b, 'camp_add_camp', addCampArgs('2027-04-30')).status, 'invalid');
  assert.equal(rpcOk(b, 'camp_add_camp', addCampArgs('2027-06-07', { p_prices: addCampArgs('2027-06-07').p_prices.slice(0, 2) })).status, 'invalid');
  assert.equal(rpcOk(b, 'camp_add_camp', addCampArgs('2027-06-07', { p_start_time: '09:03' })).status, 'invalid'); // not a 5-minute step
  assert.equal(rpcOk(b, 'camp_add_camp', addCampArgs('2027-06-07', { p_min_age: 9, p_max_age: 8 })).status, 'invalid');
  assert.equal(rpcOk(b, 'camp_add_camp', addCampArgs('2027-06-07', { p_signup_closes_on: '2027-06-10' })).status, 'invalid'); // after the last day
  const added = rpcOk(b, 'camp_add_camp', addCampArgs('2027-06-07'));
  assert.equal(added.status, 'ok');
  assert.match(added.public_code, /^[a-hjkmnp-z2-9]{8}$/);
  const campRow = rows(b, 'camps', 'id, name, version', [{ col: 'id', value: added.id }])[0];
  assert.equal(campRow.name, 'Spring Camp'); // normalized

  // Public camp: open from today (opens 30 days before → May 8 > May 1: not open yet).
  let pub = b.publicCamp(added.public_code);
  assert.equal(pub.state, 'not_open_yet');
  assert.equal(pub.waiver_version, md5('I agree.'));
  assert.equal(pub.camp.start_time, '09:00');
  assert.deepEqual(pub.camp.address, { street: '1 Main St', city: 'Worcester', state: 'MA', zip: '01608' });
  const [d1, d2, d3] = pub.camp.days.map((d) => d.day_id);
  const [drop, pizza] = pub.camp.extras.map((e) => e.extra_id);
  const mia = { first_name: 'Mia', last_name: 'Rossi', age: 9, member: false, day_ids: [d1, d2], extras: [{ extra_id: drop, day_ids: [d1] }] };
  assert.deepEqual(b.publicSignup(signupArgs(b, added.public_code, [mia])), { status: 'not_open', opens_on: '2027-05-08' });
  env.today = '2027-05-20'; // early price until May 31
  pub = b.publicCamp(added.public_code);
  assert.equal(pub.state, 'open');
  assert.equal(pub.price_kind_today, 'early');
  assert.equal(pub.closed_on, '2027-06-06');
  // price_changed (expected 0), then the right total.
  const first = b.publicSignup(signupArgs(b, added.public_code, [mia]));
  assert.equal(first.status, 'price_changed');
  assert.equal(first.new_total_cents, 17000 + 1500);
  assert.equal(first.old_total_cents, 0);
  assert.equal(first.camp.status, 'ok'); // the whole camp_public_camp answer
  // Shape checks: bad jsonb → invalid (and an attempt row each).
  const attemptsBefore = store().camp_public_attempts.length;
  for (const bad of [
    [{ ...mia, age: 9.5 }], [{ ...mia, age: '9' }], [{ ...mia, age: 1e9 }], [{ ...mia, member: 'yes' }], [{ ...mia, day_ids: d1 }],
    [{ ...mia, extras: {} }], [{ ...mia, colour: 'red' }], [{ ...mia, day_ids: [d1, d1] }], [{ ...mia, day_ids: ['nope'] }], [mia, mia, mia, mia],
  ]) {
    assert.equal(b.publicSignup(signupArgs(b, added.public_code, bad, { expected_total_cents: 18500 })).status, 'invalid');
  }
  assert.equal(store().camp_public_attempts.length, attemptsBefore + 10);
  // camp_changed: an age outside the range, an unknown day id, a stale waiver version.
  assert.equal(b.publicSignup(signupArgs(b, added.public_code, [{ ...mia, age: 4 }], { expected_total_cents: 18500 })).status, 'camp_changed');
  assert.equal(b.publicSignup(signupArgs(b, added.public_code, [{ ...mia, day_ids: [randomUUID()] }], { expected_total_cents: 18500 })).status, 'camp_changed');
  assert.equal(b.publicSignup(signupArgs(b, added.public_code, [mia], { expected_total_cents: 18500, waiver_version: md5('old') })).status, 'camp_changed');
  // A once extra with days, or pizza for an all-days child → invalid.
  const allDays = { ...mia, day_ids: [d1, d2, d3], extras: [{ extra_id: pizza, day_ids: [] }] };
  assert.equal(b.publicSignup(signupArgs(b, added.public_code, [allDays], { expected_total_cents: 26000 })).status, 'invalid');
  const okArgs = signupArgs(b, added.public_code, [mia], { expected_total_cents: 18500 });
  const signed = b.publicSignup(okArgs);
  assert.equal(signed.status, 'ok');
  assert.match(signed.reference, /^CP-\d+$/);
  assert.equal(signed.family_total_cents, 18500);
  assert.deepEqual(signed.children[0].extras, [{ name: 'Early drop-off', per: 'day', count: 1, cents: 1500 }]);
  assert.deepEqual(b.publicSignup(okArgs), signed); // the same submission again: the same answer, no second sign-up
  assert.equal(store().camp_signups.filter((s) => s.camp_id === added.id).length, 1);

  const roster = () => toCamel(rows(b, 'camp_roster', ROSTER, [{ col: 'camp_id', value: added.id }]));
  let r = roster()[0];
  assert.equal(r.totalCents, 18500);
  assert.equal(payTag(r), 'not_paid');

  // Check in: any camp day, staff and admins (owner decision 2026-10-19).
  env.today = '2027-06-08'; // the second day
  assert.equal(rpcOk(b, 'camp_check_in', { p_camper_id: r.id, p_day_id: d2 }, STAFF).status, 'ok');
  const again = rpcOk(b, 'camp_check_in', { p_camper_id: r.id, p_day_id: d2 }, STAFF);
  assert.equal(again.already, true);
  assert.equal(rpcOk(b, 'camp_check_in', { p_camper_id: r.id, p_day_id: d1 }, STAFF).status, 'ok'); // an earlier day, staff
  assert.equal(rpcOk(b, 'camp_check_in', { p_camper_id: r.id, p_day_id: d3 }, ADMIN).status, 'not_found'); // not one of Mia's days
  assert.equal(roster()[0].version, r.version); // check-in never bumps the camper's version
  assert.equal(rpcOk(b, 'camp_undo_check_in', { p_camper_id: r.id, p_day_id: d1 }, STAFF).status, 'ok');
  env.today = '2027-06-06'; // before the camp: a later day works too
  assert.equal(rpcOk(b, 'camp_check_in', { p_camper_id: r.id, p_day_id: d1 }, STAFF).status, 'ok');
  assert.equal(rpcOk(b, 'camp_check_in', { p_camper_id: r.id, p_day_id: d1 }, ADMIN).already, true);
  env.today = '2027-06-08';

  // Mark paid = owes; a second click with the old version → stale; then already_paid.
  const paid = rpcOk(b, 'camp_mark_paid', { p_camper_id: r.id, p_expected_version: r.version, p_school: 'worcester' }, STAFF);
  assert.equal(paid.status, 'ok');
  assert.equal(paid.amount_cents, 18500);
  assert.equal(paid.method, 'cash');
  assert.equal(rpcOk(b, 'camp_mark_paid', { p_camper_id: r.id, p_expected_version: r.version, p_school: 'worcester' }, STAFF).status, 'stale');
  assert.equal(rpcOk(b, 'camp_mark_paid', { p_camper_id: r.id, p_expected_version: paid.version, p_school: 'worcester' }, STAFF).status, 'already_paid');
  // Staff Undo within 10 s works; after 10 s only an admin.
  const undone = rpcOk(b, 'camp_undo_payment', { p_payment_id: paid.payment_id }, STAFF);
  assert.equal(undone.status, 'ok');
  assert.equal(rpcOk(b, 'camp_undo_payment', { p_payment_id: paid.payment_id }, ADMIN).status, 'stale'); // already undone
  const paid2 = rpcOk(b, 'camp_mark_paid', { p_camper_id: r.id, p_expected_version: undone.version, p_school: 'worcester' }, STAFF);
  env.clock += 11000;
  assert.equal(rpcOk(b, 'camp_undo_payment', { p_payment_id: paid2.payment_id }, STAFF).status, 'not_allowed');
  r = roster()[0];
  assert.equal(payTag(r), 'paid');

  // A grid price edit after sign-up changes nothing for existing campers.
  const camp = toCamel(rows(b, 'camps', 'id, version', [{ col: 'id', value: added.id }]))[0];
  const extraRows = rows(b, 'camp_extras', 'id, name', [{ col: 'camp_id', value: added.id }]);
  const editArgs = addCampArgs('2027-06-07', {
    p_camp_id: added.id, p_expected_version: camp.version,
    p_prices: [1, 2, 3].map((n) => ({ day_count: n, member_early_cents: 10000 * n, member_regular_cents: 10000 * n, nonmember_early_cents: 10000 * n, nonmember_regular_cents: 10000 * n })),
    p_extras: [{ id: extraRows[0].id, name: 'Early drop-off', price_cents: 2000, per: 'day', not_for_all_days: false }, { id: extraRows[1].id, name: 'Pizza party', price_cents: 500, per: 'once', not_for_all_days: true }],
  });
  // Add camp's rule "every day today or later" doesn't apply to kept past days.
  const edited = rpcOk(b, 'camp_update_camp', editArgs);
  assert.equal(edited.status, 'ok');
  assert.equal(roster()[0].totalCents, 18500); // prices written at sign-up stay
  // Edit details: names only → no re-price; adding a day → the WHOLE camper at current prices.
  const detail = (id) => toCamel(rpcOk(b, 'camp_camper_detail', { p_camper_id: id }, STAFF));
  let d = detail(r.id);
  assert.equal(d.family.parentPhone, '5085550142'); // phones only here
  const details = (cv, sv, o = {}) => ({
    p_camper_id: r.id, p_camper_version: cv, p_signup_version: sv, p_first: 'Mia', p_last: 'Rossi', p_age: 9, p_member: false,
    p_day_ids: [d1, d2], p_extras: [{ extra_id: drop, day_ids: [d1] }], p_parent_name: 'Laura Rossi', p_parent_phone: '5085550142',
    p_parent_relation: 'Mother', p_emergency_name: 'Paul Rossi', p_emergency_phone: '5085550187', p_emergency_relation: 'Uncle', ...o,
  });
  r = roster()[0];
  const nameOnly = rpcOk(b, 'camp_update_details', details(r.version, r.signupVersion, { p_first: 'Mía', p_age: 10 }), STAFF);
  assert.equal(nameOnly.status, 'ok');
  assert.equal(nameOnly.total_cents, 18500);
  const more = rpcOk(b, 'camp_update_details', details(nameOnly.camper_version, nameOnly.signup_version, { p_day_ids: [d1, d2, d3] }), STAFF);
  assert.equal(more.status, 'ok');
  assert.equal(more.total_cents, 30000 + 2000); // 3 days non-member early at the new grid + drop-off at the new price
  assert.equal(more.owes_cents, 32000 - 18500); // "Owes $135"
  assert.equal(payTag(roster()[0]), 'owes');
  // Removing a checked-in day → checked_in; a pizza for an all-days camper → invalid; > $10,000 → invalid.
  assert.deepEqual(rpcOk(b, 'camp_update_details', details(more.camper_version, more.signup_version, { p_day_ids: [d1, d3] }), STAFF), { status: 'checked_in', day: '2027-06-08' });
  assert.equal(rpcOk(b, 'camp_update_details', details(more.camper_version, more.signup_version, { p_day_ids: [d1, d2, d3], p_extras: [{ extra_id: pizza, day_ids: [] }] }), STAFF).status, 'invalid');
  assert.equal(rpcOk(b, 'camp_update_details', details(more.camper_version, more.signup_version, { p_parent_phone: '508-555' }), STAFF).status, 'invalid');
  assert.equal(rpcOk(b, 'camp_update_details', details(1, 1), STAFF).status, 'stale');
  // Fewer days after paying more → owes < 0 → still Paid (overpaid).
  r = roster()[0];
  const pay3 = rpcOk(b, 'camp_mark_paid', { p_camper_id: r.id, p_expected_version: r.version, p_school: 'worcester' }, STAFF);
  assert.equal(pay3.amount_cents, 13500); // just the difference
  const fewer = rpcOk(b, 'camp_update_details', details(pay3.version, more.signup_version, { p_day_ids: [d1, d2], p_extras: [] }), STAFF);
  assert.equal(fewer.total_cents, 20000);
  assert.equal(fewer.owes_cents, 20000 - 32000);
  assert.equal(payTag(roster()[0]), 'paid');

  // Possible duplicate: a second Mia (normalized name, other case) → possible + duplicate_of.
  env.today = '2027-05-20';
  const twin = b.publicSignup(signupArgs(b, added.public_code, [{ ...mia, first_name: "  MIA ", extras: [] }], { expected_total_cents: 20000 }));
  assert.equal(twin.status, 'ok');
  let list = roster();
  const copy = list.find((x) => x.duplicateState === "possible");
  assert.equal(copy.duplicateOf, r.id);
  // Removing a day an active camper picked → not_empty (kind day, name, more).
  const c2 = toCamel(rows(b, 'camps', 'id, version', [{ col: 'id', value: added.id }]))[0];
  const refuse = rpcOk(b, 'camp_update_camp', { ...editArgs, p_expected_version: c2.version, p_days: ['2027-06-07', '2027-06-09'],
    p_prices: editArgs.p_prices.slice(0, 2) });
  assert.deepEqual(refuse, { status: 'not_empty', kind: 'day', day: '2027-06-08', first_name: "Mia", last_name: "Rossi", more: 1 });
  // Keep one (staff, before the last day): the copy → Removed as duplicate_copy; staff Restore within 10 s.
  const kept = rpcOk(b, 'camp_resolve_duplicate', { p_keep_id: r.id, p_keep_version: list.find((x) => x.id === r.id).version, p_other_id: copy.id, p_other_version: copy.version, p_keep_both: false }, STAFF);
  assert.equal(kept.status, 'ok');
  list = roster();
  const removed = list.find((x) => x.id === copy.id);
  assert.equal(removed.status, 'withdrawn');
  assert.equal(rpcOk(b, 'camp_restore_camper', { p_camper_id: copy.id, p_expected_version: removed.version }, STAFF).status, 'ok');
  list = roster();
  assert.equal(list.find((x) => x.id === copy.id).duplicateState, 'possible'); // the recheck flags it again
  // Withdraw (staff) the original: the copy's flag goes back to none; ordinary Restore by staff.
  const orig = list.find((x) => x.id === r.id);
  const wd = rpcOk(b, 'camp_withdraw_camper', { p_camper_id: orig.id, p_expected_version: orig.version }, STAFF);
  assert.equal(wd.status, 'ok');
  assert.equal(roster().find((x) => x.id === copy.id).duplicateState, 'none');
  assert.equal(rpcOk(b, 'camp_check_in', { p_camper_id: orig.id, p_day_id: d1 }, ADMIN).status, 'withdrawn');
  assert.equal(rpcOk(b, 'camp_restore_camper', { p_camper_id: orig.id, p_expected_version: wd.version }, STAFF).status, 'ok');
  // Delete camper (admin): payment ids must match.
  const copyRow = roster().find((x) => x.id === copy.id);
  assert.equal(rpcOk(b, 'camp_delete_camper', { p_camper_id: copy.id, p_expected_version: copyRow.version, p_expected_payment_ids: [] }, STAFF).status, 'not_allowed');
  assert.equal(rpcOk(b, 'camp_delete_camper', { p_camper_id: copy.id, p_expected_version: copyRow.version, p_expected_payment_ids: [randomUUID()] }).status, 'stale');
  assert.equal(rpcOk(b, 'camp_delete_camper', { p_camper_id: copy.id, p_expected_version: copyRow.version, p_expected_payment_ids: [] }).status, 'ok');
  assert.equal(roster().find((x) => x.id === r.id).duplicateState, 'none');

  // Close / reopen: staff close; staff reopen after the closing date → not_allowed; admin → closes on the last day.
  let c3 = toCamel(rows(b, 'camps', 'id, version', [{ col: 'id', value: added.id }]))[0];
  const closed = rpcOk(b, 'camp_set_signup', { p_camp_id: added.id, p_expected_version: c3.version, p_open: false }, STAFF);
  assert.deepEqual(closed, { status: 'ok', version: c3.version + 1, state: 'closed' });
  assert.equal(b.publicCamp(added.public_code).closed_on, null); // closed by hand
  env.today = '2027-06-07';
  assert.equal(rpcOk(b, 'camp_set_signup', { p_camp_id: added.id, p_expected_version: closed.version, p_open: true }, STAFF).status, 'not_allowed');
  const reopened = rpcOk(b, 'camp_set_signup', { p_camp_id: added.id, p_expected_version: closed.version, p_open: true }, ADMIN);
  assert.equal(reopened.state, 'open');
  assert.equal(rows(b, 'camps', 'signup_closes_on', [{ col: 'id', value: added.id }])[0].signup_closes_on, '2027-06-09');
  env.today = '2027-06-10';
  assert.equal(rpcOk(b, 'camp_set_signup', { p_camp_id: added.id, p_expected_version: reopened.version, p_open: false }, ADMIN).status, 'finished');

  // Templates: save (offsets), duplicate name, bad offsets.
  const saved = rpcOk(b, 'camp_save_template', { p_camp_id: added.id, p_name: 'Spring week' });
  assert.equal(saved.status, 'ok');
  const t = toCamel(rows(b, 'camp_templates', 'id, name, day_count, opens_days_before, closes_days_before, early_days_before, min_age, max_age, prices, extras, version', [{ col: 'id', value: saved.id }]))[0];
  assert.deepEqual([t.dayCount, t.opensDaysBefore, t.closesDaysBefore, t.earlyDaysBefore, t.minAge, t.maxAge], [3, 30, -2, 7, 5, 12]);
  assert.equal(t.extras.length, 2);
  assert.equal(rpcOk(b, 'camp_save_template', { p_camp_id: added.id, p_name: 'SPRING  week' }).status, 'duplicate_name');
  const tArgs = (o = {}) => ({
    p_template_id: t.id, p_expected_version: t.version, p_name: 'Spring week', p_location_code: 'worcester', p_both_schools: false, p_day_count: 3,
    p_start_time: '09:00', p_end_time: '15:00', p_opens_days_before: 30, p_closes_days_before: 1, p_early_days_before: 7, p_min_age: 5, p_max_age: 12,
    p_prices: addCampArgs('2027-06-07').p_prices, p_extras: addCampArgs('2027-06-07').p_extras.map(({ only_on: onlyOn, ...e }) => ({ ...e, only_weekdays: onlyOn })), p_description: null, p_waiver_text: 'I agree.', ...o,
  });
  assert.deepEqual(rpcOk(b, 'camp_update_template', tArgs({ p_opens_days_before: 0 })), { status: 'invalid', field: 'offsets' });
  assert.deepEqual(rpcOk(b, 'camp_update_template', tArgs({ p_opens_days_before: 400 })), { status: 'invalid', field: 'offsets' });
  assert.equal(rpcOk(b, 'camp_update_template', tArgs({ p_name: 'One-day holiday camp' })).status, 'duplicate_name');
  assert.equal(rpcOk(b, 'camp_update_template', tArgs()).status, 'ok');

  // Delete camp: the counts must be what the warning showed (all campers, net payments).
  const all = roster();
  const net = all.reduce((s, x) => s + x.paidCents, 0);
  const c4 = toCamel(rows(b, 'camps', 'id, version', [{ col: 'id', value: added.id }]))[0];
  assert.equal(rpcOk(b, 'camp_delete_camp', { p_camp_id: added.id, p_expected_version: c4.version, p_expected_camper_count: all.length + 1, p_expected_payment_total_cents: net }).status, 'stale');
  assert.equal(rpcOk(b, 'camp_delete_camp', { p_camp_id: added.id, p_expected_version: c4.version, p_expected_camper_count: all.length, p_expected_payment_total_cents: net }).status, 'ok');
  assert.equal(rows(b, 'camp_roster', 'id', [{ col: 'camp_id', value: added.id }]).length, 0);
  assert.equal(store().camp_payments.some((p) => all.some((x) => x.id === p.camper_id)), false);
  assert.equal(rows(b, 'camp_templates', 'id', [{ col: 'id', value: saved.id }]).length, 1); // templates stay
});

check('mock: removing a day / extra only withdrawn campers picked; rate limit; failNextSave', () => {
  const { backend: b, env, store } = makeBackend({ today: '2027-05-20' });
  const added = rpcOk(b, 'camp_add_camp', addCampArgs('2027-06-07', { p_signup_opens_on: '2027-05-01' }));
  const pub = b.publicCamp(added.public_code);
  const [d1, d2, d3] = pub.camp.days.map((x) => x.day_id);
  const [drop] = pub.camp.extras.map((e) => e.extra_id);
  const kid = { first_name: 'Leo', last_name: 'Kim', age: 9, member: true, day_ids: [d1, d3], extras: [{ extra_id: drop, day_ids: [d3] }] };
  const res = b.publicSignup(signupArgs(b, added.public_code, [kid], { expected_total_cents: 15000 + 1500 }));
  assert.equal(res.status, 'ok');
  const leo = toCamel(rows(b, 'camp_roster', ROSTER, [{ col: 'camp_id', value: added.id }]))[0];
  // Removing the extra while Leo is active → not_empty (kind extra).
  let camp = toCamel(rows(b, 'camps', 'id, version', [{ col: 'id', value: added.id }]))[0];
  const keepPizza = rows(b, 'camp_extras', 'id, name', [{ col: 'camp_id', value: added.id }]).find((e) => e.name === 'Pizza party');
  const noDrop = { p_extras: [{ id: keepPizza.id, name: 'Pizza party', price_cents: 500, per: 'once', not_for_all_days: true }] };
  assert.deepEqual(rpcOk(b, 'camp_update_camp', { ...addCampArgs('2027-06-07', { ...noDrop, p_signup_opens_on: '2027-05-01' }), p_camp_id: added.id, p_expected_version: camp.version }),
    { status: 'not_empty', kind: 'extra', extra_name: 'Early drop-off', count: 1 });
  // Withdraw Leo: now Fri (d3) and the extra can go; his rows for them are deleted, he stays under Removed.
  rpcOk(b, 'camp_withdraw_camper', { p_camper_id: leo.id, p_expected_version: leo.version }, STAFF);
  camp = toCamel(rows(b, 'camps', 'id, version', [{ col: 'id', value: added.id }]))[0];
  const twoDays = addCampArgs('2027-06-07', { ...noDrop, p_signup_opens_on: '2027-05-01', p_days: ['2027-06-07', '2027-06-08'], p_signup_closes_on: '2027-06-06' });
  twoDays.p_prices = twoDays.p_prices.slice(0, 2);
  assert.equal(rpcOk(b, 'camp_update_camp', { ...twoDays, p_camp_id: added.id, p_expected_version: camp.version }).status, 'ok');
  const after = toCamel(rows(b, 'camp_roster', ROSTER, [{ col: 'camp_id', value: added.id }]))[0];
  assert.equal(after.status, 'withdrawn');
  assert.deepEqual(after.days.map((x) => x.dayId), [d1]);
  assert.deepEqual(after.extras, []);
  assert.equal(store().camp_days.some((x) => x.id === d3), false);
  assert.equal(store().camp_days.some((x) => x.id === d2), true);
  // 30 tries per connection per hour: the 31st is rate_limited (refusals count too).
  const key = 'busy-key';
  for (let i = 0; i < 30; i += 1) assert.equal(b.publicSignup({ ...signupArgs(b, added.public_code, [kid]), client_key: key, parent_phone: 'x' }).status, 'invalid');
  // The 31st try is refused even with good details (the limit comes after the input checks, step 7).
  const good = () => ({ ...signupArgs(b, added.public_code, [{ ...kid, day_ids: [d1], extras: [] }], { expected_total_cents: 7500 }), client_key: key });
  assert.equal(b.publicSignup(good()).status, 'rate_limited');
  env.clock += 61 * 60 * 1000; // an hour later the tries have aged out
  assert.equal(b.publicSignup(good()).status, 'ok');
  // failNextSave: the next save fails like a dropped connection and changes nothing.
  b.failNextSave();
  const before = JSON.stringify(store());
  assert.equal(b.rpc('camp_set_signup', { p_camp_id: added.id, p_expected_version: 1, p_open: false }, ADMIN).status, 0);
  assert.equal(JSON.stringify(store()), before);
  // simulateOtherAdminEdit → stale.
  b.simulateOtherAdminEdit();
  camp = toCamel(rows(b, 'camps', 'id, version', [{ col: 'id', value: added.id }]))[0];
  assert.equal(rpcOk(b, 'camp_set_signup', { p_camp_id: added.id, p_expected_version: camp.version - 1, p_open: false }).status, 'stale');
  // price_changed forced (+$5 on every price) and camp_changed forced.
  const forced = b.publicSignup(signupArgs(b, added.public_code, [{ ...kid, day_ids: [d1], extras: [] }], { expected_total_cents: 7500 }), { forcePriceChanged: true });
  assert.deepEqual([forced.status, forced.new_total_cents, forced.old_total_cents], ['price_changed', 8000, 7500]);
  assert.equal(b.publicSignup(signupArgs(b, added.public_code, [{ ...kid, day_ids: [d1], extras: [] }], { expected_total_cents: 8000 }), { forceCampChanged: true }).status, 'camp_changed');
  assert.equal(b.publicSignup(signupArgs(b, added.public_code, [{ ...kid, day_ids: [d1], extras: [] }], { expected_total_cents: 8000 })).status, 'ok');
});

check('mock: Edit camp refuses changes that break active campers\' extras (0027, v0.720)', () => {
  const { backend: b } = makeBackend({ today: '2027-05-20' });
  // Mon 7 – Wed 9; Pizza $5 a day, not for all-days campers; Early drop-off once (not "not for all days").
  const extras = (pizza = {}, drop = {}) => [
    { name: 'Early drop-off', price_cents: 1500, per: 'once', not_for_all_days: false, only_on: [], ...drop },
    { name: 'Pizza party', price_cents: 500, per: 'day', not_for_all_days: true, only_on: [], ...pizza },
  ];
  const base = addCampArgs('2027-06-07', { p_signup_opens_on: '2027-05-01', p_extras: extras() });
  const added = rpcOk(b, 'camp_add_camp', base);
  assert.equal(added.status, 'ok');
  const pub = b.publicCamp(added.public_code);
  const [d1, d2] = pub.camp.days.map((x) => x.day_id);
  const [dropId, pizzaId] = pub.camp.extras.map((e) => e.extra_id);
  // Noah: Mon + Tue, pizza Mon, drop-off. (Sent twice: first to learn the total.)
  const noah = { first_name: 'Noah', last_name: 'Patel', age: 9, member: true, day_ids: [d1, d2],
    extras: [{ extra_id: pizzaId, day_ids: [d1] }, { extra_id: dropId, day_ids: [] }] };
  const priced = b.publicSignup(signupArgs(b, added.public_code, [noah]));
  assert.equal(priced.status, 'price_changed');
  assert.equal(b.publicSignup(signupArgs(b, added.public_code, [noah], { expected_total_cents: priced.new_total_cents })).status, 'ok');
  const ids = toCamel(rows(b, 'camp_extras', 'id, name', [{ col: 'camp_id', value: added.id }]));
  const version = () => toCamel(rows(b, 'camps', 'id, version', [{ col: 'id', value: added.id }]))[0].version;
  const edit = (days, pizza = {}, drop = {}) => ({
    ...base, p_camp_id: added.id, p_expected_version: version(), p_days: days,
    p_prices: days.map((_, i) => ({ day_count: i + 1, member_early_cents: 7500 * (i + 1), member_regular_cents: 8000 * (i + 1), nonmember_early_cents: 8500 * (i + 1), nonmember_regular_cents: 9000 * (i + 1) })),
    p_extras: extras(pizza, drop).map((e, i) => ({ ...e, id: ids.find((x) => x.name === e.name)?.id ?? ids[i].id })),
  });
  const v0 = version();
  // Removing Wed (nobody picked it) would make Noah an every-day camper that week → his Mon pizza
  // would be included → refused, nothing written.
  assert.deepEqual(rpcOk(b, 'camp_update_camp', edit(['2027-06-07', '2027-06-08'])),
    { status: 'not_empty', kind: 'extra_included', extra_name: 'Pizza party', count: 1 });
  assert.equal(version(), v0);
  // Switching pizza to once while Noah has it → refused.
  assert.deepEqual(rpcOk(b, 'camp_update_camp', edit(['2027-06-07', '2027-06-08', '2027-06-09'], { per: 'once' })),
    { status: 'not_empty', kind: 'extra_per', extra_name: 'Pizza party', count: 1 });
  // Marking the once drop-off "not for all-days campers" while removing Wed: Noah would come every
  // camp day → refused, naming drop-off (pizza made "every day" not-for-all-days false here).
  assert.deepEqual(rpcOk(b, 'camp_update_camp', edit(['2027-06-07', '2027-06-08'], { not_for_all_days: false }, { not_for_all_days: true })),
    { status: 'not_empty', kind: 'extra_included', extra_name: 'Early drop-off', count: 1 });
  assert.equal(version(), v0);
  // Adding Thu is always fine; with Noah withdrawn, removing Wed is fine too.
  assert.equal(rpcOk(b, 'camp_update_camp', edit(['2027-06-07', '2027-06-08', '2027-06-09', '2027-06-10'])).status, 'ok');
  const row = toCamel(rows(b, 'camp_roster', ROSTER, [{ col: 'camp_id', value: added.id }])).find((x) => x.firstName === 'Noah');
  assert.equal(rpcOk(b, 'camp_withdraw_camper', { p_camper_id: row.id, p_expected_version: row.version }, STAFF).status, 'ok');
  assert.equal(rpcOk(b, 'camp_update_camp', edit(['2027-06-07', '2027-06-08'])).status, 'ok');
  // …and his Mon pizza (now included) went with it, so Restore can't bring back a broken extra.
  const left = toCamel(rows(b, 'camp_camper_extras', 'camper_id, extra_id', [{ col: 'camper_id', value: row.id }]));
  assert.deepEqual(left.map((x) => x.extraId), [dropId]);
});

check('mock: extras only on some days (only_on) — validation, public path, templates, seed', () => {
  const { backend: b, env } = makeBackend({ today: '2027-05-20' });
  const base = addCampArgs('2027-06-07', { p_signup_opens_on: '2027-05-01' }); // Mon 7, Tue 8, Wed 9
  const pizzaOn = (only, per = 'day') => ({ ...base, p_extras: [base.p_extras[0], { name: 'Pizza party', price_cents: 500, per, not_for_all_days: true, only_on: only }] });
  assert.deepEqual(rpcOk(b, 'camp_add_camp', pizzaOn(['2027-06-10'])), { status: 'invalid', field: 'extras' }); // not a camp day
  assert.deepEqual(rpcOk(b, 'camp_add_camp', pizzaOn(['2027-06-09'], 'once')), { status: 'invalid', field: 'extras' }); // once + only_on
  assert.deepEqual(rpcOk(b, 'camp_add_camp', pizzaOn(['2027-06-09', '2027-06-09'])), { status: 'invalid', field: 'extras' });
  assert.deepEqual(rpcOk(b, 'camp_add_camp', pizzaOn(['June 9'])), { status: 'invalid', field: 'extras' });
  const added = rpcOk(b, 'camp_add_camp', pizzaOn(['2027-06-07', '2027-06-09']));
  assert.equal(added.status, 'ok');
  let pub = b.publicCamp(added.public_code);
  assert.deepEqual(pub.camp.extras.map((e) => e.only_on), [[], ['2027-06-07', '2027-06-09']]);
  const [d1, d2, d3] = pub.camp.days.map((x) => x.day_id);
  const pizza = pub.camp.extras[1].extra_id;
  const kid = (pizzaDays, days = [d1, d2]) => ({ first_name: 'Noah', last_name: 'Patel', age: 9, member: true, day_ids: days, extras: [{ extra_id: pizza, day_ids: pizzaDays }] });
  assert.equal(b.publicSignup(signupArgs(b, added.public_code, [kid([d2])], { expected_total_cents: 15500 })).status, 'camp_changed'); // Tue isn't a pizza day
  const okSign = b.publicSignup(signupArgs(b, added.public_code, [kid([d1])], { expected_total_cents: 15500 }));
  assert.equal(okSign.status, 'ok');
  // The camp's extras in the list read (only_on is granted).
  const extras = toCamel(rows(b, 'camp_extras', 'id, name, per, only_on', [{ col: 'camp_id', value: added.id }]));
  assert.deepEqual(extras.find((e) => e.name === 'Pizza party').onlyOn, ['2027-06-07', '2027-06-09']);
  // Edit camp: removing Mon + Wed would leave pizza "every day" — refused, field 'extras'.
  const camp = toCamel(rows(b, 'camps', 'id, version', [{ col: 'id', value: added.id }]))[0];
  const ids = toCamel(rows(b, 'camp_extras', 'id, name', [{ col: 'camp_id', value: added.id }]));
  const edit = (days, only) => ({
    ...base, p_camp_id: added.id, p_expected_version: camp.version, p_days: days, p_signup_closes_on: '2027-06-06',
    p_prices: base.p_prices.slice(0, days.length),
    p_extras: [{ ...base.p_extras[0], id: ids[0].id }, { name: 'Pizza party', price_cents: 500, per: 'day', not_for_all_days: true, only_on: only, id: ids[1].id }],
  });
  assert.deepEqual(rpcOk(b, 'camp_update_camp', edit(['2027-06-08', '2027-06-10'], [])), { status: 'invalid', field: 'extras' });
  assert.deepEqual(rpcOk(b, 'camp_update_camp', edit(['2027-06-07', '2027-06-08'], ['2027-06-09'])), { status: 'invalid', field: 'extras' }); // a removed day
  // Narrowing pizza from Mon + Wed to Tue while Noah (active) chose Mon → refused, kind extra_day
  // (owner decision 2026-10-19), naming the earliest such day.
  assert.deepEqual(rpcOk(b, 'camp_update_camp', edit(['2027-06-07', '2027-06-08', '2027-06-09'], ['2027-06-08'])),
    { status: 'not_empty', kind: 'extra_day', extra_name: 'Pizza party', day: '2027-06-07', count: 1 });
  // Mon + Tue (Wed taken away — nobody chose Wed): fine.
  assert.equal(rpcOk(b, 'camp_update_camp', edit(['2027-06-07', '2027-06-08', '2027-06-09'], ['2027-06-07', '2027-06-08'])).status, 'ok');
  // A family form still offering Wed pizza is out of date → camp_changed; Tue pizza is fine.
  assert.equal(b.publicSignup(signupArgs(b, added.public_code, [{ ...kid([d3], [d1, d3]), first_name: 'Zoe' }], { expected_total_cents: 15500 })).status, 'camp_changed');
  assert.equal(b.publicSignup(signupArgs(b, added.public_code, [{ ...kid([d2]), first_name: 'Zoe' }], { expected_total_cents: 15500 })).status, 'ok');
  // Edit details: a day the extra isn't offered on → invalid.
  const noah = toCamel(rows(b, 'camp_roster', ROSTER, [{ col: 'camp_id', value: added.id }])).find((x) => x.firstName === 'Noah');
  const det = (pizzaDays, dayIds = [d1, d2]) => ({
    p_camper_id: noah.id, p_camper_version: noah.version, p_signup_version: noah.signupVersion, p_first: 'Noah', p_last: 'Patel', p_age: 9,
    p_member: true, p_day_ids: dayIds, p_extras: [{ extra_id: pizza, day_ids: pizzaDays }], p_parent_name: 'Laura Rossi', p_parent_phone: '5085550142',
    p_parent_relation: 'Mother', p_emergency_name: 'Paul Rossi', p_emergency_phone: '5085550187', p_emergency_relation: 'Uncle',
  });
  assert.equal(rpcOk(b, 'camp_update_details', det([d3], [d1, d2, d3]), STAFF).status, 'invalid'); // Wed: not offered
  assert.equal(rpcOk(b, 'camp_update_details', det([d2]), STAFF).status, 'ok');
  // Save as template keeps weekdays; Edit template checks only_weekdays.
  const saved = rpcOk(b, 'camp_save_template', { p_camp_id: added.id, p_name: 'June week' });
  const tpl = toCamel(rows(b, 'camp_templates', 'id, extras, version', [{ col: 'id', value: saved.id }]))[0];
  assert.deepEqual(tpl.extras.map((e) => e.onlyWeekdays), [[], [1, 2]]); // Mon, Tue
  const tArgs = (onlyWeekdays) => ({
    p_template_id: tpl.id, p_expected_version: tpl.version, p_name: 'June week', p_location_code: 'worcester', p_both_schools: false, p_day_count: 3,
    p_start_time: '09:00', p_end_time: '15:00', p_opens_days_before: 30, p_closes_days_before: 1, p_early_days_before: 7, p_min_age: 5, p_max_age: 12,
    p_prices: base.p_prices, p_extras: [{ name: 'Pizza party', price_cents: 500, per: 'day', not_for_all_days: true, only_weekdays: onlyWeekdays }],
    p_description: null, p_waiver_text: 'I agree.',
  });
  assert.deepEqual(rpcOk(b, 'camp_update_template', tArgs([8])), { status: 'invalid', field: 'extras' });
  assert.deepEqual(rpcOk(b, 'camp_update_template', tArgs([3, 3])), { status: 'invalid', field: 'extras' });
  assert.equal(rpcOk(b, 'camp_update_template', tArgs([3, 5])).status, 'ok');
  // The seed: April Vacation Camp's "Pizza party" ($5 a day, Wed + Fri, not for all-days campers),
  // Ethan has it on Fri (still $245); the Vacation week and Summer week templates have it as Wed + Fri.
  env.today = '2027-04-21';
  const { backend: s } = makeBackend({ today: '2027-04-21' });
  const april = rows(s, 'camps', 'id, name').find((c) => c.name === 'April Vacation Camp');
  const aExtras = toCamel(rows(s, 'camp_extras', 'id, name, price_cents, per, not_for_all_days, only_on', [{ col: 'camp_id', value: april.id }]));
  const { id: pizzaId, ...pizzaRest } = aExtras.find((e) => e.name === 'Pizza party');
  assert.equal(typeof pizzaId, 'string');
  assert.deepEqual(pizzaRest, { name: 'Pizza party', priceCents: 500, per: 'day', notForAllDays: true, onlyOn: ['2027-04-21', '2027-04-23'] });
  const roster = toCamel(rows(s, 'camp_roster', ROSTER, [{ col: 'camp_id', value: april.id }]));
  assert.equal(roster.find((x) => x.firstName === 'Ethan').totalCents, 24500);
  assert.equal(roster.find((x) => x.firstName === 'Mia').totalCents, 16600);
  const tpls = toCamel(rows(s, 'camp_templates', 'name, extras'));
  for (const name of ['Vacation week', 'Summer week']) {
    const p = tpls.find((x) => x.name === name).extras.find((e) => e.name === 'Pizza party');
    assert.deepEqual(p, { name: 'Pizza party', priceCents: 500, per: 'day', notForAllDays: true, onlyWeekdays: [3, 5] });
  }
  const sDays = toCamel(rows(s, 'camp_days', 'id, day', [{ col: 'camp_id', value: april.id }])).map((d) => ({ dayId: d.id, day: d.day }));
  const wed = sDays.find((d) => d.day === '2027-04-21').dayId;
  const pizzaExtra = { ...pizzaRest, extraId: pizzaId };
  // Wed: every active all-days camper (incl. Ava's duplicate) gets the pizza; nobody chose it on Wed.
  const allDaysActive = roster.filter((x) => x.status === 'active' && x.days.length === 5).length;
  assert.equal(extraCountOnDay(roster, pizzaExtra, wed, sDays), allDaysActive);
});

check('campsArgs round trip: onlyOn through Add / Edit camp, onlyWeekdays through templates', () => {
  const { backend: b } = makeBackend({ today: '2027-05-20' });
  // What the Add camp dialog sends, in the app's camelCase shapes (campsApi.addCamp → campArgs).
  const input = {
    locationCode: 'worcester', bothSchools: false, name: 'June Camp', days: ['2027-06-07', '2027-06-08', '2027-06-09'],
    startTime: '09:00', endTime: '15:00', signupOpensOn: '2027-05-01', signupClosesOn: '2027-06-06', earlyUntil: '2027-05-31',
    minAge: 5, maxAge: 12,
    prices: [1, 2, 3].map((n) => ({ dayCount: n, memberEarlyCents: 7500 * n, memberRegularCents: 8000 * n, nonmemberEarlyCents: 8500 * n, nonmemberRegularCents: 9000 * n })),
    extras: [
      { name: 'Early drop-off', priceCents: 1500, per: 'day', notForAllDays: false, onlyOn: [] },
      { name: 'Pizza party', priceCents: 500, per: 'day', notForAllDays: true, onlyOn: ['2027-06-07', '2027-06-09'] },
    ],
    description: null, waiverText: 'I agree.',
  };
  assert.deepEqual(campArgs(input, false).p_extras[1], { name: 'Pizza party', price_cents: 500, per: 'day', not_for_all_days: true, only_on: ['2027-06-07', '2027-06-09'] });
  const added = rpcOk(b, 'camp_add_camp', campArgs(input, false));
  assert.equal(added.status, 'ok');
  // What campsApi.loadCamp reads back (EXTRA_COLUMNS → toExtra).
  const load = () => rows(b, 'camp_extras', EXTRA_COLUMNS, [{ col: 'camp_id', value: added.id }]).map(toExtra).sort((x, y) => x.sort - y.sort);
  let extras = load();
  assert.deepEqual(extras.map((e) => e.onlyOn), [[], ['2027-06-07', '2027-06-09']]);
  assert.equal(typeof extras[1].extraId, 'string');
  // Edit camp: pizza on Tue only, sent with its extraId (campsApi.updateCamp → campArgs(…, true)).
  const camp = rows(b, 'camps', 'id, version', [{ col: 'id', value: added.id }])[0];
  const edited = { ...input, extras: extras.map((e) => (e.name === 'Pizza party' ? { ...e, onlyOn: ['2027-06-08'] } : e)) };
  assert.equal(campArgs(edited, true).p_extras[1].id, extras[1].extraId);
  assert.equal(rpcOk(b, 'camp_update_camp', { p_camp_id: added.id, p_expected_version: camp.version, ...campArgs(edited, true) }).status, 'ok');
  extras = load();
  assert.deepEqual(extras.map((e) => e.onlyOn), [[], ['2027-06-08']]);
  assert.equal(extras.length, 2); // changed in place, not added again
  // Save as template → Load templates (TEMPLATE_COLUMNS → toTemplate): onlyWeekdays [2] (Tue).
  const saved = rpcOk(b, 'camp_save_template', { p_camp_id: added.id, p_name: 'June template' });
  const loadTpl = () => toTemplate(rows(b, 'camp_templates', TEMPLATE_COLUMNS, [{ col: 'id', value: saved.id }])[0]);
  let tpl = loadTpl();
  assert.deepEqual(tpl.extras.map((e) => e.onlyWeekdays), [[], [2]]);
  // Edit template (campsApi.updateTemplate → templateArgs): pizza on Wed + Fri.
  const tInput = { ...tpl, extras: tpl.extras.map((e) => (e.name === 'Pizza party' ? { ...e, onlyWeekdays: [3, 5] } : e)) };
  assert.deepEqual(templateArgs(tInput).p_extras[1], { name: 'Pizza party', price_cents: 500, per: 'day', not_for_all_days: true, only_weekdays: [3, 5] });
  assert.equal(rpcOk(b, 'camp_update_template', { p_template_id: tpl.id, p_expected_version: tpl.version, ...templateArgs(tInput) }).status, 'ok');
  tpl = loadTpl();
  assert.deepEqual(tpl.extras.map((e) => e.onlyWeekdays), [[], [3, 5]]);
});

check('weeks (CP5 roster week switcher): campWeeks, defaultWeekIndex', () => {
  const mk = (list) => list.map((day, i) => ({ dayId: `d${i}`, day }));
  const april = mk(['2027-04-19', '2027-04-20', '2027-04-21', '2027-04-22', '2027-04-23']);
  assert.equal(campWeeks(april).length, 1);
  const two = mk(['2027-07-05', '2027-07-06', '2027-07-07', '2027-07-08', '2027-07-09', '2027-07-12', '2027-07-13', '2027-07-14', '2027-07-15', '2027-07-16']);
  const weeks = campWeeks(two);
  assert.deepEqual(weeks.map((w) => [w.monday, w.days.length]), [['2027-07-05', 5], ['2027-07-12', 5]]);
  assert.equal(defaultWeekIndex(weeks, '2027-07-14'), 1); // the week containing today
  assert.equal(defaultWeekIndex(weeks, '2027-07-10'), 0); // Saturday of week 1 still counts as week 1
  assert.equal(defaultWeekIndex(weeks, '2027-07-11'), 0); // Sunday too (Mon–Sun weeks)
  assert.equal(defaultWeekIndex(weeks, '2027-06-01'), 0); // before the camp: the first week
  assert.equal(defaultWeekIndex(weeks, '2027-08-01'), 1); // after it: the last week
  // A Sunday camp day belongs to the week that started the Monday before it; gaps are fine.
  const odd = campWeeks(mk(['2026-12-27', '2026-12-28', '2027-01-04']));
  assert.deepEqual(odd.map((w) => w.monday), ['2026-12-21', '2026-12-28', '2027-01-04']);
  assert.equal(defaultWeekIndex(odd, '2027-01-02'), 1);
  assert.equal(defaultWeekIndex([], '2027-01-02'), 0);
});

// ======================= weekly pricing (rulebook v0.717, migration 0022) =======================
// Each Monday–Sunday week a camper comes is priced by the grid row for that week's days; the
// weeks add up. The grid has rows 1…W (W = the most camp days in one week). Pizza (not charged to
// all-days campers) is included per week. Same price grid as the April camp (5 rows).

// Two weeks, Mon Jul 5 – Fri Jul 16, 2027 (ids w1…w10).
const TWO_WEEKS = ['2027-07-05', '2027-07-06', '2027-07-07', '2027-07-08', '2027-07-09', '2027-07-12', '2027-07-13', '2027-07-14', '2027-07-15', '2027-07-16']
  .map((day, i) => ({ dayId: `w${i + 1}`, day }));
const W = TWO_WEEKS.map((d) => d.dayId);
const WEEK1 = W.slice(0, 5);
const WEEK2 = W.slice(5);
// Pizza on the Wednesdays and Fridays of both weeks.
const W_PIZZA = { extraId: 'pz', name: 'Pizza party', priceCents: 500, per: 'day', notForAllDays: true, onlyOn: ['2027-07-07', '2027-07-09', '2027-07-14', '2027-07-16'], sort: 0 };
const W_LUNCH = { extraId: 'ln', name: 'Lunch', priceCents: 600, per: 'once', notForAllDays: true, onlyOn: [], sort: 1 };
const W_EXTRAS = [W_PIZZA, W_LUNCH];
const wPrice = (c, kind = 'early') => priceChild(c, APRIL_PRICES, W_EXTRAS, TWO_WEEKS, kind);
const wProblem = (c, kind = 'early') => childProblem(c, APRIL_PRICES, W_EXTRAS, TWO_WEEKS, kind);

check('weekly pricing: grid size W (R2)', () => {
  assert.equal(MAX_WEEK_DAYS, 7);
  assert.equal(gridSizeFor([]), 0);
  assert.equal(gridSizeFor(['2026-10-12']), 1); // a 1-day camp → 1 row
  assert.equal(gridSizeFor(TWO_WEEKS), 5); // Mon–Fri × 2 → 5 rows
  assert.equal(gridSizeFor(['2026-11-25', '2026-11-27']), 2); // Thanksgiving Wed + Fri → 2 rows
  // Test 2: Oct 26–30, Nov 9–11, Nov 16–17 (2026) → 5 rows
  const test2 = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-16', '2026-11-17'];
  assert.equal(gridSizeFor(test2), 5);
  assert.equal(gridSizeFor([...test2].reverse()), 5); // order doesn't matter
  assert.equal(gridSizeFor(['2027-07-10', '2027-07-11']), 2); // Sat + Sun: the same Mon–Sun week
  assert.equal(gridSizeFor(['2027-07-11', '2027-07-12']), 1); // Sun + Mon: two weeks
  // A 3-week camp with 12 days (5 + 5 + 2) → 5 rows.
  assert.equal(gridSizeFor([...TWO_WEEKS.map((d) => d.day), '2027-07-19', '2027-07-20']), 5);
  // gridRowsFor makes rows 1…W.
  assert.deepEqual(gridRowsFor(gridSizeFor(TWO_WEEKS), APRIL_PRICES).map((r) => r.dayCount), [1, 2, 3, 4, 5]);
});

check('weekly pricing: price of a camper (R3)', () => {
  // 5 + 5 = 2 × row 5
  const both = wPrice(child(W, true));
  assert.equal(both.baseCents, 2 * 27500);
  assert.deepEqual(both.weeks, [{ monday: '2027-07-05', dayCount: 5, cents: 27500 }, { monday: '2027-07-12', dayCount: 5, cents: 27500 }]);
  assert.equal(both.dayCount, 10);
  // 5 + 3 = row 5 + row 3
  assert.equal(wPrice(child([...WEEK1, W[5], W[6], W[7]], true)).baseCents, 27500 + 19500);
  // 2 + 2 = 2 × row 2 (member regular, non-member early too)
  const twoTwo = child([W[0], W[1], W[5], W[6]], true);
  assert.equal(wPrice(twoTwo).baseCents, 2 * 14000);
  assert.equal(wPrice(twoTwo, 'regular').baseCents, 2 * 15000);
  assert.equal(wPrice({ ...twoTwo, member: false }).baseCents, 2 * 15000);
  // One week only: exactly as before (one item in weeks).
  assert.deepEqual(wPrice(child(WEEK2.slice(0, 3), false), 'regular').weeks, [{ monday: '2027-07-12', dayCount: 3, cents: 22000 }]);
  // Thanksgiving Wed + Fri: one week of 2 days.
  const tg = [{ dayId: 'a', day: '2026-11-25' }, { dayId: 'b', day: '2026-11-27' }];
  assert.equal(priceChild(child(['a', 'b'], true), APRIL_PRICES.slice(0, 2), [], tg, 'early').totalCents, 14000);
  // A week with no grid row → baseCents null (the base then counts 0; the database refuses it).
  const short = priceChild(child(W, true), APRIL_PRICES.slice(0, 4), [], TWO_WEEKS, 'early');
  assert.equal(short.baseCents, null);
  assert.equal(short.weeks[0].cents, null);
  assert.equal(short.totalCents, 0);
  // The family total adds children up.
  assert.equal(familyTotal([both, wPrice(twoTwo)]), 55000 + 28000);
});

check('weekly pricing: "not charged to all-days campers" is per week (R6)', () => {
  // Every day of week 1, Mon + Wed of week 2.
  const kid = (extras) => child([...WEEK1, W[5], W[7]], true, extras);
  const [wed1, fri1, wed2, fri2] = [W[2], W[4], W[7], W[9]];
  assert.equal(wProblem(kid([{ extraId: 'pz', dayIds: [wed2] }])), null); // week 2 not full: may buy
  assert.equal(wPrice(kid([{ extraId: 'pz', dayIds: [wed2] }])).totalCents, 27500 + 14000 + 500);
  assert.equal(wProblem(kid([{ extraId: 'pz', dayIds: [wed1] }])), 'not_for_all_days'); // week 1 full: included
  assert.equal(wProblem(kid([{ extraId: 'pz', dayIds: [fri1, wed2] }])), 'not_for_all_days');
  assert.equal(wProblem(kid([{ extraId: 'pz', dayIds: [fri2] }])), 'extra_day_not_child_day');
  assert.equal(comesAllWeek([...WEEK1, W[5]], TWO_WEEKS, '2027-07-07'), true);
  assert.equal(comesAllWeek([...WEEK1, W[5]], TWO_WEEKS, '2027-07-14'), false);
  assert.equal(comesAllWeek([], [], '2027-07-14'), false);
  // extraDaysFor with the camp's days leaves out the days of full weeks.
  const kidDays = TWO_WEEKS.filter((d) => [...WEEK1, W[5], W[7]].includes(d.dayId));
  assert.deepEqual(extraDaysFor(W_PIZZA, kidDays, TWO_WEEKS).map((d) => d.day), ['2027-07-14']);
  assert.deepEqual(extraDaysFor(W_PIZZA, kidDays).map((d) => d.day), ['2027-07-07', '2027-07-09', '2027-07-14']); // without: as before
  // A once not-for-all-days extra: refused only for a child coming every day of the whole camp.
  assert.equal(wProblem(child(WEEK1, true, [{ extraId: 'ln', dayIds: [] }])), null);
  assert.equal(wProblem(child(W, true, [{ extraId: 'ln', dayIds: [] }])), 'not_for_all_days');
  // Roster count = chose it that day + comes every day of that day's week (and is on that day).
  const r = (id, dayIds, picks = []) => ({
    id, status: 'active', duplicateState: 'none', paidCents: 0, owesCents: 0,
    days: dayIds.map((dayId) => ({ dayId, day: TWO_WEEKS.find((d) => d.dayId === dayId).day, checkedInAt: null })),
    extras: picks.map((dayId) => ({ extraId: 'pz', name: 'Pizza party', per: 'day', dayId })),
  });
  const rows = [
    r('a', [...WEEK1, W[5], W[7]]), // full week 1 only
    r('b', [W[0], W[2], W[7]], [wed2]), // chose pizza on week-2 Wednesday
    r('c', W), // both weeks full
    r('d', WEEK2.slice(0, 4)), // Mon–Thu of week 2: not full
  ];
  assert.equal(extraCountOnDay(rows, W_PIZZA, wed1, TWO_WEEKS), 2); // a + c (b comes but week 1 not full, didn't choose)
  assert.equal(extraCountOnDay(rows, W_PIZZA, wed2, TWO_WEEKS), 2); // b (chose) + c (full week 2)
  assert.equal(extraCountOnDay(rows, W_PIZZA, fri2, TWO_WEEKS), 1); // c only
  assert.equal(missingExtraOnDay(rows[0], W_PIZZA, wed1, TWO_WEEKS), false); // included that week
  assert.equal(missingExtraOnDay(rows[0], W_PIZZA, wed2, TWO_WEEKS), true); // "No pizza party"
  assert.equal(missingExtraOnDay(rows[1], W_PIZZA, wed2, TWO_WEEKS), false); // chose it
  assert.equal(missingExtraOnDay(rows[3], W_PIZZA, wed2, TWO_WEEKS), true);
});

check('weekly pricing: 60 days and the $10,000 cap (R4, R5)', () => {
  // 12 weeks of Mon–Fri = 60 days.
  const sixty = [];
  for (let wk = 0; wk < 12; wk += 1) for (let d = 0; d < 5; d += 1) sixty.push({ dayId: `s${wk}-${d}`, day: addD('2027-01-04', wk * 7 + d) });
  assert.equal(sixty.length, MAX_DAYS);
  assert.equal(gridSizeFor(sixty), 5);
  const ids = sixty.map((d) => d.dayId);
  const full = priceChild(child(ids, true), APRIL_PRICES, [], sixty, 'early');
  assert.equal(full.baseCents, 12 * 27500);
  assert.equal(full.weeks.length, 12);
  // $3,300 base + 60 × $110 + $100 once = $10,000 exactly → allowed; $1 more → too_expensive.
  const extras = (onceCents) => [
    { extraId: 'x1', name: 'Care', priceCents: 11000, per: 'day', notForAllDays: false, onlyOn: [], sort: 0 },
    { extraId: 'x2', name: 'Kit', priceCents: onceCents, per: 'once', notForAllDays: false, onlyOn: [], sort: 1 },
  ];
  const big = child(ids, true, [{ extraId: 'x1', dayIds: ids }, { extraId: 'x2', dayIds: [] }]);
  assert.equal(priceChild(big, APRIL_PRICES, extras(10000), sixty, 'early').totalCents, MAX_CAMPER_CENTS);
  assert.equal(childProblem(big, APRIL_PRICES, extras(10000), sixty, 'early'), null);
  assert.equal(childProblem(big, APRIL_PRICES, extras(10100), sixty, 'early'), 'too_expensive');
});

check('mock: weekly pricing — Add / Edit camp grids, 60 days, templates, detail, sign-up, old store', () => {
  const { backend: b, env } = makeBackend({ today: '2027-05-20' });
  const weekdays = (monday, n) => Array.from({ length: n }, (_, i) => addD(monday, i));
  const gridArg = (n) => Array.from({ length: n }, (_, i) => ({ day_count: i + 1, member_early_cents: 7500 * (i + 1), member_regular_cents: 8000 * (i + 1), nonmember_early_cents: 8500 * (i + 1), nonmember_regular_cents: 9000 * (i + 1) }));
  const campArgsFor = (days, rowsCount, o = {}) => addCampArgs(days[0], { p_days: days, p_signup_opens_on: '2027-05-20', p_signup_closes_on: addD(days[0], -1), p_early_until: '2027-05-31', p_prices: gridArg(rowsCount), ...o });
  // Two weeks Mon–Fri: a 5-row grid is right; the old 10-row grid and a 4-row grid are refused.
  const twoWeeks = [...weekdays('2027-06-07', 5), ...weekdays('2027-06-14', 5)];
  assert.equal(rpcOk(b, 'camp_add_camp', campArgsFor(twoWeeks, 10)).status, 'invalid');
  assert.equal(rpcOk(b, 'camp_add_camp', campArgsFor(twoWeeks, 4)).status, 'invalid');
  const added = rpcOk(b, 'camp_add_camp', campArgsFor(twoWeeks, 5));
  assert.equal(added.status, 'ok');
  // A 3-week camp with 12 days (5 + 5 + 2) → 5 rows, saved.
  const twelve = [...twoWeeks, ...weekdays('2027-06-21', 2)];
  assert.equal(rpcOk(b, 'camp_add_camp', campArgsFor(twelve, 5)).status, 'ok');
  // Thanksgiving-like Wed + Fri → 2 rows.
  assert.equal(rpcOk(b, 'camp_add_camp', campArgsFor(['2027-06-09', '2027-06-11'], 2)).status, 'ok');
  // 60 days ok, 61 refused (R4).
  const sixty = [];
  for (let wk = 0; wk < 12; wk += 1) sixty.push(...weekdays(addD('2027-06-07', wk * 7), 5));
  assert.equal(rpcOk(b, 'camp_add_camp', campArgsFor(sixty, 5, { p_early_until: '2027-05-31' })).status, 'ok');
  assert.equal(rpcOk(b, 'camp_add_camp', campArgsFor([...sixty, '2027-06-12'], 6)).status, 'invalid'); // 61 days (a Saturday added)
  // Edit camp: adding week 3's Mon + Tue keeps W = 5 → the same 5 rows are accepted.
  const camp = rows(b, 'camps', 'id, version', [{ col: 'id', value: added.id }])[0];
  assert.equal(rpcOk(b, 'camp_update_camp', { p_camp_id: added.id, p_expected_version: camp.version, ...campArgsFor(twelve, 5) }).status, 'ok');
  // Sign-up 5 + 3 days: the price is row 5 + row 3 (member early 37500 + 22500).
  const pub = b.publicCamp(added.public_code);
  const dayIds = pub.camp.days.map((d) => d.day_id);
  const kid = { first_name: 'Ava', last_name: 'Lee', age: 8, member: true, day_ids: [...dayIds.slice(0, 5), ...dayIds.slice(5, 8)], extras: [] };
  const priced = b.publicSignup(signupArgs(b, added.public_code, [kid]));
  assert.equal(priced.status, 'price_changed');
  assert.equal(priced.new_total_cents, 37500 + 22500);
  const ok = b.publicSignup(signupArgs(b, added.public_code, [kid], { expected_total_cents: 60000 }));
  assert.equal(ok.status, 'ok');
  assert.deepEqual(ok.children[0].weeks, [{ monday: '2027-06-07', day_count: 5, cents: 37500 }, { monday: '2027-06-14', day_count: 3, cents: 22500 }]);
  assert.equal(ok.children[0].base_cents, 60000);
  assert.equal(ok.children[0].day_count, 8);
  // Camper detail: breakdown.weeks.
  const camper = rows(b, 'camp_roster', 'id, first_name', [{ col: 'camp_id', value: added.id }])[0];
  const detail = rpcOk(b, 'camp_camper_detail', { p_camper_id: camper.id });
  assert.deepEqual(detail.breakdown.weeks.map((w) => [w.monday, w.day_count, w.cents]), [['2027-06-07', 5, 37500], ['2027-06-14', 3, 22500]]);
  assert.equal(detail.breakdown.base_cents, 60000);
  // Save as template stores W and the 1…W grid (R7).
  const saved = rpcOk(b, 'camp_save_template', { p_camp_id: added.id, p_name: 'Two-week template' });
  const tpl = toTemplate(rows(b, 'camp_templates', TEMPLATE_COLUMNS, [{ col: 'id', value: saved.id }])[0]);
  assert.equal(tpl.dayCount, 5);
  assert.equal(tpl.prices.length, 5);
  // Edit template: Days per week 1–7; the grid must match.
  const tplArgs = (n) => ({ p_template_id: tpl.id, p_expected_version: tpl.version, ...templateArgs({ ...tpl, dayCount: n, prices: gridArg(n).map((p) => toCamel(p)) }) });
  assert.equal(rpcOk(b, 'camp_update_template', tplArgs(8)).status, 'invalid');
  assert.equal(rpcOk(b, 'camp_update_template', tplArgs(7)).status, 'ok');
  // The default data: the Two-Week Summer Camp has a 5-row grid; Noah (3 + 3 days) = 2 × row 3.
  env.today = '2027-05-20';
  const summer = rows(b, 'camps', 'id, name').find((c) => c.name === 'Two-Week Summer Camp');
  assert.equal(rows(b, 'camp_prices', 'day_count', [{ col: 'camp_id', value: summer.id }]).length, 5);
  const noah = toCamel(rows(b, 'camp_roster', ROSTER + ', base_cents', [{ col: 'camp_id', value: summer.id }])).find((x) => x.firstName === 'Noah');
  assert.equal(noah.baseCents, 2 * 19500);
  // A saved store from before weekly pricing (schema 3, 10-row summer grid) is upgraded, not thrown away.
  const old = defaultCampsData({ today: '2027-05-20' });
  old.schema = 3;
  const summerId = old.camps.find((c) => c.name === 'Two-Week Summer Camp').id;
  for (let n = 6; n <= 10; n += 1) old.camp_prices.push({ id: randomUUID(), camp_id: summerId, day_count: n, member_early_cents: 100, member_regular_cents: 100, nonmember_early_cents: 100, nonmember_regular_cents: 100 });
  old.camp_templates[0].day_count = 10;
  old.camps[0].name = 'Kept by the upgrade';
  let saved3 = old;
  const b3 = createCampsBackend({ loadStore: () => saved3, saveStore: (s) => { saved3 = s; }, now: () => Date.parse('2027-05-20T14:00:00Z'), today: () => '2027-05-20', newId: () => randomUUID() });
  assert.equal(rows(b3, 'camps', 'name')[0].name, 'Kept by the upgrade');
  assert.equal(rows(b3, 'camp_prices', 'day_count', [{ col: 'camp_id', value: summerId }]).length, 5);
  assert.equal(Math.max(...rows(b3, 'camp_templates', 'day_count').map((t) => t.day_count)) <= 7, true);
});

check('payment school (v0.707): paymentSchoolFor, Mark paid / Undo / Edit payment, detail, seed', () => {
  // This device's home school, whatever the camp or the switcher (owner decision 2026-10-19).
  assert.equal(paymentSchoolFor('Worcester'), 'worcester');
  assert.equal(paymentSchoolFor('Shrewsbury'), 'shrewsbury');
  assert.equal(paymentSchoolFor('shrewsbury'), 'shrewsbury');
  assert.equal(paymentSchoolFor('Both'), null); // never a device school
  assert.equal(paymentSchoolFor('boston'), null);
  assert.equal(paymentSchoolFor(undefined), null);
  const { backend: b } = makeBackend({ today: '2027-04-21' });
  const april = rows(b, 'camps', 'id, name').find((c) => c.name === 'April Vacation Camp');
  const roster = () => toCamel(rows(b, 'camp_roster', ROSTER, [{ col: 'camp_id', value: april.id }]));
  const detail = (id) => toCamel(rpcOk(b, 'camp_camper_detail', { p_camper_id: id }, STAFF));
  // Seed: Olivia Chen paid at the Shrewsbury desk; Liam at Worcester (the camp's school).
  const olivia = roster().find((x) => x.firstName === 'Olivia');
  assert.equal(detail(olivia.id).payments[0].school, 'shrewsbury');
  assert.equal(detail(roster().find((x) => x.firstName === 'Liam').id).payments[0].school, 'worcester');
  // Mark paid needs a school.
  const noah = roster().find((x) => x.firstName === 'Noah');
  for (const bad of [null, 'both', 'boston']) {
    assert.deepEqual(rpcOk(b, 'camp_mark_paid', { p_camper_id: noah.id, p_expected_version: noah.version, p_school: bad }, STAFF), { status: 'invalid', field: 'school' });
  }
  const paid = rpcOk(b, 'camp_mark_paid', { p_camper_id: noah.id, p_expected_version: noah.version, p_school: 'shrewsbury' }, STAFF);
  assert.equal(paid.status, 'ok');
  assert.equal(paid.school, 'shrewsbury');
  // The toast's Undo: the reversal lands in the same school's drawer.
  assert.equal(rpcOk(b, 'camp_undo_payment', { p_payment_id: paid.payment_id }, STAFF).status, 'ok');
  let pays = detail(noah.id).payments;
  assert.deepEqual(pays.map((p) => [p.kind, p.school]), [['payment', 'shrewsbury'], ['reversal', 'shrewsbury']]);
  // Edit payment (admin) can correct the school: the reversal keeps the old school, the new row has the new one.
  const v = roster().find((x) => x.id === noah.id).version;
  const again = rpcOk(b, 'camp_mark_paid', { p_camper_id: noah.id, p_expected_version: v, p_school: 'shrewsbury' }, STAFF);
  const editArgs = (school) => ({ p_payment_id: again.payment_id, p_method: 'check', p_amount_cents: 21900, p_paid_on: '2027-04-21', p_school: school });
  assert.deepEqual(rpcOk(b, 'camp_edit_payment', editArgs('nowhere')), { status: 'invalid', field: 'school' });
  assert.equal(rpcOk(b, 'camp_edit_payment', editArgs('worcester')).status, 'ok');
  pays = detail(noah.id).payments;
  assert.deepEqual(pays.slice(2).map((p) => [p.kind, p.school]), [['payment', 'shrewsbury'], ['reversal', 'shrewsbury'], ['payment', 'worcester']]);
  assert.equal(roster().find((x) => x.id === noah.id).owesCents, 0);
});

check('mock: the signature clean-up after 3 years (only from Add camp / Mark paid)', () => {
  const { backend: b, env, store } = makeBackend({ today: '2026-10-19' });
  const columbus = store() ?? defaultCampsData({ today: '2026-10-19' }); // nothing saved yet → defaults
  assert.equal(columbus.camp_signups.every((s) => s.signature !== null), true);
  env.today = '2029-10-13'; // Columbus Day 2026 was Oct 12: 3 years + 1 day later
  const extraDays = ['2029-11-01'];
  rpcOk(b, 'camp_add_camp', addCampArgs('2029-11-01', { p_days: extraDays, p_signup_opens_on: '2029-10-13', p_signup_closes_on: '2029-10-31', p_early_until: '2029-10-20', p_prices: [{ day_count: 1, member_early_cents: 7500, member_regular_cents: 8000, nonmember_early_cents: 8500, nonmember_regular_cents: 9000 }] }));
  const s = store();
  const columbusId = s.camps.find((c) => c.name === 'Columbus Day Camp').id;
  const before = defaultCampsData({ today: '2026-10-19' }).camp_signups.filter((x) => x.camp_id === columbusId);
  const afterRows = s.camp_signups.filter((x) => x.camp_id === columbusId);
  assert.equal(afterRows.every((x) => x.signature === null && x.signature_deleted_at !== null), true);
  assert.deepEqual(afterRows.map((x) => x.version), before.map((x) => x.version)); // no version bump
  assert.equal(s.camp_signups.filter((x) => x.camp_id !== columbusId).every((x) => x.signature !== null), true);
  const roster = toCamel(rows(b, 'camp_roster', 'signed, signature_deleted_at', [{ col: 'camp_id', value: columbusId }]));
  assert.equal(roster.every((x) => x.signed === true && x.signatureDeletedAt !== null), true); // "signature deleted after 3 years"
});

check('school clock helper', () => {
  assert.equal(schoolClockToIso('2027-03-03', '20:52'), '2027-03-04T01:52:00.000Z'); // EST
  assert.equal(schoolClockToIso('2027-04-19', '07:40'), '2027-04-19T11:40:00.000Z'); // EDT
});

// ======================= publicApi.preview.js (the family page in preview mode) =======================
// It runs in the browser; here a tiny fake window (localStorage) stands in.
const memory = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  },
};
const previewApi = await import('./publicApi.preview.js');
previewApi.setFakeDelay(0);
await (async () => {
  const label = 'publicApi.preview: GET / POST, field limits, allowlist, helpers';
  try {
    memory.set('tkd.preview.today', '2026-10-19');
    const code = DEFAULT_CAMP_CODES.thanksgiving;
    const got = await previewApi.getCamp(code);
    assert.deepEqual(Object.keys(got).sort(), ['ack_version', 'camp', 'closed_on', 'opens_on', 'price_kind_today', 'state', 'status', 'turnstile_site_key', 'waiver_version']);
    assert.equal(got.state, 'open');
    assert.equal(got.camp.name, 'Thanksgiving Camp');
    assert.equal(typeof window.__tkdPreview.campWeek, 'function'); // installed on first use
    assert.deepEqual(await previewApi.getCamp('nope'), { status: 'not_found' });
    assert.deepEqual(await previewApi.getCamp('k7m2qp4l'), { status: 'not_found' });
    const [wed, fri] = got.camp.days.map((d) => d.day_id);
    const pick = got.camp.extras[1].extra_id;
    const body = (o = {}) => ({
      submission_id: randomUUID(),
      children: [{ first_name: 'Ivy', last_name: 'Stone', age: 7, member: false, day_ids: [wed, fri], extras: [{ extra_id: pick, day_ids: [wed, fri] }] }],
      parent: { name: 'Jo Stone', phone: '5085550111', relation: 'Mother' },
      emergency: { name: 'Al Stone', phone: '5085550112', relation: 'Uncle' },
      paying_by: 'cash', acknowledged: true, signature: 'data:image/png;base64,iVBORw0KGgo=', ack_version: CAMP_ACK_VERSION,
      waiver_version: got.waiver_version, expected_total_cents: 16600, website: '', started_at: 1000, sent_at: 9000, turnstile_token: null, ...o,
    });
    const ok = await previewApi.signUp(code, body());
    assert.deepEqual(Object.keys(ok).sort(), ['camp', 'children', 'family_total_cents', 'paying_by', 'reference', 'status']);
    assert.equal(ok.family_total_cents, 16600);
    // The Function's field limits → bad_request (no database).
    for (const bad of [
      { extra_key: 1 }, { website: 'bot' }, { sent_at: 2000 }, { submission_id: 'nope' },
      { children: [] }, { expected_total_cents: 3000001 /* 3 × $10,000 + 1, R5 */ }, { parent: { name: 'x', phone: '1'.repeat(21), relation: 'y' } },
    ]) assert.equal((await previewApi.signUp(code, body(bad))).status, 'bad_request', JSON.stringify(bad));
    const bigKid = body().children[0];
    assert.equal((await previewApi.signUp(code, body({ children: [bigKid, bigKid, bigKid, bigKid] }))).status, 'bad_request');
    assert.equal((await previewApi.signUp(code, body({ children: [{ ...bigKid, age: 9.5 }] }))).status, 'bad_request');
    const ids61 = Array.from({ length: 61 }, () => randomUUID()); // a camp has up to 60 days (R4)
    assert.equal((await previewApi.signUp(code, body({ children: [{ ...bigKid, day_ids: ids61, extras: [] }] }))).status, 'bad_request');
    assert.notEqual((await previewApi.signUp(code, body({ children: [{ ...bigKid, day_ids: ids61.slice(1), extras: [] }] }))).status, 'bad_request');
    assert.equal((await previewApi.signUp(code, body({ children: [{ ...bigKid, member: 'yes' }] }))).status, 'bad_request');
    // Database refusals reduced to the allowlist.
    const changedPrice = await previewApi.signUp(code, body({ expected_total_cents: 100 }));
    assert.deepEqual(Object.keys(changedPrice).sort(), ['camp', 'new_total_cents', 'old_total_cents', 'status']);
    const helpers = window.__tkdPreview;
    helpers.forceCampChanged(true);
    assert.deepEqual(Object.keys(await previewApi.signUp(code, body())).sort(), ['camp', 'status']);
    helpers.forceVerifyFailed(true);
    assert.deepEqual(await previewApi.signUp(code, body()), { status: 'verify_failed' });
    helpers.forceRateLimited(true);
    assert.deepEqual(await previewApi.signUp(code, body()), { status: 'rate_limited' });
    helpers.forceRateLimited(false);
    helpers.forcePriceChanged(true);
    const raised = await previewApi.signUp(code, body());
    assert.equal(raised.status, 'price_changed');
    assert.equal(raised.new_total_cents, 16600 + 500 + 0); // 2-day non-member early $150 → $155, pick-up unchanged
    // Not open yet / closed / finished.
    assert.deepEqual(await previewApi.signUp(DEFAULT_CAMP_CODES.winter, body()), { status: 'not_open', opens_on: '2026-11-30' });
    assert.deepEqual(await previewApi.signUp(DEFAULT_CAMP_CODES.veterans, body()), { status: 'closed', closed_on: null });
    assert.deepEqual(await previewApi.signUp(DEFAULT_CAMP_CODES.columbus, body()), { status: 'finished' });
    // simulateFamilySignup: first open camp (Thanksgiving), and a duplicate of Mia Rossi.
    assert.match(helpers.simulateFamilySignup(), /^Signed up .* on Thanksgiving Camp/);
    assert.match(helpers.simulateFamilySignup(code, { duplicateOf: 'Mia Rossi' }), /Mia Rossi/);
    // The kill switch.
    helpers.setCampsRegistration(false);
    assert.deepEqual(await previewApi.getCamp(code), { status: 'not_open' });
    assert.deepEqual(await previewApi.signUp(code, body()), { status: 'not_open' });
    helpers.setCampsRegistration(true);
    assert.match(helpers.resetCamps(), /back to the defaults/);
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
})();

console.log(`${count} groups of checks ran.`);
console.log('ALL CAMPS LIB CHECKS PASSED');
