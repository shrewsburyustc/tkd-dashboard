// EventPage.jsx — one testing event's page: its Students roster with payments.
// Why it exists: approved mockups R1–R8 (Star's Candidates design, Star v0.108–v0.121, with
// Color Belt's answers Q8–Q9) and the later changes (plan answers 6–8): Mark paid replaces the
// Record payment dialog; Add student is the blue button in the page header.
// Address: #testing/event/<id> (App.jsx), so browser Back returns to the Events list.
// (With the Star testing build switch on, the address is #testing/color-belt/event/<id> instead —
// lib/pageAddress.js decides; this page doesn't need to know.)
//
// What's on the page, top to bottom:
//   - "← Color belt testing", the event name, and the summary line
//     ("Fri, Nov 20, 2026 · Worcester school · 14 students · registration open until Nov 13")
//   - header buttons: Add student (blue, N on the PC) and Registration link (outline)
//   - the one tab, Students
//   - the four summary cards (Students, Paid, Not paid, Payments recorded — Star v0.115);
//     Paid / Not paid filter the roster, Students clears the filter
//   - the amber "possible duplicate" box with Review (Star v0.114), when there is one
//   - the class switch (classes in this event, with counts) and the class line (time + gear);
//     classes with the same start and end time are one choice, "Group B + C", with a small
//     heading per class in the list (v0.193 Grading, v0.195 Students)
//   - the roster of the chosen class (RosterRows.jsx), then its Removed group
// Every change goes to the database (src/lib/testing/eventsApi.js) and the page reloads after it.
// Reversible changes get a 5-second Undo toast; Delete permanently asks first (rule 1.4).
// Staff and admins see different ⋯ items (Star v0.110); the database enforces the same rules.
//
// Phase 3 (contract 0010 §4, mockups G1–G8, rulebook v0.180–v0.192) adds a second tab, Grading
// (GradingTab.jsx): address #testing/event/<id>/grading. The header buttons, the page banner and
// the class choice are shared by both tabs. Result taps save by themselves (useGradingSaves.js);
// while a result is "Not saved", leaving the page asks first (the leave guard, §4.9: App.jsx asks
// this page before it navigates away) and closing the browser tab shows the browser's question.
//
// Phase 4 (contract 0014 §5.5, mockup P5, rulebook v0.402–v0.404) adds one thing here: ⋯ → Move to
// private testing (all staff, right after Edit details) for a student without a Pass / Not passed
// on the testing day. The student leaves the event (listed under Removed as "Moved to private
// testing, Tue, Dec 1") and their payment moves with them to the Private testing tab. A moved
// Removed row has no ⋯ for staff; admins get Open private testing and a grayed Restore (with the
// reason) — no Delete permanently. Everything else on this page is phase 3 exactly.
//
// Follows "Hide private details" (v0.506, v0.507 Q2), the same way as Star's Candidates tab: while
// the device switch is on, only the Students card shows (no Paid / Not paid / Payments recorded),
// the roster has no payment columns, tags or Mark paid, the ⋯ menu has no Change how they'll pay /
// Edit payment / Undo payment, and the dialogs name no amount. Turning it on closes an open payment
// dialog, clears the Paid / Not paid filter, closes the ⋯ menu and clears the toast (it may name
// money or carry a payment Undo). Color Belt keeps no date of birth or email, so it is money only.
// The Grading tab's gray "Not paid" tag stays (exception, v0.250).
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowLeft,
  IconArrowRight,
  IconSum,
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
import Dialog from '../../../components/Dialog.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { LOCATION_CODE } from '../../../lib/device.js';
import { usePrivateDetailsHidden } from '../../../lib/privateDetails.js';
import { centsToInputText } from '../../../lib/money.js';
import { loadSchools } from '../../../lib/settings/schoolsApi.js';
import { loadClassesAndRanks } from '../../../lib/testing/api.js';
import { classTimeLabel } from '../../../lib/testing/eventRules.js';
import { moveToPrivate, undoMoveToPrivate } from '../../../lib/testing/privateApi.js';
import { canMoveToPrivate } from '../../../lib/testing/privateRules.js';
import {
  addStudent,
  changePayingBy,
  deleteStudent,
  editPayment,
  loadEvent,
  loadResult,
  markPaid,
  resolveDuplicate,
  restoreStudent,
  undoPayment,
  updateStudent,
  withdrawStudent,
} from '../../../lib/testing/eventsApi.js';
import {
  canChangeResults,
  defaultGradingClassId,
  gradingWindow,
  groupOfClass,
  schoolMinutesNow,
  testingGroups,
} from '../../../lib/testing/gradingRules.js';
import { PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { useRowArrowNav } from '../../../lib/useRowArrowNav.js';
import { useShortcutN } from '../../../lib/useShortcutN.js';
import ChoiceGroup from '../events/ChoiceGroup.jsx';
import ConfirmDeleteDialog from '../events/ConfirmDeleteDialog.jsx';
import { NoIcon } from '../events/EventsTab.jsx';
import { LIVE_REFRESH_MS, useLiveLoad } from '../events/useLiveLoad.js';
import CompareDialog from './CompareDialog.jsx';
import GradingSheet from './GradingSheet.jsx';
import GradingTab, { groupGearTags } from './GradingTab.jsx';
import NoteDialog, { checkNote, isNoteDirty } from './NoteDialog.jsx';
import { EditPaymentDialog, PayingByDialog, checkEditPayment, isEditPaymentDirty, isPayingByDirty } from './PaymentDialogs.jsx';
import MoveToPrivateDialog, { checkMove, isMoveDirty } from './MoveToPrivateDialog.jsx';
import RegistrationLinkDialog from './RegistrationLinkDialog.jsx';
import RosterRows, { hasStatusTag } from './RosterRows.jsx';
import StudentDialog, { checkStudentForm, isStudentFormDirty } from './StudentDialog.jsx';
import { useGradingSaves } from './useGradingSaves.js';
import * as T from '../text.js';

// The class chosen on each event's page, kept while the page is open.
const classByEvent = new Map();
// The Removed group open or closed, per event (open by default, as drawn in R8).
const removedOpenByEvent = new Map();
// Events whose Grading tab already picked "the class on now" on the testing day (v0.184): it
// happens once, after that the person's own class choice is kept.
const gradingClassPicked = new Set();

const BLOCKING_NOTES = ['STALE_DIALOG', 'NOT_ALLOWED', 'FINISHED', 'ALREADY_PAID', 'STUDENT_LOCKED', 'MOVE_HAS_RESULT'];
const TABS = ['students', 'grading'];
// The dialogs that are about money: closed when Hide private details is switched on.
const PAYMENT_DIALOGS = ['paying', 'payment'];

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
  eventTab, // 'students' | 'grading' (from the address, App.jsx)
  onEventTab, // (tab) => void — switches the tab (App.jsx updates the address without a new step)
  onLeaveGuardChange, // (fn | null) => void — App.jsx asks fn before leaving this page (§4.9)
  onOpenPrivate, // phase 4: (privateId) => void — opens a private testing's grading page
}) {
  const live = useLiveLoad({ key: eventId, enabled: !screenLocked, load: loadEvent, refreshMs: LIVE_REFRESH_MS });
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
  const [hidden] = usePrivateDetailsHidden(); // Hide private details (v0.506)

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
  const [printing, setPrinting] = useState(null); // { printedAt, opener } while the grading sheet prints
  // The open tab comes from the address (App.jsx); a local copy only if no App is listening.
  const [localTab, setLocalTab] = useState('students');
  const tab = TABS.includes(eventTab) ? eventTab : localTab;
  const baseId = useId();
  const tabIds = { tab: (key) => `${baseId}-tab-${key}`, panel: (key) => `${baseId}-panel-${key}` };
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
  // The event was deleted elsewhere (found by the 15-second refresh or a tab return): close any
  // open dialog or menu, or they'd stay "open" without being drawn and keep the rest of the
  // dashboard (Back link, side menu) blocked.
  useEffect(() => {
    if (live.status !== 'notFound') return;
    setDialog(null);
    setMenu(null);
  }, [live.status]);
  // The student whose ⋯ menu is open was deleted on another device: close the menu and put
  // focus back on something that still exists.
  const menuRowGone = menu !== null && !roster.some((r) => r.id === menu.id);
  useEffect(() => {
    if (!menuRowGone) return;
    setMenu(null);
    if (!document.activeElement || document.activeElement === document.body) document.querySelector('.ev-back')?.focus();
  }, [menuRowGone]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  // The switch's value RIGHT NOW (updated on every drawing, as Star's hiddenNowRef). A save that
  // was already on its way when the switch turned on reads this when its answer arrives, so its
  // toast or banner follows the current value, not the one from when it started.
  const hiddenNowRef = useRef(hidden);
  hiddenNowRef.current = hidden;
  // A money save's answer that arrives while hidden: the general words only — no amount, no paid
  // status, no Retry that would record money (Mark paid / Undo payment / Edit payment …).
  function hiddenMoneyProblem(status) {
    if (status === 'no_access') onNoAccess();
    else if (status === 'not_allowed') {
      setBanner({ text: T.ROSTER_NOT_ALLOWED });
      onRefreshProfile();
      reloadQuiet();
    } else if (status === 'error') {
      setBanner({ text: T.SAVE_FAILED });
    } else {
      setBanner({ text: T.ROSTER_STALE });
      reloadQuiet();
    }
  }
  // Is this dialog still the open one? (Switching Hide private details on closes payment dialogs;
  // their answer must then not patch or close whatever dialog is open by then.)
  const stillOpen = (d) => dialogRef.current !== null && dialogRef.current.key === d.key;

  // Hide private details switched on: no payment dialog, payment filter, menu or toast may stay
  // (as Star's Candidates tab, G4).
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
    setFilter(null);
    setMenu(null);
    // A toast may name money ("marked paid · $65 cash") or carry a payment Undo: it goes too.
    clearToast();
    // So does every banner: a failed Mark paid / Undo payment keeps a Retry that records money,
    // and "already marked paid" names paid status. The row's Not saved mark goes with it.
    setBanner(null);
    setNotSavedId(null);
    // (only when the switch changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

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
  // Classes that test together (same start and end time) are one choice on BOTH tabs (v0.193,
  // v0.195): the chosen class's testing group shows. A single class is a group of one.
  const groups = testingGroups(classes);
  const group = groupOfClass(groups, classSel) ?? groups[0] ?? null;
  const groupClasses = group ? group.classes : [];
  const selected = groupClasses[0] ?? null; // the group's first class (Add student starts on it)
  const inGroup = (r) => group !== null && group.classIds.includes(r.eventClassId);
  const classPos = new Map(classes.map((c, index) => [c.id, index]));
  const order = rosterOrder(rankById);
  // Class switch order first (so each class's rows stay together), then belt order.
  const groupOrder = (a, b) => (classPos.get(a.eventClassId) ?? 0) - (classPos.get(b.eventClassId) ?? 0) || order(a, b);
  let rows = active.filter(inGroup).sort(groupOrder);
  // (No Paid / Not paid filter while private details are hidden, even for the one drawing before
  // the switch-on effect above clears it.)
  const shownFilter = hidden ? null : filter;
  if (shownFilter === 'paid') rows = rows.filter((r) => r.paid);
  if (shownFilter === 'notPaid') rows = rows.filter((r) => !r.paid);
  // Removed students of the whole group, in one Removed group after the classes.
  const removedRows = group && shownFilter === null ? removed.filter(inGroup).sort(groupOrder) : [];
  // v0.195: a small heading per class when classes test together ("Group B · 3 students");
  // a class with nobody shown is left out. One class alone: no heading (as before).
  const isGroup = groupClasses.length > 1;
  const sections = isGroup
    ? groupClasses
        .map((c) => {
          const mine = rows.filter((r) => r.eventClassId === c.id);
          return { key: c.id, heading: T.groupClassHeading(c.className, mine.length), rows: mine };
        })
        .filter((section) => section.rows.length > 0)
    : [{ key: group?.id ?? 'none', heading: null, rows }];

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

  // ===== Grading (phase 3) =====
  // Every active student, in class switch order, then roster order (belt, last, first name).
  const classPosition = new Map(classes.map((c, index) => [c.id, index]));
  const gradingRows = [...active].sort(
    (a, b) => (classPosition.get(a.eventClassId) ?? 0) - (classPosition.get(b.eventClassId) ?? 0) || order(a, b),
  );
  const dayWindow = event ? gradingWindow(today, event.testingDate) : 'before';
  const grading = useGradingSaves({
    roster: gradingRows,
    classes,
    loadedAt: data?.startedAt ?? null,
    reload: () => reloadQuiet(),
    onNoAccess,
    showPageBanner: (text) => setBanner({ text }),
    isReadOnly: !canChangeResults(dayWindow, isAdmin),
    screenLocked,
  });

  // On the testing day, the first time Grading shows for this event, open the class that is on
  // right now (or the next one) — v0.184. Other days: the class chosen on Students.
  useEffect(() => {
    if (tab !== 'grading' || !event || dayWindow !== 'day' || classes.length === 0 || gradingClassPicked.has(eventId)) return;
    gradingClassPicked.add(eventId);
    const id = defaultGradingClassId(classes, schoolMinutesNow());
    if (id) {
      classByEvent.set(eventId, id);
      setClassSelState(id);
    }
  }, [tab, event, dayWindow, classes, eventId]);

  // ----- Tabs: Students | Grading -----
  function switchTab(next) {
    if (next === tab) return;
    setMenu(null);
    if (onEventTab) onEventTab(next);
    else setLocalTab(next);
  }
  // ← → (and Home / End) move between the two tabs and switch at once, like the Testing tabs.
  function handleTabKeyDown(keyEvent) {
    const index = TABS.indexOf(tab);
    let next = null;
    if (keyEvent.key === 'ArrowRight') next = TABS[(index + 1) % TABS.length];
    else if (keyEvent.key === 'ArrowLeft') next = TABS[(index - 1 + TABS.length) % TABS.length];
    else if (keyEvent.key === 'Home') next = TABS[0];
    else if (keyEvent.key === 'End') next = TABS[TABS.length - 1];
    if (!next) return;
    keyEvent.preventDefault();
    switchTab(next);
    document.getElementById(tabIds.tab(next))?.focus();
  }

  // ----- Leaving the page while results are Not saved (v0.192, contract 0010 §4.9) -----
  // App.jsx calls this before it navigates away. false = nothing unsaved, go ahead. true = the
  // "N results aren't saved" dialog is open; it calls proceed() itself on "Leave anyway".
  const guardRef = useRef(null);
  guardRef.current = (proceed) => {
    if (grading.unsavedCount === 0) return false;
    if (dialogRef.current?.type === 'leave') return true; // already asking
    const list = grading.unsavedRows();
    const groups = [];
    for (const item of list) {
      const last = groups[groups.length - 1];
      if (last && last.classId === item.classId) last.names.push(item.name);
      else groups.push({ classId: item.classId, className: item.className, names: [item.name] });
    }
    const opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    openDialog({ type: 'leave', proceed, count: list.length, body: T.leaveBody(groups), firstId: list[0]?.id ?? null, opener });
    return true;
  };
  const leaveGuard = useCallback((proceed) => guardRef.current(proceed), []);
  useEffect(() => {
    if (!onLeaveGuardChange) return undefined;
    onLeaveGuardChange(leaveGuard);
    return () => onLeaveGuardChange(null);
  }, [onLeaveGuardChange, leaveGuard]);

  // Closing or reloading the browser tab while something is unsaved: the browser asks its own
  // "Leave site?" question (its words can't be changed).
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

  // ----- Print grading sheet (G6): draw the sheet, print, remove it again -----
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => {
      setPrinting(null);
      focusLater(() => printing.opener, () => find('.gr-print'));
    };
    window.addEventListener('afterprint', done);
    // Wait one frame so the sheet is on the page before the print window opens.
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
    // (Only a new print matters here; focusLater is a plain function of this component.)
  }, [printing]);

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
    // A finished event: admins may still add a student (v0.191); staff don't see the button.
    if (!event || (event.state === 'finished' && !isAdmin)) return;
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
    // graded: what the dialog shows about the student's result (re-read just before a belt
    // change is saved, contract 0010 §4.7).
    const graded = { graded: Boolean(row.graded), result: row.result ?? null, note: row.note ?? null };
    const next = { type: 'student', mode: 'edit', rowId: row.id, snapshot: row, values, initial: values, fromView, graded };
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

  // ----- Phase 4: Move to private testing (P5) -----
  // The live payments of a registration (not reversed), oldest first: they move with the student.
  function livePaymentsOf(registrationId) {
    const mine = payments.filter((p) => p.registrationId === registrationId);
    const reversed = new Set(mine.filter((p) => p.kind === 'reversal').map((p) => p.reversesPaymentId));
    return mine.filter((p) => p.kind === 'payment' && !reversed.has(p.id));
  }
  async function openMove(row, opener) {
    // The private price is TODAY's price in Classes and ranks for the student's rank (v0.404); only
    // when that rank no longer exists there, the event's own copy. Read fresh before the dialog opens.
    const copy = rankById.get(row.eventRankId);
    if (!copy || !beginWrite()) return;
    const result = await loadClassesAndRanks(event.locationCode);
    endWrite(result.status === 'ok' ? 'ok' : result.status);
    if (result.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (result.status !== 'ok') {
      setBanner({ text: T.LOAD_EVENT_FAILED, retry: retryLoad });
      return;
    }
    const liveRank = result.classes.flatMap((c) => c.ranks).find((r) => r.id === copy.rankId);
    const priceCents = liveRank ? liveRank.privateCents : copy.privateCents;
    const values = { day: '', time: '' };
    const moved = livePaymentsOf(row.id).map((p) => ({ cents: p.amountCents, method: p.method }));
    openDialog({ type: 'move', rowId: row.id, snapshot: row, values, initial: values, priceCents, payments: moved, pastDay: null, opener });
  }
  async function saveMove(canSave) {
    const d = dialogRef.current;
    if (!d || d.saving || d.type !== 'move') return;
    if (!canSave || !checkMove(d, { today }).canSave) {
      patchDialog({ triedSave: true });
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const result = await moveToPrivate({ registrationId: d.rowId, expectedVersion: d.snapshot.version, privateDate: d.values.day, privateTime: d.values.time });
    endWrite(result.status);
    const status = result.status;
    const name = T.studentLabel(d.snapshot);
    if (status === 'ok') {
      setDialog(null);
      const reloaded = reloadQuiet();
      // Undo only when no testing-day result was cleared (the No show can't come back, §10 point 5).
      const privateId = result.privateId;
      const action = result.resultCleared
        ? null
        : {
            label: T.UNDO,
            onAction: () =>
              runUndo(() => undoMoveToPrivate({ privateId, expectedVersion: 1 }), { find: () => rowEl(d.rowId) }, { notAllowedText: T.UNDO_MOVE_TOO_LATE }),
          };
      showToast(T.movedToast(name), action ? { icon: false, action } : { icon: false });
      focusLater(() => rowEl(d.rowId), addStudentEl, reloaded);
    } else if (status === 'past_day') {
      patchDialog({ saving: false, pastDay: d.values.day });
    } else if (status === 'has_result') {
      patchDialog({ saving: false, note: 'MOVE_HAS_RESULT', blocked: true });
      reloadQuiet();
    } else if (status === 'withdrawn') {
      setDialog(null);
      setBanner({ text: T.isWithdrawn(name) });
      reloadQuiet();
      focusAfterClose(d);
    } else {
      handleDialogProblem(status);
    }
  }

  // ----- Grading: the note dialog (G2) -----
  function openNote(row, opener) {
    const saved = grading.view(row).note;
    const values = { text: saved ?? '' };
    openDialog({ type: 'note', rowId: row.id, snapshot: row, values, initial: values, opener });
  }

  function focusAfterClose(d) {
    if (d.type === 'note') focusLater(() => find(`[data-note-btn="${d.rowId}"]`), () => d.opener ?? document.getElementById(tabIds.tab('grading')));
    else if (d.type === 'leave') {
      // Stay: back where the person was, else the first Not saved row's chosen result button.
      focusLater(
        () => d.opener,
        () => find(`[data-result-btn="${d.firstId}"][aria-pressed="true"]`) ?? find(`[data-result-btn="${d.firstId}"]`),
      );
    } else if (d.type === 'link') focusLater(() => d.opener, linkEl);
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
    if (d.type === 'note') return isNoteDirty(d);
    if (d.type === 'move') return isMoveDirty(d);
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
    // Phase 3 (contract 0010 §4.7): a belt or class change clears a recorded result. Read the
    // student's result again first; if it changed since the dialog opened (a grader tapped just
    // now), show the new state and let the person read it and press Save again.
    if (p.eventRankId !== snap.eventRankId) {
      const fresh = await loadResult(d.rowId);
      if (fresh.status !== 'ok') {
        endWrite('error');
        patchDialog({ saving: false, note: 'SAVE_FAILED' });
        return;
      }
      if (Boolean(fresh.graded) !== Boolean(d.graded?.graded)) {
        endWrite('ok');
        const graded = { graded: Boolean(fresh.graded), result: fresh.result ?? null, note: fresh.note ?? null };
        // Staff after the testing day: the choices lock — put the saved class and belt back.
        const locks = graded.graded && dayWindow === 'after' && !isAdmin;
        setDialog((current) =>
          current
            ? { ...current, saving: false, graded, values: locks ? { ...current.values, classId: current.initial.classId, rankId: current.initial.rankId } : current.values }
            : current,
        );
        return;
      }
    }
    const result = await updateStudent({
      registrationId: d.rowId,
      expectedVersion: snap.version,
      firstName: p.firstName,
      lastName: p.lastName,
      eventRankId: p.eventRankId,
    });
    endWrite(result.status);
    if (result.status === 'not_allowed') {
      // The student is graded and the testing day is over: only an admin can change their belt.
      patchDialog({ saving: false, note: 'STUDENT_LOCKED', blocked: true });
      reloadQuiet();
      return;
    }
    if (result.status !== 'ok') {
      handleDialogProblem(result.status);
      return;
    }
    setDialog(null);
    if (newClassId && newClassId !== selected?.id) setClassSel(newClassId); // follow the student to their new class
    const reloaded = reloadQuiet();
    const savedVersion = result.version;
    if (result.resultCleared) {
      // The belt change cleared the student's result: no Undo (it couldn't bring the result back).
      showToast(T.TOAST_CHANGES_SAVED, { icon: false });
      focusLater(() => rowEl(d.rowId), () => d.opener, reloaded);
      return;
    }
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
    const open = stillOpen(d);
    if (result.status !== 'ok') {
      if (open) handleDialogProblem(result.status);
      else if (hiddenNowRef.current) hiddenMoneyProblem(result.status);
      else setBanner({ text: result.status === 'error' ? T.SAVE_FAILED : T.ROSTER_STALE });
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
      action: {
        label: T.UNDO,
        onAction: () => runUndo(() => changePayingBy({ registrationId: d.rowId, expectedVersion: savedVersion, payingBy: back }), { find: () => rowEl(d.rowId) }, { money: true }), // how they pay counts as money while hidden
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
    const open = stillOpen(d);
    if (result.status !== 'ok') {
      if (open) handleDialogProblem(result.status);
      else if (hiddenNowRef.current) hiddenMoneyProblem(result.status);
      else setBanner({ text: result.status === 'error' ? T.SAVE_FAILED : T.ROSTER_STALE });
      return;
    }
    if (open) setDialog(null);
    const reloaded = reloadQuiet();
    // Hidden now: the general words ("Payment saved" would say there is a payment).
    showToast(hiddenNowRef.current ? T.TOAST_CHANGES_SAVED : T.TOAST_PAYMENT_SAVED, { icon: false });
    focusLater(() => d.opener, () => rowEl(d.rowId), reloaded);
  }

  // ----- Save: the grading note (G2, contract 0010 §4.5) -----
  // Not part of the one-change-at-a-time lock: grading never waits for the desk's changes.
  async function saveNote() {
    const d = dialogRef.current;
    if (!d || d.saving || d.type !== 'note') return;
    const row = active.find((r) => r.id === d.rowId) ?? d.snapshot;
    if (!checkNote(d, grading.view(row).note).canSave) return;
    patchDialog({ saving: true, note: null });
    const status = await grading.saveNote(row, d.values.text);
    if (status === 'ok') {
      setDialog(null);
      focusAfterClose(d);
    } else if (status === 'error' || status === 'stale') {
      patchDialog({ saving: false, note: 'NOTE_SAVE_FAILED' });
    } else if (status === 'invalid') {
      patchDialog({ saving: false, note: 'NOTE_BAD_CHARACTER' });
    } else if (status === 'finished' || status === 'not_open') {
      setDialog(null);
      setBanner({ text: status === 'finished' ? T.TOO_LATE_RESULTS : T.GRADING_NOT_OPEN });
      const reloaded = reloadQuiet();
      focusLater(() => find(`[data-note-btn="${d.rowId}"]`), () => document.getElementById(tabIds.tab('grading')), reloaded);
    } else if (status === 'withdrawn' || status === 'not_found') {
      patchDialog({ saving: false, note: 'STALE_DIALOG', blocked: true });
      reloadQuiet();
    } else if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else {
      patchDialog({ saving: false, note: 'NOTE_SAVE_FAILED' });
    }
  }

  // ----- The leave dialog's two answers (§4.9) -----
  function stayOnPage() {
    cancelDialog();
  }
  function leaveAnyway() {
    const d = dialogRef.current;
    if (!d || d.type !== 'leave') return;
    setDialog(null);
    // The dialog added a step to the browser's history (Dialog.jsx) and removes it as it closes.
    // Wait for that, so the next page's step lands in the right place, then leave.
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
      window.setTimeout(go, 400); // in case the step was already gone
    }, 0);
  }

  // ===== Undo =====
  // options.notAllowedText: what to say if the database refuses the Undo for this person (e.g. a
  // staff member's payment Undo after the 10-second window).
  // options.money: the Undo of a payment — while hidden on arrival, the general words, no Retry.
  async function runUndo(call, focus = null, options = {}) {
    if (!beginWrite()) return;
    const result = await call();
    endWrite(result.status);
    const status = result.status;
    if (options.money && hiddenNowRef.current && status !== 'ok') {
      hiddenMoneyProblem(status);
      return;
    }
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
  // money: Mark paid / Undo payment — while hidden on arrival, the general words, no Retry.
  function rowProblem(status, row, retry, money = false) {
    const name = T.studentLabel(row);
    if (money && hiddenNowRef.current) hiddenMoneyProblem(status);
    else if (status === 'no_access') onNoAccess();
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
    } else if (status === 'moved') {
      // Phase 4: Restore of a student who was moved to private testing (contract 0014 §2.6).
      setBanner({ text: T.RESTORE_MOVED(row.firstName) });
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
      rowProblem(result.status, row, { text: T.markPaidFailed(name), run: () => doMarkPaid(row) }, true);
      return;
    }
    setNotSavedId(null);
    setBanner((current) => (current?.kind === 'row' ? null : current));
    reloadQuiet();
    const paymentId = result.paymentId;
    // Hide private details switched on while this was saving: the general words, no Undo payment.
    if (hiddenNowRef.current) {
      showToast(T.TOAST_CHANGES_SAVED, { icon: false });
      return;
    }
    showToast(T.markedPaidToast(name, result.amountCents, result.method), {
      icon: false,
      action: {
        label: T.UNDO,
        onAction: () => runUndo(() => undoPayment({ paymentId }), { find: () => rowEl(row.id) }, { notAllowedText: T.UNDO_PAYMENT_TOO_LATE, money: true }),
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
      rowProblem(result.status, row, { text: T.actionFailed, run: () => doUndoPayment(row) }, true);
      return;
    }
    reloadQuiet();
    // Hidden now: the general words ("Payment undone" would say they had paid).
    showToast(hiddenNowRef.current ? T.TOAST_CHANGES_SAVED : T.paymentUndoneToast(T.studentLabel(row)), { icon: false });
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
      // The warning's parts; the sentence is written when drawn, so it follows Hide private details
      // even if the switch changes while the dialog is open.
      bodyParts: [
        fresh.event.name,
        counted ? { cents: counted.amountCents, method: counted.method, paidOn: counted.paidOn } : null,
        // Phase 3 (G8): the warning names the testing result (or the grading note) too.
        freshRow.graded ? { result: freshRow.result ?? null, resultAt: freshRow.resultAt ?? null, hasNote: freshRow.note !== null && freshRow.note !== undefined } : null,
        freshRow.firstName,
      ],
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
      // not_allowed (v0.194): the testing day is over — keeping one is admin-only now.
      if (result.status === 'no_access') onNoAccess();
      else setBanner({ text: result.status === 'not_allowed' ? T.ROSTER_NOT_ALLOWED : T.ROSTER_STALE });
      if (result.status === 'not_allowed') onRefreshProfile();
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
  // The menu keeps a copy of the row as it was when it opened, so a background refresh (another
  // device marking the student paid, say) can't swap its items under the pointer.
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
    const row = menu.row ?? roster.find((r) => r.id === menu.id);
    if (!row) return null;
    const name = T.studentLabel(row);
    const anchor = menu.anchor;
    const items = [];
    // One fixed order on every row (R8): Edit details (always first, never moves), Change how
    // they'll pay, Review possible duplicate — Edit payment, Undo payment — Withdraw / Restore,
    // Delete permanently. Items that don't apply are left out; the rest keep their order. A
    // divider starts each later group, but never the menu itself.
    const groupStart = () => items.length > 0;
    // Phase 4: a student moved to private testing (P5) — admins only: Open private testing, and
    // Restore shown grayed with the reason; no Delete permanently. (Staff see no ⋯ on it.)
    if (row.status !== 'active' && row.movedTo) {
      if (!isAdmin) return null;
      items.push({ key: 'openprivate', label: T.OPEN_PRIVATE, Icon: IconArrowRight, onSelect: () => onOpenPrivate?.(row.movedTo.privateId) });
      items.push({
        key: 'restore',
        label: (
          <span className="ev-menu-two">
            <span>{T.RESTORE}</span>
            <span className="ev-menu-reason">{T.restoreMovedReason(row.firstName)}</span>
          </span>
        ),
        Icon: IconArrowBackUp,
        disabled: true,
        onSelect: () => {},
      });
      return { title: name, subtitle: T.movedTag(row.movedTo.privateDate), label: T.moreForStudent(name), items };
    }
    if (row.status === 'active') {
      // Hide private details (v0.506): no payment items (Change how they'll pay, Edit / Undo payment).
      const moneyShown = !hidden;
      items.push({ key: 'edit', label: T.EDIT_DETAILS, Icon: IconEdit, onSelect: () => openEdit(row, anchor) });
      // Phase 4: right after Edit details, all staff (P5)
      if (canMoveToPrivate(row)) items.push({ key: 'move', label: T.MOVE_TO_PRIVATE, Icon: IconArrowRight, onSelect: () => openMove(row, anchor) });
      if (moneyShown && !row.paid) items.push({ key: 'paying', label: T.CHANGE_PAYING_BY, Icon: NoIcon, onSelect: () => openPayingBy(row, anchor) });
      if (row.duplicateState === 'possible') items.push({ key: 'review', label: T.REVIEW_DUPLICATE, Icon: IconAlertTriangle, onSelect: () => openCompareFor(row, anchor) });
      if (moneyShown && isAdmin && row.paid) {
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
  // On a finished event only admins see Add student (v0.191, v0.192).
  const addShown = live.status === 'ready' && event !== null && (event.state !== 'finished' || isAdmin);
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

  const allCards = [
    { key: null, label: T.CARD_STUDENTS, Icon: IconUsers, value: active.length },
    { key: 'paid', label: T.CARD_PAID, Icon: IconCheck, value: paidCount },
    { key: 'notPaid', label: T.CARD_NOT_PAID, Icon: IconClock, value: active.length - paidCount },
    { key: 'money', label: T.CARD_PAYMENTS, Icon: IconSum, value: T.dollars(paymentsTotal) }, // ti-sum = a money total (v0.303)
  ];
  // Hide private details: only the Students card (as Star's G4).
  const cards = hidden ? allCards.slice(0, 1) : allCards;
  // Hide private details: the Status column shows only when a shown row has a tag that isn't about
  // money (Possible duplicate, Not saved, Removed / Duplicate copy) — Star's G4 rule.
  const showStatusCol = !hidden || [...rows, ...(removedOpen ? removedRows : [])].some((r) => hasStatusTag(r, notSavedId));

  const ctx = {
    layout,
    nav,
    rankById,
    busy,
    isAdmin,
    menuFor: menu?.id ?? null,
    selectedId: dialog && !screenLocked && dialog.rowId ? dialog.rowId : null,
    notSavedId,
    hidden,
    showStatusCol,
    tableLabel: group ? T.groupFullName(groupClasses.map((c) => c.className)) : T.TAB_STUDENTS,
    handlers: {
      onOpen: (row) => openView(row, rowEl(row.id)),
      onMore: (row, anchor) => openMenu(row, anchor),
      onMarkPaid: (row) => doMarkPaid(row),
      onReview: (row) => openCompareFor(row),
    },
  };

  let emptyText = T.EMPTY_CLASS_ROSTER;
  if (shownFilter === 'paid') emptyText = T.NO_STUDENTS_FILTERED_PAID;
  if (shownFilter === 'notPaid') emptyText = T.NO_STUDENTS_FILTERED_NOT_PAID;

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
          graded={dialog.graded ?? null}
          beltLocked={dialog.mode === 'edit' && Boolean(dialog.graded?.graded) && dayWindow === 'after' && !isAdmin}
          hidden={hidden}
          onTouch={touch}
          onSave={saveStudent}
          onEdit={() => record && openEdit(record, dialog.opener, true)}
          {...common}
        />
      );
    } else if (dialog.type === 'paying' && !hidden) {
      dialogElement = <PayingByDialog key={dialog.key} state={dialog} name={T.studentLabel(dialog.snapshot)} onSave={savePayingBy} {...common} />;
    } else if (dialog.type === 'payment' && !hidden) {
      dialogElement = <EditPaymentDialog key={dialog.key} state={dialog} name={T.studentLabel(dialog.snapshot)} onTouch={touch} onSave={savePayment} {...common} />;
    } else if (dialog.type === 'move') {
      const rank = rankById.get(dialog.snapshot.eventRankId);
      dialogElement = (
        <MoveToPrivateDialog
          key={dialog.key}
          state={dialog}
          record={dialog.snapshot}
          className={classById.get(dialog.snapshot.eventClassId)?.className ?? ''}
          rankName={rank?.name ?? ''}
          toName={rank?.testingFor?.name ?? T.NO_NEW_RANK}
          event={event}
          today={today}
          hidden={hidden}
          onTouch={touch}
          onSave={saveMove}
          {...common}
        />
      );
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
          // v0.194: after the testing day "keep one" is admin-only, so staff don't see it
          // (the same way staff don't see Add student on a finished event).
          canKeepOne={isAdmin || dayWindow !== 'after'}
          hidden={hidden}
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
          body={T.deleteStudentBody(...dialog.bodyParts, hidden)}
          hint={T.DELETE_STUDENT_HINT}
          keepLabel={T.KEEP_STUDENT}
          deleteLabel={T.DELETE_PERMANENTLY}
          failed={dialog.failed}
          deleting={dialog.saving}
          onDelete={confirmDelete}
          onCancel={cancelDialog}
        />
      );
    } else if (dialog.type === 'note') {
      const row = active.find((r) => r.id === dialog.rowId) ?? dialog.snapshot;
      const shown = grading.view(row);
      const rank = rankById.get(row.eventRankId);
      const subtitle = T.noteSub(
        classById.get(row.eventClassId)?.className ?? '',
        rank?.name ?? '',
        rank?.testingFor?.name ?? T.NO_NEW_RANK,
        shown.result ? T.resultButtonText(shown.result) : T.NOT_RECORDED_YET,
      );
      dialogElement = (
        <NoteDialog
          key={dialog.key}
          state={dialog}
          name={T.studentLabel(row)}
          subtitle={subtitle}
          savedNote={shown.note}
          onSave={saveNote}
          {...common}
        />
      );
    } else if (dialog.type === 'leave') {
      // v0.192 (approved image P3, option B): the same small box on every device. Nothing is
      // deleted, so no red: "Stay on this page" is the blue default (Enter, Esc, backdrop, Back).
      dialogElement = (
        <Dialog key={dialog.key} title={T.leaveTitle(dialog.count)} variant="confirm" describedBy={`${baseId}-leave-body`} onRequestClose={stayOnPage}>
          <p id={`${baseId}-leave-body`} className="tdialog-sub tdialog-body">
            {dialog.body}
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={leaveAnyway}>
              {T.LEAVE_ANYWAY}
            </button>
            <button type="button" className="btn btn-primary" data-autofocus onClick={stayOnPage}>
              {T.STAY_ON_PAGE}
            </button>
          </div>
        </Dialog>
      );
    }
  }

  const content = menu && !screenLocked ? menuContent() : null;
  const classLabelId = `event-${eventId}-class-label`;
  const time = selected ? classTimeLabel(selected.startTime, selected.endTime) : '';
  const selectedCount = groupClasses.reduce((sum, c) => sum + (countByClass.get(c.id) ?? 0), 0);

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
      {/* Students | Grading (phase 3): real tabs — one Tab stop (the current tab), ← → Home End. */}
      <div className={`ttabs ev-tabs${isPhone ? ' is-phone' : ''}`} role="tablist" aria-label={event.name} onKeyDown={handleTabKeyDown}>
        {TABS.map((key) => {
          const current = key === tab;
          return (
            <button
              key={key}
              id={tabIds.tab(key)}
              type="button"
              className={`ttab${current ? ' is-current' : ''}`}
              role="tab"
              aria-selected={current ? 'true' : 'false'}
              aria-controls={tabIds.panel(key)}
              tabIndex={current ? 0 : -1}
              onClick={() => switchTab(key)}
            >
              {key === 'students' ? T.TAB_STUDENTS : T.TAB_GRADING}
            </button>
          );
        })}
      </div>

      {/* G5: results that didn't save — on both tabs, until they save (they retry by themselves,
          v0.192) or the person closes it. */}
      {grading.banner && (
        <ErrorBanner text={grading.banner.text} onRetry={() => grading.retryAll()} onDismiss={() => grading.dismissBanner()} />
      )}
      {banner && (
        <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy} onDismiss={() => setBanner(null)} />
      )}

      {tab === 'grading' ? (
        <GradingTab
          event={event}
          classes={classes}
          rows={gradingRows}
          today={today}
          isAdmin={isAdmin}
          layout={layout}
          classSel={classSel ?? selected?.id ?? null}
          onClassSel={(id) => setClassSel(id)}
          grading={grading}
          onOpenNote={openNote}
          onPrint={(opener) => setPrinting({ printedAt: new Date(), opener })}
          panelId={tabIds.panel('grading')}
          tabId={tabIds.tab('grading')}
        />
      ) : (
        <div id={tabIds.panel('students')} role="tabpanel" aria-labelledby={tabIds.tab('students')}>
          {/* Summary cards (Star v0.115): clicking Paid / Not paid filters the roster.
              Hide private details: the Students card alone (is-one). */}
          <div className={`ev-cards${hidden ? ' is-one' : ''}`}>
            {cards.map((card) => {
              const isFilter = card.key === 'paid' || card.key === 'notPaid';
              const pressed = isFilter && shownFilter === card.key;
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
          {shownFilter && (
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
                  value={group?.id ?? null}
                  onChange={(id) => {
                    setClassSel(id);
                    setMenu(null);
                  }}
                  options={groups.map((g) => {
                    const label = T.groupChoiceLabel(g.classes.map((c) => c.className));
                    const count = g.classIds.reduce((sum, id) => sum + (countByClass.get(id) ?? 0), 0);
                    return {
                      key: g.id,
                      label: `${label} ${count}`,
                      content: (
                        <>
                          <span className="ev-cs-name">{label}</span>
                          <span className="ev-cs-count">{count}</span>
                        </>
                      ),
                    };
                  })}
                />
              </div>
              {group && (
                <p className="ev-classline">
                  <strong>{T.classLineTitle(T.groupFullName(groupClasses.map((c) => c.className)), time)}</strong>
                  <span>{T.studentsCount(selectedCount)}</span>
                  {groupGearTags(groupClasses).map((text) => (
                    <span key={text} className="ttag">
                      {text}
                    </span>
                  ))}
                </p>
              )}
              <RosterRows
                rows={rows}
                sections={sections}
                removedRows={removedRows}
                removedOpen={removedOpen}
                onToggleRemoved={() => setRemovedOpen(!removedOpen)}
                emptyText={emptyText}
                ctx={ctx}
              />
            </>
          )}
        </div>
      )}

      {printing && <GradingSheet event={event} school={school} classes={classes} rows={gradingRows} printedAt={printing.printedAt} />}
      {content && (
        <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />
      )}
      {dialogElement}
    </>
  );
}
