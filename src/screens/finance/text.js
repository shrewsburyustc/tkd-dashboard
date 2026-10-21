// text.js — every word the Finance screens show, in one place.
// Why it exists: the data layer (src/lib/finance) only returns codes such as 'stale' or
// 'note_required' (contract 0011 §0: "B returns codes, never words"); this file turns them into
// plain English. The wording comes from the approved mockups D1–D14
// (docs/Finance/TKD-Finance-DailyReport-Mockups.html) and the refund / hide-payments pictures
// (Questions #q12–#q14). Keeping it here makes it easy to check against the mockups and to change
// a sentence in ONE spot.
//
// Anything the mockups don't show is marked  // NOT IN MOCKUPS — for CP1  so Jeffrey can check it
// during the preview walkthrough (CP1).
import { money, dayShort, timeOfDay } from './format.js';

// ----- Page, tabs -----
export const PAGE_TITLE = 'Finance';
export const TAB_REPORT = 'Daily report';
export const TAB_SETTINGS = 'Settings';
export const LOADING = 'Loading the daily report'; // NOT IN MOCKUPS — for CP1 (screen-reader name of the gray skeleton)

// ----- Day row (D1, D4, D14) -----
export const STAFF_HINT = 'Staff see today only. Ask an admin for other days.';
export const todayTitle = (dateText) => `Today · ${dateText}`;
export const PREVIOUS_DAY = 'Previous day';
export const NEXT_DAY = 'Next day';
export const PICK_DATE = 'Pick a date';
export const TODAY = 'Today';
export const HISTORY = 'History';
export const PRINT = 'Print';
export const EXPORT = 'Export…';
export const MORE_ACTIONS = 'More actions';

// Refunds layout switch (Questions #q13, v0.209)
export const REFUNDS = 'Refunds';
export const LAYOUT_OWN = 'Own group';
export const LAYOUT_IN = 'In groups';
// Phone ⋯ sheet item that flips the layout. NOT IN MOCKUPS — for CP1 (v0.209 only says "phones: under ⋯")
export const LAYOUT_TO_IN = 'Refunds: show in groups';
export const LAYOUT_TO_OWN = 'Refunds: show as own group';

// ----- Metric cards (D1) -----
export const CARD_TOTAL = 'Total';
export const CARD_CASH = 'Cash';
export const CARD_CHECK = 'Check';
export const CARD_CARD = 'Card';
export const paymentsCount = (n) => `${n} payment${n === 1 ? '' : 's'}`;
export const refundsCount = (n) => `${n} refund${n === 1 ? '' : 's'}`;
// Total card with refunds, Own group (Questions #q12 B): "after $30.00 refunds"
export const afterRefunds = (cents) => `after ${money(Math.abs(cents))} refunds`;
// A card's sub line in "In groups" when it holds refunds: "4 payments, 1 refund" (#q12 A)
export const paymentsAndRefunds = (p, r) => (r > 0 ? `${paymentsCount(p)}, ${refundsCount(r)}` : paymentsCount(p));
export const jumpToGroup = (label) => `Show the ${label} payments`; // NOT IN MOCKUPS — for CP1 (screen-reader name of a clickable card)

// ----- Close the day box (D1, D2, D3, D13, #q12) -----
export const CLOSE_TITLE = 'Close the day';
export const CLOSE_OPEN_BUTTON = 'Close the day…'; // the outline button that opens the dialog (v0.800)
export const CLOSE_HINT = 'Count the drawer and type what you find. The dashboard compares it with today’s payments.';
// An earlier day an admin closes: "today’s" would be wrong. NOT IN MOCKUPS — for CP1
export const CLOSE_HINT_OTHER_DAY = 'Count the drawer and type what you find. The dashboard compares it with this day’s payments.';
export const CASH_LABEL = 'Cash counted in the drawer';
export const CASH_OUT_LABEL = 'Cash taken out of the drawer'; // #q12 / v0.209
export const CHECKS_LABEL = 'Checks in the drawer';
export const CHECKS_HOW_MANY = 'How many';
export const CHECKS_TOTAL = 'Total';
export const CARD_LABEL = 'Card machine total';
export const expectedCash = (cents) => `Expected ${money(cents)}`;
// With cash refunds: "Expected $300.00 ($320.00 in − $20.00 refunded)" (#q12 B / v0.209)
export const expectedCashWithRefunds = (expected, inCents, refunded) =>
  `Expected ${money(expected)} (${money(inCents)} in − ${money(refunded)} refunded)`;
// More cash went out than came in. NOT IN MOCKUPS — for CP1
export const expectedCashOut = (outCents, inCents, refunded) =>
  `Expected ${money(outCents)} taken out (${money(inCents)} in − ${money(refunded)} refunded)`;
export const expectedChecks = (count, cents) => `Expected ${count} check${count === 1 ? '' : 's'}, ${money(cents)}`;
export const expectedCard = (cents) => `Expected ${money(cents)} · from the machine’s day report`;
export const NOTE_LABEL = 'Note';
export const NOTE_NEEDED = '(needed when anything is short or over)';
export const CLOSE_BUTTON = 'Close the day';
export const RETRY_CLOSE = 'Retry close the day';
export const FILL_ALL_FIRST = 'Fill in all three counts first.';
export const SAVES_WITH_NAME = 'Saves the count with your name.';
export const NOT_SAVED = 'Not saved';
export const CLOSE_FAILED = 'Couldn’t close the day. Nothing you typed is lost. Check the connection and try again.';

// Tags (D2). Success tags have no icon (v0.207).
export const MATCHES = 'Matches';
export const shortBy = (cents) => `Short ${money(cents)}`;
export const overBy = (cents) => `Over ${money(cents)}`;
// Checks: "If only one part is off, its tag says which (e.g. 'Total short $5.00')" (D1 proposal)
export const totalShortBy = (cents) => `Total short ${money(cents)}`;
export const totalOverBy = (cents) => `Total over ${money(cents)}`;
// The count of checks is off. NOT IN MOCKUPS — for CP1
export const checksShort = (n) => `${n} check${n === 1 ? '' : 's'} short`;
export const checksOver = (n) => `${n} check${n === 1 ? '' : 's'} over`;
// Both parts off. NOT IN MOCKUPS — for CP1
export const checksBothOff = (countText, cents, isShort) => `${countText}, ${isShort ? 'short' : 'over'} ${money(cents)}`;

// Typing problems under a count field. NOT IN MOCKUPS — for CP1
export const FIELD_NOT_NUMBER = 'Type an amount, like 300.00.';
export const FIELD_TOO_HIGH = 'That’s more than $100,000.00. Check the amount.';
export const FIELD_COUNT_NOT_NUMBER = 'Type a whole number, like 2.';
export const FIELD_COUNT_TOO_HIGH = 'That’s more than 500 checks. Check the number.';

// The note is missing (D2): "Cash is short $20.00. Add a note saying what happened."
export function noteMissing(part, isShort, cents, countDiff) {
  const word = isShort ? 'short' : 'over';
  if (part === 'cash') return `Cash is ${word} ${money(cents)}. Add a note saying what happened.`;
  // NOT IN MOCKUPS — for CP1 (checks / card versions of the same sentence)
  if (part === 'checks' && countDiff) {
    return `Checks are ${word} ${countDiff} check${countDiff === 1 ? '' : 's'}. Add a note saying what happened.`;
  }
  if (part === 'checks') return `Checks are ${word} ${money(cents)}. Add a note saying what happened.`;
  return `The card machine total is ${word} ${money(cents)}. Add a note saying what happened.`;
}

// ----- Day closed (D3, D4) -----
export const DAY_CLOSED = 'Day closed';
export const CLOSED_TAG = 'Closed'; // success, no icon (D5 / D6)
export const CHANGED_AFTER_CLOSING = 'Changed after closing';
export const cashShortTag = (cents) => `Cash short ${money(cents)}`;
export const cashOverTag = (cents) => `Cash over ${money(cents)}`;
// NOT IN MOCKUPS — for CP1 (only "Cash short / over" is drawn)
export const checksShortTag = (cents) => `Checks short ${money(cents)}`;
export const checksOverTag = (cents) => `Checks over ${money(cents)}`;
export const cardShortTag = (cents) => `Card short ${money(cents)}`;
export const cardOverTag = (cents) => `Card over ${money(cents)}`;
// History tag when the answer doesn't say which part (contract §1.4 sends only diff_cents).
export const shortTag = (cents) => `Short ${money(cents)}`; // NOT IN MOCKUPS — for CP1
export const overTag = (cents) => `Over ${money(cents)}`; // NOT IN MOCKUPS — for CP1

// "Closed by Staff at 1:42 PM · Cash counted $300.00 (short $20.00) · Checks 2, $210.00 · Card machine $135.00"
export const closedBy = (name, at) => `Closed by ${name} at ${timeOfDay(at)}`;
export const cashCountedPart = (cents, resultText) => `Cash counted ${money(cents)}${resultText ? ` (${resultText})` : ''}`;
export const cashOutPart = (cents, resultText) => `Cash taken out ${money(cents)}${resultText ? ` (${resultText})` : ''}`; // NOT IN MOCKUPS — for CP1
export const checksPart = (count, cents, resultText) => `Checks ${count}, ${money(cents)}${resultText ? ` (${resultText})` : ''}`;
export const cardPart = (cents, resultText) => `Card machine ${money(cents)}${resultText ? ` (${resultText})` : ''}`;
export const resultShort = (cents) => `short ${money(cents)}`;
export const resultOver = (cents) => `over ${money(cents)}`;
// Only the number of checks was off. NOT IN MOCKUPS — for CP1
export const resultCount = (isShort, n) => `${isShort ? 'short' : 'over'} ${n} check${n === 1 ? '' : 's'}`;
export const checksCountTag = (isShort, n) => `Checks ${isShort ? 'short' : 'over'} ${n} check${n === 1 ? '' : 's'}`;
export const checksShortPlain = 'Checks short'; // History, when only the number of checks was off. NOT IN MOCKUPS — for CP1
export const checksOverPlain = 'Checks over'; // NOT IN MOCKUPS — for CP1
export const RESULT_MATCHES = 'matches'; // used on the printed page (D8)
export const noteLine = (note) => `Note: “${note}”`;
export const REOPEN_DAY = 'Reopen day';
export const REOPEN_HINT = 'Reopening is logged. This count stays in the history.';

// Changed after closing line (D4): "3 payments changed after closing: 1 added on Sat at 4:05 PM,
// 2 corrected on Mon, Oct 26 by Jeffrey. The totals above no longer match this count."
export function changedAfterLine({ count, added, addedAt, corrected, correctedOn, correctedBy }) {
  const parts = [];
  if (added > 0) {
    // "1 added on Sat at 4:05 PM" — the time only when there is exactly one
    parts.push(added === 1 && addedAt ? `1 added on ${addedAt}` : `${added} added`);
  }
  if (corrected > 0) {
    let text = `${corrected} corrected`;
    if (correctedOn) text += ` on ${correctedOn}`;
    if (correctedBy) text += ` by ${correctedBy}`;
    parts.push(text);
  }
  const head = `${count} payment${count === 1 ? '' : 's'} changed after closing`;
  return `${head}${parts.length ? `: ${parts.join(', ')}` : ''}. The totals above no longer match this count.`;
}

// ----- Toasts and messages for closing (D3) -----
export const DRAWER_CLOSED = 'Today’s drawer is closed.';
export const drawerClosedOn = (day) => `The drawer for ${dayShort(day)} is closed.`; // NOT IN MOCKUPS — for CP1 (admin closing an earlier day)
export const UNDO = 'Undo';
export const CLOSE_UNDONE = 'Close undone. The day is open again.'; // NOT IN MOCKUPS — for CP1
export const TOO_LATE_UNDO = 'Too late to undo here. Ask an admin to reopen the day.'; // D3 proposal text
export const UNDO_FAILED = 'Couldn’t undo. Check the connection, then try again.'; // NOT IN MOCKUPS — for CP1
export const DAY_REOPENED = 'Day reopened. It can be counted again.'; // NOT IN MOCKUPS — for CP1
export const REOPEN_FAILED = 'Couldn’t reopen the day. Check the connection, then try again.'; // NOT IN MOCKUPS — for CP1
export const NOT_CLOSED_ANY_MORE = 'This day isn’t closed any more. Someone reopened it just now.'; // NOT IN MOCKUPS — for CP1
export const ALREADY_CLOSED = 'Someone else closed this day just now. Check their count below.'; // NOT IN MOCKUPS — for CP1
export const NOTHING_TO_CLOSE_NOW = 'There’s nothing to close any more: the payments were undone.'; // NOT IN MOCKUPS — for CP1

// ----- Shared messages -----
// The same sentence the Testing screens use for a stale write (contract §4: amber + reload).
export const STALE = 'Someone else changed this just now. Your change wasn’t saved.';
export const NOT_ALLOWED = 'Only an admin can do that.'; // NOT IN MOCKUPS — for CP1
export const LOAD_FAILED = 'Couldn’t load the daily report. Check the connection, then retry.'; // NOT IN MOCKUPS — for CP1
export const LOAD_HISTORY_FAILED = 'Couldn’t load History. Check the connection, then retry.'; // NOT IN MOCKUPS — for CP1
export const LOAD_SETTINGS_FAILED = 'Couldn’t load the settings. Check the connection, then retry.'; // NOT IN MOCKUPS — for CP1
export const RETRY = 'Retry';
export const DISMISS = 'Dismiss';
export const BACK = 'Back';
export const CLOSE = 'Close';
export const CANCEL = 'Cancel';

// ----- Payments list (D1, D4, #q12) -----
export const COL_TIME = 'Time';
export const COL_STUDENT = 'Student';
export const COL_FOR = 'For';
export const COL_AMOUNT = 'Amount';
export const COL_RECORDED_BY = 'Recorded by';
export const GROUP_CASH = 'Cash';
export const GROUP_CHECK = 'Check';
export const GROUP_CARD = 'Card';
export const GROUP_REFUNDS = 'Refunds';
// "Cash · 4 payments · $320.00"; In groups with refunds: "Cash · 4 payments, 1 refund · $300.00"
export const groupHead = (payments, refunds, cents) => ` · ${paymentsAndRefunds(payments, refunds)} · ${money(cents)}`;
// "Refunds · 2 · −$30.00 (cash −$20.00, check −$10.00)"
export function refundsHead(count, cents, cashCents, checkCents) {
  const parts = [];
  if (cashCents) parts.push(`cash ${money(cashCents)}`);
  if (checkCents) parts.push(`check ${money(checkCents)}`);
  return ` · ${refundsCount(count)} · ${money(cents)}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}
export const WHAT_COLOR_BELT = 'Color belt testing';
export const WHAT_STAR = 'Star testing';
export const WHAT_STAR_PRIVATE = 'Star testing, private'; // NOT IN MOCKUPS — for CP1 (contract §1.3 is_private)
// Camp payments (Camps v0.707): the row reads "Camp · April Vacation Camp".
export const WHAT_CAMP = 'Camp';
export const METHOD = { cash: 'Cash', check: 'Check', card: 'Card' };
export const methodLower = (m) => (METHOD[m] ?? m ?? '').toLowerCase();

// Tags on a payment row (one per row, rule 8)
export const TAG_UNDONE = 'Undone';
export const TAG_EDITED = 'Edited';
export const TAG_MOVED = 'Moved'; // NOT IN MOCKUPS — for CP1 (D4 proposal shows only "Moved to <date>")
export const TAG_ADDED_AFTER = 'Added after closing';
export const TAG_REFUND = 'Refund'; // #q12 A
// Second lines
export const undoneLine = (name, on) => `Undone by ${name} · ${dayShort(on)} · not counted`;
export const editedLine = (wasText, name, on) => `Was ${wasText} · edited by ${name} · ${dayShort(on)}`;
export const movedToLine = (to) => `Moved to ${dayShort(to)}`; // D4 proposal
// NOT IN MOCKUPS — for CP1 (the new day of a moved payment)
export const movedFromLine = (from, wasText, name, on) =>
  `Moved from ${dayShort(from)}${wasText ? ` · was ${wasText}` : ''}${name ? ` · edited by ${name}` : ''}${on ? ` · ${dayShort(on)}` : ''}`;
export const addedAfterLine = (time) => `Recorded at ${time}, after the day was closed`;
export const refundMethodNote = (method) => methodLower(method); // Own group: "Nov 14 · cash" (#q12 B)

// ----- Empty day (D11) -----
export const NO_PAYMENTS_TODAY = 'No payments recorded today.';
export const NO_PAYMENTS_DAY = 'No payments recorded on this day.'; // NOT IN MOCKUPS — for CP1 (admin, earlier day)
export const NOTHING_TO_CLOSE = 'Nothing to close. Payments recorded in Testing and Camps appear here.'; // "and Camps" (not in the mockups, Camps v0.707)

// ----- Both (D6) -----
export const NOT_CLOSED_YET = 'Not closed yet';
export const NO_PAYMENTS = 'No payments';
export const openSchool = (name) => `Open ${name}`;
export const bothTogether = (cents, n) => [`Both schools together: `, money(cents), ` · ${paymentsCount(n)}`];
export const BOTH_HINT = 'Each school closes its own drawer. Open a school to see its payments and close its day.';
export const bothBreakdown = (cash, check, card) => `Cash ${money(cash)} · Check ${money(check)} · Card ${money(card)}`;

// ----- History (D5) -----
export const BACK_TO_DAY = 'Back to the day';
export const PREVIOUS_MONTH = 'Previous month';
export const NEXT_MONTH = 'Next month';
export const COL_DAY = 'Day';
export const COL_TOTAL = 'Total';
export const COL_CLOSED_BY = 'Closed by';
export const COL_STATUS = 'Status';
export const COL_SCHOOL = 'School';
export const closedByShort = (name, at) => `${name} · ${timeOfDay(at)}`;
export const closedByLine = (name, at) => `Closed by ${name} · ${timeOfDay(at)}`;
export const TAG_TODAY_OPEN = 'Today · open';
export const TAG_NOT_CLOSED = 'Not closed';
export const TAG_NO_PAYMENTS = 'No payments';
export const HISTORY_HINT = 'Click a day to open its report. Newest first.';
export const HISTORY_HINT_TOUCH = 'Tap a day to open its report. Newest first.'; // NOT IN MOCKUPS — for CP1 ("Click" on a touch screen)
// "1 day this month wasn't closed: Tue, Oct 20."
export function unclosedLine(count, days) {
  if (count === 1) return `1 day this month wasn’t closed: ${days[0] ?? ''}.`;
  // NOT IN MOCKUPS — for CP1 (more than one)
  return `${count} days this month weren’t closed: ${days.join(', ')}.`;
}
export const NO_DAYS_YET = 'No days to show for this month yet.'; // NOT IN MOCKUPS — for CP1
export const openDay = (dayText) => `Open ${dayText}`; // NOT IN MOCKUPS — for CP1 (screen-reader name of a row)

// ----- Export (D7) -----
export const EXPORT_TITLE = 'Export payments';
export const EXPORT_HINT =
  'Downloads a CSV file (opens in Excel or Google Sheets). It holds students’ names and amounts, so each download is logged.';
export const FROM = 'From';
export const TO = 'To';
export const SCHOOL = 'School';
export const FROM_TOP_BAR = '(from the top bar)';
export const exportSummary = (count, cents) => `${paymentsCount(count)} · ${money(cents)}`;
export const EXPORT_COUNTING = 'Counting…'; // NOT IN MOCKUPS — for CP1
export const DOWNLOAD_CSV = 'Download CSV';
export const EXPORT_FAILED = 'Couldn’t make the file. Check the connection, then try again.'; // NOT IN MOCKUPS — for CP1
export const EXPORT_DONE = 'CSV downloaded'; // NOT IN MOCKUPS — for CP1
// Date problems. NOT IN MOCKUPS — for CP1
export const DATE_MISSING = 'Pick a date.';
export const DATE_FUTURE = 'Pick today or an earlier day.';
export const DATE_ORDER = 'To must be on or after From.';
export const DATE_TOO_LONG = 'Pick at most one year at a time.';
export const csvFileName = (school, from, to) => `${school}-${from}-to-${to}.csv`;

// ----- Printed page (D8) -----
export const printTitle = (school) => `Daily report · ${school}`;
export const SCHOOL_NAME = 'Jae H. Jeong’s U.S. Taekwondo Center';
export const printedBy = (when, name) => `printed ${when} by ${name}`;
export const PRINT_NOT_CLOSED = 'Not closed yet'; // D8: "If the day isn't closed yet, the count line says 'Not closed yet'"
export const COUNTED_BY = 'Counted by: ______________________';
export const DATE_LINE = 'Date: ____________';

// ----- Payment detail (D12) -----
export const detailTitle = (name, isRefund) => `${name} · ${isRefund ? 'refund' : 'payment'}`; // "refund" NOT IN MOCKUPS — for CP1
export const D_FOR = 'For';
export const D_PAID_BY = 'Paid by';
export const D_REFUNDED_BY = 'Refunded by'; // NOT IN MOCKUPS — for CP1
export const D_AMOUNT = 'Amount';
export const D_DATE_PAID = 'Date paid';
export const D_RECORDED = 'Recorded';
export const D_HISTORY = 'History';
export const detailFor = (what, eventDate, school) => `${what} · ${eventDate}${school ? ` (${school})` : ''}`;
export const recordedAt = (whenText, name) => `${whenText} by ${name}`;
export const DETAIL_HINT = 'Payments are changed on the event’s page in Testing, not here.';
export const OPEN_IN_TESTING = 'Open in Testing';
// A camp payment's detail (Camps v0.707): the camp's days, and the way to the camp's page.
export const D_CAMP_DAYS = 'Camp days'; // (not in the mockups)
export const D_PAID_AT = 'Paid at'; // (not in the mockups) the school whose drawer has a camp payment
export const DETAIL_HINT_CAMP = 'Payments are changed on the camp’s page in Camps, not here.'; // (not in the mockups)
export const OPEN_IN_CAMPS = 'Open in Camps'; // (not in the mockups)
export const DETAIL_LOAD_FAILED = 'Couldn’t load this payment. Check the connection, then retry.'; // NOT IN MOCKUPS — for CP1
export const DETAIL_LOADING = 'Loading…'; // NOT IN MOCKUPS — for CP1
// History lines: "Mon, Oct 26, 9:07 AM · Jeffrey changed the amount $70.00 → $65.00"
export function historyLine(entry, previous) {
  const by = entry.by_name;
  if (entry.what === 'recorded') return `${by} recorded ${money(entry.amount_cents)} by ${methodLower(entry.method)}`;
  if (entry.what === 'undone') return `${by} undid it`; // NOT IN MOCKUPS — for CP1
  if (entry.what === 'refunded') return `${by} recorded a refund of ${money(Math.abs(entry.amount_cents))} by ${methodLower(entry.method)}`; // NOT IN MOCKUPS — for CP1
  // 'edited': say what changed compared with the line before it
  const changes = [];
  if (previous && previous.amount_cents !== entry.amount_cents) {
    changes.push(`changed the amount ${money(previous.amount_cents)} → ${money(entry.amount_cents)}`);
  }
  // NOT IN MOCKUPS — for CP1 (method and date changes)
  if (previous && previous.method !== entry.method) changes.push(`changed how paid ${methodLower(previous.method)} → ${methodLower(entry.method)}`);
  if (previous && previous.paid_on !== entry.paid_on) changes.push(`moved it to ${dayShort(entry.paid_on)}`);
  if (changes.length === 0) changes.push('edited it');
  return `${by} ${changes.join(' and ')}`;
}

// ----- Settings (D9) -----
export const REMINDER_TITLE = 'Close-the-day reminder';
export const REMINDER_HINT =
  'From this time, Home shows “Today’s drawer isn’t closed yet” on days the school took payments, until the day is closed.';
export const ON = 'On';
export const OFF = 'Off';
export const REMINDER_SWITCH = 'Close-the-day reminder'; // the switch's screen-reader name
export const COPY_MONDAY = 'Copy each school’s Monday to Tue–Fri';
export const SETTINGS_FOOT = 'Each change saves at once with a 5-second Undo, and is logged. Only admins see this tab.';
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const timeFor = (weekday, school) => `${weekday} reminder time at ${school}`; // screen-reader name of a dropdown. NOT IN MOCKUPS — for CP1
export const SCHOOL_SWITCH = 'School'; // phone switch's screen-reader name. NOT IN MOCKUPS — for CP1
// Toasts. NOT IN MOCKUPS — for CP1
export const REMINDER_ON_TOAST = 'Reminder turned on';
export const REMINDER_OFF_TOAST = 'Reminder turned off';
export const timeSavedToast = (weekday, school) => `${weekday} at ${school} saved`;
export const COPIED_TOAST = 'Monday copied to Tue–Fri';
export const SETTINGS_SAVE_FAILED = 'Couldn’t save. Check the connection, then try again.';

// ----- Home (D10) -----
export const DRAWER_NOT_CLOSED = 'Today’s drawer isn’t closed yet.';
export const schoolDrawerNotClosed = (school) => `${school}’s drawer isn’t closed yet.`;
export const CLOSE_THE_DAY_LINK = 'Close the day';
export function earlierNotClosed(count, firstDay) {
  if (count === 1) return `1 earlier day wasn’t closed: ${dayShort(firstDay)}.`;
  // NOT IN MOCKUPS — for CP1 (more than one)
  return `${count} earlier days weren’t closed, the first on ${dayShort(firstDay)}.`;
}
// One school chosen: that school's days only. NOT IN MOCKUPS — for CP1 (D10 draws the line without a school)
export function earlierNotClosedAt(school, count, firstDay) {
  if (count === 1) return `1 earlier day at ${school} wasn’t closed: ${dayShort(firstDay)}.`;
  return `${count} earlier days at ${school} weren’t closed, the first on ${dayShort(firstDay)}.`;
}
export const OPEN_HISTORY = 'Open History';

// ----- Hide private details (was Hide payments, Questions #q14, v0.215; renamed v0.506) -----
// The switch is dashboard-wide now, so its words live with it in src/lib/privateDetails.js
// (HIDE_PRIVATE_DETAILS, PRIVATE_DETAILS_HIDDEN, SHOW_PRIVATE_DETAILS).
