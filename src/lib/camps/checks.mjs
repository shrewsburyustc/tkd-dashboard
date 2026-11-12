// checks.mjs — automatic checks for the Camps data layer. Run:  node src/lib/camps/checks.mjs
// Why it exists: campRules.js, qr.js and the preview database (mockCamps.js) carry rules that must
// match the real database (migration 0013) exactly — above all the shared price case table of
// contract 0013 §1.20, which the SQL tests (0013_tests.sql) check with the same rows. These plain
// `assert` checks run in well under a second without a browser or a database, and print
// ALL CAMPS LIB CHECKS PASSED (contract 0013 §5.5).
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
// Fill in (v0.741): the cut that keeps register.css's page rules out of the dashboard.
import { scopedRegisterCss, onlyFamilyFormRules } from '../../screens/camps/familyFormCss.js';
import {
  CAMP_ACK_VERSION, DEFAULT_AGES, AGE_LIMITS, MAX_DAYS, MAX_EXTRAS, MAX_CHILDREN, MAX_CAMPER_CENTS, SIGNATURE_KEEP_YEARS,
  CAMP_TRIES_PER_HOUR, UNDO_WINDOW_MS, PAYING_BY, DEFAULT_EARLY_DAYS_BEFORE, DEFAULT_CLOSES_DAYS_BEFORE,
  signupState, campTag, isCampWeek, defaultCampTab, defaultCheckInDay, campsForLocation, campCounts, priceKind, baseCents,
  priceChild, familyTotal, isAllDays, payTag, toCollectCents, checkInRule, checkInNote, attendanceCell, cameCount, validateAges,
  ageAllowed, NO_MAX_AGE, phoneDigits, formatPhone, templateFromCamp, campDatesFromTemplate, gridRowsFor, campLink, toCamel, toSnake,
  childProblem, offsetsAreValid, todayInSchoolTime, campTextIsValid, normalizeCampText, extraDaysRemoved,
  gridSizeFor, comesAllWeek, MAX_WEEK_DAYS,
  comingCardDay, comesOnDay, campCardCounts, matchesCardFilter,
  getsExtraOnDay, extraShortName, extraDayWord, everyDayExtras, dayExtrasFor, dayExtraCounts,
  yearsAround, campWeeks, defaultWeekIndex, paymentSchoolFor, payingByChoiceWhere, extraDaysFor, extraOfferedOn, extraCountOnDay, missingExtraOnDay, onlyOnToWeekdays, weekdaysToOnlyOn, isoWeekday,
  overpaidCents, refundStands, refundMenuItems, newestStandingRefund, reversesRefund, standingPayments, parseRefundAmount,
  paidTagParts, rosterRoomNeeded, ROSTER_ROOM,
  campLinks, rowSchool, rowsForSchool, otherSchool, SCHOOL_CODES,
} from './campRules.js';
import { campQrSvgDataUrl, campLink as qrCampLink } from './qr.js';
// The shared QR file name the Registration link box uses (rulebook v0.733, C11 option B).
import { qrFileName } from '../qr.js';
import { campArgs, templateArgs, toExtra, toTemplate, EXTRA_COLUMNS, TEMPLATE_COLUMNS } from './campsArgs.js';
// Fill in's mapping (migration 0043): what campsApi.js sends and checks.
import { staffSignupArgs, staffFormShapeOk, staffSignupShapeOk, signupSourceOf } from './campsArgs.js';
// Record refund's arguments and the roster's columns (migration 0039): what campsApi.js sends and reads.
import { recordRefundArgs, ROSTER_COLUMNS } from './campsArgs.js';
// Print receipt's plain receipt (rulebook v0.734, design review C3).
import { buildCampReceipt, canPrintReceipt, receiptPayments } from './campReceipt.js';
// The History words (migration 0033, rulebook v0.736; the Mark paid box's hint is campRules' payingByChoiceWhere).
import { groupCamperHistory, describeCamperBatch } from '../../screens/camps/camperHistoryWords.js';
import {
  createCampsBackend, defaultCampsData, md5, schoolClockToIso, DEFAULT_CAMP_CODES, CAMP_RPC_NAMES, CAMP_RESTRICTED_RPC_NAMES, CAMP_TABLES,
} from '../mockCamps.js';
// The Camps words (the screens' text.js): only to check the "Hide private details" sentences and
// the v0.725 / v0.726 words.
import * as CampText from '../../screens/camps/text.js';
import * as StarText from '../../screens/testing/star/candidates/text.js'; // only to compare the shared payment words (R1-07)
import * as FamilyText from '../../camp/text.js'; // the public family page's words
import { compareRows } from '../../screens/camps/duplicates.js'; // the possible-duplicate compare box's rows
// The shared words (src/components/text.js): only to check the "Date signed" sentences (v0.638).
import * as SharedText from '../../components/text.js';
// The Edit camp form's pure Undo helpers (rulebook v0.726).
// … and its starting values (a Blank camp's two extras, rulebook v0.739).
import { campUndoRefusal, undoAddsPastDay, undoCampPayload, blankValues, applyBlank, checkForm, valuesFromCamp, valuesFromTemplate } from '../../screens/camps/sections/campForm.js';
// R2-05: the Camps pages' line of saves (the helpers, and the shared save line they use)
import { reloadBounded, saveOnLine, undoAnswer } from '../../screens/camps/lineSave.js';
import { createSaveLine } from '../saveLine.js';

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
  assert.deepEqual(DEFAULT_AGES, { min: 3, max: 99 }); // a minimum age and no maximum: 99 is how "no maximum" is stored (v0.756)
  assert.equal(NO_MAX_AGE, 99);
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

check('the QR file name (shared, v0.733 option B), campLink and the QR picture', () => {
  // The camp page passes school null for a both-schools camp and the school's name for a
  // one-school camp; the shared box names the file with the shared qrFileName.
  assert.equal(qrFileName('April Vacation Camp', null), 'April Vacation Camp QR code.png');
  assert.equal(qrFileName('Veterans Day Camp', 'Worcester'), 'Veterans Day Camp - Worcester QR code.png');
  assert.equal(CampText.schoolName('worcester'), 'Worcester'); // the school the camp page passes
  // The card's heading: Camps' words, not the shared default "Worcester school".
  assert.equal(CampText.campSchoolLine({ bothSchools: true, locationCode: 'worcester' }), 'Both schools'); // no "held at" (v0.754 / v0.755)
  assert.equal(CampText.campSchoolLine({ bothSchools: false, locationCode: 'worcester' }), 'Worcester');
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
  // overpaid never lowers it; withdrawn don't count; a possible duplicate stays out until reviewed (v0.742)
  assert.equal(toCollectCents(rows), 21900 + 1500);
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
  // A minimum age only (v0.756): blank and out-of-range are the only problems; there is no "order".
  assert.equal(validateAges(3), null);
  assert.equal(validateAges(1), null);
  assert.equal(validateAges(99), null);
  assert.equal(validateAges(''), 'blank');
  assert.equal(validateAges(null), 'blank');
  assert.equal(validateAges(Number.NaN), 'blank');
  assert.equal(validateAges(0), 'range');
  assert.equal(validateAges(100), 'range');
  assert.equal(validateAges(5.5), 'range');
  assert.equal(ageAllowed(5, APRIL_CAMP), true);
  assert.equal(ageAllowed(12, APRIL_CAMP), true);
  assert.equal(ageAllowed(4, APRIL_CAMP), false);
  assert.equal(ageAllowed(13, APRIL_CAMP), true); // no maximum: the camp's stored 12 is ignored by the family form
  assert.equal(ageAllowed(45, APRIL_CAMP), true);
  assert.equal(ageAllowed(99, APRIL_CAMP), true);
  assert.equal(ageAllowed(100, APRIL_CAMP), false); // the database accepts 1 to 99
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
  for (const text of ['', 'abc', 'I give permission…', 'x'.repeat(1000), 'Jae H. Jeong\'s']) {
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
  // Columbus Day (Oct 12, past): 9 campers, all checked in. Veterans 16, Thanksgiving 13 (Jack
  // Rivera's sister Sofia joined his sign-up for C7's history, 0033), Winter 0, April 19, Two-Week
  // Summer Camp 6 (added 2026-10-21 for the roster's week switcher).
  const counts = campCounts(toCamel(rows(b2, 'camp_roster', 'camp_id, status')));
  assert.deepEqual(camps.map((c) => counts[c.id] ?? 0), [9, 16, 13, 0, 19, 6]);
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

// failNextCampRead (design review S-2, rulebook v1.051): the next Camps READ — a select on a Camps
// table or a read function — fails like a dropped connection, so the preview can show each failed
// read's Retry. "The next read" = the first matching read and every other one started in the same
// moment (until `defer` runs: here we hold the deferred step and run it by hand). Saves don't use
// it up; a target ('camp_camper_detail', 'camps', …) leaves every other read alone; once the
// moment is over the read works again (that's the Retry).
check('mock: failNextCampRead — same-moment reads fail, a target ignores other reads, then it clears', () => {
  let store = null;
  const later = []; // the deferred "end of the moment" steps, run by hand below
  const endMoment = () => later.splice(0).forEach((fn) => fn());
  const b = createCampsBackend({
    loadStore: () => store,
    saveStore: (s) => { store = JSON.parse(JSON.stringify(s)); },
    now: () => Date.parse('2027-04-21T14:00:00Z'),
    today: () => '2027-04-21',
    newId: () => randomUUID(),
    defer: (fn) => later.push(fn),
  });
  const failed = (res) => res.data === null && res.status === 0 && /failNextCampRead/.test(res.error?.message ?? '');
  const april = rows(b, 'camps', 'id, name, version').find((c) => c.name === 'April Vacation Camp');
  const camper = toCamel(rows(b, 'camp_roster', ROSTER, [{ col: 'camp_id', value: april.id }]))[0];
  const readCamp = () => b.select('camps', 'id', [{ col: 'id', value: april.id }], [], ADMIN);

  // No target: two reads in the same moment (StrictMode's double start; a camp's five tables) both fail.
  b.failNextCampRead();
  assert.equal(failed(readCamp()), true);
  assert.equal(failed(b.select('camp_days', 'id', [], [], ADMIN)), true);
  assert.equal(failed(b.rpc('camp_camper_detail', { p_camper_id: camper.id }, ADMIN)), true);
  endMoment(); // the moment is over: cleared
  assert.equal(readCamp().error, null);
  assert.equal(rpcOk(b, 'camp_camper_detail', { p_camper_id: camper.id }).status, 'ok');
  assert.equal(later.length, 0);

  // A target: other reads go through and don't use it up; only that read fails, then it clears.
  b.failNextCampRead('camp_camper_detail');
  assert.equal(readCamp().error, null);
  assert.equal(b.select('camp_roster', 'id', [], [], ADMIN).error, null);
  assert.equal(later.length, 0); // nothing matched yet: still armed
  assert.equal(failed(b.rpc('camp_camper_detail', { p_camper_id: camper.id }, ADMIN)), true);
  assert.equal(failed(b.rpc('camp_camper_detail', { p_camper_id: camper.id }, ADMIN)), true); // same moment
  assert.equal(readCamp().error, null); // still only the target
  endMoment();
  assert.equal(rpcOk(b, 'camp_camper_detail', { p_camper_id: camper.id }).status, 'ok');

  // A table target ('camps' = what Edit camp and Delete camp read first).
  b.failNextCampRead('camps');
  assert.equal(b.select('camp_templates', 'id', [], [], ADMIN).error, null);
  assert.equal(failed(readCamp()), true);
  endMoment();
  assert.equal(readCamp().error, null);

  // A save neither fails nor uses it up: the read after the save is the one that fails.
  b.failNextCampRead();
  const before = JSON.stringify(store);
  assert.equal(rpcOk(b, 'camp_set_signup', { p_camp_id: april.id, p_expected_version: april.version, p_open: false }).status, 'ok');
  assert.notEqual(JSON.stringify(store), before);
  assert.equal(failed(b.select('camp_templates', 'id', [], [], ADMIN)), true);
  endMoment();
  assert.equal(b.select('camp_templates', 'id', [], [], ADMIN).error, null);
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

// ======================= Hide private details (rulebook v0.722, design review C1) =======================
// While the switch is on, the delete sentences and the Mark paid toast never name an amount, a
// method or whether anything was paid; with it off they read exactly as before.
check('Hide private details: delete sentences and toast name no money (v0.722)', () => {
  const T = CampText;
  const camp = 'April Vacation Camp';
  const pay = [{ amountCents: 33500, method: 'card', paidOn: '2027-03-25' }];
  // Delete camper: one sentence, paid or not (picture 03b).
  const hiddenCamper = 'The sign-up and any recorded payment are deleted from April Vacation Camp. This can\'t be undone.';
  assert.equal(T.deleteCamperBody(camp, pay, true), hiddenCamper);
  assert.equal(T.deleteCamperBody(camp, [], true), hiddenCamper);
  assert.equal(T.deleteCamperBody(camp, [], false), 'The sign-up is deleted from April Vacation Camp. This can\'t be undone.');
  assert.match(T.deleteCamperBody(camp, pay, false), /\$335 card payment recorded on Mar 25/);
  // Delete camp: with and without removed campers; an empty camp has no payment to mention.
  assert.equal(T.deleteCampBody(camp, 19, 1, 379500, true), 'April Vacation Camp, its 19 campers and 1 removed, and any recorded payment are deleted. This can\'t be undone.');
  assert.equal(T.deleteCampBody(camp, 19, 0, 0, true), 'April Vacation Camp, its 19 campers and any recorded payment are deleted. This can\'t be undone.');
  assert.equal(T.deleteCampBody(camp, 0, 0, 0, true), 'April Vacation Camp is deleted. This can\'t be undone.');
  assert.match(T.deleteCampBody(camp, 19, 1, 379500, false), /\$3,795 in payments/);
  for (const text of [T.deleteCamperBody(camp, pay, true), T.deleteCampBody(camp, 19, 1, 379500, true), T.markedPaidToastHidden('Leo Kim')]) {
    assert.ok(!/\$|cash|check|card|\bpaid on\b/i.test(text), text);
  }
  assert.equal(T.markedPaidToastHidden('Leo Kim'), 'Leo Kim marked paid');
  // The gray words are the dashboard-wide ones (src/lib/privateDetails.js).
  assert.equal(T.HIDDEN_ON_THIS_TABLET, 'Hidden on this tablet');
  assert.equal(T.PAYMENT_DETAILS_HIDDEN, 'Payment details are hidden on this tablet.');
  assert.equal(`${T.TOTAL_NOW} ${T.HIDDEN_ON_THIS_TABLET}`, 'Total now Hidden on this tablet');
});

// ======================= Undo after Camps' saves (rulebook v0.726) and "Open sign-up" (v0.725) =======================
// Edit camp's Undo sends the camp's OLD payload again: an extra the save removed goes without its
// id (it no longer exists — the database would refuse the id), kept ones keep theirs, and the
// refusal words name the reason. (The round trip itself is tried in the preview, in the browser.)
check('Undo of Edit camp: old payload, refusal words (v0.726)', () => {
  const T = CampText;
  const before = { days: ['2027-04-19', '2027-04-20'], extras: [{ name: 'Pizza', extraId: 'x1' }, { name: 'Swim', extraId: 'x2' }] };
  const saved = { days: ['2027-04-20', '2027-04-21'], extras: [{ name: 'Pizza', extraId: 'x1' }, { name: 'Art', extraId: null }] };
  const back = undoCampPayload(before, saved);
  assert.deepEqual(back.extras, [{ name: 'Pizza', extraId: 'x1' }, { name: 'Swim', extraId: null }]);
  assert.deepEqual(back.days, before.days);
  assert.equal(undoCampPayload(null, saved), null);
  // A past day taken off can't be put back by Undo (the database refuses new past days).
  assert.equal(undoAddsPastDay(before, saved, '2027-04-20'), true);
  assert.equal(undoAddsPastDay(before, saved, '2027-04-19'), false);
  // The shared sentence (R2-07, v1.045 (4)): "Couldn't undo: [reason]." (the reason's own period is not doubled)
  assert.equal(campUndoRefusal({ status: 'invalid' }, { addsPastDay: true }), "Couldn't undo: New days can't be in the past.");
  assert.equal(campUndoRefusal({ status: 'invalid' }, { addsPastDay: false }), null);
  assert.equal(campUndoRefusal({ status: 'stale' }), null);
  assert.equal(campUndoRefusal({ status: 'ok' }), null);
  assert.match(campUndoRefusal({ status: 'not_empty', kind: 'day', day: '2027-04-21', firstName: 'Mia', lastName: 'Rossi', more: 0 }), /^Couldn't undo: Can't remove .*Mia Rossi picked it/);
  assert.match(campUndoRefusal({ status: 'not_empty', kind: 'extra', extraName: 'Art', count: 2 }), /^Couldn't undo: Can't remove Art: 2 campers picked it/);
  assert.match(campUndoRefusal({ status: 'not_empty', kind: 'extra_per', extraName: 'Art', count: 1 }), /^Couldn't undo: Can't switch Art/);
  assert.match(campUndoRefusal({ status: 'not_empty', kind: 'extra_included', extraName: 'Art', count: 1 }), /^Couldn't undo: Can't save: Art would become included/);
  // The words (v0.725 / v0.726).
  assert.equal(T.OPEN_SIGNUP, 'Open sign-up');
  assert.equal(T.OPEN_NEEDS_ADMIN, 'The closing date has passed. Ask an admin to open it.');
  assert.equal(T.TOAST_SIGNUP_OPEN, 'Sign-up open');
  assert.equal(T.signupOpenUntil('2027-04-30'), 'Sign-up open until Apr 30');
  assert.equal(T.signupNotOpened('April Camp'), "Sign-up for April Camp wasn't opened. Check the connection, then retry.");
  assert.equal(T.linkDialogLine('closed', {}), 'Family sign-up is closed. Open it from the ⋯ menu to take more sign-ups.');
  assert.equal(T.TOAST_PAYMENT_CHANGED, 'Payment changed');
});

check('date calendar Year list (v0.727)', () => {
  assert.deepEqual(yearsAround('2027-04-21', ['2026-12-30', '']), [2026, 2027, 2028]);
  assert.deepEqual(yearsAround('2027-04-21', ['2025-03-01'], false), [2025, 2026, 2027]);
  assert.deepEqual(yearsAround('2027-04-21', [], false), [2027]);
  assert.deepEqual(yearsAround('2027-04-21', ['2029-07-01']), [2027, 2028, 2029]);
  assert.deepEqual(yearsAround('', ['nope']), []);
});

// ======================= money words (rulebook v0.732, design review C17) =======================
check('Camps writes money with the shared formatMoney: whole dollars as before, a real minus sign', () => {
  const T = CampText;
  assert.equal(T.dueTag(35000), '$350 due');
  assert.equal(T.tagOwes(1500), 'Owes $15');
  // ("Mark paid $1,355" is the shared Mark paid box's own words since v0.735.)
  assert.equal(T.markPaidAmount, undefined);
  assert.equal(T.newTotalLine(0), 'Total now $0');
  assert.equal(T.markedPaidToast('Leo Kim', 35000, 'cash'), 'Leo Kim marked paid · $350 cash'); // Camps' own copy
  const pay = { amountCents: 33500, method: 'card', kind: 'payment', school: 'worcester', paidOn: '2027-04-19', recordedByName: 'Jeffrey' };
  assert.equal(T.paymentLine(pay), '$335 card · paid Apr 19 · Worcester · by Jeffrey');
  // The one visible change: a reversed payment reads "−$335" (U+2212 before the $), not "$-335".
  assert.equal(T.paymentLine({ ...pay, amountCents: -33500, kind: 'reversal' }), '\u2212$335 card (reversed) · Apr 19 · Worcester · by Jeffrey');
  assert.equal('dollars' in T, false); // Color Belt's helper is no longer re-exported
});

// ======================= payment line + History words (rulebook v0.751 = v1.135, R1-07 second part) =======================
// Camps' lines are Star's base words with Camps' extras (school, by who) added after them, in the order
// date, what for, school, by who. These checks put Star's own output next to Camps', so the words
// can't drift apart again.
check('R1-07: Camps\' payment line and History words start with Star\'s words and add only the extras after them', () => {
  const T = CampText;
  const S = StarText;
  const pay = { amountCents: 14000, method: 'card', kind: 'payment', school: 'worcester', paidOn: '2027-11-03', recordedByName: 'Jeffrey Berg' };
  // A payment: Star's "$140 card · paid Nov 3", then school, then who.
  assert.equal(T.paymentLine(pay), `${S.paidDetail(14000, 'card', '2027-11-03')} · Worcester · by Jeffrey Berg`);
  assert.equal(T.paymentLine({ ...pay, school: null, recordedByName: null }), S.paidDetail(14000, 'card', '2027-11-03'));
  // A refund: Star's "refunded $23 cash Nov 3", then school, then who.
  const refund = { ...pay, kind: 'refund', amountCents: -2300, method: 'cash' };
  assert.equal(T.paymentLine(refund), `${S.refundedDetail(2300, 'cash', '2027-11-03')} · Worcester · by Jeffrey Berg`);
  // The row that undid a payment has no "paid" (its day is when it was undone): amount, "(reversed)", day, school, who.
  assert.equal(T.paymentLine({ ...pay, kind: 'reversal', amountCents: -14000 }), '−$140 card (reversed) · Nov 3 · Worcester · by Jeffrey Berg');
  // No paid day on a row: no stray "paid " or trailing space.
  assert.equal(T.paymentLine({ ...pay, paidOn: null, school: null, recordedByName: null }), '$140 card');
  assert.equal(T.paymentLine({ ...refund, paidOn: null, school: null, recordedByName: null }), 'refunded $23 cash');
  // History: Star's two lines, word for word.
  assert.equal(T.historyMarkedPaid(14000, 'card', '2027-11-03'), S.historyPayment(14000, 'card', '2027-11-03'));
  assert.equal(T.historyMarkedPaid(14000, 'card', '2027-11-03'), 'Payment recorded: $140 card, paid Nov 3');
  assert.equal(T.historyPaymentUndone(14000), S.historyPaymentUndone(14000));
  assert.equal(T.historyPaymentUndone(14000), 'Payment undone: $140');
  // A history row that carries no paid day (older rows) leaves ", paid …" out instead of printing "undefined".
  assert.equal(T.historyMarkedPaid(14000, 'card'), 'Payment recorded: $140 card');
  // The refund lines were already Star's.
  assert.equal(T.historyRefund(2300, 'cash', '2027-11-03'), 'Refund recorded: $23 cash, Nov 3');
  assert.equal(T.historyRefundUndone(2300), S.historyRefundUndone ? S.historyRefundUndone(2300) : 'Refund undone: $23');
});

// ======================= Print receipt (rulebook v0.734, design review C3) =======================
// The plain receipt campReceipt.js builds for the shared Receipt.jsx (Star's v0.518 as the model).
{
  const camp = { name: 'Thanksgiving Camp', locationCode: 'worcester', bothSchools: false };
  const campDays = [{ dayId: 'd1', day: '2026-11-25' }, { dayId: 'd2', day: '2026-11-27' }];
  const camper = {
    id: 'c1', firstName: 'Jack', lastName: 'Rivera', status: 'active', age: 9, member: true,
    days: [{ dayId: 'd1', day: '2026-11-25' }, { dayId: 'd2', day: '2026-11-27' }],
    totalCents: 18600, paidCents: 18600, reference: 'CP-4821', payingBy: 'cash',
    // private things a roster row can carry — none may reach the receipt
    signedUpOn: '2026-10-01', signatureDeletedAt: null,
  };
  // The $186 check was changed with Edit payment to $100 cash (old payment + its reversal), then
  // $86 was marked paid; the payments come in no particular order (jsonb_agg has none).
  const payments = [
    { id: 'p3', kind: 'payment', amountCents: 8600, method: 'cash', paidOn: '2026-10-29', recordedAt: '2026-10-29T15:00:00Z', reversesPaymentId: null },
    { id: 'p1', kind: 'payment', amountCents: 18600, method: 'check', paidOn: '2026-10-20', recordedAt: '2026-10-20T14:00:00Z', reversesPaymentId: null },
    { id: 'r1', kind: 'reversal', amountCents: -18600, method: 'check', paidOn: '2026-10-28', recordedAt: '2026-10-28T10:00:00Z', reversesPaymentId: 'p1' },
    { id: 'p2', kind: 'payment', amountCents: 10000, method: 'cash', paidOn: '2026-10-20', recordedAt: '2026-10-28T10:00:01Z', reversesPaymentId: null },
  ];
  const detail = {
    status: 'ok', camper,
    family: { parentName: 'Ana Rivera', parentPhone: '5085551234', parentRelation: 'Mother', emergencyName: 'Luis Rivera', emergencyPhone: '5085559876', emergencyRelation: 'Uncle' },
    breakdown: { extras: [{ name: 'Late pick-up', per: 'day', days: ['2026-11-25'], cents: 1000 }, { name: 'T-shirt', per: 'once', days: [], cents: 1500 }], totalCents: 18600 },
    payments,
  };
  const schools = [
    { code: 'worcester', name: 'Worcester', address: { street: '1141 Main St' }, phone: '(508) 767-1717' },
    { code: 'shrewsbury', name: 'Shrewsbury', address: null, phone: null },
  ];
  const build = (over = {}) => buildCampReceipt({ detail, camp, campDays, campExtras: [], schools, printedOn: '2026-10-29', printedByName: 'Jeffrey Berg', ...over });

  check('receipt: only payments that still stand, oldest first, each "Camp fee"', () => {
    assert.deepEqual(receiptPayments(payments).map((p) => p.id), ['p2', 'p3']); // p1 + its reversal r1 left out
    const r = build();
    assert.deepEqual(r.lines, [
      { date: '2026-10-20', forText: 'Camp fee', how: 'cash', amountCents: 10000 },
      { date: '2026-10-29', forText: 'Camp fee', how: 'cash', amountCents: 8600 },
    ]);
    // same day: in the order recorded
    const sameDay = receiptPayments([
      { id: 'b', kind: 'payment', paidOn: '2026-10-20', recordedAt: '2026-10-20T12:00:00Z' },
      { id: 'a', kind: 'payment', paidOn: '2026-10-20', recordedAt: '2026-10-20T09:00:00Z' },
    ]);
    assert.deepEqual(sameDay.map((p) => p.id), ['a', 'b']);
    // Undo payment (a reversal with no replacement): nothing left
    assert.deepEqual(receiptPayments([payments[1], payments[2]]), []);
    assert.deepEqual(receiptPayments(undefined), []);
  });

  check('receipt: the words, facts, totals and footer (v0.734)', () => {
    const r = build();
    assert.equal(r.kindLine, 'Camp · payment receipt');
    assert.deepEqual(r.facts, [
      ['Camper', 'Jack Rivera'],
      ['Camp', 'Thanksgiving Camp · Wed, Nov 25 & Fri, Nov 27, 2026'],
      ['School', 'Worcester'],
      ['Days', 'All days · 2 days'],
      ['Extras', 'Late pick-up on Wed; T-shirt'],
      ['Reference', 'CP-4821'],
    ]);
    assert.equal(r.totalDueCents, 18600);
    assert.equal(r.paidCents, 18600);
    assert.equal(r.balanceNote, null);
    assert.deepEqual(r.schools, [
      { name: 'Worcester', street: '1141 Main St', phone: '(508) 767-1717' },
      { name: 'Shrewsbury', street: '', phone: '' },
    ]);
    assert.equal(r.printedOn, '2026-10-29');
    assert.equal(r.printedByName, 'Jeffrey Berg');
    // A both-schools camp: the camper's own school (the link the family used, 0050 / v0.757; the camp's own school when
    // the row has none). An extra offered only on some days: Camper detail's words.
    const both = build({ camp: { ...camp, bothSchools: true }, campExtras: [{ name: 'Late pick-up', onlyOn: ['2026-11-25'] }] });
    assert.deepEqual(both.facts[2], ['School', 'Worcester']);
    assert.deepEqual(build({ camp: { ...camp, bothSchools: true }, camperSchool: 'shrewsbury' }).facts[2], ['School', 'Shrewsbury']);
    assert.deepEqual(build({ camp: { ...camp, bothSchools: false }, camperSchool: 'shrewsbury' }).facts[2], ['School', 'Worcester']); // one school: the camp's own
    assert.deepEqual(both.facts[4], ['Extras', 'Late pick-up — Wed; T-shirt']);
    // Some days only, no extras: the Days line names them and there is no Extras line.
    const some = build({ detail: { ...detail, camper: { ...camper, days: [camper.days[0]] }, breakdown: { extras: [] } } });
    assert.deepEqual(some.facts.map(([label]) => label), ['Camper', 'Camp', 'School', 'Days', 'Reference']);
    assert.equal(some.facts[3][1], 'Wed, Nov 25 · 1 day');
    // The schools couldn't load: no footer lines.
    assert.deepEqual(build({ schools: [] }).schools, []);
  });

  check('receipt: never a private field (age, parent, phones, notes, signature, links)', () => {
    const text = JSON.stringify(build({ campExtras: [{ name: 'Late pick-up', onlyOn: [] }] }));
    for (const secret of ['Ana', 'Luis', '5085551234', '508555', 'Mother', 'Uncle', 'member', 'Age', 'signed', 'waiver', 'http', '@', 'Rivera ·']) {
      assert.equal(text.includes(secret), false, `receipt holds "${secret}"`);
    }
    const keys = Object.keys(build()).sort();
    assert.deepEqual(keys, ['balanceNote', 'facts', 'kindLine', 'lines', 'paidCents', 'printedByName', 'printedOn', 'schools', 'totalDueCents']);
    assert.deepEqual(Object.keys(build().lines[0]).sort(), ['amountCents', 'date', 'forText', 'how']);
  });

  check('receipt: no name when get_my_profile failed or gave none', () => {
    assert.equal(build({ printedByName: null }).printedByName, null);
    assert.equal(build({ printedByName: '   ' }).printedByName, null);
    assert.equal(build({ printedByName: undefined }).printedByName, null);
    assert.equal(build({ printedByName: '  Dana Ross ' }).printedByName, 'Dana Ross');
  });

  check('receipt: when Print receipt shows (money that still stands, not hidden; removed campers too — M-03, v1.055 (b))', () => {
    assert.equal(canPrintReceipt({ status: 'active', paidCents: 100 }, false), true);
    assert.equal(canPrintReceipt({ status: 'active', paidCents: 0 }, false), false); // nothing paid / undone
    assert.equal(canPrintReceipt({ status: 'active' }, false), false);
    // A removed camper (withdrawn, or a duplicate copy) whose money still stands gets one; nothing paid, none.
    assert.equal(canPrintReceipt({ status: 'withdrawn', paidCents: 100 }, false), true);
    assert.equal(canPrintReceipt({ status: 'withdrawn', withdrawnReason: 'duplicate_copy', paidCents: 100 }, false), true);
    assert.equal(canPrintReceipt({ status: 'withdrawn', paidCents: 0 }, false), false);
    assert.equal(canPrintReceipt({ status: 'withdrawn', paidCents: 100 }, true), false); // Hide private details
    assert.equal(canPrintReceipt({ status: 'active', paidCents: 100 }, true), false); // Hide private details
    assert.equal(canPrintReceipt(null, false), false);
    assert.equal(CampText.PRINT_RECEIPT, 'Print receipt');
    assert.equal(CampText.receiptSub('Jack Rivera', 'Thanksgiving Camp'), 'Jack Rivera · Thanksgiving Camp');
    assert.equal(CampText.receiptNotFound(CampText.THIS_CAMPER), 'This camper was deleted on another device, so there is no receipt.');
  });

  check('receipt: a removed camper owes nothing more (v0.748, copied from Color Belt\'s v0.429)', () => {
    const gone = (over) => ({ ...detail, camper: { ...camper, status: 'withdrawn', withdrawnAt: '2026-11-07T15:00:00Z', ...over } });
    // Paid part of the price, then removed: Total due is what was paid, so the Balance is $0.
    let r = build({ detail: gone({ totalCents: 31500, paidCents: 10000 }) });
    assert.equal(r.totalDueCents, 10000);
    assert.equal(r.paidCents, 10000);
    // Paid the whole price: unchanged. Paid more than the price: Total due stays the price (the overpayment shows).
    assert.equal(build({ detail: gone({ totalCents: 31500, paidCents: 31500 }) }).totalDueCents, 31500);
    assert.equal(build({ detail: gone({ totalCents: 31500, paidCents: 40000 }) }).totalDueCents, 31500);
    // A refund that stands and nothing else paid: nothing owed, never a negative total.
    assert.equal(build({ detail: gone({ totalCents: 31500, paidCents: 0 }) }).totalDueCents, 0);
    // The Camp line names the removal (no staff name on a family's document).
    assert.ok(r.facts.find(([label]) => label === CampText.RECEIPT_CAMP)[1].endsWith(' · removed Nov 7')); // (non-breaking spaces: it never wraps in the middle)
    // The payments themselves stay as recorded.
    assert.deepEqual(r.lines, build().lines);
    // An active camper prints as before: the price is the total, no removal words.
    const active = build({ detail: { ...detail, camper: { ...camper, totalCents: 31500, paidCents: 10000 } } });
    assert.equal(active.totalDueCents, 31500);
    assert.ok(!active.facts.find(([label]) => label === CampText.RECEIPT_CAMP)[1].includes('removed'));
  });

  check('receipt: Edit payment keeps the replacement, drops the old payment and its reversal', () => {
    // Mark paid, then Edit payment (as the preview database and migration 0013 record it).
    const rows = [
      { id: 'x1', kind: 'payment', amountCents: 5000, paidOn: '2026-10-01', recordedAt: '2026-10-01T10:00:00Z' },
      { id: 'x2', kind: 'reversal', amountCents: -5000, paidOn: '2026-10-02', recordedAt: '2026-10-02T10:00:00Z', reversesPaymentId: 'x1' },
      { id: 'x3', kind: 'payment', amountCents: 4000, paidOn: '2026-10-01', recordedAt: '2026-10-02T10:00:00Z' },
    ];
    assert.deepEqual(receiptPayments(rows).map((p) => p.id), ['x3']);
  });
}

// ======================= migration 0033: the Mark paid box's hint and the History (C2 / C7) =======================
check('Mark paid box hint (v0.735 option B): "on the form" until Paying by is changed at the desk', () => {
  assert.equal(payingByChoiceWhere({ payingBy: 'cash', payingByOnForm: 'cash' }), 'form');
  assert.equal(payingByChoiceWhere({ payingBy: 'card', payingByOnForm: 'cash' }), 'desk');
  assert.equal(payingByChoiceWhere({ payingBy: 'cash' }), 'form'); // a database from before 0033
});

check('History words (v0.736): one entry per save, parts joined with "; ", family part, hidden money', () => {
  const W = '00000000-0000-4000-8000-0000000000a1'; // Wed
  const F = '00000000-0000-4000-8000-0000000000a2'; // Fri
  const DROP_X = '00000000-0000-4000-8000-0000000000b1';
  const PIZZA_X = '00000000-0000-4000-8000-0000000000b2';
  const campDays = [{ dayId: W, day: '2026-11-25' }, { dayId: F, day: '2026-11-27' }];
  const campExtras = [{ extraId: DROP_X, name: 'Early drop-off' }, { extraId: PIZZA_X, name: 'Pizza party' }];
  const row = (batchId, at, who, tableName, op, before, after) => ({ batchId, occurredAt: at, actorName: who, tableName, op, before, after });
  const say = (batch, opts = {}) => describeCamperBatch(batch, { campDays, campExtras, familySize: 1, ...opts });
  // Newest first, as the reader sends them.
  const rows = [
    row('b6', '2026-10-14T15:00:00Z', 'Jeffrey Berg', 'camp_signups', 'update', { parentPhone: '5085550141' }, { parentPhone: '5085550109' }),
    row('b5', '2026-10-13T21:00:00Z', 'Staff', 'camp_payments', 'insert', null, { kind: 'reversal', amountCents: -18600, method: 'card' }),
    row('b5', '2026-10-13T21:00:00Z', 'Staff', 'camp_campers', 'update', { payingBy: 'card' }, { payingBy: 'cash' }),
    row('b4', '2026-10-13T20:55:00Z', 'Staff', 'camp_payments', 'insert', null, { kind: 'payment', amountCents: 18600, method: 'card' }),
    row('b4', '2026-10-13T20:55:00Z', 'Staff', 'camp_campers', 'update', { payingBy: 'cash', version: 2 }, { payingBy: 'card', version: 3 }),
    row('b3', '2026-10-12T14:00:00Z', 'Dana Ross', 'camp_campers', 'update', { age: 10, member: false, version: 1 }, { age: 11, member: true, version: 2 }),
    row('b2', '2026-10-11T14:20:00Z', 'Dana Ross', 'camp_camper_days', 'insert', null, { dayId: F, camperId: 'c' }),
    row('b2', '2026-10-11T14:20:00Z', 'Dana Ross', 'camp_camper_extras', 'insert', null, { extraId: DROP_X, dayId: F }),
    row('b2', '2026-10-11T14:20:00Z', 'Dana Ross', 'camp_camper_extras', 'insert', null, { extraId: PIZZA_X, dayId: F }),
    row('b1', '2026-10-09T16:00:00Z', 'Family form', 'camp_signups', 'insert', null, { reference: 'CP-4409' }),
    row('b1', '2026-10-09T16:00:00Z', 'Family form', 'camp_campers', 'insert', null, { firstName: 'Jack', duplicateState: 'none' }),
    row('b1', '2026-10-09T16:00:00Z', 'Family form', 'camp_camper_days', 'insert', null, { dayId: W }),
    row('b1', '2026-10-09T16:00:00Z', 'Family form', 'camp_camper_extras', 'insert', null, { extraId: DROP_X, dayId: W }),
  ];
  const batches = groupCamperHistory(rows, { dayIds: [W, F], extras: [{ extraId: DROP_X, dayId: W }, { extraId: DROP_X, dayId: F }, { extraId: PIZZA_X, dayId: F }] });
  assert.deepEqual(batches.map((b) => b.key), ['b6', 'b5', 'b4', 'b3', 'b2', 'b1']);
  const texts = batches.map((b) => say(b)?.text);
  assert.deepEqual(texts, [
    'Parent phone: (508) 555-0141 → (508) 555-0109',
    'Payment undone: $186; Paying by: Card → Cash',
    'Payment recorded: $186 card; Paying by: Cash → Card',
    'Age: 10 → 11; Member: No → Yes',
    // Drop-off on Fri only followed the new day (nothing of its own); pizza is new.
    'Days: Wed, Nov 25 → Wed, Nov 25 · Fri, Nov 27; Pizza party added',
    'Signed up on the family form · CP-4409',
  ]);
  assert.deepEqual(say(batches[5]), { text: 'Signed up on the family form · CP-4409', at: '2026-10-09T16:00:00Z', who: 'Family form' });
  assert.equal(say(batches[0], { familySize: 2 }).text, 'Parent phone: (508) 555-0141 → (508) 555-0109 (whole family)');
  // Hidden: money saves are left out (counted by the shared line), the rest stays.
  assert.deepEqual(say(batches[1], { hidden: true }), { hiddenPayment: true });
  assert.deepEqual(say(batches[2], { hidden: true }), { hiddenPayment: true });
  assert.equal(say(batches[3], { hidden: true }).text, 'Age: 10 → 11; Member: No → Yes');
  // A save with money and something else, hidden: only the something else.
  const mixed = { key: 'm', occurredAt: '2026-10-15T10:00:00Z', actorName: '', rows: [
    row('m', '2026-10-15T10:00:00Z', '', 'camp_campers', 'update', { payingBy: 'cash', firstName: 'Jak' }, { payingBy: 'check', firstName: 'Jack' }),
  ] };
  assert.equal(say(mixed).text, 'Paying by: Cash → Check; First name: Jak → Jack');
  assert.deepEqual(say(mixed, { hidden: true }), { text: 'First name: Jak → Jack', at: '2026-10-15T10:00:00Z', who: 'Staff' }); // no name → "Staff"
  // Edit payment = an undo and a new payment in one save.
  const one = (rowsOfBatch) => say(groupCamperHistory(rowsOfBatch)[0]);
  assert.equal(one([
    row('e', 't', 'Jeffrey Berg', 'camp_payments', 'insert', null, { kind: 'reversal', amountCents: -18600, method: 'check' }),
    row('e', 't', 'Jeffrey Berg', 'camp_payments', 'insert', null, { kind: 'payment', amountCents: 10000, method: 'cash' }),
  ]).text, 'Payment changed: $186 check → $100 cash');
  // Withdrawn / Restored / duplicates.
  const camper = (before, after) => one([row('x', 't', 'Staff', 'camp_campers', 'update', before, after)]).text;
  assert.equal(camper({ status: 'active', withdrawnReason: null }, { status: 'withdrawn', withdrawnReason: 'withdrawn' }), 'Withdrawn');
  assert.equal(camper({ status: 'withdrawn', withdrawnReason: 'withdrawn' }, { status: 'active', withdrawnReason: null }), 'Restored');
  assert.equal(camper({ status: 'active', withdrawnReason: null, duplicateState: 'possible' }, { status: 'withdrawn', withdrawnReason: 'duplicate_copy', duplicateState: 'none' }), 'Removed as a duplicate copy');
  assert.equal(camper({ duplicateState: 'none' }, { duplicateState: 'possible' }), 'Possible duplicate found');
  assert.equal(camper({ duplicateState: 'possible' }, { duplicateState: 'kept_both' }), 'Kept both');
  assert.equal(one([row('x', 't', 'Staff', 'camp_campers', 'update', { duplicateState: 'possible' }, { duplicateState: 'none' })]), null); // nothing to say
  assert.equal(one([row('x', 't', 'Staff', 'camp_campers', 'update', { version: 1 }, { version: 2 })]), null); // only the version
  assert.equal(camper({ firstName: 'Liam', lastName: 'Ortis' }, { firstName: 'Liam J', lastName: 'Ortiz' }), 'First name: Liam → Liam J; Last name: Ortis → Ortiz');
  // A sign-up that was a possible duplicate from the start.
  assert.equal(one([
    row('s', 't', 'Family form', 'camp_campers', 'insert', null, { duplicateState: 'possible' }),
    row('s', 't', 'Family form', 'camp_signups', 'insert', null, { reference: 'CP-4822' }),
  ]).text, 'Signed up on the family form · CP-4822; Possible duplicate found');
  // The family part.
  const family = (before, after, familySize = 1) => describeCamperBatch(groupCamperHistory([row('f', 't', 'Jeffrey Berg', 'camp_signups', 'update', before, after)])[0], { campDays, campExtras, familySize })?.text;
  assert.equal(family({ parentName: 'Lisa Rivera', parentRelation: 'Mother' }, { parentName: 'Ana Rivera', parentRelation: 'Aunt' }), 'Parent: Lisa Rivera → Ana Rivera; Parent relationship: Mother → Aunt');
  assert.equal(family({ emergencyName: 'Mike', emergencyPhone: '5085550209', emergencyRelation: 'Uncle' }, { emergencyName: 'Tom', emergencyPhone: '5085550210', emergencyRelation: 'Father' }, 3),
    'Emergency contact: Mike → Tom; Emergency contact relationship: Uncle → Father; Emergency contact phone: (508) 555-0209 → (508) 555-0210 (whole family)');
  assert.equal(family({ signature: 'on file', signatureDeletedAt: null }, { signature: null, signatureDeletedAt: '2029-12-01T05:00:00Z' }, 2), 'Signature deleted (3 years after the camp) (whole family)');
  // A save that changed the camper and the family: the family part last, "(whole family)" once.
  assert.equal(describeCamperBatch(groupCamperHistory([
    row('g', 't', 'Jeffrey Berg', 'camp_signups', 'update', { parentPhone: '5085550141' }, { parentPhone: '5085550109' }),
    row('g', 't', 'Jeffrey Berg', 'camp_campers', 'update', { age: 10 }, { age: 11 }),
  ])[0], { campDays, campExtras, familySize: 2 }).text, 'Age: 10 → 11; Parent phone: (508) 555-0141 → (508) 555-0109 (whole family)');
  // Extras: removed; a per-day extra's own days changed (not following the camper's days).
  assert.equal(say(groupCamperHistory([row('r', 't', 'Staff', 'camp_camper_extras', 'delete', { extraId: PIZZA_X, dayId: F }, null)],
    { dayIds: [W, F], extras: [] })[0]).text, 'Pizza party removed');
  assert.equal(say(groupCamperHistory([row('r', 't', 'Staff', 'camp_camper_extras', 'insert', null, { extraId: DROP_X, dayId: F })],
    { dayIds: [W, F], extras: [{ extraId: DROP_X, dayId: W }, { extraId: DROP_X, dayId: F }] })[0]).text, 'Early drop-off: Wed, Nov 25 → Wed, Nov 25 · Fri, Nov 27');
  // A day taken off (its per-day extra follows it: one part).
  assert.equal(say(groupCamperHistory([
    row('d', 't', 'Staff', 'camp_camper_days', 'delete', { dayId: F }, null),
    row('d', 't', 'Staff', 'camp_camper_extras', 'delete', { extraId: DROP_X, dayId: F }, null),
  ], { dayIds: [W], extras: [{ extraId: DROP_X, dayId: W }] })[0]).text, 'Days: Wed, Nov 25 · Fri, Nov 27 → Wed, Nov 25');
  // A row without a batch id is a save of its own.
  assert.equal(groupCamperHistory([row(null, 't', 'x', 'camp_campers', 'update', { age: 1 }, { age: 2 }), row(null, 't', 'x', 'camp_campers', 'update', { age: 2 }, { age: 3 })]).length, 2);
  assert.deepEqual(groupCamperHistory(null), []);
  // An extra the camp no longer has.
  assert.equal(say(groupCamperHistory([row('z', 't', 'Staff', 'camp_camper_extras', 'delete', { extraId: 'gone', dayId: null }, null)], { dayIds: [W], extras: [] })[0]).text, 'Extra (no longer offered) removed');
});

check('mock (0033): Mark paid with a way, Paying by follows, Undo puts it back, the history reader', () => {
  const { backend: b, env, store } = makeBackend({ today: '2026-10-19', clock: Date.parse('2026-10-19T14:00:00Z') });
  const camp = rows(b, 'camps', 'id, name').find((c) => c.name === 'Thanksgiving Camp');
  const campDays = toCamel(rows(b, 'camp_days', 'id, day', [{ col: 'camp_id', value: camp.id }])).map((d) => ({ dayId: d.id, day: d.day }));
  const campExtras = toCamel(rows(b, 'camp_extras', 'id, name, sort', [{ col: 'camp_id', value: camp.id }])).map((e) => ({ extraId: e.id, name: e.name, sort: e.sort }));
  const COLS = `${ROSTER}, position, age, paying_by, paying_by_on_form`;
  const roster = () => toCamel(rows(b, 'camp_roster', COLS, [{ col: 'camp_id', value: camp.id }]));
  const find = (first, last) => roster().find((r) => r.firstName === first && r.lastName === last);
  const history = (r, ctx = STAFF) => {
    const answer = toCamel(rpcOk(b, 'camp_camper_history', { p_camper_id: r.id }, ctx));
    assert.equal(answer.status, 'ok');
    return answer.rows;
  };
  const words = (r, opts = {}) => {
    const familySize = roster().filter((x) => x.signupId === r.signupId).length;
    return groupCamperHistory(history(r), { dayIds: r.days.map((d) => d.dayId), extras: r.extras.map((e) => ({ extraId: e.extraId, dayId: e.dayId })) })
      .map((batch) => describeCamperBatch(batch, { campDays, campExtras, familySize, ...opts }))
      .filter(Boolean)
      .map((w) => (w.hiddenPayment ? 'hidden' : `${w.text} | ${w.who}`));
  };

  // Picture 17's sample, Jack Rivera (his sister Sofia is on the same form).
  const jack = find('Jack', 'Rivera');
  assert.equal(jack.payingByOnForm, 'cash');
  assert.equal(jack.payingBy, 'check');
  assert.equal(payingByChoiceWhere(jack), 'desk');
  assert.deepEqual(words(jack), [
    'Payment recorded: $186 check, paid Oct 13 | Jeffrey Berg',
    'Paying by: Cash → Check | Jeffrey Berg',
    'Parent phone: (508) 555-0141 → (508) 555-0109 (whole family) | Jeffrey Berg',
    'Days: Wed, Nov 25 → Wed, Nov 25 · Fri, Nov 27 | Dana Ross',
    'Signed up on the family form · CP-4409 | Family form',
  ]);
  assert.deepEqual(words(jack, { hidden: true }), ['hidden', 'hidden',
    'Parent phone: (508) 555-0141 → (508) 555-0109 (whole family) | Jeffrey Berg',
    'Days: Wed, Nov 25 → Wed, Nov 25 · Fri, Nov 27 | Dana Ross',
    'Signed up on the family form · CP-4409 | Family form']);
  const sofia = find('Sofia', 'Rivera');
  assert.equal(sofia.signupId, jack.signupId);
  assert.equal(sofia.position, 2);
  assert.deepEqual(words(sofia), [
    'Parent phone: (508) 555-0141 → (508) 555-0109 (whole family) | Jeffrey Berg',
    'Signed up on the family form · CP-4409 | Family form',
  ]);
  // Owen: changes, withdrawn and restored, Mark paid by card and its Undo.
  const owenTotal = find('Owen', 'Reed').totalCents;
  assert.deepEqual(words(find('Owen', 'Reed')), [
    `${CampText.historyPaymentUndone(owenTotal)}; Paying by: Card → Cash | Jeffrey Berg`,
    `${CampText.historyMarkedPaid(owenTotal, 'card', '2026-10-10')}; Paying by: Cash → Card | Staff`,
    'Restored | Jeffrey Berg',
    'Withdrawn | Jeffrey Berg',
    'Age: 9 → 10; Member: Yes → No | Dana Ross',
    'Signed up on the family form · CP-4405 | Family form',
  ]);
  // Lily: an admin changed her cash payment to check; Paying by followed.
  const lily = find('Lily', 'Brooks');
  assert.equal(words(lily)[0], `${CampText.historyPaymentChanged(lily.totalCents, 'cash', lily.totalCents, 'check')}; Paying by: Cash → Check | Jeffrey Berg`);
  assert.equal(CampText.historyPaymentChanged(18600, 'check', 10000, 'cash'), 'Payment changed: $186 check → $100 cash');
  assert.equal(payingByChoiceWhere(lily), 'desk');
  // No login ids anywhere in the answer (paying_by stays: it is the way to pay).
  const raw = JSON.stringify(rpcOk(b, 'camp_camper_history', { p_camper_id: jack.id }, STAFF));
  for (const key of ['"created_by"', '"updated_by"', '"recorded_by"', '"withdrawn_by"', '"checked_in_by"', '"actor_id"', '"session_id"', '"submission_id"', 'data:image']) assert.equal(raw.includes(key), false, key);
  assert.equal(raw.includes('"paying_by"'), true);
  assert.equal(raw.includes('"on file"'), true); // the signature only ever "on file"
  // Refusals: locked, unknown camper; staff and admins may read.
  assert.equal(rpcOk(b, 'camp_camper_history', { p_camper_id: jack.id }, LOCKED).status, 'no_access');
  assert.equal(rpcOk(b, 'camp_camper_history', { p_camper_id: randomUUID() }, STAFF).status, 'not_found');
  assert.equal(rpcOk(b, 'camp_camper_history', { p_camper_id: jack.id }, ADMIN).status, 'ok');
  assert.equal(CAMP_RPC_NAMES.includes('camp_camper_history'), true);

  // Mia (picture 16): chose Cash on the form; Mark paid by card.
  let mia = find('Mia', 'Rossi');
  assert.equal(payingByChoiceWhere(mia), 'form');
  assert.deepEqual(rpcOk(b, 'camp_mark_paid', { p_camper_id: mia.id, p_expected_version: mia.version, p_school: 'worcester', p_method: 'bitcoin' }, STAFF), { status: 'invalid', field: 'method' });
  env.clock += 1000;
  const paid = rpcOk(b, 'camp_mark_paid', { p_camper_id: mia.id, p_expected_version: mia.version, p_school: 'worcester', p_method: 'card' }, STAFF);
  assert.equal(paid.status, 'ok');
  assert.equal(paid.method, 'card');
  assert.equal(paid.paying_by, 'card');
  mia = find('Mia', 'Rossi');
  assert.equal(mia.payingBy, 'card');
  assert.equal(mia.payingByOnForm, 'cash'); // never changes
  assert.equal(payingByChoiceWhere(mia), 'desk');
  assert.equal(mia.version, paid.version);
  assert.equal(words(mia)[0], `${CampText.historyMarkedPaid(paid.amount_cents, 'card', '2026-10-19')}; Paying by: Cash → Card | Staff`);
  // The toast's Undo (staff, within 10 seconds) puts Paying by back.
  env.clock += 2000;
  assert.equal(rpcOk(b, 'camp_undo_payment', { p_payment_id: paid.payment_id }, STAFF).status, 'ok');
  mia = find('Mia', 'Rossi');
  assert.equal(mia.payingBy, 'cash');
  assert.equal(payingByChoiceWhere(mia), 'form');
  assert.equal(words(mia)[0], `${CampText.historyPaymentUndone(paid.amount_cents)}; Paying by: Card → Cash | Staff`);
  // Paying by changed again after a card payment: Undo leaves it alone.
  env.clock += 2000;
  const paid2 = rpcOk(b, 'camp_mark_paid', { p_camper_id: mia.id, p_expected_version: mia.version, p_school: 'worcester', p_method: 'card' }, ADMIN);
  const v2 = paid2.version;
  // (Change how they'll pay is refused once paid, so the second change comes from an Edit payment.)
  env.clock += 2000;
  const edited = rpcOk(b, 'camp_edit_payment', { p_payment_id: paid2.payment_id, p_method: 'check', p_amount_cents: paid2.amount_cents, p_paid_on: '2026-10-19', p_school: 'worcester' }, ADMIN);
  assert.equal(edited.status, 'ok');
  assert.equal(edited.version, v2 + 1);
  mia = find('Mia', 'Rossi');
  assert.equal(mia.payingBy, 'check'); // follows the edit (Color Belt 0030 §4b)
  env.clock += 2000;
  assert.equal(rpcOk(b, 'camp_undo_payment', { p_payment_id: edited.payment_id }, ADMIN).status, 'ok');
  assert.equal(find('Mia', 'Rossi').payingBy, 'cash'); // the family's choice comes back
  // The same way as Paying by, or none: Paying by doesn't move; the 3-input call still works.
  env.clock += 2000;
  mia = find('Mia', 'Rossi');
  const same = rpcOk(b, 'camp_mark_paid', { p_camper_id: mia.id, p_expected_version: mia.version, p_school: 'worcester' }, ADMIN);
  assert.equal(same.paying_by, 'cash');
  assert.equal(words(find('Mia', 'Rossi'))[0], `${CampText.historyMarkedPaid(same.amount_cents, 'cash', '2026-10-19')} | Jeffrey Berg`);
  assert.equal(b.select('camp_payments', 'paying_by_before', [], [], ADMIN).error.code, '42501'); // not granted

  // Check-ins never reach the history; a family sign-up does, by "Family form".
  env.today = '2026-11-25';
  const before = history(find('Ethan', 'Wu')).length;
  assert.equal(rpcOk(b, 'camp_check_in', { p_camper_id: find('Ethan', 'Wu').id, p_day_id: campDays[0].dayId }, STAFF).status, 'ok');
  assert.equal(history(find('Ethan', 'Wu')).length, before);
  // At most 500 rows, newest first.
  const saved = store();
  const ethan = find('Ethan', 'Wu');
  for (let i = 0; i < 600; i += 1) {
    saved.camp_change_log.push({ occurred_at: new Date(Date.parse('2026-11-01T00:00:00Z') + i * 1000).toISOString(), actor_id: null, actor_name: 'Staff',
      batch_id: randomUUID(), action: 'manual', table_name: 'camp_campers', record_id: ethan.id, op: 'update', before: { age: i }, after: { age: i + 1 } });
  }
  const many = history(ethan);
  assert.equal(many.length, 500);
  assert.equal(many[0].after.age, 600);
});

// ======================= The camp page's count cards (design review C10, rulebook v0.737) =======================

check('count cards: which day Coming means (before / on / between / after the camp)', () => {
  // A Mon, Wed, Fri camp (unsorted on purpose).
  const cardDays = [{ dayId: 'fri', day: '2027-04-23' }, { dayId: 'mon', day: '2027-04-19' }, { dayId: 'wed', day: '2027-04-21' }];
  assert.deepEqual(comingCardDay(cardDays, '2027-04-10'), { mode: 'next', day: { dayId: 'mon', day: '2027-04-19' } }); // before: the first day
  assert.deepEqual(comingCardDay(cardDays, '2027-04-21'), { mode: 'today', day: { dayId: 'wed', day: '2027-04-21' } }); // a camp day: today
  assert.deepEqual(comingCardDay(cardDays, '2027-04-22'), { mode: 'next', day: { dayId: 'fri', day: '2027-04-23' } }); // between: the next camp day
  assert.deepEqual(comingCardDay(cardDays, '2027-04-24'), { mode: 'after', day: null }); // after: the card becomes Came
  assert.deepEqual(comingCardDay([], '2027-04-24'), { mode: 'after', day: null }); // no days at all
  // The card's words.
  assert.equal(CampText.cardComingOn('2027-04-19'), 'Coming Mon, Apr 19');
  assert.equal(CampText.showingComingOn('2027-04-19'), 'Showing coming Mon, Apr 19 only');
  assert.equal(CampText.cardOfDays(1), 'of 1 day');
  assert.equal(CampText.cardOfDays(150), 'of 150 days');
  assert.equal(CampText.extraCount('Pizza party', 11), 'Pizza party: 11');
});

check('count cards: the numbers (Campers, Coming / here, Came, To collect, Payments recorded)', () => {
  const cardDays = [{ dayId: 'mon', day: '2027-04-19' }, { dayId: 'tue', day: '2027-04-20' }];
  const row = (id, status, dayList, paidCents, owesCents, extra = {}) => ({
    id, status, days: dayList, paidCents, owesCents, duplicateState: null, ...extra,
  });
  const roster = [
    row('a', 'active', [{ dayId: 'mon', checkedInAt: '2027-04-19T12:00:00Z' }, { dayId: 'tue', checkedInAt: null }], 20000, 0), // paid
    row('b', 'active', [{ dayId: 'mon', checkedInAt: null }], 5000, 1500), // owes $15
    row('c', 'active', [{ dayId: 'tue', checkedInAt: null }], 0, 21900), // $219 due
    row('d', 'active', [{ dayId: 'mon', checkedInAt: null }], 0, 10000, { duplicateState: 'possible' }), // a possible duplicate still owes
    row('e', 'active', [{ dayId: 'tue', checkedInAt: null }], 12000, -500), // paid too much: Paid, never lowers To collect
    row('f', 'active', [{ dayId: 'tue', checkedInAt: null }], 18600, 0, { duplicateState: 'possible' }), // a PAID possible duplicate: nothing to collect
    row('x', 'withdrawn', [{ dayId: 'mon', checkedInAt: null }], 7500, 0), // removed: not counted, but its money is
    row('y', 'withdrawn', [], 3000, 0), // removed, $40 paid and $10 reversed = $30 still recorded
  ];
  const before = campCardCounts(roster, cardDays, '2027-04-01');
  assert.equal(before.mode, 'next');
  assert.equal(before.campers, 6);
  assert.equal(before.coming, 3); // a, b, d on Monday
  // v0.742 (R3-02): b (owes), c (due) — not d (a possible duplicate that owes: left out until
  // reviewed) and not f (a paid possible duplicate: nothing to collect anyway).
  assert.equal(before.toCollect, 2);
  assert.equal(before.toCollectCents, 1500 + 21900);
  assert.equal(before.duplicatesNotCounted, 1); // only d: f would not have counted anyway
  assert.equal(before.recordedCents, 20000 + 5000 + 12000 + 18600 + 7500 + 3000); // every payment, removed campers' and duplicates' too
  assert.equal(before.removedPaidCents, 7500 + 3000); // R5-04: the part from removed campers (x, y)
  const monday = campCardCounts(roster, cardDays, '2027-04-19');
  assert.equal(monday.mode, 'today');
  assert.deepEqual([monday.coming, monday.here], [3, 1]);
  const after = campCardCounts(roster, cardDays, '2027-05-01');
  assert.equal(after.mode, 'after');
  assert.equal(after.coming, 0);
  assert.deepEqual([after.came, after.cameOf], [1, 7]); // active campers only: 1 check-in of 7 signed-up days
  // Nobody owes: To collect 0 (the card then says "All paid").
  const allPaid = campCardCounts(roster.filter((r) => ['a', 'e', 'x'].includes(r.id)), cardDays, '2027-04-01');
  assert.deepEqual([allPaid.toCollect, allPaid.toCollectCents], [0, 0]);
  assert.equal(CampText.ALL_PAID, 'All paid');
  // Nobody at all.
  const none = campCardCounts([], cardDays, '2027-04-01');
  assert.deepEqual([none.campers, none.coming, none.toCollect, none.recordedCents, none.removedPaidCents, none.duplicatesNotCounted], [0, 0, 0, 0, 0, 0]);
  // The filters: Coming keeps that day's campers (a possible duplicate too), To collect exactly the
  // rows its card counts (no possible duplicate), null everyone.
  const monDay = cardDays[0];
  assert.deepEqual(roster.filter((r) => r.status === 'active' && matchesCardFilter(r, 'coming', monDay)).map((r) => r.id), ['a', 'b', 'd']);
  const collectList = roster.filter((r) => r.status === 'active' && matchesCardFilter(r, 'collect', monDay));
  assert.deepEqual(collectList.map((r) => r.id), ['b', 'c']);
  assert.equal(collectList.length, before.toCollect);
  assert.equal(collectList.reduce((n, r) => n + r.owesCents, 0), before.toCollectCents);
  assert.equal(roster.every((r) => matchesCardFilter(r, null, monDay)), true);
  assert.equal(comesOnDay(roster[2], 'mon'), false);
  assert.equal(comesOnDay(roster[2], 'tue'), true);
});

check('count cards v0.742: a possible duplicate leaves To collect; removed campers\' money is named', () => {
  const cardDays = [{ dayId: 'mon', day: '2027-04-19' }];
  const row = (id, status, paidCents, owesCents, duplicateState = null) => ({
    id, status, days: [{ dayId: 'mon', checkedInAt: null }], paidCents, owesCents, duplicateState,
  });
  // Ava Thompson's pair: the kept row paid, the second sign-up ($315) is marked Possible duplicate.
  const pair = [row('ava1', 'active', 31500, 0), row('ava2', 'active', 0, 31500, 'possible'), row('ben', 'active', 0, 24500)];
  const flagged = campCardCounts(pair, cardDays, '2027-04-01');
  assert.deepEqual([flagged.campers, flagged.coming], [3, 3]); // people counts don't change
  assert.deepEqual([flagged.toCollect, flagged.toCollectCents, flagged.duplicatesNotCounted], [1, 24500, 1]);
  assert.equal(flagged.recordedCents, 31500);
  assert.equal(flagged.removedPaidCents, 0); // nobody removed: no note on Payments recorded
  // Reviewed → Keep both: the row is whole again (To collect counts it, the duplicate line goes).
  const kept = campCardCounts(pair.map((r) => (r.id === 'ava2' ? { ...r, duplicateState: 'kept_both' } : r)), cardDays, '2027-04-01');
  assert.deepEqual([kept.toCollect, kept.toCollectCents, kept.duplicatesNotCounted], [2, 56000, 0]);
  // A paid camper is withdrawn: Payments recorded keeps the money, and says how much came from removed campers.
  const withdrawn = campCardCounts([...pair, row('sofia', 'withdrawn', 14000, 0)], cardDays, '2027-04-01');
  assert.deepEqual([withdrawn.campers, withdrawn.recordedCents, withdrawn.removedPaidCents], [3, 45500, 14000]);
  // The words (curly quotes as the rest of the app).
  assert.equal(CampText.duplicatesNotCounted(1), '1 possible duplicate not counted');
  assert.equal(CampText.duplicatesNotCounted(2), '2 possible duplicates not counted');
  assert.equal(CampText.includesFromRemoved(14000), 'includes $140 from removed campers');
  assert.equal(CampText.noCampersMatch('zz'), 'No campers match “zz”.');
  assert.equal(CampText.CLEAR_SEARCH, 'Clear search');
});

// ======================= Early drop-off / Late pick-up on the roster (picture 19, option A) =======================

// The April camp's extras with the names the preview camp really uses (the part after the comma is
// a time), listed out of order on purpose (sort decides the order).
const ROSTER_EXTRAS = [
  { extraId: PICK, name: 'Late pick-up, 3:00–4:00 PM', per: 'day', notForAllDays: false, onlyOn: [], sort: 1 },
  { extraId: PIZZA, name: 'Pizza party', per: 'day', notForAllDays: true, onlyOn: ['2027-04-21', '2027-04-23'], sort: 2 },
  { extraId: DROP, name: 'Early drop-off, 7:30–9:00 AM', per: 'day', notForAllDays: false, onlyOn: [], sort: 0 },
  { extraId: 'lunch', name: 'Pizza lunch', per: 'once', notForAllDays: false, onlyOn: [], sort: 3 }, // once: never in a day box
];
const rosterRow = (id, dayIds, extras = [], o = {}) => ({
  id, status: 'active', duplicateState: 'none', paidCents: 0, owesCents: 0,
  days: dayIds.map((dayId) => ({ dayId, day: APRIL_DAYS.find((d) => d.dayId === dayId).day, checkedInAt: null })),
  extras: extras.map(([extraId, dayId]) => ({ extraId, name: ROSTER_EXTRAS.find((e) => e.extraId === extraId).name, per: 'day', dayId })), ...o,
});
const ids = (list) => list.map((e) => e.extraId);

check('roster extras: the words, the every-day list, the day boxes', () => {
  // Short name = before the comma; the day box's word = its first word, first letter uppercase.
  assert.equal(extraShortName('Early drop-off, 7:30–9:00 AM'), 'Early drop-off');
  assert.equal(extraShortName('Pizza party'), 'Pizza party');
  assert.equal(extraDayWord('Early drop-off, 7:30–9:00 AM'), 'Early');
  assert.equal(extraDayWord('Late pick-up, 3:00–4:00 PM'), 'Late');
  assert.equal(extraDayWord('late pick-up'), 'Late');
  assert.equal(extraDayWord('  Aftercare  , 3–5'), 'Aftercare');
  // Every-day extras: per day, no onlyOn, by sort (Early before Late); pizza (some days) and lunch (once) out.
  assert.deepEqual(ids(everyDayExtras(ROSTER_EXTRAS)), [DROP, PICK]);
  assert.deepEqual(everyDayExtras([]), []);
  assert.deepEqual(everyDayExtras(null), []);
  // Ava: both extras every day → Early, Late in every box, in that order.
  const ava = rosterRow('ava', DAY_IDS, DAY_IDS.flatMap((d) => [[PICK, d], [DROP, d]]));
  for (const d of DAY_IDS) assert.deepEqual(ids(dayExtrasFor(ava, d, ROSTER_EXTRAS, APRIL_DAYS)), [DROP, PICK]);
  // Ethan: Early only on the days he chose it (Mon, Thu, Fri); his chosen pizza on Fri never shows in a box.
  const ethan = rosterRow('ethan', [MON, THU, FRI], [[DROP, MON], [DROP, THU], [DROP, FRI], [PIZZA, FRI]]);
  assert.deepEqual(ids(dayExtrasFor(ethan, MON, ROSTER_EXTRAS, APRIL_DAYS)), [DROP]);
  assert.deepEqual(ids(dayExtrasFor(ethan, FRI, ROSTER_EXTRAS, APRIL_DAYS)), [DROP]); // pizza (some days) excluded
  // The "—" day (not signed up) gets nothing, even with a stray extra row for that day.
  assert.deepEqual(dayExtrasFor(ethan, TUE, ROSTER_EXTRAS, APRIL_DAYS), []);
  assert.deepEqual(dayExtrasFor(rosterRow('x', [MON], [[DROP, TUE]]), TUE, ROSTER_EXTRAS, APRIL_DAYS), []);
  // No extras at all → nothing.
  assert.deepEqual(dayExtrasFor(rosterRow('noah', [MON, TUE]), MON, ROSTER_EXTRAS, APRIL_DAYS), []);
  // getsExtraOnDay = what extraCountOnDay counts: a "not charged to all-days campers" every-day extra
  // is included for a child who comes the whole week, without choosing it.
  const included = { ...ROSTER_EXTRAS[2], notForAllDays: true };
  assert.equal(getsExtraOnDay(rosterRow('all', DAY_IDS), included, WED, APRIL_DAYS), true);
  assert.equal(getsExtraOnDay(rosterRow('three', [MON, TUE, WED]), included, WED, APRIL_DAYS), false);
  // The screen-reader labels end with the lower-cased short names; none → as before.
  assert.equal(CampText.checkInDayLabel('Ava Thompson', '2027-04-19', ['Early drop-off', 'Late pick-up']), 'Check in Ava Thompson, Mon, Apr 19, early drop-off, late pick-up');
  assert.equal(CampText.checkInDayLabel('Ava Thompson', '2027-04-19', []), 'Check in Ava Thompson, Mon, Apr 19');
  assert.equal(CampText.checkInDayLabel('Ava Thompson', '2027-04-19'), 'Check in Ava Thompson, Mon, Apr 19');
  assert.equal(CampText.missedDayLabel('Ethan Brooks', '2027-04-19', ['Early drop-off']), 'Ethan Brooks didn\'t come Mon, Apr 19, early drop-off. Check in');
  assert.match(CampText.undoCheckInDayLabel('Ava Thompson', '2027-04-19', '2027-04-19T12:42:00Z', ['Late pick-up']), /^Ava Thompson checked in Mon, Apr 19 at .+, late pick-up\. Undo check-in$/);
  // The legend's meaning after the blue word.
  assert.equal(CampText.legendExtraMeaning('Early drop-off'), ' early drop-off');
});

check('roster extras: the count line under the cards (before / on / between / after the camp)', () => {
  const rows = [
    rosterRow('ava', DAY_IDS, DAY_IDS.flatMap((d) => [[DROP, d], [PICK, d]])), // all days: pizza included too
    rosterRow('ethan', [MON, THU, FRI], [[DROP, MON], [DROP, THU], [DROP, FRI], [PIZZA, FRI]]),
    rosterRow('mia', [MON, WED], [[PICK, WED], [PIZZA, WED]]),
    rosterRow('leo', DAY_IDS, DAY_IDS.map((d) => [DROP, d]), { status: 'withdrawn' }), // removed: never counted
  ];
  const line = (today) => {
    const { mode, day } = comingCardDay(APRIL_DAYS, today);
    const parts = dayExtraCounts(rows, ROSTER_EXTRAS, APRIL_DAYS, mode, day);
    return parts ? CampText.dayExtrasLine(parts) : null;
  };
  // Before the camp: Monday's every-day extras only (no pizza, even though it's not offered Mon anyway).
  assert.equal(line('2027-04-10'), 'Mon, Apr 19 · Early drop-off: 2 · Late pick-up: 1');
  // On Wednesday (a pizza day): Today, both every-day extras (Early 0 is listed), then the pizza.
  assert.equal(line('2027-04-21'), 'Today · Early drop-off: 1 · Late pick-up: 2 · Pizza party: 2');
  // On Tuesday: no pizza that day → only the every-day extras.
  assert.equal(line('2027-04-20'), 'Today · Early drop-off: 1 · Late pick-up: 1');
  // A Mon / Wed camp, on the Tuesday between: the next camp day, never the some-days extras.
  const monWed = [APRIL_DAYS[0], APRIL_DAYS[2]];
  const between = comingCardDay(monWed, '2027-04-20');
  assert.equal(between.mode, 'next');
  assert.equal(CampText.dayExtrasLine(dayExtraCounts(rows, ROSTER_EXTRAS, monWed, between.mode, between.day)), 'Wed, Apr 21 · Early drop-off: 1 · Late pick-up: 2');
  // Zero counts are still listed.
  const zero = dayExtraCounts([], ROSTER_EXTRAS, APRIL_DAYS, 'next', APRIL_DAYS[0]);
  assert.deepEqual(zero.counts, [{ name: 'Early drop-off', count: 0 }, { name: 'Late pick-up', count: 0 }]);
  // After the camp: no line.
  assert.equal(line('2027-05-01'), null);
  assert.equal(dayExtraCounts(rows, ROSTER_EXTRAS, APRIL_DAYS, 'after', null), null);
  // Nothing to count: no line (no extras; only a once extra; a pizza on a day it isn't offered).
  assert.equal(dayExtraCounts(rows, [], APRIL_DAYS, 'today', APRIL_DAYS[0]), null);
  assert.equal(dayExtraCounts(rows, [ROSTER_EXTRAS[3]], APRIL_DAYS, 'today', APRIL_DAYS[0]), null);
  assert.equal(dayExtraCounts(rows, [ROSTER_EXTRAS[1]], APRIL_DAYS, 'today', APRIL_DAYS[0]), null);
  // A camp with only a pizza party: on a pizza day the line is "Today · Pizza party: 2" (as the old line, new words).
  assert.equal(CampText.dayExtrasLine(dayExtraCounts(rows, [ROSTER_EXTRAS[1]], APRIL_DAYS, 'today', APRIL_DAYS[2])), 'Today · Pizza party: 2');
});

// ======================= A Blank camp starts with Early drop-off and Late pick-up (v0.739) =======================
check('Add camp: Blank camp starts with Early drop-off and Late pick-up, prices empty', () => {
  const form = { blankValues, applyBlank, checkForm, valuesFromCamp, valuesFromTemplate };
  const blank = form.blankValues('2026-11-05', 'worcester');
  assert.deepEqual(blank.extras.map((e) => [e.name, e.price, e.per, e.notForAllDays, e.onlyOn.length, e.id]),
    [['Early drop-off', '', 'day', false, 0, null], ['Late pick-up', '', 'day', false, 0, null]]);
  // Fresh rows each time (React keys never shared between two dialogs).
  const again = form.blankValues('2026-11-05', 'worcester');
  assert.notEqual(again.extras[0].key, blank.extras[0].key);
  // The empty prices: section 4 says "2 extras have no price" and nothing can be saved yet.
  const checked = form.checkForm(blank, { mode: 'add', today: '2026-11-05', initialDays: [], server: {} });
  assert.equal(checked.sections[4].problem, true);
  assert.equal(checked.sections[4].summary, CampText.extrasNoPrice(2));
  assert.equal(checked.payload, null);
  // Switching back to Blank camp from a template brings the two lines back.
  const back = form.applyBlank({ ...blank, extras: [], name: 'Winter Camp' }, '2026-11-05');
  assert.deepEqual(back.extras.map((e) => e.name), ['Early drop-off', 'Late pick-up']);
  assert.equal(back.name, 'Winter Camp');
  // Edit camp / Edit template keep exactly the saved extras (none → none).
  assert.deepEqual(form.valuesFromCamp({ name: 'X', locationCode: 'worcester', startTime: '09:00:00', endTime: '15:00:00', minAge: 5, maxAge: 12 }, [{ day: '2026-11-25' }], [], []).extras, []);
  assert.deepEqual(form.valuesFromTemplate({ name: 'T', locationCode: 'worcester', dayCount: 1, startTime: '09:00:00', endTime: '15:00:00', opensDaysBefore: 30, closesDaysBefore: 1, earlyDaysBefore: 7, minAge: 5, maxAge: 12, extras: [] }).extras, []);
});

// ======================= Fill in: a desk sign-up (migration 0043, CONTRACT-0043, rulebook v0.740 / v0.741) =======================
check('Fill in: camp_staff_form and camp_staff_signup (open / admin_only / finished, desk marks, duplicates, history words)', () => {
  const { backend: b, env, store } = makeBackend({ today: '2027-05-20', clock: Date.parse('2027-05-20T14:00:00Z') });
  const added = rpcOk(b, 'camp_add_camp', addCampArgs('2027-06-07')); // opens May 8, closes Jun 6, early until May 31
  const campId = added.id;
  // The form: the family page's answer + the Fill in fields. Read only; no_access first.
  const form = rpcOk(b, 'camp_staff_form', { p_camp_id: campId }, STAFF);
  assert.equal(form.status, 'ok');
  assert.equal(form.fill_in, 'open');
  assert.equal(form.signup_state, 'open');
  assert.equal(form.closes_on, '2027-06-06');
  assert.equal(form.closed_by_hand, false);
  assert.deepEqual(Object.keys(b.publicCamp(added.public_code)).every((k) => k in form), true); // the same shape + more
  assert.equal(form.camp.name, 'Spring Camp');
  assert.equal(rpcOk(b, 'camp_staff_form', { p_camp_id: randomUUID() }).status, 'not_found');
  assert.equal(rpcOk(b, 'camp_staff_form', { p_camp_id: campId }, LOCKED).status, 'no_access');
  const [d1, d2] = form.camp.days.map((d) => d.day_id);
  const liam = { first_name: 'Liam', last_name: 'Carter', age: 8, member: false, day_ids: [d1, d2], extras: [] };
  const desk = (children, extra = {}) => ({
    p_camp_id: campId, p_submission_id: randomUUID(), p_children: children, p_parent_name: 'Sarah Carter', p_parent_phone: '5085550142',
    p_parent_relation: 'Mother', p_emergency_name: 'Tom Carter', p_emergency_phone: '5085550187', p_emergency_relation: 'Uncle',
    p_paying_by: 'cash', p_acknowledged: true, p_signature: 'data:image/png;base64,iVBORw0KGgo=', p_ack_version: CAMP_ACK_VERSION,
    p_waiver_version: form.waiver_version, p_expected_total_cents: 17000, ...extra,
  });
  assert.equal(rpcOk(b, 'camp_staff_signup', desk([liam]), LOCKED).status, 'no_access');
  // The family form's rules: price_changed, camp_changed, invalid.
  const priced = rpcOk(b, 'camp_staff_signup', desk([liam], { p_expected_total_cents: 0 }), STAFF);
  assert.equal(priced.status, 'price_changed');
  assert.equal(priced.new_total_cents, 17000);
  assert.equal(priced.camp.status, 'ok');
  assert.equal(rpcOk(b, 'camp_staff_signup', desk([{ ...liam, age: 4 }]), STAFF).status, 'camp_changed');
  assert.equal(rpcOk(b, 'camp_staff_signup', desk([liam], { p_parent_phone: '123' }), STAFF).status, 'invalid');
  assert.equal(rpcOk(b, 'camp_staff_signup', desk([liam, liam, liam, liam]), STAFF).status, 'invalid'); // up to 3 children
  // Staff while open: ok, marked as the desk's, by the staff member; no rate-limit row.
  const attempts = store().camp_public_attempts.length;
  const okArgs = desk([liam]);
  const ok = rpcOk(b, 'camp_staff_signup', okArgs, STAFF);
  assert.equal(ok.status, 'ok');
  assert.match(ok.reference, /^CP-\d+$/);
  assert.equal(ok.family_total_cents, 17000);
  assert.deepEqual(rpcOk(b, 'camp_staff_signup', okArgs, STAFF), ok); // the same Send again: the first answer, no second sign-up
  assert.equal(store().camp_public_attempts.length, attempts);
  const signup = store().camp_signups.find((s) => s.reference === ok.reference);
  assert.equal(signup.source, 'desk');
  assert.equal(signup.entered_by, 'Staff');
  assert.equal(signup.created_by_name, 'Staff');
  assert.equal(store().camp_signups.filter((s) => s.camp_id === campId).length, 1);
  assert.equal(b.select('camp_signups', 'entered_by', [], [], ADMIN).error.code, '42501'); // not readable from the table
  const log = store().camp_change_log.filter((r) => r.table_name === 'camp_signups' && r.record_id === signup.id);
  assert.equal(log.length, 1);
  assert.equal(log[0].action, 'camp_staff_signup');
  assert.equal(log[0].actor_name, 'Staff');
  assert.equal(log[0].after.source, 'desk');
  assert.equal(log[0].after.entered_by, 'Staff');
  // Camper detail and History say where it came from.
  const camper = store().camp_campers.find((c) => c.signup_id === signup.id);
  const detail = toCamel(rpcOk(b, 'camp_camper_detail', { p_camper_id: camper.id }, STAFF));
  assert.equal(detail.source, 'desk');
  assert.equal(detail.enteredBy, 'Staff');
  assert.equal(CampText.signupLine(detail.camper, detail),
    `Signed up at the desk by Staff, ${CampText.monthDayYear('2027-05-20')} · waiver signed on the screen · reference ${ok.reference}`);
  assert.equal(CampText.signupLine(detail.camper), `Signed up on the family form, ${CampText.monthDayYear('2027-05-20')} · waiver signed on the form · reference ${ok.reference}`);
  const hist = toCamel(rpcOk(b, 'camp_camper_history', { p_camper_id: camper.id }, STAFF)).rows;
  const said = groupCamperHistory(hist, { dayIds: [d1, d2], extras: [] }).map((batch) => describeCamperBatch(batch, {})).filter(Boolean);
  assert.deepEqual(said.map((w) => `${w.text} | ${w.who}`), [`Signed up (entered by Staff) · ${ok.reference} | Staff`]);
  // The family form still writes 'form', by "Family form".
  const pub = b.publicSignup(signupArgs(b, added.public_code, [{ ...liam, first_name: 'Emma' }], { expected_total_cents: 17000 }));
  assert.equal(pub.status, 'ok');
  const famSignup = store().camp_signups.find((s) => s.reference === pub.reference);
  assert.equal(famSignup.source, 'form');
  assert.equal(famSignup.entered_by, null);
  const famCamper = store().camp_campers.find((c) => c.signup_id === famSignup.id);
  const famDetail = toCamel(rpcOk(b, 'camp_camper_detail', { p_camper_id: famCamper.id }));
  assert.equal(famDetail.source, 'form');
  assert.equal(famDetail.enteredBy, null);
  assert.match(CampText.signupLine(famDetail.camper, famDetail), /^Signed up on the family form, /);
  assert.equal(CampText.historySignedUp('CP-4409'), 'Signed up on the family form · CP-4409');
  // A second desk sign-up of the same child is flagged as a possible duplicate (silently, as the family form).
  const twin = rpcOk(b, 'camp_staff_signup', desk([{ ...liam, first_name: ' LIAM ' }]), STAFF);
  assert.equal(twin.status, 'ok');
  const twinCamper = store().camp_campers.find((c) => c.signup_id === store().camp_signups.find((s) => s.reference === twin.reference).id);
  assert.equal(twinCamper.duplicate_state, 'possible');
  // Closed by hand: staff get admin_only (with the state and the closing date), admins may sign up.
  const version = rows(b, 'camps', 'version', [{ col: 'id', value: campId }])[0].version;
  assert.equal(rpcOk(b, 'camp_set_signup', { p_camp_id: campId, p_expected_version: version, p_open: false }).status, 'ok');
  const closedForm = rpcOk(b, 'camp_staff_form', { p_camp_id: campId }, STAFF);
  assert.equal(closedForm.fill_in, 'admin_only');
  assert.equal(closedForm.signup_state, 'closed');
  assert.equal(closedForm.closed_by_hand, true);
  const mia = { ...liam, first_name: 'Mia', last_name: 'Lopez' };
  assert.deepEqual(rpcOk(b, 'camp_staff_signup', desk([mia]), STAFF), { status: 'admin_only', signup_state: 'closed', closes_on: '2027-06-06' });
  assert.equal(b.publicSignup(signupArgs(b, added.public_code, [mia], { expected_total_cents: 17000 })).status, 'closed'); // the family form stays closed
  assert.equal(rpcOk(b, 'camp_staff_signup', desk([mia]), ADMIN).status, 'ok');
  // Past the closing date, and not open yet: admins only too. After the last day: nobody.
  env.today = '2027-06-07';
  assert.equal(rpcOk(b, 'camp_staff_form', { p_camp_id: campId }, ADMIN).fill_in, 'admin_only');
  assert.equal(rpcOk(b, 'camp_staff_signup', desk([{ ...mia, first_name: 'Noah' }], { p_expected_total_cents: 18000 }), STAFF).status, 'admin_only');
  env.today = '2027-06-10';
  assert.equal(rpcOk(b, 'camp_staff_form', { p_camp_id: campId }, ADMIN).fill_in, 'finished');
  assert.equal(rpcOk(b, 'camp_staff_signup', desk([{ ...mia, first_name: 'Ava' }]), ADMIN).status, 'finished');
  const early = makeBackend({ today: '2027-05-01' }).backend;
  const later = rpcOk(early, 'camp_add_camp', addCampArgs('2027-06-07'));
  assert.equal(rpcOk(early, 'camp_staff_form', { p_camp_id: later.id }, STAFF).signup_state, 'not_open_yet');
  assert.equal(rpcOk(early, 'camp_staff_form', { p_camp_id: later.id }, STAFF).fill_in, 'admin_only');
  // The staff tip's words (v0.741).
  assert.equal(CampText.FILL_IN_CLOSED_STAFF, 'Family sign-up is closed. Ask an admin to fill in for a family.');
  assert.equal(CampText.FILL_IN_PAST_CLOSING_STAFF, 'The closing date has passed. Ask an admin to fill in for a family.');
  assert.equal(CampText.FILL_IN_FINISHED, 'This camp is over.');
  assert.equal(CampText.fillInTotal('$180', 'Cash', 'Wed, Nov 25'), 'Total to pay $180 · Cash, at the front desk, before Wed, Nov 25');
});

check('Fill in: only the "reg-" part of register.css reaches the dashboard (familyFormCss.js)', () => {
  const read = (name) => readFileSync(new URL(`../../styles/${name}`, import.meta.url), 'utf8');
  const register = read('register.css');
  const scoped = scopedRegisterCss(register);
  assert.ok(scoped.length > 1000);
  assert.ok(scoped.startsWith('.reg-'));
  assert.equal(onlyFamilyFormRules(scoped), true);
  assert.equal(onlyFamilyFormRules(read('camp.css')), true);
  assert.equal(onlyFamilyFormRules(register), false); // the whole file has the page rules (html, body …)
  // A minified copy is cut the same way.
  assert.equal(scopedRegisterCss('html,body{margin:0}*{box-sizing:border-box}.reg-preview{color:red}.reg-a{x:1}'), '.reg-preview{color:red}.reg-a{x:1}');
  assert.equal(scopedRegisterCss('body{margin:0}'), '');
  // Every selector must START with a family-form class (an element name tied to it is fine).
  assert.equal(onlyFamilyFormRules('section.reg-card .reg-review{margin:0}'), true);
  assert.equal(onlyFamilyFormRules('@media (max-width:599px){.reg-main{padding:0}.camp-add{gap:0}}'), true);
  for (const bad of [':not(.reg-x){color:red}', 'body .reg-x{color:red}', 'div, .reg-x{color:red}', '.reg-a{x:1}@media print{main .reg-a{x:1}}', 'a.foo .reg-x{x:1}']) {
    assert.equal(onlyFamilyFormRules(bad), false, bad);
  }
});

check('Fill in: campsApi\'s mapping (campsArgs staffSignupArgs / staffFormShapeOk / staffSignupShapeOk / signupSourceOf)', () => {
  const { backend: b } = makeBackend({ today: '2027-05-20', clock: Date.parse('2027-05-20T14:00:00Z') });
  const added = rpcOk(b, 'camp_add_camp', addCampArgs('2027-06-07'));
  // loadStaffForm: the database's flat answer, camelCase, passes the shape check; a damaged one doesn't.
  const form = toCamel(rpcOk(b, 'camp_staff_form', { p_camp_id: added.id }, STAFF));
  assert.equal(staffFormShapeOk(form), true);
  assert.equal(form.camp.days.length, 3);
  assert.equal(staffFormShapeOk({ ...form, fillIn: 'maybe' }), false);
  assert.equal(staffFormShapeOk({ ...form, camp: { camp: form.camp } }), false); // nested: not what 0043 sends
  // staffSignup: the family page's POST body → exactly the function's arguments (the preview
  // database refuses any unknown or missing argument, like PostgREST).
  const [d1] = form.camp.days.map((d) => d.dayId);
  const body = {
    submission_id: randomUUID(), children: [{ first_name: 'Liam', last_name: 'Carter', age: 8, member: false, day_ids: [d1], extras: [] }],
    parent: { name: 'Sarah Carter', phone: '5085550142', relation: 'Mother' }, emergency: { name: 'Tom Carter', phone: '5085550187', relation: 'Uncle' },
    paying_by: 'card', acknowledged: true, signature: 'data:image/png;base64,iVBORw0KGgo=', ack_version: CAMP_ACK_VERSION,
    waiver_version: form.waiverVersion, expected_total_cents: 8500, website: '', started_at: 0, sent_at: 0, turnstile_token: '',
  };
  const args = staffSignupArgs(added.id, body);
  assert.deepEqual(Object.keys(args).sort(), ['p_ack_version', 'p_acknowledged', 'p_camp_id', 'p_children', 'p_emergency_name', 'p_emergency_phone',
    'p_emergency_relation', 'p_expected_total_cents', 'p_parent_name', 'p_parent_phone', 'p_parent_relation', 'p_paying_by', 'p_school', 'p_signature',
    'p_submission_id', 'p_waiver_version']); // p_school (0050): This device's school, null = the camp's own
  assert.equal(args.p_parent_relation, 'Mother');
  assert.equal(args.p_emergency_phone, '5085550187');
  const saved = toCamel(rpcOk(b, 'camp_staff_signup', args, STAFF));
  assert.equal(saved.status, 'ok');
  assert.equal(staffSignupShapeOk(saved), true);
  assert.equal(saved.payingBy, 'card');
  assert.equal(staffSignupShapeOk({ ...saved, familyTotalCents: '8500' }), false);
  // The same submission id after a save whose answer was lost — even with changed answers — gets the
  // FIRST save back and saves nothing new (why Fill in keeps the id through every answer, also "invalid").
  const again = toCamel(rpcOk(b, 'camp_staff_signup', staffSignupArgs(added.id, { ...body, parent: { ...body.parent, name: 'Someone Else' }, expected_total_cents: 0 }), STAFF));
  assert.deepEqual(again, saved);
  assert.equal(rows(b, 'camp_roster', 'id', [{ col: 'camp_id', value: added.id }]).length, 1);
  // An "invalid" answer saves nothing, so the next Send with the SAME id saves normally.
  const id2 = randomUUID();
  const refused = rpcOk(b, 'camp_staff_signup', staffSignupArgs(added.id, { ...body, submission_id: id2, parent: { ...body.parent, phone: '12' } }), STAFF);
  assert.equal(refused.status, 'invalid');
  assert.equal(rpcOk(b, 'camp_staff_signup', staffSignupArgs(added.id, { ...body, submission_id: id2, children: [{ ...body.children[0], first_name: 'Ava' }] }), STAFF).status, 'ok');
  // loadCamperDetail: source / enteredBy from the answer's top level; an older database (neither) → 'form'.
  const camperId = rows(b, 'camp_roster', 'id, first_name', [{ col: 'camp_id', value: added.id }]).find((r) => r.first_name === 'Liam').id;
  const detail = toCamel(rpcOk(b, 'camp_camper_detail', { p_camper_id: camperId }));
  assert.deepEqual(signupSourceOf(detail), { source: 'desk', enteredBy: 'Staff' });
  assert.deepEqual(signupSourceOf({ status: 'ok', camper: {} }), { source: 'form', enteredBy: null });
  assert.deepEqual(signupSourceOf({ source: 'form', enteredBy: 'Staff' }), { source: 'form', enteredBy: null });
  assert.deepEqual(signupSourceOf({ source: 'desk', enteredBy: '  ' }), { source: 'desk', enteredBy: null });
  assert.equal(CampText.signupLine({ signedUpOn: '2027-05-20', reference: 'CP-1' }, { source: 'desk', enteredBy: null }).startsWith('Signed up on the family form'), true);
});

// ======================= Record refund (migration 0039, CONTRACT-0039, rulebook v0.743 / v1.039 / v1.040) =======================

check('Record refund: campRules helpers (overpaid, a refund that stands, the ⋯ item, the refund Undo reverses)', () => {
  assert.equal(overpaidCents({ owesCents: -2300 }), 2300); // "Paid $23 more than the total"
  assert.equal(overpaidCents({ owesCents: 0 }), 0);
  assert.equal(overpaidCents({ owesCents: 1500 }), 0);
  assert.equal(overpaidCents({}), 0);
  assert.equal(overpaidCents(null), 0);
  assert.equal(refundStands({ refundedCents: 2300 }), true);
  assert.equal(refundStands({ refundedCents: 0 }), false);
  assert.equal(refundStands({}), false); // a database from before 0039: no refunds
  // The ⋯ items (v0.743, v0.744 = picture 22y A): Record refund while overpaid, Undo refund while one
  // stands — after a partial refund both, Record refund first.
  assert.deepEqual(refundMenuItems({ owesCents: -2300, refundedCents: 0 }), ['record']);
  assert.deepEqual(refundMenuItems({ owesCents: 0, refundedCents: 2300 }), ['undo']);
  assert.deepEqual(refundMenuItems({ owesCents: -1300, refundedCents: 1000 }), ['record', 'undo']); // part handed back, part still over
  assert.deepEqual(refundMenuItems({ owesCents: 0, refundedCents: 0 }), []);
  assert.deepEqual(refundMenuItems({ owesCents: 1500 }), []);
  // Undo refund reverses the NEWEST refund that stands (rows in any order).
  const pays = [
    { id: 'p1', kind: 'payment', amountCents: 31500, recordedAt: '2027-03-11T21:05:00Z' },
    { id: 'f1', kind: 'refund', amountCents: -1000, recordedAt: '2027-04-20T14:00:00Z' },
    { id: 'v1', kind: 'reversal', amountCents: 1000, reversesPaymentId: 'f1', recordedAt: '2027-04-20T14:01:00Z' },
    { id: 'f3', kind: 'refund', amountCents: -500, recordedAt: '2027-04-21T15:00:00Z' },
    { id: 'f2', kind: 'refund', amountCents: -2300, recordedAt: '2027-04-21T14:00:00Z' },
  ];
  assert.equal(newestStandingRefund(pays).id, 'f3');
  assert.equal(newestStandingRefund(pays.slice(0, 3)), null); // the only refund was undone
  assert.equal(newestStandingRefund(undefined), null);
  // A refund's reversal is a PLUS amount; a payment's a minus one.
  assert.equal(reversesRefund(pays[2]), true);
  assert.equal(reversesRefund({ kind: 'reversal', amountCents: -31500 }), false);
  assert.equal(reversesRefund(pays[1]), false);
  assert.equal(reversesRefund(null), false);
  // The payments that stand (Record refund's note counts them): not undone, not replaced; refunds aren't payments.
  const edited = [
    { id: 'a', kind: 'payment', amountCents: 20000 },
    { id: 'b', kind: 'payment', amountCents: 11500 },
    { id: 'x', kind: 'reversal', amountCents: -20000, reversesPaymentId: 'a' },
    { id: 'c', kind: 'payment', amountCents: 20000 },
    { id: 'f', kind: 'refund', amountCents: -2300 },
  ];
  assert.deepEqual(standingPayments(edited).map((p) => p.id), ['b', 'c']);
  assert.deepEqual(standingPayments(undefined), []);
  // The box's Amount: cents allowed, a leading $ and commas fine; the rest isn't an amount.
  assert.deepEqual(parseRefundAmount('23'), { cents: 2300 });
  // Whole dollars only (as Edit payment and Star's refund box): "23.00" is fine, cents are refused.
  assert.deepEqual(parseRefundAmount(' $23.00 '), { cents: 2300 });
  assert.deepEqual(parseRefundAmount('$1,023'), { cents: 102300 });
  for (const cents of ['23.50', ' $23.5 ', '$1,023.05']) assert.equal(parseRefundAmount(cents).problem, 'notWhole', cents);
  assert.deepEqual(parseRefundAmount('0'), { cents: 0 });
  assert.deepEqual(parseRefundAmount(''), { problem: 'empty' });
  assert.deepEqual(parseRefundAmount('  '), { problem: 'empty' });
  for (const bad of ['abc', '-5', '23.505', '2 3', '.5', '23.', '$']) assert.equal(parseRefundAmount(bad).problem, bad === '$' ? 'empty' : 'notNumber', bad);
  assert.deepEqual(parseRefundAmount('9'.repeat(20)), { problem: 'tooBig' }); // always more than what was overpaid
});

check('the roster\'s Paid tag names the amount once overpaid or refunded (v0.745, copied from Star)', () => {
  // Paid more than the total: "Paid $315" and the amber "⚠ $23 overpaid".
  assert.deepEqual(paidTagParts({ paidCents: 31500, owesCents: -2300, refundedCents: 0 }), { paidCents: 31500, overpaidCents: 2300 });
  // A refund handed all of it back: "Paid $292" alone (Star's v0.166: "the row then reads "Paid $140"").
  assert.deepEqual(paidTagParts({ paidCents: 29200, owesCents: 0, refundedCents: 2300 }), { paidCents: 29200, overpaidCents: 0 });
  // Part handed back, part still over: "Paid $305" and "⚠ $13 overpaid".
  assert.deepEqual(paidTagParts({ paidCents: 30500, owesCents: -1300, refundedCents: 1000 }), { paidCents: 30500, overpaidCents: 1300 });
  // Paid exactly, no refund — or nothing to pay — the plain "Paid".
  assert.deepEqual(paidTagParts({ paidCents: 31500, owesCents: 0, refundedCents: 0 }), { paidCents: null, overpaidCents: 0 });
  assert.deepEqual(paidTagParts({ paidCents: 0, owesCents: 0 }), { paidCents: null, overpaidCents: 0 });
  // A database from before 0039 sends no refunded_cents: only "overpaid" names the amount.
  assert.deepEqual(paidTagParts({ paidCents: 31500, owesCents: -2300 }), { paidCents: 31500, overpaidCents: 2300 });
  assert.deepEqual(paidTagParts({ paidCents: 31500, owesCents: 0 }), { paidCents: null, overpaidCents: 0 });
  assert.deepEqual(paidTagParts(null), { paidCents: null, overpaidCents: 0 });
  // Star's words (the triangle is an icon, not text).
  assert.equal(CampText.paidAmount(31500), 'Paid $315');
  assert.equal(CampText.paidAmount(102350), 'Paid $1,023.50');
  assert.equal(CampText.overpaidText(2300), '$23 overpaid');
});

check('the roster\'s room limit per week (L-02, v0.747, picture 24)', () => {
  // The numbers of picture 24's footer: touch / mouse, by days in the shown week.
  const table = { 1: [395, 435], 2: [467, 507], 3: [539, 579], 4: [611, 651], 5: [683, 723], 6: [755, 795], 7: [827, 867] };
  for (const [days, [touch, mouse]] of Object.entries(table)) {
    assert.equal(rosterRoomNeeded(Number(days), false), touch, `${days} days, touch`);
    assert.equal(rosterRoomNeeded(Number(days), true), mouse, `${days} days, mouse`);
    // While someone is overpaid, the amber words widen the Paid column: 42 px more, mouse or touch.
    assert.equal(rosterRoomNeeded(Number(days), false, true), touch + 42);
    assert.equal(rosterRoomNeeded(Number(days), true, true), mouse + 42);
  }
  // Measured on the built table by the design review (a 5-day camp, widest ordinary tag): 633 / 673 px of
  // table + 50 px of margins; a day column can't be narrower than 72 px, so fewer days save 72 px each.
  assert.equal(rosterRoomNeeded(5, false), 633 + ROSTER_ROOM.margins);
  assert.equal(rosterRoomNeeded(5, true), 673 + ROSTER_ROOM.margins);
  assert.equal(rosterRoomNeeded(4, true) - rosterRoomNeeded(5, true), -72);
  // A week with no days, or something that isn't a number, counts as one day (never NaN, never a smaller limit).
  for (const odd of [0, -2, null, undefined, 2.5, '5']) assert.equal(rosterRoomNeeded(odd, false), rosterRoomNeeded(1, false), String(odd));
  // More days always need more room; a mouse always needs more than touch.
  for (let d = 1; d < 7; d += 1) assert.ok(rosterRoomNeeded(d + 1, false) > rosterRoomNeeded(d, false));
  for (let d = 1; d <= 7; d += 1) assert.ok(rosterRoomNeeded(d, true) > rosterRoomNeeded(d, false));
});

check('a pressed count card that leaves nobody says what is true (C-05 (b), v1.055)', () => {
  // Color Belt's pattern ("Everyone in this class has paid."), one line for each card that is a filter.
  assert.equal(CampText.cardEmptyLine('collect', false, '2027-04-19'), 'Every camper has paid.');
  assert.equal(CampText.cardEmptyLine('coming', true, '2027-04-21'), 'No campers are coming today.');
  assert.equal(CampText.cardEmptyLine('coming', false, '2027-04-19'), 'No campers are coming on Mon, Apr 19.');
  assert.equal(CampText.NO_MATCH_FILTER, undefined); // the old "No campers match." filter line is gone
});

check('the family form\'s "Date signed" box is the shared one, with the shared words (v0.638)', () => {
  // components/DateSigned.jsx draws it on every family form; the two sentences live in components/text.js.
  assert.equal(SharedText.DATE_SIGNED, 'Date signed');
  assert.equal(SharedText.DATE_SIGNED_HINT, "Filled in automatically with today's date.");
  // Camps' family page and Fill in use that component (no copy of the box left in the camp page's files).
  const step = readFileSync(new URL('../../camp/StepCheck.jsx', import.meta.url), 'utf8');
  assert.ok(step.includes("import DateSigned from '../components/DateSigned.jsx'") && step.includes('<DateSigned id="camp-signed" day={today} />'));
  assert.ok(!readFileSync(new URL('../../styles/camp.css', import.meta.url), 'utf8').includes('camp-signed-box'));
});

check('shared sentences and the Paying by line (batch of 2026-11-08: R1-06, R1-07, R2-07, R3-13, R1-02)', () => {
  const T = CampText;
  // R1-06: the Undo payment box takes Black Belt's words: the title names the amount and the way, the second line opens "Paid on [day]".
  // (The title is the shared sentence; the check reads the apostrophe either way, so it holds whether or not the shared file has gone straight yet.)
  assert.equal(T.undoPaymentTitle('Leo Kim', 35000, 'cash').replace('’', "'"), 'Undo Leo Kim\'s $350 cash payment?');
  assert.equal(T.undoPaymentBody({ amountCents: 35000, method: 'cash', paidOn: '2027-03-17' }, 35000), 'Paid on Mar 17. It is reversed, so $350 is owed again. Both stay in the history.');
  assert.equal(T.undoPaymentBody({ amountCents: 35000, method: 'cash', paidOn: '2027-03-17' }, 0), 'Paid on Mar 17. It is reversed. Both stay in the history.');
  // R1-07: the toasts are the shared ones.
  assert.equal(T.markedPaidToast('Leo Kim', 35000, 'cash'), 'Leo Kim marked paid · $350 cash');
  assert.equal(T.markedPaidToastHidden('Leo Kim'), 'Leo Kim marked paid');
  assert.equal(T.paymentUndoneToast('Leo Kim'), 'Payment undone for Leo Kim');
  // R2-07: a refused change or Undo names the camper; a failed Undo says the shared sentence.
  assert.equal(T.someoneElseChanged('Leo Kim'), 'Someone else changed Leo Kim just now, so nothing was done. Their change is shown.');
  assert.equal(T.undoRefused('New days can\'t be in the past.'), "Couldn't undo: New days can't be in the past.");
  assert.equal(T.UNDO_PAYMENT_FAILED, "Undo didn't save. Check the connection, then retry.");
  assert.equal(T.UNDO_DIDNT_SAVE, T.UNDO_PAYMENT_FAILED);
  // R3-13: Edit payment's Date paid hint.
  assert.equal(T.FUTURE_DAYS_HINT, "Days after today can't be chosen.");
  // R1-02: Camper detail's Paying by names where the current choice was made, as Star's.
  assert.equal(T.payingByDetail('cash', 'form'), 'Cash (chosen on the form)');
  assert.equal(T.payingByDetail('check', 'desk'), 'Check (chosen at the desk)');
  assert.equal(payingByChoiceWhere({ payingBy: 'cash', payingByOnForm: 'cash' }), 'form');
  assert.equal(payingByChoiceWhere({ payingBy: 'check', payingByOnForm: 'cash' }), 'desk');
});

check('Fill in closed by Hide private details: the camp page\'s words (v0.746)', () => {
  // (not in the mockups) One amber bar, naming nobody, for a Send that didn't save after the box closed.
  assert.equal(CampText.FILL_IN_CLOSED_NOT_SAVED, "A Fill in sign-up may not have been saved. If the family isn't on the roster, fill it in again.");
});

check('Record refund: the words (v0.743 — Star\'s box, Camps\' words)', () => {
  const T = CampText;
  assert.equal(T.RECORD_REFUND, 'Record refund');
  assert.equal(T.RECORD_REFUND_TITLE, 'Record refund');
  assert.equal(T.UNDO_REFUND, 'Undo refund');
  assert.equal(T.UNDO_REFUND_FIRST, 'Undo the refund first.');
  assert.equal(T.REFUNDED_BY, 'Refunded by');
  assert.equal(T.DATE_REFUNDED, 'Date refunded');
  assert.equal(T.refundSub('Chloe Martin', 31500, 2300), 'Chloe Martin · paid $315 · $23 overpaid');
  assert.equal(T.refundUpTo(2300), 'Up to $23, the amount overpaid.');
  assert.equal(T.refundDateHint('2027-03-04'), 'Not before Mar 4 (signed up) or after today.');
  // Since v0.745 (Star's words) it names what the row then reads: paid minus everything overpaid.
  assert.equal(T.refundAfter(31500, 1, 29200), 'The $315 payment stays in the history. Afterwards the row reads “Paid $292”.');
  assert.equal(T.refundAfter(31500, 2, 29200), 'The 2 payments ($315) stay in the history. Afterwards the row reads “Paid $292”.');
  assert.equal(T.refundTooLarge(2300), 'Can\'t be more than the $23 overpaid.');
  // The box's words for what picture 22 didn't draw (review L4 / L5).
  assert.equal(T.REFUND_AMOUNT_ZERO, 'Enter an amount more than $0.');
  assert.equal(T.REFUND_AMOUNT_PROBLEM, 'Enter an amount in whole dollars, like 23.');
  assert.equal(T.ENTER_DATE_REFUNDED, 'Enter the date refunded.');
  assert.equal(T.refundDateRange('2027-03-04'), 'Pick a day from Mar 4 to today.');
  assert.equal(T.UNDO_REFUND_STANDS_STAFF, "Couldn't undo: this camper has a refund. Ask an admin.");
  assert.equal(T.OVERPAID_ADMIN_TOUCH, 'An admin records money handed back with More → Record refund.');
  assert.equal(T.NOTHING_OVERPAID, 'Nothing is overpaid any more. Someone else changed this just now. Close this to see the latest.');
  assert.equal(T.TOAST_REFUND_RECORDED, 'Refund recorded');
  assert.equal(T.TOAST_REFUND_UNDONE, 'Refund undone');
  assert.equal(T.undoRefundTitle('Chloe Martin'), "Undo Chloe Martin's refund?");
  assert.equal(T.undoRefundBody({ amountCents: -2300, method: 'cash', paidOn: '2027-04-21' }),
    'The $23 cash refund recorded on Apr 21 is reversed and the amount shows as overpaid again. Both stay in the history.');
  assert.equal(T.KEEP_REFUND, 'Keep refund');
  assert.equal(T.OVERPAID_ADMIN, 'An admin records money handed back with ⋯ → Record refund.');
  // Camper detail's lines: the refund as its own line; its Undo the same "(reversed)" line as a
  // payment's (its own plus amount), so it can't be taken for a second refund (review L4).
  const base = { method: 'cash', school: 'worcester', paidOn: '2027-04-21', recordedByName: 'Jeffrey Berg' };
  assert.equal(T.paymentLine({ ...base, kind: 'refund', amountCents: -2300 }), 'refunded $23 cash Apr 21 · Worcester · by Jeffrey Berg');
  assert.equal(T.paymentLine({ ...base, kind: 'reversal', amountCents: 2300, paidOn: '2027-04-22' }), '$23 cash (reversed) · Apr 22 · Worcester · by Jeffrey Berg');
  assert.equal(T.paymentLine({ ...base, kind: 'reversal', amountCents: -31500, method: 'check' }), '−$315 check (reversed) · Apr 21 · Worcester · by Jeffrey Berg');
  assert.equal(T.paymentLine({ ...base, kind: 'payment', amountCents: 31500, method: 'check' }), '$315 check · paid Apr 21 · Worcester · by Jeffrey Berg');
  assert.equal(T.historyRefund(2300, 'cash', '2027-04-21'), 'Refund recorded: $23 cash, Apr 21');
  assert.equal(T.historyRefundUndone(2300), 'Refund undone: $23');
  assert.equal(T.RECEIPT_FOR_REFUND, 'Refund');
});

check('Record refund: the receipt\'s minus line, Paid to date net of it; an undone refund left out', () => {
  const camp = { name: 'April Vacation Camp', locationCode: 'worcester', bothSchools: true };
  const campDays = ['2027-04-19', '2027-04-20', '2027-04-21', '2027-04-22', '2027-04-23'].map((day, i) => ({ dayId: `d${i}`, day }));
  const camper = {
    firstName: 'Chloe', lastName: 'Martin', status: 'active', days: campDays.slice(0, 4), totalCents: 29200, paidCents: 29200,
    reference: 'CP-4818', refundedCents: 2300,
  };
  const payments = [
    { id: 'f2', kind: 'refund', amountCents: -2300, method: 'cash', paidOn: '2027-04-21', recordedAt: '2027-04-21T14:00:00Z', reversesPaymentId: null },
    { id: 'p1', kind: 'payment', amountCents: 31500, method: 'check', paidOn: '2027-03-11', recordedAt: '2027-03-11T21:05:00Z', reversesPaymentId: null },
    { id: 'f1', kind: 'refund', amountCents: -1000, method: 'cash', paidOn: '2027-04-20', recordedAt: '2027-04-20T14:00:00Z', reversesPaymentId: null },
    { id: 'v1', kind: 'reversal', amountCents: 1000, method: 'cash', paidOn: '2027-04-20', recordedAt: '2027-04-20T14:01:00Z', reversesPaymentId: 'f1' },
  ];
  const build = (over = {}) => buildCampReceipt({ detail: { camper, breakdown: { extras: [] }, payments, ...over }, camp, campDays, printedOn: '2027-04-21' });
  const r = build();
  assert.deepEqual(r.lines, [
    { date: '2027-03-11', forText: 'Camp fee', how: 'check', amountCents: 31500 },
    { date: '2027-04-21', forText: 'Refund', how: 'cash', amountCents: -2300 }, // "−$23" (picture 22 4b)
  ]);
  assert.equal(r.paidCents, 29200); // Paid to date counts the refund
  assert.equal(r.totalDueCents, 29200); // → Balance $0 · paid in full
  assert.deepEqual(receiptPayments(payments).map((p) => p.id), ['p1', 'f2']);
  // A refund row with a plus amount (never sent) still prints with a minus (Star's rule).
  assert.equal(build({ payments: [{ ...payments[0], amountCents: 2300 }] }).lines[0].amountCents, -2300);
  // Print receipt: a refund that stands counts as money on record (Star's rule); never while hidden.
  assert.equal(canPrintReceipt({ status: 'active', paidCents: 0, refundedCents: 500 }, false), true);
  assert.equal(canPrintReceipt({ status: 'active', paidCents: 0, refundedCents: 500 }, true), false);
  assert.equal(canPrintReceipt({ status: 'active', paidCents: 0, refundedCents: 0 }, false), false);
});

check('Record refund: the History words ("Refund recorded: $23 cash, Apr 21", "Refund undone: $23")', () => {
  const row = (batchId, tableName, after, before = null, op = 'insert') => ({ batchId, occurredAt: '2027-04-21T14:00:00Z', actorName: 'Jeffrey Berg', tableName, op, before, after });
  const say = (rows, opts = {}) => describeCamperBatch(groupCamperHistory(rows)[0], { campDays: [], campExtras: [], familySize: 1, ...opts });
  const refund = [
    row('r', 'camp_payments', { kind: 'refund', amountCents: -2300, method: 'cash', paidOn: '2027-04-21', school: 'worcester' }),
    row('r', 'camp_campers', { version: 5 }, { version: 4 }, 'update'), // the version moved: nothing to say
  ];
  assert.deepEqual(say(refund), { text: 'Refund recorded: $23 cash, Apr 21', at: '2027-04-21T14:00:00Z', who: 'Jeffrey Berg' });
  assert.equal(say([row('u', 'camp_payments', { kind: 'reversal', amountCents: 2300, method: 'cash', paidOn: '2027-04-22', reversesPaymentId: 'f' })]).text, 'Refund undone: $23');
  // A payment's Undo and Edit payment read as before.
  assert.equal(say([row('p', 'camp_payments', { kind: 'reversal', amountCents: -31500, method: 'check' })]).text, 'Payment undone: $315');
  assert.equal(say([
    row('e', 'camp_payments', { kind: 'reversal', amountCents: -31500, method: 'check' }),
    row('e', 'camp_payments', { kind: 'payment', amountCents: 29200, method: 'check' }),
  ]).text, 'Payment changed: $315 check → $292 check');
  // Hidden: a refund is money, so the save is left out of the list.
  assert.deepEqual(say(refund, { hidden: true }), { hiddenPayment: true });
});

check('mock (0039): Record refund and its Undo — the contract\'s answers, refund_stands, the roster and Camper detail', () => {
  const { backend: b, env, store } = makeBackend({ today: '2027-04-21', clock: Date.parse('2027-04-21T14:00:00Z') }); // campWeek
  const camp = rows(b, 'camps', 'id, name').find((c) => c.name === 'April Vacation Camp');
  // The app's own roster column list (campsArgs.ROSTER_COLUMNS) reads from the preview database.
  const roster = () => toCamel(rows(b, 'camp_roster', ROSTER_COLUMNS, [{ col: 'camp_id', value: camp.id }]));
  const chloe = () => roster().find((r) => r.firstName === 'Chloe' && r.lastName === 'Martin');
  const detailOf = (id, ctx = ADMIN) => toCamel(rpcOk(b, 'camp_camper_detail', { p_camper_id: id }, ctx));
  const campDays = toCamel(rows(b, 'camp_days', 'id, day', [{ col: 'camp_id', value: camp.id }])).map((d) => ({ dayId: d.id, day: d.day }));
  const campExtras = toCamel(rows(b, 'camp_extras', 'id, name, sort', [{ col: 'camp_id', value: camp.id }])).map((e) => ({ extraId: e.extraId ?? e.id, name: e.name }));
  const words = (r) => groupCamperHistory(toCamel(rpcOk(b, 'camp_camper_history', { p_camper_id: r.id })).rows, {
    dayIds: r.days.map((d) => d.dayId), extras: r.extras.map((e) => ({ extraId: e.extraId, dayId: e.dayId })),
  }).map((batch) => describeCamperBatch(batch, { campDays, campExtras, familySize: 1 })).filter(Boolean).map((w) => `${w.text} | ${w.who}`);

  // Picture 22's sample: Chloe Martin paid $315 by check on Mar 11 (signed up Mar 4).
  let c = chloe();
  assert.equal(c.totalCents, 31500);
  assert.equal(c.paidCents, 31500);
  assert.equal(c.refundedCents, 0);
  assert.deepEqual(refundMenuItems(c), []);
  const args = (over = {}) => recordRefundArgs({ camperId: c.id, expectedVersion: c.version, method: 'cash', amountCents: 2300, refundedOn: '2027-04-21', school: 'worcester', ...over });
  assert.deepEqual(Object.keys(args()).sort(), ['p_amount_cents', 'p_camper_id', 'p_expected_version', 'p_method', 'p_refunded_on', 'p_school']);
  assert.deepEqual(rpcOk(b, 'camp_record_refund', args()), { status: 'refund_too_large', overpaid_cents: 0 }); // nothing overpaid yet

  // Friday taken off with Edit details: total $292, so $23 overpaid.
  const d0 = detailOf(c.id);
  const keep = c.days.map((d) => d.dayId).slice(0, 4);
  const late = c.extras[0].extraId;
  const edited = rpcOk(b, 'camp_update_details', {
    p_camper_id: c.id, p_camper_version: c.version, p_signup_version: c.signupVersion, p_first: 'Chloe', p_last: 'Martin', p_age: 8, p_member: true,
    p_day_ids: keep, p_extras: [{ extra_id: late, day_ids: keep }], p_parent_name: d0.family.parentName, p_parent_phone: d0.family.parentPhone,
    p_parent_relation: d0.family.parentRelation, p_emergency_name: d0.family.emergencyName, p_emergency_phone: d0.family.emergencyPhone,
    p_emergency_relation: d0.family.emergencyRelation,
  });
  assert.equal(edited.status, 'ok');
  assert.equal(edited.total_cents, 29200);
  assert.equal(edited.owes_cents, -2300);
  c = chloe();
  assert.equal(overpaidCents(c), 2300);
  assert.deepEqual(refundMenuItems(c), ['record']);
  assert.deepEqual(paidTagParts(c), { paidCents: 31500, overpaidCents: 2300 }); // the roster: "Paid $315 ⚠ $23 overpaid" (v0.745)

  // The contract's refusals, in its order: staff first; then the inputs; then the camper.
  assert.equal(rpcOk(b, 'camp_record_refund', args(), STAFF).status, 'not_allowed');
  assert.equal(rpcOk(b, 'camp_record_refund', args(), LOCKED).status, 'no_access');
  assert.equal(rpcOk(b, 'camp_record_refund', args({ method: 'card' })).status, 'invalid'); // a refund goes back in cash or by check
  assert.equal(rpcOk(b, 'camp_record_refund', args({ amountCents: 0 })).status, 'invalid');
  assert.equal(rpcOk(b, 'camp_record_refund', args({ amountCents: 1000001 })).status, 'invalid'); // over $10,000 (0022's limit; the real cap is what was overpaid)
  assert.equal(rpcOk(b, 'camp_record_refund', args({ refundedOn: '2027-04-22' })).status, 'invalid'); // after today
  assert.equal(rpcOk(b, 'camp_record_refund', args({ refundedOn: null })).status, 'invalid');
  assert.deepEqual(rpcOk(b, 'camp_record_refund', args({ school: 'boston' })), { status: 'invalid', field: 'school' });
  assert.equal(rpcOk(b, 'camp_record_refund', args({ camperId: randomUUID() })).status, 'not_found');
  assert.equal(rpcOk(b, 'camp_record_refund', args({ expectedVersion: c.version - 1 })).status, 'stale');
  assert.deepEqual(rpcOk(b, 'camp_record_refund', args({ refundedOn: '2027-03-03' })), { status: 'invalid', field: 'date' }); // before signing up (Mar 4)
  assert.deepEqual(rpcOk(b, 'camp_record_refund', args({ amountCents: 3000 })), { status: 'refund_too_large', overpaid_cents: 2300 });
  assert.equal(b.rpc('camp_record_refund', { ...args(), p_extra: 1 }, ADMIN).error.code, 'PGRST202'); // an unknown argument

  // The refund: $23 cash on the sign-up day, at Shrewsbury's desk (This device, v1.040).
  env.clock += 1000;
  const saved = rpcOk(b, 'camp_record_refund', args({ refundedOn: '2027-03-04', school: 'shrewsbury' }));
  assert.equal(saved.status, 'ok');
  assert.equal(typeof saved.payment_id, 'string');
  assert.equal(saved.version, c.version + 1);
  assert.equal(rpcOk(b, 'camp_record_refund', args()).status, 'stale'); // a second Save with the old version
  c = chloe();
  assert.equal(c.paidCents, 29200);
  assert.equal(c.owesCents, 0);
  assert.equal(c.refundedCents, 2300);
  assert.equal(payTag(c), 'paid');
  assert.equal(c.paidOn, '2027-03-11'); // a refund never becomes "the last payment"
  assert.equal(c.paidMethod, 'check');
  assert.deepEqual(refundMenuItems(c), ['undo']); // all of it handed back: only Undo refund
  assert.deepEqual(paidTagParts(c), { paidCents: 29200, overpaidCents: 0 }); // the roster: "Paid $292" (v0.745)
  // Camper detail (staff too): every row, the refund with its kind, school and date; its line.
  const d1 = detailOf(c.id, STAFF);
  assert.equal(d1.camper.refundedCents, 2300);
  assert.deepEqual(d1.payments.map((p) => p.kind), ['payment', 'refund']);
  const refundRow = d1.payments[1];
  assert.equal(refundRow.id, saved.payment_id);
  assert.equal(refundRow.amountCents, -2300);
  assert.equal(refundRow.school, 'shrewsbury');
  assert.equal(refundRow.paidOn, '2027-03-04');
  assert.equal(CampText.paymentLine(refundRow), 'refunded $23 cash Mar 4 · Shrewsbury · by Jeffrey Berg');
  assert.equal(newestStandingRefund(d1.payments).id, saved.payment_id);
  assert.equal(words(c)[0], 'Refund recorded: $23 cash, Mar 4 | Jeffrey Berg');

  // refund_stands: Edit payment and Undo payment wait for Undo refund (their own refusals come first).
  const paymentId = c.lastPaymentId;
  assert.equal(rpcOk(b, 'camp_undo_payment', { p_payment_id: paymentId }).status, 'refund_stands');
  assert.equal(rpcOk(b, 'camp_edit_payment', { p_payment_id: paymentId, p_method: 'cash', p_amount_cents: 29200, p_paid_on: '2027-03-11', p_school: 'worcester' }).status, 'refund_stands');
  assert.equal(rpcOk(b, 'camp_edit_payment', { p_payment_id: paymentId, p_method: 'cash', p_amount_cents: 29200, p_paid_on: '2027-03-11', p_school: 'worcester' }, STAFF).status, 'not_allowed');
  assert.equal(rpcOk(b, 'camp_undo_payment', { p_payment_id: paymentId }, STAFF).status, 'not_allowed'); // not their own, recent Mark paid
  assert.equal(rpcOk(b, 'camp_undo_payment', { p_payment_id: randomUUID() }).status, 'not_found');
  // A second refund: nothing is overpaid now.
  assert.deepEqual(rpcOk(b, 'camp_record_refund', args({ expectedVersion: c.version, amountCents: 100 })), { status: 'refund_too_large', overpaid_cents: 0 });

  // Undo refund: admins; only a refund; once.
  assert.equal(rpcOk(b, 'camp_undo_refund', { p_payment_id: saved.payment_id }, STAFF).status, 'not_allowed');
  assert.equal(rpcOk(b, 'camp_undo_refund', { p_payment_id: paymentId }).status, 'invalid'); // a payment has Undo payment
  assert.equal(rpcOk(b, 'camp_undo_refund', { p_payment_id: randomUUID() }).status, 'not_found');
  env.clock += 1000;
  const undone = rpcOk(b, 'camp_undo_refund', { p_payment_id: saved.payment_id });
  assert.equal(undone.status, 'ok');
  assert.equal(rpcOk(b, 'camp_undo_refund', { p_payment_id: saved.payment_id }).status, 'stale'); // already undone
  c = chloe();
  assert.equal(c.version, undone.version);
  assert.equal(c.refundedCents, 0);
  assert.equal(c.owesCents, -2300); // overpaid again
  assert.deepEqual(refundMenuItems(c), ['record']);
  // The reversal: + the refund's amount, same way, today, at the REFUND's school (v1.040).
  const reversal = store().camp_payments.find((p) => p.reverses_payment_id === saved.payment_id);
  assert.deepEqual([reversal.kind, reversal.amount_cents, reversal.method, reversal.paid_on, reversal.school], ['reversal', 2300, 'cash', '2027-04-21', 'shrewsbury']);
  assert.equal(rpcOk(b, 'camp_undo_refund', { p_payment_id: reversal.id }).status, 'invalid'); // a reversal is never undone
  assert.equal(words(c)[0], 'Refund undone: $23 | Jeffrey Berg');
  const d2 = detailOf(c.id);
  assert.deepEqual(d2.payments.map((p) => CampText.paymentLine(p)), [
    '$315 check · paid Mar 11 · Worcester · by Staff',
    'refunded $23 cash Mar 4 · Shrewsbury · by Jeffrey Berg',
    '$23 cash (reversed) · Apr 21 · Shrewsbury · by Jeffrey Berg',
  ]);
  assert.equal(newestStandingRefund(d2.payments), null);
  // The receipt: only the payment again; Paid to date $315.
  const receipt = buildCampReceipt({ detail: d2, camp: { name: camp.name, locationCode: 'worcester', bothSchools: true }, campDays, printedOn: '2027-04-21' });
  assert.deepEqual(receipt.lines.map((l) => [l.forText, l.amountCents]), [['Camp fee', 31500]]);
  assert.equal(receipt.paidCents, 31500);
  // With the refund undone, Undo payment works again.
  assert.equal(rpcOk(b, 'camp_edit_payment', { p_payment_id: paymentId, p_method: 'check', p_amount_cents: 29200, p_paid_on: '2027-03-11', p_school: 'worcester' }).status, 'ok');

  // A withdrawn camper: no refund, and a standing refund can't be undone (Restore first).
  c = chloe();
  assert.equal(overpaidCents(c), 0); // the edit made the payment $292
  // Liam Ortiz paid $275 for every day; Friday off → $15 overpaid; $5 of it handed back by check.
  const liam = roster().find((r) => r.firstName === 'Liam' && r.lastName === 'Ortiz');
  const dl = detailOf(liam.id);
  const liamEdit = rpcOk(b, 'camp_update_details', {
    p_camper_id: liam.id, p_camper_version: liam.version, p_signup_version: liam.signupVersion, p_first: liam.firstName, p_last: liam.lastName, p_age: liam.age,
    p_member: liam.member, p_day_ids: liam.days.map((d) => d.dayId).slice(0, 4), p_extras: [], p_parent_name: dl.family.parentName,
    p_parent_phone: dl.family.parentPhone, p_parent_relation: dl.family.parentRelation, p_emergency_name: dl.family.emergencyName,
    p_emergency_phone: dl.family.emergencyPhone, p_emergency_relation: dl.family.emergencyRelation,
  });
  assert.equal(liamEdit.status, 'ok');
  assert.equal(liamEdit.owes_cents, -1500);
  const liam1 = roster().find((r) => r.id === liam.id);
  const part = rpcOk(b, 'camp_record_refund', recordRefundArgs({ camperId: liam1.id, expectedVersion: liam1.version, method: 'check', amountCents: 500, refundedOn: '2027-04-21', school: 'worcester' }));
  assert.equal(part.status, 'ok');
  const liam2 = roster().find((r) => r.id === liam.id);
  assert.equal(liam2.refundedCents, 500);
  assert.equal(liam2.owesCents, -1000);
  // A part handed back, some still over: both items (v0.744, picture 22y A) — and the rest goes back
  // as a SECOND refund, never more than what is still overpaid.
  assert.deepEqual(refundMenuItems(liam2), ['record', 'undo']);
  assert.deepEqual(paidTagParts(liam2), { paidCents: 27000, overpaidCents: 1000 }); // the roster: "Paid $270 ⚠ $10 overpaid" (v0.745)
  // The second box, opened as CampPage opens it (the camper's paid amount; the cap = what is still
  // overpaid), says what the row reads once the rest goes back.
  assert.ok(CampText.refundAfter(27500, 1, liam2.paidCents - overpaidCents(liam2)).endsWith('Afterwards the row reads “Paid $260”.'));
  assert.equal(rpcOk(b, 'camp_record_refund', recordRefundArgs({ camperId: liam2.id, expectedVersion: liam2.version, method: 'cash', amountCents: 1100, refundedOn: '2027-04-21', school: 'worcester' })).status, 'refund_too_large');
  const rest = rpcOk(b, 'camp_record_refund', recordRefundArgs({ camperId: liam2.id, expectedVersion: liam2.version, method: 'cash', amountCents: 1000, refundedOn: '2027-04-21', school: 'worcester' }));
  assert.equal(rest.status, 'ok');
  const liamBack = roster().find((r) => r.id === liam.id);
  assert.equal(liamBack.refundedCents, 1500);
  assert.equal(liamBack.owesCents, 0);
  assert.deepEqual(refundMenuItems(liamBack), ['undo']);
  assert.deepEqual(paidTagParts(liamBack), { paidCents: 26000, overpaidCents: 0 }); // the roster: "Paid $260" (v0.745)
  assert.equal(rpcOk(b, 'camp_withdraw_camper', { p_camper_id: liamBack.id, p_expected_version: liamBack.version }).status, 'ok');
  assert.equal(rpcOk(b, 'camp_undo_refund', { p_payment_id: part.payment_id }).status, 'withdrawn');
  const liam3 = roster().find((r) => r.id === liam.id);
  assert.equal(rpcOk(b, 'camp_record_refund', recordRefundArgs({ camperId: liam3.id, expectedVersion: liam3.version, method: 'cash', amountCents: 100, refundedOn: '2027-04-21', school: 'worcester' })).status, 'withdrawn');
  assert.equal(CAMP_RPC_NAMES.includes('camp_record_refund') && CAMP_RPC_NAMES.includes('camp_undo_refund'), true);
});

check('mock (0039): the row rules (kind check + guard) and Edit payment of a refund or reversal → invalid', () => {
  const { backend: b, env, store } = makeBackend({ today: '2027-04-21', clock: Date.parse('2027-04-21T14:00:00Z') });
  const camp = rows(b, 'camps', 'id, name').find((c) => c.name === 'April Vacation Camp');
  const roster = () => toCamel(rows(b, 'camp_roster', ROSTER_COLUMNS, [{ col: 'camp_id', value: camp.id }]));
  let c = roster().find((r) => r.firstName === 'Chloe' && r.lastName === 'Martin');
  const d0 = toCamel(rpcOk(b, 'camp_camper_detail', { p_camper_id: c.id }));
  const keep = c.days.map((d) => d.dayId).slice(0, 4);
  assert.equal(rpcOk(b, 'camp_update_details', {
    p_camper_id: c.id, p_camper_version: c.version, p_signup_version: c.signupVersion, p_first: 'Chloe', p_last: 'Martin', p_age: 8, p_member: true,
    p_day_ids: keep, p_extras: [{ extra_id: c.extras[0].extraId, day_ids: keep }], p_parent_name: d0.family.parentName, p_parent_phone: d0.family.parentPhone,
    p_parent_relation: d0.family.parentRelation, p_emergency_name: d0.family.emergencyName, p_emergency_phone: d0.family.emergencyPhone,
    p_emergency_relation: d0.family.emergencyRelation,
  }).status, 'ok');
  c = roster().find((r) => r.id === c.id);
  env.clock += 1000;
  const refund = rpcOk(b, 'camp_record_refund', recordRefundArgs({ camperId: c.id, expectedVersion: c.version, method: 'cash', amountCents: 2300, refundedOn: '2027-04-21', school: 'worcester' }));
  assert.equal(refund.status, 'ok');
  const paymentId = c.lastPaymentId; // $315 check at Worcester; the camper's rows now add up to $292
  const row = (over) => ({ camper_id: c.id, kind: 'refund', amount_cents: -100, method: 'cash', reverses_payment_id: null, school: 'worcester', ...over });
  // The kind rule: a refund is cash or check, −$10,000 … −1 cent, and undoes nothing.
  assert.equal(b.checkPaymentRow(row()), null);
  assert.equal(b.checkPaymentRow(row({ method: 'check' })), null);
  assert.equal(b.checkPaymentRow(row({ method: 'card' })), 'invalid');
  assert.equal(b.checkPaymentRow(row({ amount_cents: 100 })), 'invalid');
  assert.equal(b.checkPaymentRow(row({ amount_cents: -1000001 })), 'invalid');
  assert.equal(b.checkPaymentRow(row({ reverses_payment_id: paymentId })), 'invalid');
  assert.equal(b.checkPaymentRow(row({ kind: 'payment', amount_cents: 0 })), 'invalid');
  assert.equal(b.checkPaymentRow(row({ kind: 'payment', amount_cents: 1000001 })), 'invalid');
  // The net rule: no row may take the camper's rows below 0 ($292 now).
  assert.equal(b.checkPaymentRow(row({ amount_cents: -29200 })), null); // exactly 0 is fine
  assert.equal(b.checkPaymentRow(row({ amount_cents: -29201 })), 'invalid');
  // A reversal undoes a payment or a refund of the same camper, for exactly minus it, at its school.
  const reversal = (over) => ({ camper_id: c.id, kind: 'reversal', amount_cents: 2300, method: 'cash', reverses_payment_id: refund.payment_id, school: 'worcester', ...over });
  assert.equal(b.checkPaymentRow(reversal()), null); // the refund's Undo
  assert.equal(b.checkPaymentRow(reversal({ school: 'shrewsbury' })), 'invalid');
  assert.equal(b.checkPaymentRow(reversal({ amount_cents: 2200 })), 'invalid');
  assert.equal(b.checkPaymentRow(reversal({ camper_id: roster().find((r) => r.firstName === 'Liam').id })), 'invalid');
  assert.equal(b.checkPaymentRow(reversal({ reverses_payment_id: randomUUID() })), 'invalid');
  // Undoing the payment would take the rows to −$23 (the refund stands): the net rule says no too.
  assert.equal(b.checkPaymentRow(reversal({ amount_cents: -31500, method: 'check', reverses_payment_id: paymentId })), 'invalid');
  env.clock += 1000;
  assert.equal(rpcOk(b, 'camp_undo_refund', { p_payment_id: refund.payment_id }).status, 'ok');
  const undoRow = store().camp_payments.find((p) => p.reverses_payment_id === refund.payment_id);
  assert.equal(b.checkPaymentRow(reversal({ amount_cents: -2300, reverses_payment_id: undoRow.id })), 'invalid'); // never a reversal of a reversal
  // Edit payment: a refund or a reversal is 'invalid' (only a payment can be edited); an edited payment 'stale'.
  const edit = (id) => rpcOk(b, 'camp_edit_payment', { p_payment_id: id, p_method: 'cash', p_amount_cents: 29200, p_paid_on: '2027-03-11', p_school: 'worcester' }).status;
  assert.equal(edit(refund.payment_id), 'invalid');
  assert.equal(edit(undoRow.id), 'invalid');
  env.clock += 1000;
  assert.equal(edit(paymentId), 'ok');
  assert.equal(edit(paymentId), 'stale'); // already replaced
});

// ======================= R2-05 — the Camps pages' line of saves (screens/camps/lineSave.js; rulebook v1.125–v1.129) =======================
// CampPage, CampRowMenu (the camp page's and the list's ⋯) and Camps.jsx used to keep their own busy flag and
// an Undo that returned early while another save ran. They now go through the page's save line
// (src/lib/saveLine.js); lineSave.js holds the two pure pieces, checked here without a browser.
async function checkAsync(label, fn) {
  try {
    await fn();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
function holdable() {
  let settle;
  const promise = new Promise((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}
function pageLine() {
  const page = { bars: [], toasts: [] };
  page.options = {
    section: 'Camps',
    showToast: (text) => page.toasts.push(text),
    undoBar: (bar) => page.bars.push(bar),
    onBusyChange: () => {},
  };
  page.line = createSaveLine(() => page.options);
  return page;
}

await checkAsync('R2-05 saveOnLine: answers the save\'s own answer, ends the line once, and tells onNotOk how a failed save ended', async () => {
  const { line } = pageLine();
  const notOk = [];
  const answer = await saveOnLine(line, async () => ({ status: 'ok', id: 7 }), { onNotOk: (status) => notOk.push(status) });
  assert.deepEqual(answer, { status: 'ok', id: 7 });
  assert.equal(line.isBusy(), false);
  assert.deepEqual(notOk, [], 'a save that worked does not call onNotOk');
  const refused = await saveOnLine(line, async () => ({ status: 'stale' }), { onNotOk: (status) => notOk.push(status) });
  assert.equal(refused.status, 'stale');
  assert.deepEqual(notOk, ['stale']);
  assert.equal(line.isBusy(), false);
});

await checkAsync('R2-05 saveOnLine: a save that throws still ends the line (a waiting Undo must not wait for ever)', async () => {
  const { line } = pageLine();
  const notOk = [];
  await assert.rejects(() => saveOnLine(line, async () => { throw new Error('network'); }, { onNotOk: (status) => notOk.push(status) }), /network/);
  assert.equal(line.isBusy(), false, 'the line is free again');
  assert.deepEqual(notOk, ['error'], 'a save that never answered counts as not reached');
  assert.ok(line.begin(), 'the next save can start');
  line.end('ok');
});

await checkAsync('R2-05 saveOnLine: while something runs it does nothing and answers null (as the old begin() returning false)', async () => {
  const { line } = pageLine();
  const hold = holdable();
  let calls = 0;
  const first = saveOnLine(line, () => ((calls += 1), hold.promise));
  assert.equal(line.isBusy(), true);
  const second = await saveOnLine(line, async () => ((calls += 1), { status: 'ok' }));
  assert.equal(second, null);
  assert.equal(calls, 1, 'the second save never ran');
  hold.settle({ status: 'ok' });
  assert.equal((await first).status, 'ok');
  assert.equal(line.isBusy(), false);
});

await checkAsync('R2-05 an Undo pressed during another save waits for it, then runs (the Withdraw A / Withdraw B / Undo A case)', async () => {
  const page = pageLine();
  const saveB = holdable();
  const running = saveOnLine(page.line, () => saveB.promise); // Withdraw B is saving
  let undone = 0;
  const pressed = page.line
    .undoAction(async () => ((undone += 1), undoAnswer({ status: 'ok' }, { notAllowed: 'n', stale: 's' })), { words: 'Zoe Park withdrawn' })
    .onAction();
  await pause();
  assert.equal(undone, 0, 'it waits: B is still saving');
  saveB.settle({ status: 'ok' });
  await running;
  const answer = await pressed;
  assert.equal(undone, 1, 'it ran as soon as B ended');
  assert.equal(answer.undone, true);
  assert.deepEqual(page.bars, [null], 'no failure bar; the toast says "Undone"');
});

await checkAsync('R2-05 a failed save, then an Undo that fails too: one bar, "Neither change saved", with a Retry that redoes the save and the Undo', async () => {
  const page = pageLine();
  const saveB = holdable();
  let saveAgain = 0;
  const running = saveOnLine(page.line, () => saveB.promise, { retry: async () => { saveAgain += 1; } });
  const pressed = page.line.undoAction(async () => ({ status: 'error' }), { words: 'Zoe Park withdrawn' }).onAction();
  saveB.settle({ status: 'error' });
  await running;
  await pressed;
  const bar = page.bars[page.bars.length - 1];
  assert.equal(bar.text, SharedText.NEITHER_SAVED);
  assert.equal(typeof bar.retry, 'function');
  assert.equal(bar.takeFocus, true);
  await bar.retry();
  assert.equal(saveAgain, 1, 'Retry redid the failed save first');
});

check('R2-05 undoAnswer: ok, no_access and error pass through; a refusal says why (the call\'s own words, the refund words, or "Someone else changed [Name]")', () => {
  const words = { notAllowed: CampText.CAMPS_NOT_ALLOWED, stale: CampText.someoneElseChanged('Zoe Park'), refundStands: CampText.UNDO_REFUND_FIRST };
  assert.deepEqual(undoAnswer({ status: 'ok' }, words), { status: 'ok' });
  assert.deepEqual(undoAnswer({ status: 'no_access' }, words), { status: 'no_access' });
  assert.deepEqual(undoAnswer({ status: 'error' }, words), { status: 'error' });
  assert.deepEqual(undoAnswer(undefined, words), { status: 'error' }, 'no answer counts as not reached');
  assert.deepEqual(undoAnswer({ status: 'not_allowed' }, words), { status: 'not_allowed', reason: CampText.CAMPS_NOT_ALLOWED });
  assert.deepEqual(undoAnswer({ status: 'stale' }, words), { status: 'stale', reason: 'Someone else changed Zoe Park just now, so nothing was done. Their change is shown.' });
  assert.equal(undoAnswer({ status: 'not_found' }, words).reason, words.stale);
  assert.equal(undoAnswer({ status: 'refund_stands' }, words).reason, CampText.UNDO_REFUND_FIRST);
  assert.equal(undoAnswer({ status: 'refund_stands' }, { notAllowed: 'n', stale: 's' }).reason, 's', 'no refund words given: the stale words');
  // A call's own reason (Edit camp's and Edit details' Undo) wins over the stale words and the refund words.
  const named = CampText.undoRefused(CampText.UNDO_DETAILS_NO_LONGER_FIT);
  assert.equal(undoAnswer({ status: 'invalid', undoText: named }, words).reason, named);
  assert.equal(undoAnswer({ status: 'refund_stands', undoText: named }, words).reason, named);
  assert.match(named, /^Couldn't undo: .*\.$/, 'the shared sentence: "Couldn\'t undo: [reason]."');
  // Hide private details on, a money Undo: the general words only, and never a Retry that could record money.
  const general = { error: CampText.SAVE_FAILED, notAllowed: CampText.ROSTER_NOT_ALLOWED, stale: words.stale };
  assert.deepEqual(undoAnswer({ status: 'error' }, { ...words, general }), { status: 'error', reason: CampText.SAVE_FAILED, noRetry: true });
  assert.deepEqual(undoAnswer({ status: 'not_allowed' }, { ...words, general }), { status: 'not_allowed', reason: CampText.ROSTER_NOT_ALLOWED });
  assert.deepEqual(undoAnswer({ status: 'refund_stands' }, { ...words, general }), { status: 'refund_stands', reason: words.stale });
  assert.deepEqual(undoAnswer({ status: 'ok' }, { ...words, general }), { status: 'ok' });
  assert.deepEqual(undoAnswer({ status: 'no_access' }, { ...words, general }), { status: 'no_access', noRetry: true }, 'locked while hidden: no Retry on the line\'s bar either');
  assert.deepEqual(undoAnswer({ status: 'no_access' }, words), { status: 'no_access' }, 'not hidden: the usual Retry after the unlock');
});

await checkAsync('R2-05 an Undo the database refused shows its reason with no Retry; one that never reached it shows "Undo didn\'t save" with Retry', async () => {
  const refused = pageLine();
  await refused.line
    .undoAction(async () => undoAnswer({ status: 'stale' }, { notAllowed: 'n', stale: CampText.someoneElseChanged('Zoe Park') }), { words: 'Zoe Park withdrawn' })
    .onAction();
  const bar = refused.bars[refused.bars.length - 1];
  assert.equal(bar.text, 'Someone else changed Zoe Park just now, so nothing was done. Their change is shown.');
  assert.equal(bar.retry, null);
  const lost = pageLine();
  await lost.line.undoAction(async () => undoAnswer({ status: 'error' }, { notAllowed: 'n', stale: 's' }), { words: 'Zoe Park withdrawn' }).onAction();
  const lostBar = lost.bars[lost.bars.length - 1];
  assert.equal(lostBar.text, SharedText.UNDO_DIDNT_SAVE);
  assert.equal(typeof lostBar.retry, 'function');
  // The Close sign-up Undo opens sign-up again, so the line's "Undone" says so (doneText).
  const closed = pageLine();
  const done = await closed.line.undoAction(async () => ({ status: 'ok' }), { words: 'Sign-up closed', doneText: CampText.TOAST_UNDONE_SIGNUP_OPEN }).onAction();
  assert.equal(done.doneText, 'Undone. Sign-up is open again.');
});

await checkAsync('R2-05 reloadBounded: a reload that never answers is given up on after the time; one that throws or answers is passed on; never throws', async () => {
  const started = Date.now();
  assert.equal(await reloadBounded(() => new Promise(() => {}), 20), 'timeout', 'a hung reload resolves after the timeout');
  assert.ok(Date.now() - started < 1000, 'and quickly');
  assert.equal(await reloadBounded(async () => 'ok', 20), 'ok');
  assert.equal(await reloadBounded(async () => 'error', 20), 'error');
  assert.equal(await reloadBounded(async () => { throw new Error('boom'); }, 20), 'error', 'a reload that throws does not break the Undo');
  assert.equal(await reloadBounded(() => { throw new Error('sync'); }, 20), 'error');
  // Through the line: an Undo whose reload hangs still answers "undone" (not the false "Undo didn't save").
  const page = pageLine();
  const answer = await page.line
    .undoAction(async () => { await reloadBounded(() => new Promise(() => {}), 20); return { status: 'ok' }; }, { words: 'Zoe Park withdrawn' })
    .onAction();
  assert.equal(answer.undone, true);
  assert.deepEqual(page.bars, [null]);
});

check('R2-05 the Camps files use the bounded reload in their Undos, name the camp/template in Edit/Add results, and keep a failed Undo\'s bar on a school switch', () => {
  const read = (name) => readFileSync(new URL(`../../screens/${name}`, import.meta.url), 'utf8');
  assert.ok(read('camps/CampPage.jsx').includes('await reloadBounded(reloadQuiet)'));
  assert.ok(read('camps/CampRowMenu.jsx').includes('await reloadBounded(reload)'));
  assert.ok(!/await reload\(\)|await reloadQuiet\(\)/.test(read('camps/CampPage.jsx') + read('camps/CampRowMenu.jsx')), 'no Undo waits on an unbounded reload');
  const dialog = read('camps/CampDialog.jsx');
  for (const kind of ['added', 'camp', 'template']) assert.ok(new RegExp(`onSaved\\(\\{ kind: '${kind}',[^}]*name: payload\\.name`).test(dialog), `${kind}: the saved result carries the name`);
  assert.ok(read('camps/CampsTab.jsx').includes("current?.kind === 'undo' ? current : null"));
  // The dead "someone else changed" / failed-Undo re-exports are gone (the shared sentences replaced them).
  for (const name of ['STALE', 'UNDO_STALE', 'UNDO_FAILED', 'TOAST_UNDONE']) assert.equal(CampText[name], undefined, `${name} is not exported any more`);
  assert.equal(CampText.ROSTER_STALE.length > 0, true);
  // A failed read's bar with a Retry takes focus instead of the name that opened Camper detail.
  const page = read('camps/CampPage.jsx');
  assert.equal((page.match(/leaveDetail\(from, result\.status !== 'error'\)/g) ?? []).length, 5);
  assert.ok(page.includes('focusBarSoon();') && page.includes("focusBarSoon('[data-camp-fill-in], [data-camp-head-more]')"));
});
check('R2-05 / R3-06 / R1-06 / R2-07 the Camps files: one save line, no busy flag of their own, PageBar, the shared back link', () => {
  const read = (name) => readFileSync(new URL(`../../screens/${name}`, import.meta.url), 'utf8');
  const files = {
    'CampPage.jsx': read('camps/CampPage.jsx'),
    'CampRowMenu.jsx': read('camps/CampRowMenu.jsx'),
    'CampsTab.jsx': read('camps/CampsTab.jsx'),
    'TemplatesTab.jsx': read('camps/TemplatesTab.jsx'),
    'Camps.jsx': read('Camps.jsx'),
  };
  for (const [name, source] of Object.entries(files)) {
    assert.ok(!/busyRef|setBusy\(|function begin\(|function end\(|undoBusyRef/.test(source), `${name}: no busy flag of its own`);
    assert.ok(!source.includes('label: T.UNDO'), `${name}: every Undo button is line.undoAction`);
    assert.ok(!source.includes('ev-back'), `${name}: the shared .back-link, not .ev-back`);
    assert.ok(!/revealRetryBar|useRevealRetryBar|cp-bar-slot/.test(source), `${name}: no scroll-to-the-bar helper`);
    assert.ok(!/import ErrorBanner/.test(source), `${name}: the page's bar is a PageBar (a bar inside a box stays an ErrorBanner, in the dialogs' own files)`);
    assert.ok(!/T\.(UNDO_STALE|UNDO_FAILED|STALE)\b/.test(source), `${name}: the refusals name the camper or camp (T.someoneElseChanged)`);
  }
  // The pages each have exactly one line.
  assert.equal((files['CampPage.jsx'].match(/useSaveLine\(/g) ?? []).length, 1);
  assert.equal((files['Camps.jsx'].match(/useSaveLine\(/g) ?? []).length, 1);
  assert.ok(!/useSaveLine\(/.test(files['CampRowMenu.jsx'] + files['CampsTab.jsx'] + files['TemplatesTab.jsx']), 'the hook and the tabs use the page\'s line');
  // The camp page: the back link, the Undo payment box's title with amount and way, T.ROSTER_STALE only as the no-name fallback.
  assert.ok(files['CampPage.jsx'].includes('<BackLink label={T.BACK_TO_CAMPS}'));
  assert.ok(files['CampPage.jsx'].includes('T.undoPaymentTitle(dialog.name, dialog.payment.amountCents, dialog.payment.method)'));
  assert.equal((files['CampPage.jsx'].match(/T\.ROSTER_STALE/g) ?? []).length, 2, 'once in the no-name fallback of hiddenMoneyProblem (and once in its comment)');
  assert.equal((files['CampPage.jsx'].match(/querySelector\('\.back-link'\)/g) ?? []).length, 3, 'the three focus calls (Hide private details, closing a receipt, focus that fell) look for .back-link');
});

// ======================= straight apostrophes and busy day boxes (rulebook v0.752) =======================
check('Camps: every sentence has a straight apostrophe; a busy day box gets the unavailable look (v0.752)', () => {
  // Jeffrey 2026-11-10 (decision 3): apostrophes are straight (') everywhere. Camps' two word files carry
  // no curly one in code (a comment may mention it).
  for (const name of ['screens/camps/text.js', 'camp/text.js']) {
    const source = readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
    const curly = source.split('\n').filter((line) => line.split('//')[0].includes('’'));
    assert.deepEqual(curly, [], `${name}: no curly apostrophe in a sentence`);
  }
  // Decision 4 (v1.131's gray extended to the day boxes): a day box is aria-disabled while a save runs,
  // and the stylesheet gives that state the same gray, white and dashed look as a busy "$X due" tag.
  const roster = readFileSync(new URL('../../screens/camps/CampRoster.jsx', import.meta.url), 'utf8');
  assert.ok(roster.includes("'aria-disabled': busy ? 'true' : undefined"));
  // v1.040: Record refund (like Mark paid) is counted at THIS DEVICE's school — the page sends
  // paymentSchoolFor(deviceLocation) as p_school, never the camper's or the camp's school.
  const page = readFileSync(new URL('../../screens/camps/CampPage.jsx', import.meta.url), 'utf8');
  const refundCall = page.slice(page.indexOf('await recordRefund({'));
  const refundArgs = refundCall.slice(0, refundCall.indexOf('});'));
  assert.ok(refundArgs.includes('school: paymentSchoolFor(deviceLocation)'), 'Record refund sends the device\'s school');
  assert.ok(!/locationCode|camper\.school/.test(refundArgs), 'and never the camper\'s or the camp\'s');
  assert.equal(recordRefundArgs({ camperId: 'c', expectedVersion: 1, method: 'cash', amountCents: 100, refundedOn: '2027-03-04', school: 'shrewsbury' }).p_school, 'shrewsbury');
  const css = readFileSync(new URL('../../styles/camps.css', import.meta.url), 'utf8');
  const rule = css.slice(css.indexOf("button.cp-dc[aria-disabled='true']"));
  assert.ok(rule.startsWith("button.cp-dc[aria-disabled='true'],"), 'the busy day box rule exists');
  const body = rule.slice(0, rule.indexOf('}'));
  for (const part of ['border-style: dashed', 'background: var(--color-bg)', 'color: var(--color-disabled-text)', 'cursor: not-allowed']) assert.ok(body.includes(part), part);
});

// ======================= the family page's camp card has no "Sign up by" line (rulebook v0.753) =======================
check('Family page: the camp card shows only the early-price part; no "Sign up by" line (v0.753)', () => {
  // Jeffrey 2026-11-10: "Remove this bottom line Sign up by November 27". Only the line goes; the camp
  // still closes sign-up on its date (the page's open / closed logic reads signupClosesOn, not this card).
  assert.equal('signUpByPart' in FamilyText, false, 'the word is gone');
  assert.equal(FamilyText.earlyUntilPart('Wednesday, November 18'), 'Early price until Wednesday, November 18');
  const parts = readFileSync(new URL('../../camp/parts.jsx', import.meta.url), 'utf8');
  const partsCode = parts.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n'); // (the comments explain what was removed)
  assert.ok(!/signUpBy|Sign up by/i.test(partsCode), 'the card no longer builds a sign-up-by part');
  // The line (its own row) is drawn only when there is an early-price part: no empty row or gap.
  assert.ok(parts.includes('{earlyLine ? ('), 'the row is left out when there is no early price');
  assert.ok(parts.includes("priceKindToday === 'early' && camp.earlyUntil"), 'and after the early date');
  assert.ok(!parts.includes('byParts'), 'no leftover list of parts');
  // The closing date still decides whether families can sign up.
  const app = readFileSync(new URL('../../camp/CampApp.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes("answer.state === 'closed'") && app.includes("answer.state === 'not_open_yet'"), 'the page still follows the camp\'s sign-up state (closed, not open yet)');
});

// ======================= a both-schools camp names no single school to families (rulebook v0.754) =======================
check('Both-schools camp: no screen, family or staff, says "held at" or gives one school\'s street (v0.754, v0.755)', () => {
  // Jeffrey 2026-11-10: the Worcester students still go to Worcester and the Shrewsbury students to
  // Shrewsbury; merging the two is the school's own decision, so nothing announces it ("Remove it too":
  // the staff screens as well as the form).
  assert.equal(FamilyText.BOTH_SCHOOLS_LINE, 'U.S.T.C. Worcester & Shrewsbury');
  assert.equal('familySchoolLine' in CampText, false, 'one line for everyone: campSchoolLine');
  assert.equal('heldAtLine' in CampText, false);
  assert.equal('HELD_AT' in CampText, false);
  for (const code of ['worcester', 'shrewsbury']) assert.equal(CampText.campSchoolLine({ bothSchools: true, locationCode: code }), 'Both schools');
  assert.equal(CampText.schoolColumn({ bothSchools: true, locationCode: 'worcester' }), 'Both schools');
  // The folded Edit camp summary and the camp page's summary line.
  assert.equal(CampText.campSectionSummary('April Vacation Camp', 'both', 'worcester', 5), 'April Vacation Camp · Both schools · 5 days');
  assert.equal(CampText.campSectionSummary('Veterans Day Camp', 'shrewsbury', 'worcester', 1), 'Veterans Day Camp · Shrewsbury · 1 day');
  assert.ok(!/held at/i.test(CampText.campSummaryLine({ bothSchools: true, locationCode: 'worcester', startTime: '09:00', endTime: '15:00' }, ['2027-04-19'], 3)));
  // The sources: no "held at" wording in code, no street address for a both-schools camp, and the QR card
  // and the receipt use the one line. (Comments may explain what was removed.)
  const code = (name) => readFileSync(new URL(name, import.meta.url), 'utf8').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  for (const name of ['../../camp/text.js', '../../camp/parts.jsx', '../../camp/SignedUp.jsx', '../../screens/camps/text.js', '../../screens/camps/CampsTab.jsx', '../../screens/camps/CampPage.jsx', '../../screens/camps/sections/CampSection.jsx', './campReceipt.js']) {
    assert.ok(!/held at/i.test(code(name).replace(/\/\/.*$/gm, '')), `${name}: no "held at"`);
  }
  assert.ok(!/addressLine\(camp\.address\)/.test(code('../../camp/SignedUp.jsx')) && !code('../../camp/parts.jsx').includes('addressLine('), 'both-schools camps show no street address');
  // (Since 0050 / v0.757 the registration link has one card per school, headed by that school, and the receipt names
  // the camper's own school — see the "one link per school" check below.)
  assert.ok(code('../../screens/camps/CampPage.jsx').includes('heading: T.schoolName(l.school)'), 'the QR card headings');
  assert.ok(code('./campReceipt.js').includes('T.receiptSchoolLine(camp, camperSchool)'), 'the receipt');
  // Edit camp keeps the camp's stored school without asking (no "Held at" choice): the camp's own school stays.
  assert.ok(!code('../../screens/camps/sections/CampSection.jsx').includes('values.heldAt'), 'no Held at field');
});

// ======================= ages: a minimum and no maximum (rulebook v0.756) =======================
check('Ages: Edit camp has one Minimum age box; the family page says "Ages 5 and up" and refuses only younger children (v0.756)', () => {
  // Jeffrey 2026-11-11: "For ages, have a minimum age but no max. We assume no adults will come."
  const blank = blankValues('2026-11-05', 'worcester');
  assert.equal(blank.minAge, '3');
  assert.equal('maxAge' in blank, false, 'no maximum box value');
  const asked = (over) => checkForm({ ...blank, waiverText: 'I agree.', ...over }, { mode: 'add', today: '2026-11-05', initialDays: [], server: {} });
  assert.equal(asked({ minAge: '' }).errors.minAge, 'Enter an age');
  assert.equal(asked({ minAge: '0' }).errors.ages, 'Enter an age from 1 to 99.');
  assert.equal(asked({ minAge: '100' }).errors.ages, 'Enter an age from 1 to 99.');
  assert.equal(asked({ minAge: '5' }).errors.minAge, undefined);
  assert.equal(asked({ minAge: '5' }).sections[5].summary, 'Ages 5 and up · description and waiver');
  assert.equal(asked({ minAge: '5', fromTemplateName: 'Summer week' }).sections[5].summary, 'Ages 5 and up · description and waiver from the template');
  // The words: the family card and the family page's refusal.
  assert.equal(FamilyText.agesLine(5), 'Ages 5 and up');
  assert.equal(FamilyText.agesFor(5), 'This camp is for ages 5 and up.');
  for (const gone of ['AGES_ACCEPTED', 'AGES_FROM', 'AGES_TO', 'AGES_ORDER', 'FAMILY_AGES_PROBLEM']) assert.equal(gone in CampText, false, gone);
  // The database still stores a maximum for every camp: the app always sends 99 ("no maximum").
  const code = (name) => readFileSync(new URL(name, import.meta.url), 'utf8').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.ok(code('../../screens/camps/sections/campForm.js').includes('maxAge: NO_MAX_AGE'));
  assert.ok(!/maxAge/.test(code('../../screens/camps/sections/FamilyFormSection.jsx')), 'one box, no maximum');
  assert.ok(!/maxAge/.test(code('../../camp/parts.jsx') + code('../../camp/form.js') + code('../../camp/text.js')), 'the family page never reads a maximum');
});

// ======================= one link and one roster per school (migration 0050, rulebook v0.757) =======================
check('mock (0050): a both-schools camp has a second link; a sign-up carries the school of the link; the roster has it', () => {
  const { backend: b } = makeBackend({ today: '2027-03-10', clock: Date.parse('2027-03-10T14:00:00Z') });
  const camps = toCamel(rows(b, 'camps', 'id, name, location_code, both_schools, public_code, public_code_2'));
  const april = camps.find((c) => c.name === 'April Vacation Camp');
  const veterans = camps.find((c) => c.name === 'Veterans Day Camp');
  assert.equal(april.bothSchools, true);
  assert.match(april.publicCode2, /^[a-hjkmnp-z2-9]{8}$/);
  assert.notEqual(april.publicCode2, april.publicCode);
  assert.equal(veterans.bothSchools, false);
  assert.equal(veterans.publicCode2, null); // a camp for one school has one link
  // campLinks: the camp's own link is for its stored school, the second for the other; Worcester first.
  assert.deepEqual(campLinks(april), [{ school: 'worcester', code: april.publicCode }, { school: 'shrewsbury', code: april.publicCode2 }]);
  assert.deepEqual(campLinks({ ...april, locationCode: 'shrewsbury' }), [{ school: 'worcester', code: april.publicCode2 }, { school: 'shrewsbury', code: april.publicCode }]);
  assert.deepEqual(campLinks(veterans), [{ school: veterans.locationCode, code: veterans.publicCode }]);
  assert.deepEqual(campLinks(null), []);
  assert.equal(otherSchool('worcester'), 'shrewsbury');
  // Both links open the same camp, and the answer names neither school's link nor any school choice.
  const one = b.publicCamp(april.publicCode);
  const two = b.publicCamp(april.publicCode2);
  assert.equal(one.status, 'ok');
  assert.deepEqual(two, one);
  assert.equal(JSON.stringify(one).includes(april.publicCode2), false);
  assert.equal(b.publicCamp('zzzzzzzz').status, 'not_found');
  // A sign-up through each link: the school of that link.
  const [d1] = one.camp.days.map((d) => d.day_id);
  const kid = (first) => ({ first_name: first, last_name: 'Tester', age: 8, member: false, day_ids: [d1], extras: [] });
  const signUp = (code, first) => {
    const probe = b.publicSignup(signupArgs(b, code, [kid(first)]));
    assert.equal(probe.status, 'price_changed');
    const done = b.publicSignup(signupArgs(b, code, [kid(first)], { expected_total_cents: probe.new_total_cents }));
    assert.equal(done.status, 'ok');
    return done;
  };
  signUp(april.publicCode, 'Wanda');
  signUp(april.publicCode2, 'Sheldon');
  const roster = toCamel(rows(b, 'camp_roster', 'id, first_name, school, camp_id, status', [{ col: 'camp_id', value: april.id }]));
  assert.equal(roster.find((r) => r.firstName === 'Wanda').school, april.locationCode);
  assert.equal(roster.find((r) => r.firstName === 'Sheldon').school, otherSchool(april.locationCode));
  assert.equal(roster.every((r) => SCHOOL_CODES.includes(r.school)), true, 'every camper has a school (the seeded ones too)');
  // Fill in: This device's school (p_school); blank = the camp's own; an unknown school, or another school on a camp for ONE school, is refused.
  const camp = b.publicCamp(april.publicCode);
  const deskBody = (first) => ({
    submission_id: randomUUID(), children: [kid(first)],
    parent: { name: 'Sarah Carter', phone: '5085550142', relation: 'Mother' }, emergency: { name: 'Tom Carter', phone: '5085550187', relation: 'Uncle' },
    paying_by: 'cash', acknowledged: true, signature: 'data:image/png;base64,iVBORw0KGgo=', ack_version: CAMP_ACK_VERSION,
    waiver_version: camp.waiver_version, expected_total_cents: 0,
  });
  const desk = (campId, first, school) => {
    const probe = rpcOk(b, 'camp_staff_signup', staffSignupArgs(campId, deskBody(first), school), STAFF);
    if (probe.status !== 'price_changed') return probe;
    const body = { ...deskBody(first), expected_total_cents: probe.new_total_cents };
    return rpcOk(b, 'camp_staff_signup', staffSignupArgs(campId, body, school), STAFF);
  };
  assert.equal(desk(april.id, 'Dora', 'shrewsbury').status, 'ok');
  assert.equal(desk(april.id, 'Dave', null).status, 'ok');
  assert.deepEqual(desk(april.id, 'Dina', 'boston'), { status: 'invalid', field: 'school' });
  const after = toCamel(rows(b, 'camp_roster', 'first_name, school', [{ col: 'camp_id', value: april.id }]));
  assert.equal(after.find((r) => r.firstName === 'Dora').school, 'shrewsbury');
  assert.equal(after.find((r) => r.firstName === 'Dave').school, april.locationCode); // blank = the camp's own school
  assert.equal(after.some((r) => r.firstName === 'Dina'), false);
  // A camp for one school: its own school, and no other.
  const vetPub = b.publicCamp(veterans.publicCode);
  assert.equal(vetPub.status, 'ok');
  const vetKid = { first_name: 'Vic', last_name: 'Tester', age: 8, member: false, day_ids: [vetPub.camp.days[0].day_id], extras: [] };
  const vetBody = (total) => ({ ...deskBody('Vic'), children: [vetKid], waiver_version: vetPub.waiver_version, expected_total_cents: total });
  assert.deepEqual(rpcOk(b, 'camp_staff_signup', staffSignupArgs(veterans.id, vetBody(0), otherSchool(veterans.locationCode)), STAFF), { status: 'invalid', field: 'school' });
  // The sign-up's school can't be set from the app (no grant on the column) — it is only the roster's.
  assert.equal(b.select('camp_signups', 'school', [], [], ADMIN).error.code, '42501');
});

check('0050: Add camp makes the second link for a both-schools camp only; an old store is upgraded; counts, rows and receipt follow the school', () => {
  const { backend: b } = makeBackend({ today: '2027-05-01', clock: Date.parse('2027-05-01T14:00:00Z') });
  const both = rpcOk(b, 'camp_add_camp', addCampArgs('2027-06-07', { p_both_schools: true }));
  const single = rpcOk(b, 'camp_add_camp', addCampArgs('2027-07-12'));
  const codes = (id) => rows(b, 'camps', 'public_code, public_code_2', [{ col: 'id', value: id }])[0];
  assert.match(codes(both.id).public_code_2, /^[a-hjkmnp-z2-9]{8}$/);
  assert.notEqual(codes(both.id).public_code_2, codes(both.id).public_code);
  assert.equal(codes(single.id).public_code_2, null);
  // A saved version-5 store (no school, no second link) becomes version 6 the way 0050 leaves the real tables.
  const old = defaultCampsData({ today: '2027-03-10' });
  old.schema = 5;
  for (const c of old.camps) delete c.public_code_2;
  for (const s of old.camp_signups) delete s.school;
  let saved = old;
  const b6 = createCampsBackend({ loadStore: () => saved, saveStore: (s) => { saved = s; }, now: () => Date.parse('2027-03-10T14:00:00Z'), today: () => '2027-03-10', newId: () => randomUUID() });
  const upgraded = toCamel(rows(b6, 'camps', 'name, location_code, both_schools, public_code, public_code_2'));
  assert.equal(upgraded.every((c) => (c.bothSchools ? /^[a-hjkmnp-z2-9]{8}$/.test(c.publicCode2) : c.publicCode2 === null)), true);
  assert.equal(new Set(upgraded.flatMap((c) => [c.publicCode, c.publicCode2]).filter(Boolean)).size, upgraded.flatMap((c) => [c.publicCode, c.publicCode2]).filter(Boolean).length, 'no code is used twice');
  const upRoster = toCamel(rows(b6, 'camp_roster', 'school, camp_id'));
  assert.equal(upRoster.length > 0 && upRoster.every((r) => SCHOOL_CODES.includes(r.school)), true);
  // The school helpers.
  const camp = { bothSchools: true, locationCode: 'worcester' };
  const list = [{ id: 'a', campId: 'c', status: 'active', school: 'worcester' }, { id: 'b', campId: 'c', status: 'active', school: 'shrewsbury' },
    { id: 'd', campId: 'c', status: 'withdrawn', school: 'shrewsbury' }, { id: 'e', campId: 'x', status: 'active', school: 'shrewsbury' }];
  assert.deepEqual(rowsForSchool(list, camp, 'worcester').map((r) => r.id), ['a']);
  assert.deepEqual(rowsForSchool(list, camp, 'shrewsbury').map((r) => r.id), ['b', 'd', 'e']);
  assert.equal(rowsForSchool(list, camp, 'both').length, 4);
  assert.equal(rowsForSchool(list, { bothSchools: false, locationCode: 'worcester' }, 'shrewsbury').length, 4); // a one-school camp shows everyone
  assert.equal(rowSchool({ school: null }, camp), 'worcester');
  assert.equal(rowSchool({ school: 'shrewsbury' }, camp), 'shrewsbury');
  assert.deepEqual(campCounts(list), { c: 2, x: 1 });
  assert.deepEqual(campCounts(list, { location: 'worcester', bothCampIds: new Set(['c']) }), { c: 1, x: 1 }); // 'x' is a one-school camp: counted whole
  assert.deepEqual(campCounts(list, { location: 'both', bothCampIds: new Set(['c']) }), { c: 2, x: 1 });
  assert.equal(CampText.receiptSchoolLine(camp, 'shrewsbury'), 'Shrewsbury');
  assert.equal(CampText.receiptSchoolLine(camp, null), 'Worcester');
  assert.equal(CampText.receiptSchoolLine({ bothSchools: false, locationCode: 'worcester' }, 'shrewsbury'), 'Worcester');
  // The screens: the link box lists a card per school, the roster follows the switcher, Print roster too, Fill in sends the device's school.
  const code = (name) => readFileSync(new URL(name, import.meta.url), 'utf8').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  const page = code('../../screens/camps/CampPage.jsx');
  assert.ok(page.includes('campLinks(camp)') && page.includes('links={links}'));
  assert.ok(page.includes('rowsForSchool(roster, camp, locationKey)') && page.includes('showSchool={showSchool}'));
  assert.ok(page.includes('deskSchool: camp?.bothSchools ? paymentSchoolFor(deviceLocation) : null'));
  assert.ok(code('../../screens/camps/FillInDialog.jsx').includes('staffSignup(campId, body, deskSchool)'));
  assert.ok(code('../../screens/camps/PrintRoster.jsx').includes('rowsForSchool(data.roster ?? [], camp, data.school)'));
  assert.ok(code('../../screens/camps/CampRowMenu.jsx').includes('school: locationKey'));
  assert.ok(code('../../lib/camps/campsApi.js').includes("'camp_id, status, school'"));
  // A possible duplicate across the two schools' links (the same name signed up through both): its pair is built from every
  // active row and shown when either family is on this roster, and the compare box says each family's school.
  assert.ok(page.includes("findPairs(roster.filter((r) => r.status === 'active')).filter("), 'pairs come from the full roster');
  const pairRows = [{ id: 'p', school: 'worcester', createdAt: '2027-03-01T10:00:00Z', days: [], extras: [], reference: 'CP-1', totalCents: 0, paidCents: 0 },
    { id: 'q', school: 'shrewsbury', createdAt: '2027-03-02T10:00:00Z', days: [], extras: [], reference: 'CP-2', totalCents: 0, paidCents: 0 }];
  const cmp = compareRows(pairRows[0], pairRows[1], [], false);
  assert.deepEqual(cmp.find((r) => r.key === 'school'), { key: 'school', label: 'School', first: 'Worcester', second: 'Shrewsbury', plain: true });
  assert.equal(compareRows(pairRows[0], { ...pairRows[1], school: 'worcester' }, [], false).some((r) => r.key === 'school'), false, 'the same school: no school row');
  // The printed roster of one school says that school; on Both each name carries its school.
  const print = code('../../screens/camps/PrintRoster.jsx');
  assert.ok(print.includes('sheetCamp') && print.includes('nameSchool'));
});

console.log(`${count} groups of checks ran.`);
console.log('ALL CAMPS LIB CHECKS PASSED');
