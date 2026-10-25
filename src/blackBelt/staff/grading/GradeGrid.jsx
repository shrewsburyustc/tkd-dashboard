// GradeGrid.jsx — the Grading tab's grid for ONE Dan and ONE choice of the day switch: candidates
// down the side, that day's subjects (or the extra-points items) across the top, then Total and
// Result (contract 0025 §14.2; approved mockups G01–G04, G06b, G07).
// Why it exists: copied from Star's GradeGrid (src/screens/testing/star/grading/GradeGrid.jsx,
// v0.124–v0.129, v0.512) with Black Belt's own cells:
//   * a GRADED subject: a grade dropdown with its part's letters, D amber, then Clear (G 12); an
//     empty hand-in cell after the hand-in date is an amber "Late" (G 17);
//   * a MEASURED subject: the number on top, the database's grade under it, "·" when empty; the
//     selected cell opens MeasuredEditor.jsx under it (G 3–G 5); "Hold 35" only when Hold was done;
//   * an EXTRA-POINTS item (the Extra points choice): a count box with the points under it ("+5",
//     gray "+0"), then the Extra column ("+12") (G 18); a kept count is gray "+15 kept" (G 36);
//   * "—" (gray) for a subject not for this candidate's age group: never opened, never counted (G 13);
//   * a make-up's kept grade: gray "A / kept", opens the kept note, never a list (G 14);
//     its retest cells have the thin blue outline.
// Rows: the cycle's own candidates in roster order, then the amber band "Make-ups · N — only the
// outlined subjects are graded" and the make-up rows, each with the amber Make-up label and the gray
// "from Spring 2027 · retests Free sparring" line (G 14, v0.947). Names show the school and the AGE
// GROUP, never the date of birth (G 2).
//
// Layout (decided by GradingTab from the screen):
//   size 'pc'      PC with a mouse ≥1024px — tilted headings, Total and Result at the right end
//   size 'touch'   a touch screen ≥1024px (a sideways tablet) — the same, 44px tall cells
//   size 'narrow'  640–1023px (an upright tablet, ~820px): Total and Result move UNDER THE NAME so
//                  every subject cell stays 44px or wider (G 9 — a deliberate change from Star's
//                  squeezed 32px cells); names stand upright. If a choice still has too many columns,
//                  the grid scrolls sideways inside its own box — the page never does.
// Keyboard (Star's proposal 28): the grid is one Tab stop (the selected cell); ← → ↑ ↓ move between
// cells; Enter / Space / Alt+↓ open a list or the editor. On a PC a selected graded cell also takes
// typed letters — A, B, C, D, then "+" or "-" — and Delete / Backspace clears it; a digit typed on
// a measured cell opens its editor with that digit. After a list choice the next cell to the right
// is selected (G 12); the editor's Enter goes DOWN to the next candidate (G 3).
//
// Props:
//   rows       the Dan's rows to show (school-filtered), own first then make-ups
//   columns    model.columnsFor(choice, rubric)   kind  'day' | 'other' | 'extra'
//   bands      for a day with two parts: [{ name, span }] — the thin band naming the parts (G 11)
//   ctx        { saves, isAdmin, rubric, submissionsDue }
//   size, typing (true on a PC), isTouch, danLabel, dayWords
//   onChooseSubjects(row, opener)   admins' "Choose subjects"
//   markedId, markKey   Results' "Open grades": that row gets Star's mark (gray tint + dark bar) and
//               is scrolled into view once per click (markKey)
import { useEffect, useRef, useState } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import GradeCell from './GradeCell.jsx';
import CountBox from './CountBox.jsx';
import MeasuredEditor from './MeasuredEditor.jsx';
import { headingUnder, lettersFor, measuredNumber, parseMeasuredKey, resultItem, resultSubject, rowName } from './model.js';
import { KeptNote, makeupLine, MakeupPill, ResultTag, rowLine, TotalText } from './parts.jsx';
import * as T from './text.js';

const keyOf = (rowId, colId) => `${rowId}|${colId}`;
// Column widths (px) per size: name, Extra, Total, Result, and the narrowest a subject column may get.
const WIDTHS = {
  pc: { name: 200, extra: 64, total: 72, result: 220, cell: 52 },
  touch: { name: 170, extra: 64, total: 72, result: 180, cell: 56 },
  narrow: { name: 172, extra: 56, total: 0, result: 0, cell: 48 },
};

// Typed grades on a PC (Star's typingStep, with Black Belt's "-": A- B- C-).
//   → { pending, effects: [{ type:'set', grade } | { type:'clear' } | { type:'move' }] }
function typingStep(pending, key, letters) {
  const k = typeof key === 'string' && key.length === 1 ? key.toUpperCase() : key;
  const has = (g) => letters.includes(g);
  if (k === 'A' || k === 'B' || k === 'C') {
    if (!has(k)) return { pending, effects: [] };
    return { pending: k, effects: [...(pending ? [{ type: 'move' }] : []), { type: 'set', grade: k }] };
  }
  if (k === 'D') {
    if (!has('D')) return { pending, effects: [] };
    return { pending: null, effects: [...(pending ? [{ type: 'move' }] : []), { type: 'set', grade: 'D' }, { type: 'move' }] };
  }
  if (k === '+' || k === '-') {
    if (!pending || !has(`${pending}${k}`)) return { pending: null, effects: [] };
    return { pending: null, effects: [{ type: 'set', grade: `${pending}${k}` }, { type: 'move' }] };
  }
  if (k === 'Enter' || k === 'Tab') return { pending: null, effects: pending ? [{ type: 'move' }] : [] };
  if (k === 'Delete' || k === 'Backspace') return { pending: null, effects: [{ type: 'clear' }] };
  return { pending: null, effects: [] };
}

export default function GradeGrid({ rows, columns, kind, bands = null, ctx, size = 'pc', typing = false, isTouch = false, danLabel, dayWords, onChooseSubjects, markedId = null, markKey = null }) {
  const { saves, rubric } = ctx;
  const tableRef = useRef(null);
  const [selected, setSelected] = useState(null); // { rowId, colId } — the grid's Tab stop
  const [openKey, setOpenKey] = useState(null); // the graded cell whose list is open
  const [editor, setEditor] = useState(null); // { rowId, colId, anchor, initialText }
  const [kept, setKept] = useState(null); // { key, anchor, cycleName, value }
  const [focusAsk, setFocusAsk] = useState(null); // { key, n, openEditor }
  const typingRef = useRef({ key: null, pending: null });
  // Results' "Open grades": scroll the marked row into view once the grid has drawn it.
  useEffect(() => {
    if (!markedId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      tableRef.current?.querySelector(`[data-grade-row="${CSS.escape(markedId)}"]`)?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
    // (once per click)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markKey]);
  const isExtra = kind === 'extra';
  const colIds = columns.map((c) => c.id);
  const widths = WIDTHS[size] ?? WIDTHS.pc;
  const sideTotals = size !== 'narrow';
  const minTableWidth = widths.name + columns.length * widths.cell + (isExtra ? widths.extra : 0) + widths.total + widths.result;
  const own = rows.filter((r) => !r.isMakeup);
  const makeups = rows.filter((r) => r.isMakeup);
  const ordered = [...own, ...makeups];
  const colCount = 1 + columns.length + (isExtra ? 1 : 0) + (sideTotals ? 2 : 0);

  // ----- Which cells can be used -----
  const colOf = (id) => columns.find((c) => c.id === id);
  function cellKind(row, col) {
    const result = saves.resultFor(row);
    if (col.item) return resultItem(result, col.id)?.kept ? 'kept' : 'count';
    const rs = resultSubject(result, col.id);
    if (!rs || !rs.applies) return 'none';
    if (rs.kept) return 'kept';
    return col.subject?.scoring === 'measured' ? 'measured' : 'grade';
  }
  const isUsable = (row, colId) => {
    const k = cellKind(row, colOf(colId));
    return k !== 'none';
  };
  const isEditable = (row, colId) => {
    const k = cellKind(row, colOf(colId));
    return k === 'grade' || k === 'measured' || k === 'count';
  };

  // The Tab stop: the selected cell while it is still there, else the first usable one.
  const firstStop = () => {
    for (const r of ordered) for (const id of colIds) if (isUsable(r, id)) return keyOf(r.id, id);
    return null;
  };
  const stop = selected && ordered.some((r) => r.id === selected.rowId) && colIds.includes(selected.colId)
    ? keyOf(selected.rowId, selected.colId)
    : firstStop();

  const cellEl = (key) => tableRef.current?.querySelector(`[data-grade-cell="${CSS.escape(key)}"]`) ?? null;
  useEffect(() => {
    if (!focusAsk) return;
    const found = cellEl(focusAsk.key);
    // a count cell's wrapper isn't focusable: its box is
    const el = found && !found.matches('input, button, [tabindex]') ? found.querySelector('input, button') ?? found : found;
    el?.focus();
    if (focusAsk.openEditor && el) {
      const [rowId, ...rest] = focusAsk.key.split('|');
      setEditor({ rowId, colId: rest.join('|'), anchor: el, initialText: null });
    }
    // (only a new ask matters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAsk]);
  function focusCell(rowId, colId, openEditor = false) {
    setSelected({ rowId, colId });
    const row = ordered.find((r) => r.id === rowId);
    const wantsEditor = openEditor && row && cellKind(row, colOf(colId)) === 'measured';
    setFocusAsk({ key: keyOf(rowId, colId), n: Date.now(), openEditor: wantsEditor });
  }

  // The next usable cell to the right in the row; at the end of the row, the next row's first EMPTY
  // editable cell (Star's nextCell).
  function nextRight(rowId, colId) {
    const r = ordered.findIndex((x) => x.id === rowId);
    const c = colIds.indexOf(colId);
    for (let j = c + 1; j < colIds.length; j += 1) if (isEditable(ordered[r], colIds[j])) return { rowId, colId: colIds[j] };
    for (let i = r + 1; i < ordered.length; i += 1) {
      const id = colIds.find((k) => isEditable(ordered[i], k) && isEmpty(ordered[i], k));
      if (id) return { rowId: ordered[i].id, colId: id };
    }
    return null;
  }
  function nextLeft(rowId, colId) {
    const r = ordered.findIndex((x) => x.id === rowId);
    const c = colIds.indexOf(colId);
    for (let j = c - 1; j >= 0; j -= 1) if (isEditable(ordered[r], colIds[j])) return { rowId, colId: colIds[j] };
    return null;
  }
  // The next candidate DOWN in the same subject that can take a number (G 3).
  function nextDown(rowId, colId) {
    const r = ordered.findIndex((x) => x.id === rowId);
    for (let i = r + 1; i < ordered.length; i += 1) if (isEditable(ordered[i], colId)) return { rowId: ordered[i].id, colId };
    return null;
  }
  function isEmpty(row, colId) {
    const col = colOf(colId);
    if (col.item) return saves.cell(row, 'count', colId).value === null;
    if (col.subject?.scoring === 'measured') return saves.cell(row, 'measured', colId).value === null;
    return saves.cell(row, 'grade', colId).value === null;
  }

  // A choice in a graded cell's list (Clear = null); then the next cell to the right (G 12).
  function chooseFromList(row, colId, letter) {
    const current = saves.cell(row, 'grade', colId).value;
    if (letter !== current) saves.setGrade(row, colId, letter);
    const next = nextRight(row.id, colId);
    if (next) focusCell(next.rowId, next.colId);
  }

  // Keys on a closed cell: arrows move; on a PC typed grades; digits open a measured editor.
  function handleCellKey(row, colId, event) {
    const { key } = event;
    const r = ordered.findIndex((x) => x.id === row.id);
    const c = colIds.indexOf(colId);
    let target = null;
    if (!event.altKey && !event.ctrlKey && !event.metaKey) {
      if (key === 'ArrowRight' && c < colIds.length - 1) target = [r, c + 1];
      if (key === 'ArrowLeft' && c > 0) target = [r, c - 1];
      if (key === 'ArrowDown' && r < ordered.length - 1) target = [r + 1, c];
      if (key === 'ArrowUp' && r > 0) target = [r - 1, c];
    }
    if (key.startsWith('Arrow') && !event.altKey) {
      event.preventDefault();
      typingRef.current = { key: null, pending: null };
      if (target) focusCell(ordered[target[0]].id, colIds[target[1]]);
      return;
    }
    const k = cellKind(row, colOf(colId));
    if (k === 'measured') {
      if (key === 'Enter' || key === ' ' || (event.altKey && key === 'ArrowDown')) {
        event.preventDefault();
        setEditor({ rowId: row.id, colId, anchor: event.currentTarget, initialText: null });
      } else if (/^[0-9.:]$/.test(key) && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setEditor({ rowId: row.id, colId, anchor: event.currentTarget, initialText: key });
      } else if ((key === 'Delete' || key === 'Backspace') && typing) {
        event.preventDefault();
        if (saves.cell(row, 'measured', colId).value !== null) saves.setMeasured(row, colId, null, 0);
      }
      return;
    }
    if (!typing || k !== 'grade' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === 'Shift' || key === 'CapsLock' || key === 'Control' || key === 'Alt' || key === 'Meta') return;
    const letters = lettersFor(colOf(colId));
    const cellKey = keyOf(row.id, colId);
    const pending = typingRef.current.key === cellKey ? typingRef.current.pending : null;
    const step = typingStep(pending, key, letters);
    typingRef.current = { key: cellKey, pending: step.pending };
    if (step.effects.length === 0) return;
    event.preventDefault();
    let at = { rowId: row.id, colId };
    for (const effect of step.effects) {
      if (effect.type === 'move') {
        const next = nextRight(at.rowId, at.colId);
        if (next) {
          at = next;
          focusCell(next.rowId, next.colId);
        }
      } else {
        const atRow = ordered.find((x) => x.id === at.rowId);
        const grade = effect.type === 'set' ? effect.grade : null;
        if (atRow && cellKind(atRow, colOf(at.colId)) === 'grade' && saves.cell(atRow, 'grade', at.colId).value !== grade) {
          saves.setGrade(atRow, at.colId, grade);
        }
        typingRef.current = { key: keyOf(at.rowId, at.colId), pending: step.pending };
      }
    }
  }

  function selectCell(row, colId, kindName) {
    const key = keyOf(row.id, colId);
    if (typingRef.current.key !== key) typingRef.current = { key, pending: null };
    setSelected({ rowId: row.id, colId });
    const noteKind = kindName === 'count' ? 'count' : kindName === 'measured' ? 'measured' : 'grade';
    if (saves.cell(row, noteKind, colId).note) saves.clearNote(row, noteKind, colId);
  }

  // The measured editor's answer (G 3): save a changed number, then move.
  function editorCommit(value, way, how) {
    const ed = editor;
    if (!ed) return;
    const row = ordered.find((r) => r.id === ed.rowId);
    if (row) {
      const now = parseMeasuredKey(saves.cell(row, 'measured', ed.colId).value);
      const changed = value === null ? now.value !== null : now.value !== value || now.way !== way;
      if (changed) saves.setMeasured(row, ed.colId, value, way);
    }
    if (how === 'way') return; // the editor stays open on the other way
    setEditor(null);
    let next = null;
    if (how === 'enter') next = nextDown(ed.rowId, ed.colId);
    if (how === 'tab') next = nextRight(ed.rowId, ed.colId);
    if (how === 'back') next = nextLeft(ed.rowId, ed.colId);
    if (next) focusCell(next.rowId, next.colId, true);
    else if (how !== 'close') cellEl(keyOf(ed.rowId, ed.colId))?.focus();
  }

  // ----- Drawing -----
  function headCell(col) {
    const under = headingUnder(col);
    return (
      <th key={col.id} scope="col" className="bbg-h-rot">
        <div className="bbg-h-name">
          {col.item ? col.item.name : col.subject.name}
          {!col.item && <span className="bbg-cr"> {T.credits(col.subject.credits)}</span>}
        </div>
        {under.length > 0 && <span className="bbg-h-under">{Array.isArray(under) ? under.map((u) => <span key={u}>{u}</span>) : under}</span>}
      </th>
    );
  }

  function bodyCell(row, col) {
    const name = rowName(row);
    const key = keyOf(row.id, col.id);
    const result = saves.resultFor(row);
    const k = cellKind(row, col);
    const tabStop = stop === key;
    const subjectName = col.item ? col.item.name : col.subject.name;

    if (k === 'none') {
      return (
        <td key={col.id} className="bbg-td is-na">
          <span aria-label={T.cellLabel(name, subjectName, null, { notForAge: true })} role="img">
            {T.NOT_FOR_AGE}
          </span>
        </td>
      );
    }
    if (k === 'kept') {
      const showing = kept?.key === key;
      const item = col.item ? resultItem(result, col.id) : null;
      const rs = col.item ? null : resultSubject(result, col.id);
      const value = col.item ? T.keptPlus(item?.points ?? 0) : rs?.letter ?? '';
      const from = col.item ? row.makeupOfCycleName : rs?.kept_from_cycle_name ?? row.makeupOfCycleName;
      return (
        <td key={col.id} className="bbg-td">
          <button
            type="button"
            className="bbg-cell is-kept"
            tabIndex={tabStop ? 0 : -1}
            data-grade-cell={key}
            aria-expanded={showing ? 'true' : 'false'}
            aria-label={T.cellLabel(name, subjectName, col.item ? `${item?.count ?? ''}` : value, { kept: from })}
            onFocus={() => selectCell(row, col.id, 'kept')}
            onKeyDown={(event) => handleCellKey(row, col.id, event)}
            onClick={(event) => setKept(showing ? null : { key, anchor: event.currentTarget, cycleName: from, value: col.item ? `${item?.count ?? ''}` : value })}
          >
            {col.item ? (
              <>
                <span className="bbg-cell-num">{item?.count ?? ''}</span>
                <small>{value}</small>
              </>
            ) : (
              <>
                <span className="bbg-cell-value">{value}</span>
                <small>{T.KEPT}</small>
              </>
            )}
          </button>
        </td>
      );
    }
    if (k === 'count') {
      const cell = saves.cell(row, 'count', col.id);
      const item = resultItem(result, col.id);
      const settled = cell.state === null || cell.state === 'saved';
      return (
        <td key={col.id} className="bbg-td bbg-num">
          <div data-grade-cell={key} className="bbg-countwrap" onFocus={() => selectCell(row, col.id, 'count')}>
            <CountBox value={cell.value} state={cell.state} label={T.countLabel(name, col.item.name)} onCommit={(value) => saves.setCount(row, col.id, value)} />
            {cell.value !== null && settled && item && (
              <small className={`bbg-points${item.points ? '' : ' is-zero'}`}>{T.plusPoints(item.points)}</small>
            )}
          </div>
        </td>
      );
    }
    const rs = resultSubject(result, col.id);
    if (k === 'measured') {
      const cell = saves.cell(row, 'measured', col.id);
      const m = parseMeasuredKey(cell.value);
      const unsaved = cell.state === 'unsaved' || cell.state === 'retrying';
      const settled = cell.state === null || cell.state === 'saved';
      const letter = settled ? rs?.letter ?? null : null;
      const number = m.value !== null ? measuredNumber(col.subject, m.way, m.value) : '';
      const hold = m.value !== null && m.way > 0 ? col.subject.ways?.[m.way]?.name : null;
      const isOpen = editor?.rowId === row.id && editor?.colId === col.id;
      const classes = ['bbg-cell', 'bbg-measured', letter === 'D' ? 'is-d' : '', m.value === null ? 'is-empty' : '', unsaved ? 'is-unsaved' : '',
        rs?.retest ? 'is-retest' : '', isOpen ? 'is-open' : ''].filter(Boolean).join(' ');
      return (
        <td key={col.id} className="bbg-td">
          <button
            type="button"
            className={classes}
            tabIndex={tabStop ? 0 : -1}
            data-grade-cell={key}
            aria-haspopup="dialog"
            aria-expanded={isOpen ? 'true' : 'false'}
            aria-label={T.cellLabel(name, subjectName, m.value !== null ? [hold, number, letter].filter(Boolean).join(' ') : null, { unsaved, retest: rs?.retest })}
            onFocus={() => selectCell(row, col.id, 'measured')}
            onKeyDown={(event) => handleCellKey(row, col.id, event)}
            onClick={(event) => {
              // (a second click on the open cell leaves the editor open: Enter, Esc or a click elsewhere closes it)
              if (!isOpen) setEditor({ rowId: row.id, colId: col.id, anchor: event.currentTarget, initialText: null });
            }}
          >
            {/* ti-alert-triangle = Not saved */}
            {unsaved && <IconAlertTriangle size={12} aria-hidden="true" className="bbg-cell-warnmark" />}
            {m.value === null ? (
              <span className="bbg-cell-dot" aria-hidden="true">{T.EMPTY_CELL}</span>
            ) : (
              <>
                <span className="bbg-cell-num">
                  {hold && <span className="bbg-cell-way">{hold} </span>}
                  {number}
                </span>
                <small className="bbg-cell-letter">{letter ?? ' '}</small>
              </>
            )}
          </button>
        </td>
      );
    }
    // a graded subject
    const cell = saves.cell(row, 'grade', col.id);
    const unsaved = cell.state === 'unsaved' || cell.state === 'retrying';
    return (
      <td key={col.id} className="bbg-td">
        <GradeCell
          variant="grid"
          value={cell.value}
          letters={lettersFor(col)}
          state={cell.state}
          retest={rs?.retest === true}
          late={rs?.late === true}
          tabStop={tabStop}
          dataCell={key}
          label={T.cellLabel(name, subjectName, cell.value, { unsaved, retest: rs?.retest, late: rs?.late })}
          listLabel={T.gradeListLabel(subjectName)}
          open={openKey === key}
          onOpenChange={(open) => setOpenKey(open ? key : null)}
          onChoose={(letter) => chooseFromList(row, col.id, letter)}
          onKeyDown={(event) => handleCellKey(row, col.id, event)}
          onFocus={() => selectCell(row, col.id, 'grade')}
        />
      </td>
    );
  }

  function rowEl(row) {
    const result = saves.resultFor(row);
    // gray "Changed on another device" notes of this row, under the name (Star proposal 4)
    const notes = columns.map((col) => {
      const kindName = col.item ? 'count' : col.subject?.scoring === 'measured' ? 'measured' : 'grade';
      return { what: col.item ? col.item.name : col.subject.name, note: saves.cell(row, kindName, col.id).note };
    }).filter((n) => n.note);
    const extraTotal = result?.extra ? result.extra.total : null;
    return (
      <tr key={row.id} data-grade-row={row.id} className={[row.isMakeup ? 'bbg-row-makeup' : '', row.id === markedId ? 'bbg-row-marked' : ''].filter(Boolean).join(' ') || undefined}>
        <th scope="row" className="bbg-name">
          <span className="bbg-name-text">
            {rowName(row)}
            {row.isMakeup && <MakeupPill />}
          </span>
          <small>{rowLine(row, result)}</small>
          {row.isMakeup && <small className="bbg-makeupline">{makeupLine(row, result, rubric)}</small>}
          {!sideTotals && (
            <span className="bbg-name-totals">
              <span className="bbg-name-total">
                <TotalText row={row} saves={saves} inline />
              </span>
              <ResultTag row={row} ctx={ctx} onChooseSubjects={onChooseSubjects} />
            </span>
          )}
          {notes.map((n) => (
            <small key={n.what} className="bbg-cellnote">
              {n.what}: {n.note}
            </small>
          ))}
        </th>
        {columns.map((col) => bodyCell(row, col))}
        {isExtra && <td className="bbg-extra">{extraTotal !== null ? T.plusPoints(extraTotal) : ''}</td>}
        {sideTotals && (
          <>
            <td className="bbg-total">
              <TotalText row={row} saves={saves} />
            </td>
            <td className="bbg-res">
              <ResultTag row={row} ctx={ctx} onChooseSubjects={onChooseSubjects} />
            </td>
          </>
        )}
      </tr>
    );
  }

  const editorRow = editor ? ordered.find((r) => r.id === editor.rowId) : null;
  const editorCol = editor ? colOf(editor.colId) : null;
  const editorCell = editorRow && editorCol ? saves.cell(editorRow, 'measured', editorCol.id) : null;

  return (
    <div className={`bbg-grid bbg-grid--${size}${isExtra ? ' bbg-grid--extra' : ''}`}>
      <table ref={tableRef} className="bbg-table" style={{ minWidth: minTableWidth }} aria-label={T.gridLabel(danLabel, dayWords)}>
        <colgroup>
          <col style={{ width: widths.name }} />
          {columns.map((c) => (
            <col key={c.id} />
          ))}
          {isExtra && <col style={{ width: widths.extra }} />}
          {sideTotals && <col style={{ width: widths.total }} />}
          {sideTotals && <col style={{ width: widths.result }} />}
        </colgroup>
        <thead>
          {bands && (
            <tr className="bbg-bandhead">
              <th aria-hidden="true" />
              {bands.map((b) => (
                <th key={b.name} colSpan={b.span} scope="colgroup">
                  {b.name}
                </th>
              ))}
              {sideTotals && <th colSpan={2} aria-hidden="true" />}
            </tr>
          )}
          <tr>
            <th scope="col" className="bbg-h-namecol">
              {T.COL_CANDIDATE}
            </th>
            {columns.map((col) => headCell(col))}
            {isExtra && (
              <th scope="col" className="bbg-h-total">
                {T.COL_EXTRA}
              </th>
            )}
            {sideTotals && (
              <>
                <th scope="col" className="bbg-h-total">
                  {T.COL_TOTAL}
                </th>
                <th scope="col" className="bbg-h-res">
                  {T.COL_RESULT}
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {own.map(rowEl)}
          {makeups.length > 0 && (
            <tr className="bbg-band">
              <td colSpan={colCount}>{T.makeupBand(makeups.length)}</td>
            </tr>
          )}
          {makeups.map(rowEl)}
        </tbody>
      </table>
      {editor && editorRow && editorCol && (
        <MeasuredEditor
          key={`${editor.rowId}|${editor.colId}`}
          anchor={editor.anchor}
          subject={editorCol.subject}
          value={parseMeasuredKey(editorCell?.value ?? null)}
          initialText={editor.initialText}
          group={saves.resultFor(editorRow)?.age_group ?? null}
          name={rowName(editorRow)}
          isTouch={isTouch}
          onCommit={editorCommit}
          onCancel={() => {
            const ed = editor;
            setEditor(null);
            cellEl(keyOf(ed.rowId, ed.colId))?.focus();
          }}
        />
      )}
      {kept && (
        <KeptNote
          cycleName={kept.cycleName}
          value={kept.value}
          variant="pop"
          anchor={kept.anchor}
          onClose={(byEscape) => {
            const anchor = kept.anchor;
            setKept(null);
            if (byEscape && anchor?.isConnected) anchor.focus();
          }}
        />
      )}
    </div>
  );
}
