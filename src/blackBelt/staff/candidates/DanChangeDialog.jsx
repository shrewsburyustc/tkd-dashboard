// DanChangeDialog.jsx — "Change Alex Kim to 2nd Dan?" — the question before a Dan change clears
// grades (rulebook Q-G4 v0.951, dialog v0.955; mockup TKD-BlackBelt-DanChange-Mockup.html DC 1–5).
// Why it exists: grades belong to the Dan's own subjects, so a candidate who changes Dan after
// grading started loses the grades of the old Dan. The dashboard never does that silently:
//   - it is shown ONLY when Edit details' Save answered has_grades (nothing was saved yet). No
//     grades for the old Dan → Save just saves, no question (DC 4). A make-up row has no Dan field.
//   - the body names what is cleared: "The 9 grades entered for 1st Dan subjects will be cleared.
//     2nd Dan has different subjects. This can't be undone." — with extra-point counts or chosen
//     make-up subjects too: "The 9 grades and 4 extra-point counts entered for 1st Dan will be
//     cleared. …" (DC 1)
//   - "Keep 1st Dan" (the current Dan, as Star's; back to Edit details, nothing saved) on the left,
//     and the red "Change Dan and clear 9 grades" (", 4 counts") on the right — red because it
//     deletes (DC 2). The cleared grades stay in the change log.
//   - someone graded meanwhile: the red button's answer is has_grades with the NEW counts; the
//     question stays open with them and says "Alex Kim's grades changed. Check the number and try
//     again." (DC 5)
// Since BB7 / BB19 (rulebook v1.008 / v1.103, D10a) it is the shared confirm box
// (components/ConfirmBox.jsx): the same small box on EVERY device (phones used to get v0.955's
// full-screen page with the red button on top), the safe button on the left and first focus, the
// red one on the right; while it works the red button says "Changing…", both gray, and Esc, a
// click outside and Back wait. A long red label puts the two buttons one under the other, the
// box measures that itself.
// This file only draws; useCandidateActions.js keeps the state and makes the call.
import ConfirmBox from '../../../components/ConfirmBox.jsx';
import { ICONS } from './icons.js';
import * as T from '../text.js';

export default function DanChangeDialog({ state, onConfirm, onCancel }) {
  const name = T.candidateName(state.candidate);
  return (
    <ConfirmBox
      title={T.changeDanTitle(name, state.newDan)}
      keepLabel={T.keepDan(state.oldDan)}
      actionLabel={T.clearGradesButton(state.counts)}
      actionIcon={ICONS.deleteForever}
      busyLabel={T.CHANGING}
      loses="forGood"
      busy={state.saving}
      actionUnavailable={state.blocking}
      failed={state.failed ? T.SAVE_FAILED : state.note}
      onKeep={onCancel}
      onConfirm={onConfirm}
    >
      {T.changeDanBody(state.counts, state.oldDan, state.newDan)}
    </ConfirmBox>
  );
}
