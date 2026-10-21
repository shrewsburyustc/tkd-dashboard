// DobField.jsx — the date-of-birth field of the Star family form, built on the dashboard calendar.
// Why it exists: v0.93 (a calendar, not typing), Form screen 4 (Month and Year first, future days
// gray) and v0.510 / gap mockup F6: the SAME calendar as the dashboard (src/components/DatePicker.jsx,
// v0.502 / v0.503 — its keyboard and screen-reader rules unchanged), set up for a birthday:
//   - days after today are gray and can't be chosen (the database refuses a DOB after today, §8.3);
//     in this year the months after this month are gray in the Month list;
//   - with no date yet it opens on THIS month with keyboard focus on the Month list (a birthday is
//     never near today — a deliberate difference from event dates, which focus today);
//   - the Year list runs from this year back 100 years (to 1926 in 2026), newest first;
//   - it opens IN the page under the field on every device (not a floating box): on PC and tablet as
//     a bordered box, on phones edge to edge of the screen (star-register.css);
//   - the field reads "Mar 4, 2012" (Form screen 2) and "Choose…" when empty.
// This file (and the calendar) is pulled into the family page's own bundle only: the dashboard is
// not loaded.
import DatePicker from '../components/DatePicker.jsx';
import { monthDayYear } from './parts.jsx';
import * as T from './text.js';

const YEARS_BACK = 100;

export default function DobField({ value, onChange, today, invalid, describedBy }) {
  const thisYear = Number(String(today).slice(0, 4));
  const years = [];
  for (let y = thisYear; y >= thisYear - YEARS_BACK; y -= 1) years.push(y);
  return (
    <div className="sreg-dob">
      <DatePicker
        id="sreg-dob"
        label={T.DOB}
        value={value}
        onChange={onChange}
        today={today}
        max={today}
        years={years}
        yearsNewestFirst
        hint={T.DOB_CALENDAR_HINT}
        placeholder={T.CHOOSE}
        invalid={invalid}
        describedBy={describedBy}
        inline
        emptyFocus="month"
        formatValue={monthDayYear}
      />
    </div>
  );
}
