// text.js — every word the public camp sign-up page shows.
// Why it exists: the wording was approved screen by screen (mockups C7a–C7d in
// docs/Camps/TKD-Camps-Mockups.html, rulebook v0.229–v0.237 and v0.700–v0.704, contract 0013 §7).
// Keeping it in one file makes it easy to compare with the mockups and to change one line
// without hunting through the screens.
// Lines marked "(not in the mockups)" are for cases the mockups don't show (contract 0013 §7.3 or
// small additions by the builder); they follow the approved wording's style and are listed for
// Jeffrey's review at CP1. Lines marked "(Color Belt)" are reused from src/register/text.js with
// "registration" → "sign-up" (§7.2).
// The apostrophes are the curly ’ used in the mockups.

export const SCHOOL = "Jae H. Jeong's U.S. Taekwondo Center"; // straight ' as in the mockups' header
export const PAGE_KIND = 'Camp sign-up';
export const PREVIEW_BANNER = 'Preview mode — not connected to the real database. Nothing is sent anywhere.'; // (Color Belt)
export const LOADING = 'Loading…'; // (Color Belt)

// ----- The camp card at the top (C7a, C7d) -----
export const BOTH_SCHOOLS_LINE = (heldAt) => `U.S.T.C. Worcester & Shrewsbury · held at ${heldAt}`;
// "Ages 5–12"; one age only, e.g. 8 to 8 → "Age 8" (not in the mockups)
export const agesLine = (min, max) => (min === max ? `Age ${min}` : `Ages ${min}–${max}`);
// "Early price until Wednesday, November 18 · Sign up by Tuesday, November 24"
export const earlyUntilPart = (date) => `Early price until ${date}`;
export const signUpByPart = (date) => `Sign up by ${date}`;

// ----- Step 1 (C7a) -----
export const STEP_1 = 'Step 1 of 2 · Details';
export const childTitle = (n) => `Child ${n}`;
export const REMOVE_CHILD = 'Remove'; // removes child 2 or 3 from the form (not in the mockups)
export const removeChildLabel = (n) => `Remove child ${n}`; // for screen readers (not in the mockups)
export const FIRST_NAME = 'First name';
export const LAST_NAME = 'Last name';
export const AGE = 'Age';
export const AGE_HINT = 'Age on the first day of camp';
export const isMember = (name) => `Is ${name} a U.S.T.C. member?`;
export const IS_MEMBER_NO_NAME = 'Is this child a U.S.T.C. member?'; // before a first name is typed (not in the mockups)
export const YES = 'Yes';
export const NO = 'No';
export const WHICH_DAYS = 'Which days?';
export const EXTRAS = 'Extras';
export const perDay = (amount) => `${amount} a day`;
export const PER_DAY_WHICH = 'which days?'; // "$8 a day · which days?"
export const onceCost = (amount) => amount; // a once extra just shows its price, e.g. "$5" (not in the mockups)
// The running price box under each child
export const dayCount = (n) => (n === 1 ? '1 day' : `${n} days`);
export const MEMBER_WORD = 'member';
export const NON_MEMBER_WORD = 'non-member';
export const EARLY_PRICE_WORD = 'early price';
export const REGULAR_PRICE_WORD = 'regular price'; // after the early-price date (not in the mockups)
export const extraTimes = (name, count) => `${name} × ${count}`;
// An extra limited to some days (CP1 2026-10-19): "Pizza party — Wed" in the price lines and
// "Pizza party: Wed, Fri, included when coming every day" under the day buttons / in the camp info.
export const extraOnDays = (name, days) => `${name} — ${days}`;
export const onlyOnLine = (name, days, includedForAllDays) => `${name}: ${days}${includedForAllDays ? ', included when coming every day' : ''}`;
export const childTotal = (name) => `${name}’s total`;
export const ADD_CHILD = 'Add another child';
export const UP_TO_3 = 'Up to 3 children';
export const PARENT = 'Parent or guardian';
export const EMERGENCY = 'Emergency contact';
export const NAME = 'Name';
export const PHONE = 'Phone';
export const RELATION = 'Relationship to the child';
export const EMERGENCY_HINT = 'Someone we can call if we can’t reach you.';
export const HOW_PAY = 'How you’ll pay at the school';
export const PAY_HINT = 'Pay at the front desk before camp starts.';
export const METHOD = { cash: 'Cash', check: 'Check', card: 'Card' };
export const CONTINUE = 'Continue';

// Step 1 errors (§7.3 — all not in the mockups except the age range line)
export const ERR_FIRST = 'Enter the child’s first name.';
export const ERR_LAST = 'Enter the child’s last name.';
export const ERR_AGE = 'Enter the child’s age.';
export const agesFor = (min, max) => `This camp is for ages ${min} to ${max}.`; // (mockup C7a)
export const ERR_MEMBER = 'Choose Yes or No.';
export const ERR_DAYS = 'Choose at least one day.';
export const ERR_EXTRA_DAYS = 'Choose which days.';
export const ERR_NAME = 'Enter a name.';
export const ERR_PHONE = 'Enter a 10-digit phone number.';
export const ERR_RELATION = 'Enter the relationship.';
export const ERR_PAYING = 'Choose Cash, Check or Card.';
export const ERR_NAME_TOO_LONG = 'Use 60 characters or fewer.'; // (Color Belt)
export const ERR_NAME_BAD_CHARACTER = 'That name has a character that can’t be used. Remove it.'; // (Color Belt)
export const ERR_RELATION_TOO_LONG = 'Use 40 characters or fewer.'; // (not in the mockups)
export const ERR_RELATION_BAD_CHARACTER = 'That has a character that can’t be used. Remove it.'; // (not in the mockups)
// Shown at the top of step 1 when the camp changed while the family filled in the form.
export const CAMP_CHANGED = 'This camp was updated while you were filling in the form. Check your choices and sign again.'; // (§7.3)

// ----- Step 2 (C7b) -----
export const STEP_2 = 'Step 2 of 2 · Check and sign';
export const CHECK_INTRO = 'Please check everything before signing.';
export const ROW_CAMP = 'Camp';
export const ROW_PARENT = 'Parent';
export const ROW_EMERGENCY = 'Emergency';
export const ROW_PAYING = 'Paying';
export const personLine = (name, relation) => `${name} (${relation}) · `; // + the phone
export const payingLine = (method) => `${method}, at the school before camp`;
export const childHeading = (name, age, member) => `${name} · age ${age} · ${member ? MEMBER_WORD : NON_MEMBER_WORD}`;
export const earlyPriceNote = (date) => `Early price (signing up before the end of ${date})`;
export const REGULAR_PRICE_NOTE = 'Regular price'; // (not in the mockups)
export const FAMILY_TOTAL = 'Family total';
export const PAY_BEFORE_CAMP = 'Pay at the school before camp';
export const WAIVER = 'Waiver';
export const ackText = (name) => `I am ${name}’s parent or guardian. I have read the waiver and agree to it.`;
export const SIGNATURE = 'Signature';
export const SIGNATURE_HINT = 'Sign with your finger or mouse. Can’t sign here? Please sign at the front desk.';
export const SIGN_UP = 'Sign up';
export const SENDING = 'Sending…'; // (Color Belt)
export const TRY_AGAIN = 'Try again'; // (Color Belt)
export const BACK_TO_EDIT = '← Back to edit';
export const PRIVACY = 'The school uses these details only to run the camp. They are not shared or sold.';
export const ERR_ACK = 'Tick the box to confirm.';
export const ERR_SIGNATURE = 'Draw your signature in the box.'; // (Color Belt)
export const ERR_SIGNATURE_TOO_BIG = 'This signature is too detailed to send. Tap Clear and sign again a little more simply.'; // (Color Belt)

// Messages at the top of step 2 after Sign up (§4.6)
export const SEND_FAILED = 'Your sign-up wasn’t sent. Check your internet connection and try again. Nothing you entered is lost.'; // (§7.3)
export const VERIFY_FAILED = 'We couldn’t check this browser. Try again, or ask at the front desk.'; // (Color Belt)
export const RATE_LIMITED = 'Too many tries from this connection. Please wait a few minutes, or ask at the front desk.'; // (Color Belt)
export const CLOSED_WHILE_FILLING = 'Sign-up closed while you were filling this in, so it wasn’t sent. Please ask at the front desk.'; // (§7.3)
export const priceChanged = (newAmount, oldAmount) => `The price changed while you were filling in the form. New total ${newAmount} (was ${oldAmount}). Check it and sign again.`;

// ----- Signed up (C7c) -----
export const SIGNED_UP = 'You’re signed up';
export const WHAT_NEXT = 'What happens next';
export const ROW_PAY = 'Pay';
export const payNext = (method) => ` at the school before camp · ${method}`; // after the bold amount
export const ROW_WHERE = 'Where';
export const ROW_ABOUT = 'About the camp';
export const ROW_REFERENCE = 'Reference';
export const REFERENCE_HINT = 'Mention it at the front desk if anything needs changing.';
export const PAY_CARD_TITLE = 'Pay at the school before camp';
export const childPayLine = (name, days, extraNames) => [`${name} · ${days}`, ...extraNames].join(' + ');
export const TOTAL_TO_PAY = 'Total to pay';
export const totalHow = (method, firstDay) => `${method}, at the front desk, before ${firstDay}`;

// ----- When families can't sign up (C7d and §7.3) -----
export const NOT_OPEN_TITLE = 'Sign-up hasn’t opened yet';
export const opensOn = (date) => `It opens on ${date}. Please check back then, or ask at the front desk.`;
export const NOT_OPEN_TEXT = 'Please check back later, or ask at the front desk.'; // switched off (§7.3)
export const CLOSED_TITLE = 'Sign-up is closed';
export const closedOn = (date) => `Sign-up closed on ${date}. Please call or visit the school to ask about a place.`;
export const CLOSED_TEXT = 'Please call or visit the school to ask about a place.'; // closed by hand (§7.3)
export const FINISHED_TITLE = 'This camp is over'; // (§7.3)
export const FINISHED_TEXT = 'For the next camp, please ask at the front desk.'; // (§7.3)
export const NOT_FOUND_TITLE = 'This link isn’t working'; // (§7.3)
export const NOT_FOUND_TEXT = 'Please ask at the front desk for the current sign-up link.'; // (§7.3)
export const LOAD_FAILED_TITLE = 'This page didn’t load'; // (§7.3)
export const LOAD_FAILED_TEXT = 'Check your internet connection and try again.'; // (§7.3)
