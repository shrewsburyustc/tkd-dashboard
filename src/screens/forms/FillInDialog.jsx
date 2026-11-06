// FillInDialog.jsx — "Fill in for a family" and the builder's / staff's Preview (mockup screens 8, 10).
// Why it exists: staff fill a form in while talking to a family (phone or desk). It shows the
// SAME steps as the public page: one step at a time, Back / Next, then Submit. The sign-up is
// marked "Entered by <staff name>" by the database. Preview is the same dialog without Submit.
// The typed answers live in Forms.jsx (so a lock while it's open loses nothing).
//
// state: { mode: 'fill' | 'preview', form, fields, step, values, problems, times, saving, note, sent }
//   values = { answers, children: [{ first_name, last_name, dob }], bookings: { childIndex: timeKey }, signature }
//   (the Date signed under a signature is drawn by FormFields from today's date: never in values)
import { useEffect, useRef } from 'react';
import { IconArrowLeft, IconArrowRight, IconCheck } from '@tabler/icons-react';
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
      const target = (problemKey && root.querySelector('[aria-invalid="true"], .notice')?.closest('.field, fieldset, .fchildren, .fwaiver')?.querySelector('input:not([disabled]), select, textarea, button.dp-field:not([aria-disabled="true"])'))
        || root.querySelector('input:not([type="hidden"]), select, textarea, button.dp-field:not([aria-disabled="true"])');
      target?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [state.step, problemKey, state.sent]);

  // The Sent screen and the steps are two different boxes, each with its own key: without the keys
  // React would keep the one box open and only swap what is inside, so the Send button (which had
  // the focus) would vanish and focus would fall to the page, where Esc and Tab do nothing (WCAG
  // 2.4.3; found by Camps' review, pass 1 step 1b). With them, the Sent box opens fresh and the
  // shared Dialog puts the focus on its Close (data-autofocus); "Fill in another" opens the steps
  // fresh and the effect above focuses the first field. (Black Belt's CyclePage does the same.)
  if (state.sent) {
    const childName = (i) => v.children[i]?.first_name || T.CHILD(i + 1);
    return (
      <Dialog key="sent" title={T.SENT_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onCancel}>
        <div className="fsent">
          {/* The same tick as the family page's thank-you screen (ThankYou.jsx), design review N14 */}
          <div className="fsent-icon" aria-hidden="true">
            <IconCheck size={24} />
          </div>
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
  // The note: under the buttons on PC / tablet (v0.81), above them on phones, where every note
  // (the unsaved one or an error) also holds "Discard changes" — phones have no Cancel (v0.56, N15).
  const leaving = state.note === 'LEAVE_FILL';
  const noteBlock = state.note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && leaving ? T.LEAVE_FILL_PHONE : NOTES[state.note] ?? state.note}
        {isPhone && !preview && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );
  const actions = (
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
            {last ? (state.saving ? T.SUBMITTING : T.SEND) : T.CONTINUE}
          </button>
        )}
      </span>
    </div>
  );
  return (
    <Dialog key="steps" title={title} size="medium" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{preview ? (state.form.status === 'draft' || state.draftPreview ? T.PREVIEW_DRAFT_NOTE : T.PREVIEW_NOTE) : T.ENTERED_BY}</p>
      <div className="fprogress" aria-hidden="true">
        {steps.map((s, i) => (
          <i key={s.id} className={i <= step ? 'is-on' : ''} />
        ))}
      </div>
      <h3 className="fstep-title">{T.stepOf(step + 1, steps.length, current.label)}</h3>
      <form ref={formRef} onSubmit={next} noValidate>
        {/* noAutofill: a desk computer is shared, so the browser must not save one family's
            name, phone, email or address and offer it to the next (security review) */}
        <FormFields
          inlineDates={isPhone}
          noAutofill
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
        {isPhone ? (
          <>
            {noteBlock}
            {actions}
          </>
        ) : (
          <div className="dialog-footer">
            {actions}
            {noteBlock}
          </div>
        )}
      </form>
    </Dialog>
  );
}
