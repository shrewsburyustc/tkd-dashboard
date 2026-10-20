// CheckInTab.jsx — the camp page's Check in tab (v0.704 option A): the door list.
// Why it exists: on a camp morning the desk needs ONE thing — who is here and who isn't yet — with
// one big button per child. Everything else (prices, extras, phones) is one tap away in Camper
// detail. During camp week the camp page opens on this tab.
//   - a day switch with the camp's days ("Mon 19  14"; Color Belt's segmented style, a 3-column
//     grid on phones), starting on today (or the next camp day, campRules.defaultCheckInDay)
//   - the line "Wed, Apr 21  9 of 15 here  6 not here yet" (the chosen day first, big numbers), and
//     for an extra offered only on some days: "Pizza party today: 15"
//   - Find a camper (filters both groups by name)
//   - "Not here yet · 6": name · age, at most ONE small amber note (Possible duplicate / Not paid /
//     Owes $15 / that day's per-day extra, campRules.checkInNote), and Check in
//   - "Here · 9": name · age · ✓ 9:10 AM, and ⋯ → Undo check-in
// Check in is instant with a 5-second Undo toast (the page does it). Owner decision at CP1
// (2026-10-19): staff and admins can check in — and undo a check-in — on ANY camp day, past,
// today or future. Withdrawn campers aren't listed.
// Tapping the Not paid / Owes note opens a small box with the amount and Mark paid (the same call
// and toast as the Payments tab).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconAlertTriangle, IconCheck, IconDots, IconSearch } from '@tabler/icons-react';
import IconButton from '../../components/IconButton.jsx';
import { checkInNote, extraCountOnDay, extraOfferedOn } from '../../lib/camps/campRules.js';
import ChoiceGroup from '../testing/events/ChoiceGroup.jsx';
import { MarkPaidButton, NameAge } from './CamperRows.jsx';
import * as T from './text.js';

// ----- The small "Not paid · $219  [Mark paid]" box under a note (contract §10) -----
function PaymentPopover({ row, anchor, busy, onMarkPaid, onClose }) {
  const boxRef = useRef(null);
  const [position, setPosition] = useState(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // Under the note, kept on screen; above it when there's no room below.
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
  // Focus goes into the box; a click outside or Esc closes it (focus back on the note).
  useEffect(() => {
    if (position) boxRef.current?.querySelector('button')?.focus();
  }, [position !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    function outside(event) {
      const path = event.composedPath();
      if (path.includes(boxRef.current) || path.includes(anchor)) return;
      onCloseRef.current(false);
    }
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [anchor]);

  const note = checkInNote(row, null);
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
      <p className="cp-popover-line">{T.notePopoverLine(T.camperLabel(row), note?.kind, row.owesCents)}</p>
      <MarkPaidButton
        row={row}
        busy={busy}
        tabIndex={0}
        onMarkPaid={(r) => {
          onClose(true);
          onMarkPaid(r);
        }}
      />
    </div>,
    document.body,
  );
}

// The one amber note of a "Not here yet" row (or nothing).
// extras / days: the camp's, so the "No pizza party" note can show (owner decision 2026-10-19).
function RowNote({ row, dayId, extras, days, onNote, onReview }) {
  const note = checkInNote(row, dayId, extras, days);
  if (!note) return null;
  if (note.kind === 'extra') return <span className="ttag ttag--warn cp-pill">{note.name}</span>;
  if (note.kind === 'no_extra') return <span className="ttag ttag--warn cp-pill">{T.noExtraNote(note.name)}</span>;
  const text = note.kind === 'duplicate' ? T.TAG_POSSIBLE_DUPLICATE : note.kind === 'owes' ? T.noteOwes(note.cents) : T.NOTE_NOT_PAID;
  return (
    <button
      type="button"
      className="ttag ttag--warn ev-tag-button cp-pill"
      aria-haspopup={note.kind === 'duplicate' ? 'dialog' : 'true'}
      onClick={(event) => {
        event.stopPropagation();
        if (note.kind === 'duplicate') onReview(row, event.currentTarget);
        else onNote(row, event.currentTarget);
      }}
    >
      <IconAlertTriangle size={12} aria-hidden="true" />
      {text}
    </button>
  );
}

const byName = (a, b) =>
  a.lastName.localeCompare(b.lastName, 'en', { sensitivity: 'base' }) || a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' });

export default function CheckInTab({
  days,
  dayId,
  onDay,
  today,
  active,
  extras = [], // the camp's extras (for "Pizza party today: 15" and "No pizza party")
  query,
  onQuery,
  busy,
  layout,
  menuFor,
  notSavedId,
  handlers, // { onOpen, onCheckIn(row, day), onMore(row, anchor), onMarkPaid(row), onReview(row, anchor) }
  panelId,
  tabId,
}) {
  const [popover, setPopover] = useState(null); // { rowId, anchor }
  const day = days.find((d) => d.dayId === dayId) ?? days[0] ?? null;
  const switchLabelId = `${panelId}-days`;

  // The day's campers, and how many come each day (for the switch).
  const comes = (row, id) => (row.days ?? []).some((d) => d.dayId === id);
  const countOn = (id) => active.filter((r) => comes(r, id)).length;
  const onDay_ = day ? active.filter((r) => comes(r, day.dayId)) : [];
  const checkedIn = (row) => (row.days ?? []).find((d) => d.dayId === day?.dayId)?.checkedInAt ?? null;
  const here = onDay_.filter((r) => checkedIn(r));
  const notHere = onDay_.filter((r) => !checkedIn(r));

  const q = query.trim().toLowerCase();
  const match = (row) => !q || `${row.firstName} ${row.lastName}`.toLowerCase().includes(q);
  const shownNotHere = notHere.filter(match).sort(byName);
  const shownHere = here.filter(match).sort(byName);

  // Extras offered only on some days and offered on this one: how many to order (pizza).
  const dayExtras = day ? extras.filter((e) => e.per === 'day' && (e.onlyOn ?? []).length > 0 && extraOfferedOn(e, day.day)) : [];
  // Owner decision at CP1 (2026-10-19): staff and admins can check in on ANY camp day — past,
  // today or future — so every day has the same buttons and the same wording.
  const canAct = true;

  const popoverRow = popover ? active.find((r) => r.id === popover.rowId) : null;
  // The camper paid meanwhile (another device): the box closes by itself.
  useEffect(() => {
    if (popover && (!popoverRow || !['not_paid', 'owes'].includes(checkInNote(popoverRow, null)?.kind))) setPopover(null);
  }, [popover, popoverRow]);

  function row(rowData, isHere) {
    const name = T.camperLabel(rowData);
    const open = menuFor === rowData.id;
    const stamp = isHere ? checkedIn(rowData) : null;
    return (
      <div
        key={rowData.id}
        className={`ev-srow cp-crow${open ? ' is-selected' : ''}${layout.isPhone ? ' is-phone' : ''}`}
        role="row"
        aria-label={name}
        tabIndex={-1}
        data-checkin-row={rowData.id}
        onClick={() => handlers.onOpen(rowData)}
      >
        <span className="ev-scell cp-crow-name" role="cell">
          {/* The name is a button too, so the keyboard can open Camper detail (Tab, Enter). */}
          <button
            type="button"
            className="cp-name-btn"
            onClick={(event) => {
              event.stopPropagation();
              handlers.onOpen(rowData);
            }}
          >
            <NameAge row={rowData} showMember={false} />
          </button>
          {notSavedId === rowData.id && (
            <span className="ttag ttag--warn">
              <IconAlertTriangle size={12} aria-hidden="true" />
              {T.TAG_NOT_SAVED}
            </span>
          )}
          {!isHere && <RowNote row={rowData} dayId={day.dayId} extras={extras} days={days} onNote={(r, anchor) => setPopover({ rowId: r.id, anchor })} onReview={handlers.onReview} />}
        </span>
        <span className="acts cp-crow-acts" role="cell">
          {isHere ? (
            <>
              <span className="cp-here-time">
                {/* ti-check = came / checked in */}
                <IconCheck size={16} aria-hidden="true" />
                <span className="visually-hidden">{T.checkedInAt(stamp)}</span>
                <span aria-hidden="true">{T.clockTime(stamp)}</span>
              </span>
              {canAct ? (
                <IconButton
                  label={T.moreFor(name)}
                  Icon={IconDots}
                  aria-haspopup="menu"
                  aria-expanded={open ? 'true' : 'false'}
                  data-camper-more={rowData.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    handlers.onMore(rowData, event.currentTarget);
                  }}
                />
              ) : (
                <span className="ev-more-spacer" aria-hidden="true" />
              )}
            </>
          ) : (
            canAct && (
              <button
                type="button"
                className="btn cp-checkin"
                aria-label={T.checkInLabel(name)}
                aria-disabled={busy ? 'true' : undefined}
                data-checkin-btn={rowData.id}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!busy) handlers.onCheckIn(rowData, day);
                }}
              >
                {T.CHECK_IN}
              </button>
            )
          )}
        </span>
      </div>
    );
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId}>
      {days.length > 0 && (
        <>
          <span id={switchLabelId} className="visually-hidden">
            {T.DAY_SWITCH_LABEL}
          </span>
          <div className={`ev-class-switch cp-dayswitch${layout.isPhone ? ' is-phone' : ''}`}>
            <ChoiceGroup
              labelId={switchLabelId}
              value={day?.dayId ?? null}
              onChange={(id) => {
                setPopover(null);
                onDay(id);
              }}
              options={days.map((d) => {
                const count = countOn(d.dayId);
                return {
                  key: d.dayId,
                  label: `${T.dayLong(d.day)} ${count}`,
                  content: (
                    <>
                      <span className="ev-cs-name">{T.dayChip(d.day)}</span>
                      <span className="ev-cs-count">{count}</span>
                    </>
                  ),
                };
              })}
            />
          </div>
        </>
      )}
      {day && onDay_.length === 0 ? (
        <p className="tempty ev-empty">{T.noCampersOn(day.day)}</p>
      ) : (
        day && (
          <>
            {/* Option A's big numbers: "9 of 15 here   6 not here yet" */}
            <p className="cp-statline">
              {/* The chosen day in full first, so it's obvious which day the list is for. */}
              <strong className="cp-statday">{T.dayLong(day.day)}</strong>
              <span>
                <span className="cp-big">{here.length}</span>
                {T.hereOf(onDay_.length)}
              </span>
              <span>
                <span className="cp-big">{notHere.length}</span>
                {T.NOT_HERE_WORDS}
              </span>
              {dayExtras.map((extra) => (
                <span key={extra.extraId}>
                  {T.extraTodayLine(extra.name, day.day === today)} <span className="cp-big">{extraCountOnDay(active, extra, day.dayId, days)}</span>
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
            <div className={`clist ev-roster cp-checkin-list${layout.isTouch ? ' is-touch' : ''}`} role="table" aria-label={T.TAB_CHECK_IN}>
              <div role="rowgroup">
                <div className="gr-subhead ev-subhead cp-subhead" role="row">
                  <span role="cell">
                    {T.NOT_HERE_YET(shownNotHere.length)}
                  </span>
                </div>
                {shownNotHere.map((r) => row(r, false))}
                <div className="gr-subhead ev-subhead cp-subhead" role="row">
                  <span role="cell">{T.HERE(shownHere.length)}</span>
                </div>
                {shownHere.map((r) => row(r, true))}
                {q && shownHere.length + shownNotHere.length === 0 && (
                  <p className="tempty ev-roster-empty" role="row">
                    <span role="cell">{T.NO_MATCH}</span>
                  </p>
                )}
              </div>
            </div>
          </>
        )
      )}
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
