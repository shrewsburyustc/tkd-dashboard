// Home.jsx — the first page after signing in.
// Why it exists: Home will become "today at a glance". For now it's empty on purpose
// (guidelines 9): a welcome header (logo, greeting, date, location) and one gray line.
// Items are added only as real sections are built.
// Finance adds the close-the-day reminder lines (mockup D10, v0.202): on a day a school took
// payments and hasn't closed its drawer, from the reminder time on. The "Nothing on Home yet"
// line goes away while a reminder shows. With "Hide private details" on (v0.215, v0.506) the lines have no link.
import { useEffect, useState } from 'react';
import Logo from '../components/Logo.jsx';
import { describeLocation, formatLongDate, getGreeting } from '../lib/dates.js';
import { ReminderLines, useHomeReminders } from './finance/HomeReminders.jsx';

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

// Props: location; screenLocked (no reminder requests behind the lock screen); paymentsHidden;
//        onOpenFinance(schoolName) and onOpenFinanceHistory(firstDay) for the reminder links.
export default function Home({ location, screenLocked = false, paymentsHidden = false, onOpenFinance, onOpenFinanceHistory }) {
  const now = useNow();
  const reminders = useHomeReminders({ location, screenLocked });

  return (
    <div className="home">
      <header className="welcome">
        <Logo size={40} />
        <div>
          <h1 className="welcome-title">{getGreeting(now)}</h1>
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
      />
      {reminders.length === 0 && <p className="home-empty">Nothing on Home yet. Items appear here as sections are added.</p>}
    </div>
  );
}
