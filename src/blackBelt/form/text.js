// text.js — every word the Black Belt family registration page shows.
// Why it exists: the wording was approved screen by screen (mockups Form 1–9,
// docs/Testing/Black Belt Testing/TKD-BlackBelt-Form-Mockups.html; rulebook v0.211–v0.218,
// v0.900; contract 0016-B1 §4). Keeping it in one file makes it easy to compare with the
// mockups and to change one line without hunting through the screens.
// Lines marked "(not in the mockups)" are for cases the mockups don't show; they follow the
// approved wording's style and are listed for Jeffrey's walkthrough (CP2).
// The apostrophes are the curly ’ used in the mockups (the school's name keeps its straight ').

export const SCHOOL = "Jae H. Jeong's U.S. Taekwondo Center";
export const PAGE_KIND = 'Black Belt testing registration';
export const pageKindFor = (schoolName) => (schoolName ? `${PAGE_KIND} · ${schoolName}` : PAGE_KIND);
export const tabTitle = (cycleName) => (cycleName ? `${cycleName} · ${PAGE_KIND}` : PAGE_KIND);
export const PREVIEW_BANNER = 'Preview mode — not connected to the real database. Nothing is sent anywhere.';
export const LOADING = 'Loading…'; // (not in the mockups)

// The two school names, so a testing day's place can be written "Worcester school".
// A place whose name is one of these (or that has an address) is a school.
export const SCHOOL_PLACE_NAMES = ['Worcester', 'Shrewsbury'];
export const schoolPlace = (name) => `${name} school`;

// Cycle box (Form 1)
export const cycleTitle = (cycleName) => `${cycleName} Black Belt Testing`;
export const applyBy = (longDate) => `Apply by ${longDate}`;

// Step 1 (Form 1, 2, 4, 9)
export const STEP_1 = 'Step 1 of 2 · Details';
export const FIRST_NAME = 'First name';
export const LAST_NAME = 'Last name';
export const LAST_NAME_HINT = 'Spell it exactly as it should be printed on the black belt and certificate.';
export const DOB = 'Date of birth';
export const DOB_HINT = 'Opens a calendar.';
export const TESTING_FOR = 'Testing for';
export const DAN = { 1: '1st Dan', 2: '2nd Dan', 3: '3rd Dan', 4: '4th Dan' };
export const KUKKIWON = 'Kukkiwon Dan certificate (optional)';
export const KUKKIWON_NO = 'No, thanks';
export const KUKKIWON_YES = 'Yes, add it';
export const kukkiwonYesWithFee = (fee) => `Yes, add it (${fee})`;
export const kukkiwonRangeHint = (min, max) => (min === max ? `The fee is ${min}.` : `The fee depends on the Dan (${min} to ${max}).`);
export const KUKKIWON_ADDED = 'Added to payment 1.';
export const HOW_PAY = 'How you’ll pay';
export const AMOUNTS_LATER = 'Amounts show once you choose a Dan.';
export const onePaymentBy = (date) => `1 payment · by ${date}`;
export const ONE_PAYMENT_TODAY = '1 payment · today'; // a passed due date counts as today (OP-12; not in the mockups)
export const timesAmount = (count, amount) => `${count} × ${amount}`; // "3 × $290"
export const TODAY = 'Today'; // a passed due date in a list (OP-12; not in the mockups)
export const TODAY_LOWER = 'today';
export const totalLine = (total) => ['Total: ', total]; // "Total: $870"
export const totalSplit = (testing, kukkiwon) => ` (testing ${testing} + Kukkiwon ${kukkiwon})`;
// The small line under a date that holds more than one item: "payment 1 + Kukkiwon" (Form 2).
// Two payments on one date (a late family) read "payment 1 + payment 2" (not in the mockups).
export const itemsLabel = (items) => items.map((item) => (item === 'kukkiwon' ? 'Kukkiwon' : `payment ${item.slice(1)}`)).join(' + ');
export const PAY_AT_DESK = 'Pay at the front desk.';
export const whatDanTested = (danLabel) => `What ${danLabel} is tested on`;
export const EMAIL = 'Email for results';
export const EMAIL_HINT = 'Results are sent here. A parent’s email is fine.';
export const CONTINUE = 'Continue';

// Step 1 errors (Form 4)
export const ERR_FIRST = 'Enter the candidate’s first name.';
export const ERR_LAST = 'Enter the candidate’s last name.';
export const ERR_NAME_TOO_LONG = 'Use 60 characters or fewer.';
export const ERR_NAME_BAD_CHARACTER = 'That name has a character that can’t be used. Remove it.';
export const ERR_DOB = 'Choose the candidate’s date of birth.';
export const ERR_DAN = 'Choose the Dan the candidate is testing for.';
export const ERR_PLAN = 'Choose how you’ll pay.';
export const ERR_EMAIL = 'Enter a full email address, like name@example.com.';

// Step 2 (Form 5, 6, 8, 9)
export const STEP_2 = 'Step 2 of 2 · Check and send';
export const CHECK_INTRO = 'Please check everything before sending.';
export const ROW_CYCLE = 'Cycle';
export const cycleRow = (cycleName, firstDay) => `${cycleName} Black Belt Testing · first day ${firstDay}`;
export const ROW_CANDIDATE = 'Candidate';
export const ROW_SCHOOL = 'School';
export const schoolFromLink = (schoolName) => `${schoolName} (from this link)`;
export const ROW_DOB = 'Date of birth';
export const dobWithAge = (dob, age, firstDay) => `${dob} (${age} on ${firstDay})`;
export const ROW_TESTING_FOR = 'Testing for';
export const WITH_KUKKIWON = ' · with Kukkiwon certificate';
export const NO_KUKKIWON = ' · no Kukkiwon certificate';
export const ROW_TO_PAY = 'To pay';
export const inPayments = (count) => ` in ${count} payments, at the front desk:`;
export const inFullBy = (date) => ` in full by ${date}, at the front desk`;
export const IN_FULL_TODAY = ' in full today, at the front desk'; // (not in the mockups)
export const inclKukkiwon = (fee) => ` (incl. Kukkiwon ${fee})`;
export const ROW_RESULTS = 'Results go to';
export const WAIVER_TITLE = 'Waiver and agreement';
export const READ_ALL = 'Read all';
export const waiverVersion = (name) => `Version ${name}`;
export const ACK = 'I have read and agree to the waiver.';
export const SIGNER = 'Name of the person signing';
export const signerHintMinor = (first, firstDay) => `A parent or guardian signs, because ${first} is under 18 on ${firstDay}.`;
export const signerHintAdult = (first, firstDay) => `Filled in from the candidate’s name: ${first} is 18 or over on ${firstDay}, so ${first} signs.`;
export const SIGNATURE = 'Signature';
export const SIGNATURE_MINOR = ' (parent or guardian)';
export const SIGNATURE_HINT = 'Sign with your finger or mouse. Can’t sign here? Please sign at the front desk.';
export const SIGNATURE_BOX = 'Signature, draw with finger or mouse'; // the box's accessible name (Form 9)
export const CLEAR = 'Clear';
export const SEND = 'Send registration';
export const SENDING = 'Sending…'; // (not in the mockups)
export const TRY_AGAIN = 'Try again';
export const BACK_TO_EDIT = 'Back to edit'; // drawn with a ← arrow in front
export const PRIVACY = 'The school uses these details to run Black Belt testing and send results. They are not shared or sold.';

// Step 2 errors (Form 6)
export const ERR_ACK = 'Tick the box to agree to the waiver.';
export const ERR_SIGNER = 'Enter the name of the person signing.';
export const ERR_SIGNATURE = 'Draw your signature in the box.';
export const ERR_SIGNATURE_TOO_BIG = 'This signature is too detailed to send. Tap Clear and sign again a little more simply.';

// Banners at the top of step 2 after Send (contract 0016-B1 §4.3)
export const SEND_FAILED = 'Your registration wasn’t sent. Check your internet connection and try again. Nothing you entered is lost.';
export const VERIFY_FAILED = 'We couldn’t check this browser. Try again, or ask at the front desk.';
export const RATE_LIMITED = 'Too many tries from this connection. Please wait a few minutes, or ask at the front desk.';
export const CLOSED_WHILE_FILLING = 'Registration closed while you were filling this in, so it wasn’t sent. Please ask at the front desk.';
// OP-13 working default (not in the mockups)
export const WAIVER_CHANGED = 'The school’s waiver has changed since you opened this page. Please reload the page to read the new one.';
export const RELOAD_PAGE = 'Reload page';

// Requirements panel (Form 3) and Read all (Form 5)
export const CLOSE = 'Close';
export const BACK = 'Back';
export const partTitle = (number, name) => `${number} · ${name}`;
export const plusOutdoor = (place) => ` + ${place} (outdoor)`;
export const eventsByAge = (count) => `${count} events, graded by age group`;
export const subjectsCount = (count) => `${count} ${count === 1 ? 'subject' : 'subjects'}`;
export const itemsCount = (count) => `${count} ${count === 1 ? 'item' : 'items'}`;
export const handInBy = (date, list) => `Hand in by ${date}: ${list}`;
export const EXTRA_POINTS = 'Extra points';
export const EXTRA_POINTS_LINE = 'Stripes, competitions, attendance and more';
export const PASS_TO = 'To pass: ';
export const passPoints = (points) => [points, ' points'];
export const PASS_END = '.'; // when there is no "no D" rule (not in the mockups)
export const EXTRA_COUNT = ' Extra points count toward the total.';
// Level 2
export const outdoorPartAt = (time, place) => `; outdoor part ${time}, ${place}`;
export const EACH_EVENT_BY_AGE = ' Each event graded A+ to D by age group.';
export const EACH_SUBJECT = ' Each subject graded A+ to D.';
export const EACH_ITEM = ' Each item is graded A+ to D.';
export const creditsCount = (count) => `${count} ${count === 1 ? 'credit' : 'credits'}`;
export const OUTDOOR_PREFIX = 'Outdoor: ';
export const upToPoints = (partName, points) => `${partName}: up to ${points} points.`;
export const openSubject = (name) => `Show how ${name} is graded`; // screen-reader names of + / − (not in the mockups)
export const closeSubject = (name) => `Hide how ${name} is graded`;
// Level 3
export const MEET_AT_LEAST = 'Meet the number to get the grade; below C is D.';
export const MEET_AT_MOST = 'At most the number to get the grade; over C is D.'; // (not in the mockups)
export const MEET_UNDER = 'Under the number to get the grade; otherwise D.'; // (not in the mockups)
export const measuredIn = (unit) => `Measured in ${unit}. `; // (not in the mockups)
export const AGE = 'Age';
export const pointsLinePlain = (scale) => `Points: ${scale}.`; // no grade scale for the part (not in the mockups)
export const GRADED_BY_EXAMINER = 'Graded by the examiner. Points for each grade:';
export const GRADE = 'Grade';
export const POINTS = 'Points';
export const D_MAKEUP = 'A D here must be made up at the next testing, even if the total passes.';
// Extra points level
export const extraIntro = (danLabel, hasLimit) => `Added to your total.${hasLimit ? '' : ' There is no limit.'} Numbers for ${danLabel}.`;
export const pointEach = (points) => `${points} ${points === 1 ? 'point' : 'points'} each`;
export const pointsWith = (points, atLeast) => `${points} points with ${atLeast} or more`;
export const OR_MORE = ' or more';
export const POINTS_WORD = ' points';
// Requirements panel, rubric v2 (migration 0024, contract 0024 §10.4). New wording, not in the
// form mockups, is marked.
export const passBracket = (label, points) => [`${label} `, points, ' points']; // "17 and under 275 points"
export const PASS_BRACKET_JOIN = ' · ';
export const PASS_NO_D_ONLY = ', and no D in any subject.';
export const onlyFor = (labels) => `Only ${labels}`; // replaces "Adults only" (v0.926)
export const upToPointsBrackets = (partName, points, rest) => `${partName}: up to ${points} points (${rest}).`;
export const forBrackets = (points, labels) => `${points} for ${labels}`;
export const wayHeading = (name, unit, direction) =>
  `${name ? `${name} · ` : ''}${unit}, ${direction === 'at_most' ? 'at most' : direction === 'under' ? 'under' : 'at least'}`; // "Pull-up · reps, at least"
export const ONE_OF_TWO_WAYS = 'Done one of two ways; the examiner records which.'; // (new wording, not in the mockups)
export const EXTRA_NOT_COUNTED = 'Recorded, but not added to your total.'; // (new wording, not in the mockups)
export const extraLimit = (points) => ` Up to ${points} points.`; // (new wording, not in the mockups)

// Read all
export const ARROW = '→';

// Registered (Form 7)
export const isRegistered = (name) => `${name} is registered`;
export const doneLine = (cycleName, danLabel, kukkiwon) =>
  `${cycleName} Black Belt Testing · ${danLabel}${kukkiwon ? ' · Kukkiwon certificate' : ''}`;
export const WHAT_TO_PAY = 'What to pay';
export const DUE_BY = 'Due by';
export const FOR = 'For';
export const AMOUNT = 'Amount';
export const TOTAL = 'Total';
export const paymentN = (n) => `Payment ${n}`;
export const kukkiwonItem = (fee) => `Kukkiwon certificate (${fee})`;
export const PLUS = ' + ';
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const bringChecks = (count, longDate) =>
  `Paying by check? Bring all ${NUMBER_WORDS[count] ?? count} checks, each dated for its due date, by ${longDate}.`;
export const NON_REFUNDABLE = 'Testing fees are non-refundable.';
export const TESTING_DAYS = 'Testing days';
export const outdoorPart = (time, place) => `Outdoor part ${time} · ${place}`;
export const HAND_IN = 'Hand in';
export const handInLine = (date, list) => `By ${date}: ${list}`;
export const KUKKIWON_TITLE = 'Kukkiwon certificate';
export const KUKKIWON_STEPS = [
  'Make an account on Tcon, the Kukkiwon website.',
  'Give the front desk your Tcon user ID.',
  'Upload a passport-style photo in Tcon. Please don’t email it to the school.',
];
export const REFERENCE = 'Reference';
export const REFERENCE_HINT = 'Mention it at the front desk if anything needs changing, including a wrong email.';
export const THIS_VISIT = 'Registered on this visit';
export const visitLine = (name, danLabel, kukkiwon, planName) =>
  `${name} · ${danLabel}${kukkiwon ? ' + Kukkiwon' : ''} · ${planName}`;
export const VISIT_TOTAL = 'Total';
export const VISIT_TOTAL_HOW = 'at the front desk, on each plan’s dates';
export const PRINT = 'Print or save this page';
export const REGISTER_ANOTHER = 'Register another candidate';

// When families can't register (Form 8)
export const NOT_OPEN_TITLE = 'Registration hasn’t opened yet';
export const NOT_OPEN_TEXT = 'Please check back later, or ask at the front desk.';
export const CLOSED_TITLE = 'Registration is closed';
export const closedOn = (date) => `It closed on ${date}. To register late, please ask at the front desk.`;
export const CLOSED_TEXT = 'To register late, please ask at the front desk.';
export const FINISHED_TITLE = 'This Black Belt testing has finished';
export const FINISHED_TEXT = 'For the next Black Belt testing, please ask at the front desk.';
export const NOT_FOUND_TITLE = 'This link isn’t working';
export const NOT_FOUND_TEXT = 'Please ask at the front desk for the current registration link.';
export const LOAD_FAILED_TITLE = 'This page didn’t load';
export const LOAD_FAILED_TEXT = 'Check your internet connection and try again.';
