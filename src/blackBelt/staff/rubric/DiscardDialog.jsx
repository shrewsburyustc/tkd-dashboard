// DiscardDialog.jsx — "Discard changes to 1st Dan?" (mockup R10, rulebook v0.928 / v0.932; the
// button order and look since v1.008, D10a, design review BB19).
// Why it exists: on PC and tablet, every way out of the rubric editor while it has unsaved
// changes asks first: another Dan in the switcher, the other tab, ← Testing, the cycle page's
// tabs, the rail, the account menu and the browser's Back (through App.jsx's leave guard).
// "3 changes aren't saved." It is the shared ConfirmBox (components/ConfirmBox.jsx), like every
// "are you sure?" box in the dashboard: "Keep editing" is on the LEFT and gets the first focus
// (it closes the question; so do Enter, Esc, a click outside and Back), and "Discard" is on the
// RIGHT and red, because it throws the draft away for good and goes where the admin clicked.
// (Phones use the v0.56 note with "Discard changes" instead; Cancel in the edit bar discards
// without asking.) The same small box on every device. `nested` = it opens on top of another
// dialog (the shared box's onTop).
import ConfirmBox from '../../../components/ConfirmBox.jsx';
import * as T from '../text.js';

export default function DiscardDialog({ danNo, count, nested = false, onDiscard, onKeep }) {
  return (
    <ConfirmBox title={T.discardTitle(danNo)} keepLabel={T.KEEP_EDITING} actionLabel={T.DISCARD} loses="forGood" onTop={nested} onKeep={onKeep} onConfirm={onDiscard}>
      {T.changesArentSaved(count)}
    </ConfirmBox>
  );
}
