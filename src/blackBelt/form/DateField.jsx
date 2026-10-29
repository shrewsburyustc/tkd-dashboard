// DateField.jsx — the "Date of birth" field of the Black Belt family form (Form 1, 2, 4).
// Why it exists: rulebook v1.018 (design review BB12) — the date of birth is the SAME calendar
// Star's family page uses for birthdays (src/star-register/DobField.jsx, built on the dashboard's
// components/DatePicker.jsx), not the browser's "mm/dd/yyyy" box, so every family sees the same
// thing on every phone. Set up for a birthday, as Star's:
//   - days after today are gray and can't be chosen (the form refuses a date of birth after today);
//   - with no date yet it opens on THIS month with keyboard focus on the Month list (a birthday is
//     never near today);
//   - the Year list runs from this year back 100 years, newest first;
//   - it opens IN the page under the field on every device: on PC and tablet as a bordered box, on
//     phones edge to edge of the screen (form.css, "the date-of-birth calendar");
//   - the field reads "Mar 4, 2012" and "Choose…" when empty.
// The value is 'YYYY-MM-DD' or '' — DatePicker gives back the same text, so the rest of the form
// is unchanged.
// Focus on an error: when Continue finds the date of birth missing, the form moves keyboard focus
// to it with ref.focus() (FormApp.jsx). DatePicker takes no ref, so this wrapper hands the form a
// small object whose focus() finds the calendar's field by its id and focuses it.
import { forwardRef, useImperativeHandle } from 'react';
import DatePicker from '../../components/DatePicker.jsx';
import { formDobYears } from '../../lib/blackBelt/dateLimits.js';
import { dobLabel } from './format.js';
import * as T from './text.js';

const DateField = forwardRef(function DateField({ id, value, onChange, today, invalid, describedBy }, ref) {
  useImperativeHandle(ref, () => ({ focus: (options) => document.getElementById(id)?.focus(options) }), [id]);
  return (
    // .bbf-dob: form.css hides the field's hint and error under it while the calendar is open
    <div className="bbf-dob">
      <DatePicker
        id={id}
        label={T.DOB}
        value={value}
        onChange={onChange}
        today={today}
        max={today}
        years={formDobYears(today)}
        yearsNewestFirst
        hint={T.DOB_CALENDAR_HINT}
        placeholder={T.CHOOSE}
        invalid={invalid}
        describedBy={describedBy}
        inline
        emptyFocus="month"
        formatValue={dobLabel}
      />
    </div>
  );
});

export default DateField;
