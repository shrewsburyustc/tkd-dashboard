// useStarHomeToday.js — when Home asks the database about today's Star testing, and what it keeps.
// Why it exists: Star build phase 7 (rulebook v0.515, proposals 7, 15, 16; Q2 = B). Copied from
// Finance's Home reminders (screens/finance/HomeReminders.jsx, useHomeReminders) so both parts of
// Home ask at exactly the same moments:
//   * when Home opens,
//   * every minute (so the card appears and goes away by itself around midnight),
//   * when the browser tab becomes visible again,
//   * when the school is switched (the location switcher),
//   * after unlocking — and NEVER while the lock screen is up.
// No loading look: until the first answer there is simply nothing (proposal 15).
// A failed ask (a lost connection, stale, invalid, an odd answer) KEEPS what was shown and says
// nothing — the next minute's ask tries again (proposal 16). no_access locks the screen, as everywhere.
//
//   const { answered, items } = useStarHomeToday({ location, screenLocked, onNoAccess });
//     answered: true once Star has answered at least once while Home is open (Q2 = B: Home's
//               "Nothing on Home yet" waits for this)
//     items:    the cards for the location switcher's school, in order (homeCore.homeItems) — the
//               filtering is done here, on the same answer, so a school switch shows the right cards
//               at once (and also asks again, like Finance)
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LOCATION_CODE } from '../../../../lib/device.js';
import { answerAction, homeItems, loadStarHomeToday } from '../../../../lib/star/homeApi.js';

const EVERY_MINUTE = 60 * 1000;

export function useStarHomeToday({ location, screenLocked, onNoAccess }) {
  const [answer, setAnswer] = useState(null); // the last good answer (null until the first one)
  // The newest onNoAccess, without restarting the asking when the parent draws again.
  const noAccessRef = useRef(onNoAccess);
  useLayoutEffect(() => {
    noAccessRef.current = onNoAccess;
  });

  useEffect(() => {
    if (screenLocked) return undefined; // nothing is asked behind the lock screen
    let stale = false; // true once this round of asking is over (school switched, locked, Home left)
    const ask = () => {
      if (document.visibilityState !== 'visible') return;
      loadStarHomeToday().then((result) => {
        if (stale) return;
        const action = answerAction(result);
        if (action === 'show') setAnswer(result);
        else if (action === 'lock') noAccessRef.current?.();
        // 'keep': a failed ask keeps what was shown (proposal 16)
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

  // Both → every card; one school → that school's count and private students (proposals 12, 14).
  const code = location === 'Both' ? null : LOCATION_CODE[location] ?? null;
  return { answered: answer !== null, items: homeItems(answer, code) };
}
