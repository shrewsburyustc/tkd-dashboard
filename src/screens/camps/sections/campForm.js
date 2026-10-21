// campForm.js — the rules of the Add camp / Edit camp / Edit template form (C3), without drawing.
// Why it exists: CampDialog.jsx draws five folded sections; this file knows what is IN them:
//   - the form's starting values (blank camp, from a template, from a saved camp or template)
//   - what a template fills in when "Start from" changes (everything except name and days)
//   - checkForm(): every field's problem, each section's one-line summary (amber when something
//     is wrong: "1 row needs prices", "1 extra has no price" …) and, when all is well, exactly
//     what is sent to the database (contract §1.14 camp_add_camp / camp_update_camp /
//     camp_update_template, §5.2 campsApi in camelCase).
// Keeping it pure (no React) makes it easy to read and to test by hand in the browser console.
//
// The values while typing are TEXT (what is in the boxes): prices "75", ages "5". They become
// numbers only in the payload. Prices are kept in a "bank" by number of days, so picking fewer
// days and then more again doesn't lose prices already typed (C2: "picking fewer days drops the
// extra price-grid rows; picking more days adds empty rows").
// Weekly pricing (rulebook v0.717): prices are PER WEEK, so the grid has rows 1…W, where W = the
// most picked days in one Monday–Sunday week (Mon–Fri × 2 weeks → 5 rows), not one row per day.
import { centsToInputText, parseDollars } from '../../../lib/money.js';
import {
  AGE_LIMITS,
  DEFAULT_AGES,
  DEFAULT_CLOSES_DAYS_BEFORE,
  DEFAULT_EARLY_DAYS_BEFORE,
  DESCRIPTION_MAX,
  MAX_DAYS,
  MAX_EXTRAS,
  MAX_WEEK_DAYS,
  OFFSET_LIMITS,
  WAIVER_MAX,
  addDays,
  campDatesFromTemplate,
  campTextIsValid,
  gridSizeFor,
  isIsoDate,
  normalizeCampText,
  validateAges,
  weekdaysToOnlyOn,
} from '../../../lib/camps/campRules.js';
import { nameProblem, normalizeName } from '../../../lib/testing/names.js';
import * as T from '../text.js';

// The four prices of a grid row, in column order (C3 third frame).
export const PRICE_KEYS = ['memberEarlyCents', 'memberRegularCents', 'nonmemberEarlyCents', 'nonmemberRegularCents'];
export const PRICE_LABELS = [T.COL_MEMBER_EARLY, T.COL_MEMBER_REGULAR, T.COL_NONMEMBER_EARLY, T.COL_NONMEMBER_REGULAR];

// Camp hours in 5-minute steps (C3: "camp hours in 5-minute steps"), 6:00 AM to 9:00 PM.
export const TIME_CHOICES = (() => {
  const list = [];
  for (let minutes = 6 * 60; minutes <= 21 * 60; minutes += 5) {
    list.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }
  return list;
})();

// "09:00:00" (database) → "09:00"
const hhmm = (time) => (typeof time === 'string' ? time.slice(0, 5) : '');
// The bigger / smaller of two ISO dates (text compares correctly for 'YYYY-MM-DD').
const maxDate = (a, b) => (a > b ? a : b);
const minDate = (a, b) => (a < b ? a : b);

let extraKey = 0;
// Each extra row needs a key that never changes while the dialog is open (React list keys).
export const newExtraKey = () => `x${(extraKey += 1)}`;

// A price bank from PriceRow[] (cents) → { 1: { memberEarlyCents: '75', … }, … } (text)
function bankFrom(prices) {
  const bank = {};
  for (const row of prices ?? []) {
    bank[row.dayCount] = Object.fromEntries(PRICE_KEYS.map((key) => [key, row[key] === null || row[key] === undefined ? '' : centsToInputText(row[key])]));
  }
  return bank;
}
// follow: Add camp from a template — the template's weekdays (onlyWeekdays) become the camp's
// matching dates (onlyOn) and keep following the picked days until the admin changes the chips.
function extrasFrom(extras, keepIds, follow = false) {
  return [...(extras ?? [])]
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((e) => ({
      key: newExtraKey(),
      id: keepIds ? (e.extraId ?? e.id ?? null) : null,
      name: e.name,
      price: centsToInputText(e.priceCents),
      per: e.per,
      notForAllDays: Boolean(e.notForAllDays),
      onlyOn: [...(e.onlyOn ?? [])].sort(), // camp dates ([] = every day)
      onlyWeekdays: [...(e.onlyWeekdays ?? [])].sort((a, b) => a - b), // template: ISO weekdays 1–7
      followWeekdays: follow && (e.onlyWeekdays ?? []).length > 0,
    }));
}

// A template's weekdays → this camp's dates, for extras that still follow them.
export function withExtraDays(values) {
  if (!values.extras.some((e) => e.followWeekdays)) return values;
  return { ...values, extras: values.extras.map((e) => (e.followWeekdays ? { ...e, onlyOn: weekdaysToOnlyOn(e.onlyWeekdays, values.days) } : e)) };
}

// ----- Starting values -----

// A blank camp (Add camp, Start from: Blank camp). defaultLocation: 'worcester' | 'shrewsbury' | 'both'.
export function blankValues(today, defaultLocation) {
  return {
    startFrom: 'blank',
    fromTemplateName: null,
    name: '',
    school: defaultLocation === 'shrewsbury' ? 'shrewsbury' : defaultLocation === 'both' ? 'both' : 'worcester',
    heldAt: defaultLocation === 'shrewsbury' ? 'shrewsbury' : 'worcester',
    days: [],
    month: today.slice(0, 7),
    dayCount: '1',
    startTime: '09:00',
    endTime: '15:00',
    opensOn: today,
    closesOn: '',
    earlyUntil: '',
    datesEdited: false,
    opensBefore: '',
    closesBefore: '',
    earlyBefore: '',
    bank: {},
    extras: [],
    minAge: String(DEFAULT_AGES.min),
    maxAge: String(DEFAULT_AGES.max),
    description: '',
    waiverText: '',
  };
}

// Add camp → "Start from" a template: fills in everything except the name and the days (C3).
export function applyTemplate(values, template, today) {
  const next = {
    ...values,
    startFrom: template.id,
    fromTemplateName: template.name,
    school: template.bothSchools ? 'both' : template.locationCode,
    heldAt: template.locationCode,
    startTime: hhmm(template.startTime),
    endTime: hhmm(template.endTime),
    bank: bankFrom(template.prices),
    extras: extrasFrom(template.extras, false, true),
    minAge: String(template.minAge),
    maxAge: String(template.maxAge),
    description: template.description ?? '',
    waiverText: template.waiverText ?? '',
    datesEdited: false,
    template, // kept for the dates (offsets) while days are picked
  };
  return withExtraDays(withAutoDates(next, today));
}

// Back to Blank camp: everything except name, school and days goes back to empty.
export function applyBlank(values, today) {
  const blank = blankValues(today, values.school);
  return withAutoDates({ ...blank, name: values.name, school: values.school, heldAt: values.heldAt, days: values.days, month: values.month }, today);
}

// Add camp: until someone changes a date by hand, the sign-up and early-price dates follow the
// first day — the template's offsets ("days before"), or for a blank camp: sign-up from today,
// closing the day before, early price until a week before (contract §5.1 defaults).
export function withAutoDates(values, today) {
  if (values.datesEdited || values.days.length === 0) return values;
  const first = [...values.days].sort()[0];
  if (values.template) {
    const dates = campDatesFromTemplate(values.template, first);
    return { ...values, opensOn: dates.signupOpensOn ?? '', closesOn: dates.signupClosesOn ?? '', earlyUntil: dates.earlyUntil ?? '' };
  }
  const closesOn = maxDate(addDays(first, -DEFAULT_CLOSES_DAYS_BEFORE), today);
  return {
    ...values,
    opensOn: minDate(today, closesOn),
    closesOn,
    earlyUntil: minDate(addDays(first, -DEFAULT_EARLY_DAYS_BEFORE), closesOn),
  };
}

// Edit camp: the saved camp.
export function valuesFromCamp(camp, days, prices, extras) {
  const isoDays = days.map((d) => d.day).sort();
  return {
    ...blankValues(isoDays[0] ?? '2026-01-01', camp.locationCode),
    name: camp.name,
    school: camp.bothSchools ? 'both' : camp.locationCode,
    heldAt: camp.locationCode,
    days: isoDays,
    month: (isoDays[0] ?? '').slice(0, 7),
    startTime: hhmm(camp.startTime),
    endTime: hhmm(camp.endTime),
    opensOn: camp.signupOpensOn,
    closesOn: camp.signupClosesOn,
    earlyUntil: camp.earlyUntil,
    datesEdited: true,
    bank: bankFrom(prices),
    extras: extrasFrom(extras, true),
    minAge: String(camp.minAge),
    maxAge: String(camp.maxAge),
    description: camp.description ?? '',
    waiverText: camp.waiverText ?? '',
  };
}

// Edit template: the saved template (no days; "days per week" instead — the grid's rows, 1–7).
export function valuesFromTemplate(template) {
  return {
    ...blankValues('2026-01-01', template.locationCode),
    name: template.name,
    school: template.bothSchools ? 'both' : template.locationCode,
    heldAt: template.locationCode,
    dayCount: String(template.dayCount),
    startTime: hhmm(template.startTime),
    endTime: hhmm(template.endTime),
    opensBefore: String(template.opensDaysBefore),
    closesBefore: String(template.closesDaysBefore),
    earlyBefore: String(template.earlyDaysBefore),
    bank: bankFrom(template.prices),
    extras: extrasFrom(template.extras, false),
    minAge: String(template.minAge),
    maxAge: String(template.maxAge),
    description: template.description ?? '',
    waiverText: template.waiverText ?? '',
  };
}

// The values that decide "unsaved changes" (helper fields like the shown month don't count).
export function formSnapshot(values) {
  const { month, template, fromTemplateName, datesEdited, ...rest } = values;
  return JSON.stringify({ ...rest, extras: rest.extras.map(({ key, ...e }) => e) });
}

// ----- Checking -----

// How many grid rows the form has (weekly pricing R2): for a camp W = the most picked days in one
// Monday–Sunday week (0 before any day is picked); for a template its "days per week" (1–7).
export function gridSize(values, mode) {
  if (mode === 'template') {
    const n = Number(values.dayCount);
    return Number.isInteger(n) && n >= 1 && n <= MAX_WEEK_DAYS ? n : 0;
  }
  return gridSizeFor(values.days);
}

const NAME_TEXT = { tooLong: T.NAME_TOO_LONG, badCharacter: T.NAME_BAD_CHARACTER };
function ageNumber(text) {
  const s = String(text ?? '').trim();
  if (s === '') return '';
  return /^\d{1,3}$/.test(s) ? Number(s) : 0.5; // 0.5 → "not a whole number" → the range message
}
function offsetNumber(text) {
  const s = String(text ?? '').trim().replace('−', '-');
  if (!/^-?\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= OFFSET_LIMITS.min && n <= OFFSET_LIMITS.max ? n : null;
}
const TEXT_PROBLEM = (text, max, required) => {
  const tidy = normalizeCampText(text);
  if (tidy === null) return required ? 'empty' : null;
  return campTextIsValid(text, max) ? null : [...tidy].length > max ? 'tooLong' : 'bad';
};

// ctx: { mode: 'add' | 'edit' | 'template', today, initialDays: [iso] (edit),
//        server: { dayError, extraError, duplicateName, offsets } — the database's last answer }
// → { errors, sections: { 1..5: { problem, summary } }, firstProblem, payload }
export function checkForm(values, ctx) {
  const { mode, today } = ctx;
  const server = ctx.server ?? {};
  const isTemplate = mode === 'template';
  const errors = {};
  const sections = {};
  const n = gridSize(values, mode);
  const isoDays = [...values.days].sort();

  // ----- 1. Camp (or Template): name, school, days -----
  const nameIssue = nameProblem(values.name);
  if (nameIssue) errors.name = nameIssue === 'empty' ? (isTemplate ? T.ENTER_TEMPLATE_NAME : T.ENTER_CAMP_NAME) : NAME_TEXT[nameIssue];
  else if (isTemplate && server.duplicateName && server.duplicateName.toLowerCase() === normalizeName(values.name).toLowerCase()) errors.name = T.DUPLICATE_TEMPLATE;
  if (isTemplate) {
    if (n === 0) errors.dayCount = T.PICK_A_DAY;
  } else if (isoDays.length === 0) errors.days = T.PICK_A_DAY;
  else if (isoDays.length > MAX_DAYS) errors.days = T.TOO_MANY_DAYS;
  else if (isoDays.some((d) => d < today && !(ctx.initialDays ?? []).includes(d))) errors.days = T.PAST_DAY;
  else if (server.dayError) errors.days = server.dayError;
  const campProblem = errors.name ?? errors.days ?? errors.dayCount ?? null;
  sections[1] = {
    problem: Boolean(campProblem),
    // Amber: the first problem in words ('1 extra has no price' style, C3); else the summary.
    summary: campProblem ?? T.campSectionSummary(normalizeName(values.name), values.school, values.heldAt, isTemplate ? n : isoDays.length, isTemplate),
  };

  // ----- 2. Times -----
  if (!(values.endTime > values.startTime)) errors.endTime = T.TIME_ORDER;
  let offsets = null;
  if (isTemplate) {
    const o = offsetNumber(values.opensBefore);
    const c = offsetNumber(values.closesBefore);
    const e = offsetNumber(values.earlyBefore);
    if (o === null) errors.opensBefore = T.OFFSET_PROBLEM;
    if (c === null) errors.closesBefore = T.OFFSET_PROBLEM;
    if (e === null) errors.earlyBefore = T.OFFSET_PROBLEM;
    if (o !== null && c !== null && e !== null) {
      if (o < c || e < c || server.offsets) errors.offsets = T.OFFSETS_ORDER;
      else offsets = { opensDaysBefore: o, closesDaysBefore: c, earlyDaysBefore: e };
    }
  } else if (isoDays.length > 0) {
    // (No days yet: the dates fill in by themselves once days are picked, so nothing to say here.)
    const last = isoDays[isoDays.length - 1] ?? null;
    if (!isIsoDate(values.opensOn)) errors.opensOn = T.ENTER_DATE;
    if (!isIsoDate(values.closesOn)) errors.closesOn = T.ENTER_DATE;
    if (!isIsoDate(values.earlyUntil)) errors.earlyUntil = T.ENTER_DATE;
    if (!errors.opensOn && !errors.closesOn && values.opensOn > values.closesOn) errors.opensOn = T.OPENS_AFTER_CLOSES;
    if (!errors.earlyUntil && !errors.closesOn && values.earlyUntil > values.closesOn) errors.earlyUntil = T.EARLY_AFTER_CLOSES;
    if (!errors.closesOn && last && values.closesOn > last) errors.closesOn = T.CLOSES_AFTER_CAMP;
  }
  const timesProblem = Boolean(errors.endTime || errors.opensOn || errors.closesOn || errors.earlyUntil || errors.opensBefore || errors.closesBefore || errors.earlyBefore || errors.offsets);
  let timesSummary = T.TIMES_PROBLEM;
  if (!timesProblem) {
    timesSummary = isTemplate
      ? T.templateTimesSummary(values.startTime, values.endTime, offsets.opensDaysBefore, offsets.closesDaysBefore, offsets.earlyDaysBefore)
      : isoDays.length > 0
        ? T.timesSummary(values.startTime, values.endTime, values.opensOn, values.closesOn, values.earlyUntil)
        : T.timeRange(values.startTime, values.endTime);
  }
  sections[2] = { problem: timesProblem, summary: timesSummary };

  // ----- 3. Prices: one row per number of days -----
  const prices = [];
  errors.prices = {};
  let badRows = 0;
  for (let count = 1; count <= n; count += 1) {
    const texts = values.bank[count] ?? {};
    const row = { dayCount: count };
    let rowBad = false;
    for (const key of PRICE_KEYS) {
      const parsed = parseDollars(texts[key] ?? '');
      if (parsed.problem) {
        rowBad = true;
        errors.prices[`${count}.${key}`] = T.priceProblemText(parsed.problem);
      } else row[key] = parsed.cents;
    }
    if (rowBad) badRows += 1;
    prices.push(row);
  }
  sections[3] = {
    problem: badRows > 0 || n === 0,
    summary: n === 0 ? T.PICK_DAYS_FIRST : badRows > 0 ? T.rowsNeedPrices(badRows) : T.pricesSummary(prices),
  };

  // ----- 4. Extras -----
  errors.extras = {};
  const extras = [];
  let noPrice = 0;
  let noName = 0;
  let noDays = 0;
  const seen = new Map();
  values.extras.forEach((extra, index) => {
    const issue = nameProblem(extra.name);
    const clean = normalizeName(extra.name);
    const lower = clean.toLowerCase();
    if (issue) {
      noName += 1;
      errors.extras[`${extra.key}.name`] = issue === 'empty' ? T.ENTER_EXTRA_NAME : NAME_TEXT[issue];
    } else if (seen.has(lower)) {
      errors.extras[`${extra.key}.name`] = T.SAME_EXTRA_NAME;
    } else seen.set(lower, index);
    const parsed = parseDollars(extra.price);
    if (parsed.problem) {
      noPrice += 1;
      errors.extras[`${extra.key}.price`] = T.priceProblemText(parsed.problem);
    }
    const out = { name: clean, priceCents: parsed.cents ?? null, per: extra.per, notForAllDays: Boolean(extra.notForAllDays) };
    // "Only on these days" (per-day extras only): camp dates, or weekdays on a template.
    if (isTemplate) out.onlyWeekdays = extra.per === 'day' ? [...extra.onlyWeekdays].sort((a, b) => a - b) : [];
    else {
      const kept = extra.per === 'day' ? extra.onlyOn.filter((d) => isoDays.includes(d)).sort() : [];
      // Days were chosen but none of them is a camp day any more: refuse rather than silently
      // turning it into "every day".
      if (extra.per === 'day' && extra.onlyOn.length > 0 && kept.length === 0 && isoDays.length > 0) {
        noDays += 1;
        errors.extras[`${extra.key}.days`] = T.extraNoDaysLeft(clean);
      }
      out.onlyOn = kept;
    }
    // Edit camp keeps each existing extra's id, so it is updated in place (§1.14 camp_update_camp).
    if (mode === 'edit') out.extraId = extra.id ?? null;
    extras.push(out);
  });
  const sameName = Object.values(errors.extras).includes(T.SAME_EXTRA_NAME);
  if (server.extraError) errors.extrasServer = server.extraError;
  let extrasSummary;
  if (noPrice > 0) extrasSummary = T.extrasNoPrice(noPrice);
  else if (noName > 0) extrasSummary = T.extrasNoName(noName);
  else if (sameName) extrasSummary = T.EXTRAS_SAME_NAME;
  else if (noDays > 0) extrasSummary = T.extraNoDaysSummary(noDays);
  else if (server.extraError) extrasSummary = server.extraError;
  else if (extras.length === 0) extrasSummary = T.NO_EXTRAS;
  else {
    extrasSummary = extras
      .map((e) => {
        const labels = isTemplate ? (e.onlyWeekdays ?? []).map((n) => T.ISO_WEEKDAYS[n - 1]) : T.shortDayLabels(e.onlyOn ?? []);
        return labels.length > 0 ? T.extraOnlySummary(e.name, e.priceCents, labels) : T.extraSummaryPart(e.name, e.priceCents, e.per);
      })
      .join(' · ');
  }
  sections[4] = { problem: noPrice > 0 || noName > 0 || noDays > 0 || sameName || Boolean(server.extraError) || values.extras.length > MAX_EXTRAS, summary: extrasSummary };

  // ----- 5. Family form: ages, description, waiver -----
  const minAge = ageNumber(values.minAge);
  const maxAge = ageNumber(values.maxAge);
  const ageIssue = validateAges(minAge, maxAge);
  if (ageIssue === 'blank') {
    if (minAge === '') errors.minAge = T.ENTER_AN_AGE;
    if (maxAge === '') errors.maxAge = T.ENTER_AN_AGE;
  } else if (ageIssue === 'range') errors.ages = T.AGES_RANGE;
  else if (ageIssue === 'order') errors.ages = T.AGES_ORDER;
  const descIssue = TEXT_PROBLEM(values.description, DESCRIPTION_MAX, false);
  if (descIssue) errors.description = descIssue === 'tooLong' ? T.TEXT_TOO_LONG(DESCRIPTION_MAX) : T.NAME_BAD_CHARACTER;
  const waiverIssue = TEXT_PROBLEM(values.waiverText, WAIVER_MAX, true);
  if (waiverIssue) errors.waiverText = waiverIssue === 'empty' ? T.ENTER_WAIVER : waiverIssue === 'tooLong' ? T.TEXT_TOO_LONG(WAIVER_MAX) : T.NAME_BAD_CHARACTER;
  const familyProblem = Boolean(ageIssue || descIssue || waiverIssue);
  let familySummary;
  if (ageIssue === 'order') familySummary = T.FAMILY_AGES_PROBLEM;
  else if (familyProblem) familySummary = T.FAMILY_PROBLEM;
  else familySummary = T.familySummary(minAge, maxAge, Boolean(values.fromTemplateName));
  sections[5] = { problem: familyProblem, summary: familySummary };

  const firstProblem = [1, 2, 3, 4, 5].find((k) => sections[k].problem) ?? null;
  let payload = null;
  if (firstProblem === null) {
    const common = {
      locationCode: values.school === 'both' ? values.heldAt : values.school,
      bothSchools: values.school === 'both',
      name: normalizeName(values.name),
      startTime: values.startTime,
      endTime: values.endTime,
      minAge,
      maxAge,
      prices,
      extras,
      description: normalizeCampText(values.description),
      waiverText: normalizeCampText(values.waiverText),
    };
    payload = isTemplate
      ? { ...common, dayCount: n, ...offsets }
      : { ...common, days: isoDays, signupOpensOn: values.opensOn, signupClosesOn: values.closesOn, earlyUntil: values.earlyUntil };
  }
  return { errors, sections, firstProblem, payload };
}

// Re-exported for the section files (one import place for the form's limits).
export { AGE_LIMITS, MAX_EXTRAS, MAX_DAYS, MAX_WEEK_DAYS };

