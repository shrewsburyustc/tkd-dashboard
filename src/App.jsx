// App.jsx — the "brain" of the dashboard: decides which screen is showing.
// Why it exists: the app is always in exactly one of five states (the `phase`):
//   'loading'   → checking for a saved sign-in (shows nothing for a split second)
//   'signedOut' → SignIn screen
//   'setPin'    → Set your PIN (right after a password sign-in when the account has no PIN)
//   'home'      → the dashboard (Shell + the open page: Home, Testing, or — admins, from the account
//                 menu — Staff accounts or Settings), maybe with a dialog on top
//   'locked'    → LockScreen (the dashboard stays in memory, hidden, behind it) — or, while this
//                 tablet is the front-desk KIOSK (Share → "Open kiosk mode on this device",
//                 src/lib/kiosk.js), the kiosk (src/screens/kiosk/KioskApp.jsx, loaded only then):
//                 the dashboard is locked the same way, and the kiosk's PIN pad is the lock
//                 screen's own check. Leaving it forgets the kiosk and reloads the page.
// Pages have their own address ("#testing", "#staff-accounts"; rulebook v0.83) so the browser's
// Back / Forward, reload and bookmarks work per page — see "Browser Back / Forward" below.
// Phase 2 adds two: a testing event's page ("#testing/event/<id>") and Settings ("#settings").
// Phase 3 adds the event page's Grading tab ("#testing/event/<id>/grading") and the leave guard:
// while grading results are "Not saved", leaving the event page asks first (contract 0010 §4.9).
// Star testing (v0.177, behind the build switch in lib/features.js) splits Testing into pages of
// its own: the chooser, Color Belt and Star testing (with the switch on, a Color Belt event lives at
// "#testing/color-belt/event/<id>" and its Grading tab at ".../grading"). Star testing phase 2 adds
// Star's tabs ("#testing/star" = Events, "#testing/star/rubrics") and a Star event's page
// ("#testing/star/event/<id>").
// Color Belt phase 4 adds a private testing's grading page ("#testing/private/<id>", or with the
// switch on "#testing/color-belt/private/<id>"; contract 0014 §5.1); leaving it is guarded the same way.
// Camps (contract 0013 §6.1) adds "#camps", "#camps/templates" and a camp's page
// ("#camps/camp/<id>", with "/checkin", "/payments" or "/attendance" for its tabs).
// Finance (contract 0011 §4) adds three: the Daily report ("#finance"), History ("#finance/history")
// and Finance → Settings ("#finance/settings") — the last two for admins only (staff are sent to
// "#finance"). While "Hide private details" is on for this device (v0.215, renamed v0.506), every "#finance…" address
// goes to Home and Finance is left out of the rail.
// Every address lives in lib/pageAddress.js.
//
// Every screen change goes through the small functions below, so the rules (7-day password
// check, access check, per-account idle lock, the database lock) live in one readable place.
//
// The database lock (migration 0002): besides the lock screen, the database keeps its own
// "unlocked / locked" record for this sign-in. We ask it on load and sign-in (touch_session),
// keep it fresh while someone is active (useSessionHeartbeat), tell it whenever the lock screen
// shows (lock_session — sent again after reconnecting if it failed), and a right PIN unlocks it
// (verify_pin / set_my_pin do that on their side).
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isPreview } from './lib/supabase.js';
import { isPasswordTooOld } from './lib/session.js';
import { classifySignInError } from './lib/authErrors.js';
import { getIdleLimitMs, markActivityNow, setLockedFlag, shouldBeLocked, useIdleLock } from './lib/useIdleLock.js';
import { lockSession, touchSession } from './lib/serverLock.js';
import { useSessionHeartbeat } from './lib/useSessionHeartbeat.js';
import { LOCATION_CODE, loadDeviceLocation, saveDeviceLocation } from './lib/device.js';
import { prospectsBadge } from './lib/prospects/api.js';
import {
  addressFor,
  addressForRoute,
  correctedAddress,
  DEFAULT_TESTING_PAGE,
  hasAddressTabs,
  normalEventTab,
  routeTab,
  routeFromAddress,
  routeIsUnknown,
  samePage,
  sameRoute,
} from './lib/pageAddress.js';
import { STAR_TESTING_ON } from './lib/features.js';
import { backIsClaimed, isLeftoverDialogStep } from './lib/backButton.js';
import PreviewBanner from './components/PreviewBanner.jsx';
import Shell from './components/Shell.jsx';
import Toast from './components/Toast.jsx';
import SignIn from './screens/SignIn.jsx';
import Home from './screens/Home.jsx';
import Testing from './screens/Testing.jsx';
import Camps from './screens/Camps.jsx';
import Schedule from './screens/Schedule.jsx';
import Calendar from './screens/Calendar.jsx';
import Forms from './screens/Forms.jsx';
import Prospects from './screens/Prospects.jsx';
import Finance from './screens/Finance.jsx';
import { showToday, showMonthOf } from './screens/finance/financeState.js';
import { usePaymentsHidden } from './screens/finance/usePaymentsHidden.js';
import { showFinanceInNav } from './components/navItems.js';
import StaffAccounts from './screens/StaffAccounts.jsx';
import Settings from './screens/Settings.jsx';
import LockScreen from './screens/LockScreen.jsx';
import { clearKiosk, readKiosk } from './lib/kiosk.js';
import KioskLoadGuard from './screens/kiosk/KioskLoadGuard.jsx';
import SetPinScreen from './screens/SetPinScreen.jsx';
import ChangePinDialog from './screens/ChangePinDialog.jsx';
import ChangePasswordDialog from './screens/ChangePasswordDialog.jsx';
// The kiosk is a separate download, fetched only when a tablet becomes a kiosk.
const KioskApp = lazy(() => import('./screens/kiosk/KioskApp.jsx'));

// Messages shown on the sign-in screen after the App signs someone out.
const NOTICES = {
  passwordAgain: 'For security, sign in with your password again.',
  noAccess: "This account doesn't have dashboard access. Ask an admin.",
  unlockWithPassword: 'Sign in with your password to unlock.',
  loadFailed: "Couldn't load your account. Check the connection and try again.",
  // No PIN = no lock screen: going idle (or Lock now) signs out instead (decided v0.26).
  idleNoPin: 'Signed out after being idle. Set a PIN to unlock faster.',
  // set_my_pin wants a password sign-in in the last 10 minutes.
  setPinPassword: 'Sign in with your password again to set your PIN.',
};

// The browser tab title for each phase.
const PAGE_TITLES = {
  loading: 'U.S. Taekwondo Center',
  signedOut: 'Sign in · U.S. Taekwondo Center',
  setPin: 'Set your PIN · U.S. Taekwondo Center',
  home: 'Home · U.S. Taekwondo Center',
  locked: 'Locked · U.S. Taekwondo Center',
};

// While the dashboard is open ('home' phase) the title names the open section instead.
const SECTION_TITLES = {
  home: 'Home · U.S. Taekwondo Center',
  testing: 'Testing · U.S. Taekwondo Center',
  camps: 'Camps · U.S. Taekwondo Center',
  schedule: 'Schedule · U.S. Taekwondo Center',
  calendar: 'Calendar · U.S. Taekwondo Center',
  forms: 'Forms · U.S. Taekwondo Center',
  prospects: 'Prospects · U.S. Taekwondo Center',
  finance: 'Finance · U.S. Taekwondo Center',
  staffAccounts: 'Staff accounts · U.S. Taekwondo Center',
  settings: 'Settings · U.S. Taekwondo Center',
};
// Testing's own pages while the Star testing switch is on (v0.177). The chooser keeps "Testing".
const TESTING_PAGE_TITLES = {
  colorBelt: 'Color belt testing · U.S. Taekwondo Center',
  star: 'Star testing · U.S. Taekwondo Center',
};

// Toast texts (guidelines 8: 5 seconds, bottom-right — bottom-center on phones — no Undo for these).
const TOASTS = {
  pinSet: 'PIN set',
  pinChanged: 'PIN changed',
  passwordChanged: 'Password changed',
};

// ----- Page addresses -----
// lib/pageAddress.js reads and writes every address (Home, Testing and its pages, a Color Belt
// event and its Grading tab, a private testing's grading page (Color Belt phase 4), a Star event,
// Camps and a camp's page, Staff accounts, Settings, Finance and its views). A "route" is
// { section, testingPage, eventId, eventTab, privateId } — see the top of that file. (Finance keeps
// its view, 'report' | 'history' | 'settings', in the eventTab slot; Camps keeps the open camp's id
// in eventId and its tab — 'camps' | 'templates' on the list, 'default' | 'checkin' | 'payments' |
// 'attendance' on a camp's page — in eventTab, contract 0013 §6.1.)

// If telling the database "lock this sign-in" fails (offline), try again this often until it works.
const LOCK_RETRY_EVERY_MS = 30 * 1000;

// Asks the database "who am I?". Returns the staff row, or null if there isn't one.
// The row now also has idle_lock_minutes and is_shared (migration 0002).
async function fetchProfile() {
  const { data, error } = await supabase.rpc('get_my_profile');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data; // the function returns 0 or 1 rows
  return row ?? null;
}

// Removes Supabase's saved sign-in from this browser. Supabase stores it in localStorage
// under a key like "sb-<project id>-auth-token". Only used when a normal sign-out fails
// (usually because the device is offline).
function clearSavedSupabaseSession() {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be blocked (e.g. private browsing). Nothing more we can do here.
  }
}

export default function App() {
  const [phase, setPhase] = useState('loading');
  const [profile, setProfile] = useState(null); // the signed-in staff row
  const [notice, setNotice] = useState(null); // { id, text } for the sign-in screen
  const [deviceLocation, setDeviceLocation] = useState(loadDeviceLocation); // this device's default
  const [location, setLocation] = useState(loadDeviceLocation); // the switcher's current value
  // Which page is open: 'home' | 'testing' | 'camps' | 'schedule' | 'calendar' | 'forms' |
  // 'prospects' | 'finance' | 'staffAccounts' | 'settings'. Staff accounts isn't a rail section
  // (it opens from the account menu), so no rail item is highlighted while it shows (v0.76).
  // It starts from the address in the browser bar (v0.83): a reload, a bookmark or a link to
  // ".../#testing" opens Testing once the person is signed in and unlocked.
  const [section, setSection] = useState(() => routeFromAddress().section);
  // Which Testing page is open (only while section is 'testing'): 'chooser' | 'colorBelt' | 'star'.
  // With the Star testing switch off it is always 'colorBelt' (lib/features.js).
  const [testingPage, setTestingPage] = useState(() => routeFromAddress().testingPage);
  // The open Color Belt event (#testing/color-belt/event/<id>), or null for the Color Belt tabs.
  const [eventId, setEventId] = useState(() => routeFromAddress().eventId);
  // The event page's tab: 'students' | 'grading' (phase 3).
  const [eventTab, setEventTab] = useState(() => routeFromAddress().eventTab);
  // Phase 4: the open private testing (#testing/private/<id>), or null.
  const [privateId, setPrivateId] = useState(() => routeFromAddress().privateId);
  const [accountDialog, setAccountDialog] = useState(null); // null | 'changePin' | 'changePassword'
  const [testingModalOpen, setTestingModalOpen] = useState(false); // a Testing dialog is showing
  const [campsModalOpen, setCampsModalOpen] = useState(false); // a Camps dialog is showing
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false); // a Schedule dialog is showing
  const [calendarModalOpen, setCalendarModalOpen] = useState(false); // a Calendar dialog is showing
  const [formsModalOpen, setFormsModalOpen] = useState(false); // a Forms dialog is showing
  const [prospectsModalOpen, setProspectsModalOpen] = useState(false); // a Prospects dialog is showing
  const [prospectsCount, setProspectsCount] = useState(0); // the rail badge: new sign-ups I haven't opened (v0.244)
  const [staffModalOpen, setStaffModalOpen] = useState(false); // a Staff accounts dialog is showing
  const [settingsModalOpen, setSettingsModalOpen] = useState(false); // a Settings dialog is showing
  const [financeModalOpen, setFinanceModalOpen] = useState(false); // a Finance dialog is showing
  // This device's "Hide private details" switch (v0.215, renamed v0.506): Finance leaves the rail and its addresses go Home.
  const [paymentsHidden] = usePaymentsHidden();
  const [toast, setToast] = useState(null); // { id, text, action, icon } or null

  // Focus memory for the lock screen (see "Locking and unlocking" below).
  // `phaseRef` is a copy of `phase` that can be read instantly inside callbacks.
  // `focusBeforeLockRef` is null when there's nothing to restore, or { element } when the
  // screen locked — element is whatever had keyboard focus at that moment (or null).
  // Set your PIN uses it too: { element: null } = "focus the initials button when Home shows".
  const phaseRef = useRef(phase);
  const sectionRef = useRef(section); // same idea, for the Back / Forward listener below
  const testingPageRef = useRef(testingPage);
  const eventIdRef = useRef(eventId);
  const eventTabRef = useRef(eventTab);
  const privateIdRef = useRef(privateId);
  // The leave guard (contract 0010 §4.9): the open event page puts a function here while it is
  // open. fn(proceed) answers false = "nothing unsaved, go ahead", or true = "I asked the person
  // first" — the page then calls proceed() itself if they choose Leave anyway.
  const leaveGuardRef = useRef(null);
  // true while signOut() below is signing this tab out itself, so the SIGNED_OUT event that
  // Supabase sends back doesn't treat it as "signed out somewhere else" (which resets the address).
  const signingOutHereRef = useRef(false);
  const focusBeforeLockRef = useRef(null);
  // Same idea for the profile: showLock (below) needs the newest one without being re-created.
  const profileRef = useRef(profile);

  // showToast(text) for account toasts (check icon, no Undo).
  // showToast(text, { action: { label: 'Undo', onAction }, icon: false }) for Testing toasts.
  // A new toast replaces the old one, so only the newest Undo ever exists.
  const showToast = useCallback(
    (text, { action = null, icon = true } = {}) => setToast({ id: Date.now(), text, action, icon }),
    [],
  );
  const clearToast = useCallback(() => setToast(null), []);

  // ----- Signing out (used by the menu, the lock screen, and the rules below) -----
  const signOut = useCallback(async (noticeText = null) => {
    // Signing out on purpose (the menu's Sign out, "Not you? Sign out" — no notice) or because the
    // account has no access: the address goes back to Home, so the next person at this device
    // starts on Home and Back can't bring the previous person's page back (v0.83). An automatic
    // sign-out (7-day password rule, idle without a PIN …) keeps the address: after signing in
    // again the person lands where they were.
    if (noticeText === null || noticeText === NOTICES.noAccess) {
      window.history.replaceState(null, '', addressFor('home'));
      setSection('home');
      setTestingPage(null);
      setEventId(null);
      setPrivateId(null);
    }
    // A new id each time makes the SignIn screen start fresh (see `key` below).
    clearKiosk(); // a signed-out tablet is never a kiosk any more
    setNotice(noticeText ? { id: Date.now(), text: noticeText } : null);
    setProfile(null);
    setAccountDialog(null);
    setPhase('signedOut');
    signingOutHereRef.current = true;
    // scope: 'local' = sign out THIS device only. Staff often have the dashboard open on
    // several devices (front desk PC, mat-side tablet); signing out here leaves those alone.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    signingOutHereRef.current = false;
    // If the device is offline, Supabase can't confirm the sign-out and keeps the saved
    // sign-in. Remove it by hand so a reload can't bring the session back.
    if (error) clearSavedSupabaseSession();
    // Cleared AFTER signing out so other open tabs don't briefly unlock first.
    setLockedFlag(false);
  }, []);

  // ----- Entering the dashboard with a session (on page load, or right after sign-in) -----
  // isStale() lets a caller say "ignore the result, things have moved on".
  const enterWithSession = useCallback(
    async (session, isStale = () => false) => {
      // Rule: password must have been typed in the last 7 days.
      if (isPasswordTooOld(session)) {
        if (!isStale()) await signOut(NOTICES.passwordAgain);
        return;
      }

      let row;
      try {
        row = await fetchProfile();
      } catch {
        if (isStale()) return;
        // Keep the saved session (a reload will try again), but show why we're stuck.
        setNotice({ id: Date.now(), text: NOTICES.loadFailed });
        setPhase('signedOut');
        return;
      }
      if (isStale()) return;

      // Rule: must have an active staff row.
      if (!row || !row.active) {
        await signOut(NOTICES.noAccess);
        return;
      }

      // Ask the database lock about this sign-in. A brand-new password sign-in starts unlocked;
      // a session older than its idle time starts locked. ('error' = offline: the screen's own
      // checks below still decide.)
      const serverState = await touchSession();
      if (isStale()) return;
      if (serverState === 'password_required') {
        await signOut(NOTICES.passwordAgain);
        return;
      }

      setProfile(row);
      // Rule: a reload or a new tab can't skip the lock — and neither can the database's lock.
      const mustLock = serverState === 'locked' || shouldBeLocked(getIdleLimitMs(row));
      if (mustLock && !row.has_pin) {
        // No PIN means no lock screen: sign out instead (decided v0.26).
        await signOut(NOTICES.idleNoPin);
      } else if (mustLock) {
        // The database is told too (lock_session) as soon as the lock screen shows — see
        // "Tell the database" below. That matters when only THIS device knew it should lock
        // (saved locked flag, or idle too long) and the database still thought it was unlocked.
        setLockedFlag(true);
        focusBeforeLockRef.current = { element: null }; // nothing was focused yet: unlock → initials
        setPhase('locked');
      } else if (!row.has_pin) {
        setPhase('setPin'); // Set your PIN comes before Home, and can't be skipped
      } else {
        setPhase('home');
      }
    },
    [signOut],
  );

  // ----- On first load: is someone already signed in on this device? -----
  useEffect(() => {
    let stale = false; // becomes true if this effect is cleaned up before it finishes

    async function start() {
      let result;
      try {
        result = await supabase.auth.getSession(); // reads the saved sign-in (refreshes it if needed)
      } catch {
        result = { data: null, error: { name: 'AuthRetryableFetchError' } };
      }
      if (stale) return;
      const session = result.data?.session ?? null;
      if (!session) {
        // Only a network failure gets a message. (An expired or revoked sign-in just shows
        // the normal sign-in screen — there's nothing to fix but signing in.)
        if (result.error?.name === 'AuthRetryableFetchError') {
          setNotice({ id: Date.now(), text: NOTICES.loadFailed });
        }
        setPhase('signedOut');
        return;
      }
      await enterWithSession(session, () => stale);
    }
    start();

    // If the sign-in ends somewhere else (another tab signed out, session revoked), follow it.
    // Supabase asks us not to call other Supabase functions directly inside this callback.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // Signed out somewhere else (e.g. another tab): same as Sign out here — back to Home.
        // (Our own signOut() above decides the address itself, e.g. the 7-day rule keeps it.)
        if (!signingOutHereRef.current) {
          window.history.replaceState(null, '', addressFor('home'));
          setSection('home');
          setTestingPage(null);
          setEventId(null);
          setPrivateId(null);
        }
        setProfile(null);
        setAccountDialog(null);
        setPhase('signedOut');
      }
      // Rule: password every 7 days — also for a tab left open for days. Supabase refreshes
      // the sign-in about once an hour; each time, re-check the password age.
      if (event === 'TOKEN_REFRESHED' && session && isPasswordTooOld(session)) {
        // setTimeout(..., 0) runs signOut just AFTER this callback finishes, because signOut
        // calls Supabase (calling it from inside the callback can freeze the sign-in system).
        setTimeout(() => signOut(NOTICES.passwordAgain), 0);
      }
    });

    return () => {
      stale = true;
      data.subscription.unsubscribe();
    };
  }, [enterWithSession, signOut]);

  // ----- Sign-in screen hands us the email + password -----
  const handleSignIn = useCallback(
    async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data?.session) return { error: classifySignInError(error) };

      setLockedFlag(false); // a fresh password sign-in always starts unlocked
      markActivityNow();
      setLocation(loadDeviceLocation()); // each sign-in opens on this device's default
      setNotice(null);
      await enterWithSession(data.session);
      return { ok: true };
    },
    [enterWithSession],
  );

  // ----- Set your PIN -----
  // result: 'set' (saved) or 'alreadySet' (the database says a PIN already exists).
  const handlePinSet = useCallback(
    (result) => {
      setProfile((current) => (current ? { ...current, has_pin: true } : current));
      markActivityNow(); // they were just typing: don't let it count as idle time
      // The Set PIN card is about to disappear (and focus with it): put keyboard focus on the
      // initials button once Home shows, the same place a closed account dialog sends it.
      focusBeforeLockRef.current = { element: null };
      setPhase('home');
      if (result === 'set') showToast(TOASTS.pinSet);
    },
    [showToast],
  );

  // ----- Locking and unlocking -----
  // Keep the refs in step with the newest values (read by showLock below).
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Called whenever the saved "locked" flag turns on (idle, Lock now, another tab, or the
  // database said this session is locked).
  const showLock = useCallback(() => {
    if (phaseRef.current !== 'home') return; // only an open dashboard can lock
    // No PIN = no lock screen: sign out instead (decided v0.26).
    if (!profileRef.current?.has_pin) {
      signOut(NOTICES.idleNoPin);
      return;
    }
    // Remember what had keyboard focus (e.g. a button) so it can get focus back after unlocking.
    // Done BEFORE the dashboard is hidden — once hidden, the browser drops focus to the page.
    focusBeforeLockRef.current = { element: document.activeElement };
    setAccountDialog(null); // an open Change PIN / Change password closes (nothing is saved)
    // (The database is told by the "Tell the database" effect below, once the lock screen shows.)
    // The functional form setPhase(current => ...) means "only change it if we're where we expect".
    setPhase((current) => (current === 'home' ? 'locked' : current));
  }, [signOut]);
  const showHome = useCallback(() => setPhase((current) => (current === 'locked' ? 'home' : current)), []);

  useIdleLock({ phase, idleLimitMs: getIdleLimitMs(profile), onLock: showLock, onUnlock: showHome });

  // While the dashboard is open: tell the database "still here" (at most once a minute).
  useSessionHeartbeat({
    active: phase === 'home',
    onLocked: () => setLockedFlag(true), // the database already locked us: lock the screen too
    onPasswordRequired: () => signOut(NOTICES.passwordAgain),
  });

  const lockNow = useCallback(() => setLockedFlag(true), []); // the idle hook hears this and locks

  // The front-desk kiosk of this tablet (only while locked, and only for the account that opened
  // it). Leaving it: the right PIN on its pad → forget it, unlock as usual, then reload the page so
  // nothing of the kiosk (its screens, styles or the last family's answers) stays in memory.
  const kiosk = phase === 'locked' && profile !== null ? readKiosk(profile.id) : null;

  const handleUnlocked = useCallback(async () => {
    // Rule: password every 7 days. The tab may have sat on the lock screen past the 7 days, so
    // check again before showing Home. (The database's PIN check already looks at this too;
    // this is the screen-side copy of the same rule.)
    let session = null;
    try {
      const { data } = await supabase.auth.getSession();
      session = data?.session ?? null;
    } catch {
      // Couldn't read the sign-in: leave the decision to the database's check above.
    }
    if (session && isPasswordTooOld(session)) {
      await signOut(NOTICES.passwordAgain);
      return;
    }
    // (verify_pin's 'ok' already unlocked this sign-in on the database side.)
    markActivityNow(); // count the unlock as activity so it doesn't re-lock straight away
    setLockedFlag(false); // the idle hook hears this and shows Home
  }, [signOut]);

  const leaveKiosk = useCallback(async () => {
    clearKiosk();
    await handleUnlocked();
    window.location.reload();
  }, [handleUnlocked]);

  // After unlocking, give keyboard focus back to where it was before the lock. If that
  // control is gone (e.g. the "Lock now" menu item — the menu has closed), use the initials.
  useEffect(() => {
    if (phase === 'signedOut') focusBeforeLockRef.current = null; // nothing to restore any more
    if (phase !== 'home' || focusBeforeLockRef.current === null) return;
    const { element } = focusBeforeLockRef.current;
    focusBeforeLockRef.current = null;
    // isConnected = "is this element still on the page?" The page body itself doesn't count.
    if (element && element !== document.body && element.isConnected) {
      element.focus();
    } else {
      // The initials (account menu) button in the top bar; looked up by its class name.
      document.querySelector('.avatar-button')?.focus();
    }
  }, [phase]);

  // Each time the lock screen appears, re-read the profile (e.g. an admin just reset this
  // person's PIN, or switched their account off).
  useEffect(() => {
    if (phase !== 'locked') return undefined;
    let stale = false;
    fetchProfile()
      .then((row) => {
        if (stale) return;
        if (!row || !row.active) signOut(NOTICES.noAccess);
        else if (!row.has_pin) signOut(NOTICES.idleNoPin); // PIN removed: no lock screen without one
        else setProfile(row);
      })
      .catch(() => {
        // Offline: keep the profile we already have; the PIN check will report the problem.
      });
    return () => {
      stale = true;
    };
  }, [phase, signOut]);

  // Tell the database: each time the lock screen appears, lock this sign-in on the server too
  // (lock_session). One place for every way of locking: idle, Lock now, another tab, the
  // heartbeat, or a page load that opens on the lock screen. The screen is already locked and
  // never waits for this. If the call fails (offline), try again as soon as the browser says it's
  // back online ('online' event), and every 30 seconds meanwhile, until it works once.
  useEffect(() => {
    if (phase !== 'locked') return undefined;
    let done = false; // true once the database has it, or the lock screen has closed
    let sending = false; // a call is already on its way: don't send a second one on top
    let timer = null;

    function stop() {
      done = true;
      window.removeEventListener('online', send);
      window.clearInterval(timer);
    }

    async function send() {
      if (done || sending) return;
      sending = true;
      const ok = await lockSession();
      sending = false;
      if (ok) stop();
    }

    window.addEventListener('online', send);
    timer = window.setInterval(send, LOCK_RETRY_EVERY_MS);
    send();
    return stop; // unlocked or signed out: no more tries (a right PIN has unlocked the server)
  }, [phase]);

  // A toast belongs to the open dashboard: drop it if the screen locks or signs out.
  useEffect(() => {
    if (phase !== 'home') setToast(null);
  }, [phase]);

  // ----- Account dialogs (from the account menu) -----
  // name: 'changePin' | 'changePassword'. An old toast is dropped so it can't float over the
  // dialog (on a phone the dialog is a full page and the toast would hang in mid-air).
  const openAccountDialog = useCallback((name) => {
    setToast(null);
    setAccountDialog(name);
  }, []);
  const closeAccountDialog = useCallback(() => setAccountDialog(null), []);

  const handlePinChanged = useCallback(() => {
    setAccountDialog(null);
    setProfile((current) => (current ? { ...current, has_pin: true } : current));
    showToast(TOASTS.pinChanged);
  }, [showToast]);

  const handlePasswordChanged = useCallback(() => {
    setAccountDialog(null);
    showToast(TOASTS.passwordChanged);
  }, [showToast]);

  // ----- Location -----
  // A toast (and its Undo) belongs to the school it was made in: changing school drops it.
  const changeLocation = useCallback((newLocation) => {
    setToast(null);
    setLocation(newLocation);
  }, []);

  const handleDeviceLocationChange = useCallback(
    (newLocation) => {
      saveDeviceLocation(newLocation); // remembered by this device
      setDeviceLocation(newLocation);
      changeLocation(newLocation); // and the switcher moves to it
    },
    [changeLocation],
  );

  // ----- Sections (rail / bottom bar) -----
  // Same idea: a toast belongs to the section it was made in.
  // Each change of page is a step in the browser's history (v0.83), so Back / Forward walk
  // through the pages. Clicking the page you're already on adds nothing.
  // Options (all optional):
  //   testingPage: on Testing, which page: 'chooser' | 'colorBelt' | 'star'. Left out = Testing's
  //                default — the chooser while the Star testing switch is on, Color Belt while off.
  //   eventId:     on Color Belt or Star testing, the event whose page opens (null = the tabs); on
  //                Camps, the camp whose page opens (null = the list).
  //   eventTab:    the event page's tab, 'students' | 'grading' ('students' unless said otherwise —
  //                opening an event lands on Students; contract 0010 §4.1); on Star testing's
  //                home, 'events' (the default) | 'rubrics'; on Finance its view, 'report' (the
  //                default — the rail opens the Daily report) | 'history' | 'settings'; on Camps the
  //                list's 'camps' (the default) | 'templates', or a camp's 'default' | 'checkin' |
  //                'payments' | 'attendance'.
  //                `tab` is the same thing.
  //   privateId:   Color Belt phase 4 — the private testing whose grading page opens (null = none).
  //                It is always a Color Belt page, so asking for it opens Color Belt (an event id
  //                given with it wins: a page is either an event or a private testing, never both).
  //   replace:     true swaps the current step instead of adding one (used when an event page or a
  //                private testing's grading page closes by itself because it belongs to the other
  //                school — Back then doesn't bring it back).
  const navigate = useCallback(
    (id, { testingPage: nextPage = null, eventId: nextEventId = null, eventTab: nextTab, tab, privateId: nextPrivateId = null, replace = false } = {}) => {
      setToast(null);
      // Switch off: Testing has only the Color Belt page, whatever was asked for — and a Star event's
      // id is dropped, so it can never become a Color Belt event address.
      const starAskedWhileOff = !STAR_TESTING_ON && nextPage === 'star';
      // (Camps keeps its open camp's id in the same slot.)
      const nextEvent = (id === 'testing' && !starAskedWhileOff) || id === 'camps' ? nextEventId : null;
      // A private testing only opens on Testing, and never together with an event.
      const nextPrivate = id === 'testing' && !nextEvent && !starAskedWhileOff ? nextPrivateId : null;
      const askedPage = nextPrivate ? 'colorBelt' : nextPage;
      const page = id === 'testing' ? (STAR_TESTING_ON ? (askedPage ?? DEFAULT_TESTING_PAGE) : 'colorBelt') : null;
      const next = {
        section: id,
        testingPage: page,
        eventId: nextEvent,
        // The tab only means something on a page that has tabs (pageAddress.routeTab).
        eventTab: routeTab(id, page, nextEvent, nextTab ?? tab),
        privateId: nextPrivate,
      };
      const here = {
        section: sectionRef.current,
        testingPage: testingPageRef.current,
        eventId: eventIdRef.current,
        eventTab: eventTabRef.current,
        privateId: privateIdRef.current,
      };
      const changed = !sameRoute(next, here);
      // { tkdPage: true } marks the step as "added by the dashboard while signed in" (see below).
      // A Star private grading page's own step ({ tkdStarPrivate }, StarEventPage.jsx — same address
      // as its event) is replaced, not built on, so Back later never lands on an empty step.
      // (Star switch off: no such step can exist, and the live build leaves this check out.)
      const onPrivateStep = STAR_TESTING_ON && Boolean(window.history.state?.tkdStarPrivate);
      if (changed && (replace || onPrivateStep)) window.history.replaceState({ tkdPage: true }, '', addressForRoute(next));
      else if (changed) window.history.pushState({ tkdPage: true }, '', addressForRoute(next));
      setSection(next.section);
      setTestingPage(next.testingPage);
      setEventId(next.eventId);
      setEventTab(next.eventTab);
      setPrivateId(next.privateId);
    },
    [],
  );

  // ----- The leave guard (contract 0010 §4.9) -----
  const setLeaveGuard = useCallback((fn) => {
    leaveGuardRef.current = fn;
  }, []);
  // Runs `action` now, unless the open event page has grading results that aren't saved: then it
  // asks first ("2 results aren't saved") and runs the action only on "Leave anyway".
  // Only for steps the PERSON starts; automatic sign-outs and the screen lock are never asked.
  const guarded = useCallback((action) => {
    const fn = leaveGuardRef.current;
    if (fn && fn(action)) return;
    action();
  }, []);

  // The event page's ways in and out (Testing.jsx → EventsTab / EventPage).
  const openEvent = useCallback((id) => navigate('testing', { testingPage: 'colorBelt', eventId: id }), [navigate]);
  // { replace: true } = the page closes itself (its event belongs to the other school, after a
  // school change that was already guarded) — not asked again.
  const closeEvent = useCallback(
    (options) => {
      const go = () => navigate('testing', { ...options, testingPage: 'colorBelt', eventId: null });
      if (options?.replace) go();
      else guarded(go);
    },
    [navigate, guarded],
  );
  // Color Belt phase 4: a private testing's grading page (always on the Color Belt page). Opening it
  // is a normal step; closing it is guarded like closing the event page ({ replace: true } = the
  // page closes itself after a guarded school change — not asked again). Closing lands back on
  // Color Belt (Testing.jsx shows its Private testing tab).
  const openPrivate = useCallback((id) => navigate('testing', { testingPage: 'colorBelt', privateId: id }), [navigate]);
  const closePrivate = useCallback(
    (options) => {
      const go = () => navigate('testing', { ...options, testingPage: 'colorBelt', eventId: null, privateId: null });
      if (options?.replace) go();
      else guarded(go);
    },
    [navigate, guarded],
  );
  // Star testing's event page (phase 2): in and out, the same way.
  const openStarEvent = useCallback((id) => navigate('testing', { testingPage: 'star', eventId: id }), [navigate]);
  const closeStarEvent = useCallback(() => guarded(() => navigate('testing', { testingPage: 'star', eventId: null })), [navigate, guarded]);
  // Students ↔ Grading (a Color Belt event page) and Events ↔ Rubrics and prices (Star testing's
  // home): the same page, so never guarded, and no new history step (Back still leaves the page;
  // a reload keeps the tab).
  const changeEventTab = useCallback((tab) => {
    const route = {
      section: 'testing',
      testingPage: testingPageRef.current,
      eventId: eventIdRef.current,
      eventTab: tab,
      privateId: privateIdRef.current,
    };
    const nextTab = normalEventTab(route.testingPage, route.eventId, tab);
    if (hasAddressTabs(route)) {
      window.history.replaceState(window.history.state, '', addressForRoute({ ...route, eventTab: nextTab }));
    }
    setEventTab(nextTab);
  }, []);
  // Moving between Testing's own pages: the chooser's rows, "← Testing", Star's back link. Guarded
  // like every other way off a Color Belt event page (the guard is only set while one is open).
  const openTestingPage = useCallback((page) => guarded(() => navigate('testing', { testingPage: page })), [navigate, guarded]);

  // The Camps section's ways in and out (Camps.jsx → CampsTab / CampPage).
  // campSchoolFollow: the camp opened from a Finance payment ("Open in Camps"). A camp payment can be
  // paid at the other school, so the switcher isn't moved to the payment's school; instead, if the
  // camp isn't shown on the current school, its page moves the switcher to the camp's own school
  // once (CampPage.jsx) rather than going back to the list. null = a normal opening.
  const [campSchoolFollow, setCampSchoolFollow] = useState(null);
  const openCamp = useCallback((id) => {
    setCampSchoolFollow(null);
    navigate('camps', { eventId: id, tab: 'default' });
  }, [navigate]);
  // { replace: true } = the page closes itself (the camp is for the other school, or was deleted).
  const closeCamp = useCallback((options) => {
    setCampSchoolFollow(null);
    navigate('camps', { ...options, eventId: null, tab: 'camps' });
  }, [navigate]);
  // Camps | Templates, and Check in | Payments | Attendance: the same page, so no new history step
  // (Back still leaves the page; a reload keeps the tab).
  const changeCampTab = useCallback((tab) => {
    const next = routeTab('camps', null, eventIdRef.current, tab);
    const route = { section: 'camps', testingPage: null, eventId: eventIdRef.current, eventTab: next, privateId: null };
    window.history.replaceState(window.history.state, '', addressForRoute(route));
    setEventTab(next);
  }, []);

  // ----- Browser Back / Forward (rulebook v0.83) -----
  // 'popstate' = the browser moved to another step of its history (Back, Forward, or an address
  // typed by hand). Read the page from the new address and follow it — except:
  //   - same page as now: nothing to do (e.g. the step an open dialog added, Dialog.jsx);
  //   - locked: nothing may change behind the lock screen, so put the current page's address
  //     back and stay put;
  //   - not in the dashboard (sign-in, Set your PIN): Back onto a step the dashboard added while
  //     someone was signed in ({ tkdPage: true }) is refused — the address is tidied to Home, so
  //     nobody can return to the previous person's page. A link or address typed by hand (no
  //     marker) is kept: after signing in, that page opens.
  useEffect(() => {
    sectionRef.current = section;
    testingPageRef.current = testingPage;
    eventIdRef.current = eventId;
    eventTabRef.current = eventTab;
    privateIdRef.current = privateId;
  }, [section, testingPage, eventId, eventTab, privateId]);
  // Once someone is in the dashboard, the step they're on counts as "added while signed in" too —
  // also when they arrived by a bookmark or a link — so Back on a later sign-in screen can't
  // return to it (see below).
  useEffect(() => {
    if (phase === 'home' && !window.history.state?.tkdPage && !window.history.state?.tkdDialog) {
      window.history.replaceState({ ...(window.history.state ?? {}), tkdPage: true }, '');
    }
  }, [phase, section, testingPage, eventId, privateId]);
  useEffect(() => {
    // An address we don't know (e.g. "#xyz") shows Home; tidy the bar to match.
    if (routeIsUnknown()) window.history.replaceState(null, '', addressFor('home'));
    // An old address (e.g. a bookmark of #testing/event/<id> from before v0.177) is corrected in
    // place — replaced, not added — so Back never lands on the old form.
    const fixed = correctedAddress();
    if (fixed) window.history.replaceState(window.history.state, '', fixed);
    // A reload while a dialog was open lands on that dialog's step; no dialog is open now, so it
    // becomes a plain page step (otherwise Forward could get stuck on it).
    if (window.history.state?.tkdDialog) window.history.replaceState({ tkdPage: true }, '');
    function handlePopState() {
      // Forward landed on the step of a dialog that's already closed: step off it again, so
      // nobody needs an extra Back for nothing.
      if (isLeftoverDialogStep(window.history.state)) {
        window.history.back();
        return;
      }
      const route = routeFromAddress();
      const target = route.section;
      if (routeIsUnknown()) window.history.replaceState(null, '', addressFor(target));
      const fixed = correctedAddress(); // an old address typed by hand: corrected in place
      if (fixed) window.history.replaceState(window.history.state, '', fixed);
      const current = {
        section: sectionRef.current,
        testingPage: testingPageRef.current,
        eventId: eventIdRef.current,
        eventTab: eventTabRef.current,
        privateId: privateIdRef.current,
      };
      // (samePage: on Finance a different view — Daily report / History / Settings — is a different page;
      // a private testing's grading page is a page of its own, apart from the Color Belt tabs.)
      if (samePage(route, current)) {
        // Same page; only the event tab may differ (an address typed by hand): switch it, never asked.
        // (Camps: also Camps ↔ Templates on the list, and a camp's tabs — hasAddressTabs.)
        if (hasAddressTabs(route) && route.eventTab !== eventTabRef.current && phaseRef.current === 'home') setEventTab(route.eventTab);
        return;
      }
      const here = addressForRoute(current);
      // The account menu is open: Back closes it (AccountMenu.jsx) and the page stays.
      if (backIsClaimed()) {
        window.history.pushState({ tkdPage: true }, '', here);
        return;
      }
      if (phaseRef.current === 'home') {
        // Leaving an event page with unsaved grading results: ask first, and put the current
        // address back (contract 0010 §4.9). "Leave anyway" goes where Back / Forward pointed.
        const fn = leaveGuardRef.current;
        if (fn && fn(() => navigate(target, route))) { // route carries testingPage, eventId, eventTab, privateId
          window.history.pushState({ tkdPage: true }, '', here);
          return;
        }
        setToast(null);
        setSection(target);
        setTestingPage(route.testingPage);
        setEventId(route.eventId);
        setEventTab(route.eventTab);
        setPrivateId(route.privateId);
      } else if (phaseRef.current === 'locked') {
        window.history.pushState({ tkdPage: true }, '', here);
      } else if (window.history.state?.tkdPage) {
        window.history.replaceState(null, '', addressFor('home'));
        setSection('home');
        setTestingPage(null);
        setEventId(null);
        setPrivateId(null);
      } else {
        setSection(target); // a link or typed address: opens after signing in
        setTestingPage(route.testingPage);
        setEventId(route.eventId);
        setEventTab(route.eventTab);
        setPrivateId(route.privateId);
      }
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigate]);

  // ----- Testing helpers -----
  // Re-read "who am I?" — e.g. the database said "not allowed", so this person may no longer be
  // an admin. Offline: keep the profile we have.
  const refreshProfile = useCallback(async () => {
    try {
      const row = await fetchProfile();
      if (row && row.active) setProfile(row);
    } catch {
      // ignore — see above
    }
  }, []);

  // The database refused data because this sign-in is locked on its side: lock the screen too.
  const handleNoAccess = useCallback(() => setLockedFlag(true), []);

  // ----- Finance helpers (contract 0011 §4) -----
  // The Finance view ('report' | 'history' | 'settings') lives in eventTab while Finance is open.
  const changeFinanceView = useCallback((view) => navigate('finance', { tab: view }), [navigate]);
  // Home's reminder lines: "Close the day" opens today's report of that school; "Open History"
  // opens History for the school chosen now (Both → History on Both) at the month of the first
  // unclosed day.
  const openFinanceReport = useCallback(
    (school) => {
      showToday({ openClose: true }); // v0.800: the report AND the Close the day dialog
      if (school && school !== location) changeLocation(school);
      navigate('finance', { tab: 'report' });
    },
    [location, changeLocation, navigate],
  );
  const openFinanceHistory = useCallback((firstDay) => {
    showMonthOf(firstDay);
    navigate('finance', { tab: 'history' });
  }, [navigate]);
  // A payment's "Open in Testing" (D12), on that payment's school: a Color belt payment opens its
  // event's roster (a Color Belt event page). A Star payment opens Testing (the chooser while the
  // Star testing switch is on).
  const openTestingFor = useCallback(
    (school, eventId = null, source = null) => {
      // A camp payment's detail opens the camp's page in Camps (Camps v0.707) WITHOUT moving the
      // switcher to the payment's school (see campSchoolFollow above).
      if (source === 'camp') {
        setCampSchoolFollow(eventId ?? null);
        navigate('camps', { eventId: eventId ?? null, tab: eventId ? 'payments' : 'camps' });
        return;
      }
      if (school && school !== 'Both' && school !== location) changeLocation(school);
      if (source === 'color_belt' && eventId) navigate('testing', { testingPage: 'colorBelt', eventId });
      else navigate('testing');
    },
    [location, changeLocation, navigate],
  );
  const isAdminNow = profile?.role === 'admin';
  // Who may be where: private details hidden → no Finance at all (Home instead); staff → no History or
  // Settings (the Daily report instead). replaceState swaps the address without a history step.
  useEffect(() => {
    if (phase !== 'home' || section !== 'finance' || !profile) return;
    if (paymentsHidden) {
      window.history.replaceState({ tkdPage: true }, '', addressFor('home'));
      setSection('home');
      setEventTab('students');
    } else if (!isAdminNow && eventTab !== 'report') {
      window.history.replaceState({ tkdPage: true }, '', addressForRoute({ section: 'finance', testingPage: null, eventId: null, eventTab: 'report' }));
      setEventTab('report');
    }
  }, [phase, section, eventTab, paymentsHidden, isAdminNow, profile]);

  // Keep the browser tab title in step with the screen (and, on the dashboard, the section).
  useEffect(() => {
    const testingTitle = section === 'testing' && STAR_TESTING_ON ? TESTING_PAGE_TITLES[testingPage] : null;
    document.title = phase === 'home' ? (testingTitle ?? SECTION_TITLES[section]) : PAGE_TITLES[phase];
  }, [phase, section, testingPage]);

  // ----- Drawing -----
  const isSignedIn = (phase === 'home' || phase === 'locked') && profile !== null;

  // The Prospects badge (rulebook v0.236; per person, v0.244): the New / Booked prospects of the
  // school in the switcher (both on Both) this person hasn't opened. Refreshed when the page or
  // school changes, after Prospects changes something, and every 2 minutes while unlocked.
  const badgeLocation = location === 'Both' ? null : LOCATION_CODE[location] ?? null;
  const refreshBadge = useCallback(async () => {
    const res = await prospectsBadge(badgeLocation);
    if (res.status === 'ok') setProspectsCount(res.count);
  }, [badgeLocation]);
  useEffect(() => {
    if (phase !== 'home' || profile === null) return undefined;
    refreshBadge();
    const timer = window.setInterval(refreshBadge, 120000);
    return () => window.clearInterval(timer);
  }, [phase, profile, section, refreshBadge]);
  const dialogOpen = phase === 'home' && profile !== null && accountDialog !== null;
  // The page behind a dialog can't be clicked or reached with Tab (account or Testing dialog).
  const shellInert = dialogOpen || (phase === 'home' && (testingModalOpen || campsModalOpen || scheduleModalOpen || calendarModalOpen || formsModalOpen || prospectsModalOpen || staffModalOpen || settingsModalOpen || financeModalOpen));
  // Finance is in the rail / bottom bar unless payments are hidden on this device (navItems.js).
  showFinanceInNav(!paymentsHidden);

  return (
    <div className="app-root">
      {isPreview && <PreviewBanner />}
      <div className="app-screen">
        {phase === 'signedOut' && (
          // `key` = a new notice id makes React start a fresh SignIn (cleared fields and messages).
          <SignIn key={notice?.id ?? 'none'} notice={notice?.text ?? null} onSignIn={handleSignIn} />
        )}

        {phase === 'setPin' && profile !== null && (
          <SetPinScreen
            profile={profile}
            onDone={handlePinSet}
            onPasswordRequired={() => signOut(NOTICES.setPinPassword)}
            onSignOut={() => signOut()}
          />
        )}

        {isSignedIn && (
          <Shell
            hidden={phase === 'locked'}
            inert={shellInert}
            currentSection={section}
            currentTestingPage={section === 'testing' ? testingPage : null}
            // The person's own ways off the event page are guarded (contract 0010 §4.9) — the
            // rail's icons, the bottom bar and the Testing hover menu's items (which pass options).
            onNavigate={(id, options) => guarded(() => navigate(id, options))}
            location={location}
            onLocationChange={(next) => guarded(() => changeLocation(next))}
            profile={profile}
            deviceLocation={deviceLocation}
            onDeviceLocationChange={(next) => {
              // Asked only when it moves the switcher to another school.
              if (next === location) handleDeviceLocationChange(next);
              else guarded(() => handleDeviceLocationChange(next));
            }}
            onLockNow={lockNow}
            onChangePin={() => openAccountDialog('changePin')}
            onSetPin={() => setPhase('setPin')}
            onChangePassword={() => openAccountDialog('changePassword')}
            onStaffAccounts={() => guarded(() => navigate('staffAccounts'))}
            onSettings={() => guarded(() => navigate('settings'))}
            onSignOut={() => guarded(() => signOut())}
            badges={{ prospects: prospectsCount }}
          >
            {section === 'home' && (
              <Home
                location={location}
                screenLocked={phase === 'locked'}
                paymentsHidden={paymentsHidden}
                onOpenFinance={openFinanceReport}
                onOpenFinanceHistory={openFinanceHistory}
              />
            )}
            {section === 'testing' && (
              <Testing
                location={location}
                onLocationChange={changeLocation}
                // For showing or hiding controls only — the database decides what may change.
                isAdmin={profile.role === 'admin'}
                testingPage={testingPage}
                onOpenTestingPage={openTestingPage}
                eventId={eventId}
                eventTab={eventTab}
                onEventTab={changeEventTab}
                onLeaveGuardChange={setLeaveGuard}
                onOpenEvent={openEvent}
                onCloseEvent={closeEvent}
                onOpenStarEvent={openStarEvent}
                onCloseStarEvent={closeStarEvent}
                // Color Belt phase 4: the private testing grading page and its ways in and out
                privateId={privateId}
                onOpenPrivate={openPrivate}
                onClosePrivate={closePrivate}
                screenLocked={phase === 'locked'}
                onNoAccess={handleNoAccess}
                onRefreshProfile={refreshProfile}
                showToast={showToast}
                clearToast={clearToast}
                onModalOpenChange={setTestingModalOpen}
              />
            )}
            {section === 'camps' && (
              <Camps
                location={location}
                // For showing or hiding controls only — the database decides what may change.
                isAdmin={profile.role === 'admin'}
                campId={eventId}
                campTab={eventTab}
                onCampTab={changeCampTab}
                onOpenCamp={openCamp}
                onCloseCamp={closeCamp}
                // This device's home school: a camp payment lands in its Daily report (owner decision 2026-10-19).
                deviceLocation={deviceLocation}
                followSchoolFor={campSchoolFollow}
                onLocationChange={(next) => {
                  setCampSchoolFollow(null);
                  changeLocation(next);
                }}
                screenLocked={phase === 'locked'}
                onNoAccess={handleNoAccess}
                onRefreshProfile={refreshProfile}
                showToast={showToast}
                clearToast={clearToast}
                onModalOpenChange={setCampsModalOpen}
              />
            )}
            {section === 'schedule' && (
              <Schedule
                location={location}
                // For showing or hiding controls only — the database decides what may change.
                isAdmin={profile.role === 'admin'}
                screenLocked={phase === 'locked'}
                onNoAccess={handleNoAccess}
                onRefreshProfile={refreshProfile}
                showToast={showToast}
                clearToast={clearToast}
                onModalOpenChange={setScheduleModalOpen}
              />
            )}
            {section === 'calendar' && (
              <Calendar
                location={location}
                // For showing or hiding controls only — the database decides what may change.
                isAdmin={profile.role === 'admin'}
                screenLocked={phase === 'locked'}
                onNoAccess={handleNoAccess}
                onRefreshProfile={refreshProfile}
                showToast={showToast}
                clearToast={clearToast}
                onModalOpenChange={setCalendarModalOpen}
              />
            )}
            {section === 'forms' && (
              <Forms
                location={location}
                profile={profile}
                // For showing or hiding controls only — the database decides what may change.
                isAdmin={profile.role === 'admin'}
                screenLocked={phase === 'locked'}
                onNoAccess={handleNoAccess}
                onRefreshProfile={refreshProfile}
                showToast={showToast}
                clearToast={clearToast}
                onModalOpenChange={setFormsModalOpen}
              />
            )}
            {section === 'prospects' && (
              <Prospects
                location={location}
                staffId={profile.id}
                // For showing or hiding controls only — the database decides what may change.
                isAdmin={profile.role === 'admin'}
                screenLocked={phase === 'locked'}
                onNoAccess={handleNoAccess}
                onRefreshProfile={refreshProfile}
                showToast={showToast}
                clearToast={clearToast}
                onModalOpenChange={setProspectsModalOpen}
                onBadgeRefresh={refreshBadge}
              />
            )}
            {section === 'finance' && !paymentsHidden && (
              <Finance
                location={location}
                onLocationChange={changeLocation}
                // For showing or hiding controls only — the database decides what may be seen.
                isAdmin={profile.role === 'admin'}
                view={profile.role === 'admin' ? eventTab : 'report'}
                onView={changeFinanceView}
                profileName={profile.full_name}
                screenLocked={phase === 'locked'}
                onNoAccess={handleNoAccess}
                onRefreshProfile={refreshProfile}
                showToast={showToast}
                clearToast={clearToast}
                onModalOpenChange={setFinanceModalOpen}
                onOpenTesting={openTestingFor}
              />
            )}
            {section === 'staffAccounts' && (
              <StaffAccounts
                profile={profile}
                screenLocked={phase === 'locked'}
                showToast={showToast}
                onModalOpenChange={setStaffModalOpen}
                onRefreshProfile={refreshProfile}
              />
            )}
            {section === 'settings' && (
              <Settings
                profile={profile}
                screenLocked={phase === 'locked'}
                showToast={showToast}
                onModalOpenChange={setSettingsModalOpen}
                onRefreshProfile={refreshProfile}
                onNoAccess={handleNoAccess}
              />
            )}
          </Shell>
        )}

        {dialogOpen && accountDialog === 'changePin' && (
          <ChangePinDialog profile={profile} onCancel={closeAccountDialog} onChanged={handlePinChanged} />
        )}
        {dialogOpen && accountDialog === 'changePassword' && (
          <ChangePasswordDialog profile={profile} onCancel={closeAccountDialog} onChanged={handlePasswordChanged} />
        )}

        {phase === 'locked' && profile !== null && kiosk === null && (
          <LockScreen
            profile={profile}
            onUnlock={handleUnlocked}
            onPasswordRequired={() => signOut(NOTICES.unlockWithPassword)}
            onSignOut={() => signOut()}
          />
        )}
        {phase === 'locked' && profile !== null && kiosk !== null && (
          <KioskLoadGuard>
          <Suspense fallback={null}>
            <KioskApp
              profile={profile}
              entry={kiosk}
              onLeave={leaveKiosk}
              onPasswordRequired={() => signOut(NOTICES.unlockWithPassword)}
              onSignOut={() => signOut()}
            />
          </Suspense>
          </KioskLoadGuard>
        )}
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
