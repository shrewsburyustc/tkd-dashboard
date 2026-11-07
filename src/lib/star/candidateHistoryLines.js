// candidateHistoryLines.js - turns ONE change-log row of a Star candidate into the plain words the
// History line shows (rolling check R1-03, rulebook v1.010 / v0.518).
// Why it exists: the words used to live inside CandidateHistory.jsx, which also skipped every column
// whose name ENDS in "_by" - and that quietly threw away paying_by, so a "Paying by: Cash to Check"
// change never showed. Now the skip is by exact name (who/when bookkeeping columns only), and the
// rules sit in a plain .js file so candidatesChecks.mjs can test them without a browser.
// Plain English: a "bookkeeping column" is one the database fills in by itself (who changed the row,
// when, which version). Those are never shown as a change. paying_by is a real field a person
// chooses, so it is shown. While Hide private details is on, the History screen hides payment rows
// (historyPrivacy) and a Paying by change is one of them, so it stays out of the list there.
import { startTimeLabel } from './starEventRules.js';
import * as T from '../../screens/testing/star/candidates/text.js';

// The columns the database fills in by itself. Matched by NAME, never by how a name ends.
const BOOKKEEPING_COLUMNS = new Set(['version', 'created_by', 'updated_by', 'withdrawn_by']);
export function isBookkeepingColumn(key) {
  return BOOKKEEPING_COLUMNS.has(key) || key.endsWith('_at') || key.endsWith('_by_name');
}

const FIELD_LABELS = {
  first_name: T.FIRST_NAME,
  last_name: T.LAST_NAME,
  date_of_birth: T.DOB,
  email_for_results: T.EMAIL,
  location_code: T.SCHOOL_LABEL,
  dan: T.CURRENT_DAN,
  stars_from: T.STARS_NOW,
  paying_by: T.PAYING_BY,
};

function showValue(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  switch (key) {
    case 'date_of_birth':
      return T.monthDayYear(value);
    case 'location_code':
      return T.schoolName(value);
    case 'dan':
      return T.danLabelOf(value);
    case 'stars_from':
      return T.starsText(value);
    case 'paying_by':
      return T.payingByText(value);
    default:
      return String(value);
  }
}

// One change-log row → the words of its changes (several for an edit of several fields).
// hiddenDetails: true while Hide private details is on.
export function linesFor(row, hiddenDetails) {
  const before = row.before ?? {};
  const after = row.after ?? {};
  if (row.tableName === 'star_payments') {
    const a = row.op === 'insert' ? after : before;
    const cents = Math.abs(a.amount_cents ?? 0);
    if (a.kind === 'payment') return [T.historyPayment(cents, a.method, a.paid_on)];
    if (a.kind === 'refund') return [T.historyRefund(cents, a.method, a.paid_on)];
    if (a.kind === 'reversal') return [(a.amount_cents ?? 0) < 0 ? T.historyPaymentUndone(cents) : T.historyRefundUndone(cents)];
    return [T.HISTORY_PAYMENT_CHANGED];
  }
  if (row.tableName === 'star_result_emails') {
    // Mark as sent (Results tab) and its undo (Q3 A, v0.518)
    if (row.op === 'insert') return [T.historyResultSent(after.result_status)];
    if (after.undone_at) return [T.HISTORY_RESULT_SENT_UNDONE];
    return [T.HISTORY_CHANGED];
  }
  if (row.tableName === 'star_candidate_signatures') {
    if (row.op === 'insert') return [T.HISTORY_SIGNED];
    if ('signature' in after && after.signature === null) return [T.HISTORY_SIGNATURE_REMOVED];
    return [T.HISTORY_SIGNATURE_CHANGED];
  }
  if (row.tableName === 'star_grades') return [row.op === 'delete' ? T.HISTORY_GRADE_CLEARED : T.HISTORY_GRADE_CHANGED];
  if (row.tableName === 'star_makeup_subjects') return [row.op === 'insert' ? T.HISTORY_MAKEUP_SUBJECT_ADDED : T.HISTORY_MAKEUP_SUBJECT_CHANGED];
  if (row.tableName !== 'star_candidates') return [T.HISTORY_CHANGED];
  if (row.op === 'insert') {
    if (after.is_makeup) return [T.historyAddedMakeup(after.makeup_of_event_name)];
    return [after.source === 'form' ? T.HISTORY_REGISTERED_FORM : T.HISTORY_ADDED_DESK];
  }
  if (row.op === 'delete') return [T.HISTORY_DELETED];
  const lines = [];
  for (const key of Object.keys(after)) {
    if (isBookkeepingColumn(key)) continue;
    if (key === 'status') {
      if (after.status === 'withdrawn') lines.push(after.withdrawn_reason === 'duplicate_copy' ? T.HISTORY_DUPLICATE_COPY : T.HISTORY_WITHDRAWN);
      else if (before.status === 'withdrawn') lines.push(T.HISTORY_RESTORED);
      continue;
    }
    if (key === 'withdrawn_reason') continue;
    if (key === 'duplicate_state') {
      if (after.duplicate_state === 'kept_both') lines.push(T.HISTORY_KEPT_BOTH);
      else if (after.duplicate_state === 'none' && before.duplicate_state === 'possible') lines.push(T.HISTORY_KEPT_THIS);
      else if (after.duplicate_state === 'possible') lines.push(T.HISTORY_DUPLICATE_FOUND);
      continue;
    }
    if (key === 'duplicate_of') continue;
    if (key === 'private_on' || key === 'private_time') {
      if (lines.some((l) => l.startsWith(T.PRIVATE) || l === T.HISTORY_BACK_TO_DAY)) continue;
      const day = after.private_on ?? null;
      if (!day && !after.private_time) lines.push(T.HISTORY_BACK_TO_DAY);
      else lines.push(T.historyPrivate(T.weekdayMonthDay(day ?? before.private_on), startTimeLabel(after.private_time ?? before.private_time)));
      continue;
    }
    const label = FIELD_LABELS[key];
    if (!label) continue;
    if (hiddenDetails && (key === 'date_of_birth' || key === 'email_for_results')) {
      lines.push(T.hiddenFieldChanged(label));
      continue;
    }
    lines.push(`${label}: ${showValue(key, before[key])} → ${showValue(key, after[key])}`);
  }
  // An update that only moved the row's version (a payment or refund touches the candidate too)
  // says nothing on its own: no words, and the entry is left out.
  return lines;
}
