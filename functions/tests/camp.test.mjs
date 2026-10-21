// camp.test.mjs — tests for the public camp sign-up Function (contract 0013 §4.8).
// Why it exists: the Function is a signed-out way into the database, so every check it makes
// is proven here before it goes anywhere near Cloudflare. Same style as register.test.mjs.
// How to run (from the project folder):   node --test functions/tests/
//
// Nothing real is used: a FAKE database (records what it was asked and answers what each test
// says) and a FAKE Turnstile (a pretend fetch that answers like Cloudflare's siteverify).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleGet, handlePost, handleOther, CAMP_TURNSTILE_ACTION } from '../_lib/camp.js';
import { MemoryRateLimiter } from '../_lib/rateLimit.js';
import { verifyTurnstile } from '../_lib/turnstile.js';

// ---------- helpers -------------------------------------------------------------------------

const ORIGIN = 'https://tkd-dashboard.pages.dev';
const SUBMISSION_ID = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
const DAY_1 = '11111111-1111-4111-8111-111111111111';
const DAY_2 = '22222222-2222-4222-8222-222222222222';
const EXTRA_1 = '33333333-3333-4333-8333-333333333333';
const EXTRA_2 = '44444444-4444-4444-8444-444444444444';
const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo=';

// A complete, correct set of settings. Tests remove or change one thing at a time.
function goodEnv(overrides = {}) {
  return {
    CAMPS_REGISTRATION: 'on',
    HYPERDRIVE_CAMPS: { connectionString: 'postgres://fake' },
    TURNSTILE_SECRET: 'turnstile-secret-for-tests',
    CLIENT_KEY_SECRET: 'client-key-secret-for-tests',
    PUBLIC_ORIGIN: ORIGIN,
    TURNSTILE_SITE_KEY: 'public-site-key',
    ...overrides,
  };
}

// A fake database: `camp` / `signup` = what publicCamp / publicSignup return (or a function).
function fakeDb({ camp, signup } = {}) {
  const log = { opened: 0, calls: [], closed: 0 };
  const openDatabase = () => {
    log.opened += 1;
    return {
      async publicCamp(code) {
        log.calls.push(['publicCamp', code]);
        return typeof camp === 'function' ? camp(code) : camp;
      },
      async publicSignup(args) {
        log.calls.push(['publicSignup', args]);
        return typeof signup === 'function' ? signup(args) : signup;
      },
      async close() {
        log.closed += 1;
      },
    };
  };
  return { openDatabase, log };
}

// A fake fetch that answers like Turnstile's siteverify (for the camp form by default).
function fakeTurnstile(result = { success: true, hostname: 'tkd-dashboard.pages.dev', action: 'camp_signup' }) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: String(init.body) });
    if (result instanceof Error) throw result;
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchImpl, seen };
}

const goodChild = (overrides = {}) => ({
  first_name: 'Mia',
  last_name: 'Rossi',
  age: 9,
  member: false,
  day_ids: [DAY_1, DAY_2],
  extras: [{ extra_id: EXTRA_1, day_ids: [DAY_1, DAY_2] }],
  ...overrides,
});

// The body a real page sends.
function goodBody(overrides = {}) {
  return {
    submission_id: SUBMISSION_ID,
    children: [goodChild()],
    parent: { name: 'Laura Rossi', phone: '5085550142', relation: 'Mother' },
    emergency: { name: 'Paul Rossi', phone: '5085550187', relation: 'Uncle' },
    paying_by: 'cash',
    acknowledged: true,
    signature: SIGNATURE,
    ack_version: 'camp-2026-10-18',
    waiver_version: '0123456789abcdef0123456789abcdef',
    expected_total_cents: 16600,
    website: '',
    started_at: 1_000_000,
    sent_at: 1_060_000,
    turnstile_token: 'token-from-the-page',
    ...overrides,
  };
}

// A Pages-style context: request + env + params + waitUntil (which collects promises).
function context({ method = 'POST', env = goodEnv(), code = 'k7m2qpxz', body, headers = {} } = {}) {
  const waits = [];
  const init = { method, headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headers } };
  if (method === 'POST') init.body = typeof body === 'string' ? body : JSON.stringify(body ?? goodBody());
  return {
    request: new Request(`${ORIGIN}/api/camp/${code}`, init),
    env,
    params: { code },
    waitUntil: (p) => waits.push(p),
    waits,
  };
}

// Runs a handler with a FRESH in-memory rate limiter (unless the test passes its own).
async function run(handler, ctx, deps) {
  const response = await handler(ctx, { now: () => 1_700_000_000_000, memoryLimiter: new MemoryRateLimiter(), ...deps });
  await Promise.all(ctx.waits ?? []);
  const text = await response.text();
  return { http: response.status, json: JSON.parse(text), text, response };
}

// What camp_public_camp answers — with extra fields at every level that must NOT reach the page.
const dbCamp = {
  status: 'ok',
  state: 'open',
  opens_on: '2026-10-01',
  closed_on: null,
  price_kind_today: 'early',
  ack_version: 'camp-2026-10-18',
  waiver_version: '0123456789abcdef0123456789abcdef',
  secret_extra: 'top level — must be dropped',
  camp: {
    name: 'Thanksgiving Camp',
    days: [{ day_id: DAY_1, day: '2026-11-25', camper_count: 12 }, { day_id: DAY_2, day: '2026-11-27' }],
    start_time: '09:00',
    end_time: '15:00',
    both_schools: false,
    school_name: 'Worcester',
    address: { street: '1 Main St', city: 'Worcester', state: 'MA', zip: '01608', phone: 'drop me' },
    description: 'Two days of Taekwondo.',
    waiver_text: 'I give permission…',
    early_until: '2026-11-18',
    signup_closes_on: '2026-11-24',
    min_age: 5,
    max_age: 12,
    prices: [{ day_count: 1, member_early_cents: 7500, member_regular_cents: 8000, nonmember_early_cents: 8500, nonmember_regular_cents: 9000, id: 'drop' }],
    extras: [{ extra_id: EXTRA_1, name: 'Late pick-up', price_cents: 800, per: 'day', not_for_all_days: false, only_on: [], sort: 0, camp_id: 'drop' },
      { extra_id: EXTRA_2, name: 'Pizza party', price_cents: 500, per: 'day', not_for_all_days: true, only_on: ['2026-11-27'], camp_id: 'drop' }],
    id: 'camp id — must be dropped',
    public_code: 'drop',
    version: 7,
    campers: ['drop'],
  },
};

// The exact §4.6 GET answer for dbCamp.
const expectedGet = {
  status: 'ok',
  state: 'open',
  opens_on: '2026-10-01',
  closed_on: null,
  price_kind_today: 'early',
  ack_version: 'camp-2026-10-18',
  waiver_version: '0123456789abcdef0123456789abcdef',
  camp: {
    name: 'Thanksgiving Camp',
    start_time: '09:00',
    end_time: '15:00',
    both_schools: false,
    school_name: 'Worcester',
    description: 'Two days of Taekwondo.',
    waiver_text: 'I give permission…',
    early_until: '2026-11-18',
    signup_closes_on: '2026-11-24',
    min_age: 5,
    max_age: 12,
    days: [{ day_id: DAY_1, day: '2026-11-25' }, { day_id: DAY_2, day: '2026-11-27' }],
    address: { street: '1 Main St', city: 'Worcester', state: 'MA', zip: '01608' },
    prices: [{ day_count: 1, member_early_cents: 7500, member_regular_cents: 8000, nonmember_early_cents: 8500, nonmember_regular_cents: 9000 }],
    extras: [{ extra_id: EXTRA_1, name: 'Late pick-up', price_cents: 800, per: 'day', not_for_all_days: false, only_on: [] },
      { extra_id: EXTRA_2, name: 'Pizza party', price_cents: 500, per: 'day', not_for_all_days: true, only_on: ['2026-11-27'] }],
  },
};

const dbSignupOk = {
  status: 'ok',
  reference: 'CP-4821',
  paying_by: 'cash',
  family_total_cents: 16600,
  submission_id: 'must not be passed on',
  signup_id: 'must not be passed on',
  children: [{
    first_name: 'Mia', last_name: 'Rossi', day_count: 2, days: ['2026-11-25', '2026-11-27'], price_kind: 'early',
    base_cents: 15000, extras: [{ name: 'Late pick-up', per: 'day', count: 2, cents: 1600, extra_id: 'drop' }],
    total_cents: 16600, camper_id: 'drop', age: 9,
  }],
  camp: {
    name: 'Thanksgiving Camp', days: [{ day_id: DAY_1, day: '2026-11-25' }], start_time: '09:00', end_time: '15:00',
    school_name: 'Worcester', both_schools: false, address: null, description: 'Two days.', waiver_text: 'drop', id: 'drop',
  },
};

// ---------- GET -----------------------------------------------------------------------------

test('GET: kill switch off → not_open (no opens_on), database never opened', async () => {
  for (const value of ['off', undefined, 'ON', '']) {
    const db = fakeDb({ camp: dbCamp });
    const r = await run(handleGet, context({ method: 'GET', env: goodEnv({ CAMPS_REGISTRATION: value }) }), { openDatabase: db.openDatabase });
    assert.deepEqual(r.json, { status: 'not_open' });
    assert.equal(db.log.opened, 0);
  }
  // Color Belt's switch does not open Camps.
  const db = fakeDb({ camp: dbCamp });
  const env = goodEnv({ CAMPS_REGISTRATION: undefined, PUBLIC_REGISTRATION: 'on' });
  const r = await run(handleGet, context({ method: 'GET', env }), { openDatabase: db.openDatabase });
  assert.deepEqual(r.json, { status: 'not_open' });
});

test('GET: a missing binding or setting → not_open (fail closed)', async () => {
  for (const missing of ['HYPERDRIVE_CAMPS', 'TURNSTILE_SECRET', 'CLIENT_KEY_SECRET', 'PUBLIC_ORIGIN', 'TURNSTILE_SITE_KEY']) {
    const env = goodEnv();
    delete env[missing];
    const db = fakeDb({ camp: dbCamp });
    const r = await run(handleGet, context({ method: 'GET', env }), { openDatabase: db.openDatabase });
    assert.deepEqual(r.json, { status: 'not_open' }, missing);
    assert.equal(db.log.opened, 0);
  }
  // Color Belt's HYPERDRIVE binding is not Camps' binding.
  const env = goodEnv({ HYPERDRIVE_CAMPS: undefined, HYPERDRIVE: { connectionString: 'postgres://cb' } });
  const r = await run(handleGet, context({ method: 'GET', env }), { openDatabase: fakeDb({ camp: dbCamp }).openDatabase });
  assert.deepEqual(r.json, { status: 'not_open' });
});

test('GET: ok → exactly the §4.6 allowlist + the site key (extra fields at every level dropped)', async () => {
  const db = fakeDb({ camp: dbCamp });
  const r = await run(handleGet, context({ method: 'GET', code: 'K7M2QPXZ' }), { openDatabase: db.openDatabase });
  assert.equal(r.http, 200);
  assert.deepEqual(r.json, { ...expectedGet, turnstile_site_key: 'public-site-key' });
  assert.equal(r.response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(db.log.calls, [['publicCamp', 'k7m2qpxz']]); // lower-cased
  assert.equal(db.log.closed, 1);
});

test('GET: every state is passed on (closed by hand: closed_on null)', async () => {
  for (const state of ['not_open_yet', 'closed', 'finished']) {
    const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ camp: { ...dbCamp, state } }).openDatabase });
    assert.equal(r.json.state, state);
    assert.equal(r.json.closed_on, null);
  }
  const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ camp: { ...dbCamp, state: 'closed', closed_on: '2026-11-24' } }).openDatabase });
  assert.equal(r.json.closed_on, '2026-11-24');
});

test('GET: unknown / malformed code → not_found; malformed never reaches limiter or database', async () => {
  const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ camp: { status: 'not_found' } }).openDatabase });
  assert.deepEqual(r.json, { status: 'not_found' });
  for (const code of ['k7m2qp', 'k7m2qpxzz', 'k7m2qpx1', 'k7m2qpx0', 'k7m2qpxi', 'k7m2qpxl', 'k7m2qpxo', "x'; drop--"]) {
    const db = fakeDb({ camp: dbCamp });
    const memoryLimiter = new MemoryRateLimiter({ limit: 1 });
    const bad = await run(handleGet, context({ method: 'GET', code }), { openDatabase: db.openDatabase, memoryLimiter });
    assert.deepEqual(bad.json, { status: 'not_found' }, code);
    assert.equal(db.log.opened, 0);
    // The one request this client is allowed is still unused.
    const ok = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ camp: dbCamp }).openDatabase, memoryLimiter });
    assert.equal(ok.json.status, 'ok', code);
  }
});

test('GET: an unexpected answer or shape → unavailable', async () => {
  for (const answer of [
    { status: 'something_new' },
    null,
    { ...dbCamp, state: 'weird' },
    { ...dbCamp, camp: null },
    { ...dbCamp, camp: { ...dbCamp.camp, days: 'not a list' } },
    { ...dbCamp, camp: { ...dbCamp.camp, extras: [42] } },
    // only_on must be a list of dates (CP1 2026-10-19)
    { ...dbCamp, camp: { ...dbCamp.camp, extras: [{ ...dbCamp.camp.extras[0], only_on: '2026-11-27' }] } },
    { ...dbCamp, camp: { ...dbCamp.camp, extras: [{ ...dbCamp.camp.extras[0], only_on: ['Friday'] }] } },
  ]) {
    const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ camp: answer }).openDatabase });
    assert.deepEqual(r.json, { status: 'unavailable' }, JSON.stringify(answer)?.slice(0, 60));
  }
});

test('GET / POST: database error or permission denied (the off switch) → unavailable, no text leaked', async () => {
  const denied = () => {
    throw Object.assign(new Error('permission denied for function camp_public_camp'), { code: '42501' });
  };
  const g = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ camp: denied }).openDatabase });
  assert.deepEqual(g.json, { status: 'unavailable' });
  assert.doesNotMatch(g.text, /permission|camp_public/);
  const p = await run(handlePost, context(), { openDatabase: fakeDb({ signup: denied }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(p.json, { status: 'unavailable' });
  const c = await run(handleGet, context({ method: 'GET' }), { openDatabase: () => { throw new Error('connect ECONNREFUSED'); } });
  assert.deepEqual(c.json, { status: 'unavailable' });
});

// ---------- POST: the checks before Turnstile -------------------------------------------------

// Every refusal here must happen WITHOUT asking Turnstile or the database.
async function expectRefused(ctx, expected) {
  const db = fakeDb({ signup: dbSignupOk });
  const ts = fakeTurnstile();
  const r = await run(handlePost, ctx, { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl });
  assert.deepEqual(r.json, expected);
  assert.equal(r.http, expected.status === 'bad_request' ? 400 : 200);
  assert.equal(db.log.opened, 0, 'database must not be opened');
  assert.equal(ts.seen.length, 0, 'Turnstile must not be asked');
}

test('POST: kill switch off / missing binding → not_open', async () => {
  await expectRefused(context({ env: goodEnv({ CAMPS_REGISTRATION: 'off' }) }), { status: 'not_open' });
  await expectRefused(context({ env: goodEnv({ HYPERDRIVE_CAMPS: undefined }) }), { status: 'not_open' });
  // a binding whose connection string is blank counts as missing (same as register.js, f47d386)
  await expectRefused(context({ env: goodEnv({ HYPERDRIVE_CAMPS: { connectionString: '' } }) }), { status: 'not_open' });
});

test('POST: wrong Origin / Content-Type → bad_request (HTTP 400)', async () => {
  await expectRefused(context({ headers: { Origin: 'https://evil.example' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { Origin: '' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { 'Content-Type': 'text/plain' } }), { status: 'bad_request' });
});

test('POST: malformed code → not_found before anything else', async () => {
  await expectRefused(context({ code: 'nope!' }), { status: 'not_found' });
});

test('POST: body over 100 KB (declared or real) / not JSON / not an object → bad_request', async () => {
  const big = JSON.stringify(goodBody({ signature: 'data:image/png;base64,' + 'A'.repeat(110 * 1024) }));
  await expectRefused(context({ body: big }), { status: 'bad_request' });
  await expectRefused(context({ body: big, headers: { 'Content-Length': '100' } }), { status: 'bad_request' });
  await expectRefused(context({ body: '{not json' }), { status: 'bad_request' });
  await expectRefused(context({ body: '[1,2]' }), { status: 'bad_request' });
  await expectRefused(context({ body: 'null' }), { status: 'bad_request' });
});

test('POST: every §4.3 field limit → bad_request without a database call', async () => {
  const child = (o) => ({ children: [goodChild(o)] });
  const ids = (n) => Array.from({ length: n }, (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`);
  const cases = {
    'no children': { children: [] },
    '4 children': { children: [goodChild(), goodChild(), goodChild(), goodChild()] },
    'children not a list': { children: goodChild() },
    '11 day ids': child({ day_ids: ids(11) }),
    'no day ids': child({ day_ids: [] }),
    'repeated day id': child({ day_ids: [DAY_1, DAY_1] }),
    'repeated day id (case)': child({ day_ids: [DAY_1, DAY_1.toUpperCase()] }),
    'bad uuid day id': child({ day_ids: ['not-a-uuid'] }),
    'day id a number': child({ day_ids: [42] }),
    'age 9.5': child({ age: 9.5 }),
    'age "9"': child({ age: '9' }),
    'age -1': child({ age: -1 }),
    'age 151': child({ age: 151 }),
    'member "yes"': child({ member: 'yes' }),
    'first name too long': child({ first_name: 'x'.repeat(201) }),
    'last name missing': child({ last_name: undefined }),
    'unknown child key': child({ birthday: '2017-01-01' }),
    '11 extras': child({ extras: Array.from({ length: 11 }, () => ({ extra_id: EXTRA_1, day_ids: [] })) }),
    'extra bad uuid': child({ extras: [{ extra_id: 'x', day_ids: [] }] }),
    'extra unknown key': child({ extras: [{ extra_id: EXTRA_1, day_ids: [], price_cents: 0 }] }),
    'extra repeated day': child({ extras: [{ extra_id: EXTRA_1, day_ids: [DAY_1, DAY_1] }] }),
    'extra 11 days': child({ extras: [{ extra_id: EXTRA_1, day_ids: ids(11) }] }),
    'extra day_ids missing': child({ extras: [{ extra_id: EXTRA_1 }] }),
    'phone 21 characters': { parent: { name: 'Laura Rossi', phone: '5'.repeat(21), relation: 'Mother' } },
    'relation 81 characters': { emergency: { name: 'Paul', phone: '5085550187', relation: 'x'.repeat(81) } },
    'parent unknown key': { parent: { name: 'Laura', phone: '5085550142', relation: 'Mother', email: 'a@b.c' } },
    'parent missing': { parent: undefined },
    'emergency a string': { emergency: 'Paul' },
    'unknown body key': { notes: 'hi' },
    'submission_id bad': { submission_id: 'nope' },
    'paying_by too long': { paying_by: 'x'.repeat(21) },
    'acknowledged "true"': { acknowledged: 'true' },
    'signature too long': { signature: 'x'.repeat(70001) },
    'ack_version too long': { ack_version: 'x'.repeat(41) },
    'waiver_version too long': { waiver_version: 'x'.repeat(65) },
    'expected total 600001': { expected_total_cents: 600001 },
    'expected total -1': { expected_total_cents: -1 },
    'expected total 1.5': { expected_total_cents: 1.5 },
    'expected total missing': { expected_total_cents: undefined },
    'started_at text': { started_at: '1000000' },
    'token too long': { turnstile_token: 'x'.repeat(2049) },
    'token missing': { turnstile_token: undefined },
    'website a number': { website: 5 },
  };
  for (const [name, overrides] of Object.entries(cases)) {
    const body = goodBody(overrides);
    // JSON.stringify drops undefined keys, which is how "missing" is made.
    await expectRefused(context({ body }), { status: 'bad_request' }).catch((error) => {
      error.message = `${name}: ${error.message}`;
      throw error;
    });
  }
});

test('POST: honeypot filled in / sent in under 4 seconds → bad_request', async () => {
  await expectRefused(context({ body: goodBody({ website: 'http://spam.example' }) }), { status: 'bad_request' });
  await expectRefused(context({ body: goodBody({ started_at: 1_000_000, sent_at: 1_003_999 }) }), { status: 'bad_request' });
});

// ---------- POST: Turnstile -----------------------------------------------------------------

test('POST: Turnstile no / wrong host / the Color Belt "register" action / unreachable → verify_failed', async () => {
  const cases = [
    { success: false, hostname: 'tkd-dashboard.pages.dev', action: 'camp_signup' },
    { success: true, hostname: 'evil.example', action: 'camp_signup' },
    { success: true, hostname: 'tkd-dashboard.pages.dev', action: 'register' }, // a Color Belt token
    { success: true },
    new Error('network down'),
  ];
  for (const result of cases) {
    const db = fakeDb({ signup: dbSignupOk });
    const r = await run(handlePost, context(), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile(result).fetchImpl });
    assert.deepEqual(r.json, { status: 'verify_failed' }, JSON.stringify(result));
    assert.equal(db.log.opened, 0);
  }
  const r = await run(handlePost, context({ body: goodBody({ turnstile_token: '' }) }), { openDatabase: fakeDb({ signup: dbSignupOk }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(r.json, { status: 'verify_failed' });
});

test('verifyTurnstile: default action stays "register" (Color Belt unchanged); camp passes camp_signup', async () => {
  const answer = (action) => async () => new Response(JSON.stringify({ success: true, hostname: 'h', action }), { status: 200 });
  const base = { secret: 's', token: 't', ip: '1.2.3.4', expectedHost: 'h' };
  assert.equal(await verifyTurnstile({ ...base, fetchImpl: answer('register') }), true);
  assert.equal(await verifyTurnstile({ ...base, fetchImpl: answer('camp_signup') }), false);
  assert.equal(CAMP_TURNSTILE_ACTION, 'camp_signup');
  assert.equal(await verifyTurnstile({ ...base, fetchImpl: answer('camp_signup'), expectedAction: CAMP_TURNSTILE_ACTION }), true);
  assert.equal(await verifyTurnstile({ ...base, fetchImpl: answer('register'), expectedAction: CAMP_TURNSTILE_ACTION }), false);
});

// ---------- POST: the database ----------------------------------------------------------------

test('POST: ok → exactly the allowlist; typed values passed; uuids lower-cased; client key not the IP', async () => {
  const db = fakeDb({ signup: dbSignupOk });
  const body = goodBody({ submission_id: SUBMISSION_ID.toUpperCase(), children: [goodChild({ day_ids: [DAY_1.toUpperCase()] })] });
  const r = await run(handlePost, context({ body }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(r.json, {
    status: 'ok',
    reference: 'CP-4821',
    paying_by: 'cash',
    family_total_cents: 16600,
    children: [{
      first_name: 'Mia', last_name: 'Rossi', day_count: 2, days: ['2026-11-25', '2026-11-27'], price_kind: 'early',
      base_cents: 15000, total_cents: 16600, extras: [{ name: 'Late pick-up', per: 'day', count: 2, cents: 1600 }],
    }],
    camp: {
      name: 'Thanksgiving Camp', start_time: '09:00', end_time: '15:00', school_name: 'Worcester', both_schools: false,
      description: 'Two days.', days: [{ day_id: DAY_1, day: '2026-11-25' }], address: null,
    },
  });
  const [name, args] = db.log.calls[0];
  assert.equal(name, 'publicSignup');
  assert.equal(args.code, 'k7m2qpxz');
  assert.equal(args.submissionId, SUBMISSION_ID);
  assert.deepEqual(args.children, [{ first_name: 'Mia', last_name: 'Rossi', age: 9, member: false, day_ids: [DAY_1], extras: [{ extra_id: EXTRA_1, day_ids: [DAY_1, DAY_2] }] }]);
  assert.equal(args.parentPhone, '5085550142');
  assert.equal(args.emergencyRelation, 'Uncle');
  assert.equal(args.acknowledged, true);
  assert.equal(args.expectedTotalCents, 16600);
  assert.equal(args.waiverVersion, '0123456789abcdef0123456789abcdef');
  assert.match(args.clientKey, /^[0-9a-f]{64}$/);
  assert.ok(!args.clientKey.includes('203.0.113.7'));
  assert.equal(args.turnstile_token, undefined); // the token never goes to the database
  assert.equal(db.log.closed, 1, 'client closed through waitUntil');
});

test('POST: every database status mapped and reduced to exactly the §4.6 allowlist', async () => {
  const cases = [
    [{ status: 'not_found', extra: 1 }, { status: 'not_found' }],
    [{ status: 'not_open', opens_on: '2027-03-01', extra: 1 }, { status: 'not_open', opens_on: '2027-03-01' }],
    [{ status: 'not_open' }, { status: 'not_open' }],
    [{ status: 'closed', closed_on: '2026-11-24', extra: 1 }, { status: 'closed', closed_on: '2026-11-24' }],
    [{ status: 'closed', closed_on: null }, { status: 'closed', closed_on: null }],
    [{ status: 'finished', extra: 1 }, { status: 'finished' }],
    [{ status: 'rate_limited' }, { status: 'rate_limited' }],
    [{ status: 'invalid', detail: 'first name too long' }, { status: 'invalid' }],
    [
      { status: 'price_changed', new_total_cents: 17100, old_total_cents: 16600, camp: dbCamp, extra: 1 },
      { status: 'price_changed', new_total_cents: 17100, old_total_cents: 16600, camp: expectedGet },
    ],
    [{ status: 'camp_changed', camp: dbCamp, extra: 1 }, { status: 'camp_changed', camp: expectedGet }],
    [{ status: 'camp_changed', camp: { status: 'not_found' } }, { status: 'unavailable' }],
    [{ status: 'price_changed', new_total_cents: 1, old_total_cents: 2 }, { status: 'unavailable' }],
    [{ status: 'ok', reference: 'CP-1' }, { status: 'unavailable' }], // no children: wrong shape
    [{ status: 'no_access' }, { status: 'unavailable' }],
    [{ status: 'stale' }, { status: 'unavailable' }],
    [null, { status: 'unavailable' }],
    ['text', { status: 'unavailable' }],
  ];
  for (const [fromDb, expected] of cases) {
    const r = await run(handlePost, context(), { openDatabase: fakeDb({ signup: fromDb }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, expected, JSON.stringify(fromDb)?.slice(0, 80));
    assert.equal(r.http, 200);
  }
});

test('POST: database error → unavailable; nothing personal in the answer or the log', async () => {
  const db = fakeDb({
    signup: () => {
      throw new Error('duplicate key; Key (first_name)=(Mia) phone 5085550142 data:image/png;base64');
    },
  });
  const logged = [];
  const original = console.log;
  console.log = (...parts) => logged.push(parts.join(' '));
  try {
    const r = await run(handlePost, context(), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'unavailable' });
    assert.doesNotMatch(r.text, /Mia|duplicate|data:image|5085550142/);
    const ok = await run(handlePost, context(), { openDatabase: fakeDb({ signup: dbSignupOk }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.equal(ok.json.status, 'ok');
  } finally {
    console.log = original;
  }
  assert.equal(logged.length, 2);
  for (const line of logged) {
    assert.doesNotMatch(line, /Mia|Rossi|Laura|data:image|203\.0\.113\.7|5085550142|5085550187|duplicate|CP-4821/);
    const parsed = JSON.parse(line);
    assert.deepEqual(Object.keys(parsed).sort(), ['fn', 'method', 'ms', 'status']);
    assert.equal(parsed.fn, 'camp');
  }
});

test('other methods → bad_request', async () => {
  const response = handleOther();
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { status: 'bad_request' });
});

// ---------- the rate limiter key ------------------------------------------------------------

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

test('rate limit: key is "<client key>:camp:GET" / ":camp:POST"; blocks before the database', async () => {
  const binding = fakeRateLimiter(1);
  const env = goodEnv({ RATE_LIMITER: binding });
  for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
    const first = await run(handler, context({ method, env }), { openDatabase: fakeDb({ camp: dbCamp, signup: dbSignupOk }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.equal(first.json.status, 'ok', method);
    const db = fakeDb({ camp: dbCamp, signup: dbSignupOk });
    const ts = fakeTurnstile();
    const blocked = await run(handler, context({ method, env }), { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl });
    assert.deepEqual(blocked.json, { status: 'rate_limited' });
    assert.equal(db.log.opened, 0);
    assert.equal(ts.seen.length, 0);
  }
  assert.match(binding.seen[0], /^[0-9a-f]{64}:camp:GET$/);
  assert.match(binding.seen.at(-1), /^[0-9a-f]{64}:camp:POST$/);
  assert.ok(binding.seen.every((key) => !key.includes('203.0.113.7')));
});

test('rate limit (memory): camp counters are separate from Color Belt counters', async () => {
  const memoryLimiter = new MemoryRateLimiter({ limit: 1 });
  // Use up this client's Color Belt GET allowance by hand ("<key>:GET").
  const { makeClientKey } = await import('../_lib/clientKey.js');
  const key = await makeClientKey('client-key-secret-for-tests', '203.0.113.7', new Date(1_700_000_000_000));
  memoryLimiter.allow(`${key}:GET`, 1_700_000_000_000);
  const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ camp: dbCamp }).openDatabase, memoryLimiter });
  assert.equal(r.json.status, 'ok');
  const blocked = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ camp: dbCamp }).openDatabase, memoryLimiter });
  assert.deepEqual(blocked.json, { status: 'rate_limited' });
});

test('anything unplanned that throws → unavailable, with no details', async () => {
  const brokenBinding = { limit: async () => { throw new Error('limiter exploded 203.0.113.7'); } };
  for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
    const db = fakeDb({ camp: dbCamp, signup: dbSignupOk });
    const r = await run(handler, context({ method, env: goodEnv({ RATE_LIMITER: brokenBinding }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'unavailable' }, method);
    assert.doesNotMatch(r.text, /exploded|203/);
    assert.equal(db.log.opened, 0);
  }
});

// ---------- the real files --------------------------------------------------------------------

test('[code].js loads and routes by method (switched off, so nothing real is touched)', async () => {
  const { onRequest } = await import('../api/camp/[code].js');
  const env = goodEnv({ CAMPS_REGISTRATION: 'off' });
  for (const method of ['GET', 'POST']) {
    const response = await onRequest(context({ method, env }));
    assert.deepEqual(await response.json(), { status: 'not_open' });
  }
  const put = await onRequest({ ...context({ method: 'GET', env }), request: new Request(`${ORIGIN}/api/camp/x`, { method: 'PUT' }) });
  assert.equal(put.status, 400);
});

test('campDb.js: exactly two statements, children sent as (JSON.stringify(…)::text)::jsonb, typed parameters', () => {
  const source = readFileSync(new URL('../_lib/campDb.js', import.meta.url), 'utf8');
  const calls = source.match(/select public\.[a-z_]+\(/g);
  assert.deepEqual(calls, ['select public.camp_public_camp(', 'select public.camp_public_signup(']);
  // ::text first: a ${…}::jsonb parameter makes Postgres.js stringify the text a second time,
  // so the database got one long string instead of a list (live phone test, 2026-10-21).
  assert.match(source, /\(\$\{JSON\.stringify\(args\.children\)\}::text\)::jsonb/);
  assert.doesNotMatch(source, /\$\{[^}]+\}::jsonb/);
  assert.match(source, /HYPERDRIVE_CAMPS/);
  for (const setting of ['prepare: false', 'max: 1', 'fetch_types: false', 'connect_timeout: 5', 'onnotice']) {
    assert.ok(source.includes(setting), setting);
  }
  // Every value in the signup call is cast to a type.
  const signup = source.slice(source.indexOf('select public.camp_public_signup('));
  const params = signup.slice(0, signup.indexOf(') as answer')).match(/\$\{[^}]+\}(::[a-z]+)?/g);
  assert.equal(params.length, 16);
  assert.ok(params.every((p) => /::(text|uuid|jsonb|boolean|integer)$/.test(p)), params.join(' '));
});
