// myPin.js — saves the signed-in person's own new PIN (Set PIN and Change PIN).
// Why it exists: both screens call the same database function, set_my_pin, and need the same
// plain answer back. The database stores only a scrambled (bcrypt) copy of the PIN; nobody can
// read it back, not even admins.
import { supabase } from './supabase.js';

// Always resolves to one of:
//   'ok'                saved (and this sign-in is marked unlocked on the database side)
//   'invalid'           not exactly 4 digits
//   'too_easy'          all the same digit or a straight run (pinRules.js has the same rule)
//   'password_required' the password wasn't typed in the last 10 minutes (or the sign-in ended)
//   'not_allowed'       a shared account that already has a PIN (only an admin can change it)
//   'connection'        couldn't reach the database
export async function saveMyPin(pinDigits) {
  try {
    const { data, error, status } = await supabase.rpc('set_my_pin', { p_pin: pinDigits });
    // 401 = the sign-in itself has expired on the server, so only the password can help.
    if (error) return status === 401 ? 'password_required' : 'connection';
    return typeof data === 'string' ? data : 'connection';
  } catch {
    return 'connection'; // no network at all
  }
}
