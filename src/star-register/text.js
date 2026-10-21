// text.js — every word the Star testing family registration page shows (/star/<code>).
// Why it exists: the wording was approved screen by screen — the Form mockups
// (docs/Testing/Star Testing/TKD-StarTesting-Form-Mockups.html, 13 screens, rulebook v0.93–v0.107)
// and the phase 4 gap mockups (TKD-StarTesting-Phase4-Gap-Mockups.html, F1–F6, v0.510). Keeping it
// in one file makes it easy to compare with the mockups. Lines marked "PROPOSAL" are for cases the
// mockups don't draw; they follow the approved wording's style and are listed for review.
// The apostrophes are the curly ’ used in the mockups.
//
// THE ACKNOWLEDGMENT (ACK_TEXT + ACK_BOLD + ACK_END) is the exact wording approved in v0.510 and
// stands for the database label STAR_ACK_VERSION ('st-2026-10-18', src/lib/star/starEventRules.js).
// Master Jeong reads it before the form goes live; any change must be made before the first real
// registration — after that, a change needs a migration with a new label (build plan §4 M2).

export const SCHOOL = "Jae H. Jeong's U.S. Taekwondo Center"; // straight ' as in the mockups' header
export const PAGE_KIND = 'Star testing registration';
export const PREVIEW_BANNER = 'Preview mode — not connected to the real database. Nothing is sent anywhere.';

// ----- Event box (screen 1, v0.99) -----
export const LOCATION = 'Location';
export const schoolLabel = (schoolName) => `${schoolName} school`;
export const REGISTER_BY = (date) => `Register by ${date}`;

// ----- Step 1 (screens 1–5, F3, F6) -----
export const STEP_1 = 'Step 1 of 2 · Details';
// After Register another, as drawn in the step line of Form screen 10 (v0.93).
export const FIRST_NAME = 'First name';
export const LAST_NAME = 'Last name';
export const NAME_HINT = 'The person testing for a star.';
export const DOB = 'Date of birth';
export const DOB_HINT = 'Opens a calendar.';
export const DOB_CALENDAR_HINT = 'Pick the month and year first, then tap the day. Future dates can’t be chosen.';
export const CHOOSE = 'Choose…';
export const CURRENT_DAN = 'Current Dan';
export const STARS_NOW = 'Stars the candidate has now';
export const starsWord = (n) => (n === 1 ? '1 star' : `${n} stars`);
// "1st Dan goes up to 4 stars. Already at 4 stars? There’s no more 1st Dan star testing. Please ask at
// the front desk about 2nd Dan testing." (F3, v0.510 Q2 A — the numbers and next Dan follow the Dan)
export const topStarNote = (label, limit, nextLabel) =>
  `${label} goes up to ${starsWord(limit)}. Already at ${starsWord(limit)}? There’s no more ${label} star testing. Please ask at the front desk about ${nextLabel} testing.`;
export const TESTING_FOR = 'Testing for';
// "1st Dan · 1 star → 2 stars"
export const progression = (label, starsFrom) => `${label} · ${starsWord(starsFrom)} → ${starsWord(starsFrom + 1)}`;
export const FEE = 'Fee: ';
export const IF_BEFORE = ' if paid before the testing day';
export const IF_ON_DAY = ' if paid on the testing day';
export const TESTING_DAY_PRICE = ' on the testing day'; // registering on the testing day itself — PROPOSAL
export const rubricLink = (label) => `What ${label} is graded on`;
export const credits = (n) => (n === 1 ? '1 credit' : `${n} credits`);
export const passLine = (passMark, maxScore) => `Pass mark ${passMark} of ${maxScore}, with no D in any category.`;
export const AI_NOTE = ' Assistant Instructor comes from the number of assistant classes, entered by staff.';
export const EMAIL = 'Email for results';
export const EMAIL_HINT = 'Results are sent here. A parent’s email is fine.';
export const PAYING_BY = 'Paying by';
export const PAYING_HINT = 'Pay at the front desk.';
export const METHOD = { cash: 'Cash', check: 'Check' };
export const CONTINUE = 'Continue';

// Step 1 errors (screen 5, v0.98, v0.107)
export const ERR_FIRST = 'Enter the candidate’s first name.';
export const ERR_LAST = 'Enter the candidate’s last name.';
export const ERR_NAME_TOO_LONG = 'Use 60 characters or fewer.'; // as the dashboard and Color Belt's form
export const ERR_NAME_BAD_CHARACTER = 'That name has a character that can’t be used. Remove it.'; // as the dashboard
export const ERR_DOB = 'Choose the candidate’s date of birth.';
export const ERR_DAN = 'Choose the candidate’s Dan.';
export const ERR_STARS = 'Choose how many stars the candidate has.';
export const ERR_EMAIL_EMPTY = 'Enter an email for results.'; // PROPOSAL (the desk dialog's wording)
export const ERR_EMAIL = 'Enter a full email address, like name@example.com.';
export const ERR_PAYING = 'Choose Cash or Check.';

// ----- Step 2 (screens 6–8, 12, 13, F1, F4) -----
export const STEP_2 = 'Step 2 of 2 · Check and send';
export const CHECK_INTRO = 'Please check everything before sending.';
export const ROW_EVENT = 'Event';
export const ROW_CANDIDATE = 'Candidate';
export const ROW_SCHOOL = 'School';
export const fromThisLink = (schoolName) => `${schoolName} (from this link)`;
export const ROW_DOB = 'Date of birth';
export const dobLine = (date, age) => (Number.isInteger(age) ? `${date} (${age} on testing day)` : date);
export const ROW_FEE = 'Fee';
// "$140 if paid before the testing day ($150 if paid on the testing day), cash at the front desk"
export const feeSummary = (early, day, method) => `${early} if paid before the testing day (${day} if paid on the testing day), ${method} at the front desk`;
export const feeSummaryOne = (amount, method) => `${amount}, ${method} at the front desk`; // one price for both days — PROPOSAL
export const feeSummaryToday = (amount, method) => `${amount} today, ${method} at the front desk`; // on the testing day — PROPOSAL
export const ROW_RESULTS_TO = 'Results go to';
export const ACK_TEXT = 'I confirm these details are correct and agree to pay the testing fee at the front desk. ';
export const ACK_BOLD = 'Testing fees are not refundable.';
export const ACK_END = ' The candidate is ready to test for this star.';
export const SIGNATURE = 'Signature (the candidate, or a parent or guardian if under 18)';
export const SIGNATURE_HINT = 'Sign with your finger or mouse. Can’t sign here? Please sign at the front desk.';
export const SEND = 'Send registration';
export const SENDING = 'Sending…'; // as Color Belt's live form
export const TRY_AGAIN = 'Try again';
export const BACK_TO_EDIT = 'Back to edit';
export const PRIVACY = 'Only school staff can see these details. The school uses them to run star testing and send results; they are not shared or sold. The signature is deleted about 90 days after the testing day. The name, date of birth, email and results are kept by the school. A Cloudflare check on this page helps stop spam.';
export const ERR_ACK = 'Tick the box to confirm.';
export const ERR_SIGNATURE = 'Draw your signature in the box.';
// The drawing is bigger than the 70 000-character limit (as Color Belt's live form; not in the mockups).
export const ERR_SIGNATURE_TOO_BIG = 'This signature is too detailed to send. Tap Clear and sign again a little more simply.';

// Messages after a failed Send
export const SEND_FAILED = 'Your registration wasn’t sent. Check your internet connection and try again. Nothing you entered is lost.';
export const VERIFY_BEFORE = 'We couldn’t check this browser. '; // screen 8: "… Try again, or ask at the front desk."
export const VERIFY_AFTER = ', or ask at the front desk.';
export const RATE_LIMITED = 'Too many tries from this connection. Please wait a few minutes, or ask at the front desk.';
export const CLOSED_WHILE_FILLING = 'Registration closed while you were filling this in, so it wasn’t sent. Please ask at the front desk.';

// ----- Registered (screens 9, 10, F2) -----
export const isRegistered = (name) => `${name} is registered`;
export const WHAT_NEXT = 'What happens next';
export const ROW_PAY = 'Pay';
export const payLine = (method) => ` at the front desk, ${method}`;
export const payLineToday = (method) => ` at the front desk, ${method}, today`; // on the testing day — PROPOSAL
export const dayPriceHint = (amount) => `${amount} if paid on the testing day`;
export const ROW_TESTING = 'Testing';
export const ROW_LOCATION = 'Location';
export const ROW_RESULTS = 'Results';
export const sentTo = (email) => `Sent to ${email} after testing`;
export const ROW_REFERENCE = 'Reference';
export const REFERENCE_HINT = 'Mention it at the front desk if anything needs changing, including a wrong email.';
export const THIS_VISIT = 'Registered on this visit';
export const TOTAL_EARLY = 'Total if paid before the testing day';
export const TOTAL = 'Total'; // on the testing day, or when every price is the same both days — PROPOSAL
export const totalHow = (methods) => `${methods.toLowerCase()}, at the front desk`; // "cash, at the front desk" (screen 9)
export const totalHowToday = (methods) => `${methods.toLowerCase()}, at the front desk, today`; // PROPOSAL
export const REGISTER_ANOTHER = 'Register another candidate';

// ----- When families can't register (screen 11, F2, F4) -----
export const NOT_OPEN_TITLE = 'Registration hasn’t opened yet';
export const NOT_OPEN_TEXT = 'Please check back later, or ask at the front desk.';
export const CLOSED_TITLE = 'Registration is closed';
export const closedOn = (date) => `It closed on ${date}. To register late, please ask at the front desk.`;
export const CLOSED_TEXT = 'To register late, please ask at the front desk.';
export const FINISHED_TITLE = 'This star testing has finished';
export const FINISHED_TEXT = 'Results are emailed to families after testing. For the next star testing, please ask at the front desk.';
export const NOT_FOUND_TITLE = 'This link isn’t working';
export const NOT_FOUND_TEXT = 'Please ask at the front desk for the current registration link.';
export const RATE_TITLE = 'Too many tries';
export const LOAD_FAILED_TITLE = 'This page didn’t load';
export const LOAD_FAILED_TEXT = 'Check your internet connection and try again. If it keeps happening, please ask at the front desk.';
export const LOADING = 'Loading…';
