// useBarFocusReturn.js — when a page's amber bar goes away while the keyboard focus was on its
// Retry or ×, put the focus somewhere real instead of letting it fall to the page body.
// Why it exists: Black Belt's page bars are now the shared PageBar, drawn under the top bar
// (rulebook v1.128). A bar's Retry that works (or an Undo that works and clears the bar) removes
// the very button that had focus, and the browser then drops focus on the page body — a keyboard
// or screen-reader user would have to start again from the top. Camps does this with
// focusIsInPageBar / focusRowIfLost; this is the small part Black Belt needs: the page says where
// focus goes (its tab button, a row, the back link), this hook says when.
//
//   useBarFocusReturn(Boolean(banner), () => focusCurrentTab());
//
// How it knows focus was in the bar: the bar is removed together with its button, so by then it is
// too late to ask. The hook remembers the last place focus landed (a "focusin" listener on the
// document): inside `.shell-pagebars` (the frame's place for page bars) or not. When the bar goes
// and focus has fallen (on the page body, nowhere, or on a toast), it calls `fallback` once.
// Focus the person put somewhere else on purpose is never taken (a "focusout" that goes outside the bar, or
// nowhere because of a click on blank space, also clears the memory).
// `open` is any "a bar is showing" truth: a page passes `Boolean(banner)`, and where a "couldn't load" bar is
// drawn from the load's status (not from banner state) it adds that to the same call
//   useBarFocusReturn(Boolean(banner) || live.status === 'error', focusCurrentTab);
// so a Retry that works hands focus to the tab instead of the page body (C5).
import { useEffect, useLayoutEffect, useRef } from 'react';

export function useBarFocusReturn(open, fallback) {
  const inBarRef = useRef(false);
  const wasOpenRef = useRef(open);
  const fallbackRef = useRef(fallback);
  useLayoutEffect(() => {
    fallbackRef.current = fallback;
  });
  useEffect(() => {
    const onFocusIn = (event) => {
      inBarRef.current = Boolean(event.target?.closest?.('.shell-pagebars'));
    };
    // C6: focus can also leave the bar with no new focus target (a click on blank space gives no "focusin").
    // "focusout" with nowhere to go (relatedTarget null) or somewhere outside the bar slot clears the flag, so a
    // later self-close of the bar (a poll, a retry that worked on its own) never takes focus the person left.
    // Some browsers also send "focusout" when the focused button is REMOVED with its bar. That case must keep
    // the flag (it is exactly the one this hook serves), so the "nowhere to go" case waits one tick and only
    // counts when the element is still on the page; React's layout effect has run by then.
    const onFocusOut = (event) => {
      const from = event.target;
      if (!from?.closest?.('.shell-pagebars')) return;
      const next = event.relatedTarget;
      if (next) {
        if (!next.closest?.('.shell-pagebars')) inBarRef.current = false;
        return;
      }
      setTimeout(() => {
        if (from.isConnected && !document.activeElement?.closest?.('.shell-pagebars')) inBarRef.current = false;
      }, 0);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);
  // Runs after the bar's DOM is removed, so focus has already fallen if it was inside.
  useLayoutEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!wasOpen || open || !inBarRef.current) return;
    inBarRef.current = false;
    const active = document.activeElement;
    const fallen = !active || active === document.body || !active.isConnected || Boolean(active.closest?.('.toast-region'));
    if (fallen) fallbackRef.current?.();
  }, [open]);
}
