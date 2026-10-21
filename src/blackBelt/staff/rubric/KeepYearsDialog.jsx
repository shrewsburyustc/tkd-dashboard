// KeepYearsDialog.jsx — "Keeping signed waivers" (admins): how many years signed waivers (and,
// v0.907, the date of birth and email) are kept.
// Why it exists: contract CONTRACT-0016-B1 OP-8 (not drawn in the mockups): rulebook v0.213 /
// v0.906 / v0.907 — two numbers, both empty (nothing is ever deleted, until the insurer answers)
// or both whole years from 3 to 20, written inside the approved sentence:
//   "Keep signed waivers for [N1] years after the last testing day. For a candidate under 18:
//    until [N2] years after they turn 18, if that's later."
// Saving can delete personal details AT ONCE, so it is two steps (bb_set_keep_years):
//   1. setKeepYears(confirmCount: null) → 'confirm_needed' + how many candidates it would remove
//   2. 0 → saved straight away; more than 0 → "Saving deletes the signature, signer's name, date of
//      birth and email of N candidates now. This can't be undone." · Save and delete (red)
// Toast "Keeping time saved".
import { useId, useState } from 'react';
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import Notice from '../../../components/Notice.jsx';
import { setKeepYears } from '../../../lib/blackBelt/api.js';
import { keepYearsProblem } from '../../../lib/blackBelt/rules.js';
import ConfirmDialog from '../parts/ConfirmDialog.jsx';
import * as T from '../text.js';

const NOTES = { UNSAVED: T.UNSAVED, STALE: T.STALE_SETTINGS, NOT_ALLOWED: T.NOT_ALLOWED, INVALID: T.INVALID };
const toText = (n) => (Number.isInteger(n) ? String(n) : '');
// '' → null; "5" → 5; anything else → NaN (keepYearsProblem says 'outOfRange').
const toNumber = (text) => {
  const t = String(text).trim();
  if (t === '') return null;
  return /^\d{1,2}$/.test(t) ? Number(t) : Number.NaN;
};

export default function KeepYearsDialog({ settings, isPhone, onClose, onSaved, onStale, onNoAccess, onRefreshProfile, clearToast }) {
  const id = useId();
  const start = { n1: toText(settings.afterLastDay), n2: toText(settings.after18) };
  const [n1, setN1] = useState(start.n1);
  const [n2, setN2] = useState(start.n2);
  const [note, setNote] = useState(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState(null); // { count } while asking "Save and delete?"

  const a = toNumber(n1);
  const b = toNumber(n2);
  const problem = keepYearsProblem(a, b);
  const blocked = note === 'STALE' || note === 'NOT_ALLOWED';
  const canSave = !problem && !saving && !blocked;
  const dirty = n1 !== start.n1 || n2 !== start.n2;

  function requestClose() {
    if (saving) return;
    if (confirm) {
      setConfirm(null);
      return;
    }
    if (!dirty) onClose();
    else if (!blocked) setNote('UNSAVED');
  }

  function handleProblem(status) {
    clearToast();
    if (status === 'no_access') onNoAccess();
    else if (status === 'not_allowed') {
      setNote('NOT_ALLOWED');
      onRefreshProfile();
    } else if (status === 'stale') {
      setNote('STALE');
      onStale();
    } else if (status === 'invalid') setNote('INVALID');
    else setFailed(true);
  }

  async function secondStep(count) {
    setSaving(true);
    const result = await setKeepYears({ expectedVersion: settings.version, afterLastDay: a, after18: b, confirmCount: count });
    setSaving(false);
    setConfirm(null);
    if (result.status === 'ok') onSaved(T.TOAST_KEEPING_SAVED);
    else handleProblem(result.status);
  }

  async function save() {
    if (!canSave) return;
    if (!dirty) {
      onClose();
      return;
    }
    setSaving(true);
    setNote(null);
    setFailed(false);
    const first = await setKeepYears({ expectedVersion: settings.version, afterLastDay: a, after18: b, confirmCount: null });
    setSaving(false);
    if (first.status === 'confirm_needed') {
      if ((first.removeCount ?? 0) === 0) secondStep(0);
      else setConfirm({ count: first.removeCount });
      return;
    }
    if (first.status === 'ok') {
      onSaved(T.TOAST_KEEPING_SAVED);
      return;
    }
    handleProblem(first.status);
  }

  const numberInput = (value, setValue, label, inputId) => (
    <input
      id={inputId}
      className="input bb-years"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      aria-invalid={problem ? 'true' : undefined}
      aria-describedby={`${id}-hint`}
      readOnly={saving}
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        if (!blocked) setNote(null);
      }}
    />
  );

  const saveButton = (
    <button type="submit" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`} aria-disabled={canSave ? undefined : 'true'}>
      <IconCheck size={16} aria-hidden="true" />
      {saving ? T.SAVING : T.SAVE}
    </button>
  );

  return (
    <>
      <Dialog title={T.KEEPING} size="medium" fullScreen={isPhone} onRequestClose={requestClose}>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          {failed && <ErrorBanner text={T.SAVE_FAILED} onRetry={save} retrying={saving} />}
          <p className="bb-keep-sentence">
            {T.KEEP_PART_1} {numberInput(n1, setN1, T.KEEP_N1_LABEL, `${id}-n1`)} {T.KEEP_PART_2} {numberInput(n2, setN2, T.KEEP_N2_LABEL, `${id}-n2`)} {T.KEEP_PART_3}
          </p>
          {problem ? (
            <Notice id={`${id}-hint`}>{T.KEEP_RANGE}</Notice>
          ) : (
            <p id={`${id}-hint`} className="field-hint">
              {T.KEEP_HINT}
            </p>
          )}
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
          {settings.updatedByName && <p className="tmeta">{T.lastChanged(settings.updatedByName, settings.updatedAt)}</p>}
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
      {confirm && (
        <ConfirmDialog
          title={T.KEEP_CONFIRM_TITLE}
          body={T.keepConfirmBody(confirm.count)}
          cancelLabel={T.CANCEL}
          confirmLabel={T.SAVE_AND_DELETE}
          danger
          nested
          busy={saving}
          onConfirm={() => secondStep(confirm.count)}
          onCancel={() => !saving && setConfirm(null)}
        />
      )}
    </>
  );
}
