// ChartDialogs.jsx — the three forms of the Chart and prices tab: Edit prices, Edit age groups and Edit / Add rank.
// Why it exists: approved pictures C-admin-prices (prices-edit, age-edit) and C-admin-chart (rank-edit), rulebook
// v1.300. Each one only DRAWS the form inside ChartFormDialog; the typed values, the checks' inputs and the saving
// live in ChartAndPricesTab (state prop), so a screen lock while a dialog is open brings it back still filled in.
//   Edit prices        four money boxes (dollars and cents: the two LISTED prices, the cash / check discount and the event-day
//                      extra), a read-only worked example that follows what is typed
//   Edit age groups    one number box; "Teen / Adult" below it is that number + 1, read-only
//   Edit / Add rank    rank name, technique and two − n + steppers (0–12); the group is fixed and named under the title
// The fields check while typing with the same rules as the database (chartRules.js): money 0–$1,000, age 1–98 here
// (the database takes 99, but then "99 and up" would mean nobody), rank names unique inside their group.
import { placeTip } from '../../../components/IconButton.jsx';
import Notice from '../../../components/Notice.jsx';
import * as T from '../../../lib/breaking/text/chart.js';
import { MAX_BOARDS } from '../../../lib/breaking/breakingRules.js';
import ChartFormDialog from './ChartFormDialog.jsx';
import { checkAgeForm, checkPricesForm, checkRankForm } from './chartRules.js';

const describe = (...ids) => ids.filter(Boolean).join(' ') || undefined;

// ----- Edit prices -----
const PRICE_LABELS = { tech: T.LABEL_TECH, adult: T.LABEL_ADULT, discount: T.LABEL_DISCOUNT, sameDay: T.LABEL_SAME_DAY };

export function PricesDialog({ state, saved, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const check = checkPricesForm(state, saved);
  const readOnly = state.saving;
  const idBase = `brk-prices-${state.key}`;
  // The worked example, from what is typed (a box that doesn't parse keeps its saved number).
  const example = T.exampleLine(check.settings ?? saved);
  const box = (key, first = false) => {
    const error = check.errors[key];
    return (
      <div key={key} className="field">
        <label htmlFor={`${idBase}-${key}`}>{PRICE_LABELS[key]}</label>
        <div className={`money${readOnly ? ' is-readonly' : ''}${error ? ' is-bad' : ''}`}>
          <span className="money-prefix" aria-hidden="true">
            $
          </span>
          <input
            id={`${idBase}-${key}`}
            className="money-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            data-autofocus={first ? true : undefined}
            readOnly={readOnly}
            value={state.values[key]}
            aria-invalid={error ? true : undefined}
            aria-describedby={describe(error ? `${idBase}-${key}-error` : `${idBase}-hint`)}
            onChange={(event) => {
              onChange({ [key]: event.target.value });
              onTouch(key);
            }}
            onBlur={() => onTouch(key)}
          />
        </div>
        {error && state.touched[key] && <Notice id={`${idBase}-${key}-error`}>{T.moneyProblemText(error)}</Notice>}
      </div>
    );
  };
  return (
    <ChartFormDialog
      title={T.EDIT_PRICES}
      subtitle={T.ALL_EVENTS}
      isPhone={isPhone}
      note={state.note}
      canSave={check.canSave}
      saving={state.saving}
      onSave={onSave}
      onCancel={onCancel}
      onRequestClose={onRequestClose}
    >
      <p className="ro-label tdialog-group" style={{ marginTop: 0 }}>
        {T.PRICES_LISTED_GROUP}
      </p>
      <div className={isPhone ? 'tprices is-stacked' : 'tprices brk-two'}>
        {box('tech', true)}
        {box('adult')}
      </div>
      <p className="ro-label tdialog-group">{T.PRICES_EXTRA_GROUP}</p>
      <div className={isPhone ? 'tprices is-stacked' : 'tprices brk-two'}>
        {box('discount')}
        {box('sameDay')}
      </div>
      <div className="ro">
        <p className="ro-label">{T.WORKED_EXAMPLE}</p>
        <p className="ro-value">{example}</p>
      </div>
      <p id={`${idBase}-hint`} className="field-hint tdialog-hint">
        {T.PRICES_HINT}
      </p>
    </ChartFormDialog>
  );
}

// ----- Edit age groups -----
export function AgeDialog({ state, saved, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const check = checkAgeForm(state, saved);
  const idBase = `brk-age-${state.key}`;
  const error = check.error && state.touched.age;
  return (
    <ChartFormDialog
      title={T.EDIT_AGE}
      subtitle={T.ALL_EVENTS}
      size="small"
      isPhone={isPhone}
      note={state.note}
      canSave={check.canSave}
      saving={state.saving}
      onSave={onSave}
      onCancel={onCancel}
      onRequestClose={onRequestClose}
    >
      <div className="field">
        <label htmlFor={`${idBase}-age`}>{T.AGE_FIELD}</label>
        <input
          id={`${idBase}-age`}
          className="input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          data-autofocus
          readOnly={state.saving}
          style={isPhone ? undefined : { width: 96 }}
          value={state.values.age}
          aria-invalid={error ? true : undefined}
          aria-describedby={describe(error ? `${idBase}-age-error` : `${idBase}-hint`)}
          onChange={(event) => {
            onChange({ age: event.target.value });
            onTouch('age');
          }}
          onBlur={() => onTouch('age')}
        />
        {error && <Notice id={`${idBase}-age-error`}>{T.AGE_PROBLEM}</Notice>}
      </div>
      <div className="ro">
        <p className="ro-label">{T.TEEN_FIELD}</p>
        <p className="ro-value">{T.teenValue(check.age ?? saved.childMaxAge)}</p>
      </div>
      <p id={`${idBase}-hint`} className="field-hint tdialog-hint">
        {T.AGE_HINT}
      </p>
    </ChartFormDialog>
  );
}

// ----- Edit / Add rank -----

// "−" / "+" button with the same tooltip bubble as the icon buttons (a copy of Color belt's BeltPicker StepButton).
function StepButton({ label, symbol, disabled, onClick }) {
  return (
    <button type="button" className="btn stepper-btn" aria-label={label} aria-disabled={disabled ? 'true' : undefined} onPointerEnter={placeTip} onFocus={placeTip} onClick={onClick}>
      <span aria-hidden="true">{symbol}</span>
      <span className="tib-tip" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

function Stepper({ id, label, value, readOnly, onChange }) {
  return (
    <div className="field">
      <span className="field-label" id={id}>
        {label}
      </span>
      <div className="stepper" role="group" aria-labelledby={id}>
        {/* Plain − / + text: the ti-plus icon means "Add new" in this dashboard (guidelines 2.4) */}
        <StepButton label={T.fewer(label)} symbol="−" disabled={value <= 0 || readOnly} onClick={() => onChange(value - 1)} />
        {/* aria-live: a screen reader says the new number after − or + */}
        <output className="stepper-value" aria-live="polite">
          {value}
        </output>
        <StepButton label={T.more(label)} symbol="+" disabled={value >= MAX_BOARDS || readOnly} onClick={() => onChange(value + 1)} />
      </div>
    </div>
  );
}

const NAME_ERRORS = (band, name) => ({ empty: T.RANK_NAME_EMPTY, long: T.RANK_NAME_LONG, duplicate: T.duplicateRank(band, name) });

export function RankDialog({ state, chart, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const isAdd = state.mode === 'add';
  const check = checkRankForm(state, chart, state.rowKey);
  const readOnly = state.saving;
  const idBase = `brk-rank-${state.key}`;
  const nameError = check.nameError && (state.touched.name || check.nameError === 'duplicate') ? NAME_ERRORS(state.band, String(state.values.name).trim())[check.nameError] : null;
  const techniqueError = check.techniqueError ? T.TECHNIQUE_LONG : null;
  return (
    <ChartFormDialog
      title={isAdd ? T.ADD_RANK_TITLE : T.EDIT_RANK}
      subtitle={T.rankSubtitle(state.band, isAdd ? null : state.initial.name)}
      isPhone={isPhone}
      note={state.note}
      canSave={check.canSave}
      saving={state.saving}
      onSave={onSave}
      onCancel={onCancel}
      onRequestClose={onRequestClose}
    >
      <div className="field">
        <label htmlFor={`${idBase}-name`}>{T.RANK_NAME}</label>
        <input
          id={`${idBase}-name`}
          className="input"
          type="text"
          autoComplete="off"
          data-autofocus
          readOnly={readOnly}
          value={state.values.name}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={describe(nameError && `${idBase}-name-error`)}
          onChange={(event) => {
            onChange({ name: event.target.value });
            onTouch('name');
          }}
          onBlur={() => onTouch('name')}
        />
        {nameError && <Notice id={`${idBase}-name-error`}>{nameError}</Notice>}
      </div>
      <div className="field">
        <label htmlFor={`${idBase}-technique`}>{T.TECHNIQUE}</label>
        <input
          id={`${idBase}-technique`}
          className="input"
          type="text"
          autoComplete="off"
          readOnly={readOnly}
          value={state.values.technique}
          aria-invalid={techniqueError ? true : undefined}
          aria-describedby={describe(techniqueError && `${idBase}-technique-error`)}
          onChange={(event) => onChange({ technique: event.target.value })}
        />
        {techniqueError && <Notice id={`${idBase}-technique-error`}>{techniqueError}</Notice>}
      </div>
      <div className={isPhone ? 'tprices is-stacked' : 'tprices brk-two'}>
        <Stepper id={`${idBase}-tech`} label={T.TECHNICAL_BOARDS} value={state.values.tech} readOnly={readOnly} onChange={(n) => onChange({ tech: n })} />
        <Stepper id={`${idBase}-adult`} label={T.ADULT_BOARDS} value={state.values.adult} readOnly={readOnly} onChange={(n) => onChange({ adult: n })} />
      </div>
      <p className="field-hint tdialog-hint">{T.RANK_HINT}</p>
    </ChartFormDialog>
  );
}
