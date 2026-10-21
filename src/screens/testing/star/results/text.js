// text.js — the screen words of Star testing's Results tab and its printed results sheet (build
// phase 6): the tab name, the column headings, the ⋯ menu's title, the screen-reader names, and the
// words of the printout.
// Why it exists: wording lives in one place, never inline in the screens (the house rule). The
// sentences the data layer and the checks share (the summary line, the reason, the sent line, the
// banners, the toasts) live in src/lib/star/resultsText.js and are re-exported here as R, so a
// screen imports one file.
// Sources: the approved Results mockups (screens 1–7, v0.138–v0.146), Private mockups 7–8 (v0.150)
// and the Phase 6 gap mockups R1–R10 (rulebook v0.514, "Proposals (53)" — the numbers below are its
// item numbers). Lines marked "not in the mockups" are wording the build needed for a case the
// mockups don't draw; they follow the same pattern and are for Jeffrey to confirm in the preview.
import { ordinal } from '../../../../lib/star/resultEmail.js';

export * as R from '../../../../lib/star/resultsText.js';

export const TAB_RESULTS = 'Results';

// ----- Column headings (R1, proposal 6) -----
export const COL_CANDIDATE = 'Candidate';
export const COL_TESTING_FOR = 'Testing for';
export const totalOf = (maxScore) => `Total of ${maxScore}`; // PC and the sideways tablet
export const COL_TOTAL = 'Total'; // the upright tablet (four columns)
export const COL_RESULT = 'Result';
export const ACTIONS_COL = 'Actions';

// ----- The rows (R1) -----
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// "0 → 1 star" / "1 → 2 stars" / "1 → 2 stars · make-up" (the approved drawings' Testing for)
export const testingFor = (from, to, isMakeup) => `${from} → ${plural(to, 'star', 'stars')}${isMakeup ? ' · make-up' : ''}`;
export const moreFor = (name) => `More actions for ${name}`;
export const emailResultLabel = (name) => `Email result for ${name}`;
export const markSentLabel = (name) => `Mark as sent for ${name}`;
export const tableLabel = (danLabel) => `${danLabel} results`; // the list's name for screen readers
export const DAN_SWITCH_LABEL = 'Dan';
export const danWord = (label) => label.replace(/\s*Dan$/i, ''); // "1st Dan" → "1st" (below 360px, as Grading)
export const DAN_WORD = 'Dan';
export const danChoiceLabel = (label, count) => `${label}, ${count}`;
export const LOADING_RESULTS = 'Loading results…';
// The empty Dan on a one-school device (proposal 40): the link sits inside the sentence.
export const emptyOneSchoolParts = (school, danLabel) => [`No ${school} ${danLabel} candidates. `, 'Show both schools', ' to see the rest.'];
// The Undo toast's Undo after the 9-second cap went: the database decides (not_allowed wording).
export const UNDO_CONFIRM_GO = 'Undo Mark as sent';

// ----- The printed results sheet (R9, proposals 34–38; approved Results print screen v0.143) -----
export const sheetTitle = (eventName) => `${eventName} — Results`;
export const SHEET_CONTINUED = '(continued)';
// "Saturday, November 14, 2026 · Shrewsbury school · Pass mark: 245 of 315, and no D"
export const sheetSubLine = (longDay, place, passMark, maxScore) =>
  [longDay, place, passMark !== null ? `Pass mark: ${passMark} of ${maxScore}, and no D` : null].filter(Boolean).join(' · ');
// When the Dans have different pass marks (not in the mockups): each Dan's band names its own.
export const danBandWithMark = (danLabel, passMark, maxScore) => `${danLabel} · Pass mark: ${passMark} of ${maxScore}, and no D`;
export const SECTION = {
  passed: 'Passed — congratulations!',
  makeup: '⚠ MAKE-UP',
  not_finished: '⚠ NOT FINISHED YET',
  testing_privately: 'Testing privately',
};
export const PASS = 'PASS';
export const scoreOf = (maxScore) => `of ${maxScore}`;
export const SO_FAR = 'so far';
export const needs = (names) => `Needs: ${names.join(', ')}`;
export const NEEDS_ADMIN_CHOOSES = 'Needs: subjects an admin chooses'; // below 245, nothing chosen yet (not in the mockups)
// "Still to grade: Korean Terminology" (one or two) · "Still to grade: 11 subjects" (none graded) ·
// "Still to grade: 8 of 13 subjects"
export function stillToGrade(names, total) {
  if (names.length === 0) return '';
  if (names.length === total) return `Still to grade: ${plural(total, 'subject', 'subjects')}`;
  if (names.length <= 2) return `Still to grade: ${names.join(', ')}`;
  return `Still to grade: ${names.length} of ${total} subjects`;
}
export const AFTER_PRIVATE = 'Results after their private testing';
export const sheetFootLeft = (eventName, printedText) => `${sheetTitle(eventName)} · printed ${printedText}`;
export const sheetPage = (n, of) => `Page ${n} of ${of}`;
export const danLabelOf = (dan) => `${ordinal(dan)} Dan`;
