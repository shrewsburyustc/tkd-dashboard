// api.js — every call the Calendar makes to the database, in one place.
// Why it exists: like schedule/api.js — the screen never needs table names, column lists or the
// argument names of the database functions (migration 0008). Every function returns a plain
// object with a `status` and NEVER throws:
//   'ok'             it worked (plus the result fields)
//   'no_access'      this sign-in can't see data right now (locked, password too old …)
//   'not_allowed'    only an admin can change the calendar — or a type in use can't go
//   'not_found'      the event / closure / type no longer exists
//   'stale'          someone else changed it since this screen loaded it
//   'duplicate_name' another event type already has that name
//   'invalid'        the values were refused
//   'error'          anything else (no connection, unexpected answer) — { status:'error', error }
// The database answers in snake_case; this file converts to camelCase. Times become minutes
// after midnight (schedule/time.js).
import { supabase } from '../supabase.js';
import { parseTime, toTimeText } from '../schedule/time.js';

export const CALENDAR_STATUSES = ['ok', 'no_access', 'not_allowed', 'not_found', 'stale', 'duplicate_name', 'invalid', 'error'];
const SERVER_STATUSES = new Set(CALENDAR_STATUSES.filter((s) => s !== 'error'));

// The columns the app may read (the database refuses select('*') on purpose).
const TYPE_COLUMNS = 'id, name, color, position, version';
const EVENT_COLUMNS = 'id, location_code, type_id, title, starts_on, ends_on, all_day, starts_at, ends_at, notes, version, updated_at, updated_by_name';
const CLOSURE_COLUMNS = 'id, location_code, starts_on, ends_on, reason, whole_day, version, updated_at, updated_by_name';
const CLOSURE_CLASS_COLUMNS = 'id, closure_id, location_code, weekday, starts_at, ends_at, class_ids, class_names, slot_id';

const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));
const isText = (v) => typeof v === 'string' && v.length > 0;
const isInt = (v) => Number.isInteger(v);
const timeOrNull = (v) => (v === null || v === undefined ? null : parseTime(v));
const timeArg = (minutes) => (Number.isInteger(minutes) ? toTimeText(minutes) : null);

const toType = (row) => ({ id: row.id, name: row.name, color: row.color, position: row.position, version: row.version });

function toEvent(row) {
  return {
    id: row.id,
    locationCode: row.location_code ?? null, // null = both schools
    typeId: row.type_id,
    title: row.title,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    allDay: row.all_day,
    start: timeOrNull(row.starts_at),
    end: timeOrNull(row.ends_at),
    notes: row.notes ?? null,
    version: row.version,
    updatedByName: row.updated_by_name,
  };
}

function toClosure(row) {
  return {
    id: row.id,
    locationCode: row.location_code ?? null,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    reason: row.reason,
    wholeDay: row.whole_day,
    version: row.version,
    updatedByName: row.updated_by_name,
  };
}

function toClosureClass(row) {
  return {
    id: row.id,
    closureId: row.closure_id,
    locationCode: row.location_code,
    weekday: row.weekday,
    start: parseTime(row.starts_at),
    end: parseTime(row.ends_at),
    classIds: row.class_ids ?? [],
    classNames: row.class_names,
    slotId: row.slot_id ?? null,
  };
}

// ----- Reading -----

// Loads the event types and every event and closure that touches the dates from..to (both
// schools — the screen filters), plus the cancelled-class records of those closures.
export async function loadCalendar({ from, to }) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const [typeRes, eventRes, closureRes, accessRes] = await Promise.all([
      supabase.from('calendar_event_types').select(TYPE_COLUMNS).order('position', { ascending: true }),
      supabase.from('calendar_events').select(EVENT_COLUMNS).lte('starts_on', to).gte('ends_on', from).order('starts_on', { ascending: true }),
      supabase.from('calendar_closures').select(CLOSURE_COLUMNS).lte('starts_on', to).gte('ends_on', from).order('starts_on', { ascending: true }),
      supabase.rpc('has_data_access'),
    ]);
    if (!accessRes?.error && accessRes?.data === false) return { status: 'no_access' };
    for (const res of [accessRes, typeRes, eventRes, closureRes]) {
      if (res?.error) return failure(res.error);
    }
    if (accessRes?.data !== true) return unexpected('has_data_access');
    if (![typeRes, eventRes, closureRes].every((r) => Array.isArray(r?.data))) return unexpected('the calendar tables');

    const closures = closureRes.data.map(toClosure);
    const someIds = closures.filter((c) => !c.wholeDay).map((c) => c.id);
    const closureClasses = new Map();
    if (someIds.length > 0) {
      const res = await supabase.from('calendar_closure_classes').select(CLOSURE_CLASS_COLUMNS).in('closure_id', someIds);
      if (res?.error) return failure(res.error);
      if (!Array.isArray(res?.data)) return unexpected('calendar_closure_classes');
      for (const row of res.data.map(toClosureClass)) {
        if (row.start === null || row.end === null) continue;
        if (!closureClasses.has(row.closureId)) closureClasses.set(row.closureId, []);
        closureClasses.get(row.closureId).push(row);
      }
    }
    return {
      status: 'ok',
      types: typeRes.data.map(toType),
      events: eventRes.data.map(toEvent).filter((e) => e.allDay || (e.start !== null && e.end !== null)),
      closures,
      closureClasses,
    };
  } catch (error) {
    return failure(error);
  }
}

// Color Belt and Star testing events, read from Testing (rulebook v0.143 answer 1). Their tables
// arrive with migrations 0005 (Color Belt phase 2) and 0006 (Star testing), which aren't built
// yet; until then there is nothing to show. When they exist, this reads them (read-only) and
// returns [{ id, locationCode, title, date, start, kind: 'colorBelt' | 'star' }].
export async function loadTestingEvents() {
  return { status: 'ok', events: [] };
}

// How many events use a type (the delete confirmation names it).
export async function countEventsForType(typeId) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const res = await supabase.from('calendar_events').select('id').eq('type_id', typeId);
    if (res?.error) return failure(res.error);
    if (!Array.isArray(res?.data)) return unexpected('calendar_events');
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

const readSaved = (d) => (isText(d.id) && isInt(d.version) ? { id: d.id, version: d.version } : null);

const eventArgs = (e) => ({
  p_location_code: e.locationCode,
  p_type_id: e.typeId,
  p_title: e.title,
  p_starts_on: e.startsOn,
  p_ends_on: e.endsOn,
  p_all_day: e.allDay,
  p_starts_at: e.allDay ? null : timeArg(e.start),
  p_ends_at: e.allDay ? null : timeArg(e.end),
  p_notes: e.notes,
});

// locationCode null = both schools.
export async function addEvent(event) {
  return callRpc('calendar_add_event', eventArgs(event), readSaved);
}

export async function updateEvent({ id, expectedVersion, ...event }) {
  return callRpc('calendar_update_event', { p_event_id: id, p_expected_version: expectedVersion, ...eventArgs(event) }, readSaved);
}

// Returns what was removed (for Undo): the same fields addEvent takes.
export async function removeEvent({ id, expectedVersion }) {
  return callRpc('calendar_remove_event', { p_event_id: id, p_expected_version: expectedVersion }, (d) => {
    const r = d.removed;
    if (!r || !isText(r.type_id) || !isText(r.title) || typeof r.all_day !== 'boolean') return null;
    return {
      removed: {
        locationCode: r.location_code ?? null,
        typeId: r.type_id,
        title: r.title,
        startsOn: r.starts_on,
        endsOn: r.ends_on,
        allDay: r.all_day,
        start: timeOrNull(r.starts_at),
        end: timeOrNull(r.ends_at),
        notes: r.notes ?? null,
      },
    };
  });
}

const closureArgs = (c) => ({
  p_location_code: c.locationCode,
  p_starts_on: c.startsOn,
  p_ends_on: c.endsOn,
  p_reason: c.reason,
  p_whole_day: c.wholeDay,
  p_slot_ids: c.wholeDay ? [] : c.slotIds,
});

// wholeDay false: slotIds = the ticked time slots of the schedule in effect that day.
export async function addClosure(closure) {
  return callRpc('calendar_add_closure', closureArgs(closure), readSaved);
}

export async function updateClosure({ id, expectedVersion, ...closure }) {
  return callRpc('calendar_update_closure', { p_closure_id: id, p_expected_version: expectedVersion, ...closureArgs(closure) }, readSaved);
}

// Returns what was removed (for Undo): the fields addClosure takes.
export async function removeClosure({ id, expectedVersion }) {
  return callRpc('calendar_remove_closure', { p_closure_id: id, p_expected_version: expectedVersion }, (d) => {
    const r = d.removed;
    if (!r || !isText(r.reason) || typeof r.whole_day !== 'boolean' || !Array.isArray(r.slot_ids)) return null;
    return {
      removed: { locationCode: r.location_code ?? null, startsOn: r.starts_on, endsOn: r.ends_on, reason: r.reason, wholeDay: r.whole_day, slotIds: r.slot_ids },
    };
  });
}

export async function addType({ name, color }) {
  return callRpc('calendar_add_type', { p_name: name, p_color: color }, readSaved);
}

export async function updateType({ id, expectedVersion, name, color }) {
  return callRpc('calendar_update_type', { p_type_id: id, p_expected_version: expectedVersion, p_name: name, p_color: color }, readSaved);
}

// newIds = the same ids in the new order; expectedIds = the order the screen showed.
export async function reorderTypes({ expectedIds, newIds }) {
  return callRpc('calendar_reorder_types', { p_expected_ids: expectedIds, p_new_ids: newIds }, () => ({}));
}

export async function deleteType({ id, expectedVersion, expectedEventCount, moveToTypeId }) {
  return callRpc(
    'calendar_delete_type',
    { p_type_id: id, p_expected_version: expectedVersion, p_expected_event_count: expectedEventCount, p_move_to_type_id: moveToTypeId },
    (d) => (isInt(d.moved) ? { moved: d.moved } : null),
  );
}
