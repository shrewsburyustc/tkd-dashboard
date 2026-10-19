// ExtrasSection.jsx — section 4 of Add / Edit camp: the extras (C3).
// Why it exists: camps sell add-ons (early drop-off, late pick-up, a pizza party). Each extra is
// one line: name · price · Once or Per day · "Not charged to all-days campers" · remove; then
// + Add extra (up to 10). Families choose extras on the sign-up form; a per-day extra asks which
// days. "Not charged to all-days campers" hides that extra from a child who comes every day (the
// pizza party is included in the all-days price).
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

export default function ExtrasSection({ values, errors, show, readOnly, idBase, onExtra, onAdd, onRemove }) {
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
            <label className="cbrow cp-extra-all" htmlFor={`${base}-all`}>
              <input
                id={`${base}-all`}
                type="checkbox"
                className="cb"
                checked={extra.notForAllDays}
                disabled={readOnly}
                onChange={(event) => onExtra(extra.key, { notForAllDays: event.target.checked })}
              />
              <span>{T.NOT_FOR_ALL_DAYS}</span>
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
