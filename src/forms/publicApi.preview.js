// publicApi.preview.js — PREVIEW MODE ONLY: a stand-in for the public forms Function.
// Why it exists: in `npm run dev:preview-mode` there is no Cloudflare Function and no database on
// this PC, so the public page (src/forms/) calls this file instead of fetch('/api/forms/…')
// (build plan §3). It answers with the same JSON as functions/_lib/forms/forms.js and keeps its
// data in the SAME browser storage as the staff preview ('tkd.preview.forms', plus the fake
// Schedule, Calendar and classes it needs), so a family sign-up made here shows up in the staff
// preview's Prospects and Calendar, and closing a form there shows "This form is closed" here.
// Open the page on the same address (port) as the staff preview — each port has its own storage.
//
// The page imports it only behind `import.meta.env.MODE === 'preview'`, so the real build never
// contains it (src/forms/checks.mjs checks dist/). Nothing here is safe for production: there is
// no human check at all.
//
//   getForm(slug)        → { status:'ok', form_name, fields, published_version, school_name,
//                            school_phone, thank_you, add_to_calendar, times, turnstile_site_key }
//                          | { status:'closed', school_name, school_phone } | { status:'not_found' }
//                          | { status:'not_open' } (switched off)
//   submit(slug, body)   → { status:'ok', repeat, bookings } or a refusal (the Function's checks in
//                          its order, then the database's)
//
// Console helpers (on window.__tkdPreview, also in the staff preview):
//   __tkdPreview.setPublicForms(false)    the kill switch: every form answers "not open"
//   __tkdPreview.forceTimeTaken()         the NEXT Submit answers "time taken" (with fresh times)
//   __tkdPreview.forceRateLimited(true)   every Submit answers "too many tries" until set false
//   __tkdPreview.forceFormChanged()       the NEXT Submit answers "form changed" (the page reloads it)
import { readStorage, writeStorage, removeStorage } from '../lib/storage.js';
import { createTestingBackend } from '../lib/mockTesting.js';
import { createScheduleBackend } from '../lib/mockSchedule.js';
import { createCalendarBackend } from '../lib/mockCalendar.js';
import { createFormsBackend } from '../lib/mockForms.js';

// The staff preview's stores (the same keys as src/lib/mockClient.js).
const TESTING_KEY = 'tkd.preview.testing';
const SCHEDULE_KEY = 'tkd.preview.schedule';
const CALENDAR_KEY = 'tkd.preview.calendar';
const FORMS_KEY = 'tkd.preview.forms';
// This page's own switches.
const SWITCH_KEY = 'tkd.preview.publicForms'; // 'off' = kill switch on (default: on)
const TIME_TAKEN_KEY = 'tkd.preview.forms.forceTimeTaken'; // '1' = the next Submit is "time taken"
const RATE_KEY = 'tkd.preview.forms.forceRateLimited'; // '1' = every Submit is "too many tries"
const CHANGED_KEY = 'tkd.preview.forms.forceFormChanged'; // '1' = the next Submit is "form changed"
const TRIES_KEY = 'tkd.preview.forms.tries'; // the times of this browser's Submits (the 20-an-hour rule)
const MIN_FILL_MS = 4000; // the Function's "too fast" rule
const MAX_BODY_CHARACTERS = 100 * 1024; // the Function's 100 KB body limit
const TRIES_PER_HOUR = 20; // the database's limit per connection
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let fakeDelayMs = 300; // pretend the network takes a moment, so "Sending…" is visible

const wait = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());
const schoolToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const newUuid = () => window.crypto.randomUUID();
const json = (key) => {
  try {
    return JSON.parse(readStorage(key));
  } catch {
    return null; // damaged → default data
  }
};

// The pretend network time in milliseconds.
export function setFakeDelay(ms) {
  fakeDelayMs = Math.max(0, Number(ms) || 0);
}

// The preview database, built exactly like mockClient.js builds it (made on first use, so just
// importing this file never touches storage).
let forms = null;
function backend() {
  if (forms) return forms;
  const store = (key) => ({ loadStore: () => json(key), saveStore: (s) => writeStorage(key, JSON.stringify(s)) });
  const testing = createTestingBackend({ ...store(TESTING_KEY), now: () => Date.now(), newId: newUuid });
  const classes = () => testing.snapshot().classes.map((c) => ({ id: c.id, location_code: c.location_code, name: c.name, position: c.position }));
  const schedule = createScheduleBackend({ ...store(SCHEDULE_KEY), now: () => Date.now(), newId: newUuid, getClasses: classes, today: schoolToday });
  const calendar = createCalendarBackend({ ...store(CALENDAR_KEY), now: () => Date.now(), newId: newUuid, getSchedule: () => schedule.snapshot(), getClasses: classes, today: schoolToday });
  forms = createFormsBackend({
    ...store(FORMS_KEY), now: () => Date.now(), newId: newUuid,
    getSchedule: () => schedule.snapshot(), getCalendar: () => calendar.snapshot(), getClasses: classes, today: schoolToday,
    // the phone saved in Settings → Schools (same preview storage as the dashboard)
    getSchoolPhone: (code) => json(TESTING_KEY)?.locations?.find?.((l) => l.code === code)?.phone ?? null,
  });
  return forms;
}

const switchedOn = () => readStorage(SWITCH_KEY) !== 'off';
const cleanSlug = (slug) => {
  const s = typeof slug === 'string' ? slug.toLowerCase() : '';
  return SLUG.test(s) ? s : null;
};

// GET /api/forms/<slug>
export async function getForm(slug) {
  installHelpers();
  await wait(fakeDelayMs);
  if (!switchedOn()) return { status: 'not_open' };
  const clean = cleanSlug(slug);
  if (!clean) return { status: 'not_found' };
  const result = backend().publicGet(clean);
  if (result.status === 'ok') return { ...result, add_to_calendar: result.add_to_calendar === true, turnstile_site_key: null }; // no human check in preview
  if (result.status === 'closed') return { status: 'closed', school_name: result.school_name, school_phone: result.school_phone };
  return { status: 'not_found' };
}

// The database's 20-an-hour rule for this browser (every Submit counts, as in the SQL).
function countTry() {
  const hourAgo = Date.now() - 3600000;
  const tries = (Array.isArray(json(TRIES_KEY)) ? json(TRIES_KEY) : []).filter((t) => t > hourAgo);
  const over = tries.length >= TRIES_PER_HOUR;
  tries.push(Date.now());
  writeStorage(TRIES_KEY, JSON.stringify(tries.slice(-50)));
  return over;
}

// POST /api/forms/<slug> — the Function's checks in its order, then the database's.
export async function submit(slug, body) {
  installHelpers();
  await wait(fakeDelayMs);
  if (!switchedOn()) return { status: 'not_open' }; // 1. kill switch
  const clean = cleanSlug(slug);
  if (!clean) return { status: 'not_found' }; // 3a
  if (readStorage(RATE_KEY) === '1') return { status: 'rate_limited' }; // 4 (forced)
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
  // The fields' types (the Function's readFields; the database checks the real rules).
  const okTypes = UUID.test(String(body.submission_key ?? '')) && Number.isInteger(body.published_version) && body.published_version >= 1
    && body.answers !== null && typeof body.answers === 'object' && !Array.isArray(body.answers)
    && Array.isArray(body.children) && body.children.length <= 6 && Array.isArray(body.bookings) && body.bookings.length <= 6
    && (body.signature === null || body.signature === undefined || (typeof body.signature === 'string' && body.signature.length <= 70000));
  if (!okTypes) return { status: 'bad_request' };
  // 8. Turnstile: none in preview. 9. The database (rate limit first, like forms_public_submit).
  if (countTry()) return { status: 'rate_limited' };
  if (readStorage(CHANGED_KEY) === '1') {
    removeStorage(CHANGED_KEY);
    return { status: 'form_changed', published_version: body.published_version };
  }
  if (readStorage(TIME_TAKEN_KEY) === '1' && body.bookings.length > 0) {
    removeStorage(TIME_TAKEN_KEY);
    const fresh = backend().publicGet(clean);
    return { status: 'time_taken', times: fresh.status === 'ok' ? fresh.times : [] };
  }
  const result = backend().publicSubmit({
    slug: clean, submissionKey: body.submission_key, publishedVersion: body.published_version, answers: body.answers,
    children: body.children, bookings: body.bookings, signature: body.signature ?? null,
  });
  // Only the fields the Function passes on (mapSubmitResult).
  switch (result.status) {
    case 'ok':
      return { status: 'ok', repeat: result.repeat === true, bookings: result.bookings };
    case 'form_changed':
      return { status: 'form_changed', published_version: result.published_version ?? null };
    case 'time_taken':
      return { status: 'time_taken', times: result.times ?? [] };
    case 'closed':
    case 'not_found':
    case 'invalid':
      return { status: result.status };
    default:
      return { status: 'unavailable' };
  }
}

// The console helpers (mockClient.js adds them to the staff preview too). Each returns a short
// sentence saying what happened.
export function formsPublicPreviewHelpers() {
  return {
    setPublicForms(on) {
      writeStorage(SWITCH_KEY, on ? 'on' : 'off');
      return on
        ? 'Public forms are ON: /f/<name> works (reload it).'
        : 'Public forms are OFF (the kill switch): every /f/<name> link says sign-ups are paused (reload it).';
    },
    forceTimeTaken(on = true) {
      if (on) writeStorage(TIME_TAKEN_KEY, '1');
      else removeStorage(TIME_TAKEN_KEY);
      return on ? 'The next Submit with a picked time answers "time taken" (fresh times are shown).' : 'Submits work normally again.';
    },
    forceRateLimited(on = true) {
      if (on) writeStorage(RATE_KEY, '1');
      else {
        removeStorage(RATE_KEY);
        removeStorage(TRIES_KEY);
      }
      return on ? 'Every Submit on /f/<name> now answers "too many tries" until forceRateLimited(false).' : 'The rate limit is back to normal (20 Submits per hour).';
    },
    forceFormChanged(on = true) {
      if (on) writeStorage(CHANGED_KEY, '1');
      else removeStorage(CHANGED_KEY);
      return on ? 'The next Submit answers "form changed": the page reloads the form and keeps the answers.' : 'Submits work normally again.';
    },
  };
}

// On the public page there is no mockClient, so the first getForm / submit call adds the helpers
// to the console object. (Done on first use, not when the file loads: a file that does something
// just by being loaded can't be left out of the real build.) Color Belt's page has a helper
// called forceRateLimited too; on this page the forms one wins.
let helpersInstalled = false;
function installHelpers() {
  if (helpersInstalled || typeof window === 'undefined') return;
  helpersInstalled = true;
  window.__tkdPreview = { ...(window.__tkdPreview ?? {}), ...formsPublicPreviewHelpers() };
}
