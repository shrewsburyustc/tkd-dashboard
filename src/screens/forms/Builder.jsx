// Builder.jsx — the form builder (mockup screens 3–6). Admins only.
// Why it exists: build a form by hand. Three panels on a PC:
//   left    the field types (FieldPalette) — click one to add it after the chosen field
//   middle  the form as families will see it, with dashed "Step N · …" lines; click a field to
//           change it, drag it by its grip to move it; click empty space for the form settings
//   right   the chosen field's settings (FieldEditor, plus BookingSettings for Book a class),
//           or the form's settings (FormSettings)
// Header: "← Forms" above the form's name on every device (the back link of v0.59 / v1.020).
// Tablet: the left panel becomes an "+ Add field" button. Phone: a list of fields; tap one to
// change it full screen; ⋯ → Move up / Move down / Delete field.
//
// Saving: field and wording changes SAVE AS YOU GO as a draft (a short pause after typing);
// families see them only after Publish. A draft with a problem (an empty label, two options the
// same …) waits until it's fixed. Booking settings are different: they go live right away, so
// they have their own Save button (rulebook v0.242).
// Only one save travels at a time (a queue); each one sends the version it last saw, so another
// admin's change is noticed ('stale') instead of overwritten.
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconArrowDown, IconArrowLeft, IconArrowUp, IconDots, IconEye, IconGitBranch, IconLock, IconPlus, IconSettings, IconShare, IconTrash } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import IconButton from '../../components/IconButton.jsx';
import Notice from '../../components/Notice.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import { useReorderDrag } from '../../lib/useReorderDrag.js';
import { cleanText, textProblem } from '../../lib/calendar/rules.js';
import { versionInEffect } from '../../lib/calendar/days.js';
import { toTimeText } from '../../lib/schedule/time.js';
import { emailOk, fieldsProblem, LOCKED_TYPES, longTextProblem, newField, nextFieldId, PALETTE, slugOk } from '../../lib/forms/fields.js';
import { publishForm, saveDraft, setBooking, setFormStatus } from '../../lib/forms/api.js';
import Grip from '../../components/Grip.jsx'; // the shared drag handle (v1.100)
import BookingSettings, { bookingProblem, groupSlotKey, timeSlotKey } from './BookingSettings.jsx';
import FieldEditor from './FieldEditor.jsx';
import FieldPalette, { addBlocked, FieldIcon } from './FieldPalette.jsx';
import FormSettings from './FormSettings.jsx';
import * as T from './text.js';

const SAVE_PAUSE_MS = 700;

// The draft as the database keeps it: labels and options tidied (single spaces, trimmed).
function tidy(fields) {
  return fields.map((f) => {
    const out = { ...f, label: cleanText(f.label) };
    if (out.options) out.options = out.options.map((o) => cleanText(o));
    if (out.show_if) out.show_if = { field: out.show_if.field, value: cleanText(out.show_if.value) };
    else delete out.show_if;
    if (out.help !== undefined) {
      const help = cleanText(out.help);
      if (help) out.help = help;
      else delete out.help;
    }
    return out;
  });
}

function settingsOk(s) {
  return (s.thank_you === '' || !longTextProblem(s.thank_you, 500)) && (s.alert_email === null || emailOk(s.alert_email));
}

// The booking settings as the screen edits them, from the database rows.
function bookingDraftOf(offers, limits, groupLimits = []) {
  const times = {};
  for (const l of limits) times[timeSlotKey(l.classId, l.weekday, l.start)] = { on: l.spotLimit > 0, spots: l.spotLimit > 0 ? l.spotLimit : 3 };
  // classes taught together (v0.620): one spot number per combined time
  const groups = {};
  for (const g of groupLimits) groups[groupSlotKey(g.classIds, g.weekday, g.start)] = { on: g.spotLimit > 0, spots: g.spotLimit > 0 ? g.spotLimit : 3 };
  return {
    offered: offers.map((o) => o.classId),
    defaults: Object.fromEntries(offers.map((o) => [o.classId, o.defaultLimit])),
    times,
    groups,
    daysAhead: offers[0]?.daysAhead ?? 14,
    minHoursAhead: offers[0]?.minHoursAhead ?? 3,
  };
}

export default function Builder({ detail, school, isPhone, isWide, screenLocked, busy, onBack, onPreview, onShare, onReload, onNoAccess, onRefreshProfile, showToast }) {
  const { form } = detail;
  // ----- What is being edited -----
  const [fields, setFields] = useState(form.draft);
  const [name, setName] = useState(form.name);
  const [slug, setSlug] = useState(form.slug);
  const [settings, setSettings] = useState(form.settings);
  const [selectedId, setSelectedId] = useState(null);
  const [saveState, setSaveState] = useState({ saving: false, failed: false, pending: false });
  const [banner, setBanner] = useState(null);
  const [fieldNote, setFieldNote] = useState(null);
  const [slugTaken, setSlugTaken] = useState(false);
  const [booking, setBookingDraft] = useState(() => bookingDraftOf(detail.offers, detail.limits, detail.groupLimits));
  const [bookingSaved, setBookingSaved] = useState(() => bookingDraftOf(detail.offers, detail.limits, detail.groupLimits));
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingNote, setBookingNote] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [menu, setMenu] = useState(null); // { kind: 'add' | 'field', anchor, field? }
  const [phoneEdit, setPhoneEdit] = useState(null); // field id open full screen (phone)

  const versionRef = useRef(form.version);
  const savedRef = useRef(JSON.stringify({ fields: tidy(form.draft), name: form.name, slug: form.slug, settings: form.settings }));
  const queueRef = useRef(Promise.resolve());
  const timerRef = useRef(null);
  const latestRef = useRef({ fields, name, slug, settings });
  useEffect(() => {
    latestRef.current = { fields, name, slug, settings };
  });
  // Counts the copies of the form from the database: a new copy (another admin's change) voids an
  // Undo of a field deleted before it, so it can't put the field back into their version.
  const copyRef = useRef(0);
  useEffect(() => {
    copyRef.current += 1;
  }, [form]);
  // false once the builder is closed: a toast's Undo pressed after that changes nothing
  const openRef = useRef(true);
  useEffect(() => {
    openRef.current = true;
    return () => {
      openRef.current = false;
    };
  }, []);

  // A new copy of the form from the database (after a stale save or another admin's change).
  useEffect(() => {
    setFields(form.draft);
    setName(form.name);
    setSlug(form.slug);
    setSettings(form.settings);
    versionRef.current = form.version;
    savedRef.current = JSON.stringify({ fields: tidy(form.draft), name: form.name, slug: form.slug, settings: form.settings });
    const b = bookingDraftOf(detail.offers, detail.limits, detail.groupLimits);
    setBookingDraft(b);
    setBookingSaved(b);
  }, [form, detail.offers, detail.limits, detail.groupLimits]);

  // ----- Saving as you go -----
  function enqueue(job) {
    const run = queueRef.current.then(job, job);
    queueRef.current = run.catch(() => {});
    return run;
  }

  function payloadNow() {
    const { fields: f, name: n, slug: s, settings: st } = latestRef.current;
    const clean = tidy(f);
    const ok = fieldsProblem(clean) === null && textProblem(n, 80) === null && slugOk(s) && settingsOk(st);
    return ok ? { draft: clean, name: cleanText(n), slug: s, settings: st } : null;
  }

  async function saveNow() {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
    return enqueue(async () => {
      const p = payloadNow();
      if (!p) {
        setSaveState((s) => ({ ...s, pending: false }));
        return 'waiting';
      }
      const key = JSON.stringify({ fields: p.draft, name: p.name, slug: p.slug, settings: p.settings });
      if (key === savedRef.current) {
        setSaveState({ saving: false, failed: false, pending: false });
        return 'ok';
      }
      setSaveState({ saving: true, failed: false, pending: false });
      const res = await saveDraft({ id: form.id, expectedVersion: versionRef.current, ...p });
      if (res.status === 'ok') {
        versionRef.current = res.version;
        savedRef.current = key;
        setSlugTaken(false);
        setSaveState({ saving: false, failed: false, pending: false });
        setBanner((b) => (b?.kind === 'save' ? null : b));
        return 'ok';
      }
      setSaveState({ saving: false, failed: res.status === 'error', pending: false });
      if (res.status === 'no_access') onNoAccess();
      else if (res.status === 'duplicate_slug') setSlugTaken(true);
      else if (res.status === 'stale' || res.status === 'not_found') {
        setBanner({ kind: 'stale', text: T.STALE_BUILDER });
        onReload();
      } else if (res.status === 'not_allowed') {
        setBanner({ kind: 'stale', text: T.NOT_ALLOWED });
        onRefreshProfile();
      } else if (res.status === 'invalid') setBanner({ kind: 'save', text: T.INVALID_SAVE });
      else setBanner({ kind: 'save', text: T.SAVE_FAILED_BAR });
      return res.status;
    });
  }

  function scheduleSave() {
    setSaveState((s) => ({ ...s, pending: true }));
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      saveNow();
    }, SAVE_PAUSE_MS);
  }
  // While locked nothing is sent (it would be refused); the change goes out after unlocking.
  useEffect(() => {
    if (screenLocked) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    } else if (saveState.pending) {
      saveNow();
    }
  }, [screenLocked]);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function edit(nextFields) {
    setFields(nextFields);
    setFieldNote(null);
    if (!screenLocked) scheduleSave();
    else setSaveState((s) => ({ ...s, pending: true }));
  }

  // ----- Field changes -----
  const selected = fields.find((f) => f.id === selectedId) ?? null;
  function patchField(id, patch, meta = {}) {
    edit(
      fields.map((f) => {
        if (f.id === id) {
          const next = { ...f, ...patch };
          for (const k of Object.keys(patch)) if (patch[k] === undefined) delete next[k];
          return next;
        }
        if (f.show_if?.field === id) {
          if (meta.renameOption && f.show_if.value === meta.renameOption.from) return { ...f, show_if: { ...f.show_if, value: meta.renameOption.to } };
          if (meta.removeOption && f.show_if.value === meta.removeOption) {
            const { show_if: _gone, ...rest } = f;
            return rest;
          }
        }
        return f;
      }),
    );
  }
  function addField(type) {
    if (addBlocked(type, fields)) return;
    const id = nextFieldId(fields);
    const field = newField(type, id);
    const at = selectedId ? fields.findIndex((f) => f.id === selectedId) + 1 : fields.length;
    edit([...fields.slice(0, at), field, ...fields.slice(at)]);
    setSelectedId(id);
    if (isPhone) setPhoneEdit(id);
  }
  // Delete a field at once, with Undo in the toast (rulebook v0.630, "(now)" point 5: like the
  // Calendar's and the Schedule's Remove, v1.007). Any "Show only if" that pointed at it goes too.
  function deleteField(id) {
    const at = fields.findIndex((f) => f.id === id);
    const gone = fields[at];
    if (!gone || LOCKED_TYPES.includes(gone.type)) return;
    const rules = {}; // the "Show only if" rules that go with it, by field id, for Undo
    edit(
      fields
        .filter((f) => f.id !== id)
        .map((f) => {
          if (f.show_if?.field !== id) return f;
          rules[f.id] = f.show_if;
          const { show_if: _gone, ...rest } = f;
          return rest;
        }),
    );
    setSelectedId(null);
    setPhoneEdit(null);
    const copy = copyRef.current;
    showToast(T.fieldDeleted(gone.label), { icon: false, action: { label: T.UNDO, onAction: () => undoDelete(gone, at, rules, copy) } });
  }
  // Undo puts back just that field, where it was, and its "Show only if" rules on the fields that
  // still have none — so changes made since (another field, a rename) are kept. A rule that would
  // now point at a field below it (the field was moved meanwhile) stays off.
  function undoDelete(gone, at, rules, copy) {
    if (!openRef.current) return;
    const now = latestRef.current.fields;
    // A new copy from the database meanwhile, or a new field that took the same id: say so instead
    // of doing nothing.
    // (U-02: a problem never goes in a toast: the builder's amber bar says it and stays until ×)
    if (copy !== copyRef.current || now.some((f) => f.id === gone.id)) {
      setBanner({ kind: 'stale', text: T.UNDO_FIELD_CHANGED });
      return;
    }
    const back = [...now.slice(0, at), gone, ...now.slice(at)];
    const withRules = back.map((f) => (rules[f.id] && !f.show_if ? { ...f, show_if: rules[f.id] } : f));
    edit(fieldsProblem(tidy(withRules))?.code === 'showIf' ? back : withRules);
    setSelectedId(gone.id);
    showToast(T.UNDONE, { icon: false });
    // U-07: the toast's Undo button is gone, so focus would fall to the page: put it on the restored field's row
    // (twice: the row exists after the first frame; on a phone the list is back once the editor closed)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.querySelector(`[data-field-id="${gone.id}"] .ffield-btn, [data-field-id="${gone.id}"] .fstepbar-btn, [data-field-id="${gone.id}"] .flist-open`)?.focus()));
  }
  function moveField(id, toIndex) {
    const from = fields.findIndex((f) => f.id === id);
    if (from < 0 || toIndex < 0 || toIndex >= fields.length || from === toIndex) return;
    const next = [...fields];
    const [item] = next.splice(from, 1);
    next.splice(toIndex, 0, item);
    if (fieldsProblem(tidy(next))?.code === 'showIf') {
      setFieldNote(T.SHOW_IF_ORDER);
      return;
    }
    edit(next);
  }
  const drag = useReorderDrag({ enabled: !screenLocked && !publishing && menu === null, onDrop: (group, id, toIndex) => moveField(id, toIndex) });

  // ----- Booking -----
  const classes = school?.classes ?? [];
  const versionToday = useMemo(() => (school ? versionInEffect(school.versions, school.today) : null), [school]);
  // Times taught together (v0.620): a slot of today's schedule with 2+ classes this form offers is
  // ONE combined time, with one spot number — and it leaves those classes' own lists.
  const groups = useMemo(() => {
    if (!versionToday) return [];
    const seen = new Map();
    for (const s of school.slots) {
      if (s.versionId !== versionToday.id) continue;
      const classIds = s.classIds.filter((id) => booking.offered.includes(id)); // the slot's own order
      if (classIds.length < 2) continue;
      const start = toTimeText(s.start);
      const key = groupSlotKey(classIds, s.weekday, start);
      if (!seen.has(key)) seen.set(key, { key, classIds, weekday: s.weekday, start, end: toTimeText(s.end) });
    }
    return [...seen.values()].sort((a, b) => a.weekday - b.weekday || (a.start < b.start ? -1 : 1));
  }, [school, versionToday, booking.offered]);
  // A combined time with no row of its own yet starts with the largest usual number of its classes.
  const groupDefault = (classIds) => Math.max(...classIds.map((id) => booking.defaults[id] ?? 3));
  const inGroup = (classId, weekday, start) => groups.some((g) => g.weekday === weekday && g.start === start && g.classIds.includes(classId));
  // all = also the times taught together (only for saving, so each class keeps its own number)
  const timesFor = (classId, all = false) => {
    if (!versionToday) return [];
    const seen = new Map();
    for (const s of school.slots) {
      if (s.versionId !== versionToday.id || !s.classIds.includes(classId)) continue;
      if (!all && inGroup(classId, s.weekday, toTimeText(s.start))) continue; // listed once, under "Taught together"
      const start = toTimeText(s.start);
      const key = `${s.weekday}|${start}`;
      if (!seen.has(key)) seen.set(key, { weekday: s.weekday, start, end: toTimeText(s.end) });
    }
    return [...seen.values()].sort((a, b) => a.weekday - b.weekday || (a.start < b.start ? -1 : 1));
  };
  const bookingDirty = JSON.stringify(booking) !== JSON.stringify(bookingSaved);
  async function saveBooking() {
    if (bookingProblem(booking) || bookingSaving) return;
    setBookingSaving(true);
    setBookingNote(null);
    await saveNow(); // the field draft first, so the versions line up
    const result = await enqueue(async () => {
      const offers = booking.offered.map((classId) => ({ classId, defaultLimit: booking.defaults[classId] ?? 3, daysAhead: booking.daysAhead, minHoursAhead: booking.minHoursAhead }));
      const limits = [];
      for (const classId of booking.offered) {
        for (const t of timesFor(classId, true)) {
          const v = booking.times[timeSlotKey(classId, t.weekday, t.start)] ?? { on: true, spots: booking.defaults[classId] ?? 3 };
          limits.push({ classId, weekday: t.weekday, start: t.start, spotLimit: v.on ? v.spots : 0 });
        }
      }
      const groupRows = groups.map((g) => {
        const v = booking.groups?.[g.key] ?? { on: true, spots: groupDefault(g.classIds) };
        return { classIds: g.classIds, weekday: g.weekday, start: g.start, spotLimit: v.on ? v.spots : 0 };
      });
      const res = await setBooking({ id: form.id, expectedVersion: versionRef.current, offers, limits, groups: groupRows });
      if (res.status === 'ok') versionRef.current = res.version;
      return res;
    });
    setBookingSaving(false);
    if (result.status === 'ok') {
      setBookingSaved(booking);
      showToast(T.BOOKING_SAVED, { icon: false });
    } else if (result.status === 'no_access') onNoAccess();
    else if (result.status === 'stale' || result.status === 'not_found') {
      setBanner({ kind: 'stale', text: T.STALE_BUILDER });
      onReload();
    } else if (result.status === 'invalid') setBookingNote(T.BOOKING_BAD);
    else setBookingNote(T.SAVE_FAILED); // under its Save button: pressing Save again is the retry
  }

  // ----- Publish, Live / Closed -----
  const [statusBusy, setStatusBusy] = useState(false);
  const unpublished = form.published === null || JSON.stringify(tidy(fields)) !== JSON.stringify(form.published);
  async function publish() {
    if (publishing || busy) return;
    setPublishing(true);
    const saved = await saveNow();
    if (saved !== 'ok') {
      setPublishing(false);
      if (saved === 'waiting') setBanner({ kind: 'save', text: T.INVALID_SAVE });
      return;
    }
    const res = await enqueue(async () => {
      const r = await publishForm({ id: form.id, expectedVersion: versionRef.current });
      if (r.status === 'ok') versionRef.current = r.version;
      return r;
    });
    setPublishing(false);
    if (res.status === 'ok') {
      setBanner((b) => (b?.kind === 'publishFailed' ? null : b)); // a retry that worked takes its own bar away
      showToast(T.published(cleanText(name)), { icon: false });
      onReload();
    } else if (res.status === 'not_publishable') {
      const waiver = fields.find((f) => f.type === 'waiver');
      if (waiver) setSelectedId(waiver.id);
      setBanner({ kind: 'publish', text: T.NOT_PUBLISHABLE });
    } else if (res.status === 'no_access') onNoAccess();
    else if (res.status === 'stale' || res.status === 'not_found') {
      setBanner({ kind: 'stale', text: T.STALE_BUILDER });
      onReload();
    // a failed Publish keeps its bar with Retry, which publishes again (R2-01); its own kind, so a
    // later successful autosave doesn't wipe it
    } else setBanner({ kind: 'publishFailed', text: T.SAVE_FAILED, retry: publish });
  }
  // The "Accepting sign-ups (Live)" switch. `quiet` = the Undo of an earlier flip: no Undo again,
  // just "Undone".
  async function setAccepting(on, quiet = false) {
    setStatusBusy(true);
    await saveNow();
    const res = await enqueue(async () => {
      const r = await setFormStatus({ id: form.id, expectedVersion: versionRef.current, status: on ? 'live' : 'closed' });
      if (r.status === 'ok') versionRef.current = r.version;
      return r;
    });
    setStatusBusy(false);
    if (res.status === 'ok') {
      setBanner((b) => (b?.kind === 'liveFailed' ? null : b)); // a retry that worked takes its own bar away
      // Undo for 5 seconds (v1.006, N2): flips the switch back
      if (!quiet) showToast(on ? T.reopenedToast(cleanText(name)) : T.closedToast(cleanText(name)), { icon: false, action: { label: T.UNDO, onAction: () => setAccepting(!on, true) } });
      // the Undo worked (v0.618); one that opens the form again says so (v1.051 (1), R2-07)
      else showToast(on ? T.UNDONE_OPEN : T.UNDONE, { icon: false });
      onReload();
    } else if (res.status === 'no_access') onNoAccess();
    else if (res.status === 'stale') {
      setBanner({ kind: 'stale', text: quiet ? T.UNDO_STALE : T.STALE_BUILDER });
      onReload();
    // a failed switch or Undo keeps its bar with Retry, which flips the switch again (R2-01)
    } else setBanner({ kind: 'liveFailed', text: quiet ? T.UNDO_FAILED : T.SAVE_FAILED, retry: () => setAccepting(on, quiet) });
  }

  // ----- Header -----
  const line = T.statusLine(form, { dirty: unpublished, saving: saveState.saving || saveState.pending, failed: saveState.failed });
  const header = (
    <div className="fhead">
      <div className="fhead-titles">
        {/* "← Forms": saves the draft first, then goes back to the list (v1.020, v0.624) */}
        <button type="button" className="link-button fb-back" aria-label={T.BACK_TO_FORMS} data-builder-back onClick={async () => {
          await saveNow();
          onBack();
        }}>
          {/* ti-arrow-left = back */}
          <IconArrowLeft size={16} aria-hidden="true" />
          {T.FORMS_LINK}
        </button>
        <h1 className="ptitle">{cleanText(name) || form.name}</h1>
        <p className="psub" aria-live="polite">
          {line.text}
          {line.extra && (
            <>
              {' · '}
              <span className={line.warn ? 'fwarn' : undefined}>{line.extra}</span>
            </>
          )}
        </p>
      </div>
      {!isPhone && (
        <>
          <button type="button" className="btn" onClick={() => onPreview(tidy(fields))}>
            <IconEye size={16} aria-hidden="true" />
            {T.PREVIEW}
          </button>
          <button type="button" className="btn" onClick={(e) => onShare(e.currentTarget)}>
            <IconShare size={16} aria-hidden="true" />
            {T.SHARE}
          </button>
        </>
      )}
      <button type="button" className={`btn btn-primary${publishing ? ' is-unavailable' : ''}`} aria-disabled={publishing ? 'true' : undefined} onClick={publish}>
        {publishing ? T.PUBLISHING : T.PUBLISH}
      </button>
    </div>
  );

  // ----- The settings panel (right, or full screen on a phone) -----
  const idBase = `builder-${form.id}`;
  function settingsPanel(field) {
    if (!field) {
      return (
        <FormSettings
          form={form}
          name={name}
          slug={slug}
          settings={settings}
          readOnly={false}
          statusBusy={statusBusy}
          idBase={idBase}
          nameError={textProblem(name, 80) ? T.LABEL_PROBLEM[textProblem(name, 80)] : slugTaken ? T.DUPLICATE_SLUG : null}
          onName={(v) => {
            setName(v);
            scheduleSave();
          }}
          onSlug={(v) => {
            setSlug(v);
            setSlugTaken(false);
            scheduleSave();
          }}
          onSettings={(patch) => {
            setSettings((s) => ({ ...s, ...patch }));
            scheduleSave();
          }}
          onAccepting={setAccepting}
        />
      );
    }
    return (
      <FieldEditor key={field.id} field={field} fields={fields} readOnly={false} idBase={idBase} onChange={(patch, meta) => patchField(field.id, patch, meta)} onDelete={() => deleteField(field.id)}>
        {field.type === 'booking' && (
          <BookingSettings
            draft={booking}
            dirty={bookingDirty}
            classes={classes}
            timesFor={timesFor}
            groups={groups}
            groupDefault={groupDefault}
            agesOf={(classId) => school?.ages?.[classId] ?? { from: null, to: null }}
            readOnly={false}
            saving={bookingSaving}
            note={bookingNote}
            idBase={`${idBase}-booking`}
            onChange={(patch) => setBookingDraft((b) => ({ ...b, ...patch }))}
            onSave={saveBooking}
          />
        )}
      </FieldEditor>
    );
  }

  // ----- The form (middle) -----
  let stepNo = 1;
  const fieldHint = (f) => {
    if (f.type === 'children') return T.CHILD_HINT;
    if (f.type === 'address') return T.ADDRESS_HINT; // its four boxes, like a choice's options (v0.634)
    if (f.type === 'booking') return T.bookingHint(booking.offered.length, booking.offered.reduce((n, c) => n + timesFor(c).filter((t) => (booking.times[timeSlotKey(c, t.weekday, t.start)] ?? { on: true }).on).length, 0));
    if (f.type === 'waiver') return (f.text ?? '').trim() ? T.WAIVER_HINT : T.WAIVER_HINT_EMPTY;
    if (f.options) return f.options.join(' / ');
    return f.help || null;
  };
  const canvas = (
    // A click on empty space (not on a field) shows the form settings.
    // Esc anywhere in the form (not in a menu) goes back to the form settings too.
    <div
      className="fcanvas"
      onClick={(e) => e.target === e.currentTarget && setSelectedId(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && selectedId && !drag.state) setSelectedId(null);
      }}
    >
      <div className="fpaper" onClick={(e) => e.target === e.currentTarget && setSelectedId(null)}>
        <div className="fstepbar">{T.stepLabel(1, 'About you')}</div>
        {fields.map((f, i) => {
          const lifted = drag.state?.id === f.id;
          const target = f.show_if ? fields.find((x) => x.id === f.show_if.field) : null;
          const gap = drag.state && drag.state.gap === i && <div key={`gap-${f.id}`} className="fgap" aria-hidden="true" />;
          if (f.type === 'step') {
            stepNo += 1;
            return [
              gap,
              <div key={f.id} className={`fstepbar fstepbar--field${selectedId === f.id ? ' is-selected' : ''}${lifted ? ' is-lifted' : ''}`} data-drag-group="fields" data-drag-id={f.id} data-field-id={f.id}>
                <Grip label={T.dragField(f.label)} gripProps={drag.gripProps('fields', f.id)} />
                <button type="button" className="fstepbar-btn" aria-pressed={selectedId === f.id} onClick={() => setSelectedId(f.id)}>
                  {T.stepLabel(stepNo, f.label)}
                </button>
              </div>,
            ];
          }
          const hint = fieldHint(f);
          const req = f.required || ['parent_name', 'parent_phone', 'parent_email', 'waiver'].includes(f.type);
          return [
            gap,
            <div key={f.id} className={`ffield${selectedId === f.id ? ' is-selected' : ''}${lifted ? ' is-lifted' : ''}`} data-drag-group="fields" data-drag-id={f.id} data-field-id={f.id}>
              <Grip label={T.dragField(f.label)} gripProps={drag.gripProps('fields', f.id)} />
              <button type="button" className="ffield-btn" aria-pressed={selectedId === f.id} onClick={() => setSelectedId(f.id)}>
                <span className="ffield-label">
                  <FieldIcon type={f.type} />
                  {f.type === 'heading' ? <strong>{f.label}</strong> : f.label}
                  {req && f.type !== 'heading' && <span className="freq"> {T.REQUIRED_MARK}</span>}
                  {LOCKED_TYPES.includes(f.type) && <IconLock size={12} aria-label={T.LOCKED} className="flock" />}
                </span>
                {!['heading'].includes(f.type) && <span className="ffield-ctl" aria-hidden="true" />}
                {hint && <span className="ffield-hint">{hint}</span>}
                {target && (
                  <span className="ffield-cond">
                    <IconGitBranch size={12} aria-hidden="true" />
                    {T.showsIf(target.label, f.show_if.value)}
                  </span>
                )}
              </button>
            </div>,
          ];
        })}
        {drag.state && drag.state.gap === fields.length && <div className="fgap" aria-hidden="true" />}
      </div>
    </div>
  );

  // ----- Phone: a list of fields -----
  const phoneList = (
    <>
      <div className="fphone-tools">
        <button type="button" className="btn" aria-haspopup="menu" onClick={(e) => setMenu({ kind: 'add', anchor: e.currentTarget })}>
          <IconPlus size={16} aria-hidden="true" />
          {T.ADD_FIELD}
        </button>
        <button type="button" className="btn" onClick={() => onPreview(tidy(fields))}>
          <IconEye size={16} aria-hidden="true" />
          {T.PREVIEW}
        </button>
        <button type="button" className="btn" onClick={(e) => onShare(e.currentTarget)}>
          <IconShare size={16} aria-hidden="true" />
          {T.SHARE}
        </button>
      </div>
      <button type="button" className="btn fphone-settings" onClick={() => setPhoneEdit('__form')}>
        {T.FORM_SETTINGS}
      </button>
      <ul className="flist flist--phone fphone-fields">
        <li className="fphone-step">{T.stepLabel(1, 'About you')}</li>
        {(() => {
          let n = 1;
          return fields.map((f, i) => {
            if (f.type === 'step') n += 1;
            const row = (
              <li key={f.id} data-field-id={f.id} className={`prow flist-row${f.type === 'step' ? ' fphone-steprow' : ''}`}>
                <button type="button" className="prow-main flist-open" onClick={() => setPhoneEdit(f.id)}>
                  <span className="l1">
                    <FieldIcon type={f.type} /> {f.type === 'step' ? T.stepLabel(n, f.label) : f.label}
                    {LOCKED_TYPES.includes(f.type) && <IconLock size={12} aria-label={T.LOCKED} className="flock" />}
                  </span>
                </button>
                <IconButton label={T.fieldMore(f.label)} aria-haspopup="menu" aria-expanded={menu?.kind === 'field' && menu.field.id === f.id ? 'true' : 'false'} onClick={(e) => setMenu({ kind: 'field', anchor: e.currentTarget, field: f, index: i })} Icon={IconDots} />
              </li>
            );
            return row;
          });
        })()}
      </ul>
    </>
  );

  const menuItems =
    menu?.kind === 'add'
      ? PALETTE.flatMap((g) =>
          g.types.map((type, i) => ({
            key: type,
            label: T.TYPE_LABEL[type],
            Icon: () => <FieldIcon type={type} />,
            disabled: Boolean(addBlocked(type, fields)),
            separatorBefore: i === 0 && g.group !== 'Contact',
            onSelect: () => addField(type),
          })),
        )
      : menu?.kind === 'field'
        ? [
            { key: 'up', label: T.MOVE_UP, Icon: IconArrowUp, disabled: menu.index === 0, onSelect: () => moveField(menu.field.id, menu.index - 1) },
            { key: 'down', label: T.MOVE_DOWN, Icon: IconArrowDown, disabled: menu.index === fields.length - 1, onSelect: () => moveField(menu.field.id, menu.index + 1) },
            { key: 'delete', label: T.DELETE_FIELD, Icon: IconTrash, danger: true, separatorBefore: true, disabled: LOCKED_TYPES.includes(menu.field.type), onSelect: () => deleteField(menu.field.id) },
          ]
        : [];

  const phoneField = phoneEdit === '__form' ? null : fields.find((f) => f.id === phoneEdit);
  return (
    <div className="fbuilder">
      {header}
      {/* a bar with `retry` gets Retry, which does the same again (v1.004, R2-01) */}
      {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={publishing || statusBusy} onDismiss={() => setBanner(null)} />}
      {fieldNote && <Notice>{fieldNote}</Notice>}
      {isPhone ? (
        phoneList
      ) : (
        <>
          {!isWide && (
            <div className="ftab-tools">
              <button type="button" className="btn" aria-haspopup="menu" onClick={(e) => setMenu({ kind: 'add', anchor: e.currentTarget })}>
                <IconPlus size={16} aria-hidden="true" />
                {T.ADD_FIELD}
              </button>
            </div>
          )}
          <div className={`fbld${isWide ? ' fbld--three' : ''}`}>
            {isWide && <FieldPalette fields={fields} disabled={publishing} onAdd={addField} />}
            {canvas}
            <aside className="fside" aria-label={selected ? T.fieldTitle(selected.type) : T.FORM_SETTINGS}>
              {selected && (
                <button type="button" className="link-button fside-back" onClick={() => setSelectedId(null)}>
                  <IconSettings size={16} aria-hidden="true" />
                  {T.FORM_SETTINGS}
                </button>
              )}
              {settingsPanel(selected)}
            </aside>
          </div>
        </>
      )}
      {isPhone && phoneEdit && !screenLocked && (
        <Dialog title={phoneField ? T.fieldTitle(phoneField.type) : T.FORM_SETTINGS} fullScreen onRequestClose={() => setPhoneEdit(null)}>
          {settingsPanel(phoneField ?? null)}
        </Dialog>
      )}
      {menu && !screenLocked && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={menu.kind === 'add' ? T.ADD_FIELD : menu.field.label}
          subtitle={cleanText(name)}
          label={menu.kind === 'add' ? T.ADD_FIELD : T.fieldMore(menu.field.label)}
          items={menuItems}
          onClose={(reason) => {
            const el = menu.anchor;
            setMenu(null);
            if (reason === 'escape' || reason === 'tab') el?.focus();
          }}
        />
      )}
    </div>
  );
}
