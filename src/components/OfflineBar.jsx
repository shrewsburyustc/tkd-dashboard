// OfflineBar.jsx — the one offline bar (rulebook v1.005, v1.123; design review M12).
// Why it exists: when the Wi-Fi drops, every page says so in the same place and the same words.
// Before, only some pages warned, and most only once a save failed.
// Shell.jsx shows it on the frame, under the top bar, in the slot Panel size's "not saved" bar uses
// (v1.118). There it sits outside the page's scrolling part, so it never covers the page or the
// control the keyboard is on (v1.033), and it stays while the person changes page.
// It is the shared amber bar (ErrorBanner.jsx) with no buttons: it goes away by itself when the
// connection is back. When it shows is decided in lib/connection.js: while the browser says it's
// offline, or while any screen's 15-second reload has failed twice in a row.
// What stays next to it (v1.005): Star grading's grade-by-grade line, every save's own amber bar,
// and Panel size's bar (under this one).
import ErrorBanner from './ErrorBanner.jsx';
import { OFFLINE_BAR } from './text.js';

export default function OfflineBar() {
  return <ErrorBanner text={OFFLINE_BAR} />;
}
