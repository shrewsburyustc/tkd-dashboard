// CountCards.jsx — the row of count cards above a roster (design review M6, rulebook v1.013 /
// v1.014 / v1.107; §8 Metric cards).
// Why it exists: Color Belt (twice), Star and Black Belt each drew their own cards; Camps had a
// summary line. Every roster gets this one row:
//   - up to four cards in a row, two by two on phones: a small icon and label on top, the number
//     under it, and optionally one small line under the number (Camps' "$1,355" under To collect);
//   - a count card is a button that filters the list below (screen readers hear it as pressed);
//     the tapped card gets the blue edge and one gray line says so — "Showing not paid only ·
//     Show all" (the section's words); tapping it again or Show all shows everyone;
//   - the 'all' card (Students, Campers) is a button that shows everyone;
//   - a money total (Payments recorded) is never a button;
//   - a section can add one gray line under the row (Black Belt's duplicates note);
//   - Hide private details: the section passes only the cards that stay — one card alone gets the
//     one-card look; no cards → no row at all (Black Belt's are all about money).
// Black Belt's phones get these cards too (v1.107, instead of its two pills). Nothing switches to
// it in Dashboard core step 1; each section does, in its own prompt.
//
// Props:
//   cards         [{ key, Icon, label, value, note?, kind: 'all' | 'filter' | 'total' }]
//                   Icon   a Tabler icon component (16px, beside the label)
//                   value  the number as shown (the section formats money: "$410")
//                   note   optional small line under the number
//   selected      the key of the filter card that is on, or null
//   onSelect      (key | null) => void
//   showingText   the section's words for the gray line while a filter is on ("Showing not paid only")
//   showAllLabel  optional; default "Show all"
//   note          optional gray line under the row
import { SHOW_ALL } from './text.js';

export default function CountCards({ cards, selected = null, onSelect, showingText, showAllLabel = SHOW_ALL, note = null }) {
  if (!cards || cards.length === 0) return null;
  const selectedCard = cards.find((card) => card.kind === 'filter' && card.key === selected) ?? null;

  return (
    <>
      <div className={`ev-cards${cards.length === 1 ? ' is-one' : ''}`}>
        {cards.map((card) => {
          const inner = (
            <>
              <span className="ev-card-label">
                <card.Icon size={16} aria-hidden="true" />
                {card.label}
              </span>
              <span className="ev-card-value">{card.value}</span>
              {card.note && <span className="ev-card-note">{card.note}</span>}
            </>
          );
          if (card.kind === 'total') {
            // A total: not a button, no hover (v1.013).
            return (
              <div key={card.key} className="ev-card">
                {inner}
              </div>
            );
          }
          const isFilter = card.kind === 'filter';
          const pressed = isFilter && selectedCard?.key === card.key;
          return (
            <button
              key={card.key}
              type="button"
              className={`ev-card ev-card--button${pressed ? ' is-selected' : ''}`}
              aria-pressed={isFilter ? (pressed ? 'true' : 'false') : undefined}
              onClick={() => onSelect(isFilter && !pressed ? card.key : null)}
            >
              {inner}
            </button>
          );
        })}
      </div>
      {note && <p className="cards-note">{note}</p>}
      {selectedCard && (
        <p className="ev-filter-line">
          {showingText} ·{' '}
          <button type="button" className="link-button" onClick={() => onSelect(null)}>
            {showAllLabel}
          </button>
        </p>
      )}
    </>
  );
}
