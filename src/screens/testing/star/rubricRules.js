// rubricRules.js — the sums and form checks behind the Rubrics and prices tab.
// Why it exists: the tab and its dialogs show live totals ("Max points 45", "Total 70 credits ·
// max 315") and check what is typed before Save turns blue (approved mockups v0.66, rule v0.57).
// Keeping that arithmetic and those rules here — with no drawing — means every screen uses the
// same answer, and the rules match what the database accepts (contract 0006 §2.1 and §6.1):
//   credits        whole number 1–100
//   pass mark      above 0, at most 9999.9, at most one decimal
//   highest star   whole number 1–20
//   grade values   0–9.9, at most one decimal, each higher than the one below (A+ > A > … > D)
//   assistant      age 1–30; minimums 1–999, each column going down (A+ > A > … > C)
//   fees           whole dollars $0–$1,000 (src/lib/money.js)
//   names          the house name rule (src/lib/testing/names.js), unique inside one Dan
import { parseDollars } from '../../../lib/money.js';
import { nameKey, nameProblem, normalizeName } from '../../../lib/testing/names.js';
import * as T from './text.js';

// The usual credit total of a Dan. Shown, not required (v0.61).
export const USUAL_CREDITS = 70;

// Round to one decimal (avoids 4.5 * 3 = 13.499999…).
const round1 = (n) => Math.round(n * 10) / 10;

// The A+ value (the highest grade, position 1) — "max" always means credits × this.
export function topGradeValue(grades) {
  const sorted = [...(grades ?? [])].sort((a, b) => a.position - b.position);
  return sorted[0]?.value ?? 0;
}

export const maxFor = (credits, aPlus) => round1(credits * aPlus);
export const totalCredits = (categories) => (categories ?? []).reduce((sum, c) => sum + c.credits, 0);

// ----- Reading typed numbers -----
// A whole number between min and max. → { value } or { problem: 'empty' | 'invalid' }
export function parseWhole(text, min, max) {
  const s = String(text ?? '').trim();
  if (s === '') return { problem: 'empty' };
  if (!/^\d+$/.test(s)) return { problem: 'invalid' };
  const value = Number(s);
  if (value < min || value > max) return { problem: 'invalid' };
  return { value };
}

// A number with at most one decimal. → { value } or { problem: 'empty' | 'notNumber' | 'decimals' | 'range' }
// above0: the number must be more than 0 (pass mark); otherwise 0 is allowed (grade values).
export function parseOneDecimal(text, max, { above0 = false } = {}) {
  const s = String(text ?? '').trim();
  if (s === '') return { problem: 'empty' };
  if (!/^\d+(\.\d+)?$/.test(s) && !/^\.\d+$/.test(s)) return { problem: 'notNumber' };
  const decimals = s.includes('.') ? s.split('.')[1] : '';
  // "4.50" is still one decimal; "4.55" isn't.
  if (decimals.replace(/0+$/, '').length > 1) return { problem: 'decimals' };
  const value = round1(Number(s));
  if (value > max || (above0 && value <= 0)) return { problem: 'range' };
  return { value };
}

// ----- A Dan, worked out -----
// Everything a Dan line, its rows and its dialogs need.
export function danFacts(dan, grades) {
  const aPlus = topGradeValue(grades);
  const credits = totalCredits(dan.categories);
  return {
    count: dan.categories.length,
    credits,
    max: maxFor(credits, aPlus),
    passMark: dan.passMark,
    starLimit: dan.starLimit,
    aPlus,
    notUsual: credits !== USUAL_CREDITS,
  };
}

// Is this the Dan's only "from class count" category? (It can't be deleted then, v0.61.)
export function isOnlyFromClassCount(dan, category) {
  return category.fromClassCount && dan.categories.filter((c) => c.fromClassCount).length <= 1;
}

// The category ids of a Dan in rubric order.
export const categoryIds = (dan) => (dan?.categories ?? []).map((c) => c.id);

// Move one id from one place to another in a list (returns a new list).
export function moveId(ids, from, to) {
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// The data with one Dan's categories put in a new order (for showing a reorder at once).
export function reorderLocal(data, danNumber, newIds) {
  return {
    ...data,
    dans: data.dans.map((d) => {
      if (d.dan !== danNumber) return d;
      const byId = new Map(d.categories.map((c) => [c.id, c]));
      if (newIds.some((id) => !byId.has(id))) return d;
      return { ...d, categories: newIds.map((id, position) => ({ ...byId.get(id), position })) };
    }),
  };
}

// ----- Category dialog (screens 2, 3) -----
// state: { mode: 'add' | 'edit', values: { name, credits }, touched, duplicateName, saving, blocked }
// dan: the Dan as it is now; record: the category as it was when the dialog opened (edit)
export function checkCategoryForm(state, dan, record, grades) {
  const { values, touched } = state;
  const typed = normalizeName(values.name);
  const problem = nameProblem(values.name);
  const key = nameKey(values.name);
  const others = (dan?.categories ?? []).filter((c) => !record || c.id !== record.id);
  const localDuplicate = problem || key === '' ? null : (others.find((c) => nameKey(c.name) === key)?.name ?? null);
  const serverDuplicate = state.duplicateName !== null && state.duplicateName !== undefined && nameKey(state.duplicateName) === key;

  let nameError = null;
  if (serverDuplicate) nameError = T.duplicateCategory(dan.label, typed);
  else if (problem === 'empty') nameError = touched.name ? T.nameProblemText('empty') : null;
  else if (problem) nameError = T.nameProblemText(problem);
  else if (localDuplicate) nameError = T.duplicateCategory(dan.label, localDuplicate);

  const credits = parseWhole(values.credits, 1, 100);
  let creditsError = null;
  if (credits.problem === 'invalid' || (credits.problem === 'empty' && touched.credits)) creditsError = T.CREDITS_PROBLEM;

  const aPlus = topGradeValue(grades);
  const savedTotal = totalCredits(dan?.categories);
  // The edited category's saved credits come out of the total (if it's still in the Dan).
  const current = record ? (dan?.categories ?? []).find((c) => c.id === record.id) : null;
  const newTotal = credits.value !== undefined ? savedTotal - (current?.credits ?? 0) + credits.value : null;
  // The amber reminder: the save would leave the Dan at something other than 70, and the total
  // changes (an unchanged odd total is already shown by the tag on the Dan line).
  const totalNote =
    newTotal !== null && newTotal !== USUAL_CREDITS && newTotal !== savedTotal
      ? T.totalWillBe(dan.label, newTotal, maxFor(newTotal, aPlus), dan.passMark)
      : null;

  const valid = !problem && !localDuplicate && !serverDuplicate && credits.value !== undefined;
  const sameAsSaved = state.mode === 'edit' && record && valid && typed === record.name && credits.value === record.credits;
  return {
    nameError,
    creditsError,
    maxPoints: credits.value !== undefined ? maxFor(credits.value, aPlus) : null,
    totalNote,
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved,
    payload: valid ? { name: typed, credits: credits.value } : null,
  };
}

export const isCategoryDirty = (state) =>
  state.values.name !== state.initial.name || state.values.credits !== state.initial.credits;

// ----- Dan settings dialog (screen 7) -----
export function checkDanForm(state, dan, grades) {
  const { values, touched } = state;
  const pass = parseOneDecimal(values.passMark, 9999.9, { above0: true });
  const star = parseWhole(values.starLimit, 1, 20);
  let passError = null;
  if (pass.problem && (pass.problem !== 'empty' || touched.passMark)) passError = T.passMarkProblemText(pass.problem);
  let starError = null;
  if (star.problem && (star.problem !== 'empty' || touched.starLimit)) starError = T.STAR_LIMIT_PROBLEM;
  const valid = pass.value !== undefined && star.value !== undefined;
  const sameAsSaved = valid && pass.value === dan.passMark && star.value === dan.starLimit;
  const facts = danFacts(dan, grades);
  return {
    passError,
    starError,
    facts,
    previewLimit: star.value ?? dan.starLimit,
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved,
    payload: valid ? { passMark: pass.value, starLimit: star.value } : null,
  };
}

export const isDanDirty = (state) =>
  state.values.passMark !== state.initial.passMark || state.values.starLimit !== state.initial.starLimit;

// ----- Fees dialog (screen 10) -----
export const FEE_KEYS = ['standard', 'sameDay', 'private'];

export function checkFeesForm(state, dan) {
  const { values, touched } = state;
  const errors = {};
  const cents = {};
  for (const key of FEE_KEYS) {
    const parsed = parseDollars(values[key]);
    if (parsed.problem) {
      if (parsed.problem !== 'empty' || touched[key]) errors[key] = T.priceProblemText(parsed.problem);
    } else {
      cents[key] = parsed.cents;
    }
  }
  const valid = FEE_KEYS.every((key) => cents[key] !== undefined);
  const sameAsSaved =
    valid && cents.standard === dan.standardCents && cents.sameDay === dan.sameDayCents && cents.private === dan.privateCents;
  return {
    errors,
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved,
    payload: valid ? { standardCents: cents.standard, sameDayCents: cents.sameDay, privateCents: cents.private } : null,
  };
}

export const isFeesDirty = (state) => FEE_KEYS.some((key) => state.values[key] !== state.initial[key]);

// ----- Grade values dialog (screen 8) -----
// values: 7 texts, A+ … D. Errors are per field (index → message), so the dialog can show them
// under the grid row the field is in.
export function checkGradesForm(state, grades, dans) {
  const { values, touched } = state;
  const sorted = [...grades].sort((a, b) => a.position - b.position);
  const parsed = values.map((text) => parseOneDecimal(text, 9.9));
  const errors = {};
  parsed.forEach((p, i) => {
    if (p.problem && (p.problem !== 'empty' || touched[i])) errors[i] = T.gradeProblemText(sorted[i].grade, p.problem);
  });
  // Each grade must be worth more than the one below it (v0.66). The message goes on the
  // higher one: "A must be higher than B+."
  for (let i = 0; i < parsed.length - 1; i += 1) {
    if (errors[i] || parsed[i].value === undefined || parsed[i + 1].value === undefined) continue;
    if (parsed[i].value <= parsed[i + 1].value) errors[i] = T.gradeOrder(sorted[i].grade, sorted[i + 1].grade);
  }
  const valid = parsed.every((p) => p.value !== undefined) && Object.keys(errors).length === 0;
  const newValues = parsed.map((p) => p.value);
  const sameAsSaved = valid && newValues.every((v, i) => v === sorted[i].value);
  // Live "Max score" per Dan with the typed A+ (or the saved one while A+ isn't usable).
  const aPlus = parsed[0].value ?? sorted[0]?.value ?? 0;
  const maxScores = (dans ?? []).map((d) => ({ label: d.label, max: maxFor(totalCredits(d.categories), aPlus) }));
  return {
    errors,
    maxScores,
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved,
    payload: valid ? { versions: sorted.map((g) => g.version), values: newValues } : null,
  };
}

export const isGradesDirty = (state) => state.values.some((v, i) => v !== state.initial[i]);

// ----- Assistant-class table dialog (screen 9) -----
export const MINIMUM_GRADES = ['A+', 'A', 'B+', 'B', 'C+', 'C'];

// values: { age, child: [6 texts], adult: [6 texts] }
// errors: { age, rows: { [rowIndex]: [messages] }, bad: Set of 'child-2' / 'adult-1' … }
export function checkAssistantForm(state, assistant) {
  const { values, touched } = state;
  const age = parseWhole(values.age, 1, 30);
  let ageError = null;
  if (age.problem && (age.problem !== 'empty' || touched.age)) ageError = T.AGE_PROBLEM;

  const rows = {};
  const bad = new Set();
  const addError = (row, column, message) => {
    bad.add(`${column}-${row}`);
    rows[row] = rows[row] ?? [];
    if (!rows[row].includes(message)) rows[row].push(message);
  };
  const columns = {};
  for (const column of ['child', 'adult']) {
    const parsed = values[column].map((text) => parseWhole(text, 1, 999));
    columns[column] = parsed.map((p) => p.value);
    parsed.forEach((p, i) => {
      if (p.problem && (p.problem !== 'empty' || touched[`${column}-${i}`])) addError(i, column, T.minimumProblem(MINIMUM_GRADES[i]));
    });
    // Each grade needs fewer classes than the grade above it (v0.66). The message goes on the
    // lower one: "A must need fewer classes than A+."
    for (let i = 1; i < parsed.length; i += 1) {
      if (bad.has(`${column}-${i}`) || parsed[i].value === undefined || parsed[i - 1].value === undefined) continue;
      if (parsed[i].value >= parsed[i - 1].value) addError(i, column, T.minimumOrder(MINIMUM_GRADES[i], MINIMUM_GRADES[i - 1]));
    }
  }
  const valid =
    age.value !== undefined && bad.size === 0 && [...columns.child, ...columns.adult].every((v) => v !== undefined);
  const sameAsSaved =
    valid &&
    age.value === assistant.childMaxAge &&
    columns.child.every((v, i) => v === assistant.childMins[i]) &&
    columns.adult.every((v, i) => v === assistant.adultMins[i]);
  return {
    ageError,
    rows,
    bad,
    // The headings and "under N" follow what is typed (the saved values while a field isn't usable).
    shownAge: age.value ?? assistant.childMaxAge,
    childC: columns.child[5] ?? assistant.childMins[5],
    adultC: columns.adult[5] ?? assistant.adultMins[5],
    canSave: valid && !state.saving && !state.blocked,
    sameAsSaved,
    payload: valid ? { childMaxAge: age.value, childMins: columns.child, adultMins: columns.adult } : null,
  };
}

export const isAssistantDirty = (state) =>
  state.values.age !== state.initial.age ||
  state.values.child.some((v, i) => v !== state.initial.child[i]) ||
  state.values.adult.some((v, i) => v !== state.initial.adult[i]);

// ----- The page's assistant-class table (screen 1) -----
// One column as the page shows it: A+ "15 or more", then each grade's range ("19 or 18"), D "under 10".
export function assistantColumn(mins) {
  const cells = mins.map((min, i) => (i === 0 ? T.orMore(min) : T.classRange(mins[i - 1] - 1, min)));
  cells.push(T.underN(mins[mins.length - 1]));
  return cells;
}
