// pageAddress.js — the browser-bar address of each dashboard page (rulebook v0.83, v0.177).
// Why it exists: the dashboard is one web page that swaps what it shows. To make the browser's
// own Back / Forward buttons, reload (F5) and bookmarks work per page, each page gets its own
// address after a "#":
//   Home            tkd-dashboard.pages.dev/
//   Testing         tkd-dashboard.pages.dev/#testing
//   Staff accounts  tkd-dashboard.pages.dev/#staff-accounts
//   Settings        tkd-dashboard.pages.dev/#settings          (admins, v0.135)
// The "#…" part (the "hash") is never sent to the server — it only lives in the browser — so the
// hosting needs no change. App.jsx adds a history step each time the page changes
// (history.pushState) and listens for Back / Forward ('popstate').
//
// Testing has pages of its own. Which ones depends on the Star testing build switch (features.js):
//   Switch ON (v0.177)                           Switch OFF (the live site today)
//   #testing                       the chooser   #testing                Color Belt
//   #testing/color-belt            Color Belt    #testing/event/<id>     a Color Belt event
//   #testing/color-belt/event/<id> an event
//   #testing/star                  Star testing
// Old or "other switch" addresses are sent to the right one (the address bar is quietly corrected,
// replacing the step instead of adding one), so bookmarks keep working:
//   switch ON:  #testing/event/<id>  → #testing/color-belt/event/<id>
//   switch OFF: #testing/color-belt  → #testing,   #testing/color-belt/event/<id> → #testing/event/<id>,
//               #testing/star        → #testing (Color Belt — Star doesn't exist yet on this build)
//
// A "route" is a small object saying which page is open:
//   { section: 'home' | 'testing' | 'staffAccounts' | 'settings',
//     testingPage: 'chooser' | 'colorBelt' | 'star' | null   (null when section isn't 'testing'),
//     eventId: the open Color Belt event's id, or null }
import { STAR_TESTING_ON } from './features.js';

const HASH_BY_PAGE = {
  home: '',
  testing: '#testing',
  staffAccounts: '#staff-accounts',
  settings: '#settings',
};
const PAGE_BY_HASH = Object.fromEntries(Object.entries(HASH_BY_PAGE).map(([page, hash]) => [hash, page]));

// An event id is the database's uuid; the pattern only allows letters, digits and dashes, so
// nothing odd from the address bar ever reaches the page.
const ID = '([A-Za-z0-9-]{1,64})';
const OLD_EVENT_HASH = new RegExp(`^#testing/event/${ID}$`); // before v0.177 (and while the switch is off)
const COLOR_BELT_HASH = '#testing/color-belt';
const COLOR_BELT_EVENT_HASH = new RegExp(`^#testing/color-belt/event/${ID}$`);
const STAR_HASH = '#testing/star';

// The page Testing opens on when you click it in the rail or bottom bar.
export const DEFAULT_TESTING_PAGE = STAR_TESTING_ON ? 'chooser' : 'colorBelt';

const route = (section, testingPage = null, eventId = null) => ({ section, testingPage, eventId });

// Reads an address ("#…") → { route, known }.
//   known: false when no page has this address (it then shows Home).
function readHash(hash) {
  // Testing addresses first.
  let match = COLOR_BELT_EVENT_HASH.exec(hash) ?? OLD_EVENT_HASH.exec(hash);
  if (match) return { route: route('testing', 'colorBelt', match[1]), known: true };
  if (hash === COLOR_BELT_HASH) return { route: route('testing', 'colorBelt'), known: true };
  if (hash === STAR_HASH) return { route: route('testing', STAR_TESTING_ON ? 'star' : 'colorBelt'), known: true };
  if (hash === HASH_BY_PAGE.testing) return { route: route('testing', DEFAULT_TESTING_PAGE), known: true };
  // The other pages.
  if (hash in PAGE_BY_HASH) return { route: route(PAGE_BY_HASH[hash]), known: true };
  return { route: route('home'), known: false };
}

// The page the current address points at. An unknown address (e.g. "#xyz") means Home.
export function routeFromAddress() {
  return readHash(window.location.hash).route;
}

// true when the address bar shows something no page knows (it is then tidied to Home).
export function routeIsUnknown() {
  return !readHash(window.location.hash).known;
}

// The "#…" for a route (Home has none at all).
function hashForRoute({ section, testingPage = null, eventId = null }) {
  if (section !== 'testing') return HASH_BY_PAGE[section] ?? '';
  if (!STAR_TESTING_ON) return eventId ? `#testing/event/${eventId}` : HASH_BY_PAGE.testing;
  if (testingPage === 'star') return STAR_HASH;
  if (testingPage === 'colorBelt') return eventId ? `${COLOR_BELT_HASH}/event/${eventId}` : COLOR_BELT_HASH;
  return HASH_BY_PAGE.testing; // the chooser
}

// The address to put in the browser bar for a route.
export function addressForRoute(r) {
  return `${window.location.pathname}${window.location.search}${hashForRoute(r)}`;
}

// The address of a plain page ('home', 'testing' …) — the page's default view.
export function addressFor(page) {
  return addressForRoute(page === 'testing' ? route('testing', DEFAULT_TESTING_PAGE) : route(page));
}

// The address the bar SHOULD show for a known address, when it is an old or "other switch" form
// (e.g. #testing/event/<id> with the switch on). null when the address is already right, or unknown.
export function correctedAddress() {
  const { route: r, known } = readHash(window.location.hash);
  if (!known) return null;
  const right = hashForRoute(r);
  return right === window.location.hash ? null : addressForRoute(r);
}

// true when two routes point at the same page.
export function sameRoute(a, b) {
  return a.section === b.section && (a.testingPage ?? null) === (b.testingPage ?? null) && (a.eventId ?? null) === (b.eventId ?? null);
}
