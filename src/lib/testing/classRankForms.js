// classRankForms.js — the checks behind the rank and class dialogs (no screen code in here).
// Why it exists: CB14 (rulebook v0.427) split each dialog in two — Edit rank (name, belt) vs Edit prices
// (the money) for a rank, Edit class (name) vs Final award for a class — and each half still saves through
// the one database function that takes every field, sending the other half back unchanged. That rule
// is worth testing without a browser, so the form checks live here as plain JavaScript and the dialogs
// (screens/testing/RankDialog.jsx, ClassDialog.jsx) import them. The checks run in
// src/lib/testing/checks.mjs.
// The rules are the database's: names via names.js, prices via money.js (whole dollars, $0–$1,000).
import { parseDollars } from '../money.js';
import { beltOf, beltFormProblem, sameBelt } from './belts.js';
import { finalAwardChoiceOf } from './rankOrder.js';
import { findDuplicateClass, findDuplicateRank, nameProblem, normalizeName } from './names.js';
import * as T from '../../screens/testing/text.js';

// The three price fields: key in the form values, label, and the record's cents column.
export const PRICE_FIELDS = [
  { key: 'early', label: T.EARLY, column: 'earlyCents' },
  { key: 'day', label: T.TESTING_DAY, column: 'dayCents' },
  { key: 'priv', label: T.PRIVATE_TESTING, column: 'privateCents' },
];

// Did anything change since the dialog opened? (Decides whether Esc may close it.)
export function isRankFormDirty(state) {
  const a = state.values;
  const b = state.initial;
  return (
    a.name !== b.name ||
    a.early !== b.early ||
    a.day !== b.day ||
    a.priv !== b.priv ||
    a.sparring !== b.sparring ||
    !sameBelt(a.belt, b.belt) // changing the belt counts as a change (v0.65)
  );
}

// Checks the form. Returns the messages to show and whether Save is available.
//   classView  the rank's class (for the duplicate-name check)
//   record     the saved rank (edit mode), to tell "really changed" from "typed the same value"
// state.part says which half this dialog owns (CB14): 'structure' checks the name and belt and sends the
// saved prices back unchanged; 'prices' checks the prices and sends the saved name and belt back unchanged;
// 'all' (Add rank) checks everything. The save still calls the one database function that takes every
// field, and its version check stops it if someone changed the rank in the meantime.
export function checkRankForm(state, classView, record) {
  const { values, touched } = state;
  const className = classView?.name ?? '';
  const part = state.part ?? 'all';
  const ownsNames = part !== 'prices';
  const ownsPrices = part !== 'structure';

  // ----- Name -----
  const problem = ownsNames ? nameProblem(values.name) : null;
  let nameError = null;
  const typed = ownsNames ? normalizeName(values.name) : (record?.name ?? '');
  // The server said "duplicate" for exactly this name (it may know a rank we haven't loaded).
  const serverDuplicate = ownsNames && state.duplicateName !== null && state.duplicateName === typed;
  const localDuplicate = ownsNames && !problem ? findDuplicateRank(classView, values.name, state.rankId ?? null) : null;
  if (serverDuplicate) nameError = T.duplicateRank(className, typed);
  else if (problem === 'empty') nameError = touched.name ? T.nameProblemText('empty', 'rank') : null;
  else if (problem) nameError = T.nameProblemText(problem, 'rank');
  else if (localDuplicate) nameError = T.duplicateRank(className, localDuplicate);

  // ----- Prices -----
  const parsed = {};
  const priceErrors = {};
  let pricesOk = true;
  if (ownsPrices) {
    for (const field of PRICE_FIELDS) {
      const result = parseDollars(values[field.key]);
      if (result.problem) {
        pricesOk = false;
        // "Enter a price" only once someone has been in the field; other problems right away.
        if (result.problem !== 'empty' || touched[field.key]) priceErrors[field.key] = T.priceProblemText(result.problem);
      } else {
        parsed[field.column] = result.cents;
      }
    }
  } else if (record) {
    for (const field of PRICE_FIELDS) parsed[field.column] = record[field.column]; // the saved prices, unchanged
  }
  const sparring = ownsPrices ? values.sparring : (record?.sparringGear ?? false);

  // The belt (v0.65): the picker only offers valid parts, but a stripe in the belt's own color
  // isn't allowed (it would look solid) — BeltPicker shows that message.
  const belt = ownsNames ? values.belt : record;
  const beltOk = !ownsNames || beltFormProblem(values.belt) === null;

  const valid = !problem && !localDuplicate && !serverDuplicate && pricesOk && beltOk && Boolean(belt);
  // For an edit: is the result the same as what's saved? (Then Save just closes.)
  const sameAsSaved =
    state.mode === 'edit' &&
    record &&
    valid &&
    typed === record.name &&
    parsed.earlyCents === record.earlyCents &&
    parsed.dayCents === record.dayCents &&
    parsed.privateCents === record.privateCents &&
    sparring === record.sparringGear &&
    sameBelt(belt, record);

  // Save is blue whenever the form can be saved — also when nothing changed (v0.57); saving an
  // unchanged form just closes the dialog (sameAsSaved). Gray only while it can't be used:
  // a field problem, a save on its way, or a refused save (someone else changed it, not allowed).
  const canSave = valid && !state.saving && !state.blocked;

  return {
    nameError,
    priceErrors,
    canSave,
    sameAsSaved,
    payload: valid ? { name: typed, ...parsed, sparringGear: sparring, ...beltOf(belt) } : null,
  };
}


export function isClassFormDirty(state) {
  return state.values.name !== state.initial.name || state.values.awardId !== state.initial.awardId;
}

// Checks the form. Returns the name message and whether Save is available.
//   classes  the school's classes (for the duplicate-name check)
//   record   the saved class (edit mode)
export function checkClassForm(state, classes, school, record) {
  const { values, touched } = state;
  // 'award' (Final award dialog): the name isn't on the form, so the saved one goes back unchanged and isn't checked.
  const ownsName = state.part !== 'award';
  const typed = ownsName ? normalizeName(values.name) : (record?.name ?? '');
  const problem = ownsName ? nameProblem(values.name) : null;
  const serverDuplicate = ownsName && state.duplicateName !== null && state.duplicateName === typed;
  const localDuplicate = ownsName && !problem ? findDuplicateClass(classes, values.name, state.classId ?? null) : null;
  let nameError = null;
  if (serverDuplicate) nameError = T.duplicateClass(school, typed);
  else if (problem === 'empty') nameError = touched.name ? T.nameProblemText('empty', 'class') : null;
  else if (problem) nameError = T.nameProblemText(problem, 'class');
  else if (localDuplicate) nameError = T.duplicateClass(school, localDuplicate);

  const valid = !problem && !localDuplicate && !serverDuplicate;
  const sameAsSaved =
    state.mode === 'edit' && record && valid && typed === record.name && values.awardId === finalAwardChoiceOf(record);
  // Blue whenever usable, also when nothing changed (v0.57) — then Save just closes.
  const canSave = valid && !state.saving && !state.blocked;
  // choice: null (Not set) | FINAL_AWARD_NONE | rank id — turned into the two database values
  // with finalAwardArgs(choice) when it's sent (v0.62).
  return { nameError, canSave, sameAsSaved, payload: valid ? { name: typed, choice: values.awardId } : null };
}

