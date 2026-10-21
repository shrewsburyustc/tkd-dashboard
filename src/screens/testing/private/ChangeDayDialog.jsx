// ChangeDayDialog.jsx — "Change day or time" of a private testing (mockup P4, contract 0014 §5.4).
// Why it exists: families reschedule. The dialog opens with the current day and time filled in
// (DayTimeFields: same rules as Add — no past days, 6 AM – 10 PM in 5-minute steps) and the line
// "The price stays $95." Save stays gray until the day or the time is different (the database
// writes nothing for the same day and time). A private testing marked No show gets an amber note
// first: saving a new day clears that result. No toast after Save — the row shows the new day.
// PC and tablet: a small centered dialog; phone: a full screen with Save pinned at the bottom.
// Follows "Hide private details" (v0.506): while `hidden` is on, the "price stays" line is left out.
// This file only DRAWS; PrivateTestingTab keeps the values and saves.
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import DayTimeFields, { checkDayTime } from './DayTimeFields.jsx';
import * as T from '../text.js';

export function isChangeDayDirty(state) {
  return state.values.day !== state.initial.day || state.values.time !== state.initial.time;
}

// → checkDayTime's answer + changed + canSave (only once the day or time differs)
export function checkChangeDay(state, { today }) {
  const fields = checkDayTime(state.values, { today, touched: state.touched, triedSave: state.triedSave, pastDay: state.pastDay ?? null });
  const changed = isChangeDayDirty(state);
  return { ...fields, changed, canSave: fields.valid && changed && !state.saving && !state.blocked };
}

const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'PRIVATE_GRADED'];
const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  PRIVATE_GRADED: T.PRIVATE_GRADED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
};

// props: state, record (the row), today, isPhone, onChange, onTouch, onSave(canSave), onCancel, onRequestClose
export default function ChangeDayDialog({ state, record, today, hidden = false, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const idBase = `change-day-${state.key}`;
  const check = checkChangeDay(state, { today });
  const toName = record.testingFor?.kind === 'rank' ? record.testingFor.name : T.NO_NEW_RANK;

  const saveButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${check.canSave ? '' : ' is-unavailable'}`}
      aria-disabled={check.canSave ? undefined : 'true'}
    >
      <IconCheck size={16} aria-hidden="true" />
      {state.saving ? T.SAVING : T.SAVE}
    </button>
  );
  const noteBlock = state.note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && state.note === 'STALE_DIALOG' ? T.STALE_DIALOG_PHONE : NOTES[state.note]}
        {isPhone && PHONE_DISCARD_NOTES.includes(state.note) && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );

  return (
    <Dialog title={T.CHANGE_DAY_TIME_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.privateDialogSub(T.studentLabel(record), record.className, record.rankName, toName)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(check.canSave);
        }}
        noValidate
        className="pv-form"
      >
        <DayTimeFields idBase={idBase} values={state.values} check={check} readOnly={state.saving} today={today} autoFocus onChange={onChange} onTouch={onTouch} />
        {!hidden && <p className="field-hint pv-stays">{T.priceStays(record.privateCents)}</p>}
        {/* A new day clears a No show (and its note) — said before Save (CP1 wording). */}
        {record.result === 'no_show' && (
          <div className="pv-clearing">
            <Notice>{T.clearsPrivateNoShow(record.firstName, record.privateDate)}</Notice>
          </div>
        )}
        {isPhone && noteBlock}
        {isPhone ? (
          <div className="dialog-page-submit">{saveButton}</div>
        ) : (
          <div className="dialog-footer">
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={onCancel}>
                {T.CANCEL}
              </button>
              {saveButton}
            </div>
            {noteBlock}
          </div>
        )}
      </form>
    </Dialog>
  );
}
