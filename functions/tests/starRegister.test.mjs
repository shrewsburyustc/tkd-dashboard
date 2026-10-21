// starRegister.test.mjs — tests for the Star family form's Function (CONTRACT-0006 §8,
// build plan phase 4 "Checks").
// Why it exists: the Function is a public, signed-out way into the database, so every check it
// makes is proven here before it goes anywhere near Cloudflare. It copies the cases of Color
// Belt's register.test.mjs and adds Star's own (no settings at all, the Star code pattern,
// the "star_register" Turnstile action, the client key shared with Color Belt, every §8.3
// status, and a read-through of starDb.js).
// How to run (from the project folder):   node --test functions/tests/
//
// Nothing real is used: a FAKE database (records what it was asked and answers what each test
// says) and a FAKE Turnstile (a pretend fetch that answers like Cloudflare's siteverify).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleGet, handlePost, handleOther, STAR_TURNSTILE_ACTION } from '../_lib/starRegister.js';
import * as colorBelt from '../_lib/register.js';
import { makeClientKey } from '../_lib/clientKey.js';
import { MemoryRateLimiter } from '../_lib/rateLimit.js';
import { verifyTurnstile, TURNSTILE_ACTION } from '../_lib/turnstile.js';

// ---------- helpers -------------------------------------------------------------------------

const ORIGIN = 'https://tkd-dashboard.pages.dev';
const SUBMISSION_ID = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo=';
const NOW = 1_700_000_000_000;

// A complete, correct set of settings. Tests remove or change one thing at a time.
function goodEnv(overrides = {}) {
  return {
    STAR_PUBLIC_REGISTRATION: 'on',
    HYPERDRIVE_STAR: { connectionString: 'postgres://fake-star' },
    TURNSTILE_SECRET: 'turnstile-secret-for-tests',
    CLIENT_KEY_SECRET: 'client-key-secret-for-tests',
    PUBLIC_ORIGIN: ORIGIN,
    TURNSTILE_SITE_KEY: 'public-site-key',
    ...overrides,
  };
}

// A fake database: remembers every call and whether close() was called.
function fakeDb({ event, register } = {}) {
  const log = { opened: 0, calls: [], closed: 0, envs: [] };
  const openDatabase = (env) => {
    log.opened += 1;
    log.envs.push(env);
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

// A fake fetch that answers like Turnstile's siteverify (by default: a good Star token).
function fakeTurnstile(result = { success: true, hostname: 'tkd-dashboard.pages.dev', action: 'star_register' }) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: String(init.body) });
    if (result instanceof Error) throw result;
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchImpl, seen };
}

// The body a real Star page sends.
function goodBody(overrides = {}) {
  return {
    submission_id: SUBMISSION_ID,
    first_name: 'Mia',
    last_name: 'Lopez',
    date_of_birth: '2014-05-09',
    email: 'family@example.com',
    dan: 1,
    stars_from: 2,
    paying_by: 'cash',
    acknowledged: true,
    signature: SIGNATURE,
    ack_version: 'st-2026-10-18',
    website: '',
    started_at: 1_000_000,
    sent_at: 1_060_000, // a minute later
    turnstile_token: 'token-from-the-page',
    ...overrides,
  };
}

// A Pages-style context: request + env + params + waitUntil (which collects promises).
function context({ method = 'POST', env = goodEnv(), code = 'p4w9tdx2', body, headers = {}, path = 'star' } = {}) {
  const waits = [];
  const init = { method, headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headers } };
  if (method === 'POST') init.body = typeof body === 'string' ? body : JSON.stringify(body ?? goodBody());
  return {
    request: new Request(`${ORIGIN}/api/${path}/${encodeURIComponent(code)}`, init),
    env,
    params: { code },
    waitUntil: (p) => waits.push(p),
    waits,
  };
}

// Runs a handler and returns { http, json, text }. Each run gets a FRESH in-memory rate limiter
// unless the test passes its own.
async function run(handler, ctx, deps) {
  const response = await handler(ctx, { now: () => NOW, memoryLimiter: new MemoryRateLimiter(), ...deps });
  await Promise.all(ctx.waits ?? []);
  const text = await response.text();
  return { http: response.status, json: JSON.parse(text), text, response };
}

// What star_public_event answers (CONTRACT-0006 §8.2), plus things that must NOT be passed on.
const okEvent = {
  status: 'ok',
  state: 'open',
  closed_on: null,
  school: { code: 'worcester', name: 'Worcester', id: 'secret-id' },
  event: {
    name: 'November Star Testing',
    testing_date: '2026-11-21',
    start_time: '10:00',
    note: '35 classes for trophy',
    auto_close_on: '2026-11-14',
    where: { name: 'Worcester', address: { street: '123 Main St', city: 'Worcester', state: 'MA', zip: '01608', country: 'US' }, code: 'worcester' },
    id: 'secret-event-id',
  },
  dans: [
    {
      dan: 1, label: '1st Dan', star_limit: 4, standard_cents: 9000, same_day_cents: 10000,
      pass_mark: 245, max_score: 315, private_cents: 15000,
      categories: [{ name: 'Forms', credits: 10, position: 1 }],
    },
  ],
  candidate_count: 12,
};

// The exact GET answer the page gets for okEvent.
const expectedEvent = {
  status: 'ok',
  state: 'open',
  closed_on: null,
  school: { code: 'worcester', name: 'Worcester' },
  event: {
    name: 'November Star Testing',
    testing_date: '2026-11-21',
    start_time: '10:00',
    note: '35 classes for trophy',
    auto_close_on: '2026-11-14',
    where: { name: 'Worcester', address: { street: '123 Main St', city: 'Worcester', state: 'MA', zip: '01608' } },
  },
  dans: [
    {
      dan: 1, label: '1st Dan', star_limit: 4, standard_cents: 9000, same_day_cents: 10000,
      pass_mark: 245, max_score: 315,
      categories: [{ name: 'Forms', credits: 10 }],
    },
  ],
  turnstile_site_key: 'public-site-key',
};

// What star_public_register answers when it saves (CONTRACT-0006 §8.3 ok answer).
const okRegister = {
  status: 'ok',
  reference: 'ST-1042',
  first_name: 'Mia',
  last_name: 'Lopez',
  dan: 1,
  dan_label: '1st Dan',
  stars_from: 2,
  stars_to: 3,
  standard_cents: 9000,
  same_day_cents: 10000,
  paying_by: 'cash',
  event_name: 'November Star Testing',
  testing_date: '2026-11-21',
  start_time: '10:00',
  school_name: 'Worcester',
  where: { name: 'Worcester', address: null },
  submission_id: 'must not be passed on',
  date_of_birth: '2014-05-09',
  email: 'family@example.com',
};

const expectedRegister = {
  status: 'ok',
  reference: 'ST-1042',
  first_name: 'Mia',
  last_name: 'Lopez',
  dan: 1,
  dan_label: '1st Dan',
  stars_from: 2,
  stars_to: 3,
  standard_cents: 9000,
  same_day_cents: 10000,
  paying_by: 'cash',
  event_name: 'November Star Testing',
  testing_date: '2026-11-21',
  start_time: '10:00',
  school_name: 'Worcester',
  where: { name: 'Worcester', address: null },
};

// ---------- no settings at all, and every missing setting -----------------------------------

test('no settings at all → every GET and POST answers not_open, no database connection', async () => {
  for (const env of [{}, undefined, null]) {
    for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
      const db = fakeDb({ event: okEvent, register: okRegister });
      const ts = fakeTurnstile();
      for (const code of ['p4w9tdx2', 'no!', '']) {
        const ctx = context({ method, code });
        ctx.env = env; // set directly: the helper would put good settings in for `undefined`
        const r = await run(handler, ctx, { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl });
        assert.deepEqual(r.json, { status: 'not_open' }, `${method} ${JSON.stringify(env)} ${code}`);
        assert.equal(r.http, 200);
      }
      assert.equal(db.log.opened, 0, 'database must not be opened');
      assert.equal(ts.seen.length, 0, 'Turnstile must not be asked');
    }
  }
});

test('the real [code].js with no settings: GET and POST not_open (the real database is never touched)', async () => {
  const { onRequest } = await import('../api/star/[code].js');
  for (const env of [{}, goodEnv({ STAR_PUBLIC_REGISTRATION: 'off' }), goodEnv({ HYPERDRIVE_STAR: undefined })]) {
    for (const method of ['GET', 'POST']) {
      const response = await onRequest(context({ method, env }));
      assert.deepEqual(await response.json(), { status: 'not_open' });
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  }
  const put = await onRequest({ ...context({ method: 'GET', env: {} }), request: new Request(`${ORIGIN}/api/star/p4w9tdx2`, { method: 'PUT' }) });
  assert.equal(put.status, 400);
  assert.deepEqual(await put.json(), { status: 'bad_request' });
});

test('kill switch: only the exact text "on" turns it on', async () => {
  for (const value of ['off', undefined, 'ON', 'On', ' on', 'true', '1', '']) {
    for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
      const db = fakeDb({ event: okEvent, register: okRegister });
      const r = await run(handler, context({ method, env: goodEnv({ STAR_PUBLIC_REGISTRATION: value }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
      assert.deepEqual(r.json, { status: 'not_open' }, `${method} ${value}`);
      assert.equal(db.log.opened, 0);
    }
  }
});

test('a missing or empty binding or setting → not_open on GET and POST (fail closed)', async () => {
  const breakers = [
    ['HYPERDRIVE_STAR', undefined],
    ['HYPERDRIVE_STAR', {}],
    ['HYPERDRIVE_STAR', { connectionString: 42 }],
    ['HYPERDRIVE_STAR', { connectionString: '' }],
    ['TURNSTILE_SECRET', undefined],
    ['TURNSTILE_SECRET', ''],
    ['CLIENT_KEY_SECRET', undefined],
    ['CLIENT_KEY_SECRET', ''],
    ['PUBLIC_ORIGIN', undefined],
    ['PUBLIC_ORIGIN', ''],
    ['TURNSTILE_SITE_KEY', undefined],
    ['TURNSTILE_SITE_KEY', ''],
  ];
  for (const [name, value] of breakers) {
    const env = goodEnv();
    if (value === undefined) delete env[name];
    else env[name] = value;
    for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
      const db = fakeDb({ event: okEvent, register: okRegister });
      const ts = fakeTurnstile();
      const r = await run(handler, context({ method, env }), { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl });
      assert.deepEqual(r.json, { status: 'not_open' }, `${method} ${name}=${JSON.stringify(value)}`);
      assert.equal(db.log.opened, 0);
      assert.equal(ts.seen.length, 0);
    }
  }
});

test("Color Belt's settings alone never switch Star on (its own switch and binding)", async () => {
  const env = {
    PUBLIC_REGISTRATION: 'on',
    HYPERDRIVE: { connectionString: 'postgres://color-belt' },
    TURNSTILE_SECRET: 's', CLIENT_KEY_SECRET: 'c', PUBLIC_ORIGIN: ORIGIN, TURNSTILE_SITE_KEY: 'k',
  };
  for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
    const db = fakeDb({ event: okEvent, register: okRegister });
    const r = await run(handler, context({ method, env }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'not_open' }, method);
    assert.equal(db.log.opened, 0);
  }
  // Star switched on but only Color Belt's binding present → still not open.
  const r = await run(handleGet, context({ method: 'GET', env: { ...env, STAR_PUBLIC_REGISTRATION: 'on' } }), { openDatabase: fakeDb({ event: okEvent }).openDatabase });
  assert.deepEqual(r.json, { status: 'not_open' });
});

test('a PUBLIC_ORIGIN that is not a web address → POST not_open before Turnstile or the database', async () => {
  const env = goodEnv({ PUBLIC_ORIGIN: 'not a url' });
  const db = fakeDb({ register: okRegister });
  const ts = fakeTurnstile();
  const r = await run(handlePost, context({ env, headers: { Origin: 'not a url' } }), { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl });
  assert.deepEqual(r.json, { status: 'not_open' });
  assert.equal(db.log.opened, 0);
  assert.equal(ts.seen.length, 0);
});

// ---------- GET -----------------------------------------------------------------------------

test('GET: ok → exactly the §8.2 fields + the Turnstile site key, no-store, client closed', async () => {
  const db = fakeDb({ event: okEvent });
  const r = await run(handleGet, context({ method: 'GET', code: 'P4W9TDX2' }), { openDatabase: db.openDatabase });
  assert.equal(r.http, 200);
  assert.deepEqual(r.json, expectedEvent);
  assert.doesNotMatch(r.text, /secret|private_cents|candidate_count|position/);
  assert.equal(r.response.headers.get('Cache-Control'), 'no-store');
  assert.equal(r.response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(r.response.headers.get('Content-Type'), /^application\/json/);
  assert.deepEqual(db.log.calls, [['publicEvent', 'p4w9tdx2']]); // lower-cased
  assert.equal(db.log.closed, 1);
});

test('the school address {street, city, state, zip}: passed on in GET and POST; null stays null; extra keys dropped', async () => {
  const full = { street: '123 Main St', city: 'Worcester', state: 'MA', zip: '01608' };
  const cases = [
    [full, full],
    [{ ...full, country: 'US', id: 'secret', lat: 42.26 }, full],             // extra keys dropped
    [{ street: '9 Elm St', city: null, state: 'MA', zip: 1608 }, { street: '9 Elm St', city: null, state: 'MA', zip: null }], // each key text or null
    [null, null],
    [undefined, null],
    ['123 Main St', null],    // not an object
    [['123 Main St'], null],
  ];
  for (const [fromDb, expected] of cases) {
    const g = await run(handleGet, context({ method: 'GET' }), {
      openDatabase: fakeDb({ event: { ...okEvent, event: { ...okEvent.event, where: { name: 'Worcester', address: fromDb } } } }).openDatabase,
    });
    assert.equal(g.json.status, 'ok');
    assert.deepEqual(g.json.event.where, { name: 'Worcester', address: expected }, `GET ${JSON.stringify(fromDb)}`);
    const p = await run(handlePost, context(), {
      openDatabase: fakeDb({ register: { ...okRegister, where: { name: 'Worcester', address: fromDb } } }).openDatabase,
      fetchImpl: fakeTurnstile().fetchImpl,
    });
    assert.equal(p.json.status, 'ok');
    assert.deepEqual(p.json.where, { name: 'Worcester', address: expected }, `POST ${JSON.stringify(fromDb)}`);
    assert.doesNotMatch(g.text + p.text, /secret|country|lat/);
  }
});

test('GET: the not-open / closed / finished states are passed on with closed_on', async () => {
  for (const [state, closedOn] of [['not_open', null], ['closed', '2026-11-14'], ['closed', null], ['finished', null]]) {
    const db = fakeDb({ event: { ...okEvent, state, closed_on: closedOn } });
    const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: db.openDatabase });
    assert.equal(r.json.status, 'ok');
    assert.equal(r.json.state, state);
    assert.equal(r.json.closed_on, closedOn);
  }
});

test('GET: unknown code → not_found; an unexpected answer or shape → unavailable', async () => {
  const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ event: { status: 'not_found' } }).openDatabase });
  assert.deepEqual(r.json, { status: 'not_found' });
  for (const odd of [
    { status: 'something_new' },
    null,
    { ...okEvent, state: 'half_open' },
    { ...okEvent, event: null },
    { ...okEvent, dans: 'none' },
  ]) {
    const r2 = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ event: odd }).openDatabase });
    assert.deepEqual(r2.json, { status: 'unavailable' }, JSON.stringify(odd));
  }
});

test('GET: database error → unavailable, no error text leaked, client closed', async () => {
  const db = fakeDb({ event: () => { throw new Error('password authentication failed for user star_registrar'); } });
  const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: db.openDatabase });
  assert.deepEqual(r.json, { status: 'unavailable' });
  assert.doesNotMatch(r.text, /password|star_registrar/);
  assert.equal(db.log.closed, 1);
});

test('the database is opened with the Star settings (HYPERDRIVE_STAR), never anything else', async () => {
  const db = fakeDb({ event: okEvent, register: okRegister });
  const env = goodEnv();
  await run(handleGet, context({ method: 'GET', env }), { openDatabase: db.openDatabase });
  await run(handlePost, context({ env }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(db.log.opened, 2);
  assert.ok(db.log.envs.every((e) => e === env));
});

// ---------- the code pattern ----------------------------------------------------------------

test('codes that cannot exist → not_found, no rate-limit allowance used, no database', async () => {
  const malformed = [
    'p4w9tdk',    // 7 characters
    'p4w9tdkmm',  // 9 characters
    'p4w9tdk1',   // 1 is never used
    'p4w9tdk0',   // 0 is never used
    'p4w9tdki',   // i is never used
    'p4w9tdkl',   // l is never used
    'p4w9tdko',   // o is never used
    'p4w9-dkm',   // not a letter or digit
    "x'; drop--", // not a code at all
    '',
  ];
  for (const code of malformed) {
    for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
      const db = fakeDb({ event: okEvent, register: okRegister });
      const ts = fakeTurnstile();
      const memoryLimiter = new MemoryRateLimiter({ limit: 1 });
      const r = await run(handler, context({ method, code }), { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl, memoryLimiter });
      assert.deepEqual(r.json, { status: 'not_found' }, `${method} ${code}`);
      assert.equal(db.log.opened, 0, `${method} ${code}: database must not be opened`);
      assert.equal(ts.seen.length, 0);
      // The one request this client is allowed is still unused: a real code gets through.
      const ok = await run(handler, context({ method }), { openDatabase: fakeDb({ event: okEvent, register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl, memoryLimiter });
      assert.equal(ok.json.status, 'ok', `${method} ${code}: allowance must not be used`);
    }
  }
  // Real-looking codes reach the database (lower-cased).
  for (const code of ['p4w9tdkm', 'P4W9TDX2', 'abcdefgh', '23456789']) {
    const db = fakeDb({ event: okEvent });
    const r = await run(handleGet, context({ method: 'GET', code }), { openDatabase: db.openDatabase });
    assert.equal(r.json.status, 'ok', code);
    assert.deepEqual(db.log.calls, [['publicEvent', code.toLowerCase()]]);
  }
});

// ---------- POST: the checks before Turnstile -----------------------------------------------

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

test('POST: wrong or missing Origin → bad_request (HTTP 400)', async () => {
  await expectRefused(context({ headers: { Origin: 'https://evil.example' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { Origin: 'https://tkd-dashboard.pages.dev.evil.example' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { Origin: 'http://tkd-dashboard.pages.dev' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { Origin: '' } }), { status: 'bad_request' });
});

test('POST: wrong Content-Type → bad_request; a charset parameter is fine', async () => {
  await expectRefused(context({ headers: { 'Content-Type': 'text/plain' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { 'Content-Type': 'multipart/form-data' } }), { status: 'bad_request' });
  const r = await run(handlePost, context({ headers: { 'Content-Type': 'application/json; charset=utf-8' } }), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.json.status, 'ok');
});

test('POST: body over 100 KB → bad_request (declared size and real size); just under is fine', async () => {
  const big = JSON.stringify(goodBody({ signature: 'data:image/png;base64,' + 'A'.repeat(110 * 1024) }));
  await expectRefused(context({ body: big }), { status: 'bad_request' });
  // A lying Content-Length: the stream is still counted while reading.
  await expectRefused(context({ body: big, headers: { 'Content-Length': '100' } }), { status: 'bad_request' });
  // One byte over the limit.
  const base = JSON.stringify(goodBody({ signature: '' }));
  const over = JSON.stringify(goodBody({ signature: 'A'.repeat(100 * 1024 - base.length + 1) }));
  assert.equal(new TextEncoder().encode(over).length, 100 * 1024 + 1);
  await expectRefused(context({ body: over }), { status: 'bad_request' });
  // A real-sized signature (70 000 characters) goes through.
  const db = fakeDb({ register: okRegister });
  const r = await run(handlePost, context({ body: goodBody({ signature: SIGNATURE + 'A'.repeat(69_900) }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.json.status, 'ok');
});

test('POST: not JSON / not an object → bad_request', async () => {
  await expectRefused(context({ body: '{not json' }), { status: 'bad_request' });
  await expectRefused(context({ body: '[1,2,3]' }), { status: 'bad_request' });
  await expectRefused(context({ body: 'null' }), { status: 'bad_request' });
  await expectRefused(context({ body: '"text"' }), { status: 'bad_request' });
});

test('POST: honeypot filled in → bad_request', async () => {
  await expectRefused(context({ body: goodBody({ website: 'http://spam.example' }) }), { status: 'bad_request' });
  await expectRefused(context({ body: goodBody({ website: 0 }) }), { status: 'bad_request' });
  // Left out completely is fine (it's empty).
  const body = goodBody();
  delete body.website;
  const r = await run(handlePost, context({ body }), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.json.status, 'ok');
});

test('POST: sent in under 4 seconds (or no times) → bad_request; exactly 4 seconds is fine', async () => {
  await expectRefused(context({ body: goodBody({ started_at: 1_000_000, sent_at: 1_003_999 }) }), { status: 'bad_request' });
  await expectRefused(context({ body: goodBody({ started_at: 1_000_000, sent_at: 990_000 }) }), { status: 'bad_request' });
  await expectRefused(context({ body: goodBody({ started_at: undefined }) }), { status: 'bad_request' });
  await expectRefused(context({ body: goodBody({ sent_at: '1060000' }) }), { status: 'bad_request' });
  const r = await run(handlePost, context({ body: goodBody({ started_at: 1_000_000, sent_at: 1_004_000 }) }), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.json.status, 'ok');
});

test('POST: fields of the wrong type → bad_request', async () => {
  for (const bad of [
    { submission_id: 'not-a-uuid' },
    { submission_id: undefined },
    { first_name: null },
    { last_name: 'x'.repeat(201) },
    { date_of_birth: undefined },
    { date_of_birth: '05/09/2014' },
    { date_of_birth: '2014-02-30' },
    { date_of_birth: '2014-13-01' },
    { date_of_birth: 20140509 },
    { email: undefined },
    { email: 'x'.repeat(321) },
    { dan: '1' },
    { dan: 1.5 },
    { dan: -1 },
    { dan: 100 },
    { stars_from: null },
    { stars_from: 2 ** 40 },
    { paying_by: 1 },
    { acknowledged: 'true' },
    { acknowledged: undefined },
    { signature: 'x'.repeat(70001) },
    { ack_version: undefined },
  ]) {
    await expectRefused(context({ body: goodBody(bad) }), { status: 'bad_request' });
  }
});

test('POST: submission_id must be text — an array holding a UUID is refused (no crash)', async () => {
  for (const id of [[SUBMISSION_ID], { id: SUBMISSION_ID }, 42, null]) {
    await expectRefused(context({ body: goodBody({ submission_id: id }) }), { status: 'bad_request' });
  }
});

test('POST: the signature must be a PNG data address (data:image/png;base64,iVBORw0KGgo…)', async () => {
  for (const signature of [
    '',
    'not a picture',
    'data:image/jpeg;base64,/9j/4AAQ',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,AAAA',           // PNG type, but not PNG bytes
    'DATA:IMAGE/PNG;BASE64,iVBORw0KGgo=',   // wrong case
    ' data:image/png;base64,iVBORw0KGgo=',  // leading space
    ['data:image/png;base64,iVBORw0KGgo='],
  ]) {
    await expectRefused(context({ body: goodBody({ signature }) }), { status: 'bad_request' });
  }
  const db = fakeDb({ register: okRegister });
  const r = await run(handlePost, context({ body: goodBody({ signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.json.status, 'ok');
});

// ---------- POST: Turnstile -----------------------------------------------------------------

test('POST: Turnstile no / wrong host / wrong action (incl. Color Belt\'s "register") / unreachable / no token → verify_failed', async () => {
  const cases = [
    { success: false, hostname: 'tkd-dashboard.pages.dev', action: 'star_register' },
    { success: true, hostname: 'evil.example', action: 'star_register' },
    { success: true, hostname: 'localhost', action: 'star_register' },
    { success: true, hostname: 'tkd-dashboard.pages.dev', action: 'register' }, // a Color Belt token
    { success: true, hostname: 'tkd-dashboard.pages.dev', action: 'form' },     // a Forms token
    { success: true, hostname: 'tkd-dashboard.pages.dev', action: '' },
    { success: true, hostname: 'tkd-dashboard.pages.dev' },
    { success: true },
    new Error('network down'),
  ];
  for (const result of cases) {
    const db = fakeDb({ register: okRegister });
    const ts = fakeTurnstile(result);
    const r = await run(handlePost, context(), { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl });
    assert.deepEqual(r.json, { status: 'verify_failed' }, JSON.stringify(result));
    assert.equal(db.log.opened, 0);
  }
  for (const token of ['', undefined, 42, 'x'.repeat(2049)]) {
    const db = fakeDb({ register: okRegister });
    const r = await run(handlePost, context({ body: goodBody({ turnstile_token: token }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'verify_failed' });
    assert.equal(db.log.opened, 0);
  }
});

test('POST: the host Turnstile must name comes from PUBLIC_ORIGIN', async () => {
  const env = goodEnv({ PUBLIC_ORIGIN: 'https://school.example' });
  const headers = { Origin: 'https://school.example' };
  const good = await run(handlePost, context({ env, headers }), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile({ success: true, hostname: 'school.example', action: 'star_register' }).fetchImpl });
  assert.equal(good.json.status, 'ok');
  const bad = await run(handlePost, context({ env, headers }), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(bad.json, { status: 'verify_failed' });
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

test('turnstile.js: Star action "star_register"; left out it is still "register" (Color Belt unchanged)', async () => {
  assert.equal(STAR_TURNSTILE_ACTION, 'star_register');
  assert.equal(TURNSTILE_ACTION, 'register');
  const answer = (action) => async () => new Response(JSON.stringify({ success: true, hostname: 'h', action }), { status: 200 });
  const base = { secret: 's', token: 't', ip: '1.2.3.4', expectedHost: 'h' };
  // Default (what Color Belt's register.js calls): only "register" passes.
  assert.equal(await verifyTurnstile({ ...base, fetchImpl: answer('register') }), true);
  assert.equal(await verifyTurnstile({ ...base, fetchImpl: answer('star_register') }), false);
  // Star's call: only "star_register" passes.
  assert.equal(await verifyTurnstile({ ...base, fetchImpl: answer('star_register'), expectedAction: 'star_register' }), true);
  assert.equal(await verifyTurnstile({ ...base, fetchImpl: answer('register'), expectedAction: 'star_register' }), false);
  // An empty or odd expected action never matches (fail closed), even an empty token action.
  for (const expectedAction of ['', null, 0]) {
    assert.equal(await verifyTurnstile({ ...base, fetchImpl: answer(''), expectedAction }), false);
  }
  // A non-200 answer is a no.
  assert.equal(await verifyTurnstile({ ...base, fetchImpl: async () => new Response('oops', { status: 500 }), expectedAction: 'star_register' }), false);
});

test("Color Belt's Function still refuses a Star token (and accepts its own)", async () => {
  const cbEnv = {
    PUBLIC_REGISTRATION: 'on', HYPERDRIVE: { connectionString: 'postgres://fake' },
    TURNSTILE_SECRET: 's', CLIENT_KEY_SECRET: 'c', PUBLIC_ORIGIN: ORIGIN, TURNSTILE_SITE_KEY: 'k',
  };
  const cbBody = {
    submission_id: SUBMISSION_ID, first_name: 'Mia', last_name: 'Lopez', event_rank_id: SUBMISSION_ID,
    paying_by: 'cash', stripes: true, signature: SIGNATURE, ack_version: 'cb-2026-10-17',
    website: '', started_at: 1_000_000, sent_at: 1_060_000, turnstile_token: 't',
  };
  const cbRegister = { status: 'ok', reference: 'CB-1' };
  const star = await run(colorBelt.handlePost, context({ env: cbEnv, body: cbBody, path: 'register' }), { openDatabase: fakeDb({ register: cbRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(star.json, { status: 'verify_failed' });
  const own = await run(colorBelt.handlePost, context({ env: cbEnv, body: cbBody, path: 'register' }), { openDatabase: fakeDb({ register: cbRegister }).openDatabase, fetchImpl: fakeTurnstile({ success: true, hostname: 'tkd-dashboard.pages.dev', action: 'register' }).fetchImpl });
  assert.equal(own.json.status, 'ok');
});

// ---------- POST: the database --------------------------------------------------------------

test('POST: ok → exactly the §8.3 public answer; typed values passed in order; client key is not the IP', async () => {
  const db = fakeDb({ register: okRegister });
  const r = await run(handlePost, context({ code: 'P4W9TDX2', body: goodBody({ submission_id: SUBMISSION_ID.toUpperCase() }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.http, 200);
  assert.deepEqual(r.json, expectedRegister);
  assert.doesNotMatch(r.text, /must not|2014-05-09|family@example\.com|data:image/);
  const [name, args] = db.log.calls[0];
  assert.equal(name, 'publicRegister');
  assert.deepEqual(Object.keys(args), ['code', 'clientKey', 'submissionId', 'first', 'last', 'dateOfBirth', 'email', 'dan', 'starsFrom', 'payingBy', 'acknowledged', 'signature', 'ackVersion']);
  assert.equal(args.code, 'p4w9tdx2');
  assert.equal(args.submissionId, SUBMISSION_ID); // lower-cased
  assert.equal(args.first, 'Mia');
  assert.equal(args.last, 'Lopez');
  assert.equal(args.dateOfBirth, '2014-05-09');
  assert.equal(args.email, 'family@example.com');
  assert.equal(args.dan, 1);
  assert.equal(args.starsFrom, 2);
  assert.equal(args.payingBy, 'cash');
  assert.equal(args.acknowledged, true);
  assert.equal(args.signature, SIGNATURE);
  assert.equal(args.ackVersion, 'st-2026-10-18');
  assert.match(args.clientKey, /^[0-9a-f]{64}$/);
  assert.ok(!args.clientKey.includes('203.0.113.7'));
  assert.equal(db.log.closed, 1, 'client closed through waitUntil');
});

test('POST: acknowledged false and other rule breaks go to the database, which answers invalid', async () => {
  const db = fakeDb({ register: { status: 'invalid' } });
  const r = await run(handlePost, context({ body: goodBody({ acknowledged: false, ack_version: 'old-label', paying_by: 'card' }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(r.json, { status: 'invalid' });
  assert.equal(db.log.calls[0][1].acknowledged, false);
});

test('POST: every §8.3 database status is mapped (and only known ones pass)', async () => {
  const cases = [
    [{ status: 'not_found' }, { status: 'not_found' }],
    [{ status: 'not_open' }, { status: 'not_open' }],
    [{ status: 'closed', closed_on: '2026-11-14' }, { status: 'closed', closed_on: '2026-11-14' }],
    [{ status: 'closed', closed_on: null }, { status: 'closed', closed_on: null }],
    [{ status: 'closed' }, { status: 'closed', closed_on: null }],
    [{ status: 'finished' }, { status: 'finished' }],
    [{ status: 'rate_limited' }, { status: 'rate_limited' }],
    [{ status: 'invalid', detail: 'first name too long' }, { status: 'invalid' }],
    [okRegister, expectedRegister],
    [{ status: 'no_access' }, { status: 'unavailable' }],
    [{ status: 'stale' }, { status: 'unavailable' }],
    [{ status: 'duplicate_name' }, { status: 'unavailable' }],
    [{ status: 'OK' }, { status: 'unavailable' }],
    [{}, { status: 'unavailable' }],
    [null, { status: 'unavailable' }],
    [undefined, { status: 'unavailable' }],
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
      throw new Error('duplicate key value violates unique constraint; Key (first_name)=(Mia) 2014-05-09 family@example.com data:image/png;base64');
    },
  });
  const logged = [];
  const original = console.log;
  console.log = (...parts) => logged.push(parts.join(' '));
  try {
    const r = await run(handlePost, context(), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'unavailable' });
    assert.doesNotMatch(r.text, /Mia|duplicate|data:image|2014|example\.com/);
  } finally {
    console.log = original;
  }
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0], /Mia|Lopez|data:image|203\.0\.113\.7|duplicate|2014|example\.com/);
  const line = JSON.parse(logged[0]);
  assert.deepEqual(Object.keys(line).sort(), ['fn', 'method', 'ms', 'status']);
  assert.equal(line.fn, 'star_register');
  assert.equal(db.log.closed, 1);
});

test('POST: opening the database itself fails → unavailable', async () => {
  const r = await run(handlePost, context(), {
    openDatabase: () => { throw new Error('connect ECONNREFUSED star_registrar@pooler'); },
    fetchImpl: fakeTurnstile().fetchImpl,
  });
  assert.deepEqual(r.json, { status: 'unavailable' });
  assert.doesNotMatch(r.text, /ECONNREFUSED|star_registrar/);
});

test('database "permission denied" (the SETUP §13g off switch) → unavailable, no text', async () => {
  const denied = () => {
    throw Object.assign(new Error('permission denied for function star_public_register'), { code: '42501' });
  };
  const g = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ event: denied }).openDatabase });
  assert.deepEqual(g.json, { status: 'unavailable' });
  assert.doesNotMatch(g.text, /permission|star_public/);
  const p = await run(handlePost, context(), { openDatabase: fakeDb({ register: denied }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(p.json, { status: 'unavailable' });
  assert.doesNotMatch(p.text, /permission|star_public/);
});

test('other methods → bad_request', async () => {
  const response = handleOther();
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { status: 'bad_request' });
});

// ---------- rate limit before the connection ------------------------------------------------

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

test('rate limit (Cloudflare binding): blocks after the limit, before Turnstile and the database', async () => {
  const binding = fakeRateLimiter(2);
  const env = goodEnv({ RATE_LIMITER: binding });
  const memoryLimiter = new MemoryRateLimiter({ limit: 0 }); // would block everything — must not be used
  for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
    for (let i = 0; i < 2; i += 1) {
      const r = await run(handler, context({ method, env }), { openDatabase: fakeDb({ event: okEvent, register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl, memoryLimiter });
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
  assert.match(binding.seen[0], /^[0-9a-f]{64}:GET$/);
  assert.match(binding.seen.at(-1), /^[0-9a-f]{64}:POST$/);
  assert.ok(binding.seen.every((key) => !key.includes('203.0.113.7')));
});

test('rate limit (no binding): the in-memory counter blocks GET and POST separately, before the database', async () => {
  const memoryLimiter = new MemoryRateLimiter({ limit: 3 });
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ event: okEvent }).openDatabase, memoryLimiter })).json.status, 'ok');
  }
  const db = fakeDb({ event: okEvent });
  const blocked = await run(handleGet, context({ method: 'GET' }), { openDatabase: db.openDatabase, memoryLimiter });
  assert.deepEqual(blocked.json, { status: 'rate_limited' });
  assert.equal(db.log.opened, 0);
  // POSTs from the same connection have their own count.
  for (let i = 0; i < 3; i += 1) {
    const post = await run(handlePost, context(), { openDatabase: fakeDb({ register: okRegister }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl, memoryLimiter });
    assert.equal(post.json.status, 'ok');
  }
  const postDb = fakeDb({ register: okRegister });
  const ts = fakeTurnstile();
  const postBlocked = await run(handlePost, context(), { openDatabase: postDb.openDatabase, fetchImpl: ts.fetchImpl, memoryLimiter });
  assert.deepEqual(postBlocked.json, { status: 'rate_limited' });
  assert.equal(postDb.log.opened, 0);
  assert.equal(ts.seen.length, 0);
  // A different connection still gets through.
  const other = await run(handleGet, context({ method: 'GET', headers: { 'CF-Connecting-IP': '198.51.100.9' } }), { openDatabase: fakeDb({ event: okEvent }).openDatabase, memoryLimiter });
  assert.equal(other.json.status, 'ok');
});

test('a request without CF-Connecting-IP (not through Cloudflare) → bad_request, no database', async () => {
  for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
    const db = fakeDb({ event: okEvent, register: okRegister });
    const r = await run(handler, context({ method, headers: { 'CF-Connecting-IP': '' } }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'bad_request' });
    assert.equal(db.log.opened, 0);
  }
});

test('anything unplanned that throws → unavailable, with no details', async () => {
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

// ---------- the client key: the same as Color Belt's (shared 20-an-hour limit, §8.3) -------

test("client key: identical to Color Belt's for the same request (same secret, IP and day)", async () => {
  const sharedSecret = 'the-one-client-key-secret';
  const cbEnv = {
    PUBLIC_REGISTRATION: 'on', HYPERDRIVE: { connectionString: 'postgres://fake' },
    TURNSTILE_SECRET: 's', CLIENT_KEY_SECRET: sharedSecret, PUBLIC_ORIGIN: ORIGIN, TURNSTILE_SITE_KEY: 'k',
  };
  const cbBody = {
    submission_id: SUBMISSION_ID, first_name: 'Mia', last_name: 'Lopez', event_rank_id: SUBMISSION_ID,
    paying_by: 'cash', stripes: true, signature: SIGNATURE, ack_version: 'cb-2026-10-17',
    website: '', started_at: 1_000_000, sent_at: 1_060_000, turnstile_token: 't',
  };
  for (const ip of ['203.0.113.7', '2001:db8:0:12::1', '::ffff:198.51.100.9']) {
    const headers = { 'CF-Connecting-IP': ip };
    const cbDb = fakeDb({ register: { status: 'ok' } });
    await run(colorBelt.handlePost, context({ env: cbEnv, body: cbBody, headers, path: 'register' }), {
      openDatabase: cbDb.openDatabase,
      fetchImpl: fakeTurnstile({ success: true, hostname: 'tkd-dashboard.pages.dev', action: 'register' }).fetchImpl,
    });
    const starDb = fakeDb({ register: okRegister });
    await run(handlePost, context({ env: goodEnv({ CLIENT_KEY_SECRET: sharedSecret }), headers }), {
      openDatabase: starDb.openDatabase,
      fetchImpl: fakeTurnstile().fetchImpl,
    });
    const cbKey = cbDb.log.calls[0][1].clientKey;
    const starKey = starDb.log.calls[0][1].clientKey;
    assert.match(starKey, /^[0-9a-f]{64}$/);
    assert.equal(starKey, cbKey, ip);
    assert.equal(starKey, await makeClientKey(sharedSecret, ip, new Date(NOW)));
  }
  // A different secret gives a different key (so CLIENT_KEY_SECRET must be the same one).
  const otherDb = fakeDb({ register: okRegister });
  await run(handlePost, context({ env: goodEnv({ CLIENT_KEY_SECRET: 'another-secret' }) }), { openDatabase: otherDb.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.notEqual(otherDb.log.calls[0][1].clientKey, await makeClientKey(sharedSecret, '203.0.113.7', new Date(NOW)));
});

// ---------- starDb.js: only the two SQL calls, typed, prepare: false ------------------------

test('starDb.js: only star_public_event and star_public_register, typed parameters, prepare: false, HYPERDRIVE_STAR', async () => {
  const source = await readFile(new URL('../_lib/starDb.js', import.meta.url), 'utf8');
  // The code without its comments (so the explanations don't count).
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
  const queries = [...code.matchAll(/sql`([\s\S]*?)`/g)].map((m) => m[1]);
  assert.equal(queries.length, 2, 'exactly two SQL calls');
  assert.match(queries[0], /^select public\.star_public_event\(\$\{code\}::text\) as answer$/);
  const params = [...queries[1].matchAll(/\$\{args\.(\w+)\}::(\w+)/g)].map((m) => `${m[1]}::${m[2]}`);
  assert.deepEqual(params, [
    'code::text', 'clientKey::text', 'submissionId::uuid', 'first::text', 'last::text',
    'dateOfBirth::date', 'email::text', 'dan::integer', 'starsFrom::integer', 'payingBy::text',
    'acknowledged::boolean', 'signature::text', 'ackVersion::text',
  ]);
  assert.match(queries[1], /select public\.star_public_register\(/);
  assert.equal((queries[1].match(/\$\{/g) ?? []).length, 13, 'no other values in the call');
  assert.match(code, /prepare: false/);
  assert.match(code, /env\.HYPERDRIVE_STAR\.connectionString/);
  assert.doesNotMatch(code, /env\.HYPERDRIVE\./);
  assert.doesNotMatch(code, /\.unsafe|\.file\(|testing_public/);
});
