// history.js — the reader a Black Belt candidate's History line uses (design review BB8,
// rulebook v1.010 / v0.972; migration 0032's bb_candidate_history, + record_id from 0034).
// Why it exists: the shared History line (src/components/HistoryLine.jsx) takes a `load()` that
// gives back the rows or THROWS — on a throw it shows its amber bar with Retry. api.js never
// throws (every call there answers { status }), so this small wrapper turns a refusal into a
// thrown error, exactly as Star's CandidateHistory.jsx does with its own reader.
//
// Used by src/blackBelt/staff/candidates/CandidateHistory.jsx (the line at the end of the
// candidate's details), which groups the rows and words them with historyWords.js.
//
//   historyReader(candidateId, onNoAccess) → an async function: the candidate's HistoryRow[]
//     (api.js loadCandidateHistory; newest first), or a thrown Error. A no_access answer also
//     calls onNoAccess() (the lock screen), as every other Black Belt read does.
import { loadCandidateHistory } from './api.js';

export function historyReader(candidateId, onNoAccess) {
  return async () => {
    const answer = await loadCandidateHistory({ candidateId });
    if (answer.status === 'ok') return answer.rows;
    if (answer.status === 'no_access') onNoAccess?.();
    throw new Error(`bb_candidate_history: ${answer.status}`);
  };
}
