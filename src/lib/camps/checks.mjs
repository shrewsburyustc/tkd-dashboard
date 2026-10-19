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
  childProblem, offsetsAreValid, todayInSchoolTime, campTextIsValid, normalizeCampText,
} from './campRules.js';
import { qrFileName, campQrSvgDataUrl, campLink as qrCampLink } from './qr.js';
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
  assert.equal(MAX_DAYS, 10);
  assert.equal(MAX_EXTRAS, 10);
  assert.equal(MAX_CHILDREN, 3);
  assert.equal(MAX_CAMPER_CENTS, 200000);
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
  { extraId: DROP, name: 'Early drop-off', priceCents: 1500, per: 'day', notForAllDays: false, sort: 0 },
  { extraId: PICK, name: 'Late pick-up', priceCents: 800, per: 'day', notForAllDays: false, sort: 1 },
  { extraId: PIZZA, name: 'Pizza party (Fri)', priceCents: 500, per: 'once', notForAllDays: true, sort: 2 },
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
  // P3 Ethan: Mon, Thu, Fri · member · early · drop-off ×3, pizza → $195 + $45 + $5
  const ethan = child([MON, THU, FRI], true, [{ extraId: DROP, dayIds: [MON, THU, FRI] }, { extraId: PIZZA, dayIds: [] }]);
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
  assert.equal(problem(child(DAY_IDS, true, [{ extraId: PIZZA, dayIds: [] }]), 'early'), 'not_for_all_days');
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
  assert.equal(problem(child([MON], true, [{ extraId: PIZZA, dayIds: [MON] }]), 'early'), 'once_with_days');
  assert.equal(problem(child([MON], true, [{ extraId: DROP, dayIds: [] }]), 'early'), 'no_extra_days');
  assert.equal(problem(child([MON], true, [{ extraId: DROP, dayIds: [TUE] }]), 'early'), 'extra_day_not_child_day');
  assert.equal(problem(child([MON, FRI], true, [{ extraId: PIZZA, dayIds: [] }]), 'early'), null); // not all days: fine
  assert.equal(isAllDays(DAY_IDS, APRIL_DAYS), true);
  assert.equal(isAllDays([MON, TUE], APRIL_DAYS), false);
  assert.equal(isAllDays([], []), false);
  // Over $2,000 for one camper
  const costly = [{ extraId: DROP, name: 'Costly', priceCents: 100000, per: 'day', notForAllDays: false, sort: 0 }];
  assert.equal(childProblem(child([MON, TUE], true, [{ extraId: DROP, dayIds: [MON, TUE] }]), APRIL_PRICES, costly, APRIL_DAYS, 'early'), 'too_expensive');
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
  assert.equal(checkInRule('2027-04-21', '2027-04-21', false), 'allowed');
  assert.equal(checkInRule('2027-04-20', '2027-04-21', false), 'admin_only');
  assert.equal(checkInRule('2027-04-20', '2027-04-21', true), 'allowed');
  assert.equal(checkInRule('2027-04-22', '2027-04-21', true), 'future');
  assert.equal(checkInRule({ day: '2027-04-22' }, '2027-04-21', false), 'future');
  const base = { duplicateState: 'none', paidCents: 16600, owesCents: 0, extras: [
    { extraId: DROP, name: 'Early drop-off', per: 'day', dayId: MON, day: '2027-04-19', priceCents: 1500 },
    { extraId: PICK, name: 'Late pick-up', per: 'day', dayId: MON, day: '2027-04-19', priceCents: 800 },
    { extraId: PICK, name: 'Late pick-up', per: 'day', dayId: WED, day: '2027-04-21', priceCents: 800 },
    { extraId: PIZZA, name: 'Pizza party (Fri)', per: 'once', dayId: null, day: null, priceCents: 500 },
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
  assert.deepEqual(camps.map((c) => c.name), ['Columbus Day Camp', 'Veterans Day Camp', 'Thanksgiving Camp', 'Winter Break Camp', 'April Vacation Camp']);
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
  // Columbus Day (Oct 12, past): 9 campers, all checked in. Veterans 16, Thanksgiving 12, Winter 0.
  const counts = campCounts(toCamel(rows(b2, 'camp_roster', 'camp_id, status')));
  assert.deepEqual(camps.map((c) => counts[c.id] ?? 0), [9, 16, 12, 0, 19]);
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
  assert.equal(rpcOk(b, 'camp_mark_paid', { p_camper_id: randomUUID(), p_expected_version: 1 }, LOCKED).status, 'no_access');
  assert.equal(rpcOk(b, 'camp_delete_template', { p_template_id: randomUUID(), p_expected_version: 1 }, STAFF).status, 'not_allowed');
  assert.equal(b.rpc('camp_mark_paid', { p_camper_id: 'nope', p_expected_version: 1 }, ADMIN).error.code, '22P02');
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
      { name: 'Early drop-off', price_cents: 1500, per: 'day', not_for_all_days: false },
      { name: 'Pizza party', price_cents: 500, per: 'once', not_for_all_days: true },
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

  // Check in: staff today ok; staff yesterday not_allowed; tomorrow future_day; admin yesterday ok.
  env.today = '2027-06-08'; // the second day
  assert.equal(rpcOk(b, 'camp_check_in', { p_camper_id: r.id, p_day_id: d2 }, STAFF).status, 'ok');
  const again = rpcOk(b, 'camp_check_in', { p_camper_id: r.id, p_day_id: d2 }, STAFF);
  assert.equal(again.already, true);
  assert.equal(rpcOk(b, 'camp_check_in', { p_camper_id: r.id, p_day_id: d1 }, STAFF).status, 'not_allowed');
  assert.equal(rpcOk(b, 'camp_check_in', { p_camper_id: r.id, p_day_id: d3 }, ADMIN).status, 'not_found'); // not one of Mia's days
  assert.equal(rpcOk(b, 'camp_check_in', { p_camper_id: r.id, p_day_id: d1 }, ADMIN).status, 'ok');
  assert.equal(roster()[0].version, r.version); // check-in never bumps the camper's version
  assert.equal(rpcOk(b, 'camp_undo_check_in', { p_camper_id: r.id, p_day_id: d1 }, STAFF).status, 'not_allowed');
  env.today = '2027-06-06';
  assert.equal(rpcOk(b, 'camp_check_in', { p_camper_id: r.id, p_day_id: d1 }, ADMIN).status, 'future_day');
  env.today = '2027-06-08';

  // Mark paid = owes; a second click with the old version → stale; then already_paid.
  const paid = rpcOk(b, 'camp_mark_paid', { p_camper_id: r.id, p_expected_version: r.version }, STAFF);
  assert.equal(paid.status, 'ok');
  assert.equal(paid.amount_cents, 18500);
  assert.equal(paid.method, 'cash');
  assert.equal(rpcOk(b, 'camp_mark_paid', { p_camper_id: r.id, p_expected_version: r.version }, STAFF).status, 'stale');
  assert.equal(rpcOk(b, 'camp_mark_paid', { p_camper_id: r.id, p_expected_version: paid.version }, STAFF).status, 'already_paid');
  // Staff Undo within 10 s works; after 10 s only an admin.
  const undone = rpcOk(b, 'camp_undo_payment', { p_payment_id: paid.payment_id }, STAFF);
  assert.equal(undone.status, 'ok');
  assert.equal(rpcOk(b, 'camp_undo_payment', { p_payment_id: paid.payment_id }, ADMIN).status, 'stale'); // already undone
  const paid2 = rpcOk(b, 'camp_mark_paid', { p_camper_id: r.id, p_expected_version: undone.version }, STAFF);
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
  // Removing a checked-in day → checked_in; a pizza for an all-days camper → invalid; > $2,000 → invalid.
  assert.deepEqual(rpcOk(b, 'camp_update_details', details(more.camper_version, more.signup_version, { p_day_ids: [d1, d3] }), STAFF), { status: 'checked_in', day: '2027-06-08' });
  assert.equal(rpcOk(b, 'camp_update_details', details(more.camper_version, more.signup_version, { p_day_ids: [d1, d2, d3], p_extras: [{ extra_id: pizza, day_ids: [] }] }), STAFF).status, 'invalid');
  assert.equal(rpcOk(b, 'camp_update_details', details(more.camper_version, more.signup_version, { p_parent_phone: '508-555' }), STAFF).status, 'invalid');
  assert.equal(rpcOk(b, 'camp_update_details', details(1, 1), STAFF).status, 'stale');
  // Fewer days after paying more → owes < 0 → still Paid (overpaid).
  r = roster()[0];
  const pay3 = rpcOk(b, 'camp_mark_paid', { p_camper_id: r.id, p_expected_version: r.version }, STAFF);
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
    p_prices: addCampArgs('2027-06-07').p_prices, p_extras: addCampArgs('2027-06-07').p_extras, p_description: null, p_waiver_text: 'I agree.', ...o,
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
      { children: [] }, { expected_total_cents: 700000 }, { parent: { name: 'x', phone: '1'.repeat(21), relation: 'y' } },
    ]) assert.equal((await previewApi.signUp(code, body(bad))).status, 'bad_request', JSON.stringify(bad));
    const bigKid = body().children[0];
    assert.equal((await previewApi.signUp(code, body({ children: [bigKid, bigKid, bigKid, bigKid] }))).status, 'bad_request');
    assert.equal((await previewApi.signUp(code, body({ children: [{ ...bigKid, age: 9.5 }] }))).status, 'bad_request');
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
