// session.js — reads "when did this person last type their password?" from the sign-in token.
// Why it exists: the rules say the full password is needed every 7 days. Supabase puts
// that time inside the access token (a JWT) in a field called `amr`
// ("authentication methods reference"). We read it here on the screen side; the database
// checks the same thing again on its side, so the screen is not the only guard.

// 7 days in milliseconds (days × hours × minutes × seconds × 1000).
export const PASSWORD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// A JWT is three parts joined by dots: header.payload.signature.
// The middle part is JSON encoded with "base64url". This turns it back into an object.
// We only READ it — checking the signature is the server's job.
export function decodeJwtPayload(token) {
  try {
    const payloadPart = token.split('.')[1];
    // base64url uses - and _ instead of + and /, and drops the = padding. Undo both.
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    // atob gives one character per byte; TextDecoder turns the bytes into proper UTF-8 text.
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null; // missing or malformed token
  }
}

// Returns the last password sign-in time in milliseconds, or null if there isn't one.
// `amr` looks like: [{ method: 'password', timestamp: 1760500000 }, ...] (timestamp in seconds).
export function getLastPasswordSignIn(session) {
  const payload = decodeJwtPayload(session?.access_token ?? '');
  const entries = Array.isArray(payload?.amr) ? payload.amr : [];
  let latestSeconds = null;
  for (const entry of entries) {
    if (entry?.method === 'password' && typeof entry.timestamp === 'number') {
      if (latestSeconds === null || entry.timestamp > latestSeconds) latestSeconds = entry.timestamp;
    }
  }
  return latestSeconds === null ? null : latestSeconds * 1000;
}

// True when the password must be typed again: no password time found, or older than 7 days.
export function isPasswordTooOld(session, now = Date.now()) {
  const lastPasswordSignIn = getLastPasswordSignIn(session);
  if (lastPasswordSignIn === null) return true;
  return now - lastPasswordSignIn > PASSWORD_MAX_AGE_MS;
}
