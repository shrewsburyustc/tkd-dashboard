// publicApi.preview.js — PREVIEW MODE ONLY: a stand-in for the public registration Function.
// Why it exists: in `npm run dev:preview-mode` there is no Cloudflare Function and no database on
// this PC, so the family page (src/register/) calls this file instead of fetch('/api/register/…')
// (contract 0005 §4.5). It answers with exactly the JSON the real Function sends (§4.2) and keeps
// its data in the SAME browser storage as the staff preview ('tkd.preview.testing'), so a family
// registration made here shows up on the staff roster, and closing registration there shows the
// "closed" page here.
//
// The page imports it only behind `import.meta.env.MODE === 'preview'`, so the real build never
// contains it. (Nothing here is safe for production: there is no human check at all.)
//
//   getEvent(code)        → { status:'ok', state, closed_on, event, classes, turnstile_site_key }
//                           or { status:'not_found' } / { status:'not_open' } (switched off)
//   register(code, body)  → { status:'ok', reference, … } or a refusal
//     body = what the page POSTs: { submission_id, first_name, last_name, event_rank_id, paying_by,
//       stripes, signature, ack_version, website (honeypot), started_at, sent_at, turnstile_token }
//
// Console helpers (also on the staff preview's window.__tkdPreview):
//   __tkdPreview.setPublicRegistration(false)  the kill switch: every code answers "not open"
//   __tkdPreview.forceVerifyFailed(true)       the NEXT Send answers "verify_failed" (F6 message)
//   __tkdPreview.forceRateLimited(true)        every Send answers "rate_limited" until set false
//   __tkdPreview.forceLoadRateLimited(true)    every page load answers "rate_limited" until set false
//   __tkdPreview.setToday('2026-11-20')        pretend it's another day (null = the real date)
import { readStorage, writeStorage, removeStorage } from '../storage.js';
import { createTestingBackend } from '../mockTesting.js';
import { createEventsBackend } from '../mockTestingEvents.js';
import { todayInSchoolTime, isIsoDate, PREVIEW_TODAY_KEY } from './eventRules.js';

const TESTING_KEY = 'tkd.preview.testing'; // the same store the staff preview uses (mockClient.js)
const SWITCH_KEY = 'tkd.preview.publicRegistration'; // 'off' = kill switch on (default: on)
const VERIFY_KEY = 'tkd.preview.forceVerifyFailed'; // '1' = the next Send fails the human check
const RATE_KEY = 'tkd.preview.forceRateLimited'; // '1' = every Send is "too many tries"
const LOAD_RATE_KEY = 'tkd.preview.forceLoadRateLimited'; // '1' = every page load is "too many tries"
const CLIENT_KEY = 'preview-browser'; // stands in for the Function's daily HMAC of the IP
const MIN_FILL_MS = 4000; // the Function's "too fast" rule
const MAX_BODY_CHARACTERS = 100 * 1024; // the Function's 100 KB body limit
const CODE = /^[a-z0-9]{4,32}$/; // anything else can't be a code → not_found without a lookup
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
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, hex);
}

// The preview database (the same code the staff preview uses), on this browser's storage.
// Made on first use, so just importing this file never touches storage.
let backend = null;
function events() {
  if (backend) return backend;
  const loadStore = () => {
    try {
      return JSON.parse(readStorage(TESTING_KEY));
    } catch {
      return null; // damaged → default data
    }
  };
  const saveStore = (store) => writeStorage(TESTING_KEY, JSON.stringify(store));
  const testing = createTestingBackend({ loadStore, saveStore, now: () => Date.now(), newId: newUuid });
  backend = createEventsBackend({ readBase: () => testing.snapshot(), saveStore, now: () => Date.now(), today: previewToday, newId: newUuid });
  return backend;
}

const switchedOn = () => readStorage(SWITCH_KEY) !== 'off';

// GET /api/register/<code>
export async function getEvent(code) {
  installHelpers();
  await wait(fakeDelayMs);
  if (!switchedOn()) return { status: 'not_open' };
  const clean = typeof code === 'string' ? code.toLowerCase() : '';
  if (!CODE.test(clean)) return { status: 'not_found' };
  // The Function's rate limit comes after the off switch and the code format check, before the
  // database (functions/_lib/register.js).
  if (readStorage(LOAD_RATE_KEY) === '1') return { status: 'rate_limited' };
  const result = events().publicEvent(clean);
  if (result.status !== 'ok') return { status: 'not_found' };
  return {
    status: 'ok', state: result.state, closed_on: result.closed_on ?? null, event: result.event, classes: result.classes,
    turnstile_site_key: null, // no human check in preview
  };
}

// POST /api/register/<code> — the Function's checks in its order, then the database's.
export async function register(code, body) {
  installHelpers();
  await wait(fakeDelayMs);
  if (!switchedOn()) return { status: 'not_open' }; // 1. kill switch
  let text;
  try {
    text = JSON.stringify(body);
  } catch {
    return { status: 'bad_request' };
  }
  if (typeof text !== 'string' || text.length > MAX_BODY_CHARACTERS) return { status: 'bad_request' }; // 4. size
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { status: 'bad_request' };
  if (body.website !== undefined && body.website !== '') return { status: 'bad_request' }; // 5. honeypot
  if (!Number.isFinite(body.started_at) || !Number.isFinite(body.sent_at)) return { status: 'bad_request' };
  if (body.sent_at - body.started_at < MIN_FILL_MS) return { status: 'bad_request' }; // 6. too fast
  // The fields' types (the database checks the real rules).
  const isText = (v) => typeof v === 'string';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(String(body.submission_id ?? '')) || !uuid.test(String(body.event_rank_id ?? ''))) return { status: 'bad_request' };
  if (![body.first_name, body.last_name, body.paying_by, body.signature, body.ack_version].every(isText) || typeof body.stripes !== 'boolean') {
    return { status: 'bad_request' };
  }
  const clean = typeof code === 'string' ? code.toLowerCase() : '';
  if (!CODE.test(clean)) return { status: 'not_found' };
  if (readStorage(VERIFY_KEY) === '1') {
    removeStorage(VERIFY_KEY); // 7. the human check fails once
    return { status: 'verify_failed' };
  }
  const result = events().publicRegister(
    {
      code: clean, clientKey: CLIENT_KEY, submissionId: body.submission_id, eventRankId: body.event_rank_id,
      first: body.first_name, last: body.last_name, payingBy: body.paying_by, stripes: body.stripes,
      signature: body.signature, ackVersion: body.ack_version,
    },
    { forceRateLimited: readStorage(RATE_KEY) === '1' },
  );
  // Only the fields the Function passes on (§1.8).
  if (result.status === 'ok') {
    const keys = ['status', 'reference', 'first_name', 'last_name', 'testing_for', 'class_name', 'start_time', 'end_time',
      'early_cents', 'day_cents', 'paying_by', 'testing_date', 'school_name', 'address'];
    return Object.fromEntries(keys.map((key) => [key, result[key] ?? null]));
  }
  if (result.status === 'closed') return { status: 'closed', closed_on: result.closed_on ?? null };
  return { status: result.status };
}

// The console helpers for the public page (mockClient.js adds them to the staff preview too).
// Each returns a short sentence saying what happened.
export function publicPreviewHelpers() {
  return {
    setPublicRegistration(on) {
      writeStorage(SWITCH_KEY, on ? 'on' : 'off');
      return on
        ? 'Public registration is ON: the family page works (reload it).'
        : 'Public registration is OFF (the kill switch): every registration link shows "not open yet" (reload it).';
    },
    forceVerifyFailed(on = true) {
      if (on) writeStorage(VERIFY_KEY, '1');
      else removeStorage(VERIFY_KEY);
      return on ? 'The next Send on the family page will fail the human check (verify_failed).' : 'The human check works again.';
    },
    forceRateLimited(on = true) {
      if (on) writeStorage(RATE_KEY, '1');
      else removeStorage(RATE_KEY);
      return on ? 'Every Send on the family page now answers "too many tries" (rate_limited) until forceRateLimited(false).' : 'The rate limit is back to normal (20 tries per hour).';
    },
    forceLoadRateLimited(on = true) {
      if (on) writeStorage(LOAD_RATE_KEY, '1');
      else removeStorage(LOAD_RATE_KEY);
      return on ? 'Every page load on the family page now answers "too many tries" (rate_limited) until forceLoadRateLimited(false). Reload to see it.' : 'Page loads work normally again (reload).';
    },
    setToday(date) {
      if (date === null || date === undefined || date === '') {
        removeStorage(PREVIEW_TODAY_KEY);
        return `Back to the real date (${todayInSchoolTime(new Date())}). Reload the page to see it.`;
      }
      if (!isIsoDate(date)) return "Use a date like setToday('2026-11-20'), or setToday(null) for the real date.";
      writeStorage(PREVIEW_TODAY_KEY, date);
      return `Preview now pretends today is ${date} (school time) — on the staff pages and the family page. Reload to see it.`;
    },
  };
}

// On the family page there is no mockClient, so the first getEvent / register call adds the
// helpers to the console object. (Done on first use, not when the file loads: a file that does
// something just by being loaded can't be left out of the real build.)
let helpersInstalled = false;
function installHelpers() {
  if (helpersInstalled || typeof window === 'undefined') return;
  helpersInstalled = true;
  window.__tkdPreview = { ...publicPreviewHelpers(), ...(window.__tkdPreview ?? {}) };
}
