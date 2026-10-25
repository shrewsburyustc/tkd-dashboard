// useRubricDraft.js — the "brain" of the rubric editor: the draft of ONE Dan and every change an
// admin can make to it (mockups R3–R9).
// Why it exists: CONTRACT-0024 §10.3. The draft lives here, outside the editor's drawing, so a
// screen lock hides the editor and brings it back exactly as it was, and the card can ask "are
// there unsaved changes?" before any way out (R10).
//
//   const d = useRubricDraft();
//   d.start(savedDan)            begin editing (the draft = a copy of the saved Dan)
//   d.stop()                     back to the read view (Cancel, Discard, after a save)
//   d.base / d.draft             the saved Dan the edit started from / the draft
//   d.check                      { dan, problems } — the draft as it would be saved, and what's wrong
//   d.changes                    the change lines (rubric.js danDiff) — their count is the gray
//                                "3 changes not saved"
//   d.changed                    the keys of the rows to tint (draft.js changedRows)
//   d.update(fn)                 any change: fn(draft) → new draft
//   … and named helpers for each row (see the bottom of this file).
// Nothing here talks to the database: RubricCard.jsx saves.
import { useMemo, useState } from 'react';
import { danDiff, partLetters, removeBracket, splitBracket, subjectLetters, workedPoints } from '../../../lib/blackBelt/rubric.js';
import { changedRows, checkDraft, prepareDan } from './draft.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

// Moves list[from] to position `to` (a new list).
function moved(list, from, to) {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return list;
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

// The worked-out points of a subject from the draft's (maybe half-typed) numbers; letters that
// can't be worked out yet are left empty.
export function workedNow(part, subject) {
  const { dan } = prepareDan({ pass: { brackets: [] }, parts: [{ ...part, subjects: [subject] }], extra_points: { items: [] } });
  const p = dan.parts[0];
  return workedPoints(p, p.subjects[0]);
}

// A subject's points with the letters its part and scoring need: kept where they exist, else
// worked out (used when the scoring changes, which changes the letters).
export function pointsForLetters(part, subject) {
  const letters = subjectLetters(part.code, subject.scoring);
  const worked = workedNow(part, subject);
  return Object.fromEntries(letters.map((l) => [l, subject.points?.[l] ?? worked[l] ?? '']));
}

// The draft with the pass brackets and every subject's "who does it" taken from `next` (the
// result of a split or a remove), everything else as typed.
function withPass(d, next) {
  const limitOf = (pi, si, s) => {
    const n = next.parts[pi]?.subjects[si];
    return n && n.id === s.id ? n.limited_to : s.limited_to;
  };
  return {
    ...d,
    pass: { ...d.pass, brackets: next.pass.brackets },
    parts: d.parts.map((p, pi) => ({ ...p, subjects: p.subjects.map((s, si) => ({ ...s, limited_to: limitOf(pi, si, s) })) })),
  };
}

export function useRubricDraft() {
  const [state, setState] = useState(null); // { base, draft, copiedFrom } while editing

  const base = state?.base ?? null;
  const draft = state?.draft ?? null;
  const check = useMemo(() => (draft ? checkDraft(draft, draft.dan) : null), [draft]);
  const changes = useMemo(() => {
    if (!base || !check) return [];
    try {
      return danDiff(base, check.dan);
    } catch {
      return [];
    }
  }, [base, check]);
  const changed = useMemo(() => (base && draft ? changedRows(base, draft) : new Set()), [base, draft]);

  const update = (fn) => setState((s) => (s ? { ...s, draft: fn(s.draft) } : s));
  const mapPart = (code, fn) => update((d) => ({ ...d, parts: d.parts.map((p) => (p.code === code ? fn(p) : p)) }));
  const mapSubjects = (code, fn) => mapPart(code, (p) => ({ ...p, subjects: fn(p.subjects) }));
  const mapItems = (fn) => update((d) => ({ ...d, extra_points: { ...d.extra_points, items: fn(d.extra_points.items) } }));

  return {
    editing: state !== null,
    base,
    draft,
    check,
    changes,
    changed,
    copiedFrom: state?.copiedFrom ?? null,
    update,
    start: (saved) => setState({ base: saved, draft: clone(saved), copiedFrom: null }),
    // After "Reload" (another admin saved): their version becomes both the base and the draft.
    restart: (saved) => setState({ base: saved, draft: clone(saved), copiedFrom: null }),
    stop: () => setState(null),

    // ----- To pass (R6) -----
    setPassBracket: (i, changes) => update((d) => ({ ...d, pass: { ...d.pass, brackets: d.pass.brackets.map((b, k) => (k === i ? { ...b, ...changes } : b)) } })),
    addPassBracket: () =>
      update((d) => {
        const last = d.pass.brackets[d.pass.brackets.length - 1];
        return { ...d, pass: { ...d.pass, brackets: [...d.pass.brackets, { from: '', to: null, pass_mark: last?.pass_mark ?? '' }] } };
      }),
    // Split / Remove work on the prepared numbers (the shared helpers need real ages). They
    // return false when the age isn't inside the bracket / the bracket is the only one.
    splitPassBracket: (i, age) => {
      const next = draft ? splitBracket(prepareDan(draft).dan, i, age) : null;
      if (!next) return false;
      update((d) => withPass(d, next));
      return true;
    },
    removePassBracket: (i) => {
      const next = draft ? removeBracket(prepareDan(draft).dan, i) : null;
      if (!next) return false;
      update((d) => withPass(d, next));
      return true;
    },
    setNoD: (value) => update((d) => ({ ...d, pass: { ...d.pass, no_d: value } })),
    setMakeup: (text) => update((d) => ({ ...d, pass: { ...d.pass, makeup: text } })),

    // ----- Parts -----
    setPartName: (code, name) => mapPart(code, (p) => ({ ...p, name })),
    setGradePoint: (code, letter, value) => mapPart(code, (p) => ({ ...p, grade_points: { ...p.grade_points, [letter]: value } })),

    // ----- Subjects (R3, R4) -----
    setSubject: (code, id, changes) => mapSubjects(code, (list) => list.map((s) => (s.id === id ? { ...s, ...changes } : s))),
    putSubject: (code, subject) =>
      mapSubjects(code, (list) => (list.some((s) => s.id === subject.id) ? list.map((s) => (s.id === subject.id ? subject : s)) : [...list, subject])),
    removeSubject: (code, id) => mapSubjects(code, (list) => list.filter((s) => s.id !== id)),
    moveSubject: (code, id, to) => mapSubjects(code, (list) => moved(list, list.findIndex((s) => s.id === id), to)),

    // ----- Extra points (R7) -----
    setExtra: (changes) => update((d) => ({ ...d, extra_points: { ...d.extra_points, ...changes } })),
    setItem: (i, changes) => mapItems((items) => items.map((item, k) => (k === i ? { ...item, ...changes } : item))),
    setItemKind: (i, kind) =>
      mapItems((items) =>
        items.map((item, k) => {
          if (k !== i || item.rule?.kind === kind) return item;
          const rule = kind === 'per_count' ? { kind, points_each: 1 } : { kind, steps: [{ at_least: 1, points: '' }] };
          return { ...item, rule };
        }),
      ),
    setStep: (i, s, changes) =>
      mapItems((items) => items.map((item, k) => (k === i ? { ...item, rule: { ...item.rule, steps: item.rule.steps.map((st, j) => (j === s ? { ...st, ...changes } : st)) } } : item))),
    addStep: (i) => mapItems((items) => items.map((item, k) => (k === i ? { ...item, rule: { ...item.rule, steps: [...item.rule.steps, { at_least: '', points: '' }] } } : item))),
    removeStep: (i, s) => mapItems((items) => items.map((item, k) => (k === i ? { ...item, rule: { ...item.rule, steps: item.rule.steps.filter((_, j) => j !== s) } } : item))),
    addItem: (name) => mapItems((items) => [...items, { name, rule: { kind: 'steps', steps: [{ at_least: 1, points: '' }] } }]),
    removeItem: (i) => mapItems((items) => items.filter((_, k) => k !== i)),
    moveItem: (i, to) => mapItems((items) => moved(items, i, to)),

    // ----- Copy from another Dan (R9): the other Dan's saved version, renumbered -----
    copyFrom: (copy, fromDan) => setState((s) => (s ? { ...s, draft: clone(copy), copiedFrom: fromDan } : s)),

    // The letters of a part's grade points (for the editor's fields).
    partLetters,
  };
}
