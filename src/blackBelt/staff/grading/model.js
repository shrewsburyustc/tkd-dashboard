// model.js — small PURE helpers the Grading tab's pieces share: the day switch's choices and
// which one opens first, the columns of a day, a row's gray lines, how a measured number is
// written, and the words of the Total and Result columns.
// Why it exists: the grid (GradeGrid.jsx), the phone card (GradeCard.jsx), the picker sheet and the
// printed sheet (GradingSheet.jsx) must show EXACTLY the same things, so the rules live here once.
// Nothing here works out a grade or a result: Total and Result come only from the database's
// `result` (rulebook v0.938); these helpers only choose the words for it (contract 0025 §14.2).
// No React, no database: plain functions of their arguments.
import { formatMeasured, leftWords, measuredLetter, subjectNames, unitShort } from '../../../lib/blackBelt/grading.js';
import { bracketLabel, partLetters, subjectLetters } from '../../../lib/blackBelt/rubric.js';
import { weekdayMonthDay } from '../text.js';
import * as T from './text.js';

const list = (v) => (Array.isArray(v) ? v : []);
const PART_ORDER = ['physical', 'technical', 'curriculum', 'other'];

// ----- The day switch (G 1, G 28) -----

// The rubric's name of a part ("Physical", "Other requirements"), with a plain fallback.
export function partName(rubric, code) {
  const p = list(rubric?.parts).find((x) => x?.code === code);
  if (p?.name) return p.name;
  return code === 'other' ? T.OTHER_REQUIREMENTS : code.charAt(0).toUpperCase() + code.slice(1);
}

// Every choice of the day switch, in order: each testing day (by date), then Other requirements,
// then Extra points.
//   → [{ key, kind: 'day'|'other'|'extra', day, parts: [codes], top, what, isToday }]
export function dayChoices(cycle, rubric, today) {
  const days = [...list(cycle?.days)].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out = days.map((day) => {
    const parts = PART_ORDER.filter((p) => list(day.parts).includes(p));
    const isToday = day.date === today;
    return {
      key: day.id,
      kind: 'day',
      day,
      parts,
      isToday,
      top: T.dayTop(isToday, weekdayMonthDay(day.date)),
      what: T.partsWords(parts.map((p) => partName(rubric, p))),
    };
  });
  out.push({ key: 'other', kind: 'other', day: null, parts: ['other'], isToday: false, top: T.ANY_DAY, what: partName(rubric, 'other') });
  out.push({ key: 'extra', kind: 'extra', day: null, parts: [], isToday: false, top: T.ANY_DAY, what: T.EXTRA_POINTS });
  return out;
}

// Which choice opens first (G 28): today's testing day; else the next one (with the gray "No
// testing today" line); after the last testing day, the last one; no testing days at all → Other
// requirements. `today` comes from the database (testing_today), never the device clock.
//   → { key, noTestingToday }
export function openingChoice(choices, today) {
  const days = choices.filter((c) => c.kind === 'day');
  if (days.length === 0) return { key: 'other', noTestingToday: false };
  const todays = days.find((c) => c.day.date === today);
  if (todays) return { key: todays.key, noTestingToday: false };
  const next = days.find((c) => c.day.date > today);
  if (next) return { key: next.key, noTestingToday: true };
  return { key: days[days.length - 1].key, noTestingToday: false };
}

// The columns of a choice. Graded days and Other requirements → the parts' subjects in rubric
// order: [{ id, part, partName, subject }]. Extra points → the items: [{ id: name, item }].
export function columnsFor(choice, rubric) {
  if (!choice) return [];
  if (choice.kind === 'extra') return list(rubric?.extra_points?.items).map((item) => ({ id: item.name, item }));
  const out = [];
  for (const code of choice.parts) {
    const p = list(rubric?.parts).find((x) => x?.code === code);
    for (const s of list(p?.subjects)) out.push({ id: s.id, part: code, partName: partName(rubric, code), subject: s });
  }
  return out;
}

// The grade letters of a subject's list (G 12): Physical and every measured subject A+ A B+ B C D,
// Technical, Curriculum and Other A+ A A- B+ B B- C C- D.
export const lettersFor = (col) => subjectLetters(col.part, col.subject?.scoring);
export { partLetters };

// ----- A row -----

export const rowName = (row) => `${row.firstName} ${row.lastName}`;
// "13–17", "18 and over" — the age group, never the date of birth (G 2)
export const groupWords = (result) => (result?.age_group ? bracketLabel(result.age_group) : '');
// One subject of the result (or null).
export const resultSubject = (result, id) => list(result?.subjects).find((s) => s.id === id) ?? null;
// One extra item of the result (or null).
export const resultItem = (result, name) => list(result?.extra?.items).find((i) => i.name === name) ?? null;
// The names of a make-up's retest subjects, in rubric order.
export const retestNames = (result, rubric) => subjectNames(rubric, list(result?.subjects).filter((s) => s.retest).map((s) => s.id));

// An age inside an age group (every group lies inside exactly one bracket of every list, contract
// §4.4), so a way's cut-offs can be looked up without the candidate's age.
export function ageInGroup(group) {
  if (!group) return null;
  if (Number.isInteger(group.from)) return group.from;
  if (Number.isInteger(group.to)) return group.to;
  return 0;
}

// ----- Measured numbers (G 3–G 5) -----

// A way of a measured subject (0 = the first, the starting way).
export const wayOf = (subject, way) => list(subject?.ways)[Number.isInteger(way) ? way : 0] ?? list(subject?.ways)[0] ?? null;
// The short unit of a way: in, count, sec, min, kicks, reps (G 6).
export const unitOf = (way) => unitShort(way?.unit);
// What a measured cell shows as its number: "35", "8:40", "10.6" ('' when empty).
export const measuredNumber = (subject, way, value) => formatMeasured(wayOf(subject, way)?.unit, value);
// With its unit for lists: "11:30 min", "11.4 sec", "32 count", "6 reps".
export function measuredWithShortUnit(subject, way, value) {
  const text = measuredNumber(subject, way, value);
  const unit = unitOf(wayOf(subject, way));
  return text && unit ? `${text} ${unit}` : text;
}
// The gray line under a column's name: the unit(s) and "outdoor"; "handed in" for hand-in work.
export function headingUnder(col) {
  if (col.item) return T.COUNT_UNIT;
  const s = col.subject;
  const bits = [];
  if (s?.scoring === 'measured') bits.push(T.unitsOfWays([...new Set(list(s.ways).map((w) => unitShort(w?.unit)))]));
  if (s?.handed_in === true) bits.push(T.HANDED_IN);
  if (s?.outdoor === true) bits.push(T.OUTDOOR);
  return bits;
}
// The bracket of a way that holds an age group: "13 and over", "all ages".
export function wayBracketWords(way, group) {
  const age = ageInGroup(group);
  if (age === null) return '';
  const b = list(way?.brackets).find((x) => (x.from === null || x.from <= age) && (x.to === null || age <= x.to));
  if (!b) return '';
  return b.from === null && b.to === null ? 'all ages' : bracketLabel(b);
}
// The letter a typed number would get (the editor's live line only; the saved cell shows the
// database's letter).
export const previewLetter = (subject, way, group, value) => measuredLetter(wayOf(subject, way), ageInGroup(group), value);

// The measured value as the save engine keeps it: "<value>|<way>" (null = Clear), so two values can
// be compared with === (a number and its way together).
export const measuredKey = (value, way) => (value === null || value === undefined ? null : `${value}|${Number.isInteger(way) ? way : 0}`);
export function parseMeasuredKey(key) {
  if (key === null || key === undefined) return { value: null, way: 0 };
  const [v, w] = String(key).split('|');
  return { value: Number(v), way: Number(w) || 0 };
}

// ----- Total and Result (G 7, G 15, G 30, G 31) -----

// Has anything at all been entered for this candidate (a grade, a number or a count)?
const anythingEntered = (result) => (result?.counts?.graded ?? 0) > 0 || list(result?.extra?.items).some((i) => i.count !== null);

// The Total column → { text } ("—") or { number, soFar }.
export function totalView(result) {
  if (!result || result.status === 'no_age' || !anythingEntered(result)) return { text: T.TOTAL_NONE };
  return { number: T.pointsText(result.total), soFar: !result.complete };
}

// "N of M left" for a make-up: only its gradable (retest) subjects count (G 14: "1 of 1 left").
function makeupLeft(result) {
  const gradable = list(result?.subjects).filter((s) => s.gradable);
  return { left: gradable.filter((s) => s.letter === null).length, of: gradable.length };
}

// The Result column → { tone: 'green'|'amber'|'gray', text, link: 'choose_subjects'|null, after }
//   save = { grades, counts, retrying } — this row's Not saved cells (the save engine's rowSave)
export function resultView(result, { isMakeup = false, isAdmin = false, save = null, rubric = null, submissionsDue = null } = {}) {
  const unsaved = save ? save.grades + save.counts : 0;
  if (unsaved > 0) {
    return save.retrying ? { tone: 'gray', text: T.RESULT_SAVING, link: null, after: null }
      : { tone: 'amber', text: T.S.notSavedTag(save.grades, save.counts), link: null, after: null };
  }
  if (!result) return { tone: 'gray', text: '', link: null, after: null };
  switch (result.status) {
    case 'passed':
      return { tone: 'green', text: T.RESULT_PASSED, link: null, after: null };
    case 'makeup':
      if (result.reasons.includes('d')) return { tone: 'amber', text: T.makeupD(subjectNames(rubric, result.d_subjects)), link: null, after: null };
      if (result.choice_needed) {
        return isAdmin ? { tone: 'amber', text: T.makeupBelow(result.pass_mark), link: 'choose_subjects', after: null }
          : { tone: 'amber', text: T.makeupBelow(result.pass_mark), link: null, after: T.ADMIN_CHOOSES };
      }
      return { tone: 'amber', text: T.makeupRetests(subjectNames(rubric, result.needs)), link: null, after: null };
    case 'no_age':
      return { tone: 'gray', text: T.NO_AGE, link: null, after: null };
    default: {
      // not_finished: late hand-in work wins over "left" (G 7)
      if (list(result.late).length > 0) return { tone: 'gray', text: leftWords(result, rubric, submissionsDue), link: null, after: null };
      if (isMakeup) {
        const { left, of } = makeupLeft(result);
        return { tone: 'gray', text: T.leftOf(left, of), link: null, after: null };
      }
      if (!anythingEntered(result)) return { tone: 'gray', text: T.RESULT_NOT_STARTED, link: null, after: null };
      return { tone: 'gray', text: leftWords(result, rubric, submissionsDue), link: null, after: null };
    }
  }
}
