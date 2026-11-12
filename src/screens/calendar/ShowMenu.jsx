// ShowMenu.jsx — the Calendar's "Show" button and its menu of tick boxes (rulebook v0.613-v0.615).
// Why it exists: every kind of Calendar item (classes, closures, events, free classes, follow-ups)
// can be hidden, and with more kinds coming a row of switches would not fit, so it is ONE compact
// button that opens a list.
//   - The button: ti-filter, "Show", and only while something is hidden a "4 of 5" badge.
//   - The list is the shared ⋯ menu (components/RowMenu.jsx) with tick-box rows (N16, v1.141): a
//     dropdown under the button on PC and tablet, a sheet from the bottom on phones. Ticking does NOT
//     close it and takes effect at once (no Save); "Show everything" sits after a separator.
//     Esc / Tab / a click outside close it and give focus back to the button.
//
// Props:
//   kinds      [{ key, label }]            (showKinds.js KINDS)
//   hidden     Set of hidden keys
//   isSheet    true on phones
//   full       true = full-width button (phone)
//   onToggle   (key) => void               onShowAll () => void
import { useRef, useState } from 'react';
import { IconChevronDown, IconChevronUp, IconEye, IconFilter } from '@tabler/icons-react';
import RowMenu from '../../components/RowMenu.jsx';
import { shownCount } from '../../lib/calendar/showKinds.js';
import * as T from './text.js';

export default function ShowMenu({ kinds, hidden, isSheet, full = false, onToggle, onShowAll }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const count = shownCount(hidden);
  const items = [
    ...kinds.map((kind) => ({ key: kind.key, label: kind.label, checked: !hidden.has(kind.key), onSelect: () => onToggle(kind.key) })),
    { key: 'show-everything', label: T.SHOW_EVERYTHING, Icon: IconEye, separatorBefore: true, disabled: hidden.size === 0, onSelect: onShowAll },
  ];
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`btn cshow-btn${full ? ' cshow-btn--full' : ''}`}
        data-cal-show
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-label={count ? T.showButtonLabel(count.shown, count.total) : T.SHOW}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="cshow-btn-main">
          <IconFilter size={16} aria-hidden="true" />
          {T.SHOW}
        </span>
        <span className="cshow-btn-end">
          {count && <span className="cshow-badge">{T.showBadge(count.shown, count.total)}</span>}
          {open ? <IconChevronUp size={16} aria-hidden="true" /> : <IconChevronDown size={16} aria-hidden="true" />}
        </span>
      </button>
      {open && (
        <RowMenu
          anchor={buttonRef.current}
          isSheet={isSheet}
          title={T.SHOW_TITLE}
          label={T.SHOW_TITLE}
          items={items}
          onClose={(reason) => {
            setOpen(false);
            if (reason !== 'outside') buttonRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
