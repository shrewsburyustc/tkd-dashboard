// showKinds.js — the Calendar's "Show" menu rules (rulebook v0.613, v0.615). Plain functions, no
// screen code, tested in checks.mjs.
// Why it exists: every kind of thing the Calendar shows can be hidden, and EVERY view (Month,
// Week, the phone's dots, the day panel, the spoken day summary) must hide the same things. So
// the hiding happens once, here, on each day's buildDay() result — the views just draw what's left.
//
// Rules:
//   - One tick box per kind (KINDS). A kind added to the Calendar later MUST be added here, with
//     its line in the menu — no Calendar item without one (v0.613).
//   - What is saved is the list of HIDDEN kinds, in this browser, per signed-in person
//     ('tkd.calendar.hidden.<staff id>', like Prospects' list/board choice). Saving what's hidden
//     means a kind added later starts SHOWN. Blocked storage = everything shown. Nothing goes to
//     the database.
//   - Hiding Closures never un-cancels a class: cancelled classes stay crossed out (v0.615).
import { readStorage, writeStorage } from '../storage.js';

// The kinds, in menu order. `key` is what is saved; never rename one (saved choices would reset).
export const KINDS = [
  { key: 'classes', label: 'Classes' },
  { key: 'closures', label: 'Closures' },
  { key: 'events', label: 'Events' },
  { key: 'free', label: 'Free classes' },
  { key: 'followUps', label: 'Follow-ups' },
];
const KEYS = new Set(KINDS.map((k) => k.key));

export const hiddenKey = (staffId) => `tkd.calendar.hidden.${staffId ?? 'anyone'}`;

// The saved hidden kinds (a Set). Anything unknown or unreadable is ignored → shown.
export function loadHidden(staffId, read = readStorage) {
  try {
    const list = JSON.parse(read(hiddenKey(staffId)) ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((k) => KEYS.has(k)) : []);
  } catch {
    return new Set();
  }
}

export function saveHidden(staffId, hidden, write = writeStorage) {
  write(hiddenKey(staffId), JSON.stringify(KINDS.map((k) => k.key).filter((k) => hidden.has(k))));
}

// Tick or untick one kind → a NEW Set (React needs a new value to redraw).
export function toggleKind(hidden, key) {
  const next = new Set(hidden);
  if (next.has(key)) next.delete(key);
  else if (KEYS.has(key)) next.add(key);
  return next;
}

// "4 of 5" on the button — null while everything is shown (no badge then, v0.613).
export function shownCount(hidden) {
  const shown = KINDS.filter((k) => !hidden.has(k.key)).length;
  return shown === KINDS.length ? null : { shown, total: KINDS.length };
}

// One day's buildDay() result with the hidden kinds taken out. `shows` tells the views what is on,
// for the few things that aren't a list (Week view's closed-hour stripes, the panel's Classes heading).
export function applyShow(info, hidden) {
  const on = (key) => !hidden.has(key);
  const shows = { classes: on('classes'), closures: on('closures'), events: on('events'), free: on('free'), followUps: on('followUps') };
  const schools = info.schools.map((s) => ({
    ...s,
    classes: shows.classes ? s.classes.map((c) => (shows.free ? c : { ...c, bookings: 0 })) : [],
  }));
  const bookings = shows.free ? info.bookings : [];
  const followUps = shows.followUps ? info.followUps ?? [] : [];
  return {
    ...info,
    shows,
    schools,
    scheduleStarts: shows.classes ? info.scheduleStarts : [],
    classCount: shows.classes ? info.classCount : 0,
    cancelledCount: shows.classes ? info.cancelledCount : 0,
    closures: shows.closures ? info.closures : [],
    events: shows.events ? info.events : [],
    bookings,
    bookingCount: bookings.length,
    bookingProblems: shows.free ? info.bookingProblems : 0,
    followUps,
    followUpCount: followUps.length,
  };
}
