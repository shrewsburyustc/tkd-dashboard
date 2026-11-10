// text.js — the words Black Belt gives the shared payment receipt (buildReceipt.js).
// Why it exists: contract CONTRACT-0016-B2 §0 / §4 — the data layer (src/lib/blackBelt/api.js)
// returns only codes ('ok', 'not_found', 'kukkiwon', 'check' …); the receipt's facts and table
// lines turn them into words here, in one place. The sentences come from the approved mockup
// Candidates 8 (TKD-BlackBelt-Candidates-Mockups.html, rulebook v0.220). Since BB2 (rulebook v1.002 /
// v1.105) the box, its buttons, the table's headings, the totals and the footer are the shared
// receipt's own words (src/components/text.js); only what is Black Belt's own stays here. Anything
// the mockup doesn't show is marked "(not in the mockups)".
//
// Money: whole cents in, "$290" / "$290.50" out (formatMoney, the shared src/lib/money.js).
// Dates: 'YYYY-MM-DD' school dates, turned into words by the staff screens' helpers.
import { formatMoney } from '../../../lib/money.js';
import { monthDay, shortDate } from '../text.js';

// ===== The box =====
export const dialogSub = (firstName, lastName, cycleName) => `${firstName} ${lastName} · ${cycleName}`;
export const NOT_FOUND = 'This candidate was deleted, so there is no receipt.'; // (not in the mockups)

// ===== The page's facts =====
export const KIND_LINE = 'Black Belt testing · payment receipt';
export const LABEL_CANDIDATE = 'Candidate';
export const LABEL_CYCLE = 'Cycle';
export const LABEL_REFERENCE = 'Reference';
export const LABEL_SCHOOL = 'School';
export const LABEL_PLAN = 'Plan';

// The word after a balance owed on the receipt (buildReceipt.js): "next due May 29", or "overdue"
// when the next payment's date has passed (the receipt has no "since" date).
export const nextDueNote = (dateText) => `next due ${dateText}`;
export const OVERDUE_NOTE = 'overdue';

const DAN = { 1: '1st Dan', 2: '2nd Dan', 3: '3rd Dan', 4: '4th Dan' };
export const danLabel = (dan) => DAN[dan] ?? '';
// "Alex Kim · 1st Dan"
export const candidateLine = (firstName, lastName, dan) => `${firstName} ${lastName} · ${danLabel(dan)}`;
// "Spring 2027 · first testing day Sat, Apr 3, 2027" (no first day yet: the name alone)
export const cycleLine = (cycleName, firstDay) => (firstDay ? `${cycleName} · first testing day ${shortDate(firstDay)}` : cycleName);

// The plan line, from the cycle's prices for this Dan (prices never change once set, v0.902):
//   one payment          "In full ($870)"
//   equal payments       "3 payments of $290"
//   unequal payments     "2 payments: $400 + $470"                      (not in the mockups)
//   + Kukkiwon           " + Kukkiwon certificate ($100, with payment 1)"
//   + Kukkiwon added after payment 1's date (kukkiwonAddedOn given)
//                        " + Kukkiwon certificate ($110, added Apr 26)"      (not in the mockups)
//   prices not found     the plan's name alone (should not happen)
export function planLine({ planName, amounts, kukkiwon, kukkiwonCents, kukkiwonAddedOn = null }) {
  let text = planName ?? '';
  if (Array.isArray(amounts) && amounts.length > 0 && amounts.every(Number.isInteger)) {
    const total = amounts.reduce((sum, c) => sum + c, 0);
    if (amounts.length === 1) text = `In full (${formatMoney(total)})`;
    else if (amounts.every((c) => c === amounts[0])) text = `${amounts.length} payments of ${formatMoney(amounts[0])}`;
    else text = `${amounts.length} payments: ${amounts.map((c) => formatMoney(c)).join(' + ')}`;
  }
  if (kukkiwon) {
    const when = kukkiwonAddedOn ? `added ${monthDay(kukkiwonAddedOn)}` : 'with payment 1';
    text += Number.isInteger(kukkiwonCents)
      ? ` + Kukkiwon certificate (${formatMoney(kukkiwonCents)}, ${when})`
      : ' + Kukkiwon certificate';
  }
  return text;
}

// ===== The table's "For" and "How paid" cells =====
export const NO_METHOD = '—'; // a returned check: no money changed hands that day
export const REFUND = 'Refund';

// One item code → its words: 'p2' → "Payment 2", 'kukkiwon' → "Kukkiwon certificate".
export function itemLabel(code) {
  if (code === 'kukkiwon') return 'Kukkiwon certificate';
  const match = /^p(\d{1,2})$/.exec(code ?? '');
  return match ? `Payment ${match[1]}` : '';
}
// Sort key for the items of one line: Payment 1, Kukkiwon (due with payment 1), Payment 2 …
const itemOrder = (code) => (code === 'kukkiwon' ? 1.5 : Number(/^p(\d{1,2})$/.exec(code ?? '')?.[1] ?? 99));
// ['kukkiwon', 'p1'] → "Payment 1 + Kukkiwon certificate". A one-payment plan's only payment is
// called by the plan's name ("In full"), as on the candidate's detail (contract §3.3).
export function itemsText(codes, { planName, paymentsCount }) {
  const list = (Array.isArray(codes) ? [...codes] : []).sort((a, b) => itemOrder(a) - itemOrder(b));
  return list
    .map((code) => (code === 'p1' && paymentsCount === 1 && planName ? planName : itemLabel(code)))
    .filter(Boolean)
    .join(' + ');
}
// A returned check's line: "Payment 2 · check returned"; when the check it marks can't be told
// apart, just "Check returned" (contract §4.2).
export const returnedText = (itemsWords) => (itemsWords ? `${itemsWords} · check returned` : 'Check returned');
