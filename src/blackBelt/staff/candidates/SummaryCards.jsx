// SummaryCards.jsx — the four summary cards above the Black Belt roster, and their phone pills.
// Why it exists: rulebook v0.219 (approved mockup Candidates 1): Paid in full · Paying on schedule ·
// Late · Not paid, in the §8 metric-card style (small icon and label on top, the number under it).
// Clicking a card filters the list to exactly the rows it counts ("Showing late only · Show all");
// clicking it again shows everyone. Possible duplicates aren't counted until they're resolved, and
// a gray line says so. Phones have no cards: two pills, "Late 2" and "Not paid 1", do the filtering.
// The counts come from the data layer (rules.rosterCards); this file only draws them.
//
// Props:
//   counts     { paidInFull, onSchedule, late, notPaid, duplicatesLeftOut }
//   card       the card whose filter is on (null = none)
//   onCard     (key | null) => void
//   isPhone    pills instead of cards
import { ICONS } from './icons.js';
import * as T from '../text.js';

const CARDS = [
  { key: 'paidInFull', label: T.CARD_PAID_IN_FULL, Icon: ICONS.cardPaidInFull },
  { key: 'onSchedule', label: T.CARD_ON_SCHEDULE, Icon: ICONS.cardOnSchedule },
  { key: 'late', label: T.CARD_LATE, Icon: ICONS.cardLate },
  { key: 'notPaid', label: T.CARD_NOT_PAID, Icon: ICONS.cardNotPaid },
];
const PILLS = ['late', 'notPaid'];

export default function SummaryCards({ counts, card, onCard, isPhone }) {
  const toggle = (key) => onCard(card === key ? null : key);
  const leftOut = counts.duplicatesLeftOut;

  const filterLine = card && (
    <p className="ev-filter-line bb-filter-line">
      {T.SHOWING_FILTER[card]} ·{' '}
      <button type="button" className="link-button" onClick={() => onCard(null)}>
        {T.SHOW_ALL}
      </button>
    </p>
  );

  if (isPhone) {
    return (
      <>
        <div className="bb-pills">
          {PILLS.map((key) => {
            const info = CARDS.find((c) => c.key === key);
            const pressed = card === key;
            return (
              <button key={key} type="button" className={`bb-pill${pressed ? ' is-selected' : ''}`} aria-pressed={pressed ? 'true' : 'false'} onClick={() => toggle(key)}>
                <span>{info.label}</span>
                <span className="bb-pill-count">{counts[key]}</span>
              </button>
            );
          })}
        </div>
        {filterLine}
        {!card && leftOut > 0 && <p className="bb-cards-note">{T.duplicatesLeftOutPhone(leftOut)}</p>}
      </>
    );
  }

  return (
    <>
      <div className="ev-cards bb-cards">
        {CARDS.map((c) => {
          const pressed = card === c.key;
          return (
            <button key={c.key} type="button" className={`ev-card ev-card--button${pressed ? ' is-selected' : ''}`} aria-pressed={pressed ? 'true' : 'false'} onClick={() => toggle(c.key)}>
              <span className="ev-card-label">
                <c.Icon size={16} aria-hidden="true" />
                {c.label}
              </span>
              <span className="ev-card-value">{counts[c.key]}</span>
            </button>
          );
        })}
      </div>
      {leftOut > 0 && <p className="bb-cards-note">{T.duplicatesLeftOut(leftOut)}</p>}
      {filterLine}
    </>
  );
}
