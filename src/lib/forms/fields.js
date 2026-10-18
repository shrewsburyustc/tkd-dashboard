// fields.js — the field rules of a form, written once for the builder, the "Fill in" form,
// the preview database and the checks (and, in step F3, the public page).
// Why it exists: the database checks every field list and every family's answers (migration
// 0009: forms_fields_are_valid, forms_check_answers). The screens use the SAME rules so they can
// help while you type, and mockForms.js uses them so preview refuses exactly what the server
// refuses. If a rule changes, change it in the database AND here.
//
// A form's fields are a list: { id, type, label, required, help, options, show_if, text, locked }
//   - parent_name, parent_phone, parent_email, children: always there, "locked" (relabel only)
//   - short_text, long_text, phone, email, number, date: a question
//   - choice ("One choice"), checkboxes, dropdown: 2-30 options
//   - heading ("Heading and text"), step ("New step"): layout only
//   - waiver: the school's own text + "I agree" + a signature (v0.145 answer 4: no set wording)
//   - booking ("Book a class"): each child picks a free-class time; never required (v0.139)
import { cleanText, textProblem } from '../calendar/rules.js';

export const MAX_FIELDS = 60;
export const MAX_OPTIONS = 30;
export const LABEL_MAX = 120;
export const OPTION_MAX = 80;
export const HELP_MAX = 200;
export const WAIVER_MAX = 5000;
export const MAX_CHILDREN = 6;
export const LOCKED_TYPES = ['parent_name', 'parent_phone', 'parent_email', 'children'];
export const QUESTION_TYPES = ['short_text', 'long_text', 'phone', 'email', 'number', 'date', 'choice', 'checkboxes', 'dropdown'];
export const CHOICE_TYPES = ['choice', 'checkboxes', 'dropdown'];
export const LAYOUT_TYPES = ['heading', 'step'];
export const ALL_TYPES = [...LOCKED_TYPES, ...QUESTION_TYPES, ...LAYOUT_TYPES, 'waiver', 'booking'];

// The palette on the left of the builder (mockup screen 3), in its groups.
export const PALETTE = [
  { group: 'Contact', types: ['short_text', 'long_text', 'phone', 'email', 'number', 'date'] },
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
  choice: 'Pick one', checkboxes: 'Pick any', dropdown: 'Choose from a list',
};

// A new id that isn't used yet: f1, f2, …
export function nextFieldId(fields) {
  const used = new Set(fields.map((f) => f.id));
  let n = fields.length + 1;
  while (used.has(`f${n}`)) n += 1;
  return `f${n}`;
}

// The templates (mockup screen 2) — the SAME lists as the database's forms_template().
export function template(kind) {
  const base = [
    { id: 'parent_name', type: 'parent_name', label: 'Parent or guardian name', required: true, locked: true },
    { id: 'parent_phone', type: 'parent_phone', label: 'Phone', required: true, locked: true },
    { id: 'parent_email', type: 'parent_email', label: 'Email', required: true, locked: true },
    { id: 'children', type: 'children', label: 'Children', required: true, locked: true },
  ];
  if (kind === 'free_class') {
    return [
      ...base,
      { id: 'step_2', type: 'step', label: 'Pick a free class' },
      { id: 'booking', type: 'booking', label: 'Free class time', required: false },
      { id: 'step_3', type: 'step', label: 'Almost done' },
      { id: 'heard', type: 'choice', label: 'How did you hear about us?', required: false, options: ['Instagram', 'Facebook', 'A friend', 'Google', 'Other'] },
      { id: 'waiver', type: 'waiver', label: 'Waiver', required: true, text: '' },
    ];
  }
  if (kind === 'walk_in') {
    return [
      ...base,
      { id: 'heard', type: 'choice', label: 'How did you hear about us?', required: false, options: ['Walked by', 'A friend', 'Google', 'Social media', 'Other'] },
      { id: 'waiver', type: 'waiver', label: 'Waiver', required: true, text: '' },
    ];
  }
  if (kind === 'event') {
    return [
      ...base,
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
    if (f.show_if) {
      const target = seen.get(f.show_if.field);
      if (!target || !['choice', 'dropdown'].includes(target.type) || !(target.options ?? []).includes(f.show_if.value)) {
        return { fieldId: f.id, code: 'showIf' };
      }
    }
    seen.set(f.id, f);
  }
  for (const t of LOCKED_TYPES) if (fields.filter((f) => f.type === t).length !== 1) return { fieldId: t, code: 'missing' };
  if (fields.filter((f) => f.type === 'waiver').length > 1 || fields.filter((f) => f.type === 'booking').length > 1) {
    return { fieldId: null, code: 'oneOnly' };
  }
  return null;
}

// Can it be published? Valid AND every waiver has its text (v0.145 answer 4).
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

// Returns { fieldId: code } for every problem (empty object = fine).
export function answerProblems(fields, answers, children) {
  const problems = {};
  for (const f of fields) {
    if (['heading', 'step', 'children', 'booking'].includes(f.type)) continue;
    if (!isVisible(f, answers)) continue;
    const v = answers[f.id];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || v === false;
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
  else if (children.some((c) => textProblem(c.first_name, 40) || !Number.isInteger(c.age) || c.age < 2 || c.age > 99)) problems.children = 'child';
  return problems;
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
