// ResetPasswordDialog.jsx — "Reset password" for someone else (Staff accounts, v0.70–v0.76).
// Why it exists: when someone forgets their password, an admin gives them a new one here
// instead of pasting SQL (approved mockup, screens 4–6). Two steps in one dialog (a full-screen
// page on phones):
//   Step 1 of 2  Confirm it's you — the admin's own password (ConfirmStep.jsx, v0.74)
//   Step 2 of 2  the new password, shown in plain text (the admin is choosing it for someone
//                else and has to hand it over). Type one, or press Generate (4 easy words);
//                Copy puts it on the clipboard for the password manager (v0.73).
// The database then saves it, cancels emailed links and signs the person out everywhere
// (migration 0004, v0.72); the App shows the toast.
//
// Unsaved changes (v0.46 / v0.56): once a new password is in the field, Esc, a click outside or
// the phone back arrow don't throw it away — the amber note "Unsaved changes. Save or cancel
// first." appears instead (phones: with a "Discard changes" link). Only Cancel / Discard close.
// On the phone, the back arrow on step 2 goes back to step 1 (the new password is kept).
//
// SAFETY: the new password lives only in this dialog's memory while it is open — never in
// localStorage, the address bar or the console — and is gone when the dialog closes.
//
// Props:
//   account     { id, fullName, email, isShared } — the person being reset
//   adminEmail  the signed-in admin's email (for step 1)
//   isPhone     full-screen page instead of a dialog
//   onCancel    close, nothing changed
//   onDone(n)   reset worked; n = number of devices signed out
import { useEffect, useId, useRef, useState } from 'react';
import { IconCopy, IconWand } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { generatePassphrase } from '../../lib/passphrase.js';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_CHARS, passwordBytes, resetPassword } from '../../lib/staffAccounts.js';
import { ConfirmStep, WhoLine } from './ConfirmStep.jsx';
import * as T from './text.js';

const COPIED_MS = 2000; // "Copied" shows for 2 seconds

export default function ResetPasswordDialog({ account, adminEmail, isPhone, onCancel, onDone }) {
  const idBase = useId();
  const [step, setStep] = useState(1);
  const [confirmMessage, setConfirmMessage] = useState(null); // step 1 starts with this error (e.g. 'expired')
  const [confirmKey, setConfirmKey] = useState(0); // a new value draws a fresh step 1
  const [newPassword, setNewPassword] = useState('');
  const [note, setNote] = useState(null); // null | 'UNSAVED' | 'FAILED' | 'COPY_FAILED' | 'TOO_SHORT' | 'TOO_LONG'
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [announce, setAnnounce] = useState(''); // spoken only (e.g. "New password generated.")
  const fieldRef = useRef(null);
  const copiedTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  // Step 2 opened: focus the new-password box.
  useEffect(() => {
    if (step === 2) fieldRef.current?.focus();
  }, [step]);

  // Characters (é = 1, an emoji = 1) and bytes (é = 2) — the database checks both (0004).
  const chars = Array.from(newPassword).length;
  const tooLong = passwordBytes(newPassword) > PASSWORD_MAX_BYTES;
  const longEnough = chars >= PASSWORD_MIN_CHARS;
  const canSave = longEnough && !tooLong && !saving;

  function goToStep1(message = null) {
    setConfirmMessage(message);
    setConfirmKey((value) => value + 1);
    setNote(null);
    setStep(1);
  }

  // Esc / click outside / phone back arrow (Dialog.jsx).
  function requestClose() {
    if (saving) return;
    if (isPhone && step === 2) {
      goToStep1(); // phone back arrow on step 2 = one step back; the new password is kept
      return;
    }
    if (newPassword !== '') {
      setNote('UNSAVED');
      return;
    }
    onCancel();
  }

  function changePassword(value) {
    setNewPassword(value);
    setCopied(false);
    setNote(null);
  }

  function generate() {
    if (saving) return; // the password being saved must stay the one on screen
    changePassword(generatePassphrase());
    setAnnounce(T.GENERATED);
  }

  async function copy() {
    if (saving) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopied(true);
      setNote((current) => (current === 'COPY_FAILED' ? null : current));
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setNote('COPY_FAILED'); // e.g. the browser blocked the clipboard
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setNote(null);
    const result = await resetPassword(account.id, newPassword);
    setSaving(false);
    if (result.status === 'ok') {
      onDone(result.devicesSignedOut);
    } else if (result.status === 'password_required') {
      goToStep1('expired'); // more than 10 minutes since step 1: ask again (the new one is kept)
    } else if (result.status === 'too_short') {
      setNote('TOO_SHORT');
    } else if (result.status === 'too_long') {
      setNote('TOO_LONG');
    } else {
      setNote('FAILED'); // offline, not allowed any more, account gone … — nothing was changed
    }
  }

  const fieldHint = tooLong ? null : longEnough ? (
    <p id={`${idBase}-hint`} className="field-hint sa-ok">
      {T.LONG_ENOUGH}
    </p>
  ) : (
    <p id={`${idBase}-hint`} className="field-hint">
      {T.charsSoFar(chars)}
    </p>
  );

  const NOTES = {
    UNSAVED: T.UNSAVED,
    FAILED: T.PASSWORD_FAILED,
    COPY_FAILED: T.COPY_FAILED,
    TOO_SHORT: T.charsSoFar(chars),
    TOO_LONG: T.TOO_LONG,
  };

  // Step 1 (after Back) keeps the new password, so it can show this note too — above its buttons.
  const unsavedNote = (
    <div className="tdialog-note">
      <Notice>
        {T.UNSAVED}
        {/* Phone only (v0.56): the page has no Cancel button, so the note offers the way out. */}
        {isPhone && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );

  const resetButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`}
      aria-disabled={canSave ? undefined : 'true'}
    >
      {saving ? T.RESETTING : T.RESET_PASSWORD}
    </button>
  );

  // Step 2's note. Phones: above the Reset button; PC / tablet: under the buttons, so they never
  // move when it appears (v0.81).
  const stepTwoNote = note && note !== 'TOO_LONG' && (
    <div className="tdialog-note">
      <Notice>
        {NOTES[note]}
        {/* Phone only (v0.56): the page has no Cancel button, so the note offers the way out. */}
        {isPhone && note === 'UNSAVED' && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );

  return (
    <Dialog title={T.RESET_PASSWORD} fullScreen={isPhone} onRequestClose={requestClose}>
      <WhoLine account={account} />
      <p className="dialog-step">{T.stepOf(step)}</p>

      {step === 1 ? (
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
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <p className="dialog-step-sub">{T.choosePasswordFor(account.fullName)}</p>
          <div className="field sa-field-tight">
            <label htmlFor={`${idBase}-new`}>{T.NEW_PASSWORD}</label>
            <input
              ref={fieldRef}
              id={`${idBase}-new`}
              className="input sa-pw-input"
              type="text"
              // Not the admin's own login: stop browsers and password managers from offering
              // to save it as the admin's password, fixing "spelling" or capitalising letters.
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              readOnly={saving}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={tooLong ? true : undefined}
              aria-describedby={tooLong ? `${idBase}-long` : `${idBase}-hint`}
              value={newPassword}
              onChange={(event) => changePassword(event.target.value)}
            />
            {tooLong ? <Notice id={`${idBase}-long`}>{T.TOO_LONG}</Notice> : fieldHint}
          </div>
          <div className="sa-gen">
            <button
              type="button"
              className={`btn btn-sm${saving ? ' is-unavailable' : ''}`}
              aria-disabled={saving ? 'true' : undefined}
              onClick={generate}
            >
              {/* ti-wand = Generate (v0.73) */}
              <IconWand size={16} aria-hidden="true" />
              {T.GENERATE}
            </button>
            <button
              type="button"
              className={`btn btn-sm${newPassword && !saving ? '' : ' is-unavailable'}`}
              aria-disabled={newPassword && !saving ? undefined : 'true'}
              onClick={() => {
                if (newPassword) copy();
              }}
            >
              {/* ti-copy = Copy (v0.73) */}
              <IconCopy size={16} aria-hidden="true" />
              {copied ? T.COPIED : T.COPY}
            </button>
          </div>
          <p className="visually-hidden" aria-live="polite">
            {copied ? T.COPIED : announce}
          </p>

          <p className="sa-warning">{T.passwordWarning(account.fullName, account.isShared)}</p>

          {isPhone && stepTwoNote}

          {isPhone ? (
            <div className="dialog-page-submit">{resetButton}</div>
          ) : (
            <div className="dialog-footer">
              {/* PC / tablet (v0.81): buttons and, under them, the note share one bottom area, so the
                  buttons never move and, on a short screen, both stay pinned in view. */}
              <div className="dialog-actions">
                <button type="button" className="link-button" onClick={() => goToStep1()}>
                  {T.BACK}
                </button>
                <button type="button" className="btn" onClick={onCancel}>
                  {T.CANCEL}
                </button>
                {resetButton}
              </div>
              {stepTwoNote}
            </div>
          )}
        </form>
      )}
    </Dialog>
  );
}
