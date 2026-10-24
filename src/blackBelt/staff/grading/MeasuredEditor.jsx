// MeasuredEditor.jsx — the small editor under a selected MEASURED cell of the Grading grid
// (contract 0025 §14.2; approved mockup G01, proposals G 3–G 5).
// Why it exists: a measured subject (Stretching, Sprint 100 m, 1/2 or 1 mile …) takes the NUMBER
// measured; the database works the grade out from the cycle's cut-offs for the candidate's age
// (rulebook v0.944). One station measures one subject for everyone, so Enter saves and moves DOWN to
// the next candidate in the same subject.
//
//    [ Pull-up | Hold ]            (only a two-way subject; 44px tall on touch, G 5)
//    [ 35|        ] seconds
//    = A+ · 31 sec or more · all ages     (the cut-off reached, in the rubric's words, G 3)
//    70 in = 5 ft 10 in                   (inches of a foot or more, G 4)
//    Enter: next candidate · Esc: close
//
// Number formats (G 4, grading.js parseMeasured): count / reps / kicks whole; inches whole or .5;
// seconds one decimal; minutes typed as m:ss; 0–999, else "Type a number from 0 to 999." (nothing is
// sent). The "= A+" line is a live preview of what the typed number reaches; the cell itself always
// shows the DATABASE's letter after the save (v0.938).
// Keys: Enter saves and moves down · Tab saves and moves right (Shift+Tab left) · Esc closes without
// saving. A click outside saves a changed, valid number and closes. Switching the way keeps the
// number and saves it again with the other way's cut-offs (G 5).
// Drawn with position: fixed under the cell, so the grid's scrolling box can't cut it off.
//
// Props:
//   anchor     the cell element            subject   the rubric subject (ways, units, cut-offs)
//   value      { value, way } the cell shows (value null = empty)
//   initialText  a digit typed on the closed cell (the number starts with it), or null
//   group      the candidate's age group { from, to } (the result's age_group)
//   name       "Mia Chen" (screen readers) isTouch   true on a touch screen
//   onCommit(value|null, way, how)   how: 'enter' | 'tab' | 'back' | 'close' | 'way'
//   onCancel()
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { feetAndInches, formatMeasured, parseMeasured, reachedWords, unitKind } from '../../../lib/blackBelt/grading.js';
import { previewLetter, unitOf, wayBracketWords, wayOf } from './model.js';
import * as T from './text.js';

const WIDTH = 248;

export default function MeasuredEditor({ anchor, subject, value, initialText = null, group, name, isTouch, onCommit, onCancel }) {
  const baseId = useId();
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const ways = Array.isArray(subject?.ways) ? subject.ways : [];
  const [way, setWay] = useState(Number.isInteger(value?.way) ? value.way : 0);
  const wayObj = wayOf(subject, way);
  const [text, setText] = useState(() => initialText ?? formatMeasured(wayObj?.unit, value?.value));
  const [error, setError] = useState(false);
  const [place, setPlace] = useState(null);
  const unit = unitOf(wayObj);
  const unitWord = T.UNIT_WORDS[unit] ?? unit;
  const parsed = parseMeasured(wayObj?.unit, text);
  const okValue = parsed.status === 'ok' ? parsed.value : null;

  // The newest callbacks for the document listener below.
  const stateRef = useRef({ text, way, onCommit, onCancel });
  useLayoutEffect(() => {
    stateRef.current = { text, way, onCommit, onCancel };
  });

  // Under the cell; above it when there's no room below.
  useLayoutEffect(() => {
    function placeBox() {
      if (!anchor?.isConnected) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(WIDTH, window.innerWidth - 16);
      const height = boxRef.current?.offsetHeight ?? 160;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const below = rect.bottom + 4;
      const top = below + height > window.innerHeight - 8 && rect.top - 4 - height > 8 ? rect.top - 4 - height : below;
      setPlace({ top, left, width });
    }
    placeBox();
    window.addEventListener('resize', placeBox);
    window.addEventListener('scroll', placeBox, true);
    return () => {
      window.removeEventListener('resize', placeBox);
      window.removeEventListener('scroll', placeBox, true);
    };
  }, [anchor]);

  useEffect(() => {
    inputRef.current?.focus();
    // A digit typed on the cell starts the number; otherwise the old number is selected to retype.
    if (initialText === null) inputRef.current?.select();
    // (once, when it opens)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Commits the typed number (or refuses it with the range message). → true when it went.
  function commit(how, nextWay = way) {
    const p = parseMeasured(wayOf(subject, nextWay)?.unit, stateRef.current.text);
    if (p.status !== 'ok') {
      setError(true);
      return false;
    }
    onCommit(p.value, nextWay, how);
    return true;
  }

  // A click or tap outside: save a valid number, else just close.
  useEffect(() => {
    function handlePointerDown(event) {
      const path = event.composedPath();
      if (path.includes(boxRef.current) || (anchor && path.includes(anchor))) return;
      const s = stateRef.current;
      const p = parseMeasured(wayOf(subject, s.way)?.unit, s.text);
      if (p.status === 'ok') s.onCommit(p.value, s.way, 'close');
      else s.onCancel();
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [anchor, subject]);

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit('enter');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commit(event.shiftKey ? 'back' : 'tab');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }

  // The way switch: keeps the number, saves it again with that way (G 5).
  function chooseWay(index) {
    if (index === way) return;
    setWay(index);
    setError(false);
    if (okValue !== null) commit('way', index);
    inputRef.current?.focus();
  }

  const letter = okValue !== null ? previewLetter(subject, way, group, okValue) : null;
  const reached = letter ? T.reachedLine(letter, reachedWords(wayObj, group, letter), wayBracketWords(wayObj, group)) : '';
  const feet = okValue !== null && unitKind(wayObj?.unit) === 'inches' && okValue >= 12 ? feetAndInches(okValue) : null;

  return (
    <div
      ref={boxRef}
      className="bbg-editor"
      role="group"
      aria-label={T.EDITOR_LABEL(name, subject?.name ?? '')}
      style={place ?? { top: -9999, left: -9999 }}
      onKeyDown={handleKeyDown}
    >
      {ways.length > 1 && (
        <div className="segmented bbg-ways" role="radiogroup" aria-label={T.WAY_SWITCH_LABEL(subject?.name ?? '')}>
          {ways.map((w, index) => (
            <button
              key={w.name ?? index}
              type="button"
              role="radio"
              aria-checked={index === way ? 'true' : 'false'}
              className={`segment${index === way ? ' is-checked' : ''}`}
              onClick={() => chooseWay(index)}
            >
              {w.name}
            </button>
          ))}
        </div>
      )}
      <div className="bbg-editor-row">
        <input
          ref={inputRef}
          id={`${baseId}-n`}
          type="text"
          inputMode={unitKind(wayObj?.unit) === 'minutes' ? 'text' : 'decimal'}
          autoComplete="off"
          className={`input bbg-editor-input${error ? ' is-invalid' : ''}`}
          aria-label={T.numberLabel(name, subject?.name ?? '', unitWord)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${baseId}-err` : `${baseId}-reached`}
          value={text}
          maxLength={8}
          onChange={(event) => {
            setText(event.target.value);
            setError(false);
          }}
        />
        <span className="bbg-editor-unit">{unitWord}</span>
      </div>
      {error ? (
        <p id={`${baseId}-err`} className="bbg-editor-error" role="alert">
          {/* ti-alert-triangle = a problem with the number */}
          <IconAlertTriangle size={14} aria-hidden="true" />
          {T.NUMBER_RANGE}
        </p>
      ) : (
        <p id={`${baseId}-reached`} className="bbg-editor-reached" aria-live="polite">
          {reached}
        </p>
      )}
      {feet && <p className="bbg-editor-feet">{feet}</p>}
      <p className="bbg-editor-hint">{isTouch ? T.EDITOR_HINT_TOUCH : T.EDITOR_HINT}</p>
    </div>
  );
}
