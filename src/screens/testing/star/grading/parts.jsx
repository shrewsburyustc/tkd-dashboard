// parts.jsx — small pieces the Grading grid, the phone view and the one-candidate card share: the
// Result tag, the Total text, the kept-grade note and the candidate's gray line.
// Why it exists: the grid (GradeGrid.jsx), the phone's picker sheet and the card (GradeCard.jsx — also
// used by the private grading page) must word and colour these EXACTLY the same, so they're
// written once. The words come from src/lib/star/gradingText.js through the pure rules in
// gradingCore.js (resultTag, totalText): the screens never work a result out (v0.158).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { resultTag, totalText } from '../../../../lib/star/gradingApi.js';
import { schoolName } from '../candidates/text.js';
import * as T from './text.js';

const { G } = T;

// "Shrewsbury · 0 → 1" / "Worcester · 1 → 2 · make-up"
export function candidateLine(row, { withSchool = true } = {}) {
  const parts = [];
  if (withSchool) parts.push(schoolName(row.locationCode));
  parts.push(T.starsMove(row.starsFrom, row.starsTo));
  if (row.isMakeup) parts.push(T.MAKEUP);
  return parts.join(' · ');
}

// The Result column (proposal 25): green "Passed", amber "⚠ Make-up · …" / "⚠ Not saved · 2 grades",
// gray "7 of 11 left" / "Not started" / "Saving…". Admins get the "Choose subjects" link after a
// below-the-pass-mark make-up; staff the gray "· an admin chooses subjects".
//   saves: the save engine (useStarGradingSaves) · onChooseSubjects(row, opener): admins only;
//   without it an admin still sees the words "Choose subjects" (not a button: the picker sheet's rows
//   are buttons already)
export function ResultTag({ row, saves, isAdmin, onChooseSubjects }) {
  const tag = resultTag(saves.resultFor(row), { isMakeup: row.isMakeup, isAdmin, save: saves.rowSave(row.id) });
  if (!tag.text) return null;
  return (
    <span className={`stg-result stg-result--${tag.tone}`}>
      {tag.text}
      {tag.link === 'choose_subjects' && (
        <>
          {' · '}
          {onChooseSubjects ? (
            // st-inline-link (star.css): on touch the link keeps its line height and gets its 44px tap
            // area from an invisible ::after, so the words never jump onto a line of their own.
            <button type="button" className="link-button st-inline-link stg-choose-link" onClick={(event) => onChooseSubjects(row, event.currentTarget)}>
              {G.CHOOSE_SUBJECTS}
            </button>
          ) : (
            // Inside a row that is itself a button (the phone's picker sheet) a second button isn't
            // allowed: the words show in link blue, and tapping the row opens the candidate's card,
            // which has the working link.
            <span className="stg-choose-text">{G.CHOOSE_SUBJECTS}</span>
          )}
        </>
      )}
      {tag.after && <span className="stg-result-after"> {tag.after}</span>}
    </span>
  );
}

// The Total: "280", a make-up's "250 so far" (the "so far" in gray), or "—" (proposal 2).
export function TotalText({ row, saves }) {
  const text = totalText(saves.resultFor(row), row.isMakeup);
  const soFar = text.endsWith(' so far');
  if (!soFar) return text;
  return (
    <>
      {text.slice(0, -' so far'.length)}
      <small className="stg-sofar"> so far</small>
    </>
  );
}

// The note of a kept make-up grade (proposal 9): "Kept from Spring 2026 · B+" / "Kept grades can't be
// changed on this testing. …". variant 'pop' = under a grid cell (closes on a click elsewhere or
// Esc); 'line' = a gray box under the subject line of a card.
//   subject: the result's subject ({ grade, keptFromEventName }) · onClose()
//   anchor: ('pop') the cell element — the note is drawn with position: fixed under it, so the grid's
//   scrolling box can't cut it off.
export function KeptNote({ subject, variant = 'pop', onClose, id, anchor = null }) {
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
  const from = subject.keptFromEventName ?? '';
  return (
    <div
      ref={boxRef}
      id={id}
      className={variant === 'pop' ? 'stg-keptpop' : 'stg-keptline'}
      role="note"
      aria-label={T.KEPT_NOTE_LABEL}
      style={variant === 'pop' ? (place ?? { top: -9999, left: -9999 }) : undefined}
    >
      <b>{G.keptNoteTitle(from, subject.grade)}</b>
      <span>{G.keptNoteBody(from)}</span>
    </div>
  );
}
