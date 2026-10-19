// text.js — every word on the Testing chooser page and on the "← Testing" back link (v0.59, v0.177).
// Why it exists: like Color Belt's and Star's text.js, the words live in one place, so they can be
// checked against the rulebook and changed without hunting through the screens.
import { monthDay } from '../text.js';

// The chooser page's title (the same word as the rail icon).
export const CHOOSER_TITLE = 'Testing';
// The two rows (and the rail menu's names — navItems.js uses the same words).
export const COLOR_BELT_ROW = 'Color belt testing';
export const STAR_ROW = 'Star testing';
// "Next: Jan 9 · Shrewsbury" — Color Belt's next event (v0.177). date is 'YYYY-MM-DD'.
export const nextEventLine = (date, school) => `Next: ${monthDay(date)} · ${school}`;

// Color Belt's page while the Star testing switch is on (v0.177): its own title, and the back link.
export const COLOR_BELT_TITLE = 'Color belt testing';
export const BACK_TO_TESTING = 'Testing'; // drawn as "← Testing"
export const BACK_TO_TESTING_LABEL = 'Back to Testing'; // what a screen reader says for it
