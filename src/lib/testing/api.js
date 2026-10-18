// api.js — every call the Testing screens make to the database, in one place.
// Why it exists: the screens shouldn't need to know table names, column lists or the exact
// argument names of the database functions. They call friendly functions here instead, and
// always get back a plain object with a `status`:
//   'ok'             it worked (plus the result fields, e.g. { status:'ok', id, version })
//   'no_access'      this sign-in can't see data right now (locked, password too old …)
//   'not_allowed'    only an admin can change Classes and ranks
//   'not_found'      the class/rank no longer exists
//   'stale'          someone else changed it since this screen loaded it
//   'duplicate_name' that name is already used
//   'invalid'        the values were refused (name/price rules, wrong school …)
//   'not_empty'      Undo of "Class added" refused: the class has ranks now
//   'error'          anything else (no connection, unexpected answer) — { status:'error', error }
// These functions NEVER throw, so a screen can't crash because the Wi-Fi dropped.
//
// The database answers in snake_case (final_award_rank_id); this file converts to the
// camelCase the rest of the app uses (finalAwardRankId). Contract 0003 §5.2.
import { supabase } from '../supabase.js';

// Every status a testing call can return (the 8 the server uses + 'error' for everything else).
export const TESTING_STATUSES = [
  'ok', 'no_access', 'not_allowed', 'not_found', 'stale', 'duplicate_name', 'invalid', 'not_empty', 'error',
];
const SERVER_STATUSES = new Set(TESTING_STATUSES.filter((s) => s !== 'error'));

// The columns we're allowed to read. The database refuses select('*') on purpose (some columns
// are hidden from the app), so every read lists its columns.
const CLASS_COLUMNS = 'id, location_code, name, position, final_award_rank_id, final_award_none, version, created_at, updated_at, created_by_name, updated_by_name';
// The five belt_* columns are new in v0.64. Against the real database this read works only
// once migration 0003 with the belts is live (until then: preview mode only).
const RANK_COLUMNS = 'id, class_id, location_code, name, position, early_cents, day_cents, private_cents, sparring_gear, belt_pattern, belt_color, belt_color_2, belt_end_stripes, belt_end_stripe_color, version, created_at, updated_at, created_by_name, updated_by_name';

const KNOWN_LOCATIONS = new Set(['worcester', 'shrewsbury']);

// ----- Converting database rows to app objects -----

function toRank(row) {
  return {
    id: row.id,
    classId: row.class_id,
    locationCode: row.location_code,
    name: row.name,
    position: row.position,
    earlyCents: row.early_cents,
    dayCents: row.day_cents,
    privateCents: row.private_cents,
    sparringGear: row.sparring_gear,
    // The belt picture (belts.js explains the five values).
    beltPattern: row.belt_pattern,
    beltColor: row.belt_color,
    beltColor2: row.belt_color_2 ?? null,
    beltEndStripes: row.belt_end_stripes,
    beltEndStripeColor: row.belt_end_stripe_color ?? null,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByName: row.created_by_name,
    updatedByName: row.updated_by_name,
  };
}

function toClass(row, ranks) {
  return {
    id: row.id,
    locationCode: row.location_code,
    name: row.name,
    position: row.position,
    finalAwardRankId: row.final_award_rank_id ?? null,
    finalAwardNone: row.final_award_none === true, // true = "None": the last rank doesn't promote, on purpose
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByName: row.created_by_name,
    updatedByName: row.updated_by_name,
    ranks,
  };
}

const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));

// ----- Reading -----

// Loads one school's classes with their ranks, sorted by position.
// Three requests at the same time (Promise.all). The third one matters: a locked sign-in
// gets an EMPTY list from the database (that's how row-level security hides rows), which
// would look like "No classes yet". has_data_access tells the two cases apart.
export async function loadClassesAndRanks(locationCode) {
  try {
    if (!KNOWN_LOCATIONS.has(locationCode)) return failure(new Error(`Unknown school: ${locationCode}`));
    if (!supabase) return failure(new Error('No connection is set up'));

    const [classRes, rankRes, accessRes] = await Promise.all([
      supabase.from('testing_classes').select(CLASS_COLUMNS).eq('location_code', locationCode).order('position', { ascending: true }),
      supabase.from('testing_ranks').select(RANK_COLUMNS).eq('location_code', locationCode).order('position', { ascending: true }),
      supabase.rpc('has_data_access'),
    ]);

    // "No access" wins: never show the empty state to a locked sign-in.
    if (!accessRes?.error && accessRes?.data === false) return { status: 'no_access' };
    if (accessRes?.error) return failure(accessRes.error);
    if (classRes?.error) return failure(classRes.error);
    if (rankRes?.error) return failure(rankRes.error);
    if (accessRes?.data !== true) return unexpected('has_data_access');
    if (!Array.isArray(classRes.data) || !Array.isArray(rankRes.data)) return unexpected('the testing tables');

    // Group the ranks under their class.
    const ranksByClass = new Map();
    for (const row of rankRes.data) {
      if (!ranksByClass.has(row.class_id)) ranksByClass.set(row.class_id, []);
      ranksByClass.get(row.class_id).push(toRank(row));
    }
    const classes = classRes.data
      .map((row) => toClass(row, (ranksByClass.get(row.id) ?? []).sort((a, b) => a.position - b.position)))
      .sort((a, b) => a.position - b.position);
    // (A rank whose class isn't in the list — e.g. the class was deleted between the two
    // reads — is simply left out; the next reload shows the settled state.)
    return { status: 'ok', classes };
  } catch (error) {
    return failure(error);
  }
}

// ----- Writing (one database function each) -----

const isUuidText = (v) => typeof v === 'string' && v.length > 0;
const isInt = (v) => Number.isInteger(v);
const isLostList = (v) =>
  Array.isArray(v) && v.every((c) => c && isUuidText(c.id) && typeof c.name === 'string');
const toLostList = (v) => v.map((c) => ({ id: c.id, name: c.name }));

// Calls one database function and turns its answer into { status, … }.
// readOk(data) checks the ok answer's shape and converts it; it returns null if the shape is
// wrong (then we report 'error' rather than guess).
async function callRpc(name, args, readOk) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const { data, error } = await supabase.rpc(name, args);
    if (error) return failure(error);
    const status = data?.status;
    if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return unexpected(name);
    if (status !== 'ok') return { status }; // non-ok answers carry only the status
    const result = readOk(data);
    return result ? { status: 'ok', ...result } : unexpected(name);
  } catch (error) {
    return failure(error);
  }
}

const readIdVersionPosition = (d) =>
  isUuidText(d.id) && isInt(d.version) && isInt(d.position) ? { id: d.id, version: d.version, position: d.position } : null;
const readIdVersion = (d) => (isUuidText(d.id) && isInt(d.version) ? { id: d.id, version: d.version } : null);
// Class answers also say whether the final award is now "None".
const readClassAdded = (d) =>
  typeof d.final_award_none === 'boolean' && readIdVersionPosition(d)
    ? { ...readIdVersionPosition(d), finalAwardNone: d.final_award_none }
    : null;
const readClassUpdated = (d) =>
  typeof d.final_award_none === 'boolean' && readIdVersion(d) ? { ...readIdVersion(d), finalAwardNone: d.final_award_none } : null;
const readNothing = () => ({});

// The final award is sent as TWO values (rankOrder.js finalAwardArgs builds them from a choice):
//   a rank   → finalAwardRankId: '<rank id>', finalAwardNone: false
//   None     → finalAwardRankId: null,        finalAwardNone: true   (last rank doesn't promote)
//   Not set  → finalAwardRankId: null,        finalAwardNone: false  (not decided yet)
// Both are always sent (the database functions have no defaults). A new class starts Not set.
export async function addClass({ locationCode, name, finalAwardRankId = null, finalAwardNone = false } = {}) {
  return callRpc(
    'testing_add_class',
    { p_location_code: locationCode, p_name: name, p_final_award_rank_id: finalAwardRankId, p_final_award_none: finalAwardNone },
    readClassAdded,
  );
}

// No defaults here on purpose: forgetting one of the two final-award values must fail
// (error), never quietly change the award.
export async function updateClass({ classId, expectedVersion, name, finalAwardRankId, finalAwardNone } = {}) {
  return callRpc(
    'testing_update_class',
    {
      p_class_id: classId,
      p_expected_version: expectedVersion,
      p_name: name,
      p_final_award_rank_id: finalAwardRankId,
      p_final_award_none: finalAwardNone,
    },
    readClassUpdated,
  );
}

export async function reorderClasses({ locationCode, expectedIds, newIds } = {}) {
  return callRpc(
    'testing_reorder_classes',
    { p_location_code: locationCode, p_expected_ids: expectedIds, p_new_ids: newIds },
    readNothing,
  );
}

// The arguments come from describeClassDelete (rankOrder.js): exactly what the confirmation said.
export async function deleteClass({ classId, expectedVersion, expectedRankIds, expectedLostAwardClassIds, onlyIfEmpty = false } = {}) {
  return callRpc(
    'testing_delete_class',
    {
      p_class_id: classId,
      p_expected_version: expectedVersion,
      p_expected_rank_ids: expectedRankIds,
      p_expected_lost_award_class_ids: expectedLostAwardClassIds,
      p_only_if_empty: onlyIfEmpty,
    },
    (d) =>
      isInt(d.removed_rank_count) && isLostList(d.classes_lost_award)
        ? { removedRankCount: d.removed_rank_count, classesLostAward: toLostList(d.classes_lost_award) }
        : null,
  );
}

// The five belt values travel as the database arguments p_belt_* (migration 0003); all are always
// sent (no defaults — a forgotten value fails instead of drawing the wrong belt).
const beltArgs = ({ beltPattern, beltColor, beltColor2, beltEndStripes, beltEndStripeColor }) => ({
  p_belt_pattern: beltPattern,
  p_belt_color: beltColor,
  p_belt_color_2: beltColor2,
  p_belt_end_stripes: beltEndStripes,
  p_belt_end_stripe_color: beltEndStripeColor,
});

export async function addRank({
  classId, name, earlyCents, dayCents, privateCents, sparringGear,
  beltPattern, beltColor, beltColor2, beltEndStripes, beltEndStripeColor,
} = {}) {
  return callRpc(
    'testing_add_rank',
    {
      p_class_id: classId,
      p_name: name,
      p_early_cents: earlyCents,
      p_day_cents: dayCents,
      p_private_cents: privateCents,
      p_sparring_gear: sparringGear,
      ...beltArgs({ beltPattern, beltColor, beltColor2, beltEndStripes, beltEndStripeColor }),
    },
    readIdVersionPosition,
  );
}

export async function updateRank({
  rankId, expectedVersion, name, earlyCents, dayCents, privateCents, sparringGear,
  beltPattern, beltColor, beltColor2, beltEndStripes, beltEndStripeColor,
} = {}) {
  return callRpc(
    'testing_update_rank',
    {
      p_rank_id: rankId,
      p_expected_version: expectedVersion,
      p_name: name,
      p_early_cents: earlyCents,
      p_day_cents: dayCents,
      p_private_cents: privateCents,
      p_sparring_gear: sparringGear,
      ...beltArgs({ beltPattern, beltColor, beltColor2, beltEndStripes, beltEndStripeColor }),
    },
    readIdVersion,
  );
}

export async function reorderRanks({ classId, expectedIds, newIds } = {}) {
  return callRpc(
    'testing_reorder_ranks',
    { p_class_id: classId, p_expected_ids: expectedIds, p_new_ids: newIds },
    readNothing,
  );
}

// The arguments come from describeRankDelete / checkUndoAddRank (rankOrder.js).
export async function deleteRank({ rankId, expectedVersion, expectedClassVersion, expectedRankIds, expectedLostAwardClassIds } = {}) {
  return callRpc(
    'testing_delete_rank',
    {
      p_rank_id: rankId,
      p_expected_version: expectedVersion,
      p_expected_class_version: expectedClassVersion,
      p_expected_rank_ids: expectedRankIds,
      p_expected_lost_award_class_ids: expectedLostAwardClassIds,
    },
    (d) => {
      const nowOn = d.class_final_award_now_on ?? null;
      if (!isLostList(d.classes_lost_award) || !(nowOn === null || isUuidText(nowOn))) return null;
      return { classesLostAward: toLostList(d.classes_lost_award), classFinalAwardNowOn: nowOn };
    },
  );
}
