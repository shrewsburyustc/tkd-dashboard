// memory.js — remembers, in THIS browser only, which registration a family just made.
// Why it exists: after paying with Square the family comes back to /breaking/<code>?paid=1 and the page
// asks "has Square told you yet?" (action `status`). The page needs the submission id for that, and the
// browser's own storage is the only place that is private to this phone (FUNCTION-API.md: the id is never
// put in an address, a log or an error message, so it can't ride along in the return link).
// Every read and write is wrapped in try/catch: storage can be blocked (private windows), and the page
// must work without it (the return page then just says "Thank you" without the paid check).
// The id is kept with the time it was saved and is forgotten after 24 hours (an old entry, or one saved
// without a time, counts as old and is removed), so a shared phone doesn't keep it for good.
const key = (code) => `tkd.breaking.submission.${code}`;
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// The stored text → the id if it is a well-formed, fresh entry, else null. (Pure, so checks.mjs can test it.)
export function freshSubmission(raw, now = Date.now()) {
  try {
    const entry = JSON.parse(raw);
    const good = entry && typeof entry.id === 'string' && /^[0-9a-f-]{36}$/i.test(entry.id) && Number.isFinite(entry.at);
    return good && now - entry.at >= 0 && now - entry.at < MAX_AGE_MS ? entry.id : null;
  } catch {
    return null;
  }
}

export function rememberSubmission(code, id) {
  try {
    window.localStorage.setItem(key(code), JSON.stringify({ id, at: Date.now() }));
  } catch {
    // storage blocked: the return page will not be able to check
  }
}

export function recallSubmission(code) {
  try {
    const id = freshSubmission(window.localStorage.getItem(key(code)));
    if (id === null) window.localStorage.removeItem(key(code)); // old, damaged or in the old format: forget it
    return id;
  } catch {
    return null;
  }
}

export function forgetSubmission(code) {
  try {
    window.localStorage.removeItem(key(code));
  } catch {
    // nothing to remove
  }
}
