// EventsTab.jsx — the "Events" tab of Color belt testing: the school's testing events.
// Why it exists: approved mockups E1–E14 (Star's Events design, Star v0.85–v0.92, with Color
// Belt's class times). This file is the "brain" of the tab. It:
//   - loads the selected school's events (useLiveLoad + eventsApi.loadEvents — reloads quietly
//     after every change, when the school changes, after unlocking, and when the browser tab
//     becomes visible again)
//   - shows them on an Upcoming / Past switch (v0.89), one status tag per event (v0.88)
//   - opens Add event / Edit event (admins), the ⋯ menu (Copy registration link, Close / Open
//     registration with a 5-second Undo, Edit event on phones, Delete event for admins)
//   - opens an event's page when a row is clicked (App.jsx gives it the #testing/event/<id> address)
// The drawing of the form lives in EventDialog.jsx; the delete confirmation in
// ConfirmDeleteDialog.jsx.
//
// Rules worth knowing (same as phase 1, contract 0003 §8):
//   - ONE change at a time: while a save is on its way, other changes are ignored.
//   - Dialog saves WAIT for the database; nothing is shown as saved before it is.
//   - The dialog's values live HERE, so a screen lock hides the dialog and brings it back.
//   - "stale" = someone else changed the same thing since this screen loaded it: nothing is
//     overwritten, the person is told, and the list reloads.
//   - Admin vs staff only changes what is SHOWN — the database enforces who may do what.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconCopy, IconDots, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import IconButton from '../../../components/IconButton.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { LOCATION_CODE } from '../../../lib/device.js';
import { loadClassesAndRanks } from '../../../lib/testing/api.js';
import { addEvent, deleteEvent, loadEvent, loadEvents, schoolToday, setRegistration, updateEvent } from '../../../lib/testing/eventsApi.js';
import { defaultAutoCloseOn, registrationSwitch, stateTag } from '../../../lib/testing/eventRules.js';
import { registrationLink } from '../../../lib/testing/qr.js';
import { PHONE_QUERY, TOUCH_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { useRowArrowNav } from '../../../lib/useRowArrowNav.js';
import { useShortcutN } from '../../../lib/useShortcutN.js';
import ChoiceGroup from './ChoiceGroup.jsx';
import ConfirmDeleteDialog from './ConfirmDeleteDialog.jsx';
import EventDialog, { checkEventForm, isEventFormDirty } from './EventDialog.jsx';
import { LIVE_REFRESH_MS, useLiveLoad } from './useLiveLoad.js';
import * as T from '../text.js';

// Upcoming / Past, per school, kept while the page is open (like phase 1's open classes).
const sideBySchool = new Map();

// Notes that make Save unavailable until the dialog is closed and opened again.
const BLOCKING_NOTES = ['STALE_DIALOG', 'NOT_ALLOWED'];

// A menu item with no icon (the approved menus draw Close / Open registration without one).
// It keeps the label lined up with the items that have an icon.
export function NoIcon() {
  return <span className="menu-icon ev-noicon" aria-hidden="true" />;
}

// Finding things on the page (for putting keyboard focus back after a dialog closes).
const find = (selector) => document.querySelector(selector);
const rowEl = (id) => find(`[data-nav-row="${id}"]`);
const moreEl = (id) => find(`[data-event-more="${id}"]`);
const addEventEl = () => find('[data-add-event]');
const usable = (element) => (element && element.isConnected && element.getClientRects().length > 0 ? element : null);

// Did the class have its final award set in Classes and ranks? (Not set → can't be added, §1.4.)
const awardNotSet = (cls) => !cls.finalAwardNone && !cls.finalAwardRankId;

// Sort helpers for the column headers (rule 8).
const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
  date: (a, b) => (a.testingDate < b.testingDate ? -1 : a.testingDate > b.testingDate ? 1 : 0),
  students: (a, b) => a.activeCount - b.activeCount,
  status: (a, b) => T.eventTagText(a.tag).localeCompare(T.eventTagText(b.tag)),
};

export default function EventsTab({
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
  onOpenEvent,
}) {
  const locationCode = LOCATION_CODE[school];
  const live = useLiveLoad({ key: locationCode, enabled: !screenLocked, load: loadEvents, refreshMs: LIVE_REFRESH_MS });
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
  const [side, setSideState] = useState(() => sideBySchool.get(locationCode) ?? 'upcoming');
  const [sort, setSort] = useState(null); // { key, dir: 1 | -1 } or null (the side's own order)
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null); // { id, anchor }
  const [banner, setBanner] = useState(null); // { text, retry?, kind? }
  const [busy, setBusy] = useState(false);
  const [notSavedId, setNotSavedId] = useState(null); // E14: the row whose switch change failed
  const busyRef = useRef(false);
  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
  });

  function setSide(next) {
    sideBySchool.set(locationCode, next);
    setSideState(next);
    setSort(null);
  }
  // Another school: its own remembered side; banners, menus and "Not saved" marks belonged to the old one.
  const previousCodeRef = useRef(locationCode);
  useEffect(() => {
    if (previousCodeRef.current === locationCode) return;
    previousCodeRef.current = locationCode;
    setSideState(sideBySchool.get(locationCode) ?? 'upcoming');
    setSort(null);
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

  // ----- Keyboard focus after a dialog closes (same approach as Classes and ranks) -----
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

  // ----- Reloading -----
  async function reloadQuiet() {
    const result = await liveRef.current.reload();
    if (result === 'error') setBanner({ text: T.LOAD_EVENTS_FAILED, retry: retryLoad });
    return result;
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

  // ===== Rows: state tag, Upcoming / Past, order =====
  const rows = events.map((event) => ({ ...event, tag: stateTag(event.state, event, today) }));
  const upcoming = rows.filter((event) => event.state !== 'finished');
  const past = rows.filter((event) => event.state === 'finished');
  let shown = side === 'past' ? past : upcoming;
  // Upcoming: soonest first. Past: most recent first. A clicked column header re-sorts the side.
  shown = [...shown].sort((a, b) => (side === 'past' ? -1 : 1) * SORTERS.date(a, b));
  if (sort) shown = [...shown].sort((a, b) => sort.dir * SORTERS[sort.key](a, b));

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
      touchedRows: {},
      triedSave: false,
      note: null,
      blocked: false,
      duplicateName: null,
      serverAwardClass: null,
      saving: false,
      moreOpen: false,
      ...next,
    });
  }
  function patchDialog(patch) {
    setDialog((current) => (current ? { ...current, ...patch } : current));
  }

  // The school's current classes (for the "Classes testing" list). Read fresh each time a
  // dialog opens, so a class added a minute ago in Classes and ranks is there.
  async function readClasses() {
    const result = await loadClassesAndRanks(locationCode);
    if (result.status === 'no_access') {
      onNoAccess();
      return null;
    }
    if (result.status !== 'ok') {
      setBanner({ text: T.LOAD_EVENTS_FAILED, retry: retryLoad });
      return null;
    }
    return result.classes;
  }

  async function openAddEvent(opener) {
    if (!isAdmin || !beginWrite()) return;
    const classes = await readClasses();
    endWrite(classes ? 'ok' : 'error');
    if (!classes) return;
    // "The last event" = the one created most recently; its classes and times are copied (Q3).
    const last = [...eventsRef.current].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0] ?? null;
    const rowsForm = classes.map((cls) => {
      const copied = last?.classes.find((c) => c.classId === cls.id) ?? null;
      return {
        classId: cls.id,
        className: cls.name,
        ticked: last ? copied !== null : true,
        startTime: copied?.startTime ?? null,
        endTime: copied?.endTime ?? null,
        inEvent: false,
        awardNotSet: awardNotSet(cls),
      };
    });
    const values = { name: '', testingDate: '', open: false, autoClose: true, closingDate: '', closingEdited: false, note: '', rows: rowsForm };
    openDialog({ type: 'event', mode: 'add', eventId: null, values, initial: values, copiedFrom: last?.name ?? null, opener });
  }

  async function openEditEvent(event, opener) {
    if (!isAdmin || !beginWrite()) return;
    const classes = await readClasses();
    endWrite(classes ? 'ok' : 'error');
    if (!classes) return;
    const inEvent = new Map(event.classes.map((c) => [c.classId, c]));
    const rowsForm = classes.map((cls) => {
      const copy = inEvent.get(cls.id) ?? null;
      return {
        classId: cls.id,
        className: copy?.className ?? cls.name,
        ticked: copy !== null,
        startTime: copy?.startTime ?? null,
        endTime: copy?.endTime ?? null,
        inEvent: copy !== null,
        awardNotSet: awardNotSet(cls),
      };
    });
    // Classes the event has but Classes and ranks doesn't any more (deleted since): still listed.
    for (const copy of event.classes) {
      if (classes.some((cls) => cls.id === copy.classId)) continue;
      rowsForm.push({ classId: copy.classId, className: copy.className, ticked: true, startTime: copy.startTime, endTime: copy.endTime, inEvent: true, awardNotSet: false });
    }
    const values = {
      name: event.name,
      testingDate: event.testingDate,
      open: event.registrationOpen,
      autoClose: event.autoCloseOn !== null,
      closingDate: event.autoCloseOn ?? defaultAutoCloseOn(event.testingDate) ?? '',
      closingEdited: true,
      note: event.note ?? '',
      rows: rowsForm,
    };
    openDialog({ type: 'event', mode: 'edit', eventId: event.id, values, initial: values, snapshot: event, moreOpen: Boolean(event.note), opener });
  }

  function changeValues(patch) {
    setDialog((current) => {
      if (!current || current.saving) return current;
      const values = { ...current.values, ...patch };
      // Add event: the closing date follows the testing date (7 days before, never before today)
      // until someone changes the closing date by hand.
      if (current.mode === 'add' && 'testingDate' in patch && !values.closingEdited) {
        const suggested = defaultAutoCloseOn(values.testingDate);
        values.closingDate = suggested ? (suggested < today ? today : suggested) : '';
      }
      const note = current.note && !BLOCKING_NOTES.includes(current.note) ? null : current.note;
      return { ...current, values, note };
    });
  }
  function changeRow(classId, patch) {
    setDialog((current) => {
      if (!current || current.saving) return current;
      const rowsForm = current.values.rows.map((row) => (row.classId === classId ? { ...row, ...patch } : row));
      const note = current.note && !BLOCKING_NOTES.includes(current.note) ? null : current.note;
      // A time chosen counts as "touched" once both lists have been used (so "Set a start and an
      // end time" doesn't appear after picking only the start).
      const row = rowsForm.find((r) => r.classId === classId);
      const touchedRows = row?.startTime && row?.endTime ? { ...current.touchedRows, [classId]: true } : current.touchedRows;
      return { ...current, values: { ...current.values, rows: rowsForm }, note, touchedRows, serverAwardClass: null };
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
  function requestClose() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    if (d.type === 'delete' || !isEventFormDirty(d)) {
      cancelDialog();
      return;
    }
    // noteAt changes on every Esc / Back, so the dialog scrolls the note into view each time.
    if (!BLOCKING_NOTES.includes(d.note)) patchDialog({ note: 'UNSAVED', noteAt: Date.now() });
  }

  function handleDialogProblem(result, typedName) {
    const status = result.status;
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
    } else if (status === 'final_award_not_set') {
      patchDialog({ saving: false, serverAwardClass: result.className ?? '' });
    } else if (status === 'not_empty') {
      patchDialog({ saving: false, note: 'NOT_EMPTY' });
    } else if (status === 'invalid' || status === 'finished') {
      patchDialog({ saving: false, note: 'INVALID_DIALOG' });
    } else {
      patchDialog({ saving: false, note: 'SAVE_FAILED' });
    }
  }

  // ----- Save: Add / Edit event -----
  async function saveEvent() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const record = d.snapshot ?? null;
    const check = checkEventForm(d, eventsRef.current, today, record);
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
      const result = await addEvent({ locationCode, ...p });
      endWrite(result.status);
      if (result.status !== 'ok') {
        handleDialogProblem(result, p.name);
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
          // Undo = delete the event that was just added (empty, so nothing else goes with it).
          onAction: () =>
            runUndo(
              () => deleteEvent({ eventId: newId, expectedVersion: newVersion, expectedRegistrationCount: 0, expectedPaymentTotalCents: 0 }),
              { find: addEventEl },
            ),
        },
      });
      focusLater(() => rowEl(newId), addEventEl, reloaded);
      return;
    }

    // Edit: the details first, then (if it changed) the Registration switch, which has its own
    // database function with its own role rules (§1.3).
    const result = await updateEvent({
      eventId: d.eventId,
      expectedVersion: record.version,
      name: p.name,
      testingDate: p.testingDate,
      classes: p.classes,
      autoCloseOn: p.autoCloseOn,
      note: p.note,
    });
    if (result.status !== 'ok') {
      endWrite(result.status);
      handleDialogProblem(result, p.name);
      return;
    }
    let version = result.version;
    const switchChanged = p.registrationOpen !== record.registrationOpen;
    let switchFailed = null;
    if (switchChanged) {
      const switched = await setRegistration({ eventId: d.eventId, expectedVersion: version, open: p.registrationOpen });
      if (switched.status === 'ok') version = switched.version;
      else switchFailed = switched.status;
    }
    endWrite(switchFailed ?? 'ok');
    setDialog(null);
    const reloaded = reloadQuiet();
    if (switchFailed) {
      // The details were saved; only the switch wasn't.
      if (switchFailed === 'no_access') onNoAccess();
      else setBanner({ text: p.registrationOpen ? T.registrationNotOpened(p.name) : T.registrationNotClosed(p.name) });
    } else {
      // Undo puts the old details back (and the old switch position, if it changed).
      const previous = {
        name: record.name,
        testingDate: record.testingDate,
        classes: record.classes.map((c) => ({ classId: c.classId, startTime: c.startTime, endTime: c.endTime })),
        autoCloseOn: record.autoCloseOn,
        note: record.note,
      };
      const savedVersion = version;
      showToast(T.TOAST_EVENT_SAVED, {
        icon: false,
        action: {
          label: T.UNDO,
          onAction: () =>
            runUndo(
              async () => {
                const back = await updateEvent({ eventId: d.eventId, expectedVersion: savedVersion, ...previous });
                if (back.status !== 'ok' || !switchChanged) return back;
                return setRegistration({ eventId: d.eventId, expectedVersion: back.version, open: record.registrationOpen });
              },
              { find: () => rowEl(d.eventId) },
            ),
        },
      });
    }
    focusLater(() => d.opener, () => rowEl(d.eventId), reloaded);
  }

  // ===== Undo =====
  async function runUndo(call, focus = null) {
    if (!beginWrite()) return;
    const result = await call();
    endWrite(result.status);
    const status = result.status;
    if (status === 'ok') {
      setBanner((current) => (current?.kind === 'undo' ? null : current));
      showToast(T.TOAST_UNDONE, { icon: false });
      const reloaded = reloadQuiet();
      if (focus) focusLater(focus.find, focus.fallback ?? addEventEl, reloaded);
    } else if (status === 'no_access') {
      onNoAccess();
    } else if (status === 'not_allowed') {
      setBanner({ text: T.EVENTS_NOT_ALLOWED });
      onRefreshProfile();
    } else if (['stale', 'not_found', 'duplicate_name', 'invalid', 'not_empty', 'finished', 'final_award_not_set'].includes(status)) {
      setBanner({ text: T.UNDO_STALE });
      reloadQuiet();
    } else {
      setBanner({ kind: 'undo', text: T.UNDO_FAILED, retry: () => runUndo(call, focus) });
    }
  }

  // ===== Close / Open registration (instant, with Undo — Star v0.85 / v0.86) =====
  async function switchRegistration(event, open, isUndo = false, expectedVersion = event.version) {
    if (!beginWrite()) return;
    const result = await setRegistration({ eventId: event.id, expectedVersion, open });
    endWrite(result.status);
    const status = result.status;
    if (status === 'ok') {
      setNotSavedId(null);
      setBanner((current) => (current?.kind === 'switch' ? null : current));
      reloadQuiet();
      if (isUndo) {
        showToast(T.TOAST_UNDONE, { icon: false });
        return;
      }
      // Opening after the closing date has passed removes the date (admins only, Star v0.85).
      const removedDate = open && event.autoCloseOn !== null && today > event.autoCloseOn;
      const text = open ? (removedDate ? T.TOAST_REGISTRATION_OPEN_DATE_REMOVED : T.TOAST_REGISTRATION_OPEN) : T.TOAST_REGISTRATION_CLOSED;
      const newVersion = result.version;
      showToast(text, {
        icon: false,
        action: { label: T.UNDO, onAction: () => switchRegistration(event, !open, true, newVersion) },
      });
    } else if (status === 'no_access') {
      onNoAccess();
    } else if (status === 'not_allowed') {
      setBanner({ text: open ? T.REGISTRATION_NEEDS_ADMIN : T.EVENTS_NOT_ALLOWED });
      onRefreshProfile();
      reloadQuiet();
    } else if (status === 'finished') {
      setBanner({ text: T.REGISTRATION_FINISHED });
      reloadQuiet();
    } else if (['stale', 'not_found', 'invalid'].includes(status)) {
      setBanner({ text: isUndo ? T.UNDO_STALE : T.STALE });
      reloadQuiet();
    } else {
      // Didn't reach the database (E14): the row shows "Not saved" and the banner offers Retry.
      setNotSavedId(event.id);
      setBanner({
        kind: 'switch',
        text: open ? T.registrationNotOpened(event.name) : T.registrationNotClosed(event.name),
        retry: () => switchRegistration(event, open, isUndo, expectedVersion),
      });
    }
  }

  // ===== Copy registration link =====
  async function copyLink(event) {
    const link = registrationLink(event.publicCode);
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
    const fresh = await loadEvent(event.id);
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
    // The database checks every registration (removed ones too) and the payment total…
    const count = fresh.roster.length;
    const total = fresh.paymentTotalCents ?? fresh.payments.reduce((sum, payment) => sum + payment.amountCents, 0); // net of reversals
    // …while the sentence uses the list's number (active students) and names removed ones apart.
    const activeCount = fresh.activeCount ?? fresh.roster.filter((r) => r.status === 'active').length;
    const removedCount = fresh.withdrawnCount ?? count - activeCount;
    const index = shown.findIndex((e) => e.id === event.id);
    openDialog({
      type: 'delete',
      id: event.id,
      name: fresh.event.name,
      title: T.deleteEventTitle(fresh.event.name),
      body: T.deleteEventBody({ activeCount, removedCount, paymentCents: total }),
      args: { eventId: event.id, expectedVersion: fresh.event.version, expectedRegistrationCount: count, expectedPaymentTotalCents: total },
      failed: false,
      index,
      opener: anchor,
    });
  }

  async function confirmDelete() {
    const d = dialogRef.current;
    if (!d || d.saving || !beginWrite()) return;
    patchDialog({ saving: true, failed: false });
    const result = await deleteEvent(d.args);
    endWrite(result.status);
    const status = result.status;
    if (status === 'ok') {
      setDialog(null);
      showToast(T.deletedToast(d.name), { icon: false }); // permanent: no Undo
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
  const shownRef = useRef(shown);
  useLayoutEffect(() => {
    shownRef.current = shown;
  });

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
    const event = rows.find((e) => e.id === menu.id);
    if (!event) return null;
    const items = [{ key: 'copy', label: T.COPY_REGISTRATION_LINK, Icon: IconCopy, onSelect: () => copyLink(event) }];
    if (event.state !== 'finished') {
      if (event.state === 'open') {
        items.push({ key: 'close', label: T.CLOSE_REGISTRATION, Icon: NoIcon, disabled: busy, onSelect: () => switchRegistration(event, false) });
      } else {
        // Staff can't reopen once the closing date has passed (Star v0.86): grayed, with the reason.
        const allowed = registrationSwitch({ event, open: true, isAdmin, today }).status === 'ok';
        items.push({
          key: 'open',
          label: allowed ? (
            T.OPEN_REGISTRATION
          ) : (
            <span className="ev-menu-two">
              <span>{T.OPEN_REGISTRATION}</span>
              <span className="ev-menu-reason">{T.REOPEN_NEEDS_ADMIN}</span>
            </span>
          ),
          Icon: NoIcon,
          disabled: busy || !allowed,
          onSelect: () => switchRegistration(event, true),
        });
      }
    }
    // Phones have no pencil on the row, so Edit event is in the menu there (E8).
    if (isAdmin && isPhone) items.push({ key: 'edit', label: T.EDIT_EVENT, Icon: IconEdit, disabled: busy, onSelect: () => openEditEvent(event, menu.anchor) });
    if (isAdmin) {
      items.push({ key: 'delete', label: T.DELETE_EVENT, Icon: IconTrash, danger: true, separatorBefore: true, disabled: busy, onSelect: () => startDelete(event, menu.anchor) });
    }
    return { title: event.name, subtitle: T.eventMenuSub(event), label: T.moreFor(event.name), items };
  }

  // ===== Keyboard: ↑ ↓ Enter on rows, N for Add event =====
  const nav = useRowArrowNav({
    rowKeys: shown.map((event) => event.id),
    onOpen: (id) => onOpenEvent(id),
  });
  const addShown = isAdmin && live.status === 'ready';
  useShortcutN({
    enabled: addShown && dialog === null && menu === null && !screenLocked && !busy,
    onPress: () => openAddEvent(addEventEl()),
  });

  // ===== Drawing =====
  const addEventButton = addShown ? (
    <button type="button" className="btn btn-primary" data-add-event onClick={(event) => openAddEvent(event.currentTarget)}>
      {/* ti-plus = add new */}
      <IconPlus size={16} aria-hidden="true" />
      {T.ADD_EVENT}
    </button>
  ) : null;

  function tagFor(event) {
    if (notSavedId === event.id) {
      return (
        <span className="ttag ttag--warn">
          <IconAlertTriangle size={12} aria-hidden="true" />
          {T.TAG_NOT_SAVED}
        </span>
      );
    }
    const ok = event.tag.code === 'open' || event.tag.code === 'open_until';
    return <span className={`ttag${ok ? ' ttag--ok' : ''}`}>{T.eventTagText(event.tag)}</span>;
  }

  function header(key, label, numeric = false) {
    const active = sort?.key === key;
    return (
      <span className={`ev-th${numeric ? ' num' : ''}`} role="columnheader" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="ev-sort" onClick={() => toggleSort(key)} aria-label={T.sortBy(label)}>
          {label}
          {/* A small arrow on the column that sorts the list right now (no icon: the mockups have none) */}
          {active && <span aria-hidden="true">{sort.dir === 1 ? ' ↑' : ' ↓'}</span>}
        </button>
      </span>
    );
  }

  let body;
  if (live.status === 'loading' || live.status === 'idle') {
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
    body = <ErrorBanner text={T.LOAD_EVENTS_FAILED} onRetry={() => liveRef.current.reload()} />;
  } else if (live.status === 'noAccess') {
    body = null;
  } else if (shown.length === 0) {
    let text;
    if (rows.length === 0) text = isAdmin ? T.NO_EVENTS_ADMIN : T.NO_EVENTS_STAFF;
    else text = side === 'past' ? T.NO_PAST : T.NO_UPCOMING;
    body = <p className="tempty ev-empty">{text}</p>;
  } else {
    body = (
      <div
        className={`clist ev-list${isTouch ? ' is-touch' : ''}${isAdmin && !isPhone ? ' has-edit' : ''}`}
        role="table"
        aria-label={side === 'past' ? T.PAST : T.UPCOMING}
      >
        {!isPhone && (
          <div className="ev-row ev-head" role="row">
            {header('name', T.COL_EVENT)}
            {header('date', T.COL_TESTING_DATE)}
            {header('students', T.COL_STUDENTS, true)}
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
                data-event-more={event.id}
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
      const record = dialog.eventId ? (events.find((e) => e.id === dialog.eventId) ?? dialog.snapshot) : null;
      dialogElement = (
        <EventDialog
          key={dialog.key}
          state={dialog}
          school={school}
          events={events}
          today={today}
          record={dialog.snapshot ?? record}
          isPhone={isPhone}
          onChange={changeValues}
          onRowChange={changeRow}
          onTouch={touch}
          onToggleMore={() => patchDialog({ moreOpen: !dialog.moreOpen })}
          onSave={saveEvent}
          onCancel={cancelDialog}
          onRequestClose={requestClose}
        />
      );
    } else {
      dialogElement = (
        <ConfirmDeleteDialog
          key={dialog.key}
          title={dialog.title}
          body={dialog.body}
          keepLabel={T.KEEP_EVENT}
          deleteLabel={T.DELETE_EVENT}
          failed={dialog.failed}
          deleting={dialog.saving}
          onDelete={confirmDelete}
          onCancel={cancelDialog}
        />
      );
    }
  }

  const content = menu && !screenLocked ? menuContent() : null;
  const sideLabelId = `${panelId}-side`;

  return (
    <>
      {/* Staff note about ⋯: only when there are events to use it on (E3 shows just the empty line) */}
      {renderHeader(addEventButton, isAdmin || (live.status === 'ready' && rows.length === 0) ? null : T.STAFF_EVENTS_LINE)}
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel">
        {banner && (
          <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy} onDismiss={() => setBanner(null)} />
        )}
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
      {content && (
        <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />
      )}
      {dialogElement}
    </>
  );
}
