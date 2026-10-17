// staffAccounts.js — every call the Staff accounts screens make to the database, in one place.
// Why it exists: the screens shouldn't need to know the database function names or argument
// names (migration 0004). They call these three friendly functions and always get back a plain
// object with a `status`:
//   listStaff()                  → { status:'ok', accounts:[{ id, fullName, email, role, isShared, isMe }] }
//   resetPassword(id, password)  → { status:'ok', devicesSignedOut: n }
//   resetPin(id, pin)            → { status:'ok' }
// or one of the refusals the database sends back:
//   'not_allowed'        not an admin, or this sign-in is locked / signed out / too old
//   'password_required'  the admin's password check was more than 10 minutes ago
//   'own_account'        that's you (use Change password / Change PIN)
//   'not_found'          that account doesn't exist any more (or was switched off)
//   'too_short' / 'too_long'   password under 12 characters / over 72 bytes
//   'too_easy' / 'invalid'     PIN refused / an argument was missing or not 4 digits
//   'error'              anything else: no connection, or an answer we didn't expect
// These functions NEVER throw, so a screen can't crash because the Wi-Fi dropped.
//
// SAFETY: the password and PIN go to the database as rpc arguments, in the body of a POST
// request (supabase.rpc's default — never { get: true }, which would put them in the address,
// and addresses end up in server logs). Nothing here logs, stores or remembers them.
import { supabase } from './supabase.js';

const RESET_STATUSES = new Set([
  'ok', 'not_allowed', 'password_required', 'own_account', 'not_found',
  'too_short', 'too_long', 'too_easy', 'invalid',
]);

// One database call → { status, data }. Any error or odd answer becomes 'error'.
async function call(name, args) {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error || !data || typeof data.status !== 'string') return { status: 'error', data: null };
    return { status: data.status, data };
  } catch {
    return { status: 'error', data: null };
  }
}

// The Staff accounts list (admins only). Database snake_case → the app's camelCase.
export async function listStaff() {
  const { status, data } = await call('admin_list_staff', {});
  if (status === 'not_allowed') return { status };
  if (status !== 'ok' || !Array.isArray(data.accounts)) return { status: 'error' };
  return {
    status: 'ok',
    accounts: data.accounts.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      isShared: row.is_shared === true,
      isMe: row.is_me === true,
    })),
  };
}

// Give someone else a new password. The database signs them out everywhere (v0.72).
export async function resetPassword(staffId, newPassword) {
  const { status, data } = await call('admin_reset_password', { p_staff_id: staffId, p_new_password: newPassword });
  if (!RESET_STATUSES.has(status)) return { status: 'error' };
  if (status === 'ok') {
    const count = Number(data.devices_signed_out);
    return { status, devicesSignedOut: Number.isFinite(count) && count >= 0 ? count : 0 };
  }
  return { status };
}

// Give someone else a new 4-digit PIN (v0.75). Nobody is signed out.
export async function resetPin(staffId, pin) {
  const { status } = await call('admin_reset_pin', { p_staff_id: staffId, p_pin: pin });
  return { status: RESET_STATUSES.has(status) ? status : 'error' };
}

// How many BYTES a password takes (é = 2). bcrypt — and so the database — stops at 72.
export function passwordBytes(text) {
  return new TextEncoder().encode(text).length;
}

export const PASSWORD_MIN_CHARS = 12;
export const PASSWORD_MAX_BYTES = 72;
