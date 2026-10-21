// emailRule.js — the email rule of the Star testing database (star_email_is_valid), in one place.
// Why it exists: the Candidates tab (candidatesCore.js) and the PUBLIC family form
// (src/star-register/) must accept exactly the same addresses. Keeping the rule in this tiny pure
// file lets the public page use it without importing the staff data layer.
// It is PURE: no React, no database, no browser.

// The email rule of the database (star_email_is_valid, contract §11 item 10): spaces at the start and
// end are trimmed first; at most 254 characters, something@something.something, no spaces, one "@",
// no invisible control or format characters. The address is stored as typed (capitals kept).
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_BAD_CHARACTER = /[\u0001-\u001f\u007f-\u009f ​-‏‪-‮⁠-⁤⁦-⁩﻿]/;
export const trimEmail = (text) => (typeof text === 'string' ? text.replace(/^ +| +$/g, '') : text);
export function starEmailIsValid(text) {
  const email = trimEmail(text);
  return typeof email === 'string' && [...email].length <= 254 && EMAIL_SHAPE.test(email) && !EMAIL_BAD_CHARACTER.test(email);
}
