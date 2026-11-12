// ResultsTab.jsx — the Results tab of a Black Belt testing cycle's page
// (#testing/black-belt/cycle/<id>/results, migration 0025, contract 0025 §14.3).
// Why it exists: after the testing days the desk sees every candidate's result, emails each family
// and records that it was sent; the school prints the results to show students; admins download a
// CSV. Approved: Results mockups R01, R02, R04–R06 (proposals 1–20, 30–49), copied from Star
// testing's Results tab (src/screens/testing/star/results/ResultsTab.jsx) with Black Belt's data.
//
// Top to bottom:
//   one banner: Email result's, Mark as sent's / Undo's, Print's and the CSV's refusals
//   "Showing Worcester candidates only · Show both schools" on a one-school device (proposal 30)
//   amber bar: the shared PageBar, drawn under the top bar so it stays in view however far the list is
//     scrolled (v1.128); × or a Retry that works returns focus to the tab button
//   offline: no bar of its own (the page's shared amber bar says it); two gray "why" lines sit next to
//     the grayed controls (M12, rulebook v1.123) — the last list stays on screen
//   the Dan switch with counts (all four Dans, the device's school) · Print results · Download CSV
//     (admins; hidden while Hide payments is on) — phones: the buttons under the switch (proposal 2)
//   the summary line "1st Dan · 5 candidates · 1 passed · 3 make-ups · 1 not finished" (proposal 3)
//   "No grades yet. Results fill in …" while nothing is graded in this Dan (proposal 32)
//   Hide private details on: "Email result is off while private details are hidden. Email results
//   at the desk." (Star's words, v0.974)
//   the rows (ResultRows.jsx), or the empty-Dan line (proposal 31)
//
// What the buttons do:
//   Email result (proposals 12–14, 19) — in ONE click:
//     1. build the message from the row and the CURRENT text (the texts are read with the results,
//        every 15 seconds) and copy it as plain text FIRST, inside the click (Safari refuses to copy
//        after waiting for the database);
//     2. read this one candidate's "Email for results" (bb_result_email, at the click — never in a
//        list); if the result changed meanwhile (its result_key), nothing opens;
//     3. open mailto:<address>?subject=<the fixed subject> — nothing else in the link.
//     Copy refused → the email still opens and a banner says so. The row then reads "Message
//     copied …" and "Email opened — did you send it? [Mark as sent]" — kept in PAGE MEMORY only.
//   Mark as sent (proposal 15) — sends the result_key the row showed; the toast "Marked as sent ·
//     Mia Chen" with Undo, gone 9 seconds after the click at the latest (the database lets the
//     person undo their own for 10 seconds). Admins undo later from ⋯ (asks first, proposal 18).
//   ⋯ (proposal 17) — Open grades · Mark as sent (while not sent) · Undo Mark as sent (while sent;
//     admins, staff see it grayed with "Only an admin can undo this now.").
//   Open grades / a click on the row — onOpenGrades({ dan, dayKey, candidateId }): CyclePage
//     switches to Grading on that Dan and the testing day of the first subject that needs
//     attention (resultLines.openGradesDay).
//   Choose subjects (admins) — C1's MakeupSubjectsDialog over Results.
//   Print results / Download CSV — the whole cycle, both schools, whatever is showing (proposal 2).
// The Undo Mark as sent ask is the shared ConfirmBox (BB7): the safe button on the left, the red action on the right.
// Only one write at a time (the shared save line, R2-05; busyId marks the row): an Undo of Mark as
// sent pressed meanwhile waits its turn ("Undoing…"). While a save or an address read is on its way, the other
// buttons wait. Email result, Mark as sent, Print results and Download CSV are grayed offline.
//
// Props (from CyclePage.jsx):
//   cycle, cycleId, isAdmin, location, onLocationChange, screenLocked, onNoAccess,
//   onRefreshProfile, showToast, clearToast, onModalOpenChange, onOpenGrades({ dan, dayKey, candidateId })
// The tab panel's ids: bb-cycle-results-<cycleId> (the panel) and bb-cycle-tab-results-<cycleId>
// (the tab button CyclePage draws).
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  IconArrowBackUp, IconCurrencyDollarOff, IconDownload, IconMailCheck, IconPrinter, IconSchool, IconWifiOff,
} from '@tabler/icons-react';
import ConfirmBox from '../../../components/ConfirmBox.jsx';
import PageBar from '../../../components/PageBar.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { LOCATION_CODE, LOCATION_NAME } from '../../../lib/device.js';
import { useSaveLine } from '../../../lib/saveLine.js';
import { downloadCsv, loadResultEmail, loadResultTexts, loadResults, markSent, undoSent } from '../../../lib/blackBelt/gradingApi.js';
import { buildResultMessage, mailtoFor, resultKind } from '../../../lib/blackBelt/resultEmail.js';
import { schoolToday } from '../../../lib/blackBelt/api.js';
import { PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { useRowArrowNav } from '../../../lib/useRowArrowNav.js';
import { usePrivateDetailsHidden } from '../../../lib/privateDetails.js';
import ChoiceGroup from '../../../components/ChoiceGroup.jsx';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../lib/useLiveLoad.js';
import MakeupSubjectsDialog from '../grading/MakeupSubjectsDialog.jsx';
import ResultRows from './ResultRows.jsx';
import ResultsSheet from './ResultsSheet.jsx';
import { canEmail, emailAnswerFromRow, isSent, nothingYet, openGradesDay, schoolDateOf, summaryCounts } from './resultLines.js';
import { focusCurrentTab } from '../parts/focusCurrentTab.js';
import { useBarFocusReturn } from '../parts/useBarFocusReturn.js';
import { undoBarFor } from '../parts/undoBar.js';
import { UNDO_SECTION } from '../text.js';
import * as T from './text.js';
import './results.css';

const DANS = [1, 2, 3, 4];
const UNDO_CAP_MS = 9000; // the toast's Undo goes 9 s after the click at the latest (proposal 15)
const MARK_REFUSALS = ['stale', 'invalid', 'not_finished', 'withdrawn', 'not_found', 'no_email'];
const EMAIL_REFUSALS = ['not_finished', 'no_email', 'withdrawn', 'not_found'];
const nameOf = (row) => `${row.firstName} ${row.lastName}`;
const browserOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

// Kept while the app is open (never stored): the Dan chosen on Results, per cycle, and each cycle's
// "Email opened — did you send it?" rows (proposal 14: page memory only, gone after a reload).
//   rows: Map(candidateId → { copied, sentId (the send record the row had at the click) }) · copiedId: the row whose message is on the clipboard now
const danByCycle = new Map();
const askedByCycle = new Map();
const askedOf = (cycleId) => {
  if (!askedByCycle.has(cycleId)) askedByCycle.set(cycleId, { rows: new Map(), copiedId: null });
  return askedByCycle.get(cycleId);
};

// One Dan's results + the three email texts, read together (so Email result always uses the text
// as it is now, proposal 28). A problem reading the texts never hides the results.
async function loadTab(key) {
  const [cycleId, dan] = key.split('|');
  const [res, texts] = await Promise.all([loadResults({ cycleId, dan: Number(dan) }), loadResultTexts()]);
  if (res.status !== 'ok') return res;
  return { ...res, texts: texts.status === 'ok' ? texts.texts : null };
}

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

// Hands the CSV text (already UTF-8 with its byte-order mark) to the browser as a download. The
// "blob:" address only points at the file in memory; nothing goes into a web address.
function saveFile(fileName, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export default function ResultsTab({
  cycle,
  cycleId,
  isAdmin,
  location,
  onLocationChange,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
  onOpenGrades,
}) {
  const id = cycleId ?? cycle?.id;
  const panelId = `bb-cycle-results-${id}`;
  const tabId = `bb-cycle-tab-results-${id}`;
  const whyId = useId(); // the gray offline lines, tied to the grayed buttons with aria-describedby
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const layout = { isPhone, isTouch, isWide };
  const [hidden] = usePrivateDetailsHidden(); // Hide payments (also hides emails, proposal 36)

  // Online / offline (proposal 35): while the browser says it's offline nothing is requested and
  // the last list stays on screen under the amber bar.
  const [online, setOnline] = useState(browserOnline);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const [danSel, setDanSelState] = useState(() => danByCycle.get(id) ?? 1);
  function setDan(dan) {
    danByCycle.set(id, dan);
    setDanSelState(dan);
    setMenu(null);
  }
  const live = useLiveLoad({ key: id ? `${id}|${danSel}` : null, enabled: !screenLocked && online, load: loadTab, refreshMs: LIVE_REFRESH_MS });
  const liveRef = useRef(live);
  const data = live.data;
  const dataRef = useRef(data);
  // The last good Dan counts and texts: switching Dan doesn't blank the switch, and a failed texts
  // read keeps the texts read before.
  const countsRef = useRef(null);
  const textsRef = useRef(null);
  useLayoutEffect(() => {
    liveRef.current = live;
    dataRef.current = live.data;
    if (live.data?.danCounts) countsRef.current = live.data.danCounts;
    if (live.data?.texts) textsRef.current = live.data.texts;
  });
  const reload = () => liveRef.current.reload();

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  const [menu, setMenu] = useState(null); // { id, anchor }
  const [banner, setBanner] = useState(null); // { text, retry? }
  // The bar is a PageBar (under the top bar, v1.128): when it goes while focus is on its Retry or ×, focus returns to the tab.
  // C5: so is "couldn't load" (drawn from the load's status): when its Retry works, focus goes to the tab.
  useBarFocusReturn(Boolean(banner) || (!data && live.status === 'error'), focusCurrentTab);
  const [busyId, setBusyId] = useState(null); // the row with a save / address read on its way
  const [csvBusy, setCsvBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [printing, setPrinting] = useState(null); // { sheet, opener } while the sheet prints
  const [confirm, setConfirm] = useState(null); // admin Undo Mark as sent: { row, sentId, day, saving, failed, opener }
  const [choose, setChoose] = useState(null); // Choose subjects: { rowId, opener }
  const [announce, setAnnounce] = useState(''); // "Message copied" for screen readers
  const [, setAskedVersion] = useState(0); // redraws after the page-memory Map changes
  const undoToastRef = useRef(null); // the token of the Mark as sent toast still showing (the 9 s cap)
  const capTimerRef = useRef(null);
  useEffect(() => () => window.clearTimeout(capTimerRef.current), []);

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
  const schoolCode = location === 'Both' ? null : LOCATION_CODE[location] ?? null;
  const oneSchool = schoolCode !== null;
  const schoolLabel = oneSchool ? LOCATION_NAME[schoolCode] ?? location : null;
  const inSchool = (row) => !oneSchool || row.locationCode === schoolCode;
  const danCounts = data?.danCounts ?? countsRef.current;
  const countOf = (dan) => (danCounts ? danCounts.filter((c) => c.dan === dan && (!oneSchool || c.locationCode === schoolCode)).reduce((n, c) => n + c.count, 0) : null);
  const rows = (data?.rows ?? []).filter(inSchool);
  const danObj = data?.rubrics?.find((d) => d.dan === danSel) ?? data?.rubrics?.[0] ?? null;
  const submissionsDue = data?.cycle?.submissionsDue ?? cycle?.submissionsDue ?? null;
  const today = data?.today ?? schoolToday();
  const counts = summaryCounts(rows);
  const findRow = (rowId) => dataRef.current?.rows?.find((r) => r.id === rowId) ?? null;
  const emailOff = hidden || !online;

  // ----- Page memory: the "did you send it?" rows -----
  const memory = askedOf(id);
  function asked(row) {
    const a = memory.rows.get(row.id);
    if (!a) return null;
    // Marked as sent elsewhere after this device asked (a send record newer than the one the row
    // had at the click): the question has its answer. Compared by the record's id, not by clocks.
    const s = row.sent?.sent;
    if (row.sent?.matches && s && s.id !== a.sentId) return null;
    return { copied: a.copied && memory.copiedId === row.id };
  }
  function remember(rowId, copied, sentId) {
    memory.rows.set(rowId, { copied, sentId });
    memory.copiedId = copied ? rowId : memory.copiedId === rowId ? null : memory.copiedId;
    setAskedVersion((v) => v + 1);
  }
  function forget(rowId) {
    memory.rows.delete(rowId);
    if (memory.copiedId === rowId) memory.copiedId = null;
    setAskedVersion((v) => v + 1);
  }

  // ----- One write at a time (the shared save line, R2-05) -----
  // The line holds one save at a time; the toast's Undo of Mark as sent pressed meanwhile waits its
  // turn ("Undoing…") instead of being dropped (lib/saveLine.js). busyId marks the row being saved.
  const line = useSaveLine({ section: UNDO_SECTION, showToast, undoBar: undoBarFor(setBanner) });
  // end(status, retry): status is the database's real answer ('ok' or a failure) and retry does the same save
  // again, so an Undo that waited for a save that failed can build "Neither change saved" with its Retry
  // (C1, v1.127). Every begin() is ended in a finally (C8), so a call that throws still frees the line.
  const tokenRef = useRef(null);
  function begin(rowId) {
    const token = line.begin();
    if (!token) return false;
    tokenRef.current = token;
    setBusyId(rowId);
    return true;
  }
  function end(status = 'ok', retry = null) {
    setBusyId(null);
    line.end(status, { retry, token: tokenRef.current });
  }

  // ----- Email result (proposals 12–14, 19) -----
  // Everything up to the clipboard runs straight inside the click: no waiting before the copy.
  async function emailResult(row) {
    // (Checked again here, not only on the button: a banner's Retry can call this later.)
    if (emailOff || hiddenNowRef.current || lockedNowRef.current || !browserOnline() || line.isBusy()) return;
    const current = findRow(row.id) ?? row;
    const name = nameOf(current);
    const kind = resultKind(current.result);
    const answerFromRow = kind && danObj ? emailAnswerFromRow(current, danObj, data?.cycle?.name ?? cycle?.name ?? '', kind) : null;
    const message = answerFromRow ? buildResultMessage({ texts: dataRef.current?.texts ?? textsRef.current, answer: answerFromRow }) : { status: 'not_finished' };
    if (message.status !== 'ok') {
      // The texts weren't read (offline at the last refresh), or the row no longer gets an email.
      setBanner({ text: T.MESSAGE_NOT_READY });
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
    let copied = false;
    let answer = { status: 'error' };
    try {
      copied = await copyPromise.then(() => true, () => false);
      answer = await loadResultEmail({ candidateId: current.id });
    } finally {
      // Reading the family's address changes nothing, so it is not a "save" that a waiting Undo needs
      // to report as failed: the line is freed as 'ok' either way.
      end();
    }
    // The screen locked, or Hide payments went on, while the address was being read: nothing opens
    // (no family address behind the lock screen or against the switch).
    if (lockedNowRef.current || hiddenNowRef.current) return;
    if (answer.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (EMAIL_REFUSALS.includes(answer.status)) {
      setBanner({ text: T.emailRefusal(answer.status, name) });
      reload();
      return;
    }
    if (answer.status !== 'ok') {
      setBanner({ text: T.addressFailed(name), retry: () => emailResult(current) });
      return;
    }
    // The result changed between the last refresh and the click: the copied message is old.
    if (answer.resultKey !== current.result.result_key) {
      setBanner({ text: T.emailRefusal('stale', name) });
      reload();
      return;
    }
    const link = mailtoFor(answer.email);
    if (!link) {
      setBanner({ text: T.emailRefusal('no_email', name) });
      return;
    }
    remember(current.id, copied, current.sent?.sent?.id ?? null);
    if (copied) {
      setAnnounce('');
      window.requestAnimationFrame(() => setAnnounce(T.ANNOUNCE_COPIED));
    } else {
      setBanner({ text: T.COPY_BLOCKED }); // the email still opens, empty
    }
    openEmailLink(link);
  }

  // ----- Mark as sent and its Undo (proposals 15, 18) -----
  async function markAsSent(row) {
    if (!online) return;
    const current = findRow(row.id) ?? row;
    const name = nameOf(current);
    if (!begin(current.id)) return;
    setBanner(null);
    clearToast();
    const clickedAt = Date.now();
    let answer = { status: 'error' };
    try {
      answer = await markSent({ candidateId: current.id, expectedResultKey: current.result.result_key });
      // The row keeps its question (busy) until the reload shows "Sent Jun 9 · …" — no flash of
      // "Not sent yet" in between.
      if (answer.status === 'ok') await reload();
    } finally {
      end(answer.status, () => markAsSent(current));
    }
    if (answer.status === 'ok') {
      forget(current.id);
      const token = {};
      undoToastRef.current = token;
      showToast(T.markedAsSent(name), {
        icon: false,
        action: line.undoAction(() => runUndoSent(answer.sentId), { words: T.markedAsSent(name) }),
      });
      window.clearTimeout(capTimerRef.current);
      // Undo goes away 9 seconds after the click at the latest, however long the toast was paused
      // under the pointer.
      capTimerRef.current = window.setTimeout(() => {
        if (undoToastRef.current === token) {
          undoToastRef.current = null;
          clearToast();
        }
      }, Math.max(0, clickedAt + UNDO_CAP_MS - Date.now()));
      return;
    }
    if (answer.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (MARK_REFUSALS.includes(answer.status)) {
      setBanner({ text: T.markSentRefusal(answer.status, name) }); // ✕ only, nothing retries
      forget(current.id);
      reload();
      return;
    }
    // The connection: Retry; the row goes back to its question.
    setBanner({ text: T.markSentRefusal('error', name), retry: () => markAsSent(current) });
  }
  // The toast's Undo of Mark as sent, run inside the save line: answers { status, reason? } and the
  // line shows "Undone", or the bar ("Undo didn't save…" with Retry, or the database's reason).
  async function runUndoSent(sentId) {
    undoToastRef.current = null;
    const answer = await undoSent({ sendId: sentId });
    if (answer.status === 'no_access') {
      onNoAccess();
      return { status: 'no_access' };
    }
    if (answer.status === 'ok') {
      await reload();
      return { status: 'ok' };
    }
    if (answer.status === 'error') return { status: 'error' };
    if (answer.status === 'not_allowed') onRefreshProfile?.();
    await reload();
    return { status: answer.status, reason: T.undoSentRefusal(answer.status) };
  }
  // Admins: ⋯ → Undo Mark as sent asks first (proposal 18); no Undo toast afterwards.
  function openUndoConfirm(row, opener) {
    const s = row.sent?.sent;
    if (!s) return;
    setConfirm({ row, sentId: s.id, day: schoolDateOf(s.markedAt), saving: false, failed: false, opener });
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
    let answer = { status: 'error' };
    try {
      answer = await undoSent({ sendId: d.sentId });
    } finally {
      end(answer.status, () => confirmUndo());
    }
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
    if (answer.status !== 'ok') {
      setBanner({ text: T.undoSentRefusal(answer.status) });
      if (answer.status === 'not_allowed') onRefreshProfile?.();
    }
    reload();
  }

  // ----- Download CSV (proposals 45–49): the whole cycle, both schools, one click -----
  async function download() {
    if (csvBusy || !online || hidden || !isAdmin) return;
    setCsvBusy(true);
    setBanner(null);
    const answer = await downloadCsv({ cycleId: id });
    setCsvBusy(false);
    if (answer.status === 'ok') {
      saveFile(answer.fileName, answer.text);
      undoToastRef.current = null;
      showToast(T.csvDownloaded(answer.fileName, answer.rowCount), { icon: false }); // no Undo (proposal 46)
      return;
    }
    if (answer.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (answer.status === 'not_allowed') {
      setBanner({ text: T.CSV_NOT_ALLOWED });
      onRefreshProfile?.();
      return;
    }
    setBanner({ text: T.CSV_FAILED, retry: download });
  }

  // ----- Print results (proposals 38–44): the WHOLE cycle — every Dan, both schools -----
  async function printResults(opener) {
    if (printBusy || printing || !online) return;
    setPrintBusy(true);
    setBanner(null);
    const answer = await loadResults({ cycleId: id, dan: null });
    setPrintBusy(false);
    if (lockedNowRef.current) return; // the screen locked while the results were read: never print over the lock screen
    if (answer.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (answer.status !== 'ok') {
      setBanner({ text: T.PRINT_FAILED, retry: () => printResults(opener) });
      return;
    }
    const dans = DANS.map((dan) => ({
      dan,
      danObj: answer.rubrics.find((d) => d.dan === dan) ?? null,
      rows: answer.rows.filter((r) => r.dan === dan),
    })).filter((d) => d.rows.length > 0);
    setPrinting({
      opener,
      sheet: { cycleName: answer.cycle.name, dates: answer.cycle.days.map((d) => d.date), dans, printedAt: new Date() },
    });
  }
  useEffect(() => {
    if (!printing) return undefined;
    if (screenLocked) {
      setPrinting(null); // no print window over the lock screen (and none popping up after unlocking)
      return undefined;
    }
    const done = () => {
      const opener = printing.opener;
      setPrinting(null);
      focusLater(() => (opener?.isConnected ? opener : null));
    };
    window.addEventListener('afterprint', done);
    const frame = window.requestAnimationFrame(() => window.print()); // wait one frame so the sheet is drawn
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
    // (focusLater is a plain function of this component; only a new print matters here.)
  }, [printing, screenLocked]);

  // ----- Choose subjects (admins, G 21–23 — C1's dialog) -----
  function closeChoose(changed) {
    const opener = choose?.opener;
    setChoose(null);
    if (changed) reload();
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

  // ----- Open grades — the ⋯'s first item and a row click (proposal 17) -----
  function openGrades(row) {
    clearToast();
    const days = dataRef.current?.cycle?.days ?? cycle?.days ?? [];
    onOpenGrades?.({ dan: row.dan, dayKey: openGradesDay(row, days), candidateId: row.id });
  }

  // ----- The ⋯ menu (proposal 17) -----
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
    const busy = busyId !== null || line.busy;
    // ti-school = open a candidate's grades
    const items = [{ key: 'open', label: T.OPEN_GRADES, Icon: IconSchool, onSelect: () => openGrades(row) }];
    if (canEmail(row) && row.hasEmail && !isSent(row)) {
      // ti-mail-check = mark an email as sent
      items.push({ key: 'mark', label: T.MARK_AS_SENT, Icon: IconMailCheck, disabled: busy || !online, onSelect: () => markAsSent(row) });
    }
    if (isSent(row)) {
      const label = isAdmin ? (
        T.UNDO_MARK_AS_SENT
      ) : (
        <span className="ev-menu-two">
          <span>{T.UNDO_MARK_AS_SENT}</span>
          <span className="ev-menu-reason">{T.UNDO_STAFF_GRAYED}</span>
        </span>
      );
      // ti-arrow-back-up = Undo
      items.push({ key: 'undo', label, Icon: IconArrowBackUp, disabled: !isAdmin || busy || !online, onSelect: () => openUndoConfirm(row, anchor) });
    }
    return { title: nameOf(row), subtitle: T.menuSubtitle(row.dan, T.schoolName(row.locationCode)), label: T.moreFor(nameOf(row)), items };
  }

  // ===== Keyboard: ↑ ↓ Enter on rows (Enter = Open grades) =====
  const nav = useRowArrowNav({
    rowKeys: rows.map((r) => r.id),
    onOpen: (rowId) => {
      const row = findRow(rowId);
      if (row) openGrades(row);
    },
  });

  // ===== Drawing =====
  const danLabelId = `${panelId}-dan`;
  const danSwitch = (
    <div className="ev-side bbres-dan">
      <span id={danLabelId} className="visually-hidden">
        {T.DAN_SWITCH_LABEL}
      </span>
      <ChoiceGroup
        labelId={danLabelId}
        value={danSel}
        onChange={setDan}
        options={DANS.map((dan) => {
          const count = countOf(dan);
          return {
            key: dan,
            label: count === null ? T.danLabel(dan) : T.danChoiceLabel(dan, count),
            content: (
              <>
                {T.danShort(dan)}
                <span className="bbres-dw">{'\u00A0' /* a no-break space: a plain one is dropped inside the flex switch */}{T.DAN_WORD}</span>
                {count !== null && <span className="ev-side-count">{count}</span>}
              </>
            ),
          };
        })}
      />
    </div>
  );
  const buttons = (
    <span className="bbres-buttons">
      <button
        type="button"
        className="btn bbres-print"
        aria-disabled={!online || printBusy ? 'true' : undefined}
        aria-describedby={!online && data ? `${whyId}-buttons` : undefined}
        onClick={(event) => printResults(event.currentTarget)}
      >
        {/* ti-printer = print */}
        <IconPrinter size={16} aria-hidden="true" />
        {T.PRINT_RESULTS}
      </button>
      {isAdmin && !hidden && (
        <button
          type="button"
          className="btn bbres-csv"
          aria-disabled={!online || csvBusy ? 'true' : undefined}
          aria-describedby={!online && data ? `${whyId}-buttons` : undefined}
          onClick={download}
        >
          {/* ti-download = download a file */}
          <IconDownload size={16} aria-hidden="true" />
          {T.DOWNLOAD_CSV}
        </button>
      )}
    </span>
  );

  const ctx = {
    layout,
    nav,
    isAdmin,
    emailOff,
    markOff: !online,
    lineBusy: line.busy, // a save or an Undo holds the line: Email result / Mark as sent on every row are unavailable, never silent (C3)
    whyId: !online ? `${whyId}-rows` : undefined, // aria-describedby for Mark as sent while offline
    // R4-08: Email result points at every gray line that explains why it is off: the hidden-details line and/or the offline line
    emailWhyId: [hidden ? `${whyId}-hidden` : null, !online ? `${whyId}-rows` : null].filter(Boolean).join(' ') || undefined,
    today,
    danObj,
    submissionsDue,
    label: T.tableLabel(danSel),
    menuFor: menu?.id ?? null,
    busyId,
    asked,
    handlers: {
      onOpen: openGrades,
      onEmail: (row) => emailResult(row),
      onMarkSent: (row) => markAsSent(row),
      onMore: openMenu,
      onChooseSubjects: (row, opener) => setChoose({ rowId: row.id, opener }),
    },
  };

  let body;
  if (!data && live.status === 'error') {
    body = <PageBar text={T.LOAD_FAILED} onRetry={() => reload()} />;
  } else if (!data) {
    body = (
      <>
        {danCounts && (
          <div className={`bbres-bar${isPhone ? ' bbres-bar--phone' : ''}`}>
            {danSwitch}
            {buttons}
          </div>
        )}
        <div className="clist tskeleton" aria-busy="true">
          <span className="visually-hidden">{T.LOADING_RESULTS}</span>
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="tskeleton-row bbres-skel-row" aria-hidden="true">
              <span className="tskeleton-bar" />
            </div>
          ))}
        </div>
      </>
    );
  } else {
    const parts = oneSchool ? T.emptyOneSchoolParts(schoolLabel, danSel) : null;
    body = (
      <>
        <div className={`bbres-bar${isPhone ? ' bbres-bar--phone' : ''}`}>
          {danSwitch}
          {buttons}
        </div>
        {!online && (
          <p id={`${whyId}-buttons`} className="bbres-note bbres-note--buttons">
            {/* ti-wifi-off = no connection */}
            <IconWifiOff size={16} aria-hidden="true" />
            {T.OFFLINE_WHY_BUTTONS}
          </p>
        )}
        <p className="bbres-summary">
          <span className="bbres-summary-dan">{T.danLabel(danSel)}</span>
          {T.summaryRest(counts) /* " · 5 candidates · 1 passed …" after the Dan in medium weight */}
        </p>
        {rows.length === 0 ? (
          <p className="tempty bbres-empty">
            {oneSchool ? (
              <>
                {parts[0]}
                <button type="button" className="link-button bbres-inline-link" onClick={() => onLocationChange('Both')}>
                  {parts[1]}
                </button>
                {parts[2]}
              </>
            ) : (
              T.emptyDanBoth(danSel)
            )}
          </p>
        ) : (
          <>
            {!online && (
              <p id={`${whyId}-rows`} className="bbres-note">
                {/* ti-wifi-off = no connection */}
                <IconWifiOff size={16} aria-hidden="true" />
                {T.OFFLINE_WHY_ROWS}
              </p>
            )}
            {rows.every((r) => nothingYet(r.result)) && <p className="bbres-note">{T.NO_GRADES_YET}</p>}
            {hidden && (
              <p id={`${whyId}-hidden`} className="bbres-note">
                {/* ti-currency-dollar-off = payments hidden on this device (the top bar's chip) */}
                <IconCurrencyDollarOff size={16} aria-hidden="true" />
                {T.EMAIL_OFF_HIDDEN}
              </p>
            )}
            <ResultRows rows={rows} ctx={ctx} />
          </>
        )}
      </>
    );
  }

  const content = menu && !screenLocked ? menuContent() : null;
  const chooseRow = choose ? findRow(choose.rowId) : null;

  return (
    <>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel bbres-panel">
        {banner && (
          <PageBar
            takeFocus={banner.takeFocus === true}
            text={banner.text}
            onRetry={banner.retry ? () => banner.retry() : undefined}
            retrying={busyId !== null || csvBusy || printBusy || banner.retrying === true}
            onDismiss={() => setBanner(null)}
          />
        )}
        {oneSchool && (
          <p className="bbres-school-line">
            {T.showingSchoolOnly(schoolLabel)} ·{' '}
            <button type="button" className="link-button bbres-inline-link" onClick={() => onLocationChange('Both')}>
              {T.SHOW_BOTH_SCHOOLS}
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
        // The shared ConfirmBox, the same as Star's Undo Mark as sent box (rulebook v1.008): "Keep send
        // record" on the left and focused first, the action blue (it only reverses) with the undo arrow,
        // "Undoing…" while it works.
        <ConfirmBox
          title={T.undoConfirmTitle(nameOf(confirm.row))}
          keepLabel={T.UNDO_CONFIRM_KEEP}
          actionLabel={T.UNDO_CONFIRM_GO}
          busyLabel={T.UNDO_CONFIRM_BUSY}
          actionIcon={IconArrowBackUp}
          loses="something"
          busy={confirm.saving}
          failed={confirm.failed ? T.undoSentRefusal('error') : null}
          onConfirm={confirmUndo}
          onKeep={() => !confirm.saving && closeConfirm()}
        >
          {T.undoConfirmBody(confirm.day)}
        </ConfirmBox>
      )}
      {choose && chooseRow && !screenLocked && (
        <MakeupSubjectsDialog
          candidate={{ id: chooseRow.id, firstName: chooseRow.firstName, lastName: chooseRow.lastName }}
          result={chooseRow.result}
          rubric={dataRef.current?.rubrics?.find((d) => d.dan === chooseRow.dan) ?? danObj}
          isAdmin={isAdmin}
          isPhone={isPhone}
          onClose={closeChoose}
          onNoAccess={onNoAccess}
        />
      )}
      {printing && !screenLocked && <ResultsSheet {...printing.sheet} />}
    </>
  );
}
