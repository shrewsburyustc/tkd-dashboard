// mockSchedule.js — the PREVIEW (fake) database for the Schedule (migration 0007).
// Why it exists: preview mode runs without Supabase. This file pretends to be the three
// schedule tables and the schedule_* functions, with the SAME rules and answers as the real
// database (same check order, same statuses). mockClient.js plugs it in; schedule/checks.mjs
// tests it in Node with a plain in-memory store.
//
//   const backend = createScheduleBackend({ loadStore, saveStore, now, newId, getClasses, today });
//   getClasses() → Testing's fake classes [{ id, location_code, name, position }] (mockTesting)
//   today()      → Massachusetts' date 'YYYY-MM-DD'
//   backend.select('schedule_slots', 'id, …', [{ col, value }], [{ col, ascending }], ctx)
//   backend.rpc('schedule_add_slots', { p_… }, ctx)     ctx = { signedIn, hasDataAccess, isAdmin, actorName }
//
// A slot is for one class or several taught together (v0.141): the store keeps them as the slot's
// class_ids list; the app reads them as rows of schedule_slot_classes, like the real table.
// Deleting a class in Testing removes it from its slots and drops its color in the real database
// ("on delete cascade"; a slot left with no class goes too). Here the two fake databases are
// separate, so the same thing happens on every read and write.
import { parseTime, timeProblem, toTimeText } from './schedule/time.js';
import { COLOR_KEYS } from './schedule/colors.js';
import { classifyVersions, addDays, weekdayOf } from './schedule/versions.js';
import { nameProblem, normalizeName } from './testing/names.js';

// 2 — combined classes (v0.141): a slot keeps class_ids (a list) instead of class_id.
export const SCHEDULE_STORE_SCHEMA = 2;
const LOCATION_CODES = ['worcester', 'shrewsbury'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const GRANTED_COLUMNS = {
  schedule_versions: ['id', 'location_code', 'name', 'starts_on', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'],
  schedule_slots: ['id', 'version_id', 'location_code', 'weekday', 'starts_at', 'ends_at', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'],
  schedule_slot_classes: ['id', 'slot_id', 'location_code', 'class_id', 'position', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'],
  schedule_class_colors: ['id', 'class_id', 'location_code', 'color', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'],
};
const TABLE_KEY = { schedule_versions: 'versions', schedule_slots: 'slots', schedule_class_colors: 'colors' };
// Columns that exist but the app may not read (like the real grants).
const HIDDEN = ['created_by', 'updated_by', 'class_set', 'class_ids', 'class_key'];

// ----- Argument lists (name, type) — the real API finds a function by its argument names -----
const RPC_ARGS = {
  schedule_add_slots: [['p_location_code', 'text'], ['p_version_id', 'uuid'], ['p_class_ids', 'uuid[]'], ['p_weekdays', 'int[]'], ['p_starts_at', 'time'], ['p_ends_at', 'time']],
  schedule_update_slot: [['p_slot_id', 'uuid'], ['p_expected_version', 'int'], ['p_class_ids', 'uuid[]'], ['p_weekday', 'int'], ['p_starts_at', 'time'], ['p_ends_at', 'time']],
  schedule_remove_slot: [['p_slot_id', 'uuid'], ['p_expected_version', 'int']],
  schedule_plan_version: [['p_location_code', 'text'], ['p_name', 'text'], ['p_starts_on', 'date'], ['p_copy', 'bool']],
  schedule_update_version: [['p_version_id', 'uuid'], ['p_expected_version', 'int'], ['p_name', 'text'], ['p_starts_on', 'date']],
  schedule_delete_version: [['p_version_id', 'uuid'], ['p_expected_version', 'int'], ['p_expected_slot_count', 'int']],
  schedule_set_class_color: [['p_class_id', 'uuid'], ['p_color', 'text']],
};
export const SCHEDULE_RPC_NAMES = [...Object.keys(RPC_ARGS), 'schedule_today'];

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
    case 'int[]':
      if (!Array.isArray(value)) throw bad();
      return value.map((v) => (v === null ? null : toDbType(v, 'int')));
    case 'bool':
      if (typeof value === 'boolean') return value;
      throw bad();
    case 'time': {
      const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value));
      if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw bad();
      return value; // the seconds are checked by the rules (16:00:30 is invalid, not an error)
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
// '16:00:30' → null (not on whole minutes); '16:00' / '16:00:00' → minutes
const minutesOf = (text) => (text === null ? null : parseTime(text));

// The real schedule_weekdays_are_valid: 1-7 items, each 1..7, none twice.
// The real schedule_class_ids_are_valid: 1-10 ids, none empty, none twice.
function classIdsValid(ids) {
  return Array.isArray(ids) && ids.length >= 1 && ids.length <= 10 && !ids.includes(null) && new Set(ids).size === ids.length;
}

function weekdaysValid(days) {
  return Array.isArray(days) && days.length >= 1 && days.length <= 7 && days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    && new Set(days).size === days.length;
}

// The real schedule_name_is_valid: optional; 1-40 characters after clean-up, Testing's name rules.
function cleanName(name) {
  if (name === null) return { ok: true, value: null };
  const value = normalizeName(name);
  if (value === '') return { ok: true, value: null };
  if (nameProblem(name) !== null || value.length > 40) return { ok: false };
  return { ok: true, value };
}

// ----- Default preview data: a believable week for each school, by class name -----
// Times are made-up samples (the real ones are entered after launch, decision Q2).
const SAMPLE_WEEK = [
  // [class name, weekdays, start, end]
  ['Little Tiger', [2, 4], '16:00', '16:30'],
  ['White', [1, 3], '16:00', '16:45'],
  [['White', 'Little Tiger'], [6], '09:30', '10:15'], // taught together (combined slot, v0.141)
  ['Group A', [1, 3], '17:00', '17:45'],
  ['Group A', [6], '10:15', '11:00'],
  ['Group B', [2, 4], '17:00', '17:45'],
  ['Group B', [6], '11:00', '11:45'],
  ['Group C', [1, 3], '18:00', '18:45'],
  ['Group D', [2, 4], '18:00', '18:45'],
  ['Teen/Adult', [1, 3], '19:00', '20:00'],
  ['Teen/Adult', [5], '18:00', '19:00'],
];
const SAMPLE_COLORS = { 'Little Tiger': 'pink', White: 'gray', 'Group A': 'yellow', 'Group B': 'green', 'Group C': 'sky', 'Group D': 'teal', 'Teen/Adult': 'purple' };

export function defaultScheduleData({ classes, today, newId, stamp, actorName = 'Preview' }) {
  const db = { schema: SCHEDULE_STORE_SCHEMA, versions: [], slots: [], colors: [] };
  const book = (row) => ({ ...row, version: 1, created_at: stamp, updated_at: stamp, created_by_name: actorName, updated_by_name: actorName });
  // The current schedule started 6 weeks ago; "Winter" is planned for the first Monday 3+ weeks out.
  const currentStart = addDays(today, -42);
  let winterStart = addDays(today, 21);
  while (weekdayOf(winterStart) !== 1) winterStart = addDays(winterStart, 1);
  for (const code of LOCATION_CODES) {
    const byName = new Map(classes.filter((c) => c.location_code === code).map((c) => [c.name, c]));
    const current = book({ id: newId(), location_code: code, name: null, starts_on: currentStart });
    const winter = book({ id: newId(), location_code: code, name: 'Winter', starts_on: winterStart });
    db.versions.push(current, winter);
    for (const [names, days, start, end] of SAMPLE_WEEK) {
      const ids = [names].flat().map((n) => byName.get(n)?.id).filter(Boolean);
      if (ids.length === 0) continue;
      const name = [names].flat()[0];
      for (const weekday of days) {
        for (const version of [current, winter]) {
          // Winter: White moves 30 minutes earlier on weekdays (so the two differ visibly).
          const shift = version === winter && name === 'White' && weekday !== 6 ? -30 : 0;
          db.slots.push(book({
            id: newId(), version_id: version.id, location_code: code, class_ids: ids, weekday,
            starts_at: `${toTimeText(parseTime(start) + shift)}:00`, ends_at: `${toTimeText(parseTime(end) + shift)}:00`,
          }));
        }
      }
    }
    for (const [name, color] of Object.entries(SAMPLE_COLORS)) {
      const cls = byName.get(name);
      if (cls) db.colors.push(book({ id: newId(), class_id: cls.id, location_code: code, color }));
    }
  }
  return db;
}

function isUsableStore(store) {
  return Boolean(store) && store.schema === SCHEDULE_STORE_SCHEMA
    && ['versions', 'slots', 'colors'].every((key) => Array.isArray(store[key]));
}

// ----- The backend -----

export function createScheduleBackend({ loadStore, saveStore, now = () => Date.now(), newId, getClasses, today }) {
  let failNext = false;
  const stamp = () => new Date(now()).toISOString();

  // The current data, with rows of deleted classes dropped (the real "on delete cascade").
  function read() {
    let store = null;
    try {
      store = loadStore?.() ?? null;
    } catch {
      store = null;
    }
    const classes = getClasses();
    const db = isUsableStore(store)
      ? clone(store)
      : defaultScheduleData({ classes, today: today(), newId, stamp: stamp() });
    const classIds = new Set(classes.map((c) => c.id));
    for (const slot of db.slots) slot.class_ids = slot.class_ids.filter((id) => classIds.has(id));
    db.slots = db.slots.filter((s) => s.class_ids.length > 0); // a slot with no class left goes
    db.colors = db.colors.filter((c) => classIds.has(c.class_id));
    if (!isUsableStore(store)) saveStore?.(db); // keep the generated ids stable
    return db;
  }
  const write = (db) => saveStore?.(db);

  function insertRow(list, row, ctx) {
    const at = stamp();
    const full = { ...row, version: 1, created_at: at, updated_at: at, created_by_name: ctx.actorName, updated_by_name: ctx.actorName };
    list.push(full);
    return full;
  }
  // A real content change bumps the version (the schedule_before_write trigger).
  function updateRow(row, changes, ctx) {
    const changed = Object.keys(changes).some((col) => changes[col] !== row[col]);
    if (!changed) return;
    Object.assign(row, changes);
    row.version += 1;
    row.updated_at = stamp();
    row.updated_by_name = ctx.actorName;
  }

  const classById = (id) => getClasses().find((c) => c.id === id) ?? null;
  const stateOf = (db, version) => {
    const list = classifyVersions(
      db.versions.filter((v) => v.location_code === version.location_code).map((v) => ({ id: v.id, startsOn: v.starts_on })),
      today(),
    );
    return list.find((v) => v.id === version.id)?.state ?? null;
  };
  const overlapsIn = (db, versionId, weekdays, start, end, skipId) =>
    db.slots
      .filter((s) => s.version_id === versionId && weekdays.includes(s.weekday) && s.id !== skipId
        && minutesOf(s.starts_at) < end && minutesOf(s.ends_at) > start)
      .sort((a, b) => a.weekday - b.weekday || minutesOf(a.starts_at) - minutesOf(b.starts_at))
      .map((s) => ({
        slot_id: s.id, weekday: s.weekday, class_ids: [...s.class_ids],
        class_name: s.class_ids.map((id) => classById(id)?.name ?? '').join(' + '),
        starts_at: s.starts_at.slice(0, 5), ends_at: s.ends_at.slice(0, 5),
      }));
  // 'ok' | 'stale' (a class no longer exists) | 'invalid' (one is from the other school)
  const checkClasses = (ids, code) => {
    const found = ids.map(classById);
    if (found.some((c) => !c)) return 'stale';
    if (found.some((c) => c.location_code !== code)) return 'invalid';
    return 'ok';
  };
  const timesOk = (a, b) => {
    const start = minutesOf(a);
    const end = minutesOf(b);
    return { start, end, ok: timeProblem(start, end) === null };
  };

  // ----- The 7 functions (same check order as 0007: access → admin → input → found → stale → state → write) -----
  const handlers = {
    schedule_add_slots(db, a, ctx) {
      const t = timesOk(a.p_starts_at, a.p_ends_at);
      if (!LOCATION_CODES.includes(a.p_location_code) || !classIdsValid(a.p_class_ids) || !weekdaysValid(a.p_weekdays) || !t.ok) return st('invalid');
      const check = checkClasses(a.p_class_ids, a.p_location_code);
      if (check !== 'ok') return st(check);
      let versionId = a.p_version_id;
      if (versionId === null) {
        if (db.versions.some((v) => v.location_code === a.p_location_code)) return st('stale');
        versionId = insertRow(db.versions, { id: newId(), location_code: a.p_location_code, name: null, starts_on: today() }, ctx).id;
      } else {
        const version = db.versions.find((v) => v.id === versionId && v.location_code === a.p_location_code);
        if (!version) return st('not_found');
        if (stateOf(db, version) === 'past') return st('not_allowed');
      }
      const overlaps = overlapsIn(db, versionId, a.p_weekdays, t.start, t.end, null);
      const slots = [...a.p_weekdays].sort((x, y) => x - y).map((weekday) => {
        const row = insertRow(db.slots, {
          id: newId(), version_id: versionId, location_code: a.p_location_code, class_ids: [...a.p_class_ids], weekday,
          starts_at: `${toTimeText(t.start)}:00`, ends_at: `${toTimeText(t.end)}:00`,
        }, ctx);
        return { id: row.id, weekday, version: row.version };
      });
      return { status: 'ok', version_id: versionId, slots, overlaps };
    },

    schedule_update_slot(db, a, ctx) {
      const t = timesOk(a.p_starts_at, a.p_ends_at);
      if (a.p_slot_id === null || a.p_expected_version === null || !classIdsValid(a.p_class_ids) || a.p_weekday === null
        || a.p_weekday < 1 || a.p_weekday > 7 || !t.ok) return st('invalid');
      const slot = db.slots.find((s) => s.id === a.p_slot_id);
      if (!slot) return st('not_found');
      if (slot.version !== a.p_expected_version) return st('stale');
      const version = db.versions.find((v) => v.id === slot.version_id);
      if (stateOf(db, version) === 'past') return st('not_allowed');
      const check = checkClasses(a.p_class_ids, slot.location_code);
      if (check !== 'ok') return st(check);
      const overlaps = overlapsIn(db, slot.version_id, [a.p_weekday], t.start, t.end, slot.id);
      // The class list, in order, counts as content (like the real class_set column): a change bumps the version.
      slot.class_key = slot.class_key ?? slot.class_ids.join(',');
      slot.class_ids = [...a.p_class_ids];
      updateRow(slot, { class_key: a.p_class_ids.join(','), weekday: a.p_weekday, starts_at: `${toTimeText(t.start)}:00`, ends_at: `${toTimeText(t.end)}:00` }, ctx);
      return { status: 'ok', id: slot.id, version: slot.version, overlaps };
    },

    schedule_remove_slot(db, a) {
      if (a.p_slot_id === null || a.p_expected_version === null) return st('invalid');
      const slot = db.slots.find((s) => s.id === a.p_slot_id);
      if (!slot) return st('not_found');
      if (slot.version !== a.p_expected_version) return st('stale');
      if (stateOf(db, db.versions.find((v) => v.id === slot.version_id)) === 'past') return st('not_allowed');
      db.slots = db.slots.filter((s) => s.id !== slot.id);
      return {
        status: 'ok',
        removed: { version_id: slot.version_id, class_ids: [...slot.class_ids], weekday: slot.weekday, starts_at: slot.starts_at.slice(0, 5), ends_at: slot.ends_at.slice(0, 5) },
      };
    },

    schedule_plan_version(db, a, ctx) {
      const name = cleanName(a.p_name);
      if (!LOCATION_CODES.includes(a.p_location_code) || a.p_starts_on === null || a.p_starts_on <= today() || a.p_copy === null || !name.ok) {
        return st('invalid');
      }
      const school = db.versions.filter((v) => v.location_code === a.p_location_code);
      if (school.some((v) => v.starts_on === a.p_starts_on)) return st('duplicate_date');
      const row = insertRow(db.versions, { id: newId(), location_code: a.p_location_code, name: name.value, starts_on: a.p_starts_on }, ctx);
      let source = null;
      let count = 0;
      if (a.p_copy) {
        source = school.filter((v) => v.starts_on < a.p_starts_on).sort((x, y) => (x.starts_on < y.starts_on ? 1 : -1))[0] ?? null;
        if (source) {
          for (const s of db.slots.filter((x) => x.version_id === source.id)) {
            insertRow(db.slots, { id: newId(), version_id: row.id, location_code: s.location_code, class_ids: [...s.class_ids], weekday: s.weekday, starts_at: s.starts_at, ends_at: s.ends_at }, ctx);
            count += 1;
          }
        }
      }
      return { status: 'ok', id: row.id, version: row.version, copied_from: source?.id ?? null, slot_count: count };
    },

    schedule_update_version(db, a, ctx) {
      const name = cleanName(a.p_name);
      if (a.p_version_id === null || a.p_expected_version === null || a.p_starts_on === null || a.p_starts_on <= today() || !name.ok) {
        return st('invalid');
      }
      const version = db.versions.find((v) => v.id === a.p_version_id);
      if (!version) return st('not_found');
      if (version.version !== a.p_expected_version) return st('stale');
      if (stateOf(db, version) !== 'planned') return st('not_allowed');
      if (db.versions.some((v) => v.location_code === version.location_code && v.starts_on === a.p_starts_on && v.id !== version.id)) {
        return st('duplicate_date');
      }
      updateRow(version, { name: name.value, starts_on: a.p_starts_on }, ctx);
      return { status: 'ok', id: version.id, version: version.version };
    },

    schedule_delete_version(db, a) {
      if (a.p_version_id === null || a.p_expected_version === null || a.p_expected_slot_count === null || a.p_expected_slot_count < 0) {
        return st('invalid');
      }
      const version = db.versions.find((v) => v.id === a.p_version_id);
      if (!version) return st('not_found');
      if (version.version !== a.p_expected_version) return st('stale');
      if (stateOf(db, version) !== 'planned') return st('not_allowed');
      const count = db.slots.filter((s) => s.version_id === version.id).length;
      if (count !== a.p_expected_slot_count) return st('stale');
      db.versions = db.versions.filter((v) => v.id !== version.id);
      db.slots = db.slots.filter((s) => s.version_id !== version.id);
      return { status: 'ok', removed_slot_count: count };
    },

    schedule_set_class_color(db, a, ctx) {
      if (a.p_class_id === null || a.p_color === null || !COLOR_KEYS.includes(a.p_color)) return st('invalid');
      const cls = classById(a.p_class_id);
      if (!cls) return st('not_found');
      let row = db.colors.find((c) => c.class_id === cls.id);
      if (row) updateRow(row, { color: a.p_color }, ctx);
      else row = insertRow(db.colors, { id: newId(), class_id: cls.id, location_code: cls.location_code, color: a.p_color }, ctx);
      return { status: 'ok', class_id: cls.id, color: row.color, version: row.version };
    },
  };

  const ok = (data) => ({ data, error: null, count: null, status: 200, statusText: 'OK' });
  const fail = (code, message, status = 403) => ({ data: null, error: { code, message, details: null, hint: null }, count: null, status, statusText: '' });
  const denied = (what) => fail('42501', `permission denied for ${what}`, 403);

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
    let rows =
      table === 'schedule_slot_classes'
        ? db.slots.flatMap((slot) =>
            slot.class_ids.map((classId, position) => ({
              id: `${slot.id}-${position}`, slot_id: slot.id, location_code: slot.location_code, class_id: classId, position,
              version: 1, created_at: slot.created_at, updated_at: slot.updated_at,
              created_by_name: slot.created_by_name, updated_by_name: slot.updated_by_name,
            })),
          )
        : db[TABLE_KEY[table]];
    rows = rows.filter((row) => filters.every((f) => String(row[f.col]) === String(f.value)));
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
    if (name === 'schedule_today') {
      if (!ctx.signedIn) return denied('function schedule_today');
      return ok(today());
    }
    if (!(name in handlers)) return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
    if (failNext) {
      failNext = false;
      return { data: null, error: { message: 'Failed to fetch (preview: failNextSave)' }, count: null, status: 0, statusText: '' };
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
  // Another admin edits every row (open dialogs and Undo become stale).
  function simulateOtherAdminEdit() {
    const db = read();
    for (const row of [...db.versions, ...db.slots]) {
      row.version += 1;
      row.updated_by_name = 'Other Admin';
    }
    write(db);
  }
  function clearSchool(school) {
    const code = String(school ?? '').trim().toLowerCase();
    if (!LOCATION_CODES.includes(code)) return false;
    const db = read();
    db.versions = db.versions.filter((v) => v.location_code !== code);
    db.slots = db.slots.filter((s) => s.location_code !== code);
    write(db);
    return true;
  }
  function reset() {
    write(defaultScheduleData({ classes: getClasses(), today: today(), newId, stamp: stamp() }));
  }

  return { select, rpc, failNextSave, simulateOtherAdminEdit, clearSchool, reset, snapshot: read };
}
