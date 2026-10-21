// CampRoster.jsx — the camp page's ONE roster (CP5, 2026-10-21: Camps-one-roster.html and
// Camps-multiweek-roster.html option A; replaces the three tabs Check in / Payments / Attendance).
// Why it exists: the door, the money and the week on one screen. One row per child:
//   Camper (A–Z; click → Camper detail; a small amber note under the name only for TODAY:
//          "Late pick-up … today", "No pizza party") ·
//   Paid   (Paid green · "$219 due" gray · "Owes $15" amber — tapping one that isn't Paid opens
//          the small Mark paid box: one click, this device's school, Undo) ·
//   one column per camp day (today's column tinted): ✓ 7:42 = checked in (tap → undo, with an Undo
//          toast) · Check in = signed up, tap to check in (any day, v0.706) · ✗ = a past day not
//          checked in (still tappable, to fix a missed one) · — = not signed up that day ·
//   ⋯     (mouse only; on touch screens the ⋯ items live in Camper detail).
// Above the table: the summary line ("9 of 15 here today  5 to collect · $1,040  Pizza party
// today: 11"), Find a camper, and — only when the camp's days cross more than one calendar week —
// the week switch ("Week 1 · Jul 6–10 | Week 2 · Jul 13–17"; each week shows only its own days,
// Paid and "to collect" stay whole-camp). Below it: the possible-duplicate box, then "Removed".
// Phones: one card per child — name + Paid on top, the week's day buttons underneath (today
// outlined), 44px targets. The page (CampPage.jsx) does every write; this file only draws.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconAlertTriangle, IconCheck, IconChevronDown, IconChevronUp, IconDots, IconSearch, IconX } from '@tabler/icons-react';
import IconButton from '../../components/IconButton.jsx';
import { useRowArrowNav } from '../../lib/useRowArrowNav.js';
import { extraCountOnDay, extraOfferedOn, missingExtraOnDay, payTag, toCollectCents } from '../../lib/camps/campRules.js';
import ChoiceGroup from '../testing/events/ChoiceGroup.jsx';
import DuplicateBox from './DuplicateBox.jsx';
import * as T from './text.js';

// A–Z by first name, then last name (as drawn in the mockup).
export const byFirstName = (a, b) =>
  a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' }) || a.lastName.localeCompare(b.lastName, 'en', { sensitivity: 'base' });

// ----- The Paid tag (also used by Camper detail) -----
// A possible duplicate opens the compare; "$X due" / "Owes $X" open the Mark paid box; Paid is plain.
export function CamperTag({ row, onReview, onPay }) {
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
      onClick={(event) => {
        event.stopPropagation();
        onPay(row, event.currentTarget);
      }}
    >
      {text}
    </button>
  );
}

// ----- The small Mark paid box under a "$X due" / "Owes $X" tag -----
function PaymentPopover({ row, anchor, busy, onMarkPaid, onClose }) {
  const boxRef = useRef(null);
  const [position, setPosition] = useState(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // Under the tag, kept on screen; above it when there's no room below.
  useLayoutEffect(() => {
    function place() {
      const rect = anchor.getBoundingClientRect();
      const box = boxRef.current;
      const width = box?.offsetWidth ?? 240;
      const height = box?.offsetHeight ?? 80;
      let top = rect.bottom + 4;
      if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - 4 - height);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setPosition({ top, left });
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor]);
  // Focus goes into the box; a click outside or Esc closes it.
  const placed = position !== null;
  useEffect(() => {
    if (placed) boxRef.current?.querySelector('button')?.focus();
  }, [placed]);
  useEffect(() => {
    function outside(event) {
      const path = event.composedPath();
      if (path.includes(boxRef.current) || path.includes(anchor)) return;
      onCloseRef.current(false);
    }
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [anchor]);

  const owes = payTag(row) === 'owes';
  return createPortal(
    <div
      ref={boxRef}
      className="cp-popover"
      role="dialog"
      aria-label={T.PAYMENT_NOTE_LABEL(T.camperLabel(row))}
      style={position ? { top: position.top, left: position.left } : { top: -9999, left: -9999 }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose(true);
        }
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="cp-popover-line">{T.notePopoverLine(T.camperLabel(row), owes ? 'owes' : 'not_paid', row.owesCents)}</p>
      <button
        type="button"
        className="btn btn-sm ev-markpaid"
        aria-disabled={busy ? 'true' : undefined}
        onClick={() => {
          if (busy) return;
          onClose(true);
          onMarkPaid(row);
        }}
      >
        {/* ti-check: Color Belt's built Mark paid button */}
        <IconCheck size={16} aria-hidden="true" />
        {owes ? T.markPaidAmount(row.owesCents) : T.MARK_PAID}
      </button>
    </div>,
    document.body,
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

// One day of one child: ✓ time / Check in / ✗ / —.  compact = phone card (weekday letter on top).
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
          <IconCheck size={14} aria-hidden="true" />
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
      <span className="cp-dc-val">{missed ? <IconX size={14} aria-hidden="true" /> : T.CHECK_IN}</span>
    </button>
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
  handlers, // { onOpen(row, el), onMore(row, el), onMarkPaid(row), onReview(row, el), onReviewPair(pair, el), onCheckIn(row, day), onUndoCheckIn(row, day) }
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
  // The camper was paid meanwhile (another device): the box closes by itself.
  useEffect(() => {
    if (popover && (!popoverRow || !['not_paid', 'owes'].includes(payTag(popoverRow)))) setPopover(null);
  }, [popover, popoverRow]);
  const onPay = (row, anchor) => setPopover({ rowId: row.id, anchor });

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
                <CamperTag row={row} onReview={handlers.onReview} onPay={onPay} />
              </div>
              {note && <span className="cp-rnote">{note}</span>}
              <div className="cp-rdays">{shownDays.map((d) => cell(row, d, true))}</div>
            </div>
          );
        })}
        {q && rows.length === 0 && <p className="tempty">{T.NO_MATCH_ROSTER}</p>}
      </div>
    );
  } else {
    // ----- PC and tablet: the grid -----
    const columns = 2 + shownDays.length + (showMore ? 1 : 0);
    list = (
      <div className={`cp-rtable-wrap${shownDays.length <= 2 ? ' is-short' : ''}`}>
        <table className={`cp-rtable${isTouch ? ' is-touch' : ''}${shownDays.length <= 2 ? ' is-short' : ''}`} aria-label={T.ROSTER_LABEL}>
          <thead>
            <tr>
              <th scope="col" className="cp-rcol-name">
                {T.COL_CAMPER}
              </th>
              <th scope="col" className="cp-rcol-paid">
                {T.COL_PAID}
              </th>
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
                    {notSavedId === row.id && (
                    <span className="ttag ttag--warn cp-notsaved">
                      <IconAlertTriangle size={12} aria-hidden="true" />
                      {T.TAG_NOT_SAVED}
                    </span>
                  )}
                    {note && <span className="cp-rnote">{note}</span>}
                  </th>
                  <td className="cp-rcol-paid">
                    <CamperTag row={row} onReview={handlers.onReview} onPay={onPay} />
                  </td>
                  {shownDays.map((d) => (
                    <td key={d.dayId} className={`cp-rcol-day${d.day === today ? ' is-today' : ''}`}>
                      {cell(row, d, false)}
                    </td>
                  ))}
                  {showMore && <td className="cp-rcol-more">{more(row)}</td>}
                </tr>
              );
            })}
            {q && rows.length === 0 && (
              <tr>
                <td colSpan={columns} className="tempty">
                  {T.NO_MATCH_ROSTER}
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

  // A camp nobody signed up for yet: just the empty-state line (review 9).
  if (active.length === 0 && removed.length === 0) {
    return (
      <div className="cp-roster-area">
        <p className="tempty ev-empty">{T.NO_CAMPERS}</p>
      </div>
    );
  }

  return (
    <div className="cp-roster-area">
      <p className="cp-statline">
        {first}
        {toCollect === 0 ? (
          <span className="cp-allpaid">{T.ALL_PAID}</span>
        ) : (
          <span>
            <span className="cp-big">{toCollect}</span>
            {T.toCollectShort}
            {isWide && ` · ${T.dollars(toCollectCents(active))}`}
          </span>
        )}
        {dayExtras.map((extra) => (
          <span key={extra.extraId}>
            {T.extraTodayLine(extra.name)} <span className="cp-big">{extraCountOnDay(active, extra, todayDay.dayId, days)}</span>
          </span>
        ))}
      </p>
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
      <DuplicateBox pairs={pairs} onReview={handlers.onReviewPair} />
      {weekSwitch}
      {list}
      {removedGroup}
      {!isPhone && active.length > 0 && <p className="field-hint cp-hint-line">{T.rosterLegend(isTouch)}</p>}
      {popover && popoverRow && (
        <PaymentPopover
          row={popoverRow}
          anchor={popover.anchor}
          busy={busy}
          onMarkPaid={handlers.onMarkPaid}
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

