// ResetPinDialog.jsx — "Reset PIN" for someone else (Staff accounts, v0.75 / v0.76).
// Why it exists: when someone forgets their unlock PIN (most often the shared front desk), an
// admin types the new one here and tells them (approved mockup, screen 7). Two steps:
//   Step 1 of 2  Confirm it's you — the admin's own password (ConfirmStep.jsx, v0.74)
//   Step 2 of 2  the new 4 digits, SHOWN in 4 boxes (the admin has to read them out). PC: typed
//                on the keyboard; touch / narrow screens: the approved keypad. Unlike Change PIN,
//                nothing saves on the 4th digit: the admin checks the digits, then presses
//                Reset PIN. Weak PINs (1111, 1234 …) are refused straight away.
// The database then saves it; nobody is signed out, and devices that hit 5 wrong PINs stay
// locked (migration 0004). The App shows the toast.
// Unsaved changes work as in ResetPasswordDialog.jsx (once a digit is in).
//
// Props:
//   account, adminEmail, isPhone, onCancel   as in ResetPasswordDialog.jsx
//   onDone      reset worked
import { useEffect, useId, useRef, useState } from 'react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { Keypad } from '../../components/PinEntry.jsx';
import { resetPin } from '../../lib/staffAccounts.js';
import { isPinTooEasy, PIN_HINT, PIN_LENGTH, PIN_TOO_EASY_MESSAGE } from '../../lib/pinRules.js';
import { KEYPAD_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import { usePinDigits } from '../../lib/usePinDigits.js';
import { ConfirmStep, WhoLine } from './ConfirmStep.jsx';
import * as T from './text.js';

export default function ResetPinDialog({ account, adminEmail, isPhone, onCancel, onDone }) {
  const idBase = useId();
  const showKeypad = useMediaQuery(KEYPAD_QUERY); // touch or narrow screen → on-screen keypad
  const [step, setStep] = useState(1);
  const [confirmMessage, setConfirmMessage] = useState(null);
  const [confirmKey, setConfirmKey] = useState(0);
  const [note, setNote] = useState(null); // null | 'UNSAVED' | 'FAILED'
  const [saving, setSaving] = useState(false);
  const [inputFocused, setInputFocused] = useState(false); // PC: the PIN box has keyboard focus
  const headingRef = useRef(null);

  // Keypad layout: a physical keyboard still types digits (only while step 2 is open).
  const pin = usePinDigits({ keypadKeysActive: step === 2 && showKeypad });
  const { digits, focusInput } = pin;

  // Step 2 opened: PC → the PIN box; keypad → the heading (so a screen reader hears the step).
  useEffect(() => {
    if (step !== 2) return;
    if (showKeypad) headingRef.current?.focus();
    else focusInput();
  }, [step, showKeypad, focusInput]);

  // Any typing clears the old note.
  useEffect(() => {
    setNote(null);
  }, [digits]);

  const complete = digits.length === PIN_LENGTH;
  const tooEasy = complete && isPinTooEasy(digits);
  const canSave = complete && !tooEasy && !saving;

  function goToStep1(message = null) {
    setConfirmMessage(message);
    setConfirmKey((value) => value + 1);
    setNote(null);
    setStep(1);
  }

  function requestClose() {
    if (saving) return;
    if (isPhone && step === 2) {
      goToStep1(); // phone back arrow on step 2 = one step back; the digits are kept
      return;
    }
    if (digits !== '') {
      setNote('UNSAVED');
      return;
    }
    onCancel();
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    pin.setBusy(true);
    const result = await resetPin(account.id, digits);
    pin.setBusy(false);
    setSaving(false);
    if (result.status === 'ok') onDone();
    else if (result.status === 'password_required') goToStep1('expired');
    else setNote('FAILED'); // too_easy can't get here (checked above); anything else: nothing changed
  }

  const resetButton = (
    <button
      type="button"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`}
      aria-disabled={canSave ? undefined : 'true'}
      onClick={save}
    >
      {saving ? T.RESETTING : T.RESET_PIN}
    </button>
  );

  const unsavedNote = (
    <div className="tdialog-note">
      <Notice>
        {T.UNSAVED}
        {isPhone && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );

  return (
    <Dialog title={T.RESET_PIN} fullScreen={isPhone} onRequestClose={requestClose}>
      <WhoLine account={account} />
      <p className="dialog-step">{T.stepOf(step)}</p>

      {step === 1 ? (
        <>
          <ConfirmStep
            key={confirmKey}
            idBase={idBase}
            adminEmail={adminEmail}
            isPhone={isPhone}
            message={confirmMessage}
            note={note === 'UNSAVED' ? unsavedNote : null}
            onCancel={onCancel}
            onConfirmed={() => {
              setConfirmMessage(null);
              setNote(null);
              setStep(2);
            }}
          />
        </>
      ) : (
        <div>
          <h3 ref={headingRef} tabIndex={-1} id={`${idBase}-prompt`} className="dialog-step-sub sa-pin-prompt">
            {T.choosePinFor(account.fullName)}
          </h3>
          <p id={`${idBase}-hint`} className="dialog-step-hint">
            {PIN_HINT}
          </p>

          {/* The 4 boxes, digits shown. Clicking them puts focus back in the PIN box (PC). */}
          {/* PC: the blue ring goes round the boxes only while the (hidden) PIN box has focus,
              so it's the visible focus cue (rule 4); the keypad layout marks the next box. */}
          <div
            className={`sa-pinboxes${!showKeypad && inputFocused ? ' is-focused' : ''}`}
            aria-hidden="true"
            onClick={showKeypad ? undefined : focusInput}
          >
            {Array.from({ length: PIN_LENGTH }, (_, index) => (
              <span
                key={index}
                className={`sa-pinbox${index === digits.length && !complete && (showKeypad || inputFocused) ? ' is-current' : ''}`}
              >
                {digits[index] ?? ''}
              </span>
            ))}
          </div>
          {/* Spoken only: which digits are in so far. */}
          <p className="visually-hidden" aria-live="polite">
            {digits ? `${T.NEW_PIN}: ${digits.split('').join(' ')}. ` : ''}
            {`${digits.length} of ${PIN_LENGTH} digits entered`}
          </p>

          {tooEasy && (
            <div className="tdialog-note">
              <Notice>{PIN_TOO_EASY_MESSAGE}</Notice>
            </div>
          )}

          {showKeypad ? (
            <Keypad labelledBy={`${idBase}-prompt`} busy={saving} onDigit={pin.addDigit} onDelete={pin.removeDigit} />
          ) : (
            <>
              {/* A real text box (digits are shown anyway), kept out of sight: the boxes above draw it. */}
              <input
                ref={pin.inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={PIN_LENGTH}
                className="visually-hidden"
                aria-labelledby={`${idBase}-prompt`}
                aria-describedby={`${idBase}-hint`}
                value={digits}
                onChange={pin.handleInputChange}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    save();
                  }
                }}
              />
            </>
          )}

          <p className="sa-warning">{T.pinHandover(account.fullName, account.isShared)}</p>

          {note === 'FAILED' && (
            <div className="tdialog-note">
              <Notice>{T.PIN_FAILED}</Notice>
            </div>
          )}
          {note === 'UNSAVED' && unsavedNote}

          {isPhone ? (
            <div className="dialog-page-submit">{resetButton}</div>
          ) : (
            <div className="dialog-actions">
              <button type="button" className="link-button" onClick={() => goToStep1()}>
                {T.BACK}
              </button>
              <button type="button" className="btn" onClick={onCancel}>
                {T.CANCEL}
              </button>
              {resetButton}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
