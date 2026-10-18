// ConfirmStep.jsx — two pieces both Staff accounts dialogs share (Reset password, Reset PIN).
//   WhoLine      the gray line naming the person being reset (initials, name, email). It stays
//                on both steps, so nobody resets the wrong account (approved mockup, screen 4).
//   ConfirmStep  step 1 of 2, "Confirm it's you": the ADMIN types their own password (v0.74).
// Why the admin's own password: an admin screen left unlocked for a minute must not be usable to
// take over someone else's account. The check signs the admin in again (confirmPassword.js),
// which also gives the database the "password within the last 10 minutes" it requires.
//
// ConfirmStep props:
//   idBase      unique prefix for element ids
//   adminEmail  the signed-in admin's email (profile.email)
//   isPhone     phone → one full-width Continue (the header back arrow is the way out)
//   message     an error key from OWN_PASSWORD_ERRORS to show at the start (e.g. 'expired'), or null
//   onCancel    Cancel button
//   onConfirmed the password was right: go to step 2
//   note        optional element shown above the buttons (e.g. the "Unsaved changes" note)
import { useEffect, useRef, useState } from 'react';
import Avatar from '../../components/Avatar.jsx';
import Notice from '../../components/Notice.jsx';
import { confirmPassword } from '../../lib/confirmPassword.js';
import * as T from './text.js';

// An email with a place to break the line after the "@" (<wbr> = "may break here"), so a long
// address wraps as "grandmaster@" / "example.com" on narrow phones instead of mid-word.
export function EmailText({ email }) {
  const at = email.indexOf('@');
  if (at === -1) return email;
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  );
}

export function WhoLine({ account }) {
  return (
    <div className="sa-who">
      <Avatar name={account.fullName} />
      <span className="sa-who-name">{account.fullName}</span>
      <span className="sa-who-email">
        <EmailText email={account.email} />
      </span>
    </div>
  );
}

export function ConfirmStep({ idBase, adminEmail, isPhone, message, note = null, onCancel, onConfirmed }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(message); // key into OWN_PASSWORD_ERRORS, or null
  const [checking, setChecking] = useState(false);
  const inputRef = useRef(null);

  // Arriving on this step (also when coming back from step 2): focus the password box.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault(); // stop the browser from reloading the page
    if (checking) return; // already checking — ignore extra clicks / Enter presses
    if (!password) {
      setError('empty');
      inputRef.current?.focus();
      return;
    }
    setChecking(true);
    setError(null);
    const result = await confirmPassword(adminEmail, password);
    setChecking(false);
    if (result === 'ok') {
      setPassword(''); // don't keep the password in memory any longer than needed
      onConfirmed();
      return;
    }
    if (result === 'credentials') setPassword(''); // wrong password: the field clears
    setError(result);
    inputRef.current?.focus();
  }

  const canContinue = password !== '' && !checking;
  const continueButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canContinue ? '' : ' is-unavailable'}`}
      aria-disabled={canContinue ? undefined : 'true'}
    >
      {checking ? T.CHECKING : T.CONTINUE}
    </button>
  );

  return (
    // noValidate: our own plain-language messages instead of the browser's pop-ups
    <form onSubmit={handleSubmit} noValidate>
      <h3 className="dialog-step-heading">{T.CONFIRM_HEADING}</h3>
      <p className="dialog-step-sub">{T.CONFIRM_SUB}</p>
      <div className="field field--last">
        <label htmlFor={`${idBase}-own`}>{T.YOUR_PASSWORD}</label>
        <input
          ref={inputRef}
          id={`${idBase}-own`}
          className="input"
          type="password"
          autoComplete="current-password"
          data-autofocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${idBase}-own-error` : undefined}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null); // the message has done its job once they type again
          }}
        />
        {error && <Notice id={`${idBase}-own-error`}>{T.OWN_PASSWORD_ERRORS[error]}</Notice>}
      </div>

      {isPhone && note}

      {isPhone ? (
        <div className="dialog-page-submit">{continueButton}</div>
      ) : (
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {T.CANCEL}
          </button>
          {continueButton}
        </div>
      )}
      {/* PC / tablet: under the buttons, so they never move (v0.81) */}
      {!isPhone && note}
    </form>
  );
}
