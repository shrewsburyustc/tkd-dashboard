// DP.jsx — the parts page's samples of the date picker opened from a section's own button
// (components/DatePicker.jsx, its opener option; rulebook v0.817: Finance's Daily report calendar
// button, design review F1 / v1.018).
// Why it exists: the option is built in the shared picker before Finance (and maybe Prospects)
// switch to it, so it needs samples of its own (plan §4):
//   - a stand-in for Finance's day row: ‹ the day ›, the calendar button, Today, History (on phones
//     ‹ the day ›, the calendar button, ⋯). Finance's own styles stay in finance.css, which this page
//     doesn't load (it carries page-wide print rules), so parts.css copies the row's look;
//   - a text button in a panel with past days gray (min = today): the shape Prospects' follow-up
//     date may take;
//   - the field mode, unchanged, for the behaviour checks.
// The dates are fixed as Finance's F1 picture draws them: the day on show is Monday, October 26,
// 2026 and "today" is Wednesday, October 28, so the pictures never change with the clock.
import { useEffect, useRef, useState } from 'react';
import { IconCalendar, IconChevronLeft, IconChevronRight, IconDots, IconHistory } from '@tabler/icons-react';
import DatePicker, { datePickerOpener } from '../components/DatePicker.jsx';
import IconButton from '../components/IconButton.jsx';
import { addDaysIso, fullDate, shortDate } from '../lib/calendarDates.js';
import { PHONE_QUERY, WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { pressLikeMouse, useLater } from './act.js';

const TODAY = '2026-10-28';
const DAY = '2026-10-26';
const DAY_HINT = "Days after today can't be chosen."; // Finance's line (v0.817)
const PAST_HINT = "Past dates can't be chosen."; // the picker's usual line when today is the first day

// The day as Finance's heading writes it: in full on PC, short with the year on tablet, short on phones.
function dayTitle(iso, wide, isPhone) {
  if (isPhone) return shortDate(iso).replace(/, \d{4}$/, '');
  return wide ? fullDate(iso) : shortDate(iso);
}

// A stand-in for Finance's Daily report day row (an admin's). `press`: the calendar button is pressed
// once the screen is drawn, as a person would. For the checks: `disabled` (the button does nothing)
// and `closeAfter` (the section closes the calendar itself that many ms after it opens).
function DayRowSample({ press = false, disabled = false, closeAfter = null }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const wide = useMediaQuery(WIDE_QUERY);
  const calRef = useRef(null);
  const [day, setDay] = useState(DAY);
  const [open, setOpen] = useState(false);
  useLater(() => {
    if (press) pressLikeMouse(calRef.current);
  }, 300);
  useEffect(() => {
    if (!open || !closeAfter) return undefined;
    const timer = window.setTimeout(() => setOpen(false), closeAfter);
    return () => window.clearTimeout(timer);
  }, [open, closeAfter]);
  const isToday = day === TODAY;
  return (
    <section className="parts-dp" data-shot data-day={day}>
      <div className="parts-dayrow">
        <IconButton label="Previous day" Icon={IconChevronLeft} className="parts-ibtn" onClick={() => setDay(addDaysIso(day, -1))} />
        <h2 className="parts-day">{dayTitle(day, wide, isPhone)}</h2>
        <IconButton
          label="Next day"
          Icon={IconChevronRight}
          className={`parts-ibtn${isToday ? ' is-unavailable' : ''}`}
          aria-disabled={isToday ? 'true' : undefined}
          onClick={() => {
            if (!isToday) setDay(addDaysIso(day, 1));
          }}
        />
        <IconButton
          ref={calRef}
          label="Pick a date"
          Icon={IconCalendar}
          className={`parts-ibtn${disabled ? ' is-unavailable' : ''}`}
          aria-disabled={disabled ? 'true' : undefined}
          {...datePickerOpener(open, setOpen, { disabled })}
        />
        {!isPhone && !isToday && (
          <button type="button" className="btn" onClick={() => setDay(TODAY)}>
            Today
          </button>
        )}
        {!isPhone && (
          <button type="button" className="btn">
            <IconHistory size={16} aria-hidden="true" />
            History
          </button>
        )}
        {isPhone && <IconButton label="More actions" Icon={IconDots} className="parts-ibtn parts-more" />}
      </div>
      <DatePicker
        opener={calRef}
        open={open}
        onOpenChange={setOpen}
        label="Day"
        value={day}
        today={TODAY}
        max={TODAY}
        years={[2025, 2026]}
        hint={DAY_HINT}
        inline={isPhone}
        disabled={disabled}
        onChange={setDay}
      />
      {/* The day's cards: on phones the calendar pushes them down */}
      <div className="parts-cards" aria-hidden="true">
        {['Total', 'Cash', 'Check', 'Card'].map((name) => (
          <div key={name} className="parts-card">
            <span>{name}</span>
            <strong>$0.00</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

// A text button in a panel, past days gray (min = today). For the checks: `box` puts it in a box that
// can take the focus (tabindex -1, as the shared Dialog's box), `low` near the bottom of the window
// (so the calendar opens above the button).
function PanelSample({ press = false, box = false, low = false }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const buttonRef = useRef(null);
  const [date, setDate] = useState(null);
  const [open, setOpen] = useState(false);
  useLater(() => {
    if (press) pressLikeMouse(buttonRef.current);
  }, 300);
  const panel = (
    <section className={`parts-dp parts-dp-panel${low ? ' parts-dp-low' : ''}`} data-shot data-date={date ?? ''}>
      <h3 className="parts-dp-h3">Follow up</h3>
      <p className="parts-dp-line">{date ? shortDate(date) : 'No follow-up date'}</p>
      <button ref={buttonRef} type="button" className="btn btn-sm" {...datePickerOpener(open, setOpen)}>
        Pick a date
      </button>
      <DatePicker
        opener={buttonRef}
        open={open}
        onOpenChange={setOpen}
        label="Follow-up date"
        value={date}
        today={TODAY}
        min={TODAY}
        years={[2026, 2027]}
        hint={PAST_HINT}
        inline={isPhone}
        onChange={setDate}
      />
    </section>
  );
  return box ? (
    <div className="parts-focusbox" tabIndex={-1}>
      {panel}
    </div>
  ) : (
    panel
  );
}

// The field mode as every section uses it today (nothing changes for it): for the behaviour checks.
function FieldSample() {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [date, setDate] = useState(DAY);
  return (
    <section className="parts-dp" data-shot data-date={date}>
      <label className="label" htmlFor="parts-dp-field">
        Testing date
      </label>
      <DatePicker id="parts-dp-field" label="Testing date" value={date} today={TODAY} years={[2026, 2027]} inline={isPhone} onChange={setDate} />
    </section>
  );
}

export const PART = {
  id: 'DP',
  title: 'The date picker opened from a button',
  file: 'DatePicker.jsx',
  states: [
    { id: 'row-closed', title: "Finance's day row (a stand-in), closed", render: () => <DayRowSample /> },
    { id: 'row-open', title: 'Opened from the calendar button: under it on PC and tablet, in the page under the row on phones', render: () => <DayRowSample press /> },
    { id: 'panel-open', title: 'Opened from a text button in a panel, past days gray (min = today)', render: () => <PanelSample press /> },
  ],
  extra: [
    { id: 'panel', title: 'The panel, closed (for the checks)', render: () => <PanelSample /> },
    { id: 'panel-in-box', title: 'The panel in a box that can take the focus, as a dialog box (for the checks)', render: () => <PanelSample box /> },
    { id: 'panel-low', title: 'The panel near the bottom of the window: the calendar opens above (for the checks)', render: () => <PanelSample low /> },
    { id: 'row-disabled', title: 'The day row with a disabled calendar button (for the checks)', render: () => <DayRowSample disabled /> },
    { id: 'row-autoclose', title: 'The section closes the calendar itself, 1 s after it opens (for the checks)', render: () => <DayRowSample closeAfter={1000} /> },
    { id: 'field', title: 'The field mode, unchanged (for the checks)', render: () => <FieldSample /> },
  ],
};
