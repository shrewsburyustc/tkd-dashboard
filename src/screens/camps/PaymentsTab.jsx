// PaymentsTab.jsx — the camp page's Payments tab (v0.704 option A): who owes what.
// Why it exists: option A splits the camp page into three tabs, one job each. This one is the
// quiet bookkeeping view (the page opens here before camp week):
//   - one line: "13 paid · 5 to collect · $1,040" (paid = active campers tagged Paid; to collect =
//     tagged Not paid, Owes or Possible duplicate; the amount counts only what is still owed — an
//     overpaid camper never lowers it, campRules.toCollectCents)
//   - the amber possible-duplicate box with Review (C4b)
//   - "To collect · N" first (who owes is on top), then "Paid · N" — rows in CamperRows.jsx
//   - "Removed · N  Not in the counts" at the bottom (RemovedGroup.jsx)
// Every name opens Camper detail. The page (CampPage.jsx) owns every action.
import { payTag, toCollectCents } from '../../lib/camps/campRules.js';
import CamperRows from './CamperRows.jsx';
import DuplicateBox from './DuplicateBox.jsx';
import RemovedGroup from './RemovedGroup.jsx';
import * as T from './text.js';

export default function PaymentsTab({ active, removed, pairs, removedOpen, onToggleRemoved, onReview, ctx, panelId, tabId }) {
  const paid = active.filter((r) => payTag(r) === 'paid');
  const toCollect = active.filter((r) => payTag(r) !== 'paid');
  const amount = toCollectCents(active);
  const { layout, nav } = ctx;

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId}>
      {/* Option A's big numbers: "13 paid   5 to collect · $1,040" */}
      <p className="cp-statline">
        <span>
          <span className="cp-big">{paid.length}</span>
          {T.PAID_WORDS}
        </span>
        <span>
          <span className="cp-big">{toCollect.length}</span>
          {T.toCollectWords(amount)}
        </span>
      </p>
      <DuplicateBox pairs={pairs} onReview={onReview} />
      {active.length === 0 && removed.length === 0 ? (
        <p className="tempty ev-empty">{T.NO_CAMPERS}</p>
      ) : (
        <div
          className={`clist ev-roster cp-roster${layout.isPhone ? ' is-phone' : ''}${layout.isTouch ? ' is-touch' : ''}`}
          role="table"
          aria-label={T.TAB_PAYMENTS}
        >
          {!layout.isPhone && (
            <div className="ev-srow ev-shead cp-prow" role="row">
              <span role="columnheader">{T.COL_CAMPER}</span>
              <span role="columnheader" className="cp-total">
                {T.COL_TOTAL}
              </span>
              <span role="columnheader">{T.COL_STATUS}</span>
              <span role="columnheader" aria-label={T.ACTIONS_COL} />
            </div>
          )}
          <div role="rowgroup" {...nav.containerProps}>
            <CamperRows heading={T.TO_COLLECT(toCollect.length)} rows={toCollect} ctx={ctx} />
            <CamperRows heading={T.PAID_GROUP(paid.length)} rows={paid} ctx={ctx} />
            <RemovedGroup rows={removed} open={removedOpen} onToggle={onToggleRemoved} ctx={ctx} />
          </div>
        </div>
      )}
    </div>
  );
}
