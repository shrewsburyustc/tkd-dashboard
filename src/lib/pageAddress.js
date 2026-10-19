// pageAddress.js — the browser-bar address of each dashboard page (rulebook v0.83).
// Why it exists: the dashboard is one web page that swaps what it shows. To make the browser's
// own Back / Forward buttons, reload (F5) and bookmarks work per page, each page gets its own
// address after a "#":
//   Home            tkd-dashboard.pages.dev/
//   Testing         tkd-dashboard.pages.dev/#testing
//   Camps           tkd-dashboard.pages.dev/#camps (contract 0013 §6.1; a camp's page and the
//                   Templates tab add more after it — App.jsx reads those)
//   Staff accounts  tkd-dashboard.pages.dev/#staff-accounts
// The "#…" part (the "hash") is never sent to the server — it only lives in the browser — so the
// hosting needs no change. App.jsx adds a history step each time the page changes
// (history.pushState) and listens for Back / Forward ('popstate').

const HASH_BY_PAGE = {
  home: '',
  testing: '#testing',
  camps: '#camps',
  staffAccounts: '#staff-accounts',
};
const PAGE_BY_HASH = Object.fromEntries(Object.entries(HASH_BY_PAGE).map(([page, hash]) => [hash, page]));

// The page the current address points at. An unknown address (e.g. "#xyz") means Home.
export function pageFromAddress() {
  return PAGE_BY_HASH[window.location.hash] ?? 'home';
}

// true when the address bar shows something we don't know (so it can be tidied to Home).
export function addressIsUnknown() {
  return window.location.hash !== '' && !(window.location.hash in PAGE_BY_HASH);
}

// The address to put in the browser bar for a page. Home has no "#" at all.
export function addressFor(page) {
  const hash = HASH_BY_PAGE[page] ?? '';
  return `${window.location.pathname}${window.location.search}${hash}`;
}
