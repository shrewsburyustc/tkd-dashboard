// text.js — every word the staff see in the Camps section (contract 0013 §7).
// Why it exists: the data layer (src/lib/camps/campsApi.js, campRules.js) answers with CODES
// ('open', 'owes', 'not_empty' …), never with words. All the words live here, in one file, so a
// wording change is one line and the screens stay readable.
//
// Where the words come from:
//   - exact copies of the approved mockups (docs/Camps/TKD-Camps-Mockups.html, option A of
//     Camps-roster-layout-options.html) and the contract's §7.1 list;
//   - Color Belt's approved words (src/screens/testing/text.js) with "registration" → "sign-up"
//     and "student" → "camper" (§7.2) — reused by import where they are the same;
//   - lines marked  // (not in the mockups)  are new: the orchestrator shows that list to
//     Jeffrey at checkpoint CP1 (§7.3).
import * as CB from '../testing/text.js';

// ----- Reused unchanged from Color Belt (same words) -----
export const {
  UNDO,
  CANCEL,
  SAVE,
  SAVING,
  CLOSE,
  UNSAVED,
  DISCARD_CHANGES,
  STALE,
  STALE_DIALOG,
  STALE_DIALOG_PHONE,
  INVALID_DIALOG,
  SAVE_FAILED,
  DELETE_FAILED,
  UNDO_STALE,
  UNDO_FAILED,
  TOAST_UNDONE,
  deletedToast,
  ROSTER_STALE,
  ROSTER_NOT_ALLOWED,
  UNDO_PAYMENT_TOO_LATE,
  UNDO_DUPLICATE_TOO_LATE,
  actionFailed,
  TOAST_LINK_COPIED,
  TOAST_CHANGES_SAVED,
  TOAST_PAYMENT_SAVED,
  paymentUndoneToast,
  withdrawnToast,
  restoredToast,
  markedPaidToast,
  alreadyPaid,
  markPaidFailed,
  TAG_NOT_SAVED,
  TAG_PAID,
  TAG_NOT_PAID,
  TAG_POSSIBLE_DUPLICATE,
  TAG_REMOVED,
  TAG_DUPLICATE_COPY,
  MARK_PAID,
  removedGroup,
  NOT_IN_COUNTS,
  removedBy,
  REVIEW,
  CHANGE_PAYING_BY,
  EDIT_DETAILS,
  EDIT_PAYMENT,
  UNDO_PAYMENT,
  WITHDRAW,
  RESTORE,
  DELETE_PERMANENTLY,
  KEEP_THIS_ONE,
  keepThisOneLabel,
  KEEP_BOTH,
  DIFFERENT,
  CHANGE_PAYING_BY_TITLE,
  changePayingBySub,
  ALREADY_PAID_DIALOG,
  PAYING_BY_LABEL,
  EDIT_PAYMENT_TITLE,
  editPaymentSub,
  PAID_BY,
  AMOUNT,
  DATE_PAID,
  ENTER_DATE_PAID,
  AMOUNT_ZERO,
  EDIT_PAYMENT_HINT,
  priceProblemText,
  REGISTRATION_LINK,
  COPY_LINK,
  qrAlt,
  ACTIONS_COL,
  sortBy,
  dollars,
  payingByText,
  payingByLower,
  shortDate,
  monthDay,
  monthDayYear,
  weekdayMonthDay,
  stampDayTime,
  timeLabel,
  deleteStudentTitle: deleteCamperTitle,
  DELETE_STUDENT_HINT: DELETE_CAMPER_HINT,
} = CB;

// ----- The section, tabs, header -----
export const PAGE_TITLE = 'Camps';
export const TAB_CAMPS = 'Camps';
export const TAB_TEMPLATES = 'Templates';
export const ADD_CAMP = 'Add camp';
export const STAFF_LINE = 'Ask an admin to add or change camps.';
export const BOTH_SCHOOLS_SUB = 'Worcester and Shrewsbury'; // the school line on Both (as Home)
export const SCHOOL_NAMES = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
export const schoolName = (code) => SCHOOL_NAMES[code] ?? '';

// ----- C1 Camps list -----
export const UPCOMING = 'Upcoming';
export const PAST = 'Past';
export const SIDE_SWITCH_LABEL = 'Show upcoming or past camps'; // (not in the mockups) screen readers only
export const COL_CAMP = 'Camp';
export const COL_SCHOOL = 'School';
export const COL_DATES = 'Dates';
export const COL_CAMPERS = 'Campers';
export const COL_STATUS = 'Status';
export const BOTH_SCHOOLS = 'Both schools';
// "Both schools · held at Worcester" (the line under a both-schools camp's name)
export const heldAtLine = (code) => `Both schools · held at ${schoolName(code)}`;
// The School column on Both: "Worcester", "Shrewsbury" or "Both schools"
export const schoolColumn = (camp) => (camp.bothSchools ? BOTH_SCHOOLS : schoolName(camp.locationCode));
// The camp's school wherever one line is shown (link dialog, camp page)
export const campSchoolLine = (camp) => (camp.bothSchools ? heldAtLine(camp.locationCode) : schoolName(camp.locationCode));
export const NO_CAMPS_ADMIN = 'No camps yet. Add one with Add camp.'; // (not in the mockups)
export const NO_CAMPS_STAFF = 'No camps yet.'; // (not in the mockups)
export const NO_UPCOMING = 'No upcoming camps.'; // (not in the mockups)
export const NO_PAST = 'No past camps yet.'; // (not in the mockups)
export const LOADING_CAMPS = 'Loading camps…'; // (not in the mockups) screen readers only
export const LOAD_CAMPS_FAILED = "Couldn't load camps. Check the connection, then retry."; // (not in the mockups)
export const openCampLabel = (name) => `Open ${name}`;
export const editCampLabel = (name) => `Edit ${name}`;
export const moreFor = (name) => `More actions for ${name}`;

// Status tags (rule §1.13 campTag) — "Open until Nov 24" is green, the rest neutral.
export function campTagText(tag) {
  if (!tag) return '';
  if (tag.kind === 'open') return `Open until ${monthDay(tag.closesOn)}`;
  if (tag.kind === 'not_open_yet') return 'Not open yet';
  if (tag.kind === 'closed') return 'Closed';
  if (tag.kind === 'camp_today') return 'Camp today';
  if (tag.kind === 'done') return 'Done';
  return '';
}

// ----- Dates -----
// A date "YYYY-MM-DD" as a calendar day on this computer (never shifts with time zones).
function parseDay(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}
const fmt = (iso, options) => parseDay(iso)?.toLocaleDateString('en-US', options) ?? '';
// "Mon"
export const weekdayShort = (iso) => fmt(iso, { weekday: 'short' });
// "Mon 19" — the day switch and the attendance grid
export const dayChip = (iso) => `${weekdayShort(iso)} ${parseDay(iso)?.getDate() ?? ''}`;
// "Mon, Apr 19"
export const dayLong = (iso) => weekdayMonthDay(iso);
// "Sun, Apr 18" (link dialog)
export const daysCount = (n) => (n === 1 ? '1 day' : `${n} days`);
export const campersCount = (n) => (n === 1 ? '1 camper' : `${n} campers`);

// Are the sorted days one unbroken run (Mon, Tue, Wed …)?
function isRun(days) {
  for (let i = 1; i < days.length; i += 1) {
    const a = parseDay(days[i - 1]);
    const b = parseDay(days[i]);
    if (!a || !b || Math.round((b - a) / 86400000) !== 1) return false;
  }
  return true;
}

// The camp's days in one line, as in C1:
//   1 day            "Wed, Nov 11, 2026"
//   a run of days    "Mon, Apr 19 – Fri, Apr 23, 2027"
//   days with gaps   "Wed, Nov 25 & Fri, Nov 27, 2026"  (3+: "Mon, Dec 28, Tue, Dec 29 & Thu, Dec 31, 2026")
// The year is written once, at the end (each day gets its own year if the days span two years).
export function campDatesText(isoDays) {
  const days = [...isoDays].sort();
  if (days.length === 0) return '';
  const lastYear = days[days.length - 1].slice(0, 4);
  const oneYear = days.every((d) => d.slice(0, 4) === lastYear);
  const label = (iso, withYear) => (withYear ? shortDate(iso) : dayLong(iso));
  if (days.length === 1) return shortDate(days[0]);
  if (isRun(days)) return `${label(days[0], !oneYear)} – ${shortDate(days[days.length - 1])}`;
  const parts = days.map((d, i) => label(d, !oneYear || i === days.length - 1));
  return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
}
// "Mon, Apr 19 – Fri, Apr 23, 2027 · 5 days"
export const campDatesLine = (isoDays) => `${campDatesText(isoDays)} · ${daysCount(isoDays.length)}`;
// Phone card line: "Wed, Nov 11, 2026 · 1 day · 16 campers"
export const campPhoneLine = (isoDays, count) => `${campDatesLine(isoDays)} · ${campersCount(count)}`;

// "9:00 AM – 3:00 PM"
export const timeRange = (start, end) => `${timeLabel(start)} – ${timeLabel(end)}`;

// A timestamp as a clock time in Massachusetts: "9:10 AM"
export function clockTime(stamp) {
  if (!stamp) return '';
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
}
// "7:42" (no AM / PM — the tight attendance cells)
export const clockShort = (stamp) => clockTime(stamp).replace(/\s?[AP]M$/, '');

// Which days a camper comes, short: "All days" or "Mon, Tue, Wed" (or "Mon 19, Mon 26" when a
// weekday repeats in a two-week camp).
export function camperDaysText(row, campDays) {
  const mine = (row.days ?? []).map((d) => d.day).sort();
  if (campDays.length > 0 && mine.length === campDays.length) return ALL_DAYS;
  const names = mine.map(weekdayShort);
  const unique = new Set(names).size === names.length;
  return (unique ? names : mine.map(dayChip)).join(', ');
}
export const ALL_DAYS = 'All days';

// ----- Header ⋯ / row ⋯ of a camp -----
export const EDIT_CAMP = 'Edit camp';
export const CLOSE_SIGNUP = 'Close sign-up';
export const REOPEN_SIGNUP = 'Reopen sign-up';
export const REOPEN_NEEDS_ADMIN = 'The closing date has passed. Ask an admin to reopen.';
export const SAVE_AS_TEMPLATE = 'Save as template';
export const PRINT_ROSTER = 'Print roster';
export const DELETE_CAMP = 'Delete camp';
export const KEEP_CAMP = 'Keep camp'; // (not in the mockups) — like Color Belt's "Keep event"
export const TOAST_SIGNUP_CLOSED = 'Sign-up closed'; // (not in the mockups)
export const TOAST_SIGNUP_REOPENED = 'Sign-up reopened'; // (not in the mockups)
export const signupReopenedUntil = (iso) => `Sign-up reopened until ${monthDay(iso)}`; // (not in the mockups) admin, after the closing date
export const signupNotClosed = (name) => `Sign-up for ${name} wasn't closed. Check the connection, then retry.`; // (not in the mockups)
export const signupNotReopened = (name) => `Sign-up for ${name} wasn't reopened. Check the connection, then retry.`; // (not in the mockups)
export const CAMP_FINISHED = 'This camp is over, so its sign-up can’t change.'; // (not in the mockups)
export const CAMPS_NOT_ALLOWED = "Only an admin can do that. Your change wasn't saved.";
export const COPY_FAILED = "Couldn't copy the link. Select the link and copy it by hand."; // (not in the mockups)

// ----- Delete camp -----
export const deleteCampTitle = (name) => `Delete ${name}?`;
// "<Camp> and its <N> campers and <$X> in payments are deleted. This can't be undone." (§7.3)
// active = the campers the list and the camp page count; removed = withdrawn ones (they go too).
export function deleteCampBody(name, active, removed, cents) {
  if (active + removed === 0) return `${name} is deleted. This can’t be undone.`; // (not in the mockups)
  const who = removed > 0 ? `${campersCount(active)} and ${removed} removed` : campersCount(active);
  return `${name} and its ${who} and ${dollars(cents)} in payments are deleted. This can’t be undone.`; // (not in the mockups)
}
export const TOAST_CAMP_ADDED = 'Camp added'; // (not in the mockups)
export const TOAST_CAMP_SAVED = 'Camp saved'; // (not in the mockups)

// ----- C2 Templates -----
export const COL_TEMPLATE = 'Template';
export const COL_DAYS_PRICE = 'Days and price';
export const COL_EXTRAS = 'Extras';
export const USE = 'Use';
export const useTemplateLabel = (name) => `Use ${name}`;
export const EDIT_TEMPLATE = 'Edit template';
export const DELETE_TEMPLATE = 'Delete template';
export const KEEP_TEMPLATE = 'Keep template'; // (not in the mockups)
export const deleteTemplateTitle = (name) => `Delete ${name}?`; // (not in the mockups)
export const DELETE_TEMPLATE_BODY = 'The template is deleted. Camps made from it don’t change. This can’t be undone.'; // (not in the mockups)
export const NO_TEMPLATES = 'No templates yet. Open a camp’s ⋯ menu and choose Save as template.';
export const TEMPLATES_NOTE =
  'Templates are made from a camp: open the camp’s ⋯ menu and choose Save as template. Templates are shared by both schools.';
export const LOAD_TEMPLATES_FAILED = "Couldn't load templates. Check the connection, then retry."; // (not in the mockups)
export const TOAST_TEMPLATE_SAVED_EDIT = 'Template saved'; // (not in the mockups)
// "1 day · $70 (member early)" / "5 days · from $75 (1 day, member early)"
export function templateDaysPrice(dayCount, oneDayMemberEarlyCents) {
  if (dayCount === 1) return `1 day · ${dollars(oneDayMemberEarlyCents)} (member early)`;
  return `${daysCount(dayCount)} · from ${dollars(oneDayMemberEarlyCents)} (1 day, member early)`;
}
export const extrasCount = (n) => (n === 0 ? 'No extras' : n === 1 ? '1 extra' : `${n} extras`);

// ----- C2b Save as template -----
export const SAVE_TEMPLATE_TITLE = 'Save as template';
export const fromCamp = (name) => `From ${name}`;
export const TEMPLATE_NAME = 'Template name';
export const SAVE_TEMPLATE_HINT =
  'Keeps everything except the dates and campers: school, camp hours, sign-up and early-price timing, prices, extras, description and waiver.';
export const DUPLICATE_TEMPLATE = 'A template with this name exists. Choose another name.';
export const templateSavedToast = (name) => `Template saved · ${name}`;

// ----- C3 Add / Edit camp, Edit template -----
export const ADD_CAMP_TITLE = 'Add camp';
export const EDIT_CAMP_TITLE = 'Edit camp';
export const EDIT_TEMPLATE_TITLE = 'Edit template';
export const ADD_CAMP_SUB = 'Everything can be changed later with Edit camp.';
export const START_FROM = 'Start from';
export const BLANK_CAMP = 'Blank camp';
export const START_FROM_HINT = 'Fills in everything except the name and days. Choose Blank camp to start empty.';
export const SECTION_CAMP = 'Camp';
export const SECTION_TEMPLATE = 'Template'; // (not in the mockups) section 1 of Edit template
export const SECTION_TIMES = 'Times';
export const SECTION_PRICES = 'Prices';
export const SECTION_EXTRAS = 'Extras';
export const SECTION_FAMILY = 'Family form';
export const CAMP_SUMMARY_EMPTY = 'Name, school and days';
export const CAMP_NAME = 'Camp name';
export const SCHOOL = 'School';
export const HELD_AT = 'Held at';
export const DAYS = 'Days';
export const MONTH = 'Month'; // (not in the mockups) screen readers only
export const YEAR = 'Year'; // (not in the mockups) screen readers only
export const PREV_MONTH = 'Previous month'; // (not in the mockups)
export const NEXT_MONTH = 'Next month'; // (not in the mockups)
export const DAYS_HINT = 'Tap a day to add or remove it. Days don’t have to be next to each other (Thanksgiving: Wed & Fri).';
export const NUMBER_OF_DAYS = 'Number of days'; // (not in the mockups) Edit template
export const WEEKDAY_HEADS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const dayCellLabel = (iso, picked) => `${shortDate(iso)}${picked ? ', chosen' : ''}`; // screen readers
// Section 1's folded summary: "April Vacation Camp · Both schools, held at Worcester · 5 days"
export function campSectionSummary(name, school, heldAt, dayCount) {
  const where = school === 'both' ? `Both schools, held at ${schoolName(heldAt)}` : schoolName(school);
  return [name || null, where || null, dayCount > 0 ? daysCount(dayCount) : null].filter(Boolean).join(' · ');
}

// Times
export const CAMP_HOURS = 'Camp hours'; // (not in the mockups)
export const STARTS = 'Starts'; // (not in the mockups)
export const ENDS = 'Ends'; // (not in the mockups)
export const SIGNUP_OPENS = 'Family sign-up opens'; // (not in the mockups) — from the C3 description
export const SIGNUP_CLOSES = 'Family sign-up closes'; // (not in the mockups)
export const EARLY_UNTIL = 'Early price until'; // (not in the mockups)
export const OPENS_DAYS_BEFORE = 'Sign-up opens, days before the first day'; // (not in the mockups) template
export const CLOSES_DAYS_BEFORE = 'Sign-up closes, days before the first day'; // (not in the mockups) template
export const EARLY_DAYS_BEFORE = 'Early price until, days before the first day'; // (not in the mockups) template
export const OFFSETS_HINT = 'A negative number means after the first day.'; // (not in the mockups)
// "9:00 AM – 3:00 PM · sign-up Mar 1 – Apr 18 · early price until Apr 12"
export const timesSummary = (start, end, opens, closes, early) =>
  `${timeRange(start, end)} · sign-up ${monthDay(opens)} – ${monthDay(closes)} · early price until ${monthDay(early)}`;
// Template: "9:00 AM – 3:00 PM · sign-up 49 to 1 days before · early price until 7 days before" (not in the mockups)
export const templateTimesSummary = (start, end, opens, closes, early) =>
  `${timeRange(start, end)} · sign-up ${opens} to ${closes} days before · early price until ${early} days before`;
export const TIME_ORDER = 'The camp must end after it starts.'; // (not in the mockups)
export const ENTER_DATE = 'Enter a date.'; // (not in the mockups)
export const OPENS_AFTER_CLOSES = 'Sign-up must open on or before the day it closes.'; // (not in the mockups)
export const EARLY_AFTER_CLOSES = 'The early price must end on or before the day sign-up closes.'; // (not in the mockups)
export const CLOSES_AFTER_CAMP = 'Sign-up must close on or before the last camp day.'; // (not in the mockups)
export const OFFSET_PROBLEM = 'Enter a whole number from −365 to 365.'; // (not in the mockups)
export const OFFSETS_ORDER = 'Sign-up must open before it closes, and the early price must end before sign-up closes.'; // (not in the mockups)
export const TIMES_PROBLEM = 'Check the times and dates'; // (not in the mockups) folded summary

// Prices
export function pricesHint(earlyUntil) {
  const until = earlyUntil ? weekdayMonthDay(earlyUntil) : 'the early-price date';
  return `One row for each number of days, made from the chosen days. A camper’s price is the row for how many days they come. Early prices apply to sign-ups up to the end of ${until}.`;
}
export const COL_MEMBER_EARLY = 'Member early';
export const COL_MEMBER_REGULAR = 'Member regular';
export const COL_NONMEMBER_EARLY = 'Non-member early';
export const COL_NONMEMBER_REGULAR = 'Non-member regular';
export const gridRowLabel = (dayCount, total) => (dayCount === total && total > 1 ? `${daysCount(dayCount)} (all days)` : daysCount(dayCount));
export const priceCellLabel = (rowLabel, column) => `${column}, ${rowLabel}`; // screen readers
export const rowsNeedPrices = (n) => (n === 1 ? '1 row needs prices' : `${n} rows need prices`);
export const PICK_DAYS_FIRST = 'Pick the camp days first.'; // (not in the mockups)
// "5 rows · 1 day $75 … all days $275 (member early)"
export function pricesSummary(rows) {
  if (rows.length === 0) return PICK_DAYS_FIRST;
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (rows.length === 1) return `1 row · 1 day ${dollars(first.memberEarlyCents)} (member early)`;
  return `${rows.length} rows · 1 day ${dollars(first.memberEarlyCents)} … all days ${dollars(last.memberEarlyCents)} (member early)`;
}

// Extras
export const EXTRA_NAME = 'Name'; // (not in the mockups) column / label
export const EXTRA_PRICE = 'Price'; // (not in the mockups)
export const EXTRA_PER = 'How it’s charged'; // (not in the mockups) screen readers only
export const ONCE = 'Once';
export const PER_DAY = 'Per day';
export const NOT_FOR_ALL_DAYS = 'Not charged to all-days campers';
export const ADD_EXTRA = 'Add extra';
// Owner decision 2026-10-19 (Camps-pizza-days-options.html): a per-day extra offered only on some days.
export const ONLY_ON_DAYS = 'Only on these days';
export const ONLY_ON_HINT = 'Leave it empty for every day.'; // (not in the mockups)
export const ISO_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // index 0 = ISO 1 (Monday)
export const extraNoDaysLeft = (name) => `${name || 'This extra'} has none of the camp's days left. Pick its days again, or clear them for every day.`; // (not in the mockups)
export const extraNoDaysSummary = (n) => (n === 1 ? '1 extra has no days left' : `${n} extras have no days left`); // (not in the mockups)
// "Pizza party $5 · Wed, Fri"
export const extraOnlySummary = (name, cents, dayLabels) => `${name} ${dollars(cents)} · ${dayLabels.join(', ')}`;
// Short labels for camp dates: weekday names, or "Mon 19" when a weekday repeats.
export function shortDayLabels(isoDays) {
  const names = isoDays.map(weekdayShort);
  return new Set(names).size === names.length ? names : isoDays.map(dayChip);
}
export const removeExtraLabel = (name) => `Remove ${name || 'this extra'}`; // (not in the mockups)
export const NO_EXTRAS = 'No extras'; // (not in the mockups)
export const MAX_EXTRAS_NOTE = 'A camp can have up to 10 extras.'; // (not in the mockups)
export const extrasNoPrice = (n) => (n === 1 ? '1 extra has no price' : `${n} extras have no price`);
export const extrasNoName = (n) => (n === 1 ? '1 extra has no name' : `${n} extras have no name`); // (not in the mockups)
export const EXTRAS_SAME_NAME = 'Two extras have the same name'; // (not in the mockups)
export const ENTER_EXTRA_NAME = 'Enter a name.'; // (not in the mockups)
export const SAME_EXTRA_NAME = 'Another extra has this name.'; // (not in the mockups)
// "Early drop-off $15/day · Late pick-up $8/day · Pizza party (Fri) $5"
export const extraSummaryPart = (name, cents, per) => `${name} ${dollars(cents)}${per === 'day' ? '/day' : ''}`;
// Removing a day from an extra's "Only on these days" that campers chose (database / mock
// refusal not_empty, kind 'extra_day'): "Can't remove Wed from Pizza party: 3 campers chose it …"
export const cantRemoveExtraDay = (day, extraName, n) => `Can’t remove ${weekdayShort(day)} from ${extraName}: ${campersCount(n)} chose it. Change their ${extraName.charAt(0).toLowerCase()}${extraName.slice(1)} days first.`; // (not in the mockups)
export const cantRemoveExtra = (name, n) => `Can’t remove ${name}: ${campersCount(n)} picked it. Change their extras first.`; // (§7.3)

// Family form
export const AGES_ACCEPTED = 'Ages accepted';
export const AGES_FROM = 'from';
export const AGES_TO = 'to';
export const AGES_HINT = 'A blank camp starts at 3 to 17; a template brings its own range. The family form only accepts children in this range.';
export const AGES_ORDER = 'The first age must be lower than the second.';
export const ENTER_AN_AGE = 'Enter an age';
export const AGES_RANGE = 'Enter an age from 1 to 99.'; // (not in the mockups)
export const agesShort = (min, max) => `Ages ${min}–${max}`;
export const familySummary = (min, max, fromTemplate) =>
  `${agesShort(min, max)} · description and waiver${fromTemplate ? ' from the template' : ''}`;
export const FAMILY_AGES_PROBLEM = 'Ages: the first age must be lower than the second';
export const FAMILY_PROBLEM = 'Check the ages and the waiver'; // (not in the mockups)
export const DESCRIPTION = 'Description';
export const DESCRIPTION_HINT = 'Shown at the top of the family sign-up form and on the “You’re signed up” page. Put what to bring here.';
export const WAIVER_TEXT = 'Waiver text';
export const WAIVER_HINT = 'Families read and sign this on the form.';
export const waiverFromTemplate = (name) => `Families read and sign this on the form. Filled in from the ${name} template.`;
export const ENTER_WAIVER = 'Enter the waiver text.'; // (not in the mockups)
export const TEXT_TOO_LONG = (max) => `Use ${max.toLocaleString('en-US')} characters or fewer.`; // (not in the mockups)

// Camp / template name problems
export const ENTER_CAMP_NAME = 'Enter a camp name.'; // (not in the mockups)
export const ENTER_TEMPLATE_NAME = 'Enter a template name.'; // (not in the mockups)
export const NAME_TOO_LONG = 'Use 60 characters or fewer.'; // (not in the mockups)
export const NAME_BAD_CHARACTER = 'Remove the hidden character from the name.'; // (not in the mockups)
export const PICK_A_DAY = 'Pick at least one day.'; // (not in the mockups)
export const TOO_MANY_DAYS = 'A camp can have up to 10 days.'; // (not in the mockups)
export const PAST_DAY = 'New days can’t be in the past.'; // (not in the mockups)
// "Can't remove Wed, Dec 30: Mia Rossi and 2 more picked it. Change their days or withdraw them first."
export function cantRemoveDay(day, first, last, more) {
  const who = `${first} ${last}`.trim();
  const names = more > 0 ? `${who} and ${more} more` : who;
  return `Can’t remove ${dayLong(day)}: ${names} picked it. Change their days or withdraw them first.`;
}

// ----- Camp page (v0.704 option A) -----
export const BACK_TO_CAMPS = 'Camps';
export const TAB_CHECK_IN = 'Check in';
export const TAB_PAYMENTS = 'Payments';
export const TAB_ATTENDANCE = 'Attendance';
export const paymentsTabLabel = (n) => (n > 0 ? `Payments · ${n}` : 'Payments'); // the tab's screen-reader name
// "Mon, Apr 19 – Fri, Apr 23, 2027 · 9:00 AM – 3:00 PM · Both schools · held at Worcester · 18 campers"
export const campSummaryLine = (camp, days, count) =>
  [campDatesText(days), timeRange(camp.startTime, camp.endTime), campSchoolLine(camp), campersCount(count)].join(' · ');
export const LOADING_CAMP = 'Loading the camp…'; // (not in the mockups) screen readers only
export const LOAD_CAMP_FAILED = "Couldn't load this camp. Check the connection, then retry."; // (not in the mockups)
export const CAMP_GONE = 'This camp was deleted.'; // (not in the mockups)
export const MORE_CAMP_ACTIONS = 'More actions for this camp'; // (not in the mockups) screen readers + tooltip
export const NO_CAMPERS = 'No campers yet. Families sign up with the Registration link.'; // (§7.3)

// Check in
export const DAY_SWITCH_LABEL = 'Camp day'; // (not in the mockups) screen readers only
// The big-number line (option A): the number is drawn large, the words after it normal.
export const hereOf = (total) => `of ${total} here`;
export const NOT_HERE_WORDS = 'not here yet';
export const PAID_WORDS = 'paid';
export const toCollectWords = (cents) => `to collect · ${dollars(cents)}`;
export const FIND_CAMPER = 'Find a camper';
export const NOT_HERE_YET = (n) => `Not here yet · ${n}`;
export const HERE = (n) => `Here · ${n}`;
export const CHECK_IN = 'Check in';
export const checkInLabel = (name) => `Check in ${name}`;
export const checkedInToast = (name, stamp) => `${name} checked in · ${clockTime(stamp)}`;
export const UNDO_CHECK_IN = 'Undo check-in';
export const checkInUndoneToast = (name) => `Check-in undone for ${name}`; // (not in the mockups)
export const noCampersOn = (day) => `No campers on ${dayLong(day)}.`; // (§7.3)
export const NO_MATCH = 'No camper with that name on this day.'; // (not in the mockups)
export const checkedInAt = (stamp) => `Checked in at ${clockTime(stamp)}`; // screen readers
export const checkInFailed = (name) => `${name} wasn't checked in. Check the connection and try again.`; // (not in the mockups)
export const undoCheckInFailed = (name) => `${name}'s check-in wasn't undone. Check the connection and try again.`; // (not in the mockups)
export const isWithdrawn = (name) => `${name} was withdrawn. Restore them first.`; // (§7.2, "an admin can" dropped: staff restore too)
export const NOTE_NOT_PAID = 'Not paid';
export const noExtraNote = (name) => `No ${name.charAt(0).toLowerCase()}${name.slice(1)}`; // "No pizza party" (owner decision 2026-10-19)
// "Pizza party today: 15" — the number is drawn big. Another day: "Pizza party: 12" (not in the mockups).
export const extraTodayLine = (name, isToday = true) => (isToday ? `${name} today:` : `${name}:`);
export const noteOwes = (cents) => `Owes ${dollars(cents)}`;
export const notePopoverLine = (name, kind, cents) => (kind === 'owes' ? `${name} owes ${dollars(cents)}` : `${name} · not paid · ${dollars(cents)}`); // (not in the mockups)
export const PAYMENT_NOTE_LABEL = (name) => `Payment for ${name}`; // (not in the mockups) screen readers

// Payments
export const TO_COLLECT = (n) => `To collect · ${n}`;
export const PAID_GROUP = (n) => `Paid · ${n}`;
export const tagOwes = (cents) => `Owes ${dollars(cents)}`;
export const markPaidAmount = (cents) => `Mark paid ${dollars(cents)}`;
export const markPaidLabel = (name, cents) => `Mark ${name} paid, ${dollars(cents)}`;
export const reviewDuplicateLabel = (name) => `Possible duplicate: review ${name}`;
export const ADMIN_GROUP = 'Admin';
// Mark paid on the Both view of a both-schools camp (v0.707, picture option A)
export const markPaidTitle = (name) => `Mark paid — ${name}`;
export const markPaidAmountLine = (cents, method) => `${dollars(cents)} · ${payingByLower(method)}`;
export const PAID_AT_WHICH = 'Paid at which school?';
export const PICK_SCHOOL_FIRST = 'Pick a school first.'; // (not in the mockups)
export const SCHOOL_REFUSED = 'Pick the school where it was paid.'; // (not in the mockups) database: invalid, field school
export const PAID_AT = 'Paid at'; // (not in the mockups) Edit payment's school choice
export const COL_CAMPER = 'Camper';
export const COL_TOTAL = 'Total';
export const camperNameAge = (row) => `${row.firstName} ${row.lastName} · ${row.age}`;
export const camperLabel = (row) => `${row.firstName} ${row.lastName}`;
export const nonMember = 'non-member';
export const camperPayLine = (daysText, payingBy) => `${daysText} · ${payingByLower(payingBy)}`;
export const duplicateBoxLine = (n) => (n === 1 ? '1 possible duplicate' : `${n} possible duplicates`);
export const signedUpTwice = (name) => `${name} is signed up twice`;
export const DELETE_CAMPER_BODY_NO_PAY = (camp) => `The sign-up is deleted from ${camp}. This can’t be undone.`;
export function deleteCamperBody(campName, payments) {
  if (payments.length === 0) return DELETE_CAMPER_BODY_NO_PAY(campName);
  const p = payments[0];
  const paid = `the ${dollars(p.amountCents)} ${payingByLower(p.method)} payment recorded on ${monthDay(p.paidOn)}`;
  return `The sign-up and ${paid} are deleted from ${campName}. This can’t be undone.`;
}
export const KEEP_CAMPER = 'Keep camper';
export const TOAST_KEPT_BOTH = 'Kept both sign-ups';
export const duplicateRemovedToast = (name) => `${name}’s extra copy moved to Removed`;

// Attendance
export const COL_CAME = 'Came';
export const cameText = (came, soFar) => `${came} of ${soFar}`;
export const CELL_CAME = (stamp) => `came, ${clockTime(stamp)}`; // screen readers
export const CELL_MISSED = 'didn’t come';
export const CELL_UPCOMING = 'signed up, still to come';
export const CELL_NOT_SIGNED_UP = 'not signed up that day';
export const ATTENDANCE_LEGEND = '✓ came (check-in time) · ✗ signed up, didn’t come · dashed: still to come · — not signed up that day'; // (not in the mockups) short legend

// Print roster
export const printedOn = (stamp) => `Printed ${stampDayTime(stamp)}`; // (not in the mockups)
export const printLoadFailed = "Couldn't load the roster to print. Check the connection, then retry."; // (not in the mockups)

// ----- C4b compare -----
export const compareTitle = (name) => `${name} is signed up twice`;
export const COMPARE_SUB = 'Same name at the same camp. Differences are highlighted.';
export const FIRST_SIGNUP = 'First sign-up';
export const SECOND_SIGNUP = 'Second sign-up';
export const COMPARE_NOTE =
  'Keeping one moves the other sign-up to Removed as “Duplicate copy”, together with its payment record (Undo for 5 seconds; admins can Restore both). Both are logged.';
export const KEEP_ONE_ADMIN_ONLY = 'The camp is over. Only an admin can keep one sign-up and remove the other now.'; // (not in the mockups) — Color Belt v0.194 line, camp words
export const CMP_SIGNED_UP = 'Signed up';
export const CMP_REFERENCE = 'Reference';
export const CMP_DAYS = 'Days';
export const CMP_EXTRAS = 'Extras';
export const CMP_PAYING_BY = 'Paying by';
export const CMP_TOTAL = 'Total';
export const CMP_PAYMENT = 'Payment';
export const signedUpStamp = (stamp) => `${stampDayTime(stamp)} · family form`;

// ----- C5 Registration link -----
export const linkDialogLine = (state, camp) => {
  if (state === 'open') return `Family sign-up is open until ${weekdayMonthDay(camp.signupClosesOn)}. Families choose their child’s days and extras on the form.`;
  if (state === 'not_open_yet') return `Family sign-up opens on ${weekdayMonthDay(camp.signupOpensOn)}. Families choose their child’s days and extras on the form.`; // (not in the mockups)
  if (state === 'closed') return 'Family sign-up is closed. Reopen it from the ⋯ menu to take more sign-ups.'; // (not in the mockups)
  return 'This camp is over.'; // (not in the mockups)
};
export const DOWNLOAD_QR = 'Download QR code';
export const DOWNLOAD_FAILED = "Couldn't make the QR code file. Try again."; // (not in the mockups)

// ----- C6 Camper detail -----
export const ageLine = (age, member) => `Age ${age} · ${member ? 'member' : 'non-member'}`;
export const DETAIL_DAYS = 'Days';
export const DETAIL_EXTRAS = 'Extras';
export const DETAIL_PRICE = 'Price';
export const DETAIL_PAYING_BY = 'Paying by';
export const DETAIL_STATUS = 'Status';
export const DETAIL_PAYMENTS = 'Payments';
export const DETAIL_CHECKINS = 'Check-in'; // (not in the mockups) — v0.704: check-in times per day
export const DETAIL_PARENT = 'Parent or guardian';
export const DETAIL_EMERGENCY = 'Emergency contact';
export const DETAIL_REMOVED = 'Removed'; // (not in the mockups)
export const HEAD_PAYMENTS = 'Payments';
export const HEAD_FAMILY = 'Family';
export const HEAD_SIGNUP = 'Sign-up';
export const NONE_YET = 'None yet';
// "Mon, Apr 19 · Wed, Apr 21 · 2 days" / "All days · 5 days"
export function detailDaysLine(isoDays, allDays) {
  if (allDays) return `All days · ${daysCount(isoDays.length)}`;
  return `${isoDays.map(dayLong).join(' · ')} · ${daysCount(isoDays.length)}`;
}
// "Late pick-up (3:00–4:00 PM) on Mon, Wed" / "on all days" / once extras: just the name
export function detailExtraLine(extra, allCampDays) {
  if (extra.per !== 'day') return extra.name;
  const days = [...(extra.days ?? [])].sort();
  const all = allCampDays.length > 0 && days.length === allCampDays.length;
  return `${extra.name} on ${all ? 'all days' : days.map(weekdayShort).join(', ')}`;
}
export const NO_EXTRAS_DETAIL = 'None'; // (not in the mockups)
// An extra offered only on some days, with the child's days: "Pizza party — Wed" (owner decision 2026-10-19)
export const detailExtraOnlyLine = (name, isoDays) => `${name} — ${shortDayLabels([...isoDays].sort()).join(', ')}`;
// "Early price, 2 days $150 + late pick-up × 2 $16 = $166"
export function priceBreakdownLine(b, allDays) {
  const kind = b.priceKind === 'early' ? 'Early price' : 'Regular price';
  const days = allDays ? 'all days' : daysCount(b.dayCount);
  const parts = [`${kind}, ${days} ${dollars(b.baseCents)}`];
  for (const extra of b.extras ?? []) {
    const count = extra.per === 'day' ? (extra.days ?? []).length : 1;
    const label = extra.name.charAt(0).toLowerCase() + extra.name.slice(1);
    parts.push(`${label}${extra.per === 'day' ? ` × ${count}` : ''} ${dollars(extra.cents)}`);
  }
  return `${parts.join(' + ')} = ${dollars(b.totalCents)}`;
}
// "Apr 19, 8:52 AM  $166  Cash  Staff"
// "$166 cash · Shrewsbury · Mar 3 · Jeffrey" — with the school whose drawer has it (v0.707)
export const paymentLine = (p) =>
  [`${dollars(p.amountCents)} ${payingByLower(p.method)}${p.kind === 'reversal' ? ' (reversed)' : ''}`, schoolName(p.school), monthDay(p.paidOn), p.recordedByName].filter(Boolean).join(' · ');
export const overpaidLine = (total, paid) => `Total now ${dollars(total)} · paid ${dollars(paid)} · `;
export const overpaidAmber = (cents) => `Paid ${dollars(cents)} more than the total`;
export const OVERPAID_ADMIN = 'An admin can change the payment from the roster’s ⋯ → Edit payment if money is handed back.';
export const owesLine = (total, paid, owes) => `Total now ${dollars(total)} · paid ${dollars(paid)} · owes ${dollars(owes)}`; // (not in the mockups)
export const contactLine = (name, relation, phone) => `${name} · ${relation} · ${phone}`;
export function signupLine(row) {
  const signed = row.signatureDeletedAt ? 'signature deleted after 3 years' : 'waiver signed on the form';
  return `Signed up on the family form, ${monthDayYear(row.signedUpOn)} · ${signed} · reference ${row.reference}`;
}
export const removedDetail = (row) =>
  `${row.withdrawnReason === 'duplicate_copy' ? 'Duplicate copy' : 'Withdrawn'} ${removedBy(row.withdrawnAt, row.withdrawnByName)}`; // (not in the mockups)
export const LOADING_CAMPER = 'Loading…'; // (not in the mockups)
export const LOAD_CAMPER_FAILED = "Couldn't load this camper. Check the connection, then retry."; // (not in the mockups)
export const RETRY = CB.RETRY;

// Edit details
export const EDIT_DETAILS_TITLE = 'Edit details';
export const editDetailsSub = (name, camp) => `${name} · ${camp}`; // (not in the mockups) — as Color Belt
export const FIRST_NAME = 'First name';
export const LAST_NAME = 'Last name';
export const AGE = 'Age';
export const isMember = (first) => `Is ${first || 'the child'} a U.S.T.C. member?`;
export const YES = 'Yes';
export const NO = 'No';
export const WHICH_DAYS = 'Which days?';
export const EXTRAS = 'Extras';
export const extraPriceText = (cents, per) => (per === 'day' ? `${dollars(cents)} a day` : dollars(cents));
export const EXTRA_WHICH_DAYS = 'which days?';
export const PARENT = 'Parent or guardian';
export const EMERGENCY = 'Emergency contact';
export const CONTACT_NAME = 'Name'; // (not in the mockups) — the family form's field label
export const PHONE = 'Phone';
export const RELATIONSHIP = 'Relationship to the child';
export const ENTER_FIRST = 'Enter the child’s first name.';
export const ENTER_LAST = 'Enter the child’s last name.';
export const ENTER_AGE = 'Enter the child’s age.';
export const AGE_RANGE_STAFF = 'Enter an age from 1 to 99.'; // (not in the mockups)
export const CHOOSE_DAY = 'Choose at least one day.';
export const CHOOSE_WHICH_DAYS = 'Choose which days.';
export const ENTER_NAME = 'Enter a name.';
export const ENTER_PHONE = 'Enter a 10-digit phone number.';
export const ENTER_RELATION = 'Enter the relationship.';
export const newTotalLine = (cents) => `Total now ${dollars(cents)}`; // (not in the mockups) live price while editing
export const REPRICE_NOTE = 'Changing days, member or extras prices the camper at the camp’s current prices.'; // (not in the mockups)
export const TOTAL_TOO_HIGH = 'A camper’s total can be $2,000 at most.'; // (not in the mockups)
export const checkedInCantRemove = (day) => `This camper was checked in on ${dayLong(day)}. Undo that check-in first.`; // (§7.3, the camper's name is the dialog title)
export const PAYMENT_NOT_HERE = 'Payments are changed from the roster’s ⋯ menu.'; // (not in the mockups)
export const AMOUNT_TOO_HIGH = 'Enter $2,000 or less.'; // (not in the mockups)
