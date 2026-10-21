// PickerSheet.jsx — the phone's "who to grade" sheet: the selected Dan's candidates in belt order,
// each with its Result, sliding up from the bottom (proposal 24, H6 phone).
// Why it exists: on a phone the Grading tab shows one candidate at a time (v0.137). The picker
// "Mia Patel · 0 → 1 ▾" opens this sheet to jump to anyone; ◀ ▶ step through them. Nothing moves
// to the next candidate by itself.
//
//   1st Dan · 7 candidates
//   Pick who to grade
//   ─────────────────────────────────────
//   Jordan Kim · 0 → 1                    Passed
//   Shrewsbury
//   Noah Chen · 0 → 1        ⚠ Not saved · 1 grade
//   Worcester
//   …
//   Cancel
//
// Built like the ⋯ menu's phone sheet (RowMenu.jsx: the .tsheet look, a portal into document.body):
// focus starts on the current candidate; ↑ ↓ Home End move; Enter / tap chooses; Esc, Cancel or a
// tap on the dimmed backdrop closes it and focus goes back to the picker.
//
// Props: title, sub, rows, currentId, saves, isAdmin, onPick(rowId), onClose()
// (The Result is worded for who is signed in: admins see "Choose subjects" in link blue (a row is
// already a button, so the working link is the one on the card); staff see "· an admin chooses
// subjects".)
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { schoolName } from '../candidates/text.js';
import { ResultTag } from './parts.jsx';
import * as T from './text.js';

export default function PickerSheet({ title, sub, rows, currentId, saves, isAdmin, onPick, onClose }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const items = Array.from(panelRef.current?.querySelectorAll('[role="menuitemradio"]') ?? []);
    (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
  }, []);

  function handleKeyDown(event) {
    event.stopPropagation();
    const list = Array.from(panelRef.current.querySelectorAll('[role="menuitemradio"], [data-sheet-cancel]'));
    const index = list.indexOf(document.activeElement);
    let next = null;
    if (event.key === 'ArrowDown') next = index + 1 >= list.length ? 0 : index + 1;
    if (event.key === 'ArrowUp') next = index <= 0 ? list.length - 1 : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = list.length - 1;
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onCloseRef.current();
      return;
    }
    if (next !== null) {
      event.preventDefault();
      list[next].focus();
    }
  }

  return createPortal(
    <div className="tsheet-wrap" onClick={(event) => event.stopPropagation()}>
      <div className="tsheet-backdrop" aria-hidden="true" onClick={() => onCloseRef.current()} />
      <div ref={panelRef} className="tsheet stg-sheet" onKeyDown={handleKeyDown}>
        <div className="account-grab" aria-hidden="true" />
        <div className="tsheet-head">
          <p className="tsheet-title">{title}</p>
          <p className="tsheet-sub">{sub}</p>
        </div>
        <div role="menu" aria-label={title}>
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              role="menuitemradio"
              aria-checked={row.id === currentId ? 'true' : 'false'}
              tabIndex={-1}
              className={`stg-sheetrow${row.id === currentId ? ' is-current' : ''}`}
              onClick={() => onPick(row.id)}
            >
              <span className="stg-sheetrow-name">
                {T.pickerText(row)}
                <small>
                  {schoolName(row.locationCode)}
                  {row.isMakeup ? ` · ${T.MAKEUP}` : ''}
                </small>
              </span>
              <span className="stg-sheetrow-result">
                <ResultTag row={row} saves={saves} isAdmin={isAdmin} />
              </span>
            </button>
          ))}
          <div role="separator" className="menu-separator" />
          <button type="button" data-sheet-cancel tabIndex={-1} className="menu-item tmenu-cancel" onClick={() => onCloseRef.current()}>
            {T.CANCEL}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
