// mockStaff.js — the FAKE Staff accounts backend for preview mode (mockClient.js plugs it in).
// Why it exists: so the Staff accounts page and its Reset password / Reset PIN dialogs can be
// clicked through without a database. It answers admin_list_staff, admin_reset_password and
// admin_reset_pin with the same statuses and in the same order of checks as migration 0004.
//
// Fake accounts (besides you, the preview account): "Grandmaster" (the second admin, signed in
// on 1 device) and "Staff" (the shared front desk, signed in on 3 devices). A password reset
// signs that person's fake devices out, so a second reset says "0 devices". Nothing here is a
// real password: the fake store only remembers that a reset happened.
// failNext() makes the next reset fail like a dropped connection (console: failNextSave()).
import { isFourDigits, isPinTooEasy } from './pinRules.js';

const DEFAULT_ACCOUNTS = [
  { id: '00000000-0000-4000-8000-0000000000a2', full_name: 'Grandmaster', email: 'grandmaster@example.com', role: 'admin', is_shared: false, active: true, devices: 1 },
  { id: '00000000-0000-4000-8000-0000000000d1', full_name: 'Staff', email: 'shrewsburyustc@gmail.com', role: 'staff', is_shared: true, active: true, devices: 3 },
];

const answer = (value) => ({ data: value, error: null, status: 200 });
const status = (value, extra = {}) => answer({ status: value, ...extra });
const NETWORK_ERROR = { data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 };

export const STAFF_RPC_NAMES = ['admin_list_staff', 'admin_reset_password', 'admin_reset_pin'];

// loadStore / saveStore: read/write the fake accounts (localStorage in preview).
// me(): the preview account as a row ({ id, full_name, email, role }).
export function createStaffBackend({ loadStore, saveStore, me }) {
  let failNextCall = false;

  function accounts() {
    try {
      const saved = loadStore();
      if (Array.isArray(saved)) return saved;
    } catch {
      // missing or damaged: start from the defaults
    }
    return DEFAULT_ACCOUNTS.map((row) => ({ ...row }));
  }

  // Checks 0–4 of admin_reset_password / admin_reset_pin (0004), in the same order.
  function gate(args, ctx, valueKey) {
    if (!args.p_staff_id || args[valueKey] === null || args[valueKey] === undefined) return 'invalid';
    if (!ctx.signedIn || !ctx.isAdmin || !ctx.hasDataAccess) return 'not_allowed';
    if (!ctx.passwordWithin10Minutes) return 'password_required';
    if (args.p_staff_id === me().id) return 'own_account';
    if (!accounts().some((row) => row.id === args.p_staff_id && row.active)) return 'not_found';
    return null;
  }

  function rpc(name, args, ctx) {
    if (name !== 'admin_list_staff' && failNextCall) {
      failNextCall = false;
      return NETWORK_ERROR;
    }

    if (name === 'admin_list_staff') {
      if (!ctx.signedIn || !ctx.isAdmin || !ctx.hasDataAccess) return status('not_allowed');
      const self = me();
      const rows = [{ ...self, is_shared: ctx.isShared, active: true }, ...accounts()].filter((row) => row.active);
      const rank = (row) => (row.is_shared ? 2 : row.role === 'admin' ? 0 : 1);
      rows.sort((a, b) => rank(a) - rank(b) || a.full_name.toLowerCase().localeCompare(b.full_name.toLowerCase()));
      return status('ok', {
        accounts: rows.map((row) => ({
          id: row.id,
          full_name: row.full_name,
          email: row.email,
          role: row.role,
          is_shared: Boolean(row.is_shared),
          is_me: row.id === self.id,
        })),
      });
    }

    if (name === 'admin_reset_password') {
      const refused = gate(args, ctx, 'p_new_password');
      if (refused) return status(refused);
      const password = String(args.p_new_password);
      if (Array.from(password).length < 12) return status('too_short');
      if (new TextEncoder().encode(password).length > 72) return status('too_long');
      const rows = accounts();
      const row = rows.find((item) => item.id === args.p_staff_id);
      const signedOut = row.devices;
      row.devices = 0; // signed out everywhere
      saveStore(rows);
      return status('ok', { devices_signed_out: signedOut });
    }

    if (name === 'admin_reset_pin') {
      const refused = gate(args, ctx, 'p_pin');
      if (refused) return status(refused);
      if (!isFourDigits(args.p_pin)) return status('invalid');
      if (isPinTooEasy(args.p_pin)) return status('too_easy');
      return status('ok'); // nobody is signed out
    }

    return { data: null, error: { message: `Preview mode has no function named ${name}` }, status: 404 };
  }

  return {
    rpc,
    failNext() {
      failNextCall = true;
    },
    reset() {
      saveStore(DEFAULT_ACCOUNTS.map((row) => ({ ...row })));
    },
  };
}
