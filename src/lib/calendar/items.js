// items.js — turns one row of the database's calendar_items answer into the app's item (v0.645).
// Why it exists: api.js talks to the database, but this step is plain data work (snake_case to
// camelCase, times to minutes, unknown things left out), so it lives apart where checks.mjs can test
// it in Node without a connection. The database already made the child's name "Ava N." — nothing
// here (or anywhere in the app) builds or guesses a name.
//
// An item: { kind, id, date, start, end (minutes after midnight or null; both null = all day),
//   locationCode (null = both schools), title, child, what, place, opens, refId, eventId }
import { parseTime } from '../schedule/time.js';

export const ITEM_KINDS = ['colorbelt_event', 'colorbelt_private', 'star_event', 'star_private', 'camp_day', 'bb_day', 'signup', 'deadline'];
export const ITEM_OPENS = ['colorbelt_event', 'colorbelt_private', 'star_event', 'star_private', 'camp', 'bb_cycle', 'prospect'];

const isText = (v) => typeof v === 'string' && v.length > 0;

// One row → an item, or null when the row is one this app can't use (a kind from a later version,
// a missing id, a time that isn't a time). Left out quietly: it never breaks the Calendar.
export function toItem(row) {
  if (!row || !ITEM_KINDS.includes(row.kind)) return null;
  if (!isText(row.id) || !isText(row.date) || !ITEM_OPENS.includes(row.opens) || !isText(row.ref_id)) return null;
  const start = row.start === null || row.start === undefined ? null : parseTime(row.start);
  const end = row.end === null || row.end === undefined ? null : parseTime(row.end);
  if ((row.start !== null && row.start !== undefined && start === null) || (row.end !== null && row.end !== undefined && end === null)) return null;
  return {
    kind: row.kind,
    id: row.id,
    date: row.date,
    start,
    end: start === null ? null : end,
    locationCode: row.location_code ?? null,
    title: typeof row.title === 'string' ? row.title : '',
    child: row.child ?? null,
    what: row.what ?? null,
    place: row.place ?? null,
    opens: row.opens,
    refId: row.ref_id,
    eventId: row.event_id ?? null,
  };
}
