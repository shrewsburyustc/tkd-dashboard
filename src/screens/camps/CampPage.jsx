// CampPage.jsx — one camp's page (C4 header + v0.704 option A: three tabs, one job each).
// Why it exists: the camp is where the desk works — at the door (who's here?), at the counter (who
// owes?) and at the end of the week (who came?). Address #camps/camp/<id> (App.jsx), so browser
// Back returns to the Camps list. Top to bottom:
//   - "← Camps", the camp name and its status tag, and one line: days · hours · school · campers
//   - header buttons: Registration link (the one blue button, ti-qrcode → CampLinkDialog) and ⋯
//     (Edit camp (admin) · Close / Reopen sign-up · Save as template (admin) · Print roster ·
//     Delete camp (admin) — CampRowMenu.jsx)
//   - tabs: Check in · Payments · <to-collect count> · Attendance. The page opens on Check in during
//     camp week, otherwise on Payments (campRules.defaultCampTab); the address keeps the tab.
//   - the tab: CheckInTab.jsx, PaymentsTab.jsx or AttendanceTab.jsx
// Every name opens Camper detail (CamperDialog.jsx). The page reloads quietly every 15 seconds
// (useLiveLoad), so family sign-ups and check-ins on another device show up by themselves.
// Every change goes to the database (src/lib/camps/campsApi.js) and the page reloads after it.
// Reversible changes get a 5-second Undo toast; permanent ones ask first (rule 1.4). Staff and
// admins see different ⋯ items (CamperRowMenu.jsx); the database enforces the same rules.
//
// There is no Add camper button: campers only come in through the family form (C4).
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconDots, IconQrcode } from '@tabler/icons-react';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import { LOCATION_NAME } from '../../lib/device.js';
import IconButton from '../../components/IconButton.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import {
  changePayingBy,
  checkIn,
  deleteCamper,
  editPayment,
  loadCamp,
  loadCamperDetail,
  markPaid,
  resolveDuplicate,
  restoreCamper,
  undoCheckIn,
  undoPayment,
  withdrawCamper,
  campToday,
} from '../../lib/camps/campsApi.js';
import { paymentSchoolFor, campTag, defaultCampTab, defaultCheckInDay, lastDay, payTag, signupState } from '../../lib/camps/campRules.js';
import { PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import { useRowArrowNav } from '../../lib/useRowArrowNav.js';
import ConfirmDeleteDialog from '../testing/events/ConfirmDeleteDialog.jsx';
import { LIVE_REFRESH_MS, useLiveLoad } from '../testing/events/useLiveLoad.js';
import AttendanceTab from './AttendanceTab.jsx';
import CampDialog from './CampDialog.jsx';
import CampLinkDialog from './CampLinkDialog.jsx';
import CamperDialog from './CamperDialog.jsx';
import { camperMenuItems, checkInMenuItems } from './CamperRowMenu.jsx';
import { useCampActions } from './CampRowMenu.jsx';
import CheckInTab from './CheckInTab.jsx';
import CompareDialog from './CompareDialog.jsx';
import { findPairs } from './DuplicateBox.jsx';
import MarkPaidDialog from './MarkPaidDialog.jsx';
import { EditPaymentDialog, PayingByDialog } from './PaymentDialogs.jsx';
import PaymentsTab from './PaymentsTab.jsx';
import * as T from './text.js';

const TABS = ['checkin', 'payments', 'attendance'];
// The chosen check-in day and the Removed group open / closed, per camp, while the page is open.
const dayByCamp = new Map();
const removedOpenByCamp = new Map();

const byName = (a, b) =>
  a.lastName.localeCompare(b.lastName, 'en', { sensitivity: 'base' }) || a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' });
const byDay = (a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);

// The payment that counts right now: the camper's latest payment that hasn't been reversed.
function activePayment(payments) {
  const reversed = new Set((payments ?? []).filter((p) => p.kind === 'reversal').map((p) => p.reversesPaymentId));
  const live = (payments ?? []).filter((p) => p.kind === 'payment' && !reversed.has(p.id));
  return live.sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : 1))[live.length - 1] ?? null;
}

// Gives focus back to an element once the page behind a closed dialog is usable again (it stays
// "inert" for a moment after the dialog closes).
function focusSoon(find) {
  let tries = 0;
  const step = () => {
    const element = typeof find === 'function' ? find() : find;
    if (element && element.isConnected && element.closest('[inert]') && tries < 30) {
      tries += 1;
      window.requestAnimationFrame(step);
      return;
    }
    if (element && element.isConnected) element.focus();
  };
  window.requestAnimationFrame(step);
}

export default function CampPage({
  campId,
  locationKey,
  isAdmin,
  tab: requestedTab,
  onTab,
  onBack,
  followSchool = false, // opened from a Finance payment: show the camp on its own school instead of leaving
  onLocationChange = null,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
}) {
  const live = useLiveLoad({ key: campId, enabled: !screenLocked, load: loadCamp, refreshMs: LIVE_REFRESH_MS });
  const data = live.data;
  const camp = data?.camp ?? null;
  const days = (data?.days ?? []).map((d) => ({ dayId: d.dayId ?? d.id, day: d.day })).sort(byDay);
  const prices = data?.prices ?? [];
  const extras = data?.extras ?? [];
  const roster = data?.roster ?? [];
  const today = data?.today ?? campToday();
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });

  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const layout = { isPhone, isTouch, isWide };
  const baseId = useId();
  const tabIds = { tab: (key) => `${baseId}-tab-${key}`, panel: (key) => `${baseId}-panel-${key}` };

  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null); // { id, anchor, row, kind: 'camper' | 'checkin' | 'header' }
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notSavedId, setNotSavedId] = useState(null);
  const [query, setQuery] = useState('');
  const [removedOpen, setRemovedOpenState] = useState(() => removedOpenByCamp.get(campId) ?? true);
  const [checkInDayId, setCheckInDayIdState] = useState(() => dayByCamp.get(campId) ?? null);
  const busyRef = useRef(false);

  function setRemovedOpen(open) {
    removedOpenByCamp.set(campId, open);
    setRemovedOpenState(open);
  }
  function setCheckInDayId(id) {
    dayByCamp.set(campId, id);
    setCheckInDayIdState(id);
    setQuery('');
  }

  // ----- One change at a time -----
  function begin() {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }
  function end(status) {
    busyRef.current = false;
    setBusy(false);
    if (status && status !== 'ok') clearToast();
  }

  async function reloadQuiet() {
    const result = await liveRef.current.reload();
    if (result === 'error') setBanner({ text: T.LOAD_CAMP_FAILED, retry: retryLoad });
    return result;
  }
  async function retryLoad() {
    const result = await liveRef.current.reload();
    if (result === 'ok') setBanner(null);
  }
  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  // The camp isn't for the chosen school (the switcher was changed, or a link from the other
  // school's device): back to the list, which shows only that school's camps (+ both-schools ones).
  const wrongSchool = camp !== null && locationKey !== 'both' && camp.locationCode !== locationKey && !camp.bothSchools;
  // Opened from a Finance payment ("Open in Camps", review L3): the switcher may be on the school
  // where the money was paid; move it once to the camp's own school and stay on the page.
  const followedRef = useRef(false);
  useEffect(() => {
    if (!wrongSchool) return;
    if (followSchool && onLocationChange && !followedRef.current) {
      followedRef.current = true;
      onLocationChange(LOCATION_NAME[camp.locationCode]);
    } else onBack({ replace: true });
  }, [wrongSchool, onBack, followSchool, onLocationChange, camp]);

  const actions = useCampActions({
    isAdmin,
    today,
    screenLocked,
    showToast,
    clearToast,
    onNoAccess,
    onRefreshProfile,
    setBanner,
    reload: reloadQuiet,
    onDeleted: () => onBack({ replace: true }),
  });

  // Locking closes menus; dialogs only hide (they come back after the PIN).
  useEffect(() => {
    if (screenLocked) setMenu(null);
  }, [screenLocked]);
  const modalShown = (dialog !== null || actions.dialogOpen) && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);
  // The camp was deleted elsewhere: close whatever was open.
  useEffect(() => {
    if (live.status !== 'notFound') return;
    setDialog(null);
    setMenu(null);
  }, [live.status]);

  // ===== Derived =====
  const active = roster.filter((r) => r.status === 'active').sort(byName);
  const removed = roster.filter((r) => r.status !== 'active').sort(byName);
  const pairs = findPairs(active);
  const toCollectCount = active.filter((r) => payTag(r) !== 'paid').length;
  const tab = TABS.includes(requestedTab) ? requestedTab : camp ? defaultCampTab(days, today) : 'payments';
  const checkDay = days.find((d) => d.dayId === checkInDayId) ?? defaultCheckInDay(days, today);
  const state = camp ? signupState(camp, days, today) : null;

  function switchTab(next) {
    if (next === tab) return;
    setMenu(null);
    onTab(next);
  }
  function handleTabKeyDown(event) {
    const index = TABS.indexOf(tab);
    let next = null;
    if (event.key === 'ArrowRight') next = TABS[(index + 1) % TABS.length];
    else if (event.key === 'ArrowLeft') next = TABS[(index - 1 + TABS.length) % TABS.length];
    else if (event.key === 'Home') next = TABS[0];
    else if (event.key === 'End') next = TABS[TABS.length - 1];
    if (!next) return;
    event.preventDefault();
    switchTab(next);
    document.getElementById(tabIds.tab(next))?.focus();
  }

  // ===== Dialogs =====
  function openDialog(next) {
    clearToast();
    setMenu(null);
    setDialog({ key: Date.now(), ...next });
  }
  function closeDialog() {
    const opener = dialog?.opener ?? null;
    setDialog(null);
    if (opener) focusSoon(opener);
  }

  // ===== Undo and row problems (as Color Belt's event page) =====
  async function runUndo(call, options = {}) {
    if (!begin()) return;
    const result = await call();
    end(result.status);
    const status = result.status;
    if (status === 'ok') {
      setBanner((current) => (current?.kind === 'undo' ? null : current));
      showToast(T.TOAST_UNDONE, { icon: false });
      reloadQuiet();
    } else if (status === 'no_access') onNoAccess();
    else if (status === 'not_allowed') {
      setBanner({ text: options.notAllowedText ?? T.ROSTER_NOT_ALLOWED });
      onRefreshProfile();
    } else if (status === 'error') {
      setBanner({ kind: 'undo', text: T.UNDO_FAILED, retry: () => runUndo(call, options) });
    } else {
      setBanner({ text: T.UNDO_STALE });
      reloadQuiet();
    }
  }
  function rowProblem(status, row, retry) {
    const name = T.camperLabel(row);
    if (status === 'no_access') onNoAccess();
    else if (status === 'not_allowed') {
      setBanner({ text: retry.notAllowedText ?? T.ROSTER_NOT_ALLOWED });
      onRefreshProfile();
      reloadQuiet();
    } else if (status === 'already_paid') {
      setBanner({ text: T.alreadyPaid(name) });
      reloadQuiet();
    } else if (status === 'withdrawn') {
      setBanner({ text: T.isWithdrawn(name) });
      reloadQuiet();
    } else if (status === 'error') {
      // Didn't reach the database: the row shows "Not saved" and the banner offers Retry.
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

  // ===== Mark paid: one click, the full amount owed (Color Belt plan answer 6) =====
  // The payment goes to the Daily report of the school whose desk took the money (v0.707): the
  // switcher's school. On Both, a single-school camp uses its own school; a both-schools camp asks
  // "Paid at which school?" first (MarkPaidDialog).
  function doMarkPaid(row) {
    const school = paymentSchoolFor(camp, locationKey);
    if (school) doMarkPaidAt(row, school);
    else openDialog({ type: 'paidAt', row, opener: document.activeElement });
  }
  async function doMarkPaidAt(row, school) {
    if (!begin()) return;
    const result = await markPaid(row.id, row.version, school);
    end(result.status);
    const name = T.camperLabel(row);
    if (result.status === 'invalid' && result.field === 'school') {
      setBanner({ text: T.SCHOOL_REFUSED }); // (review L4)
      return;
    }
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.markPaidFailed(name), run: () => doMarkPaidAt(row, school) });
      return;
    }
    rowDone();
    reloadQuiet();
    const paymentId = result.paymentId;
    showToast(T.markedPaidToast(name, result.amountCents, result.method), {
      icon: false,
      // Staff may undo their own payment within 10 seconds (§1.14); after that it's an admin's job.
      action: { label: T.UNDO, onAction: () => runUndo(() => undoPayment(paymentId), { notAllowedText: T.UNDO_PAYMENT_TOO_LATE }) },
    });
  }

  // ===== Withdraw / Restore (staff and admins, v0.700) =====
  async function doWithdraw(row, restore = false) {
    if (!begin()) return;
    const call = restore ? restoreCamper : withdrawCamper;
    const result = await call(row.id, row.version);
    end(result.status);
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.actionFailed, run: () => doWithdraw(row, restore) });
      return;
    }
    rowDone();
    reloadQuiet();
    const name = T.camperLabel(row);
    const newVersion = result.version;
    const back = restore ? withdrawCamper : restoreCamper;
    showToast(restore ? T.restoredToast(name) : T.withdrawnToast(name), {
      icon: false,
      action: { label: T.UNDO, onAction: () => runUndo(() => back(row.id, newVersion)) },
    });
  }

  // ===== Undo payment from ⋯ (admins, any time) =====
  async function doUndoPayment(row) {
    if (!row.lastPaymentId || !begin()) return;
    const result = await undoPayment(row.lastPaymentId);
    end(result.status);
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.actionFailed, run: () => doUndoPayment(row) });
      return;
    }
    rowDone();
    reloadQuiet();
    showToast(T.paymentUndoneToast(T.camperLabel(row)), { icon: false });
  }

  // ===== Check in / Undo check-in (v0.704) =====
  async function doCheckIn(row, day) {
    if (!begin()) return;
    const result = await checkIn(row.id, day.dayId);
    end(result.status);
    const name = T.camperLabel(row);
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.checkInFailed(name), run: () => doCheckIn(row, day) });
      return;
    }
    rowDone();
    reloadQuiet();
    showToast(T.checkedInToast(name, result.checkedInAt ?? new Date().toISOString()), {
      icon: false,
      action: { label: T.UNDO, onAction: () => runUndo(() => undoCheckIn(row.id, day.dayId)) },
    });
    // Keyboard: the next "Not here yet" Check in button, so a queue at the door is quick.
    focusSoon(() => document.querySelector('[data-checkin-btn]'));
  }
  async function doUndoCheckIn(row) {
    const day = checkDay;
    if (!day || !begin()) return;
    const result = await undoCheckIn(row.id, day.dayId);
    end(result.status);
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.undoCheckInFailed(T.camperLabel(row)), run: () => doUndoCheckIn(row) });
      return;
    }
    rowDone();
    reloadQuiet();
    showToast(T.checkInUndoneToast(T.camperLabel(row)), { icon: false });
  }

  // ===== Dialog openers =====
  function openCamper(row, opener = null, startInEdit = false) {
    openDialog({ type: 'camper', camperId: row.id, camperName: T.camperLabel(row), startInEdit, opener: opener ?? document.activeElement });
  }
  function openCompareFor(row, opener) {
    const pair = pairs.find((p) => p.first.id === row.id || p.second.id === row.id);
    if (pair) openDialog({ type: 'compare', pair, saving: false, failed: false, opener });
  }
  async function startEditPayment(row, opener) {
    if (!isAdmin || !begin()) return;
    const result = await loadCamperDetail(row.id);
    end(result.status === 'ok' ? 'ok' : result.status);
    if (result.status === 'no_access') {
      onNoAccess();
      return;
    }
    const payment = result.status === 'ok' ? activePayment(result.payments) : null;
    if (!payment) {
      setBanner({ text: result.status === 'error' ? T.LOAD_CAMPER_FAILED : T.ROSTER_STALE });
      reloadQuiet();
      return;
    }
    openDialog({ type: 'payment', row, payment, opener });
  }
  async function startDeleteCamper(row, opener) {
    if (!isAdmin || !begin()) return;
    const result = await loadCamperDetail(row.id);
    end(result.status === 'ok' ? 'ok' : result.status);
    if (result.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (result.status !== 'ok') {
      setBanner({ text: result.status === 'error' ? T.LOAD_CAMPER_FAILED : T.ROSTER_STALE });
      reloadQuiet();
      return;
    }
    const payments = result.payments ?? [];
    const counted = activePayment(payments);
    const name = T.camperLabel(result.camper);
    openDialog({
      type: 'deleteCamper',
      name,
      title: T.deleteCamperTitle(name),
      body: T.deleteCamperBody(camp.name, counted ? [counted] : []),
      args: [row.id, result.camper.version, payments.map((p) => p.id)],
      saving: false,
      failed: false,
      opener,
    });
  }
  async function confirmDeleteCamper() {
    const d = dialog;
    if (!d || d.saving || !begin()) return;
    setDialog({ ...d, saving: true, failed: false });
    const result = await deleteCamper(...d.args);
    end(result.status);
    if (result.status === 'ok') {
      setDialog(null);
      showToast(T.deletedToast(d.name), { icon: false }); // permanent: no Undo
      reloadQuiet();
    } else if (result.status === 'error') {
      setDialog((current) => (current ? { ...current, saving: false, failed: true } : current));
    } else {
      setDialog(null);
      if (result.status === 'no_access') onNoAccess();
      else setBanner({ text: result.status === 'not_allowed' ? T.ROSTER_NOT_ALLOWED : T.ROSTER_STALE });
      if (result.status === 'not_allowed') onRefreshProfile();
      reloadQuiet();
    }
  }

  // ===== Possible duplicate: keep one / keep both (C4b) =====
  async function keepOne(keep, other) {
    const d = dialog;
    if (!d || d.saving || !begin()) return;
    setDialog({ ...d, saving: true, failed: false });
    const result = await resolveDuplicate({ keepId: keep.id, keepVersion: keep.version, otherId: other.id, otherVersion: other.version, keepBoth: false });
    end(result.status);
    if (result.status === 'error') {
      setDialog((current) => (current ? { ...current, saving: false, failed: true } : current));
      return;
    }
    setDialog(null);
    if (result.status !== 'ok') {
      if (result.status === 'no_access') onNoAccess();
      else setBanner({ text: result.status === 'not_allowed' ? T.ROSTER_NOT_ALLOWED : T.ROSTER_STALE });
      if (result.status === 'not_allowed') onRefreshProfile();
      reloadQuiet();
      return;
    }
    reloadQuiet();
    const otherVersion = result.otherVersion;
    // Undo = Restore the copy. Staff may do it within 10 seconds (§1.14), admins any time.
    showToast(T.duplicateRemovedToast(T.camperLabel(other)), {
      icon: false,
      action: { label: T.UNDO, onAction: () => runUndo(() => restoreCamper(other.id, otherVersion), { notAllowedText: T.UNDO_DUPLICATE_TOO_LATE }) },
    });
  }
  async function keepBoth() {
    const d = dialog;
    if (!d || d.saving || !begin()) return;
    const { first, second } = d.pair;
    setDialog({ ...d, saving: true, failed: false });
    const result = await resolveDuplicate({ keepId: first.id, keepVersion: first.version, otherId: second.id, otherVersion: second.version, keepBoth: true });
    end(result.status);
    if (result.status === 'error') {
      setDialog((current) => (current ? { ...current, saving: false, failed: true } : current));
      return;
    }
    setDialog(null);
    if (result.status !== 'ok') {
      if (result.status === 'no_access') onNoAccess();
      else setBanner({ text: result.status === 'not_allowed' ? T.ROSTER_NOT_ALLOWED : T.ROSTER_STALE });
      reloadQuiet();
      return;
    }
    reloadQuiet();
    showToast(T.TOAST_KEPT_BOTH, { icon: false });
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

  // ===== Menus =====
  function openMenu(kind, row, anchor) {
    // A phone sheet covers the bottom of the screen: the toast would float over it (review item 9).
    if (isPhone) clearToast();
    setMenu((current) => (current && current.id === (row?.id ?? 'header') && current.kind === kind ? null : { id: row?.id ?? 'header', row, anchor, kind }));
  }
  function closeMenu(reason) {
    const current = menu;
    setMenu(null);
    if (current && (reason === 'escape' || reason === 'tab')) current.anchor?.focus();
  }
  const camperHandlers = {
    onPayingBy: (row, anchor) => openDialog({ type: 'paying', row, opener: anchor }),
    onEdit: (row, anchor) => openCamper(row, anchor, true),
    onReview: (row, anchor) => openCompareFor(row, anchor),
    onWithdraw: (row) => doWithdraw(row),
    onRestore: (row) => doWithdraw(row, true),
    onEditPayment: (row, anchor) => startEditPayment(row, anchor),
    onUndoPayment: (row) => doUndoPayment(row),
    onDelete: (row, anchor) => startDeleteCamper(row, anchor),
  };
  function menuContent() {
    if (!menu || screenLocked || !camp) return null;
    if (menu.kind === 'header') {
      return {
        title: camp.name,
        subtitle: T.campDatesText(days.map((d) => d.day)),
        label: T.MORE_CAMP_ACTIONS,
        items: actions.items(camp, days, {
          includeEdit: true,
          onEdit: (c, anchor) => openDialog({ type: 'editCamp', opener: anchor }),
          anchor: menu.anchor,
          onPrint: () => actions.printLoaded(data),
        }),
      };
    }
    const row = menu.row;
    const name = T.camperLabel(row);
    const items =
      menu.kind === 'checkin'
        ? checkInMenuItems(row, { busy, onUndoCheckIn: doUndoCheckIn })
        : camperMenuItems(row, { isAdmin, busy, anchor: menu.anchor, h: camperHandlers });
    return { title: name, subtitle: T.camperPayLine(T.camperDaysText(row, days), row.payingBy), label: T.moreFor(name), items };
  }

  // ===== Keyboard on the Payments rows =====
  const toCollect = active.filter((r) => payTag(r) !== 'paid');
  const paid = active.filter((r) => payTag(r) === 'paid');
  const navKeys = [...toCollect, ...paid, ...(removedOpen ? removed : [])].map((r) => r.id);
  const nav = useRowArrowNav({
    rowKeys: navKeys,
    onOpen: (id) => {
      const row = roster.find((r) => r.id === id);
      if (row) openCamper(row, document.activeElement);
    },
  });

  // ===== Drawing =====
  const backLink = (
    <button type="button" className="link-button ev-back" onClick={() => onBack()}>
      {/* ti-arrow-left = back */}
      <IconArrowLeft size={16} aria-hidden="true" />
      {T.BACK_TO_CAMPS}
    </button>
  );
  if (live.status === 'loading' || live.status === 'idle' || live.status === 'noAccess' || wrongSchool) {
    return (
      <>
        {backLink}
        <div className="clist tskeleton ev-page-skeleton" aria-busy="true">
          <span className="visually-hidden">{T.LOADING_CAMP}</span>
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
        <p className="tempty">{T.CAMP_GONE}</p>
      </>
    );
  }
  if (live.status === 'error' || !camp) {
    return (
      <>
        {backLink}
        <ErrorBanner text={T.LOAD_CAMP_FAILED} onRetry={() => liveRef.current.reload()} />
      </>
    );
  }

  const tag = campTag(camp, days, today);
  const ctx = {
    layout,
    nav,
    isAdmin,
    busy,
    menuFor: menu?.kind === 'camper' ? menu.id : null,
    selectedId: dialog && !screenLocked ? (dialog.camperId ?? dialog.row?.id ?? null) : null,
    notSavedId,
    campDays: days,
    handlers: {
      onOpen: (row) => openCamper(row),
      onMore: (row, anchor) => openMenu('camper', row, anchor),
      onMarkPaid: (row) => doMarkPaid(row),
      onReview: (row, anchor) => openCompareFor(row, anchor),
    },
  };

  // ----- The open dialog (never while locked: it comes back after unlocking) -----
  let dialogElement = null;
  if (dialog) {
    const hidden = screenLocked;
    if (dialog.type === 'camper') {
      // CamperDialog keeps its own values: mounted while locked, drawn only when unlocked.
      dialogElement = (
        <CamperDialog
          key={dialog.key}
          camperId={dialog.camperId}
          camperName={dialog.camperName}
          camp={camp}
          days={days}
          prices={prices}
          extras={extras}
          isPhone={isPhone}
          hidden={hidden}
          startInEdit={dialog.startInEdit}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            reloadQuiet();
            showToast(T.TOAST_CHANGES_SAVED, { icon: false });
          }}
          onNoAccess={onNoAccess}
          onRefreshProfile={onRefreshProfile}
        />
      );
    } else if (dialog.type === 'editCamp') {
      dialogElement = (
        <CampDialog
          key={dialog.key}
          mode="edit"
          campId={campId}
          defaultLocation={locationKey}
          isPhone={isPhone}
          hidden={hidden}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            reloadQuiet();
            showToast(T.TOAST_CAMP_SAVED, { icon: false });
          }}
          onNoAccess={onNoAccess}
          onRefreshProfile={onRefreshProfile}
          onUndoResult={() => {}}
        />
      );
    } else if (!hidden && dialog.type === 'link') {
      dialogElement = (
        <CampLinkDialog
          key={dialog.key}
          camp={camp}
          state={state}
          isPhone={isPhone}
          onCopy={copyLink}
          onDownloadFailed={() => setBanner({ text: T.DOWNLOAD_FAILED })}
          onClose={closeDialog}
        />
      );
    } else if (!hidden && dialog.type === 'paying') {
      const row = dialog.row;
      dialogElement = (
        <PayingByDialog
          key={dialog.key}
          name={T.camperLabel(row)}
          initial={row.payingBy}
          isPhone={isPhone}
          onClose={closeDialog}
          onSave={async (payingBy) => {
            const result = await changePayingBy(row.id, row.version, payingBy);
            if (result.status === 'ok') {
              closeDialog();
              reloadQuiet();
              const newVersion = result.version;
              showToast(T.TOAST_CHANGES_SAVED, {
                icon: false,
                action: { label: T.UNDO, onAction: () => runUndo(() => changePayingBy(row.id, newVersion, row.payingBy)) },
              });
            } else if (result.status === 'no_access') onNoAccess();
            else if (result.status !== 'error') reloadQuiet();
            return result.status;
          }}
        />
      );
    } else if (!hidden && dialog.type === 'payment') {
      dialogElement = (
        <EditPaymentDialog
          key={dialog.key}
          name={T.camperLabel(dialog.row)}
          payment={dialog.payment}
          today={today}
          isPhone={isPhone}
          onClose={closeDialog}
          onSave={async (values) => {
            const result = await editPayment(dialog.payment.id, values);
            if (result.status === 'invalid' && result.field === 'school') return 'invalid_school';
            if (result.status === 'ok') {
              closeDialog();
              reloadQuiet();
              showToast(T.TOAST_PAYMENT_SAVED, { icon: false });
            } else if (result.status === 'no_access') onNoAccess();
            else if (result.status === 'not_allowed') onRefreshProfile();
            return result.status;
          }}
        />
      );
    } else if (!hidden && dialog.type === 'compare') {
      const first = roster.find((r) => r.id === dialog.pair.first.id) ?? dialog.pair.first;
      const second = roster.find((r) => r.id === dialog.pair.second.id) ?? dialog.pair.second;
      const last = lastDay(days);
      dialogElement = (
        <CompareDialog
          key={dialog.key}
          first={first}
          second={second}
          campDays={days}
          isPhone={isPhone}
          saving={dialog.saving}
          failed={dialog.failed}
          // After the camp's last day, keeping one is admin-only (Color Belt v0.194).
          canKeepOne={isAdmin || last === null || today <= last}
          onKeep={keepOne}
          onKeepBoth={keepBoth}
          onClose={closeDialog}
        />
      );
    } else if (!hidden && dialog.type === 'paidAt') {
      dialogElement = (
        <MarkPaidDialog
          key={dialog.key}
          row={dialog.row}
          onClose={closeDialog}
          onConfirm={(school) => {
            const row = dialog.row;
            closeDialog();
            doMarkPaidAt(row, school);
          }}
        />
      );
    } else if (!hidden && dialog.type === 'deleteCamper') {
      dialogElement = (
        <ConfirmDeleteDialog
          key={dialog.key}
          title={dialog.title}
          body={dialog.body}
          hint={T.DELETE_CAMPER_HINT}
          keepLabel={T.KEEP_CAMPER}
          deleteLabel={T.DELETE_PERMANENTLY}
          failed={dialog.failed}
          deleting={dialog.saving}
          onDelete={confirmDeleteCamper}
          onCancel={() => !dialog.saving && closeDialog()}
        />
      );
    }
  }

  const content = menuContent();
  const tabLabel = (key) => (key === 'checkin' ? T.TAB_CHECK_IN : key === 'payments' ? T.TAB_PAYMENTS : T.TAB_ATTENDANCE);

  return (
    <>
      {backLink}
      {isPhone ? (
        // Phones (option A's phone frame): the name with Registration link and ⋯ beside it, and one
        // short line (days · hours · tag), so the check-in list starts without scrolling.
        <div className="cp-phone-head">
          <div className="phead-titles">
            <h1 className="ptitle">{camp.name}</h1>
            <p className="cp-phone-line">
              <span>{`${T.campDatesText(days.map((d) => d.day))} · ${T.timeRange(camp.startTime, camp.endTime)}`}</span>
              <span className={`ttag${tag.kind === 'open' ? ' ttag--ok' : ''}`}>{T.campTagText(tag)}</span>
            </p>
          </div>
          <div className="cp-phone-buttons">
            {/* The one blue button, icon only on phones (its name is read out and shown as a tooltip). */}
            <button
              type="button"
              className="btn btn-primary cp-link-icon"
              aria-label={T.REGISTRATION_LINK}
              title={T.REGISTRATION_LINK}
              data-camp-link
              onClick={(event) => openDialog({ type: 'link', opener: event.currentTarget })}
            >
              <IconQrcode size={16} aria-hidden="true" />
            </button>
            <IconButton
              label={T.MORE_CAMP_ACTIONS}
              Icon={IconDots}
              aria-haspopup="menu"
              aria-expanded={menu?.kind === 'header' ? 'true' : 'false'}
              onClick={(event) => openMenu('header', null, event.currentTarget)}
            />
          </div>
        </div>
      ) : (
      <div className="phead ev-phead cp-phead">
        <div className="phead-titles">
          <h1 className="ptitle cp-title">
            <span>{camp.name}</span>
            <span className={`ttag${tag.kind === 'open' ? ' ttag--ok' : ''}`}>{T.campTagText(tag)}</span>
          </h1>
          <p className="ev-summary">{T.campSummaryLine(camp, days.map((d) => d.day), active.length)}</p>
        </div>
        <div className="ev-head-buttons">
          <button type="button" className="btn btn-primary" data-camp-link onClick={(event) => openDialog({ type: 'link', opener: event.currentTarget })}>
            {/* ti-qrcode = registration link / QR code */}
            <IconQrcode size={16} aria-hidden="true" />
            {T.REGISTRATION_LINK}
          </button>
          <IconButton
            label={T.MORE_CAMP_ACTIONS}
            Icon={IconDots}
            aria-haspopup="menu"
            aria-expanded={menu?.kind === 'header' ? 'true' : 'false'}
            onClick={(event) => openMenu('header', null, event.currentTarget)}
          />
        </div>
      </div>
      )}

      {/* Check in | Payments · 5 | Attendance — real tabs: one Tab stop, ← → Home End. */}
      <div className={`ttabs ev-tabs cp-pagetabs${isPhone ? ' is-phone' : ''}`} role="tablist" aria-label={camp.name} onKeyDown={handleTabKeyDown}>
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
              aria-label={key === 'payments' ? T.paymentsTabLabel(toCollectCount) : undefined}
              tabIndex={current ? 0 : -1}
              onClick={() => switchTab(key)}
            >
              {tabLabel(key)}
              {key === 'payments' && toCollectCount > 0 && (
                <span className="cp-tabcount" aria-hidden="true">
                  {toCollectCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy || actions.busy} onDismiss={() => setBanner(null)} />}

      {tab === 'checkin' && (
        <CheckInTab
          days={days}
          dayId={checkDay?.dayId ?? null}
          onDay={setCheckInDayId}
          today={today}
          active={active}
          extras={extras}
          query={query}
          onQuery={setQuery}
          busy={busy}
          layout={layout}
          menuFor={menu?.kind === 'checkin' ? menu.id : null}
          notSavedId={notSavedId}
          handlers={{
            onOpen: (row) => openCamper(row),
            onCheckIn: doCheckIn,
            onMore: (row, anchor) => openMenu('checkin', row, anchor),
            onMarkPaid: doMarkPaid,
            onReview: (row, anchor) => openCompareFor(row, anchor),
          }}
          panelId={tabIds.panel('checkin')}
          tabId={tabIds.tab('checkin')}
        />
      )}
      {tab === 'payments' && (
        <PaymentsTab
          active={active}
          removed={removed}
          pairs={pairs}
          removedOpen={removedOpen}
          onToggleRemoved={() => setRemovedOpen(!removedOpen)}
          onReview={(pair, opener) => openDialog({ type: 'compare', pair, saving: false, failed: false, opener })}
          ctx={ctx}
          panelId={tabIds.panel('payments')}
          tabId={tabIds.tab('payments')}
        />
      )}
      {tab === 'attendance' && (
        <AttendanceTab
          days={days}
          active={active}
          today={today}
          layout={layout}
          onOpen={(row) => openCamper(row)}
          panelId={tabIds.panel('attendance')}
          tabId={tabIds.tab('attendance')}
        />
      )}

      {content && <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />}
      {dialogElement}
      {actions.elements}
    </>
  );
}
