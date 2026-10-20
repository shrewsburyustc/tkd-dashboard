// kiosk.js — what THIS tablet remembers while it is a front-desk kiosk.
// Why it exists: kiosk mode (rulebook v0.241 answer 3; kiosk plan K1–K4, docs/Prospects/
// TKD-Kiosk-Build-Plan.md) turns a signed-in tablet into a sign-up station: the dashboard is
// LOCKED (the same server lock as Lock now) and, instead of the lock screen, the app shows the
// kiosk (src/screens/kiosk/KioskApp.jsx). This file is the one place that knows how that is
// stored, so App.jsx, the Share dialog and the kiosk agree.
//
// What is kept (browser storage of this tablet only, key 'tkd.kiosk'):
//   { staffId, formId, slug, formName, token, expiresAt }
//   - staffId: the account that opened it. Another account signing in later never sees a kiosk.
//   - expiresAt: when the tablet stops taking new sign-ups (15 minutes before the token's end).
//   - token:   the kiosk token from forms_kiosk_token (0009): 64 hexadecimal characters. It only
//              raises the sign-up limit (120 an hour) and marks sign-ups "Kiosk"; it can't read
//              anything. It works for ONE form and ends after 12 hours (expiresAt) or when staff
//              press "End kiosk mode on all tablets".
// Leaving kiosk mode (the right PIN) forgets it (clearKiosk).
import { readStorage, removeStorage, writeStorage } from './storage.js';

const KEY = 'tkd.kiosk';
const TOKEN = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// The last 30 minutes: staff see "kiosk mode ends at …" on the welcome screen (K4).
export const KIOSK_WARN_MS = 30 * 60 * 1000;
// The tablet stops NEW sign-ups 15 minutes before the token itself ends (security review M2):
// a family that has just started can then always finish with a working token, instead of
// needing the server's fall-back (which counts against the normal 20-an-hour limit).
export const KIOSK_MARGIN_MS = 15 * 60 * 1000;

// Remember the kiosk (called by the Share dialog right before it locks the dashboard).
export function saveKiosk({ staffId, formId, slug, formName, token, hours }) {
  const entry = { staffId, formId, slug, formName, token, expiresAt: Date.now() + hours * 3600 * 1000 - KIOSK_MARGIN_MS };
  writeStorage(KEY, JSON.stringify(entry));
  return entry;
}

// The kiosk of this tablet for this account, or null. Anything damaged or for another account
// counts as "no kiosk" (it is then forgotten).
export function readKiosk(staffId) {
  let entry = null;
  try {
    entry = JSON.parse(readStorage(KEY));
  } catch {
    entry = null;
  }
  const ok = entry !== null && typeof entry === 'object'
    && typeof entry.staffId === 'string' && entry.staffId === staffId
    && typeof entry.formId === 'string' && UUID.test(entry.formId)
    && typeof entry.slug === 'string' && SLUG.test(entry.slug)
    && typeof entry.formName === 'string'
    && typeof entry.token === 'string' && TOKEN.test(entry.token)
    && Number.isFinite(entry.expiresAt);
  if (!ok) {
    if (entry !== null) removeStorage(KEY);
    return null;
  }
  return entry;
}

export function clearKiosk() {
  removeStorage(KEY);
}

// 'on' | 'ending' (the last 30 minutes) | 'ended' (12 hours are over)
export function kioskState(entry, now = Date.now()) {
  if (now >= entry.expiresAt) return 'ended';
  if (now >= entry.expiresAt - KIOSK_WARN_MS) return 'ending';
  return 'on';
}
