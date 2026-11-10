// CandidatesTab.jsx — the Candidates tab of a Black Belt testing cycle's page.
// Why it exists: contract CONTRACT-0016-B2 §3.2, approved mockups Candidates 1–7 and 9. Top to
// bottom, on every size (R3-10, v1.047 (15): one order above every roster):
//   - the amber possible-duplicate box with Review (the shared DuplicateBox)
//   - the count cards that filter the list (the shared CountCards, BB15: four plan cards, two by
//     two on phones; the gray note about duplicates left out; "Showing late only · Show all").
//     Hide private details on: ONE Candidates card instead of the money cards (v1.046 (9)).
//     Nobody registered yet (at the shown school): no cards at all (C-05 (a))
//   - (one school on the location switcher) "Showing Worcester candidates only · Show both
//     schools", drawn as the shared "Showing … only" line (R3-05)
//   - Find a candidate (tablet: the full width; its ✕ is the shared icon button), and on the PC the
//     caption "9 candidates · Dan, then school, then last name" right beside it. When nobody
//     matches, one gray line replaces the list: 'No candidates match "x". · Clear search'
//   - the roster (RosterRows.jsx) with each row's ⋯ menu, and the Removed group at the bottom.
//     A count card that leaves nobody says what is true for that card (C-05 (b)); an empty roster
//     is one gray line that names Add candidate (v1.028), with no search box and no table head
//   - every dialog: the candidate detail and what opens from it (useCandidateActions.js decides)
// "+ Add candidate" sits in the cycle page's header (CyclePage.jsx); through `actionsRef` it opens
// a small menu here (contract 0025 §14.5, mockup G06 proposal 24): "New candidate" (the desk
// dialog) and "Make-up from an earlier cycle…" (MakeupPickerDialog.jsx); phones get the same two
// items as a bottom sheet with Cancel. A make-up just added glows pale amber for a moment.
// Make-up rows have no fee: they are left out of the four money cards and their filters, and
// their ⋯ has no Record payment, Change plan or refund (G 27).
// The row ⋯ (v0.963, mockup A option 2; the order of v1.011): three groups with a line between —
// Edit details · Change plan or Kukkiwon — Record payment (tablets / phones) · Edit payment ·
// Undo payment · Record refund · Print receipt (only with a payment or refund that still stands,
// M-03 / v1.055 (b); never while hidden) — Withdraw · Delete permanently. A withdrawn row:
// Record refund · Print receipt (same rule: a removed person's money still counts) — Restore —
// Delete permanently (its own line, C-04 / v1.055). A row
// marked "Possible duplicate" has no Record payment (R3-02) until the pair is resolved. For an
// admin, a row with payment rows is read first (Edit / Undo payment act on the LATEST payment,
// which the row doesn't carry).
//
// The tab draws no bar of its own for a problem: its saves fill the cycle page's one bar, a PageBar under
// the top bar (CyclePage.jsx, v1.128). The one bar it draws itself, "couldn't load", is a PageBar too. The
// candidate detail keeps its own bar INSIDE the detail while it is open (CandidateDialog.jsx, v0.966 / v1.128).
//
// It follows the location switcher (v0.118): on Worcester or Shrewsbury the list, the cards and
// the duplicate box show that school only; Both shows everyone. With the device's Hide payments
// switch on (v0.215, OP-B7) there is only the Candidates card, no money columns and no payment actions, and
// nothing in a ⋯ tells who has paid (R1-04, R4-01 / v1.036): on EVERY row, for admins and staff,
// Change plan or Kukkiwon is grayed "Change the plan at the desk." and (admins) Delete
// permanently is grayed "Delete candidates at the desk."; Edit details opens (R4-04, v1.037). The
// Add candidate menu opens too: New candidate is grayed inside it with Star's reason, and
// "Make-up from an earlier cycle…" keeps working.
// The list reloads by itself (useLiveLoad): on open, after every own change, when the screen
// unlocks or the browser tab comes back, and quietly every 15 seconds — never touching an open
// dialog or what someone is typing.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import CompareDialog from '../../../components/CompareDialog.jsx';
import CountCards from '../../../components/CountCards.jsx';
import DuplicateBox from '../../../components/DuplicateBox.jsx';
import PageBar from '../../../components/PageBar.jsx';
import IconButton from '../../../components/IconButton.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { loadRoster, schoolToday } from '../../../lib/blackBelt/api.js';
import { duplicatePairs, rosterCards, rosterFilter } from '../../../lib/blackBelt/rules.js';
import { usePrivateDetailsHidden } from '../../../lib/privateDetails.js';
import { PHONE_QUERY, WIDE_QUERY, TOUCH_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { useRowArrowNav } from '../../../lib/useRowArrowNav.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../lib/useLiveLoad.js';
import CandidateReceipt from '../receipt/CandidateReceipt.jsx';
import { focusCurrentTab } from '../parts/focusCurrentTab.js';
import { useBarFocusReturn } from '../parts/useBarFocusReturn.js';
import AddCandidateDialog from './AddCandidateDialog.jsx';
import CandidateDialog, { lineWords } from './CandidateDialog.jsx';
import ChangePlanDialog from './ChangePlanDialog.jsx';
import { compareRows } from './compareRows.js';
import DanChangeDialog from './DanChangeDialog.jsx';
import MakeupPickerDialog from './MakeupPickerDialog.jsx';
import MakeupSubjectsDialog from '../grading/MakeupSubjectsDialog.jsx';
import EditPaymentDialog from './EditPaymentDialog.jsx';
import RecordPaymentDialog from './RecordPaymentDialog.jsx';
import RefundDialog from './RefundDialog.jsx';
import DeleteConfirm from './DeleteConfirm.jsx';
import ReturnedDialog from './ReturnedDialog.jsx';
import RosterRows from './RosterRows.jsx';
import SignatureDialog from './SignatureDialog.jsx';
import UndoPaymentDialog from './UndoPaymentDialog.jsx';
import { useCandidateActions } from './useCandidateActions.js';
import { useMakeupPicker } from './useMakeupPicker.js';
import { canRecordPayment, isMoneyChild, printReceiptOffered, rosterCardList, rosterEmptyText } from './checks.js';
import { ICONS } from './icons.js';
import * as T from '../text.js';

const load = (cycleId) => loadRoster({ cycleId });
const SCHOOL_CODE = { Worcester: 'worcester', Shrewsbury: 'shrewsbury' };
const FLASH_MS = 2500; // how long a just-added make-up row glows (G06 "pale amber for a moment")

// The candidate's latest payment (v0.963): the live 'payment' line recorded most recently. The
// detail's payments list holds live lines only. "Most recently recorded" is recordedAt (the moment
// it was saved; an edited payment is a new row with a new recordedAt and the old paidOn), not
// paidOn (the day the family paid, which an admin may have set to an earlier day). Ties: the later
// paidOn, then the higher id, so the choice never depends on the list's order.
function latestPayment(payments) {
  const time = (p) => Date.parse(p.recordedAt) || 0;
  let best = null;
  for (const p of payments ?? []) {
    if (p.kind !== 'payment') continue;
    if (!best) best = p;
    else {
      const later = time(p) - time(best) || String(p.paidOn ?? '').localeCompare(String(best.paidOn ?? '')) || String(p.id).localeCompare(String(best.id));
      if (later > 0) best = p;
    }
  }
  return best;
}

// A grayed menu item with its reason under it ("$330 is already paid. Ask an admin.")
function TwoLines({ label, reason }) {
  return (
    <span className="ev-menu-two">
      <span>{label}</span>
      <span className="ev-menu-reason">{reason}</span>
    </span>
  );
}

export default function CandidatesTab({
  cycle,
  isAdmin,
  location = 'Both',
  onLocationChange,
  deviceLocation, // This device's school: where a payment or refund counts (R1-01)
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalChange,
  onCandidatesChanged,
  setPageBanner,
  actionsRef,
  panelId,
  tabId,
}) {
  const live = useLiveLoad({ key: cycle.id, enabled: !screenLocked, load, refreshMs: LIVE_REFRESH_MS });
  const rows = useMemo(() => live.data?.rows ?? [], [live.data]);
  // C5: "couldn't load" is a PageBar drawn from the load's status (this tab's other problems are the cycle page's
  // bar, which has its own call): when its Retry works, focus goes to the tab.
  useBarFocusReturn(live.status === 'error' || live.status === 'notFound', focusCurrentTab);
  const today = schoolToday();
  const [hidden] = usePrivateDetailsHidden();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const layout = { isPhone, isWide: isWide && !isPhone, isTouch };

  const [search, setSearch] = useState('');
  // Clear search (the ✕ and the "Clear search" link): empty the box, then put the keyboard back in
  // it — the control that was pressed disappears, and focus would otherwise fall to the page.
  const searchInputRef = useRef(null);
  const clearSearch = useCallback(() => {
    setSearch('');
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);
  const [card, setCard] = useState(null);
  const [removedOpen, setRemovedOpen] = useState(false);
  const [menu, setMenu] = useState(null); // { row, anchor, data } — data: the candidate as read for an admin's ⋯, else null
  // The amber bar (v0.966, BB4) is the cycle page's ONE bar (CyclePage.jsx draws it above the tab):
  // one bar at a time, and changing tabs or cycles clears it. While the candidate detail is open,
  // useCandidateActions puts its problems inside the detail instead. Retry clears the bar first and
  // a retry that fails puts it back, so only × or a Retry that works closes it.
  const setBanner = useCallback(
    (next) => setPageBanner(next && typeof next === 'object' && next.retry ? { ...next, retry: () => { setPageBanner(null); next.retry(); } } : next),
    [setPageBanner],
  );
  // Whether the screen is locked right now, for an answer that arrives later (the row ⋯'s read)
  const lockedRef = useRef(screenLocked);
  useLayoutEffect(() => {
    lockedRef.current = screenLocked;
  });

  const reloadRoster = useCallback(() => live.reload(), [live]);
  const actions = useCandidateActions({
    cycle,
    isAdmin,
    today,
    paymentsHidden: hidden,
    deviceLocation,
    reloadRoster,
    onCandidatesChanged,
    showToast,
    clearToast,
    onNoAccess,
    onRefreshProfile,
    setBanner,
  });
  const { dlg } = actions;

  // A make-up just added glows for a moment (G06)
  const [flashId, setFlashId] = useState(null);
  const flashTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  const flash = useCallback((id) => {
    window.clearTimeout(flashTimer.current);
    setFlashId(id);
    flashTimer.current = window.setTimeout(() => setFlashId(null), FLASH_MS);
  }, []);
  const picker = useMakeupPicker({ cycle, isAdmin, reloadRoster, onCandidatesChanged, showToast, clearToast, onNoAccess, onRefreshProfile, onAdded: flash, setBanner, saveLine: actions.saveLine, paymentsHidden: hidden });

  // The page header's "+ Add candidate" (and N) open the Add candidate menu (G 24) through this.
  const schoolCode = SCHOOL_CODE[location] ?? null;
  const [addMenu, setAddMenu] = useState(null); // { anchor }
  const anyOpen = Boolean(dlg) || picker.isOpen;
  useLayoutEffect(() => {
    if (!actionsRef) return undefined;
    actionsRef.current = {
      openAdd: (opener) => {
        if (anyOpen) return;
        setAddMenu((current) => (current ? null : { anchor: opener ?? null }));
      },
      isOpen: anyOpen,
    };
    return () => {
      actionsRef.current = null;
    };
  });

  // Tell the cycle page (and through it the App) when a dialog is on screen.
  const modalShown = anyOpen && !screenLocked;
  useEffect(() => {
    onModalChange(modalShown);
  }, [modalShown, onModalChange]);
  useEffect(() => () => onModalChange(false), [onModalChange]);

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);
  // The screen locked: menus close and the signature picture is dropped (useCandidateActions).
  const { screenLockedNow, paymentsHiddenNow } = actions;
  useEffect(() => {
    if (!screenLocked) return;
    setMenu(null);
    setAddMenu(null);
    screenLockedNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenLocked]);
  // Hide payments switched on (mat-side): the cards are gone, so is their filter; every money
  // dialog (and Change plan) closes and a money toast is cleared; Edit details stays open with its
  // date of birth and email turning gray (useCandidateActions).
  useEffect(() => {
    if (!hidden) return;
    setCard(null);
    paymentsHiddenNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  // ----- What the list shows -----
  const school = location ?? 'Both';
  // Make-ups have no fee, so they aren't in the money cards or their filters (G 27)
  const counts = useMemo(() => rosterCards(rows.filter((r) => !r.isMakeup), { school }), [rows, school]);
  // Everyone registered at the shown school(s), active or removed: none → no cards (C-05 (a), as
  // Star's hasAny); and how many are active (the Candidates card while private details are hidden)
  const inSchool = useMemo(() => rosterFilter(rows, { school }), [rows, school]);
  const hasAny = inSchool.length > 0;
  const activeTotal = useMemo(() => inSchool.filter((r) => r.status === 'active').length, [inSchool]);
  const cardList = rosterCardList({ counts, total: activeTotal, hidden, hasAny });
  // While hidden there is no card filter: a card chosen just before the switch turned on must not
  // filter even one frame of the list (the effect above clears it a moment later; P3).
  const activeCard = hidden ? null : card;
  const shown = useMemo(() => rosterFilter(rows, { school, card: activeCard, search }).filter((r) => !activeCard || !r.isMakeup), [rows, school, activeCard, search]);
  const activeRows = shown.filter((r) => r.status === 'active');
  const removedRows = activeCard ? [] : shown.filter((r) => r.status === 'withdrawn');
  const pairs = useMemo(() => duplicatePairs(rosterFilter(rows, { school })), [rows, school]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const partnerOf = (row) => (row.duplicateOf ? rowById.get(row.duplicateOf) ?? null : rows.find((r) => r.duplicateOf === row.id && r.status === 'active') ?? null);

  const rowKeys = [...activeRows, ...(removedOpen ? removedRows : [])].map((r) => r.id);
  const nav = useRowArrowNav({
    rowKeys,
    onOpen: (key) => {
      const element = document.querySelector(`[data-nav-row="${CSS.escape(key)}"]`);
      actions.openDetail(key, element);
    },
  });

  // ----- The row ⋯ menu (only what this person may do; contract §3.2, v0.963) -----
  // Three groups in a fixed order; what doesn't apply is left out, the rest keep their order, and
  // a group's first item gets the line above it only when an earlier group has items.
  // Print receipt (BB2 / M-03): only with a payment or refund that still stands, active or
  // withdrawn; never while hidden. An admin's ⋯ that read the candidate first knows the live lines
  // exactly; every other ⋯ goes by the row's own money facts (see printReceiptOffered).
  function offersPrint(row, loaded) {
    return printReceiptOffered({
      hidden,
      isMakeup: row.isMakeup === true,
      lines: loaded?.payments ?? null,
      paidCents: row.money?.paidCents ?? 0,
      hasPaymentRows: row.hasPaymentRows,
      tag: row.money?.tag ?? null,
    });
  }
  function rowMenuItems(row, loaded = null) {
    const name = T.candidateName(row);
    const m = row.money ?? {};
    const target = { id: row.id, firstName: row.firstName, lastName: row.lastName, version: row.version, hasPaymentRows: row.hasPaymentRows, hasGrades: row.hasGrades, withdrawnReason: row.withdrawnReason };
    const anchor = menu?.anchor;
    const makeup = row.isMakeup === true;
    const about = [];
    const money = [];
    const off = [];
    if (row.status === 'withdrawn') {
      if (isAdmin && !hidden && !makeup && m.paidCents > 0) money.push({ key: 'refund', label: T.RECORD_REFUND, Icon: ICONS.refund, onSelect: () => actions.openRefund(row.id, anchor) });
      if (offersPrint(row, loaded)) money.push({ key: 'print', label: T.PRINT_RECEIPT, Icon: ICONS.print, onSelect: () => actions.openReceipt(row.id, anchor) });
      if (isAdmin) {
        off.push({ key: 'restore', label: T.RESTORE, Icon: ICONS.restore, disabled: actions.busy, onSelect: () => actions.restore(target, anchor) });
        // Payment records, and (0025, Q-G3 v0.950) grades, block deleting (the short reason: they
        // are already withdrawn). Hidden: the same desk line on every row (R1-04).
        const reason = hidden ? T.DELETE_AT_DESK : row.hasPaymentRows ? T.hasPaymentRecordsShort(name) : row.hasGrades ? T.hasGradesShort(name) : null;
        // Delete permanently gets its own group, so a line sits between it and Restore (C-04, v1.055 (f))
        return joinGroups(about, money, off, [deleteItem(reason, target, anchor)]);
      }
      return joinGroups(about, money, off);
    }

    // (1) About the person.
    // Edit details opens also with Hide private details on (R4-04, v1.037, as Star's): there the
    // date of birth and email read the gray "Hidden on this tablet".
    about.push({
      key: 'edit',
      label: T.EDIT_DETAILS,
      Icon: ICONS.editDetails,
      onSelect: () => actions.openDetail(row.id, anchor, { edit: true }),
    });
    // Staff can change the plan only until a payment is recorded — the database's rule is "any
    // live payment row", even one whose check bounced or that a refund cancelled out, so the paid
    // total alone can't tell. The row knows whether any payment row exists (hasPaymentRows) and,
    // through its "Not paid" tag, that none is live; grayed when a row exists and the tag isn't
    // Not paid (the database still decides: not_allowed). The detail's ⋯ checks the live lines.
    // Hide private details on (R1-04, R4-01 / v1.036): the plan is desk-only — grayed on EVERY
    // row, for admins and staff alike, with a line that names no payment.
    const planLocked = hidden || (!isAdmin && (m.paidCents > 0 || (row.hasPaymentRows && m.tag !== 'not_paid')));
    const planReason = hidden ? T.CHANGE_PLAN_AT_DESK : !(m.paidCents > 0) ? T.PAYMENT_RECORDED_ASK_ADMIN : T.alreadyPaidAskAdmin(m.paidCents);
    // A make-up has no plan: no Change plan (G 27)
    if (!makeup) {
      about.push({
        key: 'plan',
        label: planLocked ? <TwoLines label={T.CHANGE_PLAN} reason={planReason} /> : T.CHANGE_PLAN,
        Icon: ICONS.changePlan,
        disabled: planLocked,
        onSelect: () => actions.openChangePlan(row.id, anchor),
      });
    }

    // (2) Money. Record payment first — on tablets and phones only (on a PC it is the row's button).
    // A possible duplicate offers no Record payment until the pair is resolved (R3-02, v1.046 (8)).
    if (!hidden && canRecordPayment({ isMakeup: makeup, duplicateState: row.duplicateState }) && !layout.isWide && m.balanceCents > 0) money.push({ key: 'record', label: T.RECORD_PAYMENT, Icon: ICONS.recordPayment, onSelect: () => actions.openRecordPayment(row.id, anchor) });
    // Edit payment / Undo payment (admins): the LATEST live payment (older ones: each payment
    // line's ⋯ in the detail), grayed with the detail's reasons (CandidateDialog lineItems).
    const latest = isAdmin && !hidden && !makeup ? latestPayment(loaded?.payments) : null;
    if (latest) {
      const refundActive = loaded.payments.some((p) => p.kind === 'refund');
      const editReason = latest.returned ? T.RETURNED_FIRST : refundActive ? T.REFUND_FIRST : null;
      const what = lineWords(latest, loaded.payments, loaded.candidate.plan).what;
      money.push({
        key: 'editPayment',
        label: editReason ? <TwoLines label={T.EDIT_PAYMENT} reason={editReason} /> : T.EDIT_PAYMENT,
        Icon: ICONS.editPayment,
        disabled: Boolean(editReason),
        onSelect: () => actions.openEditPayment(latest, anchor, loaded),
      });
      money.push({
        key: 'undoPayment',
        label: latest.returned ? <TwoLines label={T.UNDO_PAYMENT} reason={T.RETURNED_FIRST} /> : T.UNDO_PAYMENT,
        Icon: ICONS.undo,
        disabled: latest.returned,
        onSelect: () => actions.openUndoPayment(latest, what, anchor, loaded),
      });
    }
    if (isAdmin && !hidden && !makeup && m.overpaidCents > 0) {
      // bb-menu-fit: "Record refund · $50 overpaid" is a little wider than the 200 px menu (blackBelt.css)
      money.push({ key: 'refund', label: <span className="bb-menu-fit">{T.RECORD_REFUND} <span className="bb-menu-keep">{T.overpaidPart(m.overpaidCents)}</span></span>, Icon: ICONS.refund, onSelect: () => actions.openRefund(row.id, anchor) });
    }
    if (offersPrint(row, loaded)) money.push({ key: 'print', label: T.PRINT_RECEIPT, Icon: ICONS.print, onSelect: () => actions.openReceipt(row.id, anchor) });

    // (3) Taking someone off (admins, v1.007): Withdraw is plain and acts at once (with Undo);
    // Delete permanently is red and asks first, grayed with what to do instead (v0.904, v0.950).
    // Hidden: grayed on every row with the desk line, so it can't tell who has paid (R1-04).
    if (isAdmin) {
      off.push({ key: 'withdraw', label: T.WITHDRAW, Icon: ICONS.withdraw, disabled: actions.busy, onSelect: () => actions.withdraw(target, anchor) });
      const reason = hidden ? T.DELETE_AT_DESK : row.hasPaymentRows ? T.hasPaymentRecords(name) : row.hasGrades ? T.hasGrades(name) : null;
      off.push(deleteItem(reason, target, anchor));
    }
    return joinGroups(about, money, off);
  }
  // Delete permanently: red when it can be used, else grayed with its reason under it
  function deleteItem(reason, target, anchor) {
    return {
      key: 'delete',
      label: reason ? <TwoLines label={T.DELETE_PERMANENTLY} reason={reason} /> : T.DELETE_PERMANENTLY,
      Icon: ICONS.deleteForever,
      danger: !reason,
      disabled: Boolean(reason),
      onSelect: () => actions.openDelete(target, anchor),
    };
  }
  // The groups one after the other, a line before each group that follows one with items
  function joinGroups(...groups) {
    const items = [];
    for (const group of groups) {
      group.forEach((item, index) => items.push(index === 0 && items.length > 0 ? { ...item, separatorBefore: true } : item));
    }
    return items;
  }

  // Pressing a row's ⋯: pressing it again closes the menu. An admin's ⋯ for a candidate who may
  // have payments (payment rows, payments shown, not a make-up) reads the candidate first
  // (actions.loadForMenu, with the detail's problem handling) and opens when it arrives; while it
  // loads the tab is busy, so another press does nothing, and that row's ⋯ shows busy
  // (actions.menuLoading). If the read fails, the bar's Retry reads the same candidate again and the
  // menu opens when it works (R4-11). Everyone else's opens at once.
  function openRowMenu(row, anchor) {
    if (menu?.row?.id === row.id) {
      setMenu(null);
      return;
    }
    const needsLoad = isAdmin && row.status === 'active' && row.hasPaymentRows && !hidden && !row.isMakeup;
    if (!needsLoad) {
      setMenu({ row, anchor, data: null });
      return;
    }
    // Only a menu that has to read first waits for another write to finish (the read uses the same
    // busy guard); every other ⋯ opens at once, as before.
    if (actions.busy) return;
    setMenu(null);
    actions.loadForMenu(row.id, (data) => {
      if (lockedRef.current) return; // the screen locked meanwhile: no menu behind the lock
      // the row left the screen meanwhile (a search, the school switch, Removed closed): no menu
      // hanging off a button that isn't there, and no focus to give back
      if (!anchor?.isConnected) return;
      setMenu((current) => current ?? { row, anchor, data });
    });
  }

  const ctx = {
    layout,
    nav,
    hidden,
    busy: actions.busy,
    menuLoading: actions.menuLoading, // the row whose ⋯ is reading the candidate first (R4-11): its ⋯ shows busy
    menuFor: menu?.row?.id ?? null,
    flashId,
    hasMenu: (row) => rowMenuItems(row).length > 0,
    onOpen: (row, element) => actions.openDetail(row.id, element),
    onMore: (row, anchor) => openRowMenu(row, anchor),
    onRecord: (row, opener) => actions.openRecordPayment(row.id, opener),
    onReview: (row, opener) => actions.openCompare(row, partnerOf(row), opener),
  };

  // ----- Loading and errors -----
  if (live.status === 'loading' || live.status === 'idle' || live.status === 'noAccess') {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="tpanel">
        <div className="clist tskeleton" aria-busy="true">
          <span className="visually-hidden">{T.LOADING_CANDIDATES}</span>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="tskeleton-row" aria-hidden="true">
              <span className="tskeleton-bar" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (live.status === 'error' || live.status === 'notFound') {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="tpanel">
        <PageBar text={T.LOAD_FAILED} onRetry={() => live.reload()} />
      </div>
    );
  }

  const searchText = search.trim();
  // What an empty list says: the search, or what is true for the chosen card (C-05 (b)), or the
  // empty-roster line that names Add candidate
  const emptyText = rosterEmptyText({ searchText, card: activeCard });
  // The count cards (BB15): the data from checks.js, the icons from icons.js
  const CARD_ICON = { all: ICONS.cardCandidates, paidInFull: ICONS.cardPaidInFull, onSchedule: ICONS.cardOnSchedule, late: ICONS.cardLate, notPaid: ICONS.cardNotPaid };
  // Nobody at all matches the search (no active row and nothing in Removed): the roster gives way
  // to the one "No candidates match … · Clear search" line (R3-09).
  const searchMissing = Boolean(searchText) && activeRows.length === 0 && removedRows.length === 0;
  const SearchIcon = ICONS.search;
  const ClearIcon = ICONS.clear;

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="tpanel bb-candidates">
      {/* The one order above every roster (R3-10, v1.047 (15)), on every size: the duplicate box,
          the count cards with their "Showing … only" line, the one-school line, the search, then
          the table. The shared duplicate box: the count on the first line only; each Review passes
          itself, so focus returns to it when the compare closes. */}
      <DuplicateBox
        countText={T.possibleDuplicates(pairs.length)}
        pairs={pairs.map(({ row, partner }) => {
          const name = T.candidateName(row);
          return {
            key: row.id,
            text: T.registeredTwice(name, row.dan),
            reviewLabel: T.reviewDuplicateLabel(name),
            canReview: Boolean(partner), // the other copy is at the other school: nothing to compare here
            onReview: (opener) => !actions.busy && actions.openCompare(row, partner, opener),
          };
        })}
      />
      {/* The shared count cards (v1.013 / v1.107): the four plan cards filter the list; two by two
          on phones. Possible duplicates stay out of them, with the gray note under the row. No
          cards while nobody is registered (C-05 (a)). */}
      <CountCards
        cards={cardList.cards.map((c) => ({ ...c, Icon: CARD_ICON[c.key] }))}
        selected={activeCard}
        onSelect={setCard}
        showingText={activeCard ? T.SHOWING_FILTER[activeCard] : ''}
        showAllLabel={T.SHOW_ALL}
        note={cardList.note}
      />
      {/* The shared "Showing … only" line (R3-05, v1.117): an inline link with an invisible 44px tap
          box, which only works inside .cards-showing */}
      {schoolCode && (
        <p className="ev-filter-line cards-showing">
          {T.showingSchoolOnly(location)} ·{' '}
          <button type="button" className="link-button inline-link" onClick={() => onLocationChange?.('Both')}>
            {T.SHOW_BOTH_SCHOOLS}
          </button>
        </p>
      )}
      {!hasAny ? (
        // Nobody registered at the shown school(s): one gray line that names the button (v1.028)
        <p className="tempty ev-empty">{T.NO_CANDIDATES}</p>
      ) : (
      <>
      <div className={`bb-list-bar${layout.isWide ? ' is-wide' : ''}`}>
        {/* A div, not a label: the ✕ is the shared icon button (tooltip "Clear search", R3-09), and a
            button inside a label would be read as part of the box's name. */}
        <div className="bb-search">
          <SearchIcon size={16} aria-hidden="true" className="bb-search-icon" />
          <input ref={searchInputRef} type="search" className="bb-search-input" placeholder={T.FIND_CANDIDATE} aria-label={T.FIND_CANDIDATE} value={search} maxLength={80} autoComplete="off" onChange={(event) => setSearch(event.target.value)} />
          {search && <IconButton label={T.CLEAR_SEARCH} Icon={ClearIcon} className="bb-search-clear" onClick={clearSearch} />}
        </div>
        {layout.isWide && <p className="bb-caption">{T.listCaption(activeRows.length)}</p>}
      </div>

      {/* The search found nobody: one gray line in the roster's place, drawn like the cards'
          "Showing … only · Show all" line (the shared .ev-filter-line.cards-showing, whose touch
          rules give the link its 44px tap area; as Camps' roster, R3-09). */}
      {searchMissing ? (
        <p className="ev-filter-line cards-showing bb-nomatch">
          {emptyText} ·{' '}
          <button type="button" className="link-button inline-link" onClick={clearSearch}>
            {T.CLEAR_SEARCH}
          </button>
        </p>
      ) : (
        <RosterRows
          rows={activeRows}
          removedRows={removedRows}
          removedOpen={removedOpen}
          onToggleRemoved={() => setRemovedOpen(!removedOpen)}
          emptyText={emptyText}
          caption={T.listCaption(activeRows.length)}
          ctx={ctx}
        />
      )}
      </>
      )}

      {/* The row ⋯ (its subtitle while hidden: Dan and school only, no plan words — v1.036) */}
      {menu && !screenLocked && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={T.candidateName(menu.row)}
          subtitle={hidden ? T.danSchool(menu.row.dan, menu.row.locationCode) : T.phoneSubline(menu.row)}
          label={T.moreForCandidate(T.candidateName(menu.row))}
          items={rowMenuItems(menu.row, menu.data)}
          onClose={(reason) => {
            const anchor = menu.anchor;
            setMenu(null);
            if (reason === 'escape' || reason === 'tab') anchor?.focus();
          }}
        />
      )}

      {addMenu && !screenLocked && (
        <RowMenu
          anchor={addMenu.anchor}
          isSheet={isPhone}
          title={T.ADD_CANDIDATE}
          subtitle={cycle.name}
          label={T.ADD_CANDIDATE}
          items={[
            // ti-user-plus / ti-history (G 24). Hide private details on (R4-04, v1.037, Star's
            // v0.507 Q1): New candidate is grayed with Star's reason (it stays focusable, so a
            // screen reader hears why); Make-up from an earlier cycle keeps working.
            hidden
              ? { key: 'new', label: <span className="bb-add-menu-item"><TwoLines label={T.NEW_CANDIDATE} reason={T.NEW_CANDIDATE_HIDDEN} /></span>, Icon: ICONS.newCandidate, disabled: true, onSelect: () => {} }
              : { key: 'new', label: <span className="bb-add-menu-item">{T.NEW_CANDIDATE}</span>, Icon: ICONS.newCandidate, onSelect: () => actions.openAdd(addMenu.anchor, schoolCode) },
            { key: 'makeup', label: <span className="bb-add-menu-item">{T.MAKEUP_ITEM}</span>, Icon: ICONS.makeup, onSelect: () => picker.open(addMenu.anchor) },
          ]}
          onClose={(reason) => {
            const anchor = addMenu.anchor;
            setAddMenu(null);
            if (reason === 'escape' || reason === 'tab') anchor?.focus();
          }}
        />
      )}

      {!screenLocked && dlg && <Dialogs actions={actions} cycle={cycle} isAdmin={isAdmin} isPhone={isPhone} hidden={hidden} today={today} onNoAccess={onNoAccess} />}
      {!screenLocked && !dlg && picker.state && <Picker picker={picker} cycle={cycle} isAdmin={isAdmin} isPhone={isPhone} onNoAccess={onNoAccess} />}
    </div>
  );
}

// The make-up picker, or (admins) Grading's Choose subjects dialog opened from one of its rows.
function Picker({ picker, cycle, isAdmin, isPhone, onNoAccess }) {
  const s = picker.state;
  if (s.choose) {
    const row = s.choose.row;
    return (
      <MakeupSubjectsDialog
        candidate={{ id: row.id, firstName: row.firstName, lastName: row.lastName }}
        result={s.choose.result}
        rubric={s.choose.rubric}
        isAdmin={isAdmin}
        isPhone={isPhone}
        onClose={() => picker.closeChoose()}
        onNoAccess={onNoAccess}
      />
    );
  }
  return (
    <MakeupPickerDialog
      state={s}
      cycle={cycle}
      isAdmin={isAdmin}
      isPhone={isPhone}
      onSearch={picker.setSearch}
      onAdd={picker.add}
      onChoose={picker.openChoose}
      onRetry={picker.retry}
      onClose={picker.close}
    />
  );
}

// The one dialog on screen: a child (Record payment, …) or else the detail.
function Dialogs({ actions, cycle, isAdmin, isPhone, hidden, today, onNoAccess }) {
  const { dlg } = actions;
  const c = dlg.child;
  // Belt and braces (P1): while Hide private details is on, no money dialog is ever drawn, whatever
  // opened it. Under it the detail (if any) shows.
  if (hidden && c && isMoneyChild(c.kind)) return dlg.detail ? <CandidateDialog actions={actions} cycle={cycle} isAdmin={isAdmin} isPhone={isPhone} hidden={hidden} today={today} onNoAccess={onNoAccess} /> : null;
  const common = { state: c, cycle, isPhone, today, onChange: actions.changeChild, onCancel: actions.closeChild, onRequestClose: actions.requestCloseChild };
  if (c) {
    switch (c.kind) {
      case 'record':
        return <RecordPaymentDialog {...common} onTicks={actions.setTicks} onSave={actions.saveRecordPayment} />;
      case 'editPayment':
        return <EditPaymentDialog {...common} onTicks={(ticks) => actions.changeChild({ ticks })} onSave={actions.saveEditPayment} />;
      case 'undo':
        return <UndoPaymentDialog {...common} onConfirm={actions.confirmUndoPayment} />;
      case 'refund':
        return <RefundDialog {...common} onSave={actions.saveRefund} />;
      case 'returned':
        return <ReturnedDialog {...common} onSave={actions.saveReturned} />;
      case 'plan':
        return <ChangePlanDialog {...common} isAdmin={isAdmin} hidden={hidden} onSave={actions.saveChangePlan} />;
      case 'add':
        return <AddCandidateDialog {...common} hidden={hidden} onSave={actions.saveAdd} />;
      case 'deleteConfirm':
        return <DeleteConfirm {...common} onConfirm={actions.confirmDelete} />;
      case 'danChange':
        return <DanChangeDialog state={c} onConfirm={actions.confirmDanChange} onCancel={actions.closeChild} />;
      case 'compare': {
        // The shared compare (BB15, v1.102): our rows and words; the shared dialog marks the
        // differences, says "Keeping…" on the pressed button and shows a failure under the buttons.
        const heads = [T.FIRST_REGISTRATION, T.SECOND_REGISTRATION];
        const busyKind = c.saving ? c.busyKind ?? 'keep-first' : null;
        return (
          <CompareDialog
            title={T.compareTitle(T.candidateName(c.first.candidate))}
            sub={T.COMPARE_SUB}
            heads={heads}
            rows={compareRows(c.first, c.second, { hidden })}
            note={T.COMPARE_NOTE}
            busy={busyKind}
            failed={c.failed ? T.SAVE_FAILED : c.blocking ? null : c.note}
            blockingNote={c.blocking ? c.note : null}
            onKeep={(index) => (index === 0 ? actions.resolve(c.first, c.second, false) : actions.resolve(c.second, c.first, false))}
            onKeepBoth={() => actions.resolve(c.first, c.second, true)}
            onClose={actions.closeChild}
            isPhone={isPhone}
          />
        );
      }
      case 'signature':
        return <SignatureDialog {...common} onRetry={actions.retrySignature} />;
      case 'receipt':
        return (
          <CandidateReceipt
            candidateId={c.candidateId}
            cycle={cycle}
            isPhone={isPhone}
            onClose={actions.closeChild}
            onNoAccess={onNoAccess}
            kukkiwonAddedOn={c.kukkiwonDates?.kukkiwonAddedOn ?? null}
            registeredOn={c.kukkiwonDates?.registeredOn ?? null}
          />
        );
      default:
        return null;
    }
  }
  if (dlg.detail) return <CandidateDialog actions={actions} cycle={cycle} isAdmin={isAdmin} isPhone={isPhone} hidden={hidden} today={today} onNoAccess={onNoAccess} />;
  return null;
}
