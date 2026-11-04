// CampRoster.jsx — the camp page's ONE roster (CP5, 2026-10-21: Camps-one-roster.html and
// Camps-multiweek-roster.html option A; replaces the three tabs Check in / Payments / Attendance).
// Why it exists: the door, the money and the week on one screen. One row per child:
//   Camper (A–Z; click → Camper detail; a small amber note under the name only for TODAY:
//          "Late pick-up … today", "No pizza party") ·
//   Paid   (Paid green · "$219 due" gray · "Owes $15" amber — tapping one that isn't Paid opens
//          the shared Mark paid box (components/MarkPaidBox.jsx; design review C2, rulebook
//          v0.735): the name and the amount, Paid by Cash / Check / Card preset to Paying by with
//          the hint "They chose Cash on the form." (or "… at the desk." once staff changed it),
//          then Mark paid $X — this device's school, Undo) ·
//   one column per camp day (today's column tinted): [user-check] 7:42 = checked in (tap → undo,
//          with an Undo toast) · Check in = signed up, tap to check in (any day, v0.706) ·
//          [user-x] = a past day not checked in (still tappable, to fix a missed one) · — = not
//          signed up that day. The two icons are ti-user-check / ti-user-x since v0.723 (design
//          review C16: one icon per meaning, as Prospects and the Calendar; was ti-check / ti-x).
//          The printed roster (PrintRoster.jsx) still prints ✓ / ✗ ·
//   ⋯     (mouse only; on touch screens the ⋯ items live in Camper detail).
// Above the table: the summary line ("9 of 15 here today  5 to collect · $1,040  Pizza party
// today: 11"), Find a camper, and — only when the camp's days cross more than one calendar week —
// the week switch ("Week 1 · Jul 6–10 | Week 2 · Jul 13–17"; each week shows only its own days,
// Paid and "to collect" stay whole-camp). Below it: the possible-duplicate box (the shared
// components/DuplicateBox.jsx since rulebook v0.729), then "Removed".
// Phones: one card per child — name + Paid on top, the week's day buttons underneath (today
// outlined), 44px targets. The page (CampPage.jsx) does every write; this file only draws.
// Live-test fixes (2026-10-21): the grid always spans the full width, even for a 1-day camp (the
// Camper column takes the spare room); a camp with nobody signed up still shows the grid (headers,
// week switch, legend) with "No campers yet…" as one row inside it, so a closed or past camp
// never looks like it lost its roster; and the summary line ends with a quiet "Updated 2:41:07 PM".
// "Hide private details" on (detailsHidden; rulebook v0.722, design review C1, as Color Belt
// v0.412): no Paid column (PC / tablet) and no money tags on the phone cards, no "N to collect ·
// $X" / "All paid", and the Mark paid box can't open (an open one closes). A "Possible duplicate"
// tag isn't money: on PC / tablet it moves onto the name's line, on phones it stays on its card.
// Check-in, "here today", Find a camper, the extra counts and "Updated …" stay.
// Money ("to collect · $1,040", the tags) is written by the shared formatMoney (src/lib/money.js;
// rulebook v0.732, design review C17), as every section does.
import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconChevronDown, IconChevronUp, IconDots, IconSearch, IconUserCheck, IconUserX } from '@tabler/icons-react';
import IconButton from '../../components/IconButton.jsx';
// The shared Mark paid box (design review C2, rulebook v0.735) under the "$X due" / "Owes $X" tag
import MarkPaidBox from '../../components/MarkPaidBox.jsx';
import { useRowArrowNav } from '../../lib/useRowArrowNav.js';
import { extraCountOnDay, extraOfferedOn, missingExtraOnDay, payTag, payingByChoiceWhere, toCollectCents } from '../../lib/camps/campRules.js';
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
export function CamperTag({ row, onReview, onPay, busy = false }) {
  if (row.status !== 'active') return <span className="ttag">{row.withdrawnReason === 'duplicate_copy' ? T.TAG_DUPLICATE_COPY : T.TAG_REMOVED}</span>;
  const tag = payTag(row);
  const name = T.camperLabel(row);
  if (tag === 'paid') return <span className="ttag ttag--ok">{T.TAG_PAID}</span>;
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
// an extra offered only on some days that they didn't choose ("No pizza party"), else their first
// other per-day extra today ("Late pick-up, 3:00–4:00 PM today").
function todayNote(row, todayDay, extras, days) {
  if (!todayDay || !(row.days ?? []).some((d) => d.dayId === todayDay.dayId)) return null;
  const sorted = [...extras].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  for (const extra of sorted) {
    if ((extra.onlyOn ?? []).length > 0 && missingExtraOnDay(row, extra, todayDay.dayId, days)) return T.noExtraShort(extra.name);
  }
  const limited = new Set(sorted.filter((e) => (e.onlyOn ?? []).length > 0).map((e) => e.extraId));
  const mine = (row.extras ?? []).find((e) => e.per === 'day' && e.dayId === todayDay.dayId && !limited.has(e.extraId));
  return mine ? T.extraShort(mine.name) : null;
}

// One day of one child: [user-check] time / Check in / [user-x] / —.  compact = phone card (weekday letter on top).
function DayCell({ row, day, today, busy, compact, onCheckIn, onUndoCheckIn }) {
  const mine = (row.days ?? []).find((d) => d.dayId === day.dayId);
  const name = T.camperLabel(row);
  const letter = compact ? <span className="cp-dc-day" aria-hidden="true">{T.weekdayLetter(day.day)}</span> : null;
  const today_ = day.day === today ? ' is-today' : '';
  if (!mine) {
    return (
      <span className={`cp-dc cp-dc--none${today_}`} aria-label={T.notSignedUpLabel(day.day)}>
        {letter}
        <span aria-hidden="true">—</span>
      </span>
    );
  }
  const common = {
    type: 'button',
    'data-day-cell': `${row.id}:${day.dayId}`,
    'aria-disabled': busy ? 'true' : undefined,
  };
  if (mine.checkedInAt) {
    return (
      <button
        {...common}
        className={`cp-dc cp-dc--came${today_}`}
        aria-label={T.undoCheckInDayLabel(name, day.day, mine.checkedInAt)}
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
      </button>
    );
  }
  const missed = day.day < today;
  return (
    <button
      {...common}
      className={`cp-dc ${missed ? 'cp-dc--missed' : 'cp-dc--checkin'}${today_}`}
      aria-label={missed ? T.missedDayLabel(name, day.day) : T.checkInDayLabel(name, day.day)}
      onClick={(event) => {
        event.stopPropagation();
        if (!busy) onCheckIn(row, day);
      }}
    >
      {letter}
      <span className="cp-dc-val">{missed ? <IconUserX size={14} aria-hidden="true" /> : T.CHECK_IN}</span>
    </button>
  );
}

// The legend under the grid (v0.723, design review C16): the same two icons as the day cells, in front
// of their words. The icons are hidden from screen readers: the words already say "came" and
// "didn't come", so nothing is read twice.
function RosterLegend({ touch }) {
  const parts = T.rosterLegendParts(touch);
  return (
    <p className="field-hint cp-hint-line">
      <IconUserCheck size={14} aria-hidden="true" className="cp-legend-icon" />
      {parts.came}
      {parts.checkIn}
      <IconUserX size={14} aria-hidden="true" className="cp-legend-icon" />
      {parts.missed}
      {parts.rest}
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
  removedOpen,
  onToggleRemoved,
  layout, // { isPhone, isTouch, isWide }
  isAdmin,
  busy,
  menuFor,
  notSavedId,
  updatedAt = null, // when the page last loaded fresh data (useLiveLoad) — shown as "Updated …"
  detailsHidden = false, // Hide private details is on: no money on the roster (v0.722)
  handlers, // { onOpen(row, el), onMore(row, el), onMarkPaid(row, method), onReview(row, el), onReviewPair(pair, el), onCheckIn(row, day), onUndoCheckIn(row, day) }
}) {
  const [popover, setPopover] = useState(null); // { rowId, anchor }
  const { isPhone, isTouch, isWide } = layout;
  const showMore = !isTouch; // touch: the ⋯ items are in Camper detail

  const week = weeks[weekIndex] ?? weeks[0] ?? { days: [] };
  const shownDays = week.days;
  const todayDay = days.find((d) => d.day === today) ?? null;
  // Today's notes under the names only while the shown week has today in it (review 12).
  const noteDay = todayDay && shownDays.some((d) => d.dayId === todayDay.dayId) ? todayDay : null;

  // ----- The summary line -----
  const comes = (row, dayId) => (row.days ?? []).some((d) => d.dayId === dayId);
  let first;
  if (todayDay) {
    const coming = active.filter((r) => comes(r, todayDay.dayId));
    const here = coming.filter((r) => r.days.find((d) => d.dayId === todayDay.dayId)?.checkedInAt);
    first = (
      <span>
        <span className="cp-big">{here.length}</span>
        {T.hereTodayOf(coming.length, isPhone)}
      </span>
    );
  } else {
    const next = days.find((d) => d.day > today) ?? null;
    first = next ? (
      <span>
        <span className="cp-big">{active.filter((r) => comes(r, next.dayId)).length}</span>
        {T.comingOnDay(next.day)}
      </span>
    ) : (
      // The camp is over: how many of the signed-up days were attended ("Came 142 of 150 days").
      <span>
        {T.CAME_WORD} <span className="cp-big">{active.reduce((n, r) => n + (r.days ?? []).filter((d) => d.checkedInAt).length, 0)}</span>
        {T.ofDays(active.reduce((n, r) => n + (r.days ?? []).length, 0))}
      </span>
    );
  }
  const toCollect = active.filter((r) => payTag(r) !== 'paid').length;
  const dayExtras = todayDay ? extras.filter((e) => e.per === 'day' && (e.onlyOn ?? []).length > 0 && extraOfferedOn(e, todayDay.day)) : [];

  // ----- Search -----
  const q = query.trim().toLowerCase();
  const match = (row) => !q || `${row.firstName} ${row.lastName}`.toLowerCase().includes(q);
  const rows = active.filter(match).sort(byFirstName);
  const removedRows = removed.filter(match).sort(byFirstName);

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
  const cell = (row, day, compact) => (
    <DayCell key={day.dayId} row={row} day={day} today={today} busy={busy} compact={compact} onCheckIn={handlers.onCheckIn} onUndoCheckIn={handlers.onUndoCheckIn} />
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
  if (isPhone) {
    // ----- Phone: one card per child -----
    list = (
      <div className="cp-rcards" aria-label={T.ROSTER_LABEL} role="list" {...nav.containerProps}>
        {rows.map((row) => {
          const note = todayNote(row, noteDay, extras, days);
          return (
            <div key={row.id} className="cp-rcard" role="listitem">
              <div className="cp-rcard-top">
                <span className="cp-rcard-name" {...nav.groupProps(row.id)}>
                  {nameButton(row)}
                  <span className="cp-age-text"> · {row.age}</span>
                  {notSavedId === row.id && (
                    <span className="ttag ttag--warn cp-notsaved">
                      <IconAlertTriangle size={12} aria-hidden="true" />
                      {T.TAG_NOT_SAVED}
                    </span>
                  )}
                </span>
                {/* Hidden: no money tag; a possible duplicate keeps its tag here (picture 01). */}
                {detailsHidden ? duplicateTag(row) : <CamperTag row={row} onReview={handlers.onReview} onPay={onPay} busy={busy} />}
              </div>
              {note && <span className="cp-rnote">{note}</span>}
              <div className="cp-rdays">{shownDays.map((d) => cell(row, d, true))}</div>
            </div>
          );
        })}
        {q && rows.length === 0 && active.length > 0 && <p className="tempty">{T.NO_MATCH_ROSTER}</p>}
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
          <tbody {...nav.containerProps}>
            {rows.map((row) => {
              const note = todayNote(row, noteDay, extras, days);
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
                    {note && <span className="cp-rnote">{note}</span>}
                  </th>
                  {!detailsHidden && (
                    <td className="cp-rcol-paid">
                      <CamperTag row={row} onReview={handlers.onReview} onPay={onPay} busy={busy} />
                    </td>
                  )}
                  {shownDays.map((d) => (
                    <td key={d.dayId} className={`cp-rcol-day${d.day === today ? ' is-today' : ''}`}>
                      {cell(row, d, false)}
                    </td>
                  ))}
                  {showMore && <td className="cp-rcol-more">{more(row)}</td>}
                </tr>
              );
            })}
            {q && rows.length === 0 && active.length > 0 && (
              <tr>
                <td colSpan={columns} className="tempty">
                  {T.NO_MATCH_ROSTER}
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
      <div className="cp-removed" {...nav.containerProps}>
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
              {/* A staff member has nothing to do on a duplicate copy (only admins restore it). */}
              {(row.withdrawnReason !== 'duplicate_copy' || isAdmin) && more(row)}
            </div>
          ))}
      </div>
    ) : null;

  // (A camp nobody signed up for used to show only the sentence here; since the live test it shows
  // the grid with the sentence as a row — see the table above.)
  const hasCampers = active.length > 0 || removed.length > 0;
  const updated = updatedAt ? <span className="cp-updated">{T.updatedAtLine(updatedAt)}</span> : null;

  return (
    <div className="cp-roster-area">
      {!hasCampers ? (
        // No campers at all: counts would only read "0 of 0", so the line keeps just "Updated …".
        updated && <p className="cp-statline">{updated}</p>
      ) : (
      <p className="cp-statline">
        {first}
        {/* Hidden: neither "N to collect · $X" nor "All paid" (both say who paid). */}
        {detailsHidden ? null : toCollect === 0 ? (
          <span className="cp-allpaid">{T.ALL_PAID}</span>
        ) : (
          <span>
            <span className="cp-big">{toCollect}</span>
            {T.toCollectShort}
            {isWide && ` · ${formatMoney(toCollectCents(active))}`}
          </span>
        )}
        {dayExtras.map((extra) => (
          <span key={extra.extraId}>
            {T.extraTodayLine(extra.name)} <span className="cp-big">{extraCountOnDay(active, extra, todayDay.dayId, days)}</span>
          </span>
        ))}
        {updated}
      </p>
      )}
      {/* Find a camper only when there is someone to find. */}
      {hasCampers && (
      <div className="cp-search">
        {/* ti-search = find */}
        <IconSearch size={16} aria-hidden="true" className="cp-search-icon" />
        <input
          className="input cp-search-input"
          type="search"
          placeholder={T.FIND_CAMPER}
          aria-label={T.FIND_CAMPER}
          autoComplete="off"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>
      )}
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
      {weekSwitch}
      {list}
      {removedGroup}
      {!isPhone && active.length > 0 && <RosterLegend touch={isTouch} />}
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

