// rubric.js — the Black Belt RUBRIC (what each Dan is tested on), written once for the editor,
// the read view, the family form, the preview database (mockBlackBelt.js) and checks.mjs.
// Why it exists: migration 0024 stores each rubric as ONE JSON document ("schema_version 2",
// contract 0024 §2.2) and checks every value of a Dan before it is stored (the validator, §3).
// The screens must know the SAME rules, so Save can be grayed and each problem shown while the
// admin types, instead of waiting for the database to answer "invalid". Every rule here has a
// twin in the SQL (bb_rubric_dan_problems and friends); checks.mjs runs the shared test cases
// (supabase/tests/0024_rubric_cases.json) through BOTH, so they can't drift apart. If a rule
// changes, change it in the SQL AND here.
//
// It is PURE: no React, no database, no browser storage — Node can import it, and the public
// family form can use it without pulling in any dashboard code.
//
// It returns CODES (e.g. 'credits', 'brackets_gap'), never sentences — the screens' text.js
// files turn codes into words. The one exception is danDiff(), whose job is to describe changes
// ("Long jump credits 2 → 3") for the editor's "changes weren't saved" box (contract §10.1).
//
// Words used (contract 0024, "Words used"):
//   Rubric    { schema_version: 2, source, dans: [Dan × 4] }
//   Dan       { dan, rev, saved_at, saved_by_name, pass, parts: [Part × 4], extra_points }
//   bracket   an age range { from, to }: from null = the youngest, to null = "and over"
//   way       one of at most two ways to do a measured subject (e.g. Pull-up or Hold)
//   worked-out points   credits × that Dan's grade point for the subject's part
//   own points          points typed per grade (points_mode 'own')
// The document keeps the database's snake_case keys inside the app (it is a document; renaming
// keys could lose some), only the functions here are camelCase.
//
// Numbers: JSON numbers only. "Up to 2 decimals" is checked with Math.round(x * 100) / 100 === x
// (so 2.555 is refused, 10.05 is fine), and every worked-out value is rounded the same way, so
// 3.3 × 3 gives 9.9 (not 9.899999…), exactly like the database's exact `numeric` maths.
import { normalizeName, nameProblem, nameKey } from '../testing/names.js';
import { normalizeNote } from '../testing/eventRules.js';

// ----- Fixed lists (contract §2.2, §2.3) -----

export const RUBRIC_SCHEMA_VERSION = 2;
export const RUBRIC_DANS = [1, 2, 3, 4];
export const RUBRIC_PART_CODES = ['physical', 'technical', 'curriculum', 'other']; // always in this order
// Physical grade points, and the points of any MEASURED subject (in any part)
export const SHORT_LETTERS = ['A+', 'A', 'B+', 'B', 'C', 'D'];
// Technical, Curriculum and Other grade points, and a GRADED subject's points there
export const LONG_LETTERS = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'C-', 'D'];
// Every way's cut-offs (below C is a D)
export const CUTOFF_LETTERS = ['A+', 'A', 'B+', 'B', 'C'];
export const SCORINGS = ['graded', 'measured'];
export const POINTS_MODES = ['worked', 'own'];
export const DIRECTIONS = ['at_least', 'at_most', 'under'];
export const EXTRA_RULE_KINDS = ['per_count', 'steps'];

// ----- Limits (contract §2.2, §3.1, OI-6) -----

export const MAX_SUBJECTS = 30; // per part
export const MAX_BRACKETS = 6; // per bracket list (a way's, the pass list, limited_to)
export const MAX_WAYS = 2;
export const CREDITS_MIN = 1;
export const CREDITS_MAX = 20;
export const AGE_MAX = 99;
export const POINTS_MAX = 999; // grade points, points, cut-offs, extra points (2 decimals)
export const PASS_MARK_MAX = 9999;
export const EXTRA_LIMIT_MAX = 999;
export const MAX_EXTRA_ITEMS = 12;
export const MAX_STEPS = 10;
export const STEP_AT_LEAST_MAX = 9999;
export const UNIT_MAX = 40; // characters
export const NOTE_MAX = 200; // a subject's note, the extra points' note
export const MAKEUP_MAX = 300;
export const SOURCE_MAX = 100;
export const STAMP_NAME_MAX = 60; // saved_by_name
export const REV_MAX = 1000000;
export const MAX_PROBLEMS = 100; // the validator lists at most this many
// Sizes, measured as the UTF-8 bytes of JSON.stringify (the database measures jsonb::text,
// which spaces things differently — so only cases far over the cap must agree, §3.4).
export const DAN_MAX_BYTES = 50000;
export const RUBRIC_MAX_BYTES = 240000;
// How long the toast's Undo may wait on the server (OI-2; the toast itself shows 5 seconds).
export const RUBRIC_UNDO_WINDOW_MS = 15 * 1000;

// The source text a cycle's copy gets when Add cycle copies the default (bb_rubric_fresh_copy).
export const FRESH_COPY_SOURCE = 'Default rubric';

const SUBJECT_ID_PATTERN = /^[a-z0-9]{8}$/;
const STAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/; // 'YYYY-MM-DDTHH:MM:SSZ'
// Invisible characters a note may not contain — the same list as testing_note_is_valid (0005).
const NOTE_BAD_CHARACTER = /[\u0001-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;
// The few extra invisible characters 0024 refuses in every rubric name and text (§2.2):
// Arabic letter mark, soft hyphen, Mongolian vowel separator, line / paragraph separator and
// the "tag" characters U+E0000–U+E007F.
const RUBRIC_EXTRA_BAD = /[\u061c\u00ad\u180e\u2028\u2029]|[\u{E0000}-\u{E007F}]/u;
// A rubric text is one line: no line break or tab.
const LINE_BREAK_OR_TAB = /[\n\r\t]/;

// ----- Small helpers -----

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const charCount = (text) => [...text].length;
// Exactly these keys, no more, no fewer.
const exactKeys = (obj, keys) => isObj(obj) && Object.keys(obj).length === keys.length && keys.every((k) => Object.hasOwn(obj, k));
// The UTF-8 size of a value written as JSON (TextEncoder works in browsers and in Node).
const jsonBytes = (value) => new TextEncoder().encode(JSON.stringify(value) ?? '').length;

// Rounds to 2 decimals the way the screens and the checks compare money-like numbers.
export function round2(x) {
  return Math.round(x * 100) / 100;
}

// A JSON number from lo to hi with at most 2 decimals (bb_rubric_num_ok).
export function numOk(v, lo, hi) {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi && round2(v) === v;
}

// A whole JSON number from lo to hi (bb_rubric_int_ok). 1e30 is a whole number but out of range.
export function intOk(v, lo, hi) {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
}

const ageOk = (v) => v === null || intOk(v, 0, AGE_MAX);

// The name rule (§2.2): testing_name_is_valid + already normalized + none of 0024's extra
// invisible characters. 1–60 characters.
export function rubricNameOk(v) {
  return typeof v === 'string' && v === normalizeName(v) && nameProblem(v) === null && !RUBRIC_EXTRA_BAD.test(v);
}

// The text rule (§2.2): testing_note_is_valid + already tidied + one line + 0024's extra
// characters + its own length (1–max characters).
export function rubricTextOk(v, max) {
  return typeof v === 'string' && v === normalizeNote(v) && !NOTE_BAD_CHARACTER.test(v) && !LINE_BREAK_OR_TAB.test(v)
    && !RUBRIC_EXTRA_BAD.test(v) && charCount(v) >= 1 && charCount(v) <= max;
}

// A name tidied the way the database expects it (spaces collapsed, ends trimmed).
export function tidyRubricName(text) {
  return normalizeName(text);
}

// A one-line text tidied: line breaks and tabs become one space, ends trimmed; empty → null.
export function tidyRubricText(text) {
  if (text === null || text === undefined) return null;
  return normalizeNote(String(text).replace(/[\r\n\t]+/g, ' '));
}

// ----- Letters (§2.3) -----

// The grade-point letters of a part.
export function partLetters(partCode) {
  return partCode === 'physical' ? SHORT_LETTERS : LONG_LETTERS;
}

// The letters of a subject's points: measured → the six short letters; graded → its part's.
export function subjectLetters(partCode, scoring) {
  return scoring === 'measured' ? SHORT_LETTERS : partLetters(partCode);
}

// The worked-out points of a subject: credits × the part's grade point, per letter, rounded to
// 2 decimals. part / subject are the stored objects. Letters that can't be worked out (a grade
// point or the credits not a number) are left out.
export function workedPoints(part, subject) {
  const out = {};
  for (const letter of subjectLetters(part?.code, subject?.scoring)) {
    const gp = part?.grade_points?.[letter];
    if (typeof gp === 'number' && Number.isFinite(gp) && typeof subject?.credits === 'number' && Number.isFinite(subject.credits)) {
      out[letter] = round2(subject.credits * gp);
    }
  }
  return out;
}

// ----- Brackets -----

// Do two brackets name the same ages? (null = null counts as the same)
export function sameBracket(a, b) {
  return isObj(a) && isObj(b) && (a.from ?? null) === (b.from ?? null) && (a.to ?? null) === (b.to ?? null);
}

// What a bracket is called: "All ages", "8 and under", "13 and over", "9–12" (or "9" for one age).
export function bracketLabel(bracket) {
  const from = bracket?.from ?? null;
  const to = bracket?.to ?? null;
  if (from === null && to === null) return 'All ages';
  if (from === null) return `${to} and under`;
  if (to === null) return `${from} and over`;
  if (from === to) return `${from}`;
  return `${from}–${to}`;
}

// Does a subject count for the bracket { from, to }? (limited_to null — or anything that isn't a
// list, as the SQL reads it — = every bracket)
export function subjectCountsFor(subject, bracket) {
  const list = subject?.limited_to;
  if (!Array.isArray(list)) return true;
  return list.some((b) => sameBracket(b, bracket));
}

// ----- Maxima (bb_rubric_part_max / bb_rubric_most_points, §3.2) -----

// The most points one part gives for a pass bracket: Σ points "A+" of the subjects the bracket
// does. A subject whose A+ isn't a number adds nothing (the validator reports it).
export function partMax(part, bracket) {
  let sum = 0;
  for (const s of Array.isArray(part?.subjects) ? part.subjects : []) {
    const top = s?.points?.['A+'];
    if (isObj(s) && typeof top === 'number' && Number.isFinite(top) && subjectCountsFor(s, bracket)) sum += top;
  }
  return round2(sum);
}

// The most points of a whole Dan for a pass bracket (the four parts; extra points never count).
export function mostPoints(dan, bracket) {
  let sum = 0;
  for (const p of Array.isArray(dan?.parts) ? dan.parts : []) sum += partMax(p, bracket);
  return round2(sum);
}

// A part's maximum for each of the Dan's pass brackets, grouped by value (in bracket order), for
// lines like "Curriculum: up to 135 points (157.5 for 18 and over)".
// part: the part object or its code. → [{ max, brackets: [{ from, to }, …] }, …]
export function partMaxByBracket(dan, part) {
  const p = typeof part === 'string' ? (dan?.parts ?? []).find((x) => x?.code === part) : part;
  const groups = [];
  for (const b of Array.isArray(dan?.pass?.brackets) ? dan.pass.brackets : []) {
    const max = partMax(p, b);
    const group = groups.find((g) => g.max === max);
    const bracket = { from: b?.from ?? null, to: b?.to ?? null };
    if (group) group.brackets.push(bracket);
    else groups.push({ max, brackets: [bracket] });
  }
  return groups;
}

// The subjects handed in (worked out from handed_in), in part order:
// → [{ part: code, subject }, …]
export function handedIn(dan) {
  const out = [];
  for (const p of Array.isArray(dan?.parts) ? dan.parts : []) {
    for (const s of Array.isArray(p?.subjects) ? p.subjects : []) if (s?.handed_in === true) out.push({ part: p.code, subject: s });
  }
  return out;
}

// =====================================================================================
// The validator — the JS twin of bb_rubric_dan_problems (contract §3)
// =====================================================================================
// danProblems(dan, danNo) → [] when the Dan is fine, else up to 100 problems in walk order
// (stamps → pass → parts → subjects → ways → brackets → extra points). A problem is
//   { code, part?, subject?, way?, bracket?, item?, step?, path? }   (only the keys that apply)
// Robust order (§3): the size first; at each level the type and the EXACT key set before
// anything inside is read (wrong → 'shape' and that branch is not walked); every list's length
// before looping; never throws, whatever it is given.

// A field with its own problem code gets that code for any bad value (a wrong type too); fields
// without one (yes/no fields, the stamps, the graded / measured and worked / own choices, the
// shape of a list's items) give 'shape' — exactly as the SQL does.

// The age-bracket rules shared by a pass-mark list and each way's cut-off list
// (bb_rubric_brackets_problems, V14). The caller has already checked that the list is 1–6
// objects with exactly the right keys; this reads only from / to. where = the keys to put on
// every problem; each problem also gets bracket = its index.
function bracketRules(list, where, push) {
  const from = [];
  const to = [];
  let bad = false;
  list.forEach((b, i) => {
    if (!ageOk(b.from) || !ageOk(b.to) || (b.from !== null && b.to !== null && b.from > b.to)) {
      push('bracket_ages', { ...where, bracket: i });
      bad = true;
    } else {
      from.push(b.from);
      to.push(b.to);
    }
  });
  if (bad) return false;
  const n = list.length;
  let ok = true;
  const add = (code, i) => {
    push(code, { ...where, bracket: i });
    ok = false;
  };
  // the ends: the first starts at the youngest, the last is open
  if (from[0] !== null) add('brackets_ends', 0);
  if (to[n - 1] !== null) add('brackets_ends', n - 1);
  // each bracket against the one before it (ONE problem per pair, the first that applies)
  for (let i = 1; i < n; i += 1) {
    if (to[i - 1] === null) add('brackets_overlap', i); // the one before is "and over"
    else if (from[i] === null) add('brackets_order', i); // starts at the youngest again
    else if (from[i] <= (from[i - 1] ?? -1)) add('brackets_order', i); // not youngest first
    else if (from[i] <= to[i - 1]) add('brackets_overlap', i); // starts inside the one before
    else if (from[i] > to[i - 1] + 1) add('brackets_gap', i); // more than 1 year later
  }
  return ok;
}

// A bracket list's outer checks: a list (else shape), 1–6 brackets (brackets_count), each an
// object with exactly from / to / thirdKey (else ONE shape for the list). → true when the
// bracket rules (and the per-bracket checks) can run.
function bracketListOk(list, thirdKey, where, path, push) {
  if (!Array.isArray(list)) {
    push('shape', where, path);
    return false;
  }
  if (list.length < 1 || list.length > MAX_BRACKETS) {
    push('brackets_count', where);
    return false;
  }
  if (!list.every((b) => exactKeys(b, ['from', 'to', thirdKey]))) {
    push('shape', where, path);
    return false;
  }
  return true;
}

// A letter → number object (grade points, a subject's points): not an object → shape; not
// exactly the letters, or a value that isn't 0–999 with 2 decimals → rangeCode; A+ not above 0,
// or a value going up → orderCode. → true when every value is a usable number (even when the
// order is wrong — the worked-out check still runs, like the SQL).
function letterMapProblems(map, letters, rangeCode, orderCode, where, path, push) {
  if (!isObj(map)) {
    push('shape', where, path);
    return false;
  }
  if (!exactKeys(map, letters) || !letters.every((l) => numOk(map[l], 0, POINTS_MAX))) {
    push(rangeCode, where);
    return false;
  }
  if (!(map['A+'] > 0) || letters.slice(1).some((l, k) => map[l] > map[letters[k]])) push(orderCode, where);
  return true;
}

// One way of a measured subject (V12–V15).
function wayProblems(way, wi, wayCount, names, where, path, push) {
  const w = { ...where, way: wi };
  if (!exactKeys(way, ['name', 'unit', 'direction', 'brackets'])) {
    push('shape', w, path);
    return;
  }
  // two ways: both named and different; one way: no name or a name
  if (way.name === null && wayCount === 1) {
    // fine
  } else if (!rubricNameOk(way.name)) push('way_name', w);
  else if (names.has(nameKey(way.name))) push('way_name', w);
  else names.add(nameKey(way.name));
  if (!rubricTextOk(way.unit, UNIT_MAX)) push('unit', w);
  const direction = DIRECTIONS.includes(way.direction) ? way.direction : null;
  if (direction === null) push('direction', w);
  if (!bracketListOk(way.brackets, 'cutoffs', w, `${path}.brackets`, push)) return;
  bracketRules(way.brackets, w, push);
  way.brackets.forEach((b, bi) => {
    const at = { ...w, bracket: bi };
    const c = b.cutoffs;
    if (!isObj(c)) push('shape', at, `${path}.brackets[${bi}].cutoffs`);
    else if (!exactKeys(c, CUTOFF_LETTERS) || !CUTOFF_LETTERS.every((l) => numOk(c[l], 0, POINTS_MAX))) push('cutoffs_range', at);
    else if (direction !== null && CUTOFF_LETTERS.slice(1).some((l, k) => {
      // at least: each next cut-off strictly smaller; at most / under: strictly larger
      const above = c[CUTOFF_LETTERS[k]];
      return direction === 'at_least' ? c[l] >= above : c[l] <= above;
    })) push('cutoffs_order', at);
  });
}

// One subject (V6–V11, V16, V17). ctx = { part, partIndex, gradePointsOk, passOk, passKeys,
// ids (Set, the whole Dan), names (Set, this part), push }
function subjectProblems(s, si, ctx) {
  const { part, push } = ctx;
  const code = part.code;
  const path = `parts[${ctx.partIndex}].subjects[${si}]`;
  if (!exactKeys(s, ['id', 'name', 'credits', 'scoring', 'ways', 'points_mode', 'points', 'limited_to', 'outdoor', 'handed_in', 'note'])) {
    push('shape', { part: code }, path);
    return;
  }
  // V6 the id: 8 characters a–z 0–9, used once in the Dan
  let sid = null;
  if (typeof s.id === 'string' && SUBJECT_ID_PATTERN.test(s.id) && !ctx.ids.has(s.id)) {
    sid = s.id;
    ctx.ids.add(sid);
  } else {
    push('subject_id', { part: code }, path);
  }
  const where = sid ? { part: code, subject: sid } : { part: code };
  // V7 the name; not used twice in its part
  if (!rubricNameOk(s.name)) push('subject_name', where);
  else if (ctx.names.has(nameKey(s.name))) push('subject_name_duplicate', where);
  else ctx.names.add(nameKey(s.name));
  // V8 credits
  const creditsOk = intOk(s.credits, CREDITS_MIN, CREDITS_MAX);
  if (!creditsOk) push('credits', where);
  // graded or measured
  const scoring = SCORINGS.includes(s.scoring) ? s.scoring : null;
  if (scoring === null) push('shape', where, `${path}.scoring`);
  // V11 graded: no ways; measured: 1 or 2 ways — then each way
  if (!Array.isArray(s.ways)) push('shape', where, `${path}.ways`);
  else if ((scoring === 'graded' && s.ways.length !== 0) || (scoring === 'measured' && (s.ways.length < 1 || s.ways.length > MAX_WAYS))) {
    push('ways_count', where);
  } else if (scoring === 'measured') {
    const names = new Set();
    s.ways.forEach((way, wi) => wayProblems(way, wi, s.ways.length, names, where, `${path}.ways[${wi}]`, push));
  }
  // worked out or own points
  if (!POINTS_MODES.includes(s.points_mode)) push('shape', where, `${path}.points_mode`);
  // V9 the points
  let pointsOk = false;
  if (!isObj(s.points)) push('shape', where, `${path}.points`);
  else if (scoring !== null) pointsOk = letterMapProblems(s.points, subjectLetters(code, scoring), 'points_range', 'points_order', where, `${path}.points`, push);
  // V10 worked out: every grade's points = credits × the part's grade point, exactly
  if (s.points_mode === 'worked' && pointsOk && creditsOk && ctx.gradePointsOk) {
    const worked = workedPoints(part, s);
    if (subjectLetters(code, scoring).some((l) => worked[l] !== s.points[l])) push('points_not_worked_out', where);
  }
  // V16 who does it: everyone (null), or 1–6 of the Dan's pass brackets, exactly {from, to}, no repeats
  const list = s.limited_to;
  if (list !== null) {
    const shapeOk = Array.isArray(list) && list.length >= 1 && list.length <= MAX_BRACKETS && list.every((b) => exactKeys(b, ['from', 'to']));
    const repeats = shapeOk && list.some((b, i) => list.findIndex((x) => sameBracket(x, b)) !== i);
    const unknown = shapeOk && ctx.passOk && list.some((b) => !ctx.passKeys.some((p) => sameBracket(p, b)));
    if (!shapeOk || repeats || unknown) push('limited_to', where);
  }
  // the tags and V17 the note
  if (typeof s.outdoor !== 'boolean') push('shape', where, `${path}.outdoor`);
  if (typeof s.handed_in !== 'boolean') push('shape', where, `${path}.handed_in`);
  if (s.note !== null && !rubricTextOk(s.note, NOTE_MAX)) push('note', where);
}

// One part (V1 code and order, V3 name, V4 grade points, V5 subject count, then its subjects).
function partProblems(part, pi, ctx) {
  const { push } = ctx;
  const path = `parts[${pi}]`;
  const code = RUBRIC_PART_CODES[pi];
  if (!exactKeys(part, ['code', 'name', 'grade_points', 'subjects']) || part.code !== code) {
    push('shape', {}, path);
    return;
  }
  const where = { part: code };
  if (!rubricNameOk(part.name)) push('part_name', where);
  else if (ctx.partNames.has(nameKey(part.name))) push('part_name_duplicate', where);
  else ctx.partNames.add(nameKey(part.name));
  const gradePointsOk = letterMapProblems(part.grade_points, partLetters(code), 'grade_points_range', 'grade_points_order', where, `${path}.grade_points`, push);
  if (!Array.isArray(part.subjects)) {
    push('shape', where, `${path}.subjects`);
    return;
  }
  if (part.subjects.length < 1 || part.subjects.length > MAX_SUBJECTS) {
    push('subject_count', where);
    return;
  }
  const subjectCtx = { ...ctx, part, partIndex: pi, names: new Set(), gradePointsOk };
  part.subjects.forEach((s, si) => subjectProblems(s, si, subjectCtx));
}

// The extra points (V20, V21).
function extraProblems(extra, push) {
  if (!exactKeys(extra, ['counts_toward_total', 'limit', 'to_confirm', 'note', 'items'])) {
    push('shape', {}, 'extra_points');
    return;
  }
  if (typeof extra.counts_toward_total !== 'boolean') push('shape', {}, 'extra_points.counts_toward_total');
  if (typeof extra.to_confirm !== 'boolean') push('shape', {}, 'extra_points.to_confirm');
  if (extra.limit !== null && !numOk(extra.limit, 1, EXTRA_LIMIT_MAX)) push('extra_limit');
  if (extra.note !== null && !rubricTextOk(extra.note, NOTE_MAX)) push('extra_note');
  if (!Array.isArray(extra.items)) {
    push('shape', {}, 'extra_points.items');
    return;
  }
  if (extra.items.length > MAX_EXTRA_ITEMS) {
    push('extra_item_count');
    return;
  }
  const names = new Set();
  extra.items.forEach((item, ii) => {
    const at = { item: ii };
    const path = `extra_points.items[${ii}]`;
    if (!exactKeys(item, ['name', 'rule'])) {
      push('shape', at, path);
      return;
    }
    if (!rubricNameOk(item.name)) push('extra_item_name', at);
    else if (names.has(nameKey(item.name))) push('extra_item_name_duplicate', at);
    else names.add(nameKey(item.name));
    // the rule: per count {kind, points_each}, or steps {kind, steps}; anything else → extra_rule
    const rule = item.rule;
    if (exactKeys(rule, ['kind', 'points_each']) && rule.kind === 'per_count') {
      if (!numOk(rule.points_each, 0.01, POINTS_MAX)) push('extra_points_each', at);
      return;
    }
    if (!(exactKeys(rule, ['kind', 'steps']) && rule.kind === 'steps')) {
      push('extra_rule', at);
      return;
    }
    const steps = rule.steps;
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > MAX_STEPS) {
      push('extra_steps_count', at);
      return;
    }
    if (!steps.every((step) => exactKeys(step, ['at_least', 'points']))) {
      push('shape', at, `${path}.rule.steps`);
      return;
    }
    let stepsOk = true;
    steps.forEach((step, k) => {
      if (!intOk(step.at_least, 1, STEP_AT_LEAST_MAX) || !numOk(step.points, 0.01, POINTS_MAX)) {
        push('extra_step_range', { ...at, step: k });
        stepsOk = false;
      }
    });
    // each next step: strictly more needed AND strictly more points
    if (stepsOk && steps.slice(1).some((step, k) => step.at_least <= steps[k].at_least || step.points <= steps[k].points)) {
      push('extra_steps_order', at);
    }
  });
}

// The validator of one Dan. Never throws; never more than 100 problems.
// Walk order (as the SQL): the stamps, the pass rule, the four parts, the extra points; the two
// cross-checks that need every number at once (a bracket that does no subject, a pass mark above
// the bracket's most points) run LAST and only when nothing else is wrong.
export function danProblems(dan, danNo) {
  const problems = [];
  const push = (code, where = {}, path = undefined) => {
    problems.push({ code, ...where, ...(path !== undefined ? { path } : {}) });
  };
  try {
    if (dan === null || dan === undefined) return [{ code: 'shape', path: 'dan' }];
    // V2: the size first
    if (jsonBytes(dan) > DAN_MAX_BYTES) return [{ code: 'too_big' }];
    // V1: a Dan object with exactly its 7 keys
    if (!exactKeys(dan, ['dan', 'rev', 'saved_at', 'saved_by_name', 'pass', 'parts', 'extra_points'])) return [{ code: 'shape', path: 'dan' }];
    if (dan.dan !== danNo || danNo === null || danNo === undefined) push('dan_number', {}, 'dan');
    // V20b: the stamps the server writes
    if (!intOk(dan.rev, 1, REV_MAX)) push('shape', {}, 'rev');
    if (!(dan.saved_at === null || (typeof dan.saved_at === 'string' && STAMP_PATTERN.test(dan.saved_at)))) push('shape', {}, 'saved_at');
    if (!(dan.saved_by_name === null || rubricNameOk(dan.saved_by_name))) push('shape', {}, 'saved_by_name');
    // V18: the pass rule {brackets, no_d, makeup}
    const pass = dan.pass;
    let passOk = false; // the pass brackets are usable (for "limited to" and the cross-checks)
    if (!exactKeys(pass, ['brackets', 'no_d', 'makeup'])) push('shape', {}, 'pass');
    else {
      if (bracketListOk(pass.brackets, 'pass_mark', {}, 'pass.brackets', push)) {
        passOk = bracketRules(pass.brackets, {}, push);
        pass.brackets.forEach((b, bi) => {
          if (!numOk(b.pass_mark, 1, PASS_MARK_MAX)) push('pass_mark_range', { bracket: bi });
        });
      }
      if (typeof pass.no_d !== 'boolean') push('shape', {}, 'pass.no_d');
      if (pass.makeup !== null && !rubricTextOk(pass.makeup, MAKEUP_MAX)) push('makeup');
    }
    const passKeys = passOk ? pass.brackets.map((b) => ({ from: b.from, to: b.to })) : [];
    // V1: the four parts, in order
    if (!Array.isArray(dan.parts) || dan.parts.length !== RUBRIC_PART_CODES.length) push('shape', {}, 'parts');
    else {
      const ctx = { push, passOk, passKeys, ids: new Set(), partNames: new Set() };
      dan.parts.forEach((part, pi) => partProblems(part, pi, ctx));
    }
    // V20–V21: the extra points
    extraProblems(dan.extra_points, push);
    // V19, V18: the cross-checks, only when everything above is fine
    if (problems.length === 0) {
      pass.brackets.forEach((b, bi) => {
        const most = mostPoints(dan, b);
        if (most === 0) push('bracket_empty', { bracket: bi });
        else if (b.pass_mark > most) push('pass_mark_too_high', { bracket: bi });
      });
    }
  } catch {
    // never expected; a sheet we can't read is refused rather than crashing the screen
    if (problems.length === 0) problems.push({ code: 'shape', path: 'dan' });
  }
  return problems.slice(0, MAX_PROBLEMS);
}

// The sorted, unique codes of a problem list (what the shared test cases compare).
export function problemCodes(problems) {
  return [...new Set((problems ?? []).map((p) => p.code))].sort();
}

// The whole document (bb_rubric_is_valid, but listing what's wrong): the outer keys, the version,
// the source, four Dans numbered 1–4 in order, each one valid. [] = valid.
export function rubricProblems(doc) {
  try {
    if (doc !== undefined && jsonBytes(doc) > RUBRIC_MAX_BYTES) return [{ code: 'too_big' }];
    if (!exactKeys(doc, ['schema_version', 'source', 'dans'])) return [{ code: 'shape', path: '' }];
    const problems = [];
    if (doc.schema_version !== RUBRIC_SCHEMA_VERSION) problems.push({ code: 'shape', path: 'schema_version' });
    if (!rubricTextOk(doc.source, SOURCE_MAX)) problems.push({ code: 'shape', path: 'source' });
    if (!Array.isArray(doc.dans) || doc.dans.length !== RUBRIC_DANS.length) {
      problems.push({ code: 'shape', path: 'dans' });
      return problems;
    }
    doc.dans.forEach((dan, i) => {
      for (const p of danProblems(dan, i + 1)) if (problems.length < MAX_PROBLEMS) problems.push({ dan: i + 1, ...p });
    });
    return problems.slice(0, MAX_PROBLEMS);
  } catch {
    return [{ code: 'shape', path: '' }];
  }
}

// bb_rubric_is_valid: true only for a whole valid v2 document.
export function rubricIsValid(doc) {
  return rubricProblems(doc).length === 0;
}

// =====================================================================================
// Editing helpers (pure: each returns a NEW object and never changes its input)
// =====================================================================================

// The server-owned keys of a Dan (rev, saved_at, saved_by_name) set to placeholders, as the
// save functions do before they compare or check a sheet.
export function stripStamps(dan, rev = 1) {
  if (!isObj(dan)) return dan;
  return { ...clone(dan), rev, saved_at: null, saved_by_name: null };
}

// A copy of a JSON value with every object's keys sorted (so two documents compare like jsonb).
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObj(value)) return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}

// Same content, ignoring the stamps and the order of keys? (the "unchanged" check of a save)
export function sameDanContent(a, b) {
  return JSON.stringify(canonical(stripStamps(a))) === JSON.stringify(canonical(stripStamps(b)));
}

// A Dan tidied the way the database expects it: names and texts normalized, empty texts → null,
// worked-out points recomputed (credits × grade points). Anything it can't tidy stays as it is,
// so the validator still reports it.
export function normalizeDan(dan) {
  if (!isObj(dan)) return dan;
  const d = clone(dan);
  const name = (v) => (typeof v === 'string' ? tidyRubricName(v) : v);
  const text = (v) => (typeof v === 'string' ? tidyRubricText(v) : v);
  if (isObj(d.pass) && 'makeup' in d.pass) d.pass.makeup = text(d.pass.makeup);
  for (const p of Array.isArray(d.parts) ? d.parts : []) {
    if (!isObj(p)) continue;
    p.name = name(p.name);
    for (const s of Array.isArray(p.subjects) ? p.subjects : []) {
      if (!isObj(s)) continue;
      s.name = name(s.name);
      if ('note' in s) s.note = text(s.note);
      for (const w of Array.isArray(s.ways) ? s.ways : []) {
        if (!isObj(w)) continue;
        if (typeof w.name === 'string') w.name = tidyRubricName(w.name) === '' ? null : tidyRubricName(w.name);
        if (typeof w.unit === 'string') w.unit = tidyRubricText(w.unit) ?? '';
      }
      if (s.points_mode === 'worked' && isObj(p.grade_points) && intOk(s.credits, CREDITS_MIN, CREDITS_MAX)) {
        const worked = workedPoints(p, s);
        if (subjectLetters(p.code, s.scoring).every((l) => l in worked)) s.points = worked;
      }
    }
  }
  if (isObj(d.extra_points)) {
    if ('note' in d.extra_points) d.extra_points.note = text(d.extra_points.note);
    for (const item of Array.isArray(d.extra_points.items) ? d.extra_points.items : []) if (isObj(item)) item.name = name(item.name);
  }
  return d;
}

// Splits bracket `index` of a bracket list at `age`: the first half ends at age − 1, the second
// starts at age. Both halves keep everything else (the cut-offs or the pass mark).
// → the new list, or null when the age isn't inside the bracket (from < age ≤ to).
export function splitBrackets(list, index, age) {
  const b = Array.isArray(list) ? list[index] : null;
  if (!isObj(b) || !intOk(age, 1, AGE_MAX)) return null;
  const from = b.from ?? null;
  const to = b.to ?? null;
  if ((from !== null && age <= from) || (to !== null && age > to)) return null;
  const out = clone(list);
  out.splice(index, 1, { ...clone(b), from, to: age - 1 }, { ...clone(b), from: age, to });
  return out;
}

// Removes bracket `index` of a bracket list; its neighbour takes over its ages (the one before,
// or the next one when it was the first), so there is never a gap.
// → { list, absorbedIndex (in the new list) } or null (the last bracket can't go).
export function removeFromBrackets(list, index) {
  if (!Array.isArray(list) || list.length < 2 || !isObj(list[index])) return null;
  const out = clone(list);
  const [gone] = out.splice(index, 1);
  if (index > 0) {
    out[index - 1].to = gone.to ?? null;
    return { list: out, absorbedIndex: index - 1 };
  }
  out[0].from = gone.from ?? null;
  return { list: out, absorbedIndex: 0 };
}

// Splits pass bracket `index` of a Dan at `age` (R6): both halves keep the pass mark, and every
// subject's limited_to entry naming that bracket names both halves. → the new Dan, or null.
export function splitBracket(dan, index, age) {
  if (!isObj(dan) || !isObj(dan.pass)) return null;
  const old = dan.pass.brackets?.[index];
  const list = splitBrackets(dan.pass.brackets, index, age);
  if (!list) return null;
  const d = clone(dan);
  d.pass.brackets = list;
  const halves = [{ from: list[index].from, to: list[index].to }, { from: list[index + 1].from, to: list[index + 1].to }];
  forEachSubject(d, (s) => {
    if (!Array.isArray(s.limited_to)) return;
    const next = [];
    for (const b of s.limited_to) {
      if (sameBracket(b, old)) next.push(...halves.map(clone));
      else next.push(b);
    }
    s.limited_to = next;
  });
  return d;
}

// Removes pass bracket `index` of a Dan (its neighbour takes over its ages). A subject limited to
// the removed or the absorbing bracket is limited to the merged one; a subject limited to every
// bracket left counts for everyone again (limited_to null). → the new Dan, or null.
export function removeBracket(dan, index) {
  if (!isObj(dan) || !isObj(dan.pass)) return null;
  const before = dan.pass.brackets;
  const result = removeFromBrackets(before, index);
  if (!result) return null;
  const d = clone(dan);
  d.pass.brackets = result.list;
  const merged = { from: result.list[result.absorbedIndex].from, to: result.list[result.absorbedIndex].to };
  const absorbedOld = before[index > 0 ? index - 1 : 1];
  forEachSubject(d, (s) => {
    if (!Array.isArray(s.limited_to)) return;
    const next = [];
    for (const b of s.limited_to) {
      const entry = sameBracket(b, before[index]) || sameBracket(b, absorbedOld) ? clone(merged) : b;
      if (!next.some((x) => sameBracket(x, entry))) next.push(entry);
    }
    s.limited_to = result.list.every((p) => next.some((x) => sameBracket(x, p))) ? null : next;
  });
  return d;
}

function forEachSubject(dan, fn) {
  for (const p of Array.isArray(dan?.parts) ? dan.parts : []) {
    for (const s of Array.isArray(p?.subjects) ? p.subjects : []) if (isObj(s)) fn(s, p);
  }
}

// Copy from another Dan (R9, §6.5): the other Dan's SAVED version, renumbered, keeping subject
// ids. target (optional) = the Dan being edited: its rev and stamps are kept, so the draft still
// saves against the right version.
export function copyFromDan(source, danNo, target = null) {
  if (!isObj(source)) return source;
  const d = clone(source);
  d.dan = danNo;
  if (isObj(target)) {
    d.rev = target.rev;
    d.saved_at = target.saved_at ?? null;
    d.saved_by_name = target.saved_by_name ?? null;
  }
  return d;
}

// A new subject id: 8 characters a–z / 0–9, not used anywhere in the Dan.
export function newSubjectId(dan = null) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const used = new Set();
  forEachSubject(dan, (s) => used.add(s.id));
  for (;;) {
    const bytes = new Uint8Array(8);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < 8; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    const id = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    if (!used.has(id)) return id;
  }
}

// ----- What changed between two versions of a Dan (R11: the change count, the "Your N changes
// weren't saved" box and the other admin's change line) -----

const fmt = (v) => (v === null || v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v));
const quoted = (v) => (typeof v === 'string' ? `"${v}"` : fmt(v));
const scoringWord = (v) => (v === 'graded' ? 'graded' : v === 'measured' ? 'measured' : fmt(v));
const modeWord = (v) => (v === 'worked' ? 'worked out' : v === 'own' ? 'own points' : fmt(v));
const bracketsWord = (list) => (Array.isArray(list) ? list.map(bracketLabel).join(', ') : fmt(list));
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

// danDiff(a, b) → a list of plain change lines from version a (before) to b (after), e.g.
//   "Long jump credits 2 → 3", "Added Plank (Physical)", "To pass (17 and under) 275 → 280".
// The stamps (rev, saved_at, saved_by_name) are ignored. [] = no change.
export function danDiff(a, b) {
  const lines = [];
  if (!isObj(a) || !isObj(b)) return same(a, b) ? lines : ['Rubric changed'];
  // the pass rule
  const pa = a.pass ?? {};
  const pb = b.pass ?? {};
  const ba = Array.isArray(pa.brackets) ? pa.brackets : [];
  const bb = Array.isArray(pb.brackets) ? pb.brackets : [];
  if (ba.length !== bb.length || ba.some((x, i) => !sameBracket(x, bb[i]))) {
    lines.push(`To pass age brackets ${bracketsWord(ba)} → ${bracketsWord(bb)}`);
  }
  for (const x of bb) {
    const old = ba.find((y) => sameBracket(y, x));
    if (old && old.pass_mark !== x.pass_mark) lines.push(`To pass (${bracketLabel(x)}) ${fmt(old.pass_mark)} → ${fmt(x.pass_mark)}`);
  }
  if (pa.no_d !== pb.no_d) lines.push(`No D grade rule ${fmt(pa.no_d)} → ${fmt(pb.no_d)}`);
  if ((pa.makeup ?? null) !== (pb.makeup ?? null)) lines.push('Make-up sentence changed');
  // the parts and their subjects (matched by id)
  const partsA = Array.isArray(a.parts) ? a.parts : [];
  const partsB = Array.isArray(b.parts) ? b.parts : [];
  const where = (parts) => {
    const map = new Map();
    for (const p of parts) for (const [i, s] of (Array.isArray(p?.subjects) ? p.subjects : []).entries()) if (isObj(s)) map.set(s.id, { part: p, s, i });
    return map;
  };
  const inA = where(partsA);
  const inB = where(partsB);
  RUBRIC_PART_CODES.forEach((code, pi) => {
    const p = partsA[pi] ?? {};
    const q = partsB[pi] ?? {};
    const label = q.name ?? p.name ?? code;
    if (p.name !== q.name) lines.push(`Part name ${quoted(p.name)} → ${quoted(q.name)}`);
    for (const l of partLetters(code)) {
      if (p.grade_points?.[l] !== q.grade_points?.[l]) lines.push(`${label} grade points ${l} ${fmt(p.grade_points?.[l])} → ${fmt(q.grade_points?.[l])}`);
    }
    // removed / added / moved subjects
    for (const s of Array.isArray(p.subjects) ? p.subjects : []) if (isObj(s) && !inB.has(s.id)) lines.push(`Removed ${s.name} (${label})`);
    const subjectsB = Array.isArray(q.subjects) ? q.subjects : [];
    for (const s of subjectsB) {
      if (!isObj(s)) continue;
      const old = inA.get(s.id);
      if (!old) {
        lines.push(`Added ${s.name} (${label})`);
        continue;
      }
      if (old.part.code !== code) lines.push(`Moved ${s.name} to ${label}`);
      lines.push(...subjectDiff(old.s, s, old.part, q));
    }
    // the order of the subjects kept in this part
    const keptA = (Array.isArray(p.subjects) ? p.subjects : []).filter((s) => isObj(s) && inB.get(s.id)?.part.code === code).map((s) => s.id);
    const keptB = subjectsB.filter((s) => isObj(s) && inA.get(s.id)?.part.code === code).map((s) => s.id);
    if (keptA.join() !== keptB.join()) lines.push(`${label} subjects reordered`);
  });
  // the extra points
  const ea = a.extra_points ?? {};
  const eb = b.extra_points ?? {};
  if (ea.counts_toward_total !== eb.counts_toward_total) lines.push(`Extra points count toward the total ${fmt(ea.counts_toward_total)} → ${fmt(eb.counts_toward_total)}`);
  if ((ea.limit ?? null) !== (eb.limit ?? null)) lines.push(`Extra points limit ${fmt(ea.limit)} → ${fmt(eb.limit)}`);
  if (ea.to_confirm !== eb.to_confirm) lines.push(`Extra points "to confirm" ${fmt(ea.to_confirm)} → ${fmt(eb.to_confirm)}`);
  if ((ea.note ?? null) !== (eb.note ?? null)) lines.push('Extra points note changed');
  const itemsA = Array.isArray(ea.items) ? ea.items : [];
  const itemsB = Array.isArray(eb.items) ? eb.items : [];
  const key = (item) => (typeof item?.name === 'string' ? nameKey(item.name) : '');
  for (const item of itemsA) if (!itemsB.some((x) => key(x) === key(item))) lines.push(`Removed extra points item ${item?.name}`);
  for (const item of itemsB) {
    const old = itemsA.find((x) => key(x) === key(item));
    if (!old) lines.push(`Added extra points item ${item?.name}`);
    else if (!same(old.rule, item.rule)) lines.push(`${item.name} extra points changed`);
    else if (old.name !== item.name) lines.push(`Extra points item ${quoted(old.name)} → ${quoted(item.name)}`);
  }
  const orderA = itemsA.map(key).filter((k) => itemsB.some((x) => key(x) === k));
  const orderB = itemsB.map(key).filter((k) => itemsA.some((x) => key(x) === k));
  if (orderA.join('|') !== orderB.join('|')) lines.push('Extra points items reordered');
  return lines;
}

// The change lines of one subject kept between two versions.
function subjectDiff(a, b, partA, partB) {
  const lines = [];
  const n = b.name;
  if (a.name !== b.name) lines.push(`Subject name ${quoted(a.name)} → ${quoted(b.name)}`);
  if (a.credits !== b.credits) lines.push(`${n} credits ${fmt(a.credits)} → ${fmt(b.credits)}`);
  if (a.scoring !== b.scoring) lines.push(`${n} ${scoringWord(a.scoring)} → ${scoringWord(b.scoring)}`);
  if (a.points_mode !== b.points_mode) lines.push(`${n} points ${modeWord(a.points_mode)} → ${modeWord(b.points_mode)}`);
  // own points typed per grade (worked-out points follow the credits and grade points)
  if (b.points_mode === 'own' || a.points_mode === 'own') {
    for (const l of subjectLetters(partB?.code ?? partA?.code, b.scoring)) {
      if (a.points?.[l] !== b.points?.[l]) lines.push(`${n} points ${l} ${fmt(a.points?.[l])} → ${fmt(b.points?.[l])}`);
    }
  }
  const waysA = Array.isArray(a.ways) ? a.ways : [];
  const waysB = Array.isArray(b.ways) ? b.ways : [];
  if (waysA.length !== waysB.length) lines.push(`${n} ways ${waysA.length} → ${waysB.length}`);
  waysB.forEach((w, i) => {
    const old = waysA[i];
    if (!old || same(old, w)) return;
    const label = w?.name ? `${n} (${w.name})` : n;
    if (old.name !== w?.name) lines.push(`${n} way name ${quoted(old.name)} → ${quoted(w?.name)}`);
    if (old.unit !== w?.unit) lines.push(`${label} unit ${quoted(old.unit)} → ${quoted(w?.unit)}`);
    if (old.direction !== w?.direction) lines.push(`${label} direction ${fmt(old.direction)} → ${fmt(w?.direction)}`);
    if (!same(old.brackets, w?.brackets)) lines.push(`${label} cut-offs changed`);
  });
  if (!same(a.limited_to ?? null, b.limited_to ?? null)) {
    const who = (list) => (Array.isArray(list) ? `only ${bracketsWord(list)}` : 'everyone');
    lines.push(`${n} who does it ${who(a.limited_to)} → ${who(b.limited_to)}`);
  }
  if (a.outdoor !== b.outdoor) lines.push(`${n} outdoor ${fmt(a.outdoor)} → ${fmt(b.outdoor)}`);
  if (a.handed_in !== b.handed_in) lines.push(`${n} handed in ${fmt(a.handed_in)} → ${fmt(b.handed_in)}`);
  if ((a.note ?? null) !== (b.note ?? null)) lines.push(`${n} note changed`);
  return lines;
}

// =====================================================================================
// Copies and the public view
// =====================================================================================

// Puts one Dan into a document (bb_rubric_put_dan): a new document with dans[danNo − 1] replaced.
export function putDan(doc, danNo, dan) {
  const d = clone(doc);
  d.dans[danNo - 1] = clone(dan);
  return d;
}

// What Add cycle stores (bb_rubric_fresh_copy): the default with source "Default rubric", each
// Dan rev 1 and no "saved by" stamps.
export function freshCopy(doc) {
  const d = clone(doc);
  d.source = FRESH_COPY_SOURCE;
  d.dans = d.dans.map((dan) => ({ ...dan, rev: 1, saved_at: null, saved_by_name: null }));
  return d;
}

// The family form's view of a rubric (bb_rubric_public, §7): built from an ALLOW-LIST, key by
// key, so no rev, saved_at, saved_by_name, source or any future key reaches the public.
// null in → null out.
export function rubricPublic(doc) {
  if (!isObj(doc)) return null;
  const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k] ?? null]));
  // grade points, points and cut-offs keep only the grade letters (A+ … D)
  const letters = (map) => (isObj(map) ? Object.fromEntries(LONG_LETTERS.filter((l) => Object.hasOwn(map, l)).map((l) => [l, clone(map[l])])) : {});
  const bracket = (b, third) => ({ from: b?.from ?? null, to: b?.to ?? null, [third]: third === 'cutoffs' ? letters(b?.cutoffs) : clone(b?.[third] ?? null) });
  const rule = (r) => {
    if (r?.kind === 'per_count') return { kind: 'per_count', points_each: r.points_each ?? null };
    if (r?.kind === 'steps') return { kind: 'steps', steps: (Array.isArray(r.steps) ? r.steps : []).map((s) => pick(s, ['at_least', 'points'])) };
    return { kind: r?.kind ?? null };
  };
  return {
    schema_version: doc.schema_version ?? null,
    dans: (Array.isArray(doc.dans) ? doc.dans : []).map((d) => ({
      dan: d?.dan ?? null,
      pass: {
        brackets: (Array.isArray(d?.pass?.brackets) ? d.pass.brackets : []).map((b) => bracket(b, 'pass_mark')),
        no_d: d?.pass?.no_d ?? null,
        makeup: d?.pass?.makeup ?? null,
      },
      parts: (Array.isArray(d?.parts) ? d.parts : []).map((p) => ({
        code: p?.code ?? null,
        name: p?.name ?? null,
        grade_points: letters(p?.grade_points),
        subjects: (Array.isArray(p?.subjects) ? p.subjects : []).map((s) => ({
          id: s?.id ?? null,
          name: s?.name ?? null,
          credits: s?.credits ?? null,
          scoring: s?.scoring ?? null,
          ways: (Array.isArray(s?.ways) ? s.ways : []).map((w) => ({
            name: w?.name ?? null,
            unit: w?.unit ?? null,
            direction: w?.direction ?? null,
            brackets: (Array.isArray(w?.brackets) ? w.brackets : []).map((b) => bracket(b, 'cutoffs')),
          })),
          points_mode: s?.points_mode ?? null,
          points: letters(s?.points),
          limited_to: Array.isArray(s?.limited_to) ? s.limited_to.map((b) => ({ from: b?.from ?? null, to: b?.to ?? null })) : null,
          outdoor: s?.outdoor ?? null,
          handed_in: s?.handed_in ?? null,
          note: s?.note ?? null,
        })),
      })),
      extra_points: {
        counts_toward_total: d?.extra_points?.counts_toward_total ?? null,
        limit: d?.extra_points?.limit ?? null,
        to_confirm: d?.extra_points?.to_confirm ?? null,
        note: d?.extra_points?.note ?? null,
        items: (Array.isArray(d?.extra_points?.items) ? d.extra_points.items : []).map((i) => ({ name: i?.name ?? null, rule: rule(i?.rule) })),
      },
    })),
  };
}

// =====================================================================================
// From the old v1 sheet to v2 without changing a number (bb_rubric_from_v1, contract §4.1)
// =====================================================================================
// Used for old preview data and by checks.mjs (which proves rubricDefault.js = this conversion
// of the Fall 2026 starting point). Like the SQL it THROWS on anything the Fall 2026 sheet
// doesn't contain, so a surprise shape is noticed instead of guessed.

function fail(what) {
  throw new Error(`rubricFromV1: ${what}`);
}

// Copies a letter → number object with exactly these letters (else throws).
function letterCopy(map, letters, what) {
  if (!isObj(map) || !letters.every((l) => typeof map[l] === 'number')) fail(`${what} is missing a grade`);
  return Object.fromEntries(letters.map((l) => [l, map[l]]));
}

// v1 groups → v2 brackets: ages.min / max → from / to, the cut-off list → an object.
function v1Brackets(groups, what) {
  return groups.map((g) => {
    if (!isObj(g?.ages) || !Array.isArray(g.cutoffs)) fail(`${what}: an age group without ages or cut-offs`);
    const cutoffs = {};
    for (const c of g.cutoffs) {
      if (!CUTOFF_LETTERS.includes(c?.grade) || typeof c.value !== 'number') fail(`${what}: a strange cut-off`);
      cutoffs[c.grade] = c.value;
    }
    return { from: g.ages.min ?? null, to: g.ages.max ?? null, cutoffs: letterCopy(cutoffs, CUTOFF_LETTERS, what) };
  });
}

export function rubricFromV1(v1) {
  if (!isObj(v1) || v1.schema_version !== 1 || !Array.isArray(v1.dans) || v1.dans.length !== 4) fail('not a v1 sheet');
  const scales = v1.grade_scales;
  if (!isObj(scales)) fail('no grade_scales');
  const gradePoints = {
    physical: letterCopy(scales.physical, SHORT_LETTERS, 'physical scale'),
    technical: letterCopy(scales.technical, LONG_LETTERS, 'technical scale'),
    curriculum: letterCopy(scales.curriculum, LONG_LETTERS, 'curriculum scale'),
  };
  gradePoints.other = clone(gradePoints.technical); // no v1 scale for Other: a copy of Technical's
  const dans = v1.dans.map((d, di) => {
    const danNo = di + 1;
    if (d?.dan !== danNo) fail(`Dan ${danNo} out of order`);
    if (!Array.isArray(d.parts) || d.parts.map((p) => p?.code).join() !== RUBRIC_PART_CODES.join()) fail(`Dan ${danNo} parts`);
    const rule = d.pass_rule;
    if (!isObj(rule) || typeof rule.points !== 'number') fail(`Dan ${danNo} pass rule`);
    const hasAdultsOnly = d.parts.some((p) => (p.subjects ?? []).some((s) => s?.adults_only === true));
    const hasAdultMark = rule.points_adult !== undefined && rule.points_adult !== null;
    const brackets = hasAdultsOnly || hasAdultMark
      ? [{ from: null, to: 17, pass_mark: rule.points }, { from: 18, to: null, pass_mark: hasAdultMark ? rule.points_adult : rule.points }]
      : [{ from: null, to: null, pass_mark: rule.points }];
    const parts = d.parts.map((p) => {
      const code = p.code;
      const gp = clone(gradePoints[code]);
      const subjects = (p.subjects ?? []).map((s) => {
        const known = ['name', 'credits', 'scoring', 'outdoor', 'hand_in', 'adults_only'];
        if (!isObj(s) || Object.keys(s).some((k) => !known.includes(k))) fail(`Dan ${danNo} ${code}: a subject with an unknown key`);
        const sc = s.scoring;
        if (!isObj(sc) || Object.keys(sc).some((k) => !['kind', 'direction', 'unit', 'groups', 'points', 'note'].includes(k))) {
          fail(`Dan ${danNo} ${s.name}: strange scoring`);
        }
        let scoring;
        let ways;
        if (sc.kind === 'grades') {
          scoring = 'graded';
          ways = [];
        } else if (sc.kind === 'table') {
          scoring = 'measured';
          if (!Array.isArray(sc.groups) || sc.groups.length === 0) fail(`Dan ${danNo} ${s.name}: no age groups`);
          const methods = sc.groups.map((g) => g.method ?? null);
          if (methods.every((m) => m === null)) {
            ways = [{ name: null, unit: sc.unit, direction: sc.direction, brackets: v1Brackets(sc.groups, s.name) }];
          } else {
            if (methods.some((m) => m !== 'reps' && m !== 'hold')) fail(`Dan ${danNo} ${s.name}: an unknown method`);
            ways = [
              { name: 'Pull-up', unit: 'reps', direction: sc.direction, brackets: v1Brackets(sc.groups.filter((g) => g.method === 'reps'), s.name) },
              { name: 'Hold', unit: 'seconds', direction: sc.direction, brackets: v1Brackets(sc.groups.filter((g) => g.method === 'hold'), s.name) },
            ];
          }
        } else {
          fail(`Dan ${danNo} ${s.name}: unknown scoring kind`);
        }
        const letters = subjectLetters(code, scoring);
        const points = letterCopy(sc.points, letters, `${s.name} points`);
        const subject = {
          id: md5Hex(`${danNo}/${code}/${s.name}`).slice(0, 8),
          name: s.name,
          credits: s.credits,
          scoring,
          ways,
          points_mode: 'worked',
          points,
          limited_to: s.adults_only === true ? [{ from: 18, to: null }] : null,
          outdoor: s.outdoor === true,
          handed_in: s.hand_in === true,
          note: sc.note ?? null,
        };
        const worked = workedPoints({ code, grade_points: gp }, subject);
        subject.points_mode = letters.every((l) => worked[l] === points[l]) ? 'worked' : 'own';
        return subject;
      });
      return { code, name: p.name, grade_points: gp, subjects };
    });
    const ep = d.extra_points;
    if (!isObj(ep)) fail(`Dan ${danNo} extra points`);
    return {
      dan: danNo,
      rev: 1,
      saved_at: null,
      saved_by_name: null,
      pass: { brackets, no_d: rule.no_d, makeup: rule.makeup ?? null },
      parts,
      extra_points: {
        counts_toward_total: ep.counts_toward_total,
        limit: ep.limit ?? null,
        to_confirm: ep.to_confirm,
        note: ep.note ?? null,
        items: clone(ep.items),
      },
    };
  });
  return { schema_version: RUBRIC_SCHEMA_VERSION, source: v1.source, dans };
}

// The MD5 fingerprint of a text (its UTF-8 bytes), as 32 lowercase hex characters — the same as
// Postgres's md5(text). Only used to make the converted subjects' ids
// (left(md5(dan || '/' || code || '/' || name), 8), contract §4.1). Not for security.
export function md5Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  const blocks = ((bytes.length + 8) >>> 6) + 1; // 64-byte blocks, with room for the end marker + length
  const words = new Array(blocks * 16).fill(0);
  for (let i = 0; i < bytes.length; i += 1) words[i >>> 2] |= bytes[i] << ((i % 4) * 8);
  words[bytes.length >>> 2] |= 0x80 << ((bytes.length % 4) * 8);
  words[blocks * 16 - 2] = bytes.length * 8; // the length in bits (our texts are short)
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const k = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0);
  let [h0, h1, h2, h3] = [0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476];
  for (let blk = 0; blk < blocks; blk += 1) {
    const m = words.slice(blk * 16, blk * 16 + 16);
    let [a, b, c, d] = [h0, h1, h2, h3];
    for (let i = 0; i < 64; i += 1) {
      let f;
      let g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const s = shifts[(i >>> 4) * 4 + (i % 4)];
      const sum = (a + f + k[i] + m[g]) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
  }
  return [h0, h1, h2, h3].map((h) => [0, 8, 16, 24].map((sh) => ((h >>> sh) & 0xff).toString(16).padStart(2, '0')).join('')).join('');
}
