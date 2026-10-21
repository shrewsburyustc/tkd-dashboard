// GradeCard.jsx — ONE candidate's grading as a single column: a line per subject with its credits
// and a grade dropdown, the two class counts, then Total and Result.
// Why it exists: two screens grade one candidate at a time —
//   * the Grading tab on a PHONE (v0.137, proposal 24: one candidate at a time, ◀ ▶ and a picker
//     above this card — the picker is GradingTab's, not this card's), and
//   * the PRIVATE grading page (v0.151, proposal 18–19: one column, at most 520px, on every device;
//     built in phase 5 by the private page, which drops this card in under its own header).
// Both must look and behave the same, with the grid's save states (proposal 19), so the card is
// one component.
//
//   White–Deputy Curriculum                 [B+ ▾]
//   15 credits
//   Breaking                                [D  ▾]   (amber field with ⚠ when Not saved)
//   5 credits · ⚠ Not saved
//   Advanced Motion                         B+ kept  (a make-up's kept grade: no ▾, proposal 9;
//   5 credits · kept from Spring 2026                 tapping shows the note under the line)
//   Classes attended                        [ 22 ]
//   Assistant classes                       [ 12 ]
//   Assistant Instructor: B
//   ─────────────────────────────────────────────
//   Total 230                      ⚠ Make-up · D in Breaking
//
// Lines are 52px tall with 44px list items on touch (proposal 19). A retest subject's field has the
// 1px blue outline (proposal 29). Nothing moves to another candidate by itself (proposal 24).
//
// ===== API (for the private grading page) =====
//   <GradeCard row subjects letters saves isAdmin onChooseSubjects />
//   row        a gradingApi GridRow (loadGrading's row, or loadPrivateGrading's row) — must also be in
//              the `rows` given to the page's ONE useStarGradingSaves, so its saves are counted
//   subjects   the judged subjects in order: gradingApi.judgedSubjects(copy, row.dan)
//   letters    gradingApi.gradeLetters(copy)
//   saves      the page's useStarGradingSaves() result (cell, resultFor, rowSave, chooseGrade,
//              setCount, clearNote)
//   isAdmin    shows the "Choose subjects" link to admins (proposal 25)
//   onChooseSubjects(row, opener)   open MakeupChoiceDialog (admins); omit to hide the link
//   label      optional accessible name of the card (e.g. "Alex Kim's grades")
import { useState } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { keptSubject, toggleGrade } from '../../../../lib/star/gradingApi.js';
import GradeCell from './GradeCell.jsx';
import CountBox from './CountBox.jsx';
import { KeptNote, ResultTag, TotalText } from './parts.jsx';
import * as T from './text.js';

const { G } = T;

export default function GradeCard({ row, subjects, letters, saves, isAdmin, onChooseSubjects, label }) {
  const [openId, setOpenId] = useState(null); // the subject whose list is open
  const [keptOpenId, setKeptOpenId] = useState(null); // the kept subject whose note shows
  const name = `${row.firstName} ${row.lastName}`;
  const result = saves.resultFor(row);
  const retestIds = new Set((result?.subjects ?? []).filter((s) => s.retest).map((s) => s.eventCategoryId));
  const ai = result?.ai ?? null;
  const assistant = saves.cell(row, 'count', 'assistantClasses');
  const attended = saves.cell(row, 'count', 'classesAttended');
  const assistantSettled = assistant.state === null || assistant.state === 'saved';

  return (
    <div className="stg-card" role="group" aria-label={label ?? name}>
      {subjects.map((subject) => {
        const kept = keptSubject(row, subject.id);
        const cell = saves.cell(row, 'grade', subject.id);
        const unsaved = cell.state === 'unsaved' || cell.state === 'retrying';
        const noteId = `stg-kept-${row.id}-${subject.id}`;
        return (
          <div key={subject.id} className="stg-line-wrap">
            <div className="stg-line">
              <span className="stg-line-text">
                {subject.name}
                <small>
                  {T.creditsLine(subject.credits)}
                  {kept && ` · ${G.keptFromLine(kept.keptFromEventName ?? '')}`}
                  {unsaved && (
                    <span className="stg-warn-text">
                      {' · '}
                      <IconAlertTriangle size={12} aria-hidden="true" /> {G.NOT_SAVED_SHORT.replace(/^⚠\s*/, '')}
                    </span>
                  )}
                </small>
              </span>
              {kept ? (
                <button
                  type="button"
                  className="stg-linefield stg-keptfield"
                  aria-expanded={keptOpenId === subject.id ? 'true' : 'false'}
                  aria-controls={keptOpenId === subject.id ? noteId : undefined}
                  aria-label={T.cellLabel(name, subject.name, kept.grade, { kept: kept.keptFromEventName })}
                  onClick={() => setKeptOpenId(keptOpenId === subject.id ? null : subject.id)}
                >
                  {G.keptLine(kept.grade)}
                </button>
              ) : (
                <GradeCell
                  variant="line"
                  value={cell.value}
                  letters={letters}
                  state={cell.state}
                  retest={retestIds.has(subject.id)}
                  label={T.cellLabel(name, subject.name, cell.value, { unsaved, retest: retestIds.has(subject.id) })}
                  listLabel={T.gradeListLabel(subject.name)}
                  open={openId === subject.id}
                  onOpenChange={(open) => setOpenId(open ? subject.id : null)}
                  onChoose={(letter) => saves.chooseGrade(row, subject.id, toggleGrade(cell.value, letter))}
                />
              )}
            </div>
            {kept && keptOpenId === subject.id && <KeptNote id={noteId} subject={kept} variant="line" onClose={() => setKeptOpenId(null)} />}
            {cell.note && <p className="stg-cellnote">{cell.note}</p>}
          </div>
        );
      })}
      <div className="stg-line">
        <span className="stg-line-text">{T.COL_CLASSES_ATTENDED}</span>
        <CountBox
          variant="line"
          value={attended.value}
          state={attended.state}
          label={T.countLabel(name, T.COL_CLASSES_ATTENDED)}
          onCommit={(value) => saves.setCount(row, 'classesAttended', value)}
        />
      </div>
      {attended.note && <p className="stg-cellnote">{attended.note}</p>}
      <div className="stg-line">
        <span className="stg-line-text">
          {T.COL_ASSISTANT_CLASSES}
          {/* The Assistant Instructor grade appears once the count is saved (proposal 30). */}
          {assistant.value !== null && assistantSettled && ai?.grade && <small>{G.aiLine(ai.grade)}</small>}
        </span>
        <CountBox
          variant="line"
          value={assistant.value}
          state={assistant.state}
          label={T.countLabel(name, T.COL_ASSISTANT_CLASSES)}
          onCommit={(value) => saves.setCount(row, 'assistantClasses', value)}
        />
      </div>
      {assistant.note && <p className="stg-cellnote">{assistant.note}</p>}
      <div className="stg-card-total">
        <span className="stg-card-totaltext">
          {T.TOTAL_LINE} <TotalText row={row} saves={saves} />
        </span>
        <ResultTag row={row} saves={saves} isAdmin={isAdmin} onChooseSubjects={onChooseSubjects} />
      </div>
    </div>
  );
}
