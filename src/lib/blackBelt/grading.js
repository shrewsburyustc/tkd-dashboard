// grading.js — the Black Belt RESULT worked out in JavaScript: the twin of the database's
// bb_grade_result and its helpers (migration 0025, contract 0025 §4), plus the small pure helpers
// the Grading and Results screens need (number formats, cut-off words, "left" words, the starting
// ticks of Choose subjects).
// Why it exists: the result is NEVER stored (rulebook v0.938) — the database works it out every
// time from the grades, the cycle's own rubric copy and the age. The preview database
// (mockGrading.js) must give exactly the same answer, and checks.mjs runs the shared test cases
// (supabase/tests/0025_grading_cases.json) through BOTH this file and the SQL, so they can't drift
// apart. If a rule changes, change it in the SQL AND here.
//
// It is PURE: no React, no database, no browser storage — Node can import it.
//
// The answer of gradeResult keeps the database's snake_case keys (it is compared 1:1 with the
// SQL's answer, key sets included); only the function names here are camelCase.
//
// Numbers: the database adds up in exact `numeric` and never rounds. JavaScript's numbers can be
// a hair off (0.1 + 0.2 = 0.30000000000000004), so every sum goes through rubric.js's round2,
// which only removes that noise (every points value has at most 2 decimals, so the true sum
// does too).
//
// Words used:
//   Dan object   one entry of a rubric copy's `dans` (rubric.js describes it)
//   pass bracket the pass-mark bracket { from, to } that holds the candidate's age
//   age group    the narrowest age range that fits inside every bracket of the Dan (§4.4)
//   applies      a subject counts for the candidate (its limited_to includes the pass bracket)
//   kept         a grade copied into a make-up from the earlier cycle (never edited there)
import { round2, partLetters, subjectLetters, subjectCountsFor, sameBracket, mostPoints, md5Hex, LONG_LETTERS, CUTOFF_LETTERS } from './rubric.js';
import { nameKey } from '../testing/names.js';

// ----- Fixed lists -----

export const RESULT_STATUSES = ['no_age', 'not_finished', 'passed', 'makeup', 'withdrawn'];
// The exact keys of every result (contract §4.2) — the allow-list the reads and the store use.
export const RESULT_KEYS = ['status', 'reasons', 'complete', 'total', 'maximum', 'pass_mark', 'pass_bracket', 'age_group', 'parts',
  'extra', 'subjects', 'd_subjects', 'needs', 'choice_needed', 'late', 'missing', 'counts', 'result_key'];
// The keys of one subject inside a result.
export const RESULT_SUBJECT_KEYS = ['id', 'part', 'letter', 'measured', 'way', 'points', 'applies', 'kept', 'kept_from_cycle_name',
  'retest', 'chosen', 'late', 'gradable'];
// Measured values: 0–999 with at most 4 decimals (§1.4).
export const MEASURED_MIN = 0;
export const MEASURED_MAX = 999;
export const COUNT_MAX = 9999; // an extra-points count: a whole number 0–9 999
export const MEASURED_RANGE_MESSAGE = 'Type a number from 0 to 999.'; // G 4 (the screens show it)

// ----- Small helpers -----

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// Does an age fall inside a bracket? (from null = the youngest, to null = "and over")
const holds = (b, age) => (b?.from === null || b?.from === undefined || b.from <= age) && (b?.to === null || b?.to === undefined || age <= b.to);
const bracketOf = (b) => ({ from: b?.from ?? null, to: b?.to ?? null });

// A number as the database writes it into the result key: trim_scale(numeric)::text — no
// trailing zeros (263, 263.0 and 263.00 → "263"; 300.90 → "300.9"); null → ''.
export function trimScaleText(n) {
  if (!isNum(n)) return '';
  return String(round2(n));
}

// The subjects of a Dan in rubric order, each with its part: [{ part: code, partObj, subject }].
export function danSubjects(dan) {
  const out = [];
  for (const p of list(dan?.parts)) for (const s of list(p?.subjects)) out.push({ part: p.code, partObj: p, subject: s });
  return out;
}

// id → { part, subject } for one Dan (names for the screens' words).
export function subjectIndex(dan) {
  return new Map(danSubjects(dan).map((x) => [x.subject.id, x]));
}
// The names of subject ids, in the order given (unknown ids are left out).
export function subjectNames(dan, ids) {
  const index = subjectIndex(dan);
  return list(ids).map((id) => index.get(id)?.subject?.name).filter((n) => typeof n === 'string');
}

// ----- §4.4 bb_age_groups -----
// Edges = every non-null `to` of the pass brackets, of every way's brackets of every measured
// subject, and of every subject's limited_to. Sorted, unique e1 < … < ek. Groups:
// [{ from: null, to: e1 }, { from: e1 + 1, to: e2 }, …, { from: ek + 1, to: null }].
export function ageGroups(dan) {
  const edges = new Set();
  const add = (b) => { if (isNum(b?.to)) edges.add(b.to); };
  for (const b of list(dan?.pass?.brackets)) add(b);
  for (const { subject: s } of danSubjects(dan)) {
    if (s?.scoring === 'measured') for (const w of list(s.ways)) for (const b of list(w?.brackets)) add(b);
    for (const b of list(s?.limited_to)) add(b);
  }
  const sorted = [...edges].sort((a, b) => a - b);
  const groups = [];
  let from = null;
  for (const e of sorted) {
    groups.push({ from, to: e });
    from = e + 1;
  }
  groups.push({ from, to: null });
  return groups;
}

// The age group holding an age (null for no age).
export function ageGroupOf(dan, age) {
  if (!Number.isInteger(age)) return null;
  return ageGroups(dan).find((g) => holds(g, age)) ?? null;
}

// The pass-mark bracket entry holding an age → { from, to, pass_mark } or null.
export function passBracketOf(dan, age) {
  if (!Number.isInteger(age)) return null;
  return list(dan?.pass?.brackets).find((b) => holds(b, age)) ?? null;
}

// ----- §4.5 bb_measured_letter -----
// The way's bracket holding the age; then the first of A+, A, B+, B, C whose cut-off is met —
// at_least: value ≥ cut-off; at_most: value ≤ cut-off; under: value < cut-off; none met → 'D'.
// A null age or value → null (also null when no bracket holds the age — a rubric can't have that).
export function measuredLetter(way, age, value) {
  if (!Number.isInteger(age) || !isNum(value) || !isObj(way)) return null;
  const bracket = list(way.brackets).find((b) => holds(b, age));
  if (!bracket) return null;
  for (const letter of CUTOFF_LETTERS) {
    const c = bracket.cutoffs?.[letter];
    if (!isNum(c)) continue;
    if (way.direction === 'at_least' && value >= c) return letter;
    if (way.direction === 'at_most' && value <= c) return letter;
    if (way.direction === 'under' && value < c) return letter;
  }
  return 'D';
}

// ----- §4.6 bb_extra_points -----
// For each item of the copy, in order: its count = the entry whose item_name equals the item's
// name exactly; per_count → count × points_each; steps → the points of the step with the LARGEST
// at_least that is ≤ count (chosen by at_least, never by list position), else 0; not entered → 0.
// Sum, then at most `limit` when it is set. counts: [{ item_name, count, kept }].
// → { counted, total, items: [{ name, count, points, kept }] }
export function extraPoints(extra, counts) {
  const entries = list(counts);
  const items = [];
  let sum = 0;
  for (const item of list(extra?.items)) {
    const entry = entries.find((c) => c?.item_name === item?.name) ?? null;
    const count = entry && Number.isInteger(entry.count) ? entry.count : null;
    let points = 0;
    if (count !== null) {
      const rule = item?.rule;
      if (rule?.kind === 'per_count' && isNum(rule.points_each)) points = round2(count * rule.points_each);
      else if (rule?.kind === 'steps') {
        let best = null;
        for (const step of list(rule.steps)) {
          if (isNum(step?.at_least) && step.at_least <= count && (best === null || step.at_least > best.at_least)) best = step;
        }
        points = best && isNum(best.points) ? best.points : 0;
      }
    }
    sum = round2(sum + points);
    items.push({ name: item?.name ?? null, count, points, kept: count !== null && entry.kept === true });
  }
  const limit = extra?.limit;
  const total = isNum(limit) ? Math.min(sum, limit) : sum;
  return { counted: extra?.counts_toward_total === true, total, items };
}

// ----- §4.1 bb_grade_result -----

// The four-field text inside md5(…) (§4.1 step 8): status|reasons|total|needs.
export function resultKeyInput(status, reasons, total, needs) {
  return `${status}|${list(reasons).join(',')}|${trimScaleText(total)}|${list(needs).join(',')}`;
}
// The result key: md5 of resultKeyInput, 32 lowercase hex characters.
export const resultKey = (status, reasons, total, needs) => md5Hex(resultKeyInput(status, reasons, total, needs));
// The same constant key for every withdrawn row (the total is left out on purpose).
export const WITHDRAWN_RESULT_KEY = md5Hex('withdrawn|||');

// The no-age answer: every key present with its empty value (§4.2).
function noAgeResult() {
  return {
    status: 'no_age', reasons: [], complete: false, total: null, maximum: null, pass_mark: null, pass_bracket: null, age_group: null,
    parts: [], extra: null, subjects: [], d_subjects: [], needs: [], choice_needed: false, late: [], missing: [], counts: null,
    result_key: md5Hex('no_age|||'),
  };
}

// The letter one grade row gives a subject (§4.1 step 3), or null when the row is ignored.
//   → { letter, measured, way, kept, keptFrom } or null
function letterOf(row, partCode, s, age) {
  if (!isObj(row)) return null;
  const letters = subjectLetters(partCode, s.scoring);
  if (row.kept === true) {
    // a kept row: its letter, only if it is one of the subject's letters
    return letters.includes(row.letter) ? { letter: row.letter, measured: null, way: null, kept: true, keptFrom: row.kept_from_cycle_name ?? null } : null;
  }
  if (s.scoring === 'graded') {
    if (row.measured !== null && row.measured !== undefined) return null;
    return partLetters(partCode).includes(row.letter) ? { letter: row.letter, measured: null, way: null, kept: false, keptFrom: null } : null;
  }
  if (s.scoring === 'measured') {
    const ways = list(s.ways);
    if (!Number.isInteger(row.way) || row.way < 0 || row.way >= ways.length || !isNum(row.measured)) return null;
    const letter = measuredLetter(ways[row.way], age, row.measured);
    return letter === null ? null : { letter, measured: row.measured, way: row.way, kept: false, keptFrom: null };
  }
  return null; // wrong scoring (a hand fix): ignored
}

// gradeResult(dan, age, grades, counts, retest, chosen, today, submissionsDue) → the result (§4.2)
//   dan      one Dan object of the cycle's copy
//   age      whole years on the cycle's first testing day, or null
//   grades   [{ subject_id, letter|null, measured|null, way|null, kept, kept_from_cycle_name|null }]
//   counts   [{ item_name, count, kept }]
//   retest, chosen   subject ids (make-up rows: retest; Choose subjects: chosen)
//   today, submissionsDue   'YYYY-MM-DD' (testing_today() and the cycle's Submissions due)
// Null lists count as empty. Never the age, a DOB, an email or money in the answer.
export function gradeResult(dan, age, grades, counts, retest, chosen, today, submissionsDue) {
  if (!isObj(dan)) throw new Error('gradeResult: no Dan object'); // the SQL raises too (it can't happen)
  // 0. No age → no_age, everything empty.
  if (!Number.isInteger(age)) return noAgeResult();
  const gradeRows = list(grades);
  const retestIds = list(retest);
  const chosenIds = list(chosen);
  // 1. The pass bracket and the age group.
  const pass = passBracketOf(dan, age);
  const passMark = isNum(pass?.pass_mark) ? pass.pass_mark : null;
  const passBracket = pass ? bracketOf(pass) : null;
  const group = ageGroupOf(dan, age);
  const isLateDay = typeof today === 'string' && typeof submissionsDue === 'string' && today > submissionsDue;

  const subjects = [];
  const parts = [];
  for (const p of list(dan.parts)) {
    let points = 0;
    let graded = 0;
    let applying = 0;
    for (const s of list(p?.subjects)) {
      // 2. Does the subject apply (limited_to null, or it names the pass bracket)?
      const applies = passBracket !== null && subjectCountsFor(s, passBracket);
      // 3. Its letter from its grade row (an invalid row is ignored).
      const row = gradeRows.find((g) => g?.subject_id === s.id) ?? null;
      const got = letterOf(row, p.code, s, age);
      const letter = got?.letter ?? null;
      const pts = applies && letter !== null && isNum(s.points?.[letter]) ? s.points[letter] : null;
      // 5. Late: handed in, no letter, after Submissions due (never stored, never a D).
      const late = applies && s.handed_in === true && letter === null && isLateDay;
      const kept = got?.kept === true;
      subjects.push({
        id: s.id,
        part: p.code,
        letter,
        measured: got && got.measured !== null ? got.measured : null,
        way: got && got.measured !== null ? got.way : null,
        points: pts,
        applies,
        kept,
        kept_from_cycle_name: kept ? got.keptFrom : null,
        retest: retestIds.includes(s.id),
        chosen: chosenIds.includes(s.id),
        late,
        gradable: applies && !kept,
      });
      if (applies) {
        applying += 1;
        if (letter !== null) {
          graded += 1;
          points = round2(points + (pts ?? 0));
        }
      }
    }
    // 4. Part points.
    parts.push({ code: p.code, points, graded, applying });
  }

  // 4. Extra points, the total, the maximum.
  const extra = extraPoints(dan.extra_points, counts);
  let total = 0;
  for (const p of parts) total = round2(total + p.points);
  if (extra.counted) total = round2(total + extra.total);
  const maximum = passBracket ? mostPoints(dan, passBracket) : null;

  // 6. The status.
  const applyingSubjects = subjects.filter((s) => s.applies);
  const dSubjects = applyingSubjects.filter((s) => s.letter === 'D').map((s) => s.id);
  const missing = applyingSubjects.filter((s) => s.letter === null).map((s) => s.id);
  const lateIds = applyingSubjects.filter((s) => s.late).map((s) => s.id);
  const complete = missing.length === 0;
  const below = passMark === null || total < passMark;
  let status;
  let reasons = [];
  if (dSubjects.length > 0 && dan.pass?.no_d === true) {
    status = 'makeup';
    reasons = complete && below ? ['d', 'below'] : ['d'];
  } else if (!complete) {
    status = 'not_finished';
  } else if (!below) {
    status = 'passed';
  } else {
    status = 'makeup';
    reasons = ['below'];
  }

  // 7. Needs: the D subjects; or, below the mark with no D, the chosen subjects that apply.
  let needs = [];
  let choiceNeeded = false;
  if (reasons.includes('d')) needs = dSubjects;
  else if (reasons.length === 1 && reasons[0] === 'below') {
    needs = applyingSubjects.filter((s) => chosenIds.includes(s.id)).map((s) => s.id);
    if (needs.length === 0) choiceNeeded = true;
  }

  const gradedCount = applyingSubjects.length - missing.length;
  return {
    status,
    reasons,
    complete,
    total,
    maximum,
    pass_mark: passMark,
    pass_bracket: passBracket,
    age_group: group ? bracketOf(group) : null,
    parts,
    extra,
    subjects,
    d_subjects: dSubjects,
    needs,
    choice_needed: choiceNeeded,
    late: lateIds,
    missing,
    counts: { applying: applyingSubjects.length, graded: gradedCount, left: missing.length },
    // 8. The key: reasons included, trailing zeros removed.
    result_key: resultKey(status, reasons, total, needs),
  };
}

// bb_candidate_result's override for a withdrawn row (§4.1): status 'withdrawn', reasons and
// needs emptied, no choice needed, the one constant key; everything else stays worked out.
export function withdrawnResult(result) {
  return { ...result, status: 'withdrawn', reasons: [], needs: [], choice_needed: false, result_key: WITHDRAWN_RESULT_KEY };
}

// ----- §4.7 bb_kept_match -----
// What a make-up copies from the earlier cycle (Add make-up) and what the picker shows before it.
//   earlierResult  gradeResult of the earlier row (its own copy and age)
//   earlierDan     the earlier copy's Dan object · earlierCounts  [{ item_name, count, kept }]
//   laterDan       the later copy's Dan object  · laterAge  the age on the LATER first day
// → { kept: [{ subject_id, part, letter }], retest: [ids], new: [ids], dropped: [earlier names],
//     kept_counts: [{ item_name, count }], dropped_extra: [earlier item names] }
// Matched by the same part and the same name (capitals and extra spaces ignored).
export function keptMatch(earlierResult, earlierDan, earlierCounts, laterDan, laterAge) {
  const pass = passBracketOf(laterDan, laterAge);
  const passBracket = pass ? bracketOf(pass) : null;
  const earlierById = new Map(list(earlierResult?.subjects).map((s) => [s.id, s]));
  const earlierNeeds = list(earlierResult?.needs);
  const earlier = danSubjects(earlierDan);
  const later = danSubjects(laterDan);
  const sameName = (a, b) => nameKey(a) === nameKey(b);
  const kept = [];
  const retest = [];
  const added = [];
  for (const { part, subject: L } of later) {
    const applies = passBracket !== null && subjectCountsFor(L, passBracket);
    if (!applies) continue; // subjects that don't apply get nothing ("—")
    const match = earlier.find((e) => e.part === part && sameName(e.subject?.name, L.name)) ?? null;
    if (!match) {
      retest.push(L.id);
      added.push(L.id);
      continue;
    }
    const answer = earlierById.get(match.subject.id);
    const letter = answer && answer.applies === true ? answer.letter : null;
    const ok = letter !== null && !earlierNeeds.includes(match.subject.id) && letter !== 'D'
      && subjectLetters(part, L.scoring).includes(letter);
    if (ok) kept.push({ subject_id: L.id, part, letter });
    else retest.push(L.id);
  }
  // earlier subjects with a letter or a need but no later subject of that part and name
  const dropped = earlier
    .filter((e) => {
      const answer = earlierById.get(e.subject.id);
      const has = (answer && answer.letter !== null) || earlierNeeds.includes(e.subject.id);
      return has && !later.some((l) => l.part === e.part && sameName(l.subject?.name, e.subject?.name));
    })
    .map((e) => e.subject.name);
  // extra counts: matched by name (capitals and extra spaces ignored), stored with the LATER name
  const keptCounts = [];
  const laterItems = list(laterDan?.extra_points?.items);
  for (const item of laterItems) {
    const entry = list(earlierCounts).find((c) => Number.isInteger(c?.count) && sameName(c.item_name, item?.name));
    if (entry) keptCounts.push({ item_name: item.name, count: entry.count });
  }
  const droppedExtra = list(earlierCounts)
    .filter((c) => Number.isInteger(c?.count) && !laterItems.some((item) => sameName(item?.name, c.item_name)))
    .map((c) => c.item_name);
  return { kept, retest, new: added, dropped, kept_counts: keptCounts, dropped_extra: droppedExtra };
}

// =====================================================================================
// Helpers for the screens (contract §13.1). No database twin; checked by checks.mjs.
// =====================================================================================

// ----- Measured numbers (G 4, OI-7) -----
// The kind of number a unit takes, by its first word: minute… → m:ss; second… → one decimal;
// inch… → whole or .5; count / rep… / kick… → whole; anything else → up to 2 decimals.
export function unitKind(unit) {
  const first = String(unit ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '';
  if (first.startsWith('minute') || first === 'min') return 'minutes';
  if (first.startsWith('second') || first === 'sec') return 'seconds';
  if (first.startsWith('inch') || first === 'in') return 'inches';
  if (first === 'count' || first.startsWith('rep') || first.startsWith('kick')) return 'whole';
  return 'other';
}

// The short unit under a column heading and next to a number: in, count, sec, min, kicks, reps
// (G 6); another unit as the admin typed it.
export function unitShort(unit) {
  const first = String(unit ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '';
  switch (unitKind(unit)) {
    case 'minutes': return 'min';
    case 'seconds': return 'sec';
    case 'inches': return 'in';
    case 'whole': return first.startsWith('rep') ? 'reps' : first.startsWith('kick') ? 'kicks' : 'count';
    default: return String(unit ?? '').trim();
  }
}

// m:ss → minutes with 4 decimals, counted in whole seconds (§1.4): 8:30 = 8.5, 8:40 = 8.6667,
// 8:13 = 8.2167. → a number or null.
export function minutesFromText(text) {
  const m = /^\s*(\d{1,3}):([0-5]\d)\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  const seconds = Number(m[1]) * 60 + Number(m[2]);
  return Math.round((seconds * 10000) / 60) / 10000;
}
// minutes → "m:ss" (8.6667 → "8:40")
export function minutesText(value) {
  if (!isNum(value)) return '';
  const seconds = Math.round(value * 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// What a person typed in a measured cell → { status: 'ok', value } (null = an empty box = Clear)
// or { status: 'invalid', reason: 'range' | 'format' } — the screens show MEASURED_RANGE_MESSAGE.
export function parseMeasured(unit, text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return { status: 'ok', value: null };
  const kind = unitKind(unit);
  let value;
  if (kind === 'minutes' && raw.includes(':')) {
    value = minutesFromText(raw);
    if (value === null) return { status: 'invalid', reason: 'format' };
  } else {
    if (!/^\d+(\.\d+)?$|^\.\d+$/.test(raw)) return { status: 'invalid', reason: 'format' };
    value = Number(raw);
    const decimals = (raw.split('.')[1] ?? '').length;
    if (kind === 'whole' && decimals > 0 && value !== Math.trunc(value)) return { status: 'invalid', reason: 'format' };
    if (kind === 'inches' && Math.round(value * 2) !== value * 2) return { status: 'invalid', reason: 'format' };
    if (kind === 'seconds' && Math.round(value * 10) / 10 !== value) return { status: 'invalid', reason: 'format' };
    if (kind === 'minutes' && Math.round(value * 10000) / 10000 !== value) return { status: 'invalid', reason: 'format' };
    if (kind === 'other' && round2(value) !== value) return { status: 'invalid', reason: 'format' };
  }
  if (value < MEASURED_MIN || value > MEASURED_MAX) return { status: 'invalid', reason: 'range' };
  return { status: 'ok', value };
}

// A stored measured value as the cell shows it (no unit): minutes "8:40"; seconds one decimal
// ("10.6", "35"); inches "70" / "70.5"; whole numbers "41"; others up to 2 decimals.
export function formatMeasured(unit, value) {
  if (!isNum(value)) return '';
  switch (unitKind(unit)) {
    case 'minutes': return minutesText(value);
    case 'seconds': return String(Math.round(value * 10) / 10);
    case 'inches': return String(Math.round(value * 2) / 2);
    case 'whole': return String(Math.round(value));
    default: return String(round2(value));
  }
}

// The number with its unit: "31 sec", "8:30" (m:ss needs no unit), "70 in", "23", "10 reps", "35 kicks".
export function measuredWithUnit(unit, value) {
  const text = formatMeasured(unit, value);
  if (text === '') return '';
  const kind = unitKind(unit);
  if (kind === 'minutes') return text;
  const short = unitShort(unit);
  return short && short !== 'count' ? `${text} ${short}` : text;
}

// Long jump's extra line: 70 → "70 in = 5 ft 10 in" (G 4). null for no number.
export function feetAndInches(value) {
  if (!isNum(value)) return null;
  const inches = Math.round(value * 2) / 2;
  const feet = Math.floor(inches / 12);
  return `${formatMeasured('inches', inches)} in = ${feet} ft ${formatMeasured('inches', inches - feet * 12)} in`;
}

// The cut-off of one letter in the rubric's words (G 3): "31 sec or more", "8:30 or less",
// "under 19 sec". ageGroup = the row's age group { from, to }: every group lies inside exactly one
// bracket of every list, so no age is needed. '' when there is no such cut-off.
export function cutoffWords(way, ageGroup, letter) {
  if (!isObj(way) || !isObj(ageGroup)) return '';
  const inside = (b) => (b?.from ?? null) === null ? true : ageGroup.from !== null && ageGroup.from >= b.from;
  const upTo = (b) => (b?.to ?? null) === null ? true : ageGroup.to !== null && ageGroup.to <= b.to;
  const bracket = list(way.brackets).find((b) => inside(b) && upTo(b));
  const value = bracket?.cutoffs?.[letter];
  if (!isNum(value)) return '';
  const text = measuredWithUnit(way.unit, value);
  if (way.direction === 'at_least') return `${text} or more`;
  if (way.direction === 'at_most') return `${text} or less`;
  if (way.direction === 'under') return `under ${text}`;
  return '';
}

// The cut-off a value reached: the letter's words (G 3), '' for a D or no number.
export function reachedWords(way, ageGroup, letter) {
  return letter && letter !== 'D' ? cutoffWords(way, ageGroup, letter) : '';
}

// ----- Choose subjects (G 21–G 23) -----

// The subjects offered, lowest grade first (equal grades in rubric order), and the starting
// ticks — Star v0.513 word for word: "every subject below B, or — when none is below B — every
// subject tied for the lowest grade". result = gradeResult's answer (applying subjects with a
// letter are offered). → { offered: [subject entries], ticked: [ids] }
export function startingTicks(result) {
  const rank = (letter) => LONG_LETTERS.indexOf(letter); // A+ = 0 … D = last: bigger = lower grade
  const order = new Map(list(result?.subjects).map((s, i) => [s.id, i]));
  const offered = list(result?.subjects)
    .filter((s) => s.applies && s.letter !== null)
    .sort((a, b) => rank(b.letter) - rank(a.letter) || order.get(a.id) - order.get(b.id));
  const belowB = offered.filter((s) => rank(s.letter) > rank('B'));
  const lowest = offered.length > 0 ? rank(offered[0].letter) : -1;
  const ticked = (belowB.length > 0 ? belowB : offered.filter((s) => rank(s.letter) === lowest)).map((s) => s.id);
  return { offered, ticked };
}

// The best case (G 22): every ticked subject at A+, the rest as graded.
// → { total, passMark, stillBelow } — "If the ticked subjects all get A+: 289 (275 needed)."
export function bestCase(result, dan, ticked) {
  const index = subjectIndex(dan);
  let total = isNum(result?.total) ? result.total : 0;
  for (const id of list(ticked)) {
    const s = list(result?.subjects).find((x) => x.id === id);
    const top = index.get(id)?.subject?.points?.['A+'];
    if (!s || !s.applies || !isNum(top)) continue;
    total = round2(total - (s.points ?? 0) + top);
  }
  const passMark = isNum(result?.pass_mark) ? result.pass_mark : null;
  return { total, passMark, stillBelow: passMark !== null && total < passMark };
}

// ----- "Left" and "Not finished" words (G 7 on the grid, R 10 on Results) -----

// 'YYYY-MM-DD' → "May 29" (a calendar date: never shifts with time zones).
export function shortDate(iso) {
  const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return '';
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
}

// "A", "A and B", "A, B and C"
export function joinNames(names) {
  const n = list(names);
  if (n.length <= 1) return n.join('');
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

// The late part: "TKD project late (due May 29)", "TKD project and Meditation late (due May 29)",
// three or more "3 hand-ins late (due May 29)". '' when nothing is late.
function lateWords(result, dan, submissionsDue) {
  const late = list(result?.late);
  if (late.length === 0) return '';
  const due = shortDate(submissionsDue);
  const what = late.length >= 3 ? `${late.length} hand-ins` : joinNames(subjectNames(dan, late));
  return `${what} late (due ${due})`;
}

// The Grading grid's Result for a Not finished row (G 7): late wins over "left";
// else "N of M left" (only subjects that apply count).
export function leftWords(result, dan, submissionsDue) {
  const late = lateWords(result, dan, submissionsDue);
  if (late) return late;
  const c = result?.counts;
  return c ? `${c.left} of ${c.applying} left` : '';
}

// The Results tab's reason for a Not finished row (R 10, Star's words): "Nothing graded yet";
// "Korean terminology not graded yet"; "Breaking and Meditation not graded yet"; "11 subjects not
// graded yet"; with a late hand-in "TKD project late (due May 29) · 2 more not graded".
export function notFinishedWords(result, dan, submissionsDue) {
  const c = result?.counts;
  if (!c) return '';
  if (c.graded === 0 && list(result.late).length === 0) return 'Nothing graded yet';
  const late = lateWords(result, dan, submissionsDue);
  const others = list(result.missing).filter((id) => !list(result.late).includes(id));
  if (late) return others.length > 0 ? `${late} · ${others.length} more not graded` : late;
  if (others.length > 2) return `${others.length} subjects not graded yet`;
  return others.length > 0 ? `${joinNames(subjectNames(dan, others))} not graded yet` : '';
}

// Is two brackets' { from, to } the same? (re-exported for the screens)
export { sameBracket };
