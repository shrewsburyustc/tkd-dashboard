// CandidateHistory.jsx — the History section of a candidate's detail view (gap mockups G5, G6).
// Why it exists: the change log (star_candidate_history, newest first) turned into plain words:
//   "Oct 20, 2026, 10:05 AM · Dana Ross"
//   "Email for results: kim.family@example.com → alex.kim.home@example.com"
// The newest 5 show, then "Show all (n)" opens the rest in place. Family-form entries name the
// actor "Family form" (the data layer's actor name). On phones the two parts stack (star.css).
// While "Hide private details" is on (v0.506, G6), historyPrivacy(row) from the API says what to
// hide: a date of birth / email line keeps who and when and ends "… changed · details hidden on
// this tablet"; EVERY payment line (payments, refunds, undos, Paying by) is replaced by ONE line
// "Payment history is hidden on this tablet.", so not even "Payment recorded" shows.
// The words for each kind of change are PROPOSALS where the mockups drew no example.
import { historyPrivacy } from '../../../../lib/star/candidatesApi.js';
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

// One change-log row → the words of its line (or several lines for an edit of several fields).
// hiddenDetails: true while Hide private details is on.
function linesFor(row, hiddenDetails) {
  const before = row.before ?? {};
  const after = row.after ?? {};
  if (row.tableName === 'star_payments') {
    const a = row.op === 'insert' ? after : before;
    const cents = Math.abs(a.amount_cents ?? 0);
    if (a.kind === 'payment') return [`Payment recorded: ${T.dollars(cents)} ${T.payingByText(a.method).toLowerCase()}, paid ${T.monthDay(a.paid_on)}`];
    if (a.kind === 'refund') return [`Refund recorded: ${T.dollars(cents)} ${T.payingByText(a.method).toLowerCase()}, ${T.monthDay(a.paid_on)}`];
    if (a.kind === 'reversal') return [(a.amount_cents ?? 0) < 0 ? `Payment undone: ${T.dollars(cents)}` : `Refund undone: ${T.dollars(cents)}`];
    return ['Payment changed'];
  }
  if (row.tableName === 'star_candidate_signatures') {
    if (row.op === 'insert') return ['Signed the acknowledgment on the family form'];
    if ('signature' in after && after.signature === null) return ['Signature removed (90 days after the testing day)'];
    return ['Signature changed'];
  }
  if (row.tableName === 'star_grades') return [row.op === 'delete' ? 'Grade cleared' : 'Grade changed'];
  if (row.tableName === 'star_makeup_subjects') return [row.op === 'insert' ? 'Make-up subject added' : 'Make-up subject changed'];
  if (row.tableName !== 'star_candidates') return ['Changed'];
  if (row.op === 'insert') {
    if (after.is_makeup) return [`Added as a make-up${after.makeup_of_event_name ? ` from ${after.makeup_of_event_name}` : ''}`];
    return [after.source === 'form' ? 'Registered on the family form' : 'Added at the desk'];
  }
  if (row.op === 'delete') return ['Deleted'];
  const lines = [];
  for (const key of Object.keys(after)) {
    if (key === 'version' || key.endsWith('_at') || key.endsWith('_by') || key.endsWith('_by_name')) continue;
    if (key === 'status') {
      if (after.status === 'withdrawn') lines.push(after.withdrawn_reason === 'duplicate_copy' ? 'Moved to Removed as a duplicate copy' : 'Withdrawn');
      else if (before.status === 'withdrawn') lines.push('Restored');
      continue;
    }
    if (key === 'withdrawn_reason') continue;
    if (key === 'duplicate_state') {
      if (after.duplicate_state === 'kept_both') lines.push('Possible duplicate: kept both registrations');
      else if (after.duplicate_state === 'none' && before.duplicate_state === 'possible') lines.push('Possible duplicate: kept this registration');
      else if (after.duplicate_state === 'possible') lines.push('Possible duplicate found');
      continue;
    }
    if (key === 'duplicate_of') continue;
    if (key === 'private_on' || key === 'private_time') {
      if (lines.some((l) => l.startsWith('Private testing') || l.startsWith('Back to'))) continue;
      const day = after.private_on ?? null;
      if (!day && !after.private_time) lines.push('Back to the testing day');
      else lines.push(`Private testing: ${T.weekdayMonthDay(day ?? before.private_on)}, ${startTimeLabel(after.private_time ?? before.private_time)}`);
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
  // says nothing on its own: no line, and the entry is left out below.
  return lines;
}

export default function CandidateHistory({ rows, hidden, showAll, onShowAll }) {
  if (!rows) return null;
  // While details are hidden, payment rows go: one line says so (G6).
  let paymentRows = 0;
  const entries = [];
  for (const row of rows) {
    const privacy = historyPrivacy(row);
    if (hidden && privacy.payment) {
      paymentRows += 1;
      continue;
    }
    const lines = linesFor(row, hidden);
    if (lines.length === 0) continue;
    entries.push({ key: `${row.occurredAt}-${entries.length}`, head: T.historyHead(row.occurredAt, row.actorName), lines });
  }
  if (entries.length === 0 && paymentRows === 0) return <p className="field-hint">{T.HISTORY_EMPTY}</p>;
  const shown = showAll ? entries : entries.slice(0, 5);
  return (
    <div className="st-history">
      <ul className="st-history-list">
        {shown.map((e) => (
          <li key={e.key} className="st-history-item">
            <span className="st-history-head">{e.head}</span>
            {e.lines.map((line) => (
              <span key={line} className="st-history-line">
                {line}
              </span>
            ))}
          </li>
        ))}
      </ul>
      {hidden && paymentRows > 0 && <p className="field-hint">{T.HISTORY_PAYMENTS_HIDDEN}</p>}
      {!showAll && entries.length > 5 && (
        <button type="button" className="link-button st-inline-link" onClick={onShowAll}>
          {T.showAllCount(entries.length)}
        </button>
      )}
    </div>
  );
}
