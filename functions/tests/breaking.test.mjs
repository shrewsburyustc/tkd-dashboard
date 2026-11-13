// breaking.test.mjs — tests for the Board breaking Functions: the family sign-up Function
// (functions/_lib/breaking.js), the Square webhook (functions/_lib/breakingWebhook.js) and the
// signature helper (functions/_lib/squareSignature.js). Spec: docs/Board Breaking/FUNCTION-API.md.
// Why it exists: both Functions are signed-out ways into the database (one of them can mark a
// student as paid), so every check they make is proven here before they go anywhere near Cloudflare.
// Same style as camp.test.mjs. How to run (from the project folder):   node --test functions/tests/
//
// Nothing real is used: a FAKE database (records what it was asked and answers what each test says),
// a FAKE Turnstile and a FAKE Square (one pretend fetch that answers like each of them). No network,
// no secrets: every key and token below is an obviously fake test value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  handleGet, handlePost, handleOther, createPaymentLink, BREAKING_SIGNUP_ACTION, BREAKING_PAY_ACTION,
  MAX_BREAKING_BODY_BYTES,
} from '../_lib/breaking.js';
import { handleWebhook, mapPayment, MAX_WEBHOOK_BODY_BYTES } from '../_lib/breakingWebhook.js';
import { constantTimeEqual, computeSquareSignature, verifySquareSignature } from '../_lib/squareSignature.js';
import { MemoryRateLimiter } from '../_lib/rateLimit.js';
import { SITEVERIFY_URL } from '../_lib/turnstile.js';

// ---------- helpers -------------------------------------------------------------------------

const ORIGIN = 'https://tkd-dashboard.pages.dev';
const NEW_ORIGIN = 'https://app.ustaekwondo.net';
const SUBMISSION_ID = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
const REGISTRATION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CLASS_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = 'order-id-from-square-9f8e7d';
const LINK_URL = 'https://square.link/u/Xy7Pq2Lm';
const STORED_URL = 'https://square.link/u/StoredOne';
const CODE = 'k7m2qpxz';
const TOKEN = 'token-from-the-page';

// Fake settings and keys (never real ones).
const SQUARE_SECRETS = {
  SQUARE_ENVIRONMENT_WORCESTER: 'production',
  SQUARE_ACCESS_TOKEN_WORCESTER: 'fake-token-worcester-aaa',
  SQUARE_LOCATION_ID_WORCESTER: 'LOC-WORCESTER',
  SQUARE_ENVIRONMENT_SHREWSBURY: 'production',
  SQUARE_ACCESS_TOKEN_SHREWSBURY: 'fake-token-shrewsbury-bbb',
  SQUARE_LOCATION_ID_SHREWSBURY: 'LOC-SHREWSBURY',
};
const WEBHOOK_SECRETS = {
  SQUARE_WEBHOOK_SIGNATURE_KEY_WORCESTER: 'fake-signature-key-worcester',
  SQUARE_WEBHOOK_URL_WORCESTER: 'https://tkd-dashboard.pages.dev/api/square/breaking/worcester',
  SQUARE_WEBHOOK_SIGNATURE_KEY_SHREWSBURY: 'fake-signature-key-shrewsbury',
  SQUARE_WEBHOOK_URL_SHREWSBURY: 'https://tkd-dashboard.pages.dev/api/square/breaking/shrewsbury',
};

// A complete, correct set of settings. Tests remove or change one thing at a time.
function goodEnv(overrides = {}) {
  return {
    BREAKING_REGISTRATION: 'on',
    HYPERDRIVE_BREAKING: { connectionString: 'postgres://fake' },
    HYPERDRIVE_BREAKING_SQUARE: { connectionString: 'postgres://fake-square' },
    TURNSTILE_SECRET: 'turnstile-secret-for-tests',
    CLIENT_KEY_SECRET: 'client-key-secret-for-tests',
    PUBLIC_ORIGIN: `${ORIGIN},${NEW_ORIGIN}`, // a LIST, as Domain's helper allows
    TURNSTILE_SITE_KEY: 'public-site-key',
    ...SQUARE_SECRETS,
    ...WEBHOOK_SECRETS,
    ...overrides,
  };
}

// A fake database for the family Function. Each of `event`, `signup`, `registration`, `setLink` is
// the answer, a function of the arguments, or an Error to throw. `log` records every call.
function fakeDb({ event, signup, registration, setLink } = {}) {
  const log = { opened: 0, calls: [], closed: 0 };
  const answer = (value, args) => {
    const out = typeof value === 'function' ? value(args) : value;
    if (out instanceof Error) throw out;
    return out;
  };
  const openDatabase = () => {
    log.opened += 1;
    return {
      async publicEvent(code) { log.calls.push(['publicEvent', code]); return answer(event, code); },
      async publicSignup(args) { log.calls.push(['publicSignup', args]); return answer(signup, args); },
      async publicRegistration(code, submissionId) {
        log.calls.push(['publicRegistration', code, submissionId]);
        return answer(registration, { code, submissionId });
      },
      async publicSetLink(args) { log.calls.push(['publicSetLink', args]); return answer(setLink, args); },
      async close() { log.closed += 1; },
    };
  };
  return { openDatabase, log };
}

// One pretend fetch for BOTH Turnstile and Square. `turnstile` = what siteverify answers (or an Error);
// `square` = a Response, a function (url, init) → Response, or an Error to throw.
function fakeFetch({ turnstile, square } = {}) {
  const siteverify = turnstile ?? { success: true, hostname: 'tkd-dashboard.pages.dev', action: BREAKING_SIGNUP_ACTION };
  const turnstileCalls = [];
  const squareCalls = [];
  const fetchImpl = async (url, init) => {
    if (url === SITEVERIFY_URL) {
      turnstileCalls.push({ body: String(init.body) });
      if (siteverify instanceof Error) throw siteverify;
      return new Response(JSON.stringify(siteverify), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    squareCalls.push({ url, init, body: JSON.parse(init.body) });
    const out = typeof square === 'function' ? square(url, init) : square;
    if (out instanceof Error) throw out;
    if (out) return out;
    return new Response(JSON.stringify({ payment_link: { id: 'pl-1', order_id: ORDER_ID, url: LINK_URL, secret_extra: 'x' } }), { status: 200 });
  };
  return { fetchImpl, turnstileCalls, squareCalls };
}
const turnstileFor = (action, hostname = 'tkd-dashboard.pages.dev') => ({ success: true, hostname, action });

// What the database answers.
const dbEvent = {
  status: 'ok',
  event: {
    name: 'Spring Board Breaking', location_code: 'worcester', event_date: '2026-12-05', registration_state: 'open',
    classes: [{ id: CLASS_ID, name: 'Morning', start_time: '09:00', end_time: '11:00', sort: 1, event_id: 'drop me' }],
    prices: { tech_cents: 300, adult_cents: 400, card_extra_cents: 25, same_day_extra_cents: 100, same_day: false, secret: 'drop' },
    child_max_age: 12,
    chart: [{ band: 'child', rank_name: 'Yellow', sort: 1, technique: 'Elbow Strike', tech_boards: 1, adult_boards: 0, id: 'drop' }],
    id: 'event id — must be dropped',
    public_code: 'drop',
    version: 3,
  },
};
const expectedEvent = {
  status: 'ok',
  event: {
    name: 'Spring Board Breaking', location_code: 'worcester', event_date: '2026-12-05', registration_state: 'open', child_max_age: 12,
    classes: [{ id: CLASS_ID, name: 'Morning', start_time: '09:00', end_time: '11:00' }],
    prices: { tech_cents: 300, adult_cents: 400, card_extra_cents: 25, same_day_extra_cents: 100, same_day: false },
    chart: [{ band: 'child', rank_name: 'Yellow', sort: 1, technique: 'Elbow Strike', tech_boards: 1, adult_boards: 0 }],
  },
  turnstile_site_key: 'public-site-key',
};
const eventAt = (location_code) => ({ status: 'ok', event: { ...dbEvent.event, location_code } });

const signupOk = (paying_by, amount_cents = 4000) => ({
  status: 'ok', registration_id: REGISTRATION_ID, amount_cents, paying_by, same_day: false, submission_id: 'drop', client_key: 'drop',
});
const registrationOk = (overrides = {}) => ({
  status: 'ok', registration_id: REGISTRATION_ID, amount_cents: 4000, balance_cents: 4000, paying_by: 'card', paid: false,
  has_link: false, link_url: null, ...overrides,
});

// The bodies a real page sends.
const signupBody = (overrides = {}) => ({
  action: 'signup', submission_id: SUBMISSION_ID, first_name: 'Mia', last_name: 'Rossi', age: 9, rank_name: 'Yellow',
  class_id: CLASS_ID, tech: 1, adult: 0, paying_by: 'card', expected_total_cents: 4000,
  website: '', started_at: 1_000_000, sent_at: 1_060_000, turnstile_token: TOKEN, ...overrides,
});
const payBody = (overrides = {}) => ({
  action: 'pay', submission_id: SUBMISSION_ID, first_name: 'Mia',
  website: '', started_at: 1_000_000, sent_at: 1_060_000, turnstile_token: TOKEN, ...overrides,
});
const statusBody = (overrides = {}) => ({ action: 'status', submission_id: SUBMISSION_ID, ...overrides });

// A Pages-style context: request + env + params + waitUntil (which collects promises).
function context({ method = 'POST', env = goodEnv(), code = CODE, body, headers = {}, origin = ORIGIN } = {}) {
  const waits = [];
  const init = { method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headers } };
  if (origin !== null) init.headers.Origin = origin;
  if (method === 'POST') init.body = typeof body === 'string' ? body : JSON.stringify(body ?? signupBody());
  return {
    request: new Request(`${ORIGIN}/api/breaking/${code}`, init),
    env,
    params: { code },
    waitUntil: (p) => waits.push(p),
    waits,
  };
}

// Runs a handler with a FRESH in-memory rate limiter (unless the test passes its own) and captures
// everything written to the Cloudflare log.
async function run(handler, ctx, deps) {
  const lines = [];
  const original = console.log;
  console.log = (...parts) => lines.push(parts.join(' '));
  let response;
  try {
    response = await handler(ctx, { now: () => 1_700_000_000_000, memoryLimiter: new MemoryRateLimiter(), ...deps });
    await Promise.all(ctx.waits ?? []);
  } finally {
    console.log = original;
  }
  const text = await response.text();
  return { http: response.status, json: JSON.parse(text), text, lines, response };
}

// Everything a test might want in one go: a POST with a fake database + fake fetch.
async function post({ body, env, origin, headers, code, db = {}, fetches = {}, deps = {} } = {}) {
  const database = fakeDb(db);
  const fetched = fakeFetch(fetches);
  const out = await run(handlePost, context({ body, env, origin, headers, code }), { ...database, fetchImpl: fetched.fetchImpl, ...deps });
  return { ...out, db: database.log, ...fetched };
}

// The fake database and the fake fetch must never have been touched (for "refused early" tests).
function untouched(result) {
  assert.equal(result.db.opened, 0, 'no database connection');
  assert.equal(result.turnstileCalls.length, 0, 'Turnstile not asked');
  assert.equal(result.squareCalls.length, 0, 'Square not asked');
}

// The idempotency key Square should get: SHA-256 (hex) of registration id | amount | note | return address.
const keyFor = (balance, { note = 'Board Breaking — Mia', origin = ORIGIN } = {}) =>
  createHash('sha256').update([REGISTRATION_ID, balance, note, `${origin}/breaking/${CODE}?paid=1`].join('|')).digest('hex');

// ---------- GET -----------------------------------------------------------------------------

test('GET: the event goes through the allow-list; ids, versions and unknown keys are dropped; the site key is added', async () => {
  const database = fakeDb({ event: dbEvent });
  const out = await run(handleGet, context({ method: 'GET' }), database);
  assert.equal(out.http, 200);
  assert.deepEqual(out.json, expectedEvent);
  assert.deepEqual(database.log.calls, [['publicEvent', CODE]]);
  assert.equal(database.log.closed, 1, 'the connection is closed afterwards');
  assert.ok(!out.text.includes('event id'));
  assert.equal(out.response.headers.get('Cache-Control'), 'no-store');
});

test('GET: switched off or any setting missing → not_open, and the database is never opened', async () => {
  const broken = [
    { BREAKING_REGISTRATION: 'off' }, { BREAKING_REGISTRATION: undefined }, { BREAKING_REGISTRATION: 'ON' },
    { HYPERDRIVE_BREAKING: undefined }, { HYPERDRIVE_BREAKING: { connectionString: '' } }, { HYPERDRIVE_BREAKING: { connectionString: 7 } },
    { TURNSTILE_SECRET: '' }, { CLIENT_KEY_SECRET: undefined }, { PUBLIC_ORIGIN: '' }, { TURNSTILE_SITE_KEY: undefined },
  ];
  for (const overrides of broken) {
    const database = fakeDb({ event: dbEvent });
    const out = await run(handleGet, context({ method: 'GET', env: goodEnv(overrides) }), database);
    assert.deepEqual(out.json, { status: 'not_open' }, JSON.stringify(overrides));
    assert.equal(database.log.opened, 0);
  }
});

test('GET: a code that cannot exist → not_found without a database; a capital-letter code is lower-cased', async () => {
  for (const code of ['short', 'k7m2qpx', 'k7m2qpxzz', 'k7m2qpx1', 'k7m2qpxi', 'k7m2qpxo', 'k7m2qpxl', 'k7m2qp.z']) {
    const database = fakeDb({ event: dbEvent });
    const out = await run(handleGet, context({ method: 'GET', code }), database);
    assert.deepEqual(out.json, { status: 'not_found' }, code);
    assert.equal(database.log.opened, 0);
  }
  const database = fakeDb({ event: dbEvent });
  await run(handleGet, context({ method: 'GET', code: 'K7M2QPXZ' }), database);
  assert.deepEqual(database.log.calls, [['publicEvent', 'k7m2qpxz']]);
});

test('GET: database says not_found → not_found; any other answer or an error → unavailable (no error text)', async () => {
  const cases = [
    [{ status: 'not_found' }, 'not_found'],
    [{ status: 'weird' }, 'unavailable'],
    [undefined, 'unavailable'],
    [{ status: 'ok', event: { ...dbEvent.event, registration_state: 'maybe' } }, 'unavailable'],
    [{ status: 'ok', event: { ...dbEvent.event, classes: 'nope' } }, 'unavailable'],
    [{ status: 'ok' }, 'unavailable'],
    [new Error('connection refused to 10.0.0.1 password=hunter2'), 'unavailable'],
  ];
  for (const [event, expected] of cases) {
    const database = fakeDb({ event });
    const out = await run(handleGet, context({ method: 'GET' }), database);
    assert.deepEqual(out.json, { status: expected });
    assert.ok(!out.text.includes('hunter2'));
    assert.equal(database.log.closed, database.log.opened, 'closed even after an error');
  }
});

test('GET: rate limited before any database connection; no client address → bad_request', async () => {
  const limiter = new MemoryRateLimiter({ limit: 1 });
  const database = fakeDb({ event: dbEvent });
  const first = await run(handleGet, context({ method: 'GET' }), { ...database, memoryLimiter: limiter });
  const second = await run(handleGet, context({ method: 'GET' }), { ...database, memoryLimiter: limiter });
  assert.equal(first.json.status, 'ok');
  assert.deepEqual(second.json, { status: 'rate_limited' });
  assert.equal(database.log.opened, 1);

  const noIp = context({ method: 'GET' });
  noIp.request = new Request(`${ORIGIN}/api/breaking/${CODE}`, { method: 'GET' });
  const out = await run(handleGet, noIp, fakeDb({ event: dbEvent }));
  assert.equal(out.http, 400);
  assert.deepEqual(out.json, { status: 'bad_request' });
});

// ---------- POST: the gates, in order -------------------------------------------------------

test('POST: switched off or a setting missing → not_open, nothing asked', async () => {
  for (const overrides of [{ BREAKING_REGISTRATION: 'off' }, { HYPERDRIVE_BREAKING: undefined }, { TURNSTILE_SECRET: '' }, { PUBLIC_ORIGIN: undefined }]) {
    const out = await post({ env: goodEnv(overrides) });
    assert.deepEqual(out.json, { status: 'not_open' }, JSON.stringify(overrides));
    untouched(out);
  }
});

test('POST origin: wrong, missing, look-alike → bad_request; each address on the LIST is accepted', async () => {
  for (const origin of ['https://evil.example', null, 'http://tkd-dashboard.pages.dev', 'https://tkd-dashboard.pages.dev.evil.example',
    'https://tkd-dashboard.pages.dev:8443', 'https://other.ustaekwondo.net', 'null', '*']) {
    const out = await post({ origin, db: { signup: signupOk('cash') } });
    assert.equal(out.http, 400, String(origin));
    assert.deepEqual(out.json, { status: 'bad_request' });
    untouched(out);
  }
  // The old address and the new address both work; Turnstile must report the SAME address's host.
  const old = await post({ origin: ORIGIN, db: { signup: signupOk('cash') } });
  assert.equal(old.json.status, 'ok');
  const fresh = await post({ origin: NEW_ORIGIN, db: { signup: signupOk('cash') }, fetches: { turnstile: turnstileFor(BREAKING_SIGNUP_ACTION, 'app.ustaekwondo.net') } });
  assert.equal(fresh.json.status, 'ok');
  const crossed = await post({ origin: NEW_ORIGIN, db: { signup: signupOk('cash') } }); // Turnstile says the OLD host
  assert.deepEqual(crossed.json, { status: 'verify_failed' });
  assert.equal(crossed.db.opened, 0);
});

test('POST: only application/json (a charset after it is fine)', async () => {
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', '']) {
    const out = await post({ headers: { 'Content-Type': type } });
    assert.equal(out.http, 400, type);
    untouched(out);
  }
  const ok = await post({ headers: { 'Content-Type': 'application/json; charset=utf-8' }, db: { signup: signupOk('cash') } });
  assert.equal(ok.json.status, 'ok');
});

test('POST: a code that cannot exist → not_found before the rate limiter and the database', async () => {
  const limiter = new MemoryRateLimiter({ limit: 1 });
  for (let i = 0; i < 3; i += 1) {
    const out = await post({ code: 'nope', deps: { memoryLimiter: limiter } });
    assert.deepEqual(out.json, { status: 'not_found' });
    untouched(out);
  }
});

test('POST: rate limited before the body is read, Turnstile or the database', async () => {
  const limiter = new MemoryRateLimiter({ limit: 1 });
  const first = await post({ db: { signup: signupOk('cash') }, deps: { memoryLimiter: limiter } });
  const second = await post({ db: { signup: signupOk('cash') }, deps: { memoryLimiter: limiter } });
  assert.equal(first.json.status, 'ok');
  assert.deepEqual(second.json, { status: 'rate_limited' });
  untouched(second);
});

test('POST: a body over 256 KB (declared or real) → bad_request; broken JSON, arrays, text → bad_request', async () => {
  const huge = JSON.stringify(signupBody({ first_name: 'x'.repeat(MAX_BREAKING_BODY_BYTES) }));
  const declared = await post({ body: huge });
  assert.deepEqual(declared.json, { status: 'bad_request' });
  untouched(declared);
  // Real size over the limit with no honest Content-Length: read as a stream.
  const ctx = context({ body: 'x' });
  ctx.request = new Request(`${ORIGIN}/api/breaking/${CODE}`, {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' },
    body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_BREAKING_BODY_BYTES + 1)); c.close(); } }), duplex: 'half',
  });
  const streamed = await run(handlePost, ctx, { ...fakeDb(), fetchImpl: fakeFetch().fetchImpl });
  assert.deepEqual(streamed.json, { status: 'bad_request' });

  for (const body of ['{not json', '[]', '"text"', 'null', '123', '']) {
    const out = await post({ body });
    assert.deepEqual(out.json, { status: 'bad_request' }, body);
    untouched(out);
  }
});

test('POST: unknown fields, a missing field, wrong types and sizes → bad_request (nothing asked)', async () => {
  const bad = [
    signupBody({ extra: 1 }), signupBody({ registration_id: REGISTRATION_ID }), signupBody({ client_key: 'x' }),
    signupBody({ first_name: undefined }), signupBody({ first_name: 5 }), signupBody({ first_name: 'x'.repeat(201) }),
    signupBody({ last_name: null }), signupBody({ age: '9' }), signupBody({ age: 9.5 }), signupBody({ age: -1 }), signupBody({ age: 151 }),
    signupBody({ rank_name: 5 }), signupBody({ rank_name: 'x'.repeat(101) }),
    signupBody({ class_id: 'nope' }), signupBody({ class_id: undefined }), signupBody({ submission_id: 'nope' }),
    signupBody({ submission_id: undefined }), signupBody({ tech: 'one' }), signupBody({ tech: -1 }), signupBody({ adult: 1.5 }),
    signupBody({ paying_by: 5 }), signupBody({ paying_by: 'x'.repeat(21) }),
    signupBody({ expected_total_cents: '4000' }), signupBody({ expected_total_cents: -1 }), signupBody({ expected_total_cents: 4000.5 }),
    signupBody({ website: 5 }), signupBody({ started_at: '1' }), signupBody({ sent_at: undefined }),
    signupBody({ turnstile_token: undefined }), signupBody({ turnstile_token: 'x'.repeat(2049) }),
    signupBody({ action: 'delete' }), signupBody({ action: undefined }), signupBody({ action: 'toString' }), signupBody({ action: ['signup'] }),
    payBody({ last_name: 'Rossi' }), payBody({ first_name: 5 }), payBody({ submission_id: undefined }), payBody({ turnstile_token: undefined }),
    statusBody({ turnstile_token: TOKEN }), statusBody({ website: '' }), statusBody({ submission_id: 'nope' }), statusBody({ extra: 1 }),
  ];
  for (const body of bad) {
    const out = await post({ body });
    assert.equal(out.http, 400, JSON.stringify(body));
    assert.deepEqual(out.json, { status: 'bad_request' });
    untouched(out);
  }
});

test('POST honeypot: a filled hidden field → bad_request; an empty or missing one is fine', async () => {
  const filled = await post({ body: signupBody({ website: 'http://spam.example' }) });
  assert.deepEqual(filled.json, { status: 'bad_request' });
  untouched(filled);
  const payFilled = await post({ body: payBody({ website: 'x' }) });
  assert.deepEqual(payFilled.json, { status: 'bad_request' });
  const { website, ...noWebsite } = signupBody();
  const ok = await post({ body: noWebsite, db: { signup: signupOk('cash') } });
  assert.equal(ok.json.status, 'ok');
});

test('POST too fast: under 4 seconds between opening and sending → bad_request; exactly 4 s is fine', async () => {
  for (const [started_at, sent_at] of [[1000, 1000], [1000, 4999], [2000, 1000]]) {
    const out = await post({ body: signupBody({ started_at, sent_at }) });
    assert.deepEqual(out.json, { status: 'bad_request' });
    untouched(out);
  }
  const payFast = await post({ body: payBody({ started_at: 1000, sent_at: 2000 }) });
  assert.deepEqual(payFast.json, { status: 'bad_request' });
  const ok = await post({ body: signupBody({ started_at: 1000, sent_at: 5000 }), db: { signup: signupOk('cash') } });
  assert.equal(ok.json.status, 'ok');
});

test('POST Turnstile: failure, an error from Cloudflare, a wrong action or a wrong host → verify_failed; no database', async () => {
  const cases = [
    { success: false, hostname: 'tkd-dashboard.pages.dev', action: BREAKING_SIGNUP_ACTION },
    new Error('Cloudflare is down'),
    turnstileFor('register'), turnstileFor('camp_signup'), turnstileFor(BREAKING_PAY_ACTION), // a token made for the OTHER button
    turnstileFor(BREAKING_SIGNUP_ACTION, 'evil.example'),
    { success: true, hostname: 'tkd-dashboard.pages.dev' },
  ];
  for (const turnstile of cases) {
    const out = await post({ fetches: { turnstile }, db: { signup: signupOk('cash') } });
    assert.deepEqual(out.json, { status: 'verify_failed' });
    assert.equal(out.db.opened, 0);
    assert.equal(out.squareCalls.length, 0);
  }
  // `pay` needs a token made for breaking_pay, and a signup token is not good enough.
  const wrongForPay = await post({ body: payBody(), fetches: { turnstile: turnstileFor(BREAKING_SIGNUP_ACTION) }, db: { registration: registrationOk() } });
  assert.deepEqual(wrongForPay.json, { status: 'verify_failed' });
  const rightForPay = await post({ body: payBody(), fetches: { turnstile: turnstileFor(BREAKING_PAY_ACTION) }, db: { registration: registrationOk({ paying_by: 'cash' }) } });
  assert.equal(rightForPay.json.status, 'ok');
  // The token and the secret go to Cloudflare, the client address as remoteip.
  assert.match(rightForPay.turnstileCalls[0].body, /secret=turnstile-secret-for-tests/);
  assert.match(rightForPay.turnstileCalls[0].body, /remoteip=203\.0\.113\.7/);
});

// ---------- POST signup: database answers ---------------------------------------------------

test('POST signup: the database gets the checked values and the ANONYMOUS client key, never the raw IP', async () => {
  const out = await post({ db: { signup: signupOk('cash') } });
  const [, args] = out.db.calls[0];
  assert.deepEqual(Object.keys(args).sort(), ['adult', 'age', 'action', 'classId', 'clientKey', 'code', 'expectedTotalCents', 'firstName',
    'lastName', 'payingBy', 'rankName', 'submissionId', 'tech', 'token'].sort());
  assert.equal(args.code, CODE);
  assert.match(args.clientKey, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(args).includes('203.0.113.7'));
  assert.equal(args.firstName, 'Mia');
  assert.equal(args.expectedTotalCents, 4000);
  assert.equal(out.db.closed, 1);
});

test('POST signup: Cash and Check answer ok with pay.state none, and Square is never asked', async () => {
  for (const paying_by of ['cash', 'check']) {
    const out = await post({ body: signupBody({ paying_by }), db: { signup: signupOk(paying_by, 3300) } });
    assert.deepEqual(out.json, { status: 'ok', amount_cents: 3300, paying_by, same_day: false, pay: { state: 'none' } });
    assert.equal(out.squareCalls.length, 0);
    assert.equal(out.db.calls.length, 1, 'only the sign-up itself');
    assert.ok(!out.text.includes(REGISTRATION_ID));
  }
});

test('POST signup: every database status is mapped; unknown ones become unavailable', async () => {
  const same = ['not_found', 'closed', 'full', 'duplicate', 'rate_limited'];
  for (const status of same) {
    const out = await post({ db: { signup: { status, submission_id: 'drop', details: 'drop', registration_id: REGISTRATION_ID } } });
    assert.deepEqual(out.json, { status });
    assert.equal(out.http, 200);
  }
  const invalid = await post({ db: { signup: { status: 'invalid', field: 'age', hint: 'drop' } } });
  assert.deepEqual(invalid.json, { status: 'invalid', field: 'age' });
  for (const field of ['AGE; drop table', 'a'.repeat(41), 5, null, undefined, '', 'first name']) {
    const odd = await post({ db: { signup: { status: 'invalid', field } } });
    assert.deepEqual(odd.json, { status: 'invalid' }, String(field));
  }
  const changed = await post({ db: { signup: { status: 'price_changed', amount_cents: 4500, extra: 'drop' } } });
  assert.deepEqual(changed.json, { status: 'price_changed', amount_cents: 4500 });
  for (const weird of [
    { status: 'price_changed' }, { status: 'price_changed', amount_cents: 'free' },
    { status: 'something_new' }, { status: 'not_open' }, { status: 'bad_request' }, { status: 'verify_failed' }, { status: 'no_access' },
    { status: 'ok' }, { status: 'ok', amount_cents: 4000, paying_by: 'bitcoin', same_day: false }, { status: 'ok', amount_cents: '4000', paying_by: 'cash', same_day: false },
    { status: 'ok', amount_cents: 4000, paying_by: 'cash', same_day: 'no' }, { status: 'ok', amount_cents: -5, paying_by: 'cash', same_day: false },
    {}, null, 'text',
  ]) {
    const out = await post({ db: { signup: weird } });
    assert.deepEqual(out.json, { status: 'unavailable' }, JSON.stringify(weird));
  }
});

test('POST signup: a database error → unavailable with no error text; the connection is still closed', async () => {
  const out = await post({ db: { signup: new Error('permission denied for function brk_public_signup, password=hunter2') } });
  assert.deepEqual(out.json, { status: 'unavailable' });
  assert.ok(!out.text.includes('hunter2') && !out.text.includes('permission'));
  assert.equal(out.db.closed, 1);
});

// ---------- POST signup: Card and Square ----------------------------------------------------

test('POST signup, Card: Square is asked ONCE with exactly the database balance, an idempotency key made from what is sent, that school\'s token', async () => {
  // The browser said 4000 and the sign-up answer says 4000, but the balance the database reports is 2500:
  // the amount charged is the balance, and only the balance.
  const out = await post({
    body: signupBody({ expected_total_cents: 4000 }),
    db: { signup: signupOk('card', 4000), registration: registrationOk({ balance_cents: 2500 }), event: eventAt('shrewsbury'), setLink: { status: 'ok' } },
  });
  assert.equal(out.squareCalls.length, 1);
  const call = out.squareCalls[0];
  assert.equal(call.url, 'https://connect.squareup.com/v2/online-checkout/payment-links');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers.Authorization, 'Bearer fake-token-shrewsbury-bbb');
  assert.equal(call.init.headers['Square-Version'], '2024-12-18');
  assert.equal(call.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(call.body, {
    idempotency_key: keyFor(2500),
    quick_pay: { name: 'Board Breaking — Mia', price_money: { amount: 2500, currency: 'USD' }, location_id: 'LOC-SHREWSBURY' },
    checkout_options: { redirect_url: `${ORIGIN}/breaking/${CODE}?paid=1`, ask_for_shipping_address: false },
  });
  // The answer carries the link and the sign-up facts only.
  assert.deepEqual(out.json, { status: 'ok', amount_cents: 4000, paying_by: 'card', same_day: false, pay: { state: 'link', url: LINK_URL } });
  for (const secret of [REGISTRATION_ID, ORDER_ID, 'fake-token', 'LOC-', SUBMISSION_ID]) assert.ok(!out.text.includes(secret), secret);
  // The link is stored with the registration id, the order id and the SAME balance.
  const stored = out.db.calls.find(([name]) => name === 'publicSetLink')[1];
  assert.deepEqual(stored, { registrationId: REGISTRATION_ID, submissionId: SUBMISSION_ID, orderId: ORDER_ID, linkUrl: LINK_URL, amountCents: 2500 });
});

test('POST signup, Card: the right school\'s credentials and the right Square server (production / sandbox)', async () => {
  const worcester = await post({ db: { signup: signupOk('card'), registration: registrationOk(), event: eventAt('worcester'), setLink: { status: 'ok' } } });
  assert.equal(worcester.squareCalls[0].init.headers.Authorization, 'Bearer fake-token-worcester-aaa');
  assert.equal(worcester.squareCalls[0].body.quick_pay.location_id, 'LOC-WORCESTER');
  assert.ok(worcester.squareCalls[0].url.startsWith('https://connect.squareup.com/'));

  const sandbox = await post({
    env: goodEnv({ SQUARE_ENVIRONMENT_WORCESTER: 'sandbox' }),
    db: { signup: signupOk('card'), registration: registrationOk(), event: eventAt('worcester'), setLink: { status: 'ok' } },
  });
  assert.equal(sandbox.squareCalls[0].url, 'https://connect.squareupsandbox.com/v2/online-checkout/payment-links');
  // The OTHER school stays on production in that same setup.
  const other = await post({
    env: goodEnv({ SQUARE_ENVIRONMENT_WORCESTER: 'sandbox' }),
    db: { signup: signupOk('card'), registration: registrationOk(), event: eventAt('shrewsbury'), setLink: { status: 'ok' } },
  });
  assert.ok(other.squareCalls[0].url.startsWith('https://connect.squareup.com/'));
});

test('idempotency key: the same request twice → the same key; a changed balance, note or return address → a different key', async () => {
  const card = (extra = {}) => ({ db: { signup: signupOk('card'), registration: registrationOk(extra.registration), event: eventAt('worcester'), setLink: { status: 'ok' } }, ...extra.rest });
  const a = await post(card());
  const b = await post(card());
  assert.equal(a.squareCalls[0].body.idempotency_key, b.squareCalls[0].body.idempotency_key);
  assert.match(a.squareCalls[0].body.idempotency_key, /^[0-9a-f]{64}$/);
  const lower = await post(card({ registration: { balance_cents: 3000 } }));
  assert.notEqual(lower.squareCalls[0].body.idempotency_key, a.squareCalls[0].body.idempotency_key);
  const renamed = await post({ ...card(), body: signupBody({ first_name: 'Noah' }) });
  assert.notEqual(renamed.squareCalls[0].body.idempotency_key, a.squareCalls[0].body.idempotency_key);
  const elsewhere = await post({ ...card(), origin: NEW_ORIGIN, fetches: { turnstile: turnstileFor(BREAKING_SIGNUP_ACTION, 'app.ustaekwondo.net') } });
  assert.notEqual(elsewhere.squareCalls[0].body.idempotency_key, a.squareCalls[0].body.idempotency_key);
  assert.equal(elsewhere.squareCalls[0].body.idempotency_key, keyFor(4000, { origin: NEW_ORIGIN }));
});

test('POST signup, Card: the return address is the address the family came from (old or new)', async () => {
  const out = await post({
    origin: NEW_ORIGIN, fetches: { turnstile: turnstileFor(BREAKING_SIGNUP_ACTION, 'app.ustaekwondo.net') },
    db: { signup: signupOk('card'), registration: registrationOk(), event: eventAt('worcester'), setLink: { status: 'ok' } },
  });
  assert.equal(out.squareCalls[0].body.checkout_options.redirect_url, `${NEW_ORIGIN}/breaking/${CODE}?paid=1`);
});

test('POST signup, Card: anything wrong with Square → pay.state failed, and the student is still registered (status ok)', async () => {
  const failures = [
    new Response('{}', { status: 500 }),
    new Response('{"errors":[{"code":"UNAUTHORIZED"}]}', { status: 401 }),
    new Response('not json', { status: 200 }),
    new Response('{}', { status: 200 }),
    new Response(JSON.stringify({ payment_link: { order_id: ORDER_ID } }), { status: 200 }),
    new Response(JSON.stringify({ payment_link: { url: 'http://square.link/u/x', order_id: ORDER_ID } }), { status: 200 }),
    new Response(JSON.stringify({ payment_link: { url: 'javascript:alert(1)', order_id: ORDER_ID } }), { status: 200 }),
    new Response(JSON.stringify({ payment_link: { url: LINK_URL } }), { status: 200 }),
    new Error('network down'),
  ];
  for (const square of failures) {
    const out = await post({ db: { signup: signupOk('card'), registration: registrationOk(), event: eventAt('worcester'), setLink: { status: 'ok' } }, fetches: { square } });
    assert.deepEqual(out.json, { status: 'ok', amount_cents: 4000, paying_by: 'card', same_day: false, pay: { state: 'failed' } });
    assert.ok(!out.db.calls.some(([name]) => name === 'publicSetLink'), 'nothing stored when Square gave no link');
  }
});

test('POST signup, Card: a school with an incomplete Square set (or an unknown school) → failed, Square is not asked', async () => {
  const gaps = [
    { SQUARE_ACCESS_TOKEN_WORCESTER: undefined }, { SQUARE_ACCESS_TOKEN_WORCESTER: '' }, { SQUARE_LOCATION_ID_WORCESTER: undefined },
    { SQUARE_ENVIRONMENT_WORCESTER: undefined }, { SQUARE_ENVIRONMENT_WORCESTER: 'live' }, { SQUARE_ENVIRONMENT_WORCESTER: 'Production' },
  ];
  for (const gap of gaps) {
    const out = await post({ env: goodEnv(gap), db: { signup: signupOk('card'), registration: registrationOk(), event: eventAt('worcester'), setLink: { status: 'ok' } } });
    assert.equal(out.json.status, 'ok');
    assert.deepEqual(out.json.pay, { state: 'failed' }, JSON.stringify(gap));
    assert.equal(out.squareCalls.length, 0);
  }
  // Worcester's gap does not affect Shrewsbury.
  const fine = await post({ env: goodEnv({ SQUARE_ACCESS_TOKEN_WORCESTER: undefined }), db: { signup: signupOk('card'), registration: registrationOk(), event: eventAt('shrewsbury'), setLink: { status: 'ok' } } });
  assert.equal(fine.json.pay.state, 'link');
  for (const location_code of ['boston', '', undefined, 'WORCESTER']) {
    const out = await post({ db: { signup: signupOk('card'), registration: registrationOk(), event: eventAt(location_code), setLink: { status: 'ok' } } });
    assert.deepEqual(out.json.pay, { state: 'failed' }, String(location_code));
    assert.equal(out.squareCalls.length, 0);
  }
  const noEvent = await post({ db: { signup: signupOk('card'), registration: registrationOk(), event: { status: 'not_found' }, setLink: { status: 'ok' } } });
  assert.deepEqual(noEvent.json.pay, { state: 'failed' });
});

test('POST signup, Card: the database refusing or failing around the link → failed (still registered)', async () => {
  const base = { signup: signupOk('card'), registration: registrationOk(), event: eventAt('worcester') };
  for (const setLink of [{ status: 'price_changed', amount_cents: 100 }, { status: 'invalid', field: 'link' }, { status: 'not_found' },
    { status: 'something_new' }, new Error('boom'), undefined]) {
    const out = await post({ db: { ...base, setLink } });
    assert.deepEqual(out.json, { status: 'ok', amount_cents: 4000, paying_by: 'card', same_day: false, pay: { state: 'failed' } });
  }
  for (const registration of [new Error('boom'), { status: 'not_found' }, { status: 'ok' }, registrationOk({ paying_by: 'bitcoin' })]) {
    const out = await post({ db: { ...base, registration, setLink: { status: 'ok' } } });
    assert.deepEqual(out.json.pay, { state: 'failed' });
    assert.equal(out.squareCalls.length, 0);
  }
  const noEventAtAll = await post({ db: { ...base, event: new Error('boom'), setLink: { status: 'ok' } } });
  assert.deepEqual(noEventAtAll.json.pay, { state: 'failed' });
});

test('POST signup, Card: a link already stored for the registration is handed out; Square is not asked again', async () => {
  const out = await post({ db: { signup: signupOk('card'), registration: registrationOk({ has_link: true, link_url: STORED_URL }), setLink: { status: 'ok' } } });
  assert.deepEqual(out.json.pay, { state: 'link', url: STORED_URL });
  assert.equal(out.squareCalls.length, 0);
  // A stored address that is not https is never handed out; a fresh link is made instead.
  const bad = await post({ db: { signup: signupOk('card'), registration: registrationOk({ has_link: true, link_url: 'http://x.example' }), event: eventAt('worcester'), setLink: { status: 'ok' } } });
  assert.equal(bad.squareCalls.length, 1);
});

test('POST signup, Card: a sign-up that was already paid (a retried request) gets no link; link_exists hands out the stored one', async () => {
  const paid = await post({ db: { signup: signupOk('card'), registration: registrationOk({ paid: true, balance_cents: 0 }) } });
  assert.deepEqual(paid.json.pay, { state: 'none' });
  assert.equal(paid.squareCalls.length, 0);
  const racing = await post({
    db: {
      signup: signupOk('card'), event: eventAt('worcester'), setLink: { status: 'link_exists' },
      registration: (() => { let n = 0; return () => (n++ === 0 ? registrationOk() : registrationOk({ has_link: true, link_url: STORED_URL })); })(),
    },
  });
  assert.deepEqual(racing.json.pay, { state: 'link', url: STORED_URL });
  const racingPaid = await post({ db: { signup: signupOk('card'), event: eventAt('worcester'), registration: registrationOk(), setLink: { status: 'paid' } } });
  assert.deepEqual(racingPaid.json.pay, { state: 'none' });
});

test('createPaymentLink: never throws, refuses an amount that is not a positive whole number, and never sends anything but the balance', async () => {
  const seen = fakeFetch();
  const base = { fetchImpl: seen.fetchImpl, env: goodEnv(), school: 'worcester', registrationId: REGISTRATION_ID, firstName: 'Mia', code: CODE, publicOrigin: ORIGIN };
  assert.deepEqual(await createPaymentLink({ ...base, balanceCents: 2500 }), { url: LINK_URL, orderId: ORDER_ID });
  for (const balanceCents of [0, -1, 2.5, '2500', NaN, null, undefined, 20_000_000]) assert.equal(await createPaymentLink({ ...base, balanceCents }), null);
  assert.equal(await createPaymentLink({ ...base, balanceCents: 100, registrationId: '' }), null);
  assert.equal(await createPaymentLink({ ...base, balanceCents: 100, school: 'boston' }), null);
  assert.equal(await createPaymentLink({ ...base, balanceCents: 100, env: undefined }), null);
  assert.equal(seen.squareCalls.length, 1, 'only the one good call reached Square');
  // A name with control characters or an enormous length is tidied.
  await createPaymentLink({ ...base, balanceCents: 100, firstName: `Mia\n${'x'.repeat(500)}` });
  assert.ok(seen.squareCalls[1].body.quick_pay.name.length <= 'Board Breaking — '.length + 60);
  assert.ok(!/[\u0000-\u001f]/.test(seen.squareCalls[1].body.quick_pay.name));
});

// ---------- POST pay ("Try again") ----------------------------------------------------------

test('POST pay: the balance from the database is charged; Turnstile action breaking_pay', async () => {
  const out = await post({
    body: payBody(), fetches: { turnstile: turnstileFor(BREAKING_PAY_ACTION) },
    db: { registration: registrationOk({ amount_cents: 4000, balance_cents: 1500 }), event: eventAt('shrewsbury'), setLink: { status: 'ok' } },
  });
  assert.deepEqual(out.json, { status: 'ok', amount_cents: 1500, pay: { state: 'link', url: LINK_URL } });
  assert.equal(out.squareCalls[0].body.idempotency_key, keyFor(1500));
  assert.equal(out.squareCalls[0].body.quick_pay.price_money.amount, 1500);
  assert.equal(out.squareCalls[0].body.quick_pay.name, 'Board Breaking — Mia');
  assert.equal(out.squareCalls[0].init.headers.Authorization, 'Bearer fake-token-shrewsbury-bbb');
  assert.ok(!out.text.includes(REGISTRATION_ID) && !out.text.includes(ORDER_ID));
  assert.deepEqual(out.db.calls.map(([name]) => name), ['publicRegistration', 'publicEvent', 'publicSetLink']);
});

test('POST pay: without first_name the note is just "Board Breaking"', async () => {
  const { first_name, ...noName } = payBody();
  const out = await post({ body: noName, fetches: { turnstile: turnstileFor(BREAKING_PAY_ACTION) }, db: { registration: registrationOk(), event: eventAt('worcester'), setLink: { status: 'ok' } } });
  assert.equal(out.squareCalls[0].body.quick_pay.name, 'Board Breaking');
});

test('POST pay retry: first Square failure → failed; the retry gets a link with the SAME idempotency key', async () => {
  let fail = true;
  const square = (url, init) => (fail ? new Response('{}', { status: 503 }) : new Response(JSON.stringify({ payment_link: { order_id: ORDER_ID, url: LINK_URL } }), { status: 200 }));
  const database = fakeDb({ registration: registrationOk(), event: eventAt('worcester'), setLink: { status: 'ok' } });
  const fetched = fakeFetch({ turnstile: turnstileFor(BREAKING_PAY_ACTION), square });
  const deps = { ...database, fetchImpl: fetched.fetchImpl };
  const first = await run(handlePost, context({ body: payBody() }), deps);
  assert.deepEqual(first.json, { status: 'ok', amount_cents: 4000, pay: { state: 'failed' } });
  fail = false;
  const second = await run(handlePost, context({ body: payBody() }), deps);
  assert.deepEqual(second.json, { status: 'ok', amount_cents: 4000, pay: { state: 'link', url: LINK_URL } });
  assert.equal(fetched.squareCalls.length, 2);
  assert.equal(fetched.squareCalls[0].body.idempotency_key, fetched.squareCalls[1].body.idempotency_key);
});

test('POST pay: not_found, paid, cash and bad database answers', async () => {
  const pay = (db) => post({ body: payBody(), fetches: { turnstile: turnstileFor(BREAKING_PAY_ACTION) }, db });
  assert.deepEqual((await pay({ registration: { status: 'not_found' } })).json, { status: 'not_found' });
  const paid = await pay({ registration: registrationOk({ paid: true, balance_cents: 0 }) });
  assert.deepEqual(paid.json, { status: 'paid' });
  assert.equal(paid.squareCalls.length, 0);
  const cash = await pay({ registration: registrationOk({ paying_by: 'cash' }) });
  assert.deepEqual(cash.json, { status: 'ok', amount_cents: 4000, pay: { state: 'none' } });
  assert.equal(cash.squareCalls.length, 0);
  const nothingOwed = await pay({ registration: registrationOk({ balance_cents: 0 }) });
  assert.deepEqual(nothingOwed.json.pay, { state: 'none' });
  for (const registration of [{ status: 'weird' }, { status: 'ok' }, undefined, new Error('boom'), registrationOk({ registration_id: 'nope' }), registrationOk({ paid: 'no' })]) {
    assert.deepEqual((await pay({ registration })).json, { status: 'unavailable' });
  }
});

// ---------- POST status (the return page) ---------------------------------------------------

test('POST status: needs only the rate limit — no Turnstile, no honeypot, no timing; answers paid / amount / paying_by only', async () => {
  const out = await post({ body: statusBody(), db: { registration: registrationOk({ paid: false, balance_cents: 4000, link_url: STORED_URL, has_link: true }) } });
  assert.deepEqual(out.json, { status: 'ok', paid: false, amount_cents: 4000, paying_by: 'card' });
  assert.equal(out.turnstileCalls.length, 0);
  assert.equal(out.squareCalls.length, 0);
  assert.deepEqual(out.db.calls, [['publicRegistration', CODE, SUBMISSION_ID]]);
  for (const secret of [REGISTRATION_ID, STORED_URL, SUBMISSION_ID]) assert.ok(!out.text.includes(secret), secret);

  const paid = await post({ body: statusBody(), db: { registration: registrationOk({ paid: true, balance_cents: 0 }) } });
  assert.deepEqual(paid.json, { status: 'ok', paid: true, amount_cents: 0, paying_by: 'card' });
});

test('POST status: not_found, unknown answers, errors, and the gates that still apply', async () => {
  assert.deepEqual((await post({ body: statusBody(), db: { registration: { status: 'not_found' } } })).json, { status: 'not_found' });
  for (const registration of [{ status: 'weird' }, { status: 'ok' }, new Error('boom')]) {
    assert.deepEqual((await post({ body: statusBody(), db: { registration } })).json, { status: 'unavailable' });
  }
  // Origin, content type, code and rate limit still apply to status.
  untouched(await post({ body: statusBody(), origin: 'https://evil.example' }));
  const limiter = new MemoryRateLimiter({ limit: 1 });
  await post({ body: statusBody(), db: { registration: registrationOk() }, deps: { memoryLimiter: limiter } });
  const second = await post({ body: statusBody(), db: { registration: registrationOk() }, deps: { memoryLimiter: limiter } });
  assert.deepEqual(second.json, { status: 'rate_limited' });
  untouched(second);
});

// ---------- logs ----------------------------------------------------------------------------

test('logs: every line holds only {fn, method, status, ms} — no name, id, order, link, token or error text', async () => {
  const scenarios = [
    () => post({ db: { signup: signupOk('card'), registration: registrationOk(), event: eventAt('worcester'), setLink: { status: 'ok' } } }),
    () => post({ db: { signup: signupOk('card'), registration: registrationOk(), event: eventAt('worcester'), setLink: { status: 'ok' } }, fetches: { square: new Response('{}', { status: 500 }) } }),
    () => post({ db: { signup: new Error('boom with Mia Rossi and hunter2') } }),
    () => post({ body: payBody(), fetches: { turnstile: turnstileFor(BREAKING_PAY_ACTION) }, db: { registration: registrationOk(), event: eventAt('worcester'), setLink: { status: 'ok' } } }),
    () => post({ body: statusBody(), db: { registration: registrationOk() } }),
    () => post({ body: signupBody({ website: 'spam' }) }),
    async () => { const d = fakeDb({ event: dbEvent }); return run(handleGet, context({ method: 'GET' }), d); },
  ];
  const forbidden = [SUBMISSION_ID, REGISTRATION_ID, ORDER_ID, LINK_URL, STORED_URL, TOKEN, 'fake-token', 'LOC-', 'Mia', 'Rossi', 'hunter2',
    'turnstile-secret', 'client-key-secret', '203.0.113.7', CLASS_ID, 'postgres://'];
  for (const scenario of scenarios) {
    const out = await scenario();
    assert.equal(out.lines.length, 1, 'one line per request');
    const line = JSON.parse(out.lines[0]);
    assert.deepEqual(Object.keys(line).sort(), ['fn', 'method', 'ms', 'status']);
    assert.equal(line.fn, 'breaking');
    for (const word of forbidden) assert.ok(!out.lines[0].includes(word), word);
  }
});

test('other methods → bad_request (400)', async () => {
  const out = handleOther();
  assert.equal(out.status, 400);
  assert.deepEqual(await out.json(), { status: 'bad_request' });
});

// ---------- the Function files themselves ---------------------------------------------------

test('the database files call only the allowed database functions', () => {
  const source = readFileSync(new URL('../_lib/brkDb.js', import.meta.url), 'utf8');
  const [family, square] = source.split('// The Square webhook\'s connection');
  const names = (text) => [...new Set([...text.matchAll(/select\s+public\.(brk_[a-z_]+)\(/g)].map((m) => m[1]))].sort();
  assert.deepEqual(names(family), ['brk_public_event', 'brk_public_registration', 'brk_public_set_link', 'brk_public_signup']);
  assert.deepEqual(names(square), ['brk_square_payment']);
  assert.match(source, /prepare: false/);
  assert.match(source, /max: 1/);
  assert.match(source, /fetch_types: false/);
  assert.match(source, /connect_timeout: 5/);
  assert.ok(source.includes('env.HYPERDRIVE_BREAKING.connectionString'));
  assert.ok(source.includes('env.HYPERDRIVE_BREAKING_SQUARE.connectionString'));
});

test('the Function entry points: only GET and POST reach the work; everything else is refused', async () => {
  const { onRequest } = await import('../api/breaking/[code].js');
  for (const method of ['PUT', 'DELETE', 'PATCH']) {
    const response = await onRequest({ request: new Request(`${ORIGIN}/api/breaking/${CODE}`, { method }), env: goodEnv(), params: { code: CODE } });
    assert.equal(response.status, 400);
  }
  const hook = await import('../api/square/breaking/[school].js');
  const get = await hook.onRequest({ request: new Request(`${ORIGIN}/api/square/breaking/worcester`, { method: 'GET' }), env: goodEnv(), params: { school: 'worcester' } });
  assert.equal(get.status, 405);
});

// ---------- the signature helper ------------------------------------------------------------

test('constantTimeEqual: equal, different, different length, and anything that is not text', () => {
  assert.equal(constantTimeEqual('abc', 'abc'), true);
  assert.equal(constantTimeEqual('', ''), true);
  assert.equal(constantTimeEqual('abc', 'abd'), false);
  assert.equal(constantTimeEqual('abc', 'Abc'), false);
  assert.equal(constantTimeEqual('abc', 'abcd'), false);
  assert.equal(constantTimeEqual('abcd', 'abc'), false);
  assert.equal(constantTimeEqual('é', 'e'), false);
  assert.equal(constantTimeEqual('é', 'é'), true);
  assert.equal(constantTimeEqual('a'.repeat(44), `${'a'.repeat(43)}b`), false);
  for (const odd of [undefined, null, 5, {}, []]) {
    assert.equal(constantTimeEqual(odd, 'abc'), false);
    assert.equal(constantTimeEqual('abc', odd), false);
    assert.equal(constantTimeEqual(odd, odd), false);
  }
});

test('computeSquareSignature matches an independent HMAC-SHA256 + base64 of URL + body', async () => {
  const key = 'fake-signature-key-worcester';
  const url = 'https://tkd-dashboard.pages.dev/api/square/breaking/worcester';
  const body = '{"type":"payment.updated","note":"é ü 日本"}';
  const expected = createHmac('sha256', key).update(url + body).digest('base64');
  assert.equal(await computeSquareSignature(key, url, body), expected);
  assert.equal(await verifySquareSignature({ signatureKey: key, notificationUrl: url, rawBody: body, header: expected }), true);
});

test('verifySquareSignature: wrong key, wrong URL, changed body, missing or empty pieces → false', async () => {
  const key = 'fake-signature-key-worcester';
  const url = 'https://tkd-dashboard.pages.dev/api/square/breaking/worcester';
  const body = '{"a":1}';
  const good = await computeSquareSignature(key, url, body);
  const check = (overrides) => verifySquareSignature({ signatureKey: key, notificationUrl: url, rawBody: body, header: good, ...overrides });
  assert.equal(await check({}), true);
  assert.equal(await check({ signatureKey: 'another-key' }), false);
  assert.equal(await check({ notificationUrl: `${url}/` }), false);
  assert.equal(await check({ rawBody: '{"a":2}' }), false);
  assert.equal(await check({ header: `${good}A` }), false);
  assert.equal(await check({ header: good.slice(0, -1) }), false);
  assert.equal(await check({ header: '' }), false);
  assert.equal(await check({ header: null }), false);
  assert.equal(await check({ signatureKey: '' }), false);
  assert.equal(await check({ signatureKey: undefined }), false);
  assert.equal(await check({ notificationUrl: '' }), false);
  assert.equal(await check({ rawBody: undefined }), false);
});

// ---------- the Square webhook --------------------------------------------------------------

const LOCATIONS = { worcester: SQUARE_SECRETS.SQUARE_LOCATION_ID_WORCESTER, shrewsbury: SQUARE_SECRETS.SQUARE_LOCATION_ID_SHREWSBURY };
const EVENT_ID = 'square-event-id-5f3a';
const PAYMENT_ID = 'square-payment-id-77aa';
const message = (overrides = {}, payment = {}) => ({
  merchant_id: 'MERCHANT', type: 'payment.updated', event_id: EVENT_ID,
  data: { type: 'payment', id: PAYMENT_ID, object: { payment: {
    id: PAYMENT_ID, order_id: ORDER_ID, location_id: LOCATIONS.worcester, status: 'COMPLETED', amount_money: { amount: 4000, currency: 'USD' }, card_details: { last_4: '1111' }, ...payment,
  } } },
  ...overrides,
});

// A webhook request for `school`, signed (by default) with that school's key and URL.
async function hookRequest({ school = 'worcester', body = message({}, { location_id: LOCATIONS[school] }), method = 'POST', key, url, signature, header = true, extraHeaders = {} } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const suffix = school.toUpperCase();
  const signed = signature ?? await computeSquareSignature(key ?? WEBHOOK_SECRETS[`SQUARE_WEBHOOK_SIGNATURE_KEY_${suffix}`] ?? 'k', url ?? WEBHOOK_SECRETS[`SQUARE_WEBHOOK_URL_${suffix}`] ?? 'https://x.example/', raw);
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (header) headers['x-square-hmacsha256-signature'] = signed;
  const init = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') init.body = raw;
  return new Request(`${ORIGIN}/api/square/breaking/${school}`, init);
}

function fakeSquareDb(answer = { status: 'ok', outcome: 'paid' }) {
  const log = { opened: 0, calls: [], closed: 0 };
  const openDatabase = () => {
    log.opened += 1;
    return {
      async squarePayment(args) {
        log.calls.push(args);
        const out = typeof answer === 'function' ? answer(args) : answer;
        if (out instanceof Error) throw out;
        return out;
      },
      async close() { log.closed += 1; },
    };
  };
  return { openDatabase, log };
}

async function hook({ school = 'worcester', env = goodEnv(), answer, request, requestOptions = {} } = {}) {
  const database = fakeSquareDb(answer);
  const waits = [];
  const ctx = {
    request: request ?? await hookRequest({ school, ...requestOptions }),
    env, params: { school }, waitUntil: (p) => waits.push(p), waits,
  };
  const out = await run(handleWebhook, ctx, database);
  return { ...out, db: database.log };
}

test('webhook: a good message → the database is called once with the SCHOOL FROM THE PATH and the mapped fields; 200', async () => {
  const out = await hook({});
  assert.equal(out.http, 200);
  assert.deepEqual(out.db.calls, [{ school: 'worcester', eventId: EVENT_ID, paymentId: PAYMENT_ID, orderId: ORDER_ID, amountCents: 4000, currency: 'USD', status: 'COMPLETED' }]);
  assert.equal(out.db.closed, 1);
  const second = await hook({ school: 'shrewsbury' });
  assert.equal(second.db.calls[0].school, 'shrewsbury');
});

test('webhook: the school in the message body is ignored — only the path decides', async () => {
  const sneaky = message({ school: 'shrewsbury', location_code: 'shrewsbury' });
  sneaky.data.object.payment.school = 'shrewsbury';
  const out = await hook({ school: 'worcester', requestOptions: { body: sneaky } });
  assert.equal(out.db.calls[0].school, 'worcester');
});

test('webhook: only POST (405) and only worcester / shrewsbury in the path (404); the database is never opened', async () => {
  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const out = await hook({ requestOptions: { method } });
    assert.equal(out.http, 405, method);
    assert.equal(out.db.opened, 0);
  }
  for (const school of ['boston', 'WORCESTER', 'Worcester', '', 'worcester ', '../worcester', 'both']) {
    const out = await hook({ school, request: await hookRequest({ school: 'worcester' }) });
    assert.equal(out.http, 404, JSON.stringify(school));
    assert.equal(out.db.opened, 0);
  }
});

test('webhook: any missing setting for that school → 503 and NO database call; the other school is not affected', async () => {
  const gaps = [
    { SQUARE_WEBHOOK_SIGNATURE_KEY_WORCESTER: undefined }, { SQUARE_WEBHOOK_SIGNATURE_KEY_WORCESTER: '' },
    { SQUARE_WEBHOOK_URL_WORCESTER: undefined }, { SQUARE_WEBHOOK_URL_WORCESTER: '' },
    { SQUARE_LOCATION_ID_WORCESTER: undefined }, { SQUARE_LOCATION_ID_WORCESTER: '' },
    { HYPERDRIVE_BREAKING_SQUARE: undefined }, { HYPERDRIVE_BREAKING_SQUARE: { connectionString: '' } },
  ];
  for (const gap of gaps) {
    const out = await hook({ env: goodEnv(gap), requestOptions: { key: WEBHOOK_SECRETS.SQUARE_WEBHOOK_SIGNATURE_KEY_WORCESTER } });
    assert.equal(out.http, 503, JSON.stringify(gap));
    assert.equal(out.db.opened, 0);
  }
  const fine = await hook({ school: 'shrewsbury', env: goodEnv({ SQUARE_WEBHOOK_SIGNATURE_KEY_WORCESTER: undefined }) });
  assert.equal(fine.http, 200);
  assert.equal(fine.db.calls.length, 1);
  // The family sign-up switch has nothing to do with the webhook: payments for people already registered still arrive.
  const off = await hook({ env: goodEnv({ BREAKING_REGISTRATION: 'off' }) });
  assert.equal(off.http, 200);
});

test('webhook: no, wrong, tampered or other-school signatures → 403 and the database is never called', async () => {
  const body = JSON.stringify(message());
  const worcesterKey = WEBHOOK_SECRETS.SQUARE_WEBHOOK_SIGNATURE_KEY_WORCESTER;
  const worcesterUrl = WEBHOOK_SECRETS.SQUARE_WEBHOOK_URL_WORCESTER;
  const shrewsburyKey = WEBHOOK_SECRETS.SQUARE_WEBHOOK_SIGNATURE_KEY_SHREWSBURY;
  const shrewsburyUrl = WEBHOOK_SECRETS.SQUARE_WEBHOOK_URL_SHREWSBURY;
  const cases = {
    'no header': { header: false },
    'empty header': { signature: '' },
    'garbage header': { signature: 'AAAA' },
    'right length, wrong value': { signature: 'A'.repeat(44) },
    'wrong key': { key: 'not-the-key' },
    'the OTHER school\'s key on the right URL': { key: shrewsburyKey },
    'the OTHER school\'s key and URL (a Shrewsbury message sent to the Worcester address)': { key: shrewsburyKey, url: shrewsburyUrl },
    'wrong URL in the signed string': { url: 'https://evil.example/api/square/breaking/worcester' },
    'URL with a trailing slash': { url: `${worcesterUrl}/` },
    'signature of a different body': { signature: await computeSquareSignature(worcesterKey, worcesterUrl, `${body} `) },
  };
  for (const [name, options] of Object.entries(cases)) {
    const out = await hook({ requestOptions: { body, ...options } });
    assert.equal(out.http, 403, name);
    assert.equal(out.db.opened, 0, name);
  }
  // The body is changed after it was signed.
  const signed = await computeSquareSignature(worcesterKey, worcesterUrl, body);
  const tampered = await hook({ requestOptions: { body: body.replace('4000', '1'), signature: signed } });
  assert.equal(tampered.http, 403);
  assert.equal(tampered.db.opened, 0);
  // A body that is oversize, or not readable text, is refused as well (it can't be verified).
  const big = await hook({ requestOptions: { body: 'x'.repeat(MAX_WEBHOOK_BODY_BYTES + 1) } });
  assert.equal(big.http, 403);
  assert.equal(big.db.opened, 0);
  // Signed for Shrewsbury but posted to the Worcester path: refused (and the reverse).
  const crossed = await hook({ school: 'worcester', request: await hookRequest({ school: 'shrewsbury' }) });
  assert.equal(crossed.http, 403);
  assert.equal(crossed.db.opened, 0);
  const crossed2 = await hook({ school: 'shrewsbury', request: await hookRequest({ school: 'worcester' }) });
  assert.equal(crossed2.http, 403);
});

test('webhook: the signature is checked BEFORE the body is parsed (a signed-but-broken body is 400, an unsigned broken body is 403)', async () => {
  const unsigned = await hook({ requestOptions: { body: '{not json', signature: 'AAAA' } });
  assert.equal(unsigned.http, 403);
  for (const body of ['{not json', '[]', '"x"', 'null', '']) {
    const out = await hook({ requestOptions: { body } });
    assert.equal(out.http, 400, body);
    assert.equal(out.db.opened, 0);
  }
});

test('webhook: any type except payment.updated is ignored with 200 (so Square stops retrying), no database call', async () => {
  for (const type of ['order.created', 'payment.created', 'refund.updated', 'PAYMENT.UPDATED', undefined, 5]) {
    const out = await hook({ requestOptions: { body: message({ type }) } });
    assert.equal(out.http, 200, String(type));
    assert.deepEqual(out.json, { status: 'ignored' });
    assert.equal(out.db.opened, 0);
  }
});

test('webhook: a signed message with missing or odd fields → 400; a payment with no order is ignored (200)', async () => {
  const broken = [
    message({ event_id: undefined }), message({ event_id: '' }), message({ event_id: 5 }), message({ event_id: 'x'.repeat(201) }),
    message({}, { id: undefined }), message({}, { status: undefined }), message({}, { status: 5 }),
    message({}, { amount_money: undefined }), message({}, { amount_money: { amount: '4000', currency: 'USD' } }),
    message({}, { amount_money: { amount: 40.5, currency: 'USD' } }), message({}, { amount_money: { amount: -1, currency: 'USD' } }),
    message({}, { amount_money: { amount: 4000 } }), message({}, { amount_money: { amount: 4000, currency: 5 } }),
  ];
  for (const body of broken) {
    const out = await hook({ requestOptions: { body } });
    assert.equal(out.http, 400, JSON.stringify(body));
    assert.equal(out.db.opened, 0);
  }
  // No payment object at all → it has no location, so it is not ours: ignored.
  for (const body of [message({ data: undefined }), message({ data: { object: {} } }), message({ data: { object: { payment: 'x' } } })]) {
    const out = await hook({ requestOptions: { body } });
    assert.equal(out.http, 200);
    assert.deepEqual(out.json, { status: 'ignored' });
    assert.equal(out.db.opened, 0);
  }
  for (const order_id of [undefined, '', null]) {
    const out = await hook({ requestOptions: { body: message({}, { order_id }) } });
    assert.equal(out.http, 200);
    assert.deepEqual(out.json, { status: 'ignored' });
    assert.equal(out.db.opened, 0);
  }
});

test('webhook: the status is passed on as Square sent it (the database decides what counts); the amount is an integer of cents', async () => {
  const out = await hook({ requestOptions: { body: message({}, { status: 'APPROVED', amount_money: { amount: 123, currency: 'USD' } }) }, answer: { status: 'ok', outcome: 'not_completed' } });
  assert.equal(out.http, 200);
  assert.equal(out.db.calls[0].status, 'APPROVED');
  assert.equal(out.db.calls[0].amountCents, 123);
  assert.equal(Number.isInteger(out.db.calls[0].amountCents), true);
  assert.equal(mapPayment(message()).amountCents, 4000);
  assert.equal(mapPayment(message({}, { amount_money: { amount: 2 ** 53, currency: 'USD' } })), null);
});

test('webhook: EVERY database outcome (and any odd answer) → 200', async () => {
  for (const outcome of ['paid', 'duplicate', 'unknown_order', 'amount_mismatch', 'not_card', 'not_completed', 'already_paid', 'wrong_school', 'link_cleared', 'something_new']) {
    const out = await hook({ answer: { status: 'ok', outcome, registration_id: REGISTRATION_ID } });
    assert.equal(out.http, 200, outcome);
    assert.deepEqual(out.json, { status: 'ok' });
    assert.ok(!out.text.includes(REGISTRATION_ID));
  }
  for (const answer of [{ status: 'invalid' }, { status: 'no_access' }, {}, null, undefined, 'text']) {
    const out = await hook({ answer });
    assert.equal(out.http, 200, JSON.stringify(answer));
    assert.deepEqual(out.json, { status: 'ok' });
  }
});

test('webhook: a database error → 500 (Square will retry), with no error text and the connection closed', async () => {
  const out = await hook({ answer: new Error('connection refused password=hunter2') });
  assert.equal(out.http, 500);
  assert.ok(!out.text.includes('hunter2'));
  assert.equal(out.db.closed, 1);
});

test('webhook logs: only {fn, outcome, ms} — never the body, a signature, a key, an id or an error text', async () => {
  const forbidden = [EVENT_ID, PAYMENT_ID, ORDER_ID, REGISTRATION_ID, 'fake-signature-key', 'hunter2', 'COMPLETED', '4000', 'postgres://',
    'tkd-dashboard.pages.dev', '1111', 'SOME-OTHER-LOCATION', 'LOC-WORCESTER'];
  const runs = [
    () => hook({}), () => hook({ school: 'shrewsbury' }), () => hook({ answer: { status: 'ok', outcome: 'amount_mismatch', registration_id: REGISTRATION_ID } }),
    () => hook({ answer: new Error('hunter2') }), () => hook({ requestOptions: { signature: 'AAAA' } }), () => hook({ requestOptions: { body: '{bad' } }),
    () => hook({ requestOptions: { body: message({ type: 'order.created' }) } }), () => hook({ requestOptions: { method: 'GET' } }),
    () => hook({ env: goodEnv({ HYPERDRIVE_BREAKING_SQUARE: undefined }) }),
    () => hook({ answer: { status: 'invalid', field: 'amount', registration_id: REGISTRATION_ID } }),
    () => hook({ answer: { status: 'Weird Status 42' } }),
    () => hook({ requestOptions: { body: message({}, { location_id: 'SOME-OTHER-LOCATION' }) } }),
  ];
  const expectedOutcomes = ['paid', 'paid', 'amount_mismatch', 'db_error', 'bad_signature', 'bad_body', 'ignored', 'method', 'not_configured', 'invalid', 'other', 'other_location'];
  const results = [];
  for (const start of runs) results.push(await start()); // one after the other: each run swaps console.log
  results.forEach((out, i) => {
    assert.equal(out.lines.length, 1);
    const line = JSON.parse(out.lines[0]);
    assert.deepEqual(Object.keys(line).sort(), ['fn', 'ms', 'outcome']);
    assert.equal(line.fn, 'breaking_webhook');
    assert.equal(line.outcome, expectedOutcomes[i]);
    for (const word of forbidden) assert.ok(!out.lines[0].includes(word), word);
  });
});

test('webhook: only payments at THIS school\'s Square location reach the database; any other or missing location → 200 ignored', async () => {
  const match = await hook({ requestOptions: { body: message({}, { location_id: 'LOC-WORCESTER' }) } });
  assert.equal(match.db.calls.length, 1);
  for (const location_id of ['LOC-SHREWSBURY', 'other', '', null, undefined, 5]) {
    const out = await hook({ requestOptions: { body: message({}, { location_id }) } });
    assert.equal(out.http, 200, String(location_id));
    assert.deepEqual(out.json, { status: 'ignored' });
    assert.equal(out.db.opened, 0, String(location_id));
  }
  // Shrewsbury's location is checked against Shrewsbury's setting, not Worcester's.
  const crossed = await hook({ school: 'shrewsbury', requestOptions: { body: message({}, { location_id: 'LOC-WORCESTER' }) } });
  assert.deepEqual(crossed.json, { status: 'ignored' });
  assert.equal(crossed.db.opened, 0);
  const own = await hook({ school: 'shrewsbury', requestOptions: { body: message({}, { location_id: 'LOC-SHREWSBURY' }) } });
  assert.equal(own.db.calls[0].school, 'shrewsbury');
});

test('webhook: a body that is not UTF-8 text → 403 (it cannot be verified), no database call', async () => {
  const request = new Request(`${ORIGIN}/api/square/breaking/worcester`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-square-hmacsha256-signature': 'AAAA' }, body: new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]),
  });
  const out = await hook({ request });
  assert.equal(out.http, 403);
  assert.equal(out.db.opened, 0);
});

test('webhook: a body with no Content-Length that grows past 64 KB is refused while it is being read', async () => {
  let pulled = 0;
  const body = new ReadableStream({
    pull(controller) { pulled += 1; controller.enqueue(new Uint8Array(16 * 1024)); if (pulled > 50) controller.close(); },
  });
  const request = new Request(`${ORIGIN}/api/square/breaking/worcester`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-square-hmacsha256-signature': 'AAAA' }, body, duplex: 'half',
  });
  assert.equal(request.headers.get('Content-Length'), null);
  const out = await hook({ request });
  assert.equal(out.http, 403);
  assert.equal(out.db.opened, 0);
  assert.ok(pulled < 10, 'stopped reading early: ' + pulled);
});

test('Square never answers: the request is cut off by the timeout; the family is still registered (pay failed, status ok)', async () => {
  let aborted = false;
  const square = (url, init) => new Promise((resolve, reject) => {
    assert.ok(init.signal, 'a timeout signal is passed to fetch');
    assert.equal(init.redirect, 'error');
    init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
  });
  const out = await post({
    db: { signup: signupOk('card'), registration: registrationOk(), event: eventAt('worcester'), setLink: { status: 'ok' } },
    fetches: { square }, deps: { squareTimeoutMs: 20 },
  });
  assert.equal(aborted, true);
  assert.deepEqual(out.json, { status: 'ok', amount_cents: 4000, paying_by: 'card', same_day: false, pay: { state: 'failed' } });
  assert.ok(!out.db.calls.some(([name]) => name === 'publicSetLink'));
});

test('payment links: only Square\'s own hosts (the same list as brk_public_set_link), https, no user name, no port', async () => {
  const hosts = ['square.link', 'checkout.square.site', 'connect.squareup.com', 'sandbox.square.link', 'connect.squareupsandbox.com', 'checkout.squareupsandbox.com'];
  const migration = readFileSync(new URL('../../supabase/migrations/0051_board_breaking.sql', import.meta.url), 'utf8');
  for (const host of hosts) assert.ok(migration.includes(`'${host}'`), `${host} is in the migration's list`);
  for (const host of hosts) {
    const out = await post({ db: { signup: signupOk('card'), registration: registrationOk({ has_link: true, link_url: `https://${host}/u/abc` }) } });
    assert.equal(out.json.pay.state, 'link', host);
  }
  const bad = ['https://evil.example/u/abc', 'https://square.link.evil.example/u/abc', 'https://evilsquare.link/u/abc', 'https://user@square.link/u/abc',
    'https://square.link:8443/u/abc', 'https://square.link@evil.example/u', 'http://square.link/u/abc', 'ftp://square.link/u', 'https://square.link/u/a b',
    'https://SQUARE.LINK.evil.example/', 'https://square.link\\@evil.example/', `https://square.link/${'a'.repeat(2000)}`];
  for (const link_url of bad) {
    // A stored link that fails the check is never handed out (a fresh one is made instead)...
    const stored = await post({ db: { signup: signupOk('card'), registration: registrationOk({ has_link: true, link_url }), event: eventAt('worcester'), setLink: { status: 'ok' } } });
    assert.equal(stored.squareCalls.length, 1, link_url);
    // ...and a link Square answered with is refused the same way.
    const fromSquare = await post({
      db: { signup: signupOk('card'), registration: registrationOk(), event: eventAt('worcester'), setLink: { status: 'ok' } },
      fetches: { square: new Response(JSON.stringify({ payment_link: { url: link_url, order_id: ORDER_ID } }), { status: 200 }) },
    });
    assert.deepEqual(fromSquare.json.pay, { state: 'failed' }, link_url);
  }
  // An upper-case host is compared in small letters, like the database does.
  const upper = await post({ db: { signup: signupOk('card'), registration: registrationOk({ has_link: true, link_url: 'https://SQUARE.link/u/abc' }) } });
  assert.equal(upper.json.pay.state, 'link');
});

test('the payment note is cut by whole characters: an emoji is never split into a broken half', async () => {
  const seen = fakeFetch();
  const base = { fetchImpl: seen.fetchImpl, env: goodEnv(), school: 'worcester', registrationId: REGISTRATION_ID, balanceCents: 100, code: CODE, publicOrigin: ORIGIN };
  for (const firstName of ['🥋'.repeat(100), 'a'.repeat(59) + '🥋🥋', '🥋'.repeat(60)]) {
    await createPaymentLink({ ...base, firstName });
    const name = seen.squareCalls.at(-1).body.quick_pay.name;
    assert.equal(name.isWellFormed(), true);
    assert.ok(Array.from(name.slice('Board Breaking — '.length)).length <= 60);
  }
});

test('the database file has no unsafe( and names no database function outside the allowed five', () => {
  const source = readFileSync(new URL('../_lib/brkDb.js', import.meta.url), 'utf8');
  assert.ok(!source.includes('unsafe('));
  const names = [...new Set([...source.matchAll(/public\.(brk_[a-z_]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(names, ['brk_public_event', 'brk_public_registration', 'brk_public_set_link', 'brk_public_signup', 'brk_square_payment']);
});

test('webhook: a good signed message is processed with NO Origin, with a foreign Origin, and with no client address — no Origin check, no family limiter', async () => {
  const cases = {
    'no Origin header, no CF-Connecting-IP': {},
    'a foreign Origin': { Origin: 'https://evil.example' },
    'a foreign Origin, Referer and Host': { Origin: 'https://evil.example', Referer: 'https://evil.example/x', 'X-Forwarded-Host': 'evil.example' },
    'a client address': { 'CF-Connecting-IP': '203.0.113.7' },
  };
  for (const [name, extraHeaders] of Object.entries(cases)) {
    const out = await hook({ requestOptions: { extraHeaders } });
    assert.equal(out.http, 200, name);
    assert.equal(out.db.calls.length, 1, name);
  }
});

test('webhook: 300 good messages in a row from one client address are ALL processed (the family rate limiter is not in the path)', async () => {
  let limiterAsked = 0;
  const env = goodEnv({ RATE_LIMITER: { limit: async () => { limiterAsked += 1; return { success: false }; } } });
  const memoryLimiter = { allow: () => { limiterAsked += 1; return false; } };
  const database = fakeSquareDb();
  for (let i = 0; i < 300; i += 1) {
    const request = await hookRequest({ extraHeaders: { 'CF-Connecting-IP': '203.0.113.7' } });
    const out = await run(handleWebhook, { request, env, params: { school: 'worcester' }, waitUntil: () => {} }, { ...database, memoryLimiter });
    assert.equal(out.http, 200, 'message ' + i);
  }
  assert.equal(database.log.calls.length, 300);
  assert.equal(limiterAsked, 0, 'no rate limiter was ever asked');
  // The source files do not even import the family-form helpers.
  for (const file of ['../_lib/breakingWebhook.js', '../api/square/breaking/[school].js', '../_lib/squareSignature.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    for (const word of ['matchOrigin', 'allowRequest', 'makeClientKey', 'rateLimit', 'clientKey', 'origins.js']) assert.ok(!source.includes(word), file + ' uses ' + word);
  }
});

test('webhook: EVERY answer (200, 403, 400, 404, 405, 500, 503) carries no-store, nosniff and a JSON content type, set in code', async () => {
  const answers = {
    200: await hook({}),
    403: await hook({ requestOptions: { signature: 'AAAA' } }),
    400: await hook({ requestOptions: { body: '{bad' } }),
    404: await hook({ school: 'boston', request: await hookRequest({ school: 'worcester' }) }),
    405: await hook({ requestOptions: { method: 'GET' } }),
    500: await hook({ answer: new Error('boom') }),
    503: await hook({ env: goodEnv({ HYPERDRIVE_BREAKING_SQUARE: undefined }) }),
  };
  for (const [status, out] of Object.entries(answers)) {
    assert.equal(out.http, Number(status));
    assert.equal(out.response.headers.get('Cache-Control'), 'no-store', status);
    assert.equal(out.response.headers.get('X-Content-Type-Options'), 'nosniff', status);
    assert.ok(out.response.headers.get('Content-Type').startsWith('application/json'), status);
  }
  // The "ignored" 200 too, and the entry point's own 405.
  const ignored = await hook({ requestOptions: { body: message({ type: 'order.created' }) } });
  assert.equal(ignored.response.headers.get('Cache-Control'), 'no-store');
  const hookFile = await import('../api/square/breaking/[school].js');
  const viaEntry = await hookFile.onRequest({ request: new Request(`${ORIGIN}/api/square/breaking/worcester`, { method: 'PUT' }), env: goodEnv(), params: { school: 'worcester' } });
  assert.equal(viaEntry.status, 405);
  assert.equal(viaEntry.headers.get('Cache-Control'), 'no-store');
  assert.equal(viaEntry.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('Square return address: built ONLY from the origin matchOrigin returned; Host, X-Forwarded-Host and Referer never change it', async () => {
  const PUBLIC_ORIGIN = 'https://forms.ustaekwondo.net,https://tkd-dashboard.pages.dev';
  const forged = { Host: 'evil.example', 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'http', Referer: 'https://evil.example/breaking/x', Forwarded: 'host=evil.example' };
  for (const listed of PUBLIC_ORIGIN.split(',')) {
    for (const headers of [{}, forged]) {
      const out = await post({
        env: goodEnv({ PUBLIC_ORIGIN }), origin: listed, headers,
        fetches: { turnstile: turnstileFor(BREAKING_SIGNUP_ACTION, new URL(listed).hostname) },
        db: { signup: signupOk('card'), registration: registrationOk(), event: eventAt('worcester'), setLink: { status: 'ok' } },
      });
      assert.equal(out.json.pay.state, 'link', listed);
      assert.equal(out.squareCalls[0].body.checkout_options.redirect_url, `${listed}/breaking/${CODE}?paid=1`);
      assert.ok(!JSON.stringify(out.squareCalls[0].body).includes('evil.example'));
    }
  }
});
