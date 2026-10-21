// Home.jsx — the first page after signing in.
// Why it exists: Home will become "today at a glance". For now it's empty on purpose
// (guidelines 9): a welcome header (logo, greeting, date, location) and one gray line.
// Items are added only as real sections are built.
// Finance adds the close-the-day reminder lines (mockup D10, v0.202): on a day a school took
// payments and hasn't closed its drawer, from the reminder time on. The "Nothing on Home yet"
// line goes away while a reminder shows. With "Hide private details" on (v0.215, v0.506) the lines have no link.
// After an admin presses OK on the earlier-days line (v0.811) the line disappears, so the keyboard
// focus moves to the next reminder line (or the greeting) and a screen reader hears it was hidden.
// Star testing adds its "Today" cards (Star phase 7, rulebook v0.515) under Finance's lines: on the
// day of a Star testing, a "Today" heading and a card for the testing (Open grading) or for each
// private testing (Grade) — testing/star/home/StarHomeToday.jsx. Only while the Star testing build
// switch is on (features.js loadStarHome): with it off, Home loads no Star code and asks nothing.
// "Nothing on Home yet" (Q2 = B): with Star on, the line waits until Star has answered at least
// once, then shows only when neither Finance nor Star has anything — never next to a card.
import { useEffect, useRef, useState } from 'react';
import Logo from '../components/Logo.jsx';
import { describeLocation, formatLongDate, getGreeting } from '../lib/dates.js';
import { loadStarHome } from '../lib/features.js';
import { ReminderLines, useHomeReminders } from './finance/HomeReminders.jsx';
import { HIDDEN_ANNOUNCEMENT } from './finance/reminderText.js';

// Re-reads the clock every minute so the greeting and date stay right if the page is left
// open (e.g. "Good morning" becomes "Good afternoon" at noon).
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

// Star's Home cards, loaded once when Home first opens (Star switch on only). Kept here after the
// first load, so coming back to Home draws them at once. A failed load (e.g. offline) is tried
// again the next time Home opens; until then Home simply has no Star part (and, Q2 = B, no empty line).
let starHomeModule = null;
function useStarHomeCards() {
  const [loaded, setLoaded] = useState(() => starHomeModule);
  useEffect(() => {
    if (loaded || !loadStarHome) return undefined;
    let current = true;
    loadStarHome()
      .then((module) => {
        starHomeModule = module;
        if (current) setLoaded(module);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [loaded]);
  return loaded?.default ?? null;
}

// Props: location; screenLocked (no reminder requests behind the lock screen); paymentsHidden;
//        onOpenFinance(schoolName) and onOpenFinanceHistory(firstDay) for the reminder links;
//        Star (switch on only): onOpenStarEvent(eventId, tab) for the cards' buttons, onNoAccess()
//        when Star's ask finds the session has no access (locks the screen).
export default function Home({
  location, screenLocked = false, paymentsHidden = false, onOpenFinance, onOpenFinanceHistory, onOpenStarEvent, onNoAccess,
}) {
  const now = useNow();
  const { lines: reminders, pending } = useHomeReminders({ location, screenLocked });
  const StarToday = useStarHomeCards();
  // { answered, count } from Star's cards: has Star answered yet, and how many cards show.
  const [star, setStar] = useState({ answered: false, count: 0 });
  // Q2 = B: with the Star switch on, "Nothing on Home yet" waits for Star's first answer.
  const starWaiting = loadStarHome !== null && !star.answered;
  const homeRef = useRef(null);
  const titleRef = useRef(null);
  const [announcement, setAnnouncement] = useState('');

  // OK hid a reminder line: once it's gone, focus the next line that can take focus, else the
  // greeting (never leave the focus on nothing), and tell screen readers.
  const afterAcknowledged = () => {
    setAnnouncement(HIDDEN_ANNOUNCEMENT);
    window.requestAnimationFrame(() => {
      const next = homeRef.current?.querySelector('.fin-home-lines button:not(.fin-home-ok)');
      (next ?? titleRef.current)?.focus();
    });
  };

  return (
    <div className="home" ref={homeRef}>
      <header className="welcome">
        <Logo size={40} />
        <div>
          <h1 className="welcome-title" ref={titleRef} tabIndex={-1}>{getGreeting(now)}</h1>
          <p className="welcome-sub">
            {formatLongDate(now)} · {describeLocation(location)}
          </p>
        </div>
      </header>
      <ReminderLines
        lines={reminders}
        linked={!paymentsHidden}
        onOpenReport={(school) => onOpenFinance?.(school)}
        onOpenHistory={(firstDay) => onOpenFinanceHistory?.(firstDay)}
        onAcknowledged={afterAcknowledged}
      />
      {StarToday && (
        <StarToday
          location={location}
          screenLocked={screenLocked}
          onNoAccess={onNoAccess}
          onOpenStarEvent={onOpenStarEvent}
          onState={setStar}
        />
      )}
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
      {reminders.length === 0 && !pending && !starWaiting && star.count === 0 && (
        <p className="home-empty">Nothing on Home yet. Items appear here as sections are added.</p>
      )}
    </div>
  );
}
