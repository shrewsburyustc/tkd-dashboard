// chart.js — every visible word of Board breaking's "Chart and prices" tab (admins only).
// Why it exists: like each section's text.js, one place for the words, so the screens never hold sentences and a
// wording change is one edit. The words come from the approved pictures (docs/Board Breaking/Mockups/C-admin-*,
// rulebook v1.300) and from the shared sentences the other sections use for saving, "someone else changed it" and
// "didn't save" (src/components/text.js), so a failed save reads the same everywhere.
import { someoneElseChanged } from '../../../components/text.js';
import { BAND_LABELS } from '../breakingRules.js';
import { formatMoneyWithCents } from '../../money.js';

export { UNDO_DIDNT_SAVE } from '../../../components/text.js';

export const SECTION_NAME = 'Board breaking'; // names the section in the bar shown after leaving the page (v1.129)
export const LOADING = 'Loading Chart and prices'; // heard by screen readers only
export const LOAD_FAILED = "Couldn't load Chart and prices. Check the connection, then retry.";

// ----- The gray line under the tabs, and the two cards -----
export const TAB_LINE = 'Prices, age groups and the board chart. They are the same for every Board breaking event, at both schools.';
export const PRICES_TITLE = 'Prices (all events)';
export const EDIT_PRICES_LABEL = 'Edit prices';
export const ROW_TECH = 'Technical board';
export const ROW_ADULT = 'Adult board';
export const ROW_LISTED = ' (listed price, paid by card)';
export const ROW_DISCOUNT = 'Discount for paying cash or check, per board';
export const ROW_SAME_DAY = 'From the event date on, adds per board';
export const EXAMPLE = 'Example';

export const AGE_TITLE = 'Age groups';
export const EDIT_AGE_LABEL = 'Edit age groups';
export const ageLineBold = { child: 'Child', teen: 'Teen / Adult' };
export const ageChildText = (max) => `: ${max} and under`;
export const ageTeenText = (max) => `: ${max + 1} and up`;
export const AGE_NOTE = "A student's age decides which chart row is used. Little Tiger belts always use the Little Tiger rows, and Black Belt ranks always use the Black Belt rows.";

// "Cash, 4 Technical, event day: 4 × $4.25 = $17.00, minus the $1.00 discount = $16.00" — the worked example, from the prices as
// typed or saved (settings = the database's numbers: cash price, discount = cardExtraCents). 4 × the listed event-day price, then
// the discount for 4 boards; with no discount the "minus" part is left out.
export function exampleLine(settings) {
  const listed = settings.techCents + settings.cardExtraCents + settings.sameDayExtraCents;
  const discount = 4 * settings.cardExtraCents;
  const head = `Cash, 4 Technical, event day: 4 × ${formatMoneyWithCents(listed)} = ${formatMoneyWithCents(4 * listed)}`;
  return discount > 0 ? `${head}, minus the ${formatMoneyWithCents(discount)} discount = ${formatMoneyWithCents(4 * listed - discount)}` : head;
}

// ----- The chart -----
export const CHART_TITLE = 'Board chart';
export const CHART_SUB = 'The boards each rank usually breaks, and the technique. A family sees these as the starting numbers on the form and can still change them.';
export const bandName = (band) => BAND_LABELS[band] ?? band;
export const rankCount = (n) => (n === 1 ? '1 rank' : `${n} ranks`);
export const collapseGroup = (name) => `Collapse ${name}`;
export const expandGroup = (name) => `Expand ${name}`;
export const COL_RANK = 'Rank';
export const COL_TECHNIQUE = 'Technique';
export const COL_TECHNICAL = 'Technical';
export const COL_ADULT = 'Adult';
export const ADD_RANK = 'Add rank';
// The group's name is put before the rank only when the rank name doesn't already start with it ("Edit Little Tiger White", "Edit Child Orange").
export const withGroup = (band, name) => (name.toLowerCase().startsWith(bandName(band).toLowerCase()) ? name : `${bandName(band)} ${name}`);
export const editRankLabel = (band, name) => `Edit ${withGroup(band, name)}`;
export const moreFor = (band, name) => `More actions for ${withGroup(band, name)}`;
export const boardsLine = (tech, adult) => `${tech} Technical · ${adult} Adult`;
export const phoneTechnical = (n) => `${n} Technical`;
export const phoneAdult = (n) => `${n} Adult`;
export const sheetLine = (band, technique, tech, adult) => [bandName(band), technique, `${tech} Technical, ${adult} Adult`].filter(Boolean).join(' · ');

// ----- The ⋯ menu -----
export const MOVE_UP = 'Move up';
export const MOVE_DOWN = 'Move down';
export const DELETE_RANK = 'Delete rank';
export const LAST_IN_GROUP = 'Each group needs at least one rank';

// ----- Dialogs -----
export const SAVE = 'Save';
export const SAVING = 'Saving…';
export const CANCEL = 'Cancel';
export const DISCARD_CHANGES = 'Discard changes';
export const ALL_EVENTS = 'All Board breaking events';

export const EDIT_PRICES = 'Edit prices';
export const PRICES_LISTED_GROUP = 'Listed prices (paid by card), per board';
export const PRICES_EXTRA_GROUP = 'Discount and event day';
export const LABEL_TECH = 'Technical board, listed price';
export const LABEL_ADULT = 'Adult board, listed price';
export const LABEL_DISCOUNT = 'Discount for paying cash or check, per board';
export const LABEL_SAME_DAY = 'From the event date on, adds per board';
export const WORKED_EXAMPLE = 'Worked example';
export const PRICES_HINT = 'Dollars and cents. A change applies to new sign-ups and when a student is edited; amounts already charged stay as they were.';
const MONEY_PROBLEMS = {
  empty: 'Enter an amount, like 3.00.',
  notMoney: 'Use dollars and cents, like 3.25.',
  tooHigh: 'Use $1,000 or less.',
  discountTooBig: 'The discount must be less than the listed price.',
};
export const moneyProblemText = (problem) => MONEY_PROBLEMS[problem] ?? null;

export const EDIT_AGE = 'Edit age groups';
export const AGE_FIELD = 'Child: this age and under';
export const TEEN_FIELD = 'Teen / Adult';
export const teenValue = (n) => `${n + 1} and up`;
export const AGE_HINT = "A student's age decides which chart row is used. Little Tiger belts always use the Little Tiger rows.";
export const AGE_PROBLEM = 'Enter a whole number from 1 to 98.';

export const EDIT_RANK = 'Edit rank';
export const ADD_RANK_TITLE = 'Add rank';
export const RANK_NAME = 'Rank name';
export const TECHNIQUE = 'Technique';
export const TECHNICAL_BOARDS = 'Technical boards';
export const ADULT_BOARDS = 'Adult boards';
export const fewer = (label) => `Fewer ${label.toLowerCase()}`;
export const more = (label) => `More ${label.toLowerCase()}`;
export const RANK_HINT = 'From 0 to 12 of each. Families see these as the starting numbers and can change them.';
export const rankSubtitle = (band, name) => (name ? `${bandName(band)} · ${name}` : bandName(band));
export const RANK_NAME_EMPTY = 'Enter a rank name.';
export const RANK_NAME_LONG = 'Use 60 characters or fewer.';
export const TECHNIQUE_LONG = 'Use 100 characters or fewer.';
export const duplicateRank = (band, name) => `There is already a rank called ${name} in ${bandName(band)}. Try another name.`;

// Delete rank asks first (the shared "are you sure?" box)
export const deleteTitle = (band, name) => `Delete ${withGroup(band, name)}?`;
export const DELETE_BODY = "Families can't pick this rank any more. Sign-ups already made keep it. This can't be undone.";
export const KEEP_RANK = 'Keep rank';
export const DELETING = 'Deleting…';
export const DELETE_FAILED = "Couldn't delete. Check the connection, then retry.";

// ----- Notes, banners, toasts -----
export const UNSAVED = 'Unsaved changes. Save or cancel first.';
export const STALE_DIALOG = "Someone else changed this just now. Your change wasn't saved. Cancel, then open it again to see the latest.";
export const STALE_DIALOG_PHONE = "Someone else changed this just now. Your change wasn't saved. Discard changes, then open it again to see the latest.";
export const NOT_ALLOWED = "Only an admin can change Chart and prices. Your change wasn't saved.";
export const INVALID_DIALOG = "That didn't save. Check the fields and try again.";
export const SAVE_FAILED = "Couldn't save. Check the connection, then retry.";
export const MOVE_FAILED = "The rank order didn't save. Check the connection, then retry.";
// What "Someone else changed … just now" names (one shared sentence, src/components/text.js).
export const stale = (name) => someoneElseChanged(name || 'Chart and prices');
export const NAME_PRICES = 'the prices';
export const NAME_AGE = 'the age groups';
export const NAME_CHART = 'the board chart';
export const TOAST_PRICES_SAVED = 'Prices saved';
export const TOAST_AGE_SAVED = 'Age groups saved';
export const TOAST_RANK_SAVED = 'Rank saved';
export const TOAST_RANK_ADDED = 'Rank added';
export const TOAST_RANK_MOVED = 'Rank moved';
export const TOAST_RANK_DELETED = 'Rank deleted';
