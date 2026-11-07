// CampPage.jsx — one camp's page: the C4 header and ONE roster (CP5, 2026-10-21).
// Why it exists: the camp is where the desk works — at the door (who's here?), at the counter (who
// owes?) and across the week (who came?). Jeffrey's CP5 decision puts all three on one roster
// (Camps-one-roster.html; the three tabs of v0.704 are gone). Address #camps/camp/<id> (App.jsx), so
// browser Back returns to the Camps list; the old tab addresses (…/checkin, /payments, /attendance)
// still work and are tidied to the plain address. Top to bottom:
//   - "← Camps", the camp name and its status tag, and one line: days · hours · school · campers
//   - header buttons: Registration link (the one blue button, ti-qrcode → the dashboard's shared
//     Registration link box, components/RegistrationLinkBox.jsx, rulebook v0.733 / design review
//     C11) and ⋯ (on phones the button keeps its words and sits on its own line under the name)
//     (Edit camp (admin) · Close / Open sign-up · Save as template (admin) · Print roster ·
//     Delete camp (admin) — CampRowMenu.jsx)
//   - the roster (CampRoster.jsx): the count cards (C10, rulebook v0.737), Find a camper, possible duplicates, the week switch
//     for camps longer than one calendar week, one row per child with Paid and a column per day,
//     then Removed
// Every name opens Camper detail (CamperDialog.jsx; on touch screens it also holds the row's ⋯
// actions). The page reloads quietly every 15 seconds (useLiveLoad), so family sign-ups and
// check-ins on another device show up by themselves. If those quiet reloads keep failing (2 in a
// row — e.g. the Wi-Fi dropped), an amber "Couldn't refresh the roster." bar with Retry appears
// above the roster, so the page never just looks frozen (live test 2026-10-21); the roster
// also says when it was last updated ("Updated …", above the count cards). Every change goes to the database
// (src/lib/camps/campsApi.js) and the page reloads after it. Reversible changes get a 5-second Undo
// toast — since rulebook v0.726 also Edit camp, Edit details and Edit payment ("Payment changed");
// permanent ones ask first (rule 1.4), and so does Undo payment (rulebook v0.730). Staff and admins see different ⋯ items
// (CamperRowMenu.jsx); the database enforces the same rules.
//
// Campers come in through the family form, and — for a family that walks in — through Fill in
// (rulebook v0.740 / v0.741, picture 23; it replaced v0.232's "no Add camper"): a plain "Fill in"
// button before Registration link on PC / tablet, "Fill in for a family" first in the header ⋯ on
// phones. It opens the camp's own family form in New students' Fill in frame (FillInDialog.jsx).
// Gray (aria-disabled, still focusable, pressing does nothing) with a tip saying why: for staff
// while family sign-up isn't open ("Family sign-up is closed. Ask an admin …" / "The closing date
// has passed. Ask an admin …"), for everyone after the camp's last day ("This camp is over.") and
// while Hide private details is on (desk-only, Forms' v0.616 words). Switching that on while the box
// is open closes it at once, even during a Send, and what was typed is not kept (v0.746, Jeffrey
// chose A): the box shows the family's answers.
//
// "Hide private details" (the top-bar switch, src/lib/privateDetails.js; rulebook v0.722, design
// review C1) — copied from Color Belt's built event page (v0.412). While it is on, Camps hides
// money: no Paid column / To collect and Payments recorded cards (a To collect filter is cleared) /
// Mark paid (CampRoster), gray "Hidden on this tablet" in
// Camper detail, Compare and Edit details, no money items in ⋯ / "More", "any recorded payment" in
// the delete sentences, no amounts in toasts. Turning it on closes the payment dialogs (Change how
// they'll pay, Edit payment, the Undo payment box, Record refund, the Undo refund box), the Fill in
// box (v0.746), the ⋯ menu, the toast and every banner (they may name money or carry a Retry that
// records money). Camp and template prices are settings: they stay.
// Naming: `detailsHidden` is that switch; `hidden` below means "the screen is locked".
// Print receipt (design review C3, rulebook v0.734; Star's build, v0.518, is the model): the camper's
// ⋯ (last in the money group), Camper detail's button (PC / tablet without touch) and "More" (touch)
// open the dashboard's shared receipt (components/Receipt.jsx). It reads camp_camper_detail, both
// schools (Settings → Schools: street and phone) and the reader's name (get_my_profile) when it
// opens, and campReceipt.js turns them into the plain receipt. From Camper detail it opens on top of
// it (v1.100) and focus goes back to the button; from ⋯ on its own. While it loads, can't load
// (amber bar with Retry) or the camper was deleted meanwhile, the shared box shows that. A receipt
// already open when Hide private details turns on stays open and shows only the gray line, no Print.
// The delete box (Delete permanently), the Undo payment box (v0.730) and the possible-duplicate compare are the dashboard's shared
// parts (components/ConfirmBox.jsx, components/CompareDialog.jsx; rulebook v0.729, design review
// C6 / C20). This page keeps their state, words and rows (duplicates.js) and does the writes.
// Record refund (rulebook v0.743, picture 22; v1.039 / v1.040, migration 0039; Star's build is the
// model): an admin hands money back to a family that paid more than the total — ⋯ (on touch,
// Camper detail's More) → Record refund, after Undo payment. Camper detail is read first (as for
// Edit payment), then RefundDialog.jsx opens; the refund is saved at THIS DEVICE's school (the desk
// that hands the money back, as Mark paid's money goes in) and the toast "Refund recorded" has Undo.
// While a refund stands, Edit payment and Undo payment are gray ("Undo the refund first.") and Undo
// refund takes Record refund's place: it reads Camper detail, asks first (the shared ConfirmBox, as
// Undo payment) and reverses the newest refund that stands. A database refusal 'refund_stands' (a
// refund recorded meanwhile) says "Undo the refund first." too.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowBackUp, IconArrowLeft, IconCurrencyDollarOff, IconDots, IconQrcode, IconTrash } from '@tabler/icons-react';
import CompareDialog from '../../components/CompareDialog.jsx';
import ConfirmBox from '../../components/ConfirmBox.jsx';
import RegistrationLinkBox from '../../components/RegistrationLinkBox.jsx';
import ReceiptDialog from '../../components/Receipt.jsx';
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
  loadMyName,
  markPaid,
  recordRefund,
  resolveDuplicate,
  restoreCamper,
  undoCheckIn,
  undoPayment,
  undoRefund,
  withdrawCamper,
  campToday,
} from '../../lib/camps/campsApi.js';
import {
  campLink, campTag, campWeeks, defaultWeekIndex, lastDay, newestStandingRefund, overpaidCents, paymentSchoolFor, refundStands, signupState,
  standingPayments,
} from '../../lib/camps/campRules.js';
import { buildCampReceipt } from '../../lib/camps/campReceipt.js';
import { loadSchools } from '../../lib/settings/schoolsApi.js';
import { PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../lib/useLiveLoad.js';
import CampDialog from './CampDialog.jsx';
import CampRoster, { byFirstName } from './CampRoster.jsx';
import CamperDialog from './CamperDialog.jsx';
import { camperMenuItems } from './CamperRowMenu.jsx';
import { useCampActions } from './CampRowMenu.jsx';
import { compareRows, findPairs } from './duplicates.js';
import { EditPaymentDialog, PayingByDialog, editPaymentForm, payingByForm } from './PaymentDialogs.jsx';
import RefundDialog, { refundForm } from './RefundDialog.jsx';
import { closedWords, useCampFillIn } from './FillInDialog.jsx';
import { focusSoon } from './focusSoon.js';
import { useRevealRetryBar } from './revealRetryBar.js';
import * as T from './text.js';

// The old tab addresses (v0.704): they now open the one roster (and are tidied away).
const OLD_TABS = ['checkin', 'payments', 'attendance'];
// The dialogs that show or change money: they close when Hide private details is switched on
// (the Undo payment box names the payment's amount, v0.730; Record refund and its Undo box, v0.743).
const PAYMENT_DIALOGS = ['paying', 'payment', 'undoPayment', 'refund', 'undoRefund'];
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

// focusSoon (./focusSoon.js) gives focus back to an element once the page behind a closed dialog
// is usable again (it stays "inert" for a moment after the dialog closes).

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
  // The pressed count card (C10, rulebook v0.737): null | 'coming' | 'collect'. Kept here beside
  // Find a camper's text; another camp starts without one (Camps.jsx draws this page with key={campId}).
  const [filter, setFilter] = useState(null);
  const [removedOpen, setRemovedOpenState] = useState(() => removedOpenByCamp.get(campId) ?? true);
  const [chosenWeek, setChosenWeekState] = useState(() => weekByCamp.get(campId) ?? null); // null = the default week
  const busyRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false); // the "Couldn't refresh" bar's Retry is on its way
  // The receipt (C3, v0.734): { key, camperId, opener, onTop, data, failed, notFound } or null.
  // onTop = opened from Camper detail, drawn on top of it (Dialog onTop, v1.100); from ⋯ on its own.
  const [receipt, setReceipt] = useState(null);
  const schoolsRef = useRef(null); // both schools (the receipt's footer), read once

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

  // Fill in (v0.740 / v0.741): the dialog and its typed answers live in this hook, so a screen lock
  // loses nothing. A Send that saved reloads the roster at once (and again on Close).
  const fill = useCampFillIn({
    campId,
    campName: camp?.name ?? '',
    isAdmin,
    isPhone,
    screenLocked,
    today,
    onNoAccess,
    onRefreshProfile,
    onSent: () => reloadQuiet(),
    onClosedProblem: (status) => closedFillInProblem(status),
  });
  const [fillTipOpen, setFillTipOpen] = useState(false); // a gray Fill in's tip after a tap (touch screens have no hover)

  // A failed read's amber bar (Undo payment, Edit payment, Delete permanently, Delete camp; S-2)
  // is drawn right under the page's head, maybe far above where the person is scrolled: bring it
  // into view and focus its Retry. barRef = the Camps-owned wrapper around the page's bar.
  const barRef = useRef(null);
  useRevealRetryBar(banner, () => barRef.current?.querySelector('.errbar') ?? null);

  // Locking closes menus; dialogs only hide (they come back after the PIN).
  useEffect(() => {
    if (screenLocked) setMenu(null);
  }, [screenLocked]);
  const modalShown = (dialog !== null || receipt !== null || actions.dialogOpen || fill.isOpen) && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);
  // The camp was deleted elsewhere: close whatever was open.
  useEffect(() => {
    if (live.status !== 'notFound') return;
    setDialog(null);
    setMenu(null);
    setReceipt(null);
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
  // The same for a Fill in Send that was still saving when the switch closed the box (v0.746) and
  // didn't save — or whose answer never came (it may have saved): one amber bar that names nobody
  // (the switch is on), and the roster read again, so staff can see whether the family is on it.
  function closedFillInProblem(status) {
    if (status === 'no_access') {
      onNoAccess();
      return;
    }
    if (status === 'admin_only') onRefreshProfile(); // maybe this person is no longer an admin
    // reveal: the bar is scrolled into view and its × focused, in case the person scrolled meanwhile
    setBanner({ text: T.FILL_IN_CLOSED_NOT_SAVED, reveal: true });
    reloadQuiet();
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
    // The Fill in box shows a family's answers: it closes too, even during a Send, and what was
    // typed is not kept (v0.746, Jeffrey chose A); focus goes back to Fill in, now gray (desk-only).
    fill.closeNow();
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
    // The To collect card goes, so its filter does too (as Star clears its payment filter).
    if (filter === 'collect') setFilter(null);
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
  // Why Fill in is gray right now (null = it can be used; v0.740 C, v0.741): after the last day for
  // everyone; while Hide private details is on, desk-only (as Forms, v0.616); for staff while
  // family sign-up isn't open. Admins may fill in while it's closed. (The database checks again.)
  const fillInBlocked = !camp ? T.FILL_IN_LOADING
    : state === 'finished' ? T.FILL_IN_FINISHED
      : detailsHidden ? T.FILL_IN_AT_DESK
        : state !== 'open' && !isAdmin ? closedWords(state, camp.signupClosesOn, today)
          : null;
  const fillInDeskOnly = fillInBlocked === T.FILL_IN_AT_DESK; // gray because private details are hidden
  function openFillIn(opener) {
    if (fillInBlocked) {
      setFillTipOpen(true); // touch screens: a tap shows the tip (a mouse shows it on hover)
      return;
    }
    clearToast();
    setMenu(null);
    setFillTipOpen(false);
    fill.open(opener);
  }

  // ===== Dialogs =====
  function openDialog(next) {
    clearToast();
    setMenu(null);
    setDialog({ key: Date.now(), ...next });
  }
  // The payment dialogs' forms (Change how they'll pay, Edit payment, Record refund) live HERE, in
  // the dialog state, not inside the dialogs: a screen lock stops drawing the dialog until the PIN,
  // and a dialog's own state would start over, losing what was typed (Star's CandidatesTab keeps its
  // dialogs' values the same way). patch = an object, or a function of the current form → an
  // object. Only the dialog it was made for (d.key) changes; one closed meanwhile is left alone.
  function patchForm(d, patch) {
    setDialog((current) => {
      if (!current || current.key !== d.key || !current.form) return current;
      const next = typeof patch === 'function' ? patch(current.form) : patch;
      return { ...current, form: { ...current.form, ...next } };
    });
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
    // Every bar below is brought into view (reveal: useRevealRetryBar): the toast's Undo may be
    // pressed far down the roster, and the bar sits at the top of the page — without this, nothing
    // seemed to happen (Record refund's design review). The toast's button is gone, so focus goes
    // to the bar's Retry, or else its Dismiss (×).
    else if (status === 'not_allowed') {
      setBanner({ text: options.notAllowedText ?? T.ROSTER_NOT_ALLOWED, reveal: true });
      onRefreshProfile();
    } else if (status === 'error') {
      setBanner({ kind: 'undo', text: T.UNDO_FAILED, retry: () => runUndo(call, options), reveal: true });
    } else {
      // refund_stands (migration 0039): the Undo of a payment (the Mark paid toast's, or Edit
      // payment's), refused because a refund was recorded meanwhile — say what to do instead.
      setBanner({ text: result.undoText ?? (status === 'refund_stands' ? refundStandsText() : T.UNDO_STALE), reveal: true });
      reloadQuiet();
    }
  }
  // What to say when a refund stands in the way (refund_stands): admins can undo it themselves
  // ("Undo the refund first."); staff can't undo refunds, so they're sent to an admin.
  function refundStandsText() {
    return isAdmin ? T.UNDO_REFUND_FIRST : T.UNDO_REFUND_STANDS_STAFF;
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
    } else if (status === 'refund_stands') {
      // Undo payment refused: a refund of this camper stands (recorded meanwhile; migration 0039).
      // The roster reloads, so ⋯ shows Edit / Undo payment gray and Undo refund.
      setBanner({ text: refundStandsText() });
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

  // ===== Mark paid: the full amount owed (Color Belt plan answer 6), the way picked in the shared box =====
  // The payment goes to the Daily report of THIS DEVICE's home school (account menu "This device",
  // owner decision 2026-10-19) — whatever the top switcher shows and whatever the camp. Never asked.
  // method = the way picked in the Mark paid box (v0.735); another way than Paying by also changes
  // Paying by (the database does it in the same save; the toast's Undo puts it back).
  function doMarkPaid(row, method = null) {
    doMarkPaidAt(row, paymentSchoolFor(deviceLocation), method);
  }
  async function doMarkPaidAt(row, school, method = null) {
    if (!begin()) return;
    const result = await markPaid(row.id, row.version, school, method);
    end(result.status);
    const name = T.camperLabel(row);
    if (result.status === 'invalid' && result.field === 'school') {
      setBanner({ text: T.SCHOOL_REFUSED }); // (review L4)
      return;
    }
    if (result.status !== 'ok') {
      rowProblem(result.status, row, { text: T.markPaidFailed(name), run: () => doMarkPaidAt(row, school, method) }, true);
      return;
    }
    rowDone();
    const reloaded = reloadQuiet();
    // Set when the toast's Undo is pressed: from then on the Undo's own bar decides where focus goes
    // (useRevealRetryBar), so the step below must not take focus first — when Undo was pressed
    // before the roster finished reloading, it did, and the bar stayed above the screen (Record
    // refund's design review).
    let undoPressed = false;
    // The "$X due" tag (where focus went back when the box closed) turns into a plain "Paid" with
    // the payment, so once the roster has reloaded focus moves to the row, as Star does: the tag if
    // the camper still owes ("Owes $X"), else the camper's name, else the row's ⋯. Only when focus
    // is still on that tag or fell to the page — never away from something else (e.g. the toast's Undo).
    reloaded.then(() => focusSoon(() => {
      if (undoPressed) return null;
      const tag = document.querySelector(`[data-pay-tag="${row.id}"]`);
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected && active !== tag) return null;
      return tag ?? document.querySelector(`[data-nav-row="${row.id}"]`) ?? document.querySelector(`[data-camper-more="${row.id}"]`);
    }));
    const paymentId = result.paymentId;
    // Hide private details switched on while this was saving: "Leo Kim marked paid", no amount or
    // method (picture 03b keeps the Undo; a failed Undo then gets the general words, no Retry).
    const text = hiddenNowRef.current ? T.markedPaidToastHidden(name) : T.markedPaidToast(name, result.amountCents, result.method);
    showToast(text, {
      icon: false,
      // Staff may undo their own payment within 10 seconds (§1.14); after that it's an admin's job.
      action: {
        label: T.UNDO,
        onAction: () => {
          undoPressed = true;
          runUndo(() => undoPayment(paymentId), { notAllowedText: T.UNDO_PAYMENT_TOO_LATE, money: true });
        },
      },
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
    // Restoring a "Duplicate copy": "[Name] restored" with NO Undo (design review R2-03, rulebook
    // v1.043, as Star's v0.517 G3). An Undo would withdraw it again as a plain "Removed", with
    // "Withdrawn" in its history — not what it was. To change it back, an admin uses Review → Keep
    // this one again. Every other restore keeps its 5-second Undo.
    if (restore && row.withdrawnReason === 'duplicate_copy') {
      showToast(T.restoredToast(name), { icon: false });
      return;
    }
    showToast(restore ? T.restoredToast(name) : T.withdrawnToast(name), {
      icon: false,
      action: { label: T.UNDO, onAction: () => runUndo(() => back(row.id, newVersion)) },
    });
  }

  // ===== Undo payment from ⋯ (admins, any time): asks first (rulebook v0.730, v1.003) =====
  // The box names the payment it reverses — amount, way to pay and date — and what is owed after.
  // The roster row knows only WHICH payment (lastPaymentId: the latest one not reversed), not its
  // amount, so Camper detail (camp_camper_detail) is read first, as Edit payment and Delete
  // permanently do; the payment undone is the one that counts right now in that fresh read
  // (activePayment — the same rule as the row's lastPaymentId), so the box names exactly the
  // payment that is reversed. From Camper detail (`from`) the box takes the detail's place in one
  // update, as Delete permanently does.
  async function startUndoPayment(row, opener, from = null) {
    if (!row.lastPaymentId || !begin()) return;
    const result = await loadCamperDetail(row.id);
    end(result.status === 'ok' ? 'ok' : result.status);
    if (result.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (detailGone(from)) return;
    // Hide private details was switched on while this loaded: the box (it names money) doesn't open.
    if (hiddenNowRef.current) return;
    if (refundStoodMeanwhile(result, from, opener)) return;
    const payment = result.status === 'ok' ? activePayment(result.payments) : null;
    if (!payment) {
      leaveDetail(from);
      camperReadProblem(result.status, () => startUndoPayment(row, opener), opener);
      return;
    }
    openDialog({
      type: 'undoPayment',
      row,
      name: T.camperLabel(result.camper),
      payment,
      // What the camper owes once this payment is reversed.
      owedAfterCents: (result.breakdown.owesCents ?? 0) + payment.amountCents,
      saving: false,
      failed: false,
      opener,
    });
  }
  // Edit payment and Undo payment are gray while a refund stands (v0.743 (4)). If the fresh read
  // shows one that the roster didn't have yet (recorded on another device), their box doesn't open:
  // the amber bar says "Undo the refund first." and the roster reloads (then ⋯ shows them gray).
  // The bar is brought into view and focus goes back to `opener` (the ⋯, or — from Camper detail's
  // More, which closes — the name that opened the detail): useRevealRetryBar below.
  // true = it stopped here.
  function refundStoodMeanwhile(result, from, opener) {
    if (result.status !== 'ok' || !refundStands(result.camper)) return false;
    leaveDetail(from);
    setBanner({ text: refundStandsText(), reveal: true, opener });
    reloadQuiet();
    return true;
  }

  // ===== Undo refund from ⋯ (admins, while a refund stands): asks first (rulebook v0.743 (4)) =====
  // The roster row only says THAT a refund stands (refundedCents), so Camper detail is read first, as
  // for Undo payment; the box names the newest refund that stands in that fresh read, and that is the
  // one reversed (at the refund's own school, v1.040). From Camper detail (`from`) the box takes the
  // detail's place in one update. Confirming runs confirmUndoPayment below (one box, two kinds).
  async function startUndoRefund(row, opener, from = null) {
    if (!isAdmin || !begin()) return;
    const result = await loadCamperDetail(row.id);
    end(result.status === 'ok' ? 'ok' : result.status);
    if (result.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (detailGone(from)) return;
    if (hiddenNowRef.current) return; // switched on while this loaded: the box (it names money) doesn't open
    const refund = result.status === 'ok' ? newestStandingRefund(result.payments) : null;
    if (!refund) {
      // Couldn't read (Retry), or no refund stands any more (someone undid it): today's handling.
      leaveDetail(from);
      camperReadProblem(result.status, () => startUndoRefund(row, opener), opener);
      return;
    }
    openDialog({ type: 'undoRefund', row, name: T.camperLabel(result.camper), refund, saving: false, failed: false, opener });
  }

  // The Undo payment box's and the Undo refund box's "Undo …" button (they work the same way).
  async function confirmUndoPayment() {
    const d = dialog;
    if (!d || d.saving || !begin()) return;
    const isRefund = d.type === 'undoRefund';
    setDialog({ ...d, saving: true, failed: false });
    const result = isRefund ? await undoRefund({ paymentId: d.refund.id }) : await undoPayment(d.payment.id);
    end(result.status);
    // Closed meanwhile (Hide private details switched on mid-save): the page says how it went.
    const open = stillOpen(d);
    if (result.status === 'error' && open) {
      // Didn't reach the database: the box stays open with its amber note; pressing again retries.
      setDialog((current) => (current ? { ...current, saving: false, failed: true } : current));
      return;
    }
    if (open) {
      setDialog(null);
      if (d.opener) focusSoon(d.opener);
    }
    if (result.status !== 'ok') {
      // Other refusals: today's handling (amber bar, reload; the general words while hidden). No
      // Retry: 'error' (the only status that offers one) was handled above, inside the box.
      if (open) rowProblem(result.status, d.row, { text: T.actionFailed }, true);
      else closedPaymentProblem(result.status);
      return;
    }
    rowDone();
    reloadQuiet();
    // Today's toast, no Undo ("Refund undone" for a refund, Star's words). Hidden now: the general
    // words ("Payment undone" would say they had paid).
    showToast(hiddenNowRef.current ? T.TOAST_CHANGES_SAVED : isRefund ? T.TOAST_REFUND_UNDONE : T.paymentUndoneToast(d.name), { icon: false });
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
  // The camper read before Undo payment, Edit payment or Delete permanently didn't give what the
  // box needs. status 'error' = it didn't reach the database: the bar offers Retry, which clears
  // the bar and repeats the same read (design review S-2, rulebook v1.051). `again` starts it
  // without `from` — the Camper detail has closed by then, so the box opens on its own. (No reload
  // after a failed read: it would fail too and put its own bar over this one's Retry.)
  // Anything else (the camper or the payment is gone, someone changed it): ROSTER_STALE ("Someone
  // else changed this just now …") and the roster reloads — reading again wouldn't help, so no Retry.
  // Either way the bar is brought into view (it sits at the top of the page; the person may be far
  // down the roster): with Retry, focus goes to Retry; without, back to the ⋯ / name that started it.
  function camperReadProblem(status, again, opener) {
    if (status === 'error') {
      setBanner({
        text: T.LOAD_CAMPER_FAILED,
        reveal: true, // scrolled into view, focus on its Retry (useRevealRetryBar below)
        opener, // the ⋯ / name that started it: focus may move from there to Retry
        retry: () => {
          setBanner(null);
          again();
        },
      });
    } else {
      setBanner({ text: T.ROSTER_STALE, reveal: true, opener }); // scrolled into view, focus back on the opener
      reloadQuiet();
    }
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
    if (refundStoodMeanwhile(result, from, opener)) return;
    const payment = result.status === 'ok' ? activePayment(result.payments) : null;
    if (!payment) {
      leaveDetail(from);
      camperReadProblem(result.status, () => startEditPayment(row, opener), opener);
      return;
    }
    // The name comes from this fresh read (as Undo payment's box does), not from `row`: after a
    // Retry, `row` is the roster row from the first, failed try, and the name may have changed since.
    // `form`: what is typed, kept here so a screen lock never loses it (patchForm).
    openDialog({ type: 'payment', row, name: T.camperLabel(result.camper), payment, opener, form: editPaymentForm(payment) });
  }

  // ===== Record refund (admins, an overpaid camper; rulebook v0.743, v1.039, v1.040) =====
  // Camper detail is read first, as for Edit payment: the box shows what was paid and how much is
  // overpaid NOW, and the save sends this read's version (anyone changing the camper since → stale).
  // Nothing overpaid any more (someone else handed it back, or changed the days), or the camper
  // gone: "Someone else changed this just now …" and the roster reloads. A refund that already
  // stands is fine: after a partial refund the rest is recorded as a second refund (v0.744). A
  // failed read: the bar with Retry. From Camper detail (`from`) the box takes the detail's place in
  // one update.
  async function startRecordRefund(row, opener, from = null) {
    if (!isAdmin || !begin()) return;
    const result = await loadCamperDetail(row.id);
    end(result.status === 'ok' ? 'ok' : result.status);
    if (result.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (detailGone(from)) return;
    if (hiddenNowRef.current) return; // switched on while this loaded: the money dialog doesn't open
    const camper = result.status === 'ok' ? result.camper : null;
    const over = camper ? overpaidCents(camper) : 0;
    if (!camper || camper.status !== 'active' || over <= 0) {
      leaveDetail(from);
      camperReadProblem(result.status, () => startRecordRefund(row, opener), opener);
      return;
    }
    // The payments that stay in the history (the box's note: "The $315 payment …" / "The 2 payments ($315) …").
    const standing = standingPayments(result.payments);
    openDialog({
      type: 'refund',
      row,
      camper,
      name: T.camperLabel(camper),
      paymentCount: standing.length,
      paymentsCents: standing.reduce((total, p) => total + (Number.isInteger(p.amountCents) ? p.amountCents : 0), 0),
      opener,
      form: refundForm(over, today), // what is typed, kept here so a screen lock never loses it (patchForm)
    });
  }
  // The box's Save: the refund at THIS DEVICE's school (the desk that hands the money back, v1.040 —
  // the same school Mark paid's money goes to). → the answer, for the box (refund_too_large, notes).
  async function saveRefund(d, values) {
    const result = await recordRefund({
      camperId: d.camper.id,
      expectedVersion: d.camper.version,
      method: values.method,
      amountCents: values.amountCents,
      refundedOn: values.refundedOn,
      school: paymentSchoolFor(deviceLocation),
    });
    if (result.status === 'ok') {
      if (stillOpen(d)) closeDialog();
      rowDone();
      reloadQuiet();
      // Hidden now (switched on while this saved): the general words, no Undo — as Edit payment.
      if (hiddenNowRef.current) {
        showToast(T.TOAST_CHANGES_SAVED, { icon: false });
        return result;
      }
      // "Refund recorded" · Undo (5 seconds, v0.743 (3)): the Undo reverses this refund (by its id).
      const refundId = result.paymentId;
      showToast(T.TOAST_REFUND_RECORDED, {
        icon: false,
        action: { label: T.UNDO, onAction: () => runUndo(() => undoRefund({ paymentId: refundId }), { money: true }) },
      });
      return result;
    }
    if (!stillOpen(d)) closedPaymentProblem(result.status); // closed meanwhile (Hide private details)
    else if (result.status === 'no_access') onNoAccess();
    else if (result.status === 'not_allowed') onRefreshProfile();
    else if (result.status === 'refund_too_large' || result.status === 'stale') reloadQuiet(); // the box says it; the roster catches up
    return result;
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
      camperReadProblem(result.status, () => startDeleteCamper(row, opener), opener);
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

  // ===== Print receipt (design review C3, rulebook v0.734; Star's openReceipt, v0.518) =====
  // The shared receipt, filled from camp_camper_detail + both schools + the reader's name
  // (get_my_profile, called when it opens; a failed call just leaves the name out — Star's Q7 A).
  function openReceipt(camperId, opener, onTop) {
    setMenu(null);
    const key = Date.now();
    setReceipt({ key, camperId, opener, onTop, data: null, failed: false, notFound: false });
    readReceipt(camperId, key);
  }
  async function readReceipt(camperId, key) {
    const schoolsRead = schoolsRef.current ? Promise.resolve({ status: 'ok', schools: schoolsRef.current }) : loadSchools();
    const [detail, schools, name] = await Promise.all([loadCamperDetail(camperId), schoolsRead, loadMyName()]);
    if (detail.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (schools.status === 'ok') schoolsRef.current = schools.schools;
    // The camp as the page has it now (read from the live load, so a reload since opening counts).
    const current = liveRef.current.data;
    setReceipt((open) => {
      if (!open || open.key !== key) return open; // closed, or another receipt opened meanwhile
      if (detail.status === 'not_found') return { ...open, notFound: true };
      if (detail.status !== 'ok' || !current?.camp) return { ...open, failed: true };
      // Offline for the schools only: the receipt shows without the schools' lines (as Star).
      const data = buildCampReceipt({
        detail,
        camp: current.camp,
        campDays: current.days ?? [],
        campExtras: current.extras ?? [],
        schools: schools.status === 'ok' ? schools.schools : [],
        printedOn: campToday(), // today at the school
        printedByName: name,
      });
      return { ...open, data };
    });
  }
  function closeReceipt() {
    const r = receipt;
    setReceipt(null);
    // On top of Camper detail, the shared dialog puts focus back on its opener (returnFocusTo).
    // From ⋯: back to the row's ⋯ (or the "← Camps" link, if that ⋯ is gone).
    if (r && !r.onTop) focusSoon(() => (r.opener?.isConnected ? r.opener : document.querySelector('.ev-back')));
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
    onPayingBy: (row, anchor) => openDialog({ type: 'paying', row, opener: anchor, form: payingByForm(row.payingBy) }),
    onEdit: (row, anchor) => openCamper(row, anchor, true),
    onReview: (row, anchor) => openCompareFor(row, anchor),
    onWithdraw: (row) => doWithdraw(row),
    onRestore: (row) => doWithdraw(row, true),
    onEditPayment: (row, anchor) => startEditPayment(row, anchor),
    onUndoPayment: (row, anchor) => startUndoPayment(row, anchor),
    onRecordRefund: (row, anchor) => startRecordRefund(row, anchor),
    onUndoRefund: (row, anchor) => startUndoRefund(row, anchor),
    onPrintReceipt: (row, anchor) => openReceipt(row.id, anchor, false),
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
      onUndoPayment: (row) => startUndoPayment(row, opener, from),
      onEditPayment: (row) => startEditPayment(row, opener, from),
      onRecordRefund: (row) => startRecordRefund(row, opener, from),
      onUndoRefund: (row) => startUndoRefund(row, opener, from),
      // Print receipt opens ON TOP of the detail (v1.100), which stays open; focus goes back to the
      // pressed "More" button when the receipt closes.
      onPrintReceipt: (row, button) => openReceipt(row.id, button ?? null, true),
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
          // Phones: "Fill in for a family" first (v0.741); PC / tablet have the header button instead.
          fillIn: isPhone ? { reason: fillInBlocked, onSelect: () => openFillIn(menu.anchor) } : null,
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
          // History's "(whole family)" (v0.736): how many campers share this camper's sign-up (one
          // family form) — counted from the roster, which has every camper of the camp.
          familySize={(() => {
            const signupId = roster.find((r) => r.id === dialog.camperId)?.signupId;
            return signupId ? roster.filter((r) => r.signupId === signupId).length : 1;
          })()}
          isPhone={isPhone}
          // Touch screens: the ⋯ items are under the detail's More, so its overpaid hint says "More".
          isTouch={isTouch}
          hidden={hidden}
          detailsHidden={detailsHidden}
          startInEdit={dialog.startInEdit}
          // Touch screens have no ⋯ on the roster: its items are in the detail instead (CP5).
          actions={(() => {
            if (!isTouch) return null;
            const row = roster.find((r) => r.id === dialog.camperId);
            return row ? camperMenuItems(row, { isAdmin, busy, anchor: null, h: detailHandlers(dialog), detailsHidden }) : null;
          })()}
          // PC / tablet without touch: the Print receipt button at the end of Payments (v0.734);
          // on touch it is only in "More" (the actions above), never twice.
          onPrintReceipt={isTouch ? null : (opener) => openReceipt(dialog.camperId, opener, true)}
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
      // Registration link (rulebook v0.733, design review C11): the dashboard's shared box with
      // Camps' parts — the camp's name, Camps' line (can families sign up now?), ONE link for the
      // camp with Camps' heading ("Both schools · held at Worcester", or just "Worcester" for a
      // one-school camp), no flyer. The box copies the link and saves the QR picture itself: a
      // failure shows its amber note INSIDE the box (shared words), and the PNG is named
      // "April Vacation Camp QR code.png" (both schools) or "Veterans Day Camp - Worcester QR
      // code.png" (one school: the box adds the school when `school` is set — option B).
      const url = campLink(camp.publicCode); // '' for a damaged code: then no card is offered
      dialogElement = (
        <RegistrationLinkBox
          key={dialog.key}
          title={T.REGISTRATION_LINK}
          eventName={camp.name}
          intro={T.linkDialogLine(state, camp)}
          links={url ? [{ url, school: camp.bothSchools ? null : T.schoolName(camp.locationCode), heading: T.campSchoolLine(camp) }] : []}
          onCopied={() => showToast(T.TOAST_LINK_COPIED, { icon: false })}
          onClose={closeDialog}
          isPhone={isPhone}
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
          form={dialog.form}
          onForm={(patch) => patchForm(d, patch)}
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
          name={dialog.name}
          payment={dialog.payment}
          today={today}
          isPhone={isPhone}
          form={dialog.form}
          onForm={(patch) => patchForm(d, patch)}
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
            // A refund was recorded meanwhile (0039): the box says "Undo the refund first.", and the
            // roster reloads so ⋯ shows Edit payment gray.
            else if (result.status === 'refund_stands') reloadQuiet();
            return result.status;
          }}
        />
      );
    } else if (!hidden && !detailsHidden && dialog.type === 'refund') {
      // Record refund (v0.743): Star's box with Camps' words (RefundDialog.jsx). Never while private
      // details are hidden: switching them on closes it.
      const d = dialog;
      dialogElement = (
        <RefundDialog
          key={dialog.key}
          name={dialog.name}
          paidCents={dialog.camper.paidCents ?? 0}
          paymentsCents={dialog.paymentsCents}
          paymentCount={dialog.paymentCount}
          signedUpOn={dialog.camper.signedUpOn ?? null}
          today={today}
          isPhone={isPhone}
          form={dialog.form}
          onForm={(patch) => patchForm(d, patch)}
          onClose={closeDialog}
          onSave={(values) => saveRefund(d, values)}
        />
      );
    } else if (!hidden && !detailsHidden && dialog.type === 'undoRefund') {
      dialogElement = (
        // Undo refund asks first (v0.743 (4), Star's words): the shared "are you sure?" box, as Undo
        // payment's — blue action (both lines stay in the history), first focus on "Keep refund",
        // "Undoing…" while it works; a failure keeps the box open with its amber note.
        <ConfirmBox
          key={dialog.key}
          title={T.undoRefundTitle(dialog.name)}
          keepLabel={T.KEEP_REFUND}
          actionLabel={T.UNDO_REFUND}
          actionIcon={IconArrowBackUp} // ti-arrow-back-up, the menu item's icon
          busyLabel={T.UNDOING}
          loses="something"
          busy={dialog.saving}
          failed={dialog.failed ? T.UNDO_PAYMENT_FAILED : null}
          onConfirm={confirmUndoPayment}
          onKeep={closeDialog} // ConfirmBox ignores it while the Undo works
        >
          {T.undoRefundBody(dialog.refund)}
        </ConfirmBox>
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
    } else if (!hidden && !detailsHidden && dialog.type === 'undoPayment') {
      dialogElement = (
        // Undo payment asks first (rulebook v0.730): the shared "are you sure?" box with loses
        // 'something' — blue action (the history keeps both lines), first focus on "Keep
        // payment", "Undoing…" while it works; a failure keeps the box open with its amber note.
        // From the phone's More it takes the detail's place in one update, as Delete does.
        <ConfirmBox
          key={dialog.key}
          title={T.undoPaymentTitle(dialog.name)}
          keepLabel={T.KEEP_PAYMENT}
          actionLabel={T.UNDO_PAYMENT}
          actionIcon={IconArrowBackUp} // ti-arrow-back-up, the menu item's icon
          busyLabel={T.UNDOING}
          loses="something"
          busy={dialog.saving}
          failed={dialog.failed ? T.UNDO_PAYMENT_FAILED : null}
          onConfirm={confirmUndoPayment}
          onKeep={closeDialog} // ConfirmBox ignores it while the Undo works
        >
          {T.undoPaymentBody(dialog.payment, dialog.owedAfterCents)}
        </ConfirmBox>
      );
    }
  }

  const content = menuContent();

  // The receipt (C3): on its own (from ⋯) or on top of Camper detail. Never while locked (it comes
  // back after the PIN, as the dialogs do). `hidden` = Hide private details: the shared box then
  // shows the one gray line and no Print (v1.105).
  let receiptElement = null;
  if (receipt && !screenLocked) {
    const row = roster.find((r) => r.id === receipt.camperId) ?? null;
    const name = row ? T.camperLabel(row) : null;
    receiptElement = (
      <ReceiptDialog
        receipt={receipt.data}
        sub={name ? T.receiptSub(name, camp.name) : camp.name}
        loadError={receipt.failed}
        onRetry={() => {
          setReceipt((open) => (open ? { ...open, failed: false } : open));
          readReceipt(receipt.camperId, receipt.key);
        }}
        notFound={receipt.notFound ? T.receiptNotFound(name ?? T.THIS_CAMPER) : null}
        hidden={detailsHidden}
        onClose={closeReceipt}
        isPhone={isPhone}
        onTop={receipt.onTop && dialog?.type === 'camper'}
        returnFocusTo={receipt.onTop ? receipt.opener : null}
      />
    );
  }

  return (
    <>
      {backLink}
      {isPhone ? (
        // Phones (option A's phone frame): the name and one short line (days · hours · tag), then the
        // blue Registration link button WITH its words on its own line, ⋯ beside it (rulebook v0.733,
        // design review C11, picture 14; it was an icon-only square beside the name). The check-in
        // list still starts without scrolling.
        <div className="cp-phone-head">
          <div className="phead-titles">
            <h1 className="ptitle">{camp.name}</h1>
            <p className="cp-phone-line">
              <span>{`${T.campDatesText(days.map((d) => d.day))} · ${T.timeRange(camp.startTime, camp.endTime)}`}</span>
              <span className={`ttag${tag.kind === 'open' ? ' ttag--ok' : ''}`}>{T.campTagText(tag)}</span>
            </p>
          </div>
          <div className="cp-phone-buttons">
            {/* The one blue button, with its words as on PC (ti-qrcode = registration link / QR code). */}
            <button type="button" className="btn btn-primary" data-camp-link onClick={(event) => openDialog({ type: 'link', opener: event.currentTarget })}>
              <IconQrcode size={16} aria-hidden="true" />
              {T.REGISTRATION_LINK}
            </button>
            <IconButton
              label={T.MORE_CAMP_ACTIONS}
              Icon={IconDots}
              aria-haspopup="menu"
              aria-expanded={menu?.kind === 'header' ? 'true' : 'false'}
              data-camp-head-more // where a closing Fill in box sends focus on a phone (FillInDialog's usable)
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
          {/* Fill in (v0.741): a plain button before Registration link. Gray with a tip when it can't
              be used (aria-disabled, still a Tab stop; pressing does nothing but show the tip). */}
          {/* Desk-only (Hide private details on): no tip — the gray line under the title says why,
              as Forms (v0.616), and the button points at it. */}
          <span className={`cp-fill${fillTipOpen && fillInBlocked && !fillInDeskOnly ? ' is-tip-open' : ''}`}>
            <button
              type="button"
              className={`btn${fillInBlocked ? ' is-unavailable' : ''}`}
              data-camp-fill-in
              aria-disabled={fillInBlocked ? 'true' : undefined}
              aria-describedby={fillInDeskOnly ? 'cp-fill-at-desk' : fillInBlocked ? 'cp-fill-tip' : undefined}
              onClick={(event) => openFillIn(event.currentTarget)}
              onBlur={() => setFillTipOpen(false)}
            >
              {T.FILL_IN}
            </button>
            {fillInBlocked && !fillInDeskOnly && (
              <span className="cp-fill-tip" id="cp-fill-tip" role="tooltip">
                {fillInBlocked}
              </span>
            )}
          </span>
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
            data-camp-head-more
            onClick={(event) => openMenu('header', null, event.currentTarget)}
          />
        </div>
      </div>
      )}
      {/* Hide private details on (PC / tablet): Forms' gray desk-only line under the title (v0.616,
          v0.741). Phones say it as the reason line of "Fill in for a family" in the header ⋯. */}
      {!isPhone && fillInDeskOnly && (
        <p className="phidden-line pdesk-line" id="cp-fill-at-desk">
          {/* ti-currency-dollar-off = private details hidden (the top bar's chip) */}
          <IconCurrencyDollarOff size={16} aria-hidden="true" />
          {T.FILL_IN_AT_DESK}
        </p>
      )}

      {/* The wrapper only lets useRevealRetryBar find this page's bar. display: contents
          (cp-bar-slot in camps.css) means it draws no box of its own, so the bar's spacing and the
          layout stay exactly as they were. */}
      <div className="cp-bar-slot" ref={barRef}>
        {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy || actions.busy} onDismiss={() => setBanner(null)} />}
      </div>
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
        filter={filter}
        onFilter={setFilter}
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
          // The roster flipped between table and cards (v0.747): the ⋯ a menu hangs from is gone.
          onLayoutChange: () => setMenu(null),
          onMarkPaid: (row, method) => doMarkPaid(row, method),
          onReview: (row, anchor) => openCompareFor(row, anchor),
          onReviewPair: (pair, opener) => openDialog({ type: 'compare', pair, saving: false, failed: false, opener }),
          onCheckIn: doCheckIn,
          onUndoCheckIn: doUndoCheckIn,
        }}
      />

      {content && <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />}
      {dialogElement}
      {receiptElement}
      {actions.elements}
      {fill.element}
    </>
  );
}
