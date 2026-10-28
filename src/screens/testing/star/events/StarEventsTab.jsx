// StarEventsTab.jsx — the "Events" tab of Star testing: every star testing event, both schools.
// Why it exists: approved Events mockups screens 1–10, 13 and 14 (v0.85–v0.92, v0.99, v0.107),
// gap mockups G1 (v0.500) and the sortable headers (v0.501). Built the same way as Color Belt's
// live EventsTab.jsx (src/screens/testing/events/), copied rather than shared so Color Belt's file
// doesn't change. This file is the "brain" of the tab. It:
//   - loads every Star event (useLiveLoad + eventsApi.loadStarEvents — reloads quietly after every
//     change, after unlocking, and when the browser tab becomes visible again; Star events are
//     joint for both schools, v0.58, so the location switcher changes nothing here)
//   - shows them on an Upcoming / Past switch with counts (v0.89), one status tag per event (v0.88)
//   - sorts by a clicked column header (v0.501: up, down, back to the side's own order)
//   - opens Add event / Edit event (admins), the ⋯ menu (Copy Worcester link, Copy Shrewsbury link,
//     Close / Open registration with a 5-second Undo, Edit event on phones, Delete event for admins)
//   - opens an event's page when a row is clicked (App.jsx gives it #testing/star/event/<id>)
// The form lives in StarEventDialog.jsx; the delete confirmation is the shared ConfirmBox (design
// review part 2, rulebook v0.518: "Keep event · Delete event", "Deleting…" while it works).
//
// Rules worth knowing (the same as Color Belt's tab):
//   - ONE change at a time: while a save is on its way, other changes are ignored.
//   - Dialog saves WAIT for the database; nothing is shown as saved before it is.
//   - The dialog's values live HERE, so a screen lock hides the dialog and brings it back.
//   - "stale" = someone else changed the same thing since this screen loaded it: nothing is
//     overwritten, the person is told, and the list reloads.
//   - Admin vs staff only changes what is SHOWN — the database enforces who may do what (v0.86).
//   - Nothing personal is shown: names of events, dates, counts and tags only.
// From phase 3 it also reloads quietly every 15 seconds (v0.507 Q3: Star adopts Color Belt's v0.157).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconCopy, IconDots, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import ChoiceGroup from '../../../../components/ChoiceGroup.jsx';
import ConfirmBox from '../../../../components/ConfirmBox.jsx';
import ErrorBanner from '../../../../components/ErrorBanner.jsx';
import IconButton from '../../../../components/IconButton.jsx';
import RowMenu from '../../../../components/RowMenu.jsx';
import {
  addStarEvent,
  deleteStarEvent,
  latestCreatedEvent,
  loadStarEvent,
  loadStarEvents,
  saveStarEventEdit,
  setStarRegistration,
  splitUpcomingPast,
  updateStarEvent,
} from '../../../../lib/star/eventsApi.js';
import { schoolToday } from '../../../../lib/testing/eventsApi.js';
import { registrationSwitch } from '../../../../lib/testing/eventRules.js';
import { closingAfterTestingChange, suggestedClosingDate } from '../../../../lib/star/eventDateRules.js';
import { starSchoolLinks } from '../../../../lib/star/links.js';
import { PHONE_QUERY, TOUCH_QUERY, useMediaQuery } from '../../../../lib/useMediaQuery.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../../lib/useLiveLoad.js';
import { useRowArrowNav } from '../../../../lib/useRowArrowNav.js';
import { useShortcutN } from '../../../../lib/useShortcutN.js';
import StarEventDialog, { checkStarEventForm, isStarEventFormDirty } from './StarEventDialog.jsx';
import * as T from './text.js';

// Upcoming / Past, kept while the page is open (coming back from an event page lands on the same side).
let lastSide = 'upcoming';
// The event whose page was just left with "← Star testing": its row gets keyboard focus again.
let focusEventOnReturn = null;
export function returnFocusTo(eventId) {
  focusEventOnReturn = eventId;
}

// The one thing this tab loads (Star events aren't per school): a fixed key for useLiveLoad.
const LIST_KEY = 'star-events';
const loadList = () => loadStarEvents();

// Notes that make Save unavailable until the dialog is closed and opened again.
const BLOCKING_NOTES = ['STALE_DIALOG', 'NOT_ALLOWED'];

// A menu item with no icon (the approved menus draw Close / Open registration without one); it
// keeps the label lined up with the items that have an icon.
function NoIcon() {
  return <span className="menu-icon ev-noicon" aria-hidden="true" />;
}

// Finding things on the page (for putting keyboard focus back after a dialog closes).
const find = (selector) => document.querySelector(selector);
const rowEl = (id) => find(`[data-nav-row="${id}"]`);
const moreEl = (id) => find(`[data-star-event-more="${id}"]`);
const addEventEl = () => find('[data-star-add-event]');
const usable = (element) => (element && element.isConnected && element.getClientRects().length > 0 ? element : null);

// Sorting by a column header (v0.501).
const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
  date: (a, b) => (a.testingDate < b.testingDate ? -1 : a.testingDate > b.testingDate ? 1 : 0),
  candidates: (a, b) => a.activeCount - b.activeCount,
  status: (a, b) => T.tagText(a.tag).localeCompare(T.tagText(b.tag)),
};

export default function StarEventsTab({
  isAdmin,
  panelId,
  tabId,
  renderHeader, // (addButton, staffLine) => the page header and tab bar (StarTesting.jsx)
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
  onOpenEvent, // (eventId) => void
}) {
  // Reloads quietly every 15 seconds too (v0.507 Q3, Color Belt's v0.157), so counts stay fresh.
  const live = useLiveLoad({ key: LIST_KEY, enabled: !screenLocked, load: loadList, refreshMs: LIVE_REFRESH_MS });
  const events = live.data?.events ?? [];
  const today = live.data?.today ?? schoolToday();

  // Newest values for callbacks that run later (after a save, from a toast's Undo …).
  const liveRef = useRef(live);
  const eventsRef = useRef(events);
  useLayoutEffect(() => {
    liveRef.current = live;
    eventsRef.current = events;
  });

  // ----- Device -----
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);

  // ----- State -----
  const [side, setSideState] = useState(lastSide);
  const [sort, setSort] = useState(null); // { key, dir: 1 | -1 } or null (the side's own order)
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null); // { id, anchor }
  const [banner, setBanner] = useState(null); // { text, retry?, kind? }
  const [busy, setBusy] = useState(false);
  const [notSavedId, setNotSavedId] = useState(null); // screen 14: the row whose switch change failed
  const busyRef = useRef(false);
  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
  });

  // The sort clears when the side changes (v0.501).
  function setSide(next) {
    lastSide = next;
    setSideState(next);
    setSort(null);
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
    // Right after a dialog closes the page is still "inert" for a moment: try on the next frame.
    request.tries = (request.tries ?? 0) + 1;
    if (target && target.closest('[inert]') && request.tries < 30) {
      const frame = window.requestAnimationFrame(() => setFocusTick((n) => n + 1));
      return () => window.cancelAnimationFrame(frame);
    }
    pendingFocusRef.current = null;
    target?.focus();
    return undefined;
  });

  // Back from an event page with "← Star testing": focus that event's row once the list is there.
  useEffect(() => {
    if (live.status !== 'ready' || !focusEventOnReturn) return;
    const id = focusEventOnReturn;
    focusEventOnReturn = null;
    focusLater(() => rowEl(id));
  }, [live.status]);

  // ----- Reloading -----
  // A quiet reload that fails while the list is on screen changes nothing (G1): the list stays.
  // With no list yet, useLiveLoad's 'error' status draws the "Couldn't load events" banner below.
  async function reloadQuiet() {
    return liveRef.current.reload();
  }
  async function retryLoad() {
    const result = await liveRef.current.reload();
    if (result === 'ok') setBanner(null);
  }

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  // Locking closes the ⋯ menu (focus goes back to its button after unlocking). Dialogs only hide.
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

  // ===== Rows: Upcoming / Past and the order =====
  const { upcoming, past } = splitUpcomingPast(events); // Upcoming soonest first, Past most recent first
  let shown = side === 'past' ? past : upcoming;
  if (sort) shown = [...shown].sort((a, b) => sort.dir * SORTERS[sort.key](a, b));
  const shownRef = useRef(shown);
  useLayoutEffect(() => {
    shownRef.current = shown;
  });

  function toggleSort(key) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: 1 };
      if (current.dir === 1) return { key, dir: -1 };
      return null; // third click: back to the side's own order
    });
  }

  // ===== Dialogs =====
  function openDialog(next) {
    clearToast();
    setMenu(null);
    setDialog({
      key: Date.now(),
      touched: {},
      triedSave: false,
      note: null,
      blocked: false,
      duplicateName: null,
      saving: false,
      moreOpen: false,
      today: schoolToday(), // "today" as the dialog opens (not when the list loaded)
      ...next,
    });
  }
  function patchDialog(patch) {
    setDialog((current) => (current ? { ...current, ...patch } : current));
  }

  function openAddEvent(opener) {
    if (!isAdmin || busyRef.current) return;
    // Start time and Where are copied from the event added most recently (v0.87); the very first
    // event starts with both on "Choose…" (screen 4).
    const last = latestCreatedEvent(eventsRef.current);
    const values = {
      name: '',
      testingDate: '',
      startTime: last?.startTime ?? null,
      whereCode: last?.whereCode ?? null,
      open: false, // new events start Closed (v0.85)
      autoClose: true,
      closingDate: '', // "Choose…" until a testing date is chosen (v0.503 item 2)
      note: '',
    };
    openDialog({ type: 'event', mode: 'add', eventId: null, values, initial: values, copiedFrom: last?.name ?? null, opener });
  }

  function openEditEvent(event, opener) {
    if (!isAdmin || busyRef.current) return;
    const values = {
      name: event.name,
      testingDate: event.testingDate,
      startTime: event.startTime,
      whereCode: event.whereCode,
      open: event.registrationOpen,
      autoClose: event.autoCloseOn !== null,
      // Ticking the box again brings back the event's own date, or 7 days before, never before
      // today (G4, v0.503 item 6).
      closingDate: event.autoCloseOn ?? suggestedClosingDate(event.testingDate, schoolToday()),
      note: event.note ?? '',
    };
    openDialog({ type: 'event', mode: 'edit', eventId: event.id, values, initial: values, snapshot: event, moreOpen: Boolean(event.note), opener });
  }

  function changeValues(patch) {
    setDialog((current) => {
      if (!current || current.saving) return current;
      const values = { ...current.values, ...patch };
      let closingMoved = current.closingMoved ?? null;
      // The testing date changed (Add and Edit): a following closing date follows, a hand-set one
      // stays unless it would be after the new date, a passed one never moves (v0.503 item 7 —
      // the rules and their checks live in lib/star/eventDateRules.js).
      if ('testingDate' in patch && patch.testingDate !== current.values.testingDate) {
        const result = closingAfterTestingChange({
          closingDate: current.values.closingDate,
          oldTestingDate: current.values.testingDate,
          newTestingDate: patch.testingDate,
          today: current.today,
        });
        values.closingDate = result.closingDate;
        closingMoved = result.moved ? result.closingDate : null;
      }
      if ('closingDate' in patch) closingMoved = null; // picked by hand: the note has done its job
      // Ticking the box on an event that had no closing date: 7 days before the testing date as it
      // is now, never before today (G4). An event that had one gets its own date back (kept above).
      if (patch.autoClose === true && !current.initial.autoClose) {
        values.closingDate = suggestedClosingDate(values.testingDate, current.today);
        closingMoved = null;
      }
      const note = current.note && !BLOCKING_NOTES.includes(current.note) ? null : current.note;
      return { ...current, values, note, closingMoved };
    });
  }
  function touch(field) {
    setDialog((current) => (current && !current.touched[field] ? { ...current, touched: { ...current.touched, [field]: true } } : current));
  }

  function focusAfterCancel(d) {
    if (d.type === 'delete') focusLater(() => moreEl(d.id), () => d.opener);
    else if (d.mode === 'add') focusLater(() => d.opener, addEventEl);
    else focusLater(() => d.opener, () => rowEl(d.eventId));
  }
  function cancelDialog() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    setDialog(null);
    focusAfterCancel(d);
  }
  // Esc, the backdrop, the phone back arrow and the browser's Back (v0.83): close when nothing
  // was typed, otherwise keep the dialog open with "Unsaved changes…" (v0.46, v0.56).
  function requestClose() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    if (d.type === 'delete' || !isStarEventFormDirty(d)) {
      cancelDialog();
      return;
    }
    // noteAt changes on every Esc / Back, so the dialog scrolls the note into view each time.
    if (!BLOCKING_NOTES.includes(d.note)) patchDialog({ note: 'UNSAVED', noteAt: Date.now() });
  }

  // A refusal of Add / Edit event: what the dialog shows (screen 6 and the house notes).
  function handleDialogProblem(status, typedName) {
    if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (status === 'not_allowed') {
      patchDialog({ saving: false, note: 'NOT_ALLOWED', blocked: true });
      onRefreshProfile();
    } else if (status === 'stale' || status === 'not_found') {
      patchDialog({ saving: false, note: 'STALE_DIALOG', blocked: true });
      reloadQuiet();
    } else if (status === 'duplicate_name') {
      patchDialog({ saving: false, duplicateName: typedName });
    } else if (status === 'invalid' || status === 'finished') {
      patchDialog({ saving: false, note: 'INVALID_DIALOG' });
    } else {
      patchDialog({ saving: false, note: 'SAVE_FAILED' }); // didn't reach the database (screen 14's rule 3.5)
    }
  }

  // ----- Save: Add / Edit event -----
  async function saveEvent() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const record = d.snapshot ?? null;
    const check = checkStarEventForm(d, eventsRef.current, d.today, record);
    if (!check.canSave) {
      patchDialog({ triedSave: true }); // shows the messages for anything still missing
      return;
    }
    if (check.sameAsSaved) {
      setDialog(null);
      focusAfterCancel(d);
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const p = check.payload;

    if (d.mode === 'add') {
      const result = await addStarEvent(p);
      endWrite(result.status);
      if (result.status !== 'ok') {
        handleDialogProblem(result.status, p.name);
        return;
      }
      setDialog(null);
      if (side !== 'upcoming') setSide('upcoming'); // a new event is always upcoming
      const reloaded = reloadQuiet();
      const newId = result.id;
      const newVersion = result.version;
      showToast(T.TOAST_EVENT_ADDED, {
        icon: false,
        action: {
          label: T.UNDO,
          // Undo = delete the event that was just added (it has no candidates yet).
          onAction: () =>
            runUndo(() => deleteStarEvent({ eventId: newId, expectedVersion: newVersion, expectedCandidateCount: 0, expectedPaymentTotalCents: 0 }), {
              find: addEventEl,
            }),
        },
      });
      focusLater(() => rowEl(newId), addEventEl, reloaded);
      return;
    }

    // Edit: the details first, then (only if it changed) the Registration switch, which has its
    // own database function with its own role rules (contract 0006 §11 item 7).
    const result = await saveStarEventEdit({
      eventId: d.eventId,
      expectedVersion: record.version,
      name: p.name,
      testingDate: p.testingDate,
      startTime: p.startTime,
      whereCode: p.whereCode,
      autoCloseOn: p.autoCloseOn,
      note: p.note,
      registrationOpen: p.registrationOpen,
      previousRegistrationOpen: record.registrationOpen,
      // v0.504: never reopen registration by itself (its state is worked out fresh at save time)
      previous: { testingDate: record.testingDate, registrationOpen: record.registrationOpen, autoCloseOn: record.autoCloseOn, firstOpenedAt: record.firstOpenedAt },
    });
    if (result.status !== 'ok') {
      endWrite(result.status);
      handleDialogProblem(result.status, p.name);
      return;
    }
    const switchFailed = result.registration && result.registration.status !== 'ok' ? result.registration.status : null;
    const keptClosed = result.keptClosed ?? null; // v0.504
    endWrite(switchFailed ?? (keptClosed && keptClosed.status !== 'ok' ? keptClosed.status : 'ok'));
    setDialog(null);
    const reloaded = reloadQuiet();
    if (keptClosed) {
      if (keptClosed.status === 'ok') {
        // Closed again at once. Undo undoes only that close: the switch back to Open with the
        // version then current (the edit itself stays — a date moved back into the past would be
        // refused by the database).
        const closedVersion = result.version;
        showToast(T.TOAST_CHANGES_SAVED_KEPT_CLOSED, {
          icon: false,
          action: {
            label: T.UNDO,
            onAction: () =>
              runUndo(() => setStarRegistration({ eventId: d.eventId, expectedVersion: closedVersion, open: true }), {
                find: () => rowEl(d.eventId),
                doneText: T.TOAST_REGISTRATION_OPEN, // it reopens, so it says so (not "Undone")
              }),
          },
        });
      } else {
        // The details were saved but the close didn't go through: registration IS open. No
        // "Changes saved" toast; the amber banner (button "Close registration") and the row's
        // amber "Not saved" tag stay until the close works (rule 3.5). Set before a lock, so it is
        // still there after unlocking.
        setNotSavedId(d.eventId);
        setBanner({ kind: 'keepClosed', text: T.SAVED_BUT_OPEN, retry: () => closeAfterEdit(d.eventId), retryLabel: T.CLOSE_REGISTRATION });
        if (keptClosed.status === 'no_access') onNoAccess();
      }
      focusLater(() => d.opener, () => rowEl(d.eventId), reloaded);
      return;
    }
    if (switchFailed) {
      // The details were saved; only the switch wasn't.
      if (switchFailed === 'no_access') onNoAccess();
      else setBanner({ text: T.statusMessage(p.registrationOpen ? 'open' : 'close', switchFailed, { name: p.name }).text });
    } else {
      // Undo puts the old details back (and the old switch position, if it changed).
      const previous = {
        name: record.name,
        testingDate: record.testingDate,
        startTime: record.startTime,
        whereCode: record.whereCode,
        autoCloseOn: record.autoCloseOn,
        note: record.note,
      };
      const switchChanged = result.registration !== null;
      const savedVersion = result.version;
      showToast(T.TOAST_CHANGES_SAVED, {
        icon: false,
        action: {
          label: T.UNDO,
          onAction: () =>
            runUndo(
              async () => {
                const back = await updateStarEvent({ eventId: d.eventId, expectedVersion: savedVersion, ...previous });
                if (back.status !== 'ok' || !switchChanged) return back;
                return setStarRegistration({ eventId: d.eventId, expectedVersion: back.version, open: record.registrationOpen });
              },
              { find: () => rowEl(d.eventId) },
            ),
        },
      });
    }
    focusLater(() => d.opener, () => rowEl(d.eventId), reloaded);
  }

  // v0.504 Retry: close registration of an event an Edit save left open. Reads the event fresh (its
  // version may have changed since), closes it only if it is still open.
  async function closeAfterEdit(eventId) {
    if (!beginWrite()) return;
    const fresh = await loadStarEvent(eventId);
    if (fresh.status !== 'ok') {
      endWrite(fresh.status === 'not_found' ? 'ok' : fresh.status);
      if (fresh.status === 'no_access') onNoAccess();
      else if (fresh.status === 'not_found') {
        setBanner(null);
        reloadQuiet();
      }
      return; // offline: the banner stays, Retry again
    }
    if (fresh.event.state !== 'open') {
      endWrite('ok');
      setBanner(null);
      setNotSavedId(null);
      reloadQuiet();
      return;
    }
    const result = await setStarRegistration({ eventId, expectedVersion: fresh.event.version, open: false });
    endWrite(result.status);
    if (result.status === 'ok') {
      setBanner(null);
      setNotSavedId(null);
      showToast(T.TOAST_REGISTRATION_CLOSED, { icon: false });
      reloadQuiet();
    } else if (result.status === 'no_access') {
      onNoAccess();
    }
    // any other answer: the banner stays with its Retry
  }

  // ===== Undo =====
  async function runUndo(call, focus = null) {
    if (!beginWrite()) return;
    const result = await call();
    endWrite(result.status);
    const status = result.status;
    if (status === 'ok') {
      setBanner((current) => (current?.kind === 'undo' ? null : current));
      showToast(focus?.doneText ?? T.TOAST_UNDONE, { icon: false });
      const reloaded = reloadQuiet();
      if (focus) focusLater(focus.find, focus.fallback ?? addEventEl, reloaded);
    } else if (status === 'no_access') {
      onNoAccess();
    } else if (status === 'not_allowed') {
      setBanner({ text: T.EVENTS_NOT_ALLOWED });
      onRefreshProfile();
    } else if (['stale', 'not_found', 'duplicate_name', 'invalid', 'finished'].includes(status)) {
      setBanner({ text: T.UNDO_STALE });
      reloadQuiet();
    } else {
      setBanner({ kind: 'undo', text: T.UNDO_FAILED, retry: () => runUndo(call, focus) });
    }
  }

  // ===== Close / Open registration (instant, with a 5-second Undo — v0.85, v0.86) =====
  async function switchRegistration(event, open, isUndo = false, expectedVersion = event.version) {
    if (!beginWrite()) return;
    const result = await setStarRegistration({ eventId: event.id, expectedVersion, open });
    endWrite(result.status);
    const status = result.status;
    const action = open ? 'open' : 'close';
    if (status === 'ok') {
      setNotSavedId(null);
      setBanner((current) => (current?.kind === 'switch' ? null : current));
      const reloaded = reloadQuiet();
      if (isUndo) {
        showToast(T.TOAST_UNDONE, { icon: false });
        return;
      }
      // An admin opening after the closing date has passed also removes the date (v0.85, screen 9).
      const removedDate = open && event.autoCloseOn !== null && today > event.autoCloseOn;
      const text = open ? (removedDate ? T.TOAST_REGISTRATION_OPEN_DATE_REMOVED : T.TOAST_REGISTRATION_OPEN) : T.TOAST_REGISTRATION_CLOSED;
      const newVersion = result.version;
      showToast(text, {
        icon: false,
        action: { label: T.UNDO, onAction: () => switchRegistration(event, !open, true, newVersion) },
      });
      await reloaded;
    } else if (status === 'no_access') {
      onNoAccess();
    } else if (status === 'not_allowed') {
      setBanner({ text: T.statusMessage(action, status, { name: event.name }).text });
      onRefreshProfile();
      reloadQuiet();
    } else if (['finished', 'stale', 'not_found', 'invalid'].includes(status)) {
      setBanner({ text: isUndo && status !== 'finished' ? T.UNDO_STALE : T.statusMessage(action, status, { name: event.name }).text });
      reloadQuiet();
    } else {
      // Didn't reach the database (screen 14): the row shows "Not saved", the banner offers Retry
      // and stays until it works or is dismissed (rule 3.5).
      setNotSavedId(event.id);
      setBanner({
        kind: 'switch',
        text: T.statusMessage(action, 'error', { name: event.name }).text,
        retry: () => switchRegistration(event, open, isUndo, expectedVersion),
      });
    }
  }

  // Close / Open registration chosen in the ⋯ menu: keyboard focus goes back to that row's ⋯
  // button once the change is saved and the list reloaded (the menu itself is gone).
  function switchFromMenu(event, open) {
    const done = switchRegistration(event, open);
    focusLater(() => moreEl(event.id), null, done);
  }

  // ===== Copy Worcester link / Copy Shrewsbury link (v0.99) =====
  async function copyLink(link) {
    try {
      if (!link || !navigator.clipboard) throw new Error('No clipboard');
      await navigator.clipboard.writeText(link);
      showToast(T.TOAST_LINK_COPIED, { icon: false });
    } catch {
      setBanner({ text: T.COPY_FAILED });
    }
  }

  // ===== Delete event (permanent; the numbers in the sentence are read fresh first) =====
  async function startDelete(event, anchor) {
    if (!isAdmin || !beginWrite()) return;
    const fresh = await loadStarEvent(event.id);
    endWrite(fresh.status === 'not_found' ? 'ok' : fresh.status);
    if (fresh.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (fresh.status === 'not_found') {
      setBanner({ text: T.STALE });
      reloadQuiet();
      return;
    }
    if (fresh.status !== 'ok') {
      setBanner({ text: T.LOAD_EVENTS_FAILED, retry: retryLoad });
      return;
    }
    const e = fresh.event;
    openDialog({
      type: 'delete',
      id: event.id,
      name: e.name,
      activeCount: e.activeCount,
      withdrawnCount: e.withdrawnCount,
      // What the database checks: EVERY candidate (withdrawn too) and the NET payment total.
      args: { eventId: event.id, expectedVersion: e.version, expectedCandidateCount: e.registrationCount, expectedPaymentTotalCents: e.paymentTotalCents },
      failed: false,
      index: shownRef.current.findIndex((x) => x.id === event.id),
      opener: anchor,
    });
  }

  async function confirmDelete() {
    const d = dialogRef.current;
    if (!d || d.saving || !beginWrite()) return;
    patchDialog({ saving: true, failed: false });
    const result = await deleteStarEvent(d.args);
    endWrite(result.status);
    const status = result.status;
    if (status === 'ok') {
      setDialog(null);
      showToast(T.TOAST_EVENT_DELETED, { icon: false }); // permanent: no Undo (v0.91)
      const reloaded = reloadQuiet();
      focusLater(
        () => {
          const list = shownRef.current;
          const target = list[d.index] ?? list[d.index - 1];
          return target ? rowEl(target.id) : null;
        },
        addEventEl,
        reloaded,
      );
    } else if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (status === 'not_allowed') {
      setDialog(null);
      setBanner({ text: T.EVENTS_NOT_ALLOWED });
      onRefreshProfile();
      focusLater(() => moreEl(d.id));
    } else if (['stale', 'not_found', 'invalid'].includes(status)) {
      setDialog(null);
      setBanner({ text: T.STALE });
      reloadQuiet();
      focusLater(() => moreEl(d.id));
    } else {
      patchDialog({ saving: false, failed: true });
    }
  }

  // ===== The ⋯ menu =====
  function openMenu(event, anchor) {
    setMenu((current) => (current && current.id === event.id ? null : { id: event.id, anchor }));
  }
  function closeMenu(reason) {
    const current = menu;
    setMenu(null);
    if (current && (reason === 'escape' || reason === 'tab')) current.anchor?.focus();
  }

  function menuContent() {
    if (!menu) return null;
    const event = events.find((e) => e.id === menu.id);
    if (!event) return null;
    // Copy Worcester link · Copy Shrewsbury link (staff too, v0.92 detail 16c)
    const items = starSchoolLinks(event).map((s) => ({
      key: `copy-${s.locationCode}`,
      label: T.copySchoolLink(s.school),
      Icon: IconCopy,
      disabled: !s.link,
      onSelect: () => {
        copyLink(s.link);
        focusLater(() => moreEl(event.id)); // back to this row's ⋯ (the menu is gone)
      },
    }));
    // Past events have no Open / Close registration (it closed by itself, v0.88).
    if (event.state !== 'finished') {
      if (event.state === 'open') {
        items.push({ key: 'close', label: T.CLOSE_REGISTRATION, Icon: NoIcon, disabled: busy, onSelect: () => switchFromMenu(event, false) });
      } else {
        // Staff can't reopen once the closing date has passed (v0.86): grayed, with the reason.
        const allowed = registrationSwitch({ event, open: true, isAdmin, today }).status === 'ok';
        items.push({
          key: 'open',
          label: allowed ? (
            T.OPEN_REGISTRATION
          ) : (
            <span className="ev-menu-two st-menu-two">
              <span>{T.OPEN_REGISTRATION}</span>
              <span className="ev-menu-reason">{T.REOPEN_NEEDS_ADMIN}</span>
            </span>
          ),
          Icon: NoIcon,
          disabled: busy || !allowed,
          onSelect: () => switchFromMenu(event, true),
        });
      }
    }
    // Phones have no pencil on the row, so Edit event is in the menu there (screen 8).
    if (isAdmin && isPhone) items.push({ key: 'edit', label: T.EDIT_EVENT, Icon: IconEdit, disabled: busy, onSelect: () => openEditEvent(event, menu.anchor) });
    if (isAdmin) {
      items.push({ key: 'delete', label: T.DELETE_EVENT, Icon: IconTrash, danger: true, separatorBefore: true, disabled: busy, onSelect: () => startDelete(event, menu.anchor) });
    }
    return { title: event.name, subtitle: T.shortDate(event.testingDate), label: T.moreFor(event.name), items };
  }

  // ===== Keyboard: ↑ ↓ Enter on rows, N for Add event (PC) =====
  const nav = useRowArrowNav({
    rowKeys: shown.map((event) => event.id),
    onOpen: (id) => onOpenEvent(id),
  });
  const addShown = isAdmin && live.status === 'ready'; // G1: Add event appears once the list has loaded
  useShortcutN({
    enabled: addShown && dialog === null && menu === null && !screenLocked && !busy,
    onPress: () => openAddEvent(addEventEl()),
  });

  // ===== Drawing =====
  const addEventButton = addShown ? (
    <button type="button" className="btn btn-primary" data-star-add-event onClick={(clickEvent) => openAddEvent(clickEvent.currentTarget)}>
      {/* ti-plus = add new */}
      <IconPlus size={16} aria-hidden="true" />
      {T.ADD_EVENT}
    </button>
  ) : null;

  function tagFor(event) {
    if (notSavedId === event.id) {
      // Amber beats every other tag (rule 8)
      return (
        <span className="ttag ttag--warn">
          <IconAlertTriangle size={12} aria-hidden="true" />
          {T.TAG_NOT_SAVED}
        </span>
      );
    }
    return <span className={`ttag${T.tagIsGreen(event.tag) ? ' ttag--ok' : ''}`}>{T.tagText(event.tag)}</span>;
  }

  // A sortable column header (v0.501, Color Belt's live look): a plain word that is a button.
  function header(key, label, numeric = false) {
    const active = sort?.key === key;
    return (
      <span className={`ev-th${numeric ? ' num' : ''}`} role="columnheader" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="ev-sort" onClick={() => toggleSort(key)} aria-label={T.sortBy(label)}>
          {label}
          {active && <span aria-hidden="true">{sort.dir === 1 ? ' ↑' : ' ↓'}</span>}
        </button>
      </span>
    );
  }

  let body;
  if (live.status === 'loading' || live.status === 'idle') {
    // G1: 3 gray placeholder rows, the first time only
    body = (
      <div className="clist tskeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING_EVENTS}</span>
        {[0, 1, 2].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (live.status === 'error') {
    // G1: the list can't load — the banner with Retry and no ✕
    body = <ErrorBanner text={T.LOAD_EVENTS_FAILED} onRetry={() => liveRef.current.reload()} />;
  } else if (live.status === 'noAccess') {
    body = null;
  } else if (shown.length === 0) {
    let text;
    if (events.length === 0) text = isAdmin ? T.NO_EVENTS_ADMIN : T.NO_EVENTS_STAFF;
    else text = side === 'past' ? T.NO_PAST : T.NO_UPCOMING;
    body = <p className="tempty ev-empty">{text}</p>;
  } else {
    body = (
      <div className={`clist ev-list${isTouch ? ' is-touch' : ''}${isAdmin && !isPhone ? ' has-edit' : ''}`} role="table" aria-label={side === 'past' ? T.PAST : T.UPCOMING}>
        {!isPhone && (
          <div className="ev-row ev-head" role="row">
            {header('name', T.COL_EVENT)}
            {header('date', T.COL_TESTING_DATE)}
            {header('candidates', T.COL_CANDIDATES, true)}
            {header('status', T.COL_STATUS)}
            <span className="ev-th" role="columnheader" aria-label={T.ACTIONS_COL} />
          </div>
        )}
        <div role="rowgroup" {...nav.containerProps}>
          {shown.map((event) => {
            const open = menu?.id === event.id;
            const selected = open || (dialog && (dialog.eventId === event.id || dialog.id === event.id) && !screenLocked);
            const more = (
              <IconButton
                label={T.moreFor(event.name)}
                Icon={IconDots}
                aria-haspopup="menu"
                aria-expanded={open ? 'true' : 'false'}
                data-star-event-more={event.id}
                tabIndex={nav.itemTabIndex(event.id)}
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation();
                  openMenu(event, clickEvent.currentTarget);
                }}
              />
            );
            const edit =
              isAdmin && !isPhone ? (
                <IconButton
                  label={T.editEventLabel(event.name)}
                  Icon={IconEdit}
                  tabIndex={nav.itemTabIndex(event.id)}
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    openEditEvent(event, clickEvent.currentTarget);
                  }}
                />
              ) : null;
            return (
              <div
                key={event.id}
                className={`ev-row${selected ? ' is-selected' : ''}${isPhone ? ' is-phone' : ''}`}
                role="row"
                aria-label={T.openEventLabel(event.name)}
                {...nav.rowProps(event.id)}
                onClick={() => onOpenEvent(event.id)}
              >
                {isPhone ? (
                  <>
                    <span className="ev-phone-main" role="cell">
                      <span className="ev-name">{event.name}</span>
                      <span className="l2">{T.eventPhoneLine(event.testingDate, event.activeCount)}</span>
                      <span className="ev-phone-tag">{tagFor(event)}</span>
                    </span>
                    <span className="acts" role="cell">
                      {more}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="ev-name" role="cell">
                      {event.name}
                    </span>
                    <span role="cell" className="nowrap">
                      {T.shortDate(event.testingDate)}
                    </span>
                    <span role="cell" className="num">
                      {event.activeCount}
                    </span>
                    <span role="cell">{tagFor(event)}</span>
                    <span className="acts" role="cell">
                      {edit}
                      {more}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ----- The open dialog (never while locked: it comes back after unlocking) -----
  let dialogElement = null;
  if (dialog && !screenLocked) {
    if (dialog.type === 'event') {
      dialogElement = (
        <StarEventDialog
          key={dialog.key}
          state={dialog}
          events={events}
          today={dialog.today}
          record={dialog.snapshot ?? null}
          isPhone={isPhone}
          onChange={changeValues}
          onTouch={touch}
          onToggleMore={() => patchDialog({ moreOpen: !dialog.moreOpen })}
          onSave={saveEvent}
          onCancel={cancelDialog}
          onRequestClose={requestClose}
        />
      );
    } else {
      dialogElement = (
        // The numbers come from the event re-read just before this opens (startDelete), and the
        // delete sends exactly what was counted: if anything changed meanwhile the database
        // answers "stale" instead of deleting something the person didn't see. The sentence names
        // no money amount, so nothing here needs hiding on a mat-side tablet (v0.249).
        <ConfirmBox
          key={dialog.key}
          title={T.deleteEventTitle(dialog.name)}
          keepLabel={T.KEEP_EVENT}
          actionLabel={T.DELETE_EVENT}
          actionIcon={IconTrash}
          busyLabel={T.DELETING}
          loses="forGood"
          busy={dialog.saving}
          failed={dialog.failed ? T.DELETE_FAILED : null}
          onKeep={cancelDialog}
          onConfirm={confirmDelete}
        >
          {T.deleteEventBody({ activeCount: dialog.activeCount, withdrawnCount: dialog.withdrawnCount })}
        </ConfirmBox>
      );
    }
  }

  const content = menu && !screenLocked ? menuContent() : null;
  const sideLabelId = `${panelId}-side`;

  return (
    <>
      {/* The staff line (v0.86) — not when there are no events at all (screen 3 shows only the
          empty line: there is no ⋯ to use). While loading it still shows (G1). */}
      {renderHeader(addEventButton, isAdmin || (live.status === 'ready' && events.length === 0) ? null : T.STAFF_LINE)}
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel">
        {banner && (
          <ErrorBanner
            text={banner.text}
            onRetry={banner.retry ? () => banner.retry() : undefined}
            retryLabel={banner.retryLabel ?? null}
            retrying={busy}
            onDismiss={() => setBanner(null)}
          />
        )}
        {/* G1: the Upcoming / Past switch appears once the list has loaded; it shows with 0 counts too (screen 3) */}
        {live.status === 'ready' && (
          <div className="ev-side">
            <span id={sideLabelId} className="visually-hidden">
              {T.EVENTS_SWITCH_LABEL}
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
        )}
        {body}
      </div>
      {content && <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />}
      {dialogElement}
    </>
  );
}
