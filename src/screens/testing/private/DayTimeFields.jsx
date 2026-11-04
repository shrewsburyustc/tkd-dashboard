// DayTimeFields.jsx — the Day and Time fields of a private testing (mockups P2, P4, P5).
// Why it exists: three dialogs ask for the same two things — Add private testing, Change day or
// time, and Move to private testing on the event page — with the same rules (contract 0014 §1.2,
// rulebook v0.157 / v0.402):
//   Day   the dashboard's own calendar (components/DatePicker.jsx, Star's picker — v1.018,
//         v0.414): days from today to one year from today can be picked; the field writes the
//         day as "Thu, Dec 3, 2026", so there is no weekday line under it any more. On phones the
//         calendar opens in the page, edge to edge (inline), as in Star.
//   Time  the shared time list (components/TimeList.jsx — CB12, rulebook v0.422 / v1.109): 6:00 AM
//         to 10:00 PM in 5-minute steps, its default range and exactly what the database accepts
//         (testing_private_time_is_valid, 0014; privateRules.js); the same list on every device,
//         opening at the chosen time; typing a number jumps to that hour. The hint is under it.
// The messages are amber, under the field: "Enter the day." / "The private day can’t be in the
// past." / "Pick a day within a year from today." / "Choose a time." Save stays gray until fixed.
// PC and tablet: Day and Time side by side; phones: one under the other.
//
// checkDayTime() holds the rules (the dialogs use it to decide whether Save may send);
// DayTimeFields only DRAWS. The values live in the screen's dialog state, like every other field.
import { useLayoutEffect } from 'react';
import Notice from '../../../components/Notice.jsx';
import DatePicker from '../../../components/DatePicker.jsx';
import TimeList from '../../../components/TimeList.jsx';
import { privateDayLimit, privateDayProblem, privateTimeIsValid } from '../../../lib/testing/privateRules.js';
import { yearRange } from '../../../lib/star/eventDateRules.js';
import { PHONE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
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

// The calendar's Year list: this year up to the last day allowed (a year ahead), plus the year of
// the day on show (a stored day that has passed).
const yearOf = (iso) => (iso ? Number(String(iso).slice(0, 4)) : null);
function dayYears(today, limit, day) {
  const first = yearOf(today);
  if (!first) return [];
  return yearRange(first, yearOf(limit) ?? first, [yearOf(day)]);
}

// props: idBase, values { day, time }, check (checkDayTime's answer), readOnly, today,
// autoFocus (the Day field gets focus when the dialog opens), onChange({ day } | { time }),
// onTouch('day' | 'time')
// Phones are found here with the same test Star's tabs use (PHONE_QUERY), so the three dialogs
// that draw these fields don't each have to pass isPhone down.
export default function DayTimeFields({ idBase, values, check, readOnly, today, autoFocus = false, onChange, onTouch }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const dayId = `${idBase}-day`;
  const timeId = `${idBase}-time`;
  const timeHintId = `${timeId}-hint`;
  const lastDay = privateDayLimit(today);
  // autoFocus: the calendar's field can't take data-autofocus itself (a shared part), so it is
  // marked here before the dialog looks for [data-autofocus] (the dialog's own effect runs after
  // this one, so the Day field still gets focus when the dialog opens).
  useLayoutEffect(() => {
    if (autoFocus) document.getElementById(dayId)?.setAttribute('data-autofocus', '');
  }, [autoFocus, dayId]);
  return (
    <div className="ev-two pv-daytime">
      <div className="field">
        <span id={`${dayId}-label`} className="field-label">
          {T.PRIVATE_DAY}
        </span>
        <DatePicker
          id={dayId}
          label={T.PRIVATE_DAY}
          value={values.day}
          today={today}
          min={today || null}
          max={lastDay}
          years={dayYears(today, lastDay, values.day)}
          hint={T.PAST_DATES_HINT}
          placeholder={T.CHOOSE}
          disabled={readOnly}
          invalid={Boolean(check.dayError)}
          describedBy={check.dayError ? `${dayId}-error` : undefined}
          inline={isPhone}
          onChange={(day) => {
            onChange({ day });
            onTouch('day');
          }}
        />
        {check.dayError && <Notice id={`${dayId}-error`}>{check.dayError}</Notice>}
      </div>
      <div className="field">
        {/* A plain text line, as Star's: the field is a button, its name comes through labelId. */}
        <span id={`${timeId}-label`} className="field-label">
          {T.PRIVATE_TIME}
        </span>
        <TimeList
          id={timeId}
          labelId={`${timeId}-label`}
          describedBy={check.timeError ? `${timeId}-error` : timeHintId}
          value={values.time || null}
          placeholder={T.NO_TIME}
          readOnly={readOnly}
          invalid={Boolean(check.timeError)}
          onChange={(time) => {
            onChange({ time });
            onTouch('time');
          }}
        />
        {check.timeError && <Notice id={`${timeId}-error`}>{check.timeError}</Notice>}
        <p id={timeHintId} className="field-hint">
          {T.TIME_HINT}
        </p>
      </div>
    </div>
  );
}
