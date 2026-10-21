// register.test.mjs — tests for the public registration Function (contract 0005 §4.7).
// Why it exists: the Function is the first public, signed-out way into the database, so every
// check it makes is proven here before it goes anywhere near Cloudflare.
// How to run (from the project folder):   node --test functions/tests/
//
// Nothing real is used: a FAKE database (records what it was asked and answers what each test
// says) and a FAKE Turnstile (a pretend fetch that answers like Cloudflare's siteverify).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleGet, handlePost, handleOther } from '../_lib/register.js';
import { makeClientKey, todayInNewYork, clientNetwork } from '../_lib/clientKey.js';
import { MemoryRateLimiter, MEMORY_LIMIT } from '../_lib/rateLimit.js';
import { verifyTurnstile } from '../_lib/turnstile.js';

// ---------- helpers -------------------------------------------------------------------------

const ORIGIN = 'https://tkd-dashboard.pages.dev';
const RANK_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const SUBMISSION_ID = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo=';

// A complete, correct set of settings. Tests remove or change one thing at a time.
function goodEnv(overrides = {}) {
  return {
    PUBLIC_REGISTRATION: 'on',
    HYPERDRIVE: { connectionString: 'postgres://fake' },
    TURNSTILE_SECRET: 'turnstile-secret-for-tests',
    CLIENT_KEY_SECRET: 'client-key-secret-for-tests',
    PUBLIC_ORIGIN: ORIGIN,
    TURNSTILE_SITE_KEY: 'public-site-key',
    ...overrides,
  };
}

// A fake database. `answers` = what publicEvent / publicRegister return (or a function that
// throws). It remembers every call and whether close() was called.
function fakeDb({ event, register } = {}) {
  const log = { opened: 0, calls: [], closed: 0 };
  const openDatabase = () => {
    log.opened += 1;
    return {
      async publicEvent(code) {
        log.calls.push(['publicEvent', code]);
        if (typeof event === 'function') return event(code);
        return event;
      },
      async publicRegister(args) {
        log.calls.push(['publicRegister', args]);
        if (typeof register === 'function') return register(args);
        return register;
      },
      async close() {
        log.closed += 1;
      },
    };
  };
  return { openDatabase, log };
}

// A fake fetch that answers like Turnstile's siteverify.
function fakeTurnstile(result = { success: true, hostname: 'tkd-dashboard.pages.dev', action: 'register' }) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: String(init.body) });
    if (result instanceof Error) throw result;
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchImpl, seen };
}

// The body a real page sends.
function goodBody(overrides = {}) {
  return {
    submission_id: SUBMISSION_ID,
    first_name: 'Mia',
    last_name: 'Lopez',
    event_rank_id: RANK_ID,
    paying_by: 'cash',
    stripes: true,
    signature: SIGNATURE,
    ack_version: 'cb-2026-10-17',
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
  const init = { method, headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headers } };
  if (method === 'POST') init.body = typeof body === 'string' ? body : JSON.stringify(body ?? goodBody());
  return {
    request: new Request(`${ORIGIN}/api/register/${code}`, init),
    env,
    params: { code },
    waitUntil: (p) => waits.push(p),
    waits,
  };
}

// Runs a handler and returns { http, json, text }. Each run gets a FRESH in-memory rate limiter,
// so the many requests these tests send never add up to the limit (tests below pass their own).
async function run(handler, ctx, deps) {
  const response = await handler(ctx, { now: () => 1_700_000_000_000, memoryLimiter: new MemoryRateLimiter(), ...deps });
  await Promise.all(ctx.waits ?? []);
  const text = await response.text();
  return { http: response.status, json: JSON.parse(text), text, response };
}

const okEvent = {
  status: 'ok',
  state: 'open',
  closed_on: null,
  event: { name: 'November Children Testing', testing_date: '2026-11-20', note: null, school_name: 'Worcester', address: null, auto_close_on: '2026-11-13' },
  classes: [],
  secret_extra: 'must not be passed on',
};

const okRegister = {
  status: 'ok',
  reference: 'CB-3107',
  first_name: 'Mia',
  last_name: 'Lopez',
  testing_for: { name: 'Orange' },
  class_name: 'Group A',
  start_time: '17:00',
  end_time: '18:00',
  early_cents: 6500,
  day_cents: 7500,
  paying_by: 'cash',
  testing_date: '2026-11-20',
  school_name: 'Worcester',
  address: null,
  submission_id: 'should not be passed on',
};

// ---------- GET -----------------------------------------------------------------------------

test('GET: kill switch off → not_open, database never opened', async () => {
  for (const value of ['off', undefined, 'ON', '']) {
    const db = fakeDb({ event: okEvent });
    const r = await run(handleGet, context({ method: 'GET', env: goodEnv({ PUBLIC_REGISTRATION: value }) }), { openDatabase: db.openDatabase });
    assert.deepEqual(r.json, { status: 'not_open' });
    assert.equal(db.log.opened, 0);
  }
});

test('GET: a missing binding or setting → not_open (fail closed)', async () => {
  for (const missing of ['HYPERDRIVE', 'TURNSTILE_SECRET', 'CLIENT_KEY_SECRET', 'PUBLIC_ORIGIN', 'TURNSTILE_SITE_KEY']) {
    const env = goodEnv();
    delete env[missing];
    const db = fakeDb({ event: okEvent });
    const r = await run(handleGet, context({ method: 'GET', env }), { openDatabase: db.openDatabase });
    assert.deepEqual(r.json, { status: 'not_open' }, missing);
    assert.equal(db.log.opened, 0);
  }
});

test('GET: ok → only the public fields + the Turnstile site key, no-store, client closed', async () => {
  const db = fakeDb({ event: okEvent });
  const ctx = context({ method: 'GET', code: 'P4W9TDX2' });
  const r = await run(handleGet, ctx, { openDatabase: db.openDatabase });
  assert.equal(r.http, 200);
  assert.equal(r.json.status, 'ok');
  assert.equal(r.json.turnstile_site_key, 'public-site-key');
  assert.equal(r.json.secret_extra, undefined);
  assert.equal(r.response.headers.get('Cache-Control'), 'no-store');
  assert.match(r.response.headers.get('Content-Type'), /^application\/json/);
  assert.deepEqual(db.log.calls, [['publicEvent', 'p4w9tdx2']]); // lower-cased
  assert.equal(db.log.closed, 1);
});

test('GET: unknown code → not_found; a code that cannot exist never reaches the database', async () => {
  const db = fakeDb({ event: { status: 'not_found' } });
  const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: db.openDatabase });
  assert.deepEqual(r.json, { status: 'not_found' });

  const db2 = fakeDb({ event: okEvent });
  const r2 = await run(handleGet, context({ method: 'GET', code: "x'; drop--" }), { openDatabase: db2.openDatabase });
  assert.deepEqual(r2.json, { status: 'not_found' });
  assert.equal(db2.log.opened, 0);
});

test('codes the database could never make → not_found, no rate-limit allowance used, no database', async () => {
  // The database makes 8 characters from a–z and 2–9 without i, l, o (testing_new_public_code).
  const malformed = [
    'p4w9tdk',    // 7 characters
    'p4w9tdkmm',  // 9 characters
    'p4w9tdk1',   // 1 is never used
    'p4w9tdk0',   // 0 is never used
    'p4w9tdki',   // i is never used
    'p4w9tdkl',   // l is never used
    'p4w9tdko',   // o is never used
    'p4w9-dkm',   // not a letter or digit
  ];
  for (const code of malformed) {
    for (const [handler, method, deps] of [
      [handleGet, 'GET', () => ({ db: fakeDb({ event: okEvent }) })],
      [handlePost, 'POST', () => ({ db: fakeDb({ register: okRegister }) })],
    ]) {
      const { db } = deps();
      const memoryLimiter = new MemoryRateLimiter({ limit: 1 });
      const r = await run(handler, context({ method, code }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl, memoryLimiter });
      assert.deepEqual(r.json, { status: 'not_found' }, `${method} ${code}`);
      assert.equal(db.log.opened, 0, `${method} ${code}: database must not be opened`);
      // The one request this client is allowed is still unused: a real code gets through.
      const ok = await run(handler, context({ method }), { openDatabase: fakeDb({ event: okEvent, register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl, memoryLimiter });
      assert.equal(ok.json.status, 'ok', `${method} ${code}: allowance must not be used`);
    }
  }
  // The preview's default code and the tests' code are both real-looking codes.
  for (const code of ['p4w9tdkm', 'P4W9TDX2', 'abcdefgh', '23456789']) {
    const r = await run(handleGet, context({ method: 'GET', code }), { openDatabase: fakeDb({ event: okEvent }).openDatabase });
    assert.equal(r.json.status, 'ok', code);
  }
});

test('GET: database error → unavailable, no error text leaked', async () => {
  const db = fakeDb({ event: () => { throw new Error('password authentication failed for user testing_registrar'); } });
  const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: db.openDatabase });
  assert.deepEqual(r.json, { status: 'unavailable' });
  assert.doesNotMatch(r.text, /password|testing_registrar/);
  assert.equal(db.log.closed, 1);
});

test('GET: an unexpected database answer → unavailable', async () => {
  const db = fakeDb({ event: { status: 'something_new' } });
  const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: db.openDatabase });
  assert.deepEqual(r.json, { status: 'unavailable' });
});

// ---------- POST: the checks before Turnstile ---------------------------------------------

// Every refusal here must happen WITHOUT asking Turnstile or the database.
async function expectRefused(ctx, expected) {
  const db = fakeDb({ register: okRegister });
  const ts = fakeTurnstile();
  const r = await run(handlePost, ctx, { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl });
  assert.deepEqual(r.json, expected);
  assert.equal(r.http, expected.status === 'bad_request' ? 400 : 200);
  assert.equal(db.log.opened, 0, 'database must not be opened');
  assert.equal(ts.seen.length, 0, 'Turnstile must not be asked');
}

test('POST: kill switch off / missing binding → not_open', async () => {
  await expectRefused(context({ env: goodEnv({ PUBLIC_REGISTRATION: 'off' }) }), { status: 'not_open' });
  await expectRefused(context({ env: goodEnv({ HYPERDRIVE: undefined }) }), { status: 'not_open' });
  // a blank connection string counts as not set up (refused before Turnstile is asked)
  await expectRefused(context({ env: goodEnv({ HYPERDRIVE: { connectionString: '' } }) }), { status: 'not_open' });
});

test('POST: wrong or missing Origin → bad_request (HTTP 400)', async () => {
  await expectRefused(context({ headers: { Origin: 'https://evil.example' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { Origin: 'https://tkd-dashboard.pages.dev.evil.example' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { Origin: '' } }), { status: 'bad_request' });
});

test('POST: wrong Content-Type → bad_request', async () => {
  await expectRefused(context({ headers: { 'Content-Type': 'text/plain' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }), { status: 'bad_request' });
  // A charset parameter is fine:
  const db = fakeDb({ register: okRegister });
  const r = await run(handlePost, context({ headers: { 'Content-Type': 'application/json; charset=utf-8' } }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.json.status, 'ok');
});

test('POST: body over 100 KB → bad_request (declared size and real size)', async () => {
  const big = JSON.stringify(goodBody({ signature: 'data:image/png;base64,' + 'A'.repeat(110 * 1024) }));
  await expectRefused(context({ body: big }), { status: 'bad_request' });
  // A lying Content-Length: the stream is still counted while reading.
  await expectRefused(context({ body: big, headers: { 'Content-Length': '100' } }), { status: 'bad_request' });
});

test('POST: not JSON / not an object → bad_request', async () => {
  await expectRefused(context({ body: '{not json' }), { status: 'bad_request' });
  await expectRefused(context({ body: '[1,2,3]' }), { status: 'bad_request' });
  await expectRefused(context({ body: 'null' }), { status: 'bad_request' });
});

test('POST: honeypot filled in → bad_request', async () => {
  await expectRefused(context({ body: goodBody({ website: 'http://spam.example' }) }), { status: 'bad_request' });
});

test('POST: sent in under 4 seconds (or no times) → bad_request', async () => {
  await expectRefused(context({ body: goodBody({ started_at: 1_000_000, sent_at: 1_003_999 }) }), { status: 'bad_request' });
  await expectRefused(context({ body: goodBody({ started_at: undefined }) }), { status: 'bad_request' });
  await expectRefused(context({ body: goodBody({ sent_at: '1060000' }) }), { status: 'bad_request' });
});

test('POST: fields of the wrong type → bad_request', async () => {
  for (const bad of [
    { submission_id: 'not-a-uuid' },
    { submission_id: [goodBody().submission_id] }, // a one-item list is not text
    { event_rank_id: 42 },
    { event_rank_id: [goodBody().event_rank_id] },
    { first_name: null },
    { last_name: 'x'.repeat(201) },
    { stripes: 'true' },
    { signature: 'x'.repeat(70001) },
    { ack_version: undefined },
  ]) {
    await expectRefused(context({ body: goodBody(bad) }), { status: 'bad_request' });
  }
});

// ---------- POST: Turnstile -----------------------------------------------------------------

test('POST: Turnstile says no / wrong hostname / wrong action / unreachable / no token → verify_failed', async () => {
  const cases = [
    { success: false, hostname: 'tkd-dashboard.pages.dev', action: 'register' },
    { success: true, hostname: 'evil.example', action: 'register' },
    { success: true, hostname: 'tkd-dashboard.pages.dev', action: 'login' },
    { success: true }, // fields missing
    new Error('network down'),
  ];
  for (const result of cases) {
    const db = fakeDb({ register: okRegister });
    const ts = fakeTurnstile(result);
    const r = await run(handlePost, context(), { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl });
    assert.deepEqual(r.json, { status: 'verify_failed' });
    assert.equal(db.log.opened, 0);
  }
  const db = fakeDb({ register: okRegister });
  const r = await run(handlePost, context({ body: goodBody({ turnstile_token: '' }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(r.json, { status: 'verify_failed' });
});

test('POST: siteverify is asked with the secret, the token and the visitor IP', async () => {
  const ts = fakeTurnstile();
  await run(handlePost, context(), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: ts.fetchImpl });
  assert.equal(ts.seen.length, 1);
  assert.equal(ts.seen[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  const form = new URLSearchParams(ts.seen[0].body);
  assert.equal(form.get('secret'), 'turnstile-secret-for-tests');
  assert.equal(form.get('response'), 'token-from-the-page');
  assert.equal(form.get('remoteip'), '203.0.113.7');
});

test('verifyTurnstile: a non-200 answer is a no', async () => {
  const ok = await verifyTurnstile({
    fetchImpl: async () => new Response('oops', { status: 500 }),
    secret: 's', token: 't', ip: '1.2.3.4', expectedHost: 'tkd-dashboard.pages.dev',
  });
  assert.equal(ok, false);
});

// ---------- POST: the database ----------------------------------------------------------------

test('POST: ok → the public answer only; typed values passed; client key is not the IP', async () => {
  const db = fakeDb({ register: okRegister });
  const ctx = context();
  const r = await run(handlePost, ctx, { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.http, 200);
  assert.equal(r.json.status, 'ok');
  assert.equal(r.json.reference, 'CB-3107');
  assert.equal(r.json.submission_id, undefined);
  const [name, args] = db.log.calls[0];
  assert.equal(name, 'publicRegister');
  assert.equal(args.code, 'p4w9tdx2');
  assert.equal(args.submissionId, SUBMISSION_ID);
  assert.equal(args.eventRankId, RANK_ID);
  assert.equal(args.stripes, true);
  assert.match(args.clientKey, /^[0-9a-f]{64}$/);
  assert.ok(!args.clientKey.includes('203.0.113.7'));
  assert.equal(db.log.closed, 1, 'client closed through waitUntil');
});

test('POST: every database status is passed on (and only known ones)', async () => {
  const cases = [
    [{ status: 'not_found' }, { status: 'not_found' }],
    [{ status: 'not_open' }, { status: 'not_open' }],
    [{ status: 'closed', closed_on: '2026-11-13' }, { status: 'closed', closed_on: '2026-11-13' }],
    [{ status: 'closed', closed_on: null }, { status: 'closed', closed_on: null }],
    [{ status: 'finished' }, { status: 'finished' }],
    [{ status: 'rate_limited' }, { status: 'rate_limited' }],
    [{ status: 'invalid', detail: 'first name too long' }, { status: 'invalid' }],
    [{ status: 'no_access' }, { status: 'unavailable' }],
    [null, { status: 'unavailable' }],
  ];
  for (const [fromDb, expected] of cases) {
    const db = fakeDb({ register: fromDb });
    const r = await run(handlePost, context(), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, expected, JSON.stringify(fromDb));
    assert.equal(r.http, 200);
  }
});

test('POST: database error → unavailable; nothing personal in the answer or the log', async () => {
  const db = fakeDb({
    register: () => {
      throw new Error('duplicate key value violates unique constraint; Key (first_name)=(Mia) data:image/png;base64');
    },
  });
  const logged = [];
  const original = console.log;
  console.log = (...parts) => logged.push(parts.join(' '));
  try {
    const r = await run(handlePost, context(), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'unavailable' });
    assert.doesNotMatch(r.text, /Mia|duplicate|data:image/);
  } finally {
    console.log = original;
  }
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0], /Mia|Lopez|data:image|203\.0\.113\.7|duplicate/);
  assert.deepEqual(Object.keys(JSON.parse(logged[0])).sort(), ['fn', 'method', 'ms', 'status']);
  assert.equal(db.log.closed, 1);
});

test('POST: opening the database itself fails → unavailable', async () => {
  const r = await run(handlePost, context(), {
    openDatabase: () => { throw new Error('connect ECONNREFUSED'); },
    fetchImpl: fakeTurnstile().fetchImpl,
  });
  assert.deepEqual(r.json, { status: 'unavailable' });
});

test('other methods → bad_request', async () => {
  const response = handleOther();
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { status: 'bad_request' });
});

// ---------- the client key ------------------------------------------------------------------

test('client key: same all day, changes the next day (Massachusetts time), differs per IP', async () => {
  const secret = 'secret';
  const morning = new Date('2026-11-19T13:00:00Z'); // 8 AM in Massachusetts
  const lateEvening = new Date('2026-11-20T04:59:00Z'); // 11:59 PM Nov 19 in Massachusetts
  const afterMidnight = new Date('2026-11-20T05:00:00Z'); // 12:00 AM Nov 20 in Massachusetts
  assert.equal(todayInNewYork(lateEvening), '2026-11-19');
  assert.equal(todayInNewYork(afterMidnight), '2026-11-20');
  const a = await makeClientKey(secret, '203.0.113.7', morning);
  const b = await makeClientKey(secret, '203.0.113.7', lateEvening);
  const c = await makeClientKey(secret, '203.0.113.7', afterMidnight);
  const d = await makeClientKey(secret, '203.0.113.8', morning);
  const e = await makeClientKey('other-secret', '203.0.113.7', morning);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.notEqual(a, e);
  assert.match(a, /^[0-9a-f]{64}$/);
});

// ---------- the real entry point ------------------------------------------------------------

test('[code].js loads and routes by method (switched off, so nothing real is touched)', async () => {
  const { onRequest } = await import('../api/register/[code].js');
  const env = goodEnv({ PUBLIC_REGISTRATION: 'off' });
  for (const method of ['GET', 'POST']) {
    const response = await onRequest(context({ method, env }));
    assert.deepEqual(await response.json(), { status: 'not_open' });
  }
  const put = await onRequest({ ...context({ method: 'GET', env }), request: new Request(`${ORIGIN}/api/register/x`, { method: 'PUT' }) });
  assert.equal(put.status, 400);
});

// ---------- security review fixes (M1, M2, L1) ----------------------------------------------

// A fake Cloudflare Rate Limiting binding: allows `limit` calls per key, then says no.
function fakeRateLimiter(limit) {
  const seen = [];
  const counts = new Map();
  return {
    seen,
    async limit({ key }) {
      seen.push(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return { success: counts.get(key) <= limit };
    },
  };
}

test('rate limit (Cloudflare binding present): blocks after the limit, before the database', async () => {
  const binding = fakeRateLimiter(2);
  const env = goodEnv({ RATE_LIMITER: binding });
  const memoryLimiter = new MemoryRateLimiter({ limit: 0 }); // would block everything — must not be used
  for (const [handler, method, deps] of [
    [handleGet, 'GET', () => ({ openDatabase: fakeDb({ event: okEvent }).openDatabase })],
    [handlePost, 'POST', () => ({ openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl })],
  ]) {
    for (let i = 0; i < 2; i += 1) {
      const r = await run(handler, context({ method, env }), { ...deps(), memoryLimiter });
      assert.equal(r.json.status, 'ok', `${method} ${i}`);
    }
    const db = fakeDb({ event: okEvent, register: okRegister });
    const ts = fakeTurnstile();
    const r = await run(handler, context({ method, env }), { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl, memoryLimiter });
    assert.deepEqual(r.json, { status: 'rate_limited' });
    assert.equal(r.http, 200);
    assert.equal(db.log.opened, 0, 'database must not be opened');
    assert.equal(ts.seen.length, 0, 'Turnstile must not be asked');
  }
  // Key = client key + method; never the raw IP.
  assert.match(binding.seen[0], /^[0-9a-f]{64}:GET$/);
  assert.match(binding.seen.at(-1), /^[0-9a-f]{64}:POST$/);
  assert.ok(binding.seen.every((key) => !key.includes('203.0.113.7')));
  // A different connection still gets through.
  const other = await run(handleGet, context({ method: 'GET', env, headers: { 'CF-Connecting-IP': '198.51.100.9' } }), { openDatabase: fakeDb({ event: okEvent }).openDatabase });
  assert.equal(other.json.status, 'ok');
});

test('rate limit (no binding): the in-memory counter blocks after the limit, per key and method', async () => {
  const memoryLimiter = new MemoryRateLimiter({ limit: 3 });
  const deps = () => ({ openDatabase: fakeDb({ event: okEvent }).openDatabase, memoryLimiter });
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await run(handleGet, context({ method: 'GET' }), deps())).json.status, 'ok');
  }
  const db = fakeDb({ event: okEvent });
  const blocked = await run(handleGet, context({ method: 'GET' }), { openDatabase: db.openDatabase, memoryLimiter });
  assert.deepEqual(blocked.json, { status: 'rate_limited' });
  assert.equal(db.log.opened, 0);
  // POSTs from the same connection are counted separately.
  const post = await run(handlePost, context(), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl, memoryLimiter });
  assert.equal(post.json.status, 'ok');
  // A malformed code still answers not_found without touching the database.
  const db2 = fakeDb({ event: okEvent });
  const bad = await run(handleGet, context({ method: 'GET', code: 'no!' }), { openDatabase: db2.openDatabase, memoryLimiter });
  assert.deepEqual(bad.json, { status: 'not_found' });
  assert.equal(db2.log.opened, 0);
});

test('MemoryRateLimiter: default 60 per 60 s, window resets, memory stays bounded', () => {
  const limiter = new MemoryRateLimiter();
  assert.equal(MEMORY_LIMIT, 60);
  for (let i = 0; i < 60; i += 1) assert.equal(limiter.allow('k', 1000), true);
  assert.equal(limiter.allow('k', 1000), false);
  assert.equal(limiter.allow('k', 60_999), false);
  assert.equal(limiter.allow('k', 61_000), true); // a new minute
  const small = new MemoryRateLimiter({ limit: 1, maxKeys: 10 });
  for (let i = 0; i < 1000; i += 1) small.allow(`key-${i}`, 5000);
  assert.ok(small.counts.size <= 10);
});

test('client key: IPv6 addresses in the same /64 share a key; IPv4 uses the full address', async () => {
  assert.equal(clientNetwork('2001:db8:0:12::1'), '2001:db8:0:12::/64');
  assert.equal(clientNetwork('2001:0DB8:0000:0012:abcd:ef01:2345:6789'), '2001:db8:0:12::/64');
  assert.equal(clientNetwork('2001:db8::12:1:2:3:4'), '2001:db8:0:12::/64');
  assert.equal(clientNetwork('2001:db8:0:12::1%eth0'), '2001:db8:0:12::/64');
  assert.equal(clientNetwork('::1'), '0:0:0:0::/64');
  assert.equal(clientNetwork('::ffff:203.0.113.7'), '203.0.113.7'); // IPv4 written the IPv6 way
  assert.equal(clientNetwork('203.0.113.7'), '203.0.113.7');
  assert.equal(clientNetwork('not an ip'), 'not an ip');
  const day = new Date('2026-11-19T13:00:00Z');
  const a = await makeClientKey('s', '2001:db8:0:12::1', day);
  const b = await makeClientKey('s', '2001:db8:0:12:ffff:1234:5678:9abc', day);
  const c = await makeClientKey('s', '2001:db8:0:13::1', day);
  const d = await makeClientKey('s', '203.0.113.7', day);
  const e = await makeClientKey('s', '203.0.113.8', day);
  const f = await makeClientKey('s', '::ffff:203.0.113.7', day);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(d, e);
  assert.equal(d, f);
});

test('rate limit: a phone switching IPv6 addresses inside its /64 is still one client', async () => {
  const memoryLimiter = new MemoryRateLimiter({ limit: 2 });
  const answers = [];
  for (const ip of ['2001:db8:0:12::1', '2001:db8:0:12::2', '2001:db8:0:12:aaaa::3']) {
    const r = await run(handleGet, context({ method: 'GET', headers: { 'CF-Connecting-IP': ip } }), { openDatabase: fakeDb({ event: okEvent }).openDatabase, memoryLimiter });
    answers.push(r.json.status);
  }
  assert.deepEqual(answers, ['ok', 'ok', 'rate_limited']);
});

test('anything unplanned that throws → unavailable, with no details', async () => {
  // The Cloudflare binding fails.
  const brokenBinding = { limit: async () => { throw new Error('limiter exploded 203.0.113.7'); } };
  for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
    const db = fakeDb({ event: okEvent, register: okRegister });
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
  // Making the client key fails (crypto not working).
  const original = crypto.subtle.importKey;
  crypto.subtle.importKey = async () => { throw new Error('no crypto'); };
  try {
    const r2 = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ event: okEvent }).openDatabase });
    assert.deepEqual(r2.json, { status: 'unavailable' });
    const r3 = await run(handlePost, context(), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r3.json, { status: 'unavailable' });
  } finally {
    crypto.subtle.importKey = original;
  }
});

test('database "permission denied" (the SETUP §12i off switch) → unavailable', async () => {
  const denied = () => {
    const error = new Error('permission denied for function testing_public_register');
    error.code = '42501';
    throw error;
  };
  const getDb = fakeDb({ event: denied });
  const g = await run(handleGet, context({ method: 'GET' }), { openDatabase: getDb.openDatabase });
  assert.deepEqual(g.json, { status: 'unavailable' });
  assert.doesNotMatch(g.text, /permission|testing_public/);
  assert.equal(getDb.log.closed, 1);
  const postDb = fakeDb({ register: denied });
  const p = await run(handlePost, context(), { openDatabase: postDb.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(p.json, { status: 'unavailable' });
  assert.doesNotMatch(p.text, /permission|testing_public/);
  // Refused while connecting (e.g. CONNECT taken away) is the same.
  const c = await run(handleGet, context({ method: 'GET' }), {
    openDatabase: () => { throw Object.assign(new Error('permission denied for database postgres'), { code: '42501' }); },
  });
  assert.deepEqual(c.json, { status: 'unavailable' });
});
