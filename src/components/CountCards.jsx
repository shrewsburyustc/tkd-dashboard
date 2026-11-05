// CountCards.jsx — the row of count cards above a roster (design review M6, rulebook v1.013 /
// v1.014 / v1.107 / v1.115 / v1.117 / v1.119; §8 Metric cards).
// Why it exists: Color Belt (twice), Star and Black Belt each drew their own cards; Camps had a
// summary line. Every roster gets this one row:
//   - up to four cards in a row, two by two on phones: a small icon and label on top, the number
//     under it, and optionally one small line under the number (Camps' "$1,355" under To collect)
//     or two, each under the one before (Star's "Shrewsbury 5" / "Worcester 8" on Both, v1.115);
//   - a count card is a button that filters the list below (screen readers hear it as pressed);
//     the tapped card gets the blue edge and one gray line says so — "Showing not paid only ·
//     Show all" (the section's words); tapping it again or Show all shows everyone. Show all is a
//     link inside that line: on touch it keeps the line's height, right after the dot, with an
//     invisible tap area of exactly 44px (the way Star's own inline links get theirs); the line
//     (.cards-showing) gets room for that area, so it never covers the cards above or a control
//     under the line (v1.117, option a). Show all disappears as it's pressed, so when it had the
//     keyboard focus, the focus goes back to the card that was on (v1.119), not to the page;
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
//                   note   optional small line under the number; two lines as an array
//                          (['Shrewsbury 5', 'Worcester 8']), each line under the one before
//   selected      the key of the filter card that is on, or null
//   onSelect      (key | null) => void
//   showingText   the section's words for the gray line while a filter is on ("Showing not paid only")
//   showAllLabel  optional; default "Show all"
//   note          optional gray line under the row
import { useRef } from 'react';
import { SHOW_ALL } from './text.js';

// A card's note as a list of lines: one line (a string) or two (an array; the rulebook allows two,
// v1.115). A blank note or line (null, '', 0, false) draws nothing.
const noteLines = (note) => (Array.isArray(note) ? note : [note]).filter(Boolean);

export default function CountCards({ cards, selected = null, onSelect, showingText, showAllLabel = SHOW_ALL, note = null }) {
  // The filter cards' buttons, by key, so Show all can put the focus back on the card that was on.
  const cardButtons = useRef(new Map());
  if (!cards || cards.length === 0) return null;
  const selectedCard = cards.find((card) => card.kind === 'filter' && card.key === selected) ?? null;

  // Show all disappears as it's pressed (its gray line goes with the filter). If it had the focus,
  // the focus goes back to the card that was on first, so it isn't lost to the page (v1.119). The
  // browser draws the focus ring only after the keyboard, so after a click or a tap none shows.
  // A click or a tap must not scroll the page either (Chrome, Edge and Android focus a clicked
  // button, so a card partly off the screen would be scrolled into view): event.detail counts the
  // clicks, and a key press makes 0, so only the keyboard brings the card into view.
  function showAll(event) {
    if (document.activeElement === event.currentTarget) {
      cardButtons.current.get(selectedCard.key)?.focus({ preventScroll: event.detail > 0 });
    }
    onSelect(null);
  }

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
              {/* Each line of the note is its own small gray line; the card is a column, so the
                  second sits under the first (as Star draws its school counts, v1.115). */}
              {noteLines(card.note).map((line, index) => (
                <span key={index} className="ev-card-note">
                  {line}
                </span>
              ))}
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
              ref={(node) => {
                if (node) cardButtons.current.set(card.key, node);
                else cardButtons.current.delete(card.key);
              }}
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
        <p className="ev-filter-line cards-showing">
          {showingText} ·{' '}
          <button type="button" className="link-button inline-link" onClick={showAll}>
            {showAllLabel}
          </button>
        </p>
      )}
    </>
  );
}
