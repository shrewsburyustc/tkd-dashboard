// PickerSheet.jsx — the phone's "who to grade" sheet: the chosen Dan's candidates, each with its
// Result, sliding up from the bottom (contract 0025 §14.2; G 10, G 14).
// Why it exists: copied from Star's PickerSheet (src/screens/testing/star/grading/PickerSheet.jsx,
// v0.512 proposal 24). On a phone the Grading tab shows one candidate at a time; the picker
// "Mia Chen · 18 and over ▾" opens this sheet to jump to anyone; ◀ ▶ step through them in the same
// order: the cycle's own candidates, then the make-ups (G 14 — the make-up rows carry the amber
// Make-up label here too). Nothing moves to the next candidate by itself.
// Built like the ⋯ menu's phone sheet (the .tsheet look, a portal into document.body): focus starts
// on the current candidate; ↑ ↓ Home End move; Enter / tap chooses; Esc, Cancel or a tap on the
// dimmed backdrop closes it and focus goes back to the picker.
//
// Props: title, sub, rows, currentId, ctx (the Result's words: { saves, isAdmin, rubric,
//        submissionsDue }), onPick(rowId), onClose()
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { rowName } from './model.js';
import { MakeupPill, ResultTag, rowLine } from './parts.jsx';
import * as T from './text.js';

export default function PickerSheet({ title, sub, rows, currentId, ctx, onPick, onClose }) {
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
      <div ref={panelRef} className="tsheet bbg-sheet" onKeyDown={handleKeyDown}>
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
              className={`bbg-sheetrow${row.id === currentId ? ' is-current' : ''}`}
              onClick={() => onPick(row.id)}
            >
              <span className="bbg-sheetrow-name">
                {rowName(row)}
                {row.isMakeup && <MakeupPill />}
                <small>{rowLine(row, ctx.saves.resultFor(row))}</small>
              </span>
              <span className="bbg-sheetrow-result">
                <ResultTag row={row} ctx={ctx} />
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
