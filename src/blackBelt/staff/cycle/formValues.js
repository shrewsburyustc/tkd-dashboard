// formValues.js — turning a cycle into what the Add / Edit cycle dialog edits, and back.
// Why it exists: the data layer and rules.js work with a CycleForm whose prices are whole CENTS
// (contract CONTRACT-0016-B1 §1.3). People type dollars, and a half-typed price ("2,7" or "")
// must stay on screen exactly as typed. So the dialog keeps the prices as TEXT ("870"), and this
// file converts:
//   formToValues(form)    CycleForm (cents) → dialog values (price text, a key on every row)
//   valuesToForm(values)  dialog values → CycleForm for rules.cycleFormProblems and the save
//                         (an empty price → null, a price that isn't a valid one → -1, so the
//                         rules report 'missing' / 'invalid')
//   dayToValues / valuesToDay   one testing day ↔ the testing-day dialog's fields
// It is plain JavaScript (no React), so it is easy to read and test.
import { parsePrice } from '../../../lib/blackBelt/money.js';

export const DANS = [1, 2, 3, 4];

let counter = 0;
// A key for a new row that React can tell apart from every other (days and plans may be new).
export const newKey = (prefix) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;

// 150000 → "1,500" (with the thousands comma, as drawn; parsePrice reads it back)
const centsToText = (cents) => (Number.isInteger(cents) ? (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '');

// Reads a typed price: { cents } when fine, otherwise null (empty) or -1 (not a valid price).
function textToCents(text) {
  const parsed = parsePrice(text);
  if (parsed.cents !== undefined) return parsed.cents;
  return parsed.problem === 'empty' ? null : -1;
}

// What's wrong with one typed price → null | 'missing' | 'invalid'.
export function priceTextProblem(text) {
  const parsed = parsePrice(text);
  if (parsed.cents !== undefined) return null;
  return parsed.problem === 'empty' ? 'missing' : 'invalid';
}

// Testing days in the order the database keeps them: date, then start time.
export function sortDays(days) {
  return [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start ?? '') < (b.start ?? '') ? -1 : (a.start ?? '') > (b.start ?? '') ? 1 : 0));
}

export function formToValues(form) {
  return {
    name: form.name ?? '',
    applicationDue: form.applicationDue ?? '',
    submissionsDue: form.submissionsDue ?? '',
    autoClose: form.autoClose !== false,
    registrationOpen: form.registrationOpen === true,
    days: sortDays(
      (form.days ?? []).map((day) => ({
        key: day.id ?? newKey('day'),
        id: day.id ?? null,
        version: day.version ?? null,
        name: day.name ?? '',
        date: day.date ?? '',
        start: day.start ?? '',
        end: day.end ?? '',
        place: day.place ? { ...day.place } : { code: 'worcester' },
        second: day.second ? { ...day.second, place: { ...day.second.place } } : null,
        parts: [...(day.parts ?? [])],
      })),
    ),
    plans: (form.plans ?? []).map((plan) => ({
      key: plan.key ?? plan.id ?? newKey('plan'),
      id: plan.id ?? null,
      name: plan.name ?? '',
      payments: (plan.payments ?? []).map((pay, i) => ({
        id: pay.id ?? null,
        paymentNo: pay.paymentNo ?? i + 1,
        dueOn: pay.dueOn ?? '',
        followsApplicationDue: pay.followsApplicationDue === true,
      })),
      amounts: Object.fromEntries(DANS.map((dan) => [dan, (plan.amounts?.[dan] ?? plan.amounts?.[String(dan)] ?? []).map(centsToText)])),
    })),
    kukkiwon: Object.fromEntries(DANS.map((dan) => [dan, centsToText(form.kukkiwon?.[dan] ?? form.kukkiwon?.[String(dan)])])),
    pricesFrom: form.pricesFrom ?? null,
  };
}

export function valuesToForm(values) {
  return {
    name: values.name,
    applicationDue: values.applicationDue,
    submissionsDue: values.submissionsDue,
    autoClose: values.autoClose,
    registrationOpen: values.registrationOpen,
    days: values.days.map((day) => ({
      id: day.id,
      version: day.version,
      name: day.name,
      date: day.date,
      start: day.start,
      end: day.end,
      place: day.place,
      second: day.second,
      parts: day.parts,
    })),
    plans: values.plans.map((plan) => ({
      key: plan.key,
      id: plan.id,
      name: plan.name,
      payments: plan.payments.map((pay) => ({ ...pay })),
      amounts: Object.fromEntries(DANS.map((dan) => [dan, (plan.amounts[dan] ?? []).map(textToCents)])),
    })),
    kukkiwon: Object.fromEntries(DANS.map((dan) => [dan, textToCents(values.kukkiwon[dan])])),
    pricesFrom: values.pricesFrom,
  };
}

// ----- One testing day ↔ the testing-day dialog -----
// The dialog keeps the place as a choice ('worcester' | 'shrewsbury' | 'other') plus the typed
// "Other place" text, so switching the dropdown back and forth doesn't lose what was typed.
const placeToFields = (place) =>
  place?.code ? { kind: place.code, other: '' } : { kind: place ? 'other' : 'worcester', other: place?.other ?? '' };
const fieldsToPlace = (kind, other) => (kind === 'other' ? { other } : { code: kind });

export function dayToValues(day) {
  const first = placeToFields(day?.place);
  const second = placeToFields(day?.second?.place ?? { other: '' });
  return {
    key: day?.key ?? newKey('day'),
    id: day?.id ?? null,
    version: day?.version ?? null,
    name: day?.name ?? '',
    date: day?.date ?? '',
    start: day?.start ?? '',
    end: day?.end ?? '',
    placeKind: first.kind,
    placeOther: first.other,
    hasSecond: Boolean(day?.second),
    secondStart: day?.second?.start ?? '',
    secondEnd: day?.second?.end ?? '',
    secondKind: day?.second ? second.kind : 'other',
    secondOther: day?.second ? second.other : '',
    parts: [...(day?.parts ?? [])],
  };
}

export function valuesToDay(v) {
  return {
    key: v.key,
    id: v.id,
    version: v.version,
    name: v.name,
    date: v.date,
    start: v.start,
    end: v.end,
    place: fieldsToPlace(v.placeKind, v.placeOther),
    second: v.hasSecond ? { start: v.secondStart, end: v.secondEnd, place: fieldsToPlace(v.secondKind, v.secondOther) } : null,
    parts: ['physical', 'technical', 'curriculum'].filter((p) => v.parts.includes(p)),
  };
}
