// reminderAck.js — remembers which unclosed earlier days an admin pressed "OK" on (rulebook v0.811).
// Why it exists: the admin's Home line "21 earlier days at Worcester weren't closed …" came back
// every day for old days nobody will ever close. Its OK button now remembers, on THIS device /
// browser (like the default school), which (school, day) pairs were seen. The line then stays away
// while only seen days are unclosed, and comes back for NEW unclosed days only. Nothing is saved
// in the database — clearing the browser's data simply shows the line again.
//
// What is saved: localStorage key 'tkd.device.financeReminderSeen' → a JSON list of
// 'school|day' texts, e.g. ["worcester|2026-10-19"] (school = location code, day = 'YYYY-MM-DD').
// Days older than the 30-day window Home looks at are forgotten (pruneSeen).
//
// Storage can be blocked (some private windows) or full. Then reading counts as "nothing seen"
// and a press of OK is kept in memory only, until the page reloads — it never crashes.
//
//   getSeen()               → ['worcester|2026-10-19', …]
//   markSeen(pairs)         → saves them (added to the old ones) and tells open views
//   pruneSeen(today)        → drops days before today − 30
//   newDays(unclosed, seen) → the unclosed pairs that weren't seen yet
// The other helpers are pure (no browser) so checks.mjs can test them.
import { addDays } from '../testing/eventRules.js';
import { monthOf } from './financeRules.js';

export const SEEN_KEY = 'tkd.device.financeReminderSeen';
// Sent on `window` after OK, so every open Home view hides the line at once.
export const SEEN_EVENT = 'tkd:finance-reminder-seen';
// The same window finance_home uses for "earlier days": today − 30 … today − 1.
export const WINDOW_DAYS = 30;

const PAIR_PATTERN = /^[a-z_]+\|\d{4}-\d{2}-\d{2}$/;

// ('worcester', '2026-10-19') → 'worcester|2026-10-19'
export function pairKey(school, day) {
  return `${school}|${day}`;
}

// 'worcester|2026-10-19' → { school: 'worcester', day: '2026-10-19' }
export function splitPair(pair) {
  const [school, day] = pair.split('|');
  return { school, day };
}

// The first day still inside the window: today − 30.
export function windowStart(today) {
  return addDays(today, -WINDOW_DAYS);
}

// ----- Pure helpers -----

// The pairs in `unclosed` that are not in `seen` (a list or a Set), in the same order.
export function newDays(unclosed, seen) {
  const known = seen instanceof Set ? seen : new Set(seen ?? []);
  return unclosed.filter((pair) => !known.has(pair));
}

// finance_history's days → the unclosed (school, day) pairs inside the window, oldest first.
// Only tag 'not_closed' counts (days with payments and no closing); today itself never does.
export function unclosedPairsFrom(historyDays, today) {
  const from = windowStart(today);
  const pairs = new Set();
  for (const d of historyDays ?? []) {
    if (d && d.tag === 'not_closed' && d.day >= from && d.day < today) pairs.add(pairKey(d.school, d.day));
  }
  return [...pairs].sort((a, b) => {
    const dayA = splitPair(a).day;
    const dayB = splitPair(b).day;
    if (dayA !== dayB) return dayA < dayB ? -1 : 1; // oldest day first
    return a < b ? -1 : 1; // same day: by school code
  });
}

// The months finance_history must be asked for to cover the window (first days, oldest first).
// Usually two; three when the window reaches back across a short month (e.g. today = Mar 1).
export function monthsToLoad(today) {
  const last = monthOf(addDays(today, -1));
  const months = [];
  for (let m = monthOf(windowStart(today)); m <= last; m = monthOf(addDays(m, 31))) months.push(m);
  return months;
}

// Keeps only well-formed pairs on or after the window's first day (no duplicates).
export function keepRecent(pairs, today) {
  const from = windowStart(today);
  return [...new Set(pairs)].filter((p) => typeof p === 'string' && PAIR_PATTERN.test(p) && splitPair(p).day >= from);
}

// ----- Saved on this device -----

// A store around one storage (the browser's localStorage by default; checks.mjs passes a fake).
// `memory` holds what OK saved when the storage refused it, so the line still goes away.
export function createSeenStore(getStorage = () => window.localStorage) {
  let memory = null;

  function read() {
    try {
      const text = getStorage().getItem(SEEN_KEY);
      if (text === null) return memory ?? [];
      const list = JSON.parse(text);
      return Array.isArray(list) ? list.filter((p) => typeof p === 'string' && PAIR_PATTERN.test(p)) : memory ?? [];
    } catch {
      return memory ?? []; // blocked or damaged: nothing seen (or only this page's OKs)
    }
  }

  // → true when saved to the storage, false when only kept in memory.
  function write(list) {
    try {
      getStorage().setItem(SEEN_KEY, JSON.stringify(list));
      memory = null;
      return true;
    } catch {
      memory = list;
      return false;
    }
  }

  return {
    getSeen: read,
    markSeen(pairs) {
      const saved = write([...new Set([...read(), ...pairs])]);
      tellOpenViews();
      return saved;
    },
    pruneSeen(today) {
      const before = read();
      const after = keepRecent(before, today);
      if (after.length !== before.length) write(after);
      return after;
    },
  };
}

function tellOpenViews() {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SEEN_EVENT));
  } catch {
    // no window (checks.mjs) or an old browser: nothing to tell
  }
}

const deviceStore = createSeenStore();
export const getSeen = () => deviceStore.getSeen();
export const markSeen = (pairs) => deviceStore.markSeen(pairs);
export const pruneSeen = (today) => deviceStore.pruneSeen(today);
