// mockTesting.js — the PREVIEW (fake) database for Testing → Classes and ranks.
// Why it exists: preview mode (npm run dev:preview-mode) runs without Supabase. This file
// pretends to be the parts of the real database that migration 0003 adds — the two tables
// and the 8 testing_* functions — and follows the SAME rules: the same order of checks, the
// same answers ('ok', 'stale', 'duplicate_name' …), the same name/price/position/version rules.
// That way what you see in preview is what the real dashboard will do.
//
// It is a "pure core": it never touches the browser by itself. mockClient.js plugs it in and
// gives it a place to keep its data (localStorage). The Node checks (testing/checks.mjs) plug in
// a plain in-memory store instead — so the rules can be tested without a browser.
//
//   const backend = createTestingBackend({ loadStore, saveStore, now, newId });
//   backend.select('testing_ranks', 'id, name', [{ col, value }], [{ col, ascending }], ctx)
//   backend.rpc('testing_add_rank', { p_class_id: …, … }, ctx)
//   ctx = { signedIn, hasDataAccess, isAdmin, actorName }  ← who is asking (worked out by mockClient)
//
// The stored data looks like the real tables (snake_case columns):
//   { schema: 3, classes: [{ id, location_code, name, position, final_award_rank_id, final_award_none, version,
//     created_at, updated_at, created_by_name, updated_by_name }], ranks: [{ …, early_cents … }] }
//
// Words used:
//   stamp   — "last changed at / by" (updated_at, updated_by_name)
//   version — goes up by 1 each time the CONTENT of a row changes; a position-only change
//             (a reorder) never changes it. A screen sends the version it saw; if the row has
//             moved on since, the answer is 'stale' (someone else changed it).
import { normalizeName, nameProblem, nameKey } from './testing/names.js';
import { isValidCents } from './money.js';
import { validateBelt } from './testing/belts.js';

// Raised whenever the columns change, so preview data saved by an older build is replaced by
// the default data instead of being read without the new columns:
//   2 — v0.62 added final_award_none   3 — v0.64 added the five belt_* columns
export const TESTING_STORE_SCHEMA = 3;
const LOCATION_CODES = ['worcester', 'shrewsbury'];
const LOCATION_ROWS = [
  { code: 'worcester', name: 'Worcester' },
  { code: 'shrewsbury', name: 'Shrewsbury' },
];

// ----- Default preview data -----
// The REAL list exported from the old system (supabase/manual/0003s_export_from_old_system.json:
// 7 classes, 42 ranks, real prices) with Jeffrey's approved adjustments (v0.62:
// supabase/manual/0003s_adjustments.json), copied in short form here so the preview bundle
// doesn't carry the whole export. Both schools get the same list.
// Each rank: [name, early $, testing day $, private $, sparring gear needed?, belt picture]
//   belt(pattern, color, color2, endStripes) — see testing/belts.js. Belts were added in v0.64
//   (look approved v0.67; the database has the same columns in migration 0003).
// finalAward: [class name, rank name] — what the seed works out (contract 0003 §4) —
//   or 'none' (None: the last rank doesn't promote, on purpose), or null (Not set).
// A belt in the store's column names. Kids' "LT" belts are white with a colored middle stripe,
// "High" belts are the color with a white middle stripe, Bo Dan stripes are yellow end stripes.
function belt(pattern, color, color2 = null, endStripes = 0) {
  return {
    belt_pattern: pattern,
    belt_color: color,
    belt_color_2: color2,
    belt_end_stripes: endStripes,
    belt_end_stripe_color: 'yellow',
  };
}

const PREVIEW_LIST = [
  {
    name: 'Little Tiger',
    finalAward: ['Group A', 'Yellow'],
    ranks: [
      ['LT White', 50, 60, 70, false, belt('solid', 'white')],
      ['LT Yellow', 50, 60, 70, false, belt('stripe', 'white', 'yellow')],
      ['LT Green', 50, 60, 70, false, belt('stripe', 'white', 'green')],
      ['LT Blue', 50, 60, 70, false, belt('stripe', 'white', 'blue')],
      ['LT Red', 50, 60, 70, false, belt('stripe', 'white', 'red')],
      ['LT Black', 50, 60, 70, false, belt('stripe', 'white', 'black')],
    ],
  },
  { name: 'White', finalAward: ['Group A', 'Yellow'], ranks: [['White', 65, 75, 85, false, belt('solid', 'white')]] },
  {
    name: 'Group A',
    finalAward: ['Group B', 'Blue'],
    ranks: [
      ['Yellow', 65, 75, 85, false, belt('solid', 'yellow')],
      ['Orange', 65, 75, 85, false, belt('solid', 'orange')],
      ['Green', 65, 75, 85, false, belt('solid', 'green')],
      ['High Green', 65, 75, 85, false, belt('stripe', 'green', 'white')],
    ],
  },
  {
    name: 'Group B',
    finalAward: ['Group C', 'High Red'],
    ranks: [
      ['Blue', 70, 80, 95, true, belt('solid', 'blue')],
      ['High Blue', 70, 80, 95, true, belt('stripe', 'blue', 'white')],
      ['Purple', 70, 80, 95, true, belt('solid', 'purple')],
      ['Red', 70, 80, 95, true, belt('solid', 'red')],
    ],
  },
  {
    name: 'Group C',
    finalAward: ['Group D', 'Bo Dan'],
    ranks: [
      ['High Red', 75, 85, 95, true, belt('stripe', 'red', 'white')],
      ['Brown', 75, 85, 95, true, belt('solid', 'brown')],
      ['High Brown', 75, 85, 95, true, belt('stripe', 'brown', 'white')],
      ['Red / Black', 75, 85, 95, true, belt('half', 'red', 'black')],
    ],
  },
  {
    // None: Deputy is practice for Dan testing, not a promotion (approved adjustment, v0.62).
    name: 'Group D',
    finalAward: 'none',
    ranks: [
      ['Bo Dan', 100, 110, 120, true, belt('stripe', 'black', 'white')],
      ['Bo Dan - 1 Big Stripe', 100, 110, 120, true, belt('stripe', 'black', 'white', 1)],
      ['Bo Dan - 2 Big Stripe', 100, 110, 120, true, belt('stripe', 'black', 'white', 2)],
      ['Bo Dan - 3 Big Stripe', 120, 130, 150, true, belt('stripe', 'black', 'white', 3)],
      ['Deputy', 10, 10, 10, true, belt('stripe', 'black', 'yellow')],
    ],
  },
  {
    name: 'Teen/Adult',
    finalAward: 'none', // same reason as Group D (v0.62)
    ranks: [
      ['White', 65, 75, 85, false, belt('solid', 'white')],
      ['Yellow', 65, 75, 85, false, belt('solid', 'yellow')],
      ['Orange', 65, 75, 85, false, belt('solid', 'orange')],
      ['Green', 65, 75, 85, false, belt('solid', 'green')],
      ['High Green', 65, 75, 85, false, belt('stripe', 'green', 'white')], // private $95 → $85: matches the kids' classes (approved, v0.62)
      ['Blue', 70, 80, 95, true, belt('solid', 'blue')],
      ['High Blue', 70, 80, 95, true, belt('stripe', 'blue', 'white')],
      ['Purple', 70, 80, 95, true, belt('solid', 'purple')],
      ['Red', 70, 80, 95, true, belt('solid', 'red')],
      ['High Red', 75, 85, 95, true, belt('stripe', 'red', 'white')],
      ['Brown', 75, 85, 95, true, belt('solid', 'brown')],
      ['High Brown', 75, 85, 95, true, belt('stripe', 'brown', 'white')],
      ['Red / Black', 75, 85, 95, true, belt('half', 'red', 'black')],
      ['Bo Dan', 100, 110, 120, true, belt('stripe', 'black', 'white')],
      ['Bo Dan - 1 Big Stripe', 100, 110, 120, true, belt('stripe', 'black', 'white', 1)],
      ['Bo Dan - 2 Big Stripe', 100, 110, 120, true, belt('stripe', 'black', 'white', 2)],
      ['Bo Dan - 3 Big Stripe', 120, 130, 150, true, belt('stripe', 'black', 'white', 3)],
      ['Deputy', 10, 10, 10, true, belt('stripe', 'black', 'yellow')],
    ],
  },
];

const DEFAULT_STAMP = '2026-10-16T20:52:00Z'; // shows as "Oct 16, 4:52 PM" in Eastern time
const DEFAULT_ACTOR = 'Main Admin';

// Fixed, valid uuids for the default rows, so "Reset" always brings back the same ids.
// e.g. school 1, class 2 → 0000010a-0000-4000-8000-000000000002
const pad12 = (n) => String(n).padStart(12, '0');
const defaultClassId = (school, c) => `00000${school}0a-0000-4000-8000-${pad12(c)}`;
const defaultRankId = (school, c, r) => `00000${school}0b-0000-4000-8000-${pad12(c * 100 + r)}`;

// A fresh copy of the default preview data (both schools, same list, different ids).
export function defaultTestingData() {
  const classes = [];
  const ranks = [];
  const stamps = { version: 1, created_at: DEFAULT_STAMP, updated_at: DEFAULT_STAMP, created_by_name: DEFAULT_ACTOR, updated_by_name: DEFAULT_ACTOR };
  LOCATION_CODES.forEach((code, schoolIndex) => {
    const school = schoolIndex + 1;
    const rankIdByName = new Map(); // "group a|yellow" → id (to resolve the final awards)
    PREVIEW_LIST.forEach((cls, c) => {
      const classId = defaultClassId(school, c);
      classes.push({
        id: classId, location_code: code, name: cls.name, position: c,
        final_award_rank_id: null, final_award_none: cls.finalAward === 'none', ...stamps,
      });
      cls.ranks.forEach(([name, early, day, priv, sparring, beltColumns], r) => {
        const id = defaultRankId(school, c, r);
        rankIdByName.set(`${cls.name}|${name}`.toLowerCase(), id);
        ranks.push({
          id, class_id: classId, location_code: code, name, position: r,
          early_cents: early * 100, day_cents: day * 100, private_cents: priv * 100, sparring_gear: sparring,
          ...beltColumns, ...stamps,
        });
      });
    });
    PREVIEW_LIST.forEach((cls, c) => {
      if (!Array.isArray(cls.finalAward)) return; // None or Not set: no rank to point at
      const row = classes.find((x) => x.id === defaultClassId(school, c));
      row.final_award_rank_id = rankIdByName.get(cls.finalAward.join('|').toLowerCase()) ?? null;
    });
  });
  return { schema: TESTING_STORE_SCHEMA, classes, ranks };
}

// ----- Table permissions (the same as migration 0003 §1.8) -----

// Columns the app may read. Anything else — including '*' — is "permission denied".
const GRANTED_COLUMNS = {
  locations: ['code', 'name'],
  testing_classes: ['id', 'location_code', 'name', 'position', 'final_award_rank_id', 'final_award_none', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'],
  testing_ranks: ['id', 'class_id', 'location_code', 'name', 'position', 'early_cents', 'day_cents', 'private_cents', 'sparring_gear',
    'belt_pattern', 'belt_color', 'belt_color_2', 'belt_end_stripes', 'belt_end_stripe_color', 'version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'],
};
// Columns that exist but are hidden from the app (who changed it, as an id).
const HIDDEN_COLUMNS = { locations: [], testing_classes: ['created_by', 'updated_by'], testing_ranks: ['created_by', 'updated_by'] };

// "Content" columns: changing one of these raises the version (contract §1.5).
const CLASS_CONTENT = ['name', 'final_award_rank_id', 'final_award_none'];
const RANK_CONTENT = [
  'name', 'early_cents', 'day_cents', 'private_cents', 'sparring_gear',
  'belt_pattern', 'belt_color', 'belt_color_2', 'belt_end_stripes', 'belt_end_stripe_color', // v0.64
];

// ----- The 8 functions' argument lists (name, type, has a default?) -----
// The real API (PostgREST) finds a function by its argument NAMES: a missing argument
// without a default, or an extra one, means "no such function". Values are converted to the
// database types the same way, so a bad uuid or a decimal price is an error, not a status.
const BELT_ARGS = [
  ['p_belt_pattern', 'text'], ['p_belt_color', 'text'], ['p_belt_color_2', 'text'],
  ['p_belt_end_stripes', 'int'], ['p_belt_end_stripe_color', 'text'],
];
const RPC_ARGS = {
  // v0.62: both final-award arguments are required (no defaults).
  testing_add_class: [['p_location_code', 'text'], ['p_name', 'text'], ['p_final_award_rank_id', 'uuid'], ['p_final_award_none', 'bool']],
  testing_update_class: [
    ['p_class_id', 'uuid'], ['p_expected_version', 'int'], ['p_name', 'text'], ['p_final_award_rank_id', 'uuid'],
    ['p_final_award_none', 'bool'],
  ],
  testing_reorder_classes: [['p_location_code', 'text'], ['p_expected_ids', 'uuid[]'], ['p_new_ids', 'uuid[]']],
  testing_delete_class: [
    ['p_class_id', 'uuid'], ['p_expected_version', 'int'], ['p_expected_rank_ids', 'uuid[]'],
    ['p_expected_lost_award_class_ids', 'uuid[]'], ['p_only_if_empty', 'bool', true],
  ],
  // v0.64 (the same arguments as the database, migration 0003): the five p_belt_* values, no defaults.
  testing_add_rank: [
    ['p_class_id', 'uuid'], ['p_name', 'text'], ['p_early_cents', 'int'], ['p_day_cents', 'int'],
    ['p_private_cents', 'int'], ['p_sparring_gear', 'bool'], ...BELT_ARGS,
  ],
  testing_update_rank: [
    ['p_rank_id', 'uuid'], ['p_expected_version', 'int'], ['p_name', 'text'], ['p_early_cents', 'int'],
    ['p_day_cents', 'int'], ['p_private_cents', 'int'], ['p_sparring_gear', 'bool'], ...BELT_ARGS,
  ],
  testing_reorder_ranks: [['p_class_id', 'uuid'], ['p_expected_ids', 'uuid[]'], ['p_new_ids', 'uuid[]']],
  testing_delete_rank: [
    ['p_rank_id', 'uuid'], ['p_expected_version', 'int'], ['p_expected_class_version', 'int'],
    ['p_expected_rank_ids', 'uuid[]'], ['p_expected_lost_award_class_ids', 'uuid[]'],
  ],
};
export const TESTING_RPC_NAMES = Object.keys(RPC_ARGS);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_MAX = 2147483647; // the largest PostgreSQL "integer"

// Thrown inside this file only, turned into a { data:null, error } answer.
class DbError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// Converts one JSON value to the database type (or throws like PostgreSQL would).
function toDbType(value, type) {
  if (value === null) return null;
  switch (type) {
    case 'text':
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      throw new DbError('22P02', `invalid input syntax for type text: ${JSON.stringify(value)}`);
    case 'uuid':
      if (typeof value === 'string' && UUID_PATTERN.test(value)) return value.toLowerCase();
      throw new DbError('22P02', `invalid input syntax for type uuid: "${value}"`);
    case 'int': {
      let n = value;
      if (typeof value === 'string' && /^\s*[+-]?\d+\s*$/.test(value)) n = Number(value);
      if (typeof n !== 'number' || !Number.isInteger(n)) throw new DbError('22P02', `invalid input syntax for type integer: "${value}"`);
      if (Math.abs(n) > INT_MAX) throw new DbError('22003', `value "${value}" is out of range for type integer`);
      return n;
    }
    case 'bool':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 't') return true;
      if (value === 'false' || value === 'f') return false;
      throw new DbError('22P02', `invalid input syntax for type boolean: "${value}"`);
    case 'uuid[]':
      if (!Array.isArray(value)) throw new DbError('22P02', `malformed array literal: "${value}"`);
      return value.map((item) => toDbType(item, 'uuid'));
    default:
      throw new Error(`unknown type ${type}`);
  }
}

// Matches the call's argument names to the function, converts every value, fills defaults.
function readArgs(name, args) {
  const spec = RPC_ARGS[name];
  // JSON drops keys whose value is undefined, so treat them as "not sent".
  const sent = Object.keys(args ?? {}).filter((key) => args[key] !== undefined);
  const known = new Set(spec.map(([key]) => key));
  const missing = spec.some(([key, , hasDefault]) => !hasDefault && !sent.includes(key));
  if (missing || sent.some((key) => !known.has(key))) {
    throw new DbError('PGRST202', `Could not find the function public.${name}(${[...sent].sort().join(', ')}) in the schema cache`, 404);
  }
  const out = {};
  for (const [key, type, hasDefault] of spec) {
    if (sent.includes(key)) out[key] = toDbType(args[key], type);
    else if (hasDefault) out[key] = false; // the only default left: p_only_if_empty
  }
  return out;
}

// ----- Small helpers -----

const clone = (value) => JSON.parse(JSON.stringify(value));
const st = (status) => ({ status }); // a non-ok answer: just the status
const byPosition = (a, b) => a.position - b.position;
const sameOrdered = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameSet = (a, b) => {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every((x) => setB.has(x));
};
const hasNull = (list) => list.some((x) => x === null);
const hasDuplicates = (list) => new Set(list).size !== list.length;
const nameIsValid = (name) => name !== null && nameProblem(name) === null;
const priceIsValid = (cents) => cents !== null && isValidCents(cents);
// The belt arguments as a belts.js belt, and the belt columns of a stored rank as one too.
const beltFromArgs = (a) => ({
  beltPattern: a.p_belt_pattern, beltColor: a.p_belt_color, beltColor2: a.p_belt_color_2,
  beltEndStripes: a.p_belt_end_stripes, beltEndStripeColor: a.p_belt_end_stripe_color,
});
const beltFromRow = (r) => ({
  beltPattern: r.belt_pattern, beltColor: r.belt_color, beltColor2: r.belt_color_2,
  beltEndStripes: r.belt_end_stripes, beltEndStripeColor: r.belt_end_stripe_color,
});
const beltColumns = (a) => ({
  belt_pattern: a.p_belt_pattern, belt_color: a.p_belt_color, belt_color_2: a.p_belt_color_2,
  belt_end_stripes: a.p_belt_end_stripes, belt_end_stripe_color: a.p_belt_end_stripe_color,
});
// v0.62: None must be said (true/false, never null) and can't come with a rank.
const finalAwardArgsBad = (a) => a.p_final_award_none === null || (a.p_final_award_none && a.p_final_award_rank_id !== null);

// Is the store we loaded usable? (Missing or damaged → start again from the default data.)
function isUsableStore(store) {
  if (!store || store.schema !== TESTING_STORE_SCHEMA) return false;
  if (!Array.isArray(store.classes) || !Array.isArray(store.ranks)) return false;
  const classOk = (c) => c && typeof c.id === 'string' && LOCATION_CODES.includes(c.location_code)
    && typeof c.name === 'string' && Number.isInteger(c.position) && Number.isInteger(c.version)
    && typeof c.final_award_none === 'boolean' && !(c.final_award_none && c.final_award_rank_id != null);
  const rankOk = (r) => r && typeof r.id === 'string' && typeof r.class_id === 'string'
    && typeof r.name === 'string' && Number.isInteger(r.position) && Number.isInteger(r.version)
    && [r.early_cents, r.day_cents, r.private_cents].every(isValidCents) && typeof r.sparring_gear === 'boolean'
    && validateBelt(beltFromRow(r)) === null;
  return store.classes.every(classOk) && store.ranks.every(rankOk);
}

// ----- The backend -----

export function createTestingBackend({ loadStore, saveStore, now = () => Date.now(), newId }) {
  let failNext = false; // set by failNextSave()

  // The current data (always a private copy: changes only count once saved).
  function read() {
    let store = null;
    try {
      store = loadStore?.() ?? null;
    } catch {
      store = null;
    }
    return isUsableStore(store) ? clone(store) : defaultTestingData();
  }

  function write(db) {
    saveStore?.(db);
  }

  const stamp = () => new Date(now()).toISOString();

  // ----- What the before-write triggers do (contract §1.6) -----

  function insertRow(list, row, ctx) {
    const at = stamp();
    const full = { ...row, version: 1, created_at: at, updated_at: at, created_by_name: ctx.actorName, updated_by_name: ctx.actorName };
    list.push(full);
    return full;
  }

  // Changes a row. Only a change to a content column raises the version and updates
  // "last changed"; a position-only change (reorder) leaves them exactly as they were.
  function updateRow(row, changes, contentColumns, ctx) {
    const contentChanged = contentColumns.some((col) => col in changes && changes[col] !== row[col]);
    Object.assign(row, changes);
    if (contentChanged) {
      row.version += 1;
      row.updated_at = stamp();
      row.updated_by_name = ctx.actorName;
    }
  }

  const classesOf = (db, code) => db.classes.filter((c) => c.location_code === code).sort(byPosition);
  const ranksOf = (db, classId) => db.ranks.filter((r) => r.class_id === classId).sort(byPosition);
  const nextPosition = (rows) => (rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.position)) + 1);

  // Removes the given ranks. Classes whose final award was one of them get "Not set"
  // (the database's ON DELETE SET NULL) — a content change, so their version goes up.
  // Returns those classes as [{ id, name }] in belt order.
  function removeRanks(db, rankIds, ctx) {
    const gone = new Set(rankIds);
    const lost = db.classes
      .filter((c) => c.final_award_rank_id !== null && gone.has(c.final_award_rank_id))
      .sort((a, b) => (a.location_code === b.location_code ? a.position - b.position : a.location_code < b.location_code ? -1 : 1));
    for (const c of lost) updateRow(c, { final_award_rank_id: null }, CLASS_CONTENT, ctx);
    db.ranks = db.ranks.filter((r) => !gone.has(r.id));
    return lost.map((c) => ({ id: c.id, name: c.name }));
  }

  // Rewrites positions 0, 1, 2 … in the given order (position-only: no version change).
  function renumber(rows, ctx, contentColumns) {
    rows.forEach((row, index) => {
      if (row.position !== index) updateRow(row, { position: index }, contentColumns, ctx);
    });
  }

  // Shared argument checks for the two reorder functions.
  function badReorderArrays(expected, next) {
    if (expected === null || next === null) return true;
    if (hasNull(expected) || hasNull(next)) return true;
    if (hasDuplicates(expected) || hasDuplicates(next)) return true;
    if (expected.length !== next.length) return true;
    const expectedSet = new Set(expected);
    return !next.every((id) => expectedSet.has(id)); // not a permutation
  }

  // ----- The 8 functions (contract §2). Each returns the jsonb answer. -----
  // Check order everywhere: no_access → not_allowed → invalid (argument shape) → not_found →
  // stale / not_empty → invalid (relations) → duplicate_name → write.

  const handlers = {
    testing_add_class(db, a, ctx) {
      if (a.p_location_code === null || !LOCATION_CODES.includes(a.p_location_code)) return st('invalid');
      if (!nameIsValid(a.p_name) || finalAwardArgsBad(a)) return st('invalid');
      const name = normalizeName(a.p_name);
      if (a.p_final_award_rank_id !== null) {
        const award = db.ranks.find((r) => r.id === a.p_final_award_rank_id);
        if (!award) return st('stale'); // it was deleted meanwhile
        if (award.location_code !== a.p_location_code) return st('invalid');
      }
      const school = classesOf(db, a.p_location_code);
      if (school.some((c) => nameKey(c.name) === nameKey(name))) return st('duplicate_name');
      const row = insertRow(db.classes, {
        id: newId(), location_code: a.p_location_code, name, position: nextPosition(school),
        final_award_rank_id: a.p_final_award_rank_id, final_award_none: a.p_final_award_none,
      }, ctx);
      return { status: 'ok', id: row.id, version: row.version, position: row.position, final_award_none: row.final_award_none };
    },

    testing_update_class(db, a, ctx) {
      if (a.p_class_id === null || a.p_expected_version === null || !nameIsValid(a.p_name)) return st('invalid');
      if (finalAwardArgsBad(a)) return st('invalid');
      const cls = db.classes.find((c) => c.id === a.p_class_id);
      if (!cls) return st('not_found');
      if (cls.version !== a.p_expected_version) return st('stale');
      if (a.p_final_award_rank_id !== null) {
        const award = db.ranks.find((r) => r.id === a.p_final_award_rank_id);
        if (!award) return st('stale');
        if (award.location_code !== cls.location_code) return st('invalid');
        if (award.class_id === cls.id) return st('invalid'); // can't be one of its own ranks
      }
      const name = normalizeName(a.p_name);
      const others = classesOf(db, cls.location_code).filter((c) => c.id !== cls.id);
      if (others.some((c) => nameKey(c.name) === nameKey(name))) return st('duplicate_name');
      updateRow(cls, { name, final_award_rank_id: a.p_final_award_rank_id, final_award_none: a.p_final_award_none }, CLASS_CONTENT, ctx);
      return { status: 'ok', id: cls.id, version: cls.version, final_award_none: cls.final_award_none };
    },

    testing_reorder_classes(db, a, ctx) {
      if (a.p_location_code === null || !LOCATION_CODES.includes(a.p_location_code)) return st('invalid');
      if (badReorderArrays(a.p_expected_ids, a.p_new_ids)) return st('invalid');
      const school = classesOf(db, a.p_location_code);
      if (!sameOrdered(school.map((c) => c.id), a.p_expected_ids)) return st('stale');
      const byId = new Map(school.map((c) => [c.id, c]));
      renumber(a.p_new_ids.map((id) => byId.get(id)), ctx, CLASS_CONTENT);
      return { status: 'ok' };
    },

    testing_delete_class(db, a, ctx) {
      if (a.p_class_id === null || a.p_expected_version === null || a.p_only_if_empty === null) return st('invalid');
      const lists = [a.p_expected_rank_ids, a.p_expected_lost_award_class_ids];
      if (lists.some((list) => list === null || hasNull(list) || hasDuplicates(list))) return st('invalid');
      const cls = db.classes.find((c) => c.id === a.p_class_id);
      if (!cls) return st('not_found');
      if (cls.version !== a.p_expected_version) return st('stale');
      const rankIds = ranksOf(db, cls.id).map((r) => r.id);
      if (a.p_only_if_empty && rankIds.length > 0) return st('not_empty');
      if (!sameSet(rankIds, a.p_expected_rank_ids)) return st('stale');
      const rankSet = new Set(rankIds);
      const losing = db.classes.filter((c) => c.id !== cls.id && c.final_award_rank_id !== null && rankSet.has(c.final_award_rank_id));
      if (!sameSet(losing.map((c) => c.id), a.p_expected_lost_award_class_ids)) return st('stale');

      db.classes = db.classes.filter((c) => c.id !== cls.id);
      const lost = removeRanks(db, rankIds, ctx); // the ranks go with their class
      renumber(classesOf(db, cls.location_code), ctx, CLASS_CONTENT); // close the gap
      return { status: 'ok', removed_rank_count: rankIds.length, classes_lost_award: lost };
    },

    testing_add_rank(db, a, ctx) {
      if (a.p_class_id === null || !nameIsValid(a.p_name)) return st('invalid');
      if (![a.p_early_cents, a.p_day_cents, a.p_private_cents].every(priceIsValid)) return st('invalid');
      if (a.p_sparring_gear === null) return st('invalid');
      if (validateBelt(beltFromArgs(a)) !== null) return st('invalid'); // v0.64 belt rules
      const cls = db.classes.find((c) => c.id === a.p_class_id);
      if (!cls) return st('not_found');
      const name = normalizeName(a.p_name);
      const ranks = ranksOf(db, cls.id);
      if (ranks.some((r) => nameKey(r.name) === nameKey(name))) return st('duplicate_name');
      const row = insertRow(db.ranks, {
        id: newId(), class_id: cls.id, location_code: cls.location_code, name, position: nextPosition(ranks),
        early_cents: a.p_early_cents, day_cents: a.p_day_cents, private_cents: a.p_private_cents,
        sparring_gear: a.p_sparring_gear, ...beltColumns(a),
      }, ctx);
      return { status: 'ok', id: row.id, version: row.version, position: row.position };
    },

    testing_update_rank(db, a, ctx) {
      if (a.p_rank_id === null || a.p_expected_version === null || !nameIsValid(a.p_name)) return st('invalid');
      if (![a.p_early_cents, a.p_day_cents, a.p_private_cents].every(priceIsValid)) return st('invalid');
      if (a.p_sparring_gear === null) return st('invalid');
      if (validateBelt(beltFromArgs(a)) !== null) return st('invalid'); // v0.64 belt rules
      const rank = db.ranks.find((r) => r.id === a.p_rank_id);
      if (!rank) return st('not_found');
      if (rank.version !== a.p_expected_version) return st('stale');
      const name = normalizeName(a.p_name);
      const others = ranksOf(db, rank.class_id).filter((r) => r.id !== rank.id);
      if (others.some((r) => nameKey(r.name) === nameKey(name))) return st('duplicate_name');
      updateRow(rank, {
        name, early_cents: a.p_early_cents, day_cents: a.p_day_cents, private_cents: a.p_private_cents,
        sparring_gear: a.p_sparring_gear, ...beltColumns(a),
      }, RANK_CONTENT, ctx);
      return { status: 'ok', id: rank.id, version: rank.version };
    },

    testing_reorder_ranks(db, a, ctx) {
      if (a.p_class_id === null || badReorderArrays(a.p_expected_ids, a.p_new_ids)) return st('invalid');
      const cls = db.classes.find((c) => c.id === a.p_class_id);
      if (!cls) return st('not_found');
      const ranks = ranksOf(db, cls.id);
      if (!sameOrdered(ranks.map((r) => r.id), a.p_expected_ids)) return st('stale');
      const byId = new Map(ranks.map((r) => [r.id, r]));
      renumber(a.p_new_ids.map((id) => byId.get(id)), ctx, RANK_CONTENT);
      return { status: 'ok' };
    },

    testing_delete_rank(db, a, ctx) {
      const scalars = [a.p_rank_id, a.p_expected_version, a.p_expected_class_version];
      const lists = [a.p_expected_rank_ids, a.p_expected_lost_award_class_ids];
      if (scalars.some((x) => x === null) || lists.some((list) => list === null)) return st('invalid');
      if (lists.some((list) => hasNull(list) || hasDuplicates(list))) return st('invalid');
      if (!a.p_expected_rank_ids.includes(a.p_rank_id)) return st('invalid');
      const rank = db.ranks.find((r) => r.id === a.p_rank_id);
      if (!rank) return st('not_found');
      const cls = db.classes.find((c) => c.id === rank.class_id);
      if (!cls) return st('not_found');
      if (rank.version !== a.p_expected_version) return st('stale');
      if (cls.version !== a.p_expected_class_version) return st('stale');
      if (!sameOrdered(ranksOf(db, cls.id).map((r) => r.id), a.p_expected_rank_ids)) return st('stale');
      const losing = db.classes.filter((c) => c.final_award_rank_id === rank.id).map((c) => c.id);
      if (!sameSet(losing, a.p_expected_lost_award_class_ids)) return st('stale');

      const lost = removeRanks(db, [rank.id], ctx);
      const remaining = ranksOf(db, cls.id);
      renumber(remaining, ctx, RANK_CONTENT); // close the gap
      const last = remaining[remaining.length - 1] ?? null;
      return { status: 'ok', classes_lost_award: lost, class_final_award_now_on: last ? last.id : null };
    },
  };

  // ----- Answers in the Supabase client's shape -----

  const ok = (data) => ({ data, error: null, count: null, status: 200, statusText: 'OK' });
  const fail = (code, message, status = 403) => ({
    data: null,
    error: { code, message, details: null, hint: null },
    count: null,
    status,
    statusText: status === 404 ? 'Not Found' : status === 403 ? 'Forbidden' : 'Bad Request',
  });
  const denied = (what) => fail('42501', `permission denied for ${what}`, 403);

  // supabase.from(table).select(columns).eq(…).order(…)
  // filters: [{ col, value }]   orders: [{ col, ascending }]
  function select(table, columns, filters = [], orders = [], ctx = {}) {
    if (table === 'change_log') return denied('table change_log'); // nobody reads the history from the app
    if (!(table in GRANTED_COLUMNS)) {
      return fail('PGRST205', `Could not find the table 'public.${table}' in the schema cache`, 404);
    }
    if (!ctx.signedIn) return denied(`table ${table}`);
    const granted = GRANTED_COLUMNS[table];
    const existing = [...granted, ...HIDDEN_COLUMNS[table]];
    const wanted = String(columns ?? '*').split(',').map((col) => col.trim()).filter(Boolean);
    if (wanted.length === 0) wanted.push('*');
    // Every column used (selected, filtered, sorted) must be readable — like PostgreSQL.
    const used = [...wanted, ...filters.map((f) => f.col), ...orders.map((o) => o.col)];
    for (const col of used) {
      if (col === '*' || HIDDEN_COLUMNS[table].includes(col)) return denied(`table ${table}`);
      if (!existing.includes(col)) return fail('42703', `column ${table}.${col} does not exist`, 400);
    }
    if (!ctx.hasDataAccess) return ok([]); // row-level security hides every row

    const db = read();
    let rows = table === 'locations' ? LOCATION_ROWS : table === 'testing_classes' ? db.classes : db.ranks;
    // .eq() compares as text, like the real API (which receives the filter in the web address).
    rows = rows.filter((row) => filters.every((f) => String(row[f.col]) === String(f.value)));
    rows = [...rows].sort((x, y) => {
      for (const { col, ascending = true } of orders) {
        if (x[col] === y[col]) continue;
        const less = x[col] === null ? false : y[col] === null ? true : x[col] < y[col]; // nulls last
        return (less ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    return ok(rows.map((row) => Object.fromEntries(wanted.map((col) => [col, row[col]]))));
  }

  // supabase.rpc(name, args) for has_data_access and the 8 testing functions.
  function rpc(name, args = {}, ctx = {}) {
    if (name === 'has_data_access') {
      if (!ctx.signedIn) return denied('function has_data_access');
      return ok(Boolean(ctx.hasDataAccess));
    }
    if (!(name in handlers)) {
      return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
    }
    if (failNext) {
      // Pretend the connection dropped: nothing is changed (failNextSave helper).
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
    // Who may call: has_data_access FIRST, then admin (contract §2.1).
    if (!ctx.hasDataAccess) return ok(st('no_access'));
    if (!ctx.isAdmin) return ok(st('not_allowed'));
    const db = read(); // a private copy = a transaction: only an 'ok' is saved
    const answer = handlers[name](db, parsed, { actorName: ctx.actorName ?? 'Database admin' });
    if (answer.status === 'ok') write(db);
    return ok(answer);
  }

  // ----- Test helpers (used by the console helpers in mockClient.js and by checks.mjs) -----

  // The next testing_* function call fails like a dropped connection.
  function failNextSave() {
    failNext = true;
  }

  // Another admin "changes everything": every version goes up, and in each school the first
  // two ranks of the first class with at least 2 ranks swap places. Any open dialog,
  // confirmation or Undo is now out of date (the server will answer 'stale').
  function simulateOtherAdminEdit() {
    const db = read();
    const at = stamp();
    for (const row of [...db.classes, ...db.ranks]) {
      row.version += 1;
      row.updated_by_name = 'Other Admin';
      row.updated_at = at;
    }
    for (const code of LOCATION_CODES) {
      const target = classesOf(db, code).find((c) => ranksOf(db, c.id).length >= 2);
      if (!target) continue;
      const [first, second] = ranksOf(db, target.id);
      [first.position, second.position] = [second.position, first.position];
    }
    write(db);
  }

  // Removes every class and rank of one school ('Worcester'/'worcester' …). false if unknown.
  function clearSchool(school) {
    const code = String(school ?? '').trim().toLowerCase();
    if (!LOCATION_CODES.includes(code)) return false;
    const db = read();
    db.classes = db.classes.filter((c) => c.location_code !== code);
    db.ranks = db.ranks.filter((r) => r.location_code !== code);
    write(db);
    return true;
  }

  // Back to the default preview data.
  function reset() {
    write(defaultTestingData());
  }

  return { select, rpc, failNextSave, simulateOtherAdminEdit, clearSchool, reset, snapshot: read };
}
