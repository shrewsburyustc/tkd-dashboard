// CountBox.jsx — one class-count box of Star testing grading: "Classes attended" or "Assistant
// classes", on the Grading grid and on a one-candidate card (phones, the private grading page).
// Why it exists: v0.126 puts the two counts on the grading screens as number boxes; the Assistant
// Instructor grade is worked out by the database from the assistant-class count (never picked by
// hand). Proposal 30 (v0.512): a count not entered yet is an EMPTY box. Each count saves by itself
// through the save engine (useStarGradingSaves.setCount, star_set_count), like a grade: amber with
// the save state when it isn't saved (proposal 2).
//
// Typing: what is typed stays in the box while it has focus; it is sent when the box loses focus or
// on Enter. Empty = "not entered" (null). Only whole numbers 0–999 are sent (the database's range);
// anything else goes back to the saved value. Esc puts the saved value back.
//
// Props:
//   value      the number the box shows (this device's choice while unsaved, else the database's), or null
//   state      the save engine's state (null | 'saving' | 'saved' | 'unsaved' | 'retrying')
//   label      the accessible name ("Noah Chen, Assistant classes")
//   onCommit(value|null)   a new value to save
//   variant    'grid' | 'line'
import { useRef, useState } from 'react';

const textOf = (value) => (value === null || value === undefined ? '' : String(value));

export default function CountBox({ value, state = null, label, onCommit, variant = 'grid' }) {
  const [draft, setDraftState] = useState(null); // the text while the box has focus, else null
  // The same text in a ref: Enter / Esc and the blur that follows them run before React redraws.
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
    else if (/^\d{1,3}$/.test(text)) next = Number(text);
    else return; // not a whole number 0–999: the saved value comes back
    if (next !== (value ?? null)) onCommit(next);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={3}
      className={`input stg-count${variant === 'line' ? ' stg-count--line' : ''}${unsaved ? ' is-unsaved' : ''}`}
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
