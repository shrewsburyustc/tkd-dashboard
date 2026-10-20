// FillInDialog.jsx — "Fill in for a family" and the builder's / staff's Preview (mockup screens 8, 10).
// Why it exists: staff fill a form in while talking to a family (phone or desk). It shows the
// SAME steps as the public page: one step at a time, Back / Next, then Submit. The sign-up is
// marked "Entered by <staff name>" by the database. Preview is the same dialog without Submit.
// The typed answers live in Forms.jsx (so a lock while it's open loses nothing).
//
// state: { mode: 'fill' | 'preview', form, fields, step, values, problems, times, saving, note, sent }
//   values = { answers, children: [{ first_name, age }], bookings: { childIndex: timeKey }, signature }
import { useEffect, useRef } from 'react';
import { IconArrowLeft, IconArrowRight, IconCheck, IconCircleCheck } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { emptyFillValues, stepProblems, stepsOf } from '../../lib/forms/fields.js';
import FormFields from './FormFields.jsx';
import * as T from './text.js';

// The empty answers and the per-step checks live in lib/forms/fields.js, shared with the public
// page (src/forms/), and are re-exported here for the screens that already import them from here.
export { emptyFillValues, stepProblems };

const NOTES = {
  TIME_TAKEN: T.TIME_TAKEN,
  FORM_CHANGED: T.FORM_CHANGED,
  FORM_CLOSED: T.FORM_CLOSED,
  SEND_FAILED: T.SEND_FAILED,
  SEND_INVALID: T.SEND_INVALID,
  LEAVE_FILL: T.LEAVE_FILL,
};

export default function FillInDialog({ state, isPhone, onChange, onStep, onSubmit, onAnother, onCancel, onRequestClose }) {
  const preview = state.mode === 'preview';
  const steps = stepsOf(state.fields).filter((s) => s.fields.length > 0);
  const step = Math.min(state.step, steps.length - 1);
  const current = steps[step];
  const last = step === steps.length - 1;
  const idBase = `fill-${state.key}`;
  const title = preview ? T.previewTitle(state.form.name) : T.fillInTitle(state.form.name);
  const v = state.values;
  const formRef = useRef(null);
  // Each step starts with focus on its first field; a failed Next moves it to the first problem.
  const problemKey = Object.keys(state.problems ?? {}).join(',');
  useEffect(() => {
    if (state.sent) return undefined;
    const id = window.requestAnimationFrame(() => {
      const root = formRef.current;
      if (!root) return;
      const target = (problemKey && root.querySelector('[aria-invalid="true"], .notice')?.closest('.field, fieldset, .fchildren, .fwaiver')?.querySelector('input:not([disabled]), select, textarea'))
        || root.querySelector('input:not([type="hidden"]), select, textarea');
      target?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [state.step, problemKey, state.sent]);

  if (state.sent) {
    const childName = (i) => v.children[i]?.first_name || T.CHILD(i + 1);
    return (
      <Dialog title={T.SENT_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onCancel}>
        <div className="fsent">
          <IconCircleCheck size={40} aria-hidden="true" className="fsent-icon" />
          <p>{T.sentText(v.answers.parent_name)}</p>
          {state.sent.bookings.length > 0 && (
            <ul className="fsent-list">
              {state.sent.bookings.map((b) => (
                <li key={b.child}>{T.sentBooking(childName(b.child), b)}</li>
              ))}
            </ul>
          )}
        </div>
        <div className={isPhone ? 'dialog-page-submit' : 'dialog-actions'}>
          <button type="button" className={`btn${isPhone ? ' btn-block' : ''}`} onClick={onAnother}>
            {T.ANOTHER}
          </button>
          <button type="button" className={`btn btn-primary${isPhone ? ' btn-block' : ''}`} data-autofocus onClick={onCancel}>
            {T.CLOSE}
          </button>
        </div>
      </Dialog>
    );
  }

  function next(e) {
    e.preventDefault();
    if (preview) {
      if (!last) onStep(step + 1, {});
      return;
    }
    const problems = stepProblems(current.fields, state.fields, v, Array.isArray(state.times) ? state.times : null);
    if (Object.keys(problems).length > 0) {
      onStep(step, problems);
      return;
    }
    if (last) onSubmit();
    else onStep(step + 1, {});
  }

  const answer = (id, value) => onChange({ answers: { ...v.answers, [id]: value } }, id);
  return (
    <Dialog title={title} size="medium" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{preview ? (state.form.status === 'draft' || state.draftPreview ? T.PREVIEW_DRAFT_NOTE : T.PREVIEW_NOTE) : T.ENTERED_BY}</p>
      <div className="fprogress" aria-hidden="true">
        {steps.map((s, i) => (
          <i key={s.id} className={i <= step ? 'is-on' : ''} />
        ))}
      </div>
      <h3 className="fstep-title">{T.stepOf(step + 1, steps.length, current.label)}</h3>
      <form ref={formRef} onSubmit={next} noValidate>
        <FormFields
          fields={current.fields}
          values={v}
          problems={state.problems}
          times={state.times}
          readOnly={state.saving}
          idBase={idBase}
          onAnswer={answer}
          onChildren={(children) => onChange({ children }, 'children')}
          onBooking={(i, key) => onChange({ bookings: { ...v.bookings, [i]: key || undefined } }, 'booking')}
          onSignature={(signature) => onChange({ signature }, 'signature')}
        />
        {state.note && (
          <div className="tdialog-note">
            <Notice>{NOTES[state.note] ?? state.note}</Notice>
          </div>
        )}
        <div className={`dialog-actions fstep-actions${isPhone ? ' fstep-actions--phone' : ''}`}>
          {!isPhone && (
            <button type="button" className="btn" onClick={onCancel}>
              {preview ? T.CLOSE : T.CANCEL}
            </button>
          )}
          <span className="sdialog-actions-right">
            {step > 0 && (
              <button type="button" className="btn" disabled={state.saving} onClick={() => onStep(step - 1, {})}>
                <IconArrowLeft size={16} aria-hidden="true" />
                {T.BACK}
              </button>
            )}
            {!(preview && last) && (
              <button type="submit" className="btn btn-primary" aria-disabled={state.saving ? 'true' : undefined}>
                {last ? <IconCheck size={16} aria-hidden="true" /> : <IconArrowRight size={16} aria-hidden="true" />}
                {last ? (state.saving ? T.SUBMITTING : T.SUBMIT) : T.NEXT}
              </button>
            )}
          </span>
        </div>
      </form>
    </Dialog>
  );
}
