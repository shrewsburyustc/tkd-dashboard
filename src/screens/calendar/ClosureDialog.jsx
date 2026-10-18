// ClosureDialog.jsx — "Add closure", "Edit closure" and the staff's read-only view (mockup screens 4, 5).
// Why it exists: close whole days, or just some classes on one day:
//   Reason (shown on the calendar), From / To (one day or up to 31 days), School (Worcester,
//   Shrewsbury or Both — above the classes, C3), What's cancelled:
//   All classes, or Some classes (single day only) — that day's classes from the Schedule, to
//   tick.
// Edit has Remove (instant, with Undo). If the schedule changed after the closure was saved, the
// classes that are no longer on it are listed (they are dropped when you save, v0.143 answer 2).
// Cancelled classes can't be booked for a free class (Forms). Free classes already booked on the
// classes it cancels stay booked and turn amber; the dialog warns that the families need a call
// (v0.145 answer 6).
import { IconCheck, IconTrash } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { formatRange, formatTime } from '../../lib/schedule/time.js';
import { cleanText, datesProblem, textProblem, TITLE_MAX } from '../../lib/calendar/rules.js';
import { SchoolPicker } from './EventDialog.jsx';
import * as T from './text.js';

export const isClosureFormDirty = (state) => JSON.stringify(state.values) !== JSON.stringify(state.initial);

// dayClasses: [{ code, name, classes: [{ slot, name }] }] — the classes on From's date for the
// chosen school(s). Ticks that aren't among them (another date or school) don't count.
export function checkClosureForm(state, dayClasses) {
  const { values, touched } = state;
  const available = new Set(dayClasses.flatMap((s) => s.classes.map((c) => c.slot.id)));
  const ticked = values.slotIds.filter((id) => available.has(id));
  const reason = textProblem(values.reason, TITLE_MAX);
  const dates = datesProblem(values.startsOn, values.endsOn);
  const oneDay = values.startsOn && values.startsOn === values.endsOn;
  const someProblem = !values.wholeDay && (!oneDay ? 'oneDay' : ticked.length === 0 ? 'pick' : null);
  const valid = reason === null && dates === null && !someProblem;
  return {
    reasonError: reason && (touched.reason || touched.submit) ? T.textProblemText(reason, TITLE_MAX) : null,
    dateError: dates && (touched.dates || touched.submit) ? T.dateProblemText(dates, 'closure') : null,
    someError: someProblem === 'oneDay' ? T.SOME_ONE_DAY : someProblem === 'pick' && (touched.slots || touched.submit) ? T.PICK_A_CLASS : null,
    ticked,
    oneDay,
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved: state.mode === 'edit' && !isClosureFormDirty(state),
    payload: valid
      ? {
          locationCode: values.school === 'both' ? null : values.school,
          startsOn: values.startsOn,
          endsOn: values.endsOn,
          reason: cleanText(values.reason),
          wholeDay: values.wholeDay,
          slotIds: values.wholeDay ? [] : ticked,
        }
      : null,
  };
}

const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
};
const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED'];

export default function ClosureDialog({ state, dayClasses, orphans, bookingCount = 0, isPhone, onChange, onTouch, onSave, onRemove, onCancel, onRequestClose }) {
  const view = state.mode === 'view';
  const isAdd = state.mode === 'add';
  const check = checkClosureForm(state, dayClasses);
  const readOnly = view || state.saving;
  const v = state.values;
  const idBase = `closure-dialog-${state.key}`;
  const both = dayClasses.length > 1;
  const title = view ? T.VIEW_CLOSURE_TITLE : isAdd ? T.ADD_CLOSURE_TITLE : T.EDIT_CLOSURE_TITLE;

  function handleSubmit(event) {
    event.preventDefault();
    if (view) return;
    if (check.canSave) onSave();
    else onTouch(['submit', 'reason', 'dates', 'slots']);
  }

  const saveButton = !view && (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${check.canSave ? '' : ' is-unavailable'}`}
      aria-disabled={check.canSave ? undefined : 'true'}
    >
      <IconCheck size={16} aria-hidden="true" />
      {state.saving && !state.removing ? T.SAVING : T.SAVE}
    </button>
  );
  const removeButton = state.mode === 'edit' && (
    <button type="button" className="btn sdialog-remove" disabled={state.saving || state.blocked} onClick={onRemove}>
      <IconTrash size={16} aria-hidden="true" />
      {state.removing ? T.REMOVING : T.REMOVE}
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
    <Dialog title={title} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
      {view && <p className="tdialog-sub">{T.VIEW_ONLY_DIALOG}</p>}
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor={`${idBase}-reason`}>{T.REASON}</label>
          <input
            id={`${idBase}-reason`}
            className="input"
            data-autofocus={view ? undefined : true}
            readOnly={readOnly}
            value={v.reason}
            maxLength={200}
            aria-invalid={check.reasonError ? true : undefined}
            aria-describedby={check.reasonError ? `${idBase}-reason-error` : `${idBase}-reason-hint`}
            onChange={(e) => onChange({ reason: e.target.value })}
            onBlur={() => onTouch(['reason'])}
          />
          {check.reasonError ? (
            <Notice id={`${idBase}-reason-error`}>{check.reasonError}</Notice>
          ) : (
            !view && (
              <p id={`${idBase}-reason-hint`} className="field-hint">
                {T.REASON_HINT}
              </p>
            )
          )}
        </div>

        <div className="stimes">
          <div className="field">
            <label htmlFor={`${idBase}-from`}>{T.FROM}</label>
            <input
              id={`${idBase}-from`}
              className="input"
              type="date"
              readOnly={readOnly}
              value={v.startsOn}
              onChange={(e) => {
                const startsOn = e.target.value;
                const endsOn = !v.endsOn || v.endsOn < startsOn || v.endsOn === v.startsOn ? startsOn : v.endsOn;
                onChange({ startsOn, endsOn });
                onTouch(['dates']);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor={`${idBase}-to`}>{T.TO}</label>
            <input
              id={`${idBase}-to`}
              className="input"
              type="date"
              readOnly={readOnly}
              value={v.endsOn}
              onChange={(e) => {
                onChange({ endsOn: e.target.value });
                onTouch(['dates']);
              }}
            />
          </div>
        </div>
        {check.dateError && <Notice>{check.dateError}</Notice>}

        {/* School first (Jeffrey, C3 difference 1): it decides which classes are listed below,
            so picking it never moves the switch itself. */}
        <SchoolPicker idBase={idBase} value={v.school} disabled={readOnly} onChange={(school) => onChange({ school })} />

        <fieldset className="field cfieldset">
          <legend className="field-label">{T.WHATS_CANCELLED}</legend>
          <label className="sday-check cbox">
            <input type="radio" name={`${idBase}-what`} checked={v.wholeDay} disabled={readOnly} onChange={() => onChange({ wholeDay: true })} />
            <span>{T.ALL_CLASSES}</span>
          </label>
          <label className="sday-check cbox">
            <input type="radio" name={`${idBase}-what`} checked={!v.wholeDay} disabled={readOnly} onChange={() => onChange({ wholeDay: false })} />
            <span>{T.SOME_CLASSES}</span>
          </label>
          {!v.wholeDay && check.oneDay && (
            <div className="csome">
              {dayClasses.every((s) => s.classes.length === 0) ? (
                <p className="field-hint">{T.NO_CLASSES_THAT_DAY}</p>
              ) : (
                dayClasses.map((school) => (
                  <div key={school.code} role="group" aria-label={school.name}>
                    {both && <p className="csome-school">{school.name}</p>}
                    {school.classes.map((c) => (
                      <label key={c.slot.id} className="sday-check cbox">
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={check.ticked.includes(c.slot.id)}
                          onChange={(e) => {
                            const ids = e.target.checked ? [...check.ticked, c.slot.id] : check.ticked.filter((x) => x !== c.slot.id);
                            onChange({ slotIds: ids });
                            onTouch(['slots']);
                          }}
                        />
                        <span>
                          {formatRange(c.slot.start, c.slot.end)} {c.name}
                        </span>
                      </label>
                    ))}
                  </div>
                ))
              )}
              {check.ticked.length > 0 && <p className="field-hint">{T.someCount(v.startsOn, check.ticked.length)}</p>}
            </div>
          )}
          {check.someError && <Notice>{check.someError}</Notice>}
          {bookingCount > 0 && state.mode !== 'view' && (
            <div className="csome-orphans">
              <Notice>{T.closureBookings(bookingCount)}</Notice>
            </div>
          )}
          {orphans.length > 0 && (
            <div className="csome-orphans">
              <Notice>
                {T.ORPHANS_NOTE} {orphans.map((r) => `${r.classNames} ${formatTime(r.start)}`).join(', ')}
              </Notice>
            </div>
          )}
        </fieldset>

        {isPhone && noteBlock}
        {isPhone ? (
          <>
            {saveButton && <div className="dialog-page-submit">{saveButton}</div>}
            {removeButton && <div className="sdialog-remove-row">{removeButton}</div>}
          </>
        ) : (
          <div className="dialog-footer">
            <div className="dialog-actions sdialog-actions">
              {removeButton}
              <span className="sdialog-actions-right">
                <button type="button" className="btn" onClick={onCancel} data-autofocus={view ? true : undefined}>
                  {view ? T.CLOSE : T.CANCEL}
                </button>
                {saveButton}
              </span>
            </div>
            {noteBlock}
          </div>
        )}
      </form>
    </Dialog>
  );
}
