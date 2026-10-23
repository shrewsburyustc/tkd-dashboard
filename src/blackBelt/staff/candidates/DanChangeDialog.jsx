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
//   - Cancel (back to Edit details, nothing saved) and the red "Change Dan and clear 9 grades"
//     (", 4 counts") — red because it deletes (DC 2). The cleared grades stay in the change log.
//   - PC and tablet: a centred box (44px buttons on touch, from the touch styles); phones: a full
//     screen with the buttons stacked, the red one on top (DC 3)
//   - someone graded meanwhile: the red button's answer is has_grades with the NEW counts; the
//     question stays open with them and says "Alex Kim's grades changed. Check the number and try
//     again." (DC 5)
// This file only draws; useCandidateActions.js keeps the state and makes the call.
import { useId } from 'react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { ICONS } from './icons.js';
import * as T from '../text.js';

export default function DanChangeDialog({ state, isPhone, onConfirm, onCancel }) {
  const bodyId = useId();
  const name = T.candidateName(state.candidate);
  const off = state.saving || state.blocking;
  const Trash = ICONS.deleteForever;
  const note = state.failed ? T.SAVE_FAILED : state.note;

  const cancelButton = (
    <button type="button" className={`btn${isPhone ? ' btn-block' : ''}`} data-autofocus onClick={onCancel}>
      {T.CANCEL}
    </button>
  );
  const clearButton = (
    <button
      type="button"
      className={`btn btn-delete${isPhone ? ' btn-block' : ''}${off ? ' is-unavailable' : ''}`}
      aria-disabled={off ? 'true' : undefined}
      onClick={() => !off && onConfirm()}
    >
      <Trash size={16} aria-hidden="true" />
      {state.saving ? T.SAVING : T.clearGradesButton(state.counts)}
    </button>
  );

  return (
    <Dialog
      title={T.changeDanTitle(name, state.newDan)}
      variant={isPhone ? 'form' : 'confirm'}
      size="detail"
      fullScreen={isPhone}
      describedBy={bodyId}
      onRequestClose={() => !state.saving && onCancel()}
    >
      <p id={bodyId} className="tdialog-sub tdialog-body">
        {T.changeDanBody(state.counts, state.oldDan, state.newDan)}
      </p>
      {isPhone ? (
        // Phones (DC 3): stacked, the red button on top
        <div className="bb-dan-change-stack">
          {clearButton}
          {cancelButton}
        </div>
      ) : (
        <div className="dialog-actions bb-dan-change">
          {cancelButton}
          {clearButton}
        </div>
      )}
      {/* The note comes right after the buttons (as every confirm box, v0.81) */}
      {note && (
        <div className="tdialog-note">
          <Notice>{note}</Notice>
        </div>
      )}
    </Dialog>
  );
}
