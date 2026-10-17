// useMediaQuery.js — a React hook that answers "does this CSS media query match right now?"
// Why it exists: some screens must decide in JavaScript what to draw — the PIN screens choose
// between the on-screen keypad and the hidden PIN box, and the account dialogs choose between a
// dialog box and a full-screen phone page, and the Testing list picks its row layout. Most other
// layout changes are done in CSS instead.
import { useEffect, useState } from 'react';

// Touch screen OR narrower than a PC → the PIN screens show the on-screen keypad.
export const KEYPAD_QUERY = '(pointer: coarse), (max-width: 1023.98px)';

// Phone width — the same breakpoint as the phone rules in app.css.
export const PHONE_QUERY = '(max-width: 639.98px)';

// A very narrow phone (under 360px, e.g. 320px). Testing's rank rows drop their Edit pencil here
// so long names fit (v0.68); tapping the row still opens Edit.
export const NARROW_PHONE_QUERY = '(max-width: 359.98px)';

// A PC: wide screen AND a mouse. Only here: drag grips, the N shortcut (guidelines 3.6).
export const PC_QUERY = '(min-width: 1024px) and (pointer: fine)';

// A touch screen (finger), whatever its width: 44px tap areas, no hover-only cues (2.5).
export const TOUCH_QUERY = '(pointer: coarse)';

// Wide enough for every column of a table (tablets drop the low-priority ones, 1.3).
export const WIDE_QUERY = '(min-width: 1024px)';

export function useMediaQuery(query) {
  // Start with the current answer so the first render is already correct.
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mediaList = window.matchMedia(query);
    const update = () => setMatches(mediaList.matches);
    update(); // in case it changed between the first render and now
    mediaList.addEventListener('change', update); // e.g. tablet rotated or window resized
    return () => mediaList.removeEventListener('change', update);
  }, [query]);

  return matches;
}
