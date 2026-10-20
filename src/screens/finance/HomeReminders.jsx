// HomeReminders.jsx — the close-the-day reminder lines on Home (mockup D10, v0.202, v0.207).
// Why it exists: on a day the school took payments and hasn't closed its drawer yet, from the
// reminder time set in Finance → Settings onward, Home shows an amber line:
// "Today's drawer isn't closed yet.  Close the day ›" — the whole line is one link (44px tall on
// touch screens) to the Daily report. No dollar amounts (rule 5: Home is seen near the mat).
// On Both, one line per school ("Shrewsbury's drawer isn't closed yet."). Admins also see how
// many earlier days (last 30) weren't closed, linking to History: with one school chosen, that
// school's days only ("…at Shrewsbury…"); on Both, one line for both schools. The link opens
// History for the same school choice, at the month of the first unclosed day.
// While "Hide payments" is on for this device (v0.215) the lines still show, but without a link.
//
// The database decides who needs a reminder (finance_home). Home asks again every minute (the
// reminder time may pass while Home is open), when the browser tab becomes visible again, when
// the school changes and after unlocking.
//
//   const lines = useHomeReminders({ location, screenLocked });
//   <ReminderLines lines={lines} linked={!paymentsHidden} onOpenReport={…} onOpenHistory={…} />
import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconChevronRight } from '@tabler/icons-react';
import { LOCATIONS, LOCATION_CODE } from '../../lib/device.js';
import { financeHome } from '../../lib/finance/financeApi.js';
import * as T from './text.js';

const EVERY_MINUTE = 60 * 1000;

// → [{ key, text, link, kind: 'report' | 'history', school, firstDay }] (empty when nothing is due)
export function useHomeReminders({ location, screenLocked }) {
  const [answer, setAnswer] = useState(null);

  useEffect(() => {
    if (screenLocked) return undefined;
    let stale = false;
    const ask = () => {
      if (document.visibilityState !== 'visible') return;
      financeHome().then((result) => {
        // A failed call keeps what was shown (a reminder is a nudge, not an error to report).
        if (!stale && result.status === 'ok') setAnswer(result);
      });
    };
    ask();
    const timer = window.setInterval(ask, EVERY_MINUTE);
    document.addEventListener('visibilitychange', ask);
    return () => {
      stale = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', ask);
    };
  }, [screenLocked, location]);

  if (!answer) return [];
  const due = new Set(answer.today ?? []);
  const lines = [];
  if (location === 'Both') {
    for (const school of LOCATIONS) {
      if (due.has(LOCATION_CODE[school])) {
        lines.push({ key: school, text: T.schoolDrawerNotClosed(school), link: T.CLOSE_THE_DAY_LINK, kind: 'report', school });
      }
    }
  } else if (due.has(LOCATION_CODE[location])) {
    lines.push({ key: location, text: T.DRAWER_NOT_CLOSED, link: T.CLOSE_THE_DAY_LINK, kind: 'report', school: location });
  }
  const earlier = answer.earlier;
  if (earlier && location === 'Both' && earlier.count > 0) {
    lines.push({ key: 'earlier', text: T.earlierNotClosed(earlier.count, earlier.first_day), link: T.OPEN_HISTORY, kind: 'history', school: null, firstDay: earlier.first_day });
  } else if (earlier && location !== 'Both') {
    // This school's part only (by_school, keyed by location code).
    const mine = earlier.by_school?.[LOCATION_CODE[location]];
    if (mine && mine.count > 0) {
      lines.push({ key: 'earlier', text: T.earlierNotClosedAt(location, mine.count, mine.first_day), link: T.OPEN_HISTORY, kind: 'history', school: location, firstDay: mine.first_day });
    }
  }
  return lines;
}

export function ReminderLines({ lines, linked, onOpenReport, onOpenHistory }) {
  if (lines.length === 0) return null;
  return (
    <div className="fin-home-lines">
      {lines.map((line) =>
        linked ? (
          <button
            key={line.key}
            type="button"
            className="fin-home-line fin-home-line--link"
            onClick={() => (line.kind === 'history' ? onOpenHistory(line.firstDay) : onOpenReport(line.school))}
          >
            <IconAlertTriangle size={16} aria-hidden="true" />
            <span className="fin-grow">{line.text}</span>
            <span className="fin-home-link">{line.link}</span>
            <IconChevronRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <p key={line.key} className="fin-home-line">
            <IconAlertTriangle size={16} aria-hidden="true" />
            <span className="fin-grow">{line.text}</span>
          </p>
        ),
      )}
    </div>
  );
}
