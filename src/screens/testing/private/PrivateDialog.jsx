// PrivateDialog.jsx — Add private testing (mockup P2) and Edit details of a private testing.
// Why it exists: a family asks to test privately, on their own day and time, not at a testing
// event (rulebook v0.401–v0.403). The desk fills in what Add student asks (phase 2, R4) plus the
// day and time; the class, belt, testing-for and the PRIVATE price are copied from Classes and
// ranks when it is saved (the price is never typed, Q3).
//   'add'   First / Last name, Class buttons, Current belt buttons + "Testing for Blue → High Blue
//           · Group B", the 3-stripes tick, Paying by, Day and Time (DayTimeFields), the gray price
//           box "$95 private price" + where it comes from, and the hint. All staff.
//   'edit'  names, class and belt only. A class or belt that was removed from Classes and ranks
//           since the copy is still shown as the current choice, marked "(no longer in Classes and
//           ranks)", and sent back unchanged (= belt not changed) unless another belt is picked.
//           A paid private testing moving to a pricier price gets the amber "Price $85 → $95 · $10
//           more to collect"; a graded one is warned that a belt change clears its result; after
//           the private day staff see class and belt locked when it is graded.
// PC and tablet: a centered dialog. Phone: a full screen with a back arrow, Save pinned at the
// bottom (v0.194). Like every dialog of the tab, this only DRAWS; the values live in
// PrivateTestingTab (`state`), so a screen lock hides the dialog and brings it back filled in.
import { IconCheck } from '@tabler/icons-react';
import Belt from '../../../components/Belt.jsx';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { nameProblem, normalizeName } from '../../../lib/testing/names.js';
import { amountDue } from '../../../lib/testing/privateRules.js';
import ChoiceGroup from '../events/ChoiceGroup.jsx';
import DayTimeFields, { checkDayTime } from './DayTimeFields.jsx';
import * as T from '../text.js';

// The key used for a copied class / belt that is no longer in Classes and ranks (its stored id may
// even be null — a history pointer only).
export const COPIED = '__copied';

// The class and belt choices: the live Classes and ranks, plus — in Edit details — the copied
// class / belt when it no longer exists there. classes = rankOrder.withTestingFor(...) views.
export function choicesFor(classes, record) {
  const list = classes.map((c) => ({ id: c.id, name: c.name, gone: false, ranks: c.ranks.map((r) => ({ ...r, gone: false })) }));
  if (!record) return list;
  const classKey = record.classId ?? COPIED;
  let cls = list.find((c) => c.id === classKey);
  if (!cls) {
    cls = { id: classKey, name: record.className, gone: true, ranks: [] };
    list.push(cls);
  }
  const rankKey = record.rankId ?? COPIED;
  if (!cls.ranks.some((r) => r.id === rankKey)) {
    const to = record.testingFor;
    cls.ranks = [
      ...cls.ranks,
      {
        id: rankKey,
        name: record.rankName,
        ...(record.belt ?? {}),
        privateCents: record.privateCents,
        testingFor: to && to.kind === 'rank' ? { name: to.name } : null,
        gone: true,
      },
    ];
  }
  return list;
}

// Did anything change since the dialog opened?
export function isPrivateFormDirty(state) {
  const a = state.values;
  const b = state.initial;
  return ['firstName', 'lastName', 'classId', 'rankId', 'stripes', 'payingBy', 'day', 'time'].some((key) => (a[key] ?? null) !== (b[key] ?? null));
}

// Checks the form. record = the saved row (edit). → messages, canSave, sameAsSaved, payload
export function checkPrivateForm(state, record, { today }) {
  const { values, touched, triedSave } = state;
  const isAdd = state.mode === 'add';
  const first = normalizeName(values.firstName);
  const last = normalizeName(values.lastName);
  const firstProblem = nameProblem(values.firstName);
  const lastProblem = nameProblem(values.lastName);
  const show = (field, problem) => (problem === 'empty' ? touched[field] || triedSave : Boolean(problem));
  const firstError = show('firstName', firstProblem) ? T.studentNameProblem(firstProblem, 'first') : null;
  const lastError = show('lastName', lastProblem) ? T.studentNameProblem(lastProblem, 'last') : null;
  const classError = !values.classId && triedSave ? T.PICK_CLASS : null;
  const beltError = values.classId && !values.rankId && triedSave ? T.PICK_BELT : null;
  const stripesError = isAdd && !values.stripes && triedSave ? T.NEEDS_THREE_STRIPES : null;
  const payingError = isAdd && !values.payingBy && triedSave ? T.PICK_PAYING_BY : null;
  const dayTime = isAdd
    ? checkDayTime({ day: values.day ?? '', time: values.time ?? '' }, { today, touched: { day: touched.day, time: touched.time }, triedSave, pastDay: state.pastDay ?? null })
    : null;
  const valid =
    !firstProblem && !lastProblem && values.classId && values.rankId && (!isAdd || (values.stripes && values.payingBy && dayTime.valid));
  // The copied belt sent back unchanged = "belt not changed" (its stored id, which may be null).
  const rankId = values.rankId === COPIED ? null : values.rankId;
  const sameAsSaved = !isAdd && valid && record && first === record.firstName && last === record.lastName && rankId === (record.rankId ?? null);
  const canSave = Boolean(valid) && !state.saving && !state.blocked;
  const payload = valid ? { firstName: first, lastName: last, rankId, payingBy: values.payingBy, privateDate: values.day, privateTime: values.time } : null;
  return { firstError, lastError, classError, beltError, stripesError, payingError, dayTime, canSave, sameAsSaved, payload };
}

const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'STUDENT_LOCKED', 'NOT_ALLOWED', 'PRIVATE_GRADED'];
const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  STUDENT_LOCKED: T.STUDENT_LOCKED,
  NOT_ALLOWED: T.ROSTER_NOT_ALLOWED,
  PRIVATE_GRADED: T.PRIVATE_GRADED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
};

// props: state (the tab's dialog: mode 'add' | 'edit', values, touched, triedSave, note, noteText,
// saving, blocked, pastDay), classes (live Classes and ranks, withTestingFor views — null while
// loading), record (edit: the row), school, today, isAdmin, isPhone, onChange, onTouch,
// onSave(canSave), onCancel, onRequestClose
export default function PrivateDialog({ state, classes, record, school, today, isAdmin, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const isAdd = state.mode === 'add';
  const idBase = `private-dialog-${state.key}`;
  const values = state.values;
  const readOnly = state.saving;
  const check = checkPrivateForm(state, record, { today });
  const choices = choicesFor(classes ?? [], isAdd ? null : record);
  const cls = choices.find((c) => c.id === values.classId) ?? null;
  const rank = cls ? (cls.ranks.find((r) => r.id === values.rankId) ?? null) : null;
  const toName = rank ? (rank.testingFor?.name ?? T.NO_NEW_RANK) : '';

  // Edit details: staff can't change a graded one's belt after its day (§1.2).
  const beltLocked = !isAdd && record && record.graded && today > record.privateDate && !isAdmin;
  const beltChanged = !isAdd && record && values.rankId !== (record.rankId ?? COPIED);

  let priceNotice = null;
  let priceHint = null;
  let clearsLine = null;
  if (!isAdd && beltChanged && rank) {
    // A belt correction re-copies the CURRENT private price (§1.3): pricier → owed, cheaper → 0.
    const due = amountDue({ privateCents: rank.privateCents, paidCents: record.paidCents });
    if (record.paid && due > 0) priceNotice = <Notice>{T.repriceLine(record.privateCents, rank.privateCents, due)}</Notice>;
    else if (record.paid) priceHint = T.PAYMENT_STAYS;
    if (record.graded) {
      const first = record.firstName;
      clearsLine = <Notice>{record.result ? T.beltChangeClearsPrivate(first, T.resultTagText(record.result)) : T.beltChangeClearsNotePrivate(first)}</Notice>;
    }
  }

  function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    onSave(check.canSave);
  }

  const noteText = state.note === 'FINAL_AWARD' ? T.finalAwardNotSet(state.noteText ?? '') : NOTES[state.note];
  const noteBlock = state.note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && state.note === 'STALE_DIALOG' ? T.STALE_DIALOG_PHONE : noteText}
        {isPhone && PHONE_DISCARD_NOTES.includes(state.note) && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );
  const saveButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${check.canSave ? '' : ' is-unavailable'}`}
      aria-disabled={check.canSave ? undefined : 'true'}
    >
      <IconCheck size={16} aria-hidden="true" />
      {state.saving ? T.SAVING : T.SAVE}
    </button>
  );

  const nameField = (field, label, error) => (
    <div className="field">
      <label htmlFor={`${idBase}-${field}`}>{label}</label>
      <input
        id={`${idBase}-${field}`}
        className="input"
        type="text"
        autoComplete="off"
        data-autofocus={field === 'firstName' ? true : undefined}
        readOnly={readOnly}
        value={values[field]}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${idBase}-${field}-error` : undefined}
        onChange={(changeEvent) => {
          onChange({ [field]: changeEvent.target.value });
          onTouch(field);
        }}
      />
      {error && <Notice id={`${idBase}-${field}-error`}>{error}</Notice>}
    </div>
  );

  const chooserReadOnly = readOnly || beltLocked || classes === null;
  const title = isAdd ? T.ADD_PRIVATE_TITLE : T.EDIT_DETAILS_TITLE;
  const sub = isAdd ? T.schoolName(school) : T.privateDialogSub(T.studentLabel(record), record.className, record.rankName, record.testingFor?.kind === 'rank' ? record.testingFor.name : T.NO_NEW_RANK);

  return (
    <Dialog title={title} size="medium" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{sub}</p>
      <form onSubmit={handleSubmit} noValidate className="pv-form">
        <div className="ev-two">
          {nameField('firstName', T.FIRST_NAME, check.firstError)}
          {nameField('lastName', T.LAST_NAME, check.lastError)}
        </div>

        <div className={`field${beltLocked ? ' ev-locked' : ''}`}>
          <span id={`${idBase}-class-label`} className="field-label">
            {T.CLASS}
          </span>
          <ChoiceGroup
            variant="chips"
            labelId={`${idBase}-class-label`}
            value={values.classId}
            readOnly={chooserReadOnly}
            disabled={beltLocked}
            invalid={Boolean(check.classError)}
            options={choices.map((c) => ({ key: c.id, label: c.gone ? T.notInClassesRanks(c.name) : c.name }))}
            onChange={(classId) => onChange({ classId, rankId: null })}
          />
          {check.classError && <Notice>{check.classError}</Notice>}

          <span id={`${idBase}-belt-label`} className="field-label ev-belt-label">
            {T.CURRENT_BELT}
          </span>
          {cls ? (
            <ChoiceGroup
              variant="chips"
              labelId={`${idBase}-belt-label`}
              value={values.rankId}
              readOnly={chooserReadOnly}
              disabled={beltLocked}
              invalid={Boolean(check.beltError)}
              options={cls.ranks.map((r) => ({
                key: r.id,
                label: r.gone ? T.notInClassesRanks(r.name) : r.name,
                content: (
                  <>
                    <Belt belt={r} />
                    <span>{r.gone ? T.notInClassesRanks(r.name) : r.name}</span>
                  </>
                ),
              }))}
              onChange={(rankId) => onChange({ rankId })}
            />
          ) : (
            <p className="field-hint">{T.PICK_CLASS_FIRST}</p>
          )}
          {check.beltError && <Notice>{check.beltError}</Notice>}
          {rank && (isAdd || beltChanged) && <p className="field-hint ev-testing-line">{T.privateTestingForLine(rank.name, toName, cls.name)}</p>}
          {priceHint && <p className="field-hint">{priceHint}</p>}
          {priceNotice}
          {clearsLine}
          {/* Staff after the private day: the result is locked, so are class and belt (G8). */}
          {beltLocked && <Notice>{T.STUDENT_LOCKED}</Notice>}
        </div>

        {isAdd && (
          <>
            <div className="field">
              <label className="cbrow" htmlFor={`${idBase}-stripes`}>
                <input
                  id={`${idBase}-stripes`}
                  type="checkbox"
                  className="cb"
                  checked={values.stripes}
                  disabled={readOnly}
                  aria-invalid={check.stripesError ? true : undefined}
                  onChange={(changeEvent) => onChange({ stripes: changeEvent.target.checked })}
                />
                <span>{T.THREE_STRIPES}</span>
              </label>
              {check.stripesError && <Notice>{check.stripesError}</Notice>}
            </div>
            <div className="field">
              <span id={`${idBase}-pay-label`} className="field-label">
                {T.PAYING_BY_LABEL}
              </span>
              <div>
                <ChoiceGroup
                  labelId={`${idBase}-pay-label`}
                  value={values.payingBy}
                  readOnly={readOnly}
                  options={['cash', 'check', 'card'].map((key) => ({ key, label: T.payingByText(key) }))}
                  onChange={(payingBy) => onChange({ payingBy })}
                />
              </div>
              {check.payingError && <Notice>{check.payingError}</Notice>}
            </div>
            <DayTimeFields
              idBase={idBase}
              values={{ day: values.day ?? '', time: values.time ?? '' }}
              check={check.dayTime}
              readOnly={readOnly}
              today={today}
              onChange={onChange}
              onTouch={onTouch}
            />
            {rank && (
              // The private price of the chosen belt, from Classes and ranks — never typed (Q3)
              <div className="pv-price">
                <p className="pv-price-line">{T.privatePriceLine(rank.privateCents)}</p>
                <p className="pv-price-hint">{T.privatePriceHint(rank.name, rank.privateCents)}</p>
              </div>
            )}
            <p className="field-hint">{T.ADD_PRIVATE_HINT}</p>
          </>
        )}

        {isPhone && noteBlock}
        {isPhone ? (
          <div className="dialog-page-submit">{saveButton}</div>
        ) : (
          <div className="dialog-footer">
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={onCancel}>
                {T.CANCEL}
              </button>
              {saveButton}
            </div>
            {noteBlock}
          </div>
        )}
      </form>
    </Dialog>
  );
}
