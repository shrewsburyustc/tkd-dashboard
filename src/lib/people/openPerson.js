// openPerson.js — "open this person's summary when their section shows" (M16; rulebook v1.144 D).
// Why it exists: a tap on a search result must open that person's summary in their own section, the way the
// section opens it from its own list. The id is handed over in memory (like prospects/openRequest.js) — never in
// the web address, so no person's id ends up in the browser's history. A reload forgets it.
// It is meant for "right now": a request older than a minute is dropped, and signing out clears it, so on a
// shared front-desk PC it can never pop up later for the next person.
// How a section uses it: once its data has loaded, ask  takeOpenPerson(['star'])  (the kinds it can open). It
// gets { kind, id, eventId } once, or null (none, too old, or a kind that isn't its own: then the request stays
// for the section that owns it). Then it opens the summary of the row with that id, the way a click on the row does;
// if the row isn't there (removed since), it opens nothing and says nothing.
const MAX_AGE_MS = 60 * 1000;
let pending = null; // { kind, id, eventId, at }

// The search asks: open this person when their section has loaded.
export function requestOpenPerson({ kind, id, eventId = null }, now = Date.now()) {
  pending = typeof kind === 'string' && typeof id === 'string' ? { kind, id, eventId, at: now } : null;
  // A section that is already showing hears this and looks again (useOpenPerson.js).
  if (pending && typeof window !== 'undefined') window.dispatchEvent(new Event('tkd:open-person'));
}

// A section takes the request (once) if it is one of its kinds. Returns { kind, id, eventId } or null.
export function takeOpenPerson(kinds, now = Date.now()) {
  const p = pending;
  if (!p) return null;
  if (now - p.at > MAX_AGE_MS) {
    pending = null;
    return null;
  }
  if (!kinds.includes(p.kind)) return null; // not this section's: leave it for the one that owns it
  pending = null;
  return { kind: p.kind, id: p.id, eventId: p.eventId };
}

// Is a request waiting for one of these kinds? (Doesn't take it.)
export function hasOpenPerson(kinds, now = Date.now()) {
  return Boolean(pending) && now - pending.at <= MAX_AGE_MS && kinds.includes(pending.kind);
}

// Signing out forgets it.
export function clearOpenPerson() {
  pending = null;
}

// A plain signal from App.jsx's sign-out: forget a waiting request (no import of this file needed there).
if (typeof window !== 'undefined') window.addEventListener('tkd:signed-out', clearOpenPerson);
