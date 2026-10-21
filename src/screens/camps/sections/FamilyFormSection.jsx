// FamilyFormSection.jsx — section 5 of Add / Edit camp: what the family sign-up form shows (C3).
// Why it exists: v0.703 — each camp says which ages it accepts ("Ages accepted from 5 to 12"; a
// blank camp starts at 3 to 17, a template brings its own range). The family form refuses a child
// outside the range. Then the camp's description (shown at the top of the form and on "You're
// signed up" — what to bring goes here) and the waiver text the parent signs.
// Messages: "Enter an age" under an empty box, "The first age must be lower than the second." when
// from > to (from = to is fine: 8–8).
import Notice from '../../../components/Notice.jsx';
import * as T from '../text.js';

export default function FamilyFormSection({ values, errors, show, readOnly, idBase, onChange }) {
  const err = (key) => (show ? errors[key] : null);
  const ageBox = (field, label) => (
    <span className="cp-age">
      <label htmlFor={`${idBase}-${field}`}>{label}</label>
      <input
        id={`${idBase}-${field}`}
        className="input cp-age-input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={3}
        readOnly={readOnly}
        value={values[field]}
        aria-invalid={err(field) || err('ages') ? true : undefined}
        aria-describedby={`${idBase}-ages-hint`}
        onChange={(event) => onChange({ [field]: event.target.value })}
      />
    </span>
  );
  const textBox = (field, label, hint, rows) => (
    <div className="field">
      <label htmlFor={`${idBase}-${field}`}>{label}</label>
      <textarea
        id={`${idBase}-${field}`}
        className="input cp-textarea"
        rows={rows}
        tabIndex={0}
        readOnly={readOnly}
        value={values[field]}
        aria-invalid={err(field) ? true : undefined}
        aria-describedby={`${idBase}-${field}-hint`}
        onChange={(event) => onChange({ [field]: event.target.value })}
      />
      <p id={`${idBase}-${field}-hint`} className="field-hint">
        {hint}
      </p>
      {err(field) && <Notice>{err(field)}</Notice>}
    </div>
  );
  return (
    <>
      <div className="field">
        <span className="field-label">{T.AGES_ACCEPTED}</span>
        <div className="cp-ages">
          {ageBox('minAge', T.AGES_FROM)}
          {ageBox('maxAge', T.AGES_TO)}
        </div>
        {err('minAge') && <Notice>{err('minAge')}</Notice>}
        {!err('minAge') && err('maxAge') && <Notice>{err('maxAge')}</Notice>}
        {err('ages') && <Notice>{err('ages')}</Notice>}
        <p id={`${idBase}-ages-hint`} className="field-hint">
          {T.AGES_HINT}
        </p>
      </div>
      {textBox('description', T.DESCRIPTION, T.DESCRIPTION_HINT, 3)}
      {textBox('waiverText', T.WAIVER_TEXT, values.fromTemplateName ? T.waiverFromTemplate(values.fromTemplateName) : T.WAIVER_HINT, 5)}
    </>
  );
}
