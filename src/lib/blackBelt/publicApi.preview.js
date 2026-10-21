// publicApi.preview.js — PREVIEW MODE ONLY: a stand-in for the Black Belt family form's Function
// (functions/api/black-belt/[code].js).
// Why it exists: in `npm run dev:preview-mode` there is no Cloudflare Function and no database on
// this PC, so the family page (src/blackBelt/form/) calls this file instead of
// fetch('/api/black-belt/<code>') (contract 0016-B1 §2.6). It answers with exactly the JSON the
// real Function sends (§4.6) and keeps its data in the SAME browser storage as the staff preview
// ('tkd.preview.blackBelt'), so a family registration made here shows up on the staff side, and
// closing registration there shows "closed" here.
//
// The page imports it only behind `import.meta.env.MODE === 'preview'` (a dynamic import), so the
// real build never contains it. Nothing here is safe for production: there is no human check.
//
//   getCycle(code)        → { status:'ok', state, closed_on, school, cycle, waiver, turnstile_site_key: null }
//                           or { status:'not_found' } / { status:'not_open' } (switched off)
//   register(code, body)  → { status:'ok', reference, first_name, last_name, dan, kukkiwon, plan_name,
//                             items, total_cents, cycle_name, school } or a refusal
//     body = what the page POSTs: { submission_id, first_name, last_name, date_of_birth, email, dan,
//       cycle_plan_id, kukkiwon, acknowledged, waiver_version, signer_name, signature, website
//       (honeypot), started_at, sent_at, turnstile_token }
//   Checks in the Function's order: kill switch → code → body size (100 KB) → JSON object →
//   honeypot → too fast (4 s) → field types → forceVerifyFailed → the database's core.
//
// Console helpers (installed on first use; mockClient adds them to the staff preview too):
//   __tkdPreview.setBlackBeltRegistration(false)  the form's kill switch: every link "not open"
//   __tkdPreview.forceVerifyFailed(true)          the NEXT Send fails the human check
//   __tkdPreview.forceRateLimited(true)           every Send answers "too many tries" until false
//   __tkdPreview.setToday('2027-02-15')           pretend it's another day (null = the real date)
// Never logs anything the family typed.
import { readStorage, writeStorage, removeStorage } from '../storage.js';
import { todayInSchoolTime, isIsoDate, PREVIEW_TODAY_KEY } from '../testing/eventRules.js';
import { createBlackBeltBackend, BB_STORE_KEY } from './mockBlackBelt.js';
import { codeIsValid } from './rules.js';

const SWITCH_KEY = 'tkd.preview.bbPublicRegistration'; // 'off' = kill switch on (default: on)
const VERIFY_KEY = 'tkd.preview.forceVerifyFailed'; // '1' = the next Send fails the human check (shared with Color Belt)
const RATE_KEY = 'tkd.preview.forceRateLimited'; // '1' = every Send is "too many tries" (shared with Color Belt)
const TESTING_KEY = 'tkd.preview.testing'; // Color Belt's preview store: the schools' names and addresses
const CLIENT_KEY = 'preview-browser'; // stands in for the Function's HMAC of the IP
const MIN_FILL_MS = 4000; // the Function's "too fast" rule
const MAX_BODY_CHARACTERS = 100 * 1024; // the Function's 100 KB body limit
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
// The keys of the ok answer the Function passes on (bb_public_answer's keys) — nothing else.
const OK_KEYS = ['status', 'reference', 'first_name', 'last_name', 'dan', 'kukkiwon', 'plan_name', 'items', 'total_cents', 'cycle_name', 'school'];
let fakeDelayMs = 300; // pretend the network takes a moment, so "Sending…" is visible

const wait = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

// The pretend network time in milliseconds (checks.mjs sets 0).
export function setFakeDelay(ms) {
  fakeDelayMs = Math.max(0, Number(ms) || 0);
}

// "Today" at the school, or the pretend date set with setToday.
export function previewToday() {
  const pretend = readStorage(PREVIEW_TODAY_KEY);
  return isIsoDate(pretend) ? pretend : todayInSchoolTime(new Date());
}

// A random id in the real uuid format.
function newUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, hex);
}

// The preview database (the same code the staff preview uses), on this browser's storage.
// Made on first use, so just importing this file never touches storage.
let backend = null;
function store() {
  if (backend) return backend;
  backend = createBlackBeltBackend({
    loadStore: () => JSON.parse(readStorage(BB_STORE_KEY)),
    saveStore: (data) => writeStorage(BB_STORE_KEY, JSON.stringify(data)),
    now: () => Date.now(),
    today: previewToday,
    newId: newUuid,
    getLocations: () => {
      try {
        return JSON.parse(readStorage(TESTING_KEY))?.locations ?? null;
      } catch {
        return null;
      }
    },
  });
  return backend;
}

const switchedOn = () => readStorage(SWITCH_KEY) !== 'off';

// GET /api/black-belt/<code>
export async function getCycle(code) {
  installHelpers();
  await wait(fakeDelayMs);
  if (!switchedOn()) return { status: 'not_open' };
  const clean = typeof code === 'string' ? code.toLowerCase() : '';
  if (!codeIsValid(clean)) return { status: 'not_found' }; // never reaches the database
  const result = store().publicCycle(clean);
  if (result.status !== 'ok') return { status: 'not_found' };
  return {
    status: 'ok', state: result.state, closed_on: result.closed_on ?? null, school: result.school, cycle: result.cycle,
    waiver: result.waiver, turnstile_site_key: null, // no human check in preview
  };
}

// The POST body's field types, as the Function checks them before the database (§4.7).
function typesOk(body) {
  const str = (v, max) => typeof v === 'string' && v.length <= max;
  return UUID.test(String(body.submission_id ?? '')) && typeof body.submission_id === 'string'
    && typeof body.cycle_plan_id === 'string' && UUID.test(body.cycle_plan_id)
    && str(body.first_name, 200) && str(body.last_name, 200) && str(body.signer_name, 200)
    && typeof body.date_of_birth === 'string' && DATE_SHAPE.test(body.date_of_birth)
    && str(body.email, 320)
    && Number.isInteger(body.dan)
    && typeof body.kukkiwon === 'boolean' && typeof body.acknowledged === 'boolean'
    && str(body.waiver_version, 40)
    && str(body.signature, 70000)
    // preview has no Turnstile, so the page may send no token; a token must be text
    && (body.turnstile_token === undefined || body.turnstile_token === null || typeof body.turnstile_token === 'string');
}

// POST /api/black-belt/<code> — the Function's checks in its order, then the database's.
export async function register(code, body) {
  installHelpers();
  await wait(fakeDelayMs);
  if (!switchedOn()) return { status: 'not_open' }; // the kill switch
  const clean = typeof code === 'string' ? code.toLowerCase() : '';
  if (!codeIsValid(clean)) return { status: 'not_found' };
  let text;
  try {
    text = JSON.stringify(body);
  } catch {
    return { status: 'bad_request' };
  }
  if (typeof text !== 'string' || text.length > MAX_BODY_CHARACTERS) return { status: 'bad_request' }; // size
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { status: 'bad_request' }; // JSON object
  if (body.website !== undefined && body.website !== '') return { status: 'bad_request' }; // honeypot
  if (!Number.isFinite(body.started_at) || !Number.isFinite(body.sent_at)) return { status: 'bad_request' };
  if (body.sent_at - body.started_at < MIN_FILL_MS) return { status: 'bad_request' }; // too fast
  if (!typesOk(body)) return { status: 'bad_request' };
  if (!isIsoDate(body.date_of_birth)) return { status: 'unavailable' }; // the database refuses the date type
  if (readStorage(VERIFY_KEY) === '1') {
    removeStorage(VERIFY_KEY); // the human check fails once
    return { status: 'verify_failed' };
  }
  const result = store().publicRegister(
    {
      code: clean, clientKey: CLIENT_KEY, submissionId: body.submission_id, first: body.first_name, last: body.last_name,
      dateOfBirth: body.date_of_birth, email: body.email, dan: body.dan, cyclePlanId: body.cycle_plan_id,
      kukkiwon: body.kukkiwon, acknowledged: body.acknowledged, waiverVersion: body.waiver_version,
      signerName: body.signer_name, signature: body.signature,
    },
    { forceRateLimited: readStorage(RATE_KEY) === '1' },
  );
  // Only the fields the Function passes on (§4.6).
  if (result.status === 'ok') return Object.fromEntries(OK_KEYS.map((key) => [key, result[key] ?? null]));
  if (result.status === 'closed') return { status: 'closed', closed_on: result.closed_on ?? null };
  const known = ['not_open', 'finished', 'not_found', 'invalid', 'waiver_changed', 'rate_limited'];
  return { status: known.includes(result.status) ? result.status : 'unavailable' };
}

// The console helpers for the Black Belt family page (mockClient.js adds them to the staff
// preview too). Each returns a short sentence saying what happened.
export function blackBeltPublicHelpers() {
  return {
    setBlackBeltRegistration(on) {
      writeStorage(SWITCH_KEY, on ? 'on' : 'off');
      return on
        ? 'Black Belt registration is ON: the family form works (reload it).'
        : 'Black Belt registration is OFF (the kill switch): every Black Belt link shows "not open yet" (reload it).';
    },
    forceVerifyFailed(on = true) {
      if (on) writeStorage(VERIFY_KEY, '1');
      else removeStorage(VERIFY_KEY);
      return on ? 'The next Send on a family form will fail the human check (verify_failed).' : 'The human check works again.';
    },
    forceRateLimited(on = true) {
      if (on) writeStorage(RATE_KEY, '1');
      else removeStorage(RATE_KEY);
      return on ? 'Every Send on a family form now answers "too many tries" (rate_limited) until forceRateLimited(false).' : 'The rate limit is back to normal (20 tries per hour).';
    },
    setToday(date) {
      if (date === null || date === undefined || date === '') {
        removeStorage(PREVIEW_TODAY_KEY);
        return `Back to the real date (${todayInSchoolTime(new Date())}). Reload the page to see it.`;
      }
      if (!isIsoDate(date)) return "Use a date like setToday('2027-02-15'), or setToday(null) for the real date.";
      writeStorage(PREVIEW_TODAY_KEY, date);
      return `Preview now pretends today is ${date} (school time) — on the staff pages and the family form. Reload to see it.`;
    },
  };
}

// On the family page there is no mockClient, so the first getCycle / register call adds the
// helpers to the console object. (Done on first use, not when the file loads: a file that does
// something just by being loaded can't be left out of the real build.)
let helpersInstalled = false;
function installHelpers() {
  if (helpersInstalled || typeof window === 'undefined') return;
  helpersInstalled = true;
  window.__tkdPreview = { ...blackBeltPublicHelpers(), ...(window.__tkdPreview ?? {}) };
}
