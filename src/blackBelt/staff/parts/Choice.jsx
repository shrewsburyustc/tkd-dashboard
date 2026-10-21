// Choice.jsx — a row of joined buttons where exactly one is chosen (a "radio group").
// Why it exists: Black Belt uses it for Upcoming / Past on the Cycles tab and for the
// Registration Open / Closed switch in Add / Edit cycle. It behaves like Color Belt's
// ChoiceGroup.jsx (one Tab stop; ← → ↑ ↓ move AND choose; screen readers hear "radio button,
// 1 of 2, checked") but lives in Black Belt's folder, so the two sections never share a file
// that one of them might change.
//
// Props:
//   labelId    id of the visible (or visually hidden) label
//   options    [{ key, label, content? }] — content is what's drawn; label the plain name
//   value      the chosen key
//   onChange   (key) => void
//   readOnly   true while saving
//   className  extra class for the group (e.g. 'bb-side' for the gray Upcoming / Past look)
import { useRef } from 'react';

export default function Choice({ labelId, options, value, onChange, readOnly = false, className = '' }) {
  const buttonsRef = useRef([]);
  const current = options.findIndex((option) => option.key === value);
  const tabStop = current === -1 ? 0 : current;

  function choose(index) {
    if (readOnly) return;
    const option = options[index];
    if (option && option.key !== value) onChange(option.key);
  }

  function handleKeyDown(event) {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !back) return;
    event.preventDefault();
    const from = buttonsRef.current.indexOf(document.activeElement);
    const start = from === -1 ? tabStop : from;
    const next = (start + (forward ? 1 : -1) + options.length) % options.length;
    buttonsRef.current[next]?.focus();
    choose(next);
  }

  return (
    <div className={`segmented bb-segmented ${className}`.trim()} role="radiogroup" aria-labelledby={labelId} onKeyDown={handleKeyDown}>
      {options.map((option, index) => {
        const checked = index === current;
        return (
          <button
            key={option.key}
            ref={(element) => {
              buttonsRef.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked ? 'true' : 'false'}
            aria-label={option.content ? option.label : undefined}
            tabIndex={index === tabStop ? 0 : -1}
            className={`segment${checked ? ' is-checked' : ''}`}
            onClick={() => choose(index)}
          >
            {option.content ?? option.label}
          </button>
        );
      })}
    </div>
  );
}
