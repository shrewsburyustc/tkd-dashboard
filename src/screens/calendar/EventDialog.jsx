// EventDialog.jsx — "Add event", "Edit event" and the staff's read-only view (mockup screens 3, 7).
// Why it exists: one form for an event:
//   Title, Type (sets the color — types are set up under ⋯ → Event types), All day (untick it
//   to set times), Starts / Ends (a later end date = a several-day event, at most 31 days;
//   the dates use the dashboard's own calendar, components/DatePicker.jsx, design review N6 /
//   v1.018, and the end can't be before the start; the times stay the browser's time box),
//   School (Worcester, Shrewsbury or Both — starts with the school in the switcher), and notes
//   under "More details". Save stays gray until there's a title, a type and good dates.
// Edit has Remove (instant, with Undo — no confirmation, v0.234).
// Staff see the same fields read-only, with "View only — ask an admin to change this."
// Like the Schedule's dialogs, the typed values live in the parent (Calendar.jsx) so they
// survive the screen locking while the dialog is open.
import { IconCheck, IconChevronDown, IconChevronRight, IconTrash } from '@tabler/icons-react';
import DatePicker from '../../components/DatePicker.jsx';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { colorOf } from '../../lib/schedule/colors.js';
import { parseTime } from '../../lib/schedule/time.js';
import { cleanNotes, cleanText, eventTimesProblem, notesProblem, textProblem, TITLE_MAX } from '../../lib/calendar/rules.js';
import * as T from './text.js';

// The Year list of a Calendar date field: this year and the next two (DatePicker adds the year of
// the date on show, so an older event's year is there too). Closures use it as well.
export function pickerYears(today) {
  const year = Number(String(today).slice(0, 4));
  return Number.isFinite(year) ? [year, year + 1, year + 2] : [];
}

export const isEventFormDirty = (state) => JSON.stringify({ ...state.values, showNotes: 0 }) !== JSON.stringify({ ...state.initial, showNotes: 0 });

export function checkEventForm(state) {
  const { values, touched } = state;
  const start = parseTime(values.start);
  const end = parseTime(values.end);
  const title = textProblem(values.title, TITLE_MAX);
  const times = eventTimesProblem({ startsOn: values.startsOn, endsOn: values.endsOn, allDay: values.allDay, start, end });
  const notes = notesProblem(values.notes);
  const valid = title === null && Boolean(values.typeId) && times === null && notes === null;
  // Shown once someone has changed a date or time (or pressed Save).
  let timeError = null;
  if (times && (touched.dates || touched.submit)) {
    timeError = times === 'missing' && values.startsOn && values.endsOn && !values.allDay ? T.TIME_MISSING : T.dateProblemText(times, 'event');
  }
  return {
    titleError: title && (touched.title || touched.submit) ? T.textProblemText(title, TITLE_MAX) : null,
    typeError: !values.typeId && touched.submit ? T.CHOOSE_TYPE : null,
    timeError,
    notesError: notes ? (notes === 'tooLong' ? T.NOTES_TOO_LONG : T.NOTES_BAD) : null,
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved: state.mode === 'edit' && !isEventFormDirty(state),
    payload: valid
      ? {
          locationCode: values.school === 'both' ? null : values.school,
          typeId: values.typeId,
          title: cleanText(values.title),
          startsOn: values.startsOn,
          endsOn: values.endsOn,
          allDay: values.allDay,
          start: values.allDay ? null : start,
          end: values.allDay ? null : end,
          notes: cleanNotes(values.notes),
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

// Worcester / Shrewsbury / Both — a row of three radio buttons that look like a switch.
export function SchoolPicker({ idBase, value, disabled, onChange }) {
  const options = [['worcester', T.SCHOOL_NAME.worcester], ['shrewsbury', T.SCHOOL_NAME.shrewsbury], ['both', T.BOTH]];
  return (
    <fieldset className="field cfieldset">
      <legend className="field-label">{T.SCHOOL}</legend>
      <div className="cseg" role="radiogroup" aria-label={T.SCHOOL}>
        {options.map(([key, label]) => (
          <label key={key} className={`cseg-item${value === key ? ' is-on' : ''}`}>
            <input type="radio" name={`${idBase}-school`} value={key} checked={value === key} disabled={disabled} onChange={() => onChange(key)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function EventDialog({ state, types, today, isPhone, onChange, onTouch, onSave, onRemove, onCancel, onRequestClose }) {
  const view = state.mode === 'view';
  const isAdd = state.mode === 'add';
  const check = checkEventForm(state);
  const readOnly = view || state.saving;
  const v = state.values;
  const idBase = `event-dialog-${state.key}`;
  const type = types.find((t) => t.id === v.typeId);
  const title = view ? T.VIEW_EVENT_TITLE : isAdd ? T.ADD_EVENT_TITLE : T.EDIT_EVENT_TITLE;

  function handleSubmit(event) {
    event.preventDefault();
    if (view) return;
    if (check.canSave) onSave();
    else onTouch(['submit', 'title', 'dates']);
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
          <label htmlFor={`${idBase}-title`}>{T.TITLE}</label>
          <input
            id={`${idBase}-title`}
            className="input"
            data-autofocus={view ? undefined : true}
            readOnly={readOnly}
            value={v.title}
            maxLength={200}
            aria-invalid={check.titleError ? true : undefined}
            aria-describedby={check.titleError ? `${idBase}-title-error` : undefined}
            onChange={(e) => onChange({ title: e.target.value })}
            onBlur={() => onTouch(['title'])}
          />
          {check.titleError && <Notice id={`${idBase}-title-error`}>{check.titleError}</Notice>}
        </div>

        <div className="field">
          <label htmlFor={`${idBase}-type`}>{T.TYPE}</label>
          {types.length === 0 ? (
            <Notice>{T.NO_TYPES}</Notice>
          ) : (
            <div className="ctype-row">
              <i className="cpanel-swatch" style={type ? { background: colorOf(type.color).fill, borderColor: colorOf(type.color).edge } : undefined} aria-hidden="true" />
              <select
                id={`${idBase}-type`}
                className="input sdialog-select"
                disabled={readOnly}
                value={v.typeId ?? ''}
                aria-invalid={check.typeError ? true : undefined}
                onChange={(e) => onChange({ typeId: e.target.value || null })}
              >
                <option value="">{T.CHOOSE_TYPE}</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {check.typeError && <Notice>{check.typeError}</Notice>}
        </div>

        <label className="sday-check cbox">
          <input type="checkbox" checked={v.allDay} disabled={readOnly} onChange={(e) => onChange({ allDay: e.target.checked })} />
          <span>{T.ALL_DAY_BOX}</span>
        </label>

        <div className={`ctimes${v.allDay ? ' is-allday' : ''}`}>
          <div className="ctimes-row">
            <span className="field-label ctimes-label">{T.STARTS}</span>
            {/* The row's "Starts" is what you see; the field names itself "Start date" */}
            <DatePicker
              id={`${idBase}-starts-on`}
              label={T.startDate}
              value={v.startsOn}
              today={today}
              years={pickerYears(today)}
              placeholder={T.CHOOSE}
              disabled={readOnly}
              invalid={Boolean(check.timeError)}
              inline={isPhone}
              onChange={(startsOn) => {
                // Moving the start past the end moves the end along (a one-day event stays one day).
                const endsOn = !v.endsOn || v.endsOn < startsOn || v.endsOn === v.startsOn ? startsOn : v.endsOn;
                onChange({ startsOn, endsOn });
                onTouch(['dates']);
              }}
            />
            {!v.allDay && (
              <input
                className="input"
                type="time"
                step={300}
                aria-label={T.startTime}
                readOnly={readOnly}
                value={v.start}
                onChange={(e) => {
                  onChange({ start: e.target.value });
                  onTouch(['dates']);
                }}
              />
            )}
          </div>
          <div className="ctimes-row">
            <span className="field-label ctimes-label">{T.ENDS}</span>
            <DatePicker
              id={`${idBase}-ends-on`}
              label={T.endDate}
              value={v.endsOn}
              today={today}
              min={v.startsOn || null}
              years={pickerYears(today)}
              hint={v.startsOn ? T.END_DATE_HINT : ''}
              placeholder={T.CHOOSE}
              disabled={readOnly}
              invalid={Boolean(check.timeError)}
              inline={isPhone}
              onChange={(endsOn) => {
                onChange({ endsOn });
                onTouch(['dates']);
              }}
            />
            {!v.allDay && (
              <input
                className="input"
                type="time"
                step={300}
                aria-label={T.endTime}
                readOnly={readOnly}
                value={v.end}
                onChange={(e) => {
                  onChange({ end: e.target.value });
                  onTouch(['dates']);
                }}
              />
            )}
          </div>
        </div>
        {check.timeError && <Notice>{check.timeError}</Notice>}

        <SchoolPicker idBase={idBase} value={v.school} disabled={readOnly} onChange={(school) => onChange({ school })} />

        <div className="field">
          <button type="button" className="cmore-toggle" aria-expanded={v.showNotes ? 'true' : 'false'} aria-controls={`${idBase}-notes`} onClick={() => onChange({ showNotes: !v.showNotes }, 'ui')}>
            {v.showNotes ? <IconChevronDown size={16} aria-hidden="true" /> : <IconChevronRight size={16} aria-hidden="true" />}
            {T.MORE_DETAILS}
          </button>
          {v.showNotes && (
            <div id={`${idBase}-notes`}>
              <textarea
                className="input ctextarea"
                aria-label={T.NOTES}
                aria-describedby={`${idBase}-notes-hint`}
                readOnly={readOnly}
                rows={4}
                value={v.notes}
                onChange={(e) => onChange({ notes: e.target.value })}
              />
              {!view && (
                <p id={`${idBase}-notes-hint`} className="field-hint">
                  {T.NOTES_HINT}
                </p>
              )}
              {check.notesError && <Notice>{check.notesError}</Notice>}
            </div>
          )}
        </div>

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
