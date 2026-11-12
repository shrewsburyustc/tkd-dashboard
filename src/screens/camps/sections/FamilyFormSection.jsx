// FamilyFormSection.jsx — section 5 of Add / Edit camp: what the family sign-up form shows (C3).
// Why it exists: each camp says the youngest age it accepts ("Minimum age 5"; a blank camp starts at 3, a
// template brings its own). There is no maximum age (Jeffrey 2026-11-11, v0.756: "We assume no adults
// will come"; it used to be "Ages accepted from 5 to 12", v0.703). The family form refuses a child
// younger than that. Then the camp's description (shown at the top of the form and on "You're
// signed up" — what to bring goes here) and the waiver text the parent signs.
// Messages: "Enter an age" under an empty box, "Enter an age from 1 to 99." for anything else.
import Notice from '../../../components/Notice.jsx';
import * as T from '../text.js';

export default function FamilyFormSection({ values, errors, show, readOnly, idBase, onChange }) {
  const err = (key) => (show ? errors[key] : null);
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
        <label htmlFor={`${idBase}-minAge`}>{T.MIN_AGE}</label>
        <div className="cp-ages">
          <span className="cp-age">
            <input
              id={`${idBase}-minAge`}
              className="input cp-age-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              readOnly={readOnly}
              value={values.minAge}
              aria-invalid={err('minAge') || err('ages') ? true : undefined}
              aria-describedby={`${idBase}-ages-hint`}
              onChange={(event) => onChange({ minAge: event.target.value })}
            />
          </span>
        </div>
        {err('minAge') && <Notice>{err('minAge')}</Notice>}
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
