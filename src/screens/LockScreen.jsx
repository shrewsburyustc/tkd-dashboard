// LockScreen.jsx — the screen shown after the account's idle time or "Lock now".
// Why it exists: it hides the dashboard (parents can see mat-side screens) until the
// signed-in person types their own 4-digit PIN. The PIN only reopens THIS already-signed-in
// screen; it is not a login (guidelines 5). The database checks the PIN, not the browser —
// and a right PIN also unlocks this sign-in on the database side (verify_pin, migration 0002).
//
// Only people WITH a PIN ever see this screen: someone without one is signed out at idle
// instead (decided v0.26), so there is no "no PIN" version any more.
//
// Props:
//   profile            — { full_name, ... } of the signed-in person
//   onUnlock           — PIN was right: go back to where they were
//   onPasswordRequired — 5 wrong PINs / 7-day rule / PIN removed: sign out, ask for the password
//   onSignOut          — "Not you? Sign out"
//
// Typing the PIN (shared with Set PIN and Change PIN — see usePinDigits.js and PinEntry.jsx):
//   - PC layout: a hidden password box holds the digits. It has keyboard focus as soon as the
//     screen appears, so staff just type — and screen readers announce it as a PIN field.
//   - Keypad layout (touch / narrow screens): the on-screen buttons add digits; a physical
//     keyboard still works too. Both fill the same digits, so the dots always match.
import { useEffect, useState } from 'react';
import { IconLock } from '@tabler/icons-react';
import Avatar from '../components/Avatar.jsx';
import Notice from '../components/Notice.jsx';
import PinEntry from '../components/PinEntry.jsx';
import { supabase } from '../lib/supabase.js';
import { KEYPAD_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { usePinDigits } from '../lib/usePinDigits.js';
import { PIN_LENGTH } from '../lib/pinRules.js';

const CONNECTION_ERROR = "Couldn't check your PIN. Check the connection and try again.";

function triesLeftMessage(count) {
  const word = count === 1 ? 'try' : 'tries'; // "1 try left", "3 tries left"
  return `That PIN didn't match. ${count} ${word} left before your password is needed.`;
}

// Asks the database whether the PIN is right. Always resolves to one of:
// 'ok' | 'wrong:N' | 'password_required' | 'invalid' | 'connection'
async function checkPin(pin) {
  try {
    const { data, error, status } = await supabase.rpc('verify_pin', { p_pin: pin });
    if (error) {
      // 401 = the sign-in itself has expired on the server, so only the password can help.
      return status === 401 ? 'password_required' : 'connection';
    }
    return typeof data === 'string' ? data : 'connection';
  } catch {
    return 'connection'; // no network at all
  }
}

export default function LockScreen({ profile, onUnlock, onPasswordRequired, onSignOut }) {
  const showKeypad = useMediaQuery(KEYPAD_QUERY); // touch or narrow screen → on-screen keypad
  const pin = usePinDigits({ keypadKeysActive: showKeypad });
  const [error, setError] = useState(null);
  const { digits, focusInput } = pin; // pulled out so the effects below can list them

  // When the lock screen appears (or the layout switches), put keyboard focus in the hidden
  // PIN box (PC layout; on the keypad layout there's no box and this does nothing).
  useEffect(() => {
    focusInput();
  }, [showKeypad, focusInput]);

  // As soon as the 4th digit is in, ask the database.
  useEffect(() => {
    if (digits.length !== PIN_LENGTH) return undefined;
    let cancelled = false; // set if this screen closes before the answer arrives
    pin.setBusy(true);

    checkPin(digits).then((result) => {
      if (cancelled) return;
      pin.setBusy(false);

      if (result === 'ok') {
        onUnlock();
      } else if (result.startsWith('wrong:')) {
        const triesLeft = Number(result.slice('wrong:'.length));
        if (triesLeft > 0) {
          pin.clear();
          setError(triesLeftMessage(triesLeft));
          focusInput(); // ready for the next try straight away
        } else {
          onPasswordRequired();
        }
      } else if (result === 'password_required') {
        onPasswordRequired();
      } else if (result === 'invalid') {
        pin.clear(); // not 4 digits — just clear and let them try again
        focusInput();
      } else {
        pin.clear();
        setError(CONNECTION_ERROR); // network problem: doesn't count as a wrong try
        focusInput();
      }
    });

    return () => {
      cancelled = true;
    };
    // Only `digits` is listed: this should run when the typed digits change, nothing else.
  }, [digits]);

  return (
    <div className="center-screen">
      {/* Clicking anywhere on the card puts focus back in the hidden PIN box (PC layout). */}
      <div className="lock-card" onClick={focusInput}>
        <p className="lock-status">
          <IconLock size={16} aria-hidden="true" />
          Locked
        </p>
        <Avatar name={profile.full_name} size="large" />
        <h1 className="lock-name">{profile.full_name}</h1>

        <p className="lock-prompt" id="lock-prompt">
          Enter your PIN
        </p>
        {error && <Notice>{error}</Notice>}

        <PinEntry pin={pin} showKeypad={showKeypad} labelledBy="lock-prompt" busyLabel="Checking PIN" />

        <button type="button" className="link-button lock-signout" onClick={onSignOut}>
          Not you? Sign out
        </button>
      </div>
    </div>
  );
}
