// mockStarResults.js — the PREVIEW (fake) database for Star testing RESULTS (build phase 6).
// Why it exists: preview mode (npm run dev:preview-mode) runs without Supabase. This file pretends to
// be the Results part of migration 0006 (contract 0006 §6.6) and the result email texts of migration
// 0023 (CONTRACT-0023 §5):
//   star_mark_result_sent    Mark as sent: a snapshot of the result (status, total, needs, key)
//   star_undo_result_sent    Undo: the same person within 10 seconds, admins any time
//   star_results_csv         the admin CSV rows (belt order, active only) + one download log row
//   star_set_result_text     an admin saves one of the three result email texts
// Each one answers EXACTLY like the SQL: the same order of checks, the same statuses
// (ok · no_access · not_allowed · invalid · not_found · withdrawn · stale · not_finished) and the
// same shapes. The text rules are resultEmail.js's resultTextProblem — the same yes / no as the
// database's star_result_text_problem (resultsChecks.mjs feeds both the 0023 test cases).
// star_event_results (with the sent state) and star_candidate_detail (with the email) already live in
// mockStarGrading.js / mockStarCandidates.js; the sent state is mockStarCandidates.sentStateOf, which
// falls back to the newest send that wasn't undone (star_sent_state).
//
// HOW IT IS PLUGGED IN: like mockStarGrading.js — mockStarCandidates.js adds these functions to its own
// list (handlerFor) with its table helpers, so there is one "database" and every write is logged the
// same way. Its store gains two lists: result_texts (star_result_texts, seeded with 0023's starting
// texts) and downloads (star_downloads — never shown in the app; the console shows it with
// __tkdPreview.starDownloads()).
//
// It is PURE: no React, no browser. Rows are the database's snake_case rows.
import { resultTextProblem, STARTING_TEXTS, RESULT_KINDS } from './star/resultEmail.js';
import { netPaidCents, lastUnreversedPayment } from './star/feeRules.js';

// The functions' argument lists (name, type) — the same names as migrations 0006 and 0023.
// /*#__PURE__*/ (() => …)(): "this has no side effects", so the live build drops these lines.
export const RESULTS_RPC_ARGS = /*#__PURE__*/ (() => ({
  star_mark_result_sent: [['p_candidate_id', 'uuid'], ['p_expected_result_key', 'text']],
  star_undo_result_sent: [['p_sent_id', 'uuid']],
  star_results_csv: [['p_event_id', 'uuid'], ['p_dan', 'int']],
  star_set_result_text: [['p_kind', 'text'], ['p_expected_version', 'int'], ['p_body', 'text']],
}))();
// All four WRITE (the CSV writes its download row), so none works as a GET, and failNextSave('star')
// can make any of them fail like a dropped connection.
export const STAR_RESULTS_RPC_NAMES = /*#__PURE__*/ (() => Object.keys(RESULTS_RPC_ARGS))();
// Admin only from the start ("A"): checked after has_data_access, like the SQL.
export const STAR_RESULTS_ADMIN_ONLY = ['star_results_csv', 'star_set_result_text'];

const UNDO_WINDOW_MS = 10 * 1000; // the same person's Undo of Mark as sent (OPEN-16)
const st = (status) => ({ status });
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0); // byte order, like PGlite

// The three seeded result texts (0023 section 4: version 1, by "Database admin", never by a login).
//   at: an ISO timestamp · newId: () => uuid
export function seedResultTexts(at, newId) {
  return RESULT_KINDS.map((kind) => ({
    id: newId(), kind, body: STARTING_TEXTS[kind], version: 1, created_at: at, updated_at: at,
    created_by: null, updated_by: null, created_by_name: 'Database admin', updated_by_name: 'Database admin',
  }));
}

// Builds the four functions around the candidates fake's helpers:
//   findCandidate(db, id) · findEvent(db, id) · danCopy(db, eventId, dan) · resultOf(db, c) ·
//   sentStateOf(db, c, result) · newMeta(env, ctx, action) · insertRow / updateRow(db, env, table, …)
// Each function is (db, args, { ctx, env }) → the jsonb answer. rpc() has already checked the
// signed-in user, the argument names and types, has_data_access (no_access) and the admin rule.
export function createResultsHandlers(h) {
  return {
    // §6.6 star_mark_result_sent — 3 invalid (nulls) · 4 not_found · 6 withdrawn → not_finished (not
    // Passed / Make-up) → stale (the result_key isn't the one the screen showed) · 8 insert the snapshot.
    star_mark_result_sent(db, a, { ctx, env }) {
      if (a.p_candidate_id === null || a.p_expected_result_key === null) return st('invalid');
      const c = h.findCandidate(db, a.p_candidate_id);
      if (!c) return st('not_found');
      if (c.status === 'withdrawn') return st('withdrawn');
      const res = h.resultOf(db, c);
      if (res.status !== 'passed' && res.status !== 'makeup') return st('not_finished');
      if (res.result_key !== a.p_expected_result_key) return st('stale');
      const meta = h.newMeta(env, ctx, 'star_mark_result_sent');
      const row = h.insertRow(db, env, 'star_result_emails', {
        id: env.newId(), candidate_id: c.id, marked_at: meta.at, marked_by: ctx.userId ?? null, marked_by_name: ctx.actorName,
        result_status: res.status, result_total: res.total, result_needs: res.needs, result_key: res.result_key,
        sent_via: 'manual', undone_at: null, undone_by: null, undone_by_name: null,
      }, meta);
      return { status: 'ok', sent_id: row.id, marked_at: row.marked_at };
    },

    // §6.6 star_undo_result_sent — 3 invalid · 4 not_found (the send, then its candidate) · 6 the role
    // rule (the same login less than 10 s after marked_at, or an admin) → not_allowed; already
    // undone → stale · 8 set undone_* (the sent state then falls back to the send before it).
    star_undo_result_sent(db, a, { ctx, env }) {
      if (a.p_sent_id === null) return st('invalid');
      const s = db.result_emails.find((r) => r.id === a.p_sent_id) ?? null;
      if (!s) return st('not_found');
      if (!h.findCandidate(db, s.candidate_id)) return st('not_found');
      const own = s.marked_by !== null && s.marked_by === (ctx.userId ?? null) && Date.parse(s.marked_at) > env.now() - UNDO_WINDOW_MS;
      if (!own && !ctx.isAdmin) return st('not_allowed');
      if (s.undone_at !== null) return st('stale');
      const meta = h.newMeta(env, ctx, 'star_undo_result_sent');
      h.updateRow(db, env, 'star_result_emails', s, { undone_at: meta.at, undone_by: ctx.userId ?? null, undone_by_name: ctx.actorName }, meta);
      return st('ok');
    },

    // §6.6 star_results_csv (admin; not_allowed is checked by rpc()) — 3 invalid (no event, Dan < 1) ·
    // 4 not_found · 6 invalid (a Dan not in the copy) · 8 the download row FIRST, then the rows.
    // Not in the change log (S1): the download log is its own list.
    // Each row carries 0023's three extra keys (section 7): candidate_id · paid_on (the newest payment
    // that still counts — kind 'payment', not reversed; refunds never change it; star_roster's rule,
    // feeRules.lastUnreversedPayment) · sent.result_status (which result that send was for).
    star_results_csv(db, a, { ctx, env }) {
      if (a.p_event_id === null || (a.p_dan !== null && a.p_dan < 1)) return st('invalid');
      const e = h.findEvent(db, a.p_event_id);
      if (!e) return st('not_found');
      if (a.p_dan !== null && !h.danCopy(db, e.id, a.p_dan)) return st('invalid');
      const list = db.candidates.filter((c) => c.event_id === e.id && c.status === 'active' && (a.p_dan === null || c.dan === a.p_dan));
      db.downloads = Array.isArray(db.downloads) ? db.downloads : [];
      db.downloads.push({
        id: env.newId(), event_id: e.id, event_name: e.name, dan: a.p_dan, row_count: list.length,
        downloaded_at: new Date(env.now()).toISOString(), downloaded_by: ctx.userId ?? null, downloaded_by_name: ctx.actorName,
      });
      const loc = (c) => (c.location_code === 'shrewsbury' ? 0 : 1);
      const rows = [...list]
        .sort((x, y) => x.dan - y.dan || x.stars_from - y.stars_from || loc(x) - loc(y)
          || cmp(x.last_name.toLowerCase(), y.last_name.toLowerCase()) || cmp(x.first_name.toLowerCase(), y.first_name.toLowerCase()) || cmp(x.id, y.id))
        .map((c) => {
          const res = h.resultOf(db, c);
          const s = h.sentStateOf(db, c, res);
          const payments = db.payments.filter((p) => p.candidate_id === c.id);
          const paid = netPaidCents(payments);
          return {
            candidate_id: c.id, dan: c.dan, first_name: c.first_name, last_name: c.last_name, location_code: c.location_code,
            stars_from: c.stars_from, stars_to: c.stars_from + 1, date_of_birth: c.date_of_birth, email_for_results: c.email_for_results,
            paying_by: c.paying_by, is_makeup: c.is_makeup, paid: paid > 0, paid_cents: paid,
            paid_on: lastUnreversedPayment(payments)?.paid_on ?? null,
            classes_attended: c.classes_attended, assistant_classes: c.assistant_classes,
            total: res.total, result_status: res.status, needs: res.needs,
            sent: s.sent === null ? null : { marked_at: s.sent.marked_at, marked_by_name: s.sent.marked_by_name, result_status: s.sent.result_status, matches: s.matches },
          };
        });
      return { status: 'ok', rows };
    },

    // CONTRACT-0023 §5 star_set_result_text (admin) — 3 invalid (a null, or the text breaks a rule) ·
    // 4 not_found · 5 stale (the version the dialog opened with) · 8 save (the same text: nothing
    // written, nothing logged, still ok). Stored exactly as sent.
    star_set_result_text(db, a, { ctx, env }) {
      if (a.p_kind === null || a.p_expected_version === null || a.p_body === null
        || resultTextProblem(a.p_kind, a.p_body) !== null) return st('invalid');
      const t = (db.result_texts ?? []).find((x) => x.kind === a.p_kind) ?? null;
      if (!t) return st('not_found');
      if (t.version !== a.p_expected_version) return st('stale');
      h.updateRow(db, env, 'star_result_texts', t, { body: a.p_body }, h.newMeta(env, ctx, 'star_set_result_text'));
      return { status: 'ok', version: t.version, body: a.p_body };
    },
  };
}
