// DayTimeFields.jsx — the Day and Time fields of a private testing (mockups P2, P4, P5).
// Why it exists: three dialogs ask for the same two things — Add private testing, Change day or
// time, and Move to private testing on the event page — with the same rules (contract 0014 §1.2,
// rulebook v0.157 / v0.402):
//   Day   the browser's date field, from today to one year from today; once a valid day is in,
//         the weekday is written out under it ("Thursday, December 3, 2026") so a wrong day is
//         easy to spot
//   Time  a list from 6:00 AM to 10:00 PM in 5-minute steps, with the hint under it
// The messages are amber, under the field: "Enter the day." / "The private day can’t be in the
// past." / "Pick a day within a year from today." / "Choose a time." Save stays gray until fixed.
// PC and tablet: Day and Time side by side; phones: one under the other.
//
// checkDayTime() holds the rules (the dialogs use it to decide whether Save may send);
// DayTimeFields only DRAWS. The values live in the screen's dialog state, like every other field.
import Notice from '../../../components/Notice.jsx';
import { PRIVATE_TIME_CHOICES, privateDayLimit, privateDayProblem, privateTimeIsValid } from '../../../lib/testing/privateRules.js';
import { isIsoDate } from '../../../lib/testing/eventRules.js';
import * as T from '../text.js';

// values  { day: 'YYYY-MM-DD' | '', time: 'HH:MM' | '' }
// options { today, touched: { day, time }, triedSave, pastDay }
//   pastDay = a day the DATABASE just called past (past_day): shown as past while still typed.
// → { dayProblem, dayError, timeError, valid }
export function checkDayTime(values, { today, touched = {}, triedSave = false, pastDay = null }) {
  let dayProblem = privateDayProblem(values.day, today); // null | 'missing' | 'past' | 'tooFar'
  const serverPast = Boolean(pastDay) && values.day === pastDay;
  if (!dayProblem && serverPast) dayProblem = 'past';
  let dayError = null;
  if (dayProblem === 'missing') dayError = touched.day || triedSave ? T.PICK_PRIVATE_DAY : null;
  // A past day is said once the day was edited, Save was tried, or the database said so — not
  // when Change day or time opens on a stored day that has passed (Save stays gray there anyway).
  else if (dayProblem === 'past') dayError = touched.day || triedSave || serverPast ? T.PRIVATE_DAY_PAST : null;
  else if (dayProblem === 'tooFar') dayError = T.PRIVATE_DAY_TOO_FAR;
  const timeOk = privateTimeIsValid(values.time);
  const timeError = !timeOk && (touched.time || triedSave) ? T.PICK_PRIVATE_TIME : null;
  return { dayProblem, dayError, timeError, valid: !dayProblem && timeOk };
}

// props: idBase, values { day, time }, check (checkDayTime's answer), readOnly, today,
// autoFocus (the Day field gets focus when the dialog opens), onChange({ day } | { time }),
// onTouch('day' | 'time')
export default function DayTimeFields({ idBase, values, check, readOnly, today, autoFocus = false, onChange, onTouch }) {
  const dayId = `${idBase}-day`;
  const timeId = `${idBase}-time`;
  const dayHintId = `${dayId}-hint`;
  const timeHintId = `${timeId}-hint`;
  const showWeekday = !check.dayError && !check.dayProblem && isIsoDate(values.day);
  // A stored time that isn't on the list (it always is — the database only takes these) is still offered.
  const choices = values.time && !PRIVATE_TIME_CHOICES.includes(values.time) ? [...PRIVATE_TIME_CHOICES, values.time].sort() : PRIVATE_TIME_CHOICES;
  return (
    <div className="ev-two pv-daytime">
      <div className="field">
        <label htmlFor={dayId}>{T.PRIVATE_DAY}</label>
        <input
          id={dayId}
          className="input pv-date"
          type="date"
          min={today || undefined}
          max={privateDayLimit(today) || undefined}
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
        {showWeekday && (
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
          aria-describedby={check.timeError ? `${timeId}-error` : timeHintId}
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
        <p id={timeHintId} className="field-hint">
          {T.TIME_HINT}
        </p>
      </div>
    </div>
  );
}
