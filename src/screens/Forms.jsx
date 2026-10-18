// Forms.jsx — the Forms section (rail icon ti-clipboard-text, "Forms"; rulebook v0.139, v0.145, v0.146).
// Why it exists: the school builds its own sign-up forms here — free class (social media),
// walk-in, event — and staff fill them in for a family. This file is the "brain" of the
// section, like Calendar.jsx. It:
//   - loads the forms (useForms) and shows the list (FormsList), filtered by the school switcher
//   - admins: "New form" (NewFormDialog) → the builder (Builder.jsx); ⋯ → Fill in, Duplicate,
//     Close form / Open form again, Delete (only without sign-ups)
//   - staff: no building; a row opens a read-only Preview; "Fill in" and Share on each row
//   - opens Share (ShareDialog), Fill in and Preview (FillInDialog)
//
// The public page, its QR code and kiosk mode are step F3; emails wait for the school's sending
// address (rulebook v0.146). Admin vs staff only changes what is SHOWN — the database enforces
// who may change what.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconCopy, IconDoorExit, IconDoorEnter, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import Dialog from '../components/Dialog.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import RowMenu from '../components/RowMenu.jsx';
import { LOCATION_CODE } from '../lib/device.js';
import { PHONE_QUERY, WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { useShortcutN } from '../lib/useShortcutN.js';
import { addDays } from '../lib/schedule/versions.js';
import { loadSchedule } from '../lib/schedule/api.js';
import { cleanText } from '../lib/calendar/rules.js';
import { cleanAnswers, slugify } from '../lib/forms/fields.js';
import { useForms } from '../lib/forms/useForms.js';
import { createForm, deleteForm, duplicateForm, loadForm, openTimes, setFormStatus, staffSubmit } from '../lib/forms/api.js';
import FormsList from './forms/FormsList.jsx';
import NewFormDialog, { checkNewForm } from './forms/NewFormDialog.jsx';
import Builder from './forms/Builder.jsx';
import ShareDialog from './forms/ShareDialog.jsx';
import FillInDialog, { emptyFillValues } from './forms/FillInDialog.jsx';
import * as T from './forms/text.js';

const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const usable = (el) => (el && el.isConnected && el.getClientRects().length > 0 ? el : null);
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export default function Forms({ location, isAdmin, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const both = location === 'Both';
  const code = both ? null : LOCATION_CODE[location];
  const schoolLabel = both ? T.BOTH_SCHOOLS : location;

  const list = useForms({ enabled: !screenLocked });
  const forms = useMemo(() => (list.data?.forms ?? []).filter((f) => both || f.locationCode === code), [list.data, both, code]);

  const [builder, setBuilder] = useState(null); // { formId, detail, school, status } while the builder is open
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null); // { anchor, form }
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
  });

  useEffect(() => {
    if (list.status === 'noAccess') onNoAccess();
  }, [list.status, onNoAccess]);
  const modalShown = dialog !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);
  useEffect(() => {
    if (screenLocked) setMenu(null);
  }, [screenLocked]);

  function focusBack(el, fallback) {
    window.requestAnimationFrame(() => (usable(el) ?? usable(fallback ? document.querySelector(fallback) : null))?.focus());
  }

  // ===== The builder =====
  async function openBuilder(formId) {
    clearToast();
    setBuilder({ formId, detail: null, school: null, status: 'loading' });
    const detail = await loadForm(formId);
    if (detail.status === 'no_access') return onNoAccess();
    if (detail.status !== 'ok') {
      setBuilder(null);
      setBanner({ text: T.LOAD_FAILED });
      return undefined;
    }
    const school = await loadSchedule(detail.form.locationCode);
    setBuilder({ formId, detail, school: school.status === 'ok' ? school : null, status: 'ready' });
    return undefined;
  }
  async function reloadBuilder() {
    const b = builder;
    if (!b) return;
    const detail = await loadForm(b.formId);
    if (detail.status === 'ok') setBuilder((cur) => (cur && cur.formId === b.formId ? { ...cur, detail } : cur));
    list.reload();
  }
  function closeBuilder() {
    const id = builder?.formId;
    setBuilder(null);
    list.reload();
    focusBack(document.querySelector(`[data-form-row="${id}"]`), '[data-forms-new]');
  }

  // ===== Dialogs =====
  function openDialog(next) {
    clearToast();
    setMenu(null);
    setDialog({ key: Date.now(), touched: {}, note: null, saving: false, ...next });
  }
  const patchDialog = (patch) => setDialog((d) => (d ? { ...d, ...patch } : d));
  function closeDialog() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    setDialog(null);
    focusBack(d.opener, '[data-forms-new]');
  }

  // ----- New form -----
  function openNew(opener) {
    if (!isAdmin || busy) return;
    const values = { name: '', kind: 'free_class', school: code ?? 'worcester' };
    openDialog({ type: 'new', values, initial: values, opener });
  }
  async function createNew() {
    const d = dialogRef.current;
    if (!d || d.saving || !checkNewForm(d).canSave) return;
    patchDialog({ saving: true, note: null });
    setBusy(true);
    const name = cleanText(d.values.name);
    const base = slugify(name);
    const taken = new Set((list.data?.forms ?? []).map((f) => f.slug));
    let slug = base;
    for (let i = 2; taken.has(slug) && i < 50; i += 1) slug = `${base.slice(0, 36)}-${i}`;
    let res = await createForm({ locationCode: d.values.school, kind: d.values.kind, name, slug });
    if (res.status === 'duplicate_slug') res = await createForm({ locationCode: d.values.school, kind: d.values.kind, name, slug: `${base.slice(0, 30)}-${Date.now().toString(36).slice(-6)}` });
    setBusy(false);
    if (res.status === 'ok') {
      setDialog(null);
      list.reload();
      openBuilder(res.id);
    } else if (res.status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (res.status === 'not_allowed') {
      patchDialog({ saving: false, note: T.NOT_ALLOWED });
      onRefreshProfile();
    } else {
      patchDialog({ saving: false, note: res.status === 'invalid' ? T.INVALID_SAVE : T.SAVE_FAILED_BAR });
    }
  }

  // ----- Fill in and Preview -----
  async function openFill(form, opener, { mode = 'fill', fields = null } = {}) {
    if (mode === 'fill' && form.status !== 'live') {
      setBanner({ text: form.status === 'draft' ? T.DRAFT_NO_FILL : T.FORM_CLOSED });
      return;
    }
    const shown = fields ?? (mode === 'fill' ? form.published : form.published ?? form.draft);
    openDialog({ type: 'fill', mode, form, fields: shown, step: 0, values: emptyFillValues(), problems: {}, times: null, opener, submissionKey: newKey(), draftPreview: Boolean(fields) });
    if (!shown.some((f) => f.type === 'booking')) return;
    const today = localToday();
    const res = await openTimes({ formId: form.id, from: today, to: addDays(today, 60) });
    setDialog((d) => (d && d.type === 'fill' && d.form.id === form.id ? { ...d, times: res.status === 'ok' ? res.times : 'error' } : d));
    if (res.status === 'no_access') onNoAccess();
  }
  function changeFill(patch) {
    setDialog((d) => {
      if (!d || d.saving) return d;
      const problems = { ...d.problems };
      for (const k of Object.keys(patch.answers ?? {})) delete problems[k];
      if (patch.children) delete problems.children;
      if (patch.signature !== undefined) delete problems.signature;
      return { ...d, values: { ...d.values, ...patch }, problems, note: d.note === 'LEAVE_FILL' ? null : d.note, submissionKey: d.note === 'TIME_TAKEN' ? newKey() : d.submissionKey };
    });
  }
  async function submitFill() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    patchDialog({ saving: true, note: null });
    const v = d.values;
    const children = v.children.map((c) => ({ first_name: cleanText(c.first_name), age: c.age }));
    const bookings = Object.entries(v.bookings)
      .filter(([i, key]) => key && Number(i) < children.length)
      .map(([i, key]) => {
        const [classId, date, start] = key.split('|');
        return { child: Number(i), classId, date, start };
      });
    const hasWaiver = d.fields.some((f) => f.type === 'waiver' && v.answers[f.id] === true);
    const res = await staffSubmit({
      formId: d.form.id,
      submissionKey: d.submissionKey,
      publishedVersion: d.form.publishedVersion,
      answers: cleanAnswers(d.fields, v.answers),
      children,
      bookings,
      signature: hasWaiver ? v.signature : null,
    });
    if (res.status === 'ok') {
      patchDialog({ saving: false, sent: { bookings: res.bookings } });
      list.reload();
      return;
    }
    if (res.status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (res.status === 'time_taken') {
      patchDialog({ saving: false, note: 'TIME_TAKEN', submissionKey: newKey() });
      const today = localToday();
      const t = await openTimes({ formId: d.form.id, from: today, to: addDays(today, 60) });
      if (t.status === 'ok') patchDialog({ times: t.times });
    } else if (res.status === 'form_changed') {
      const fresh = await loadForm(d.form.id);
      if (fresh.status === 'ok') patchDialog({ saving: false, note: 'FORM_CHANGED', form: fresh.form, fields: fresh.form.published, step: 0, submissionKey: newKey() });
      else patchDialog({ saving: false, note: 'SEND_FAILED' });
    } else if (res.status === 'closed' || res.status === 'not_found') {
      patchDialog({ saving: false, note: 'FORM_CLOSED' });
      list.reload();
    } else if (res.status === 'invalid') {
      patchDialog({ saving: false, note: 'SEND_INVALID', submissionKey: newKey() });
    } else {
      patchDialog({ saving: false, note: 'SEND_FAILED' }); // same key: a repeat can't save twice
    }
  }
  function requestCloseFill() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const started = d.mode === 'fill' && !d.sent && JSON.stringify(d.values) !== JSON.stringify(emptyFillValues());
    if (started && d.note !== 'LEAVE_FILL') patchDialog({ note: 'LEAVE_FILL' });
    else closeDialog();
  }

  // ----- Row actions -----
  async function duplicate(form) {
    if (busy) return;
    setBusy(true);
    const res = await duplicateForm(form.id);
    setBusy(false);
    if (res.status === 'ok') {
      await list.reload();
      showToast(T.duplicated(`Copy of ${form.name}`.slice(0, 80)));
    } else if (res.status === 'no_access') onNoAccess();
    else setBanner({ text: res.status === 'not_allowed' ? T.NOT_ALLOWED : T.SAVE_FAILED_BAR });
  }
  async function toggleClosed(form) {
    if (busy) return;
    setBusy(true);
    const res = await setFormStatus({ id: form.id, expectedVersion: form.version, status: form.status === 'live' ? 'closed' : 'live' });
    setBusy(false);
    if (res.status === 'ok') {
      await list.reload();
      showToast(form.status === 'live' ? T.closedToast(form.name) : T.reopenedToast(form.name));
    } else if (res.status === 'no_access') onNoAccess();
    else if (res.status === 'stale') {
      list.reload();
      setBanner({ text: T.STALE_BUILDER });
    } else setBanner({ text: T.SAVE_FAILED_BAR });
  }
  async function confirmDelete() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    patchDialog({ saving: true, note: null });
    const res = await deleteForm({ id: d.form.id, expectedVersion: d.form.version });
    if (res.status === 'ok') {
      setDialog(null);
      await list.reload();
      showToast(T.deletedToast(d.form.name));
      focusBack(null, '[data-forms-new]');
    } else if (res.status === 'not_allowed' && res.reason === 'has_signups') patchDialog({ saving: false, note: T.HAS_SIGNUPS, blocked: true });
    else if (res.status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (res.status === 'stale' || res.status === 'not_found') {
      patchDialog({ saving: false, note: T.STALE_BUILDER, blocked: true });
      list.reload();
    } else patchDialog({ saving: false, note: T.SAVE_FAILED_BAR });
  }

  function openRow(form, opener) {
    if (isAdmin) openBuilder(form.id);
    else if (form.published) openFill(form, opener, { mode: 'preview' });
  }
  const menuItems = !menu
    ? []
    : isAdmin
      ? [
          { key: 'edit', label: T.EDIT_FIELD, Icon: IconPencil, onSelect: () => openBuilder(menu.form.id) },
          { key: 'fill', label: T.FILL_IN_ITEM, Icon: IconPlus, disabled: menu.form.status !== 'live', onSelect: () => openFill(menu.form, menu.anchor) },
          { key: 'dup', label: T.DUPLICATE, Icon: IconCopy, disabled: busy, onSelect: () => duplicate(menu.form) },
          menu.form.status !== 'draft' && {
            key: 'close',
            label: menu.form.status === 'live' ? T.CLOSE_FORM : T.REOPEN_FORM,
            Icon: menu.form.status === 'live' ? IconDoorExit : IconDoorEnter,
            disabled: busy,
            onSelect: () => toggleClosed(menu.form),
          },
          { key: 'delete', label: T.DELETE_FORM, Icon: IconTrash, danger: true, separatorBefore: true, disabled: busy, onSelect: () => openDialog({ type: 'delete', form: menu.form, opener: menu.anchor }) },
        ].filter(Boolean)
      : [{ key: 'fill', label: T.FILL_IN_ITEM, Icon: IconPlus, disabled: menu.form.status !== 'live', onSelect: () => openFill(menu.form, menu.anchor) }];

  useShortcutN({ enabled: isAdmin && !builder && !dialog && !busy && !screenLocked && list.status === 'ready', onPress: () => openNew(document.querySelector('[data-forms-new]')) });

  // ===== What is on screen =====
  let body;
  if (builder) {
    body =
      builder.status === 'loading' || !builder.detail ? (
        <div className="sskeleton" aria-busy="true" aria-label={T.LOADING}>
          <div className="tskeleton-row">
            <span className="tskeleton-bar" />
          </div>
        </div>
      ) : (
        <Builder
          detail={builder.detail}
          school={builder.school}
          isPhone={isPhone}
          isWide={isWide}
          screenLocked={screenLocked}
          busy={busy}
          onBack={closeBuilder}
          onPreview={(fields) => openFill(builder.detail.form, null, { mode: 'preview', fields })}
          onShare={(opener) => openDialog({ type: 'share', form: builder.detail.form, opener })}
          onReload={reloadBuilder}
          onNoAccess={onNoAccess}
          onRefreshProfile={onRefreshProfile}
          showToast={showToast}
        />
      );
  } else if (list.status === 'loading' && !list.data) {
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
  } else if (list.status === 'error') {
    body = <ErrorBanner text={T.LOAD_FAILED} onRetry={() => list.reload()} />;
  } else if (!list.data) {
    body = null;
  } else {
    body = (
      <FormsList
        forms={forms}
        monthCounts={list.data.monthCounts}
        both={both}
        isAdmin={isAdmin}
        isPhone={isPhone}
        busy={busy}
        onOpen={openRow}
        onShare={(form, opener) => openDialog({ type: 'share', form, opener })}
        onFillIn={(form, opener) => openFill(form, opener)}
        onMore={(form, anchor) => setMenu(menu ? null : { form, anchor })}
      />
    );
  }

  let dialogElement = null;
  if (dialog && !screenLocked) {
    if (dialog.type === 'new') {
      dialogElement = (
        <NewFormDialog
          key={dialog.key}
          state={dialog}
          both={both}
          isPhone={isPhone}
          onChange={(patch) => setDialog((d) => (d && !d.saving ? { ...d, values: { ...d.values, ...patch }, note: null } : d))}
          onTouch={(keys) => setDialog((d) => (d ? { ...d, touched: { ...d.touched, ...Object.fromEntries(keys.map((k) => [k, true])) } } : d))}
          onSave={createNew}
          onCancel={closeDialog}
          onRequestClose={() => {
            const d = dialogRef.current;
            if (d && JSON.stringify(d.values) !== JSON.stringify(d.initial) && d.note !== T.UNSAVED) patchDialog({ note: T.UNSAVED });
            else closeDialog();
          }}
        />
      );
    } else if (dialog.type === 'share') {
      dialogElement = <ShareDialog key={dialog.key} form={dialog.form} isPhone={isPhone} onClose={closeDialog} />;
    } else if (dialog.type === 'fill') {
      dialogElement = (
        <FillInDialog
          key={dialog.key}
          state={dialog}
          isPhone={isPhone}
          onChange={changeFill}
          onStep={(step, problems) => patchDialog({ step, problems, note: null })}
          onSubmit={submitFill}
          onAnother={() => patchDialog({ sent: null, step: 0, values: emptyFillValues(), problems: {}, note: null, submissionKey: newKey() })}
          onCancel={closeDialog}
          onRequestClose={requestCloseFill}
        />
      );
    } else if (dialog.type === 'delete') {
      dialogElement = (
        <Dialog title={T.DELETE_TITLE} variant="confirm" describedBy={`forms-del-${dialog.key}`} onRequestClose={closeDialog}>
          <p id={`forms-del-${dialog.key}`} className="tdialog-sub tdialog-body">
            {dialog.note ?? T.deleteText(dialog.form.name)}
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn" data-autofocus onClick={closeDialog}>
              {dialog.blocked ? T.CLOSE : T.CANCEL}
            </button>
            {!dialog.blocked && (
              <button type="button" className={`btn btn-delete${dialog.saving ? ' is-unavailable' : ''}`} onClick={confirmDelete}>
                <IconTrash size={16} aria-hidden="true" />
                {dialog.saving ? T.SAVING : T.DELETE_FORM}
              </button>
            )}
          </div>
        </Dialog>
      );
    }
  }

  return (
    <div className="forms">
      {!builder && (
        <>
          <div className="phead">
            <div className="phead-titles">
              <h1 className="ptitle">{T.PAGE_TITLE}</h1>
              <p className="psub">{schoolLabel}</p>
            </div>
            {isAdmin && (
              <button type="button" className={`btn btn-primary${busy ? ' is-unavailable' : ''}`} data-forms-new onClick={(e) => openNew(e.currentTarget)}>
                <IconPlus size={16} aria-hidden="true" />
                {isPhone ? T.NEW_SHORT : T.NEW_FORM}
              </button>
            )}
          </div>
          {!isAdmin && <p className="viewonly">{T.VIEW_ONLY_LINE}</p>}
        </>
      )}
      {banner && <ErrorBanner text={banner.text} onDismiss={() => setBanner(null)} />}
      {body}
      {menu && !screenLocked && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={menu.form.name}
          subtitle={T.STATUS[menu.form.status]}
          label={T.moreLabel(menu.form.name)}
          items={menuItems}
          onClose={(reason) => {
            const el = menu.anchor;
            setMenu(null);
            if (reason === 'escape' || reason === 'tab') el?.focus();
          }}
        />
      )}
      {dialogElement}
    </div>
  );
}
