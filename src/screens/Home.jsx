// Home.jsx — the first page after signing in.
// Why it exists: Home will become "today at a glance". For now it's empty on purpose
// (guidelines 9): a welcome header (logo, greeting, date, location) and one gray line.
// Items are added only as real sections are built.
import { useEffect, useState } from 'react';
import Logo from '../components/Logo.jsx';
import { describeLocation, formatLongDate, getGreeting } from '../lib/dates.js';

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

export default function Home({ location }) {
  const now = useNow();

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
      <p className="home-empty">Nothing on Home yet. Items appear here as sections are added.</p>
    </div>
  );
}
