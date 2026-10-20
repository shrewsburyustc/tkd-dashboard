// AddCandidateDialog.jsx — "Add candidate" at the desk (staff and admins), from the cycle page's
// header button (or N on the PC).
// Why it exists: approved mockup Candidates 7, contract CONTRACT-0016-B2 §3.7 (rulebook v0.211,
// v0.212, v0.213). For a walk-in or a late family — it works after registration has closed.
// "Spring 2027 · for walk-ins and late families." (+ "Registration closed on Sat, Mar 27; staff
// can still add here." on PC and tablet), then the family form's fields in the form's order plus
// the two the desk needs:
//   School (Worcester / Shrewsbury; starts on this device's school, empty on Both) · First name ·
//   Last name (belt-spelling hint) · Date of birth (+ who signs the waiver) · Testing for ·
//   Kukkiwon Dan certificate · How they'll pay (plan cards) · the total line · Email for results ·
//   ☐ Waiver signed on paper ("The signed paper goes in the testing folder.")
// Add is refused until the waiver tick is on ("Tick this once the family has signed the paper
// waiver."). Due dates that have already passed count as today for a late family (S4).
// Add → toast "Ethan Park added · BB-5107" (admins also get Undo, OP-B2); the row appears in Dan
// order, and a same-name + same-birthday match shows the duplicate box.
// Layout as drawn: First and Last name side by side on the PC and tablet (stacked on phones);
// School, Testing for and Kukkiwon are joined buttons of equal width across the dialog.
// With Hide payments on (mat-side) no amount, fee or total shows (OP-B7).
import { useId } from 'react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { ageOn, scheduleFor } from '../../../lib/blackBelt/rules.js';
import Choice from '../parts/Choice.jsx';
import DateField from '../parts/DateField.jsx';
import { addProblems, dobProblem } from './checks.js';
import { PlanCards } from './ChangePlanDialog.jsx';
import { FailedBanner, Footer, PrimaryButton } from './dialogParts.jsx';
import { ICONS } from './icons.js';
import * as T from '../text.js';

const DANS = [1, 2, 3, 4];

export default function AddCandidateDialog({ state, cycle, isPhone, hidden = false, today, onChange, onSave, onCancel, onRequestClose }) {
  const id = useId();
  const v = state.values;
  const ro = state.saving;
  const problems = addProblems(v, { today, planIds: (cycle.plans ?? []).map((p) => p.id) });
  const show = (field) => (state.triedSave ? problems[field] : null);
  const err = (field) => `${id}-${field}-err`;
  const firstDay = cycle.state?.firstDay ?? cycle.days?.[0]?.date ?? null;
  const dan = DANS.includes(Number(v.dan)) ? Number(v.dan) : null;
  const fee = dan ? cycle.kukkiwon?.[dan] ?? null : null;

  const closed = cycle.state?.registration !== 'open' && cycle.applicationDue && today > cycle.applicationDue;
  const sub = closed && !isPhone ? `${T.addSub(cycle.name)} ${T.addClosedSub(cycle.applicationDue)}` : T.addSub(cycle.name);

  const age = !dobProblem(v.dob, today) && firstDay ? ageOn(v.dob, firstDay) : null;
  const dobHint = age === null ? null : age >= 18 ? T.adultHint(age) : T.MINOR_HINT;
  const plan = (cycle.plans ?? []).find((p) => p.id === v.planId) ?? null;
  const schedule = plan && dan && !hidden ? scheduleFor({ plan, dan, kukkiwon: v.kukkiwon, fees: cycle.kukkiwon, today }) : null;

  const messages = {
    school: show('school') ? T.ERR_SCHOOL : null,
    first: T.nameError(show('first'), T.ERR_FIRST),
    last: T.nameError(show('last'), T.ERR_LAST),
    dob: show('dob') ? T.ERR_DOB : null,
    dan: show('dan') ? T.ERR_DAN : null,
    plan: show('plan') ? T.ERR_PLAN : null,
    email: show('email') ? T.ERR_EMAIL : null,
    waiver: show('waiver') ? T.ERR_WAIVER_TICK : null,
  };

  return (
    <Dialog title={T.ADD_TITLE} size="medium" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{sub}</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <FailedBanner state={state} onRetry={onSave} />
        <div className="field">
          <span id={`${id}-school`} className="field-label">
            {T.SCHOOL}
          </span>
          <Choice
            labelId={`${id}-school`}
            className={`bb-segmented--fill${messages.school ? ' is-invalid' : ''}`}
            options={[
              { key: 'worcester', label: T.schoolName('worcester') },
              { key: 'shrewsbury', label: T.schoolName('shrewsbury') },
            ]}
            value={v.school}
            readOnly={ro}
            onChange={(school) => onChange({ school })}
          />
          {messages.school && <Notice>{messages.school}</Notice>}
        </div>
        {/* First | Last name side by side (PC / tablet), the belt-spelling hint under both */}
        <div className="bb-name-pair">
          <div className="field">
            <label htmlFor={`${id}-first`}>{T.FIRST_NAME}</label>
            <input id={`${id}-first`} className="input" type="text" autoComplete="off" data-autofocus readOnly={ro} value={v.first} aria-invalid={messages.first ? 'true' : undefined} aria-describedby={messages.first ? err('first') : `${id}-last-hint`} onChange={(e) => onChange({ first: e.target.value })} />
            {messages.first && <Notice id={err('first')}>{messages.first}</Notice>}
          </div>
          <div className="field">
            <label htmlFor={`${id}-last`}>{T.LAST_NAME}</label>
            <input id={`${id}-last`} className="input" type="text" autoComplete="off" readOnly={ro} value={v.last} aria-invalid={messages.last ? 'true' : undefined} aria-describedby={messages.last ? `${err('last')} ${id}-last-hint` : `${id}-last-hint`} onChange={(e) => onChange({ last: e.target.value })} />
            {messages.last && <Notice id={err('last')}>{messages.last}</Notice>}
          </div>
        </div>
        <p id={`${id}-last-hint`} className="field-hint bb-name-hint">{T.LAST_NAME_HINT}</p>
        <div className="field">
          <label htmlFor={`${id}-dob`}>{T.DOB}</label>
          <DateField id={`${id}-dob`} value={v.dob} readOnly={ro} invalid={Boolean(messages.dob)} describedBy={messages.dob ? err('dob') : dobHint ? `${id}-dob-hint` : undefined} onChange={(dob) => onChange({ dob })} />
          {messages.dob ? <Notice id={err('dob')}>{messages.dob}</Notice> : dobHint && <p id={`${id}-dob-hint`} className="field-hint">{dobHint}</p>}
        </div>
        <div className="field">
          <span id={`${id}-dan`} className="field-label">
            {T.TESTING_FOR}
          </span>
          <Choice labelId={`${id}-dan`} className={`bb-segmented--fill${messages.dan ? ' is-invalid' : ''}`} options={DANS.map((d) => ({ key: d, label: T.DAN_LABELS[d] }))} value={dan} readOnly={ro} onChange={(d) => onChange({ dan: d })} />
          {messages.dan && <Notice>{messages.dan}</Notice>}
        </div>
        <div className="field">
          <span id={`${id}-kuk`} className="field-label">
            {T.KUKKIWON_DAN_CERT}
          </span>
          <Choice
            labelId={`${id}-kuk`}
            className="bb-segmented--fill"
            options={[
              { key: 'no', label: T.KUKKIWON_NO },
              { key: 'yes', label: T.kukkiwonYes(hidden ? null : fee) },
            ]}
            value={v.kukkiwon ? 'yes' : 'no'}
            readOnly={ro}
            onChange={(key) => onChange({ kukkiwon: key === 'yes' })}
          />
        </div>
        <div className="field">
          <span id={`${id}-plan`} className="field-label">
            {T.HOW_THEY_PAY}
          </span>
          {!dan && <p className="field-hint bb-plan-hint">{T.AMOUNTS_AFTER_DAN}</p>}
          <PlanCards cycle={cycle} dan={dan} value={v.planId} hidden={hidden} invalid={Boolean(messages.plan)} readOnly={ro} labelId={`${id}-plan`} onChange={(planId) => onChange({ planId })} />
          {messages.plan && <Notice>{messages.plan}</Notice>}
        </div>
        {schedule && <p className="bb-total-line">{T.addTotalLine(schedule.totalCents, schedule.lines, schedule.kukkiwonCents)}</p>}
        <div className="field">
          <label htmlFor={`${id}-email`}>{T.EMAIL}</label>
          <input id={`${id}-email`} className="input" type="email" autoComplete="off" readOnly={ro} value={v.email} aria-invalid={messages.email ? 'true' : undefined} aria-describedby={messages.email ? err('email') : undefined} onChange={(e) => onChange({ email: e.target.value })} />
          {messages.email && <Notice id={err('email')}>{messages.email}</Notice>}
        </div>
        <div className="field">
          <label className="cbrow bb-paper-tick" htmlFor={`${id}-paper`}>
            <input id={`${id}-paper`} type="checkbox" className="cb" checked={v.paperWaiver} disabled={ro} aria-describedby={messages.waiver ? err('waiver') : `${id}-paper-hint`} onChange={(e) => onChange({ paperWaiver: e.target.checked })} />
            <span>{T.WAIVER_SIGNED_ON_PAPER}</span>
          </label>
          {messages.waiver ? <Notice id={err('waiver')}>{messages.waiver}</Notice> : <p id={`${id}-paper-hint`} className="field-hint bb-paper-hint">{T.PAPER_WAIVER_HINT}</p>}
        </div>
        <Footer state={state} isPhone={isPhone} onCancel={onCancel} primary={<PrimaryButton state={state} isPhone={isPhone} label={T.ADD_CANDIDATE} Icon={ICONS.save} />} />
      </form>
    </Dialog>
  );
}
