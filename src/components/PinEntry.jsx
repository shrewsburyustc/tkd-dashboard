// PinEntry.jsx — the PIN dots, plus either the on-screen keypad or the hidden PIN box.
// Why it exists: the lock screen, Set your PIN and Change PIN all show the same PIN typing area.
// It is built here once, from three small pieces that can also be used on their own:
//   PinDots         the 4 circles (filled = typed). Decoration only — screen readers get a
//                   spoken "2 of 4 digits entered" line instead.
//   Keypad          1–9, blank, 0, Del. Keys drawn 36px tall; the 8px gaps give each a 44px
//                   tap area (decided v0.16).
//   HiddenPinInput  an invisible password box that has keyboard focus on a PC, so staff just
//                   type — and screen readers announce it as a PIN field.
//
// Props of PinEntry:
//   pin         the object from usePinDigits() (digits, busy, handlers, inputRef)
//   showKeypad  true on touch screens / narrow screens, false on a PC
//   labelledBy  id of the visible prompt (e.g. "Enter your PIN") — the field's spoken name
//   describedBy optional id of a hint line (e.g. the weak-PIN rule), read after the name
//   busyLabel   what screen readers hear while the database works ("Checking PIN")
import { PIN_LENGTH } from '../lib/pinRules.js';

const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinDots({ count }) {
  return (
    <div className="pin-dots" aria-hidden="true">
      {Array.from({ length: PIN_LENGTH }, (_, index) => (
        <span key={index} className={index < count ? 'pin-dot is-filled' : 'pin-dot'} />
      ))}
    </div>
  );
}

export function Keypad({ labelledBy, busy, onDigit, onDelete }) {
  return (
    <div className="keypad" role="group" aria-labelledby={labelledBy}>
      {KEYPAD_DIGITS.map((digit) => (
        <button key={digit} type="button" className="keypad-key" aria-disabled={busy} onClick={() => onDigit(digit)}>
          {digit}
        </button>
      ))}
      <span className="keypad-blank" aria-hidden="true" />
      <button type="button" className="keypad-key" aria-disabled={busy} onClick={() => onDigit('0')}>
        0
      </button>
      {/* "Del" is a word, not an arrow icon: the left arrow already means Back (guidelines 2.4). */}
      <button
        type="button"
        className="keypad-key keypad-key--del"
        aria-label="Del, delete last digit"
        aria-disabled={busy}
        onClick={onDelete}
      >
        Del
      </button>
    </div>
  );
}

// inputRef comes from usePinDigits, so the screen can move keyboard focus into this box.
export function HiddenPinInput({ inputRef, value, onChange, labelledBy, describedBy }) {
  return (
    <input
      ref={inputRef}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={PIN_LENGTH}
      className="visually-hidden pin-input"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      value={value}
      onChange={onChange}
    />
  );
}

export default function PinEntry({ pin, showKeypad, labelledBy, describedBy, busyLabel = 'Checking PIN' }) {
  return (
    <div className="pin-entry">
      <PinDots count={pin.digits.length} />
      {/* Spoken only: how many digits are in, or that the database is working. */}
      <p className="visually-hidden" aria-live="polite">
        {pin.busy ? busyLabel : `${pin.digits.length} of ${PIN_LENGTH} digits entered`}
      </p>

      {showKeypad ? (
        <Keypad labelledBy={labelledBy} busy={pin.busy} onDigit={pin.addDigit} onDelete={pin.removeDigit} />
      ) : (
        <>
          <HiddenPinInput
            inputRef={pin.inputRef}
            value={pin.digits}
            onChange={pin.handleInputChange}
            labelledBy={labelledBy}
            describedBy={describedBy}
          />
          <p className="pin-hint">Type the digits on your keyboard — no need to click</p>
        </>
      )}
    </div>
  );
}
