// gradingCore.js — the real work behind gradingApi.js (every database call of Star testing GRADING)
// and the PURE grading rules the screens and the save engine use (build phase 5).
// Why it exists: gradingApi.js imports the app's one connection (supabase.js), which reads Vite
// settings that don't exist when Node runs the checks. Keeping the logic here — with the client
// passed in — lets star/gradingChecks.mjs run the exact same code against the preview database
// (mockStarCandidates.js + mockStarGrading.js) without a browser. The screens import gradingApi.js
// (its header comment is the API); the save engine (useStarGradingSaves.js) imports the pure rules.
//
// Contract 0006: §5.5 (the result — the ONLY source of Total and Result; the screens never work out
// a result, v0.158), §6.5 (star_set_grade / star_set_count / star_set_makeup_subjects), §7
// (star_event_results, star_age_groups, star_candidate_detail). Every call returns a plain object
// with a `status` CODE and NEVER throws.
//
// PRIVACY (v0.160, v0.506): nothing here passes on a date of birth, an email or a payment. The
// private page's read uses star_candidate_detail (the only read with one candidate's details) and
// keeps ONLY the grading fields from it.
import { toResult, toSent } from './candidatesCore.js';
import { shortStartTime } from './starEventRules.js';
import * as T from './gradingText.js';

// Every status a grading call can return ('duplicate_name' is in 0006's shared exception list; a
// grading function never expects it, but it gets handled instead of looking like a dropped line).
export const STAR_GRADING_STATUSES = ['ok', 'no_access', 'not_allowed', 'invalid', 'not_found', 'withdrawn', 'stale', 'kept', 'duplicate_name', 'error'];
const SERVER_STATUSES = /*#__PURE__*/ (() => new Set(STAR_GRADING_STATUSES.filter((s) => s !== 'error')))();
export const GRADE_LETTERS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];
// The two class counts: the app's name → the database's p_field.
export const COUNT_FIELDS = { classesAttended: 'classes_attended', assistantClasses: 'assistant_classes' };

const failure = (error) => ({ status: 'error', error }); // error: for the console and checks only
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_PATTERN.test(v);
const isInt = (v) => Number.isInteger(v);
// What the Grading screens read from the roster view: no fee, DOB or email columns.
const GRID_ROSTER_COLUMNS = 'id, classes_attended, is_makeup, makeup_of_event_name';

// ----- Converting answers -----

// One grid row: the candidate's names and grading fields + the result (§5.5) in camelCase.
//   { id, firstName, lastName, locationCode, dan, starsFrom, starsTo, isMakeup, makeupOfEventName,
//     classesAttended, assistantClasses, result, sent }
function toGridRow(r, roster) {
  const extra = roster.get(r.candidate_id) ?? {};
  const result = toResult(r);
  return {
    id: r.candidate_id,
    firstName: r.first_name,
    lastName: r.last_name,
    locationCode: r.location_code,
    dan: r.dan,
    starsFrom: r.stars_from,
    starsTo: r.stars_to,
    isMakeup: extra.is_makeup === true,
    makeupOfEventName: extra.makeup_of_event_name ?? null,
    classesAttended: extra.classes_attended ?? null,
    assistantClasses: result.ai.count, // the result carries it (it decides Assistant Instructor)
    result,
    sent: toSent(r.sent),
  };
}

// Builds the API around a client. getClient() returns the Supabase client (or a look-alike), or null.
export function createStarGradingApi(getClient, nowMs = () => Date.now()) {
  // Calls one database function → { status, … }. readOk(data) converts an ok answer (null = wrong shape).
  async function callRpc(name, args, readOk) {
    try {
      const client = getClient();
      if (!client) return failure(new Error('No connection is set up'));
      const { data, error } = await client.rpc(name, args);
      if (error) return failure(error);
      const status = data?.status;
      if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return unexpected(name);
      if (status !== 'ok') return { status };
      const result = readOk(data);
      return result ? { status: 'ok', ...result } : unexpected(name);
    } catch (error) {
      return failure(error);
    }
  }
  // An id that isn't a uuid can't exist → 'not_found' without asking (null → 'invalid', like the SQL).
  const idProblem = (...ids) => (ids.some((v) => v === null || v === undefined) ? 'invalid' : ids.some((v) => !isUuid(v)) ? 'not_found' : null);
  const readResult = (d) => (d.result && typeof d.result === 'object' ? { result: toResult(d.result) } : null);

  // ----- Reading -----

  // The Grading tab: every Dan the caller asks for (the event copy's Dans), ONE call per Dan
  // (star_event_results), plus the roster's class counts. Private candidates (a private day set) are
  // LEFT OUT of every Dan's rows — they're graded on their own page (v0.151), and the Dan counts show
  // only who is in the grid (v0.153).
  //   → { status:'ok', loadedAt, dans: { [dan]: { dan, passMark, maxScore, rows:[GridRow] } } }
  // loadedAt = when the reads STARTED (ms): the save engine trusts only data read after a save answered.
  async function loadGrading(eventId, dans) {
    const loadedAt = nowMs();
    const bad = idProblem(eventId);
    if (bad) return { status: bad };
    if (!Array.isArray(dans) || !dans.every(isInt)) return { status: 'invalid' };
    try {
      const client = getClient();
      if (!client) return failure(new Error('No connection is set up'));
      const [answers, rosterRes] = await Promise.all([
        Promise.all(dans.map((dan) => callRpc('star_event_results', { p_event_id: eventId, p_dan: dan },
          (d) => (Array.isArray(d.rows) ? { data: d } : null)))),
        client.from('star_roster').select(GRID_ROSTER_COLUMNS).eq('event_id', eventId),
      ]);
      const refused = answers.find((a) => a.status !== 'ok');
      if (refused) return refused; // no_access, not_found, invalid, error …
      if (rosterRes?.error) return failure(rosterRes.error);
      if (!Array.isArray(rosterRes?.data)) return unexpected('star_roster');
      const roster = new Map(rosterRes.data.map((r) => [r.id, r]));
      const out = {};
      answers.forEach(({ data: d }, i) => {
        out[dans[i]] = {
          dan: dans[i],
          passMark: Number(d.pass_mark),
          maxScore: Number(d.max_score),
          rows: d.rows.filter((r) => !r.private).map((r) => toGridRow(r, roster)),
        };
      });
      return { status: 'ok', loadedAt, dans: out };
    } catch (error) {
      return failure(error);
    }
  }

  // The private grading page: ONE candidate (star_candidate_detail), keeping only grading fields.
  //   → { status:'ok', loadedAt, row: GridRow + { eventId, danLabel, privateOn, privateTime, status } }
  async function loadPrivateGrading(candidateId) {
    const loadedAt = nowMs();
    const bad = idProblem(candidateId);
    if (bad) return { status: bad };
    return callRpc('star_candidate_detail', { p_candidate_id: candidateId }, (d) => {
      const c = d.candidate;
      if (!c || !isUuid(c.id) || !d.result) return null;
      const result = toResult(d.result);
      return {
        loadedAt,
        row: {
          id: c.id,
          eventId: c.event_id,
          firstName: c.first_name,
          lastName: c.last_name,
          locationCode: c.location_code,
          dan: c.dan,
          danLabel: c.dan_label,
          starsFrom: c.stars_from,
          starsTo: c.stars_to,
          status: c.status, // 'active' | 'withdrawn'
          isMakeup: c.is_makeup === true,
          makeupOfEventName: c.makeup_of_event_name ?? null,
          privateOn: c.private_on ?? null,
          privateTime: c.private_time ? shortStartTime(c.private_time) : null,
          classesAttended: c.classes_attended ?? null,
          assistantClasses: c.assistant_classes ?? null,
          result,
          sent: toSent(d.sent),
        },
      };
    });
  }

  // After a `stale` grade answer: which Dan is this candidate in now? (for "moved to 2nd Dan")
  //   → { status:'ok', dan, danLabel, candidateStatus }
  async function loadCandidateDan(candidateId) {
    const bad = idProblem(candidateId);
    if (bad) return { status: bad };
    return callRpc('star_candidate_detail', { p_candidate_id: candidateId }, (d) => (d.candidate && isInt(d.candidate.dan)
      ? { dan: d.candidate.dan, danLabel: d.candidate.dan_label ?? null, candidateStatus: d.candidate.status } : null));
  }

  // 'child' | 'adult' per active candidate (never a DOB or an age).  → { status:'ok', groups: { [id]: group } }
  async function loadAgeGroups(eventId) {
    const bad = idProblem(eventId);
    if (bad) return { status: bad };
    return callRpc('star_age_groups', { p_event_id: eventId }, (d) => (Array.isArray(d.rows)
      ? { groups: Object.fromEntries(d.rows.map((r) => [r.candidate_id, r.age_group])) } : null));
  }

  // ----- Writing (§6.5) -----

  // grade: 'A+' … 'D', or null = clear.  → { status:'ok', grade, result } · invalid · not_found ·
  // withdrawn · stale (another Dan now) · kept · no_access · error
  async function setGrade({ candidateId, eventCategoryId, grade = null } = {}) {
    const bad = idProblem(candidateId, eventCategoryId);
    if (bad) return { status: bad };
    if (grade !== null && !GRADE_LETTERS.includes(grade)) return { status: 'invalid' };
    return callRpc('star_set_grade', { p_candidate_id: candidateId, p_event_category_id: eventCategoryId, p_grade: grade },
      (d) => (d.result ? { grade: d.grade ?? null, result: toResult(d.result) } : null));
  }

  // field: 'classesAttended' | 'assistantClasses'; value 0–999 or null (= not entered).
  //   → { status:'ok', result } · invalid · not_found · withdrawn · no_access · error
  async function setCount({ candidateId, field, value = null } = {}) {
    const bad = idProblem(candidateId);
    if (bad) return { status: bad };
    if (!(field in COUNT_FIELDS) || (value !== null && !isInt(value))) return { status: 'invalid' };
    return callRpc('star_set_count', { p_candidate_id: candidateId, p_field: COUNT_FIELDS[field], p_value: value }, readResult);
  }

  // Admin: the subjects a below-the-pass-mark make-up retests (v0.130). expectedCategoryIds = the
  // chosen set the screen showed (result.needsIds while choiceNeeded is false, else []).
  //   → { status:'ok', result } · not_allowed · invalid · not_found · stale · withdrawn · no_access · error
  async function setMakeupSubjects({ candidateId, expectedCategoryIds, categoryIds } = {}) {
    const bad = idProblem(candidateId);
    if (bad) return { status: bad };
    if (!Array.isArray(expectedCategoryIds) || !Array.isArray(categoryIds)) return { status: 'invalid' };
    if (![...expectedCategoryIds, ...categoryIds].every(isUuid)) return { status: 'invalid' };
    return callRpc('star_set_makeup_subjects', {
      p_candidate_id: candidateId, p_expected_category_ids: expectedCategoryIds, p_category_ids: categoryIds,
    }, readResult);
  }

  return { loadGrading, loadPrivateGrading, loadCandidateDan, loadAgeGroups, setGrade, setCount, setMakeupSubjects };
}

// =====================================================================================
// Pure rules (no database). The screens and the save engine use these; gradingChecks.mjs checks them.
// =====================================================================================

// The event copy's letters in order (eventsApi loadStarEvent → copy.grades). A+ … D.
export function gradeLetters(copy) {
  const rows = [...(copy?.grades ?? [])].sort((a, b) => a.position - b.position).map((g) => g.grade);
  return rows.length > 0 ? rows : [...GRADE_LETTERS];
}

// The judged subjects (grid columns) of a Dan, from the event copy (copy.dans[].categories) — Assistant
// Instructor is not a column (v0.126). [{ id, name, credits, position }]
export function judgedSubjects(copy, dan) {
  const d = (copy?.dans ?? []).find((x) => x.dan === dan);
  return [...(d?.categories ?? [])].filter((k) => !k.fromClassCount).sort((a, b) => a.position - b.position);
}

// Choosing the cell's own grade again clears it (v0.125).
export const toggleGrade = (current, chosen) => (chosen === current ? null : chosen);

// A cell's value in a loaded row: kind 'grade' (target = eventCategoryId) or 'count' (target =
// 'classesAttended' | 'assistantClasses'). undefined when the row doesn't have that subject.
export function serverValue(row, kind, target) {
  if (!row) return undefined;
  if (kind === 'count') return target === 'classesAttended' ? row.classesAttended ?? null : row.result?.ai?.count ?? row.assistantClasses ?? null;
  const s = row.result?.subjects?.find((x) => x.eventCategoryId === target);
  return s ? s.grade : undefined;
}
// Is that grade cell a kept make-up grade? (no dropdown; a note instead, proposal 9)
export function keptSubject(row, eventCategoryId) {
  const s = row?.result?.subjects?.find((x) => x.eventCategoryId === eventCategoryId);
  return s && s.kept ? s : null;
}

// "N of M left" (proposal 26). A normal candidate: every subject the result needs, Assistant
// Instructor included (the database's `missing` list). A make-up: its retest subjects, plus Assistant
// Instructor only while its class count is empty.
export function leftOfCount(result, isMakeup) {
  if (!result) return { left: 0, of: 0 };
  if (!isMakeup) return { left: result.missing.length, of: result.subjectCount };
  const counted = result.subjects.filter((s) => s.retest || (s.fromClassCount && result.ai.count === null));
  return { left: counted.filter((s) => s.grade === null).length, of: counted.length };
}

// The Result column (proposal 25 and the H6 table). Returns
//   { tone: 'green'|'amber'|'gray', text, link: 'choose_subjects'|null, after: string|null }
//   link: an admin's "Choose subjects" link after the text; after: staff's gray "· an admin chooses subjects".
// save = { grades, counts, retrying }: this row's cells that are Not saved now (the engine's rowSave()).
export function resultTag(result, { isMakeup = false, isAdmin = false, save = null } = {}) {
  const unsaved = save ? save.grades + save.counts : 0;
  if (unsaved > 0) {
    return save.retrying ? { tone: 'gray', text: T.RESULT_SAVING, link: null, after: null }
      : { tone: 'amber', text: T.notSavedTag(save.grades, save.counts), link: null, after: null };
  }
  if (!result) return { tone: 'gray', text: '', link: null, after: null };
  switch (result.status) {
    case 'passed':
      return { tone: 'green', text: T.RESULT_PASSED, link: null, after: null };
    case 'makeup':
      if (result.makeupReasons.includes('d')) return { tone: 'amber', text: T.makeupD(result.dSubjects), link: null, after: null };
      if (result.choiceNeeded) {
        return isAdmin ? { tone: 'amber', text: T.makeupBelow(result.passMark), link: 'choose_subjects', after: null }
          : { tone: 'amber', text: T.makeupBelow(result.passMark), link: null, after: T.ADMIN_CHOOSES };
      }
      return { tone: 'amber', text: T.makeupRetests(result.needs), link: null, after: null };
    case 'withdrawn':
      return { tone: 'gray', text: T.RESULT_WITHDRAWN, link: null, after: null };
    default: {
      // not_finished / testing_privately: "N of M left", or "Not started" when nothing counted is graded
      const { left, of } = leftOfCount(result, isMakeup);
      return { tone: 'gray', text: left === of ? T.RESULT_NOT_STARTED : T.leftOf(left, of), link: null, after: null };
    }
  }
}

// The Total column: complete → "280"; a make-up's running total → "250 so far"; else "—".
export function totalText(result, isMakeup) {
  if (!result) return T.TOTAL_NONE;
  if (result.complete) return T.scoreText(result.total);
  return isMakeup && result.gradedCount > 0 ? T.totalSoFar(result.total) : T.TOTAL_NONE;
}

// After a choice: the next cell (proposal 28) — the next editable cell to the RIGHT in the same row;
// at the end of a row, the next row's first EMPTY editable cell (rows without one are skipped).
//   rows: grid rows in screen order · subjectIds: the column ids in order · from: { rowId, categoryId }
//   isEditable(row, categoryId) (false for kept cells) · isEmpty(row, categoryId)
// → { rowId, categoryId } or null (nothing left).
export function nextCell(rows, subjectIds, from, isEditable, isEmpty) {
  const r = rows.findIndex((row) => row.id === from.rowId);
  if (r < 0) return null;
  const c = subjectIds.indexOf(from.categoryId);
  for (let j = c + 1; j < subjectIds.length; j += 1) {
    if (isEditable(rows[r], subjectIds[j])) return { rowId: rows[r].id, categoryId: subjectIds[j] };
  }
  for (let i = r + 1; i < rows.length; i += 1) {
    const id = subjectIds.find((k) => isEditable(rows[i], k) && isEmpty(rows[i], k));
    if (id) return { rowId: rows[i].id, categoryId: id };
  }
  return null;
}

// Typing grades on a PC (proposal 28): A, B, C, D then "+". A small state machine, so the screen
// only does what it's told:
//   typingStep(state, key, letters) → { state, effects: [{ type:'set', grade } | { type:'clear' } | { type:'move' }] }
//   state = { pending: 'A'|'B'|'C'|null } — a letter just typed into THIS cell that "+" may still raise.
//   A / B / C   (another letter pending: move first) set the letter; it stays pending
//   D           (pending: move first) set D, then move (D has no "+")
//   +           pending → set "A+" / "B+" / "C+", then move; else nothing
//   Enter, Tab  pending → move
//   Delete, Backspace → clear (no move)
// Anything else (arrows: the screen moves itself): pending is forgotten. Letters not in the event's
// copy are ignored. Each "set" is one save (A then A+ = two saves of one cell; the engine sends only
// the newest if the first is still on its way).
export function typingStep(state, key, letters = GRADE_LETTERS) {
  const pending = state?.pending ?? null;
  const k = typeof key === 'string' && key.length === 1 ? key.toUpperCase() : key;
  const has = (g) => letters.includes(g);
  if (k === 'A' || k === 'B' || k === 'C') {
    if (!has(k)) return { state: { pending }, effects: [] };
    return { state: { pending: k }, effects: [...(pending ? [{ type: 'move' }] : []), { type: 'set', grade: k }] };
  }
  if (k === 'D') {
    if (!has('D')) return { state: { pending }, effects: [] };
    return { state: { pending: null }, effects: [...(pending ? [{ type: 'move' }] : []), { type: 'set', grade: 'D' }, { type: 'move' }] };
  }
  if (k === '+') {
    if (!pending || !has(`${pending}+`)) return { state: { pending: null }, effects: [] };
    return { state: { pending: null }, effects: [{ type: 'set', grade: `${pending}+` }, { type: 'move' }] };
  }
  if (k === 'Enter' || k === 'Tab') return { state: { pending: null }, effects: pending ? [{ type: 'move' }] : [] };
  if (k === 'Delete' || k === 'Backspace') return { state: { pending: null }, effects: [{ type: 'clear' }] };
  return { state: { pending: null }, effects: [] };
}

// ----- The save engine's pure part (useStarGradingSaves.js) -----

// A cell's key in the engine: "<candidateId>|grade|<eventCategoryId>" or "<candidateId>|count|<field>".
export const cellKey = (candidateId, kind, target) => `${candidateId}|${kind}|${target}`;
export function parseCellKey(key) {
  const [candidateId, kind, target] = key.split('|');
  return { candidateId, kind, target };
}

// Before a retry (proposal 4): compare the cell with its latest refreshed value.
//   base    the database's value when this device's choice was made
//   wanted  this device's choice
//   latest  the value in the newest data read AFTER the choice (undefined: no refresh since)
// → 'send' (nothing changed meanwhile) · 'already_saved' (the database already holds this device's
//   choice: an earlier save went through but its answer was lost) · 'changed_elsewhere' (someone else
//   changed the cell: drop the retry, show their value and the gray note).
export function retryDecision({ base, wanted, latest }) {
  if (latest === undefined) return 'send';
  if (latest === wanted) return 'already_saved';
  if (latest !== base) return 'changed_elsewhere';
  return 'send';
}

// Is a Not saved cell ready for a retry? Only once a refresh that STARTED after the failure has
// answered (proposal 4): otherwise retryDecision would compare with data older than the failure, and
// a value another device saved in the meantime could be overwritten.
//   entry: { state, inFlight, failedAt (ms, when the save failed), checkedAt (ms, when the newest read
//   that set `latest` started) }
export function retryReady(entry) {
  if (!entry || entry.state !== 'unsaved' || entry.inFlight) return false;
  if (entry.failedAt === null || entry.failedAt === undefined) return false;
  return entry.checkedAt !== null && entry.checkedAt !== undefined && entry.checkedAt > entry.failedAt;
}

// What fresh data does to one overlay cell (the engine runs it on every successful read).
//   entry: the cell's overlay entry · loadedAt: when the read STARTED (ms) · latest: the cell's value in
//   that read (undefined when the row isn't in it)
// → 'drop' (a saved cell whose answer is older than the read: the read shows it now) · 'check' (record
//   `latest` and `checkedAt`) · 'keep' (the read is too old to tell anything, or a save is on its way)
export function refreshStep(entry, loadedAt, latest) {
  if (entry.inFlight) return 'keep';
  if (entry.state === 'saved') return entry.answeredAt !== null && loadedAt > entry.answeredAt ? 'drop' : 'keep';
  if (loadedAt > entry.chosenAt && latest !== undefined) return 'check';
  return 'keep';
}

// After a save answered: does the answer still belong to what the cell shows?
//   what: answerKind's answer (after the Dan check) · sentValue: the value that save sent ·
//   wanted: the cell's newest choice now
// → 'send_newer' when the grader picked another value while it was on its way. Whatever the answer
//   (saved, failed, or refused: kept / withdrawn / invalid / stale …), only the state of THAT send is
//   cleared and the newer pick is sent; its own answer decides (a refusal then shows its banner).
//   A 'lock' (no_access) always wins: the screen locks and the newer pick waits as Not saved.
//   Otherwise → `what` itself.
export function answerStep(what, sentValue, wanted) {
  if (what !== 'lock' && wanted !== sentValue) return 'send_newer';
  return what;
}

// What a save answer means for the engine:
//   'saved'     ok — show the database's result
//   'retry'     error (a dropped connection) — Not saved, retried every 10 s
//   'lock'      no_access — lock the screen; the cell stays Not saved
//   'refused'   kept / withdrawn / invalid / not_found / not_allowed / duplicate_name — never retried:
//               banner with ✕, the cell goes back, the grid reloads
//   'check_dan' stale — a grade for another Dan than the candidate's current one (moved on another
//               device, v0.164): look the Dan up; if it really changed it's 'refused', else a rare lock
//               problem → 'retry'. (star_set_count has no stale of its own: always 'retry'.)
export function answerKind(status, kind) {
  if (status === 'ok') return 'saved';
  if (status === 'error') return 'retry';
  if (status === 'no_access') return 'lock';
  if (status === 'stale') return kind === 'grade' ? 'check_dan' : 'retry';
  return 'refused';
}

// The banner for a refused answer (H2, proposals 10–12). name: "Mia Patel"; newDanLabel: after a
// Dan change ("2nd Dan"), or null when it couldn't be read.
export function refusalText(status, kind, name, newDanLabel = null) {
  if (status === 'kept') return T.KEPT_REFUSED;
  if (status === 'stale') return newDanLabel ? T.movedToDan(name, newDanLabel) : T.changedElsewhereRow(name);
  if (status === 'withdrawn') return kind === 'count' ? T.removedFromTestingCount(name) : T.removedFromTesting(name);
  return kind === 'count' ? T.COUNT_RELOADED : T.GRADE_RELOADED;
}

// Sums the Not saved cells for the banner, the leave question and the Dan switch's ⚠.
//   entries: { [cellKey]: { state } } (the engine's overlay) · rows: the loaded rows (every Dan + the
//   private one), in screen order (Dan, then belt order) · subjectName(row, categoryId)
// → { grades, counts, names (candidates, screen order), people: [{ id, name, dan, isPrivate, items }],
//     dans: [dan] (grid rows only) }
export function unsavedSummary(entries, rows, subjectName = () => '') {
  let grades = 0;
  let counts = 0;
  const byId = new Map();
  for (const [key, e] of Object.entries(entries ?? {})) {
    if (e.state !== 'unsaved' && e.state !== 'retrying') continue;
    const { candidateId, kind, target } = parseCellKey(key);
    if (kind === 'grade') grades += 1;
    else counts += 1;
    if (!byId.has(candidateId)) byId.set(candidateId, []);
    byId.get(candidateId).push({ kind, target });
  }
  const people = [];
  for (const row of rows ?? []) {
    const cells = byId.get(row.id);
    if (!cells) continue;
    byId.delete(row.id);
    const order = (c) => (c.kind === 'count' ? 1000 + (c.target === 'classesAttended' ? 0 : 1)
      : row.result?.subjects?.find((s) => s.eventCategoryId === c.target)?.position ?? 999);
    const items = [...cells].sort((a, b) => order(a) - order(b)).map((c) => (c.kind === 'count'
      ? (c.target === 'classesAttended' ? T.COUNT_CLASSES_ATTENDED : T.COUNT_ASSISTANT_CLASSES)
      : subjectName(row, c.target)));
    people.push({ id: row.id, name: `${row.firstName} ${row.lastName}`, dan: row.dan, isPrivate: Boolean(row.privateOn), items });
  }
  // The Dan switch's warning: grid rows only. A private candidate (the private page's row, privateOn
  // set) is never on the Grading tab's grid (v0.151), so their Not saved cells don't mark a Dan; the
  // leave question still counts them (grades, counts, names, people).
  const dans = [...new Set(people.filter((p) => !p.isPrivate).map((p) => p.dan))].sort((a, b) => a - b);
  return { grades, counts, names: people.map((p) => p.name), people, dans };
}
