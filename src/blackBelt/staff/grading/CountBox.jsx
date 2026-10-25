// CountBox.jsx — one extra-points count box of Black Belt grading: a cell of the Extra points grid,
// or the box on a line of the phone card (contract 0025 §14.2; G 18, G 19).
// Why it exists: copied from Star's CountBox (src/screens/testing/star/grading/CountBox.jsx, v0.512):
// a count not entered yet is an EMPTY box (0 is allowed and is different from empty, G 18); each
// count saves by itself through the save engine (useBbGradingSaves.setCount → bb_set_extra_count),
// amber while it isn't saved. Black Belt's counts go up to 9 999 (Attendance: 380 classes).
//
// Typing: what is typed stays in the box while it has focus; it is sent when the box loses focus
// or on Enter. Empty = "not entered" (null, Clear). Only whole numbers 0–9 999 are sent; anything
// else goes back to the saved value. Esc puts the saved value back.
//
// Props:
//   value      the number the box shows, or null       state   the save engine's state
//   label      the accessible name ("Lucas Ferreira, Competitions")
//   onCommit(value|null)                                variant 'grid' | 'line'
import { useRef, useState } from 'react';
import { COUNT_MAX } from '../../../lib/blackBelt/grading.js';

const textOf = (value) => (value === null || value === undefined ? '' : String(value));

export default function CountBox({ value, state = null, label, onCommit, variant = 'grid' }) {
  const [draft, setDraftState] = useState(null);
  // The same text in a ref: Enter / Esc and the blur that follows run before React redraws.
  const draftRef = useRef(null);
  function setDraft(text) {
    draftRef.current = text;
    setDraftState(text);
  }
  const unsaved = state === 'unsaved' || state === 'retrying';

  function commit() {
    if (draftRef.current === null) return;
    const text = draftRef.current.trim();
    setDraft(null);
    let next;
    if (text === '') next = null;
    else if (/^\d{1,4}$/.test(text) && Number(text) <= COUNT_MAX) next = Number(text);
    else return; // not a whole number 0–9 999: the saved value comes back
    if (next !== (value ?? null)) onCommit(next);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={4}
      className={`input bbg-count${variant === 'line' ? ' bbg-count--line' : ''}${unsaved ? ' is-unsaved' : ''}`}
      aria-label={label}
      aria-invalid={unsaved ? 'true' : undefined}
      value={draft ?? textOf(value)}
      onFocus={() => setDraft(textOf(value))}
      onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
