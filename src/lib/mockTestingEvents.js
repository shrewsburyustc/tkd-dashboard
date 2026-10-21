// mockTestingEvents.js — the PREVIEW (fake) database for Color Belt testing phase 2: events, the
// family form's registrations, the per-class roster with payments, and the schools' addresses.
// Why it exists: preview mode (npm run dev:preview-mode) runs without Supabase. This file pretends
// to be what migration 0005 adds (contract 0005 §1) — plus 0019's school phone — the tables, the testing_roster view, the 15
// staff functions, the two public functions the family page uses, and the same rules — the same
// order of checks, the same status codes, the same staff/admin splits, the 10-second Undo rule,
// the copy rule, duplicates and the 90-day signature clean-up. What you see in preview is what
// the real dashboard will do.
//
// Like mockTesting.js it is a "pure core": it never touches the browser by itself.
//   const events = createEventsBackend({ readBase, saveStore, now, today, newId });
//     readBase()  → the whole preview store (mockTesting's snapshot(): classes + ranks + whatever
//                   else is saved; its default data when the store is missing or too old)
//     saveStore() → saves the whole store (mockClient: localStorage 'tkd.preview.testing')
//     now()       → milliseconds (timestamps, the Undo window)
//     today()     → 'YYYY-MM-DD' in school time (setToday can pretend another date)
//   events.select(table, columns, filters, orders, ctx)   filters: [{ col, value, op:'eq'|'in' }]
//   events.rpc(name, args, ctx)   ctx = { signedIn, hasDataAccess, isAdmin, actorName, userId }
//   events.publicEvent(code) / events.publicRegister({...}) — what testing_registrar may call
//
// The phase 2 tables live in the SAME store as Classes and ranks, next to `classes` and `ranks`:
//   locations, events, event_classes, event_ranks, registrations, payments, public_attempts,
//   next_reference (the CB- number sequence). Column names are the database's (snake_case).
// When those are missing or damaged (e.g. data saved by the phase 1 build) they are replaced by
// the default preview data below; Classes and ranks are kept.
//
// Phase 3 (Grading, migration 0010, contract 0010 §3.3) adds the list `results` (the table
// testing_results: one row per graded student — registration_id, result, note, updated_at,
// updated_by, updated_by_name), the functions testing_set_result and testing_set_result_note,
// and the grading locks in five phase 2 functions (update_student, resolve_duplicate,
// restore_student, add_student, update_event — see each one). A store saved before phase 3 has
// no `results`; it simply gets an empty list (its events and students are kept).
//
// Phase 4 (the Private testing tab, migration 0014, contract 0014 §2, §4.4) adds three lists —
// `private` (the table testing_private: one private testing, NOT part of any event), its
// `private_payments` and its `private_results` — the view testing_private_list, the 14 staff
// functions testing_private_* and testing_move_to_private (a registration leaves its event and
// becomes a private testing, its live payments move with it as event reversals + private
// payments, all in one batch), and one change to a live function: testing_restore_student
// answers 'moved' for a registration that was moved. Classes and ranks are read LIVE from the
// same store (`classes`, `ranks`) — a private testing copies its class, rank, belts, testing-for
// and private price at that moment. A store saved before phase 4 simply gets empty lists.
// The preview also keeps a small history list `change_log` (the newest 500 rows) for the phase 4
// writes — the database's action names and one batch id per call — so checks.mjs can test them.
// The app can't read it (like the real change_log).
import { normalizeName, nameProblem, nameKey } from './testing/names.js';
import { RESULTS, normalizeGradingNote, gradingNoteProblem } from './testing/gradingRules.js';
import { defaultTestingData } from './mockTesting.js';
import {
  eventState, registrationSwitch, publicStateFor, feeFor, timeToMinutes, isIsoDate, addDays, signatureIsValid,
  noteIsValid, normalizeNote, shortTime, todayInSchoolTime, defaultAutoCloseOn, SCHOOL_TIME_ZONE, PAYING_BY, FORM_PAYING_BY, ACK_VERSION, UNDO_WINDOW_MS, SIGNATURE_KEEP_DAYS, MAX_PAYMENT_CENTS,
  testingFor,
} from './testing/eventRules.js';
import { privateTimeIsValid, privateDayLimit } from './testing/privateRules.js';

const LOCATION_CODES = ['worcester', 'shrewsbury'];
const REFERENCE_START = 3101; // CB-3101 is the first reference number (§1.5)
const RATE_LIMIT_PER_HOUR = 20; // more than 20 tries per connection per hour → rate_limited (§1.8)
const ATTEMPT_KEEP_MS = 2 * 24 * 60 * 60 * 1000; // rate-limit rows older than 2 days are removed
const HOUR_MS = 60 * 60 * 1000;
// Public codes: 8 characters from a–z and 2–9 without the look-alikes i, l, o (and 0/1 aren't in 2–9).
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 8;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_MAX = 2147483647;

// ----- Default preview data (contract 0005 §5) -----
// November Children Testing at Worcester on Fri Nov 20 2026, with the students of the approved
// roster mockups (R1–R8): 14 active students (Little Tiger 3, White 1, Group A 4, Group B 3,
// Group C 2, Group D 1), 6 paid ($410), one possible duplicate (Mia Lopez twice) and one withdrawn.
// School addresses start empty (Settings → Schools fills them in).
// Dates: the event was made 10 days before "today", and the students registered and paid
// 1 to 8 days before today (worked out when the default data is made), so nothing is ever
// "paid" before it was "registered" or in the future. If today is already after Nov 20 2026,
// the event moves to 30 days from today.

const pad12 = (n) => String(n).padStart(12, '0');
const fixedId = (kind, n) => `000001${kind}-0000-4000-8000-${pad12(n)}`; // e.g. 000001e0-0000-4000-8000-000000000001
export const DEFAULT_EVENT_ID = fixedId('e0', 1);
export const DEFAULT_PUBLIC_CODE = 'p4w9tdkm';
const DESK_USER_ID = '00000000-0000-4000-8000-0000000000d1'; // the shared front-desk sign-in
const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000001'; // Jeffrey (mockClient's FAKE_STAFF)
// A tiny valid PNG (1×1 pixel) standing in for a drawn signature.
const SAMPLE_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// A clock time at the school ('2026-11-06', '17:10') → an ISO timestamp. Massachusetts is
// UTC−5 in winter and UTC−4 in summer; this tries both and keeps the one that reads back as
// that clock time at the school.
const SCHOOL_CLOCK_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function schoolClockToIso(dateIso, hhmm) {
  const asUtc = Date.parse(`${dateIso}T${hhmm}:00Z`);
  for (const hours of [5, 4]) {
    const ms = asUtc + hours * HOUR_MS;
    const parts = Object.fromEntries(SCHOOL_CLOCK_FORMAT.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
    if (`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` === `${dateIso}T${hhmm}`) return new Date(ms).toISOString();
  }
  return new Date(asUtc + 5 * HOUR_MS).toISOString();
}
const DEFAULT_TESTING_DATE = '2026-11-20';

// Which classes test, and when (24-hour times like the database).
const DEFAULT_EVENT_CLASSES = [
  ['Little Tiger', '16:00:00', '17:00:00'],
  ['White', '16:00:00', '17:00:00'],
  ['Group A', '17:00:00', '18:00:00'],
  ['Group B', '18:00:00', '19:00:00'],
  ['Group C', '19:00:00', '20:00:00'],
  ['Group D', '19:00:00', '20:00:00'],
];

// [first, last, class, current belt, paying by, source, CB number, registered [days before today,
//  school clock time], paid { daysAgo, at, desk } or null, extra]. A payment is always on or
// after its registration day; the withdrawal comes after the registration too.
const DEFAULT_STUDENTS = [
  ['Ava', 'Chen', 'Little Tiger', 'LT White', 'cash', 'form', 3101, [8, '17:20'], null],
  ['Noah', 'Kim', 'Little Tiger', 'LT Yellow', 'check', 'form', 3102, [8, '17:45'], null],
  ['Lily', 'Brooks', 'Little Tiger', 'LT Green', 'cash', 'form', 3103, [8, '17:52'], null],
  ['Owen', 'Reed', 'White', 'White', 'cash', 'form', 3104, [8, '18:00'], { daysAgo: 2, at: '17:10', desk: true }],
  ['Ella', 'Grant', 'Group B', 'Blue', 'cash', 'form', 3105, [8, '18:02'], { daysAgo: 2, at: '17:15', desk: true }],
  ['Lucas', 'Moore', 'Group C', 'High Red', 'check', 'form', 3106, [8, '18:03'], { daysAgo: 2, at: '17:20', desk: true }],
  ['Mia', 'Lopez', 'Group A', 'Yellow', 'cash', 'form', 3107, [8, '18:05'], { daysAgo: 6, at: '17:30', desk: true }],
  ['Jack', 'Rivera', 'Group B', 'High Blue', 'check', 'form', 3108, [8, '18:08'], { daysAgo: 2, at: '17:25', desk: false }],
  ['Mia', 'Lopez', 'Group A', 'Yellow', 'cash', 'form', 3109, [8, '18:11'], null, { duplicateOfRef: 3107 }],
  ['Sam', 'Diaz', 'Group A', 'Orange', 'cash', 'form', 3110, [7, '19:00'], null],
  ['Ethan', 'Wu', 'Group A', 'Green', 'check', 'form', 3111, [5, '18:30'], { daysAgo: 5, at: '18:45', desk: true }],
  ['Zoe', 'Park', 'Group A', 'Yellow', 'check', 'form', 3112, [4, '19:42'], null],
  ['Maya', 'Singh', 'Group B', 'Purple', 'cash', 'form', 3113, [4, '20:10'], null],
  ['Chloe', 'Nguyen', 'Group C', 'Brown', 'cash', 'form', 3114, [2, '18:00'], null],
  ['Ryan', 'Patel', 'Group D', 'Bo Dan', 'card', 'staff', 3115, [2, '18:30'], null],
  ['Leo', 'Hart', 'Group B', 'Red', 'cash', 'form', 3116, [7, '18:00'], null, { withdrawn: [1, '18:40'] }],
];

const BELT_KEYS = ['belt_pattern', 'belt_color', 'belt_color_2', 'belt_end_stripes', 'belt_end_stripe_color'];
const faBeltOf = (rank) => Object.fromEntries(BELT_KEYS.map((k) => [`fa_${k}`, rank ? rank[k] : null]));
const beltOfRank = (rank) => Object.fromEntries(BELT_KEYS.map((k) => [k, rank[k]]));

// The event's copy of one class and its ranks (the copy rule, §1.4). Used for the default data
// and by Add / Edit event.
function copyClass(base, cls, eventId, startTime, endTime, ids) {
  const award = cls.final_award_rank_id ? base.ranks.find((r) => r.id === cls.final_award_rank_id) ?? null : null;
  const eventClass = {
    id: ids.classId(), event_id: eventId, class_id: cls.id, class_name: cls.name, position: cls.position,
    start_time: startTime, end_time: endTime,
    final_award_kind: cls.final_award_none ? 'none' : 'rank',
    final_award_name: cls.final_award_none ? null : award?.name ?? null,
    ...faBeltOf(cls.final_award_none ? null : award),
  };
  const ranks = base.ranks
    .filter((r) => r.class_id === cls.id)
    .sort((a, b) => a.position - b.position)
    .map((r) => ({
      id: ids.rankId(), event_class_id: eventClass.id, rank_id: r.id, name: r.name, position: r.position,
      ...beltOfRank(r), early_cents: r.early_cents, day_cents: r.day_cents, private_cents: r.private_cents,
      sparring_gear: r.sparring_gear,
    }));
  return { eventClass, ranks };
}

// The phase 2 part of the default preview store. today = 'YYYY-MM-DD' at the school (the dates
// above count back from it); left out → the real date.
export function defaultEventsData({ today = todayInSchoolTime(new Date()) } = {}) {
  const base = defaultTestingData();
  const daysAgo = ([days, time]) => schoolClockToIso(addDays(today, -days), time);
  const testingDate = today > DEFAULT_TESTING_DATE ? addDays(today, 30) : DEFAULT_TESTING_DATE;
  const stamps = (at, by = 'Jeffrey Berg') => ({ version: 1, created_at: at, created_by_name: by, updated_at: at, updated_by_name: by });
  const locations = [
    { code: 'worcester', name: 'Worcester', id: '0000000c-0000-4000-8000-000000000001' },
    { code: 'shrewsbury', name: 'Shrewsbury', id: '0000000c-0000-4000-8000-000000000002' },
  ].map((l) => ({
    ...l, address_street: null, address_city: null, address_state: null, address_zip: null, phone: null,
    version: 1, updated_at: daysAgo([12, '16:52']), updated_by_name: null,
  }));

  const createdAt = daysAgo([10, '10:00']);
  const event = {
    id: DEFAULT_EVENT_ID, location_code: 'worcester', name: 'November Children Testing', testing_date: testingDate,
    registration_open: true, auto_close_on: defaultAutoCloseOn(testingDate), first_opened_at: createdAt, public_code: DEFAULT_PUBLIC_CODE,
    note: null, ...stamps(createdAt),
  };
  let classN = 0;
  let rankN = 0;
  const ids = { classId: () => fixedId('e1', ++classN), rankId: () => fixedId('e2', ++rankN) };
  const eventClasses = [];
  const eventRanks = [];
  for (const [className, start, end] of DEFAULT_EVENT_CLASSES) {
    const cls = base.classes.find((c) => c.location_code === 'worcester' && c.name === className);
    const { eventClass, ranks } = copyClass(base, cls, event.id, start, end, ids);
    eventClasses.push(eventClass);
    eventRanks.push(...ranks);
  }

  const registrations = [];
  const payments = [];
  DEFAULT_STUDENTS.forEach(([first, last, className, beltName, payingBy, source, ref, registered, paid, extra = {}], i) => {
    const ec = eventClasses.find((c) => c.class_name === className);
    const rank = eventRanks.find((r) => r.event_class_id === ec.id && r.name === beltName);
    const at = daysAgo(registered);
    const fromForm = source === 'form';
    const reg = {
      id: fixedId('e3', i + 1), event_id: event.id, event_rank_id: rank.id, first_name: first, last_name: last,
      paying_by: payingBy, stripes_confirmed: true, source, reference: `CB-${ref}`,
      submission_id: fromForm ? fixedId('e5', i + 1) : null, signature: fromForm ? SAMPLE_SIGNATURE : null,
      signed_at: fromForm ? at : null, signature_deleted_at: null, ack_version: fromForm ? ACK_VERSION : null,
      registered_at: at, status: 'active', withdrawn_reason: null, withdrawn_at: null, withdrawn_by: null, withdrawn_by_name: null,
      duplicate_state: 'none', duplicate_of: null,
      ...stamps(at, fromForm ? 'Family form' : 'Staff'),
    };
    if (extra.withdrawn) {
      const withdrawnAt = daysAgo(extra.withdrawn);
      Object.assign(reg, { status: 'withdrawn', withdrawn_reason: 'withdrawn', withdrawn_at: withdrawnAt, withdrawn_by: ADMIN_USER_ID, withdrawn_by_name: 'Jeffrey Berg', version: 2, updated_at: withdrawnAt, updated_by_name: 'Jeffrey Berg' });
    }
    if (extra.duplicateOfRef) {
      reg.duplicate_state = 'possible';
      reg.duplicate_of = registrations.find((r) => r.reference === `CB-${extra.duplicateOfRef}`).id;
    }
    registrations.push(reg);
    if (paid) {
      const paidOn = addDays(today, -paid.daysAgo);
      const paidAt = daysAgo([paid.daysAgo, paid.at]);
      payments.push({
        id: fixedId('e4', payments.length + 1), registration_id: reg.id, kind: 'payment',
        amount_cents: feeFor(rank, paidOn, event.testing_date), method: payingBy, paid_on: paidOn,
        recorded_at: paidAt, recorded_by: paid.desk ? DESK_USER_ID : ADMIN_USER_ID,
        recorded_by_name: paid.desk ? 'Staff' : 'Jeffrey Berg', reverses_payment_id: null,
      });
      reg.version += 1; // Mark paid bumps the registration's version
      reg.updated_at = paidAt;
    }
  });


  // ----- Phase 4: the Private testing tab's preview story (the approved mockups P1–P8) -----
  // Five Worcester private testings, dated around the event's testing day T (Nov 20) and "today",
  // so Upcoming / Past make sense and nothing is paid or cancelled in the future:
  //   Liam Park   Group B Blue → High Blue, $95, not paid, T+13 (Thu Dec 3) 5:30 PM
  //   Noah Kim    Group A Orange → Green, $85, paid yesterday, T+15 (Sat Dec 5) 10:00 AM
  //   Ava Chen    MOVED from November Children Testing two days ago: paid $65 there (Group A
  //               Yellow, 7 days ago), private $85 → owes $20, T+11 (Tue Dec 1) 4:00 PM. Her event
  //               registration (CB-3117) is withdrawn and her $65 transferred exactly as
  //               testing_move_to_private writes it (an event reversal dated the original day +
  //               a private payment pointing at the original).
  //   Emma Ross   Group A Green → High Green, $85 paid, cancelled yesterday (payment kept), T+10
  //               (Mon Nov 30) 4:30 PM
  //   Sofia Reyes Group A Yellow → Orange, $85 paid, three days ago at 4:00 PM, Passed (Past)
  const school = 'worcester';
  const liveRank = (className, rankName) => {
    const cls = base.classes.find((c) => c.location_code === school && c.name === className);
    return base.ranks.find((r) => r.class_id === cls.id && r.name === rankName);
  };
  // The copy testing_private_add makes from Classes and ranks (class, rank, belt, testing-for, price).
  const liveCopy = (className, rankName) => {
    const rank = liveRank(className, rankName);
    const cls = base.classes.find((c) => c.id === rank.class_id);
    const inClass = base.ranks.filter((r) => r.class_id === cls.id).sort((a, b) => a.position - b.position);
    const target = inClass[inClass.indexOf(rank) + 1]
      ?? (cls.final_award_none ? null : base.ranks.find((r) => r.id === cls.final_award_rank_id) ?? null);
    return {
      class_id: cls.id, class_name: cls.name, rank_id: rank.id, rank_name: rank.name, ...beltOfRank(rank),
      to_kind: target ? 'rank' : 'none', to_name: target ? target.name : null,
      ...Object.fromEntries(BELT_KEYS.map((k) => [`to_${k}`, target ? target[k] : null])),
      private_cents: rank.private_cents,
    };
  };
  const privateRow = (n, first, last, copy, payingBy, privateDate, privateTime, createdAt, extra = {}) => ({
    id: fixedId('f0', n), location_code: school, first_name: first, last_name: last, ...copy, paying_by: payingBy,
    stripes_confirmed: true, private_date: privateDate, private_time: privateTime, status: 'active',
    cancelled_at: null, cancelled_by_name: null, cancelled_by: null,
    moved_from_event_id: null, moved_from_registration_id: null, moved_from_event_name: null,
    moved_cleared_no_show: false, moved_registration_version: null,
    version: 1, created_at: createdAt, updated_at: createdAt, created_by: DESK_USER_ID, updated_by: DESK_USER_ID,
    created_by_name: 'Staff', updated_by_name: 'Staff', ...extra,
  });
  const privatePayment = (n, row, amount, method, daysBack, at, extra = {}) => ({
    id: fixedId('f1', n), private_id: row.id, kind: 'payment', amount_cents: amount, method, paid_on: addDays(today, -daysBack),
    recorded_at: daysAgo([daysBack, at]), recorded_by: DESK_USER_ID, recorded_by_name: 'Staff', reverses_payment_id: null,
    moved_from_payment_id: null, ...extra,
  });
  const T = testingDate;
  const privateList = [];
  const privatePayments = [];
  const privateResults = [];
  const bump = (row, at) => Object.assign(row, { version: row.version + 1, updated_at: at }); // Mark paid / Cancel

  const liam = privateRow(1, 'Liam', 'Park', liveCopy('Group B', 'Blue'), 'cash', addDays(T, 13), '17:30:00', daysAgo([3, '17:05']));
  const noah = privateRow(2, 'Noah', 'Kim', liveCopy('Group A', 'Orange'), 'check', addDays(T, 15), '10:00:00', daysAgo([4, '18:10']));
  privatePayments.push(privatePayment(1, noah, noah.private_cents, 'check', 1, '17:40'));
  bump(noah, daysAgo([1, '17:40']));

  // Ava: her event registration first (Group A Yellow, paid $65 cash 9 days ago), then the move.
  const avaRank = eventRanks.find((r) => r.event_class_id === eventClasses.find((c) => c.class_name === 'Group A').id && r.name === 'Yellow');
  const avaAt = daysAgo([8, '18:20']);
  const avaReg = {
    id: fixedId('e3', DEFAULT_STUDENTS.length + 1), event_id: event.id, event_rank_id: avaRank.id, first_name: 'Ava', last_name: 'Chen',
    paying_by: 'cash', stripes_confirmed: true, source: 'form', reference: `CB-${REFERENCE_START + DEFAULT_STUDENTS.length}`,
    submission_id: fixedId('e5', DEFAULT_STUDENTS.length + 1), signature: SAMPLE_SIGNATURE, signed_at: avaAt, signature_deleted_at: null,
    ack_version: ACK_VERSION, registered_at: avaAt, status: 'active', withdrawn_reason: null, withdrawn_at: null, withdrawn_by: null,
    withdrawn_by_name: null, duplicate_state: 'none', duplicate_of: null, ...stamps(avaAt, 'Family form'),
  };
  registrations.push(avaReg);
  const avaPaidAt = daysAgo([7, '17:15']);
  const avaEventPayment = {
    id: fixedId('e4', payments.length + 1), registration_id: avaReg.id, kind: 'payment', amount_cents: avaRank.early_cents, method: 'cash',
    paid_on: addDays(today, -7), recorded_at: avaPaidAt, recorded_by: DESK_USER_ID, recorded_by_name: 'Staff', reverses_payment_id: null,
  };
  payments.push(avaEventPayment);
  Object.assign(avaReg, { version: 2, updated_at: avaPaidAt, updated_by_name: 'Staff' });
  // The move (two days ago, by the front desk): reversal → registration withdrawn → private testing → its payment.
  const movedAt = daysAgo([2, '16:45']);
  payments.push({
    id: fixedId('e4', payments.length + 1), registration_id: avaReg.id, kind: 'reversal', amount_cents: -avaEventPayment.amount_cents,
    method: avaEventPayment.method, paid_on: avaEventPayment.paid_on, recorded_at: movedAt, recorded_by: DESK_USER_ID, recorded_by_name: 'Staff',
    reverses_payment_id: avaEventPayment.id,
  });
  Object.assign(avaReg, {
    status: 'withdrawn', withdrawn_reason: 'withdrawn', withdrawn_at: movedAt, withdrawn_by: DESK_USER_ID, withdrawn_by_name: 'Staff',
    version: 3, updated_at: movedAt, updated_by_name: 'Staff',
  });
  const avaCopy = {
    ...liveCopy('Group A', 'Yellow'), // today's private price (v0.404) …
    // … and the class / rank / belt / testing-for of the EVENT copy (the same values here).
    class_id: eventClasses.find((c) => c.class_name === 'Group A').class_id, rank_id: avaRank.rank_id, rank_name: avaRank.name, ...beltOfRank(avaRank),
  };
  const ava = privateRow(3, 'Ava', 'Chen', avaCopy, 'cash', addDays(T, 11), '16:00:00', movedAt, {
    moved_from_event_id: event.id, moved_from_registration_id: avaReg.id, moved_from_event_name: event.name,
    moved_cleared_no_show: false, moved_registration_version: avaReg.version,
  });
  privatePayments.push(privatePayment(2, ava, avaEventPayment.amount_cents, 'cash', 7, '17:15', { moved_from_payment_id: avaEventPayment.id })); // the original's recorded_at

  const emma = privateRow(4, 'Emma', 'Ross', liveCopy('Group A', 'Green'), 'cash', addDays(T, 10), '16:30:00', daysAgo([6, '17:00']));
  privatePayments.push(privatePayment(3, emma, emma.private_cents, 'cash', 5, '17:20'));
  bump(emma, daysAgo([5, '17:20']));
  const emmaCancelledAt = daysAgo([1, '18:05']);
  Object.assign(emma, { status: 'cancelled', cancelled_at: emmaCancelledAt, cancelled_by_name: 'Staff', cancelled_by: DESK_USER_ID });
  bump(emma, emmaCancelledAt);

  const sofia = privateRow(5, 'Sofia', 'Reyes', liveCopy('Group A', 'Yellow'), 'card', addDays(today, -3), '16:00:00', daysAgo([10, '16:30']));
  privatePayments.push(privatePayment(4, sofia, sofia.private_cents, 'card', 3, '15:50'));
  bump(sofia, daysAgo([3, '15:50']));
  privateResults.push({ private_id: sofia.id, result: 'pass', note: null, updated_at: daysAgo([3, '16:40']), updated_by: DESK_USER_ID, updated_by_name: 'Staff' });

  privateList.push(liam, noah, ava, emma, sofia);

  return {
    locations, events: [event], event_classes: eventClasses, event_ranks: eventRanks,
    registrations, payments, public_attempts: [], next_reference: REFERENCE_START + DEFAULT_STUDENTS.length + 1, next_attempt_id: 1,
    results: [], // phase 3: nobody is graded yet
    // Phase 4: the Private testing tab's preview story (above), and an empty preview history.
    private: privateList, private_payments: privatePayments, private_results: privateResults, change_log: [],
  };
}

// Is the phase 2 part of a loaded store usable? (Missing or damaged → the default data.)
function eventsPartIsUsable(store) {
  const lists = ['locations', 'events', 'event_classes', 'event_ranks', 'registrations', 'payments', 'public_attempts'];
  if (!store || lists.some((key) => !Array.isArray(store[key]))) return false;
  if (!Number.isInteger(store.next_reference) || !Number.isInteger(store.next_attempt_id)) return false;
  if (store.locations.length !== 2 || !LOCATION_CODES.every((c) => store.locations.some((l) => l.code === c && Number.isInteger(l.version)))) return false;
  const eventOk = (e) => e && typeof e.id === 'string' && LOCATION_CODES.includes(e.location_code) && isIsoDate(e.testing_date)
    && typeof e.registration_open === 'boolean' && Number.isInteger(e.version) && typeof e.public_code === 'string';
  const regOk = (r) => r && typeof r.id === 'string' && typeof r.event_id === 'string' && Number.isInteger(r.version)
    && ['active', 'withdrawn'].includes(r.status) && ['none', 'possible', 'kept_both'].includes(r.duplicate_state);
  const payOk = (p) => p && typeof p.id === 'string' && Number.isInteger(p.amount_cents) && ['payment', 'reversal'].includes(p.kind);
  return store.events.every(eventOk) && store.registrations.every(regOk) && store.payments.every(payOk);
}

// ----- Table permissions (contract 0005 §1.2, §1.8, §1.9) -----

const EVENT_COLS = ['id', 'location_code', 'name', 'testing_date', 'registration_open', 'auto_close_on', 'first_opened_at', 'public_code', 'note', 'version', 'created_at', 'created_by_name', 'updated_at', 'updated_by_name'];
const FA_COLS = BELT_KEYS.map((k) => `fa_${k}`);
const EVENT_CLASS_COLS = ['id', 'event_id', 'class_id', 'class_name', 'position', 'start_time', 'end_time', 'final_award_kind', 'final_award_name', ...FA_COLS];
const EVENT_RANK_COLS = ['id', 'event_class_id', 'rank_id', 'name', 'position', ...BELT_KEYS, 'early_cents', 'day_cents', 'private_cents', 'sparring_gear'];
// Registrations: everything except the signature, the form's submission id and who-as-an-id.
const REG_COLS = ['id', 'event_id', 'event_rank_id', 'first_name', 'last_name', 'paying_by', 'stripes_confirmed', 'source', 'reference', 'signed_at', 'signature_deleted_at', 'ack_version', 'registered_at', 'status', 'withdrawn_reason', 'withdrawn_at', 'withdrawn_by_name', 'duplicate_state', 'duplicate_of', 'version', 'created_at', 'created_by_name', 'updated_at', 'updated_by_name'];
const PAYMENT_COLS = ['id', 'registration_id', 'kind', 'amount_cents', 'method', 'paid_on', 'recorded_at', 'recorded_by_name', 'reverses_payment_id'];
// Grading results (phase 3, 0010 §1.4): everything except who-as-an-id (updated_by).
const RESULT_COLS = ['registration_id', 'result', 'note', 'updated_at', 'updated_by_name'];
// The view (0005 section 10): registration columns + the class and belt from the event copy + payments.
const ROSTER_COLS = [...REG_COLS, 'signed', 'event_class_id', 'class_id', 'class_name', 'class_position', 'start_time', 'end_time',
  'rank_id', 'rank_name', 'rank_position', ...BELT_KEYS, 'early_cents', 'day_cents', 'sparring_gear',
  'paid', 'paid_cents', 'paid_on', 'paid_method', 'last_payment_id', 'last_payment_recorded_at'];

// Phase 4 (0014 §2.2, §2.4): the private testing tables. Login ids (created_by, updated_by,
// cancelled_by, recorded_by) are never given to the app.
const PRIVATE_COLS = ['id', 'location_code', 'first_name', 'last_name', 'class_id', 'class_name', 'rank_id', 'rank_name', ...BELT_KEYS,
  'to_kind', 'to_name', ...BELT_KEYS.map((k) => `to_${k}`), 'private_cents', 'paying_by', 'stripes_confirmed', 'private_date', 'private_time',
  'status', 'cancelled_at', 'cancelled_by_name', 'moved_from_event_id', 'moved_from_registration_id', 'moved_from_event_name',
  'moved_cleared_no_show', 'moved_registration_version', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'];
const PRIVATE_PAYMENT_COLS = ['id', 'private_id', 'kind', 'amount_cents', 'method', 'paid_on', 'recorded_at', 'recorded_by_name', 'reverses_payment_id', 'moved_from_payment_id'];
const PRIVATE_RESULT_COLS = ['private_id', 'result', 'note', 'updated_at', 'updated_by_name'];
// The view: every granted column + the payment summary + what is owed (computed inline).
const PRIVATE_LIST_COLS = [...PRIVATE_COLS, 'paid_cents', 'paid', 'paid_on', 'paid_method', 'last_payment_id', 'last_payment_recorded_at', 'amount_due_cents'];

const GRANTED = {
  locations: ['code', 'name', 'id', 'address_street', 'address_city', 'address_state', 'address_zip', 'version', 'phone'], // phone: 0019
  testing_events: EVENT_COLS,
  testing_event_classes: EVENT_CLASS_COLS,
  testing_event_ranks: EVENT_RANK_COLS,
  testing_registrations: REG_COLS,
  testing_payments: PAYMENT_COLS,
  testing_roster: ROSTER_COLS,
  testing_public_attempts: [], // no client grants at all
  testing_results: RESULT_COLS,
  testing_private: PRIVATE_COLS,
  testing_private_payments: PRIVATE_PAYMENT_COLS,
  testing_private_results: PRIVATE_RESULT_COLS,
  testing_private_list: PRIVATE_LIST_COLS,
};
const HIDDEN = {
  locations: ['updated_at', 'updated_by', 'updated_by_name'],
  testing_events: ['created_by', 'updated_by'],
  testing_event_classes: [],
  testing_event_ranks: [],
  testing_registrations: ['signature', 'submission_id', 'withdrawn_by', 'created_by', 'updated_by'],
  testing_payments: ['recorded_by'],
  testing_roster: [],
  testing_public_attempts: ['id', 'client_key', 'event_id', 'at', 'outcome'],
  testing_results: ['updated_by'],
  testing_private: ['created_by', 'updated_by', 'cancelled_by'],
  testing_private_payments: ['recorded_by'],
  testing_private_results: ['updated_by'],
  testing_private_list: [],
};
export const EVENT_TABLES = Object.keys(GRANTED);

// ----- The staff functions' argument lists (name, type) — the same names as migration 0005 -----
const ID = (name) => [name, 'uuid'];
const RPC_ARGS = {
  testing_add_event: [['p_location_code', 'text'], ['p_name', 'text'], ['p_testing_date', 'date'], ['p_classes', 'jsonb'], ['p_registration_open', 'bool'], ['p_auto_close_on', 'date'], ['p_note', 'text']],
  testing_update_event: [ID('p_event_id'), ['p_expected_version', 'int'], ['p_name', 'text'], ['p_testing_date', 'date'], ['p_classes', 'jsonb'], ['p_auto_close_on', 'date'], ['p_note', 'text']],
  testing_set_registration: [ID('p_event_id'), ['p_expected_version', 'int'], ['p_open', 'bool']],
  testing_delete_event: [ID('p_event_id'), ['p_expected_version', 'int'], ['p_expected_registration_count', 'int'], ['p_expected_payment_total_cents', 'int']],
  testing_add_student: [ID('p_event_id'), ['p_first', 'text'], ['p_last', 'text'], ID('p_event_rank_id'), ['p_stripes', 'bool'], ['p_paying_by', 'text']],
  testing_update_student: [ID('p_registration_id'), ['p_expected_version', 'int'], ['p_first', 'text'], ['p_last', 'text'], ID('p_event_rank_id')],
  testing_change_paying_by: [ID('p_registration_id'), ['p_expected_version', 'int'], ['p_paying_by', 'text']],
  testing_mark_paid: [ID('p_registration_id'), ['p_expected_version', 'int']],
  testing_undo_payment: [ID('p_payment_id')],
  testing_edit_payment: [ID('p_payment_id'), ['p_method', 'text'], ['p_amount_cents', 'int'], ['p_paid_on', 'date']],
  testing_resolve_duplicate: [ID('p_keep_id'), ['p_keep_version', 'int'], ID('p_other_id'), ['p_other_version', 'int'], ['p_keep_both', 'bool']],
  testing_withdraw_student: [ID('p_registration_id'), ['p_expected_version', 'int']],
  testing_restore_student: [ID('p_registration_id'), ['p_expected_version', 'int']],
  testing_delete_student: [ID('p_registration_id'), ['p_expected_version', 'int'], ['p_expected_payment_ids', 'uuid[]']],
  settings_update_school_address: [['p_code', 'text'], ['p_expected_version', 'int'], ['p_street', 'text'], ['p_city', 'text'], ['p_state', 'text'], ['p_zip', 'text']],
  // 0019: the address and the school phone in one save
  settings_update_school_contact: [['p_code', 'text'], ['p_expected_version', 'int'], ['p_street', 'text'], ['p_city', 'text'], ['p_state', 'text'], ['p_zip', 'text'], ['p_phone', 'text']],
  // Phase 3 (0010 §1.5), staff and admins.
  testing_set_result: [ID('p_registration_id'), ['p_result', 'text']],
  testing_set_result_note: [ID('p_registration_id'), ['p_note', 'text']],
  // Phase 4 (0014 §2.5): the Private testing tab.
  testing_private_add: [['p_location_code', 'text'], ['p_first', 'text'], ['p_last', 'text'], ID('p_rank_id'), ['p_stripes', 'bool'], ['p_paying_by', 'text'], ['p_private_date', 'date'], ['p_private_time', 'time']],
  testing_private_update: [ID('p_private_id'), ['p_expected_version', 'int'], ['p_first', 'text'], ['p_last', 'text'], ID('p_rank_id')],
  testing_private_change_day: [ID('p_private_id'), ['p_expected_version', 'int'], ['p_private_date', 'date'], ['p_private_time', 'time']],
  testing_private_change_paying_by: [ID('p_private_id'), ['p_expected_version', 'int'], ['p_paying_by', 'text']],
  testing_private_mark_paid: [ID('p_private_id'), ['p_expected_version', 'int']],
  testing_private_undo_payment: [ID('p_payment_id')],
  testing_private_edit_payment: [ID('p_payment_id'), ['p_method', 'text'], ['p_amount_cents', 'int'], ['p_paid_on', 'date']],
  testing_private_cancel: [ID('p_private_id'), ['p_expected_version', 'int']],
  testing_private_restore: [ID('p_private_id'), ['p_expected_version', 'int']],
  testing_private_delete: [ID('p_private_id'), ['p_expected_version', 'int'], ['p_expected_payment_ids', 'uuid[]']],
  testing_private_set_result: [ID('p_private_id'), ['p_result', 'text']],
  testing_private_set_result_note: [ID('p_private_id'), ['p_note', 'text']],
  testing_move_to_private: [ID('p_registration_id'), ['p_expected_version', 'int'], ['p_private_date', 'date'], ['p_private_time', 'time']],
  testing_private_undo_move: [ID('p_private_id'), ['p_expected_version', 'int']],
};
// Who may call (§1.8): A = admins only, S = staff and admins. testing_restore_student is not in
// this list: staff may undo their OWN "keep one" for 10 seconds, so it checks who inside (14o).
const ADMIN_ONLY = new Set([
  'testing_add_event', 'testing_update_event', 'testing_delete_event', 'testing_edit_payment',
  'testing_withdraw_student', 'testing_delete_student', 'settings_update_school_address', 'settings_update_school_contact',
  'testing_private_edit_payment', 'testing_private_restore', 'testing_private_delete', // phase 4
]);
export const EVENT_RPC_NAMES = Object.keys(RPC_ARGS);
// Functions that exist but that a signed-in staff member may NOT call (only testing_registrar, or
// nobody): the app gets "permission denied", like the real database.
// (Phase 4: the five internal helpers of 0014 are granted to nobody.)
export const EVENT_RESTRICTED_RPC_NAMES = [
  'testing_public_event', 'testing_public_register', 'testing_purge_old_signatures', 'testing_event_state',
  'testing_private_time_is_valid', 'testing_private_amount_due', 'testing_private_lock', 'testing_private_lock_payment', 'testing_private_rank_copy',
];
export { ADMIN_ONLY as EVENT_ADMIN_ONLY_RPCS };

class DbError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

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
      // '16:00' or '16:00:30' → '16:00:00' / '16:00:30' (the database's time format). Whether
      // the time is ALLOWED (6 AM–10 PM, 5-minute steps) is the function's own check.
      const m = typeof value === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value) : null;
      if (m) return `${m[1]}:${m[2]}:${m[3] ?? '00'}`;
      throw new DbError('22007', `invalid input syntax for type time: "${value}"`);
    }
    case 'jsonb':
      return JSON.parse(JSON.stringify(value)); // any JSON value; checked by the function itself
    case 'uuid[]':
      if (!Array.isArray(value)) throw new DbError('22P02', `malformed array literal: "${value}"`);
      return value.map((item) => toDbType(item, 'uuid'));
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

// ----- Small helpers -----

const clone = (value) => JSON.parse(JSON.stringify(value));
const st = (status) => ({ status });
const byPosition = (a, b) => a.position - b.position;
const nameIsValid = (name) => name !== null && nameProblem(name) === null;
const hasNull = (list) => list.some((x) => x === null);
const hasDuplicates = (list) => new Set(list).size !== list.length;
const sameSet = (a, b) => a.length === b.length && new Set(a).size === new Set(b).size && a.every((x) => b.includes(x));
const sum = (list) => list.reduce((total, n) => total + n, 0);
// '17:00' / '17:00:00' → '17:00:00' (the database's time format). Bad → null.
const dbTime = (text) => {
  const minutes = timeToMinutes(text);
  return minutes === null ? null : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
};
// "Same person?" key: normalized first + last name, ignoring case (§1.5).
const personKey = (r) => `${nameKey(r.first_name)}|${nameKey(r.last_name)}`;
// The address parts tidied like settings_update_school_address does: street and city get the name
// rule's space tidying (runs of blanks → one space, ends trimmed); state and ZIP only lose the
// spaces at their ends. Empty → null.
const tidyLine = (v) => (v === null ? null : normalizeName(v) || null);
const trimSpaces = (v) => (v === null ? null : v.replace(/^ +| +$/g, '') || null);
// A school phone (0019's locations_phone_check): 7-20 characters of digits, spaces, + ( ) - .
// with 7-15 digits.
const schoolPhoneOk = (p) => p.length >= 7 && p.length <= 20 && /^[0-9 +().-]+$/.test(p)
  && p.replace(/[^0-9]/g, '').length >= 7 && p.replace(/[^0-9]/g, '').length <= 15;
// One line of an address: 1..max characters and no invisible characters (testing_line_is_valid).
const lineIsValid = (v, max) => [...v].length <= max && nameProblem(v) !== 'badCharacter';

// The "Classes testing" argument: [{ class_id, start_time, end_time }], 1 to 50 classes, no
// class twice, every end after its start. Returns the cleaned list or null (= invalid).
function readClassList(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return null; // 1 to 50 classes
  const out = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    if (typeof item.class_id !== 'string' || !UUID_PATTERN.test(item.class_id)) return null;
    const start = dbTime(item.start_time);
    const end = dbTime(item.end_time);
    if (start === null || end === null || end <= start) return null;
    out.push({ classId: item.class_id.toLowerCase(), start, end });
  }
  return hasDuplicates(out.map((c) => c.classId)) ? null : out;
}

// ----- The backend -----

export function createEventsBackend({ readBase, saveStore, now = () => Date.now(), today, newId }) {
  let failNext = false; // set by failNextSave()
  const stamp = () => new Date(now()).toISOString();
  // The "today" the default data counts back from: the pretend date, but never later than the
  // clock's own date, so its registrations and payments are always in the past (a desk payment
  // "recorded" in the future would look like it was still inside the 10-second Undo window).
  const dataToday = () => {
    const clockDate = todayInSchoolTime(now());
    const t = today();
    return t < clockDate ? t : clockDate;
  };

  // The current data: the whole store, with the phase 2 part filled in when it's missing.
  function read() {
    let store;
    try {
      store = clone(readBase());
    } catch {
      store = defaultTestingData();
    }
    if (!eventsPartIsUsable(store)) Object.assign(store, defaultEventsData({ today: dataToday() }));
    // A store saved before phase 3 has no grading results yet: an empty list, NOT "damaged"
    // (so the events and students someone made in preview are kept).
    if (!Array.isArray(store.results)) store.results = [];
    // Phase 4: a store saved before it has no private testings yet — empty lists, NOT "damaged".
    for (const key of ['private', 'private_payments', 'private_results', 'change_log']) {
      if (!Array.isArray(store[key])) store[key] = [];
    }
    return store;
  }
  const write = (db) => saveStore?.(db);

  // ----- What the before-write triggers do -----

  function insertRow(list, row, ctx) {
    const at = stamp();
    const full = { ...row, version: 1, created_at: at, created_by_name: ctx.actorName, updated_at: at, updated_by_name: ctx.actorName };
    list.push(full);
    return full;
  }

  // Changes a row. A real change raises the version and the "last changed" stamp; changing
  // nothing leaves them alone. force = raise it anyway (Mark paid / Undo touch the registration
  // so a second click with the old version gets 'stale').
  function updateRow(row, changes, ctx, force = false) {
    const changed = Object.keys(changes).some((col) => JSON.stringify(changes[col]) !== JSON.stringify(row[col]));
    Object.assign(row, changes);
    if (changed || force) {
      row.version += 1;
      row.updated_at = stamp();
      row.updated_by_name = ctx.actorName;
    }
  }

  const findEvent = (db, id) => db.events.find((e) => e.id === id) ?? null;
  const findReg = (db, id) => db.registrations.find((r) => r.id === id) ?? null;
  const classesOfEvent = (db, eventId) => db.event_classes.filter((c) => c.event_id === eventId)
    .sort((a, b) => a.position - b.position || (a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0));
  const ranksOfClass = (db, ecId) => db.event_ranks.filter((r) => r.event_class_id === ecId).sort(byPosition);
  const rankRow = (db, id) => db.event_ranks.find((r) => r.id === id) ?? null;
  const classOfRank = (db, rankId) => {
    const rank = rankRow(db, rankId);
    return rank ? db.event_classes.find((c) => c.id === rank.event_class_id) ?? null : null;
  };
  // Does this event-rank belong to this event? (checked in every function that takes one)
  const rankInEvent = (db, rankId, eventId) => classOfRank(db, rankId)?.event_id === eventId;
  // The event copy in the shape eventRules.testingFor wants: classes, each with its ranks.
  const copyOf = (db, eventId) => classesOfEvent(db, eventId).map((c) => ({ ...c, ranks: ranksOfClass(db, c.id) }));
  const paymentsOf = (db, regId) => db.payments.filter((p) => p.registration_id === regId);
  const isReversed = (db, paymentId) => db.payments.some((p) => p.reverses_payment_id === paymentId);
  const location = (db, code) => db.locations.find((l) => l.code === code) ?? null;
  // ----- Grading (phase 3) -----
  // A student's result row (null = not graded), and "is anything saved for them?".
  const resultOf = (db, regId) => db.results.find((r) => r.registration_id === regId) ?? null;
  const isGradedReg = (db, regId) => resultOf(db, regId) !== null;
  // "After the testing day" for a registration's event (today > testing_date).
  const afterTestingDay = (db, reg) => today() > findEvent(db, reg.event_id).testing_date;
  // Removes the result rows of registrations that are deleted (the database's ON DELETE CASCADE).
  const dropResultsOf = (db, regIds) => {
    db.results = db.results.filter((r) => !regIds.has(r.registration_id));
  };

  // The shared steps 3–5 of testing_set_result / testing_set_result_note (0010 §1.5):
  // not_found → withdrawn → the date rule (before the day: nobody; after it: admins only).
  // Returns a refusal answer, or null when the change may go ahead.
  function gradingRefusal(db, reg, ctx) {
    if (!reg) return st('not_found');
    if (reg.status === 'withdrawn') return st('withdrawn');
    const t = today();
    const testingDate = findEvent(db, reg.event_id).testing_date;
    if (t < testingDate) return st('not_open'); // admins too
    if (t > testingDate && !ctx.isAdmin) return st('finished');
    return null;
  }

  // Step 7: writes the wanted pair { result, note } for one registration, the way the database
  // does: the same as now → nothing is written; both empty → the row is removed; otherwise the
  // row is changed or added (with the "last changed" stamps). Returns the ok answer with what is
  // stored now (all null when no row is left).
  function writeResult(db, regId, wanted, ctx) {
    const row = resultOf(db, regId);
    const current = { result: row?.result ?? null, note: row?.note ?? null };
    const stamps = { updated_at: stamp(), updated_by: ctx.userId ?? null, updated_by_name: ctx.actorName };
    if (current.result === wanted.result && current.note === wanted.note) {
      // nothing changed: nothing is written (no new history row, no new stamp)
    } else if (wanted.result === null && wanted.note === null) {
      db.results = db.results.filter((r) => r.registration_id !== regId);
    } else if (row) {
      Object.assign(row, wanted, stamps);
    } else {
      db.results.push({ registration_id: regId, ...wanted, ...stamps });
    }
    const saved = resultOf(db, regId);
    return {
      status: 'ok', result: saved?.result ?? null, note: saved?.note ?? null,
      updated_at: saved?.updated_at ?? null, updated_by_name: saved?.updated_by_name ?? null,
    };
  }

  // The payment summary the roster view shows for one registration.
  function paymentSummary(db, regId) {
    const rows = paymentsOf(db, regId);
    const net = sum(rows.map((p) => p.amount_cents));
    const live = rows.filter((p) => p.kind === 'payment' && !isReversed(db, p.id))
      // Oldest first; the same moment → by id (the database: order by recorded_at desc, id desc).
      .sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : a.recorded_at > b.recorded_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const last = live[live.length - 1] ?? null;
    return {
      paid: net > 0, paid_cents: net, paid_on: last?.paid_on ?? null, paid_method: last?.method ?? null,
      last_payment_id: last?.id ?? null, last_payment_recorded_at: last?.recorded_at ?? null,
    };
  }

  // ----- Possible duplicates (§1.5) — the same steps as 0005's section 12b–12d -----
  // findDuplicate: another ACTIVE registration in the same event with the same first and last name
  // (ignoring capitals and extra spaces), the oldest first; a row "kept both" together with
  // excludeId doesn't count. null = none.
  const byRegisteredThenId = (a, b) => (a.registered_at < b.registered_at ? -1 : a.registered_at > b.registered_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  function findDuplicate(db, eventId, excludeId, first, last) {
    const key = `${nameKey(first)}|${nameKey(last)}`;
    const matches = db.registrations.filter((m) => m.event_id === eventId && m.status === 'active'
      && (excludeId === null || m.id !== excludeId) && personKey(m) === key
      && !(excludeId !== null && m.duplicate_state === 'kept_both' && m.duplicate_of === excludeId));
    return matches.sort(byRegisteredThenId)[0] ?? null;
  }
  // The flags a NEW registration starts with (accepted silently on the form).
  function duplicateFlagsFor(db, eventId, first, last) {
    const twin = findDuplicate(db, eventId, null, first, last);
    return twin ? { duplicate_state: 'possible', duplicate_of: twin.id } : { duplicate_state: 'none', duplicate_of: null };
  }
  // Works out one registration's mark again: withdrawn → none · "kept both" with a partner that
  // still matches → unchanged · another active match → possible · no match → none.
  function recheckDuplicate(db, reg, ctx) {
    if (!reg) return;
    let changes;
    if (reg.status !== 'active') {
      changes = { duplicate_state: 'none', duplicate_of: null };
    } else if (reg.duplicate_state === 'kept_both' && reg.duplicate_of !== null
      && db.registrations.some((m) => m.id === reg.duplicate_of && m.status === 'active' && m.event_id === reg.event_id && personKey(m) === personKey(reg))) {
      return; // staff said these two are both real
    } else {
      const twin = findDuplicate(db, reg.event_id, reg.id, reg.first_name, reg.last_name);
      changes = twin ? { duplicate_state: 'possible', duplicate_of: twin.id } : { duplicate_state: 'none', duplicate_of: null };
    }
    updateRow(reg, changes, ctx); // writes (and raises the version) only if something changes
  }
  // Rechecks every registration that points at this one (in id order).
  function recheckPointingAt(db, regId, ctx) {
    const pointing = db.registrations.filter((r) => r.duplicate_of === regId).sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const r of pointing) recheckDuplicate(db, r, ctx);
  }

  // ----- The 90-day signature clean-up (plan answer 3) -----
  // Signatures of events whose testing date is more than 90 days ago are removed. It changes
  // neither the version nor "last changed" (the database's before-write trigger skips it).
  function purgeOldSignatures(db) {
    const cutoff = addDays(today(), -SIGNATURE_KEEP_DAYS);
    const oldEvents = new Set(db.events.filter((e) => e.testing_date < cutoff).map((e) => e.id));
    const at = stamp();
    for (const reg of db.registrations) {
      if (oldEvents.has(reg.event_id) && reg.signature !== null) {
        reg.signature = null;
        reg.signature_deleted_at = at;
      }
    }
  }

  // A new public code (8 characters), made from a random uuid's bytes like the database does.
  function newPublicCode(db) {
    for (;;) {
      const hex = newId().replace(/-/g, '');
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[parseInt(hex.slice(i * 2, i * 2 + 2), 16) % CODE_ALPHABET.length];
      if (!db.events.some((e) => e.public_code === code)) return code;
    }
  }

  const nextReference = (db) => `CB-${db.next_reference++}`;
  const idMaker = () => ({ classId: newId, rankId: newId });

  // Copies the ticked classes into an event (the copy rule). Returns a status or null (= fine).
  // Checks first, writes only when every class is fine.
  function checkClassesToAdd(db, list, locationCode) {
    for (const item of list) {
      const cls = db.classes.find((c) => c.id === item.classId);
      if (!cls) return st('stale'); // deleted in Classes and ranks meanwhile
      if (cls.location_code !== locationCode) return st('invalid');
    }
    for (const item of list) {
      const cls = db.classes.find((c) => c.id === item.classId);
      if (!cls.final_award_none && cls.final_award_rank_id === null) return { status: 'final_award_not_set', class_name: cls.name };
    }
    return null;
  }
  function addClasses(db, eventId, list) {
    for (const item of list) {
      const cls = db.classes.find((c) => c.id === item.classId);
      const { eventClass, ranks } = copyClass(db, cls, eventId, item.start, item.end, idMaker());
      db.event_classes.push(eventClass);
      db.event_ranks.push(...ranks);
    }
  }

  // ----- The staff functions (contract 0005 §1.8). Each returns the jsonb answer. -----
  // Order everywhere: (no_access → role, done in rpc) → invalid (argument shape) → not_found →
  // stale → relational checks → write.

  // ===== Phase 4: the Private testing tab (contract 0014 §2) =====
  // A private testing is its own row (db.private), with its own payments (db.private_payments)
  // and its own result row (db.private_results). Same check order and statuses as migration 0014.

  const findPrivate = (db, id) => db.private.find((p) => p.id === id) ?? null;
  const privatePaymentsOf = (db, privateId) => db.private_payments.filter((p) => p.private_id === privateId);
  const privateIsReversed = (db, paymentId) => db.private_payments.some((p) => p.reverses_payment_id === paymentId);
  const privateResultOf = (db, privateId) => db.private_results.find((r) => r.private_id === privateId) ?? null;
  // Oldest first by recorded_at, ties by id — so the LAST one is "the most recent payment", as the
  // database picks it (order by recorded_at desc, id desc).
  const byRecordedAt = (a, b) => (a.recorded_at < b.recorded_at ? -1 : a.recorded_at > b.recorded_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  // The preview's copy of testing_private_amount_due (0014 §1.3), written out like the SQL:
  // greatest(private_cents − greatest(net, 0), 0). checks.mjs compares it with
  // privateRules.amountDue after every step.
  function privateAmountDue(db, row) {
    const net = sum(privatePaymentsOf(db, row.id).map((p) => p.amount_cents));
    return Math.max(row.private_cents - Math.max(net, 0), 0);
  }

  // The payment summary of the view testing_private_list (as testing_roster's): net, paid, and
  // the latest payment that isn't reversed.
  function privatePaymentSummary(db, privateId) {
    const rows = privatePaymentsOf(db, privateId);
    const net = sum(rows.map((p) => p.amount_cents));
    const live = rows.filter((p) => p.kind === 'payment' && !privateIsReversed(db, p.id)).sort(byRecordedAt);
    const last = live[live.length - 1] ?? null;
    return {
      paid: net > 0, paid_cents: net, paid_on: last?.paid_on ?? null, paid_method: last?.method ?? null,
      last_payment_id: last?.id ?? null, last_payment_recorded_at: last?.recorded_at ?? null,
    };
  }

  // One history row per changed row (0014's tkd.action + tkd.batch_id). Keeps the newest 500 rows
  // so the preview store stays small.
  const LOG_KEEP = 500;
  function logChange(db, batchId, action, tableName, op, recordId, ctx) {
    db.change_log.push({ table_name: tableName, op, record_id: recordId, action, batch_id: batchId, actor_name: ctx.actorName, at: stamp() });
    if (db.change_log.length > LOG_KEEP) db.change_log.splice(0, db.change_log.length - LOG_KEEP);
  }

  // The day rule (§1.2): today ≤ day ≤ today + 1 year. → a refusal, or null when fine.
  function privateDayRefusal(day) {
    const t = today();
    if (day < t) return st('past_day');
    if (day > privateDayLimit(t)) return st('invalid');
    return null;
  }

  // testing_private_rank_copy: what a private testing copies from LIVE Classes and ranks for one
  // rank of one school — the class, the rank and its belt, what it tests for and its private
  // price. → { status:'ok', copy } · stale (rank gone) · invalid (other school) ·
  // final_award_not_set (+ class_name: the last rank of a class whose final award isn't set).
  function privateRankCopy(db, locationCode, rankId) {
    const rank = db.ranks.find((r) => r.id === rankId);
    if (!rank) return st('stale');
    if (rank.location_code !== locationCode) return st('invalid');
    const cls = db.classes.find((c) => c.id === rank.class_id);
    if (!cls) return st('stale');
    const inClass = db.ranks.filter((r) => r.class_id === cls.id).sort(byPosition);
    const next = inClass[inClass.indexOf(rank) + 1] ?? null;
    // Testing for: the next rank, else the class's final award rank, else "No new rank".
    let target = next;
    if (!target && !cls.final_award_none) {
      target = cls.final_award_rank_id ? db.ranks.find((r) => r.id === cls.final_award_rank_id) ?? null : null;
      if (!target) return { status: 'final_award_not_set', class_name: cls.name };
    }
    const toBelt = Object.fromEntries(BELT_KEYS.map((k) => [`to_${k}`, target ? target[k] : null]));
    return {
      status: 'ok',
      copy: {
        class_id: cls.id, class_name: cls.name, rank_id: rank.id, rank_name: rank.name, ...beltOfRank(rank),
        to_kind: target ? 'rank' : 'none', to_name: target ? target.name : null, ...toBelt,
        private_cents: rank.private_cents,
      },
    };
  }

  // A new private testing row with the stamps the database's before-write trigger adds.
  function insertPrivate(db, fields, ctx) {
    const at = stamp();
    const row = {
      status: 'active', cancelled_at: null, cancelled_by_name: null, cancelled_by: null,
      moved_from_event_id: null, moved_from_registration_id: null, moved_from_event_name: null,
      moved_cleared_no_show: false, moved_registration_version: null,
      ...fields,
      version: 1, created_at: at, updated_at: at, created_by: ctx.userId ?? null, updated_by: ctx.userId ?? null,
      created_by_name: ctx.actorName, updated_by_name: ctx.actorName,
    };
    db.private.push(row);
    return row;
  }
  // A change to a private testing: a real change (or force) raises the version and stamps.
  function updatePrivate(row, changes, ctx, force = false) {
    const before = row.version;
    updateRow(row, changes, ctx, force);
    if (row.version !== before) row.updated_by = ctx.userId ?? null;
    return row.version !== before;
  }
  const newPrivatePayment = (db, fields, ctx) => {
    const payment = {
      id: newId(), kind: 'payment', reverses_payment_id: null, moved_from_payment_id: null,
      recorded_at: stamp(), recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName, ...fields,
    };
    db.private_payments.push(payment);
    return payment;
  };

  // The common start of the functions on an existing private testing (§2.5): the row → not_found,
  // version → stale (when one is sent), cancelled → cancelled. → [row, refusal].
  function privateStart(db, id, expectedVersion, { allowCancelled = false } = {}) {
    const row = findPrivate(db, id);
    if (!row) return [null, st('not_found')];
    if (expectedVersion !== undefined && row.version !== expectedVersion) return [row, st('stale')];
    if (!allowCancelled && row.status === 'cancelled') return [row, st('cancelled')];
    return [row, null];
  }

  // The grading window from the private day (§1.2): before it nobody, after it admins only.
  function privateGradingRefusal(row, ctx) {
    const t = today();
    if (t < row.private_date) return st('not_open');
    if (t > row.private_date && !ctx.isAdmin) return st('finished');
    return null;
  }

  // Writes the wanted { result, note } like the database (0010's step 7 on testing_private_results).
  function writePrivateResult(db, row, wanted, ctx, action) {
    const current = privateResultOf(db, row.id);
    const stored = { result: current?.result ?? null, note: current?.note ?? null };
    const stamps = { updated_at: stamp(), updated_by: ctx.userId ?? null, updated_by_name: ctx.actorName };
    if (stored.result === wanted.result && stored.note === wanted.note) {
      // the same as now: nothing is written, nothing logged
    } else {
      const batchId = newId();
      if (wanted.result === null && wanted.note === null) {
        db.private_results = db.private_results.filter((r) => r.private_id !== row.id);
        logChange(db, batchId, action, 'testing_private_results', 'delete', row.id, ctx);
      } else if (current) {
        Object.assign(current, wanted, stamps);
        logChange(db, batchId, action, 'testing_private_results', 'update', row.id, ctx);
      } else {
        db.private_results.push({ private_id: row.id, ...wanted, ...stamps });
        logChange(db, batchId, action, 'testing_private_results', 'insert', row.id, ctx);
      }
    }
    const saved = privateResultOf(db, row.id);
    return {
      status: 'ok', result: saved?.result ?? null, note: saved?.note ?? null,
      updated_at: saved?.updated_at ?? null, updated_by_name: saved?.updated_by_name ?? null,
    };
  }

  const answerTime = (t) => t.slice(0, 5); // '16:00:00' → '16:00' (to_char … 'HH24:MI')

  const privateHandlers = {
    // Add private testing (P2).
    testing_private_add(db, a, ctx) {
      if (!LOCATION_CODES.includes(a.p_location_code) || !nameIsValid(a.p_first) || !nameIsValid(a.p_last) || a.p_rank_id === null) return st('invalid');
      if (a.p_stripes !== true || !PAYING_BY.includes(a.p_paying_by)) return st('invalid');
      if (a.p_private_date === null || a.p_private_time === null || !privateTimeIsValid(a.p_private_time)) return st('invalid');
      const copied = privateRankCopy(db, a.p_location_code, a.p_rank_id);
      if (copied.status !== 'ok') return copied;
      const day = privateDayRefusal(a.p_private_date);
      if (day) return day;
      const row = insertPrivate(db, {
        id: newId(), location_code: a.p_location_code, first_name: normalizeName(a.p_first), last_name: normalizeName(a.p_last),
        ...copied.copy, paying_by: a.p_paying_by, stripes_confirmed: true, private_date: a.p_private_date, private_time: a.p_private_time,
      }, ctx);
      logChange(db, newId(), 'private_add', 'testing_private', 'insert', row.id, ctx);
      return { status: 'ok', id: row.id, version: row.version, amount_due_cents: privateAmountDue(db, row) };
    },

    // Edit details: names and the belt. The stored rank id sent back = "belt not changed" and is
    // never looked up (that rank may be gone from Classes and ranks).
    testing_private_update(db, a, ctx) {
      if (a.p_private_id === null || a.p_expected_version === null || !nameIsValid(a.p_first) || !nameIsValid(a.p_last) || a.p_rank_id === null) return st('invalid');
      const [row, refusal] = privateStart(db, a.p_private_id, a.p_expected_version);
      if (refusal) return refusal;
      const rankChanged = a.p_rank_id !== row.rank_id;
      let copy = {};
      if (rankChanged) {
        const copied = privateRankCopy(db, row.location_code, a.p_rank_id);
        if (copied.status !== 'ok') return copied;
        copy = copied.copy;
      }
      const res = privateResultOf(db, row.id);
      // The belt lock: a graded one (result or note) after its day — admins only.
      if (rankChanged && res && today() > row.private_date && !ctx.isAdmin) return st('not_allowed');
      const batchId = newId();
      const changed = updatePrivate(row, { first_name: normalizeName(a.p_first), last_name: normalizeName(a.p_last), ...copy }, ctx);
      if (changed) logChange(db, batchId, 'private_update', 'testing_private', 'update', row.id, ctx);
      let cleared = false;
      if (rankChanged && res) {
        db.private_results = db.private_results.filter((r) => r.private_id !== row.id);
        logChange(db, batchId, 'clear_result', 'testing_private_results', 'delete', row.id, ctx);
        cleared = true;
      }
      return { status: 'ok', version: row.version, amount_due_cents: privateAmountDue(db, row), result_cleared: cleared };
    },

    // Change day or time (P4). A No show is cleared with its note; Pass / Not passed → graded.
    testing_private_change_day(db, a, ctx) {
      if ([a.p_private_id, a.p_expected_version, a.p_private_date, a.p_private_time].includes(null)) return st('invalid');
      if (!privateTimeIsValid(a.p_private_time)) return st('invalid');
      const [row, refusal] = privateStart(db, a.p_private_id, a.p_expected_version);
      if (refusal) return refusal;
      const day = privateDayRefusal(a.p_private_date);
      if (day) return day;
      const res = privateResultOf(db, row.id);
      if (res && (res.result === 'pass' || res.result === 'not_passed')) return st('graded');
      let cleared = false;
      // The same day AND time: nothing written, nothing removed (no version bump).
      if (row.private_date !== a.p_private_date || row.private_time !== a.p_private_time) {
        const batchId = newId();
        updatePrivate(row, { private_date: a.p_private_date, private_time: a.p_private_time }, ctx);
        logChange(db, batchId, 'private_change_day', 'testing_private', 'update', row.id, ctx);
        if (res && res.result === 'no_show') {
          db.private_results = db.private_results.filter((r) => r.private_id !== row.id);
          logChange(db, batchId, 'clear_result', 'testing_private_results', 'delete', row.id, ctx);
          cleared = true;
        }
      }
      return { status: 'ok', version: row.version, private_date: row.private_date, private_time: answerTime(row.private_time), result_cleared: cleared };
    },

    // Change how they'll pay: while nothing is paid, or while money is still owed.
    testing_private_change_paying_by(db, a, ctx) {
      if (a.p_private_id === null || a.p_expected_version === null || !PAYING_BY.includes(a.p_paying_by)) return st('invalid');
      const [row, refusal] = privateStart(db, a.p_private_id, a.p_expected_version);
      if (refusal) return refusal;
      // A Pass / Not passed locks it, like Change day and Cancel (security review L3).
      const res = privateResultOf(db, row.id);
      if (res && (res.result === 'pass' || res.result === 'not_passed')) return st('graded');
      const net = sum(privatePaymentsOf(db, row.id).map((p) => p.amount_cents));
      if (!(net <= 0 || privateAmountDue(db, row) > 0)) return st('already_paid');
      if (updatePrivate(row, { paying_by: a.p_paying_by }, ctx)) logChange(db, newId(), 'private_change_paying_by', 'testing_private', 'update', row.id, ctx);
      return { status: 'ok', version: row.version };
    },

    // Mark paid: records what is owed (the price, or just the difference), by today's date.
    testing_private_mark_paid(db, a, ctx) {
      if (a.p_private_id === null || a.p_expected_version === null) return st('invalid');
      const [row, refusal] = privateStart(db, a.p_private_id, a.p_expected_version);
      if (refusal) return refusal;
      const owed = privateAmountDue(db, row);
      if (owed <= 0) return st('already_paid'); // also a $0 price: nothing is inserted (E10)
      if (owed > MAX_PAYMENT_CENTS) return st('invalid'); // the payments table's own limit
      const batchId = newId();
      const payment = newPrivatePayment(db, { private_id: row.id, amount_cents: owed, method: row.paying_by, paid_on: today() }, ctx);
      updatePrivate(row, {}, ctx, true); // a double click with the old version now gets 'stale'
      logChange(db, batchId, 'private_mark_paid', 'testing_private_payments', 'insert', payment.id, ctx);
      logChange(db, batchId, 'private_mark_paid', 'testing_private', 'update', row.id, ctx);
      return { status: 'ok', payment_id: payment.id, amount_cents: owed, method: payment.method, version: row.version };
    },

    // Undo payment: staff only their OWN payment, less than 10 seconds old, and never one that
    // arrived with a move (M2); admins any time.
    testing_private_undo_payment(db, a, ctx) {
      if (a.p_payment_id === null) return st('invalid');
      const payment = db.private_payments.find((p) => p.id === a.p_payment_id);
      if (!payment) return st('not_found');
      const recent = now() - Date.parse(payment.recorded_at) < UNDO_WINDOW_MS;
      const ownUndo = payment.recorded_by === ctx.userId && ctx.userId !== null && recent && payment.moved_from_payment_id === null;
      if (!ctx.isAdmin && !ownUndo) return st('not_allowed');
      if (payment.kind !== 'payment') return st('invalid'); // a reversal can't be reversed
      if (privateIsReversed(db, payment.id)) return st('stale'); // already undone
      const row = findPrivate(db, payment.private_id);
      if (row.status === 'cancelled') return st('cancelled');
      const batchId = newId();
      const reversal = newPrivatePayment(db, {
        private_id: row.id, kind: 'reversal', amount_cents: -payment.amount_cents, method: payment.method, paid_on: today(), reverses_payment_id: payment.id,
      }, ctx);
      updatePrivate(row, {}, ctx, true);
      logChange(db, batchId, 'private_undo_payment', 'testing_private_payments', 'insert', reversal.id, ctx);
      logChange(db, batchId, 'private_undo_payment', 'testing_private', 'update', row.id, ctx);
      return { status: 'ok', version: row.version };
    },

    // Edit payment (admins): the old payment is reversed and a new one recorded.
    testing_private_edit_payment(db, a, ctx) {
      if (a.p_payment_id === null || !PAYING_BY.includes(a.p_method) || a.p_paid_on === null || a.p_paid_on > today()) return st('invalid');
      if (a.p_amount_cents === null || a.p_amount_cents <= 0 || a.p_amount_cents > MAX_PAYMENT_CENTS) return st('invalid');
      const payment = db.private_payments.find((p) => p.id === a.p_payment_id);
      if (!payment) return st('not_found');
      if (payment.kind !== 'payment') return st('invalid');
      if (privateIsReversed(db, payment.id)) return st('stale');
      const row = findPrivate(db, payment.private_id);
      if (row.status === 'cancelled') return st('cancelled');
      const batchId = newId();
      const reversal = newPrivatePayment(db, {
        private_id: row.id, kind: 'reversal', amount_cents: -payment.amount_cents, method: payment.method, paid_on: today(), reverses_payment_id: payment.id,
      }, ctx);
      const replacement = newPrivatePayment(db, { private_id: row.id, amount_cents: a.p_amount_cents, method: a.p_method, paid_on: a.p_paid_on }, ctx);
      updatePrivate(row, {}, ctx, true);
      for (const p of [reversal, replacement]) logChange(db, batchId, 'private_edit_payment', 'testing_private_payments', 'insert', p.id, ctx);
      logChange(db, batchId, 'private_edit_payment', 'testing_private', 'update', row.id, ctx);
      return { status: 'ok', payment_id: replacement.id, version: row.version };
    },

    // Cancel private testing (P7): payments stay. Refused once there is a Pass / Not passed.
    testing_private_cancel(db, a, ctx) {
      if (a.p_private_id === null || a.p_expected_version === null) return st('invalid');
      const [row, refusal] = privateStart(db, a.p_private_id, a.p_expected_version);
      if (refusal) return refusal;
      const res = privateResultOf(db, row.id);
      if (res && (res.result === 'pass' || res.result === 'not_passed')) return st('graded');
      updatePrivate(row, { status: 'cancelled', cancelled_at: stamp(), cancelled_by_name: ctx.actorName, cancelled_by: ctx.userId ?? null }, ctx);
      logChange(db, newId(), 'private_cancel', 'testing_private', 'update', row.id, ctx);
      return { status: 'ok', version: row.version };
    },

    // Restore (admins): only while its day is today or later (§10 point 2).
    testing_private_restore(db, a, ctx) {
      if (a.p_private_id === null || a.p_expected_version === null) return st('invalid');
      const [row, refusal] = privateStart(db, a.p_private_id, a.p_expected_version, { allowCancelled: true });
      if (refusal) return refusal;
      if (row.status === 'active') return st('invalid'); // nothing to restore
      if (row.private_date < today()) return st('past_day');
      updatePrivate(row, { status: 'active', cancelled_at: null, cancelled_by_name: null, cancelled_by: null }, ctx);
      logChange(db, newId(), 'private_restore', 'testing_private', 'update', row.id, ctx);
      return { status: 'ok', version: row.version };
    },

    // Delete permanently (admins): the row, its payments and its result. The payment ids must be
    // exactly the ones the warning named.
    testing_private_delete(db, a, ctx) {
      if (a.p_private_id === null || a.p_expected_version === null || a.p_expected_payment_ids === null) return st('invalid');
      if (hasNull(a.p_expected_payment_ids) || hasDuplicates(a.p_expected_payment_ids)) return st('invalid');
      const [row, refusal] = privateStart(db, a.p_private_id, a.p_expected_version, { allowCancelled: true });
      if (refusal) return refusal;
      const payments = privatePaymentsOf(db, row.id);
      if (!sameSet(payments.map((p) => p.id), a.p_expected_payment_ids)) return st('stale');
      const batchId = newId();
      for (const p of payments) logChange(db, batchId, 'private_delete', 'testing_private_payments', 'delete', p.id, ctx);
      if (privateResultOf(db, row.id)) logChange(db, batchId, 'private_delete', 'testing_private_results', 'delete', row.id, ctx);
      logChange(db, batchId, 'private_delete', 'testing_private', 'delete', row.id, ctx);
      db.private_payments = db.private_payments.filter((p) => p.private_id !== row.id);
      db.private_results = db.private_results.filter((r) => r.private_id !== row.id);
      db.private = db.private.filter((p) => p.id !== row.id);
      return { status: 'ok' };
    },

    // Grading on the private testing's own page (0010's rules, counted from the private day).
    testing_private_set_result(db, a, ctx) {
      if (a.p_private_id === null) return st('invalid');
      if (a.p_result !== null && !RESULTS.includes(a.p_result)) return st('invalid');
      const [row, refusal] = privateStart(db, a.p_private_id);
      if (refusal) return refusal;
      const window = privateGradingRefusal(row, ctx);
      if (window) return window;
      return writePrivateResult(db, row, { result: a.p_result, note: privateResultOf(db, row.id)?.note ?? null }, ctx, 'private_set_result');
    },

    testing_private_set_result_note(db, a, ctx) {
      if (a.p_private_id === null) return st('invalid');
      if (typeof a.p_note === 'string' && a.p_note.length > 2000) return st('invalid'); // far too long to even tidy
      const note = normalizeGradingNote(a.p_note);
      if (note !== null && gradingNoteProblem(note) !== null) return st('invalid');
      const [row, refusal] = privateStart(db, a.p_private_id);
      if (refusal) return refusal;
      const window = privateGradingRefusal(row, ctx);
      if (window) return window;
      return writePrivateResult(db, row, { result: privateResultOf(db, row.id)?.result ?? null, note }, ctx, 'private_set_result_note');
    },

    // Move to private testing (P5, §2.5.1): the registration leaves its event (withdrawn, listed
    // under Removed) and becomes a private testing; its LIVE payments move with it — an event
    // reversal and a private payment each, both dated the original day. All staff, any time.
    testing_move_to_private(db, a, ctx) {
      if ([a.p_registration_id, a.p_expected_version, a.p_private_date, a.p_private_time].includes(null)) return st('invalid');
      if (!privateTimeIsValid(a.p_private_time)) return st('invalid');
      const reg = findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      if (reg.version !== a.p_expected_version) return st('stale');
      if (reg.status === 'withdrawn') return st('withdrawn');
      const day = privateDayRefusal(a.p_private_date);
      if (day) return day;
      // Step 7: the testing-day result. Pass / Not passed → has_result; a No show is removed; a
      // note alone stays with the registration.
      const res = resultOf(db, reg.id);
      if (res && (res.result === 'pass' || res.result === 'not_passed')) return st('has_result');
      const clearsNoShow = res?.result === 'no_show';
      // Step 8: the copy comes from the EVENT copy; the price is TODAY's private price in Classes
      // and ranks for that rank, or the event's copied price when the rank is gone (v0.404).
      const event = findEvent(db, reg.event_id);
      const eventRank = rankRow(db, reg.event_rank_id);
      const eventClass = classOfRank(db, reg.event_rank_id);
      const target = testingFor(copyOf(db, event.id), eventRank);
      const liveRank = eventRank.rank_id ? db.ranks.find((r) => r.id === eventRank.rank_id) ?? null : null;
      const toBelt = Object.fromEntries(BELT_KEYS.map((k) => [`to_${k}`, target ? target[k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())] ?? null : null]));
      // Step 9, one batch: (a) event reversals of every live payment, oldest first.
      const batchId = newId();
      const live = paymentsOf(db, reg.id).filter((p) => p.kind === 'payment' && !isReversed(db, p.id)).sort(byRecordedAt);
      for (const p of live) {
        const reversal = {
          id: newId(), registration_id: reg.id, kind: 'reversal', amount_cents: -p.amount_cents, method: p.method, paid_on: p.paid_on,
          recorded_at: stamp(), recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName, reverses_payment_id: p.id,
        };
        db.payments.push(reversal);
        logChange(db, batchId, 'move_to_private', 'testing_payments', 'insert', reversal.id, ctx);
      }
      // (b) the registration is withdrawn (who / when), then its duplicate partners re-checked.
      updateRow(reg, {
        status: 'withdrawn', withdrawn_reason: 'withdrawn', withdrawn_at: stamp(), withdrawn_by: ctx.userId ?? null, withdrawn_by_name: ctx.actorName,
        duplicate_state: 'none', duplicate_of: null,
      }, ctx);
      logChange(db, batchId, 'move_to_private', 'testing_registrations', 'update', reg.id, ctx);
      recheckPointingAt(db, reg.id, ctx);
      // (c) the private testing (version 1), remembering the registration's version now.
      const row = insertPrivate(db, {
        id: newId(), location_code: event.location_code, first_name: reg.first_name, last_name: reg.last_name,
        class_id: eventClass.class_id, class_name: eventClass.class_name, rank_id: eventRank.rank_id, rank_name: eventRank.name, ...beltOfRank(eventRank),
        to_kind: target ? 'rank' : 'none', to_name: target ? target.name : null, ...toBelt,
        private_cents: liveRank ? liveRank.private_cents : eventRank.private_cents,
        paying_by: reg.paying_by, stripes_confirmed: true, private_date: a.p_private_date, private_time: a.p_private_time,
        moved_from_event_id: event.id, moved_from_registration_id: reg.id, moved_from_event_name: event.name,
        moved_cleared_no_show: clearsNoShow, moved_registration_version: reg.version,
      }, ctx);
      logChange(db, batchId, 'move_to_private', 'testing_private', 'insert', row.id, ctx);
      // (d) one private payment per moved payment (same amount, method and day).
      for (const p of live) {
        // recorded_at stays the ORIGINAL payment's, so "the most recent payment" stays the same one (M1).
        const moved = newPrivatePayment(db, { private_id: row.id, amount_cents: p.amount_cents, method: p.method, paid_on: p.paid_on, moved_from_payment_id: p.id, recorded_at: p.recorded_at }, ctx);
        logChange(db, batchId, 'move_to_private', 'testing_private_payments', 'insert', moved.id, ctx);
      }
      // (e) a testing-day No show (and its note) is removed.
      if (clearsNoShow) {
        db.results = db.results.filter((r) => r.registration_id !== reg.id);
        logChange(db, batchId, 'clear_result', 'testing_results', 'delete', reg.id, ctx);
      }
      return {
        status: 'ok', private_id: row.id, version: row.version, registration_version: reg.version,
        amount_due_cents: privateAmountDue(db, row), result_cleared: clearsNoShow,
      };
    },

    // Undo move (the toast's Undo, §2.5.2): only the mover, within 10 seconds of the move (read
    // from the registration's withdrawn_by / withdrawn_at), and only while nothing changed since.
    testing_private_undo_move(db, a, ctx) {
      if (a.p_private_id === null || a.p_expected_version === null) return st('invalid');
      const row = findPrivate(db, a.p_private_id);
      if (!row || row.moved_from_registration_id === null) return st('not_found');
      const reg = findReg(db, row.moved_from_registration_id);
      if (!reg) return st('not_found'); // e.g. its event was deleted
      if (row.version !== a.p_expected_version) return st('stale');
      const withdrawnMs = reg.withdrawn_at ? Date.parse(reg.withdrawn_at) : NaN;
      if (reg.withdrawn_by !== (ctx.userId ?? null) || !(now() - withdrawnMs < UNDO_WINDOW_MS)) return st('not_allowed'); // admins too
      if (row.moved_cleared_no_show) return st('not_allowed'); // the No show can't come back (L1)
      const payments = privatePaymentsOf(db, row.id);
      if (reg.status !== 'withdrawn' || reg.version !== row.moved_registration_version || privateResultOf(db, row.id)
        || payments.some((p) => p.moved_from_payment_id === null || p.kind === 'reversal')) return st('stale');
      const batchId = newId();
      // Event payments again (recorded_by null, so the live 10-second own-undo can't reverse them).
      for (const p of [...payments].sort(byRecordedAt)) {
        const back = {
          id: newId(), registration_id: reg.id, kind: 'payment', amount_cents: p.amount_cents, method: p.method, paid_on: p.paid_on,
          recorded_at: p.recorded_at, recorded_by: null, recorded_by_name: ctx.actorName, reverses_payment_id: null, // its original moment (M1)
        };
        db.payments.push(back);
        logChange(db, batchId, 'undo_move_to_private', 'testing_payments', 'insert', back.id, ctx);
      }
      updateRow(reg, { status: 'active', withdrawn_reason: null, withdrawn_at: null, withdrawn_by: null, withdrawn_by_name: null }, ctx);
      logChange(db, batchId, 'undo_move_to_private', 'testing_registrations', 'update', reg.id, ctx);
      // The three duplicate re-checks of testing_restore_student.
      recheckDuplicate(db, reg, ctx);
      if (reg.duplicate_of !== null) {
        const partner = db.registrations.find((r) => r.id === reg.duplicate_of);
        if (partner) recheckDuplicate(db, partner, ctx);
      }
      recheckPointingAt(db, reg.id, ctx);
      for (const p of payments) logChange(db, batchId, 'undo_move_to_private', 'testing_private_payments', 'delete', p.id, ctx);
      logChange(db, batchId, 'undo_move_to_private', 'testing_private', 'delete', row.id, ctx);
      db.private_payments = db.private_payments.filter((p) => p.private_id !== row.id);
      db.private = db.private.filter((p) => p.id !== row.id);
      return { status: 'ok', registration_id: reg.id, registration_version: reg.version };
    },
  };


  const handlers = {
    testing_add_event(db, a, ctx) {
      const t = today();
      if (!LOCATION_CODES.includes(a.p_location_code) || !nameIsValid(a.p_name)) return st('invalid');
      if (a.p_testing_date === null || a.p_testing_date < t || a.p_registration_open === null) return st('invalid');
      if (a.p_auto_close_on !== null && (a.p_auto_close_on > a.p_testing_date || a.p_auto_close_on < t)) return st('invalid');
      if (!noteIsValid(a.p_note)) return st('invalid');
      const list = readClassList(a.p_classes);
      if (!list) return st('invalid');
      const problem = checkClassesToAdd(db, list, a.p_location_code);
      if (problem) return problem;
      const name = normalizeName(a.p_name);
      if (db.events.some((e) => e.location_code === a.p_location_code && nameKey(e.name) === nameKey(name))) return st('duplicate_name');
      const event = insertRow(db.events, {
        id: newId(), location_code: a.p_location_code, name, testing_date: a.p_testing_date,
        registration_open: a.p_registration_open, auto_close_on: a.p_auto_close_on,
        first_opened_at: a.p_registration_open ? stamp() : null, public_code: newPublicCode(db),
        note: normalizeNote(a.p_note),
      }, ctx);
      addClasses(db, event.id, list);
      purgeOldSignatures(db); // the last step (§1.5)
      return { status: 'ok', id: event.id, public_code: event.public_code, version: event.version };
    },

    testing_update_event(db, a, ctx) {
      const t = today();
      if (a.p_event_id === null || a.p_expected_version === null || !nameIsValid(a.p_name) || a.p_testing_date === null) return st('invalid');
      if (!noteIsValid(a.p_note)) return st('invalid');
      const list = readClassList(a.p_classes);
      if (!list) return st('invalid');
      const event = findEvent(db, a.p_event_id);
      if (!event) return st('not_found');
      if (event.version !== a.p_expected_version) return st('stale');
      // Phase 3: once any student of this event (active or withdrawn) has a result or a note,
      // the date can't move (the results belong to that day).
      if (a.p_testing_date !== event.testing_date) {
        const regIds = new Set(db.registrations.filter((r) => r.event_id === event.id).map((r) => r.id));
        if (db.results.some((r) => regIds.has(r.registration_id))) return st('has_results');
      }
      // A past event may keep its date; a NEW date must be today or later.
      if (a.p_testing_date !== event.testing_date && a.p_testing_date < t) return st('invalid');
      if (a.p_auto_close_on !== null) {
        if (a.p_auto_close_on > a.p_testing_date) return st('invalid');
        if (a.p_auto_close_on !== event.auto_close_on && a.p_auto_close_on < t) return st('invalid');
      }
      const current = classesOfEvent(db, event.id);
      const added = list.filter((item) => !current.some((c) => c.class_id === item.classId));
      const removed = current.filter((c) => !list.some((item) => item.classId === c.class_id));
      const name = normalizeName(a.p_name);
      if (db.events.some((e) => e.id !== event.id && e.location_code === event.location_code && nameKey(e.name) === nameKey(name))) return st('duplicate_name');
      for (const ec of removed) {
        const rankIds = new Set(ranksOfClass(db, ec.id).map((r) => r.id));
        if (db.registrations.some((r) => rankIds.has(r.event_rank_id))) return st('not_empty'); // active or withdrawn
      }
      const problem = checkClassesToAdd(db, added, event.location_code);
      if (problem) return problem;

      // Write: remove, add, change times.
      let classesChanged = added.length > 0 || removed.length > 0;
      const removedIds = new Set(removed.map((c) => c.id));
      db.event_ranks = db.event_ranks.filter((r) => !removedIds.has(r.event_class_id));
      db.event_classes = db.event_classes.filter((c) => !removedIds.has(c.id));
      addClasses(db, event.id, added);
      for (const item of list) {
        const ec = db.event_classes.find((c) => c.event_id === event.id && c.class_id === item.classId);
        if (ec.start_time !== item.start || ec.end_time !== item.end) {
          ec.start_time = item.start;
          ec.end_time = item.end;
          classesChanged = true;
        }
      }
      const note = normalizeNote(a.p_note);
      updateRow(event, { name, testing_date: a.p_testing_date, auto_close_on: a.p_auto_close_on, note }, ctx, classesChanged);
      return { status: 'ok', version: event.version };
    },

    testing_set_registration(db, a, ctx) {
      if (a.p_event_id === null || a.p_expected_version === null || a.p_open === null) return st('invalid');
      const event = findEvent(db, a.p_event_id);
      if (!event) return st('not_found');
      if (event.version !== a.p_expected_version) return st('stale');
      const rule = registrationSwitch({ event, open: a.p_open, isAdmin: ctx.isAdmin, today: today() });
      if (rule.status !== 'ok') return st(rule.status); // 'finished' or 'not_allowed'
      const changes = { registration_open: a.p_open };
      if (a.p_open && event.first_opened_at === null) changes.first_opened_at = stamp();
      if (rule.clearsAutoClose) changes.auto_close_on = null;
      updateRow(event, changes, ctx);
      return { status: 'ok', version: event.version, state: eventState(event, today()) };
    },

    testing_delete_event(db, a) {
      if ([a.p_event_id, a.p_expected_version, a.p_expected_registration_count, a.p_expected_payment_total_cents].includes(null)) return st('invalid');
      const event = findEvent(db, a.p_event_id);
      if (!event) return st('not_found');
      if (event.version !== a.p_expected_version) return st('stale');
      const regIds = new Set(db.registrations.filter((r) => r.event_id === event.id).map((r) => r.id));
      const total = sum(db.payments.filter((p) => regIds.has(p.registration_id)).map((p) => p.amount_cents)); // net of reversals
      if (regIds.size !== a.p_expected_registration_count || total !== a.p_expected_payment_total_cents) return st('stale');
      const classIds = new Set(classesOfEvent(db, event.id).map((c) => c.id));
      dropResultsOf(db, regIds); // cascades (phase 3)
      db.payments = db.payments.filter((p) => !regIds.has(p.registration_id));
      db.registrations = db.registrations.filter((r) => r.event_id !== event.id);
      db.event_ranks = db.event_ranks.filter((r) => !classIds.has(r.event_class_id));
      db.event_classes = db.event_classes.filter((c) => c.event_id !== event.id);
      db.events = db.events.filter((e) => e.id !== event.id);
      return { status: 'ok' };
    },

    testing_add_student(db, a, ctx) {
      if (a.p_event_id === null || !nameIsValid(a.p_first) || !nameIsValid(a.p_last) || a.p_event_rank_id === null) return st('invalid');
      if (a.p_stripes !== true || !PAYING_BY.includes(a.p_paying_by)) return st('invalid');
      const event = findEvent(db, a.p_event_id);
      if (!event) return st('not_found');
      // After the testing day only an admin may still add a student (v0.191).
      if (eventState(event, today()) === 'finished' && !ctx.isAdmin) return st('finished');
      if (!rankInEvent(db, a.p_event_rank_id, event.id)) return st('invalid');
      const at = stamp();
      const reg = insertRow(db.registrations, {
        id: newId(), event_id: event.id, event_rank_id: a.p_event_rank_id,
        first_name: normalizeName(a.p_first), last_name: normalizeName(a.p_last), paying_by: a.p_paying_by,
        stripes_confirmed: true, source: 'staff', reference: nextReference(db), submission_id: null, signature: null,
        signed_at: null, signature_deleted_at: null, ack_version: null, registered_at: at, status: 'active',
        withdrawn_reason: null, withdrawn_at: null, withdrawn_by: null, withdrawn_by_name: null,
        ...duplicateFlagsFor(db, event.id, a.p_first, a.p_last),
      }, ctx);
      return { status: 'ok', id: reg.id, reference: reg.reference, version: reg.version };
    },

    testing_update_student(db, a, ctx) {
      if (a.p_registration_id === null || a.p_expected_version === null || !nameIsValid(a.p_first) || !nameIsValid(a.p_last) || a.p_event_rank_id === null) return st('invalid');
      const reg = findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      if (reg.version !== a.p_expected_version) return st('stale');
      if (!rankInEvent(db, a.p_event_rank_id, reg.event_id)) return st('invalid');
      // Phase 3: a belt (and so class) change of a graded student clears their result; after
      // the testing day only an admin may do that. Name-only edits never touch the result.
      const rankChanged = a.p_event_rank_id !== reg.event_rank_id;
      const graded = isGradedReg(db, reg.id);
      if (rankChanged && graded && afterTestingDay(db, reg) && !ctx.isAdmin) return st('not_allowed');
      const before = reg.version;
      updateRow(reg, { first_name: normalizeName(a.p_first), last_name: normalizeName(a.p_last), event_rank_id: a.p_event_rank_id }, ctx);
      if (reg.version !== before) {
        recheckDuplicate(db, reg, ctx);
        recheckPointingAt(db, reg.id, ctx);
      }
      if (rankChanged && graded) {
        db.results = db.results.filter((r) => r.registration_id !== reg.id); // the 'clear_result' step
        return { status: 'ok', version: reg.version, result_cleared: true }; // the key only when true
      }
      return { status: 'ok', version: reg.version };
    },

    testing_change_paying_by(db, a, ctx) {
      if (a.p_registration_id === null || a.p_expected_version === null || !PAYING_BY.includes(a.p_paying_by)) return st('invalid');
      const reg = findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      if (reg.version !== a.p_expected_version) return st('stale');
      if (reg.status === 'withdrawn') return st('withdrawn');
      if (paymentSummary(db, reg.id).paid) return st('already_paid');
      updateRow(reg, { paying_by: a.p_paying_by }, ctx);
      return { status: 'ok', version: reg.version };
    },

    testing_mark_paid(db, a, ctx) {
      if (a.p_registration_id === null || a.p_expected_version === null) return st('invalid');
      const reg = findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      if (reg.version !== a.p_expected_version) return st('stale');
      if (reg.status === 'withdrawn') return st('withdrawn');
      if (paymentSummary(db, reg.id).paid) return st('already_paid');
      const event = findEvent(db, reg.event_id);
      const t = today();
      // The database decides: early price before the testing day, testing-day price on it.
      const amount = feeFor(rankRow(db, reg.event_rank_id), t, event.testing_date);
      if (!(amount > 0 && amount <= MAX_PAYMENT_CENTS)) return st('invalid'); // a $0 rank can't be "paid"
      const payment = {
        id: newId(), registration_id: reg.id, kind: 'payment', amount_cents: amount, method: reg.paying_by,
        paid_on: t, recorded_at: stamp(), recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName, reverses_payment_id: null,
      };
      db.payments.push(payment);
      updateRow(reg, {}, ctx, true); // a double click with the old version now gets 'stale'
      purgeOldSignatures(db); // the last step (§1.5)
      return { status: 'ok', payment_id: payment.id, amount_cents: amount, method: payment.method, version: reg.version };
    },

    testing_undo_payment(db, a, ctx) {
      if (a.p_payment_id === null) return st('invalid');
      const payment = db.payments.find((p) => p.id === a.p_payment_id);
      if (!payment) return st('not_found');
      // Staff: only their OWN payment, recorded less than 10 seconds ago. Admins: any time.
      const recent = now() - Date.parse(payment.recorded_at) < UNDO_WINDOW_MS;
      if (!ctx.isAdmin && !(payment.recorded_by === ctx.userId && recent)) return st('not_allowed');
      if (payment.kind !== 'payment') return st('invalid'); // a reversal can't be reversed
      if (isReversed(db, payment.id)) return st('stale'); // already undone
      const reg = findReg(db, payment.registration_id);
      db.payments.push({
        id: newId(), registration_id: reg.id, kind: 'reversal', amount_cents: -payment.amount_cents, method: payment.method,
        paid_on: today(), recorded_at: stamp(), recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName, reverses_payment_id: payment.id,
      });
      updateRow(reg, {}, ctx, true);
      return { status: 'ok', version: reg.version };
    },

    testing_edit_payment(db, a, ctx) {
      if (a.p_payment_id === null || !PAYING_BY.includes(a.p_method) || a.p_paid_on === null || a.p_paid_on > today()) return st('invalid');
      if (a.p_amount_cents === null || a.p_amount_cents <= 0 || a.p_amount_cents > MAX_PAYMENT_CENTS) return st('invalid');
      const payment = db.payments.find((p) => p.id === a.p_payment_id);
      if (!payment) return st('not_found');
      if (payment.kind !== 'payment') return st('invalid');
      if (isReversed(db, payment.id)) return st('stale');
      const reg = findReg(db, payment.registration_id);
      const at = stamp();
      const common = { registration_id: reg.id, recorded_at: at, recorded_by: ctx.userId ?? null, recorded_by_name: ctx.actorName };
      db.payments.push({ id: newId(), ...common, kind: 'reversal', amount_cents: -payment.amount_cents, method: payment.method, paid_on: today(), reverses_payment_id: payment.id });
      const replacement = { id: newId(), ...common, kind: 'payment', amount_cents: a.p_amount_cents, method: a.p_method, paid_on: a.p_paid_on, reverses_payment_id: null };
      db.payments.push(replacement);
      updateRow(reg, {}, ctx, true);
      return { status: 'ok', payment_id: replacement.id, version: reg.version };
    },

    testing_resolve_duplicate(db, a, ctx) {
      if ([a.p_keep_id, a.p_keep_version, a.p_other_id, a.p_other_version, a.p_keep_both].includes(null)) return st('invalid');
      if (a.p_keep_id === a.p_other_id) return st('invalid');
      const keep = findReg(db, a.p_keep_id);
      const other = findReg(db, a.p_other_id);
      if (!keep || !other) return st('not_found');
      if (keep.event_id !== other.event_id) return st('invalid');
      if (keep.version !== a.p_keep_version || other.version !== a.p_other_version) return st('stale');
      const isPair = (other.duplicate_state === 'possible' && other.duplicate_of === keep.id)
        || (keep.duplicate_state === 'possible' && keep.duplicate_of === other.id);
      // Withdrawn meanwhile, or not a flagged pair any more: the compare dialog is out of date.
      if (keep.status !== 'active' || other.status !== 'active' || !isPair) return st('stale');
      // Phase 3 (v0.194 point 3): after the testing day "keep one" is for admins only — for every
      // student, graded or not (it removes a registration once results may exist). Keep both stays
      // open to staff.
      if (!a.p_keep_both && afterTestingDay(db, keep) && !ctx.isAdmin) return st('not_allowed');
      if (a.p_keep_both) {
        updateRow(keep, { duplicate_state: 'kept_both', duplicate_of: other.id }, ctx);
        updateRow(other, { duplicate_state: 'kept_both', duplicate_of: keep.id }, ctx);
      } else {
        // The one withdrawal staff may do (Star v0.110): the other copy goes to Removed.
        updateRow(other, {
          status: 'withdrawn', withdrawn_reason: 'duplicate_copy', withdrawn_at: stamp(), withdrawn_by: ctx.userId, withdrawn_by_name: ctx.actorName,
          duplicate_state: 'none', duplicate_of: null,
        }, ctx);
        recheckDuplicate(db, keep, ctx);
        recheckPointingAt(db, other.id, ctx);
      }
      return { status: 'ok' };
    },

    testing_withdraw_student(db, a, ctx) {
      if (a.p_registration_id === null || a.p_expected_version === null) return st('invalid');
      const reg = findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      if (reg.version !== a.p_expected_version) return st('stale');
      if (reg.status === 'withdrawn') return st('withdrawn');
      updateRow(reg, {
        status: 'withdrawn', withdrawn_reason: 'withdrawn', withdrawn_at: stamp(), withdrawn_by: ctx.userId, withdrawn_by_name: ctx.actorName,
        duplicate_state: 'none', duplicate_of: null,
      }, ctx);
      recheckPointingAt(db, reg.id, ctx);
      return { status: 'ok', version: reg.version };
    },

    testing_restore_student(db, a, ctx) {
      if (a.p_registration_id === null || a.p_expected_version === null) return st('invalid');
      const reg = findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      // Phase 4 (0014 §2.6): a registration that was moved to a private testing can't come back
      // here — its payment is on the private testing now. Checked before the staff rule.
      if (db.private.some((p) => p.moved_from_registration_id === reg.id)) return st('moved');
      // Staff: only the copy they themselves removed with "keep one", less than 10 seconds ago
      // (the toast's Undo). Admins: any time. Checked before the version, like the payment Undo.
      // Phase 3: not for a graded student after the testing day (then admins only).
      const ownKeepOne = reg.status === 'withdrawn' && reg.withdrawn_reason === 'duplicate_copy'
        && ctx.userId !== null && reg.withdrawn_by === ctx.userId
        && now() - Date.parse(reg.withdrawn_at) < UNDO_WINDOW_MS
        && !(isGradedReg(db, reg.id) && afterTestingDay(db, reg));
      if (!ctx.isAdmin && !ownKeepOne) return st('not_allowed');
      if (reg.version !== a.p_expected_version) return st('stale');
      if (reg.status !== 'withdrawn') return st('invalid'); // nothing to restore
      updateRow(reg, { status: 'active', withdrawn_reason: null, withdrawn_at: null, withdrawn_by: null, withdrawn_by_name: null }, ctx);
      recheckDuplicate(db, reg, ctx);
      // The partner side too (like the database): the one it now matches, then any pointing at it.
      if (reg.duplicate_of !== null) {
        const partner = db.registrations.find((r) => r.id === reg.duplicate_of);
        if (partner) recheckDuplicate(db, partner, ctx);
      }
      recheckPointingAt(db, reg.id, ctx);
      return { status: 'ok', version: reg.version };
    },

    testing_delete_student(db, a, ctx) {
      if (a.p_registration_id === null || a.p_expected_version === null || a.p_expected_payment_ids === null) return st('invalid');
      if (hasNull(a.p_expected_payment_ids) || hasDuplicates(a.p_expected_payment_ids)) return st('invalid');
      const reg = findReg(db, a.p_registration_id);
      if (!reg) return st('not_found');
      if (reg.version !== a.p_expected_version) return st('stale');
      // Every payment row of this student (payments and reversals) must be what the warning named.
      if (!sameSet(paymentsOf(db, reg.id).map((p) => p.id), a.p_expected_payment_ids)) return st('stale');
      const pointing = db.registrations.filter((r) => r.duplicate_of === reg.id).sort((x, y) => (x.id < y.id ? -1 : 1));
      dropResultsOf(db, new Set([reg.id])); // cascades (phase 3)
      db.payments = db.payments.filter((p) => p.registration_id !== reg.id); // cascades
      db.registrations = db.registrations.filter((r) => r.id !== reg.id);
      for (const r of pointing) {
        updateRow(r, { duplicate_of: null }, ctx); // the database's ON DELETE SET NULL
        recheckDuplicate(db, r, ctx); // … then its mark is worked out again
      }
      return { status: 'ok' };
    },

    settings_update_school_address(db, a, ctx) {
      if (a.p_code === null || a.p_expected_version === null) return st('invalid');
      const parts = [tidyLine(a.p_street), tidyLine(a.p_city), trimSpaces(a.p_state), trimSpaces(a.p_zip)];
      const [street, city, state, zip] = parts;
      const filled = parts.filter((p) => p !== null).length;
      if (filled !== 0 && filled !== 4) return st('invalid'); // all four together, or none (= clear)
      if (filled === 4) {
        if (!lineIsValid(street, 100) || !lineIsValid(city, 60)) return st('invalid');
        if (!/^[A-Z]{2}$/.test(state) || !/^[0-9]{5}(-[0-9]{4})?$/.test(zip)) return st('invalid');
      }
      const school = location(db, a.p_code);
      if (!school) return st('not_found');
      if (school.version !== a.p_expected_version) return st('stale');
      // Only a change to an address part raises the version (§1.2).
      updateRow(school, { address_street: street, address_city: city, address_state: state, address_zip: zip }, ctx);
      return { status: 'ok', version: school.version };
    },

    // = 0019's settings_update_school_contact: the phone is checked first, then the address
    // exactly as above; both are saved or neither.
    settings_update_school_contact(db, a, ctx) {
      const phone = a.p_phone === null ? null : a.p_phone.trim() || null;
      if (phone !== null && !schoolPhoneOk(phone)) return st('invalid');
      const answer = handlers.settings_update_school_address(db, a, ctx);
      if (answer.status !== 'ok') return answer;
      const school = location(db, a.p_code);
      // written after the address, so a save that changes both raises the version by 2 (as 0019)
      if ((school.phone ?? null) !== phone) updateRow(school, { phone }, ctx);
      return { status: 'ok', version: school.version };
    },

    // ----- Grading (phase 3, contract 0010 §1.5) — the same check order as the database -----
    // (no_access is checked first, in rpc below). No expected version: the last change wins,
    // and a result never changes a registration's or event's version.

    testing_set_result(db, a, ctx) {
      if (a.p_registration_id === null) return st('invalid');
      if (a.p_result !== null && !RESULTS.includes(a.p_result)) return st('invalid'); // e.g. 'passed'
      const reg = findReg(db, a.p_registration_id);
      const refusal = gradingRefusal(db, reg, ctx);
      if (refusal) return refusal;
      return writeResult(db, reg.id, { result: a.p_result, note: resultOf(db, reg.id)?.note ?? null }, ctx);
    },

    testing_set_result_note(db, a, ctx) {
      if (a.p_registration_id === null) return st('invalid');
      // Tidied to one line; blank = clear the note. Then 1–200 characters, nothing invisible.
      const note = normalizeGradingNote(a.p_note);
      if (note !== null && gradingNoteProblem(note) !== null) return st('invalid');
      const reg = findReg(db, a.p_registration_id);
      const refusal = gradingRefusal(db, reg, ctx);
      if (refusal) return refusal;
      return writeResult(db, reg.id, { result: resultOf(db, reg.id)?.result ?? null, note }, ctx);
    },

    // Phase 4: the Private testing tab (below, contract 0014 §2.5).
    ...privateHandlers,
  };

  // ----- The public functions (only testing_registrar may call them, §1.8) -----

  // An address for the family page: { street, city, state, zip } or null (not entered yet).
  const addressOf = (school) => (school?.address_street
    ? { street: school.address_street, city: school.address_city, state: school.address_state, zip: school.address_zip }
    : null);
  // A belt in the public answer: the five database column names.
  const testingForJson = (copy, rank) => {
    const next = testingFor(copy, rank);
    if (!next) return null;
    return {
      name: next.name, belt_pattern: next.beltPattern, belt_color: next.beltColor, belt_color_2: next.beltColor2,
      belt_end_stripes: next.beltEndStripes, belt_end_stripe_color: next.beltEndStripeColor,
    };
  };

  // testing_public_event(p_code): what the family page may know about one event — nothing about
  // other events, no counts, no registrations, no ids except event_rank_id.
  function publicEventAnswer(db, code) {
    const event = typeof code === 'string' ? db.events.find((e) => e.public_code === code) : null;
    if (!event) return st('not_found');
    const school = location(db, event.location_code);
    const pub = publicStateFor(eventState(event, today()), event);
    const copy = copyOf(db, event.id);
    return {
      status: 'ok',
      state: pub.state, // 'open' | 'not_open' | 'closed' | 'finished'
      closed_on: pub.closedOn,
      event: {
        name: event.name, testing_date: event.testing_date, note: event.note, school_name: school?.name ?? null,
        address: addressOf(school), auto_close_on: event.auto_close_on,
      },
      classes: copy.map((cls) => ({
        class_name: cls.class_name, start_time: shortTime(cls.start_time), end_time: shortTime(cls.end_time), // '17:00'
        ranks: cls.ranks.map((r) => ({
          event_rank_id: r.id, name: r.name, ...beltOfRank(r), early_cents: r.early_cents, day_cents: r.day_cents,
          sparring_gear: r.sparring_gear, testing_for: testingForJson(copy, r),
        })),
      })),
    };
  }

  function publicEvent(code) {
    return publicEventAnswer(read(), code);
  }

  // The ok answer of a registration (also what a repeated send of the same form gets).
  function registeredAnswer(db, reg) {
    const event = findEvent(db, reg.event_id);
    const school = location(db, event.location_code);
    const copy = copyOf(db, event.id);
    const rank = rankRow(db, reg.event_rank_id);
    const cls = db.event_classes.find((c) => c.id === rank.event_class_id);
    return {
      status: 'ok', reference: reg.reference, first_name: reg.first_name, last_name: reg.last_name,
      testing_for: testingForJson(copy, rank), class_name: cls.class_name,
      start_time: shortTime(cls.start_time), end_time: shortTime(cls.end_time), // '17:00' like the database's answer
      early_cents: rank.early_cents, day_cents: rank.day_cents, paying_by: reg.paying_by, testing_date: event.testing_date,
      school_name: school?.name ?? null, address: addressOf(school),
    };
  }

  // testing_public_register(...). args use the database's names without "p_":
  //   { code, clientKey, submissionId, first, last, eventRankId, payingBy, stripes, signature, ackVersion }
  // forceRateLimited: preview helper — the rate-limit check fails at its normal place.
  // Every call writes one rate-limit row (outcome = the status returned) — even refusals.
  function publicRegister(args = {}, { forceRateLimited = false } = {}) {
    const db = read();
    const nowMs = now();
    const clientKey = typeof args.clientKey === 'string' ? args.clientKey : '';
    // Clean-up first: rate-limit rows older than 2 days, and old signatures.
    db.public_attempts = db.public_attempts.filter((row) => nowMs - Date.parse(row.at) <= ATTEMPT_KEEP_MS);
    purgeOldSignatures(db);
    const ctx = { actorName: 'Family form' };
    let eventId = null;

    const answer = (() => {
      const event = typeof args.code === 'string' ? db.events.find((e) => e.public_code === args.code) : null;
      if (!event) return st('not_found');
      eventId = event.id;
      const submissionId = typeof args.submissionId === 'string' && UUID_PATTERN.test(args.submissionId) ? args.submissionId.toLowerCase() : null;
      // The same form sent twice (double tap, retry): answer with the registration it made.
      if (submissionId !== null) {
        const earlier = db.registrations.find((r) => r.submission_id === submissionId);
        if (earlier) return earlier.event_id === event.id ? registeredAnswer(db, earlier) : st('invalid');
      }
      const pub = publicStateFor(eventState(event, today()), event);
      // 'not_open' | 'closed' (+ closed_on, like testing_public_event) | 'finished' (F10–F14)
      if (pub.state === 'closed') return { status: 'closed', closed_on: pub.closedOn };
      if (pub.state !== 'open') return st(pub.state);
      const rankId = typeof args.eventRankId === 'string' && UUID_PATTERN.test(args.eventRankId) ? args.eventRankId.toLowerCase() : null;
      const argsOk = clientKey.length >= 1 && clientKey.length <= 200 && submissionId !== null && rankId !== null
        && typeof args.first === 'string' && nameIsValid(args.first) && typeof args.last === 'string' && nameIsValid(args.last)
        && FORM_PAYING_BY.includes(args.payingBy) && args.stripes === true && signatureIsValid(args.signature)
        && args.ackVersion === ACK_VERSION;
      if (!argsOk) return st('invalid');
      if (!rankInEvent(db, rankId, event.id)) return st('invalid'); // a rank of another event
      const recent = db.public_attempts.filter((row) => row.client_key === clientKey && nowMs - Date.parse(row.at) < HOUR_MS).length;
      if (forceRateLimited || recent + 1 > RATE_LIMIT_PER_HOUR) return st('rate_limited');
      const at = stamp();
      const reg = insertRow(db.registrations, {
        id: newId(), event_id: event.id, event_rank_id: rankId, first_name: normalizeName(args.first), last_name: normalizeName(args.last),
        paying_by: args.payingBy, stripes_confirmed: true, source: 'form', reference: nextReference(db), submission_id: submissionId,
        signature: args.signature, signed_at: at, signature_deleted_at: null, ack_version: args.ackVersion, registered_at: at,
        status: 'active', withdrawn_reason: null, withdrawn_at: null, withdrawn_by: null, withdrawn_by_name: null,
        ...duplicateFlagsFor(db, event.id, args.first, args.last), // flagged silently — the family isn't told
      }, ctx);
      return registeredAnswer(db, reg);
    })();

    // The rate-limit row is written whatever happened (outside the part that can roll back).
    db.public_attempts.push({ id: db.next_attempt_id++, client_key: clientKey.slice(0, 200), event_id: eventId, at: new Date(nowMs).toISOString(), outcome: answer.status });
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

  // The rows of each readable table (the roster is the view: registrations + class + payments).
  function rowsOf(db, table) {
    switch (table) {
      case 'locations': return db.locations;
      case 'testing_events': return db.events;
      case 'testing_event_classes': return db.event_classes;
      case 'testing_event_ranks': return db.event_ranks;
      case 'testing_registrations': return db.registrations;
      case 'testing_payments': return db.payments;
      case 'testing_results': return db.results;
      case 'testing_private': return db.private;
      case 'testing_private_payments': return db.private_payments;
      case 'testing_private_results': return db.private_results;
      case 'testing_private_list':
        return db.private.map((row) => ({ ...row, ...privatePaymentSummary(db, row.id), amount_due_cents: privateAmountDue(db, row) }));
      case 'testing_roster':
        return db.registrations.map((reg) => {
          const rank = rankRow(db, reg.event_rank_id);
          const cls = classOfRank(db, reg.event_rank_id);
          return {
            ...reg, signed: reg.signed_at !== null,
            event_class_id: cls.id, class_id: cls.class_id, class_name: cls.class_name, class_position: cls.position,
            start_time: cls.start_time, end_time: cls.end_time,
            rank_id: rank.rank_id, rank_name: rank.name, rank_position: rank.position, ...beltOfRank(rank),
            early_cents: rank.early_cents, day_cents: rank.day_cents, sparring_gear: rank.sparring_gear,
            ...paymentSummary(db, reg.id),
          };
        });
      default: return [];
    }
  }

  // supabase.from(table).select(columns).eq(…).in(…).order(…)
  function select(table, columns, filters = [], orders = [], ctx = {}) {
    if (!(table in GRANTED)) return fail('PGRST205', `Could not find the table 'public.${table}' in the schema cache`, 404);
    if (!ctx.signedIn) return denied(`table ${table}`);
    const granted = GRANTED[table];
    const existing = [...granted, ...HIDDEN[table]];
    const wanted = String(columns ?? '*').split(',').map((col) => col.trim()).filter(Boolean);
    if (wanted.length === 0) wanted.push('*');
    const used = [...wanted, ...filters.map((f) => f.col), ...orders.map((o) => o.col)];
    for (const col of used) {
      if (col === '*' || HIDDEN[table].includes(col)) return denied(table === 'testing_roster' ? `view ${table}` : `table ${table}`);
      if (!existing.includes(col)) return fail('42703', `column ${table}.${col} does not exist`, 400);
    }
    if (!ctx.hasDataAccess) return ok([]); // row-level security hides every row
    let rows = rowsOf(read(), table);
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
    return ok(rows.map((row) => Object.fromEntries(wanted.map((col) => [col, row[col] ?? null]))));
  }

  // supabase.rpc(name, args) for the staff functions (15 from phase 2, 2 from phase 3, 14 from phase 4).
  function rpc(name, args = {}, ctx = {}) {
    if (EVENT_RESTRICTED_RPC_NAMES.includes(name)) {
      if (!ctx.signedIn) return denied(`function ${name}`);
      return denied(`function ${name}`); // only testing_registrar (or nobody) may call these
    }
    if (!(name in handlers)) return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
    if (failNext) {
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
    if (answer.status === 'ok') write(db);
    return ok(answer);
  }

  // ----- Test helpers (console helpers in mockClient.js, and checks.mjs) -----

  function failNextSave() {
    failNext = true;
  }

  // "Another admin" changes every event, registration, school and private testing: open dialogs
  // go stale.
  function simulateOtherAdminEdit() {
    const db = read();
    const at = stamp();
    for (const row of [...db.events, ...db.registrations, ...db.locations, ...db.private]) {
      row.version += 1;
      row.updated_by_name = 'Other Admin';
      row.updated_at = at;
    }
    write(db);
  }

  // Back to the default events, students and (empty) addresses; Classes and ranks are kept.
  function reset() {
    const db = read();
    Object.assign(db, defaultEventsData({ today: dataToday() }));
    write(db);
  }

  // checks.mjs only: the preview's testing_private_amount_due for one private testing (null = none).
  function privateAmountDueFor(privateId) {
    const db = read();
    const row = db.private.find((p) => p.id === privateId);
    return row ? privateAmountDue(db, row) : null;
  }

  return { select, rpc, publicEvent, publicRegister, failNextSave, simulateOtherAdminEdit, reset, snapshot: read, privateAmountDueFor };
}
