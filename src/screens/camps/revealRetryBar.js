// revealRetryBar.js — brings a Camps amber bar into view and puts keyboard focus where the next
// step is: on its Retry button, or — a bar with nothing to retry — back on the button that started
// the action.
// Why it exists: design review S-2 (rulebook v1.051). When a read behind a menu fails (Edit
// payment, Undo payment, Delete permanently, Delete camp), the amber bar appears at the TOP of the
// page — but the person may be scrolled far down the roster (at 320 wide it sat 366 px above the
// screen) and focus fell to the page itself, so nothing seemed to happen. This moves the bar into
// view and focus onto its Retry, so the next key press or tap can retry.
// The same happens when that read shows the action can't go ahead (Record refund's review, design
// L6): "Someone else changed this just now …" or "Undo the refund first." (a refund recorded on
// another device). Those bars have no Retry, so focus goes back to the ⋯ (or the name that opened
// Camper detail, whose More closed with it) — unless scrolling up to the bar would push that button
// off the screen: then focus goes to the bar's Dismiss (×). The bar itself says what happened
// (role="alert"). The refusal bars of a toast's Undo are revealed the same way (CampPage runUndo).
// It lives in Camps (not in the shared ErrorBanner) so no other section changes.
//
//   useRevealRetryBar(banner, findBar)
//     banner   the page's banner object; only one with `reveal: true` is revealed.
//              banner.retry (optional) = it has a Retry, which gets focus;
//              banner.opener (optional) = the button that started the action (a ⋯ or a name) —
//              without a Retry, focus goes back to it (or to the bar's Dismiss if it is gone)
//     findBar  () => the bar's element (.errbar) on THIS page, or null
// Runs once each time such a banner is set (a new banner object = a new message).
import { useEffect } from 'react';

const MAX_FRAMES = 30; // about half a second of waiting, then it gives up

// May focus move? Only when the person hasn't moved on: focus is on the page itself
// (document.body — it fell there when the menu or dialog closed), still on the button that
// started the action, or already inside the bar. Anything else was the person's own choice.
function focusIsFree(bar, opener) {
  const active = document.activeElement;
  if (!active || active === document.body || !active.isConnected) return true;
  if (opener && active === opener) return true;
  return bar.contains(active);
}

// Will `el` still be on the screen once the bar has been scrolled into view? The bar sits at the
// top of the page, so on a long roster scrolling up to it can push the ⋯ (or the name) that started
// the action far below the screen — then focus goes to the bar's Dismiss (×) instead, so a keyboard
// user can see where they are (Record refund's design review). 'nearest' scrolling moves the page
// by exactly as much as the bar is off the screen.
function stillOnScreenAfter(bar, el) {
  const b = bar.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const height = window.innerHeight;
  const shift = b.top < 0 ? b.top : b.bottom > height ? b.bottom - height : 0;
  const top = r.top - shift;
  return top >= 0 && top + r.height <= height;
}

export function useRevealRetryBar(banner, findBar) {
  useEffect(() => {
    if (!banner?.reveal) return undefined;
    const withRetry = Boolean(banner.retry);
    let frame = 0;
    let frames = 0;
    // Waits one more frame, or stops for good after MAX_FRAMES (no scrolling, no focus).
    const again = () => {
      frames += 1;
      if (frames < MAX_FRAMES) frame = window.requestAnimationFrame(step);
    };
    const step = () => {
      const bar = findBar();
      // Where focus goes: Retry; or (no Retry) the button that started it, if it is still on the
      // page, else the bar's own Dismiss (×) — never the page itself.
      const opener = banner.opener?.isConnected ? banner.opener : null;
      const target = withRetry ? bar?.querySelector('.errbar-retry') ?? null : opener ?? bar?.querySelector('.errbar-dismiss') ?? null;
      // 1. The bar (with Retry: and its Retry) isn't drawn yet: wait.
      if (!bar || (withRetry && !target)) {
        again();
        return;
      }
      // 2. The page behind a dialog that just closed stays "inert" (unusable) for a moment, and an
      //    inert button can't take focus: wait for it, as focusSoon.js does.
      if (bar.closest('[inert]') || target?.closest('[inert]')) {
        again();
        return;
      }
      // 3. Ready — but if the person has already moved on, leave the page where they are (no
      //    scrolling either: it would pull the screen away from what they're doing).
      if (!focusIsFree(bar, banner.opener ?? null)) return;
      // No Retry, and the opener would end up off the screen once the bar shows: the bar's own
      // Dismiss (×) takes focus instead (worked out BEFORE scrolling, from where things are now).
      const focusOn = !withRetry && target === opener && opener && !stillOnScreenAfter(bar, opener)
        ? bar.querySelector('.errbar-dismiss') ?? target
        : target;
      // block 'nearest': scroll only as far as needed (not at all if the bar already shows).
      // People who asked their device for less motion get a jump, not a smooth scroll.
      const lessMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      bar.scrollIntoView({ block: 'nearest', behavior: lessMotion ? 'auto' : 'smooth' });
      // preventScroll: the line above already scrolls (focus() alone would jump — and to the
      // opener, which may be far down the roster, away from the bar).
      focusOn?.focus({ preventScroll: true });
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
    // Only when the banner changes; findBar is a new function on every drawing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banner]);
}
