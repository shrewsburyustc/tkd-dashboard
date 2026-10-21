// mockStarGrading.js — the PREVIEW (fake) database for Star testing GRADING (build phase 5).
// Why it exists: preview mode (npm run dev:preview-mode) runs without Supabase. This file pretends to
// be the grading part of migration 0006 (contract 0006 §6.5 and §7):
//   writes   star_set_grade (a grade, or null = clear), star_set_count (a class count),
//            star_set_makeup_subjects (an admin's choice for a result below the pass mark, v0.130)
//   reads    star_event_results (one Dan's rows + each candidate's result — the Grading grid, the
//            Results tab and the printed sheet) and star_age_groups ('child' / 'adult' per candidate)
// Each one answers EXACTLY like the SQL: the same order of checks, the same statuses
// (ok · no_access · not_allowed · invalid · not_found · withdrawn · stale · kept) and the same shapes
// ({status, grade, result} for a grade, {status, result} for a count or a choice). The result itself
// (§5.5) comes from star/resultRules.js — the same pure rules the candidates fake uses.
//
// HOW IT IS PLUGGED IN: the grading functions work on the SAME store as the candidates fake (the
// candidates, their grades and make-up subjects), so mockStarCandidates.js adds them to its own list
// of functions: it calls createGradingHandlers(helpers) with its table helpers (insert / update /
// delete rows with the change log, find a candidate, work out a result). That way there is one
// "database" and every write is logged the same way. mockClient.js routes the calls there (they are
// in STAR_CANDIDATE_RPC_NAMES) and uses STAR_GRADING_WRITE_RPC_NAMES for its failure helpers:
//   __tkdPreview.failNextSave() or failNextSave('star')  the next Star grade / count save fails
//   __tkdPreview.setStarOffline(true)    every Star grading call fails like a dropped connection, and
//                                        the browser hears "offline"; setStarOffline(false) → "online"
//   __tkdPreview.simulateStarDanChange('Noah', 2)  "another device" moves a Fall candidate to another
//                                        Dan (grades cleared, v0.164) — the next grade save on the old
//                                        grid answers `stale`
//
// It is PURE: no React, no browser. Rows are the database's snake_case rows.

// The functions' argument lists (name, type) — the same names as migration 0006. The real API finds
// a function by its argument NAMES, so these must match exactly.
// /*#__PURE__*/ (() => …)(): "this has no side effects", so the live build (which never makes the fake
// client) drops these lines — the same trick as mockStarTesting.js.
export const GRADING_RPC_ARGS = /*#__PURE__*/ (() => ({
  star_set_grade: [['p_candidate_id', 'uuid'], ['p_event_category_id', 'uuid'], ['p_grade', 'text']],
  star_set_count: [['p_candidate_id', 'uuid'], ['p_field', 'text'], ['p_value', 'int']],
  star_set_makeup_subjects: [['p_candidate_id', 'uuid'], ['p_expected_category_ids', 'uuid[]'], ['p_category_ids', 'uuid[]']],
  star_event_results: [['p_event_id', 'uuid'], ['p_dan', 'int']],
  star_age_groups: [['p_event_id', 'uuid']],
}))();
// The three writes (the failure helpers target these). The reads are "stable" (they also work as GET).
export const STAR_GRADING_WRITE_RPC_NAMES = ['star_set_grade', 'star_set_count', 'star_set_makeup_subjects'];
export const STAR_GRADING_READ_RPC_NAMES = ['star_event_results', 'star_age_groups'];
export const STAR_GRADING_RPC_NAMES = /*#__PURE__*/ (() => [...STAR_GRADING_WRITE_RPC_NAMES, ...STAR_GRADING_READ_RPC_NAMES])();
// Admin only from the start ("A" in §6.5): checked after has_data_access, like the SQL.
export const STAR_GRADING_ADMIN_ONLY = ['star_set_makeup_subjects'];

const LETTERS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];
const COUNT_FIELDS = ['classes_attended', 'assistant_classes'];
const st = (status) => ({ status });
// star_ids_are_valid: not null, no null entry, no id twice (an empty list is fine).
const idsAreValid = (ids) => Array.isArray(ids) && ids.every((x) => x !== null) && new Set(ids).size === ids.length;
// Byte order, like PGlite (production sorts text with ICU; nothing relies on it beyond a stable order).
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

// Builds the five functions around the candidates fake's helpers:
//   findCandidate(db, id) · findEvent(db, id) · danCopy(db, eventId, dan)
//   resultOf(db, candidateRow) → the §5.5 result (snake_case) · sentStateOf(db, candidateRow, result)
//   newMeta(env, ctx, action) · insertRow / updateRow / deleteRow(db, env, table, row, …, meta)
// Each function is (db, args, { ctx, env }) → the jsonb answer. rpc() has already checked the
// signed-in user, the argument names and types, has_data_access (no_access) and the admin rule.
export function createGradingHandlers(h) {
  return {
    // §6.5 star_set_grade — ordered checks: 3 invalid · 4 not_found · 6 withdrawn → invalid (another
    // event) → stale (another Dan than the CURRENT one, v0.164) → invalid (letter not in the event's
    // copy) → invalid (Assistant Instructor) → kept · 8 insert / update / delete (same grade: no write).
    // No version check: the last save wins, silently (v0.165).
    star_set_grade(db, a, { ctx, env }) {
      if (a.p_candidate_id === null || a.p_event_category_id === null
        || (a.p_grade !== null && !LETTERS.includes(a.p_grade))) return st('invalid');
      const c = h.findCandidate(db, a.p_candidate_id);
      if (!c) return st('not_found');
      const g = db.candidate_grades.find((x) => x.candidate_id === c.id && x.event_category_id === a.p_event_category_id) ?? null;
      if (c.status === 'withdrawn') return st('withdrawn');
      const k = db.event_categories.find((x) => x.id === a.p_event_category_id) ?? null;
      if (!k || k.event_id !== c.event_id) return st('invalid');
      if (k.dan !== c.dan) return st('stale');
      if (a.p_grade !== null && !db.event_grades.some((v) => v.event_id === c.event_id && v.grade === a.p_grade)) return st('invalid');
      if (k.from_class_count) return st('invalid');
      if (g && g.kept) return st('kept');
      const meta = h.newMeta(env, ctx, 'star_set_grade');
      if (a.p_grade === null) {
        if (g) h.deleteRow(db, env, 'star_grades', g, meta);
      } else if (!g) {
        h.insertRow(db, env, 'star_grades', {
          id: env.newId(), candidate_id: c.id, event_category_id: k.id, grade: a.p_grade,
          kept: false, kept_from_event_id: null, kept_from_event_name: null,
        }, meta);
      } else if (g.grade !== a.p_grade) {
        h.updateRow(db, env, 'star_grades', g, { grade: a.p_grade }, meta);
      }
      return { status: 'ok', grade: a.p_grade, result: h.resultOf(db, c) };
    },

    // §6.5 star_set_count — 3 invalid (field, 0–999) · 4 not_found · 6 withdrawn · 8 update (no
    // version bump, but logged). No version check (S6).
    star_set_count(db, a, { ctx, env }) {
      if (a.p_candidate_id === null || a.p_field === null || !COUNT_FIELDS.includes(a.p_field)
        || (a.p_value !== null && (a.p_value < 0 || a.p_value > 999))) return st('invalid');
      const c = h.findCandidate(db, a.p_candidate_id);
      if (!c) return st('not_found');
      if (c.status === 'withdrawn') return st('withdrawn');
      h.updateRow(db, env, 'star_candidates', c, { [a.p_field]: a.p_value }, h.newMeta(env, ctx, 'star_set_count'));
      return { status: 'ok', result: h.resultOf(db, c) };
    },

    // §6.5 star_set_makeup_subjects (admin; not_allowed is checked by rpc()) — 3 invalid · 4 not_found
    // · 5 stale (the chosen set changed since the screen showed it, any order) · 6 withdrawn → invalid
    // (not complete, has a D, or not below the pass mark) → invalid (a subject of another event / Dan)
    // · 8 replace the 'chosen' rows.
    star_set_makeup_subjects(db, a, { ctx, env }) {
      if (a.p_candidate_id === null || !idsAreValid(a.p_expected_category_ids) || !idsAreValid(a.p_category_ids)
        || a.p_category_ids.length === 0) return st('invalid');
      const c = h.findCandidate(db, a.p_candidate_id);
      if (!c) return st('not_found');
      const chosenNow = db.makeup_subjects.filter((m) => m.candidate_id === c.id && m.kind === 'chosen').map((m) => m.event_category_id).sort();
      if (JSON.stringify(chosenNow) !== JSON.stringify([...a.p_expected_category_ids].sort())) return st('stale');
      if (c.status === 'withdrawn') return st('withdrawn');
      const res = h.resultOf(db, c);
      if (!res.complete || res.d_subjects.length > 0 || !(res.total < res.pass_mark)) return st('invalid');
      const ok = (id) => db.event_categories.some((k) => k.id === id && k.event_id === c.event_id && k.dan === c.dan);
      if (!a.p_category_ids.every(ok)) return st('invalid');
      const meta = h.newMeta(env, ctx, 'star_set_makeup_subjects');
      for (const m of db.makeup_subjects.filter((x) => x.candidate_id === c.id && x.kind === 'chosen' && !a.p_category_ids.includes(x.event_category_id))) {
        h.deleteRow(db, env, 'star_makeup_subjects', m, meta);
      }
      for (const id of [...a.p_category_ids].sort()) {
        if (db.makeup_subjects.some((m) => m.candidate_id === c.id && m.kind === 'chosen' && m.event_category_id === id)) continue;
        h.insertRow(db, env, 'star_makeup_subjects', { id: env.newId(), candidate_id: c.id, event_category_id: id, kind: 'chosen' }, meta);
      }
      return { status: 'ok', result: h.resultOf(db, c) };
    },

    // §7 star_event_results — invalid (null) · not_found (event) · invalid (Dan not in the copy).
    // One row per ACTIVE candidate of the Dan (private ones INCLUDED — the screens leave them off the
    // grid), in belt order: stars, Shrewsbury before Worcester, last name, first name, id.
    star_event_results(db, a) {
      if (a.p_event_id === null || a.p_dan === null) return st('invalid');
      const e = h.findEvent(db, a.p_event_id);
      if (!e) return st('not_found');
      const d = h.danCopy(db, e.id, a.p_dan);
      if (!d) return st('invalid');
      const aPlus = db.event_grades.find((v) => v.event_id === e.id && v.grade === 'A+')?.value ?? 0;
      const credits = db.event_categories.filter((k) => k.event_id === e.id && k.dan === a.p_dan).reduce((t, k) => t + k.credits, 0);
      const loc = (c) => (c.location_code === 'shrewsbury' ? 0 : 1);
      const rows = db.candidates
        .filter((c) => c.event_id === e.id && c.dan === a.p_dan && c.status === 'active')
        .sort((x, y) => x.stars_from - y.stars_from || loc(x) - loc(y) || cmp(x.last_name.toLowerCase(), y.last_name.toLowerCase())
          || cmp(x.first_name.toLowerCase(), y.first_name.toLowerCase()) || cmp(x.id, y.id))
        .map((c) => {
          const res = h.resultOf(db, c);
          return { ...res, first_name: c.first_name, last_name: c.last_name, location_code: c.location_code, sent: h.sentStateOf(db, c, res) };
        });
      const countOf = (status) => rows.filter((r) => r.status === status).length;
      return {
        status: 'ok',
        dan: a.p_dan,
        pass_mark: d.pass_mark,
        max_score: Math.round(credits * aPlus * 10) / 10,
        counts: {
          candidates: rows.length, passed: countOf('passed'), makeup: countOf('makeup'),
          not_finished: countOf('not_finished'), testing_privately: countOf('testing_privately'),
        },
        rows,
      };
    },

    // §7 star_age_groups — the group only, never a DOB or an age; active candidates, by id.
    star_age_groups(db, a) {
      if (a.p_event_id === null) return st('invalid');
      const e = h.findEvent(db, a.p_event_id);
      if (!e) return st('not_found');
      const assistant = db.event_assistant.find((x) => x.event_id === e.id);
      if (!assistant) return { status: 'ok', rows: [] }; // the SQL joins the assistant row
      const rows = db.candidates
        .filter((c) => c.event_id === e.id && c.status === 'active')
        .sort((x, y) => cmp(x.id, y.id))
        .map((c) => ({ candidate_id: c.id, age_group: h.resultOf(db, c).ai.age_group }));
      return { status: 'ok', rows };
    },
  };
}
