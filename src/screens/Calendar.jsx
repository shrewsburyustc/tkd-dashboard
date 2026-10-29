// Calendar.jsx — the Calendar section (rail icon ti-calendar-month, "Calendar"; rulebook v0.234, v0.239).
// Why it exists: one place to see every school day — the regular classes (from the Schedule),
// closures, school events, and Color Belt / Star testing events (read from Testing). It follows
// the school switcher. This file is the "brain" of the section, like ScheduleSchool is for the
// Schedule. It:
//   - loads both schools' schedules and the calendar rows for the dates on screen (useCalendar)
//   - shows the Month view (default: day boxes + the chosen day's panel — beside the month on a
//     PC, under it on a tablet held upright and on a phone, where the month is small with dots)
//     or the Week view (PC / tablet; one click away)
//   - opens the dialogs: event, closure, event types (admins edit; staff see them read-only)
//   - sends every change to the database (src/lib/calendar/api.js) and reacts to the answer
//   - offers Undo for adding, editing and removing events and closures; deleting an event type
//     is permanent and asks first
//   - shows prospects' follow-ups (v0.612 / v0.615, loaded apart by useFollowUps) — a tap opens
//     the child in Prospects — and the "Show" menu that hides any kind of item (v0.613),
//     remembered per person on this device (showKinds.js)
//
// Rules worth knowing (same as Testing and the Schedule):
//   - ONE change at a time; dialog saves WAIT for the database.
//   - The dialog's typed values live HERE, so a lock while it's open loses nothing.
//   - Admin vs staff only changes what is SHOWN — the database enforces who may change what.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconCalendarEvent, IconCalendarOff, IconChevronLeft, IconChevronRight, IconDots, IconPalette, IconPlus } from '@tabler/icons-react';
import ErrorBanner from '../components/ErrorBanner.jsx';
import RowMenu from '../components/RowMenu.jsx';
import { LOCATION_CODE } from '../lib/device.js';
import { PHONE_QUERY, WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { useShortcutN } from '../lib/useShortcutN.js';
import { colorOf } from '../lib/schedule/colors.js';
import { toTimeText } from '../lib/schedule/time.js';
import { addDays } from '../lib/schedule/versions.js';
import { addMonths, buildDay, firstOfMonth, monthKey, monthWeeks, recordMatches, weekDates } from '../lib/calendar/days.js';
import { useCalendar } from '../lib/calendar/useCalendar.js';
import { useFollowUps } from '../lib/calendar/useFollowUps.js';
import { KINDS, applyShow, loadHidden, saveHidden, toggleKind } from '../lib/calendar/showKinds.js';
import {
  addClosure,
  addEvent,
  addType,
  countEventsForType,
  deleteType,
  removeClosure,
  removeEvent,
  reorderTypes,
  updateClosure,
  updateEvent,
  updateType,
} from '../lib/calendar/api.js';
import { checkIn, prospectsForBookings, undoCheckIn } from '../lib/prospects/api.js';
import MonthGrid from './calendar/MonthGrid.jsx';
import PhoneMonth from './calendar/PhoneMonth.jsx';
import DayPanel from './calendar/DayPanel.jsx';
import WeekView from './calendar/WeekView.jsx';
import ShowMenu from './calendar/ShowMenu.jsx';
import EventDialog, { checkEventForm, isEventFormDirty } from './calendar/EventDialog.jsx';
import ClosureDialog, { checkClosureForm, isClosureFormDirty } from './calendar/ClosureDialog.jsx';
import EventTypesDialog, { checkTypeForm, isTypeFormDirty } from './calendar/EventTypesDialog.jsx';
import * as T from './calendar/text.js';

const ALL_CODES = ['worcester', 'shrewsbury'];
const BLOCKING_NOTES = ['STALE_DIALOG', 'NOT_ALLOWED'];
const usable = (el) => (el && el.isConnected && el.getClientRects().length > 0 ? el : null);
// Today in Massachusetts, until the database's own answer arrives ('YYYY-MM-DD').
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

export default function Calendar({ location, staffId, isAdmin, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange, onOpenProspect }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const both = location === 'Both';
  const shownCodes = useMemo(() => (both ? ALL_CODES : [LOCATION_CODE[location]]), [both, location]);
  const schoolLabel = both ? T.BOTH_SCHOOLS : location;

  // ----- What is on screen -----
  const [view, setView] = useState('month'); // 'month' | 'week' (the phone has no week view)
  const shownView = isPhone ? 'month' : view;
  const [anchor, setAnchor] = useState(null); // a date in the month / week shown (null = today)
  const [selected, setSelected] = useState(null); // the day in the panel (null = today)
  const [fallbackToday] = useState(localToday);

  // The dates on screen decide what is loaded.
  const anchorDate = anchor ?? fallbackToday;
  const weeks = useMemo(() => monthWeeks(anchorDate), [anchorDate]);
  const week = useMemo(() => weekDates(anchorDate), [anchorDate]);
  const visible = shownView === 'month' ? weeks.flat() : week;
  const from = visible[0];
  const to = visible[visible.length - 1];
  const cal = useCalendar({ codes: ALL_CODES, from, to, enabled: !screenLocked });
  const loaded = cal.data;
  const today = loaded?.today ?? fallbackToday;
  const selectedDate = selected ?? today;

  // ----- The Show menu (v0.613): the kinds this person hid on this device -----
  const [hidden, setHidden] = useState(() => loadHidden(staffId));
  const changeHidden = (next) => {
    setHidden(next);
    saveHidden(staffId, next);
  };
  // Prospects' follow-ups — loaded apart (not on every month / week click), only while shown.
  const fu = useFollowUps({ codes: shownCodes, enabled: !screenLocked && !hidden.has('followUps') });

  // ----- Derived data -----
  const types = useMemo(() => loaded?.types ?? [], [loaded]);
  const typeColor = useMemo(() => {
    const byId = new Map(types.map((t) => [t.id, t.color]));
    return (id) => colorOf(byId.get(id));
  }, [types]);
  // Every school's schedule, ready for days.js (dialogs use both; the screen only the shown ones).
  const allSchools = useMemo(
    () =>
      (loaded?.schools ?? []).map((s) => ({
        code: s.code,
        name: T.SCHOOL_NAME[s.code],
        versions: s.versions,
        slots: s.slots,
        classNames: new Map(s.classes.map((c) => [c.id, c.name])),
        colors: s.colors,
      })),
    [loaded],
  );
  const ctxFor = useMemo(() => {
    const base = {
      events: loaded?.events ?? [],
      closures: loaded?.closures ?? [],
      closureClasses: loaded?.closureClasses ?? new Map(),
      testingEvents: loaded?.testingEvents ?? [],
      bookings: loaded?.bookings ?? [],
    };
    return (codes) => ({ ...base, schools: allSchools.filter((s) => codes.includes(s.code)) });
  }, [loaded, allSchools]);
  // What the screen draws: each day with the follow-ups added and the hidden kinds taken out.
  // (Dialogs use ctxFor directly, so hiding never changes what a closure or event dialog sees.)
  const followUps = fu.followUps;
  const infoFor = useMemo(() => {
    const ctx = { ...ctxFor(shownCodes), followUps };
    const cache = new Map();
    return (date) => {
      if (!cache.has(date)) cache.set(date, applyShow(buildDay(date, ctx), hidden));
      return cache.get(date);
    };
  }, [ctxFor, shownCodes, followUps, hidden]);

  // Newest values for callbacks that run later (after a save, from a toast's Undo …).
  const ref = useRef({});
  useLayoutEffect(() => {
    ref.current = { cal, loaded, types, ctxFor };
  });

  // ----- State -----
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null); // { kind: 'add' | 'more', anchor }
  const [banner, setBanner] = useState(null); // { text, retry? }
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
  });

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

  useEffect(() => {
    if (cal.status === 'noAccess') onNoAccess();
  }, [cal.status, onNoAccess]);

  const modalShown = dialog !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);
  useEffect(() => {
    if (screenLocked) setMenu(null);
  }, [screenLocked]);

  // The event-types dialog changes steps inside one box: move focus to the new step's field.
  const typesStep = dialog?.type === 'types' ? dialog.step : null;
  useEffect(() => {
    if (!typesStep) return;
    // Two frames: the new step has rendered (and a closing confirmation is gone) by then.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const role = typesStep === 'delete' ? 'alertdialog' : 'dialog';
        const boxes = document.querySelectorAll(`[role="${role}"]`);
        const box = boxes[boxes.length - 1];
        (box?.querySelector('[data-autofocus]') ?? box?.querySelector('[data-back]') ?? box)?.focus();
      }),
    );
  }, [typesStep]);

  function focusBack(el, fallbackSelector, tries = 0) {
    window.requestAnimationFrame(() => {
      const target = usable(el) ?? usable(fallbackSelector ? document.querySelector(fallbackSelector) : null);
      if (target && target.closest('[inert]') && tries < 30) {
        focusBack(el, fallbackSelector, tries + 1);
        return;
      }
      target?.focus();
    });
  }

  async function reloadQuiet() {
    const result = await ref.current.cal.reload();
    if (result === 'error') setBanner({ text: T.LOAD_FAILED, retry: retryLoad });
    return result;
  }
  async function retryLoad() {
    if ((await ref.current.cal.reload()) === 'ok') setBanner(null);
  }

  // ----- Moving around -----
  function goToday() {
    setAnchor(null);
    setSelected(null);
  }
  function step(n) {
    const next = shownView === 'month' ? addMonths(firstOfMonth(anchorDate), n) : addDays(anchorDate, 7 * n);
    setAnchor(next);
    if (shownView === 'month') {
      // The panel shows today in today's month, else the 1st.
      setSelected(monthKey(next) === monthKey(today) ? null : firstOfMonth(next));
    }
  }
  function pickDay(date) {
    setSelected(date);
    if (monthKey(date) !== monthKey(anchorDate)) setAnchor(date); // a grayed day of the next / previous month
  }

  // ===== Dialogs =====
  function openDialog(next) {
    clearToast();
    setMenu(null);
    setDialog({ key: Date.now(), touched: {}, note: null, blocked: false, saving: false, ...next });
  }
  const patchDialog = (patch) => setDialog((d) => (d ? { ...d, ...patch } : d));
  function changeValues(patch, what) {
    setDialog((d) => {
      if (!d || d.saving) return d;
      if (what === 'delete') return { ...d, ...patch, note: null };
      const note = what === 'ui' ? d.note : d.note && !BLOCKING_NOTES.includes(d.note) ? null : d.note;
      return { ...d, values: { ...d.values, ...patch }, note };
    });
  }
  const touch = (fields) => setDialog((d) => (d ? { ...d, touched: { ...d.touched, ...Object.fromEntries(fields.map((f) => [f, true])) } } : d));
  const defaultSchool = () => (both ? 'both' : LOCATION_CODE[location]);

  function openAddEvent(opener) {
    if (!isAdmin || !loaded) return;
    const values = { title: '', typeId: null, allDay: true, startsOn: selectedDate, endsOn: selectedDate, start: '', end: '', school: defaultSchool(), notes: '', showNotes: false };
    openDialog({ type: 'event', mode: 'add', values, initial: values, opener });
  }
  function openEvent(event, opener) {
    const values = {
      title: event.title,
      typeId: event.typeId,
      allDay: event.allDay,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      start: event.start === null ? '' : toTimeText(event.start),
      end: event.end === null ? '' : toTimeText(event.end),
      school: event.locationCode ?? 'both',
      notes: event.notes ?? '',
      showNotes: Boolean(event.notes),
    };
    openDialog({ type: 'event', mode: isAdmin ? 'edit' : 'view', values, initial: values, snapshot: event, opener });
  }
  function openAddClosure(opener) {
    if (!isAdmin || !loaded) return;
    const values = { reason: '', startsOn: selectedDate, endsOn: selectedDate, wholeDay: true, slotIds: [], school: defaultSchool() };
    openDialog({ type: 'closure', mode: 'add', values, initial: values, opener });
  }
  function openClosure(closure, opener) {
    // The ticked classes: the slots on the schedule that match the closure's records today.
    const records = ref.current.loaded?.closureClasses.get(closure.id) ?? [];
    const day = buildDay(closure.startsOn, ref.current.ctxFor(ALL_CODES));
    const slotIds = [];
    for (const school of day.schools) {
      for (const c of school.classes) {
        if (records.some((r) => recordMatches(r, c.slot, school.code))) slotIds.push(c.slot.id);
      }
    }
    const values = { reason: closure.reason, startsOn: closure.startsOn, endsOn: closure.endsOn, wholeDay: closure.wholeDay, slotIds, school: closure.locationCode ?? 'both' };
    openDialog({ type: 'closure', mode: isAdmin ? 'edit' : 'view', values, initial: values, snapshot: closure, opener });
  }
  function openTypes(opener) {
    if (!isAdmin) return;
    openDialog({ type: 'types', step: 'list', values: { name: '', color: 'gray' }, initial: { name: '', color: 'gray' }, typeId: null, count: null, moveTo: null, opener });
  }

  function cancelDialog() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    setDialog(null);
    focusBack(d.opener, '[data-cal-add], [data-cal-today]');
  }
  function requestClose() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const dirty =
      d.mode === 'view' ? false : d.type === 'event' ? isEventFormDirty(d) : d.type === 'closure' ? isClosureFormDirty(d) : d.type === 'types' ? isTypeFormDirty(d) : false;
    if (!dirty) {
      cancelDialog();
      return;
    }
    if (!BLOCKING_NOTES.includes(d.note)) patchDialog({ note: 'UNSAVED' });
  }

  function handleDialogProblem(status) {
    if (status === 'no_access') {
      patchDialog({ saving: false, removing: false });
      onNoAccess();
    } else if (status === 'not_allowed') {
      patchDialog({ saving: false, removing: false, note: 'NOT_ALLOWED', blocked: true });
      onRefreshProfile();
    } else if (status === 'stale' || status === 'not_found') {
      patchDialog({ saving: false, removing: false, note: 'STALE_DIALOG', blocked: true });
      reloadQuiet();
    } else if (status === 'invalid') {
      patchDialog({ saving: false, removing: false, note: 'INVALID_DIALOG' });
    } else {
      patchDialog({ saving: false, removing: false, note: 'SAVE_FAILED' });
    }
  }

  // ----- Events -----
  async function saveEvent() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const check = checkEventForm(d);
    if (!check.canSave) return;
    if (check.sameAsSaved) {
      cancelDialog();
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const p = check.payload;
    const result = d.mode === 'add' ? await addEvent(p) : await updateEvent({ id: d.snapshot.id, expectedVersion: d.snapshot.version, ...p });
    endWrite(result.status);
    if (result.status !== 'ok') {
      handleDialogProblem(result.status);
      return;
    }
    setDialog(null);
    setSelected(p.startsOn);
    if (monthKey(p.startsOn) !== monthKey(anchorDate) && shownView === 'month') setAnchor(p.startsOn);
    reloadQuiet();
    if (d.mode === 'add') {
      showToast(T.TOAST_EVENT_ADDED, { icon: false, action: { label: T.UNDO, onAction: () => runUndo(() => removeEvent({ id: result.id, expectedVersion: result.version })) } });
    } else {
      const before = d.snapshot;
      showToast(T.TOAST_EVENT_SAVED, {
        icon: false,
        action: { label: T.UNDO, onAction: () => runUndo(() => updateEvent({ ...before, expectedVersion: result.version })) },
      });
    }
    focusBack(document.querySelector(`[data-event="${result.id}"]`) ?? d.opener, '[data-cal-add]');
  }

  async function removeEventFromDialog() {
    const d = dialogRef.current;
    if (!d || d.saving || d.mode !== 'edit') return;
    if (!beginWrite()) return;
    patchDialog({ saving: true, removing: true, note: null });
    const result = await removeEvent({ id: d.snapshot.id, expectedVersion: d.snapshot.version });
    endWrite(result.status);
    if (result.status !== 'ok') {
      handleDialogProblem(result.status);
      return;
    }
    setDialog(null);
    reloadQuiet();
    showToast(T.toastEventRemoved(result.removed.title), { icon: false, action: { label: T.UNDO, onAction: () => runUndo(() => addEvent(result.removed)) } });
    focusBack(null, `[data-day="${selectedDate}"], [data-cal-add]`);
  }

  // ----- Closures -----
  function closureDayClasses(d) {
    const codes = d.values.school === 'both' ? ALL_CODES : [d.values.school];
    if (!d.values.startsOn) return codes.map((code) => ({ code, name: T.SCHOOL_NAME[code], classes: [] }));
    return buildDay(d.values.startsOn, ref.current.ctxFor(codes)).schools;
  }
  // How many free-class bookings sit on the classes this closure cancels (the dialog warns:
  // someone has to call those families, v0.241 answer 6).
  function closureBookingCount(d) {
    const v = d.values;
    if (!v.startsOn || !v.endsOn || v.endsOn < v.startsOn) return 0;
    const codes = v.school === 'both' ? ALL_CODES : [v.school];
    const bookings = (ref.current.loaded?.bookings ?? []).filter((b) => b.status === 'booked' && codes.includes(b.locationCode));
    if (v.wholeDay) return bookings.filter((b) => b.date >= v.startsOn && b.date <= v.endsOn).length;
    const day = buildDay(v.startsOn, ref.current.ctxFor(codes));
    const ticked = day.schools.flatMap((s) => s.classes.filter((c) => v.slotIds.includes(c.slot.id)).map((c) => ({ code: s.code, slot: c.slot })));
    return bookings.filter((b) => b.date === v.startsOn && ticked.some((t) => t.code === b.locationCode && t.slot.classIds.includes(b.classId) && toTimeText(t.slot.start) === b.start)).length;
  }
  function closureOrphans(d) {
    if (d.mode === 'add' || !d.snapshot || d.snapshot.wholeDay) return [];
    const day = buildDay(d.snapshot.startsOn, ref.current.ctxFor(ALL_CODES));
    return day.closures.find((c) => c.closure.id === d.snapshot.id)?.orphans ?? [];
  }

  async function saveClosure() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const check = checkClosureForm(d, closureDayClasses(d));
    if (!check.canSave) return;
    if (check.sameAsSaved) {
      cancelDialog();
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const p = check.payload;
    const result = d.mode === 'add' ? await addClosure(p) : await updateClosure({ id: d.snapshot.id, expectedVersion: d.snapshot.version, ...p });
    endWrite(result.status);
    if (result.status !== 'ok') {
      handleDialogProblem(result.status);
      return;
    }
    setDialog(null);
    setSelected(p.startsOn);
    if (monthKey(p.startsOn) !== monthKey(anchorDate) && shownView === 'month') setAnchor(p.startsOn);
    reloadQuiet();
    if (d.mode === 'add') {
      showToast(T.TOAST_CLOSURE_ADDED, { icon: false, action: { label: T.UNDO, onAction: () => runUndo(() => removeClosure({ id: result.id, expectedVersion: result.version })) } });
    } else {
      const s = d.snapshot;
      const before = { locationCode: s.locationCode, startsOn: s.startsOn, endsOn: s.endsOn, reason: s.reason, wholeDay: s.wholeDay, slotIds: d.initial.slotIds };
      showToast(T.TOAST_CLOSURE_SAVED, {
        icon: false,
        action: { label: T.UNDO, onAction: () => runUndo(() => updateClosure({ id: s.id, expectedVersion: result.version, ...before })) },
      });
    }
    focusBack(document.querySelector(`[data-closure="${result.id}"]`) ?? d.opener, '[data-cal-add]');
  }

  async function removeClosureFromDialog() {
    const d = dialogRef.current;
    if (!d || d.saving || d.mode !== 'edit') return;
    if (!beginWrite()) return;
    patchDialog({ saving: true, removing: true, note: null });
    const result = await removeClosure({ id: d.snapshot.id, expectedVersion: d.snapshot.version });
    endWrite(result.status);
    if (result.status !== 'ok') {
      handleDialogProblem(result.status);
      return;
    }
    setDialog(null);
    reloadQuiet();
    showToast(T.toastClosureRemoved(result.removed.reason), { icon: false, action: { label: T.UNDO, onAction: () => runUndo(() => addClosure(result.removed)) } });
    focusBack(null, `[data-day="${selectedDate}"], [data-cal-add]`);
  }

  // ----- Event types -----
  async function typesStepTo(stepName, type, from = 'list') {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    if (stepName === 'list') {
      patchDialog({ step: 'list', typeId: null, note: null, blocked: false, touched: {} });
      return;
    }
    if (stepName === 'add') {
      const values = { name: '', color: 'gray' };
      patchDialog({ step: 'add', typeId: null, values, initial: values, note: null, blocked: false, touched: {} });
      return;
    }
    if (stepName === 'delete') {
      // From the edit step the count is known; from the list (⋯ → Delete type) it is looked up.
      if (from === 'edit' && d.typeId === type.id && d.count !== null) {
        patchDialog({ step: 'delete', deleteFrom: 'edit', moveTo: null, note: null });
        return;
      }
      patchDialog({ step: 'delete', deleteFrom: from, typeId: type.id, snapshot: type, count: null, moveTo: null, note: null });
      const r = await countEventsForType(type.id);
      if (r.status === 'ok') setDialog((cur) => (cur && cur.type === 'types' && cur.typeId === type.id ? { ...cur, count: r.count } : cur));
      return;
    }
    // 'edit': show the type and look up how many events use it
    const values = { name: type.name, color: type.color };
    const sameType = d.typeId === type.id && d.step !== 'list';
    patchDialog({ step: 'edit', typeId: type.id, snapshot: type, ...(sameType ? {} : { values, initial: values, count: null, touched: {} }), note: null, blocked: false });
    const r = await countEventsForType(type.id);
    if (r.status === 'ok') setDialog((cur) => (cur && cur.type === 'types' && cur.typeId === type.id ? { ...cur, count: r.count } : cur));
  }

  async function saveType() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const check = checkTypeForm(d, ref.current.types);
    if (!check.canSave) return;
    if (check.sameAsSaved) {
      typesStepTo('list');
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const result =
      d.step === 'add' ? await addType(check.payload) : await updateType({ id: d.typeId, expectedVersion: d.snapshot.version, ...check.payload });
    endWrite(result.status);
    if (result.status === 'duplicate_name') {
      patchDialog({ saving: false, note: 'DUPLICATE' });
      return;
    }
    if (result.status !== 'ok') {
      handleDialogProblem(result.status);
      return;
    }
    await reloadQuiet();
    patchDialog({ saving: false, step: 'list', typeId: null, touched: {} });
    showToast(d.step === 'add' ? T.TOAST_TYPE_ADDED : T.TOAST_TYPE_SAVED, { icon: false });
  }

  // Move a type to a new place in the list (drag, or ⋯ → Move up / Move down). Order only:
  // move it back to undo.
  async function reorderType(type, toIndex) {
    const list = ref.current.types;
    const from = list.findIndex((t) => t.id === type?.id);
    if (from < 0 || toIndex < 0 || toIndex >= list.length || toIndex === from || !beginWrite()) return;
    const ids = list.map((t) => t.id);
    const next = ids.filter((id) => id !== type.id);
    next.splice(toIndex, 0, type.id);
    const result = await reorderTypes({ expectedIds: ids, newIds: next });
    endWrite(result.status);
    if (result.status === 'no_access') onNoAccess();
    else if (result.status !== 'ok') patchDialog({ note: result.status === 'stale' ? 'STALE_DIALOG' : 'SAVE_FAILED' });
    await reloadQuiet();
    window.requestAnimationFrame(() => document.querySelector(`[data-type-more="${type.id}"]`)?.focus());
  }

  async function confirmDeleteType() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const result = await deleteType({ id: d.typeId, expectedVersion: d.snapshot.version, expectedEventCount: d.count ?? 0, moveToTypeId: d.moveTo });
    endWrite(result.status);
    if (result.status === 'ok') {
      await reloadQuiet();
      patchDialog({ saving: false, step: 'list', typeId: null, moveTo: null });
      showToast(T.toastTypeDeleted(d.snapshot.name), { icon: false }); // no Undo: permanent
    } else if (result.status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (['stale', 'not_found', 'not_allowed', 'invalid'].includes(result.status)) {
      await reloadQuiet();
      patchDialog({ saving: false, step: 'list', typeId: null, note: 'STALE_DIALOG' });
    } else {
      patchDialog({ saving: false, note: 'DELETE_FAILED' });
    }
  }

  // ===== Undo =====
  // ----- Check in a free class (Prospects, v0.236) — today only -----
  const [checkIns, setCheckIns] = useState(null); // booking id -> { prospectId, version, checkedIn, builtin }
  const todayBookingIds = (loaded ? infoFor(today).bookings.map((b) => b.id) : []).join(',');
  useEffect(() => {
    if (!todayBookingIds || screenLocked) {
      setCheckIns(null);
      return;
    }
    let live = true;
    prospectsForBookings(todayBookingIds.split(',')).then((res) => {
      if (live && res.status === 'ok') setCheckIns(new Map(res.prospects.map((x) => [x.bookingId, x])));
    });
    return () => {
      live = false;
    };
  }, [todayBookingIds, screenLocked, loaded]);
  async function doCheckIn(booking, p) {
    if (!beginWrite()) return;
    const r = await checkIn({ id: p.prospectId, expectedVersion: p.version, came: true, afterClass: false });
    endWrite(r.status);
    if (r.status === 'ok') {
      await reloadQuiet();
      showToast(T.checkedInToast(booking.childFirstName), {
        icon: false,
        action: { label: T.UNDO, onAction: () => runUndo(() => undoCheckIn({ id: p.prospectId, expectedVersion: r.version, previousStatusId: r.previousStatusId, previousFollowUpOn: r.previousFollowUpOn })) },
      });
    } else if (r.status === 'no_access') onNoAccess();
    else {
      setBanner({ text: T.LOAD_FAILED });
      reloadQuiet();
    }
  }

  async function runUndo(call) {
    if (!beginWrite()) return;
    const result = await call();
    endWrite(result.status);
    if (result.status === 'ok') {
      setBanner(null);
      await reloadQuiet();
      showToast(T.TOAST_UNDONE, { icon: false });
    } else if (result.status === 'no_access') {
      onNoAccess();
    } else if (result.status === 'not_allowed') {
      setBanner({ text: T.NOT_ALLOWED });
      onRefreshProfile();
    } else if (['stale', 'not_found', 'invalid'].includes(result.status)) {
      setBanner({ text: T.UNDO_STALE });
      reloadQuiet();
    } else {
      setBanner({ text: T.UNDO_FAILED, retry: () => runUndo(call) });
    }
  }

  // N = Add event (PC only, when nothing else is open).
  useShortcutN({
    enabled: isAdmin && cal.status === 'ready' && dialog === null && menu === null && !screenLocked && !busy,
    onPress: () => openAddEvent(document.querySelector('[data-cal-add]')),
  });

  // ===== Drawing =====
  const ready = cal.status === 'ready' && loaded;
  const buttons =
    isAdmin && ready ? (
      <div className="sactions">
        <button
          type="button"
          className="icon-button"
          aria-label={T.MORE_ACTIONS}
          aria-haspopup="menu"
          aria-expanded={menu?.kind === 'more' ? 'true' : 'false'}
          onClick={(e) => setMenu(menu ? null : { kind: 'more', anchor: e.currentTarget })}
        >
          <IconDots size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-primary"
          data-cal-add
          aria-haspopup="menu"
          aria-expanded={menu?.kind === 'add' ? 'true' : 'false'}
          onClick={(e) => setMenu(menu ? null : { kind: 'add', anchor: e.currentTarget })}
        >
          <IconPlus size={16} aria-hidden="true" />
          {T.ADD}
        </button>
      </div>
    ) : null;

  const title = shownView === 'month' ? T.monthTitle(firstOfMonth(anchorDate)) : T.weekTitle(week[0], week[6], isWide);
  const showMenu = (
    <ShowMenu
      kinds={KINDS}
      hidden={hidden}
      isSheet={isPhone}
      full={isPhone}
      onToggle={(key) => changeHidden(toggleKind(hidden, key))}
      onShowAll={() => changeHidden(new Set())}
    />
  );
  const toolbar = (
    <div className="ctoolbar">
      <div className="ctoolbar-nav">
        <button type="button" className="icon-button" aria-label={shownView === 'month' ? T.PREVIOUS_MONTH : T.PREVIOUS_WEEK} onClick={() => step(-1)}>
          <IconChevronLeft size={20} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" aria-label={shownView === 'month' ? T.NEXT_MONTH : T.NEXT_WEEK} onClick={() => step(1)}>
          <IconChevronRight size={20} aria-hidden="true" />
        </button>
        <h2 className="ctoolbar-title" aria-live="polite">
          {title}
        </h2>
        <button type="button" className="btn" data-cal-today onClick={goToday}>
          {T.TODAY}
        </button>
      </div>
      {!isPhone && showMenu}
      {!isPhone && (
        <div className="cseg cseg--view" role="group" aria-label={T.VIEW}>
          {[['month', T.MONTH], ['week', T.WEEK]].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`cseg-item${view === key ? ' is-on' : ''}`}
              aria-pressed={view === key ? 'true' : 'false'}
              onClick={() => {
                // Week opens on the chosen day's week; Month goes back to that day's month.
                setView(key);
                if (key !== view) setAnchor(selected);
              }}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  let body;
  if (cal.status === 'loading' && !loaded) {
    body = (
      <div className="sskeleton" aria-busy="true" aria-label={T.LOADING}>
        <div className="tskeleton-row">
          <span className="tskeleton-bar" />
        </div>
        <div className="tskeleton-row">
          <span className="tskeleton-bar" />
        </div>
      </div>
    );
  } else if (cal.status === 'error') {
    body = <ErrorBanner text={T.LOAD_FAILED} onRetry={() => cal.reload()} />;
  } else if (cal.status === 'noAccess' || !loaded) {
    body = null;
  } else if (shownView === 'week') {
    body = <WeekView dates={week} today={today} infoFor={infoFor} typeColor={typeColor} both={both} onOpenEvent={openEvent} onOpenClosure={openClosure} />;
  } else {
    const month = monthKey(anchorDate);
    const panel = (
      <DayPanel
        date={selectedDate}
        today={today}
        checkIns={selectedDate === today ? checkIns : null}
        checkInBusy={busy}
        onCheckIn={doCheckIn}
        info={infoFor(selectedDate)}
        schoolLabel={schoolLabel}
        both={both}
        typeColor={typeColor}
        isAdmin={isAdmin}
        onOpenEvent={openEvent}
        onOpenClosure={openClosure}
        followUpsFailed={fu.status === 'error'}
        onOpenFollowUp={(f) => onOpenProspect?.(f.id)}
      />
    );
    const gridProps = { weeks, month, today, selected: selectedDate, infoFor, typeColor, onPick: pickDay };
    body = (
      <div className={`cmonth-wrap${isWide ? ' cmonth-wrap--side' : ''}`}>
        {isPhone ? <PhoneMonth {...gridProps} /> : <MonthGrid {...gridProps} both={both} />}
        {panel}
      </div>
    );
  }

  // ----- The open dialog (hidden while locked; comes back after unlocking) -----
  let dialogElement = null;
  if (dialog && !screenLocked && loaded) {
    const common = { today, isPhone, onCancel: cancelDialog, onRequestClose: requestClose, onChange: changeValues, onTouch: touch };
    if (dialog.type === 'event') {
      dialogElement = <EventDialog key={dialog.key} state={dialog} types={types} onSave={saveEvent} onRemove={removeEventFromDialog} {...common} />;
    } else if (dialog.type === 'closure') {
      dialogElement = (
        <ClosureDialog
          key={dialog.key}
          state={dialog}
          dayClasses={closureDayClasses(dialog)}
          orphans={closureOrphans(dialog)}
          bookingCount={closureBookingCount(dialog)}
          onSave={saveClosure}
          onRemove={removeClosureFromDialog}
          {...common}
        />
      );
    } else {
      dialogElement = (
        <EventTypesDialog
          key={dialog.key}
          state={dialog}
          types={types}
          onStep={typesStepTo}
          onSave={saveType}
          onDelete={confirmDeleteType}
          onReorder={reorderType}
          {...common}
          onRequestClose={() => {
            const d = dialogRef.current;
            // Esc / Back goes one step back (delete -> edit -> list), then closes.
            if (d?.step === 'delete') typesStepTo(d.deleteFrom ?? 'edit', d.snapshot);
            else if ((d?.step === 'edit' || d?.step === 'add') && !isTypeFormDirty(d)) typesStepTo('list');
            else requestClose();
          }}
        />
      );
    }
  }

  const menuItems =
    menu?.kind === 'add'
      ? [
          { key: 'event', label: T.ADD_EVENT, Icon: IconCalendarEvent, disabled: busy, onSelect: () => openAddEvent(menu.anchor) },
          { key: 'closure', label: T.ADD_CLOSURE, Icon: IconCalendarOff, disabled: busy, onSelect: () => openAddClosure(menu.anchor) },
        ]
      : [{ key: 'types', label: T.EVENT_TYPES, Icon: IconPalette, disabled: busy, onSelect: () => openTypes(menu?.anchor) }];

  return (
    <div className="calendar">
      <div className="phead">
        <div className="phead-titles">
          <h1 className="ptitle">{T.PAGE_TITLE}</h1>
          <p className="psub">{schoolLabel}</p>
        </div>
        {buttons}
      </div>
      {!isAdmin && <p className="viewonly">{T.VIEW_ONLY_LINE}</p>}
      {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy} onDismiss={() => setBanner(null)} />}
      {toolbar}
      {isPhone && ready && <div className="cshow-row">{showMenu}</div>}
      {body}
      {menu && !screenLocked && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={menu.kind === 'add' ? T.ADD_MENU : T.PAGE_TITLE}
          subtitle={schoolLabel}
          label={menu.kind === 'add' ? T.ADD_MENU : T.MORE_ACTIONS}
          items={menuItems}
          onClose={(reason) => {
            const anchorEl = menu.anchor;
            setMenu(null);
            if (reason === 'escape' || reason === 'tab') anchorEl?.focus();
          }}
        />
      )}
      {dialogElement}
    </div>
  );
}
