// StudentDialog.jsx — one dialog for a student on the event page, in three modes:
//   'add'   Add student (R4) — walk-ins or families who couldn't use the form: first and last
//           name, Class (tap buttons), Current belt (belt-picture buttons), the 3-stripes tick,
//           Paying by Cash / Check / Card. Staff and admins (Star v0.110 / Q9).
//   'view'  the student's read-only summary (R6, Star v0.112): class and time, testing for,
//           3 stripes, registered, paying by, payment, signed by — with Close and Edit details
//   'edit'  Edit details (R6): names, class and current belt. Changing the belt or class shows
//           the new "Testing for" and fee at once. Payment is NOT changed here.
// PC and tablet: a centered dialog. Phone: a full screen with a back arrow.
//
// Phase 3 (G8, contract 0010 §4.7): the summary shows the student's Result (tag, when and by
// whom, the note) and the "Added … (admin)" line; Edit details warns that changing the belt or
// class of a graded student clears their result, and — for staff after the testing day — keeps
// the class and belt choices locked ("Only an admin can change this student now.").
//
// Phase 4 (contract 0014 §5.6, §5.7; mockups P3b, P4):
//   - Add student has a "Tests privately" tick under Paying by. Ticked, the private Day, Time and
//     the price box appear (indented under the tick), and Save adds the student already private.
//   - Edit details of a private student uses the PRIVATE price in its fee sentence; a paid private
//     student moved to a pricier rank gets the amber "Price $85 → $95 · $10 more to collect".
//   - The summary shows the private day / time / price, what is still to collect, and every
//     payment when there are two or more (a top-up).
//
// Like the other dialogs, this only DRAWS the form; the values live in EventPage (`state`), so a
// screen lock hides the dialog and brings it back with everything still filled in.
import { IconCheck, IconEdit } from '@tabler/icons-react';
import Belt from '../../../components/Belt.jsx';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { nameProblem, normalizeName } from '../../../lib/testing/names.js';
import { amountDue, classTimeLabel, priceFor } from '../../../lib/testing/eventRules.js';
import ChoiceGroup from '../events/ChoiceGroup.jsx';
import { PrivateFields, PrivatePriceBox, checkPrivateFields } from './PrivateDialog.jsx';
import { ResultTag } from './ResultButtons.jsx';
import * as T from '../text.js';

// ----- Small helpers shared with the roster -----

// The fee text for a rank: "$65 ($75 on the testing day)" before the testing day, "$75" on it.
export function feeTextFor(rank, today, testingDate) {
  if (!rank) return '';
  return T.feeText(rank.earlyCents, rank.dayCents, today >= testingDate);
}

// "Yellow → Orange" with both belt pictures (or "Deputy → No new rank").
// Each belt stays on one line with its name ("[belt] Yellow →" and "[belt] Orange"): when the
// column is narrow the line breaks only between the two, never between a belt and its name.
export function TestingForCell({ rank }) {
  if (!rank) return null;
  const next = rank.testingFor;
  return (
    <span className="ev-tf">
      <span className="ev-tf-pair">
        <Belt belt={rank} />
        <span>{rank.name}</span>
        <span aria-hidden="true">→</span>
      </span>
      <span className="visually-hidden">{T.TESTING_FOR}</span>
      {next ? (
        <span className="ev-tf-pair">
          <Belt belt={next} />
          <span>{next.name}</span>
        </span>
      ) : (
        <span className="ev-tf-none">{T.NO_NEW_RANK}</span>
      )}
    </span>
  );
}

// Did anything change since the dialog opened?
export function isStudentFormDirty(state) {
  const a = state.values;
  const b = state.initial;
  return (
    a.firstName !== b.firstName ||
    a.lastName !== b.lastName ||
    a.classId !== b.classId ||
    a.rankId !== b.rankId ||
    a.stripes !== b.stripes ||
    a.payingBy !== b.payingBy ||
    Boolean(a.privately) !== Boolean(b.privately) ||
    (a.privateDay ?? '') !== (b.privateDay ?? '') ||
    (a.privateTime ?? '') !== (b.privateTime ?? '')
  );
}

// Checks the form ('add' or 'edit'). record = the saved roster row (edit).
// dates = { today, testingDate } — for Add student's "Tests privately" Day (phase 4).
export function checkStudentForm(state, record, dates = {}) {
  const { values, touched, triedSave } = state;
  const first = normalizeName(values.firstName);
  const last = normalizeName(values.lastName);
  const firstProblem = nameProblem(values.firstName);
  const lastProblem = nameProblem(values.lastName);
  const show = (field, problem) => (problem === 'empty' ? touched[field] || triedSave : Boolean(problem));
  const firstError = show('firstName', firstProblem) ? T.studentNameProblem(firstProblem, 'first') : null;
  const lastError = show('lastName', lastProblem) ? T.studentNameProblem(lastProblem, 'last') : null;
  const classError = !values.classId && triedSave ? T.PICK_CLASS : null;
  const beltError = values.classId && !values.rankId && triedSave ? T.PICK_BELT : null;
  const isAdd = state.mode === 'add';
  const stripesError = isAdd && !values.stripes && triedSave ? T.NEEDS_THREE_STRIPES : null;
  const payingError = isAdd && !values.payingBy && triedSave ? T.PICK_PAYING_BY : null;
  // Phase 4: "Tests privately" ticked → the Day and Time must be right too (contract 0014 §5.6).
  const privately = isAdd && Boolean(values.privately);
  const privateCheck = privately
    ? checkPrivateFields(
        { day: values.privateDay ?? '', time: values.privateTime ?? '' },
        {
          today: dates.today,
          testingDate: dates.testingDate,
          touched: { day: touched.privateDay, time: touched.privateTime },
          triedSave,
          pastDay: state.pastDay ?? null,
        },
      )
    : null;
  const valid =
    !firstProblem &&
    !lastProblem &&
    values.classId &&
    values.rankId &&
    (!isAdd || (values.stripes && values.payingBy)) &&
    (!privateCheck || privateCheck.valid);
  const sameAsSaved =
    !isAdd && valid && record && first === record.firstName && last === record.lastName && values.rankId === record.eventRankId;
  const canSave = Boolean(valid) && !state.saving && !state.blocked;
  const payload = valid
    ? {
        firstName: first,
        lastName: last,
        eventRankId: values.rankId,
        stripes: values.stripes,
        payingBy: values.payingBy,
        // null = tests on the testing day (Add student as before)
        privateDate: privately ? values.privateDay : null,
        privateTime: privately ? values.privateTime : null,
      }
    : null;
  return { firstError, lastError, classError, beltError, stripesError, payingError, privateCheck, canSave, sameAsSaved, payload };
}

const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED', 'STUDENT_LOCKED'];
const NOTES = {
  UNSAVED: T.UNSAVED,
  STUDENT_LOCKED: T.STUDENT_LOCKED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.ROSTER_NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
  FINISHED: T.EVENT_FINISHED_ADD,
};

// One line of the read-only summary: gray label on the left, value on the right.
function SummaryRow({ label, children }) {
  return (
    <div className="ev-sum-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// The Payment value of the summary. parts = the student's live payments ({ cents, method,
// paidOn }, oldest first): two or more after a private top-up → all of them (plan M7).
function PaymentValue({ row, rank, event, today, parts }) {
  if (!row.paid) {
    // A private student pays the private price; a regular one the early / testing-day fee.
    const fee = row.isPrivate ? T.dollars(row.priceCents) : feeTextFor(rank, today, event.testingDate);
    return (
      <>
        <span className="ttag">{T.TAG_NOT_PAID}</span> · {fee}
      </>
    );
  }
  let text;
  const owing = row.status === 'active' && row.owesMore;
  if (parts.length > 1) text = owing ? T.paidDetailPartsOwed(row.paidCents, parts, row.amountDueCents) : T.paidDetailParts(row.paidCents, parts);
  else if (owing) text = T.paidDetailOwed(row.paidCents, row.paidMethod, row.paidOn, row.amountDueCents);
  else text = T.paidDetail(row.paidCents, row.paidMethod, row.paidOn);
  return (
    <>
      <span className="ttag ttag--ok">{T.TAG_PAID}</span> · {text}
    </>
  );
}

// The read-only summary (R6).
function Summary({ row, cls, rank, event, today, parts }) {
  const time = cls ? classTimeLabel(cls.startTime, cls.endTime) : '';
  let signed;
  if (row.source !== 'form') signed = T.NOT_SIGNED_DESK;
  else if (row.signatureDeletedAt) signed = T.signatureDeleted(row.signedAt ?? row.registeredAt);
  else signed = T.SIGNED_FORM;
  return (
    <dl className="ev-sum">
      <SummaryRow label={T.DETAIL_CLASS_TIME}>{cls ? T.classLineTitle(cls.className, time) : ''}</SummaryRow>
      <SummaryRow label={T.DETAIL_TESTING_FOR}>
        <TestingForCell rank={rank} />
      </SummaryRow>
      {row.isPrivate && (
        // Phase 4: "Private testing   [Private] Tue, Dec 1 · 4:00 PM · $85"
        <SummaryRow label={T.DETAIL_PRIVATE}>
          <span className="ttag ttag--private">{T.TAG_PRIVATE}</span> {T.privateLine(row.privateDate, row.privateTime, row.priceCents)}
        </SummaryRow>
      )}
      <SummaryRow label={T.DETAIL_STRIPES}>
        {row.stripesConfirmed ? (row.source === 'form' ? T.STRIPES_FORM : T.STRIPES_DESK) : T.STRIPES_NO}
      </SummaryRow>
      <SummaryRow label={T.DETAIL_REGISTERED}>
        {T.registeredDetail(row.registeredAt, row.source)}
        {/* "reference CB-3102" stays on one line */}
        {row.reference && (
          <>
            {' · '}
            <span className="nowrap">{`${T.REFERENCE_WORD} ${row.reference}`}</span>
          </>
        )}
        {/* Plan Q1: added by an admin after the testing day */}
        {row.addedAfterDay && <span className="ev-sum-line">{T.addedAfterDayLine(row.addedAfterDay.date, row.addedAfterDay.byName)}</span>}
      </SummaryRow>
      <SummaryRow label={T.DETAIL_PAYING_BY}>{T.payingByText(row.payingBy)}</SummaryRow>
      <SummaryRow label={T.DETAIL_PAYMENT}>
        <PaymentValue row={row} rank={rank} event={event} today={today} parts={parts} />
      </SummaryRow>
      <SummaryRow label={T.DETAIL_SIGNED}>{signed}</SummaryRow>
      {row.graded && (
        // G8: "Not passed · Nov 20, 5:41 PM by Staff", then "Note: …"
        <SummaryRow label={T.DETAIL_RESULT}>
          {row.result ? <ResultTag result={row.result} /> : <span className="gr-notrec">{T.NOT_RECORDED_YET}</span>}{' '}
          {T.resultStamp(row.resultAt, row.resultByName)}
          {row.note && <span className="ev-sum-line">{T.resultNoteLine(row.note)}</span>}
        </SummaryRow>
      )}
      {row.status === 'withdrawn' && (
        <SummaryRow label={T.DETAIL_REMOVED}>{T.removedDetail(row.withdrawnAt, row.withdrawnByName, row.withdrawnReason)}</SummaryRow>
      )}
    </dl>
  );
}

export default function StudentDialog({
  state,
  event,
  school,
  classes, // the event's classes (copies), each with ranks
  today,
  record, // view / edit: the roster row
  isPhone,
  canEdit, // show "Edit details" in the summary
  graded = null, // edit: { graded, result, note } as last read — warns that a belt change clears it
  beltLocked = false, // edit: staff after the student's own day, graded student → class and belt locked
  paymentParts = [], // view: the student's live payments [{ cents, method, paidOn }], oldest first
  onChange,
  onTouch,
  onSave,
  onEdit, // view → edit
  onCancel, // add / view: close · edit: back to the summary (or close, when opened straight in edit)
  onRequestClose,
}) {
  const mode = state.mode;
  const idBase = `student-dialog-${state.key}`;
  const values = state.values;
  const readOnly = state.saving;
  const rankById = new Map(classes.flatMap((c) => c.ranks.map((r) => [r.id, r])));
  const classById = new Map(classes.map((c) => [c.id, c]));

  // ----- View -----
  if (mode === 'view') {
    const rank = rankById.get(record.eventRankId);
    const cls = classById.get(record.eventClassId) ?? null;
    const name = T.studentLabel(record);
    const editButton = canEdit ? (
      <button type="button" className={`btn btn-primary${isPhone ? ' btn-block' : ''}`} onClick={onEdit}>
        {/* ti-edit = edit */}
        <IconEdit size={16} aria-hidden="true" />
        {T.EDIT_DETAILS}
      </button>
    ) : null;
    return (
      <Dialog title={name} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
        <p className="tdialog-sub">{event.name}</p>
        <Summary row={record} cls={cls} rank={rank} event={event} today={today} parts={paymentParts} />
        {isPhone ? (
          editButton && <div className="dialog-page-submit">{editButton}</div>
        ) : (
          <div className="dialog-actions">
            {/* Focus starts on Close: nothing changes by accident at a shared desk (Star v0.112). */}
            <button type="button" className="btn" data-autofocus onClick={onCancel}>
              {T.CLOSE}
            </button>
            {editButton}
          </div>
        )}
      </Dialog>
    );
  }

  // ----- Add / Edit -----
  const isAdd = mode === 'add';
  const check = checkStudentForm(state, record, { today, testingDate: event.testingDate });
  const cls = values.classId ? classById.get(values.classId) : null;
  const rank = values.rankId ? rankById.get(values.rankId) : null;
  const time = cls ? classTimeLabel(cls.startTime, cls.endTime) : '';
  const fee = feeTextFor(rank, today, event.testingDate);

  // "Testing for …" under the belts (Add), or "Now testing for …" when the belt changed (Edit).
  let testingLine = null;
  let repriceLine = null; // phase 4: a paid private student moved to a pricier private price
  if (rank) {
    const toName = rank.testingFor?.name ?? T.NO_NEW_RANK;
    if (isAdd) {
      testingLine = <p className="field-hint ev-testing-line">{T.testingForLine(rank.name, toName, cls.className, time, fee)}</p>;
    } else if (record && values.rankId !== record.eventRankId) {
      const oldRank = rankById.get(record.eventRankId);
      let feeSentence;
      if (record.isPrivate) {
        // Phase 4 (§5.7, Q2): a private student pays the private price. Paid and the new private
        // price is higher → the amber re-price notice; otherwise the payment stays as it is.
        const newDue = record.paid
          ? amountDue({ rank, privateDate: record.privateDate, paidCents: record.paidCents, today, testingDate: event.testingDate })
          : 0;
        if (record.paid && newDue > 0) {
          feeSentence = null;
          repriceLine = <Notice>{T.repriceLine(oldRank?.privateCents ?? record.priceCents, rank.privateCents, newDue)}</Notice>;
        } else if (record.paid) feeSentence = T.PAYMENT_STAYS;
        else if (oldRank && oldRank.privateCents === rank.privateCents) feeSentence = T.feeStays(T.dollars(rank.privateCents));
        else feeSentence = T.feeNow(T.dollars(rank.privateCents));
      } else if (record.paid) feeSentence = T.PAYMENT_STAYS;
      else if (oldRank && oldRank.earlyCents === rank.earlyCents && oldRank.dayCents === rank.dayCents) feeSentence = T.feeStays(fee);
      else feeSentence = T.feeNow(fee);
      testingLine = (
        <p className="ev-changed-line" role="status">
          {T.nowTestingFor(rank.name, toName)}
          {feeSentence ? ` ${feeSentence}` : ''}
        </p>
      );
    }
  }

  // Phase 3: a graded student whose belt or class is being changed (Edit details).
  let clearsLine = null;
  if (!isAdd && record && graded?.graded && !beltLocked && values.rankId !== record.eventRankId) {
    const first = record.firstName;
    // Phase 4: a private student records it again on their private testing page.
    let text;
    if (record.isPrivate) text = graded.result ? T.beltChangeClearsPrivate(first, T.resultTagText(graded.result)) : T.beltChangeClearsNotePrivate(first);
    else text = graded.result ? T.beltChangeClears(first, T.resultTagText(graded.result)) : T.beltChangeClearsNote(first);
    clearsLine = <Notice>{text}</Notice>;
  }
  const chooserReadOnly = readOnly || beltLocked;

  function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    onSave(check.canSave);
  }

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
  const noteBlock = state.note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && state.note === 'STALE_DIALOG' ? T.STALE_DIALOG_PHONE : NOTES[state.note]}
        {isPhone && PHONE_DISCARD_NOTES.includes(state.note) && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
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

  const title = isAdd ? T.ADD_STUDENT_TITLE : T.EDIT_DETAILS_TITLE;
  const sub = isAdd ? T.addStudentSub(event.name, school) : T.editDetailsSub(T.studentLabel(record), event.name);

  return (
    <Dialog title={title} size="medium" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{sub}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="ev-two">
          {nameField('firstName', T.FIRST_NAME, check.firstError)}
          {nameField('lastName', T.LAST_NAME, check.lastError)}
        </div>

        <div className={`field${isAdd ? '' : ' ev-belt-box'}${beltLocked ? ' ev-locked' : ''}`}>
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
            options={classes.map((c) => ({ key: c.id, label: c.className }))}
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
                label: r.name,
                content: (
                  <>
                    <Belt belt={r} />
                    <span>{r.name}</span>
                  </>
                ),
              }))}
              onChange={(rankId) => onChange({ rankId })}
            />
          ) : (
            <p className="field-hint">{T.PICK_CLASS_FIRST}</p>
          )}
          {check.beltError && <Notice>{check.beltError}</Notice>}
          {testingLine}
          {repriceLine}
          {clearsLine}
          {/* Staff after the testing day: the result is locked, so are class and belt (G8). */}
          {beltLocked && <Notice>{T.STUDENT_LOCKED}</Notice>}
        </div>

        {isAdd && (
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
        )}

        {isAdd && (
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
        )}

        {/* Phase 4 (P3b): "Tests privately" — off by default, then the dialog is exactly as before. */}
        {isAdd && (
          <div className="field pv-tick-field">
            <label className="cbrow" htmlFor={`${idBase}-privately`}>
              <input
                id={`${idBase}-privately`}
                type="checkbox"
                className="cb"
                checked={Boolean(values.privately)}
                disabled={readOnly}
                aria-describedby={`${idBase}-privately-hint`}
                onChange={(changeEvent) => onChange({ privately: changeEvent.target.checked })}
              />
              <span>{T.TESTS_PRIVATELY}</span>
            </label>
            <p id={`${idBase}-privately-hint`} className="field-hint pv-tick-hint">
              {T.testsPrivatelyHint(event.testingDate)}
            </p>
            {values.privately && (
              <div className="pv-indent">
                <PrivateFields
                  idBase={`${idBase}-private`}
                  values={{ day: values.privateDay ?? '', time: values.privateTime ?? '' }}
                  check={check.privateCheck}
                  readOnly={readOnly}
                  today={today}
                  testingDate={event.testingDate}
                  onChange={(patch) => onChange('day' in patch ? { privateDay: patch.day } : { privateTime: patch.time })}
                  onTouch={(field) => onTouch(field === 'day' ? 'privateDay' : 'privateTime')}
                />
                {/* The price now = the live "Testing for" fee by today (early before the testing day). */}
                <PrivatePriceBox
                  rank={rank}
                  currentCents={rank ? priceFor({ rank, privateDate: null, today, testingDate: event.testingDate }) : 0}
                  today={today}
                  testingDate={event.testingDate}
                />
              </div>
            )}
          </div>
        )}

        <p className="field-hint">{isAdd ? T.ADD_STUDENT_HINT : T.PAYMENT_NOT_HERE}</p>

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
