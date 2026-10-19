// RemovedGroup.jsx — "Removed · 1   Not in the counts" at the bottom of the Payments tab (C4).
// Why it exists: a withdrawn camper (or a "Duplicate copy" after Keep this one) isn't deleted —
// their payments stay on record — but they leave the counts. They are listed here, folded open by
// default (Color Belt R8), each with Restore in its ⋯ (staff and admins for an ordinary
// withdrawal; a duplicate copy for admins only). Click the heading to fold it away.
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { CamperRow } from './CamperRows.jsx';
import * as T from './text.js';

export default function RemovedGroup({ rows, open, onToggle, ctx }) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="ev-removed-head" role="row">
        <span role="cell">
          <button type="button" className="ev-removed-toggle" aria-expanded={open ? 'true' : 'false'} onClick={onToggle}>
            {/* ti-chevron-up / ti-chevron-down = collapse / expand */}
            {open ? <IconChevronUp size={16} aria-hidden="true" /> : <IconChevronDown size={16} aria-hidden="true" />}
            <span className="ev-removed-title">{T.removedGroup(rows.length)}</span>
          </button>
          <span className="ev-removed-note">{T.NOT_IN_COUNTS}</span>
        </span>
      </div>
      {open && rows.map((row) => <CamperRow key={row.id} row={row} ctx={ctx} />)}
    </>
  );
}
