// CampDialog.jsx — Add camp, Edit camp and Edit template: one dialog with folded sections (C3).
// Why it exists: approved mockup C3. A camp has a lot in it (days, hours, sign-up dates, a price
// grid, extras, ages, description, waiver), but most camps start from a template and only need a
// name and days. So the dialog shows:
//   - Start from: Blank camp or a template (Add camp only; the shared dropdown, components/Select.jsx)
//     — "Fills in everything except the name and days."
//   - five folded sections, only one open at a time (1. Camp is open first). Each folded section
//     is a bordered row with its number, title, a one-line summary and a chevron (ti-chevron-down,
//     ti-chevron-up when open). A section with a problem turns amber and says what's wrong.
//   - Save works from anywhere (no Next / Back). Pressing Save with a problem opens that section.
// Edit camp and Edit template use the same layout (a template has no days: Number of days).
// PC / tablet: a wide centered dialog (760px); phones: full screen with a back arrow and a full-
// width Save at the bottom.
//
// Unlike Color Belt's dialogs (whose values live in the page), this dialog keeps its own values
// and saves by itself — the Camps list AND the camp page open it, so it is written once. While the
// screen is locked it draws nothing (`hidden`) but stays mounted, so everything typed is still
// there after the PIN.
//
// Props: mode 'add' | 'edit' | 'template', campId (edit), template (edit template),
//        startTemplate (Add camp from a template's Use), defaultLocation, isPhone, hidden,
//        onClose(), onSaved({ kind, name, undo? }) (name = the camp's or template's name, for the Undo's refusal words), onNoAccess, onRefreshProfile, onUndoResult(status)
//
// Undo (rulebook v0.726, design review C5): every save hands the page an `undo` for its toast.
//   - Add camp: undo() deletes the new, empty camp and reports through onUndoResult(status).
//   - Edit camp / Edit template: undo() saves the OLD values again — the payload this dialog would
//     have sent with nothing changed, worked out from what it loaded — on the version the save
//     returned, and RETURNS the database's answer plus `undoText` (the amber bar's words when the
//     database refused for a reason it named, else null). The page shows the result. A change by
//     someone else in between makes it 'stale' (the version no longer matches).
import { useEffect, useId, useRef, useState } from 'react';
import { IconAlertTriangle, IconCheck, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import Select from '../../components/Select.jsx';
import { addCamp, deleteCamp, loadCamp, loadTemplates, updateCamp, updateTemplate, campToday } from '../../lib/camps/campsApi.js';
import CampSection from './sections/CampSection.jsx';
import ExtrasSection from './sections/ExtrasSection.jsx';
import FamilyFormSection from './sections/FamilyFormSection.jsx';
import PricesSection from './sections/PricesSection.jsx';
import TimesSection from './sections/TimesSection.jsx';
import {
  applyBlank,
  applyTemplate,
  blankValues,
  campUndoRefusal,
  checkForm,
  formSnapshot,
  gridSize,
  newExtraKey,
  undoAddsPastDay,
  undoCampPayload,
  valuesFromCamp,
  valuesFromTemplate,
  withAutoDates,
  withExtraDays,
} from './sections/campForm.js';
import * as T from './text.js';

// Notes that make Save unavailable until the dialog is closed and opened again.
const BLOCKING = ['STALE_DIALOG', 'NOT_ALLOWED'];
const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.CAMPS_NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
  LOAD_FAILED: T.LOAD_CAMP_FAILED,
};
const PHONE_DISCARD = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED'];

// One folded section: the bordered head row (a button) and, when open, its fields.
function Fold({ number, title, summary, open, problem, onToggle, children, idBase }) {
  const bodyId = `${idBase}-fold-${number}`;
  return (
    <section className={`cp-fold${open ? ' is-open' : ''}${problem ? ' is-problem' : ''}`}>
      <button type="button" className="cp-fold-head" aria-expanded={open ? 'true' : 'false'} aria-controls={bodyId} onClick={onToggle}>
        <span className="cp-fold-title">
          {number}. {title}
        </span>
        <span className="cp-fold-sum">
          {/* Amber with the triangle AND words, never color alone (guidelines 7) */}
          {problem && <IconAlertTriangle size={14} aria-hidden="true" className="cp-fold-warn" />}
          {summary}
        </span>
        {/* ti-chevron-up / ti-chevron-down = fold / unfold */}
        {open ? <IconChevronUp size={16} aria-hidden="true" /> : <IconChevronDown size={16} aria-hidden="true" />}
      </button>
      {open && (
        <div id={bodyId} className="cp-fold-body">
          {children}
        </div>
      )}
    </section>
  );
}

export default function CampDialog({
  mode,
  campId,
  template,
  startTemplate,
  defaultLocation,
  isPhone,
  hidden,
  onClose,
  onSaved,
  onNoAccess,
  onRefreshProfile,
  onUndoResult,
}) {
  const idBase = useId();
  const [today, setToday] = useState(() => campToday());
  const [status, setStatus] = useState(mode === 'template' ? 'ready' : 'loading');
  const [templates, setTemplates] = useState([]);
  const [record, setRecord] = useState(null); // edit: { camp, days } as loaded
  const [values, setValues] = useState(() => {
    if (mode === 'template') return valuesFromTemplate(template);
    return blankValues(today, defaultLocation);
  });
  const [initial, setInitial] = useState(() => formSnapshot(values));
  const [openSection, setOpenSection] = useState(1);
  const [touched, setTouched] = useState({});
  const [triedSave, setTriedSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);
  const [server, setServer] = useState({});
  // The payload of the values as loaded (Edit camp / Edit template): what the toast's Undo sends
  // back. null when they don't pass the form's checks (then no Undo is offered).
  const [undoBase, setUndoBase] = useState(() => (mode === 'template' ? checkForm(values, { mode, today, server: {} }).payload : null));

  // ----- Loading what the dialog needs -----
  // load() runs once when the dialog opens, and again from Retry when the camp couldn't be read
  // (design review S-2, rulebook v1.051: a read that fails offers Retry, which repeats the read).
  // Two refs decide whether an answer still counts (a "ref" is a value React keeps between
  // drawings without redrawing when it changes):
  //   aliveRef — false once the dialog has closed.
  //   runRef   — each load() takes the next number. Only the NEWEST run's answer is used, so an
  //              older read that answers late can't overwrite a newer one. (In development React's
  //              StrictMode starts the opening effect twice on purpose; the first run is thrown away.)
  const aliveRef = useRef(true);
  const runRef = useRef(0);
  async function load() {
    runRef.current += 1;
    const run = runRef.current;
    const stale = () => !aliveRef.current || run !== runRef.current;
    if (mode === 'add') {
      const result = await loadTemplates();
      if (stale()) return;
      // Templates are only a convenience here: if they don't load, Blank camp still works.
      const list = result.status === 'ok' ? (result.templates ?? []) : [];
      setTemplates(list.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })));
      if (result.status === 'no_access') onNoAccess();
      if (startTemplate) {
        // Use (C2): Add camp opens with this template already chosen. That isn't a change the
        // admin made, so Cancel closes without asking.
        const next = applyTemplate(values, startTemplate, today);
        setValues(next);
        setInitial(formSnapshot(next));
      }
      setStatus('ready');
    } else if (mode === 'edit') {
      const result = await loadCamp(campId);
      if (stale()) return;
      if (result.status !== 'ok') {
        if (result.status === 'no_access') onNoAccess();
        setStatus(result.status === 'not_found' ? 'gone' : 'error');
        return;
      }
      const days = [...(result.days ?? [])].sort((a, b) => (a.day < b.day ? -1 : 1));
      const loaded = valuesFromCamp(result.camp, days, result.prices ?? [], result.extras ?? []);
      if (result.today) setToday(result.today);
      setRecord({ camp: result.camp, days });
      setUndoBase(checkForm(loaded, { mode, today: result.today ?? today, initialDays: days.map((d) => d.day), server: {} }).payload);
      setValues(loaded);
      setInitial(formSnapshot(loaded));
      setStatus('ready');
    }
  }
  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => {
      // Closed (or StrictMode's throwaway first run): whatever is still on its way is ignored.
      aliveRef.current = false;
      runRef.current += 1;
    };
    // Runs once when the dialog opens (the dialog gets a new key each time it opens).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry (Edit camp only, when the camp couldn't be read): "Loading…" shows again while it reads.
  // The Retry button disappears with the failed note, so keyboard focus first moves to the dialog
  // box itself (it can hold focus) instead of falling to the page behind. If the read works, the
  // effect further down moves focus on to the first field.
  // retryRef = this dialog's own Retry button; the box is found from it (closest), so another
  // dialog on the page can never be picked by mistake.
  const retryRef = useRef(null);
  const dialogBox = () => retryRef.current?.closest('.tdialog, .tdialog-page') ?? null;
  function retryLoad() {
    dialogBox()?.focus();
    setStatus('loading');
    load();
  }
  // Whenever the read fails — the first time too, and after a Retry — focus goes to Retry, but only
  // while focus is on the dialog box itself (where it waits while "Loading…" shows on PC / tablet,
  // and where retryLoad puts it), never away from something the person moved to.
  useEffect(() => {
    if (status !== 'error' || hidden) return;
    const box = dialogBox();
    if (box && document.activeElement === box) retryRef.current?.focus();
  }, [status, hidden]);

  // The fields appear only once loading is done: then put keyboard focus on the first one (the
  // Dialog frame could only focus itself while "Loading…" showed).
  useEffect(() => {
    if (status !== 'ready' || hidden) return;
    const box = document.querySelector('.tdialog, .tdialog-page');
    const first = box?.querySelector('[data-autofocus]');
    if (first && box.contains(document.activeElement) && document.activeElement.tagName !== 'INPUT') first.focus();
  }, [status, hidden]);

  const ctx = { mode, today, initialDays: record ? record.days.map((d) => d.day) : [], server };
  const check = checkForm(values, ctx);
  const rowCount = gridSize(values, mode);
  const blocked = BLOCKING.includes(note);
  const readOnly = saving;
  const dirty = formSnapshot(values) !== initial;

  // ----- Changes -----
  function clearSoftNote() {
    setNote((current) => (current && !BLOCKING.includes(current) ? null : current));
  }
  function change(section, patch, serverClear = null) {
    if (saving) return;
    setValues((current) => ({ ...current, ...patch }));
    setTouched((current) => (current[section] ? current : { ...current, [section]: true }));
    if (serverClear) setServer((current) => ({ ...current, [serverClear]: null }));
    clearSoftNote();
  }
  function toggleDay(day) {
    if (saving) return;
    const has = values.days.includes(day);
    const days = has ? values.days.filter((d) => d !== day) : [...values.days, day].sort();
    let next = { ...values, days };
    if (mode === 'add') next = withAutoDates(next, today);
    // Extras from a template follow its weekdays onto the picked days (Wed, Fri → the Wednesdays …).
    next = withExtraDays(next);
    setValues(next);
    // From a template or on Edit camp, a different grid size W (the most days in one week, weekly
    // pricing v0.717) adds or drops grid rows: the
    // Prices summary shows it at once ("1 row needs prices", C2).
    const rowsChanged = gridSize({ ...values, days }, mode) !== gridSize(values, mode);
    const fromSaved = values.startFrom !== 'blank' || mode === 'edit';
    setTouched((current) => ({ ...current, 1: true, ...(rowsChanged && fromSaved ? { 3: true } : {}) }));
    setServer((current) => ({ ...current, dayError: null }));
    clearSoftNote();
  }
  function changeStartFrom(id) {
    if (saving) return;
    const chosen = templates.find((t) => t.id === id) ?? null;
    setValues((current) => (chosen ? applyTemplate(current, chosen, today) : applyBlank(current, today)));
    setTouched({});
    clearSoftNote();
  }
  function changePrice(count, key, text) {
    if (saving) return;
    setValues((current) => ({ ...current, bank: { ...current.bank, [count]: { ...(current.bank[count] ?? {}), [key]: text } } }));
    setTouched((current) => ({ ...current, 3: true }));
    clearSoftNote();
  }
  function changeExtra(key, patch) {
    if (saving) return;
    setValues((current) => ({ ...current, extras: current.extras.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));
    setTouched((current) => ({ ...current, 4: true }));
    setServer((current) => ({ ...current, extraError: null }));
    clearSoftNote();
  }
  function addExtra() {
    setValues((current) => ({ ...current, extras: [...current.extras, { key: newExtraKey(), id: null, name: '', price: '', per: 'day', notForAllDays: false, onlyOn: [], onlyWeekdays: [], followWeekdays: false }] }));
    // Focus the new extra's name box once it is drawn.
    window.requestAnimationFrame(() => {
      const boxes = document.querySelectorAll('.cp-extra-name input');
      boxes[boxes.length - 1]?.focus();
    });
  }
  function removeExtra(key) {
    const index = values.extras.findIndex((e) => e.key === key);
    setValues((current) => ({ ...current, extras: current.extras.filter((e) => e.key !== key) }));
    // The ✕ that was pressed is gone, so keyboard focus would fall to the page (WCAG 2.4.3). Move it
    // to the ✕ of the line that took its place, else the line above's ✕, else + Add extra. A button,
    // not the name box, so a phone doesn't pop up its keyboard after a tap.
    window.requestAnimationFrame(() => {
      const boxes = document.querySelectorAll('.cp-extra-remove');
      (boxes[index] ?? boxes[index - 1] ?? document.querySelector('.cp-add-extra'))?.focus();
    });
    setTouched((current) => ({ ...current, 4: true }));
    setServer((current) => ({ ...current, extraError: null }));
    clearSoftNote();
  }

  // ----- Closing -----
  function requestClose() {
    if (saving) return;
    if (!dirty || status !== 'ready') {
      onClose();
      return;
    }
    if (!blocked) setNote('UNSAVED');
  }

  // ----- Saving -----
  // Brings a section's head into view once it has opened (a phone page is long — item 14).
  function scrollToSection(n) {
    window.requestAnimationFrame(() => {
      const body = document.getElementById(`${idBase}-fold-${n}`);
      body?.closest('.cp-fold')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  function problem(result, payload) {
    const st = result.status;
    if (st === 'not_empty') {
      // A day or an extra an active camper picked can't be removed (v0.701).
      if (result.kind === 'extra_per' || result.kind === 'extra_included') {
        // The change would leave campers with an extra that no longer fits (0027, v0.720).
        const text = result.kind === 'extra_per' ? T.cantChangeExtraPer(result.extraName ?? '', result.count ?? 0) : T.cantIncludeExtra(result.extraName ?? '', result.count ?? 0);
        setServer((current) => ({ ...current, extraError: text }));
        setOpenSection(4);
        scrollToSection(4);
      } else if (result.kind !== 'day' && result.kind !== 'extra') {
        // An extra's "Only on these days" lost a day that campers chose ('extra_day', owner decision
        // 2026-10-19), or a camp day removal left an extra with none of its days.
        const text = result.kind === 'extra_day' ? T.cantRemoveExtraDay(result.day ?? '', result.extraName ?? '', result.count ?? 0) : T.extraNoDaysLeft(result.extraName ?? '');
        setServer((current) => ({ ...current, extraError: text }));
        setOpenSection(4);
        scrollToSection(4);
      } else if (result.kind === 'extra') {
        setServer((current) => ({ ...current, extraError: T.cantRemoveExtra(result.extraName ?? '', result.count ?? 0) }));
        setOpenSection(4);
        scrollToSection(4);
      } else {
        setServer((current) => ({ ...current, dayError: T.cantRemoveDay(result.day, result.firstName ?? '', result.lastName ?? '', result.more ?? 0) }));
        // The refused day goes back on the calendar, so what's shown is what's saved (item 13).
        if (result.day) setValues((current) => (current.days.includes(result.day) ? current : { ...current, days: [...current.days, result.day].sort() }));
        setOpenSection(1);
        scrollToSection(1);
      }
      setTriedSave(true);
    } else if (st === 'duplicate_name') {
      setServer((current) => ({ ...current, duplicateName: payload.name }));
      setOpenSection(1);
      setTriedSave(true);
    } else if (st === 'invalid' && result.field === 'offsets') {
      setServer((current) => ({ ...current, offsets: true }));
      setOpenSection(2);
      setTriedSave(true);
    } else if (st === 'no_access') onNoAccess();
    else if (st === 'not_allowed') {
      setNote('NOT_ALLOWED');
      onRefreshProfile();
    } else if (st === 'stale' || st === 'not_found') setNote('STALE_DIALOG');
    else if (st === 'invalid') setNote('INVALID_DIALOG');
    else setNote('SAVE_FAILED');
  }

  async function save() {
    if (saving || blocked || status !== 'ready') return;
    if (check.firstProblem !== null) {
      setTriedSave(true);
      setOpenSection(check.firstProblem);
      scrollToSection(check.firstProblem);
      return;
    }
    if (mode !== 'add' && !dirty) {
      onClose(); // nothing changed: nothing to save
      return;
    }
    setSaving(true);
    setNote(null);
    const payload = check.payload;
    let result;
    if (mode === 'add') result = await addCamp(payload);
    else if (mode === 'edit') result = await updateCamp(campId, record.camp.version, payload);
    else result = await updateTemplate(template.id, template.version, payload);
    setSaving(false);
    if (result.status !== 'ok') {
      problem(result, payload);
      return;
    }
    if (mode === 'add') {
      const newId = result.id;
      const newVersion = result.version;
      // Undo = delete the camp that was just added (empty, so nothing else goes with it).
      const undo = async () => {
        const back = await deleteCamp(newId, newVersion, 0, 0);
        onUndoResult(back.status);
      };
      onSaved({ kind: 'added', id: newId, name: payload.name, undo });
    } else if (mode === 'edit') {
      // Undo = save the camp's old values again, on the version this save made.
      const newVersion = result.version;
      const back = undoCampPayload(undoBase, payload);
      const addsPastDay = undoAddsPastDay(undoBase, payload, today);
      const undo = back
        ? async () => {
            const answer = await updateCamp(campId, newVersion, back);
            return { ...answer, undoText: campUndoRefusal(answer, { addsPastDay }) };
          }
        : null;
      onSaved({ kind: 'camp', name: payload.name, undo });
    } else {
      // Undo = save the template's old values again. If another template took the old name in the
      // meantime ('duplicate_name'), the amber bar says so in the editor's own words.
      const newVersion = result.version;
      const back = undoBase;
      const undo = back
        ? async () => {
            const answer = await updateTemplate(template.id, newVersion, back);
            return { ...answer, undoText: answer.status === 'duplicate_name' ? T.undoRefused(T.DUPLICATE_TEMPLATE) : null };
          }
        : null;
      onSaved({ kind: 'template', name: payload.name, undo });
    }
  }

  if (hidden) return null;

  const title = mode === 'add' ? T.ADD_CAMP_TITLE : mode === 'edit' ? T.EDIT_CAMP_TITLE : T.EDIT_TEMPLATE_TITLE;
  const canSave = !saving && !blocked && status === 'ready';
  const saveButton = (
    <button type="submit" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`} aria-disabled={canSave ? undefined : 'true'}>
      {/* ti-check = Save */}
      <IconCheck size={16} aria-hidden="true" />
      {saving ? T.SAVING : T.SAVE}
    </button>
  );
  const noteBlock = note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && note === 'STALE_DIALOG' ? T.STALE_DIALOG_PHONE : NOTES[note]}
        {isPhone && PHONE_DISCARD.includes(note) && (
          <button type="button" className="note-action" onClick={onClose}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );

  // Errors (and amber summaries) show once Save was pressed, or once that section was changed.
  // Section 1 waits for Save: a half-typed name or no days yet is normal while filling it in
  // (review item 11). The other sections show their problems once they were changed.
  const showFor = (n) => triedSave || (n !== 1 && Boolean(touched[n]));
  const folds = [
    { n: 1, title: mode === 'template' ? T.SECTION_TEMPLATE : T.SECTION_CAMP },
    { n: 2, title: T.SECTION_TIMES },
    { n: 3, title: T.SECTION_PRICES },
    { n: 4, title: T.SECTION_EXTRAS },
    { n: 5, title: T.SECTION_FAMILY },
  ];
  const common = { values, errors: check.errors, readOnly, idBase };
  // Start from's choices for the shared dropdown: Blank camp first, then the templates (by name).
  const startOptions = [{ value: 'blank', label: T.BLANK_CAMP }, ...templates.map((t) => ({ value: t.id, label: t.name }))];

  let body;
  if (status === 'loading') {
    body = <p className="field-hint cp-loading">{T.LOADING_CAMPER}</p>;
  } else if (status === 'error' || status === 'gone') {
    // A camp that couldn't be read ('error') offers Retry, which reads it again (S-2, v1.051), as
    // Camper detail does. A deleted camp ('gone') has nothing to retry. PC / tablet: Retry, then
    // Close. Phone: Retry under the line (the back arrow closes the page).
    const retryButton = status === 'error' && (
      <button type="button" className="btn" ref={retryRef} onClick={retryLoad}>
        {T.RETRY}
      </button>
    );
    body = (
      <>
        <Notice>{status === 'gone' ? T.CAMP_GONE : T.LOAD_CAMP_FAILED}</Notice>
        {!isPhone && (
          <div className="dialog-actions">
            {retryButton}
            <button type="button" className="btn" data-autofocus onClick={onClose}>
              {T.CLOSE}
            </button>
          </div>
        )}
        {isPhone && retryButton && <div className="dialog-actions">{retryButton}</div>}
      </>
    );
  } else {
    body = (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        noValidate
      >
        {mode === 'add' && (
          <div className="field cp-startfrom">
            {/* The shared dropdown (S-10, pass 1): Blank camp, then the templates by name. A span, not a
                <label>: the field is a div (role combobox), which a label can't point at; the Select
                reads its name from this span's id. */}
            <span id={`${idBase}-start-label`} className="field-label">
              {T.START_FROM}
            </span>
            <Select
              id={`${idBase}-start`}
              labelId={`${idBase}-start-label`}
              describedBy={`${idBase}-start-hint`}
              value={values.startFrom}
              options={startOptions}
              placeholder={T.BLANK_CAMP}
              readOnly={readOnly}
              onChange={changeStartFrom}
            />
            <p id={`${idBase}-start-hint`} className="field-hint">
              {T.START_FROM_HINT}
            </p>
          </div>
        )}
        {folds.map(({ n, title: foldTitle }) => {
          const section = check.sections[n];
          const open = openSection === n;
          const amber = section.problem && showFor(n);
          // Section 1's head reads "Name, school and days" while open (C3 first frame).
          const summary = open && n === 1 && !amber ? T.CAMP_SUMMARY_EMPTY : section.summary;
          let fields = null;
          if (open) {
            if (n === 1) {
              fields = (
                <CampSection
                  mode={mode}
                  {...common}
                  show={showFor(1) || Boolean(server.dayError) || Boolean(server.duplicateName)}
                  today={today}
                  keepDays={ctx.initialDays}
                  onChange={(patch) => {
                    // Moving the calendar to another month isn't a change to the camp.
                    if ('month' in patch) setValues((current) => ({ ...current, month: patch.month }));
                    else change(1, patch);
                  }}
                  onToggleDay={toggleDay}
                />
              );
            } else if (n === 2) {
              fields = (
                <TimesSection
                  mode={mode}
                  {...common}
                  show={showFor(2)}
                  today={today}
                  isPhone={isPhone}
                  onChange={(patch) => change(2, patch, 'offsets')}
                  onDateChange={(patch) => change(2, { ...patch, datesEdited: true })}
                />
              );
            } else if (n === 3) {
              fields = <PricesSection {...common} show={showFor(3)} rowCount={rowCount} onPrice={changePrice} />;
            } else if (n === 4) {
              fields = <ExtrasSection {...common} mode={mode} campDays={[...values.days].sort()} show={showFor(4) || Boolean(server.extraError)} onExtra={changeExtra} onAdd={addExtra} onRemove={removeExtra} />;
            } else {
              fields = <FamilyFormSection {...common} show={showFor(5)} onChange={(patch) => change(5, patch)} />;
            }
          }
          return (
            <Fold
              key={n}
              number={n}
              title={foldTitle}
              summary={summary}
              open={open}
              problem={amber}
              idBase={idBase}
              onToggle={() => setOpenSection(open ? null : n)}
            >
              {fields}
            </Fold>
          );
        })}
        {isPhone && noteBlock}
        {isPhone ? (
          <div className="dialog-page-submit">{saveButton}</div>
        ) : (
          <div className="dialog-footer">
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => !saving && onClose()}>
                {T.CANCEL}
              </button>
              {saveButton}
            </div>
            {noteBlock}
          </div>
        )}
      </form>
    );
  }

  return (
    <Dialog title={title} size="wide" fullScreen={isPhone} onRequestClose={requestClose}>
      {mode === 'add' && <p className="tdialog-sub">{T.ADD_CAMP_SUB}</p>}
      {body}
    </Dialog>
  );
}
