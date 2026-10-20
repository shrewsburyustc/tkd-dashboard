// financeApi.js — every call the Finance screens make to the database (migration 0011).
// Why it exists: like testing/eventsApi.js, it keeps the exact database function names and
// argument names (contract 0011 §1.4) in one place. Screens call friendly camelCase functions;
// each one returns the database's answer UNCHANGED (snake_case keys, exactly as §1.4 lists
// them), always with a `status` CODE — never words (the screens' text.js turns codes into words):
//   'ok' · 'no_access' · 'not_allowed' · 'not_found' · 'stale' · 'invalid' · 'note_required' ·
//   'nothing_to_close' · 'already_closed' · 'not_closed' · 'too_late'
//   'network_error' — the call itself failed (no connection, refused, or an answer that isn't
//   one of the above). Nothing was saved in that case.
// These functions NEVER throw.
//
// Arguments: dates 'YYYY-MM-DD' (school dates), times 'HH:MM' or null (Off), money whole cents.
// In preview mode supabase.rpc goes to the fake database (mockFinance.js via mockClient.js).
import { supabase } from '../supabase.js';

// Every status the database can answer (anything else is treated as a failed call).
export const FINANCE_STATUSES = [
  'ok', 'no_access', 'not_allowed', 'not_found', 'stale', 'invalid',
  'note_required', 'nothing_to_close', 'already_closed', 'not_closed', 'too_late',
];
const KNOWN = new Set(FINANCE_STATUSES);
const NETWORK_ERROR = Object.freeze({ status: 'network_error' });

// Calls one database function and hands back its jsonb answer as it is.
async function call(name, args) {
  try {
    if (!supabase) return { ...NETWORK_ERROR };
    const { data, error } = await supabase.rpc(name, args);
    if (error) return { ...NETWORK_ERROR };
    // A usable answer is an object with a known status code.
    if (!data || typeof data !== 'object' || Array.isArray(data) || !KNOWN.has(data.status)) return { ...NETWORK_ERROR };
    return data;
  } catch {
    return { ...NETWORK_ERROR };
  }
}

// Undefined → null, so a missing argument reaches the database as SQL null (it answers 'invalid').
const v = (value) => (value === undefined ? null : value);

// ----- Reads -----

// One school's day: totals, refunds, items, closing, can_close, can_undo_until, fingerprint.
// Staff: only today (another day → 'not_allowed').
export function financeDay({ locationCode, day } = {}) {
  return call('finance_day', { p_location_code: v(locationCode), p_day: v(day) });
}

// Both schools' summaries for a day (the Both view).
export function financeDayBoth({ day } = {}) {
  return call('finance_day_both', { p_day: v(day) });
}

// Admins: one month of days, newest first. locationCode null = both schools.
// month: any date in the month, e.g. '2026-10-01'.
export function financeHistory({ locationCode = null, month } = {}) {
  return call('finance_history', { p_location_code: v(locationCode), p_month: v(month) });
}

// One payment's detail + history of changes. source 'color_belt' | 'star' | 'camp' (v0.707; a camp
// payment's answer also has camp_days: the camper's days); paymentId = the
// item's payment_id (the chain's first row).
export function financePaymentDetail({ source, paymentId } = {}) {
  return call('finance_payment_detail', { p_source: v(source), p_payment_id: v(paymentId) });
}

// Which schools need the close-the-day reminder on Home now (+ admins' earlier unclosed days).
export function financeHome() {
  return call('finance_home', {});
}

// Admins: the reminder switch and the times per school and weekday.
export function financeSettingsGet() {
  return call('finance_settings_get', {});
}

// ----- Writes -----

// Close the day. expectedFingerprint = the `fingerprint` finance_day returned when the screen
// loaded ('stale' when the day changed since). cashCents is negative only when the expected
// cash is below zero ("Cash taken out of the drawer"). note: text or null.
export function financeCloseDay({ locationCode, day, expectedFingerprint, cashCents, checksCount, checksCents, cardCents, note = null } = {}) {
  return call('finance_close_day', {
    p_location_code: v(locationCode),
    p_day: v(day),
    p_expected_fingerprint: v(expectedFingerprint),
    p_cash_cents: v(cashCents),
    p_checks_count: v(checksCount),
    p_checks_cents: v(checksCents),
    p_card_cents: v(cardCents),
    p_note: v(note),
  });
}

// Undo a close: only the person who closed it, within 10 seconds ('too_late' after that).
export function financeUndoClose({ closingId } = {}) {
  return call('finance_undo_close', { p_closing_id: v(closingId) });
}

// Admins: reopen a closed day. expectedClosingId = closing.id from finance_day.
export function financeReopenDay({ locationCode, day, expectedClosingId } = {}) {
  return call('finance_reopen_day', { p_location_code: v(locationCode), p_day: v(day), p_expected_closing_id: v(expectedClosingId) });
}

// Admins: the rows for a CSV file (one school, at most 366 days). Each call is logged.
export function financeExport({ locationCode, from, to } = {}) {
  return call('finance_export', { p_location_code: v(locationCode), p_from: v(from), p_to: v(to) });
}

// Admins: how many payments a range holds and their total, for the Export dialog's count line.
// Same date rules as financeExport; nothing is logged. -> { status, count, total_cents }
export function financeExportPreview({ locationCode, from, to } = {}) {
  return call('finance_export_preview', { p_location_code: v(locationCode), p_from: v(from), p_to: v(to) });
}

// Admins: reminder On / Off.
export function financeSetReminderOn({ on, expectedVersion } = {}) {
  return call('finance_set_reminder_on', { p_on: v(on), p_expected_version: v(expectedVersion) });
}

// Admins: one school's time for one weekday (1 = Monday … 7 = Sunday); time 'HH:MM' or null (Off).
export function financeSetReminderTime({ locationCode, weekday, time = null, expectedVersion } = {}) {
  return call('finance_set_reminder_time', {
    p_location_code: v(locationCode), p_weekday: v(weekday), p_time: v(time), p_expected_version: v(expectedVersion),
  });
}

// Admins: copy each school's Monday time to Tuesday–Friday.
export function financeCopyMonday({ expectedVersion } = {}) {
  return call('finance_copy_monday', { p_expected_version: v(expectedVersion) });
}
