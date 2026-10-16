// pinRules.js — the rules for a NEW PIN (Set PIN and Change PIN).
// Why it exists: the database refuses easy PINs (set_my_pin → 'too_easy'). Checking the same
// rule here first means staff get the message straight away, without a trip to the server.
// The database still checks again — the screen is never the only guard.
//
// The rule (guidelines 10b, v0.28): exactly 4 digits, and NOT
//   - all the same digit        (0000, 1111, … 9999)
//   - a straight run going up   (0123, 1234, … 6789)
//   - a straight run going down (9876, 8765, … 3210)

export const PIN_LENGTH = 4;

// The words staff see. Kept here so Set PIN and Change PIN say exactly the same thing.
export const PIN_TOO_EASY_MESSAGE = 'That PIN is too easy to guess. Choose another.';
export const PIN_MISMATCH_MESSAGE = "The PINs didn't match. Choose your PIN again.";
export const PIN_HINT = 'Not all the same (1111) and not a straight run (1234).';

// True for exactly 4 digits and nothing else ("12a4" or "123" → false).
export function isFourDigits(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

// True when the PIN is too easy to guess (see the rule above).
export function isPinTooEasy(pin) {
  if (!isFourDigits(pin)) return false; // only 4-digit PINs are judged here
  const digits = pin.split('').map(Number); // "1234" → [1, 2, 3, 4]

  // .every(...) = "true if the test passes for every digit". The first digit (index 0) has
  // nothing before it, so it always passes; each later digit is compared with the one before.
  const allSame = digits.every((digit) => digit === digits[0]);
  const runUp = digits.every((digit, index) => index === 0 || digit === digits[index - 1] + 1);
  const runDown = digits.every((digit, index) => index === 0 || digit === digits[index - 1] - 1);

  return allSame || runUp || runDown;
}
