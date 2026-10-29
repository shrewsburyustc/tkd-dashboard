// CandidateHistory.jsx — the History line at the end of a candidate's summary (gap mockups G5, G6;
// design review S6, rulebook v1.010 / v1.108 / v0.518).
// Why it exists: the change log (star_candidate_history, newest first) turned into plain words, drawn
// by the shared one-line history (components/HistoryLine.jsx): "History · 15 changes ›", and a tap
// opens the list in place — what changed, then the date only and who:
//   "Email for results: kim.family@example.com → alex.kim.home@example.com"
//   "Oct 20 · Dana Ross"
// An edit of several fields is ONE entry, its changes joined with "; " (DR2-P5, choice A). Family-form
// entries name the actor "Family form" (the data layer's actor name). Login ids never reach the
// screen: the database strips them (star_history_strip) before the reader gets the rows.
// The reader THROWS when the answer isn't ok, so a failed read shows the shared amber bar with Retry
// (never "no changes yet" for a failure).
// While "Hide private details" is on (v0.506, G6), historyPrivacy(row) from the API says what to
// hide: a date of birth / email change keeps who and when and reads "… changed · details hidden on
// this tablet"; every payment row (payments, refunds, undos, a Paying by change) is left out, and
// the shared line says "Payment history is hidden on this tablet." The "Registered on the family
// form" / "Added at the desk" line stays (it shows no money; Q4 A, v0.518).
// The words for each kind of change are PROPOSALS where the mockups drew no example.
import HistoryLine from '../../../../components/HistoryLine.jsx';
import { historyPrivacy, loadCandidateHistory } from '../../../../lib/star/candidatesApi.js';
import { startTimeLabel } from '../../../../lib/star/starEventRules.js';
import * as T from './text.js';

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
function linesFor(row, hiddenDetails) {
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
    if (key === 'version' || key.endsWith('_at') || key.endsWith('_by') || key.endsWith('_by_name')) continue;
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

// The shared line's words for one row (HistoryLine's `describe`): { text, at, who }, or
// { hiddenPayment: true } for a money row while details are hidden, or null (nothing to show).
export function describeHistoryRow(row, { hidden }) {
  if (hidden && historyPrivacy(row).payment) return { hiddenPayment: true };
  const lines = linesFor(row, hidden);
  if (lines.length === 0) return null;
  return { text: lines.join('; '), at: row.occurredAt, who: row.actorName || T.HISTORY_STAFF };
}

// The reader: the candidate's history rows, or a thrown error (HistoryLine then shows its amber bar
// with Retry). no_access takes the house path (the lock screen) as well.
export function historyReader(candidateId, onNoAccess) {
  return async () => {
    const answer = await loadCandidateHistory(candidateId);
    if (answer.status === 'ok') return answer.rows;
    if (answer.status === 'no_access') onNoAccess?.();
    throw new Error(`star_candidate_history: ${answer.status}`);
  };
}

export default function CandidateHistory({ candidateId, hidden, onNoAccess }) {
  return <HistoryLine load={historyReader(candidateId, onNoAccess)} describe={describeHistoryRow} hidden={hidden} />;
}
