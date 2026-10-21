// PrivateGradingPage.jsx — one private testing's grading page (mockup P6, contract 0014 §5.6).
// Why it exists: a private testing is graded on its own day, on its own page — not on an event's
// Grading tab. Address: #testing/private/<id> (App.jsx); it opens from ⋯ → Grade on the Private
// testing tab, or from ⋯ → Open private testing on an event's moved Removed row. The back link
// always goes to the Private testing tab.
//
// Top to bottom:
//   - "← Private testing" (back to the tab)
//   - "Private testing · Ava Chen" (+ gray "Not paid" while anything is owed — the fact only,
//     never an amount, v0.183), "Tue, Dec 1, 2026 · 4:00 PM · Worcester school", and an outline
//     Print button on the right (its own line on phones)
//   - a lock line (ti-lock) when the result can't change right now: before the private day, after
//     it for staff (admins are told they still can), or when the testing was cancelled
//   - a card: Day, Time, Class, Testing for — then Result: the three result buttons and the note
//     button of the Grading tab (G1 / G2), 44px on touch, full width on phones; before the day the
//     buttons are grayed and the note button hidden; staff after the day see the result as a tag
//     and "Note: …"
// Saving works exactly like the Grading tab (event/useGradingSaves.js with privateApi's save
// functions): one tap saves, tap again clears, no toast; a failed save shows "Not saved" and the
// banner and retries by itself every 10 seconds and when the connection comes back. While a result
// is Not saved, leaving asks first (the leave guard, as on the event page) and closing the browser
// tab shows the browser's own question.
// The page reloads every 15 seconds (v0.157). Deleted → "This private testing was deleted, or the
// link is wrong." A private testing of the other school closes the page, like the event page does.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconArrowLeft, IconLock, IconNote, IconPrinter } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import { placeTip } from '../../../components/IconButton.jsx';
import { LOCATION_CODE } from '../../../lib/device.js';
import { canChangeResults, gradingWindow } from '../../../lib/testing/gradingRules.js';
import { loadPrivateTesting, setPrivateResult, setPrivateResultNote } from '../../../lib/testing/privateApi.js';
import { PHONE_QUERY, TOUCH_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../events/useLiveLoad.js';
import NoteDialog, { checkNote, isNoteDirty } from '../event/NoteDialog.jsx';
import ResultButtons, { ResultTag } from '../event/ResultButtons.jsx';
import { TestingForCell } from '../event/StudentDialog.jsx';
import { useGradingSaves } from '../event/useGradingSaves.js';
import PrivateSheet from './PrivateSheet.jsx';
import { rankViewOf } from './PrivateRows.jsx';
import * as T from '../text.js';
import '../../../styles/testing-private.css';

// The save engine works with registrations and classes; a private testing is one row in its own
// "class" (its class name shows in the banner and the leave question).
const ENGINE_CLASS_ID = 'private';
// privateApi's save functions, called the way the engine calls eventsApi's.
const saveResult = ({ registrationId, result }) => setPrivateResult({ privateId: registrationId, result });
const saveNoteCall = ({ registrationId, note }) => setPrivateResultNote({ privateId: registrationId, note });

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
      onClick={(clickEvent) => onNote(clickEvent.currentTarget)}
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

export default function PrivateGradingPage({
  privateId,
  school,
  isAdmin,
  screenLocked,
  onNoAccess,
  onClosePrivate, // (options) => void — the back link; { replace: true } when the page closes itself
  onLeaveGuardChange, // (fn | null) => void — App.jsx asks fn before leaving this page
  onModalOpenChange,
}) {
  const live = useLiveLoad({ key: privateId, enabled: !screenLocked, load: loadPrivateTesting, refreshMs: LIVE_REFRESH_MS });
  const data = live.data;
  const row = data?.row ?? null;
  const today = data?.today ?? '';
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });

  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const layout = { isPhone, isTouch };
  const baseId = useId();

  const [banner, setBanner] = useState(null); // { text, retry? }
  const [dialog, setDialog] = useState(null); // the note dialog or the leave question
  const [printing, setPrinting] = useState(null); // { printedAt, opener } while the sheet prints
  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
  });

  async function reloadQuiet() {
    const result = await liveRef.current.reload();
    if (result === 'error') setBanner({ text: T.LOAD_PRIVATE_FAILED, retry: () => liveRef.current.reload().then((r) => r === 'ok' && setBanner(null)) });
    return result;
  }

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  // A private testing of the other school (the switcher was changed, or a link from the other
  // school's device): close the page, as the event page does — not asked again (the school
  // change itself was already guarded).
  const wrongSchool = row !== null && row.locationCode !== LOCATION_CODE[school];
  useEffect(() => {
    if (wrongSchool) onClosePrivate({ replace: true });
  }, [wrongSchool, onClosePrivate]);

  // ----- Grading -----
  const active = row !== null && row.status === 'active';
  const dayWindow = row ? gradingWindow(today, row.privateDate) : 'before';
  const engineRow = active ? { ...row, eventClassId: ENGINE_CLASS_ID } : null;
  const grading = useGradingSaves({
    roster: engineRow ? [engineRow] : [],
    classes: [{ id: ENGINE_CLASS_ID, className: row?.className ?? '' }],
    loadedAt: data?.startedAt ?? null,
    reload: () => reloadQuiet(),
    onNoAccess,
    showPageBanner: (text) => setBanner({ text }),
    isReadOnly: !active || !canChangeResults(dayWindow, isAdmin),
    screenLocked,
    saveResult,
    saveNote: saveNoteCall,
  });

  // ----- The note dialog (G2) -----
  function openNote(opener) {
    if (!engineRow) return;
    const saved = grading.view(engineRow).note;
    const values = { text: saved ?? '' };
    setDialog({ type: 'note', key: Date.now(), values, initial: values, touched: {}, note: null, saving: false, blocked: false, opener });
  }
  function patchDialog(patch) {
    setDialog((current) => (current ? { ...current, ...patch } : current));
  }
  function closeDialog() {
    const d = dialogRef.current;
    setDialog(null);
    if (d?.type === 'note') window.requestAnimationFrame(() => (document.querySelector(`[data-note-btn="${privateId}"]`) ?? d.opener)?.focus());
    else d?.opener?.focus?.();
  }
  function requestCloseNote() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    if (!isNoteDirty(d)) closeDialog();
    else patchDialog({ note: 'UNSAVED' });
  }
  async function saveNote() {
    const d = dialogRef.current;
    if (!d || d.saving || d.type !== 'note' || !engineRow) return;
    if (!checkNote(d, grading.view(engineRow).note).canSave) return;
    patchDialog({ saving: true, note: null });
    const status = await grading.saveNote(engineRow, d.values.text);
    if (status === 'ok') closeDialog();
    else if (status === 'invalid') patchDialog({ saving: false, note: 'NOTE_BAD_CHARACTER' });
    else if (status === 'finished' || status === 'not_open' || status === 'cancelled') {
      setDialog(null);
      setBanner({ text: status === 'finished' ? T.TOO_LATE_RESULTS : status === 'not_open' ? T.GRADING_NOT_OPEN : T.PRIVATE_IS_CANCELLED });
      reloadQuiet();
    } else if (status === 'not_found') {
      setDialog(null);
      reloadQuiet();
    } else if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else patchDialog({ saving: false, note: 'NOTE_SAVE_FAILED' });
  }

  // ----- Leaving while the result is Not saved (as the event page, contract 0010 §4.9) -----
  const guardRef = useRef(null);
  guardRef.current = (proceed) => {
    if (grading.unsavedCount === 0) return false;
    if (dialogRef.current?.type === 'leave') return true; // already asking
    const list = grading.unsavedRows();
    const groups = [{ className: row?.className ?? '', names: list.map((item) => item.name) }];
    const opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    setDialog({ type: 'leave', key: Date.now(), proceed, count: list.length, body: T.leaveBody(groups), opener });
    return true;
  };
  const leaveGuard = useCallback((proceed) => guardRef.current(proceed), []);
  useEffect(() => {
    if (!onLeaveGuardChange) return undefined;
    onLeaveGuardChange(leaveGuard);
    return () => onLeaveGuardChange(null);
  }, [onLeaveGuardChange, leaveGuard]);
  function leaveAnyway() {
    const d = dialogRef.current;
    if (!d || d.type !== 'leave') return;
    setDialog(null);
    // The dialog's history step goes away as it closes (Dialog.jsx): wait for that, then leave.
    const proceed = d.proceed;
    window.setTimeout(() => {
      if (!window.history.state?.tkdDialog) {
        proceed();
        return;
      }
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        window.removeEventListener('popstate', go);
        proceed();
      };
      window.addEventListener('popstate', go);
      window.setTimeout(go, 400);
    }, 0);
  }

  // Closing or reloading the browser tab while something is unsaved: the browser's own question.
  const hasUnsaved = grading.unsavedCount > 0;
  useEffect(() => {
    if (!hasUnsaved) return undefined;
    function handleBeforeUnload(unloadEvent) {
      unloadEvent.preventDefault();
      unloadEvent.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsaved]);

  // A dialog makes the page behind it inert (App.jsx); locking only hides it.
  const modalShown = dialog !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange?.(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange?.(false), [onModalOpenChange]);

  // ----- Print: draw the sheet, print, remove it again -----
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => {
      setPrinting(null);
      printing.opener?.focus?.();
    };
    window.addEventListener('afterprint', done);
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  // ===== Drawing =====
  const backLink = (
    <button type="button" className="link-button ev-back" onClick={() => onClosePrivate()}>
      {/* ti-arrow-left = back to the Private testing tab */}
      <IconArrowLeft size={16} aria-hidden="true" />
      {T.BACK_TO_PRIVATE}
    </button>
  );

  if (live.status === 'loading' || live.status === 'idle' || live.status === 'noAccess' || wrongSchool) {
    return (
      <>
        {backLink}
        <div className="clist tskeleton ev-page-skeleton" aria-busy="true">
          <span className="visually-hidden">{T.LOADING_PRIVATE_PAGE}</span>
          {[0, 1, 2].map((index) => (
            <div key={index} className="tskeleton-row" aria-hidden="true">
              <span className="tskeleton-bar" />
            </div>
          ))}
        </div>
      </>
    );
  }
  if (live.status === 'notFound') {
    return (
      <>
        {backLink}
        <p className="tempty">{T.PRIVATE_PAGE_GONE}</p>
      </>
    );
  }
  if (live.status === 'error' || !row) {
    return (
      <>
        {backLink}
        <ErrorBanner text={T.LOAD_PRIVATE_FAILED} onRetry={() => liveRef.current.reload()} />
      </>
    );
  }

  const name = T.studentLabel(row);
  const shown = engineRow ? grading.view(engineRow) : { result: row.result ?? null, note: row.note ?? null, state: null };
  const hasNote = shown.note !== null && shown.note !== '';
  const showNote = active && canChangeResults(dayWindow, isAdmin);
  const readOnlyTag = !active || (dayWindow === 'after' && !isAdmin);
  const buttonsDisabled = dayWindow === 'before';

  let lockLine = null;
  if (!active) lockLine = T.PRIVATE_CANCELLED_LINE;
  else if (dayWindow === 'before') lockLine = T.privateGradingOpensLine(row.privateDate);
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
  const noteButton = showNote ? <NoteButton row={row} hasNote={hasNote} onNote={openNote} /> : null;
  const result = readOnlyTag ? (
    <ResultTag result={shown.result} />
  ) : (
    <ResultButtons name={name} rowId={row.id} value={shown.result} disabled={buttonsDisabled} layout={layout} onChoose={(next) => grading.chooseResult(engineRow, next)} />
  );

  let dialogElement = null;
  if (dialog && !screenLocked && dialog.type === 'note') {
    const toName = row.testingFor?.kind === 'rank' ? row.testingFor.name : T.NO_NEW_RANK;
    dialogElement = (
      <NoteDialog
        key={dialog.key}
        state={dialog}
        name={name}
        subtitle={T.noteSub(row.className, row.rankName, toName, shown.result ? T.resultButtonText(shown.result) : T.NOT_RECORDED_YET)}
        savedNote={shown.note}
        hint={T.PRIVATE_NOTE_HINT}
        isPhone={isPhone}
        onChange={(patch) => setDialog((current) => (current && !current.saving ? { ...current, values: { ...current.values, ...patch }, note: null } : current))}
        onSave={saveNote}
        onCancel={closeDialog}
        onRequestClose={requestCloseNote}
      />
    );
  } else if (dialog && !screenLocked && dialog.type === 'leave') {
    // The same small question as the event page (v0.192): "Stay on this page" is the default.
    dialogElement = (
      <Dialog key={dialog.key} title={T.leaveTitle(dialog.count)} variant="confirm" describedBy={`${baseId}-leave-body`} onRequestClose={closeDialog}>
        <p id={`${baseId}-leave-body`} className="tdialog-sub tdialog-body">
          {dialog.body}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={leaveAnyway}>
            {T.LEAVE_ANYWAY}
          </button>
          <button type="button" className="btn btn-primary" data-autofocus onClick={closeDialog}>
            {T.STAY_ON_PAGE}
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <>
      {backLink}
      <div className="phead pg-head">
        <div className="phead-titles">
          <div className="pg-titleline">
            <h1 className="ptitle">{T.privatePageTitle(name)}</h1>
            {/* The fact only (v0.183, §10 point 10): never an amount on a grading page */}
            {row.amountDueCents > 0 && <span className="ttag">{T.TAG_NOT_PAID}</span>}
          </div>
          <p className="ev-summary">{T.privatePageSub(row.privateDate, row.privateTime, school)}</p>
        </div>
        <button type="button" className="btn pg-print" onClick={(clickEvent) => setPrinting({ printedAt: new Date(), opener: clickEvent.currentTarget })}>
          {/* ti-printer = print */}
          <IconPrinter size={16} aria-hidden="true" />
          {T.PRINT}
        </button>
      </div>

      {/* The engine's banner, in this page's own words (one student, no class list) */}
      {grading.banner && <ErrorBanner text={T.privateSaveFailed(name)} onRetry={() => grading.retryAll()} onDismiss={() => grading.dismissBanner()} />}
      {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} onDismiss={() => setBanner(null)} />}

      {lockLine && (
        <p className="gr-lockline pg-lockline">
          {/* ti-lock = the result can't be changed right now */}
          <IconLock size={16} aria-hidden="true" />
          {lockLine}
        </p>
      )}

      <div className={`clist pg-card${isPhone ? ' is-phone' : ''}${isTouch ? ' is-touch' : ''}`}>
        <dl className="ev-sum pg-sum">
          <CardRow label={T.DETAIL_DAY}>{T.longDate(row.privateDate)}</CardRow>
          <CardRow label={T.DETAIL_TIME}>{T.timeLabel(row.privateTime)}</CardRow>
          <CardRow label={T.DETAIL_CLASS}>{row.className}</CardRow>
          <CardRow label={T.DETAIL_TESTING_FOR}>
            <TestingForCell rank={rankViewOf(row)} />
          </CardRow>
        </dl>
        <div className="pg-result" role="group" aria-label={T.COL_RESULT}>
          <div className="pg-result-head">
            <span className="pg-result-label">{T.COL_RESULT}</span>
            {tags}
            {/* Phone: the note button sits on the Result line (P6) */}
            {isPhone && noteButton && <span className="pg-result-note">{noteButton}</span>}
          </div>
          <div className="pg-result-line">
            {result}
            {!isPhone && noteButton}
          </div>
          {hasNote && <p className="gr-sub pg-note">{readOnlyTag ? T.resultNoteLine(shown.note) : shown.note}</p>}
        </div>
      </div>

      {/* Polite announcements after each save ("Saved" / "Not saved"). */}
      <span className="visually-hidden" role="status" aria-live="polite">
        {grading.announcement}
      </span>
      {printing && <PrivateSheet row={row} school={school} printedAt={printing.printedAt} />}
      {dialogElement}
    </>
  );
}
