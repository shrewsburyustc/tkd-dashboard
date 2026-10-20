// BothSummary.jsx — the Daily report when the location switcher is on Both (mockup D6, v0.198).
// Why it exists: each school closes its own drawer, so on Both there is no payment list and no
// Close the day. Instead: one box per school (in switcher order: Worcester, Shrewsbury) with its
// total, number of payments, cash · check · card, Closed / Not closed yet, and "Open <school>",
// which switches the whole dashboard to that school's full report. Under the boxes, the two
// schools' combined total. Star testing payments count for the candidate's school.
//
// Props: data (finance_day_both's answer), onOpenSchool(name)
import { IconChevronRight, IconMapPin } from '@tabler/icons-react';
import { LOCATIONS, LOCATION_NAME } from '../../lib/device.js';
import { money } from './format.js';
import * as T from './text.js';

export default function BothSummary({ data, onOpenSchool }) {
  // Switcher order (Worcester, Shrewsbury), whatever order the answer used.
  const schools = [...(data.schools ?? [])].sort(
    (a, b) => LOCATIONS.indexOf(LOCATION_NAME[a.code] ?? a.name) - LOCATIONS.indexOf(LOCATION_NAME[b.code] ?? b.name),
  );
  const together = T.bothTogether(data.total_cents ?? 0, data.count ?? 0);

  return (
    <>
      <div className="fin-both">
        {schools.map((school) => {
          const name = LOCATION_NAME[school.code] ?? school.name;
          let tag;
          if (school.closed) tag = <span className="ttag fin-tag-ok">{T.CLOSED_TAG}</span>;
          // No payments at all (a refund-only day still has something to close)
          else if (!school.count && !school.total_cents) tag = <span className="ttag">{T.NO_PAYMENTS}</span>;
          else tag = <span className="ttag">{T.NOT_CLOSED_YET}</span>;
          return (
            <section key={school.code} className="fin-box fin-both-box" aria-label={name}>
              <h2 className="fin-box-title">
                <IconMapPin size={18} aria-hidden="true" className="fin-box-icon" />
                {name}
                <span className="fin-grow" />
                {tag}
              </h2>
              <p className="fin-both-total">
                {money(school.total_cents ?? 0)} <span className="fin-hint">{T.paymentsCount(school.count ?? 0)}</span>
              </p>
              <p className="fin-both-line">{T.bothBreakdown(school.cash_cents ?? 0, school.check_cents ?? 0, school.card_cents ?? 0)}</p>
              <button type="button" className="btn" onClick={() => onOpenSchool(name)}>
                {T.openSchool(name)}
                <IconChevronRight size={16} aria-hidden="true" />
              </button>
            </section>
          );
        })}
      </div>
      <p className="fin-both-together">
        {together[0]}
        <strong>{together[1]}</strong>
        {together[2]}
      </p>
      <p className="fin-hint">{T.BOTH_HINT}</p>
    </>
  );
}
