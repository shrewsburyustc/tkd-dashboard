// fields.js — the field rules of a form, written once for the builder, the "Fill in" form,
// the preview database, the checks and the public page (src/forms/).
// Why it exists: the database checks every field list and every family's answers (migration
// 0009: forms_fields_are_valid, forms_check_answers; 0036 adds each child's last name and date of
// birth, and the Address question). The screens use the SAME rules so they can
// help while you type, and mockForms.js uses them so preview refuses exactly what the server
// refuses. If a rule changes, change it in the database AND here.
//
// A form's fields are a list: { id, type, label, required, help, options, show_if, text, locked }
//   - parent_name, parent_phone, parent_email, children: always there, "locked" (relabel only)
//     (each child: first name, last name and date of birth — rulebook v0.634, v0.637)
//   - short_text, long_text, phone, email, number, date: a question
//   - address ("Address", v0.634): street, city, state and ZIP code in one question; at most one
//   - choice ("One choice"), checkboxes, dropdown: 2-30 options
//   - heading ("Heading and text"), step ("New step"): layout only
//   - waiver: the school's own text + "I agree" + a signature (v0.241 answer 4: no set wording)
//   - booking ("Book a class"): each child picks a free-class time; never required (v0.235)
import { cleanText, textProblem } from '../calendar/rules.js';

export const MAX_FIELDS = 60;
export const MAX_OPTIONS = 30;
export const LABEL_MAX = 120;
export const OPTION_MAX = 80;
export const HELP_MAX = 200;
export const WAIVER_MAX = 5000;
export const MAX_CHILDREN = 6;
export const LOCKED_TYPES = ['parent_name', 'parent_phone', 'parent_email', 'children'];
export const QUESTION_TYPES = ['short_text', 'long_text', 'phone', 'email', 'number', 'date', 'address', 'choice', 'checkboxes', 'dropdown'];
export const CHOICE_TYPES = ['choice', 'checkboxes', 'dropdown'];
export const LAYOUT_TYPES = ['heading', 'step'];
export const ALL_TYPES = [...LOCKED_TYPES, ...QUESTION_TYPES, ...LAYOUT_TYPES, 'waiver', 'booking'];
// A form can have each of these at most once (the database says the same).
export const ONE_PER_FORM = ['waiver', 'booking', 'address'];

// The palette on the left of the builder (mockup screen 3), in its groups.
export const PALETTE = [
  { group: 'Contact', types: ['short_text', 'long_text', 'phone', 'email', 'number', 'date', 'address'] },
  { group: 'Choices', types: ['choice', 'checkboxes', 'dropdown'] },
  { group: 'School', types: ['booking', 'waiver'] },
  { group: 'Layout', types: ['heading', 'step'] },
];

// What a new field of each type starts as (the admin changes the label at once).
export function newField(type, id) {
  const base = { id, type, label: DEFAULT_LABEL[type] ?? 'Question', required: false };
  if (CHOICE_TYPES.includes(type)) return { ...base, options: ['Option 1', 'Option 2'] };
  if (type === 'waiver') return { ...base, label: 'Waiver', required: true, text: '' };
  if (type === 'booking') return { ...base, label: 'Book your free class' };
  if (type === 'step') return { id, type, label: 'Next step' };
  if (type === 'heading') return { id, type, label: 'Heading', help: '' };
  return base;
}

const DEFAULT_LABEL = {
  short_text: 'Short answer', long_text: 'Long answer', phone: 'Phone', email: 'Email', number: 'Number', date: 'Date',
  address: 'Home address', choice: 'Pick one', checkboxes: 'Pick any', dropdown: 'Choose from a list',
};

// A new id that isn't used yet: f1, f2, …
export function nextFieldId(fields) {
  const used = new Set(fields.map((f) => f.id));
  let n = fields.length + 1;
  while (used.has(`f${n}`)) n += 1;
  return `f${n}`;
}

// The templates (mockup screen 2) — the SAME lists as the database's forms_template() (0036).
// The Address question comes right after Email: required on Free class and Walk-in, not on Event
// (rulebook v0.634); Blank has only the four fixed fields.
export function template(kind) {
  const contact = [
    { id: 'parent_name', type: 'parent_name', label: 'Parent or guardian name', required: true, locked: true },
    { id: 'parent_phone', type: 'parent_phone', label: 'Phone', required: true, locked: true },
    { id: 'parent_email', type: 'parent_email', label: 'Email', required: true, locked: true },
  ];
  const children = { id: 'children', type: 'children', label: 'Children', required: true, locked: true };
  const address = (required) => ({ id: 'address', type: 'address', label: 'Home address', required });
  const base = [...contact, children];
  if (kind === 'free_class') {
    return [
      ...contact,
      address(true),
      children,
      { id: 'step_2', type: 'step', label: 'Pick a free class' },
      { id: 'booking', type: 'booking', label: 'Free class time', required: false },
      { id: 'step_3', type: 'step', label: 'Almost done' },
      { id: 'heard', type: 'choice', label: 'How did you hear about us?', required: false, options: ['Instagram', 'Facebook', 'A friend', 'Google', 'Other'] },
      { id: 'waiver', type: 'waiver', label: 'Waiver', required: true, text: '' },
    ];
  }
  if (kind === 'walk_in') {
    return [
      ...contact,
      address(true),
      children,
      { id: 'heard', type: 'choice', label: 'How did you hear about us?', required: false, options: ['Walked by', 'A friend', 'Google', 'Social media', 'Other'] },
      { id: 'waiver', type: 'waiver', label: 'Waiver', required: true, text: '' },
    ];
  }
  if (kind === 'event') {
    return [
      ...contact,
      address(false),
      children,
      { id: 'notes', type: 'long_text', label: 'Anything we should know?', required: false },
      { id: 'waiver', type: 'waiver', label: 'Waiver', required: true, text: '' },
    ];
  }
  return base;
}

// ----- Steps and "Show only if" -----

// The form split into steps: a "step" field starts a new one. Step 1 is "About you".
export function stepsOf(fields) {
  const steps = [{ id: 'step_1', label: 'About you', fields: [] }];
  for (const f of fields) {
    if (f.type === 'step') steps.push({ id: f.id, label: f.label, fields: [] });
    else steps[steps.length - 1].fields.push(f);
  }
  return steps;
}

// Is a field shown, given the answers so far? (show_if = { field, value })
export function isVisible(field, answers) {
  if (!field.show_if) return true;
  return answers?.[field.show_if.field] === field.show_if.value;
}

// ----- Field list rules (= forms_fields_are_valid) -----
const FIELD_KEYS = ['id', 'type', 'label', 'required', 'help', 'options', 'show_if', 'text', 'locked'];
// Invisible / control characters (= forms_bad_text): built from code points so this file holds
// no invisible characters itself. BAD_LONG allows line breaks, BAD_LINE does not.
const cp = (a, b) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`;
const INVISIBLE = [cp(0x200b, 0x200f), cp(0x202a, 0x202e), cp(0x2060, 0x2064), cp(0x2066, 0x2069), cp(0xfeff, 0xfeff)].join('');
const BAD_LONG = new RegExp(`[${cp(1, 9)}${cp(11, 31)}${cp(127, 159)}${INVISIBLE}]`);
const BAD_LINE = new RegExp(`[${cp(1, 31)}${cp(127, 159)}${INVISIBLE}]`);

// A long text (waiver, "Long answer", thank-you): 1..max characters, line breaks allowed.
// null | 'empty' | 'tooLong' | 'badCharacter'
export function longTextProblem(text, max) {
  if (typeof text !== 'string' || text.length === 0) return 'empty';
  if (BAD_LONG.test(text)) return 'badCharacter';
  if ([...text].length > max) return 'tooLong';
  return null;
}
// Returns null when fine, or the first problem { fieldId, code }.
export function fieldsProblem(fields) {
  if (!Array.isArray(fields) || fields.length < 4 || fields.length > MAX_FIELDS) return { fieldId: null, code: 'count' };
  if (JSON.stringify(fields).length > 50000) return { fieldId: null, code: 'size' };
  const seen = new Map();
  for (const f of fields) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return { fieldId: null, code: 'shape' };
    if (Object.keys(f).some((k) => !FIELD_KEYS.includes(k))) return { fieldId: f.id ?? null, code: 'shape' };
    if (typeof f.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(f.id) || seen.has(f.id)) return { fieldId: f.id ?? null, code: 'id' };
    if (!ALL_TYPES.includes(f.type)) return { fieldId: f.id, code: 'type' };
    if (textProblem(f.label, LABEL_MAX)) return { fieldId: f.id, code: 'label' };
    if (f.help != null && (typeof f.help !== 'string' || f.help.length > HELP_MAX || BAD_LINE.test(f.help))) return { fieldId: f.id, code: 'help' };
    if (f.required != null && typeof f.required !== 'boolean') return { fieldId: f.id, code: 'shape' };
    if (LOCKED_TYPES.includes(f.type) && (f.id !== f.type || f.locked !== true || f.show_if)) return { fieldId: f.id, code: 'locked' };
    if (!LOCKED_TYPES.includes(f.type) && f.locked != null && f.locked !== false) return { fieldId: f.id, code: 'locked' };
    if (!CHOICE_TYPES.includes(f.type) && f.options != null) return { fieldId: f.id, code: 'shape' };
    if (f.type !== 'waiver' && f.text !== undefined) return { fieldId: f.id, code: 'shape' };
    if (CHOICE_TYPES.includes(f.type)) {
      const opts = f.options ?? [];
      if (opts.length < 2 || opts.length > MAX_OPTIONS) return { fieldId: f.id, code: 'options' };
      if (opts.some((o) => typeof o !== 'string' || textProblem(o, OPTION_MAX) || o !== cleanText(o))) return { fieldId: f.id, code: 'option' };
      if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return { fieldId: f.id, code: 'optionTwice' };
    }
    if (f.type === 'booking' && f.required === true) return { fieldId: f.id, code: 'bookingRequired' };
    if (f.type === 'waiver' && (typeof f.text !== 'string' || [...f.text].length > WAIVER_MAX || (f.text !== '' && longTextProblem(f.text, WAIVER_MAX)))) {
      return { fieldId: f.id, code: 'waiver' };
    }
    // show_if: missing / null, or a plain object (like the database); never on the waiver (v0.243)
    if (f.show_if != null && (f.type === 'waiver' || typeof f.show_if !== 'object' || Array.isArray(f.show_if))) return { fieldId: f.id, code: 'showIf' };
    if (f.show_if != null) {
      const target = seen.get(f.show_if.field);
      if (!target || !['choice', 'dropdown'].includes(target.type) || !(target.options ?? []).includes(f.show_if.value)) {
        return { fieldId: f.id, code: 'showIf' };
      }
    }
    seen.set(f.id, f);
  }
  for (const t of LOCKED_TYPES) if (fields.filter((f) => f.type === t).length !== 1) return { fieldId: t, code: 'missing' };
  // at most one waiver, one booking and one Address question (0036)
  if (ONE_PER_FORM.some((t) => fields.filter((f) => f.type === t).length > 1)) return { fieldId: null, code: 'oneOnly' };
  return null;
}

// Can it be published? Valid AND every waiver has its text (v0.241 answer 4).
export function publishProblem(fields) {
  const p = fieldsProblem(fields);
  if (p) return p;
  const w = fields.find((f) => f.type === 'waiver' && !(f.text ?? '').trim());
  return w ? { fieldId: w.id, code: 'waiverEmpty' } : null;
}

// ----- A family's answers (= forms_check_answers), for "Fill in" -----
const PHONE = /^[0-9 +().-]+$/;
export const phoneOk = (p) => typeof p === 'string' && p.length >= 7 && p.length <= 20 && PHONE.test(p) && (p.replace(/[^0-9]/g, '').length >= 7) && p.replace(/[^0-9]/g, '').length <= 15;
export const emailOk = (e) => typeof e === 'string' && e.length >= 3 && e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !BAD_LINE.test(e);

// The school's today, 'YYYY-MM-DD' in Massachusetts (America/New_York) — the day a child's age is
// worked out on, as the database does it.
export const schoolToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

// A real date 'YYYY-MM-DD' between 1900 and 2100 (= the database's forms_date_ok).
export function realDate(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text && text >= '1900-01-01' && text <= '2100-12-31';
}

// ----- Each child: first name, last name, date of birth (rulebook v0.634, v0.637; 0036) -----
export const CHILD_NAME_MAX = 40;
export const CHILD_AGE_MIN = 2;
export const CHILD_AGE_MAX = 99;

// Whole years from a date of birth to a day, counted like the database's age(): the birthday
// counts on its own day (a Feb 29 birthday counts on Mar 1 in other years). null if a date isn't real.
export function ageOn(dob, day) {
  if (!realDate(dob) || !realDate(day)) return null;
  const years = Number(day.slice(0, 4)) - Number(dob.slice(0, 4));
  return day.slice(5) < dob.slice(5) ? years - 1 : years;
}

// What's wrong with each box of one child → { first_name, last_name, dob }, each a code or null:
// 'child_first' / 'child_last' / 'child_dob' (empty), 'child_name_long', 'child_name_bad', 'child_age'.
export function childBoxProblems(child, today = schoolToday()) {
  const name = (text, emptyCode) => {
    const p = textProblem(text ?? '', CHILD_NAME_MAX);
    if (!p) return null;
    if (p === 'empty') return emptyCode;
    return p === 'tooLong' ? 'child_name_long' : 'child_name_bad';
  };
  let dob = null;
  if (!realDate(child?.dob)) dob = 'child_dob';
  else {
    const age = ageOn(child.dob, today);
    if (age === null || age < CHILD_AGE_MIN || age > CHILD_AGE_MAX) dob = 'child_age';
  }
  return { first_name: name(child?.first_name, 'child_first'), last_name: name(child?.last_name, 'child_last'), dob };
}

// Does this child have a wrong box?
export const childIsWrong = (child, today = schoolToday()) => Object.values(childBoxProblems(child, today)).some(Boolean);
// A child's own problem key: 'child-0', 'child-1' … (each wrong child gets one, so all its boxes
// are marked at once, and the family page can show them child by child).
export const CHILD_KEY = /^child-(\d+)$/;

// Every kind of problem in some children's boxes, for the ONE line under the children (design
// review): { missing: the empty boxes' names, in the order on screen ('first_name', 'last_name',
// 'dob'), long, bad, age } — e.g. a blank child → missing: ['first_name', 'last_name', 'dob'].
export function childrenProblemKinds(children, today = schoolToday()) {
  const codes = children.flatMap((c) => Object.values(childBoxProblems(c, today)));
  return {
    missing: [['first_name', 'child_first'], ['last_name', 'child_last'], ['dob', 'child_dob']].filter(([, code]) => codes.includes(code)).map(([box]) => box),
    long: codes.includes('child_name_long'),
    bad: codes.includes('child_name_bad'),
    age: codes.includes('child_age'),
  };
}

// A child was removed (staff Fill in and the family page): which one, from the list before and the
// list after (the other children are the same objects). -1 when none was removed.
export function removedChildIndex(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after) || after.length >= before.length) return -1;
  const at = after.findIndex((c, i) => c !== before[i]);
  return at < 0 ? after.length : at;
}
// The free-class picks { childIndex: timeKey } without that child: its pick goes, and the picks of
// the children after it move down one place with them (code review).
export function bookingsWithoutChild(bookings, removed) {
  const out = {};
  for (const [key, pick] of Object.entries(bookings ?? {})) {
    const i = Number(key);
    if (i !== removed) out[i > removed ? i - 1 : i] = pick;
  }
  return out;
}

// ----- The Address question (v0.634; 0036): { street, city, state, zip }, all four filled -----
export const ADDRESS_STATE = 'MA'; // the State box starts with it (both schools are in Massachusetts)
export const ADDRESS_MAX = { street: 120, city: 60, state: 30 };
const ZIP = /^[0-9]{5}(-[0-9]{4})?$/; // 5 digits, or ZIP+4
const asText = (v) => (typeof v === 'string' ? v : '');
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The four boxes of an answer as they show (nothing typed yet: State is MA).
export const addressParts = (v) => ({
  street: asText(v?.street), city: asText(v?.city), state: isObject(v) && typeof v.state === 'string' ? v.state : ADDRESS_STATE, zip: asText(v?.zip),
});
// No answer: street, city and ZIP code all blank (the State box always starts filled in).
export const addressBlank = (v) => [v?.street, v?.city, v?.zip].every((x) => cleanText(x ?? '') === '');

// What's wrong with each box → { street, city, state, zip }: 'address' (empty), 'text' (too long or a
// character that can't be used) or 'zip' (not 5 digits / ZIP+4); a box that is fine isn't listed.
export function addressPartProblems(v) {
  const parts = addressParts(v);
  const out = {};
  for (const part of ['street', 'city', 'state']) {
    const p = textProblem(parts[part], ADDRESS_MAX[part]);
    if (p) out[part] = p === 'empty' ? 'address' : 'text';
  }
  const zip = cleanText(parts.zip);
  if (zip === '') out.zip = 'address';
  else if (!ZIP.test(zip)) out.zip = 'zip';
  return out;
}
// The first of them, in the order on screen (street, city, state, ZIP code), or null.
export function addressProblem(v) {
  const p = addressPartProblems(v);
  return p.street ?? p.city ?? p.state ?? p.zip ?? null;
}

// Returns { fieldId: code } for every problem (empty object = fine). The children: 'children' when
// there aren't 1-6 of them, else 'child-0', 'child-1' … = 'child' for each child with a wrong box.
// children: [{ first_name, last_name, dob }]; today: the school's today (for the children's ages).
export function answerProblems(fields, answers, children, today = schoolToday()) {
  const problems = {};
  for (const f of fields) {
    if (['heading', 'step', 'children', 'booking'].includes(f.type)) continue;
    if (!isVisible(f, answers)) continue;
    const v = answers[f.id];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || v === false
      || (f.type === 'address' && addressBlank(v));
    if (empty) {
      if (LOCKED_TYPES.includes(f.type) || f.type === 'waiver' || f.required) problems[f.id] = 'required';
      continue;
    }
    switch (f.type) {
      case 'parent_name':
      case 'short_text':
        if (textProblem(v, f.type === 'parent_name' ? 80 : 200)) problems[f.id] = 'text';
        break;
      case 'long_text':
        if (longTextProblem(v, 1000)) problems[f.id] = 'text';
        break;
      case 'parent_phone':
      case 'phone':
        if (!phoneOk(v)) problems[f.id] = 'phone';
        break;
      case 'parent_email':
      case 'email':
        if (!emailOk(v)) problems[f.id] = 'email';
        break;
      case 'number':
        if (typeof v !== 'number' || Math.abs(v) > 999999) problems[f.id] = 'number';
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) problems[f.id] = 'date';
        break;
      case 'address': {
        const p = addressProblem(v);
        if (p) problems[f.id] = p;
        break;
      }
      case 'choice':
      case 'dropdown':
        if (!(f.options ?? []).includes(v)) problems[f.id] = 'choice';
        break;
      case 'checkboxes':
        if (!Array.isArray(v) || v.some((x) => !(f.options ?? []).includes(x))) problems[f.id] = 'choice';
        break;
      case 'waiver':
        if (v !== true) problems[f.id] = 'required';
        break;
      default:
        break;
    }
  }
  if (!Array.isArray(children) || children.length < 1 || children.length > MAX_CHILDREN) problems.children = 'children';
  else {
    children.forEach((c, i) => {
      if (childIsWrong(c, today)) problems[`child-${i}`] = 'child';
    });
  }
  return problems;
}

// What a fresh form holds while it is filled in (staff "Fill in" and the public page):
//   answers, children: [{ first_name, last_name, dob }], bookings: { childIndex: timeKey }, signature
//   (dob: 'YYYY-MM-DD', or null until it is picked)
// Each child's pick: a time's key ("classId|date|start"), NO_TIME_KEY ("No time yet"), or
// nothing yet. Nothing is ticked at the start (Jeffrey, F3 difference 2).
export const NO_TIME_KEY = 'none';
export const isTimeKey = (key) => typeof key === 'string' && key.includes('|');

export const emptyChild = () => ({ first_name: '', last_name: '', dob: null });
export const emptyFillValues = () => ({ answers: {}, children: [emptyChild()], bookings: {}, signature: null });

// The problems of ONE step's fields (only the ones on screen), plus the children and the
// signature. Used by Next / Submit on the staff "Fill in" and on the public page alike.
// times (optional) = the open times with their spots left: brothers and sisters can't pick more
// places at one time than it has left (design review, F3).
export function stepProblems(stepFields, allFields, values, times = null, today = schoolToday()) {
  const all = answerProblems(allFields, values.answers, values.children, today);
  const out = {};
  for (const f of stepFields) {
    if (!isVisible(f, values.answers)) continue;
    if (all[f.id]) out[f.id] = all[f.id];
    // the children: the number of them ('children') and each wrong child ('child-0' …)
    if (f.type === 'children') for (const key of Object.keys(all)) if (CHILD_KEY.test(key)) out[key] = all[key];
    // the signature is asked for at the same time as the agree box (not one round later)
    if (f.type === 'waiver' && !values.signature) out.signature = 'signature';
    if (f.type === 'booking' && Array.isArray(times)) {
      const picks = {};
      for (const key of Object.values(values.bookings ?? {})) if (isTimeKey(key)) picks[key] = (picks[key] ?? 0) + 1;
      const tooMany = times.some((t) => (picks[`${t.classId}|${t.date}|${t.start}`] ?? 0) > t.spotsLeft);
      // every child needs an answer once times show: a time, or "No time yet"
      const missing = times.length > 0 && values.children.some((c, i) => !values.bookings?.[i]);
      if (missing) out[f.id] = 'booking_pick';
      else if (tooMany) out[f.id] = 'booking_full';
    }
  }
  return out;
}

// The answers object a form sends: only visible questions, never layout fields.
export function cleanAnswers(fields, answers) {
  const out = {};
  for (const f of fields) {
    if (['heading', 'step', 'children', 'booking'].includes(f.type) || !isVisible(f, answers)) continue;
    const v = answers[f.id];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (f.type === 'waiver') {
      if (v === true) out[f.id] = true;
      continue;
    }
    if (f.type === 'address') {
      // each part tidied (single spaces, trimmed); street, city and ZIP code all blank = no answer
      if (!addressBlank(v)) {
        const p = addressParts(v);
        out[f.id] = { street: cleanText(p.street), city: cleanText(p.city), state: cleanText(p.state), zip: cleanText(p.zip) };
      }
      continue;
    }
    out[f.id] = typeof v === 'string' ? (f.type === 'long_text' ? v.trim() : cleanText(v)) : v;
  }
  return out;
}

// A link-friendly name from the form's name: "Free class — Instagram" → "free-class-instagram".
export function slugify(name) {
  const s = String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s.length >= 3 ? s : `form-${s || 'new'}`.slice(0, 40);
}

const RESERVED = ['api', 'admin', 'new', 'edit', 'kiosk', 'preview', 'assets', 'static', 'forms', 'login'];
export const slugOk = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s) && !RESERVED.includes(s);
