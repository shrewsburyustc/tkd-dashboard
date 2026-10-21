// resultRules.js — Star testing's age-group, Assistant Instructor and RESULT rules (contract 0006
// §5.4–§5.5), as plain JavaScript.
// Why it exists: the PREVIEW database (mockStarCandidates.js now, mockStarGrading.js in phase 5) has
// to work out a candidate's result exactly like the real database's star_candidate_result — the
// make-up list, the detail view's `result` and the "grades exist" count all depend on it.
//
// FOR THE FAKE AND THE CHECKS ONLY. The screens never work out a result themselves (v0.158): they
// show the `result` the database sends (star_candidate_detail, star_event_results, …).
//
// It is PURE: no React, no database, no browser. Rows are the database's snake_case rows.
//
// The rules (the migration's 12e–12g):
//   age group   'child' when the date of birth is known and the age ON THE EVENT'S TESTING DATE is
//               child_max_age (12) or less; otherwise 'adult' (13 and up) — also with no DOB (S3)
//   Assistant Instructor's letter  no count → not graded; else the first of A+, A, B+, B, C+, C
//               whose minimum (the event copy, that age group's column) is at most the count; else D
//   points      credits × the event copy's value of the letter
//   total       the points of the graded subjects (a running total while incomplete)
//   status      in this order: 'withdrawn' · 'testing_privately' (not complete, private day set,
//               OPEN-13) · 'not_finished' (not complete) · 'passed' (complete, no D, total ≥ pass
//               mark) · 'makeup' (everything else)
//   needs       a make-up retests the D subjects if there is any D (OPEN-12); else (below the pass
//               mark) the subjects an admin chose (kind 'chosen'); choice_needed = below, no D,
//               nothing chosen yet (OPEN-11)
//
// Numbers: grade values have one decimal, credits are whole, so every total is worked out in
// TENTHS (whole numbers) — no floating-point surprises like 0.1 + 0.2.

export const GRADE_LETTERS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];
// The assistant table's minimum columns, A+ … C (D = below the C minimum, never stored).
const MIN_SUFFIXES = ['a_plus', 'a', 'b_plus', 'b', 'c_plus', 'c'];

const tenths = (value) => Math.round(Number(value) * 10);

// Whole years between a date of birth and a day ('YYYY-MM-DD' text), like PostgreSQL's
// extract(year from age(day, dob)). null when either is missing.
export function ageOn(dob, day) {
  if (!dob || !day) return null;
  const [y1, m1, d1] = dob.split('-').map(Number);
  const [y2, m2, d2] = day.split('-').map(Number);
  let years = y2 - y1;
  if (m2 < m1 || (m2 === m1 && d2 < d1)) years -= 1;
  return years;
}

// 'child' | 'adult' (§5.4). The private day never changes it.
export function ageGroupOf(dob, testingDate, childMaxAge) {
  const age = ageOn(dob, testingDate);
  return age !== null && age <= childMaxAge ? 'child' : 'adult';
}

// The Assistant Instructor letter from the class count (null = not entered yet → not graded).
// assistant: the event's star_event_assistant row.
export function assistantGrade(assistant, ageGroup, count) {
  if (count === null || count === undefined || !assistant) return null;
  const column = ageGroup === 'child' ? 'child' : 'adult';
  for (let i = 0; i < MIN_SUFFIXES.length; i += 1) {
    if (count >= assistant[`${column}_${MIN_SUFFIXES[i]}`]) return GRADE_LETTERS[i];
  }
  return 'D';
}

// The "has the result changed?" key (§5.5). The real database sends an md5 of this same text;
// the preview sends the text itself. Either way the screens only compare two keys for equality.
export function resultKey(status, totalTenths, needsIds) {
  return `${status}|${(totalTenths / 10).toFixed(1)}|${needsIds.join(',')}`;
}

// THE result of one candidate, in the database's shape (§5.5 "Ok shape").
//   candidate       the star_candidates row (its current Dan, stars, status, DOB, counts, private day)
//   testingDate     the event's testing date
//   dan             the event copy of the candidate's Dan (star_event_dans: pass_mark)
//   categories      the event copy's subjects (star_event_categories) — any Dan; filtered here
//   gradeValues     the event copy's 7 grade values (star_event_grades)
//   assistant       the event copy's assistant row (star_event_assistant)
//   grades          the candidate's grade rows (star_grades)
//   makeupSubjects  the candidate's make-up subject rows (star_makeup_subjects)
export function candidateResult({ candidate: c, testingDate, dan, categories, gradeValues, assistant, grades, makeupSubjects }) {
  const ageGroup = assistant ? ageGroupOf(c.date_of_birth ?? null, testingDate, assistant.child_max_age) : 'adult';
  const aiGrade = assistantGrade(assistant, ageGroup, c.assistant_classes ?? null);
  const valueOf = new Map((gradeValues ?? []).map((v) => [v.grade, tenths(v.value)]));
  const mine = (grades ?? []).filter((g) => g.candidate_id === c.id);
  const moves = (makeupSubjects ?? []).filter((m) => m.candidate_id === c.id);

  const subjects = (categories ?? [])
    .filter((k) => k.event_id === c.event_id && k.dan === c.dan)
    .sort((a, b) => a.position - b.position)
    .map((k) => {
      const row = k.from_class_count ? null : mine.find((g) => g.event_category_id === k.id) ?? null;
      const grade = k.from_class_count ? aiGrade : row?.grade ?? null;
      const value = grade === null ? undefined : valueOf.get(grade);
      const pointsTenths = value === undefined ? null : k.credits * value;
      return {
        event_category_id: k.id,
        name: k.name,
        credits: k.credits,
        position: k.position,
        from_class_count: k.from_class_count === true,
        grade,
        points: pointsTenths === null ? null : pointsTenths / 10,
        kept: row?.kept === true,
        kept_from_event_name: row?.kept_from_event_name ?? null,
        retest: moves.some((m) => m.event_category_id === k.id && m.kind === 'retest'),
        pointsTenths,
      };
    });

  const totalTenths = subjects.reduce((t, s) => t + (s.pointsTenths ?? 0), 0);
  const credits = subjects.reduce((t, s) => t + s.credits, 0);
  const graded = subjects.filter((s) => s.grade !== null);
  const dSubjects = subjects.filter((s) => s.grade === 'D');
  const complete = subjects.length > 0 && graded.length === subjects.length;
  const hasD = dSubjects.length > 0;
  const below = totalTenths < tenths(dan?.pass_mark ?? 0);

  let status;
  if (c.status === 'withdrawn') status = 'withdrawn';
  else if (!complete && c.private_on) status = 'testing_privately';
  else if (!complete) status = 'not_finished';
  else if (!hasD && !below) status = 'passed';
  else status = 'makeup';

  const reasons = [];
  let needs = [];
  let needsIds = [];
  let choiceNeeded = false;
  if (status === 'makeup') {
    if (hasD) reasons.push('d');
    if (below) reasons.push('below');
    if (hasD) {
      needs = dSubjects.map((s) => s.name);
      needsIds = dSubjects.map((s) => s.event_category_id);
    } else {
      const chosen = subjects.filter((s) => moves.some((m) => m.event_category_id === s.event_category_id && m.kind === 'chosen'));
      needs = chosen.map((s) => s.name);
      needsIds = chosen.map((s) => s.event_category_id);
      choiceNeeded = chosen.length === 0;
    }
  }

  const aPlus = valueOf.get('A+') ?? 0;
  return {
    candidate_id: c.id,
    event_id: c.event_id,
    dan: c.dan,
    stars_from: c.stars_from,
    stars_to: c.stars_from + 1,
    status,
    total: totalTenths / 10,
    max_score: (credits * aPlus) / 10,
    pass_mark: dan?.pass_mark ?? null,
    complete,
    graded_count: graded.length,
    subject_count: subjects.length,
    subjects: subjects.map(({ pointsTenths, ...rest }) => rest),
    ai: { age_group: ageGroup, count: c.assistant_classes ?? null, grade: aiGrade },
    d_subjects: dSubjects.map((s) => s.name),
    makeup_reasons: reasons,
    needs,
    needs_ids: needsIds,
    choice_needed: choiceNeeded,
    missing: subjects.filter((s) => s.grade === null).map((s) => s.name),
    private: c.private_on ? { on: c.private_on, time: String(c.private_time ?? '').slice(0, 5) } : null,
    result_key: resultKey(status, totalTenths, needsIds),
  };
}
