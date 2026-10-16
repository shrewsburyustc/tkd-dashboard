// confirmPassword.js — "is this really you?" check used by Change PIN and Change password.
// Why it exists: someone could walk up to an unattended, signed-in screen. Before the PIN or
// password can be changed, the person must type their CURRENT password. We check it by simply
// signing in again with it (supabase.auth.signInWithPassword).
//
// Side effects worth knowing:
//   - A successful check is a real password sign-in, so it also refreshes the "last password
//     sign-in" time. That is what lets set_my_pin accept the new PIN (it wants a password
//     sign-in within the last 10 minutes).
//   - It starts a NEW sign-in session on this device (Supabase swaps it in for us). The database
//     lock is kept per session, so we call touchSession() straight away: the new session gets its
//     own "unlocked" record instead of waiting for the next heartbeat.
//   - A wrong password changes nothing: Supabase keeps the current session.
import { supabase } from './supabase.js';
import { classifySignInError } from './authErrors.js';
import { touchSession } from './serverLock.js';

// Resolves to 'ok' | 'credentials' | 'connection' | 'tooMany' (see authErrors.js).
// fallbackEmail: the profile's email, used only if the sign-in email can't be read.
export async function confirmPassword(fallbackEmail, password) {
  // The login email lives on the Supabase sign-in itself. The staff row has a copy (profile.email),
  // which should match — but the login one is the one that's always right.
  let email = fallbackEmail;
  try {
    const { data } = await supabase.auth.getSession();
    email = data?.session?.user?.email ?? fallbackEmail;
  } catch {
    // Couldn't read it: use the profile's copy.
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.session) return classifySignInError(error);
  } catch {
    return 'connection';
  }

  await touchSession(); // give the new session its unlocked record (see above)
  return 'ok';
}
