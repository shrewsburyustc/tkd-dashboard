// DateField.jsx — one date field for the Black Belt staff screens (date of birth, testing day,
// Application / Submissions due, payment due dates).
// Why it exists: rulebook v1.018 (design review BB12) — every Black Belt date is the dashboard's
// own calendar (components/DatePicker.jsx, the one Star uses), not the browser's "mm/dd/yyyy" box.
// This thin wrapper keeps the five dialogs that use it short: it only fills in what is the same
// for all of them (the gray "Choose…" when empty, "on phones the calendar opens in the page").
// Everything that differs — which days can be picked (min / max), the Year list, the hint, the
// name read aloud — is passed in by the dialog, as Star's dialogs do; the limits themselves come
// from lib/blackBelt/dateLimits.js. Nothing is guessed here.
//
// The value is always 'YYYY-MM-DD' text (or '' / null when empty) — a school date, never a time;
// DatePicker gives back the same text.
//
// Props:
//   id, value, onChange(text)
//   label        the field's name, read aloud with the date ("Date of birth, Saturday, …"); also
//                the name of a field with no visible label (a payment's due date)
//   today        the school's today ('YYYY-MM-DD'; the outline, and where an empty calendar opens)
//   min, max     the first / last day that can be picked (or null)
//   years        the Year list
//   hint         the gray line under the days
//   isPhone      true: the calendar opens in the page under the field (edge to edge)
//   disabled     true: dimmed and can't be opened (e.g. a locked testing day, or while saving)
//   describedBy, invalid
import DatePicker from '../../../components/DatePicker.jsx';
import { CHOOSE_DATE } from '../text.js';

export default function DateField({ id, value, onChange, label, today, min = null, max = null, years = [], hint = '', isPhone = false, disabled = false, describedBy, invalid = false }) {
  return (
    // .bb-date takes no room of its own (display: contents, blackBelt.css): the field and, on phones,
    // its calendar sit straight in the dialog's layout; it only lets blackBelt.css style them
    <div className="bb-date">
      <DatePicker
        id={id}
        label={label}
        value={value ?? ''}
        onChange={onChange}
        today={today}
        min={min}
        max={max}
        years={years}
        hint={hint}
        placeholder={CHOOSE_DATE}
        disabled={disabled}
        describedBy={describedBy}
        invalid={invalid}
        inline={isPhone}
      />
    </div>
  );
}
