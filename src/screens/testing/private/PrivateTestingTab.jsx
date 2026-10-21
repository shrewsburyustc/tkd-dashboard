// PrivateTestingTab.jsx — the "Private testing" tab of Color belt testing (mockups P1–P4, P7;
// contract 0014 §5.2–§5.4, §5.7; rulebook v0.401–v0.404).
// Why it exists: a family who can't (or doesn't want to) test at a testing event can test
// privately, on their own day and time, at the rank's private price. Each private testing is its
// own record — not part of any event — so it gets its own tab, at the far right of the tab bar.
// This file is the "brain" of the tab. It:
//   - loads the school's private testings (useLiveLoad + privateApi.loadPrivateTestings — reloads
//     quietly every 15 seconds, after every change, when the school changes, after unlocking)
//   - shows them on an Upcoming / Past switch (opens on Upcoming, kept per school), with four
//     cards over the side shown (count, Paid + "1 owes more", Not paid, Payments recorded +
//     "includes $85 from cancelled") and the rows (PrivateRows.jsx)
//   - Add private testing (all staff, the header button), Mark paid with a 5-second Undo, and the
//     ⋯ menu: Edit details · Change how they'll pay · Change day or time · Grade | Edit payment ·
//     Undo payment (admins) | Cancel private testing · Delete permanently (admins); a cancelled
//     row: Restore · Delete permanently (admins only)
// Rules (as the Events tab, contract 0003 §8): one change at a time; dialog saves wait for the
// database; the dialog's values live HERE, so a screen lock hides the dialog and brings it back;
// "stale" = someone else changed it — nothing is overwritten, the person is told, the list reloads.
// Admin vs staff only changes what is SHOWN — the database enforces who may do what.
// Follows "Hide private details" (v0.506, v0.507 Q2), as Star's Candidates tab: while the device
// switch is on, only the Private testings card shows, the rows have no price, Paying by, Payment,
// Paid on, "Paid $65 · $20 more to collect" line or Mark paid, the ⋯ menu has no payment items
// (privateMenu's `hidden`), and the dialogs name no amount. Turning it on closes an open payment
// dialog, closes the ⋯ menu and clears the toast. (Color Belt keeps no date of birth or email.)
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  IconArrowBackUp,
  IconCalendar,
  IconCalendarX,
  IconCashEdit,
  IconCheck,
  IconClock,
  IconEdit,
  IconPlus,
  IconSchool,
  IconSum,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { LOCATION_CODE } from '../../../lib/device.js';
import { usePrivateDetailsHidden } from '../../../lib/privateDetails.js';
import { centsToInputText } from '../../../lib/money.js';
import { loadClassesAndRanks } from '../../../lib/testing/api.js';
import { withTestingFor } from '../../../lib/testing/rankOrder.js';
import { schoolToday } from '../../../lib/testing/eventsApi.js';
import {
  addPrivate,
  cancelPrivate,
  changePrivateDay,
  changePrivatePayingBy,
  deletePrivate,
  editPrivatePayment,
  loadPrivateTestings,
  markPrivatePaid,
  restorePrivate,
  undoPrivatePayment,
  updatePrivate,
} from '../../../lib/testing/privateApi.js';
import { privateCards, privateMenu, splitPrivate } from '../../../lib/testing/privateRules.js';
import { PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import ChoiceGroup from '../events/ChoiceGroup.jsx';
import ConfirmDeleteDialog from '../events/ConfirmDeleteDialog.jsx';
import { NoIcon } from '../events/EventsTab.jsx';
import { LIVE_REFRESH_MS, useLiveLoad } from '../events/useLiveLoad.js';
import { EditPaymentDialog, PayingByDialog, checkEditPayment, isEditPaymentDirty, isPayingByDirty } from '../event/PaymentDialogs.jsx';
import CancelPrivateDialog from './CancelPrivateDialog.jsx';
import ChangeDayDialog, { checkChangeDay, isChangeDayDirty } from './ChangeDayDialog.jsx';
import PrivateDialog, { COPIED, checkPrivateForm, isPrivateFormDirty } from './PrivateDialog.jsx';
import PrivateRows from './PrivateRows.jsx';
import * as T from '../text.js';
import '../../../styles/testing-private.css';

// Upcoming / Past, per school, kept while the page is open (as the Events tab).
const sideBySchool = new Map();
// Notes that make Save unavailable until the dialog is closed and opened again.
const BLOCKING_NOTES = ['STALE_DIALOG', 'NOT_ALLOWED', 'STUDENT_LOCKED', 'PRIVATE_GRADED', 'ALREADY_PAID'];
// The dialogs that are about money: closed when Hide private details is switched on.
const PAYMENT_DIALOGS = ['paying', 'payment'];

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
  const [hidden] = usePrivateDetailsHidden(); // Hide private details (v0.506)

  // ----- State -----
  const [side, setSideState] = useState(() => sideBySchool.get(locationCode) ?? 'upcoming');
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null); // { id, anchor, row }
  const [banner, setBanner] = useState(null); // { text, retry?, kind? }
  const [busy, setBusy] = useState(false);
  const [notSavedId, setNotSavedId] = useState(null);
  const [classes, setClasses] = useState(null); // live Classes and ranks for Add / Edit details
  const busyRef = useRef(false);
  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
  });

  function setSide(next) {
    sideBySchool.set(locationCode, next);
    setSideState(next);
  }
  const previousCodeRef = useRef(locationCode);
  useEffect(() => {
    if (previousCodeRef.current === locationCode) return;
    previousCodeRef.current = locationCode;
    setSideState(sideBySchool.get(locationCode) ?? 'upcoming');
    setBanner(null);
    setMenu(null);
    setNotSavedId(null);
  }, [locationCode]);

  // ----- One change at a time -----
  function beginWrite() {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }
  function endWrite(status) {
    busyRef.current = false;
    setBusy(false);
    if (status && status !== 'ok') clearToast();
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
  const modalShown = dialog !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  // Hide private details switched on: no payment dialog, menu or toast may stay (as Star, G4).
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
    // A toast may name money ("marked paid · $85 cash") or carry a payment Undo: it goes too.
    clearToast();
    // So does every banner: a failed Mark paid / Undo payment keeps a Retry that records money,
    // and "already marked paid" names paid status. The row's Not saved mark goes with it.
    setBanner(null);
    setNotSavedId(null);
    // (only when the switch changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  // ===== The two sides and the cards =====
  const { upcoming, past } = splitPrivate(rows, today);
  const shown = side === 'past' ? past : upcoming;
  const cards = privateCards(shown);

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
    if (!beginWrite()) return;
    const list = await readClasses();
    endWrite(list ? 'ok' : 'error');
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
    openDialog({ type: 'payment', rowId: row.id, snapshot: row, paymentId: payment.id, parts: partsOf(liveList), editingCents: payment.amountCents, values, initial: values, opener });
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
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const p = check.payload;
    if (d.mode === 'add') {
      const result = await addPrivate({
        locationCode,
        firstName: p.firstName,
        lastName: p.lastName,
        rankId: p.rankId,
        stripes: true,
        payingBy: p.payingBy,
        privateDate: p.privateDate,
        privateTime: p.privateTime,
      });
      endWrite(result.status);
      if (result.status !== 'ok') {
        handleDialogProblem(result, d);
        return;
      }
      // No toast after Add: the new row is the confirmation (P2).
      setDialog(null);
      if (side !== 'upcoming') setSide('upcoming');
      const reloaded = reloadQuiet();
      focusLater(() => rowEl(result.id), addEl, reloaded);
      return;
    }
    const result = await updatePrivate({ privateId: d.rowId, expectedVersion: record.version, firstName: p.firstName, lastName: p.lastName, rankId: p.rankId });
    endWrite(result.status);
    if (result.status !== 'ok') {
      handleDialogProblem(result, d);
      return;
    }
    setDialog(null);
    const reloaded = reloadQuiet();
    showToast(T.TOAST_CHANGES_SAVED, { icon: false });
    focusLater(() => moreEl(d.rowId), () => d.opener, reloaded);
  }

  // ----- Save: Change day or time -----
  async function saveChangeDay(canSave) {
    const d = dialogRef.current;
    if (!d || d.saving || d.type !== 'changeDay') return;
    if (!canSave || !checkChangeDay(d, { today }).canSave) {
      patchDialog({ triedSave: true });
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const result = await changePrivateDay({ privateId: d.rowId, expectedVersion: d.snapshot.version, privateDate: d.values.day, privateTime: d.values.time });
    endWrite(result.status);
    if (result.status !== 'ok') {
      handleDialogProblem(result, d);
      return;
    }
    // No toast (P4): the row shows the new day at once.
    setDialog(null);
    const reloaded = reloadQuiet();
    focusLater(() => moreEl(d.rowId), () => rowEl(d.rowId), reloaded);
  }

  // ----- Save: Change how they'll pay -----
  async function savePayingBy() {
    const d = dialogRef.current;
    if (!d || d.saving || d.blocked) return;
    if (!isPayingByDirty(d)) {
      cancelDialog();
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const result = await changePrivatePayingBy({ privateId: d.rowId, expectedVersion: d.snapshot.version, payingBy: d.values.payingBy });
    endWrite(result.status);
    if (result.status !== 'ok') {
      handleDialogProblem(result, d);
      return;
    }
    setDialog(null);
    const reloaded = reloadQuiet();
    const back = d.snapshot.payingBy;
    const savedVersion = result.version;
    showToast(T.TOAST_CHANGES_SAVED, {
      icon: false,
      action: {
        label: T.UNDO,
        onAction: () => runUndo(() => changePrivatePayingBy({ privateId: d.rowId, expectedVersion: savedVersion, payingBy: back }), () => moreEl(d.rowId)),
      },
    });
    focusLater(() => moreEl(d.rowId), () => rowEl(d.rowId), reloaded);
  }

  // ----- Save: Edit payment (admins) -----
  async function savePayment(canSave) {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const check = checkEditPayment(d);
    if (!canSave || !check.canSave) {
      patchDialog({ triedSave: true });
      return;
    }
    if (check.sameAsSaved) {
      cancelDialog();
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const result = await editPrivatePayment({ paymentId: d.paymentId, ...check.payload });
    endWrite(result.status);
    if (result.status !== 'ok') {
      handleDialogProblem(result, d);
      return;
    }
    setDialog(null);
    const reloaded = reloadQuiet();
    showToast(T.TOAST_PAYMENT_SAVED, { icon: false });
    focusLater(() => moreEl(d.rowId), () => rowEl(d.rowId), reloaded);
  }

  // ===== Undo (toasts) =====
  async function runUndo(call, findFocus = null, notAllowedText = T.ROSTER_NOT_ALLOWED) {
    if (!beginWrite()) return;
    const result = await call();
    endWrite(result.status);
    const status = result.status;
    if (status === 'ok') {
      setBanner((current) => (current?.kind === 'undo' ? null : current));
      showToast(T.TOAST_UNDONE, { icon: false });
      const reloaded = reloadQuiet();
      if (findFocus) focusLater(findFocus, addEl, reloaded);
    } else if (status === 'no_access') {
      onNoAccess();
    } else if (status === 'not_allowed') {
      setBanner({ text: notAllowedText });
      onRefreshProfile();
    } else if (status === 'error') {
      setBanner({ kind: 'undo', text: T.UNDO_FAILED, retry: () => runUndo(call, findFocus, notAllowedText) });
    } else {
      setBanner({ text: status === 'cancelled' ? T.PRIVATE_IS_CANCELLED : T.UNDO_STALE });
      reloadQuiet();
    }
  }

  // A row action the database didn't accept (§5.7, the second row).
  function rowProblem(status, row, retry) {
    const name = T.studentLabel(row);
    if (status === 'no_access') onNoAccess();
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
      setBanner({ text: T.ROSTER_STALE });
      reloadQuiet();
    }
  }
  function rowDone() {
    setNotSavedId(null);
    setBanner((current) => (current?.kind === 'row' ? null : current));
  }

  // ===== Mark paid: one click, what is owed (§1.3) =====
  async function doMarkPaid(row) {
    if (!beginWrite()) return;
    const result = await markPrivatePaid({ privateId: row.id, expectedVersion: row.version });
    endWrite(result.status);
    const name = T.studentLabel(row);
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.markPaidFailed(name), run: () => doMarkPaid(row) });
      return;
    }
    rowDone();
    reloadQuiet();
    const paymentId = result.paymentId;
    // Hide private details switched on while this was saving: the toast names no amount.
    const toastText = hiddenBeforeRef.current ? T.TOAST_CHANGES_SAVED : T.markedPaidToast(name, result.amountCents, result.method);
    showToast(toastText, {
      icon: false,
      action: { label: T.UNDO, onAction: () => runUndo(() => undoPrivatePayment({ paymentId }), () => moreEl(row.id), T.UNDO_PAYMENT_TOO_LATE) },
    });
  }

  // ===== Undo payment from ⋯ (admins, any time: the most recent live payment) =====
  async function doUndoPayment(row) {
    const liveList = livePaymentsOf(payments, row.id);
    const payment = liveList[liveList.length - 1];
    if (!payment || !beginWrite()) return;
    const result = await undoPrivatePayment({ paymentId: payment.id });
    endWrite(result.status);
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.actionFailed, run: () => doUndoPayment(row) });
      return;
    }
    rowDone();
    reloadQuiet();
    showToast(T.paymentUndoneToast(T.studentLabel(row)), { icon: false });
  }

  // ===== Cancel (confirm, P7) =====
  async function confirmCancel() {
    const d = dialogRef.current;
    if (!d || d.saving || !beginWrite()) return;
    patchDialog({ saving: true, failed: false });
    const result = await cancelPrivate({ privateId: d.rowId, expectedVersion: d.snapshot.version });
    endWrite(result.status);
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
    if (!beginWrite()) return;
    const result = await restorePrivate({ privateId: row.id, expectedVersion: row.version });
    endWrite(result.status);
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.actionFailed, run: () => doRestore(row) });
      return;
    }
    rowDone();
    const reloaded = reloadQuiet();
    showToast(T.restoredToast(T.studentLabel(row)), { icon: false });
    focusLater(() => moreEl(row.id), addEl, reloaded);
  }

  // ===== Delete permanently (admins) =====
  async function confirmDelete() {
    const d = dialogRef.current;
    if (!d || d.saving || !beginWrite()) return;
    patchDialog({ saving: true, failed: false });
    const result = await deletePrivate(d.args);
    endWrite(result.status);
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
    const groups = [[], [], []];
    if (row.status === 'cancelled') {
      if (can.restore) groups[2].push({ key: 'restore', label: T.RESTORE, Icon: IconArrowBackUp, disabled: busy, onSelect: () => doRestore(row) });
    } else {
      if (can.editDetails) groups[0].push({ key: 'edit', label: T.EDIT_DETAILS, Icon: IconEdit, onSelect: () => openEdit(row, anchor) });
      if (can.changePayingBy) groups[0].push({ key: 'paying', label: T.CHANGE_PAYING_BY, Icon: NoIcon, onSelect: () => openPayingBy(row, anchor) });
      // ti-calendar = change the day; ti-school = grade
      if (can.changeDay) groups[0].push({ key: 'day', label: T.CHANGE_DAY_TIME, Icon: IconCalendar, onSelect: () => openChangeDay(row, anchor) });
      if (can.grade) groups[0].push({ key: 'grade', label: T.GRADE, Icon: IconSchool, onSelect: () => onOpenPrivate?.(row.id) });
      if (can.editPayment) groups[1].push({ key: 'editpay', label: T.EDIT_PAYMENT, Icon: IconCashEdit, onSelect: () => openEditPayment(row, anchor) });
      if (can.undoPayment) groups[1].push({ key: 'undopay', label: T.UNDO_PAYMENT, Icon: IconArrowBackUp, disabled: busy, onSelect: () => doUndoPayment(row) });
      // ti-calendar-x = cancel the private testing (blue, not red: nothing is deleted)
      if (can.cancel) groups[2].push({ key: 'cancel', label: T.CANCEL_PRIVATE, Icon: IconCalendarX, onSelect: () => openCancel(row, anchor) });
    }
    if (can.delete) groups[2].push({ key: 'delete', label: T.DELETE_PERMANENTLY, Icon: IconTrash, danger: true, disabled: busy, onSelect: () => openDelete(row, anchor) });
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

  const ctx = {
    layout,
    busy,
    isAdmin,
    menuFor: menu?.id ?? null,
    notSavedId,
    hidden,
    handlers: { onMore: (row, anchor) => openMenu(row, anchor), onMarkPaid: (row) => doMarkPaid(row) },
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
    body = <ErrorBanner text={T.LOAD_PRIVATE_FAILED} onRetry={() => liveRef.current.reload()} />;
  } else if (live.status === 'noAccess') {
    body = null;
  } else {
    const allCards = [
      { key: 'count', label: T.CARD_PRIVATE, Icon: IconUsers, value: cards.count },
      { key: 'paid', label: T.CARD_PAID, Icon: IconCheck, value: cards.paid, note: cards.owesMore > 0 ? T.owesMoreCount(cards.owesMore) : null, warn: true },
      { key: 'notPaid', label: T.CARD_NOT_PAID, Icon: IconClock, value: cards.notPaid },
      { key: 'money', label: T.CARD_PAYMENTS, Icon: IconSum, value: T.dollars(cards.paymentsCents), note: cards.cancelledCents > 0 ? T.includesCancelled(cards.cancelledCents) : null }, // ti-sum = a money total (v0.303)
    ];
    // Hide private details: only the Private testings card (as Star's G4).
    const cardList = hidden ? allCards.slice(0, 1) : allCards;
    const sideLabelId = `${panelId}-side`;
    let list;
    if (rows.length === 0) {
      // P1 (tablet, empty): one line and the Add button in a box
      list = (
        <div className="clist pv-empty">
          <p className="pv-empty-text">{T.NO_PRIVATE_TESTINGS}</p>
          <button type="button" className="btn btn-primary" onClick={(event) => openAdd(event.currentTarget)}>
            <IconPlus size={16} aria-hidden="true" />
            {T.ADD_PRIVATE}
          </button>
        </div>
      );
    } else if (shown.length === 0) {
      list = <p className="tempty ev-empty">{side === 'past' ? T.NO_PAST_PRIVATE : T.NO_UPCOMING_PRIVATE}</p>;
    } else {
      list = <PrivateRows rows={shown} label={side === 'past' ? T.PAST : T.UPCOMING} ctx={ctx} />;
    }
    body = (
      <>
        {rows.length > 0 && (
          <div className={`ev-cards${hidden ? ' is-one' : ''}`}>
            {cardList.map((card) => (
              <div key={card.key} className="ev-card">
                <span className="ev-card-label">
                  <card.Icon size={16} aria-hidden="true" />
                  {card.label}
                </span>
                <span className="ev-card-value">{card.value}</span>
                {card.note && <span className={`ev-card-note${card.warn ? ' pv-card-warn' : ''}`}>{card.note}</span>}
              </div>
            ))}
          </div>
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
      dialogElement = <EditPaymentDialog key={dialog.key} state={dialog} name={name} subtitle={subtitle} onTouch={touch} onSave={savePayment} {...common} />;
    } else if (dialog.type === 'cancel') {
      dialogElement = (
        <CancelPrivateDialog
          key={dialog.key}
          name={T.studentLabel(record ?? dialog.snapshot)}
          body={T.cancelBody(...dialog.bodyParts, hidden)}
          saving={dialog.saving}
          failed={dialog.failed}
          onConfirm={confirmCancel}
          onCancel={cancelDialog}
        />
      );
    } else if (dialog.type === 'delete') {
      dialogElement = (
        <ConfirmDeleteDialog
          key={dialog.key}
          title={T.deletePrivateTitle(T.studentLabel(dialog.snapshot))}
          body={T.deletePrivateBody(...dialog.bodyParts, hidden)}
          keepLabel={T.KEEP_IT}
          deleteLabel={T.DELETE_PERMANENTLY}
          failed={dialog.failed}
          deleting={dialog.saving}
          onDelete={confirmDelete}
          onCancel={cancelDialog}
        />
      );
    }
  }

  const content = menu && !screenLocked ? menuContent() : null;

  return (
    <>
      {renderHeader(addButton)}
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel">
        {banner && (
          <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy} onDismiss={() => setBanner(null)} />
        )}
        {body}
      </div>
      {content && (
        <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />
      )}
      {dialogElement}
    </>
  );
}
