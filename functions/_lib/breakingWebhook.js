// breakingWebhook.js — what the Board breaking Square webhook does with one incoming message.
// Why it exists: Square calls functions/api/square/breaking/[school].js when a payment changes. That
// file is only the front door; the steps live here so the tests (functions/tests/breaking.test.mjs)
// can run them in plain Node with a FAKE database. Spec: FUNCTION-API.md "Square webhooks" and
// CONTRACT-0051.md §6.
//
// The steps, in this order (each one stops the request if it fails):
//   1. POST only                         → anything else: 405
//   2. the school in the address         → not worcester / shrewsbury: 404
//   3. that school's settings are there  → a missing signature key, notification URL, Square location
//                                           id or database binding: 503 and NO database call (fail closed)
//   4. read the raw body once (≤ 64 KB)  → too big or unreadable text: 403 (it can't be verified)
//   5. check the signature, constant time, BEFORE parsing anything → missing / wrong: 403
//   6. only now parse the JSON           → unreadable: 400
//   7. only `payment.updated` matters    → anything else: 200 "ignored" (so Square stops retrying)
//   7a. only THIS school's Square location → a Square subscription covers the whole school account, so a
//      payment for any other location (or with no location) is 200 "ignored", no database call
//   8. map the fields defensively        → a signed message with missing pieces: 400
//   9. brk_square_payment as `brk_square`→ every database answer: 200; a database error: 500
//      (Square then retries; the database's unique keys make a retry safe)
// The SCHOOL given to the database always comes from the address (step 2), never from the message.
// The log gets only {fn, outcome word, ms} — never the body, a signature, a key or a payment id.
// (An answer that is not `ok` is logged under its own status word, e.g. "invalid", and still gets 200.)
import { readBodyLimited } from './http.js';
import { verifySquareSignature } from './squareSignature.js';

export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

const SCHOOLS = ['worcester', 'shrewsbury'];
const SIGNATURE_HEADER = 'x-square-hmacsha256-signature';

// The outcome words brk_square_payment may answer (SIGNATURES-0051). Anything else is logged as
// `other`, so a surprising database answer never puts unexpected text in the log.
const OUTCOMES = [
  'paid', 'duplicate', 'unknown_order', 'amount_mismatch', 'not_card', 'not_completed',
  'already_paid', 'wrong_school', 'link_cleared',
];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyText = (value, max) => typeof value === 'string' && value !== '' && value.length <= max;

// The settings for one school, or null if any is missing. (Square sends each school's messages to
// its own address and signs them with its own key.)
function webhookSettings(env, school) {
  const suffix = school.toUpperCase();
  const signatureKey = env?.[`SQUARE_WEBHOOK_SIGNATURE_KEY_${suffix}`];
  const notificationUrl = env?.[`SQUARE_WEBHOOK_URL_${suffix}`];
  const locationId = env?.[`SQUARE_LOCATION_ID_${suffix}`];
  const connection = env?.HYPERDRIVE_BREAKING_SQUARE?.connectionString;
  if (typeof locationId !== 'string' || locationId === '') return null;
  if (typeof signatureKey !== 'string' || signatureKey === '') return null;
  if (typeof notificationUrl !== 'string' || notificationUrl === '') return null;
  if (typeof connection !== 'string' || connection === '') return null;
  return { signatureKey, notificationUrl, locationId };
}

// The fields of a `payment.updated` message the database needs, or null if the shape is wrong.
//   { ignored: true } when the message can't belong to any registration (no order id)
export function mapPayment(message) {
  const payment = message?.data?.object?.payment;
  if (!isObject(payment)) return null;
  const amount = payment.amount_money?.amount;
  if (!isNonEmptyText(message.event_id, 200) || !isNonEmptyText(payment.id, 200)) return null;
  if (!isNonEmptyText(payment.status, 40)) return null;
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100_000_000) return null;
  const currency = payment.amount_money?.currency;
  if (typeof currency !== 'string' || currency.length > 10) return null;
  // A payment with no order can't be matched to a registration: nothing to record, nothing to retry.
  if (!isNonEmptyText(payment.order_id, 200)) return { ignored: true };
  return {
    eventId: message.event_id,
    paymentId: payment.id,
    orderId: payment.order_id,
    amountCents: amount,
    currency,
    status: payment.status,
  };
}

// The plain answer Square gets. Square only looks at the status code; the body is for people.
function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function closeLater(context, db) {
  if (!db) return;
  const closing = Promise.resolve()
    .then(() => db.close())
    .catch(() => {});
  if (typeof context.waitUntil === 'function') context.waitUntil(closing);
}

// Handles one webhook request. `deps` = { openDatabase, now }.
export async function handleWebhook(context, deps) {
  const now = deps.now ?? Date.now;
  const started = now();
  let outcome = 'error';
  let response;
  try {
    ({ response, outcome } = await webhookAnswer(context, deps));
  } catch {
    response = reply(500, { status: 'error' });
    outcome = 'error';
  }
  console.log(JSON.stringify({ fn: 'breaking_webhook', outcome, ms: now() - started }));
  return response;
}

async function webhookAnswer(context, deps) {
  const { request, env, params } = context;

  // 1. POST only.
  if (request.method !== 'POST') return { response: reply(405, { status: 'method_not_allowed' }), outcome: 'method' };

  // 2. The school comes from the address and nowhere else.
  const school = Array.isArray(params?.school) ? params.school[0] : params?.school;
  if (typeof school !== 'string' || !SCHOOLS.includes(school)) return { response: reply(404, { status: 'not_found' }), outcome: 'unknown_school' };

  // 3. That school's settings must all be there, or we refuse without touching the database.
  const settings = webhookSettings(env, school);
  if (!settings) return { response: reply(503, { status: 'not_configured' }), outcome: 'not_configured' };

  // 4. The raw body, read once as text (the signature covers exactly these characters).
  const rawBody = await readBodyLimited(request, MAX_WEBHOOK_BODY_BYTES);
  if (rawBody === null) return { response: reply(403, { status: 'forbidden' }), outcome: 'bad_signature' };

  // 5. The signature, BEFORE anything is parsed.
  const valid = await verifySquareSignature({
    signatureKey: settings.signatureKey,
    notificationUrl: settings.notificationUrl,
    rawBody,
    header: request.headers.get(SIGNATURE_HEADER),
  });
  if (!valid) return { response: reply(403, { status: 'forbidden' }), outcome: 'bad_signature' };

  // 6. Now it is Square's message: read it.
  let message;
  try {
    message = JSON.parse(rawBody);
  } catch {
    return { response: reply(400, { status: 'bad_request' }), outcome: 'bad_body' };
  }
  if (!isObject(message)) return { response: reply(400, { status: 'bad_request' }), outcome: 'bad_body' };

  // 7. Only payment.updated is ours.
  if (message.type !== 'payment.updated') return { response: reply(200, { status: 'ignored' }), outcome: 'ignored' };

  // 7a. Only payments at THIS school's Square location are ours (the subscription covers the whole account).
  if (message.data?.object?.payment?.location_id !== settings.locationId) return { response: reply(200, { status: 'ignored' }), outcome: 'other_location' };

  // 8. The fields, checked one by one.
  const payment = mapPayment(message);
  if (!payment) return { response: reply(400, { status: 'bad_request' }), outcome: 'bad_body' };
  if (payment.ignored) return { response: reply(200, { status: 'ignored' }), outcome: 'ignored' };

  // 9. The database. Any error → 500 so Square tries again later.
  let db = null;
  try {
    db = deps.openDatabase(env);
    const result = await db.squarePayment({ school, ...payment });
    // The log word: the database's outcome when it said ok; otherwise its own status word (e.g.
    // "invalid"), only if it is a plain lower-case word — anything else is just "other".
    let word = 'other';
    if (result?.status === 'ok') word = typeof result.outcome === 'string' && OUTCOMES.includes(result.outcome) ? result.outcome : 'other';
    else if (typeof result?.status === 'string' && /^[a-z_]{1,30}$/.test(result.status)) word = result.status;
    return { response: reply(200, { status: 'ok' }), outcome: word };
  } catch {
    return { response: reply(500, { status: 'error' }), outcome: 'db_error' };
  } finally {
    closeLater(context, db);
  }
}
