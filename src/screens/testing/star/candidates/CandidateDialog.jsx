// CandidateDialog.jsx — New candidate, the candidate's detail summary, and Edit details.
// Why it exists: Candidates screens 6, 8 and 9 (v0.111, v0.112) and gap mockups G5–G8 (v0.507–v0.508).
//   mode 'new'   New candidate at the desk: First / Last name, Date of birth (optional — the dashboard
//                calendar with the family form's look), School, Email for results (required),
//                Current Dan, Stars now ("Testing for 2 stars."), Paying by. No "Paid now" (OPEN-19).
//   mode 'view'  a read-only summary: Candidate · Registration · Payment · History, with Close and
//                Edit details. Date of birth and email come ONLY from loadCandidateDetail (v0.160).
//   mode 'edit'  the same dialog as fields (name, date of birth, school, email, Dan, stars); the
//                Registration and Payment parts stay read-only ("Payment is changed with Record
//                payment or the ⋯ menu."). Cancel goes back to the summary.
// While "Hide private details" is on (v0.506, G6, G8): Date of birth and Email read "Hidden on this
// tablet" (in Edit: gray boxes, with "Change the date of birth or email at the desk."; Save sends
// the stored values unchanged); the Payment part is one line "Payment details are hidden on this
// tablet."; for staff the Current Dan is grayed on EVERY row with "Change the Dan at the desk."
// (v0.508, so it never shows who has paid). New candidate can't be opened then (G8).
// Staff on a paid row (switch off): Current Dan grayed with "Only an admin can change the Dan after a
// payment is recorded." (G2, S8). An admin changing the Dan sees the new Dan's fee and that a recorded
// payment stays (G2); the database then asks for the grades confirmation (grades_exist).
// The values live in CandidatesTab (`state`), so a screen lock never loses them.
import { IconEdit } from '@tabler/icons-react';
import Dialog from '../../../../components/Dialog.jsx';
import Notice from '../../../../components/Notice.jsx';
import DatePicker from '../../../../components/DatePicker.jsx';
import { nameProblem, normalizeName } from '../../../../lib/testing/names.js';
import { isIsoDate } from '../../../../lib/testing/eventRules.js';
import { starEmailIsValid, trimEmail } from '../../../../lib/star/candidatesApi.js';
import { yearRange } from '../../../../lib/star/eventDateRules.js';
import ChoiceGroup from '../../events/ChoiceGroup.jsx';
import StarSelect from '../events/StarSelect.jsx';
import CandidateHistory from './CandidateHistory.jsx';
import { Footer, NoteBlock } from './dialogParts.jsx';
import * as T from './text.js';

const SCHOOL_CHOICES = T.SCHOOL_CODES.map((code) => ({
  value: code,
  label: T.schoolName(code),
}));
const METHODS = ['cash', 'check', 'card'];

// ----- Checking the form (new and edit) -----
export function isCandidateDirty(state) {
  const a = state.values;
  const b = state.initial;
  return ['firstName', 'lastName', 'dateOfBirth', 'locationCode', 'email', 'dan', 'starsFrom', 'payingBy'].some((k) => a[k] !== b[k]);
}

function nameError(text, touched) {
  const problem = nameProblem(text);
  if (!problem) return null;
  if (problem === 'empty') return touched ? 'empty' : null;
  return problem === 'tooLong' ? T.NAME_TOO_LONG : T.NAME_BAD_CHAR;
}

// copy: the event's own rubric copy (dans with label and starLimit). hidden: Hide private details.
export function checkCandidateForm(state, copy, today, hidden) {
  const { values, touched, triedSave, mode } = state;
  const show = (field) => touched[field] || triedSave;
  let firstError = nameError(values.firstName, show('firstName'));
  if (firstError === 'empty') firstError = T.ENTER_FIRST_NAME;
  let lastError = nameError(values.lastName, show('lastName'));
  if (lastError === 'empty') lastError = T.ENTER_LAST_NAME;
  const dobNeeded = mode === 'edit' && state.source === 'form'; // a family-form row keeps its date of birth
  const dobOk = values.dateOfBirth ? isIsoDate(values.dateOfBirth) && values.dateOfBirth <= today : !dobNeeded;
  const email = trimEmail(values.email ?? '');
  let emailError = null;
  if (!hidden || mode === 'new') {
    if (email === '') emailError = show('email') ? T.ENTER_EMAIL : null;
    else if (!starEmailIsValid(email)) emailError = show('email') ? T.EMAIL_PROBLEM : null;
  }
  const emailOk = hidden && mode === 'edit' ? true : email !== '' && starEmailIsValid(email);
  const schoolOk = T.SCHOOL_CODES.includes(values.locationCode);
  const dan = (copy?.dans ?? []).find((d) => d.dan === values.dan) ?? null;
  const starsOk = dan !== null && Number.isInteger(values.starsFrom) && values.starsFrom >= 0 && values.starsFrom < dan.starLimit;
  const payingOk = mode !== 'new' || METHODS.includes(values.payingBy);
  const valid = !nameProblem(values.firstName) && !nameProblem(values.lastName) && dobOk && emailOk && schoolOk && dan !== null && starsOk && payingOk;
  return {
    firstError,
    lastError,
    emailError,
    schoolError: !schoolOk && triedSave ? T.CHOOSE_SCHOOL : null,
    danError: dan === null && triedSave ? T.CHOOSE_DAN : null,
    starsError: dan !== null && !starsOk && triedSave ? T.CHOOSE_STARS : null,
    dobError: !dobOk && triedSave ? T.DOB_NEEDED : null,
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved: mode === 'edit' && valid && !isCandidateDirty(state),
    payload: valid
      ? {
          firstName: normalizeName(values.firstName),
          lastName: normalizeName(values.lastName),
          dateOfBirth: values.dateOfBirth || null,
          email: hidden && mode === 'edit' ? state.initial.email : email,
          locationCode: values.locationCode,
          dan: values.dan,
          starsFrom: values.starsFrom,
          payingBy: values.payingBy,
        }
      : null,
  };
}

// ----- The read-only summary parts -----
function Row({ label, children }) {
  return (
    <div className="ev-sum-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Hidden() {
  return <span className="st-hidden-value">{T.HIDDEN_ON_THIS_TABLET}</span>;
}

// "Ticked and signed · View signature" / "… · signature removed …" / "Not signed here (added at the desk)"
function Acknowledgment({ detail, onViewSignature, focusLink }) {
  const sig = detail.signature;
  if (sig.state === 'on_file') {
    return (
      <>
        {T.TICKED_AND_SIGNED} ·{' '}
        {/* Back from the signature, focus returns to this link (data-autofocus, G5). */}
        <button type="button" className="link-button st-inline-link" data-autofocus={focusLink ? true : undefined} onClick={onViewSignature}>
          {T.VIEW_SIGNATURE}
        </button>
      </>
    );
  }
  if (sig.state === 'removed') return `${T.TICKED_AND_SIGNED} · ${T.signatureRemoved(sig.signatureDeletedAt)}`;
  return T.NOT_SIGNED_HERE;
}

// The Payment part's "Payment" line, worked out only from what the database sent.
function paymentText(detail, row) {
  if (row.isMakeup || detail.feeKind === 'none') return T.MAKEUP_NO_FEE_DETAIL;
  const live = detail.payments.filter((p) => !p.reversed && p.kind !== 'reversal');
  const pay = [...live].reverse().find((p) => p.kind === 'payment');
  const refunds = live.filter((p) => p.kind === 'refund');
  if (detail.paidCents > 0 && pay) {
    const parts = [T.paidDetail(pay.amountCents, pay.method, pay.paidOn)];
    for (const r of refunds) parts.push(T.refundedDetail(Math.abs(r.amountCents), r.method, r.paidOn));
    let text = parts.join(' · ');
    if (detail.overpaidCents > 0) text += ` · ${T.overpaidText(detail.overpaidCents)}`;
    return text;
  }
  if (detail.feeKind === 'private') return T.notPaidPrivate(row.privateCents);
  if (detail.feeKind === 'same_day') return T.notPaidSameDay(row.sameDayCents);
  return T.notPaidDetail(row.standardCents, row.sameDayCents);
}

function RegistrationPart({ detail, onViewSignature, focusLink = false }) {
  const c = detail.candidate;
  return (
    <section className="st-detail-part">
      <h3 className="st-detail-head">{T.SECTION_REGISTRATION}</h3>
      <dl className="ev-sum">
        <Row label={T.REGISTERED}>{T.registeredDetail(c.registeredAt, c.source)}</Row>
        {c.reference && <Row label={T.REFERENCE}>{c.reference}</Row>}
        <Row label={T.ACKNOWLEDGMENT}>
          <Acknowledgment detail={detail} onViewSignature={onViewSignature} focusLink={focusLink} />
        </Row>
      </dl>
    </section>
  );
}

function PaymentPart({ detail, row, hidden }) {
  return (
    <section className="st-detail-part">
      <h3 className="st-detail-head">{T.SECTION_PAYMENT}</h3>
      {hidden ? (
        <p className="st-hidden-value st-hidden-line">{T.PAYMENT_DETAILS_HIDDEN}</p>
      ) : row.isMakeup || detail.feeKind === 'none' ? (
        // A make-up has no fee: one plain line under the heading, not "Payment" a second time
        <p className="st-hidden-line">{T.MAKEUP_NO_FEE_DETAIL}</p>
      ) : (
        <dl className="ev-sum">
          {!row.isMakeup && row.payingBy && <Row label={T.PAYING_BY}>{T.payingByDetail(row.payingBy, row.source)}</Row>}
          <Row label={T.PAYMENT}>{paymentText(detail, row)}</Row>
        </dl>
      )}
    </section>
  );
}

// ----- The dialog -----
export default function CandidateDialog({
  state, // see CandidatesTab: openNew / openView / openEdit
  row, // the roster row (Candidate) — null for New candidate
  event, // the StarEvent (name, testingDate)
  copy, // the event's rubric copy (Dans)
  today,
  hidden, // Hide private details
  isAdmin,
  isPhone,
  subjectNames, // (row) => make-up subject names
  onChange,
  onTouch,
  onSave,
  onCancel,
  onRequestClose,
  onEdit,
  onViewSignature,
  onShowAllHistory,
  onRetryDetail,
}) {
  const { mode } = state;
  const idBase = `star-cand-${state.key}`;
  const detail = state.detail; // loadCandidateDetail's answer (view / edit)
  const values = state.values;

  // ===== View =====
  if (mode === 'view') {
    const name = row ? T.candidateName(row) : '';
    let body;
    if (state.loadFailed) {
      body = <NoteBlock note={{ text: T.LOAD_DETAIL_FAILED }} isPhone={false} onCancel={onCancel} />;
    } else if (!detail) {
      body = (
        <div className="tskeleton" aria-busy="true">
          <span className="visually-hidden">{T.LOADING_EVENT}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="tskeleton-row" aria-hidden="true">
              <span className="tskeleton-bar" />
            </div>
          ))}
        </div>
      );
    } else {
      const c = detail.candidate;
      body = (
        <>
          <section className="st-detail-part">
            <h3 className="st-detail-head">{T.SECTION_CANDIDATE}</h3>
            <dl className="ev-sum">
              <Row label={T.NAME}>{T.candidateName(c)}</Row>
              <Row label={T.DOB}>{hidden ? <Hidden /> : c.dateOfBirth ? `${T.monthDayYear(c.dateOfBirth)}${T.ageText(c.ageOnTestingDay)}` : '—'}</Row>
              <Row label={T.EMAIL}>{hidden ? <Hidden /> : (c.emailForResults ?? '—')}</Row>
              <Row label={T.SCHOOL_LABEL}>{T.schoolName(c.locationCode)}</Row>
              <Row label={T.COL_TESTING_FOR}>{T.testingForLong(row ?? c)}</Row>
              {row?.isMakeup && <Row label={T.MAKEUP}>{T.makeupDetail(row.makeupOfEventName ?? '', subjectNames(row))}</Row>}
              {row?.privateOn && <Row label={T.PRIVATE}>{T.privateDetail(row.privateOn, row.privateTime)}</Row>}
            </dl>
          </section>
          <RegistrationPart detail={detail} onViewSignature={onViewSignature} focusLink={Boolean(state.focusSig)} />
          <PaymentPart detail={detail} row={row} hidden={hidden} />
          <section className="st-detail-part">
            <h3 className="st-detail-head">{T.SECTION_HISTORY}</h3>
            <CandidateHistory rows={state.history} hidden={hidden} showAll={state.historyAll} onShowAll={onShowAllHistory} />
          </section>
        </>
      );
    }
    const editButton = (
      <button
        type="button"
        className={`btn btn-primary${isPhone ? ' btn-block' : ''}`}
        aria-disabled={!detail || row?.status === 'withdrawn' ? 'true' : undefined}
        onClick={() => detail && row?.status !== 'withdrawn' && onEdit()}
      >
        {/* ti-edit = edit */}
        <IconEdit size={16} aria-hidden="true" />
        {T.EDIT_DETAILS}
      </button>
    );
    return (
      <Dialog title={name} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
        <p className="tdialog-sub">{T.detailSub(event.name, row?.locationCode)}</p>
        {body}
        {state.loadFailed && (
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onRetryDetail}>
              {T.RETRY}
            </button>
          </div>
        )}
        {isPhone ? (
          <div className="dialog-page-submit st-view-actions">
            {editButton}
            <button type="button" className="btn btn-block" onClick={onCancel}>
              {T.CLOSE}
            </button>
          </div>
        ) : (
          <div className="dialog-footer">
            <div className="dialog-actions">
              <button type="button" className="btn" data-autofocus onClick={onCancel}>
                {T.CLOSE}
              </button>
              {editButton}
            </div>
          </div>
        )}
      </Dialog>
    );
  }

  // ===== New / Edit =====
  const check = checkCandidateForm(state, copy, today, hidden);
  const readOnly = state.saving;
  const isNew = mode === 'new';
  const dans = copy?.dans ?? [];
  const danChoices = dans.map((d) => ({ value: d.dan, label: d.label }));
  const dan = dans.find((d) => d.dan === values.dan) ?? null;
  const starChoices = dan
    ? Array.from({ length: dan.starLimit }, (_, n) => ({
        value: n,
        label: T.starsText(n),
      }))
    : [];
  const year = Number(today.slice(0, 4));
  // The Current Dan: grayed for staff while details are hidden (every row) or on a paid row (G2, G8).
  let danLock = null;
  if (!isNew && !isAdmin && hidden) danLock = T.DAN_AT_DESK_HINT;
  else if (!isNew && !isAdmin && row?.paid) danLock = T.DAN_NEEDS_ADMIN;
  // An admin changing the Dan: the new Dan's fee of the same kind, and that a payment stays (G2).
  let danFee = null;
  if (!isNew && !hidden && row && dan && values.dan !== state.initial.dan) {
    const kindCents = {
      standard: dan.standardCents,
      same_day: dan.sameDayCents,
      private: dan.privateCents,
    }[row.feeKind];
    if (Number.isFinite(kindCents)) danFee = T.danFeeLine(dan.label, kindCents, row.paid ? row.paidCents : 0);
  }
  const field = (id, label, input, error, hint) => (
    <div className="field">
      {label}
      {input}
      {error && <Notice id={`${id}-error`}>{error}</Notice>}
      {!error && hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
  const labelSpan = (id, text) => (
    <span id={`${id}-label`} className="field-label">
      {text}
    </span>
  );
  const textInput = (id, key, err, extra = {}) => (
    <input
      id={id}
      className="input"
      type="text"
      autoComplete="off"
      readOnly={readOnly}
      value={values[key] ?? ''}
      aria-invalid={err ? true : undefined}
      aria-describedby={err ? `${id}-error` : undefined}
      onChange={(e) => {
        onChange({ [key]: e.target.value });
        onTouch(key);
      }}
      {...extra}
    />
  );

  return (
    <Dialog title={isNew ? T.NEW_CANDIDATE_TITLE : T.candidateName(row)} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{isNew ? T.newCandidateSub(event.name) : T.detailSub(event.name, row.locationCode)}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        noValidate
      >
        {/* Above phone width the fields go in pairs, as drawn (Candidates screen 9, G2, G8):
            first / last name · date of birth / school · email (full width) · Dan / stars. */}
        <div className="st-two">
          {field(
            `${idBase}-first`,
            <label htmlFor={`${idBase}-first`}>{T.FIRST_NAME}</label>,
            // Focus starts here, except back from "Keep 1st Dan" (G2): then on Current Dan.
            textInput(`${idBase}-first`, 'firstName', check.firstError, state.focusDan ? {} : { 'data-autofocus': true }),
            check.firstError,
          )}
          {field(`${idBase}-last`, <label htmlFor={`${idBase}-last`}>{T.LAST_NAME}</label>, textInput(`${idBase}-last`, 'lastName', check.lastError), check.lastError)}
        </div>
        <div className="st-two">
          {hidden && !isNew
            ? field(`${idBase}-dob`, labelSpan(`${idBase}-dob`, T.DOB), <div className="input st-hidden-box">{T.HIDDEN_ON_THIS_TABLET}</div>, null, null)
            : field(
                `${idBase}-dob`,
                labelSpan(`${idBase}-dob`, isNew || state.source !== 'form' ? T.DOB_OPTIONAL : T.DOB),
                <DatePicker
                  id={`${idBase}-dob`}
                  label={isNew || state.source !== 'form' ? T.DOB_OPTIONAL : T.DOB}
                  value={values.dateOfBirth}
                  today={today}
                  max={today}
                  years={yearRange(year - 80, year)}
                  hint={T.DOB_CALENDAR_HINT}
                  placeholder={T.CHOOSE}
                  disabled={readOnly}
                  invalid={Boolean(check.dobError)}
                  describedBy={`${idBase}-dob-hint`}
                  inline={isPhone}
                  onChange={(dateOfBirth) => onChange({ dateOfBirth })}
                />,
                check.dobError,
                isNew || state.source !== 'form' ? T.DOB_OPTIONAL_HINT : null,
              )}
          {field(
            `${idBase}-school`,
            labelSpan(`${idBase}-school`, T.SCHOOL_LABEL),
            <StarSelect
              id={`${idBase}-school`}
              labelId={`${idBase}-school-label`}
              value={values.locationCode}
              options={SCHOOL_CHOICES}
              placeholder={T.CHOOSE}
              readOnly={readOnly}
              invalid={Boolean(check.schoolError)}
              describedBy={check.schoolError ? `${idBase}-school-error` : !isNew ? `${idBase}-school-hint` : undefined}
              onChange={(locationCode) => onChange({ locationCode })}
            />,
            check.schoolError,
            isNew ? null : T.SCHOOL_HINT,
          )}
        </div>
        {hidden && !isNew
          ? field(`${idBase}-email`, labelSpan(`${idBase}-email`, T.EMAIL), <div className="input st-hidden-box">{T.HIDDEN_ON_THIS_TABLET}</div>, null, T.HIDDEN_EDIT_HINT)
          : field(
              `${idBase}-email`,
              <label htmlFor={`${idBase}-email`}>{T.EMAIL}</label>,
              textInput(`${idBase}-email`, 'email', check.emailError, {
                type: 'email',
                inputMode: 'email',
              }),
              check.emailError,
            )}
        <div className="st-two">
          {field(
            `${idBase}-dan`,
            labelSpan(`${idBase}-dan`, T.CURRENT_DAN),
            <StarSelect
              id={`${idBase}-dan`}
              labelId={`${idBase}-dan-label`}
              value={values.dan}
              options={danChoices}
              placeholder={T.CHOOSE}
              readOnly={readOnly || Boolean(danLock)}
            autoFocus={Boolean(state.focusDan)}
              invalid={Boolean(check.danError)}
              describedBy={danLock || danFee ? `${idBase}-dan-hint` : undefined}
              onChange={(next) => {
                const limit = dans.find((d) => d.dan === next)?.starLimit ?? 0;
                onChange({
                  dan: next,
                  starsFrom: values.starsFrom !== null && values.starsFrom < limit ? values.starsFrom : null,
                });
              }}
            />,
            check.danError,
            danLock ?? danFee,
          )}
          {field(
            `${idBase}-stars`,
            labelSpan(`${idBase}-stars`, T.STARS_NOW),
            <StarSelect
              id={`${idBase}-stars`}
              labelId={`${idBase}-stars-label`}
              value={values.starsFrom}
              options={starChoices}
              placeholder={T.CHOOSE}
              readOnly={readOnly || !dan}
              invalid={Boolean(check.starsError)}
              describedBy={`${idBase}-stars-hint`}
              onChange={(starsFrom) => onChange({ starsFrom })}
            />,
            check.starsError,
            Number.isInteger(values.starsFrom) ? T.testingForHint(values.starsFrom + 1) : null,
          )}
        </div>
        {isNew && (
          <div className="field">
            <span id={`${idBase}-paying`} className="field-label">
              {T.PAYING_BY}
            </span>
            <div>
              <ChoiceGroup
                labelId={`${idBase}-paying`}
                value={values.payingBy}
                readOnly={readOnly}
                describedBy={`${idBase}-paying-hint`}
                options={METHODS.map((key) => ({
                  key,
                  label: T.payingByText(key),
                }))}
                onChange={(payingBy) => onChange({ payingBy })}
              />
            </div>
            <p id={`${idBase}-paying-hint`} className="field-hint">
              {T.PAYING_BY_HINT}
            </p>
          </div>
        )}
        {!isNew && detail && (
          <>
            <RegistrationPart detail={detail} onViewSignature={onViewSignature} />
            <PaymentPart detail={detail} row={row} hidden={hidden} />
            {!hidden && !row.isMakeup && <p className="field-hint">{T.PAYMENT_EDIT_NOTE}</p>}
          </>
        )}
        <Footer saving={state.saving} canSave={check.canSave} note={state.note} isPhone={isPhone} onCancel={onCancel} />
      </form>
    </Dialog>
  );
}
