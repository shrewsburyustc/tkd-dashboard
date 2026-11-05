// revealRetryBar.js — brings a Camps amber bar with Retry into view and puts keyboard focus on
// its Retry button.
// Why it exists: design review S-2 (rulebook v1.051). When a read behind a menu fails (Edit
// payment, Undo payment, Delete permanently, Delete camp), the amber bar appears at the TOP of the
// page — but the person may be scrolled far down the roster (at 320 wide it sat 366 px above the
// screen) and focus fell to the page itself, so nothing seemed to happen. This moves the bar into
// view and focus onto its Retry, so the next key press or tap can retry.
// It lives in Camps (not in the shared ErrorBanner) so no other section changes.
//
//   useRevealRetryBar(banner, findBar)
//     banner   the page's banner object; only one with `reveal: true` (and a retry) is revealed.
//              banner.opener (optional) = the button that started the action (a ⋯ or a name)
//     findBar  () => the bar's element (.errbar) on THIS page, or null
// Runs once each time such a banner is set (a new banner object = a new failure).
import { useEffect } from 'react';

const MAX_FRAMES = 30; // about half a second of waiting, then it gives up

// May focus move to Retry? Only when the person hasn't moved on: focus is on the page itself
// (document.body — it fell there when the menu or dialog closed), still on the button that
// started the action, or already inside the bar. Anything else was the person's own choice.
function focusIsFree(bar, opener) {
  const active = document.activeElement;
  if (!active || active === document.body || !active.isConnected) return true;
  if (opener && active === opener) return true;
  return bar.contains(active);
}

export function useRevealRetryBar(banner, findBar) {
  useEffect(() => {
    if (!banner?.reveal || !banner.retry) return undefined;
    let frame = 0;
    let frames = 0;
    // Waits one more frame, or stops for good after MAX_FRAMES (no scrolling, no focus).
    const again = () => {
      frames += 1;
      if (frames < MAX_FRAMES) frame = window.requestAnimationFrame(step);
    };
    const step = () => {
      const bar = findBar();
      const retry = bar?.querySelector('.errbar-retry') ?? null;
      // 1. The bar (with its Retry) isn't drawn yet: wait.
      if (!retry) {
        again();
        return;
      }
      // 2. The page behind a dialog that just closed stays "inert" (unusable) for a moment, and an
      //    inert button can't take focus: wait for it, as focusSoon.js does.
      if (retry.closest('[inert]')) {
        again();
        return;
      }
      // 3. Ready — but if the person has already moved on, leave the page where they are (no
      //    scrolling either: it would pull the screen away from what they're doing).
      if (!focusIsFree(bar, banner.opener ?? null)) return;
      // block 'nearest': scroll only as far as needed (not at all if the bar already shows).
      // People who asked their device for less motion get a jump, not a smooth scroll.
      const lessMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      bar.scrollIntoView({ block: 'nearest', behavior: lessMotion ? 'auto' : 'smooth' });
      // preventScroll: the line above already scrolls (focus() alone would jump instantly).
      retry.focus({ preventScroll: true });
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
    // Only when the banner changes; findBar is a new function on every drawing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banner]);
}
