// duplicates.js — Camps' half of "possible duplicate": which sign-ups pair up, and the compare's rows.
// Why it exists: the box above the roster (components/DuplicateBox.jsx) and the side-by-side
// compare (components/CompareDialog.jsx) are shared parts since rulebook v0.729 (design review
// C20, carrying out v1.102). They draw; each section decides WHAT they show. This file is that
// Camps part (it used to live inside Camps' own DuplicateBox.jsx and CompareDialog.jsx):
//   - findPairs(active): the pairs of an active "Possible duplicate" sign-up and the one it matches
//   - compareRows(first, second, campDays, detailsHidden): the compare's lines, in Camps' order
//     Signed up · Reference · Days · Extras · Paying by · Total · Payment
//     Signed up and Reference always differ, so they are `plain` (never marked different). While
//     "Hide private details" is on (rulebook v0.722, design review C1) Paying by, Total and Payment
//     keep their rows but are `hidden`: the shared part shows gray "Hidden on this tablet" on both
//     sides and never marks them different. Signed up, Reference, Days and Extras stay, so staff can
//     still tell the two apart and keep one.
// Money (the Total row) is written by the shared formatMoney (src/lib/money.js; rulebook v0.732, C17).
import { formatMoney } from '../../lib/money.js';
import * as T from './text.js';

// Pairs { first, second } (first = the older sign-up), each pair once.
export function findPairs(active) {
  const pairs = [];
  const seen = new Set();
  for (const row of active) {
    if (row.duplicateState !== 'possible' || !row.duplicateOf) continue;
    const other = active.find((o) => o.id === row.duplicateOf);
    if (!other) continue;
    const key = [row.id, other.id].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const [first, second] = [row, other].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    pairs.push({ first, second });
  }
  return pairs;
}

// "Drop-off × 5 · Pick-up × 5" — a camper's extras, short (as in the C4b compare).
export function extrasShort(row) {
  const byExtra = new Map();
  for (const e of row.extras ?? []) {
    const entry = byExtra.get(e.extraId) ?? { name: e.name, per: e.per, count: 0 };
    entry.count += 1;
    byExtra.set(e.extraId, entry);
  }
  const parts = [...byExtra.values()].map((e) => (e.per === 'day' ? `${e.name} × ${e.count}` : e.name));
  return parts.length ? parts.join(' · ') : '—';
}

// "Paid Apr 12" / "Not paid"
const paymentText = (row) => (row.paidCents > 0 ? `${T.TAG_PAID} ${row.paidOn ? T.monthDay(row.paidOn) : ''}`.trim() : T.TAG_NOT_PAID);

// The rows for the shared CompareDialog: { key, label, first, second, plain?, hidden? }.
export function compareRows(first, second, campDays, detailsHidden = false) {
  return [
    { key: 'signedUp', label: T.CMP_SIGNED_UP, first: T.signedUpStamp(first.createdAt), second: T.signedUpStamp(second.createdAt), plain: true },
    { key: 'reference', label: T.CMP_REFERENCE, first: first.reference, second: second.reference, plain: true },
    { key: 'days', label: T.CMP_DAYS, first: T.camperDaysText(first, campDays), second: T.camperDaysText(second, campDays) },
    { key: 'extras', label: T.CMP_EXTRAS, first: extrasShort(first), second: extrasShort(second) },
    { key: 'payingBy', label: T.CMP_PAYING_BY, first: T.payingByText(first.payingBy), second: T.payingByText(second.payingBy), hidden: detailsHidden },
    { key: 'total', label: T.CMP_TOTAL, first: formatMoney(first.totalCents), second: formatMoney(second.totalCents), hidden: detailsHidden },
    { key: 'payment', label: T.CMP_PAYMENT, first: paymentText(first), second: paymentText(second), hidden: detailsHidden },
  ];
}
