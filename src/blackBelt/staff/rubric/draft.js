// draft.js — the rubric editor's "draft": one Dan being edited, kept only in the browser.
// Why it exists: CONTRACT-0024 §10.3 (R3–R8). A Dan is edited as a whole and saved once
// (rulebook v0.923). While someone types, a number field may hold something that isn't a number
// yet ("2." on the way to "2.5", or an empty box). The draft keeps exactly what was typed, so
// nothing jumps around under the cursor, and this file turns it into a real Dan (numbers only)
// whenever the screen needs to check it or save it.
//
// It is plain JavaScript (no React), so every rule is easy to read and test:
//   numberOrText(text)        what a number box stores: a number when the text IS one, else the text
//   prepareDan(draft)         → { dan, badPaths }: a Dan with numbers only (text that isn't a number
//                               becomes null) and the boxes that didn't hold a number ({ path, empty })
//   checkDraft(draft, danNo)  → { dan, problems }: the prepared, tidied Dan and every problem —
//                               the shared rubric checker's (danProblems, the JS twin of the
//                               database's check) plus "not a number" for boxes the checker can't see
//   changedRows(saved, draft) → which rows to tint pale amber (v0.931 / v0.935)
//   where(problem)            → the screen place a problem belongs to (a key such as 'pass:0')
import { danProblems, normalizeDan, workedPoints } from '../../../lib/blackBelt/rubric.js';

// ----- Typed numbers -----

// A number written the "plain" way JavaScript writes it back: 12, 2.5, 0.05 (not "2.", "02",
// "2.50" or " 3"). Only then is the typed text replaced by a number — otherwise typing "2.0" on
// the way to "2.05" would turn into "2" under the cursor.
const PLAIN_NUMBER = /^(0|[1-9]\d*)(\.\d*[1-9])?$/;

export function numberOrText(text) {
  const s = String(text ?? '');
  return PLAIN_NUMBER.test(s) ? Number(s) : s;
}

// What a number box shows for a stored value (number, typed text, or null for an empty box).
export const fieldText = (value) => (value === null || value === undefined ? '' : String(value));

// Typed text → a number, or null when it isn't one. Thousands commas are not allowed (they never
// appear in a rubric), but spaces around the number are forgiven.
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

// ----- From draft to Dan -----

// Walks every number slot of a Dan. `visit(value, path, kind)` returns the new value.
// kind: 'age' (empty = youngest / oldest), 'optional' (empty = none, e.g. the limit) or 'number'.
function mapNumbers(dan, visit) {
  const at = (path, value, kind) => visit(value, path, kind);
  const pass = dan.pass ?? {};
  return {
    ...dan,
    pass: {
      ...pass,
      brackets: (pass.brackets ?? []).map((b, i) => ({
        ...b,
        from: at(['pass', 'brackets', i, 'from'], b.from, 'age'),
        to: at(['pass', 'brackets', i, 'to'], b.to, 'age'),
        pass_mark: at(['pass', 'brackets', i, 'pass_mark'], b.pass_mark, 'number'),
      })),
    },
    parts: (dan.parts ?? []).map((part, p) => ({
      ...part,
      grade_points: Object.fromEntries(Object.entries(part.grade_points ?? {}).map(([g, v]) => [g, at(['parts', p, 'grade_points', g], v, 'number')])),
      subjects: (part.subjects ?? []).map((s, i) => ({
        ...s,
        credits: at(['parts', p, 'subjects', i, 'credits'], s.credits, 'number'),
        points: Object.fromEntries(Object.entries(s.points ?? {}).map(([g, v]) => [g, at(['parts', p, 'subjects', i, 'points', g], v, 'number')])),
        ways: (s.ways ?? []).map((w, wi) => ({
          ...w,
          brackets: (w.brackets ?? []).map((b, bi) => ({
            ...b,
            from: at(['parts', p, 'subjects', i, 'ways', wi, 'brackets', bi, 'from'], b.from, 'age'),
            to: at(['parts', p, 'subjects', i, 'ways', wi, 'brackets', bi, 'to'], b.to, 'age'),
            cutoffs: Object.fromEntries(Object.entries(b.cutoffs ?? {}).map(([g, v]) => [g, at(['parts', p, 'subjects', i, 'ways', wi, 'brackets', bi, 'cutoffs', g], v, 'number')])),
          })),
        })),
      })),
    })),
    extra_points: {
      ...dan.extra_points,
      limit: at(['extra_points', 'limit'], dan.extra_points?.limit, 'optional'),
      items: (dan.extra_points?.items ?? []).map((item, i) => {
        const rule = item.rule ?? {};
        if (rule.kind === 'per_count') return { ...item, rule: { ...rule, points_each: at(['extra_points', 'items', i, 'points_each'], rule.points_each, 'number') } };
        return {
          ...item,
          rule: {
            ...rule,
            steps: (rule.steps ?? []).map((st, si) => ({
              at_least: at(['extra_points', 'items', i, 'steps', si, 'at_least'], st.at_least, 'number'),
              points: at(['extra_points', 'items', i, 'steps', si, 'points'], st.points, 'number'),
            })),
          },
        };
      }),
    },
  };
}

export function prepareDan(draft) {
  const badPaths = [];
  const dan = mapNumbers(draft, (value, path, kind) => {
    const empty = value === null || value === undefined || String(value).trim() === '';
    if (empty) {
      if (kind === 'age' || kind === 'optional') return null;
      badPaths.push({ path, empty: true });
      return null;
    }
    const n = toNumber(value);
    if (n === null) badPaths.push({ path, empty: false });
    return n;
  });
  // Texts: an empty note / make-up sentence means "none" (the database stores null, never "").
  dan.pass = { ...dan.pass, makeup: emptyToNull(dan.pass.makeup) };
  dan.extra_points = { ...dan.extra_points, note: emptyToNull(dan.extra_points.note) };
  dan.parts = dan.parts.map((part) => ({ ...part, subjects: part.subjects.map((s) => ({ ...s, note: emptyToNull(s.note) })) }));
  return { dan, badPaths };
}

const emptyToNull = (text) => (text === null || text === undefined || String(text).trim() === '' ? null : text);

// The Dan as it will be saved (names tidied, worked-out points recomputed). The shared tidy-up
// must never stop the screen, so a failure just keeps the Dan as it is.
function tidy(dan) {
  try {
    return normalizeDan(dan) ?? dan;
  } catch {
    return dan;
  }
}

// Where a path points, as the keys a problem object uses (contract §3.3): part code, subject id,
// way index, bracket index, item index, step index.
function locationOf(path, dan) {
  const loc = {};
  if (path[0] === 'pass') {
    loc.bracket = path[2];
    loc.field = path[3];
  } else if (path[0] === 'parts') {
    const part = dan.parts[path[1]];
    loc.part = part?.code;
    if (path[2] === 'grade_points') loc.field = 'grade_points';
    if (path[2] === 'subjects') {
      loc.subject = part?.subjects?.[path[3]]?.id;
      loc.field = path[4];
      if (path[4] === 'ways') {
        loc.way = path[5];
        loc.bracket = path[7];
        loc.field = 'cutoffs';
      }
    }
  } else if (path[0] === 'extra_points') {
    if (path[1] === 'limit') loc.field = 'limit';
    else {
      loc.item = path[2];
      if (path[3] === 'steps') loc.step = path[4];
      loc.field = path[3] === 'steps' ? path[5] : path[3];
    }
  }
  return loc;
}

export function checkDraft(draft, danNo) {
  const { dan: prepared, badPaths } = prepareDan(draft);
  const dan = tidy(prepared);
  let problems;
  try {
    problems = danProblems(dan, danNo) ?? [];
  } catch {
    problems = [{ code: 'shape' }];
  }
  // A worked-out subject's points follow its part's grade points: while those are wrong, the
  // subjects would repeat the same problem many times, so only the grade points line is shown.
  const badGradePoints = new Set(problems.filter((p) => p.code === 'grade_points_order' || p.code === 'grade_points_range').map((p) => p.part));
  if (badGradePoints.size > 0) {
    problems = problems.filter((p) => {
      if (!badGradePoints.has(p.part) || !p.subject || !['points_order', 'points_range', 'points_not_worked_out'].includes(p.code)) return true;
      const s = dan.parts.find((x) => x.code === p.part)?.subjects?.find((x) => x.id === p.subject);
      return s?.points_mode !== 'worked';
    });
  }
  if (badPaths.length > 0) {
    // A box that isn't a number made the shared checker see null there, which it reports as a
    // "shape" problem. The screen says "Enter a number" at that box instead.
    problems = problems.filter((p) => p.code !== 'shape');
    problems = [...badPaths.map(({ path, empty }) => ({ code: 'not_a_number', empty, ...locationOf(path, draft) })), ...problems];
  }
  return { dan, problems };
}

// ----- What changed (the pale amber rows) -----

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// The keys of the rows that differ from the saved Dan:
//   'pass:<i>'  'pass:no_d'  'pass:makeup'  'part:<code>:name'  'part:<code>:gp'
//   'subject:<id>'  'extra:settings'  'extra:item:<i>'
export function changedRows(saved, draft) {
  const keys = new Set();
  if (!saved || !draft) return keys;
  const { dan } = prepareDan(draft);
  const sb = saved.pass?.brackets ?? [];
  (dan.pass?.brackets ?? []).forEach((b, i) => {
    if (!same(b, sb[i])) keys.add(`pass:${i}`);
  });
  if (Boolean(dan.pass?.no_d) !== Boolean(saved.pass?.no_d)) keys.add('pass:no_d');
  if (!same(emptyToNull(dan.pass?.makeup), emptyToNull(saved.pass?.makeup))) keys.add('pass:makeup');
  for (const part of dan.parts ?? []) {
    const old = (saved.parts ?? []).find((p) => p.code === part.code);
    if (!old || old.name !== part.name) keys.add(`part:${part.code}:name`);
    if (!old || !same(part.grade_points, old.grade_points)) keys.add(`part:${part.code}:gp`);
    const oldSubjects = old?.subjects ?? [];
    part.subjects.forEach((s, i) => {
      const before = oldSubjects.find((x) => x.id === s.id);
      // A subject whose worked-out points only moved because the credits or the grade points
      // changed is tinted for those (its row shows the new Up to), so compare everything.
      const now = s.points_mode === 'worked' ? { ...s, points: null } : s;
      const then = before && before.points_mode === 'worked' ? { ...before, points: null } : before;
      if (!before || !same(now, then) || oldSubjects.indexOf(before) !== i) keys.add(`subject:${s.id}`);
    });
  }
  const se = saved.extra_points ?? {};
  const de = dan.extra_points ?? {};
  if (de.counts_toward_total !== se.counts_toward_total || !same(de.limit, se.limit) || de.to_confirm !== se.to_confirm || !same(emptyToNull(de.note), emptyToNull(se.note))) {
    keys.add('extra:settings');
  }
  (de.items ?? []).forEach((item, i) => {
    if (!same(item, (se.items ?? [])[i])) keys.add(`extra:item:${i}`);
  });
  return keys;
}

// ----- Where a problem shows on the screen -----

// Codes about the inside of a subject's dialog (the row says "Check the cut-offs …").
const DIALOG_CODES = new Set([
  'ways_count', 'way_name', 'unit', 'direction', 'cutoffs_range', 'cutoffs_order',
  'brackets_count', 'bracket_ages', 'brackets_order', 'brackets_gap', 'brackets_overlap', 'brackets_ends',
]);
const POINTS_CODES = new Set(['points_range', 'points_order', 'points_not_worked_out']);

// → a place key:
//   'pass:<i>' (a pass-mark row) · 'pass:list' (the pass brackets as a whole) · 'pass:makeup' ·
//   'part:<code>:name' · 'part:<code>:gp' · 'part:<code>:list' ·
//   'subject:<id>:name' · 'subject:<id>:credits' · 'subject:<id>:inner' (in its dialog) ·
//   'extra:settings' · 'extra:item:<i>' · 'general'
export function where(problem) {
  const p = problem ?? {};
  const code = p.code;
  if (p.subject) {
    if (code === 'subject_name' || code === 'subject_name_duplicate') return `subject:${p.subject}:name`;
    if (code === 'credits' || (code === 'not_a_number' && p.field === 'credits')) return `subject:${p.subject}:credits`;
    return `subject:${p.subject}:inner`;
  }
  if (p.part) {
    if (code === 'part_name' || code === 'part_name_duplicate') return `part:${p.part}:name`;
    if (code === 'grade_points_range' || code === 'grade_points_order' || (code === 'not_a_number' && p.field === 'grade_points')) return `part:${p.part}:gp`;
    return `part:${p.part}:list`;
  }
  if (code && code.startsWith('extra_')) {
    if (p.item !== undefined && p.item !== null) return `extra:item:${p.item}`;
    return 'extra:settings';
  }
  if (code === 'not_a_number') {
    if (p.item !== undefined && p.item !== null) return `extra:item:${p.item}`;
    if (p.field === 'limit') return 'extra:settings';
    if (p.bracket !== undefined && p.bracket !== null) return `pass:${p.bracket}`;
  }
  if (code === 'makeup') return 'pass:makeup';
  if (code === 'pass_mark_range' || code === 'pass_mark_too_high') return p.bracket !== undefined && p.bracket !== null ? `pass:${p.bracket}` : 'pass:list';
  if (code === 'bracket_empty' && p.bracket !== undefined && p.bracket !== null) return `pass:${p.bracket}`;
  if (code && (code.startsWith('brackets_') || code === 'bracket_ages' || code === 'bracket_empty')) return 'pass:list';
  return 'general';
}

// Which kind of line a subject row shows for a problem inside its dialog.
export function innerKind(problem) {
  if (DIALOG_CODES.has(problem.code) || (problem.code === 'not_a_number' && problem.field === 'cutoffs')) return 'cutoffs';
  if (POINTS_CODES.has(problem.code) || (problem.code === 'not_a_number' && problem.field === 'points')) return 'points';
  if (problem.code === 'limited_to') return 'who';
  return 'other';
}

// The points a subject is worth per letter right now (its own points, or worked out from the
// part's grade points). Numbers that aren't typed fully yet count as nothing.
export function pointsNow(part, subject) {
  if (subject.points_mode === 'own') return subject.points ?? {};
  try {
    return workedPoints(part, subject) ?? {};
  } catch {
    return {};
  }
}

// A problem that only says "this is still empty" (a new row's name, an empty number box). The
// editor shows those after Save was pressed, not while the admin is still filling the row in.
export function isQuiet(problem, draft) {
  if (problem.code === 'not_a_number') return problem.empty === true;
  const blank = (v) => typeof v !== 'string' || v.trim() === '';
  if (problem.code === 'subject_name') {
    const part = draft?.parts?.find((p) => p.code === problem.part);
    return blank(part?.subjects?.find((s) => s.id === problem.subject)?.name);
  }
  if (problem.code === 'part_name') return blank(draft?.parts?.find((p) => p.code === problem.part)?.name);
  if (problem.code === 'extra_item_name') return blank(draft?.extra_points?.items?.[problem.item]?.name);
  if (problem.code === 'unit' || problem.code === 'way_name') return true; // shown in the subject's dialog as it is typed
  return false;
}
