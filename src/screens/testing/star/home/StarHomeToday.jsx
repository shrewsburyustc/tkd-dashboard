// StarHomeToday.jsx — Star testing's "Today" cards on Home (Star build phase 7).
// Why it exists: on the day of a Star testing, the staff on the mat should get to its grading in one
// tap from Home. Approved: TKD-StarTesting-Home-Mockups.html (v0.154, v0.155) and the Phase 7 gap
// mockups P7-S1 to P7-S4 (v0.515: 18 proposals, Q1 = A, Q2 = B).
//
//   TODAY                                                      (small gray capitals, proposal 2)
//   [★] Fall 2026 Star Testing · 10:00 AM                      [Open grading]
//       Shrewsbury school · 22 candidates testing today
//   [★] Private star testing · 4:00 PM                         [Grade]
//       Alex Kim · 1st Dan · 1 star → 2 stars
//
// * Only on the day, and all day — midnight to midnight school time, whatever the grading state
//   (proposal 5, Q1 = A). Nothing at all on other days (the component draws nothing).
// * The card is NOT a link; only its button acts (proposal 1). Cards at most 720px wide; on phones
//   (and at 320px) the button drops under the text, lined up with it.
// * Open grading → the event's Grading tab address, #testing/star/event/<id>/grading; Back returns
//   Home (proposal 3).
// * Grade → the event's address (its Candidates tab, NO candidate id), and the candidate id is handed
//   over in page memory only (lib/star/homeHandoff.js); the event page then opens the private grading
//   page at once, as Candidates ⋯ → Grade private testing does (proposal 10, v0.513). ← / Back then go
//   to Candidates, one more Back → Home. A student who changed meanwhile lands on Candidates with the
//   approved v0.513 banner (proposal 11 — StarEventPage does that).
// * The location switcher (proposals 12–14): one school → that school's count and only its private
//   students; Both → the total and all of them. Filtered here, on the same answer.
// * Hide private details (v0.506, proposal 17): nothing changes — the cards never show a date of
//   birth, email, fee or payment.
// * Touch (§2.5): the buttons are 36px tall with a 44px tap area (the dashboard's .btn pattern).
//
// This file is loaded only while the Star testing build switch is on (features.js loadStarHome);
// Home.jsx draws it under Finance's reminder lines.
//
// Props:
//   location              'Worcester' | 'Shrewsbury' | 'Both' (the location switcher)
//   screenLocked          no asks behind the lock screen
//   onNoAccess()          the session lost access: lock the screen (App.jsx)
//   onOpenStarEvent(eventId, tab)   opens a Star event page on 'grading' or 'students' (Candidates)
//   onState({ answered, count })    tells Home whether Star has answered yet and how many cards show,
//                                   so "Nothing on Home yet" waits for Star (Q2 = B) and never shows
//                                   next to a card
import { useEffect, useId, useLayoutEffect } from 'react';
import { IconStar } from '@tabler/icons-react';
import { clearPrivateHandoff, handOffPrivate } from '../../../../lib/star/homeHandoff.js';
import * as T from '../../../../lib/star/homeText.js';
import { useStarHomeToday } from './useStarHomeToday.js';
import './starHome.css';

export default function StarHomeToday({ location, screenLocked, onNoAccess, onOpenStarEvent, onState }) {
  const { answered, items } = useStarHomeToday({ location, screenLocked, onNoAccess });
  const headingId = useId();

  // Home shows again: a Grade hand-off that was never picked up (e.g. Back pressed before the event
  // page opened) is dropped, so it can't open a private page later.
  useEffect(() => {
    clearPrivateHandoff();
  }, []);

  // Before the browser paints, so the empty line and the cards never show together.
  const count = items.length;
  useLayoutEffect(() => {
    onState?.({ answered, count });
  }, [answered, count, onState]);

  if (count === 0) return null;

  return (
    <section className="sth-today" aria-labelledby={headingId}>
      <h2 id={headingId} className="sth-heading">
        {T.TODAY_HEADING}
      </h2>
      <ul className="sth-list">
        {items.map((item) =>
          item.kind === 'event' ? (
            <TodayCard
              key={item.key}
              title={T.eventTitle(item)}
              line={T.eventLine(item)}
              button={T.OPEN_GRADING}
              onClick={() => onOpenStarEvent(item.eventId, 'grading')}
            />
          ) : (
            <TodayCard
              key={item.key}
              title={T.privateTitle(item)}
              line={T.privateLine(item)}
              button={T.GRADE}
              onClick={() => {
                // The candidate id goes in page memory only — never in the address (proposal 10).
                handOffPrivate({ eventId: item.eventId, candidateId: item.candidateId, name: `${item.firstName} ${item.lastName}` });
                onOpenStarEvent(item.eventId, 'students');
              }}
            />
          ),
        )}
      </ul>
    </section>
  );
}

// One card: the star in a blue-tint square, the title, one gray line, one button. The button's
// screen-reader description is the card's own title and line (no new words), so "Open grading" and
// "Grade" say which testing they open.
function TodayCard({ title, line, button, onClick }) {
  const id = useId();
  return (
    <li className="sth-card">
      <span className="sth-icon" aria-hidden="true">
        {/* ti-star = Star testing */}
        <IconStar size={20} />
      </span>
      <div className="sth-text">
        <p className="sth-title" id={`${id}-title`}>
          {title}
        </p>
        <p className="sth-line" id={`${id}-line`}>
          {line}
        </p>
      </div>
      <button type="button" className="btn sth-btn" aria-describedby={`${id}-title ${id}-line`} onClick={onClick}>
        {button}
      </button>
    </li>
  );
}
