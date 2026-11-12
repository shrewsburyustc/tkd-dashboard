// CampSection.jsx — section 1 of Add / Edit camp: name, school and days (C3).
// Why it exists: the first thing every camp needs. Drawn inside CampDialog's folded frame.
//   - Camp name (Edit template: Template name — renaming a template happens here, C2)
//   - School: Worcester | Shrewsbury | Both schools. (The "Held at Worcester | Shrewsbury" choice that
//     appeared next to it with Both schools, v0.710, is gone: v0.755.) Neutral gray selection, not blue (C3 note).
//   - Days: the month calendar (DayCalendar.jsx), its one-line summary
//     ("Mon, Apr 19 – Fri, Apr 23, 2027 · 5 days") and the hint. Edit template has no days, only
//     "Days per week" (1–7; weekly pricing v0.717), which sets the size of the price grid.
// A refusal from the database ("Can't remove Wed, Dec 30: Mia Rossi and 2 more picked it …")
// shows under Days (errors.days).
import ChoiceGroup from '../../../components/ChoiceGroup.jsx';
import Notice from '../../../components/Notice.jsx';
import Select from '../../../components/Select.jsx';
import DayCalendar from './DayCalendar.jsx';
import { MAX_DAYS, MAX_WEEK_DAYS } from './campForm.js';
import * as T from '../text.js';

const SCHOOLS = [
  { key: 'worcester', label: T.schoolName('worcester') },
  { key: 'shrewsbury', label: T.schoolName('shrewsbury') },
  { key: 'both', label: T.BOTH_SCHOOLS },
];
// "Days per week" (Edit template): 1 day … 7 days. Values are strings, as the form keeps them.
const DAY_COUNTS = Array.from({ length: MAX_WEEK_DAYS }, (_, i) => ({ value: String(i + 1), label: T.daysCount(i + 1) }));

export default function CampSection({ mode, values, errors, show, today, keepDays, readOnly, idBase, onChange, onToggleDay }) {
  const isTemplate = mode === 'template';
  const nameError = show ? errors.name : null;
  const daysError = show ? (errors.days ?? errors.dayCount) : null;
  const sortedDays = [...values.days].sort();
  return (
    <>
      <div className="field">
        <label htmlFor={`${idBase}-name`}>{isTemplate ? T.TEMPLATE_NAME : T.CAMP_NAME}</label>
        <input
          id={`${idBase}-name`}
          className="input"
          type="text"
          autoComplete="off"
          data-autofocus
          readOnly={readOnly}
          value={values.name}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${idBase}-name-error` : undefined}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        {nameError && <Notice id={`${idBase}-name-error`}>{nameError}</Notice>}
      </div>

      <div className="cp-school-row">
        <div className="field cp-neutral">
          <span id={`${idBase}-school`} className="field-label">
            {T.SCHOOL}
          </span>
          <div>
            <ChoiceGroup labelId={`${idBase}-school`} value={values.school} readOnly={readOnly} options={SCHOOLS} onChange={(school) => onChange({ school })} />
          </div>
        </div>
        {/* No "Held at" choice any more (v0.755): a camp for both schools names no single school. The
            camp's stored school stays as it was (a new camp takes the device's school) and is never shown. */}
      </div>

      {isTemplate ? (
        <div className="field">
          {/* The shared dropdown (S-10, pass 1). A span, not a <label>: the field is a div (role combobox),
              which a label can't point at; the Select reads its name from this span's id. */}
          <span id={`${idBase}-count-label`} className="field-label">
            {T.DAYS_PER_WEEK}
          </span>
          <div className="cp-count">
            <Select
              id={`${idBase}-count`}
              labelId={`${idBase}-count-label`}
              value={values.dayCount}
              options={DAY_COUNTS}
              placeholder={T.DAYS_PER_WEEK}
              readOnly={readOnly}
              invalid={Boolean(daysError)}
              describedBy={daysError ? `${idBase}-count-error` : undefined}
              onChange={(dayCount) => onChange({ dayCount })}
            />
          </div>
          {daysError && <Notice id={`${idBase}-count-error`}>{daysError}</Notice>}
        </div>
      ) : (
        <div className="field">
          <span id={`${idBase}-days`} className="field-label">
            {T.DAYS}
          </span>
          <DayCalendar
            month={values.month}
            days={values.days}
            today={today}
            keepDays={keepDays}
            maxDays={MAX_DAYS}
            readOnly={readOnly}
            labelId={`${idBase}-days`}
            describedBy={`${idBase}-days-hint`}
            onMonth={(month) => onChange({ month })}
            onToggle={onToggleDay}
          />
          {sortedDays.length > 0 && (
            <p className="cp-days-line" role="status">
              {T.campDatesLine(sortedDays)}
            </p>
          )}
          <p id={`${idBase}-days-hint`} className="field-hint">
            {T.DAYS_HINT}
          </p>
          {daysError && <Notice id={`${idBase}-days-error`}>{daysError}</Notice>}
        </div>
      )}
    </>
  );
}
