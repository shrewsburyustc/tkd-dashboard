// text.js — every word the family registration page shows.
// Why it exists: the wording was approved screen by screen (mockups F1–F15,
// docs/Testing/Color Belt Testing/TKD-ColorBelt-Form-Mockups.html; rulebook v0.131–v0.132).
// Keeping it in one file makes it easy to compare with the mockups and to change one line
// without hunting through the screens. Lines marked "(not in the mockups)" are for cases the
// mockups don't show; they follow the approved wording's style and are listed for review.
// The apostrophes are the curly ’ used in the mockups.

export const SCHOOL = "Jae H. Jeong's U.S. Taekwondo Center"; // straight ' as in the mockups' header
export const PAGE_KIND = 'Color belt testing registration';
export const PREVIEW_BANNER = 'Preview mode — not connected to the real database. Nothing is sent anywhere.';

// Event box (F1)
export const LOCATION = 'Location';
export const REGISTER_BY = (date) => `Register by ${date}`;
export const schoolLabel = (schoolName) => `${schoolName} school`;

// Step 1 (F1–F3)
export const STEP_1 = 'Step 1 of 2 · Details';
export const FIRST_NAME = 'First name';
export const LAST_NAME = 'Last name';
export const NAME_HINT = 'The student who is testing.';
export const CLASS = 'Class';
export const CLASS_HINT = 'Choose the class to see its belts.';
export const CURRENT_BELT = 'Current belt';
export const STRIPES_BOLD = '3 stripes on one side of their belt';
export const STRIPES_NOTE = 'Students need 3 stripes to test.';
export const TESTING_FOR = 'Testing for';
export const NO_NEW_RANK = 'No new rank';
export const testsAt = (className) => `${className} tests at `;
export const TESTING_FEE = 'Testing fee';
export const payBy = (date) => `Pay at the front desk by ${date}`;
export const PAY_TODAY = 'Pay at the front desk today.'; // registering on the testing day (not in the mockups)
export const dayPriceBold = (amount) => `${amount} if paid on the testing day.`;
export const saveBy = (date, saving) => ` Pay by ${date} to save ${saving}.`;
export const PAYING_BY = 'Paying by';
export const PAYING_HINT = 'Pay at the front desk.';
export const METHOD = { cash: 'Cash', check: 'Check', card: 'Card' };
export const CONTINUE = 'Continue';

// Step 1 errors (F3)
export const ERR_FIRST = 'Enter the student’s first name.';
export const ERR_LAST = 'Enter the student’s last name.';
export const ERR_NAME_TOO_LONG = 'Use 60 characters or fewer.'; // same as the dashboard (not in the mockups)
export const ERR_NAME_BAD_CHARACTER = 'That name has a character that can’t be used. Remove it.'; // same as the dashboard
export const ERR_CLASS = 'Choose the student’s class.'; // (not in the mockups)
export const ERR_BELT = 'Choose the student’s current belt.';
export const ERR_STRIPES = 'Tick the box to confirm 3 stripes. Not sure? Ask your instructor before registering.';
export const ERR_PAYING = 'Choose Cash or Check.';

// Step 2 (F4–F6, F9, F10)
export const STEP_2 = 'Step 2 of 2 · Check and send';
export const CHECK_INTRO = 'Please check everything before sending.';
export const ROW_EVENT = 'Event';
export const ROW_STUDENT = 'Student';
export const ROW_CLASS_TIME = 'Class and time';
export const ROW_STRIPES = '3 stripes';
export const CONFIRMED = 'Confirmed';
export const ROW_FEE = 'Fee';
export const feeLine = (date, method) => ` by ${date}, ${method} at the front desk`;
export const feeLineToday = (method) => ` today, ${method} at the front desk`; // (not in the mockups)
export const dayPriceLine = (amount) => `${amount} if paid on the testing day`;
export const ACK_TEXT = 'I confirm these details are correct and agree to pay the testing fee at the front desk. ';
export const ACK_BOLD = 'Testing fees are not refundable.';
export const SIGNATURE = 'Signature';
export const SIGNATURE_WHO = ' — a parent or guardian if the student is under 18';
export const SIGNATURE_HINT = 'Sign with your finger or mouse. Can’t sign here? Please sign at the front desk.';
export const SIGNATURE_BOX = 'Signature box. Draw your signature with your finger or mouse.';
export const CLEAR = 'Clear';
export const SEND = 'Send registration';
export const SENDING = 'Sending…'; // (not in the mockups)
export const TRY_AGAIN = 'Try again';
export const BACK_TO_EDIT = '← Back to edit';
export const PRIVACY = 'The school uses these details to run color belt testing. They are not shared or sold.';
export const ERR_ACK = 'Tick the box to confirm.';
export const ERR_SIGNATURE = 'Draw your signature in the box.';
// The drawing is bigger than the 70 000-character limit (contract 0005 §4.1; not in the mockups).
export const ERR_SIGNATURE_TOO_BIG = 'This signature is too detailed to send. Tap Clear and sign again a little more simply.';

// Messages at the top of step 2 after Send (contract 0005 §4.2)
export const SEND_FAILED = 'Your registration wasn’t sent. Check your internet connection and try again. Nothing you entered is lost.';
export const VERIFY_FAILED = 'We couldn’t check this browser. Try again, or ask at the front desk.';
export const RATE_LIMITED = 'Too many tries from this connection. Please wait a few minutes, or ask at the front desk.';
export const CLOSED_WHILE_FILLING = 'Registration closed while you were filling this in, so it wasn’t sent. Please ask at the front desk.';

// Registered (F7, F8)
export const isRegistered = (name) => `${name} is registered`;
export const WHAT_NEXT = 'What happens next';
export const ROW_PAY = 'Pay';
export const payLine = (method, date) => ` at the front desk, ${method}, by ${date}`;
export const payLineToday = (method) => ` at the front desk, ${method}, today`; // (not in the mockups)
export const ROW_TESTING = 'Testing';
export const ROW_LOCATION = 'Location';
export const ROW_REFERENCE = 'Reference';
export const REFERENCE_HINT = 'Mention it at the front desk if anything needs changing.';
export const THIS_VISIT = 'Registered on this visit';
export const TOTAL_DUE = 'Total due';
export const totalHow = (methods, date) => `${methods}, at the front desk, by ${date}`;
export const totalHowToday = (methods) => `${methods}, at the front desk, today`; // (not in the mockups)
export const REGISTER_ANOTHER = 'Register another student';

// When families can't register (F11–F15)
export const NOT_OPEN_TITLE = 'Registration hasn’t opened yet';
export const NOT_OPEN_TEXT = 'Please check back later, or ask at the front desk.';
export const CLOSED_TITLE = 'Registration is closed';
export const closedOn = (date) => `It closed on ${date}. To register late, please ask at the front desk.`;
export const CLOSED_TEXT = 'To register late, please ask at the front desk.';
export const FINISHED_TITLE = 'This color belt testing has finished';
export const FINISHED_TEXT = 'For the next color belt testing, please ask at the front desk.';
export const NOT_FOUND_TITLE = 'This link isn’t working';
export const NOT_FOUND_TEXT = 'Please ask at the front desk for the current registration link.';
// The page itself couldn't load the event (no internet, server trouble) — not in the mockups.
export const LOAD_FAILED_TITLE = 'This page didn’t load';
export const LOAD_FAILED_TEXT = 'Check your internet connection and try again.';
// The page was reloaded too often (the Function's 60-a-minute limit) — the same reason as RATE_LIMITED.
export const RATE_LIMITED_TITLE = 'Too many tries';
export const RATE_LIMITED_TEXT = 'Please wait a few minutes and try again, or ask at the front desk.';
export const LOADING = 'Loading…';
