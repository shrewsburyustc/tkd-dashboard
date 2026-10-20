// CycleDialog.jsx — "Add cycle" and "Edit cycle" (admins only).
// Why it exists: approved mockup Cycles 4 with the v0.902 redraw (contract CONTRACT-0016-B1 §3).
// Top to bottom:
//   - "Both schools test together." (Edit: "Spring 2027 · 9 candidates")
//   - Cycle name, and on Add the hint "Testing days, deadlines and due dates copied from …"
//   - Testing days: one line per day (name; date · time · place; the second part; "Graded: …")
//     with Edit and Delete, then "+ Add testing day" (DayDialog.jsx, opened on top). The error
//     "Curriculum isn't graded on any testing day. …" sits under the list (v0.209 detail 1).
//   - Deadlines: Application due, Submissions due (+ the hand-in hint)
//   - Prices and payment due dates, Kukkiwon certificate fee (PricesSection.jsx)
//   - Registration: Open / Closed (Add starts Closed), "Close automatically at the end of
//     Application due (Sat, Mar 27)" + "11:59 PM, Massachusetts time. …"
//   - Edit: "Last changed by …"; then Cancel · Save (phones: ← and a full-width Save)
// PC / tablet: a dialog that scrolls inside; phones: a full screen.
// Errors show as you type, amber under the field; Save stays BLUE when everything is valid and
// turns gray only while something is wrong (v0.57). This file only draws: the values live in
// useCycleEditor.jsx, so a screen lock hides the dialog and brings it back as it was.
import { useEffect, useId, useRef } from 'react';
import { IconCheck, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import IconButton from '../../../components/IconButton.jsx';
import Notice from '../../../components/Notice.jsx';
import Choice from '../parts/Choice.jsx';
import DateField from '../parts/DateField.jsx';
import PricesSection from './PricesSection.jsx';
import * as T from '../text.js';

// The first problem of a day, as words for the line under it in the list (OP-11: copied past
// dates show "Choose today or a later date." from the start).
function dayListMessage(problems) {
  if (!problems) return null;
  if (problems.date) return T.dateProblemText(problems.date);
  if (problems.name) return T.nameProblemText(problems.name, T.ENTER_DAY_NAME);
  for (const field of ['start', 'end', 'secondStart', 'secondEnd']) if (problems[field]) return T.timeProblemText(problems[field]);
  if (problems.place || problems.secondPlace) return T.placeProblemText(problems.place ?? problems.secondPlace);
  if (problems.parts) return T.TICK_ONE_PART;
  return null;
}

const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE: T.STALE_DIALOG,
  NOT_ALLOWED: T.NOT_ALLOWED,
  INVALID: T.INVALID,
};

export default function CycleDialog({ state, check, isPhone, handlers }) {
  const id = useId();
  const v = state.values;
  const isAdd = state.mode === 'add';
  const readOnly = state.saving;
  const {
    onChange,
    onTouch,
    onSave,
    onCancel,
    onRequestClose,
    onAddDay,
    onEditDay,
    onDeleteDay,
    prices,
  } = handlers;
  const p = check.problems;
  const err = (field) => `${id}-${field}-error`;

  // "Unsaved changes…" may appear far below where the admin is looking: scroll it into view.
  const noteRef = useRef(null);
  useEffect(() => {
    if (!state.note || !noteRef.current) return;
    noteRef.current.querySelector('.notice')?.scrollIntoView({ block: 'nearest' });
  }, [state.note, state.noteAt]);

  // A failed save puts the "Couldn't save … Retry" banner at the top of the form: bring it into
  // view, since the admin pressed Save at the bottom.
  const bannerRef = useRef(null);
  useEffect(() => {
    if (state.failed) bannerRef.current?.scrollIntoView({ block: 'nearest' });
  }, [state.failed]);

  const shown = (field, code) => (code && (code !== 'missing' && code !== 'empty' ? true : state.triedSave || state.touched[field]) ? code : null);
  const nameMsg = check.duplicateName ? T.duplicateCycle(check.duplicateName) : T.nameProblemText(shown('name', p.name), T.ENTER_CYCLE_NAME);
  const appMsg = T.dateProblemText(shown('applicationDue', p.applicationDue));
  const subMsg = T.dateProblemText(shown('submissionsDue', p.submissionsDue));
  const partsMissing = check.partsWithoutDay;
  const daysListMsg = p.daysList === 'none' ? (state.triedSave ? T.ADD_ONE_DAY : null) : p.daysList === 'tooMany' ? T.TOO_MANY_DAYS : null;

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

  const from = T.fromName(v.pricesFrom);

  return (
    <Dialog title={isAdd ? T.ADD_CYCLE_TITLE : T.EDIT_CYCLE_TITLE} size="wide" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{isAdd ? T.ADD_CYCLE_SUB : T.editCycleSub(state.original?.name ?? v.name, state.original?.candidateCount ?? 0)}</p>
      <form
        className="bb-cycle-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div ref={bannerRef}>{state.failed && <ErrorBanner text={T.SAVE_FAILED} onRetry={onSave} retrying={state.saving} />}</div>

        <div className="field">
          <label htmlFor={`${id}-name`}>{T.CYCLE_NAME}</label>
          <input
            id={`${id}-name`}
            className="input bb-name-input"
            type="text"
            autoComplete="off"
            data-autofocus
            readOnly={readOnly}
            value={v.name}
            aria-invalid={nameMsg ? 'true' : undefined}
            aria-describedby={nameMsg ? err('name') : isAdd ? `${id}-copied` : undefined}
            onChange={(event) => {
              onChange({ name: event.target.value });
              onTouch('name');
            }}
          />
          {nameMsg && <Notice id={err('name')}>{nameMsg}</Notice>}
          {isAdd && from && (
            <p id={`${id}-copied`} className="field-hint">
              {T.copiedHint(from)}
            </p>
          )}
        </div>

        <section className="bb-section" aria-labelledby={`${id}-days`}>
          <h3 id={`${id}-days`} className="bb-section-title">
            {T.TESTING_DAYS}
          </h3>
          <div className="bb-days">
            {v.days.length === 0 && <p className="field-hint bb-days-empty">{T.NO_DAYS_YET}</p>}
            {v.days.map((day, index) => {
              const message = dayListMessage(p.days?.[index]);
              return (
                <div key={day.key} className="bb-day" data-day-key={day.key}>
                  <div className="bb-day-text">
                    <p className="bb-day-name">{day.name}</p>
                    <p className="bb-day-line">{T.dayLine(day)}</p>
                    {day.second && <p className="bb-day-line">{T.secondLine(day.second)}</p>}
                    <p className="bb-day-graded">{T.gradedLine(day.parts)}</p>
                    {message && <Notice>{message}</Notice>}
                  </div>
                  <span className="bb-day-acts">
                    <IconButton label={T.editDayLabel(day.name)} Icon={IconEdit} data-day-edit={day.key} onClick={(event) => !readOnly && onEditDay(index, event.currentTarget)} />
                    <IconButton label={T.deleteDayLabel(day.name)} Icon={IconTrash} onClick={() => !readOnly && onDeleteDay(index)} />
                  </span>
                </div>
              );
            })}
          </div>
          {partsMissing.length > 0 && v.days.length > 0 && <Notice>{T.partsWithoutDayText(partsMissing)}</Notice>}
          {daysListMsg && <Notice>{daysListMsg}</Notice>}
          <button type="button" className="btn btn-sm bb-add-row" data-add-day onClick={(event) => !readOnly && onAddDay(event.currentTarget)}>
            {/* ti-plus = add new */}
            <IconPlus size={16} aria-hidden="true" />
            {T.ADD_TESTING_DAY}
          </button>
        </section>

        <section className="bb-section" aria-labelledby={`${id}-deadlines`}>
          <h3 id={`${id}-deadlines`} className="bb-section-title">
            {T.DEADLINES}
          </h3>
          <div className="bb-two">
            <div className="field">
              <label htmlFor={`${id}-app`}>{T.APPLICATION_DUE}</label>
              <DateField
                id={`${id}-app`}
                value={v.applicationDue}
                readOnly={readOnly}
                invalid={Boolean(appMsg)}
                describedBy={appMsg ? err('app') : undefined}
                onChange={(date) => {
                  handlers.onApplicationDue(date);
                  onTouch('applicationDue');
                }}
              />
              {appMsg && <Notice id={err('app')}>{appMsg}</Notice>}
            </div>
            <div className="field">
              <label htmlFor={`${id}-sub`}>{T.SUBMISSIONS_DUE}</label>
              <DateField
                id={`${id}-sub`}
                value={v.submissionsDue}
                readOnly={readOnly}
                invalid={Boolean(subMsg)}
                describedBy={subMsg ? err('sub') : `${id}-sub-hint`}
                onChange={(date) => {
                  onChange({ submissionsDue: date });
                  onTouch('submissionsDue');
                }}
              />
              {subMsg && <Notice id={err('sub')}>{subMsg}</Notice>}
            </div>
          </div>
          <p id={`${id}-sub-hint`} className="field-hint">
            {T.SUBMISSIONS_HINT}
          </p>
        </section>

        <PricesSection mode={state.mode} values={v} formForRules={check.form} problems={p} triedSave={state.triedSave} isPhone={isPhone} readOnly={readOnly} {...prices} />

        <section className="bb-section" aria-labelledby={`${id}-reg`}>
          <h3 id={`${id}-reg`} className="bb-section-title">
            {T.REGISTRATION}
          </h3>
          <Choice
            labelId={`${id}-reg`}
            options={[
              { key: 'open', label: T.REG_OPEN },
              { key: 'closed', label: T.REG_CLOSED },
            ]}
            value={v.registrationOpen ? 'open' : 'closed'}
            readOnly={readOnly}
            onChange={(key) => onChange({ registrationOpen: key === 'open' })}
          />
          <label className="cbrow bb-auto" htmlFor={`${id}-auto`}>
            <input id={`${id}-auto`} type="checkbox" className="cb" checked={v.autoClose} disabled={readOnly} aria-describedby={`${id}-auto-hint`} onChange={(event) => onChange({ autoClose: event.target.checked })} />
            <span>{T.autoCloseLabel(v.applicationDue)}</span>
          </label>
          <p id={`${id}-auto-hint`} className="field-hint bb-auto-hint">
            {T.AUTO_CLOSE_HINT}
          </p>
        </section>

        {state.note && (
          <div className="tdialog-note" ref={noteRef}>
            <Notice>
              {NOTES[state.note]}
              {isPhone && (
                <button type="button" className="note-action" onClick={onCancel}>
                  {T.DISCARD_CHANGES}
                </button>
              )}
            </Notice>
          </div>
        )}
        {!isAdd && state.original?.updatedByName && <p className="tmeta">{T.lastChanged(state.original.updatedByName, state.original.updatedAt)}</p>}

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
