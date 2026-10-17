// passphrase.js — makes the password that "Generate" fills in (Staff accounts, v0.73).
// Why it exists: 4 random easy words joined by dashes, e.g. "plum-ladder-quiet-river".
// The words come from wordlist.js. "Random" must really be random, so this uses the browser's
// crypto.getRandomValues (made for passwords and keys), never Math.random (predictable).
//
// "Rejection sampling", in one line: to pick one of N words fairly from a random 32-bit number,
// numbers in the small leftover range at the top are thrown away and drawn again — otherwise the
// first few words in the list would come up slightly more often than the rest.
import { WORDS } from './wordlist.js';

const WORD_COUNT = 4;
const MIN_LENGTH = 20; // v0.73: "20+ characters" — redraw the rare short combinations

// A fair random whole number from 0 up to (but not including) `max`.
function randomIndex(max) {
  const range = 2 ** 32;
  const limit = range - (range % max); // the biggest multiple of `max` that fits
  const box = new Uint32Array(1);
  for (;;) {
    window.crypto.getRandomValues(box);
    if (box[0] < limit) return box[0] % max;
  }
}

// e.g. "plum-ladder-quiet-river"
export function generatePassphrase() {
  for (;;) {
    const words = Array.from({ length: WORD_COUNT }, () => WORDS[randomIndex(WORDS.length)]);
    const phrase = words.join('-');
    if (phrase.length >= MIN_LENGTH) return phrase;
  }
}
