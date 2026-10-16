// useMediaQuery.js — a React hook that answers "does this CSS media query match right now?"
// Why it exists: some screens must decide in JavaScript what to draw — the PIN screens choose
// between the on-screen keypad and the hidden PIN box, and the account dialogs choose between a
// dialog box and a full-screen phone page. Most other layout changes are done in CSS instead.
import { useEffect, useState } from 'react';

// Touch screen OR narrower than a PC → the PIN screens show the on-screen keypad.
export const KEYPAD_QUERY = '(pointer: coarse), (max-width: 1023.98px)';

// Phone width — the same breakpoint as the phone rules in app.css.
export const PHONE_QUERY = '(max-width: 639.98px)';

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
