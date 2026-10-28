// Grip.jsx — the drag handle (ti-grip-vertical) at the start of a row that can be reordered.
// Why it exists: rulebook v0.43 / v0.63 — rows are reordered by dragging the grip with a mouse,
// a finger or a pen (src/lib/useReorderDrag.js does the dragging and gives the gripProps). The grip
// is focusable so its "Drag to reorder" tooltip shows on keyboard focus too (on the PC); the
// keyboard way to move a row is ⋯ → Move up / Move down. A 16px icon; a 44×44 touch area on touch
// screens (shared.css ".grip").
// It was Color Belt's (screens/testing/RankRows.jsx), already used by Calendar, Forms and
// Prospects; it lives here since Dashboard core step 1 (rulebook v1.100), and RankRows.jsx
// re-exports it so those imports keep working. Black Belt's grayed form (disabled) is added;
// Black Belt's and Star's own copies switch to this one in their prompts.
//
// Props:
//   label      the screen-reader name, e.g. "Drag to reorder Yellow" (the section's words)
//   gripProps  from useReorderDrag (the pointer handlers that start a drag)
//   tabIndex   optional: the list's arrow-key navigation decides whether it's a Tab stop
//   disabled   true: shown, but can't drag (e.g. while saving) — screen readers hear "dimmed"
//              (aria-disabled, so it stays focusable and keeps its tooltip); no drag handlers
import { IconGripVertical } from '@tabler/icons-react';
import { placeTip } from './IconButton.jsx';
import { GRIP_TOOLTIP } from './text.js';

export default function Grip({ label, gripProps, tabIndex, disabled = false }) {
  return (
    <button
      type="button"
      className="grip"
      aria-label={label}
      aria-disabled={disabled ? 'true' : undefined}
      tabIndex={tabIndex}
      onPointerEnter={placeTip}
      onFocus={placeTip}
      {...(disabled ? {} : gripProps)}
    >
      <IconGripVertical size={16} aria-hidden="true" />
      <span className="grip-tip" aria-hidden="true">
        {GRIP_TOOLTIP}
      </span>
    </button>
  );
}
