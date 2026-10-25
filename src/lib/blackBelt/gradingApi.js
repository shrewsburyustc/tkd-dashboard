// gradingApi.js — every call the Black Belt GRADING and RESULTS screens make to the database
// (migration 0025, contract 0025 §7 and §13.2): the Grading grid and its saves, Choose subjects,
// make-ups from an earlier cycle, the Results tab, Email result, Mark as sent, the admins' CSV,
// the three result email texts, and the "has grading started" state for Edit cycle and the
// Rubric tab.
// Why it exists: like api.js does for cycles and candidates, this keeps the database functions'
// names and exact argument names (p_…) in ONE place. Screens call friendly camelCase functions
// with one object argument and always get back a plain object with a `status` CODE — and these
// functions NEVER throw, so a screen can't crash because the Wi-Fi dropped. Real mode: the real
// database; preview mode: the same calls reach the preview database (mockGrading.js, through
// mockBlackBelt.js and mockClient.js). Every call is a normal POST.
//
// Statuses: 'ok' · 'no_access' (lock the screen, the house path) · 'not_allowed' · 'invalid' ·
// 'not_found' · 'stale' · 'withdrawn' · 'finished' · 'kept' · 'already_added' · 'choice_needed' ·
// 'not_finished' · 'no_email' · 'has_grades' · 'duplicate_name' (never expected) · 'error'
// ({ status:'error', error } — never show the error to people). Other fields only come with 'ok'.
//
// THE RESULT (rulebook v0.938): Total and Result come ONLY from the database's `result` — from a
// read or from a save's answer; the screens never work a result out themselves. A Result keeps
// the database's snake_case keys (it is the same object grading.js gradeResult makes, so the
// helpers there — startingTicks, bestCase, leftWords … — work on it directly); only the keys of
// contract §4.2 are kept (anything else the database might add is dropped here):
//   { status:'no_age'|'not_finished'|'passed'|'makeup'|'withdrawn', reasons:[]|['d']|['below']|['d','below'],
//     complete, total, maximum, pass_mark, pass_bracket:{from,to}, age_group:{from,to},
//     parts:[{ code, points, graded, applying }], extra:{ counted, total, items:[{ name, count, points, kept }] },
//     subjects:[{ id, part, letter, measured, way, points, applies, kept, kept_from_cycle_name, retest,
//                 chosen, late, gradable }],
//     d_subjects, needs, late, missing (subject ids), choice_needed, counts:{ applying, graded, left },
//     result_key }
// The rows around it are camelCase (firstName, isMakeup …).
//
// PRIVACY (contract §9): loadGradingGrid and loadResults never return a date of birth, an email,
// a reference, money or an age. Only loadResultEmail returns ONE email, for one candidate, at the
// click (keep it only until the email is opened); only downloadCsv returns dates of birth, emails
// and money (admins; the database logs the download first). Nothing here stores or logs any of it.
import { supabase } from '../supabase.js';
import { isIsoDate, shortTime, todayInSchoolTime } from '../testing/eventRules.js';
import { schoolToday } from './api.js';
import { RESULT_KEYS, RESULT_SUBJECT_KEYS } from './grading.js';
import { RESULT_KINDS, csvRows, csvText, csvFileName } from './resultEmail.js';

export const GRADING_STATUSES = [
  'ok', 'no_access', 'not_allowed', 'invalid', 'not_found', 'stale', 'withdrawn', 'finished', 'kept', 'already_added',
  'choice_needed', 'not_finished', 'no_email', 'has_grades',
  'duplicate_name', // never expected (the database's shared exception mapping can name it)
  'error',
];
const SERVER_STATUSES = new Set(GRADING_STATUSES.filter((s) => s !== 'error'));
const PARTS = ['physical', 'technical', 'curriculum']; // the parts a testing day can have
const GRADED_PARTS = ['physical', 'technical', 'curriculum', 'other']; // every part that has grades
// The granted columns of bb_result_texts (contract §8) — never '*'.
const TEXT_COLUMNS = 'id, kind, body, version, created_at, updated_at, created_by_name, updated_by_name';

const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.length > 0;
const isInt = (v) => Number.isInteger(v);
const isBool = (v) => typeof v === 'boolean';
const orNull = (v) => (v === undefined ? null : v);
const textList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
// A list of names: plain texts, or objects with a name (so a preview line can name an item).
const nameList = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x?.name ?? x?.item_name ?? null)).filter(isText) : []);
const bracket = (b) => (isObj(b) ? { from: orNull(b.from), to: orNull(b.to) } : null);

// Calls one database function and turns its answer into { status, … }. readOk(data) checks the
// ok answer and converts it; null = wrong shape → 'error' rather than a guess. readOther(status,
// data) adds the extra fields some refusals carry (has_grades → the counts or the date).
async function callRpc(name, args, readOk, readOther = null) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const { data, error } = await supabase.rpc(name, args); // a normal POST (never { get: true })
    if (error) return failure(error);
    const status = data?.status;
    if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return unexpected(name);
    if (status !== 'ok') {
      const extra = readOther ? readOther(status, data) : null;
      if (extra === undefined) return unexpected(name);
      return { status, ...(extra ?? {}) };
    }
    const result = readOk(data);
    return result ? { status: 'ok', ...result } : unexpected(name);
  } catch (error) {
    return failure(error);
  }
}

// ----- Converting answers -----

// One subject inside a result → exactly the keys of §4.2 (null if it isn't one).
function toResultSubject(s) {
  if (!isObj(s) || !isText(s.id)) return null;
  return Object.fromEntries(RESULT_SUBJECT_KEYS.map((k) => [k, orNull(s[k])]));
}

// The database's result → the allow-listed Result (snake_case, §4.2). null = wrong shape.
export function toResult(r) {
  if (!isObj(r) || typeof r.status !== 'string' || !isText(r.result_key)) return null;
  const subjects = (Array.isArray(r.subjects) ? r.subjects : []).map(toResultSubject);
  if (!subjects.every(Boolean)) return null;
  const out = Object.fromEntries(RESULT_KEYS.map((k) => [k, orNull(r[k])]));
  out.reasons = textList(r.reasons);
  out.complete = r.complete === true;
  out.pass_bracket = bracket(r.pass_bracket);
  out.age_group = bracket(r.age_group);
  out.parts = (Array.isArray(r.parts) ? r.parts : []).map((p) => ({
    code: orNull(p?.code), points: orNull(p?.points), graded: orNull(p?.graded), applying: orNull(p?.applying),
  }));
  out.extra = isObj(r.extra)
    ? {
      counted: r.extra.counted === true,
      total: orNull(r.extra.total),
      items: (Array.isArray(r.extra.items) ? r.extra.items : []).map((i) => ({
        name: orNull(i?.name), count: orNull(i?.count), points: orNull(i?.points), kept: i?.kept === true,
      })),
    }
    : null;
  out.subjects = subjects;
  out.d_subjects = textList(r.d_subjects);
  out.needs = textList(r.needs);
  out.late = textList(r.late);
  out.missing = textList(r.missing);
  out.choice_needed = r.choice_needed === true;
  out.counts = isObj(r.counts) ? { applying: orNull(r.counts.applying), graded: orNull(r.counts.graded), left: orNull(r.counts.left) } : null;
  return out;
}

// A stored place → { code } (a school) or { other } (other text), as api.js.
const toPlace = (code, other) => (code ? { code } : { other: other ?? '' });

// A cycle day of a grading read → the Day shape of api.js (+ its parts).
function toDay(d) {
  if (!isObj(d) || !isText(d.id) || !isIsoDate(d.day_date)) return null;
  return {
    id: d.id,
    name: d.name,
    date: d.day_date,
    start: shortTime(d.start_time),
    end: shortTime(d.end_time),
    place: toPlace(d.place_code, d.place_other),
    second: d.second_start
      ? { start: shortTime(d.second_start), end: shortTime(d.second_end), place: toPlace(d.second_place_code, d.second_place_other) }
      : null,
    parts: PARTS.filter((p) => (Array.isArray(d.parts) ? d.parts : []).includes(p)),
  };
}

// The `cycle` object of the grid and the Results → { id, name, submissionsDue, firstDay, lastDay, days }.
function toCycle(c) {
  if (!isObj(c) || !isText(c.id) || !Array.isArray(c.days)) return null;
  const days = c.days.map(toDay);
  if (!days.every(Boolean)) return null;
  return {
    id: c.id,
    name: c.name,
    submissionsDue: orNull(c.submissions_due),
    firstDay: orNull(c.first_day),
    lastDay: orNull(c.last_day),
    days,
  };
}

// The Dan switch's counts → [{ dan, locationCode, count }] (active rows; the screen filters by school).
const toDanCounts = (list) => (Array.isArray(list) ? list : [])
  .filter((x) => isInt(x?.dan) && isInt(x?.count))
  .map((x) => ({ dan: x.dan, locationCode: x.location_code, count: x.count }));

// bb_sent_state → { sent: { id, markedAt, markedByName, resultStatus } | null, matches }.
function toSent(s) {
  if (!isObj(s)) return null;
  const x = s.sent;
  return {
    sent: isObj(x) ? { id: x.id, markedAt: x.marked_at, markedByName: orNull(x.marked_by_name), resultStatus: orNull(x.result_status) } : null,
    matches: s.matches === true,
  };
}

// A grid / Results row (no DOB, email, reference, plan, money or age — the database never sends
// them, and nothing else is copied).
function toRow(r, { withResults = false } = {}) {
  const result = toResult(r?.result);
  if (!isObj(r) || !isText(r.id) || !result) return null;
  const row = {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    locationCode: r.location_code,
    isMakeup: r.is_makeup === true,
    makeupOfCycleName: orNull(r.makeup_of_cycle_name),
    result,
  };
  if (withResults) {
    row.dan = r.dan;
    row.sent = toSent(r.sent) ?? { sent: null, matches: false };
    row.hasEmail = r.has_email === true;
  }
  return row;
}

// ----- The Grading tab -----

// The Grading grid of one Dan (staff and admins).
// → { status:'ok', today, cycle, rubric (the Dan's public rubric object, snake_case as the
//     document), danCounts, rows: GridRow[], loadedAt } · 'invalid' · 'not_found' · 'no_access' · 'error'
// rows: active candidates of that Dan, the cycle's own first, then make-ups (G 14), each group in
// roster order. The screen picks the testing day from `today` (G 28), never the device clock.
// loadedAt (ms, when the read started) is for the save engine.
export async function loadGradingGrid({ cycleId, dan } = {}) {
  const loadedAt = Date.now();
  return callRpc('bb_grading_grid', { p_cycle_id: cycleId ?? null, p_dan: dan ?? null }, (d) => {
    const cycle = toCycle(d.cycle);
    if (!cycle || !isIsoDate(d.today) || !isObj(d.rubric) || !Array.isArray(d.rows)) return null;
    const rows = d.rows.map((r) => toRow(r));
    return rows.every(Boolean) ? { today: d.today, cycle, rubric: d.rubric, danCounts: toDanCounts(d.dan_counts), rows, loadedAt } : null;
  });
}

// The refusals every grade write shares.
//   → 'invalid' · 'not_found' · 'withdrawn' · 'stale' (the candidate is in another Dan now — a stale
//     tablet can't bring back cleared grades) · 'kept' (a kept make-up grade) · 'no_access' · 'error'

// One letter (a graded subject). letter 'A+' … 'D', or null = Clear.
// → { status:'ok', letter, result } · the refusals above
export async function setGrade({ candidateId, dan, subjectId, letter } = {}) {
  return callRpc('bb_set_grade', {
    p_candidate_id: candidateId ?? null, p_dan: dan ?? null, p_subject_id: subjectId ?? null, p_letter: letter ?? null,
  }, (d) => {
    const result = toResult(d.result);
    return result ? { letter: orNull(d.letter), result } : null;
  });
}

// One measured number (a measured subject): value 0–999 with at most 4 decimals (parseMeasured
// in grading.js), way 0 or 1 (0 for a one-way subject); value null = Clear (way ignored).
// Switching the way keeps the number and works the grade out again (G 5).
// → { status:'ok', value, way, result } · the refusals above
export async function setMeasured({ candidateId, dan, subjectId, value, way } = {}) {
  return callRpc('bb_set_measured', {
    p_candidate_id: candidateId ?? null, p_dan: dan ?? null, p_subject_id: subjectId ?? null,
    p_value: value ?? null, p_way: way ?? null,
  }, (d) => {
    const result = toResult(d.result);
    return result ? { value: orNull(d.value), way: orNull(d.way), result } : null;
  });
}

// One extra-points count: count 0–9 999, or null = Clear. itemName = the item's exact name in the
// cycle's rubric. (No age needed: counts don't depend on it.)
// → { status:'ok', count, result } · the refusals above
export async function setCount({ candidateId, dan, itemName, count } = {}) {
  return callRpc('bb_set_extra_count', {
    p_candidate_id: candidateId ?? null, p_dan: dan ?? null, p_item_name: itemName ?? null, p_count: count ?? null,
  }, (d) => {
    const result = toResult(d.result);
    return result ? { count: orNull(d.count), result } : null;
  });
}

// Choose subjects (admins): the subjects a complete below-the-mark result with no D retests.
//   expectedIds = the chosen set the dialog showed (result.choice_needed ? [] : result.needs)
//   ids = the ticked subjects (1–120)
// → { status:'ok', ids (rubric order), result } · 'stale' (someone chose meanwhile) ·
//   'already_added' (a make-up of this candidate is already on a later cycle) · 'invalid' (not
//   below / has a D / not complete / a subject that doesn't apply) · 'withdrawn' · 'not_found' ·
//   'not_allowed' · 'no_access' · 'error'
export async function setMakeupSubjects({ candidateId, expectedIds, ids } = {}) {
  return callRpc('bb_set_makeup_subjects', {
    p_candidate_id: candidateId ?? null,
    p_expected_ids: Array.isArray(expectedIds) ? [...expectedIds] : null,
    p_ids: Array.isArray(ids) ? [...ids] : null,
  }, (d) => {
    const result = toResult(d.result);
    return result ? { ids: textList(d.ids), result } : null;
  });
}

// ----- Make-ups from an earlier cycle (G 24–G 27) -----

// The picker: candidates of earlier cycles whose result is a Make-up (complete or not, Q-G6).
// → { status:'ok', rows: MakeupRow[] } · 'invalid' · 'not_found' · 'no_access' · 'error'
// MakeupRow: { id, firstName, lastName, locationCode, dan, cycleId, cycleName, cycleFirstDay,
//   ageGroup ({from,to} on THIS cycle's first day), reasons, complete, needs (names), dSubjects
//   (names), choiceNeeded, alreadyAdded (a make-up of it is on this cycle already),
//   preview: { kept, retest, new, dropped, keptExtra, droppedExtra } (names) }
// rows: newest earlier cycle first, then Dan, school, last name, first name. No DOB, email or reference.
export async function loadMakeupList({ cycleId } = {}) {
  return callRpc('bb_makeup_list', { p_cycle_id: cycleId ?? null }, (d) => {
    if (!Array.isArray(d.rows)) return null;
    const rows = d.rows.map((r) => (isObj(r) && isText(r.id)
      ? {
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        locationCode: r.location_code,
        dan: r.dan,
        cycleId: r.cycle_id,
        cycleName: r.cycle_name,
        cycleFirstDay: orNull(r.cycle_first_day),
        ageGroup: bracket(r.age_group),
        reasons: textList(r.reasons),
        complete: r.complete === true,
        needs: nameList(r.needs),
        dSubjects: nameList(r.d_subjects),
        choiceNeeded: r.choice_needed === true,
        alreadyAdded: r.already_added === true,
        preview: {
          kept: nameList(r.preview?.kept),
          retest: nameList(r.preview?.retest),
          new: nameList(r.preview?.new),
          dropped: nameList(r.preview?.dropped),
          keptExtra: nameList(r.preview?.kept_extra),
          droppedExtra: nameList(r.preview?.dropped_extra),
        },
      }
      : null));
    return rows.every(Boolean) ? { rows } : null;
  });
}

// Add make-up (staff and admins): copies the earlier candidate onto this cycle with their kept
// grades and counts and the subjects to retest. Undo = api.js deleteCandidate (admins, v0.913).
// → { status:'ok', id, reference, version, keptCount, retestCount } · 'already_added' ·
//   'choice_needed' (below the mark, no subjects chosen yet) · 'stale' (the earlier result isn't a
//   make-up any more) · 'finished' (this cycle is Past) · 'invalid' · 'not_found' · 'no_access' · 'error'
export async function addMakeup({ cycleId, earlierCandidateId } = {}) {
  return callRpc('bb_add_makeup', { p_cycle_id: cycleId ?? null, p_earlier_candidate_id: earlierCandidateId ?? null }, (d) => (
    isText(d.id) && isInt(d.version)
      ? { id: d.id, reference: orNull(d.reference), version: d.version, keptCount: d.kept_count ?? 0, retestCount: d.retest_count ?? 0 }
      : null));
}

// ----- The Results tab -----

// One Dan's results, or every Dan (dan null — the printed sheet, R 38). Active candidates only.
// → { status:'ok', today, cycle (+ lastDay), rubrics (the requested Dans' public objects), danCounts,
//     rows: [GridRow + { dan, sent: { sent, matches }, hasEmail }] } · 'invalid' · 'not_found' ·
//   'no_access' · 'error'
// hasEmail = an email is on file AND its keeping time hasn't come (R 33). No DOB or money.
export async function loadResults({ cycleId, dan = null } = {}) {
  return callRpc('bb_cycle_results', { p_cycle_id: cycleId ?? null, p_dan: dan ?? null }, (d) => {
    const cycle = toCycle(d.cycle);
    if (!cycle || !isIsoDate(d.today) || !Array.isArray(d.rubrics) || !Array.isArray(d.rows)) return null;
    const rows = d.rows.map((r) => toRow(r, { withResults: true }));
    return rows.every(Boolean) ? { today: d.today, cycle, rubrics: d.rubrics, danCounts: toDanCounts(d.dan_counts), rows } : null;
  });
}

// Email result, step 2 (R 12): the ONE email of ONE candidate, read at the click. Keep it only
// until the email link is opened.
// → { status:'ok', email, kind ('passed'|'makeup_d'|'makeup_below'), firstName, lastName,
//     cycleName, dan, total, passMark, reasons, needs (names), dSubjects (names), resultKey } ·
//   'not_finished' · 'no_email' (none on file, or its keeping time has come) · 'withdrawn' ·
//   'not_found' · 'invalid' · 'no_access' · 'error'
export async function loadResultEmail({ candidateId } = {}) {
  return callRpc('bb_result_email', { p_candidate_id: candidateId ?? null }, (d) => (
    isText(d.email) && RESULT_KINDS.includes(d.kind) && isText(d.result_key)
      ? {
        email: d.email,
        kind: d.kind,
        firstName: d.first_name,
        lastName: d.last_name,
        cycleName: d.cycle_name,
        dan: d.dan,
        total: orNull(d.total),
        passMark: orNull(d.pass_mark),
        reasons: textList(d.reasons),
        needs: nameList(d.needs),
        dSubjects: nameList(d.d_subjects),
        resultKey: d.result_key,
      }
      : null));
}

// Mark as sent (staff and admins). expectedResultKey = the result_key of the result the row showed.
// → { status:'ok', sentId, markedAt } · 'stale' (the result changed meanwhile) · 'not_finished' ·
//   'no_email' · 'withdrawn' · 'not_found' · 'invalid' · 'no_access' · 'error'
export async function markSent({ candidateId, expectedResultKey } = {}) {
  return callRpc('bb_mark_result_sent', { p_candidate_id: candidateId ?? null, p_expected_result_key: expectedResultKey ?? null },
    (d) => (isText(d.sent_id) ? { sentId: d.sent_id, markedAt: orNull(d.marked_at) } : null));
}

// Undo Mark as sent: your own within 10 seconds (the toast), admins any time (after R 18's question).
// → { status:'ok' } · 'stale' (already undone) · 'not_allowed' · 'not_found' · 'invalid' ·
//   'no_access' · 'error'
export async function undoSent({ sendId } = {}) {
  return callRpc('bb_undo_result_sent', { p_send_id: sendId ?? null }, () => ({}));
}

// Download CSV (admins): the whole cycle, both schools. The database logs the download BEFORE any
// row leaves it. The file is made here, in the browser (nothing in a web address).
// → { status:'ok', cycleName, rowCount, fileName, text (UTF-8 with BOM, R 49), rows (the file's
//     rows, header first) } · 'not_allowed' · 'not_found' · 'invalid' · 'no_access' · 'error'
export async function downloadCsv({ cycleId } = {}) {
  return callRpc('bb_results_csv', { p_cycle_id: cycleId ?? null }, (d) => {
    if (!Array.isArray(d.rows)) return null;
    const rows = csvRows(d, { schoolDateOf: (iso) => (isText(iso) && !Number.isNaN(Date.parse(iso)) ? todayInSchoolTime(Date.parse(iso)) : '') });
    return {
      cycleName: d.cycle_name,
      rowCount: d.rows.length,
      fileName: csvFileName(d.cycle_name, schoolToday()),
      text: csvText(rows),
      rows,
    };
  });
}

// ----- The three result email texts (Rubric and prices, R 21–R 29) -----

// → { status:'ok', texts: { passed|makeup_d|makeup_below: { id, kind, body, version, updatedAt,
//     updatedByName } } } · 'no_access' · 'error'
export async function loadResultTexts() {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    // has_data_access goes with the read: a locked sign-in gets an EMPTY list (row-level
    // security), which must not look like "no texts".
    const [res, access] = await Promise.all([supabase.from('bb_result_texts').select(TEXT_COLUMNS), supabase.rpc('has_data_access')]);
    if (access?.error) return failure(access.error);
    if (access?.data === false) return { status: 'no_access' };
    if (access?.data !== true) return unexpected('has_data_access');
    if (res?.error) return failure(res.error);
    if (!Array.isArray(res?.data)) return unexpected('bb_result_texts');
    const texts = {};
    for (const row of res.data) {
      if (!RESULT_KINDS.includes(row?.kind) || typeof row.body !== 'string' || !isInt(row.version)) return unexpected('bb_result_texts');
      texts[row.kind] = {
        id: row.id, kind: row.kind, body: row.body, version: row.version, updatedAt: row.updated_at, updatedByName: row.updated_by_name,
      };
    }
    return RESULT_KINDS.every((k) => texts[k]) ? { status: 'ok', texts } : unexpected('bb_result_texts');
  } catch (error) {
    return failure(error);
  }
}

// Save one text (admins): stored exactly as sent; the same text writes nothing. The toast's Undo
// saves the old text back with the NEW version. A text change never resets "Sent" (R 27).
// → { status:'ok', version, body } · 'stale' (another admin saved since) · 'invalid' (a rule of
//   resultEmail.js resultTextProblem) · 'not_found' · 'not_allowed' · 'no_access' · 'error'
export async function setResultText({ kind, expectedVersion, body } = {}) {
  return callRpc('bb_set_result_text', { p_kind: kind ?? null, p_expected_version: expectedVersion ?? null, p_body: body ?? null },
    (d) => (isInt(d.version) && typeof d.body === 'string' ? { version: d.version, body: d.body } : null));
}

// ----- Edit cycle and the Rubric tab -----

// Has grading started on this cycle? (S2, Q-G1)
// → { status:'ok', hasGrading, gradingStartedAt (null = the rubric isn't locked by grading;
//     else "Locked — grading started [date]" — for good, even after every grade is cleared),
//     partsWithGrades, firstDay, firstDayFrozen, protectedDays: [{ id, date, parts }] } ·
//   'invalid' · 'not_found' · 'no_access' · 'error'
// The screens gray Save with a reason instead of failing.
export async function loadGradingState({ cycleId } = {}) {
  return callRpc('bb_cycle_grading_state', { p_cycle_id: cycleId ?? null }, (d) => {
    if (!isBool(d.has_grading) || !Array.isArray(d.protected_days)) return null;
    return {
      hasGrading: d.has_grading,
      gradingStartedAt: orNull(d.grading_started_at),
      partsWithGrades: GRADED_PARTS.filter((p) => textList(d.parts_with_grades).includes(p)),
      firstDay: orNull(d.first_day),
      firstDayFrozen: d.first_day_frozen === true,
      protectedDays: d.protected_days
        .filter((x) => isObj(x) && isText(x.id))
        .map((x) => ({ id: x.id, date: orNull(x.day_date), parts: PARTS.filter((p) => textList(x.parts).includes(p)) })),
    };
  });
}

