// mockGrading.js — the PREVIEW (fake) database's part for Black Belt GRADING and RESULTS
// (migration 0025, contract 0025 §13.3). mockBlackBelt.js builds it once and adds its functions
// to its own, so `npm run dev:preview-mode` has every new database function with the SAME order
// of checks, the same status codes, the same staff / admin splits and the same privacy as the
// real database (contract §1.2, §5, §7, §9).
// Why it exists: preview mode runs without Supabase. What you see in preview must be what the real
// dashboard will do — so the result here is grading.js gradeResult (the JS twin of the SQL's
// bb_grade_result) and Add make-up uses grading.js keptMatch, exactly as the SQL uses its own.
//
// It is a "pure core" like mockBlackBelt.js: it never touches the browser by itself.
//   const part = createGradingPart(env)   env = mockBlackBelt's own helpers (see the bottom of
//                                         createBlackBeltBackend), so both share one store
//   part.handlers                         the new staff functions (contract §7.1, §7.2)
//   part.<helper>                         what mockBlackBelt's replaced 0016 / 0024 functions need
//                                         (has grades?, grading started?, the purge chain …)
//
// The store's new lists (snake_case columns exactly as 0025 §2):
//   bb_grades, bb_extra_counts, bb_makeup_subjects     grading rows (never readable)
//   bb_result_sends, bb_downloads                       Mark as sent, the CSV log (never readable)
//   bb_cycle_grading_started                            the rubric lock "for good" (never readable)
//   bb_result_texts                                     the three email texts (readable columns, §8)
// and three new bb_candidates columns: makeup_of_candidate_id, makeup_of_cycle_name, age_kept
// (never readable).
//
// The database's guard triggers (§5) are rules of each table there; here the functions are the only
// writers, so each function makes the same checks before it writes. The SQL's "for share" locks
// have no meaning in a one-tab fake (one call runs at a time).
//
// PRIVACY (§9): the grid and the Results never answer a date of birth, an email, a reference,
// money or an age; bb_result_email answers ONE email; only bb_results_csv answers dates of birth,
// emails and money (admins), and it writes its log row first. From the purge day on, a DOB and an
// email count as gone even before the purge ran.
import {
  gradeResult, withdrawnResult, keptMatch, ageGroupOf, subjectIndex, subjectNames, danSubjects, minutesFromText,
  MEASURED_MAX, COUNT_MAX,
} from './grading.js';
import { partLetters, rubricPublic } from './rubric.js';
import { STARTING_TEXTS, RESULT_KINDS, resultTextProblem } from './resultEmail.js';
import { ageOn, firstDayOf } from './rules.js';

// ----- What mockBlackBelt merges into its own lists -----

const ID = (name) => [name, 'uuid'];
// The new functions' exact arguments (contract §17).
export const GRADING_RPC_ARGS = {
  bb_set_grade: [ID('p_candidate_id'), ['p_dan', 'int'], ['p_subject_id', 'text'], ['p_letter', 'text']],
  bb_set_measured: [ID('p_candidate_id'), ['p_dan', 'int'], ['p_subject_id', 'text'], ['p_value', 'numeric'], ['p_way', 'int']],
  bb_set_extra_count: [ID('p_candidate_id'), ['p_dan', 'int'], ['p_item_name', 'text'], ['p_count', 'int']],
  bb_set_makeup_subjects: [ID('p_candidate_id'), ['p_expected_ids', 'text[]'], ['p_ids', 'text[]']],
  bb_add_makeup: [ID('p_cycle_id'), ID('p_earlier_candidate_id')],
  bb_mark_result_sent: [ID('p_candidate_id'), ['p_expected_result_key', 'text']],
  bb_undo_result_sent: [ID('p_send_id')],
  bb_set_result_text: [['p_kind', 'text'], ['p_expected_version', 'int'], ['p_body', 'text']],
  bb_update_candidate_clear: [ID('p_candidate_id'), ['p_expected_version', 'int'], ['p_first', 'text'], ['p_last', 'text'],
    ['p_date_of_birth', 'date'], ['p_email', 'text'], ['p_location_code', 'text'], ['p_dan', 'int'],
    ['p_expected_grade_count', 'int'], ['p_expected_count_count', 'int'], ['p_expected_chosen_count', 'int']],
  bb_grading_grid: [ID('p_cycle_id'), ['p_dan', 'int']],
  bb_cycle_results: [ID('p_cycle_id'), ['p_dan', 'int']],
  bb_makeup_list: [ID('p_cycle_id')],
  bb_result_email: [ID('p_candidate_id')],
  bb_results_csv: [ID('p_cycle_id')],
  bb_cycle_grading_state: [ID('p_cycle_id')],
};
// A = admins only (checked right after has_data_access, before anything is read).
export const GRADING_ADMIN_ONLY = ['bb_set_makeup_subjects', 'bb_set_result_text', 'bb_results_csv'];
// The writes (failNextSave fails the next one; a read-only GET call is refused). bb_results_csv
// writes its log row, so it is one too.
export const GRADING_WRITE_RPC_NAMES = ['bb_set_grade', 'bb_set_measured', 'bb_set_extra_count', 'bb_set_makeup_subjects', 'bb_add_makeup',
  'bb_mark_result_sent', 'bb_undo_result_sent', 'bb_set_result_text', 'bb_update_candidate_clear', 'bb_results_csv'];
// 0025's internal helpers and trigger functions: executable by nobody (§8).
export const GRADING_RESTRICTED = ['bb_grade_result', 'bb_age_groups', 'bb_measured_letter', 'bb_extra_points', 'bb_kept_match',
  'bb_result_text_problem', 'bb_candidate_age', 'bb_candidate_grading_input', 'bb_candidate_result', 'bb_candidate_result_with',
  'bb_cycle_has_grading', 'bb_cycle_grading_started_at', 'bb_candidate_has_grades', 'bb_sent_state', 'bb_lock_candidate_shared',
  'bb_update_candidate_core', 'bb_note_grading_started', 'bb_cycle_grading_started_guard', 'bb_candidates_keep_age', 'bb_grades_rules',
  'bb_extra_counts_rules', 'bb_makeup_subjects_rules', 'bb_result_sends_guard', 'bb_downloads_guard', 'bb_payments_makeup_guard',
  'bb_cycle_days_grading', 'bb_cycle_day_parts_grading'];
// The new tables: readable columns (GRANTED) and the rest (HIDDEN: asking for them is "permission
// denied"). Only bb_result_texts has granted columns (§8). (Written out in full, without spreads,
// so the live build can drop this file completely — v0.917's check.)
export const GRADING_GRANTED = {
  bb_grades: [], bb_extra_counts: [], bb_makeup_subjects: [], bb_result_sends: [], bb_downloads: [], bb_cycle_grading_started: [],
  bb_result_texts: ['id', 'kind', 'body', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'],
};
export const GRADING_HIDDEN = {
  bb_grades: ['id', 'candidate_id', 'dan', 'part_code', 'subject_id', 'letter', 'measured', 'way', 'kept', 'kept_from_cycle_id',
    'kept_from_cycle_name', 'version', 'created_at', 'updated_at', 'created_by', 'updated_by', 'created_by_name', 'updated_by_name'],
  bb_extra_counts: ['id', 'candidate_id', 'dan', 'item_name', 'count', 'kept', 'kept_from_cycle_id', 'kept_from_cycle_name', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by', 'created_by_name', 'updated_by_name'],
  bb_makeup_subjects: ['id', 'candidate_id', 'dan', 'subject_id', 'kind', 'version', 'created_at', 'updated_at', 'created_by', 'updated_by',
    'created_by_name', 'updated_by_name'],
  bb_result_sends: ['id', 'candidate_id', 'marked_at', 'marked_by', 'marked_by_name', 'result_status', 'result_total', 'result_needs',
    'result_key', 'undone_at', 'undone_by', 'undone_by_name'],
  bb_downloads: ['id', 'cycle_id', 'cycle_name', 'row_count', 'downloaded_at', 'downloaded_by', 'downloaded_by_name'],
  bb_cycle_grading_started: ['id', 'cycle_id', 'started_at', 'started_by', 'started_by_name'],
  bb_result_texts: ['created_by', 'updated_by'],
};
// The new bb_candidates columns nobody may read (§8).
export const MAKEUP_CANDIDATE_COLUMNS = ['makeup_of_candidate_id', 'makeup_of_cycle_name', 'age_kept'];
// Every new store list.
export const GRADING_LISTS = /* @__PURE__ */ Object.keys(GRADING_GRANTED);

const SUBJECT_ID = /^[a-z0-9]{8}$/;
const SEND_UNDO_MS = 10 * 1000; // staff undo their own Mark as sent within 10 seconds (R 15)
const MAX_CHOSEN = 120;
const GRADED_PARTS = ['physical', 'technical', 'curriculum', 'other'];

const st = (status) => ({ status });
const clone = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byId = (a, b) => cmp(a.id, b.id);
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
// at most 4 decimals, and not more (§1.4: refused, never rounded)
const fourDecimals = (v) => Math.round(v * 10000) / 10000 === v;

// ----- The part -----

export function createGradingPart(env) {
  const {
    newId, stamp, clock, today, house, updateRow, findCycle, findCandidate, daysOf, partsOf, stateOf, rosterOrder, collate,
    recheckDuplicate, recheckPointingAt, findDuplicate, purge, moneyOf, settings, purgeDueOnOwn, SEED_ACTOR,
  } = env;

  // The three seeded texts (§2.4: tag bb_seed, actor "Database admin").
  function seedTexts(at = stamp()) {
    return RESULT_KINDS.map((kind) => ({ id: newId(), kind, body: STARTING_TEXTS[kind], ...house(SEED_ACTOR, at) }));
  }
  // An older preview store gets the new lists (and the seeded texts) when it is read.
  function upgradeStore(store) {
    if (!isObj(store)) return;
    for (const list of GRADING_LISTS) if (!Array.isArray(store[list])) store[list] = list === 'bb_result_texts' ? seedTexts() : [];
    for (const c of Array.isArray(store.bb_candidates) ? store.bb_candidates : []) {
      if (!isObj(c)) continue;
      for (const col of MAKEUP_CANDIDATE_COLUMNS) if (!(col in c)) c[col] = null;
    }
  }

  // ----- Lookups -----

  const firstDayOfCycle = (db, cycleId) => firstDayOf(daysOf(db, cycleId));
  const lastDayOfCycle = (db, cycleId) => {
    const days = daysOf(db, cycleId);
    return days.length ? days[days.length - 1].day_date : null;
  };
  // The Dan object of a cycle's copy (null if the cycle is gone).
  const danOf = (db, cycleId, dan) => findCycle(db, cycleId)?.requirements?.dans?.[dan - 1] ?? null;
  const gradesOf = (db, candidateId, dan = null) => db.bb_grades.filter((g) => g.candidate_id === candidateId && (dan === null || g.dan === dan));
  const countsOf = (db, candidateId, dan = null) => db.bb_extra_counts.filter((g) => g.candidate_id === candidateId && (dan === null || g.dan === dan));
  const subjectsOf = (db, candidateId, dan = null, kind = null) => db.bb_makeup_subjects
    .filter((g) => g.candidate_id === candidateId && (dan === null || g.dan === dan) && (kind === null || g.kind === kind));
  const activeMakeupsOf = (db, candidateId) => db.bb_candidates.filter((x) => x.makeup_of_candidate_id === candidateId && x.status === 'active');

  // §4.3 bb_candidate_age: the age on the row's OWN cycle's first day from the DOB, else age_kept.
  // Used only inside (it never leaves the "database").
  function candidateAge(db, c) {
    const fromDob = ageOn(c.date_of_birth, firstDayOfCycle(db, c.cycle_id));
    if (fromDob !== null) return fromDob;
    return Number.isInteger(c.age_kept) ? c.age_kept : null;
  }

  // §7.0 bb_candidate_grading_input: { grades, counts, retest, chosen } of one Dan.
  function gradingInput(db, c, dan = c.dan) {
    return {
      grades: gradesOf(db, c.id, dan).sort(byId).map((g) => ({
        subject_id: g.subject_id, letter: g.letter, measured: g.measured, way: g.way, kept: g.kept, kept_from_cycle_name: g.kept_from_cycle_name,
      })),
      counts: countsOf(db, c.id, dan).sort(byId).map((g) => ({ item_name: g.item_name, count: g.count, kept: g.kept })),
      retest: subjectsOf(db, c.id, dan, 'retest').map((g) => g.subject_id),
      chosen: subjectsOf(db, c.id, dan, 'chosen').map((g) => g.subject_id),
    };
  }

  // §7.0 bb_candidate_result: the copy's Dan, the age, the inputs, today and Submissions due;
  // a withdrawn row → the override (Restore brings the real one back).
  function resultOf(db, c) {
    const cycle = findCycle(db, c.cycle_id);
    const dan = danOf(db, c.cycle_id, c.dan);
    const input = gradingInput(db, c);
    const r = gradeResult(dan, candidateAge(db, c), input.grades, input.counts, input.retest, input.chosen, today(), cycle?.submissions_due ?? null);
    return c.status === 'withdrawn' ? withdrawnResult(r) : r;
  }

  // §7.0 helpers.
  const cycleHasGrading = (db, cycleId) => {
    const ids = new Set(db.bb_candidates.filter((c) => c.cycle_id === cycleId).map((c) => c.id));
    return db.bb_grades.some((g) => ids.has(g.candidate_id)) || db.bb_extra_counts.some((g) => ids.has(g.candidate_id))
      || db.bb_makeup_subjects.some((g) => ids.has(g.candidate_id));
  };
  // real grades: a not-kept grade or count, or a chosen subject (what Q-G3 protects)
  const candidateHasGrades = (db, candidateId) => db.bb_grades.some((g) => g.candidate_id === candidateId && !g.kept)
    || db.bb_extra_counts.some((g) => g.candidate_id === candidateId && !g.kept)
    || db.bb_makeup_subjects.some((g) => g.candidate_id === candidateId && g.kind === 'chosen');
  const gradingStartedAt = (db, cycleId) => db.bb_cycle_grading_started.find((x) => x.cycle_id === cycleId)?.started_at ?? null;
  // §2.7: the first grading row of a cycle writes its "grading started" row (once, for good).
  function noteGradingStarted(db, candidateId, ctx) {
    const c = findCandidate(db, candidateId);
    if (!c || db.bb_cycle_grading_started.some((x) => x.cycle_id === c.cycle_id)) return;
    db.bb_cycle_grading_started.push({ id: newId(), cycle_id: c.cycle_id, started_at: stamp(), started_by: ctx.userId ?? null, started_by_name: ctx.actorName });
  }
  // The parts of a cycle with REAL grades (not kept), in part order — Other requirements too
  // (it is on no testing day, so it never protects a day: S2 looks at the day's own parts).
  function partsWithRealGrades(db, cycleId) {
    const ids = new Set(db.bb_candidates.filter((c) => c.cycle_id === cycleId).map((c) => c.id));
    return GRADED_PARTS.filter((p) => db.bb_grades.some((g) => ids.has(g.candidate_id) && !g.kept && g.part_code === p));
  }

  // §7.0 bb_sent_state: the newest not-undone send, and whether it matches the result now.
  function sentState(db, c, result) {
    const s = db.bb_result_sends.filter((x) => x.candidate_id === c.id && x.undone_at === null)
      .sort((a, b) => cmp(b.marked_at, a.marked_at) || -byId(a, b))[0] ?? null;
    return {
      sent: s ? { id: s.id, marked_at: s.marked_at, marked_by_name: s.marked_by_name, result_status: s.result_status } : null,
      matches: s !== null && s.result_key === result.result_key,
    };
  }

  // §6.2 bb_purge_due_on: the LATEST purge day over the candidate and every make-up row descended
  // from it (the whole chain, withdrawn links too; a loop ends because each row is visited once).
  // null when either keep-years setting is empty. n1 / n2 = the settings to use (Set keep-years
  // counts with the new numbers before saving them).
  function purgeDueChain(db, c, n1 = settings(db).keep_years_after_last_day, n2 = settings(db).keep_years_after_18) {
    if (!Number.isInteger(n1) || !Number.isInteger(n2)) return null;
    const seen = new Set();
    const queue = [c];
    let latest = null;
    while (queue.length > 0) {
      const row = queue.shift();
      if (!row || seen.has(row.id)) continue;
      seen.add(row.id);
      const due = purgeDueOnOwn(db, row, n1, n2);
      if (due !== null && (latest === null || due > latest)) latest = due;
      for (const x of db.bb_candidates) if (x.makeup_of_candidate_id === row.id) queue.push(x);
    }
    return latest;
  }
  const purgeIsDue = (db, c, onDay = today()) => {
    const due = purgeDueChain(db, c);
    return due !== null && due <= onDay;
  };
  // The age the purge keeps (§6.2): set once, from the DOB it is about to remove.
  const ageToKeep = (db, c) => ageOn(c.date_of_birth, firstDayOfCycle(db, c.cycle_id));

  // A cycle's rows for one Dan with this row-order (§7.2): own first, then make-ups (G 14).
  const ownThenMakeups = (x, y) => (x.source === 'makeup' ? 1 : 0) - (y.source === 'makeup' ? 1 : 0) || schoolOrder(x, y);
  // roster order inside a Dan: Shrewsbury then Worcester, last name, first name, id
  const schoolOrder = (x, y) => (x.location_code === 'shrewsbury' ? 0 : 1) - (y.location_code === 'shrewsbury' ? 0 : 1)
    || collate(x.last_name, y.last_name) || collate(x.first_name, y.first_name) || byId(x, y);

  // A cycle object of the grading reads (§7.2).
  function cycleAnswer(db, cycle, withLastDay = false) {
    const days = daysOf(db, cycle.id);
    const out = {
      id: cycle.id,
      name: cycle.name,
      submissions_due: cycle.submissions_due,
      first_day: days.length ? days[0].day_date : null,
      days: days.map((d) => ({
        id: d.id, name: d.name, day_date: d.day_date, start_time: d.start_time, end_time: d.end_time, place_code: d.place_code,
        place_other: d.place_other, second_start: d.second_start, second_end: d.second_end, second_place_code: d.second_place_code,
        second_place_other: d.second_place_other, parts: partsOf(db, d.id),
      })),
    };
    if (withLastDay) out.last_day = days.length ? days[days.length - 1].day_date : null;
    return out;
  }
  // The Dan switch's counts: [{ dan, location_code, count }] of active rows.
  function danCounts(db, cycleId) {
    const out = [];
    for (const dan of [1, 2, 3, 4]) {
      for (const code of ['shrewsbury', 'worcester']) {
        const count = db.bb_candidates.filter((c) => c.cycle_id === cycleId && c.status === 'active' && c.dan === dan && c.location_code === code).length;
        if (count > 0) out.push({ dan, location_code: code, count });
      }
    }
    return out;
  }
  // has_email: on file AND not on / after the purge day (§9).
  const hasEmail = (db, c) => c.email_for_results !== null && !purgeIsDue(db, c);

  // The names of a make-up row's retest subjects, in rubric order (roster / detail, §6.5).
  function retestNames(db, c) {
    if (c.source !== 'makeup') return [];
    const ids = new Set(subjectsOf(db, c.id, c.dan, 'retest').map((x) => x.subject_id));
    return danSubjects(danOf(db, c.cycle_id, c.dan)).filter((x) => ids.has(x.subject.id)).map((x) => x.subject.name);
  }
  // The four keys 0025 adds to roster rows and the detail's candidate (§6.5).
  const candidateExtras = (db, c) => ({
    is_makeup: c.source === 'makeup',
    makeup_of_cycle_name: c.makeup_of_cycle_name ?? null,
    retest_names: retestNames(db, c),
    has_grades: candidateHasGrades(db, c.id),
  });

  // Q-G4: the old Dan's real grading rows, counted.
  function danGradingCounts(db, c, dan = c.dan) {
    return {
      grade_count: gradesOf(db, c.id, dan).filter((g) => !g.kept).length,
      count_count: countsOf(db, c.id, dan).filter((g) => !g.kept).length,
      chosen_count: subjectsOf(db, c.id, dan, 'chosen').length,
    };
  }
  // Q-G4: clears them (tag bb_clear_dan_grading); kept rows and sends stay. → what was cleared
  function clearDanGrading(db, c, dan = c.dan) {
    const n = danGradingCounts(db, c, dan);
    db.bb_grades = db.bb_grades.filter((g) => !(g.candidate_id === c.id && g.dan === dan && !g.kept));
    db.bb_extra_counts = db.bb_extra_counts.filter((g) => !(g.candidate_id === c.id && g.dan === dan && !g.kept));
    db.bb_makeup_subjects = db.bb_makeup_subjects.filter((g) => !(g.candidate_id === c.id && g.dan === dan && g.kind === 'chosen'));
    return { grades: n.grade_count, counts: n.count_count, chosen: n.chosen_count };
  }

  // The "on delete cascade / set null" of 0025 when candidates go (Delete permanently, Delete cycle).
  function cascadeCandidates(db, ids) {
    db.bb_grades = db.bb_grades.filter((g) => !ids.has(g.candidate_id));
    db.bb_extra_counts = db.bb_extra_counts.filter((g) => !ids.has(g.candidate_id));
    db.bb_makeup_subjects = db.bb_makeup_subjects.filter((g) => !ids.has(g.candidate_id));
    db.bb_result_sends = db.bb_result_sends.filter((g) => !ids.has(g.candidate_id));
    for (const c of db.bb_candidates) if (c.makeup_of_candidate_id && ids.has(c.makeup_of_candidate_id)) c.makeup_of_candidate_id = null; // set null, no bump
  }
  // Delete cycle's cascade also removes its grading-started row (the only way it ever goes).
  function cascadeCycle(db, cycleId) {
    db.bb_cycle_grading_started = db.bb_cycle_grading_started.filter((x) => x.cycle_id !== cycleId);
  }

  // S2 (§5 bb_cycle_days_grading / bb_cycle_day_parts_grading) for an Edit cycle save, before it
  // writes: spec.days = the days the form sends (id = a saved day). → true = refused (has_grades).
  function editCycleRefused(db, cycle, specDays) {
    const onDay = today();
    const saved = daysOf(db, cycle.id);
    const byIdMap = new Map(specDays.filter((d) => d.id).map((d) => [d.id, d]));
    const graded = new Set(partsWithRealGrades(db, cycle.id));
    // (i) a past (or today's) day with graded parts can't go or move, nor lose a graded part
    for (const d of saved) {
      if (d.day_date > onDay) continue;
      const parts = partsOf(db, d.id);
      const next = byIdMap.get(d.id);
      if (!next || next.date !== d.day_date) {
        if (parts.some((p) => graded.has(p))) return true;
      } else if (parts.some((p) => graded.has(p) && !next.parts.includes(p))) return true;
    }
    // (ii) the first-day freeze while the cycle has any grading row
    if (cycleHasGrading(db, cycle.id) && saved.length > 0) {
      const first = saved[0].day_date;
      if (specDays.some((d) => d.date < first)) return true; // an earlier day added, or a day moved before it
      const staying = saved.filter((d) => d.day_date === first && byIdMap.get(d.id)?.date === first);
      const leaving = saved.filter((d) => d.day_date === first && byIdMap.get(d.id)?.date !== first);
      if (leaving.length > 0 && staying.length === 0) return true;
    }
    return false;
  }

  // ----- Shared steps of the grade writes -----

  // Steps 4 and 6 of bb_set_grade / bb_set_measured / bb_set_extra_count up to the subject check.
  // → { answer } (a refusal) or { c, dan, age }
  function gradeTarget(db, a, needAge) {
    const c = findCandidate(db, a.p_candidate_id);
    if (!c) return { answer: st('not_found') };
    if (c.status === 'withdrawn') return { answer: st('withdrawn') };
    if (a.p_dan !== c.dan) return { answer: st('stale') }; // a stale tablet can't bring back cleared grades
    const age = candidateAge(db, c);
    if (needAge && age === null) return { answer: st('invalid') };
    const dan = danOf(db, c.cycle_id, c.dan);
    if (!dan) return { answer: st('not_found') };
    return { c, dan, age };
  }
  // The subject of a Dan with its part, if it applies to this age. → { part, subject } or null
  function applyingSubject(dan, age, subjectId) {
    const found = subjectIndex(dan).get(subjectId);
    if (!found) return null;
    const result = gradeResult(dan, age, [], [], [], [], today(), null);
    return result.subjects.find((s) => s.id === subjectId)?.applies ? found : null;
  }
  // Writes (or clears) one bb_grades row. values null = Clear.
  function putGrade(db, c, found, values, ctx) {
    const existing = gradesOf(db, c.id, c.dan).find((g) => g.subject_id === found.subject.id) ?? null;
    if (values === null) {
      if (existing) db.bb_grades = db.bb_grades.filter((g) => g !== existing);
      return Boolean(existing);
    }
    if (existing) return updateRow(existing, values, ctx.actorName);
    db.bb_grades.push({
      id: newId(), candidate_id: c.id, dan: c.dan, part_code: found.part, subject_id: found.subject.id, letter: null, measured: null,
      way: null, ...values, kept: false, kept_from_cycle_id: null, kept_from_cycle_name: null, ...house(ctx.actorName),
    });
    noteGradingStarted(db, c.id, ctx);
    return true;
  }

  // The update-candidate core both Edit details functions share (contract OI-1). mockBlackBelt's
  // 0016 checks run first (core016 returns { answer } or { c, changes, apply }); then 0025's.
  //   expected = null (bb_update_candidate: never clears) or the three counts (…_clear)
  function updateCandidateCore(db, a, ctx, core016, expected) {
    const base = core016(db, a, ctx);
    if (base.answer) return base;
    const { c } = base;
    const danChange = a.p_dan !== c.dan;
    if (expected === null) {
      if (danChange) {
        if (c.source === 'makeup') return { answer: st('invalid') }; // DC 4: no Dan field there
        if (activeMakeupsOf(db, c.id).length > 0) return { answer: st('already_added') }; // OI-4
        const n = danGradingCounts(db, c);
        if (n.grade_count + n.count_count + n.chosen_count > 0) return { answer: { status: 'has_grades', ...n } }; // nothing written
      }
      return base.apply();
    }
    // bb_update_candidate_clear: a real Dan change with the counts the dialog showed
    if (!danChange || c.source === 'makeup') return { answer: st('invalid') };
    if (activeMakeupsOf(db, c.id).length > 0) return { answer: st('already_added') };
    const n = danGradingCounts(db, c);
    if (n.grade_count !== expected.grades || n.count_count !== expected.counts || n.chosen_count !== expected.chosen) {
      return { answer: { status: 'has_grades', ...n } };
    }
    const cleared = clearDanGrading(db, c); // the same batch, tag bb_clear_dan_grading
    const done = base.apply();
    return { answer: { ...done.answer, cleared }, save: true };
  }

  // ----- The new staff functions (contract §7.1, §7.2). Each gets the private copy of the store
  // and returns { answer, save }; rpc() has already checked has_data_access and the A role. -----

  const handlers = {
    // §7.1 One letter of a graded subject (S). p_letter null = Clear; the same letter writes nothing.
    bb_set_grade(db, a, ctx) {
      if (a.p_candidate_id === null || a.p_dan === null || a.p_subject_id === null || a.p_dan < 1 || a.p_dan > 4
        || !SUBJECT_ID.test(a.p_subject_id)) return { answer: st('invalid') };
      const t = gradeTarget(db, a, true);
      if (t.answer) return t;
      const found = applyingSubject(t.dan, t.age, a.p_subject_id);
      if (!found || found.subject.scoring !== 'graded') return { answer: st('invalid') };
      if (a.p_letter !== null && !partLetters(found.part).includes(a.p_letter)) return { answer: st('invalid') };
      const existing = gradesOf(db, t.c.id, t.c.dan).find((g) => g.subject_id === a.p_subject_id) ?? null;
      if (existing?.kept) return { answer: st('kept') };
      const same = a.p_letter === null ? existing === null : existing?.letter === a.p_letter && existing.measured === null;
      const changed = same ? false : putGrade(db, t.c, found, a.p_letter === null ? null : { letter: a.p_letter, measured: null, way: null }, ctx);
      return { answer: { status: 'ok', letter: a.p_letter, result: resultOf(db, t.c) }, save: changed };
    },

    // §7.1 One measured number (S): 0–999, at most 4 decimals; way 0 or 1 and a way of the subject.
    // p_value null = Clear (the way is ignored). Switching the way keeps the number (G 5).
    bb_set_measured(db, a, ctx) {
      const v = a.p_value;
      if (a.p_candidate_id === null || a.p_dan === null || a.p_subject_id === null || a.p_dan < 1 || a.p_dan > 4
        || !SUBJECT_ID.test(a.p_subject_id)) return { answer: st('invalid') };
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > MEASURED_MAX || !fourDecimals(v) || a.p_way === null || (a.p_way !== 0 && a.p_way !== 1))) {
        return { answer: st('invalid') };
      }
      const t = gradeTarget(db, a, true);
      if (t.answer) return t;
      const found = applyingSubject(t.dan, t.age, a.p_subject_id);
      if (!found || found.subject.scoring !== 'measured') return { answer: st('invalid') };
      if (v !== null && a.p_way >= (found.subject.ways ?? []).length) return { answer: st('invalid') }; // way 1 on a one-way subject
      const existing = gradesOf(db, t.c.id, t.c.dan).find((g) => g.subject_id === a.p_subject_id) ?? null;
      if (existing?.kept) return { answer: st('kept') };
      const same = v === null ? existing === null : existing?.measured === v && existing.way === a.p_way && existing.letter === null;
      const changed = same ? false : putGrade(db, t.c, found, v === null ? null : { letter: null, measured: v, way: a.p_way }, ctx);
      return { answer: { status: 'ok', value: v, way: v === null ? null : a.p_way, result: resultOf(db, t.c) }, save: changed };
    },

    // §7.1 One extra-points count (S): 0–9 999 or null (Clear); the item's exact name in the copy.
    // No age needed (counts don't depend on it).
    bb_set_extra_count(db, a, ctx) {
      if (a.p_candidate_id === null || a.p_dan === null || a.p_item_name === null || a.p_dan < 1 || a.p_dan > 4
        || (a.p_count !== null && (a.p_count < 0 || a.p_count > COUNT_MAX))) return { answer: st('invalid') };
      const t = gradeTarget(db, a, false);
      if (t.answer) return t;
      if (!(t.dan.extra_points?.items ?? []).some((i) => i?.name === a.p_item_name)) return { answer: st('invalid') };
      const existing = countsOf(db, t.c.id, t.c.dan).find((g) => g.item_name.toLowerCase() === a.p_item_name.toLowerCase()) ?? null;
      if (existing?.kept) return { answer: st('kept') };
      let changed = false;
      if (a.p_count === null) {
        if (existing) {
          db.bb_extra_counts = db.bb_extra_counts.filter((g) => g !== existing);
          changed = true;
        }
      } else if (existing) {
        changed = updateRow(existing, { count: a.p_count }, ctx.actorName);
      } else {
        db.bb_extra_counts.push({
          id: newId(), candidate_id: t.c.id, dan: t.c.dan, item_name: a.p_item_name, count: a.p_count, kept: false,
          kept_from_cycle_id: null, kept_from_cycle_name: null, ...house(ctx.actorName),
        });
        noteGradingStarted(db, t.c.id, ctx);
        changed = true;
      }
      return { answer: { status: 'ok', count: a.p_count, result: resultOf(db, t.c) }, save: changed };
    },

    // §7.1 Choose subjects (A): the subjects a complete below-the-mark result with no D retests.
    bb_set_makeup_subjects(db, a, ctx) {
      const ids = a.p_ids;
      const expected = a.p_expected_ids;
      if (a.p_candidate_id === null || expected === null || ids === null || expected.some((x) => x === null) || ids.some((x) => x === null)
        || ids.length === 0 || ids.length > MAX_CHOSEN || ids.some((x) => !SUBJECT_ID.test(x)) || new Set(ids).size !== ids.length) {
        return { answer: st('invalid') };
      }
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      const stored = subjectsOf(db, c.id, c.dan, 'chosen').map((x) => x.subject_id);
      if (!sameSet(stored, expected)) return { answer: st('stale') };
      if (c.status === 'withdrawn') return { answer: st('withdrawn') };
      if (activeMakeupsOf(db, c.id).length > 0) return { answer: st('already_added') };
      const result = resultOf(db, c);
      if (!(result.status === 'makeup' && result.reasons.length === 1 && result.reasons[0] === 'below' && result.complete)) {
        return { answer: st('invalid') };
      }
      const applying = new Set(result.subjects.filter((s) => s.applies).map((s) => s.id));
      if (ids.some((id) => !applying.has(id))) return { answer: st('invalid') };
      const before = subjectsOf(db, c.id, c.dan, 'chosen');
      db.bb_makeup_subjects = db.bb_makeup_subjects.filter((x) => !(before.includes(x) && !ids.includes(x.subject_id)));
      let added = false;
      for (const id of ids) {
        if (stored.includes(id)) continue;
        db.bb_makeup_subjects.push({ id: newId(), candidate_id: c.id, dan: c.dan, subject_id: id, kind: 'chosen', ...house(ctx.actorName) });
        added = true;
      }
      if (added) noteGradingStarted(db, c.id, ctx);
      const after = resultOf(db, c);
      const order = after.subjects.map((s) => s.id).filter((id) => ids.includes(id));
      return { answer: { status: 'ok', ids: order, result: after }, save: true };
    },

    // §7.1 Add make-up (S): the earlier candidate onto this cycle with kept grades and counts and
    // the retest subjects (keptMatch). Then 0016's duplicate check and the purge (OI-6).
    bb_add_makeup(db, a, ctx) {
      if (a.p_cycle_id === null || a.p_earlier_candidate_id === null) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      const e = findCandidate(db, a.p_earlier_candidate_id);
      if (!e) return { answer: st('not_found') };
      const onDay = today();
      if (stateOf(db, cycle, onDay).past) return { answer: st('finished') };
      const laterFirst = firstDayOfCycle(db, cycle.id);
      const earlierFirst = firstDayOfCycle(db, e.cycle_id);
      if (e.cycle_id === cycle.id || laterFirst === null || earlierFirst === null || !(earlierFirst < laterFirst)
        || e.status !== 'active' || e.personal_removed_at !== null || purgeIsDue(db, e, onDay)) return { answer: st('invalid') };
      if (activeMakeupsOf(db, e.id).length > 0) return { answer: st('already_added') };
      const earlierResult = resultOf(db, e);
      if (earlierResult.status !== 'makeup') return { answer: st('stale') };
      if (earlierResult.choice_needed) return { answer: st('choice_needed') };
      const earlierCycle = findCycle(db, e.cycle_id);
      const laterDan = danOf(db, cycle.id, e.dan);
      const at = stamp();
      const row = {
        id: newId(), cycle_id: cycle.id, first_name: e.first_name, last_name: e.last_name, date_of_birth: e.date_of_birth,
        email_for_results: e.email_for_results, personal_removed_at: null, location_code: e.location_code, dan: e.dan, cycle_plan_id: null,
        kukkiwon: false, kukkiwon_added_on: null, source: 'makeup', reference: e.reference, registered_at: at, status: 'active',
        withdrawn_reason: null, withdrawn_at: null, withdrawn_by_name: null, withdrawn_by: null, duplicate_state: 'none', duplicate_of: null,
        makeup_of_candidate_id: e.id, makeup_of_cycle_name: earlierCycle.name, age_kept: null, ...house(ctx.actorName, at),
      };
      db.bb_candidates.push(row);
      const match = keptMatch(earlierResult, danOf(db, e.cycle_id, e.dan), gradingInput(db, e).counts, laterDan, candidateAge(db, row));
      writeKept(db, row, match, earlierCycle, ctx, at);
      // 0016's duplicate check for the new row, its partner and anyone pointing at it
      const dup = findDuplicate(db, cycle.id, row.id, row.first_name, row.last_name, row.date_of_birth);
      if (dup) {
        recheckDuplicate(db, row.id);
        recheckDuplicate(db, dup);
      }
      recheckPointingAt(db, row.id);
      purge(db);
      return {
        answer: { status: 'ok', id: row.id, reference: row.reference, version: row.version, kept_count: match.kept.length, retest_count: match.retest.length },
        save: true,
      };
    },

    // §7.1 Mark as sent (S). Q-G6 B: a Make-up · D that isn't complete yet may be marked.
    bb_mark_result_sent(db, a, ctx) {
      if (a.p_candidate_id === null || a.p_expected_result_key === null) return { answer: st('invalid') };
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      if (c.status === 'withdrawn') return { answer: st('withdrawn') };
      const result = resultOf(db, c);
      if (!['passed', 'makeup'].includes(result.status) || result.choice_needed) return { answer: st('not_finished') };
      if (c.email_for_results === null || purgeIsDue(db, c)) return { answer: st('no_email') };
      if (result.result_key !== a.p_expected_result_key) return { answer: st('stale') };
      const send = {
        id: newId(), candidate_id: c.id, marked_at: stamp(), marked_by: ctx.userId ?? null, marked_by_name: ctx.actorName,
        result_status: result.status, result_total: result.total, result_needs: [...result.needs], result_key: result.result_key,
        undone_at: null, undone_by: null, undone_by_name: null,
      };
      db.bb_result_sends.push(send);
      return { answer: { status: 'ok', sent_id: send.id, marked_at: send.marked_at }, save: true };
    },

    // §7.1 Undo Mark as sent: own within 10 seconds (S), any time (A); once.
    bb_undo_result_sent(db, a, ctx) {
      if (a.p_send_id === null) return { answer: st('invalid') };
      const send = db.bb_result_sends.find((x) => x.id === a.p_send_id) ?? null;
      if (!send || !findCandidate(db, send.candidate_id)) return { answer: st('not_found') };
      if (send.undone_at !== null) return { answer: st('stale') };
      const own = send.marked_by !== null && send.marked_by === (ctx.userId ?? null) && Date.parse(send.marked_at) > clock() - SEND_UNDO_MS;
      if (!ctx.isAdmin && !own) return { answer: st('not_allowed') };
      Object.assign(send, { undone_at: stamp(), undone_by: ctx.userId ?? null, undone_by_name: ctx.actorName });
      return { answer: st('ok'), save: true };
    },

    // §7.1 One result email text (A), Star 0023 §5 exactly: stored as sent; the same text writes nothing.
    bb_set_result_text(db, a, ctx) {
      if (a.p_kind === null || a.p_expected_version === null || a.p_body === null || resultTextProblem(a.p_kind, a.p_body) !== null) {
        return { answer: st('invalid') };
      }
      const row = db.bb_result_texts.find((x) => x.kind === a.p_kind) ?? null;
      if (!row) return { answer: st('not_found') };
      if (row.version !== a.p_expected_version) return { answer: st('stale') };
      if (row.body === a.p_body) return { answer: { status: 'ok', version: row.version, body: row.body } };
      updateRow(row, { body: a.p_body }, ctx.actorName);
      return { answer: { status: 'ok', version: row.version, body: row.body }, save: true };
    },

    // §7.2 The Grading grid of one Dan (S): active rows, own first then make-ups. No DOB, email,
    // reference, plan, money or age.
    bb_grading_grid(db, a) {
      if (a.p_cycle_id === null || a.p_dan === null || a.p_dan < 1 || a.p_dan > 4) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      const rows = db.bb_candidates.filter((c) => c.cycle_id === cycle.id && c.status === 'active' && c.dan === a.p_dan)
        .sort(ownThenMakeups)
        .map((c) => ({
          id: c.id, first_name: c.first_name, last_name: c.last_name, location_code: c.location_code, is_makeup: c.source === 'makeup',
          makeup_of_cycle_name: c.makeup_of_cycle_name ?? null, result: resultOf(db, c),
        }));
      return {
        answer: {
          status: 'ok', today: today(), cycle: cycleAnswer(db, cycle), rubric: rubricPublic(cycle.requirements).dans[a.p_dan - 1],
          dan_counts: danCounts(db, cycle.id), rows,
        },
      };
    },

    // §7.2 The Results (S): one Dan or every Dan (p_dan null), active rows in roster order.
    bb_cycle_results(db, a) {
      if (a.p_cycle_id === null || (a.p_dan !== null && (a.p_dan < 1 || a.p_dan > 4))) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      const rows = db.bb_candidates.filter((c) => c.cycle_id === cycle.id && c.status === 'active' && (a.p_dan === null || c.dan === a.p_dan))
        .sort(rosterOrder)
        .map((c) => {
          const result = resultOf(db, c);
          return {
            id: c.id, first_name: c.first_name, last_name: c.last_name, location_code: c.location_code, dan: c.dan, is_makeup: c.source === 'makeup',
            makeup_of_cycle_name: c.makeup_of_cycle_name ?? null, result, sent: sentState(db, c, result), has_email: hasEmail(db, c),
          };
        });
      return {
        answer: {
          // the requested Dans of the rubric's public view (every Dan for p_dan null)
          status: 'ok', today: today(), cycle: cycleAnswer(db, cycle, true),
          rubrics: rubricPublic(cycle.requirements).dans.filter((d) => a.p_dan === null || d.dan === a.p_dan),
          dan_counts: danCounts(db, cycle.id), rows,
        },
      };
    },

    // §7.2 The make-up picker (S): earlier candidates whose result is a Make-up (complete or not).
    // Filters first (cheap), then works each result out. No DOB, email or reference.
    bb_makeup_list(db, a) {
      if (a.p_cycle_id === null) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      const onDay = today();
      const first = firstDayOfCycle(db, cycle.id);
      const firstOf = new Map(db.bb_cycles.map((x) => [x.id, firstDayOfCycle(db, x.id)]));
      const rows = [];
      for (const e of db.bb_candidates) {
        const ef = firstOf.get(e.cycle_id) ?? null;
        if (e.cycle_id === cycle.id || first === null || ef === null || !(ef < first) || e.status !== 'active'
          || e.personal_removed_at !== null || purgeIsDue(db, e, onDay)) continue;
        const elsewhere = activeMakeupsOf(db, e.id).some((m) => m.cycle_id !== cycle.id);
        if (elsewhere) continue;
        const result = resultOf(db, e);
        if (result.status !== 'makeup') continue;
        const earlierDan = danOf(db, e.cycle_id, e.dan);
        const laterDan = danOf(db, cycle.id, e.dan);
        const laterAge = ageOn(e.date_of_birth, first) ?? (Number.isInteger(e.age_kept) ? e.age_kept : null);
        const match = keptMatch(result, earlierDan, gradingInput(db, e).counts, laterDan, laterAge);
        const group = ageGroupOf(laterDan, laterAge);
        rows.push({
          sort: { first: ef, e },
          row: {
            id: e.id, first_name: e.first_name, last_name: e.last_name, location_code: e.location_code, dan: e.dan, cycle_id: e.cycle_id,
            cycle_name: findCycle(db, e.cycle_id).name, cycle_first_day: ef, age_group: group ? { from: group.from, to: group.to } : null,
            reasons: result.reasons, complete: result.complete, needs: subjectNames(earlierDan, result.needs),
            d_subjects: subjectNames(earlierDan, result.d_subjects), choice_needed: result.choice_needed,
            already_added: activeMakeupsOf(db, e.id).some((m) => m.cycle_id === cycle.id),
            preview: {
              kept: subjectNames(laterDan, match.kept.map((k) => k.subject_id)),
              retest: subjectNames(laterDan, match.retest),
              new: subjectNames(laterDan, match.new),
              dropped: match.dropped,
              kept_extra: match.kept_counts.map((k) => k.item_name),
              dropped_extra: match.dropped_extra,
            },
          },
        });
      }
      rows.sort((x, y) => cmp(y.sort.first, x.sort.first) || x.sort.e.dan - y.sort.e.dan || schoolOrder(x.sort.e, y.sort.e));
      return { answer: { status: 'ok', rows: rows.map((x) => x.row) } };
    },

    // §7.2 Email result (S): ONE candidate's email at the click. Not logged.
    bb_result_email(db, a) {
      if (a.p_candidate_id === null) return { answer: st('invalid') };
      const c = findCandidate(db, a.p_candidate_id);
      if (!c) return { answer: st('not_found') };
      if (c.status === 'withdrawn') return { answer: st('withdrawn') };
      const result = resultOf(db, c);
      if (!['passed', 'makeup'].includes(result.status) || result.choice_needed) return { answer: st('not_finished') };
      if (c.email_for_results === null || purgeIsDue(db, c)) return { answer: st('no_email') };
      const dan = danOf(db, c.cycle_id, c.dan);
      const kind = result.status === 'passed' ? 'passed' : result.reasons.includes('d') ? 'makeup_d' : 'makeup_below';
      return {
        answer: {
          status: 'ok', email: c.email_for_results, kind, first_name: c.first_name, last_name: c.last_name,
          cycle_name: findCycle(db, c.cycle_id)?.name ?? null, dan: c.dan, total: result.total, pass_mark: result.pass_mark,
          reasons: result.reasons, needs: subjectNames(dan, result.needs), d_subjects: subjectNames(dan, result.d_subjects),
          result_key: result.result_key,
        },
      };
    },

    // §7.2 The CSV (A, it writes): the download row FIRST, then the rows (Results order, active).
    // DOB and email are null from the purge day on.
    bb_results_csv(db, a, ctx) {
      if (a.p_cycle_id === null) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      const active = db.bb_candidates.filter((c) => c.cycle_id === cycle.id && c.status === 'active').sort(rosterOrder);
      db.bb_downloads.push({
        id: newId(), cycle_id: cycle.id, cycle_name: cycle.name, row_count: active.length, downloaded_at: stamp(),
        downloaded_by: ctx.userId ?? null, downloaded_by_name: ctx.actorName,
      });
      const onDay = today();
      const rows = active.map((c) => {
        const result = resultOf(db, c);
        const dan = danOf(db, c.cycle_id, c.dan);
        const due = purgeIsDue(db, c, onDay);
        const { items, ...money } = moneyOf(db, c, onDay); // eslint-disable-line no-unused-vars
        return {
          candidate_id: c.id, result_status: result.status, dan: c.dan, first_name: c.first_name, last_name: c.last_name,
          location_code: c.location_code, makeup_of_cycle_name: c.makeup_of_cycle_name ?? null, date_of_birth: due ? null : c.date_of_birth,
          pass_bracket: result.pass_bracket, email_for_results: due ? null : c.email_for_results,
          plan_name: db.bb_cycle_plans.find((p) => p.id === c.cycle_plan_id)?.name ?? null, kukkiwon: c.kukkiwon, money,
          parts: result.parts, extra_total: result.extra ? result.extra.total : null, total: result.total, pass_mark: result.pass_mark,
          result: {
            status: result.status, reasons: result.reasons, complete: result.complete, choice_needed: result.choice_needed,
            needs: subjectNames(dan, result.needs), late: subjectNames(dan, result.late), missing: subjectNames(dan, result.missing),
          },
          sent: sentState(db, c, result),
        };
      });
      return { answer: { status: 'ok', cycle_name: cycle.name, rows }, save: true };
    },

    // §7.2 For Edit cycle and the Rubric tab (S): exact key set.
    bb_cycle_grading_state(db, a) {
      if (a.p_cycle_id === null) return { answer: st('invalid') };
      const cycle = findCycle(db, a.p_cycle_id);
      if (!cycle) return { answer: st('not_found') };
      const onDay = today();
      const graded = partsWithRealGrades(db, cycle.id);
      const has = cycleHasGrading(db, cycle.id);
      const days = daysOf(db, cycle.id);
      return {
        answer: {
          status: 'ok', has_grading: has, grading_started_at: gradingStartedAt(db, cycle.id), parts_with_grades: graded,
          first_day: days.length ? days[0].day_date : null, first_day_frozen: has,
          protected_days: days.filter((d) => d.day_date <= onDay && partsOf(db, d.id).some((p) => graded.includes(p)))
            .map((d) => ({ id: d.id, day_date: d.day_date, parts: partsOf(db, d.id).filter((p) => graded.includes(p)) })),
        },
      };
    },
  };

  // Writes a make-up row's kept grades, kept counts and retest subjects (Add make-up and the sample).
  // kept_from_* = the IMMEDIATE earlier cycle (also in a chain, §4.7).
  function writeKept(db, row, match, earlierCycle, ctx, at = stamp()) {
    const laterDan = danOf(db, row.cycle_id, row.dan);
    const index = subjectIndex(laterDan);
    for (const k of match.kept) {
      db.bb_grades.push({
        id: newId(), candidate_id: row.id, dan: row.dan, part_code: k.part, subject_id: k.subject_id, letter: k.letter, measured: null,
        way: null, kept: true, kept_from_cycle_id: earlierCycle.id, kept_from_cycle_name: earlierCycle.name, ...house(ctx.actorName, at),
      });
    }
    for (const k of match.kept_counts) {
      db.bb_extra_counts.push({
        id: newId(), candidate_id: row.id, dan: row.dan, item_name: k.item_name, count: k.count, kept: true,
        kept_from_cycle_id: earlierCycle.id, kept_from_cycle_name: earlierCycle.name, ...house(ctx.actorName, at),
      });
    }
    for (const id of match.retest) {
      if (!index.has(id)) continue;
      db.bb_makeup_subjects.push({ id: newId(), candidate_id: row.id, dan: row.dan, subject_id: id, kind: 'retest', ...house(ctx.actorName, at) });
    }
    if (match.kept.length + match.kept_counts.length + match.retest.length > 0) noteGradingStarted(db, row.id, ctx);
  }

  // ----- Samples and console helpers -----

  // One cast grade text → a bb_grades value: "7 in = A" (a number), "8:40 min = B+" (m:ss),
  // "Pull-up 8 reps = A" / "Hold 35 sec = A+" (the way), "A-" (a letter); "not for this age
  // group" and "Late (not handed in)" → no row.
  function castValue(text) {
    if (/not for this age|Late/i.test(text)) return null;
    const m = /^(?:(Pull-up|Hold) )?([\d.:]+) \S+ = (\S+)$/.exec(text);
    if (m) return { letter: null, measured: m[2].includes(':') ? minutesFromText(m[2]) : Number(m[2]), way: m[1] === 'Hold' ? 1 : 0 };
    return { letter: text, measured: null, way: null };
  }

  // The mockups' shared cast (docs/Testing/Black Belt Testing/TKD-BlackBelt-Mockup-Cast.json, passed
  // in by mockClient / checks.mjs): Spring 2027 graded as of Wed, Jun 9, 2027 (all four Dans,
  // Lucas and Sam late, Zoe waiting for Choose subjects, Alex's result marked sent Jun 7), and Fall
  // 2027 with Mia Chen's make-up (kept grades and +15 kept, Free sparring to retest) and two new
  // candidates. people: { 'First Last': { dob, email, plan, kukkiwon, on, payments } } for the rows.
  // base = mockBlackBelt's sampleBase(); addCandidate(base, p) = its addSampleCandidate.
  function writeGradingSample(base, cast, people, addCandidate) {
    const { db, spring, fall, t } = base;
    const staff = { actorName: 'Staff', userId: null };
    const partDay = { physical: '2027-04-03', technical: '2027-05-01', curriculum: '2027-06-05', other: '2027-06-05' };
    const byName = new Map();
    for (const c of cast.candidates) {
      const p = people[c.name];
      if (!p) throw new Error(`the sample has no row for ${c.name}`);
      const [first, ...rest] = c.name.split(' ');
      const row = addCandidate(base, { first, last: rest.join(' '), school: c.school.toLowerCase(), dan: c.dan, ...p });
      byName.set(c.name, row);
      const dan = danOf(db, spring.id, c.dan);
      const subjects = danSubjects(dan);
      for (const [name, text] of Object.entries(c.grades)) {
        const s = subjects.find((x) => x.subject.name === name);
        const value = s ? castValue(text) : null;
        if (!value) continue;
        db.bb_grades.push({
          id: newId(), candidate_id: row.id, dan: c.dan, part_code: s.part, subject_id: s.subject.id, ...value, kept: false,
          kept_from_cycle_id: null, kept_from_cycle_name: null, ...house('Staff', t(partDay[s.part], '15:00')),
        });
      }
      for (const [item, entry] of Object.entries(c.extraCounts)) {
        if (!entry) continue;
        db.bb_extra_counts.push({
          id: newId(), candidate_id: row.id, dan: c.dan, item_name: item, count: entry.count, kept: false, kept_from_cycle_id: null,
          kept_from_cycle_name: null, ...house('Staff', t('2027-06-04', '18:00')),
        });
      }
    }
    db.bb_cycle_grading_started.push({ id: newId(), cycle_id: spring.id, started_at: t('2027-04-03', '13:05'), started_by: null, started_by_name: 'Staff' });
    // Alex Kim's Passed result was emailed and marked as sent on Jun 7 (R 16, R 18)
    const alex = byName.get('Alex Kim');
    if (alex) {
      const r = resultOf(db, alex);
      db.bb_result_sends.push({
        id: newId(), candidate_id: alex.id, marked_at: t('2027-06-07', '10:20'), marked_by: null, marked_by_name: 'Staff', result_status: r.status,
        result_total: r.total, result_needs: [...r.needs], result_key: r.result_key, undone_at: null, undone_by: null, undone_by_name: null,
      });
    }
    // Fall 2027: Mia Chen's make-up (added Oct 28), and the two new candidates
    const later = cast.laterCycle;
    const mia = byName.get(later?.makeup?.name ?? '');
    if (mia && fall) {
      const at = t('2027-10-28', '16:00');
      const row = {
        ...clone(mia), id: newId(), cycle_id: fall.id, cycle_plan_id: null, kukkiwon: false, kukkiwon_added_on: null, source: 'makeup',
        registered_at: at, status: 'active', duplicate_state: 'none', duplicate_of: null, makeup_of_candidate_id: mia.id,
        makeup_of_cycle_name: spring.name, age_kept: null, ...house('Staff', at),
      };
      db.bb_candidates.push(row);
      const match = keptMatch(resultOf(db, mia), danOf(db, spring.id, mia.dan), gradingInput(db, mia).counts, danOf(db, fall.id, mia.dan), candidateAge(db, row));
      writeKept(db, row, match, spring, staff, at);
      const started = db.bb_cycle_grading_started.find((x) => x.cycle_id === fall.id);
      if (started) started.started_at = at;
    }
    for (const text of later?.otherCandidates ?? []) {
      const m = /^(\S+) (\S+) \((\w+), (\d+)/.exec(text);
      const p = m ? people[`${m[1]} ${m[2]}`] : null;
      if (p) addCandidate(base, { first: m[1], last: m[2], school: m[3].toLowerCase(), dan: 1, cycle: fall, ...p });
    }
  }

  // "Another admin" also changes one grade (simulateOtherAdminEdit): the first typed letter of the
  // newest cycle with grades moves one letter down (A → A-, …), so the 15-second refresh shows it.
  function otherAdminGradeEdit(db) {
    const g = db.bb_grades.filter((x) => !x.kept && x.letter !== null).sort(byId)[0];
    if (!g) return null;
    const letters = partLetters(g.part_code);
    const i = letters.indexOf(g.letter);
    const next = letters[Math.min(i + 1, letters.length - 2)] ?? g.letter; // never a D by surprise
    updateRow(g, { letter: next === g.letter ? letters[0] : next }, 'Sam P.');
    return g;
  }

  // expireUndo: the newest not-undone send looks 11 seconds old, so a staff Undo answers not_allowed.
  function expireNewestSend(db) {
    const s = db.bb_result_sends.filter((x) => x.undone_at === null).sort((a, b) => cmp(b.marked_at, a.marked_at) || -byId(a, b))[0];
    if (!s) return false;
    s.marked_at = stamp(Date.parse(s.marked_at) - 11 * 1000);
    return true;
  }

  return {
    handlers, seedTexts, upgradeStore, resultOf, candidateAge, candidateHasGrades, cycleHasGrading, gradingStartedAt, candidateExtras,
    danGradingCounts, clearDanGrading, updateCandidateCore, cascadeCandidates, cascadeCycle, editCycleRefused, purgeDueChain,
    purgeIsDue, ageToKeep, activeMakeupsOf, writeGradingSample, otherAdminGradeEdit, expireNewestSend, lastDayOfCycle,
  };
}
