// Grip.jsx — the drag handle (ti-grip-vertical) on a payment plan in Add cycle.
// Why it exists: rulebook v0.43 / v0.63 — rows are reordered by dragging the grip with a mouse,
// a finger or a pen (useReorderDrag.js does the dragging). The grip is focusable so its
// "Drag to reorder" tooltip shows on keyboard focus too; the keyboard way to move a plan is
// ⋯ → Move up / Move down. Drawn like Color Belt's grip (testing.css ".grip").
import { IconGripVertical } from '@tabler/icons-react';
import { placeTip } from '../../../components/IconButton.jsx';
import { GRIP_TOOLTIP } from '../text.js';

export default function Grip({ label, gripProps, disabled = false }) {
  return (
    <button
      type="button"
      className="grip bb-grip"
      aria-label={label}
      aria-disabled={disabled ? 'true' : undefined}
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
