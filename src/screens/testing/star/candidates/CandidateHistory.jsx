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
import { linesFor } from '../../../../lib/star/candidateHistoryLines.js';
import * as T from './text.js';

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
