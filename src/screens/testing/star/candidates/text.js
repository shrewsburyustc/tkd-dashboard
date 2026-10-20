// text.js — the words of the Star testing Candidates tab (build phase 3).
// Why it exists: the approved mockups — Candidates (13 screens, v0.121), Private (screens 1–4, v0.153)
// and the phase 3 gap mockups (G1–G16, v0.508, whose "Proposals" box is the exact record) — spell
// out each label, hint and toast. The data layer's own sentences (status messages, banners, dialog
// notes, the Dan-change confirmation, the make-up list's lines) live in
// src/lib/star/candidatesText.js and are passed on from here, so a screen imports ONE word list.
// The "Hide private details" words come from src/lib/privateDetails.js (one place, every section).
//
// Lines marked "// PROPOSAL" are not drawn in any approved mockup: they follow the same pattern and
// are listed in the build report for Jeffrey to confirm or change.
import * as CB from '../../text.js';
import { fullDate, shortDate, weekdayMonthDay } from '../../../../lib/calendarDates.js';
import { startTimeLabel } from '../../../../lib/star/starEventRules.js';
import { dollars } from '../../../../lib/star/candidatesText.js';

export * from '../../../../lib/star/candidatesText.js';
export { HIDDEN_ON_THIS_TABLET, PAYMENT_DETAILS_HIDDEN } from '../../../../lib/privateDetails.js';

// ----- House words (Color Belt's text.js, unchanged) -----
export const {
  UNDO, TOAST_UNDONE, UNDO_FAILED, CANCEL, SAVE, SAVING, CLOSE, UNSAVED, DISCARD_CHANGES, TAG_PAID, TAG_NOT_PAID,
  TAG_POSSIBLE_DUPLICATE, TAG_REMOVED, TAG_DUPLICATE_COPY, TAG_NOT_SAVED, ACTIONS_COL, PAID_BY, AMOUNT, DATE_PAID,
  ENTER_DATE_PAID, AMOUNT_ZERO, EDIT_PAYMENT_HINT, EDIT_PAYMENT_TITLE, CHANGE_PAYING_BY_TITLE, changePayingBySub,
  PAYING_BY_LABEL, KEEP_THIS_ONE, KEEP_BOTH, FIRST_REGISTRATION, SECOND_REGISTRATION, DIFFERENT, keepThisOneLabel,
  COMPARE_NOTE, DELETE_STUDENT_HINT, DELETE_PERMANENTLY, EDIT_DETAILS, ENTER_FIRST_NAME, ENTER_LAST_NAME, SHOW_ALL,
  priceProblemText, moreFor, LOADING_EVENT,
} = CB;

// ----- Names and dates -----
export const candidateName = (c) => `${c.firstName} ${c.lastName}`;
const SCHOOL = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
export const schoolName = (code) => SCHOOL[code] ?? '';
export const SCHOOL_CODES = ['worcester', 'shrewsbury'];
// A timestamp → its day in Massachusetts time, 'YYYY-MM-DD'
export function stampDay(stamp) {
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// '2026-10-17' → "Oct 17"
export function monthDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${MONTH_SHORT[Number(m[2]) - 1]} ${Number(m[3])}` : '';
}
// '2012-03-01' → "Mar 1, 2012"
export function monthDayYear(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${MONTH_SHORT[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : '';
}
// A timestamp → "Oct 17, 4:12 PM" / "Oct 20, 2026, 10:05 AM" (Massachusetts time)
export const stampTime = (stamp) => new Date(stamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
export const stampShort = (stamp) => `${monthDay(stampDay(stamp))}, ${stampTime(stamp)}`;
export const stampLong = (stamp) => `${monthDayYear(stampDay(stamp))}, ${stampTime(stamp)}`;

// ----- Rows (Candidates screens 1–3, G4, G14, G15) -----
export const COL_CANDIDATE = 'Candidate';
export const COL_SCHOOL = 'School';
export const COL_TESTING_FOR = 'Testing for';
export const COL_PAYING_BY = 'Paying by';
export const COL_PAYMENT = 'Payment';
export const COL_STATUS = 'Status'; // G4: the Payment column while Hide private details is on
export const COL_PAID_ON = 'Paid on';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const starsText = (n) => plural(n, 'star', 'stars');
// "0 stars → 1 star"
export const testingFor = (c) => `${starsText(c.starsFrom)} → ${starsText(c.starsTo)}`;
export const registeredLine = (c) => (c.isMakeup ? `Added ${monthDay(stampDay(c.registeredAt))}` : `Registered ${monthDay(stampDay(c.registeredAt))}`);
// "withdrawn Oct 17 by Jeffrey"
export const withdrawnLine = (c) =>
  `${c.withdrawnReason === 'duplicate_copy' ? 'duplicate copy' : 'withdrawn'} ${monthDay(stampDay(c.withdrawnAt))}${c.withdrawnByName ? ` by ${c.withdrawnByName}` : ''}`;
export const payingByText = (method) => ({ cash: 'Cash', check: 'Check', card: 'Card' })[method] ?? '';
export const NO_FEE_CELL = 'No fee';
export const TAG_MAKEUP = 'Make-up';
export const RECORD_PAYMENT = 'Record payment';
export const recordPaymentLabel = (name) => `Record payment for ${name}`;
export const reviewDuplicateLabel = (name) => `Review possible duplicate: ${name}`;
// "Make-up · retests Breaking, Korean Terminology" (+ " (below 245)" for chosen subjects, G14)
export function makeupLine(names, belowPassMark) {
  const list = names.length ? names.join(', ') : '';
  return `Make-up · retests ${list}${belowPassMark ? ` (below ${belowPassMark})` : ''}`;
}
// "Private · Tue, Dec 1, 4:00 PM · $160" (G15); the fee is left out while details are hidden (G4)
export const privateLine = (day, time, feeCents) =>
  `Private · ${weekdayMonthDay(day)}, ${startTimeLabel(time)}${feeCents !== null && feeCents !== undefined ? ` · ${dollars(feeCents)}` : ''}`;
// The Payment column with an overpaid amount or a refund: "Paid $160" (G1, Private screen 4)
export const paidAmount = (cents) => `Paid ${dollars(cents)}`;
export const overpaidText = (cents) => `${dollars(cents)} overpaid`;
// Phone payment line: "Cash · paid Oct 15"
export const paidOnPhone = (method, iso) => `${payingByText(method)} · paid ${monthDay(iso)}`;

// ----- Cards, the Dan switch, filters, one school (screens 1, 2, 12; G12) -----
export const CARD_CANDIDATES = 'Candidates';
export const CARD_PAID = 'Paid';
export const CARD_NOT_PAID = 'Not paid';
export const CARD_PAYMENTS = 'Payments recorded';
export const DAN_SWITCH_LABEL = 'Dan';
export const FILTER_LINE = { paid: 'Showing paid only', notPaid: 'Showing not paid only', payments: 'Showing paid only' };
export const SHOW_ALL_LINK = 'Show all';
export const oneSchoolLine = (school) => `Showing ${school} candidates only`;
export const SHOW_BOTH_SCHOOLS = 'Show both schools';
export const dupLine = (name, danLabel) => `${name} (${danLabel}) is registered twice`;
export const dupCount = (n) => plural(n, 'possible duplicate', 'possible duplicates');
export const REVIEW = 'Review';
export const removedGroup = (n) => `Removed · ${n}`;
export const NOT_IN_GRADING = 'Not in Grading or the counts';
export const NO_CANDIDATES = 'No candidates yet. Families register with the registration links, or staff add them with Add candidate.';
export const NO_CANDIDATES_DAN = 'No candidates for this Dan.'; // PROPOSAL (other Dans have candidates)
export const NO_MATCHES = 'No candidates match.'; // PROPOSAL (a card filter with nothing to show)
export const LOADING_CANDIDATES = 'Loading candidates';
export const TAB_CANDIDATES = 'Candidates';

// ----- Header and the Add candidate menu (screen 6, G8) -----
export const ADD_CANDIDATE = 'Add candidate';
export const NEW_CANDIDATE = 'New candidate';
export const NEW_CANDIDATE_SUB = 'Walk-in, or a family who couldn’t use the form';
export const NEW_CANDIDATE_HIDDEN = 'Add new candidates at the desk. Date of birth, email and payments are hidden on this tablet.';
export const MAKEUP_ITEM = 'Make-up from an earlier testing';
export const MAKEUP_ITEM_SUB = 'Pick from everyone who owes a make-up';

// ----- ⋯ menu items (screen 5, Private 2 and 4, G1, G13, G16) -----
export const EDIT_CANDIDATE = 'Edit candidate';
export const SET_PRIVATE = 'Set private testing';
export const CHANGE_PRIVATE = 'Change private day or time';
export const backToDay = (iso) => `Back to the testing day (${weekdayMonthDay(iso)})`;
export const CHANGE_PAYING_BY = 'Change how they’ll pay';
export const EDIT_PAYMENT = 'Edit payment';
export const UNDO_PAYMENT = 'Undo payment';
export const RECORD_REFUND = 'Record refund';
export const UNDO_REFUND = 'Undo refund';
export const WITHDRAW = 'Withdraw';
export const RESTORE = 'Restore';
export const moreForCandidate = (name) => `More actions for ${name}`;

// ----- Toasts -----
export const TOAST_PAYMENT_RECORDED = 'Payment recorded'; // + Undo (screen 4)
export const movedBackToast = (name, feeCents) => `${name} moved back to the testing day${feeCents === null ? '' : ` · fee ${dollars(feeCents)}`}`;
export const TOAST_PRIVATE_SET = 'Private testing set'; // PROPOSAL (Set / Change private testing, not drawn)
export const deletedToast = (name) => `${name} deleted`; // PROPOSAL (Color Belt's live wording)
export const TOAST_REFUND_UNDONE = 'Refund undone'; // PROPOSAL

// ----- Record payment / Edit payment / Record refund / Change how they'll pay (screen 4, G1, G15, G16) -----
export const RECORD_PAYMENT_TITLE = 'Record payment';
export const RECORD_REFUND_TITLE = 'Record refund';
export const dialogSubLine = (c) => `${candidateName(c)} · ${c.danLabel} · ${testingFor(c)} · ${schoolName(c.locationCode)}`;
export const choseOnForm = (method) => `They chose ${payingByText(method)} on the form. Change it if they paid another way.`;
export const choseAtDesk = (method) => `They chose ${payingByText(method)} at the desk. Change it if they paid another way.`; // PROPOSAL (desk rows)
export const feeHintStandard = (sameDayCents) => `Price before the testing day. On the testing day it fills in ${dollars(sameDayCents)}.`;
export const FEE_HINT_SAME_DAY = 'Price on the testing day.'; // PROPOSAL
export const feeHintPrivate = (danLabel) => `Private fee (${danLabel}).`;
export const AMOUNT_TOO_HIGH = 'Use $1,000 or less.'; // PROPOSAL (the database's 100 000-cent cap)
export const DATE_REFUNDED = 'Date refunded';
export const REFUNDED_BY = 'Refunded by';
export const refundSub = (name, paidCents, overpaidCents) => `${name} · paid ${dollars(paidCents)} · ${dollars(overpaidCents)} overpaid`;
export const refundUpTo = (cents) => `Up to ${dollars(cents)}, the amount overpaid.`;
export const refundDateHint = (registeredIso) => `Not before ${monthDay(registeredIso)} (registered) or after today.`;
export const refundAfter = (paidCents, afterCents) => `The ${dollars(paidCents)} payment stays in the history. Afterwards the row reads “${paidAmount(afterCents)}”.`;
export const paidDateHint = (registeredIso) => `Not before ${monthDay(registeredIso)} (registered) or after today.`; // PROPOSAL (Record / Edit payment)

// ----- Undo payment / Undo refund confirmations (G16) -----
export const undoPaymentTitle = (name) => `Undo ${name}’s payment?`;
export const undoPaymentBody = (cents, method, iso) =>
  `The ${dollars(cents)} ${payingByText(method).toLowerCase()} payment recorded on ${monthDay(iso)} is reversed and the row goes back to Not paid. Both stay in the history.`;
export const KEEP_PAYMENT = 'Keep payment';
export const undoRefundTitle = (name) => `Undo ${name}’s refund?`; // PROPOSAL (as Undo payment, G16)
export const undoRefundBody = (cents, method, iso) =>
  `The ${dollars(cents)} ${payingByText(method).toLowerCase()} refund recorded on ${monthDay(iso)} is reversed and the amount shows as overpaid again. Both stay in the history.`; // PROPOSAL
export const KEEP_REFUND = 'Keep refund'; // PROPOSAL

// ----- Delete permanently (screen 11, G9, G13) -----
export const deleteTitle = (name) => `Delete ${name} permanently?`;
export function deleteBody({ eventName, payment, gradeCount, hidden }) {
  const tail = "This can't be undone.";
  if (hidden) return `The registration and any recorded payment are deleted from ${eventName}. ${tail}`;
  const grades = gradeCount > 0 ? `${plural(gradeCount, 'grade', 'grades')} entered` : null;
  const pay = payment ? `the ${dollars(payment.amountCents)} ${payingByText(payment.method).toLowerCase()} payment recorded on ${monthDay(payment.paidOn)}` : null;
  let what;
  if (pay && grades) what = `The registration, ${pay} and the ${grades} are`;
  else if (pay) what = `The registration and ${pay} are`;
  else if (grades) what = `The registration and the ${grades} are`; // PROPOSAL (no payment)
  else what = 'The registration is'; // PROPOSAL (no payment, no grades)
  const paymentNote = pay ? ' The payment won’t show in Payments recorded any more.' : '';
  return `${what} deleted from ${eventName}.${paymentNote} ${tail}`;
}
export const KEEP_CANDIDATE = 'Keep candidate';

// ----- Private testing (Private screens 2 and 4, G9) -----
export const SET_PRIVATE_TITLE = 'Set private testing';
export const CHANGE_PRIVATE_TITLE = 'Change private day or time';
export const privateSub = (c, testingDate) => `${candidateName(c)} · ${c.danLabel} · ${testingFor(c)} · instead of ${weekdayMonthDay(testingDate)}`;
export const DAY = 'Day';
export const TIME = 'Time';
export const privateFeeLine = (privateCents, wasCents) => `Fee becomes the private fee: ${dollars(privateCents)} (was ${dollars(wasCents)}).`;
export const privateFeeKept = (privateCents) => `The private fee is ${dollars(privateCents)}.`; // PROPOSAL (Change: already private)
export const PRIVATE_FEE_HIDDEN = 'The private fee applies. Fees are hidden on this tablet.';
export const PRIVATE_DAY_HINT = 'Past dates can’t be chosen.'; // PROPOSAL (as the event dates)
export const CHOOSE_DAY = 'Choose the day.'; // PROPOSAL
export const CHOOSE_TIME = 'Choose the time.'; // PROPOSAL
export const CHOOSE = 'Choose…';

// ----- New candidate / Edit details / the detail view (screens 6, 8, 9; G5–G8) -----
export const NEW_CANDIDATE_TITLE = 'New candidate';
export const newCandidateSub = (eventName) => `${eventName} · added at the desk`;
export const detailSub = (eventName, code) => `${eventName} · ${schoolName(code)}`;
export const FIRST_NAME = 'First name';
export const LAST_NAME = 'Last name';
export const DOB = 'Date of birth';
export const DOB_OPTIONAL = 'Date of birth (optional)';
export const DOB_CALENDAR_HINT = 'Pick the month and year first, then tap the day. Future dates can’t be chosen.';
export const DOB_NEEDED = 'Choose the date of birth. A family-form registration keeps it.'; // PROPOSAL
export const DOB_OPTIONAL_HINT = 'Leave empty if the family didn’t give it. They’re then in the 13-and-up column for Assistant Instructor.';
export const SCHOOL_LABEL = 'School';
export const SCHOOL_HINT = 'Updates the School column.';
export const EMAIL = 'Email for results';
export const CURRENT_DAN = 'Current Dan';
export const STARS_NOW = 'Stars now';
export const testingForHint = (starsTo) => `Testing for ${starsText(starsTo)}.`;
export const PAYING_BY_HINT = 'Record the payment from the row once they pay.';
export const ENTER_EMAIL = 'Enter an email for results.'; // PROPOSAL
export const EMAIL_PROBLEM = 'Enter a full email address, like name@example.com.'; // the family form's wording
export const CHOOSE_SCHOOL = 'Choose the school.'; // PROPOSAL
export const CHOOSE_DAN = 'Choose the candidate’s Dan.'; // the family form's wording
export const CHOOSE_STARS = 'Choose how many stars the candidate has.'; // the family form's wording
export const NAME_TOO_LONG = 'Use 60 characters or fewer.';
export const NAME_BAD_CHAR = "That name has a character that can't be used. Remove it.";
export const HIDDEN_EDIT_HINT = 'Change the date of birth or email at the desk.';
export const DAN_AT_DESK_HINT = 'Change the Dan at the desk.';
export const danFeeLine = (danLabel, feeCents, paidCents) =>
  `${danLabel} fee is ${dollars(feeCents)}.${paidCents > 0 ? ` The ${dollars(paidCents)} payment already recorded stays as it is.` : ''}`;
export const PAYMENT_EDIT_NOTE = 'Payment is changed with Record payment or the ⋯ menu.';
export const SECTION_CANDIDATE = 'Candidate';
export const SECTION_REGISTRATION = 'Registration';
export const SECTION_PAYMENT = 'Payment';
export const SECTION_HISTORY = 'History';
export const NAME = 'Name';
export const ageText = (age) => (Number.isInteger(age) ? ` (age ${age})` : '');
export const testingForLong = (c) => `${c.danLabel} · ${testingFor(c)}`;
export const REGISTERED = 'Registered';
export const registeredDetail = (stamp, source) => `${shortDate(stampDay(stamp))} · ${source === 'form' ? 'family form' : 'at the desk'}`;
export const REFERENCE = 'Reference';
export const ACKNOWLEDGMENT = 'Acknowledgment';
export const TICKED_AND_SIGNED = 'Ticked and signed';
export const VIEW_SIGNATURE = 'View signature';
export const signatureRemoved = (stamp) => `signature removed ${monthDayYear(stampDay(stamp))} (deleted 90 days after the testing day)`;
export const NOT_SIGNED_HERE = 'Not signed here (added at the desk)';
export const PAYING_BY = 'Paying by';
export const payingByDetail = (method, source) => `${payingByText(method)} (chosen ${source === 'form' ? 'on the form' : 'at the desk'})`;
export const PAYMENT = 'Payment';
export const notPaidDetail = (standardCents, sameDayCents) => `Not paid · ${dollars(standardCents)} before the testing day, ${dollars(sameDayCents)} on it`;
export const notPaidPrivate = (privateCents) => `Not paid · private fee ${dollars(privateCents)}`; // PROPOSAL
export const notPaidSameDay = (sameDayCents) => `Not paid · ${dollars(sameDayCents)} on the testing day`; // PROPOSAL
export const paidDetail = (cents, method, iso) => `${dollars(cents)} ${payingByText(method).toLowerCase()} · paid ${monthDay(iso)}`;
export const refundedDetail = (cents, method, iso) => `refunded ${dollars(cents)} ${payingByText(method).toLowerCase()} ${monthDay(iso)}`;
export const MAKEUP_NO_FEE_DETAIL = 'No fee (make-up)'; // PROPOSAL
export const MAKEUP = 'Make-up';
export const makeupDetail = (eventName, names) => `From ${eventName} · retests ${names.join(', ')}`; // PROPOSAL
export const PRIVATE = 'Private testing';
export const privateDetail = (day, time) => `${fullDate(day)}, ${startTimeLabel(time)}`; // PROPOSAL
export const LOAD_DETAIL_FAILED = "Couldn't load this candidate. Check the connection, then retry."; // PROPOSAL
export const HISTORY_EMPTY = 'No changes recorded yet.'; // PROPOSAL
export const showAllCount = (n) => `Show all (${n})`;

// ----- View signature (G5) -----
export const SIGNATURE_TITLE = 'Signature';
export const signatureSub = (name, eventName) => `${name} · ${eventName}`;
export const signedLine = (stamp) => `Signed ${shortDate(stampDay(stamp))}, ${stampTime(stamp)} on the family form, after ticking the acknowledgment.`;
export const signatureAlt = (name) => `${name}’s signature`;
export const SIGNATURE_GONE = 'The signature was removed (deleted 90 days after the testing day).'; // PROPOSAL (opened just as it was removed)

// ----- The compare dialog (screen 3, G9) -----
export const compareTitle = (name) => `${name} is registered twice`;
export const COMPARE_SUB = 'Same name and date of birth. Differences are highlighted.';
export const COMPARE_SUB_HIDDEN = 'Same name and date of birth.';
export const COMPARE_HIDDEN_NOTE = 'Date of birth, email and payment are hidden on this tablet. Review at the desk to see them.';
export const COMPARE_PHONE_TITLE = 'Registered twice';
export const comparePhoneSub = (name) => `${name} · same name and date of birth. Differences are highlighted.`;
export const COMPARE_REGISTERED = 'Registered';
export const compareRegistered = (stamp, source) => `${stampShort(stamp)} · ${source === 'form' ? 'family form' : 'at the desk'}`;
export const NO_REFERENCE = '—';
export const COMPARE_NOTE_STAR = 'Keeping one moves the other to Removed as “Duplicate copy” (Undo for 5 seconds; admins can Restore). Both are logged.';

// ----- The make-up list (screen 7, G10) -----
export const MAKEUP_TITLE = 'Add a make-up';
export const SEARCH_BY_NAME = 'Search by name';
export const MAKEUP_ADD = 'Add';
export const makeupRowLine = (row) => `${row.firstName} ${row.lastName} · ${schoolName(row.locationCode)}`;
export const makeupRowStars = (row) => `${danLabelOf(row.dan)} · ${starsText(row.starsFrom)} → ${starsText(row.starsTo)}`;
export const makeupRowRetest = (row) => `${shortEventName(row.earlierEventName)} · retest ${row.needs.join(', ')}`;
export const MAKEUP_FOOT = 'Everyone who owes a make-up from an earlier Star testing, newest first. Adding one copies their Dan, stars and the categories to retest. No fee.';
export const DONE = 'Done';
export const addMakeupLabel = (name) => `Add ${name} as a make-up`;
export const makeupAddedToast = (name) => `${name} added`; // PROPOSAL (as New candidate's toast)
const DAN_LABELS = { 1: '1st Dan', 2: '2nd Dan', 3: '3rd Dan' };
export const danLabelOf = (dan) => DAN_LABELS[dan] ?? `${dan}th Dan`;
// "Spring 2026 Star Testing" → "Spring 2026" (the earlier testing's short name in the list)
export const shortEventName = (name) => (name ?? '').replace(/\s+Star Testing$/i, '');

// ----- History (G5, G6) -----
export const historyHead = (stamp, actor) => `${stampLong(stamp)} · ${actor || 'Staff'}`;
export const HISTORY_PAYMENTS_HIDDEN = 'Payment history is hidden on this tablet.';
export const hiddenFieldChanged = (label) => `${label} changed · details hidden on this tablet`;

// ----- Loading -----
export const LOAD_LIST_FAILED = "Couldn't load the make-up list. Check the connection, then retry."; // PROPOSAL
export const RETRY = CB.RETRY;
export { fullDate, shortDate, weekdayMonthDay };
