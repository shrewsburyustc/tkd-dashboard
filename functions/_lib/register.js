// register.js — everything the public registration Function does, step by step.
// Why it exists: functions/api/register/[code].js is only the "front door" Cloudflare calls.
// The real work lives here, written so the tests (functions/tests/) can run it in plain Node
// with a FAKE database and a FAKE Turnstile — the `deps` argument says which ones to use.
// Spec: contract 0005 §4.2 (it wins over anything else).
//
//   GET  /api/register/<code>  → what the form needs to show for that event
//   POST /api/register/<code>  → save one student's registration
//
// Every answer is JSON with a `status` code; the page turns codes into words. The page's
// statuses: ok, not_found, not_open, closed (+ closed_on), finished, rate_limited, invalid
// (these come from the database), verify_failed, bad_request, unavailable, and rate_limited
// again (these from here — rate_limited when one client sends too many requests, rateLimit.js).
//
// Safety rules followed here (handoff §6, plan §8):
//   - Fail closed: a missing setting, an error, or an answer we don't recognise never lets a
//     registration through and never shows the form.
//   - Never send database error text to the browser, and never log names, signatures, IPs or
//     error details — the log gets only the method, the status code and how long it took.
//   - Anything that goes wrong that we didn't plan for (an error while reading the body,
//     making the client key, asking the rate limiter, …) answers `unavailable` with no
//     details (security review L1).
//   - No database connection is opened before the request has passed the rate limit
//     (security review M1).
import { jsonAnswer, readBodyLimited } from './http.js';
import { verifyTurnstile } from './turnstile.js';
import { makeClientKey } from './clientKey.js';
import { allowRequest } from './rateLimit.js';

// The settings the Function needs (Cloudflare dashboard → Pages project → Settings, Production
// only, contract 0005 §4.2). If any is missing the Function answers "not open" for everything.
const REQUIRED_SETTINGS = ['TURNSTILE_SECRET', 'CLIENT_KEY_SECRET', 'PUBLIC_ORIGIN', 'TURNSTILE_SITE_KEY'];

// A form must take at least this long to fill in. Bots usually send instantly.
export const MIN_FILL_MS = 4000;

// The longest values we bother sending on to the database. The database checks the real rules
// (names ≤ 60 characters, signature ≤ 70 000, …); these limits only stop silly sizes early.
const LIMITS = { name: 200, payingBy: 20, signature: 70000, ackVersion: 40 };

// A UUID like 8c0e4b1e-3f7a-4d2b-9a65-0f5b2c1d7e90 (the page makes submission_id with
// crypto.randomUUID(); event_rank_id comes from the event's own answer).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Event codes are exactly 8 characters from a–z and 2–9 without the look-alikes i, l and o —
// the same alphabet the database uses to make them (testing_new_public_code() in migration
// 0005, and its testing_events_public_code_check). Anything else can't be a real code, so it
// is answered "not found" without using any of the client's rate-limit allowance and without
// opening a database connection.
const CODE = /^[a-hjkmnp-z2-9]{8}$/;

// Is the Function switched on and fully set up? (The "kill switch" is PUBLIC_REGISTRATION.)
function isSwitchedOn(env) {
  if (!env || env.PUBLIC_REGISTRATION !== 'on') return false;
  if (!env.HYPERDRIVE || typeof env.HYPERDRIVE.connectionString !== 'string') return false;
  return REQUIRED_SETTINGS.every((name) => typeof env[name] === 'string' && env[name] !== '');
}

// The code from the address (/api/register/<code>), lower-cased, or null if it can't be one.
function readCode(params) {
  const raw = Array.isArray(params?.code) ? params.code[0] : params?.code;
  if (typeof raw !== 'string') return null;
  const code = raw.toLowerCase();
  return CODE.test(code) ? code : null;
}

// One line in the Cloudflare log per request: method, status code, milliseconds. Nothing else.
function logLine(method, status, startedMs, now) {
  console.log(JSON.stringify({ fn: 'register', method, status, ms: now() - startedMs }));
}

// What a database error turns into: always `unavailable`, never the error text.
// "Permission denied" (Postgres error 42501) is named here because it is EXPECTED: it is what
// the database says once the registrar login's rights are taken away — the instant "off
// switch" in SETUP §12i. The page then shows the same "try again" message as for any other
// database trouble.
function isPermissionDenied(error) {
  return error?.code === '42501' || /permission denied/i.test(String(error?.message ?? ''));
}
function databaseFailure(error) {
  if (isPermissionDenied(error)) return { status: 'unavailable' }; // switched off on purpose
  return { status: 'unavailable' }; // unreachable, refused or broken: no details out
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

// ---------------------------------------------------------------------------------------------
// GET — the event as the form shows it.
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
    const result = await db.publicEvent(code);
    if (result?.status === 'ok') {
      // Copy only the parts the page uses (contract 0005 §1.8), plus the public Turnstile
      // site key the page needs to start the human check.
      return {
        status: 'ok',
        state: result.state,
        closed_on: result.closed_on ?? null,
        event: result.event,
        classes: result.classes,
        turnstile_site_key: env.TURNSTILE_SITE_KEY,
      };
    }
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

// Checks the fields' TYPES and rough sizes. Returns the cleaned-up values, or null.
// (The database checks the real rules and answers `invalid` when one is broken.)
function readFields(body) {
  const isText = (value, max) => typeof value === 'string' && value.length <= max;
  if (!UUID.test(String(body.submission_id ?? ''))) return null;
  if (!UUID.test(String(body.event_rank_id ?? ''))) return null;
  if (!isText(body.first_name, LIMITS.name) || !isText(body.last_name, LIMITS.name)) return null;
  if (!isText(body.paying_by, LIMITS.payingBy)) return null;
  if (typeof body.stripes !== 'boolean') return null;
  if (!isText(body.signature, LIMITS.signature)) return null;
  if (!isText(body.ack_version, LIMITS.ackVersion)) return null;
  return {
    submissionId: body.submission_id.toLowerCase(),
    eventRankId: body.event_rank_id.toLowerCase(),
    first: body.first_name,
    last: body.last_name,
    payingBy: body.paying_by,
    stripes: body.stripes,
    signature: body.signature,
    ackVersion: body.ack_version,
  };
}

// The database's answer to a registration, reduced to what the page may see.
function mapRegisterResult(result) {
  switch (result?.status) {
    case 'ok':
      return {
        status: 'ok',
        reference: result.reference,
        first_name: result.first_name,
        last_name: result.last_name,
        testing_for: result.testing_for ?? null,
        class_name: result.class_name,
        start_time: result.start_time,
        end_time: result.end_time,
        early_cents: result.early_cents,
        day_cents: result.day_cents,
        paying_by: result.paying_by,
        testing_date: result.testing_date,
        school_name: result.school_name,
        address: result.address ?? null,
      };
    case 'closed':
      return { status: 'closed', closed_on: result.closed_on ?? null };
    case 'not_found':
    case 'not_open':
    case 'finished':
    case 'rate_limited':
    case 'invalid':
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
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { status: 'bad_request' };

  // 6. Honeypot: a hidden field people never see. Bots fill in every field they find.
  if (body.website !== undefined && body.website !== '') return { status: 'bad_request' };

  // 7. Too fast? started_at = when the form was opened, sent_at = when Send was tapped, both
  //    from the family's own device clock (so a phone whose clock is a few minutes off still
  //    works). Under 4 seconds → a bot.
  //    This only filters SIMPLE bots: both times come from the sender, so anyone writing their
  //    own requests can just send two times 5 seconds apart. Turnstile (step 8), the rate
  //    limits and the database's own checks are what really protect the form.
  const startedAt = body.started_at;
  const sentAt = body.sent_at;
  if (!Number.isFinite(startedAt) || !Number.isFinite(sentAt)) return { status: 'bad_request' };
  if (sentAt - startedAt < MIN_FILL_MS) return { status: 'bad_request' };

  const fields = readFields(body);
  if (!fields) return { status: 'bad_request' };

  // 8. The human check (Turnstile), verified with Cloudflare using our secret.
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
