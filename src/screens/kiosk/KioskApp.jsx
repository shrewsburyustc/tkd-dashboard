// KioskApp.jsx — the front-desk kiosk: a tablet that walk-in families use to sign up.
// Why it exists: rulebook v0.235 (mockup screen 9) and v0.241 answer 3, kiosk plan K1–K4
// (docs/Prospects/TKD-Kiosk-Build-Plan.md). Staff open it from Share → "Open kiosk mode on this
// device". The dashboard is then LOCKED on the server (the same lock as Lock now) and App.jsx shows
// this screen instead of the lock screen, for as long as this tablet remembers the kiosk
// (src/lib/kiosk.js). It runs inside the dashboard app (K3 → A), so the public page /f/… keeps no
// sign-in code at all; sign-ups still go through the same public Function, with the kiosk token.
//
// What it shows:
//   - welcome: logo, "Welcome to U.S. Taekwondo Center", Start. The last 30 minutes of the
//     12-hour kiosk token: an amber staff line with the end time. After 12 hours (or when the
//     server said kiosk mode had ended): "Please ask at the front desk to sign up.", Start greyed
//     out, and the staff line (K4 → A).
//   - the form: the public page's own FormsApp, with the kiosk token, autofill off, and the
//     kiosk's thank-you (30 s, "Take a photo", Done — K1 → B). Each family gets a brand-new form
//     (the `round` number), so nothing typed by one family is ever shown to the next.
//   - idle: 2 minutes without a tap mid-form → "Still there?" for 15 seconds → everything is wiped
//     and it goes back to the welcome screen.
//   - the lock in the corner: mockup 9's PIN pad (LockScreen's kiosk look — the real PIN check;
//     K2 → A). Cancel goes back to where the family was; the form stays as it was meanwhile.
//     The right PIN = leave kiosk mode (onLeave: App.jsx forgets the kiosk and reloads).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconAlertTriangle, IconLock } from '@tabler/icons-react';
import FormsApp from '../../forms/FormsApp.jsx';
import * as FT from '../../forms/text.js';
import LockScreen from '../LockScreen.jsx';
import { kioskState, readKiosk } from '../../lib/kiosk.js';
import '../../styles/forms.css';
import '../../styles/forms-public.css';
import '../../styles/kiosk.css';

const IDLE_MS = 2 * 60 * 1000; // no tap for 2 minutes mid-form …
const WARN_SECONDS = 15; // … then "Still there?" for 15 seconds, then the form is wiped
const TICK_MS = 1000;
// "9:12 pm" — lowercase like the class times on the forms
const endTime = (ms) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(ms).replace('AM', 'am').replace('PM', 'pm');

export default function KioskApp({ profile, entry, onLeave, onPasswordRequired, onSignOut }) {
  const [view, setView] = useState('welcome'); // welcome | form | pin
  const [pinFrom, setPinFrom] = useState('welcome'); // where Cancel on the PIN pad goes back to
  const [round, setRound] = useState(0); // a new number = a fresh, empty form for the next family
  const [now, setNow] = useState(() => Date.now());
  const [endedByServer, setEndedByServer] = useState(false);
  const [warnLeft, setWarnLeft] = useState(null); // seconds of "Still there?", or null
  const lastActivity = useRef(Date.now());
  const startRef = useRef(null);
  const lockRef = useRef(null);
  const focusBeforeStill = useRef(null);
  const backFromPin = useRef(false);

  // The end time is read again each second (the preview's kioskEndsIn helper changes it).
  const [current, setCurrent] = useState(entry);
  const state = endedByServer ? 'ended' : kioskState(current, now);
  const formShowing = view === 'form' || (view === 'pin' && pinFrom === 'form');

  // A clock tick: the 30-minute warning, the 12-hour end, and the idle check.
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      const fresh = readKiosk(profile.id);
      if (fresh && fresh.expiresAt !== current.expiresAt) setCurrent(fresh);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [profile.id, current.expiresAt]);

  // Wipe everything the family typed and go back to the welcome screen.
  const wipe = useCallback(() => {
    setWarnLeft(null);
    setRound((r) => r + 1);
    setView('welcome');
    window.scrollTo(0, 0);
  }, []);

  // Idle mid-form: after 2 minutes "Still there?", 15 seconds later the wipe. It also runs while
  // the PIN pad is open over a form (security review M1): a family that taps the lock and walks
  // away must not leave their answers behind for the next family's Cancel.
  useEffect(() => {
    if (!formShowing) return;
    if (view === 'pin') {
      if (now - lastActivity.current >= IDLE_MS) wipe();
      return;
    }
    if (warnLeft === null && now - lastActivity.current >= IDLE_MS) setWarnLeft(WARN_SECONDS);
    else if (warnLeft !== null) {
      const left = WARN_SECONDS - Math.floor((now - lastActivity.current - IDLE_MS) / 1000);
      if (left <= 0) wipe();
      else if (left !== warnLeft) setWarnLeft(left);
    }
  }, [now, view, formShowing, warnLeft, wipe]);

  // Any tap, key or typing counts as "still here".
  const markActive = useCallback(() => {
    lastActivity.current = Date.now();
    setWarnLeft(null);
  }, []);

  // Focus: the welcome screen → Start; the PIN pad → its title (so a screen reader says what it
  // is); Cancel on the PIN pad → back to the lock button (design review).
  useEffect(() => {
    if (view === 'welcome' && !backFromPin.current) startRef.current?.focus({ preventScroll: true });
    else if (view === 'pin') {
      // (on a PC the lock screen has already put focus in its hidden PIN box — keep that)
      const active = document.activeElement;
      if (!active || active === document.body) document.getElementById('lock-prompt')?.focus({ preventScroll: true });
    }
    else if (backFromPin.current) lockRef.current?.focus({ preventScroll: true });
    backFromPin.current = false;
  }, [view, round]);

  // "Still there?" is a real modal: the form behind it can't be reached, and focus goes back to
  // where it was when the family answers (design review).
  useEffect(() => {
    if (warnLeft !== null) {
      if (focusBeforeStill.current === null) focusBeforeStill.current = document.activeElement;
    } else if (focusBeforeStill.current) {
      const el = focusBeforeStill.current;
      focusBeforeStill.current = null;
      if (el.isConnected) el.focus({ preventScroll: true });
    }
  }, [warnLeft]);

  function start() {
    if (state === 'ended') return;
    lastActivity.current = Date.now();
    setView('form');
  }

  function openPin() {
    setPinFrom(view === 'pin' ? pinFrom : view);
    setWarnLeft(null);
    lastActivity.current = Date.now();
    setView('pin');
  }

  // The thank-you's Done / countdown. kioskEnded: the server saved the sign-up as a normal one
  // because kiosk mode had ended (12 hours, or "End kiosk mode on all tablets").
  const onDone = useCallback(
    (kioskEnded) => {
      if (kioskEnded) setEndedByServer(true);
      wipe();
    },
    [wipe],
  );
  // (one object for the whole kiosk session, so the once-a-second clock doesn't redraw the form)
  const onEnded = useCallback(() => setEndedByServer(true), []);
  const paused = view === 'pin';
  const kioskProps = useMemo(() => ({ slug: entry.slug, token: entry.token, paused, onDone, onEnded }), [entry.slug, entry.token, paused, onDone, onEnded]);

  return (
    <div className="fk" onPointerDown={markActive} onKeyDown={markActive} onInput={markActive}>
      {view === 'welcome' && (
        <main className="fk-welcome">
          <img className="fk-logo" src={`${import.meta.env.BASE_URL}logo.png`} width="96" height="96" alt="" />
          <h1 className="fk-title">{FT.KIOSK_WELCOME}</h1>
          <p className="fk-sub">{state === 'ended' ? FT.KIOSK_ASK_DESK : FT.KIOSK_WELCOME_SUB}</p>
          <button
            ref={startRef}
            type="button"
            className="btn btn-primary fk-start"
            aria-disabled={state === 'ended' ? 'true' : undefined}
            onClick={start}
          >
            {FT.KIOSK_START}
          </button>
          {state !== 'on' && (
            <p className="fk-staff" role="status">
              <IconAlertTriangle size={18} aria-hidden="true" />
              {state === 'ended' ? FT.KIOSK_ENDED_STAFF : FT.kioskEndsAt(endTime(current.expiresAt))}
            </p>
          )}
        </main>
      )}

      {/* The form stays mounted while the PIN pad is open, so Cancel brings the family back to it. */}
      {formShowing && (
        <div className="fk-form" hidden={view === 'pin'} inert={warnLeft !== null ? true : undefined}>
          <FormsApp key={round} kiosk={kioskProps} />
        </div>
      )}

      {view === 'pin' && (
        <div className="fk-pin">
          <LockScreen
            profile={profile}
            onUnlock={onLeave}
            onPasswordRequired={onPasswordRequired}
            onSignOut={onSignOut}
            kiosk={{ title: FT.KIOSK_PIN_TITLE, cancelLabel: FT.KIOSK_CANCEL, onCancel: () => { backFromPin.current = true; setView(pinFrom); } }}
          />
        </div>
      )}

      {view !== 'pin' && (
        <button
          ref={lockRef}
          type="button"
          className="fk-lock"
          aria-label={FT.KIOSK_LOCK}
          title={FT.KIOSK_LOCK}
          inert={warnLeft !== null ? true : undefined}
          onClick={openPin}
        >
          <IconLock size={20} aria-hidden="true" />
        </button>
      )}

      {warnLeft !== null && view === 'form' && (
        <div className="fk-still" role="alertdialog" aria-modal="true" aria-labelledby="fk-still-title" aria-describedby="fk-still-text">
          <div className="fk-still__card">
            <h2 id="fk-still-title" className="fk-still__title">{FT.KIOSK_STILL_THERE}</h2>
            <p id="fk-still-text">{FT.kioskClearingIn(warnLeft)}</p>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <button type="button" className="btn btn-primary fk-still__btn" autoFocus onClick={markActive}>
              {FT.KIOSK_KEEP_GOING}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
