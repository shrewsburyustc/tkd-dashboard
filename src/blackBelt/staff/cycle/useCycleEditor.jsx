// useCycleEditor.jsx — the "brain" of Add cycle / Edit cycle (and the testing-day and Add plan
// dialogs on top of it). Used by the Cycles tab and by the cycle page's ⋯ → Edit cycle.
// Why it exists: contract CONTRACT-0016-B1 §3 (Cycles 4 and 5). The dialog's values live HERE,
// not in the dialog, so a screen lock hides the dialog and brings it back exactly as it was.
//
//   const editor = useCycleEditor({ isAdmin, today, cycles, beginWrite, endWrite, setBanner,
//                                   onNoAccess, onRefreshProfile, showToast, clearToast,
//                                   onSaved, onClosed, onGone });
//   editor.openAdd(opener) · editor.openEdit(cycleId, opener) · editor.element · editor.isOpen
//
// How a save works:
//   Add:  loadCycleDefaults() fills the form (the last cycle, or Fall 2026 the first time) →
//         addCycle(). The new cycle is ALWAYS saved closed with a copy of the default rubric
//         (migration 0024, v0.933): no follow-up setRegistration any more.
//   Edit: loadCycle() fills the form → updateCycle() (days, deadlines, due dates — prices never
//         change, v0.902) → setRegistration() only if the switch changed (the switch is shown only
//         for a cycle opened once — a never-opened cycle is opened from ⋯, contract 0024 OI-11)
//   If the second call fails, the cycle IS saved: the dialog closes and the screen behind shows
//   "The cycle was saved, but registration didn't change: …" with Retry.
// After a save (BB5, v0.967): "Cycle added · Undo" (deletes the new cycle) and "Changes saved ·
// Undo" (puts the old values and the registration switch back) — see undoAdd / undoEdit below.
// Migration 0032: "Changes saved · Undo" is ONE database call (undoCycleEdit), so it can no longer
// stop halfway, and a family that registers between the Save and the Undo is always caught.
// Status words come from text.js; the database decides, the screen only grays Save early.
// Migration 0025 (contract §14.5, S2): Edit cycle also reads bb_cycle_grading_state. A past day
// whose part already has grades can't be moved or deleted (nor that part unticked), and once
// grading started the first day can't be moved or deleted and no day can come before it — those
// days' Delete is grayed with a gray reason under the day, and the day dialog locks its date /
// those parts (dayLock below). The database's own refusal (has_grades) says so in the dialog and
// reads the grading state again.
import { useLayoutEffect, useRef, useState } from 'react';
import { nameKey, normalizeName } from '../../../lib/testing/names.js';
import { addCycle, deleteCycle, loadCycle, loadCycleDefaults, loadRoster, setRegistration, undoCycleEdit, updateCycle } from '../../../lib/blackBelt/api.js';
import { loadGradingState } from '../../../lib/blackBelt/gradingApi.js';
import { cycleFormProblems, cycleToForm, findDuplicateCycle, followApplicationDue, hasProblems, setPaymentDueDate } from '../../../lib/blackBelt/rules.js';
import { PHONE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import AddPlanDialog from './AddPlanDialog.jsx';
import CycleDialog from './CycleDialog.jsx';
import DayDialog from './DayDialog.jsx';
import { DANS, dayToValues, formToValues, newKey, sortDays, valuesToDay, valuesToForm } from './formValues.js';
import * as T from '../text.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Notes that stop Save until the dialog is closed and opened again.
const BLOCKING = ['STALE', 'NOT_ALLOWED'];

function focusSoon(find) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => find()?.focus()));
}

// 0025 (S2): what grading locks on one day of Edit cycle.
//   grading   loadGradingState's answer (null = not read, or nothing known: nothing is grayed)
//   original  the cycle as loaded (its days keep their ids and saved dates)
//   day       the day in the form (day.id = a saved day; null for a new one)
// → { reason, dateLocked, noDelete, lockedParts, minDate } — reason = the gray words (or null)
export function dayLock(grading, original, day) {
  const none = { reason: null, dateLocked: false, noDelete: false, lockedParts: [], minDate: null };
  if (!grading) return none;
  const minDate = grading.firstDayFrozen && grading.firstDay ? grading.firstDay : null;
  const saved = day?.id ? (original?.days ?? []).find((x) => x.id === day.id) ?? null : null;
  if (!saved) return { ...none, minDate };
  const protectedDay = grading.protectedDays.find((x) => x.id === day.id) ?? null;
  if (protectedDay) return { reason: T.DAY_HAS_GRADES, dateLocked: true, noDelete: true, lockedParts: protectedDay.parts, minDate };
  // The first day is frozen only when no other saved day shares its date (the database's rule)
  const onFirst = (original?.days ?? []).filter((x) => x.date === grading.firstDay);
  if (minDate && saved.date === grading.firstDay && onFirst.length === 1) return { reason: T.FIRST_DAY_FROZEN, dateLocked: true, noDelete: true, lockedParts: [], minDate };
  return { ...none, minDate };
}

// Edit cycle's Undo (BB5): the form that puts the cycle back as it was loaded. A day the save
// removed no longer exists, so it goes back as a NEW day (no id); a day the save added isn't in
// this form, so the database removes it again.
export function undoForm(original, saved) {
  const form = cycleToForm(original);
  const kept = new Set((saved.days ?? []).map((day) => day.id).filter(Boolean));
  return { ...form, days: form.days.map((day) => (kept.has(day.id) ? day : { ...day, id: null })) };
}

export function useCycleEditor({ isAdmin, today, cycles, beginWrite, endWrite, setBanner, onNoAccess, onRefreshProfile, showToast, clearToast, onSaved, onClosed, onGone, reload }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [dialog, setDialog] = useState(null);
  const dialogRef = useRef(dialog);
  // The newest callbacks, for a toast's Undo that runs seconds after the save.
  const latest = useRef({});
  useLayoutEffect(() => {
    dialogRef.current = dialog;
    latest.current = { beginWrite, endWrite, setBanner, onNoAccess, onRefreshProfile, showToast, reload };
  });

  const patch = (changes) => setDialog((current) => (current ? { ...current, ...(typeof changes === 'function' ? changes(current) : changes) } : current));
  // A change to the form clears a non-blocking note ("Unsaved changes…", "That didn't save…").
  const changeValues = (fn) =>
    setDialog((current) => {
      if (!current || current.saving) return current;
      const values = fn(current.values);
      const note = current.note && !BLOCKING.includes(current.note) ? null : current.note;
      return { ...current, values, note, failed: false };
    });

  // ----- What the form says right now -----
  function check(d) {
    const form = valuesToForm(d.values);
    const problems = cycleFormProblems(form, { today, mode: d.mode, original: d.original });
    const typed = normalizeName(d.values.name);
    const localDuplicate = problems.name ? null : findDuplicateCycle(cycles ?? [], typed, d.cycleId);
    const serverDuplicate = d.duplicateName !== null && nameKey(d.duplicateName) === nameKey(typed) ? typed : null;
    const duplicateName = serverDuplicate ?? localDuplicate;
    const partsWithoutDay = problems.partsWithoutDay ?? [];
    const valid = !hasProblems(problems) && !duplicateName;
    return { form, problems, duplicateName, partsWithoutDay, valid, canSave: valid && !d.saving && !BLOCKING.includes(d.note) };
  }

  // ----- Opening -----
  function handleLoadProblem(status) {
    if (status === 'no_access') onNoAccess();
    else if (status === 'not_allowed') {
      setBanner({ text: T.NOT_ALLOWED });
      onRefreshProfile();
    } else if (status === 'not_found') {
      setBanner({ text: T.CYCLE_DELETED });
      onGone?.();
    } else setBanner({ text: T.LOAD_FAILED });
  }

  function open(next) {
    clearToast();
    setDialog({
      key: Date.now(),
      touched: {},
      triedSave: false,
      note: null,
      noteAt: 0,
      saving: false,
      failed: false,
      duplicateName: null,
      day: null,
      addPlan: null,
      ...next,
      initial: next.values,
    });
  }

  async function openAdd(opener) {
    if (!isAdmin || dialogRef.current || !beginWrite()) return;
    const result = await loadCycleDefaults();
    endWrite(result.status === 'ok' ? 'ok' : result.status);
    if (result.status !== 'ok') {
      handleLoadProblem(result.status);
      return;
    }
    const values = formToValues({ ...result.form, registrationOpen: false });
    open({ mode: 'add', cycleId: null, opener, values, original: null, sourceCycleId: result.sourceCycleId ?? null });
  }

  async function openEdit(cycleId, opener) {
    if (!isAdmin || dialogRef.current || !beginWrite()) return;
    const [result, grading] = await Promise.all([loadCycle({ cycleId }), loadGradingState({ cycleId })]);
    endWrite(result.status === 'ok' ? 'ok' : result.status);
    if (result.status !== 'ok') {
      handleLoadProblem(result.status);
      return;
    }
    const values = formToValues(cycleToForm(result.cycle));
    // 0025: the grading state grays what grading locks (unreadable → nothing grayed; the database decides)
    open({ mode: 'edit', cycleId, opener, values, original: result.cycle, sourceCycleId: null, grading: grading.status === 'ok' ? grading : null });
  }

  // ----- Closing -----
  function cancel() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    setDialog(null);
    onClosed?.({ mode: d.mode, id: d.cycleId, opener: d.opener });
  }
  function requestClose() {
    const d = dialogRef.current;
    if (!d) return;
    // Back / Esc while a dialog on top is open: that one is asked first.
    if (d.day) {
      dayRequestClose();
      return;
    }
    if (d.addPlan) {
      closeAddPlan();
      return;
    }
    if (d.saving) return;
    if (same(d.values, d.initial)) {
      cancel();
      return;
    }
    if (!BLOCKING.includes(d.note)) patch({ note: 'UNSAVED', noteAt: Date.now() });
  }

  // ----- Saving -----
  async function save() {
    const d = dialogRef.current;
    if (!d || d.saving || d.day || d.addPlan) return;
    const c = check(d);
    if (!c.canSave) {
      patch({ triedSave: true });
      return;
    }
    if (d.mode === 'edit' && same(d.values, d.initial)) {
      cancel();
      return;
    }
    if (!beginWrite()) return;
    patch({ saving: true, note: null, failed: false });
    const form = { ...c.form, name: normalizeName(c.form.name) };

    let result;
    let switchWanted = false;
    // For Edit cycle's Undo (BB5): who was registered BEFORE this save. The database refuses the
    // Undo when a family registered after it (see undoEdit). Read before the save, so a family
    // that registers while the save is on its way counts as "after" (the safe side). A cycle never
    // opened for registration can't have families, so nothing is read (an empty list). If the
    // read fails, this save gets NO Undo (plain "Changes saved"): comparing the database's
    // registration times with this computer's clock could let an Undo through after a family
    // registered.
    let known = null;
    if (d.mode === 'add') {
      result = await addCycle({ form: { ...form, registrationOpen: false }, sourceCycleId: d.sourceCycleId });
      switchWanted = false; // v0.933: Add cycle always saves the cycle closed
    } else {
      if (!d.original.firstOpenedAt) known = new Set();
      else {
        const before = await loadRoster({ cycleId: d.cycleId });
        if (before.status === 'ok') known = new Set(before.rows.map((r) => r.id));
      }
      result = await updateCycle({ cycleId: d.cycleId, expectedVersion: d.original.version, form });
      switchWanted = Boolean(d.original.firstOpenedAt) && form.registrationOpen !== d.original.registrationOpen;
    }

    if (result.status !== 'ok') {
      endWrite(result.status);
      const status = result.status;
      if (status === 'no_access') {
        patch({ saving: false });
        onNoAccess();
      } else if (status === 'not_allowed') {
        patch({ saving: false, note: 'NOT_ALLOWED' });
        onRefreshProfile();
      } else if (status === 'stale' || status === 'not_found') {
        patch({ saving: false, note: 'STALE' });
        onGone?.();
      } else if (status === 'duplicate_name') {
        patch({ saving: false, duplicateName: form.name });
      } else if (status === 'has_grades') {
        // 0025 (S2): a graded day or the first day changed — say so and gray them from now on
        patch({ saving: false, note: 'HAS_GRADES', noteAt: Date.now() });
        loadGradingState({ cycleId: d.cycleId }).then((g) => {
          if (g.status === 'ok') patch((current) => (current.cycleId === d.cycleId ? { grading: g } : {}));
        });
      } else if (status === 'part_without_day' || status === 'invalid') {
        // part_without_day can't normally happen (Save is gray first); the list shows the parts.
        patch({ saving: false, note: 'INVALID', triedSave: true });
      } else {
        patch({ saving: false, failed: true }); // banner + Retry inside the dialog (rule 3.5)
      }
      return;
    }

    const cycleId = d.mode === 'add' ? result.id : d.cycleId;
    let switchFailed = null;
    let version = result.version;
    if (switchWanted) {
      const open = form.registrationOpen === true;
      const switched = await setRegistration({ cycleId, expectedVersion: version, open });
      if (switched.status === 'ok') version = switched.version;
      else switchFailed = switched.status;
    }
    endWrite('ok');
    setDialog(null);
    // BB5 (v0.967): "Cycle added · Undo" (Undo deletes the new cycle) and "Changes saved · Undo"
    // (Undo puts back everything this save changed, the registration switch included).
    const name = form.name;
    // What Edit cycle's Undo works from. It is an object the switch's Retry below can update: a
    // Retry that works moves the version on and means the switch must be put back too.
    const editUndo = {
      cycleId,
      version,
      name,
      oldForm: d.mode === 'edit' ? undoForm(d.original, form) : null,
      switched: switchWanted && !switchFailed,
      oldOpen: d.original?.registrationOpen === true,
      known,
    };
    let undo = null;
    if (d.mode === 'add') undo = () => undoAdd({ cycleId, version, name });
    else if (known) undo = () => undoEdit({ ...editUndo });
    const toastText = d.mode === 'add' ? T.TOAST_CYCLE_ADDED : T.TOAST_CHANGES_SAVED;
    showToast(toastText, undo ? { icon: false, action: { label: T.UNDO, onAction: undo } } : { icon: false });
    if (switchFailed) {
      if (switchFailed === 'no_access') onNoAccess();
      else {
        const retry = () =>
          retrySwitch(cycleId, form.registrationOpen === true, (newVersion) => {
            editUndo.version = newVersion;
            editUndo.switched = true;
            onSaved?.({ mode: 'edit', id: cycleId, opener: d.opener });
          });
        setBanner({ text: T.registrationNotChanged(T.switchProblem(switchFailed)), retry: switchFailed === 'error' ? retry : undefined });
      }
    }
    onSaved?.({ mode: d.mode, id: cycleId, opener: d.opener });
  }

  // The registration switch again, after it failed (the bar's Retry): read the cycle's newest
  // version, then switch. done(newVersion) runs when it worked.
  async function retrySwitch(cycleId, wanted, done) {
    const a = latest.current;
    if (!a.beginWrite()) return;
    const fresh = await loadCycle({ cycleId });
    const again = fresh.status === 'ok' ? await setRegistration({ cycleId, expectedVersion: fresh.cycle.version, open: wanted }) : fresh;
    a.endWrite(again.status);
    if (again.status === 'ok') {
      a.setBanner(null);
      done?.(again.version);
    } else if (again.status === 'no_access') a.onNoAccess();
    else a.setBanner({ text: T.registrationNotChanged(T.switchProblem(again.status)), retry: again.status === 'error' ? () => retrySwitch(cycleId, wanted, done) : undefined });
  }

  // ----- Undo (BB5, v0.967) — every problem goes in the amber bar (v0.966) -----
  // `a` is always the props as they were when Undo was PRESSED: on the cycle page each tab has its
  // own bar setter, so an answer that arrives after a tab change is dropped, not shown on the new tab.
  // Undo's own lost connection → the bar with Retry (the same Undo again); a refusal → × only.
  function undoFailed(a, retry) {
    a.setBanner({
      text: T.UNDO_FAILED,
      retry: () => {
        a.setBanner(null);
        retry();
      },
    });
  }
  // A refusal: read the list again first (so "Their change is shown" is true), then the bar.
  async function undoRefused(a, status, text) {
    a.endWrite(status);
    await a.reload?.();
    a.setBanner({ text });
  }

  // "Cycle added · Undo": delete the new cycle with the version and candidate count (0) it was
  // saved with. The database refuses when anything happened to it meanwhile ('stale': someone
  // changed it, or a candidate was added). Which one is read from the roster: a family's
  // registration (source 'form') → "Can't undo: a family has already registered."; anything else
  // → "Someone else changed Spring 2027 just now, so nothing was done. Their change is shown."
  async function undoAdd({ cycleId, version, name }) {
    const a = latest.current;
    if (!a.beginWrite()) return;
    const result = await deleteCycle({ cycleId, expectedVersion: version, expectedCandidateCount: 0 });
    const status = result.status;
    if (status === 'ok') {
      a.endWrite('ok');
      a.reload?.();
      a.showToast(T.TOAST_UNDONE, { icon: false });
      return;
    }
    if (status === 'no_access') {
      a.endWrite(status);
      a.onNoAccess();
      return;
    }
    if (status === 'error') {
      a.endWrite(status);
      undoFailed(a, () => undoAdd({ cycleId, version, name }));
      return;
    }
    if (status === 'not_found') return undoRefused(a, status, T.CYCLE_DELETED);
    if (status === 'not_allowed') {
      a.onRefreshProfile();
      return undoRefused(a, status, T.NOT_ALLOWED);
    }
    if (status === 'has_waivers') return undoRefused(a, status, T.CANT_UNDO_REGISTERED); // a family signed
    const roster = await loadRoster({ cycleId });
    const familyCame = roster.status === 'ok' && roster.rows.some((r) => r.source === 'form');
    return undoRefused(a, status, familyCame ? T.CANT_UNDO_REGISTERED : T.candidateStale(name));
  }

  // "Changes saved · Undo" of Edit cycle: ONE database call (migration 0032, bb_undo_cycle_edit).
  // The database locks the cycle, then
  //   - refuses ('registered', nothing done) when a family registered after the save: it compares
  //     the cycle's family registrations with u.known, the roster read just before the save (a save
  //     without that list has no Undo). A registration waits for the same lock, so one that comes
  //     in while the Undo runs counts as after it;
  //   - puts the registration switch back when the save changed it (u.switched; the version the
  //     save returned — someone else's change since → stale), then the old values (the automatic
  //     close included). If either is refused, NEITHER is kept, so the Undo can't stop halfway.
  // A refusal → its words in the bar (× only); a lost connection → the bar with Retry (the same
  // Undo again).
  async function undoEdit(u) {
    const a = latest.current;
    if (!a.beginWrite()) return;
    const back = await undoCycleEdit({
      cycleId: u.cycleId,
      expectedVersion: u.version,
      form: u.oldForm,
      open: u.switched ? u.oldOpen : null,
      knownIds: [...u.known],
    });
    const status = back.status;
    if (status === 'ok') {
      a.endWrite('ok');
      a.reload?.();
      a.showToast(T.TOAST_UNDONE, { icon: false });
      return undefined;
    }
    if (status === 'no_access') {
      a.endWrite(status);
      a.onNoAccess();
      return undefined;
    }
    if (status === 'error') {
      a.endWrite(status);
      undoFailed(a, () => undoEdit(u));
      return undefined;
    }
    if (status === 'not_allowed') a.onRefreshProfile();
    let text = T.UNDO_CYCLE_INVALID; // invalid (e.g. an old date is in the past now), duplicate_name …
    if (status === 'registered') text = T.CANT_UNDO_REGISTERED;
    else if (status === 'stale') text = T.candidateStale(u.name);
    else if (status === 'not_found') text = T.CYCLE_DELETED;
    else if (status === 'has_grades') text = T.UNDO_CYCLE_HAS_GRADES;
    else if (status === 'not_allowed') text = T.NOT_ALLOWED;
    else if (status === 'finished' || status === 'waiver_needed') text = T.switchProblem(status);
    return undoRefused(a, status, text);
  }

  // ----- The testing-day dialog (on top) -----
  function openDay(index, opener) {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const day = index === null ? null : d.values.days[index];
    const originalDate = d.mode === 'edit' && day?.id ? (d.original?.days ?? []).find((x) => x.id === day.id)?.date ?? null : null;
    const values = dayToValues(day ?? { name: '', date: '', start: '', end: '', place: { code: 'worcester' }, second: null, parts: [] });
    patch({ day: { index, dayId: day?.id ?? null, values, initial: values, touched: {}, triedSave: false, note: null, originalDate, opener } });
  }
  function changeDay(changes) {
    patch((current) => (current.day ? { day: { ...current.day, values: { ...current.day.values, ...changes }, note: null } } : {}));
  }
  function touchDay(field) {
    patch((current) => (current.day ? { day: { ...current.day, touched: { ...current.day.touched, [field]: true } } } : {}));
  }
  function closeDay(focusKey) {
    const d = dialogRef.current;
    if (!d?.day) return;
    const opener = d.day.opener;
    patch({ day: null });
    focusSoon(() => (focusKey ? document.querySelector(`[data-day-edit="${focusKey}"]`) : null) ?? (opener?.isConnected ? opener : document.querySelector('[data-add-day]')));
  }
  function dayRequestClose() {
    const d = dialogRef.current;
    if (!d?.day) return;
    if (same(d.day.values, d.day.initial)) closeDay();
    else patch({ day: { ...d.day, note: 'UNSAVED' } });
  }
  function saveDay(dayCheck) {
    const d = dialogRef.current;
    if (!d?.day) return;
    if (!dayCheck.valid) {
      patch({ day: { ...d.day, triedSave: true } });
      return;
    }
    const newDay = valuesToDay(d.day.values);
    const index = d.day.index;
    changeValues((values) => {
      const days = index === null ? [...values.days, newDay] : values.days.map((x, i) => (i === index ? newDay : x));
      return { ...values, days: sortDays(days) };
    });
    closeDay(newDay.key);
  }
  function deleteDay(index) {
    const d = dialogRef.current;
    if (!d) return;
    const removed = d.values.days[index];
    if (d.mode === 'edit' && dayLock(d.grading, d.original, removed).noDelete) return; // grayed (0025, S2)
    changeValues((values) => ({ ...values, days: values.days.filter((_, i) => i !== index) }));
    // Focus the next day's Edit (or Add testing day when none is left).
    const next = d.values.days[index + 1] ?? d.values.days[index - 1];
    focusSoon(() => (next && next.key !== removed?.key ? document.querySelector(`[data-day-edit="${next.key}"]`) : null) ?? document.querySelector('[data-add-day]'));
  }

  // ----- Add plan (on top) and the plan grid -----
  function openAddPlan(opener) {
    patch({ addPlan: { name: '', count: '1', triedSave: false, touchedName: false, opener } });
  }
  function closeAddPlan() {
    const opener = dialogRef.current?.addPlan?.opener;
    patch({ addPlan: null });
    focusSoon(() => (opener?.isConnected ? opener : null));
  }
  function addPlan(planCheck) {
    const d = dialogRef.current;
    if (!d?.addPlan) return;
    if (!planCheck.valid) {
      patch({ addPlan: { ...d.addPlan, triedSave: true, touchedName: true } });
      return;
    }
    const count = planCheck.count;
    const plan = {
      key: newKey('plan'),
      id: null,
      name: normalizeName(d.addPlan.name),
      payments: Array.from({ length: count }, (_, i) => ({ id: null, paymentNo: i + 1, dueOn: i === 0 ? d.values.applicationDue : '', followsApplicationDue: i === 0 })),
      amounts: Object.fromEntries(DANS.map((dan) => [dan, Array.from({ length: count }, () => '')])),
    };
    changeValues((values) => ({ ...values, plans: [...values.plans, plan] }));
    const opener = d.addPlan.opener;
    patch({ addPlan: null });
    focusSoon(() => (opener?.isConnected ? opener : null));
  }
  const mapPlan = (key, fn) => changeValues((values) => ({ ...values, plans: values.plans.map((p) => (p.key === key ? fn(p) : p)) }));
  function movePlan(key, toIndex) {
    changeValues((values) => {
      const from = values.plans.findIndex((p) => p.key === key);
      if (from === -1 || toIndex < 0 || toIndex >= values.plans.length || toIndex === from) return values;
      const plans = [...values.plans];
      const [moved] = plans.splice(from, 1);
      plans.splice(toIndex, 0, moved);
      return { ...values, plans };
    });
  }
  const prices = {
    onAmount: (key, dan, i, text) => mapPlan(key, (p) => ({ ...p, amounts: { ...p.amounts, [dan]: p.amounts[dan].map((x, j) => (j === i ? text : x)) } })),
    onDueDate: (key, paymentNo, date) => changeValues((values) => setPaymentDueDate(values, key, paymentNo, date)),
    onKukkiwon: (dan, text) => changeValues((values) => ({ ...values, kukkiwon: { ...values.kukkiwon, [dan]: text } })),
    onRemove: (key) => changeValues((values) => ({ ...values, plans: values.plans.filter((p) => p.key !== key) })),
    onMove: (key, delta) => {
      const index = dialogRef.current?.values.plans.findIndex((p) => p.key === key) ?? -1;
      if (index !== -1) movePlan(key, index + delta);
    },
    onReorder: (key, toIndex) => movePlan(key, toIndex),
    onAddPlan: openAddPlan,
  };

  // ----- Drawing -----
  let element = null;
  if (dialog) {
    const c = check(dialog);
    const handlers = {
      onChange: (changes) => changeValues((values) => ({ ...values, ...changes })),
      onTouch: (field) => patch((current) => (current.touched[field] ? {} : { touched: { ...current.touched, [field]: true } })),
      onApplicationDue: (date) => changeValues((values) => followApplicationDue(values, date)),
      onSave: save,
      onCancel: cancel,
      onRequestClose: requestClose,
      onAddDay: (opener) => openDay(null, opener),
      onEditDay: (index, opener) => openDay(index, opener),
      onDeleteDay: deleteDay,
      prices,
    };
    const otherDays = dialog.day ? dialog.values.days.filter((_, i) => i !== dialog.day.index) : [];
    element = (
      <>
        <CycleDialog
          key={dialog.key}
          state={dialog}
          check={c}
          today={today}
          isPhone={isPhone}
          handlers={handlers}
          dayLockOf={(day) => (dialog.mode === 'edit' ? dayLock(dialog.grading, dialog.original, day) : null)}
        />
        {dialog.day && (
          <DayDialog
            state={dialog.day}
            cycleName={normalizeName(dialog.values.name)}
            dayCount={dialog.values.days.length}
            today={today}
            otherDays={otherDays}
            lock={dialog.mode === 'edit' ? dayLock(dialog.grading, dialog.original, { id: dialog.day.dayId }) : null}
            isPhone={isPhone}
            onChange={changeDay}
            onTouch={touchDay}
            onSave={saveDay}
            onCancel={() => closeDay()}
            onRequestClose={dayRequestClose}
          />
        )}
        {dialog.addPlan && (
          <AddPlanDialog
            state={dialog.addPlan}
            plans={dialog.values.plans}
            isPhone={isPhone}
            onChange={(changes) => patch((current) => ({ addPlan: { ...current.addPlan, ...changes } }))}
            onAdd={addPlan}
            onCancel={closeAddPlan}
          />
        )}
      </>
    );
  }

  return { openAdd, openEdit, element, isOpen: dialog !== null, openId: dialog?.cycleId ?? null };
}
