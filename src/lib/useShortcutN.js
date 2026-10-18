// useShortcutN.js — the "N" keyboard shortcut: N presses the page's add-new button.
// Why it exists: guidelines 3.6 / v0.45 — on the PC, N triggers the page-header add button
// (on Testing → Classes and ranks that's "Add class"). A shortcut must never fire while
// someone is typing, or while something else is open on top of the page.
//
// The screen passes `enabled` = "is Add class showing and is nothing busy?" (admin, a school
// chosen, list loaded, not locked, no write on its way, no drag, no dialog). This hook adds the
// checks that are the same on every page:
//   - only the plain key: no Ctrl / Cmd / Alt, and not a key held down (auto-repeat)
//   - not while focus is in a text field, a select, an editable area, or a dropdown list
//   - not while a dialog, menu, sheet or list box is open anywhere on the page
//   - only on a PC: wide screen AND a mouse (same media query as the drag grips)
import { useEffect, useRef } from 'react';
import { PC_QUERY } from './useMediaQuery.js';

// Focus inside one of these means "typing" (or choosing from a list): N is a letter there.
const TYPING_TARGET = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="combobox"], [role="listbox"]';

// Anything that sits on top of the page.
const OPEN_LAYER = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]:not([hidden])';

export function useShortcutN({ enabled, onPress }) {
  // Newest values in refs: the key listener is added once and always reads the latest.
  const enabledRef = useRef(enabled);
  const onPressRef = useRef(onPress);
  useEffect(() => {
    enabledRef.current = enabled;
    onPressRef.current = onPress;
  });

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== 'n' && event.key !== 'N') return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (!enabledRef.current) return;
      const target = event.target;
      if (target instanceof Element && target.closest(TYPING_TARGET)) return;
      if (document.querySelector(OPEN_LAYER)) return;
      if (!window.matchMedia(PC_QUERY).matches) return;
      event.preventDefault(); // don't also type an "n" anywhere
      onPressRef.current();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
