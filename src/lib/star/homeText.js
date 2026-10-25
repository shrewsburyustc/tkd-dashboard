// homeText.js — every word on Home's Star "Today" cards (Star build phase 7).
// Why it exists: the words are approved in docs/Testing/Star Testing/TKD-StarTesting-Home-Mockups.html
// (v0.155) and TKD-StarTesting-Phase7-Gap-Mockups.html (v0.515, proposals 1, 4, 9, 12). Keeping them
// in one file means a wording change is a one-line change, and homeChecks.mjs can check them.
// Plain functions only (no React), so Node can load this file.
import { startTimeLabel } from './starEventRules.js';
import { whereText } from './eventsText.js';

// The small gray heading above the cards (proposal 2). Drawn in capitals by CSS, so a screen
// reader reads the word, not the letters.
export const TODAY_HEADING = 'Today';

export const OPEN_GRADING = 'Open grading'; // the event card's button (proposal 3)
export const GRADE = 'Grade'; // a private card's button (proposal 10)

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// The same Dan words as the Candidates tab (candidates/text.js danLabelOf).
const DAN_LABELS = { 1: '1st Dan', 2: '2nd Dan', 3: '3rd Dan' };
export const danLabel = (dan) => DAN_LABELS[dan] ?? `${dan}th Dan`;
const starsText = (n) => plural(n, 'star', 'stars');

const SCHOOL = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };

// "Fall 2026 Star Testing · 10:00 AM"
export const eventTitle = (item) => `${item.name} · ${startTimeLabel(item.time)}`;

// The count (proposal 4; one school, proposal 12). The number is the database's — Home never counts.
//   Both:        "22 candidates testing today" · "1 candidate testing today" · "No candidates testing today"
//   one school:  "12 Worcester candidates testing today" · "1 Worcester candidate testing today" ·
//                "No Worcester candidates testing today"
export function countText(count, schoolCode = null) {
  const who = schoolCode ? `${SCHOOL[schoolCode]} ` : '';
  if (count === 0) return `No ${who}candidates testing today`;
  if (count === 1) return `1 ${who}candidate testing today`;
  return `${count} ${who}candidates testing today`;
}

// "Shrewsbury school · 22 candidates testing today" — where the testing is, on every device (proposal 13)
export const eventLine = (item) => `${whereText(item.whereCode)} · ${countText(item.count, item.schoolCode)}`;

// "Private star testing · 4:00 PM"
export const privateTitle = (item) => `Private star testing · ${startTimeLabel(item.time)}`;

// "Alex Kim · 1st Dan · 1 star → 2 stars" — name, Dan and stars only: never a date of birth, email,
// fee or payment (rule 5).
export const privateLine = (item) =>
  `${item.firstName} ${item.lastName} · ${danLabel(item.dan)} · ${starsText(item.starsFrom)} → ${starsText(item.starsTo)}`;
