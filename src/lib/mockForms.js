// mockForms.js — the PREVIEW (fake) database for Forms (migration 0009).
// Why it exists: preview mode runs without Supabase. This file pretends to be the Forms tables and
// the thirteen staff forms_* functions, with the SAME rules and answers as the real database (same
// check order, same statuses, the shared spot limit, the 90-day signature clean-up). mockClient.js
// plugs it in; forms/checks.mjs tests it in Node with a plain in-memory store.
//
//   const backend = createFormsBackend({ loadStore, saveStore, now, newId, getSchedule, getCalendar, getClasses, today });
//   getSchedule() → the fake Schedule's store { versions, slots }      (mockSchedule snapshot)
//   getCalendar() → the fake Calendar's store { closures, closureClasses } (mockCalendar snapshot)
//   getClasses()  → Testing's fake classes [{ id, location_code, name }]
//   backend.select('forms', 'id, …', [{ col, value, op }], [{ col, ascending }], ctx)
//   backend.rpc('forms_create', { p_… }, ctx)   ctx = { signedIn, hasDataAccess, isAdmin, actorName }
// The public page's three functions (forms_public_*) are NOT here: they belong to the restricted
// login of step F3, which the dashboard never uses.
import { parseTime, toTimeText } from './schedule/time.js';
import { addDays, weekdayOf } from './schedule/versions.js';
import { versionInEffect } from './calendar/days.js';
import { cleanText, textProblem } from './calendar/rules.js';
import { emailOk, fieldsProblem, longTextProblem, phoneOk, publishProblem, slugOk, template } from './forms/fields.js';

export const FORMS_STORE_SCHEMA = 1;
const LOCATION_CODES = ['worcester', 'shrewsbury'];
const KINDS = ['free_class', 'walk_in', 'event', 'blank'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const SIGNATURE_DAYS = 90; // Jeffrey, 2026-10-18 (rulebook v0.146)

// The columns staff may read (0009's column grants). signature, submission_key and booking_key
// are granted to nobody.
const GRANTED_COLUMNS = {
  forms: ['id', 'location_code', 'name', 'slug', 'kind', 'status', 'draft', 'published', 'published_version', 'published_at', 'settings',
    'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'],
  form_booking_offers: ['id', 'form_id', 'location_code', 'class_id', 'default_limit', 'days_ahead', 'min_hours_ahead', 'version'],
  form_booking_limits: ['id', 'form_id', 'location_code', 'class_id', 'weekday', 'starts_at', 'spot_limit', 'version'],
  form_submissions: ['id', 'form_id', 'location_code', 'published_version', 'fields', 'answers', 'parent_name', 'parent_phone', 'parent_email',
    'children', 'signed_at', 'entered_by', 'source', 'created_at', 'created_by_name'],
};
const TABLE_KEY = { forms: 'forms', form_booking_offers: 'offers', form_booking_limits: 'limits', form_submissions: 'submissions' };
const HIDDEN = ['created_by', 'updated_by', 'booking_key', 'signature', 'submission_key'];

const RPC_ARGS = {
  forms_create: [['p_location_code', 'text'], ['p_kind', 'text'], ['p_name', 'text'], ['p_slug', 'text']],
  forms_save_draft: [['p_form_id', 'uuid'], ['p_expected_version', 'int'], ['p_name', 'text'], ['p_slug', 'text'], ['p_draft', 'jsonb'], ['p_settings', 'jsonb']],
  forms_publish: [['p_form_id', 'uuid'], ['p_expected_version', 'int']],
  forms_set_status: [['p_form_id', 'uuid'], ['p_expected_version', 'int'], ['p_status', 'text']],
  forms_duplicate: [['p_form_id', 'uuid']],
  forms_delete: [['p_form_id', 'uuid'], ['p_expected_version', 'int']],
  forms_set_booking: [['p_form_id', 'uuid'], ['p_expected_version', 'int'], ['p_offers', 'jsonb'], ['p_limits', 'jsonb']],
  forms_staff_submit: [['p_form_id', 'uuid'], ['p_submission_key', 'uuid'], ['p_published_version', 'int'], ['p_answers', 'jsonb'], ['p_children', 'jsonb'], ['p_bookings', 'jsonb'], ['p_signature', 'text']],
  forms_open_times: [['p_form_id', 'uuid'], ['p_from', 'date'], ['p_to', 'date']],
  forms_bookings_between: [['p_location_code', 'text'], ['p_from', 'date'], ['p_to', 'date']],
  forms_submission_signature: [['p_submission_id', 'uuid']],
  forms_kiosk_token: [['p_form_id', 'uuid']],
  forms_kiosk_revoke: [['p_form_id', 'uuid']],
};
export const FORMS_RPC_NAMES = Object.keys(RPC_ARGS);
// Staff (not only admins) may call these (0009 section 7h-7m).
const STAFF_RPCS = ['forms_staff_submit', 'forms_open_times', 'forms_bookings_between', 'forms_submission_signature', 'forms_kiosk_token', 'forms_kiosk_revoke'];

class DbError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function toDbType(value, type) {
  if (value === null) return null;
  const bad = () => new DbError('22P02', `invalid input syntax for type ${type}: "${value}"`);
  switch (type) {
    case 'text':
      if (typeof value === 'string') return value;
      throw bad();
    case 'uuid':
      if (typeof value === 'string' && UUID_PATTERN.test(value)) return value.toLowerCase();
      throw bad();
    case 'int':
      if (Number.isInteger(value)) return value;
      throw bad();
    case 'date':
      if (typeof value === 'string' && DATE_PATTERN.test(value)) return value;
      throw bad();
    case 'jsonb':
      return JSON.parse(JSON.stringify(value));
    default:
      throw new Error(`unknown type ${type}`);
  }
}

function readArgs(name, args) {
  const spec = RPC_ARGS[name];
  const sent = Object.keys(args ?? {}).filter((key) => args[key] !== undefined);
  const known = new Set(spec.map(([key]) => key));
  if (spec.some(([key]) => !sent.includes(key)) || sent.some((key) => !known.has(key))) {
    throw new DbError('PGRST202', `Could not find the function public.${name}(${[...sent].sort().join(', ')}) in the schema cache`, 404);
  }
  return Object.fromEntries(spec.map(([key, type]) => [key, toDbType(args[key], type)]));
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const st = (status, extra = {}) => ({ status, ...extra });
const minutesOf = (text) => (text === null || text === undefined ? null : parseTime(text));
const hhmm = (text) => String(text).slice(0, 5);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const textOk = (text, max) => typeof text === 'string' && textProblem(text, max) === null;
const realDate = (text) => {
  if (typeof text !== 'string' || !DATE_PATTERN.test(text)) return false;
  const d = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text && text >= '1900-01-01' && text <= '2100-12-31';
};
export const signatureOk = (s) => typeof s === 'string' && s.length >= 200 && s.length <= 70000
  && s.startsWith('data:image/png;base64,') && /^[A-Za-z0-9+/]+={0,2}$/.test(s.slice(22));

// = forms_settings_are_valid
export function settingsOk(p) {
  if (!isObject(p) || Object.keys(p).some((k) => !['thank_you', 'alert_email', 'confirm_email', 'add_to_calendar'].includes(k))) return false;
  if (typeof p.thank_you !== 'string' || [...p.thank_you].length > 500) return false;
  if (p.thank_you !== '' && longTextProblem(p.thank_you, 500)) return false;
  if (!('alert_email' in p) || (p.alert_email !== null && !emailOk(p.alert_email))) return false;
  return typeof p.confirm_email === 'boolean' && typeof p.add_to_calendar === 'boolean';
}

export const DEFAULT_SETTINGS = { thank_you: "Thank you, {parent}! We'll see you soon.", alert_email: null, confirm_email: true, add_to_calendar: true };

// Massachusetts wall-clock time `hours` from now, as 'YYYY-MM-DD HH:MM' (sorts like the real thing).
function localStamp(ms) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

// ----- = forms_check_answers -----
export function checkAnswers(fields, answers, children, signature) {
  if (!isObject(answers) || JSON.stringify(answers).length > 20000) return false;
  const answerable = new Set(fields.filter((f) => !['heading', 'step', 'children', 'booking'].includes(f.type)).map((f) => f.id));
  if (Object.keys(answers).some((k) => !answerable.has(k))) return false;
  let hasWaiver = false;
  for (const f of fields) {
    if (['heading', 'step', 'children', 'booking'].includes(f.type)) continue;
    const visible = !f.show_if || JSON.stringify(answers[f.show_if.field]) === JSON.stringify(f.show_if.value);
    let v = answers[f.id];
    if (v === null) v = undefined;
    if (!visible) {
      if (v !== undefined) return false;
      continue;
    }
    if (v === undefined) {
      if (['parent_name', 'parent_phone', 'parent_email', 'waiver'].includes(f.type) || f.required === true) return false;
      continue;
    }
    const opts = f.options ?? [];
    switch (f.type) {
      case 'parent_name':
      case 'short_text':
        if (!textOk(v, f.type === 'parent_name' ? 80 : 200)) return false;
        break;
      case 'long_text':
        if (longTextProblem(v, 1000)) return false;
        break;
      case 'parent_phone':
      case 'phone':
        if (!phoneOk(v)) return false;
        break;
      case 'parent_email':
      case 'email':
        if (!emailOk(v)) return false;
        break;
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 999999) return false;
        break;
      case 'date':
        if (!realDate(v)) return false;
        break;
      case 'choice':
      case 'dropdown':
        if (typeof v !== 'string' || !opts.includes(v)) return false;
        break;
      case 'checkboxes':
        if (!Array.isArray(v) || v.length > opts.length || (f.required === true && v.length === 0)
          || v.some((x) => typeof x !== 'string' || !opts.includes(x)) || new Set(v).size !== v.length) return false;
        break;
      case 'waiver':
        if (v !== true) return false;
        hasWaiver = true;
        break;
      default:
        return false;
    }
  }
  if (hasWaiver ? !signatureOk(signature) : signature !== null) return false;
  if (!Array.isArray(children) || children.length < 1 || children.length > 6) return false;
  for (const c of children) {
    if (!isObject(c) || Object.keys(c).some((k) => !['first_name', 'age'].includes(k))) return false;
    if (!textOk(c.first_name, 40) || !Number.isInteger(c.age) || c.age < 2 || c.age > 99) return false;
  }
  return true;
}

// A real-looking drawn signature for the sample sign-ups (a small PNG, made once for preview).
const SAMPLE_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAAAyCAAAAAD+Co+5AAAA/klEQVR42u2XSw7DMAhE5xDc/6qtumiVNHwNbrMYdokFeTYExnjc3EBAAhKQgAQkIAEJSMCXiciNAeVtZaefAMrBFpy2A34+U0GU7K4wgnd6KjmFhEhv1l70nhNOPiJaBaa9jQkvTh4iCqWSjBsBKk5OjpAusG9GO2hAqC4fg5/CopILcQ80SehVsxIYK7mIuoO/lqmnDKCdwLh5eYcr+ablAkpruFrO9aDYwmdlciEodmkT418dUjMT2knt60Nya0TbaTNmSA8OaU9l8IwAypg2vkiCpqKWJV2cnETLYdHU7UOytAI4euXpZ2X7tbO7bV7cCUhAAhKQgAT8rz0BvL+g6Mr+Ij4AAAAASUVORK5CYII=';

// ----- Default preview data, around "today" (made-up samples) -----
export function defaultFormsData({ today, newId, stamp, classes, schedule, calendar, actorName = 'Preview' }) {
  const db = { schema: FORMS_STORE_SCHEMA, forms: [], offers: [], limits: [], submissions: [], bookings: [], kioskTokens: [], signatureViews: [] };
  const book = (row) => ({ ...row, version: 1, created_at: stamp, updated_at: stamp, created_by_name: actorName, updated_by_name: actorName });
  const classOf = (code, name) => classes.find((c) => c.location_code === code && c.name === name) ?? null;
  const form = (row) => {
    const fields = template(row.kind);
    const waiver = fields.find((f) => f.type === 'waiver');
    if (waiver && row.waiverText) waiver.text = row.waiverText;
    const live = row.status !== 'draft';
    const full = book({
      id: newId(), location_code: row.location_code, name: row.name, slug: row.slug, kind: row.kind, status: row.status,
      draft: clone(fields), published: live ? clone(fields) : null, published_version: live ? 1 : 0,
      published_at: live ? stamp : null, settings: { ...DEFAULT_SETTINGS }, booking_key: '',
    });
    db.forms.push(full);
    return full;
  };
  const WAIVER = 'Sample wording for preview only. The school writes its own waiver in the builder before a form goes live.';
  const insta = form({ location_code: 'worcester', name: 'Free class — Instagram', slug: 'free-class-instagram', kind: 'free_class', status: 'live', waiverText: WAIVER });
  form({ location_code: 'shrewsbury', name: 'Walk-in', slug: 'walk-in-shrewsbury', kind: 'walk_in', status: 'live', waiverText: WAIVER });
  form({ location_code: 'worcester', name: 'Summer camp sign-up', slug: 'summer-camp', kind: 'event', status: 'draft' });
  form({ location_code: 'shrewsbury', name: 'Free class — Facebook', slug: 'free-class-facebook', kind: 'free_class', status: 'closed', waiverText: WAIVER });

  // Instagram offers White (3 spots a time) and Group A (2 spots), 14 days ahead, 3 hours' notice.
  const white = classOf('worcester', 'White');
  const groupA = classOf('worcester', 'Group A');
  for (const [cls, limit] of [[white, 3], [groupA, 2]]) {
    if (cls) db.offers.push(book({ id: newId(), form_id: insta.id, location_code: 'worcester', class_id: cls.id, default_limit: limit, days_ahead: 14, min_hours_ahead: 3 }));
  }
  insta.booking_key = 'sample';

  // A few sign-ups: two with a free class (one on a class the storm closure cancelled → amber).
  const at = (daysAgo) => new Date(new Date(stamp).getTime() - daysAgo * 86400000).toISOString();
  const submission = (f, row, daysAgo) => {
    const s = book({
      id: newId(), form_id: f.id, location_code: f.location_code, published_version: 1, fields: clone(f.published), source: 'public',
      entered_by: null, submission_key: newId(), signature: SAMPLE_SIGNATURE, signed_at: at(daysAgo), ...row,
    });
    s.created_at = at(daysAgo);
    db.submissions.push(s);
    return s;
  };
  const slotOn = (cls, date) => {
    const versions = (schedule?.versions ?? []).filter((v) => v.location_code === 'worcester').map((v) => ({ id: v.id, startsOn: v.starts_on }));
    const version = versionInEffect(versions, date);
    return (schedule?.slots ?? []).find((s) => version && s.version_id === version.id && s.weekday === weekdayOf(date) && s.class_ids.includes(cls.id)) ?? null;
  };
  const bookOn = (sub, cls, date, child = 0) => {
    const slot = cls && slotOn(cls, date);
    if (!slot) return;
    db.bookings.push(book({
      id: newId(), submission_id: sub.id, form_id: sub.form_id, location_code: 'worcester', class_id: cls.id, class_name: cls.name,
      on_date: date, starts_at: slot.starts_at, ends_at: slot.ends_at, child_index: child, status: 'booked',
    }));
  };
  const nextDay = (from, weekdays) => {
    let d = from;
    while (!weekdays.includes(weekdayOf(d))) d = addDays(d, 1);
    return d;
  };
  const s1 = submission(insta, {
    answers: { parent_name: 'Dana Rivera', parent_phone: '508-555-0142', parent_email: 'dana.rivera@example.com', heard: 'Instagram', waiver: true },
    parent_name: 'Dana Rivera', parent_phone: '508-555-0142', parent_email: 'dana.rivera@example.com', children: [{ first_name: 'Maya', age: 7 }],
  }, 1);
  bookOn(s1, white, nextDay(addDays(today, 1), [1, 3]));
  const s2 = submission(insta, {
    answers: { parent_name: 'Chris Nguyen', parent_phone: '774-555-0199', parent_email: 'chris.n@example.com', heard: 'A friend', waiver: true },
    parent_name: 'Chris Nguyen', parent_phone: '774-555-0199', parent_email: 'chris.n@example.com', children: [{ first_name: 'Leo', age: 9 }, { first_name: 'Ava', age: 6 }],
  }, 3);
  // The storm closure (mockCalendar) cancels Worcester's first evening classes on its Monday.
  const storm = (calendar?.closures ?? []).find((c) => !c.whole_day && c.location_code === 'worcester');
  bookOn(s2, groupA, storm ? storm.starts_on : nextDay(addDays(today, 3), [1, 3]), 0);
  bookOn(s2, white, nextDay(addDays(today, 2), [1, 3]), 1);
  const walkIn = db.forms.find((f) => f.slug === 'walk-in-shrewsbury');
  submission(walkIn, {
    answers: { parent_name: 'Sam Patel', parent_phone: '508-555-0110', parent_email: 'sam.patel@example.com', heard: 'Walked by', waiver: true },
    parent_name: 'Sam Patel', parent_phone: '508-555-0110', parent_email: 'sam.patel@example.com', children: [{ first_name: 'Rohan', age: 11 }],
    source: 'staff', entered_by: actorName,
  }, 0);
  return db;
}

function isUsableStore(store) {
  return Boolean(store) && store.schema === FORMS_STORE_SCHEMA
    && ['forms', 'offers', 'limits', 'submissions', 'bookings', 'kioskTokens', 'signatureViews'].every((key) => Array.isArray(store[key]));
}

// ----- The backend -----

export function createFormsBackend({ loadStore, saveStore, now = () => Date.now(), newId, getSchedule, getCalendar, getClasses, today }) {
  let failNext = false;
  const stamp = () => new Date(now()).toISOString();
  const fresh = () => defaultFormsData({ today: today(), newId, stamp: stamp(), classes: getClasses(), schedule: getSchedule(), calendar: getCalendar() });

  function read() {
    let store = null;
    try {
      store = loadStore?.() ?? null;
    } catch {
      store = null;
    }
    const db = isUsableStore(store) ? clone(store) : fresh();
    if (!isUsableStore(store)) saveStore?.(db);
    return db;
  }
  const write = (db) => saveStore?.(db);

  function insertRow(list, row, ctx) {
    const at = stamp();
    const full = { ...row, version: 1, created_at: at, updated_at: at, created_by_name: ctx.actorName, updated_by_name: ctx.actorName };
    list.push(full);
    return full;
  }
  // A real change bumps the version (forms_before_write).
  function updateRow(row, changes, ctx) {
    const changed = Object.keys(changes).some((col) => JSON.stringify(changes[col]) !== JSON.stringify(row[col]));
    if (!changed) return;
    Object.assign(row, changes);
    row.version += 1;
    row.updated_at = stamp();
    row.updated_by_name = ctx.actorName;
  }

  // ----- Free-class times (= forms_slots_on, forms_spot_limit, forms_times) -----
  function slotsOn(code, date) {
    const schedule = getSchedule();
    const calendar = getCalendar();
    const versions = schedule.versions.filter((v) => v.location_code === code).map((v) => ({ id: v.id, startsOn: v.starts_on }));
    const version = versionInEffect(versions, date);
    if (!version) return [];
    const weekday = weekdayOf(date);
    const forSchool = (c) => c.location_code === null || c.location_code === code;
    if (calendar.closures.some((c) => c.whole_day && c.starts_on <= date && c.ends_on >= date && forSchool(c))) return [];
    const records = calendar.closures
      .filter((c) => !c.whole_day && c.starts_on === date && forSchool(c))
      .flatMap((c) => calendar.closureClasses.filter((x) => x.closure_id === c.id && x.location_code === code && x.weekday === weekday));
    return schedule.slots
      .filter((s) => s.version_id === version.id && s.weekday === weekday && s.class_ids.length > 0)
      .filter((s) => !records.some((x) => x.starts_at === s.starts_at && x.ends_at === s.ends_at && sameList(x.class_ids, s.class_ids)));
  }

  function spotLimit(db, formId, code, classId, date, start) {
    const weekday = weekdayOf(date);
    const limitOf = (o) => {
      const l = db.limits.find((x) => x.form_id === o.form_id && x.class_id === o.class_id && x.weekday === weekday && hhmm(x.starts_at) === hhmm(start));
      return l ? l.spot_limit : o.default_limit;
    };
    const own = db.offers.find((o) => o.form_id === formId && o.class_id === classId && o.location_code === code);
    if (!own) return null;
    const mine = limitOf(own);
    if (mine === 0) return 0;
    const others = db.offers
      .filter((o) => o.location_code === code && o.class_id === classId && o.form_id !== formId)
      .filter((o) => {
        const f = db.forms.find((x) => x.id === o.form_id);
        return f && f.status === 'live' && (f.published ?? []).some((e) => e.type === 'booking');
      })
      .map(limitOf)
      .filter((n) => n > 0);
    return Math.min(mine, ...others);
  }

  function times(db, formId, from, to) {
    const form = db.forms.find((f) => f.id === formId);
    if (!form) return [];
    const classes = getClasses();
    const out = [];
    for (const o of db.offers.filter((x) => x.form_id === formId)) {
      const cls = classes.find((c) => c.id === o.class_id);
      if (!cls) continue;
      const first = from > today() ? from : today();
      const lastWindow = addDays(today(), o.days_ahead - 1);
      const last = to < lastWindow ? to : lastWindow;
      const earliest = localStamp(now() + o.min_hours_ahead * 3600000);
      for (let d = first; d <= last; d = addDays(d, 1)) {
        for (const s of slotsOn(form.location_code, d)) {
          if (!s.class_ids.includes(o.class_id)) continue;
          if (`${d} ${hhmm(s.starts_at)}` < earliest) continue;
          const lim = spotLimit(db, formId, form.location_code, o.class_id, d, s.starts_at);
          const used = db.bookings.filter((b) => b.location_code === form.location_code && b.class_id === o.class_id && b.on_date === d
            && hhmm(b.starts_at) === hhmm(s.starts_at) && b.status === 'booked').length;
          if (lim === null || lim - used <= 0) continue;
          out.push({ class_id: o.class_id, class_name: cls.name, date: d, starts_at: hhmm(s.starts_at), ends_at: hhmm(s.ends_at), spots_left: lim - used });
        }
      }
    }
    return out.sort((a, b) => (a.date + a.starts_at + a.class_name < b.date + b.starts_at + b.class_name ? -1 : 1));
  }

  // = forms_purge_old_signatures
  function purgeSignatures(db) {
    const cutoff = addDays(today(), -SIGNATURE_DAYS);
    for (const s of db.submissions) {
      if (s.signature === null) continue;
      const dates = db.bookings.filter((b) => b.submission_id === s.id).map((b) => b.on_date).sort();
      const anchor = dates.length ? dates[dates.length - 1] : localStamp(new Date(s.signed_at).getTime()).slice(0, 10);
      if (anchor < cutoff) {
        s.signature = null;
        s.version += 1;
        s.updated_by_name = 'Signature clean-up';
      }
    }
  }

  const answerOf = (db, id, repeat) => ({
    status: 'ok', id, repeat,
    bookings: db.bookings.filter((b) => b.submission_id === id).sort((a, b) => a.child_index - b.child_index)
      .map((b) => ({ child: b.child_index, class_name: b.class_name, date: b.on_date, starts_at: hhmm(b.starts_at), ends_at: hhmm(b.ends_at) })),
  });

  // = forms_submit_core. Returns { answer, db } — a 'time_taken' undoes everything (the copy is dropped).
  function submitCore(db, a, source, enteredBy, ctx) {
    const form = db.forms.find((f) => f.id === a.p_form_id);
    if (!form) return st('not_found');
    if (form.status !== 'live' || !form.published) return st(form.status === 'closed' ? 'closed' : 'not_found');
    if (db.submissions.some((s) => s.submission_key === a.p_submission_key && s.form_id !== form.id)) return st('invalid');
    const again = db.submissions.find((s) => s.form_id === form.id && s.submission_key === a.p_submission_key);
    if (again) return answerOf(db, again.id, true);
    if (a.p_published_version !== form.published_version) return st('form_changed', { published_version: form.published_version });
    if (!checkAnswers(form.published, a.p_answers, a.p_children, a.p_signature)) return st('invalid');
    const answers = a.p_answers;
    const bookingField = form.published.find((e) => e.type === 'booking'
      && (!e.show_if || JSON.stringify(answers[e.show_if.field]) === JSON.stringify(e.show_if.value)));
    const bookings = a.p_bookings;
    if (!Array.isArray(bookings) || bookings.length > a.p_children.length || (bookings.length > 0 && !bookingField)) return st('invalid');
    const bad = bookings.some((b) => !isObject(b) || Object.keys(b).some((k) => !['child', 'class_id', 'date', 'starts_at'].includes(k))
      || !Number.isInteger(b.child) || b.child < 0 || b.child > 5 || b.child >= a.p_children.length
      || typeof b.class_id !== 'string' || !UUID_PATTERN.test(b.class_id) || !realDate(b.date) || typeof b.starts_at !== 'string' || !HHMM.test(b.starts_at));
    if (bad || new Set(bookings.map((b) => b.child)).size !== bookings.length) return st('invalid');

    const sub = insertRow(db.submissions, {
      id: newId(), form_id: form.id, location_code: form.location_code, published_version: form.published_version, fields: clone(form.published),
      answers, parent_name: cleanText(answers.parent_name), parent_phone: answers.parent_phone.trim(), parent_email: answers.parent_email.trim(),
      children: a.p_children.map((c) => ({ first_name: cleanText(c.first_name), age: c.age })),
      signature: a.p_signature, signed_at: a.p_signature === null ? null : stamp(), entered_by: enteredBy, source, submission_key: a.p_submission_key,
    }, ctx);
    const sorted = [...bookings].sort((x, y) => (x.class_id + x.date + x.starts_at < y.class_id + y.date + y.starts_at ? -1 : 1));
    for (const b of sorted) {
      const t = times(db, form.id, b.date, b.date).find((x) => x.class_id === b.class_id.toLowerCase() && x.starts_at === b.starts_at);
      if (!t) return st('time_taken');
      insertRow(db.bookings, {
        id: newId(), submission_id: sub.id, form_id: form.id, location_code: form.location_code, class_id: t.class_id, class_name: t.class_name,
        on_date: b.date, starts_at: `${b.starts_at}:00`, ends_at: `${t.ends_at}:00`, child_index: b.child, status: 'booked',
      }, ctx);
    }
    return answerOf(db, sub.id, false);
  }

  const findForm = (db, id) => db.forms.find((f) => f.id === id) ?? null;

  // ----- The functions (access → admin → input → found → stale → write) -----
  const handlers = {
    forms_create(db, a, ctx) {
      if (!LOCATION_CODES.includes(a.p_location_code) || !KINDS.includes(a.p_kind) || !textOk(a.p_name, 80) || !slugOk(a.p_slug)) return st('invalid');
      if (db.forms.some((f) => f.slug === a.p_slug)) return st('duplicate_slug');
      const row = insertRow(db.forms, {
        id: newId(), location_code: a.p_location_code, name: cleanText(a.p_name), slug: a.p_slug, kind: a.p_kind, status: 'draft',
        draft: template(a.p_kind), published: null, published_version: 0, published_at: null, settings: { ...DEFAULT_SETTINGS }, booking_key: '',
      }, ctx);
      return { status: 'ok', id: row.id, version: row.version };
    },

    forms_save_draft(db, a, ctx) {
      if (a.p_form_id === null || a.p_expected_version === null || !textOk(a.p_name, 80) || !slugOk(a.p_slug)
        || fieldsProblem(a.p_draft) !== null || !settingsOk(a.p_settings)) return st('invalid');
      const row = findForm(db, a.p_form_id);
      if (!row) return st('not_found');
      if (row.version !== a.p_expected_version) return st('stale');
      if (db.forms.some((f) => f.slug === a.p_slug && f.id !== row.id)) return st('duplicate_slug');
      updateRow(row, { name: cleanText(a.p_name), slug: a.p_slug, draft: a.p_draft, settings: a.p_settings }, ctx);
      return { status: 'ok', id: row.id, version: row.version };
    },

    forms_publish(db, a, ctx) {
      if (a.p_form_id === null || a.p_expected_version === null) return st('invalid');
      const row = findForm(db, a.p_form_id);
      if (!row) return st('not_found');
      if (row.version !== a.p_expected_version) return st('stale');
      if (publishProblem(row.draft) !== null) return st('not_publishable');
      updateRow(row, {
        published: clone(row.draft), published_version: row.published_version + 1, published_at: stamp(),
        status: row.status === 'draft' ? 'live' : row.status,
      }, ctx);
      return { status: 'ok', id: row.id, version: row.version };
    },

    forms_set_status(db, a, ctx) {
      if (a.p_form_id === null || a.p_expected_version === null || !['live', 'closed'].includes(a.p_status)) return st('invalid');
      const row = findForm(db, a.p_form_id);
      if (!row) return st('not_found');
      if (row.version !== a.p_expected_version) return st('stale');
      if (!row.published) return st('not_publishable');
      updateRow(row, { status: a.p_status }, ctx);
      return { status: 'ok', id: row.id, version: row.version };
    },

    forms_duplicate(db, a, ctx) {
      if (a.p_form_id === null) return st('invalid');
      const row = findForm(db, a.p_form_id);
      if (!row) return st('not_found');
      let slug = null;
      for (let i = 1; i <= 50 && !slug; i += 1) {
        const s = `${row.slug.slice(0, 33)}-copy${i === 1 ? '' : i}`;
        if (!db.forms.some((f) => f.slug === s)) slug = s;
      }
      if (!slug) return st('duplicate_slug');
      const copy = insertRow(db.forms, {
        id: newId(), location_code: row.location_code, name: cleanText(`Copy of ${row.name}`.slice(0, 80)), slug, kind: row.kind, status: 'draft',
        draft: clone(row.draft), published: null, published_version: 0, published_at: null, settings: clone(row.settings), booking_key: row.booking_key,
      }, ctx);
      for (const o of db.offers.filter((x) => x.form_id === row.id)) insertRow(db.offers, { ...clone(o), id: newId(), form_id: copy.id }, ctx);
      for (const l of db.limits.filter((x) => x.form_id === row.id)) insertRow(db.limits, { ...clone(l), id: newId(), form_id: copy.id }, ctx);
      return { status: 'ok', id: copy.id, version: copy.version, slug };
    },

    forms_delete(db, a) {
      if (a.p_form_id === null || a.p_expected_version === null) return st('invalid');
      const row = findForm(db, a.p_form_id);
      if (!row) return st('not_found');
      if (row.version !== a.p_expected_version) return st('stale');
      if (db.submissions.some((s) => s.form_id === row.id)) return st('not_allowed', { reason: 'has_signups' });
      db.forms = db.forms.filter((f) => f.id !== row.id);
      db.offers = db.offers.filter((o) => o.form_id !== row.id);
      db.limits = db.limits.filter((l) => l.form_id !== row.id);
      db.kioskTokens = db.kioskTokens.filter((t) => t.form_id !== row.id);
      return st('ok');
    },

    forms_set_booking(db, a, ctx) {
      const offers = a.p_offers;
      const limits = a.p_limits;
      const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
      const badOffer = (o) => !isObject(o) || Object.keys(o).some((k) => !['class_id', 'default_limit', 'days_ahead', 'min_hours_ahead'].includes(k))
        || typeof o.class_id !== 'string' || !UUID_PATTERN.test(o.class_id) || !intIn(o.default_limit, 1, 20) || !intIn(o.days_ahead, 1, 60) || !intIn(o.min_hours_ahead, 0, 72);
      const badLimit = (l) => !isObject(l) || Object.keys(l).some((k) => !['class_id', 'weekday', 'starts_at', 'spot_limit'].includes(k))
        || !offers.some((o) => o.class_id === l.class_id) || !intIn(l.weekday, 1, 7) || typeof l.starts_at !== 'string' || !HHMM.test(l.starts_at) || !intIn(l.spot_limit, 0, 20);
      if (a.p_form_id === null || a.p_expected_version === null || !Array.isArray(offers) || offers.length > 30 || !Array.isArray(limits) || limits.length > 200
        || offers.some(badOffer) || new Set(offers.map((o) => o.class_id)).size !== offers.length
        || limits.some(badLimit) || new Set(limits.map((l) => `${l.class_id}${l.weekday}${l.starts_at}`)).size !== limits.length) return st('invalid');
      const row = findForm(db, a.p_form_id);
      if (!row) return st('not_found');
      if (row.version !== a.p_expected_version) return st('stale');
      const classes = getClasses();
      if (offers.some((o) => !classes.some((c) => c.id === o.class_id && c.location_code === row.location_code))) return st('invalid');
      db.limits = db.limits.filter((l) => l.form_id !== row.id);
      db.offers = db.offers.filter((o) => o.form_id !== row.id);
      for (const o of offers) insertRow(db.offers, { id: newId(), form_id: row.id, location_code: row.location_code, ...o }, ctx);
      for (const l of limits) insertRow(db.limits, { id: newId(), form_id: row.id, location_code: row.location_code, ...l, starts_at: `${l.starts_at}:00` }, ctx);
      updateRow(row, { booking_key: JSON.stringify([offers, limits]) }, ctx);
      return { status: 'ok', id: row.id, version: row.version };
    },

    forms_staff_submit(db, a, ctx) {
      if (a.p_form_id === null || a.p_submission_key === null) return st('invalid');
      purgeSignatures(db);
      return submitCore(db, a, 'staff', ctx.actorName, ctx);
    },

    forms_open_times(db, a) {
      if (a.p_form_id === null || a.p_from === null || a.p_to === null || a.p_to < a.p_from || (new Date(a.p_to) - new Date(a.p_from)) / 86400000 > 62) return st('invalid');
      if (!findForm(db, a.p_form_id)) return st('not_found');
      return { status: 'ok', times: times(db, a.p_form_id, a.p_from, a.p_to) };
    },

    forms_bookings_between(db, a) {
      if (a.p_from === null || a.p_to === null || a.p_to < a.p_from || (new Date(a.p_to) - new Date(a.p_from)) / 86400000 > 62
        || (a.p_location_code !== null && !LOCATION_CODES.includes(a.p_location_code))) return st('invalid');
      const list = db.bookings
        .filter((b) => b.on_date >= a.p_from && b.on_date <= a.p_to && (a.p_location_code === null || b.location_code === a.p_location_code))
        .sort((x, y) => (x.on_date + x.starts_at < y.on_date + y.starts_at ? -1 : x.on_date + x.starts_at > y.on_date + y.starts_at ? 1 : 0))
        .map((b) => {
          const sub = db.submissions.find((s) => s.id === b.submission_id);
          const form = findForm(db, b.form_id);
          return {
            id: b.id, location_code: b.location_code, class_id: b.class_id, class_name: b.class_name, date: b.on_date,
            starts_at: hhmm(b.starts_at), ends_at: hhmm(b.ends_at), child_first_name: sub?.children?.[b.child_index]?.first_name ?? null,
            form_id: b.form_id, form_name: form?.name ?? '', status: b.status,
            class_running: slotsOn(b.location_code, b.on_date).some((s) => s.class_ids.includes(b.class_id) && hhmm(s.starts_at) === hhmm(b.starts_at)),
          };
        });
      return { status: 'ok', bookings: list };
    },

    forms_submission_signature(db, a, ctx) {
      if (a.p_submission_id === null) return st('invalid');
      purgeSignatures(db);
      const sub = db.submissions.find((s) => s.id === a.p_submission_id);
      if (!sub) return st('not_found');
      db.signatureViews.push({ id: newId(), submission_id: sub.id, viewer_name: ctx.actorName, at: stamp() });
      return { status: 'ok', signature: sub.signature, signed_at: sub.signed_at };
    },

    forms_kiosk_token(db, a) {
      if (a.p_form_id === null) return st('invalid');
      if (!db.forms.some((f) => f.id === a.p_form_id && f.status === 'live')) return st('not_found');
      const token = (newId() + newId()).replace(/-/g, '');
      const mine = db.kioskTokens.filter((t) => t.form_id === a.p_form_id).sort((x, y) => (x.created_at < y.created_at ? 1 : -1)).slice(0, 4);
      db.kioskTokens = [...db.kioskTokens.filter((t) => t.form_id !== a.p_form_id), ...mine];
      db.kioskTokens.push({ id: newId(), form_id: a.p_form_id, created_at: stamp() });
      return { status: 'ok', token, expires_in_hours: 12 };
    },

    forms_kiosk_revoke(db, a) {
      if (a.p_form_id === null) return st('invalid');
      const before = db.kioskTokens.length;
      db.kioskTokens = db.kioskTokens.filter((t) => t.form_id !== a.p_form_id);
      return { status: 'ok', revoked: before - db.kioskTokens.length };
    },
  };
  // Functions that change nothing unless they say 'ok' — but the signature read and the clean-up
  // inside Fill in are saved even then (like the real ones, which write the view row first).
  const ALWAYS_SAVE = ['forms_submission_signature'];

  const ok = (data) => ({ data, error: null, count: null, status: 200, statusText: 'OK' });
  const fail = (code, message, status = 403) => ({ data: null, error: { code, message, details: null, hint: null }, count: null, status, statusText: '' });
  const denied = (what) => fail('42501', `permission denied for ${what}`, 403);

  function matches(row, f) {
    const value = row[f.col] ?? null;
    switch (f.op ?? 'eq') {
      case 'lte':
        return value !== null && String(value) <= String(f.value);
      case 'gte':
        return value !== null && String(value) >= String(f.value);
      case 'in':
        return Array.isArray(f.value) && f.value.map(String).includes(String(value));
      default:
        return String(value) === String(f.value);
    }
  }

  function select(table, columns, filters = [], orders = [], ctx = {}) {
    const granted = GRANTED_COLUMNS[table];
    if (!granted) return fail('PGRST205', `Could not find the table 'public.${table}' in the schema cache`, 404);
    if (!ctx.signedIn) return denied(`table ${table}`);
    const wanted = String(columns ?? '*').split(',').map((c) => c.trim()).filter(Boolean);
    for (const col of [...wanted, ...filters.map((f) => f.col), ...orders.map((o) => o.col)]) {
      if (col === '*' || HIDDEN.includes(col)) return denied(`table ${table}`);
      if (!granted.includes(col)) return fail('42703', `column ${table}.${col} does not exist`, 400);
    }
    if (!ctx.hasDataAccess) return ok([]);
    const db = read();
    let rows = db[TABLE_KEY[table]].filter((row) => filters.every((f) => matches(row, f)));
    rows = [...rows].sort((x, y) => {
      for (const { col, ascending = true } of orders) {
        if (x[col] === y[col]) continue;
        return (x[col] < y[col] ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    return ok(rows.map((row) => Object.fromEntries(wanted.map((col) => [col, clone(row[col] ?? null)]))));
  }

  function rpc(name, args = {}, ctx = {}) {
    if (!(name in handlers)) return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
    if (failNext) {
      failNext = false;
      return { data: null, error: { message: 'Failed to fetch (preview: failNextFormsSave)' }, count: null, status: 0, statusText: '' };
    }
    if (!ctx.signedIn) return denied(`function ${name}`);
    let parsed;
    try {
      parsed = readArgs(name, args);
    } catch (error) {
      if (error instanceof DbError) return fail(error.code, error.message, error.httpStatus);
      throw error;
    }
    if (!ctx.hasDataAccess) return ok(st('no_access'));
    if (!STAFF_RPCS.includes(name) && !ctx.isAdmin) return ok(st('not_allowed'));
    const db = read(); // a private copy = a transaction: only an 'ok' is saved
    const answer = handlers[name](db, parsed, { actorName: ctx.actorName ?? 'Database admin' });
    if (answer.status === 'ok' || ALWAYS_SAVE.includes(name)) write(db);
    return ok(answer);
  }

  // ----- Test helpers -----
  function failNextSave() {
    failNext = true;
  }
  function simulateOtherAdminEdit() {
    const db = read();
    for (const row of db.forms) {
      row.version += 1;
      row.updated_by_name = 'Other Admin';
    }
    write(db);
  }
  function clear() {
    write({ schema: FORMS_STORE_SCHEMA, forms: [], offers: [], limits: [], submissions: [], bookings: [], kioskTokens: [], signatureViews: [] });
  }
  function reset() {
    write(fresh());
  }

  return { select, rpc, failNextSave, simulateOtherAdminEdit, clear, reset, snapshot: read };
}
