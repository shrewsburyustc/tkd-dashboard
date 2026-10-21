// rubricsChecks.mjs — automatic checks for the Star testing "Rubrics and prices" data layer.
// Run:  node src/lib/star/rubricsChecks.mjs      (prints ALL STAR RUBRIC CHECKS PASSED, exits 0)
// Why it exists: the preview database (mockStarTesting.js) must refuse exactly what migration
// 0006 refuses, and the API layer (rubricsCore.js, which rubricsApi.js uses) must send the right
// argument names and turn every answer into the right camelCase object. These plain `assert`
// checks run in milliseconds, without a browser or a database. They go THROUGH the API layer,
// using a small fake client that hands each call to the preview database — the same path the
// screens take in preview mode.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStarBackend, defaultStarData, STAR_RPC_NAMES, STAR_TABLES, STAR_STORE_KEY } from '../mockStarTesting.js';
import { createRubricsApi, RUBRIC_STATUSES } from './rubricsCore.js';

let count = 0;
async function check(label, fn) {
  try {
    await fn();
    count += 1;
  } catch (error) {
    console.error(`FAILED: ${label}`);
    throw error;
  }
}

// ----- A test rig: in-memory store + fake client + the API on top -----
// ctx is who is asking; change its fields to sign in as staff, lock the session, etc.
function makeRig() {
  let store = null;
  const ctx = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Test Admin' };
  const backend = createStarBackend({
    loadStore: () => (store === null ? null : JSON.parse(store)),
    saveStore: (s) => {
      store = JSON.stringify(s);
    },
    now: () => Date.parse('2026-10-18T17:00:00Z'),
    newId: randomUUID,
  });
  // The small part of the Supabase client rubricsCore.js uses: from().select().order() and rpc().
  const client = {
    from(table) {
      const q = { columns: '*', filters: [], orders: [] };
      const builder = {
        select(columns) { q.columns = columns; return builder; },
        eq(col, value) { q.filters.push({ col, value }); return builder; },
        order(col, { ascending = true } = {}) { q.orders.push({ col, ascending }); return builder; },
        then(resolve, reject) {
          return Promise.resolve().then(() => backend.select(table, q.columns, q.filters, q.orders, ctx)).then(resolve, reject);
        },
      };
      return builder;
    },
    async rpc(name, args) {
      // JSON drops undefined values on the way to the server; do the same here.
      return backend.rpc(name, JSON.parse(JSON.stringify(args ?? {})), ctx);
    },
  };
  const api = createRubricsApi(() => client);
  return { api, backend, ctx, client };
}

const statusOf = (r) => r.status;

// ======================= exports and the seed =======================

await check('exports', () => {
  assert.equal(STAR_STORE_KEY, 'tkd.preview.star');
  assert.deepEqual(STAR_TABLES, ['star_dan_settings', 'star_categories', 'star_grade_values', 'star_assistant_table']);
  assert.deepEqual(STAR_RPC_NAMES, [
    'star_update_dan_settings', 'star_add_category', 'star_update_category', 'star_reorder_categories',
    'star_delete_category', 'star_update_grade_values', 'star_update_assistant_table',
  ]);
  assert.deepEqual(RUBRIC_STATUSES, ['ok', 'no_access', 'not_allowed', 'invalid', 'not_found', 'stale', 'duplicate_name', 'error']);
});

await check('seed: matches migration 0006 §13m', async () => {
  const { api } = makeRig();
  const r = await api.loadRubrics();
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.dans.map((d) => [d.dan, d.label, d.passMark, d.starLimit, d.standardCents, d.sameDayCents, d.privateCents, d.version]), [
    [1, '1st Dan', 245, 4, 14000, 15000, 16000, 1],
    [2, '2nd Dan', 245, 3, 15000, 16000, 17000, 1],
    [3, '3rd Dan', 245, 5, 16000, 17000, 18000, 1],
  ]);
  assert.deepEqual(r.dans.map((d) => d.categories.length), [11, 13, 10]);
  for (const d of r.dans) {
    assert.equal(d.categories.reduce((sum, c) => sum + c.credits, 0), 70, `${d.label} totals 70`);
    assert.deepEqual(d.categories.map((c) => c.position), d.categories.map((_, i) => i));
    const ai = d.categories.filter((c) => c.fromClassCount);
    assert.equal(ai.length, 1);
    assert.equal(ai[0].name, 'Assistant Instructor');
  }
  assert.equal(r.dans[0].categories[0].name, 'White–Deputy Curriculum'); // en dash
  assert.equal(r.dans[0].categories[8].name, 'Assistant Instructor');
  assert.equal(r.dans[1].categories[10].name, 'Assistant Instructor');
  assert.equal(r.dans[2].categories[7].name, 'Assistant Instructor');
  assert.equal(r.dans[2].categories[1].name, '1st & 2nd Dan Curriculum');
  assert.deepEqual(r.grades.map((g) => [g.grade, g.position, g.value]), [
    ['A+', 1, 4.5], ['A', 2, 4], ['B+', 3, 3.5], ['B', 4, 3], ['C+', 5, 2.5], ['C', 6, 2], ['D', 7, 0],
  ]);
  assert.equal(r.assistant.childMaxAge, 12);
  assert.deepEqual(r.assistant.childMins, [15, 14, 13, 12, 11, 10]);
  assert.deepEqual(r.assistant.adultMins, [20, 18, 16, 14, 12, 10]);
  assert.equal(r.assistant.version, 1);
  // The exact shape the screens code against (camelCase, nothing else).
  assert.deepEqual(Object.keys(r).sort(), ['assistant', 'dans', 'grades', 'status']);
  assert.deepEqual(Object.keys(r.dans[0]).sort(),
    ['categories', 'dan', 'label', 'passMark', 'privateCents', 'sameDayCents', 'standardCents', 'starLimit', 'updatedAt', 'updatedByName', 'version']);
  assert.deepEqual(Object.keys(r.dans[0].categories[0]).sort(),
    ['credits', 'fromClassCount', 'id', 'name', 'position', 'updatedAt', 'updatedByName', 'version']);
  assert.deepEqual(Object.keys(r.grades[0]).sort(), ['grade', 'id', 'position', 'updatedAt', 'updatedByName', 'value', 'version']);
  assert.deepEqual(Object.keys(r.assistant).sort(),
    ['adultMins', 'childMaxAge', 'childMins', 'id', 'updatedAt', 'updatedByName', 'version']);
  // defaultStarData is a fresh copy each time
  const a = defaultStarData();
  a.dans[0].label = 'x';
  assert.equal(defaultStarData().dans[0].label, '1st Dan');
});

// ======================= reading: permissions =======================

await check('read: locked session → no_access; not signed in → error', async () => {
  const { api, ctx } = makeRig();
  ctx.hasDataAccess = false;
  assert.deepEqual(await api.loadRubrics(), { status: 'no_access' });
  ctx.signedIn = false;
  assert.equal((await api.loadRubrics()).status, 'error');
});

await check('read: staff can read', async () => {
  const { api, ctx } = makeRig();
  ctx.isAdmin = false;
  assert.equal((await api.loadRubrics()).status, 'ok');
});

await check('read: select(*) and hidden columns are refused; unknown table/column errors', async () => {
  const { backend, ctx } = makeRig();
  for (const table of STAR_TABLES) {
    assert.equal(backend.select(table, '*', [], [], ctx).error.code, '42501');
    assert.equal(backend.select(table, 'id, created_by', [], [], ctx).error.code, '42501');
    assert.equal(backend.select(table, 'id, updated_by', [], [], ctx).error.code, '42501');
  }
  assert.equal(backend.select('star_assistant_table', 'singleton', [], [], ctx).error.code, '42501');
  assert.equal(backend.select('star_dan_settings', 'id', [], [{ col: 'created_by', ascending: true }], ctx).error.code, '42501');
  assert.equal(backend.select('star_categories', 'nope', [], [], ctx).error.code, '42703');
  assert.equal(backend.select('star_events', 'id', [], [], ctx).error.code, 'PGRST205');
  // granted columns work, including the house columns
  const res = backend.select('star_dan_settings', 'id, dan, updated_by_name, created_at', [{ col: 'dan', value: 2 }], [], ctx);
  assert.equal(res.error, null);
  assert.deepEqual(res.data.map((r) => r.dan), [2]);
  assert.equal(res.data[0].updated_by_name, 'Database admin');
});

await check('read: the API never selects * (every read names its columns)', async () => {
  const { api, client } = makeRig();
  const seen = [];
  const realFrom = client.from;
  client.from = (table) => {
    const b = realFrom(table);
    const realSelect = b.select;
    b.select = (cols) => {
      seen.push([table, cols]);
      return realSelect(cols);
    };
    return b;
  };
  assert.equal((await api.loadRubrics()).status, 'ok');
  assert.equal(seen.length, 4);
  for (const [, cols] of seen) {
    assert.ok(cols && !cols.includes('*'));
    assert.ok(cols.includes('updated_at') && cols.includes('updated_by_name')); // the "Last changed by" line
    const names = cols.split(',').map((c) => c.trim());
    assert.ok(!names.includes('created_by') && !names.includes('updated_by')); // never a login id
  }
});

await check('read: a broken answer → error, never a throw', async () => {
  const api = createRubricsApi(() => null);
  assert.equal((await api.loadRubrics()).status, 'error');
  assert.equal((await api.addCategory(1, 'X', 5)).status, 'error');
  const throwing = createRubricsApi(() => ({ from() { throw new Error('boom'); }, rpc() { throw new Error('boom'); } }));
  assert.equal((await throwing.loadRubrics()).status, 'error');
  assert.equal((await throwing.deleteCategory(randomUUID(), 1)).status, 'error');
  // the server says something unknown → error
  const odd = createRubricsApi(() => ({ rpc: async () => ({ data: { status: 'not_empty' }, error: null }) }));
  assert.equal((await odd.deleteCategory(randomUUID(), 1)).status, 'error');
  // ok but the wrong shape → error
  const bad = createRubricsApi(() => ({ rpc: async () => ({ data: { status: 'ok', version: 'x' }, error: null }) }));
  assert.equal((await bad.updateAssistantTable(1, 12, [6, 5, 4, 3, 2, 1], [6, 5, 4, 3, 2, 1])).status, 'error');
});

// ======================= every write: who may call =======================

// One valid call per function (values that would be accepted), so the refusals below are
// about WHO is asking, not WHAT is sent.
async function everyCall(api) {
  const r = await api.loadRubrics();
  const dan1 = r.dans[0];
  const knowledge = dan1.categories.find((c) => c.name === 'Knowledge');
  const ids = dan1.categories.map((c) => c.id);
  return [
    () => api.updateDanSettings(1, dan1.version, { passMark: 250, starLimit: 4, standardCents: 14000, sameDayCents: 15000, privateCents: 16000 }),
    () => api.addCategory(1, 'Sparring', 5),
    () => api.updateCategory(knowledge.id, knowledge.version, 'Knowledge Test', 6),
    () => api.reorderCategories(1, ids, [...ids].reverse()),
    () => api.deleteCategory(knowledge.id, knowledge.version),
    () => api.updateGradeValues(r.grades.map((g) => g.version), [5, 4, 3.5, 3, 2.5, 2, 0]),
    () => api.updateAssistantTable(r.assistant.version, 12, [16, 14, 13, 12, 11, 10], [20, 18, 16, 14, 12, 10]),
  ];
}

await check('writes: staff get not_allowed on all 7, and nothing changes', async () => {
  const { api, ctx, backend } = makeRig();
  const calls = await everyCall(api);
  const before = JSON.stringify(backend.snapshot());
  ctx.isAdmin = false;
  for (const call of calls) assert.deepEqual(await call(), { status: 'not_allowed' });
  assert.equal(JSON.stringify(backend.snapshot()), before);
});

await check('writes: a locked session gets no_access (before the role check)', async () => {
  const { api, ctx } = makeRig();
  const calls = await everyCall(api);
  ctx.hasDataAccess = false;
  ctx.isAdmin = false;
  for (const call of calls) assert.deepEqual(await call(), { status: 'no_access' });
});

await check('writes: not signed in → error (permission denied)', async () => {
  const { api, ctx } = makeRig();
  const calls = await everyCall(api);
  ctx.signedIn = false;
  for (const call of calls) assert.equal((await call()).status, 'error');
});

await check('writes: failNextSave fails exactly one call and changes nothing', async () => {
  const { api, backend } = makeRig();
  const before = JSON.stringify(backend.snapshot());
  backend.failNextSave();
  assert.equal((await api.addCategory(1, 'Sparring', 5)).status, 'error');
  assert.equal(JSON.stringify(backend.snapshot()), before);
  assert.equal((await api.addCategory(1, 'Sparring', 5)).status, 'ok');
});

await check('writes: wrong argument names → error (no such function)', () => {
  const { backend, ctx } = makeRig();
  assert.equal(backend.rpc('star_add_category', { p_dan: 1, p_name: 'X' }, ctx).error.code, 'PGRST202');
  assert.equal(backend.rpc('star_add_category', { p_dan: 1, p_name: 'X', p_credits: 5, p_extra: 1 }, ctx).error.code, 'PGRST202');
  assert.equal(backend.rpc('star_add_category', { p_dan: 1.5, p_name: 'X', p_credits: 5 }, ctx).error.code, '22P02');
  assert.equal(backend.rpc('star_nope', {}, ctx).error.code, 'PGRST202');
});

// ======================= star_update_dan_settings =======================

await check('dan settings: ok, version bump, same values write nothing', async () => {
  const { api, backend } = makeRig();
  const fees = { passMark: 250.5, starLimit: 6, standardCents: 14500, sameDayCents: 15500, privateCents: 16500 };
  const r = await api.updateDanSettings(1, 1, fees);
  assert.deepEqual(r, { status: 'ok', version: 2 });
  const d = backend.snapshot().dans.find((x) => x.dan === 1);
  assert.deepEqual([d.pass_mark, d.star_limit, d.standard_cents, d.same_day_cents, d.private_cents], [250.5, 6, 14500, 15500, 16500]);
  assert.equal(d.updated_by_name, 'Test Admin');
  // same again: still ok, version stays 2
  assert.deepEqual(await api.updateDanSettings(1, 2, fees), { status: 'ok', version: 2 });
  // whole numbers given as text are sent as integers
  assert.deepEqual(await api.updateDanSettings('1', '2', { ...fees, starLimit: '7' }), { status: 'ok', version: 3 });
  const loaded = await api.loadRubrics();
  assert.equal(loaded.dans[0].passMark, 250.5);
  assert.equal(loaded.dans[0].starLimit, 7);
});

await check('dan settings: invalid values', async () => {
  const { api } = makeRig();
  const good = { passMark: 245, starLimit: 4, standardCents: 14000, sameDayCents: 15000, privateCents: 16000 };
  const bad = [
    { passMark: 0 }, { passMark: -1 }, { passMark: 10000 }, { passMark: 9999.95 }, { passMark: 245.55 }, { passMark: null },
    { starLimit: 0 }, { starLimit: 21 }, { starLimit: null }, { starLimit: 4.5 },
    { standardCents: 14050 }, { standardCents: -100 }, { standardCents: 100100 }, { sameDayCents: null }, { privateCents: 12.5 },
    { passMark: 'abc' },
  ];
  for (const change of bad) assert.equal((await api.updateDanSettings(1, 1, { ...good, ...change })).status, 'invalid', JSON.stringify(change));
  assert.equal((await api.updateDanSettings(null, 1, good)).status, 'invalid');
  assert.equal((await api.updateDanSettings(1, null, good)).status, 'invalid');
  assert.equal((await api.updateDanSettings(1, 1)).status, 'invalid'); // nothing given
  // the limits themselves are fine
  assert.equal((await api.updateDanSettings(1, 1, { ...good, passMark: 9999.9, starLimit: 20, standardCents: 0, privateCents: 100000 })).status, 'ok');
  assert.equal((await api.updateDanSettings(1, 2, { ...good, passMark: 0.1, starLimit: 1 })).status, 'ok');
});

await check('dan settings: not_found and stale', async () => {
  const { api } = makeRig();
  const good = { passMark: 245, starLimit: 4, standardCents: 14000, sameDayCents: 15000, privateCents: 20000 };
  assert.equal((await api.updateDanSettings(4, 1, good)).status, 'not_found');
  assert.equal((await api.updateDanSettings(1, 9, good)).status, 'stale');
  // the Fees dialog and the Dan dialog share one version: the second save goes stale
  assert.equal((await api.updateDanSettings(1, 1, good)).status, 'ok');
  assert.equal((await api.updateDanSettings(1, 1, { ...good, passMark: 250 })).status, 'stale');
});

// ======================= star_add_category =======================

await check('add category: ok at the end, judged, normalized name', async () => {
  const { api, backend } = makeRig();
  const r = await api.addCategory(3, '  Free   Sparring ', 7);
  assert.equal(r.status, 'ok');
  assert.equal(r.version, 1);
  assert.equal(r.position, 10);
  assert.ok(typeof r.id === 'string');
  assert.deepEqual(Object.keys(r).sort(), ['id', 'position', 'status', 'version']);
  const row = backend.snapshot().categories.find((c) => c.id === r.id);
  assert.equal(row.name, 'Free Sparring');
  assert.equal(row.from_class_count, false);
  assert.equal(row.created_by_name, 'Test Admin');
});

await check('add category: invalid, not_found, duplicate_name (case-insensitive, trimmed)', async () => {
  const { api } = makeRig();
  for (const credits of [0, 101, null, 2.5, 'x']) assert.equal((await api.addCategory(1, 'New', credits)).status, 'invalid', String(credits));
  for (const name of ['', '   ', null, 'x'.repeat(61), 'Bad​Name']) assert.equal((await api.addCategory(1, name, 5)).status, 'invalid');
  assert.equal((await api.addCategory(null, 'New', 5)).status, 'invalid');
  assert.equal((await api.addCategory(4, 'New', 5)).status, 'not_found');
  assert.equal((await api.addCategory(1, '  breaking ', 5)).status, 'duplicate_name');
  assert.equal((await api.addCategory(1, 'ASSISTANT   INSTRUCTOR', 5)).status, 'duplicate_name');
  // the same name in ANOTHER Dan is fine (names differ inside one Dan only)
  assert.equal((await api.addCategory(3, 'Go-Ryo Poomse', 5)).status, 'ok');
  // limits are fine
  assert.equal((await api.addCategory(1, 'x'.repeat(60), 100)).status, 'ok');
  assert.equal((await api.addCategory(1, 'One', 1)).status, 'ok');
});

// ======================= star_update_category =======================

await check('update category: ok, version bump, same values write nothing, AI can be renamed', async () => {
  const { api } = makeRig();
  const r = await api.loadRubrics();
  const k = r.dans[0].categories[1]; // Go-Ryo Poomse
  assert.deepEqual(await api.updateCategory(k.id, 1, 'Go-Ryo Poomsae', 12), { status: 'ok', id: k.id, version: 2 });
  assert.deepEqual(await api.updateCategory(k.id, 2, 'Go-Ryo Poomsae', 12), { status: 'ok', id: k.id, version: 2 });
  // renaming to its own name in another case is not a duplicate
  assert.deepEqual(await api.updateCategory(k.id, 2, 'GO-RYO POOMSAE', 12), { status: 'ok', id: k.id, version: 3 });
  const ai = r.dans[0].categories.find((c) => c.fromClassCount);
  assert.equal((await api.updateCategory(ai.id, 1, 'Assistant Instructing', 8)).status, 'ok');
  const after = await api.loadRubrics();
  const aiAfter = after.dans[0].categories.find((c) => c.id === ai.id);
  assert.equal(aiAfter.fromClassCount, true); // still worked out from classes
  assert.equal(aiAfter.credits, 8);
});

await check('update category: invalid, not_found, stale, duplicate_name', async () => {
  const { api } = makeRig();
  const r = await api.loadRubrics();
  const k = r.dans[0].categories[1];
  assert.equal((await api.updateCategory(k.id, 1, 'X', 0)).status, 'invalid');
  assert.equal((await api.updateCategory(k.id, 1, '', 5)).status, 'invalid');
  assert.equal((await api.updateCategory(null, 1, 'X', 5)).status, 'invalid');
  assert.equal((await api.updateCategory(k.id, null, 'X', 5)).status, 'invalid');
  assert.equal((await api.updateCategory(randomUUID(), 1, 'X', 5)).status, 'not_found');
  assert.equal((await api.updateCategory(k.id, 5, 'X', 5)).status, 'stale');
  assert.equal((await api.updateCategory(k.id, 1, ' knowledge', 5)).status, 'duplicate_name');
  // stale is checked before the duplicate name (SQL order: 5 before 7)
  assert.equal((await api.updateCategory(k.id, 5, 'Knowledge', 5)).status, 'stale');
  // a name used in another Dan only is fine
  assert.equal((await api.updateCategory(k.id, 1, 'Tae Baek Poomsae', 5)).status, 'ok');
});

// ======================= star_reorder_categories =======================

await check('reorder: ok, positions follow, versions unchanged', async () => {
  const { api } = makeRig();
  const r = await api.loadRubrics();
  const ids = r.dans[1].categories.map((c) => c.id);
  const next = [ids[1], ids[0], ...ids.slice(2)];
  assert.deepEqual(await api.reorderCategories(2, ids, next), { status: 'ok' });
  const after = await api.loadRubrics();
  assert.deepEqual(after.dans[1].categories.map((c) => c.id), next);
  assert.deepEqual(after.dans[1].categories.map((c) => c.position), next.map((_, i) => i));
  assert.ok(after.dans[1].categories.every((c) => c.version === 1));
  // other Dans untouched
  assert.deepEqual(after.dans[0].categories.map((c) => c.id), r.dans[0].categories.map((c) => c.id));
});

await check('reorder: invalid and stale', async () => {
  const { api } = makeRig();
  const r = await api.loadRubrics();
  const ids = r.dans[0].categories.map((c) => c.id);
  const rev = [...ids].reverse();
  assert.equal((await api.reorderCategories(4, ids, rev)).status, 'invalid'); // unknown Dan: invalid, as in SQL
  assert.equal((await api.reorderCategories(null, ids, rev)).status, 'invalid');
  assert.equal((await api.reorderCategories(1, null, rev)).status, 'invalid');
  assert.equal((await api.reorderCategories(1, ids, ids.slice(1))).status, 'invalid'); // different length
  assert.equal((await api.reorderCategories(1, ids, [...ids.slice(1), randomUUID()])).status, 'invalid'); // not the same ids
  assert.equal((await api.reorderCategories(1, ids, [ids[0], ...ids.slice(0, -1)])).status, 'invalid'); // an id twice
  assert.equal((await api.reorderCategories(1, rev, ids)).status, 'stale'); // the screen showed another order
  assert.equal((await api.reorderCategories(1, ids.slice(1), rev.slice(0, -1))).status, 'stale'); // missed one
  assert.equal((await api.reorderCategories(1, [], [])).status, 'stale');
});

// ======================= star_delete_category =======================

await check('delete category: ok, later subjects move up, versions unchanged', async () => {
  const { api } = makeRig();
  const r = await api.loadRubrics();
  const k = r.dans[0].categories[2]; // Advanced Motion
  assert.deepEqual(await api.deleteCategory(k.id, 1), { status: 'ok' });
  const after = await api.loadRubrics();
  assert.equal(after.dans[0].categories.length, 10);
  assert.ok(!after.dans[0].categories.some((c) => c.id === k.id));
  assert.deepEqual(after.dans[0].categories.map((c) => c.position), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(after.dans[0].categories.every((c) => c.version === 1));
  // Undo of Add = delete: add then delete brings the list back
  const added = await api.addCategory(1, 'Temp', 5);
  assert.equal((await api.deleteCategory(added.id, added.version)).status, 'ok');
  assert.equal((await api.loadRubrics()).dans[0].categories.length, 10);
  // the next add goes at the end again
  assert.equal((await api.addCategory(1, 'Again', 5)).position, 10);
});

await check('delete category: Assistant Instructor refused (invalid); not_found; stale; invalid', async () => {
  const { api } = makeRig();
  const r = await api.loadRubrics();
  for (const d of r.dans) {
    const ai = d.categories.find((c) => c.fromClassCount);
    assert.deepEqual(await api.deleteCategory(ai.id, ai.version), { status: 'invalid' });
  }
  const k = r.dans[0].categories[0];
  assert.equal((await api.deleteCategory(k.id, 2)).status, 'stale');
  assert.equal((await api.deleteCategory(randomUUID(), 1)).status, 'not_found');
  assert.equal((await api.deleteCategory(null, 1)).status, 'invalid');
  assert.equal((await api.deleteCategory(k.id, null)).status, 'invalid');
  // stale wins over the AI rule (SQL order: 5 before 6)
  const ai = r.dans[0].categories.find((c) => c.fromClassCount);
  assert.equal((await api.deleteCategory(ai.id, 9)).status, 'stale');
  // the AI is still there everywhere
  assert.ok((await api.loadRubrics()).dans.every((d) => d.categories.filter((c) => c.fromClassCount).length === 1));
});

// ======================= star_update_grade_values =======================

await check('grade values: ok, only changed rows bump, D may be above 0', async () => {
  const { api } = makeRig();
  const r = await api.loadRubrics();
  const v = r.grades.map((g) => g.version);
  const res = await api.updateGradeValues(v, [5, 4, 3.5, 3, 2.5, 2, 0.5]);
  assert.deepEqual(res, { status: 'ok', versions: [2, 1, 1, 1, 1, 1, 2] });
  assert.deepEqual(await api.updateGradeValues(res.versions, [5, 4, 3.5, 3, 2.5, 2, 0.5]), { status: 'ok', versions: [2, 1, 1, 1, 1, 1, 2] });
  const after = await api.loadRubrics();
  assert.deepEqual(after.grades.map((g) => g.value), [5, 4, 3.5, 3, 2.5, 2, 0.5]);
  // the limits are fine
  assert.equal((await api.updateGradeValues(res.versions, [9.9, 9.8, 5, 4, 3, 0.1, 0])).status, 'ok');
});

await check('grade values: must go strictly down; shape and limits; stale', async () => {
  const { api } = makeRig();
  const v = (await api.loadRubrics()).grades.map((g) => g.version);
  const bad = [
    [4.5, 4.5, 3.5, 3, 2.5, 2, 0], // equal neighbours
    [4.5, 4, 4.5, 3, 2.5, 2, 0], // goes up
    [0, 0.5, 1, 1.5, 2, 2.5, 3], // upside down
    [10, 4, 3.5, 3, 2.5, 2, 0], // above 9.9
    [4.5, 4, 3.5, 3, 2.5, 2, -1], // below 0
    [4.55, 4, 3.5, 3, 2.5, 2, 0], // two decimals
    [4.5, 4, 3.5, 3, 2.5, 2], // 6 values
    [4.5, 4, 3.5, 3, 2.5, 2, 1, 0], // 8 values
    [4.5, 4, 3.5, null, 2.5, 2, 0], // a gap
    [4.5, 4, 3.5, 'x', 2.5, 2, 0], // not a number
  ];
  for (const values of bad) assert.equal((await api.updateGradeValues(v, values)).status, 'invalid', JSON.stringify(values));
  assert.equal((await api.updateGradeValues(null, [4.5, 4, 3.5, 3, 2.5, 2, 0])).status, 'invalid');
  assert.equal((await api.updateGradeValues(v.slice(1), [4.5, 4, 3.5, 3, 2.5, 2, 0])).status, 'invalid');
  assert.equal((await api.updateGradeValues([1, 1, 1, null, 1, 1, 1], [4.5, 4, 3.5, 3, 2.5, 2, 0])).status, 'invalid');
  assert.equal((await api.updateGradeValues([1, 1, 1, 2, 1, 1, 1], [5, 4, 3.5, 3, 2.5, 2, 0])).status, 'stale');
});

// ======================= star_update_assistant_table =======================

await check('assistant table: ok, version bump, same values write nothing', async () => {
  const { api, backend } = makeRig();
  const child = [16, 14, 13, 12, 11, 10];
  const adult = [21, 18, 16, 14, 12, 10];
  assert.deepEqual(await api.updateAssistantTable(1, 13, child, adult), { status: 'ok', version: 2 });
  assert.deepEqual(await api.updateAssistantTable(2, 13, child, adult), { status: 'ok', version: 2 });
  const row = backend.snapshot().assistant;
  assert.deepEqual([row.child_max_age, row.child_a_plus, row.adult_a_plus, row.adult_c], [13, 16, 21, 10]);
  const after = await api.loadRubrics();
  assert.deepEqual(after.assistant.childMins, child);
  assert.deepEqual(after.assistant.adultMins, adult);
  // the limits are fine
  assert.equal((await api.updateAssistantTable(2, 30, [999, 5, 4, 3, 2, 1], [6, 5, 4, 3, 2, 1])).status, 'ok');
  assert.equal((await api.updateAssistantTable(3, 1, [6, 5, 4, 3, 2, 1], [6, 5, 4, 3, 2, 1])).status, 'ok');
});

await check('assistant table: minimums must go strictly down in each column; limits; stale', async () => {
  const { api } = makeRig();
  const child = [15, 14, 13, 12, 11, 10];
  const adult = [20, 18, 16, 14, 12, 10];
  const badColumns = [
    [15, 15, 13, 12, 11, 10], // equal neighbours
    [15, 14, 16, 12, 11, 10], // goes up
    [10, 11, 12, 13, 14, 15], // upside down
    [15, 14, 13, 12, 11, 0], // below 1
    [1000, 14, 13, 12, 11, 10], // above 999
    [15, 14, 13, 12, 11], // 5 numbers
    [15, 14, 13, 12, 11, 10, 9], // 7 numbers
    [15, 14, null, 12, 11, 10], // a gap
    [15, 14, 13.5, 12, 11, 10], // not whole
  ];
  for (const col of badColumns) {
    assert.equal((await api.updateAssistantTable(1, 12, col, adult)).status, 'invalid', `child ${JSON.stringify(col)}`);
    assert.equal((await api.updateAssistantTable(1, 12, child, col)).status, 'invalid', `adult ${JSON.stringify(col)}`);
  }
  for (const age of [0, 31, null, 12.5]) assert.equal((await api.updateAssistantTable(1, age, child, adult)).status, 'invalid', String(age));
  assert.equal((await api.updateAssistantTable(null, 12, child, adult)).status, 'invalid');
  assert.equal((await api.updateAssistantTable(1, 12, null, adult)).status, 'invalid');
  assert.equal((await api.updateAssistantTable(4, 12, child, adult)).status, 'stale');
});

// ======================= "Last changed by": updatedAt / updatedByName =======================

await check('last changed: the seed says Database admin at a fixed time; each save updates it', async () => {
  // Its own rig with a clock we can move, so "now" is provably the time of each save.
  let clock = Date.parse('2026-10-18T17:00:00Z');
  let store = null;
  const ctx = { signedIn: true, hasDataAccess: true, isAdmin: true, actorName: 'Jeffrey Berg' };
  const backend = createStarBackend({
    loadStore: () => (store === null ? null : JSON.parse(store)),
    saveStore: (s) => { store = JSON.stringify(s); },
    now: () => clock,
    newId: randomUUID,
  });
  const client = {
    from: (table) => {
      const q = { columns: '*', orders: [] };
      const b = {
        select(c) { q.columns = c; return b; },
        order(col, { ascending = true } = {}) { q.orders.push({ col, ascending }); return b; },
        then: (res, rej) => Promise.resolve(backend.select(table, q.columns, [], q.orders, ctx)).then(res, rej),
      };
      return b;
    },
    rpc: async (name, args) => backend.rpc(name, JSON.parse(JSON.stringify(args ?? {})), ctx),
  };
  const api = createRubricsApi(() => client);
  const at = (iso) => {
    clock = Date.parse(iso);
    return new Date(clock).toISOString();
  };

  // 1. Every seed row: "Database admin" at the same fixed time.
  const r = await api.loadRubrics();
  const all = (x) => [...x.dans, ...x.dans.flatMap((d) => d.categories), ...x.grades, x.assistant];
  for (const row of all(r)) {
    assert.equal(row.updatedByName, 'Database admin');
    assert.equal(Date.parse(row.updatedAt), Date.parse('2026-10-18T16:00:00Z'), row.updatedAt);
  }

  // 2. Each kind of save stamps the row it changed with the caller and "now".
  const t1 = at('2026-10-19T14:00:00Z');
  assert.equal((await api.updateDanSettings(2, 1, { passMark: 250, starLimit: 3, standardCents: 15000, sameDayCents: 16000, privateCents: 17000 })).status, 'ok');
  const k = r.dans[0].categories[1];
  const t2 = at('2026-10-19T14:05:00Z');
  assert.equal((await api.updateCategory(k.id, k.version, 'Go-Ryo Poomsae', 10)).status, 'ok');
  const t3 = at('2026-10-19T14:10:00Z');
  const added = await api.addCategory(3, 'Free Sparring', 5);
  const t4 = at('2026-10-19T14:15:00Z');
  assert.equal((await api.updateGradeValues(r.grades.map((g) => g.version), [5, 4, 3.5, 3, 2.5, 2, 0])).status, 'ok');
  ctx.actorName = 'Other Admin';
  const t5 = at('2026-10-19T14:20:00Z');
  assert.equal((await api.updateAssistantTable(1, 13, [15, 14, 13, 12, 11, 10], [20, 18, 16, 14, 12, 10])).status, 'ok');

  const after = await api.loadRubrics();
  assert.deepEqual([after.dans[1].updatedByName, after.dans[1].updatedAt], ['Jeffrey Berg', t1]);
  const kAfter = after.dans[0].categories.find((c) => c.id === k.id);
  assert.deepEqual([kAfter.updatedByName, kAfter.updatedAt], ['Jeffrey Berg', t2]);
  const addedAfter = after.dans[2].categories.find((c) => c.id === added.id);
  assert.deepEqual([addedAfter.updatedByName, addedAfter.updatedAt], ['Jeffrey Berg', t3]);
  assert.deepEqual([after.grades[0].updatedByName, after.grades[0].updatedAt], ['Jeffrey Berg', t4]); // A+ 4.5 → 5
  assert.deepEqual([after.assistant.updatedByName, after.assistant.updatedAt], ['Other Admin', t5]);
  // Rows that were not changed keep the seed stamp (only A+ changed in the grade scale).
  assert.equal(after.grades[1].updatedByName, 'Database admin');
  assert.equal(after.dans[0].updatedByName, 'Database admin');

  // 3. Like the database trigger: an unchanged save and a reorder leave the stamp alone.
  at('2026-10-19T15:00:00Z');
  assert.equal((await api.updateDanSettings(2, 2, { passMark: 250, starLimit: 3, standardCents: 15000, sameDayCents: 16000, privateCents: 17000 })).status, 'ok');
  const ids = after.dans[0].categories.map((c) => c.id);
  assert.equal((await api.reorderCategories(1, ids, [...ids].reverse())).status, 'ok');
  const later = await api.loadRubrics();
  assert.deepEqual([later.dans[1].updatedByName, later.dans[1].updatedAt], ['Jeffrey Berg', t1]);
  assert.ok(later.dans[0].categories.filter((c) => c.id !== k.id).every((c) => c.updatedByName === 'Database admin'));

  // 4. No name from the caller → the role word ('Admin': all 7 functions are admin-only).
  delete ctx.actorName;
  const t6 = at('2026-10-19T16:00:00Z');
  assert.equal((await api.updateDanSettings(3, 1, { passMark: 260, starLimit: 5, standardCents: 16000, sameDayCents: 17000, privateCents: 18000 })).status, 'ok');
  const last = await api.loadRubrics();
  assert.deepEqual([last.dans[2].updatedByName, last.dans[2].updatedAt], ['Admin', t6]);
});

// ======================= helpers: simulateOtherAdminEdit, reset, the store =======================

await check('simulateOtherAdminEdit: every open dialog and the order go stale', async () => {
  const { api, backend } = makeRig();
  const r = await api.loadRubrics();
  const calls = await everyCall(api);
  backend.simulateOtherAdminEdit();
  const [danSettings, , updateCat, reorder, del, grades, assistant] = calls;
  for (const call of [danSettings, updateCat, reorder, del, grades, assistant]) assert.equal((await call()).status, 'stale');
  const after = await api.loadRubrics();
  assert.equal(after.dans[0].categories[0].id, r.dans[0].categories[1].id); // first two swapped
  assert.equal(after.dans[0].version, 2);
  assert.equal(after.assistant.version, 2);
});

await check('reset brings the seed back; a damaged store is replaced by the seed', async () => {
  const { api, backend } = makeRig();
  await api.addCategory(1, 'Extra', 5);
  await api.updateDanSettings(2, 1, { passMark: 300, starLimit: 3, standardCents: 15000, sameDayCents: 16000, privateCents: 17000 });
  backend.reset();
  assert.deepEqual(backend.snapshot(), defaultStarData());
  const damaged = createStarBackend({ loadStore: () => ({ schema: 1, dans: 'nope' }), saveStore: () => {}, newId: randomUUID });
  assert.deepEqual(damaged.snapshot(), defaultStarData());
  const throws = createStarBackend({ loadStore: () => { throw new Error('bad JSON'); }, saveStore: () => {}, newId: randomUUID });
  assert.deepEqual(throws.snapshot(), defaultStarData());
});

await check('only an ok answer is saved (a refusal leaves the store as it was)', async () => {
  const { api, backend } = makeRig();
  await api.addCategory(1, 'Extra', 5);
  const before = JSON.stringify(backend.snapshot());
  assert.equal((await api.addCategory(1, 'extra', 5)).status, 'duplicate_name');
  assert.equal((await api.updateGradeValues([1, 1, 1, 1, 1, 1, 1], [1, 2, 3, 4, 5, 6, 7])).status, 'invalid');
  assert.equal(JSON.stringify(backend.snapshot()), before);
});

console.log(`ALL STAR RUBRIC CHECKS PASSED (${count} checks)`);
