// act.js — small helpers for the parts page's sample screens (parts.html, preview only).
// Why it exists: every state on the parts page must come from a shared part's REAL behaviour — a
// state like "while it works" is reached by pressing the part's own button, the way a person would,
// with a sample action that never finishes. These helpers do the pressing and provide the sample
// actions. Nothing here talks to a database (plan §4): the actions are timers and promises.

import { useEffect } from 'react';

// Run `action` once, `ms` after the screen is drawn. (In React's StrictMode, which runs every
// effect twice while developing, the first timer is cleared, so it still runs once.)
export function useLater(action, ms = 150) {
  useEffect(() => {
    const timer = window.setTimeout(action, ms);
    return () => window.clearTimeout(timer);
    // Once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Press a button as a finger or a mouse would: focus moves to it WITHOUT the keyboard focus ring
// (the browser draws the ring for the keyboard only), then it is pressed.
export function pressLikeMouse(element) {
  if (!element) return;
  element.focus({ focusVisible: false });
  element.click();
}

// Press a button as the keyboard would (Tab to it, then Enter): focus with the ring, then pressed.
export function pressLikeKeyboard(element) {
  if (!element) return;
  element.focus();
  element.click();
}

// A key press on an element (e.g. ArrowDown on the time list's field). It bubbles up to React.
export function pressKey(element, key) {
  element?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

// The first element matching `selector` whose words (or screen-reader name) are exactly `words`.
export function findByWords(selector, words) {
  return [...document.querySelectorAll(selector)].find((element) => element.getAttribute('aria-label') === words || element.textContent.trim() === words) ?? null;
}

// Sample actions: a save that never finishes ("while it works"), one that fails after a moment.
export const never = () => new Promise(() => {});
export const failAfter = (ms = 300) => new Promise((_resolve, reject) => window.setTimeout(() => reject(new Error('Sample failure')), ms));
export const resolveAfter = (value, ms = 300) => new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
