// reminderText.js — the words for the "OK" on the earlier-unclosed-days Home line (rulebook v0.811).
// Why it exists: text.js holds every other Finance word, but its end is being changed on another
// branch (the "Hide payments" block). Putting these few new lines in their own small file keeps
// the merge clean. They belong with the Home (D10) section of text.js and can move there later.
// Wording from the picture docs/Finance/images/Finance-Q17-reminder-ok.png (option B); anything the
// picture doesn't show is marked  // NOT IN MOCKUPS — for Jeffrey.
import { dayShort } from './format.js';

export const OK = 'OK';
// The OK button's screen-reader name. NOT IN MOCKUPS — for Jeffrey
export const OK_ARIA = 'OK, hide until a new day isn’t closed';
// Read out (screen readers only) after OK hides the line. NOT IN MOCKUPS — for Jeffrey
export const HIDDEN_ANNOUNCEMENT = 'Hidden until a new day isn’t closed.';

// Some unclosed days were already seen (OK pressed); only the new ones are counted.
// One school chosen: "1 new earlier day at Worcester wasn't closed: Mon, Oct 19 (21 seen before)."
export function newEarlierNotClosedAt(school, count, firstDay, seenBefore) {
  if (count === 1) return `1 new earlier day at ${school} wasn’t closed: ${dayShort(firstDay)} (${seenBefore} seen before).`;
  // NOT IN MOCKUPS — for Jeffrey (more than one new day)
  return `${count} new earlier days at ${school} weren’t closed, the first on ${dayShort(firstDay)} (${seenBefore} seen before).`;
}

// Both schools, new days at BOTH schools: the same without a school (new days at one school
// only use newEarlierNotClosedAt). NOT IN MOCKUPS — for Jeffrey
export function newEarlierNotClosed(count, firstDay, seenBefore) {
  if (count === 1) return `1 new earlier day wasn’t closed: ${dayShort(firstDay)} (${seenBefore} seen before).`;
  return `${count} new earlier days weren’t closed, the first on ${dayShort(firstDay)} (${seenBefore} seen before).`;
}
