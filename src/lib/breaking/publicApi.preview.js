// publicApi.preview.js — PREVIEW MODE ONLY: a stand-in for the public Board breaking Function.
// Why it exists: in `npm run dev:preview-mode` there is no Cloudflare Function, no Square and no database on
// this PC, so the family sign-up page (src/breaking/) calls this file instead of fetch('/api/breaking/…').
// It answers exactly what docs/Board Breaking/FUNCTION-API.md promises (same words, same fields), checks in
// the Function's order (limits, honeypot, ≥ 4 s fill time, human check) and then does what the database's
// brk_public_* functions do (SIGNATURES-0051: closed / full / invalid / price_changed / duplicate / idempotent
// on the submission id). It keeps its data in the SAME browser storage as the staff preview
// ('tkd.preview.breaking', mockBreaking.js), so a registration made here shows up on the staff roster, and
// closing registration there shows the "closed" page here.
//
// The page imports it only behind `import.meta.env.MODE === 'preview'`, so the real build never contains
// it. (Nothing here is safe for production: there is no human check, and "Square" is pretend.)
//
// HOW TO OPEN THE PAGE: the sample events have random public codes (the staff preview's Events tab shows
// each event's link). Because they change when the sample data is reset, the page also understands these
// names in place of a code (preview only):
//   /breaking/sample            the open Shrewsbury event (date: 8 days from today)
//   /breaking/sample-worcester  the open Worcester event
//   /breaking/sample-closed     a later Shrewsbury event whose registration is switched off ("closed")
//   /breaking/sample-past       an old event ("closed": the date has passed)
//   /breaking/nope0000          "This link isn't working"
//
// Card: a pretend Square link (a https://sandbox.square.link/… address). Tapping "Pay … with Square" in
// preview doesn't leave the page for Square: the page calls simulateSquareReturn, which pretends Square
// told the school (or not yet, see squareSlow), and comes back to /breaking/<code>?paid=1.
//
// Console helpers (window.__tkdPreviewBreaking; added on the first call, like the Camps preview):
//   codes()                 the sample events with their links
//   failNextPay()           the next Card link can't be made: "You're registered … Try again"
//   squareSlow(true)        Square "hasn't told us yet": paying doesn't mark paid, the return page says not yet
//   squarePaid()            Square tells us now for every pending card payment (the return page's Check again)
//   forcePriceChanged()     the next Register answers price_changed (Technical price +$0.25 first)
//   forceVerifyFailed()     the next Register fails the human check
//   forceRateLimited(true)  every call answers "too many tries" until forceRateLimited(false)
//   eventDay() / setToday(date)   pretend today is the sample event's day (same-day prices) / another date
//   reset()                 back to the sample events
import { readStorage, writeStorage, removeStorage } from '../storage.js';
import { createBreakingBackend, BRK_STORE_KEY } from '../mockBreaking.js';
import { addDays, isIsoDate, PREVIEW_TODAY_KEY, todayInSchoolTime } from '../testing/eventRules.js';
import { nameProblem, normalizeName } from '../testing/names.js';

const VERIFY_KEY = 'tkd.preview.breaking.forceVerifyFailed'; // '1' = the next Register fails the human check
const RATE_KEY = 'tkd.preview.breaking.forceRateLimited'; // '1' = every call is "too many tries"
const PRICE_KEY = 'tkd.preview.breaking.forcePriceChanged'; // '1' = the next Register gets price_changed
const FAIL_PAY_KEY = 'tkd.preview.breaking.failNextPay'; // '1' = the next Square link can't be made
const SLOW_KEY = 'tkd.preview.breaking.squareSlow'; // '1' = Square doesn't tell us when someone pays
const MIN_FILL_MS = 4000; // the Function's "too fast" rule
const MAX_BODY_CHARACTERS = 256 * 1024;
const MAX_STUDENTS = 500; // the database's `full` limit per event
const CODE = /^[a-hjkmnp-z2-9]{8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYING = ['cash', 'check', 'card'];
let fakeDelayMs = 300; // pretend the network takes a moment, so "Sending…" is visible

const wait = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

// The pretend network time in milliseconds.
export function setFakeDelay(ms) {
  fakeDelayMs = Math.max(0, Number(ms) || 0);
}

// "Today" at the school, or the pretend date set with setToday / eventDay.
const today = () => {
  const pretend = readStorage(PREVIEW_TODAY_KEY);
  return isIsoDate(pretend) ? pretend : todayInSchoolTime(new Date());
};

function newUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, hex);
}

const takeFlag = (key) => {
  const on = readStorage(key) === '1';
  if (on) removeStorage(key); // one-shot
  return on;
};

// The preview Board breaking database on this browser's storage (made on first use, so just importing this
// file never touches storage). `snapshot()` makes the sample data on first read and keeps it.
let backend = null;
function db() {
  if (!backend) {
    backend = createBreakingBackend({
      loadStore: () => JSON.parse(readStorage(BRK_STORE_KEY)),
      saveStore: (store) => writeStorage(BRK_STORE_KEY, JSON.stringify(store)),
      now: () => Date.now(),
      today,
      newId: newUuid,
    });
  }
  return backend.snapshot();
}
const save = (store) => writeStorage(BRK_STORE_KEY, JSON.stringify(store));

// ----- Finding the event of a code (and the sample names) -----
function sampleEvent(store, name) {
  const t = today();
  const byDate = (a, b) => (a.event_date < b.event_date ? -1 : 1);
  const upcoming = store.events.filter((e) => e.event_date >= t).sort(byDate);
  if (name === 'sample') return upcoming.find((e) => e.registration_open && e.location_code === 'shrewsbury') ?? null;
  if (name === 'sample-worcester') return upcoming.find((e) => e.registration_open && e.location_code === 'worcester') ?? null;
  if (name === 'sample-closed') return upcoming.find((e) => !e.registration_open) ?? null;
  if (name === 'sample-past') return store.events.filter((e) => e.event_date < t).sort(byDate).pop() ?? null;
  return null;
}
function findEvent(store, code) {
  const clean = typeof code === 'string' ? code.toLowerCase() : '';
  if (clean.startsWith('sample')) return sampleEvent(store, clean);
  if (!CODE.test(clean)) return null;
  return store.events.find((e) => e.public_code === clean) ?? null;
}
const isOpen = (event) => event.registration_open && today() <= event.event_date; // the database's "closed": switched off, or the date has passed

// ----- Money (the database's brk_price, written again) -----
const sum = (list) => list.reduce((total, n) => total + n, 0);
const owedOf = (reg) => (Number.isInteger(reg.override_cents) ? reg.override_cents : reg.amount_cents);
const paidOf = (store, reg) => sum(store.payments.filter((p) => p.registration_id === reg.id).map((p) => p.amount_cents));
const balanceOf = (store, reg) => Math.max(0, owedOf(reg) - paidOf(store, reg));
function amountFor(settings, tech, adult, card, sameDay) {
  const extra = (card ? settings.card_extra_cents : 0) + (sameDay ? settings.same_day_extra_cents : 0);
  return tech * (settings.tech_cents + extra) + adult * (settings.adult_cents + extra);
}
// The chart group a student uses, and the row (null when the rank isn't in it): black rank → black; "Little Tiger …" → tiger; else child/teen by age.
function groupOf(store, rank, age) {
  const inBand = (band) => store.chart.find((c) => c.band === band && c.rank_name === rank) ?? null;
  let band;
  if (inBand('black')) band = 'black';
  else if (/^little tiger( |$)/i.test(rank) || inBand('tiger')) band = 'tiger';
  else band = age <= store.settings.child_max_age ? 'child' : 'teen';
  const row = inBand(band);
  return row ? { band, row } : null;
}

// ----- GET /api/breaking/<code> -----
export async function getEvent(code) {
  installHelpers();
  await wait(fakeDelayMs);
  if (readStorage(RATE_KEY) === '1') return { status: 'rate_limited' };
  const store = db();
  const event = findEvent(store, code);
  if (!event) return { status: 'not_found' };
  const s = store.settings;
  return {
    status: 'ok',
    event: {
      name: event.name,
      location_code: event.location_code,
      event_date: event.event_date,
      registration_state: isOpen(event) ? 'open' : 'closed',
      classes: store.classes.filter((c) => c.event_id === event.id).sort((a, b) => a.sort - b.sort).map((c) => ({ id: c.id, name: c.name, start_time: c.start_time, end_time: c.end_time })),
      prices: { tech_cents: s.tech_cents, adult_cents: s.adult_cents, card_extra_cents: s.card_extra_cents, same_day_extra_cents: s.same_day_extra_cents, same_day: today() >= event.event_date },
      child_max_age: s.child_max_age,
      chart: store.chart.map((r) => ({ band: r.band, rank_name: r.rank_name, sort: r.sort, technique: r.technique, tech_boards: r.tech_boards, adult_boards: r.adult_boards })),
    },
    turnstile_site_key: null, // no human check in preview
  };
}

// ----- The Function's limits on a POST body (FUNCTION-API.md) -----
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const onlyKeys = (obj, keys) => obj !== null && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).every((k) => keys.includes(k));
const COMMON = ['action', 'submission_id', 'website', 'started_at', 'sent_at', 'turnstile_token'];
const SIGNUP_KEYS = [...COMMON, 'first_name', 'last_name', 'age', 'rank_name', 'class_id', 'tech', 'adult', 'paying_by', 'expected_total_cents'];
export function bodyWithinLimits(body) {
  if (!body || typeof body !== 'object' || !['signup', 'pay', 'status'].includes(body.action)) return false;
  if (typeof body.submission_id !== 'string' || !UUID.test(body.submission_id)) return false;
  if (body.action === 'status') return onlyKeys(body, ['action', 'submission_id']);
  if (!Number.isInteger(body.started_at) || !Number.isInteger(body.sent_at)) return false;
  if (body.turnstile_token !== undefined && body.turnstile_token !== null && !isStr(body.turnstile_token, 2048)) return false;
  if (body.website !== undefined && typeof body.website !== 'string') return false;
  if (body.action === 'pay') return onlyKeys(body, [...COMMON, 'first_name']) && isStr(body.first_name, 200);
  if (!onlyKeys(body, SIGNUP_KEYS)) return false;
  return isStr(body.first_name, 200) && isStr(body.last_name, 200) && Number.isInteger(body.age) && isStr(body.rank_name, 200) && isStr(body.class_id, 64)
    && Number.isInteger(body.tech) && Number.isInteger(body.adult) && isStr(body.paying_by, 20) && Number.isInteger(body.expected_total_cents);
}

// ----- The Square step (pretend) -----
// → { state: 'link', url } | { state: 'failed' }. The registration keeps its (pretend) order and link, so a retry gets the same one.
function squareStep(store, reg) {
  if (takeFlag(FAIL_PAY_KEY)) return { state: 'failed' };
  if (!reg.square_link_url) {
    reg.square_order_id = `ord_preview_${reg.id.slice(0, 8)}`;
    reg.square_link_url = `https://sandbox.square.link/u/preview-${reg.id.slice(0, 8)}`;
    save(store);
  }
  return { state: 'link', url: reg.square_link_url };
}

// What the change log keeps about a new registration (the staff History reads it).
function logInsert(store, reg) {
  const cols = ['id', 'event_id', 'class_id', 'first_name', 'last_name', 'age', 'rank_name', 'band_used', 'tech_boards', 'adult_boards', 'paying_by', 'paying_by_on_form', 'same_day', 'amount_cents', 'override_cents', 'source', 'broke', 'broke_on', 'version'];
  store.change_log.push({
    occurred_at: new Date().toISOString(), actor_name: 'Family form', batch_id: newUuid(), action: 'brk_public_signup', table_name: 'brk_registrations',
    record_id: reg.id, op: 'insert', before: null, after: Object.fromEntries(cols.map((c) => [c, reg[c] ?? null])),
  });
}

function signup(store, event, body) {
  // Same submission id again (a dropped connection, Try again): the same registration, never a second one.
  const again = store.registrations.find((r) => r.submission_id === body.submission_id && r.event_id === event.id);
  if (again) {
    const pay = again.paying_by === 'card' ? squareStep(store, again) : { state: 'none' };
    return { status: 'ok', amount_cents: owedOf(again), paying_by: again.paying_by, same_day: again.same_day, pay };
  }
  if (!isOpen(event)) return { status: 'closed' };
  if (store.registrations.filter((r) => r.event_id === event.id).length >= MAX_STUDENTS) return { status: 'full' };
  const first = normalizeName(body.first_name);
  const last = normalizeName(body.last_name);
  if (nameProblem(body.first_name) !== null) return { status: 'invalid', field: 'first_name' };
  if (nameProblem(body.last_name) !== null) return { status: 'invalid', field: 'last_name' };
  if (body.age < 1 || body.age > 99) return { status: 'invalid', field: 'age' };
  if (!store.classes.some((c) => c.event_id === event.id && c.id === body.class_id)) return { status: 'invalid', field: 'class_id' };
  const rank = normalizeName(body.rank_name);
  const group = groupOf(store, rank, body.age);
  if (!group) return { status: 'invalid', field: 'rank_name' };
  if (body.tech < 0 || body.tech > 12 || body.adult < 0 || body.adult > 12 || body.tech + body.adult < 1) return { status: 'invalid', field: 'boards' };
  if (!PAYING.includes(body.paying_by)) return { status: 'invalid', field: 'paying_by' };
  const sameDay = today() >= event.event_date;
  const amount = amountFor(store.settings, body.tech, body.adult, body.paying_by === 'card', sameDay);
  if (body.expected_total_cents !== amount) return { status: 'price_changed', amount_cents: amount };
  const duplicate = store.registrations.some((r) => r.event_id === event.id && r.first_name.toLowerCase() === first.toLowerCase() && r.last_name.toLowerCase() === last.toLowerCase() && r.age === body.age && r.class_id === body.class_id);
  if (duplicate) return { status: 'duplicate' };
  const at = new Date().toISOString();
  const reg = {
    id: newUuid(), event_id: event.id, class_id: body.class_id, first_name: first, last_name: last, age: body.age, rank_name: rank, band_used: group.band,
    tech_boards: body.tech, adult_boards: body.adult, paying_by: body.paying_by, paying_by_on_form: body.paying_by, same_day: sameDay, amount_cents: amount,
    override_cents: null, square_order_id: null, square_link_url: null, source: 'form', broke: false, broke_on: null, entered_by_name: null, version: 1,
    created_at: at, created_by_name: 'Family form', updated_at: at, updated_by_name: 'Family form', submission_id: body.submission_id,
  };
  store.registrations.push(reg);
  logInsert(store, reg);
  save(store);
  const pay = reg.paying_by === 'card' ? squareStep(store, reg) : { state: 'none' };
  return { status: 'ok', amount_cents: amount, paying_by: reg.paying_by, same_day: sameDay, pay };
}

// POST /api/breaking/<code> — the Function's checks in its order, then the database's.
export async function postAction(code, body) {
  installHelpers();
  await wait(fakeDelayMs);
  let text;
  try {
    text = JSON.stringify(body);
  } catch {
    return { status: 'bad_request' };
  }
  if (typeof text !== 'string' || text.length > MAX_BODY_CHARACTERS) return { status: 'bad_request' };
  if (!bodyWithinLimits(body)) return { status: 'bad_request' };
  if (readStorage(RATE_KEY) === '1') return { status: 'rate_limited' };
  const store = db();
  const event = findEvent(store, code);
  if (!event) return { status: 'not_found' };
  if (body.action === 'status') {
    const reg = store.registrations.find((r) => r.submission_id === body.submission_id && r.event_id === event.id);
    if (!reg) return { status: 'not_found' };
    const balance = balanceOf(store, reg);
    return { status: 'ok', paid: balance === 0, amount_cents: balance, paying_by: reg.paying_by };
  }
  if (body.website !== undefined && body.website !== '') return { status: 'bad_request' }; // honeypot
  if (body.sent_at - body.started_at < MIN_FILL_MS) return { status: 'bad_request' }; // too fast
  if (takeFlag(VERIFY_KEY)) return { status: 'verify_failed' }; // the human check fails once
  if (body.action === 'pay') {
    const reg = store.registrations.find((r) => r.submission_id === body.submission_id && r.event_id === event.id);
    if (!reg) return { status: 'not_found' };
    // Square rejects a retry whose name text differs, so the Function needs the same first name again.
    if (normalizeName(body.first_name).toLowerCase() !== reg.first_name.toLowerCase()) return { status: 'not_found' };
    const balance = balanceOf(store, reg);
    if (balance === 0) return { status: 'paid' };
    if (reg.paying_by !== 'card') return { status: 'ok', amount_cents: balance, pay: { state: 'none' } };
    return { status: 'ok', amount_cents: balance, pay: squareStep(store, reg) };
  }
  if (takeFlag(PRICE_KEY)) {
    store.settings.tech_cents += 25; // the price "changed while the form was open"
    store.settings.version += 1;
    save(store);
  }
  return signup(store, event, body);
}

// ----- Pretend Square -----
// The registration's balance is paid by Square at the event's school (what the real webhook does).
function payBalance(store, reg, event) {
  const balance = balanceOf(store, reg);
  if (balance <= 0) return;
  const at = new Date().toISOString();
  store.payments.push({
    id: newUuid(), registration_id: reg.id, kind: 'payment', amount_cents: balance, method: 'card', paid_on: today(), school: event.location_code,
    recorded_at: at, recorded_by: null, recorded_by_name: 'Square', reverses_payment_id: null, paying_by_before: null,
  });
}
// Called by the page when "Pay … with Square" is tapped in preview mode.
export function simulateSquareReturn(code, submissionId) {
  if (readStorage(SLOW_KEY) === '1') return false; // Square "hasn't told us yet"
  const store = db();
  const event = findEvent(store, code);
  const reg = event ? store.registrations.find((r) => r.submission_id === submissionId && r.event_id === event.id) : null;
  if (!reg) return false;
  payBalance(store, reg, event);
  save(store);
  return true;
}

// ----- Console helpers -----
export function publicBreakingHelpers() {
  const reload = () => {
    if (typeof window !== 'undefined' && window.location?.reload) setTimeout(() => window.location.reload(), 50);
  };
  const flag = (key, on) => (on ? writeStorage(key, '1') : removeStorage(key));
  return {
    codes() {
      const store = db();
      return store.events.map((e) => ({ school: e.location_code, date: e.event_date, registration: isOpen(e) ? 'open' : 'closed', link: `/breaking/${e.public_code}` }))
        .concat([{ school: 'names that work in place of a code', date: '', registration: '', link: '/breaking/sample · /breaking/sample-worcester · /breaking/sample-closed · /breaking/sample-past' }]);
    },
    failNextPay(on = true) {
      flag(FAIL_PAY_KEY, on);
      return on ? 'The next Square link can\'t be made: a Card registration shows "You\'re registered … Try again".' : 'Square links work normally again.';
    },
    squareSlow(on = true) {
      flag(SLOW_KEY, on);
      return on ? 'Square now "takes a while": paying doesn\'t mark paid until squarePaid().' : 'Square tells us straight away again.';
    },
    squarePaid() {
      const store = db();
      let count = 0;
      for (const reg of store.registrations) {
        if (reg.square_link_url && balanceOf(store, reg) > 0) {
          payBalance(store, reg, store.events.find((e) => e.id === reg.event_id));
          count += 1;
        }
      }
      save(store);
      return `Square told the school about ${count} payment${count === 1 ? '' : 's'}. Tap "Check again" on the return page.`;
    },
    forcePriceChanged(on = true) {
      flag(PRICE_KEY, on);
      return on ? 'The next Register raises the Technical price by $0.25 first, so it answers price_changed.' : 'Register works normally again.';
    },
    forceVerifyFailed(on = true) {
      flag(VERIFY_KEY, on);
      return on ? 'The next Register fails the human check (verify_failed).' : 'The human check works again.';
    },
    forceRateLimited(on = true) {
      flag(RATE_KEY, on);
      return on ? 'Every call now answers "too many tries" (rate_limited) until forceRateLimited(false).' : 'The rate limit is back to normal.';
    },
    setToday(date) {
      if (date === null || date === undefined || date === '') {
        removeStorage(PREVIEW_TODAY_KEY);
        return `Back to the real date (${todayInSchoolTime(new Date())}). Reload to see it.`;
      }
      if (!isIsoDate(date)) return "Use a date like setToday('2026-12-18'), or setToday(null) for the real date.";
      writeStorage(PREVIEW_TODAY_KEY, date);
      return `Preview now pretends today is ${date} (school time). Reload to see it.`;
    },
    eventDay() {
      const store = db();
      const event = sampleEvent(store, 'sample');
      if (!event) return 'No open sample event.';
      writeStorage(PREVIEW_TODAY_KEY, event.event_date);
      reload();
      return `Preview now pretends today is the event day (${event.event_date}): same-day prices. Reloading… (setToday(null) for the real date)`;
    },
    reset() {
      backend?.reset();
      db();
      reload();
      return 'Board breaking is back to the sample events. Reloading…';
    },
    // For checks: the date 8 days ahead (the sample event) without touching storage.
    sampleDate: () => addDays(today(), 8),
  };
}

// On the family page there is no mockClient, so the first getEvent / postAction call adds the helpers to the console object.
// (Done on first use, not when the file loads: a file that does something just by being loaded can't be left out of the real build.)
let helpersInstalled = false;
function installHelpers() {
  if (helpersInstalled || typeof window === 'undefined') return;
  helpersInstalled = true;
  window.__tkdPreviewBreaking = { ...publicBreakingHelpers(), ...(window.__tkdPreviewBreaking ?? {}) };
}
