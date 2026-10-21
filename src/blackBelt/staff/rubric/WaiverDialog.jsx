// WaiverDialog.jsx — "Edit waiver" (admins): change the waiver text; Save makes a new version.
// Why it exists: approved mockup Cycles 6 (tablet dialog, phone full screen) and rulebook v0.213 /
// v0.905: a change never rewrites the old text — it makes the next version ("2027-2"), and
// registrations already sent keep the version they signed. The hint is OP-3's wording (without a
// count of registrations: no read the app is allowed gives that number).
// Toast after saving: "Waiver saved · version 2027-2". The same text as now saves nothing.
import { useId, useState } from 'react';
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import Notice from '../../../components/Notice.jsx';
import { saveWaiver } from '../../../lib/blackBelt/api.js';
import { waiverBodyProblem } from '../../../lib/blackBelt/rules.js';
import * as T from '../text.js';

const NOTES = { UNSAVED: T.UNSAVED, STALE: T.STALE_SETTINGS, NOT_ALLOWED: T.NOT_ALLOWED, INVALID: T.INVALID };

export default function WaiverDialog({ current, nextVersionName, isPhone, onClose, onSaved, onStale, onNoAccess, onRefreshProfile, clearToast }) {
  const id = useId();
  const startText = current.body;
  const [body, setBody] = useState(startText);
  const [note, setNote] = useState(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tried, setTried] = useState(false);

  const problem = waiverBodyProblem(body);
  const blocked = note === 'STALE' || note === 'NOT_ALLOWED';
  const canSave = !problem && !saving && !blocked;
  const message = problem === 'tooLong' ? T.WAIVER_TOO_LONG : problem === 'empty' && tried ? T.ENTER_WAIVER : null;

  function requestClose() {
    if (saving) return;
    if (body === startText) onClose();
    else if (!blocked) setNote('UNSAVED');
  }

  async function save() {
    if (!canSave) {
      setTried(true);
      return;
    }
    if (body.trim() === current.body.trim()) {
      onClose();
      return;
    }
    setSaving(true);
    setNote(null);
    setFailed(false);
    const result = await saveWaiver({ expectedCurrentId: current.id, body });
    setSaving(false);
    if (result.status === 'ok') {
      onSaved(T.toastWaiverSaved(result.versionName));
      return;
    }
    clearToast();
    if (result.status === 'no_access') onNoAccess();
    else if (result.status === 'not_allowed') {
      setNote('NOT_ALLOWED');
      onRefreshProfile();
    } else if (result.status === 'stale') {
      setNote('STALE');
      onStale();
    } else if (result.status === 'invalid') setNote('INVALID');
    else setFailed(true);
  }

  const saveButton = (
    <button type="submit" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`} aria-disabled={canSave ? undefined : 'true'}>
      <IconCheck size={16} aria-hidden="true" />
      {saving ? T.SAVING : T.SAVE}
    </button>
  );

  return (
    <Dialog title={T.EDIT_WAIVER} size="medium" fullScreen={isPhone} onRequestClose={requestClose}>
      <p className="tdialog-sub">{T.editWaiverSub(current.versionName, current.createdByName, current.createdAt)}</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {failed && <ErrorBanner text={T.SAVE_FAILED} onRetry={save} retrying={saving} />}
        <div className="field">
          <label htmlFor={`${id}-body`}>{T.WAIVER_TEXT}</label>
          <textarea
            id={`${id}-body`}
            className="input bb-waiver-text"
            rows={12}
            data-autofocus
            readOnly={saving}
            value={body}
            aria-invalid={message ? 'true' : undefined}
            aria-describedby={message ? `${id}-error` : `${id}-hint`}
            onChange={(event) => {
              setBody(event.target.value);
              if (!blocked) setNote(null);
            }}
          />
          {message ? (
            <Notice id={`${id}-error`}>{message}</Notice>
          ) : (
            <p id={`${id}-hint`} className="field-hint">
              {T.waiverSaveHint(current.versionName, nextVersionName)}
            </p>
          )}
        </div>
        {note && (
          <div className="tdialog-note">
            <Notice>
              {NOTES[note]}
              {isPhone && (
                <button type="button" className="note-action" onClick={onClose}>
                  {T.DISCARD_CHANGES}
                </button>
              )}
            </Notice>
          </div>
        )}
        {isPhone ? (
          <div className="dialog-page-submit">{saveButton}</div>
        ) : (
          <div className="dialog-footer">
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => !saving && onClose()}>
                {T.CANCEL}
              </button>
              {saveButton}
            </div>
          </div>
        )}
      </form>
    </Dialog>
  );
}
