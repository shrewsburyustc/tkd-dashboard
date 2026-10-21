// text.js — the screen words of Star testing's Grading tab and its pieces (build phase 5): the tab
// name, column headings, the Dan switch, the phone picker, the grade dropdown, the kept note's
// labels, the empty Dan line and the "Choose subjects" dialog.
// Why it exists: wording lives in one place, never inline in the screens (the house rule). The
// sentences shared with the save engine and the private grading page (the Result column, the
// banners, the leave question, the kept note) live in src/lib/star/gradingText.js and are
// re-exported here as G, so a screen imports one file.
// Sources: Grading mockups screens 1–6, 8–10 (v0.137) and the Phase 5 gap mockups H1, H2, H6, H7
// (rulebook v0.512, "Proposals to confirm (31)"). Lines marked "approved v0.513" are not in any
// drawing — Jeffrey approved them in the preview (rulebook v0.513).
export * as G from '../../../../lib/star/gradingText.js';

export const TAB_GRADING = 'Grading';

// ----- Column headings (screen 1) -----
export const COL_CANDIDATE = 'Candidate';
export const COL_CLASSES_ATTENDED = 'Classes attended';
export const COL_ASSISTANT_CLASSES = 'Assistant classes';
export const COL_TOTAL = 'Total';
export const totalOf = (maxScore) => `of ${maxScore}`; // gray under "Total": "of 315"
export const COL_RESULT = 'Result';
export const credits = (n) => `(${n})`; // gray after a tilted subject name
export const creditsLine = (n) => `${n} ${n === 1 ? 'credit' : 'credits'}`; // a phone / card line: "15 credits"
export const gridLabel = (danLabel) => `${danLabel} grading`; // the table's name for screen readers

// A candidate's line under the name: "Shrewsbury · 0 → 1" / "Worcester · 1 → 2 · make-up"
// The spaces around the arrow are NON-BREAKING ( ), so "0 → 1" never wraps onto two lines.
export const starsMove = (from, to) => `${from} → ${to}`;
// The same for a worded "1 star → 2 stars" (candidates text.testingFor) on the private page and sheet.
export const keepArrow = (text) => (text ? text.replace(/ → /g, ' → ') : text);
export const MAKEUP = 'make-up';

// ----- The Dan switch (proposals 5, 24) -----
export const DAN_SWITCH_LABEL = 'Dan';
export const danWord = (label) => label.replace(/\s*Dan$/i, ''); // "1st Dan" → "1st" (below 360px)
export const DAN_WORD = 'Dan';
// What a screen reader hears for one choice: "1st Dan, 7, has grades not saved"
export const danChoiceLabel = (label, count, warn) => `${label}, ${count}${warn ? ', has grades not saved' : ''}`;

// ----- Location (proposal 22; the Candidates tab's words, v0.508) -----
export const oneSchoolLine = (school) => `Showing ${school} candidates only`;
export const SHOW_BOTH_SCHOOLS = 'Show both schools';

// ----- Print (H3 / Builder C) -----
export const PRINT_SHEET = 'Print grading sheet';

// ----- The printed grading sheet (H3, proposals 13–17; approved Grading mockups' print screen) -----
// "Fall 2026 Star Testing · 1st Dan grading sheet" — page 2 on: "… (continued)"
export const sheetTitle = (eventName, danLabel) => `${eventName} · ${danLabel} grading sheet`;
export const SHEET_CONTINUED = '(continued)';
// "Sat, Nov 14, 2026 · 10:00 AM · Shrewsbury school · both schools" (dateText, timeText and placeText
// come already worded from the events words)
export const sheetWhenLine = (dateText, timeText, placeText) => [dateText, timeText, placeText, 'both schools'].filter(Boolean).join(' · ');
export const SHEET_JUDGE = 'Judge:';
// "A+ 4.5 · A 4.0 · B+ 3.5 · B 3.0 · C+ 2.5 · C 2.0 · D 0 · Assistant Instructor is worked out from assistant classes."
const pointsText = (value) => (Number(value) === 0 ? '0' : Number(value).toFixed(1));
export const sheetScaleLine = (grades) =>
  `${grades.map((g) => `${g.grade} ${pointsText(g.value)}`).join(' · ')} · Assistant Instructor is worked out from assistant classes.`;
export const SHEET_COL_CLASSES = ['Classes', 'attended']; // two lines in the column header
export const SHEET_COL_ASSISTANT = ['Assistant', 'classes'];
// Under a name: "Shrewsbury · 0→1" / "Worcester · 1→2 · make-up"
export const sheetRowLine = (school, from, to, isMakeup) => `${school} · ${from}→${to}${isMakeup ? ` · ${MAKEUP}` : ''}`;
export const SHEET_KEPT = 'kept'; // a make-up's kept cell, gray
export const SHEET_ADDED_ON_DAY = 'Added on the day:';
// Footer: "Fall 2026 Star Testing · 1st Dan · printed Fri, Nov 13, 4:12 PM" · "Page 1 of 2"
export const sheetFootLeft = (what, printedText) => `${what} · printed ${printedText}`;
export const sheetPage = (n, of) => `Page ${n} of ${of}`;
// The private testing's own sheet (Q2 = B, drawn in H4 option B): the H3 sheet with one row, no
// "Added on the day" rows, its title naming the private testing and its line its day, time and place.
// "Fall 2026 Star Testing · Private testing · Alex Kim"
export const privateSheetTitle = (eventName, name) => `${eventName} · Private testing · ${name}`;
// "Tue, Dec 1, 2026 · 4:00 PM · Shrewsbury school · 1st Dan · 1 star → 2 stars"
export const privateSheetWhenLine = (dateText, timeText, placeText, danLabel, testingForText) =>
  [dateText, timeText, placeText, danLabel, keepArrow(testingForText)].filter(Boolean).join(' · ');
// Footer: "Fall 2026 Star Testing · private testing · printed Tue, Dec 1, 3:40 PM" (sheetFootLeft adds
// the "printed …" part)
export const privateSheetFootWhat = (eventName) => `${eventName} · private testing`;

// ----- The private grading page (H5, proposals 18–21; Q1 = A, Q2 = B) -----
// Title: "Private testing · Alex Kim"
export const privatePageTitle = (name) => `Private testing · ${name}`;
// "Tue, Dec 1, 2026 · 4:00 PM · 1st Dan · 1 star → 2 stars · Shrewsbury"
export const privatePageLine = (dateText, timeText, danLabel, testingForText, school) =>
  [dateText, timeText, danLabel, keepArrow(testingForText), school].filter(Boolean).join(' · ');
export const backToEventLabel = (eventName) => `Back to ${eventName} candidates`; // the back link's name for screen readers
export const privateGradesLabel = (name) => `${name}’s grades`;
export const LOADING_PRIVATE = 'Loading the private testing…';
export const LOAD_PRIVATE_FAILED = 'Couldn’t load the private testing. Check the connection, then try again.'; // approved v0.513 (Color Belt's pattern; not in the mockups)
// Back on the Candidates tab when the open private page had to close (banner with ✕ only; the
// pattern of the H2 banners, "… on another device") — not in the mockups, approved v0.513:
export const privateMovedBack = (name) => `${name} was moved back to the testing day on another device. Grade them on the Grading tab.`; // approved v0.513 (not in the mockups)
export const privateWithdrawn = (name) => `${name} was withdrawn on another device, so their private grading page closed.`; // approved v0.513 (not in the mockups)
export const privateDeleted = (name) => `${name} was deleted on another device, so their private grading page closed.`; // approved v0.513 (not in the mockups)

// ----- Empty Dan (proposal 27, approved Grading screen 10) -----
export const emptyDanOneSchool = (school, danLabel) =>
  `No ${school} ${danLabel} candidates. Show both schools to see the rest, or add candidates on the Candidates tab.`;
export const emptyDanBoth = (danLabel) => `No ${danLabel} candidates. Add candidates on the Candidates tab.`; // approved v0.513 (Both; not in the mockups)

// ----- Loading the grid -----
export const LOADING_GRADES = 'Loading grades…';
export const LOAD_GRADES_FAILED = 'Couldn’t load the grades. Check the connection, then try again.'; // approved v0.513 (Color Belt's pattern; not in the mockups)

// ----- One grade cell -----
export const EMPTY_CELL = '·'; // drawn in light gray (aria-hidden)
export const NO_GRADE = 'no grade';
export const CHOOSE = 'Grade…'; // the empty dropdown on a phone line / card (drawn in H2 / H5)
// "Noah Chen, Breaking: D, not saved" — the cell's name for screen readers
export function cellLabel(name, subject, grade, { unsaved = false, retest = false, kept = null } = {}) {
  const parts = [`${name}, ${subject}: ${grade ?? NO_GRADE}`];
  if (kept) parts.push(`kept from ${kept}`);
  if (retest) parts.push('retest');
  if (unsaved) parts.push('not saved');
  return parts.join(', ');
}
export const gradeListLabel = (subject) => `Grade for ${subject}`;
export const countLabel = (name, what) => `${name}, ${what}`;
export const KEPT_NOTE_LABEL = 'Kept grade';

// ----- The phone: one candidate at a time (proposal 24) -----
export const PREVIOUS_CANDIDATE = 'Previous candidate';
export const NEXT_CANDIDATE = 'Next candidate';
export const pickerText = (row) => `${row.firstName} ${row.lastName} · ${starsMove(row.starsFrom, row.starsTo)}`;
export const pickerLabel = (row) => `Candidate: ${row.firstName} ${row.lastName}, ${row.starsFrom} to ${row.starsTo} stars. Choose another`;
export const pickerTitle = (danLabel, n) => `${danLabel} · ${n} ${n === 1 ? 'candidate' : 'candidates'}`;
export const PICKER_SUB = 'Pick who to grade';
export const CANCEL = 'Cancel';
export const TOTAL_LINE = 'Total';

// ----- Choose subjects (v0.130, Grading screen 6) -----
export const chooseTitle = (name) => `Make-up subjects for ${name}`;
// "212.5 of 315 · 245 needed · no D. Lowest grades are ticked to start."
export const chooseSub = (total, maxScore, passMark) => `${total} of ${maxScore} · ${passMark} needed · no D. Lowest grades are ticked to start.`;
export const chooseSubjectLine = (name, credits) => `${name} · ${credits} ${credits === 1 ? 'credit' : 'credits'}`;
// "Ethan retests the ticked subjects at the next star testing (no fee). The rest keep their grades."
export const chooseNote = (firstName) => `${firstName} retests the ticked subjects at the next star testing (no fee). The rest keep their grades.`;
export const CHOOSE_NONE = 'Tick at least one subject.'; // approved v0.513 (not in the mockups)
export const SAVE = 'Save';
export const SAVING = 'Saving…';
export const CLOSE = 'Close';
export const SUBJECTS_LABEL = 'Subjects to retest';
