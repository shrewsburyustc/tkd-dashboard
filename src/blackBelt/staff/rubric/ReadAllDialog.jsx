// ReadAllDialog.jsx — "Read all": the whole waiver text, as families see it on the form.
// Why it exists: approved mockup Cycles 6 — the Waiver block shows only the first lines; Read all
// opens the whole text (a dialog on PC and tablet, a full screen on phones). The text is shown as
// plain text with its line breaks kept (never as inserted HTML).
import Dialog from '../../../components/Dialog.jsx';
import * as T from '../text.js';

export default function ReadAllDialog({ waiver, isPhone, onClose }) {
  return (
    <Dialog title={T.WAIVER_TITLE} size="medium" fullScreen={isPhone} onRequestClose={onClose}>
      <p className="tdialog-sub">{T.versionLabel(waiver.versionName)}</p>
      <div className="bb-waiver-full" tabIndex={0}>
        {waiver.body}
      </div>
      {!isPhone && (
        <div className="dialog-actions">
          <button type="button" className="btn" data-autofocus onClick={onClose}>
            {T.CLOSE}
          </button>
        </div>
      )}
    </Dialog>
  );
}
