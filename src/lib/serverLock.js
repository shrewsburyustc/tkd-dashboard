// serverLock.js — the app's side of the database lock (migration 0002, guidelines 10b).
// Why it exists: hiding the dashboard behind the lock screen only stops people LOOKING at it.
// The database keeps its own "is this sign-in unlocked?" record per sign-in session, and from
// now on refuses data to a locked session. These helpers keep that record in step with the screen:
//   touchSession() — "I'm here and active": keeps an unlocked session unlocked, and tells us
//                    whether the database thinks this session is unlocked, locked, or needs the
//                    full password again.
//   lockSession()  — "lock me now" (sent whenever the lock screen shows; retried after reconnecting).
// Unlocking happens inside verify_pin / set_my_pin on the database side: a right PIN unlocks.
import { supabase } from './supabase.js';

const TOUCH_ANSWERS = ['unlocked', 'locked', 'password_required'];

// Always resolves to 'unlocked' | 'locked' | 'password_required' | 'error'.
// 'error' = couldn't ask (offline, server problem). Callers then keep the screen's own decision;
// the database still refuses data to a locked session either way.
export async function touchSession() {
  try {
    const { data, error } = await supabase.rpc('touch_session');
    if (error) return 'error';
    return TOUCH_ANSWERS.includes(data) ? data : 'error';
  } catch {
    return 'error'; // no network at all
  }
}

// The screen locks straight away whether or not this call works; it never waits for it.
// Resolves to true if the database got the message, false if not (offline, server problem).
// On false the App tries again once the device is back online (see App.jsx). Until then the
// database's own idle time still runs out and locks the session by itself.
export async function lockSession() {
  try {
    const { error } = await supabase.rpc('lock_session');
    return !error;
  } catch {
    return false; // no network at all
  }
}
