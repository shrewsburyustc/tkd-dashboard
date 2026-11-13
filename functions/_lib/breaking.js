// breaking.js — everything the public Board breaking sign-up Function does, step by step.
// Why it exists: functions/api/breaking/[code].js is only the "front door" Cloudflare calls. The real
// work lives here, written so the tests (functions/tests/breaking.test.mjs) can run it in plain Node
// with a FAKE database, a FAKE Turnstile and a FAKE Square — the `deps` argument says which to use.
// Modelled line by line on camp.js (Camps' reviewed Function) and follows its steps in the same
// order. Spec: docs/Board Breaking/FUNCTION-API.md (the JSON), CONTRACT-0051.md §5, SIGNATURES-0051.md.
//
//   GET  /api/breaking/<code>  → what the family form needs to show for that event
//   POST /api/breaking/<code>  → { action: 'signup' | 'pay' | 'status', ... }
//        signup  save one student's registration (and, for Card, make a Square payment link)
//        pay     "Try again": make (or find) the Square link for what is still owed
//        status  the page after Square: has this registration been paid yet?
//
// Every answer is JSON with a `status` code; the page turns codes into words. Every answer is cut
// down to an ALLOWLIST: only the fields listed here go to the browser, everything else the
// database might send (registration id, order id, link details, …) is dropped. An answer we don't
// recognise becomes `unavailable`.
//
// Safety rules followed here (handoff §6, same as camp.js):
//   - Fail closed: a missing setting, an error, or an answer we don't recognise never lets a
//     sign-up through and never shows the form.
//   - Never send database error text to the browser, and never log names, submission ids, Square
//     tokens, request bodies, link addresses, IPs or error details — the log gets only
//     {fn:'breaking', method, status, ms}.
//   - Anything unplanned that throws answers `unavailable` with no details.
//   - No database connection is opened before the request has passed the rate limit.
//   - The amount charged at Square comes ONLY from the database (the balance it reports), never
//     from anything the browser sent.
import { jsonAnswer, readBodyLimited } from './http.js';
import { verifyTurnstile } from './turnstile.js';
import { makeClientKey } from './clientKey.js';
import { allowRequest } from './rateLimit.js';
import { hostOf, matchOrigin } from './origins.js';

// The settings the Function needs (Cloudflare dashboard → Pages project → Settings, Production
// only, contract 0051 §5). If any is missing the Function answers "not open" for everything.
// TURNSTILE_*, CLIENT_KEY_SECRET and PUBLIC_ORIGIN are the same values the other forms use.
const REQUIRED_SETTINGS = ['TURNSTILE_SECRET', 'CLIENT_KEY_SECRET', 'PUBLIC_ORIGIN', 'TURNSTILE_SITE_KEY'];

// The Turnstile action each button names when it asks for a token. A token made for another form
// (or for the other button) is refused here.
export const BREAKING_SIGNUP_ACTION = 'breaking_signup';
export const BREAKING_PAY_ACTION = 'breaking_pay';

// A form must take at least this long to fill in. Bots usually send instantly.
export const MIN_FILL_MS = 4000;

// The most a request body may be: 8 KB (security review). A real sign-up is under 1 KB.
export const MAX_BREAKING_BODY_BYTES = 8 * 1024;

// The rough size limits. The database checks the real rules (names, ages, boards, …) and answers
// `invalid`; these only stop silly sizes early.
const LIMITS = { name: 200, rank: 100, payingBy: 20, token: 2048 };
const MAX_AGE = 150;
const MAX_COUNT = 100; // boards of one kind per student — only a sanity limit; the database knows the real range
const MAX_TOTAL_CENTS = 10_000_000;

// A UUID like 8c0e4b1e-3f7a-4d2b-9a65-0f5b2c1d7e90.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Event codes are exactly 8 characters from a–z and 2–9 without the look-alikes i, l and o — the
// alphabet the database uses. Anything else can't be a real code, so it is answered "not found"
// without using rate-limit allowance or a database connection.
const CODE = /^[a-hjkmnp-z2-9]{8}$/;

// The only keys a POST body may have, per action. Anything else → bad_request.
// (`first_name` on `pay` is optional: it only goes into the note on the Square payment, so the
// school can see whose payment it is. See the note in squareStep.)
const ACTION_KEYS = {
  signup: [
    'action', 'submission_id', 'first_name', 'last_name', 'age', 'rank_name', 'class_id', 'tech', 'adult',
    'paying_by', 'expected_total_cents', 'website', 'started_at', 'sent_at', 'turnstile_token',
  ],
  pay: ['action', 'submission_id', 'first_name', 'website', 'started_at', 'sent_at', 'turnstile_token'],
  status: ['action', 'submission_id'],
};

// The schools that have a Square account of their own (rulebook v1.302). Anything else fails closed.
const SCHOOLS = ['worcester', 'shrewsbury'];

// Square's two servers. Production is the default only when the school's setting says "production".
const SQUARE_BASES = {
  production: 'https://connect.squareup.com',
  sandbox: 'https://connect.squareupsandbox.com',
};
const SQUARE_VERSION = '2024-12-18';
const SQUARE_TIMEOUT_MS = 8000;

// Is the Function switched on and fully set up? (The "kill switch" is BREAKING_REGISTRATION —
// Board breaking's own, so switching it off never touches the other forms.)
function isSwitchedOn(env) {
  if (!env || env.BREAKING_REGISTRATION !== 'on') return false;
  // A binding with a blank connection string counts as "not set up" too (same fix as register.js).
  if (!env.HYPERDRIVE_BREAKING || typeof env.HYPERDRIVE_BREAKING.connectionString !== 'string'
      || env.HYPERDRIVE_BREAKING.connectionString === '') return false;
  return REQUIRED_SETTINGS.every((name) => typeof env[name] === 'string' && env[name] !== '');
}

// The code from the address (/api/breaking/<code>), lower-cased, or null if it can't be one.
function readCode(params) {
  const raw = Array.isArray(params?.code) ? params.code[0] : params?.code;
  if (typeof raw !== 'string') return null;
  const code = raw.toLowerCase();
  return CODE.test(code) ? code : null;
}

// One line in the Cloudflare log per request: method, status code, milliseconds. Nothing else.
function logLine(method, status, startedMs, now) {
  console.log(JSON.stringify({ fn: 'breaking', method, status, ms: now() - startedMs }));
}

// What a database error turns into: always `unavailable`, never the error text. "Permission
// denied" is EXPECTED once the brk_registrar's rights are taken away (the off switch) — the page
// then shows the same "try again" message.
function databaseFailure() {
  return { status: 'unavailable' };
}

// Makes the visitor's anonymous client key and asks the rate limiter whether this client may
// go on. The limiter key is "<client key>:breaking:GET" / "…:breaking:POST", so this form's
// in-memory counters are separate from the other forms'. Runs BEFORE any database connection.
async function passRateLimit(context, deps, method) {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  if (!ip) return { answer: { status: 'bad_request' } }; // Cloudflare always sets it
  const nowMs = (deps.now ?? Date.now)();
  const clientKey = await makeClientKey(env.CLIENT_KEY_SECRET, ip, new Date(nowMs));
  const allowed = await allowRequest({ env, clientKey, method: `breaking:${method}`, nowMs, memoryLimiter: deps.memoryLimiter });
  if (!allowed) return { answer: { status: 'rate_limited' } };
  return { clientKey, ip };
}

// Closes the database client after the answer has gone out. Errors while closing are ignored.
function closeLater(context, db) {
  if (!db) return;
  const closing = Promise.resolve()
    .then(() => db.close())
    .catch(() => {});
  if (typeof context.waitUntil === 'function') context.waitUntil(closing);
}

// ---------------------------------------------------------------------------------------------
// The answer allowlist. Each helper copies only the listed keys; a value of the wrong shape
// throws Unexpected, which the callers turn into `unavailable` (fail closed).
// ---------------------------------------------------------------------------------------------
class Unexpected extends Error {}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Copies only `keys` from `source` (keys the database left out are left out here too).
function pick(source, keys) {
  if (!isObject(source)) throw new Unexpected();
  const out = {};
  for (const key of keys) if (Object.hasOwn(source, key)) out[key] = source[key];
  return out;
}
function pickList(list, keys) {
  if (!Array.isArray(list)) throw new Unexpected();
  return list.map((item) => pick(item, keys));
}

const REGISTRATION_STATES = ['open', 'closed'];
const PAYING_BY = ['cash', 'check', 'card'];

// The event as the form shows it, from brk_public_event (status ok).
function publicEventObject(event) {
  if (!isObject(event) || !REGISTRATION_STATES.includes(event.registration_state)) throw new Unexpected();
  return {
    ...pick(event, ['name', 'location_code', 'event_date', 'registration_state', 'child_max_age']),
    classes: pickList(event.classes, ['id', 'name', 'start_time', 'end_time']),
    prices: pick(event.prices, ['tech_cents', 'adult_cents', 'card_extra_cents', 'same_day_extra_cents', 'same_day']),
    chart: pickList(event.chart, ['band', 'rank_name', 'sort', 'technique', 'tech_boards', 'adult_boards']),
  };
}

const isWhole = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

// A `field` name from the database's `invalid` answer. Only a short plain word (a–z, 0–9, _) goes on;
// anything else is left out, so the page can never be handed unexpected text.
function safeField(field) {
  return typeof field === 'string' && /^[a-z0-9_]{1,40}$/.test(field) ? { field } : {};
}

// brk_public_registration's `ok` answer, checked and renamed. Never leaves this file as it is: the
// registration id and link address are used by the Square step only.
function readRegistration(result) {
  if (!isObject(result) || result.status !== 'ok') throw new Unexpected();
  if (typeof result.registration_id !== 'string' || !UUID.test(result.registration_id)) throw new Unexpected();
  if (!isWhole(result.amount_cents, 0, MAX_TOTAL_CENTS) || !isWhole(result.balance_cents, 0, MAX_TOTAL_CENTS)) throw new Unexpected();
  if (!PAYING_BY.includes(result.paying_by)) throw new Unexpected();
  if (typeof result.paid !== 'boolean' || typeof result.has_link !== 'boolean') throw new Unexpected();
  return {
    registrationId: result.registration_id.toLowerCase(),
    amountCents: result.amount_cents,
    balanceCents: result.balance_cents,
    payingBy: result.paying_by,
    paid: result.paid,
    linkUrl: result.has_link && typeof result.link_url === 'string' ? result.link_url : null,
  };
}

// The hosts a payment link may be on: EXACTLY the list brk_public_set_link keeps in `v_hosts`
// (supabase/migrations/0051_board_breaking.sql). A change needs a later migration AND a change here.
const LINK_HOSTS = ['square.link', 'checkout.square.site', 'connect.squareup.com',
  'sandbox.square.link', 'connect.squareupsandbox.com', 'checkout.squareupsandbox.com'];
// The same two patterns the database uses: the whole address, then the host alone. After "https://"
// only letters, digits, dots and dashes up to the first "/" — so no user name ("x@") and no port (":443").
const LINK_SHAPE = /^https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*)?$/;
const LINK_HOST = /^https:\/\/([A-Za-z0-9.-]+)(?:\/|$)/;

// Is this text a payment-link address we can safely send a family to? Same rules as the database
// (https only, no user name, no port, the WHOLE host in LINK_HOSTS, compared in small letters). The
// database only stores such addresses; this is a second look before an address leaves the Function —
// for a stored link and for the one Square just answered with.
function isSquareLink(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > 2000 || !LINK_SHAPE.test(text)) return false;
  const host = LINK_HOST.exec(text)?.[1]?.toLowerCase();
  return typeof host === 'string' && LINK_HOSTS.includes(host);
}

// ---------------------------------------------------------------------------------------------
// The Square step: ask Square for a payment link for exactly what the database says is owed.
// ---------------------------------------------------------------------------------------------

// The school's Square settings from Cloudflare, or null when ANY of the three is missing or blank,
// or the environment isn't exactly "sandbox" or "production" (fail closed: that school's card
// students are then told to pay at the front desk; the other school is not affected).
function squareSettings(env, school) {
  if (!SCHOOLS.includes(school)) return null;
  const suffix = school.toUpperCase();
  const token = env[`SQUARE_ACCESS_TOKEN_${suffix}`];
  const locationId = env[`SQUARE_LOCATION_ID_${suffix}`];
  const environment = env[`SQUARE_ENVIRONMENT_${suffix}`];
  if (typeof token !== 'string' || token === '') return null;
  if (typeof locationId !== 'string' || locationId === '') return null;
  if (environment !== 'sandbox' && environment !== 'production') return null;
  return { token, locationId, base: SQUARE_BASES[environment] };
}

// "Board Breaking — Mia": the note the school sees on the payment. Control characters are removed
// and the name is cut short (Square limits the field). With no name it is just "Board Breaking".
function paymentNote(firstName) {
  const cleaned = typeof firstName === 'string' ? firstName.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  // Cut by whole characters (Array.from), so an emoji is never split into a broken half.
  const clean = Array.from(cleaned).slice(0, 60).join('');
  return clean === '' ? 'Board Breaking' : `Board Breaking — ${clean}`;
}

// SHA-256 of the parts joined with "|", as 64 lowercase hex characters (Square allows up to 192).
async function idempotencyKey(parts) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('|')));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Asks Square's CreatePaymentLink for a link. Returns { url, orderId } or null — never throws and
// never says why (any failure is just "no link"). The caller passes:
//   fetchImpl         the fetch function (the real one on Cloudflare; a fake one in the tests)
//   env               the Cloudflare settings (this function picks the school's own set)
//   school            'worcester' or 'shrewsbury' (the event's school, from the database)
//   registrationId    the registration id the database gave the Function; it goes into the
//                     idempotency key (see below), never to Square on its own
//   balanceCents      what the database says is still owed — the ONLY amount ever sent to Square
//   firstName         only for the note on the payment
//   code              the event code (for the return address)
//   publicOrigin      the address the family's request came from (a family on the old address
//                     returns to the old address)
//   timeoutMs         how long Square may take (tests make it short)
// The idempotency key is made from WHAT IS SENT: SHA-256 of registration id | amount | note | return
// address. Square gives the SAME link back for the same key and refuses (or reuses a stale link
// for) a key sent with a different request, so the key must change whenever the amount, the note
// or the return address changes — and stay the same for the same request, so a retry gets the same link.
export async function createPaymentLink({ fetchImpl, env, school, registrationId, balanceCents, firstName, code, publicOrigin, timeoutMs = SQUARE_TIMEOUT_MS }) {
  try {
    const settings = squareSettings(env, school);
    if (!settings) return null;
    if (!isWhole(balanceCents, 1, MAX_TOTAL_CENTS)) return null;
    if (typeof registrationId !== 'string' || registrationId === '') return null;
    const note = paymentNote(firstName);
    const redirectUrl = `${publicOrigin}/breaking/${code}?paid=1`;
    const body = {
      idempotency_key: await idempotencyKey([registrationId, balanceCents, note, redirectUrl]),
      quick_pay: {
        name: note,
        price_money: { amount: balanceCents, currency: 'USD' },
        location_id: settings.locationId,
      },
      checkout_options: {
        redirect_url: redirectUrl,
        ask_for_shipping_address: false,
      },
    };
    const response = await fetchImpl(`${settings.base}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.token}`,
        'Square-Version': SQUARE_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'error', // Square must answer itself; the token is never sent on to another address
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    if (!response.ok) return null;
    const answer = await response.json();
    const link = answer?.payment_link;
    if (!isSquareLink(link?.url)) return null;
    if (typeof link.order_id !== 'string' || link.order_id === '' || link.order_id.length > 200) return null;
    return { url: link.url, orderId: link.order_id };
  } catch {
    return null;
  }
}

// The whole "pay by card" step for one registration (already read from the database as `reg`).
// Returns { paid: true } (nothing owed any more), or { pay: { state: 'link', url } | { state: 'failed' }
// | { state: 'none' } }. Never throws: any trouble is `failed` (the student stays registered).
//   1. already paid → paid; not Card (or nothing owed) → none
//   2. a link was already stored for this registration → hand out that one (no second Square call)
//   3. which school? (brk_public_event says; the credentials are that school's own)
//   4. Square makes the link for exactly reg.balanceCents (idempotency key: see createPaymentLink)
//   5. brk_public_set_link stores it (it re-checks the address and the exact balance)
// A note on `pay` ("Try again"): the note carries the first name, and the idempotency key covers the
// note, so the page sends first_name with `pay` too (optional; without it the note is just "Board
// Breaking" and the key differs from the sign-up's — harmless, it only means a fresh link).
async function squareStep({ context, deps, db, code, submissionId, reg, firstName, origin }) {
  try {
    if (reg.paid) return { paid: true };
    if (reg.payingBy !== 'card' || reg.balanceCents <= 0) return { pay: { state: 'none' } };
    if (isSquareLink(reg.linkUrl)) return { pay: { state: 'link', url: reg.linkUrl } };

    const event = await db.publicEvent(code);
    const school = event?.status === 'ok' ? event.event?.location_code : null;
    if (!SCHOOLS.includes(school)) return { pay: { state: 'failed' } };

    const link = await createPaymentLink({
      fetchImpl: deps.fetchImpl,
      env: context.env,
      school,
      registrationId: reg.registrationId,
      balanceCents: reg.balanceCents,
      firstName,
      code,
      publicOrigin: origin,
      timeoutMs: deps.squareTimeoutMs,
    });
    if (!link) return { pay: { state: 'failed' } };

    const stored = await db.publicSetLink({
      registrationId: reg.registrationId,
      submissionId,
      orderId: link.orderId,
      linkUrl: link.url,
      amountCents: reg.balanceCents,
    });
    if (stored?.status === 'ok') return { pay: { state: 'link', url: link.url } };
    if (stored?.status === 'paid') return { paid: true };
    if (stored?.status === 'link_exists') {
      // Another request stored a link first. Hand out the stored one (the database vouched for it).
      const again = readRegistration(await db.publicRegistration(code, submissionId));
      if (again.paid) return { paid: true };
      if (isSquareLink(again.linkUrl)) return { pay: { state: 'link', url: again.linkUrl } };
    }
    return { pay: { state: 'failed' } };
  } catch {
    return { pay: { state: 'failed' } };
  }
}

// The database's answer to a sign-up, reduced to what the page may see (before the pay part).
// Returns { answer } for a finished answer, or { ok: true, … } when the sign-up succeeded.
function mapSignupResult(result) {
  switch (result?.status) {
    case 'ok':
      if (!isWhole(result.amount_cents, 0, MAX_TOTAL_CENTS) || !PAYING_BY.includes(result.paying_by)
          || typeof result.same_day !== 'boolean') throw new Unexpected();
      return { ok: true, amountCents: result.amount_cents, payingBy: result.paying_by, sameDay: result.same_day };
    case 'invalid':
      return { answer: { status: 'invalid', ...safeField(result.field) } };
    case 'price_changed':
      if (!isWhole(result.amount_cents, 0, MAX_TOTAL_CENTS)) throw new Unexpected();
      return { answer: { status: 'price_changed', amount_cents: result.amount_cents } };
    case 'not_found':
    case 'closed':
    case 'full':
    case 'duplicate':
    case 'rate_limited':
      return { answer: { status: result.status } };
    default:
      return { answer: { status: 'unavailable' } };
  }
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
  // 1. Kill switch / missing setting → not_open.
  if (!isSwitchedOn(env)) return { status: 'not_open' };
  // 2. A code that can't exist → not_found (no limiter, no database).
  const code = readCode(params);
  if (!code) return { status: 'not_found' };
  // 3. Per-client limiter.
  const gate = await passRateLimit(context, deps, 'GET');
  if (gate.answer) return gate.answer;

  // 4. brk_public_event(code). 5. The answer reduced to the allowlist + the site key.
  let db = null;
  try {
    db = deps.openDatabase(env);
    const result = await db.publicEvent(code);
    if (result?.status === 'ok') return { status: 'ok', event: publicEventObject(result.event), turnstile_site_key: env.TURNSTILE_SITE_KEY };
    if (result?.status === 'not_found') return { status: 'not_found' };
    return { status: 'unavailable' }; // an answer we don't expect: fail closed
  } catch {
    return databaseFailure();
  } finally {
    closeLater(context, db);
  }
}

// ---------------------------------------------------------------------------------------------
// POST — signup / pay / status.
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

// ----- Field limits -----
const onlyKeys = (object, allowed) => isObject(object) && Object.keys(object).every((key) => allowed.includes(key));
const isText = (value, max) => typeof value === 'string' && value.length <= max;
const isUuid = (value) => typeof value === 'string' && UUID.test(value);

// Checks every field's TYPE and rough size for the action the body names. Returns the cleaned-up
// values (with `action`), or null. (The database checks the real rules and answers `invalid` / … .)
export function readFields(body) {
  if (!isObject(body) || typeof body.action !== 'string' || !Object.hasOwn(ACTION_KEYS, body.action)) return null;
  const action = body.action;
  if (!onlyKeys(body, ACTION_KEYS[action])) return null;
  if (!isUuid(body.submission_id)) return null;
  const common = { action, submissionId: body.submission_id.toLowerCase() };
  if (action === 'status') return common;

  // signup and pay carry the human check, the honeypot and the two clock readings.
  if (body.website !== undefined && typeof body.website !== 'string') return null;
  if (!Number.isInteger(body.started_at) || !Number.isInteger(body.sent_at)) return null;
  if (!isText(body.turnstile_token, LIMITS.token)) return null;
  const checked = { ...common, token: body.turnstile_token };

  if (action === 'pay') {
    if (body.first_name !== undefined && !isText(body.first_name, LIMITS.name)) return null;
    return { ...checked, firstName: body.first_name ?? '' };
  }

  if (!isText(body.first_name, LIMITS.name) || !isText(body.last_name, LIMITS.name)) return null;
  if (!isWhole(body.age, 0, MAX_AGE)) return null;
  if (!isText(body.rank_name, LIMITS.rank)) return null;
  if (!isUuid(body.class_id)) return null;
  if (!isWhole(body.tech, 0, MAX_COUNT) || !isWhole(body.adult, 0, MAX_COUNT)) return null;
  if (!isText(body.paying_by, LIMITS.payingBy)) return null;
  if (!isWhole(body.expected_total_cents, 0, MAX_TOTAL_CENTS)) return null;
  return {
    ...checked,
    firstName: body.first_name,
    lastName: body.last_name,
    age: body.age,
    rankName: body.rank_name,
    classId: body.class_id.toLowerCase(),
    tech: body.tech,
    adult: body.adult,
    payingBy: body.paying_by,
    expectedTotalCents: body.expected_total_cents,
  };
}

async function postAnswer(context, deps) {
  const { request, env, params } = context;

  // 1. Kill switch and settings.
  if (!isSwitchedOn(env)) return { status: 'not_open' };

  // 2. Only our own page may send requests: the browser adds an Origin header that a page on
  //    another site can't fake. PUBLIC_ORIGIN is a list of our own addresses
  //    (functions/_lib/origins.js, rulebook v1.200); the request must come from one of them, and
  //    Turnstile (step 8) then expects that same address's host. `origin` is also where the family
  //    returns to after Square, so a family on the old address comes back to the old address.
  const origin = matchOrigin(request, env);
  if (origin === null) return { status: 'bad_request' };

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

  // 5. At most 8 KB, checked before and while reading.
  const text = await readBodyLimited(request, MAX_BREAKING_BODY_BYTES);
  if (text === null) return { status: 'bad_request' };
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { status: 'bad_request' };
  }

  // 5a. Field limits: only the known keys for this action, the right types, sensible sizes.
  const fields = readFields(body);
  if (!fields) return { status: 'bad_request' };

  // `status` (the page after Square) needs only the rate limit — it asks a question, it changes nothing.
  if (fields.action !== 'status') {
    // 6. Honeypot: a hidden field people never see. Bots fill in every field they find.
    if (body.website !== undefined && body.website !== '') return { status: 'bad_request' };

    // 7. Too fast? started_at = when the form was opened, sent_at = when the button was tapped,
    //    both from the family's own device clock. Under 4 seconds → a bot. (Only filters SIMPLE
    //    bots; Turnstile, the rate limits and the database's checks are the real protection.)
    if (body.sent_at - body.started_at < MIN_FILL_MS) return { status: 'bad_request' };

    // 8. The human check (Turnstile), verified with Cloudflare using our secret. The token must
    //    have been made for THIS button (breaking_signup / breaking_pay) on our own site.
    const expectedHost = hostOf(origin);
    if (expectedHost === null) return { status: 'not_open' }; // PUBLIC_ORIGIN isn't a web address: treat as not set up
    const human = await verifyTurnstile({
      fetchImpl: deps.fetchImpl,
      secret: env.TURNSTILE_SECRET,
      token: fields.token,
      ip,
      expectedHost,
      expectedAction: fields.action === 'signup' ? BREAKING_SIGNUP_ACTION : BREAKING_PAY_ACTION,
    });
    if (!human) return { status: 'verify_failed' };
  }

  // 9. The database (it checks every rule again and decides the answer). It gets the anonymous,
  //    daily-changing client key from step 4 — never the raw IP.
  let db = null;
  try {
    db = deps.openDatabase(env);
    if (fields.action === 'signup') return await signupAnswer({ context, deps, db, code, clientKey, fields, origin });
    if (fields.action === 'pay') return await payAnswer({ context, deps, db, code, fields, origin });
    return await statusAnswer({ db, code, fields });
  } catch {
    return databaseFailure();
  } finally {
    closeLater(context, db);
  }
}

// action signup → brk_public_signup, then (Card only) the Square step.
async function signupAnswer({ context, deps, db, code, clientKey, fields, origin }) {
  const result = mapSignupResult(await db.publicSignup({ code, clientKey, ...fields }));
  if (result.answer) return result.answer;
  const answer = { status: 'ok', amount_cents: result.amountCents, paying_by: result.payingBy, same_day: result.sameDay };
  if (result.payingBy !== 'card') return { ...answer, pay: { state: 'none' } };

  // Card. Read the registration back first: it gives the registration id (the idempotency key) and
  // the BALANCE, which is what is charged (a retried sign-up that was already paid owes nothing).
  let reg;
  try {
    reg = readRegistration(await db.publicRegistration(code, fields.submissionId));
  } catch {
    return { ...answer, pay: { state: 'failed' } }; // registered, but we can't make a link right now
  }
  const step = await squareStep({ context, deps, db, code, submissionId: fields.submissionId, reg, firstName: fields.firstName, origin });
  return { ...answer, pay: step.paid ? { state: 'none' } : step.pay };
}

// action pay ("Try again") → brk_public_registration, then the Square step with the balance.
async function payAnswer({ context, deps, db, code, fields, origin }) {
  const result = await db.publicRegistration(code, fields.submissionId);
  if (result?.status === 'not_found') return { status: 'not_found' };
  const reg = readRegistration(result);
  if (reg.paid) return { status: 'paid' };
  const step = await squareStep({ context, deps, db, code, submissionId: fields.submissionId, reg, firstName: fields.firstName, origin });
  if (step.paid) return { status: 'paid' };
  return { status: 'ok', amount_cents: reg.balanceCents, pay: step.pay };
}

// action status (the return page after Square) → brk_public_registration.
async function statusAnswer({ db, code, fields }) {
  const result = await db.publicRegistration(code, fields.submissionId);
  if (result?.status === 'not_found') return { status: 'not_found' };
  const reg = readRegistration(result);
  return { status: 'ok', paid: reg.paid, amount_cents: reg.balanceCents, paying_by: reg.payingBy };
}

// Any other method (PUT, DELETE, …) → bad_request.
export function handleOther() {
  return jsonAnswer({ status: 'bad_request' });
}
