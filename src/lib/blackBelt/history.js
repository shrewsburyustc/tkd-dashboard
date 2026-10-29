// history.js — the reader a Black Belt candidate's History line will use (design review BB8,
// rulebook v1.010; migration 0032's bb_candidate_history).
// Why it exists: the shared History line (src/components/HistoryLine.jsx) takes a `load()` that
// gives back the rows or THROWS — on a throw it shows its amber bar with Retry. api.js never
// throws (every call there answers { status }), so this small wrapper turns a refusal into a
// thrown error, exactly as Star's CandidateHistory.jsx does with its own reader.
//
// NOT USED ON SCREEN YET: the history line inside the candidate's summary (CandidateDialog) and
// the words for each row come in their own step, after Jeffrey has seen the mockup. Until then
// nothing imports this file (the preview store's bb_candidate_history is checked in checks.mjs).
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
