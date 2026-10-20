// ItemChecklist.jsx — "For (tick one or more)": what a payment is for (Record payment, Edit payment).
// Why it exists: approved mockup Candidates 4 — For is a checklist of the candidate's unpaid items,
// each with its due date and what is still owed ("Payment 1 · due Mar 27 · $290"), and the Amount
// fills with the sum of the ticked items (useCandidateActions.setTicks). A candidate with nothing
// left to pay sees every item marked "(paid)" and nothing ticked, so an extra payment can still say
// what it was for (it then shows as overpaid). One check for two items is ONE payment line
// ("Payment 1 + Kukkiwon").
//
// Props:
//   items     Money items [{ item, dueOn, amountCents, remainingCents }] in item order
//   ticks     the ticked item codes
//   onChange  (ticks) => void
//   showAll   true = list every item with its full amount and no "(paid)" mark (Edit payment)
//             instead of only the unpaid ones
//   label     the group's label ("For (tick one or more)" / "For")
//   error     the words under it (or null)
//   readOnly  true while saving
import { useId } from 'react';
import Notice from '../../../components/Notice.jsx';
import { formatCents } from '../../../lib/blackBelt/money.js';
import * as T from '../text.js';

export default function ItemChecklist({ items, ticks, onChange, showAll = false, label = T.FOR_TICK, error = null, readOnly = false }) {
  const id = useId();
  const owed = items.filter((x) => x.remainingCents > 0);
  const nothingOwed = owed.length === 0;
  const list = showAll || nothingOwed ? items : owed;

  function toggle(code) {
    if (readOnly) return;
    const set = new Set(ticks);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    // keep the item order (the order the database stores them in "Payment 1 + Kukkiwon")
    onChange(items.map((x) => x.item).filter((code2) => set.has(code2)));
  }

  return (
    <fieldset className="bb-checklist" aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="field-label">{label}</legend>
      {/* The items in a bordered list, one line each (mockup Candidates 4) */}
      <div className="bb-check-list">
        {list.map((x) => {
          const paid = x.remainingCents <= 0;
          return (
            <label key={x.item} className="cbrow bb-check-item">
              <input type="checkbox" className="cb" checked={ticks.includes(x.item)} disabled={readOnly} onChange={() => toggle(x.item)} />
              <span className="bb-check-text">
                {T.itemLine(x.item, x.dueOn)}
                {paid && !showAll && <span className="bb-check-paid"> {T.PAID_MARK}</span>}
              </span>
              <span className="bb-num bb-check-amount">{formatCents(paid || showAll ? x.amountCents : x.remainingCents)}</span>
            </label>
          );
        })}
      </div>
      {error && <Notice id={`${id}-err`}>{error}</Notice>}
    </fieldset>
  );
}
