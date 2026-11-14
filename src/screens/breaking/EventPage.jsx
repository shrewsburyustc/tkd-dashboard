// EventPage.jsx — one Board breaking event: the roster for the night (address #testing/breaking/event/<id>).
// Why it exists: staff run the day from this page (rulebook v1.300, contract CONTRACT-0051, approved pictures
// docs/Board Breaking/Mockups/B-staff-roster.png and B-staff-dialogs.png). It shows:
//   - "← Board breaking", the event's name, "Fri, Nov 20, 2026 · Shrewsbury school · 10 registered";
//   - the Registration Open / Closed switch (admins; staff see the words), Add student (the page's one blue
//     button) and Registration link (the QR code box);
//   - for admins, the amber box "2 Square payments need a look" with Review;
//   - the count cards (Registered, Paid, Broke — each filters the list — and Collected), Find a student;
//   - the students grouped by class time (roster/Roster.jsx), each row with Mark paid, the Broke box and ⋯.
// What it does with the database (src/lib/breaking/breakingApi.js): reads the roster and, once, the prices and the
// board chart; every save is one at a time on the page's line of saves (lib/saveLine.js), then the roster reloads.
// The roster also reloads by itself every 15 seconds (useLiveLoad), so family sign-ups show up without a refresh.
// Failures follow rulebook 3.5: a row that didn't reach the database says "Not saved" and the bar under the top bar
// offers Retry; a refusal ("someone else changed it", "not allowed") says so in words and shows what changed.
//
// The dialogs are drawn by files in dialogs/ (Add / Edit student, Move to class, History, Delete, Edit payment,
// Record refund, the Square Review box); this page only opens them and reloads when they save. Undo payment and
// Undo refund ask first with the shared "are you sure?" box (components/ConfirmBox.jsx) and live here.
//
// While Hide private details is on (lib/privateDetails.js) the money parts go: the amounts, Paying by, the payment
// tags, Mark paid, the Paid and Collected cards, the Square box and the money items of the ⋯ menu.
// Staff vs admin: admins also switch Registration, override a price, Edit payment, refund and delete; the
// database enforces the same rules, this only hides what a person can't use.
//
// Props (from BoardBreaking.jsx):
//   eventId, isAdmin, deviceLocation ('Worcester' | 'Shrewsbury' — the desk a payment counts at),
//   onBack(), onGone() (the event doesn't exist any more), screenLocked, onNoAccess, onRefreshProfile,
//   showToast, clearToast, onModalOpenChange
// Draw it inside <div className="testing brk"> like the other Testing pages.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconArrowBackUp, IconCheck, IconHammer, IconPlus, IconQrcode, IconSearch, IconStack2, IconStack3, IconSum, IconUsers, IconX } from '@tabler/icons-react';
import BackLink from '../../components/BackLink.jsx';
import ChoiceGroup from '../../components/ChoiceGroup.jsx';
import ConfirmBox from '../../components/ConfirmBox.jsx';
import CountCards from '../../components/CountCards.jsx';
import DuplicateBox from '../../components/DuplicateBox.jsx';
import MarkPaidBox from '../../components/MarkPaidBox.jsx';
import PageBar from '../../components/PageBar.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import IconButton from '../../components/IconButton.jsx';
import { markedPaidToast, markedPaidToastHidden, paymentUndoneToast, undoPaymentTitle } from '../../components/text.js';
import { loadRoster, loadSettings, markPaid, setBroke, undoPayment, undoRefund, updateEvent } from '../../lib/breaking/breakingApi.js';
import { classTimes, owedCents, paidCents, paidState, payingByLabel, rankLabel, rankOptions } from '../../lib/breaking/breakingRules.js';
import * as T from '../../lib/breaking/text/roster.js';
import { formatMoney } from '../../lib/money.js';
import { usePrivateDetailsHidden } from '../../lib/privateDetails.js';
import { useSaveLine } from '../../lib/saveLine.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../lib/useLiveLoad.js';
import { PHONE_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import { reloadBounded, saveOnLine, undoAnswer } from '../camps/lineSave.js';
import { focusSoon } from '../camps/focusSoon.js';
import RegistrationLink from './roster/RegistrationLink.jsx';
import Roster, { fullName } from './roster/Roster.jsx';
import { classBoardTotals, eventBoardTotals, ROSTER_ROOM } from './roster/rosterRules.js';
import { usePageRoomBelow } from '../../lib/pageRoom.js';
import { rosterMenuItems } from './roster/rosterMenu.jsx';
import { standingPayment, standingRefunds } from './roster/rosterRules.js';
import StudentDialog from './dialogs/StudentDialog.jsx';
import MoveToClassDialog from './dialogs/MoveToClassDialog.jsx';
import StudentHistoryDialog from './dialogs/StudentHistoryDialog.jsx';
import DeleteStudentConfirm from './dialogs/DeleteStudentConfirm.jsx';
import RefundDialog from './dialogs/RefundDialog.jsx';
import EditPaymentDialog from './dialogs/EditPaymentDialog.jsx';
import SquareReviewDialog from './dialogs/SquareReviewDialog.jsx';
import '../../styles/testing-events.css';
import '../../styles/camps.css';
import '../../styles/breaking-roster.css';

// The dialogs about money: they close when Hide private details is switched on.
const MONEY_DIALOGS = ['refund', 'editPayment', 'undoPayment', 'undoRefund', 'square'];
const settingsLoader = () => loadSettings();
// The class tab last used on each event, kept while the app is open (Color belt testing's classByEvent): coming back to an event
// from the list lands on the same class.
const classByEvent = new Map();

export default function EventPage({
  eventId,
  isAdmin,
  deviceLocation,
  onBack,
  onGone,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
}) {
  const live = useLiveLoad({ key: eventId, enabled: !screenLocked, load: loadRoster, refreshMs: LIVE_REFRESH_MS });
  // The prices and the chart (rank order, belts, the dialogs' price line): read once, not every 15 seconds.
  const settingsLive = useLiveLoad({ key: 'settings', enabled: !screenLocked, load: settingsLoader });
  const liveRef = useRef(live);
  const settingsRef = useRef(settingsLive);
  useLayoutEffect(() => {
    liveRef.current = live;
    settingsRef.current = settingsLive;
  });
  const data = live.data;
  const event = data?.event ?? null;
  const registrations = data?.registrations ?? [];
  const needsLook = data?.needsLook ?? [];
  const settings = settingsLive.data?.settings ?? null;
  const chart = settingsLive.data?.chart ?? null;

  const isPhone = useMediaQuery(PHONE_QUERY);
  // Only the roster's own layout follows the room beside the left panel (Color belt's pattern): too narrow for the tablet columns → the
  // stacked rows phones show. Dialogs and menus keep following the window (isPhone).
  const narrowRoom = usePageRoomBelow(ROSTER_ROOM);
  const rosterStacked = isPhone || narrowRoom;
  const [hidden] = usePrivateDetailsHidden(); // Hide private details
  const hiddenNowRef = useRef(hidden);
  hiddenNowRef.current = hidden;

  const [dialog, setDialog] = useState(null); // { type, key, opener, … }
  const [menu, setMenu] = useState(null); // { row, anchor }
  const [popover, setPopover] = useState(null); // the Mark paid box: { anchor, rowId }
  const [banner, setBanner] = useState(null); // { kind?, text, retry?, takeFocus? }
  const [notSavedId, setNotSavedId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(null); // null | 'paid' | 'broke'
  const [classSel, setClassSelState] = useState(() => classByEvent.get(eventId) ?? null); // the class tab (null = the first class)
  const classLabelId = `${useId()}-class`;

  // ----- The page's line of saves: one at a time; an Undo pressed meanwhile waits its turn -----
  const lastUndoRowRef = useRef(null);
  const line = useSaveLine({
    section: 'Board breaking',
    showToast,
    undoBar: (next) => setBanner((current) => (next ? { kind: 'undo', ...next } : current?.kind === 'undo' ? null : current)),
  });
  const busy = line.busy;
  const save = (call, retry = null) => saveOnLine(line, call, { retry, onNotOk: () => clearToast() });

  // ----- Focus: never leave it on the page body after something goes away -----
  const focusHasFallen = () => {
    const active = document.activeElement;
    return !active || active === document.body || !active.isConnected || Boolean(active.closest?.('.toast-region'));
  };
  function focusRowIfLost(rowId = null) {
    focusSoon(() => {
      if (!focusHasFallen()) return null;
      return (
        (rowId ? document.querySelector(`[data-mark="${rowId}"]`) ?? document.querySelector(`[data-broke="${rowId}"]`) ?? document.querySelector(`[data-more="${rowId}"]`) : null) ??
        document.querySelector('.back-link')
      );
    });
  }

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
  // The event was deleted (here or by someone else): close whatever was open and leave.
  useEffect(() => {
    if (live.status !== 'notFound') return;
    setDialog(null);
    setMenu(null);
    setPopover(null);
    onGone();
  }, [live.status, onGone]);
  // Locking closes the small boxes; dialogs are simply not drawn while locked.
  useEffect(() => {
    if (screenLocked) {
      setMenu(null);
      setPopover(null);
    }
  }, [screenLocked]);

  // The app makes the page behind a dialog inert while one is open.
  const modalShown = dialog !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  // Switching Hide private details ON: no money dialog, box, toast or banner may stay.
  const hiddenBeforeRef = useRef(hidden);
  useEffect(() => {
    const switchedOn = hidden && !hiddenBeforeRef.current;
    hiddenBeforeRef.current = hidden;
    if (!switchedOn) return;
    if (dialog && MONEY_DIALOGS.includes(dialog.type)) setDialog(null);
    setPopover(null);
    setMenu(null);
    clearToast();
    setBanner(null);
    setNotSavedId(null);
    if (filter === 'paid') setFilter(null);
    // only when the switch changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  // ===== Dialogs =====
  const openDialog = (next) => {
    clearToast();
    setMenu(null);
    setDialog({ key: Date.now(), ...next });
  };
  const patchDialog = (patch) => setDialog((current) => (current ? { ...current, ...patch } : current));
  function closeDialog() {
    const opener = dialog?.opener ?? null;
    setDialog(null);
    if (opener) focusSoon(opener);
  }
  // A dialog saved: close it and show what changed.
  function dialogDone() {
    const opener = dialog?.opener ?? null;
    setDialog(null);
    if (opener) focusSoon(opener);
    reloadQuiet();
  }
  // The prices and the chart are needed by Add / Edit student; without them say so and try again.
  function openStudentDialog(mode, row, opener) {
    if (!settings || !chart) {
      setBanner({ text: T.SETTINGS_FAILED, retry: async () => {
        const result = await settingsRef.current.reload();
        if (result === 'ok') setBanner(null);
      } });
      return;
    }
    openDialog({ type: 'student', mode, row, opener });
  }

  // ===== Undo (the toast's button) and row problems — copied from Camps' page, trimmed =====
  function undoButton(words, call, options = {}) {
    return line.undoAction(undoRun(call, options), { words, doneText: options.doneText ?? null });
  }
  function undoRun(call, options = {}) {
    return async () => {
      const result = await call();
      const hiddenMoney = Boolean(options.money) && hiddenNowRef.current;
      const stale = T.someoneElse(options.name ?? 'this student');
      const answer = undoAnswer(result, {
        notAllowed: options.notAllowedText ?? T.ROSTER_NOT_ALLOWED,
        stale,
        refundStands: isAdmin ? T.UNDO_REFUND_FIRST : T.UNDO_REFUND_STANDS_STAFF,
        general: hiddenMoney ? { error: T.actionFailed, notAllowed: T.ROSTER_NOT_ALLOWED, stale } : null,
      });
      if (answer.status === 'ok') {
        await reloadBounded(reloadQuiet);
        lastUndoRowRef.current = options.rowId ?? null;
        focusRowIfLost(options.rowId);
      } else if (answer.status === 'no_access') onNoAccess();
      else if (answer.status === 'not_allowed') {
        onRefreshProfile();
        if (hiddenMoney) reloadQuiet();
      } else if (answer.status !== 'error') reloadQuiet(); // refused: show what changed
      return answer;
    };
  }
  // money: Mark paid / Undo payment — while hidden, general words (no name, no amount).
  function rowProblem(status, row, retry) {
    const name = fullName(row);
    if (status === 'no_access') onNoAccess();
    else if (status === 'not_allowed') {
      setBanner({ text: T.ROSTER_NOT_ALLOWED });
      onRefreshProfile();
      reloadQuiet();
    } else if (status === 'already_paid') {
      setBanner({ text: T.alreadyPaid(name) });
      reloadQuiet();
    } else if (status === 'error') {
      // Didn't reach the database: the row says "Not saved" and the bar offers Retry.
      setNotSavedId(row.id);
      setBanner({ kind: 'row', text: retry.text, retry: retry.run, takeFocus: true });
    } else {
      setBanner({ text: T.someoneElse(name) });
      reloadQuiet();
    }
  }
  function rowDone() {
    setNotSavedId(null);
    setBanner((current) => (current?.kind === 'row' ? null : current));
  }

  // ===== Broke (a box in the row; its Undo is the toast's) =====
  async function doBroke(row) {
    const next = !row.broke;
    const result = await save(() => setBroke(row.id, row.version, next), () => doBroke(row));
    if (!result) return; // something else is running
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.brokeFailed(fullName(row)), run: () => doBroke(row) });
      return;
    }
    rowDone();
    reloadQuiet();
    const name = fullName(row);
    const text = next ? T.brokeToast(name) : T.notBrokeToast(name);
    const version = result.version;
    showToast(text, { icon: false, action: undoButton(text, () => setBroke(row.id, version, !next), { name, rowId: row.id }) });
  }

  // ===== Mark paid: the full amount still owed, the way picked in the shared box =====
  // The payment counts at THIS DEVICE's school (account menu → This device), never asked here.
  async function doMarkPaid(row, method) {
    const school = deviceLocation ?? event.locationCode;
    const result = await save(() => markPaid(row.id, row.version, school, method), () => doMarkPaid(row, method));
    if (!result) return;
    if (result.status === 'invalid' && result.field === 'school') {
      setBanner({ text: T.SCHOOL_REFUSED });
      return;
    }
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.markPaidFailed(fullName(row)), run: () => doMarkPaid(row, method) });
      return;
    }
    rowDone();
    reloadQuiet();
    const name = fullName(row);
    const paymentId = result.paymentId;
    const text = hiddenNowRef.current ? markedPaidToastHidden(name) : markedPaidToast(name, formatMoney(result.amountCents), payingByLabel(result.method).toLowerCase());
    showToast(text, {
      icon: false,
      // Staff may undo their own payment for 10 seconds; after that it's an admin's job (the database says which).
      action: undoButton(text, () => undoPayment(paymentId), { notAllowedText: T.UNDO_PAYMENT_TOO_LATE, money: true, name, rowId: row.id }),
    });
  }

  // ===== Registration Open / Closed (admins) =====
  async function doRegistration(open) {
    if (!event || open === event.registrationOpen) return;
    const base = { name: event.name, eventDate: event.eventDate };
    const result = await save(() => updateEvent(event.id, event.version, { ...base, registrationOpen: open }), () => doRegistration(open));
    if (!result) return;
    if (result.status !== 'ok') {
      if (result.status === 'no_access') onNoAccess();
      else if (result.status === 'not_allowed') {
        setBanner({ text: T.ROSTER_NOT_ALLOWED });
        onRefreshProfile();
        reloadQuiet();
      } else if (result.status === 'error') setBanner({ kind: 'row', text: T.REGISTRATION_FAILED, retry: () => doRegistration(open) });
      else {
        setBanner({ text: T.someoneElse(event.name) });
        reloadQuiet();
      }
      return;
    }
    rowDone();
    reloadQuiet();
    const text = T.registrationToast(open);
    const version = result.version;
    showToast(text, { icon: false, action: undoButton(text, () => updateEvent(event.id, version, { ...base, registrationOpen: !open }), { name: event.name }) });
  }

  // ===== Undo payment / Undo refund: ask first (shared "are you sure?" box) =====
  async function confirmUndo(kind) {
    const d = dialog;
    patchDialog({ saving: true, failed: false });
    const call = kind === 'payment' ? () => undoPayment(d.payment.id) : () => undoRefund(d.payment.id);
    const result = await save(call, null);
    if (!result) {
      patchDialog({ saving: false }); // something else is running: press again
      return;
    }
    if (result.status === 'ok') {
      setDialog(null);
      if (d.opener) focusSoon(d.opener);
      await reloadQuiet();
      if (!hiddenNowRef.current) showToast(kind === 'payment' ? paymentUndoneToast(d.name) : T.refundUndoneToast(d.name), { icon: false });
      return;
    }
    if (result.status === 'error') {
      patchDialog({ saving: false, failed: true });
      return;
    }
    setDialog(null);
    if (result.status === 'no_access') onNoAccess();
    else if (result.status === 'not_allowed') {
      setBanner({ text: T.UNDO_PAYMENT_TOO_LATE });
      onRefreshProfile();
    } else if (result.status === 'refund_stands') {
      setBanner({ text: isAdmin ? T.UNDO_REFUND_FIRST : T.UNDO_REFUND_STANDS_STAFF });
      reloadQuiet();
    } else {
      setBanner({ text: T.someoneElse(d.name) });
      reloadQuiet();
    }
  }

  // ===== Derived: groups, counts, cards =====
  const rankIndex = useMemo(() => {
    const map = new Map();
    if (chart) rankOptions(chart).forEach((option, index) => map.set(option.name, index));
    return map;
  }, [chart]);
  const classes = event?.classes ?? [];
  const byRank = (a, b) =>
    (rankIndex.get(a.rankName) ?? 999) - (rankIndex.get(b.rankName) ?? 999) ||
    a.lastName.localeCompare(b.lastName, 'en', { sensitivity: 'base' }) ||
    a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' });
  const q = query.trim().toLowerCase();
  const shownFilter = hidden && filter === 'paid' ? null : filter;
  const passes = (row, cls) => {
    if (shownFilter === 'paid' && paidState(row) !== 'paid') return false;
    if (shownFilter === 'broke' && !row.broke) return false;
    if (q === '') return true;
    // (the rank is searched as it is written on the row: "Orange belt")
    return [fullName(row), rankLabel(row.rankName), cls.name].some((text) => text.toLowerCase().includes(q));
  };
  const filtering = shownFilter !== null || q !== '';
  // One class at a time (the class switch, as in Color belt testing). A search or a card filter looks at EVERY class: when the
  // chosen class has no match but another one has, that class is shown meanwhile (the choice itself is kept for when the search
  // is cleared), the tabs count matches, and the class line says how many more matches are in other classes.
  const matchCount = new Map(classes.map((cls) => [cls.id, registrations.filter((r) => r.classId === cls.id && passes(r, cls)).length]));
  const shownCount = [...matchCount.values()].reduce((n, c) => n + c, 0); // matches in all classes
  const picked = classes.find((c) => c.id === classSel) ?? classes[0] ?? null;
  const firstWithMatch = filtering ? classes.find((c) => matchCount.get(c.id) > 0) ?? null : null;
  const selectedClass = picked && filtering && matchCount.get(picked.id) === 0 && firstWithMatch ? firstWithMatch : picked;
  const classAll = selectedClass ? registrations.filter((r) => r.classId === selectedClass.id) : [];
  const classRows = selectedClass ? classAll.filter((r) => passes(r, selectedClass)).sort(byRank) : [];
  const matchesElsewhere = filtering && selectedClass ? shownCount - matchCount.get(selectedClass.id) : 0;
  const countOnTab = (cls) => (filtering ? matchCount.get(cls.id) : registrations.filter((r) => r.classId === cls.id).length);
  function setClassSel(id) {
    classByEvent.set(eventId, id);
    setClassSelState(id);
    setMenu(null);
  }
  const hasStudents = registrations.length > 0;
  const paidCount = registrations.filter((r) => paidState(r) === 'paid').length;
  const brokeCount = registrations.filter((r) => r.broke).length;
  const collected = registrations.reduce((sum, r) => sum + paidCents(r), 0);
  const due = registrations.reduce((sum, r) => sum + owedCents(r), 0);
  const boardsOfClass = selectedClass ? classBoardTotals(registrations, selectedClass.id) : { tech: 0, adult: 0 };
  const boardsOfEvent = eventBoardTotals(registrations);
  const cards = [
    { key: 'all', Icon: IconUsers, label: T.CARD_REGISTERED, value: registrations.length, kind: 'all' },
    ...(hidden ? [] : [{ key: 'paid', Icon: IconCheck, label: T.CARD_PAID, value: paidCount, kind: 'filter' }]),
    { key: 'broke', Icon: IconHammer, label: T.CARD_BROKE, value: brokeCount, kind: 'filter' },
    ...(hidden ? [] : [{ key: 'collected', Icon: IconSum, label: T.CARD_COLLECTED, value: formatMoney(collected), note: T.collectedNote(formatMoney(due)), kind: 'total' }]),
    // The boards of the SELECTED class tab (the whole class, never the filtered rows) with the whole event under each. They are totals,
    // not buttons, and not money, so they stay while Hide private details is on. (breaking-roster.css tints the last two cards.)
    { key: 'techBoards', Icon: IconStack2, label: T.CARD_TECHNICAL, value: boardsOfClass.tech, note: T.wholeEvent(boardsOfEvent.tech), kind: 'total' },
    { key: 'adultBoards', Icon: IconStack3, label: T.CARD_ADULT, value: boardsOfClass.adult, note: T.wholeEvent(boardsOfEvent.adult), kind: 'total' },
  ];
  const popoverRow = popover ? registrations.find((r) => r.id === popover.rowId) ?? null : null;

  // ===== The ⋯ menu =====
  const menuRow = menu ? registrations.find((r) => r.id === menu.row.id) ?? menu.row : null;
  function menuContent() {
    if (!menu || !menuRow) return null;
    const anchor = menu.anchor;
    const row = menuRow;
    const name = fullName(row);
    const h = {
      onEdit: () => openStudentDialog('edit', row, anchor),
      onMove: () => openDialog({ type: 'move', row, opener: anchor }),
      onHistory: () => openDialog({ type: 'history', row, opener: anchor }),
      onUndoPayment: () => {
        const payment = standingPayment(row);
        if (payment) openDialog({ type: 'undoPayment', row, payment, name, saving: false, failed: false, opener: anchor });
      },
      onEditPayment: () => {
        const payment = standingPayment(row);
        if (payment) openDialog({ type: 'editPayment', row, payment, opener: anchor });
      },
      onRecordRefund: () => openDialog({ type: 'refund', row, opener: anchor }),
      onUndoRefund: () => {
        const refunds = standingRefunds(row);
        const payment = refunds[refunds.length - 1];
        if (payment) openDialog({ type: 'undoRefund', row, payment, name, saving: false, failed: false, opener: anchor });
      },
      onDelete: () => openDialog({ type: 'delete', row, opener: anchor }),
    };
    return {
      title: name,
      subtitle: T.rowSub(row.age, rankLabel(row.rankName), row.techBoards, row.adultBoards),
      label: T.moreFor(name),
      items: rosterMenuItems(row, { isAdmin, busy, hidden, h }),
    };
  }
  function closeMenu(reason) {
    const anchor = menu?.anchor;
    setMenu(null);
    if ((reason === 'escape' || reason === 'tab') && anchor?.isConnected) anchor.focus();
  }

  // ===== The roster's handlers =====
  const handlers = {
    onMarkPaid: (row, anchor) => {
      clearToast();
      setMenu(null);
      setPopover({ anchor, rowId: row.id });
    },
    onBroke: (row) => doBroke(row),
    onMore: (row, anchor) => {
      setPopover(null);
      setMenu((current) => (current?.row.id === row.id ? null : { row, anchor }));
    },
  };

  // ===== What to draw =====
  const backLink = <BackLink label={T.BACK_LABEL} ariaLabel={`Back to ${T.BACK_LABEL}`} onClick={onBack} />;
  if (!event && (live.status === 'loading' || live.status === 'idle' || live.status === 'noAccess')) {
    return (
      <div className="brk-ev">
        {backLink}
        <div className="clist tskeleton ev-page-skeleton" aria-busy="true">
          <span className="visually-hidden">{T.LOADING_EVENT}</span>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="tskeleton-row" aria-hidden="true">
              <span className="tskeleton-bar" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (live.status === 'notFound') {
    return (
      <div className="brk-ev">
        {backLink}
        <p className="tempty">{T.EVENT_GONE}</p>
      </div>
    );
  }
  if (!event) {
    return (
      <div className="brk-ev">
        {backLink}
        <PageBar text={T.LOAD_EVENT_FAILED} onRetry={() => liveRef.current.reload()} />
      </div>
    );
  }

  // The open dialog (never while locked: it comes back after the PIN; what was typed in it is not kept).
  let dialogElement = null;
  if (dialog && !screenLocked) {
    const common = { isPhone, onNoAccess, onRefreshProfile, showToast, clearToast };
    const d = dialog;
    if (d.type === 'student') {
      dialogElement = (
        <StudentDialog
          key={d.key}
          mode={d.mode}
          event={event}
          classes={event.classes}
          settings={settings}
          chart={chart}
          registration={d.row}
          isAdmin={isAdmin}
          onClose={closeDialog}
          defaultClassId={selectedClass?.id ?? null}
          onSaved={(info) => {
            if (info?.classId) setClassSel(info.classId); // show the class the student is in (Color belt does the same)
            dialogDone();
          }}
          {...common}
        />
      );
    } else if (d.type === 'move') {
      dialogElement = <MoveToClassDialog key={d.key} registration={d.row} classes={event.classes} onClose={closeDialog} onSaved={(info) => {
        if (info?.classId) setClassSel(info.classId); // the moved student's class opens
        dialogDone();
      }} {...common} />;
    } else if (d.type === 'history') {
      dialogElement = <StudentHistoryDialog key={d.key} registration={d.row} isPhone={isPhone} onClose={closeDialog} onNoAccess={onNoAccess} />;
    } else if (d.type === 'delete') {
      dialogElement = (
        <DeleteStudentConfirm
          key={d.key}
          registration={d.row}
          onClose={closeDialog}
          onDeleted={() => {
            setDialog(null);
            reloadQuiet();
            focusRowIfLost(null);
            showToast(T.deletedToast(fullName(d.row)), { icon: false });
          }}
          onNoAccess={onNoAccess}
          onRefreshProfile={onRefreshProfile}
        />
      );
    } else if (d.type === 'refund') {
      dialogElement = <RefundDialog key={d.key} registration={d.row} deviceLocation={deviceLocation} onClose={closeDialog} onDone={() => dialogDone()} {...common} />;
    } else if (d.type === 'editPayment') {
      dialogElement = (
        <EditPaymentDialog key={d.key} registration={d.row} payment={d.payment} deviceLocation={deviceLocation} onClose={closeDialog} onDone={() => dialogDone()} {...common} />
      );
    } else if (d.type === 'square') {
      dialogElement = <SquareReviewDialog key={d.key} items={needsLook} onClose={closeDialog} onDismissed={() => reloadQuiet()} {...common} />;
    } else if (d.type === 'link') {
      dialogElement = (
        <RegistrationLink
          key={d.key}
          event={event}
          isPhone={isPhone}
          onCopied={() => showToast(T.LINK_COPIED, { icon: false })}
          onClose={closeDialog}
        />
      );
    } else if (d.type === 'undoPayment' || d.type === 'undoRefund') {
      const isPayment = d.type === 'undoPayment';
      const money = formatMoney(Math.abs(d.payment.amountCents));
      const way = payingByLabel(d.payment.method).toLowerCase();
      dialogElement = (
        <ConfirmBox
          key={d.key}
          title={isPayment ? undoPaymentTitle(d.name, money, way) : T.undoRefundTitle(d.name, money)}
          keepLabel={isPayment ? T.KEEP_PAYMENT : T.KEEP_REFUND}
          actionLabel={isPayment ? T.UNDO_PAYMENT : T.UNDO_REFUND}
          actionIcon={IconArrowBackUp}
          busyLabel={T.UNDOING}
          loses="something"
          busy={d.saving}
          failed={d.failed ? (isPayment ? T.UNDO_PAYMENT_FAILED : T.UNDO_REFUND_FAILED) : null}
          onConfirm={() => confirmUndo(isPayment ? 'payment' : 'refund')}
          onKeep={closeDialog}
        >
          {isPayment ? T.undoPaymentBody(d.name) : T.undoRefundBody(d.name)}
        </ConfirmBox>
      );
    }
  }

  const content = menuContent();
  const squareBox = isAdmin && !hidden && needsLook.length > 0
    ? (
      <DuplicateBox
        countText={T.squareCount(needsLook.length)}
        pairs={[{ key: 'square', text: T.SQUARE_LINE, onReview: (opener) => openDialog({ type: 'square', opener }) }]}
      />
    ) : null;
  const addStudent = (
    <button type="button" className="btn btn-primary" data-add-student onClick={(e) => openStudentDialog('add', undefined, e.currentTarget)}>
      <IconPlus size={16} aria-hidden="true" />
      {T.ADD_STUDENT}
    </button>
  );

  return (
    <div className="brk-ev">
      {backLink}
      {banner && (
        <PageBar
          text={banner.text}
          onRetry={banner.retry ? () => banner.retry() : undefined}
          retrying={Boolean(banner.retrying) || busy}
          onDismiss={() => setBanner(null)}
          takeFocus={Boolean(banner.takeFocus)}
        />
      )}
      <div className="phead ev-phead">
        <div className="phead-titles">
          <h1 className="ptitle">{event.name}</h1>
          <p className="ev-summary">{T.eventSummary(event.eventDate, event.locationCode, registrations.length)}</p>
          <RegistrationSwitch open={event.registrationOpen} isAdmin={isAdmin} busy={busy} onChange={doRegistration} />
        </div>
        <div className="ev-head-buttons">
          {addStudent}
          <button type="button" className="btn" data-event-link onClick={(e) => openDialog({ type: 'link', opener: e.currentTarget })}>
            {/* ti-qrcode = registration link / QR code */}
            <IconQrcode size={16} aria-hidden="true" />
            {T.REGISTRATION_LINK}
          </button>
        </div>
      </div>
      {squareBox}
      {hasStudents && <CountCards cards={cards} selected={shownFilter} onSelect={setFilter} showingText={shownFilter === 'paid' ? T.SHOWING_PAID : T.SHOWING_BROKE} />}
      {hasStudents && (
        <div className={`cp-search${query ? ' has-text' : ''}`}>
          <IconSearch size={16} aria-hidden="true" className="cp-search-icon" />
          <input
            className="input cp-search-input"
            type="search"
            placeholder={T.FIND_STUDENT}
            aria-label={T.FIND_STUDENT}
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && <IconButton label={T.CLEAR_SEARCH} Icon={IconX} className="cp-search-clear" onClick={() => setQuery('')} />}
        </div>
      )}
      {!hasStudents ? (
        <p className="tempty">{T.NO_STUDENTS}</p>
      ) : classes.length === 0 ? (
        <p className="tempty">{T.NO_CLASSES_IN_EVENT}</p>
      ) : (
        <>
          {/* The class switch, copied from Color belt testing (EventPage.jsx there): one button per class with its count; the
              chosen one is gray. A radio group (arrow keys move and choose), not a tab list — Color belt's is the same. */}
          <span id={classLabelId} className="visually-hidden">
            {T.CLASS_SWITCH_LABEL}
          </span>
          <div className="ev-class-switch">
            <ChoiceGroup
              labelId={classLabelId}
              value={selectedClass?.id ?? null}
              onChange={setClassSel}
              options={classes.map((cls) => {
                const count = countOnTab(cls);
                return {
                  key: cls.id,
                  label: `${cls.name} ${count}`,
                  content: (
                    <>
                      <span className="ev-cs-name">{cls.name}</span>
                      <span className="ev-cs-count">{count}</span>
                    </>
                  ),
                };
              })}
            />
          </div>
          {filtering && shownCount === 0 ? (
            <p className="ev-filter-line cards-showing cp-nomatch">
              {q !== '' ? T.noMatch(query.trim()) : shownFilter === 'paid' ? T.SHOWING_PAID : T.SHOWING_BROKE} ·{' '}
              <button
                type="button"
                className="link-button inline-link"
                onClick={() => {
                  setQuery('');
                  setFilter(null);
                }}
              >
                {T.CLEAR_FILTERS}
              </button>
            </p>
          ) : (
            <>
              <p className="ev-classline">
                <strong>{T.classLineTitle(selectedClass.name, classTimes(selectedClass))}</strong>
                <span>{T.groupCount(classAll.length, classAll.filter((r) => r.broke).length)}</span>
                {matchesElsewhere > 0 && <span className="ttag">{T.moreInOtherClasses(matchesElsewhere)}</span>}
              </p>
              {/* The second, small line: the same class's boards, by kind (the numbers are bold) */}
              {classAll.length > 0 && (
                <p className="ev-classline brk-boardsline">
                  <span>
                    <b>{boardsOfClass.tech}</b> {T.COL_TECHNICAL} {T.CLASS_BOARDS_SEPARATOR} <b>{boardsOfClass.adult}</b> {T.CLASS_BOARDS_ADULT_SUFFIX}
                  </span>
                </p>
              )}
              {classRows.length === 0 ? (
                <p className="tempty">{T.NO_STUDENTS_IN_CLASS}</p>
              ) : (
                <Roster rows={classRows} isPhone={rosterStacked} hidden={hidden} busy={busy} notSavedId={notSavedId} handlers={handlers} />
              )}
            </>
          )}
        </>
      )}
      {popover && popoverRow && !hidden && !screenLocked && (
        // The shared Mark paid box: the amount still owed, Paid by preset to the student's way, and where that
        // choice was made ("on the form", or "at the desk" once staff changed it).
        <MarkPaidBox
          anchor={popover.anchor}
          name={fullName(popoverRow)}
          amountCents={owedCents(popoverRow) - paidCents(popoverRow)}
          familyChoice={popoverRow.payingBy}
          choiceWhere={popoverRow.payingBy === popoverRow.payingByOnForm ? 'form' : 'desk'}
          onMarkPaid={(method) => doMarkPaid(popoverRow, method)}
          onClose={(refocus) => {
            const anchor = popover.anchor;
            setPopover(null);
            if (refocus && anchor?.isConnected) anchor.focus();
          }}
        />
      )}
      {content && <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />}
      {dialogElement}
    </div>
  );
}

// "Registration  [Open | Closed]" — a switch for admins, plain words for staff (changing it is an admin's job).
function RegistrationSwitch({ open, isAdmin, busy, onChange }) {
  const labelId = 'brk-reg-label';
  return (
    <div className="brk-regline">
      <span id={labelId} className="field-label">
        {T.REGISTRATION}
      </span>
      {isAdmin ? (
        <ChoiceGroup
          labelId={labelId}
          options={[{ key: 'open', label: T.OPEN }, { key: 'closed', label: T.CLOSED }]}
          value={open ? 'open' : 'closed'}
          onChange={(key) => onChange(key === 'open')}
          variant="segmented"
          readOnly={busy}
          compact
        />
      ) : (
        <span className="brk-regline-value">{open ? T.OPEN : T.CLOSED}</span>
      )}
    </div>
  );
}
