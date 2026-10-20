// PricesSection.jsx — "Prices and payment due dates" and "Kukkiwon certificate fee" in
// Add cycle / Edit cycle.
// Why it exists: rulebook v0.902 (approved redraw of Cycles 4). Prices live on each cycle:
//   - Add cycle: filled in from the previous cycle (the very first from Fall 2026). One block
//     per plan, in the order the family form shows them: grip (drag to reorder), name, "N
//     payments", ⋯ (Move up / Move down — the touch and keyboard way, v0.43) and Remove. Under it
//     a grid Payment × (Due date, 1st–4th Dan) with a Total row. "+ Add plan" asks the name and the
//     number of payments (AddPlanDialog.jsx). Then the Kukkiwon fee per Dan.
//   - Edit cycle: the same section READ-ONLY with "Prices are set when the cycle is saved. Due
//     dates can still change." — only the due dates can be changed.
//   - Phones: one card per plan — its due dates first, then one row per Dan ("Pay 1 · Pay 2 …").
// Payment 1 "follows Application due" until someone types its date (rules.setPaymentDueDate).
// This file only draws; the values live in useCycleEditor.jsx.
import { Fragment, useId, useState } from 'react';
import { IconArrowDown, IconArrowUp, IconDots, IconPlus, IconTrash } from '@tabler/icons-react';
import IconButton from '../../../components/IconButton.jsx';
import Notice from '../../../components/Notice.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { formatDollars } from '../../../lib/money.js';
import { effectiveDueOn, planTotals } from '../../../lib/blackBelt/rules.js';
import { useReorderDrag } from '../../../lib/useReorderDrag.js';
import DateField from '../parts/DateField.jsx';
import Grip from '../parts/Grip.jsx';
import { DANS, priceTextProblem } from './formValues.js';
import * as T from '../text.js';

// One price box with a "$" in front (a typed price stays exactly as typed).
function PriceInput({ value, label, invalid, onChange }) {
  return (
    <span className={`money bb-price${invalid ? ' is-invalid' : ''}`}>
      <span className="money-prefix" aria-hidden="true">
        $
      </span>
      <input
        className="money-input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid ? 'true' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  );
}

// The text a read-only cell shows: "$870", or '' for a missing price.
const dollarsText = (text) => {
  const cents = Number(String(text).replace(/[$,]/g, '')) * 100;
  return Number.isFinite(cents) && String(text).trim() !== '' ? formatDollars(cents) : '';
};

export default function PricesSection({ mode, values, formForRules, problems, triedSave, isPhone, readOnly, onAmount, onDueDate, onKukkiwon, onPlanName, onRemove, onMove, onReorder, onAddPlan }) {
  const id = useId();
  const isAdd = mode === 'add';
  const [menu, setMenu] = useState(null); // { key, anchor } — a plan's ⋯
  const plans = values.plans;

  const drag = useReorderDrag({
    enabled: isAdd && !readOnly && plans.length > 1,
    onDrop: (group, key, toIndex) => {
      if (group === 'bb-plans') onReorder(key, toIndex);
    },
  });

  // Which price problems to show: a wrong price at once, a missing one after Save was pressed.
  const showPrice = (text) => {
    const code = priceTextProblem(text);
    return code === 'invalid' || (code === 'missing' && triedSave);
  };

  function planBlock(plan, index) {
    const planProblems = problems.plans?.[index] ?? {};
    const formPlan = formForRules.plans[index];
    const totals = planTotals(formPlan);
    const payments = plan.payments;
    const priceWrong = isAdd && DANS.some((dan) => (plan.amounts[dan] ?? []).some(showPrice));
    const nameCode = planProblems.name;
    const nameMsg = isAdd && nameCode && (nameCode !== 'empty' || triedSave) ? T.nameProblemText(nameCode, T.ENTER_PLAN_NAME) : null;
    const dueCodes = (planProblems.payments ?? []).map((p) => p?.dueOn ?? null);
    const dueShown = dueCodes.map((code) => (code === 'missing' && !triedSave ? null : code));
    const firstDue = dueShown.find(Boolean);
    const dragging = drag.state?.id === plan.key;
    const dueOf = (pay) => effectiveDueOn(pay, values.applicationDue) ?? '';

    const dueField = (pay, i) => (
      <DateField
        value={dueOf(pay)}
        label={T.dueDateLabel(plan.name, pay.paymentNo)}
        invalid={Boolean(dueShown[i])}
        readOnly={readOnly}
        onChange={(date) => onDueDate(plan.key, pay.paymentNo, date)}
      />
    );
    const amountCell = (dan, i) =>
      isAdd ? (
        <PriceInput
          value={plan.amounts[dan]?.[i] ?? ''}
          label={T.amountLabel(plan.name, dan, i + 1)}
          invalid={showPrice(plan.amounts[dan]?.[i] ?? '')}
          onChange={(text) => onAmount(plan.key, dan, i, text)}
        />
      ) : (
        <span className="bb-ro-price">{dollarsText(plan.amounts[dan]?.[i] ?? '')}</span>
      );

    const head = (
      <div className="bb-plan-head">
        {isAdd && <Grip label={T.dragPlanLabel(plan.name)} gripProps={drag.gripProps('bb-plans', plan.key)} disabled={readOnly} />}
        {isAdd ? (
          <input
            className="input bb-plan-name"
            type="text"
            autoComplete="off"
            aria-label={T.PLAN_NAME_LABEL}
            aria-invalid={nameMsg ? 'true' : undefined}
            value={plan.name}
            readOnly={readOnly}
            onChange={(event) => onPlanName(plan.key, event.target.value)}
          />
        ) : (
          <span className="bb-plan-title">{plan.name}</span>
        )}
        {/* "3 payments" isn't repeated after a plan already called "3 payments" (as drawn) */}
        {plan.name.trim().toLowerCase() !== T.paymentsCount(payments.length).toLowerCase() && <span className="bb-plan-count">{T.paymentsCount(payments.length)}</span>}
        {isAdd && (
          <span className="bb-plan-acts">
            <IconButton
              label={T.planMoreLabel(plan.name)}
              Icon={IconDots}
              aria-haspopup="menu"
              aria-expanded={menu?.key === plan.key ? 'true' : 'false'}
              onClick={(event) => {
                const anchor = event.currentTarget;
                setMenu((current) => (current?.key === plan.key ? null : { key: plan.key, anchor }));
              }}
            />
            <IconButton label={T.removePlanLabel(plan.name)} Icon={IconTrash} onClick={() => !readOnly && onRemove(plan.key)} />
          </span>
        )}
      </div>
    );

    let grid;
    if (isPhone) {
      grid = (
        <>
          <p className="bb-sub-label">{T.DUE_DATES}</p>
          <div className="bb-due-list">
            {payments.map((pay, i) => (
              <div key={pay.paymentNo} className="bb-due-row">
                <span className="bb-due-label">{T.paymentLabel(pay.paymentNo)}</span>
                {dueField(pay, i)}
              </div>
            ))}
          </div>
          <div className="bb-scroll-x">
            {/* At least 72px per payment column: many payments scroll inside the card, never the page */}
            <table className="bb-grid bb-grid--phone" style={{ minWidth: 44 + payments.length * 80 }}>
              <thead>
                <tr>
                  <th scope="col">{T.COL_DAN}</th>
                  {payments.map((pay) => (
                    <th key={pay.paymentNo} scope="col">
                      {payments.length === 1 ? T.paymentLabel(1) : T.payShort(pay.paymentNo)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DANS.map((dan) => (
                  <tr key={dan}>
                    <th scope="row">{T.DAN_SHORT[dan]}</th>
                    {payments.map((pay, i) => (
                      <td key={pay.paymentNo}>{amountCell(dan, i)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    } else {
      grid = (
        <div className="bb-scroll-x">
          <table className="bb-grid">
            <thead>
              <tr>
                <th scope="col" className="bb-grid-pay">
                  <span className="visually-hidden">{T.paymentLabel('')}</span>
                </th>
                <th scope="col">{T.COL_DUE}</th>
                {DANS.map((dan) => (
                  <th key={dan} scope="col" className="num">
                    {T.DAN_LABELS[dan]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map((pay, i) => (
                <tr key={pay.paymentNo}>
                  <th scope="row" className="bb-grid-pay">
                    {T.paymentLabel(pay.paymentNo)}
                  </th>
                  <td className="bb-grid-due">{dueField(pay, i)}</td>
                  {DANS.map((dan) => (
                    <td key={dan} className="num">
                      {amountCell(dan, i)}
                    </td>
                  ))}
                </tr>
              ))}
              {payments.length > 1 && (
                <tr className="bb-grid-total">
                  <th scope="row" className="bb-grid-pay">
                    {T.TOTAL}
                  </th>
                  <td />
                  {DANS.map((dan) => (
                    <td key={dan} className="num">
                      {totals[dan] !== null ? formatDollars(totals[dan]) : ''}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div key={plan.key} className={`bb-plan${dragging ? ' is-dragging' : ''}`} data-drag-group={isAdd ? 'bb-plans' : undefined} data-drag-id={plan.key}>
        {head}
        {nameMsg && <Notice>{nameMsg}</Notice>}
        {grid}
        {firstDue && <Notice>{T.dateProblemText(firstDue)}</Notice>}
        {priceWrong && <Notice>{T.PRICE_RANGE}</Notice>}
      </div>
    );
  }

  const kukkiwonWrong = isAdd && DANS.some((dan) => showPrice(values.kukkiwon[dan] ?? ''));
  const plansListMsg = isAdd && problems.plansList ? (problems.plansList === 'tooMany' ? T.TOO_MANY_PLANS : T.ADD_ONE_PLAN) : null;
  const from = T.fromName(values.pricesFrom);
  const moving = drag.state && drag.state.toIndex !== drag.state.fromIndex ? drag.state : null;

  const menuPlanIndex = menu ? plans.findIndex((p) => p.key === menu.key) : -1;

  return (
    <>
      <section className="bb-section" aria-labelledby={`${id}-prices`}>
        <h3 id={`${id}-prices`} className="bb-section-title">
          {T.PRICES}
        </h3>
        <p className={isAdd ? 'field-hint bb-section-hint' : 'bb-locked-line'}>{isAdd ? T.pricesFromHint(from) : T.PRICES_SET}</p>
        <div className="bb-plans">
          {plans.map((plan, index) => (
            <Fragment key={plan.key}>
              {moving && moving.gap === index && <div className="dropline" aria-hidden="true" />}
              {planBlock(plan, index)}
            </Fragment>
          ))}
          {moving && moving.gap === plans.length && <div className="dropline" aria-hidden="true" />}
        </div>
        {plansListMsg && <Notice>{plansListMsg}</Notice>}
        {isAdd && (
          <button type="button" className="btn btn-sm bb-add-row" onClick={(event) => !readOnly && onAddPlan(event.currentTarget)}>
            {/* ti-plus = add new */}
            <IconPlus size={16} aria-hidden="true" />
            {T.ADD_PLAN}
          </button>
        )}
      </section>

      <section className="bb-section" aria-labelledby={`${id}-kuk`}>
        <h3 id={`${id}-kuk`} className="bb-section-title">
          {T.KUKKIWON_FEE}
        </h3>
        <div className="bb-kuk">
          {DANS.map((dan) => (
            <div key={dan} className="bb-kuk-item">
              <span className="bb-kuk-dan">{T.DAN_LABELS[dan]}</span>
              {isAdd ? (
                <PriceInput
                  value={values.kukkiwon[dan] ?? ''}
                  label={`${T.KUKKIWON_FEE}, ${T.DAN_LABELS[dan]}`}
                  invalid={showPrice(values.kukkiwon[dan] ?? '')}
                  onChange={(text) => onKukkiwon(dan, text)}
                />
              ) : (
                <span className="bb-ro-price">{dollarsText(values.kukkiwon[dan] ?? '')}</span>
              )}
            </div>
          ))}
        </div>
        {kukkiwonWrong && <Notice>{T.PRICE_RANGE}</Notice>}
        <p className="field-hint">{T.KUKKIWON_HINT}</p>
      </section>

      {menu && menuPlanIndex !== -1 && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={plans[menuPlanIndex].name}
          subtitle={T.paymentsCount(plans[menuPlanIndex].payments.length)}
          label={T.planMoreLabel(plans[menuPlanIndex].name)}
          items={[
            { key: 'up', label: T.MOVE_UP, Icon: IconArrowUp, disabled: menuPlanIndex === 0, onSelect: () => onMove(menu.key, -1) },
            { key: 'down', label: T.MOVE_DOWN, Icon: IconArrowDown, disabled: menuPlanIndex === plans.length - 1, onSelect: () => onMove(menu.key, 1) },
          ]}
          onClose={(reason) => {
            const anchor = menu.anchor;
            setMenu(null);
            if (reason === 'escape' || reason === 'tab' || reason === 'select') window.requestAnimationFrame(() => anchor?.isConnected && anchor.focus());
          }}
        />
      )}
    </>
  );
}
