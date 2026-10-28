// candidatesReceipt.js — a Star candidate's payment receipt, as the plain list the shared receipt
// draws (components/Receipt.jsx; design review S2, rulebook v1.002 / v1.105 / v0.518, DR2-P4).
// Why it exists: Print receipt (the ⋯ money group and the summary's Payment part) shows the shared
// receipt filled with Star's data — all of it read today, no migration:
//   - star_candidate_detail (loadCandidateDetail): the candidate, the payments (oldest first), the
//     amount paid and the fee;
//   - loadSchools(): both schools' street and phone (the footer);
//   - get_my_profile: the name in "Printed … by [name]" (left out when that call failed, Q7 A).
// Which payment lines show: every payment and refund, oldest first, leaving out undone payments
// and their reversals — as the summary's Payment line does. A refund is its own line with a minus
// ("−$10", the shared money helper). Every payment line reads "Testing fee": a payment row doesn't
// say which fee it paid (standard, same day or private — a private testing set after the payment,
// or an edited amount, would make any guess wrong), so the receipt doesn't guess (review fix, v0.518). It never holds a date of birth, an email, notes or links.
// It is PURE (no React, no database), so candidatesChecks.mjs can check it with plain Node.
import { weekdayMonthDay, shortDate } from '../calendarDates.js';
import { startTimeLabel } from './starEventRules.js';
import { RECEIPT_KIND, RECEIPT_CANDIDATE, RECEIPT_EVENT, RECEIPT_SCHOOL_LABEL, RECEIPT_PRIVATE, RECEIPT_FOR_FEE, RECEIPT_FOR_REFUND } from './candidatesText.js';

const SCHOOL = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
const stars = (n) => `${n} ${n === 1 ? 'star' : 'stars'}`;

// The "For" words of one payment line: "Refund", or the neutral "Testing fee" (see above).
const forText = (payment) => (payment.kind === 'refund' ? RECEIPT_FOR_REFUND : RECEIPT_FOR_FEE);

// The payment lines that still count: no reversal rows, no payment or refund that was undone.
export function receiptPayments(payments) {
  return (payments ?? []).filter((p) => p.kind !== 'reversal' && !p.reversed);
}

// detail      loadCandidateDetail's answer (status 'ok')
// eventName   the event's name ("Fall Star Testing")
// schools     loadSchools()'s schools ([] when they couldn't load: the footer then has none)
// printedOn   today at the school, 'YYYY-MM-DD'
// printedByName  get_my_profile's full_name, or null
// → the plain receipt (Receipt.jsx's shape)
export function buildStarReceipt({ detail, eventName, schools = [], printedOn, printedByName = null }) {
  const c = detail.candidate;
  const facts = [
    [RECEIPT_CANDIDATE, `${c.firstName} ${c.lastName} · ${c.danLabel} · ${stars(c.starsFrom)} → ${stars(c.starsTo)}`],
    [RECEIPT_EVENT, `${eventName} · ${shortDate(c.testingDate)}`],
    [RECEIPT_SCHOOL_LABEL, SCHOOL[c.locationCode] ?? ''],
  ];
  if (c.privateOn) facts.push([RECEIPT_PRIVATE, `${weekdayMonthDay(c.privateOn)}, ${startTimeLabel(c.privateTime)}`]);
  const lines = receiptPayments(detail.payments).map((p) => ({
    date: p.paidOn,
    forText: forText(p),
    how: p.method,
    // a refund is stored as a minus amount already; written with a minus either way
    amountCents: p.kind === 'refund' ? -Math.abs(p.amountCents) : p.amountCents,
  }));
  return {
    kindLine: RECEIPT_KIND,
    facts,
    lines,
    totalDueCents: detail.expectedFeeCents ?? 0,
    paidCents: detail.paidCents ?? 0,
    balanceNote: null,
    schools: (schools ?? []).map((s) => ({ name: s.name, street: s.address?.street ?? '', phone: s.phone ?? '' })),
    printedOn,
    printedByName: typeof printedByName === 'string' && printedByName.trim() !== '' ? printedByName.trim() : null,
  };
}
