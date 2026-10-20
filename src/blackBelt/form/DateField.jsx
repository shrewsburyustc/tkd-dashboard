// DateField.jsx — the "Date of birth" field of the Black Belt family form (Form 1, 2, 4).
// Why it exists: the approved mockups draw Star's calendar (DatePicker, Star v0.93), but that
// component exists only on the `star-testing` branch until Star's chooser reaches `main`
// (contract 0016-B1 §7 OP-1). Until then this small wrapper uses the browser's own date field
// (<input type="date">), which also opens a calendar on phones and PCs. The rest of the form
// only talks to this wrapper (value = 'YYYY-MM-DD' or ''), so switching it to DatePicker later
// changes this one file.
import { forwardRef } from 'react';

const DateField = forwardRef(function DateField({ id, value, onChange, min, max, invalid, describedBy }, ref) {
  return (
    <input
      ref={ref}
      id={id}
      type="date"
      className={`bbf-input bbf-input--date${invalid ? ' is-invalid' : ''}`}
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      autoComplete="off"
    />
  );
});

export default DateField;
