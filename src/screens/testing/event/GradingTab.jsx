// GradingTab.jsx — the Grading tab of a testing event's page (G1–G7, rulebook v0.180–v0.192).
// Why it exists: on the testing day graders record each student's result on a tablet or phone
// at the mat: one tap on Pass / Not passed / No show, tap the chosen button again to clear it.
// There is no Save button and no toast — each tap saves by itself (useGradingSaves.js).
//
// Top to bottom (G1):
//   - "All classes: 14 students · 6 passed · …" so nobody leaves the mat with a class missed
//   - the class switch (the same one as on Students; a class with unsaved results gets an amber
//     triangle) and the class line (time, count, gear) with "Print grading sheet" on the right
//   - a lock line when results can't be changed right now (before the day; after the day)
//   - the class's count line, then one row per active student, in belt order:
//       name · gray "Not paid" (the fact only, v0.183) · amber "Not saved" or gray "Saving…" ·
//       the note in gray · "Testing for" with belt pictures · the three result buttons (or, for
//       staff after the testing day, a read-only tag) · the note button
//   PC / tablet: a table (Student · Testing for · Result). Phone: stacked rows, the three
//   buttons full width.
// When results can change (contract 0010 §4.4):
//   before the day   buttons grayed, no note button, "Grading opens on the testing day, …"
//   on the day       everyone
//   after the day    admins only; staff see read-only tags
// Classes that test together (v0.193): classes with the same start AND end time are one
// "testing group" here — one choice in the switch ("Group B + C", count = both), the class line
// "Group B + Group C · 6:00 – 7:00 PM", and the list shows each class under a small heading
// ("Group B · 3 students"), each in belt order. A class with its own time works as before.
// The Students tab stays one class at a time; both tabs share the class choice (a group is
// chosen through its first class).
// This file only DRAWS; EventPage owns the class choice and the dialogs, useGradingSaves the saves.
import { IconAlertTriangle, IconLock, IconNote, IconPrinter } from '@tabler/icons-react';
import { placeTip } from '../../../components/IconButton.jsx';
import { classTimeLabel } from '../../../lib/testing/eventRules.js';
import { canChangeResults, gradingWindow, groupOfClass, resultCounts, testingGroups } from '../../../lib/testing/gradingRules.js';
import ChoiceGroup from '../events/ChoiceGroup.jsx';
import ResultButtons, { ResultTag } from './ResultButtons.jsx';
import { TestingForCell } from './StudentDialog.jsx';
import * as T from '../text.js';

// One student row.
function GradingRow({ row, shown, rank, readOnlyTags, showNote, buttonsDisabled, layout, onChoose, onNote }) {
  const name = T.studentLabel(row);
  const hasNote = shown.note !== null;
  const tags = (
    <>
      {!row.paid && <span className="ttag">{T.TAG_NOT_PAID}</span>}
      {shown.state === 'unsaved' && (
        <span className="ttag ttag--warn">
          <IconAlertTriangle size={12} aria-hidden="true" />
          {T.TAG_NOT_SAVED}
        </span>
      )}
      {shown.state === 'retrying' && <span className="ttag">{T.TAG_SAVING}</span>}
    </>
  );
  const subLines = (
    <>
      {hasNote && <span className="gr-sub">{shown.note}</span>}
      {row.addedAfterDay && <span className="gr-sub">{T.addedAfterDayLine(row.addedAfterDay.date, row.addedAfterDay.byName)}</span>}
    </>
  );
  const result = readOnlyTags ? (
    <ResultTag result={shown.result} />
  ) : (
    <ResultButtons name={name} rowId={row.id} value={shown.result} disabled={buttonsDisabled} layout={layout} onChoose={(next) => onChoose(row, next)} />
  );
  // The note button: drawn like IconButton (28px square, 44px on touch, dark tooltip on the PC),
  // but its tooltip is the short "Add note" / "Edit note" while screen readers hear the
  // student's name too ("Add note for Mia Lopez"). Outline when there's no note, blue when
  // there is one.
  const noteButton = showNote ? (
    <button
      type="button"
      className={`tib gr-note-btn${hasNote ? ' has-note' : ''}`}
      aria-label={hasNote ? T.editNoteLabel(name) : T.addNoteLabel(name)}
      data-note-btn={row.id}
      onPointerEnter={placeTip}
      onFocus={placeTip}
      onClick={(clickEvent) => onNote(row, clickEvent.currentTarget)}
    >
      <span className="tib-box">
        {/* ti-note = grading note */}
        <IconNote size={16} aria-hidden="true" />
      </span>
      <span className="tib-tip" aria-hidden="true">
        {hasNote ? T.EDIT_NOTE_TIP : T.ADD_NOTE_TIP}
      </span>
    </button>
  ) : (
    <span className="gr-note-spacer" aria-hidden="true" />
  );

  if (layout.isPhone) {
    return (
      <div className="gr-row is-phone" role="row" aria-label={name}>
        <span className="gr-phone-main" role="cell">
          <span className="gr-l1">
            <span className="gr-name-tags">
              <span className="ev-sname">{name}</span>
              {tags}
            </span>
            {noteButton}
          </span>
          <TestingForCell rank={rank} />
          {subLines}
          <span className="gr-phone-result">{result}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="gr-row" role="row" aria-label={name}>
      <span className="gr-cell gr-student" role="cell">
        <span className="gr-name-tags">
          <span className="ev-sname">{name}</span>
          {tags}
        </span>
        {subLines}
      </span>
      <span className="gr-cell gr-tf" role="cell">
        <TestingForCell rank={rank} />
      </span>
      <span className="gr-cell gr-result" role="cell">
        {result}
      </span>
      <span className="gr-cell gr-notecell" role="cell">
        {noteButton}
      </span>
    </div>
  );
}

// props: event, classes, rows (ACTIVE roster rows of the whole event, roster order), today,
// isAdmin, layout, classSel (the chosen class id — its testing group shows), onClassSel, grading,
// onOpenNote(row, opener), onPrint(opener), panelId, tabId
export default function GradingTab({ event, classes, rows, today, isAdmin, layout, classSel, onClassSel, grading, onOpenNote, onPrint, panelId, tabId }) {
  // Before / on / after the testing day ("dayWindow": the name `window` is the browser's own).
  const dayWindow = gradingWindow(today, event.testingDate);
  const showNote = canChangeResults(dayWindow, isAdmin); // the note button only when notes can change
  const readOnlyTags = dayWindow === 'after' && !isAdmin;
  const buttonsDisabled = dayWindow === 'before';

  // The values on screen (an unsaved tap counts as tapped, G5).
  const shownRows = rows.map((r) => ({ ...r, ...grading.view(r) }));
  const rankById = new Map(classes.flatMap((c) => c.ranks.map((r) => [r.id, r])));
  const countByClass = new Map(classes.map((c) => [c.id, 0]));
  for (const r of rows) countByClass.set(r.eventClassId, (countByClass.get(r.eventClassId) ?? 0) + 1);
  // The testing groups (v0.193) and the one chosen: the group of the chosen class.
  const groups = testingGroups(classes);
  const group = groupOfClass(groups, classSel) ?? groups[0] ?? null;
  const groupClasses = group ? group.classes : [];
  const names = groupClasses.map((c) => c.className);
  const classRows = group ? shownRows.filter((r) => group.classIds.includes(r.eventClassId)) : [];
  const unsavedClasses = new Set(grading.unsavedClassIds);
  const classLabelId = `${panelId}-class-label`;

  let lockLine = null;
  if (dayWindow === 'before') lockLine = T.gradingOpensLine(event.testingDate);
  else if (dayWindow === 'after') lockLine = isAdmin ? T.GRADING_OVER_ADMIN : T.GRADING_OVER_STAFF;

  let body;
  if (classes.length === 0) {
    body = <p className="tempty">{T.NO_CLASSES_IN_EVENT}</p>;
  } else if (rows.length === 0) {
    // G7: nobody at the event yet — no counts, no class switch, no Print.
    body = <p className="tempty">{T.NO_STUDENTS_AT_EVENT}</p>;
  } else {
    const first = groupClasses[0] ?? null;
    const time = first ? classTimeLabel(first.startTime, first.endTime) : '';
    // Sparring gear: one tag when the group's classes agree, else one tag per class
    // ("Group B: Sparring gear", "Group C: No sparring gear").
    const gearTexts = groupClasses.map((c) => gearText(c));
    const gearTags =
      new Set(gearTexts).size <= 1 ? gearTexts.slice(0, 1) : groupClasses.map((c, i) => T.classGearTag(c.className, gearTexts[i]));
    const isGroup = groupClasses.length > 1;
    const printButton = classRows.length > 0 && (
      <button type="button" className="btn gr-print" onClick={(clickEvent) => onPrint(clickEvent.currentTarget)}>
        {/* ti-printer = print */}
        <IconPrinter size={16} aria-hidden="true" />
        {T.PRINT_GRADING_SHEET}
      </button>
    );
    body = (
      <>
        <p className="gr-allline">{T.allClassesLine(resultCounts(shownRows))}</p>
        <span id={classLabelId} className="visually-hidden">
          {T.CLASS_SWITCH_LABEL}
        </span>
        <div className="ev-class-switch">
          <ChoiceGroup
            labelId={classLabelId}
            value={group?.id ?? null}
            onChange={onClassSel}
            options={groups.map((g) => {
              const count = g.classIds.reduce((sum, id) => sum + (countByClass.get(id) ?? 0), 0);
              const unsaved = g.classIds.some((id) => unsavedClasses.has(id));
              const label = T.groupChoiceLabel(g.classes.map((c) => c.className));
              return {
                key: g.id,
                label: `${label} ${count}${unsaved ? `, ${T.classUnsavedLabel}` : ''}`,
                content: (
                  <>
                    <span className="ev-cs-name">
                      {label}
                      {/* ti-alert-triangle = this class has results not saved (G5) */}
                      {unsaved && <IconAlertTriangle size={14} aria-hidden="true" className="gr-cs-warn" />}
                    </span>
                    <span className="ev-cs-count">{count}</span>
                  </>
                ),
              };
            })}
          />
        </div>
        {group && (
          <div className="gr-classline">
            <p className="ev-classline gr-classline-text">
              <strong>{T.classLineTitle(T.groupFullName(names), time)}</strong>
              <span>{T.studentsCount(classRows.length)}</span>
              {gearTags.map((text) => (
                <span key={text} className="ttag">
                  {text}
                </span>
              ))}
            </p>
            {printButton}
          </div>
        )}
        {lockLine && classRows.length > 0 && (
          <p className="gr-lockline">
            {/* ti-lock = results can't be changed right now */}
            <IconLock size={16} aria-hidden="true" />
            {lockLine}
          </p>
        )}
        {group && classRows.length === 0 ? (
          // G7: the message sits in the same bordered card as the table would
          <div className="clist gr-table">
            <p className="gr-empty">{T.noStudentsInClass(T.groupFullName(names))}</p>
          </div>
        ) : (
          <>
            <p className="gr-countline">{T.resultCountLine(resultCounts(classRows))}</p>
            <div
              className={`clist gr-table${layout.isPhone ? ' is-phone' : ''}${layout.isTouch ? ' is-touch' : ''}`}
              role="table"
              aria-label={group ? T.groupFullName(names) : T.TAB_GRADING}
            >
              {!layout.isPhone && (
                <div className="gr-row gr-head" role="row">
                  <span role="columnheader">{T.COL_STUDENT}</span>
                  <span role="columnheader">{T.COL_TESTING_FOR}</span>
                  <span role="columnheader" className="gr-head-result">
                    {T.COL_RESULT}
                  </span>
                  <span role="columnheader" aria-label={T.ACTIONS_COL} />
                </div>
              )}
              {groupClasses.map((cls) => {
                const mine = classRows.filter((r) => r.eventClassId === cls.id);
                // In a group, a class with nobody in it is left out (the group still has students).
                if (isGroup && mine.length === 0) return null;
                return (
                  <div key={cls.id} role="rowgroup" aria-label={isGroup ? cls.className : undefined}>
                    {/* v0.193: a small heading per class when classes test together */}
                    {isGroup && (
                      <div className="gr-subhead" role="row">
                        <span role="cell">{T.groupClassHeading(cls.className, mine.length)}</span>
                      </div>
                    )}
                    {mine.map((row) => (
                      <GradingRow
                        key={row.id}
                        row={row}
                        shown={grading.view(row)}
                        rank={rankById.get(row.eventRankId)}
                        readOnlyTags={readOnlyTags}
                        showNote={showNote}
                        buttonsDisabled={buttonsDisabled}
                        layout={layout}
                        onChoose={grading.chooseResult}
                        onNote={onOpenNote}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="gr-panel">
      {body}
      {/* Polite announcements after each result save ("Saved" / "Not saved"). */}
      <span className="visually-hidden" role="status" aria-live="polite">
        {grading.announcement}
      </span>
    </div>
  );
}

// The class line's gear tag (same rule as the Students tab).
function gearText(cls) {
  const needing = cls.ranks.filter((r) => r.sparringGear);
  if (needing.length === 0) return T.NO_SPARRING_GEAR;
  if (needing.length === cls.ranks.length) return T.SPARRING_GEAR;
  return T.sparringFrom(needing[0].name);
}
