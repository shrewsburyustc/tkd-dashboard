// money.js — Black Belt prices: reading what an admin types into a price box, and the price rule.
// Why it exists: Black Belt prices go up to $5,000 (4th Dan in full is $2,700), but Color Belt's
// parseDollars in src/lib/money.js stops at $1,000. The database has its own rule for Black Belt,
// bb_price_is_valid (migration 0016, section 1a): WHOLE dollars from $1 to $5,000, stored as
// cents (29000 = $290). This file is the same rule for the screens and the preview database, so
// Save turns gray before the database would say "invalid".
// For SHOWING a price use formatDollars from src/lib/money.js (87000 → "$870").
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
