// mockCalendar.js — the PREVIEW (fake) database for the Calendar (migration 0008).
// Why it exists: preview mode runs without Supabase. This file pretends to be the four calendar
// tables and the ten calendar_* functions, with the SAME rules and answers as the real database
// (same check order, same statuses). mockClient.js plugs it in; calendar/checks.mjs tests it in
// Node with a plain in-memory store.
//
//   const backend = createCalendarBackend({ loadStore, saveStore, now, newId, getSchedule, getClasses, today });
//   getSchedule() → the fake Schedule's store { versions, slots } (mockSchedule snapshot)
//   getClasses()  → Testing's fake classes [{ id, location_code, name }]
//   backend.select('calendar_events', 'id, …', [{ col, value, op }], [{ col, ascending }], ctx)
//            op: 'eq' (default) | 'lte' | 'gte' | 'in'
//   backend.rpc('calendar_add_event', { p_… }, ctx)   ctx = { signedIn, hasDataAccess, isAdmin, actorName }
import { COLOR_KEYS } from './schedule/colors.js';
import { parseTime, toTimeText } from './schedule/time.js';
import { addDays, weekdayOf } from './schedule/versions.js';
import { cleanNotes, cleanText, datesProblem, eventTimesProblem, MAX_TYPES, notesProblem, textProblem, TITLE_MAX, TYPE_NAME_MAX } from './calendar/rules.js';
import { versionInEffect } from './calendar/days.js';

export const CALENDAR_STORE_SCHEMA = 1;
const LOCATION_CODES = ['worcester', 'shrewsbury'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BOOK = ['version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'];

const GRANTED_COLUMNS = {
  calendar_event_types: ['id', 'name', 'color', 'position', ...BOOK],
  calendar_events: ['id', 'location_code', 'type_id', 'title', 'starts_on', 'ends_on', 'all_day', 'starts_at', 'ends_at', 'notes', ...BOOK],
  calendar_closures: ['id', 'location_code', 'starts_on', 'ends_on', 'reason', 'whole_day', ...BOOK],
  calendar_closure_classes: ['id', 'closure_id', 'location_code', 'weekday', 'starts_at', 'ends_at', 'class_ids', 'class_names', 'slot_id', ...BOOK],
};
const TABLE_KEY = { calendar_event_types: 'types', calendar_events: 'events', calendar_closures: 'closures', calendar_closure_classes: 'closureClasses' };
const HIDDEN = ['created_by', 'updated_by', 'class_key'];

const RPC_ARGS = {
  calendar_add_event: [['p_location_code', 'text'], ['p_type_id', 'uuid'], ['p_title', 'text'], ['p_starts_on', 'date'], ['p_ends_on', 'date'], ['p_all_day', 'bool'], ['p_starts_at', 'time'], ['p_ends_at', 'time'], ['p_notes', 'text']],
  calendar_update_event: [['p_event_id', 'uuid'], ['p_expected_version', 'int'], ['p_location_code', 'text'], ['p_type_id', 'uuid'], ['p_title', 'text'], ['p_starts_on', 'date'], ['p_ends_on', 'date'], ['p_all_day', 'bool'], ['p_starts_at', 'time'], ['p_ends_at', 'time'], ['p_notes', 'text']],
  calendar_remove_event: [['p_event_id', 'uuid'], ['p_expected_version', 'int']],
  calendar_add_closure: [['p_location_code', 'text'], ['p_starts_on', 'date'], ['p_ends_on', 'date'], ['p_reason', 'text'], ['p_whole_day', 'bool'], ['p_slot_ids', 'uuid[]']],
  calendar_update_closure: [['p_closure_id', 'uuid'], ['p_expected_version', 'int'], ['p_location_code', 'text'], ['p_starts_on', 'date'], ['p_ends_on', 'date'], ['p_reason', 'text'], ['p_whole_day', 'bool'], ['p_slot_ids', 'uuid[]']],
  calendar_remove_closure: [['p_closure_id', 'uuid'], ['p_expected_version', 'int']],
  calendar_add_type: [['p_name', 'text'], ['p_color', 'text']],
  calendar_update_type: [['p_type_id', 'uuid'], ['p_expected_version', 'int'], ['p_name', 'text'], ['p_color', 'text']],
  calendar_reorder_types: [['p_expected_ids', 'uuid[]'], ['p_new_ids', 'uuid[]']],
  calendar_delete_type: [['p_type_id', 'uuid'], ['p_expected_version', 'int'], ['p_expected_event_count', 'int'], ['p_move_to_type_id', 'uuid']],
};
export const CALENDAR_RPC_NAMES = Object.keys(RPC_ARGS);

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
    case 'uuid[]':
      if (!Array.isArray(value)) throw bad();
      return value.map((v) => (v === null ? null : toDbType(v, 'uuid')));
    case 'bool':
      if (typeof value === 'boolean') return value;
      throw bad();
    case 'time': {
      const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value));
      if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw bad();
      return value;
    }
    case 'date':
      if (typeof value === 'string' && DATE_PATTERN.test(value)) return value;
      throw bad();
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
const st = (status) => ({ status });
const minutesOf = (text) => (text === null || text === undefined ? null : parseTime(text));
const timeText = (minutes) => (minutes === null ? null : `${toTimeText(minutes)}:00`);
const idsValid = (ids) => Array.isArray(ids) && !ids.includes(null) && new Set(ids).size === ids.length;
const slotKey = (ids) => [...ids].sort().join(',');
const schoolOk = (code) => code === null || LOCATION_CODES.includes(code);

// ----- Default preview data, around "today" (made-up samples) -----
const SAMPLE_TYPES = [['Testing', 'purple'], ['Tournament', 'sky'], ['Camp', 'teal'], ['Meeting', 'orange'], ['Party', 'pink']];
const nextWeekday = (from, weekday) => {
  let d = from;
  while (weekdayOf(d) !== weekday) d = addDays(d, 1);
  return d;
};

export function defaultCalendarData({ today, newId, stamp, schedule, classes, actorName = 'Preview' }) {
  const db = { schema: CALENDAR_STORE_SCHEMA, types: [], events: [], closures: [], closureClasses: [] };
  const book = (row) => ({ ...row, version: 1, created_at: stamp, updated_at: stamp, created_by_name: actorName, updated_by_name: actorName });
  SAMPLE_TYPES.forEach(([name, color], position) => db.types.push(book({ id: newId(), name, color, position })));
  const type = (name) => db.types.find((t) => t.name === name).id;
  const event = (row) => db.events.push(book({ id: newId(), notes: null, starts_at: null, ends_at: null, all_day: true, ...row }));
  event({ location_code: 'worcester', type_id: type('Meeting'), title: 'Parent meeting', starts_on: addDays(today, 2), ends_on: addDays(today, 2), all_day: false, starts_at: '19:30:00', ends_at: '20:30:00', notes: 'In the main room. Coffee and questions about testing.' });
  event({ location_code: 'shrewsbury', type_id: type('Party'), title: 'Belt ceremony', starts_on: addDays(today, 5), ends_on: addDays(today, 5), all_day: false, starts_at: '18:00:00', ends_at: '19:00:00' });
  const saturday = nextWeekday(addDays(today, 9), 6);
  event({ location_code: null, type_id: type('Tournament'), title: 'Spring tournament', starts_on: saturday, ends_on: saturday });
  const camp = nextWeekday(addDays(today, 15), 1);
  event({ location_code: 'worcester', type_id: type('Camp'), title: 'Winter camp', starts_on: camp, ends_on: addDays(camp, 2) });

  // A whole-day closure for both schools, and an evening closure of some Worcester classes.
  const holiday = nextWeekday(addDays(today, 22), 1);
  db.closures.push(book({ id: newId(), location_code: null, starts_on: holiday, ends_on: holiday, reason: 'Holiday', whole_day: true, class_key: '' }));
  const stormDay = nextWeekday(addDays(today, 3), 1);
  const versions = (schedule?.versions ?? []).filter((v) => v.location_code === 'worcester').map((v) => ({ id: v.id, startsOn: v.starts_on }));
  const version = versionInEffect(versions, stormDay);
  const evening = (schedule?.slots ?? [])
    .filter((s) => version && s.version_id === version.id && s.weekday === weekdayOf(stormDay) && minutesOf(s.starts_at) >= 17 * 60)
    .sort((a, b) => minutesOf(a.starts_at) - minutesOf(b.starts_at))
    .slice(0, 2);
  if (evening.length > 0) {
    const closure = book({ id: newId(), location_code: 'worcester', starts_on: stormDay, ends_on: stormDay, reason: 'Snow storm', whole_day: false, class_key: slotKey(evening.map((s) => s.id)) });
    db.closures.push(closure);
    const nameOf = (id) => classes.find((c) => c.id === id)?.name ?? '';
    for (const s of evening) {
      db.closureClasses.push(book({
        id: newId(), closure_id: closure.id, location_code: s.location_code, weekday: s.weekday, starts_at: s.starts_at, ends_at: s.ends_at,
        class_ids: [...s.class_ids], class_names: s.class_ids.map(nameOf).join(' + '), slot_id: s.id,
      }));
    }
  }
  return db;
}

function isUsableStore(store) {
  return Boolean(store) && store.schema === CALENDAR_STORE_SCHEMA
    && ['types', 'events', 'closures', 'closureClasses'].every((key) => Array.isArray(store[key]));
}

// ----- The backend -----

export function createCalendarBackend({ loadStore, saveStore, now = () => Date.now(), newId, getSchedule, getClasses, today }) {
  let failNext = false;
  const stamp = () => new Date(now()).toISOString();

  function read() {
    let store = null;
    try {
      store = loadStore?.() ?? null;
    } catch {
      store = null;
    }
    const db = isUsableStore(store)
      ? clone(store)
      : defaultCalendarData({ today: today(), newId, stamp: stamp(), schedule: getSchedule(), classes: getClasses() });
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
  // A real content change bumps the version (calendar_before_write); position is not content.
  function updateRow(row, changes, ctx, { content = true } = {}) {
    const changed = Object.keys(changes).some((col) => JSON.stringify(changes[col]) !== JSON.stringify(row[col]));
    if (!changed) return;
    Object.assign(row, changes);
    if (!content) return;
    row.version += 1;
    row.updated_at = stamp();
    row.updated_by_name = ctx.actorName;
  }

  // ----- Shared checks (same as the database) -----
  function eventInput(a) {
    const title = cleanText(a.p_title);
    const notes = cleanNotes(a.p_notes);
    const start = minutesOf(a.p_starts_at);
    const end = minutesOf(a.p_ends_at);
    const timesSent = a.p_starts_at !== null || a.p_ends_at !== null;
    const ok = schoolOk(a.p_location_code) && a.p_type_id !== null && a.p_all_day !== null
      && textProblem(a.p_title, TITLE_MAX) === null && notesProblem(a.p_notes) === null
      && !(a.p_all_day && timesSent)
      && (a.p_all_day || (start !== null && end !== null))
      && eventTimesProblem({ startsOn: a.p_starts_on, endsOn: a.p_ends_on, allDay: a.p_all_day, start, end }) === null;
    return ok ? { title, notes, start, end } : null;
  }
  function closureInput(a) {
    const slots = a.p_slot_ids ?? [];
    const ok = schoolOk(a.p_location_code) && textProblem(a.p_reason, TITLE_MAX) === null
      && datesProblem(a.p_starts_on, a.p_ends_on) === null && a.p_whole_day !== null && idsValid(slots)
      && (a.p_whole_day ? slots.length === 0 : a.p_starts_on === a.p_ends_on && slots.length >= 1 && slots.length <= 50);
    return ok ? { reason: cleanText(a.p_reason), slots } : null;
  }
  // The ticked time slots: of the closure's school (or either for Both), in the schedule in
  // effect that day for their own school, on that weekday. → { status } or { records }
  function closureRecords(slotIds, code, date) {
    const schedule = getSchedule();
    const found = slotIds.map((id) => schedule.slots.find((s) => s.id === id) ?? null);
    if (found.some((s) => s && code !== null && s.location_code !== code)) return st('invalid');
    if (found.some((s) => !s)) return st('stale');
    for (const s of found) {
      const versions = schedule.versions.filter((v) => v.location_code === s.location_code).map((v) => ({ id: v.id, startsOn: v.starts_on }));
      if (s.weekday !== weekdayOf(date) || versionInEffect(versions, date)?.id !== s.version_id) return st('stale');
    }
    const classes = getClasses();
    const nameOf = (id) => classes.find((c) => c.id === id)?.name ?? '';
    return {
      records: found
        .sort((x, y) => (x.location_code < y.location_code ? -1 : x.location_code > y.location_code ? 1 : minutesOf(x.starts_at) - minutesOf(y.starts_at)))
        .map((s) => ({
          location_code: s.location_code, weekday: s.weekday, starts_at: s.starts_at, ends_at: s.ends_at,
          class_ids: [...s.class_ids], class_names: s.class_ids.map(nameOf).join(' + '), slot_id: s.id,
        })),
    };
  }
  const typeNameTaken = (db, name, skipId) => db.types.some((t) => t.id !== skipId && t.name.toLowerCase() === name.toLowerCase());

  // ----- The ten functions (access → admin → input → found → stale → write) -----
  const handlers = {
    calendar_add_event(db, a, ctx) {
      const v = eventInput(a);
      if (!v) return st('invalid');
      if (!db.types.some((t) => t.id === a.p_type_id)) return st('stale');
      const row = insertRow(db.events, {
        id: newId(), location_code: a.p_location_code, type_id: a.p_type_id, title: v.title, starts_on: a.p_starts_on, ends_on: a.p_ends_on,
        all_day: a.p_all_day, starts_at: timeText(v.start), ends_at: timeText(v.end), notes: v.notes,
      }, ctx);
      return { status: 'ok', id: row.id, version: row.version };
    },

    calendar_update_event(db, a, ctx) {
      if (a.p_event_id === null || a.p_expected_version === null) return st('invalid');
      const v = eventInput(a);
      if (!v) return st('invalid');
      const row = db.events.find((e) => e.id === a.p_event_id);
      if (!row) return st('not_found');
      if (row.version !== a.p_expected_version) return st('stale');
      if (!db.types.some((t) => t.id === a.p_type_id)) return st('stale');
      updateRow(row, {
        location_code: a.p_location_code, type_id: a.p_type_id, title: v.title, starts_on: a.p_starts_on, ends_on: a.p_ends_on,
        all_day: a.p_all_day, starts_at: timeText(v.start), ends_at: timeText(v.end), notes: v.notes,
      }, ctx);
      return { status: 'ok', id: row.id, version: row.version };
    },

    calendar_remove_event(db, a) {
      if (a.p_event_id === null || a.p_expected_version === null) return st('invalid');
      const row = db.events.find((e) => e.id === a.p_event_id);
      if (!row) return st('not_found');
      if (row.version !== a.p_expected_version) return st('stale');
      db.events = db.events.filter((e) => e.id !== row.id);
      return {
        status: 'ok',
        removed: {
          location_code: row.location_code, type_id: row.type_id, title: row.title, starts_on: row.starts_on, ends_on: row.ends_on,
          all_day: row.all_day, starts_at: row.starts_at?.slice(0, 5) ?? null, ends_at: row.ends_at?.slice(0, 5) ?? null, notes: row.notes,
        },
      };
    },

    calendar_add_closure(db, a, ctx) {
      const v = closureInput(a);
      if (!v) return st('invalid');
      let records = [];
      if (!a.p_whole_day) {
        const r = closureRecords(v.slots, a.p_location_code, a.p_starts_on);
        if (r.status) return r;
        records = r.records;
      }
      const row = insertRow(db.closures, {
        id: newId(), location_code: a.p_location_code, starts_on: a.p_starts_on, ends_on: a.p_ends_on, reason: v.reason,
        whole_day: a.p_whole_day, class_key: slotKey(v.slots),
      }, ctx);
      for (const rec of records) insertRow(db.closureClasses, { id: newId(), closure_id: row.id, ...rec }, ctx);
      return { status: 'ok', id: row.id, version: row.version };
    },

    calendar_update_closure(db, a, ctx) {
      if (a.p_closure_id === null || a.p_expected_version === null) return st('invalid');
      const v = closureInput(a);
      if (!v) return st('invalid');
      const row = db.closures.find((c) => c.id === a.p_closure_id);
      if (!row) return st('not_found');
      if (row.version !== a.p_expected_version) return st('stale');
      const replace = row.whole_day !== a.p_whole_day || row.starts_on !== a.p_starts_on || row.location_code !== a.p_location_code
        || row.class_key !== slotKey(v.slots);
      let records = null;
      if (replace && !a.p_whole_day) {
        const r = closureRecords(v.slots, a.p_location_code, a.p_starts_on);
        if (r.status) return r;
        records = r.records;
      }
      updateRow(row, {
        location_code: a.p_location_code, starts_on: a.p_starts_on, ends_on: a.p_ends_on, reason: v.reason,
        whole_day: a.p_whole_day, class_key: slotKey(v.slots),
      }, ctx);
      if (replace) {
        db.closureClasses = db.closureClasses.filter((x) => x.closure_id !== row.id);
        for (const rec of records ?? []) insertRow(db.closureClasses, { id: newId(), closure_id: row.id, ...rec }, ctx);
      }
      return { status: 'ok', id: row.id, version: row.version };
    },

    calendar_remove_closure(db, a) {
      if (a.p_closure_id === null || a.p_expected_version === null) return st('invalid');
      const row = db.closures.find((c) => c.id === a.p_closure_id);
      if (!row) return st('not_found');
      if (row.version !== a.p_expected_version) return st('stale');
      const slotIds = db.closureClasses
        .filter((x) => x.closure_id === row.id && x.slot_id)
        .sort((x, y) => (x.location_code < y.location_code ? -1 : x.location_code > y.location_code ? 1 : minutesOf(x.starts_at) - minutesOf(y.starts_at)))
        .map((x) => x.slot_id);
      db.closures = db.closures.filter((c) => c.id !== row.id);
      db.closureClasses = db.closureClasses.filter((x) => x.closure_id !== row.id);
      return {
        status: 'ok',
        removed: { location_code: row.location_code, starts_on: row.starts_on, ends_on: row.ends_on, reason: row.reason, whole_day: row.whole_day, slot_ids: slotIds },
      };
    },

    calendar_add_type(db, a, ctx) {
      if (textProblem(a.p_name, TYPE_NAME_MAX) !== null || !COLOR_KEYS.includes(a.p_color)) return st('invalid');
      const name = cleanText(a.p_name);
      if (typeNameTaken(db, name)) return st('duplicate_name');
      if (db.types.length >= MAX_TYPES) return st('invalid');
      const position = db.types.length ? Math.max(...db.types.map((t) => t.position)) + 1 : 0;
      const row = insertRow(db.types, { id: newId(), name, color: a.p_color, position }, ctx);
      return { status: 'ok', id: row.id, version: row.version };
    },

    calendar_update_type(db, a, ctx) {
      if (a.p_type_id === null || a.p_expected_version === null || textProblem(a.p_name, TYPE_NAME_MAX) !== null || !COLOR_KEYS.includes(a.p_color)) {
        return st('invalid');
      }
      const row = db.types.find((t) => t.id === a.p_type_id);
      if (!row) return st('not_found');
      if (row.version !== a.p_expected_version) return st('stale');
      const name = cleanText(a.p_name);
      if (typeNameTaken(db, name, row.id)) return st('duplicate_name');
      updateRow(row, { name, color: a.p_color }, ctx);
      return { status: 'ok', id: row.id, version: row.version };
    },

    calendar_reorder_types(db, a, ctx) {
      const exp = a.p_expected_ids;
      const next = a.p_new_ids;
      if (!idsValid(exp ?? [null]) || !idsValid(next ?? [null]) || exp.length !== next.length || [...exp].sort().join() !== [...next].sort().join()) {
        return st('invalid');
      }
      const order = [...db.types].sort((x, y) => x.position - y.position || (x.id < y.id ? -1 : 1)).map((t) => t.id);
      if (order.join() !== exp.join()) return st('stale');
      next.forEach((id, i) => updateRow(db.types.find((t) => t.id === id), { position: i }, ctx, { content: false }));
      return st('ok');
    },

    calendar_delete_type(db, a) {
      if (a.p_type_id === null || a.p_expected_version === null || a.p_expected_event_count === null || a.p_expected_event_count < 0) return st('invalid');
      const row = db.types.find((t) => t.id === a.p_type_id);
      if (!row) return st('not_found');
      if (row.version !== a.p_expected_version) return st('stale');
      const used = db.events.filter((e) => e.type_id === row.id);
      if (used.length !== a.p_expected_event_count) return st('stale');
      if (used.length > 0) {
        if (!db.types.some((t) => t.id !== row.id)) return st('not_allowed');
        if (a.p_move_to_type_id === null || a.p_move_to_type_id === row.id) return st('invalid');
        if (!db.types.some((t) => t.id === a.p_move_to_type_id)) return st('stale');
      }
      for (const e of used) updateRow(e, { type_id: a.p_move_to_type_id }, { actorName: 'Database admin' });
      db.types = db.types.filter((t) => t.id !== row.id);
      return { status: 'ok', moved: used.length };
    },
  };

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
    if (!ctx.hasDataAccess) return ok([]); // row-level security hides every row
    const db = read();
    let rows = db[TABLE_KEY[table]].filter((row) => filters.every((f) => matches(row, f)));
    rows = [...rows].sort((x, y) => {
      for (const { col, ascending = true } of orders) {
        if (x[col] === y[col]) continue;
        return (x[col] < y[col] ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    return ok(rows.map((row) => Object.fromEntries(wanted.map((col) => [col, row[col] ?? null]))));
  }

  function rpc(name, args = {}, ctx = {}) {
    if (!(name in handlers)) return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
    if (failNext) {
      failNext = false;
      return { data: null, error: { message: 'Failed to fetch (preview: failNextCalendarSave)' }, count: null, status: 0, statusText: '' };
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
    if (!ctx.isAdmin) return ok(st('not_allowed'));
    const db = read(); // a private copy = a transaction: only an 'ok' is saved
    const answer = handlers[name](db, parsed, { actorName: ctx.actorName ?? 'Database admin' });
    if (answer.status === 'ok') write(db);
    return ok(answer);
  }

  // ----- Test helpers -----
  function failNextSave() {
    failNext = true;
  }
  function simulateOtherAdminEdit() {
    const db = read();
    for (const row of [...db.types, ...db.events, ...db.closures]) {
      row.version += 1;
      row.updated_by_name = 'Other Admin';
    }
    write(db);
  }
  function clear() {
    const db = read();
    db.events = [];
    db.closures = [];
    db.closureClasses = [];
    write(db);
  }
  function reset() {
    write(defaultCalendarData({ today: today(), newId, stamp: stamp(), schedule: getSchedule(), classes: getClasses() }));
  }

  return { select, rpc, failNextSave, simulateOtherAdminEdit, clear, reset, snapshot: read };
}
