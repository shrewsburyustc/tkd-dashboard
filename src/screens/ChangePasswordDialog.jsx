// ChangePasswordDialog.jsx — "Change password", opened from the account menu.
// Why it exists: lets the signed-in person change the password they sign in with (approved
// mockup "3. Change password"). One dialog (a full-screen page on phones) with three fields:
// Current password, New password ("At least 12 characters"), Confirm new password.
// Hidden for the shared front-desk account (only an admin changes the desk password).
//
// What happens on "Change password" (fields are checked on submit, not while typing):
//   1. New password at least 12 characters, and both new fields the same.
//   2. The CURRENT password is checked by signing in again with it — so someone at an unattended,
//      signed-in screen can't change it.
//   3. supabase.auth.updateUser({ password, current_password }) saves the new one (Supabase stores
//      it scrambled). The current password goes along too: Supabase's "Require current password
//      when updating password" setting is ON, so Supabase checks it again on its side and refuses
//      the change without it. (Step 2 stays: it also gives this device a fresh password sign-in.)
//   4. The account's OTHER devices are signed out; this one stays signed in.
//
// Props:
//   profile   — the signed-in person ({ email, ... })
//   onCancel  — close, nothing changed (Cancel button, Esc, or the phone back arrow)
//   onChanged — saved: the App closes this and shows the "Password changed" toast
import { useRef, useState } from 'react';
import AccountDialog from '../components/AccountDialog.jsx';
import { CANCEL } from '../components/text.js';
import Notice from '../components/Notice.jsx';
import { confirmPassword } from '../lib/confirmPassword.js';
import { supabase } from '../lib/supabase.js';
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';

const MIN_PASSWORD_LENGTH = 12; // the same minimum is set in Supabase (guidelines 10b, v0.28)

const MESSAGES = {
  currentEmpty: 'Enter your current password.',
  currentWrong: "That password doesn't match. Try again.",
  tooShort: 'Use at least 12 characters.',
  mismatch: "The new passwords don't match. Type the same password in both.",
  weak: 'That password is too easy to guess. Choose a different one.',
  same: 'The new password must be different from the current one.',
  tooMany: 'Too many tries. Wait a minute and try again.',
  connection: "Couldn't reach the server. Check the connection and try again.",
  failed: "Couldn't change your password. Try again.",
};

// Error codes Supabase uses when the current password sent with updateUser is missing or wrong.
const CURRENT_PASSWORD_CODES = ['current_password_required', 'current_password_invalid', 'invalid_credentials'];

// Turns an error from supabase.auth.updateUser into { field, message } — which field the amber
// message goes under ('current', 'new' or 'form' = above the buttons) and what it says.
function describeUpdateError(error) {
  const code = error?.code;
  // Supabase didn't accept the current password (its own check, step 3 below).
  if (CURRENT_PASSWORD_CODES.includes(code) || /invalid (login )?credentials/i.test(error?.message ?? '')) {
    return { field: 'current', message: MESSAGES.currentWrong };
  }
  if (code === 'weak_password') {
    // Supabase lists why it's weak; 'length' = shorter than the minimum set in Supabase.
    const reasons = Array.isArray(error.reasons) ? error.reasons : [];
    return { field: 'new', message: reasons.includes('length') ? MESSAGES.tooShort : MESSAGES.weak };
  }
  if (code === 'same_password') return { field: 'new', message: MESSAGES.same };
  if (error?.status === 429 || code === 'over_request_rate_limit') return { field: 'form', message: MESSAGES.tooMany };
  // AuthRetryableFetchError / no status = couldn't reach Supabase; 5xx = Supabase had a problem.
  if (error?.name === 'AuthRetryableFetchError' || !error?.status || error.status >= 500) {
    return { field: 'form', message: MESSAGES.connection };
  }
  return { field: 'form', message: MESSAGES.failed };
}

export default function ChangePasswordDialog({ profile, onCancel, onChanged }) {
  const isPhone = useMediaQuery(PHONE_QUERY); // phone → full-screen page instead of a dialog

  const [current, setCurrent] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // One message per place: under Current, under New, under Confirm, or above the buttons.
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const currentRef = useRef(null);
  const newRef = useRef(null);
  const confirmRef = useRef(null);

  // Typing in a field clears that field's message (and the general one).
  function clearError(field) {
    setErrors((old) => ({ ...old, [field]: null, form: null }));
  }

  async function handleSubmit(event) {
    event.preventDefault(); // stop the browser from reloading the page
    if (busy) return; // already saving — ignore extra clicks / Enter presses

    // 1. Simple checks first, all at once, each under its own field.
    const found = {};
    if (!current) found.current = MESSAGES.currentEmpty;
    if (newPassword.length < MIN_PASSWORD_LENGTH) found.new = MESSAGES.tooShort;
    else if (confirm !== newPassword) found.confirm = MESSAGES.mismatch;
    if (Object.keys(found).length > 0) {
      setErrors(found);
      // Focus the first field with a problem, top to bottom.
      if (found.current) currentRef.current?.focus();
      else if (found.new) newRef.current?.focus();
      else confirmRef.current?.focus();
      return;
    }

    setBusy(true);
    setErrors({});

    // 2. Is the current password right?
    const check = await confirmPassword(profile.email, current);
    if (check !== 'ok') {
      setBusy(false);
      if (check === 'credentials') {
        setCurrent(''); // clear it so they type it fresh
        setErrors({ current: MESSAGES.currentWrong });
        currentRef.current?.focus();
      } else {
        setErrors({ form: check === 'tooMany' ? MESSAGES.tooMany : MESSAGES.connection });
      }
      return;
    }

    // 3. Save the new password.
    let updateError = null;
    try {
      // current_password: Supabase checks it again before saving (see the top of this file).
      const { error } = await supabase.auth.updateUser({ password: newPassword, current_password: current });
      updateError = error;
    } catch (caught) {
      updateError = caught ?? { name: 'AuthRetryableFetchError' };
    }
    if (updateError) {
      setBusy(false);
      const { field, message } = describeUpdateError(updateError);
      setErrors({ [field]: message });
      if (field === 'current') {
        setCurrent(''); // same as a wrong password in step 2: clear it so they type it fresh
        currentRef.current?.focus();
      } else if (field === 'new') {
        newRef.current?.focus();
      }
      return;
    }

    // 4. Sign out this account's OTHER devices (scope 'others' leaves this one signed in).
    //    Supabase usually does this by itself on a password change; asking again makes sure.
    //    If it fails (e.g. offline) the password is still changed, so carry on.
    try {
      await supabase.auth.signOut({ scope: 'others' });
    } catch {
      // ignore — see above
    }

    setBusy(false);
    onChanged();
  }

  // aria-describedby links each field to its hint and/or its error, so screen readers read them.
  const describe = (...ids) => ids.filter(Boolean).join(' ') || undefined;

  return (
    <AccountDialog title="Change password" fullScreen={isPhone} onCancel={onCancel}>
      {/* noValidate: our own plain-language messages instead of the browser's pop-ups */}
      <form onSubmit={handleSubmit} noValidate className="dialog-form">
        <div className="field">
          <label htmlFor="change-password-current">Current password</label>
          <input
            ref={currentRef}
            id="change-password-current"
            className="input"
            type="password"
            autoComplete="current-password"
            data-autofocus
            aria-invalid={errors.current ? true : undefined}
            aria-describedby={describe(errors.current && 'change-password-current-error')}
            value={current}
            onChange={(event) => {
              setCurrent(event.target.value);
              clearError('current');
            }}
          />
          {errors.current && <Notice id="change-password-current-error">{errors.current}</Notice>}
        </div>

        <div className="field">
          <label htmlFor="change-password-new">New password</label>
          <input
            ref={newRef}
            id="change-password-new"
            className="input"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.new ? true : undefined}
            aria-describedby={describe('change-password-new-hint', errors.new && 'change-password-new-error')}
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              clearError('new');
            }}
          />
          <p className="field-hint" id="change-password-new-hint">
            At least 12 characters
          </p>
          {errors.new && <Notice id="change-password-new-error">{errors.new}</Notice>}
        </div>

        <div className="field field--last">
          <label htmlFor="change-password-confirm">Confirm new password</label>
          <input
            ref={confirmRef}
            id="change-password-confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.confirm ? true : undefined}
            aria-describedby={describe(errors.confirm && 'change-password-confirm-error')}
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value);
              clearError('confirm');
            }}
          />
          {errors.confirm && <Notice id="change-password-confirm-error">{errors.confirm}</Notice>}
        </div>

        {/* Problems that don't belong to one field (offline, too many tries). */}
        {errors.form && (
          <div className="dialog-form-error">
            <Notice>{errors.form}</Notice>
          </div>
        )}

        {isPhone ? (
          // Phone: the one full-width submit button (the back arrow is the way out).
          <div className="dialog-page-submit">
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Changing password…' : 'Change password'}
            </button>
          </div>
        ) : (
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onCancel}>
              {CANCEL}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Changing password…' : 'Change password'}
            </button>
          </div>
        )}
      </form>
    </AccountDialog>
  );
}
