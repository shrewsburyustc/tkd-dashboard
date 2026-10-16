// usePinDigits.js — remembers the PIN digits being typed, for every PIN screen.
// Why it exists: the lock screen, Set your PIN and Change PIN all type a 4-digit PIN the same
// way (on-screen keypad, physical keyboard, or the hidden PIN box on a PC). Keeping the typing
// rules in ONE hook means all three behave identically. Draw it with <PinEntry pin={...} />.
//
// What it gives back (an object):
//   digits            what's been typed so far, e.g. "12"
//   busy / setBusy    true while the database is checking or saving — typing is ignored then
//   inputRef          attach to the hidden PIN box (PinEntry does this)
//   focusInput()      put keyboard focus in the hidden PIN box (does nothing if it isn't shown)
//   clear()           empty the digits
//   addDigit / removeDigit / handleInputChange — used by PinEntry's keypad and hidden box
//
// keypadKeysActive: true while the on-screen KEYPAD is showing. Then a physical keyboard is
// listened to on the whole window (e.g. an iPad with a keyboard, or a narrow PC window).
// In the PC layout the hidden PIN box takes the typing instead, so this stays false.
import { useCallback, useEffect, useRef, useState } from 'react';
import { PIN_LENGTH } from './pinRules.js';

export function usePinDigits({ keypadKeysActive = false } = {}) {
  const [digits, setDigits] = useState('');
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false); // same as `busy`, but readable instantly inside key handlers
  const inputRef = useRef(null); // the hidden PIN box (PC layout only)

  // Keeps busyRef and busy in step (the ref for handlers, the state to redraw the screen).
  const setBusy = useCallback((value) => {
    busyRef.current = value;
    setBusyState(value);
  }, []);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const clear = useCallback(() => setDigits(''), []);

  const addDigit = useCallback((digit) => {
    if (busyRef.current) return; // ignore typing while checking
    setDigits((current) => (current.length >= PIN_LENGTH ? current : current + digit));
  }, []);

  const removeDigit = useCallback(() => {
    if (busyRef.current) return;
    setDigits((current) => current.slice(0, -1));
  }, []);

  // The hidden PIN box changed (a digit typed, Backspace, or a paste).
  const handleInputChange = useCallback((event) => {
    if (busyRef.current) return; // ignore typing while checking (the box keeps the old value)
    // Keep digits only (\D = "anything that isn't a digit"), at most 4 of them.
    setDigits(event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH));
  }, []);

  // Keypad layout only: a physical keyboard can still type digits.
  useEffect(() => {
    if (!keypadKeysActive) return undefined;
    function handleKeyDown(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return; // leave shortcuts alone
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        addDigit(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        removeDigit();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keypadKeysActive, addDigit, removeDigit]);

  return { digits, busy, setBusy, inputRef, focusInput, clear, addDigit, removeDigit, handleInputChange };
}
