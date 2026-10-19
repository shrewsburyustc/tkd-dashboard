// PrivateDialog.jsx — "Set private testing" and "Change private day or time" (mockup P3).
// Why it exists: phase 4 (contract 0014 §5.5, rulebook v0.225–v0.228, v0.254). A family can't
// make the testing day, so the desk gives the student their own day and time. The student stays
// in the event (Students tab, counts, payments) but is graded on their own page, and pays the
// rank's private price (set in Classes and ranks — nothing is typed here, Q3).
//
// What the dialog shows:
//   - title "Set private testing" (or "Change private day or time"), subtitle
//     "Ava Chen · Group A · Yellow → Orange"
//   - Day: the browser's date field (today … one year after the testing day); once a valid day is
//     in, the weekday is written out under it ("Tuesday, December 1, 2026") so a wrong day is easy
//     to spot (v0.157)
//   - Time: a list in 5-minute steps, 6:00 AM to 10:00 PM
//   - Set only: the gray price box "$65 → $85 private price" + where the price comes from and what
//     Mark paid will charge (or, when already paid, how much is still to collect), then the short
//     line "Ava stays in this event. …"
//   - an amber notice before Save when saving clears a No show (the testing day's, or the private
//     day's when the day changes)
// Change opens with the saved day and time filled in, and Save stays unavailable until one of
// them is different (the database writes nothing for the same day and time).
// No toast after Save: the row's Private line is the confirmation (approved P3 proposal).
//
// Also exported for Add student's "Tests privately" section (P3b, StudentDialog.jsx):
//   checkPrivateFields   the Day / Time rules and messages
//   PrivateFields        the Day and Time fields
//   PrivatePriceBox      the gray price box
//
// Like the other dialogs this only DRAWS; the values live in EventPage (`state`), so a screen
// lock hides the dialog and brings it back with everything still filled in.
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import {
  PRIVATE_TIME_CHOICES,
  amountDue,
  isIsoDate,
  priceFor,
  privateDayLimit,
  privateDayProblem,
  privateTimeIsValid,
} from '../../../lib/testing/eventRules.js';
import * as T from '../text.js';

// ----- The Day / Time rules -----
// values  { day: 'YYYY-MM-DD' | '', time: 'HH:MM' | '' }
// options { today, testingDate, touched: { day, time }, triedSave, pastDay }
//   pastDay = a day the DATABASE just called past (past_day): shown as past while it is still typed.
// → { dayProblem, dayError, timeError, valid }
export function checkPrivateFields(values, { today, testingDate, touched = {}, triedSave = false, pastDay = null }) {
  let dayProblem = privateDayProblem(values.day, today, testingDate); // null | 'missing' | 'past' | 'tooFar'
  const serverPast = Boolean(pastDay) && values.day === pastDay;
  if (!dayProblem && serverPast) dayProblem = 'past';
  let dayError = null;
  if (dayProblem === 'missing') dayError = touched.day || triedSave ? T.PICK_PRIVATE_DAY : null;
  // A past day is said once the day was edited, Save was tried, or the database said so — not when
  // Change opens on a stored day that has passed (Save stays unavailable there anyway).
  else if (dayProblem === 'past') dayError = touched.day || triedSave || serverPast ? T.PRIVATE_DAY_PAST : null;
  else if (dayProblem === 'tooFar') dayError = T.PRIVATE_DAY_TOO_FAR;
  const timeOk = privateTimeIsValid(values.time);
  const timeError = !timeOk && (touched.time || triedSave) ? T.PICK_PRIVATE_TIME : null;
  return { dayProblem, dayError, timeError, valid: !dayProblem && timeOk };
}

// ----- The Day and Time fields -----
// onChange({ day } | { time }), onTouch('day' | 'time')
export function PrivateFields({ idBase, values, check, readOnly, today, testingDate, autoFocus = false, onChange, onTouch }) {
  const dayId = `${idBase}-day`;
  const timeId = `${idBase}-time`;
  const dayHintId = `${dayId}-hint`;
  const showWeekday = !check.dayProblem && isIsoDate(values.day);
  // A saved time that isn't on the list (it always is — the database only takes these) is still offered.
  const choices = values.time && !PRIVATE_TIME_CHOICES.includes(values.time) ? [...PRIVATE_TIME_CHOICES, values.time].sort() : PRIVATE_TIME_CHOICES;
  return (
    <>
      <div className="field">
        <label htmlFor={dayId}>{T.PRIVATE_DAY}</label>
        <input
          id={dayId}
          className="input ev-date"
          type="date"
          min={today || undefined}
          max={privateDayLimit(testingDate) || undefined}
          readOnly={readOnly}
          data-autofocus={autoFocus ? true : undefined}
          value={values.day}
          aria-invalid={check.dayError ? true : undefined}
          aria-describedby={check.dayError ? `${dayId}-error` : showWeekday ? dayHintId : undefined}
          onChange={(event) => {
            onChange({ day: event.target.value });
            onTouch('day');
          }}
        />
        {check.dayError && <Notice id={`${dayId}-error`}>{check.dayError}</Notice>}
        {/* The day written out, so a wrong weekday is easy to spot (v0.157). */}
        {!check.dayError && showWeekday && (
          <p id={dayHintId} className="field-hint">
            {T.longDate(values.day)}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={timeId}>{T.PRIVATE_TIME}</label>
        <select
          id={timeId}
          className="input pv-time"
          disabled={readOnly}
          value={values.time}
          aria-invalid={check.timeError ? true : undefined}
          aria-describedby={check.timeError ? `${timeId}-error` : undefined}
          onChange={(event) => {
            onChange({ time: event.target.value });
            onTouch('time');
          }}
        >
          <option value="">{T.NO_TIME}</option>
          {choices.map((time) => (
            <option key={time} value={time}>
              {T.timeLabel(time)}
            </option>
          ))}
        </select>
        {check.timeError && <Notice id={`${timeId}-error`}>{check.timeError}</Notice>}
      </div>
    </>
  );
}

// ----- The gray price box -----
// "$65 → $85 private price" (bold), then "The private price for Yellow in Classes and ranks.
// Mark paid charges $85." When the student already paid, the second sentence becomes
// "Paid $65 · $20 more to collect after saving" (or "Already paid $85. Nothing more to collect.").
// currentCents = what the student would pay now without the private day (eventRules.priceFor).
export function PrivatePriceBox({ rank, currentCents, paid = false, paidCents = 0, today, testingDate }) {
  if (!rank) return null;
  let paidLine = null;
  if (paid) {
    // The money rule (eventRules.amountDue): private price minus what is already paid. Any day
    // stands in for the private day here — only "is private" matters to the amount.
    const due = amountDue({ rank, privateDate: testingDate, paidCents, today, testingDate });
    paidLine = due > 0 ? T.privatePaidMore(paidCents, due) : T.privatePaidEnough(paidCents);
  }
  return (
    <div className="pv-price">
      <p className="pv-price-line">{T.privatePriceChange(currentCents, rank.privateCents)}</p>
      <p className="pv-price-hint">
        {paidLine ? T.privatePriceSource(rank.name) : T.privatePriceHint(rank.name, rank.privateCents)}
        {paidLine && <span className="pv-price-paid">{paidLine}</span>}
      </p>
    </div>
  );
}

// ----- The dialog -----
export function isPrivateDirty(state) {
  return state.values.day !== state.initial.day || state.values.time !== state.initial.time;
}

// state.mode 'set' | 'change'. Change: Save only once the day or the time differs from the saved ones.
export function checkPrivateDialog(state, { today, testingDate }) {
  const fields = checkPrivateFields(state.values, {
    today,
    testingDate,
    touched: state.touched,
    triedSave: state.triedSave,
    pastDay: state.pastDay ?? null,
  });
  const changed = state.mode === 'set' || isPrivateDirty(state);
  return { ...fields, changed, canSave: fields.valid && changed && !state.saving && !state.blocked };
}

const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'PRIVATE_HAS_RESULT', 'PRIVATE_GRADED'];
const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  PRIVATE_HAS_RESULT: T.PRIVATE_HAS_RESULT,
  PRIVATE_GRADED: T.PRIVATE_GRADED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
};

// props: state (EventPage's dialog), record (the roster row), rank (its rank copy, with
// testingFor), className, event, today, isPhone, onChange, onTouch, onSave(canSave), onCancel,
// onRequestClose
export default function PrivateDialog({ state, record, rank, className, event, today, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const isSet = state.mode === 'set';
  const idBase = `private-dialog-${state.key}`;
  const readOnly = state.saving;
  const check = checkPrivateDialog(state, { today, testingDate: event.testingDate });
  const name = T.studentLabel(record);
  const subtitle = T.privateDialogSub(name, className, rank?.name ?? '', rank?.testingFor?.name ?? T.NO_NEW_RANK);

  // Saving clears a No show (contract 0014 §2.4 step 8): say so before Save.
  let clearing = null;
  const hasNote = typeof record.note === 'string' && record.note !== '';
  if (record.result === 'no_show') {
    clearing = isSet ? T.clearsNoShow(record.firstName, event.testingDate, hasNote) : T.clearsPrivateNoShow(record.firstName, record.privateDate, hasNote);
  }

  function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
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
    <Dialog title={isSet ? T.SET_PRIVATE_TITLE : T.CHANGE_PRIVATE_TITLE} fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{subtitle}</p>
      <form onSubmit={handleSubmit} noValidate className="pv-form">
        <PrivateFields
          idBase={idBase}
          values={state.values}
          check={check}
          readOnly={readOnly}
          today={today}
          testingDate={event.testingDate}
          autoFocus
          onChange={onChange}
          onTouch={onTouch}
        />
        {isSet && (
          <>
            <PrivatePriceBox
              rank={rank}
              currentCents={rank ? priceFor({ rank, privateDate: null, today, testingDate: event.testingDate }) : 0}
              paid={record.paid}
              paidCents={record.paidCents}
              today={today}
              testingDate={event.testingDate}
            />
            <p className="field-hint pv-stays">{T.privateStaysLine(record.firstName)}</p>
          </>
        )}
        {clearing && (
          <div className="pv-clearing">
            <Notice>{clearing}</Notice>
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
