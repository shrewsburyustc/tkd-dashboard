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
// Status words come from text.js; the database decides, the screen only grays Save early.
import { useLayoutEffect, useRef, useState } from 'react';
import { nameKey, normalizeName } from '../../../lib/testing/names.js';
import { addCycle, loadCycle, loadCycleDefaults, setRegistration, updateCycle } from '../../../lib/blackBelt/api.js';
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

export function useCycleEditor({ isAdmin, today, cycles, beginWrite, endWrite, setBanner, onNoAccess, onRefreshProfile, showToast, clearToast, onSaved, onClosed, onGone }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [dialog, setDialog] = useState(null);
  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
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
    const result = await loadCycle({ cycleId });
    endWrite(result.status === 'ok' ? 'ok' : result.status);
    if (result.status !== 'ok') {
      handleLoadProblem(result.status);
      return;
    }
    const values = formToValues(cycleToForm(result.cycle));
    open({ mode: 'edit', cycleId, opener, values, original: result.cycle, sourceCycleId: null });
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
    if (d.mode === 'add') {
      result = await addCycle({ form: { ...form, registrationOpen: false }, sourceCycleId: d.sourceCycleId });
      switchWanted = false; // v0.933: Add cycle always saves the cycle closed
    } else {
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
    showToast(d.mode === 'add' ? T.TOAST_CYCLE_ADDED : T.TOAST_CHANGES_SAVED, { icon: false });
    if (switchFailed) {
      if (switchFailed === 'no_access') onNoAccess();
      else {
        const wanted = form.registrationOpen === true;
        const retry = async () => {
          if (!beginWrite()) return;
          const fresh = await loadCycle({ cycleId });
          const again = fresh.status === 'ok' ? await setRegistration({ cycleId, expectedVersion: fresh.cycle.version, open: wanted }) : fresh;
          endWrite(again.status);
          if (again.status === 'ok') {
            setBanner(null);
            onSaved?.({ mode: 'edit', id: cycleId, opener: d.opener });
          } else if (again.status === 'no_access') onNoAccess();
          else setBanner({ text: T.registrationNotChanged(T.switchProblem(again.status)), retry });
        };
        setBanner({ text: T.registrationNotChanged(T.switchProblem(switchFailed)), retry: switchFailed === 'error' ? retry : undefined });
      }
    }
    onSaved?.({ mode: d.mode, id: cycleId, opener: d.opener });
  }

  // ----- The testing-day dialog (on top) -----
  function openDay(index, opener) {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const day = index === null ? null : d.values.days[index];
    const originalDate = d.mode === 'edit' && day?.id ? (d.original?.days ?? []).find((x) => x.id === day.id)?.date ?? null : null;
    const values = dayToValues(day ?? { name: '', date: '', start: '', end: '', place: { code: 'worcester' }, second: null, parts: [] });
    patch({ day: { index, values, initial: values, touched: {}, triedSave: false, note: null, originalDate, opener } });
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
        <CycleDialog key={dialog.key} state={dialog} check={c} isPhone={isPhone} handlers={handlers} />
        {dialog.day && (
          <DayDialog
            state={dialog.day}
            cycleName={normalizeName(dialog.values.name)}
            dayCount={dialog.values.days.length}
            today={today}
            otherDays={otherDays}
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
