// useNewPin.js — the "choose a PIN, then type it again" steps, shared by Set PIN and Change PIN.
// Why it exists: both screens follow exactly the same rules, so they live in one place:
//   stage 'choose'  → 4th digit typed: too easy? say so and clear. Otherwise remember it and
//                     move to 'confirm'.
//   stage 'confirm' → 4th digit typed: different from the first? back to 'choose' with
//                     "The PINs didn't match…". The same? hand it to onConfirmed(pin), which
//                     saves it (set_my_pin) and decides what happens next.
// Any message stays on screen until the next digit is typed (guidelines 8: errors never time out).
//
// It builds on usePinDigits (the typing itself), so it returns everything that hook returns,
// plus: stage, error, setError, restart(message), backToChoose().
import { useEffect, useRef, useState } from 'react';
import { usePinDigits } from './usePinDigits.js';
import { isPinTooEasy, PIN_LENGTH, PIN_MISMATCH_MESSAGE, PIN_TOO_EASY_MESSAGE } from './pinRules.js';

// active: false while the PIN steps aren't on screen (e.g. Change PIN's password step), so the
//         keyboard isn't listened to then.
export function useNewPin({ active = true, showKeypad, onConfirmed }) {
  const pin = usePinDigits({ keypadKeysActive: active && showKeypad });
  const [stage, setStage] = useState('choose'); // 'choose' | 'confirm'
  const [error, setError] = useState(null);
  const firstPinRef = useRef(null); // the PIN chosen in the first stage

  // Newest onConfirmed in a ref, so the effect below always calls the current one.
  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  });

  // A new digit clears the old message (it has done its job).
  useEffect(() => {
    if (pin.digits.length > 0) setError(null);
  }, [pin.digits]);

  // Back to the start, with an optional message (e.g. "too easy" from the server).
  function restart(message = null) {
    firstPinRef.current = null;
    setStage('choose');
    setError(message);
    pin.clear();
  }

  // The quiet "Back" link on the confirm stage.
  function backToChoose() {
    restart(null);
  }

  // The 4th digit decides what happens next.
  useEffect(() => {
    if (pin.digits.length !== PIN_LENGTH) return;

    if (stage === 'choose') {
      if (isPinTooEasy(pin.digits)) {
        setError(PIN_TOO_EASY_MESSAGE);
        pin.clear();
        return;
      }
      firstPinRef.current = pin.digits;
      pin.clear();
      setStage('confirm');
      return;
    }

    // stage === 'confirm'
    if (pin.digits !== firstPinRef.current) {
      restart(PIN_MISMATCH_MESSAGE);
      return;
    }
    onConfirmedRef.current(pin.digits);
    // Only `pin.digits` is listed: this should run when the typed digits change, nothing else.
  }, [pin.digits]);

  return { ...pin, stage, error, setError, restart, backToChoose };
}
