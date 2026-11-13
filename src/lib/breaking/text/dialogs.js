// dialogs.js — every word the Board breaking student and payment dialogs show, in one place.
// Why it exists: like the other sections' text.js files, keeping the sentences here makes them easy to check
// against the approved pictures (docs/Board Breaking/Mockups/B-staff-gen.mjs) and to change in ONE spot. The data
// layer (breakingApi.js) only returns status CODES such as 'stale'; the dialogs turn them into these words.
// The generic save / unsaved / stale sentences are the dashboard's shared ones (Color Belt's text.js), so a failed
// save reads the same in every section.
import { formatMoney } from '../../money.js';
import {
  CANCEL, DISCARD_CHANGES, INVALID_DIALOG, ROSTER_NOT_ALLOWED, SAVE, SAVE_FAILED, SAVING, STALE_DIALOG, STALE_DIALOG_PHONE, UNSAVED,
} from '../../../screens/testing/text.js';
import { UNDO, UNDONE } from '../../../components/text.js';

export { CANCEL, DISCARD_CHANGES, INVALID_DIALOG, ROSTER_NOT_ALLOWED, SAVE, SAVE_FAILED, SAVING, STALE_DIALOG, STALE_DIALOG_PHONE, UNSAVED, UNDO, UNDONE };

export const SCHOOL_NAMES = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
export const schoolName = (code) => SCHOOL_NAMES[code] ?? '';
export const PAYING_BY_TEXT = { cash: 'Cash', check: 'Check', card: 'Card' };

// ----- Add student / Edit student -----
export const ADD_STUDENT_TITLE = 'Add student';
export const EDIT_STUDENT_TITLE = 'Edit student';
export const addStudentSub = (event) => `${event.name} · ${schoolName(event.locationCode)} school`;
export const editStudentSub = (name, event) => `${name} · ${event.name}`;
export const FIRST_NAME = 'First name';
export const LAST_NAME = 'Last name';
export const AGE = 'Age';
export const RANK = 'Rank';
export const RANK_PLACEHOLDER = 'Choose a rank';
export const CLASS_LABEL = 'Class';
export const TECH_BOARDS = 'Technical boards';
export const ADULT_BOARDS = 'Adult boards';
export const fewer = (label) => `Fewer ${label.toLowerCase()}`;
export const more = (label) => `More ${label.toLowerCase()}`;
export const PAYING_BY = 'Paying by';
export const ADD_BUTTON = 'Save'; // the approved picture's footer button is Save in both boxes
export const ADD_FOOTNOTE = 'Added at the desk. Card here means taken at the desk, so no Square link is sent.';
export const recommendedClassHint = (className, rank) => `${className} is the recommended class for ${rank}. Any class is fine.`;
export const moveHint = (first, from, to) => `${first} will move from ${from} to ${to}.`;
export const chartFill = (age, rank, chartName) => `Filled in from age ${age} and ${rank} (${chartName}). Change them if the student breaks a different number.`;
export const chartDiffers = (age, rank, chartName, tech, adult) => `The ${chartName} says ${tech} Technical · ${adult} Adult for age ${age} and ${rank}.`;
export const CHART_NAMES = { tiger: 'Little Tiger chart', child: 'Child chart', teen: 'Teen / Adult chart', black: 'Black Belt chart' };
export const AMOUNT_WORD = 'Amount';
export const amountBig = (cents) => `${AMOUNT_WORD} ${formatMoney(cents)}`;
export const eventDayNote = (extraCents) => `Event day: +${formatMoney(extraCents)} per board.`;
// Paying cash or check takes this off every board (the listed price is the card price); nothing is shown for a card.
export const discountNote = (cents) => `Cash or check discount −${formatMoney(cents)} per board.`;
export const OVERRIDE_LABEL = 'Override price (admins only)';
export const OVERRIDE_INPUT_LABEL = 'Price for this student';
export const overrideLine = (wouldBe, explain) => `Set by hand. The price would be ${formatMoney(wouldBe)} (${explain}).`;
export const linkCancelOffCard = (way) => `Their Square payment link will be cancelled so it can't mark them paid later. Collect ${way === 'cash' ? 'cash' : 'the check'} at the desk.`;
export const LINK_CANCEL_AMOUNT = "The old Square payment link will be cancelled because the amount changed, so it can't mark them paid later. Take the card payment on the Square terminal.";

// Field problems (shown under the field after Save is pressed).
export const NAME_EMPTY = 'Enter a name.';
export const NAME_LONG = 'Use 60 letters or fewer.';
export const AGE_EMPTY = 'Enter an age.';
export const AGE_BAD = 'Enter the age as a whole number from 1 to 99.';
export const RANK_EMPTY = 'Choose a rank.';
export const CLASS_EMPTY = 'Choose a class.';
export const BOARDS_NONE = 'Choose at least one board.';
export const BOARDS_BAD = 'Boards go from 0 to 12 of each.';
export const OVERRIDE_BAD = 'Enter a price from $0 to $10,000, like 8 or 8.25.';
export const amountBelowPaid = (paidCents) => `They've already paid ${formatMoney(paidCents)}, more than the new amount.`;
// While Hide private details is on, no amount is written (Color Belt's and Camps' dialogs do the same).
export const AMOUNT_BELOW_PAID_HIDDEN = "They've already paid more than the new amount.";
export const OVERRIDE_NOT_SAVED = "The student was saved, but the price set by hand wasn't. Check the connection, then save again.";
export const EVENT_GONE = "This event or student was changed or removed just now. Your change wasn't saved. Cancel, then open it again to see the latest.";

// Toasts
export const addedToast = (name) => `${name} added`;
export const updatedToast = (name) => `${name} updated`;
export const movedToast = (name, className) => `${name} moved to ${className}`;

// ----- Move to class -----
export const MOVE_TITLE = 'Move to class';
export const moveSub = (name) => name;
export const MOVE_BUTTON = 'Move';

// ----- History -----
export const historyTitle = (name) => `History · ${name}`;
export const HISTORY_NONE_YET = 'No changes recorded yet.';
export const HISTORY_LOADING = 'Loading…';
export const HISTORY_FAILED = "Couldn't load the history. Check the connection, then retry.";
export const HISTORY_HIDDEN = 'Payment history is hidden on this tablet.';
export const CLOSE = 'Close';
export const historyWhen = (date, who) => [date, who].filter(Boolean).join(' · ');

// ----- Delete student -----
export const deleteTitle = (name) => `Delete ${name}?`;
export const deleteBody = (name) => `This removes ${name} from the roster. This can't be undone.`;
export const KEEP_STUDENT = 'Keep student';
export const DELETE_STUDENT = 'Delete student';
export const DELETING = 'Deleting…';
export const deleteHasPayments = (name) => `${name} has payments on record, so the student can't be deleted. Undo the payment first, or leave the student on the roster.`;
export const DELETE_FAILED = "Couldn't delete. Check the connection, then retry.";
export const DELETE_STALE = "Someone else changed this student just now. Close this box, then open it again to see the latest.";
export const deletedToast = (name) => `${name} deleted`;

// ----- Record refund -----
export const REFUND_TITLE = 'Record refund';
export const refundSub = (name, paidCents, overpaidCents) => `${name} · paid ${formatMoney(paidCents)} · ${formatMoney(overpaidCents)} overpaid`;
export const REFUNDED_BY = 'Refunded by';
export const AMOUNT = 'Amount';
export const DATE_REFUNDED = 'Date refunded';
export const refundUpTo = (cents) => `Up to ${formatMoney(cents)}, the amount overpaid.`;
export const refundTooLarge = (cents) => `Can't be more than the ${formatMoney(cents)} overpaid.`;
export const REFUND_AMOUNT_PROBLEM = 'Enter an amount in dollars, like 8 or 8.25.';
export const REFUND_AMOUNT_ZERO = 'Enter an amount more than $0.';
export const ENTER_DATE_REFUNDED = 'Enter the date refunded.';
export const NOTHING_OVERPAID = 'Nothing is overpaid any more. Someone else changed this just now. Close this to see the latest.';
export const countsAt = (school) => `Counts at ${school}, this device's school.`;
export const SCHOOL_REFUSED = 'Pick the school where it was handed back.';
export const refundedToast = (cents, method) => `Refund recorded · ${formatMoney(cents)} ${method}`;
export const FUTURE_DAYS_HINT = "Days after today can't be chosen.";
export const REFUND_UNDO_FAILED = "Undo didn't save. Check the connection, then try again.";
export const REFUND_UNDO_REFUSED = "The refund couldn't be undone. Close this and look at the student's payments.";

// ----- Edit payment -----
export const EDIT_PAYMENT_TITLE = 'Edit payment';
export const editPaymentSub = (name) => name;
export const PAID_BY = 'Paid by';
export const PAID_AT = 'Paid at';
export const DATE_PAID = 'Date paid';
export const ENTER_DATE_PAID = 'Enter the date paid.';
export const AMOUNT_PROBLEM = 'Enter an amount in dollars, like 12 or 9.75.';
export const AMOUNT_ZERO = 'Enter an amount more than $0.';
export const AMOUNT_TOO_HIGH = 'Enter an amount up to $10,000.';
export const EDIT_PAYMENT_HINT = 'The old payment stays in the history and a corrected one replaces it.';
export const UNDO_REFUND_FIRST = 'Undo the refund first.';
export const PAYMENT_SCHOOL_REFUSED = 'Pick the school where it was paid.';
export const paymentEditedToast = (name) => `Payment updated for ${name}`;

// ----- Square payments to review -----
export const SQUARE_TITLE = 'Square payments to review';
export const SQUARE_SUB = 'Check each one in Square. If you already sorted it out, dismiss it.';
export const DISMISS = 'Dismiss';
export const DISMISSING = 'Dismissing…';
export const dismissAria = (amountCents) => `Dismiss the ${formatMoney(amountCents)} Square payment`;
export const OUTCOME_WORDS = {
  amount_mismatch: "The amount was different from the student's price.",
  unknown_order: 'No student matched this payment.',
  wrong_school: 'This payment arrived for the other school.',
  already_paid: "This student had already paid, so Square's payment was not recorded. Refund it in Square.",
  not_card: "This student was no longer paying by card, so Square's payment was not recorded. Refund it in Square.",
};
// link_cleared names the student (the database sends their name on that row only): someone paid an OLD link.
export const linkClearedWords = (name) => `Paid on an old link for ${name}. The link stopped counting when the amount changed. Refund it in Square or take it as ${name}'s payment here.`;
// row = a roster needs_look row ({ outcome, firstName, lastName }).
export const outcomeWords = (row) => {
  if (row.outcome === 'link_cleared') {
    const name = [row.firstName, row.lastName].filter(Boolean).join(' ');
    return name ? linkClearedWords(name) : 'Paid on an old link that stopped counting when the amount changed. Refund it in Square or take it as a payment here.';
  }
  return OUTCOME_WORDS[row.outcome] ?? 'This payment needs a look.';
};
export const receivedAt = (text) => `Received ${text}`;
export const SQUARE_NONE = 'Nothing left to review.';
export const DISMISS_FAILED = "Couldn't dismiss it. Check the connection, then retry.";
export const NOT_ADMIN = 'Only an admin can do that.';
