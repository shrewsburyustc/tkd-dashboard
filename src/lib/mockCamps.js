// mockCamps.js — the PREVIEW (fake) database for Camps (contract 0013 §5.4).
// Why it exists: preview mode (npm run dev:preview-mode) runs without Supabase. This file pretends
// to be what migration 0013 adds: the camp tables, the camp_roster view, the staff functions, the
// two public functions the family sign-up page uses, and the same rules — the same order of
// checks, the same status codes, the same staff / admin splits, the 10-second Undo windows, the
// check-in day rule, duplicates, the re-price rule, camp_changed / price_changed, the 30-tries-per-
// hour limit and the 3-year signature clean-up. What you see in preview is what the real
// dashboard will do. The money and date rules come from campRules.js (the SQL twins' JS twin).
//
// Like mockTestingEvents.js it is a "pure core": it never touches the browser by itself.
//   const camps = createCampsBackend({ loadStore, saveStore, now, today, newId, locations });
//     loadStore()  → the saved store object (mockClient: localStorage 'tkd.preview.camps'), or
//                    null / damaged → the default data below
//     saveStore()  → saves the whole store
//     now()        → milliseconds (timestamps, the Undo windows, the rate limit)
//     today()      → 'YYYY-MM-DD' in school time (setToday / campWeek can pretend another date)
//     newId()      → a new uuid
//     locations()  → the schools [{ code, name, address_street, address_city, address_state,
//                    address_zip }] (Settings → Schools in the Testing store); optional
//   camps.select(table, columns, filters, orders, ctx)   filters: [{ col, value, op:'eq'|'in' }]
//   camps.rpc(name, args, ctx)   ctx = { signedIn, hasDataAccess, isAdmin, actorName, userId }
//   camps.publicCamp(code) / camps.publicSignup({...}) — what camps_registrar may call
//
// The store is RE-READ ON EVERY CALL (no copy is kept in memory), so the staff tab and the family
// page open in another tab always see each other's changes.
//
// Store (schema version 4 — version 2 added the extras' only_on / only_weekdays, owner decision
// 2026-10-19 "pizza on Wed and Fri"; version 3 the payments' school, v0.707; version 4 weekly
// pricing, rulebook v0.717: a camp's price grid has rows 1…W, W = the most camp days in one
// Monday–Sunday week, and a template's day_count means "days per week" 1–7. A saved version-3
// store is UPGRADED (grids cut to 1…W, see upgradeStore); anything older is replaced by the
// default data), column
// names are the database's (snake_case):
//   camps, camp_days, camp_prices, camp_extras, camp_templates, camp_signups, camp_campers,
//   camp_camper_days, camp_camper_extras, camp_payments, camp_public_attempts,
//   next_reference (the CP- number sequence), next_attempt_id
import { normalizeName, nameProblem, nameKey } from './testing/names.js';
import { signatureIsValid } from './testing/eventRules.js';
import {
  CAMP_ACK_VERSION, PAYING_BY, MAX_CAMPER_CENTS, CAMP_TRIES_PER_HOUR, UNDO_WINDOW_MS, SIGNATURE_KEEP_YEARS,
  MAX_DAYS, MAX_EXTRAS, MAX_CHILDREN, AGE_LIMITS, DESCRIPTION_MAX, WAIVER_MAX, EXTRA_NAME_MAX, RELATION_MAX,
  signupState, priceKind, priceChild, childProblem, offsetsAreValid, templateFromCamp, gridSizeFor, campWeeks, baseCents,
  MAX_WEEK_DAYS,
  extraOfferedOn, onlyOnToWeekdays, weekdaysToOnlyOn, extraDaysRemoved,
  normalizeCampText, campTextIsValid, isIsoDate, addDays, todayInSchoolTime, lastDay, firstDay, SCHOOL_TIME_ZONE,
} from './camps/campRules.js';

const SCHEMA_VERSION = 4;
const LOCATION_CODES = ['worcester', 'shrewsbury'];
const REFERENCE_START = 4001; // CP-4001 is the first reference the database makes (§1.7)
const ATTEMPT_KEEP_MS = 2 * 24 * 60 * 60 * 1000; // rate-limit rows older than 2 days are removed
const HOUR_MS = 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[a-hjkmnp-z2-9]{8}$/;
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no i, l, o, 0, 1 (look-alikes)
const INT_MAX = 2147483647;
const MAX_PAYMENT_CENTS = MAX_CAMPER_CENTS; // one payment: 1 … $10,000 (§1.11; weekly pricing R5, was $2,000)
const FAMILY_FORM = 'Family form'; // the actor label of the public sign-up

// ----- MD5 (the waiver_version is md5(waiver_text), 32 hex characters, §1.16) -----
// The database uses PostgreSQL's md5(); this is the same standard algorithm, so the preview gives
// the same 32 characters the real database will. (Only used to notice a changed waiver.)
const MD5_SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
export function md5(text) {
  const input = new TextEncoder().encode(String(text)); // the text's UTF-8 bytes, like PostgreSQL
  const length = Math.ceil((input.length + 9) / 64) * 64; // + the 0x80 byte + 8 length bytes
  const bytes = new Uint8Array(length);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const bits = input.length * 8;
  const view = new DataView(bytes.buffer);
  view.setUint32(length - 8, bits >>> 0, true);
  view.setUint32(length - 4, Math.floor(bits / 2 ** 32), true);
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let offset = 0; offset < length; offset += 64) {
    const m = Array.from({ length: 16 }, (_, i) => view.getUint32(offset + i * 4, true));
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i += 1) {
      let f;
      let g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const shift = MD5_SHIFTS[Math.floor(i / 16) * 4 + (i % 4)];
      const sum = (a + f + MD5_K[i] + m[g]) >>> 0;
      [a, d, c] = [d, c, b];
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((word, i) => out.setUint32(i * 4, word, true));
  return Array.from(new Uint8Array(out.buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// ----- School clock time → timestamp (for the default data) -----
// A clock time at the school ('2027-03-03', '20:52') → an ISO timestamp. Massachusetts is UTC−5 in
// winter and UTC−4 in summer; this tries both and keeps the one that reads back as that time.
const SCHOOL_CLOCK_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export function schoolClockToIso(dateIso, hhmm) {
  const asUtc = Date.parse(`${dateIso}T${hhmm}:00Z`);
  for (const hours of [5, 4]) {
    const ms = asUtc + hours * HOUR_MS;
    const parts = Object.fromEntries(SCHOOL_CLOCK_FORMAT.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
    if (`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` === `${dateIso}T${hhmm}`) return new Date(ms).toISOString();
  }
  return new Date(asUtc + 5 * HOUR_MS).toISOString();
}

// ----- Default preview data (§5.4) = the approved mockups' camps, campers and templates -----

const pad12 = (n) => String(n).padStart(12, '0');
const fixedId = (kind, n) => `000013${kind}-0000-4000-8000-${pad12(n)}`; // kind = 2 hex characters
const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000001'; // Jeffrey (mockClient's FAKE_STAFF)
const DESK_USER_ID = '00000000-0000-4000-8000-0000000000d1'; // the shared front-desk sign-in
// A tiny valid PNG (1×1 pixel) standing in for a drawn signature.
const SAMPLE_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export const DEFAULT_CAMP_CODES = {
  columbus: 'cb8d2wqr', veterans: 'vt4n7hzs', thanksgiving: 'thx9kv3m', winter: 'wn6y3fjr', april: 'k7m2qp4x',
  summer: 'sm2w8kxe',
};

const WAIVER = 'I give permission for my child to take part in camp at Jae H. Jeong’s U.S. Taekwondo Center, including Taekwondo, games and outdoor play. I understand that physical activity can lead to injury, and I release the school and its staff from claims arising from normal camp activities. In an emergency, I allow staff to get medical care for my child if I can’t be reached.';
const DESC_WEEK = 'A week of Taekwondo, games and crafts while school is out, with a pizza party on Friday. Bring a lunch, a water bottle and comfortable clothes.';
const DESC_TWO = 'Two days of Taekwondo, games and crafts while school is out. Bring a lunch, a water bottle and comfortable clothes.';
const DESC_ONE = 'A day of Taekwondo, games and crafts while school is out. Bring a lunch, a water bottle and comfortable clothes.';
const DESC_WINTER = 'Three days of Taekwondo, games and crafts over the winter break. Bring a lunch, a water bottle and comfortable clothes.';

// Price grids: [day count, member early, member regular, non-member early, non-member regular] in dollars.
const GRID_ONE = [[1, 70, 75, 80, 85]];
const GRID_TWO = [[1, 75, 80, 85, 90], [2, 140, 150, 150, 160]];
const GRID_THREE = [...GRID_TWO, [3, 195, 210, 205, 220]];
const GRID_WEEK = [...GRID_THREE, [4, 260, 280, 270, 290], [5, 275, 325, 285, 335]];
// Extras: [name, dollars, per, not charged to all-days campers, offered only on these ISO weekdays
// (1 = Mon … 7 = Sun; [] = every day)].
const DROP = ['Early drop-off, 7:30–9:00 AM', 15, 'day', false, []];
const PICK = ['Late pick-up, 3:00–4:00 PM', 8, 'day', false, []];
const PIZZA = ['Pizza party', 5, 'day', true, [3, 5]]; // Wed and Fri only (owner decision 2026-10-19)
const LUNCH = ['Pizza lunch', 6, 'once', false, []];

const gridRows = (grid) => grid.map(([n, me, mr, ne, nr]) => ({
  day_count: n, member_early_cents: me * 100, member_regular_cents: mr * 100, nonmember_early_cents: ne * 100, nonmember_regular_cents: nr * 100,
}));
// A camp's extra row (only_on = the camp dates on those weekdays) and a template's extra (only_weekdays).
const extraJson = ([name, dollars, per, notForAllDays, weekdays], campDays) => ({
  name, price_cents: dollars * 100, per, not_for_all_days: notForAllDays, only_on: weekdaysToOnlyOn(weekdays, campDays),
});
const templateExtraJson = ([name, dollars, per, notForAllDays, weekdays]) => ({
  name, price_cents: dollars * 100, per, not_for_all_days: notForAllDays, only_weekdays: [...weekdays],
});

// The camps. days = the camp's days; extras = indexes into the camp's extras below.
const DEFAULT_CAMPS = [
  {
    key: 'columbus', name: 'Columbus Day Camp', location: 'worcester', both: false, days: ['2026-10-12'],
    opens: '2026-09-21', closes: '2026-10-11', early: '2026-10-05', ages: [5, 12], grid: GRID_ONE,
    extras: [DROP, PICK, LUNCH], description: DESC_ONE, made: ['2026-09-14', '10:00'],
  },
  {
    key: 'veterans', name: 'Veterans Day Camp', location: 'worcester', both: false, days: ['2026-11-11'],
    opens: '2026-10-01', closes: '2026-11-10', early: '2026-11-04', ages: [5, 12], grid: GRID_ONE,
    extras: [DROP, PICK, LUNCH], description: DESC_ONE, closedByHand: true, made: ['2026-09-25', '10:00'],
  },
  {
    key: 'thanksgiving', name: 'Thanksgiving Camp', location: 'worcester', both: false, days: ['2026-11-25', '2026-11-27'],
    opens: '2026-10-05', closes: '2026-11-24', early: '2026-11-18', ages: [5, 12], grid: GRID_TWO,
    extras: [DROP, PICK], description: DESC_TWO, made: ['2026-09-28', '10:00'],
  },
  {
    key: 'winter', name: 'Winter Break Camp', location: 'shrewsbury', both: false, days: ['2026-12-28', '2026-12-29', '2026-12-30'],
    opens: '2026-11-30', closes: '2026-12-27', early: '2026-12-21', ages: [5, 12], grid: GRID_THREE,
    extras: [DROP, PICK], description: DESC_WINTER, made: ['2026-10-10', '10:00'],
  },
  {
    key: 'april', name: 'April Vacation Camp', location: 'worcester', both: true,
    days: ['2027-04-19', '2027-04-20', '2027-04-21', '2027-04-22', '2027-04-23'],
    opens: '2027-03-01', closes: '2027-04-18', early: '2027-04-12', ages: [5, 12], grid: GRID_WEEK,
    extras: [DROP, PICK, PIZZA], description: DESC_WEEK, made: ['2026-10-16', '10:00'],
  },
  {
    // Crosses two calendar weeks (Mon Jul 5 – Fri Jul 16, 2027): the roster shows Week 1 | Week 2.
    key: 'summer', name: 'Two-Week Summer Camp', location: 'worcester', both: false,
    days: ['2027-07-05', '2027-07-06', '2027-07-07', '2027-07-08', '2027-07-09', '2027-07-12', '2027-07-13', '2027-07-14', '2027-07-15', '2027-07-16'],
    // Weekly pricing (v0.717): 5 rows (Mon–Fri), each week priced on its own and the weeks added up.
    opens: '2027-05-03', closes: '2027-07-04', early: '2027-06-14', ages: [5, 12], grid: GRID_WEEK,
    extras: [DROP, PICK, PIZZA], description: 'Two weeks of Taekwondo, games, crafts and outdoor play. Bring a lunch, a water bottle, sunscreen and comfortable clothes.',
    made: ['2026-10-20', '10:00'],
  },
];

// The campers. [first, last, age, member, day indexes ('all' = every day), extras
// [[extra index, day indexes | null for a once extra]], paying by, signed up [date, time], reference,
// options]. options: paid { cents?, on, at, desk } (cents left out = the full total), checkins
// { dayIndex: 'HH:MM' }, family [parent, relation, phone, contact, relation, phone],
// duplicateOfRef, withdrawn [date, time].
const D = (...list) => list; // a short way to write a list of day indexes
const DEFAULT_CAMPERS = {
  april: [
    ['Ava', 'Thompson', 8, true, 'all', [[0, 'all'], [1, 'all']], 'check', ['2027-03-03', '20:52'], 4815,
      { paid: { on: '2027-03-10', at: '16:05', desk: true }, checkins: { 0: '07:40', 1: '07:45', 2: '07:42' },
        family: ['Karen Thompson', 'Mother', '5085550108', 'Jim Thompson', 'Grandfather', '5085550164'] }],
    ['Noah', 'Patel', 10, true, D(0, 1, 2), [[1, D(0, 1, 2)]], 'check', ['2027-03-12', '19:30'], 4790,
      { checkins: { 0: '08:55' }, family: ['Priya Patel', 'Mother', '7745550119', 'Raj Patel', 'Grandfather', '7745550163'] }],
    ['Liam', 'Ortiz', 7, true, 'all', [], 'cash', ['2027-03-05', '18:10'], 4801,
      { paid: { on: '2027-03-15', at: '17:20', desk: true }, checkins: { 0: '08:59', 1: '09:02', 2: '08:58' } }],
    ['Mia', 'Rossi', 9, false, D(0, 2), [[1, D(0, 2)]], 'cash', ['2027-03-03', '21:30'], 4821,
      { checkins: { 0: '09:01' }, family: ['Laura Rossi', 'Mother', '5085550142', 'Paul Rossi', 'Uncle', '5085550187'] }],
    ['Sofia', 'Nguyen', 6, true, D(0, 1), [], 'cash', ['2027-03-08', '12:15'], 4806,
      { paid: { on: '2027-03-18', at: '16:40', desk: true }, checkins: { 0: '08:40', 1: '08:44' } }],
    ['Ethan', 'Brooks', 12, true, D(0, 3, 4), [[0, D(0, 3, 4)], [2, D(4)]], 'cash', ['2027-03-09', '20:05'], 4808, {}], // pizza on Fri
    ['Chloe', 'Martin', 8, true, 'all', [[1, 'all']], 'check', ['2027-03-04', '19:45'], 4818,
      { paid: { on: '2027-03-11', at: '17:05', desk: true }, checkins: { 0: '08:20', 1: '08:25', 2: '08:31' } }],
    ['Leo', 'Kim', 11, true, 'all', [[0, 'all']], 'card', ['2027-03-06', '09:30'], 4803,
      { paid: { cents: 33500, on: '2027-03-25', at: '16:15', desk: true }, checkins: { 0: '07:51', 1: '07:48', 2: '07:51' } }],
    ['Grace', 'Lee', 6, false, 'all', [[0, D(0, 1, 2, 3)]], 'cash', ['2027-04-15', '20:20'], 4830, { checkins: { 0: '07:35', 1: '07:39' } }],
    ['Olivia', 'Chen', 9, true, 'all', [], 'cash', ['2027-03-02', '18:00'], 4785,
      { paid: { on: '2027-03-09', at: '16:30', desk: true, school: 'shrewsbury' }, checkins: { 0: '08:47', 1: '08:50', 2: '08:52' } }], // paid at the Shrewsbury desk
    ['Lucas', 'Rivera', 10, true, 'all', [[0, 'all']], 'check', ['2027-03-07', '14:10'], 4804,
      { paid: { on: '2027-03-14', at: '11:10', desk: false }, checkins: { 0: '07:33', 1: '07:36', 2: '07:38' } }],
    ['Emma', 'Garcia', 7, true, 'all', [[1, 'all']], 'card', ['2027-03-10', '21:00'], 4809,
      { paid: { on: '2027-03-17', at: '17:45', desk: true }, checkins: { 0: '08:12', 1: '08:15', 2: '08:10' } }],
    ['Jack', 'Murphy', 11, true, 'all', [], 'cash', ['2027-03-11', '19:05'], 4811,
      { paid: { on: '2027-03-20', at: '10:30', desk: true }, checkins: { 0: '08:35', 1: '08:38', 2: '08:41' } }],
    ['Zoe', 'Park', 8, true, 'all', [], 'check', ['2027-04-14', '18:25'], 4829,
      { paid: { on: '2027-04-16', at: '17:00', desk: true }, checkins: { 0: '08:05', 1: '08:07' } }],
    ['Henry', 'Davis', 9, true, D(1, 2, 3, 4), [], 'cash', ['2027-03-16', '20:40'], 4812,
      { paid: { on: '2027-03-23', at: '16:50', desk: true }, checkins: { 1: '08:56', 2: '08:49' } }],
    ['Isla', 'Moore', 7, true, D(1, 2, 3, 4), [], 'card', ['2027-03-18', '13:15'], 4813,
      { paid: { on: '2027-03-25', at: '17:30', desk: true }, checkins: { 1: '08:28' } }],
    ['Mason', 'Clark', 12, true, D(1, 3), [], 'cash', ['2027-03-19', '19:55'], 4814,
      { paid: { on: '2027-03-26', at: '16:20', desk: true }, checkins: { 1: '08:33' } }],
    ['Ruby', 'Scott', 6, true, D(1, 2), [], 'check', ['2027-03-22', '20:10'], 4816,
      { paid: { on: '2027-03-29', at: '17:10', desk: true }, checkins: { 1: '08:42' } }],
    // The second sign-up for Ava (C4b): a possible duplicate, not paid.
    ['Ava', 'Thompson', 8, true, 'all', [[1, 'all']], 'check', ['2027-03-03', '21:14'], 4822,
      { duplicateOfRef: 4815, family: ['Karen Thompson', 'Mother', '5085550108', 'Jim Thompson', 'Grandfather', '5085550164'] }],
    // Removed (C4): withdrawn on Apr 2 by Jeffrey.
    ['Owen', 'Walsh', 9, true, D(1, 2), [], 'cash', ['2027-03-20', '18:30'], 4817, { withdrawn: ['2027-04-02', '10:15'] }],
  ],
  // Two-Week Summer Camp: some children both weeks, some only one (check-ins appear once the
  // preview's today reaches those days, e.g. __tkdPreview.setToday('2027-07-14')).
  summer: [
    ['Ava', 'Thompson', 8, true, 'all', [[1, 'all']], 'check', ['2027-05-04', '19:20'], 4901,
      { paid: { on: '2027-05-10', at: '16:00', desk: true }, checkins: { 0: '07:40', 1: '07:45', 2: '07:42', 3: '07:44', 4: '07:41', 5: '07:39', 6: '07:43' } }],
    ['Noah', 'Patel', 10, true, D(0, 1, 2, 5, 6, 7), [[1, D(0, 1, 2)]], 'check', ['2027-05-06', '20:10'], 4902,
      { checkins: { 0: '08:55', 2: '08:50', 5: '08:52' } }],
    ['Mia', 'Rossi', 9, false, D(5, 6, 7, 8, 9), [], 'cash', ['2027-05-08', '21:00'], 4903,
      { paid: { on: '2027-05-15', at: '11:20', desk: true }, checkins: { 5: '09:01', 6: '09:05' } }],
    ['Liam', 'Ortiz', 7, true, D(0, 1, 2, 3, 4), [], 'cash', ['2027-05-09', '18:30'], 4904,
      { paid: { on: '2027-05-16', at: '10:05', desk: true }, checkins: { 0: '08:59', 1: '09:02', 2: '08:58', 3: '09:00', 4: '08:57' } }],
    ['Sofia', 'Nguyen', 6, true, 'all', [[2, 'all']], 'cash', ['2027-05-12', '19:45'], 4905,
      { checkins: { 0: '08:40', 1: '08:44', 2: '08:41', 3: '08:39', 4: '08:42', 5: '08:38' } }],
    ['Leo', 'Kim', 11, true, D(5, 6, 7, 8, 9), [[0, D(5, 6, 7, 8, 9)]], 'card', ['2027-05-14', '09:10'], 4906, {}],
  ],
  thanksgiving: [
    ['Mia', 'Rossi', 9, false, 'all', [[1, 'all']], 'cash', ['2026-10-17', '20:45'], 4421,
      { family: ['Laura Rossi', 'Mother', '5085550142', 'Paul Rossi', 'Uncle', '5085550187'] }],
    ['Ethan', 'Wu', 8, true, 'all', [], 'check', ['2026-10-06', '19:10'], 4402, { paid: { on: '2026-10-08', at: '17:10', desk: true } }],
    ['Lily', 'Brooks', 6, true, D(0), [], 'cash', ['2026-10-06', '20:30'], 4403, { paid: { on: '2026-10-09', at: '16:45', desk: true } }],
    ['Owen', 'Reed', 10, false, 'all', [[0, 'all']], 'cash', ['2026-10-07', '18:05'], 4405, {}],
    ['Zoe', 'Park', 9, true, D(1), [[1, D(1)]], 'card', ['2026-10-08', '21:15'], 4407, { paid: { on: '2026-10-12', at: '17:30', desk: true } }],
    ['Jack', 'Rivera', 11, true, 'all', [[0, 'all'], [1, 'all']], 'check', ['2026-10-09', '12:00'], 4409, { paid: { on: '2026-10-13', at: '16:55', desk: false } }],
    ['Maya', 'Singh', 7, true, 'all', [], 'cash', ['2026-10-11', '19:40'], 4411, {}],
    ['Sam', 'Diaz', 12, false, D(0), [], 'cash', ['2026-10-12', '20:20'], 4412, {}],
    ['Chloe', 'Nguyen', 5, true, 'all', [[1, D(0)]], 'cash', ['2026-10-13', '18:35'], 4413, { paid: { on: '2026-10-15', at: '17:15', desk: true } }],
    ['Ryan', 'Patel', 9, true, D(1), [], 'check', ['2026-10-14', '21:05'], 4414, { paid: { on: '2026-10-16', at: '16:25', desk: true } }],
    ['Ella', 'Grant', 8, true, 'all', [], 'card', ['2026-10-15', '19:50'], 4416, {}],
    ['Lucas', 'Moore', 10, true, 'all', [[0, 'all']], 'cash', ['2026-10-16', '20:00'], 4418, { paid: { on: '2026-10-17', at: '10:40', desk: true } }],
  ],
};
// Columbus Day (9, all paid, all checked in) and Veterans Day (16) campers: [first, last, age,
// member, paying by, extras]. One day each, so "all days".
const ONE_DAY_CAMPERS = {
  columbus: [
    ['Ava', 'Chen', 7, true, 'cash', [[0, 'all']]], ['Noah', 'Kim', 9, true, 'check', []], ['Lily', 'Hart', 6, false, 'cash', [[1, 'all']]],
    ['Owen', 'Gray', 10, true, 'card', [[2, null]]], ['Ella', 'Stone', 8, true, 'cash', []], ['Lucas', 'Reyes', 11, true, 'check', [[0, 'all']]],
    ['Maya', 'Ford', 5, true, 'cash', []], ['Sam', 'Lowe', 12, false, 'cash', [[1, 'all']]], ['Zoe', 'Hill', 9, true, 'check', []],
  ],
  veterans: [
    ['Ivy', 'Bell', 7, true, 'cash', []], ['Max', 'Cole', 9, true, 'check', [[0, 'all']]], ['Nora', 'Dunn', 6, false, 'cash', []],
    ['Eli', 'Ross', 10, true, 'card', [[1, 'all']]], ['Ada', 'Fox', 8, true, 'cash', [[2, null]]], ['Leo', 'Hunt', 11, true, 'check', []],
    ['Mila', 'Wade', 5, true, 'cash', []], ['Finn', 'Shaw', 12, false, 'cash', [[0, 'all']]], ['Ruby', 'Lane', 9, true, 'check', []],
    ['Theo', 'Page', 7, true, 'cash', [[1, 'all']]], ['Lucy', 'Ward', 8, true, 'card', []], ['Jude', 'Kerr', 10, true, 'cash', []],
    ['Iris', 'Moss', 6, false, 'check', [[2, null]]], ['Owen', 'Pratt', 11, true, 'cash', []], ['Rose', 'Quinn', 9, true, 'cash', [[0, 'all']]],
    ['Cole', 'Burke', 12, true, 'check', []],
  ],
};

// The templates (C2): [name, school, both, day count, grid, extras, opens / closes / early days before].
const DEFAULT_TEMPLATES = [
  ['One-day holiday camp', 'worcester', false, 1, GRID_ONE, [DROP, PICK, LUNCH], [21, 1, 7], DESC_ONE],
  ['Thanksgiving Camp', 'worcester', false, 2, GRID_TWO, [DROP, PICK], [51, 1, 7], DESC_TWO],
  ['Vacation week', 'worcester', true, 5, GRID_WEEK, [DROP, PICK, PIZZA], [49, 1, 7], DESC_WEEK],
  ['Summer week', 'worcester', false, 5, GRID_WEEK, [DROP, PICK, PIZZA], [42, 1, 7], 'A week of Taekwondo, games, crafts and outdoor play. Bring a lunch, a water bottle, sunscreen and comfortable clothes.'],
];

// Builds the whole default store. today = 'YYYY-MM-DD' (the preview's today): check-ins are only
// made on camp days up to today, so before a camp nobody is checked in.
export function defaultCampsData({ today = todayInSchoolTime(new Date()) } = {}) {
  const db = {
    schema: SCHEMA_VERSION,
    camps: [], camp_days: [], camp_prices: [], camp_extras: [], camp_templates: [], camp_signups: [], camp_campers: [],
    camp_camper_days: [], camp_camper_extras: [], camp_payments: [], camp_public_attempts: [],
    next_reference: 0, next_attempt_id: 1,
  };
  const n = {}; // counters per id kind
  const id = (kind) => fixedId(kind, (n[kind] = (n[kind] ?? 0) + 1));
  const stamps = (at, by, byId = null) => ({ version: 1, created_at: at, created_by: byId, created_by_name: by, updated_at: at, updated_by: byId, updated_by_name: by });
  const bump = (row, at, by, byId = null) => Object.assign(row, { version: row.version + 1, updated_at: at, updated_by: byId, updated_by_name: by });
  let maxRef = REFERENCE_START - 1;

  for (const def of DEFAULT_CAMPS) {
    const made = schoolClockToIso(...def.made);
    const camp = {
      id: id('c0'), location_code: def.location, both_schools: def.both, name: def.name, start_time: '09:00:00', end_time: '15:00:00',
      signup_opens_on: def.opens, signup_closes_on: def.closes, early_until: def.early, closed_by_hand: def.closedByHand === true,
      min_age: def.ages[0], max_age: def.ages[1], description: def.description, waiver_text: WAIVER,
      public_code: DEFAULT_CAMP_CODES[def.key], ...stamps(made, 'Jeffrey Berg', ADMIN_USER_ID),
    };
    if (camp.closed_by_hand) bump(camp, schoolClockToIso(addDays(def.closes, -6), '11:00'), 'Jeffrey Berg', ADMIN_USER_ID);
    db.camps.push(camp);
    const days = def.days.map((day) => ({ id: id('c1'), camp_id: camp.id, day }));
    db.camp_days.push(...days);
    db.camp_prices.push(...gridRows(def.grid).map((row) => ({ id: id('c2'), camp_id: camp.id, ...row })));
    const extras = def.extras.map((e, sort) => ({ id: id('c3'), camp_id: camp.id, ...extraJson(e, def.days), sort }));
    db.camp_extras.push(...extras);
    const grid = gridRows(def.grid);

    // One camper (its own sign-up). Returns the camper row.
    const addCamper = ({ first, last, age, member, dayIdx, extraPicks, payingBy, signed, ref, opt }) => {
      const signedAt = schoolClockToIso(...signed);
      const kind = priceKind(signed[0], def.early);
      const camperDays = dayIdx === 'all' ? days : dayIdx.map((i) => days[i]);
      const family = opt.family ?? [`${['Anna', 'Maria', 'Sarah', 'Kate', 'Julie', 'Lisa'][ref % 6]} ${last}`, 'Mother', `50855501${String(ref % 100).padStart(2, '0')}`,
        `${['Tom', 'Mark', 'Dan', 'Joe', 'Chris', 'Mike'][ref % 6]} ${last}`, ['Father', 'Uncle', 'Grandfather', 'Aunt'][ref % 4], `50855502${String(ref % 100).padStart(2, '0')}`];
      const signup = {
        id: id('c5'), camp_id: camp.id, reference: `CP-${ref}`, submission_id: id('ca'),
        parent_name: family[0], parent_relation: family[1], parent_phone: family[2],
        emergency_name: family[3], emergency_relation: family[4], emergency_phone: family[5],
        price_kind: kind, signed_up_on: signed[0], signature: SAMPLE_SIGNATURE, signed_at: signedAt, signature_deleted_at: null,
        waiver_text_signed: WAIVER, ack_version: CAMP_ACK_VERSION, ...stamps(signedAt, FAMILY_FORM),
      };
      db.camp_signups.push(signup);
      maxRef = Math.max(maxRef, ref);
      // Weekly pricing (R3): each week the child comes is priced by its own grid row, weeks add up.
      const base = priceChild({ member, dayIds: camperDays.map((d) => d.id), extras: [] }, grid.map((g) => ({
        dayCount: g.day_count, memberEarlyCents: g.member_early_cents, memberRegularCents: g.member_regular_cents,
        nonmemberEarlyCents: g.nonmember_early_cents, nonmemberRegularCents: g.nonmember_regular_cents,
      })), [], days.map((d) => ({ dayId: d.id, day: d.day })), kind).baseCents;
      const camper = {
        id: id('c6'), signup_id: signup.id, camp_id: camp.id, position: 1, first_name: first, last_name: last, age, member,
        paying_by: payingBy, base_cents: base, status: 'active', withdrawn_reason: null, withdrawn_at: null, withdrawn_by: null,
        withdrawn_by_name: null, duplicate_state: 'none', duplicate_of: null, ...stamps(signedAt, FAMILY_FORM),
      };
      db.camp_campers.push(camper);
      camperDays.forEach((d) => {
        const index = days.indexOf(d);
        const time = opt.checkins?.[index] ?? opt.checkinAll ?? null;
        const checked = time !== null && d.day <= today;
        db.camp_camper_days.push({
          id: id('c7'), camper_id: camper.id, day_id: d.id,
          checked_in_at: checked ? schoolClockToIso(d.day, time) : null, checked_in_by: checked ? DESK_USER_ID : null,
          checked_in_by_name: checked ? 'Staff' : null,
        });
      });
      let total = base;
      for (const [extraIndex, extraDays] of extraPicks) {
        const extra = extras[extraIndex];
        const list = extra.per === 'once' ? [null] : (extraDays === 'all' ? camperDays : extraDays.map((i) => days[i]));
        for (const d of list) {
          db.camp_camper_extras.push({ id: id('c8'), camper_id: camper.id, extra_id: extra.id, day_id: d ? d.id : null, price_cents: extra.price_cents });
          total += extra.price_cents;
        }
      }
      if (opt.paid) {
        const paidAt = schoolClockToIso(opt.paid.on, opt.paid.at);
        db.camp_payments.push({
          id: id('c9'), camper_id: camper.id, kind: 'payment', amount_cents: opt.paid.cents ?? total, method: payingBy,
          paid_on: opt.paid.on, recorded_at: paidAt, recorded_by: opt.paid.desk ? DESK_USER_ID : ADMIN_USER_ID,
          recorded_by_name: opt.paid.desk ? 'Staff' : 'Jeffrey Berg', reverses_payment_id: null,
          school: opt.paid.school ?? def.location, // the desk that took it (default: the camp's school)
        });
        bump(camper, paidAt, opt.paid.desk ? 'Staff' : 'Jeffrey Berg'); // Mark paid bumps the version
      }
      if (opt.duplicateOfRef) {
        const twinSignup = db.camp_signups.find((s) => s.reference === `CP-${opt.duplicateOfRef}`);
        const twin = db.camp_campers.find((c) => c.signup_id === twinSignup.id);
        Object.assign(camper, { duplicate_state: 'possible', duplicate_of: twin.id });
      }
      if (opt.withdrawn) {
        const at = schoolClockToIso(...opt.withdrawn);
        Object.assign(camper, { status: 'withdrawn', withdrawn_reason: 'withdrawn', withdrawn_at: at, withdrawn_by: ADMIN_USER_ID, withdrawn_by_name: 'Jeffrey Berg' });
        bump(camper, at, 'Jeffrey Berg', ADMIN_USER_ID);
      }
      return camper;
    };

    for (const [first, last, age, member, dayIdx, extraPicks, payingBy, signed, ref, opt] of DEFAULT_CAMPERS[def.key] ?? []) {
      addCamper({ first, last, age, member, dayIdx, extraPicks, payingBy, signed, ref, opt });
    }
    (ONE_DAY_CAMPERS[def.key] ?? []).forEach(([first, last, age, member, payingBy, extraPicks], i) => {
      const ref = (def.key === 'columbus' ? 4101 : 4201) + i;
      const signedDay = addDays(def.opens, 1 + i);
      const opt = { checkinAll: def.key === 'veterans' && i % 7 === 3 ? null : `0${7 + (i % 3)}:${String(10 + i * 3).padStart(2, '0')}` };
      // Columbus Day: everyone paid at the desk; Veterans Day: about two thirds paid.
      if (def.key === 'columbus' || i % 3 !== 2) opt.paid = { on: addDays(signedDay, 3), at: '17:00', desk: true };
      addCamper({ first, last, age, member, dayIdx: 'all', extraPicks, payingBy, signed: [signedDay, '19:00'], ref, opt });
    });
  }

  DEFAULT_TEMPLATES.forEach(([name, location, both, dayCount, grid, extras, [opens, closes, early], description]) => {
    const at = schoolClockToIso('2026-10-16', '12:00');
    db.camp_templates.push({
      id: id('c4'), name, location_code: location, both_schools: both, day_count: dayCount, start_time: '09:00:00', end_time: '15:00:00',
      opens_days_before: opens, closes_days_before: closes, early_days_before: early, min_age: 5, max_age: 12,
      description, waiver_text: WAIVER, prices: gridRows(grid), extras: extras.map(templateExtraJson), ...stamps(at, 'Jeffrey Berg', ADMIN_USER_ID),
    });
  });
  db.next_reference = maxRef + 1;
  return db;
}

// A saved version-3 store (before weekly pricing) → version 4, the way migration 0022 leaves the
// real tables: each camp's grid keeps only rows 1…W (W = gridSizeFor its days; the old grid had a
// row for every day count up to the camp's number of days, so rows 1…W are always there), and a
// template's day_count (was "days in the camp") becomes at most 7 with its grid cut to match.
// Campers' stored prices (base_cents) are NOT changed — they are snapshots (R3, R8).
function upgradeStore(store) {
  if (!store || typeof store !== 'object' || store.schema !== 3) return store;
  if (!Array.isArray(store.camp_prices) || !Array.isArray(store.camp_days) || !Array.isArray(store.camp_templates)) return store;
  const sizeOf = new Map();
  for (const d of store.camp_days) {
    if (!sizeOf.has(d.camp_id)) sizeOf.set(d.camp_id, gridSizeFor(store.camp_days.filter((x) => x.camp_id === d.camp_id).map((x) => x.day)));
  }
  store.camp_prices = store.camp_prices.filter((p) => p.day_count <= (sizeOf.get(p.camp_id) ?? MAX_WEEK_DAYS));
  for (const t of store.camp_templates) {
    const rows = Math.min(t.day_count, MAX_WEEK_DAYS);
    t.day_count = rows;
    t.prices = (t.prices ?? []).filter((p) => p.day_count <= rows);
  }
  store.schema = 4;
  return store;
}

// Is a loaded store usable? (Missing, damaged or another schema version → the default data.)
const LISTS = ['camps', 'camp_days', 'camp_prices', 'camp_extras', 'camp_templates', 'camp_signups', 'camp_campers',
  'camp_camper_days', 'camp_camper_extras', 'camp_payments', 'camp_public_attempts'];
function storeIsUsable(store) {
  if (!store || typeof store !== 'object' || store.schema !== SCHEMA_VERSION) return false;
  if (LISTS.some((key) => !Array.isArray(store[key]))) return false;
  if (!Number.isInteger(store.next_reference) || !Number.isInteger(store.next_attempt_id)) return false;
  const campOk = (c) => c && typeof c.id === 'string' && LOCATION_CODES.includes(c.location_code) && Number.isInteger(c.version) && typeof c.public_code === 'string';
  const camperOk = (r) => r && typeof r.id === 'string' && Number.isInteger(r.version) && ['active', 'withdrawn'].includes(r.status);
  return store.camps.every(campOk) && store.camp_campers.every(camperOk);
}

// ----- Table permissions (§1.15) -----

const STAMP_COLS = ['version', 'created_at', 'created_by_name', 'updated_at', 'updated_by_name'];
const CAMP_COLS = ['id', 'location_code', 'both_schools', 'name', 'start_time', 'end_time', 'signup_opens_on', 'signup_closes_on', 'early_until',
  'closed_by_hand', 'min_age', 'max_age', 'description', 'waiver_text', 'public_code', ...STAMP_COLS];
const TEMPLATE_COLS = ['id', 'name', 'location_code', 'both_schools', 'day_count', 'start_time', 'end_time', 'opens_days_before', 'closes_days_before',
  'early_days_before', 'min_age', 'max_age', 'description', 'waiver_text', 'prices', 'extras', ...STAMP_COLS];
const CAMPER_COLS = ['id', 'signup_id', 'camp_id', 'position', 'first_name', 'last_name', 'age', 'member', 'paying_by', 'base_cents', 'status',
  'withdrawn_reason', 'withdrawn_at', 'withdrawn_by_name', 'duplicate_state', 'duplicate_of', ...STAMP_COLS];
const ROSTER_COLS = ['id', 'camp_id', 'signup_id', 'position', 'first_name', 'last_name', 'age', 'member', 'paying_by', 'status', 'withdrawn_reason',
  'withdrawn_at', 'withdrawn_by_name', 'duplicate_state', 'duplicate_of', 'version', 'created_at', 'signup_version', 'reference', 'price_kind',
  'signed_up_on', 'signed', 'signature_deleted_at', 'base_cents', 'days', 'extras', 'total_cents', 'paid_cents', 'owes_cents',
  'paid_on', 'paid_method', 'last_payment_id', 'last_payment_recorded_at', 'paid_school'];
const GRANTED = {
  camps: CAMP_COLS,
  camp_days: ['id', 'camp_id', 'day'],
  camp_prices: ['id', 'camp_id', 'day_count', 'member_early_cents', 'member_regular_cents', 'nonmember_early_cents', 'nonmember_regular_cents'],
  camp_extras: ['id', 'camp_id', 'name', 'price_cents', 'per', 'not_for_all_days', 'only_on', 'sort'],
  camp_templates: TEMPLATE_COLS,
  camp_roster: ROSTER_COLS,
  camp_campers: CAMPER_COLS,
  camp_signups: ['id', 'camp_id', 'reference', 'price_kind', 'signed_up_on', 'signed_at', 'signature_deleted_at', 'version'],
  camp_camper_days: ['id', 'camper_id', 'day_id', 'checked_in_at', 'checked_in_by_name'],
  camp_camper_extras: ['id', 'camper_id', 'extra_id', 'day_id', 'price_cents'],
  camp_payments: ['id', 'camper_id', 'kind', 'amount_cents', 'method', 'paid_on', 'recorded_at', 'recorded_by_name', 'reverses_payment_id', 'school'],
};
// Columns that exist but are never given to the app (asking for one is "permission denied").
const HIDDEN = {
  camps: ['created_by', 'updated_by'],
  camp_days: [], camp_prices: [], camp_extras: [],
  camp_templates: ['created_by', 'updated_by'],
  camp_roster: [],
  camp_campers: ['withdrawn_by', 'created_by', 'updated_by'],
  camp_signups: ['submission_id', 'parent_name', 'parent_phone', 'parent_relation', 'emergency_name', 'emergency_phone', 'emergency_relation',
    'signature', 'waiver_text_signed', 'ack_version', 'created_at', 'created_by', 'created_by_name', 'updated_at', 'updated_by', 'updated_by_name'],
  camp_camper_days: ['checked_in_by'],
  camp_camper_extras: [],
  camp_payments: ['recorded_by'],
};
// The tables and the view the app may read (never camp_public_attempts: no grant at all).
export const CAMP_TABLES = Object.keys(GRANTED);

// ----- The functions' argument lists (name, type) — the same names as migration 0013 (§1.14) -----
const ID = (name) => [name, 'uuid'];
const CAMP_FIELDS = [['p_location_code', 'text'], ['p_both_schools', 'bool'], ['p_name', 'text'], ['p_days', 'date[]'], ['p_start_time', 'time'],
  ['p_end_time', 'time'], ['p_signup_opens_on', 'date'], ['p_signup_closes_on', 'date'], ['p_early_until', 'date'], ['p_min_age', 'int'],
  ['p_max_age', 'int'], ['p_prices', 'jsonb'], ['p_extras', 'jsonb'], ['p_description', 'text'], ['p_waiver_text', 'text']];
const RPC_ARGS = {
  camp_add_camp: CAMP_FIELDS,
  camp_update_camp: [ID('p_camp_id'), ['p_expected_version', 'int'], ...CAMP_FIELDS],
  camp_set_signup: [ID('p_camp_id'), ['p_expected_version', 'int'], ['p_open', 'bool']],
  camp_delete_camp: [ID('p_camp_id'), ['p_expected_version', 'int'], ['p_expected_camper_count', 'int'], ['p_expected_payment_total_cents', 'int']],
  camp_save_template: [ID('p_camp_id'), ['p_name', 'text']],
  camp_update_template: [ID('p_template_id'), ['p_expected_version', 'int'], ['p_name', 'text'], ['p_location_code', 'text'], ['p_both_schools', 'bool'],
    ['p_day_count', 'int'], ['p_start_time', 'time'], ['p_end_time', 'time'], ['p_opens_days_before', 'int'], ['p_closes_days_before', 'int'],
    ['p_early_days_before', 'int'], ['p_min_age', 'int'], ['p_max_age', 'int'], ['p_prices', 'jsonb'], ['p_extras', 'jsonb'],
    ['p_description', 'text'], ['p_waiver_text', 'text']],
  camp_delete_template: [ID('p_template_id'), ['p_expected_version', 'int']],
  camp_update_details: [ID('p_camper_id'), ['p_camper_version', 'int'], ['p_signup_version', 'int'], ['p_first', 'text'], ['p_last', 'text'],
    ['p_age', 'int'], ['p_member', 'bool'], ['p_day_ids', 'uuid[]'], ['p_extras', 'jsonb'], ['p_parent_name', 'text'], ['p_parent_phone', 'text'],
    ['p_parent_relation', 'text'], ['p_emergency_name', 'text'], ['p_emergency_phone', 'text'], ['p_emergency_relation', 'text']],
  camp_change_paying_by: [ID('p_camper_id'), ['p_expected_version', 'int'], ['p_paying_by', 'text']],
  camp_mark_paid: [ID('p_camper_id'), ['p_expected_version', 'int'], ['p_school', 'text']],
  camp_undo_payment: [ID('p_payment_id')],
  camp_edit_payment: [ID('p_payment_id'), ['p_method', 'text'], ['p_amount_cents', 'int'], ['p_paid_on', 'date'], ['p_school', 'text']],
  camp_resolve_duplicate: [ID('p_keep_id'), ['p_keep_version', 'int'], ID('p_other_id'), ['p_other_version', 'int'], ['p_keep_both', 'bool']],
  camp_withdraw_camper: [ID('p_camper_id'), ['p_expected_version', 'int']],
  camp_restore_camper: [ID('p_camper_id'), ['p_expected_version', 'int']],
  camp_delete_camper: [ID('p_camper_id'), ['p_expected_version', 'int'], ['p_expected_payment_ids', 'uuid[]']],
  camp_check_in: [ID('p_camper_id'), ID('p_day_id')],
  camp_undo_check_in: [ID('p_camper_id'), ID('p_day_id')],
  camp_camper_detail: [ID('p_camper_id')],
};
// A = admins only (the others are S = staff and admins, some with a rule inside — see each one).
const ADMIN_ONLY = new Set([
  'camp_add_camp', 'camp_update_camp', 'camp_delete_camp', 'camp_save_template', 'camp_update_template', 'camp_delete_template',
  'camp_edit_payment', 'camp_delete_camper',
]);
// The staff functions + camp_camper_detail (the app may call these).
export const CAMP_RPC_NAMES = Object.keys(RPC_ARGS);
// Functions that only reads (failNextSave doesn't fail them).
export const CAMP_READ_RPC_NAMES = ['camp_camper_detail'];
// Functions that exist but a signed-in staff member may NOT call (only camps_registrar, or
// nobody): the app gets "permission denied", exactly like EVENT_RESTRICTED_RPC_NAMES.
export const CAMP_RESTRICTED_RPC_NAMES = ['camp_public_camp', 'camp_public_signup', 'camp_public_signup_core', 'camp_purge_old_signatures'];
export { ADMIN_ONLY as CAMP_ADMIN_ONLY_RPCS };

class DbError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

// Converts one JSON value to the database type, or throws like PostgreSQL would.
function toDbType(value, type) {
  if (value === null) return null;
  switch (type) {
    case 'text':
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      throw new DbError('22P02', `invalid input syntax for type text: ${JSON.stringify(value)}`);
    case 'uuid':
      if (typeof value === 'string' && UUID_PATTERN.test(value)) return value.toLowerCase();
      throw new DbError('22P02', `invalid input syntax for type uuid: "${value}"`);
    case 'int': {
      let n = value;
      if (typeof value === 'string' && /^\s*[+-]?\d+\s*$/.test(value)) n = Number(value);
      if (typeof n !== 'number' || !Number.isInteger(n)) throw new DbError('22P02', `invalid input syntax for type integer: "${value}"`);
      if (Math.abs(n) > INT_MAX) throw new DbError('22003', `value "${value}" is out of range for type integer`);
      return n;
    }
    case 'bool':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 't') return true;
      if (value === 'false' || value === 'f') return false;
      throw new DbError('22P02', `invalid input syntax for type boolean: "${value}"`);
    case 'date':
      if (isIsoDate(value)) return value;
      throw new DbError('22007', `invalid input syntax for type date: "${value}"`);
    case 'time': {
      const m = typeof value === 'string' ? TIME_PATTERN.exec(value) : null;
      if (!m) throw new DbError('22007', `invalid input syntax for type time: "${value}"`);
      return `${m[1]}:${m[2]}:${m[3] ?? '00'}`;
    }
    case 'jsonb':
      return JSON.parse(JSON.stringify(value)); // any JSON value; checked by the function itself
    case 'uuid[]':
    case 'date[]':
      if (!Array.isArray(value)) throw new DbError('22P02', `malformed array literal: "${value}"`);
      return value.map((item) => toDbType(item, type === 'uuid[]' ? 'uuid' : 'date'));
    default:
      throw new Error(`unknown type ${type}`);
  }
}

// Matches the call's argument names to the function (all required — no defaults) and converts them.
function readArgs(name, args) {
  const spec = RPC_ARGS[name];
  const sent = Object.keys(args ?? {}).filter((key) => args[key] !== undefined);
  const known = new Set(spec.map(([key]) => key));
  if (spec.some(([key]) => !sent.includes(key)) || sent.some((key) => !known.has(key))) {
    throw new DbError('PGRST202', `Could not find the function public.${name}(${[...sent].sort().join(', ')}) in the schema cache`, 404);
  }
  return Object.fromEntries(spec.map(([key, type]) => [key, toDbType(args[key], type)]));
}

// ----- Small helpers and the argument-shape checks (the SQL helpers of §1.1) -----

const clone = (value) => JSON.parse(JSON.stringify(value));
const st = (status) => ({ status });
const sum = (list) => list.reduce((total, x) => total + x, 0);
const hasDuplicates = (list) => new Set(list).size !== list.length;
const sameSet = (a, b) => a.length === b.length && new Set(a).size === new Set(b).size && a.every((x) => b.includes(x));
const byText = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nameIsValid = (v) => typeof v === 'string' && nameProblem(v) === null;
// testing_line_is_valid: after the name tidying, 1…max characters, nothing invisible.
const lineIsValid = (v, max) => {
  if (typeof v !== 'string') return false;
  const tidy = normalizeName(v);
  const length = [...tidy].length;
  return length >= 1 && length <= max && nameProblem(tidy) !== 'badCharacter';
};
const centsAreValid = (n) => Number.isInteger(n) && n >= 0 && n <= 100000 && n % 100 === 0; // testing_cents_is_valid
const phoneIsValid = (v) => typeof v === 'string' && /^\d{10}$/.test(v);
const uuidText = (v) => typeof v === 'string' && UUID_PATTERN.test(v);
// camp_int_text_is_valid: a jsonb number written as a whole number of at most 6 digits, in range.
const intJson = (v, min, max) => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= 999999 && v >= min && v <= max;
// Exactly these keys (and optionally a few more).
const exactKeys = (obj, keys, optional = []) => Object.keys(obj).every((k) => keys.includes(k) || optional.includes(k)) && keys.every((k) => k in obj);
// A list of uuid strings inside jsonb: an array of 0…max uuid strings, no repeats.
const uuidListJson = (v, max) => Array.isArray(v) && v.length <= max && v.every(uuidText) && !hasDuplicates(v.map((x) => x.toLowerCase()));
// 5-minute step and 0 seconds.
const timeOnStep = (t) => t !== null && t.endsWith(':00') && Number(t.slice(3, 5)) % 5 === 0;
const ageOk = (n) => Number.isInteger(n) && n >= AGE_LIMITS.min && n <= AGE_LIMITS.max;

const PRICE_KEYS = ['day_count', 'member_early_cents', 'member_regular_cents', 'nonmember_early_cents', 'nonmember_regular_cents'];
const EXTRA_KEYS = ['name', 'price_cents', 'per', 'not_for_all_days'];

// camp_prices_arg_is_valid(p_prices, p_day_count): exactly one row per day count 1…N. Weekly pricing
// (R2): for a camp N = W (gridSizeFor its days), for a template N = its "days per week"; 1–7.
function pricesArgValid(prices, dayCount) {
  if (!Array.isArray(prices) || !Number.isInteger(dayCount) || dayCount < 1 || dayCount > MAX_WEEK_DAYS || prices.length !== dayCount) return false;
  const counts = [];
  for (const row of prices) {
    if (!isObj(row) || !exactKeys(row, PRICE_KEYS)) return false;
    if (!intJson(row.day_count, 1, dayCount)) return false;
    if (!PRICE_KEYS.slice(1).every((k) => intJson(row[k], 0, 100000) && centsAreValid(row[k]))) return false;
    counts.push(row.day_count);
  }
  return !hasDuplicates(counts);
}

// camp_extras_arg_is_valid(p_extras, p_with_ids): 0–10 extras, names unique ignoring case.
// A camp's extra may carry only_on (dates, no repeats; each must be a camp day — checked by the
// caller, which knows the days); a template's extra only_weekdays (1–7, no repeats) instead.
// Either one non-empty only for a per-day extra. Left out = [] (every day).
const dateListJson = (v) => Array.isArray(v) && v.length <= MAX_DAYS && v.every(isIsoDate) && !hasDuplicates(v);
const weekdayListJson = (v) => Array.isArray(v) && v.length <= 7 && v.every((n) => intJson(n, 1, 7)) && !hasDuplicates(v);
function extrasArgValid(extras, withIds, forTemplate = false) {
  if (!Array.isArray(extras) || extras.length > MAX_EXTRAS) return false;
  const names = [];
  const ids = [];
  for (const e of extras) {
    const limitKey = forTemplate ? 'only_weekdays' : 'only_on';
    if (!isObj(e) || !exactKeys(e, EXTRA_KEYS, [...(withIds ? ['id'] : []), limitKey])) return false;
    const limit = e[limitKey] ?? [];
    if (!(forTemplate ? weekdayListJson(limit) : dateListJson(limit))) return false;
    if (limit.length > 0 && e.per !== 'day') return false;
    if (!lineIsValid(e.name, EXTRA_NAME_MAX)) return false;
    if (!intJson(e.price_cents, 0, 100000) || !centsAreValid(e.price_cents)) return false;
    if (e.per !== 'once' && e.per !== 'day') return false;
    if (typeof e.not_for_all_days !== 'boolean') return false;
    if (withIds && 'id' in e && e.id !== null) {
      if (!uuidText(e.id)) return false;
      ids.push(e.id.toLowerCase());
    }
    names.push(nameKey(e.name));
  }
  return !hasDuplicates(names) && !hasDuplicates(ids);
}

// camp_children_arg_is_valid(p_children): 1–3 children of exactly this shape (§1.16).
const CHILD_KEYS = ['first_name', 'last_name', 'age', 'member', 'day_ids', 'extras'];
function childrenArgValid(children) {
  if (!Array.isArray(children) || children.length < 1 || children.length > MAX_CHILDREN) return false;
  return children.every((c) => isObj(c) && exactKeys(c, CHILD_KEYS)
    && typeof c.first_name === 'string' && typeof c.last_name === 'string'
    && intJson(c.age, -999999, 999999) && typeof c.member === 'boolean'
    && uuidListJson(c.day_ids, MAX_DAYS) && c.day_ids.length >= 1
    && camperExtrasArgValid(c.extras));
}

// camp_camper_extras_arg_is_valid(p_extras): 0–10 of { extra_id, day_ids }, no extra twice.
function camperExtrasArgValid(extras) {
  if (!Array.isArray(extras) || extras.length > MAX_EXTRAS) return false;
  if (!extras.every((e) => isObj(e) && exactKeys(e, ['extra_id', 'day_ids']) && uuidText(e.extra_id) && uuidListJson(e.day_ids, MAX_DAYS))) return false;
  return !hasDuplicates(extras.map((e) => e.extra_id.toLowerCase()));
}

// camp_days_arg_is_valid(p_days): 1–60 dates, no nulls, no repeats (weekly pricing R4; was 10).
const daysArgValid = (days) => Array.isArray(days) && days.length >= 1 && days.length <= MAX_DAYS && days.every((d) => d !== null) && !hasDuplicates(days);

// A description: no description (null / blank) is fine; otherwise camp_text_is_valid(…, 2000).
const descriptionOk = (v) => v === null || normalizeCampText(v) === null || campTextIsValid(v, DESCRIPTION_MAX);

// The date 3 years before a date ('2027-04-19' → '2024-04-19'; Feb 29 → Feb 28), like
// "date - interval '3 years'".
function yearsBefore(dateIso, years) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const target = new Date(Date.UTC(y - years, m - 1, 1));
  const lastOfMonth = new Date(Date.UTC(y - years, m, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastOfMonth));
  return target.toISOString().slice(0, 10);
}

// ----- The backend -----

export function createCampsBackend({ loadStore, saveStore, now = () => Date.now(), today, newId, locations }) {
  let failNext = false; // set by failNextSave()
  const stamp = () => new Date(now()).toISOString();
  // The "today" the default data uses for its check-ins.
  const dataToday = () => today();

  // The current data — read from storage EVERY time (nothing is kept in memory).
  function read() {
    let store = null;
    try {
      store = upgradeStore(clone(loadStore()));
    } catch {
      store = null;
    }
    return storeIsUsable(store) ? store : defaultCampsData({ today: dataToday() });
  }
  const write = (db) => saveStore?.(db);

  // The schools (Settings → Schools): name and address. Falls back to the plain names.
  function school(code) {
    let list = null;
    try {
      list = locations?.() ?? null;
    } catch {
      list = null;
    }
    const row = Array.isArray(list) ? list.find((l) => l?.code === code) : null;
    const name = row?.name ?? (code === 'shrewsbury' ? 'Shrewsbury' : 'Worcester');
    const address = row?.address_street
      ? { street: row.address_street, city: row.address_city, state: row.address_state, zip: row.address_zip }
      : null;
    return { name, address };
  }

  // ----- What the before-write triggers do -----

  function insertRow(list, row, ctx) {
    const at = stamp();
    const full = { ...row, version: 1, created_at: at, created_by: ctx.userId ?? null, created_by_name: ctx.actorName, updated_at: at, updated_by: ctx.userId ?? null, updated_by_name: ctx.actorName };
    list.push(full);
    return full;
  }
  // Changes a row. A real change raises the version and the "last changed" stamp; changing nothing
  // leaves them alone. force = raise it anyway (Mark paid / day and extra changes touch the row).
  function updateRow(row, changes, ctx, force = false) {
    const changed = Object.keys(changes).some((col) => JSON.stringify(changes[col]) !== JSON.stringify(row[col]));
    Object.assign(row, changes);
    if (changed || force) {
      row.version += 1;
      row.updated_at = stamp();
      row.updated_by = ctx.userId ?? null;
      row.updated_by_name = ctx.actorName;
    }
    return changed || force;
  }

  // ----- Lookups and views in campRules' camelCase shapes -----

  const findCamp = (db, id) => db.camps.find((c) => c.id === id) ?? null;
  const findCamper = (db, id) => db.camp_campers.find((c) => c.id === id) ?? null;
  const signupOf = (db, camper) => db.camp_signups.find((s) => s.id === camper.signup_id) ?? null;
  const dayRows = (db, campId) => db.camp_days.filter((d) => d.camp_id === campId).sort(byText('day'));
  const extraRows = (db, campId) => db.camp_extras.filter((e) => e.camp_id === campId).sort((a, b) => a.sort - b.sort);
  const daysView = (db, campId) => dayRows(db, campId).map((d) => ({ dayId: d.id, day: d.day }));
  const pricesView = (db, campId) => db.camp_prices.filter((p) => p.camp_id === campId).sort((a, b) => a.day_count - b.day_count).map((p) => ({
    dayCount: p.day_count, memberEarlyCents: p.member_early_cents, memberRegularCents: p.member_regular_cents,
    nonmemberEarlyCents: p.nonmember_early_cents, nonmemberRegularCents: p.nonmember_regular_cents,
  }));
  const extrasView = (db, campId) => extraRows(db, campId).map((e) => ({
    extraId: e.id, name: e.name, priceCents: e.price_cents, per: e.per, notForAllDays: e.not_for_all_days, onlyOn: e.only_on ?? [], sort: e.sort,
  }));
  const campView = (c) => ({ closedByHand: c.closed_by_hand, signupOpensOn: c.signup_opens_on, signupClosesOn: c.signup_closes_on, earlyUntil: c.early_until });
  const stateOf = (db, camp) => signupState(campView(camp), daysView(db, camp.id), today());
  const lastDayOf = (db, campId) => lastDay(daysView(db, campId));
  const camperDayRows = (db, camperId) => db.camp_camper_days.filter((r) => r.camper_id === camperId);
  const camperExtraRows = (db, camperId) => db.camp_camper_extras.filter((r) => r.camper_id === camperId);
  const paymentsOf = (db, camperId) => db.camp_payments.filter((p) => p.camper_id === camperId);
  const isReversed = (db, paymentId) => db.camp_payments.some((p) => p.reverses_payment_id === paymentId);

  // camp_camper_total_cents / paid / owes (§1.13).
  function money(db, camper) {
    const total = camper.base_cents + sum(camperExtraRows(db, camper.id).map((r) => r.price_cents));
    const paid = sum(paymentsOf(db, camper.id).map((p) => p.amount_cents));
    return { total, paid, owes: total - paid };
  }

  // The 'weeks' key of Camper detail's breakdown and of a sign-up answer's children (weekly pricing,
  // migration 0022): one item per Monday–Sunday week the camper comes, earliest first,
  // { monday, day_count, cents }, cents = the camp's CURRENT grid row for that many days at the
  // sign-up's price kind and the camper's member box (null when the grid has no such row).
  // row = the camper's rosterRow (its days).
  function weeksOf(db, camper, row, kind) {
    const prices = pricesView(db, camper.camp_id);
    return campWeeks(row.days.filter((d) => d.day).map((d) => ({ dayId: d.day_id, day: d.day }))).map((w) => ({
      monday: w.monday, day_count: w.days.length, cents: baseCents(prices, w.days.length, camper.member, kind),
    }));
  }

  // The latest payment that isn't reversed (the same "latest payment row" as 0005's testing_roster).
  function lastPayment(db, camperId) {
    const live = paymentsOf(db, camperId).filter((p) => p.kind === 'payment' && !isReversed(db, p.id)).sort(byText('recorded_at'));
    return live[live.length - 1] ?? null;
  }

  // One row of the camp_roster view.
  function rosterRow(db, c) {
    const signup = signupOf(db, c);
    const dayById = new Map(db.camp_days.map((d) => [d.id, d]));
    const extraById = new Map(db.camp_extras.map((e) => [e.id, e]));
    const days = camperDayRows(db, c.id).map((r) => ({ day_id: r.day_id, day: dayById.get(r.day_id)?.day ?? null, checked_in_at: r.checked_in_at, checked_in_by_name: r.checked_in_by_name }))
      .sort(byText('day'));
    const extras = camperExtraRows(db, c.id).map((r) => {
      const e = extraById.get(r.extra_id);
      return { extra_id: r.extra_id, name: e?.name ?? null, per: e?.per ?? null, day_id: r.day_id, day: r.day_id ? dayById.get(r.day_id)?.day ?? null : null, price_cents: r.price_cents, sort: e?.sort ?? 0 };
    }).sort((a, b) => a.sort - b.sort || ((a.day ?? '') < (b.day ?? '') ? -1 : (a.day ?? '') > (b.day ?? '') ? 1 : 0))
      .map(({ sort, ...rest }) => rest);
    const { total, paid, owes } = money(db, c);
    const last = lastPayment(db, c.id);
    return {
      id: c.id, camp_id: c.camp_id, signup_id: c.signup_id, position: c.position, first_name: c.first_name, last_name: c.last_name,
      age: c.age, member: c.member, paying_by: c.paying_by, status: c.status, withdrawn_reason: c.withdrawn_reason,
      withdrawn_at: c.withdrawn_at, withdrawn_by_name: c.withdrawn_by_name, duplicate_state: c.duplicate_state, duplicate_of: c.duplicate_of,
      version: c.version, created_at: c.created_at, signup_version: signup?.version ?? null, reference: signup?.reference ?? null,
      price_kind: signup?.price_kind ?? null, signed_up_on: signup?.signed_up_on ?? null, signed: signup ? signup.signed_at !== null : false,
      signature_deleted_at: signup?.signature_deleted_at ?? null, base_cents: c.base_cents, days, extras,
      total_cents: total, paid_cents: paid, owes_cents: owes,
      paid_on: last?.paid_on ?? null, paid_method: last?.method ?? null, last_payment_id: last?.id ?? null, last_payment_recorded_at: last?.recorded_at ?? null,
      paid_school: last?.school ?? null, // mock-only extra column (campsApi doesn't ask for it)
    };
  }

  // ----- Possible duplicates (§1.13) — the same steps as 0005 -----
  const personKey = (c) => `${nameKey(c.first_name)}|${nameKey(c.last_name)}`;
  const oldestFirst = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  // Another ACTIVE camper at the same camp with the same name, oldest first; a pair "kept both"
  // together with excludeId doesn't count. null = none.
  function findDuplicate(db, campId, excludeId, first, last) {
    const key = `${nameKey(first)}|${nameKey(last)}`;
    return db.camp_campers.filter((m) => m.camp_id === campId && m.status === 'active' && (excludeId === null || m.id !== excludeId)
      && personKey(m) === key && !(excludeId !== null && m.duplicate_state === 'kept_both' && m.duplicate_of === excludeId))
      .sort(oldestFirst)[0] ?? null;
  }
  function duplicateFlagsFor(db, campId, first, last) {
    const twin = findDuplicate(db, campId, null, first, last);
    return twin ? { duplicate_state: 'possible', duplicate_of: twin.id } : { duplicate_state: 'none', duplicate_of: null };
  }
  function recheckDuplicate(db, c, ctx) {
    if (!c) return;
    let changes;
    if (c.status !== 'active') {
      changes = { duplicate_state: 'none', duplicate_of: null };
    } else if (c.duplicate_state === 'kept_both' && c.duplicate_of !== null
      && db.camp_campers.some((m) => m.id === c.duplicate_of && m.status === 'active' && m.camp_id === c.camp_id && personKey(m) === personKey(c))) {
      return; // staff said these two are both real
    } else {
      const twin = findDuplicate(db, c.camp_id, c.id, c.first_name, c.last_name);
      changes = twin ? { duplicate_state: 'possible', duplicate_of: twin.id } : { duplicate_state: 'none', duplicate_of: null };
    }
    updateRow(c, changes, ctx);
  }
  function recheckPointingAt(db, camperId, ctx) {
    for (const r of db.camp_campers.filter((x) => x.duplicate_of === camperId).sort(byText('id'))) recheckDuplicate(db, r, ctx);
  }

  // ----- The 3-year signature clean-up (§1.19) -----
  // Called last in camp_add_camp and camp_mark_paid only. No version bump.
  function purgeOldSignatures(db) {
    const cutoff = yearsBefore(today(), SIGNATURE_KEEP_YEARS);
    const old = new Set(db.camps.filter((c) => (lastDayOf(db, c.id) ?? '9999') < cutoff).map((c) => c.id));
    const at = stamp();
    for (const s of db.camp_signups) {
      if (old.has(s.camp_id) && s.signature !== null) {
        s.signature = null;
        s.signature_deleted_at = at;
      }
    }
  }

  // A new public code (8 characters), made from a random uuid's bytes like the database does.
  function newPublicCode(db) {
    for (;;) {
      const hex = newId().replace(/-/g, '');
      let code = '';
      for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[parseInt(hex.slice(i * 2, i * 2 + 2), 16) % CODE_ALPHABET.length];
      if (!db.camps.some((c) => c.public_code === code)) return code;
    }
  }

  // The checks Add camp and Edit camp share (argument shape). Returns the cleaned values, null
  // (→ invalid) or EXTRAS_INVALID (→ { status:'invalid', field:'extras' }: section 4 of the dialog).
  const EXTRAS_INVALID = { problem: { status: 'invalid', field: 'extras' } };
  function readCampFields(a, withIds) {
    if (!LOCATION_CODES.includes(a.p_location_code) || typeof a.p_both_schools !== 'boolean' || !nameIsValid(a.p_name)) return null;
    if (!daysArgValid(a.p_days)) return null;
    if (!timeOnStep(a.p_start_time) || !timeOnStep(a.p_end_time) || a.p_end_time <= a.p_start_time) return null;
    if ([a.p_signup_opens_on, a.p_signup_closes_on, a.p_early_until].includes(null)) return null;
    if (a.p_signup_opens_on > a.p_signup_closes_on || a.p_early_until > a.p_signup_closes_on) return null;
    const days = [...a.p_days].sort();
    if (a.p_signup_closes_on > days[days.length - 1]) return null;
    if (!ageOk(a.p_min_age) || !ageOk(a.p_max_age) || a.p_min_age > a.p_max_age) return null;
    if (!pricesArgValid(a.p_prices, gridSizeFor(days))) return null; // rows 1…W (R2)
    if (!extrasArgValid(a.p_extras, withIds)) return EXTRAS_INVALID;
    if (a.p_extras.some((e) => (e.only_on ?? []).some((d) => !days.includes(d)))) return EXTRAS_INVALID; // not a camp day
    if (!descriptionOk(a.p_description) || !campTextIsValid(a.p_waiver_text, WAIVER_MAX)) return null;
    return {
      days,
      fields: {
        location_code: a.p_location_code, both_schools: a.p_both_schools, name: normalizeName(a.p_name),
        start_time: a.p_start_time, end_time: a.p_end_time, signup_opens_on: a.p_signup_opens_on, signup_closes_on: a.p_signup_closes_on,
        early_until: a.p_early_until, min_age: a.p_min_age, max_age: a.p_max_age,
        description: normalizeCampText(a.p_description), waiver_text: normalizeCampText(a.p_waiver_text),
      },
      prices: a.p_prices.map((p) => Object.fromEntries(PRICE_KEYS.map((k) => [k, p[k]]))),
      extras: a.p_extras.map((e, sort) => ({ id: withIds && e.id ? e.id.toLowerCase() : null, name: normalizeName(e.name), price_cents: e.price_cents, per: e.per, not_for_all_days: e.not_for_all_days, only_on: [...(e.only_on ?? [])].sort(), sort })),
    };
  }

  // The template fields (Edit template). Returns { status } on a problem, or the cleaned values.
  function readTemplateFields(a) {
    const offsets = { opensDaysBefore: a.p_opens_days_before, closesDaysBefore: a.p_closes_days_before, earlyDaysBefore: a.p_early_days_before };
    if (!nameIsValid(a.p_name) || !LOCATION_CODES.includes(a.p_location_code) || typeof a.p_both_schools !== 'boolean') return st('invalid');
    if (!Number.isInteger(a.p_day_count) || a.p_day_count < 1 || a.p_day_count > MAX_WEEK_DAYS) return st('invalid'); // days per week (R7)
    if (!timeOnStep(a.p_start_time) || !timeOnStep(a.p_end_time) || a.p_end_time <= a.p_start_time) return st('invalid');
    if (!offsetsAreValid(offsets)) return { status: 'invalid', field: 'offsets' };
    if (!ageOk(a.p_min_age) || !ageOk(a.p_max_age) || a.p_min_age > a.p_max_age) return st('invalid');
    if (!pricesArgValid(a.p_prices, a.p_day_count)) return st('invalid');
    if (!extrasArgValid(a.p_extras, false, true)) return { status: 'invalid', field: 'extras' };
    if (!descriptionOk(a.p_description) || !campTextIsValid(a.p_waiver_text, WAIVER_MAX)) return st('invalid');
    return {
      fields: {
        name: normalizeName(a.p_name), location_code: a.p_location_code, both_schools: a.p_both_schools, day_count: a.p_day_count,
        start_time: a.p_start_time, end_time: a.p_end_time, opens_days_before: a.p_opens_days_before, closes_days_before: a.p_closes_days_before,
        early_days_before: a.p_early_days_before, min_age: a.p_min_age, max_age: a.p_max_age,
        description: normalizeCampText(a.p_description), waiver_text: normalizeCampText(a.p_waiver_text),
        prices: a.p_prices.map((p) => Object.fromEntries(PRICE_KEYS.map((k) => [k, p[k]]))).sort((x, y) => x.day_count - y.day_count),
        extras: a.p_extras.map((e) => ({
          name: normalizeName(e.name), price_cents: e.price_cents, per: e.per, not_for_all_days: e.not_for_all_days,
          only_weekdays: [...(e.only_weekdays ?? [])].sort((x, y) => x - y),
        })),
      },
    };
  }
  const templateNameTaken = (db, name, exceptId) => db.camp_templates.some((t) => t.id !== exceptId && nameKey(t.name) === nameKey(name));

  // Removes campers (and everything under them) — the database's ON DELETE CASCADE.
  function dropCampers(db, ids) {
    db.camp_payments = db.camp_payments.filter((p) => !ids.has(p.camper_id));
    db.camp_camper_days = db.camp_camper_days.filter((r) => !ids.has(r.camper_id));
    db.camp_camper_extras = db.camp_camper_extras.filter((r) => !ids.has(r.camper_id));
    db.camp_campers = db.camp_campers.filter((c) => !ids.has(c.id));
  }

  // A camper's choice in campRules' Child shape (for priceChild / childProblem).
  const childOf = (dayIds, extras, member) => ({
    member, dayIds, extras: extras.map((e) => ({ extraId: e.extra_id.toLowerCase(), dayIds: e.day_ids.map((x) => x.toLowerCase()) })),
  });

  // The "who may" rule for check-in: owner decision 2026-10-19 (CP1) — any camp day, staff and
  // admins alike. Kept as one place so a rule could come back. null = allowed.
  function checkInRefusal() {
    return null;
  }

  // Staff may undo their OWN action for 10 seconds (0005 rule). A time in the future never counts.
  const withinUndo = (iso, ctx, byId) => ctx.userId !== null && byId === ctx.userId && now() - Date.parse(iso) >= 0 && now() - Date.parse(iso) < UNDO_WINDOW_MS;

  // ----- The staff functions (§1.14). Each returns the jsonb answer. -----
  // Order everywhere: (no_access → role, done in rpc) → invalid (argument shape) → not_found →
  // stale → data rules → write.

  const handlers = {
    camp_add_camp(db, a, ctx) {
      const v = readCampFields(a, false);
      if (!v) return st('invalid');
      if (v.problem) return v.problem;
      if (v.days.some((d) => d < today())) return st('invalid'); // every day today or later
      const camp = insertRow(db.camps, { id: newId(), ...v.fields, closed_by_hand: false, public_code: newPublicCode(db) }, ctx);
      v.days.forEach((day) => db.camp_days.push({ id: newId(), camp_id: camp.id, day }));
      v.prices.forEach((p) => db.camp_prices.push({ id: newId(), camp_id: camp.id, ...p }));
      v.extras.forEach(({ id, ...e }) => db.camp_extras.push({ ...e, id: newId(), camp_id: camp.id }));
      purgeOldSignatures(db); // the last step
      return { status: 'ok', id: camp.id, public_code: camp.public_code, version: camp.version };
    },

    camp_update_camp(db, a, ctx) {
      if (a.p_camp_id === null || a.p_expected_version === null) return st('invalid');
      const v = readCampFields(a, true);
      if (!v) return st('invalid');
      if (v.problem) return v.problem;
      const camp = findCamp(db, a.p_camp_id);
      if (!camp) return st('not_found');
      if (camp.version !== a.p_expected_version) return st('stale');
      const t = today();
      const current = dayRows(db, camp.id);
      const added = v.days.filter((d) => !current.some((c) => c.day === d));
      const removed = current.filter((c) => !v.days.includes(c.day));
      if (added.some((d) => d < t)) return st('invalid'); // new days today or later; kept past days are fine
      const currentExtras = extraRows(db, camp.id);
      if (v.extras.some((e) => e.id !== null && !currentExtras.some((c) => c.id === e.id))) return st('invalid'); // another camp's extra
      const removedExtras = currentExtras.filter((c) => !v.extras.some((e) => e.id === c.id));
      // Removing camp days must not empty an extra's "only on" list (that would silently mean
      // "every day"): an extra offered only on removed days → invalid (field 'extras').
      const removedDates = new Set(current.filter((c) => !v.days.includes(c.day)).map((c) => c.day));
      for (const e of v.extras) {
        const was = currentExtras.find((c) => c.id === e.id);
        const before = was?.only_on ?? [];
        if (before.length > 0 && e.only_on.length === 0 && before.every((d) => removedDates.has(d))) return { status: 'invalid', field: 'extras' };
      }
      const campers = db.camp_campers.filter((c) => c.camp_id === camp.id);
      const activeIds = new Set(campers.filter((c) => c.status === 'active').map((c) => c.id));
      // A removed day an ACTIVE camper picked → refused (v0.701), naming the oldest one.
      for (const day of removed) {
        const pickers = db.camp_camper_days.filter((r) => r.day_id === day.id && activeIds.has(r.camper_id))
          .map((r) => findCamper(db, r.camper_id)).sort(oldestFirst);
        if (pickers.length > 0) {
          return { status: 'not_empty', kind: 'day', day: day.day, first_name: pickers[0].first_name, last_name: pickers[0].last_name, more: pickers.length - 1 };
        }
      }
      for (const extra of removedExtras) {
        const choosers = new Set(db.camp_camper_extras.filter((r) => r.extra_id === extra.id && activeIds.has(r.camper_id)).map((r) => r.camper_id));
        if (choosers.size > 0) return { status: 'not_empty', kind: 'extra', extra_name: extra.name, count: choosers.size };
      }
      // An extra's "only on" days narrowed: an ACTIVE camper who chose a day no longer offered →
      // refused, naming the earliest such day (the same rule as A). Withdrawn campers' rows for
      // those days are deleted below.
      const keptDates = v.days;
      const narrowedRows = []; // [extra id, Set of day ids no longer offered]
      for (const e of v.extras.filter((x) => x.id)) {
        const was = currentExtras.find((c) => c.id === e.id);
        const gone = extraDaysRemoved(was.only_on ?? [], e.only_on, keptDates);
        if (gone.length === 0) continue;
        const goneIds = new Set(current.filter((d) => gone.includes(d.day)).map((d) => d.id));
        narrowedRows.push([e.id, goneIds]);
        for (const date of gone) {
          const dayId = current.find((d) => d.day === date).id;
          const choosers = new Set(db.camp_camper_extras.filter((r) => r.extra_id === e.id && r.day_id === dayId && activeIds.has(r.camper_id)).map((r) => r.camper_id));
          if (choosers.size > 0) return { status: 'not_empty', kind: 'extra_day', extra_name: e.name, day: date, count: choosers.size };
        }
      }
      for (const [extraId, goneIds] of narrowedRows) {
        db.camp_camper_extras = db.camp_camper_extras.filter((r) => !(r.extra_id === extraId && goneIds.has(r.day_id)));
      }
      // Write. Withdrawn campers' rows for removed days / extras go first, then the days / extras.
      const removedDayIds = new Set(removed.map((d) => d.id));
      const removedExtraIds = new Set(removedExtras.map((e) => e.id));
      db.camp_camper_days = db.camp_camper_days.filter((r) => !removedDayIds.has(r.day_id));
      db.camp_camper_extras = db.camp_camper_extras.filter((r) => !removedDayIds.has(r.day_id) && !removedExtraIds.has(r.extra_id));
      db.camp_days = db.camp_days.filter((d) => !removedDayIds.has(d.id));
      added.forEach((day) => db.camp_days.push({ id: newId(), camp_id: camp.id, day }));
      db.camp_extras = db.camp_extras.filter((e) => !removedExtraIds.has(e.id));
      for (const e of v.extras) {
        if (e.id) Object.assign(db.camp_extras.find((x) => x.id === e.id), { name: e.name, price_cents: e.price_cents, per: e.per, not_for_all_days: e.not_for_all_days, only_on: e.only_on, sort: e.sort });
        else db.camp_extras.push({ id: newId(), camp_id: camp.id, name: e.name, price_cents: e.price_cents, per: e.per, not_for_all_days: e.not_for_all_days, only_on: e.only_on, sort: e.sort });
      }
      db.camp_prices = db.camp_prices.filter((p) => p.camp_id !== camp.id); // the grid is replaced
      v.prices.forEach((p) => db.camp_prices.push({ id: newId(), camp_id: camp.id, ...p }));
      // Existing campers' prices are untouched. Every change bumps the camp's version.
      updateRow(camp, v.fields, ctx, true);
      return { status: 'ok', version: camp.version };
    },

    camp_set_signup(db, a, ctx) {
      if (a.p_camp_id === null || a.p_expected_version === null || a.p_open === null) return st('invalid');
      const camp = findCamp(db, a.p_camp_id);
      if (!camp) return st('not_found');
      if (camp.version !== a.p_expected_version) return st('stale');
      if (stateOf(db, camp) === 'finished') return st('finished');
      const changes = { closed_by_hand: !a.p_open };
      if (a.p_open && today() > camp.signup_closes_on) {
        if (!ctx.isAdmin) return st('not_allowed'); // "The closing date has passed. Ask an admin to reopen."
        changes.signup_closes_on = lastDayOf(db, camp.id); // admin: open until the last day
      }
      updateRow(camp, changes, ctx);
      return { status: 'ok', version: camp.version, state: stateOf(db, camp) };
    },

    camp_delete_camp(db, a) {
      if ([a.p_camp_id, a.p_expected_version, a.p_expected_camper_count, a.p_expected_payment_total_cents].includes(null)) return st('invalid');
      const camp = findCamp(db, a.p_camp_id);
      if (!camp) return st('not_found');
      if (camp.version !== a.p_expected_version) return st('stale');
      const ids = new Set(db.camp_campers.filter((c) => c.camp_id === camp.id).map((c) => c.id));
      const total = sum(db.camp_payments.filter((p) => ids.has(p.camper_id)).map((p) => p.amount_cents)); // net of reversals
      if (ids.size !== a.p_expected_camper_count || total !== a.p_expected_payment_total_cents) return st('stale');
      dropCampers(db, ids);
      db.camp_signups = db.camp_signups.filter((s) => s.camp_id !== camp.id);
      db.camp_days = db.camp_days.filter((d) => d.camp_id !== camp.id);
      db.camp_prices = db.camp_prices.filter((p) => p.camp_id !== camp.id);
      db.camp_extras = db.camp_extras.filter((e) => e.camp_id !== camp.id);
      db.camps = db.camps.filter((c) => c.id !== camp.id);
      return st('ok');
    },

    camp_save_template(db, a, ctx) {
      if (a.p_camp_id === null || !nameIsValid(a.p_name)) return st('invalid');
      const camp = findCamp(db, a.p_camp_id);
      if (!camp) return st('not_found');
      const name = normalizeName(a.p_name);
      const days = daysView(db, camp.id);
      const offsets = templateFromCamp(campView(camp), days);
      if (!offsetsAreValid(offsets)) return { status: 'invalid', field: 'offsets' };
      if (templateNameTaken(db, name, null)) return st('duplicate_name');
      const template = insertRow(db.camp_templates, {
        id: newId(), name, location_code: camp.location_code, both_schools: camp.both_schools, day_count: gridSizeFor(days), // W (R7)
        start_time: camp.start_time, end_time: camp.end_time, opens_days_before: offsets.opensDaysBefore,
        closes_days_before: offsets.closesDaysBefore, early_days_before: offsets.earlyDaysBefore, min_age: camp.min_age, max_age: camp.max_age,
        description: camp.description, waiver_text: camp.waiver_text,
        prices: db.camp_prices.filter((p) => p.camp_id === camp.id).sort((x, y) => x.day_count - y.day_count).map((p) => Object.fromEntries(PRICE_KEYS.map((k) => [k, p[k]]))),
        extras: extraRows(db, camp.id).map((e) => ({ name: e.name, price_cents: e.price_cents, per: e.per, not_for_all_days: e.not_for_all_days, only_weekdays: onlyOnToWeekdays(e.only_on ?? []) })),
      }, ctx);
      return { status: 'ok', id: template.id, version: template.version };
    },

    camp_update_template(db, a, ctx) {
      if (a.p_template_id === null || a.p_expected_version === null) return st('invalid');
      const v = readTemplateFields(a);
      if (v.status) return v;
      const template = db.camp_templates.find((t) => t.id === a.p_template_id);
      if (!template) return st('not_found');
      if (template.version !== a.p_expected_version) return st('stale');
      if (templateNameTaken(db, v.fields.name, template.id)) return st('duplicate_name');
      updateRow(template, v.fields, ctx);
      return { status: 'ok', version: template.version };
    },

    camp_delete_template(db, a) {
      if (a.p_template_id === null || a.p_expected_version === null) return st('invalid');
      const template = db.camp_templates.find((t) => t.id === a.p_template_id);
      if (!template) return st('not_found');
      if (template.version !== a.p_expected_version) return st('stale');
      db.camp_templates = db.camp_templates.filter((t) => t.id !== template.id); // never touches camps
      return st('ok');
    },

    camp_update_details(db, a, ctx) {
      if (a.p_camper_id === null || a.p_camper_version === null || a.p_signup_version === null) return st('invalid');
      if (!nameIsValid(a.p_first) || !nameIsValid(a.p_last) || !ageOk(a.p_age) || typeof a.p_member !== 'boolean') return st('invalid');
      if (!Array.isArray(a.p_day_ids) || a.p_day_ids.length < 1 || a.p_day_ids.length > MAX_DAYS || a.p_day_ids.includes(null) || hasDuplicates(a.p_day_ids)) return st('invalid');
      if (!camperExtrasArgValid(a.p_extras)) return st('invalid');
      if (!nameIsValid(a.p_parent_name) || !nameIsValid(a.p_emergency_name)) return st('invalid');
      if (!phoneIsValid(a.p_parent_phone) || !phoneIsValid(a.p_emergency_phone)) return st('invalid');
      if (!lineIsValid(a.p_parent_relation, RELATION_MAX) || !lineIsValid(a.p_emergency_relation, RELATION_MAX)) return st('invalid');
      const camper = findCamper(db, a.p_camper_id);
      if (!camper) return st('not_found');
      const signup = signupOf(db, camper);
      if (camper.version !== a.p_camper_version || signup.version !== a.p_signup_version) return st('stale');
      if (camper.status === 'withdrawn') return st('withdrawn');
      const days = daysView(db, camper.camp_id);
      const prices = pricesView(db, camper.camp_id);
      const extras = extrasView(db, camper.camp_id);
      const child = childOf(a.p_day_ids, a.p_extras, a.p_member);
      const problem = childProblem(child, prices, extras, days, signup.price_kind);
      if (problem !== null && problem !== 'too_expensive') return st('invalid'); // incl. not-for-all-days (P8)
      // Removing a day the camper was checked in on is refused.
      const oldDays = camperDayRows(db, camper.id);
      const dropped = oldDays.filter((r) => !a.p_day_ids.includes(r.day_id));
      const checked = dropped.filter((r) => r.checked_in_at !== null).map((r) => db.camp_days.find((d) => d.id === r.day_id)?.day).sort();
      if (checked.length > 0) return { status: 'checked_in', day: checked[0] };
      // The new extra rows: once → one row without a day; per day → one row per day.
      const wanted = [];
      for (const pick of child.extras) {
        const extra = extras.find((e) => e.extraId === pick.extraId);
        if (extra.per === 'once') wanted.push({ extra_id: extra.extraId, day_id: null });
        else pick.dayIds.forEach((dayId) => wanted.push({ extra_id: extra.extraId, day_id: dayId }));
      }
      const rowKey = (r) => `${r.extra_id}|${r.day_id ?? ''}`;
      const oldExtras = camperExtraRows(db, camper.id);
      const daysChanged = !sameSet(oldDays.map((r) => r.day_id), a.p_day_ids);
      const extrasChanged = !sameSet(oldExtras.map(rowKey), wanted.map(rowKey));
      const reprice = daysChanged || extrasChanged || a.p_member !== camper.member;
      // The re-price rule (v0.700): any change to days, member box or extras re-prices the WHOLE
      // camper at the camp's CURRENT prices, with the sign-up's early / regular kept.
      const priced = priceChild(child, prices, extras, days, signup.price_kind);
      const newBase = reprice ? priced.baseCents : camper.base_cents;
      if (newBase === null) return st('invalid');
      const extraPrice = (extraId) => extras.find((e) => e.extraId === extraId).priceCents;
      const newTotal = reprice ? priced.totalCents : camper.base_cents + sum(oldExtras.map((r) => r.price_cents));
      if (newTotal > MAX_CAMPER_CENTS) return st('invalid');
      // Write: days diffed (kept rows keep their check-in), extras replaced at the current prices.
      if (daysChanged) {
        const droppedIds = new Set(dropped.map((r) => r.id));
        db.camp_camper_days = db.camp_camper_days.filter((r) => !droppedIds.has(r.id));
        a.p_day_ids.filter((id) => !oldDays.some((r) => r.day_id === id)).forEach((dayId) => db.camp_camper_days.push({
          id: newId(), camper_id: camper.id, day_id: dayId, checked_in_at: null, checked_in_by: null, checked_in_by_name: null,
        }));
      }
      if (reprice) {
        db.camp_camper_extras = db.camp_camper_extras.filter((r) => r.camper_id !== camper.id);
        wanted.forEach((r) => db.camp_camper_extras.push({ id: newId(), camper_id: camper.id, ...r, price_cents: extraPrice(r.extra_id) }));
      }
      const nameChanged = nameKey(a.p_first) !== nameKey(camper.first_name) || nameKey(a.p_last) !== nameKey(camper.last_name);
      updateRow(camper, { first_name: normalizeName(a.p_first), last_name: normalizeName(a.p_last), age: a.p_age, member: a.p_member, base_cents: newBase }, ctx, reprice);
      updateRow(signup, {
        parent_name: normalizeName(a.p_parent_name), parent_phone: a.p_parent_phone, parent_relation: normalizeName(a.p_parent_relation),
        emergency_name: normalizeName(a.p_emergency_name), emergency_phone: a.p_emergency_phone, emergency_relation: normalizeName(a.p_emergency_relation),
      }, ctx);
      if (nameChanged) {
        recheckDuplicate(db, camper, ctx);
        recheckPointingAt(db, camper.id, ctx);
      }
      const m = money(db, camper);
      return { status: 'ok', camper_version: camper.version, signup_version: signup.version, total_cents: m.total, owes_cents: m.owes };
    },

    camp_change_paying_by(db, a, ctx) {
      if (a.p_camper_id === null || a.p_expected_version === null || !PAYING_BY.includes(a.p_paying_by)) return st('invalid');
      const camper = findCamper(db, a.p_camper_id);
      if (!camper) return st('not_found');
      if (camper.version !== a.p_expected_version) return st('stale');
      if (camper.status === 'withdrawn') return st('withdrawn');
      if (money(db, camper).owes <= 0) return st('already_paid');
      updateRow(camper, { paying_by: a.p_paying_by }, ctx);
      return { status: 'ok', version: camper.version };
    },

    camp_mark_paid(db, a, ctx) {
      if (a.p_camper_id === null || a.p_expected_version === null) return st('invalid');
      if (!LOCATION_CODES.includes(a.p_school)) return { status: 'invalid', field: 'school' }; // the desk's school (v0.707)
      const camper = findCamper(db, a.p_camper_id);
      if (!camper) return st('not_found');
      if (camper.version !== a.p_expected_version) return st('stale');
      if (camper.status === 'withdrawn') return st('withdrawn');
      const { owes } = money(db, camper);
      if (owes <= 0) return st('already_paid');
      if (owes > MAX_PAYMENT_CENTS) return st('invalid');
      const payment = {
        id: newId(), camper_id: camper.id, kind: 'payment', amount_cents: owes, method: camper.paying_by, paid_on: today(),
        recorded_at: stamp(), recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName, reverses_payment_id: null,
        school: a.p_school,
      };
      db.camp_payments.push(payment);
      updateRow(camper, {}, ctx, true); // a double click with the old version now gets 'stale'
      purgeOldSignatures(db); // the last step
      return { status: 'ok', payment_id: payment.id, amount_cents: owes, method: payment.method, version: camper.version, school: payment.school };
    },

    camp_undo_payment(db, a, ctx) {
      if (a.p_payment_id === null) return st('invalid');
      const payment = db.camp_payments.find((p) => p.id === a.p_payment_id);
      if (!payment) return st('not_found');
      // Admins any time; staff only their OWN payment, recorded less than 10 seconds ago.
      if (!ctx.isAdmin && !withinUndo(payment.recorded_at, ctx, payment.recorded_by)) return st('not_allowed');
      if (payment.kind !== 'payment' || isReversed(db, payment.id)) return st('stale'); // already undone / a reversal
      const camper = findCamper(db, payment.camper_id);
      db.camp_payments.push({
        id: newId(), camper_id: camper.id, kind: 'reversal', amount_cents: -payment.amount_cents, method: payment.method, paid_on: today(),
        recorded_at: stamp(), recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName, reverses_payment_id: payment.id,
        school: payment.school, // an undo lands in the same drawer as the payment
      });
      updateRow(camper, {}, ctx, true);
      return { status: 'ok', version: camper.version };
    },

    camp_edit_payment(db, a, ctx) {
      if (a.p_payment_id === null || !PAYING_BY.includes(a.p_method) || a.p_paid_on === null || a.p_paid_on > today()) return st('invalid');
      if (a.p_amount_cents === null || a.p_amount_cents < 1 || a.p_amount_cents > MAX_PAYMENT_CENTS) return st('invalid');
      if (!LOCATION_CODES.includes(a.p_school)) return { status: 'invalid', field: 'school' };
      const payment = db.camp_payments.find((p) => p.id === a.p_payment_id);
      if (!payment) return st('not_found');
      if (payment.kind !== 'payment' || isReversed(db, payment.id)) return st('stale');
      const camper = findCamper(db, payment.camper_id);
      const common = { camper_id: camper.id, recorded_at: stamp(), recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName };
      db.camp_payments.push({ id: newId(), ...common, kind: 'reversal', amount_cents: -payment.amount_cents, method: payment.method, paid_on: today(), reverses_payment_id: payment.id, school: payment.school });
      // The new row may correct the school (the reversal stays with the old one's school).
      const replacement = { id: newId(), ...common, kind: 'payment', amount_cents: a.p_amount_cents, method: a.p_method, paid_on: a.p_paid_on, reverses_payment_id: null, school: a.p_school };
      db.camp_payments.push(replacement);
      updateRow(camper, {}, ctx, true);
      return { status: 'ok', payment_id: replacement.id, version: camper.version };
    },

    camp_resolve_duplicate(db, a, ctx) {
      if ([a.p_keep_id, a.p_keep_version, a.p_other_id, a.p_other_version, a.p_keep_both].includes(null)) return st('invalid');
      if (a.p_keep_id === a.p_other_id) return st('invalid');
      const keep = findCamper(db, a.p_keep_id);
      const other = findCamper(db, a.p_other_id);
      if (!keep || !other) return st('not_found');
      if (keep.camp_id !== other.camp_id) return st('invalid');
      if (keep.version !== a.p_keep_version || other.version !== a.p_other_version) return st('stale');
      const isPair = (other.duplicate_state === 'possible' && other.duplicate_of === keep.id)
        || (keep.duplicate_state === 'possible' && keep.duplicate_of === other.id);
      if (keep.status !== 'active' || other.status !== 'active' || !isPair) return st('stale');
      // After the camp's last day, "keep one" is for admins only (Color Belt v0.194).
      if (!a.p_keep_both && today() > lastDayOf(db, keep.camp_id) && !ctx.isAdmin) return st('not_allowed');
      if (a.p_keep_both) {
        updateRow(keep, { duplicate_state: 'kept_both', duplicate_of: other.id }, ctx);
        updateRow(other, { duplicate_state: 'kept_both', duplicate_of: keep.id }, ctx);
      } else {
        updateRow(other, {
          status: 'withdrawn', withdrawn_reason: 'duplicate_copy', withdrawn_at: stamp(), withdrawn_by: ctx.userId ?? null,
          withdrawn_by_name: ctx.actorName, duplicate_state: 'none', duplicate_of: null,
        }, ctx);
        recheckDuplicate(db, keep, ctx);
        recheckPointingAt(db, other.id, ctx);
      }
      return { status: 'ok', keep_version: keep.version, other_version: other.version };
    },

    camp_withdraw_camper(db, a, ctx) {
      if (a.p_camper_id === null || a.p_expected_version === null) return st('invalid');
      const camper = findCamper(db, a.p_camper_id);
      if (!camper) return st('not_found');
      if (camper.version !== a.p_expected_version) return st('stale');
      if (camper.status === 'withdrawn') return st('withdrawn');
      updateRow(camper, {
        status: 'withdrawn', withdrawn_reason: 'withdrawn', withdrawn_at: stamp(), withdrawn_by: ctx.userId ?? null,
        withdrawn_by_name: ctx.actorName, duplicate_state: 'none', duplicate_of: null,
      }, ctx);
      recheckPointingAt(db, camper.id, ctx); // payments are kept
      return { status: 'ok', version: camper.version };
    },

    camp_restore_camper(db, a, ctx) {
      if (a.p_camper_id === null || a.p_expected_version === null) return st('invalid');
      const camper = findCamper(db, a.p_camper_id);
      if (!camper) return st('not_found');
      // A "Duplicate copy": admins, or the staff member who made it within 10 seconds (the
      // toast's Undo). An ordinary withdrawal: staff and admins (v0.700).
      if (camper.withdrawn_reason === 'duplicate_copy' && !ctx.isAdmin && !withinUndo(camper.withdrawn_at, ctx, camper.withdrawn_by)) return st('not_allowed');
      if (camper.version !== a.p_expected_version) return st('stale');
      if (camper.status !== 'withdrawn') return st('invalid'); // nothing to restore
      updateRow(camper, { status: 'active', withdrawn_reason: null, withdrawn_at: null, withdrawn_by: null, withdrawn_by_name: null }, ctx);
      recheckDuplicate(db, camper, ctx);
      if (camper.duplicate_of !== null) recheckDuplicate(db, findCamper(db, camper.duplicate_of), ctx);
      recheckPointingAt(db, camper.id, ctx);
      return { status: 'ok', version: camper.version };
    },

    camp_delete_camper(db, a, ctx) {
      if (a.p_camper_id === null || a.p_expected_version === null || a.p_expected_payment_ids === null) return st('invalid');
      if (a.p_expected_payment_ids.includes(null) || hasDuplicates(a.p_expected_payment_ids)) return st('invalid');
      const camper = findCamper(db, a.p_camper_id);
      if (!camper) return st('not_found');
      if (camper.version !== a.p_expected_version) return st('stale');
      if (!sameSet(paymentsOf(db, camper.id).map((p) => p.id), a.p_expected_payment_ids)) return st('stale');
      const pointing = db.camp_campers.filter((r) => r.duplicate_of === camper.id).sort(byText('id'));
      dropCampers(db, new Set([camper.id]));
      // The sign-up's last camper also removes the sign-up.
      if (!db.camp_campers.some((c) => c.signup_id === camper.signup_id)) db.camp_signups = db.camp_signups.filter((s) => s.id !== camper.signup_id);
      for (const r of pointing) {
        updateRow(r, { duplicate_of: null }, ctx); // ON DELETE SET NULL
        recheckDuplicate(db, r, ctx);
      }
      return st('ok');
    },

    camp_check_in(db, a, ctx) {
      if (a.p_camper_id === null || a.p_day_id === null) return st('invalid');
      const camper = findCamper(db, a.p_camper_id);
      if (!camper) return st('not_found');
      if (camper.status === 'withdrawn') return st('withdrawn');
      const row = camperDayRows(db, camper.id).find((r) => r.day_id === a.p_day_id);
      if (!row) return st('not_found'); // not one of the camper's days
      const refusal = checkInRefusal();
      if (refusal) return refusal;
      if (row.checked_in_at !== null) return { status: 'ok', checked_in_at: row.checked_in_at, checked_in_by_name: row.checked_in_by_name, already: true };
      Object.assign(row, { checked_in_at: stamp(), checked_in_by: ctx.userId ?? null, checked_in_by_name: ctx.actorName }); // no version bump
      return { status: 'ok', checked_in_at: row.checked_in_at, checked_in_by_name: row.checked_in_by_name, already: false };
    },

    camp_undo_check_in(db, a, ctx) {
      if (a.p_camper_id === null || a.p_day_id === null) return st('invalid');
      const camper = findCamper(db, a.p_camper_id);
      if (!camper) return st('not_found');
      if (camper.status === 'withdrawn') return st('withdrawn');
      const row = camperDayRows(db, camper.id).find((r) => r.day_id === a.p_day_id);
      if (!row) return st('not_found');
      const refusal = checkInRefusal();
      if (refusal) return refusal;
      Object.assign(row, { checked_in_at: null, checked_in_by: null, checked_in_by_name: null }); // not checked in → nothing to do
      return st('ok');
    },

    // Camper detail (stable, read only): the only way the app sees phones.
    camp_camper_detail(db, a) {
      if (a.p_camper_id === null) return st('invalid');
      const camper = findCamper(db, a.p_camper_id);
      if (!camper) return st('not_found');
      const signup = signupOf(db, camper);
      const row = rosterRow(db, camper);
      const extras = [];
      for (const e of row.extras) {
        let item = extras.find((x) => x.extra_id === e.extra_id);
        if (!item) extras.push((item = { extra_id: e.extra_id, name: e.name, per: e.per, days: [], cents: 0 }));
        if (e.day) item.days.push(e.day);
        item.cents += e.price_cents;
      }
      return {
        status: 'ok',
        camper: row,
        family: {
          parent_name: signup.parent_name, parent_phone: signup.parent_phone, parent_relation: signup.parent_relation,
          emergency_name: signup.emergency_name, emergency_phone: signup.emergency_phone, emergency_relation: signup.emergency_relation,
        },
        breakdown: {
          day_count: row.days.length, price_kind: signup.price_kind, member: camper.member, base_cents: camper.base_cents,
          weeks: weeksOf(db, camper, row, signup.price_kind),
          extras: extras.map(({ extra_id, ...rest }) => rest),
          total_cents: row.total_cents, paid_cents: row.paid_cents, owes_cents: row.owes_cents,
        },
        payments: paymentsOf(db, camper.id).sort(byText('recorded_at')).map((p) => ({
          id: p.id, kind: p.kind, amount_cents: p.amount_cents, method: p.method, paid_on: p.paid_on, recorded_at: p.recorded_at,
          recorded_by_name: p.recorded_by_name, reverses_payment_id: p.reverses_payment_id, school: p.school,
        })),
        checkins: row.days.map((d) => ({ day: d.day, checked_in_at: d.checked_in_at, checked_in_by_name: d.checked_in_by_name })),
      };
    },
  };
  const READ_ONLY = new Set(CAMP_READ_RPC_NAMES);

  // ----- The public functions (only camps_registrar may call them, §1.16) -----

  // camp_public_camp(p_code): what the family page may know about ONE camp.
  function publicCampAnswer(db, camp) {
    const t = today();
    const s = school(camp.location_code);
    return {
      status: 'ok',
      state: stateOf(db, camp),
      opens_on: camp.signup_opens_on,
      closed_on: camp.closed_by_hand ? null : camp.signup_closes_on,
      price_kind_today: priceKind(t, camp.early_until),
      ack_version: CAMP_ACK_VERSION,
      waiver_version: md5(camp.waiver_text),
      camp: {
        name: camp.name,
        days: dayRows(db, camp.id).map((d) => ({ day_id: d.id, day: d.day })),
        start_time: camp.start_time.slice(0, 5), end_time: camp.end_time.slice(0, 5),
        both_schools: camp.both_schools, school_name: s.name, address: s.address,
        description: camp.description, waiver_text: camp.waiver_text, early_until: camp.early_until, signup_closes_on: camp.signup_closes_on,
        min_age: camp.min_age, max_age: camp.max_age,
        prices: db.camp_prices.filter((p) => p.camp_id === camp.id).sort((x, y) => x.day_count - y.day_count).map((p) => Object.fromEntries(PRICE_KEYS.map((k) => [k, p[k]]))),
        extras: extraRows(db, camp.id).map((e) => ({ extra_id: e.id, name: e.name, price_cents: e.price_cents, per: e.per, not_for_all_days: e.not_for_all_days, only_on: e.only_on ?? [] })),
      },
    };
  }
  const campByCode = (db, code) => (typeof code === 'string' && CODE_PATTERN.test(code) ? db.camps.find((c) => c.public_code === code) ?? null : null);

  function publicCamp(code) {
    const db = read();
    const camp = campByCode(db, code);
    return camp ? publicCampAnswer(db, camp) : st('not_found');
  }

  // The ok answer of a sign-up (also what a repeated send of the same form gets).
  function signedUpAnswer(db, signup) {
    const camp = findCamp(db, signup.camp_id);
    const s = school(camp.location_code);
    const campers = db.camp_campers.filter((c) => c.signup_id === signup.id).sort((a, b) => a.position - b.position);
    const children = campers.map((c) => {
      const row = rosterRow(db, c);
      const extras = [];
      for (const e of row.extras) {
        let item = extras.find((x) => x.extra_id === e.extra_id);
        if (!item) extras.push((item = { extra_id: e.extra_id, name: e.name, per: e.per, count: 0, cents: 0 }));
        item.count += 1;
        item.cents += e.price_cents;
      }
      return {
        first_name: c.first_name, last_name: c.last_name, day_count: row.days.length, days: row.days.map((d) => d.day),
        price_kind: signup.price_kind, base_cents: c.base_cents, weeks: weeksOf(db, c, row, signup.price_kind),
        extras: extras.map(({ extra_id, ...rest }) => rest),

        total_cents: row.total_cents,
      };
    });
    return {
      status: 'ok', reference: signup.reference, paying_by: campers[0]?.paying_by ?? null,
      family_total_cents: sum(children.map((c) => c.total_cents)),
      children,
      camp: {
        name: camp.name, days: dayRows(db, camp.id).map((d) => ({ day_id: d.id, day: d.day })),
        start_time: camp.start_time.slice(0, 5), end_time: camp.end_time.slice(0, 5),
        school_name: s.name, both_schools: camp.both_schools, address: s.address, description: camp.description,
      },
    };
  }

  // The core of camp_public_signup, steps 1–12 of §1.16. Works on `db` (a private copy: the
  // wrapper keeps it only when the answer is ok). Returns { answer, campId }.
  function signupCore(db, args, flags) {
    const camp = campByCode(db, args.code);
    if (!camp) return { answer: st('not_found'), campId: null }; // 1
    const campId = camp.id;
    const out = (answer) => ({ answer, campId });
    if (!childrenArgValid(args.children)) return out(st('invalid')); // 2 (before any cast)
    const submissionId = uuidText(args.submission_id) ? args.submission_id.toLowerCase() : null;
    if (submissionId !== null) { // 3 the same form sent twice (double tap, retry)
      const earlier = db.camp_signups.find((s) => s.submission_id === submissionId);
      if (earlier) return out(earlier.camp_id === campId ? signedUpAnswer(db, earlier) : st('invalid'));
    }
    const state = stateOf(db, camp); // 4–5
    if (state === 'not_open_yet') return out({ status: 'not_open', opens_on: camp.signup_opens_on });
    if (state === 'closed') return out({ status: 'closed', closed_on: camp.closed_by_hand ? null : camp.signup_closes_on });
    if (state === 'finished') return out(st('finished'));
    const key = typeof args.client_key === 'string' ? args.client_key : '';
    const argsOk = key.length >= 1 && key.length <= 200 && submissionId !== null // 6
      && nameIsValid(args.parent_name) && nameIsValid(args.emergency_name)
      && phoneIsValid(args.parent_phone) && phoneIsValid(args.emergency_phone)
      && lineIsValid(args.parent_relation, RELATION_MAX) && lineIsValid(args.emergency_relation, RELATION_MAX)
      && PAYING_BY.includes(args.paying_by) && args.acknowledged === true && signatureIsValid(args.signature)
      && args.ack_version === CAMP_ACK_VERSION && typeof args.waiver_version === 'string' && /^[0-9a-f]{32}$/i.test(args.waiver_version)
      && Number.isInteger(args.expected_total_cents)
      && args.children.every((c) => nameIsValid(c.first_name) && nameIsValid(c.last_name));
    if (!argsOk) return out(st('invalid'));
    const nowMs = now();
    const recent = db.camp_public_attempts.filter((r) => r.client_key === key && nowMs - Date.parse(r.at) < HOUR_MS).length;
    if (flags.forceRateLimited || recent >= CAMP_TRIES_PER_HOUR) return out(st('rate_limited')); // 7
    const days = daysView(db, campId);
    const prices = pricesView(db, campId);
    const extras = extrasView(db, campId);
    const children = args.children.map((c) => childOf(c.day_ids.map((x) => x.toLowerCase()), c.extras, c.member));
    // 8 the camp changed while the family filled the form
    const dayIds = new Set(days.map((d) => d.dayId));
    const extraIds = new Set(extras.map((e) => e.extraId));
    const dateOf = new Map(days.map((d) => [d.dayId, d.day]));
    const notOfferedAnyMore = (c) => c.extras.some((pick) => {
      const extra = extras.find((e) => e.extraId === pick.extraId);
      return extra && pick.dayIds.some((id) => dateOf.has(id) && !extraOfferedOn(extra, dateOf.get(id)));
    });
    const changed = flags.forceCampChanged || children.some(notOfferedAnyMore)
      || children.some((c) => c.dayIds.some((id) => !dayIds.has(id)) || c.extras.some((e) => !extraIds.has(e.extraId)))
      || args.children.some((c) => c.age < camp.min_age || c.age > camp.max_age)
      || args.waiver_version.toLowerCase() !== md5(camp.waiver_text);
    if (changed) return out({ status: 'camp_changed', camp: publicCampAnswer(db, camp) });
    const kind = priceKind(today(), camp.early_until); // 9 + 10
    for (const c of children) {
      const problem = childProblem(c, prices, extras, days, kind);
      if (problem !== null) return out(st('invalid')); // the §1.10 rules, and over $10,000
    }
    const priced = children.map((c) => priceChild(c, prices, extras, days, kind));
    if (priced.some((p) => p.baseCents === null)) return out(st('invalid'));
    const total = sum(priced.map((p) => p.totalCents));
    if (total !== args.expected_total_cents) {
      return out({ status: 'price_changed', new_total_cents: total, old_total_cents: args.expected_total_cents, camp: publicCampAnswer(db, camp) });
    }
    // 11 write (actor "Family form")
    const ctx = { actorName: FAMILY_FORM, userId: null };
    const at = stamp();
    const signup = insertRow(db.camp_signups, {
      id: newId(), camp_id: campId, reference: `CP-${db.next_reference++}`, submission_id: submissionId,
      parent_name: normalizeName(args.parent_name), parent_phone: args.parent_phone, parent_relation: normalizeName(args.parent_relation),
      emergency_name: normalizeName(args.emergency_name), emergency_phone: args.emergency_phone, emergency_relation: normalizeName(args.emergency_relation),
      price_kind: kind, signed_up_on: today(), signature: args.signature, signed_at: at, signature_deleted_at: null,
      waiver_text_signed: camp.waiver_text, ack_version: args.ack_version,
    }, ctx);
    args.children.forEach((input, i) => {
      const child = children[i];
      const camper = insertRow(db.camp_campers, {
        id: newId(), signup_id: signup.id, camp_id: campId, position: i + 1, first_name: normalizeName(input.first_name),
        last_name: normalizeName(input.last_name), age: input.age, member: input.member, paying_by: args.paying_by,
        base_cents: priced[i].baseCents, status: 'active', withdrawn_reason: null, withdrawn_at: null, withdrawn_by: null, withdrawn_by_name: null,
        ...duplicateFlagsFor(db, campId, input.first_name, input.last_name), // flagged silently — the family isn't told
      }, ctx);
      child.dayIds.forEach((dayId) => db.camp_camper_days.push({ id: newId(), camper_id: camper.id, day_id: dayId, checked_in_at: null, checked_in_by: null, checked_in_by_name: null }));
      for (const pick of child.extras) {
        const extra = extras.find((e) => e.extraId === pick.extraId);
        const list = extra.per === 'once' ? [null] : pick.dayIds;
        list.forEach((dayId) => db.camp_camper_extras.push({ id: newId(), camper_id: camper.id, extra_id: extra.extraId, day_id: dayId, price_cents: extra.priceCents }));
      }
    });
    return out(signedUpAnswer(db, signup)); // 12
  }

  // camp_public_signup(...) — the wrapper. args use the database's argument names without "p_":
  //   { code, client_key, submission_id, children, parent_name, parent_phone, parent_relation,
  //     emergency_name, emergency_phone, emergency_relation, paying_by, acknowledged, signature,
  //     ack_version, waiver_version, expected_total_cents }
  // flags (preview helpers): forceRateLimited, forcePriceChanged (an "admin" raises every price
  // of this camp by $5 just before), forceCampChanged (answers camp_changed once).
  // Every call writes one rate-limit row (outcome = the status returned) — even refusals.
  function publicSignup(args = {}, flags = {}) {
    let db = read();
    const nowMs = now();
    db.camp_public_attempts = db.camp_public_attempts.filter((r) => nowMs - Date.parse(r.at) <= ATTEMPT_KEEP_MS); // older than 2 days
    if (flags.forcePriceChanged) {
      const camp = campByCode(db, args.code);
      if (camp) {
        for (const p of db.camp_prices.filter((x) => x.camp_id === camp.id)) {
          for (const k of PRICE_KEYS.slice(1)) p[k] = Math.min(100000, p[k] + 500);
        }
        updateRow(camp, {}, { actorName: 'Other Admin', userId: null }, true);
      }
    }
    const work = clone(db);
    const { answer, campId } = signupCore(work, args, flags);
    if (answer.status === 'ok') db = work; // anything else: everything the core did is undone
    const key = typeof args.client_key === 'string' ? args.client_key : '';
    db.camp_public_attempts.push({ id: db.next_attempt_id++, client_key: key.slice(0, 200), camp_id: campId, at: new Date(nowMs).toISOString(), outcome: answer.status });
    write(db);
    return answer;
  }

  // ----- Answers in the Supabase client's shape -----

  const ok = (data) => ({ data, error: null, count: null, status: 200, statusText: 'OK' });
  const fail = (code, message, status = 403) => ({
    data: null, error: { code, message, details: null, hint: null }, count: null, status,
    statusText: status === 404 ? 'Not Found' : status === 403 ? 'Forbidden' : 'Bad Request',
  });
  const denied = (what) => fail('42501', `permission denied for ${what}`, 403);

  function rowsOf(db, table) {
    if (table === 'camp_roster') return db.camp_campers.map((c) => rosterRow(db, c));
    return db[table] ?? [];
  }

  // supabase.from(table).select(columns).eq(…).in(…).order(…)
  function select(table, columns, filters = [], orders = [], ctx = {}) {
    if (!(table in GRANTED)) return fail('PGRST205', `Could not find the table 'public.${table}' in the schema cache`, 404);
    if (!ctx.signedIn) return denied(`table ${table}`);
    const existing = [...GRANTED[table], ...HIDDEN[table]];
    const wanted = String(columns ?? '*').split(',').map((col) => col.trim()).filter(Boolean);
    if (wanted.length === 0) wanted.push('*');
    for (const col of [...wanted, ...filters.map((f) => f.col), ...orders.map((o) => o.col)]) {
      if (col === '*' || HIDDEN[table].includes(col)) return denied(table === 'camp_roster' ? `view ${table}` : `table ${table}`);
      if (!existing.includes(col)) return fail('42703', `column ${table}.${col} does not exist`, 400);
    }
    if (!ctx.hasDataAccess) return ok([]); // row-level security hides every row
    const db = read();
    let rows = rowsOf(db, table);
    // Filters compare as text, like the real API (the filter travels in the web address).
    rows = rows.filter((row) => filters.every((f) => (f.op === 'in'
      ? (f.value ?? []).map(String).includes(String(row[f.col]))
      : String(row[f.col]) === String(f.value))));
    rows = [...rows].sort((x, y) => {
      for (const { col, ascending = true } of orders) {
        if (x[col] === y[col]) continue;
        const less = x[col] === null ? false : y[col] === null ? true : x[col] < y[col]; // nulls last
        return (less ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    return ok(clone(rows.map((row) => Object.fromEntries(wanted.map((col) => [col, row[col] ?? null])))));
  }

  // supabase.rpc(name, args) for the staff functions and camp_camper_detail.
  function rpc(name, args = {}, ctx = {}) {
    if (CAMP_RESTRICTED_RPC_NAMES.includes(name)) return denied(`function ${name}`); // only camps_registrar (or nobody)
    if (!(name in handlers)) return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
    if (failNext && !READ_ONLY.has(name)) {
      failNext = false; // pretend the connection dropped: nothing changes (failNextSave helper)
      return { data: null, error: { message: 'Failed to fetch (preview: failNextSave)' }, count: null, status: 0, statusText: '' };
    }
    if (!ctx.signedIn) return denied(`function ${name}`);
    let parsed;
    try {
      parsed = readArgs(name, args);
    } catch (error) {
      if (error instanceof DbError) return fail(error.code, error.message, error.httpStatus);
      throw error;
    }
    // has_data_access FIRST, then the role (§1.1).
    if (!ctx.hasDataAccess) return ok(st('no_access'));
    if (ADMIN_ONLY.has(name) && !ctx.isAdmin) return ok(st('not_allowed'));
    const db = read(); // a private copy = a transaction: only an 'ok' is saved
    const answer = handlers[name](db, parsed, {
      actorName: ctx.actorName ?? 'Database admin', userId: ctx.userId ?? null, isAdmin: Boolean(ctx.isAdmin),
    });
    if (answer.status === 'ok' && !READ_ONLY.has(name)) write(db);
    return ok(answer);
  }

  // ----- Test helpers (console helpers in mockClient.js / publicApi.preview.js, and checks.mjs) -----

  function failNextSave() {
    failNext = true;
  }

  // "Another admin" changes every camp, camper, sign-up and template: open dialogs go stale.
  function simulateOtherAdminEdit() {
    const db = read();
    const at = stamp();
    for (const row of [...db.camps, ...db.camp_campers, ...db.camp_signups, ...db.camp_templates]) {
      row.version += 1;
      row.updated_by_name = 'Other Admin';
      row.updated_at = at;
    }
    write(db);
  }

  // Back to the default camps, campers and templates (check-ins up to the preview's today).
  function reset() {
    write(defaultCampsData({ today: dataToday() }));
  }

  // The first camp whose sign-up is open today (for simulateFamilySignup), or null.
  function firstOpenCode() {
    const db = read();
    const camp = [...db.camps].sort((a, b) => (firstDay(daysView(db, a.id)) < firstDay(daysView(db, b.id)) ? -1 : 1))
      .find((c) => stateOf(db, c) === 'open');
    return camp?.public_code ?? null;
  }

  // A family sign-up as if from a phone (simulateFamilySignup): one child, every day, no extras,
  // or a second sign-up of an existing camper's name (duplicateOf: 'Ava Thompson') with that
  // camper's days. It goes through every rule of camp_public_signup (it can be refused, e.g. when
  // sign-up isn't open). Returns the answer.
  function simulateSignup(code, { duplicateOf } = {}) {
    const db = read();
    const camp = campByCode(db, code);
    if (!camp) return st('not_found');
    const days = daysView(db, camp.id);
    let first = ['Harper', 'Wyatt', 'Nora', 'Caleb', 'Stella', 'Miles'][Math.floor(now() / 1000) % 6];
    let last = ['Bennett', 'Foster', 'Hayes', 'Sullivan'][Math.floor(now() / 7000) % 4];
    let dayIds = days.map((d) => d.dayId);
    let member = true;
    if (duplicateOf) {
      const [f, ...rest] = String(duplicateOf).trim().split(/\s+/);
      const l = rest.join(' ');
      const twin = db.camp_campers.find((c) => c.camp_id === camp.id && c.status === 'active' && nameKey(c.first_name) === nameKey(f) && nameKey(c.last_name) === nameKey(l));
      first = twin?.first_name ?? f;
      last = twin?.last_name ?? l;
      if (twin) {
        dayIds = camperDayRows(db, twin.id).map((r) => r.day_id);
        member = twin.member;
      }
    }
    const age = Math.min(camp.max_age, Math.max(camp.min_age, 8));
    const kind = priceKind(today(), camp.early_until);
    const total = priceChild({ member, dayIds, extras: [] }, pricesView(db, camp.id), extrasView(db, camp.id), days, kind).totalCents;
    return publicSignup({
      code, client_key: 'preview-simulated-phone', submission_id: newId(),
      children: [{ first_name: first, last_name: last, age, member, day_ids: dayIds, extras: [] }],
      parent_name: `Pat ${last}`, parent_phone: '5085550199', parent_relation: 'Parent', emergency_name: `Sam ${last}`,
      emergency_phone: '5085550198', emergency_relation: 'Friend', paying_by: 'cash', acknowledged: true, signature: SAMPLE_SIGNATURE,
      ack_version: CAMP_ACK_VERSION, waiver_version: md5(camp.waiver_text), expected_total_cents: total,
    });
  }

  return {
    select, rpc, publicCamp, publicSignup, failNextSave, simulateOtherAdminEdit, reset, snapshot: read,
    firstOpenCode, simulateSignup,
  };
}
