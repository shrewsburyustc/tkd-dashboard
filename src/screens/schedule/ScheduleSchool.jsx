// ScheduleSchool.jsx — one school's schedule and everything you can do with it.
// Why it exists: approved mockup screens 1–8 (rulebook v0.137). This is the "brain" of the
// Schedule section, like ClassesRanksTab is for Testing. It:
//   - loads the school's schedules, slots, colors and classes (useSchedule; quiet reloads)
//   - shows ONE schedule at a time: Current by default, any planned or past one from the dropdown
//   - draws the week (PC / tablet) or one day with Mon–Sun buttons (phone) — TimeGrid
//   - opens the dialogs (add / edit time slot, plan / edit a planned schedule, delete one)
//   - sends every change to the database (src/lib/schedule/api.js) and reacts to the answer
//   - offers Undo for reversible changes (add, edit, remove a slot; plan, edit a planned
//     schedule); deleting a planned schedule is permanent and asks first (rule 1.4)
// On "Both" the Schedule page draws this twice (Worcester above Shrewsbury, decided v0.137).
//
// Rules worth knowing (same as Testing):
//   - ONE change at a time; dialog saves WAIT for the database.
//   - The dialog's typed values live HERE, so a lock while it's open loses nothing.
//   - Admin vs staff only changes what is SHOWN — the database enforces who may change what.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconCalendar, IconCalendarEvent, IconCalendarPlus, IconDots, IconEdit, IconHistory, IconMapPin, IconPlus, IconTrash } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import Notice from '../../components/Notice.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import { addSlots, deleteVersion, planVersion, removeSlot, setClassColor, updateSlot, updateVersion } from '../../lib/schedule/api.js';
import { DEFAULT_COLOR } from '../../lib/schedule/colors.js';
import { formatTime, toTimeText } from '../../lib/schedule/time.js';
import { useSchedule } from '../../lib/schedule/useSchedule.js';
import { addDays, classifyVersions, copySourceFor, currentOf, endsBefore, pastOf, plannedOf, weekdayOf } from '../../lib/schedule/versions.js';
import { useShortcutN } from '../../lib/useShortcutN.js';
import PlanDialog, { checkPlanForm, isPlanFormDirty } from './PlanDialog.jsx';
import SlotDialog, { checkSlotForm, isSlotFormDirty } from './SlotDialog.jsx';
import TimeGrid from './TimeGrid.jsx';
import * as T from './text.js';

const BLOCKING_NOTES = ['STALE_DIALOG', 'NOT_ALLOWED', 'PAST_NOT_ALLOWED'];
const usable = (el) => (el && el.isConnected && el.getClientRects().length > 0 ? el : null);

// How tall a minute is: the PC fits a whole day on one screen; the tablet (held upright) has
// more height; the phone shows one day, so it can be roomier.
const PX_PER_MIN = { pc: 0.85, tablet: 1.1, phone: 1.1 };

function versionLabel(v, classified) {
  if (!v) return '';
  if (v.state === 'current') return T.currentLabel(v);
  if (v.state === 'planned') return T.plannedLabel(v);
  return T.pastLabel(v, endsBefore(classified, v) ? addDays(endsBefore(classified, v), -1) : null);
}

export default function ScheduleSchool({
  school,
  locationCode,
  isAdmin,
  device, // 'pc' | 'tablet' | 'phone'
  headerMode, // 'page' (one school: the page header) | 'section' (Both: a heading per school)
  renderPageHeader, // (buttons, subtitle) => element — used in 'page' mode
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
  shortcutEnabled, // only one school answers the N key (Both: the page handles N)
  request, // Both: { kind: 'add' | 'plan', seq } — the page's button chose this school
}) {
  const data = useSchedule({ locationCode, enabled: !screenLocked });
  const loaded = data.data;
  const isPhone = device === 'phone';

  // ----- Derived data -----
  const classified = useMemo(() => (loaded ? classifyVersions(loaded.versions, loaded.today) : []), [loaded]);
  const current = currentOf(classified);
  const planned = plannedOf(classified);
  const past = pastOf(classified);
  const [chosenId, setChosenId] = useState(null); // the schedule picked in the dropdown (null = default)
  const shown = classified.find((v) => v.id === chosenId) ?? current ?? planned[0] ?? null;
  const shownSlots = useMemo(() => (loaded && shown ? loaded.slots.filter((s) => s.versionId === shown.id) : []), [loaded, shown]);
  const classNames = useMemo(() => new Map((loaded?.classes ?? []).map((c) => [c.id, c.name])), [loaded]);
  const editable = isAdmin && (shown === null || shown.state !== 'past');
  const [phoneDay, setPhoneDay] = useState(null); // null = today's weekday
  const today = loaded?.today ?? null;
  const day = phoneDay ?? (today ? weekdayOf(today) : 1);

  // Newest values for callbacks that run later (after a save, from a toast's Undo …).
  const ref = useRef({});
  useLayoutEffect(() => {
    ref.current = { data, loaded, classified, shown, shownSlots };
  });

  // ----- State -----
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null); // { anchor }
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

  // The database says this sign-in can't see data: lock the screen too.
  useEffect(() => {
    if (data.status === 'noAccess') onNoAccess();
  }, [data.status, onNoAccess]);

  // Tell the page whether a dialog is showing (the page behind becomes unclickable).
  const modalShown = dialog !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange(locationCode, modalShown);
  }, [modalShown, onModalOpenChange, locationCode]);
  useEffect(() => () => onModalOpenChange(locationCode, false), [onModalOpenChange, locationCode]);
  useEffect(() => {
    if (screenLocked) setMenu(null);
  }, [screenLocked]);

  // Focus after a dialog closes: the element that opened it, if it's still on the page.
  // Right after a dialog closes the page is still "inert" for a moment, so try again on the
  // next frames until it can take focus (up to ~half a second).
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
    const result = await ref.current.data.reload();
    if (result === 'error') setBanner({ text: T.LOAD_FAILED, retry: retryLoad });
    return result;
  }
  async function retryLoad() {
    if ((await ref.current.data.reload()) === 'ok') setBanner(null);
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
      const note = d.note && !BLOCKING_NOTES.includes(d.note) ? null : d.note;
      const values = { ...d.values, ...patch };
      // A newly ticked class shows ITS saved color (color belongs to the class).
      if (what === 'class' && d.type === 'slot') {
        const saved = ref.current.loaded?.colors ?? {};
        values.colors = Object.fromEntries(patch.classIds.map((id) => [id, d.values.colors[id] ?? saved[id] ?? DEFAULT_COLOR]));
      }
      return { ...d, values, note };
    });
  }
  const touch = (fields) => setDialog((d) => (d ? { ...d, touched: { ...d.touched, ...Object.fromEntries(fields.map((f) => [f, true])) } } : d));

  function openAddSlot(opener) {
    if (!editable || !loaded) return;
    const values = { classIds: [], colors: {}, days: [], start: '', end: '' };
    openDialog({ type: 'slot', mode: 'add', values, initial: values, versionId: shown?.id ?? null, opener });
  }
  function openEditSlot(slot, opener) {
    if (!editable) return;
    const values = {
      classIds: [...slot.classIds],
      colors: Object.fromEntries(slot.classIds.map((id) => [id, loaded.colors[id] ?? DEFAULT_COLOR])),
      day: slot.weekday,
      start: toTimeText(slot.start),
      end: toTimeText(slot.end),
    };
    openDialog({ type: 'slot', mode: 'edit', slotId: slot.id, snapshot: slot, values, initial: values, versionId: slot.versionId, opener });
  }
  function openPlan(opener) {
    if (!isAdmin || !loaded) return;
    const values = { name: '', startsOn: '', copy: true };
    openDialog({ type: 'plan', mode: 'plan', values, initial: values, versionId: null, opener });
  }
  function openEditPlanned(v, opener) {
    if (!isAdmin) return;
    const values = { name: v.name ?? '', startsOn: v.startsOn, copy: true };
    openDialog({ type: 'plan', mode: 'edit', values, initial: values, versionId: v.id, snapshot: v, opener });
  }

  function cancelDialog() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    setDialog(null);
    focusBack(d.opener, '[data-add-slot]');
  }
  function requestClose() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const dirty = d.type === 'slot' ? isSlotFormDirty(d) : d.type === 'plan' ? isPlanFormDirty(d) : false;
    if (!dirty) {
      cancelDialog();
      return;
    }
    if (!BLOCKING_NOTES.includes(d.note)) patchDialog({ note: 'UNSAVED' });
  }

  function handleDialogProblem(status, extra = {}) {
    if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (status === 'not_allowed') {
      // Admin: the schedule started (or ended) meanwhile. Otherwise: not an admin any more.
      patchDialog({ saving: false, note: isAdmin ? 'PAST_NOT_ALLOWED' : 'NOT_ALLOWED', blocked: true });
      onRefreshProfile();
      reloadQuiet();
    } else if (status === 'stale' || status === 'not_found') {
      patchDialog({ saving: false, note: 'STALE_DIALOG', blocked: true });
      reloadQuiet();
    } else if (status === 'duplicate_date') {
      patchDialog({ saving: false, ...extra });
    } else if (status === 'invalid') {
      patchDialog({ saving: false, note: 'INVALID_DIALOG' });
    } else {
      patchDialog({ saving: false, note: 'SAVE_FAILED' });
    }
  }

  // ----- Save a time slot (add or edit), then its class's color if it changed -----
  async function saveSlot() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const otherSlots = ref.current.shownSlots;
    const check = checkSlotForm(d, otherSlots);
    if (!check.canSave) return;
    if (check.sameAsSaved) {
      cancelDialog();
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const p = check.payload;
    const result =
      d.mode === 'add'
        ? await addSlots({ locationCode, versionId: d.versionId, classIds: p.classIds, weekdays: p.days, start: p.start, end: p.end })
        : await updateSlot({ slotId: d.slotId, expectedVersion: d.snapshot.version, classIds: p.classIds, weekday: p.days[0], start: p.start, end: p.end });
    if (result.status !== 'ok') {
      endWrite(result.status);
      handleDialogProblem(result.status);
      return;
    }
    // Then each class whose color was changed in the dialog (color belongs to the class).
    let colorFailed = false;
    for (const classId of p.classIds) {
      const chosen = p.colors[classId] ?? DEFAULT_COLOR;
      if (chosen === (ref.current.loaded?.colors[classId] ?? DEFAULT_COLOR)) continue;
      const colorResult = await setClassColor({ classId, color: chosen });
      if (colorResult.status !== 'ok') colorFailed = true;
    }
    endWrite('ok');
    setDialog(null);
    if (d.mode === 'add' && d.versionId === null) setChosenId(result.versionId); // the school's first schedule
    reloadQuiet();
    if (colorFailed) setBanner({ text: T.COLOR_FAILED });
    if (d.mode === 'add') {
      const added = result.slots;
      showToast(T.toastSlotsAdded(added.length), {
        icon: false,
        action: { label: T.UNDO, onAction: () => runUndo(() => removeMany(added)) },
      });
      focusBack(d.opener, '[data-add-slot]');
    } else {
      const before = d.snapshot;
      const savedVersion = result.version;
      showToast(T.TOAST_SLOT_SAVED, {
        icon: false,
        action: {
          label: T.UNDO,
          onAction: () =>
            runUndo(() =>
              updateSlot({ slotId: d.slotId, expectedVersion: savedVersion, classIds: before.classIds, weekday: before.weekday, start: before.start, end: before.end }),
            ),
        },
      });
      focusBack(document.querySelector(`[data-slot="${d.slotId}"]`) ?? d.opener, '[data-add-slot]');
    }
  }

  // Undo of "added": remove each new slot (version 1, just made). Stops at the first problem.
  async function removeMany(added) {
    for (const s of added) {
      const r = await removeSlot({ slotId: s.id, expectedVersion: s.version });
      if (r.status !== 'ok') return r;
    }
    return { status: 'ok' };
  }

  // ----- Remove a time slot (instant, with Undo) -----
  async function removeFromDialog() {
    const d = dialogRef.current;
    if (!d || d.saving || d.mode !== 'edit') return;
    if (!beginWrite()) return;
    patchDialog({ saving: true, removing: true, note: null });
    const result = await removeSlot({ slotId: d.slotId, expectedVersion: d.snapshot.version });
    patchDialog({ removing: false });
    endWrite(result.status);
    if (result.status !== 'ok') {
      handleDialogProblem(result.status);
      return;
    }
    setDialog(null);
    reloadQuiet();
    const r = result.removed;
    showToast(T.toastSlotRemoved(r.weekday, r.classIds.map((id) => classNames.get(id) ?? '').join(' + '), formatTime(r.start)), {
      icon: false,
      action: {
        label: T.UNDO,
        onAction: () => runUndo(() => addSlots({ locationCode, versionId: r.versionId, classIds: r.classIds, weekdays: [r.weekday], start: r.start, end: r.end })),
      },
    });
    focusBack(null, `[data-add-slot="${locationCode}"], [data-version-picker="${locationCode}"]`);
  }

  // ----- Plan a change / edit a planned schedule -----
  async function savePlan() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const { classified: list, loaded: l } = ref.current;
    const check = checkPlanForm(d, list, l.today);
    if (!check.canSave) return;
    if (check.sameAsSaved) {
      cancelDialog();
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const p = check.payload;
    const result =
      d.mode === 'plan'
        ? await planVersion({ locationCode, name: p.name, startsOn: p.startsOn, copy: p.copy })
        : await updateVersion({ versionId: d.versionId, expectedVersion: d.snapshot.version, name: p.name, startsOn: p.startsOn });
    endWrite(result.status);
    if (result.status !== 'ok') {
      handleDialogProblem(result.status, result.status === 'duplicate_date' ? { duplicateDate: p.startsOn } : {});
      return;
    }
    setDialog(null);
    setChosenId(result.id); // show the planned schedule (mockup: Save opens it)
    reloadQuiet();
    if (d.mode === 'plan') {
      const newId = result.id;
      const count = result.slotCount;
      showToast(T.TOAST_PLANNED, {
        icon: false,
        action: {
          label: T.UNDO,
          onAction: () => {
            setChosenId(null);
            return runUndo(() => deleteVersion({ versionId: newId, expectedVersion: 1, expectedSlotCount: count }));
          },
        },
      });
    } else {
      const before = d.snapshot;
      const savedVersion = result.version;
      showToast(T.TOAST_PLAN_SAVED, {
        icon: false,
        action: {
          label: T.UNDO,
          onAction: () => runUndo(() => updateVersion({ versionId: d.versionId, expectedVersion: savedVersion, name: before.name, startsOn: before.startsOn })),
        },
      });
    }
    focusBack(document.querySelector(`[data-version-picker="${locationCode}"]`), null);
  }

  // ----- Delete a planned schedule (permanent → confirmation naming what goes) -----
  function startDeletePlanned(v, opener) {
    const count = ref.current.loaded.slots.filter((s) => s.versionId === v.id).length;
    openDialog({ type: 'delete', version: v, count, failed: false, opener });
  }
  async function confirmDelete() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    if (!beginWrite()) return;
    patchDialog({ saving: true, failed: false });
    const result = await deleteVersion({ versionId: d.version.id, expectedVersion: d.version.version, expectedSlotCount: d.count });
    endWrite(result.status);
    if (result.status === 'ok') {
      setDialog(null);
      setChosenId(null);
      showToast(T.toastDeletedPlan(d.version), { icon: false }); // no Undo: permanent
      reloadQuiet();
      focusBack(document.querySelector(`[data-version-picker="${locationCode}"]`), null);
    } else if (result.status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (['stale', 'not_found', 'not_allowed', 'invalid'].includes(result.status)) {
      setDialog(null);
      setBanner({ text: result.status === 'not_allowed' ? T.PAST_NOT_ALLOWED : T.STALE });
      reloadQuiet();
    } else {
      patchDialog({ saving: false, failed: true });
    }
  }

  // ===== Undo =====
  async function runUndo(call) {
    if (!beginWrite()) return;
    const result = await call();
    endWrite(result.status);
    if (result.status === 'ok') {
      setBanner(null);
      await reloadQuiet(); // "Undone" appears once the schedule on screen shows it
      showToast(T.TOAST_UNDONE, { icon: false });
    } else if (result.status === 'no_access') {
      onNoAccess();
    } else if (result.status === 'not_allowed') {
      setBanner({ text: isAdmin ? T.PAST_NOT_ALLOWED : T.NOT_ALLOWED });
      onRefreshProfile();
    } else if (['stale', 'not_found', 'invalid', 'duplicate_date'].includes(result.status)) {
      setBanner({ text: T.UNDO_STALE });
      reloadQuiet();
    } else {
      setBanner({ text: T.UNDO_FAILED, retry: () => runUndo(call) });
    }
  }

  // ===== The ⋯ menu of a planned schedule =====
  function menuItems() {
    if (menu?.kind === 'page') {
      return [{ key: 'plan', label: T.PLAN_A_CHANGE, Icon: IconCalendarPlus, disabled: busy, onSelect: () => openPlan(menu.anchor) }];
    }
    if (!shown || shown.state !== 'planned') return [];
    return [
      { key: 'date', label: T.CHANGE_START_DATE, Icon: IconCalendar, disabled: busy, onSelect: () => openEditPlanned(shown, menu.anchor) },
      { key: 'rename', label: T.RENAME, Icon: IconEdit, disabled: busy, onSelect: () => openEditPlanned(shown, menu.anchor) },
      { key: 'delete', label: T.DELETE_PLANNED, Icon: IconTrash, danger: true, separatorBefore: true, disabled: busy, onSelect: () => startDeletePlanned(shown, menu.anchor) },
    ];
  }

  // Both: the page's "Add time slot" / "Plan a change" asked for this school.
  const handledRequestRef = useRef(null);
  useEffect(() => {
    if (!request || handledRequestRef.current === request.seq || data.status !== 'ready') return;
    handledRequestRef.current = request.seq;
    if (request.kind === 'add') openAddSlot(null);
    else openPlan(null);
    // openAddSlot / openPlan read the newest state; only a new request should run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, data.status]);

  // N = Add time slot (PC only, when nothing else is open).
  const addShown = editable && data.status === 'ready';
  useShortcutN({
    enabled: shortcutEnabled && addShown && dialog === null && menu === null && !screenLocked && !busy,
    onPress: () => openAddSlot(document.querySelector('[data-add-slot]')),
  });

  // ===== Drawing =====
  const hasAnything = classified.length > 0;
  const buttons =
    data.status === 'ready' && isAdmin && headerMode === 'page' ? (
      <div className="sactions">
        {hasAnything && !isPhone && (
          <button type="button" className="btn" onClick={(e) => openPlan(e.currentTarget)}>
            {/* ti-calendar-plus = plan a schedule change (v0.137) */}
            <IconCalendarPlus size={16} aria-hidden="true" />
            {T.PLAN_A_CHANGE}
          </button>
        )}
        {hasAnything && isPhone && (
          // Phone: Plan a change lives under ⋯ next to "+ Add" (mockup screen 1).
          <button
            type="button"
            className="icon-button"
            aria-label={T.MORE_ACTIONS}
            aria-haspopup="menu"
            aria-expanded={menu?.kind === 'page' ? 'true' : 'false'}
            onClick={(e) => setMenu(menu ? null : { kind: 'page', anchor: e.currentTarget })}
          >
            <IconDots size={20} aria-hidden="true" />
          </button>
        )}
        {editable && (
          <button
            type="button"
            className="btn btn-primary"
            data-add-slot={locationCode}
            onClick={(e) => openAddSlot(e.currentTarget)}
          >
            <IconPlus size={16} aria-hidden="true" />
            {isPhone ? T.ADD_SHORT : T.ADD_TIME_SLOT}
          </button>
        )}
      </div>
    ) : null;

  const pickerRow = hasAnything && (
    <div className="spicker-row">
      <label className="visually-hidden" htmlFor={`picker-${locationCode}`}>
        {T.SCHEDULE_PICKER}
      </label>
      <select
        id={`picker-${locationCode}`}
        className="input spicker"
        data-version-picker={locationCode}
        value={shown?.id ?? ''}
        onChange={(e) => setChosenId(e.target.value)}
      >
        {current && <option value={current.id}>{T.currentLabel(current)}</option>}
        {planned.length > 0 && (
          <optgroup label={T.GROUP_PLANNED}>
            {planned.map((v) => (
              <option key={v.id} value={v.id}>
                {T.plannedLabel(v)}
              </option>
            ))}
          </optgroup>
        )}
        {past.length > 0 && (
          <optgroup label={T.GROUP_PAST}>
            {past.map((v) => (
              <option key={v.id} value={v.id}>
                {versionLabel(v, classified)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {isAdmin && shown?.state === 'planned' && (
        <button
          type="button"
          className="icon-button"
          aria-label={T.SCHEDULE_MORE(shown)}
          aria-haspopup="menu"
          aria-expanded={menu?.kind === 'version' ? 'true' : 'false'}
          onClick={(e) => setMenu(menu ? null : { kind: 'version', anchor: e.currentTarget })}
        >
          <IconDots size={20} aria-hidden="true" />
        </button>
      )}
      {!isPhone && planned.length > 0 && <span className="psub spicker-count">{T.plannedCount(planned.length)}</span>}
    </div>
  );

  let infoBar = null;
  if (shown?.state === 'planned') {
    infoBar = current ? T.plannedBar(shown) : T.NO_CURRENT_BAR;
  } else if (shown?.state === 'past') {
    const next = endsBefore(classified, shown);
    infoBar = T.pastBar(shown, next ? addDays(next, -1) : null);
  }

  let body;
  if (data.status === 'loading') {
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
  } else if (data.status === 'error') {
    body = <ErrorBanner text={T.LOAD_FAILED} onRetry={() => data.reload()} />;
  } else if (data.status === 'noAccess') {
    body = null;
  } else if (!hasAnything || (shown === current && shownSlots.length === 0 && planned.length === 0)) {
    body = <p className="tempty">{isAdmin ? T.emptySchoolAdmin(school) : T.emptySchoolStaff(school)}</p>;
  } else {
    const grid = (
      <TimeGrid
        days={isPhone ? [day] : [1, 2, 3, 4, 5, 6, 7]}
        slots={isPhone ? shownSlots.filter((s) => s.weekday === day) : shownSlots}
        // Phone: that day's own hours, so it opens at its first class (mockup screen 1).
        rangeSlots={isPhone ? shownSlots.filter((s) => s.weekday === day) : shownSlots}
        classNames={classNames}
        colors={loaded.colors}
        pxPerMin={PX_PER_MIN[device]}
        showDayHeads={!isPhone}
        onOpen={editable ? openEditSlot : null}
        selectedId={dialog?.type === 'slot' && dialog.mode === 'edit' && !screenLocked ? dialog.slotId : null}
      />
    );
    body = (
      <>
        {infoBar && (
          <p className="sinfobar">
            {shown.state === 'past' ? <IconHistory size={16} aria-hidden="true" /> : <IconCalendarEvent size={16} aria-hidden="true" />}
            <span>{infoBar}</span>
          </p>
        )}
        {isPhone && (
          <div className="sdaypick" role="group" aria-label={T.DAYS}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button key={d} type="button" className={`sdaypick-btn${d === day ? ' is-on' : ''}`} aria-pressed={d === day ? 'true' : 'false'} onClick={() => setPhoneDay(d)}>
                {T.DAY_SHORT[d]}
              </button>
            ))}
          </div>
        )}
        {shownSlots.length === 0 ? (
          <p className="tempty">{T.emptyVersion}</p>
        ) : isPhone && !shownSlots.some((s) => s.weekday === day) ? (
          <p className="tempty">{T.noClassesOnDay(day)}</p>
        ) : (
          grid
        )}
      </>
    );
  }

  // ----- The open dialog (hidden while locked; comes back after unlocking) -----
  let dialogElement = null;
  if (dialog && !screenLocked && loaded) {
    const common = { isPhone, onCancel: cancelDialog, onRequestClose: requestClose, onChange: changeValues, onTouch: touch };
    if (dialog.type === 'slot') {
      const version = classified.find((v) => v.id === dialog.versionId);
      dialogElement = (
        <SlotDialog
          key={dialog.key}
          state={dialog}
          school={school}
          versionLabel={version ? versionLabel(version, classified) : T.currentLabel({ startsOn: loaded.today })}
          classes={loaded.classes}
          versionSlots={loaded.slots.filter((s) => s.versionId === dialog.versionId)}
          onSave={saveSlot}
          onRemove={removeFromDialog}
          {...common}
        />
      );
    } else if (dialog.type === 'plan') {
      const source = dialog.values.startsOn ? copySourceFor(classified, dialog.values.startsOn) : current;
      dialogElement = (
        <PlanDialog
          key={dialog.key}
          state={dialog}
          school={school}
          versions={classified}
          today={loaded.today}
          copySource={source ? versionLabel(source, classified) : null}
          copyCount={source ? loaded.slots.filter((s) => s.versionId === source.id).length : 0}
          onSave={savePlan}
          {...common}
        />
      );
    } else {
      dialogElement = (
        <Dialog title={T.deletePlannedTitle(dialog.version)} variant="confirm" describedBy={`del-${dialog.key}`} onRequestClose={cancelDialog}>
          <p id={`del-${dialog.key}`} className="tdialog-sub tdialog-body">
            {T.deletePlannedBody(dialog.version, dialog.count, (() => {
              const before = copySourceFor(classified, dialog.version.startsOn);
              return before ? versionLabel(before, classified).split(' · ')[0] : null;
            })())}
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn" data-autofocus onClick={cancelDialog}>
              {T.CANCEL}
            </button>
            <button type="button" className="btn btn-delete" aria-disabled={dialog.saving ? 'true' : undefined} onClick={() => !dialog.saving && confirmDelete()}>
              <IconTrash size={16} aria-hidden="true" />
              {T.DELETE}
            </button>
          </div>
          {dialog.failed && (
            <div className="tdialog-note">
              <Notice>{T.DELETE_FAILED}</Notice>
            </div>
          )}
        </Dialog>
      );
    }
  }

  const subtitle = headerMode === 'page' ? school : null;
  return (
    <section className={`sschool${headerMode === 'section' ? ' sschool--section' : ''}`} aria-label={headerMode === 'section' ? school : undefined}>
      {headerMode === 'page' ? (
        renderPageHeader(buttons, subtitle)
      ) : (
        <div className="sschool-head">
          <h2 className="sschool-title">
            {/* ti-map-pin = location (as the switcher) */}
            <IconMapPin size={16} aria-hidden="true" />
            {school}
          </h2>
        </div>
      )}
      {!isAdmin && headerMode === 'page' && <p className="viewonly">{T.VIEW_ONLY_LINE}</p>}
      {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy} onDismiss={() => setBanner(null)} />}
      {data.status === 'ready' && pickerRow}
      {body}
      {menu && !screenLocked && (menu.kind === 'page' || shown?.state === 'planned') && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={menu.kind === 'page' ? T.PAGE_TITLE : (shown.name ?? T.GROUP_PLANNED)}
          subtitle={menu.kind === 'page' ? school : T.startsLine(shown)}
          label={menu.kind === 'page' ? T.MORE_ACTIONS : T.SCHEDULE_MORE(shown)}
          items={menuItems()}
          onClose={(reason) => {
            const anchor = menu.anchor;
            setMenu(null);
            if (reason === 'escape' || reason === 'tab') anchor?.focus();
          }}
        />
      )}
      {dialogElement}
    </section>
  );
}
