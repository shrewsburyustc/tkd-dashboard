// pageAddress.js — the browser-bar address of each dashboard page (rulebook v0.83, v0.177;
// contract 0010 §4.1 for the event page's Grading tab).
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
//   Switch ON (v0.177)                                    Switch OFF (the live site today)
//   #testing                                the chooser   #testing                     Color Belt
//   #testing/color-belt                     Color Belt    #testing/event/<id>          a Color Belt event
//   #testing/color-belt/event/<id>          an event      #testing/event/<id>/grading  its Grading tab
//   #testing/color-belt/event/<id>/grading  its Grading tab
//   #testing/star                           Star testing, Events tab (Star phase 2)
//   #testing/star/rubrics                   Star testing, Rubrics and prices tab
//   #testing/star/event/<id>                a Star testing event
// Old or "other switch" addresses are sent to the right one (the address bar is quietly corrected,
// replacing the step instead of adding one), so bookmarks keep working:
//   switch ON:  #testing/event/<id>          → #testing/color-belt/event/<id>
//               #testing/event/<id>/grading  → #testing/color-belt/event/<id>/grading
//   switch OFF: #testing/color-belt  → #testing,
//               #testing/color-belt/event/<id>(/grading) → #testing/event/<id>(/grading),
//               #testing/star, #testing/star/rubrics, #testing/star/event/<id>
//                                    → #testing (Color Belt — Star isn't in this build)
//
// A "route" is a small object saying which page is open:
//   { section: 'home' | 'testing' | 'staffAccounts' | 'settings',
//     testingPage: 'chooser' | 'colorBelt' | 'star' | null   (null when section isn't 'testing'),
//     eventId: the open event's id (a Color Belt event, or a Star event when testingPage is
//              'star'), or null,
//     eventTab: the tab. On a Color Belt event page 'students' | 'grading'; on Star's home (no
//               event) 'events' | 'rubrics'; otherwise always 'students' — see normalEventTab }
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
// "(/grading)?" = an optional "/grading" at the end: the event page's Grading tab (contract 0010).
const OLD_EVENT_HASH = new RegExp(`^#testing/event/${ID}(/grading)?$`); // before v0.177 (and while the switch is off)
const COLOR_BELT_HASH = '#testing/color-belt';
const COLOR_BELT_EVENT_HASH = new RegExp(`^#testing/color-belt/event/${ID}(/grading)?$`);
const GRADING_SUFFIX = '/grading';
const STAR_HASH = '#testing/star';
const STAR_RUBRICS_HASH = '#testing/star/rubrics';
const STAR_EVENT_HASH = new RegExp(`^#testing/star/event/${ID}$`);
// Any Star address at all (used while the switch is off, to send them all to Color Belt).
const ANY_STAR_HASH = /^#testing\/star(\/.*)?$/;

// The page Testing opens on when you click it in the rail or bottom bar.
export const DEFAULT_TESTING_PAGE = STAR_TESTING_ON ? 'chooser' : 'colorBelt';

// The tab a route really has, from what was asked for:
//   a Star page without an event      'rubrics' when asked, otherwise 'events' (the default tab)
//   a Color Belt event page           'grading' when asked, otherwise 'students'
//   anything else (incl. a Star event page, which has no tabs in phase 2)   'students'
export function normalEventTab(testingPage, eventId, tab) {
  if (testingPage === 'star' && !eventId) return tab === 'rubrics' ? 'rubrics' : 'events';
  if (testingPage === 'colorBelt' && eventId && tab === 'grading') return 'grading';
  return 'students';
}

const route = (section, testingPage = null, eventId = null, eventTab = 'students') => ({
  section,
  testingPage,
  eventId,
  eventTab: normalEventTab(testingPage, eventId, eventTab),
});

// Reads an address ("#…") → { route, known }.
//   known: false when no page has this address (it then shows Home).
function readHash(hash) {
  // Testing addresses first.
  let match = COLOR_BELT_EVENT_HASH.exec(hash) ?? OLD_EVENT_HASH.exec(hash);
  if (match) return { route: route('testing', 'colorBelt', match[1], match[2] ? 'grading' : 'students'), known: true };
  if (hash === COLOR_BELT_HASH) return { route: route('testing', 'colorBelt'), known: true };
  // Star testing (switch off: every Star address shows Color Belt, as in phase 1).
  if (!STAR_TESTING_ON && ANY_STAR_HASH.test(hash)) return { route: route('testing', 'colorBelt'), known: true };
  match = STAR_EVENT_HASH.exec(hash);
  if (match) return { route: route('testing', 'star', match[1]), known: true };
  if (hash === STAR_RUBRICS_HASH) return { route: route('testing', 'star', null, 'rubrics'), known: true };
  if (hash === STAR_HASH) return { route: route('testing', 'star', null, 'events'), known: true };
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
function hashForRoute({ section, testingPage = null, eventId = null, eventTab = 'students' }) {
  if (section !== 'testing') return HASH_BY_PAGE[section] ?? '';
  const tabPart = eventTab === 'grading' ? GRADING_SUFFIX : ''; // Students has no ending of its own
  if (!STAR_TESTING_ON) return eventId ? `#testing/event/${eventId}${tabPart}` : HASH_BY_PAGE.testing;
  if (testingPage === 'star') {
    if (eventId) return `${STAR_HASH}/event/${eventId}`;
    return eventTab === 'rubrics' ? STAR_RUBRICS_HASH : STAR_HASH;
  }
  if (testingPage === 'colorBelt') return eventId ? `${COLOR_BELT_HASH}/event/${eventId}${tabPart}` : COLOR_BELT_HASH;
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

// true when two routes point at the same page — the event page's tab is NOT compared, so
// Students and Grading of one event count as the same page (switching tabs is never "leaving").
export function samePage(a, b) {
  return a.section === b.section && (a.testingPage ?? null) === (b.testingPage ?? null) && (a.eventId ?? null) === (b.eventId ?? null);
}

// true when two routes are exactly the same: same page AND, on an event page (or Star's home,
// which has tabs of its own), the same tab.
export function sameRoute(a, b) {
  if (!samePage(a, b)) return false;
  if (!a.eventId && a.testingPage !== 'star') return true;
  return normalEventTab(a.testingPage, a.eventId, a.eventTab) === normalEventTab(b.testingPage, b.eventId, b.eventTab);
}

// true when a route's page has tabs that live in the address (a Color Belt event page, Star's home).
export function hasAddressTabs(r) {
  return r.section === 'testing' && (Boolean(r.eventId) || r.testingPage === 'star');
}
