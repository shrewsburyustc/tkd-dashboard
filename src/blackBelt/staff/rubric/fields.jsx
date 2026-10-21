// fields.jsx — the small typed boxes the rubric editor and the subject dialog share.
// Why it exists: every number in a rubric is typed the same way (CONTRACT-0024 §1.4: up to 2
// decimals, whole numbers for credits and ages), and a half-typed number ("2.") must stay on
// screen exactly as typed (draft.js numberOrText). Writing the box once keeps them all alike:
//   NumberBox  a number box (inputMode "decimal" so phones show the number keys); an optional
//              unit after it ("points"); empty shows a gray placeholder ("youngest", "No limit")
//   TextBox    a one-line text box (names, the unit, notes)
//   FieldNote  the amber reason under a field (Notice), only when there is one
// The `place` prop is written as data-place on the box, so a line in the "Can't save" list can
// jump to its field (R8).
import Notice from '../../../components/Notice.jsx';
import { fieldText, numberOrText } from './draft.js';

export function NumberBox({ value, onChange, label, placeholder, unit, invalid, describedBy, place, whole = false, className = '', readOnly = false, id, autoFocus = false }) {
  const box = (
    <input
      id={id}
      className={`input bbe-num${unit ? ' bbe-num--unit' : ''}`}
      type="text"
      inputMode={whole ? 'numeric' : 'decimal'}
      autoComplete="off"
      aria-label={label}
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={describedBy}
      placeholder={placeholder}
      data-place={place}
      data-autofocus={autoFocus ? true : undefined}
      readOnly={readOnly}
      value={fieldText(value)}
      onChange={(event) => onChange(numberOrText(event.target.value))}
    />
  );
  if (!unit) return <span className={`bbe-numwrap ${className}`.trim()}>{box}</span>;
  return (
    <span className={`bbe-numwrap bbe-numwrap--unit${invalid ? ' is-invalid' : ''} ${className}`.trim()}>
      {box}
      <span className="bbe-unit" aria-hidden="true">
        {unit}
      </span>
    </span>
  );
}

export function TextBox({ value, onChange, label, placeholder, invalid, describedBy, place, className = '', id, maxLength, autoFocus = false }) {
  return (
    <input
      id={id}
      className={`input bbe-text ${className}`.trim()}
      type="text"
      autoComplete="off"
      aria-label={label}
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={describedBy}
      placeholder={placeholder}
      data-place={place}
      data-autofocus={autoFocus ? true : undefined}
      maxLength={maxLength}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function FieldNote({ id, text }) {
  if (!text) return null;
  return (
    <div className="bbe-fieldnote">
      <Notice id={id}>{text}</Notice>
    </div>
  );
}
