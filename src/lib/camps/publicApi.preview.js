// publicApi.preview.js — PREVIEW MODE ONLY: a stand-in for the public camp sign-up Function.
// Why it exists: in `npm run dev:preview-mode` there is no Cloudflare Function and no database on
// this PC, so the family sign-up page (src/camp/) calls this file instead of fetch('/api/camp/…')
// (contract 0013 §4.7). It runs the Function's checks in the Function's order (§4.2, §4.3), then
// the preview database (mockCamps.js), and passes on only the fields the Function passes on
// (§4.6). It keeps its data in the SAME browser storage as the staff preview
// ('tkd.preview.camps'), so a sign-up made here shows up on the staff roster, and closing sign-up
// there shows the "closed" page here.
//
// The page imports it only behind `import.meta.env.MODE === 'preview'`, so the real build never
// contains it. (Nothing here is safe for production: there is no human check at all.)
//
//   getCamp(code)        → { status:'ok', state, opens_on, closed_on, price_kind_today, ack_version,
//                            waiver_version, camp, turnstile_site_key } or { status:'not_found' } /
//                            { status:'not_open' } (switched off)
//   signUp(code, body)   → { status:'ok', reference, paying_by, family_total_cents, children, camp }
//                          or a refusal (see §4.6). body = what the page POSTs (§4.3).
// Answers are in the database's snake_case — the page converts them with campRules.toCamel,
// exactly as it does with the real Function's answers.
//
// Console helpers (also on the staff preview's window.__tkdPreview):
//   __tkdPreview.resetCamps()                     back to the default camps (the approved mockups)
//   __tkdPreview.campWeek()                       pretend it's Wed, Apr 21, 2027 (April Vacation Camp
//                                                 week), reset the camps and reload — to see Check in
//   __tkdPreview.setCampsRegistration(false)      the camp form's kill switch ("not open" everywhere)
//   __tkdPreview.simulateFamilySignup(code?, { duplicateOf: 'Ava Thompson' }?)  a sign-up as if
//                                                 from a phone (watch the 15-second refresh)
//   __tkdPreview.forcePriceChanged(true)          the next camp Send answers price_changed (+$5)
//   __tkdPreview.forceCampChanged(true)           the next camp Send answers camp_changed
//   __tkdPreview.setToday / forceVerifyFailed / forceRateLimited   shared with Color Belt's form
import { readStorage, writeStorage, removeStorage } from '../storage.js';
import { createCampsBackend } from '../mockCamps.js';
import { todayInSchoolTime, isIsoDate, PREVIEW_TODAY_KEY } from '../testing/eventRules.js';

const CAMPS_KEY = 'tkd.preview.camps'; // the camps store (the staff preview uses the same key)
const TESTING_KEY = 'tkd.preview.testing'; // Color Belt's store: the schools' names and addresses
const SWITCH_KEY = 'tkd.preview.campsRegistration'; // 'off' = kill switch on (default: on)
const VERIFY_KEY = 'tkd.preview.forceVerifyFailed'; // '1' = the next Send fails the human check (shared)
const RATE_KEY = 'tkd.preview.forceRateLimited'; // '1' = every Send is "too many tries" (shared)
const PRICE_KEY = 'tkd.preview.campForcePriceChanged'; // '1' = the next camp Send gets price_changed
const CHANGED_KEY = 'tkd.preview.campForceCampChanged'; // '1' = the next camp Send gets camp_changed
const CLIENT_KEY = 'preview-browser'; // stands in for the Function's HMAC of the connection
const MIN_FILL_MS = 4000; // the Function's "too fast" rule
const MAX_BODY_CHARACTERS = 100 * 1024; // the Function's 100 KB body limit
const CODE = /^[a-hjkmnp-z2-9]{8}$/; // anything else can't be a code → not_found without a lookup
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APRIL_CAMP_WEEK = '2027-04-21'; // Wed of April Vacation Camp (campWeek)
let fakeDelayMs = 300; // pretend the network takes a moment, so "Sending…" is visible

const wait = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

// The pretend network time in milliseconds (checks.mjs sets 0).
export function setFakeDelay(ms) {
  fakeDelayMs = Math.max(0, Number(ms) || 0);
}

// "Today" at the school, or the pretend date set with setToday / campWeek.
export function campPreviewToday() {
  const pretend = readStorage(PREVIEW_TODAY_KEY);
  return isIsoDate(pretend) ? pretend : todayInSchoolTime(new Date());
}

// A random id in the real uuid format.
function newUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, hex);
}

const readJson = (key) => {
  try {
    return JSON.parse(readStorage(key));
  } catch {
    return null; // damaged → default data
  }
};

// The preview camps database on this browser's storage. Made on first use, so just importing
// this file never touches storage.
let backend = null;
function camps() {
  if (backend) return backend;
  backend = createCampsBackend({
    loadStore: () => readJson(CAMPS_KEY),
    saveStore: (store) => writeStorage(CAMPS_KEY, JSON.stringify(store)),
    now: () => Date.now(),
    today: campPreviewToday,
    newId: newUuid,
    locations: () => readJson(TESTING_KEY)?.locations ?? null,
  });
  return backend;
}

const switchedOn = () => readStorage(SWITCH_KEY) !== 'off';
const takeFlag = (key) => {
  const on = readStorage(key) === '1';
  if (on) removeStorage(key); // one-shot
  return on;
};

// GET /api/camp/<code>
export async function getCamp(code) {
  installHelpers();
  await wait(fakeDelayMs);
  if (!switchedOn()) return { status: 'not_open' }; // 1. kill switch (no opens_on)
  const clean = typeof code === 'string' ? code.toLowerCase() : '';
  if (!CODE.test(clean)) return { status: 'not_found' }; // 2. bad code: no database
  const result = camps().publicCamp(clean);
  if (result.status !== 'ok') return { status: 'not_found' };
  const keys = ['status', 'state', 'opens_on', 'closed_on', 'price_kind_today', 'ack_version', 'waiver_version', 'camp'];
  return { ...Object.fromEntries(keys.map((key) => [key, result[key] ?? null])), turnstile_site_key: null }; // no human check in preview
}

// ----- The Function's field limits (§4.3). true = the body may go to the database. -----

const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const onlyKeys = (obj, keys) => obj !== null && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).every((k) => keys.includes(k));
const uuidList = (v) => Array.isArray(v) && v.length <= 10 && v.every((x) => typeof x === 'string' && UUID.test(x)) && new Set(v.map((x) => x.toLowerCase())).size === v.length;
const BODY_KEYS = ['submission_id', 'children', 'parent', 'emergency', 'paying_by', 'acknowledged', 'signature', 'ack_version', 'waiver_version',
  'expected_total_cents', 'website', 'started_at', 'sent_at', 'turnstile_token'];
const CHILD_KEYS = ['first_name', 'last_name', 'age', 'member', 'day_ids', 'extras'];
const PERSON_KEYS = ['name', 'phone', 'relation'];
export function bodyWithinLimits(body) {
  if (!onlyKeys(body, BODY_KEYS)) return false;
  if (typeof body.submission_id !== 'string' || !UUID.test(body.submission_id)) return false;
  if (!Array.isArray(body.children) || body.children.length < 1 || body.children.length > 3) return false;
  for (const c of body.children) {
    if (!onlyKeys(c, CHILD_KEYS) || !isStr(c.first_name, 200) || !isStr(c.last_name, 200)) return false;
    if (!Number.isInteger(c.age) || c.age < 0 || c.age > 150 || typeof c.member !== 'boolean' || !uuidList(c.day_ids)) return false;
    if (!Array.isArray(c.extras) || c.extras.length > 10) return false;
    if (!c.extras.every((e) => onlyKeys(e, ['extra_id', 'day_ids']) && typeof e.extra_id === 'string' && UUID.test(e.extra_id) && uuidList(e.day_ids))) return false;
  }
  for (const person of [body.parent, body.emergency]) {
    if (!onlyKeys(person, PERSON_KEYS) || !isStr(person.name, 200) || !isStr(person.phone, 20) || !isStr(person.relation, 80)) return false;
  }
  if (!isStr(body.paying_by, 20) || typeof body.acknowledged !== 'boolean' || !isStr(body.signature, 70000)) return false;
  if (!isStr(body.ack_version, 40) || !isStr(body.waiver_version, 64)) return false;
  if (!Number.isInteger(body.expected_total_cents) || body.expected_total_cents < 0 || body.expected_total_cents > 600000) return false;
  if (!Number.isInteger(body.started_at) || !Number.isInteger(body.sent_at)) return false;
  if (body.turnstile_token !== undefined && body.turnstile_token !== null && !isStr(body.turnstile_token, 2048)) return false;
  if (body.website !== undefined && typeof body.website !== 'string') return false;
  return true;
}

// The fields the Function passes on for each status (§4.6). Anything else → 'unavailable'.
const ALLOWED = {
  ok: ['status', 'reference', 'paying_by', 'family_total_cents', 'children', 'camp'],
  not_open: ['status', 'opens_on'],
  closed: ['status', 'closed_on'],
  finished: ['status'],
  price_changed: ['status', 'new_total_cents', 'old_total_cents', 'camp'],
  camp_changed: ['status', 'camp'],
  verify_failed: ['status'],
  rate_limited: ['status'],
  not_found: ['status'],
  invalid: ['status'],
  bad_request: ['status'],
};
function reduce(answer) {
  const keys = ALLOWED[answer?.status];
  if (!keys) return { status: 'unavailable' };
  return Object.fromEntries(keys.filter((key) => key in answer).map((key) => [key, answer[key]]));
}

// POST /api/camp/<code> — the Function's checks in its order, then the database's.
export async function signUp(code, body) {
  installHelpers();
  await wait(fakeDelayMs);
  if (!switchedOn()) return { status: 'not_open' }; // 1. kill switch
  const clean = typeof code === 'string' ? code.toLowerCase() : '';
  if (!CODE.test(clean)) return { status: 'not_found' }; // 3a. bad code
  let text;
  try {
    text = JSON.stringify(body);
  } catch {
    return { status: 'bad_request' };
  }
  if (typeof text !== 'string' || text.length > MAX_BODY_CHARACTERS) return { status: 'bad_request' }; // 5. size
  if (!bodyWithinLimits(body)) return { status: 'bad_request' }; // 5a. field limits
  if (body.website !== undefined && body.website !== '') return { status: 'bad_request' }; // 6. honeypot
  if (body.sent_at - body.started_at < MIN_FILL_MS) return { status: 'bad_request' }; // 7. too fast
  if (takeFlag(VERIFY_KEY)) return { status: 'verify_failed' }; // 8. the human check fails once
  const result = camps().publicSignup(
    {
      code: clean, client_key: CLIENT_KEY, submission_id: body.submission_id, children: body.children,
      parent_name: body.parent.name, parent_phone: body.parent.phone, parent_relation: body.parent.relation,
      emergency_name: body.emergency.name, emergency_phone: body.emergency.phone, emergency_relation: body.emergency.relation,
      paying_by: body.paying_by, acknowledged: body.acknowledged, signature: body.signature, ack_version: body.ack_version,
      waiver_version: body.waiver_version, expected_total_cents: body.expected_total_cents,
    },
    { forceRateLimited: readStorage(RATE_KEY) === '1', forcePriceChanged: takeFlag(PRICE_KEY), forceCampChanged: takeFlag(CHANGED_KEY) },
  );
  return reduce(result); // 9. only the allowed fields
}

// ----- Console helpers (mockClient.js adds them to the staff preview too) -----
// Each returns a short sentence saying what happened.
export function publicCampHelpers() {
  const reload = () => {
    if (typeof window !== 'undefined' && window.location?.reload) setTimeout(() => window.location.reload(), 50);
  };
  return {
    resetCamps() {
      camps().reset();
      return 'Camps are back to the defaults from the approved mockups (5 camps, 4 templates). Reload to see them.';
    },
    campWeek() {
      writeStorage(PREVIEW_TODAY_KEY, APRIL_CAMP_WEEK);
      camps().reset(); // check-ins of the default data are made only up to "today"
      reload();
      return `Preview now pretends today is Wed, Apr 21, 2027 (April Vacation Camp week); the camps were reset so Mon–Wed check-ins show. Reloading… (setToday(null) for the real date)`;
    },
    setCampsRegistration(on) {
      writeStorage(SWITCH_KEY, on ? 'on' : 'off');
      return on
        ? 'Camp sign-up is ON: the family camp page works (reload it).'
        : 'Camp sign-up is OFF (the kill switch): every camp link shows "Sign-up hasn\'t opened yet" (reload it).';
    },
    simulateFamilySignup(code, options) {
      if (!switchedOn()) return 'Camp sign-up is switched off (setCampsRegistration(true) first).';
      const target = code ?? camps().firstOpenCode();
      if (!target) return 'No camp is open for sign-up today. Pass a code, or setToday() to a date in a sign-up window.';
      const answer = camps().simulateSignup(target, options ?? {});
      return answer.status === 'ok'
        ? `Signed up ${answer.children.map((c) => `${c.first_name} ${c.last_name}`).join(', ')} (${answer.reference}) on ${answer.camp.name}. The staff page shows it within 15 seconds.`
        : `The sign-up was refused: ${answer.status}.`;
    },
    forcePriceChanged(on = true) {
      if (on) writeStorage(PRICE_KEY, '1');
      else removeStorage(PRICE_KEY);
      return on ? 'The next camp Send raises that camp\'s prices by $5 first, so it answers price_changed.' : 'Camp Sends work normally again.';
    },
    forceCampChanged(on = true) {
      if (on) writeStorage(CHANGED_KEY, '1');
      else removeStorage(CHANGED_KEY);
      return on ? 'The next camp Send answers camp_changed ("This camp was updated…").' : 'Camp Sends work normally again.';
    },
  };
}

// The shared helpers the family camp page needs too (same storage keys as Color Belt's
// publicApi.preview.js, so either page's console can set them).
function sharedHelpers() {
  return {
    setToday(date) {
      if (date === null || date === undefined || date === '') {
        removeStorage(PREVIEW_TODAY_KEY);
        return `Back to the real date (${todayInSchoolTime(new Date())}). Reload the page to see it.`;
      }
      if (!isIsoDate(date)) return "Use a date like setToday('2026-11-20'), or setToday(null) for the real date.";
      writeStorage(PREVIEW_TODAY_KEY, date);
      return `Preview now pretends today is ${date} (school time). Reload to see it.`;
    },
    forceVerifyFailed(on = true) {
      if (on) writeStorage(VERIFY_KEY, '1');
      else removeStorage(VERIFY_KEY);
      return on ? 'The next Send will fail the human check (verify_failed).' : 'The human check works again.';
    },
    forceRateLimited(on = true) {
      if (on) writeStorage(RATE_KEY, '1');
      else removeStorage(RATE_KEY);
      return on ? 'Every Send now answers "too many tries" (rate_limited) until forceRateLimited(false).' : 'The rate limit is back to normal.';
    },
  };
}

// On the family page there is no mockClient, so the first getCamp / signUp call adds the helpers
// to the console object. (Done on first use, not when the file loads: a file that does something
// just by being loaded can't be left out of the real build.)
let helpersInstalled = false;
function installHelpers() {
  if (helpersInstalled || typeof window === 'undefined') return;
  helpersInstalled = true;
  window.__tkdPreview = { ...sharedHelpers(), ...publicCampHelpers(), ...(window.__tkdPreview ?? {}) };
}
