// mockStarTesting.js — the PREVIEW (fake) database for Star testing → Rubrics and prices.
// Why it exists: preview mode (npm run dev:preview-mode) runs without Supabase. This file
// pretends to be the part of migration 0006 that build phase 1 uses — the four "template"
// tables (contract 0006 §2.1), their seed (§3) and the 7 admin functions (§6.1) — and follows
// the SAME rules: the same order of checks, the same answers ('ok', 'stale', 'duplicate_name' …),
// the same limits on credits, pass marks, fees, grade values and assistant minimums.
// That way what you see in preview is what the real dashboard will do.
//
// Like mockTesting.js it is a "pure core": it never touches the browser by itself. mockClient.js
// plugs it in and gives it a place to keep its data (localStorage, key STAR_STORE_KEY). The Node
// checks (star/rubricsChecks.mjs) plug in a plain in-memory store instead.
//
//   const star = createStarBackend({ loadStore, saveStore, now, newId });
//   star.select('star_categories', 'id, name', [{ col, value }], [{ col, ascending }], ctx)
//   star.rpc('star_add_category', { p_dan: 1, p_name: 'Forms', p_credits: 5 }, ctx)
//   ctx = { signedIn, hasDataAccess, isAdmin, actorName }  ← who is asking (mockClient's testingContext())
//
// ----- What the WIRING builder adds to mockClient.js (this file does not change it) -----
//   1. import { createStarBackend, STAR_RPC_NAMES, STAR_TABLES, STAR_STORE_KEY } from './mockStarTesting.js';
//   2. const star = createStarBackend({
//        loadStore: () => JSON.parse(readStorage(STAR_STORE_KEY)),   // missing/damaged → the seed
//        saveStore: (store) => writeStorage(STAR_STORE_KEY, JSON.stringify(store)),
//        now: () => Date.now(), newId: newUuid });
//   3. from(): `if (STAR_TABLES.includes(table)) return star.select(table, query.columns, query.filters, query.orders, testingContext());`
//   4. rpc():  `if (STAR_RPC_NAMES.includes(name)) { await wait(testingDelay()); …failNext… return star.rpc(name, args, testingContext()); }`
//      (has_data_access can stay with mockTesting.js — both answer it the same way.)
//   5. Console helpers:
//        setRole('staff'|'admin')  — nothing to do: ctx.isAdmin already follows it (staff → 'not_allowed')
//        setTestingDelay(ms)       — nothing to do: step 4 waits testingDelay() like the others
//        failNextSave()            — call star.failNextSave() too, or let it target Star, e.g.
//                                    failNextSave('star'): today's flag goes to whichever backend is
//                                    called first, so Star needs its own flag or its own target
//        simulateOtherAdminEdit()  — also call star.simulateOtherAdminEdit()
//        resetTesting()            — also call star.reset()
//
// The stored data looks like the real tables (snake_case columns, money in cents):
//   { schema: 1, dans: [{ id, dan, label, pass_mark, star_limit, standard_cents, same_day_cents,
//     private_cents, version, created_at, updated_at, created_by_name, updated_by_name }],
//     categories: [{ id, dan, name, credits, position, from_class_count, version, … }],
//     grades: [{ id, grade, position, value, version, … }],
//     assistant: { id, child_max_age, child_a_plus … child_c, adult_a_plus … adult_c, version, … } }
//
// Words used:
//   version — goes up by 1 each time the CONTENT of a row changes. A position-only change
//             (a reorder, or the shift after a delete) never changes it. A screen sends the version
//             it saw; if the row has moved on since, the answer is 'stale'.
//   Saving the SAME values writes nothing and keeps the version (still 'ok'), like the database.
//   stamp   — "last changed at / by" (updated_at, updated_by_name). The seed rows say "Database
//             admin" at a fixed time; every write that changes content sets them to the caller's
//             name and now. Like the database trigger, a position-only change (reorder, the shift
//             after a delete) and an unchanged save leave the stamp alone.
import { normalizeName, nameProblem, nameKey } from './testing/names.js';
import { isValidCents } from './money.js';

// The localStorage key mockClient.js should use for this store (its own, apart from Color Belt's).
export const STAR_STORE_KEY = 'tkd.preview.star';
// Raised whenever the stored shape changes, so data saved by an older build is replaced by the seed.
export const STAR_STORE_SCHEMA = 1;

// ----- Limits (the same numbers as migration 0006) -----
const PASS_MARK_MAX = 9999.9; // pass mark: more than 0, up to 9999.9, one decimal at most
const STAR_LIMIT_MIN = 1; // "Highest star": 1–20
const STAR_LIMIT_MAX = 20;
const CREDITS_MIN = 1; // a subject's credits: 1–100
const CREDITS_MAX = 100;
const GRADE_VALUE_MAX = 9.9; // a grade value: 0–9.9, one decimal at most
const CHILD_AGE_MIN = 1; // "12 and under": the age can be 1–30
const CHILD_AGE_MAX = 30;
const MINIMUM_MIN = 1; // an assistant-class minimum: 1–999
const MINIMUM_MAX = 999;
const GRADE_LETTERS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D']; // fixed, in this order (position 1–7)
// The assistant table's columns for A+ … C (D = below the C minimum, not stored).
const MIN_SUFFIXES = ['a_plus', 'a', 'b_plus', 'b', 'c_plus', 'c'];

// ----- The seed (contract 0006 §3, exactly the values in the migration) -----
// Each Dan: [dan, label, pass mark, highest star, standard $, same day $, private $]
const SEED_DANS = [
  [1, '1st Dan', 245, 4, 140, 150, 160],
  [2, '2nd Dan', 245, 3, 150, 160, 170],
  [3, '3rd Dan', 245, 5, 160, 170, 180],
];
// Each Dan's subjects in order: [name, credits, worked out from the class count?]
// The dash in "White–Deputy" is an en dash (U+2013), as in the migration.
const AI = 'Assistant Instructor';
const SEED_CATEGORIES = {
  1: [
    ['White–Deputy Curriculum', 15], ['Go-Ryo Poomse', 10], ['Advanced Motion', 5], ['Advance Sa-Bang Chuck', 5],
    ['Step Sa-Bang Chuck', 5], ['Two Step Sparring', 5], ['Breaking', 5], ['Appreciation Letters', 5],
    [AI, 5, true], ['Knowledge', 5], ['Korean Terminology', 5],
  ],
  2: [
    ['White–Deputy Curriculum', 10], ['Geum-Kang Poomse', 5], ['Instructor Sa-Bang-Chuk', 5], ['Go-Ryo Poomse', 5],
    ['Advanced Motion', 5], ['Advance Sa-Bang Chuck', 5], ['Step Sa-Bang Chuck', 5], ['Two Step Sparring', 5],
    ['Breaking', 5], ['Appreciation Letters', 5], [AI, 5, true], ['Knowledge', 5], ['Korean Terminology', 5],
  ],
  3: [
    ['White–Deputy Curriculum', 20], ['1st & 2nd Dan Curriculum', 10], ['Tae Baek Poomsae', 5],
    ['3rd Dan Sa-Bang Chuck', 5], ['Creative Poomsae', 5], ['Breaking', 5], ['Appreciation Letters', 5],
    [AI, 5, true], ['Knowledge', 5], ['Korean Terminology', 5],
  ],
};
const SEED_GRADE_VALUES = [4.5, 4.0, 3.5, 3.0, 2.5, 2.0, 0.0]; // A+ … D
const SEED_CHILD_MAX_AGE = 12;
const SEED_CHILD_MINS = [15, 14, 13, 12, 11, 10]; // 12 and under: A+ … C
const SEED_ADULT_MINS = [20, 18, 16, 14, 12, 10]; // 13 and up: A+ … C

const DEFAULT_STAMP = '2026-10-18T16:00:00Z'; // shows as "Oct 18, 12:00 PM" in Eastern time
const SEED_ACTOR = 'Database admin'; // the seed is written by the SQL Editor (contract §3)

// Fixed, valid uuids for the seed rows, so "Reset" always brings back the same ids.
// e.g. 1st Dan's 3rd subject → 000002c0-0000-4000-8000-000000000102
const pad12 = (n) => String(n).padStart(12, '0');
const fixedId = (kind, n) => `000002${kind}-0000-4000-8000-${pad12(n)}`;

// A fresh copy of the seed data.
export function defaultStarData() {
  const stamps = { version: 1, created_at: DEFAULT_STAMP, updated_at: DEFAULT_STAMP, created_by_name: SEED_ACTOR, updated_by_name: SEED_ACTOR };
  const dans = SEED_DANS.map(([dan, label, passMark, starLimit, standard, sameDay, priv]) => ({
    id: fixedId('d0', dan), dan, label, pass_mark: passMark, star_limit: starLimit,
    standard_cents: standard * 100, same_day_cents: sameDay * 100, private_cents: priv * 100, ...stamps,
  }));
  const categories = [];
  for (const [dan] of SEED_DANS) {
    SEED_CATEGORIES[dan].forEach(([name, credits, fromClassCount = false], position) => {
      categories.push({
        id: fixedId('c0', dan * 100 + position), dan, name, credits, position, from_class_count: fromClassCount, ...stamps,
      });
    });
  }
  const grades = GRADE_LETTERS.map((grade, i) => ({
    id: fixedId('a0', i + 1), grade, position: i + 1, value: SEED_GRADE_VALUES[i], ...stamps,
  }));
  const assistant = { id: fixedId('b0', 1), child_max_age: SEED_CHILD_MAX_AGE, ...stamps };
  MIN_SUFFIXES.forEach((suffix, i) => {
    assistant[`child_${suffix}`] = SEED_CHILD_MINS[i];
    assistant[`adult_${suffix}`] = SEED_ADULT_MINS[i];
  });
  return { schema: STAR_STORE_SCHEMA, dans, categories, grades, assistant };
}

// ----- Table permissions (the same as contract 0006 §4.1 / §4.2) -----

const HOUSE = ['version', 'created_at', 'updated_at', 'created_by_name', 'updated_by_name'];
// Keeping Star's fake database OUT of the live build: mockClient.js imports this file, but the live
// site never creates the fake client, so nothing here is used there. The build tool still keeps any
// top-level line it can't prove is harmless (a .map() call, a [...spread]). Those lines are wrapped
// in /*#__PURE__*/ (() => …)() — "this has no side effects" — so the live build drops them.
const ASSISTANT_MIN_COLUMNS = /*#__PURE__*/ (() => [...MIN_SUFFIXES.map((s) => `child_${s}`), ...MIN_SUFFIXES.map((s) => `adult_${s}`)])();
// Columns the app may read. Anything else — including '*' — is "permission denied".
const GRANTED = /*#__PURE__*/ (() => ({
  star_dan_settings: ['id', 'dan', 'label', 'pass_mark', 'star_limit', 'standard_cents', 'same_day_cents', 'private_cents', ...HOUSE],
  star_categories: ['id', 'dan', 'name', 'credits', 'position', 'from_class_count', ...HOUSE],
  star_grade_values: ['id', 'grade', 'position', 'value', ...HOUSE],
  star_assistant_table: ['id', 'child_max_age', ...ASSISTANT_MIN_COLUMNS, ...HOUSE],
}))();
// Columns that exist but are never granted (login ids, and the assistant table's "singleton").
const HIDDEN = {
  star_dan_settings: ['created_by', 'updated_by'],
  star_categories: ['created_by', 'updated_by'],
  star_grade_values: ['created_by', 'updated_by'],
  star_assistant_table: ['singleton', 'created_by', 'updated_by'],
};
// /*#__PURE__*/: see ASSISTANT_MIN_COLUMNS above.
export const STAR_TABLES = /*#__PURE__*/ Object.keys(GRANTED);

// "Content" columns: changing one of these raises the version. (position is left out on
// purpose: the database's trigger lists it as "no bump" for subjects.)
const DAN_CONTENT = ['pass_mark', 'star_limit', 'standard_cents', 'same_day_cents', 'private_cents'];
const CATEGORY_CONTENT = ['name', 'credits'];
const GRADE_CONTENT = ['value'];
const ASSISTANT_CONTENT = /*#__PURE__*/ (() => ['child_max_age', ...ASSISTANT_MIN_COLUMNS])();

// ----- The 7 functions' argument lists (name, type) — the same names as migration 0006 -----
// The real API (PostgREST) finds a function by its argument NAMES: a missing argument or an
// extra one means "no such function". None of them has a default (contract §1.1).
const RPC_ARGS = {
  star_update_dan_settings: [
    ['p_dan', 'int'], ['p_expected_version', 'int'], ['p_pass_mark', 'numeric'], ['p_star_limit', 'int'],
    ['p_standard_cents', 'int'], ['p_same_day_cents', 'int'], ['p_private_cents', 'int'],
  ],
  star_add_category: [['p_dan', 'int'], ['p_name', 'text'], ['p_credits', 'int']],
  star_update_category: [['p_category_id', 'uuid'], ['p_expected_version', 'int'], ['p_name', 'text'], ['p_credits', 'int']],
  star_reorder_categories: [['p_dan', 'int'], ['p_expected_ids', 'uuid[]'], ['p_new_ids', 'uuid[]']],
  star_delete_category: [['p_category_id', 'uuid'], ['p_expected_version', 'int']],
  star_update_grade_values: [['p_expected_versions', 'int[]'], ['p_values', 'numeric[]']],
  star_update_assistant_table: [
    ['p_expected_version', 'int'], ['p_child_max_age', 'int'], ['p_child_mins', 'int[]'], ['p_adult_mins', 'int[]'],
  ],
};
export const STAR_RPC_NAMES = /*#__PURE__*/ Object.keys(RPC_ARGS);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_MAX = 2147483647; // the largest PostgreSQL "integer"
const NUMERIC_TEXT = /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/; // what PostgreSQL accepts as a plain number

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
    case 'numeric': {
      // A JSON number, or text that reads as one. Kept as a JS number; the "one decimal at most"
      // rule is checked on its written form (see oneDecimalAtMost).
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && NUMERIC_TEXT.test(value)) return Number(value);
      throw new DbError('22P02', `invalid input syntax for type numeric: "${value}"`);
    }
    case 'uuid[]':
    case 'int[]':
    case 'numeric[]':
      if (!Array.isArray(value)) throw new DbError('22P02', `malformed array literal: "${value}"`);
      return value.map((item) => toDbType(item, type.slice(0, -2)));
    default:
      throw new Error(`unknown type ${type}`);
  }
}

// Matches the call's argument names to the function and converts every value.
function readArgs(name, args) {
  const spec = RPC_ARGS[name];
  // JSON drops keys whose value is undefined, so treat them as "not sent".
  const sent = Object.keys(args ?? {}).filter((key) => args[key] !== undefined);
  const known = new Set(spec.map(([key]) => key));
  if (spec.some(([key]) => !sent.includes(key)) || sent.some((key) => !known.has(key))) {
    throw new DbError('PGRST202', `Could not find the function public.${name}(${[...sent].sort().join(', ')}) in the schema cache`, 404);
  }
  return Object.fromEntries(spec.map(([key, type]) => [key, toDbType(args[key], type)]));
}

// ----- Small helpers -----

const clone = (value) => JSON.parse(JSON.stringify(value));
const st = (status) => ({ status }); // a non-ok answer: just the status
const byPosition = (a, b) => a.position - b.position;
const sameOrdered = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const hasNull = (list) => list.some((x) => x === null);
const hasDuplicates = (list) => new Set(list).size !== list.length;
const isNull = (x) => x === null;
const nameIsValid = (name) => name !== null && nameProblem(name) === null;
const between = (n, low, high) => n !== null && n >= low && n <= high;
// "At most one decimal", judged on how the number is written (245, 245.5 — not 245.55 or 1e-7),
// the same as PostgreSQL's  x = round(x, 1)  on the exact number it received.
const oneDecimalAtMost = (n) => /^-?\d+(\.\d)?$/.test(String(n));
// Every value strictly smaller than the one before it (A+ > A > B+ …).
const strictlyDown = (list) => list.every((x, i) => i === 0 || list[i - 1] > x);

// Is the store we loaded usable? (Missing or damaged → start again from the seed.)
function isUsableStore(store) {
  if (!store || store.schema !== STAR_STORE_SCHEMA) return false;
  if (!Array.isArray(store.dans) || !Array.isArray(store.categories) || !Array.isArray(store.grades)) return false;
  const a = store.assistant;
  const danOk = (d) => d && typeof d.id === 'string' && Number.isInteger(d.dan) && typeof d.label === 'string'
    && typeof d.pass_mark === 'number' && Number.isInteger(d.star_limit) && Number.isInteger(d.version)
    && [d.standard_cents, d.same_day_cents, d.private_cents].every(isValidCents);
  const categoryOk = (c) => c && typeof c.id === 'string' && store.dans.some((d) => d.dan === c.dan)
    && typeof c.name === 'string' && Number.isInteger(c.credits) && Number.isInteger(c.position)
    && typeof c.from_class_count === 'boolean' && Number.isInteger(c.version);
  const gradeOk = (g, i) => g && typeof g.id === 'string' && g.grade === GRADE_LETTERS[i] && g.position === i + 1
    && typeof g.value === 'number' && Number.isInteger(g.version);
  const assistantOk = a && typeof a.id === 'string' && Number.isInteger(a.child_max_age) && Number.isInteger(a.version)
    && ASSISTANT_MIN_COLUMNS.every((col) => Number.isInteger(a[col]));
  return store.dans.every(danOk) && store.categories.every(categoryOk)
    && store.grades.length === 7 && [...store.grades].sort(byPosition).every(gradeOk) && Boolean(assistantOk);
}

// ----- The backend -----

export function createStarBackend({ loadStore, saveStore, now = () => Date.now(), newId }) {
  let failNext = false; // set by failNextSave()

  // The current data (always a private copy: changes only count once saved).
  function read() {
    let store = null;
    try {
      store = loadStore?.() ?? null;
    } catch {
      store = null;
    }
    return isUsableStore(store) ? clone(store) : defaultStarData();
  }

  function write(db) {
    saveStore?.(db);
  }

  const stamp = () => new Date(now()).toISOString();

  // ----- What the before-write trigger does (contract §1.8, star_before_write) -----

  function insertRow(list, row, ctx) {
    const at = stamp();
    const full = { ...row, version: 1, created_at: at, updated_at: at, created_by_name: ctx.actorName, updated_by_name: ctx.actorName };
    list.push(full);
    return full;
  }

  // Changes a row. Only a change to a content column raises the version and updates
  // "last changed"; a position-only change leaves them exactly as they were.
  function updateRow(row, changes, contentColumns, ctx) {
    const contentChanged = contentColumns.some((col) => col in changes && changes[col] !== row[col]);
    Object.assign(row, changes);
    if (contentChanged) {
      row.version += 1;
      row.updated_at = stamp();
      row.updated_by_name = ctx.actorName;
    }
  }

  const danRow = (db, dan) => db.dans.find((d) => d.dan === dan) ?? null;
  const categoriesOf = (db, dan) => db.categories.filter((c) => c.dan === dan).sort(byPosition);

  // ----- The 7 functions (contract §6.1). Each returns the jsonb answer. -----
  // Already checked by rpc() before these run: no_access → not_allowed (all 7 are admin-only).
  // Then, as in the SQL: invalid (argument shape) → not_found → stale → data rules → duplicate_name → write.

  const handlers = {
    star_update_dan_settings(db, a, ctx) {
      const required = [a.p_dan, a.p_expected_version, a.p_pass_mark, a.p_star_limit];
      if (required.some(isNull)) return st('invalid');
      if (a.p_pass_mark <= 0 || a.p_pass_mark > PASS_MARK_MAX || !oneDecimalAtMost(a.p_pass_mark)) return st('invalid');
      if (!between(a.p_star_limit, STAR_LIMIT_MIN, STAR_LIMIT_MAX)) return st('invalid');
      // Fees: whole dollars $0–$1,000 in cents (testing_cents_is_valid; null fails too).
      if (![a.p_standard_cents, a.p_same_day_cents, a.p_private_cents].every((c) => c !== null && isValidCents(c))) return st('invalid');
      const d = danRow(db, a.p_dan);
      if (!d) return st('not_found');
      if (d.version !== a.p_expected_version) return st('stale');
      updateRow(d, {
        pass_mark: a.p_pass_mark, star_limit: a.p_star_limit, standard_cents: a.p_standard_cents,
        same_day_cents: a.p_same_day_cents, private_cents: a.p_private_cents,
      }, DAN_CONTENT, ctx);
      return { status: 'ok', version: d.version };
    },

    star_add_category(db, a, ctx) {
      if (a.p_dan === null || !nameIsValid(a.p_name) || !between(a.p_credits, CREDITS_MIN, CREDITS_MAX)) return st('invalid');
      const name = normalizeName(a.p_name);
      if (!danRow(db, a.p_dan)) return st('not_found');
      const list = categoriesOf(db, a.p_dan);
      if (list.some((c) => nameKey(c.name) === nameKey(name))) return st('duplicate_name');
      const position = list.length === 0 ? 0 : Math.max(...list.map((c) => c.position)) + 1;
      // New subjects are always judged (from_class_count false).
      const row = insertRow(db.categories, { id: newId(), dan: a.p_dan, name, credits: a.p_credits, position, from_class_count: false }, ctx);
      return { status: 'ok', id: row.id, version: row.version, position: row.position };
    },

    star_update_category(db, a, ctx) {
      if (a.p_category_id === null || a.p_expected_version === null || !nameIsValid(a.p_name)
        || !between(a.p_credits, CREDITS_MIN, CREDITS_MAX)) return st('invalid');
      const name = normalizeName(a.p_name);
      const k = db.categories.find((c) => c.id === a.p_category_id);
      if (!k) return st('not_found');
      if (k.version !== a.p_expected_version) return st('stale');
      const others = categoriesOf(db, k.dan).filter((c) => c.id !== k.id);
      if (others.some((c) => nameKey(c.name) === nameKey(name))) return st('duplicate_name');
      // Assistant Instructor may be renamed and re-credited; its Dan and from_class_count never change.
      updateRow(k, { name, credits: a.p_credits }, CATEGORY_CONTENT, ctx);
      return { status: 'ok', id: k.id, version: k.version };
    },

    // Exactly 0003's reorder with the Dan instead of the school: p_expected_ids = the order the
    // screen showed (else stale), p_new_ids = the same ids in the new order (else invalid).
    // An unknown Dan is 'invalid' here (not 'not_found'), as in the SQL.
    star_reorder_categories(db, a, ctx) {
      const expected = a.p_expected_ids;
      const next = a.p_new_ids;
      if (a.p_dan === null || !danRow(db, a.p_dan)) return st('invalid');
      if (expected === null || next === null || hasNull(expected) || hasNull(next)) return st('invalid');
      if (hasDuplicates(expected) || hasDuplicates(next) || expected.length !== next.length) return st('invalid');
      const expectedSet = new Set(expected);
      if (!next.every((id) => expectedSet.has(id))) return st('invalid'); // not the same ids
      const list = categoriesOf(db, a.p_dan);
      if (!sameOrdered(list.map((c) => c.id), expected)) return st('stale');
      const byId = new Map(list.map((c) => [c.id, c]));
      next.forEach((id, index) => updateRow(byId.get(id), { position: index }, CATEGORY_CONTENT, ctx)); // no version change
      return { status: 'ok' };
    },

    star_delete_category(db, a, ctx) {
      if (a.p_category_id === null || a.p_expected_version === null) return st('invalid');
      const k = db.categories.find((c) => c.id === a.p_category_id);
      if (!k) return st('not_found');
      if (k.version !== a.p_expected_version) return st('stale');
      if (k.from_class_count) return st('invalid'); // Assistant Instructor can't be deleted (v0.61)
      db.categories = db.categories.filter((c) => c.id !== k.id);
      // Later subjects move up by one (position only: their versions stay the same).
      for (const c of categoriesOf(db, k.dan)) {
        if (c.position > k.position) updateRow(c, { position: c.position - 1 }, CATEGORY_CONTENT, ctx);
      }
      return { status: 'ok' };
    },

    // The 7 values in the order A+, A, B+, B, C+, C, D: each 0–9.9 with one decimal at most,
    // STRICTLY going down (D may be more than 0). The versions are the 7 rows' versions as shown.
    star_update_grade_values(db, a, ctx) {
      const versions = a.p_expected_versions;
      const values = a.p_values;
      if (versions === null || values === null || versions.length !== 7 || values.length !== 7) return st('invalid');
      if (hasNull(versions)) return st('invalid');
      if (values.some((v) => v === null || v < 0 || v > GRADE_VALUE_MAX || !oneDecimalAtMost(v))) return st('invalid');
      if (!strictlyDown(values)) return st('invalid');
      const rows = [...db.grades].sort(byPosition);
      if (rows.length !== 7) return st('not_found');
      if (!sameOrdered(rows.map((g) => g.version), versions)) return st('stale');
      rows.forEach((g, i) => updateRow(g, { value: values[i] }, GRADE_CONTENT, ctx)); // only changed rows bump
      return { status: 'ok', versions: rows.map((g) => g.version) };
    },

    // The age split ("12 and under") and the minimum assistant classes for A+ … C per age group
    // (6 numbers each, 1–999, STRICTLY going down).
    star_update_assistant_table(db, a, ctx) {
      const child = a.p_child_mins;
      const adult = a.p_adult_mins;
      if (a.p_expected_version === null || !between(a.p_child_max_age, CHILD_AGE_MIN, CHILD_AGE_MAX)) return st('invalid');
      if (child === null || adult === null || child.length !== 6 || adult.length !== 6) return st('invalid');
      if ([...child, ...adult].some((n) => !between(n, MINIMUM_MIN, MINIMUM_MAX))) return st('invalid');
      if (!strictlyDown(child) || !strictlyDown(adult)) return st('invalid');
      const row = db.assistant;
      if (!row) return st('not_found');
      if (row.version !== a.p_expected_version) return st('stale');
      const changes = { child_max_age: a.p_child_max_age };
      MIN_SUFFIXES.forEach((suffix, i) => {
        changes[`child_${suffix}`] = child[i];
        changes[`adult_${suffix}`] = adult[i];
      });
      updateRow(row, changes, ASSISTANT_CONTENT, ctx);
      return { status: 'ok', version: row.version };
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

  // The stored rows of one table (the assistant table is one row).
  function rowsOf(db, table) {
    if (table === 'star_dan_settings') return db.dans;
    if (table === 'star_categories') return db.categories;
    if (table === 'star_grade_values') return db.grades;
    return db.assistant ? [db.assistant] : [];
  }

  // supabase.from(table).select(columns).eq(…).order(…)
  // filters: [{ col, value }]   orders: [{ col, ascending }]
  function select(table, columns, filters = [], orders = [], ctx = {}) {
    if (!(table in GRANTED)) return fail('PGRST205', `Could not find the table 'public.${table}' in the schema cache`, 404);
    if (!ctx.signedIn) return denied(`table ${table}`);
    const existing = [...GRANTED[table], ...HIDDEN[table]];
    const wanted = String(columns ?? '*').split(',').map((col) => col.trim()).filter(Boolean);
    if (wanted.length === 0) wanted.push('*');
    // Every column used (selected, filtered, sorted) must be readable — like PostgreSQL.
    const used = [...wanted, ...filters.map((f) => f.col), ...orders.map((o) => o.col)];
    for (const col of used) {
      if (col === '*' || HIDDEN[table].includes(col)) return denied(`table ${table}`);
      if (!existing.includes(col)) return fail('42703', `column ${table}.${col} does not exist`, 400);
    }
    if (!ctx.hasDataAccess) return ok([]); // row-level security hides every row
    let rows = rowsOf(read(), table);
    // Filters compare as text, like the real API (the filter travels in the web address).
    rows = rows.filter((row) => filters.every((f) => (f.op === 'in'
      ? (f.value ?? []).map(String).includes(String(row[f.col]))
      : String(row[f.col]) === String(f.value))));
    rows = [...rows].sort((x, y) => {
      for (const { col, ascending = true } of orders) {
        if (x[col] === y[col]) continue;
        const less = x[col] === null ? false : y[col] === null ? true : x[col] < y[col]; // nulls last
        return (less ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    return ok(rows.map((row) => Object.fromEntries(wanted.map((col) => [col, row[col] ?? null]))));
  }

  // supabase.rpc(name, args) for has_data_access and the 7 Star functions.
  function rpc(name, args = {}, ctx = {}) {
    if (name === 'has_data_access') {
      if (!ctx.signedIn) return denied('function has_data_access');
      return ok(Boolean(ctx.hasDataAccess));
    }
    if (!(name in handlers)) return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
    if (failNext) {
      failNext = false; // pretend the connection dropped: nothing changes (failNextSave helper)
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
    // has_data_access FIRST, then admin: all 7 are admin-only (contract §6.1 "A").
    if (!ctx.hasDataAccess) return ok(st('no_access'));
    if (!ctx.isAdmin) return ok(st('not_allowed'));
    const db = read(); // a private copy = a transaction: only an 'ok' is saved
    // Who the "Last changed by" line names: the signed-in person (testingContext's name), or a
    // plain role word if the caller gave none. (All 7 are admin-only, so that is 'Admin'.)
    const actorName = ctx.actorName || (ctx.isAdmin ? 'Admin' : 'Staff');
    const answer = handlers[name](db, parsed, { actorName });
    if (answer.status === 'ok') write(db);
    return ok(answer);
  }

  // ----- Test helpers (console helpers in mockClient.js, and star/rubricsChecks.mjs) -----

  // The next Star function call fails like a dropped connection (nothing changes).
  function failNextSave() {
    failNext = true;
  }

  // "Another admin" changes everything: every version goes up, and the first two subjects of
  // the 1st Dan swap places. Any open dialog, confirmation or Undo is now out of date ('stale').
  function simulateOtherAdminEdit() {
    const db = read();
    const at = stamp();
    for (const row of [...db.dans, ...db.categories, ...db.grades, db.assistant]) {
      row.version += 1;
      row.updated_by_name = 'Other Admin';
      row.updated_at = at;
    }
    const [first, second] = categoriesOf(db, 1);
    if (first && second) [first.position, second.position] = [second.position, first.position];
    write(db);
  }

  // Back to the seed data.
  function reset() {
    write(defaultStarData());
  }

  return { select, rpc, failNextSave, simulateOtherAdminEdit, reset, snapshot: read };
}
