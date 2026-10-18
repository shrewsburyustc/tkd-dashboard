// EventDialog.jsx — "Add event" and "Edit event" (admins only).
// Why it exists: approved mockups E4–E7 (Star v0.85–v0.87 with Color Belt's class times, Q3).
// The form, top to bottom:
//   - Event name and Testing date (no Start time or Where: the event belongs to the school
//     chosen in the top bar, v0.34)
//   - Classes testing: one line per class with a tick and a start → end time. Unticked =
//     "Not testing at this event". Classes with the same times test together.
//   - Registration: Open / Closed (new events start Closed, Star v0.85), and "Close
//     automatically at the end of <date>" — ticked by default, 7 days before the testing date
//   - More details (collapsed): Note for families (optional, shown on the registration form)
// Prices are never typed here: an event copies them from Classes and ranks when it's saved
// (plan answer 5).
//
// Like phase 1's dialogs, this only DRAWS the form. Its values live in EventsTab (the `state`
// prop), so a screen lock hides the dialog and brings it back with everything still filled in.
import { useEffect, useRef } from 'react';
import { IconCheck, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { nameKey, nameProblem, normalizeName } from '../../../lib/testing/names.js';
import { NOTE_MAX, isIsoDate, validateClassTimes } from '../../../lib/testing/eventRules.js';
import ChoiceGroup from './ChoiceGroup.jsx';
import * as T from '../text.js';

// The times offered in each list: every 15 minutes from 6:00 AM to 10:00 PM.
const TIME_CHOICES = [];
for (let minutes = 6 * 60; minutes <= 22 * 60; minutes += 15) {
  TIME_CHOICES.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
}

const sameRows = (a, b) =>
  a.length === b.length &&
  a.every((row, index) => {
    const other = b[index];
    return row.classId === other.classId && row.ticked === other.ticked && row.startTime === other.startTime && row.endTime === other.endTime;
  });

// Did anything change since the dialog opened? (Esc / backdrop / back arrow close only if not.)
export function isEventFormDirty(state) {
  const a = state.values;
  const b = state.initial;
  return (
    a.name !== b.name ||
    a.testingDate !== b.testingDate ||
    a.open !== b.open ||
    a.autoClose !== b.autoClose ||
    a.closingDate !== b.closingDate ||
    a.note !== b.note ||
    !sameRows(a.rows, b.rows)
  );
}

// Checks the form. Returns the messages to show, whether Save is available, and what to send.
//   events  this school's events (for the duplicate-name check)
//   today   'YYYY-MM-DD' in school time
//   record  the saved event (edit mode)
export function checkEventForm(state, events, today, record) {
  const { values, touched, triedSave } = state;
  const isEdit = state.mode === 'edit';

  // ----- Name -----
  const typed = normalizeName(values.name);
  const problem = nameProblem(values.name);
  const serverDuplicate = state.duplicateName !== null && nameKey(state.duplicateName) === nameKey(typed);
  const localDuplicate = problem
    ? null
    : ((events ?? []).find((e) => e.id !== state.eventId && nameKey(e.name) === nameKey(typed))?.name ?? null);
  let nameError = null;
  if (serverDuplicate) nameError = T.duplicateEvent(typed);
  else if (problem === 'empty') nameError = touched.name || triedSave ? T.ENTER_EVENT_NAME : null;
  else if (problem) nameError = T.eventNameProblem(problem);
  else if (localDuplicate) nameError = T.duplicateEvent(localDuplicate);

  // ----- Testing date: today or later (an edited past event may keep its own date) -----
  let dateError = null;
  const dateOk = isIsoDate(values.testingDate);
  const dateChanged = !isEdit || values.testingDate !== record?.testingDate;
  if (!dateOk) dateError = touched.testingDate || triedSave ? T.ENTER_TESTING_DATE : null;
  else if (dateChanged && values.testingDate < today) dateError = T.TESTING_DATE_PAST;

  // ----- Classes testing -----
  const ticked = values.rows.filter((row) => row.ticked);
  const codes = validateClassTimes(ticked);
  const rowErrors = {};
  let timesOk = true;
  ticked.forEach((row, index) => {
    const code = codes[index];
    if (!code) return;
    timesOk = false;
    if (code === 'endNotAfterStart') rowErrors[row.classId] = T.END_AFTER_START;
    else if (triedSave || state.touchedRows?.[row.classId]) rowErrors[row.classId] = T.SET_BOTH_TIMES;
  });
  let classesError = null;
  if (ticked.length === 0) classesError = T.TICK_ONE_CLASS;
  // A class added to the event must have its final award set in Classes and ranks (§1.4).
  const notSet = ticked.find((row) => !row.inEvent && row.awardNotSet);
  if (notSet) classesError = T.finalAwardNotSet(notSet.className);
  if (state.serverAwardClass) classesError = T.finalAwardNotSet(state.serverAwardClass);

  // ----- Closing date -----
  let closingError = null;
  const closingOk = !values.autoClose || isIsoDate(values.closingDate);
  const closingChanged = !isEdit || values.autoClose !== state.initial.autoClose || values.closingDate !== state.initial.closingDate;
  if (values.autoClose) {
    if (!isIsoDate(values.closingDate)) closingError = triedSave || touched.closingDate ? T.ENTER_CLOSING_DATE : null;
    else if (dateOk && values.closingDate > values.testingDate) closingError = T.CLOSING_AFTER_TESTING;
    else if (closingChanged && values.closingDate < today) closingError = T.CLOSING_IN_PAST;
  }

  // ----- Note -----
  const note = values.note.trim();
  const noteError = [...note].length > NOTE_MAX ? T.NOTE_TOO_LONG : null;

  const valid =
    !problem &&
    !localDuplicate &&
    !serverDuplicate &&
    dateOk &&
    !(dateChanged && values.testingDate < today) &&
    timesOk &&
    ticked.length > 0 &&
    !notSet &&
    closingOk &&
    !(values.autoClose && closingError) &&
    !noteError;

  const payload = valid
    ? {
        name: typed,
        testingDate: values.testingDate,
        classes: ticked.map((row) => ({ classId: row.classId, startTime: row.startTime, endTime: row.endTime })),
        registrationOpen: values.open,
        autoCloseOn: values.autoClose ? values.closingDate : null,
        note: note === '' ? null : note,
      }
    : null;
  const sameAsSaved = isEdit && valid && !isEventFormDirty(state);
  const canSave = valid && !state.saving && !state.blocked && !state.serverAwardClass;
  return { nameError, dateError, rowErrors, classesError, closingError, noteError, canSave, sameAsSaved, payload };
}

// Notes that get the "Discard changes" link on phones (the page has no Cancel button).
const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED'];
const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.EVENT_NOT_ALLOWED,
  NOT_EMPTY: T.EVENT_NOT_EMPTY,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
};

// One "Classes testing" line: tick + class name, then start → end (or "Not testing…").
function ClassTimeRow({ row, idBase, error, readOnly, isPhone, onChange }) {
  const tickId = `${idBase}-tick-${row.classId}`;
  const errorId = `${idBase}-err-${row.classId}`;
  // A saved time that isn't on the 15-minute list (e.g. 4:10 PM) is still offered.
  const choices = (value) => (value && !TIME_CHOICES.includes(value) ? [...TIME_CHOICES, value].sort() : TIME_CHOICES);
  const select = (field, label) => (
    <select
      className="input ev-time"
      aria-label={label}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? errorId : undefined}
      disabled={readOnly}
      value={row[field] ?? ''}
      onChange={(event) => onChange({ [field]: event.target.value || null })}
    >
      <option value="">{T.NO_TIME}</option>
      {choices(row[field]).map((time) => (
        <option key={time} value={time}>
          {T.timeLabel(time)}
        </option>
      ))}
    </select>
  );
  return (
    <div className={`ev-crow${row.ticked ? '' : ' is-off'}${isPhone ? ' is-phone' : ''}`}>
      <label className="cbrow ev-crow-name" htmlFor={tickId}>
        <input
          id={tickId}
          type="checkbox"
          className="cb"
          checked={row.ticked}
          disabled={readOnly}
          aria-label={T.testsAtEventLabel(row.className)}
          onChange={(event) => onChange({ ticked: event.target.checked })}
        />
        <span>{row.className}</span>
      </label>
      {row.ticked ? (
        <span className="ev-crow-times">
          {select('startTime', T.startTimeLabel(row.className))}
          <span className="ev-crow-to">{T.TIME_TO}</span>
          {select('endTime', T.endTimeLabel(row.className))}
        </span>
      ) : (
        <span className="ev-crow-off">{T.NOT_TESTING_HERE}</span>
      )}
      {error && (
        <div className="ev-crow-error">
          <Notice id={errorId}>{error}</Notice>
        </div>
      )}
    </div>
  );
}

export default function EventDialog({
  state, // the form (see EventsTab: openAddEvent / openEditEvent)
  school,
  events, // this school's events, as loaded
  today,
  record, // edit: the event as loaded (or as it was when the dialog opened)
  isPhone,
  onChange, // (patch of values) => void
  onRowChange, // (classId, patch) => void
  onTouch, // (field) => void
  onToggleMore,
  onSave,
  onCancel,
  onRequestClose,
}) {
  const isAdd = state.mode === 'add';
  const check = checkEventForm(state, events, today, record);
  const readOnly = state.saving;
  const idBase = `event-dialog-${state.key}`;
  const values = state.values;

  function handleSubmit(event) {
    event.preventDefault();
    onSave(check.canSave);
  }

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

  // "Unsaved changes. Save or cancel first." (Esc / Back with changes) sits above the buttons,
  // which may be far below where the admin is looking — so it is scrolled into view, gently and
  // only as far as needed (E7). Every Esc / Back scrolls again (EventsTab sets a new noteAt).
  const noteRef = useRef(null);
  useEffect(() => {
    if (state.note !== 'UNSAVED' || !noteRef.current) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // The notice itself, so testing.css's scroll-margin keeps it clear of the pinned buttons.
    const target = noteRef.current.querySelector('.notice') ?? noteRef.current;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [state.note, state.noteAt]);

  const noteBlock = state.note && (
    <div className="tdialog-note" ref={noteRef}>
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

  // The gray line under the class list: first event / copied from the last event / nothing (edit).
  let copiedLine = null;
  if (isAdd) copiedLine = state.copiedFrom ? T.copiedFromEvent(state.copiedFrom) : T.FIRST_EVENT_HINT;

  return (
    <Dialog title={isAdd ? T.ADD_EVENT_TITLE : T.EDIT_EVENT_TITLE} size="medium" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{isAdd ? T.addEventSub(school) : T.editEventSub(record?.createdAt)}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="ev-two">
          <div className="field">
            <label htmlFor={`${idBase}-name`}>{T.EVENT_NAME}</label>
            <input
              id={`${idBase}-name`}
              className="input"
              type="text"
              autoComplete="off"
              data-autofocus
              readOnly={readOnly}
              value={values.name}
              aria-invalid={check.nameError ? true : undefined}
              aria-describedby={check.nameError ? `${idBase}-name-error` : undefined}
              onChange={(event) => {
                onChange({ name: event.target.value });
                onTouch('name');
              }}
            />
            {check.nameError && <Notice id={`${idBase}-name-error`}>{check.nameError}</Notice>}
          </div>
          <div className="field">
            <label htmlFor={`${idBase}-date`}>{T.TESTING_DATE}</label>
            <input
              id={`${idBase}-date`}
              className="input"
              type="date"
              readOnly={readOnly}
              value={values.testingDate}
              aria-invalid={check.dateError ? true : undefined}
              aria-describedby={check.dateError ? `${idBase}-date-error` : undefined}
              onChange={(event) => {
                onChange({ testingDate: event.target.value });
                onTouch('testingDate');
              }}
            />
            {check.dateError && <Notice id={`${idBase}-date-error`}>{check.dateError}</Notice>}
          </div>
        </div>

        <div className="field">
          <span id={`${idBase}-classes-label`} className="field-label">
            {T.CLASSES_TESTING}
          </span>
          <div className="ev-classes" role="group" aria-labelledby={`${idBase}-classes-label`}>
            {values.rows.length === 0 && <p className="field-hint">{T.NO_CLASSES_YET}</p>}
            {values.rows.map((row) => (
              <ClassTimeRow
                key={row.classId}
                row={row}
                idBase={idBase}
                error={row.ticked ? check.rowErrors[row.classId] : null}
                readOnly={readOnly}
                isPhone={isPhone}
                onChange={(patch) => onRowChange(row.classId, patch)}
              />
            ))}
            <p className="field-hint ev-classes-hint">{T.CLASSES_TESTING_HINT}</p>
          </div>
          {check.classesError && (state.triedSave || state.serverAwardClass || check.classesError !== T.TICK_ONE_CLASS) && (
            <Notice>{check.classesError}</Notice>
          )}
          {copiedLine && <p className="field-hint">{copiedLine}</p>}
        </div>

        <div className="field">
          <span id={`${idBase}-reg-label`} className="field-label">
            {T.REGISTRATION}
          </span>
          <div>
            <ChoiceGroup
              labelId={`${idBase}-reg-label`}
              options={[
                { key: 'open', label: T.REG_OPEN },
                { key: 'closed', label: T.REG_CLOSED },
              ]}
              value={values.open ? 'open' : 'closed'}
              readOnly={readOnly}
              onChange={(key) => onChange({ open: key === 'open' })}
            />
          </div>
        </div>

        <div className="field">
          <label className="cbrow" htmlFor={`${idBase}-auto`}>
            <input
              id={`${idBase}-auto`}
              type="checkbox"
              className="cb"
              checked={values.autoClose}
              disabled={readOnly}
              aria-label={T.CLOSE_AUTOMATICALLY_LABEL}
              onChange={(event) => onChange({ autoClose: event.target.checked })}
            />
            <span>{T.CLOSE_AUTOMATICALLY}</span>
          </label>
          {values.autoClose && (
            <div className="ev-closing">
              <input
                className="input"
                type="date"
                aria-label={T.CLOSING_DATE_LABEL}
                readOnly={readOnly}
                value={values.closingDate}
                aria-invalid={check.closingError ? true : undefined}
                aria-describedby={`${idBase}-closing-hint${check.closingError ? ` ${idBase}-closing-error` : ''}`}
                onChange={(event) => {
                  onChange({ closingDate: event.target.value, closingEdited: true });
                  onTouch('closingDate');
                }}
              />
              {check.closingError && <Notice id={`${idBase}-closing-error`}>{check.closingError}</Notice>}
              {!check.closingError && (
                <p id={`${idBase}-closing-hint`} className="field-hint">
                  {T.CLOSE_AUTOMATICALLY_HINT}
                </p>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="more-toggle"
          aria-expanded={state.moreOpen ? 'true' : 'false'}
          aria-controls={`${idBase}-more`}
          onClick={onToggleMore}
        >
          {/* ti-chevron-down / ti-chevron-up = expand / collapse */}
          {state.moreOpen ? <IconChevronUp size={16} aria-hidden="true" /> : <IconChevronDown size={16} aria-hidden="true" />}
          {T.MORE_DETAILS}
        </button>
        <div id={`${idBase}-more`} hidden={!state.moreOpen}>
          <div className="field">
            <label htmlFor={`${idBase}-note`}>{T.NOTE_FOR_FAMILIES}</label>
            <textarea
              id={`${idBase}-note`}
              className="input ev-note"
              rows={3}
              readOnly={readOnly}
              value={values.note}
              aria-invalid={check.noteError ? true : undefined}
              aria-describedby={`${idBase}-note-hint`}
              onChange={(event) => onChange({ note: event.target.value })}
            />
            {check.noteError ? (
              <Notice id={`${idBase}-note-hint`}>{check.noteError}</Notice>
            ) : (
              <p id={`${idBase}-note-hint`} className="field-hint">
                {T.NOTE_HINT}
              </p>
            )}
          </div>
        </div>

        {/* The note sits in the form, above "Last changed" and the buttons (E7), not inside the
            pinned footer, so the footer stays one row and never covers More details. */}
        {noteBlock}
        {!isAdd && record?.updatedByName && <p className="tmeta">{T.lastChanged(record.updatedByName, record.updatedAt)}</p>}

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
          </div>
        )}
      </form>
    </Dialog>
  );
}

