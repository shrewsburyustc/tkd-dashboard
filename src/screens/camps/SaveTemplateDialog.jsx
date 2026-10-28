// SaveTemplateDialog.jsx — "Save as template" (C2b), from a camp's ⋯ menu (admins).
// Why it exists: most camps repeat (every summer week, every vacation week). A template keeps
// everything about a camp except its dates and campers, so the next one is name + days + Save.
// One field: the template name, starting as the camp's name and kept exactly as typed. The note
// says what is kept. A name already used shows the amber line "A template with this name exists.
// Choose another name." (database answer duplicate_name). Saved → toast "Template saved · <name>"
// with Undo for 5 seconds, which deletes the new template (rulebook v0.726).
// A small dialog on every device (the C2b phone frame: "small dialogs stay dialogs on phones").
// Keeps your typing (rulebook v0.728, C18): once the name differs from the camp's, Esc, a click
// outside or Back keep it open with "Unsaved changes. Save or cancel first." under the buttons;
// on phones the note adds "Discard changes" — the same guard as Camps' other dialogs.
//
// Props: camp, onClose, onSaved(name, { id, version }) (the new template — the toast's Undo deletes
//        it, rulebook v0.726), onNoAccess, onRefreshProfile
import { useId, useState } from 'react';
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { saveTemplate } from '../../lib/camps/campsApi.js';
import { nameProblem, normalizeName } from '../../lib/testing/names.js';
import { PHONE_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import * as T from './text.js';

const NAME_PROBLEMS = { empty: T.ENTER_TEMPLATE_NAME, tooLong: T.NAME_TOO_LONG, badCharacter: T.NAME_BAD_CHARACTER };

export default function SaveTemplateDialog({ camp, onClose, onSaved, onNoAccess, onRefreshProfile }) {
  const idBase = useId();
  const [name, setName] = useState(camp.name);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const [duplicate, setDuplicate] = useState(null); // the name the database refused
  const [note, setNote] = useState(null); // a text for the amber box at the bottom
  const [blocked, setBlocked] = useState(false);
  const [unsaved, setUnsaved] = useState(false); // the "Unsaved changes" note is showing
  const isPhone = useMediaQuery(PHONE_QUERY);
  const dirty = normalizeName(name) !== normalizeName(camp.name); // extra spaces alone are no change

  const problem = nameProblem(name);
  const nameError =
    problem && (tried || problem !== 'empty') ? NAME_PROBLEMS[problem] : duplicate !== null && normalizeName(name) === duplicate ? T.DUPLICATE_TEMPLATE : null;
  const canSave = !problem && !saving && !blocked;

  async function handleSubmit(event) {
    event.preventDefault();
    setTried(true);
    if (!canSave || nameError) return;
    setSaving(true);
    setNote(null);
    setUnsaved(false);
    const clean = normalizeName(name);
    const result = await saveTemplate(camp.id, clean);
    setSaving(false);
    if (result.status === 'ok') onSaved(clean, { id: result.id, version: result.version });
    else if (result.status === 'duplicate_name') setDuplicate(clean);
    else if (result.status === 'no_access') onNoAccess();
    else if (result.status === 'not_allowed') {
      setNote(T.CAMPS_NOT_ALLOWED);
      setBlocked(true);
      onRefreshProfile();
    } else if (result.status === 'not_found' || result.status === 'stale') {
      setNote(T.STALE_DIALOG);
      setBlocked(true);
    } else if (result.status === 'invalid') setNote(T.INVALID_DIALOG);
    else setNote(T.SAVE_FAILED);
  }

  // Esc, a click outside or Back. A changed name stays (the note says why), unless a note already
  // says this can't be saved — then there is nothing to keep.
  function requestClose() {
    if (saving) return;
    if (!dirty || blocked) onClose();
    else {
      setNote(null); // a "couldn't save" note gives way to the unsaved one (one note at a time)
      setUnsaved(true);
    }
  }

  return (
    <Dialog title={T.SAVE_TEMPLATE_TITLE} onRequestClose={requestClose}>
      <p className="tdialog-sub">{T.fromCamp(camp.name)}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor={`${idBase}-name`}>{T.TEMPLATE_NAME}</label>
          <input
            id={`${idBase}-name`}
            className="input"
            type="text"
            autoComplete="off"
            data-autofocus
            readOnly={saving}
            value={name}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${idBase}-error` : `${idBase}-hint`}
            onChange={(event) => {
              setName(event.target.value);
              setUnsaved(false);
            }}
          />
          {nameError && <Notice id={`${idBase}-error`}>{nameError}</Notice>}
        </div>
        <p id={`${idBase}-hint`} className="field-hint">
          {T.SAVE_TEMPLATE_HINT}
        </p>
        <div className="dialog-footer">
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => !saving && onClose()}>
              {T.CANCEL}
            </button>
            <button type="submit" className={`btn btn-primary${canSave ? '' : ' is-unavailable'}`} aria-disabled={canSave ? undefined : 'true'}>
              {/* ti-check = Save */}
              <IconCheck size={16} aria-hidden="true" />
              {saving ? T.SAVING : T.SAVE}
            </button>
          </div>
          {note && (
            <div className="tdialog-note">
              <Notice>{note}</Notice>
            </div>
          )}
          {unsaved && !note && (
            <div className="tdialog-note">
              <Notice>
                {T.UNSAVED}
                {isPhone && (
                  <button type="button" className="note-action" onClick={onClose}>
                    {T.DISCARD_CHANGES}
                  </button>
                )}
              </Notice>
            </div>
          )}
        </div>
      </form>
    </Dialog>
  );
}
