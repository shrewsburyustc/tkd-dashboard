// CampSection.jsx — section 1 of Add / Edit camp: name, school and days (C3).
// Why it exists: the first thing every camp needs. Drawn inside CampDialog's folded frame.
//   - Camp name (Edit template: Template name — renaming a template happens here, C2)
//   - School: Worcester | Shrewsbury | Both schools; with Both schools, "Held at Worcester |
//     Shrewsbury" appears next to it (v0.234). Neutral gray selection, not blue (C3 note).
//   - Days: the month calendar (DayCalendar.jsx), its one-line summary
//     ("Mon, Apr 19 – Fri, Apr 23, 2027 · 5 days") and the hint. Edit template has no days, only
//     "Number of days" (1–10), which sets the size of the price grid.
// A refusal from the database ("Can't remove Wed, Dec 30: Mia Rossi and 2 more picked it …")
// shows under Days (errors.days).
import ChoiceGroup from '../../testing/events/ChoiceGroup.jsx';
import Notice from '../../../components/Notice.jsx';
import DayCalendar from './DayCalendar.jsx';
import { MAX_DAYS } from './campForm.js';
import * as T from '../text.js';

const SCHOOLS = [
  { key: 'worcester', label: T.schoolName('worcester') },
  { key: 'shrewsbury', label: T.schoolName('shrewsbury') },
  { key: 'both', label: T.BOTH_SCHOOLS },
];
const HELD_AT = SCHOOLS.slice(0, 2);

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
        {values.school === 'both' && (
          <div className="field cp-neutral">
            <span id={`${idBase}-held`} className="field-label">
              {T.HELD_AT}
            </span>
            <div>
              <ChoiceGroup labelId={`${idBase}-held`} value={values.heldAt} readOnly={readOnly} options={HELD_AT} onChange={(heldAt) => onChange({ heldAt })} />
            </div>
          </div>
        )}
      </div>

      {isTemplate ? (
        <div className="field">
          <label htmlFor={`${idBase}-count`}>{T.NUMBER_OF_DAYS}</label>
          <select
            id={`${idBase}-count`}
            className="input cp-count"
            tabIndex={0}
            disabled={readOnly}
            value={values.dayCount}
            aria-invalid={daysError ? 'true' : undefined}
            onChange={(event) => onChange({ dayCount: event.target.value })}
          >
            {Array.from({ length: MAX_DAYS }, (_, i) => String(i + 1)).map((n) => (
              <option key={n} value={n}>
                {T.daysCount(Number(n))}
              </option>
            ))}
          </select>
          {daysError && <Notice>{daysError}</Notice>}
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
