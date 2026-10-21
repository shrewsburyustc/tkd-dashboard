// ChangePlanDialog.jsx — "Change plan or Kukkiwon" (staff before anything is paid; admins always).
// Why it exists: approved mockup Candidates 6, contract CONTRACT-0016-B2 §3.6 (rulebook v0.217).
// "Rina Patel · 1st Dan · Worcester"; Plan: one radio card per plan of the cycle (a round radio dot
// at the left, as drawn), in the order set on the cycle (Rubric and prices / Add cycle), the
// current one tagged "Current", each with this Dan's amounts and the PLAN's own due dates ("3
// payments · 3 × $290 · Mar 27, Apr 24, May 29 · $870" — mockup 7: a late family's cards still
// show the plan's dates; what they owe today is in the total line under the cards);
// Kukkiwon Dan certificate No, thanks · Yes, add it · $100; then the new total worked out in advance
// with rules.predictMoney ("New total $870 · 3 × $290, due … · nothing paid yet" or, after a payment,
// "New total $1,100 · paid $330 · balance $770 · due now: $440 (…)"). Adding the Kukkiwon fee late
// makes it due today (the database dates it the day it is chosen).
// Admins changing it after a payment see the amber "$330 is already paid. Recorded payments stay as
// they are; the balance is worked out again." Staff can't (the ⋯ item is grayed; the database
// refuses too). Save is blue only when something changed.
//
// PlanCards is also used by Add candidate ("How they'll pay").
import { useId, useRef } from 'react';
import Dialog from '../../../components/Dialog.jsx';
import { formatCents } from '../../../lib/blackBelt/money.js';
import { cycleCandidateItems, dueNowItems, hasLivePayment, nextItems, predictMoney } from '../../../lib/blackBelt/rules.js';
import Choice from '../parts/Choice.jsx';
import { FailedBanner, Footer, PrimaryButton } from './dialogParts.jsx';
import { ICONS } from './icons.js';
import * as T from '../text.js';

// The payment items of a plan for one candidate, in payment order: [{ item: 'p1', dueOn }] (the
// database's items, S4: a passed date counts from the day they registered — for a new desk
// candidate, today). registeredOn null = the plan's own dates.
export function planItems(cycle, planId, dan, registeredOn) {
  return cycleCandidateItems(cycle, { planId, dan: dan ?? 1, kukkiwon: false, registeredOn })
    .sort((a, b) => Number(a.item.slice(1)) - Number(b.item.slice(1)))
    .map((x) => ({ item: x.item, dueOn: x.dueOn }));
}
export const planDates = (cycle, planId, dan, registeredOn) => planItems(cycle, planId, dan, registeredOn).map((x) => x.dueOn);

// One radio card per plan, with the plan's own due dates. dan null → no amounts yet; hidden → no
// amounts (Hide payments).
export function PlanCards({ cycle, dan, value, currentId = null, hidden = false, invalid = false, readOnly = false, labelId, describedBy, onChange }) {
  const plans = [...(cycle.plans ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const refs = useRef([]);
  const current = plans.findIndex((p) => p.id === value);
  const tabStop = current === -1 ? 0 : current;
  function choose(index) {
    if (readOnly) return;
    const plan = plans[index];
    if (plan && plan.id !== value) onChange(plan.id);
  }
  function onKeyDown(event) {
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
    const back = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
    if (!forward && !back) return;
    event.preventDefault();
    const from = refs.current.indexOf(document.activeElement);
    const next = ((from === -1 ? tabStop : from) + (forward ? 1 : -1) + plans.length) % plans.length;
    refs.current[next]?.focus();
    choose(next);
  }
  return (
    <div className={`bb-plancards${invalid ? ' is-invalid' : ''}`} role="radiogroup" aria-labelledby={labelId} aria-describedby={describedBy} onKeyDown={onKeyDown}>
      {plans.map((plan, index) => {
        const checked = plan.id === value;
        const amounts = dan && !hidden ? plan.amounts?.[dan] ?? [] : null;
        const dates = planDates(cycle, plan.id, dan, null);
        const total = amounts ? amounts.reduce((a, b) => a + b, 0) : null;
        return (
          <button
            key={plan.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked ? 'true' : 'false'}
            tabIndex={index === tabStop ? 0 : -1}
            className={`bb-plancard${checked ? ' is-checked' : ''}`}
            onClick={() => choose(index)}
          >
            <span className="bb-plancard-dot" aria-hidden="true" />
            <span className="bb-plancard-body">
              <span className="bb-plancard-top">
                <span className="bb-plancard-name">{plan.name}</span>
                {plan.id === currentId && <span className="ttag">{T.CURRENT}</span>}
                {total !== null && <span className="bb-plancard-total">{formatCents(total)}</span>}
              </span>
              <span className="bb-plancard-line">{T.planCardLine(amounts, dates)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function ChangePlanDialog({ state, cycle, isAdmin, isPhone, hidden, today, onChange, onSave, onCancel, onRequestClose }) {
  const id = useId();
  const { data, values: v } = state;
  const c = data.candidate;
  const ro = state.saving;
  const paidLive = hasLivePayment(data.payments);
  const changed = v.planId !== state.initial.planId || v.kukkiwon !== state.initial.kukkiwon;
  const fee = cycle.kukkiwon?.[c.dan] ?? null;

  const predicted = predictMoney({
    cycle,
    planId: v.planId,
    dan: c.dan,
    kukkiwon: v.kukkiwon,
    kukkiwonAddedOn: v.kukkiwon && c.kukkiwon ? c.kukkiwonAddedOn : null,
    registeredOn: c.registeredOn,
    lines: data.payments,
    today,
  });
  const plan = cycle.plans?.find((p) => p.id === v.planId);
  let totalLine = null;
  if (!hidden && plan) {
    totalLine = paidLive
      ? T.newTotalWithPaid(predicted, dueNowItems(predicted, today), nextItems(predicted))
      : T.newTotalNothingPaid(predicted.totalDueCents, plan.amounts?.[c.dan] ?? [], planItems(cycle, plan.id, c.dan, c.registeredOn), today);
  }

  const primaryState = { ...state, blocking: state.blocking || !changed };
  return (
    <Dialog title={T.CHANGE_PLAN_TITLE} size="medium" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.changePlanSub(c)}</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <FailedBanner state={state} onRetry={onSave} />
        {isAdmin && paidLive && !hidden && (
          <p className="bb-amber-line">
            <ICONS.warn size={16} aria-hidden="true" />
            <span>{T.alreadyPaidAdmin(data.money.paidCents)}</span>
          </p>
        )}
        <div className="field">
          <span id={`${id}-plan`} className="field-label">
            {T.PLAN}
          </span>
          <PlanCards cycle={cycle} dan={c.dan} value={v.planId} currentId={state.initial.planId} hidden={hidden} readOnly={ro} labelId={`${id}-plan`} onChange={(planId) => onChange({ planId })} />
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
        {totalLine && <p className="bb-total-line">{totalLine}</p>}
        <Footer state={state} isPhone={isPhone} onCancel={onCancel} primary={<PrimaryButton state={primaryState} isPhone={isPhone} label={T.SAVE} Icon={ICONS.save} />} />
      </form>
    </Dialog>
  );
}

