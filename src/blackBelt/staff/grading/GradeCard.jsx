// GradeCard.jsx — ONE candidate's grading on a PHONE: a line per subject of the chosen day (or per
// extra-points item), then Total and Result (contract 0025 §14.2; approved mockups G01–G04 and
// G06b phone and 320px; proposals G 10, G 13, G 14, G 18).
// Why it exists: copied in pattern from Star's GradeCard (v0.137: one candidate at a time on a
// phone, ◀ picker ▶ above it — the picker is GradingTab's). Black Belt's lines:
//
//   Stretching                          [ 7      in ]  A      a measured subject: a 92px number
//   3 credits · in · 13 and over                              field (number keypad), the database's
//                                                             grade next to it (G 10)
//   Pull-up or hold · outdoor
//   2 credits · sec · all ages
//   [ Pull-up | Hold ]                  [ 35    sec ]  A+     a two-way subject: the 44px way switch
//   Free sparring                       [ D        ▾ ]        a graded subject: the part's list (at
//   3 credits                                                 320px a bottom sheet, G02a)
//   One Step Sparring                                 —      not for this age group (G 13)
//   not for 13–17
//   Referee seminar                     [ A kept     ]        a make-up's kept grade (no list)
//   kept from Spring 2027
//   Competitions                        [ 1          ]  +3   an extra-points item: the count and the
//   1+ → 3 · 2+ → 5 …                                         points; the step rules under it (G 18)
//   ─────────────────────────────────────────────
//   Total 71 so far                          17 of 26 left
//
// A make-up's card starts with a box: the amber Make-up label, "from Spring 2027", "Retests Free
// sparring. Every other grade is kept and can't be changed here." (G 14).
// Lines are at least 52px tall; fields 44px (§2.5). Nothing moves to another candidate by itself.
//
// Props: row, columns, kind ('day'|'other'|'extra'), ctx { saves, isAdmin, rubric, submissionsDue },
//        sheetLists (true at 320px: grade lists open as a bottom sheet), onChooseSubjects(row, opener)
import { useState } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { formatMeasured, parseMeasured, unitKind } from '../../../lib/blackBelt/grading.js';
import CountBox from './CountBox.jsx';
import GradeCell from './GradeCell.jsx';
import { groupWords, lettersFor, parseMeasuredKey, resultItem, resultSubject, retestNames, rowName, unitOf, wayBracketWords, wayOf } from './model.js';
import { KeptNote, MakeupPill, ResultTag, TotalText } from './parts.jsx';
import * as T from './text.js';

// The gray line of a measured subject: "3 credits · in · 13 and over" (the bracket for this candidate).
function measuredSmall(subject, way, group) {
  return [T.creditsWords(subject.credits), unitOf(wayOf(subject, way)), wayBracketWords(wayOf(subject, way), group)].filter(Boolean).join(' · ');
}
// The step rule of an extra item: "1 point each" / "1+ → 3 · 2+ → 5 …"
function ruleWords(item) {
  const rule = item?.rule;
  if (rule?.kind === 'per_count') return T.pointsEach(rule.points_each);
  if (rule?.kind === 'steps') return T.stepsWords(Array.isArray(rule.steps) ? rule.steps : []);
  return '';
}

// One measured line: the number field (sent on Enter or when it loses focus) and the way switch.
function MeasuredLine({ row, col, saves, group, name }) {
  const s = col.subject;
  const cell = saves.cell(row, 'measured', col.id);
  const m = parseMeasuredKey(cell.value);
  const rs = resultSubject(saves.resultFor(row), col.id);
  const [draft, setDraft] = useState(null); // text while the field has focus
  const [wayDraft, setWayDraft] = useState(null); // the way chosen before a number is typed
  const [error, setError] = useState(false);
  const way = m.value !== null ? m.way : wayDraft ?? 0;
  const wayObj = wayOf(s, way);
  const unsaved = cell.state === 'unsaved' || cell.state === 'retrying';
  const settled = cell.state === null || cell.state === 'saved';
  const letter = m.value !== null && settled ? rs?.letter ?? null : null;
  const shown = draft ?? (m.value !== null ? formatMeasured(wayObj?.unit, m.value) : '');
  const ways = Array.isArray(s.ways) ? s.ways : [];

  function commit() {
    if (draft === null) return;
    const p = parseMeasured(wayObj?.unit, draft);
    if (p.status !== 'ok') {
      setError(true);
      return;
    }
    setDraft(null);
    setError(false);
    const changed = p.value === null ? m.value !== null : p.value !== m.value || way !== m.way;
    if (changed) saves.setMeasured(row, col.id, p.value, way);
  }
  function chooseWay(index) {
    if (index === way) return;
    if (m.value !== null) saves.setMeasured(row, col.id, m.value, index); // keeps the number (G 5)
    else setWayDraft(index);
  }

  return (
    <div className="bbg-line-wrap">
      <div className="bbg-line">
        <span className="bbg-line-text">
          {s.name}
          {s.outdoor === true && <span className="bbg-line-outdoor"> · {T.OUTDOOR}</span>}
          <small>
            {measuredSmall(s, way, group)}
            {unsaved && (
              <span className="bbg-warn-text">
                {' · '}
                <IconAlertTriangle size={12} aria-hidden="true" /> {T.NOT_SAVED_SHORT}
              </span>
            )}
          </small>
          {ways.length > 1 && (
            <span className="segmented bbg-ways bbg-ways--line" role="radiogroup" aria-label={T.WAY_SWITCH_LABEL(s.name)}>
              {ways.map((w, index) => (
                <button
                  key={w.name ?? index}
                  type="button"
                  role="radio"
                  aria-checked={index === way ? 'true' : 'false'}
                  className={`segment${index === way ? ' is-checked' : ''}`}
                  onClick={() => chooseWay(index)}
                >
                  {w.name}
                </button>
              ))}
            </span>
          )}
        </span>
        <span className={`bbg-numfield${unsaved ? ' is-unsaved' : ''}${letter === 'D' ? ' is-d' : ''}${rs?.retest ? ' is-retest' : ''}${error ? ' is-invalid' : ''}`}>
          <input
            type="text"
            inputMode={unitKind(wayObj?.unit) === 'minutes' ? 'text' : 'decimal'}
            autoComplete="off"
            maxLength={8}
            className="bbg-numfield-input"
            aria-label={T.numberLabel(name, s.name, T.UNIT_WORDS[unitOf(wayObj)] ?? unitOf(wayObj))}
            aria-invalid={error || unsaved ? 'true' : undefined}
            value={shown}
            onFocus={() => setDraft(shown)}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(false);
            }}
            onBlur={() => {
              commit();
              // an invalid number on leaving the field: the saved number comes back
              setDraft(null);
              setError(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(null);
                setError(false);
                event.currentTarget.blur();
              }
            }}
          />
          <span className="bbg-numfield-unit" aria-hidden="true">{unitOf(wayObj)}</span>
        </span>
        <span className={`bbg-line-letter${letter === 'D' ? ' is-d' : ''}`}>{letter ?? ''}</span>
      </div>
      {error && (
        <p className="bbg-editor-error" role="alert">
          {/* ti-alert-triangle = a problem with the number */}
          <IconAlertTriangle size={14} aria-hidden="true" />
          {T.NUMBER_RANGE}
        </p>
      )}
      {cell.note && <p className="bbg-cellnote">{cell.note}</p>}
    </div>
  );
}

export default function GradeCard({ row, columns, kind, ctx, sheetLists = false, onChooseSubjects }) {
  const { saves, rubric } = ctx;
  const [openId, setOpenId] = useState(null);
  const [keptOpenId, setKeptOpenId] = useState(null);
  const name = rowName(row);
  const result = saves.resultFor(row);
  const group = result?.age_group ?? null;

  return (
    <div className="bbg-card" role="group" aria-label={name}>
      {row.isMakeup && (
        <div className="bbg-card-makeup">
          <MakeupPill /> <b>{T.makeupCardFrom(row.makeupOfCycleName ?? '')}</b> {T.makeupCardText(retestNames(result, rubric))}
        </div>
      )}
      {columns.map((col) => {
        if (col.item) {
          const cell = saves.cell(row, 'count', col.id);
          const item = resultItem(result, col.id);
          const settled = cell.state === null || cell.state === 'saved';
          const unsaved = cell.state === 'unsaved' || cell.state === 'retrying';
          if (item?.kept) {
            return (
              <div key={col.id} className="bbg-line">
                <span className="bbg-line-text">
                  {col.item.name}
                  <small>{T.keptFromLine(row.makeupOfCycleName ?? '')}</small>
                </span>
                <span className="bbg-linefield bbg-keptfield">{item.count}</span>
                <span className="bbg-line-points">{T.keptPlus(item.points)}</span>
              </div>
            );
          }
          return (
            <div key={col.id} className="bbg-line-wrap">
              <div className="bbg-line">
                <span className="bbg-line-text">
                  {col.item.name}
                  <small>
                    {ruleWords(col.item)}
                    {unsaved && (
                      <span className="bbg-warn-text">
                        {' · '}
                        <IconAlertTriangle size={12} aria-hidden="true" /> {T.NOT_SAVED_SHORT}
                      </span>
                    )}
                  </small>
                </span>
                <CountBox variant="line" value={cell.value} state={cell.state} label={T.countLabel(name, col.item.name)} onCommit={(value) => saves.setCount(row, col.id, value)} />
                <span className={`bbg-line-points${item?.points ? '' : ' is-zero'}`}>
                  {cell.value !== null && settled && item ? T.plusPoints(item.points) : T.EMPTY_CELL}
                </span>
              </div>
              {cell.note && <p className="bbg-cellnote">{cell.note}</p>}
            </div>
          );
        }
        const s = col.subject;
        const rs = resultSubject(result, col.id);
        if (!rs || !rs.applies) {
          return (
            <div key={col.id} className="bbg-line">
              <span className="bbg-line-text">
                {s.name}
                <small>{T.notForAgeLine(groupWords(result))}</small>
              </span>
              <span className="bbg-line-na" aria-hidden="true">{T.NOT_FOR_AGE}</span>
            </div>
          );
        }
        if (rs.kept) {
          const noteId = `bbg-kept-${row.id}-${col.id}`;
          return (
            <div key={col.id} className="bbg-line-wrap">
              <div className="bbg-line">
                <span className="bbg-line-text">
                  {s.name}
                  <small>{T.keptFromLine(rs.kept_from_cycle_name ?? row.makeupOfCycleName ?? '')}</small>
                </span>
                <button
                  type="button"
                  className="bbg-linefield bbg-keptfield"
                  aria-expanded={keptOpenId === col.id ? 'true' : 'false'}
                  aria-controls={keptOpenId === col.id ? noteId : undefined}
                  aria-label={T.cellLabel(name, s.name, rs.letter, { kept: rs.kept_from_cycle_name })}
                  onClick={() => setKeptOpenId(keptOpenId === col.id ? null : col.id)}
                >
                  {T.keptLine(rs.letter)}
                </button>
              </div>
              {keptOpenId === col.id && (
                <KeptNote id={noteId} cycleName={rs.kept_from_cycle_name ?? row.makeupOfCycleName} value={rs.letter} variant="line" onClose={() => setKeptOpenId(null)} />
              )}
            </div>
          );
        }
        if (s.scoring === 'measured') return <MeasuredLine key={col.id} row={row} col={col} saves={saves} group={group} name={name} />;
        const cell = saves.cell(row, 'grade', col.id);
        const unsaved = cell.state === 'unsaved' || cell.state === 'retrying';
        const small = [T.creditsWords(s.credits), s.handed_in === true ? T.HANDED_IN : null].filter(Boolean).join(' · ');
        return (
          <div key={col.id} className="bbg-line-wrap">
            <div className="bbg-line">
              <span className="bbg-line-text">
                {s.name}
                <small>
                  {small}
                  {unsaved && (
                    <span className="bbg-warn-text">
                      {' · '}
                      <IconAlertTriangle size={12} aria-hidden="true" /> {T.NOT_SAVED_SHORT}
                    </span>
                  )}
                </small>
              </span>
              <GradeCell
                variant="line"
                value={cell.value}
                letters={lettersFor(col)}
                state={cell.state}
                retest={rs.retest === true}
                late={rs.late === true}
                asSheet={sheetLists}
                sheetTitle={`${s.name} · ${name}`}
                sheetSub={`${col.partName} · ${T.creditsWords(s.credits)}`}
                label={T.cellLabel(name, s.name, cell.value, { unsaved, retest: rs.retest, late: rs.late })}
                listLabel={T.gradeListLabel(s.name)}
                open={openId === col.id}
                onOpenChange={(open) => setOpenId(open ? col.id : null)}
                onChoose={(letter) => {
                  if (letter !== cell.value) saves.setGrade(row, col.id, letter);
                }}
              />
            </div>
            {cell.note && <p className="bbg-cellnote">{cell.note}</p>}
          </div>
        );
      })}
      <div className="bbg-card-total">
        <span className="bbg-card-totaltext">
          {kind === 'extra' && result?.extra && (
            <>
              {T.EXTRA_WORD} {T.plusPoints(result.extra.total)}
              {' · '}
            </>
          )}
          {T.TOTAL_LINE} <TotalText row={row} saves={saves} inline />
        </span>
        <ResultTag row={row} ctx={ctx} onChooseSubjects={onChooseSubjects} />
      </div>
    </div>
  );
}
