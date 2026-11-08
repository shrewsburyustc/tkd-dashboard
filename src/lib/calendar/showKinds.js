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
//   - v0.645: other sections' dates have their own lines — Testing, Black Belt, Camps, Deadlines
//     (after Events) and New sign-ups (after Follow-ups); showKeyOfItem() says which line an item
//     from the database reader belongs to. A choice saved before they existed shows them all.
//   - Hiding Closures never un-cancels a class: cancelled classes stay crossed out (v0.615).
import { readStorage, writeStorage } from '../storage.js';

// The kinds, in menu order. `key` is what is saved; never rename one (saved choices would reset).
export const KINDS = [
  { key: 'classes', label: 'Classes' },
  { key: 'closures', label: 'Closures' },
  { key: 'events', label: 'Events' },
  { key: 'testing', label: 'Testing' }, // Color belt + Star: testing days and private tests (v0.645)
  { key: 'blackBelt', label: 'Black Belt' },
  { key: 'camps', label: 'Camps' },
  { key: 'deadlines', label: 'Deadlines' },
  { key: 'free', label: 'Free classes' },
  { key: 'followUps', label: 'Follow-ups' },
  { key: 'signups', label: 'New sign-ups' },
];
const KEYS = new Set(KINDS.map((k) => k.key));

// Which Show line an item from the database reader (api.js loadCalendarItems) belongs to.
const ITEM_SHOW = {
  colorbelt_event: 'testing',
  colorbelt_private: 'testing',
  star_event: 'testing',
  star_private: 'testing',
  bb_day: 'blackBelt',
  camp_day: 'camps',
  deadline: 'deadlines',
  signup: 'signups',
};
export const showKeyOfItem = (item) => ITEM_SHOW[item.kind] ?? null;

export const hiddenKey =(staffId) => `tkd.calendar.hidden.${staffId ?? 'anyone'}`;

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
  const shows = Object.fromEntries(KINDS.map((k) => [k.key, on(k.key)]));
  const keep = (list) => (list ?? []).filter((item) => on(showKeyOfItem(item)));
  const items = keep(info.items);
  const deadlines = keep(info.deadlines);
  const signups = keep(info.signups);
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
    items,
    deadlines,
    signups,
    signupCount: signups.length,
  };
}
