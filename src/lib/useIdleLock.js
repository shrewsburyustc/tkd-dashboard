// useIdleLock.js — the idle auto-lock, plus the saved "this device is locked" flag.
// Why it exists: staff walk away from the front desk and the mat. If nobody touches the
// dashboard for the account's idle time it locks itself (guidelines section 5). The idle time
// belongs to the ACCOUNT (decided v0.27): 45 minutes by default, 2 hours for the front-desk
// account. It comes from the database (profile.idle_lock_minutes).
//
// The lock state is saved in localStorage (not just in React memory) so that reloading
// the page or opening a new tab can't skip the lock screen:
//   tkd.locked       = '1' while the screen is locked
//   tkd.lastActivity = time (in ms) of the last mouse/keyboard/touch activity
import { useEffect, useRef } from 'react';
import { readStorage, writeStorage, removeStorage } from './storage.js';

// Used when the profile doesn't say (e.g. an older database): 45 minutes.
export const DEFAULT_IDLE_MINUTES = 45;
const MINUTE_MS = 60 * 1000;

// The account's idle limit in milliseconds, e.g. { idle_lock_minutes: 120 } → 7,200,000.
export function getIdleLimitMs(profile) {
  const minutes = Number(profile?.idle_lock_minutes);
  // Number(undefined) is NaN; anything that isn't a positive number falls back to 45.
  return (minutes > 0 ? minutes : DEFAULT_IDLE_MINUTES) * MINUTE_MS;
}

const ACTIVITY_WRITE_EVERY_MS = 15 * 1000; // save "last activity" at most once per 15 seconds
const CHECK_EVERY_MS = 30 * 1000; // look at the clock every 30 seconds

const LOCKED_KEY = 'tkd.locked';
const LAST_ACTIVITY_KEY = 'tkd.lastActivity';

// A custom browser event we fire whenever the locked flag changes in THIS tab.
// (The built-in "storage" event only reaches OTHER tabs, so we need our own for this one.)
const LOCK_CHANGE_EVENT = 'tkd:lockchange';

// Things that count as "someone is using the dashboard". (Also used by useSessionHeartbeat.js.)
export const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'];

// ----- Plain helpers (no React) -----

export function isLockedFlagSet() {
  return readStorage(LOCKED_KEY) === '1';
}

// Saves the flag, then tells every listener in this tab (the hook below reacts to it).
export function setLockedFlag(locked) {
  if (locked) writeStorage(LOCKED_KEY, '1');
  else removeStorage(LOCKED_KEY);
  window.dispatchEvent(new Event(LOCK_CHANGE_EVENT));
}

export function markActivityNow() {
  writeStorage(LAST_ACTIVITY_KEY, String(Date.now()));
}

// True when more than the idle limit (in ms) has passed since the last activity.
// No saved time at all also counts as "too long" — we can't prove anyone was here.
export function isIdleTooLong(idleLimitMs, now = Date.now()) {
  const lastActivity = Number(readStorage(LAST_ACTIVITY_KEY)); // Number(null) is 0
  if (!lastActivity) return true;
  return now - lastActivity > idleLimitMs;
}

export function shouldBeLocked(idleLimitMs) {
  return isLockedFlagSet() || isIdleTooLong(idleLimitMs);
}

// ----- The React hook -----
// phase:       the App's current state ('loading' | 'signedOut' | 'setPin' | 'home' | 'locked')
// idleLimitMs: this account's idle time in milliseconds (see getIdleLimitMs above)
// onLock:      called when the screen should switch to the lock screen
// onUnlock:    called when another tab unlocked (so this tab follows along)
export function useIdleLock({ phase, idleLimitMs, onLock, onUnlock }) {
  // Keep the newest callbacks in refs so the listeners below never use stale ones
  // and don't need to be re-attached every time the App re-renders.
  const onLockRef = useRef(onLock);
  const onUnlockRef = useRef(onUnlock);
  useEffect(() => {
    onLockRef.current = onLock;
    onUnlockRef.current = onUnlock;
  });

  const isAwake = phase === 'home';
  const isSignedIn = phase === 'home' || phase === 'locked';

  // 1) While the dashboard is open and unlocked: track activity and watch the clock.
  useEffect(() => {
    if (!isAwake) return undefined;

    let lastWrite = 0; // when this tab last saved activity

    // Locks (by setting the flag) if it's time. Returns true if it locked.
    function lockIfIdle() {
      if (!shouldBeLocked(idleLimitMs)) return false;
      setLockedFlag(true); // the listener in effect 2 hears this and calls onLock
      return true;
    }

    function handleActivity() {
      const now = Date.now();
      if (now - lastWrite < ACTIVITY_WRITE_EVERY_MS) return; // throttle: ignore most events
      lastWrite = now;
      // Check BEFORE saving: if the computer just woke from sleep after an hour, the first
      // mouse move must lock the screen, not count as fresh activity.
      if (lockIfIdle()) return;
      markActivityNow();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') lockIfIdle(); // tab brought back to front
    }

    // passive: true tells the browser we never block scrolling, which keeps scrolling smooth
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, handleActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const timer = window.setInterval(lockIfIdle, CHECK_EVERY_MS);

    // Cleanup: React runs this when the phase changes or the app closes.
    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(timer);
    };
  }, [isAwake, idleLimitMs]);

  // 2) While signed in: follow the saved flag, whether it changed in this tab or another.
  useEffect(() => {
    if (!isSignedIn) return undefined;

    function followFlag() {
      if (isLockedFlagSet()) onLockRef.current();
      else onUnlockRef.current();
    }

    function handleStorage(event) {
      // event.key is null when another tab cleared all of localStorage
      if (event.key === LOCKED_KEY || event.key === null) followFlag();
    }

    window.addEventListener(LOCK_CHANGE_EVENT, followFlag);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(LOCK_CHANGE_EVENT, followFlag);
      window.removeEventListener('storage', handleStorage);
    };
  }, [isSignedIn]);
}
