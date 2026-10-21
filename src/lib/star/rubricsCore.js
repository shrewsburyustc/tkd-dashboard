// rubricsCore.js — the real work behind rubricsApi.js: every database call the Star testing
// "Rubrics and prices" tab makes, written against ANY Supabase-shaped client.
// Why it exists: rubricsApi.js imports the app's one connection (supabase.js), and supabase.js
// reads Vite settings (import.meta.env) that don't exist when Node runs the checks. Keeping the
// logic here, with the client passed in, lets star/rubricsChecks.mjs run the exact same code
// against the preview database (mockStarTesting.js) without a browser. The screens never import
// this file; they import rubricsApi.js.
//
// Every function returns a Promise of a plain object with a `status` and NEVER throws:
//   'ok'             it worked (plus the result fields, e.g. { status:'ok', id, version })
//   'no_access'      this sign-in can't see data right now (locked, password too old …)
//   'not_allowed'    only an admin can change Rubrics and prices
//   'invalid'        the values were refused (credit, pass mark, fee, order rules …)
//   'not_found'      the Dan or subject no longer exists
//   'stale'          someone else changed it since this screen loaded it
//   'duplicate_name' that subject name is already used in this Dan
//   'error'          anything else (no connection, unexpected answer) — { status:'error', error }
//
// The database answers in snake_case (pass_mark); this file converts to the camelCase the rest
// of the app uses (passMark). Contract 0006 §2.1 (tables), §4.1 (readable columns), §6.1 (functions).

// Every status a Star rubric call can return (the 7 the server uses + 'error' for everything else).
export const RUBRIC_STATUSES = ['ok', 'no_access', 'not_allowed', 'invalid', 'not_found', 'stale', 'duplicate_name', 'error'];
const SERVER_STATUSES = new Set(RUBRIC_STATUSES.filter((s) => s !== 'error'));

// The columns we read. The database refuses select('*') on purpose (some columns are hidden
// from the app), so every read lists its columns — only the ones the tab needs.
// updated_at / updated_by_name feed the "Last changed by" line in every dialog (granted in 0006 §4.1).
const STAMP_COLUMNS = 'updated_at, updated_by_name';
const DAN_COLUMNS = `dan, label, pass_mark, star_limit, standard_cents, same_day_cents, private_cents, version, ${STAMP_COLUMNS}`;
const CATEGORY_COLUMNS = `id, dan, name, credits, position, from_class_count, version, ${STAMP_COLUMNS}`;
const GRADE_COLUMNS = `id, grade, position, value, version, ${STAMP_COLUMNS}`;
const MIN_SUFFIXES = ['a_plus', 'a', 'b_plus', 'b', 'c_plus', 'c']; // A+ … C (D = below the C minimum)
const ASSISTANT_COLUMNS = [
  'id', 'child_max_age',
  ...MIN_SUFFIXES.map((s) => `child_${s}`),
  ...MIN_SUFFIXES.map((s) => `adult_${s}`),
  'version', 'updated_at', 'updated_by_name',
].join(', ');

const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));

// A real uuid (8-4-4-4-12 hex digits), the format the database gives every id. Anything else
// in an answer is "unexpected" rather than passed on to a later save.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuidText = (v) => typeof v === 'string' && UUID_PATTERN.test(v);
const isInt = (v) => Number.isInteger(v);
// The database sends numeric columns (pass mark, grade values) as JSON numbers; text is
// accepted too, just in case, as long as it really is a number.
const toNumber = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

// ----- Converting what the screens give us into what the database expects -----
// Whole numbers must travel as integers: the functions' arguments are PostgreSQL "integer",
// and 5.5 (or "abc") there is a hard error, not a friendly 'invalid'. So:
//   5 or "5"   → 5          null/undefined → null (sent as is; the server answers 'invalid')
//   5.5, "abc" → NOT_A_NUMBER (we answer 'invalid' ourselves without calling the server)
const NOT_A_NUMBER = Symbol('not a number');
function asInteger(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v) ? Number(v) : v;
  return Number.isInteger(n) ? n : NOT_A_NUMBER;
}
// For the pass mark and grade values (PostgreSQL "numeric"): a finite number, else NOT_A_NUMBER.
function asDecimal(v) {
  if (v === null || v === undefined) return null;
  const n = toNumber(v);
  return n === null ? NOT_A_NUMBER : n;
}
// A list of whole numbers / decimals. A list that isn't a list is passed on as null ('invalid').
const asIntegerList = (list) => (Array.isArray(list) ? list.map(asInteger) : null);
const asDecimalList = (list) => (Array.isArray(list) ? list.map(asDecimal) : null);
const hasBadNumber = (values) => values.some((v) => v === NOT_A_NUMBER || (Array.isArray(v) && v.includes(NOT_A_NUMBER)));

// ----- Converting database rows to app objects -----

// "Last changed" — when (an ISO timestamp text) and by whom (a name, never a login id).
const stampOf = (row) => ({ updatedAt: row.updated_at ?? null, updatedByName: row.updated_by_name ?? null });

function toCategory(row) {
  return {
    id: row.id,
    name: row.name,
    credits: row.credits,
    position: row.position,
    fromClassCount: row.from_class_count === true, // true = Assistant Instructor (worked out from classes)
    version: row.version,
    ...stampOf(row),
  };
}

function toDan(row, categories) {
  return {
    dan: row.dan,
    label: row.label,
    passMark: toNumber(row.pass_mark),
    starLimit: row.star_limit, // "Highest star"
    standardCents: row.standard_cents,
    sameDayCents: row.same_day_cents,
    privateCents: row.private_cents,
    version: row.version,
    ...stampOf(row),
    categories,
  };
}

function toGrade(row) {
  return { id: row.id, grade: row.grade, position: row.position, value: toNumber(row.value), version: row.version, ...stampOf(row) };
}

function toAssistant(row) {
  return {
    id: row.id,
    childMaxAge: row.child_max_age, // "12 and under" when this is 12
    childMins: MIN_SUFFIXES.map((s) => row[`child_${s}`]), // [A+, A, B+, B, C+, C]
    adultMins: MIN_SUFFIXES.map((s) => row[`adult_${s}`]),
    version: row.version,
    ...stampOf(row),
  };
}

// Builds the API functions around a client. getClient() returns the Supabase client (or a
// look-alike) — or null when no connection is set up.
export function createRubricsApi(getClient) {
  // ----- Reading -----

  // Loads the whole tab: the Dans (each with its subjects), the grade scale and the assistant
  // table. Five requests at the same time (Promise.all). The fifth matters: a locked sign-in
  // gets EMPTY lists from the database (that's how row-level security hides rows), which would
  // look like "nothing set up". has_data_access tells the two cases apart.
  async function loadRubrics() {
    try {
      const client = getClient();
      if (!client) return failure(new Error('No connection is set up'));

      const [danRes, categoryRes, gradeRes, assistantRes, accessRes] = await Promise.all([
        client.from('star_dan_settings').select(DAN_COLUMNS).order('dan', { ascending: true }),
        client.from('star_categories').select(CATEGORY_COLUMNS).order('dan', { ascending: true }).order('position', { ascending: true }),
        client.from('star_grade_values').select(GRADE_COLUMNS).order('position', { ascending: true }),
        client.from('star_assistant_table').select(ASSISTANT_COLUMNS),
        client.rpc('has_data_access'),
      ]);

      // "No access" wins: never show an empty tab to a locked sign-in.
      if (!accessRes?.error && accessRes?.data === false) return { status: 'no_access' };
      for (const res of [accessRes, danRes, categoryRes, gradeRes, assistantRes]) {
        if (res?.error) return failure(res.error);
      }
      if (accessRes?.data !== true) return unexpected('has_data_access');
      const lists = [danRes?.data, categoryRes?.data, gradeRes?.data, assistantRes?.data];
      if (!lists.every(Array.isArray)) return unexpected('the Star rubric tables');
      // The seed always makes 7 grade letters and one assistant row; anything else means the
      // database isn't what this screen expects, so say "error" rather than guess.
      if (gradeRes.data.length !== 7 || assistantRes.data.length !== 1) return unexpected('the Star rubric tables');

      // Group the subjects under their Dan.
      const byDan = new Map();
      for (const row of categoryRes.data) {
        if (!byDan.has(row.dan)) byDan.set(row.dan, []);
        byDan.get(row.dan).push(toCategory(row));
      }
      const dans = danRes.data
        .map((row) => toDan(row, (byDan.get(row.dan) ?? []).sort((a, b) => a.position - b.position)))
        .sort((a, b) => a.dan - b.dan);
      const grades = gradeRes.data.map(toGrade).sort((a, b) => a.position - b.position);
      return { status: 'ok', dans, grades, assistant: toAssistant(assistantRes.data[0]) };
    } catch (error) {
      return failure(error);
    }
  }

  // ----- Writing (one database function each) -----

  // Calls one database function and turns its answer into { status, … }.
  // readOk(data) checks the ok answer's shape and converts it; it returns null if the shape is
  // wrong (then we report 'error' rather than guess).
  async function callRpc(name, args, readOk) {
    try {
      const client = getClient();
      if (!client) return failure(new Error('No connection is set up'));
      const { data, error } = await client.rpc(name, args);
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

  const readVersion = (d) => (isInt(d.version) ? { version: d.version } : null);
  const readIdVersion = (d) => (isUuidText(d.id) && isInt(d.version) ? { id: d.id, version: d.version } : null);
  const readIdVersionPosition = (d) =>
    isUuidText(d.id) && isInt(d.version) && isInt(d.position) ? { id: d.id, version: d.version, position: d.position } : null;
  const readVersions = (d) =>
    Array.isArray(d.versions) && d.versions.length === 7 && d.versions.every(isInt) ? { versions: [...d.versions] } : null;
  const readNothing = () => ({});

  // A Dan's pass mark, highest star and three fees (cents, whole dollars). Fees and the Dan's
  // settings share ONE version, so the Fees dialog and the Dan dialog can go stale on each other.
  async function updateDanSettings(dan, expectedVersion, { passMark, starLimit, standardCents, sameDayCents, privateCents } = {}) {
    const ints = [dan, expectedVersion, starLimit, standardCents, sameDayCents, privateCents].map(asInteger);
    const mark = asDecimal(passMark);
    if (hasBadNumber([...ints, mark])) return { status: 'invalid' };
    const [pDan, pVersion, pStarLimit, pStandard, pSameDay, pPrivate] = ints;
    return callRpc(
      'star_update_dan_settings',
      {
        p_dan: pDan,
        p_expected_version: pVersion,
        p_pass_mark: mark,
        p_star_limit: pStarLimit,
        p_standard_cents: pStandard,
        p_same_day_cents: pSameDay,
        p_private_cents: pPrivate,
      },
      readVersion,
    );
  }

  // A new judged subject at the end of the Dan's list.
  async function addCategory(dan, name, credits) {
    const [pDan, pCredits] = [dan, credits].map(asInteger);
    if (hasBadNumber([pDan, pCredits])) return { status: 'invalid' };
    return callRpc('star_add_category', { p_dan: pDan, p_name: name ?? null, p_credits: pCredits }, readIdVersionPosition);
  }

  // Rename / re-credit a subject (Assistant Instructor too).
  async function updateCategory(id, expectedVersion, name, credits) {
    const [pVersion, pCredits] = [expectedVersion, credits].map(asInteger);
    if (hasBadNumber([pVersion, pCredits])) return { status: 'invalid' };
    return callRpc(
      'star_update_category',
      { p_category_id: id ?? null, p_expected_version: pVersion, p_name: name ?? null, p_credits: pCredits },
      readIdVersion,
    );
  }

  // expectedIds = the order the screen showed; newIds = the same ids in the new order.
  async function reorderCategories(dan, expectedIds, newIds) {
    const pDan = asInteger(dan);
    if (hasBadNumber([pDan])) return { status: 'invalid' };
    return callRpc(
      'star_reorder_categories',
      { p_dan: pDan, p_expected_ids: expectedIds ?? null, p_new_ids: newIds ?? null },
      readNothing,
    );
  }

  // Removes a judged subject (Assistant Instructor can't be removed: 'invalid').
  async function deleteCategory(id, expectedVersion) {
    const pVersion = asInteger(expectedVersion);
    if (hasBadNumber([pVersion])) return { status: 'invalid' };
    return callRpc('star_delete_category', { p_category_id: id ?? null, p_expected_version: pVersion }, readNothing);
  }

  // The 7 grade values in the order A+, A, B+, B, C+, C, D, with the 7 versions as shown.
  async function updateGradeValues(expectedVersions, values) {
    const pVersions = asIntegerList(expectedVersions);
    const pValues = asDecimalList(values);
    if (hasBadNumber([pVersions ?? [], pValues ?? []])) return { status: 'invalid' };
    return callRpc('star_update_grade_values', { p_expected_versions: pVersions, p_values: pValues }, readVersions);
  }

  // The age split and the minimum assistant classes (6 numbers per age group, A+ … C).
  async function updateAssistantTable(expectedVersion, childMaxAge, childMins, adultMins) {
    const [pVersion, pAge] = [expectedVersion, childMaxAge].map(asInteger);
    const pChild = asIntegerList(childMins);
    const pAdult = asIntegerList(adultMins);
    if (hasBadNumber([pVersion, pAge, pChild ?? [], pAdult ?? []])) return { status: 'invalid' };
    return callRpc(
      'star_update_assistant_table',
      { p_expected_version: pVersion, p_child_max_age: pAge, p_child_mins: pChild, p_adult_mins: pAdult },
      readVersion,
    );
  }

  return {
    loadRubrics, updateDanSettings, addCategory, updateCategory, reorderCategories, deleteCategory,
    updateGradeValues, updateAssistantTable,
  };
}
