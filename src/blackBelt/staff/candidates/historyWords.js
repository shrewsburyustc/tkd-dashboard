// historyWords.js — the words of a Black Belt candidate's History line (design review BB8,
// rulebook v0.971 / v0.972, the shared line of v1.010 / v1.108).
// Why it exists: the change log (bb_candidate_history, migration 0032) gives one row per changed
// database row. The History shows plain sentences instead, and some saves change many rows at once,
// so this file does two things — both PURE (no React, no browser), so checks.mjs can run them:
//
//   groupHistory(rows) — a first pass over all the rows (newest first, as the reader gives them):
//     1. It follows each logged row (table + record id) from its insert, oldest change first, so an
//        UPDATE row (which holds only the changed columns) learns the rest of its row: `base`, the
//        row as it was just before that change. That is how "Grade changed: Push-ups 28 → 32" knows
//        the subject. The record id comes with migration 0034 (`recordId`); without it (the live
//        database before 0034) an update gets no base and its words simply leave the subject out.
//     2. It folds a BATCH (rows written at the same moment by one save) into ONE entry:
//        - a Dan change that cleared the old Dan's grades (the candidate's Dan update + the deleted
//          grades, counts and chosen make-up subjects, tagged bb_clear_dan_grading in the database)
//          → "Dan: 1st → 2nd Dan · 18 grades cleared"
//        - Add make-up (the new make-up row + the kept grades / counts copied in + its retest
//          subjects) → "Added as a make-up from Spring 2027 · 12 kept grades copied"
//        - Edit payment (the undo of the old payment + the new payment) → "Payment changed: …"
//     It answers the entries to show, newest first: the rows themselves, some with extra fields
//     (base, cleared, kept, edited, reversed).
//
//   describeEntry(entry, ctx) — the shared line's `describe` for one entry:
//     { text, at, who } · { hiddenPayment: true } (a money change while Hide private details is
//     on) · null (nothing worth a line, e.g. a payment that only moved the candidate's version).
//     ctx = { hidden, rubric, plans }
//       rubric  the cycle's rubric document (rubric.js), or null when it couldn't be read: then
//               grade lines leave the subject out ("Grade changed: 28 → 32") — never an error
//       plans   the cycle's plans [{ id, name }] (for "Plan: In full → 3 payments")
//
// Privacy: the database already masks the date of birth and email ("on file" / "changed"), so the
// History only ever says "Date of birth changed" / "Email for results changed" (v0.907); login
// ids never arrive (bb_history_strip). With hidden on, every payment row (payments, refunds, undos,
// returned checks) is left out and counted for the shared gray line; plan and Kukkiwon lines stay —
// they have no amounts.
import { formatMeasured, subjectIndex, trimScaleText } from '../../../lib/blackBelt/grading.js';
import * as T from '../text.js';

// The tables whose rows are grades-like (named by a subject or an item).
const GRADE = 'bb_grades';
const COUNT = 'bb_extra_counts';
const MAKEUP_SUBJECT = 'bb_makeup_subjects';
const CANDIDATE = 'bb_candidates';
const PAYMENT = 'bb_payments';

const has = (obj, key) => obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
const keyOf = (row) => (row.recordId ? `${row.tableName}|${row.recordId}` : null);

// ===== The first pass =====

export function groupHistory(rows) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
  // Oldest first (the reader gives newest first; rows of the same moment newest first too, so a
  // plain reverse puts every row back in the order it was written).
  const oldestFirst = list.map((row) => ({ ...row })).reverse();

  // 1. Follow each logged row: `base` = the row just before this change.
  const state = new Map();
  for (const entry of oldestFirst) {
    const key = keyOf(entry);
    if (!key) continue;
    const base = state.get(key) ?? null;
    if (base) entry.base = base;
    if (entry.op === 'insert') state.set(key, { ...(entry.after ?? {}) });
    else if (entry.op === 'update') state.set(key, { ...(base ?? {}), ...(entry.after ?? {}) });
    else if (entry.op === 'delete') state.delete(key);
  }

  // Payments are never changed, so their insert rows (which carry their own id) are enough to know
  // what an undo undid — no record id needed.
  const paymentsById = new Map();
  for (const entry of oldestFirst) {
    if (entry.tableName === PAYMENT && entry.op === 'insert' && entry.after?.id) paymentsById.set(entry.after.id, entry.after);
  }

  // 2. Fold the batches: rows of the same moment.
  const moments = new Map();
  for (const entry of oldestFirst) {
    const at = String(entry.occurredAt ?? '');
    if (!moments.has(at)) moments.set(at, []);
    moments.get(at).push(entry);
  }
  const folded = new Set();
  for (const batch of moments.values()) {
    // A Dan change: the candidate's Dan update + the old Dan's grades, counts and chosen subjects deleted
    const danRow = batch.find((e) => e.tableName === CANDIDATE && e.op === 'update' && has(e.after, 'dan'));
    if (danRow) {
      const cleared = { grades: 0, counts: 0, subjects: 0 };
      for (const e of batch) {
        if (e.op !== 'delete') continue;
        const before = e.before ?? {};
        if (e.tableName === GRADE && !before.kept) cleared.grades += 1;
        else if (e.tableName === COUNT && !before.kept) cleared.counts += 1;
        else if (e.tableName === MAKEUP_SUBJECT && before.kind === 'chosen') cleared.subjects += 1;
        else continue;
        folded.add(e);
      }
      danRow.cleared = cleared;
    }
    // Add make-up: the make-up row + what it copied in (kept grades and counts, retest subjects)
    const makeupRow = batch.find((e) => e.tableName === CANDIDATE && e.op === 'insert' && e.after?.source === 'makeup');
    if (makeupRow) {
      const kept = { grades: 0, counts: 0 };
      for (const e of batch) {
        if (e.op !== 'insert') continue;
        if (e.tableName === GRADE && e.after?.kept) kept.grades += 1;
        else if (e.tableName === COUNT && e.after?.kept) kept.counts += 1;
        else if (e.tableName === MAKEUP_SUBJECT && e.after?.kind === 'retest') { /* folded, not counted */ }
        else continue;
        folded.add(e);
      }
      makeupRow.kept = kept;
    }
    // Edit payment: the undo of the old payment + the new payment = one "Payment changed" line
    if (batch.some((e) => e.action === 'bb_edit_payment')) {
      const reversal = batch.find((e) => e.tableName === PAYMENT && e.op === 'insert' && e.after?.kind === 'reversal');
      const payment = batch.find((e) => e.tableName === PAYMENT && e.op === 'insert' && e.after?.kind === 'payment');
      if (reversal && payment) {
        folded.add(reversal);
        payment.edited = true;
      }
    }
  }

  // What each undo undid (payment, refund or returned check)
  for (const entry of oldestFirst) {
    if (entry.tableName === PAYMENT && entry.after?.kind === 'reversal') {
      const original = paymentsById.get(entry.after.reverses_payment_id);
      if (original) entry.reversed = original;
    }
  }

  return oldestFirst.filter((e) => !folded.has(e)).reverse();
}

// ===== The words =====

// The rubric's subject for a Dan and an id: { subject } · undefined (the rubric has no such subject)
// · null (no rubric: the words leave the subject out).
function subjectOf(rubric, dan, subjectId) {
  if (!rubric || !Array.isArray(rubric.dans)) return null;
  const danObj = rubric.dans.find((d) => d?.dan === Number(dan));
  if (!danObj || !subjectId) return undefined;
  return subjectIndex(danObj).get(subjectId);
}

// A subject's name for the words: its name · "a subject" (not in the rubric) · null (no rubric).
function subjectName(found) {
  if (found === null) return null;
  return found?.subject?.name ?? T.HISTORY_SUBJECT_UNKNOWN;
}

// One grade's value as the Grading tab shows it: a letter "B+", or the measured number in the
// way's unit ("28", "2:10") — with the way's name when the subject has two ("Hold 0:45").
function gradeValue(found, values) {
  if (values.letter !== null && values.letter !== undefined) return String(values.letter);
  if (values.measured === null || values.measured === undefined) return T.HISTORY_EMPTY_VALUE;
  const n = Number(values.measured);
  const ways = found?.subject?.ways ?? [];
  const way = ways[Number(values.way)] ?? null;
  const text = (way ? formatMeasured(way.unit, n) : '') || trimScaleText(n) || String(values.measured);
  return ways.length > 1 && way?.name ? `${way.name} ${text}` : text;
}

// "Push-ups 28" (one-way measured) · "Koryo · B+" (a letter, a two-way subject or an unknown one)
// · "28" (no subject name).
function withSubject(found, name, value) {
  if (!name) return value;
  const ways = found?.subject?.ways ?? [];
  const plain = found?.subject?.scoring === 'measured' && ways.length <= 1;
  return plain ? `${name} ${value}` : `${name} · ${value}`;
}

function gradeWords(entry, rubric) {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const base = entry.base ?? null;
  if (entry.op === 'insert') {
    const found = subjectOf(rubric, after.dan, after.subject_id);
    return T.historyGraded(withSubject(found, subjectName(found), gradeValue(found, after)));
  }
  if (entry.op === 'delete') {
    const found = subjectOf(rubric, before.dan, before.subject_id);
    return T.historyGradeCleared(subjectName(found), gradeValue(found, before));
  }
  // An update holds only what changed; nothing about the grade itself → no line
  if (!['letter', 'measured', 'way'].some((k) => has(after, k))) return null;
  // Without the row's insert (before 0034, or past the 500 rows) the subject is unknown: no name
  const found = base ? subjectOf(rubric, base.dan, base.subject_id) : null;
  const pick = (side, k) => (has(side, k) ? side[k] : base?.[k] ?? null);
  const oldValue = gradeValue(found, { letter: pick(before, 'letter'), measured: pick(before, 'measured'), way: pick(before, 'way') });
  const newValue = gradeValue(found, { letter: pick(after, 'letter'), measured: pick(after, 'measured'), way: pick(after, 'way') });
  return T.historyGradeChanged(withSubject(found, subjectName(found), `${oldValue} → ${newValue}`));
}

function countWords(entry) {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  if (entry.op === 'insert') return T.historyExtra(after.item_name ? `${after.item_name} ${after.count}` : String(after.count));
  if (entry.op === 'delete') return T.historyExtraCleared(before.item_name ?? null, before.count);
  if (!has(after, 'count')) return null;
  const name = entry.base?.item_name ?? null;
  const change = `${before.count ?? T.HISTORY_EMPTY_VALUE} → ${after.count}`;
  return T.historyExtra(name ? `${name} ${change}` : change);
}

function makeupSubjectWords(entry, rubric) {
  const row = entry.op === 'delete' ? entry.before ?? {} : entry.after ?? {};
  if (entry.op === 'update') return null; // never changed (only added and removed)
  const name = subjectName(subjectOf(rubric, row.dan, row.subject_id));
  if (row.kind === 'retest') return entry.op === 'insert' ? T.historyRetestAdded(name) : T.historyRetestRemoved(name);
  return entry.op === 'insert' ? T.historyMakeupSubjectAdded(name) : T.historyMakeupSubjectRemoved(name);
}

// The columns of the candidate row that never make a line of their own.
const CANDIDATE_SKIP = new Set(['version', 'withdrawn_reason', 'duplicate_of', 'kukkiwon_added_on', 'age_kept', 'source', 'reference',
  'cycle_id', 'makeup_of_cycle_name', 'id']);

function candidateLines(entry, plans) {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  if (entry.op === 'insert') {
    if (after.source === 'makeup') return [T.historyAddedMakeup(after.makeup_of_cycle_name, entry.kept?.grades ?? 0, entry.kept?.counts ?? 0)];
    return [after.source === 'form' ? T.HISTORY_REGISTERED_FORM : T.HISTORY_ADDED_DESK];
  }
  if (entry.op === 'delete') return []; // a deleted candidate has no history to show
  const show = (v) => (v === null || v === undefined || v === '' ? T.HISTORY_EMPTY_VALUE : String(v));
  const planName = (id) => (id ? plans.find((p) => p.id === id)?.name ?? null : null) ?? T.HISTORY_EMPTY_VALUE;
  // The purge removed the personal details (after the keeping time): one plain line
  const purged = has(after, 'personal_removed_at') && after.personal_removed_at !== null;
  const lines = [];
  for (const key of Object.keys(after)) {
    if (CANDIDATE_SKIP.has(key) || key.endsWith('_at') || key.endsWith('_by') || key.endsWith('_by_name')) {
      if (key === 'personal_removed_at' && purged) lines.push(T.HISTORY_PERSONAL_REMOVED);
      continue;
    }
    switch (key) {
      case 'first_name':
        lines.push(T.historyField(T.FIRST_NAME, show(before.first_name), show(after.first_name)));
        break;
      case 'last_name':
        lines.push(T.historyField(T.LAST_NAME, show(before.last_name), show(after.last_name)));
        break;
      case 'location_code':
        lines.push(T.historyField(T.SCHOOL, show(T.schoolName(before.location_code)), show(T.schoolName(after.location_code))));
        break;
      case 'dan':
        lines.push(T.historyDan(before.dan, after.dan, entry.cleared));
        break;
      case 'cycle_plan_id':
        lines.push(T.historyField(T.ROW_PLAN, planName(before.cycle_plan_id), planName(after.cycle_plan_id)));
        break;
      case 'kukkiwon':
        lines.push(after.kukkiwon ? T.HISTORY_KUKKIWON_ADDED : T.HISTORY_KUKKIWON_REMOVED);
        break;
      case 'date_of_birth':
        if (!purged) lines.push(T.HISTORY_DOB_CHANGED);
        break;
      case 'email_for_results':
        if (!purged) lines.push(T.HISTORY_EMAIL_CHANGED);
        break;
      case 'status':
        if (after.status === 'withdrawn') lines.push(after.withdrawn_reason === 'duplicate_copy' ? T.HISTORY_DUPLICATE_COPY : T.HISTORY_WITHDRAWN);
        else if (before.status === 'withdrawn') lines.push(T.HISTORY_RESTORED);
        break;
      case 'duplicate_state':
        if (after.duplicate_state === 'kept_both') lines.push(T.HISTORY_KEPT_BOTH);
        // "kept this" only for the duplicate choice itself: Withdraw and "keep the other one" also
        // clear the state (with a status change in the same row, which says what happened), and so
        // does the re-check after a name or date of birth edit — those say nothing here.
        else if (after.duplicate_state === 'none' && before.duplicate_state === 'possible') {
          if (entry.action === 'bb_resolve_duplicate' && !('status' in after)) lines.push(T.HISTORY_KEPT_THIS);
        }
        else if (after.duplicate_state === 'possible') lines.push(T.HISTORY_DUPLICATE_FOUND);
        break;
      default:
        break; // a column the History doesn't speak about
    }
  }
  return lines;
}

function waiverWords(entry) {
  const after = entry.after ?? {};
  if (entry.op === 'insert') return after.how === 'paper' ? T.HISTORY_WAIVER_PAPER : T.HISTORY_WAIVER_FORM;
  // The purge removes the signature and the signer's name after the keeping time
  if (entry.op === 'update' && ((has(after, 'signature') && after.signature === null) || (has(after, 'removed_at') && after.removed_at))) {
    return T.HISTORY_SIGNATURE_REMOVED;
  }
  return null;
}

function paymentWords(entry) {
  if (entry.op !== 'insert') return null; // payments are never changed or removed
  const a = entry.after ?? {};
  const cents = Math.abs(Number(a.amount_cents ?? 0));
  if (a.kind === 'payment') return (entry.edited ? T.historyPaymentChanged : T.historyPayment)(cents, a.method, a.paid_on);
  if (a.kind === 'refund') return T.historyRefund(cents, a.method, a.paid_on);
  if (a.kind === 'returned') return T.historyCheckReturned(cents);
  if (a.kind === 'reversal') {
    const kind = entry.reversed?.kind ?? (Number(a.amount_cents) < 0 ? 'payment' : 'refund');
    if (kind === 'returned') return T.historyReturnedUndone(cents);
    return kind === 'refund' ? T.historyRefundUndone(cents) : T.historyPaymentUndone(cents);
  }
  return null;
}

function resultSendWords(entry) {
  if (entry.op === 'insert') return T.historyResultSent(entry.after?.result_status);
  if (entry.op === 'update' && entry.after?.undone_at) return T.HISTORY_RESULT_SENT_UNDONE;
  return null;
}

// The words of one entry (null = no line).
export function entryText(entry, { rubric = null, plans = [] } = {}) {
  switch (entry?.tableName) {
    case CANDIDATE: {
      const lines = candidateLines(entry, Array.isArray(plans) ? plans : []);
      return lines.length > 0 ? lines.join('; ') : null;
    }
    case 'bb_candidate_waivers':
      return waiverWords(entry);
    case PAYMENT:
      return paymentWords(entry);
    case GRADE:
      return gradeWords(entry, rubric);
    case COUNT:
      return countWords(entry);
    case MAKEUP_SUBJECT:
      return makeupSubjectWords(entry, rubric);
    case 'bb_result_sends':
      return resultSendWords(entry);
    default:
      return null;
  }
}

// The shared line's `describe` (HistoryLine.jsx): { text, at, who } · { hiddenPayment } · null.
export function describeEntry(entry, { hidden = false, rubric = null, plans = [] } = {}) {
  if (hidden && entry?.tableName === PAYMENT) return { hiddenPayment: true };
  const text = entryText(entry, { rubric, plans });
  if (!text) return null;
  return { text, at: entry.occurredAt, who: entry.actorName || T.HISTORY_STAFF };
}
