// mockClient.js — a FAKE backend used only in preview mode (npm run dev:preview-mode).
// Why it exists: so anyone can click through every screen — sign-in, Set your PIN, Home, the
// account menu, Change PIN, Change password, the lock screen — without a Supabase database.
// It copies the small part of the Supabase client the app uses — auth.signInWithPassword /
// getSession / onAuthStateChange / signOut / updateUser and rpc — and follows the same rules as
// the real database functions (migrations 0001 + 0002).
//
// Try it:  any email + password "preview" signs in as Jeffrey Berg (admin). PIN is 2580.
// Test helpers in the browser console (F12 → Console):
//   __tkdPreview.lockNow()                lock the screen right away
//   __tkdPreview.setHasPin(false)         remove the PIN (reload → Set your PIN; Lock now → signed out)
//   __tkdPreview.setShared(true)          pretend this is the shared front-desk account (then reload)
//   __tkdPreview.setPasswordAgeDays(8)    pretend the password was typed 8 days ago (then reload)
//   __tkdPreview.setPasswordAgeMinutes(11) pretend the password was typed 11 minutes ago
//                                         (Set PIN then needs the password again)
import { getLastPasswordSignIn, PASSWORD_MAX_AGE_MS, decodeJwtPayload } from './session.js';
import { setLockedFlag } from './useIdleLock.js';
import { readStorage, writeStorage, removeStorage } from './storage.js';
import { isFourDigits, isPinTooEasy } from './pinRules.js';

const SESSION_KEY = 'tkd.preview.session'; // the fake "signed in" session
const STAFF_STATE_KEY = 'tkd.preview.staffState'; // fake staff row: PIN, shared flag
const SESSION_STATE_KEY = 'tkd.preview.sessionState'; // fake per-session rows: PIN tries, unlocked-until
const OLD_PIN_STATE_KEY = 'tkd.preview.pinState'; // used by the first build; cleaned up below

const PREVIEW_PASSWORD = 'preview';
const PREVIEW_PIN = '2580'; // not too easy: 1234 is refused by the weak-PIN rule now
const MAX_PIN_TRIES = 5;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SET_PIN_PASSWORD_WINDOW_MS = 10 * MINUTE_MS; // set_my_pin wants a password sign-in this recent
const FAKE_DELAY_MS = 400; // pretend the network takes a moment, so "Signing in…" is visible

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

function loadStaffState() {
  try {
    const saved = JSON.parse(readStorage(STAFF_STATE_KEY));
    if (saved) return saved;
  } catch {
    // fall through to the default below
  }
  return { pin: PREVIEW_PIN, isShared: false };
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

  async function rpc(name, args = {}) {
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
  };

  return { auth, rpc };
}
