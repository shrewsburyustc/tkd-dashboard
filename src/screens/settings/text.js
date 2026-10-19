// text.js — every word the Settings page shows (Settings → Schools, rulebook v0.135).
// Why it exists: like the Testing and Staff accounts screens, all wording lives in one file so
// it can be checked against the approved mockups (docs/Dashboard Docs/TKD-Settings-Schools-
// Mockups.html, S1–S3) and changed in ONE place. The data layer (src/lib/settings/schoolsApi.js)
// only returns codes; this file turns them into plain English.

export const MENU_ITEM = 'Settings';
export const PAGE_TITLE = 'Settings';
export const PAGE_SUB = 'Details for the whole school. Admins only.';
export const SCHOOLS = 'Schools';
export const SCHOOLS_SUB = "Each school's address is shown to families on registration pages and printed flyers.";
export const NO_ADDRESS = 'No address yet. Family pages show only the school name.';
export const LOADING = 'Loading Settings';
export const LOAD_FAILED = "Couldn't load the schools. Check the connection, then retry.";
export const ONLY_ADMINS = 'Only admins can see Settings.';

export const schoolName = (name) => `${name} school`;
export const editSchoolLabel = (name) => `Edit ${schoolName(name)} address`;

// "100 Example Street, Worcester, MA 01600" (also used by the flyer)
export const addressLine = (address) => `${address.street}, ${address.city}, ${address.state} ${address.zip}`;

// ----- S3: Edit a school's address -----
export const ADDRESS = 'Address';
export const STREET = 'Street address';
export const CITY = 'City';
export const STATE = 'State';
export const ZIP = 'ZIP code';
export const addressHint = (name) =>
  `Shown to families on registration pages and printed flyers, e.g. “Location: ${schoolName(name)}, 100 Example Street, ${name}, MA 01600”.`;
export const CLEAR_HINT = 'Leave all four empty to show just the school name.';
export const CANCEL = 'Cancel';
export const SAVE = 'Save';
export const SAVING = 'Saving…';
export const TOAST_SAVED = 'Address saved';

// Field messages (codes from schoolsApi.addressProblems)
const PART_EMPTY = {
  street: 'Enter the street address.',
  city: 'Enter the city.',
  state: 'Enter the state.',
  zip: 'Enter the ZIP code.',
};
export function addressProblemText(part, code) {
  if (code === 'empty') return PART_EMPTY[part];
  if (code === 'tooLong') return part === 'street' ? 'Use 100 characters or fewer.' : 'Use 60 characters or fewer.';
  if (code === 'badState') return 'Use the 2-letter state, like MA.';
  if (code === 'badZip') return 'Enter a 5-digit ZIP code, like 01604.';
  return null;
}

// Notes in the dialog
export const UNSAVED = 'Unsaved changes. Save or cancel first.';
export const DISCARD_CHANGES = 'Discard changes';
export const STALE = "Someone else changed this just now. Your change wasn't saved. Cancel, then open it again to see the latest.";
export const STALE_PHONE =
  "Someone else changed this just now. Your change wasn't saved. Discard changes, then open it again to see the latest.";
export const NOT_ALLOWED = "Only an admin can change school addresses. Your change wasn't saved.";
export const INVALID = "That didn't save. Check the fields and try again.";
export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";
