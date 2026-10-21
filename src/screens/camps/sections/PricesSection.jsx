// PricesSection.jsx — section 3 of Add / Edit camp: the price grid (C3, second PC frame).
// Why it exists: a camper's price depends on HOW MANY days they come, whether they are a member,
// and whether the family signed up early (decision 1 in the status file: price grid + extras).
// One row per number of days (1 day … "5 days (all days)"), four prices per row: Member early ·
// Member regular · Non-member early · Non-member regular. Whole dollars, $0–$1,000 each (the same
// money rule as Color Belt, money.js). An empty or wrong box shows its amber message under the
// row once Save was pressed (and the folded summary turns amber: "1 row needs prices").
// Phones: each row becomes a small card with the four labeled boxes in two columns (camps.css).
import Notice from '../../../components/Notice.jsx';
import { PRICE_KEYS, PRICE_LABELS } from './campForm.js';
import * as T from '../text.js';

export default function PricesSection({ values, errors, show, rowCount, readOnly, idBase, onPrice }) {
  if (rowCount === 0) return <p className="field-hint">{T.PICK_DAYS_FIRST}</p>;
  const rows = Array.from({ length: rowCount }, (_, i) => i + 1);
  return (
    <>
      <p className="field-hint cp-prices-hint">{T.pricesHint(values.earlyUntil)}</p>
      <div className="cp-grid" role="table" aria-label={T.SECTION_PRICES}>
        <div className="cp-grid-row cp-grid-head" role="row">
          <span role="columnheader" aria-label={T.DAYS} />
          {PRICE_LABELS.map((label) => (
            <span key={label} role="columnheader">
              {label}
            </span>
          ))}
        </div>
        {rows.map((count) => {
          const rowLabel = T.gridRowLabel(count, rowCount);
          const rowErrors = show ? PRICE_KEYS.map((key) => errors.prices?.[`${count}.${key}`]).filter(Boolean) : [];
          return (
            <div key={count} className="cp-grid-group">
              <div className="cp-grid-row" role="row">
                <span className="cp-grid-label" role="rowheader">
                  {rowLabel}
                </span>
                {PRICE_KEYS.map((key, index) => {
                  const bad = show && errors.prices?.[`${count}.${key}`];
                  return (
                    <span key={key} className="cp-grid-cell" role="cell">
                      <span className="cp-grid-cell-label" aria-hidden="true">
                        {PRICE_LABELS[index]}
                      </span>
                      <span className={`money ev-money${readOnly ? ' is-readonly' : ''}`}>
                        <span className="money-prefix" aria-hidden="true">
                          $
                        </span>
                        <input
                          id={`${idBase}-p${count}-${index}`}
                          className="money-input"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          readOnly={readOnly}
                          aria-label={T.priceCellLabel(rowLabel, PRICE_LABELS[index])}
                          aria-invalid={bad ? true : undefined}
                          value={values.bank[count]?.[key] ?? ''}
                          onChange={(event) => onPrice(count, key, event.target.value)}
                        />
                      </span>
                    </span>
                  );
                })}
              </div>
              {/* One message per row is enough: the first problem of that row. */}
              {rowErrors.length > 0 && <Notice>{rowErrors[0]}</Notice>}
            </div>
          );
        })}
      </div>
    </>
  );
}
