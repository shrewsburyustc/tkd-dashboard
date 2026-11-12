// CampRoster.jsx — the camp page's ONE roster (CP5, 2026-10-21: Camps-one-roster.html and
// Camps-multiweek-roster.html option A; replaces the three tabs Check in / Payments / Attendance).
// Why it exists: the door, the money and the week on one screen. One row per child:
//   Camper (A–Z; click → Camper detail; a small amber note under the name only for TODAY, when the
//          child misses an extra offered only on some days: "No pizza") ·
//   Paid   (Paid green — "Paid $315 ⚠ $23 overpaid" while a camper paid too much and "Paid $292"
//          once a refund stands, as Star's (rulebook v0.745) — · "$219 due" gray · "Owes $15"
//          amber — tapping one that isn't Paid opens
//          the shared Mark paid box (components/MarkPaidBox.jsx; design review C2, rulebook
//          v0.735): the name and the amount, Paid by Cash / Check / Card preset to Paying by with
//          the hint "They chose Cash on the form." (or "… at the desk." once staff changed it),
//          then Mark paid $X — this device's school, Undo) ·
//   one column per camp day (today's column tinted): [user-check] 7:42 = checked in (tap → undo,
//          with an Undo toast) · Check in = signed up, tap to check in (any day, v0.706) ·
//          [user-x] = a past day not checked in (still tappable, to fix a missed one) · — = not
//          signed up that day. The two icons are ti-user-check / ti-user-x since v0.723 (design
//          review C16: one icon per meaning, as Prospects and the Calendar; was ti-check / ti-x).
//          The printed roster (PrintRoster.jsx) still prints ✓ / ✗.
//          Under a signed-up day's content, in small blue words, the extras offered EVERY day that
//          the child gets that day — "Early" (Early drop-off), "Late" (Late pick-up) — every day of
//          the week (Jeffrey 2026-11-04, picture 19 option A); the legend under the grid explains
//          them ·
//   ⋯     (mouse only; on touch screens the ⋯ items live in Camper detail).
// Above the table: a quiet "Updated 2:41:07 PM" on the right, then the shared count cards
// (components/CountCards.jsx; design review C10, rulebook v0.737, picture 18 — they replaced the old
// summary line "9 of 15 here today  5 to collect · $1,040  Pizza party today: 11"):
//   Campers (shows everyone) · Coming [day] (filters to that day's campers: "Coming today" with
//   "9 here" under it on a camp day, else the next camp day, "Coming Mon, Apr 19"; after the camp
//   the card is "Came" — days attended, "of 150 days", not a button) · To collect (filters to the
//   campers who still owe; the money under the number, or "All paid") · Payments recorded (every
//   payment of the camp, reversals taken off — a total, never a button).
//   The numbers come from campRules.campCardCounts. Under the row, the gray line for the Coming
//   card's day (picture 19): "Mon, Apr 19 · Early drop-off: 5 · Late pick-up: 6", on a camp day
//   "Today · Early drop-off: 5 · Late pick-up: 6 · Pizza party: 11" (none after the camp). A pressed card filters the roster ("Showing to collect only ·
//   Show all"); the filter and Find a camper apply together, and "Removed" is hidden while a filter
//   is on (as Star hides its removed candidates). Tapping Coming in a camp of more than one week
//   moves the week switch to that day's week. The page (CampPage.jsx) keeps the filter, beside
//   Find a camper's text.
// Since v0.742 (picture 21 A, pass 1 R3-10 / R3-02 / R5-04 / R3-09):
//   - the possible-duplicate box (the shared components/DuplicateBox.jsx since rulebook v0.729)
//     comes FIRST, above "Updated …" and the cards;
//   - a row marked Possible duplicate stays out of To collect (count, money, filter) until the
//     pair is reviewed, and the card's second line says so: "1 possible duplicate not counted";
//   - Payments recorded says "includes $140 from removed campers" when part of it is theirs;
//   - Find a camper has the shared ✕ ("Clear search") while it has text, and search text that
//     finds nobody shows 'No campers match “zz”. · Clear search' in the roster's place.
// Then Find a camper, and — only when the camp's days cross more than one calendar week —
// the week switch ("Week 1 · Jul 6–10 | Week 2 · Jul 13–17"; each week shows only its own days,
// Paid and the cards stay whole-camp), the roster, then "Removed".
// Phones: one card per child — name + Paid on top, the week's day buttons underneath (today
// outlined), 44px targets. The same cards are drawn on a bigger screen when the ROOM beside the left
// panel is too narrow for the table's columns (rulebook v0.747, picture 24; v1.053 / v1.130, L-02):
// the shared hook `usePageRoomBelow` (src/lib/pageRoom.js) is asked with `rosterRoomNeeded` (the room
// this week's columns need — campRules.js). With a mouse such a card also has the row's ⋯, and its
// buttons keep mouse size (44px only on touch). The page (CampPage.jsx) does every write; this file
// only draws.
// Live-test fixes (2026-10-21): the grid always spans the full width, even for a 1-day camp (the
// Camper column takes the spare room); a camp with nobody signed up still shows the grid (headers,
// week switch, legend) with "No campers yet…" as one row inside it, so a closed or past camp
// never looks like it lost its roster; and "Updated 2:41:07 PM" stays (since C10 on its own line,
// right, above the cards; a camp nobody signed up for shows only that line, no cards).
// "Hide private details" on (detailsHidden; rulebook v0.722, design review C1, as Color Belt
// v0.412): no Paid column (PC / tablet) and no money tags on the phone cards, only the Campers and
// Coming (or Came) cards (To collect and Payments recorded go, and a To collect filter is cleared
// by the page), and the Mark paid box can't open (an open one closes). A "Possible duplicate"
// tag isn't money: on PC / tablet it moves onto the name's line, on phones it stays on its card.
// Check-in, "here", Find a camper, the extra counts and "Updated …" stay.
// Money ("$1,355", the tags) is written by the shared formatMoney (src/lib/money.js;
// rulebook v0.732, design review C17), as every section does.
import { useEffect, useRef, useState } from 'react';
import {
  IconAlertTriangle, IconCalendarEvent, IconChevronDown, IconChevronUp, IconCircleX, IconDots, IconSearch, IconSum, IconUserCheck, IconUsers, IconUserX, IconX,
} from '@tabler/icons-react';
import IconButton from '../../components/IconButton.jsx';
// The shared row of count cards (design review M6 / C10, rulebook v1.013 and v0.737)
import CountCards from '../../components/CountCards.jsx';
// The shared Mark paid box (design review C2, rulebook v0.735) under the "$X due" / "Owes $X" tag
import MarkPaidBox from '../../components/MarkPaidBox.jsx';
import { useRowArrowNav } from '../../lib/useRowArrowNav.js';
import { usePageRoomBelow } from '../../lib/pageRoom.js';
import { canPrintReceipt } from '../../lib/camps/campReceipt.js';
import {
  rosterRoomNeeded, overpaidCents, campCardCounts, dayExtraCounts, dayExtrasFor, everyDayExtras, extraDayWord, extraShortName, matchesCardFilter, missingExtraOnDay, paidTagParts, payTag, payingByChoiceWhere,
} from '../../lib/camps/campRules.js';
import ChoiceGroup from '../../components/ChoiceGroup.jsx';
import { formatMoney } from '../../lib/money.js';
import DuplicateBox from '../../components/DuplicateBox.jsx';
import * as T from './text.js';

// A–Z by first name, then last name (as drawn in the mockup).
export const byFirstName = (a, b) =>
  a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' }) || a.lastName.localeCompare(b.lastName, 'en', { sensitivity: 'base' });

// ----- The Paid tag (also used by Camper detail) -----
// A possible duplicate opens the compare; "$X due" / "Owes $X" open the Mark paid box; Paid is plain.
// busy: another save is running — the tag is grayed (aria-disabled, still focusable) and doesn't
// open the box, the way the roster's day buttons wait (and the old box's gray Mark paid did).
// data-pay-tag lets the page put focus back on it after Mark paid when the camper still owes.
// amounts: the roster's own Paid cell (PC / tablet column and phone card), where a camper who paid
// too much reads "Paid $315 ⚠ $23 overpaid" and one with a refund "Paid $292" (rulebook v0.745,
// copied from Star's CandidateRows.jsx). Camper detail leaves it off: its Payments part has its own
// amber "Paid $23 more than the total" line (v0.743), so its Status tag stays "Paid".
export function CamperTag({ row, onReview, onPay, busy = false, amounts = false }) {
  if (row.status !== 'active') return <span className="ttag">{row.withdrawnReason === 'duplicate_copy' ? T.TAG_DUPLICATE_COPY : T.TAG_REMOVED}</span>;
  const tag = payTag(row);
  const name = T.camperLabel(row);
  if (tag === 'paid') {
    const parts = amounts ? paidTagParts(row) : null;
    if (!parts || parts.paidCents === null) return <span className="ttag ttag--ok">{T.TAG_PAID}</span>;
    return (
      <span className="cp-paytag">
        <span className="ttag ttag--ok">{T.paidAmount(parts.paidCents)}</span>
        {parts.overpaidCents > 0 && (
          <span className="cp-overpaid">
            {/* ti-alert-triangle = needs attention (Star's overpaid mark) */}
            <IconAlertTriangle size={12} aria-hidden="true" />
            {T.overpaidText(parts.overpaidCents)}
          </span>
        )}
      </span>
    );
  }
  if (tag === 'duplicate') {
    if (!onReview) return <span className="ttag ttag--warn">{T.TAG_POSSIBLE_DUPLICATE}</span>;
    return (
      <button
        type="button"
        className="ttag ttag--warn ev-tag-button cp-paybtn"
        aria-label={T.reviewDuplicateLabel(name)}
        onClick={(event) => {
          event.stopPropagation();
          onReview(row, event.currentTarget);
        }}
      >
        <IconAlertTriangle size={12} aria-hidden="true" />
        {T.TAG_POSSIBLE_DUPLICATE}
      </button>
    );
  }
  const text = tag === 'owes' ? T.tagOwes(row.owesCents) : T.dueTag(row.owesCents);
  const className = `ttag${tag === 'owes' ? ' ttag--warn' : ''}`;
  if (!onPay) return <span className={className}>{text}</span>;
  return (
    <button
      type="button"
      className={`${className} ev-tag-button cp-paybtn`}
      aria-haspopup="dialog"
      aria-label={T.payTagLabel(name, text)}
      aria-disabled={busy ? 'true' : undefined}
      data-pay-tag={row.id}
      onClick={(event) => {
        event.stopPropagation();
        if (!busy) onPay(row, event.currentTarget);
      }}
    >
      {text}
    </button>
  );
}

// The one small amber note under a name — only for TODAY, and only when the child comes today:
// an extra offered only on some days that they didn't choose ("No pizza"). (Their Early drop-off /
// Late pick-up used to be here too; since picture 19, option A, the day boxes show those.)
function todayNote(row, todayDay, extras, days) {
  if (!todayDay || !(row.days ?? []).some((d) => d.dayId === todayDay.dayId)) return null;
  const sorted = [...extras].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  for (const extra of sorted) {
    if ((extra.onlyOn ?? []).length > 0 && missingExtraOnDay(row, extra, todayDay.dayId, days)) return T.noExtraShort(extra.name);
  }
  return null;
}

// The words under a day box's content: the first word of each every-day extra the child gets that
// day ("Early", "Late"; picture 19). Hidden from screen readers — the day box's label already says
// them in full (", early drop-off, late pick-up"). null when there are none — unless `reserve`
// (PC / tablet: another day in the same row has words), then an empty line of the same height, so
// every button in the row stays on one straight line (design review of picture 19, low 1).
function DayWords({ dayExtras, reserve = false }) {
  if (dayExtras.length === 0) {
    return reserve ? <span className="cp-dc-extras" aria-hidden="true">{' '}</span> : null;
  }
  return (
    <span className="cp-dc-extras" aria-hidden="true">
      {dayExtras.map((e) => (
        <span key={e.extraId}>{extraDayWord(e.name)}</span>
      ))}
    </span>
  );
}

// One day of one child: [user-check] time / Check in / [user-x] / —.  compact = phone card (weekday letter on top).
// dayExtras = the every-day extras the child gets that day (campRules.dayExtrasFor): their words go
// INSIDE the box on a phone card, under the box (same day column) on PC / tablet.
// reserveWords = PC / tablet only: some day of this row shows words, so a day without any keeps an
// empty line under its box (the buttons of the row stay in line).
function DayCell({ row, day, today, busy, compact, dayExtras = [], reserveWords = false, onCheckIn, onUndoCheckIn }) {
  const mine = (row.days ?? []).find((d) => d.dayId === day.dayId);
  const name = T.camperLabel(row);
  const letter = compact ? <span className="cp-dc-day" aria-hidden="true">{T.weekdayLetter(day.day)}</span> : null;
  const today_ = day.day === today ? ' is-today' : '';
  const reserve = !compact && reserveWords;
  if (!mine) {
    // Not signed up: never any extras (dayExtrasFor gives none for a day the child doesn't come).
    const none = (
      <span className={`cp-dc cp-dc--none${today_}`} aria-label={T.notSignedUpLabel(day.day)}>
        {letter}
        <span aria-hidden="true">—</span>
      </span>
    );
    return reserve ? (
      <>
        {none}
        <DayWords dayExtras={[]} reserve />
      </>
    ) : none;
  }
  const shortNames = dayExtras.map((e) => extraShortName(e.name)); // for the screen-reader label
  const words = <DayWords dayExtras={dayExtras} reserve={reserve} />;
  const common = {
    type: 'button',
    'data-day-cell': `${row.id}:${day.dayId}`,
    'aria-disabled': busy ? 'true' : undefined,
  };
  let box;
  if (mine.checkedInAt) {
    box = (
      <button
        {...common}
        className={`cp-dc cp-dc--came${today_}`}
        aria-label={T.undoCheckInDayLabel(name, day.day, mine.checkedInAt, shortNames)}
        onClick={(event) => {
          event.stopPropagation();
          if (!busy) onUndoCheckIn(row, day);
        }}
      >
        {letter}
        <span className="cp-dc-val">
          <IconUserCheck size={14} aria-hidden="true" />
          {T.clockShort(mine.checkedInAt)}
        </span>
        {compact && words}
      </button>
    );
  } else {
    const missed = day.day < today;
    box = (
      <button
        {...common}
        className={`cp-dc ${missed ? 'cp-dc--missed' : 'cp-dc--checkin'}${today_}`}
        aria-label={missed ? T.missedDayLabel(name, day.day, shortNames) : T.checkInDayLabel(name, day.day, shortNames)}
        onClick={(event) => {
          event.stopPropagation();
          if (!busy) onCheckIn(row, day);
        }}
      >
        {letter}
        <span className="cp-dc-val">{missed ? <IconUserX size={14} aria-hidden="true" /> : T.CHECK_IN}</span>
        {compact && words}
      </button>
    );
  }
  // PC / tablet: the words sit under the button, in the same table cell.
  if (compact) return box;
  return (
    <>
      {box}
      {words}
    </>
  );
}

// The legend under the grid (v0.723, design review C16): the same two icons as the day cells, in front
// of their words. The icons are hidden from screen readers: the words already say "came" and
// "didn't come", so nothing is read twice. Then, when the camp has extras offered every day
// (picture 19): " · Early early drop-off · Late late pick-up" — each word in the day boxes' blue,
// then what it means. Here the word is NOT hidden, so a screen reader hears "Early early drop-off".
function RosterLegend({ touch, extras }) {
  const parts = T.rosterLegendParts(touch);
  return (
    <p className="field-hint cp-hint-line">
      <IconUserCheck size={14} aria-hidden="true" className="cp-legend-icon" />
      {parts.came}
      {parts.checkIn}
      <IconUserX size={14} aria-hidden="true" className="cp-legend-icon" />
      {parts.missed}
      {parts.rest}
      {everyDayExtras(extras).map((e) => (
        <span key={e.extraId}>
          {T.EXTRAS_JOIN}
          <span className="cp-legend-word">{extraDayWord(e.name)}</span>
          {T.legendExtraMeaning(extraShortName(e.name))}
        </span>
      ))}
    </p>
  );
}

export default function CampRoster({
  days, // every camp day (Day[])
  weeks, // campRules.campWeeks(days)
  weekIndex,
  onWeek,
  today,
  active,
  removed,
  extras,
  pairs,
  query,
  onQuery,
  filter = null, // the pressed count card: null | 'coming' | 'collect' (C10; kept by the page)
  onFilter, // (null | 'coming' | 'collect') => void
  removedOpen,
  onToggleRemoved,
  layout, // { isPhone, isTouch, isWide }
  isAdmin,
  busy,
  menuFor,
  notSavedId,
  updatedAt = null, // when the page last loaded fresh data (useLiveLoad) — shown as "Updated …"
  detailsHidden = false, // Hide private details is on: no money on the roster (v0.722)
  showSchool = false, // a camp for both schools on the Both switcher: each family's school under the name (0050, v0.757)
  handlers, // { onOpen(row, el), onMore(row, el), onMarkPaid(row, method), onReview(row, el), onReviewPair(pair, el), onCheckIn(row, day), onUndoCheckIn(row, day) }
}) {
  const [popover, setPopover] = useState(null); // { rowId, anchor }
  const { isPhone, isTouch, isWide } = layout;
  const showMore = !isTouch; // touch: the ⋯ items are in Camper detail

  const week = weeks[weekIndex] ?? weeks[0] ?? { days: [] };
  const shownDays = week.days;
  // The layout follows the room beside the panel, not the window (v1.053 / v1.130): when the table's
  // columns for this week don't fit, the roster draws its cards (the phone layout) — with a ⋯ on each
  // card when there's a mouse. Only the roster follows the room; the rest of the page follows the window.
  // The table needs more room while someone is overpaid (the amber words widen the Paid column), and
  // for the week on screen, so a week with fewer days can show the table where a longer one shows cards.
  const anyOverpaid = !detailsHidden && active.some((r) => overpaidCents(r) > 0);
  const narrowRoom = usePageRoomBelow(rosterRoomNeeded(shownDays.length, showMore, anyOverpaid));
  const stacked = isPhone || narrowRoom;
  // The layout flipped (a window turned, Panel size changed, another week): the tag a Mark paid box
  // hangs from, or the ⋯ a menu hangs from, is a different element now — close them (never on the
  // first drawing).
  const stackedBefore = useRef(stacked);
  useEffect(() => {
    if (stackedBefore.current === stacked) return;
    stackedBefore.current = stacked;
    // The row whose box or menu was open: focus goes to its ⋯ (else its name) in the new layout,
    // never to the page body.
    const openRowId = popover?.rowId ?? menuFor;
    setPopover(null);
    handlers.onLayoutChange?.();
    if (openRowId) {
      window.requestAnimationFrame(() => {
        (document.querySelector(`[data-camper-more="${openRowId}"]`) ?? document.querySelector(`[data-nav-row="${openRowId}"]`))?.focus();
      });
    }
    // (only when the layout changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stacked]);
  const todayDay = days.find((d) => d.day === today) ?? null;
  // Today's notes under the names only while the shown week has today in it (review 12).
  const noteDay = todayDay && shownDays.some((d) => d.dayId === todayDay.dayId) ? todayDay : null;

  // ----- The count cards (design review C10, rulebook v0.737, picture 18) -----
  // Every number comes from campRules.campCardCounts (tested in checks.mjs). Payments recorded
  // counts the removed campers' payments too (money taken is money taken, as Finance counts it).
  const counts = campCardCounts([...active, ...removed], days, today);
  const cardDay = counts.day; // the Coming card's camp day (null after the camp)
  // A filter only works while its card is on screen: Coming is gone after the camp (it became
  // Came), To collect while Hide private details is on (the page also clears it then).
  const shownFilter = (filter === 'coming' && cardDay) || (filter === 'collect' && !detailsHidden) ? filter : null;
  const comingCard = cardDay
    ? {
        key: 'coming',
        Icon: IconCalendarEvent, // ti-calendar-event = a day's campers
        label: counts.mode === 'today' ? T.CARD_COMING_TODAY : T.cardComingOn(cardDay.day),
        value: String(counts.coming),
        note: counts.mode === 'today' ? T.cardHere(counts.here) : null,
        kind: 'filter',
      }
    : // The camp is over: how many of the signed-up days were attended — a total, not a button.
      { key: 'came', Icon: IconUserCheck, label: T.CARD_CAME, value: String(counts.came), note: T.cardOfDays(counts.cameOf), kind: 'total' };
  const cards = [
    { key: 'all', Icon: IconUsers, label: T.CARD_CAMPERS, value: String(counts.campers), kind: 'all' },
    comingCard,
    // Hidden: neither To collect nor Payments recorded (both say who paid / how much).
    ...(detailsHidden
      ? []
      : [
          {
            key: 'collect',
            Icon: IconCircleX, // ti-circle-x = not paid (as Star's Not paid)
            label: T.CARD_TO_COLLECT,
            value: String(counts.toCollect),
            // The money on every screen size (picture 18); nobody owes → "All paid". While rows
            // marked Possible duplicate are left out (v0.742, picture 21 A), a second line under
            // it says how many: "1 possible duplicate not counted" (the shared card draws an
            // array as two lines, v1.115).
            note: [counts.toCollect === 0 ? T.ALL_PAID : formatMoney(counts.toCollectCents), counts.duplicatesNotCounted > 0 ? T.duplicatesNotCounted(counts.duplicatesNotCounted) : null],
            kind: 'filter',
          },
          {
            key: 'recorded',
            Icon: IconSum, // ti-sum = a money total
            label: T.CARD_PAYMENTS,
            value: formatMoney(counts.recordedCents),
            // Part of the total came from removed campers: say so (v0.742 / v1.038, R5-04).
            note: counts.removedPaidCents > 0 ? T.includesFromRemoved(counts.removedPaidCents) : null,
            kind: 'total',
          },
        ]),
  ];
  // The gray line under the cards, for the Coming card's day (picture 19): every extra offered every
  // day with its count, 0 included ("Mon, Apr 19 · Early drop-off: 5 · Late pick-up: 6"); on a camp
  // day also each extra offered only on some days that is offered today ("Today · … · Pizza party:
  // 11"). Active campers only. No line after the camp, or when the camp has nothing to count.
  const extraParts = dayExtraCounts(active, extras, days, counts.mode, cardDay);
  const extrasNote = extraParts ? T.dayExtrasLine(extraParts) : null;
  const showingText =
    shownFilter === 'coming' ? (counts.mode === 'today' ? T.SHOWING_COMING_TODAY : T.showingComingOn(cardDay.day)) : shownFilter === 'collect' ? T.SHOWING_TO_COLLECT : '';
  // A card was pressed (key = 'coming' / 'collect' to filter, null = everyone). Coming in a camp of
  // more than one week also moves the week switch to the week with that day, so its column shows.
  function selectCard(key) {
    onFilter(key);
    if (key === 'coming' && cardDay && weeks.length > 1) {
      const index = weeks.findIndex((w) => w.days.some((d) => d.dayId === cardDay.dayId));
      if (index !== -1 && index !== weekIndex) onWeek(index);
    }
  }

  // ----- Search and the card filter (both apply together) -----
  const q = query.trim().toLowerCase();
  const match = (row) => !q || `${row.firstName} ${row.lastName}`.toLowerCase().includes(q);
  const rows = active.filter((row) => match(row) && matchesCardFilter(row, shownFilter, cardDay)).sort(byFirstName);
  // While a card filters, "Removed" is hidden (they aren't in the counts; as Star's roster does).
  const removedRows = shownFilter ? [] : removed.filter(match).sort(byFirstName);
  // Nobody left on the roster (v0.742 / v1.050, picture 21 A):
  //   - search text found nobody → ONE gray line in the roster's place, 'No campers match “zz”. ·
  //     Clear search' (searchMissText; drawn below). The search words win, even while a card is
  //     pressed: the text is what the person just typed.
  //   - search text found nobody on the roster but someone in Removed → no line and no roster, only
  //     the Removed group below (the line would say "No campers match" right above the camper it
  //     found; design and code review, 2026-11-06).
  //   - no search text, but a pressed card left nobody → a gray row inside the roster that says what
  //     is true for that card (noMatchText: "Every camper has paid." / "No campers are coming today.";
  //     rulebook v0.748, C-05 b).
  const searchFoundNoActive = active.length > 0 && Boolean(q) && rows.length === 0;
  const searchMissText = searchFoundNoActive && removedRows.length === 0 ? T.noCampersMatch(query.trim()) : null;
  const noMatchText = active.length > 0 && rows.length === 0 && !q && shownFilter ? T.cardEmptyLine(shownFilter, counts.mode === 'today', cardDay?.day) : null;
  // Empties Find a camper and puts the focus back in the box (the ✕ and the Clear search link both
  // disappear as they're pressed, so the focus must not fall to the page).
  const searchInput = useRef(null);
  function clearSearch() {
    onQuery('');
    searchInput.current?.focus();
  }

  const popoverRow = popover ? active.find((r) => r.id === popover.rowId) : null;
  // The camper was paid meanwhile (another device), or Hide private details was switched on: the
  // box closes by itself.
  useEffect(() => {
    if (!popover) return;
    if (detailsHidden) {
      // The Paid cell (and its button) went with the switch: focus moves to the same row's ⋯, else
      // its name (focus must not fall to the page body), when focus was in the box or on its tag.
      const hadFocus = document.activeElement === document.body || popover.anchor.contains(document.activeElement) || document.querySelector('.mpb')?.contains(document.activeElement);
      setPopover(null);
      if (hadFocus) {
        const id = popover.rowId;
        window.requestAnimationFrame(() => {
          (document.querySelector(`[data-camper-more="${id}"]`) ?? document.querySelector(`[data-nav-row="${id}"]`))?.focus();
        });
      }
      return;
    }
    // Another save started while the box was open (e.g. a check-in, or the toast's Undo): the box
    // can't save until it ends, so it closes rather than take a press it would have to drop, and
    // focus goes back to its tag (grayed until the save ends, like the day buttons). Mark paid of
    // this box closes the box itself before its own save starts.
    if (busy) {
      const hadFocus = document.querySelector('.mpb')?.contains(document.activeElement);
      const anchor = popover.anchor;
      setPopover(null);
      if (hadFocus && anchor?.isConnected) anchor.focus();
      return;
    }
    if (!popoverRow || !['not_paid', 'owes'].includes(payTag(popoverRow))) setPopover(null);
  }, [popover, popoverRow, detailsHidden, busy]);
  const onPay = (row, anchor) => setPopover({ rowId: row.id, anchor });
  // While hidden, the only tag an active camper keeps is "Possible duplicate" (it opens the compare).
  const duplicateTag = (row) => (payTag(row) === 'duplicate' ? <CamperTag row={row} onReview={handlers.onReview} /> : null);

  // ↑ ↓ move between the names, Enter opens Camper detail (PC rule 3.6; the Tab key reaches the
  // roster's names as one stop, like every other list).
  const nav = useRowArrowNav({
    rowKeys: [...rows, ...(removedOpen ? removedRows : [])].map((r) => r.id),
    onOpen: (id) => {
      const row = [...active, ...removed].find((r) => r.id === id);
      if (row) handlers.onOpen(row, document.activeElement);
    },
  });
  const nameButton = (row) => (
    <button
      type="button"
      className="cp-name-link"
      {...nav.targetProps(row.id)}
      onClick={(event) => {
        event.stopPropagation();
        handlers.onOpen(row, event.currentTarget);
      }}
    >
      {T.camperLabel(row)}
    </button>
  );
  // The family's school, a small gray line under the name (only a both-schools camp on Both).
  const schoolLine = (row) => (showSchool && row.school ? <span className="cp-rschool">{T.schoolName(row.school)}</span> : null);
  const more = (row) =>
    showMore ? (
      <IconButton
        label={T.moreFor(T.camperLabel(row))}
        Icon={IconDots}
        aria-haspopup="menu"
        aria-expanded={menuFor === row.id ? 'true' : 'false'}
        data-camper-more={row.id}
        onClick={(event) => {
          event.stopPropagation();
          handlers.onMore(row, event.currentTarget);
        }}
      />
    ) : null;
  // reserveWords: does any shown day of this row have words? (PC / tablet keep the buttons in line.)
  const rowHasWords = (row) => shownDays.some((d) => dayExtrasFor(row, d.dayId, extras, days).length > 0);
  const cell = (row, day, compact, reserveWords = false) => (
    <DayCell
      key={day.dayId}
      row={row}
      day={day}
      today={today}
      busy={busy}
      compact={compact}
      dayExtras={dayExtrasFor(row, day.dayId, extras, days)}
      reserveWords={reserveWords}
      onCheckIn={handlers.onCheckIn}
      onUndoCheckIn={handlers.onUndoCheckIn}
    />
  );

  // ----- The week switch (only when the camp crosses more than one week) -----
  const weekSwitch =
    weeks.length > 1 ? (
      <div className="ev-class-switch cp-weekswitch">
        <span id="cp-week-label" className="visually-hidden">
          {T.WEEK_SWITCH_LABEL}
        </span>
        <ChoiceGroup
          labelId="cp-week-label"
          value={String(weekIndex)}
          onChange={(key) => onWeek(Number(key))}
          options={weeks.map((w, i) => ({ key: String(i), label: T.weekLabel(i, w, isPhone) }))}
        />
      </div>
    ) : null;

  let list;
  if (stacked) {
    // ----- Phone, or a roster with too little room for the grid: one card per child -----
    list = (
      <div className="cp-rcards" aria-label={T.ROSTER_LABEL} role="list">
        {rows.map((row) => {
          const note = todayNote(row, noteDay, extras, days);
          return (
            <div key={row.id} className={`cp-rcard${menuFor === row.id ? ' is-selected' : ''}`} role="listitem" {...nav.groupProps(row.id)}>
              <div className="cp-rcard-top">
                <span className="cp-rcard-name">
                  {nameButton(row)}
                  <span className="cp-age-text"> · {row.age}</span>
                  {notSavedId === row.id && (
                    <span className="ttag ttag--warn cp-notsaved">
                      <IconAlertTriangle size={12} aria-hidden="true" />
                      {T.TAG_NOT_SAVED}
                    </span>
                  )}
                </span>
                {/* Hidden: no money tag; a possible duplicate keeps its tag here (picture 01). With a
                    mouse the card also has the row's ⋯ (touch: the same items are in Camper detail). */}
                <span className="cp-rcard-end">
                  {detailsHidden ? duplicateTag(row) : <CamperTag row={row} onReview={handlers.onReview} onPay={onPay} busy={busy} amounts />}
                  {more(row)}
                </span>
              </div>
              {schoolLine(row)}
              {note && <span className="cp-rnote">{note}</span>}
              <div className="cp-rdays">{shownDays.map((d) => cell(row, d, true))}</div>
            </div>
          );
        })}
        {noMatchText && <p className="tempty">{noMatchText}</p>}
        {/* Nobody signed up (yet): the sentence takes the cards' place, under the week switch. */}
        {active.length === 0 && <p className="tempty cp-rempty">{T.NO_CAMPERS}</p>}
      </div>
    );
  } else {
    // ----- PC and tablet: the grid -----
    const columns = 1 + (detailsHidden ? 0 : 1) + shownDays.length + (showMore ? 1 : 0);
    list = (
      // Always the full content width (Jeffrey, live test 2026-10-21: "make it fit the whole
      // screen"); with only a few days the Camper column takes the spare room (camps.css).
      <div className="cp-rtable-wrap">
        <table className={`cp-rtable${isTouch ? ' is-touch' : ''}`} aria-label={T.ROSTER_LABEL}>
          <thead>
            <tr>
              <th scope="col" className="cp-rcol-name">
                {T.COL_CAMPER}
              </th>
              {!detailsHidden && (
                <th scope="col" className="cp-rcol-paid">
                  {T.COL_PAID}
                </th>
              )}
              {shownDays.map((d) => (
                <th key={d.dayId} scope="col" className={`cp-rcol-day${d.day === today ? ' is-today' : ''}`}>
                  {T.dayHead(d.day, today, isWide)}
                </th>
              ))}
              {showMore && (
                <th scope="col" className="cp-rcol-more">
                  <span className="visually-hidden">{T.ACTIONS_COL}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const note = todayNote(row, noteDay, extras, days);
              const reserveWords = rowHasWords(row);
              return (
                <tr key={row.id} className={menuFor === row.id ? 'is-selected' : undefined} {...nav.groupProps(row.id)}>
                  <th scope="row" className="cp-rcol-name">
                    {nameButton(row)}
                    <span className="cp-age-text"> · {row.age}</span>
                    {/* Hidden: "Possible duplicate" moves onto the name's line (picture 01). */}
                    {detailsHidden && payTag(row) === 'duplicate' && <span className="cp-namedup">{duplicateTag(row)}</span>}
                    {notSavedId === row.id && (
                    <span className="ttag ttag--warn cp-notsaved">
                      <IconAlertTriangle size={12} aria-hidden="true" />
                      {T.TAG_NOT_SAVED}
                    </span>
                  )}
                    {schoolLine(row)}
                    {note && <span className="cp-rnote">{note}</span>}
                  </th>
                  {!detailsHidden && (
                    <td className="cp-rcol-paid">
                      <CamperTag row={row} onReview={handlers.onReview} onPay={onPay} busy={busy} amounts />
                    </td>
                  )}
                  {shownDays.map((d) => (
                    <td key={d.dayId} className={`cp-rcol-day${d.day === today ? ' is-today' : ''}`}>
                      {cell(row, d, false, reserveWords)}
                    </td>
                  ))}
                  {showMore && <td className="cp-rcol-more">{more(row)}</td>}
                </tr>
              );
            })}
            {noMatchText && (
              <tr>
                <td colSpan={columns} className="tempty">
                  {noMatchText}
                </td>
              </tr>
            )}
            {/* Nobody signed up (yet): one full-width row inside the grid. */}
            {active.length === 0 && (
              <tr>
                <td colSpan={columns} className="tempty cp-rempty">
                  {T.NO_CAMPERS}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // ----- Removed (withdrawn / duplicate copy): not in the counts -----
  const removedGroup =
    removedRows.length > 0 ? (
      <div className="cp-removed">
        <div className="ev-removed-head">
          <span>
            <button type="button" className="ev-removed-toggle" aria-expanded={removedOpen ? 'true' : 'false'} onClick={onToggleRemoved}>
              {/* ti-chevron-up / ti-chevron-down = collapse / expand */}
              {removedOpen ? <IconChevronUp size={16} aria-hidden="true" /> : <IconChevronDown size={16} aria-hidden="true" />}
              <span className="ev-removed-title">{T.removedGroup(removedRows.length)}</span>
            </button>
            <span className="ev-removed-note">{T.NOT_IN_COUNTS}</span>
          </span>
        </div>
        {removedOpen &&
          removedRows.map((row) => (
            <div key={row.id} className={`cp-removed-row${menuFor === row.id ? ' is-selected' : ''}`} {...nav.groupProps(row.id)}>
              <span className="cp-removed-name">
                {nameButton(row)}
                <span className="cp-age-text"> · {row.age}</span>
                <span className="ev-ssub cp-gray-line">{T.removedBy(row.withdrawnAt, row.withdrawnByName)}</span>
              </span>
              <CamperTag row={row} />
              {/* A staff member has nothing to do on a duplicate copy (only admins restore it) — unless
                  money still stands: then the ⋯ holds Print receipt (v0.748, M-03). */}
              {(row.withdrawnReason !== 'duplicate_copy' || isAdmin || canPrintReceipt(row, detailsHidden)) && more(row)}
            </div>
          ))}
      </div>
    ) : null;

  // (A camp nobody signed up for used to show only the sentence here; since the live test it shows
  // the grid with the sentence as a row — see the table above.)
  const hasCampers = active.length > 0 || removed.length > 0;
  const updated = updatedAt ? <span className="cp-updated">{T.updatedAtLine(updatedAt)}</span> : null;

  // The order above the roster (v0.742 / v1.047, picture 21 A): the possible-duplicate box, then
  // "Updated …" with the count cards and their gray count line (and, while a card is pressed, the
  // cards' own "Showing … only · Show all"), then Find a camper, the week switch and the roster.
  return (
    // The arrow-key container is the whole roster area, ONCE (the hook keeps one ref: with one per
    // list — cards or table, and the Removed group — the last list mounted won and the arrows did
    // nothing after a page load). Keys from outside a row (Find a camper, the cards) are ignored.
    <div className="cp-roster-area" {...nav.containerProps}>
      {/* The shared possible-duplicate box (rulebook v0.729 / v1.102): Camps' count line and one
          "<name> is signed up twice" line per pair, each with Review (opens the compare). */}
      <DuplicateBox
        countText={T.duplicateBoxLine(pairs.length)}
        pairs={pairs.map((pair) => ({
          key: pair.first.id,
          text: T.signedUpTwice(T.camperLabel(pair.first)),
          onReview: (opener) => handlers.onReviewPair(pair, opener),
        }))}
      />
      {/* "Updated …" on its own line, on the right, above the cards (picture 18). */}
      {updated && <p className={`cp-updated-line${hasCampers ? '' : ' is-alone'}`}>{updated}</p>}
      {/* No campers at all: the cards would only read 0, so there are none (only "Updated …"). */}
      {hasCampers && (
        <CountCards cards={cards} selected={shownFilter} onSelect={selectCard} showingText={showingText} note={extrasNote} />
      )}
      {/* Find a camper only when there is someone to find. While it has text, the shared ✕ icon
          button sits inside it ("Clear search" tooltip on PC, 44px tap area on touch; as
          Prospects' box, v0.631) in place of the browser's own ✕ (hidden in camps.css). */}
      {hasCampers && (
      <div className={`cp-search${query ? ' has-text' : ''}`}>
        {/* ti-search = find */}
        <IconSearch size={16} aria-hidden="true" className="cp-search-icon" />
        <input
          ref={searchInput}
          className="input cp-search-input"
          type="search"
          placeholder={T.FIND_CAMPER}
          aria-label={T.FIND_CAMPER}
          autoComplete="off"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        {query && <IconButton label={T.CLEAR_SEARCH} Icon={IconX} className="cp-search-clear" onClick={clearSearch} />}
      </div>
      )}
      {weekSwitch}
      {/* Search text found nobody: one gray line in the roster's place, drawn like the cards'
          "Showing … only · Show all" line (the shared .ev-filter-line.cards-showing, whose touch
          rules give the link its 44px tap area). */}
      {searchMissText ? (
        <p className="ev-filter-line cards-showing cp-nomatch">
          {searchMissText} ·{' '}
          <button type="button" className="link-button inline-link" onClick={clearSearch}>
            {T.CLEAR_SEARCH}
          </button>
        </p>
      ) : (
        !searchFoundNoActive && list
      )}
      {removedGroup}
      {/* The legend explains the roster's boxes, so it goes when the search left no roster. */}
      {!stacked && active.length > 0 && !searchFoundNoActive && <RosterLegend touch={isTouch} extras={extras} />}
      {popover && popoverRow && !detailsHidden && (
        // The shared box (v0.735): the amount owed now, shown and never typed; Paid by preset to
        // Paying by; the hint says where that choice was made — "on the form", or "at the desk"
        // once staff changed it (Paying by no longer the form's choice).
        <MarkPaidBox
          anchor={popover.anchor}
          name={T.camperLabel(popoverRow)}
          amountCents={popoverRow.owesCents}
          familyChoice={popoverRow.payingBy}
          choiceWhere={payingByChoiceWhere(popoverRow)}
          // The box is never open while another save runs (it closes when one starts, and the tag
          // is grayed meanwhile), so this press is never dropped. After the save the page moves
          // focus (CampPage's doMarkPaidAt): the tag goes away with the payment.
          onMarkPaid={(method) => handlers.onMarkPaid(popoverRow, method)}
          onClose={(refocus) => {
            const anchor = popover.anchor;
            setPopover(null);
            if (refocus && anchor?.isConnected) anchor.focus();
          }}
        />
      )}
    </div>
  );
}

