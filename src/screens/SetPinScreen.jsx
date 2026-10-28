// SetPinScreen.jsx — "Set your PIN", shown right after a password sign-in when the account has
// no PIN yet (first sign-in, or after an admin reset). It comes BEFORE Home and can't be skipped.
// Why it exists: the PIN is what unlocks the lock screen (guidelines 5). Without one, the
// account would be signed out every time it goes idle (decided v0.26).
//
// Look (approved mockup "1. Set your PIN"): a centered card with who is signed in (initials,
// name, email), "Set your PIN", then two steps on the same card:
//   Step 1 of 2  "Choose a 4-digit PIN"  (weak PINs refused straight away)
//   Step 2 of 2  "Enter it again to confirm"  + a quiet "Back" link
// No buttons: the 4th digit moves on / saves. "Not you? Sign out" is always there.
//
// Props:
//   profile            — { full_name, email, ... } of the signed-in person
//   onDone(result)     — 'set' (PIN saved → Home + "PIN set" toast) or 'alreadySet' (Home, no toast)
//   onPasswordRequired — the database wants a fresh password sign-in first: sign out with a note
//   onSignOut          — "Not you? Sign out"
import { useEffect, useRef } from 'react';
import Avatar from '../components/Avatar.jsx';
import Notice from '../components/Notice.jsx';
import { BACK } from '../components/text.js';
import PinEntry from '../components/PinEntry.jsx';
import { saveMyPin } from '../lib/myPin.js';
import { KEYPAD_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { useNewPin } from '../lib/useNewPin.js';
import { PIN_HINT, PIN_TOO_EASY_MESSAGE } from '../lib/pinRules.js';

const SAVE_ERROR = "Couldn't save your PIN. Check the connection and try again.";

export default function SetPinScreen({ profile, onDone, onPasswordRequired, onSignOut }) {
  const showKeypad = useMediaQuery(KEYPAD_QUERY); // touch or narrow screen → on-screen keypad

  // Runs when the PIN has been typed twice and both match. (It uses `pin`, created just below;
  // that's fine because this only ever runs later, after a 4th digit is typed.)
  async function handleConfirmed(newPinDigits) {
    pin.setBusy(true); // ignore typing while saving
    const result = await saveMyPin(newPinDigits);
    pin.setBusy(false);

    if (result === 'ok') {
      onDone('set');
    } else if (result === 'not_allowed') {
      onDone('alreadySet'); // a PIN already exists for this shared account (shouldn't happen here)
    } else if (result === 'password_required') {
      onPasswordRequired();
    } else if (result === 'too_easy') {
      pin.restart(PIN_TOO_EASY_MESSAGE); // the server's copy of the rule caught it
      pin.focusInput();
    } else if (result === 'invalid') {
      pin.restart(null); // not 4 digits (can't really happen) — just start again
      pin.focusInput();
    } else {
      pin.clear(); // offline: stay on step 2 so they can type the same PIN again
      pin.setError(SAVE_ERROR);
      pin.focusInput();
    }
  }

  const pin = useNewPin({ showKeypad, onConfirmed: handleConfirmed });
  const { stage, focusInput } = pin;
  const isConfirm = stage === 'confirm';
  const promptRef = useRef(null); // the step prompt (keypad layout focus target)

  // Put keyboard focus where the person needs it when the screen appears and on each step change:
  //   PC layout     → the hidden PIN box, so they can just type.
  //   keypad layout → the step prompt, so a screen reader hears which step it is. (Without this,
  //                   pressing Back left focus nowhere: the Back link itself disappears on step 1.)
  // Same approach as Change PIN.
  useEffect(() => {
    if (showKeypad) promptRef.current?.focus();
    else focusInput();
  }, [stage, showKeypad, focusInput]);

  return (
    <div className="center-screen">
      {/* Clicking anywhere on the card puts focus back in the hidden PIN box (PC layout). */}
      <div className="setpin-card" onClick={focusInput}>
        {/* Whose PIN this is — same identity block as the lock screen. */}
        <Avatar name={profile.full_name} size="large" />
        <p className="setpin-name">{profile.full_name}</p>
        <p className="setpin-email">{profile.email}</p>

        <h1 className="setpin-title">Set your PIN</h1>
        <p className="setpin-sub">Unlocks this screen after it goes idle.</p>

        <p className="step-label">{isConfirm ? 'Step 2 of 2' : 'Step 1 of 2'}</p>
        {/* tabIndex={-1}: can be given focus by the code above, but isn't a Tab stop. */}
        <p ref={promptRef} tabIndex={-1} className="setpin-prompt" id="setpin-prompt">
          {isConfirm ? 'Enter it again to confirm' : 'Choose a 4-digit PIN'}
        </p>
        {/* The weak-PIN rule is only needed while choosing. */}
        {!isConfirm && (
          <p className="setpin-hint" id="setpin-hint">
            {PIN_HINT}
          </p>
        )}
        {pin.error && <Notice>{pin.error}</Notice>}

        <PinEntry
          pin={pin}
          showKeypad={showKeypad}
          labelledBy="setpin-prompt"
          describedBy={isConfirm ? undefined : 'setpin-hint'}
          busyLabel="Saving PIN"
        />

        <div className="setpin-links">
          {/* Step 1 has no Back: there's nowhere to go back to. */}
          {isConfirm && (
            <button type="button" className="link-button" onClick={pin.backToChoose}>
              {BACK}
            </button>
          )}
          <button type="button" className="link-button" onClick={onSignOut}>
            Not you? Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
