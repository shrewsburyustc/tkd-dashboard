// mockClient.js — a FAKE backend used only in preview mode (npm run dev:preview-mode).
// Why it exists: so anyone can click through every screen — sign-in, Set your PIN, Home, the
// account menu, Change PIN, Change password, the lock screen — without a Supabase database.
// It copies the small part of the Supabase client the app uses — auth.signInWithPassword /
// getSession / onAuthStateChange / signOut / updateUser, rpc, and from(table).select().eq().order()
// — and follows the same rules as the real database (migrations 0001 + 0002 + 0003).
// Testing → Classes and ranks lives in its own file, mockTesting.js; Events, the roster with
// payments and Settings → Schools live in mockTestingEvents.js (phase 2); Star testing → Rubrics and
// prices lives in mockStarTesting.js (Star phase 1), Star testing events in mockStarEvents.js
// (Star phase 2) and Star candidates and payments in mockStarCandidates.js (Star phase 3); this file
// plugs them all in.
//
// Try it:  any email + password "preview" signs in as Jeffrey Berg (admin). PIN is 2580.
// Test helpers in the browser console (F12 → Console):
//   __tkdPreview.lockNow()                lock the screen right away
//   __tkdPreview.kioskEndsIn(20)          the kiosk on this tablet ends in 20 minutes (0 = now)
//   __tkdPreview.setHasPin(false)         remove the PIN (reload → Set your PIN; Lock now → signed out)
//   __tkdPreview.setShared(true)          pretend this is the shared front-desk account (then reload)
//   __tkdPreview.setPasswordAgeDays(8)    pretend the password was typed 8 days ago (then reload)
//   __tkdPreview.setPasswordAgeMinutes(11) pretend the password was typed 11 minutes ago
//                                         (Set PIN then needs the password again)
// Testing helpers:
//   __tkdPreview.setRole('staff')         view-only account ('admin' to switch back; then reload)
//   __tkdPreview.failNextSave()           the next Testing save fails like a dropped connection
//   __tkdPreview.failNextSave('star')     the next Star testing save (Rubrics and prices, events or
//                                         candidates and payments) fails instead
//   __tkdPreview.simulateOtherAdminEdit() "another admin" changes everything (open dialogs go stale)
//   __tkdPreview.clearSchool('Shrewsbury') remove that school's classes (to see the empty state)
//   __tkdPreview.resetTesting()           back to the default classes and ranks
//   __tkdPreview.setTestingDelay(3000)    slow Testing calls down (e.g. to see the skeleton)
// Schedule helpers (mockSchedule.js; setRole and setTestingDelay apply too):
//   __tkdPreview.failNextScheduleSave()            the next Schedule save fails like a dropped connection
//   __tkdPreview.simulateOtherAdminEditSchedule()  "another admin" changes every schedule row
//   __tkdPreview.clearSchedule('Shrewsbury')       remove that school's schedules (empty state)
//   __tkdPreview.resetSchedule()                   back to the sample week
// Calendar helpers (mockCalendar.js; setRole and setTestingDelay apply too):
//   __tkdPreview.failNextCalendarSave()            the next Calendar save fails like a dropped connection
//   __tkdPreview.simulateOtherAdminEditCalendar()  "another admin" changes every event, closure and type
//   __tkdPreview.clearCalendar()                   no events or closures (types stay)
//   __tkdPreview.resetCalendar()                   back to the sample events and closures
// Forms helpers (mockForms.js; setRole and setTestingDelay apply too):
//   __tkdPreview.failNextFormsSave()               the next Forms save fails like a dropped connection
//   __tkdPreview.simulateOtherAdminEditForms()     "another admin" changes every form (open builders go stale)
//   __tkdPreview.clearForms()                      no forms, sign-ups or bookings (empty state)
//   __tkdPreview.resetForms()                      back to the sample forms and sign-ups
// Events / roster / family form helpers (phase 2, contract 0005 §4.5 / §5):
//   __tkdPreview.setToday('2026-11-20')   pretend it's another day in school time (null = real date)
//                                         — event states, prices and Mark paid follow it
//   __tkdPreview.setPublicRegistration(false) the family form's kill switch ("not open" everywhere)
//   __tkdPreview.forceVerifyFailed(true)  the next family-form Send fails the human check
//   __tkdPreview.forceRateLimited(true)   family-form Sends answer "too many tries" until set false
//   (failNextSave, simulateOtherAdminEdit and resetTesting cover the events and roster too)
// Public Forms page helpers (src/forms/publicApi.preview.js; open /f/<name> on the same port):
//   __tkdPreview.setPublicForms(false)    the forms kill switch (every /f/<name> says "paused")
//   __tkdPreview.forceTimeTaken()         the next forms Submit with a time answers "time taken"
//   __tkdPreview.forceFormChanged()       the next forms Submit answers "form changed"
//   __tkdPreview.forceFormsRateLimited(true) every forms Submit answers "too many tries"
// Grading helpers (phase 3, contract 0010 §3.4; setToday and failNextSave() cover grading too):
//   __tkdPreview.failSavesUntilRetry()    from now on EVERY Events save fails like a dropped
//                                         Wi-Fi connection (reads still work) — "Not saved"
//   __tkdPreview.reconnect()              saves work again, and the browser's "online" event
//                                         fires, so unsaved results save by themselves
// Star testing (Rubrics and prices, mockStarTesting.js; events, mockStarEvents.js; candidates and
// payments, mockStarCandidates.js):
//   simulateOtherAdminEdit() and resetTesting() cover Star's rubrics and prices, events and
//   candidates too; setRole, setTestingDelay and setToday work the same; failNextSave('star') targets
//   Star (see above). The grading helpers above (failSavesUntilRetry / reconnect) touch Color Belt's
//   Events saves only. Star's seed (resetTesting): a finished Summer event with make-ups owed, the
//   upcoming Fall event (paid, not paid, overpaid, duplicate, private, withdrawn, make-up) and a later
//   Spring event that can pick make-ups.
// Staff accounts helpers (account menu → Admin → Staff accounts; mockStaff.js):
//   __tkdPreview.failNextSave()           also makes the next Reset password / Reset PIN fail
//   __tkdPreview.resetStaffAccounts()     the fake desk is signed in on 3 devices again
//   __tkdPreview.setPasswordAgeMinutes(11) → a reset asks for "Confirm it's you" again
// Finance helpers (contract 0011 §3, mockFinance.js; setToday, setRole and failNextSave cover Finance too —
// failNextSave makes the next Finance save fail, e.g. Close the day):
//   __tkdPreview.setNow('19:30')          pretend the school clock says 7:30 PM (Home reminder); null = real time
//   __tkdPreview.resetFinance()           back to the sample closings and Star payments, reminder times Off
import { getLastPasswordSignIn, PASSWORD_MAX_AGE_MS, decodeJwtPayload } from './session.js';
import { setLockedFlag } from './useIdleLock.js';
import { readStorage, writeStorage, removeStorage } from './storage.js';
import { isFourDigits, isPinTooEasy } from './pinRules.js';
import { createTestingBackend, TESTING_RPC_NAMES } from './mockTesting.js';
import { createEventsBackend, EVENT_RPC_NAMES, EVENT_RESTRICTED_RPC_NAMES, EVENT_TABLES } from './mockTestingEvents.js';
import { previewToday, publicPreviewHelpers } from './testing/publicApi.preview.js';
import { formsPublicPreviewHelpers } from '../forms/publicApi.preview.js';
import { createStaffBackend, STAFF_RPC_NAMES } from './mockStaff.js';
import { createStarBackend, STAR_RPC_NAMES, STAR_TABLES, STAR_STORE_KEY } from './mockStarTesting.js';
import { createStarEventsBackend, STAR_EVENT_RPC_NAMES, STAR_EVENT_TABLES } from './mockStarEvents.js';
import {
  createStarCandidatesBackend, defaultStarCandidatesData, starCandidatesSeedIsCurrent, STAR_CANDIDATE_RPC_NAMES,
  STAR_CANDIDATE_WRITE_RPC_NAMES, STAR_CANDIDATE_TABLES,
} from './mockStarCandidates.js';
import { createScheduleBackend, SCHEDULE_RPC_NAMES } from './mockSchedule.js';
import { createCalendarBackend, CALENDAR_RPC_NAMES } from './mockCalendar.js';
import { createFormsBackend, FORMS_RPC_NAMES } from './mockForms.js';
import { createFinanceBackend, FINANCE_RPC_NAMES, FINANCE_WRITE_RPC_NAMES } from './mockFinance.js';

const SESSION_KEY = 'tkd.preview.session'; // the fake "signed in" session
const STAFF_STATE_KEY = 'tkd.preview.staffState'; // fake staff row: PIN, shared flag
const SESSION_STATE_KEY = 'tkd.preview.sessionState'; // fake per-session rows: PIN tries, unlocked-until
const OLD_PIN_STATE_KEY = 'tkd.preview.pinState'; // used by the first build; cleaned up below
const TESTING_KEY = 'tkd.preview.testing'; // fake Testing tables (classes + ranks)
const TESTING_DELAY_KEY = 'tkd.preview.testingDelay'; // setTestingDelay(ms), kept across reloads
const STAFF_ACCOUNTS_KEY = 'tkd.preview.staffAccounts'; // fake Staff accounts (mockStaff.js)
const SCHEDULE_KEY = 'tkd.preview.schedule'; // fake Schedule tables (mockSchedule.js)
const CALENDAR_KEY = 'tkd.preview.calendar'; // fake Calendar tables (mockCalendar.js)
const FORMS_KEY = 'tkd.preview.forms'; // fake Forms tables (mockForms.js)
const FINANCE_KEY = 'tkd.preview.finance'; // fake Finance tables: closings, settings, exports, Star sample (mockFinance.js)

const PREVIEW_PASSWORD = 'preview';
const PREVIEW_PIN = '2580'; // not too easy: 1234 is refused by the weak-PIN rule now
const MAX_PIN_TRIES = 5;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SET_PIN_PASSWORD_WINDOW_MS = 10 * MINUTE_MS; // set_my_pin wants a password sign-in this recent
const FAKE_DELAY_MS = 400; // pretend the network takes a moment, so "Signing in…" is visible
const TESTING_DELAY_MS = FAKE_DELAY_MS / 2; // each Testing read/save takes ~200 ms

const FAKE_STAFF = {
  id: '00000000-0000-4000-8000-000000000001',
  full_name: 'Jeffrey Berg',
  email: 'jeffrey@ustc.com',
  role: 'admin',
  active: true,
  idle_lock_minutes: 45,
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A random id for each fake sign-in session (the real token has one called "session_id").
function newSessionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// A random id in the real uuid format (the fake Testing tables check the format like the
// database does, so the fallback must look right too).
function newUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, hex);
}

// ----- Fake token + session -----

// base64url-encode a small object (the format JWT parts use).
function toBase64Url(object) {
  return btoa(JSON.stringify(object)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Builds a fake access token whose payload has the same `amr` and `session_id` claims Supabase
// uses, so session.js reads the "last password sign-in" time exactly as it would for real.
function makeSession(passwordSignInSeconds, sessionId) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub: FAKE_STAFF.id,
    email: FAKE_STAFF.email,
    role: 'authenticated',
    session_id: sessionId,
    amr: [{ method: 'password', timestamp: passwordSignInSeconds }],
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const accessToken = `${toBase64Url({ alg: 'none', typ: 'JWT' })}.${toBase64Url(payload)}.preview-signature`;
  return {
    access_token: accessToken,
    refresh_token: 'preview-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSeconds + 3600,
    user: { id: FAKE_STAFF.id, email: FAKE_STAFF.email },
  };
}

function loadSession() {
  try {
    return JSON.parse(readStorage(SESSION_KEY)) ?? null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  writeStorage(SESSION_KEY, JSON.stringify(session));
}

function sessionIdOf(session) {
  return decodeJwtPayload(session?.access_token ?? '')?.session_id ?? null;
}

// ----- Fake staff row (what the database keeps in public.staff) -----
// pin: the PIN itself (the real database only keeps a scrambled copy — this is only a preview).
// role: 'admin' or 'staff' (setRole helper). Saved states from before Testing have no role → admin.

function loadStaffState() {
  try {
    const saved = JSON.parse(readStorage(STAFF_STATE_KEY));
    if (saved) return { ...saved, role: saved.role === 'staff' ? 'staff' : 'admin' };
  } catch {
    // fall through to the default below
  }
  return { pin: PREVIEW_PIN, isShared: false, role: 'admin' };
}

function saveStaffState(state) {
  writeStorage(STAFF_STATE_KEY, JSON.stringify(state));
}

// ----- Fake per-session rows (public.pin_attempts + public.session_unlock) -----
// One record, for the current fake session. A new password sign-in = a new session id =
// a fresh record, exactly like the real database (wrong-PIN counts don't carry over).

function loadSessionState(sessionId) {
  try {
    const saved = JSON.parse(readStorage(SESSION_STATE_KEY));
    if (saved && saved.sessionId === sessionId) return saved;
  } catch {
    // fall through to a fresh record
  }
  return { sessionId, failedAttempts: 0, lockedAt: null, unlockedUntil: null };
}

function saveSessionState(state) {
  writeStorage(SESSION_STATE_KEY, JSON.stringify(state));
}

// ----- Shared checks -----

// Like the database's is_active_staff_with_fresh_password(): signed in + password within 7 days.
function passwordIsFresh(session) {
  const last = getLastPasswordSignIn(session);
  return last !== null && Date.now() - last <= PASSWORD_MAX_AGE_MS;
}

function idleMs() {
  return FAKE_STAFF.idle_lock_minutes * MINUTE_MS;
}

// Like the database's has_data_access() (0002): signed in, password within 7 days, a session
// id, not PIN-locked, and this session unlocked right now.
function hasDataAccess(session) {
  const sessionId = sessionIdOf(session);
  if (!session || !sessionId || !passwordIsFresh(session)) return false;
  const state = loadSessionState(sessionId);
  return !state.lockedAt && state.unlockedUntil !== null && state.unlockedUntil > Date.now();
}

// Who is asking, for the fake Testing tables (mockTesting.js). is_admin() also needs a fresh password.
function testingContext() {
  const session = loadSession();
  return {
    signedIn: Boolean(session),
    hasDataAccess: hasDataAccess(session),
    isAdmin: Boolean(session) && loadStaffState().role === 'admin' && passwordIsFresh(session),
    actorName: FAKE_STAFF.full_name,
    userId: FAKE_STAFF.id, // auth.uid() — the 10-second Undo of a payment checks it (phase 2)
  };
}

const answer = (value) => ({ data: value, error: null, status: 200 });
const NOT_SIGNED_IN = { data: null, error: { message: 'Not signed in' }, status: 401 };

// ----- Fake RPC functions -----

function getMyProfile() {
  const session = loadSession();
  if (!session) return NOT_SIGNED_IN;
  const staff = loadStaffState();
  const sessionState = loadSessionState(sessionIdOf(session));
  const row = {
    ...FAKE_STAFF,
    role: staff.role,
    has_pin: staff.pin !== null,
    pin_locked: Boolean(sessionState.lockedAt),
    password_fresh: passwordIsFresh(session),
    is_shared: Boolean(staff.isShared),
  };
  return answer([row]); // real function returns an array of 0 or 1 rows
}

// touch_session(): 'unlocked' | 'locked' | 'password_required' (see migration 0002).
function touchSession() {
  const session = loadSession();
  if (!session) return answer('password_required');
  const sessionId = sessionIdOf(session);
  if (!sessionId || !passwordIsFresh(session)) return answer('password_required');

  const state = loadSessionState(sessionId);
  if (state.lockedAt) return answer('password_required'); // 5 wrong PINs in this session

  const now = Date.now();
  if (state.unlockedUntil === null) {
    // First time we hear from this session: unlocked until (password sign-in + idle time),
    // so a fresh sign-in starts unlocked but an old one starts locked.
    state.unlockedUntil = getLastPasswordSignIn(session) + idleMs();
    saveSessionState(state);
    return answer(state.unlockedUntil > now ? 'unlocked' : 'locked');
  }
  if (state.unlockedUntil > now) {
    state.unlockedUntil = now + idleMs(); // still here: extend
    saveSessionState(state);
    return answer('unlocked');
  }
  return answer('locked'); // never reopens a locked session — only a right PIN does
}

// lock_session(): this session is locked from now.
function lockSession() {
  const session = loadSession();
  if (!session) return NOT_SIGNED_IN;
  const state = loadSessionState(sessionIdOf(session));
  state.unlockedUntil = Date.now();
  saveSessionState(state);
  return answer(null);
}

function verifyPin(pin) {
  const session = loadSession();
  if (!session) return NOT_SIGNED_IN;

  if (!isFourDigits(pin)) return answer('invalid'); // not 4 digits

  const sessionId = sessionIdOf(session);
  if (!sessionId || !passwordIsFresh(session)) return answer('password_required'); // 7-day rule

  const staff = loadStaffState();
  if (staff.pin === null) return answer('password_required'); // no PIN set

  const state = loadSessionState(sessionId);
  if (state.lockedAt) return answer('password_required');

  if (pin === staff.pin) {
    state.failedAttempts = 0;
    state.unlockedUntil = Date.now() + idleMs(); // a right PIN unlocks this session (0002)
    saveSessionState(state);
    return answer('ok');
  }

  state.failedAttempts += 1;
  if (state.failedAttempts >= MAX_PIN_TRIES) {
    state.lockedAt = Date.now(); // 5th wrong try: PIN is off for this session for good
    saveSessionState(state);
    return answer('password_required');
  }
  saveSessionState(state);
  return answer(`wrong:${MAX_PIN_TRIES - state.failedAttempts}`);
}

// set_my_pin(p_pin): 'ok' | 'invalid' | 'too_easy' | 'password_required' | 'not_allowed'.
function setMyPin(pin) {
  const session = loadSession();
  if (!session) return NOT_SIGNED_IN;

  if (!isFourDigits(pin)) return answer('invalid');
  if (isPinTooEasy(pin)) return answer('too_easy');

  // Password typed in the last 10 minutes (Set PIN comes right after sign-in; Change PIN
  // checks the password first).
  const sessionId = sessionIdOf(session);
  const last = getLastPasswordSignIn(session);
  if (!sessionId || last === null || Date.now() - last > SET_PIN_PASSWORD_WINDOW_MS) {
    return answer('password_required');
  }

  const staff = loadStaffState();
  if (staff.isShared && staff.pin !== null) return answer('not_allowed'); // desk: admin changes it

  staff.pin = pin;
  saveStaffState(staff);
  // Fresh start for this session: no wrong tries, and unlocked.
  saveSessionState({ sessionId, failedAttempts: 0, lockedAt: null, unlockedUntil: Date.now() + idleMs() });
  return answer('ok');
}

// ----- The fake client -----

export function createMockClient() {
  const listeners = new Set(); // functions registered with onAuthStateChange
  removeStorage(OLD_PIN_STATE_KEY); // leftover from the first build's preview mode

  function notify(event, session) {
    listeners.forEach((callback) => callback(event, session));
  }

  // If another tab signs out, tell this tab too (the real client does the same).
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_KEY && event.newValue === null) notify('SIGNED_OUT', null);
  });

  const auth = {
    async signInWithPassword({ email, password }) {
      await wait(FAKE_DELAY_MS);
      if (!email || password !== PREVIEW_PASSWORD) {
        return {
          data: { user: null, session: null },
          error: { name: 'AuthApiError', message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' },
        };
      }
      // Password typed just now, and (like the real thing) a brand-new session id.
      const session = makeSession(Math.floor(Date.now() / 1000), newSessionId());
      saveSession(session);
      notify('SIGNED_IN', session);
      return { data: { user: session.user, session }, error: null };
    },

    async getSession() {
      return { data: { session: loadSession() }, error: null };
    },

    onAuthStateChange(callback) {
      listeners.add(callback);
      // The real client reports the current session right after you subscribe.
      setTimeout(() => {
        if (listeners.has(callback)) callback('INITIAL_SESSION', loadSession());
      }, 0);
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },

    // Same optional { scope } as the real signOut: 'local' (this device) or 'others' (every
    // OTHER device). Preview has only this one browser, so 'others' has nothing to do.
    async signOut({ scope = 'global' } = {}) {
      await wait(150);
      if (scope === 'others') return { error: null };
      removeStorage(SESSION_KEY);
      notify('SIGNED_OUT', null);
      return { error: null };
    },

    // Change password. Preview never really changes it — "preview" keeps working — but it gives
    // the same answers Supabase does for a too-short password, a missing or wrong current
    // password ("Require current password when updating password" is ON in Supabase), or an
    // unchanged password. Same order of checks as Supabase.
    async updateUser({ password, current_password: currentPassword } = {}) {
      await wait(FAKE_DELAY_MS);
      if (!loadSession()) return { data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 } };
      if (typeof password === 'string' && password.length < 12) {
        return {
          data: { user: null },
          error: { name: 'AuthWeakPasswordError', message: 'Password is too short', status: 422, code: 'weak_password', reasons: ['length'] },
        };
      }
      if (typeof password === 'string' && !currentPassword) {
        return {
          data: { user: null },
          error: { name: 'AuthApiError', message: 'Current password required when setting new password.', status: 400, code: 'current_password_required' },
        };
      }
      if (typeof password === 'string' && currentPassword !== PREVIEW_PASSWORD) {
        return {
          data: { user: null },
          error: { name: 'AuthApiError', message: 'Current password required when setting new password.', status: 400, code: 'current_password_invalid' },
        };
      }
      if (password === PREVIEW_PASSWORD) {
        return {
          data: { user: null },
          error: { name: 'AuthApiError', message: 'New password should be different from the old password.', status: 422, code: 'same_password' },
        };
      }
      return { data: { user: { id: FAKE_STAFF.id, email: FAKE_STAFF.email } }, error: null };
    },
  };

  // ----- Testing → Classes and ranks (mockTesting.js) -----

  const testing = createTestingBackend({
    loadStore: () => JSON.parse(readStorage(TESTING_KEY)), // missing/damaged → default data
    saveStore: (store) => writeStorage(TESTING_KEY, JSON.stringify(store)),
    now: () => Date.now(),
    newId: newUuid,
  });

  // ----- Schedule (mockSchedule.js) -----
  // Its classes come from the fake Testing tables above, like the real foreign key.
  const schedule = createScheduleBackend({
    loadStore: () => JSON.parse(readStorage(SCHEDULE_KEY)),
    saveStore: (store) => writeStorage(SCHEDULE_KEY, JSON.stringify(store)),
    now: () => Date.now(),
    newId: newUuid,
    getClasses: () => testing.snapshot().classes.map((c) => ({ id: c.id, location_code: c.location_code, name: c.name, position: c.position })),
    // Today in Massachusetts, 'YYYY-MM-DD' (the "en-CA" format happens to be exactly that).
    today: () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
  });

  // ----- Calendar (mockCalendar.js) -----
  // Its "some classes" closures look at the fake Schedule above, like the real function does.
  const calendar = createCalendarBackend({
    loadStore: () => JSON.parse(readStorage(CALENDAR_KEY)),
    saveStore: (store) => writeStorage(CALENDAR_KEY, JSON.stringify(store)),
    now: () => Date.now(),
    newId: newUuid,
    getSchedule: () => schedule.snapshot(),
    getClasses: () => testing.snapshot().classes.map((c) => ({ id: c.id, location_code: c.location_code, name: c.name })),
    today: () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
  });

  // ----- Forms (mockForms.js) -----
  // Its free-class times come from the fake Schedule and Calendar above, like the real functions.
  const forms = createFormsBackend({
    loadStore: () => JSON.parse(readStorage(FORMS_KEY)),
    saveStore: (store) => writeStorage(FORMS_KEY, JSON.stringify(store)),
    now: () => Date.now(),
    newId: newUuid,
    getSchedule: () => schedule.snapshot(),
    getCalendar: () => calendar.snapshot(),
    getClasses: () => testing.snapshot().classes.map((c) => ({ id: c.id, location_code: c.location_code, name: c.name })),
    getSchoolPhone: (code) => { try { return JSON.parse(readStorage(TESTING_KEY))?.locations?.find?.((l) => l.code === code)?.phone ?? null; } catch { return null; } }, // 0019
    today: () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
  });

  // ----- Events, roster with payments, Settings → Schools (mockTestingEvents.js) -----
  // Same store as Classes and ranks (the event copies classes from it).
  const events = createEventsBackend({
    readBase: () => testing.snapshot(),
    saveStore: (store) => writeStorage(TESTING_KEY, JSON.stringify(store)),
    now: () => Date.now(),
    today: previewToday, // the real school date, or the one set with setToday
    newId: newUuid,
  });
  // failNextSave arms this; the next Testing or Events save then fails (whichever comes first).
  let failNextTesting = false;
  // failSavesUntilRetry turns this on and reconnect turns it off: while on, every Events save
  // fails like a dropped connection. Kept in memory only (a reload brings the "connection" back).
  let eventSavesOffline = false;

  // ----- Star testing → Rubrics and prices (mockStarTesting.js) -----
  // Its own store (STAR_STORE_KEY), apart from Color Belt's. failNextSave('star') arms its own flag.
  const star = createStarBackend({
    loadStore: () => JSON.parse(readStorage(STAR_STORE_KEY)), // missing/damaged → the seed (0006)
    saveStore: (store) => writeStorage(STAR_STORE_KEY, JSON.stringify(store)),
    now: () => Date.now(),
    newId: newUuid,
  });
  // Star testing events (mockStarEvents.js): the same store as Rubrics and prices, so Add event can
  // copy the template as it is at that moment. Its seed is the candidates fake's (phase 3), so the
  // events and the candidates always come from the same seed.
  const starEvents = createStarEventsBackend({
    readBase: () => star.snapshot(),
    saveStore: (store) => writeStorage(STAR_STORE_KEY, JSON.stringify(store)),
    now: () => Date.now(),
    today: previewToday, // the real school date, or the one set with setToday
    newId: newUuid,
    seed: defaultStarCandidatesData,
    seedIsCurrent: starCandidatesSeedIsCurrent,
  });
  // Star testing candidates and payments (mockStarCandidates.js): the same store again; it also
  // answers the star_roster view (the Events counts and Delete event read it too).
  const starCandidates = createStarCandidatesBackend({
    readBase: () => starEvents.snapshot(),
    saveStore: (store) => writeStorage(STAR_STORE_KEY, JSON.stringify(store)),
    now: () => Date.now(),
    today: previewToday,
    newId: newUuid,
  });
  // failNextSave('star') arms this; the next Star save then fails (rubrics, events or candidates,
  // whichever comes first).
  let failNextStar = false;

  // The fake network time for Testing calls (setTestingDelay saves it so it survives a reload).
  function testingDelay() {
    const saved = readStorage(TESTING_DELAY_KEY);
    const ms = Number(saved);
    return saved !== null && Number.isFinite(ms) && ms >= 0 ? ms : TESTING_DELAY_MS;
  }

  // supabase.from(table) — the app can only READ tables (like the real permissions).
  // Usage: await supabase.from('testing_ranks').select('id, name').eq('location_code', 'worcester').order('position')
  function from(table) {
    const query = { columns: '*', filters: [], orders: [], write: false };
    const refuseWrite = () => {
      query.write = true; // writing straight to a table is refused (no write permission)
      return builder;
    };
    const builder = {
      select(columns = '*') {
        query.columns = columns;
        return builder;
      },
      eq(col, value) {
        query.filters.push({ col, value });
        return builder;
      },
      // (lte / gte / in: used by the Calendar's date-range reads, mockCalendar.js)
      lte(col, value) {
        query.filters.push({ col, value, op: 'lte' });
        return builder;
      },
      gte(col, value) {
        query.filters.push({ col, value, op: 'gte' });
        return builder;
      },
      in(col, values) {
        query.filters.push({ col, value: values, op: 'in' });
        return builder;
      },
      order(col, { ascending = true } = {}) {
        query.orders.push({ col, ascending });
        return builder;
      },
      insert: refuseWrite,
      update: refuseWrite,
      upsert: refuseWrite,
      delete: refuseWrite,
      // "await builder" runs the query — that's what makes it a "thenable", like the real one.
      then(resolve, reject) {
        const run = async () => {
          await wait(testingDelay());
          if (query.write) {
            return { data: null, error: { code: '42501', message: `permission denied for table ${table}`, details: null, hint: null }, status: 403 };
          }
          if (table.startsWith('schedule_')) return schedule.select(table, query.columns, query.filters, query.orders, testingContext());
          if (table.startsWith('calendar_')) return calendar.select(table, query.columns, query.filters, query.orders, testingContext());
          if (table === 'forms' || table.startsWith('form_') || table === 'prospect_statuses') return forms.select(table, query.columns, query.filters, query.orders, testingContext());
          // Phase 2 tables (and locations, which gained the address columns) → mockTestingEvents.js.
          if (EVENT_TABLES.includes(table)) return events.select(table, query.columns, query.filters, query.orders, testingContext());
          // Star testing's roster view and make-up subjects → mockStarCandidates.js (checked before
          // the events, which list star_roster too for their own phase 2 checks).
          if (STAR_CANDIDATE_TABLES.includes(table)) return starCandidates.select(table, query.columns, query.filters, query.orders, testingContext());
          // Star testing's events and their copies → mockStarEvents.js.
          if (STAR_EVENT_TABLES.includes(table)) return starEvents.select(table, query.columns, query.filters, query.orders, testingContext());
          // Star testing's four rubric tables → mockStarTesting.js.
          if (STAR_TABLES.includes(table)) return star.select(table, query.columns, query.filters, query.orders, testingContext());
          return testing.select(table, query.columns, query.filters, query.orders, testingContext());
        };
        return run().then(resolve, reject);
      },
    };
    return builder;
  }

  // ----- Finance (mockFinance.js) -----
  // Reads the Color Belt payments from the Testing store above; keeps its own store for the rest.
  const finance = createFinanceBackend({
    loadStore: () => JSON.parse(readStorage(FINANCE_KEY)), // missing/damaged → the default sample
    saveStore: (store) => writeStorage(FINANCE_KEY, JSON.stringify(store)),
    readColorBelt: () => events.snapshot(),
    now: () => Date.now(),
    today: previewToday, // the real school date, or the one set with setToday
    newId: newUuid,
  });

  // ----- Staff accounts (mockStaff.js) -----

  const staffAccounts = createStaffBackend({
    loadStore: () => JSON.parse(readStorage(STAFF_ACCOUNTS_KEY)),
    saveStore: (rows) => writeStorage(STAFF_ACCOUNTS_KEY, JSON.stringify(rows)),
    me: () => ({ id: FAKE_STAFF.id, full_name: FAKE_STAFF.full_name, email: FAKE_STAFF.email, role: loadStaffState().role }),
  });

  // Who is asking, for mockStaff.js: like testingContext, plus 0004's 10-minute password rule.
  function staffContext() {
    const session = loadSession();
    const last = session ? getLastPasswordSignIn(session) : null;
    return {
      ...testingContext(),
      passwordWithin10Minutes: last !== null && Date.now() - last <= SET_PIN_PASSWORD_WINDOW_MS,
      isShared: Boolean(loadStaffState().isShared),
    };
  }

  // options: the real client's third argument; { get: true } sends a read-only GET request, which
  // the Star candidates fake refuses for functions that write (contract §7).
  async function rpc(name, args = {}, options = {}) {
    if (STAR_CANDIDATE_RPC_NAMES.includes(name)) {
      await wait(testingDelay());
      if (failNextStar && STAR_CANDIDATE_WRITE_RPC_NAMES.includes(name)) {
        failNextStar = false;
        starCandidates.failNextSave(); // this one save fails like a dropped connection
      }
      return starCandidates.rpc(name, args, testingContext(), options);
    }
    if (STAFF_RPC_NAMES.includes(name)) {
      await wait(FAKE_DELAY_MS);
      return staffAccounts.rpc(name, args, staffContext());
    }
    if (SCHEDULE_RPC_NAMES.includes(name)) {
      await wait(testingDelay());
      return schedule.rpc(name, args, testingContext());
    }
    if (CALENDAR_RPC_NAMES.includes(name)) {
      await wait(testingDelay());
      return calendar.rpc(name, args, testingContext());
    }
    if (FORMS_RPC_NAMES.includes(name)) {
      await wait(testingDelay());
      return forms.rpc(name, args, testingContext());
    }
    if (EVENT_RPC_NAMES.includes(name) || EVENT_RESTRICTED_RPC_NAMES.includes(name)) {
      await wait(testingDelay());
      if (eventSavesOffline && EVENT_RPC_NAMES.includes(name)) {
        // Like a dropped connection: no answer from the database, nothing changes.
        return { data: null, error: { message: 'Failed to fetch (preview: failSavesUntilRetry)' }, status: 0 };
      }
      if (failNextTesting && EVENT_RPC_NAMES.includes(name)) {
        failNextTesting = false;
        events.failNextSave();
      }
      return events.rpc(name, args, testingContext());
    }
    if (STAR_RPC_NAMES.includes(name) || STAR_EVENT_RPC_NAMES.includes(name)) {
      await wait(testingDelay());
      const backend = STAR_RPC_NAMES.includes(name) ? star : starEvents;
      if (failNextStar) {
        failNextStar = false;
        backend.failNextSave(); // this one call fails like a dropped connection
      }
      return backend.rpc(name, args, testingContext());
    }
    if (FINANCE_RPC_NAMES.includes(name)) {
      await wait(testingDelay());
      if (failNextTesting && FINANCE_WRITE_RPC_NAMES.includes(name)) {
        failNextTesting = false; // failNextSave: the next save fails, whichever section it is in
        finance.failNextSave();
      }
      return finance.rpc(name, args, testingContext());
    }
    if (name === 'has_data_access' || TESTING_RPC_NAMES.includes(name)) {
      await wait(testingDelay());
      if (failNextTesting && TESTING_RPC_NAMES.includes(name)) {
        failNextTesting = false;
        testing.failNextSave();
      }
      return testing.rpc(name, args, testingContext());
    }
    await wait(FAKE_DELAY_MS / 2);
    if (name === 'get_my_profile') return getMyProfile();
    if (name === 'touch_session') return touchSession();
    if (name === 'lock_session') return lockSession();
    if (name === 'verify_pin') return verifyPin(args.p_pin);
    if (name === 'set_my_pin') return setMyPin(args.p_pin);
    return { data: null, error: { message: `Preview mode has no function named ${name}` }, status: 404 };
  }

  // Rebuilds the saved session with a pretend password time, keeping the same session id.
  function pretendPasswordAge(ms) {
    const session = loadSession();
    if (!session) return false;
    const pretendSeconds = Math.floor((Date.now() - ms) / 1000);
    saveSession(makeSession(pretendSeconds, sessionIdOf(session)));
    return true;
  }

  // Console helpers for testing (see the top of this file).
  window.__tkdPreview = {
    kioskEndsIn(minutes = 0) {
      let entry = null;
      try {
        entry = JSON.parse(readStorage('tkd.kiosk'));
      } catch {
        entry = null;
      }
      if (!entry) return 'No kiosk on this tablet. Open one from Forms → Share → "Open kiosk mode on this device".';
      entry.expiresAt = Date.now() + Math.max(0, Number(minutes) || 0) * 60000;
      writeStorage('tkd.kiosk', JSON.stringify(entry));
      return `This kiosk now ends in ${minutes} minute(s). The welcome screen updates within a second.`;
    },
    lockNow() {
      setLockedFlag(true);
      return 'Locked (or signed out, if no PIN is set).';
    },
    setHasPin(value) {
      const staff = loadStaffState();
      staff.pin = value ? PREVIEW_PIN : null;
      saveStaffState(staff);
      return value
        ? `PIN is back to ${PREVIEW_PIN}.`
        : 'PIN removed. Reload to see Set your PIN, or lock to see the idle sign-out.';
    },
    setShared(value) {
      const staff = loadStaffState();
      staff.isShared = Boolean(value);
      saveStaffState(staff);
      return `is_shared is now ${staff.isShared}. Reload the page to see the account menu change.`;
    },
    setPasswordAgeDays(days) {
      if (!pretendPasswordAge(Number(days) * DAY_MS)) return 'Sign in first.';
      return `Password now looks ${days} day(s) old. Reload the page, or lock and enter the PIN, to see the 7-day rule.`;
    },
    setPasswordAgeMinutes(minutes) {
      if (!pretendPasswordAge(Number(minutes) * MINUTE_MS)) return 'Sign in first.';
      return `Password now looks ${minutes} minute(s) old. Saving a new PIN after 10 minutes needs the password again.`;
    },
    // ----- Testing helpers -----
    setRole(role) {
      if (role !== 'admin' && role !== 'staff') return "Use setRole('admin') or setRole('staff').";
      const staff = loadStaffState();
      staff.role = role;
      saveStaffState(staff);
      return `The preview account is now ${role === 'admin' ? 'an admin' : 'staff (view only)'}. Reload the page to see it.`;
    },
    // failNextSave()       → the next Color Belt Testing/Events save (and Reset password / PIN) fails.
    // failNextSave('star') → the next Star testing save (Rubrics and prices, events or candidates) fails.
    failNextSave(target) {
      if (target === 'star') {
        failNextStar = true;
        return 'The next Star testing save (Rubrics and prices, events, or candidates and payments) will fail like a dropped connection and change nothing.';
      }
      if (target !== undefined) return "Use failNextSave() for Color Belt and Staff accounts, or failNextSave('star') for Star testing.";
      failNextTesting = true;
      staffAccounts.failNext();
      return 'The next Testing save (and the next Reset password / Reset PIN) will fail like a dropped connection and change nothing.';
    },
    resetStaffAccounts() {
      staffAccounts.reset();
      return 'Staff accounts are back to the defaults (the desk is signed in on 3 devices). Reload the page to see them.';
    },
    simulateOtherAdminEdit() {
      testing.simulateOtherAdminEdit();
      events.simulateOtherAdminEdit();
      star.simulateOtherAdminEdit();
      starEvents.simulateOtherAdminEdit();
      return 'Another admin changed every class, rank, event, student and school address, and swapped two ranks — and changed Star testing\'s rubrics and prices, events and candidates. Open dialogs and Undo are now out of date.';
    },
    clearSchool(school) {
      if (!testing.clearSchool(school)) return "Use clearSchool('Worcester') or clearSchool('Shrewsbury').";
      return `Removed every class and rank at ${school}. Reload or switch schools to see the empty state.`;
    },
    failNextScheduleSave() {
      schedule.failNextSave();
      return 'The next Schedule save will fail like a dropped connection and change nothing.';
    },
    simulateOtherAdminEditSchedule() {
      schedule.simulateOtherAdminEdit();
      return 'Another admin changed every schedule row. Open dialogs and Undo are now out of date.';
    },
    clearSchedule(school) {
      if (!schedule.clearSchool(school)) return "Use clearSchedule('Worcester') or clearSchedule('Shrewsbury').";
      return `${school}'s schedules are removed. Reload or switch schools to see the empty Schedule.`;
    },
    resetSchedule() {
      schedule.reset();
      return 'Schedule is back to the sample week. Reload or switch schools to see it.';
    },
    failNextCalendarSave() {
      calendar.failNextSave();
      return 'The next Calendar save will fail like a dropped connection and change nothing.';
    },
    simulateOtherAdminEditCalendar() {
      calendar.simulateOtherAdminEdit();
      return 'Another admin changed every event, closure and event type. Open dialogs and Undo are now out of date.';
    },
    clearCalendar() {
      calendar.clear();
      return 'Every event and closure is removed (event types stay). Reload or change month to see it.';
    },
    resetCalendar() {
      calendar.reset();
      return 'The Calendar is back to the sample events and closures. Reload or change month to see them.';
    },
    failNextFormsSave() {
      forms.failNextSave();
      return 'The next Forms save will fail like a dropped connection and change nothing.';
    },
    simulateOtherAdminEditForms() {
      forms.simulateOtherAdminEdit();
      return 'Another admin changed every form. An open builder is now out of date.';
    },
    clearForms() {
      forms.clear();
      return 'Every form, sign-up and free-class booking is removed. Reload to see the empty Forms list.';
    },
    resetForms() {
      forms.reset();
      return 'Forms are back to the sample forms and sign-ups. Reload to see them.';
    },
    resetTesting() {
      testing.reset();
      events.reset();
      star.reset();
      starEvents.reset(); // after star.reset(): it adds the seeded events and candidates to the fresh template
      return 'Testing is back to the default classes and ranks, the November Children Testing event with its students, and empty school addresses — and Star testing to its seed rubrics and prices, its three seeded events and their candidates and payments. Reload to see them.';
    },
    setTestingDelay(ms) {
      const value = Number(ms);
      if (!Number.isFinite(value) || value < 0) return 'Use a number of milliseconds, e.g. setTestingDelay(3000).';
      writeStorage(TESTING_DELAY_KEY, String(value));
      return `Each Testing call now takes ${value} ms, even after a reload. setTestingDelay(${TESTING_DELAY_MS}) is the normal speed.`;
    },
    // ----- Grading helpers (phase 3) -----
    failSavesUntilRetry() {
      eventSavesOffline = true;
      return 'Every Testing save now fails like a dropped Wi-Fi connection. Run __tkdPreview.reconnect() to bring it back.';
    },
    reconnect() {
      eventSavesOffline = false;
      // The page's automatic retry listens for the browser's "online" event; fire it now.
      window.dispatchEvent(new Event('online'));
      return 'Saves work again. Unsaved results save by themselves now (or press Retry).';
    },
    // ----- Finance helpers (mockFinance.js) -----
    setNow(hhmm) {
      if (!finance.setNow(hhmm ?? null)) return "Use setNow('19:30') (school time, 24-hour), or setNow(null) for the real time.";
      return hhmm ? `The school clock now says ${hhmm} for the Finance reminder (the date follows setToday). Reload Home to see it.` : 'Back to the real school time. Reload to see it.';
    },
    resetFinance() {
      finance.reset();
      return 'Finance is back to the sample: a few closed Shrewsbury days, the sample Star payments and refunds, reminder times Off, no exports. Reload to see it.';
    },
    // ----- Events / family form helpers (publicApi.preview.js) -----
    ...publicPreviewHelpers(),
    // ----- Public Forms page helpers (src/forms/publicApi.preview.js). forceRateLimited above
    // stays Color Belt's; the forms one is called forceFormsRateLimited here (on the /f/<name>
    // page itself it is plain forceRateLimited). -----
    setPublicForms: formsPublicPreviewHelpers().setPublicForms,
    forceTimeTaken: formsPublicPreviewHelpers().forceTimeTaken,
    forceFormChanged: formsPublicPreviewHelpers().forceFormChanged,
    forceFormsRateLimited: formsPublicPreviewHelpers().forceRateLimited,
  };

  return { auth, rpc, from };
}
