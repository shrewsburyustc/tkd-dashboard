// ChangePinDialog.jsx — "Change PIN", opened from the account menu.
// Why it exists: lets the signed-in person replace their 4-digit unlock PIN (approved mockup
// "2. Change PIN"). Three steps in one dialog (a full-screen page on phones):
//   Step 1 of 3  Confirm it's you — type the sign-in password (Cancel / Continue)
//   Step 2 of 3  Choose a 4-digit PIN — weak PINs refused straight away
//   Step 3 of 3  Enter it again to confirm — the 4th digit saves
// Why the password first: someone who walks up to an unattended, signed-in screen must not be
// able to quietly set a PIN they know and use it later to unlock that screen (guidelines 5).
// Hidden for the shared front-desk account (only an admin changes the desk PIN).
//
// Props:
//   profile   — the signed-in person ({ email, ... })
//   onCancel  — close, nothing changed (Cancel button, Esc, or the phone back arrow on step 1)
//   onChanged — new PIN saved: the App closes this and shows the "PIN changed" toast
import { useEffect, useRef, useState } from 'react';
import AccountDialog from '../components/AccountDialog.jsx';
import Notice from '../components/Notice.jsx';
import PinEntry from '../components/PinEntry.jsx';
import { confirmPassword } from '../lib/confirmPassword.js';
import { saveMyPin } from '../lib/myPin.js';
import { KEYPAD_QUERY, PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { useNewPin } from '../lib/useNewPin.js';
import { PIN_HINT, PIN_TOO_EASY_MESSAGE } from '../lib/pinRules.js';

// Messages for the password step (amber, under the field).
const PASSWORD_ERRORS = {
  empty: 'Enter your password to continue.',
  credentials: "That password doesn't match. Try again.",
  connection: "Couldn't reach the server. Check the connection and try again.",
  tooMany: 'Too many tries. Wait a minute and try again.',
  // set_my_pin said the password check is too old (it allows 10 minutes): ask again.
  expired: 'For security, enter your password again.',
};
const SAVE_ERROR = "Couldn't save your PIN. Check the connection and try again.";

export default function ChangePinDialog({ profile, onCancel, onChanged }) {
  const isPhone = useMediaQuery(PHONE_QUERY); // phone → full-screen page instead of a dialog
  const showKeypad = useMediaQuery(KEYPAD_QUERY); // touch or narrow screen → on-screen keypad

  const [passwordStep, setPasswordStep] = useState(true); // true = step 1 (password)
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(null); // key into PASSWORD_ERRORS
  const [checking, setChecking] = useState(false); // true while the password is being checked

  const passwordRef = useRef(null); // the password box
  const stepHeadingRef = useRef(null); // the step heading on the PIN steps (keypad focus target)

  // Runs when the new PIN has been typed twice and both match. (It uses `pin`, created just
  // below; that's fine because this only ever runs later, after a 4th digit is typed.)
  async function handleConfirmed(newPinDigits) {
    pin.setBusy(true); // ignore typing while saving
    const result = await saveMyPin(newPinDigits);
    pin.setBusy(false);

    if (result === 'ok' || result === 'not_allowed') {
      // 'not_allowed' = a shared account that already has a PIN — this menu item is hidden for
      // those, so it can't really happen. Close quietly; nothing was changed.
      if (result === 'ok') onChanged();
      else onCancel();
    } else if (result === 'too_easy') {
      pin.restart(PIN_TOO_EASY_MESSAGE); // back to step 2
    } else if (result === 'invalid') {
      pin.restart(null);
    } else if (result === 'password_required') {
      // The database wants a password sign-in in the last 10 minutes: back to step 1.
      pin.restart(null);
      setPasswordError('expired');
      setPasswordStep(true);
    } else {
      pin.clear(); // offline: stay on step 3 so they can type the same PIN again
      pin.setError(SAVE_ERROR);
    }
  }

  const pin = useNewPin({ active: !passwordStep, showKeypad, onConfirmed: handleConfirmed });
  const { stage, focusInput } = pin;
  const stepNumber = passwordStep ? 1 : stage === 'choose' ? 2 : 3;

  // Put keyboard focus where the person needs it on each step:
  //   step 1 → the password box; steps 2–3 → the hidden PIN box (PC) or the step heading (keypad,
  //   so a screen reader hears which step it is).
  useEffect(() => {
    if (passwordStep) {
      passwordRef.current?.focus();
    } else if (showKeypad) {
      stepHeadingRef.current?.focus();
    } else {
      focusInput();
    }
  }, [passwordStep, stage, showKeypad, focusInput]);

  // Step 1: Continue (or Enter).
  async function handlePasswordSubmit(event) {
    event.preventDefault(); // stop the browser from reloading the page
    if (checking) return; // already checking — ignore extra clicks / Enter presses
    if (!password) {
      setPasswordError('empty');
      passwordRef.current?.focus();
      return;
    }
    setChecking(true);
    setPasswordError(null);
    const result = await confirmPassword(profile.email, password);
    setChecking(false);

    if (result === 'ok') {
      setPassword(''); // don't keep the password in memory any longer than needed
      pin.restart(null); // start step 2 fresh
      setPasswordStep(false);
    } else {
      // Wrong password: the field clears and the message stays until they type again.
      if (result === 'credentials') setPassword('');
      setPasswordError(result);
      passwordRef.current?.focus();
    }
  }

  // "Back" link (steps 2–3) and the phone back arrow: one step back.
  function goBack() {
    if (passwordStep) {
      onCancel(); // step 1: leave (phone back arrow)
    } else if (stage === 'confirm') {
      pin.backToChoose(); // step 3 → step 2
    } else {
      pin.restart(null); // step 2 → step 1 (password again)
      setPasswordStep(true);
    }
  }

  return (
    <AccountDialog title="Change PIN" fullScreen={isPhone} onCancel={onCancel} onBack={goBack}>
      <p className="dialog-step">Step {stepNumber} of 3</p>

      {passwordStep ? (
        // noValidate: our own plain-language messages instead of the browser's pop-ups
        <form onSubmit={handlePasswordSubmit} noValidate>
          <h3 className="dialog-step-heading">Confirm it&apos;s you</h3>
          <p className="dialog-step-sub">Enter the password you sign in with.</p>
          <div className="field field--last">
            <label htmlFor="change-pin-password">Password</label>
            <input
              ref={passwordRef}
              id="change-pin-password"
              className="input"
              type="password"
              autoComplete="current-password"
              data-autofocus
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? 'change-pin-password-error' : undefined}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError(null); // the message has done its job once they type again
              }}
            />
            {passwordError && <Notice id="change-pin-password-error">{PASSWORD_ERRORS[passwordError]}</Notice>}
          </div>

          {isPhone ? (
            // Phone: the one full-width submit button (the back arrow is the way out).
            <div className="dialog-page-submit">
              <button type="submit" className="btn btn-primary btn-block" disabled={checking}>
                {checking ? 'Checking…' : 'Continue'}
              </button>
            </div>
          ) : (
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={checking}>
                {checking ? 'Checking…' : 'Continue'}
              </button>
            </div>
          )}
        </form>
      ) : (
        // Steps 2 and 3. Clicking anywhere here puts focus back in the hidden PIN box (PC).
        <div className="dialog-pin" onClick={focusInput}>
          <h3 ref={stepHeadingRef} tabIndex={-1} className="dialog-step-heading" id="change-pin-prompt">
            {stage === 'choose' ? 'Choose a 4-digit PIN' : 'Enter it again to confirm'}
          </h3>
          {stage === 'choose' && (
            <p className="dialog-step-hint" id="change-pin-hint">
              {PIN_HINT}
            </p>
          )}
          {pin.error && <Notice>{pin.error}</Notice>}

          <PinEntry
            pin={pin}
            showKeypad={showKeypad}
            labelledBy="change-pin-prompt"
            describedBy={stage === 'choose' ? 'change-pin-hint' : undefined}
            busyLabel="Saving PIN"
          />

          {/* Phone: the header back arrow does "Back", so no extra links here. */}
          {!isPhone && (
            <div className="dialog-actions">
              <button type="button" className="link-button" onClick={goBack}>
                Back
              </button>
              <button type="button" className="btn" onClick={onCancel}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </AccountDialog>
  );
}
