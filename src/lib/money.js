// money.js — turning prices into text and typed text back into prices.
// Why it exists: the database stores every testing price as whole CENTS (6500 = $65), because
// whole numbers never have rounding surprises. People type and read dollars. These helpers
// convert both ways with the same rule the database enforces (contract 0003 §1.5):
// whole dollars from $0 to $1,000 — so 0 ≤ cents ≤ 100000 and cents is a multiple of 100.
// It is also the dashboard's ONE way of showing any amount of money (formatMoney and
// formatMoneyWithCents, at the end; rulebook v1.026), which every section switches to.

export const MAX_PRICE_DOLLARS = 1000;
export const MAX_PRICE_CENTS = MAX_PRICE_DOLLARS * 100; // 100000

// en-US number style with thousands commas and no decimals: 100000 cents → "1,000".
const DOLLARS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

// 6500 → "$65", 0 → "$0", 100000 → "$1,000". Anything that isn't a number → "".
export function formatDollars(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '';
  return `$${DOLLARS.format(cents / 100)}`;
}

// What goes in a price field when a dialog opens: 6500 → "65". null → "" (empty field).
export function centsToInputText(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '';
  return String(cents / 100);
}

// Reads what someone typed in a price field. Returns ONE of:
//   { cents }                 e.g. "65", "$65", "1,000", "65.00" → { cents: 6500 } …
//   { problem: 'empty' }      nothing typed
//   { problem: 'notWhole' }   "65.50" (cents aren't used)
//   { problem: 'notNumber' }  "abc", "-5", "6 5"
//   { problem: 'tooHigh' }    more than $1,000
export function parseDollars(text) {
  let s = String(text ?? '').trim();
  if (s.startsWith('$')) s = s.slice(1); // one leading $ is fine
  s = s.trim().replace(/,/g, ''); // "1,000" → "1000"
  if (s === '') return { problem: 'empty' };

  let dollars;
  if (/^\d+$/.test(s)) {
    dollars = Number(s);
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    const [whole, decimals] = s.split('.');
    // "65.0" and "65.00" are still whole dollars; "65.5" isn't.
    if (!/^0+$/.test(decimals)) return { problem: 'notWhole' };
    dollars = Number(whole);
  } else {
    return { problem: 'notNumber' }; // includes "-5" (no minus sign allowed)
  }

  if (dollars > MAX_PRICE_DOLLARS) return { problem: 'tooHigh' };
  return { cents: dollars * 100 };
}

// The database's rule for a stored price: a whole number of cents, 0–100000, whole dollars.
export function isValidCents(n) {
  return Number.isInteger(n) && n >= 0 && n <= MAX_PRICE_CENTS && n % 100 === 0;
}

// ----- Showing an amount of money: the dashboard's one rule (rulebook v1.026, v1.101) -----
// Every screen writes money the same way (Dashboard core step 1, M9):
//   formatMoney           "$65", with cents only when there are some ("$290.50", "$1,120")
//   formatMoneyWithCents  always cents ("$65.00") — Finance's report, print and export
// A minus amount (a refund, a reversed payment, an overpaid balance) gets a real minus sign
// (−, not the keyboard hyphen "-") BEFORE the dollar sign: "−$190", "−$190.00".
// Both take whole CENTS (6500 = $65), any size, negatives too. Anything else — null, text,
// 290.5 — gives '' (an empty spot on screen, never "$NaN").
// (Finance's CSV file keeps plain numbers, "-190.00", so spreadsheets can add them up: that is
// src/lib/finance/csv.js, not these. formatDollars above stays for whole-dollar prices.)
const MINUS = '\u2212'; // − (U+2212), the real minus sign

// 6500 → "$65", 29050 → "$290.50", 112000 → "$1,120", -19000 → "−$190", 0 → "$0".
export function formatMoney(cents) {
  if (!Number.isInteger(cents)) return '';
  const abs = Math.abs(cents);
  const rest = abs % 100; // the cents part: 50 in 29050
  const sign = cents < 0 ? MINUS : '';
  return `${sign}$${DOLLARS.format(Math.floor(abs / 100))}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}

// 6500 → "$65.00", 29050 → "$290.50", -19000 → "−$190.00", 0 → "$0.00".
export function formatMoneyWithCents(cents) {
  if (!Number.isInteger(cents)) return '';
  const abs = Math.abs(cents);
  const sign = cents < 0 ? MINUS : '';
  return `${sign}$${DOLLARS.format(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, '0')}`;
}
