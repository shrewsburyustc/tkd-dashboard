// connection.js — the one place that knows whether the dashboard can reach the server, for the one
// offline bar (rulebook v1.005, v1.123; design review M12; components/OfflineBar.jsx, Shell.jsx).
// Why it exists: the bar sits on the frame, but the signs of trouble come from all over:
//   - the browser says it's offline (its "offline" / "online" events; navigator.onLine at the start);
//   - a screen that reloads itself every 15 seconds (lib/useLiveLoad.js) has had two failed reloads
//     in a row, once the server had answered it. The Wi-Fi can be up while the internet isn't, and
//     only failed reloads show that. That cause belongs to the screen: after a page change, the
//     new page reports only once its own reloads fail.
// Each live reload reports here (one entry per screen; a screen that closes takes its entry with
// it), and the bar asks one question: is there trouble right now?
//
//   reportRefreshFailing(id, failing)  a live reload says whether its reloads are failing now
//   useConnectionTrouble()             a React hook: true while the browser says offline or any live
//                                      reload is failing (the bar shows); false again by itself
//   hasConnectionTrouble()             the same answer, outside React (for the checks)
// The preview's __tkdPreview.cutConnection() (lib/mockClient.js) fires the same browser events.
import { useSyncExternalStore } from 'react';

const failing = new Set(); // the live reloads (their ids) whose reloads are failing now
const listeners = new Set(); // the hooks waiting to hear about a change
// What the browser said last. It starts from navigator.onLine and then follows the browser's own
// events, so the preview's helpers (which fire those events) move it too.
let browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

function changed() {
  for (const listener of listeners) listener();
}

// Only in a browser: the checks load this file in Node, where there is no window.
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    browserOffline = true;
    changed();
  });
  window.addEventListener('online', () => {
    browserOffline = false;
    changed();
  });
}

export function reportRefreshFailing(id, isFailing) {
  const now = Boolean(isFailing);
  if (now === failing.has(id)) return; // nothing new: no redraw
  if (now) failing.add(id);
  else failing.delete(id);
  changed();
}

export const hasConnectionTrouble = () => browserOffline || failing.size > 0;

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// useSyncExternalStore: React's way to read a value kept outside React. It redraws only when the
// answer changes (a true/false, so a repeated report changes nothing). The third argument is only
// for drawing the page on a server, which this app never does.
export function useConnectionTrouble() {
  return useSyncExternalStore(subscribe, hasConnectionTrouble, () => false);
}
