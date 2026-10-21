// deviceFinance.js — the two Finance settings that belong to THIS device (this browser), not to a person.
// Why it exists (contract 0011 §1.5, §3, §4):
//   - Refund layout (v0.209): how the Daily report shows Star refunds on this device —
//     'own' (a Refunds group at the end, the default) or 'in' (inside the Cash / Check groups).
//   - Hide private details (v0.215 "Hide payments", renamed and made dashboard-wide v0.506): a switch
//     anyone can flip in the account menu when students or parents can see the screen. While on,
//     Finance and the Home reminder link are hidden on this device (and, v0.506, every section
//     hides date of birth, email and payment details). Other sections use src/lib/privateDetails.js.
//     The key and event names below keep their old "hide payments" spelling ON PURPOSE: renaming
//     them would switch every device that has it on back to off.
// Both are kept in this browser's localStorage (like device.js keeps the default school), so the
// database never sees them. If storage is blocked, the defaults are used and nothing crashes.
// Every change tells open screens through window events, so they update without a reload:
//   'tkd:finance-device' (both settings) and 'tkd:hide-payments' (the hide switch only).
import { readStorage, writeStorage, removeStorage } from '../storage.js';

export const REFUND_LAYOUT_KEY = 'tkd.device.refundLayout';
export const HIDE_PAYMENTS_KEY = 'tkd.device.hidePayments';
export const FINANCE_DEVICE_EVENT = 'tkd:finance-device';
export const HIDE_PAYMENTS_EVENT = 'tkd:hide-payments';

const LAYOUTS = ['own', 'in'];
const DEFAULT_LAYOUT = 'own';

// Tells open screens that a device setting changed. Never throws (e.g. no window in Node).
function announce(names, detail) {
  try {
    for (const name of names) window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    // no window (tests) or events blocked: screens re-read the setting next time anyway
  }
}

// 'own' | 'in' — anything unknown or unreadable → 'own'.
export function getRefundLayout() {
  const saved = readStorage(REFUND_LAYOUT_KEY);
  return LAYOUTS.includes(saved) ? saved : DEFAULT_LAYOUT;
}

// Saves the layout ('own' or 'in'; anything else is ignored).
export function setRefundLayout(value) {
  if (!LAYOUTS.includes(value)) return;
  writeStorage(REFUND_LAYOUT_KEY, value);
  announce([FINANCE_DEVICE_EVENT], { refundLayout: value });
}

// true when payments are hidden on this device. Stored as 'true'; absent = off.
export function getHidePayments() {
  return readStorage(HIDE_PAYMENTS_KEY) === 'true';
}

// Turns hiding on (true) or off (false). Off removes the setting entirely.
export function setHidePayments(on) {
  if (on) writeStorage(HIDE_PAYMENTS_KEY, 'true');
  else removeStorage(HIDE_PAYMENTS_KEY);
  announce([FINANCE_DEVICE_EVENT, HIDE_PAYMENTS_EVENT], { hidePayments: Boolean(on) });
}
