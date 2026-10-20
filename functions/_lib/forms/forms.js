// forms/forms.js — everything the Forms public Function does, step by step.
// Why it exists: functions/api/forms/[slug].js is only the "front door" Cloudflare calls. The
// real work lives here, written so the tests (functions/tests/forms.test.mjs) can run it in
// plain Node with a FAKE database and a FAKE Turnstile — the `deps` argument says which ones to
// use. Modelled exactly on Color Belt's functions/_lib/register.js (copied, not shared — build
// plan §8). Spec: build plan docs/Prospects/TKD-Forms-Build-Plan.md §2c and §3; rulebook v0.235,
// v0.241, v0.242, v0.601.
//
//   GET  /api/forms/<slug>  → what the public form needs to show (forms_public_get)
//   POST /api/forms/<slug>  → save one sign-up and its free-class bookings (forms_public_submit)
//
// Every answer is JSON with a `status` code; the page turns codes into words.
//   GET answers:  ok, closed, not_found        (from the database)
//                 not_open, rate_limited, bad_request, unavailable   (from here)
//   POST answers: ok, closed, not_found, invalid, rate_limited, form_changed, time_taken
//                                              (from the database)
//                 not_open, bad_request, verify_failed, rate_limited, unavailable   (from here)
//   POST extra field: kiosk_ended: true — added only when a kiosk sign-up's token was refused
//                 (kiosk mode ended or expired), the sign-up was then sent again as a normal
//                 public one, and that second answer was not `invalid` (step 9a below). It
//                 tells the kiosk page that kiosk mode is over on this tablet.
//
// Safety rules followed here (handoff §6):
//   - Fail closed: a missing setting, an error, or an answer we don't recognise never lets a
//     sign-up through and never shows the form.
//   - Never send database error text to the browser, and never log names, answers, signatures,
//     kiosk tokens, IPs or error details — the log gets only the method, the status code and
//     how long it took.
//   - Every answer is a FIXED short list of fields copied one by one: nothing new the database
//     might add later reaches the page by accident.
//   - Anything unplanned (an error while reading the body, making the client key, asking the
//     rate limiter, …) answers `unavailable` with no details.
//   - No database connection is opened before the request has passed the rate limit.
//   - Emails are OFF (rulebook v0.601): nothing is sent and forms_public_email_result is never
//     called. See the note after step 9 below for where they would go later.
import { jsonAnswer, readBodyLimited } from './http.js';
import { verifyTurnstile } from './turnstile.js';
import { makeClientKey } from './clientKey.js';
import { allowRequest } from './rateLimit.js';

// The text settings the Function needs (Cloudflare dashboard → Pages project → Settings →
// Variables and Secrets, Production only). The binding HYPERDRIVE_FORMS is checked separately.
// If any is missing or empty the Function answers "not open" for everything.
const REQUIRED_SETTINGS = ['TURNSTILE_SECRET', 'CLIENT_KEY_SECRET', 'PUBLIC_ORIGIN', 'TURNSTILE_SITE_KEY'];

// A form must take at least this long to fill in. Bots usually send instantly.
export const MIN_FILL_MS = 4000;

// The rough limits checked here. The database checks the real rules (answers ≤ 20 KB, 1–6
// children, one booking per child, signature 200–70 000 characters, …) and answers `invalid`;
// these only stop silly sizes and wrong types early.
const LIMITS = { children: 6, bookings: 6, signature: 70000 };

// A UUID like 8c0e4b1e-3f7a-4d2b-9a65-0f5b2c1d7e90 (the page makes submission_key with
// crypto.randomUUID(), once per sign-up, and sends the SAME one again if it retries).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A kiosk token: 64 hexadecimal characters (forms_kiosk_token makes 32 random bytes as hex).
const KIOSK_TOKEN = /^[0-9a-f]{64}$/;

// The slug is the editable end of the public link (/f/<slug>). The same rule as the database's
// forms_slug_ok (migration 0009 §1e): 3–40 lowercase letters, digits and dashes, starting and
// ending with a letter or digit, and not one of the reserved words. Anything else can't be a
// real form, so it is answered "not found" without using any of the client's rate-limit
// allowance and without opening a database connection.
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const RESERVED_SLUGS = new Set(['api', 'admin', 'new', 'edit', 'kiosk', 'preview', 'assets', 'static', 'forms', 'login']);

// Is the Function switched on and fully set up? (The "kill switch" is PUBLIC_FORMS.)
function isSwitchedOn(env) {
  if (!env || env.PUBLIC_FORMS !== 'on') return false;
  if (!env.HYPERDRIVE_FORMS || typeof env.HYPERDRIVE_FORMS.connectionString !== 'string') return false;
  return REQUIRED_SETTINGS.every((name) => typeof env[name] === 'string' && env[name] !== '');
}

// The slug from the address (/api/forms/<slug>), lower-cased, or null if it can't be one.
export function readSlug(params) {
  const raw = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  if (typeof raw !== 'string') return null;
  const slug = raw.toLowerCase();
  if (!SLUG.test(slug) || RESERVED_SLUGS.has(slug)) return null;
  return slug;
}

// One line in the Cloudflare log per request: method, status code, milliseconds. Nothing else.
function logLine(method, status, startedMs, now) {
  console.log(JSON.stringify({ fn: 'forms', method, status, ms: now() - startedMs }));
}

// What a database error turns into: always `unavailable`, never the error text. "Permission
// denied" (Postgres error 42501) is EXPECTED once the registrar login's rights are taken away
// (the instant "off switch" in SETUP §16); the page then shows the same "try again" message.
function databaseFailure() {
  return { status: 'unavailable' };
}

// Makes the visitor's anonymous client key and asks the rate limiter whether this client may
// go on. Returns { clientKey, ip } when allowed, or { answer } to send back. Runs BEFORE any
// database connection is opened.
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

// Small helpers that copy ONE value only if it has the expected type (else null).
const textOrNull = (value) => (typeof value === 'string' ? value : null);
const numberOrNull = (value) => (Number.isFinite(value) ? value : null);
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The open free-class times, copied field by field (forms_public_get and the time_taken answer
// both send this list): [{ class_id, class_name, date, starts_at, ends_at, spots_left }].
function copyTimes(times) {
  if (!Array.isArray(times)) return [];
  return times.filter(isPlainObject).map((t) => ({
    class_id: textOrNull(t.class_id),
    class_name: textOrNull(t.class_name),
    date: textOrNull(t.date),
    starts_at: textOrNull(t.starts_at),
    ends_at: textOrNull(t.ends_at),
    spots_left: numberOrNull(t.spots_left),
  }));
}

// The booked times in an ok answer, copied field by field:
// [{ child, class_name, date, starts_at, ends_at }] (child = 0 for the first child, …).
function copyBookings(bookings) {
  if (!Array.isArray(bookings)) return [];
  return bookings.filter(isPlainObject).map((b) => ({
    child: numberOrNull(b.child),
    class_name: textOrNull(b.class_name),
    date: textOrNull(b.date),
    starts_at: textOrNull(b.starts_at),
    ends_at: textOrNull(b.ends_at),
  }));
}

// ---------------------------------------------------------------------------------------------
// GET — the form as the public page shows it.
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

// forms_public_get's answer, reduced to the fixed list the page may see.
function mapGetResult(result, env) {
  switch (result?.status) {
    case 'ok':
      // The field list must be a list; anything else means something is wrong: fail closed.
      if (!Array.isArray(result.fields) || !Number.isInteger(result.published_version)) return { status: 'unavailable' };
      return {
        status: 'ok',
        form_name: textOrNull(result.form_name),
        fields: result.fields, // the published field list, exactly as the database keeps it
        published_version: result.published_version,
        school_name: textOrNull(result.school_name),
        school_phone: textOrNull(result.school_phone),
        thank_you: textOrNull(result.thank_you),
        add_to_calendar: result.add_to_calendar === true,
        times: copyTimes(result.times),
        turnstile_site_key: env.TURNSTILE_SITE_KEY, // public; the page needs it to start Turnstile
      };
    case 'closed':
      return { status: 'closed', school_name: textOrNull(result.school_name), school_phone: textOrNull(result.school_phone) };
    case 'not_found':
      return { status: 'not_found' };
    default:
      return { status: 'unavailable' }; // an answer we don't expect: fail closed
  }
}

async function getAnswer(context, deps) {
  const { env, params } = context;
  if (!isSwitchedOn(env)) return { status: 'not_open' };
  const slug = readSlug(params);
  if (!slug) return { status: 'not_found' }; // never reaches the rate limiter or the database

  const gate = await passRateLimit(context, deps, 'GET');
  if (gate.answer) return gate.answer;

  let db = null;
  try {
    db = deps.openDatabase(env);
    const result = await db.publicGet(slug);
    return mapGetResult(result, env);
  } catch {
    return databaseFailure();
  } finally {
    closeLater(context, db);
  }
}

// ---------------------------------------------------------------------------------------------
// POST — save one sign-up.
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
  if (typeof body.submission_key !== 'string' || !UUID.test(body.submission_key)) return null;
  const version = body.published_version;
  if (!Number.isInteger(version) || version < 1 || version > 2147483647) return null;
  if (!isPlainObject(body.answers)) return null;
  if (!Array.isArray(body.children) || body.children.length > LIMITS.children) return null;
  if (!Array.isArray(body.bookings) || body.bookings.length > LIMITS.bookings) return null;
  // signature: a drawn picture (text) when the form has a waiver, else null / left out.
  const signature = body.signature ?? null;
  if (signature !== null && (typeof signature !== 'string' || signature.length > LIMITS.signature)) return null;
  // kiosk_token: only on the school's kiosk tablet (see [slug].js); else null / left out.
  const kioskToken = body.kiosk_token ?? null;
  if (kioskToken !== null && (typeof kioskToken !== 'string' || !KIOSK_TOKEN.test(kioskToken))) return null;
  return {
    submissionKey: body.submission_key.toLowerCase(),
    publishedVersion: version,
    answers: body.answers,
    children: body.children,
    bookings: body.bookings,
    signature,
    kioskToken,
  };
}

// forms_public_submit's answer, reduced to the fixed list the page may see.
function mapSubmitResult(result) {
  switch (result?.status) {
    case 'ok':
      // repeat = true when the same submission_key was already saved (the page retried):
      // the answer is the same as the first time, nothing is saved twice.
      return { status: 'ok', repeat: result.repeat === true, bookings: copyBookings(result.bookings) };
    case 'form_changed':
      // Staff published a new version while the family was filling it in: the page loads the
      // form again (GET) and keeps what was typed where it can.
      return { status: 'form_changed', published_version: Number.isInteger(result.published_version) ? result.published_version : null };
    case 'time_taken':
      // A chosen time filled up (or closed) meanwhile: nothing was saved; here are fresh times.
      return { status: 'time_taken', times: copyTimes(result.times) };
    case 'closed':
    case 'not_found':
    case 'invalid':
    case 'rate_limited':
      return { status: result.status };
    default:
      return { status: 'unavailable' };
  }
}

async function postAnswer(context, deps) {
  const { request, env, params } = context;

  // 1. Kill switch and settings.
  if (!isSwitchedOn(env)) return { status: 'not_open' };

  // 2. Only our own page may send sign-ups: the browser adds an Origin header that a page on
  //    another site can't fake.
  if (request.headers.get('Origin') !== env.PUBLIC_ORIGIN) return { status: 'bad_request' };

  // 3. Only JSON (a plain HTML form on another site can't send this type without asking first).
  const type = (request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return { status: 'bad_request' };

  // 3a. A slug that can't exist → not found, before it uses any rate-limit allowance.
  const slug = readSlug(params);
  if (!slug) return { status: 'not_found' };

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
  if (!isPlainObject(body)) return { status: 'bad_request' };

  // 6. Honeypot: a hidden field people never see. Bots fill in every field they find.
  if (body.website !== undefined && body.website !== '') return { status: 'bad_request' };

  // 7. Too fast? started_at = when the form was opened, sent_at = when Send was tapped, both
  //    from the family's own device clock (milliseconds). Under 4 seconds → a bot.
  //    This only filters SIMPLE bots (anyone writing their own requests can send two times
  //    5 seconds apart). Turnstile, the rate limits and the database's checks are what really
  //    protect the form.
  const startedAt = body.started_at;
  const sentAt = body.sent_at;
  if (!Number.isFinite(startedAt) || !Number.isFinite(sentAt)) return { status: 'bad_request' };
  if (sentAt - startedAt < MIN_FILL_MS) return { status: 'bad_request' };

  const fields = readFields(body);
  if (!fields) return { status: 'bad_request' };

  // 8. The human check (Turnstile, action "form"), verified with Cloudflare using our secret.
  //    Also on the kiosk tablet: a kiosk token raises the database's rate limit, it doesn't
  //    replace the human check.
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
    const result = await db.publicSubmit({ slug, clientKey, ...fields });
    // 9a. Kiosk mode ended mid-sign-up (kiosk plan K4, 2026-10-19). The database answers
    //     `invalid` — and saves NOTHING — when the kiosk token is wrong, older than 12 hours or
    //     ended by staff ("End kiosk mode on all tablets"). A family already filling in on the
    //     tablet must never be lost, so we ask ONCE more as a normal public sign-up (no token):
    //     same submission_key, so it can never be saved twice, and the normal public limit of
    //     20 an hour applies. Turnstile was already passed in step 8 for this same request, so
    //     it is not asked again. If the second answer is `invalid` too, the answers themselves
    //     were wrong: the page gets the plain `invalid`, without the flag.
    if (result?.status === 'invalid' && fields.kioskToken !== null) {
      const retry = await db.publicSubmit({ slug, clientKey, ...fields, kioskToken: null });
      const mapped = mapSubmitResult(retry);
      if (mapped.status === 'invalid') return mapped;
      return { ...mapped, kiosk_ended: true };
    }
    // EMAILS (off for now, rulebook v0.601): when the school has its own web address in its
    // Cloudflare account and a Resend account, the confirmation to the family and the alert
    // to the school would be sent HERE, after an `ok` that is not a repeat — then any failure
    // recorded with forms_public_email_result. A failed email must never undo the sign-up.
    return mapSubmitResult(result);
  } catch {
    return databaseFailure();
  } finally {
    closeLater(context, db);
  }
}

// Any other method (PUT, DELETE, …) → bad_request.
export function handleOther() {
  return jsonAnswer({ status: 'bad_request' });
}
