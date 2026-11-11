// LineBar.jsx — the amber bar a Black Belt BOX draws for a problem or a failed Undo, and it takes the
// keyboard focus when the shared save line asks for it (design review batch 4, C2).
// Since rulebook v1.128 the PAGE bars are the shared PageBar (drawn under the top bar). LineBar is what is
// left for a bar INSIDE an open box or side panel, which must stay inside it (PageBar would draw behind the
// box's backdrop): the candidate detail's bar (CandidateDialog.jsx) and the rubric editor's bar when the
// phone's full-screen page is open (RubricCard.jsx).
// Why it exists: the shared save line (lib/saveLine.js) marks the bar of a failed Undo with `takeFocus: true`,
// but only the shared PageBar acts on it (components/PageBar.jsx). Black Belt's bars then sat inside the page or
// inside a box, not in the frame's bar slot, so a keyboard or screen-reader user pressed Undo and was never
// taken to the bar that says it failed. This small wrapper does what PageBar does for the bars that stay
// inside a box (it draws no new look: it is an ErrorBanner inside a wrapper that takes no space).
//
// It also scrolls the bar into view when it appears (block: 'nearest'; nothing moves when it is already in
// view), because a bar at the top of a full-screen phone page can sit above the scrolled area (design review D2).
//
// Props: ErrorBanner's (text, onRetry, onDismiss, retrying, retryLabel), plus
//   takeFocus  true: when the bar appears, focus moves to its Retry button, else its × button, else the bar
//              itself — but only when focus is nowhere (on the page itself) or on the toast whose Undo
//              it answers, never away from something else (PageBar's rule).
//   focusKey   the bar's own object: a NEW bar (even with the same words) takes focus again; a bar that only
//              changes to "retrying" does not.
import { useLayoutEffect, useRef } from 'react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';

export default function LineBar({ takeFocus = false, focusKey = null, ...bar }) {
  const boxRef = useRef(null);
  useLayoutEffect(() => {
    if (!takeFocus || !boxRef.current) return;
    const active = document.activeElement;
    const free = !active || active === document.body || Boolean(active.closest?.('.toast-region'));
    if (!free) return;
    const target =
      boxRef.current.querySelector('.errbar-retry') ?? boxRef.current.querySelector('.errbar-dismiss') ?? boxRef.current.querySelector('.errbar');
    if (!target) return;
    if (!target.matches('button')) target.setAttribute('tabindex', '-1'); // the bar itself can take focus, but isn't a tab stop
    // preventScroll: focus must not jump the page or the box; the bar is scrolled into view just below.
    target.focus({ preventScroll: true });
    target.closest?.('.errbar')?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeFocus, focusKey]);
  // display: contents — the wrapper takes no space, so the bar looks exactly as an ErrorBanner on its own.
  return (
    <div ref={boxRef} style={{ display: 'contents' }}>
      <ErrorBanner {...bar} />
    </div>
  );
}
