// forms.test.mjs — tests for the Forms public Function (/api/forms/<slug>, build step F3).
// Why it exists: like Color Belt's registration Function, this is a public, signed-out way into
// the database, so every check it makes is proven here before it goes anywhere near Cloudflare.
// Same style as register.test.mjs.
// How to run (from the project folder):   node --test functions/tests/
//
// Nothing real is used: a FAKE database (records what it was asked and answers what each test
// says) and a FAKE Turnstile (a pretend fetch that answers like Cloudflare's siteverify).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleGet, handlePost, handleOther, readSlug } from '../_lib/forms/forms.js';
import { makeClientKey as formsClientKey } from '../_lib/forms/clientKey.js';
import { makeClientKey as registerClientKey } from '../_lib/clientKey.js';
import { MemoryRateLimiter } from '../_lib/forms/rateLimit.js';
import { verifyTurnstile } from '../_lib/forms/turnstile.js';

// ---------- helpers -------------------------------------------------------------------------

const ORIGIN = 'https://tkd-dashboard.pages.dev';
const SUBMISSION_KEY = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
const CLASS_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const KIOSK = 'ab'.repeat(32); // 64 hex characters, like forms_kiosk_token makes
const SIGNATURE = 'data:image/png;base64,' + 'A'.repeat(300);

// A complete, correct set of settings. Tests remove or change one thing at a time.
function goodEnv(overrides = {}) {
  return {
    PUBLIC_FORMS: 'on',
    HYPERDRIVE_FORMS: { connectionString: 'postgres://fake' },
    TURNSTILE_SECRET: 'turnstile-secret-for-tests',
    CLIENT_KEY_SECRET: 'client-key-secret-for-tests',
    PUBLIC_ORIGIN: ORIGIN,
    TURNSTILE_SITE_KEY: 'public-site-key',
    ...overrides,
  };
}

// A fake database. `get` / `submit` = what publicGet / publicSubmit return (or a function that
// throws). It remembers every call and whether close() was called.
function fakeDb({ get, submit } = {}) {
  const log = { opened: 0, calls: [], closed: 0 };
  const openDatabase = () => {
    log.opened += 1;
    return {
      async publicGet(slug) {
        log.calls.push(['publicGet', slug]);
        if (typeof get === 'function') return get(slug);
        return get;
      },
      async publicSubmit(args) {
        log.calls.push(['publicSubmit', args]);
        if (typeof submit === 'function') return submit(args);
        return submit;
      },
      async close() {
        log.closed += 1;
      },
    };
  };
  return { openDatabase, log };
}

// A fake fetch that answers like Turnstile's siteverify.
function fakeTurnstile(result = { success: true, hostname: 'tkd-dashboard.pages.dev', action: 'form' }) {
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
    submission_key: SUBMISSION_KEY,
    published_version: 3,
    answers: { parent_name: 'Ana Lopez', parent_phone: '508-555-0100', parent_email: 'ana@example.com' },
    children: [{ first_name: 'Mia', age: 7 }],
    bookings: [{ child: 0, class_id: CLASS_ID, date: '2026-11-03', starts_at: '16:00' }],
    signature: SIGNATURE,
    website: '',
    started_at: 1_000_000,
    sent_at: 1_060_000, // a minute later
    turnstile_token: 'token-from-the-page',
    ...overrides,
  };
}

// A Pages-style context: request + env + params + waitUntil (which collects promises).
function context({ method = 'POST', env = goodEnv(), slug = 'free-class', body, headers = {} } = {}) {
  const waits = [];
  const init = { method, headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headers } };
  if (method === 'POST') init.body = typeof body === 'string' ? body : JSON.stringify(body ?? goodBody());
  return {
    request: new Request(`${ORIGIN}/api/forms/${encodeURIComponent(slug)}`, init),
    env,
    params: { slug },
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

const TIME = { class_id: CLASS_ID, class_name: 'Little Tigers', date: '2026-11-03', starts_at: '16:00', ends_at: '16:40', spots_left: 2 };

// What forms_public_get answers for a Live form (+ one extra field that must NOT be passed on).
const okGet = {
  status: 'ok',
  form_name: 'Free class',
  fields: [{ id: 'parent_name', type: 'text', label: 'Your name', required: true }],
  published_version: 3,
  school_name: 'Worcester',
  school_phone: '508-555-0199',
  thank_you: 'See you soon!',
  add_to_calendar: true,
  times: [{ ...TIME, internal_note: 'must not be passed on' }],
  alert_email: 'must not be passed on',
};

// What forms_public_submit answers for a saved sign-up.
const okSubmit = {
  status: 'ok',
  id: 'c3d4e5f6-0000-4000-8000-000000000001',
  repeat: false,
  bookings: [{ child: 0, class_name: 'Little Tigers', date: '2026-11-03', starts_at: '16:00', ends_at: '16:40', extra: 'x' }],
};

// ---------- GET -----------------------------------------------------------------------------

test('GET: kill switch off or missing → not_open, database never opened', async () => {
  for (const value of ['off', undefined, 'ON', '', 'true']) {
    const db = fakeDb({ get: okGet });
    const r = await run(handleGet, context({ method: 'GET', env: goodEnv({ PUBLIC_FORMS: value }) }), { openDatabase: db.openDatabase });
    assert.deepEqual(r.json, { status: 'not_open' }, String(value));
    assert.equal(db.log.opened, 0);
  }
});

test('GET: a missing binding or setting → not_open (fail closed)', async () => {
  for (const missing of ['HYPERDRIVE_FORMS', 'TURNSTILE_SECRET', 'CLIENT_KEY_SECRET', 'PUBLIC_ORIGIN', 'TURNSTILE_SITE_KEY']) {
    const env = goodEnv();
    delete env[missing];
    const db = fakeDb({ get: okGet });
    const r = await run(handleGet, context({ method: 'GET', env }), { openDatabase: db.openDatabase });
    assert.deepEqual(r.json, { status: 'not_open' }, missing);
    assert.equal(db.log.opened, 0);
  }
  // Color Belt's binding is NOT enough: Forms needs its own.
  const env = goodEnv({ HYPERDRIVE: { connectionString: 'postgres://colour-belt' } });
  delete env.HYPERDRIVE_FORMS;
  const r = await run(handleGet, context({ method: 'GET', env }), { openDatabase: fakeDb({ get: okGet }).openDatabase });
  assert.deepEqual(r.json, { status: 'not_open' });
});

test('GET Live form: the fixed list only + the Turnstile site key, no-store, client closed', async () => {
  const db = fakeDb({ get: okGet });
  const r = await run(handleGet, context({ method: 'GET', slug: 'Free-Class' }), { openDatabase: db.openDatabase });
  assert.equal(r.http, 200);
  assert.deepEqual(r.json, {
    status: 'ok',
    form_name: 'Free class',
    fields: okGet.fields,
    published_version: 3,
    school_name: 'Worcester',
    school_phone: '508-555-0199',
    thank_you: 'See you soon!',
    add_to_calendar: true,
    times: [TIME],
    turnstile_site_key: 'public-site-key',
  });
  assert.equal(r.response.headers.get('Cache-Control'), 'no-store');
  assert.match(r.response.headers.get('Content-Type'), /^application\/json/);
  assert.deepEqual(db.log.calls, [['publicGet', 'free-class']]); // lower-cased
  assert.equal(db.log.closed, 1);
});

test('GET Closed form → closed + school name/phone; Draft or unknown → not_found', async () => {
  const closed = await run(handleGet, context({ method: 'GET' }), {
    openDatabase: fakeDb({ get: { status: 'closed', school_name: 'Shrewsbury', school_phone: null, extra: 'x' } }).openDatabase,
  });
  assert.deepEqual(closed.json, { status: 'closed', school_name: 'Shrewsbury', school_phone: null });
  // The database answers not_found for a Draft and for a slug that doesn't exist.
  const missing = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ get: { status: 'not_found' } }).openDatabase });
  assert.deepEqual(missing.json, { status: 'not_found' });
});

test('GET: a Live answer with a broken field list or version → unavailable (fail closed)', async () => {
  for (const broken of [{ fields: null }, { fields: '[]' }, { published_version: '3' }, { published_version: undefined }]) {
    const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ get: { ...okGet, ...broken } }).openDatabase });
    assert.deepEqual(r.json, { status: 'unavailable' }, JSON.stringify(broken));
  }
  // add_to_calendar is true only when the database says exactly true.
  const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ get: { ...okGet, add_to_calendar: 'yes', times: null } }).openDatabase });
  assert.equal(r.json.add_to_calendar, false);
  assert.deepEqual(r.json.times, []);
});

test('GET: an unexpected database answer → unavailable', async () => {
  for (const answer of [{ status: 'something_new' }, { status: 'no_access' }, null, undefined]) {
    const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ get: answer }).openDatabase });
    assert.deepEqual(r.json, { status: 'unavailable' }, JSON.stringify(answer));
  }
});

test('GET: database error → unavailable, no error text leaked', async () => {
  const db = fakeDb({ get: () => { throw new Error('password authentication failed for user forms_registrar'); } });
  const r = await run(handleGet, context({ method: 'GET' }), { openDatabase: db.openDatabase });
  assert.deepEqual(r.json, { status: 'unavailable' });
  assert.doesNotMatch(r.text, /password|forms_registrar/);
  assert.equal(db.log.closed, 1);
});

// ---------- slugs ---------------------------------------------------------------------------

test('slug rule: 3–40 lowercase letters, digits and dashes, not starting/ending with a dash, not reserved', () => {
  for (const ok of ['abc', 'free-class', 'a1b', 'x'.repeat(40), 'trial-2026', 'FREE-CLASS']) {
    assert.ok(readSlug({ slug: ok }), ok);
  }
  for (const bad of ['ab', 'x'.repeat(41), '-abc', 'abc-', 'ab_c', 'ab c', 'abç', "x'; drop--", '', 'api', 'admin', 'new', 'edit', 'kiosk', 'preview', 'assets', 'static', 'forms', 'login', 'a/b', '../etc']) {
    assert.equal(readSlug({ slug: bad }), null, bad);
  }
  assert.equal(readSlug({}), null);
  assert.equal(readSlug({ slug: 42 }), null);
  assert.equal(readSlug({ slug: ['free-class'] }), 'free-class');
});

test('a slug that cannot exist → not_found, no rate-limit allowance used, no database', async () => {
  for (const slug of ['ab', '-abc', 'abc-', 'ab_c', 'api', 'kiosk', 'x'.repeat(41), "x'; drop--"]) {
    for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
      const db = fakeDb({ get: okGet, submit: okSubmit });
      const memoryLimiter = new MemoryRateLimiter({ limit: 1 });
      const r = await run(handler, context({ method, slug }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl, memoryLimiter });
      assert.deepEqual(r.json, { status: 'not_found' }, `${method} ${slug}`);
      assert.equal(db.log.opened, 0, `${method} ${slug}: database must not be opened`);
      // The one request this client is allowed is still unused: a real slug gets through.
      const ok = await run(handler, context({ method }), { openDatabase: fakeDb({ get: okGet, submit: okSubmit }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl, memoryLimiter });
      assert.equal(ok.json.status, 'ok', `${method} ${slug}: allowance must not be used`);
    }
  }
});

// ---------- POST: the checks before Turnstile ---------------------------------------------

// Every refusal here must happen WITHOUT asking Turnstile or the database.
async function expectRefused(ctx, expected) {
  const db = fakeDb({ submit: okSubmit });
  const ts = fakeTurnstile();
  const r = await run(handlePost, ctx, { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl });
  assert.deepEqual(r.json, expected);
  assert.equal(r.http, expected.status === 'bad_request' ? 400 : 200);
  assert.equal(db.log.opened, 0, 'database must not be opened');
  assert.equal(ts.seen.length, 0, 'Turnstile must not be asked');
}

test('POST: kill switch off / missing / missing binding or setting → not_open', async () => {
  for (const value of ['off', undefined, 'On', '']) {
    await expectRefused(context({ env: goodEnv({ PUBLIC_FORMS: value }) }), { status: 'not_open' });
  }
  for (const missing of ['HYPERDRIVE_FORMS', 'TURNSTILE_SECRET', 'CLIENT_KEY_SECRET', 'PUBLIC_ORIGIN', 'TURNSTILE_SITE_KEY']) {
    await expectRefused(context({ env: goodEnv({ [missing]: undefined }) }), { status: 'not_open' });
  }
  await expectRefused(context({ env: goodEnv({ HYPERDRIVE_FORMS: {} }) }), { status: 'not_open' });
});

test('POST: PUBLIC_ORIGIN that is not a web address → not_open', async () => {
  const env = goodEnv({ PUBLIC_ORIGIN: 'not a url' });
  await expectRefused(context({ env, headers: { Origin: 'not a url' } }), { status: 'not_open' });
});

test('POST: wrong or missing Origin → bad_request (HTTP 400)', async () => {
  await expectRefused(context({ headers: { Origin: 'https://evil.example' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { Origin: 'https://tkd-dashboard.pages.dev.evil.example' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { Origin: 'http://tkd-dashboard.pages.dev' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { Origin: '' } }), { status: 'bad_request' });
});

test('POST: not JSON (Content-Type) → bad_request; a charset parameter is fine', async () => {
  await expectRefused(context({ headers: { 'Content-Type': 'text/plain' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }), { status: 'bad_request' });
  await expectRefused(context({ headers: { 'Content-Type': 'multipart/form-data' } }), { status: 'bad_request' });
  const r = await run(handlePost, context({ headers: { 'Content-Type': 'application/json; charset=utf-8' } }), { openDatabase: fakeDb({ submit: okSubmit }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.json.status, 'ok');
});

test('POST: body over 100 KB → bad_request (declared size and real size)', async () => {
  const big = JSON.stringify(goodBody({ signature: 'data:image/png;base64,' + 'A'.repeat(110 * 1024) }));
  await expectRefused(context({ body: big }), { status: 'bad_request' });
  // A lying Content-Length: the stream is still counted while reading.
  await expectRefused(context({ body: big, headers: { 'Content-Length': '100' } }), { status: 'bad_request' });
  // Just under the limit is read (and then refused only by the field checks if needed).
  const nearly = JSON.stringify(goodBody({ answers: { note: 'x'.repeat(90 * 1024) } }));
  const r = await run(handlePost, context({ body: nearly }), { openDatabase: fakeDb({ submit: okSubmit }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.json.status, 'ok');
});

test('POST: body not JSON / not an object → bad_request', async () => {
  await expectRefused(context({ body: '{not json' }), { status: 'bad_request' });
  await expectRefused(context({ body: '[1,2,3]' }), { status: 'bad_request' });
  await expectRefused(context({ body: 'null' }), { status: 'bad_request' });
  await expectRefused(context({ body: '"text"' }), { status: 'bad_request' });
});

test('POST: honeypot filled in → bad_request', async () => {
  await expectRefused(context({ body: goodBody({ website: 'http://spam.example' }) }), { status: 'bad_request' });
  await expectRefused(context({ body: goodBody({ website: 0 }) }), { status: 'bad_request' });
});

test('POST: sent in under 4 seconds (or no times) → bad_request', async () => {
  await expectRefused(context({ body: goodBody({ started_at: 1_000_000, sent_at: 1_003_999 }) }), { status: 'bad_request' });
  await expectRefused(context({ body: goodBody({ started_at: undefined }) }), { status: 'bad_request' });
  await expectRefused(context({ body: goodBody({ sent_at: '1060000' }) }), { status: 'bad_request' });
  // Exactly 4 seconds is allowed.
  const r = await run(handlePost, context({ body: goodBody({ started_at: 1_000_000, sent_at: 1_004_000 }) }), { openDatabase: fakeDb({ submit: okSubmit }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.json.status, 'ok');
});

test('POST: fields of the wrong type → bad_request', async () => {
  for (const bad of [
    { submission_key: 'not-a-uuid' },
    { submission_key: undefined },
    { published_version: '3' },
    { published_version: 0 },
    { published_version: 2.5 },
    { answers: null },
    { answers: [] },
    { answers: 'parent_name=Ana' },
    { children: {} },
    { children: undefined },
    { children: Array(7).fill({ first_name: 'A', age: 5 }) },
    { bookings: null },
    { bookings: Array(7).fill({}) },
    { signature: 42 },
    { signature: 'x'.repeat(70001) },
    { kiosk_token: 'short' },
    { kiosk_token: 'AB'.repeat(32) }, // must be lowercase hex, as the database makes it
    { kiosk_token: 'zz'.repeat(32) },
    { kiosk_token: 12345 },
  ]) {
    await expectRefused(context({ body: goodBody(bad) }), { status: 'bad_request' });
  }
});

// ---------- POST: Turnstile -----------------------------------------------------------------

test('POST: Turnstile says no / wrong hostname / wrong action / unreachable / no token → verify_failed', async () => {
  const cases = [
    { success: false, hostname: 'tkd-dashboard.pages.dev', action: 'form' },
    { success: true, hostname: 'evil.example', action: 'form' },
    { success: true, hostname: 'tkd-dashboard.pages.dev', action: 'register' }, // Color Belt's token
    { success: true }, // fields missing
    new Error('network down'),
  ];
  for (const result of cases) {
    const db = fakeDb({ submit: okSubmit });
    const r = await run(handlePost, context(), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile(result).fetchImpl });
    assert.deepEqual(r.json, { status: 'verify_failed' }, String(result?.action ?? result));
    assert.equal(db.log.opened, 0);
  }
  for (const token of ['', undefined, 42, 'x'.repeat(2049)]) {
    const db = fakeDb({ submit: okSubmit });
    const r = await run(handlePost, context({ body: goodBody({ turnstile_token: token }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'verify_failed' });
    assert.equal(db.log.opened, 0);
  }
});

test('POST: Turnstile ok → siteverify asked with the secret, the token and the visitor IP', async () => {
  const ts = fakeTurnstile();
  const r = await run(handlePost, context(), { openDatabase: fakeDb({ submit: okSubmit }).openDatabase, fetchImpl: ts.fetchImpl });
  assert.equal(r.json.status, 'ok');
  assert.equal(ts.seen.length, 1);
  assert.equal(ts.seen[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  const form = new URLSearchParams(ts.seen[0].body);
  assert.equal(form.get('secret'), 'turnstile-secret-for-tests');
  assert.equal(form.get('response'), 'token-from-the-page');
  assert.equal(form.get('remoteip'), '203.0.113.7');
});

test('POST: a kiosk token does not skip Turnstile', async () => {
  const db = fakeDb({ submit: okSubmit });
  const r = await run(handlePost, context({ body: goodBody({ kiosk_token: KIOSK }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile({ success: false }).fetchImpl });
  assert.deepEqual(r.json, { status: 'verify_failed' });
  assert.equal(db.log.opened, 0);
});

test('verifyTurnstile: a non-200 answer is a no', async () => {
  const ok = await verifyTurnstile({
    fetchImpl: async () => new Response('oops', { status: 500 }),
    secret: 's', token: 't', ip: '1.2.3.4', expectedHost: 'tkd-dashboard.pages.dev',
  });
  assert.equal(ok, false);
});

// ---------- POST: the database ----------------------------------------------------------------

test('POST ok: the fixed answer only; typed values passed; client key is not the IP', async () => {
  const db = fakeDb({ submit: okSubmit });
  const body = goodBody({ submission_key: SUBMISSION_KEY.toUpperCase() });
  const r = await run(handlePost, context({ slug: 'Free-Class', body }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.http, 200);
  assert.deepEqual(r.json, {
    status: 'ok',
    repeat: false,
    bookings: [{ child: 0, class_name: 'Little Tigers', date: '2026-11-03', starts_at: '16:00', ends_at: '16:40' }],
  });
  const [name, args] = db.log.calls[0];
  assert.equal(name, 'publicSubmit');
  assert.equal(args.slug, 'free-class');
  assert.equal(args.submissionKey, SUBMISSION_KEY); // lower-cased
  assert.equal(args.publishedVersion, 3);
  assert.deepEqual(args.answers, body.answers);
  assert.deepEqual(args.children, body.children);
  assert.deepEqual(args.bookings, body.bookings);
  assert.equal(args.signature, SIGNATURE);
  assert.equal(args.kioskToken, null); // not a kiosk
  assert.match(args.clientKey, /^[0-9a-f]{64}$/);
  assert.ok(!args.clientKey.includes('203.0.113.7'));
  assert.deepEqual(Object.keys(args).sort(), ['answers', 'bookings', 'children', 'clientKey', 'kioskToken', 'publishedVersion', 'signature', 'slug', 'submissionKey']);
  assert.equal(db.log.closed, 1, 'client closed through waitUntil');
});

test('POST: no signature (form without a waiver) and a kiosk token are passed on as they are', async () => {
  const db = fakeDb({ submit: { ...okSubmit, repeat: true } });
  const body = goodBody({ kiosk_token: KIOSK });
  delete body.signature;
  const r = await run(handlePost, context({ body }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.json.status, 'ok');
  assert.equal(r.json.repeat, true);
  const args = db.log.calls[0][1];
  assert.equal(args.signature, null);
  assert.equal(args.kioskToken, KIOSK);
  // signature: null and kiosk_token: null are the same as leaving them out.
  const db2 = fakeDb({ submit: okSubmit });
  await run(handlePost, context({ body: goodBody({ signature: null, kiosk_token: null }) }), { openDatabase: db2.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(db2.log.calls[0][1].signature, null);
  assert.equal(db2.log.calls[0][1].kioskToken, null);
});

// ---------- POST: kiosk mode ended mid-sign-up (kiosk plan K4) --------------------------------

// A fake database that gives the answers in `answers` one after the other.
function answersInTurn(...answers) {
  let i = 0;
  return () => answers[Math.min(i++, answers.length - 1)];
}

test('kiosk: token refused (invalid), sent again as public and saved → ok + kiosk_ended', async () => {
  const db = fakeDb({ submit: answersInTurn({ status: 'invalid' }, okSubmit) });
  const ts = fakeTurnstile();
  const logged = [];
  const original = console.log;
  console.log = (...parts) => logged.push(parts.join(' '));
  let r;
  try {
    r = await run(handlePost, context({ body: goodBody({ kiosk_token: KIOSK }) }), { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl });
  } finally {
    console.log = original;
  }
  assert.deepEqual(r.json, {
    status: 'ok',
    repeat: false,
    bookings: [{ child: 0, class_name: 'Little Tigers', date: '2026-11-03', starts_at: '16:00', ends_at: '16:40' }],
    kiosk_ended: true,
  });
  assert.equal(db.log.calls.length, 2, 'database asked twice');
  const [first, second] = db.log.calls.map((c) => c[1]);
  assert.equal(first.kioskToken, KIOSK);
  assert.equal(second.kioskToken, null);
  assert.equal(second.submissionKey, first.submissionKey); // same key: can never be saved twice
  assert.deepEqual({ ...second, kioskToken: KIOSK }, first); // everything else the same
  assert.equal(ts.seen.length, 1, 'Turnstile asked only once');
  assert.equal(db.log.opened, 1);
  assert.equal(db.log.closed, 1);
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0], /abab/); // the token is never logged
});

test('kiosk: invalid twice → plain invalid, no kiosk_ended flag', async () => {
  const db = fakeDb({ submit: { status: 'invalid' } });
  const r = await run(handlePost, context({ body: goodBody({ kiosk_token: KIOSK }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(r.json, { status: 'invalid' });
  assert.equal(db.log.calls.length, 2);
  assert.equal(db.log.calls[1][1].kioskToken, null);
});

test('kiosk: no token + invalid → no second try', async () => {
  const db = fakeDb({ submit: { status: 'invalid' } });
  const r = await run(handlePost, context(), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(r.json, { status: 'invalid' });
  assert.equal(db.log.calls.length, 1);
});

test('kiosk: token + first answer ok → no second try, no flag', async () => {
  const db = fakeDb({ submit: okSubmit });
  const r = await run(handlePost, context({ body: goodBody({ kiosk_token: KIOSK }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.equal(r.json.status, 'ok');
  assert.equal(r.json.kiosk_ended, undefined);
  assert.equal(db.log.calls.length, 1);
});

test('kiosk: token + first answer rate_limited (or any other non-invalid) → no second try', async () => {
  for (const answer of [{ status: 'rate_limited' }, { status: 'closed' }, { status: 'time_taken', times: [] }, { status: 'form_changed', published_version: 4 }]) {
    const db = fakeDb({ submit: answer });
    const r = await run(handlePost, context({ body: goodBody({ kiosk_token: KIOSK }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.equal(r.json.status, answer.status);
    assert.equal(r.json.kiosk_ended, undefined);
    assert.equal(db.log.calls.length, 1, answer.status);
  }
});

test('POST: every database status is mapped (and only known ones)', async () => {
  const cases = [
    [{ status: 'not_found' }, { status: 'not_found' }],
    [{ status: 'closed' }, { status: 'closed' }],
    [{ status: 'invalid', detail: 'parent_email too long' }, { status: 'invalid' }],
    [{ status: 'rate_limited' }, { status: 'rate_limited' }],
    [{ status: 'form_changed', published_version: 4 }, { status: 'form_changed', published_version: 4 }],
    [{ status: 'form_changed' }, { status: 'form_changed', published_version: null }],
    [{ status: 'time_taken', times: [TIME, 'junk'] }, { status: 'time_taken', times: [TIME] }],
    [{ status: 'time_taken' }, { status: 'time_taken', times: [] }],
    [{ status: 'ok', id: 'x', bookings: null }, { status: 'ok', repeat: false, bookings: [] }],
    [{ status: 'no_access' }, { status: 'unavailable' }],
    [{ status: 'not_open' }, { status: 'unavailable' }], // a Color Belt status the Forms database never sends
    [{ status: 'something_new' }, { status: 'unavailable' }],
    [null, { status: 'unavailable' }],
    [undefined, { status: 'unavailable' }],
  ];
  for (const [fromDb, expected] of cases) {
    const r = await run(handlePost, context(), { openDatabase: fakeDb({ submit: fromDb }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, expected, JSON.stringify(fromDb));
    assert.equal(r.http, 200);
  }
});

test('POST: database error → unavailable; nothing personal in the answer or the log', async () => {
  const db = fakeDb({
    submit: () => {
      throw new Error('duplicate key value violates unique constraint; Key (parent_name)=(Ana Lopez) data:image/png;base64');
    },
  });
  const logged = [];
  const original = console.log;
  console.log = (...parts) => logged.push(parts.join(' '));
  try {
    const r = await run(handlePost, context({ body: goodBody({ kiosk_token: KIOSK }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'unavailable' });
    assert.doesNotMatch(r.text, /Ana|Lopez|duplicate|data:image/);
  } finally {
    console.log = original;
  }
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0], /Ana|Lopez|Mia|data:image|203\.0\.113\.7|duplicate|abab/);
  assert.deepEqual(Object.keys(JSON.parse(logged[0])).sort(), ['fn', 'method', 'ms', 'status']);
  assert.equal(JSON.parse(logged[0]).fn, 'forms');
  assert.equal(db.log.closed, 1);
});

test('database "permission denied" (the SETUP §16 off switch) or no connection → unavailable', async () => {
  const denied = () => {
    throw Object.assign(new Error('permission denied for function forms_public_submit'), { code: '42501' });
  };
  const g = await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ get: denied }).openDatabase });
  assert.deepEqual(g.json, { status: 'unavailable' });
  assert.doesNotMatch(g.text, /permission|forms_public/);
  const p = await run(handlePost, context(), { openDatabase: fakeDb({ submit: denied }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(p.json, { status: 'unavailable' });
  assert.doesNotMatch(p.text, /permission|forms_public/);
  const c = await run(handlePost, context(), {
    openDatabase: () => { throw new Error('connect ECONNREFUSED 10.0.0.1'); },
    fetchImpl: fakeTurnstile().fetchImpl,
  });
  assert.deepEqual(c.json, { status: 'unavailable' });
  assert.doesNotMatch(c.text, /ECONNREFUSED|10\.0/);
});

test('POST: no emails are sent (only Turnstile is fetched)', async () => {
  const ts = fakeTurnstile();
  await run(handlePost, context(), { openDatabase: fakeDb({ submit: okSubmit }).openDatabase, fetchImpl: ts.fetchImpl });
  assert.equal(ts.seen.length, 1);
  assert.equal(ts.seen[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
});

test('other methods → bad_request', async () => {
  const response = handleOther();
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { status: 'bad_request' });
});

// ---------- rate limits -------------------------------------------------------------------

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

test('rate limit (Cloudflare binding present): blocks after the limit, before Turnstile and the database', async () => {
  const binding = fakeRateLimiter(2);
  const env = goodEnv({ RATE_LIMITER: binding });
  const memoryLimiter = new MemoryRateLimiter({ limit: 0 }); // would block everything — must not be used
  for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
    for (let i = 0; i < 2; i += 1) {
      const r = await run(handler, context({ method, env }), { openDatabase: fakeDb({ get: okGet, submit: okSubmit }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl, memoryLimiter });
      assert.equal(r.json.status, 'ok', `${method} ${i}`);
    }
    const db = fakeDb({ get: okGet, submit: okSubmit });
    const ts = fakeTurnstile();
    const r = await run(handler, context({ method, env }), { openDatabase: db.openDatabase, fetchImpl: ts.fetchImpl, memoryLimiter });
    assert.deepEqual(r.json, { status: 'rate_limited' });
    assert.equal(r.http, 200);
    assert.equal(db.log.opened, 0, 'database must not be opened');
    assert.equal(ts.seen.length, 0, 'Turnstile must not be asked');
  }
  // Key = "forms:" + client key + method; never the raw IP.
  assert.match(binding.seen[0], /^forms:[0-9a-f]{64}:GET$/);
  assert.match(binding.seen.at(-1), /^forms:[0-9a-f]{64}:POST$/);
  assert.ok(binding.seen.every((key) => !key.includes('203.0.113.7')));
});

test('rate limit (no binding): the in-memory counter blocks after the limit, per method', async () => {
  const memoryLimiter = new MemoryRateLimiter({ limit: 3 });
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await run(handleGet, context({ method: 'GET' }), { openDatabase: fakeDb({ get: okGet }).openDatabase, memoryLimiter })).json.status, 'ok');
  }
  const db = fakeDb({ get: okGet });
  const blocked = await run(handleGet, context({ method: 'GET' }), { openDatabase: db.openDatabase, memoryLimiter });
  assert.deepEqual(blocked.json, { status: 'rate_limited' });
  assert.equal(db.log.opened, 0);
  // POSTs from the same connection are counted separately.
  const post = await run(handlePost, context(), { openDatabase: fakeDb({ submit: okSubmit }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl, memoryLimiter });
  assert.equal(post.json.status, 'ok');
  // Another connection still gets through.
  const other = await run(handleGet, context({ method: 'GET', headers: { 'CF-Connecting-IP': '198.51.100.9' } }), { openDatabase: fakeDb({ get: okGet }).openDatabase, memoryLimiter });
  assert.equal(other.json.status, 'ok');
});

test('no CF-Connecting-IP (not via Cloudflare) → bad_request, no database', async () => {
  for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
    const db = fakeDb({ get: okGet, submit: okSubmit });
    const ctx = context({ method });
    ctx.request.headers.delete('CF-Connecting-IP');
    const r = await run(handler, ctx, { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'bad_request' }, method);
    assert.equal(db.log.opened, 0);
  }
});

test('anything unplanned that throws → unavailable, with no details', async () => {
  const brokenBinding = { limit: async () => { throw new Error('limiter exploded 203.0.113.7'); } };
  for (const [handler, method] of [[handleGet, 'GET'], [handlePost, 'POST']]) {
    const db = fakeDb({ get: okGet, submit: okSubmit });
    const r = await run(handler, context({ method, env: goodEnv({ RATE_LIMITER: brokenBinding }) }), { openDatabase: db.openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
    assert.deepEqual(r.json, { status: 'unavailable' }, method);
    assert.doesNotMatch(r.text, /exploded|203/);
    assert.equal(db.log.opened, 0);
  }
  // Reading the body fails half-way.
  const failingBody = new ReadableStream({ pull(controller) { controller.error(new Error('connection reset')); } });
  const ctx = context();
  ctx.request = new Request(ctx.request.url, { method: 'POST', headers: ctx.request.headers, body: failingBody, duplex: 'half' });
  const r1 = await run(handlePost, ctx, { openDatabase: fakeDb({ submit: okSubmit }).openDatabase, fetchImpl: fakeTurnstile().fetchImpl });
  assert.deepEqual(r1.json, { status: 'unavailable' });
});

// ---------- the client key ------------------------------------------------------------------

test('client key: Forms keys differ from Color Belt keys for the same visitor and secret', async () => {
  const day = new Date('2026-11-19T13:00:00Z');
  const forms = await formsClientKey('secret', '203.0.113.7', day);
  const colourBelt = await registerClientKey('secret', '203.0.113.7', day);
  assert.match(forms, /^[0-9a-f]{64}$/);
  assert.notEqual(forms, colourBelt);
  assert.equal(forms, await formsClientKey('secret', '203.0.113.7', new Date('2026-11-20T04:59:00Z'))); // same Massachusetts day
  assert.notEqual(forms, await formsClientKey('secret', '203.0.113.7', new Date('2026-11-20T05:00:00Z'))); // next day
  assert.equal(await formsClientKey('s', '2001:db8:0:12::1', day), await formsClientKey('s', '2001:db8:0:12::ffff', day)); // same /64
});

// ---------- the real entry point ------------------------------------------------------------

test('[slug].js loads and routes by method (switched off, so nothing real is touched)', async () => {
  const { onRequest } = await import('../api/forms/[slug].js');
  const env = goodEnv({ PUBLIC_FORMS: 'off' });
  for (const method of ['GET', 'POST']) {
    const response = await onRequest(context({ method, env }));
    assert.deepEqual(await response.json(), { status: 'not_open' });
  }
  const put = await onRequest({ ...context({ method: 'GET', env }), request: new Request(`${ORIGIN}/api/forms/free-class`, { method: 'PUT' }) });
  assert.equal(put.status, 400);
});
