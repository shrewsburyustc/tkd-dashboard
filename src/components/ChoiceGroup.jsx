// ChoiceGroup.jsx — a row of buttons where exactly one is chosen (a "radio group").
// Why it exists: several phase 2 dialogs ask "pick one": Registration Open / Closed (E4),
// Paying by Cash / Check / Card (R4), the Class buttons and the Current belt buttons with belt
// pictures (R4, R6 — the same tap buttons as the family form). They all behave the same way:
//   - one Tab stop for the whole group (the chosen button, or the first one);
//   - ← → ↑ ↓ move to the next / previous choice AND choose it, like radio buttons;
//   - screen readers hear "radio button, 2 of 3, checked".
// Two looks:
//   'segmented'  joined buttons (like the location switcher) — Open / Closed, Cash / Check / Card
//   'chips'      separate outline buttons that wrap onto more lines — classes and belts
// Both looks are in src/styles/shared.css (.segmented / .segment / .ev-segmented, .ev-chips /
// .ev-chip). Color Belt, Star, Black Belt, Camps and Finance use it, so it lives in
// src/components/ since Dashboard core step 1 (rulebook v1.030); its old path,
// screens/testing/events/ChoiceGroup.jsx, re-exports it until each section switches.
//
// Props:
//   labelId    id of the visible label (aria-labelledby)
//   options    [{ key, label, content? }] — content (optional) is what's drawn (e.g. belt + name);
//              label is the plain text name
//   value      the chosen key, or null (nothing chosen yet)
//   onChange   (key) => void
//   variant    'segmented' | 'chips'
//   readOnly   true while saving
//   invalid    true to tell screen readers the group has a problem
//   describedBy  id of a message under the group
//   autoFocus  true: a dialog opening puts keyboard focus on the chosen button (Dialog.jsx data-autofocus)
//   disabled   true: shown but can't be used (phase 3: Edit details of a graded student, staff after
//              the testing day) — screen readers hear "dimmed", Tab skips it, clicks and keys do nothing
import { useRef } from 'react';

export default function ChoiceGroup({ labelId, options, value, onChange, variant = 'segmented', readOnly = false, invalid = false, describedBy, autoFocus = false, disabled = false }) {
  const buttonsRef = useRef([]);
  const current = options.findIndex((option) => option.key === value);
  const tabStop = current === -1 ? 0 : current;

  function choose(index) {
    if (readOnly || disabled) return;
    const option = options[index];
    if (option && option.key !== value) onChange(option.key);
  }

  function handleKeyDown(event) {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !back) return;
    if (disabled) return;
    event.preventDefault();
    const from = buttonsRef.current.indexOf(document.activeElement);
    const start = from === -1 ? tabStop : from;
    const next = (start + (forward ? 1 : -1) + options.length) % options.length;
    buttonsRef.current[next]?.focus();
    choose(next);
  }

  return (
    <div
      className={variant === 'chips' ? 'ev-chips' : 'segmented ev-segmented'}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={describedBy}
      aria-disabled={disabled ? 'true' : undefined}
      onKeyDown={handleKeyDown}
    >
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
            aria-disabled={disabled ? 'true' : undefined}
            tabIndex={!disabled && index === tabStop ? 0 : -1}
            data-autofocus={autoFocus && !disabled && index === tabStop ? true : undefined}
            className={`${variant === 'chips' ? 'ev-chip' : 'segment'}${checked ? ' is-checked' : ''}`}
            onClick={() => choose(index)}
          >
            {option.content ?? option.label}
          </button>
        );
      })}
    </div>
  );
}
