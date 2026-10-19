// PrivateGradingPage.jsx — one private student's grading page (mockups P7, P9; contract 0014 §5.9).
// Why it exists: a private student isn't on the testing day's Grading tab — they are graded on
// their own day, on this page. Address: #testing/event/<event id>/private/<registration id>
// (App.jsx). It opens from ⋯ → Grade private testing on the Students tab, or Open on the Events
// tab's Private testings list. The back link always goes to the event (v0.228).
//
// Top to bottom:
//   - "← November Children Testing" (back to the event's Students tab)
//   - "Private testing · Ava Chen" (+ gray "Not paid" — the fact only, never amounts, v0.183),
//     "Tue, Dec 1, 2026 · 4:00 PM · Worcester school", and an outline Print button on the right
//     (its own line on phones)
//   - a lock line (ti-lock) when the result can't change right now: before the private day,
//     and after it for staff (admins are told they still can)
//   - a card: Event, Private day, Time, Class, Testing for — then Result: the same three result
//     buttons and note button as the Grading tab (G1 / G2), 44px on touch, full width on phones;
//     before the day the buttons are grayed and the note button hidden; staff after the day see
//     the result as a read-only tag and "Note: …"
// Saving works exactly like the Grading tab (useGradingSaves.js — EventPage runs a second copy
// for this one row): one tap saves, tap again clears, no toast; a failed save shows "Not saved",
// the page banner, and retries by itself every 10 seconds and when the connection comes back.
// When the row is gone (deleted, withdrawn) or isn't private any more, the page says so instead.
// This file only DRAWS; EventPage owns the data, the dialogs and the saves.
import { IconAlertTriangle, IconArrowLeft, IconLock, IconNote, IconPrinter } from '@tabler/icons-react';
import { placeTip } from '../../../components/IconButton.jsx';
import { canChangeResults, gradingWindow } from '../../../lib/testing/gradingRules.js';
import ResultButtons, { ResultTag } from './ResultButtons.jsx';
import { TestingForCell } from './StudentDialog.jsx';
import * as T from '../text.js';

// The note button, drawn like the Grading tab's (28px square, 44px on touch, a tooltip on the PC).
function NoteButton({ row, hasNote, onNote }) {
  const name = T.studentLabel(row);
  return (
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
  );
}

// One line of the card: gray label on the left, value on the right (the detail view's style).
function CardRow({ label, children }) {
  return (
    <div className="ev-sum-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// props: event, school, classes, row (the roster row of this registration, any status, or null),
// today, isAdmin, layout, grading (useGradingSaves for this row), banners (the page's amber
// banners, drawn under the header), onBack, onOpenNote(row, opener), onPrint(opener)
export default function PrivateGradingPage({ event, school, classes, row, today, isAdmin, layout, grading, banners = null, onBack, onOpenNote, onPrint }) {
  const backLink = (
    <button type="button" className="link-button ev-back" onClick={() => onBack()}>
      {/* ti-arrow-left = back (always to the event, v0.228) */}
      <IconArrowLeft size={16} aria-hidden="true" />
      {event.name}
    </button>
  );

  // Gone (deleted, withdrawn) or back on the testing day: say so, with the back link.
  if (!row || row.status !== 'active') {
    return (
      <>
        {backLink}
        {banners}
        <p className="tempty">{T.PRIVATE_PAGE_GONE}</p>
      </>
    );
  }
  const name = T.studentLabel(row);
  if (!row.isPrivate) {
    return (
      <>
        {backLink}
        {banners}
        <p className="tempty">{T.notPrivateAnyMore(name)}</p>
      </>
    );
  }

  const cls = classes.find((c) => c.id === row.eventClassId) ?? null;
  const rank = cls?.ranks.find((r) => r.id === row.eventRankId) ?? null;
  // Before / on / after the PRIVATE day (Q2, v0.186) — not the event's testing day.
  const dayWindow = gradingWindow(today, row.privateDate);
  const showNote = canChangeResults(dayWindow, isAdmin);
  const readOnlyTag = dayWindow === 'after' && !isAdmin;
  const buttonsDisabled = dayWindow === 'before';
  const shown = grading.view(row);
  const hasNote = shown.note !== null && shown.note !== '';

  let lockLine = null;
  if (dayWindow === 'before') lockLine = T.privateGradingOpensLine(row.privateDate);
  else if (dayWindow === 'after') lockLine = isAdmin ? T.PRIVATE_OVER_ADMIN : T.PRIVATE_OVER_STAFF;

  const tags = (
    <>
      {shown.state === 'unsaved' && (
        <span className="ttag ttag--warn">
          <IconAlertTriangle size={12} aria-hidden="true" />
          {T.TAG_NOT_SAVED}
        </span>
      )}
      {shown.state === 'retrying' && <span className="ttag">{T.TAG_SAVING}</span>}
    </>
  );
  const noteButton = showNote ? <NoteButton row={row} hasNote={hasNote} onNote={onOpenNote} /> : null;
  const result = readOnlyTag ? (
    <ResultTag result={shown.result} />
  ) : (
    <ResultButtons
      name={name}
      rowId={row.id}
      value={shown.result}
      disabled={buttonsDisabled}
      layout={layout}
      onChoose={(next) => grading.chooseResult(row, next)}
    />
  );

  return (
    <>
      {backLink}
      <div className="phead pg-head">
        <div className="phead-titles">
          <div className="pg-titleline">
            <h1 className="ptitle">{T.privatePageTitle(name)}</h1>
            {/* The fact only (v0.183): never amounts or "more to collect" on a grading page */}
            {!row.paid && <span className="ttag">{T.TAG_NOT_PAID}</span>}
          </div>
          <p className="ev-summary">{T.privatePageSub(row.privateDate, row.privateTime, school)}</p>
        </div>
        <button type="button" className="btn pg-print" onClick={(clickEvent) => onPrint(clickEvent.currentTarget)}>
          {/* ti-printer = print */}
          <IconPrinter size={16} aria-hidden="true" />
          {T.PRINT}
        </button>
      </div>
      {banners}

      {lockLine && (
        <p className="gr-lockline pg-lockline">
          {/* ti-lock = the result can't be changed right now */}
          <IconLock size={16} aria-hidden="true" />
          {lockLine}
        </p>
      )}

      <div className={`clist pg-card${layout.isPhone ? ' is-phone' : ''}${layout.isTouch ? ' is-touch' : ''}`}>
        <dl className="ev-sum pg-sum">
          <CardRow label={T.DETAIL_EVENT}>{T.eventOnDate(event.name, event.testingDate)}</CardRow>
          <CardRow label={T.DETAIL_PRIVATE_DAY}>{T.longDate(row.privateDate)}</CardRow>
          <CardRow label={T.DETAIL_TIME}>{T.timeLabel(row.privateTime)}</CardRow>
          <CardRow label={T.DETAIL_CLASS}>{cls?.className ?? ''}</CardRow>
          <CardRow label={T.DETAIL_TESTING_FOR}>
            <TestingForCell rank={rank} />
          </CardRow>
        </dl>
        <div className="pg-result" role="group" aria-label={T.COL_RESULT}>
          <div className="pg-result-head">
            <span className="pg-result-label">{T.COL_RESULT}</span>
            {tags}
            {/* Phone: the note button sits on the Result line (P7) */}
            {layout.isPhone && noteButton && <span className="pg-result-note">{noteButton}</span>}
          </div>
          <div className="pg-result-line">
            {result}
            {!layout.isPhone && noteButton}
          </div>
          {hasNote && <p className="gr-sub pg-note">{readOnlyTag ? T.resultNoteLine(shown.note) : shown.note}</p>}
        </div>
      </div>

      {/* Polite announcements after each save ("Saved" / "Not saved"). */}
      <span className="visually-hidden" role="status" aria-live="polite">
        {grading.announcement}
      </span>
    </>
  );
}
