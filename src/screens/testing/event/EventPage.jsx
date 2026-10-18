// EventPage.jsx — one testing event's page: its Students roster with payments.
// Why it exists: approved mockups R1–R8 (Star's Candidates design, Star v0.108–v0.121, with
// Color Belt's answers Q8–Q9) and the later changes (plan answers 6–8): Mark paid replaces the
// Record payment dialog; Add student is the blue button in the page header.
// Address: #testing/event/<id> (App.jsx), so browser Back returns to the Events list.
//
// What's on the page, top to bottom:
//   - "← Color belt testing", the event name, and the summary line
//     ("Fri, Nov 20, 2026 · Worcester school · 14 students · registration open until Nov 13")
//   - header buttons: Add student (blue, N on the PC) and Registration link (outline)
//   - the one tab, Students
//   - the four summary cards (Students, Paid, Not paid, Payments recorded — Star v0.115);
//     Paid / Not paid filter the roster, Students clears the filter
//   - the amber "possible duplicate" box with Review (Star v0.114), when there is one
//   - the class switch (classes in this event, with counts) and the class line (time + gear)
//   - the roster of the chosen class (RosterRows.jsx), then its Removed group
// Every change goes to the database (src/lib/testing/eventsApi.js) and the page reloads after it.
// Reversible changes get a 5-second Undo toast; Delete permanently asks first (rule 1.4).
// Staff and admins see different ⋯ items (Star v0.110); the database enforces the same rules.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowLeft,
  IconCash,
  IconCashEdit,
  IconCheck,
  IconClock,
  IconEdit,
  IconPlus,
  IconQrcode,
  IconTrash,
  IconUserMinus,
  IconUsers,
} from '@tabler/icons-react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { LOCATION_CODE } from '../../../lib/device.js';
import { centsToInputText } from '../../../lib/money.js';
import { loadSchools } from '../../../lib/settings/schoolsApi.js';
import { classTimeLabel } from '../../../lib/testing/eventRules.js';
import {
  addStudent,
  changePayingBy,
  deleteStudent,
  editPayment,
  loadEvent,
  markPaid,
  resolveDuplicate,
  restoreStudent,
  undoPayment,
  updateStudent,
  withdrawStudent,
} from '../../../lib/testing/eventsApi.js';
import { PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { useRowArrowNav } from '../../../lib/useRowArrowNav.js';
import { useShortcutN } from '../../../lib/useShortcutN.js';
import ChoiceGroup from '../events/ChoiceGroup.jsx';
import ConfirmDeleteDialog from '../events/ConfirmDeleteDialog.jsx';
import { NoIcon } from '../events/EventsTab.jsx';
import { useLiveLoad } from '../events/useLiveLoad.js';
import CompareDialog from './CompareDialog.jsx';
import { EditPaymentDialog, PayingByDialog, checkEditPayment, isEditPaymentDirty, isPayingByDirty } from './PaymentDialogs.jsx';
import RegistrationLinkDialog from './RegistrationLinkDialog.jsx';
import RosterRows from './RosterRows.jsx';
import StudentDialog, { checkStudentForm, isStudentFormDirty } from './StudentDialog.jsx';
import * as T from '../text.js';

// The class chosen on each event's page, kept while the page is open.
const classByEvent = new Map();
// The Removed group open or closed, per event (open by default, as drawn in R8).
const removedOpenByEvent = new Map();

const BLOCKING_NOTES = ['STALE_DIALOG', 'NOT_ALLOWED', 'FINISHED', 'ALREADY_PAID'];

const find = (selector) => document.querySelector(selector);
const rowEl = (id) => find(`[data-nav-row="${id}"]`);
const moreEl = (id) => find(`[data-student-more="${id}"]`);
const addStudentEl = () => find('[data-add-student]');
const linkEl = () => find('[data-reg-link]');
const usable = (element) => (element && element.isConnected && element.getClientRects().length > 0 ? element : null);

// Roster order (Star v0.117): belt order first (lowest rank first), then A–Z by last name.
function rosterOrder(rankById) {
  return (a, b) => {
    const ra = rankById.get(a.eventRankId)?.position ?? 0;
    const rb = rankById.get(b.eventRankId)?.position ?? 0;
    if (ra !== rb) return ra - rb;
    return (
      a.lastName.localeCompare(b.lastName, 'en', { sensitivity: 'base' }) ||
      a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' })
    );
  };
}

// The payment that counts right now for a student: their latest payment that hasn't been
// reversed (Undo payment / Edit payment write a reversal, §1.6). null when not paid.
function activePaymentOf(payments, registrationId) {
  const mine = payments.filter((p) => p.registrationId === registrationId);
  const reversed = new Set(mine.filter((p) => p.kind === 'reversal').map((p) => p.reversesPaymentId));
  const live = mine.filter((p) => p.kind === 'payment' && !reversed.has(p.id));
  return live[live.length - 1] ?? null;
}

// The class line's gear tag: none of the class's ranks need sparring gear / all do / from a rank on.
function gearText(cls) {
  const needing = cls.ranks.filter((r) => r.sparringGear);
  if (needing.length === 0) return T.NO_SPARRING_GEAR;
  if (needing.length === cls.ranks.length) return T.SPARRING_GEAR;
  return T.sparringFrom(needing[0].name);
}

export default function EventPage({
  eventId,
  school,
  isAdmin,
  onBack,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
}) {
  const live = useLiveLoad({ key: eventId, enabled: !screenLocked, load: loadEvent });
  const data = live.data;
  const event = data?.event ?? null;
  const classes = data?.classes ?? [];
  const roster = data?.roster ?? [];
  const payments = data?.payments ?? [];
  const today = data?.today ?? '';

  const liveRef = useRef(live);
  const dataRef = useRef(data);
  useLayoutEffect(() => {
    liveRef.current = live;
    dataRef.current = data;
  });

  // ----- Device -----
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const layout = { isPhone, isTouch, isWide };

  // ----- State -----
  const [classSel, setClassSelState] = useState(() => classByEvent.get(eventId) ?? null);
  const [filter, setFilter] = useState(null); // null | 'paid' | 'notPaid' (Star v0.115 cards)
  const [removedOpen, setRemovedOpenState] = useState(() => removedOpenByEvent.get(eventId) ?? true);
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null); // { id, anchor }
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notSavedId, setNotSavedId] = useState(null);
  const [schools, setSchools] = useState(null); // for the flyer's address
  const busyRef = useRef(false);
  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
  });

  function setClassSel(id) {
    classByEvent.set(eventId, id);
    setClassSelState(id);
  }
  function setRemovedOpen(open) {
    removedOpenByEvent.set(eventId, open);
    setRemovedOpenState(open);
  }

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

  // ----- Focus after a dialog closes -----
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
    if (result === 'error') setBanner({ text: T.LOAD_EVENT_FAILED, retry: retryLoad });
    return result;
  }
  async function retryLoad() {
    const result = await liveRef.current.reload();
    if (result === 'ok') setBanner(null);
  }

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  // The event belongs to the other school (the switcher was changed, or a link from the other
  // school's device): Testing shows only the selected school's events (v0.34) — back to the list.
  const wrongSchool = event !== null && event.locationCode !== LOCATION_CODE[school];
  useEffect(() => {
    if (wrongSchool) onBack({ replace: true });
  }, [wrongSchool, onBack]);

  // Locking closes the ⋯ menu; dialogs only hide (see the drawing below).
  const menuBeforeLockRef = useRef(null);
  useEffect(() => {
    if (screenLocked) {
      setMenu((current) => {
        if (current) menuBeforeLockRef.current = current.id;
        return null;
      });
      return undefined;
    }
    const id = menuBeforeLockRef.current;
    if (!id) return undefined;
    menuBeforeLockRef.current = null;
    const frame = window.requestAnimationFrame(() => usable(moreEl(id))?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [screenLocked]);

  const modalShown = dialog !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  // ===== Derived data =====
  const rankById = new Map(classes.flatMap((c) => c.ranks.map((r) => [r.id, r])));
  const classById = new Map(classes.map((c) => [c.id, c]));
  const active = roster.filter((r) => r.status === 'active');
  const removed = roster.filter((r) => r.status !== 'active');
  const paidCount = active.filter((r) => r.paid).length;
  // Payments recorded = every recorded payment of this event, net of reversals (incl. withdrawn
  // students, whose payment stays on record; a deleted student's payment is gone).
  const paymentsTotal = data?.paymentTotalCents ?? payments.reduce((sum, p) => sum + p.amountCents, 0);
  // The part of it from removed (withdrawn / duplicate copy) students: shown as a small gray line
  // under the card (R8). The loader's number when it gives one, else worked out here.
  const removedIds = new Set(removed.map((r) => r.id));
  const removedPayments =
    data?.removedPaymentCents ?? payments.filter((p) => removedIds.has(p.registrationId)).reduce((sum, p) => sum + p.amountCents, 0);
  const countByClass = new Map(classes.map((c) => [c.id, 0]));
  for (const r of active) countByClass.set(r.eventClassId, (countByClass.get(r.eventClassId) ?? 0) + 1);
  const selected = classById.get(classSel) ?? classes[0] ?? null;
  const order = rosterOrder(rankById);
  let rows = selected ? active.filter((r) => r.eventClassId === selected.id).sort(order) : [];
  if (filter === 'paid') rows = rows.filter((r) => r.paid);
  if (filter === 'notPaid') rows = rows.filter((r) => !r.paid);
  const removedRows = selected && filter === null ? removed.filter((r) => r.eventClassId === selected.id).sort(order) : [];

  // Possible duplicates (whole event): pairs of an active "possible" row and the row it matches.
  const pairs = [];
  const seenPairs = new Set();
  for (const r of active) {
    if (r.duplicateState !== 'possible' || !r.duplicateOf) continue;
    const other = active.find((o) => o.id === r.duplicateOf);
    if (!other) continue;
    const key = [r.id, other.id].sort().join('|');
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    const [first, second] = [r, other].sort((a, b) => (a.registeredAt < b.registeredAt ? -1 : 1));
    pairs.push({ first, second });
  }

  // ===== Dialogs =====
  function openDialog(next) {
    clearToast();
    setMenu(null);
    setDialog({ key: Date.now(), touched: {}, triedSave: false, note: null, blocked: false, saving: false, failed: false, ...next });
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

  function openAdd(opener) {
    if (!event || event.state === 'finished') return;
    const values = { firstName: '', lastName: '', classId: selected?.id ?? null, rankId: null, stripes: false, payingBy: 'cash' };
    openDialog({ type: 'student', mode: 'add', values, initial: values, opener });
  }
  function openView(row, opener) {
    openDialog({ type: 'student', mode: 'view', rowId: row.id, snapshot: row, opener });
  }
  function editValuesFor(row) {
    return { firstName: row.firstName, lastName: row.lastName, classId: row.eventClassId, rankId: row.eventRankId, stripes: row.stripesConfirmed, payingBy: row.payingBy };
  }
  function openEdit(row, opener, fromView = false) {
    const values = editValuesFor(row);
    const next = { type: 'student', mode: 'edit', rowId: row.id, snapshot: row, values, initial: values, fromView };
    if (fromView) {
      // Same dialog, turned into fields (Star v0.112): keep its key so it doesn't re-open.
      setDialog((current) => ({ ...current, ...next, touched: {}, triedSave: false, note: null, blocked: false }));
    } else {
      openDialog({ ...next, opener });
    }
  }
  function openPayingBy(row, opener) {
    const values = { payingBy: row.payingBy };
    openDialog({ type: 'paying', rowId: row.id, snapshot: row, values, initial: values, opener });
  }
  function openEditPayment(row, opener) {
    const payment = activePaymentOf(payments, row.id);
    if (!payment) return;
    const values = { method: payment.method, amount: centsToInputText(payment.amountCents), paidOn: payment.paidOn };
    openDialog({ type: 'payment', rowId: row.id, snapshot: row, paymentId: payment.id, values, initial: values, opener });
  }
  function openCompare(pair, opener) {
    openDialog({ type: 'compare', firstId: pair.first.id, secondId: pair.second.id, pair, opener });
  }
  function openCompareFor(row, opener) {
    const pair = pairs.find((p) => p.first.id === row.id || p.second.id === row.id);
    if (pair) openCompare(pair, opener ?? rowEl(row.id));
  }
  async function openLink(opener) {
    openDialog({ type: 'link', opener });
    if (schools === null) {
      const result = await loadSchools();
      if (result.status === 'ok') setSchools(result.schools);
    }
  }

  function focusAfterClose(d) {
    if (d.type === 'link') focusLater(() => d.opener, linkEl);
    else if (d.type === 'student' && d.mode === 'add') focusLater(() => d.opener, addStudentEl);
    else if (d.type === 'compare') focusLater(() => d.opener, () => rowEl(d.firstId));
    else if (d.type === 'delete') focusLater(() => moreEl(d.rowId), () => d.opener);
    else focusLater(() => d.opener, () => rowEl(d.rowId));
  }
  function cancelDialog() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    // Edit details opened from the summary: Cancel goes back to the summary (Star v0.112).
    if (d.type === 'student' && d.mode === 'edit' && d.fromView) {
      setDialog((current) => ({ ...current, mode: 'view', note: null, blocked: false }));
      return;
    }
    setDialog(null);
    focusAfterClose(d);
  }
  function isDirty(d) {
    if (d.type === 'student' && d.mode !== 'view') return isStudentFormDirty(d);
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

  function handleDialogProblem(status) {
    if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (status === 'not_allowed') {
      patchDialog({ saving: false, note: 'NOT_ALLOWED', blocked: true });
      onRefreshProfile();
    } else if (status === 'stale' || status === 'not_found' || status === 'withdrawn') {
      patchDialog({ saving: false, note: 'STALE_DIALOG', blocked: true });
      reloadQuiet();
    } else if (status === 'finished') {
      patchDialog({ saving: false, note: 'FINISHED', blocked: true });
      reloadQuiet();
    } else if (status === 'already_paid') {
      patchDialog({ saving: false, note: 'ALREADY_PAID', blocked: true });
      reloadQuiet();
    } else if (status === 'invalid') {
      patchDialog({ saving: false, note: 'INVALID_DIALOG' });
    } else {
      patchDialog({ saving: false, note: 'SAVE_FAILED' });
    }
  }

  // ----- Save: Add student / Edit details -----
  async function saveStudent(canSave) {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const record = d.mode === 'edit' ? (roster.find((r) => r.id === d.rowId) ?? d.snapshot) : null;
    const check = checkStudentForm(d, d.snapshot ?? record);
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
    const name = `${p.firstName} ${p.lastName}`;
    const newClassId = rankById.get(p.eventRankId)?.eventClassId ?? d.values.classId;
    if (d.mode === 'add') {
      const result = await addStudent({ eventId, firstName: p.firstName, lastName: p.lastName, eventRankId: p.eventRankId, stripes: true, payingBy: p.payingBy });
      endWrite(result.status);
      if (result.status !== 'ok') {
        handleDialogProblem(result.status);
        return;
      }
      setDialog(null);
      setFilter(null);
      if (newClassId) setClassSel(newClassId); // show the class the new student is in
      const reloaded = reloadQuiet();
      showToast(T.studentAddedToast(name), { icon: false });
      focusLater(() => rowEl(result.id), addStudentEl, reloaded);
      return;
    }
    const snap = d.snapshot;
    const result = await updateStudent({
      registrationId: d.rowId,
      expectedVersion: snap.version,
      firstName: p.firstName,
      lastName: p.lastName,
      eventRankId: p.eventRankId,
    });
    endWrite(result.status);
    if (result.status !== 'ok') {
      handleDialogProblem(result.status);
      return;
    }
    setDialog(null);
    if (newClassId && newClassId !== selected?.id) setClassSel(newClassId); // follow the student to their new class
    const reloaded = reloadQuiet();
    const savedVersion = result.version;
    showToast(T.TOAST_CHANGES_SAVED, {
      icon: false,
      action: {
        label: T.UNDO,
        onAction: () =>
          runUndo(
            () => updateStudent({ registrationId: d.rowId, expectedVersion: savedVersion, firstName: snap.firstName, lastName: snap.lastName, eventRankId: snap.eventRankId }),
            { find: () => rowEl(d.rowId) },
          ),
      },
    });
    focusLater(() => rowEl(d.rowId), () => d.opener, reloaded);
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
    const result = await changePayingBy({ registrationId: d.rowId, expectedVersion: d.snapshot.version, payingBy: d.values.payingBy });
    endWrite(result.status);
    if (result.status !== 'ok') {
      handleDialogProblem(result.status);
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
        onAction: () => runUndo(() => changePayingBy({ registrationId: d.rowId, expectedVersion: savedVersion, payingBy: back }), { find: () => rowEl(d.rowId) }),
      },
    });
    focusLater(() => d.opener, () => rowEl(d.rowId), reloaded);
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
    const result = await editPayment({ paymentId: d.paymentId, ...check.payload });
    endWrite(result.status);
    if (result.status !== 'ok') {
      handleDialogProblem(result.status);
      return;
    }
    setDialog(null);
    const reloaded = reloadQuiet();
    showToast(T.TOAST_PAYMENT_SAVED, { icon: false });
    focusLater(() => d.opener, () => rowEl(d.rowId), reloaded);
  }

  // ===== Undo =====
  // options.notAllowedText: what to say if the database refuses the Undo for this person (e.g. a
  // staff member's payment Undo after the 10-second window).
  async function runUndo(call, focus = null, options = {}) {
    if (!beginWrite()) return;
    const result = await call();
    endWrite(result.status);
    const status = result.status;
    if (status === 'ok') {
      setBanner((current) => (current?.kind === 'undo' ? null : current));
      showToast(T.TOAST_UNDONE, { icon: false });
      const reloaded = reloadQuiet();
      if (focus) focusLater(focus.find, focus.fallback ?? addStudentEl, reloaded);
    } else if (status === 'no_access') {
      onNoAccess();
    } else if (status === 'not_allowed') {
      setBanner({ text: options.notAllowedText ?? T.ROSTER_NOT_ALLOWED });
      onRefreshProfile();
    } else if (status === 'error') {
      setBanner({ kind: 'undo', text: T.UNDO_FAILED, retry: () => runUndo(call, focus, options) });
    } else {
      setBanner({ text: T.UNDO_STALE });
      reloadQuiet();
    }
  }

  // A row action (Mark paid, Withdraw …) that the database didn't accept.
  function rowProblem(status, row, retry) {
    const name = T.studentLabel(row);
    if (status === 'no_access') onNoAccess();
    else if (status === 'not_allowed') {
      setBanner({ text: T.ROSTER_NOT_ALLOWED });
      onRefreshProfile();
      reloadQuiet();
    } else if (status === 'already_paid') {
      setBanner({ text: T.alreadyPaid(name) });
      reloadQuiet();
    } else if (status === 'withdrawn') {
      setBanner({ text: T.isWithdrawn(name) });
      reloadQuiet();
    } else if (status === 'error') {
      setNotSavedId(row.id);
      setBanner({ kind: 'row', text: retry.text, retry: retry.run });
    } else {
      setBanner({ text: T.ROSTER_STALE });
      reloadQuiet();
    }
  }

  // ===== Mark paid: one click, paid in full (plan answer 6) =====
  async function doMarkPaid(row) {
    if (!beginWrite()) return;
    const result = await markPaid({ registrationId: row.id, expectedVersion: row.version });
    endWrite(result.status);
    const name = T.studentLabel(row);
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.markPaidFailed(name), run: () => doMarkPaid(row) });
      return;
    }
    setNotSavedId(null);
    setBanner((current) => (current?.kind === 'row' ? null : current));
    reloadQuiet();
    const paymentId = result.paymentId;
    showToast(T.markedPaidToast(name, result.amountCents, result.method), {
      icon: false,
      action: {
        label: T.UNDO,
        onAction: () => runUndo(() => undoPayment({ paymentId }), { find: () => rowEl(row.id) }, { notAllowedText: T.UNDO_PAYMENT_TOO_LATE }),
      },
    });
  }

  // ===== Withdraw / Restore (admins, Star v0.113) =====
  async function doWithdraw(row, restore = false) {
    if (!beginWrite()) return;
    const call = restore ? restoreStudent : withdrawStudent;
    const result = await call({ registrationId: row.id, expectedVersion: row.version });
    endWrite(result.status);
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.actionFailed, run: () => doWithdraw(row, restore) });
      return;
    }
    setNotSavedId(null);
    const reloaded = reloadQuiet();
    const name = T.studentLabel(row);
    const newVersion = result.version;
    const undoCall = restore ? withdrawStudent : restoreStudent;
    showToast(restore ? T.restoredToast(name) : T.withdrawnToast(name), {
      icon: false,
      action: {
        label: T.UNDO,
        onAction: () => runUndo(() => undoCall({ registrationId: row.id, expectedVersion: newVersion }), { find: () => rowEl(row.id) }),
      },
    });
    focusLater(() => rowEl(row.id), addStudentEl, reloaded);
  }

  // ===== Undo payment from ⋯ (admins, any time) =====
  async function doUndoPayment(row) {
    const payment = activePaymentOf(payments, row.id);
    if (!payment || !beginWrite()) return;
    const result = await undoPayment({ paymentId: payment.id });
    endWrite(result.status);
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.actionFailed, run: () => doUndoPayment(row) });
      return;
    }
    reloadQuiet();
    showToast(T.paymentUndoneToast(T.studentLabel(row)), { icon: false });
  }

  // ===== Delete permanently (admins; read fresh first so the warning names the real payment) =====
  async function startDelete(row, anchor) {
    if (!isAdmin || !beginWrite()) return;
    const fresh = await loadEvent(eventId);
    endWrite(fresh.status === 'ok' ? 'ok' : fresh.status);
    if (fresh.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (fresh.status !== 'ok') {
      setBanner({ text: fresh.status === 'not_found' ? T.ROSTER_STALE : T.LOAD_EVENT_FAILED, retry: fresh.status === 'error' ? retryLoad : undefined });
      return;
    }
    live.setLocal(fresh);
    const freshRow = fresh.roster.find((r) => r.id === row.id);
    if (!freshRow) {
      setBanner({ text: T.ROSTER_STALE });
      return;
    }
    const mine = fresh.payments.filter((p) => p.registrationId === row.id);
    const counted = activePaymentOf(fresh.payments, row.id);
    const name = T.studentLabel(freshRow);
    openDialog({
      type: 'delete',
      rowId: row.id,
      name,
      title: T.deleteStudentTitle(name),
      body: T.deleteStudentBody(fresh.event.name, counted ? { cents: counted.amountCents, method: counted.method, paidOn: counted.paidOn } : null),
      args: { registrationId: row.id, expectedVersion: freshRow.version, expectedPaymentIds: mine.map((p) => p.id) },
      index: rows.findIndex((r) => r.id === row.id),
      opener: anchor,
    });
  }
  async function confirmDelete() {
    const d = dialogRef.current;
    if (!d || d.saving || !beginWrite()) return;
    patchDialog({ saving: true, failed: false });
    const result = await deleteStudent(d.args);
    endWrite(result.status);
    const status = result.status;
    if (status === 'ok') {
      setDialog(null);
      showToast(T.deletedToast(d.name), { icon: false });
      const reloaded = reloadQuiet();
      focusLater(
        () => {
          const list = rowsRef.current;
          const target = list[d.index] ?? list[d.index - 1];
          return target ? rowEl(target.id) : null;
        },
        addStudentEl,
        reloaded,
      );
    } else if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (status === 'error') {
      patchDialog({ saving: false, failed: true });
    } else {
      setDialog(null);
      setBanner({ text: status === 'not_allowed' ? T.ROSTER_NOT_ALLOWED : T.ROSTER_STALE });
      if (status === 'not_allowed') onRefreshProfile();
      reloadQuiet();
      focusLater(() => moreEl(d.rowId));
    }
  }
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  });

  // ===== Possible duplicate: keep one / keep both (Star v0.114) =====
  async function keepOne(keep, other) {
    const d = dialogRef.current;
    if (!d || d.saving || !beginWrite()) return;
    patchDialog({ saving: true, failed: false });
    const result = await resolveDuplicate({ keepId: keep.id, keepVersion: keep.version, otherId: other.id, otherVersion: other.version, keepBoth: false });
    endWrite(result.status);
    if (result.status === 'error') {
      patchDialog({ saving: false, failed: true });
      return;
    }
    setDialog(null);
    if (result.status !== 'ok') {
      if (result.status === 'no_access') onNoAccess();
      else setBanner({ text: result.status === 'not_allowed' ? T.ROSTER_NOT_ALLOWED : T.ROSTER_STALE });
      reloadQuiet();
      return;
    }
    const reloaded = reloadQuiet();
    const name = T.studentLabel(other);
    // Undo = Restore the copy (R7). Everyone gets the 5-second Undo: the database lets the staff
    // member who removed the copy restore it within 10 seconds (admins any time, from Removed too).
    const action = {
      label: T.UNDO,
      onAction: () =>
        runUndo(
          async () => {
            const fresh = await loadEvent(eventId);
            if (fresh.status !== 'ok') return { status: fresh.status === 'not_found' ? 'stale' : fresh.status };
            const copy = fresh.roster.find((r) => r.id === other.id);
            if (!copy) return { status: 'stale' };
            return restoreStudent({ registrationId: other.id, expectedVersion: copy.version });
          },
          { find: () => rowEl(other.id) },
          { notAllowedText: T.UNDO_DUPLICATE_TOO_LATE },
        ),
    };
    showToast(T.duplicateRemovedToast(name), { icon: false, action });
    focusLater(() => rowEl(keep.id), addStudentEl, reloaded);
  }
  async function keepBoth() {
    const d = dialogRef.current;
    if (!d || d.saving || !beginWrite()) return;
    const { first, second } = d.pair;
    patchDialog({ saving: true, failed: false });
    const result = await resolveDuplicate({ keepId: first.id, keepVersion: first.version, otherId: second.id, otherVersion: second.version, keepBoth: true });
    endWrite(result.status);
    if (result.status === 'error') {
      patchDialog({ saving: false, failed: true });
      return;
    }
    setDialog(null);
    if (result.status !== 'ok') {
      if (result.status === 'no_access') onNoAccess();
      else setBanner({ text: result.status === 'not_allowed' ? T.ROSTER_NOT_ALLOWED : T.ROSTER_STALE });
      reloadQuiet();
      return;
    }
    const reloaded = reloadQuiet();
    showToast(T.TOAST_KEPT_BOTH, { icon: false });
    focusLater(() => rowEl(first.id), addStudentEl, reloaded);
  }

  // ===== Copy link =====
  async function copyLink(link) {
    try {
      if (!link || !navigator.clipboard) throw new Error('No clipboard');
      await navigator.clipboard.writeText(link);
      showToast(T.TOAST_LINK_COPIED, { icon: false });
    } catch {
      setBanner({ text: T.COPY_FAILED });
    }
  }

  // ===== The ⋯ menu (Star v0.110: staff see only what they can do) =====
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
    const row = roster.find((r) => r.id === menu.id);
    if (!row) return null;
    const name = T.studentLabel(row);
    const anchor = menu.anchor;
    const items = [];
    // One fixed order on every row (R8): Edit details (always first, never moves), Change how
    // they'll pay, Review possible duplicate — Edit payment, Undo payment — Withdraw / Restore,
    // Delete permanently. Items that don't apply are left out; the rest keep their order. A
    // divider starts each later group, but never the menu itself.
    const groupStart = () => items.length > 0;
    if (row.status === 'active') {
      items.push({ key: 'edit', label: T.EDIT_DETAILS, Icon: IconEdit, onSelect: () => openEdit(row, anchor) });
      if (!row.paid) items.push({ key: 'paying', label: T.CHANGE_PAYING_BY, Icon: NoIcon, onSelect: () => openPayingBy(row, anchor) });
      if (row.duplicateState === 'possible') items.push({ key: 'review', label: T.REVIEW_DUPLICATE, Icon: IconAlertTriangle, onSelect: () => openCompareFor(row, anchor) });
      if (isAdmin && row.paid) {
        items.push({ key: 'editpay', label: T.EDIT_PAYMENT, Icon: IconCashEdit, separatorBefore: groupStart(), onSelect: () => openEditPayment(row, anchor) });
        items.push({ key: 'undopay', label: T.UNDO_PAYMENT, Icon: IconArrowBackUp, disabled: busy, onSelect: () => doUndoPayment(row) });
      }
    }
    if (isAdmin) {
      if (row.status === 'active') {
        items.push({ key: 'withdraw', label: T.WITHDRAW, Icon: IconUserMinus, separatorBefore: groupStart(), disabled: busy, onSelect: () => doWithdraw(row) });
      } else {
        items.push({ key: 'restore', label: T.RESTORE, Icon: NoIcon, separatorBefore: groupStart(), disabled: busy, onSelect: () => doWithdraw(row, true) });
      }
      items.push({ key: 'delete', label: T.DELETE_PERMANENTLY, Icon: IconTrash, danger: true, disabled: busy, onSelect: () => startDelete(row, anchor) });
    }
    const rank = rankById.get(row.eventRankId);
    const subtitle = rank ? `${rank.name} → ${rank.testingFor?.name ?? T.NO_NEW_RANK}` : '';
    return { title: name, subtitle, label: T.moreForStudent(name), items };
  }

  // ===== Keyboard =====
  const navKeys = [...rows, ...(removedOpen ? removedRows : [])].map((r) => r.id);
  const nav = useRowArrowNav({
    rowKeys: navKeys,
    onOpen: (id) => {
      const row = roster.find((r) => r.id === id);
      if (row) openView(row, rowEl(id));
    },
  });
  const addShown = live.status === 'ready' && event !== null && event.state !== 'finished';
  useShortcutN({
    enabled: addShown && dialog === null && menu === null && !screenLocked && !busy,
    onPress: () => openAdd(addStudentEl()),
  });

  // ===== Drawing =====
  const backLink = (
    <button type="button" className="link-button ev-back" onClick={() => onBack()}>
      {/* ti-arrow-left = back */}
      <IconArrowLeft size={16} aria-hidden="true" />
      {T.BACK_TO_COLOR_BELT}
    </button>
  );

  if (live.status === 'loading' || live.status === 'idle' || live.status === 'noAccess' || wrongSchool) {
    return (
      <>
        {backLink}
        <div className="clist tskeleton ev-page-skeleton" aria-busy="true">
          <span className="visually-hidden">{T.LOADING_EVENT}</span>
          {[0, 1, 2, 3].map((index) => (
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
        <p className="tempty">{T.EVENT_GONE}</p>
      </>
    );
  }
  if (live.status === 'error' || !event) {
    return (
      <>
        {backLink}
        <ErrorBanner text={T.LOAD_EVENT_FAILED} onRetry={() => liveRef.current.reload()} />
      </>
    );
  }

  const addButton = addShown ? (
    <button type="button" className="btn btn-primary" data-add-student onClick={(clickEvent) => openAdd(clickEvent.currentTarget)}>
      {/* ti-plus = add new */}
      <IconPlus size={16} aria-hidden="true" />
      {T.ADD_STUDENT}
    </button>
  ) : null;
  const linkButton = (
    <button type="button" className="btn" data-reg-link onClick={(clickEvent) => openLink(clickEvent.currentTarget)}>
      {/* ti-qrcode = registration link / QR code */}
      <IconQrcode size={16} aria-hidden="true" />
      {T.REGISTRATION_LINK}
    </button>
  );

  const cards = [
    { key: null, label: T.CARD_STUDENTS, Icon: IconUsers, value: active.length },
    { key: 'paid', label: T.CARD_PAID, Icon: IconCheck, value: paidCount },
    { key: 'notPaid', label: T.CARD_NOT_PAID, Icon: IconClock, value: active.length - paidCount },
    { key: 'money', label: T.CARD_PAYMENTS, Icon: IconCash, value: T.dollars(paymentsTotal) },
  ];

  const ctx = {
    layout,
    nav,
    rankById,
    busy,
    isAdmin,
    menuFor: menu?.id ?? null,
    selectedId: dialog && !screenLocked && dialog.rowId ? dialog.rowId : null,
    notSavedId,
    tableLabel: selected ? selected.className : T.TAB_STUDENTS,
    handlers: {
      onOpen: (row) => openView(row, rowEl(row.id)),
      onMore: (row, anchor) => openMenu(row, anchor),
      onMarkPaid: (row) => doMarkPaid(row),
      onReview: (row) => openCompareFor(row),
    },
  };

  let emptyText = T.EMPTY_CLASS_ROSTER;
  if (filter === 'paid') emptyText = T.NO_STUDENTS_FILTERED_PAID;
  if (filter === 'notPaid') emptyText = T.NO_STUDENTS_FILTERED_NOT_PAID;

  // ----- The open dialog (never while locked: it comes back after unlocking) -----
  let dialogElement = null;
  if (dialog && !screenLocked) {
    const common = { isPhone, onCancel: cancelDialog, onRequestClose: requestClose, onChange: changeValues };
    const record = dialog.rowId ? (roster.find((r) => r.id === dialog.rowId) ?? dialog.snapshot) : null;
    if (dialog.type === 'student') {
      dialogElement = (
        <StudentDialog
          key={dialog.key}
          state={dialog}
          event={event}
          school={school}
          classes={classes}
          today={today}
          record={dialog.mode === 'edit' ? dialog.snapshot : record}
          canEdit={record?.status === 'active'}
          onTouch={touch}
          onSave={saveStudent}
          onEdit={() => record && openEdit(record, dialog.opener, true)}
          {...common}
        />
      );
    } else if (dialog.type === 'paying') {
      dialogElement = <PayingByDialog key={dialog.key} state={dialog} name={T.studentLabel(dialog.snapshot)} onSave={savePayingBy} {...common} />;
    } else if (dialog.type === 'payment') {
      dialogElement = <EditPaymentDialog key={dialog.key} state={dialog} name={T.studentLabel(dialog.snapshot)} onTouch={touch} onSave={savePayment} {...common} />;
    } else if (dialog.type === 'compare') {
      const first = roster.find((r) => r.id === dialog.firstId) ?? dialog.pair.first;
      const second = roster.find((r) => r.id === dialog.secondId) ?? dialog.pair.second;
      dialogElement = (
        <CompareDialog
          key={dialog.key}
          first={first}
          second={second}
          rankById={rankById}
          isPhone={isPhone}
          saving={dialog.saving}
          failed={dialog.failed}
          onKeep={keepOne}
          onKeepBoth={keepBoth}
          onClose={cancelDialog}
        />
      );
    } else if (dialog.type === 'link') {
      const address = schools?.find((s) => s.code === event.locationCode)?.address ?? null;
      dialogElement = <RegistrationLinkDialog key={dialog.key} event={event} school={school} address={address} isPhone={isPhone} onCopy={copyLink} onClose={cancelDialog} />;
    } else if (dialog.type === 'delete') {
      dialogElement = (
        <ConfirmDeleteDialog
          key={dialog.key}
          title={dialog.title}
          body={dialog.body}
          hint={T.DELETE_STUDENT_HINT}
          keepLabel={T.KEEP_STUDENT}
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
  const classLabelId = `event-${eventId}-class-label`;
  const time = selected ? classTimeLabel(selected.startTime, selected.endTime) : '';
  const selectedCount = selected ? (countByClass.get(selected.id) ?? 0) : 0;

  return (
    <>
      {backLink}
      <div className="phead ev-phead">
        <div className="phead-titles">
          <h1 className="ptitle">{event.name}</h1>
          <p className="ev-summary">{T.eventSummary(event, school, active.length, event.state)}</p>
        </div>
        <div className="ev-head-buttons">
          {addButton}
          {linkButton}
        </div>
      </div>
      <div className="ttabs" role="tablist" aria-label={event.name}>
        <span className="ttab is-current" role="tab" aria-selected="true" tabIndex={-1}>
          {T.TAB_STUDENTS}
        </span>
      </div>

      {banner && (
        <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy} onDismiss={() => setBanner(null)} />
      )}

      {/* Summary cards (Star v0.115): clicking Paid / Not paid filters the roster. */}
      <div className="ev-cards">
        {cards.map((card) => {
          const isFilter = card.key === 'paid' || card.key === 'notPaid';
          const pressed = isFilter && filter === card.key;
          const inner = (
            <>
              <span className="ev-card-label">
                <card.Icon size={16} aria-hidden="true" />
                {card.label}
              </span>
              <span className="ev-card-value">{card.value}</span>
            </>
          );
          if (card.key === 'money') {
            return (
              <div key="money" className="ev-card">
                {inner}
                {removedPayments > 0 && <span className="ev-card-note">{T.includesRemoved(removedPayments)}</span>}
              </div>
            );
          }
          return (
            <button
              key={card.key ?? 'all'}
              type="button"
              className={`ev-card ev-card--button${pressed ? ' is-selected' : ''}`}
              aria-pressed={isFilter ? (pressed ? 'true' : 'false') : undefined}
              onClick={() => setFilter(isFilter && filter !== card.key ? card.key : null)}
            >
              {inner}
            </button>
          );
        })}
      </div>
      {filter && (
        <p className="ev-filter-line">
          {filter === 'paid' ? T.SHOWING_PAID : T.SHOWING_NOT_PAID} ·{' '}
          <button type="button" className="link-button" onClick={() => setFilter(null)}>
            {T.SHOW_ALL}
          </button>
        </p>
      )}

      {/* Possible duplicates (Star v0.114): one line per pair, with Review. */}
      {pairs.length > 0 && (
        <div className="ev-dupbox" role="status">
          <IconAlertTriangle size={16} aria-hidden="true" className="ev-dupbox-icon" />
          <div className="ev-dupbox-lines">
            {pairs.map((pair, index) => (
              <p key={pair.first.id} className="ev-dupbox-line">
                {index === 0 && <strong>{T.duplicateBoxLine(pairs.length)}</strong>}
                {index === 0 && ' · '}
                {T.registeredTwice(T.studentLabel(pair.first), classById.get(pair.first.eventClassId)?.className ?? '')}
                <button type="button" className="btn btn-sm ev-dupbox-review" onClick={(clickEvent) => openCompare(pair, clickEvent.currentTarget)}>
                  {T.REVIEW}
                </button>
              </p>
            ))}
          </div>
        </div>
      )}

      {classes.length === 0 ? (
        <p className="tempty">{T.NO_CLASSES_IN_EVENT}</p>
      ) : (
        <>
          <span id={classLabelId} className="visually-hidden">
            {T.CLASS_SWITCH_LABEL}
          </span>
          <div className="ev-class-switch">
            <ChoiceGroup
              labelId={classLabelId}
              value={selected?.id ?? null}
              onChange={(id) => {
                setClassSel(id);
                setMenu(null);
              }}
              options={classes.map((c) => ({
                key: c.id,
                label: `${c.className} ${countByClass.get(c.id) ?? 0}`,
                content: (
                  <>
                    <span className="ev-cs-name">{c.className}</span>
                    <span className="ev-cs-count">{countByClass.get(c.id) ?? 0}</span>
                  </>
                ),
              }))}
            />
          </div>
          {selected && (
            <p className="ev-classline">
              <strong>{T.classLineTitle(selected.className, time)}</strong>
              <span>{T.studentsCount(selectedCount)}</span>
              <span className="ttag">{gearText(selected)}</span>
            </p>
          )}
          <RosterRows
            rows={rows}
            removedRows={removedRows}
            removedOpen={removedOpen}
            onToggleRemoved={() => setRemovedOpen(!removedOpen)}
            emptyText={emptyText}
            ctx={ctx}
          />
        </>
      )}

      {content && (
        <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />
      )}
      {dialogElement}
    </>
  );
}
