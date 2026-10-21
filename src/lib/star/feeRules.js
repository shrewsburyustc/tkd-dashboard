// feeRules.js — Star testing's fee and payment rules (contract 0006 §5.2–§5.3), as plain JavaScript.
// Why it exists: the PREVIEW database (mockStarCandidates.js) has to work out the star_roster view's
// fee, paid and overpaid columns the same way the real database does (§2.12), and the Node checks
// (candidatesChecks.mjs) prove it against the contract's fee cases, including OPEN-17 and OPEN-18.
//
// FOR THE FAKE AND THE CHECKS ONLY. The screens never work out a fee themselves: the Record payment
// dialog fills in star_roster.expected_fee_cents, which the real database works out (plan, phase 3).
// That way there is ONE rule (the database's) for the live dashboard.
//
// It is PURE: no React, no database, no browser. Objects may use the database's snake_case
// (amount_cents) or the app's camelCase (amountCents); pick() reads whichever is there.
//
// The rules, in this order (§5.2, the migration's star_fee_kind):
//   1. a make-up candidate                → 'none'      (no fee, v0.96)
//   2. a private testing day is set       → 'private'   (always the private fee, even when paid
//                                                        after the private day — OPEN-18)
//   3. paid (net total > 0)               → 'standard' if the latest payment that was NOT reversed
//                                           was paid BEFORE the testing day, else 'same_day'
//                                           (OPEN-17: "Back to the testing day" on the testing day is
//                                           decided by the payment's date)
//   4. not paid                           → 'standard' if today is before the testing day, else
//                                           'same_day' (on AND after the testing day, v0.167)
// Paid = net total > 0 (any amount counts, no underpaid state, v0.167). Overpaid = net total minus
// the fee owed, when paid and more than the fee (v0.152); otherwise 0.

export const FEE_KINDS = ['none', 'private', 'standard', 'same_day'];

function pick(object, camel, snake) {
  if (!object) return undefined;
  return object[camel] !== undefined ? object[camel] : object[snake];
}

const amountOf = (p) => pick(p, 'amountCents', 'amount_cents') ?? 0;
const kindOf = (p) => pick(p, 'kind', 'kind');
const reversesOf = (p) => pick(p, 'reversesPaymentId', 'reverses_payment_id') ?? null;
const recordedAtOf = (p) => pick(p, 'recordedAt', 'recorded_at') ?? '';

// The net total of a candidate's payment rows: payments + refunds (negative) + reversals.
export function netPaidCents(payments) {
  return (payments ?? []).reduce((total, p) => total + amountOf(p), 0);
}

// The ids of the rows that a reversal has undone.
export function reversedIds(payments) {
  return new Set((payments ?? []).map(reversesOf).filter((id) => id !== null));
}

// The latest payment row (kind 'payment') that no reversal has undone — newest recorded_at first,
// then the highest id, like the database's "order by recorded_at desc, id desc". null when none.
export function lastUnreversedPayment(payments) {
  const reversed = reversedIds(payments);
  const candidates = (payments ?? []).filter((p) => kindOf(p) === 'payment' && !reversed.has(p.id));
  candidates.sort((a, b) => {
    const x = recordedAtOf(a);
    const y = recordedAtOf(b);
    if (x !== y) return x < y ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  return candidates[0] ?? null;
}

// Refunds that no reversal has undone, as a POSITIVE number of cents.
export function refundedCents(payments) {
  const reversed = reversedIds(payments);
  // 0 - … (not -(…)) so "no refunds" is a plain 0, never JavaScript's -0
  return 0 - (payments ?? []).filter((p) => kindOf(p) === 'refund' && !reversed.has(p.id)).reduce((t, p) => t + amountOf(p), 0);
}

// Is a refund standing (recorded and not undone)? While it is, Undo / Edit payment are refused.
export function hasUnreversedRefund(payments) {
  const reversed = reversedIds(payments);
  return (payments ?? []).some((p) => kindOf(p) === 'refund' && !reversed.has(p.id));
}

// Which fee the candidate owes (one of FEE_KINDS). Dates are 'YYYY-MM-DD' text in school time.
//   isMakeup, privateOn ('YYYY-MM-DD' | null), paidCents (net total), lastPaidOn (paid_on of
//   lastUnreversedPayment, or null), testingDate, today
export function feeKind({ isMakeup, privateOn, paidCents, lastPaidOn, testingDate, today }) {
  if (isMakeup) return 'none';
  if (privateOn !== null && privateOn !== undefined) return 'private';
  if (paidCents > 0) return lastPaidOn !== null && lastPaidOn !== undefined && lastPaidOn < testingDate ? 'standard' : 'same_day';
  return today < testingDate ? 'standard' : 'same_day';
}

// The amount of a fee kind, from the event copy of the candidate's Dan (star_event_dans row).
export function feeCentsFor(kind, dan) {
  switch (kind) {
    case 'none': return 0;
    case 'private': return pick(dan, 'privateCents', 'private_cents');
    case 'standard': return pick(dan, 'standardCents', 'standard_cents');
    default: return pick(dan, 'sameDayCents', 'same_day_cents');
  }
}

// Overpaid: only when paid; never below 0.
export function overpaidCents(paidCents, expectedFeeCents) {
  return paidCents > 0 ? Math.max(paidCents - expectedFeeCents, 0) : 0;
}

// Everything the star_roster view works out about one candidate's money, in one go.
//   candidate: { is_makeup, private_on } (either spelling) · payments: that candidate's rows ·
//   dan: the event copy of its Dan · testingDate · today
// → { paidCents, paid, lastPayment (row | null), refundedCents, feeKind, expectedFeeCents, overpaidCents }
export function paymentSummary({ candidate, payments, dan, testingDate, today }) {
  const paidCents = netPaidCents(payments);
  const lastPayment = lastUnreversedPayment(payments);
  const kind = feeKind({
    isMakeup: pick(candidate, 'isMakeup', 'is_makeup') === true,
    privateOn: pick(candidate, 'privateOn', 'private_on') ?? null,
    paidCents,
    lastPaidOn: lastPayment ? pick(lastPayment, 'paidOn', 'paid_on') : null,
    testingDate,
    today,
  });
  const expectedFeeCents = feeCentsFor(kind, dan);
  return {
    paidCents,
    paid: paidCents > 0,
    lastPayment,
    refundedCents: refundedCents(payments),
    feeKind: kind,
    expectedFeeCents,
    overpaidCents: overpaidCents(paidCents, expectedFeeCents),
  };
}
