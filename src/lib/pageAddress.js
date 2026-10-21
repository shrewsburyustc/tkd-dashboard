// pageAddress.js — the browser-bar address of each dashboard page (rulebook v0.83, v0.177;
// contract 0010 §4.1 for the event page's Grading tab; contract 0014 §5.1 for a private testing's
// grading page, Color Belt phase 4).
// Why it exists: the dashboard is one web page that swaps what it shows. To make the browser's
// own Back / Forward buttons, reload (F5) and bookmarks work per page, each page gets its own
// address after a "#":
//   Home            tkd-dashboard.pages.dev/
//   Testing         tkd-dashboard.pages.dev/#testing
//   Camps           tkd-dashboard.pages.dev/#camps             the Camps tab (contract 0013 §6.1)
//                   tkd-dashboard.pages.dev/#camps/templates   the Templates tab (admins)
//                   tkd-dashboard.pages.dev/#camps/camp/<id>   a camp's page, on its default tab
//                   tkd-dashboard.pages.dev/#camps/camp/<id>/checkin | /payments | /attendance
//                                                              the same page on that tab
//                   (Camps is the same with the Star switch on or off.)
//   Schedule        tkd-dashboard.pages.dev/#schedule
//   Calendar        tkd-dashboard.pages.dev/#calendar
//   Forms           tkd-dashboard.pages.dev/#forms
//   Prospects       tkd-dashboard.pages.dev/#prospects
//   Staff accounts  tkd-dashboard.pages.dev/#staff-accounts
//   Settings        tkd-dashboard.pages.dev/#settings          (admins, v0.135)
//   Finance         tkd-dashboard.pages.dev/#finance           the Daily report (contract 0011 §4)
//                   tkd-dashboard.pages.dev/#finance/history   History   (admins: App.jsx sends staff
//                   tkd-dashboard.pages.dev/#finance/settings  Settings   to #finance; with "Hide
//                                                              payments" on, every #finance… goes Home)
// The "#…" part (the "hash") is never sent to the server — it only lives in the browser — so the
// hosting needs no change. App.jsx adds a history step each time the page changes
// (history.pushState) and listens for Back / Forward ('popstate').
//
// Testing has pages of its own. Which ones depends on the Star testing build switch (features.js):
//   Switch ON (v0.177)                                    Switch OFF (the live site today)
//   #testing                                the chooser   #testing                     Color Belt
//   #testing/color-belt                     Color Belt    #testing/event/<id>          a Color Belt event
//   #testing/color-belt/event/<id>          an event      #testing/event/<id>/grading  its Grading tab
//   #testing/color-belt/event/<id>/grading  its Grading tab   #testing/private/<id>        a private testing
//   #testing/color-belt/private/<id>        a private testing
//     ("a private testing" = its grading page, Color Belt phase 4 — contract 0014 §5.1)
//   #testing/star                           Star testing, Events tab (Star phase 2)
//   #testing/star/rubrics                   Star testing, Rubrics and prices tab
//   #testing/star/event/<id>                a Star testing event (its Candidates tab)
//   #testing/star/event/<id>/grading        its Grading tab (Star phase 5)
//   #testing/star/event/<id>/results        its Results tab (Star phase 6)
// Old or "other switch" addresses are sent to the right one (the address bar is quietly corrected,
// replacing the step instead of adding one), so bookmarks keep working:
//   switch ON:  #testing/event/<id>          → #testing/color-belt/event/<id>
//               #testing/event/<id>/grading  → #testing/color-belt/event/<id>/grading
//               #testing/private/<id>        → #testing/color-belt/private/<id>
//   switch OFF: #testing/color-belt  → #testing,
//               #testing/color-belt/event/<id>(/grading) → #testing/event/<id>(/grading),
//               #testing/color-belt/private/<id> → #testing/private/<id>,
//               #testing/star, #testing/star/rubrics, #testing/star/event/<id>(/grading|/results)
//                                    → #testing (Color Belt — Star isn't in this build)
//
// A "route" is a small object saying which page is open:
//   { section: 'home' | 'testing' | 'camps' | 'schedule' | 'calendar' | 'forms' | 'prospects' |
//              'finance' | 'staffAccounts' | 'settings',
//     testingPage: 'chooser' | 'colorBelt' | 'star' | null   (null when section isn't 'testing'),
//     eventId: the open event's id (a Color Belt event, or a Star event when testingPage is
//              'star'), or on Camps the open camp's id, or null,
//     eventTab: the tab. On a Color Belt event page 'students' | 'grading'; on a Star event page
//               'students' (= its Candidates tab) | 'grading' (Star phase 5) | 'results' (Star phase 6); on Star's home (no
//               event) 'events' | 'rubrics'; on Finance its view 'report' | 'history' | 'settings'
//               (a different Finance view is a different page); on the Camps list 'camps' |
//               'templates', on a camp's page 'default' | 'checkin' | 'payments' | 'attendance'
//               ('default' = Check in during camp week, else Payments — CampPage decides); otherwise
//               always 'students' — see routeTab,
//     privateId: the open private testing's id (its grading page, Color Belt phase 4 — always on
//                the Color Belt page, never together with an event), or null }
import { STAR_TESTING_ON } from './features.js';

const HASH_BY_PAGE = {
  home: '',
  testing: '#testing',
  camps: '#camps',
  schedule: '#schedule',
  calendar: '#calendar',
  forms: '#forms',
  prospects: '#prospects',
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
// A private testing's grading page (Color Belt phase 4). The short form is the live site's
// (switch off) and, with the switch on, an old form that gets corrected.
const OLD_PRIVATE_HASH = new RegExp(`^#testing/private/${ID}$`);
const COLOR_BELT_PRIVATE_HASH = new RegExp(`^#testing/color-belt/private/${ID}$`);
const GRADING_SUFFIX = '/grading';
const STAR_HASH = '#testing/star';
// Finance (contract 0011 §4): #finance, #finance/history, #finance/settings.
const FINANCE_HASH = /^#finance(?:\/(history|settings))?$/;
export const FINANCE_VIEWS = ['report', 'history', 'settings'];
// Camps (contract 0013 §6.1): #camps, #camps/templates, #camps/camp/<id>(/checkin|/payments|/attendance).
const CAMPS_HASH = new RegExp(`^#camps(?:/templates|/camp/${ID}(?:/(checkin|payments|attendance))?)?$`);
const CAMPS_TEMPLATES_HASH = '#camps/templates';
const CAMP_TABS = ['checkin', 'payments', 'attendance'];
const STAR_RUBRICS_HASH = '#testing/star/rubrics';
// "(/grading|/results)?" = the Star event page's Grading tab (Star phase 5), as Color Belt's, or its
// Results tab (Star phase 6).
const STAR_EVENT_HASH = new RegExp(`^#testing/star/event/${ID}(/grading|/results)?$`);
const STAR_RESULTS_SUFFIX = '/results';
// Any Star address at all (used while the switch is off, to send them all to Color Belt).
const ANY_STAR_HASH = /^#testing\/star(\/.*)?$/;

// The page Testing opens on when you click it in the rail or bottom bar.
export const DEFAULT_TESTING_PAGE = STAR_TESTING_ON ? 'chooser' : 'colorBelt';

// The tab a route really has, from what was asked for:
//   a Star page without an event      'rubrics' when asked, otherwise 'events' (the default tab)
//   a Color Belt event page           'grading' when asked, otherwise 'students'
//   a Star event page                 'grading' or 'results' when asked, otherwise 'students' (its
//                                     Candidates tab; Star phases 5 and 6)
//   anything else                     'students'
export function normalEventTab(testingPage, eventId, tab) {
  if (testingPage === 'star' && !eventId) return tab === 'rubrics' ? 'rubrics' : 'events';
  if (testingPage === 'star' && eventId && (tab === 'grading' || tab === 'results')) return tab;
  if (testingPage === 'colorBelt' && eventId && tab === 'grading') return 'grading';
  return 'students';
}

// The tab of ANY route: Finance's view ('report' unless 'history' or 'settings' was asked for);
// on Camps, a camp's tab ('default' unless 'checkin' | 'payments' | 'attendance' was asked for) or,
// on the list, 'templates' when asked, otherwise 'camps'; otherwise normalEventTab's answer.
export function routeTab(section, testingPage, eventId, tab) {
  if (section === 'finance') return FINANCE_VIEWS.includes(tab) ? tab : 'report';
  if (section === 'camps') {
    if (eventId) return CAMP_TABS.includes(tab) ? tab : 'default';
    return tab === 'templates' ? 'templates' : 'camps';
  }
  return normalEventTab(testingPage, eventId, tab);
}

const route = (section, testingPage = null, eventId = null, eventTab = 'students', privateId = null) => ({
  section,
  testingPage,
  eventId,
  eventTab: routeTab(section, testingPage, eventId, eventTab),
  privateId,
});

// Reads an address ("#…") → { route, known }.
//   known: false when no page has this address (it then shows Home).
function readHash(hash) {
  // Testing addresses first.
  let match = COLOR_BELT_EVENT_HASH.exec(hash) ?? OLD_EVENT_HASH.exec(hash);
  if (match) return { route: route('testing', 'colorBelt', match[1], match[2] ? 'grading' : 'students'), known: true };
  match = COLOR_BELT_PRIVATE_HASH.exec(hash) ?? OLD_PRIVATE_HASH.exec(hash);
  if (match) return { route: route('testing', 'colorBelt', null, 'students', match[1]), known: true };
  if (hash === COLOR_BELT_HASH) return { route: route('testing', 'colorBelt'), known: true };
  // Star testing (switch off: every Star address shows Color Belt, as in phase 1).
  if (!STAR_TESTING_ON && ANY_STAR_HASH.test(hash)) return { route: route('testing', 'colorBelt'), known: true };
  match = STAR_EVENT_HASH.exec(hash);
  if (match) return { route: route('testing', 'star', match[1], match[2] ? match[2].slice(1) : 'students'), known: true };
  if (hash === STAR_RUBRICS_HASH) return { route: route('testing', 'star', null, 'rubrics'), known: true };
  if (hash === STAR_HASH) return { route: route('testing', 'star', null, 'events'), known: true };
  if (hash === HASH_BY_PAGE.testing) return { route: route('testing', DEFAULT_TESTING_PAGE), known: true };
  // Finance and its two other views.
  const finance = FINANCE_HASH.exec(hash);
  if (finance) return { route: route('finance', null, null, finance[1] ?? 'report'), known: true };
  // Camps: its two list tabs, and a camp's page on one of its tabs.
  const camp = CAMPS_HASH.exec(hash);
  if (camp) {
    if (camp[1]) return { route: route('camps', null, camp[1], camp[2] ?? 'default'), known: true };
    return { route: route('camps', null, null, hash === CAMPS_TEMPLATES_HASH ? 'templates' : 'camps'), known: true };
  }
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
function hashForRoute({ section, testingPage = null, eventId = null, eventTab = 'students', privateId = null }) {
  if (section === 'finance') return eventTab === 'history' || eventTab === 'settings' ? `#finance/${eventTab}` : '#finance';
  if (section === 'camps') {
    if (eventId) return `#camps/camp/${eventId}${CAMP_TABS.includes(eventTab) ? `/${eventTab}` : ''}`;
    return eventTab === 'templates' ? CAMPS_TEMPLATES_HASH : HASH_BY_PAGE.camps;
  }
  if (section !== 'testing') return HASH_BY_PAGE[section] ?? '';
  const tabPart = eventTab === 'grading' ? GRADING_SUFFIX : ''; // Students has no ending of its own
  if (!STAR_TESTING_ON) {
    if (eventId) return `#testing/event/${eventId}${tabPart}`;
    return privateId ? `#testing/private/${privateId}` : HASH_BY_PAGE.testing;
  }
  if (testingPage === 'star') {
    if (eventId) return `${STAR_HASH}/event/${eventId}${eventTab === 'results' ? STAR_RESULTS_SUFFIX : tabPart}`;
    return eventTab === 'rubrics' ? STAR_RUBRICS_HASH : STAR_HASH;
  }
  if (testingPage === 'colorBelt') {
    if (eventId) return `${COLOR_BELT_HASH}/event/${eventId}${tabPart}`;
    return privateId ? `${COLOR_BELT_HASH}/private/${privateId}` : COLOR_BELT_HASH;
  }
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
// On Finance, a different view (Daily report / History / Settings) IS a different page, and a
// private testing's grading page is a different page from the Color Belt tabs (and from another one).
export function samePage(a, b) {
  if (a.section !== b.section) return false;
  if (a.section === 'finance') return routeTab('finance', null, null, a.eventTab) === routeTab('finance', null, null, b.eventTab);
  return (
    (a.testingPage ?? null) === (b.testingPage ?? null) &&
    (a.eventId ?? null) === (b.eventId ?? null) &&
    (a.privateId ?? null) === (b.privateId ?? null)
  );
}

// true when two routes are exactly the same: same page AND, on an event page (or Star's home,
// which has tabs of its own, or anywhere in Camps — Camps | Templates, a camp's tabs), the same tab.
// (Camps: a different tab is the same PAGE — switching is never "leaving" — but a different route.)
export function sameRoute(a, b) {
  if (!samePage(a, b)) return false;
  if (a.section === 'camps') return routeTab('camps', null, a.eventId, a.eventTab) === routeTab('camps', null, b.eventId, b.eventTab);
  if (!a.eventId && a.testingPage !== 'star') return true;
  return normalEventTab(a.testingPage, a.eventId, a.eventTab) === normalEventTab(b.testingPage, b.eventId, b.eventTab);
}

// true when a route's page has tabs that live in the address (a Color Belt or Star event page, Star's
// home, and every Camps page: the list's Camps | Templates and a camp's Check in | Payments | Attendance).
export function hasAddressTabs(r) {
  if (r.section === 'camps') return true;
  return r.section === 'testing' && (Boolean(r.eventId) || r.testingPage === 'star');
}
