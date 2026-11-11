// PrivateTestingTab.jsx — the "Private testing" tab of Color belt testing (mockups P1–P4, P7;
// contract 0014 §5.2–§5.4, §5.7; rulebook v0.401–v0.404).
// Why it exists: a family who can't (or doesn't want to) test at a testing event can test
// privately, on their own day and time, at the rank's private price. Each private testing is its
// own record — not part of any event — so it gets its own tab, at the far right of the tab bar.
// This file is the "brain" of the tab. It:
//   - loads the school's private testings (useLiveLoad + privateApi.loadPrivateTestings — reloads
//     quietly every 15 seconds, after every change, when the school changes, after unlocking)
//   - shows them on an Upcoming / Past switch (opens on Upcoming, kept per school), with four
//     cards over the side shown (count, Paid + a gray "1 owes more", Not paid, Payments recorded +
//     "includes $85 from cancelled"; Paid and Not paid filter, CB9) and the rows (PrivateRows.jsx)
//   - Add private testing (all staff, the header button), Mark paid (its box, then a 5-second
//     Undo), and the ⋯ menu: Edit details · Change day or time · Grade · Change how they'll pay
//     (v1.011) | Edit payment · Undo payment (admins) · Print receipt (CB2) | Cancel private
//     testing · Delete permanently (admins); a cancelled row: Print receipt while a payment still
//     stands (staff and admins, pass 2 M-03, v0.428) | Restore | Delete permanently (admins)
//   - tapping a row opens its read-only summary (PrivateSummaryDialog.jsx, v1.009), with
//     Close · Edit details
//   - Undo for 5 seconds (v1.006, v0.413, v1.003) after Edit details ("Changes saved", not when the
//     change cleared a result or the old rank's price / class changed since), Change day or time
//     ("Changes saved", same), Restore, Change how they'll pay ("Changes saved") and Edit payment
//     ("Payment changed"). An Undo of Edit details / Change day or time is refused when a result
//     was recorded in the meantime (refuseUndoIfGraded).
// Rules (as the Events tab, contract 0003 §8): one change at a time; dialog saves wait for the
// database; the dialog's values live HERE, so a screen lock hides the dialog and brings it back;
// "stale" = someone else changed it — nothing is overwritten, the person is told, the list reloads.
// Admin vs staff only changes what is SHOWN — the database enforces who may do what.
// The design review's part 2 (rulebook v0.420 / v0.421 / v0.423, mockups P2 and P3; the event
// roster's step 3 and Star's v0.518 copied):
//   - CB1: Mark paid opens the shared Mark paid box (what is still owed — on a top-up only the
//     rest, "Ava Chen · $20" — and Paid by Cash / Check / Card preset to Paying by) and calls
//     testing_private_mark_paid_by (migration 0030); a different way also changes Paying by; an
//     amount that changed meanwhile saves nothing and the bar says to press Mark paid again
//     (v0.423). The toast's Undo stays one tap;
//   - CB3 (second half): ⋯ → Undo payment asks first on the shared confirm box, naming the LATEST
//     payment and what the row becomes;
//   - CB2: ⋯ → Print receipt (staff and admins, a row with a payment that still stands) opens the
//     shared receipt, built by lib/testing/receipt.js ("Moved from · [event]" when it was moved);
//   - CB9: the shared count cards. Private testings shows everyone; Paid and Not paid filter the
//     rows ("Showing not paid only · Show all"); Payments recorded stays a total. The filter stays
//     on when switching Upcoming / Past (v0.420 Q2 A) and is kept per school while the page is
//     open, as the side is; the cards count the side shown.
// Follows "Hide private details" (v0.506, v0.507 Q2), as Star's Candidates tab: while the device
// switch is on, only the Private testings card shows (no filter applies), the rows have no price,
// Paying by, Payment, Paid on, "Paid $65 · $20 more to collect" line or Mark paid, the ⋯ menu has
// no payment items (privateMenu's `hidden`, Print receipt included), and the dialogs name no
// amount. Turning it on closes an open payment dialog and the Mark paid box, clears the Paid /
// Not paid filter, closes the ⋯ menu and clears the toast. (Color Belt keeps no date of birth or
// email.) An open receipt stays: it shows the shared receipt's gray "hidden" line.
// Batch 2 (design review pass 1 R2-05 / R2-07 / R1-06 / R1-07 toasts / R1-08; rulebook v1.125–v1.131):
//   - "one change at a time" now lives in the shared save line (lib/saveLine.js): line.begin() /
//     line.end() replace the page's own flag, and every toast's Undo is line.undoAction(run): an Undo
//     pressed while another save runs WAITS ("Undoing…") instead of being dropped, and the line itself
//     says "Undone" or shows the failed Undo's bar;
//   - the page's bars are ONE bar (`banner`, with a kind) drawn with PageBar under the top bar; bars
//     inside a dialog stay ErrorBanners;
//   - a refused change says "Someone else changed [Name] just now…", a refused Undo "Couldn't undo: …".
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  IconArrowBackUp,
  IconCalendar,
  IconCalendarX,
  IconCashEdit,
  IconCheck,
  IconCircleX,
  IconEdit,
  IconPlus,
  IconPrinter,
  IconSchool,
  IconSum,
  IconSwitchHorizontal,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import CountCards from '../../../components/CountCards.jsx';
import MarkPaidBox from '../../../components/MarkPaidBox.jsx';
import PageBar from '../../../components/PageBar.jsx';
import ReceiptDialog from '../../../components/Receipt.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { LOCATION_CODE } from '../../../lib/device.js';
import { usePrivateDetailsHidden } from '../../../lib/privateDetails.js';
import { useSaveLine } from '../../../lib/saveLine.js';
import { centsToInputText, formatMoney } from '../../../lib/money.js';
import { loadSchools } from '../../../lib/settings/schoolsApi.js';
import { loadClassesAndRanks } from '../../../lib/testing/api.js';
import { withTestingFor } from '../../../lib/testing/rankOrder.js';
import { loadMyName, schoolToday } from '../../../lib/testing/eventsApi.js';
import {
  addPrivate,
  cancelPrivate,
  changePrivateDay,
  changePrivatePayingBy,
  deletePrivate,
  editPrivatePayment,
  loadPrivateTestings,
  markPrivatePaidBy,
  restorePrivate,
  undoPrivatePayment,
  updatePrivate,
} from '../../../lib/testing/privateApi.js';
import { PRIVATE_ROOM, amountDue, markPaidChoiceWhere, privateCards, privateMenu, showMarkPaid, splitPrivate } from '../../../lib/testing/privateRules.js';
import { rosterLayoutFor } from '../../../lib/testing/eventRules.js';
import { usePageRoomBelow } from '../../../lib/pageRoom.js';
import { buildColorBeltReceipt } from '../../../lib/testing/receipt.js';
import { PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { useRowArrowNav } from '../../../lib/useRowArrowNav.js';
import { takeOpenPerson } from '../../../lib/people/openPerson.js';
import { useOpenPersonTick } from '../../../lib/people/useOpenPerson.js';
import ChoiceGroup from '../../../components/ChoiceGroup.jsx';
import ConfirmBox from '../../../components/ConfirmBox.jsx';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../lib/useLiveLoad.js';
import { EditPaymentDialog, PayingByDialog, checkEditPayment, isEditPaymentDirty, isPayingByDirty } from '../event/PaymentDialogs.jsx';
import ChangeDayDialog, { checkChangeDay, isChangeDayDirty } from './ChangeDayDialog.jsx';
import PrivateDialog, { COPIED, checkPrivateForm, isPrivateFormDirty } from './PrivateDialog.jsx';
import PrivateRows from './PrivateRows.jsx';
import PrivateSummaryDialog from './PrivateSummaryDialog.jsx';
import * as T from '../text.js';
import '../../../styles/testing-private.css';

// Upcoming / Past, per school, kept while the page is open (as the Events tab).
const sideBySchool = new Map();
// The Paid / Not paid card filter (CB9), per school, kept while the page is open, as the side is
// (v0.420 Q2 A). null = everyone.
const filterBySchool = new Map();
// Notes that make Save unavailable until the dialog is closed and opened again.
const BLOCKING_NOTES = ['STALE_DIALOG', 'NOT_ALLOWED', 'STUDENT_LOCKED', 'PRIVATE_GRADED', 'ALREADY_PAID'];
// The dialogs that are about money: closed when Hide private details is switched on.
const PAYMENT_DIALOGS = ['paying', 'payment', 'undoPayment'];

const find = (selector) => document.querySelector(selector);
const rowEl = (id) => find(`[data-private-row="${id}"]`);
const moreEl = (id) => find(`[data-private-more="${id}"]`);
const addEl = () => find('[data-add-private]');
const usable = (element) => (element && element.isConnected && element.getClientRects().length > 0 ? element : null);

// A private testing's live payments (not reversed), oldest first — the one Edit / Undo payment
// act on is the last; two or more name every part (the top-up wording).
function livePaymentsOf(payments, privateId) {
  const mine = payments.filter((p) => p.privateId === privateId);
  const reversed = new Set(mine.filter((p) => p.kind === 'reversal').map((p) => p.reversesPaymentId));
  return mine
    .filter((p) => p.kind === 'payment' && !reversed.has(p.id))
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0));
}
const partsOf = (live) => live.map((p) => ({ cents: p.amountCents, method: p.method, paidOn: p.paidOn }));

// Edit details' Undo after a belt change sends the old rank id back, and the database then copies
// that rank's CURRENT private price, class and "testing for". So the Undo only puts things back as
// they were when the old rank (in the Classes and ranks loaded for the dialog) still has exactly
// what the record stored. Unknown (classes not loaded, rank gone) = not unchanged.
function oldRankUnchanged(record, classes) {
  for (const cls of classes ?? []) {
    const rank = cls.ranks.find((r) => r.id === record.rankId);
    if (!rank) continue;
    const storedFor = record.testingFor?.kind === 'rank' ? record.testingFor.name : null;
    const currentFor = rank.testingFor?.name ?? null;
    return rank.privateCents === record.privateCents && cls.name === record.className && currentFor === storedFor;
  }
  return false;
}

export default function PrivateTestingTab({
  school,
  isAdmin,
  panelId,
  tabId,
  renderHeader,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
  onOpenPrivate,
  deviceLocation, // 'Worcester' | 'Shrewsbury' — This device's school: where Mark paid's money counts (R1-01)
}) {
  const locationCode = LOCATION_CODE[school];
  const live = useLiveLoad({ key: locationCode, enabled: !screenLocked, load: loadPrivateTestings, refreshMs: LIVE_REFRESH_MS });
  const rows = live.data?.rows ?? [];
  const payments = live.data?.payments ?? [];
  const today = live.data?.today ?? schoolToday();
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });

  // ----- Device -----
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const layout = { isPhone, isTouch, isWide };
  // Only the list follows the room beside the left panel (batch 3 Q1, as the event roster, lib/pageRoom.js):
  // narrower than PRIVATE_ROOM its tablet columns would run text into text, so it draws its phone rows.
  // Dialogs, ⋯ menus and the rest of the page keep following the window (isPhone).
  const narrowRoom = usePageRoomBelow(PRIVATE_ROOM);
  const listLayout = rosterLayoutFor(layout, narrowRoom);
  const [hidden] = usePrivateDetailsHidden(); // Hide private details (v0.506)

  // ----- State -----
  const [side, setSideState] = useState(() => sideBySchool.get(locationCode) ?? 'upcoming');
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null); // { id, anchor, row }
  // The page's ONE bar (drawn with PageBar): { text, retry?, kind?, retrying?, takeFocus? }.
  // kind: 'row' (a failed row save, with Retry) | 'price' (the amount changed) | 'undo' (the save
  // line's bar for a failed or refused Undo) | none (a refusal or a load failure).
  const [banner, setBanner] = useState(null);
  // R2-05: the save line — one save or Undo at a time; an Undo pressed meanwhile waits its turn.
  // line.busy replaces the page's own busy flag. undoBar is where the line puts a failed Undo's bar.
  const line = useSaveLine({
    section: 'Color belt testing',
    showToast,
    undoBar: (next) => setBanner((current) => (next ? { kind: 'undo', ...next } : current?.kind === 'undo' ? null : current)),
  });
  const [notSavedId, setNotSavedId] = useState(null);
  const [classes, setClasses] = useState(null); // live Classes and ranks for Add / Edit details
  // CB9: the card filter — null | 'paid' | 'notPaid' (kept per school while the page is open)
  const [filter, setFilterState] = useState(() => filterBySchool.get(locationCode) ?? null);
  // CB1: the shared Mark paid box under a row's Mark paid — { key, rowId, anchor, snap, amountCents }
  // or null. snap = the row as it was when the box opened (its version goes to the database).
  const [markPaidBox, setMarkPaidBox] = useState(null);
  // CB2: the receipt — { key, rowId, opener, data, notFound } or null (data null while it loads).
  const [receipt, setReceipt] = useState(null);
  const schoolsRef = useRef(null); // both schools (the receipt's footer), read once
  // A flip of the list's layout (the window crosses a breakpoint, or the room beside the panel crosses
  // PRIVATE_ROOM after a Panel size change) redraws every row's buttons, so an open ⋯ menu or Mark paid
  // box would point at a button that is gone: close them, as the event roster does (EventPage.jsx).
  const listIsPhone = listLayout.isPhone;
  useEffect(() => {
    setMenu(null);
    setMarkPaidBox(null);
  }, [listIsPhone, isPhone]);
  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
  });

  function setSide(next) {
    sideBySchool.set(locationCode, next);
    setSideState(next);
  }
  function setFilter(next) {
    filterBySchool.set(locationCode, next);
    setFilterState(next);
  }
  const previousCodeRef = useRef(locationCode);
  useEffect(() => {
    if (previousCodeRef.current === locationCode) return;
    previousCodeRef.current = locationCode;
    setSideState(sideBySchool.get(locationCode) ?? 'upcoming');
    setFilterState(filterBySchool.get(locationCode) ?? null);
    setBanner(null);
    setMenu(null);
    setMarkPaidBox(null);
    setReceipt(null);
    setNotSavedId(null);
  }, [locationCode]);

  // ----- One change at a time (the save line, R2-05) -----
  // beginSave(retry) → null while a save or an Undo runs (the caller returns, as the old flag did),
  // else a `done(status)` function: call it exactly once when the save ends (callSave does, from a
  // finally); a second call does nothing. retry = what a bar's Retry calls to redo this save (only the
  // saves that have their own bar Retry give one). A failed save clears the toast, as before.
  function beginSave(retry) {
    const token = line.begin();
    if (!token) return null;
    let ended = false;
    return (status = 'error') => {
      if (ended) return;
      ended = true;
      line.end(status, { retry, token });
      if (status && status !== 'ok') clearToast();
    };
  }
  // Runs a save's database call and ends the save from a finally, so even a call that threw frees the line.
  async function callSave(done, call) {
    let result = { status: 'error' };
    try {
      result = await call();
    } finally {
      done(result.status);
    }
    return result;
  }

  // ----- Keyboard focus after a dialog closes (as the Events tab) -----
  const pendingFocusRef = useRef(null);
  const [, setFocusTick] = useState(0);
  function focusLater(findTarget, fallback = null, waitFor = null) {
    const request = { findTarget, fallback, waiting: Boolean(waitFor) };
    pendingFocusRef.current = request;
    setFocusTick((n) => n + 1);
    if (waitFor) {
      waitFor.finally(() => {
        if (pendingFocusRef.current !== request) return;
        request.waiting = false;
        setFocusTick((n) => n + 1);
      });
    }
  }
  useEffect(() => {
    const request = pendingFocusRef.current;
    if (!request || request.waiting || screenLocked || dialog) return undefined;
    const target = usable(request.findTarget()) ?? usable(request.fallback?.());
    request.tries = (request.tries ?? 0) + 1;
    if (target && target.closest('[inert]') && request.tries < 30) {
      const frame = window.requestAnimationFrame(() => setFocusTick((n) => n + 1));
      return () => window.cancelAnimationFrame(frame);
    }
    pendingFocusRef.current = null;
    target?.focus();
    return undefined;
  });

  // ----- Reloading -----
  async function reloadQuiet() {
    const result = await liveRef.current.reload();
    if (result === 'error') setBanner({ text: T.LOAD_PRIVATE_FAILED, retry: retryLoad });
    return result;
  }
  async function retryLoad() {
    const result = await liveRef.current.reload();
    if (result === 'ok') setBanner(null);
  }
  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  // Locking closes the ⋯ menu; dialogs only hide.
  useEffect(() => {
    if (screenLocked) setMenu(null);
  }, [screenLocked]);
  const modalShown = (dialog !== null || receipt !== null) && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  // Hide private details switched on: no payment dialog, menu or toast may stay (as Star, G4).
  // The switch's value RIGHT NOW (updated on every drawing, as Star's hiddenNowRef): a save already
  // on its way when the switch turned on reads it when the answer arrives.
  const hiddenNowRef = useRef(hidden);
  hiddenNowRef.current = hidden;
  const hiddenBeforeRef = useRef(hidden);
  useEffect(() => {
    const switchedOn = hidden && !hiddenBeforeRef.current; // a change, not the first drawing
    hiddenBeforeRef.current = hidden;
    if (!switchedOn) return;
    const d = dialogRef.current;
    // (Even mid-save: the save still finishes, and its toast names no amount.)
    if (d && PAYMENT_DIALOGS.includes(d.type)) {
      setDialog(null);
      focusAfterClose(d);
    }
    setMenu(null);
    setFilter(null); // only the Private testings card shows, so no filter applies (CB9)
    setMarkPaidBox(null); // no Mark paid while hidden (an open receipt stays: it shows v1.105's gray line)
    // A toast may name money ("marked paid · $85 cash") or carry a payment Undo: it goes too.
    clearToast();
    // So does every banner: a failed Mark paid / Undo payment keeps a Retry that records money,
    // and "already marked paid" names paid status. The row's Not saved mark goes with it.
    setBanner(null);
    setNotSavedId(null);
    // (only when the switch changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  // ===== The two sides, the cards and the card filter =====
  const { upcoming, past } = splitPrivate(rows, today);
  const sideRows = side === 'past' ? past : upcoming;
  const cards = privateCards(sideRows); // the cards count the side shown, never the filter
  // CB9: Paid / Not paid show only the ACTIVE rows the card counts (a cancelled row is in neither).
  // While Hide private details is on no filter applies (only the Private testings card shows).
  const shownFilter = hidden ? null : filter;
  let shown = sideRows;
  if (shownFilter === 'paid') shown = sideRows.filter((r) => r.status === 'active' && r.paid);
  if (shownFilter === 'notPaid') shown = sideRows.filter((r) => r.status === 'active' && !r.paid);

  // CB1: a Mark paid box that can no longer show is forgotten (after drawing — never while
  // drawing): its row has nothing left to collect (another device), was cancelled or deleted, left
  // the view (the other side, a filter), or the screen locked / private details were hidden.
  const markPaidBoxRow = markPaidBox ? rows.find((r) => r.id === markPaidBox.rowId) : null;
  const markPaidGone =
    markPaidBox !== null &&
    (screenLocked || hidden || !markPaidBoxRow || !showMarkPaid(markPaidBoxRow) || !markPaidBox.anchor?.isConnected);
  useEffect(() => {
    if (markPaidGone) setMarkPaidBox(null);
  }, [markPaidGone]);

  // ===== Dialogs =====
  function openDialog(next) {
    clearToast();
    setMenu(null);
    setDialog({ key: Date.now(), touched: {}, triedSave: false, note: null, noteText: null, blocked: false, saving: false, failed: false, pastDay: null, ...next });
  }
  function patchDialog(patch) {
    setDialog((current) => (current ? { ...current, ...patch } : current));
  }
  function changeValues(patch) {
    setDialog((current) => {
      if (!current || current.saving) return current;
      const note = current.note && !BLOCKING_NOTES.includes(current.note) ? null : current.note;
      return { ...current, values: { ...current.values, ...patch }, note };
    });
  }
  function touch(field) {
    setDialog((current) => (current && !current.touched[field] ? { ...current, touched: { ...current.touched, [field]: true } } : current));
  }

  // The live Classes and ranks (Add / Edit details copy from them), read fresh each time.
  async function readClasses() {
    const result = await loadClassesAndRanks(locationCode);
    if (result.status === 'no_access') {
      onNoAccess();
      return null;
    }
    if (result.status !== 'ok') {
      setBanner({ text: T.LOAD_PRIVATE_FAILED, retry: retryLoad });
      return null;
    }
    return withTestingFor(result.classes);
  }

  async function openAdd(opener) {
    const done = beginSave();
    if (!done) return;
    let list = null;
    try {
      list = await readClasses();
    } finally {
      done(list ? 'ok' : 'error');
    }
    if (!list) return;
    setClasses(list);
    const values = { firstName: '', lastName: '', classId: null, rankId: null, stripes: false, payingBy: 'cash', day: '', time: '' };
    openDialog({ type: 'private', mode: 'add', values, initial: values, opener });
  }
  async function openEdit(row, opener) {
    // The dialog opens at once with the copied class and belt; the live list follows.
    const values = { firstName: row.firstName, lastName: row.lastName, classId: row.classId ?? COPIED, rankId: row.rankId ?? COPIED };
    setClasses(null);
    openDialog({ type: 'private', mode: 'edit', rowId: row.id, snapshot: row, values, initial: values, opener });
    const list = await readClasses();
    if (list) setClasses(list);
  }
  // The read-only summary (v1.009): tapping a row, or Enter on it.
  function openView(row, opener) {
    openDialog({ type: 'view', rowId: row.id, snapshot: row, opener });
  }
  // Top-bar "Search people" (M16, rulebook v1.144): Testing.jsx opened this tab for a tapped private
  // testing; once the list has loaded, take the one-shot request (kind 'colorbelt_private') and open
  // that summary the way a click on its row does. Found by id in the whole list (the Upcoming / Past
  // side and the Paid filter can't hide it). Not in the list: nothing opens and nothing is said.
  const personTick = useOpenPersonTick(); // a search while this tab is already showing
  useEffect(() => {
    if (live.status !== 'ready' || screenLocked) return;
    const request = takeOpenPerson(['colorbelt_private']);
    if (!request) return;
    const row = rows.find((r) => r.id === request.id);
    if (row) openView(row, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the list is ready and when a new search arrives
  }, [live.status, screenLocked, personTick]);
  // Its Edit details button: the summary closes and Edit details opens in its place.
  function editFromView() {
    const d = dialogRef.current;
    if (!d || d.type !== 'view') return;
    const row = rows.find((r) => r.id === d.rowId) ?? d.snapshot;
    openEdit(row, d.opener ?? rowEl(d.rowId));
  }
  function openChangeDay(row, opener) {
    const values = { day: row.privateDate, time: row.privateTime };
    openDialog({ type: 'changeDay', rowId: row.id, snapshot: row, values, initial: values, opener });
  }
  function openPayingBy(row, opener) {
    const values = { payingBy: row.payingBy };
    openDialog({ type: 'paying', rowId: row.id, snapshot: row, values, initial: values, opener });
  }
  function openEditPayment(row, opener) {
    const liveList = livePaymentsOf(payments, row.id);
    const payment = liveList[liveList.length - 1];
    if (!payment) return;
    const values = { method: payment.method, amount: centsToInputText(payment.amountCents), paidOn: payment.paidOn };
    // undoTo: the payment as it is now, so the toast's Undo can put it back (v1.003)
    const undoTo = { method: payment.method, amountCents: payment.amountCents, paidOn: payment.paidOn };
    openDialog({ type: 'payment', rowId: row.id, snapshot: row, paymentId: payment.id, parts: partsOf(liveList), editingCents: payment.amountCents, undoTo, values, initial: values, opener });
  }
  function openCancel(row, opener) {
    const liveList = livePaymentsOf(payments, row.id);
    // "The $85 cash payment stays recorded" — the net paid, with the most recent method.
    const payment = row.paid ? { cents: row.paidCents, method: liveList[liveList.length - 1]?.method ?? row.paidMethod } : null;
    // The sentence is written when drawn (bodyParts), so it follows Hide private details.
    openDialog({ type: 'cancel', rowId: row.id, snapshot: row, bodyParts: [row.privateDate, row.privateTime, payment], opener });
  }
  function openDelete(row, opener) {
    const liveList = livePaymentsOf(payments, row.id);
    const result = row.result ? { result: row.result, resultAt: row.resultAt } : null;
    const movedFrom = row.movedFromEventName ? { eventName: row.movedFromEventName, firstName: row.firstName } : null;
    openDialog({
      type: 'delete',
      rowId: row.id,
      snapshot: row,
      bodyParts: [partsOf(liveList), result, movedFrom], // written when drawn (Hide private details)
      args: { privateId: row.id, expectedVersion: row.version, expectedPaymentIds: payments.filter((p) => p.privateId === row.id).map((p) => p.id) },
      index: shown.findIndex((r) => r.id === row.id),
      opener,
    });
  }

  function focusAfterClose(d) {
    if (d.type === 'private' && d.mode === 'add') focusLater(() => d.opener, addEl);
    else if (d.type === 'delete' || d.type === 'cancel') focusLater(() => moreEl(d.rowId), addEl);
    else if (d.type === 'view') focusLater(() => rowEl(d.rowId), addEl); // back to the row it opened from
    else focusLater(() => moreEl(d.rowId), () => d.opener ?? rowEl(d.rowId));
  }
  function cancelDialog() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    setDialog(null);
    focusAfterClose(d);
  }
  function isDirty(d) {
    if (d.type === 'private') return isPrivateFormDirty(d);
    if (d.type === 'changeDay') return isChangeDayDirty(d);
    if (d.type === 'paying') return isPayingByDirty(d);
    if (d.type === 'payment') return isEditPaymentDirty(d);
    return false;
  }
  function requestClose() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    if (!isDirty(d)) {
      cancelDialog();
      return;
    }
    if (!BLOCKING_NOTES.includes(d.note)) patchDialog({ note: 'UNSAVED' });
  }

  // A dialog save the database didn't accept (§5.7, the first row).
  function handleDialogProblem(result, d) {
    const status = result.status;
    const name = T.studentLabel(d.snapshot ?? { firstName: d.values.firstName, lastName: d.values.lastName });
    if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (status === 'past_day') {
      patchDialog({ saving: false, pastDay: d.values.day });
    } else if (status === 'final_award_not_set') {
      patchDialog({ saving: false, note: 'FINAL_AWARD', noteText: result.className ?? '' });
    } else if (status === 'not_allowed') {
      patchDialog({ saving: false, note: d.type === 'private' && d.mode === 'edit' ? 'STUDENT_LOCKED' : 'NOT_ALLOWED', blocked: true });
      onRefreshProfile();
      reloadQuiet();
    } else if (status === 'graded') {
      patchDialog({ saving: false, note: 'PRIVATE_GRADED', blocked: true });
      reloadQuiet();
    } else if (status === 'stale' || status === 'not_found') {
      patchDialog({ saving: false, note: 'STALE_DIALOG', blocked: true });
      reloadQuiet();
    } else if (status === 'cancelled') {
      setDialog(null);
      setBanner({ text: T.PRIVATE_IS_CANCELLED });
      reloadQuiet();
      focusAfterClose(d);
    } else if (status === 'already_paid') {
      patchDialog({ saving: false, note: 'ALREADY_PAID', blocked: true });
      reloadQuiet();
    } else if (status === 'withdrawn') {
      setDialog(null);
      setBanner({ text: T.isWithdrawn(name) });
      reloadQuiet();
    } else if (status === 'invalid') {
      patchDialog({ saving: false, note: 'INVALID_DIALOG' });
    } else {
      patchDialog({ saving: false, note: 'SAVE_FAILED' });
    }
  }

  // ----- Save: Add private testing / Edit details -----
  async function savePrivateForm(canSave) {
    const d = dialogRef.current;
    if (!d || d.saving || d.type !== 'private') return;
    const record = d.mode === 'edit' ? d.snapshot : null;
    const check = checkPrivateForm(d, record, { today });
    if (!canSave || !check.canSave) {
      patchDialog({ triedSave: true });
      return;
    }
    if (check.sameAsSaved) {
      cancelDialog();
      return;
    }
    const done = beginSave();
    if (!done) return;
    patchDialog({ saving: true, note: null });
    const p = check.payload;
    if (d.mode === 'add') {
      const result = await callSave(done, () =>
        addPrivate({
          locationCode,
          firstName: p.firstName,
          lastName: p.lastName,
          rankId: p.rankId,
          stripes: true,
          payingBy: p.payingBy,
          privateDate: p.privateDate,
          privateTime: p.privateTime,
        }),
      );
      if (result.status !== 'ok') {
        handleDialogProblem(result, d);
        return;
      }
      // No toast after Add: the new row is the confirmation (P2).
      setDialog(null);
      if (side !== 'upcoming') setSide('upcoming');
      setFilter(null); // the new row shows even when a card filter was on (as the event roster)
      const reloaded = reloadQuiet();
      focusLater(() => rowEl(result.id), addEl, reloaded);
      return;
    }
    const result = await callSave(done, () =>
      updatePrivate({ privateId: d.rowId, expectedVersion: record.version, firstName: p.firstName, lastName: p.lastName, rankId: p.rankId }),
    );
    if (result.status !== 'ok') {
      handleDialogProblem(result, d);
      return;
    }
    setDialog(null);
    const reloaded = reloadQuiet();
    focusLater(() => moreEl(d.rowId), () => d.opener, reloaded);
    // The belt change cleared the result, or the old belt isn't known any more (no rank id to send
    // back), or the belt changed and the old rank's price / class / testing-for aren't what this
    // record stored any more: no Undo — it couldn't put things back as they were (as the event
    // roster, v1.006). (Re-picking the old rank copies that rank's CURRENT price and class, so an
    // Undo after a Classes and ranks edit would quietly change them.)
    if (result.resultCleared || !record.rankId || (p.rankId !== record.rankId && !oldRankUnchanged(record, classes))) {
      showToast(T.TOAST_CHANGES_SAVED, { icon: false });
      return;
    }
    // "Changes saved" + Undo for 5 seconds (v1.006): the same Edit details function puts the old
    // names and belt back (the old rank id is sent as it was stored).
    const savedVersion = result.version;
    const name = T.studentLabel(record);
    showToast(T.TOAST_CHANGES_SAVED, {
      icon: false,
      action: line.undoAction(
        undoRun({
          call: () => updatePrivate({ privateId: d.rowId, expectedVersion: savedVersion, firstName: record.firstName, lastName: record.lastName, rankId: record.rankId }),
          findFocus: () => rowEl(d.rowId),
          name,
          gradedCheck: { rowId: d.rowId, resultBefore: record.result },
        }),
        { words: `${T.TOAST_CHANGES_SAVED} for ${name}` },
      ),
    });
  }

  // ----- Save: Change day or time -----
  async function saveChangeDay(canSave) {
    const d = dialogRef.current;
    if (!d || d.saving || d.type !== 'changeDay') return;
    if (!canSave || !checkChangeDay(d, { today }).canSave) {
      patchDialog({ triedSave: true });
      return;
    }
    const done = beginSave();
    if (!done) return;
    patchDialog({ saving: true, note: null });
    const result = await callSave(done, () =>
      changePrivateDay({ privateId: d.rowId, expectedVersion: d.snapshot.version, privateDate: d.values.day, privateTime: d.values.time }),
    );
    if (result.status !== 'ok') {
      handleDialogProblem(result, d);
      return;
    }
    setDialog(null);
    const reloaded = reloadQuiet();
    focusLater(() => moreEl(d.rowId), () => rowEl(d.rowId), reloaded);
    // v0.413 (adds to v1.006): "Changes saved" + Undo for 5 seconds. It shows while Hide private
    // details is on too (a day and time aren't money).
    const back = { day: d.snapshot.privateDate, time: d.snapshot.privateTime };
    // The same day and time: nothing was written, so there is nothing to say or undo (as before).
    if (result.privateDate === back.day && result.privateTime === back.time) return;
    // The move cleared a No show: no Undo — it couldn't bring the No show back (as Edit details).
    if (result.resultCleared) {
      showToast(T.TOAST_CHANGES_SAVED, { icon: false });
      return;
    }
    // The Undo puts the old day and time back with the same Change day function; the database
    // refuses it as usual if that slot isn't allowed any more (a day now past, say), and the
    // usual note says so.
    const savedVersion = result.version;
    const name = T.studentLabel(d.snapshot);
    showToast(T.TOAST_CHANGES_SAVED, {
      icon: false,
      action: line.undoAction(
        undoRun({
          call: () => changePrivateDay({ privateId: d.rowId, expectedVersion: savedVersion, privateDate: back.day, privateTime: back.time }),
          findFocus: () => rowEl(d.rowId),
          name,
          gradedCheck: { rowId: d.rowId, resultBefore: d.snapshot.result },
        }),
        { words: `${T.TOAST_CHANGES_SAVED} for ${name}` },
      ),
    });
  }

  // ----- Save: Change how they'll pay -----
  async function savePayingBy() {
    const d = dialogRef.current;
    if (!d || d.saving || d.blocked) return;
    if (!isPayingByDirty(d)) {
      cancelDialog();
      return;
    }
    const done = beginSave();
    if (!done) return;
    patchDialog({ saving: true, note: null });
    const result = await callSave(done, () =>
      changePrivatePayingBy({ privateId: d.rowId, expectedVersion: d.snapshot.version, payingBy: d.values.payingBy }),
    );
    const open = stillOpen(d);
    const name = T.studentLabel(d.snapshot);
    if (result.status !== 'ok') {
      if (open) handleDialogProblem(result, d);
      else if (hiddenNowRef.current) hiddenMoneyProblem(result.status, name);
      else setBanner({ text: result.status === 'error' ? T.SAVE_FAILED : T.someoneElseChanged(name) });
      return;
    }
    if (open) setDialog(null);
    const reloaded = reloadQuiet();
    const back = d.snapshot.payingBy;
    const savedVersion = result.version;
    // Hidden now: no Undo (changing how they'll pay is a payment item, hidden while on).
    if (hiddenNowRef.current) {
      showToast(T.TOAST_CHANGES_SAVED, { icon: false });
      return;
    }
    showToast(T.TOAST_CHANGES_SAVED, {
      icon: false,
      action: line.undoAction(
        undoRun({
          call: () => changePrivatePayingBy({ privateId: d.rowId, expectedVersion: savedVersion, payingBy: back }),
          findFocus: () => moreEl(d.rowId),
          name,
          money: true, // how they pay counts as money while hidden
        }),
        { words: `${T.TOAST_CHANGES_SAVED} for ${name}` },
      ),
    });
    focusLater(() => moreEl(d.rowId), () => rowEl(d.rowId), reloaded);
  }

  // ----- Save: Edit payment (admins) -----
  async function savePayment(canSave) {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const check = checkEditPayment(d, today);
    if (!canSave || !check.canSave) {
      patchDialog({ triedSave: true });
      return;
    }
    if (check.sameAsSaved) {
      cancelDialog();
      return;
    }
    const done = beginSave();
    if (!done) return;
    patchDialog({ saving: true, note: null });
    const result = await callSave(done, () => editPrivatePayment({ paymentId: d.paymentId, ...check.payload }));
    const open = stillOpen(d);
    const name = T.studentLabel(d.snapshot);
    if (result.status !== 'ok') {
      if (open) handleDialogProblem(result, d);
      else if (hiddenNowRef.current) hiddenMoneyProblem(result.status, name);
      else setBanner({ text: result.status === 'error' ? T.SAVE_FAILED : T.someoneElseChanged(name) });
      return;
    }
    if (open) setDialog(null);
    const reloaded = reloadQuiet();
    focusLater(() => moreEl(d.rowId), () => rowEl(d.rowId), reloaded);
    // Hidden now: the general words ("Payment changed" would say there is a payment) and no Undo.
    if (hiddenNowRef.current) {
      showToast(T.TOAST_CHANGES_SAVED, { icon: false });
      return;
    }
    // "Payment changed" + Undo (v1.003, Black Belt's words). Edit payment reverses the old payment
    // and records a new one; the Undo edits that NEW payment (its id came back from the database)
    // back to the old way to pay, amount and date — the same function, nothing new in the database.
    const newPaymentId = result.paymentId;
    const back = d.undoTo;
    showToast(T.TOAST_PAYMENT_CHANGED, {
      icon: false,
      action: line.undoAction(
        undoRun({
          call: () => editPrivatePayment({ paymentId: newPaymentId, method: back.method, amountCents: back.amountCents, paidOn: back.paidOn }),
          findFocus: () => rowEl(d.rowId),
          name,
          money: true, // a payment's Undo: while hidden on arrival, the general words, no Retry
        }),
        { words: `${T.TOAST_CHANGES_SAVED} for ${name}` }, // the general words: a payment is not named in a bar shown after leaving the page
      ),
    });
  }

  // ===== Hide private details: a money save's answer that arrives while hidden =====
  // The general words only — no amount, no paid status, no Retry that would record money.
  // (The student's name is not private here: it is on every row.)
  function hiddenMoneyProblem(status, name) {
    if (status === 'no_access') onNoAccess();
    else if (status === 'not_allowed') {
      setBanner({ text: T.ROSTER_NOT_ALLOWED });
      onRefreshProfile();
      reloadQuiet();
    } else if (status === 'error') {
      setBanner({ text: T.SAVE_FAILED });
    } else {
      setBanner({ text: T.someoneElseChanged(name) });
      reloadQuiet();
    }
  }
  // Is this dialog still the open one? (Switching Hide private details on closes payment dialogs;
  // their answer must then not patch or close whatever dialog is open by then.)
  function stillOpen(d) {
    return dialogRef.current !== null && dialogRef.current.key === d.key;
  }

  // ===== Undo (toasts) — R2-05 / R2-07 =====
  // undoRun(...) builds the `run()` the save line calls for a toast's Undo (line.undoAction(run)). It
  // may wait behind a save that is still running; when it runs it does the Undo, reloads the list and
  // moves the focus INSIDE run() (the line then says "Undone" itself), and answers the line:
  //   { status: 'ok' }                 it worked
  //   { status: 'error' }              it didn't reach the database: the line's bar says so, with Retry
  //   { status: 'no_access' }          the sign-in is locked: the page locks the screen
  //   { status, reason, noRetry? }     the database refused it: the reason shows in the bar (R2-07)
  // Options: call (the database call), findFocus (what to focus once it is undone), name (the student,
  // for "someone else changed …"), money (a payment's Undo: while Hide private details is on when the
  // answer arrives, only the general words and no Retry that would record money), gradedCheck
  // ({ rowId, resultBefore }: Edit details / Change day or time, see refuseUndoIfGraded).
  function undoRun({ call, findFocus = null, name, money = false, gradedCheck = null, notAllowedReason = T.UNDO_REASON_ADMIN_ONLY }) {
    return async () => {
      // A result recorded since the change isn't in the row's version, so check the latest loaded row.
      if (gradedCheck && refuseUndoIfGraded(gradedCheck.rowId, gradedCheck.resultBefore)) {
        return { status: 'has_result', reason: T.couldntUndo(T.UNDO_REASON_RESULT) };
      }
      const result = await call();
      const status = result.status;
      if (status === 'ok') {
        // Not awaited: a slow reload must not make a worked Undo look failed (the line gives up after 30 s).
        const reloaded = reloadQuiet();
        if (findFocus) focusLater(findFocus, addEl, reloaded);
        return { status: 'ok' };
      }
      // A payment's Undo whose answer arrives while Hide private details is on: only the general words.
      const hiddenMoney = money && hiddenNowRef.current;
      if (status === 'no_access' || status === 'error') {
        if (status === 'no_access') onNoAccess();
        // While hidden, a Retry would record money: the general words, no Retry (the same line as the event page).
        return hiddenMoney ? { status, reason: T.SAVE_FAILED, noRetry: true } : { status };
      }
      if (status === 'not_allowed') {
        onRefreshProfile();
        if (hiddenMoney) reloadQuiet();
        return { status, reason: T.couldntUndo(hiddenMoney ? T.UNDO_REASON_ADMIN_ONLY : notAllowedReason) };
      }
      // Refused by the database: the list reloads, and the bar says why.
      reloadQuiet();
      let reason = T.couldntUndo(T.undoReasonSomeoneElse(name));
      if (!hiddenMoney) {
        // (Change day or time's Undo: the old day is past now; rowProblem handles the same statuses.)
        if (status === 'past_day') reason = T.couldntUndo(T.UNDO_REASON_PAST_DAY);
        else if (status === 'graded') reason = T.couldntUndo(T.UNDO_REASON_GRADED);
        else if (status === 'cancelled') reason = T.couldntUndo(T.UNDO_REASON_CANCELLED);
      }
      return { status, reason };
    };
  }

  // Edit details / Change day or time: a result (or No show) saved during the 5 seconds doesn't
  // change the row's version, so the database wouldn't stop an Undo that clears it. So look at the
  // latest loaded row first; if it has a result now that it didn't have before the change
  // (resultBefore), the Undo is refused ("a result was recorded just now"). true = refused.
  function refuseUndoIfGraded(rowId, resultBefore = null) {
    const fresh = (liveRef.current.data?.rows ?? []).find((r) => r.id === rowId);
    return Boolean(fresh?.result) && fresh.result !== (resultBefore ?? null);
  }

  // A row action the database didn't accept (§5.7, the second row).
  // money: Mark paid / Undo payment — while hidden on arrival, the general words, no Retry.
  function rowProblem(status, row, retry, money = false) {
    const name = T.studentLabel(row);
    if (money && hiddenNowRef.current) hiddenMoneyProblem(status, name);
    else if (status === 'no_access') onNoAccess();
    else if (status === 'already_paid') {
      setBanner({ text: T.alreadyPaid(name) });
      reloadQuiet();
    } else if (status === 'not_allowed') {
      setBanner({ text: T.ROSTER_NOT_ALLOWED });
      onRefreshProfile();
      reloadQuiet();
    } else if (status === 'past_day') {
      setBanner({ text: T.RESTORE_TOO_LATE });
      reloadQuiet();
    } else if (status === 'graded') {
      setBanner({ text: T.PRIVATE_GRADED });
      reloadQuiet();
    } else if (status === 'cancelled') {
      setBanner({ text: T.PRIVATE_IS_CANCELLED });
      reloadQuiet();
    } else if (status === 'error') {
      setNotSavedId(row.id);
      setBanner({ kind: 'row', text: retry.text, retry: retry.run });
    } else {
      setBanner({ text: T.someoneElseChanged(name) });
      reloadQuiet();
    }
  }
  function rowDone() {
    setNotSavedId(null);
    setBanner((current) => (current?.kind === 'row' ? null : current));
  }

  // ===== Mark paid: the shared Mark paid box (CB1, rulebook v0.418 / v0.420, mockup P2) =====
  // The row's Mark paid opens the box under it (a second press closes it): the name and what is
  // still owed (the private price, or on a top-up only the rest — "Ava Chen · $20"; the database
  // works it out, it is shown, never typed), Paid by preset to the row's Paying by with "They chose
  // … on the form." only for one moved from an event registration the family made on the event's
  // form, otherwise "… at the desk." (added here, or moved from a student added at the desk —
  // privateRules.markPaidChoiceWhere), then "Mark paid $X" (first focus). The box closes when
  // pressed; the database records today's date. A different way also changes Paying by (the
  // database does it; the reload shows it). Staff and admins see the same box.
  function openMarkPaid(row, anchor) {
    clearToast();
    setMenu(null);
    const amountCents = row.amountDueCents;
    if (!Number.isInteger(amountCents) || amountCents <= 0) return;
    setMarkPaidBox((current) => (current?.rowId === row.id ? null : { key: Date.now(), rowId: row.id, anchor, snap: row, amountCents }));
  }
  async function saveMarkPaid(rowId, snap, method, amountCents, anchor) {
    // retry: what the bar's Retry calls to redo this Mark paid (the save line keeps it, v1.127).
    const done = beginSave(() => saveMarkPaid(rowId, snap, method, amountCents, anchor));
    if (!done) return;
    let result = { status: 'error' };
    try {
      // school: This device's school — the payment counts at the desk that took it (R1-01, v1.035);
      // null (no school) lets the database use the private testing's.
      result = await markPrivatePaidBy({ privateId: rowId, expectedVersion: snap.version, method, expectedCents: amountCents, school: LOCATION_CODE[deviceLocation] ?? null });
      const row = (liveRef.current.data?.rows ?? []).find((r) => r.id === rowId) ?? snap;
      const name = T.studentLabel(row);
      if (result.status === 'price_changed' && !hiddenNowRef.current) {
        // v0.423 (changes v0.418 Q1): nothing was saved (what is owed changed while the box was
        // open). The box stays closed and the amber bar says why; staff press Mark paid again and
        // pick the way again, so a way picked before can't be recorded by a stray Enter.
        setBanner({ kind: 'price', text: T.privatePriceChangedNote(name, result.amountCents) });
        // The write stays "busy" until the reload lands: the rows' Mark paid is unavailable
        // meanwhile, so a quick second press can't open the box with the OLD amount (and get
        // price_changed again). Then focus goes back to the row's Mark paid (the row if it's gone).
        await reloadQuiet();
        done(result.status);
        focusLater(() => anchor, () => rowEl(rowId));
        return;
      }
    } finally {
      done(result.status); // does nothing when the lines above already ended the save
    }
    const row = (liveRef.current.data?.rows ?? []).find((r) => r.id === rowId) ?? snap;
    const name = T.studentLabel(row);
    if (result.status !== 'ok') {
      // price_changed while Hide private details came on: the general "changed just now" words.
      rowProblem(result.status, row, { text: T.markPaidFailed(name), run: () => saveMarkPaid(rowId, snap, method, amountCents, anchor) }, true);
      return;
    }
    rowDone();
    setBanner((current) => (current?.kind === 'price' ? null : current));
    const reloaded = reloadQuiet();
    // The Mark paid button goes away with the payment: focus moves to the row (or, when a Not
    // paid filter hides the row now, to Add private testing).
    focusLater(() => rowEl(rowId), addEl, reloaded);
    const paymentId = result.paymentId;
    // Hide private details switched on while this was saving (read now, from the ref): no amount, no
    // way, and no Undo payment (R1-07).
    if (hiddenNowRef.current) {
      showToast(T.markedPaidToastHidden(name), { icon: false });
      return;
    }
    // The toast's Undo stays one tap (rule 1.4): it doesn't ask first, unlike ⋯ → Undo payment.
    const toastText = T.markedPaidToast(name, result.amountCents, result.method);
    showToast(toastText, {
      icon: false,
      action: line.undoAction(
        undoRun({
          call: () => undoPrivatePayment({ paymentId }),
          findFocus: () => moreEl(rowId),
          name,
          money: true,
          notAllowedReason: T.UNDO_REASON_PRIVATE_PAYMENT_TOO_LATE,
        }),
        // The words for a bar shown after the person left the page: no amount or way, so Hide
        // private details can't be undone by it.
        { words: T.markedPaidToastHidden(name) },
      ),
    });
  }

  // ===== Undo payment from ⋯ (admins, any time) — asks first (CB3 second half, v0.420) =====
  // The shared confirm box with Star's words (v0.518): "Undo Ava Chen's payment?" / "The $20 cash
  // payment recorded on Nov 3 is reversed and the row goes back to Paid $65 · $20 more to collect.
  // …" · Keep payment (first focus) · Undo payment (blue: something is lost, but not for good);
  // "Undoing…" while it works. It undoes the most recent payment that still stands (on a top-up,
  // the top-up), as before. The toast's Undo right after Mark paid stays one tap (rule 1.4).
  function openUndoPayment(row, opener) {
    const liveList = livePaymentsOf(payments, row.id);
    const payment = liveList[liveList.length - 1];
    if (!payment) return;
    // What the row becomes once it is undone: what stays paid, and what is then owed.
    const paidAfter = Math.max((row.paidCents ?? 0) - payment.amountCents, 0);
    const after = { paidCents: paidAfter, dueCents: amountDue({ privateCents: row.privateCents, paidCents: paidAfter }) };
    openDialog({ type: 'undoPayment', rowId: row.id, snapshot: row, payment, after, opener });
  }
  async function confirmUndoPayment() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const done = beginSave();
    if (!done) return;
    patchDialog({ saving: true, failed: false });
    const result = await callSave(done, () => undoPrivatePayment({ paymentId: d.payment.id }));
    // Hide private details came on meanwhile: the box already closed (a payment dialog).
    const open = stillOpen(d);
    if (result.status === 'ok') {
      if (open) {
        setDialog(null);
        focusAfterClose(d);
      }
      rowDone();
      reloadQuiet();
      // Hidden now: the general words ("Payment undone" would say they had paid).
      showToast(hiddenNowRef.current ? T.TOAST_CHANGES_SAVED : T.paymentUndoneToast(T.studentLabel(d.snapshot)), { icon: false });
      return;
    }
    if (result.status === 'error' && open) {
      // Star's Q2 B: the box stays open with "Couldn't undo. …"; pressing Undo payment tries again.
      patchDialog({ saving: false, failed: true });
      return;
    }
    if (result.status === 'no_access') {
      if (open) patchDialog({ saving: false });
      onNoAccess();
      return;
    }
    // Refused (stale: already undone or changed elsewhere; cancelled; not_allowed …): the box
    // closes and the page's bar says why, as before.
    if (open) {
      setDialog(null);
      focusAfterClose(d);
    }
    rowProblem(result.status, d.snapshot, { text: T.actionFailed, run: () => openUndoPayment(d.snapshot, d.opener) }, true);
  }

  // ===== Print receipt (CB2, rulebook v0.420 / v0.421, mockups P2 and P3) =====
  // The shared receipt, filled from this tab's data (the private testing and its payments — all
  // already loaded), both schools (loadSchools, read once) and the reader's name (get_my_profile,
  // called when it opens; a failed call just leaves the name out, as Star's v0.518 Q7 A). Built by
  // lib/testing/receipt.js, as the event roster's: Private testing (day and time), "Moved from ·
  // [event]" only for one moved from an event (v0.421 Q A), Class, School; each payment that still
  // stands is its own "Testing fee" line; Total due = the private price (a cancelled one, v0.429:
  // what was paid, never more than the price, and its line ends "· cancelled Nov 6").
  // From the summary's Print receipt (P3) it opens on top of the summary (onTop, Star's v0.518);
  // from ⋯ on its own.
  function openReceipt(row, opener, onTop = false) {
    setMenu(null);
    const key = Date.now();
    setReceipt({ key, rowId: row.id, opener, onTop, data: null, notFound: false });
    readReceipt(row.id, key);
  }
  async function readReceipt(rowId, key) {
    const schoolsRead = schoolsRef.current ? Promise.resolve({ status: 'ok', schools: schoolsRef.current }) : loadSchools();
    const [schoolsResult, name] = await Promise.all([schoolsRead, loadMyName()]);
    if (schoolsResult.status === 'ok') schoolsRef.current = schoolsResult.schools;
    // The newest data (a background refresh may have come in while the name was read).
    const current = liveRef.current.data;
    const row = current?.rows?.find((r) => r.id === rowId) ?? null;
    setReceipt((open) => {
      if (!open || open.key !== key) return open;
      if (!row) return { ...open, notFound: true };
      const data = buildColorBeltReceipt({
        firstName: row.firstName,
        lastName: row.lastName,
        rankName: row.rankName,
        testingForName: row.testingFor?.kind === 'rank' ? row.testingFor.name : null,
        privateTesting: {
          privateOn: row.privateDate,
          privateTime: row.privateTime,
          movedFromEventName: row.movedFromEventName,
          // v0.429: a cancelled one owes nothing more (the receipt says so)
          cancelledAt: row.status === 'cancelled' ? row.cancelledAt : null,
        },
        className: row.className,
        locationCode: row.locationCode,
        reference: null, // a private testing has no reference number
        payments: (current.payments ?? []).filter((p) => p.privateId === row.id),
        totalDueCents: row.privateCents,
        // Offline for the schools only: the receipt shows without the schools' lines.
        schools: schoolsResult.status === 'ok' ? schoolsResult.schools : [],
        printedOn: current.today,
        printedByName: name,
      });
      return { ...open, data };
    });
  }
  function closeReceipt() {
    const r = receipt;
    setReceipt(null);
    // On top of the summary, the shared dialog puts focus back on the summary's button (returnFocusTo).
    if (r && !r.onTop) focusLater(() => r.opener, () => moreEl(r.rowId) ?? rowEl(r.rowId));
  }

  // ===== Cancel (confirm, P7) =====
  async function confirmCancel() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const done = beginSave();
    if (!done) return;
    patchDialog({ saving: true, failed: false });
    const result = await callSave(done, () => cancelPrivate({ privateId: d.rowId, expectedVersion: d.snapshot.version }));
    if (result.status === 'ok') {
      setDialog(null);
      showToast(T.cancelledToast(T.studentLabel(d.snapshot)), { icon: false }); // no Undo (P7)
      const reloaded = reloadQuiet();
      focusLater(() => moreEl(d.rowId), addEl, reloaded);
    } else if (result.status === 'error') {
      patchDialog({ saving: false, failed: true });
    } else if (result.status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else {
      setDialog(null);
      rowProblem(result.status, d.snapshot, null);
      focusLater(() => moreEl(d.rowId), addEl);
    }
  }

  // ===== Restore (admins, a cancelled one while its day is ahead) =====
  async function doRestore(row) {
    const done = beginSave(() => doRestore(row));
    if (!done) return;
    const result = await callSave(done, () => restorePrivate({ privateId: row.id, expectedVersion: row.version }));
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.actionFailed, run: () => doRestore(row) });
      return;
    }
    rowDone();
    const reloaded = reloadQuiet();
    // Undo for 5 seconds (v1.006): the same Cancel function cancels it again (payments stay, as
    // with any Cancel).
    const savedVersion = result.version;
    const toastText = T.restoredToast(T.studentLabel(row));
    showToast(toastText, {
      icon: false,
      action: line.undoAction(
        undoRun({ call: () => cancelPrivate({ privateId: row.id, expectedVersion: savedVersion }), findFocus: () => moreEl(row.id), name: T.studentLabel(row) }),
        { words: toastText },
      ),
    });
    focusLater(() => moreEl(row.id), addEl, reloaded);
  }

  // ===== Delete permanently (admins) =====
  async function confirmDelete() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const done = beginSave();
    if (!done) return;
    patchDialog({ saving: true, failed: false });
    const result = await callSave(done, () => deletePrivate(d.args));
    const status = result.status;
    if (status === 'ok') {
      setDialog(null);
      showToast(T.deletedToast(T.studentLabel(d.snapshot)), { icon: false });
      const reloaded = reloadQuiet();
      focusLater(
        () => {
          const list = shownRef.current;
          const target = list[d.index] ?? list[d.index - 1];
          return target ? moreEl(target.id) : null;
        },
        addEl,
        reloaded,
      );
    } else if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (status === 'error') {
      patchDialog({ saving: false, failed: true });
    } else {
      setDialog(null);
      rowProblem(status, d.snapshot, null);
      focusLater(() => moreEl(d.rowId), addEl);
    }
  }
  const shownRef = useRef(shown);
  useLayoutEffect(() => {
    shownRef.current = shown;
  });

  // ===== The ⋯ menu (P3, P7) =====
  function openMenu(row, anchor) {
    setMenu((current) => (current && current.id === row.id ? null : { id: row.id, anchor, row }));
  }
  function closeMenu(reason) {
    const current = menu;
    setMenu(null);
    if (current && (reason === 'escape' || reason === 'tab')) current.anchor?.focus();
  }
  function menuContent() {
    if (!menu) return null;
    const row = menu.row ?? rows.find((r) => r.id === menu.id);
    if (!row) return null;
    const anchor = menu.anchor;
    const can = privateMenu(row, { today, isAdmin, hidden }); // hidden: no payment items (v0.506)
    const name = T.studentLabel(row);
    const groups = [[], [], [], []];
    if (row.status === 'cancelled') {
      // pass 2 M-03 (v1.055 (b), v0.428): money first — Print receipt while a payment still stands,
      // for staff and admins (staff's ⋯ holds only this item); then Restore, then Delete permanently.
      if (can.printReceipt) groups[1].push({ key: 'receipt', label: T.PRINT_RECEIPT, Icon: IconPrinter, onSelect: () => openReceipt(row, anchor) });
      if (can.restore) groups[2].push({ key: 'restore', label: T.RESTORE, Icon: IconArrowBackUp, disabled: line.busy, onSelect: () => doRestore(row) });
    } else {
      // Order (v1.011): Edit details · Change day or time · Grade · Change how they'll pay
      if (can.editDetails) groups[0].push({ key: 'edit', label: T.EDIT_DETAILS, Icon: IconEdit, onSelect: () => openEdit(row, anchor) });
      // ti-calendar = change the day; ti-school = grade
      if (can.changeDay) groups[0].push({ key: 'day', label: T.CHANGE_DAY_TIME, Icon: IconCalendar, onSelect: () => openChangeDay(row, anchor) });
      if (can.grade) groups[0].push({ key: 'grade', label: T.GRADE, Icon: IconSchool, onSelect: () => onOpenPrivate?.(row.id) });
      // ti-switch-horizontal = switch how they'll pay (v1.024)
      if (can.changePayingBy) groups[0].push({ key: 'paying', label: T.CHANGE_PAYING_BY, Icon: IconSwitchHorizontal, onSelect: () => openPayingBy(row, anchor) });
      if (can.editPayment) groups[1].push({ key: 'editpay', label: T.EDIT_PAYMENT, Icon: IconCashEdit, onSelect: () => openEditPayment(row, anchor) });
      if (can.undoPayment) groups[1].push({ key: 'undopay', label: T.UNDO_PAYMENT, Icon: IconArrowBackUp, disabled: line.busy, onSelect: () => openUndoPayment(row, anchor) });
      // CB2 (v0.420): Print receipt ends the money group, for staff and admins, on a row with a
      // payment that still stands; hidden while Hide private details is on (privateMenu). Staff's
      // money group holds only this item. ti-printer = print (as the event roster).
      if (can.printReceipt) groups[1].push({ key: 'receipt', label: T.PRINT_RECEIPT, Icon: IconPrinter, onSelect: () => openReceipt(row, anchor) });
      // ti-calendar-x = cancel the private testing (blue, not red: nothing is deleted)
      if (can.cancel) groups[2].push({ key: 'cancel', label: T.CANCEL_PRIVATE, Icon: IconCalendarX, onSelect: () => openCancel(row, anchor) });
    }
    // On a cancelled row the red Delete permanently gets its own group under Restore (pass 2 C-04,
    // v1.055 (f), as Star's); on an active row it stays in the last group with Cancel.
    const deleteGroup = row.status === 'cancelled' ? 3 : 2;
    if (can.delete) groups[deleteGroup].push({ key: 'delete', label: T.DELETE_PERMANENTLY, Icon: IconTrash, danger: true, disabled: line.busy, onSelect: () => openDelete(row, anchor) });
    // Dividers between the groups, never at the start (R8).
    const items = [];
    for (const group of groups) {
      group.forEach((item, index) => items.push(index === 0 && items.length > 0 ? { ...item, separatorBefore: true } : item));
    }
    if (items.length === 0) return null;
    const toName = row.testingFor?.kind === 'rank' ? row.testingFor.name : T.NO_NEW_RANK;
    const subtitle = row.status === 'cancelled' ? `${row.className} · ${T.cancelledTag(row.cancelledAt)}` : `${row.className} · ${row.rankName} → ${toName}`;
    return { title: name, subtitle, label: T.moreForStudent(name), items };
  }

  // ===== Drawing =====
  const addButton = (
    <button type="button" className="btn btn-primary" data-add-private onClick={(event) => openAdd(event.currentTarget)}>
      {/* ti-plus = add new */}
      <IconPlus size={16} aria-hidden="true" />
      {T.ADD_PRIVATE}
    </button>
  );

  // Keyboard on the rows, as the event roster (useRowArrowNav): Enter opens the summary.
  const nav = useRowArrowNav({
    rowKeys: shown.map((r) => r.id),
    onOpen: (id) => {
      const row = shown.find((r) => r.id === id);
      if (row) openView(row, rowEl(id));
    },
  });

  const ctx = {
    layout: listLayout, // the room beside the panel decides the list's own layout
    busy: line.busy, // the rows' Mark paid looks unavailable meanwhile (R1-08)
    isAdmin,
    menuFor: menu?.id ?? null,
    markPaidFor: markPaidBox?.rowId ?? null, // CB1: the row whose Mark paid box is open
    // The row whose dialog is open stays highlighted (as the event roster)
    selectedId: dialog && !screenLocked && dialog.rowId ? dialog.rowId : null,
    notSavedId,
    hidden,
    nav,
    handlers: {
      onOpen: (row) => openView(row, rowEl(row.id)),
      onMore: (row, anchor) => openMenu(row, anchor),
      onMarkPaid: (row, anchor) => openMarkPaid(row, anchor),
    },
  };

  let body;
  if (live.status === 'loading' || live.status === 'idle') {
    body = (
      <div className="clist tskeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING_PRIVATE}</span>
        {[0, 1, 2].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (live.status === 'error') {
    body = <PageBar text={T.LOAD_PRIVATE_FAILED} onRetry={() => liveRef.current.reload()} />;
  } else if (live.status === 'noAccess') {
    body = null;
  } else {
    // The shared count cards (CB9, v1.013 / v1.107, v0.420): Private testings shows everyone, Paid
    // and Not paid filter the rows, Payments recorded is a plain total with its "includes $85 from
    // cancelled" note. The Paid card's "1 owes more" is gray like every card note (v0.420 Q1 B);
    // each row that owes more keeps its own amber line.
    const allCards = [
      { key: 'all', label: T.CARD_PRIVATE, Icon: IconUsers, value: cards.count, kind: 'all' },
      { key: 'paid', label: T.CARD_PAID, Icon: IconCheck, value: cards.paid, kind: 'filter', note: cards.owesMore > 0 ? T.owesMoreCount(cards.owesMore) : null },
      { key: 'notPaid', label: T.CARD_NOT_PAID, Icon: IconCircleX, value: cards.notPaid, kind: 'filter' }, // ti-circle-x = not paid (v1.024)
      {
        key: 'money',
        label: T.CARD_PAYMENTS,
        Icon: IconSum, // ti-sum = a money total (v0.303)
        value: formatMoney(cards.paymentsCents),
        kind: 'total',
        note: cards.cancelledCents > 0 ? T.includesCancelled(cards.cancelledCents) : null,
      },
    ];
    // Hide private details: only the Private testings card (as Star's G4; the shared row's one-card look).
    const cardList = hidden ? allCards.slice(0, 1) : allCards;
    const sideLabelId = `${panelId}-side`;
    let list;
    if (rows.length === 0) {
      // No private testings at all: the one plain line every list uses (v1.028); the header's
      // Add private testing is the one way to add.
      list = <p className="tempty">{T.NO_PRIVATE_TESTINGS}</p>;
    } else if (sideRows.length === 0) {
      list = <p className="tempty ev-empty">{side === 'past' ? T.NO_PAST_PRIVATE : T.NO_UPCOMING_PRIVATE}</p>;
    } else if (shown.length === 0) {
      // A card filter is on and nobody on this side is left (v0.420 Q2 A; the event roster's
      // "Everyone in this class has paid." / "No paid students in this class.").
      let text = side === 'past' ? T.EVERY_PAST_PRIVATE_PAID : T.EVERY_UPCOMING_PRIVATE_PAID;
      if (shownFilter === 'paid') text = side === 'past' ? T.NO_PAID_PAST_PRIVATE : T.NO_PAID_UPCOMING_PRIVATE;
      list = <p className="tempty ev-empty">{text}</p>;
    } else {
      list = <PrivateRows rows={shown} label={side === 'past' ? T.PAST : T.UPCOMING} ctx={ctx} />;
    }
    body = (
      <>
        {rows.length > 0 && (
          <CountCards
            cards={cardList}
            selected={shownFilter}
            onSelect={setFilter}
            showingText={shownFilter === 'paid' ? T.SHOWING_PAID : T.SHOWING_NOT_PAID}
            showAllLabel={T.SHOW_ALL}
          />
        )}
        <div className="ev-side">
          <span id={sideLabelId} className="visually-hidden">
            {T.PRIVATE_SWITCH_LABEL}
          </span>
          <ChoiceGroup
            labelId={sideLabelId}
            value={side}
            onChange={setSide}
            options={[
              {
                key: 'upcoming',
                label: `${T.UPCOMING} ${upcoming.length}`,
                content: (
                  <>
                    {T.UPCOMING}
                    <span className="ev-side-count">{upcoming.length}</span>
                  </>
                ),
              },
              {
                key: 'past',
                label: `${T.PAST} ${past.length}`,
                content: (
                  <>
                    {T.PAST}
                    <span className="ev-side-count">{past.length}</span>
                  </>
                ),
              },
            ]}
          />
        </div>
        {list}
      </>
    );
  }

  // ----- The open dialog (never while locked: it comes back after unlocking) -----
  let dialogElement = null;
  if (dialog && !screenLocked) {
    const common = { isPhone, onCancel: cancelDialog, onRequestClose: requestClose, onChange: changeValues };
    const record = dialog.rowId ? (rows.find((r) => r.id === dialog.rowId) ?? dialog.snapshot) : null;
    if (dialog.type === 'private') {
      dialogElement = (
        <PrivateDialog
          key={dialog.key}
          state={dialog}
          classes={classes}
          record={dialog.snapshot ?? null}
          school={school}
          today={today}
          isAdmin={isAdmin}
          hidden={hidden}
          onTouch={touch}
          onSave={savePrivateForm}
          {...common}
        />
      );
    } else if (dialog.type === 'view') {
      // The summary follows the live row (it reloads every 15 seconds); Edit details only when
      // the ⋯ menu would offer it.
      const can = privateMenu(record, { today, isAdmin, hidden });
      dialogElement = (
        <PrivateSummaryDialog
          key={dialog.key}
          record={record}
          payments={payments}
          isPhone={isPhone}
          canEdit={Boolean(can.editDetails)}
          hidden={hidden}
          // CB2 (P3): the summary's Print receipt follows the ⋯ item (privateMenu's printReceipt)
          canPrintReceipt={Boolean(can.printReceipt)}
          onPrintReceipt={(opener) => record && openReceipt(record, opener, true)}
          onNoAccess={onNoAccess}
          onEdit={editFromView}
          onCancel={cancelDialog}
          onRequestClose={requestClose}
        />
      );
    } else if (dialog.type === 'changeDay') {
      dialogElement = <ChangeDayDialog key={dialog.key} state={dialog} record={dialog.snapshot} today={today} hidden={hidden} onTouch={touch} onSave={saveChangeDay} {...common} />;
    } else if (dialog.type === 'paying' && !hidden) {
      const name = T.studentLabel(dialog.snapshot);
      const owing = dialog.snapshot.paid && dialog.snapshot.amountDueCents > 0;
      dialogElement = (
        <PayingByDialog
          key={dialog.key}
          state={dialog}
          name={name}
          subtitle={owing ? T.changePayingBySubOwed(name, dialog.snapshot.amountDueCents) : null}
          onSave={savePayingBy}
          {...common}
        />
      );
    } else if (dialog.type === 'payment' && !hidden) {
      const name = T.studentLabel(dialog.snapshot);
      const subtitle = dialog.parts.length > 1 ? T.editPaymentSubTopUp(name, dialog.parts, dialog.editingCents) : null;
      dialogElement = <EditPaymentDialog key={dialog.key} state={dialog} name={name} subtitle={subtitle} today={today} onTouch={touch} onSave={savePayment} {...common} />;
    } else if (dialog.type === 'undoPayment' && !hidden) {
      // CB3, second half (v0.420): Star's words; blue (not lost for good), Keep payment focused.
      // The sentence names the latest payment and what the row becomes (a top-up: "Paid $65 ·
      // $20 more to collect"; otherwise "Not paid").
      dialogElement = (
        <ConfirmBox
          key={dialog.key}
          title={T.undoPaymentTitle(T.studentLabel(dialog.snapshot), dialog.payment.amountCents, dialog.payment.method)}
          keepLabel={T.KEEP_PAYMENT}
          actionLabel={T.UNDO_PAYMENT}
          actionIcon={IconArrowBackUp}
          busyLabel={T.UNDOING}
          loses="something"
          busy={dialog.saving}
          failed={dialog.failed ? T.UNDO_BOX_FAILED : null}
          onConfirm={confirmUndoPayment}
          onKeep={cancelDialog}
        >
          {T.privateUndoPaymentBody(dialog.payment.amountCents, dialog.payment.method, dialog.payment.paidOn, dialog.after)}
        </ConfirmBox>
      );
    } else if (dialog.type === 'cancel') {
      dialogElement = (
        // Cancel private testing (P7) on the shared confirm box (v1.008 / v1.103, v0.422): the record
        // and its payments stay, so the action is blue (loses 'something'), first focus on "Keep
        // it", so Enter never cancels by accident. "Cancelling…" while it works; both buttons stay
        // focusable (aria-disabled, never the browser's own disabled).
        <ConfirmBox
          key={dialog.key}
          title={T.cancelTitle(T.studentLabel(record ?? dialog.snapshot))}
          keepLabel={T.KEEP_IT}
          actionLabel={T.CANCEL_PRIVATE}
          busyLabel={T.CANCELLING}
          loses="something"
          busy={dialog.saving}
          failed={dialog.failed ? T.actionFailed : null}
          onConfirm={confirmCancel}
          onKeep={cancelDialog}
        >
          {T.cancelBody(...dialog.bodyParts, hidden)}
        </ConfirmBox>
      );
    } else if (dialog.type === 'delete') {
      dialogElement = (
        // Delete permanently (admins), the shared confirm box with its words: "Keep it · Delete
        // permanently", red, first focus on Keep it; "Deleting…" while it works.
        <ConfirmBox
          key={dialog.key}
          title={T.deletePrivateTitle(T.studentLabel(dialog.snapshot))}
          keepLabel={T.KEEP_IT}
          actionLabel={T.DELETE_PERMANENTLY}
          actionIcon={IconTrash}
          busyLabel={T.DELETING}
          loses="forGood"
          busy={dialog.saving}
          failed={dialog.failed ? T.DELETE_FAILED : null}
          onConfirm={confirmDelete}
          onKeep={cancelDialog}
        >
          {T.deletePrivateBody(...dialog.bodyParts, hidden)}
        </ConfirmBox>
      );
    }
  }

  // CB2: the receipt, on its own (from ⋯). Never while locked (it comes back after unlocking).
  let receiptElement = null;
  if (receipt && !screenLocked) {
    const row = rows.find((r) => r.id === receipt.rowId);
    receiptElement = (
      <ReceiptDialog
        receipt={receipt.data}
        sub={T.receiptSub(row ? T.studentLabel(row) : T.THIS_STUDENT, T.RECEIPT_PRIVATE)}
        notFound={receipt.notFound ? T.receiptNotFound(row ? T.studentLabel(row) : T.THIS_STUDENT) : null}
        hidden={hidden}
        onClose={closeReceipt}
        isPhone={isPhone}
        onTop={Boolean(receipt.onTop && dialog)}
        returnFocusTo={receipt.onTop ? receipt.opener : null}
      />
    );
  }

  // CB1: the Mark paid box — only while its row still shows Mark paid (markPaidGone, above).
  let markPaidElement = null;
  if (markPaidBox && !markPaidGone) {
    const { key, rowId, snap, anchor, amountCents } = markPaidBox;
    markPaidElement = (
      <MarkPaidBox
        key={key}
        anchor={anchor}
        name={T.studentLabel(markPaidBoxRow)}
        amountCents={amountCents}
        familyChoice={markPaidBoxRow.payingBy}
        // Moved from a registration made on the family form → "… on the form."; anything else
        // (added at the desk, moved from a desk registration, old registration unreadable) →
        // "… at the desk." (mockup P2)
        choiceWhere={markPaidChoiceWhere(markPaidBoxRow)}
        onMarkPaid={(method) => saveMarkPaid(rowId, snap, method, amountCents, anchor)}
        onClose={(restoreFocus) => {
          setMarkPaidBox(null);
          if (restoreFocus) anchor.focus();
        }}
      />
    );
  }

  const content = menu && !screenLocked ? menuContent() : null;

  return (
    <>
      {renderHeader(addButton)}
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel">
        {banner && (
          <PageBar
            text={banner.text}
            onRetry={banner.retry ? () => banner.retry() : undefined}
            retrying={Boolean(banner.retrying) || line.busy}
            takeFocus={banner.takeFocus}
            onDismiss={() => setBanner(null)}
          />
        )}
        {body}
      </div>
      {content && (
        <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />
      )}
      {dialogElement}
      {receiptElement}
      {markPaidElement}
    </>
  );
}
