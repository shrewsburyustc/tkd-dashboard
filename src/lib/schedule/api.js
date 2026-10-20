// api.js — every call the Schedule screen makes to the database, in one place.
// Why it exists: the screen shouldn't need to know table names, column lists or argument names
// of the database functions (migration 0007). It calls friendly functions here and always gets
// back a plain object with a `status`:
//   'ok'             it worked (plus the result fields)
//   'no_access'      this sign-in can't see data right now (locked, password too old …)
//   'not_allowed'    only an admin can change the schedule — or that schedule can't change
//                    (a past one; the current one's start date)
//   'not_found'      the slot / schedule no longer exists
//   'stale'          someone else changed it since this screen loaded it
//   'duplicate_date' another schedule of this school already starts that day
//   'invalid'        the values were refused (times, days, school …)
//   'error'          anything else (no connection, unexpected answer) — { status:'error', error }
// These functions NEVER throw, so the screen can't crash because the Wi-Fi dropped.
// The database answers in snake_case; this file converts to camelCase. Times become minutes
// after midnight (time.js).
import { supabase } from '../supabase.js';
import { parseTime, toTimeText } from './time.js';

export const SCHEDULE_STATUSES = [
  'ok', 'no_access', 'not_allowed', 'not_found', 'stale', 'duplicate_date', 'invalid', 'error',
];
const SERVER_STATUSES = new Set(SCHEDULE_STATUSES.filter((s) => s !== 'error'));
const KNOWN_LOCATIONS = new Set(['worcester', 'shrewsbury']);

// The columns the app may read (the database refuses select('*') on purpose).
const VERSION_COLUMNS = 'id, location_code, name, starts_on, version, created_at, updated_at, created_by_name, updated_by_name';
const SLOT_COLUMNS = 'id, version_id, location_code, weekday, starts_at, ends_at, version, updated_at, updated_by_name';
// Which class(es) each slot is for — one, or several taught together (v0.237).
const SLOT_CLASS_COLUMNS = 'slot_id, class_id, position';
const COLOR_COLUMNS = 'id, class_id, location_code, color, version';
const CLASS_COLUMNS = 'id, name, position';

const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));
const isText = (v) => typeof v === 'string' && v.length > 0;
const isInt = (v) => Number.isInteger(v);

function toVersion(row) {
  return {
    id: row.id,
    locationCode: row.location_code,
    name: row.name ?? null,
    startsOn: row.starts_on,
    version: row.version,
    updatedByName: row.updated_by_name,
  };
}

function toSlot(row, classIds) {
  return {
    id: row.id,
    versionId: row.version_id,
    classIds, // in the order the admin ticked them
    weekday: row.weekday,
    start: parseTime(row.starts_at),
    end: parseTime(row.ends_at),
    version: row.version,
    updatedByName: row.updated_by_name,
  };
}

// ----- Reading -----

// Loads one school's schedules, time slots, class colors, the school's classes (from Testing)
// and "today" (Massachusetts) — all at the same time. Like Testing, has_data_access tells a
// locked sign-in (which gets EMPTY lists) apart from a school that has no schedule yet.
export async function loadSchedule(locationCode) {
  try {
    if (!KNOWN_LOCATIONS.has(locationCode)) return failure(new Error(`Unknown school: ${locationCode}`));
    if (!supabase) return failure(new Error('No connection is set up'));
    const [versionRes, slotRes, slotClassRes, colorRes, classRes, todayRes, accessRes] = await Promise.all([
      supabase.from('schedule_versions').select(VERSION_COLUMNS).eq('location_code', locationCode).order('starts_on', { ascending: true }),
      supabase.from('schedule_slots').select(SLOT_COLUMNS).eq('location_code', locationCode).order('starts_at', { ascending: true }),
      supabase.from('schedule_slot_classes').select(SLOT_CLASS_COLUMNS).eq('location_code', locationCode).order('position', { ascending: true }),
      supabase.from('schedule_class_colors').select(COLOR_COLUMNS).eq('location_code', locationCode),
      supabase.from('testing_classes').select(CLASS_COLUMNS).eq('location_code', locationCode).order('position', { ascending: true }),
      supabase.rpc('schedule_today'),
      supabase.rpc('has_data_access'),
    ]);
    if (!accessRes?.error && accessRes?.data === false) return { status: 'no_access' };
    for (const res of [accessRes, versionRes, slotRes, slotClassRes, colorRes, classRes, todayRes]) {
      if (res?.error) return failure(res.error);
    }
    if (accessRes?.data !== true) return unexpected('has_data_access');
    if (![versionRes, slotRes, slotClassRes, colorRes, classRes].every((r) => Array.isArray(r?.data))) return unexpected('the schedule tables');
    if (typeof todayRes?.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(todayRes.data)) return unexpected('schedule_today');

    const colors = Object.fromEntries(colorRes.data.map((row) => [row.class_id, row.color]));
    const classesBySlot = new Map();
    for (const row of [...slotClassRes.data].sort((a, b) => a.position - b.position)) {
      if (!classesBySlot.has(row.slot_id)) classesBySlot.set(row.slot_id, []);
      classesBySlot.get(row.slot_id).push(row.class_id);
    }
    return {
      status: 'ok',
      today: todayRes.data,
      versions: versionRes.data.map(toVersion),
      // (A slot with no class rows — e.g. caught between two reads while a class was deleted — is left out.)
      slots: slotRes.data
        .map((row) => toSlot(row, classesBySlot.get(row.id) ?? []))
        .filter((s) => s.start !== null && s.end !== null && s.classIds.length > 0),
      classes: classRes.data.map((row) => ({ id: row.id, name: row.name, position: row.position })),
      colors,
    };
  } catch (error) {
    return failure(error);
  }
}

// How many time slots a class is in, on any schedule (Testing's delete dialog says so, Q1).
// Returns { status:'ok', count } — or the usual failure statuses.
export async function countSlotsForClass(classId) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const res = await supabase.from('schedule_slot_classes').select('slot_id').eq('class_id', classId);
    if (res?.error) return failure(res.error);
    if (!Array.isArray(res?.data)) return unexpected('schedule_slot_classes');
    return { status: 'ok', count: res.data.length };
  } catch (error) {
    return failure(error);
  }
}

// ----- Writing (one database function each) -----

async function callRpc(name, args, readOk) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const { data, error } = await supabase.rpc(name, args);
    if (error) return failure(error);
    const status = data?.status;
    if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return unexpected(name);
    if (status !== 'ok') return { status };
    const result = readOk(data);
    return result ? { status: 'ok', ...result } : unexpected(name);
  } catch (error) {
    return failure(error);
  }
}

const readOverlaps = (list) =>
  Array.isArray(list)
    ? list.map((o) => ({
        slotId: o.slot_id,
        weekday: o.weekday,
        classIds: o.class_ids ?? [],
        className: o.class_name, // "White + Little Tiger" for a combined slot
        start: parseTime(o.starts_at),
        end: parseTime(o.ends_at),
      }))
    : null;

// versionId null = the school's FIRST schedule (made by the database, starting today).
// classIds: one class, or several taught together (v0.237).
export async function addSlots({ locationCode, versionId, classIds, weekdays, start, end }) {
  return callRpc(
    'schedule_add_slots',
    {
      p_location_code: locationCode,
      p_version_id: versionId,
      p_class_ids: classIds,
      p_weekdays: weekdays,
      p_starts_at: toTimeText(start),
      p_ends_at: toTimeText(end),
    },
    (d) => {
      const overlaps = readOverlaps(d.overlaps);
      if (!isText(d.version_id) || !Array.isArray(d.slots) || !overlaps) return null;
      return { versionId: d.version_id, slots: d.slots.map((s) => ({ id: s.id, weekday: s.weekday, version: s.version })), overlaps };
    },
  );
}

export async function updateSlot({ slotId, expectedVersion, classIds, weekday, start, end }) {
  return callRpc(
    'schedule_update_slot',
    {
      p_slot_id: slotId,
      p_expected_version: expectedVersion,
      p_class_ids: classIds,
      p_weekday: weekday,
      p_starts_at: toTimeText(start),
      p_ends_at: toTimeText(end),
    },
    (d) => (isText(d.id) && isInt(d.version) && readOverlaps(d.overlaps) ? { id: d.id, version: d.version } : null),
  );
}

// Returns what was removed (for Undo): { versionId, classIds, weekday, start, end }.
export async function removeSlot({ slotId, expectedVersion }) {
  return callRpc('schedule_remove_slot', { p_slot_id: slotId, p_expected_version: expectedVersion }, (d) => {
    const r = d.removed;
    if (!r || !isText(r.version_id) || !Array.isArray(r.class_ids) || !r.class_ids.every(isText) || !isInt(r.weekday)) return null;
    const start = parseTime(r.starts_at);
    const end = parseTime(r.ends_at);
    if (start === null || end === null) return null;
    return { removed: { versionId: r.version_id, classIds: r.class_ids, weekday: r.weekday, start, end } };
  });
}

export async function planVersion({ locationCode, name, startsOn, copy }) {
  return callRpc(
    'schedule_plan_version',
    { p_location_code: locationCode, p_name: name, p_starts_on: startsOn, p_copy: copy },
    (d) => (isText(d.id) && isInt(d.version) && isInt(d.slot_count) ? { id: d.id, version: d.version, slotCount: d.slot_count } : null),
  );
}

export async function updateVersion({ versionId, expectedVersion, name, startsOn }) {
  return callRpc(
    'schedule_update_version',
    { p_version_id: versionId, p_expected_version: expectedVersion, p_name: name, p_starts_on: startsOn },
    (d) => (isText(d.id) && isInt(d.version) ? { id: d.id, version: d.version } : null),
  );
}

export async function deleteVersion({ versionId, expectedVersion, expectedSlotCount }) {
  return callRpc(
    'schedule_delete_version',
    { p_version_id: versionId, p_expected_version: expectedVersion, p_expected_slot_count: expectedSlotCount },
    (d) => (isInt(d.removed_slot_count) ? { removedSlotCount: d.removed_slot_count } : null),
  );
}

export async function setClassColor({ classId, color }) {
  return callRpc('schedule_set_class_color', { p_class_id: classId, p_color: color }, (d) =>
    isText(d.class_id) && isText(d.color) ? { classId: d.class_id, color: d.color } : null,
  );
}
