// CandidatesTab.jsx — the Candidates tab of a Star testing event (build phase 3).
// Why it exists: approved Candidates mockups (13 screens, v0.121), Private mockups 1–4 (v0.153) and
// the phase 3 gap mockups (G1–G16, v0.508). This file is the "brain" of the tab, built the same way
// as Color Belt's live event page (src/screens/testing/event/EventPage.jsx), copied rather than
// shared. It:
//   - shows the roster of the chosen Dan in belt order (Dan switch with counts, v0.108, v0.117),
//     the four summary cards with their filter (v0.115, G12), the one-school view with "Show both
//     schools" (v0.118, G12), the possible-duplicate box (v0.114) and the Removed group (G13)
//   - opens New candidate / Make-up from an earlier testing (v0.111), the detail summary with
//     History and View signature, Edit details with the Dan-change confirmation (v0.112, v0.164)
//   - records payments, refunds and the corrections (v0.109, v0.110, v0.166, G1, G16), private
//     testing (v0.148–v0.152) and Withdraw / Restore / Delete permanently (v0.113)
//   - the design review's follow-ups (v0.517, DR G1–G4): one ⋯ menu order in three groups
//     (src/lib/star/candidateMenu.js), ⋯ → Edit details opens the form straight away, Undo after
//     Edit payment, Restore and Change how they'll pay, and the Not paid card's ti-circle-x
//   - follows "Hide private details" (v0.506, G4–G9): no payment columns, cards or items; private
//     values read "Hidden on this tablet"
// The data (event, its rubric copy and the candidates) is loaded by StarEventPage with the 15-second
// quiet refresh (v0.507 Q3); this tab reloads through `reload()` after every change.
//
// Rules worth knowing (the same as Color Belt's tabs):
//   - ONE change at a time: while a save is on its way, other changes are ignored.
//   - Dialog saves WAIT for the database; nothing is shown as saved before it is.
//   - The dialog's values live HERE, so a screen lock hides the dialog and brings it back.
//   - "stale" = someone else changed the same thing: nothing is overwritten, the person is told,
//     the list reloads. For that to work, every dialog saves with the version / payment id it OPENED
//     with (dialogSnapshot.js), never the roster's newest one from the 15-second refresh.
//   - Admin vs staff only changes what is SHOWN — the database enforces who may do what (v0.110).
//   - Fees: Record payment fills in candidate.expectedFeeCents; the screen never works out a fee.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  IconAlertTriangle, IconArrowBackUp, IconCalendar, IconCashEdit, IconCheck, IconCircleX, IconSum, IconEdit, IconPlus, IconReceiptRefund,
  IconRepeat, IconSchool, IconSwitchHorizontal, IconTrash, IconUserMinus, IconUserPlus, IconUsers,
} from '@tabler/icons-react';
import ErrorBanner from '../../../../components/ErrorBanner.jsx';
import RowMenu from '../../../../components/RowMenu.jsx';
import { centsToInputText } from '../../../../lib/money.js';
import { LOCATION_CODE, LOCATION_NAME } from '../../../../lib/device.js';
import {
  addCandidate, addMakeup, changePayingBy, clearPrivate, deleteCandidate, editPayment, loadCandidateDetail, loadCandidateHistory,
  loadMakeupList, recordPayment, recordRefund, resolveDuplicate, restoreCandidate, setPrivate, undoPayment, updateCandidate,
  viewSignature, withdrawCandidate,
} from '../../../../lib/star/candidatesApi.js';
import { PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../../../lib/useMediaQuery.js';
import { useRowArrowNav } from '../../../../lib/useRowArrowNav.js';
import ChoiceGroup from '../../events/ChoiceGroup.jsx';
import CandidateDialog, { checkCandidateForm, isCandidateDirty } from './CandidateDialog.jsx';
import CandidateRows, { statusTagKind } from './CandidateRows.jsx';
import { ConfirmBox } from './dialogParts.jsx';
import MakeupPickerDialog from './MakeupPickerDialog.jsx';
import PrivateDialog, { checkPrivate, isPrivateDirty } from './PrivateDialog.jsx';
import { takeSnapshot, writeArgs } from '../../../../lib/star/dialogSnapshot.js';
import { candidateMenuKeys } from '../../../../lib/star/candidateMenu.js';
import SignatureDialog from './SignatureDialog.jsx';
import StarCompareDialog from './StarCompareDialog.jsx';
import { checkRecordPayment, EditPaymentDialog, isRecordDirty, PayingByDialog, RecordPaymentDialog, RefundDialog } from './StarPaymentDialogs.jsx';
import * as T from './text.js';

// Kept while the page is open: the chosen Dan and the Removed group's open state, per event.
const danByEvent = new Map();
const removedOpenByEvent = new Map();

const PAYMENT_DIALOGS = ['record', 'editPayment', 'refund', 'payingBy', 'undoPayment', 'undoRefund'];
const BLOCKING = ['stale', 'not_found', 'not_allowed', 'withdrawn', 'finished'];

const find = (selector) => document.querySelector(selector);
const rowEl = (id) => find(`[data-nav-row="${id}"]`);
const moreEl = (id) => find(`[data-star-cand-more="${id}"]`);
const addEl = () => find('[data-star-add-cand]');
const usable = (element) => (element && element.isConnected && element.getClientRects().length > 0 ? element : null);

export default function CandidatesTab({
  event,
  copy,
  candidates,
  today,
  reload, // () => Promise<'ok' | 'error' | …> — StarEventPage's quiet reload
  isAdmin,
  hidden, // Hide private details (v0.506)
  location, // the top-bar switcher: 'Worcester' | 'Shrewsbury' | 'Both'
  onLocationChange,
  panelId,
  tabId,
  renderHeader, // (addButton) => the page header (StarEventPage)
  openAddMenu = false, // phase 5: Grading's "Add candidate" switched here — open the add menu once
  onAddMenuOpened, // () => void — the page forgets that request
  onGradePrivate, // phase 5: (row, opener) => open the private grading page (H5, proposal 18)
  screenLocked,
  onNoAccess,
  onRefreshProfile,
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
  const [filter, setFilter] = useState(null); // null | 'paid' | 'notPaid' | 'payments' (G12)
  const [removedOpen, setRemovedOpenState] = useState(() => removedOpenByEvent.get(eventId) ?? false);
  const [dialog, setDialog] = useState(null);
  const [overlay, setOverlay] = useState(null); // a second, small dialog over `dialog` (Dan confirm, signature)
  const [menu, setMenu] = useState(null); // { id, anchor } or { id: 'add', anchor }
  const [banner, setBanner] = useState(null); // { text, retry?, kind? }
  const [busy, setBusy] = useState(false);
  const [notSavedId, setNotSavedId] = useState(null);
  const busyRef = useRef(false);
  const dialogRef = useRef(dialog);
  const candidatesRef = useRef(candidates);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
    candidatesRef.current = candidates;
  });

  // Phase 5: "Add candidate" on the Grading tab opens this tab with its add menu open, anchored on
  // this tab's own Add candidate button (the menu and its dialogs live here).
  useEffect(() => {
    if (!openAddMenu) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const anchor = addEl();
      if (anchor) setMenu({ id: 'add', anchor });
      onAddMenuOpened?.();
    });
    return () => window.cancelAnimationFrame(frame);
    // (only when asked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAddMenu]);

  function setDan(dan) {
    danByEvent.set(eventId, dan);
    setDanSelState(dan);
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

  // ----- Keyboard focus after a dialog closes (Color Belt's approach) -----
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

  const modalShown = (dialog !== null || overlay !== null) && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  // Locking closes the ⋯ menu (dialogs only hide).
  useEffect(() => {
    if (screenLocked) setMenu(null);
  }, [screenLocked]);

  // Hide private details switched on: no payment dialog, payment filter, money toast or row
  // banner with a Retry may stay (G4).
  const hiddenBeforeRef = useRef(hidden);
  // The switch as it is NOW, for answers that arrive after a save was sent: a payment saved or
  // undone just before the switch went on must not bring money back on screen (no money banner
  // with Retry, no "Payment recorded" toast with Undo). `hidden` itself would be the value from
  // when the save started.
  const hiddenNowRef = useRef(hidden);
  useEffect(() => {
    hiddenNowRef.current = hidden;
    const switchedOn = hidden && !hiddenBeforeRef.current; // a change, not the first drawing
    hiddenBeforeRef.current = hidden;
    if (!switchedOn) return;
    if (dialog && PAYMENT_DIALOGS.includes(dialog.type)) setDialog(null);
    if (filter) setFilter(null);
    setMenu(null);
    // A toast may name money ("Payment recorded", a refund) or carry its Undo: it goes too.
    clearToast();
    // So does every banner: after a failed Record payment / Undo payment its Retry would move
    // money, and an "already paid" banner shows paid status — neither may stay while hidden
    // (other banners, e.g. a withdraw error, go too; the list reloads every 15 seconds anyway).
    // The row's Not saved mark goes with it (nothing is retrying any more).
    setBanner(null);
    setNotSavedId(null);
    // (only when the switch changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  // ===== What the list shows =====
  const schoolCode = location === 'Both' ? null : LOCATION_CODE[location];
  const oneSchool = schoolCode !== null && schoolCode !== undefined;
  const inSchool = (c) => !oneSchool || c.locationCode === schoolCode;
  const active = candidates.filter((c) => c.status === 'active' && inSchool(c));
  const removedAll = candidates.filter((c) => c.status === 'withdrawn' && inSchool(c));
  const nonMakeup = active.filter((c) => !c.isMakeup);
  const cards = {
    candidates: active.length,
    bySchool: ['shrewsbury', 'worcester'].map((code) => ({ code, n: active.filter((c) => c.locationCode === code).length })), // as drawn: Shrewsbury, Worcester
    paid: nonMakeup.filter((c) => c.paid).length,
    notPaid: nonMakeup.filter((c) => !c.paid && c.feeKind !== 'none').length,
    payments: active.reduce((sum, c) => sum + (c.paidCents ?? 0), 0),
  };
  const danCount = (dan) => active.filter((c) => c.dan === dan).length;
  const passFor = (dan) => dans.find((d) => d.dan === dan)?.passMark ?? null;
  const categoryName = new Map();
  for (const d of dans) for (const cat of d.categories ?? []) categoryName.set(cat.id, cat.name);
  const subjectNames = (row) => (row.makeupSubjects ?? []).map((s) => categoryName.get(s.eventCategoryId)).filter(Boolean);
  const belowPassMark = (row) => ((row.makeupSubjects ?? []).some((s) => s.kind === 'chosen') ? passFor(row.dan) : null);

  let shown = active.filter((c) => c.dan === danSel);
  if (filter === 'paid' || filter === 'payments') shown = shown.filter((c) => !c.isMakeup && c.paid);
  if (filter === 'notPaid') shown = shown.filter((c) => !c.isMakeup && !c.paid && c.feeKind !== 'none');
  const removedRows = removedAll.filter((c) => c.dan === danSel);
  const rowsInView = [...shown, ...(removedOpen ? removedRows : [])];
  // G4: while hidden, the Status column shows only when a shown row has a status tag.
  const showStatusCol = !hidden || rowsInView.some((c) => statusTagKind(c, notSavedId) !== null);

  // Possible duplicates (v0.114): one line per pair, in the whole event (both schools' view).
  const pairs = [];
  const seen = new Set();
  for (const c of active) {
    if (c.duplicateState !== 'possible' || seen.has(c.id)) continue;
    const other = active.find((o) => o.id !== c.id && o.duplicateState === 'possible' && (o.duplicateOf === c.id || c.duplicateOf === o.id));
    if (!other) continue;
    seen.add(c.id);
    seen.add(other.id);
    const [a, b] = [c, other].sort((x, y) => (x.registeredAt < y.registeredAt ? -1 : 1));
    pairs.push({ a, b });
  }

  // ===== Banners and answers =====
  function rowProblem(action, result, row, retry) {
    const status = result.status;
    if (status === 'no_access') {
      onNoAccess();
      return;
    }
    const msg = T.statusMessage(action, status, { name: row ? T.candidateName(row) : '' });
    if (!msg) return;
    if (status === 'error') {
      // Private details hidden meanwhile: the message stays, but without a Retry that could move
      // money (and no Not saved mark); the list shows the latest.
      if (hiddenNowRef.current) {
        setBanner({ text: msg.text });
        reload();
        return;
      }
      if (row) setNotSavedId(row.id);
      setBanner({ kind: 'row', text: msg.text, retry });
      return;
    }
    if (status === 'not_allowed') onRefreshProfile();
    setBanner({ text: msg.text });
    reload();
  }
  function rowOk(row) {
    setNotSavedId((current) => (row && current === row.id ? null : current));
    setBanner((current) => (current?.kind === 'row' || current?.kind === 'undo' ? null : current));
  }

  // ===== Dialogs =====
  function openDialog(next) {
    clearToast();
    setMenu(null);
    setDialog({ key: Date.now(), touched: {}, triedSave: false, note: null, blocked: false, saving: false, ...next });
  }
  function patchDialog(patch) {
    setDialog((current) => (current ? { ...current, ...patch } : current));
  }
  function changeValues(patch) {
    setDialog((current) => {
      if (!current || current.saving) return current;
      const { fieldNote, ...values } = patch;
      const note = current.note && !current.blocked ? null : current.note;
      return { ...current, values: { ...current.values, ...values }, note, ...(fieldNote !== undefined ? { fieldNote } : {}) };
    });
  }
  function touch(field) {
    setDialog((current) => (current && !current.touched[field] ? { ...current, touched: { ...current.touched, [field]: true } } : current));
  }
  function rowOf(id) {
    return candidatesRef.current.find((c) => c.id === id) ?? null;
  }
  function closeDialog(d = dialogRef.current) {
    setDialog(null);
    setOverlay(null);
    if (!d) return;
    if (d.opener) focusLater(() => d.opener, () => (d.rowId ? rowEl(d.rowId) : addEl()));
    else if (d.rowId) focusLater(() => rowEl(d.rowId));
  }
  const DIRTY = {
    candidate: (d) => (d.mode === 'view' ? false : isCandidateDirty(d)),
    record: isRecordDirty,
    editPayment: isRecordDirty,
    refund: isRecordDirty,
    payingBy: (d) => d.values.payingBy !== d.initial.payingBy,
    private: isPrivateDirty,
  };
  function requestClose() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const dirty = DIRTY[d.type]?.(d) ?? false;
    if (!dirty) {
      if (d.type === 'candidate' && d.mode === 'edit') {
        leaveEdit(d);
        return;
      }
      closeDialog(d);
      return;
    }
    if (!d.blocked) patchDialog({ note: { text: T.UNSAVED, discard: true }, noteAt: Date.now() });
  }
  function cancelDialog() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    if (d.type === 'candidate' && d.mode === 'edit') {
      leaveEdit(d);
      return;
    }
    closeDialog(d);
  }
  // A dialog save refused: the note under the buttons (G11).
  function dialogProblem(action, status, name) {
    if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
      return;
    }
    if (status === 'not_allowed') onRefreshProfile();
    const msg = T.statusMessage(action, status, { name, phone: isPhone });
    const blocked = BLOCKING.includes(status);
    patchDialog({ saving: false, blocked, note: msg ? { text: msg.text, discard: blocked } : { text: T.DIALOG_FAILED } });
    if (status === 'stale' || status === 'not_found' || status === 'withdrawn') reload();
  }

  // ----- The detail view, Edit details, New candidate -----
  async function loadDetailInto(rowId) {
    const [detail, history] = await Promise.all([loadCandidateDetail(rowId), loadCandidateHistory(rowId)]);
    if (detail.status === 'no_access' || history.status === 'no_access') {
      onNoAccess();
      return;
    }
    setDialog((current) => {
      if (!current || current.rowId !== rowId || current.type !== 'candidate') return current;
      if (detail.status !== 'ok') return { ...current, loadFailed: true };
      const loaded = { ...current, loadFailed: false, detail, history: history.status === 'ok' ? history.rows : [] };
      // Opened from ⋯ → Edit details: the box turns into the form as soon as the detail arrives
      // (focusFirst: focus moves to First name, as the box's Close button goes away).
      if (current.pendingEdit) return { ...loaded, ...editPatch(detail.candidate), pendingEdit: false, focusFirst: true };
      return loaded;
    });
  }
  function openView(row, opener) {
    openDialog({ type: 'candidate', mode: 'view', rowId: row.id, detail: null, history: null, historyAll: false, opener });
    loadDetailInto(row.id);
  }
  // The form's starting values and the version it saves with, from a detail read.
  function editPatch(c) {
    const values = {
      firstName: c.firstName,
      lastName: c.lastName,
      dateOfBirth: c.dateOfBirth ?? '',
      locationCode: c.locationCode,
      email: c.emailForResults ?? '',
      dan: c.dan,
      starsFrom: c.starsFrom,
    };
    // The version of the detail on screen, not the roster's newest (the 15-second refresh) — so
    // another person's change made meanwhile answers 'stale' instead of being overwritten.
    return { mode: 'edit', values, initial: values, source: c.source, snap: takeSnapshot(c), focusDan: false, focusSig: false, touched: {}, triedSave: false, note: null, blocked: false };
  }
  // The summary's own "Edit details" button: the summary turns into the form.
  function startEdit() {
    const d = dialogRef.current;
    if (!d?.detail) return;
    patchDialog(editPatch(d.detail.candidate));
  }
  // ⋯ → Edit details (DR G1 choice 2 = A, like Color Belt's openEdit): the box opens at once, the
  // way a row click does (loading lines while the detail is read — the form needs the date of birth,
  // email and the version), then turns into the form when the detail arrives (`pendingEdit`, see
  // loadDetailInto). A failed read shows the box's own "Couldn't load" line with Retry. Cancel / Esc
  // close it — it never drops back to the summary (`editOnly`); focus returns to the ⋯ button.
  function openEdit(row, opener) {
    openDialog({ type: 'candidate', mode: 'view', rowId: row.id, detail: null, history: null, historyAll: false, opener, editOnly: true, pendingEdit: true });
    loadDetailInto(row.id);
  }
  function backToView() {
    patchDialog({ mode: 'view', note: null, blocked: false, saving: false, focusDan: false });
  }
  // Leaving the form without saving: back to the summary, or closed when it was opened from ⋯.
  function leaveEdit(d) {
    if (d.editOnly) closeDialog(d);
    else backToView();
  }
  function openNew(opener) {
    const values = { firstName: '', lastName: '', dateOfBirth: '', locationCode: oneSchool ? schoolCode : null, email: '', dan: danSel, starsFrom: null, payingBy: 'cash' }; // Cash chosen to start, as drawn (G gap mockups, New candidate)
    openDialog({ type: 'candidate', mode: 'new', rowId: null, values, initial: values, opener });
  }
  async function saveCandidate(clearGradeCount = null) {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const check = checkCandidateForm(d, copy, today, hidden);
    if (!check.canSave && clearGradeCount === null) {
      patchDialog({ triedSave: true });
      return;
    }
    if (check.sameAsSaved && clearGradeCount === null) {
      leaveEdit(d);
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const p = check.payload;
    const name = `${p.firstName} ${p.lastName}`;
    if (d.mode === 'new') {
      const result = await addCandidate({ eventId, firstName: p.firstName, lastName: p.lastName, dateOfBirth: p.dateOfBirth, email: p.email, locationCode: p.locationCode, dan: p.dan, starsFrom: p.starsFrom, payingBy: p.payingBy });
      endWrite(result.status);
      if (result.status !== 'ok') {
        dialogProblem('add', result.status, name);
        return;
      }
      setDialog(null);
      if (p.dan !== danSel) setDan(p.dan);
      setFilter(null);
      const reloaded = reload();
      // Undo = delete the candidate just added — admins only (staff can't delete or withdraw, v0.110).
      const newId = result.id;
      showToast(T.candidateAddedToast(name), {
        icon: false,
        action: isAdmin ? { label: T.UNDO, onAction: () => runUndo(() => deleteCandidate({ candidateId: newId, expectedVersion: result.version, expectedPaymentIds: [] }), null) } : undefined,
      });
      focusLater(() => rowEl(newId), addEl, reloaded);
      return;
    }
    // Edit details
    const row = rowOf(d.rowId);
    const result = await updateCandidate(
      writeArgs('edit', d.snap, { ...p, dateOfBirth: hidden ? d.initial.dateOfBirth || null : p.dateOfBirth, clearGradeCount }),
    );
    endWrite(result.status === 'grades_exist' ? 'ok' : result.status);
    if (result.status === 'grades_exist') {
      // The Dan-change confirmation (G2, v0.164), with the number the database counted.
      patchDialog({ saving: false });
      setOverlay({ type: 'danConfirm', gradeCount: result.gradeCount, name, oldDan: row?.danLabel ?? '', newDan: T.danLabelOf(p.dan) });
      return;
    }
    setOverlay(null);
    if (result.status !== 'ok') {
      dialogProblem('edit', result.status, name);
      return;
    }
    const previous = d.initial;
    setDialog(null);
    if (p.dan !== danSel) setDan(p.dan);
    const reloaded = reload();
    const undo = result.clearedGradeCount > 0 ? undefined : {
      label: T.UNDO,
      onAction: () =>
        runUndo(
          () => updateCandidate({ candidateId: d.rowId, expectedVersion: result.version, firstName: previous.firstName, lastName: previous.lastName, dateOfBirth: previous.dateOfBirth || null, email: previous.email, locationCode: previous.locationCode, dan: previous.dan, starsFrom: previous.starsFrom, clearGradeCount: null }),
          { find: () => rowEl(d.rowId) },
        ),
    };
    showToast(T.TOAST_CHANGES_SAVED, { icon: false, action: undo });
    focusLater(() => rowEl(d.rowId), null, reloaded);
  }
  // "Keep 1st Dan" on the Dan-change confirmation (G2): the form goes back to the SAVED Dan and stars
  // (the other edits stay), and focus lands on Current Dan.
  function keepSavedDan() {
    setOverlay(null);
    setDialog((current) =>
      current && current.type === 'candidate'
        ? { ...current, values: { ...current.values, dan: current.initial.dan, starsFrom: current.initial.starsFrom }, focusDan: true, focusFirst: false, saving: false }
        : current,
    );
  }
  async function openSignature() {
    const d = dialogRef.current;
    if (!d?.rowId) return;
    setOverlay({ type: 'signature', signature: null, failed: false });
    const result = await viewSignature(d.rowId);
    if (result.status === 'no_access') {
      onNoAccess();
      return;
    }
    setOverlay((current) => (current?.type === 'signature' ? (result.status === 'ok' ? { ...current, signature: result } : { ...current, failed: true }) : current));
  }

  // ----- Undo (a toast's action) -----
  async function runUndo(call, focus, action = 'undo_payment', row = null, doneText = T.TOAST_UNDONE) {
    if (!beginWrite()) return;
    const result = await call();
    endWrite(result.status);
    if (result.status === 'ok') {
      setBanner((current) => (current?.kind === 'undo' ? null : current));
      showToast(doneText, { icon: false });
      const reloaded = reload();
      if (focus) focusLater(focus.find, addEl, reloaded);
      return;
    }
    if (result.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (result.status === 'error') {
      // Private details hidden meanwhile: no money Retry (see hiddenNowRef) — just show the latest.
      if (hiddenNowRef.current) {
        reload();
        return;
      }
      setBanner({ kind: 'undo', text: T.UNDO_FAILED, retry: () => runUndo(call, focus, action, row, doneText) });
      return;
    }
    const msg = T.statusMessage(action, result.status, { name: row ? T.candidateName(row) : '' });
    // (While hidden, the general "changed" line instead of one that names a payment.)
    setBanner({ text: hiddenNowRef.current ? T.ROW_STALE : (msg?.text ?? T.ROW_STALE) });
    reload();
  }

  // ----- Record payment / Edit payment / Refund / Change how they'll pay -----
  const regDay = (row) => T.stampDay(row.registeredAt);
  function openRecord(row, opener) {
    const values = { method: row.payingBy ?? 'cash', amount: centsToInputText(row.expectedFeeCents), paidOn: today };
    openDialog({ type: 'record', rowId: row.id, snap: takeSnapshot(row), values, initial: values, minDate: regDay(row), opener });
  }
  function openEditPayment(row, opener) {
    const values = { method: row.paidMethod ?? 'cash', amount: centsToInputText(row.paidCents), paidOn: row.paidOn ?? today };
    // `old`: the payment as the dialog opened on it, for the toast's Undo (DR G2).
    const old = { method: row.paidMethod, amountCents: row.paidCents, paidOn: row.paidOn };
    openDialog({ type: 'editPayment', rowId: row.id, snap: takeSnapshot(row), values, initial: values, old, minDate: regDay(row), opener });
  }
  function openRefund(row, opener) {
    const values = { method: 'cash', amount: centsToInputText(row.overpaidCents), paidOn: today };
    openDialog({ type: 'refund', rowId: row.id, snap: takeSnapshot(row), values, initial: values, minDate: regDay(row), overpaidCents: row.overpaidCents, fieldNote: null, opener });
  }
  function openPayingBy(row, opener) {
    const values = { payingBy: row.payingBy ?? 'cash' };
    openDialog({ type: 'payingBy', rowId: row.id, snap: takeSnapshot(row), values, initial: values, opener });
  }
  async function savePayment() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const row = rowOf(d.rowId);
    if (!row) return;
    const name = T.candidateName(row);
    if (d.type === 'payingBy') {
      if (d.values.payingBy === d.initial.payingBy) {
        closeDialog(d);
        return;
      }
      if (!beginWrite()) return;
      patchDialog({ saving: true, note: null });
      const result = await changePayingBy(writeArgs('payingBy', d.snap, d.values));
      endWrite(result.status);
      if (result.status !== 'ok') {
        dialogProblem('paying_by', result.status, name);
        return;
      }
      closeDialog(d);
      reload();
      // Undo for 5 seconds (DR G3, rule 1.4): the old choice back, with the version this save returned
      // — but not once Hide private details went on during the save (how a family pays is a payment
      // detail; the same rule as Record payment and Edit payment, see hiddenNowRef).
      const oldPayingBy = d.initial.payingBy;
      showToast(T.TOAST_CHANGES_SAVED, {
        icon: false,
        action: hiddenNowRef.current
          ? undefined
          : {
              label: T.UNDO,
              onAction: () =>
                runUndo(() => changePayingBy({ candidateId: row.id, expectedVersion: result.version, payingBy: oldPayingBy }), { find: () => rowEl(row.id) }, 'undo_paying_by', row),
            },
      });
      return;
    }
    const check = checkRecordPayment(d, today, d.type === 'refund' ? d.overpaidCents : null);
    if (!check.canSave) {
      patchDialog({ triedSave: true });
      return;
    }
    if (d.type === 'editPayment' && check.sameAsSaved) {
      closeDialog(d);
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const p = check.payload;
    if (d.type === 'record') {
      const result = await recordPayment(writeArgs('record', d.snap, p));
      endWrite(result.status);
      if (result.status !== 'ok') {
        dialogProblem('record_payment', result.status, name);
        return;
      }
      closeDialog(d);
      const reloaded = reload();
      const paymentId = result.paymentId;
      // Staff can undo their own payment from the toast within the database's 10 seconds (v0.110).
      // (Switched on meanwhile: no money toast - see hiddenNowRef.)
      if (!hiddenNowRef.current) {
        showToast(T.TOAST_PAYMENT_RECORDED, {
          icon: false,
          action: { label: T.UNDO, onAction: () => runUndo(() => undoPayment({ paymentId }), { find: () => rowEl(row.id) }, 'undo_payment', row) },
        });
      }
      focusLater(() => rowEl(row.id), null, reloaded);
      return;
    }
    if (d.type === 'editPayment') {
      const result = await editPayment(writeArgs('editPayment', d.snap, p));
      endWrite(result.status);
      if (result.status !== 'ok') {
        dialogProblem('edit_payment', result.status, name);
        return;
      }
      closeDialog(d);
      reload();
      if (hiddenNowRef.current) return; // switched on meanwhile: no money toast
      // "Payment changed" + Undo (DR G2, v0.517; Black Belt's useCandidateActions does the same):
      // Undo saves the OLD method, amount and date as one more edit, on the payment id this edit
      // returned (an edit replaces the payment with a new one, so that id plays the part of "the
      // version": if it was undone or edited meanwhile, the database answers 'stale'). Admins only,
      // as Edit payment is.
      const newPaymentId = result.paymentId;
      const old = d.old;
      showToast(T.TOAST_PAYMENT_CHANGED, {
        icon: false,
        action: {
          label: T.UNDO,
          onAction: () =>
            runUndo(() => editPayment({ paymentId: newPaymentId, method: old.method, amountCents: old.amountCents, paidOn: old.paidOn }), { find: () => rowEl(row.id) }, 'undo_edit_payment', row),
        },
      });
      return;
    }
    // Record refund
    const result = await recordRefund(writeArgs('refund', d.snap, p));
    endWrite(result.status);
    if (result.status === 'refund_too_large') {
      const msg = T.statusMessage('refund', 'refund_too_large', { overpaidCents: result.overpaidCents ?? 0 });
      if (msg.field) patchDialog({ saving: false, fieldNote: msg.text, overpaidCents: result.overpaidCents });
      else patchDialog({ saving: false, blocked: true, note: { text: msg.text, discard: true } });
      reload();
      return;
    }
    if (result.status !== 'ok') {
      dialogProblem('refund', result.status, name);
      return;
    }
    closeDialog(d);
    const reloaded = reload();
    const refundId = result.paymentId;
    if (!hiddenNowRef.current) { // switched on meanwhile: no money toast
      showToast(T.TOAST_REFUND_RECORDED, {
        icon: false,
        action: { label: T.UNDO, onAction: () => runUndo(() => undoPayment({ paymentId: refundId }), { find: () => rowEl(row.id) }, 'undo_refund', row) },
      });
    }
    focusLater(() => rowEl(row.id), null, reloaded);
  }

  // Undo payment (admin, after the toast — asks first, G16) and Undo refund (PROPOSAL: asks too).
  function openUndoPayment(row, opener) {
    openDialog({ type: 'undoPayment', rowId: row.id, snap: takeSnapshot(row), opener, failed: false });
  }
  async function openUndoRefund(row, opener) {
    if (!beginWrite()) return;
    const detail = await loadCandidateDetail(row.id);
    endWrite(detail.status);
    if (detail.status !== 'ok') {
      // A failed READ (nothing was saved) — the same as startDelete: "Couldn't load this candidate"
      // with Retry, no "Not saved" mark; gone meanwhile (not_found): the list just reloads.
      if (detail.status === 'no_access') onNoAccess();
      else if (detail.status === 'not_found') reload();
      else setBanner({ kind: 'load', text: T.LOAD_DETAIL_FAILED, retry: () => openUndoRefund(row, opener) });
      return;
    }
    setBanner((current) => (current?.kind === 'load' ? null : current));
    const refund = [...detail.payments].reverse().find((p) => p.kind === 'refund' && !p.reversed);
    if (!refund) {
      reload();
      return;
    }
    openDialog({ type: 'undoRefund', rowId: row.id, refund, opener, failed: false });
  }
  async function confirmUndo() {
    const d = dialogRef.current;
    if (!d || d.saving || !beginWrite()) return;
    const row = rowOf(d.rowId);
    patchDialog({ saving: true, failed: false });
    const result = await undoPayment(d.type === 'undoRefund' ? { paymentId: d.refund.id } : writeArgs('undoPayment', d.snap));
    endWrite(result.status);
    if (result.status === 'ok') {
      closeDialog(d);
      reload();
      if (hiddenNowRef.current) return; // switched on meanwhile: no money toast
      showToast(d.type === 'undoRefund' ? T.TOAST_REFUND_UNDONE : T.paymentUndoneToast(row ? T.candidateName(row) : ''), { icon: false });
      return;
    }
    if (result.status === 'error') {
      patchDialog({ saving: false, failed: true });
      return;
    }
    closeDialog(d);
    rowProblem(d.type === 'undoRefund' ? 'undo_refund' : 'admin_undo_payment', result, row, null);
  }

  // ----- Private testing (Private screens 2 and 4) -----
  function openPrivate(row, opener) {
    const values = { day: row.privateOn ?? '', time: row.privateTime ?? null };
    openDialog({ type: 'private', mode: row.privateOn ? 'change' : 'set', rowId: row.id, snap: takeSnapshot(row), values, initial: values, opener });
  }
  async function savePrivate() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const check = checkPrivate(d, today);
    if (!check.canSave) {
      patchDialog({ triedSave: true });
      return;
    }
    if (check.sameAsSaved) {
      closeDialog(d);
      return;
    }
    const row = rowOf(d.rowId);
    if (!row || !beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const result = await setPrivate(writeArgs('private', d.snap, check.payload));
    endWrite(result.status);
    if (result.status !== 'ok') {
      dialogProblem('private', result.status, T.candidateName(row));
      return;
    }
    closeDialog(d);
    reload();
    showToast(T.TOAST_PRIVATE_SET, { icon: false });
  }
  async function backToTestingDay(row) {
    if (!beginWrite()) return;
    const old = { day: row.privateOn, time: row.privateTime };
    const result = await clearPrivate({ candidateId: row.id, expectedVersion: row.version });
    endWrite(result.status);
    if (result.status !== 'ok') {
      rowProblem('private', result, row, () => backToTestingDay(row));
      return;
    }
    rowOk(row);
    reload();
    showToast(T.movedBackToast(T.candidateName(row), hiddenNowRef.current ? null : result.expectedFeeCents), {
      icon: false,
      action: {
        label: T.UNDO,
        onAction: () => runUndo(() => setPrivate({ candidateId: row.id, expectedVersion: result.version, privateOn: old.day, privateTime: old.time }), { find: () => rowEl(row.id) }, 'private', row),
      },
    });
  }

  // ----- Withdraw / Restore / Delete permanently (v0.113, G13) -----
  async function withdraw(row) {
    if (!beginWrite()) return;
    const result = await withdrawCandidate({ candidateId: row.id, expectedVersion: row.version });
    endWrite(result.status);
    if (result.status !== 'ok') {
      rowProblem('withdraw', result, row, () => withdraw(row));
      return;
    }
    rowOk(row);
    setRemovedOpen(true); // the Removed group opens, so the row can be seen (G13)
    reload();
    showToast(T.withdrawnToast(T.candidateName(row)), {
      icon: false,
      action: { label: T.UNDO, onAction: () => runUndo(() => restoreCandidate({ candidateId: row.id, expectedVersion: result.version }), { find: () => rowEl(row.id) }, 'restore', row) },
    });
  }
  async function restore(row) {
    if (!beginWrite()) return;
    const result = await restoreCandidate({ candidateId: row.id, expectedVersion: row.version });
    endWrite(result.status);
    if (result.status !== 'ok') {
      rowProblem('restore', result, row, () => restore(row));
      return;
    }
    rowOk(row);
    const reloaded = reload();
    // Undo for 5 seconds (DR G3, rule 1.4) = withdraw again, with the version this restore returned -
    // except for a "Duplicate copy" (G3 choice = A): withdrawing again would tag it "Removed" and lose
    // the reason, so no Undo; the compare box (Review, then Keep this one) puts it back properly.
    const wasDuplicateCopy = row.withdrawnReason === 'duplicate_copy';
    showToast(T.restoredToast(T.candidateName(row)), {
      icon: false,
      action: wasDuplicateCopy
        ? undefined
        : { label: T.UNDO, onAction: () => runUndo(() => withdrawCandidate({ candidateId: row.id, expectedVersion: result.version }), { find: () => rowEl(row.id) }, 'withdraw', row) },
    });
    focusLater(() => rowEl(row.id), null, reloaded);
  }
  async function startDelete(row, opener) {
    if (!beginWrite()) return;
    const detail = await loadCandidateDetail(row.id);
    endWrite(detail.status);
    if (detail.status !== 'ok') {
      // A failed READ (nothing was saved): "Couldn't load this candidate" with Retry — no "Not
      // saved" mark. Gone meanwhile (not_found): the list just reloads.
      if (detail.status === 'no_access') onNoAccess();
      else if (detail.status === 'not_found') reload();
      else setBanner({ kind: 'load', text: T.LOAD_DETAIL_FAILED, retry: () => startDelete(row, opener) });
      return;
    }
    setBanner((current) => (current?.kind === 'load' ? null : current));
    const live = detail.payments.filter((p) => p.kind === 'payment' && !p.reversed);
    const payment = live.length ? live[live.length - 1] : null;
    openDialog({
      type: 'delete',
      rowId: row.id,
      name: T.candidateName(row),
      // The words are built when the box is drawn, with the CURRENT Hide private details switch —
      // so turning it on while the box is open hides the payment amount at once.
      payment,
      gradeCount: detail.result?.gradedCount ?? 0,
      args: { candidateId: row.id, expectedVersion: detail.candidate.version, expectedPaymentIds: detail.payments.map((p) => p.id) },
      opener,
      failed: false,
    });
  }
  async function confirmDelete() {
    const d = dialogRef.current;
    if (!d || d.saving || !beginWrite()) return;
    patchDialog({ saving: true, failed: false });
    const result = await deleteCandidate(d.args);
    endWrite(result.status);
    if (result.status === 'ok') {
      setDialog(null);
      const reloaded = reload();
      showToast(T.deletedToast(d.name), { icon: false }); // permanent: no Undo
      focusLater(() => addEl(), null, reloaded);
      return;
    }
    if (result.status === 'error') {
      patchDialog({ saving: false, failed: true });
      return;
    }
    setDialog(null);
    rowProblem('delete', result, rowOf(d.rowId), null);
  }

  // ----- Possible duplicates (v0.114) -----
  // opener: what focus returns to when the box closes (the ⋯ button when opened from the menu);
  // left out, focus returns to the row.
  async function openCompare(row, opener = null) {
    const pair = pairs.find((p) => p.a.id === row.id || p.b.id === row.id);
    if (!pair) return;
    openDialog({ type: 'compare', firstId: pair.a.id, secondId: pair.b.id, details: null, loadFailed: false, rowId: row.id, opener });
    loadCompare(pair.a.id, pair.b.id);
  }
  async function loadCompare(firstId, secondId) {
    const [d1, d2] = await Promise.all([loadCandidateDetail(firstId), loadCandidateDetail(secondId)]);
    if (d1.status === 'no_access' || d2.status === 'no_access') {
      onNoAccess();
      return;
    }
    setDialog((current) => {
      if (!current || current.type !== 'compare') return current;
      if (d1.status !== 'ok' || d2.status !== 'ok') return { ...current, loadFailed: true };
      return { ...current, details: [d1, d2], loadFailed: false };
    });
  }
  // The versions the compare dialog SHOWED (its two detail reads), not the roster's newest — a change
  // made meanwhile answers 'stale' (the same rule as dialogSnapshot.js).
  const shownVersion = (d, id) => d.details?.find((x) => x.candidate.id === id)?.candidate.version ?? null;
  async function keepOne(keep, other) {
    const d = dialogRef.current;
    if (!d || d.saving || !d.details || !beginWrite()) return;
    patchDialog({ saving: true, failed: false });
    const result = await resolveDuplicate({ keepId: keep.id, keepVersion: shownVersion(d, keep.id), otherId: other.id, otherVersion: shownVersion(d, other.id), keepBoth: false });
    endWrite(result.status);
    if (result.status === 'ok') {
      closeDialog(d);
      setRemovedOpen(true);
      reload();
      showToast(T.duplicateRemovedToast(T.candidateName(keep)), {
        icon: false,
        action: { label: T.UNDO, onAction: () => runUndo(() => restoreCandidate({ candidateId: other.id, expectedVersion: result.otherVersion }), null, 'undo_duplicate', other) },
      });
      return;
    }
    if (result.status === 'error') {
      patchDialog({ saving: false, failed: true });
      return;
    }
    closeDialog(d);
    rowProblem('duplicate', result, keep, null);
  }
  async function keepBoth() {
    const d = dialogRef.current;
    const first = rowOf(d?.firstId);
    const second = rowOf(d?.secondId);
    if (!d || d.saving || !first || !second || !d.details || !beginWrite()) return;
    patchDialog({ saving: true, failed: false });
    const result = await resolveDuplicate({ keepId: first.id, keepVersion: shownVersion(d, first.id), otherId: second.id, otherVersion: shownVersion(d, second.id), keepBoth: true });
    endWrite(result.status);
    if (result.status === 'ok') {
      closeDialog(d);
      reload();
      showToast(T.TOAST_KEPT_BOTH, { icon: false });
      return;
    }
    if (result.status === 'error') {
      patchDialog({ saving: false, failed: true });
      return;
    }
    closeDialog(d);
    rowProblem('duplicate', result, first, null);
  }

  // ----- Make-up from an earlier testing (screen 7, G10) -----
  async function openMakeups(opener) {
    openDialog({ type: 'makeup', rows: null, failed: false, search: '', added: {}, note: null, opener });
    loadMakeups();
  }
  async function loadMakeups() {
    const result = await loadMakeupList(eventId);
    if (result.status === 'no_access') {
      onNoAccess();
      return;
    }
    setDialog((current) => (current?.type === 'makeup' ? (result.status === 'ok' ? { ...current, rows: result.rows, failed: false } : { ...current, failed: true }) : current));
  }
  async function addOneMakeup(row) {
    const d = dialogRef.current;
    if (!d || d.saving || !beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const result = await addMakeup({ eventId, earlierCandidateId: row.candidateId });
    endWrite(result.status);
    const name = `${row.firstName} ${row.lastName}`;
    if (result.status === 'ok') {
      setDialog((current) => (current ? { ...current, saving: false, added: { ...current.added, [row.candidateId]: 'already_added' } } : current));
      if (row.dan !== danSel) setDan(row.dan);
      reload();
      showToast(T.makeupAddedToast(name), { icon: false });
      return;
    }
    if (result.status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
      return;
    }
    const msg = T.statusMessage('add_makeup', result.status, { name });
    if (msg?.row) {
      setDialog((current) => (current ? { ...current, saving: false, added: { ...current.added, [row.candidateId]: msg.row } } : current));
      return;
    }
    patchDialog({ saving: false, note: msg?.text ?? T.DIALOG_FAILED });
    if (result.status === 'stale') loadMakeups();
  }

  // ===== The ⋯ menus =====
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
    if (menu.id === 'add') {
      const newItem = hidden ? (
        <span className="ev-menu-two st-menu-two">
          <span>{T.NEW_CANDIDATE}</span>
          <span className="ev-menu-reason">{T.NEW_CANDIDATE_HIDDEN}</span>
        </span>
      ) : (
        <span className="ev-menu-two st-menu-two st-menu-desc">
          <span>{T.NEW_CANDIDATE}</span>
          <span className="ev-menu-reason">{T.NEW_CANDIDATE_SUB}</span>
        </span>
      );
      return {
        title: T.ADD_CANDIDATE,
        subtitle: event.name,
        label: T.ADD_CANDIDATE,
        items: [
          { key: 'new', label: newItem, Icon: IconUserPlus, disabled: hidden || busy, onSelect: () => openNew(menu.anchor) },
          {
            key: 'makeup',
            label: (
              <span className="ev-menu-two st-menu-two st-menu-desc">
                <span>{T.MAKEUP_ITEM}</span>
                <span className="ev-menu-reason">{T.MAKEUP_ITEM_SUB}</span>
              </span>
            ),
            Icon: IconRepeat,
            disabled: busy,
            onSelect: () => openMakeups(menu.anchor),
          },
        ],
      };
    }
    const row = candidates.find((c) => c.id === menu.id);
    if (!row) return null;
    const anchor = menu.anchor;
    // Which items, in which order, with the lines between the groups: candidateMenuKeys (DR G1,
    // v0.517) — (1) Edit details · private items · Change how they'll pay · Review possible
    // duplicate, (2) the money items (admins), (3) Withdraw · Delete permanently (admins).
    const keys = candidateMenuKeys(row, {
      isAdmin,
      hidden,
      flagged: pairs.some((p) => p.a.id === row.id || p.b.id === row.id),
      canGradePrivate: Boolean(onGradePrivate),
    });
    if (keys.length === 0) return null;
    // While a refund stands, Edit payment and Undo payment are grayed with the reason under them.
    const refundStands = row.refundedCents > 0;
    const grayed = (text) => (
      <span className="ev-menu-two st-menu-two">
        <span>{text}</span>
        <span className="ev-menu-reason">{T.UNDO_REFUND_FIRST}</span>
      </span>
    );
    // key → the item's words, icon and action. Icons follow the one-icon-per-meaning map (§2.4, 16a).
    const ITEM = {
      // "Edit details" opens the form straight away (DR G1 choice 2 = A); a row click still opens
      // the read-only summary.
      edit: { label: T.EDIT_DETAILS, Icon: IconEdit, onSelect: () => openEdit(row, anchor) },
      setPrivate: { label: T.SET_PRIVATE, Icon: IconCalendar, onSelect: () => openPrivate(row, anchor) },
      changePrivate: { label: T.CHANGE_PRIVATE, Icon: IconEdit, onSelect: () => openPrivate(row, anchor) },
      backToDay: { label: T.backToDay(event.testingDate), Icon: IconArrowBackUp, onSelect: () => backToTestingDay(row) },
      // Phase 5 (H5, proposal 18). ti-school = grade a private testing (§2.4 icon map, this one meaning)
      gradePrivate: { label: T.GRADE_PRIVATE, Icon: IconSchool, onSelect: () => onGradePrivate(row, anchor) },
      // ti-switch-horizontal = change how they'll pay (S9; ti-repeat now means only Make-up)
      payingBy: { label: T.CHANGE_PAYING_BY, Icon: IconSwitchHorizontal, onSelect: () => openPayingBy(row, anchor) },
      // The same compare box the row's tag and the box above the cards open (DR G1 choice 1 = A)
      reviewDuplicate: { label: T.REVIEW_DUPLICATE, Icon: IconAlertTriangle, onSelect: () => openCompare(row, anchor) },
      editPayment: { label: refundStands ? grayed(T.EDIT_PAYMENT) : T.EDIT_PAYMENT, Icon: IconCashEdit, grayed: refundStands, onSelect: () => openEditPayment(row, anchor) },
      undoPayment: { label: refundStands ? grayed(T.UNDO_PAYMENT) : T.UNDO_PAYMENT, Icon: IconArrowBackUp, grayed: refundStands, onSelect: () => openUndoPayment(row, anchor) },
      undoRefund: { label: T.UNDO_REFUND, Icon: IconArrowBackUp, onSelect: () => openUndoRefund(row, anchor) },
      recordRefund: { label: T.RECORD_REFUND, Icon: IconReceiptRefund, onSelect: () => openRefund(row, anchor) },
      withdraw: { label: T.WITHDRAW, Icon: IconUserMinus, onSelect: () => withdraw(row) },
      restore: { label: T.RESTORE, Icon: IconArrowBackUp, onSelect: () => restore(row) },
      delete: { label: T.DELETE_PERMANENTLY, Icon: IconTrash, danger: true, onSelect: () => startDelete(row, anchor) },
    };
    const items = keys.map(({ key, separatorBefore }) => {
      const { grayed: isGrayed, ...item } = ITEM[key];
      return { key, ...item, disabled: busy || Boolean(isGrayed), ...(separatorBefore ? { separatorBefore: true } : {}) };
    });
    const subtitle = row.status === 'withdrawn' ? row.danLabel : `${row.danLabel} · ${T.testingFor(row)}`;
    return { title: T.candidateName(row), subtitle, label: T.moreForCandidate(T.candidateName(row)), items };
  }

  // ===== Keyboard: ↑ ↓ Enter on rows =====
  const nav = useRowArrowNav({
    rowKeys: rowsInView.map((c) => c.id),
    onOpen: (id) => {
      const row = rowOf(id);
      if (row) openView(row, rowEl(id));
    },
  });

  // ===== Drawing =====
  const addButton = (
    <button
      type="button"
      className="btn btn-primary"
      data-star-add-cand
      aria-haspopup="menu"
      aria-expanded={menu?.id === 'add' ? 'true' : 'false'}
      onClick={(clickEvent) => {
        const anchor = clickEvent.currentTarget;
        setMenu((current) => (current?.id === 'add' ? null : { id: 'add', anchor }));
      }}
    >
      {/* ti-plus = add new */}
      <IconPlus size={16} aria-hidden="true" />
      {T.ADD_CANDIDATE}
    </button>
  );

  const ctx = {
    layout,
    nav,
    hidden,
    oneSchool,
    isAdmin,
    busy,
    menuFor: menu?.id ?? null,
    selectedId: dialog && !screenLocked ? (dialog.rowId ?? null) : null,
    notSavedId,
    showStatusCol,
    subjectNames,
    belowPassMark,
    tableLabel: dans.find((d) => d.dan === danSel)?.label ?? '',
    handlers: {
      onOpen: (row) => openView(row, rowEl(row.id)),
      onMore: openMenu,
      onReview: (row) => openCompare(row),
      onRecordPayment: openRecord,
    },
  };

  const card = (key, label, Icon, value, note = null) => {
    const selected = key && filter === key;
    const content = (
      <>
        <span className="ev-card-label">
          <Icon size={14} aria-hidden="true" />
          {label}
        </span>
        <span className="ev-card-value">{value}</span>
        {/* a note may be several lines (the Candidates card's school counts, stacked as drawn) */}
        {(Array.isArray(note) ? note : note ? [note] : []).map((line) => (
          <span key={line} className="ev-card-note">
            {line}
          </span>
        ))}
      </>
    );
    return (
      <button
        key={label}
        type="button"
        className={`ev-card ev-card--button${selected ? ' is-selected st-card-selected' : ''}`}
        aria-pressed={key ? (selected ? 'true' : 'false') : undefined}
        onClick={() => setFilter(!key || selected ? null : key)}
      >
        {content}
      </button>
    );
  };
  const schoolNote = oneSchool ? T.schoolName(schoolCode) : cards.bySchool.map((s) => `${T.schoolName(s.code)} ${s.n}`); // one line each (screen 1)
  const hasAny = candidates.some(inSchool);
  const danLabelId = `${panelId}-dan`;
  let emptyText = T.NO_CANDIDATES_DAN;
  if (filter) emptyText = T.NO_MATCHES;

  // ----- The open dialog -----
  let dialogElement = null;
  if (dialog && !screenLocked) {
    const row = dialog.rowId ? rowOf(dialog.rowId) : null;
    const common = { state: dialog, isPhone, onChange: changeValues, onTouch: touch, onCancel: cancelDialog, onRequestClose: requestClose };
    if (dialog.type === 'candidate' && (row || dialog.mode === 'new')) {
      dialogElement = (
        <CandidateDialog
          {...common}
          row={row}
          event={event}
          copy={copy}
          today={today}
          hidden={hidden}
          isAdmin={isAdmin}
          subjectNames={subjectNames}
          onSave={() => saveCandidate(null)}
          onEdit={startEdit}
          onViewSignature={openSignature}
          onShowAllHistory={() => patchDialog({ historyAll: true })}
          onRetryDetail={() => {
            patchDialog({ loadFailed: false });
            loadDetailInto(dialog.rowId);
          }}
        />
      );
    } else if (dialog.type === 'record' && row) {
      dialogElement = <RecordPaymentDialog {...common} candidate={row} today={today} onSave={savePayment} />;
    } else if (dialog.type === 'editPayment' && row) {
      dialogElement = <EditPaymentDialog {...common} candidate={row} today={today} onSave={savePayment} />;
    } else if (dialog.type === 'refund' && row) {
      dialogElement = <RefundDialog {...common} candidate={row} today={today} onSave={savePayment} />;
    } else if (dialog.type === 'payingBy' && row) {
      dialogElement = <PayingByDialog {...common} candidate={row} onSave={savePayment} />;
    } else if (dialog.type === 'private' && row) {
      dialogElement = <PrivateDialog {...common} candidate={row} testingDate={event.testingDate} today={today} hidden={hidden} onSave={savePrivate} />;
    } else if (dialog.type === 'undoPayment' && row) {
      dialogElement = (
        <ConfirmBox
          title={T.undoPaymentTitle(T.candidateName(row))}
          body={T.undoPaymentBody(row.paidCents, row.paidMethod, row.paidOn)}
          keepLabel={T.KEEP_PAYMENT}
          goLabel={T.UNDO_PAYMENT}
          tone="undo"
          busy={dialog.saving}
          failedText={dialog.failed ? T.DIALOG_FAILED : null}
          onGo={confirmUndo}
          onCancel={cancelDialog}
        />
      );
    } else if (dialog.type === 'undoRefund' && row) {
      dialogElement = (
        <ConfirmBox
          title={T.undoRefundTitle(T.candidateName(row))}
          body={T.undoRefundBody(Math.abs(dialog.refund.amountCents), dialog.refund.method, dialog.refund.paidOn)}
          keepLabel={T.KEEP_REFUND}
          goLabel={T.UNDO_REFUND}
          tone="undo"
          busy={dialog.saving}
          failedText={dialog.failed ? T.DIALOG_FAILED : null}
          onGo={confirmUndo}
          onCancel={cancelDialog}
        />
      );
    } else if (dialog.type === 'delete') {
      dialogElement = (
        <ConfirmBox
          title={T.deleteTitle(dialog.name)}
          body={T.deleteBody({ eventName: event.name, payment: dialog.payment, gradeCount: dialog.gradeCount, hidden })}
          hint={T.DELETE_STUDENT_HINT}
          keepLabel={T.KEEP_CANDIDATE}
          goLabel={T.DELETE_PERMANENTLY}
          tone="danger"
          busy={dialog.saving}
          failedText={dialog.failed ? T.DIALOG_FAILED : null}
          onGo={confirmDelete}
          onCancel={cancelDialog}
        />
      );
    } else if (dialog.type === 'compare') {
      const first = rowOf(dialog.firstId);
      const second = rowOf(dialog.secondId);
      if (first && second) {
        dialogElement = (
          <StarCompareDialog
            first={first}
            second={second}
            details={dialog.details}
            loadFailed={dialog.loadFailed}
            hidden={hidden}
            isPhone={isPhone}
            saving={dialog.saving}
            failedText={dialog.failed ? T.DIALOG_FAILED : null}
            onKeep={keepOne}
            onKeepBoth={keepBoth}
            onRetry={() => {
              patchDialog({ loadFailed: false });
              loadCompare(first.id, second.id);
            }}
            onClose={() => closeDialog(dialog)}
          />
        );
      }
    } else if (dialog.type === 'makeup') {
      dialogElement = (
        <MakeupPickerDialog
          state={dialog}
          eventName={event.name}
          passMark={passFor(danSel)}
          isPhone={isPhone}
          onSearch={(search) => patchDialog({ search })}
          onAdd={addOneMakeup}
          onRetry={() => {
            patchDialog({ failed: false });
            loadMakeups();
          }}
          onClose={() => closeDialog(dialog)}
        />
      );
    }
  }
  let overlayElement = null;
  if (overlay && dialog && !screenLocked) {
    if (overlay.type === 'danConfirm') {
      overlayElement = (
        <ConfirmBox
          title={T.changeDanTitle(overlay.name, overlay.newDan)}
          body={T.changeDanBody(overlay.gradeCount, overlay.oldDan, overlay.newDan)}
          keepLabel={T.keepDanButton(overlay.oldDan)}
          goLabel={T.clearGradesButton(overlay.gradeCount)}
          tone="dan"
          busy={dialog.saving}
          onGo={() => saveCandidate(overlay.gradeCount)}
          onCancel={keepSavedDan}
        />
      );
    } else if (overlay.type === 'signature') {
      const row = rowOf(dialog.rowId);
      overlayElement = (
        <SignatureDialog
          state={overlay}
          name={row ? T.candidateName(row) : ''}
          eventName={event.name}
          isPhone={isPhone}
          onClose={() => {
            setOverlay(null);
            patchDialog({ focusSig: true }); // the detail comes back with focus on "View signature"
          }}
        />
      );
    }
  }

  const content = menu && !screenLocked ? menuContent() : null;

  return (
    <>
      {renderHeader(addButton)}
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel st-cand-panel">
        {banner && (
          <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy} onDismiss={() => setBanner(null)} />
        )}
        {pairs.length > 0 && (
          <div className="ev-dupbox" role="status">
            <IconAlertTriangle size={16} aria-hidden="true" className="ev-dupbox-icon" />
            <div className="ev-dupbox-lines">
              {pairs.map((pair) => (
                <div key={pair.a.id} className="ev-dupbox-line">
                  <span>
                    <strong>{T.dupCount(1)}</strong> · {T.dupLine(T.candidateName(pair.a), pair.a.danLabel)}
                  </span>
                  <button type="button" className="btn btn-sm ev-dupbox-review" onClick={() => openCompare(pair.a)}>
                    {T.REVIEW}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {hasAny && (
          <div className={`ev-cards st-cards${hidden ? ' is-one' : ''}`}>
            {card(null, T.CARD_CANDIDATES, IconUsers, cards.candidates, schoolNote)}
            {!hidden && card('paid', T.CARD_PAID, IconCheck, cards.paid)}
            {!hidden && card('notPaid', T.CARD_NOT_PAID, IconCircleX, cards.notPaid) /* ti-circle-x = not paid (S9, 16a) */}
            {!hidden && card('payments', T.CARD_PAYMENTS, IconSum, T.dollars(cards.payments)) /* ti-sum = a money total (v0.303) */}
          </div>
        )}
        {filter && (
          <p className="ev-filter-line">
            {T.FILTER_LINE[filter]} ·{' '}
            <button type="button" className="link-button st-inline-link" onClick={() => setFilter(null)}>
              {T.SHOW_ALL_LINK}
            </button>
          </p>
        )}
        {oneSchool && (
          <p className="ev-filter-line st-school-line">
            {T.oneSchoolLine(LOCATION_NAME[schoolCode] ?? location)} ·{' '}
            <button type="button" className="link-button st-inline-link" onClick={() => onLocationChange('Both')}>
              {T.SHOW_BOTH_SCHOOLS}
            </button>
          </p>
        )}
        <div className="ev-side st-dan-switch">
          <span id={danLabelId} className="visually-hidden">
            {T.DAN_SWITCH_LABEL}
          </span>
          <ChoiceGroup
            labelId={danLabelId}
            value={danSel}
            onChange={setDan}
            options={dans.map((d) => ({
              key: d.dan,
              label: `${d.label} ${danCount(d.dan)}`,
              content: (
                <>
                  {d.label}
                  <span className="ev-side-count">{danCount(d.dan)}</span>
                </>
              ),
            }))}
          />
        </div>
        {!hasAny ? (
          <p className="tempty ev-empty">{T.NO_CANDIDATES}</p>
        ) : (
          <CandidateRows
            rows={shown}
            removedRows={filter ? [] : removedRows}
            removedOpen={removedOpen}
            onToggleRemoved={() => setRemovedOpen(!removedOpen)}
            emptyText={emptyText}
            ctx={ctx}
          />
        )}
      </div>
      {content && <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />}
      {/* The second dialog (Dan confirm, signature) takes the first one's place while it is open,
          rather than stacking on it: the shared Dialog gives each open dialog one browser-history
          step, and two open at once would make closing the top one also close the one under it.
          The first dialog's values live in this tab's state, so it comes back exactly as it was. */}
      {overlayElement ?? dialogElement}
    </>
  );
}
