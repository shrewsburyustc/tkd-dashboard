// EventsTab.jsx — the "Events" tab of Board breaking: the board breaking events of the school (or both schools).
// Why it exists: approved pictures B-staff "events", "events-past", "events-empty" and "event" (Add / Edit event),
// copied from Color belt testing's Events tab (screens/testing/events/EventsTab.jsx). This file is the "brain" of
// the tab. It:
//   - loads the events (useLiveLoad + breakingApi.loadEvents — reloads quietly after every change, when the school
//     changes, after unlocking, and every 15 seconds, so sign-ups families send show up without a refresh)
//   - shows them on an Upcoming / Past switch, one row per event: date, school, "10 registered · 5 paid" and the
//     Registration tag (a click opens the event's roster; App.jsx gives it the #testing/breaking/event/<id> address)
//   - for admins: Add event (header button), the pencil (Edit event), the ⋯ menu (Edit event on phones, Delete event)
//   - for staff: the list only — staff run the day on the event page, admins own the setup (decision Q7)
// The form is drawn by EventDialog.jsx; the delete confirmation is the shared ConfirmBox (v1.008).
//
// Rules worth knowing (same as every Testing page, contract 0003 §8):
//   - ONE change at a time: while a save is on its way, other changes are ignored (the shared save line,
//     lib/saveLine.js; an Undo pressed during a save waits its turn and the toast says "Undoing…").
//   - Dialog saves WAIT for the database; nothing is shown as saved before it is.
//   - The dialog's values live HERE, so a screen lock hides the dialog and brings it back.
//   - "stale" = someone else changed the same thing since this screen loaded it: nothing is overwritten, the
//     person is told, and the list reloads.
//   - Admin vs staff only changes what is SHOWN — the database enforces who may do what.
//
// How Add event saves (the database has one function per step, SIGNATURES-0051): brk_add_event makes the event
// (Closed) and copies the chosen event's classes; if the admin changed the class list, brk_save_classes then
// writes the list; if they chose Open, brk_update_event opens it. Edit event is brk_update_event, then
// brk_save_classes with the version it answered. Undo of an add deletes the new (empty) event; Undo of an edit
// puts the old details and class list back.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconDots, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import ChoiceGroup from '../../components/ChoiceGroup.jsx';
import ConfirmBox from '../../components/ConfirmBox.jsx';
import IconButton from '../../components/IconButton.jsx';
import PageBar from '../../components/PageBar.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import {
  addEvent, deleteEvent, loadEvents, loadRoster, saveClasses, schoolCode, updateEvent,
} from '../../lib/breaking/breakingApi.js';
import { schoolToday } from '../../lib/testing/eventsApi.js';
import { EVENTS_ROOM } from '../../lib/testing/eventRules.js';
import { usePageRoomBelow } from '../../lib/pageRoom.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../lib/useLiveLoad.js';
import { useSaveLine } from '../../lib/saveLine.js';
import { PHONE_QUERY, TOUCH_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import { useRowArrowNav } from '../../lib/useRowArrowNav.js';
import { useShortcutN } from '../../lib/useShortcutN.js';
import * as T from '../../lib/breaking/text/events.js';
import EventDialog, { checkEventForm, isEventFormDirty, sameRows } from './EventDialog.jsx';

// Upcoming / Past, per school list, kept while the page is open.
const sideBySchool = new Map();

// Notes that make Save unavailable until the dialog is closed and opened again.
const BLOCKING_NOTES = ['STALE_DIALOG', 'NOT_ALLOWED'];

// Finding things on the page (for putting keyboard focus back after a dialog closes).
const find = (selector) => document.querySelector(selector);
const rowEl = (id) => find(`[data-nav-row="${id}"]`);
const moreEl = (id) => find(`[data-event-more="${id}"]`);
const addEventEl = () => find('[data-add-event]');
const usable = (element) => (element && element.isConnected && element.getClientRects().length > 0 ? element : null);

// Class rows in the dialog carry a local key (React needs one; the drag hook finds a row by it).
let rowKeySeq = 0;
const newKey = () => `c${(rowKeySeq += 1)}`;
const rowsFromClasses = (classes) => classes.map((c) => ({ key: newKey(), id: c.id ?? null, name: c.name, startTime: c.startTime, endTime: c.endTime }));

// Sort helpers for the column headers.
const textOrder = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
// Worcester always comes before Shrewsbury (rulebook v1.047 item 19: the screens list the schools in that order, not A to Z).
const SCHOOL_ORDER = { worcester: 0, shrewsbury: 1 };
const schoolOrder = (a, b) => (SCHOOL_ORDER[a.locationCode] ?? 9) - (SCHOOL_ORDER[b.locationCode] ?? 9);
const SORTERS = {
  name: (a, b) => textOrder(a.name, b.name),
  date: (a, b) => (a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : 0),
  school: schoolOrder,
  registered: (a, b) => a.registered - b.registered,
  registration: (a, b) => Number(b.registrationOpen) - Number(a.registrationOpen),
};

export default function EventsTab({
  isAdmin,
  location,
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
  const locationCode = schoolCode(location); // 'worcester' | 'shrewsbury' | 'both'
  const live = useLiveLoad({ key: locationCode, enabled: !screenLocked, load: loadEvents, refreshMs: LIVE_REFRESH_MS });
  const events = live.data?.events ?? [];
  const today = schoolToday();

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
  // Only the list follows the room beside the left panel: narrower than EVENTS_ROOM its table would squeeze the
  // Event column to nothing, so it draws the phone rows. Dialogs, the ⋯ menu's sheet and the buttons follow the window.
  const narrowRoom = usePageRoomBelow(EVENTS_ROOM);
  const listIsPhone = isPhone || narrowRoom;

  // ----- State -----
  const [side, setSideState] = useState(() => sideBySchool.get(locationCode) ?? 'upcoming');
  const [sort, setSort] = useState(null); // { key, dir: 1 | -1 } or null (the side's own order)
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null); // { id, anchor }
  useEffect(() => {
    setMenu(null); // a flip of the list's layout redraws every row's buttons: an open ⋯ menu would point at nothing
  }, [listIsPhone]);
  // The page's ONE bar, drawn as a PageBar under the top bar: { text, retry?, kind?, retrying?, takeFocus? }.
  const [banner, setBanner] = useState(null);
  // The shared save line (lib/saveLine.js): one change at a time, and an Undo waits its turn.
  const line = useSaveLine({
    section: 'Board breaking',
    showToast,
    undoBar: (next) => setBanner((current) => (next ? { kind: 'undo', ...next } : current?.kind === 'undo' ? null : current)),
  });
  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
  });

  function setSide(next) {
    sideBySchool.set(locationCode, next);
    setSideState(next);
    setSort(null);
  }
  // Another school: its own remembered side; banners and menus belonged to the old one.
  const previousCodeRef = useRef(locationCode);
  useEffect(() => {
    if (previousCodeRef.current === locationCode) return;
    previousCodeRef.current = locationCode;
    setSideState(sideBySchool.get(locationCode) ?? 'upcoming');
    setSort(null);
    setBanner(null);
    setMenu(null);
  }, [locationCode]);

  // ----- One change at a time (the shared save line) -----
  // Runs one save on the line. `work` makes the database call(s) and answers { status, … }; `before` runs once the
  // line is ours (e.g. the dialog's "Saving…"). Answers what `work` answered, or null when another save or Undo
  // holds the line (the change is then ignored). The line is freed from a `finally`. A failed save also closes the toast.
  async function onLine(work, retry, before) {
    const token = line.begin();
    if (!token) return null;
    let status = 'error';
    try {
      before?.();
      const result = await work();
      status = result?.lineStatus ?? result?.status ?? 'error';
      return result;
    } finally {
      line.end(status, { retry: status === 'error' ? retry : null, token });
      if (status !== 'ok') clearToast();
    }
  }

  // What the line is told after an Undo's database call: ok → reload and refocus; no_access → lock the screen;
  // refused → { status, reason } (the bar shows the reason, without Retry); anything else → 'error' (Retry).
  function undoOutcome(result, { name, focus = null }) {
    const status = result.status;
    if (status === 'ok') {
      const reloaded = reloadQuiet();
      if (focus) focusLater(focus.find, focus.fallback ?? addEventEl, reloaded);
      return { status: 'ok' };
    }
    if (status === 'no_access') {
      onNoAccess();
      return { status };
    }
    let reason = null;
    if (status === 'not_allowed') {
      onRefreshProfile();
      reason = T.UNDO_REASON_ADMIN_ONLY;
    } else if (status === 'has_payments') reason = T.UNDO_REASON_HAS_PAYMENTS;
    else if (status === 'class_in_use') reason = T.UNDO_REASON_CLASS_IN_USE;
    else if (['stale', 'not_found', 'invalid'].includes(status)) reason = T.undoReasonSomeoneElse(name);
    if (!reason) return { status: 'error' };
    reloadQuiet();
    return { status, reason: T.couldntUndo(reason) };
  }

  // ----- Keyboard focus after a dialog closes -----
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
    // Right after a dialog closes the page is still "inert" for a moment: try on the next frame.
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

  // ===== Rows: Upcoming / Past, order =====
  const upcoming = events.filter((event) => event.eventDate >= today);
  const past = events.filter((event) => event.eventDate < today);
  let shown = side === 'past' ? past : upcoming;
  // Upcoming: soonest first. Past: most recent first. A clicked column header re-sorts the side.
  // (Events on the same date: Worcester first, whichever way the dates run.)
  shown = [...shown].sort((a, b) => (side === 'past' ? -1 : 1) * SORTERS.date(a, b) || schoolOrder(a, b));
  if (sort) shown = [...shown].sort((a, b) => sort.dir * SORTERS[sort.key](a, b) || schoolOrder(a, b));
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
    setDialog({ key: Date.now(), touched: {}, touchedRows: {}, triedSave: false, note: null, blocked: false, saving: false, newKey, ...next });
  }
  function patchDialog(patch) {
    setDialog((current) => (current ? { ...current, ...patch } : current));
  }

  // The latest event (by date) of a school, for "copy the class times from the last event".
  const latestOf = (code) => [...eventsRef.current].filter((e) => e.locationCode === code).sort((a, b) => (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : 0))[0] ?? null;

  // Reads the class times of the school's last event: { id, name, rows } or null when there is none.
  async function readCopy(code) {
    const last = latestOf(code);
    if (!last) return { copy: null };
    const result = await loadRoster(last.id);
    if (result.status === 'no_access') return { problem: 'no_access' };
    if (result.status === 'not_found') return { copy: null }; // deleted a moment ago: start empty
    if (result.status !== 'ok') return { problem: 'error' };
    return { copy: { id: last.id, name: last.name, classes: result.event.classes } };
  }

  async function openAddEvent(opener) {
    if (!isAdmin) return;
    const codes = locationCode === 'both' ? ['worcester', 'shrewsbury'] : [locationCode];
    const read = await onLine(async () => {
      const copies = {};
      for (const code of codes) {
        const one = await readCopy(code);
        if (one.problem) return { status: one.problem };
        copies[code] = one.copy;
      }
      return { status: 'ok', copies };
    });
    if (!read) return;
    if (read.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (read.status !== 'ok') {
      setBanner({ text: T.LOAD_EVENTS_FAILED, retry: retryLoad });
      return;
    }
    const schoolFixed = locationCode !== 'both';
    const school = schoolFixed ? locationCode : '';
    const copy = school ? read.copies[school] : null;
    const rows = copy ? rowsFromClasses(copy.classes) : [{ key: newKey(), id: null, name: '', startTime: null, endTime: null }];
    const values = { name: '', date: '', school, open: false, rows };
    openDialog({
      mode: 'add',
      eventId: null,
      values,
      initial: values,
      copies: read.copies,
      copiedFrom: copy?.name ?? null,
      schoolFixed,
      sub: schoolFixed ? T.addEventSub(T.schoolName(locationCode)) : T.ADD_EVENT_SUB_BOTH,
      opener,
    });
  }

  async function openEditEvent(event, opener) {
    if (!isAdmin) return;
    const read = await onLine(() => loadRoster(event.id));
    if (!read) return;
    if (read.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (read.status === 'not_found') {
      setBanner({ text: T.someoneElseChanged(event.name) });
      reloadQuiet();
      return;
    }
    if (read.status !== 'ok') {
      setBanner({ text: T.LOAD_EVENTS_FAILED, retry: retryLoad });
      return;
    }
    const rows = rowsFromClasses(read.event.classes);
    const values = { name: read.event.name, date: read.event.eventDate, school: read.event.locationCode, open: read.event.registrationOpen, rows };
    const used = new Set(read.registrations.map((r) => r.classId));
    openDialog({
      mode: 'edit',
      eventId: event.id,
      values,
      initial: values,
      snapshot: { version: read.event.version, name: read.event.name, date: read.event.eventDate, open: read.event.registrationOpen, classes: read.event.classes },
      inUse: [...used],
      schoolFixed: true,
      sub: T.editEventSub(T.schoolName(read.event.locationCode)),
      opener,
    });
  }

  function changeValues(patch) {
    setDialog((current) => {
      if (!current || current.saving) return current;
      let next = { ...current, values: { ...current.values, ...patch } };
      // Add event on Both: choosing the school fills in that school's last event's class times (only while the
      // class list is still the one the dialog started with, so nothing the admin typed is thrown away).
      if (current.mode === 'add' && 'school' in patch && patch.school !== current.values.school && sameRows(current.values.rows, current.initial.rows)) {
        const copy = current.copies?.[patch.school] ?? null;
        const rows = copy ? rowsFromClasses(copy.classes) : [{ key: newKey(), id: null, name: '', startTime: null, endTime: null }];
        next = { ...next, values: { ...next.values, rows }, initial: { ...current.initial, school: patch.school, rows }, copiedFrom: copy?.name ?? null };
      }
      return { ...next, note: next.note && !BLOCKING_NOTES.includes(next.note) ? null : next.note };
    });
  }
  function changeRow(key, patch) {
    setDialog((current) => {
      if (!current || current.saving) return current;
      const rows = current.values.rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
      const row = rows.find((r) => r.key === key);
      // Once both times are chosen the row counts as "touched", so "Set a start and an end time" doesn't show after only the start.
      const touchedRows = row?.startTime && row?.endTime ? { ...current.touchedRows, [key]: true } : current.touchedRows;
      const note = current.note && !BLOCKING_NOTES.includes(current.note) ? null : current.note;
      return { ...current, values: { ...current.values, rows }, note, touchedRows };
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

  // What to show when a save did not come back ok.
  function handleDialogProblem(result) {
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
    } else if (status === 'class_in_use') {
      const name = dialogRef.current?.classNames?.[result.classId] ?? '';
      patchDialog({ saving: false, note: 'CLASS_IN_USE', noteName: name });
    } else if (status === 'invalid') {
      patchDialog({ saving: false, note: 'INVALID_DIALOG' });
    } else {
      patchDialog({ saving: false, note: 'SAVE_FAILED' });
    }
  }

  // The class list as the database wants it (ids only for classes that already exist).
  const classPayload = (rows) => rows.map((c) => ({ ...(c.id ? { id: c.id } : {}), name: c.name, startTime: c.startTime, endTime: c.endTime }));

  // ----- Save: Add / Edit event -----
  async function saveEvent() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const check = checkEventForm(d, today);
    if (!check.canSave) {
      patchDialog({ triedSave: true }); // shows the messages for anything still missing
      return;
    }
    if (check.sameAsSaved) {
      setDialog(null);
      focusAfterCancel(d);
      return;
    }
    const p = check.payload;
    const showSaving = () => patchDialog({ saving: true, note: null });
    if (d.mode === 'add') await saveAdd(d, p, showSaving);
    else await saveEdit(d, p, showSaving);
  }

  async function saveAdd(d, p, showSaving) {
    const copy = d.copies?.[p.school] ?? null;
    // Did the admin leave the copied class list alone? Then the database's own copy is already right.
    const sameAsCopy = Boolean(copy)
      && p.classes.length === copy.classes.length
      && p.classes.every((c, i) => c.name === copy.classes[i].name && c.startTime === copy.classes[i].startTime && c.endTime === copy.classes[i].endTime);
    const result = await onLine(async () => {
      const added = await addEvent({ name: p.name, locationCode: p.school, eventDate: p.date, classesFrom: copy?.id ?? null });
      if (added.status !== 'ok') return added;
      const eventId = added.eventId;
      if (sameAsCopy && !p.open) return { status: 'ok', eventId, partial: null };
      // A second step (the class list or the Registration switch) needs the new event's version.
      const fresh = await loadRoster(eventId);
      if (fresh.status !== 'ok') return { status: 'ok', eventId, partial: fresh.status };
      let version = fresh.event.version;
      if (!sameAsCopy) {
        const saved = await saveClasses(eventId, version, p.classes.map(({ name, startTime, endTime }) => ({ name, startTime, endTime })));
        if (saved.status !== 'ok') return { status: 'ok', eventId, partial: saved.status };
        version = saved.version;
      }
      if (p.open) {
        const opened = await updateEvent(eventId, version, { name: p.name, eventDate: p.date, registrationOpen: true });
        if (opened.status !== 'ok') return { status: 'ok', eventId, partial: opened.status };
      }
      return { status: 'ok', eventId, partial: null };
    }, null, showSaving);
    if (!result) return; // another change is on its way
    if (result.status !== 'ok') {
      handleDialogProblem(result);
      return;
    }
    setDialog(null);
    if (side !== 'upcoming' && p.date >= today) setSide('upcoming');
    else if (side !== 'past' && p.date < today) setSide('past');
    const reloaded = reloadQuiet();
    const newId = result.eventId;
    if (result.partial === 'no_access') onNoAccess();
    if (result.partial) {
      // The event exists, but a later step didn't save: say so, and the admin opens Edit event to check.
      setBanner({ text: T.CLASSES_NOT_SAVED });
    } else {
      showToast(T.TOAST_EVENT_ADDED, {
        icon: false,
        // Undo = delete the event that was just added (nothing can be in it yet). The version is read fresh.
        action: line.undoAction(
          async () => {
            const fresh = await loadRoster(newId);
            if (fresh.status === 'not_found') return { status: 'ok' }; // already gone
            if (fresh.status !== 'ok') return undoOutcome(fresh, { name: p.name });
            return undoOutcome(await deleteEvent(newId, fresh.event.version), { name: p.name, focus: { find: addEventEl } });
          },
          { words: T.TOAST_EVENT_ADDED },
        ),
      });
    }
    focusLater(() => rowEl(newId), addEventEl, reloaded);
  }

  async function saveEdit(d, p, showSaving) {
    const snap = d.snapshot;
    const detailsChanged = p.name !== snap.name || p.date !== snap.date || p.open !== snap.open;
    const classesChanged = !sameRows(d.values.rows, d.initial.rows);
    let version = snap.version;
    // Remember the names of the classes so "Group D still has students" can name it.
    const classNames = Object.fromEntries(d.values.rows.filter((r) => r.id).map((r) => [r.id, r.name]));
    for (const c of snap.classes) classNames[c.id] ??= c.name;
    patchDialog({ classNames });

    const result = await onLine(async () => {
      if (detailsChanged) {
        const updated = await updateEvent(d.eventId, version, { name: p.name, eventDate: p.date, registrationOpen: p.open });
        if (updated.status !== 'ok') return updated;
        version = updated.version;
      }
      if (classesChanged) {
        const saved = await saveClasses(d.eventId, version, classPayload(d.values.rows));
        if (saved.status !== 'ok') return { ...saved, detailsSaved: detailsChanged, version };
        version = saved.version;
      }
      return { status: 'ok', version };
    }, null, showSaving);
    if (!result) return; // another change is on its way
    if (result.status !== 'ok') {
      // The details were saved but the classes weren't: the dialog now starts from the saved details (a new version),
      // so pressing Save again only sends what is left.
      if (result.detailsSaved) {
        patchDialog({
          snapshot: { ...snap, version: result.version, name: p.name, date: p.date, open: p.open },
          initial: { ...d.initial, name: p.name, date: p.date, open: p.open },
        });
      }
      handleDialogProblem(result);
      return;
    }
    setDialog(null);
    const reloaded = reloadQuiet();
    // Undo puts the old details and the old class list back (the version is read fresh, so a later change elsewhere shows as stale).
    showToast(T.TOAST_EVENT_SAVED, {
      icon: false,
      action: line.undoAction(
        async () => {
          const fresh = await loadRoster(d.eventId);
          if (fresh.status === 'not_found') return undoOutcome(fresh, { name: p.name });
          if (fresh.status !== 'ok') return undoOutcome(fresh, { name: p.name });
          let v = fresh.event.version;
          if (detailsChanged) {
            const back = await updateEvent(d.eventId, v, { name: snap.name, eventDate: snap.date, registrationOpen: snap.open });
            if (back.status !== 'ok') return undoOutcome(back, { name: p.name });
            v = back.version;
          }
          if (classesChanged) {
            // A class that still exists keeps its id; one removed by the edit comes back as a new class.
            const still = new Set(fresh.event.classes.map((c) => c.id));
            const classes = snap.classes.map((c) => ({ ...(still.has(c.id) ? { id: c.id } : {}), name: c.name, startTime: c.startTime, endTime: c.endTime }));
            const back = await saveClasses(d.eventId, v, classes);
            return undoOutcome(back, { name: p.name, focus: { find: () => rowEl(d.eventId) } });
          }
          return undoOutcome({ status: 'ok' }, { name: p.name, focus: { find: () => rowEl(d.eventId) } });
        },
        { words: T.TOAST_EVENT_SAVED },
      ),
    });
    focusLater(() => d.opener, () => rowEl(d.eventId), reloaded);
  }

  // ===== Delete event (permanent; refused while any payment exists) =====
  function startDelete(event, anchor) {
    if (!isAdmin) return;
    openDialog({ type: 'delete', id: event.id, name: event.name, registered: event.registered, paid: event.paid, version: event.version, failed: null, index: shown.findIndex((e) => e.id === event.id), opener: anchor });
  }

  async function confirmDelete() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const result = await onLine(() => deleteEvent(d.id, d.version), null, () => patchDialog({ saving: true, failed: null }));
    if (!result) return; // another change is on its way
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
    } else if (status === 'has_payments') {
      patchDialog({ saving: false, failed: T.DELETE_HAS_PAYMENTS });
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
      setBanner({ text: T.someoneElseChanged(d.name) });
      reloadQuiet();
      focusLater(() => moreEl(d.id));
    } else {
      patchDialog({ saving: false, failed: T.DELETE_FAILED });
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
    const items = [];
    // Phones have no pencil on the row, so Edit event is in the menu there.
    if (listIsPhone) items.push({ key: 'edit', label: T.EDIT_EVENT, Icon: IconEdit, disabled: line.busy, onSelect: () => openEditEvent(event, menu.anchor) });
    items.push({ key: 'delete', label: T.DELETE_EVENT, Icon: IconTrash, danger: true, separatorBefore: listIsPhone, disabled: line.busy, onSelect: () => startDelete(event, menu.anchor) });
    return { title: event.name, subtitle: T.eventMenuSub(event), label: T.moreFor(event.name), items };
  }

  // ===== Keyboard: ↑ ↓ Enter on rows, N for Add event =====
  const nav = useRowArrowNav({ rowKeys: shown.map((event) => event.id), onOpen: (id) => onOpenEvent(id) });
  const addShown = isAdmin && live.status === 'ready';
  useShortcutN({
    enabled: addShown && dialog === null && menu === null && !screenLocked && !line.busy,
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
    return <span className={`ttag${event.registrationOpen ? ' ttag--ok' : ''}`}>{event.registrationOpen ? T.TAG_OPEN : T.TAG_CLOSED}</span>;
  }

  function header(key, label) {
    const active = sort?.key === key;
    return (
      <span className="ev-th" role="columnheader" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="ev-sort" onClick={() => toggleSort(key)} aria-label={T.sortBy(label)}>
          {label}
          {/* A small arrow on the column that sorts the list right now */}
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
    body = <PageBar text={T.LOAD_EVENTS_FAILED} onRetry={() => liveRef.current.reload()} />;
  } else if (live.status === 'noAccess') {
    body = null;
  } else if (shown.length === 0) {
    let text;
    if (events.length === 0) text = isAdmin ? T.NO_EVENTS_ADMIN : T.NO_EVENTS_STAFF;
    else text = side === 'past' ? T.NO_PAST : T.NO_UPCOMING;
    body = <p className="tempty ev-empty">{text}</p>;
  } else {
    body = (
      <div
        className={`clist ev-list${isTouch ? ' is-touch' : ''}${isAdmin && !listIsPhone ? ' has-edit' : ''}`}
        role="table"
        aria-label={side === 'past' ? T.PAST : T.UPCOMING}
      >
        {!listIsPhone && (
          <div className="ev-row ev-head brk-erow" role="row">
            {header('name', T.COL_EVENT)}
            {header('date', T.COL_DATE)}
            {header('school', T.COL_SCHOOL)}
            {header('registered', T.COL_REGISTERED)}
            {header('registration', T.COL_REGISTRATION)}
            <span className="ev-th" role="columnheader" aria-label={T.ACTIONS_COL} />
          </div>
        )}
        <div role="rowgroup" {...nav.containerProps}>
          {shown.map((event) => {
            const open = menu?.id === event.id;
            const selected = open || (dialog && (dialog.eventId === event.id || dialog.id === event.id) && !screenLocked);
            const more = isAdmin ? (
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
            ) : null;
            const edit =
              isAdmin && !listIsPhone ? (
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
            const school = T.schoolName(event.locationCode);
            return (
              <div
                key={event.id}
                className={`ev-row${selected ? ' is-selected' : ''}${listIsPhone ? ' is-phone' : ' brk-erow'}`}
                role="row"
                aria-label={T.openEventLabel(event.name)}
                {...nav.rowProps(event.id)}
                onClick={() => onOpenEvent(event.id)}
              >
                {listIsPhone ? (
                  <>
                    <span className="ev-phone-main" role="cell">
                      <span className="ev-name">{event.name}</span>
                      <span className="l2">{T.eventPhoneDateLine(event.eventDate, school)}</span>
                      <span className="l2">{T.registeredPaid(event.registered, event.paid)}</span>
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
                      {T.eventDate(event.eventDate)}
                    </span>
                    <span role="cell">{school}</span>
                    <span role="cell">{T.registeredPaid(event.registered, event.paid)}</span>
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
    if (dialog.type === 'delete') {
      dialogElement = (
        // The shared confirm box: "Keep event · Delete event", red, first focus on Keep. "Deleting…" while it works.
        <ConfirmBox
          key={dialog.key}
          title={T.deleteEventTitle(dialog.name)}
          keepLabel={T.KEEP_EVENT}
          actionLabel={T.DELETE_EVENT}
          actionIcon={IconTrash}
          busyLabel={T.DELETING}
          loses="forGood"
          busy={dialog.saving}
          failed={dialog.failed}
          onConfirm={confirmDelete}
          onKeep={cancelDialog}
        >
          {T.deleteEventBody(dialog.registered, dialog.paid)}
        </ConfirmBox>
      );
    } else {
      dialogElement = (
        <EventDialog
          key={dialog.key}
          state={dialog}
          today={today}
          isPhone={isPhone}
          onChange={changeValues}
          onRowChange={changeRow}
          onTouch={touch}
          onSave={saveEvent}
          onCancel={cancelDialog}
          onRequestClose={requestClose}
        />
      );
    }
  }

  const content = menu && !screenLocked ? menuContent() : null;
  const sideLabelId = `${panelId}-side`;

  return (
    <>
      {renderHeader(addEventButton, null)}
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel">
        {banner && (
          <PageBar
            text={banner.text}
            onRetry={banner.retry ? () => banner.retry() : undefined}
            retrying={Boolean(banner.retrying) || line.busy}
            takeFocus={banner.takeFocus}
            onDismiss={() => setBanner(null)}
          />
        )}
        {live.status === 'ready' && events.length > 0 && (
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
        {/* The picture's gray line under the list (for staff and admins alike). */}
        {live.status === 'ready' && events.length > 0 && <p className="viewonly">{T.STAFF_EVENTS_LINE}</p>}
      </div>
      {content && (
        <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />
      )}
      {dialogElement}
    </>
  );
}
