// CampPage.jsx — one camp's page: the C4 header and ONE roster (CP5, 2026-10-21).
// Why it exists: the camp is where the desk works — at the door (who's here?), at the counter (who
// owes?) and across the week (who came?). Jeffrey's CP5 decision puts all three on one roster
// (Camps-one-roster.html; the three tabs of v0.704 are gone). Address #camps/camp/<id> (App.jsx), so
// browser Back returns to the Camps list; the old tab addresses (…/checkin, /payments, /attendance)
// still work and are tidied to the plain address. Top to bottom:
//   - "← Camps", the camp name and its status tag, and one line: days · hours · school · campers
//   - header buttons: Registration link (the one blue button, ti-qrcode → CampLinkDialog) and ⋯
//     (Edit camp (admin) · Close / Open sign-up · Save as template (admin) · Print roster ·
//     Delete camp (admin) — CampRowMenu.jsx)
//   - the roster (CampRoster.jsx): summary line, Find a camper, possible duplicates, the week switch
//     for camps longer than one calendar week, one row per child with Paid and a column per day,
//     then Removed
// Every name opens Camper detail (CamperDialog.jsx; on touch screens it also holds the row's ⋯
// actions). The page reloads quietly every 15 seconds (useLiveLoad), so family sign-ups and
// check-ins on another device show up by themselves. If those quiet reloads keep failing (2 in a
// row — e.g. the Wi-Fi dropped), an amber "Couldn't refresh the roster." bar with Retry appears
// above the roster, so the page never just looks frozen (live test 2026-10-21); the roster's
// summary line also says when it was last updated. Every change goes to the database
// (src/lib/camps/campsApi.js) and the page reloads after it. Reversible changes get a 5-second Undo
// toast — since rulebook v0.726 also Edit camp, Edit details and Edit payment ("Payment changed");
// permanent ones ask first (rule 1.4). Staff and admins see different ⋯ items
// (CamperRowMenu.jsx); the database enforces the same rules.
//
// There is no Add camper button: campers only come in through the family form (C4).
//
// "Hide private details" (the top-bar switch, src/lib/privateDetails.js; rulebook v0.722, design
// review C1) — copied from Color Belt's built event page (v0.412). While it is on, Camps hides
// money: no Paid column / "to collect" / Mark paid (CampRoster), gray "Hidden on this tablet" in
// Camper detail, Compare and Edit details, no money items in ⋯ / "More", "any recorded payment" in
// the delete sentences, no amounts in toasts. Turning it on closes the payment dialogs (Change how
// they'll pay, Edit payment), the ⋯ menu, the toast and every banner (they may name money or carry
// a Retry that records money). Camp and template prices are settings: they stay.
// Naming: `detailsHidden` is that switch; `hidden` below means "the screen is locked".
// The delete box (Delete permanently) and the possible-duplicate compare are the dashboard's shared
// parts (components/ConfirmBox.jsx, components/CompareDialog.jsx; rulebook v0.729, design review
// C6 / C20). This page keeps their state, words and rows (duplicates.js) and does the writes.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconDots, IconQrcode, IconTrash } from '@tabler/icons-react';
import CompareDialog from '../../components/CompareDialog.jsx';
import ConfirmBox from '../../components/ConfirmBox.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import { LOCATION_NAME } from '../../lib/device.js';
import { usePrivateDetailsHidden } from '../../lib/privateDetails.js';
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
import { campTag, campWeeks, defaultWeekIndex, lastDay, paymentSchoolFor, signupState } from '../../lib/camps/campRules.js';
import { PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../lib/useLiveLoad.js';
import CampDialog from './CampDialog.jsx';
import CampLinkDialog from './CampLinkDialog.jsx';
import CampRoster, { byFirstName } from './CampRoster.jsx';
import CamperDialog from './CamperDialog.jsx';
import { camperMenuItems } from './CamperRowMenu.jsx';
import { useCampActions } from './CampRowMenu.jsx';
import { compareRows, findPairs } from './duplicates.js';
import { EditPaymentDialog, PayingByDialog } from './PaymentDialogs.jsx';
import * as T from './text.js';

// The old tab addresses (v0.704): they now open the one roster (and are tidied away).
const OLD_TABS = ['checkin', 'payments', 'attendance'];
// The dialogs that show or change money: they close when Hide private details is switched on.
const PAYMENT_DIALOGS = ['paying', 'payment'];
// The chosen week and the Removed group open / closed, per camp, while the page is open.
const weekByCamp = new Map();
const removedOpenByCamp = new Map();
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
  tab: requestedTab, // from the address: an old tab name is tidied to the plain address
  onTab,
  onBack,
  deviceLocation, // 'Worcester' | 'Shrewsbury' — this device's home school (where Mark paid's money goes)
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
  const [detailsHidden] = usePrivateDetailsHidden(); // Hide private details (v0.506 / v0.722)

  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null); // { id, anchor, row, kind: 'camper' | 'header' }
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notSavedId, setNotSavedId] = useState(null);
  const [query, setQuery] = useState('');
  const [removedOpen, setRemovedOpenState] = useState(() => removedOpenByCamp.get(campId) ?? true);
  const [chosenWeek, setChosenWeekState] = useState(() => weekByCamp.get(campId) ?? null); // null = the default week
  const busyRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false); // the "Couldn't refresh" bar's Retry is on its way

  function setRemovedOpen(open) {
    removedOpenByCamp.set(campId, open);
    setRemovedOpenState(open);
  }
  function setChosenWeek(index) {
    weekByCamp.set(campId, index);
    setChosenWeekState(index);
    setMenu(null);
  }

  // An old tab address (#…/checkin, /payments, /attendance): show the roster, tidy the address.
  useEffect(() => {
    if (OLD_TABS.includes(requestedTab) && onTab) onTab('default');
  }, [requestedTab, onTab]);

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

  // ===== Hide private details (as Color Belt's EventPage, v0.412) =====
  // The open dialog RIGHT NOW: a payment dialog's save that finishes after the switch closed it
  // must not close (or patch) whatever dialog is open by then.
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const stillOpen = (d) => dialogRef.current !== null && dialogRef.current.key === d.key;
  // The switch's value RIGHT NOW (updated on every drawing). A save that was already on its way
  // when the switch turned on reads this when its answer arrives, so its toast or banner follows
  // the current value, not the one from when it started.
  const hiddenNowRef = useRef(detailsHidden);
  hiddenNowRef.current = detailsHidden;
  // A money save's answer that arrives while hidden: the general words only — no amount, no paid
  // status, no Retry that would record money (Mark paid / Undo payment).
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
  // A payment dialog's save that failed AFTER the dialog was closed (the switch turned on mid-save):
  // the dialog can't show its note any more, so the page says it (as Color Belt's EventPage).
  function closedPaymentProblem(status) {
    if (hiddenNowRef.current) hiddenMoneyProblem(status);
    else if (status === 'no_access') onNoAccess();
    else {
      setBanner({ text: status === 'error' ? T.SAVE_FAILED : T.ROSTER_STALE });
      if (status !== 'error') reloadQuiet();
    }
  }
  // Switched on: no payment dialog, ⋯ menu, toast or banner may stay (the roster closes its own
  // Mark paid box). Only when the switch changes, not on the first drawing.
  const hiddenBeforeRef = useRef(detailsHidden);
  useEffect(() => {
    const switchedOn = detailsHidden && !hiddenBeforeRef.current;
    hiddenBeforeRef.current = detailsHidden;
    if (!switchedOn) return;
    const d = dialogRef.current;
    // (Even mid-save: the save still finishes, and its toast names no amount.)
    if (d && PAYMENT_DIALOGS.includes(d.type)) {
      setDialog(null);
      if (d.opener) focusSoon(d.opener);
    }
    // The ⋯ menu closes; focus goes back to the button that opened it (the row's ⋯ or the header's),
    // or to "← Camps" if that button is gone — never to the page body.
    if (menu) {
      const anchor = menu.anchor;
      setMenu(null);
      focusSoon(() => (anchor?.isConnected ? anchor : document.querySelector('.ev-back')));
    }
    // A toast may name money ("marked paid · $15 cash") or carry a payment Undo: it goes too.
    clearToast();
    // So does every banner: a failed Mark paid keeps a Retry that records money, and "already
    // marked paid" names paid status. The row's Not saved mark goes with it.
    setBanner(null);
    setNotSavedId(null);
    // (only when the switch changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsHidden]);

  // ===== Derived =====
  const active = roster.filter((r) => r.status === 'active').sort(byFirstName);
  const removed = roster.filter((r) => r.status !== 'active').sort(byFirstName);
  const pairs = findPairs(active);
  // Weeks (multi-week option A): the week containing today, else the next, else the last.
  const weeks = campWeeks(days);
  const weekIndex = chosenWeek !== null && chosenWeek < weeks.length ? chosenWeek : defaultWeekIndex(weeks, today);
  const state = camp ? signupState(camp, days, today) : null;

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
  // options.money: the Undo of a payment — while hidden on arrival, the general words, no Retry.
  // A call may add `undoText` to its answer: the reason it was refused, in words (Edit camp's and
  // Edit details' Undo, rulebook v0.726) — shown in the amber bar instead of "Couldn't undo.
  // Someone else changed this just now." The toast is gone once Undo is pressed and begin() lets
  // only one change run at a time, so a double press can't run it twice.
  async function runUndo(call, options = {}) {
    if (!begin()) return;
    const result = await call();
    end(result.status);
    const status = result.status;
    if (options.money && hiddenNowRef.current && status !== 'ok') {
      hiddenMoneyProblem(status);
      return;
    }
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
      setBanner({ text: result.undoText ?? T.UNDO_STALE });
      reloadQuiet();
    }
  }
  // money: Mark paid / Undo payment — while hidden on arrival, the general words, no Retry.
  function rowProblem(status, row, retry, money = false) {
    const name = T.camperLabel(row);
    if (money && hiddenNowRef.current) hiddenMoneyProblem(status);
    else if (status === 'no_access') onNoAccess();
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
  // The payment goes to the Daily report of THIS DEVICE's home school (account menu "This device",
  // owner decision 2026-10-19) — whatever the top switcher shows and whatever the camp. Never asked.
  function doMarkPaid(row) {
    doMarkPaidAt(row, paymentSchoolFor(deviceLocation));
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
      rowProblem(result.status, row, { text: T.markPaidFailed(name), run: () => doMarkPaidAt(row, school) }, true);
      return;
    }
    rowDone();
    reloadQuiet();
    const paymentId = result.paymentId;
    // Hide private details switched on while this was saving: "Leo Kim marked paid", no amount or
    // method (picture 03b keeps the Undo; a failed Undo then gets the general words, no Retry).
    const text = hiddenNowRef.current ? T.markedPaidToastHidden(name) : T.markedPaidToast(name, result.amountCents, result.method);
    showToast(text, {
      icon: false,
      // Staff may undo their own payment within 10 seconds (§1.14); after that it's an admin's job.
      action: { label: T.UNDO, onAction: () => runUndo(() => undoPayment(paymentId), { notAllowedText: T.UNDO_PAYMENT_TOO_LATE, money: true }) },
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
      rowProblem(result.status, row, { text: T.actionFailed, run: () => doUndoPayment(row) }, true);
      return;
    }
    rowDone();
    reloadQuiet();
    // Hidden now: the general words ("Payment undone" would say they had paid).
    showToast(hiddenNowRef.current ? T.TOAST_CHANGES_SAVED : T.paymentUndoneToast(T.camperLabel(row)), { icon: false });
  }

  // ===== Check in / Undo check-in (any day, v0.706): a day cell of the roster =====
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
    // Keyboard: stay on the same day cell (it turns from Check in into the came icon + time).
    focusSoon(() => document.querySelector(`[data-day-cell="${row.id}:${day.dayId}"]`));
  }
  // Tapping a came cell (user-check icon + time) undoes that check-in at once, with an Undo toast that checks the child in again.
  async function doUndoCheckIn(row, day) {
    if (!day || !begin()) return;
    const result = await undoCheckIn(row.id, day.dayId);
    end(result.status);
    const name = T.camperLabel(row);
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.undoCheckInFailed(name), run: () => doUndoCheckIn(row, day) });
      return;
    }
    rowDone();
    reloadQuiet();
    showToast(T.checkInUndoneToast(name), {
      icon: false,
      action: { label: T.UNDO, onAction: () => runUndo(() => checkIn(row.id, day.dayId)) },
    });
    focusSoon(() => document.querySelector(`[data-day-cell="${row.id}:${day.dayId}"]`));
  }

  // ===== Dialog openers =====
  function openCamper(row, opener = null, startInEdit = false) {
    openDialog({ type: 'camper', camperId: row.id, camperName: T.camperLabel(row), startInEdit, opener: opener ?? document.activeElement });
  }
  function openCompareFor(row, opener) {
    const pair = pairs.find((p) => p.first.id === row.id || p.second.id === row.id);
    if (pair) openDialog({ type: 'compare', pair, saving: false, failed: false, opener });
  }
  // Edit payment and Delete permanently read the camper fresh first. `from` = the open Camper
  // detail when they were pressed under its "More" (touch screens), else null (the ⋯ menu). The
  // detail stays open while this loads, and the new dialog then takes its place in ONE drawing:
  // Dialog.jsx hands the detail's browser Back step straight to it. (Closing the detail first let
  // its Back step land after the new dialog had opened, which closed that one at once — phones.)
  // Closed meanwhile (back arrow, Esc): nothing opens. Loading failed: the detail closes, so the
  // banner isn't hidden behind it.
  function detailGone(from) {
    return from !== null && !stillOpen(from);
  }
  function leaveDetail(from) {
    if (from === null || !stillOpen(from)) return;
    setDialog(null);
    if (from.opener) focusSoon(from.opener);
  }
  async function startEditPayment(row, opener, from = null) {
    if (!isAdmin || !begin()) return;
    const result = await loadCamperDetail(row.id);
    end(result.status === 'ok' ? 'ok' : result.status);
    if (result.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (detailGone(from)) return;
    // Hide private details was switched on while this loaded: the money dialog doesn't open.
    if (hiddenNowRef.current) return;
    const payment = result.status === 'ok' ? activePayment(result.payments) : null;
    if (!payment) {
      leaveDetail(from);
      setBanner({ text: result.status === 'error' ? T.LOAD_CAMPER_FAILED : T.ROSTER_STALE });
      reloadQuiet();
      return;
    }
    openDialog({ type: 'payment', row, payment, opener });
  }
  async function startDeleteCamper(row, opener, from = null) {
    if (!isAdmin || !begin()) return;
    const result = await loadCamperDetail(row.id);
    end(result.status === 'ok' ? 'ok' : result.status);
    if (result.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (detailGone(from)) return;
    if (result.status !== 'ok') {
      leaveDetail(from);
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
      // The sentence is written when drawn, so it follows Hide private details even if the switch
      // changes while the box is open.
      counted: counted ? [counted] : [],
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
  // `pressed` is the shared Compare dialog's busy value ('keep-first' / 'keep-second'): that
  // button says "Keeping…" while it works (v1.102). The compare's `saving` holds it (false =
  // nothing working), and keep both's is 'keep-both'.
  async function keepOne(keep, other, pressed) {
    const d = dialog;
    if (!d || d.saving || !begin()) return;
    setDialog({ ...d, saving: pressed, failed: false });
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
    setDialog({ ...d, saving: 'keep-both', failed: false });
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
  // The same items under Camper detail's "More" (touch screens, CP5; `from` = that open detail).
  // An item with a dialog of its own opens it in the detail's place in one step (openDialog swaps
  // them, so the detail's Back step goes straight to the new dialog); the others close the detail
  // and make their change. Focus comes back to the name that opened the detail.
  function detailHandlers(from) {
    const opener = from.opener ?? null;
    const closeThen = (change) => (row) => {
      leaveDetail(from);
      change(row);
    };
    return {
      onPayingBy: (row) => camperHandlers.onPayingBy(row, opener),
      onEdit: (row) => camperHandlers.onEdit(row, opener),
      onReview: (row) => camperHandlers.onReview(row, opener),
      onWithdraw: closeThen((row) => doWithdraw(row)),
      onRestore: closeThen((row) => doWithdraw(row, true)),
      onUndoPayment: closeThen((row) => doUndoPayment(row)),
      onEditPayment: (row) => startEditPayment(row, opener, from),
      onDelete: (row) => startDeleteCamper(row, opener, from),
    };
  }
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
    const items = camperMenuItems(row, { isAdmin, busy, anchor: menu.anchor, h: camperHandlers, detailsHidden });
    // The phone sheet's subtitle: "All days · cash" — only the days while hidden (how they pay is a payment detail).
    const daysText = T.camperDaysText(row, days);
    return { title: name, subtitle: detailsHidden ? daysText : T.camperPayLine(daysText, row.payingBy), label: T.moreFor(name), items };
  }

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
          detailsHidden={detailsHidden}
          startInEdit={dialog.startInEdit}
          // Touch screens have no ⋯ on the roster: its items are in the detail instead (CP5).
          actions={(() => {
            if (!isTouch) return null;
            const row = roster.find((r) => r.id === dialog.camperId);
            return row ? camperMenuItems(row, { isAdmin, busy, anchor: null, h: detailHandlers(dialog), detailsHidden }) : null;
          })()}
          onClose={closeDialog}
          // Undo (v0.726, option A): saves the old details again — every time, also after a
          // change that re-priced the camper (the total then follows the camp's current prices).
          onSaved={(undo) => {
            closeDialog();
            reloadQuiet();
            showToast(T.TOAST_CHANGES_SAVED, { icon: false, action: undo ? { label: T.UNDO, onAction: () => runUndo(undo) } : null });
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
          // Undo (v0.726): saves the camp's old values again; refused → why, in the amber bar.
          onSaved={(result) => {
            closeDialog();
            reloadQuiet();
            const undo = result?.undo ?? null;
            showToast(T.TOAST_CAMP_SAVED, { icon: false, action: undo ? { label: T.UNDO, onAction: () => runUndo(undo, { notAllowedText: T.CAMPS_NOT_ALLOWED }) } : null });
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
    } else if (!hidden && !detailsHidden && dialog.type === 'paying') {
      // (Never while private details are hidden: switching them on closes it.)
      const d = dialog;
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
              if (stillOpen(d)) closeDialog();
              reloadQuiet();
              const newVersion = result.version;
              // Hidden meanwhile: no Undo (how they pay is a payment item, hidden while on).
              if (hiddenNowRef.current) {
                showToast(T.TOAST_CHANGES_SAVED, { icon: false });
                return result.status;
              }
              showToast(T.TOAST_CHANGES_SAVED, {
                icon: false,
                action: { label: T.UNDO, onAction: () => runUndo(() => changePayingBy(row.id, newVersion, row.payingBy), { money: true }) },
              });
            } else if (!stillOpen(d)) closedPaymentProblem(result.status);
            else if (result.status === 'no_access') onNoAccess();
            else if (result.status !== 'error') reloadQuiet();
            return result.status;
          }}
        />
      );
    } else if (!hidden && !detailsHidden && dialog.type === 'payment') {
      // (Never while private details are hidden: switching them on closes it.)
      const d = dialog;
      dialogElement = (
        <EditPaymentDialog
          key={dialog.key}
          name={T.camperLabel(dialog.row)}
          payment={dialog.payment}
          today={today}
          isPhone={isPhone}
          onClose={closeDialog}
          onSave={async (values) => {
            const result = await editPayment(d.payment.id, values);
            if (result.status === 'invalid' && result.field === 'school' && stillOpen(d)) return 'invalid_school';
            if (result.status === 'ok') {
              if (stillOpen(d)) closeDialog();
              reloadQuiet();
              // Hidden now (switched on while this saved): the general words ("Payment changed"
              // would say there is a payment) and no Undo — as Change how they'll pay.
              if (hiddenNowRef.current) {
                showToast(T.TOAST_CHANGES_SAVED, { icon: false });
                return result.status;
              }
              // "Payment changed" · Undo (v0.726, Black Belt's words and way): the save reversed the
              // old payment and recorded a new one, so Undo runs the same edit again on the NEW one
              // with the old way to pay, amount, date and school. Someone else editing or undoing
              // it meanwhile → 'stale' ("Couldn't undo. Someone else changed this just now.").
              const old = d.payment;
              const newPaymentId = result.paymentId;
              const back = { method: old.method, amountCents: old.amountCents, paidOn: old.paidOn, school: old.school ?? values.school };
              showToast(T.TOAST_PAYMENT_CHANGED, {
                icon: false,
                action: { label: T.UNDO, onAction: () => runUndo(() => editPayment(newPaymentId, back), { money: true }) },
              });
            } else if (!stillOpen(d)) closedPaymentProblem(result.status);
            else if (result.status === 'no_access') onNoAccess();
            else if (result.status === 'not_allowed') onRefreshProfile();
            return result.status;
          }}
        />
      );
    } else if (!hidden && dialog.type === 'compare') {
      const first = roster.find((r) => r.id === dialog.pair.first.id) ?? dialog.pair.first;
      const second = roster.find((r) => r.id === dialog.pair.second.id) ?? dialog.pair.second;
      const last = lastDay(days);
      // After the camp's last day, keeping one is admin-only (Color Belt v0.194).
      const canKeepOne = isAdmin || last === null || today <= last;
      dialogElement = (
        // The shared Compare dialog (rulebook v0.729 / v1.102) with Camps' own rows, words and
        // order (duplicates.js compareRows; C1's "Hidden on this tablet" rows while hidden).
        <CompareDialog
          key={dialog.key}
          title={T.compareTitle(T.camperLabel(first))}
          sub={T.COMPARE_SUB}
          heads={[T.FIRST_SIGNUP, T.SECOND_SIGNUP]}
          rows={compareRows(first, second, days, detailsHidden)}
          canKeepOne={canKeepOne}
          note={canKeepOne ? T.COMPARE_NOTE : T.KEEP_ONE_ADMIN_ONLY}
          isPhone={isPhone}
          busy={dialog.saving || null}
          failed={dialog.failed ? T.SAVE_FAILED : null}
          onKeep={(index) => (index === 0 ? keepOne(first, second, 'keep-first') : keepOne(second, first, 'keep-second'))}
          onKeepBoth={keepBoth}
          onClose={closeDialog}
        />
      );
    } else if (!hidden && dialog.type === 'deleteCamper') {
      dialogElement = (
        // The shared "are you sure?" box (rulebook v0.729): "Keep camper" · red "Delete
        // permanently", "Deleting…" while it works. It draws through the shared Dialog like the
        // camper detail, so from the phone's More it takes the detail's place in one update.
        <ConfirmBox
          key={dialog.key}
          title={dialog.title}
          hint={T.DELETE_CAMPER_HINT}
          keepLabel={T.KEEP_CAMPER}
          actionLabel={T.DELETE_PERMANENTLY}
          actionIcon={IconTrash} // ti-trash = delete (red: deleting only)
          busyLabel={T.DELETING}
          loses="forGood"
          busy={dialog.saving}
          failed={dialog.failed ? T.DELETE_FAILED : null}
          onConfirm={confirmDeleteCamper}
          onKeep={closeDialog} // ConfirmBox ignores it while the delete works
        >
          {T.deleteCamperBody(camp.name, dialog.counted, detailsHidden)}
        </ConfirmBox>
      );
    }
  }

  const content = menuContent();

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

      {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy || actions.busy} onDismiss={() => setBanner(null)} />}
      {/* The automatic reload keeps failing: say so (same amber bar as every other problem). It
          goes away by itself after the next good reload — automatic or this Retry. */}
      {live.refreshFailing && (
        <ErrorBanner
          text={T.REFRESH_FAILED}
          onRetry={async () => {
            if (refreshing) return;
            setRefreshing(true);
            await liveRef.current.reload();
            setRefreshing(false);
          }}
          retrying={refreshing}
        />
      )}

      <CampRoster
        days={days}
        weeks={weeks}
        weekIndex={weekIndex}
        onWeek={setChosenWeek}
        today={today}
        active={active}
        removed={removed}
        extras={extras}
        pairs={pairs}
        query={query}
        onQuery={setQuery}
        removedOpen={removedOpen}
        onToggleRemoved={() => setRemovedOpen(!removedOpen)}
        layout={layout}
        isAdmin={isAdmin}
        busy={busy}
        menuFor={menu?.kind === 'camper' ? menu.id : null}
        notSavedId={notSavedId}
        updatedAt={live.updatedAt}
        detailsHidden={detailsHidden}
        handlers={{
          onOpen: (row, el) => openCamper(row, el),
          onMore: (row, anchor) => openMenu('camper', row, anchor),
          onMarkPaid: (row) => doMarkPaid(row),
          onReview: (row, anchor) => openCompareFor(row, anchor),
          onReviewPair: (pair, opener) => openDialog({ type: 'compare', pair, saving: false, failed: false, opener }),
          onCheckIn: doCheckIn,
          onUndoCheckIn: doUndoCheckIn,
        }}
      />

      {content && <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />}
      {dialogElement}
      {actions.elements}
    </>
  );
}
