// starRegister.js — everything the Star family form's Function does, step by step.
// Why it exists: functions/api/star/[code].js is only the "front door" Cloudflare calls. The
// real work lives here, written so the tests (functions/tests/starRegister.test.mjs) can run it
// in plain Node with a FAKE database and a FAKE Turnstile — the `deps` argument says which ones
// to use. It is a copy of Color Belt's functions/_lib/register.js with the SAME checks in the
// SAME order; only the database calls, the fields and the settings' names are Star's.
// Spec: CONTRACT-0006 §8 (it wins over anything else); rulebook v0.105, v0.159, v0.510.
//
//   GET  /api/star/<code>  → what the Star form needs to show for that event (star_public_event)
//   POST /api/star/<code>  → save one candidate's registration           (star_public_register)
//
// Every answer is JSON with a `status` code; the page turns codes into words.
//   GET answers:  ok, not_found                                  (from the database)
//                 not_open, rate_limited, unavailable            (from here)
//   POST answers: ok, not_found, not_open, closed (+ closed_on), finished, rate_limited, invalid
//                                                                (from the database)
//                 not_open, bad_request, not_found, rate_limited, verify_failed, unavailable
//                                                                (from here)
//
// Safety rules followed here (handoff §6, CONTRACT-0006 §8.4):
//   - Fail closed: a missing setting, an error, or an answer we don't recognise never lets a
//     registration through and never shows the form. With NO settings at all, every GET and
//     POST answers `not_open` and no database connection is opened.
//   - Never send database error text to the browser, and never log names, dates of birth,
//     emails, signatures, IPs or error details — the log gets only the method, the status code
//     and how long it took.
//   - Every answer is a FIXED list of fields copied one by one, so nothing new the database
//     might add later reaches the page by accident.
//   - Anything unplanned (an error while reading the body, making the client key, asking the
//     rate limiter, …) answers `unavailable` with no details.
//   - No database connection is opened before the request has passed the rate limit, and a
//     code that can't exist never reaches the rate limiter or the database.
//   - The anonymous client key is made by Color Belt's own clientKey.js, unchanged, so the same
//     visitor has the same key on both forms: the database's 20-an-hour limit is ONE limit
//     shared by both forms (CONTRACT-0006 §8.3, step 7).
import { jsonAnswer, readBodyLimited } from './http.js';
import { verifyTurnstile } from './turnstile.js';
import { makeClientKey } from './clientKey.js';
import { allowRequest } from './rateLimit.js';

// The text settings the Function needs (Cloudflare dashboard → Pages project → Settings →
// Variables and Secrets, Production only). They are the SAME ones Color Belt's form uses —
// reused, not copied (SETUP §13i). The binding HYPERDRIVE_STAR and the kill switch
// STAR_PUBLIC_REGISTRATION are checked separately. Anything missing = "not open" for everything.
const REQUIRED_SETTINGS = ['TURNSTILE_SECRET', 'CLIENT_KEY_SECRET', 'PUBLIC_ORIGIN', 'TURNSTILE_SITE_KEY'];

// The Turnstile action the Star page starts its check with (CONTRACT-0006 §8.4). Color Belt's
// page uses "register"; a token made for one form is refused by the other.
export const STAR_TURNSTILE_ACTION = 'star_register';

// A form must take at least this long to fill in. Bots usually send instantly.
export const MIN_FILL_MS = 4000;

// The longest values we bother sending on to the database. The database checks the real rules
// (names ≤ 60 characters, email ≤ 254, signature ≤ 70 000, …) and answers `invalid`; these
// limits only stop silly sizes and wrong types early.
const LIMITS = { name: 200, email: 320, payingBy: 20, signature: 70000, ackVersion: 40, smallNumber: 99 };

// A UUID like 8c0e4b1e-3f7a-4d2b-9a65-0f5b2c1d7e90 (the page makes submission_id with
// crypto.randomUUID(), once per registration, and sends the SAME one again if it retries).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A date written YYYY-MM-DD (what the page's date-of-birth calendar sends).
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// How every signature the page sends starts: a PNG picture as a data address, whose first bytes
// are the PNG file signature (base64 "iVBORw0KGgo"). Anything else can't be a drawn signature,
// so it is refused here, before Turnstile or the database (the database checks it again).
const PNG_DATA_PREFIX = 'data:image/png;base64,iVBORw0KGgo';

// Star's link codes: exactly 8 characters from a–z and 2–9 without the look-alikes i, l and o —
// the same pattern the database checks (CONTRACT-0006 §2.2, star_public_event). Anything else
// can't be a real code, so it is answered "not found" without using any of the client's
// rate-limit allowance and without opening a database connection.
const CODE = /^[a-hjkmnp-z2-9]{8}$/;

// Is the Function switched on and fully set up? (The "kill switch" is STAR_PUBLIC_REGISTRATION:
// only the exact text "on" turns it on; missing, "off", "ON", anything else = off.)
function isSwitchedOn(env) {
  if (!env || env.STAR_PUBLIC_REGISTRATION !== 'on') return false;
  if (!env.HYPERDRIVE_STAR || typeof env.HYPERDRIVE_STAR.connectionString !== 'string') return false;
  if (env.HYPERDRIVE_STAR.connectionString === '') return false;
  return REQUIRED_SETTINGS.every((name) => typeof env[name] === 'string' && env[name] !== '');
}

// The code from the address (/api/star/<code>), lower-cased, or null if it can't be one.
function readCode(params) {
  const raw = Array.isArray(params?.code) ? params.code[0] : params?.code;
  if (typeof raw !== 'string') return null;
  const code = raw.toLowerCase();
  return CODE.test(code) ? code : null;
}

// One line in the Cloudflare log per request: method, status code, milliseconds. Nothing else.
function logLine(method, status, startedMs, now) {
  console.log(JSON.stringify({ fn: 'star_register', method, status, ms: now() - startedMs }));
}

// What a database error turns into: always `unavailable`, never the error text. ("Permission
// denied", Postgres error 42501, is EXPECTED once the login's rights are taken away — the
// instant off switch in SETUP §13g — and gets the same answer.)
function databaseFailure() {
  return { status: 'unavailable' };
}

// Makes the visitor's anonymous client key and asks the rate limiter (rateLimit.js) whether
// this client may go on. Returns { clientKey, ip } when allowed, or { answer } to send back.
// Runs BEFORE any database connection is opened. Exactly Color Belt's steps.
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

// Small helpers for copying the database's answer field by field.
const textOrNull = (value) => (typeof value === 'string' ? value : null);
const numberOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
// The school's street address, as testing_location_address (migration 0005 §8) gives it:
// {street, city, state, zip} or null (no street entered in Settings → Schools). Only those four
// keys are copied, each as text or null; anything that isn't an object becomes null.
function addressOf(address) {
  if (!address || typeof address !== 'object' || Array.isArray(address)) return null;
  return {
    street: textOrNull(address.street),
    city: textOrNull(address.city),
    state: textOrNull(address.state),
    zip: textOrNull(address.zip),
  };
}
function whereOf(where) {
  return { name: textOrNull(where?.name), address: addressOf(where?.address) };
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

// The four states star_public_event can answer (CONTRACT-0006 §8.2).
const EVENT_STATES = new Set(['open', 'not_open', 'closed', 'finished']);

// star_public_event's ok answer, reduced to exactly the fields of CONTRACT-0006 §8.2, plus the
// public Turnstile site key the page needs. Returns null if the answer doesn't have the shape
// we expect (then the page gets `unavailable` — fail closed).
function mapEventResult(result, siteKey) {
  if (!EVENT_STATES.has(result.state)) return null;
  const event = result.event;
  if (!event || typeof event !== 'object' || !Array.isArray(result.dans)) return null;
  return {
    status: 'ok',
    state: result.state,
    closed_on: textOrNull(result.closed_on),
    school: { code: textOrNull(result.school?.code), name: textOrNull(result.school?.name) },
    event: {
      name: textOrNull(event.name),
      testing_date: textOrNull(event.testing_date),
      start_time: textOrNull(event.start_time),
      note: textOrNull(event.note),
      auto_close_on: textOrNull(event.auto_close_on),
      where: whereOf(event.where),
    },
    dans: result.dans.map((d) => ({
      dan: numberOrNull(d?.dan),
      label: textOrNull(d?.label),
      star_limit: numberOrNull(d?.star_limit),
      standard_cents: numberOrNull(d?.standard_cents),
      same_day_cents: numberOrNull(d?.same_day_cents),
      pass_mark: numberOrNull(d?.pass_mark),
      max_score: numberOrNull(d?.max_score),
      categories: Array.isArray(d?.categories)
        ? d.categories.map((k) => ({ name: textOrNull(k?.name), credits: numberOrNull(k?.credits) }))
        : [],
    })),
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
    const result = await db.publicEvent(code);
    if (result?.status === 'ok') return mapEventResult(result, env.TURNSTILE_SITE_KEY) ?? { status: 'unavailable' };
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

// Is `text` a real calendar date written YYYY-MM-DD? (2026-02-30 is not.) Checked here so a
// broken date is answered bad_request instead of making the database's ::date fail.
function isRealDate(text) {
  const m = ISO_DATE.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

// A small whole number (Dan, stars) — 0 to 99. The database checks the event's real Dans and
// star limit and answers `invalid`.
const isSmallWhole = (value) => Number.isInteger(value) && value >= 0 && value <= LIMITS.smallNumber;

// Checks the fields' TYPES and rough sizes. Returns the cleaned-up values, or null.
// (The database checks the real rules and answers `invalid` when one is broken.)
function readFields(body) {
  const isText = (value, max) => typeof value === 'string' && value.length <= max;
  // A text UUID only (String(['…uuid…']) would also pass the pattern, then break below).
  if (typeof body.submission_id !== 'string' || !UUID.test(body.submission_id)) return null;
  if (!isText(body.first_name, LIMITS.name) || !isText(body.last_name, LIMITS.name)) return null;
  if (typeof body.date_of_birth !== 'string' || !isRealDate(body.date_of_birth)) return null;
  if (!isText(body.email, LIMITS.email)) return null;
  if (!isSmallWhole(body.dan) || !isSmallWhole(body.stars_from)) return null;
  if (!isText(body.paying_by, LIMITS.payingBy)) return null;
  if (typeof body.acknowledged !== 'boolean') return null;
  if (!isText(body.signature, LIMITS.signature) || !body.signature.startsWith(PNG_DATA_PREFIX)) return null;
  if (!isText(body.ack_version, LIMITS.ackVersion)) return null;
  return {
    submissionId: body.submission_id.toLowerCase(),
    first: body.first_name,
    last: body.last_name,
    dateOfBirth: body.date_of_birth,
    email: body.email,
    dan: body.dan,
    starsFrom: body.stars_from,
    payingBy: body.paying_by,
    acknowledged: body.acknowledged,
    signature: body.signature,
    ackVersion: body.ack_version,
  };
}

// The database's answer to a registration, reduced to what the page may see (CONTRACT-0006
// §8.3's ok answer — no date of birth, email or signature, which the database never echoes).
function mapRegisterResult(result) {
  switch (result?.status) {
    case 'ok':
      return {
        status: 'ok',
        reference: textOrNull(result.reference),
        first_name: textOrNull(result.first_name),
        last_name: textOrNull(result.last_name),
        dan: numberOrNull(result.dan),
        dan_label: textOrNull(result.dan_label),
        stars_from: numberOrNull(result.stars_from),
        stars_to: numberOrNull(result.stars_to),
        standard_cents: numberOrNull(result.standard_cents),
        same_day_cents: numberOrNull(result.same_day_cents),
        paying_by: textOrNull(result.paying_by),
        event_name: textOrNull(result.event_name),
        testing_date: textOrNull(result.testing_date),
        start_time: textOrNull(result.start_time),
        school_name: textOrNull(result.school_name),
        where: whereOf(result.where),
      };
    case 'closed':
      return { status: 'closed', closed_on: textOrNull(result.closed_on) };
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
  //    from the family's own device clock. Under 4 seconds → a bot. This only filters SIMPLE
  //    bots (both times come from the sender); Turnstile, the rate limits and the database's
  //    own checks are what really protect the form.
  const startedAt = body.started_at;
  const sentAt = body.sent_at;
  if (!Number.isFinite(startedAt) || !Number.isFinite(sentAt)) return { status: 'bad_request' };
  if (sentAt - startedAt < MIN_FILL_MS) return { status: 'bad_request' };

  const fields = readFields(body);
  if (!fields) return { status: 'bad_request' };

  // 8. The human check (Turnstile), verified with Cloudflare using our secret: the token must
  //    have been made on our own host, for the Star form's action.
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
    expectedAction: STAR_TURNSTILE_ACTION,
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
