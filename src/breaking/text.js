// text.js — every word the public Board breaking sign-up page shows.
// Why it exists: the wording was approved in the pictures A-family-form / A-family-done / A-family-extras
// (docs/Board Breaking/Mockups/, rulebook v1.300–v1.304). Keeping every sentence in one file makes it easy
// to compare with the pictures and to change one line without hunting through the screens. The page copies
// the public Camps form (src/camp/text.js), so lines that Camps already has are worded the same way.
// Lines marked "(not in the pictures)" are for cases the pictures don't show; they follow the approved
// wording's style and are listed for Jeffrey's review.
// Apostrophes are straight (') in every sentence (rulebook v0.752).

export const SCHOOL = "Jae H. Jeong's U.S. Taekwondo Center";
export const PAGE_KIND = 'Board breaking';
export const PREVIEW_BANNER = 'Preview mode — not connected to the real database. Nothing is sent anywhere.';
export const LOADING = 'Loading…';

// ----- The event card at the top -----
export const schoolLine = (schoolName) => `U.S.T.C. ${schoolName}`; // "U.S.T.C. Shrewsbury"
// "Pre-register and save $1 per board. Same-day registration is $1 more per board." (bold part, then the rest)
export const preRegisterBold = (amount) => `Pre-register and save ${amount} per board.`;
export const preRegisterRest = (amount) => ` Same-day registration is ${amount} more per board.`;
// On the event day itself (not in the pictures)
export const SAME_DAY_BOLD = 'Same-day registration.';
export const sameDayRest = (amount) => ` Each board costs ${amount} more than when you pre-register.`;

// ----- Student card -----
export const STUDENT = 'Student';
export const FIRST_NAME = 'First name';
export const LAST_NAME = 'Last name';
export const AGE = 'Age';
export const AGE_HINT = 'Age on the event day';
export const RANK = 'Rank';
export const CHOOSE_RANK = 'Choose a rank';
export const GROUP_TIGER = 'Little Tiger belts';
export const GROUP_BELTS = 'Color Belts'; // (Jeffrey, after trying the live page: "Color Belts", not "Belts")
export const GROUP_BLACK = 'Black Belt';
export const CLASS_TIME = 'Class time';
export const CHOOSE_CLASS = 'Choose a class time';
export const CLASS_HINT = 'You may attend any class time that works for you, but we recommend coming to your own class time.';

// ----- Boards card -----
export const BOARDS = 'Boards';
export const TECHNICAL = 'Technical';
export const ADULT = 'Adult';
export const BOARDS_EMPTY_NOTE = "Choose an age and a rank and we'll fill in the boards for you.";
// "Recommended for age 9, Blue: 4 Technical + 0 Adult. You can change the amounts." — `who` is shown in bold
export const recommendedWho = (age, rank) => `age ${age}, ${rank}`;
export const recommendedWhat = (tech, adult) => `: ${tech} Technical + ${adult} Adult. You can change the amounts.`;
export const RECOMMENDED_FOR = 'Recommended for ';
export const eachPrice = (amount) => `${amount} each`;
export const fewerBoards = (kind) => `One fewer ${kind} board`;
export const moreBoards = (kind) => `One more ${kind} board`;
export const boardsGroup = (kind) => `${kind} boards`;
export const CHART_SUMMARY = 'View full requirement chart';
export const chartLabel = (heading) => `Boards by rank, ${heading}`;
export const chartHeading = (band, childMax) => {
  if (band === 'tiger') return 'Little Tiger belts';
  if (band === 'black') return 'Black Belt ranks';
  return band === 'teen' ? `Ages ${childMax + 1} and up` : `Ages ${childMax} and under`;
};
export const YOUR_GROUP = '(your group)';
export const boardsText = (tech, adult) => [tech > 0 ? `${tech} Technical` : null, adult > 0 ? `${adult} Adult` : null].filter(Boolean).join(' + ') || '0 boards';
export const chartTigerFoot = (text) => `Little Tiger belts: ${text}.`;
export const CHART_TIGER_OWN = 'Little Tiger belts have their own boards.';
export const CHART_BLACK_OWN = 'Black Belt ranks have their own boards.';
export const chartAgeOwn = (band, childMax) => (band === 'teen' ? `Ages ${childMax} and under have their own list.` : `Ages ${childMax + 1} and up have their own list.`);

// ----- Paying by card -----
export const PAYING_BY = 'Paying by';
export const METHOD = { cash: 'Cash', check: 'Check', card: 'Card' };
export const CARD_NOTE = "After you register you'll get a button to pay securely with Square.";

// ----- Amount card -----
export const AMOUNT = 'Amount';
export const NO_BOARDS_YET = 'No boards chosen yet';
export const TOTAL = 'Total';
export const lineBoards = (kind, count, each) => `${kind} ${count} × ${each}`;
// The listed price is the card price; paying cash or check takes the difference off (Jeffrey: families only see the listed price and a cash / check discount).
export const DISCOUNT = 'Cash or check discount';
export const saveHint = (each) => `Pay by cash or check and save ${each} per board.`;
export const boardsTimes = (count, each) => `${count} ${count === 1 ? 'board' : 'boards'} × ${each}`;

export const REGISTER = 'Register';
export const SENDING = 'Sending…';
export const TRY_AGAIN = 'Try again';
export const PRIVACY = 'The school uses these details only to run Board breaking. They are not shared or sold.'; // (not in the pictures; as Camps)

// ----- Field messages (amber; Camps' words) -----
export const ERR_FIRST = "Enter the student's first name.";
export const ERR_LAST = "Enter the student's last name.";
export const ERR_NAME_LONG = 'Use 60 characters or fewer.'; // (not in the pictures)
export const ERR_NAME_BAD = 'Use letters, numbers and normal punctuation only.'; // (not in the pictures)
export const ERR_AGE = "Enter the student's age.";
export const ERR_AGE_NUMBER = 'Enter the age as a whole number, like 9.'; // (not in the pictures)
export const ERR_AGE_RANGE = 'Enter an age from 1 to 99.'; // (not in the pictures)
export const ERR_RANK = "Choose the student's rank.";
export const ERR_CLASS = "Choose the student's class time.";
export const ERR_BOARDS = 'Choose at least 1 board.';
export const ERR_PAYING = 'Choose Cash, Check or Card.';

// ----- Messages at the top of the form after Register -----
export const SEND_FAILED = "Your registration wasn't sent. Check your internet connection and try again. Nothing you entered is lost."; // (as Camps)
export const VERIFY_FAILED = "We couldn't check this browser. Try again, or ask at the front desk.";
export const RATE_LIMITED = 'Too many tries from this connection. Please wait a few minutes, or ask at the front desk.';
export const CLOSED_WHILE_FILLING = "Registration closed while you were filling this in, so it wasn't sent. Please ask at the front desk."; // (not in the pictures)
export const DUPLICATE = 'This student is already registered for this class time. Please ask at the front desk if something needs changing.'; // (not in the pictures)
export const INVALID = 'Something in the form needs another look. Please check it and tap Register again.'; // (not in the pictures)
export const priceChanged = (newAmount) => `The price changed while you were filling in the form. The new total is ${newAmount}. Please check it and tap Register again.`; // (not in the pictures)

// ----- After Register (A-family-done) -----
export const registeredTitle = (name) => `${name} is registered`;
export const YOUR_REGISTRATION = 'Your registration';
export const ROW_CLASS = 'Class';
export const ROW_RANK = 'Rank';
export const ROW_BOARDS = 'Boards';
export const ROW_PAYING = 'Paying by';
export const rankAge = (rank, age) => `${rank} · age ${age}`;
export const PAY_NOW = 'Pay now';
export const PAY = 'Pay';
export const PAY_THE_SCHOOL = 'Pay the school';
export const TOTAL_TO_PAY = 'Total to pay';
export const HOW_CARD = 'Card, with Square';
export const HOW_CARD_SHORT = 'Card';
export const HOW_DESK = 'Cash or check, at the front desk';
export const payWithSquare = (amount) => `Pay ${amount} with Square`;
export const PAY_HINT = "You'll return here after paying. We mark you paid when Square tells us.";
export const LINK_FAILED = "You're registered. We couldn't make the payment link just now.";
export const OR_DESK = 'Or pay at the front desk.';
export const CASH_SAY = 'Registered. Please pay the school by cash or check before the event day.';
export const CASH_SAY_SAME_DAY = 'Registered. Please pay the school by cash or check at the front desk.'; // on the event day (not in the pictures)
export const REGISTER_ANOTHER = 'Register another student';
export const ALREADY_PAID = 'This registration is already paid. Thank you.'; // (not in the pictures)
export const PAY_AGAIN_FAILED = "We couldn't make the payment link. Please try again, or pay at the front desk."; // (not in the pictures)

// ----- Back from Square (/breaking/<code>?paid=1) (not in the pictures) -----
export const THANK_YOU = 'Thank you';
export const THANK_YOU_TEXT = 'We mark you paid as soon as Square tells us.';
export const PAID_TITLE = 'Paid. Thank you';
export const PAID_TEXT = "You're all set. We'll see you at Board breaking.";
export const CHECKING = 'Checking with the school…';
export const NOT_YET = "We haven't heard from Square yet. This usually takes less than a minute.";
export const CHECK_AGAIN = 'Check again';
export const CLOSE_PAGE = 'You can close this page. If you paid and it still says unpaid after a few minutes, please ask at the front desk.';

// ----- When families can't register -----
export const NOT_OPEN_TITLE = "Registration isn't open yet";
export const NOT_OPEN_TEXT = 'Please check back later, or ask at the front desk.';
export const CLOSED_TITLE = 'Registration is closed';
export const CLOSED_TEXT = 'Board breaking registration for this event has closed. Please call or visit the school to ask about joining.';
export const NOT_FOUND_TITLE = "This link isn't working";
export const NOT_FOUND_TEXT = 'Please ask at the front desk for the current registration link.';
export const LOAD_FAILED_TITLE = "This page didn't load";
export const LOAD_FAILED_TEXT = 'Check your internet connection and try again.';
export const RETRY = 'Retry';
