// parts.jsx — small pieces the Grading grid, the phone card and the picker sheet share: the Result
// tag, the Total, the kept-grade note, the make-up label and a row's gray lines.
// Why it exists: copied in pattern from Star's grading/parts.jsx — the grid (GradeGrid.jsx), the
// picker (PickerSheet.jsx) and the card (GradeCard.jsx) must word and colour these EXACTLY the
// same, so they're written once. The words are chosen by model.js from the database's result; the
// screens never work a result out (v0.938).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { schoolName } from '../text.js';
import { groupWords, resultView, retestNames, totalView } from './model.js';
import * as T from './text.js';

// "Worcester · 18 and over" (G 2)
export const rowLine = (row, result) => T.rowLine(schoolName(row.locationCode), groupWords(result));

// The amber "Make-up" pill (v0.947: #faeeda / #8a5a00, 10.5px semibold)
export function MakeupPill() {
  return <span className="bbg-pill">{T.MAKEUP_LABEL}</span>;
}

// "from Spring 2027 · retests Free sparring" (G 14)
export const makeupLine = (row, result, rubric) => T.makeupFromLine(row.makeupOfCycleName ?? '', retestNames(result, rubric));

// The Result column. ctx = { saves, isAdmin, rubric, submissionsDue }; onChooseSubjects(row, opener)
// is the admins' link (without it an admin still sees the words, in link blue — the picker sheet's
// rows are buttons already).
export function ResultTag({ row, ctx, onChooseSubjects }) {
  const { saves, isAdmin, rubric, submissionsDue } = ctx;
  const tag = resultView(saves.resultFor(row), { isMakeup: row.isMakeup, isAdmin, save: saves.rowSave(row.id), rubric, submissionsDue });
  if (!tag.text) return null;
  return (
    <span className={`bbg-result bbg-result--${tag.tone}`}>
      {tag.text}
      {tag.link === 'choose_subjects' && (
        <>
          {' · '}
          {onChooseSubjects ? (
            <button type="button" className="link-button bbg-inline-link" onClick={(event) => onChooseSubjects(row, event.currentTarget)}>
              {T.CHOOSE_SUBJECTS}
            </button>
          ) : (
            <span className="bbg-choose-text">{T.CHOOSE_SUBJECTS}</span>
          )}
        </>
      )}
      {tag.after && <span className="bbg-result-after"> {tag.after}</span>}
    </span>
  );
}

// The Total: "305.75", "65.5 so far" ("so far" gray), or "—" (G 7, G 30).
export function TotalText({ row, saves, inline = false }) {
  const v = totalView(saves.resultFor(row));
  if (v.text) return v.text;
  return (
    <>
      <span className="bbg-total-n">{v.number}</span>
      {v.soFar && <small className={`bbg-sofar${inline ? ' is-inline' : ''}`}> {T.SO_FAR}</small>}
    </>
  );
}

// The note of a kept make-up grade: "Kept from Spring 2027 · B+" / "Kept grades can't be changed …".
// variant 'pop' = under a grid cell (closes on a click elsewhere or Esc); 'line' = under a card line.
export function KeptNote({ cycleName, value, variant = 'pop', onClose, id, anchor = null }) {
  const boxRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [place, setPlace] = useState(null);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useLayoutEffect(() => {
    if (variant !== 'pop' || !anchor) return undefined;
    function placeBox() {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 16);
      const height = boxRef.current?.offsetHeight ?? 0;
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
  }, [variant, anchor]);
  useEffect(() => {
    if (variant !== 'pop') return undefined;
    function handlePointerDown(event) {
      const path = event.composedPath();
      if (path.includes(boxRef.current) || (anchor && path.includes(anchor))) return;
      onCloseRef.current();
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') onCloseRef.current(true);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [variant, anchor]);
  return (
    <div
      ref={boxRef}
      id={id}
      className={variant === 'pop' ? 'bbg-keptpop' : 'bbg-keptline'}
      role="note"
      aria-label={T.KEPT_NOTE_LABEL}
      style={variant === 'pop' ? (place ?? { top: -9999, left: -9999 }) : undefined}
    >
      <b>{T.keptNoteTitle(cycleName ?? '', value)}</b>
      <span>{T.keptNoteBody(cycleName ?? '')}</span>
    </div>
  );
}
