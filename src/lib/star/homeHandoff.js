// homeHandoff.js — how Home's Grade button tells the Star event page which private testing to open
// (Star build phase 7, proposal 10, rulebook v0.515; follows v0.512 Q1 A and v0.513).
// Why it exists: the private grading page has NO address of its own (v0.512) — no candidate id may
// ever be in the address bar or in the browser's history. So Home's Grade opens the event's address
// (#testing/star/event/<id>, its Candidates tab) and leaves the candidate id HERE, in page memory
// (a plain variable in this file). When that event's page opens, it takes the id once and opens the
// private grading page straight away — the same as Candidates ⋯ → Grade private testing.
//
// "Page memory only" means:
//   * a reload empties it (the page's JavaScript starts again), so a reload never reopens the
//     private page (v0.512: reload → Candidates);
//   * it is taken ONCE: the first event page that opens empties it, whichever event that is;
//   * it is only good for a short while (HANDOFF_MS) and only for the event it was meant for, so an
//     id left behind (e.g. Back pressed before the page opened) can't open a private page later.
//
//   handOffPrivate({ eventId, candidateId, name })   Home's Grade, just before opening the event
//   peekPrivateHandoff(eventId) → { candidateId, name } | null   the event page's first draw (looks only)
//   takePrivateHandoff(eventId) → the same, and empties it        the event page, once, when it opens
//   clearPrivateHandoff()                            Home, when it shows again
const HANDOFF_MS = 60 * 1000; // long enough for Star's screens to load on a slow connection

let pending = null; // { eventId, candidateId, name, at }

export function handOffPrivate({ eventId, candidateId, name = '' }, now = Date.now()) {
  pending = { eventId, candidateId, name, at: now };
}

// Is there a hand-off for this event? Only looks — the page's first draw may run twice while
// developing (React's StrictMode), so it looks while drawing and takes it in an effect.
export function peekPrivateHandoff(eventId, now = Date.now()) {
  if (!pending || pending.eventId !== eventId || now - pending.at > HANDOFF_MS || now < pending.at) return null;
  return { candidateId: pending.candidateId, name: pending.name };
}

export function takePrivateHandoff(eventId, now = Date.now()) {
  const found = peekPrivateHandoff(eventId, now);
  pending = null; // one shot, whatever was found
  return found;
}

export function clearPrivateHandoff() {
  pending = null;
}

// Signing out empties it too (App.jsx sends 'tkd:signed-out'), so the next person to sign in on
// this device can never land on the previous person's private grading page — even inside the
// 60 seconds. (This file only loads while the Star testing switch is on.)
if (typeof window !== 'undefined') window.addEventListener('tkd:signed-out', clearPrivateHandoff);
