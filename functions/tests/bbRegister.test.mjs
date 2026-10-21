// bbRegister.test.mjs — tests for the public Black Belt registration Function
// (CONTRACT-0016-B1 §4.7).
// Why it exists: the Function is a public, signed-out way into the database, so every check it
// makes is proven here before it goes anywhere near Cloudflare. Modelled on register.test.mjs
// (Color Belt), which must keep passing unchanged.
// How to run (from the project folder):   node --test functions/tests/
//
// Nothing real is used: a FAKE database (records what it was asked and answers what each test
// says) and a FAKE Turnstile (a pretend fetch that answers like Cloudflare's siteverify).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleGet, handlePost, handleOther, BB_TURNSTILE_ACTION } from '../_lib/bbRegister.js';
import { MemoryRateLimiter } from '../_lib/rateLimit.js';
import { verifyTurnstile, TURNSTILE_ACTION } from '../_lib/turnstile.js';

// ---------- helpers -------------------------------------------------------------------------

const ORIGIN = 'https://tkd-dashboard.pages.dev';
const PLAN_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const SUBMISSION_ID = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo=';
const IP = '203.0.113.7';

// A complete, correct set of settings. Tests remove or change one thing at a time.
function goodEnv(overrides = {}) {
  return {
    BB_PUBLIC_REGISTRATION: 'on',
    HYPERDRIVE_BB: { connectionString: 'postgres://fake' },
    TURNSTILE_SECRET: 'turnstile-secret-for-tests',
    CLIENT_KEY_SECRET: 'client-key-secret-for-tests',
    PUBLIC_ORIGIN: ORIGIN,
    TURNSTILE_SITE_KEY: 'public-site-key',
    ...overrides,
  };
}

// A fake database. `cycle` / `register` = what publicCycle / publicRegister return (or a
// function, which may throw). It remembers every call and whether close() was called.
function fakeDb({ cycle, register } = {}) {
  const log = { opened: 0, calls: [], closed: 0 };
  const openDatabase = () => {
    log.opened += 1;
    return {
      async publicCycle(code) {
        log.calls.push(['publicCycle', code]);
        return typeof cycle === 'function' ? cycle(code) : cycle;
      },
      async publicRegister(args) {
        log.calls.push(['publicRegister', args]);
        return typeof register === 'function' ? register(args) : register;
      },
      async close() {
        log.closed += 1;
      },
    };
  };
  return { openDatabase, log };
}

// A fake fetch that answers like Turnstile's siteverify (by default: yes, our host, Black Belt's action).
function fakeTurnstile(result = { success: true, hostname: 'tkd-dashboard.pages.dev', action: 'bb_register' }) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: String(init.body) });
    if (result instanceof Error) throw result;
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchImpl, seen };
}

// The body a real page sends (CONTRACT-0016-B1 §4.4 — exactly these keys).
function goodBody(overrides = {}) {
  return {
    submission_id: SUBMISSION_ID,
    first_name: 'Alex',
    last_name: 'Kim',
    date_of_birth: '2012-03-04',
    email: 'parent@example.com',
    dan: 1,
    cycle_plan_id: PLAN_ID,
    kukkiwon: true,
    acknowledged: true,
    waiver_version: '2027-1',
    signer_name: 'Jordan Kim',
    signature: SIGNATURE,
    website: '',
    started_at: 1_000_000,
    sent_at: 1_060_000, // a minute later
    turnstile_token: 'token-from-the-page',
    ...overrides,
  };
}

// A Pages-style context: request + env + params + waitUntil (which collects promises).
function context({ method = 'POST', env = goodEnv(), code = 'p4w9tdx2', body, headers = {} } = {}) {
  const waits = [];
  const init = { method, headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': IP, ...headers } };
  if (method === 'POST') init.body = typeof body === 'string' ? body : JSON.stringify(body ?? goodBody());
  return {
    request: new Request(`${ORIGIN}/api/black-belt/${code}`, init),
    env,
    params: { code },
    waitUntil: (p) => waits.push(p),
    waits,
  };
}

// Runs a handler and returns { http, json, text, response }. Each run gets a FRESH in-memory
// rate limiter, so the many requests these tests send never add up to the limit.
async function run(handler, ctx, deps) {
  const response = await handler(ctx, { now: () => 1_700_000_000_000, memoryLimiter: new MemoryRateLimiter(), ...deps });
  await Promise.all(ctx.waits ?? []);
  const text = await response.text();
  return { http: response.status, json: JSON.parse(text), text, response };
}

// Captures console.log while `fn` runs; returns the lines.
async function captureLog(fn) {
  const logged = [];
  const original = console.log;
  console.log = (...parts) => logged.push(parts.join(' '));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return logged;
}

// What bb_public_cycle answers (migration 0016 §17a), plus extra keys at every level that the
// Function must drop.
const okCycle = {
  status: 'ok',
  state: 'open',
  closed_on: null,
  school: { code: 'shrewsbury', name: 'Shrewsbury', address: '123 Main St', phone: 'not for the page' },
  cycle: {
    name: 'Spring 2027',
    application_due: '2027-03-27',
    submissions_due: '2027-05-29',
    days: [{ name: 'Physical', day_date: '2027-04-03', start_time: '12:30', end_time: '15:30', place: { name: 'Worcester', address: null }, second: null, parts: ['physical'] }],
    plans: [{ id: PLAN_ID, name: 'In full', position: 1, payments: [{ payment_no: 1, due_on: '2027-03-27' }], amounts: { 1: [87000], 2: [90000], 3: [95000], 4: [99000] } }],
    kukkiwon: { 1: 10000, 2: 12000, 3: 15000, 4: 17000 },
    requirements: { dans: [] },
    id: 'cycle-id-must-not-be-passed-on',
    candidate_count: 12,
  },
  waiver: { version_name: '2027-1', body: 'Waiver text.', id: 'waiver-id-must-not-be-passed-on' },
  secret_extra: 'must not be passed on',
};

// What bb_public_register answers on success (migration 0016 §17c), plus extras to drop.
const okRegister = {
  status: 'ok',
  reference: 'BB-1042',
  first_name: 'Alex',
  last_name: 'Kim',
  dan: 1,
  kukkiwon: true,
  plan_name: 'In full',
  items: [{ item: 'payment 1', due_on: '2027-03-27', amount_cents: 87000, candidate_id: 'x' }, { item: 'kukkiwon', due_on: '2027-03-27', amount_cents: 10000 }],
  total_cents: 97000,
  cycle_name: 'Spring 2027',
  school: { code: 'shrewsbury', name: 'Shrewsbury', address: 'not in the POST answer' },
  submission_id: 'should not be passed on',
  date_of_birth: '2012-03-04',
  email: 'parent@example.com',
  signer_name: 'Jordan Kim',
  signature: SIGNATURE,
};

// ---------- the switch and settings ---------------------------------------------------------

test('BB: switch off or not exactly "on" → not_open for GET and POST, nothing touched', async () => {
  for (const value of ['off', undefined, 'ON', '', 'true']) {
    for (const handler of [handleGet, handlePost]) {
      const db = fakeDb({ cycle: okCycle, register: okRegister });
      const ts = fakeTurnstile();
      const method = handler === handleGet ? 'GET' : 'POST';
      const r = await run(handler, context({ method, env: goodEnv({ BB_PUBLIC_REGISTRATION: value }) }), { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl });
      assert.deepEqual(r.json, { status: 'not_open' }, `${method} ${value}`);
      assert.equal(db.log.opened, 0);
      assert.equal(ts.seen.length, 0);
    }
  }
});

test('BB: a missing binding or setting → not_open (fail closed)', async () => {
  for (const missing of ['HYPERDRIVE_BB', 'TURNSTILE_SECRET', 'CLIENT_KEY_SECRET', 'PUBLIC_ORIGIN', 'TURNSTILE_SITE_KEY']) {
    for (const method of ['GET', 'POST']) {
      const env = goodEnv();
      delete env[missing];
      const db = fakeDb({ cycle: okCycle, register: okRegister });
      const r = await run(method === 'GET' ? handleGet : handlePost, context({ method, env }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
      assert.deepEqual(r.json, { status: 'not_open' }, `${method} without ${missing}`);
      assert.equal(db.log.opened, 0);
    }
  }
  // An empty setting or a binding without a connection string counts as missing.
  for (const env of [goodEnv({ TURNSTILE_SECRET: '' }), goodEnv({ HYPERDRIVE_BB: {} }), goodEnv({ HYPERDRIVE_BB: { connectionString: 42 } })]) {
    const r = await run(handleGet, context({ method: 'GET', env }), { openDatabase: fakeDb({ cycle: okCycle }).openDatabase });
    assert.deepEqual(r.json, { status: 'not_open' });
  }
});

test("BB: Color Belt's switch and binding never switch Black Belt on", async () => {
  const env = goodEnv({ PUBLIC_REGISTRATION: 'on', HYPERDRIVE: { connectionString: 'postgres://color-belt' } });
  delete env.BB_PUBLIC_REGISTRATION;
  const r1 = await run(handleGet, context({ method: 'GET', env }), { openDatabase: fakeDb({ cycle: okCycle }).openDatabase });
  assert.deepEqual(r1.json, { status: 'not_open' });
  const env2 = goodEnv({ HYPERDRIVE: { connectionString: 'postgres://color-belt' } });
  delete env2.HYPERDRIVE_BB;
  const r2 = await run(handleGet, context({ method: 'GET', env: env2 }), { openDatabase: fakeDb({ cycle: okCycle }).openDatabase });
  assert.deepEqual(r2.json, { status: 'not_open' });
});

// ---------- GET -----------------------------------------------------------------------------

test('BB GET: ok → exactly the listed keys + the site key, no-store, code lower-cased, client closed', async () => {
  const db = fakeDb({ cycle: okCycle });
  const r = await run(handleGet, context({ method: 'GET', code: 'P4W9TDX2' }), { openDatabase: db.openDatabase });
  assert.equal(r.http, 200);
  assert.deepEqual(r.json, {
    status: 'ok',
    state: 'open',
    closed_on: null,
    school: { code: 'shrewsbury', name: 'Shrewsbury', address: '123 Main St' },
    cycle: {
      name: 'Spring 2027',
      application_due: '2027-03-27',
      submissions_due: '2027-05-29',
      days: okCycle.cycle.days,
      plans: okCycle.cycle.plans,
      kukkiwon: okCycle.cycle.kukkiwon,
      requirements: okCycle.cycle.requirements,
    },
    waiver: { version_name: '2027-1', body: 'Waiver text.' },
    turnstile_site_key: 'public-site-key',
  });
  assert.doesNotMatch(r.text, /must not be passed on|candidate_count|not for the page/);
  assert.equal(r.response.headers.get('Cache-Control'), 'no-store');
  assert.match(r.response.headers.get('Content-Type'), /^application\/json/);
  assert.deepEqual(db.log.calls, [['publicCycle', 'p4w9tdx2']]);
  assert.equal(db.log.closed, 1);
});

test('BB GET: closed / not_open / finished states are passed on as ok + state (+ closed_on)', async () => {
  for (const [state, closedOn] of [['closed', '2027-03-27'], ['closed', null], ['not_open', null], ['finished', null]]) {
    const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ cycle: { ...okCycle, state, closed_on: closedOn } }).openDatabase });
    assert.equal(r.json.status, 'ok');
    assert.equal(r.json.state, state);
    assert.equal(r.json.closed_on, closedOn);
  }
  // A school without an address → address null.
  const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ cycle: { ...okCycle, school: { code: 'worcester', name: 'Worcester' } } }).openDatabase });
  assert.deepEqual(r.json.school, { code: 'worcester', name: 'Worcester', address: null });
});

test('BB GET: unknown code → not_found; unexpected or incomplete answers → unavailable', async () => {
  const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ cycle: { status: 'not_found' } }).openDatabase });
  assert.deepEqual(r.json, { status: 'not_found' });
  for (const answer of [{ status: 'something_new' }, null, { ...okCycle, cycle: null }, { ...okCycle, waiver: null }, { ...okCycle, school: 'x' }]) {
    const db = fakeDb({ cycle: answer });
    const r2 = await run(handleGet, context({ method: 'GET' }), { openDatabase: db.openDatabase });
    assert.deepEqual(r2.json, { status: 'unavailable' }, JSON.stringify(answer));
    assert.equal(db.log.closed, 1);
  }
});

test('BB: codes the database could never make → not_found, no rate-limit allowance used, no database', async () => {
  const malformed = ['p4w9tdk', 'p4w9tdkmm', 'p4w9tdk1', 'p4w9tdk0', 'p4w9tdki', 'p4w9tdkl', 'p4w9tdko', 'p4w9-dkm', "x'; drop--", ''];
  for (const code of malformed) {
    for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
      const db = fakeDb({ cycle: okCycle, register: okRegister });
      const ts = fakeTurnstile();
      const memoryLimiter = new MemoryRateLimiter({ limit: 1 });
      const r = await run(handler, context({ method, code }), { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl, memoryLimiter });
      assert.deepEqual(r.json, { status: 'not_found' }, `${method} ${code}`);
      assert.equal(db.log.opened, 0, `${method} ${code}: database must not be opened`);
      assert.equal(ts.seen.length, 0);
      // The one request this client is allowed is still unused: a real code gets through.
      const ok = await run(handler, context({ method }), { openDatabase: fakeDb({ cycle: okCycle, register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl, memoryLimiter });
      assert.equal(ok.json.status, 'ok', `${method} ${code}: allowance must not be used`);
    }
  }
});

test('BB GET: database error / permission denied (42501) → unavailable, no error text leaked', async () => {
  const errors = [
    new Error('password authentication failed for user bb_registrar'),
    Object.assign(new Error('permission denied for function bb_public_cycle'), { code: '42501' }),
  ];
  for (const error of errors) {
    const db = fakeDb({ cycle: () => { throw error; } });
    const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: db.openDatabase });
    assert.deepEqual(r.json, { status: 'unavailable' });
    assert.doesNotMatch(r.text, /password|permission|bb_registrar|bb_public/);
    assert.equal(db.log.closed, 1);
  }
  // Refused while connecting is the same.
  const c = await run(handleGet, context({ method: 'GET' }), {
    openDatabase: () => { throw Object.assign(new Error('permission denied for database postgres'), { code: '42501' }); },
  });
  assert.deepEqual(c.json, { status: 'unavailable' });
});

// ---------- POST: the checks before Turnstile -----------------------------------------------

// Every refusal here must happen WITHOUT asking Turnstile or the database.
async function expectRefused(ctx, expected, label) {
  const db = fakeDb({ register: okRegister });
  const ts = fakeTurnstile();
  const r = await run(handlePost, ctx, { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl });
  assert.deepEqual(r.json, expected, label);
  assert.equal(r.http, expected.status === 'bad_request' ? 400 : 200, label);
  assert.equal(db.log.opened, 0, `${label}: database must not be opened`);
  assert.equal(ts.seen.length, 0, `${label}: Turnstile must not be asked`);
}

test('BB POST: wrong or missing Origin → bad_request (HTTP 400)', async () => {
  await expectRefused(context({ headers: { Origin: 'https://evil.example' } }), { status: 'bad_request' }, 'evil');
  await expectRefused(context({ headers: { Origin: 'https://tkd-dashboard.pages.dev.evil.example' } }), { status: 'bad_request' }, 'suffix');
  await expectRefused(context({ headers: { Origin: '' } }), { status: 'bad_request' }, 'empty');
});

test('BB POST: wrong Content-Type → bad_request; a charset parameter is fine', async () => {
  await expectRefused(context({ headers: { 'Content-Type': 'text/plain' } }), { status: 'bad_request' }, 'text/plain');
  await expectRefused(context({ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }), { status: 'bad_request' }, 'form');
  const r = await run(handlePost, context({ headers: { 'Content-Type': 'application/json; charset=utf-8' } }), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.json.status, 'ok');
});

test('BB POST: no CF-Connecting-IP → bad_request before the database', async () => {
  await expectRefused(context({ headers: { 'CF-Connecting-IP': '' } }), { status: 'bad_request' }, 'no ip');
});

test('BB POST: body over 100 KB → bad_request (declared size and real size)', async () => {
  const big = JSON.stringify(goodBody({ signature: 'data:image/png;base64,' + 'A'.repeat(110 * 1024) }));
  await expectRefused(context({ body: big }), { status: 'bad_request' }, 'big');
  await expectRefused(context({ body: big, headers: { 'Content-Length': '100' } }), { status: 'bad_request' }, 'lying length');
});

test('BB POST: not JSON / not an object → bad_request', async () => {
  for (const body of ['{not json', '[1,2,3]', 'null', '"text"', '42']) {
    await expectRefused(context({ body }), { status: 'bad_request' }, body);
  }
});

test('BB POST: honeypot filled in → bad_request', async () => {
  await expectRefused(context({ body: goodBody({ website: 'http://spam.example' }) }), { status: 'bad_request' }, 'honeypot');
});

test('BB POST: sent in under 4 seconds (or without times) → bad_request', async () => {
  await expectRefused(context({ body: goodBody({ started_at: 1_000_000, sent_at: 1_003_999 }) }), { status: 'bad_request' }, '3.999 s');
  await expectRefused(context({ body: goodBody({ started_at: undefined }) }), { status: 'bad_request' }, 'no started_at');
  await expectRefused(context({ body: goodBody({ sent_at: '1060000' }) }), { status: 'bad_request' }, 'text sent_at');
  // Exactly 4 seconds is allowed.
  const r = await run(handlePost, context({ body: goodBody({ started_at: 1_000_000, sent_at: 1_004_000 }) }), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.json.status, 'ok');
});

test('BB POST: fields of the wrong type or size → bad_request', async () => {
  const bad = [
    { submission_id: 'not-a-uuid' },
    { submission_id: undefined },
    { cycle_plan_id: 42 },
    { cycle_plan_id: 'plan-1' },
    { first_name: null },
    { first_name: 'x'.repeat(201) },
    { last_name: undefined },
    { last_name: 'x'.repeat(201) },
    { date_of_birth: undefined },
    { date_of_birth: '2012-3-4' },
    { date_of_birth: '03/04/2012' },
    { date_of_birth: '2012-02-30' }, // not a real day
    { date_of_birth: '2012-13-01' },
    { date_of_birth: '2012-03-04T00:00:00Z' },
    { date_of_birth: 20120304 },
    { email: undefined },
    { email: 42 },
    { email: 'a'.repeat(310) + '@example.com' }, // 322 characters
    { dan: '1' },
    { dan: 1.5 },
    { dan: null },
    { dan: 3_000_000_000 }, // bigger than a Postgres integer
    { kukkiwon: 'yes' },
    { kukkiwon: undefined },
    { acknowledged: 1 },
    { acknowledged: undefined },
    { waiver_version: undefined },
    { waiver_version: 2027 },
    { waiver_version: 'x'.repeat(41) },
    { signer_name: undefined },
    { signer_name: 'x'.repeat(201) },
    { signature: undefined },
    { signature: 'x'.repeat(70001) },
    // A LIST holding a valid uuid: String(["<uuid>"]) looks like the uuid, but it isn't text.
    { submission_id: [SUBMISSION_ID] },
    { cycle_plan_id: [PLAN_ID] },
    { submission_id: { id: SUBMISSION_ID } },
    // The null character \u0000 — Postgres text can't hold it — in every text field.
    { submission_id: `${SUBMISSION_ID}\u0000` },
    { cycle_plan_id: `\u0000${PLAN_ID}` },
    { first_name: 'Al\u0000ex' },
    { last_name: 'Kim\u0000' },
    { date_of_birth: '2012-03-\u00004' },
    { email: 'parent@example.com\u0000' },
    { waiver_version: '2027-1\u0000' },
    { signer_name: '\u0000Jordan Kim' },
    { signature: `${SIGNATURE}\u0000` },
  ];
  for (const change of bad) {
    await expectRefused(context({ body: goodBody(change) }), { status: 'bad_request' }, JSON.stringify(change).slice(0, 80));
  }
});

test('BB POST: values the database judges (not the Function) still go through to it', async () => {
  // Dan 5, acknowledged false, an empty name, a 2-digit year date… are the right TYPE; the
  // database answers `invalid` for them (it checks the real rules).
  for (const change of [{ dan: 5 }, { dan: 0 }, { acknowledged: false }, { first_name: '' }, { date_of_birth: '2099-01-01' }, { signature: 'not a png' }]) {
    const db = fakeDb({ register: { status: 'invalid' } });
    const r = await run(handlePost, context({ body: goodBody(change) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'invalid' }, JSON.stringify(change));
    assert.equal(db.log.opened, 1);
  }
});

// ---------- POST: Turnstile -----------------------------------------------------------------

test("BB POST: Turnstile no / wrong host / Color Belt's action / unreachable / no token → verify_failed", async () => {
  const cases = [
    { success: false, hostname: 'tkd-dashboard.pages.dev', action: 'bb_register' },
    { success: true, hostname: 'evil.example', action: 'bb_register' },
    { success: true, hostname: 'tkd-dashboard.pages.dev', action: 'register' }, // a Color Belt token
    { success: true, hostname: 'tkd-dashboard.pages.dev', action: 'form' }, // a Forms token
    { success: true }, // fields missing
    new Error('network down'),
  ];
  for (const result of cases) {
    const db = fakeDb({ register: okRegister });
    const r = await run(handlePost, context(), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile(result).fetchImpl });
    assert.deepEqual(r.json, { status: 'verify_failed' }, String(result?.action ?? result));
    assert.equal(db.log.opened, 0);
  }
  for (const token of ['', undefined, 42, 'x'.repeat(2049)]) {
    const db = fakeDb({ register: okRegister });
    const r = await run(handlePost, context({ body: goodBody({ turnstile_token: token }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'verify_failed' });
    assert.equal(db.log.opened, 0);
  }
});

test('BB POST: siteverify is asked once, with the secret, the token and the visitor IP', async () => {
  const ts = fakeTurnstile();
  await run(handlePost, context(), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: ts.fetchImpl });
  assert.equal(ts.seen.length, 1);
  assert.equal(ts.seen[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  const form = new URLSearchParams(ts.seen[0].body);
  assert.equal(form.get('secret'), 'turnstile-secret-for-tests');
  assert.equal(form.get('response'), 'token-from-the-page');
  assert.equal(form.get('remoteip'), IP);
});

test("verifyTurnstile: the action parameter; Color Belt's default is still 'register'", async () => {
  assert.equal(TURNSTILE_ACTION, 'register');
  assert.equal(BB_TURNSTILE_ACTION, 'bb_register');
  const answer = (action) => async () => new Response(JSON.stringify({ success: true, hostname: 'h.example', action }), { status: 200 });
  const base = { secret: 's', token: 't', ip: '1.2.3.4', expectedHost: 'h.example' };
  // No expectedAction (how Color Belt calls it): 'register' only.
  assert.equal(await verifyTurnstile({ ...base, fetchImpl: answer('register') }), true);
  assert.equal(await verifyTurnstile({ ...base, fetchImpl: answer('bb_register') }), false);
  // expectedAction 'bb_register' (how Black Belt calls it): 'bb_register' only.
  assert.equal(await verifyTurnstile({ ...base, expectedAction: 'bb_register', fetchImpl: answer('bb_register') }), true);
  assert.equal(await verifyTurnstile({ ...base, expectedAction: 'bb_register', fetchImpl: answer('register') }), false);
  assert.equal(await verifyTurnstile({ ...base, expectedAction: 'bb_register', fetchImpl: answer(undefined) }), false);
});

// ---------- POST: the database ----------------------------------------------------------------

test('BB POST: ok → exactly the listed keys; nothing personal beyond the names; client closed', async () => {
  const db = fakeDb({ register: okRegister });
  const r = await run(handlePost, context(), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.http, 200);
  assert.deepEqual(r.json, {
    status: 'ok',
    reference: 'BB-1042',
    first_name: 'Alex',
    last_name: 'Kim',
    dan: 1,
    kukkiwon: true,
    plan_name: 'In full',
    items: [
      { item: 'payment 1', due_on: '2027-03-27', amount_cents: 87000 },
      { item: 'kukkiwon', due_on: '2027-03-27', amount_cents: 10000 },
    ],
    total_cents: 97000,
    cycle_name: 'Spring 2027',
    school: { code: 'shrewsbury', name: 'Shrewsbury' },
  });
  assert.doesNotMatch(r.text, /2012-03-04|parent@example\.com|Jordan|data:image|submission|candidate_id/);
  assert.equal(r.response.headers.get('Cache-Control'), 'no-store');
  assert.equal(db.log.closed, 1, 'client closed through waitUntil');
});

test('BB POST: the database gets every value, typed, with the client key (never the IP)', async () => {
  const db = fakeDb({ register: okRegister });
  await run(handlePost, context({ code: 'P4W9TDX2', body: goodBody({ submission_id: SUBMISSION_ID.toUpperCase(), cycle_plan_id: PLAN_ID.toUpperCase() }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  const [name, args] = db.log.calls[0];
  assert.equal(name, 'publicRegister');
  const { clientKey, ...rest } = args;
  assert.match(clientKey, /^[0-9a-f]{64}$/);
  assert.ok(!clientKey.includes(IP));
  assert.deepEqual(rest, {
    code: 'p4w9tdx2',
    submissionId: SUBMISSION_ID,
    first: 'Alex',
    last: 'Kim',
    dateOfBirth: '2012-03-04',
    email: 'parent@example.com',
    dan: 1,
    cyclePlanId: PLAN_ID,
    kukkiwon: true,
    acknowledged: true,
    waiverVersion: '2027-1',
    signerName: 'Jordan Kim',
    signature: SIGNATURE,
  });
  // Nothing the database doesn't take (honeypot, times, token) is sent on.
  assert.equal(Object.keys(args).length, 14);
});

test('BB bbDb.js: the 14 parameters are in migration 0016\'s order and typed as its signature', () => {
  const source = readFileSync(new URL('../_lib/bbDb.js', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../supabase/migrations/0016_black_belt.sql', import.meta.url), 'utf8');
  // The parameters bbDb.js sends, in order: [argument name, type].
  const call = source.slice(source.indexOf('public.bb_public_register('));
  const sent = [...call.matchAll(/\$\{args\.(\w+)\}::(\w+)/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(sent, [
    ['code', 'text'],
    ['clientKey', 'text'],
    ['submissionId', 'uuid'],
    ['first', 'text'],
    ['last', 'text'],
    ['dateOfBirth', 'date'],
    ['email', 'text'],
    ['dan', 'integer'],
    ['cyclePlanId', 'uuid'],
    ['kukkiwon', 'boolean'],
    ['acknowledged', 'boolean'],
    ['waiverVersion', 'text'],
    ['signerName', 'text'],
    ['signature', 'text'],
  ]);
  // The function's own parameter list in the migration (17c).
  const start = migration.indexOf('create or replace function public.bb_public_register(');
  const head = migration.slice(start, migration.indexOf(')', start));
  const declared = [...head.matchAll(/^\s*(p_\w+)\s+(\w+)/gm)].map((m) => [m[1], m[2]]);
  assert.deepEqual(declared, [
    ['p_code', 'text'],
    ['p_client_key', 'text'],
    ['p_submission_id', 'uuid'],
    ['p_first', 'text'],
    ['p_last', 'text'],
    ['p_date_of_birth', 'date'],
    ['p_email', 'text'],
    ['p_dan', 'integer'],
    ['p_cycle_plan_id', 'uuid'],
    ['p_kukkiwon', 'boolean'],
    ['p_acknowledged', 'boolean'],
    ['p_waiver_version', 'text'],
    ['p_signer_name', 'text'],
    ['p_signature', 'text'],
  ]);
  assert.deepEqual(sent.map(([, type]) => type), declared.map(([, type]) => type));
  // The GET call, and nothing else: exactly two database functions are named in the file.
  assert.match(source, /public\.bb_public_cycle\(\$\{code\}::text\)/);
  const named = [...source.matchAll(/public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(named)].sort(), ['bb_public_cycle', 'bb_public_register']);
  assert.match(source, /env\.HYPERDRIVE_BB\.connectionString/);
  assert.match(source, /prepare: false/);
});

test('BB POST: every database status is passed on (and only known ones)', async () => {
  const cases = [
    [{ status: 'not_found' }, { status: 'not_found' }],
    [{ status: 'not_open' }, { status: 'not_open' }],
    [{ status: 'closed', closed_on: '2027-03-27' }, { status: 'closed', closed_on: '2027-03-27' }],
    [{ status: 'closed' }, { status: 'closed', closed_on: null }],
    [{ status: 'finished' }, { status: 'finished' }],
    [{ status: 'rate_limited' }, { status: 'rate_limited' }],
    [{ status: 'invalid', detail: 'first name too long' }, { status: 'invalid' }],
    [{ status: 'waiver_changed', version: '2027-2' }, { status: 'waiver_changed' }],
    [{ status: 'no_access' }, { status: 'unavailable' }],
    [{ status: 'verify_failed' }, { status: 'unavailable' }], // never comes from the database
    [{ reference: 'BB-1' }, { status: 'unavailable' }], // no status = not "registered"
    [null, { status: 'unavailable' }],
    ['ok', { status: 'unavailable' }],
  ];
  for (const [fromDb, expected] of cases) {
    const r = await run(handlePost, context(), { openDatabase: fakeDb({ register: fromDb }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, expected, JSON.stringify(fromDb));
    assert.equal(r.http, 200);
  }
});

test('BB POST: a retry with the same submission id is sent on as it is (the database answers it)', async () => {
  // Idempotency lives in the database (same submission id → the first ok answer again); the
  // Function must not block or change a retry.
  const db = fakeDb({ register: okRegister });
  for (let i = 0; i < 2; i += 1) {
    const r = await run(handlePost, context(), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.equal(r.json.reference, 'BB-1042');
  }
  assert.equal(db.log.calls.length, 2);
  assert.equal(db.log.calls[0][1].submissionId, db.log.calls[1][1].submissionId);
});

test('BB POST: database error / 42501 → unavailable; the log line has only the four keys', async () => {
  const errors = [
    new Error('duplicate key; Key (first_name)=(Alex) 2012-03-04 parent@example.com data:image/png;base64'),
    Object.assign(new Error('permission denied for function bb_public_register'), { code: '42501' }),
  ];
  for (const error of errors) {
    const db = fakeDb({ register: () => { throw error; } });
    let r;
    const logged = await captureLog(async () => {
      r = await run(handlePost, context(), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    });
    assert.deepEqual(r.json, { status: 'unavailable' });
    assert.doesNotMatch(r.text, /Alex|duplicate|permission|data:image|bb_public/);
    assert.equal(logged.length, 1);
    assert.doesNotMatch(logged[0], /Alex|Kim|Jordan|2012-03-04|parent@example|data:image|203\.0\.113\.7|duplicate|permission/);
    const line = JSON.parse(logged[0]);
    assert.deepEqual(Object.keys(line).sort(), ['fn', 'method', 'ms', 'status']);
    assert.deepEqual({ fn: line.fn, method: line.method, status: line.status }, { fn: 'bb_register', method: 'POST', status: 'unavailable' });
    assert.equal(db.log.closed, 1);
  }
});

test('BB: a successful GET and POST also log only fn, method, status, ms', async () => {
  const logged = await captureLog(async () => {
    await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ cycle: okCycle }).openDatabase });
    await run(handlePost, context(), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  });
  assert.equal(logged.length, 2);
  for (const text of logged) {
    assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['fn', 'method', 'ms', 'status']);
    assert.doesNotMatch(text, /Alex|Kim|Jordan|2012-03-04|parent@example|data:image|203\.0\.113\.7|BB-1042|Waiver/);
  }
  assert.deepEqual(logged.map((t) => JSON.parse(t).status), ['ok', 'ok']);
});

test('BB POST: opening the database itself fails → unavailable', async () => {
  const r = await run(handlePost, context(), {
    openDatabase: () => { throw new Error('connect ECONNREFUSED'); },
    fetchImpl: fakeTurnstile().fetchImpl,
  });
  assert.deepEqual(r.json, { status: 'unavailable' });
});

test('BB: PUBLIC_ORIGIN that is not a web address → not_open, Turnstile not asked', async () => {
  // The Origin header still has to equal it, so send the same odd value.
  await expectRefused(context({ env: goodEnv({ PUBLIC_ORIGIN: 'not a url' }), headers: { Origin: 'not a url' } }), { status: 'not_open' }, 'odd origin');
});

// ---------- rate limit and unplanned errors ---------------------------------------------------

test('BB rate limit: blocks after the limit, before Turnstile and the database', async () => {
  for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
    const memoryLimiter = new MemoryRateLimiter({ limit: 2 });
    for (let i = 0; i < 2; i += 1) {
      const r = await run(handler, context({ method }), { openDatabase: fakeDb({ cycle: okCycle, register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl, memoryLimiter });
      assert.equal(r.json.status, 'ok');
    }
    const db = fakeDb({ cycle: okCycle, register: okRegister });
    const ts = fakeTurnstile();
    const r = await run(handler, context({ method }), { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl, memoryLimiter });
    assert.deepEqual(r.json, { status: 'rate_limited' });
    assert.equal(db.log.opened, 0);
    assert.equal(ts.seen.length, 0);
  }
  // With the Cloudflare binding: the key is the client key + Black Belt's own method name
  // (BB_POST / BB_GET), never the IP.
  const seen = [];
  const binding = { async limit({ key }) { seen.push(key); return { success: true }; } };
  await run(handlePost, context({ env: goodEnv({ RATE_LIMITER: binding }) }), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  await run(handleGet, context({ method: 'GET', env: goodEnv({ RATE_LIMITER: binding }) }), { openDatabase: fakeDb({ cycle: okCycle }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.match(seen[0], /^[0-9a-f]{64}:BB_POST$/);
  assert.match(seen[1], /^[0-9a-f]{64}:BB_GET$/);
});

test("BB rate limit: its own bucket — Color Belt's counter (same client, same method) never blocks Black Belt", async () => {
  // One shared in-memory counter, as in a real copy of the Function. Fill Color Belt's bucket
  // for this client ('<key>:POST' / '<key>:GET' — what register.js uses) to the limit…
  const { makeClientKey } = await import('../_lib/clientKey.js');
  const { allowRequest } = await import('../_lib/rateLimit.js');
  const nowMs = 1_700_000_000_000;
  const clientKey = await makeClientKey(goodEnv().CLIENT_KEY_SECRET, IP, new Date(nowMs));
  for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
    const memoryLimiter = new MemoryRateLimiter({ limit: 1 });
    assert.equal(await allowRequest({ env: {}, clientKey, method, nowMs, memoryLimiter }), true);
    assert.equal(await allowRequest({ env: {}, clientKey, method, nowMs, memoryLimiter }), false, 'Color Belt bucket is full');
    // …Black Belt still gets through, because it counts in 'BB_<method>'.
    const r = await run(handler, context({ method }), { openDatabase: fakeDb({ cycle: okCycle, register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl, memoryLimiter });
    assert.equal(r.json.status, 'ok', method);
    assert.ok(memoryLimiter.counts.has(`${clientKey}:BB_${method}`), method);
  }
});

test('BB: anything unplanned that throws → unavailable, with no details', async () => {
  const brokenBinding = { limit: async () => { throw new Error('limiter exploded 203.0.113.7'); } };
  for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
    const db = fakeDb({ cycle: okCycle, register: okRegister });
    const r = await run(handler, context({ method, env: goodEnv({ RATE_LIMITER: brokenBinding }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'unavailable' }, method);
    assert.doesNotMatch(r.text, /exploded|203/);
    assert.equal(db.log.opened, 0);
  }
  // Reading the body fails half-way.
  const failingBody = new ReadableStream({ pull(controller) { controller.error(new Error('connection reset')); } });
  const ctx = context();
  ctx.request = new Request(ctx.request.url, { method: 'POST', headers: ctx.request.headers, body: failingBody, duplex: 'half' });
  const r1 = await run(handlePost, ctx, { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(r1.json, { status: 'unavailable' });
});

// ---------- the real entry point ------------------------------------------------------------

test('BB [code].js loads and routes by method (switched off, so nothing real is touched)', async () => {
  const { onRequest } = await import('../api/black-belt/[code].js');
  const env = goodEnv({ BB_PUBLIC_REGISTRATION: 'off' });
  for (const method of ['GET', 'POST']) {
    const response = await onRequest(context({ method, env }));
    assert.deepEqual(await response.json(), { status: 'not_open' });
  }
  const put = await onRequest({ ...context({ method: 'GET', env }), request: new Request(`${ORIGIN}/api/black-belt/x`, { method: 'PUT' }) });
  assert.equal(put.status, 400);
  assert.deepEqual(await put.json(), { status: 'bad_request' });
  assert.equal(handleOther().status, 400);
});

// ---------- the shared static files -----------------------------------------------------------

test('BB public/_redirects and public/_headers hold the Black Belt lines', () => {
  const redirects = readFileSync(new URL('../../public/_redirects', import.meta.url), 'utf8');
  assert.match(redirects, /^\/black-belt\/\*  \/black-belt  200\r?$/m);
  const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
  // The Black Belt CSP is the same as Color Belt's /register one, on all three addresses.
  const cspFor = (path) => {
    const escaped = path.replace(/[.*]/g, (c) => `\\${c}`);
    const match = new RegExp(`^${escaped}\\r?\\n  Content-Security-Policy: (.+?)\\r?$`, 'm').exec(headers);
    return match?.[1];
  };
  const colorBelt = cspFor('/register');
  assert.ok(colorBelt);
  for (const path of ['/black-belt', '/black-belt.html', '/black-belt/*']) {
    assert.equal(cspFor(path), colorBelt, path);
  }
});
