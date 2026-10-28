// text.js — every word the Staff accounts screens show (approved mockup
// TKD-Staff-Accounts-Mockups.html, rulebook v0.70–v0.76).
// Why it exists: one place to read or change the wording, so the page, the menus, the dialogs,
// the toasts and the preview data can't drift apart.

export const PAGE_TITLE = 'Staff accounts';
export const PAGE_SUB = 'Reset a password or PIN when someone forgets it.';
export const LOADING = 'Loading staff accounts';
export const LOAD_FAILED = "Couldn't load staff accounts. Check the connection.";
export const ONLY_ADMINS = 'Only admins can see Staff accounts.';
export const YOU = '(you)';

// One tag per row (rule 8): Shared wins for the desk.
export function tagFor(account) {
  if (account.isShared) return 'Shared';
  return account.role === 'admin' ? 'Admin' : 'Staff';
}
// Phone sheet, second line: "shrewsburyustc@gmail.com · Shared front desk"
export function sheetSubtitle(account) {
  return `${account.email} · ${account.isShared ? 'Shared front desk' : tagFor(account)}`;
}
export const moreActionsFor = (name) => `More actions for ${name}`;
export const ROW_HINT = 'Opens Reset password and Reset PIN.';

// Row menu
export const RESET_PASSWORD = 'Reset password';
export const RESET_PIN = 'Reset PIN';

// Both dialogs, step 1
export const stepOf = (n) => `Step ${n} of 2`;
export const CONFIRM_HEADING = "Confirm it's you";
export const CONFIRM_SUB = 'Enter the password you sign in with.';
export const YOUR_PASSWORD = 'Your password';
export const CONTINUE = 'Continue';
export const CHECKING = 'Checking…';
// The shared words (src/components/text.js, rulebook v1.030), re-exported with the same values.
export { CANCEL, BACK } from '../../components/text.js';
export const OWN_PASSWORD_ERRORS = {
  empty: 'Enter your password to continue.',
  credentials: "That password doesn't match. Try again.",
  connection: "Couldn't reach the server. Check the connection and try again.",
  tooMany: 'Too many tries. Wait a few minutes and try again.',
  // the database said the password check is more than 10 minutes old
  expired: 'For security, enter your password again.',
};

// Reset password, step 2
export const choosePasswordFor = (name) => `Choose a new password for ${name}.`;
export const NEW_PASSWORD = 'New password';
export const charsSoFar = (n) => `12 characters minimum (${n} so far)`;
export const LONG_ENOUGH = 'Long enough';
export const TOO_LONG = 'Use 72 characters or fewer.';
export const GENERATE = 'Generate';
export const GENERATED = 'New password generated.';
export const COPY = 'Copy';
export const COPIED = 'Copied';
export const COPY_FAILED = "Couldn't copy. Select the password and copy it.";
export function passwordWarning(name, isShared) {
  const base = `${name} will be signed out on every device. Save the new password before you continue — it won't be shown again.`;
  return isShared ? `${base} Type the new password on each desk device.` : base;
}
export const RESETTING = 'Resetting…';
export const PASSWORD_FAILED = "Couldn't reset the password. Nothing was changed. Try again.";

// Reset PIN, step 2
export const choosePinFor = (name) => `Choose a new 4-digit PIN for ${name}.`;
export const NEW_PIN = 'New PIN';
export function pinHandover(name, isShared) {
  return isShared ? 'This is the shared front-desk PIN. Tell the desk staff the new one.' : `Tell ${name} the new PIN.`;
}
export const PIN_FAILED = "Couldn't reset the PIN. Nothing was changed. Try again.";

// Unsaved changes (v0.46 / v0.56)
export const UNSAVED = 'Unsaved changes. Save or cancel first.';
export const DISCARD_CHANGES = 'Discard changes';

// Toasts (5 seconds, no Undo, no icon)
export function passwordResetToast(name, devices) {
  if (devices === 0) return `Password reset for ${name}.`;
  return `Password reset for ${name}. Signed out on ${devices} ${devices === 1 ? 'device' : 'devices'}.`;
}
export const pinResetToast = (name) => `PIN reset for ${name}. Works on every device now.`;
