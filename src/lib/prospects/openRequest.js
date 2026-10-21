// openRequest.js — "open this child when Prospects shows" (rulebook v0.615).
// Why it exists: a tap on a follow-up in the Calendar opens that child in Prospects. The id is
// handed over in memory (like Finance's financeState) — never in the web address, so no
// prospect id ends up in the browser's history. A reload forgets it, which is fine.
// It is meant for "right now": a request older than a minute is dropped, and signing out clears
// it, so on a shared front-desk PC it can never pop up later for the next person (security review).
const MAX_AGE_MS = 60 * 1000;
let pending = null; // { id, at }

// The Calendar asks: open this prospect when Prospects has loaded.
export function requestOpenProspect(id, now = Date.now()) {
  pending = typeof id === 'string' ? { id, at: now } : null;
}

// Prospects takes the request (once): returns the id, or null (none, or too old).
export function takeOpenProspect(now = Date.now()) {
  const p = pending;
  pending = null;
  return p && now - p.at <= MAX_AGE_MS ? p.id : null;
}

// Signing out forgets it.
export function clearOpenProspect() {
  pending = null;
}
