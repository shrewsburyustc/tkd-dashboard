// TimesSection.jsx — section 2 of Add / Edit camp: camp hours and the sign-up dates (C3).
// Why it exists: "camp hours in 5-minute steps, family sign-up opens / closes, early price until —
// prefilled from the template as days before camp, and changeable" (C3).
//   Camp:      Starts · Ends (lists in 5-minute steps), then three dates: Family sign-up opens,
//              Family sign-up closes, Early price until
//   Template:  Starts · Ends, then the same three as "days before the first day" (a template has
//              no dates; a negative number means after the first day)
// The rules (end after start; opens ≤ closes; early ≤ closes; closes ≤ last camp day) are checked
// in campForm.js; their messages show under the field they belong to.
// The three dates use the dashboard's own calendar, Star's shared DatePicker (rulebook v0.727 /
// v1.018, design review C13), instead of the browser's date box. No days are grayed here: a date
// that breaks a rule shows the field's amber error line, as before. On phones the calendar opens in
// the page under the field (inline), as in Star.
import DatePicker from '../../../components/DatePicker.jsx';
import Notice from '../../../components/Notice.jsx';
import { yearsAround } from '../../../lib/camps/campRules.js';
import { TIME_CHOICES } from './campForm.js';
import * as T from '../text.js';

export default function TimesSection({ mode, values, errors, show, readOnly, idBase, today, isPhone, onChange, onDateChange }) {
  const err = (key) => (show ? errors[key] : null);
  // A saved time that isn't on the 5-minute list is still offered.
  const choices = (value) => (value && !TIME_CHOICES.includes(value) ? [...TIME_CHOICES, value].sort() : TIME_CHOICES);
  const timeSelect = (field, label) => (
    <div className="field">
      <label htmlFor={`${idBase}-${field}`}>{label}</label>
      <select
        id={`${idBase}-${field}`}
        className="input cp-time"
        tabIndex={0}
        disabled={readOnly}
        value={values[field]}
        aria-invalid={err(field) ? 'true' : undefined}
        onChange={(event) => onChange({ [field]: event.target.value })}
      >
        {choices(values[field]).map((time) => (
          <option key={time} value={time}>
            {T.timeLabel(time)}
          </option>
        ))}
      </select>
      {err(field) && <Notice>{err(field)}</Notice>}
    </div>
  );
  // The Year list in each calendar: this year and next, the camp's days' years and the dates
  // already chosen (so an older camp's dates can still be shown and changed).
  const years = yearsAround(today, [...values.days, values.opensOn, values.closesOn, values.earlyUntil]);
  // The visible name is a plain text line (as Star's): the field is a button whose own name
  // already says "Family sign-up opens, Monday, May 3, 2027", so a <label> would only duplicate it.
  const dateField = (field, label) => (
    <div className="field">
      <span id={`${idBase}-${field}-label`} className="field-label">
        {label}
      </span>
      <DatePicker
        id={`${idBase}-${field}`}
        label={label}
        value={values[field]}
        today={today}
        years={years}
        disabled={readOnly}
        invalid={Boolean(err(field))}
        describedBy={err(field) ? `${idBase}-${field}-error` : undefined}
        inline={isPhone}
        onChange={(iso) => onDateChange({ [field]: iso })}
      />
      {err(field) && <Notice id={`${idBase}-${field}-error`}>{err(field)}</Notice>}
    </div>
  );
  const offsetField = (field, label) => (
    <div className="field">
      <label htmlFor={`${idBase}-${field}`}>{label}</label>
      <input
        id={`${idBase}-${field}`}
        className="input cp-offset"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        readOnly={readOnly}
        value={values[field]}
        aria-invalid={err(field) ? true : undefined}
        onChange={(event) => onChange({ [field]: event.target.value })}
      />
      {err(field) && <Notice>{err(field)}</Notice>}
    </div>
  );

  return (
    <>
      <p className="field-label cp-sub-label">{T.CAMP_HOURS}</p>
      <div className="ev-two cp-two">
        {timeSelect('startTime', T.STARTS)}
        {timeSelect('endTime', T.ENDS)}
      </div>
      {mode === 'template' ? (
        <>
          <div className="cp-three">
            {offsetField('opensBefore', T.OPENS_DAYS_BEFORE)}
            {offsetField('closesBefore', T.CLOSES_DAYS_BEFORE)}
            {offsetField('earlyBefore', T.EARLY_DAYS_BEFORE)}
          </div>
          <p className="field-hint">{T.OFFSETS_HINT}</p>
          {err('offsets') && <Notice>{err('offsets')}</Notice>}
        </>
      ) : (
        <div className="cp-three">
          {dateField('opensOn', T.SIGNUP_OPENS)}
          {dateField('closesOn', T.SIGNUP_CLOSES)}
          {dateField('earlyUntil', T.EARLY_UNTIL)}
        </div>
      )}
    </>
  );
}
