// ExtrasSection.jsx — section 4 of Add / Edit camp: the extras (C3).
// Why it exists: camps sell add-ons (early drop-off, late pick-up, a pizza party). Each extra is
// one line: name · price · Once or Per day · "Not charged to all-days campers" · remove; then
// + Add extra (up to 10). Families choose extras on the sign-up form; a per-day extra asks which
// days. "Not charged to all-days campers" hides that extra in any WEEK a child comes every camp day
// (weekly pricing v0.717: the pizza party is included in that week's full-week price).
// Removing an extra that an active camper chose is refused by the database; its message shows
// here ("Can't remove Pizza party: 3 campers picked it. Change their extras first.").
import { IconPlus, IconX } from '@tabler/icons-react';
import IconButton from '../../../components/IconButton.jsx';
import Notice from '../../../components/Notice.jsx';
import ChoiceGroup from '../../testing/events/ChoiceGroup.jsx';
import { MAX_EXTRAS } from './campForm.js';
import * as T from '../text.js';

const PER_OPTIONS = [
  { key: 'once', label: T.ONCE },
  { key: 'day', label: T.PER_DAY },
];

// mode 'template': the chips are weekdays (Mon … Sun); otherwise the camp's picked days.
export default function ExtrasSection({ values, errors, show, readOnly, idBase, mode, campDays, onExtra, onAdd, onRemove }) {
  const isTemplate = mode === 'template';
  return (
    <>
      {values.extras.length === 0 && <p className="field-hint">{T.NO_EXTRAS}</p>}
      {values.extras.map((extra, index) => {
        const nameError = show ? errors.extras?.[`${extra.key}.name`] : null;
        const priceError = show ? errors.extras?.[`${extra.key}.price`] : null;
        const base = `${idBase}-x${index}`;
        return (
          <div key={extra.key} className="cp-extra">
            <div className="cp-extra-line">
              <div className="field cp-extra-name">
                <label htmlFor={`${base}-name`}>{T.EXTRA_NAME}</label>
                <input
                  id={`${base}-name`}
                  className="input"
                  type="text"
                  autoComplete="off"
                  readOnly={readOnly}
                  value={extra.name}
                  aria-invalid={nameError ? true : undefined}
                  onChange={(event) => onExtra(extra.key, { name: event.target.value })}
                />
              </div>
              <div className="field cp-extra-price">
                <label htmlFor={`${base}-price`}>{T.EXTRA_PRICE}</label>
                <span className={`money ev-money${readOnly ? ' is-readonly' : ''}`}>
                  <span className="money-prefix" aria-hidden="true">
                    $
                  </span>
                  <input
                    id={`${base}-price`}
                    className="money-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    readOnly={readOnly}
                    value={extra.price}
                    aria-invalid={priceError ? true : undefined}
                    onChange={(event) => onExtra(extra.key, { price: event.target.value })}
                  />
                </span>
              </div>
              <div className="field cp-extra-per cp-neutral">
                <span id={`${base}-per`} className="field-label visually-hidden">
                  {T.EXTRA_PER}
                </span>
                <ChoiceGroup labelId={`${base}-per`} value={extra.per} readOnly={readOnly} options={PER_OPTIONS} onChange={(per) => onExtra(extra.key, { per })} />
              </div>
              <IconButton label={T.removeExtraLabel(extra.name)} Icon={IconX} className="cp-extra-remove" onClick={() => !readOnly && onRemove(extra.key)} />
            </div>
            {extra.per === 'day' && (
              // "Only on these days" (owner decision 2026-10-19, pizza on Wed and Fri): none = every day.
              <div className="cp-only">
                <span id={`${base}-only`} className="field-label">
                  {T.ONLY_ON_DAYS}
                </span>
                <div className="cp-chips cp-chips--small cp-only-chips" role="group" aria-labelledby={`${base}-only`} aria-describedby={`${base}-only-hint`}>
                  {isTemplate
                    ? T.ISO_WEEKDAYS.map((label, index) => {
                        const n = index + 1;
                        const on = extra.onlyWeekdays.includes(n);
                        return (
                          <button
                            key={n}
                            type="button"
                            className={`cp-daychip${on ? ' is-picked' : ''}`}
                            aria-pressed={on ? 'true' : 'false'}
                            onClick={() => !readOnly && onExtra(extra.key, { onlyWeekdays: on ? extra.onlyWeekdays.filter((x) => x !== n) : [...extra.onlyWeekdays, n].sort((a, b) => a - b) })}
                          >
                            {label}
                          </button>
                        );
                      })
                    : campDays.map((day) => {
                        const on = extra.onlyOn.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            className={`cp-daychip${on ? ' is-picked' : ''}`}
                            aria-pressed={on ? 'true' : 'false'}
                            aria-label={T.dayLong(day)}
                            onClick={() =>
                              !readOnly &&
                              // Changing a chip by hand stops it following the template's weekdays.
                              onExtra(extra.key, { onlyOn: on ? extra.onlyOn.filter((d) => d !== day) : [...extra.onlyOn, day].sort(), followWeekdays: false })
                            }
                          >
                            {T.dayChip(day)}
                          </button>
                        );
                      })}
                </div>
                <p id={`${base}-only-hint`} className="field-hint">
                  {!isTemplate && campDays.length === 0 ? T.PICK_DAYS_FIRST : T.ONLY_ON_HINT}
                </p>
                {errors.extras?.[`${extra.key}.days`] && <Notice>{errors.extras[`${extra.key}.days`]}</Notice>}
              </div>
            )}
            <label className="cbrow cp-extra-all" htmlFor={`${base}-all`}>
              <input
                id={`${base}-all`}
                type="checkbox"
                className="cb"
                checked={extra.notForAllDays}
                disabled={readOnly}
                onChange={(event) => onExtra(extra.key, { notForAllDays: event.target.checked })}
              />
              {/* Weekly pricing (v0.717): the extra is included per week, so the hint says so. */}
              <span>
                {T.NOT_FOR_ALL_DAYS}
                <br />
                <span className="field-hint">{T.NOT_FOR_ALL_DAYS_HINT}</span>
              </span>
            </label>
            {nameError && <Notice>{nameError}</Notice>}
            {priceError && <Notice>{priceError}</Notice>}
          </div>
        );
      })}
      {values.extras.length < MAX_EXTRAS ? (
        <button type="button" className="btn btn-sm cp-add-extra" onClick={() => !readOnly && onAdd()}>
          {/* ti-plus = add new */}
          <IconPlus size={16} aria-hidden="true" />
          {T.ADD_EXTRA}
        </button>
      ) : (
        <p className="field-hint">{T.MAX_EXTRAS_NOTE}</p>
      )}
      {show && errors.extrasServer && <Notice>{errors.extrasServer}</Notice>}
    </>
  );
}
