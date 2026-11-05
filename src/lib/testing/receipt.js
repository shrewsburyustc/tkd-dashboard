// receipt.js — a Color Belt payment receipt, as the plain list the shared receipt draws
// (components/Receipt.jsx; design review CB2, rulebook v1.002 / v1.105, Color Belt v0.420 / v0.421,
// mockup P3; modelled on Star's lib/star/candidatesReceipt.js and Camps' lib/camps/campReceipt.js).
// Why it exists: Print receipt (the ⋯ money group; later the summaries' Payment row) shows the
// shared receipt filled with Color Belt's data — all of it already read, no migration:
//   - the event page's loadEvent (or, for a private testing, the Private testing tab's load): the
//     student, the class, the payments;
//   - loadSchools(): both schools' street and phone (the footer);
//   - get_my_profile: the name in "Printed … by [name]" (left out when that call failed, v0.518 Q7 A).
// One builder for both kinds of record, so step 4 (private testing) reuses it:
//   - an event registration: Student · Event (with its date) · Class (with its time) · School ·
//     Reference;
//   - a private testing: Student · Private testing (day and time) · Moved from · [event] (only
//     when it was moved from an event, v0.421 Q A) · Class · School · Reference (when it has one).
// Which payment lines show (v0.421): one line per payment that still stands, oldest first, each
// "Testing fee" — undone payments and their reversals are left out (an Edit payment is a reversal
// plus a new payment, so only the new one shows); a private testing's top-up is simply a second
// line. A payment row doesn't say which price it paid, so the receipt doesn't guess.
// It never holds a date of birth, an email, notes, a signature or links.
// It is PURE (no React, no database), so src/lib/testing/checks.mjs can check it with plain Node.
import { classTimeLabel, feeFor } from './eventRules.js';
import {
  RECEIPT_KIND,
  RECEIPT_STUDENT,
  RECEIPT_EVENT,
  RECEIPT_PRIVATE,
  RECEIPT_MOVED_FROM,
  RECEIPT_CLASS,
  RECEIPT_SCHOOL,
  RECEIPT_REFERENCE,
  RECEIPT_FOR_FEE,
  monthDayYear,
  weekdayMonthDay,
  timeLabel,
} from '../../screens/testing/text.js';

const SCHOOL = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };

// The payments that still stand: kind 'payment' with no reversal pointing at it. Oldest first
// (by the day it was paid, then by when it was recorded). Works for event and private payments
// alike (both carry kind, reversesPaymentId, paidOn, recordedAt).
export function standingPayments(payments) {
  const list = payments ?? [];
  const reversed = new Set(list.filter((p) => p.kind === 'reversal').map((p) => p.reversesPaymentId));
  return list
    .filter((p) => p.kind === 'payment' && !reversed.has(p.id))
    .sort((a, b) => (a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : String(a.recordedAt ?? '') < String(b.recordedAt ?? '') ? -1 : 1));
}

// An event registration's Total due: the price the database charges, as Star's receipt does
// (star_fee_kind, v0.518). Not paid yet → today's price (early before the testing day, the
// testing-day price on it and after). Paid → the price on the day of the latest payment that still
// stands, so a family who paid the early price doesn't show "$10 owed" on a receipt printed on the
// testing day (an event registration has no part payments: paid is paid, v0.418).
export function eventTotalDueCents(rank, payments, todayIso, testingDateIso) {
  const standing = standingPayments(payments);
  const day = standing.length > 0 ? standing[standing.length - 1].paidOn : todayIso;
  const fee = feeFor(rank, day, testingDateIso);
  return typeof fee === 'number' ? fee : 0;
}

// "Owen Reed · White → Yellow" (no new rank: just the belt)
function studentValue(firstName, lastName, fromName, toName) {
  const name = `${firstName} ${lastName}`;
  if (!fromName) return name;
  return toName ? `${name} · ${fromName} → ${toName}` : `${name} · ${fromName}`;
}

// The plain receipt (Receipt.jsx's shape) for one event registration or one private testing.
//   firstName, lastName       the student
//   rankName, testingForName  "White", "Yellow" (testingForName null = no new rank)
//   event                     { name, testingDate } — an event registration
//   privateTesting            { privateOn 'YYYY-MM-DD', privateTime 'HH:MM', movedFromEventName|null }
//                             — a private testing (give event OR privateTesting)
//   className                 "White"; classStart / classEnd 'HH:MM' add the time (event only)
//   locationCode              'worcester' | 'shrewsbury'
//   reference                 'CB-3104', or null (left out)
//   payments                  every payment row of this record (payments and reversals)
//   totalDueCents             the price (event: eventTotalDueCents; private: its price)
//   schools                   loadSchools()'s schools ([] when they couldn't load: no footer lines)
//   printedOn                 today at the school, 'YYYY-MM-DD'
//   printedByName             get_my_profile's full_name, or null
export function buildColorBeltReceipt({
  firstName,
  lastName,
  rankName = null,
  testingForName = null,
  event = null,
  privateTesting = null,
  className = '',
  classStart = null,
  classEnd = null,
  locationCode,
  reference = null,
  payments = [],
  totalDueCents = 0,
  schools = [],
  printedOn,
  printedByName = null,
}) {
  const facts = [[RECEIPT_STUDENT, studentValue(firstName, lastName, rankName, testingForName)]];
  if (privateTesting) {
    const when = [weekdayMonthDay(privateTesting.privateOn), timeLabel(privateTesting.privateTime)].filter(Boolean).join(', ');
    facts.push([RECEIPT_PRIVATE, when]);
    // v0.421 Q A: a private testing moved from an event names the event (explains a payment dated
    // before the private testing existed). One added at the desk has no such line.
    if (privateTesting.movedFromEventName) facts.push([RECEIPT_MOVED_FROM, privateTesting.movedFromEventName]);
  } else if (event) {
    facts.push([RECEIPT_EVENT, `${event.name} · ${monthDayYear(event.testingDate)}`]);
  }
  const time = !privateTesting && classStart && classEnd ? classTimeLabel(classStart, classEnd) : '';
  facts.push([RECEIPT_CLASS, time ? `${className} · ${time}` : className]);
  facts.push([RECEIPT_SCHOOL, SCHOOL[locationCode] ?? '']);
  if (reference) facts.push([RECEIPT_REFERENCE, reference]);

  const standing = standingPayments(payments);
  const lines = standing.map((p) => ({ date: p.paidOn, forText: RECEIPT_FOR_FEE, how: p.method, amountCents: p.amountCents }));
  return {
    kindLine: RECEIPT_KIND,
    facts,
    lines,
    totalDueCents: totalDueCents ?? 0,
    paidCents: standing.reduce((sum, p) => sum + p.amountCents, 0),
    balanceNote: null,
    schools: (schools ?? []).map((s) => ({ name: s.name, street: s.address?.street ?? '', phone: s.phone ?? '' })),
    printedOn,
    printedByName: typeof printedByName === 'string' && printedByName.trim() !== '' ? printedByName.trim() : null,
  };
}
