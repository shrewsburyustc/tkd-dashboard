// BeltPicker.jsx — the "Belt" section of Add rank / Edit rank (decided v0.65, preview first).
// Why it exists: every rank shows a small belt picture (v0.64). Admins build that picture from
// a few parts instead of choosing from a fixed list, so new belts can be added later:
//   - Pattern: Solid · Middle stripe · Half and half (a "segmented control": one choice of three)
//   - Belt color (for Half and half: "Top half")
//   - Middle stripe color / Bottom half (hidden for Solid)
//   - End stripes: − n + (0–3), plus their color once there is at least one (yellow by default)
//   - A live preview: the belt as it will look in the list, with the rank's name
// Colors come from one fixed list (BELT_COLORS in src/lib/testing/belts.js). Every color swatch
// has its name: as its screen-reader label, as a tooltip with a mouse, and the chosen color's
// name is written next to the row's label — never color alone (guidelines 4).
//
// Keyboard: each group of choices is a "radio group" — Tab reaches the chosen one, the arrow keys
// move to (and choose) the next / previous one. Touch: every swatch and button has a 44px tap area.
//
// Props:
//   belt      { beltPattern, beltColor, beltColor2, beltEndStripes, beltEndStripeColor }
//   name      the rank name typed so far (for the preview)
//   readOnly  true while saving
//   onChange  (newBelt) => void
import { useId, useRef, useState } from 'react';
import Belt from '../../components/Belt.jsx';
import { placeTip } from '../../components/IconButton.jsx';
import Notice from '../../components/Notice.jsx';
import {
  BELT_COLORS,
  BELT_END_STRIPES_MAX,
  DEFAULT_END_STRIPE_COLOR,
  describeBelt,
  validateBelt,
} from '../../lib/testing/belts.js';
import * as T from './text.js';

const PATTERNS = [
  { key: 'solid', label: T.PATTERN_SOLID },
  { key: 'stripe', label: T.PATTERN_STRIPE },
  { key: 'half', label: T.PATTERN_HALF },
];

const colorName = (key) => BELT_COLORS.find((c) => c.key === key)?.name ?? '';

// What's wrong with the belt, for the screen: the shared rules (validateBelt) plus one more the
// picker adds — end stripes in the same color as the belt underneath them would be invisible.
// 'endStripeSame' | validateBelt codes | null.
export function beltFormProblem(belt) {
  const problem = validateBelt(belt);
  if (problem) return problem;
  if (belt.beltEndStripes > 0) {
    const on = belt.beltEndStripeColor;
    if (on === belt.beltColor || (belt.beltPattern === 'half' && on === belt.beltColor2)) return 'endStripeSame';
  }
  return null;
}

// A second color that differs from the first: white on a colored belt, black on a white one.
function contrastingColor(first) {
  return first === 'white' ? 'black' : 'white';
}

// Arrow keys inside a radio group: move to the next / previous choice AND choose it.
function useRadioKeys(count, current, choose) {
  const refs = useRef([]);
  function onKeyDown(event) {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    let next = null;
    if (forward) next = (current + 1) % count;
    if (back) next = (current - 1 + count) % count;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = count - 1;
    if (next === null) return;
    event.preventDefault();
    choose(next);
    refs.current[next]?.focus();
  }
  return { refs, onKeyDown };
}

// One row of color swatches, e.g. "Belt color   Yellow" + the nine swatches.
function ColorRow({ label, value, readOnly, onChoose, error = null }) {
  const labelId = useId();
  const current = Math.max(0, BELT_COLORS.findIndex((c) => c.key === value));
  const keys = useRadioKeys(BELT_COLORS.length, current, (index) => !readOnly && onChoose(BELT_COLORS[index].key));
  return (
    <div className="belt-row">
      <p className="belt-row-label">
        <span id={labelId}>{label}</span>
        <span className="belt-row-value">{colorName(value)}</span>
      </p>
      <div className="swatches" role="radiogroup" aria-labelledby={labelId} onKeyDown={keys.onKeyDown}>
        {BELT_COLORS.map((color, index) => {
          const checked = color.key === value;
          return (
            <button
              key={color.key}
              ref={(element) => {
                keys.refs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked ? 'true' : 'false'}
              aria-label={color.name}
              tabIndex={checked ? 0 : -1}
              className={`swatch${checked ? ' is-checked' : ''}`}
              data-tip="below" // the name shows UNDER the swatch, so the row's label stays readable
              onClick={() => !readOnly && onChoose(color.key)}
            >
              <span className="swatch-color" style={{ background: `var(--belt-${color.key})` }} />
              <span className="tib-tip" aria-hidden="true">
                {color.name}
              </span>
            </button>
          );
        })}
      </div>
      {/* A problem shows under the row that caused it */}
      {error && <Notice>{error}</Notice>}
    </div>
  );
}

// "−" / "+" stepper button with its tooltip (the same bubble as the icon buttons).
function StepButton({ label, symbol, disabled, onClick }) {
  return (
    <button
      type="button"
      className="btn stepper-btn"
      aria-label={label}
      aria-disabled={disabled ? 'true' : undefined}
      onPointerEnter={placeTip}
      onFocus={placeTip}
      onClick={onClick}
    >
      <span aria-hidden="true">{symbol}</span>
      <span className="tib-tip" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

export default function BeltPicker({ belt, name, readOnly = false, onChange }) {
  const patternLabelId = useId();
  const stripesLabelId = useId();
  // Which part was changed last — a same-color message goes under THAT row.
  const [lastRow, setLastRow] = useState('color2');
  const patternIndex = Math.max(0, PATTERNS.findIndex((p) => p.key === belt.beltPattern));

  // Switching pattern keeps the main color and picks a sensible second color.
  function choosePattern(key) {
    if (readOnly || key === belt.beltPattern) return;
    const color2 = key === 'solid' ? null : (belt.beltColor2 ?? contrastingColor(belt.beltColor));
    onChange({ ...belt, beltPattern: key, beltColor2: color2 });
  }
  const patternKeys = useRadioKeys(PATTERNS.length, patternIndex, (index) => choosePattern(PATTERNS[index].key));

  const stripes = Number(belt.beltEndStripes) || 0;
  function setStripes(n) {
    if (readOnly || n < 0 || n > BELT_END_STRIPES_MAX) return;
    onChange({ ...belt, beltEndStripes: n, beltEndStripeColor: belt.beltEndStripeColor ?? DEFAULT_END_STRIPE_COLOR });
  }

  const problem = beltFormProblem(belt);
  const isHalf = belt.beltPattern === 'half';
  const sameText = isHalf ? T.BELT_SAME_HALVES : T.BELT_SAME_STRIPE;
  const errorFor = (row) => {
    if (problem === 'sameColors' && row === (lastRow === 'color' ? 'color' : 'color2')) return sameText;
    if (problem === 'endStripeSame' && row === 'end') return T.END_STRIPE_SAME;
    return null;
  };

  return (
    <div className="belt-picker">
      {/* Live preview: the belt as the list will show it, with the rank's name */}
      <div className="belt-preview-box" aria-hidden="true">
        <Belt belt={belt} size="dialog" />
        <span className="belt-preview-text">
          <span className="belt-preview-name">{name}</span>
          <span className="belt-preview-desc">{describeBelt(belt) ?? ''}</span>
        </span>
      </div>

      <div className="belt-row">
        <p className="belt-row-label">
          <span id={patternLabelId}>{T.PATTERN}</span>
        </p>
        <div className="segmented" role="radiogroup" aria-labelledby={patternLabelId} onKeyDown={patternKeys.onKeyDown}>
          {PATTERNS.map((pattern, index) => {
            const checked = index === patternIndex;
            return (
              <button
                key={pattern.key}
                ref={(element) => {
                  patternKeys.refs.current[index] = element;
                }}
                type="button"
                role="radio"
                aria-checked={checked ? 'true' : 'false'}
                tabIndex={checked ? 0 : -1}
                className={`segment${checked ? ' is-checked' : ''}`}
                onClick={() => choosePattern(pattern.key)}
              >
                {pattern.label}
              </button>
            );
          })}
        </div>
      </div>

      <ColorRow
        label={isHalf ? T.TOP_HALF : T.BELT_COLOR}
        value={belt.beltColor}
        readOnly={readOnly}
        error={errorFor('color')}
        onChoose={(key) => {
          setLastRow('color');
          onChange({ ...belt, beltColor: key });
        }}
      />

      {belt.beltPattern !== 'solid' && (
        <ColorRow
          label={isHalf ? T.BOTTOM_HALF : T.STRIPE_COLOR}
          value={belt.beltColor2}
          readOnly={readOnly}
          error={errorFor('color2')}
          onChoose={(key) => {
            setLastRow('color2');
            onChange({ ...belt, beltColor2: key });
          }}
        />
      )}

      <div className="belt-row">
        <p className="belt-row-label">
          <span id={stripesLabelId}>{T.END_STRIPES}</span>
        </p>
        <div className="stepper" role="group" aria-labelledby={stripesLabelId}>
          {/* Plain − / + text: the ti-plus icon means "Add new" in this dashboard (guidelines 2.4) */}
          <StepButton
            label={T.FEWER_END_STRIPES}
            symbol="−"
            disabled={stripes <= 0 || readOnly}
            onClick={() => setStripes(stripes - 1)}
          />
          {/* aria-live: a screen reader says the new number after − or + */}
          <output className="stepper-value" aria-live="polite">
            {stripes}
          </output>
          <StepButton
            label={T.MORE_END_STRIPES}
            symbol="+"
            disabled={stripes >= BELT_END_STRIPES_MAX || readOnly}
            onClick={() => setStripes(stripes + 1)}
          />
        </div>
      </div>

      {stripes >= 1 && (
        <ColorRow
          label={T.END_STRIPE_COLOR}
          value={belt.beltEndStripeColor ?? DEFAULT_END_STRIPE_COLOR}
          readOnly={readOnly}
          error={errorFor('end')}
          onChoose={(key) => onChange({ ...belt, beltEndStripeColor: key })}
        />
      )}
    </div>
  );
}
