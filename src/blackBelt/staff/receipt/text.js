// text.js — every word of the Black Belt payment receipt (its preview and the printed page).
// Why it exists: contract CONTRACT-0016-B2 §0 / §4 — the data layer (src/lib/blackBelt/api.js)
// returns only codes ('ok', 'not_found', 'kukkiwon', 'check' …); the receipt turns them into words
// here, in one place. The sentences come from the approved mockup Candidates 8
// (TKD-BlackBelt-Candidates-Mockups.html, rulebook v0.220). Anything the mockup doesn't show is
// marked "(not in the mockups)" so it can be listed for Jeffrey's walkthrough (CP2).
//
// Money: whole cents in, "$290" / "$290.50" / "−$50" out (formatCents, money.js).
// Dates: 'YYYY-MM-DD' school dates, turned into words by the staff screens' helpers.
import { formatCents } from '../../../lib/blackBelt/money.js';
import { monthDay, shortDate } from '../text.js';

// "Apr 26, 2027" (the printed date) — the school date as text, read on this computer's calendar
// (new Date(year, month - 1, day), never new Date('YYYY-MM-DD'), which could show the day before).
export function longDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ===== The preview (dialog on PC / tablet, full screen on phones) =====
export const DIALOG_TITLE = 'Receipt';
export const dialogSub = (firstName, lastName, cycleName) => `${firstName} ${lastName} · ${cycleName}`;
export const PRINT = 'Print or save as PDF';
export const CLOSE = 'Close';
export const LOADING = 'Loading the receipt'; // screen readers only (not in the mockups)
export const LOAD_FAILED = "Couldn't load the receipt. Check the connection, then try again."; // (not in the mockups)
export const NOT_FOUND = 'This candidate was deleted, so there is no receipt.'; // (not in the mockups)
export const HIDDEN = 'Payments are hidden on this device.'; // (not in the mockups; Hide payments switch, v0.215)
// The printed page's name for screen readers in the preview (the picture of the page).
export const PAGE_LABEL = 'Receipt page as it will print'; // screen readers only (not in the mockups)

// ===== The printed page =====
export const SCHOOL_NAME = 'Jae H. Jeong’s U.S. Taekwondo Center';
export const PAGE_SUBTITLE = 'Black Belt testing · payment receipt';
export const LABEL_CANDIDATE = 'Candidate';
export const LABEL_CYCLE = 'Cycle';
export const LABEL_REFERENCE = 'Reference';
export const LABEL_SCHOOL = 'School';
export const LABEL_PLAN = 'Plan';

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
    if (amounts.length === 1) text = `In full (${formatCents(total)})`;
    else if (amounts.every((c) => c === amounts[0])) text = `${amounts.length} payments of ${formatCents(amounts[0])}`;
    else text = `${amounts.length} payments: ${amounts.map(formatCents).join(' + ')}`;
  }
  if (kukkiwon) {
    const when = kukkiwonAddedOn ? `added ${monthDay(kukkiwonAddedOn)}` : 'with payment 1';
    text += Number.isInteger(kukkiwonCents)
      ? ` + Kukkiwon certificate (${formatCents(kukkiwonCents)}, ${when})`
      : ' + Kukkiwon certificate';
  }
  return text;
}

// The table
export const COL_DATE = 'Date';
export const COL_FOR = 'For';
export const COL_HOW = 'How paid';
export const COL_AMOUNT = 'Amount';
export const lineDate = (iso) => monthDay(iso); // "Mar 27"

const METHOD = { cash: 'Cash', check: 'Check', card: 'Card' };
export const methodLabel = (method) => METHOD[method] ?? '';
export const NO_METHOD = '—'; // a returned check: no money changed hands that day

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
export const REFUND = 'Refund';
// A returned check's line: "Payment 2 · check returned"; when the check it marks can't be told
// apart, just "Check returned" (contract §4.2).
export const returnedText = (itemsWords) => (itemsWords ? `${itemsWords} · check returned` : 'Check returned');

// The totals
export const TOTAL_DUE = 'Total due';
export const PAID_TO_DATE = 'Paid to date';
export const BALANCE = 'Balance';
// "$0 · paid in full" · "$290 · next due May 29" · "$290 · overdue" · "−$50 · overpaid"
export function balanceText({ balanceCents, nextOn }) {
  const amount = formatCents(balanceCents);
  if (balanceCents === 0) return `${amount} · paid in full`;
  if (balanceCents < 0) return `${amount} · overpaid`;
  if (nextOn) return `${amount} · next due ${monthDay(nextOn)}`;
  return `${amount} · overdue`; // late or not paid (the receipt has no "since" date, contract §7.3)
}

// The footer: one line per school, then who printed it
// "Worcester · 1141 Main St · (508) 767-1717" (an empty street or phone is left out)
export const schoolLine = (name, street, phone) => [name, street, phone].filter((part) => typeof part === 'string' && part.trim() !== '').join(' · ');
export const printedLine = (printedOn, printedByName) =>
  `Printed ${longDate(printedOn)}${printedByName ? ` by ${printedByName}` : ''}. Fees are non-refundable.`;
