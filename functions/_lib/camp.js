// camp.js — everything the public camp sign-up Function does, step by step.
// Why it exists: functions/api/camp/[code].js is only the "front door" Cloudflare calls. The real
// work lives here, written so the tests (functions/tests/camp.test.mjs) can run it in plain Node
// with a FAKE database and a FAKE Turnstile — the `deps` argument says which ones to use.
// It is modelled line by line on register.js (Color Belt's reviewed Function) and follows its
// steps in the same order. Spec: contract 0013 §4.2–§4.6 (it wins over anything else).
//
//   GET  /api/camp/<code>  → what the family form needs to show for that camp
//   POST /api/camp/<code>  → save one family's sign-up (1–3 children)
//
// Every answer is JSON with a `status` code; the page turns codes into words. Every answer is
// cut down to an ALLOWLIST (§4.6): only the fields listed there go to the browser, everything
// else the database might send is dropped. An answer we don't recognise becomes `unavailable`.
//
// Safety rules followed here (handoff §6, same as register.js):
//   - Fail closed: a missing setting, an error, or an answer we don't recognise never lets a
//     sign-up through and never shows the form.
//   - Never send database error text to the browser, and never log names, phones, signatures,
//     IPs or error details — the log gets only {fn:'camp', method, status, ms}.
//   - Anything unplanned that throws answers `unavailable` with no details.
//   - No database connection is opened before the request has passed the rate limit.
// Reused unchanged from Color Belt: http.js (answers, body size), clientKey.js (anonymous
// client key), rateLimit.js (per-client counter), turnstile.js (with action "camp_signup").
import { jsonAnswer, readBodyLimited } from './http.js';
import { verifyTurnstile } from './turnstile.js';
import { makeClientKey } from './clientKey.js';
import { allowRequest } from './rateLimit.js';

// The settings the Function needs (Cloudflare dashboard → Pages project → Settings, Production
// only, contract 0013 §4.2). If any is missing the Function answers "not open" for everything.
// TURNSTILE_* , CLIENT_KEY_SECRET and PUBLIC_ORIGIN are the same values Color Belt uses.
const REQUIRED_SETTINGS = ['TURNSTILE_SECRET', 'CLIENT_KEY_SECRET', 'PUBLIC_ORIGIN', 'TURNSTILE_SITE_KEY'];

// The Turnstile action the camp page names when it asks for a token (§4.4). A token made for
// the Color Belt form ("register") is refused here.
export const CAMP_TURNSTILE_ACTION = 'camp_signup';

// A form must take at least this long to fill in. Bots usually send instantly.
export const MIN_FILL_MS = 4000;

// The rough size limits of §4.3. The database checks the real rules (names ≤ 60 characters,
// phones exactly 10 digits, …) and answers `invalid`; these only stop silly sizes early.
const LIMITS = {
  name: 200,
  phone: 20,
  relation: 80,
  payingBy: 20,
  signature: 70000,
  ackVersion: 40,
  waiverVersion: 64,
  token: 2048,
};
const MAX_CHILDREN = 3;
const MAX_IDS = 10; // day ids per child, day ids per extra, extras per child
const MAX_AGE = 150; // only a sanity limit; the camp's own range is checked by the database
const MAX_TOTAL_CENTS = 600000; // 3 children × $2,000

// A UUID like 8c0e4b1e-3f7a-4d2b-9a65-0f5b2c1d7e90.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Camp codes are exactly 8 characters from a–z and 2–9 without the look-alikes i, l and o —
// the alphabet the database uses (testing_new_public_code). Anything else can't be a real code,
// so it is answered "not found" without using rate-limit allowance or a database connection.
const CODE = /^[a-hjkmnp-z2-9]{8}$/;

// The only keys a POST body may have (§4.3). Anything else → bad_request.
const BODY_KEYS = [
  'submission_id', 'children', 'parent', 'emergency', 'paying_by', 'acknowledged', 'signature',
  'ack_version', 'waiver_version', 'expected_total_cents', 'website', 'started_at', 'sent_at',
  'turnstile_token',
];
const CHILD_KEYS = ['first_name', 'last_name', 'age', 'member', 'day_ids', 'extras'];
const EXTRA_KEYS = ['extra_id', 'day_ids'];
const PERSON_KEYS = ['name', 'phone', 'relation'];

// Is the Function switched on and fully set up? (The "kill switch" is CAMPS_REGISTRATION —
// Camps' own, so switching Camps off never touches Color Belt's PUBLIC_REGISTRATION.)
function isSwitchedOn(env) {
  if (!env || env.CAMPS_REGISTRATION !== 'on') return false;
  if (!env.HYPERDRIVE_CAMPS || typeof env.HYPERDRIVE_CAMPS.connectionString !== 'string') return false;
  return REQUIRED_SETTINGS.every((name) => typeof env[name] === 'string' && env[name] !== '');
}

// The code from the address (/api/camp/<code>), lower-cased, or null if it can't be one.
function readCode(params) {
  const raw = Array.isArray(params?.code) ? params.code[0] : params?.code;
  if (typeof raw !== 'string') return null;
  const code = raw.toLowerCase();
  return CODE.test(code) ? code : null;
}

// One line in the Cloudflare log per request: method, status code, milliseconds. Nothing else.
function logLine(method, status, startedMs, now) {
  console.log(JSON.stringify({ fn: 'camp', method, status, ms: now() - startedMs }));
}

// What a database error turns into: always `unavailable`, never the error text. "Permission
// denied" is EXPECTED once the camps_registrar's rights are taken away (the off switch, SETUP
// "Migration 0013" step j) — the page then shows the same "try again" message.
function databaseFailure() {
  return { status: 'unavailable' };
}

// Makes the visitor's anonymous client key and asks the rate limiter whether this client may
// go on. The limiter key is "<client key>:camp:GET" / "…:camp:POST", so the camp form's
// in-memory counters are separate from Color Belt's (§4.2). Runs BEFORE any database connection.
async function passRateLimit(context, deps, method) {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  if (!ip) return { answer: { status: 'bad_request' } }; // Cloudflare always sets it
  const nowMs = (deps.now ?? Date.now)();
  const clientKey = await makeClientKey(env.CLIENT_KEY_SECRET, ip, new Date(nowMs));
  const allowed = await allowRequest({ env, clientKey, method: `camp:${method}`, nowMs, memoryLimiter: deps.memoryLimiter });
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
// The answer allowlist (§4.6). Each helper copies only the listed keys; a value of the wrong
// shape throws Unexpected, which the callers turn into `unavailable` (fail closed).
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
function pickAddress(address) {
  return isObject(address) ? pick(address, ['street', 'city', 'state', 'zip']) : null;
}

// The camp as the form shows it (§1.16 `camp`), from camp_public_camp.
function publicCampObject(camp) {
  if (!isObject(camp)) throw new Unexpected();
  return {
    ...pick(camp, [
      'name', 'start_time', 'end_time', 'both_schools', 'school_name', 'description', 'waiver_text',
      'early_until', 'signup_closes_on', 'min_age', 'max_age',
    ]),
    days: pickList(camp.days, ['day_id', 'day']),
    address: pickAddress(camp.address),
    prices: pickList(camp.prices, [
      'day_count', 'member_early_cents', 'member_regular_cents', 'nonmember_early_cents', 'nonmember_regular_cents',
    ]),
    extras: pickList(camp.extras, ['extra_id', 'name', 'price_cents', 'per', 'not_for_all_days']),
  };
}

const CAMP_STATES = ['open', 'not_open_yet', 'closed', 'finished'];

// The whole camp_public_camp answer (status ok) reduced to §4.6: used for GET and for the
// `camp` inside price_changed / camp_changed (the database sends its camp_public_camp answer).
function publicCampAnswer(result) {
  if (!isObject(result) || result.status !== 'ok' || !CAMP_STATES.includes(result.state)) throw new Unexpected();
  return {
    status: 'ok',
    state: result.state,
    opens_on: result.opens_on ?? null,
    closed_on: result.closed_on ?? null,
    price_kind_today: result.price_kind_today,
    ack_version: result.ack_version,
    waiver_version: result.waiver_version,
    camp: publicCampObject(result.camp),
  };
}

// The camp part of a successful sign-up (§1.16 step 12).
function signedUpCampObject(camp) {
  return {
    ...pick(camp, ['name', 'start_time', 'end_time', 'school_name', 'both_schools', 'description']),
    // Only {day_id, day} objects pass; anything else in the list is dropped.
    days: Array.isArray(camp.days) ? camp.days.filter(isObject).map((d) => pick(d, ['day_id', 'day'])) : [],
    address: pickAddress(camp.address),
  };
}
function signedUpChild(child) {
  return {
    ...pick(child, ['first_name', 'last_name', 'day_count', 'days', 'price_kind', 'base_cents', 'total_cents']),
    extras: pickList(child.extras ?? [], ['name', 'per', 'count', 'cents']),
  };
}

// The database's answer to a sign-up, reduced to what the page may see (§4.6, POST rows).
function mapSignupResult(result) {
  switch (result?.status) {
    case 'ok':
      if (!Array.isArray(result.children)) throw new Unexpected();
      return {
        status: 'ok',
        reference: result.reference,
        paying_by: result.paying_by,
        family_total_cents: result.family_total_cents,
        children: result.children.map(signedUpChild),
        camp: signedUpCampObject(result.camp),
      };
    case 'not_open':
      // From the database (+ opens_on). Without a date the page shows the general line.
      return typeof result.opens_on === 'string' ? { status: 'not_open', opens_on: result.opens_on } : { status: 'not_open' };
    case 'closed':
      return { status: 'closed', closed_on: result.closed_on ?? null };
    case 'price_changed':
      return {
        status: 'price_changed',
        new_total_cents: result.new_total_cents,
        old_total_cents: result.old_total_cents,
        camp: publicCampAnswer(result.camp),
      };
    case 'camp_changed':
      return { status: 'camp_changed', camp: publicCampAnswer(result.camp) };
    case 'not_found':
    case 'finished':
    case 'rate_limited':
    case 'invalid':
      return { status: result.status };
    default:
      return { status: 'unavailable' };
  }
}

// ---------------------------------------------------------------------------------------------
// GET — the camp as the form shows it.
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
  // 1. Kill switch / missing setting → not_open, with no opens_on (the page shows no date).
  if (!isSwitchedOn(env)) return { status: 'not_open' };
  // 2. A code that can't exist → not_found (no limiter, no database).
  const code = readCode(params);
  if (!code) return { status: 'not_found' };
  // 3. Per-client limiter.
  const gate = await passRateLimit(context, deps, 'GET');
  if (gate.answer) return gate.answer;

  // 4. camp_public_camp(code). 5. The answer reduced to the allowlist + the site key.
  let db = null;
  try {
    db = deps.openDatabase(env);
    const result = await db.publicCamp(code);
    if (result?.status === 'ok') return { ...publicCampAnswer(result), turnstile_site_key: env.TURNSTILE_SITE_KEY };
    if (result?.status === 'not_found') return { status: 'not_found' };
    return { status: 'unavailable' }; // an answer we don't expect: fail closed
  } catch {
    return databaseFailure();
  } finally {
    closeLater(context, db);
  }
}

// ---------------------------------------------------------------------------------------------
// POST — save one family's sign-up.
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

// ----- The field limits of §4.3 -----
const onlyKeys = (object, allowed) => isObject(object) && Object.keys(object).every((key) => allowed.includes(key));
const isText = (value, max) => typeof value === 'string' && value.length <= max;
const isWhole = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

// A list of 0…max uuid strings with no repeats (ignoring upper / lower case) → lower-cased
// copy, or null.
function readIds(list, min, max) {
  if (!Array.isArray(list) || list.length < min || list.length > max) return null;
  if (!list.every((id) => typeof id === 'string' && UUID.test(id))) return null;
  const lower = list.map((id) => id.toLowerCase());
  return new Set(lower).size === lower.length ? lower : null;
}

// One child → a clean copy with only the allowed keys, or null.
function readChild(child) {
  if (!onlyKeys(child, CHILD_KEYS)) return null;
  if (!isText(child.first_name, LIMITS.name) || !isText(child.last_name, LIMITS.name)) return null;
  if (!isWhole(child.age, 0, MAX_AGE)) return null;
  if (typeof child.member !== 'boolean') return null;
  const dayIds = readIds(child.day_ids, 1, MAX_IDS);
  if (!dayIds) return null;
  if (!Array.isArray(child.extras) || child.extras.length > MAX_IDS) return null;
  const extras = [];
  for (const extra of child.extras) {
    if (!onlyKeys(extra, EXTRA_KEYS)) return null;
    if (typeof extra.extra_id !== 'string' || !UUID.test(extra.extra_id)) return null;
    const extraDays = readIds(extra.day_ids, 0, MAX_IDS);
    if (!extraDays) return null;
    extras.push({ extra_id: extra.extra_id.toLowerCase(), day_ids: extraDays });
  }
  return {
    first_name: child.first_name,
    last_name: child.last_name,
    age: child.age,
    member: child.member,
    day_ids: dayIds,
    extras,
  };
}

// The parent or the emergency contact → { name, phone, relation }, or null.
function readPerson(person) {
  if (!onlyKeys(person, PERSON_KEYS)) return null;
  if (!isText(person.name, LIMITS.name) || !isText(person.phone, LIMITS.phone) || !isText(person.relation, LIMITS.relation)) return null;
  return { name: person.name, phone: person.phone, relation: person.relation };
}

// Checks every field's TYPE and rough size. Returns the cleaned-up values, or null.
// (The database checks the real rules and answers `invalid` / `camp_changed` / … .)
export function readFields(body) {
  if (!onlyKeys(body, BODY_KEYS)) return null;
  if (typeof body.submission_id !== 'string' || !UUID.test(body.submission_id)) return null;
  if (!Array.isArray(body.children) || body.children.length < 1 || body.children.length > MAX_CHILDREN) return null;
  const children = body.children.map(readChild);
  if (children.some((child) => child === null)) return null;
  const parent = readPerson(body.parent);
  const emergency = readPerson(body.emergency);
  if (!parent || !emergency) return null;
  if (!isText(body.paying_by, LIMITS.payingBy)) return null;
  if (typeof body.acknowledged !== 'boolean') return null;
  if (!isText(body.signature, LIMITS.signature)) return null;
  if (!isText(body.ack_version, LIMITS.ackVersion)) return null;
  if (!isText(body.waiver_version, LIMITS.waiverVersion)) return null;
  if (!isWhole(body.expected_total_cents, 0, MAX_TOTAL_CENTS)) return null;
  if (body.website !== undefined && typeof body.website !== 'string') return null;
  if (!Number.isInteger(body.started_at) || !Number.isInteger(body.sent_at)) return null;
  if (!isText(body.turnstile_token, LIMITS.token)) return null;
  return {
    submissionId: body.submission_id.toLowerCase(),
    children,
    parentName: parent.name,
    parentPhone: parent.phone,
    parentRelation: parent.relation,
    emergencyName: emergency.name,
    emergencyPhone: emergency.phone,
    emergencyRelation: emergency.relation,
    payingBy: body.paying_by,
    acknowledged: body.acknowledged,
    signature: body.signature,
    ackVersion: body.ack_version,
    waiverVersion: body.waiver_version,
    expectedTotalCents: body.expected_total_cents,
  };
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

  // 5a. Field limits (§4.3): only the known keys, the right types, sensible sizes.
  const fields = readFields(body);
  if (!fields) return { status: 'bad_request' };

  // 6. Honeypot: a hidden field people never see. Bots fill in every field they find.
  if (body.website !== undefined && body.website !== '') return { status: 'bad_request' };

  // 7. Too fast? started_at = when the form was opened, sent_at = when Sign up was tapped, both
  //    from the family's own device clock. Under 4 seconds → a bot. (Only filters SIMPLE bots;
  //    Turnstile, the rate limits and the database's checks are the real protection.)
  if (body.sent_at - body.started_at < MIN_FILL_MS) return { status: 'bad_request' };

  // 8. The human check (Turnstile), verified with Cloudflare using our secret. The token must
  //    have been made for THIS form (action camp_signup) on our own site.
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
    expectedAction: CAMP_TURNSTILE_ACTION,
  });
  if (!human) return { status: 'verify_failed' };

  // 9. Save it (the database checks every rule again and decides the answer). It gets the
  //    anonymous, daily-changing client key from step 4 — never the raw IP.
  let db = null;
  try {
    db = deps.openDatabase(env);
    const result = await db.publicSignup({ code, clientKey, ...fields });
    return mapSignupResult(result);
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
