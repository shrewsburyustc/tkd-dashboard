// DiscardDialog.jsx — "Discard changes to 1st Dan?" (mockup R10, rulebook v0.928 / v0.932).
// Why it exists: on PC and tablet, every way out of the rubric editor while it has unsaved
// changes asks first: another Dan in the switcher, the other tab, ← Testing, the cycle page's
// tabs, the rail, the account menu and the browser's Back (through App.jsx's leave guard).
// "3 changes aren't saved." Keep editing is the primary (blue) choice and closes the question;
// Discard is a PLAIN button (red is only for delete / remove, §7) that throws the draft away and
// goes where the admin clicked. (Phones use the v0.56 note instead; Cancel in the edit bar
// discards without asking.) The same small box on every device.
import { useId } from 'react';
import Dialog from '../../../components/Dialog.jsx';
import InnerDialog from '../parts/InnerDialog.jsx';
import * as T from '../text.js';

export default function DiscardDialog({ danNo, count, nested = false, onDiscard, onKeep }) {
  const bodyId = useId();
  const Frame = nested ? InnerDialog : Dialog;
  return (
    <Frame title={T.discardTitle(danNo)} variant="confirm" describedBy={bodyId} onRequestClose={onKeep}>
      <p id={bodyId} className="tdialog-sub tdialog-body">
        {T.changesArentSaved(count)}
      </p>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onDiscard}>
          {T.DISCARD}
        </button>
        <button type="button" className="btn btn-primary" data-autofocus onClick={onKeep}>
          {T.KEEP_EDITING}
        </button>
      </div>
    </Frame>
  );
}
