// EventDialog.jsx — "Add event" and "Edit event" for Board breaking (admins only; approved picture B-staff "event").
// Why it exists: an admin adds the monthly board breaking night and edits it later. The form, top to bottom:
//   - Event name and Date (on Both, a School choice first: an event belongs to ONE school, Q2)
//   - Class times: one line per class — a grip to drag it, its name, a start time "to" an end time (the shared
//     time list, components/TimeList.jsx) and a ⋯ menu (Move up · Move down · Remove class) — then "Add class".
//     A new event starts with a COPY of the school's last event's classes; a class with students can't be removed
//   - Registration: Open / Closed (a new event starts Closed)
//   - a gray line: prices and the board chart come from the Chart and prices tab, not from the event
// Like the other dialogs, this only DRAWS the form. Its values live in EventsTab (the `state` prop), so a screen
// lock hides the dialog and brings it back with everything still filled in.
//
// Exports: the dialog (default), checkEventForm (what is wrong + what to send) and isEventFormDirty.
import { useEffect, useRef, useState } from 'react';
import { IconArrowDown, IconArrowUp, IconCheck, IconDots, IconPlus, IconTrash } from '@tabler/icons-react';
import ChoiceGroup from '../../components/ChoiceGroup.jsx';
import DatePicker from '../../components/DatePicker.jsx';
import Dialog from '../../components/Dialog.jsx';
import Grip from '../../components/Grip.jsx';
import IconButton from '../../components/IconButton.jsx';
import Notice from '../../components/Notice.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import TimeList from '../../components/TimeList.jsx';
import { testingDateLimits, testingYears } from '../../lib/star/eventDateRules.js';
import { isIsoDate, timeToMinutes } from '../../lib/testing/eventRules.js';
import { classTimes } from '../../lib/breaking/breakingRules.js';
import { useReorderDrag } from '../../lib/useReorderDrag.js';
import * as T from '../../lib/breaking/text/events.js';

const NAME_MAX = 80;
const CLASS_NAME_MAX = 60;
const SCHOOLS = ['worcester', 'shrewsbury'];

const normalize = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// Do two class lists say the same thing? (ids, names and times, in order)
export function sameRows(a, b) {
  return (
    a.length === b.length &&
    a.every((row, index) => {
      const other = b[index];
      return row.id === other.id && normalize(row.name) === normalize(other.name) && row.startTime === other.startTime && row.endTime === other.endTime;
    })
  );
}

// Did anything change since the dialog opened? (Esc / backdrop / back arrow close only if not.)
export function isEventFormDirty(state) {
  const a = state.values;
  const b = state.initial;
  return normalize(a.name) !== normalize(b.name) || a.date !== b.date || a.open !== b.open || a.school !== b.school || !sameRows(a.rows, b.rows);
}

// Checks the form. Returns the messages to show, whether Save is available and what to send.
//   today   'YYYY-MM-DD' in school time
export function checkEventForm(state, today) {
  const { values, touched, triedSave } = state;
  const isEdit = state.mode === 'edit';

  // ----- Name -----
  const name = normalize(values.name);
  let nameError = null;
  if (name === '') nameError = touched.name || triedSave ? T.ENTER_EVENT_NAME : null;
  else if (name.length > NAME_MAX) nameError = T.EVENT_NAME_LONG;

  // ----- Date: today or later (an edited past event may keep its own date) -----
  let dateError = null;
  const dateOk = isIsoDate(values.date);
  const dateChanged = !isEdit || values.date !== state.initial.date;
  if (!dateOk) dateError = touched.date || triedSave ? T.ENTER_DATE : null;
  else if (dateChanged && values.date < today) dateError = T.DATE_PAST;

  // ----- School (Both: add only) -----
  const schoolOk = SCHOOLS.includes(values.school);
  const schoolError = !schoolOk && triedSave ? T.ENTER_SCHOOL : null;

  // ----- Class times -----
  const rowErrors = {}; // key → { name?, time? }
  let rowsOk = values.rows.length > 0;
  values.rows.forEach((row) => {
    const errors = {};
    const named = normalize(row.name);
    if (named === '') {
      rowsOk = false;
      if (triedSave) errors.name = T.ENTER_CLASS_NAME;
    }
    const a = timeToMinutes(row.startTime ?? '');
    const b = timeToMinutes(row.endTime ?? '');
    if (a === null || b === null) {
      rowsOk = false;
      if (triedSave || state.touchedRows?.[row.key]) errors.time = T.SET_BOTH_TIMES;
    } else if (b <= a) {
      rowsOk = false;
      errors.time = T.END_AFTER_START;
    }
    if (named.length > CLASS_NAME_MAX) rowsOk = false;
    if (errors.name || errors.time) rowErrors[row.key] = errors;
  });
  const classesError = values.rows.length === 0 && triedSave ? T.ADD_ONE_CLASS : null;

  const valid = name !== '' && name.length <= NAME_MAX && dateOk && !(dateChanged && values.date < today) && (isEdit || schoolOk) && rowsOk;
  const payload = valid
    ? {
        name,
        date: values.date,
        school: values.school,
        open: values.open,
        classes: values.rows.map((row) => ({ ...(row.id ? { id: row.id } : {}), name: normalize(row.name), startTime: row.startTime, endTime: row.endTime })),
      }
    : null;
  const sameAsSaved = isEdit && valid && !isEventFormDirty(state);
  const canSave = valid && !state.saving && !state.blocked;
  return { nameError, dateError, schoolError, rowErrors, classesError, canSave, sameAsSaved, payload };
}

// Notes that get the "Discard changes" link on phones (the page has no Cancel button).
const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED'];

export default function EventDialog({
  state, // the form (see EventsTab: openAddEvent / openEditEvent)
  today,
  isPhone,
  onChange, // (patch of values) => void
  onRowChange, // (key, patch) => void
  onTouch, // (field) => void
  onSave,
  onCancel,
  onRequestClose,
}) {
  const isAdd = state.mode === 'add';
  const check = checkEventForm(state, today);
  const readOnly = state.saving;
  const idBase = `brk-event-${state.key}`;
  const values = state.values;
  const rows = values.rows;
  const inUse = new Set(state.inUse ?? []);
  const limits = testingDateLimits(today);
  const schoolFixed = !isAdd || state.schoolFixed;
  const [menu, setMenu] = useState(null); // { key, anchor }

  // Dragging a class by its grip (the shared hook); ⋯ → Move up / Move down is the keyboard way.
  function moveRow(key, toIndex) {
    const from = rows.findIndex((r) => r.key === key);
    if (from < 0 || toIndex < 0 || toIndex >= rows.length || toIndex === from) return;
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(toIndex, 0, row);
    onChange({ rows: next });
  }
  const drag = useReorderDrag({ enabled: !readOnly && menu === null, onDrop: (group, key, toIndex) => moveRow(key, toIndex) });

  function removeRow(key) {
    onChange({ rows: rows.filter((r) => r.key !== key) });
  }
  function addRow() {
    onChange({ rows: [...rows, { key: state.newKey(), id: null, name: '', startTime: null, endTime: null }] });
  }

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
      <IconCheck size={16} aria-hidden="true" />
      {state.saving ? T.SAVING : T.SAVE}
    </button>
  );

  // "Unsaved changes. Save or cancel first." sits above the buttons, which may be far below where the admin is
  // looking, so it is scrolled into view, gently and only as far as needed.
  const noteRef = useRef(null);
  useEffect(() => {
    if (state.note !== 'UNSAVED' || !noteRef.current) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const target = noteRef.current.querySelector('.notice') ?? noteRef.current;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [state.note, state.noteAt]);

  const NOTES = {
    UNSAVED: T.UNSAVED,
    STALE_DIALOG: isPhone ? T.STALE_DIALOG_PHONE : T.STALE_DIALOG,
    NOT_ALLOWED: T.EVENT_NOT_ALLOWED,
    INVALID_DIALOG: T.INVALID_DIALOG,
    SAVE_FAILED: T.SAVE_FAILED,
    CLASS_IN_USE: T.classInUse(state.noteName ?? ''),
  };
  const noteBlock = state.note && (
    <div className="tdialog-note" ref={noteRef}>
      <Notice>
        {NOTES[state.note]}
        {isPhone && PHONE_DISCARD_NOTES.includes(state.note) && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );

  // The gray line under the class list: copied from the last event / the first event / editing.
  let classesHint = T.EDIT_CLASSES_HINT;
  if (isAdd) classesHint = state.copiedFrom ? T.copiedFromEvent(state.copiedFrom) : T.FIRST_EVENT_HINT;

  // One time list (start or end): the shared list, whose name comes from a hidden label.
  const timeField = (row, field, label, error) => {
    const fieldId = `${idBase}-${field}-${row.key}`;
    return (
      <span className="ev-time">
        <span id={`${fieldId}-label`} className="visually-hidden">
          {label}
        </span>
        <TimeList
          id={fieldId}
          labelId={`${fieldId}-label`}
          describedBy={error ? `${idBase}-terr-${row.key}` : undefined}
          value={row[field] ?? null}
          placeholder={T.NO_TIME}
          readOnly={readOnly}
          invalid={Boolean(error)}
          onChange={(time) => onRowChange(row.key, { [field]: time })}
        />
      </span>
    );
  };

  const classRow = (row, index) => {
    const errors = check.rowErrors[row.key] ?? {};
    const lifted = drag.state?.id === row.key;
    return [
      drag.state && drag.state.gap === index && <div key={`gap-${row.key}`} className="brk-crow-gap" aria-hidden="true" />,
      <div key={row.key} className={`ev-crow brk-crow${lifted ? ' is-lifted' : ''}`} data-drag-group="classes" data-drag-id={row.key}>
        <span className="brk-crow-main">
          <Grip label={T.dragClass(row.name)} gripProps={drag.gripProps('classes', row.key)} disabled={readOnly} />
          <input
            className={`input brk-crow-name${errors.name ? ' is-invalid' : ''}`}
            type="text"
            autoComplete="off"
            aria-label={T.classNameLabel(index + 1)}
            aria-invalid={errors.name ? true : undefined}
            readOnly={readOnly}
            value={row.name}
            onChange={(event) => onRowChange(row.key, { name: event.target.value })}
          />
        </span>
        <span className="ev-crow-times">
          {timeField(row, 'startTime', T.startTimeLabel(row.name), errors.time)}
          <span className="ev-crow-to">{T.TIME_TO}</span>
          {timeField(row, 'endTime', T.endTimeLabel(row.name), errors.time)}
          <IconButton
            label={T.classMore(row.name)}
            Icon={IconDots}
            aria-haspopup="menu"
            aria-expanded={menu?.key === row.key ? 'true' : 'false'}
            disabled={readOnly}
            onClick={(event) => setMenu(menu ? null : { key: row.key, anchor: event.currentTarget })}
          />
        </span>
        {(errors.name || errors.time) && (
          <div className="ev-crow-error">
            {errors.name && <Notice>{errors.name}</Notice>}
            {errors.time && <Notice id={`${idBase}-terr-${row.key}`}>{errors.time}</Notice>}
          </div>
        )}
      </div>,
    ];
  };

  const menuRow = menu ? rows.find((r) => r.key === menu.key) : null;
  const menuIndex = menuRow ? rows.indexOf(menuRow) : -1;
  const hasStudents = Boolean(menuRow?.id && inUse.has(menuRow.id));

  return (
    <Dialog title={isAdd ? T.ADD_EVENT_TITLE : T.EDIT_EVENT_TITLE} size="wide" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{state.sub}</p>
      <form onSubmit={handleSubmit} noValidate>
        {!schoolFixed && (
          <div className="field">
            <span id={`${idBase}-school-label`} className="field-label">
              {T.SCHOOL}
            </span>
            <div>
              <ChoiceGroup
                labelId={`${idBase}-school-label`}
                options={SCHOOLS.map((code) => ({ key: code, label: T.schoolName(code) }))}
                value={SCHOOLS.includes(values.school) ? values.school : null}
                readOnly={readOnly}
                invalid={Boolean(check.schoolError)}
                compact
                onChange={(code) => onChange({ school: code })}
              />
            </div>
            {check.schoolError && <Notice>{check.schoolError}</Notice>}
          </div>
        )}
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
            <span id={`${idBase}-date-label`} className="field-label">
              {T.DATE}
            </span>
            <DatePicker
              id={`${idBase}-date`}
              label={T.DATE}
              value={values.date}
              today={today}
              min={limits.min}
              max={limits.max}
              years={testingYears(today, state.initial.date)}
              hint={T.PAST_DAYS_HINT}
              placeholder={T.CHOOSE}
              disabled={readOnly}
              invalid={Boolean(check.dateError)}
              describedBy={check.dateError ? `${idBase}-date-error` : undefined}
              inline={isPhone}
              onChange={(date) => {
                onChange({ date });
                onTouch('date');
              }}
            />
            {check.dateError && <Notice id={`${idBase}-date-error`}>{check.dateError}</Notice>}
          </div>
        </div>

        <div className="field">
          <span id={`${idBase}-classes-label`} className="field-label">
            {T.CLASS_TIMES}
          </span>
          <div className="ev-classes brk-classes" role="group" aria-labelledby={`${idBase}-classes-label`}>
            {rows.map(classRow)}
            {drag.state && drag.state.gap === rows.length && <div className="brk-crow-gap" aria-hidden="true" />}
            <div className="brk-addclass">
              <button type="button" className="btn btn-sm" disabled={readOnly} onClick={addRow}>
                <IconPlus size={16} aria-hidden="true" />
                {T.ADD_CLASS}
              </button>
            </div>
          </div>
          {check.classesError && <Notice>{check.classesError}</Notice>}
          <p className="field-hint">{classesHint}</p>
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
              compact
              onChange={(key) => onChange({ open: key === 'open' })}
            />
          </div>
        </div>
        <p className="field-hint brk-hint">{T.PRICES_HINT}</p>

        {noteBlock}

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
      {menu && menuRow && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={menuRow.name === '' ? T.CLASS_TIMES : menuRow.name}
          subtitle={classTimes({ startTime: menuRow.startTime, endTime: menuRow.endTime }) || T.CLASS_TIMES}
          label={T.classMore(menuRow.name)}
          items={[
            { key: 'up', label: T.MOVE_UP, Icon: IconArrowUp, disabled: menuIndex === 0, onSelect: () => moveRow(menuRow.key, menuIndex - 1) },
            { key: 'down', label: T.MOVE_DOWN, Icon: IconArrowDown, disabled: menuIndex === rows.length - 1, onSelect: () => moveRow(menuRow.key, menuIndex + 1) },
            {
              key: 'remove',
              label: hasStudents ? (
                <span className="ev-menu-two">
                  <span>{T.REMOVE_CLASS}</span>
                  <span className="ev-menu-reason">{T.HAS_STUDENTS}</span>
                </span>
              ) : (
                T.REMOVE_CLASS
              ),
              Icon: IconTrash,
              danger: true,
              separatorBefore: true,
              disabled: hasStudents,
              onSelect: () => removeRow(menuRow.key),
            },
          ]}
          onClose={(reason) => {
            const anchor = menu.anchor;
            setMenu(null);
            if (reason === 'escape' || reason === 'tab') anchor?.focus();
          }}
        />
      )}
    </Dialog>
  );
}
