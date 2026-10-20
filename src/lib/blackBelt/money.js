// money.js — Black Belt prices: reading what an admin types into a price box, and the price rule.
// Why it exists: Black Belt prices go up to $5,000 (4th Dan in full is $2,700), but Color Belt's
// parseDollars in src/lib/money.js stops at $1,000. The database has its own rule for Black Belt,
// bb_price_is_valid (migration 0016, section 1a): WHOLE dollars from $1 to $5,000, stored as
// cents (29000 = $290). This file is the same rule for the screens and the preview database, so
// Save turns gray before the database would say "invalid".
// For SHOWING a price use formatDollars from src/lib/money.js (87000 → "$870"); for payment amounts
// (any cents, phase B2) use parseAmount / formatCents / amountInputText at the end of this file.
//
// It is pure (no React, no browser), so Node can import it (checks.mjs) and so can the public
// family form.

export const PRICE_MIN_DOLLARS = 1;
export const PRICE_MAX_DOLLARS = 5000;
export const PRICE_MIN_CENTS = PRICE_MIN_DOLLARS * 100; // 100
export const PRICE_MAX_CENTS = PRICE_MAX_DOLLARS * 100; // 500000

// The database's rule for a stored price: a whole number of cents from 100 to 500000 that is a
// whole number of dollars (a multiple of 100). Anything else (null, text, 290.5) → false.
export function priceIsValid(cents) {
  return Number.isInteger(cents) && cents >= PRICE_MIN_CENTS && cents <= PRICE_MAX_CENTS && cents % 100 === 0;
}

// Reads what someone typed in a price box. Returns ONE of:
//   { cents }                 "290", "$290", "2,700", "290.00" → { cents: 29000 } …
//   { problem: 'empty' }      nothing typed
//   { problem: 'notWhole' }   "290.50" (prices are whole dollars)
//   { problem: 'notNumber' }  "abc", "-5", "2 90"
//   { problem: 'tooLow' }     "$0"
//   { problem: 'tooHigh' }    more than $5,000
// The screens turn the problem code into words ("Whole dollars from $1 to $5,000.").
export function parsePrice(text) {
  let s = String(text ?? '').trim();
  if (s.startsWith('$')) s = s.slice(1); // one leading $ is fine
  s = s.trim().replace(/,/g, ''); // "2,700" → "2700"
  if (s === '') return { problem: 'empty' };

  let dollars;
  if (/^\d+$/.test(s)) {
    dollars = Number(s);
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    const [whole, decimals] = s.split('.');
    // "290.0" and "290.00" are still whole dollars; "290.5" isn't.
    if (!/^0+$/.test(decimals)) return { problem: 'notWhole' };
    dollars = Number(whole);
  } else {
    return { problem: 'notNumber' }; // includes "-5" (no minus sign allowed)
  }

  if (dollars < PRICE_MIN_DOLLARS) return { problem: 'tooLow' };
  if (dollars > PRICE_MAX_DOLLARS) return { problem: 'tooHigh' };
  return { cents: dollars * 100 };
}

// ----- Payment amounts (phase B2, contract 0016-B2 §1.5) -----
// A payment, refund or returned check can be ANY number of cents from $0.01 to $5,000 (staff may
// type any amount, v0.900) — unlike a price, which is whole dollars. The database's rule is in
// bb_record_payment / bb_edit_payment / bb_record_refund (1 to 500000 cents).

export const AMOUNT_MIN_CENTS = 1;
export const AMOUNT_MAX_CENTS = 500000;

// Reads what someone typed in an Amount box. Returns ONE of:
//   { cents }                      "290" → 29000, "$290.50" → 29050, "1,350" → 135000, "0.01" → 1
//   { problem: 'empty' }           nothing typed
//   { problem: 'notNumber' }       "abc", "-5" (no minus sign), "2 90", "1.2.3"
//   { problem: 'tooManyDecimals' } "290.505" (cents are the smallest unit)
//   { problem: 'tooLow' }          "0", "0.00"
//   { problem: 'tooHigh' }         more than $5,000 ("5000.01")
// The screens turn the problem code into words ("Use at most two decimals.").
export function parseAmount(text) {
  let s = String(text ?? '').trim();
  if (s.startsWith('$')) s = s.slice(1); // one leading $ is fine
  s = s.trim().replace(/,/g, ''); // "1,350" → "1350"
  if (s === '') return { problem: 'empty' };
  // whole dollars, then optionally a point and some digits ("290", "290.5", "290.50", ".50")
  const m = /^(\d*)(?:\.(\d+))?$/.exec(s);
  if (!m || (m[1] === '' && m[2] === undefined)) return { problem: 'notNumber' };
  const decimals = m[2] ?? '';
  if (decimals.length > 2) return { problem: 'tooManyDecimals' };
  // Worked out in whole cents (no 0.1 + 0.2 floating-point surprises).
  const cents = Number(m[1] || '0') * 100 + Number(decimals.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents) || cents > AMOUNT_MAX_CENTS) return { problem: 'tooHigh' };
  if (cents < AMOUNT_MIN_CENTS) return { problem: 'tooLow' };
  return { cents };
}

// Cents → money as the screens show it: 29000 → "$290", 29050 → "$290.50", 270000 → "$2,700",
// -29000 → "−$290" (a real minus sign, U+2212, as the mockups draw it). Whole dollars show no
// ".00". Not a whole number → ''.
export function formatCents(cents) {
  if (!Number.isInteger(cents)) return '';
  const sign = cents < 0 ? '\u2212' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US'); // "2,700"
  const rest = abs % 100;
  return `${sign}$${dollars}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}

// Cents → the text an Amount box starts with: 29000 → "290", 29050 → "290.50" (no $, no commas,
// so parseAmount reads it back to the same cents). Not a whole number → ''.
export function amountInputText(cents) {
  if (!Number.isInteger(cents)) return '';
  const abs = Math.abs(cents);
  const rest = abs % 100;
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}
