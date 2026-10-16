// useSessionHeartbeat.js — tells the database "still here" while someone is using the dashboard.
// Why it exists: the database locks a sign-in session after the account's idle time unless it
// hears from it (migration 0002). While the dashboard is open and unlocked, every mouse,
// keyboard or touch activity can send a touch_session() call — but at most once a minute, so a
// busy front desk doesn't flood the server, while the database still hears about activity soon
// after it happens.
//
// The answer can also tell us something changed on the server:
//   'locked'            → the database already locked this session: lock the screen too
//   'password_required' → password too old, account switched off, or 5 wrong PINs: sign out
import { useEffect, useRef } from 'react';
import { touchSession } from './serverLock.js';
import { ACTIVITY_EVENTS } from './useIdleLock.js';

const TOUCH_EVERY_MS = 60 * 1000; // at most one call every 60 seconds

// active: true while the dashboard is open and unlocked (phase 'home').
export function useSessionHeartbeat({ active, onLocked, onPasswordRequired }) {
  // Newest callbacks in refs, so the listeners below never call stale ones (same trick as useIdleLock).
  const onLockedRef = useRef(onLocked);
  const onPasswordRequiredRef = useRef(onPasswordRequired);
  useEffect(() => {
    onLockedRef.current = onLocked;
    onPasswordRequiredRef.current = onPasswordRequired;
  });

  useEffect(() => {
    if (!active) return undefined;

    // The server was just asked (sign-in, page load) or just unlocked us (right PIN), so the
    // 60-second count starts now.
    let lastTouch = Date.now();
    let stopped = false; // set when the dashboard locks or closes; late answers are then ignored

    async function handleActivity() {
      const now = Date.now();
      if (now - lastTouch < TOUCH_EVERY_MS) return; // throttle: ignore most events
      lastTouch = now;
      const result = await touchSession();
      if (stopped) return;
      if (result === 'locked') onLockedRef.current();
      else if (result === 'password_required') onPasswordRequiredRef.current();
      // 'unlocked' = all good; 'error' = offline — try again on later activity.
    }

    // passive: true = we never block scrolling (keeps scrolling smooth)
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, handleActivity, { passive: true }));
    return () => {
      stopped = true;
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, handleActivity));
    };
  }, [active]);
}
