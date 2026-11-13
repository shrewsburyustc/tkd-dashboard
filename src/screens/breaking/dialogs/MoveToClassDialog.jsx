// MoveToClassDialog.jsx — the ⋯ menu's "Move to class…" on the Board breaking roster.
// Why it exists: moving a student to another class time is the most common fix on the night (they came to
// the wrong class), so it has its own small box instead of the whole Edit student form (picture "The ⋯ menu").
// It asks one thing, the class (the same chips Add / Edit student use), and saves with brk_edit_registration with
// every other field exactly as it was, so the amount and Square link are untouched. Same save rules as the other
// dialogs: one save at a time, an amber note when it fails or someone else changed the student first.
//
// Props: registration (the roster row), classes [{ id, name, startTime, endTime, sort }], isPhone,
//   onClose(), onSaved({ kind: 'moved', name }), onNoAccess(), onRefreshProfile(), showToast / clearToast.
import { useId, useRef, useState } from 'react';
import ChoiceGroup from '../../../components/ChoiceGroup.jsx';
import Dialog from '../../../components/Dialog.jsx';
import { editRegistration } from '../../../lib/breaking/breakingApi.js';
import { classChipLabel } from '../../../lib/breaking/breakingRules.js';
import * as T from '../../../lib/breaking/text/dialogs.js';
import DialogFooter, { NOTES, noteForStatus } from './DialogFooter.jsx';
import '../../../styles/breaking-dialogs.css';

export default function MoveToClassDialog({ registration, classes, isPhone = false, onClose, onSaved, onNoAccess, onRefreshProfile, showToast }) {
  const idBase = useId();
  const sorted = [...classes].sort((a, b) => a.sort - b.sort);
  const [classId, setClassId] = useState(registration.classId);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);
  const savingRef = useRef(false); // a double press can't start two saves
  const name = `${registration.firstName} ${registration.lastName}`;
  const dirty = classId !== registration.classId;
  const blocked = Boolean(note?.blocking);

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving || blocked || savingRef.current) return;
    if (!dirty) {
      onClose();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setNote(null);
    const result = await editRegistration(registration.id, registration.version, {
      firstName: registration.firstName, lastName: registration.lastName, age: registration.age, rankName: registration.rankName, classId,
      tech: registration.techBoards, adult: registration.adultBoards, payingBy: registration.payingBy,
    });
    savingRef.current = false;
    setSaving(false);
    if (result.status === 'ok') {
      const to = sorted.find((c) => c.id === classId);
      showToast?.(T.movedToast(name, to?.name ?? ''));
      onSaved?.({ kind: 'moved', name, classId });
      onClose();
      return;
    }
    if (result.status === 'no_access') {
      onNoAccess?.();
      return;
    }
    if (result.status === 'not_allowed') onRefreshProfile?.();
    setNote(noteForStatus(result.status));
  }
  function requestClose() {
    if (saving) return;
    if (!dirty || blocked) onClose();
    else setNote(NOTES.unsaved);
  }

  return (
    <Dialog title={T.MOVE_TITLE} fullScreen={isPhone} onRequestClose={requestClose} busy={saving}>
      <p className="tdialog-sub">{T.moveSub(name)}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <span id={`${idBase}-class`} className="field-label">
            {T.CLASS_LABEL}
          </span>
          <ChoiceGroup autoFocus labelId={`${idBase}-class`} variant="chips" value={classId} readOnly={saving} options={sorted.map((c) => ({ key: c.id, label: classChipLabel(c) }))}
            onChange={(id) => { setClassId(id); if (note && !note.blocking) setNote(null); }} />
        </div>
        <DialogFooter saving={saving} note={note} isPhone={isPhone} canSave={!saving && !blocked} onCancel={() => !saving && onClose()} saveLabel={T.MOVE_BUTTON} />
      </form>
    </Dialog>
  );
}
