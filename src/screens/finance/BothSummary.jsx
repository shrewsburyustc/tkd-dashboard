// BothSummary.jsx — the Daily report when the location switcher is on Both (mockup D6, v0.198).
// Why it exists: each school closes its own drawer, so on Both there is no payment list and no
// Close the day. Instead: one box per school (in switcher order: Worcester, Shrewsbury) with its
// total, number of payments, cash · check · card, Closed / Not closed yet, and "Open <school>",
// which switches the whole dashboard to that school's full report. Under the boxes, the two
// schools' combined total. Star testing payments count for the candidate's school.
// Black Belt (migration 0026, mockup B8, v0.815): each box and the together line name refunds and
// returned checks apart — "· after $150.00 refunds and a $900.00 returned check" — because a
// returned check is not a refund. The answer sends each school's `returned` ({ count, cents });
// the refunds are what is left of (cash + check + card) − Total once the returned checks are
// taken out (or the school's `refunds.cents` when the answer sends it).
//
// Props: data (finance_day_both's answer), onOpenSchool(name)
import { IconChevronRight, IconMapPin } from '@tabler/icons-react';
import { LOCATIONS, LOCATION_NAME } from '../../lib/device.js';
import { money } from './format.js';
import * as T from './text.js';

// One school's (or both schools') refunds and returned checks, as positive amounts:
// → { refundCents, returnedCents, returnedCount }
export function bothMoneyOut(box) {
  const returnedCents = -(box.returned?.cents ?? 0);
  const returnedCount = box.returned?.count ?? 0;
  const moneyIn = (box.cash_cents ?? 0) + (box.check_cents ?? 0) + (box.card_cents ?? 0);
  const refundCents = box.refunds && typeof box.refunds.cents === 'number'
    ? -box.refunds.cents
    : Math.max(0, moneyIn - (box.total_cents ?? 0) - returnedCents);
  return { refundCents, returnedCents, returnedCount };
}

export default function BothSummary({ data, onOpenSchool }) {
  // Switcher order (Worcester, Shrewsbury), whatever order the answer used.
  const schools = [...(data.schools ?? [])].sort(
    (a, b) => LOCATIONS.indexOf(LOCATION_NAME[a.code] ?? a.name) - LOCATIONS.indexOf(LOCATION_NAME[b.code] ?? b.name),
  );
  // Together: the top-level figures when sent, else the two schools added up.
  const sum = (key) => schools.reduce((total, s) => total + (s[key] ?? 0), 0);
  const togetherBox = {
    total_cents: data.total_cents ?? sum('total_cents'),
    cash_cents: data.cash_cents ?? sum('cash_cents'),
    check_cents: data.check_cents ?? sum('check_cents'),
    card_cents: data.card_cents ?? sum('card_cents'),
    returned: data.returned ?? {
      count: schools.reduce((n, s) => n + (s.returned?.count ?? 0), 0),
      cents: schools.reduce((n, s) => n + (s.returned?.cents ?? 0), 0),
    },
    refunds: data.refunds ?? (schools.every((s) => typeof s.refunds?.cents === 'number')
      ? { cents: schools.reduce((n, s) => n + s.refunds.cents, 0) }
      : null),
  };
  const out = bothMoneyOut(togetherBox);
  const together = T.bothTogether(data.total_cents ?? 0, data.count ?? 0, T.bothAfter(out.refundCents, out.returnedCents, out.returnedCount));

  return (
    <>
      <div className="fin-both">
        {schools.map((school) => {
          const name = LOCATION_NAME[school.code] ?? school.name;
          const schoolOut = bothMoneyOut(school);
          const after = T.bothAfter(schoolOut.refundCents, schoolOut.returnedCents, schoolOut.returnedCount);
          let tag;
          if (school.closed) tag = <span className="ttag fin-tag-ok">{T.CLOSED_TAG}</span>;
          // No payments and no refunds (a refund-only day still has something to close); only
          // returned checks → nothing to close (B7). NOT IN MOCKUPS (B8 draws no such school).
          else if (!school.count && schoolOut.refundCents === 0) {
            tag = <span className="ttag">{schoolOut.returnedCount > 0 ? T.TAG_NOTHING_TO_CLOSE : T.NO_PAYMENTS}</span>;
          } else tag = <span className="ttag">{T.NOT_CLOSED_YET}</span>;
          return (
            <section key={school.code} className="fin-box fin-both-box" aria-label={name}>
              <h2 className="fin-box-title">
                <IconMapPin size={18} aria-hidden="true" className="fin-box-icon" />
                {name}
                <span className="fin-grow" />
                {tag}
              </h2>
              <p className="fin-both-total">
                {money(school.total_cents ?? 0)}{' '}
                <span className="fin-hint">
                  {T.paymentsCount(school.count ?? 0)}
                  {after ? ` · ${after}` : ''}
                </span>
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
