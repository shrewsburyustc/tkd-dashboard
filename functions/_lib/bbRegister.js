// bbRegister.js — everything the public Black Belt registration Function does, step by step.
// Why it exists: functions/api/black-belt/[code].js is only the "front door" Cloudflare calls.
// The real work lives here, written so the tests (functions/tests/bbRegister.test.mjs) can run
// it in plain Node with a FAKE database and a FAKE Turnstile — the `deps` argument says which
// ones to use. Spec: CONTRACT-0016-B1 §4.6–§4.7 and CONTRACT-0016 §8–§9 (migration 0016 wins
// for the database's exact answers).
//
//   GET  /api/black-belt/<code>  → what the family form needs to show for that cycle
//   POST /api/black-belt/<code>  → save one candidate's registration
//
// It is Color Belt's functions/_lib/register.js copied step for step, with Black Belt's own
// switch (BB_PUBLIC_REGISTRATION), its own database binding (HYPERDRIVE_BB, bbDb.js), its own
// fields and its own Turnstile action ('bb_register'). Color Belt's file is not changed; the
// small shared helpers (http.js, clientKey.js, rateLimit.js, turnstile.js) are used as they are.
//
// Every answer is JSON with a `status` code; the page turns codes into words. Statuses:
// ok, not_found, not_open, closed (+ closed_on), finished, invalid, waiver_changed and
// rate_limited (these come from the database), verify_failed, bad_request, unavailable, and
// rate_limited again (these from here — when one client sends too many requests, rateLimit.js).
//
// Safety rules followed here (handoff §6):
//   - Fail closed: a missing setting, an error, or an answer we don't recognise never lets a
//     registration through and never shows the form.
//   - Never send database error text to the browser, and never log names, date of birth,
//     email, signature, IPs or error details — the log gets only the method, the status code
//     and how long it took.
//   - Anything that goes wrong that we didn't plan for answers `unavailable` with no details.
//   - No database connection is opened before the request has passed the rate limit.
import { jsonAnswer, readBodyLimited } from './http.js';
import { verifyTurnstile } from './turnstile.js';
import { makeClientKey } from './clientKey.js';
import { allowRequest } from './rateLimit.js';

// The settings the Function needs besides its switch and its database binding (Cloudflare
// dashboard → Pages project → Settings, Production only). These four are shared with Color
// Belt's Function. If any is missing the Function answers "not open" for everything.
const REQUIRED_SETTINGS = ['TURNSTILE_SECRET', 'CLIENT_KEY_SECRET', 'PUBLIC_ORIGIN', 'TURNSTILE_SITE_KEY'];

// The Turnstile "action" the Black Belt page starts the human check with. A token made for
// Color Belt's page (action 'register') or the Forms page ('form') is refused here.
export const BB_TURNSTILE_ACTION = 'bb_register';

// A form must take at least this long to fill in. Bots usually send instantly.
export const MIN_FILL_MS = 4000;

// The longest values we bother sending on to the database. The database checks the real rules
// (names ≤ 60 characters, email ≤ 254, signature a PNG ≤ 70 000, …); these limits only stop
// silly sizes early.
const LIMITS = { name: 200, email: 320, waiverVersion: 40, signature: 70000 };

// A UUID like 8c0e4b1e-3f7a-4d2b-9a65-0f5b2c1d7e90 (the page makes submission_id with
// crypto.randomUUID(); cycle_plan_id comes from the cycle's own GET answer).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A date written as YYYY-MM-DD, e.g. 2012-03-04.
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// The biggest whole number a Postgres `integer` can hold. A bigger Dan would make the database
// throw instead of answering `invalid`, so it is refused here as a wrong type.
const INT4_MAX = 2147483647;

// Cycle codes are exactly 8 characters from a–z and 2–9 without the look-alikes i, l and o —
// the same alphabet the database uses (bb_public_cycle's own check in migration 0016). Anything
// else can't be a real code, so it is answered "not found" without using any of the client's
// rate-limit allowance and without opening a database connection.
const CODE = /^[a-hjkmnp-z2-9]{8}$/;

// Is the Function switched on and fully set up? (The "kill switch" is BB_PUBLIC_REGISTRATION;
// it stays missing / off until CP5, so until then everything answers "not open".)
function isSwitchedOn(env) {
  if (!env || env.BB_PUBLIC_REGISTRATION !== 'on') return false;
  if (!env.HYPERDRIVE_BB || typeof env.HYPERDRIVE_BB.connectionString !== 'string') return false;
  return REQUIRED_SETTINGS.every((name) => typeof env[name] === 'string' && env[name] !== '');
}

// The code from the address (/api/black-belt/<code>), lower-cased, or null if it can't be one.
function readCode(params) {
  const raw = Array.isArray(params?.code) ? params.code[0] : params?.code;
  if (typeof raw !== 'string') return null;
  const code = raw.toLowerCase();
  return CODE.test(code) ? code : null;
}

// One line in the Cloudflare log per request: method, status code, milliseconds. Nothing else.
function logLine(method, status, startedMs, now) {
  console.log(JSON.stringify({ fn: 'bb_register', method, status, ms: now() - startedMs }));
}

// What a database error turns into: always `unavailable`, never the error text.
// "Permission denied" (Postgres error 42501) is EXPECTED: it is what the database says once
// bb_registrar's rights are taken away — the instant "off switch". The page then shows the same
// "try again" message as for any other database trouble.
function databaseFailure() {
  return { status: 'unavailable' };
}

// Makes the visitor's anonymous client key and asks the rate limiter (rateLimit.js) whether
// this client may go on. Returns { clientKey, ip } when allowed, or { answer } to send back.
// Runs BEFORE any database connection is opened.
async function passRateLimit(context, deps, method) {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  if (!ip) return { answer: { status: 'bad_request' } }; // Cloudflare always sets it; missing = not via Cloudflare
  const nowMs = (deps.now ?? Date.now)();
  const clientKey = await makeClientKey(env.CLIENT_KEY_SECRET, ip, new Date(nowMs));
  const allowed = await allowRequest({ env, clientKey, method, nowMs, memoryLimiter: deps.memoryLimiter });
  if (!allowed) return { answer: { status: 'rate_limited' } };
  return { clientKey, ip };
}

// Closes the database client after the answer has gone out (context.waitUntil keeps the
// Function alive for that). Errors while closing are ignored — the answer is already sent.
function closeLater(context, db) {
  if (!db) return;
  const closing = Promise.resolve()
    .then(() => db.close())
    .catch(() => {});
  if (typeof context.waitUntil === 'function') context.waitUntil(closing);
}

// A plain object (not null, not a list)?
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ---------------------------------------------------------------------------------------------
// GET — the cycle as the family form shows it.
// ---------------------------------------------------------------------------------------------
export async function handleGet(context, deps) {
  const now = deps.now ?? Date.now;
  const started = now();
  let answer;
  try {
    answer = await getAnswer(context, deps);
  } catch {
    answer = { status: 'unavailable' }; // anything unplanned: no details out
  }
  logLine('GET', answer.status, started, now);
  return jsonAnswer(answer);
}

// The database's cycle answer, reduced to exactly the keys the page uses (CONTRACT-0016-B1
// §4.6), plus the public Turnstile site key. Anything else the database might add later is
// dropped here. Returns null when a part the page needs is missing (→ unavailable).
function mapCycleResult(result, siteKey) {
  const { school, cycle, waiver } = result;
  if (!isObject(school) || !isObject(cycle) || !isObject(waiver)) return null;
  return {
    status: 'ok',
    state: result.state,
    closed_on: result.closed_on ?? null,
    school: { code: school.code, name: school.name, address: school.address ?? null },
    cycle: {
      name: cycle.name,
      application_due: cycle.application_due,
      submissions_due: cycle.submissions_due,
      days: cycle.days,
      plans: cycle.plans,
      kukkiwon: cycle.kukkiwon,
      requirements: cycle.requirements,
    },
    waiver: { version_name: waiver.version_name, body: waiver.body },
    turnstile_site_key: siteKey,
  };
}

async function getAnswer(context, deps) {
  const { env, params } = context;
  if (!isSwitchedOn(env)) return { status: 'not_open' };
  const code = readCode(params);
  if (!code) return { status: 'not_found' }; // never reaches the rate limiter or the database

  const gate = await passRateLimit(context, deps, 'GET');
  if (gate.answer) return gate.answer;

  let db = null;
  try {
    db = deps.openDatabase(env);
    const result = await db.publicCycle(code);
    if (result?.status === 'ok') return mapCycleResult(result, env.TURNSTILE_SITE_KEY) ?? { status: 'unavailable' };
    if (result?.status === 'not_found') return { status: 'not_found' };
    return { status: 'unavailable' }; // an answer we don't expect: fail closed
  } catch (error) {
    return databaseFailure(error);
  } finally {
    closeLater(context, db);
  }
}

// ---------------------------------------------------------------------------------------------
// POST — save one registration.
// ---------------------------------------------------------------------------------------------
export async function handlePost(context, deps) {
  const now = deps.now ?? Date.now;
  const started = now();
  let answer;
  try {
    answer = await postAnswer(context, deps);
  } catch {
    answer = { status: 'unavailable' }; // anything unplanned (e.g. the body can't be read): no details out
  }
  logLine('POST', answer.status, started, now);
  return jsonAnswer(answer);
}

// Is this a real calendar date written YYYY-MM-DD? (2026-02-30 is not.) Checked here so a
// made-up date is refused as a wrong type instead of making the database throw.
function isRealIsoDate(text) {
  const match = ISO_DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Checks the fields' TYPES and rough sizes. Returns the cleaned-up values, or null.
// (The database checks the real rules — name rule, email rule, Dan 1–4, the plan belongs to
// this cycle, the signature is a PNG, … — and answers `invalid` when one is broken.)
function readFields(body) {
  const isText = (value, max) => typeof value === 'string' && value.length <= max;
  if (!UUID.test(String(body.submission_id ?? ''))) return null;
  if (!UUID.test(String(body.cycle_plan_id ?? ''))) return null;
  if (!isText(body.first_name, LIMITS.name) || !isText(body.last_name, LIMITS.name)) return null;
  if (!isText(body.date_of_birth, 10) || !isRealIsoDate(body.date_of_birth)) return null;
  if (!isText(body.email, LIMITS.email)) return null;
  if (!Number.isInteger(body.dan) || Math.abs(body.dan) > INT4_MAX) return null;
  if (typeof body.kukkiwon !== 'boolean' || typeof body.acknowledged !== 'boolean') return null;
  if (!isText(body.waiver_version, LIMITS.waiverVersion)) return null;
  if (!isText(body.signer_name, LIMITS.name)) return null;
  if (!isText(body.signature, LIMITS.signature)) return null;
  return {
    submissionId: body.submission_id.toLowerCase(),
    first: body.first_name,
    last: body.last_name,
    dateOfBirth: body.date_of_birth,
    email: body.email,
    dan: body.dan,
    cyclePlanId: body.cycle_plan_id.toLowerCase(),
    kukkiwon: body.kukkiwon,
    acknowledged: body.acknowledged,
    waiverVersion: body.waiver_version,
    signerName: body.signer_name,
    signature: body.signature,
  };
}

// The database's answer to a registration, reduced to what the page may see (CONTRACT-0016-B1
// §4.6). Only the listed keys are copied, so nothing else the database might hold (and never
// the date of birth, email, signer's name or signature) can reach the browser.
function mapRegisterResult(result) {
  switch (result?.status) {
    case 'ok':
      return {
        status: 'ok',
        reference: result.reference,
        first_name: result.first_name,
        last_name: result.last_name,
        dan: result.dan,
        kukkiwon: result.kukkiwon,
        plan_name: result.plan_name,
        items: Array.isArray(result.items)
          ? result.items.map((line) => ({ item: line?.item, due_on: line?.due_on, amount_cents: line?.amount_cents }))
          : [],
        total_cents: result.total_cents,
        cycle_name: result.cycle_name,
        school: isObject(result.school) ? { code: result.school.code, name: result.school.name } : null,
      };
    case 'closed':
      return { status: 'closed', closed_on: result.closed_on ?? null };
    case 'not_found':
    case 'not_open':
    case 'finished':
    case 'rate_limited':
    case 'invalid':
    case 'waiver_changed':
      return { status: result.status };
    default:
      return { status: 'unavailable' };
  }
}

async function postAnswer(context, deps) {
  const { request, env, params } = context;

  // 1. Kill switch and settings.
  if (!isSwitchedOn(env)) return { status: 'not_open' };

  // 2. Only our own page may send registrations: the browser adds an Origin header that a
  //    page on another site can't fake.
  if (request.headers.get('Origin') !== env.PUBLIC_ORIGIN) return { status: 'bad_request' };

  // 3. Only JSON (a plain HTML form on another site can't send this type without asking first).
  const type = (request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return { status: 'bad_request' };

  // 3a. A code that can't exist → not found, before it uses any rate-limit allowance.
  const code = readCode(params);
  if (!code) return { status: 'not_found' };

  // 4. Not too many requests from this client — before reading the body, asking Turnstile or
  //    opening the database. This also makes the anonymous client key used in step 9.
  const gate = await passRateLimit(context, deps, 'POST');
  if (gate.answer) return gate.answer;
  const { clientKey, ip } = gate;

  // 5. At most 100 KB, checked before and while reading.
  const text = await readBodyLimited(request);
  if (text === null) return { status: 'bad_request' };
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { status: 'bad_request' };
  }
  if (!isObject(body)) return { status: 'bad_request' };

  // 6. Honeypot: a hidden field people never see. Bots fill in every field they find.
  if (body.website !== undefined && body.website !== '') return { status: 'bad_request' };

  // 7. Too fast? started_at = when this candidate's form started, sent_at = when Send was
  //    tapped, both from the family's own device clock. Under 4 seconds → a bot.
  //    This only filters SIMPLE bots: both times come from the sender. Turnstile (step 8), the
  //    rate limits and the database's own checks are what really protect the form.
  const startedAt = body.started_at;
  const sentAt = body.sent_at;
  if (!Number.isFinite(startedAt) || !Number.isFinite(sentAt)) return { status: 'bad_request' };
  if (sentAt - startedAt < MIN_FILL_MS) return { status: 'bad_request' };

  const fields = readFields(body);
  if (!fields) return { status: 'bad_request' };

  // 8. The human check (Turnstile), verified with Cloudflare using our secret. The token must
  //    have been made on our own site AND for the Black Belt form (action 'bb_register').
  let expectedHost;
  try {
    expectedHost = new URL(env.PUBLIC_ORIGIN).hostname;
  } catch {
    return { status: 'not_open' }; // PUBLIC_ORIGIN isn't a web address: treat as not set up
  }
  const human = await verifyTurnstile({
    fetchImpl: deps.fetchImpl,
    secret: env.TURNSTILE_SECRET,
    token: body.turnstile_token,
    ip,
    expectedHost,
    expectedAction: BB_TURNSTILE_ACTION,
  });
  if (!human) return { status: 'verify_failed' };

  // 9. Save it (the database checks every rule again and decides the answer). It gets the
  //    anonymous, daily-changing client key from step 4 — never the raw IP.
  let db = null;
  try {
    db = deps.openDatabase(env);
    const result = await db.publicRegister({ code, clientKey, ...fields });
    return mapRegisterResult(result);
  } catch (error) {
    return databaseFailure(error);
  } finally {
    closeLater(context, db);
  }
}

// Any other method (PUT, DELETE, …) → bad_request.
export function handleOther() {
  return jsonAnswer({ status: 'bad_request' });
}
