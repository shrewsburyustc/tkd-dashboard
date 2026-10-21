// PrivateDialog.jsx — "Set private testing" / "Change private day or time" (Private screen 2, v0.149;
// gap mockup G9).
// Why it exists: a student who can't make the testing day tests privately on their own day and time,
// stays a candidate in the event and pays the private fee (v0.148). Staff set it from the row's ⋯:
//   Day   the dashboard calendar (today or later — PROPOSAL; the database decides what it accepts)
//   Time  15-minute steps, 8:00 AM–8:00 PM (the same list as an event's Start time)
//   a gray line saying the fee becomes the private fee ("$160 (was $140)") — while "Hide private
//   details" is on: "The private fee applies. Fees are hidden on this tablet." (G9)
// The fees shown are the event's own prices for this Dan (privateCents from the roster) and the fee
// the database worked out (expectedFeeCents); the screen never works one out.
import Dialog from '../../../../components/Dialog.jsx';
import Notice from '../../../../components/Notice.jsx';
import DatePicker from '../../../../components/DatePicker.jsx';
import { isIsoDate } from '../../../../lib/testing/eventRules.js';
import { startTimeIsValid, startTimeOptions } from '../../../../lib/star/starEventRules.js';
import { yearRange } from '../../../../lib/star/eventDateRules.js';
import StarSelect from '../events/StarSelect.jsx';
import { Footer } from './dialogParts.jsx';
import * as T from './text.js';

const TIME_CHOICES = startTimeOptions();

export function isPrivateDirty(state) {
  return state.values.day !== state.initial.day || state.values.time !== state.initial.time;
}

export function checkPrivate(state, today) {
  const { values, triedSave } = state;
  const dayOk = isIsoDate(values.day) && (values.day >= today || values.day === state.initial.day);
  const timeOk = startTimeIsValid(values.time);
  const valid = dayOk && timeOk;
  return {
    dayError: !dayOk && triedSave ? T.CHOOSE_DAY : null,
    timeError: !timeOk && triedSave ? T.CHOOSE_TIME : null,
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved: valid && state.mode === 'change' && !isPrivateDirty(state),
    payload: valid ? { privateOn: values.day, privateTime: values.time } : null,
  };
}

export default function PrivateDialog({ state, candidate, testingDate, today, hidden, isPhone, onChange, onSave, onCancel, onRequestClose }) {
  const idBase = `star-private-${state.key}`;
  const check = checkPrivate(state, today);
  const readOnly = state.saving;
  const year = Number(today.slice(0, 4));
  let feeLine;
  if (hidden) feeLine = T.PRIVATE_FEE_HIDDEN;
  else if (state.mode === 'change') feeLine = T.privateFeeKept(candidate.privateCents);
  else feeLine = T.privateFeeLine(candidate.privateCents, candidate.expectedFeeCents);
  return (
    <Dialog title={state.mode === 'change' ? T.CHANGE_PRIVATE_TITLE : T.SET_PRIVATE_TITLE} fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.privateSub(candidate, testingDate)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
        noValidate
      >
        <div className="field">
          <span id={`${idBase}-day-label`} className="field-label">
            {T.DAY}
          </span>
          <DatePicker
            id={`${idBase}-day`}
            label={T.DAY}
            value={state.values.day}
            today={today}
            min={today}
            years={yearRange(year, year + 1)}
            hint={T.PRIVATE_DAY_HINT}
            placeholder={T.CHOOSE}
            disabled={readOnly}
            invalid={Boolean(check.dayError)}
            describedBy={check.dayError ? `${idBase}-day-error` : undefined}
            inline={isPhone}
            onChange={(day) => onChange({ day })}
          />
          {check.dayError && <Notice id={`${idBase}-day-error`}>{check.dayError}</Notice>}
        </div>
        <div className="field">
          <span id={`${idBase}-time-label`} className="field-label">
            {T.TIME}
          </span>
          <StarSelect
            id={`${idBase}-time`}
            labelId={`${idBase}-time-label`}
            describedBy={check.timeError ? `${idBase}-time-error` : undefined}
            value={state.values.time}
            options={TIME_CHOICES}
            placeholder={T.CHOOSE}
            readOnly={readOnly}
            invalid={Boolean(check.timeError)}
            onChange={(time) => onChange({ time })}
          />
          {check.timeError && <Notice id={`${idBase}-time-error`}>{check.timeError}</Notice>}
        </div>
        <p className="field-hint">{feeLine}</p>
        <Footer saving={state.saving} canSave={check.canSave} note={state.note} isPhone={isPhone} onCancel={onCancel} />
      </form>
    </Dialog>
  );
}
