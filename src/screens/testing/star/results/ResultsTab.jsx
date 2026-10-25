// ResultsTab.jsx — the Results tab of a Star testing event's page (#testing/star/event/<id>/results,
// build phase 6).
// Why it exists: after the testing day the desk sees every candidate's result, emails each family
// and records that it was sent; the school prints the results to show students; admins download a
// CSV. Approved: Results mockups screens 1–7 (v0.138–v0.146), Private mockups 7–8 (v0.150) and the
// Phase 6 gap mockups R1, R2, R4–R10 (rulebook v0.514, "Proposals (53)"; Q1 = C, Q2 = A, Q3, Q4 = A,
// Q5 = A). R11 (the email-text editor) lives on Rubrics and prices.
//
// Top to bottom:
//   the page header and tabs (StarEventPage's renderHeader)
//   one banner: Email result's (R4), Mark as sent's / Undo's refusals (R5), the CSV's (R8)
//   "Showing Worcester candidates only · Show both schools" on a one-school device (R10, proposal 39)
//   the Dan switch with counts · Print results · Download CSV (admins; hidden while Hide private
//     details is on) — phones: the buttons on their own line under the switch (proposal 2)
//   the summary line "1st Dan · 8 candidates · 3 passed · 2 make-ups · 2 not finished · 1 testing
//     privately" (proposal 3; a one-school device counts its own school)
//   Hide private details on: "Email result is off while private details are hidden. Email results at
//     the desk." (Q4 = A)
//   the rows (ResultRows.jsx), or the empty-Dan line (proposal 40)
//
// What the buttons do:
//   Email result (R2, proposals 8–12; Q3: a plain mailto: like Prospects' Email button) — in ONE click:
//     1. build the message from the row and the CURRENT text (Q5 = A: the texts are read with the
//        results, every 15 seconds and when the tab opens) and copy it as plain text FIRST, inside the
//        click (Safari refuses to copy after waiting for the database);
//     2. read this one family's address (star_candidate_detail, at the click — never in a list, §4.2);
//     3. open mailto:<address>?subject=<the fixed subject> — nothing else in the link.
//     Copy refused → the email still opens and a banner says so (R4, Q1 = C). No address / no
//     connection → a banner and nothing opens. The row then reads "Message copied …" and "Email opened
//     — did you send it? [Mark as sent]" — kept in PAGE MEMORY only (this file's Map), never stored.
//   Mark as sent (R5, proposals 20–24) — sends the result_key the row showed; the toast "Marked as
//     sent · Noah Chen" with Undo, which goes away 9 seconds after the click at the latest (the
//     database lets staff undo for 10 seconds). Admins undo later from ⋯ (asks first).
//   ⋯ (R7, proposal 28) — Open grades (or Grade private testing) · Mark as sent (while not sent) ·
//     Undo Mark as sent (while sent; admins, staff see it grayed).
//   Open grades / a click on the row (proposal 29) — StarEventPage switches to Grading with that Dan
//     and that row marked (phones: the picker on that candidate); Back returns here.
//   Print results / Download CSV — the whole event, both schools, whatever is showing (R8, R9).
// Only one write at a time (busyId): while a save or an address read is on its way, the other
// buttons wait.
//
// Props:
//   event, copy          the event and its rubric copy (the Dans and their labels)
//   results              { status, data } — StarEventPage's useLiveLoad of loadResults + the texts
//   isAdmin, hidden      (hidden = Hide private details, v0.506)
//   location, onLocationChange
//   panelId, tabId, renderHeader(addButton), onAddCandidate(opener)
//   onPrint(opener)      Print results (StarEventPage draws the sheet)
//   onOpenGrades(row)    Open grades (StarEventPage switches tab)
//   onGradePrivate(row)  Grade private testing (the private grading page)
//   reload()             quiet reload of the results (resolves 'ok' | …)
//   onGradesChanged()    after Choose subjects saved
//   screenLocked, onNoAccess, showToast, clearToast, onModalOpenChange
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  IconArrowBackUp, IconCurrencyDollarOff, IconDownload, IconMailCheck, IconPlus, IconPrinter, IconSchool,
} from '@tabler/icons-react';
import ErrorBanner from '../../../../components/ErrorBanner.jsx';
import RowMenu from '../../../../components/RowMenu.jsx';
import { LOCATION_CODE, LOCATION_NAME } from '../../../../lib/device.js';
import { gradeLetters } from '../../../../lib/star/gradingApi.js';
import {
  canMarkSent, downloadCsv, isSent, loadEmailAddress, markSent, schoolDateOf, summaryCounts, undoSent, undoTimeLeft,
} from '../../../../lib/star/resultsApi.js';
import { buildResultMessage, mailtoFor } from '../../../../lib/star/resultEmail.js';
import { PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../../../lib/useMediaQuery.js';
import { useRowArrowNav } from '../../../../lib/useRowArrowNav.js';
import ChoiceGroup from '../../events/ChoiceGroup.jsx';
import { ADD_CANDIDATE } from '../candidates/text.js';
import { ConfirmBox } from '../candidates/dialogParts.jsx';
import MakeupChoiceDialog from '../grading/MakeupChoiceDialog.jsx';
import { oneSchoolLine, SHOW_BOTH_SCHOOLS } from '../grading/text.js';
import ResultRows from './ResultRows.jsx';
import * as T from './text.js';
import '../grading/grading.css'; // the Dan bar (.stg-bar) and the switch's "Dan" word (.stg-dw), shared with Grading
import './results.css';

const { R } = T;

// Kept while the app is open (never stored): the Dan chosen on Results, per event, and each event's
// "Email opened — did you send it?" rows (proposal 10: page memory only, gone after a reload).
//   asked: Map(candidateId → { copied, at }) · copiedId: the row whose message is on the clipboard now
const danByEvent = new Map();
const askedByEvent = new Map();
const askedOf = (eventId) => {
  if (!askedByEvent.has(eventId)) askedByEvent.set(eventId, { rows: new Map(), copiedId: null });
  return askedByEvent.get(eventId);
};

const nameOf = (row) => `${row.firstName} ${row.lastName}`;
const MARK_REFUSALS = ['stale', 'invalid', 'not_finished', 'withdrawn', 'not_found'];

// Opens the email link the way a plain link click would (Prospects' Email button is an <a href>).
function openEmailLink(link) {
  const a = document.createElement('a');
  a.href = link;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function ResultsTab({
  event,
  copy,
  results,
  isAdmin,
  hidden,
  location,
  onLocationChange,
  panelId,
  tabId,
  renderHeader,
  onAddCandidate,
  onPrint,
  onOpenGrades,
  onGradePrivate,
  reload,
  onGradesChanged,
  screenLocked,
  onNoAccess,
  showToast,
  clearToast,
  onModalOpenChange,
}) {
  const eventId = event.id;
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const layout = { isPhone, isTouch, isWide };

  const dans = copy?.dans ?? [];
  const [danSel, setDanSelState] = useState(() => danByEvent.get(eventId) ?? dans[0]?.dan ?? 1);
  const [menu, setMenu] = useState(null); // { id, anchor }
  const [banner, setBanner] = useState(null); // { text, retry? }
  const [busyId, setBusyId] = useState(null); // the row with a save / address read on its way
  const [csvBusy, setCsvBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // admin Undo Mark as sent: { row, sentId, day, saving, failed, opener }
  const [choose, setChoose] = useState(null); // Choose subjects: { row, opener }
  const [announce, setAnnounce] = useState(''); // "Message copied" for screen readers
  const [, setAskedVersion] = useState(0); // redraws after the page-memory Map changes
  const busyRef = useRef(false);
  const undoToastRef = useRef(null); // the token of the Mark as sent toast still showing (the 9 s cap)
  const capTimerRef = useRef(null);
  const dataRef = useRef(results.data);
  useLayoutEffect(() => {
    dataRef.current = results.data;
  });
  useEffect(() => () => window.clearTimeout(capTimerRef.current), []);

  function setDan(dan) {
    danByEvent.set(eventId, dan);
    setDanSelState(dan);
  }

  // Dialogs make the page behind them inert (App.jsx).
  const dialogOpen = (confirm !== null || choose !== null) && !screenLocked;
  useEffect(() => {
    onModalOpenChange(dialogOpen);
  }, [dialogOpen, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);
  useEffect(() => {
    if (screenLocked) setMenu(null);
  }, [screenLocked]);
  // The lock and the switch as they are NOW, for Email result's answer (it waits for the address).
  const lockedNowRef = useRef(screenLocked);
  const hiddenNowRef = useRef(hidden);
  useEffect(() => {
    lockedNowRef.current = screenLocked;
    hiddenNowRef.current = hidden;
  }, [screenLocked, hidden]);

  // ----- What shows -----
  const schoolCode = location === 'Both' ? null : LOCATION_CODE[location];
  const oneSchool = schoolCode !== null && schoolCode !== undefined;
  const schoolLabel = oneSchool ? LOCATION_NAME[schoolCode] ?? location : null;
  const inSchool = (row) => !oneSchool || row.locationCode === schoolCode;
  const data = results.data;
  const rowsOf = (dan) => (data?.dans?.[dan]?.rows ?? []).filter(inSchool);
  const danCopy = dans.find((d) => d.dan === danSel) ?? dans[0] ?? null;
  const danLabel = danCopy?.label ?? '';
  const rows = rowsOf(danCopy?.dan ?? danSel);
  const danData = data?.dans?.[danCopy?.dan ?? danSel] ?? null;
  const counts = danData ? (oneSchool ? summaryCounts(rows) : danData.counts) : null;
  const findRow = (id) => {
    for (const d of Object.values(dataRef.current?.dans ?? {})) {
      const row = d.rows.find((r) => r.id === id);
      if (row) return row;
    }
    return null;
  };

  // ----- Page memory: the "did you send it?" rows -----
  const memory = askedOf(eventId);
  function asked(row) {
    const a = memory.rows.get(row.id);
    if (!a) return null;
    // Marked as sent elsewhere after this device asked: the question has its answer.
    const s = row.sent?.sent;
    if (row.sent?.matches && s && Date.parse(s.markedAt) >= a.at) return null;
    return { copied: a.copied && memory.copiedId === row.id };
  }
  function remember(rowId, copied) {
    memory.rows.set(rowId, { copied, at: Date.now() });
    memory.copiedId = copied ? rowId : memory.copiedId === rowId ? null : memory.copiedId;
    setAskedVersion((v) => v + 1);
  }
  function forget(rowId) {
    memory.rows.delete(rowId);
    if (memory.copiedId === rowId) memory.copiedId = null;
    setAskedVersion((v) => v + 1);
  }

  // ----- One write at a time -----
  function begin(rowId) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusyId(rowId);
    return true;
  }
  function end() {
    busyRef.current = false;
    setBusyId(null);
  }
  function toast(text, options) {
    undoToastRef.current = null;
    showToast(text, options);
  }

  // ----- Email result (R2, R4) -----
  // Everything up to the clipboard runs straight inside the click: no waiting before the copy.
  async function emailResult(row) {
    if (hidden || busyRef.current) return;
    const current = findRow(row.id) ?? row;
    const name = nameOf(current);
    const label = dans.find((d) => d.dan === current.dan)?.label ?? T.danLabelOf(current.dan);
    const message = buildResultMessage({ texts: dataRef.current?.texts ?? null, row: current, eventName: event.name, testingDate: event.testingDate, danLabel: label });
    if (message.status !== 'ok') {
      // The texts weren't read (offline at the last refresh), or the row no longer gets an email.
      setBanner({ text: R.MESSAGE_NOT_READY });
      reload();
      return;
    }
    let copyPromise;
    try {
      copyPromise = navigator.clipboard?.writeText ? navigator.clipboard.writeText(message.body) : Promise.reject(new Error('No clipboard'));
    } catch (error) {
      copyPromise = Promise.reject(error);
    }
    if (!begin(current.id)) return;
    setBanner(null);
    const copied = await copyPromise.then(() => true, () => false);
    const answer = await loadEmailAddress(current.id);
    end();
    // The screen locked, or Hide private details went on, while the address was being read:
    // nothing opens (no family address behind the lock screen or against the switch). Refs, not
    // `hidden` / `screenLocked`: those are the values from when the click started.
    if (lockedNowRef.current || hiddenNowRef.current) return;
    if (answer.status === 'no_access') {
      onNoAccess();
      return;
    }
    const link = answer.status === 'ok' ? mailtoFor(answer.email) : null;
    if (answer.status === 'no_email' || (answer.status === 'ok' && !link)) {
      setBanner({ text: R.noEmailOnFile(name) }); // R4: a safety net only; nothing opens
      return;
    }
    if (answer.status === 'not_found') {
      setBanner({ text: R.markSentRefusal('not_found', name).replace(' Nothing was marked.', '') }); // not in the mockups
      reload();
      return;
    }
    if (answer.status !== 'ok') {
      setBanner({ text: R.addressFailed(name), retry: () => emailResult(current) });
      return;
    }
    remember(current.id, copied);
    if (copied) {
      setAnnounce('');
      window.requestAnimationFrame(() => setAnnounce(R.ANNOUNCE_COPIED));
    } else {
      setBanner({ text: R.COPY_BLOCKED }); // the email still opens, empty (Q1 = C)
    }
    openEmailLink(link);
  }

  // ----- Mark as sent and its Undo (R5) -----
  async function markAsSent(row) {
    const current = findRow(row.id) ?? row;
    const name = nameOf(current);
    if (!begin(current.id)) return;
    setBanner(null);
    clearToast();
    const clickedAt = Date.now();
    const answer = await markSent({ candidateId: current.id, resultKey: current.result.resultKey });
    if (answer.status === 'ok') {
      // The row keeps its question (busy) until the reload shows "Sent Nov 16 · …" — no flash of
      // "Not sent yet" in between.
      await reload();
      forget(current.id);
      end();
      const token = {};
      showToast(R.markedAsSent(name), {
        icon: false,
        action: { label: R.UNDO, onAction: () => undoFromToast(answer.sentId) },
      });
      undoToastRef.current = token;
      window.clearTimeout(capTimerRef.current);
      // Undo goes away 9 seconds after the click at the latest (proposal 20), however long the
      // toast was paused under the pointer.
      capTimerRef.current = window.setTimeout(() => {
        if (undoToastRef.current === token) {
          undoToastRef.current = null;
          clearToast();
        }
      }, undoTimeLeft(clickedAt, Date.now()));
      return;
    }
    end();
    if (answer.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (MARK_REFUSALS.includes(answer.status)) {
      setBanner({ text: R.markSentRefusal(answer.status, name) }); // ✕ only, nothing retries
      forget(current.id);
      reload();
      return;
    }
    // The connection: Retry; the row goes back to its question.
    setBanner({ text: R.markSentRefusal('error', name), retry: () => markAsSent(current) });
  }
  async function undoFromToast(sentId) {
    undoToastRef.current = null;
    if (!begin(null)) return;
    const answer = await undoSent(sentId);
    end();
    if (answer.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (answer.status !== 'ok') {
      const retry = answer.status === 'error' ? () => undoFromToast(sentId) : undefined;
      setBanner({ text: R.undoSentRefusal(answer.status), retry });
    }
    reload();
  }
  // Admins: ⋯ → Undo Mark as sent asks first (proposal 22); no Undo toast afterwards.
  function openUndoConfirm(row, opener) {
    const s = row.sent?.sent;
    if (!s) return;
    setConfirm({ row, sentId: s.id, day: s.markedAt, saving: false, failed: false, opener });
  }
  function closeConfirm() {
    const opener = confirm?.opener;
    setConfirm(null);
    focusLater(() => (opener?.isConnected ? opener : null));
  }
  async function confirmUndo() {
    const d = confirm;
    if (!d || !begin(d.row.id)) return;
    setConfirm({ ...d, saving: true, failed: false });
    const answer = await undoSent(d.sentId);
    end();
    if (answer.status === 'no_access') {
      setConfirm(null);
      onNoAccess();
      return;
    }
    if (answer.status === 'error') {
      setConfirm({ ...d, saving: false, failed: true });
      return;
    }
    closeConfirm();
    if (answer.status !== 'ok') setBanner({ text: R.undoSentRefusal(answer.status) });
    reload();
  }

  // ----- Download CSV (R8): the whole event, both schools, one click -----
  async function download() {
    if (csvBusy) return;
    setCsvBusy(true);
    setBanner(null);
    const answer = await downloadCsv({ event: { id: event.id, name: event.name }, dans });
    setCsvBusy(false);
    if (answer.status === 'ok') {
      toast(R.csvDownloaded(answer.fileName, answer.rowCount), { icon: false });
      return;
    }
    if (answer.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (answer.status === 'not_allowed') {
      setBanner({ text: R.CSV_NOT_ALLOWED });
      return;
    }
    setBanner({ text: R.CSV_FAILED, retry: download });
  }

  // ----- Choose subjects (admins, v0.513 — the Grading dialog) -----
  function closeChoose(changed) {
    const opener = choose?.opener;
    setChoose(null);
    if (changed) {
      reload();
      onGradesChanged?.();
    }
    focusLater(() => (opener?.isConnected ? opener : null));
  }

  function focusLater(getTarget) {
    let tries = 0;
    const tryFocus = () => {
      const target = getTarget();
      if (target && target.closest('[inert]') && tries++ < 30) window.requestAnimationFrame(tryFocus);
      else target?.focus();
    };
    window.requestAnimationFrame(tryFocus);
  }

  // ----- Open grades (or the private grading page) — the ⋯'s first item and a row click -----
  function openGrades(row) {
    clearToast();
    if (row.result?.private?.on && onGradePrivate) onGradePrivate(row);
    else onOpenGrades(row);
  }

  // ----- The ⋯ menu (R7, proposal 28) -----
  function openMenu(row, anchor) {
    setMenu((current) => (current && current.id === row.id ? null : { id: row.id, anchor }));
  }
  function closeMenu(reason) {
    const current = menu;
    setMenu(null);
    if (current && (reason === 'escape' || reason === 'tab')) current.anchor?.focus();
  }
  function menuContent() {
    if (!menu) return null;
    const row = findRow(menu.id);
    if (!row) return null;
    const anchor = menu.anchor;
    const busy = busyId !== null;
    const isPrivate = Boolean(row.result?.private?.on);
    // ti-school = grade a candidate / open their grades (§2.4, widened by proposal 28)
    const items = [
      isPrivate
        ? { key: 'grade', label: R.GRADE_PRIVATE_TESTING, Icon: IconSchool, onSelect: () => openGrades(row) }
        : { key: 'open', label: R.OPEN_GRADES, Icon: IconSchool, onSelect: () => openGrades(row) },
    ];
    if (canMarkSent(row) && !isSent(row)) {
      // ti-mail-check = mark an email as sent (§2.4, new row)
      items.push({ key: 'mark', label: R.MARK_AS_SENT, Icon: IconMailCheck, disabled: busy, onSelect: () => markAsSent(row) });
    }
    if (isSent(row)) {
      const label = isAdmin ? (
        R.UNDO_MARK_AS_SENT
      ) : (
        <span className="ev-menu-two st-menu-two">
          <span>{R.UNDO_MARK_AS_SENT}</span>
          <span className="ev-menu-reason">{R.UNDO_STAFF_GRAYED}</span>
        </span>
      );
      // ti-arrow-back-up = Undo
      items.push({ key: 'undo', label, Icon: IconArrowBackUp, disabled: !isAdmin || busy, onSelect: () => openUndoConfirm(row, anchor) });
    }
    const label = dans.find((d) => d.dan === row.dan)?.label ?? '';
    return { title: nameOf(row), subtitle: `${label} · ${T.testingFor(row.starsFrom, row.starsTo, row.isMakeup)}`, label: T.moreFor(nameOf(row)), items };
  }

  // ===== Keyboard: ↑ ↓ Enter on rows (Enter = Open grades) =====
  const nav = useRowArrowNav({
    rowKeys: rows.map((r) => r.id),
    onOpen: (id) => {
      const row = findRow(id);
      if (row) openGrades(row);
    },
  });

  // ===== Drawing =====
  const addButton = (
    <button type="button" className="btn btn-primary" aria-haspopup="menu" onClick={(clickEvent) => onAddCandidate(clickEvent.currentTarget)}>
      {/* ti-plus = add new */}
      <IconPlus size={16} aria-hidden="true" />
      {ADD_CANDIDATE}
    </button>
  );

  const danLabelId = `${panelId}-dan`;
  const danSwitch = (
    <div className="ev-side stg-dan-switch">
      <span id={danLabelId} className="visually-hidden">
        {T.DAN_SWITCH_LABEL}
      </span>
      <ChoiceGroup
        labelId={danLabelId}
        value={danCopy?.dan ?? danSel}
        onChange={setDan}
        options={dans.map((d) => {
          const count = data ? rowsOf(d.dan).length : '';
          return {
            key: d.dan,
            label: T.danChoiceLabel(d.label, count),
            content: (
              <>
                {T.danWord(d.label)}
                <span className="stg-dw">{' ' /* a no-break space: a plain one is dropped inside the flex switch */}{T.DAN_WORD}</span>
                {data && <span className="ev-side-count">{count}</span>}
              </>
            ),
          };
        })}
      />
    </div>
  );
  const buttons = (
    <span className="str-buttons">
      <button type="button" className="btn str-print" onClick={(clickEvent) => onPrint(clickEvent.currentTarget)}>
        {/* ti-printer = print */}
        <IconPrinter size={16} aria-hidden="true" />
        {R.PRINT_RESULTS}
      </button>
      {isAdmin && !hidden && (
        <button type="button" className="btn" aria-disabled={csvBusy ? 'true' : undefined} onClick={download}>
          {/* ti-download = download a file */}
          <IconDownload size={16} aria-hidden="true" />
          {R.DOWNLOAD_CSV}
        </button>
      )}
    </span>
  );

  const ctx = {
    layout,
    nav,
    isAdmin,
    hidden,
    maxScore: danData?.maxScore ?? null,
    testingDate: event.testingDate,
    label: T.tableLabel(danLabel),
    menuFor: menu?.id ?? null,
    busyId,
    asked,
    handlers: {
      onOpen: openGrades,
      onEmail: (row) => emailResult(row),
      onMarkSent: (row) => markAsSent(row),
      onMore: openMenu,
      onChooseSubjects: (row, opener) => setChoose({ row, opener }),
    },
  };

  let body;
  if (!data && results.status === 'error') {
    body = <ErrorBanner text={R.LOAD_FAILED} onRetry={() => reload()} />;
  } else if (!data) {
    body = (
      <div className="clist tskeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING_RESULTS}</span>
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="tskeleton-row str-skel-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else {
    const parts = oneSchool ? T.emptyOneSchoolParts(schoolLabel, danLabel) : null;
    body = (
      <>
        <div className={`stg-bar str-bar${isPhone ? ' stg-bar--phone' : ''}`}>
          {danSwitch}
          {buttons}
        </div>
        {rows.length === 0 ? (
          <p className="tempty str-empty">
            {oneSchool ? (
              <>
                {parts[0]}
                <button type="button" className="link-button st-inline-link" onClick={() => onLocationChange('Both')}>
                  {parts[1]}
                </button>
                {parts[2]}
              </>
            ) : (
              R.emptyDanBoth(danLabel)
            )}
          </p>
        ) : (
          <>
            <p className="str-summary">
              <span className="str-summary-dan">{danLabel}</span>
              {R.summaryLine('', counts) /* " · 8 candidates · 3 passed …" after the Dan in medium weight */}
            </p>
            {hidden && (
              <p className="str-hidden-line">
                {/* ti-currency-dollar-off = private details hidden (the top bar's chip) */}
                <IconCurrencyDollarOff size={16} aria-hidden="true" />
                {R.EMAIL_OFF_WHILE_HIDDEN}
              </p>
            )}
            <ResultRows rows={rows} ctx={ctx} />
          </>
        )}
      </>
    );
  }

  const content = menu && !screenLocked ? menuContent() : null;
  const chooseRow = choose ? findRow(choose.row.id) ?? choose.row : null;

  return (
    <>
      {renderHeader(addButton)}
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel str-panel">
        {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busyId !== null || csvBusy} onDismiss={() => setBanner(null)} />}
        {oneSchool && (
          <p className="ev-filter-line st-school-line">
            {oneSchoolLine(schoolLabel)} ·{' '}
            <button type="button" className="link-button st-inline-link" onClick={() => onLocationChange('Both')}>
              {SHOW_BOTH_SCHOOLS}
            </button>
          </p>
        )}
        {body}
      </div>
      <div className="visually-hidden" aria-live="polite">
        {announce}
      </div>
      {content && <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />}
      {confirm && !screenLocked && (
        <ConfirmBox
          title={R.undoConfirmTitle(nameOf(confirm.row))}
          body={R.undoConfirmBody(schoolDateOf(confirm.day))}
          keepLabel={R.CANCEL}
          goLabel={T.UNDO_CONFIRM_GO}
          tone="undo"
          busy={confirm.saving}
          failedText={confirm.failed ? R.undoSentRefusal('error') : null}
          onGo={confirmUndo}
          onCancel={closeConfirm}
        />
      )}
      {choose && chooseRow && !screenLocked && (
        <MakeupChoiceDialog row={chooseRow} result={chooseRow.result} letters={gradeLetters(copy)} isPhone={isPhone} onClose={closeChoose} onNoAccess={onNoAccess} />
      )}
    </>
  );
}
