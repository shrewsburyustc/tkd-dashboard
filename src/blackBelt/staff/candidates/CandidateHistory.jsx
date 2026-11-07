// CandidateHistory.jsx — the History line at the end of a Black Belt candidate's details (design
// review BB8, rulebook v0.971 / v0.972; the shared line of v1.010 / v1.108; a copy of Star's
// CandidateHistory.jsx and Camps' CamperHistory.jsx).
// Why it exists: who registered a candidate, changed their school or Dan, recorded a payment or
// entered a grade could only be found in the database. Now the details end with the shared
// one-line history (components/HistoryLine.jsx): "History · 7 changes ›"; a tap opens the list in
// place, newest first — what changed, then "Mar 20 · Jeffrey Berg" (or "Family form").
//   - It reads when it appears (the details open), never before: the details paint first.
//   - The reader THROWS when the answer isn't ok, so a failed read shows the shared amber bar with
//     Retry, never "no changes yet"; no_access also takes the house path (the lock screen).
//   - Subject names (for "Graded: Push-ups 28") come from the cycle's own rubric, read at the same
//     time as the history. If the rubric can't be read, the grade lines simply leave the subject
//     out ("Grade changed: 28 → 32") — the History never fails because of it.
//   - The words and the batches (a Dan change, Add make-up, Edit payment = one line each) live in
//     historyWords.js (plain JavaScript, checked by src/lib/blackBelt/checks.mjs).
//   - Hide private details on (`hidden`): money changes are left out of the count and the list,
//     with "Payment history is hidden on this tablet." (the shared line does that part). Plan and
//     Kukkiwon changes are left out the same way (approved by Jeffrey 2026-11-06, step 1: v0.972 kept them;
//     v1.036 hides the plan — historyWords.js).
// Login ids never reach the screen: the database leaves them out before the app gets the rows.
//
// Props: candidateId, cycle (the cycle page's cycle: id, plans [{ id, name }]), hidden, onNoAccess
import HistoryLine from '../../../components/HistoryLine.jsx';
import { loadCycleRubric } from '../../../lib/blackBelt/api.js';
import { historyReader } from '../../../lib/blackBelt/history.js';
import { describeEntry, groupHistory } from './historyWords.js';

// The reader: the history rows (grouped into entries) and the cycle's rubric, read together. The
// rubric is a "nice to have": a failed read gives null (grade lines without the subject).
export function candidateHistoryLoader(candidateId, cycleId, onNoAccess) {
  const readRows = historyReader(candidateId, onNoAccess);
  return async () => {
    const [rows, rubricAnswer] = await Promise.all([
      readRows(),
      cycleId ? loadCycleRubric({ cycleId }).catch(() => null) : Promise.resolve(null),
    ]);
    const rubric = rubricAnswer?.status === 'ok' ? rubricAnswer.rubric : null;
    // Each entry carries the rubric it is worded with (HistoryLine's describe sees one entry at a time)
    return groupHistory(rows).map((entry) => ({ entry, rubric }));
  };
}

export default function CandidateHistory({ candidateId, cycle, hidden = false, onNoAccess }) {
  const plans = (cycle?.plans ?? []).map((p) => ({ id: p.id, name: p.name }));
  return (
    <HistoryLine
      load={candidateHistoryLoader(candidateId, cycle?.id ?? null, onNoAccess)}
      describe={(item, { hidden: hiddenNow }) => describeEntry(item.entry, { hidden: hiddenNow, rubric: item.rubric, plans })}
      hidden={hidden}
    />
  );
}
