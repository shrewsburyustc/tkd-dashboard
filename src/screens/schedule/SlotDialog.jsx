// SlotDialog.jsx — "Add time slot" and "Edit time slot" (approved mockup screens 2 and 3).
// Why it exists: one form for both. Add can tick several days at once (one slot per day,
// v0.233); Edit changes one slot and has Remove (instant, with Undo — no confirmation).
//   Class  — this school's classes from Testing → Classes and ranks: tick ONE, or several that
//            are taught together ("White + Little Tiger", v0.237)
//   Color  — belongs to each CLASS (one row per ticked class): changing it recolors every slot
//            of that class
//   Ages   — also belongs to each class (v0.619): From / To, shown next to the class on the
//            booking forms ("Ages 7–12", "Ages 7+"); both empty = none
//   Days / Day, Starts, Ends — checked as you type (5-minute steps, 15 min – 4 h)
// Overlapping another class is allowed (two mats); an amber note says so, Save still works.
//
// Like Testing's dialogs, the typed values live in the parent (ScheduleSchool) so they survive
// the screen locking while the dialog is open.
import { IconCheck, IconTrash } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { CLASS_COLORS } from '../../lib/schedule/colors.js';
import { agesLabel, agesProblem, readAges } from '../../lib/schedule/ages.js';
import { findOverlaps, parseTime, timeProblem } from '../../lib/schedule/time.js';
import { WEEKDAYS } from '../../lib/schedule/time.js';
import * as T from './text.js';

export function isSlotFormDirty(state) {
  return JSON.stringify(state.values) !== JSON.stringify(state.initial);
}

// Checks the form. versionSlots: the other slots of the same schedule (for the overlap note).
export function checkSlotForm(state, versionSlots) {
  const { values, touched } = state;
  const start = parseTime(values.start);
  const end = parseTime(values.end);
  const days = state.mode === 'add' ? values.days : [values.day];
  const classError = values.classIds.length === 0 && touched.classIds ? T.PICK_CLASS : null;
  const dayError = days.length === 0 && touched.days ? T.PICK_DAY : null;
  const problem = timeProblem(start, end);
  // "missing" only shows once someone has typed in a time box; the others show right away.
  const timeError = problem && (problem !== 'missing' || touched.start || touched.end) ? T.timeProblemText(problem) : null;
  // each ticked class's ages: a problem blocks Save at once, but its words show under that
  // class's boxes only after one of them was left (or Save pressed) — not while typing "12"
  const agesProblems = values.classIds
    .map((id) => [id, agesProblem(values.ages?.[id]?.from, values.ages?.[id]?.to)])
    .filter(([, p]) => p !== null);
  const ageErrors = Object.fromEntries(agesProblems.filter(([id]) => touched[`ages-${id}`]).map(([id, p]) => [id, T.AGES_PROBLEM[p]]));
  const agesOk = agesProblems.length === 0;
  const valid = values.classIds.length > 0 && days.length > 0 && problem === null && agesOk;
  const overlapList = valid ? findOverlaps(versionSlots, days, start, end, state.slotId ?? null) : [];
  const sameAsSaved = state.mode === 'edit' && !isSlotFormDirty(state);
  return {
    classError,
    ageErrors,
    dayError,
    timeError,
    overlapList,
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved,
    payload: valid
      ? {
          classIds: values.classIds,
          colors: values.colors,
          ages: Object.fromEntries(values.classIds.map((id) => [id, readAges(values.ages?.[id]?.from, values.ages?.[id]?.to)])),
          days,
          start,
          end,
        }
      : null,
  };
}

const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED', 'PAST_NOT_ALLOWED'];
const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.NOT_ALLOWED,
  PAST_NOT_ALLOWED: T.PAST_NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
  COLOR_FAILED: T.COLOR_FAILED,
  AGES_FAILED: T.AGES_FAILED,
};

export default function SlotDialog({
  state,
  school,
  versionLabel,
  classes, // [{ id, name }] of this school
  versionSlots, // the schedule's slots, for overlaps
  isPhone,
  onChange,
  onTouch,
  onSave,
  onRemove,
  onCancel,
  onRequestClose,
}) {
  const isAdd = state.mode === 'add';
  const check = checkSlotForm(state, versionSlots);
  const readOnly = state.saving;
  const idBase = `slot-dialog-${state.key}`;
  const nameOf = (id) => classes.find((c) => c.id === id)?.name ?? '';

  function handleSubmit(event) {
    event.preventDefault();
    if (check.canSave) onSave();
    else onTouch(['classIds', 'days', 'start', 'end', ...state.values.classIds.map((id) => `ages-${id}`)]);
  }

  const saveButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${check.canSave ? '' : ' is-unavailable'}`}
      aria-disabled={check.canSave ? undefined : 'true'}
    >
      <IconCheck size={16} aria-hidden="true" />
      {state.saving && !state.removing ? T.SAVING : T.SAVE}
    </button>
  );
  const removeButton = !isAdd && (
    <button type="button" className="btn sdialog-remove" disabled={readOnly || state.blocked} onClick={onRemove}>
      {/* ti-trash = delete / remove; red text only (red means delete, guidelines 7) */}
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
    <Dialog title={isAdd ? T.ADD_SLOT_TITLE : T.EDIT_SLOT_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.slotSubtitle(school, versionLabel)}</p>
      <form onSubmit={handleSubmit} noValidate>
        {classes.length === 0 ? (
          <Notice>{T.NO_CLASSES_IN_TESTING}</Notice>
        ) : (
          <>
            <fieldset className="field sdialog-fieldset" aria-describedby={check.classError ? `${idBase}-class-error` : `${idBase}-class-hint`}>
              <legend className="field-label">{T.CLASSES}</legend>
              <div className="sclasses">
                {classes.map((c, i) => (
                  <label key={c.id} className="sday-check">
                    <input
                      type="checkbox"
                      data-autofocus={i === 0 ? true : undefined}
                      disabled={readOnly}
                      checked={state.values.classIds.includes(c.id)}
                      onChange={(e) => {
                        const ids = e.target.checked ? [...state.values.classIds, c.id] : state.values.classIds.filter((x) => x !== c.id);
                        onChange({ classIds: ids }, 'class');
                        onTouch(['classIds']);
                      }}
                    />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
              {check.classError ? (
                <Notice id={`${idBase}-class-error`}>{check.classError}</Notice>
              ) : (
                <p id={`${idBase}-class-hint`} className="field-hint">
                  {state.values.classIds.length > 1 ? T.together(state.values.classIds.map(nameOf)) : T.CLASS_HINT}
                </p>
              )}
            </fieldset>

            {state.values.classIds.map((classId) => (
              <fieldset key={classId} className="field sdialog-fieldset">
                <legend id={`${idBase}-color-${classId}`} className="field-label">
                  {state.values.classIds.length > 1 ? T.colorFor(nameOf(classId)) : T.COLOR}
                </legend>
                <div className="sswatches" role="radiogroup" aria-labelledby={`${idBase}-color-${classId}`} aria-describedby={`${idBase}-color-hint-${classId}`}>
                  {CLASS_COLORS.map((c) => {
                    const on = (state.values.colors[classId] ?? 'gray') === c.key;
                    return (
                      <label key={c.key} className={`sswatch${on ? ' is-on' : ''}`} style={{ '--sw-fill': c.fill, '--sw-edge': c.edge }}>
                        <input
                          type="radio"
                          name={`${idBase}-color-${classId}`}
                          className="sswatch-input"
                          value={c.key}
                          checked={on}
                          disabled={readOnly}
                          aria-label={T.colorName(c.label)}
                          onChange={() => onChange({ colors: { ...state.values.colors, [classId]: c.key } })}
                        />
                        <span className="sswatch-dot" aria-hidden="true" />
                      </label>
                    );
                  })}
                </div>
                <p id={`${idBase}-color-hint-${classId}`} className="field-hint">
                  {T.colorHint(nameOf(classId))}
                </p>
              </fieldset>
            ))}

            {/* Each ticked class's ages (v0.619): two whole-number boxes and what the forms will show */}
            {state.values.classIds.map((classId) => {
              const typed = state.values.ages?.[classId] ?? { from: '', to: '' };
              const setAge = (patch) => onChange({ ages: { ...state.values.ages, [classId]: { ...typed, ...patch } } });
              const error = check.ageErrors[classId] ?? null;
              const shown = agesProblem(typed.from, typed.to) ? '' : agesLabel(readAges(typed.from, typed.to).from, readAges(typed.from, typed.to).to);
              const hintId = `${idBase}-ages-hint-${classId}`;
              const errorId = `${idBase}-ages-error-${classId}`;
              const showsId = `${idBase}-ages-shows-${classId}`;
              // read with the boxes: the problem, what the forms will show, then the hint
              const described = [error ? errorId : null, shown ? showsId : null, hintId].filter(Boolean).join(' ');
              const leave = () => onTouch([`ages-${classId}`]);
              return (
                <fieldset key={`ages-${classId}`} className="field sdialog-fieldset">
                  <legend className="field-label">{T.agesFor(nameOf(classId))}</legend>
                  <div className="sages">
                    <label className="sages-box">
                      <span className="sages-label">{T.AGE_FROM}</span>
                      <input
                        className="input sages-input"
                        inputMode="numeric"
                        maxLength={2}
                        value={typed.from}
                        readOnly={readOnly}
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={described}
                        onBlur={leave}
                        onChange={(e) => setAge({ from: e.target.value.replace(/[^0-9]/g, '') })}
                      />
                    </label>
                    <label className="sages-box">
                      <span className="sages-label">{T.AGE_TO}</span>
                      <input
                        className="input sages-input"
                        inputMode="numeric"
                        maxLength={2}
                        value={typed.to}
                        readOnly={readOnly}
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={described}
                        onBlur={leave}
                        onChange={(e) => setAge({ to: e.target.value.replace(/[^0-9]/g, '') })}
                      />
                    </label>
                    {shown && (
                      <span id={showsId} className="sages-shows">
                        {T.agesShowsAs(shown)}
                      </span>
                    )}
                  </div>
                  {error && <Notice id={errorId}>{error}</Notice>}
                  <p id={hintId} className="field-hint">
                    {T.agesHint(nameOf(classId), typed.from)}
                  </p>
                </fieldset>
              );
            })}

            {isAdd ? (
              <fieldset className="field sdialog-fieldset">
                <legend className="field-label">{T.DAYS}</legend>
                <div className="sdays">
                  {WEEKDAYS.map((d) => (
                    <label key={d} className="sday-check">
                      <input
                        type="checkbox"
                        disabled={readOnly}
                        checked={state.values.days.includes(d)}
                        onChange={(e) => {
                          const days = e.target.checked
                            ? [...state.values.days, d].sort((a, b) => a - b)
                            : state.values.days.filter((x) => x !== d);
                          onChange({ days });
                          onTouch(['days']);
                        }}
                      />
                      <span>{T.DAY_SHORT[d]}</span>
                    </label>
                  ))}
                </div>
                {check.dayError && <Notice>{check.dayError}</Notice>}
              </fieldset>
            ) : (
              <div className="field">
                <label htmlFor={`${idBase}-day`}>{T.DAY}</label>
                <select
                  id={`${idBase}-day`}
                  className="input sdialog-select"
                  disabled={readOnly}
                  value={state.values.day}
                  onChange={(e) => onChange({ day: Number(e.target.value) })}
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>
                      {T.DAY_LONG[d]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="stimes">
              <div className="field">
                <label htmlFor={`${idBase}-start`}>{T.STARTS}</label>
                <input
                  id={`${idBase}-start`}
                  className="input"
                  type="time"
                  step={300}
                  readOnly={readOnly}
                  value={state.values.start}
                  aria-invalid={check.timeError ? true : undefined}
                  aria-describedby={check.timeError ? `${idBase}-time-error` : undefined}
                  onChange={(e) => {
                    onChange({ start: e.target.value });
                    onTouch(['start']);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor={`${idBase}-end`}>{T.ENDS}</label>
                <input
                  id={`${idBase}-end`}
                  className="input"
                  type="time"
                  step={300}
                  readOnly={readOnly}
                  value={state.values.end}
                  aria-invalid={check.timeError ? true : undefined}
                  aria-describedby={check.timeError ? `${idBase}-time-error` : undefined}
                  onChange={(e) => {
                    onChange({ end: e.target.value });
                    onTouch(['end']);
                  }}
                />
              </div>
            </div>
            {check.timeError && <Notice id={`${idBase}-time-error`}>{check.timeError}</Notice>}
            {check.overlapList.length > 0 && (
              <div className="sdialog-overlap">
                <Notice>{T.overlapNote(check.overlapList.map((s) => ({ ...s, className: s.classIds.map(nameOf).join(' + ') })))}</Notice>
              </div>
            )}
          </>
        )}

        {isPhone && noteBlock}
        {isPhone ? (
          <>
            <div className="dialog-page-submit">{saveButton}</div>
            {removeButton && <div className="sdialog-remove-row">{removeButton}</div>}
          </>
        ) : (
          <div className="dialog-footer">
            <div className="dialog-actions sdialog-actions">
              {removeButton}
              <span className="sdialog-actions-right">
                <button type="button" className="btn" onClick={onCancel}>
                  {T.CANCEL}
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
