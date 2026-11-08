// text.js — the words of the shared parts in src/components/ (rulebook v1.030, Dashboard core M11).
// Why it exists: the shared parts (Dialog, RowMenu, ErrorBanner, Grip, DeleteDialog …) used to take
// these words from Testing's words file (src/screens/testing/text.js), so every section depended on
// Color Belt's file. They live here now, typed once. Testing's, Staff accounts' and Settings' words
// files re-export them, so nothing that imports those changes.
// Only the shared parts' OWN words are here. A part never holds a section's words (its noun, its
// questions, its error sentences): the section passes those in (plan §1). One kind of exception
// (rulebook v1.045 (4), v1.051 (2)): a sentence EVERY section says (a refused change, a failed Undo,
// a page that can't load, the toasts after Mark paid and Undo payment, the Undo payment box's title)
// is typed once, at the end of this file, so the sections can't drift apart.

// ----- Words the existing shared parts show -----
export const BACK = 'Back'; // Dialog's and AccountDialog's phone back arrow (screen-reader name); the PIN screens' Back link
export const CANCEL = 'Cancel'; // RowMenu's last row on phones; the account dialogs' and DeleteDialog's Cancel
export const RETRY = 'Retry'; // ErrorBanner
export const DISMISS = 'Dismiss'; // ErrorBanner's X (screen-reader name and tooltip)
export const GRIP_TOOLTIP = 'Drag to reorder'; // Grip's tooltip (its screen-reader name comes from the section)

// ===== The new shared parts' words (M1–M8) — the next build step adds them BELOW this line =====
// (e.g. "Keep this one", "Not the same person — keep both", "Close", "Copy link", "Download QR
// code", "Print flyer", "Paid by", "Mark paid", "Show all", "History", "Print or save as PDF",
// "Fees are non-refundable." — plan §3, M11)
// Each word is the one the approved mockup shows (rulebook v1.102–v1.109), copied exactly —
// curly apostrophes included where the mockup has them. The two privacy words every section
// already takes from src/lib/privateDetails.js ("Hidden on this tablet", "Payment details are
// hidden on this tablet.") stay there, and the parts take them from there too. The history line's
// own sentence, "Payment history is hidden on this tablet." (Star's words, v0.506), is one of M7's
// words below: today only Star's history says it, from Star's own words file.

export const CLOSE = 'Close'; // the Close button of the compare, receipt and link boxes (PC and tablet)

// ----- M1: the possible-duplicate box and the Compare dialog (CompareDialog.jsx, DuplicateBox.jsx) -----
export const REVIEW = 'Review'; // each pair's button in the box
export const KEEP_THIS_ONE = 'Keep this one';
export const KEEPING = 'Keeping…'; // the pressed Keep this one while it works (v1.102 detail b)
export const KEEP_BOTH = 'Not the same person — keep both';
export const KEEPING_BOTH = 'Keeping both…';
export const DIFFERENT = 'different'; // after a value that differs: "⚠ different" (v1.102 detail a)
// Keep this one's screen-reader name when the section gives none: "Keep this one: First registration"
export const keepThisOneLabel = (which) => `${KEEP_THIS_ONE}: ${which}`;

// ----- M3: the Mark paid box (MarkPaidBox.jsx, PaidByField) -----
export const PAID_BY = 'Paid by';
export const MARK_PAID = 'Mark paid';
export const PAY_METHODS = { cash: 'Cash', check: 'Check', card: 'Card' }; // in the order shown
export const markPaidAmount = (money) => `${MARK_PAID} ${money}`; // "Mark paid $50"
export const markPaidAmountBy = (money, method) => `${MARK_PAID} ${money} by ${method.toLowerCase()}`; // its screen-reader name: "Mark paid $50 by check"
export const markPaidBoxLabel = (name) => `Mark ${name} paid`; // the box's screen-reader name
// The hint under Paid by: what the family chose. where: 'form' | 'desk'.
export const theyChose = (method, where) => `They chose ${method} ${where === 'desk' ? 'at the desk' : 'on the form'}.`;
export const CHOOSE_HOW_PAID = 'Choose how they paid.'; // why Mark paid $X is gray (no choice on record)

// ----- M4: the receipt (Receipt.jsx) -----
export const RECEIPT = 'Receipt'; // the box's title
export const PRINT_RECEIPT = 'Print or save as PDF';
export const RECEIPT_SCHOOL = 'Jae H. Jeong’s U.S. Taekwondo Center'; // the page's first line
export const RECEIPT_DATE = 'Date';
export const RECEIPT_FOR = 'For';
export const RECEIPT_HOW = 'How paid';
export const RECEIPT_AMOUNT = 'Amount';
export const TOTAL_DUE = 'Total due';
export const PAID_TO_DATE = 'Paid to date';
export const BALANCE = 'Balance';
export const PAID_IN_FULL = 'paid in full'; // "$0 · paid in full"
export const OVERPAID = 'overpaid'; // "−$50 · overpaid"
export const NON_REFUNDABLE = 'Fees are non-refundable.';
// "Printed Oct 22, 2026 by Jeffrey Berg. Fees are non-refundable."
export const receiptPrinted = (date, name) => `Printed ${date}${name ? ` by ${name}` : ''}. ${NON_REFUNDABLE}`;
export const RECEIPT_LOAD_FAILED = "Couldn't load the receipt. Check the connection, then retry."; // S-2 ending (v1.051)
export const RECEIPT_LOADING = 'Loading the receipt'; // screen readers only (the gray placeholder page)
export const RECEIPT_PAGE_LABEL = 'Receipt page as it will print'; // screen readers only

// ----- M5: the Registration link box (RegistrationLinkBox.jsx) -----
export const COPY_LINK = 'Copy link';
export const copySchoolLink = (school) => `Copy ${school} link`; // two schools: "Copy Worcester link"
export const DOWNLOAD_QR = 'Download QR code';
// Two schools: its screen-reader name, the button's own words first, then the school (v1.111,
// WCAG 2.5.3): "Download QR code, Worcester".
export const downloadSchoolQr = (school) => `${DOWNLOAD_QR}, ${school}`;
export const PRINT_FLYER = 'Print flyer';
export const printSchoolFlyer = (school) => `Print ${school} flyer`; // two schools: "Print Worcester flyer"
export const schoolHeading = (school) => `${school} school`; // a card's heading: "Worcester school"
export const qrAlt = (shortLink) => `QR code for ${shortLink}`;
export const qrAltSchool = (school, shortLink) => `QR code for the ${school} link, ${shortLink}`;
// A failed copy or download: the amber note inside the box (v1.106 detail a)
export const COPY_FAILED = "Couldn't copy the link. Select the link and copy it yourself.";
export const QR_FAILED = "Couldn't make the QR code picture. Try again.";

// ----- M6: the count cards (CountCards.jsx) -----
export const SHOW_ALL = 'Show all'; // "Showing not paid only · Show all"

// ----- M7: the history line (HistoryLine.jsx) -----
export const HISTORY = 'History';
export const historyCount = (n) => `${HISTORY} · ${n === 1 ? '1 change' : `${n} changes`}`; // "History · 3 changes"
export const HISTORY_NONE = 'no changes yet'; // "History · no changes yet"
export const HISTORY_LOADING = 'Loading…';
export const HISTORY_LOAD_FAILED = "Couldn't load the history. Check the connection, then retry."; // S-2 ending (v1.051)
export const HISTORY_PAYMENTS_HIDDEN = 'Payment history is hidden on this tablet.'; // Star's words (v0.506)
// "Oct 22 · Jeffrey Berg"; with only one of the two (no date, or no name), just that one — no " · ".
export const historyWhen = (date, who) => [date, who].filter((part) => typeof part === 'string' && part.trim() !== '').join(' · ');

// ----- M8: the time list (TimeList.jsx; its times' words are in src/lib/times.js) -----
export const CHOOSE_A_TIME = 'Choose a time'; // nothing chosen yet (gray)

// ----- M12: the one offline bar (OfflineBar.jsx; rulebook v1.005, v1.123) -----
// Adapted from Star's approved offline line (v0.513), as drawn in picture 05b.
export const OFFLINE_BAR = 'You’re offline. Changes won’t save until the connection is back. Keep this page open — this bar goes away by itself.';

// ----- Date signed (rulebook v0.522, v0.638): New students' and Star's family forms both show it -----
// Moved here from src/screens/forms/text.js, which still re-exports them, so the two sections share one wording.
// DateSigned.jsx (the shared "Date signed" box, rulebook v0.430) draws these same words for Color Belt's family form and student summary.
export const DATE_SIGNED = 'Date signed';
export const DATE_SIGNED_HINT = "Filled in automatically with today's date.";

// ----- R2-05: the queued Undo (Toast.jsx, lib/toastLine.js, lib/saveLine.js; rulebook v1.125–v1.129) -----
export const UNDO = 'Undo'; // the toast's button
export const UNDOING = 'Undoing…'; // the toast's button while its Undo waits or runs (v1.125)
export const UNDONE = 'Undone'; // the toast after an Undo that worked (v1.051)
export const UNDO_DIDNT_SAVE = "Undo didn't save. Check the connection, then retry."; // the page's bar (v1.051 (2))
export const NEITHER_SAVED = 'Neither change saved. Check the connection, then retry.'; // an Undo that waited for a save that failed, and failed too (v1.127)
// After the person left the page (v1.129): the bar under the top bar names the change (the toast's
// own words) and the section. "Undo didn't save: “Zoe Park withdrawn” (Camps). Check the connection, then retry."
export const undoLeftDidntSave = (words, section) => `Undo didn't save: “${words}” (${section}). Check the connection, then retry.`;
// … and when the database refused it (e.g. the staff 10-second limit passed while it waited): the
// section's own reason after it, with no Retry.
// A page's reason is often R2-07's whole sentence ("Couldn't undo: it's too late."): then the change and
// the section go into that sentence ("Couldn't undo “Zoe Park withdrawn” (Camps): it's too late."),
// instead of a second "Couldn't undo" in front of it.
export const undoLeftRefused = (words, section, reason) =>
  /^Couldn't undo\b/.test(reason)
    ? reason.replace(/^Couldn't undo/, `Couldn't undo “${words}” (${section})`)
    : `Couldn't undo “${words}” (${section}). ${reason}`;

// ===== Sentences every section repeats (rulebook v1.045, v1.051; pass 1: R1-06, R1-07, R2-07, S-2, R3-13) =====
// The first line of this file says a part never holds a section's own words. These are not a section's:
// they are the one wording every section says, typed once here. A section passes in only what differs
// (a name, an amount, a reason), already formatted.

// R2-07 (v1.045 (4)): a refused change or Undo, and a failed Undo. (The words after an Undo that
// worked are each section's own: v1.051 (1). UNDO_DIDNT_SAVE is above.)
export const someoneElseChanged = (name) => `Someone else changed ${name} just now, so nothing was done. Their change is shown.`;
export const couldntUndo = (reason) => `Couldn't undo: ${reason}.`;

// S-2 (v1.051 (2)): a page that can't load. The sentence alone, or naming what didn't load.
export const LOAD_FAILED = "Couldn't load. Check the connection, then retry.";
export const loadFailedNamed = (what) => `Couldn't load ${what}. Check the connection, then retry.`;

// R3-13 (v0.623 N6, v0.817 / v0.818): the gray line under a calendar whose gray days can't be chosen
export const PAST_DAYS_HINT = "Past days can't be chosen.";
export const FUTURE_DAYS_HINT = "Days after today can't be chosen.";

// R1-07 (v1.045 (3)): the toasts after Mark paid and Undo payment. money and way arrive formatted
// ("$140", "card"). While private details are hidden: no amount or way (v0.722).
export const markedPaidToast = (name, money, way) => `${name} marked paid · ${money} ${way}`;
export const markedPaidToastHidden = (name) => `${name} marked paid`;
export const paymentUndoneToast = (name) => `Payment undone for ${name}`;

// R1-06 (v1.045 (2)): the Undo payment box. The title, and the second line's opening, which each
// section continues with its own consequence ("the row goes back to Not paid", "… is owed again",
// "It comes off the balance"). paidOn is the day the family paid, formatted ("Mar 20").
export const undoPaymentTitle = (name, money, way) => `Undo ${name}’s ${money} ${way} payment?`;
export const paidOnOpening = (paidOn) => `Paid on ${paidOn}`;
