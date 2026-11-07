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
// Follows "Hide private details" (v0.506; for Camps rulebook v0.722, design review C1): its two
// gray words come from src/lib/privateDetails.js (re-exported at the end), and the sentences that
// can name money take a `detailsHidden` input so they never do while the switch is on.
// Money is written by the dashboard's shared `formatMoney` (src/lib/money.js; rulebook v0.732,
// design review C17), no longer by Color Belt's `dollars`: "$1,355", "$350 due", "$0" read as
// before (Camps' amounts are whole dollars), and a minus amount gets a real minus sign before the
// dollar sign ("−$335 card (reversed)" in Camper detail, where it used to say "$-335").
// The Registration link box's words (Copy link, Download QR code, the failure notes) come with the
// shared box, src/components/text.js (rulebook v0.733, design review C11).
import { formatMoney } from '../../lib/money.js';
import * as CB from '../testing/text.js';

// ----- Reused unchanged from Color Belt (same words) -----
// (Review, Keep this one, "Not the same person — keep both", "different" and the compare's Close
// now come with the shared DuplicateBox / CompareDialog, src/components/text.js; rulebook v0.729.)
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
  alreadyPaid,
  markPaidFailed,
  TAG_NOT_SAVED,
  TAG_PAID,
  TAG_NOT_PAID,
  TAG_POSSIBLE_DUPLICATE,
  TAG_REMOVED,
  TAG_DUPLICATE_COPY,
  removedGroup,
  NOT_IN_COUNTS,
  removedBy,
  REVIEW_DUPLICATE, // 'Review possible duplicate' — the camper ⋯ menu item, as Color Belt's menu (v0.724, C8)
  CHANGE_PAYING_BY,
  EDIT_DETAILS,
  EDIT_PAYMENT,
  UNDO_PAYMENT,
  WITHDRAW,
  RESTORE,
  DELETE_PERMANENTLY,
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
  ACTIONS_COL,
  sortBy,
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
// Also the school line under the page title on Both (v0.723, design review C15; was "Worcester and Shrewsbury").
export const BOTH_SCHOOLS = 'Both schools';
// "Both schools · held at Worcester" (the line under a both-schools camp's name)
export const heldAtLine = (code) => `Both schools · held at ${schoolName(code)}`;
// The School column on Both: "Worcester", "Shrewsbury" or "Both schools"
export const schoolColumn = (camp) => (camp.bothSchools ? BOTH_SCHOOLS : schoolName(camp.locationCode));
// The camp's school wherever one line is shown (the Registration link box's card heading, the camp page)
export const campSchoolLine = (camp) => (camp.bothSchools ? heldAtLine(camp.locationCode) : schoolName(camp.locationCode));
export const NO_CAMPS_ADMIN = 'No camps yet. Add one with Add camp.'; // (not in the mockups)
export const NO_CAMPS_STAFF = 'No camps yet. An admin adds them.'; // (not in the mockups; §8 Empty states, v0.53)
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
//   days with gaps   "Wed, Nov 25 & Fri, Nov 27, 2026"; runs of 3+ days become ranges  (3+: "Mon, Dec 28, Tue, Dec 29 & Thu, Dec 31, 2026")
// The year is written once, at the end (each day gets its own year if the days span two years).
export function campDatesText(isoDays) {
  const days = [...isoDays].sort();
  if (days.length === 0) return '';
  const lastYear = days[days.length - 1].slice(0, 4);
  const oneYear = days.every((d) => d.slice(0, 4) === lastYear);
  const label = (iso, withYear) => (withYear ? shortDate(iso) : dayLong(iso));
  if (days.length === 1) return shortDate(days[0]);
  if (isRun(days)) return `${label(days[0], !oneYear)} – ${shortDate(days[days.length - 1])}`;
  // Days with gaps: each unbroken run of 3+ days becomes a range, so a two-week camp reads
  // "Mon, Jul 5 – Fri, Jul 9 & Mon, Jul 12 – Fri, Jul 16, 2027" (CP5).
  const runs = [];
  for (const d of days) {
    const last = runs[runs.length - 1];
    if (last && isRun([last[last.length - 1], d])) last.push(d);
    else runs.push([d]);
  }
  const parts = [];
  runs.forEach((run, r) => {
    const isLastRun = r === runs.length - 1;
    if (run.length >= 3) parts.push(`${label(run[0], !oneYear)} – ${label(run[run.length - 1], !oneYear || isLastRun)}`);
    else run.forEach((d, i) => parts.push(label(d, !oneYear || (isLastRun && i === run.length - 1))));
  });
  if (parts.length === 1) return parts[0];
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
// "Open sign-up" (was "Reopen sign-up"; rulebook v0.725, design review C12) and its related words.
export const OPEN_SIGNUP = 'Open sign-up';
// Staff's grayed reason in the ⋯ menu and the matching banner (Camps' own words since v0.725;
// Color Belt and Star still say "…to reopen." until their own reviews decide).
export const OPEN_NEEDS_ADMIN = 'The closing date has passed. Ask an admin to open it.';
export const SAVE_AS_TEMPLATE = 'Save as template';
export const PRINT_ROSTER = 'Print roster';
export const DELETE_CAMP = 'Delete camp';
export const KEEP_CAMP = 'Keep camp'; // (not in the mockups) — like Color Belt's "Keep event"
// The red button of every Camps delete box while it works (Delete camp, Delete template, Delete
// camper permanently; the shared ConfirmBox, rulebook v0.729 / v1.103).
export const DELETING = 'Deleting…';
export const TOAST_SIGNUP_CLOSED = 'Sign-up closed'; // (not in the mockups)
export const TOAST_SIGNUP_OPEN = 'Sign-up open'; // (v0.725)
// The Undo of Close sign-up opens it again, so it says so (design review R2-07, rulebook v1.051 (1);
// the Undo of Open sign-up stays "Undone").
export const TOAST_UNDONE_SIGNUP_OPEN = 'Undone. Sign-up is open again.';
export const signupOpenUntil = (iso) => `Sign-up open until ${monthDay(iso)}`; // (v0.725) admin, after the closing date
export const signupNotClosed = (name) => `Sign-up for ${name} wasn't closed. Check the connection, then retry.`; // (not in the mockups)
export const signupNotOpened = (name) => `Sign-up for ${name} wasn't opened. Check the connection, then retry.`; // (v0.725)
export const CAMP_FINISHED = 'This camp is over, so its sign-up can’t change.'; // (not in the mockups)
export const CAMPS_NOT_ALLOWED = "Only an admin can do that. Your change wasn't saved.";

// ----- Delete camp -----
export const deleteCampTitle = (name) => `Delete ${name}?`;
// "<Camp> and its <N> campers and <$X> in payments are deleted. This can't be undone." (§7.3)
// active = the campers the list and the camp page count; removed = withdrawn ones (they go too).
// detailsHidden (Hide private details, v0.722): "any recorded payment" instead of the amount, said the
// same way whether anything was paid or not — "April Vacation Camp, its 19 campers and 1 removed,
// and any recorded payment are deleted. This can't be undone." (picture 03b)
export function deleteCampBody(name, active, removed, cents, detailsHidden = false) {
  if (active + removed === 0) return `${name} is deleted. This can’t be undone.`; // (not in the mockups)
  const who = removed > 0 ? `${campersCount(active)} and ${removed} removed` : campersCount(active);
  if (detailsHidden) return `${name}, its ${who}${removed > 0 ? ',' : ''} and any recorded payment are deleted. This can’t be undone.`;
  return `${name} and its ${who} and ${formatMoney(cents)} in payments are deleted. This can’t be undone.`; // (not in the mockups)
}
export const TOAST_CAMP_ADDED = 'Camp added'; // (not in the mockups)
export const TOAST_CAMP_SAVED = 'Camp saved'; // (not in the mockups)

// ----- Undo after Camps' saves (rulebook v0.726, design review C4 / C5) -----
// Edit payment's toast: Black Belt's words (its TOAST_PAYMENT_CHANGED), with Undo.
export const TOAST_PAYMENT_CHANGED = 'Payment changed';
// An Undo the database refused for a reason it named (a family picked a newly added day, an
// extra campers now have …): the amber bar says so. reason = one of the "Can’t …" sentences.
// (not in the mockups)
// (Starts like Color Belt's UNDO_STALE, "Couldn't undo. …")
export const undoRefused = (reason) => `Couldn’t undo. ${reason}`; // curly ’ like the reasons it is joined to

// A camper's Undo the database refused as 'invalid' (the old details no longer fit the camp).
export const UNDO_DETAILS_NO_LONGER_FIT = 'The old details no longer fit the camp as it is now. Open Edit details to change them by hand.'; // (not in the mockups)

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
// A template's dayCount is its "days per week" (weekly pricing, v0.717):
// "1 day a week · $70 (member early)" / "5 days a week · from $75 (1 day, member early)"
export function templateDaysPrice(dayCount, oneDayMemberEarlyCents) {
  if (dayCount === 1) return `1 day · ${formatMoney(oneDayMemberEarlyCents)} (member early)`;
  return `${daysCount(dayCount)} · from ${formatMoney(oneDayMemberEarlyCents)} (1 day, member early)`;
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
export const START_FROM_HINT = 'Fills in everything except the name and days. Choose Blank camp to start with only Early drop-off and Late pick-up.'; // v0.739
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
export const DAYS_PER_WEEK = 'Days per week'; // Edit template (weekly pricing v0.717: the price grid's rows, 1–7)
export const WEEKDAY_HEADS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const dayCellLabel = (iso, picked) => `${shortDate(iso)}${picked ? ', chosen' : ''}`; // screen readers
// Section 1's folded summary: "April Vacation Camp · Both schools, held at Worcester · 5 days"
// (a template: "… · 5 days a week" — perWeek true)
export function campSectionSummary(name, school, heldAt, dayCount, perWeek = false) {
  const where = school === 'both' ? `Both schools, held at ${schoolName(heldAt)}` : schoolName(school);
  const days = dayCount > 0 ? `${daysCount(dayCount)}${perWeek ? ' a week' : ''}` : null;
  return [name || null, where || null, days].filter(Boolean).join(' · ');
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

// Prices (weekly pricing, rulebook v0.717: the grid is per week, rows 1…W)
export function pricesHint(earlyUntil) {
  const until = earlyUntil ? weekdayMonthDay(earlyUntil) : 'the early-price date';
  return `Prices are per week. Each week a camper comes is priced by the row for how many days they come that week, and the weeks add up. Early prices apply to sign-ups up to the end of ${until}.`;
}
export const COL_MEMBER_EARLY = 'Member early';
export const COL_MEMBER_REGULAR = 'Member regular';
export const COL_NONMEMBER_EARLY = 'Non-member early';
export const COL_NONMEMBER_REGULAR = 'Non-member regular';
export const gridRowLabel = (dayCount, total) => (dayCount === total && total > 1 ? `${daysCount(dayCount)} (full week)` : daysCount(dayCount));
export const priceCellLabel = (rowLabel, column) => `${column}, ${rowLabel}`; // screen readers
export const rowsNeedPrices = (n) => (n === 1 ? '1 row needs prices' : `${n} rows need prices`);
export const PICK_DAYS_FIRST = 'Pick the camp days first.'; // (not in the mockups)
// "5 rows · 1 day $75 … full week $275 (member early)"
export function pricesSummary(rows) {
  if (rows.length === 0) return PICK_DAYS_FIRST;
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (rows.length === 1) return `1 row · 1 day ${formatMoney(first.memberEarlyCents)} (member early)`;
  return `${rows.length} rows · 1 day ${formatMoney(first.memberEarlyCents)} … full week ${formatMoney(last.memberEarlyCents)} (member early)`;
}

// Extras
export const EXTRA_NAME = 'Name'; // (not in the mockups) column / label
export const EXTRA_PRICE = 'Price'; // (not in the mockups)
export const EXTRA_PER = 'How it’s charged'; // (not in the mockups) screen readers only
export const ONCE = 'Once';
export const PER_DAY = 'Per day';
export const NOT_FOR_ALL_DAYS = 'Not charged to all-days campers';
export const NOT_FOR_ALL_DAYS_HINT = 'Included in any week the camper comes every day.'; // weekly pricing R6
export const ADD_EXTRA = 'Add extra';
// Owner decision 2026-10-19 (Camps-pizza-days-options.html): a per-day extra offered only on some days.
export const ONLY_ON_DAYS = 'Only on these days';
export const ONLY_ON_HINT = 'Leave it empty for every day.'; // (not in the mockups)
export const ISO_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // index 0 = ISO 1 (Monday)
export const extraNoDaysLeft = (name) => `${name || 'This extra'} has none of the camp's days left. Pick its days again, or clear them for every day.`; // (not in the mockups)
export const extraNoDaysSummary = (n) => (n === 1 ? '1 extra has no days left' : `${n} extras have no days left`); // (not in the mockups)
// "Pizza party $5 · Wed, Fri"
export const extraOnlySummary = (name, cents, dayLabels) => `${name} ${formatMoney(cents)} · ${dayLabels.join(', ')}`;
// Short labels for camp dates: weekday names, or "Mon 19" when a weekday repeats.
export function shortDayLabels(isoDays) {
  const names = isoDays.map(weekdayShort);
  return new Set(names).size === names.length ? names : isoDays.map(dayChip);
}
export const removeExtraLabel = (name) => `Remove ${name || 'this extra'}`; // (not in the mockups)
export const NO_EXTRAS = 'No extras'; // (not in the mockups)
// The two extras a Blank camp starts with (v0.739, picture 21x option A): every camp has them, so
// the admin only types their prices (or removes one with ✕). Names only — no price is kept here.
export const DEFAULT_EXTRA_NAMES = ['Early drop-off', 'Late pick-up'];
export const MAX_EXTRAS_NOTE = 'A camp can have up to 10 extras.'; // (not in the mockups)
export const extrasNoPrice = (n) => (n === 1 ? '1 extra has no price' : `${n} extras have no price`);
export const extrasNoName = (n) => (n === 1 ? '1 extra has no name' : `${n} extras have no name`); // (not in the mockups)
export const EXTRAS_SAME_NAME = 'Two extras have the same name'; // (not in the mockups)
export const ENTER_EXTRA_NAME = 'Enter a name.'; // (not in the mockups)
export const SAME_EXTRA_NAME = 'Another extra has this name.'; // (not in the mockups)
// "Early drop-off $15/day · Late pick-up $8/day · Pizza party (Fri) $5"
export const extraSummaryPart = (name, cents, per) => `${name} ${formatMoney(cents)}${per === 'day' ? '/day' : ''}`;
// Removing a day from an extra's "Only on these days" that campers chose (database / mock
// refusal not_empty, kind 'extra_day'): "Can't remove Wed from Pizza party: 3 campers chose it …"
export const cantRemoveExtraDay = (day, extraName, n) => `Can’t remove ${weekdayShort(day)} from ${extraName}: ${campersCount(n)} chose it. Change their ${extraName.charAt(0).toLowerCase()}${extraName.slice(1)} days first.`; // (not in the mockups)
export const cantRemoveExtra = (name, n) => `Can’t remove ${name}: ${campersCount(n)} picked it. Change their extras first.`; // (§7.3)
// Edit camp refusals added by 0027 (rulebook v0.720; not in the mockups):
// once ↔ per day switched while campers chose it…
export const cantChangeExtraPer = (name, n) => `Can’t switch ${name} between once and per day: ${campersCount(n)} picked it. Change their extras first.`;
// …or the change would make an extra campers paid for "included" (they'd now come every day of that week).
export const cantIncludeExtra = (name, n) => `Can’t save: ${name} would become included for ${campersCount(n)} who paid for it (they’d come every camp day that week). Change their extras first.`;

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
export const TOO_MANY_DAYS = 'A camp can have up to 60 days.'; // (not in the mockups) weekly pricing R4
export const PAST_DAY = 'New days can’t be in the past.'; // (not in the mockups)
// "Can't remove Wed, Dec 30: Mia Rossi and 2 more picked it. Change their days or withdraw them first."
export function cantRemoveDay(day, first, last, more) {
  const who = `${first} ${last}`.trim();
  const names = more > 0 ? `${who} and ${more} more` : who;
  return `Can’t remove ${dayLong(day)}: ${names} picked it. Change their days or withdraw them first.`;
}

// ----- Camp page -----
export const BACK_TO_CAMPS = 'Camps';
// "Mon, Apr 19 – Fri, Apr 23, 2027 · 9:00 AM – 3:00 PM · Both schools · held at Worcester · 18 campers"
export const campSummaryLine = (camp, days, count) =>
  [campDatesText(days), timeRange(camp.startTime, camp.endTime), campSchoolLine(camp), campersCount(count)].join(' · ');
export const LOADING_CAMP = 'Loading the camp…'; // (not in the mockups) screen readers only
export const LOAD_CAMP_FAILED = "Couldn't load this camp. Check the connection, then retry."; // (not in the mockups)
export const CAMP_GONE = 'This camp was deleted.'; // (not in the mockups)
export const MORE_CAMP_ACTIONS = 'More actions for this camp'; // (not in the mockups) screen readers + tooltip
export const NO_CAMPERS = 'No campers yet. Families sign up with the Registration link.'; // (§7.3)

// ----- The one roster (CP5, 2026-10-21, Camps-one-roster.html + Camps-multiweek-roster.html option A) -----
// The count cards above Find a camper (design review C10, rulebook v0.737, picture 18; they replace
// the old summary line "9 of 15 here today  5 to collect · $1,040  Pizza party today: 11"):
// Campers · Coming today ("9 here") / Coming Mon, Apr 19 · To collect ("$1,355" / "All paid") ·
// Payments recorded. After the camp the Coming card is "Came" ("142" / "of 150 days").
export const CARD_CAMPERS = 'Campers';
export const CARD_COMING_TODAY = 'Coming today';
export const cardComingOn = (day) => `Coming ${dayLong(day)}`; // before the camp / between camp days: the next camp day
export const cardHere = (n) => `${n} here`; // under Coming today: checked in today
export const CARD_CAME = 'Came';
export const cardOfDays = (n) => `of ${n} ${n === 1 ? 'day' : 'days'}`;
export const CARD_TO_COLLECT = 'To collect';
export const ALL_PAID = 'All paid'; // under To collect when nobody owes
// To collect's second line while it leaves out rows marked Possible duplicate (v0.742, picture 21 A)
export const duplicatesNotCounted = (n) => `${n} possible ${n === 1 ? 'duplicate' : 'duplicates'} not counted`;
export const CARD_PAYMENTS = 'Payments recorded';
// Under Payments recorded while part of it was paid by removed campers (v0.742 / v1.038)
export const includesFromRemoved = (cents) => `includes ${formatMoney(cents)} from removed campers`;
// The gray line while a card filters the roster (the shared part adds " · Show all").
export const SHOWING_COMING_TODAY = 'Showing coming today only';
export const showingComingOn = (day) => `Showing coming ${dayLong(day)} only`;
export const SHOWING_TO_COLLECT = 'Showing to collect only';
// A pressed card leaves nobody (no search text): each card says what is true, in Color Belt's pattern
// ("Everyone in this class has paid."; design review C-05 (b), rulebook v1.055). (not in the mockups)
export const cardEmptyLine = (filter, isToday, day) => {
  if (filter === 'collect') return 'Every camper has paid.';
  return isToday ? 'No campers are coming today.' : `No campers are coming on ${dayLong(day)}.`;
};
export const ROSTER_LABEL = 'Campers'; // (not in the mockups) screen readers: the roster table
export const COL_PAID = 'Paid';
export const dueTag = (cents) => `${formatMoney(cents)} due`;
export const dayHead = (iso, today, wide) => (wide ? `${dayChip(iso)}${iso === today ? ' · today' : ''}` : weekdayShort(iso));
export const weekdayLetter = (iso) => ({ Mon: 'M', Tue: 'T', Wed: 'W', Thu: 'Th', Fri: 'F', Sat: 'Sa', Sun: 'Su' })[weekdayShort(iso)] ?? weekdayShort(iso);
// The amber note under a name, today only — short, one line: a missing pizza party → "No pizza"
// (an extra offered only on some days that the child didn't choose). Since picture 19 (option A)
// the every-day extras (Early drop-off, Late pick-up) are in the day boxes instead. (not in the mockups)
export const noExtraShort = (name) => `No ${String(name).trim().split(/\s+/)[0].toLowerCase()}`; // (not in the mockups)
// Screen readers: the day box's label ends with the every-day extras the child gets that day,
// lower-cased short names (", early drop-off, late pick-up"); shortNames = [] adds nothing (picture 19).
const extrasTail = (shortNames = []) => shortNames.map((n) => `, ${n.toLowerCase()}`).join('');
export const checkInDayLabel = (name, day, shortNames) => `Check in ${name}, ${dayLong(day)}${extrasTail(shortNames)}`; // screen readers
export const undoCheckInDayLabel = (name, day, stamp, shortNames) => `${name} checked in ${dayLong(day)} at ${clockTime(stamp)}${extrasTail(shortNames)}. Undo check-in`; // screen readers
export const missedDayLabel = (name, day, shortNames) => `${name} didn’t come ${dayLong(day)}${extrasTail(shortNames)}. Check in`; // (not in the mockups) a past day can still be checked in (v0.706)
export const notSignedUpLabel = (day) => `Not signed up ${dayLong(day)}`; // screen readers
export const payTagLabel = (name, text) => `${name}: ${text}. Mark paid`; // screen readers on the $ due / Owes tag
export const WEEK_SWITCH_LABEL = 'Week'; // (not in the mockups) screen readers
// "Week 1 · Jul 6–10" (phones: "Week 1")
export function weekLabel(index, week, short) {
  const first = week.days[0].day;
  const last = week.days[week.days.length - 1].day;
  if (short) return `Week ${index + 1}`;
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const range = first === last ? monthDay(first) : sameMonth ? `${monthDay(first)}–${Number(last.slice(8))}` : `${monthDay(first)}–${monthDay(last)}`;
  return `Week ${index + 1} · ${range}`;
}
// The legend under the grid; "click" with a mouse, "tap" on touch. Since v0.723 (design review C16) the
// screen draws the came / didn't-come ICONS in front of these words (CampRoster.jsx), so the words
// themselves carry no ✓ / ✗ and a screen reader reads "came (check-in time) · …". The PRINTED
// roster keeps its own ✓ / ✗ line (PRINT_LEGEND below).
export const rosterLegendParts = (touch) => ({
  came: 'came (check-in time)',
  checkIn: ` · Check in: signed up — ${touch ? 'tap' : 'click'} to check in · `,
  missed: 'didn’t come',
  rest: ' · — not signed up that day',
});
export const FIND_CAMPER = 'Find a camper';
// Find a camper's ✕ (the shared icon button: label and tooltip) and the no-match line's link
// (v0.742 / v1.050, picture 21 A — the same words as Prospects' box)
export const CLEAR_SEARCH = 'Clear search';
// Nothing found for the search text (search words win over a pressed card's; the screen adds
// " · Clear search")
export const noCampersMatch = (text) => `No campers match “${text}”.`;
export const CHECK_IN = 'Check in';
export const checkedInToast = (name, stamp) => `${name} checked in · ${clockTime(stamp)}`;
export const checkInUndoneToast = (name) => `Check-in undone for ${name}`; // (not in the mockups)
export const checkInFailed = (name) => `${name} wasn't checked in. Check the connection and try again.`; // (not in the mockups)
export const undoCheckInFailed = (name) => `${name}'s check-in wasn't undone. Check the connection and try again.`; // (not in the mockups)
export const isWithdrawn = (name) => `${name} was withdrawn. Restore them first.`; // (§7.2, "an admin can" dropped: staff restore too)
// The gray line under the count cards, for the Coming card's day (picture 19; replaces "Pizza party
// today: 11"): "Mon, Apr 19 · Early drop-off: 5 · Late pick-up: 6" before the camp / between camp
// days, "Today · Early drop-off: 5 · Late pick-up: 6 · Pizza party: 11" on a camp day. No line after
// the camp. parts = campRules.dayExtraCounts (short names, 0 counts included).
export const EXTRAS_JOIN = ' · ';
export const EXTRAS_TODAY = 'Today';
export const extraCount = (name, n) => `${name}: ${n}`;
export const dayExtrasLine = (parts) =>
  [parts.isToday ? EXTRAS_TODAY : dayLong(parts.day), ...parts.counts.map((c) => extraCount(c.name, c.count))].join(EXTRAS_JOIN);
// The legend's end (picture 19): " · Early early drop-off · Late late pick-up" — the screen draws the
// word ("Early") in the day boxes' blue, then this meaning (the short name, lower-cased).
export const legendExtraMeaning = (shortName) => ` ${shortName.toLowerCase()}`;
// Paid tags, the camper menu. The tag opens the shared Mark paid box (components/MarkPaidBox.jsx,
// rulebook v0.735), whose own words ("Paid by", "Mark paid $166", "They chose Cash on the form.")
// are in components/text.js.
export const tagOwes = (cents) => `Owes ${formatMoney(cents)}`;
// The roster's Paid tag once a camper paid too much or got a refund (rulebook v0.745, Star's words,
// screens/testing/star/candidates/text.js): "Paid $315", and in amber after it "$23 overpaid".
export const paidAmount = (cents) => `Paid ${formatMoney(cents)}`;
export const overpaidText = (cents) => `${formatMoney(cents)} overpaid`;
export const reviewDuplicateLabel = (name) => `Possible duplicate: review ${name}`;
export const SCHOOL_REFUSED = 'Pick the school where it was paid.'; // (not in the mockups) database: invalid, field school
export const PAID_AT = 'Paid at'; // (not in the mockups) Edit payment's school choice
export const COL_CAMPER = 'Camper';
export const camperNameAge = (row) => `${row.firstName} ${row.lastName} · ${row.age}`;
export const camperLabel = (row) => `${row.firstName} ${row.lastName}`;
export const camperPayLine = (daysText, payingBy) => `${daysText} · ${payingByLower(payingBy)}`;
// Mark paid's toast: "Leo Kim marked paid · $350 cash" — the same words as Color Belt's, Camps' own
// copy since v0.732 (C17) so it writes the amount with the shared formatMoney.
export const markedPaidToast = (name, cents, method) => `${name} marked paid · ${formatMoney(cents)} ${payingByLower(method)}`;
// Mark paid's toast while private details are hidden: no amount, no method (v0.722, picture 03b).
export const markedPaidToastHidden = (name) => `${name} marked paid`;
export const duplicateBoxLine = (n) => (n === 1 ? '1 possible duplicate' : `${n} possible duplicates`);
export const signedUpTwice = (name) => `${name} is signed up twice`;
export const DELETE_CAMPER_BODY_NO_PAY = (camp) => `The sign-up is deleted from ${camp}. This can’t be undone.`;
// detailsHidden (Hide private details, v0.722): one sentence for paid and not paid, no amount (as Color
// Belt's deleteStudentBody): "The sign-up and any recorded payment are deleted from <camp>. …"
export function deleteCamperBody(campName, payments, detailsHidden = false) {
  if (detailsHidden) return `The sign-up and any recorded payment are deleted from ${campName}. This can’t be undone.`;
  if (payments.length === 0) return DELETE_CAMPER_BODY_NO_PAY(campName);
  const p = payments[0];
  const paid = `the ${formatMoney(p.amountCents)} ${payingByLower(p.method)} payment recorded on ${monthDay(p.paidOn)}`;
  return `The sign-up and ${paid} are deleted from ${campName}. This can’t be undone.`;
}
export const KEEP_CAMPER = 'Keep camper';

// ----- Undo payment asks first (rulebook v0.730, v1.003; design review C4, picture 11) -----
// Star's words (v0.508), with its middle "the row goes back to Not paid" replaced by what is owed
// AFTER the Undo, because a camper can still owe part (Owes $15 → $350 owed after the Undo).
export const undoPaymentTitle = (name) => `Undo ${name}'s payment?`; // straight ' as the box's other lines
export function undoPaymentBody(p, owedAfterCents) {
  const paid = `The ${formatMoney(p.amountCents)} ${payingByLower(p.method)} payment recorded on ${monthDay(p.paidOn)} is reversed`;
  // (not in the mockups) Nothing owed even after the Undo (paid twice, say): no "$0 is owed again".
  if (owedAfterCents <= 0) return `${paid}. Both stay in the history.`;
  return `${paid}, so ${formatMoney(owedAfterCents)} is owed again. Both stay in the history.`;
}
export const KEEP_PAYMENT = 'Keep payment';
export const UNDOING = 'Undoing…';
export const UNDO_PAYMENT_FAILED = "Couldn't undo. Check the connection, then try again.";

// ----- Record refund (rulebook v0.743, picture 22; carries out v1.039 / v1.040 for Camps) -----
// Star testing's words and box (Star's v0.166, v0.172, v0.508 (1): screens/testing/star/candidates/
// text.js and lib/star/candidatesText.js), Camps' own copies — "registered" becomes "signed up". Since
// v0.745 the roster's tag names the amount once a camper is overpaid or refunded, as Star's ("Paid $315
// ⚠ $23 overpaid", then "Paid $292"), so the box says the row afterwards reads "Paid $292".
export const RECORD_REFUND = 'Record refund'; // the ⋯ item / More button (ti-receipt-refund), admins, while overpaid
export const RECORD_REFUND_TITLE = 'Record refund';
export const UNDO_REFUND = 'Undo refund'; // the ⋯ item in Record refund's place while a refund stands, and the box's button
// Under the grayed Edit payment / Undo payment while a refund stands (v0.743 (4)), and the answer
// when the database refuses one because a refund stands (refund_stands — someone recorded one meanwhile).
export const UNDO_REFUND_FIRST = 'Undo the refund first.';
// (not in the mockups) The same answer for STAFF — the Mark paid toast's Undo refused because a refund
// stands; staff can't undo refunds, so they're sent to an admin.
export const UNDO_REFUND_STANDS_STAFF = "Couldn't undo: this camper has a refund. Ask an admin.";
export const REFUNDED_BY = 'Refunded by';
export const DATE_REFUNDED = 'Date refunded';
// "Chloe Martin · paid $315 · $23 overpaid"
export const refundSub = (name, paidCents, overpaidCents) => `${name} · paid ${formatMoney(paidCents)} · ${formatMoney(overpaidCents)} overpaid`;
export const refundUpTo = (cents) => `Up to ${formatMoney(cents)}, the amount overpaid.`;
// The gray line under the calendar's days: "Not before Mar 4 (signed up) or after today."
export const refundDateHint = (signedUpIso) => `Not before ${monthDay(signedUpIso)} (signed up) or after today.`;
// The note above the buttons. cents = the payments that stand, added up; count = how many there are;
// afterCents = what the camper has paid once everything overpaid is handed back — the roster's tag
// then reads "Paid $292" (rulebook v0.745, Star's words; v0.743 said “Paid”).
// One payment: the approved words. (not in the mockups) More than one: "The 2 payments ($315) stay …".
export const refundAfter = (cents, count, afterCents) => {
  const reads = `Afterwards the row reads “${paidAmount(afterCents)}”.`;
  return count > 1
    ? `The ${count} payments (${formatMoney(cents)}) stay in the history. ${reads}`
    : `The ${formatMoney(cents)} payment stays in the history. ${reads}`;
};
// Too much, under Amount (the Save button grays) — and the database's refund_too_large while something is
// still overpaid; when nothing is overpaid any more, the note under the buttons (Star's words). The most
// that can go back is always what was overpaid, so this is also the words for a very large number.
export const refundTooLarge = (cents) => `Can’t be more than the ${formatMoney(cents)} overpaid.`;
export const NOTHING_OVERPAID = 'Nothing is overpaid any more. Someone else changed this just now. Close this to see the latest.'; // (not in the mockups) Star's words
// (not in the mockups) The box's other field messages: $0; anything that isn't a whole-dollar amount
// (cents, letters, or blank once touched or after pressing Save — Edit payment's "Enter a price …"
// words don't fit a refund); no date; and the database's { status:'invalid', field:'date' }.
export const REFUND_AMOUNT_ZERO = 'Enter an amount more than $0.';
export const REFUND_AMOUNT_PROBLEM = 'Enter an amount in whole dollars, like 23.';
export const ENTER_DATE_REFUNDED = 'Enter the date refunded.';
export const refundDateRange = (signedUpIso) => `Pick a day from ${monthDay(signedUpIso)} to today.`;
export const TOAST_REFUND_RECORDED = 'Refund recorded'; // + Undo (5 seconds)
export const TOAST_REFUND_UNDONE = 'Refund undone'; // (not in the mockups) after Undo refund's box, no Undo — Star's toast
// Undo refund asks first (v0.743 (4); Star's words, with Camps' straight ' as undoPaymentTitle):
// "Undo Chloe Martin's refund?" — "The $23 cash refund recorded on Apr 21 is reversed and …"
export const undoRefundTitle = (name) => `Undo ${name}'s refund?`;
export const undoRefundBody = (refund) =>
  `The ${formatMoney(Math.abs(refund.amountCents))} ${payingByLower(refund.method)} refund recorded on ${monthDay(refund.paidOn)} is reversed and the amount shows as overpaid again. Both stay in the history.`;
export const KEEP_REFUND = 'Keep refund';
export const TOAST_KEPT_BOTH = 'Kept both sign-ups';
export const duplicateRemovedToast = (name) => `${name}’s extra copy moved to Removed`;

// The printed roster (the attendance grid, all weeks)
export const COL_CAME = 'Came';
export const cameText = (came, soFar) => `${came} of ${soFar}`;
// Paper keeps the ✓ / ✗ characters (v0.723: they print reliably in any printer font; only the screen
// uses the icons). (not in the mockups)
export const PRINT_LEGEND = '✓ came (check-in time) · ✗ didn’t come · blank: still to come · — not signed up that day';

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

// ----- C5 Registration link (the line under the camp name in the shared box; rulebook v0.733) -----
export const linkDialogLine = (state, camp) => {
  if (state === 'open') return `Family sign-up is open until ${weekdayMonthDay(camp.signupClosesOn)}. Families choose their child’s days and extras on the form.`;
  if (state === 'not_open_yet') return `Family sign-up opens on ${weekdayMonthDay(camp.signupOpensOn)}. Families choose their child’s days and extras on the form.`; // (not in the mockups)
  if (state === 'closed') return 'Family sign-up is closed. Open it from the ⋯ menu to take more sign-ups.'; // (v0.725)
  return 'This camp is over.'; // (not in the mockups)
};

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
export const MORE_ACTIONS_HEAD = 'More'; // (not in the mockups) touch: the roster row's ⋯ items in Camper detail
export const NONE_YET = 'None yet';
// "Mon, Apr 19 · Wed, Apr 21 · 2 days" / "All days · 5 days"
export function detailDaysLine(isoDays, allDays) {
  if (allDays) return `All days · ${daysCount(isoDays.length)}`;
  return `${isoDays.map(dayLong).join(' · ')} · ${daysCount(isoDays.length)}`;
}
// "Late pick-up (3:00–4:00 PM) on Mon, Wed" / "on all days" / once extras: just the name
// True when the days fall in more than one Monday–Sunday week.
function spansWeeks(isoDays) {
  const mondays = new Set();
  for (const iso of isoDays ?? []) {
    const d = parseDay(iso);
    if (!d) continue;
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to that week's Monday
    mondays.add(d.toDateString());
  }
  return mondays.size > 1;
}
export function detailExtraLine(extra, allCampDays) {
  if (extra.per !== 'day') return extra.name;
  const days = [...(extra.days ?? [])].sort();
  const all = allCampDays.length > 0 && days.length === allCampDays.length;
  // A camp longer than one Mon–Sun week names the dates too ("Mon 5, Tue 6"), so staff can tell
  // which week the extra is on (design review 2026-10-21, weekly pricing v0.717).
  const label = spansWeeks(allCampDays) ? dayChip : weekdayShort;
  return `${extra.name} on ${all ? 'all days' : days.map(label).join(', ')}`;
}
export const NO_EXTRAS_DETAIL = 'None'; // (not in the mockups)
// An extra offered only on some days, with the child's days: "Pizza party — Wed" (owner decision 2026-10-19)
export const detailExtraOnlyLine = (name, isoDays) => `${name} — ${shortDayLabels([...isoDays].sort()).join(', ')}`;
// One line per week a camper comes (weekly pricing, more than one week): "Week of Jul 5 · 5 days $275"
export const weekPriceLine = (w) => `Week of ${monthDay(w.monday)} · ${daysCount(w.dayCount)} ${formatMoney(w.cents)}`;
// "Early price, 2 days $150 + late pick-up × 2 $16 = $166"; more than one week (weekly pricing,
// shown under the week lines): "Early price, 2 weeks $470 + late pick-up × 2 $16 = $486"
export function priceBreakdownLine(b, allDays, weekCount = 1) {
  const kind = b.priceKind === 'early' ? 'Early price' : 'Regular price';
  const days = weekCount > 1 ? `${weekCount} weeks` : allDays ? 'all days' : daysCount(b.dayCount);
  const parts = [`${kind}, ${days} ${formatMoney(b.baseCents)}`];
  for (const extra of b.extras ?? []) {
    const count = extra.per === 'day' ? (extra.days ?? []).length : 1;
    const label = extra.name.charAt(0).toLowerCase() + extra.name.slice(1);
    parts.push(`${label}${extra.per === 'day' ? ` × ${count}` : ''} ${formatMoney(extra.cents)}`);
  }
  return `${parts.join(' + ')} = ${formatMoney(b.totalCents)}`;
}
// Camper detail's payment lines — every row, oldest first, with the school whose drawer has it (v0.707):
//   "$166 cash · Shrewsbury · Mar 3 · Jeffrey"                  a payment
//   "−$335 card (reversed) · Worcester · Apr 19 · Jeffrey"       the row that undid (or edited) a payment
//   "Refunded $23 cash · Worcester · Apr 21 · Jeffrey Berg"      a refund (v0.743 (3)), at the desk that
//                                                                handed the money back (v1.040)
//   "$23 cash (reversed) · Worcester · Apr 22 · Jeffrey Berg"    the row that undid a refund (Undo refund):
//                                                                the same "(reversed)" line as a payment's,
//                                                                with the reversal's own (plus) amount
export function paymentLine(p) {
  const how = payingByLower(p.method);
  const what = p.kind === 'refund'
    ? `Refunded ${formatMoney(Math.abs(p.amountCents))} ${how}`
    : `${formatMoney(p.amountCents)} ${how}${p.kind === 'reversal' ? ' (reversed)' : ''}`;
  return [what, schoolName(p.school), monthDay(p.paidOn), p.recordedByName].filter(Boolean).join(' · ');
}
export const overpaidLine = (total, paid) => `Total now ${formatMoney(total)} · paid ${formatMoney(paid)} · `;
export const overpaidAmber = (cents) => `Paid ${formatMoney(cents)} more than the total`;
// Under an overpaid camper's Payments, for staff and admins alike (v0.743 (6); was "… → Edit payment").
// With a mouse the item is in the roster's ⋯; on touch screens Camper detail's "More" holds it.
export const OVERPAID_ADMIN = 'An admin records money handed back with ⋯ → Record refund.';
export const OVERPAID_ADMIN_TOUCH = 'An admin records money handed back with More → Record refund.'; // (not in the mockups)
export const owesLine = (total, paid, owes) => `Total now ${formatMoney(total)} · paid ${formatMoney(paid)} · owes ${formatMoney(owes)}`; // (not in the mockups)
export const contactLine = (name, relation, phone) => `${name} · ${relation} · ${phone}`;
// Camper detail's Sign-up line. `from` = { source, enteredBy } from camp_camper_detail (migration
// 0043): a desk sign-up (Fill in, v0.741) says "Signed up at the desk by Jeffrey Berg, Nov 5, 2026 ·
// waiver signed on the screen · reference CP-4821"; a family one keeps its words. Left out (or a
// desk sign-up without a name) → the family words.
export function signupLine(row, from = null) {
  const desk = from?.source === 'desk' && from.enteredBy;
  if (desk) {
    const signed = row.signatureDeletedAt ? 'signature deleted after 3 years' : 'waiver signed on the screen';
    return `Signed up at the desk by ${from.enteredBy}, ${monthDayYear(row.signedUpOn)} · ${signed} · reference ${row.reference}`;
  }
  const signed = row.signatureDeletedAt ? 'signature deleted after 3 years' : 'waiver signed on the form';
  return `Signed up on the family form, ${monthDayYear(row.signedUpOn)} · ${signed} · reference ${row.reference}`;
}
export const removedDetail = (row) =>
  `${row.withdrawnReason === 'duplicate_copy' ? 'Duplicate copy' : 'Withdrawn'} ${removedBy(row.withdrawnAt, row.withdrawnByName)}`; // (not in the mockups)
export const LOADING_CAMPER = 'Loading…'; // (not in the mockups)
export const LOAD_CAMPER_FAILED = "Couldn't load this camper. Check the connection, then retry."; // (not in the mockups)
export const RETRY = CB.RETRY;

// ----- Print receipt (design review C3, rulebook v0.734; Star's words, v0.518) -----
// The ⋯ item and Camper detail's button; the receipt itself is the shared one (components/Receipt.jsx,
// whose own words are in components/text.js). The plain receipt is built in lib/camps/campReceipt.js.
export const PRINT_RECEIPT = 'Print receipt';
export const RECEIPT_KIND = 'Camp · payment receipt';
export const RECEIPT_CAMPER = 'Camper';
export const RECEIPT_CAMP = 'Camp';
export const RECEIPT_SCHOOL_LABEL = 'School';
export const RECEIPT_DAYS = 'Days';
export const RECEIPT_EXTRAS = 'Extras';
export const RECEIPT_REFERENCE = 'Reference';
export const RECEIPT_FOR_FEE = 'Camp fee';
export const RECEIPT_FOR_REFUND = 'Refund'; // a refund's line, with a minus amount (Star's receipt, v0.743 (5))
// The gray line under the box's title: "Jack Rivera · Thanksgiving Camp"
export const receiptSub = (name, campName) => `${name} · ${campName}`;
// The camper was deleted on another device while the receipt opened (Star's and Black Belt's words)
export const THIS_CAMPER = 'This camper';
export const receiptNotFound = (name) => `${name} was deleted on another device, so there is no receipt.`;

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
export const extraPriceText = (cents, per) => (per === 'day' ? `${formatMoney(cents)} a day` : formatMoney(cents));
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
export const newTotalLine = (cents) => `Total now ${formatMoney(cents)}`; // (not in the mockups) live price while editing
export const TOTAL_NOW = 'Total now'; // the same line while private details are hidden: "Total now Hidden on this tablet" (v0.722)
export const REPRICE_NOTE = 'Changing days, member or extras prices the camper at the camp’s current prices.'; // (not in the mockups)
export const TOTAL_TOO_HIGH = 'A camper’s total can be $10,000 at most.'; // (not in the mockups) weekly pricing R5
export const checkedInCantRemove = (day) => `This camper was checked in on ${dayLong(day)}. Undo that check-in first.`; // (§7.3, the camper's name is the dialog title)
// The same, in the camp page's amber bar after a refused Undo of Edit details (no dialog title
// there, so it names the camper; v0.726). (not in the mockups)
export const checkedInCantRemoveNamed = (name, day) => `${name} was checked in on ${dayLong(day)}. Undo that check-in first.`;
export const PAYMENT_NOT_HERE = 'Payments are changed from the roster’s ⋯ menu.'; // (not in the mockups)
export const AMOUNT_TOO_HIGH = 'Enter $10,000 or less.'; // (not in the mockups) weekly pricing R5


// ----- Live-test fixes (2026-10-21): the camp page's automatic reload -----
// (The amber "Couldn't refresh the roster" bar that used to be here is the shell's one offline bar now: C19, v1.005.)
// The quiet time at the end of the summary line, e.g. "Updated 2:41:07 PM" (CampRoster.jsx). (not in the mockups)
export const updatedAtLine = (ms) => `Updated ${new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;

// ----- Hide private details (v0.506; Camps v0.722, design review C1) -----
// "Hidden on this tablet" (a value that keeps its row, gray) and "Payment details are hidden on
// this tablet." (a whole payment part) — the dashboard-wide words, so every section says the same.
export { HIDDEN_ON_THIS_TABLET, PAYMENT_DETAILS_HIDDEN } from '../../lib/privateDetails.js';

// ----- History in Camper detail (design review C7, rulebook v0.736; Star's style, v0.518) -----
// The line itself ("History · 5 changes", "Oct 13 · Jeffrey Berg", Loading…, the amber bar, "no
// changes yet", "Payment history is hidden on this tablet.") is the shared part's
// (components/HistoryLine.jsx). These are Camps' words for each change, "what: before → after".
// One save that changes several things is one entry, its parts joined with "; "
// (screens/camps/camperHistoryWords.js puts them together).
export const HISTORY_STAFF = 'Staff'; // the "who" when the log has no name (Star's word)
export const HISTORY_JOIN = '; ';
// The sign-up save. A desk sign-up (Fill in, migration 0043, v0.741) names who filled it in:
// "Signed up (entered by Jeffrey Berg) · CP-4821"; a family one keeps "Signed up on the family form · CP-4409".
export const historySignedUp = (reference, enteredBy = null) =>
  `${enteredBy ? `Signed up (entered by ${enteredBy})` : 'Signed up on the family form'}${reference ? ` · ${reference}` : ''}`;
export const historyChange = (label, before, after) => `${label}: ${before} → ${after}`;
export const HISTORY_EMPTY_VALUE = '—'; // a value that was blank (not in v0.736)
export const HISTORY_DAYS = 'Days';
export const historyDayList = (isoDays) => isoDays.map(dayLong).join(' · '); // "Wed, Nov 25 · Fri, Nov 27"
export const historyExtraAdded = (name) => `${name} added`;
export const historyExtraRemoved = (name) => `${name} removed`;
export const HISTORY_AN_EXTRA = 'Extra (no longer offered)'; // an extra the camp no longer has (not in v0.736)
export const HISTORY_FIRST_NAME = 'First name';
export const HISTORY_LAST_NAME = 'Last name';
export const HISTORY_AGE = 'Age';
export const HISTORY_MEMBER = 'Member';
export const historyYesNo = (value) => (value ? 'Yes' : 'No');
export const HISTORY_PAYING_BY = 'Paying by';
export const historyMarkedPaid = (cents, method) => `Marked paid ${formatMoney(cents)} ${payingByLower(method)}`;
export const historyPaymentUndone = (cents, method) => `Payment undone: ${formatMoney(cents)} ${payingByLower(method)}`;
export const historyPaymentChanged = (oldCents, oldMethod, newCents, newMethod) =>
  `Payment changed: ${formatMoney(oldCents)} ${payingByLower(oldMethod)} → ${formatMoney(newCents)} ${payingByLower(newMethod)}`;
// Record refund (v0.743 (3), (4); Star's words): "Refund recorded: $23 cash, Apr 21" (the day the money
// went back; drawn in picture 22) and "Refund undone: $23" ((not in the mockups) — named in the
// rulebook's v0.743 (4), not drawn).
export const historyRefund = (cents, method, iso) => `Refund recorded: ${formatMoney(cents)} ${payingByLower(method)}, ${monthDay(iso)}`;
export const historyRefundUndone = (cents) => `Refund undone: ${formatMoney(cents)}`;
export const HISTORY_WITHDRAWN = 'Withdrawn';
export const HISTORY_RESTORED = 'Restored';
export const HISTORY_DUPLICATE_FOUND = 'Possible duplicate found';
export const HISTORY_KEPT_BOTH = 'Kept both';
export const HISTORY_DUPLICATE_COPY = 'Removed as a duplicate copy';
// The family part (the sign-up). With more than one child on the form the entry ends "(whole family)".
export const HISTORY_PARENT = 'Parent';
export const HISTORY_PARENT_PHONE = 'Parent phone';
export const HISTORY_PARENT_RELATION = 'Parent relationship'; // (not in v0.736)
export const HISTORY_EMERGENCY = 'Emergency contact';
export const HISTORY_EMERGENCY_PHONE = 'Emergency contact phone';
export const HISTORY_EMERGENCY_RELATION = 'Emergency contact relationship'; // (not in v0.736)
export const HISTORY_SIGNATURE_DELETED = 'Signature deleted (3 years after the camp)';
export const HISTORY_WHOLE_FAMILY = ' (whole family)';

// ----- Fill in: staff sign up a walk-in family at the desk (rulebook v0.740 / v0.741, picture 23) -----
// The frame and its words are New students' Fill in (src/screens/forms/text.js, v0.235 / v0.243 (5));
// inside it is the camp's own family form (src/camp/), with the family page's own words.
export const FILL_IN = 'Fill in'; // the PC / tablet header button
export const FILL_IN_ITEM = 'Fill in for a family'; // the phone header ⋯ item (first)
export const fillInTitle = (campName) => `Fill in · ${campName}`;
export const FILL_IN_ENTERED_BY = 'You are filling this in for a family. It will be marked "Entered by" you.';
export const fillInStep = (n, label) => `Step ${n} of 2 · ${label}`;
export const FILL_IN_STEP_DETAILS = 'Details';
export const FILL_IN_STEP_CHECK = 'Check and sign';
// Why Fill in is gray (the button's tip, the ⋯ item's reason line, and the dialog's note when a Send is refused)
export const FILL_IN_CLOSED_STAFF = 'Family sign-up is closed. Ask an admin to fill in for a family.';
export const FILL_IN_PAST_CLOSING_STAFF = 'The closing date has passed. Ask an admin to fill in for a family.';
export const FILL_IN_FINISHED = 'This camp is over.';
// (not in the mockups) The camp page's amber bar when Hide private details closed the box during a
// Send (v0.746) and the sign-up then didn't save, or its answer never came — it names nobody.
export const FILL_IN_CLOSED_NOT_SAVED = "A Fill in sign-up may not have been saved. If the family isn't on the roster, fill it in again.";
// While Hide private details is on (desk-only, as Forms' v0.616 — the same words)
export const FILL_IN_AT_DESK = 'Fill in forms at the desk. Email and form answers are hidden on this tablet.';
// At the desk the parent signs on the screen in front of staff: New students' hint, not the family's
// "Can't sign here? Please sign at the front desk."
export const FILL_IN_SIGNATURE_HINT = 'Sign with a finger, pen or mouse.';
export const FILL_IN_CANCEL = 'Cancel';
export const FILL_IN_BACK = 'Back';
export const FILL_IN_CONTINUE = 'Continue';
export const FILL_IN_SEND = 'Send';
export const FILL_IN_SENDING = 'Sending…';
export const FILL_IN_CLOSE = 'Close';
export const FILL_IN_LOADING = 'Loading…';
// The Sent screen (New students' Sent with the family page's own reference and total words)
export const FILL_IN_SENT_TITLE = 'Sent';
export const fillInSentText = (parent) => `${parent}'s sign-up is saved.`;
export const fillInReference = (reference) => `Reference ${reference}`;
// "Total to pay $180 · Cash, at the front desk, before Wed, Nov 25"
export const fillInTotal = (amount, way, firstDay) => `Total to pay ${amount} · ${way}, at the front desk, before ${firstDay}`;
export const FILL_IN_ANOTHER = 'Fill in another';
// The unsaved-changes guard (v0.627, New students' words); phones have no Cancel, so their note
// points at its own "Discard changes" link
export const FILL_IN_LEAVE = 'This sign-up isn\'t sent yet. Send it or press Cancel to throw it away.';
export const FILL_IN_LEAVE_PHONE = 'This sign-up isn\'t sent yet. Send it or discard it.';
export const FILL_IN_DISCARD = 'Discard changes';
// When a Send or the first read fails (not in the mockups; New students' words where they exist)
export const FILL_IN_SEND_FAILED = "It wasn't sent. Check the connection and press Send again (it won't be saved twice).";
export const FILL_IN_SEND_INVALID = 'Some answers were refused. Check them and send again.';
export const FILL_IN_LOAD_FAILED = "Couldn't load this camp's form. Check the connection, then retry."; // (not in the mockups)
export const FILL_IN_CAMP_GONE = 'This camp was deleted, so nothing was saved.'; // (not in the mockups)
