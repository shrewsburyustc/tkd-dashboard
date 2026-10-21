// MoveToPrivateDialog.jsx — "Move to private testing" from an event's Students tab (mockup P5,
// contract 0014 §5.5, rulebook v0.402–v0.404).
// Why it exists: a registered student can't come on the testing day and will test privately
// instead. Moving takes them off the event (they are listed under Removed there as "Moved to
// private testing, Tue, Dec 1") and adds a private testing on the Private testing tab with their
// name, class and belt filled in — and their payment moves with them (a transfer, not a refund).
// The dialog asks for the Day and Time (DayTimeFields) and shows the money before saving:
//   paid less than the private price → "$65 paid → $85 private price · $20 more to collect"
//   not paid                         → "$85 private price · not paid yet"
//   paid enough                      → "Already paid $85. Nothing more to collect."
// then "The $65 cash payment moves with Ava. The private price for Yellow in Classes and ranks."
// A testing-day No show gets an amber note first: moving clears that result (logged).
// All staff, any time (v0.404). The private price is TODAY's price in Classes and ranks (v0.404).
// Follows "Hide private details" (v0.506, v0.507 Q2): while `hidden` is on, the money box says
// only "Payment details are hidden on this tablet." (no price, no amount, no paid / not paid).
// This file only DRAWS; EventPage keeps the values and saves.
import { IconArrowRight } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { moveMoney } from '../../../lib/testing/privateRules.js';
import DayTimeFields, { checkDayTime } from '../private/DayTimeFields.jsx';
import * as T from '../text.js';

export function isMoveDirty(state) {
  return state.values.day !== state.initial.day || state.values.time !== state.initial.time;
}

export function checkMove(state, { today }) {
  const fields = checkDayTime(state.values, { today, touched: state.touched, triedSave: state.triedSave, pastDay: state.pastDay ?? null });
  return { ...fields, canSave: fields.valid && !state.saving && !state.blocked };
}

const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'MOVE_HAS_RESULT'];

// props: state (EventPage's dialog: values { day, time }, priceCents, payments [{ cents, method }],
// note …), record (the registration row), className, rankName, toName, event, today, isPhone,
// onChange, onTouch, onSave(canSave), onCancel, onRequestClose
export default function MoveToPrivateDialog({ state, record, className, rankName, toName, event, today, hidden = false, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const idBase = `move-dialog-${state.key}`;
  const check = checkMove(state, { today });
  const first = record.firstName;
  const money = moveMoney({ paidCents: record.paidCents, privateCents: state.priceCents });
  let moneyLine;
  if (money.kind === 'owes') moneyLine = T.moveMoneyOwes(record.paidCents, state.priceCents, money.dueCents);
  else if (money.kind === 'enough') moneyLine = T.moveMoneyEnough(record.paidCents);
  else moneyLine = T.moveMoneyNotPaid(state.priceCents);

  const notes = {
    UNSAVED: T.UNSAVED,
    STALE_DIALOG: isPhone ? T.STALE_DIALOG_PHONE : T.STALE_DIALOG,
    MOVE_HAS_RESULT: T.moveHasResult(first),
    INVALID_DIALOG: T.INVALID_DIALOG,
    SAVE_FAILED: T.SAVE_FAILED,
  };
  const noteBlock = state.note && (
    <div className="tdialog-note">
      <Notice>
        {notes[state.note]}
        {isPhone && PHONE_DISCARD_NOTES.includes(state.note) && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );
  const moveButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${check.canSave ? '' : ' is-unavailable'}`}
      aria-disabled={check.canSave ? undefined : 'true'}
    >
      {/* ti-arrow-right = move to private testing */}
      <IconArrowRight size={16} aria-hidden="true" />
      {state.saving ? T.SAVING : T.MOVE_TO_PRIVATE}
    </button>
  );

  return (
    <Dialog title={T.MOVE_TO_PRIVATE} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.privateDialogSub(T.studentLabel(record), className, rankName, toName)}</p>
      <form
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          onSave(check.canSave);
        }}
        noValidate
        className="pv-form"
      >
        <p className="field-hint pv-intro">{T.moveIntro(first, event.name)}</p>
        <DayTimeFields idBase={idBase} values={state.values} check={check} readOnly={state.saving} today={today} autoFocus onChange={onChange} onTouch={onTouch} />
        <div className="pv-price">
          {hidden ? (
            <p className="pv-price-hint">{T.PAYMENT_DETAILS_HIDDEN}</p>
          ) : (
            <>
              <p className="pv-price-line">{moneyLine}</p>
              <p className="pv-price-hint">{T.movePaymentHint(state.payments, first, rankName)}</p>
            </>
          )}
        </div>
        {record.result === 'no_show' && (
          <div className="pv-clearing">
            <Notice>{T.moveClearsNoShow(first, event.testingDate)}</Notice>
          </div>
        )}
        {isPhone && noteBlock}
        {isPhone ? (
          <div className="dialog-page-submit">{moveButton}</div>
        ) : (
          <div className="dialog-footer">
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={onCancel}>
                {T.CANCEL}
              </button>
              {moveButton}
            </div>
            {noteBlock}
          </div>
        )}
      </form>
    </Dialog>
  );
}
