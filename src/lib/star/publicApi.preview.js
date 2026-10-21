// publicApi.preview.js — PREVIEW MODE ONLY: a stand-in for Star testing's public registration
// Function (functions/api/star/[code].js).
// Why it exists: in `npm run dev:preview-mode` there is no Cloudflare Function and no database on
// this PC, so the Star family page (src/star-register/) calls this file instead of
// fetch('/api/star/…'). It answers with exactly the JSON the real Function sends (contract 0006
// §8.2–§8.4) and keeps its data in the SAME browser storage as the staff preview's Star testing
// ('tkd.preview.star', through mockStarCandidates.js), so a family registration made here shows up
// on the dashboard's Candidates tab, and closing registration there shows the "closed" page here.
// Color Belt's stand-in (src/lib/testing/publicApi.preview.js) is a separate file with its own
// helpers; the two never share a switch.
//
// The page imports it only behind `import.meta.env.MODE === 'preview'`, so the real build never
// contains it. (Nothing here is safe for production: there is no human check at all.)
//
//   getEvent(code)        → { status:'ok', state, closed_on, school, event, dans, turnstile_site_key }
//                           or { status:'not_found' | 'not_open' (switched off) | 'rate_limited' | 'unavailable' }
//   register(code, body)  → { status:'ok', reference, … } or a refusal
//     body = what the page POSTs: { submission_id, first_name, last_name, date_of_birth, email, dan,
//       stars_from, paying_by, acknowledged, signature, ack_version, website (honeypot), started_at,
//       sent_at, turnstile_token }
//
// Console helpers (on window.__tkdPreview, on the family page AND on the staff preview). Their names
// all contain "Star", so they never clash with Color Belt's (setPublicRegistration, …):
//   setStarPublicRegistration(false)  the kill switch: every Star link shows "not open yet"
//   forceStarVerifyFailed(true)       the NEXT Send fails the human check ("We couldn't check this browser")
//   forceStarRateLimited(true)        every Send answers "too many tries" until set false
//   forceStarPageRateLimited(true)    opening the page answers "too many tries" until set false
//   failNextStarLoad()                the next page load fails ("This page didn't load")
//   failNextStarSend()                the next Send fails like a dropped connection ("wasn't sent")
//   setStarPublicDelay(3000)          pretend the network takes 3 s (to see "Loading…" / "Sending…")
//   setToday('2026-11-20')            pretend it's another day (shared with the staff preview)
import { readStorage, writeStorage, removeStorage } from '../storage.js';
import { createStarBackend, STAR_STORE_KEY } from '../mockStarTesting.js';
import { createStarEventsBackend } from '../mockStarEvents.js';
import { createStarCandidatesBackend, defaultStarCandidatesData, starCandidatesSeedIsCurrent } from '../mockStarCandidates.js';
import { todayInSchoolTime, isIsoDate, PREVIEW_TODAY_KEY } from '../testing/eventRules.js';
import { STAR_CODE_PATTERN } from './starEventRules.js';

const TESTING_KEY = 'tkd.preview.testing'; // Color Belt's store: Settings → Schools (the addresses) lives there
const SWITCH_KEY = 'tkd.preview.starPublicRegistration'; // 'off' = kill switch on (default: on)
const VERIFY_KEY = 'tkd.preview.starForceVerifyFailed'; // '1' = the next Send fails the human check
const RATE_KEY = 'tkd.preview.starForceRateLimited'; // '1' = every Send is "too many tries"
const PAGE_RATE_KEY = 'tkd.preview.starForcePageRateLimited'; // '1' = every page load is "too many tries"
const LOAD_FAIL_KEY = 'tkd.preview.starFailNextLoad'; // '1' = the next page load fails
const SEND_FAIL_KEY = 'tkd.preview.starFailNextSend'; // '1' = the next Send fails (network)
const DELAY_KEY = 'tkd.preview.starPublicDelay'; // pretend network time in ms
const CLIENT_KEY = 'preview-browser'; // stands in for the Function's daily HMAC of the IP
const MIN_FILL_MS = 4000; // the Function's "too fast" rule
const MAX_BODY_CHARACTERS = 100 * 1024; // the Function's 100 KB body limit
const DEFAULT_DELAY_MS = 300; // so "Sending…" is visible
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const wait = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());
function delayMs() {
  const saved = Number(readStorage(DELAY_KEY));
  return readStorage(DELAY_KEY) !== null && Number.isFinite(saved) && saved >= 0 ? saved : DEFAULT_DELAY_MS;
}
// Reads a one-time flag and clears it.
function takeFlag(key) {
  if (readStorage(key) !== '1') return false;
  removeStorage(key);
  return true;
}

// "Today" at the school, or the pretend date set with setToday.
function previewToday() {
  const pretend = readStorage(PREVIEW_TODAY_KEY);
  return isIsoDate(pretend) ? pretend : todayInSchoolTime(new Date());
}

function newUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, hex);
}

// The Star preview database — the same three files, in the same order, as mockClient.js builds
// them, on the same storage. Made on first use, so just importing this file touches nothing.
let backend = null;
function candidates() {
  if (backend) return backend;
  const saveStore = (store) => writeStorage(STAR_STORE_KEY, JSON.stringify(store));
  const star = createStarBackend({ loadStore: () => JSON.parse(readStorage(STAR_STORE_KEY)), saveStore, now: () => Date.now(), newId: newUuid });
  const events = createStarEventsBackend({
    readBase: () => star.snapshot(), saveStore, now: () => Date.now(), today: previewToday, newId: newUuid,
    seed: defaultStarCandidatesData, seedIsCurrent: starCandidatesSeedIsCurrent,
  });
  backend = createStarCandidatesBackend({ readBase: () => events.snapshot(), saveStore, now: () => Date.now(), today: previewToday, newId: newUuid });
  return backend;
}

// A school's street address from Settings → Schools (Color Belt's preview store), as
// testing_location_address answers it: { street, city, state, zip } or null.
function schoolAddress(code) {
  try {
    const store = JSON.parse(readStorage(TESTING_KEY));
    const school = Array.isArray(store?.locations) ? store.locations.find((l) => l.code === code) : null;
    return school?.address_street
      ? { street: school.address_street, city: school.address_city, state: school.address_state, zip: school.address_zip }
      : null;
  } catch {
    return null; // nothing saved yet, or damaged: no address (the page then shows the school name only)
  }
}

const switchedOn = () => readStorage(SWITCH_KEY) !== 'off';
const cleanCode = (code) => (typeof code === 'string' ? code.trim().toLowerCase() : '');

// GET /api/star/<code> — the Function's order: kill switch, code shape, page-load limit, database.
export async function getEvent(code) {
  installHelpers();
  await wait(delayMs());
  if (!switchedOn()) return { status: 'not_open' };
  const clean = cleanCode(code);
  if (!STAR_CODE_PATTERN.test(clean)) return { status: 'not_found' };
  if (readStorage(PAGE_RATE_KEY) === '1') return { status: 'rate_limited' };
  if (takeFlag(LOAD_FAIL_KEY)) return { status: 'unavailable' };
  const result = candidates().publicEvent(clean, { schoolAddress });
  if (result.status !== 'ok') return { status: 'not_found' };
  return { ...result, turnstile_site_key: null }; // no human check in preview
}

// POST /api/star/<code> — the Function's checks in its order, then the database's.
export async function register(code, body) {
  installHelpers();
  await wait(delayMs());
  if (takeFlag(SEND_FAIL_KEY)) return { status: 'network' }; // as if the connection dropped
  if (!switchedOn()) return { status: 'not_open' }; // 1. kill switch
  const clean = cleanCode(code);
  if (!STAR_CODE_PATTERN.test(clean)) return { status: 'not_found' }; // 3a. a code that can't exist
  if (readStorage(RATE_KEY) === '1') return { status: 'rate_limited' }; // 4. (stands in for both limits)
  let text;
  try {
    text = JSON.stringify(body);
  } catch {
    return { status: 'bad_request' };
  }
  if (typeof text !== 'string' || text.length > MAX_BODY_CHARACTERS) return { status: 'bad_request' }; // 5. size
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { status: 'bad_request' };
  if (body.website !== undefined && body.website !== '') return { status: 'bad_request' }; // 6. honeypot
  if (!Number.isFinite(body.started_at) || !Number.isFinite(body.sent_at)) return { status: 'bad_request' };
  if (body.sent_at - body.started_at < MIN_FILL_MS) return { status: 'bad_request' }; // 7. too fast
  // The fields' types and rough sizes (the database checks the real rules).
  const isText = (v, max) => typeof v === 'string' && v.length <= max;
  const small = (v) => Number.isInteger(v) && v >= 0 && v <= 99;
  const typesOk = UUID.test(String(body.submission_id ?? '')) && isText(body.first_name, 200) && isText(body.last_name, 200)
    && typeof body.date_of_birth === 'string' && ISO_DATE.test(body.date_of_birth) && isIsoDate(body.date_of_birth)
    && isText(body.email, 320) && small(body.dan) && small(body.stars_from) && isText(body.paying_by, 20)
    && typeof body.acknowledged === 'boolean' && isText(body.signature, 70000) && isText(body.ack_version, 40);
  if (!typesOk) return { status: 'bad_request' };
  if (takeFlag(VERIFY_KEY)) return { status: 'verify_failed' }; // 8. the human check fails once
  const result = candidates().publicRegister(
    {
      code: clean, clientKey: CLIENT_KEY, submissionId: body.submission_id, first: body.first_name, last: body.last_name,
      dateOfBirth: body.date_of_birth, email: body.email, dan: body.dan, starsFrom: body.stars_from, payingBy: body.paying_by,
      acknowledged: body.acknowledged, signature: body.signature, ackVersion: body.ack_version,
    },
    { schoolAddress },
  );
  if (result.status === 'ok') return result;
  if (result.status === 'closed') return { status: 'closed', closed_on: result.closed_on ?? null };
  if (['not_found', 'not_open', 'finished', 'rate_limited', 'invalid'].includes(result.status)) return { status: result.status };
  return { status: 'unavailable' };
}

// The console helpers. Each returns a short sentence saying what happened.
export function starPublicPreviewHelpers() {
  const flag = (key, on) => (on ? writeStorage(key, '1') : removeStorage(key));
  return {
    setStarPublicRegistration(on) {
      writeStorage(SWITCH_KEY, on ? 'on' : 'off');
      return on
        ? 'Star public registration is ON: the Star family page works (reload it).'
        : 'Star public registration is OFF (the kill switch): every Star link shows "not open yet" (reload it).';
    },
    forceStarVerifyFailed(on = true) {
      flag(VERIFY_KEY, on);
      return on ? 'The next Send on the Star family page fails the human check (verify_failed).' : 'The Star human check works again.';
    },
    forceStarRateLimited(on = true) {
      flag(RATE_KEY, on);
      return on ? 'Every Send on the Star family page now answers "too many tries" until forceStarRateLimited(false).' : 'Star Sends are back to normal.';
    },
    forceStarPageRateLimited(on = true) {
      flag(PAGE_RATE_KEY, on);
      return on ? 'Opening the Star family page now answers "too many tries" until forceStarPageRateLimited(false) (reload it).' : 'The Star family page opens normally again.';
    },
    failNextStarLoad() {
      flag(LOAD_FAIL_KEY, true);
      return 'The next Star family page load fails ("This page didn\'t load"). Reload it.';
    },
    failNextStarSend() {
      flag(SEND_FAIL_KEY, true);
      return 'The next Send on the Star family page fails like a dropped connection.';
    },
    setStarPublicDelay(ms = DEFAULT_DELAY_MS) {
      const value = Math.max(0, Number(ms) || 0);
      writeStorage(DELAY_KEY, String(value));
      return `The Star family page now waits ${value} ms for each answer.`;
    },
  };
}

// setToday on the family page (the staff preview has its own, which writes the same setting).
function setToday(date) {
  if (date === null || date === undefined || date === '') {
    removeStorage(PREVIEW_TODAY_KEY);
    return 'Back to the real date. Reload the page to see it.';
  }
  if (!isIsoDate(date)) return "Use a date like setToday('2026-11-20'), or setToday(null) for the real date.";
  writeStorage(PREVIEW_TODAY_KEY, date);
  return `Preview now pretends today is ${date} (school time). Reload to see it.`;
}

// On the family page there is no mockClient, so the first getEvent / register call adds the
// helpers to the console object (on first use, not on load: a file that does something just by
// being loaded can't be left out of the real build).
let helpersInstalled = false;
function installHelpers() {
  if (helpersInstalled || typeof window === 'undefined') return;
  helpersInstalled = true;
  window.__tkdPreview = { setToday, ...starPublicPreviewHelpers(), ...(window.__tkdPreview ?? {}) };
}
