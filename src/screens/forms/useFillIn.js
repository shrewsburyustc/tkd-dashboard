// useFillIn.js — "Fill in for a family" and Preview, usable from any screen.
// Why it exists: Forms (⋯ → Fill in) and Prospects ("+ Add prospect", rulebook v0.236) open the
// SAME steps; this hook holds the typed answers (so a lock while it's open loses nothing — the
// screen stays mounted), loads the open free-class times, sends the sign-up and reacts to every
// answer of forms_staff_submit (time taken, form changed, closed, refused, no connection).
//
//   const fill = useFillIn({ isPhone, screenLocked, onNoAccess, onSent, onClosed });
//   fill.open(form, opener, { mode: 'fill' | 'preview', fields })   → false if it can't open (Draft/Closed)
//   fill.isOpen, fill.element (the dialog, or null; hidden while locked)
import { useLayoutEffect, useRef, useState } from 'react';
import { createElement } from 'react';
import { addDays } from '../../lib/schedule/versions.js';
import { cleanText } from '../../lib/calendar/rules.js';
import { bookingsWithoutChild, CHILD_KEY, cleanAnswers, isTimeKey, removedChildIndex } from '../../lib/forms/fields.js';
import { loadForm, openTimes, staffSubmit } from '../../lib/forms/api.js';
import FillInDialog, { emptyFillValues } from './FillInDialog.jsx';

const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const usable = (el) => (el && el.isConnected && el.getClientRects().length > 0 ? el : null);

export function useFillIn({ isPhone, screenLocked, onNoAccess, onSent, onClosed }) {
  const [state, setState] = useState(null);
  const ref = useRef(state);
  useLayoutEffect(() => {
    ref.current = state;
  });
  const patch = (p) => setState((d) => (d ? { ...d, ...p } : d));

  async function loadTimes(form) {
    const today = localToday();
    const res = await openTimes({ formId: form.id, from: today, to: addDays(today, 60) });
    setState((d) => (d && d.form.id === form.id ? { ...d, times: res.status === 'ok' ? res.times : 'error' } : d));
    if (res.status === 'no_access') onNoAccess();
  }

  function open(form, opener, { mode = 'fill', fields = null } = {}) {
    if (mode === 'fill' && form.status !== 'live') return false;
    const shown = fields ?? (mode === 'fill' ? form.published : form.published ?? form.draft);
    setState({ key: Date.now(), mode, form, fields: shown, step: 0, values: emptyFillValues(), problems: {}, times: null, opener, submissionKey: newKey(),
      draftPreview: Boolean(fields), saving: false, note: null, sent: null });
    if (shown.some((f) => f.type === 'booking')) loadTimes(form);
    return true;
  }

  function close() {
    const d = ref.current;
    if (!d || d.saving) return;
    setState(null);
    window.requestAnimationFrame(() => usable(d.opener)?.focus());
    onClosed?.(d);
  }

  function change(p) {
    setState((d) => {
      if (!d || d.saving) return d;
      const problems = { ...d.problems };
      for (const k of Object.keys(p.answers ?? {})) delete problems[k];
      let next = p;
      if (p.children) {
        delete problems.children;
        const gone = removedChildIndex(d.values.children, p.children);
        // A child that was changed loses its marks until the next Continue; the others keep theirs.
        // A removal moves every child after it up one place, so then all the marks go.
        for (const k of Object.keys(problems)) {
          const m = CHILD_KEY.exec(k);
          if (m && (gone >= 0 || p.children[Number(m[1])] !== d.values.children[Number(m[1])])) delete problems[k];
        }
        // the removed child's free-class pick goes; the picks of the children after it move up one (code review)
        if (gone >= 0) next = { ...p, bookings: bookingsWithoutChild(d.values.bookings, gone) };
      }
      if (p.signature !== undefined) delete problems.signature;
      return { ...d, values: { ...d.values, ...next }, problems, note: d.note === 'LEAVE_FILL' ? null : d.note, submissionKey: d.note === 'TIME_TAKEN' ? newKey() : d.submissionKey };
    });
  }

  async function submit() {
    const d = ref.current;
    if (!d || d.saving) return;
    patch({ saving: true, note: null });
    const v = d.values;
    // each child: first name, last name, date of birth (migration 0036 works out the age from it)
    const children = v.children.map((c) => ({ first_name: cleanText(c.first_name), last_name: cleanText(c.last_name), dob: c.dob }));
    const bookings = Object.entries(v.bookings)
      .filter(([i, key]) => isTimeKey(key) && Number(i) < children.length)
      .map(([i, key]) => {
        const [classId, date, start] = key.split('|');
        return { child: Number(i), classId, date, start };
      });
    const hasWaiver = d.fields.some((f) => f.type === 'waiver' && v.answers[f.id] === true);
    const res = await staffSubmit({
      formId: d.form.id, submissionKey: d.submissionKey, publishedVersion: d.form.publishedVersion, answers: cleanAnswers(d.fields, v.answers),
      children, bookings, signature: hasWaiver ? v.signature : null,
    });
    if (res.status === 'ok') {
      patch({ saving: false, sent: { bookings: res.bookings, id: res.id } });
      onSent?.(res, d.form);
    } else if (res.status === 'no_access') {
      patch({ saving: false });
      onNoAccess();
    } else if (res.status === 'time_taken') {
      patch({ saving: false, note: 'TIME_TAKEN', submissionKey: newKey() });
      loadTimes(d.form);
    } else if (res.status === 'form_changed') {
      const fresh = await loadForm(d.form.id);
      if (fresh.status === 'ok') patch({ saving: false, note: 'FORM_CHANGED', form: fresh.form, fields: fresh.form.published, step: 0, submissionKey: newKey() });
      else patch({ saving: false, note: 'SEND_FAILED' });
    } else if (res.status === 'closed' || res.status === 'not_found') {
      patch({ saving: false, note: 'FORM_CLOSED' });
    } else if (res.status === 'invalid') {
      patch({ saving: false, note: 'SEND_INVALID', submissionKey: newKey() });
    } else {
      patch({ saving: false, note: 'SEND_FAILED' }); // same key: a repeat can't save twice
    }
  }

  // Esc, a click outside or Back: with something typed, the note shows and the dialog stays open
  // until Send or Cancel — a second Esc does nothing (rulebook v0.46 / v1.027, design review N15).
  // Phones have no Cancel, so their note (this one or an error) holds a "Discard changes" link (v0.56).
  function requestClose() {
    const d = ref.current;
    if (!d || d.saving) return;
    const started = d.mode === 'fill' && !d.sent && JSON.stringify(d.values) !== JSON.stringify(emptyFillValues());
    if (!started) close();
    else if (!d.note) patch({ note: 'LEAVE_FILL' }); // an error note already showing stays
  }

  const element = state && !screenLocked
    ? createElement(FillInDialog, {
      key: state.key,
      state,
      isPhone,
      onChange: change,
      onStep: (step, problems) => patch({ step, problems, note: null }),
      onSubmit: submit,
      onAnother: () => patch({ sent: null, step: 0, values: emptyFillValues(), problems: {}, note: null, submissionKey: newKey() }),
      onCancel: close,
      onRequestClose: requestClose,
    })
    : null;

  return { open, close, isOpen: state !== null, element };
}
