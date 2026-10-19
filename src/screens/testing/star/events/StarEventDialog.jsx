// StarEventDialog.jsx — "Add event" and "Edit event" for Star testing (admins only).
// Why it exists: approved Events mockups screens 4–7 (v0.85–v0.87, v0.92) and gap mockups G4–G5
// (v0.500). The form, top to bottom:
//   - Event name
//   - Testing date | Start time            (Start time: 15-minute steps, 8:00 AM–8:00 PM; the
//     testing date uses the dashboard's own calendar, components/DatePicker.jsx, v0.502/v0.503)
//   - Where (Worcester school / Shrewsbury school) + its hint; in Add event, the line
//     "Start time and Where copied from <last event>. Change if needed." (nothing to copy for the
//     very first event: both start on "Choose…", screen 4)
//   - Registration: Open / Closed (new events start Closed, v0.85), and "Close automatically at the
//     end of <date>" — ticked by default, 7 days before the testing date, picked with the same
//     calendar (from today up to the testing date, which has a dot). It can't be used until a
//     testing date is chosen. Unticked, the date field goes and a gray hint says what happens
//     instead (G4). A past event that had no closing date can't have the box ticked (v0.503 item 6).
//     How the closing date follows the testing date is in src/lib/star/eventDateRules.js.
//   - More details (collapsed; opens by itself when the event has a note): Note for families
//   - Edit event only: "Rubrics and prices were copied when this event was created (date)." under
//     the title and "Last changed by … · date" above the buttons (v0.92, G5)
// Rubrics and prices are never typed here: the database copies them into the event at Add (v0.61).
//
// It is Color Belt's EventDialog.jsx pattern: this file only DRAWS the form and checks it. Its
// values live in StarEventsTab (the `state` prop), so a screen lock hides the dialog and brings it
// back with everything still filled in.
import { useEffect, useRef } from 'react';
import { IconCheck, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import Dialog from '../../../../components/Dialog.jsx';
import Notice from '../../../../components/Notice.jsx';
import { nameKey, nameProblem, normalizeName } from '../../../../lib/testing/names.js';
import { NOTE_MAX, isIsoDate } from '../../../../lib/testing/eventRules.js';
import { editWouldReopen, startTimeIsValid, startTimeOptions, WHERE_CODES } from '../../../../lib/star/starEventRules.js';
import { eventState } from '../../../../lib/testing/eventRules.js';
import { closingBoxBlocked, closingDateLimits, closingYears, testingDateLimits, testingYears } from '../../../../lib/star/eventDateRules.js';
import DatePicker from '../../../../components/DatePicker.jsx';
import ChoiceGroup from '../../events/ChoiceGroup.jsx';
import StarSelect from './StarSelect.jsx';
import * as T from './text.js';

// The two dropdowns' choices (made once; they never change).
const START_TIME_CHOICES = startTimeOptions(); // [{ value:'08:00', label:'8:00 AM' } … '20:00']
const WHERE_CHOICES = WHERE_CODES.map((code) => ({ value: code, label: T.whereText(code) }));

// Did anything change since the dialog opened? (Esc / backdrop / back arrow close only if not.)
export function isStarEventFormDirty(state) {
  const a = state.values;
  const b = state.initial;
  return (
    a.name !== b.name ||
    a.testingDate !== b.testingDate ||
    a.startTime !== b.startTime ||
    a.whereCode !== b.whereCode ||
    a.open !== b.open ||
    a.autoClose !== b.autoClose ||
    (a.autoClose && a.closingDate !== b.closingDate) ||
    a.note !== b.note
  );
}

// Checks the form. Returns the messages to show, whether Save is available, and what to send.
//   events  every Star event as loaded (for "names must be different", v0.92)
//   today   'YYYY-MM-DD' in school time
//   record  the saved event (Edit event)
export function checkStarEventForm(state, events, today, record) {
  const { values, touched, triedSave } = state;
  const isEdit = state.mode === 'edit';

  // ----- Name: required, the house name rules, different from every other Star event -----
  const typed = normalizeName(values.name);
  const problem = nameProblem(values.name);
  const serverDuplicate = state.duplicateName !== null && nameKey(state.duplicateName) === nameKey(typed);
  const localDuplicate = problem
    ? null
    : ((events ?? []).find((e) => e.id !== state.eventId && nameKey(e.name) === nameKey(typed))?.name ?? null);
  let nameError = null;
  if (serverDuplicate) nameError = T.duplicateEventName(typed);
  else if (problem === 'empty') nameError = touched.name || triedSave ? T.ENTER_EVENT_NAME : null;
  else if (problem) nameError = T.eventNameProblem(problem);
  else if (localDuplicate) nameError = T.duplicateEventName(localDuplicate);

  // ----- Testing date: today or later (an edited past event may keep its own date, v0.92) -----
  let dateError = null;
  const dateOk = isIsoDate(values.testingDate);
  const dateChanged = !isEdit || values.testingDate !== record?.testingDate;
  if (!dateOk) dateError = touched.testingDate || triedSave ? T.ENTER_TESTING_DATE : null;
  else if (dateChanged && values.testingDate < today) dateError = T.TESTING_DATE_PAST;

  // ----- Start time and Where: required (Save gray until both are chosen, screen 4) -----
  const timeOk = startTimeIsValid(values.startTime);
  const whereOk = WHERE_CODES.includes(values.whereCode);
  const timeError = !timeOk && triedSave ? T.CHOOSE_START_TIME : null;
  const whereError = !whereOk && triedSave ? T.CHOOSE_WHERE : null;

  // ----- Closing date (v0.85): on or before the testing date; a changed one not in the past -----
  let closingError = null;
  const closingChanged = !isEdit || values.autoClose !== state.initial.autoClose || values.closingDate !== state.initial.closingDate;
  if (values.autoClose) {
    if (!isIsoDate(values.closingDate)) closingError = triedSave || touched.closingDate ? T.ENTER_CLOSING_DATE : null;
    else if (dateOk && values.closingDate > values.testingDate) closingError = T.CLOSING_AFTER_TESTING;
    else if (closingChanged && values.closingDate < today) closingError = T.CLOSING_IN_PAST;
  }
  const closingOk = !values.autoClose || (isIsoDate(values.closingDate) && closingError === null);

  // ----- Note for families -----
  const note = values.note.trim();
  const noteError = [...note].length > NOTE_MAX ? T.NOTE_TOO_LONG : null;

  const valid =
    !problem &&
    !localDuplicate &&
    !serverDuplicate &&
    dateOk &&
    !(dateChanged && values.testingDate < today) &&
    timeOk &&
    whereOk &&
    closingOk &&
    !noteError;

  const payload = valid
    ? {
        name: typed,
        testingDate: values.testingDate,
        startTime: values.startTime,
        whereCode: values.whereCode,
        registrationOpen: values.open,
        autoCloseOn: values.autoClose ? values.closingDate : null,
        note: note === '' ? null : note,
      }
    : null;
  const sameAsSaved = isEdit && valid && !isStarEventFormDirty(state);
  const canSave = valid && !state.saving && !state.blocked;
  return { nameError, dateError, timeError, whereError, closingError, noteError, canSave, sameAsSaved, payload };
}

// The notes that can sit above the buttons (keys set by StarEventsTab).
// Notes that get the "Discard changes" link on phones (the full-screen page has no Cancel).
const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED'];
function noteText(note, isPhone) {
  switch (note) {
    case 'UNSAVED': return T.UNSAVED;
    case 'STALE_DIALOG': return isPhone ? T.STALE_DIALOG_PHONE : T.STALE_DIALOG;
    case 'NOT_ALLOWED': return T.EVENTS_NOT_ALLOWED;
    case 'INVALID_DIALOG': return T.INVALID_DIALOG;
    default: return T.SAVE_FAILED; // 'SAVE_FAILED' (screen 14's wording for a dialog)
  }
}

export default function StarEventDialog({
  state, // the form (see StarEventsTab: openAddEvent / openEditEvent)
  events, // every Star event, as loaded
  today,
  record, // Edit event: the event as it was when the dialog opened
  isPhone,
  onChange, // (patch of values) => void
  onTouch, // (field) => void
  onToggleMore,
  onSave,
  onCancel,
  onRequestClose,
}) {
  const isAdd = state.mode === 'add';
  const check = checkStarEventForm(state, events, today, record);
  const readOnly = state.saving;
  const idBase = `star-event-dialog-${state.key}`;
  const values = state.values;

  function handleSubmit(event) {
    event.preventDefault();
    onSave();
  }

  const saveButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${check.canSave ? '' : ' is-unavailable'}`}
      aria-disabled={check.canSave ? undefined : 'true'}
    >
      {/* ti-check = save */}
      <IconCheck size={16} aria-hidden="true" />
      {state.saving ? T.SAVING : T.SAVE}
    </button>
  );

  // "Unsaved changes. Save or cancel first." sits above the buttons, maybe below the fold — so it
  // is scrolled into view each time Esc / Back is pressed (as Color Belt's dialog, screen 7).
  const noteRef = useRef(null);
  useEffect(() => {
    if (state.note !== 'UNSAVED' || !noteRef.current) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const target = noteRef.current.querySelector('.notice') ?? noteRef.current;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [state.note, state.noteAt]);

  const noteBlock = state.note && (
    <div className="tdialog-note" ref={noteRef}>
      <Notice>
        {noteText(state.note, isPhone)}
        {isPhone && PHONE_DISCARD_NOTES.includes(state.note) && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );

  // The two calendars' limits (v0.503 items 1, 5, 6) and the past-event gray box.
  const testingLimits = testingDateLimits(today);
  const closingLimits = closingDateLimits(values.testingDate, today);
  const closingBlocked = closingBoxBlocked({ isEdit: !isAdd, hadClosingDate: state.initial.autoClose, testingDate: values.testingDate, today });
  // Edit of an event whose testing day (as now in the form) has passed: the switch can't change.
  const switchLocked = !isAdd && isIsoDate(values.testingDate) && values.testingDate < today;
  // v0.504: saving would reopen registration by itself → it will be kept closed; say so.
  const keepsClosed = !isAdd && record && editWouldReopen({
    previousState: eventState(record, today),
    registrationOpen: values.open,
    previousRegistrationOpen: record.registrationOpen,
    saved: { testingDate: values.testingDate, autoCloseOn: values.autoClose && !closingBlocked ? values.closingDate : null },
    today,
  });

  const ids = {
    name: `${idBase}-name`,
    date: `${idBase}-date`,
    time: `${idBase}-time`,
    where: `${idBase}-where`,
    regLabel: `${idBase}-reg-label`,
    auto: `${idBase}-auto`,
    note: `${idBase}-note`,
    more: `${idBase}-more`,
  };

  return (
    <Dialog title={isAdd ? T.ADD_EVENT_TITLE : T.EDIT_EVENT_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{isAdd ? T.ADD_EVENT_SUB : T.editEventSub(record?.createdAt)}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor={ids.name}>{T.EVENT_NAME}</label>
          <input
            id={ids.name}
            className="input"
            type="text"
            autoComplete="off"
            data-autofocus
            readOnly={readOnly}
            value={values.name}
            aria-invalid={check.nameError ? true : undefined}
            aria-describedby={check.nameError ? `${ids.name}-error` : undefined}
            onChange={(event) => {
              onChange({ name: event.target.value });
              onTouch('name');
            }}
          />
          {check.nameError && <Notice id={`${ids.name}-error`}>{check.nameError}</Notice>}
        </div>

        <div className="ev-two">
          <div className="field">
            <span id={`${ids.date}-label`} className="field-label">
              {T.TESTING_DATE}
            </span>
            {/* The dashboard's own calendar (v0.502, v0.503): today or later; opens on the chosen
                month, or this month when empty */}
            <DatePicker
              id={ids.date}
              label={T.TESTING_DATE}
              value={values.testingDate}
              today={today}
              min={testingLimits.min}
              max={testingLimits.max}
              years={testingYears(today, record?.testingDate)}
              hint={T.TESTING_DATE_HINT}
              placeholder={T.CHOOSE}
              disabled={readOnly}
              invalid={Boolean(check.dateError)}
              describedBy={check.dateError ? `${ids.date}-error` : undefined}
              inline={isPhone}
              onChange={(testingDate) => {
                onChange({ testingDate });
                onTouch('testingDate');
              }}
            />
            {check.dateError && <Notice id={`${ids.date}-error`}>{check.dateError}</Notice>}
          </div>
          <div className="field">
            <span id={`${ids.time}-label`} className="field-label">
              {T.START_TIME}
            </span>
            <StarSelect
              id={ids.time}
              labelId={`${ids.time}-label`}
              describedBy={check.timeError ? `${ids.time}-error` : undefined}
              value={values.startTime}
              options={START_TIME_CHOICES}
              placeholder={T.CHOOSE}
              readOnly={readOnly}
              invalid={Boolean(check.timeError)}
              onChange={(startTime) => onChange({ startTime })}
            />
            {check.timeError && <Notice id={`${ids.time}-error`}>{check.timeError}</Notice>}
          </div>
        </div>

        <div className="field">
          <span id={`${ids.where}-label`} className="field-label">
            {T.WHERE}
          </span>
          <StarSelect
            id={ids.where}
            labelId={`${ids.where}-label`}
            describedBy={`${ids.where}-hint${check.whereError ? ` ${ids.where}-error` : ''}`}
            value={values.whereCode}
            options={WHERE_CHOICES}
            placeholder={T.CHOOSE}
            readOnly={readOnly}
            invalid={Boolean(check.whereError)}
            onChange={(whereCode) => onChange({ whereCode })}
          />
          {check.whereError && <Notice id={`${ids.where}-error`}>{check.whereError}</Notice>}
          <p id={`${ids.where}-hint`} className="field-hint">
            {T.WHERE_HINT}
          </p>
          {/* Add event, a later event: what was copied (screen 5). The very first event: nothing. */}
          {isAdd && state.copiedFrom && <p className="field-hint">{T.copiedFromEvent(state.copiedFrom)}</p>}
        </div>

        <div className="field">
          <span id={ids.regLabel} className="field-label">
            {T.REGISTRATION}
          </span>
          <div>
            <ChoiceGroup
              labelId={ids.regLabel}
              options={[
                { key: 'open', label: T.REG_OPEN },
                { key: 'closed', label: T.REG_CLOSED },
              ]}
              value={values.open ? 'open' : 'closed'}
              readOnly={readOnly}
              disabled={switchLocked}
              describedBy={switchLocked ? `${ids.regLabel}-locked` : undefined}
              onChange={(key) => onChange({ open: key === 'open' })}
            />
          </div>
          {switchLocked && (
            <p id={`${ids.regLabel}-locked`} className="field-hint st-reg-hint">
              {T.REGISTRATION_LOCKED_FINISHED}
            </p>
          )}
        </div>

        <div className="field">
          <label className="cbrow" htmlFor={ids.auto}>
            <input
              id={ids.auto}
              type="checkbox"
              className="cb"
              checked={values.autoClose && !closingBlocked}
              disabled={readOnly || closingBlocked}
              aria-label={T.CLOSE_AUTOMATICALLY_LABEL}
              aria-describedby={values.autoClose ? undefined : `${ids.auto}-hint`}
              onChange={(event) => onChange({ autoClose: event.target.checked })}
            />
            <span>{T.CLOSE_AUTOMATICALLY}</span>
          </label>
          <div className="ev-closing">
            {closingBlocked ? (
              // v0.503 item 6: a past event that had no closing date can't have the box ticked
              <p id={`${ids.auto}-hint`} className="field-hint">
                {T.CLOSING_BLOCKED}
              </p>
            ) : values.autoClose ? (
              <>
                <DatePicker
                  id={`${ids.auto}-date`}
                  label={T.CLOSING_DATE_LABEL}
                  value={values.closingDate}
                  today={today}
                  min={closingLimits.min}
                  max={closingLimits.max}
                  years={closingYears(today, values.testingDate, values.closingDate)}
                  hint={closingLimits.passed ? T.CLOSING_PASSED_HINT : T.closingRangeHint(values.testingDate)}
                  marked={isIsoDate(values.testingDate) ? { date: values.testingDate, hintLabel: T.MARKED_TESTING_DATE, srLabel: T.MARKED_TESTING_DATE_SR } : null}
                  placeholder={T.CHOOSE}
                  // Add event: unusable until a testing date is chosen (v0.503 item 2)
                  disabled={readOnly || !isIsoDate(values.testingDate)}
                  invalid={Boolean(check.closingError)}
                  describedBy={`${ids.auto}-closing-hint${check.closingError ? ` ${ids.auto}-closing-error` : ''}`}
                  inline={isPhone}
                  onChange={(closingDate) => {
                    onChange({ closingDate });
                    onTouch('closingDate');
                  }}
                />
                {check.closingError && <Notice id={`${ids.auto}-closing-error`}>{check.closingError}</Notice>}
                {/* A hand-set date pulled back to a new, earlier testing date (v0.503 item 7) */}
                {/* always in the page, so screen readers hear the note when it appears (polite) */}
                <p className="field-hint" aria-live="polite">
                  {!check.closingError && state.closingMoved ? T.closingMoved(state.closingMoved) : ''}
                </p>
                <p id={`${ids.auto}-closing-hint`} className="field-hint">
                  {!isIsoDate(values.testingDate) && (
                    <>
                      {T.CHOOSE_TESTING_DATE_FIRST}
                      <br />
                    </>
                  )}
                  {T.CLOSE_AUTOMATICALLY_HINT}
                </p>
              </>
            ) : (
              // G4: unticked, the switch alone decides (v0.85) — gray, never amber
              <p id={`${ids.auto}-hint`} className="field-hint">
                {keepsClosed ? T.KEPT_CLOSED_HINT : T.switchOnlyHint(values.open)}
              </p>
            )}
          </div>
        </div>

        <button type="button" className="more-toggle" aria-expanded={state.moreOpen ? 'true' : 'false'} aria-controls={ids.more} onClick={onToggleMore}>
          {/* ti-chevron-down / ti-chevron-up = expand / collapse */}
          {state.moreOpen ? <IconChevronUp size={16} aria-hidden="true" /> : <IconChevronDown size={16} aria-hidden="true" />}
          {T.MORE_DETAILS}
        </button>
        <div id={ids.more} hidden={!state.moreOpen}>
          <div className="field">
            <label htmlFor={ids.note}>{T.NOTE_FOR_FAMILIES}</label>
            <textarea
              id={ids.note}
              className="input ev-note"
              rows={3}
              readOnly={readOnly}
              value={values.note}
              aria-invalid={check.noteError ? true : undefined}
              aria-describedby={`${ids.note}-hint`}
              onChange={(event) => onChange({ note: event.target.value })}
            />
            {check.noteError ? (
              <Notice id={`${ids.note}-hint`}>{check.noteError}</Notice>
            ) : (
              <p id={`${ids.note}-hint`} className="field-hint">
                {T.NOTE_HINT}
              </p>
            )}
          </div>
        </div>

        {/* The note sits in the form, above "Last changed" and the buttons (screen 7). */}
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
