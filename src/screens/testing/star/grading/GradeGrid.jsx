// GradeGrid.jsx — the Grading tab's grid for ONE Dan: candidates down the side, the Dan's judged
// subjects across the top, then Classes attended, Assistant classes, Total and Result.
// Why it exists: rulebook v0.124 ("names down the side and all the subjects at the top so we can
// grade them on a large scale"), with v0.125 (a dropdown per cell), v0.126 (the two count columns,
// Assistant Instructor worked out and shown "= A" under the count), v0.129 (a make-up's kept grades
// gray with "kept", retest cells outlined) and the Phase 5 gap mockups H1, H2, H6 (v0.512).
//
// Layout (decided by GradingTab from the screen, proposal 23 and Q3 = B):
//   size 'pc'      PC with a mouse ≥1024px: 36px cells, the name column 190px
//   size 'touch'   a touch tablet held sideways (≥1024px): 44px tall cells
//   size 'narrow'  an UPRIGHT touch tablet (~820px) or a narrow PC window: the FULL grid stays,
//                  squeezed — grade cells about 32px wide (Q3 = B: a named exception to the 44px
//                  tap-area rule for this grid on an upright tablet only)
//   Phones never get the grid (GradingTab shows one candidate at a time).
// Subject names are tilted 60° in the header, with the credits in gray (proposal 23). The columns
// fit the screen when they can; when a Dan has too many subjects for its cells' minimum width (e.g.
// 2nd Dan on an upright tablet), the grid scrolls sideways inside its own box — the page never does.
//
// Cells (proposals 1–2, 9, 28–30):
//   a grade cell is a GradeCell dropdown: D amber, an empty cell a light "·", Not saved amber with ⚠,
//   a retest cell a 1px blue outline, the selected (focused) cell a 2px blue inset;
//   a KEPT cell is a gray button "B+ / kept" that opens a note (never a dropdown);
//   the count boxes are empty until entered; Total and Result come from the database only (v0.158).
// Keyboard (proposal 28): the grid is one Tab stop (the selected cell); ← → ↑ ↓ move between grade
// cells; Enter / Space / Alt+↓ open the list. On a PC a selected cell also takes typed letters —
// A, B, C, D, then "+" (gradingCore.typingStep) — and Delete / Backspace clears it. After a choice
// the next cell to the right is selected; at the end of a row, the next row's first empty cell
// (gradingCore.nextCell). Choosing the cell's own grade again clears it (v0.125).
//
// Props:
//   rows        the Dan's GridRows to show (already filtered by school), belt order
//   subjects    judgedSubjects(copy, dan)     letters  gradeLetters(copy)
//   maxScore    the Dan's maximum (for "Total of 315")   danLabel  "1st Dan"
//   saves       the page's useStarGradingSaves()
//   isAdmin     admins see "Choose subjects" (proposal 25)
//   size        'pc' | 'touch' | 'narrow'      typing  true on a PC (typed letters, proposal 28)
//   onChooseSubjects(row, opener)
import { useEffect, useRef, useState } from 'react';
import { keptSubject, nextCell, toggleGrade, typingStep } from '../../../../lib/star/gradingApi.js';
import GradeCell from './GradeCell.jsx';
import CountBox from './CountBox.jsx';
import { candidateLine, KeptNote, ResultTag, TotalText } from './parts.jsx';
import * as T from './text.js';

const { G } = T;
const keyOf = (rowId, categoryId) => `${rowId}|${categoryId}`;
// Column widths (px) per size: name, each count, Total, Result. Grade columns share what is left, but
// never get narrower than `cell` (36px PC, 44px sideways touch, 32px upright tablet — Q3 = B): the
// table's minimum width below makes the grid scroll sideways inside its own box instead (grading.css).
const WIDTHS = {
  pc: { name: 190, count: 64, total: 64, result: 180, cell: 36 },
  touch: { name: 150, count: 56, total: 56, result: 150, cell: 44 },
  narrow: { name: 112, count: 48, total: 48, result: 116, cell: 32 },
};

// markedId (phase 6): the row Results' Open grades marked — gray tint + dark bar (proposal 29), or null.
export default function GradeGrid({ rows, subjects, letters, maxScore, danLabel, saves, isAdmin, size = 'pc', typing = false, onChooseSubjects, markedId = null }) {
  const tableRef = useRef(null);
  const [selected, setSelected] = useState(null); // { rowId, categoryId } — the grid's Tab stop
  const [openKey, setOpenKey] = useState(null); // the cell whose list is open
  const [kept, setKept] = useState(null); // { key, anchor } — the kept note that shows
  const [focusAsk, setFocusAsk] = useState(null); // { key, n } — focus this cell after drawing
  const typingRef = useRef({ key: null, pending: null }); // a typed letter that "+" may still raise
  const subjectIds = subjects.map((s) => s.id);
  const widths = WIDTHS[size] ?? WIDTHS.pc;
  const minTableWidth = widths.name + 2 * widths.count + widths.total + widths.result + subjects.length * widths.cell;

  // The Tab stop: the selected cell while it is still on the grid, else the first cell.
  const stop = selected && rows.some((r) => r.id === selected.rowId) && subjectIds.includes(selected.categoryId)
    ? keyOf(selected.rowId, selected.categoryId)
    : rows.length > 0 && subjectIds.length > 0 ? keyOf(rows[0].id, subjectIds[0]) : null;

  const cellEl = (key) => tableRef.current?.querySelector(`[data-grade-cell="${key}"]`) ?? null;
  useEffect(() => {
    if (focusAsk) cellEl(focusAsk.key)?.focus();
  }, [focusAsk]);
  function focusCell(rowId, categoryId) {
    setSelected({ rowId, categoryId });
    setFocusAsk({ key: keyOf(rowId, categoryId), n: Date.now() });
  }

  const isEditable = (row, id) => !keptSubject(row, id);
  const isEmpty = (row, id) => saves.cell(row, 'grade', id).value === null;
  function moveNext(rowId, categoryId) {
    const next = nextCell(rows, subjectIds, { rowId, categoryId }, isEditable, isEmpty);
    if (next) focusCell(next.rowId, next.categoryId);
  }

  // A choice in a cell's list: the same grade again clears it; then the next cell is selected.
  function chooseFromList(row, categoryId, letter) {
    const current = saves.cell(row, 'grade', categoryId).value;
    saves.chooseGrade(row, categoryId, toggleGrade(current, letter));
    moveNext(row.id, categoryId);
  }

  // Keys on a closed cell (grade or kept): arrows move; on a PC, typed grades.
  function handleCellKey(row, categoryId, event, isKept) {
    const { key } = event;
    const r = rows.findIndex((x) => x.id === row.id);
    const c = subjectIds.indexOf(categoryId);
    let target = null;
    if (!event.altKey && !event.ctrlKey && !event.metaKey) {
      if (key === 'ArrowRight' && c < subjectIds.length - 1) target = [r, c + 1];
      if (key === 'ArrowLeft' && c > 0) target = [r, c - 1];
      if (key === 'ArrowDown' && r < rows.length - 1) target = [r + 1, c];
      if (key === 'ArrowUp' && r > 0) target = [r - 1, c];
    }
    if (key.startsWith('Arrow') && !event.altKey) {
      event.preventDefault();
      typingRef.current = { key: null, pending: null };
      if (target) focusCell(rows[target[0]].id, subjectIds[target[1]]);
      return;
    }
    if (!typing || isKept || event.ctrlKey || event.metaKey || event.altKey) return;
    // Shift on its own (on the way to "+") must not forget the letter just typed.
    if (key === 'Shift' || key === 'CapsLock' || key === 'Control' || key === 'Alt' || key === 'Meta') return;
    const cellKey = keyOf(row.id, categoryId);
    const pending = typingRef.current.key === cellKey ? typingRef.current.pending : null;
    const step = typingStep({ pending }, key, letters);
    typingRef.current = { key: cellKey, pending: step.state.pending };
    if (step.effects.length === 0) return;
    event.preventDefault();
    let at = { rowId: row.id, categoryId };
    for (const effect of step.effects) {
      if (effect.type === 'move') {
        const next = nextCell(rows, subjectIds, at, isEditable, isEmpty);
        if (next) {
          at = next;
          focusCell(next.rowId, next.categoryId);
        }
      } else {
        const atRow = rows.find((x) => x.id === at.rowId);
        const grade = effect.type === 'set' ? effect.grade : null;
        if (atRow && saves.cell(atRow, 'grade', at.categoryId).value !== grade) saves.chooseGrade(atRow, at.categoryId, grade);
        typingRef.current = { key: keyOf(at.rowId, at.categoryId), pending: step.state.pending };
      }
    }
  }

  function selectCell(row, categoryId) {
    const key = keyOf(row.id, categoryId);
    if (typingRef.current.key !== key) typingRef.current = { key, pending: null };
    setSelected({ rowId: row.id, categoryId });
    // A gray "Changed on another device" note goes once the person is back on that cell.
    if (saves.cell(row, 'grade', categoryId).note) saves.clearNote(row, 'grade', categoryId);
  }

  return (
    <div className={`stg-grid stg-grid--${size}`}>
      <table ref={tableRef} className="stg-table" style={{ minWidth: minTableWidth }} aria-label={T.gridLabel(danLabel)}>
        <colgroup>
          <col style={{ width: widths.name }} />
          {subjects.map((s) => (
            <col key={s.id} />
          ))}
          <col style={{ width: widths.count }} />
          <col style={{ width: widths.count }} />
          <col style={{ width: widths.total }} />
          <col style={{ width: widths.result }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="stg-h-name">
              {T.COL_CANDIDATE}
            </th>
            {subjects.map((s) => (
              <th key={s.id} scope="col" className="stg-h-rot">
                <div>
                  {s.name} <span className="stg-cr">{T.credits(s.credits)}</span>
                </div>
              </th>
            ))}
            <th scope="col" className="stg-h-rot stg-h-ex">
              <div>{T.COL_CLASSES_ATTENDED}</div>
            </th>
            <th scope="col" className="stg-h-rot stg-h-ex">
              <div>{T.COL_ASSISTANT_CLASSES}</div>
            </th>
            <th scope="col" className="stg-h-total">
              {T.COL_TOTAL}
              <small>{T.totalOf(G.scoreText(maxScore))}</small>
            </th>
            <th scope="col" className="stg-h-res">
              {T.COL_RESULT}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const name = `${row.firstName} ${row.lastName}`;
            const result = saves.resultFor(row);
            const retestIds = new Set((result?.subjects ?? []).filter((s) => s.retest).map((s) => s.eventCategoryId));
            const attended = saves.cell(row, 'count', 'classesAttended');
            const assistant = saves.cell(row, 'count', 'assistantClasses');
            const assistantSettled = assistant.state === null || assistant.state === 'saved';
            const aiGrade = assistant.value !== null && assistantSettled ? result?.ai?.grade ?? null : null;
            // Gray "Changed on another device" notes of this row, under the name (proposal 4).
            const notes = [
              ...subjects.map((s) => ({ what: s.name, note: saves.cell(row, 'grade', s.id).note })),
              { what: T.COL_CLASSES_ATTENDED, note: attended.note },
              { what: T.COL_ASSISTANT_CLASSES, note: assistant.note },
            ].filter((n) => n.note);
            return (
              <tr key={row.id} data-grade-row={row.id} className={row.id === markedId ? 'stg-row-marked' : undefined}>
                <th scope="row" className="stg-name">
                  <span className="stg-name-text">{name}</span>
                  <small>{candidateLine(row)}</small>
                  {notes.map((n) => (
                    <small key={n.what} className="stg-cellnote">
                      {n.what}: {n.note}
                    </small>
                  ))}
                </th>
                {subjects.map((s) => {
                  const key = keyOf(row.id, s.id);
                  const keptGrade = keptSubject(row, s.id);
                  if (keptGrade) {
                    const showing = kept?.key === key;
                    return (
                      <td key={s.id} className="stg-td">
                        <button
                          type="button"
                          className="stg-cell is-kept"
                          tabIndex={stop === key ? 0 : -1}
                          data-grade-cell={key}
                          aria-expanded={showing ? 'true' : 'false'}
                          aria-label={T.cellLabel(name, s.name, keptGrade.grade, { kept: keptGrade.keptFromEventName })}
                          onFocus={() => selectCell(row, s.id)}
                          onKeyDown={(event) => handleCellKey(row, s.id, event, true)}
                          onClick={(event) => setKept(showing ? null : { key, anchor: event.currentTarget, row, subject: keptGrade })}
                        >
                          <span className="stg-cell-value">{keptGrade.grade}</span>
                          <small>{G.keptCellLabel}</small>
                        </button>
                      </td>
                    );
                  }
                  const cell = saves.cell(row, 'grade', s.id);
                  const unsaved = cell.state === 'unsaved' || cell.state === 'retrying';
                  const retest = retestIds.has(s.id);
                  return (
                    <td key={s.id} className="stg-td">
                      <GradeCell
                        variant="grid"
                        value={cell.value}
                        letters={letters}
                        state={cell.state}
                        retest={retest}
                        tabStop={stop === key}
                        dataCell={key}
                        label={T.cellLabel(name, s.name, cell.value, { unsaved, retest })}
                        listLabel={T.gradeListLabel(s.name)}
                        open={openKey === key}
                        onOpenChange={(open) => setOpenKey(open ? key : null)}
                        onChoose={(letter) => chooseFromList(row, s.id, letter)}
                        onKeyDown={(event) => handleCellKey(row, s.id, event, false)}
                        onFocus={() => selectCell(row, s.id)}
                      />
                    </td>
                  );
                })}
                <td className="stg-num">
                  <CountBox
                    value={attended.value}
                    state={attended.state}
                    label={T.countLabel(name, T.COL_CLASSES_ATTENDED)}
                    onCommit={(value) => saves.setCount(row, 'classesAttended', value)}
                  />
                </td>
                <td className="stg-num">
                  <CountBox
                    value={assistant.value}
                    state={assistant.state}
                    label={T.countLabel(name, T.COL_ASSISTANT_CLASSES)}
                    onCommit={(value) => saves.setCount(row, 'assistantClasses', value)}
                  />
                  {aiGrade && <small className="stg-ai">{G.aiUnderCount(aiGrade)}</small>}
                </td>
                <td className="stg-total">
                  <TotalText row={row} saves={saves} />
                </td>
                <td className="stg-res">
                  <ResultTag row={row} saves={saves} isAdmin={isAdmin} onChooseSubjects={onChooseSubjects} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {kept && (
        <KeptNote
          subject={kept.subject}
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
