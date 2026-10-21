// DateField.jsx — one date field for the Black Belt staff screens (testing day, deadlines,
// payment due dates).
// Why it exists: contract CONTRACT-0016-B1 §7 OP-1 — the dashboard's calendar (Star's
// DatePicker.jsx) is only on the star-testing branch for now. Until it reaches main (step C2),
// every Black Belt date goes through this ONE small wrapper around the browser's own
// <input type="date">, so switching to DatePicker later changes this file only.
//
// The value is always 'YYYY-MM-DD' text (or '' when empty) — a school date, never a time.
//
// Props: id, value, onChange(text), label (aria-label when there is no visible <label>),
//        describedBy, invalid, readOnly, autoFocus, className
export default function DateField({ id, value, onChange, label, describedBy, invalid = false, readOnly = false, autoFocus = false, className = '' }) {
  return (
    <input
      id={id}
      className={`input bb-date ${className}`.trim()}
      type="date"
      min="2000-01-01"
      max="2100-12-31"
      value={value ?? ''}
      readOnly={readOnly}
      aria-label={label}
      aria-describedby={describedBy}
      aria-invalid={invalid ? 'true' : undefined}
      data-autofocus={autoFocus ? true : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
