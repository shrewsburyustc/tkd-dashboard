// PageBar.jsx — a page's amber bar, drawn just under the top bar (rulebook v1.128; design review R2-05).
// Why it exists: a page's bar used to sit at the top of the page and scroll away with it. On a long
// page scrolled down, a new bar showed up above the screen (a failed Undo 1,295px above it on a
// phone), and nothing near the person's finger said so. Now every page's amber bar shows under the
// top bar, where the one offline bar shows (v1.123): in view however far the page is scrolled, and
// the page stays still as it comes or goes (v1.124, Shell.jsx).
// How: a page draws <PageBar …/> wherever it decides to show its bar; PageBar puts the bar in the
// frame's place for page bars (Shell.jsx gives it through PageBarSlot), after the offline bar,
// Panel size's bar and a left page's Undo bar. React's createPortal draws it there while it still
// belongs to the page: when the page goes, so does its bar. Outside the frame (the parts page) it is
// drawn where it is. A bar inside an open box or side panel isn't a page bar: that one stays an
// ErrorBanner, inside the box (v1.128). So a dialog uses ErrorBanner, never PageBar (the slot
// reaches a dialog through React's context, and its bar would draw behind the dialog's backdrop).
// Props: ErrorBanner's (text, onRetry, onDismiss, retrying, retryLabel), plus
//   takeFocus  true: when it appears, the keyboard focus moves to its Retry (else its ×), but only
//              when focus is nowhere (on the page itself) or on the toast whose Undo it answers
//              (lib/saveLine.js), never away from something else.
import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ErrorBanner from './ErrorBanner.jsx';

// The frame's place for page bars: a DOM element (Shell.jsx), or null outside the frame.
export const PageBarSlot = createContext(null);

export default function PageBar({ takeFocus = false, ...bar }) {
  const slot = useContext(PageBarSlot);
  const boxRef = useRef(null);

  useLayoutEffect(() => {
    if (!takeFocus || !boxRef.current) return;
    const active = document.activeElement;
    const free = !active || active === document.body || Boolean(active.closest?.('.toast-region'));
    if (!free) return;
    const target = boxRef.current.querySelector('.errbar-retry') ?? boxRef.current.querySelector('.errbar-dismiss');
    target?.focus();
  }, [takeFocus, bar.text]);

  if (!slot) {
    return (
      <div ref={boxRef}>
        <ErrorBanner {...bar} />
      </div>
    );
  }
  return createPortal(
    <div ref={boxRef} className="shell-errbar">
      <ErrorBanner {...bar} />
    </div>,
    slot,
  );
}
