// DayDialog.jsx — "Add testing day" / "Edit testing day", on top of Add / Edit cycle.
// Why it exists: approved mockup Cycles 5 (rulebook v0.918 and its four details). The fields:
//   - Name (shown to families), Date, Start time, End time (the v0.51 dropdown: 6:00 AM–10:00 PM
//     in 15-minute steps), Place (Worcester school · Shrewsbury school · Other place + its text)
//   - "Second part at another time or place" (detail 3: e.g. the outdoor part of Physical at
//     Horgan Arena) → its own Start, End and Place
//   - Graded this day: Physical, Technical, Curriculum (at least one, OP-18). Detail 2: a part
//     ticked on another day too gets the hint "… Grades from both days count as one."
// Save puts the day back into the cycle dialog (sorted by date); NOTHING is saved to the
// database until the cycle's own Save. Errors show as you type, amber under the field; Save is
// gray while there is one (v0.57).
// This file only draws; the values live in useCycleEditor.jsx (so a screen lock keeps them).
import { useId } from 'react';
import { IconCheck } from '@tabler/icons-react';
import Notice from '../../../components/Notice.jsx';
import { TIME_OPTIONS, dayProblems, hasProblems, partsAlsoOnOtherDays } from '../../../lib/blackBelt/rules.js';
import DateField from '../parts/DateField.jsx';
import InnerDialog from '../parts/InnerDialog.jsx';
import SelectField from '../parts/SelectField.jsx';
import { valuesToDay } from './formValues.js';
import * as T from '../text.js';

const TIME_CHOICES = TIME_OPTIONS.map((time) => ({ value: time, label: T.timeLabel(time) }));
const PLACE_CHOICES = [
  { value: 'worcester', label: T.PLACE_SCHOOL.worcester },
  { value: 'shrewsbury', label: T.PLACE_SCHOOL.shrewsbury },
  { value: 'other', label: T.OTHER_PLACE },
];

// The day's problems, and which ones to show now (a field shows its "missing" message once it
// was touched or Save was pressed; every other problem shows at once).
export function checkDay(state, { today, otherDays }) {
  const day = valuesToDay(state.values);
  const problems = dayProblems(day, { today, originalDate: state.originalDate ?? null });
  const show = (field) => {
    const code = problems[field];
    if (!code) return null;
    if (code === 'missing' || code === 'empty' || code === 'none') return state.triedSave || state.touched[field] ? code : null;
    return code;
  };
  return { day, problems, show, valid: !hasProblems(problems), also: partsAlsoOnOtherDays(day, otherDays) };
}

export default function DayDialog({ state, cycleName, dayCount, today, otherDays, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const id = useId();
  const v = state.values;
  const isAdd = state.index === null;
  const check = checkDay(state, { today, otherDays });
  const err = (field) => `${id}-${field}-error`;

  const nameMsg = T.nameProblemText(check.show('name'), T.ENTER_DAY_NAME);
  const dateMsg = T.dateProblemText(check.show('date'));
  const startMsg = T.timeProblemText(check.show('start'));
  const endMsg = T.timeProblemText(check.show('end'));
  const placeMsg = T.placeProblemText(check.show('place'));
  const sStartMsg = T.timeProblemText(check.show('secondStart'), v.end);
  const sEndMsg = T.timeProblemText(check.show('secondEnd'));
  const sPlaceMsg = T.placeProblemText(check.show('secondPlace'));
  const partsMsg = check.show('parts') ? T.TICK_ONE_PART : null;

  function set(patch, touched) {
    onChange(patch);
    if (touched) onTouch(touched);
  }
  function togglePart(part, on) {
    const parts = on ? [...v.parts, part] : v.parts.filter((p) => p !== part);
    set({ parts }, 'parts');
  }

  const saveButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${check.valid ? '' : ' is-unavailable'}`}
      aria-disabled={check.valid ? undefined : 'true'}
    >
      <IconCheck size={16} aria-hidden="true" />
      {T.SAVE}
    </button>
  );

  // One time dropdown with its label and message.
  const timeField = (field, label, message, autoTouch) => (
    <div className="field">
      <span id={`${id}-${field}-label`} className="field-label">
        {label}
      </span>
      <SelectField
        id={`${id}-${field}`}
        labelId={`${id}-${field}-label`}
        describedBy={message ? err(field) : undefined}
        value={v[field] || null}
        options={TIME_CHOICES}
        placeholder={T.CHOOSE_TIME}
        invalid={Boolean(message)}
        onChange={(value) => set({ [field]: value }, autoTouch)}
      />
      {message && <Notice id={err(field)}>{message}</Notice>}
    </div>
  );

  const placeField = (kindField, otherField, label, otherLabel, placeTouch, message, hint) => (
    <>
      <div className="field">
        <span id={`${id}-${kindField}-label`} className="field-label">
          {label}
        </span>
        <SelectField
          id={`${id}-${kindField}`}
          labelId={`${id}-${kindField}-label`}
          value={v[kindField]}
          options={PLACE_CHOICES}
          onChange={(value) => set({ [kindField]: value })}
        />
      </div>
      {v[kindField] === 'other' && (
        <div className="field">
          <label htmlFor={`${id}-${otherField}`}>{otherLabel}</label>
          <input
            id={`${id}-${otherField}`}
            className="input"
            type="text"
            autoComplete="off"
            maxLength={200}
            value={v[otherField]}
            aria-invalid={message ? 'true' : undefined}
            aria-describedby={message ? err(otherField) : hint ? `${id}-${otherField}-hint` : undefined}
            onChange={(event) => set({ [otherField]: event.target.value }, placeTouch)}
          />
          {message ? (
            <Notice id={err(otherField)}>{message}</Notice>
          ) : (
            hint && (
              <p id={`${id}-${otherField}-hint`} className="field-hint">
                {hint}
              </p>
            )
          )}
        </div>
      )}
    </>
  );

  const subtitle = isAdd ? T.addDaySub(cycleName, dayCount + 1) : T.editDaySub(cycleName, state.index + 1, dayCount);

  return (
    <InnerDialog title={isAdd ? T.ADD_DAY_TITLE : T.EDIT_DAY_TITLE} size="medium" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{subtitle}</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSave(check);
        }}
      >
        <div className="field">
          <label htmlFor={`${id}-name`}>{T.DAY_NAME}</label>
          <input
            id={`${id}-name`}
            className="input"
            type="text"
            autoComplete="off"
            data-autofocus
            value={v.name}
            aria-invalid={nameMsg ? 'true' : undefined}
            aria-describedby={nameMsg ? err('name') : `${id}-name-hint`}
            onChange={(event) => set({ name: event.target.value }, 'name')}
          />
          {nameMsg ? (
            <Notice id={err('name')}>{nameMsg}</Notice>
          ) : (
            <p id={`${id}-name-hint`} className="field-hint">
              {T.DAY_NAME_HINT}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor={`${id}-date`}>{T.DATE}</label>
          <DateField id={`${id}-date`} value={v.date} invalid={Boolean(dateMsg)} describedBy={dateMsg ? err('date') : undefined} onChange={(value) => set({ date: value }, 'date')} />
          {dateMsg && <Notice id={err('date')}>{dateMsg}</Notice>}
        </div>
        <div className="bb-two">
          {timeField('start', T.START_TIME, startMsg, 'start')}
          {timeField('end', T.END_TIME, endMsg, 'end')}
        </div>
        {placeField('placeKind', 'placeOther', T.PLACE, T.OTHER_PLACE, 'place', placeMsg, null)}

        <div className="field">
          <label className="cbrow" htmlFor={`${id}-second`}>
            <input id={`${id}-second`} type="checkbox" className="cb" checked={v.hasSecond} onChange={(event) => set({ hasSecond: event.target.checked })} />
            <span>{T.SECOND_PART_TICK}</span>
          </label>
        </div>
        {v.hasSecond && (
          <div className="bb-second">
            <div className="bb-two">
              {timeField('secondStart', T.START_TIME, sStartMsg, 'secondStart')}
              {timeField('secondEnd', T.END_TIME, sEndMsg, 'secondEnd')}
            </div>
            {placeField('secondKind', 'secondOther', T.PLACE, T.OTHER_PLACE, 'secondPlace', sPlaceMsg, T.OTHER_PLACE_HINT)}
          </div>
        )}

        <div className="field">
          <span id={`${id}-parts-label`} className="field-label bb-parts-title">
            {T.GRADED_THIS_DAY}
          </span>
          <div className="bb-parts" role="group" aria-labelledby={`${id}-parts-label`} aria-describedby={partsMsg ? err('parts') : undefined}>
            {T.PART_ORDER.map((part) => (
              <label key={part} className="cbrow" htmlFor={`${id}-part-${part}`}>
                <input id={`${id}-part-${part}`} type="checkbox" className="cb" checked={v.parts.includes(part)} onChange={(event) => togglePart(part, event.target.checked)} />
                <span>{T.PART_NAMES[part]}</span>
              </label>
            ))}
          </div>
          {partsMsg && <Notice id={err('parts')}>{partsMsg}</Notice>}
          {T.PART_ORDER.map((part) => {
            const others = check.also.filter((x) => x.part === part).map((x) => x.day);
            return others.length > 0 ? (
              <p key={part} className="field-hint bb-also">
                {T.alsoGradedOn(part, others)}
              </p>
            ) : null;
          })}
        </div>

        {state.note && (
          <div className="tdialog-note">
            <Notice>
              {T.UNSAVED}
              {isPhone && (
                <button type="button" className="note-action" onClick={onCancel}>
                  {T.DISCARD_CHANGES}
                </button>
              )}
            </Notice>
          </div>
        )}

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
    </InnerDialog>
  );
}
