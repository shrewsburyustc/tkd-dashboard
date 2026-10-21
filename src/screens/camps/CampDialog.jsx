// CampDialog.jsx — Add camp, Edit camp and Edit template: one dialog with folded sections (C3).
// Why it exists: approved mockup C3. A camp has a lot in it (days, hours, sign-up dates, a price
// grid, extras, ages, description, waiver), but most camps start from a template and only need a
// name and days. So the dialog shows:
//   - Start from: Blank camp or a template (Add camp only) — "Fills in everything except the name
//     and days."
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
//        onClose(), onSaved({ kind, undo? }), onNoAccess, onRefreshProfile, onUndoResult(status)
import { useEffect, useId, useState } from 'react';
import { IconAlertTriangle, IconCheck, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
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
  checkForm,
  formSnapshot,
  gridSize,
  newExtraKey,
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

  // ----- Loading what the dialog needs -----
  useEffect(() => {
    let stale = false;
    async function load() {
      if (mode === 'add') {
        const result = await loadTemplates();
        if (stale) return;
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
        if (stale) return;
        if (result.status !== 'ok') {
          if (result.status === 'no_access') onNoAccess();
          setStatus(result.status === 'not_found' ? 'gone' : 'error');
          return;
        }
        const days = [...(result.days ?? [])].sort((a, b) => (a.day < b.day ? -1 : 1));
        const loaded = valuesFromCamp(result.camp, days, result.prices ?? [], result.extras ?? []);
        if (result.today) setToday(result.today);
        setRecord({ camp: result.camp, days });
        setValues(loaded);
        setInitial(formSnapshot(loaded));
        setStatus('ready');
      }
    }
    load();
    return () => {
      stale = true;
    };
    // Runs once when the dialog opens (the dialog gets a new key each time it opens).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // From a template or on Edit camp, a different number of days adds or drops grid rows: the
    // Prices summary shows it at once ("1 row needs prices", C2).
    const rowsChanged = Math.min(days.length, 10) !== Math.min(values.days.length, 10);
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
    setValues((current) => ({ ...current, extras: current.extras.filter((e) => e.key !== key) }));
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
      if (result.kind !== 'day' && result.kind !== 'extra') {
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
      onSaved({ kind: 'added', id: newId, undo });
    } else onSaved({ kind: mode === 'edit' ? 'camp' : 'template' });
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

  let body;
  if (status === 'loading') {
    body = <p className="field-hint cp-loading">{T.LOADING_CAMPER}</p>;
  } else if (status === 'error' || status === 'gone') {
    body = (
      <>
        <Notice>{status === 'gone' ? T.CAMP_GONE : T.LOAD_CAMP_FAILED}</Notice>
        {!isPhone && (
          <div className="dialog-actions">
            <button type="button" className="btn" data-autofocus onClick={onClose}>
              {T.CLOSE}
            </button>
          </div>
        )}
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
            <label htmlFor={`${idBase}-start`}>{T.START_FROM}</label>
            <select
              id={`${idBase}-start`}
              className="input cp-select"
              tabIndex={0}
              disabled={readOnly}
              value={values.startFrom}
              onChange={(event) => changeStartFrom(event.target.value)}
            >
              <option value="blank">{T.BLANK_CAMP}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="field-hint">{T.START_FROM_HINT}</p>
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
