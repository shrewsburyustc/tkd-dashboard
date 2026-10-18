// TimeGrid.jsx — the calendar-style schedule: times down the left side, one column per day,
// and each class a box whose HEIGHT is its length (approved mockup rev 2, rulebook v0.137).
// Why it exists: PC and tablet show the whole week (7 columns); the phone shows one day at a
// time (1 column) — both are this same grid with a different list of days.
//
// Every hour from the first class to the last is shown ("show every hour", v0.137). Two classes
// at the same time on the same day (two mats) sit side by side in that day's column.
// Boxes are buttons for admins (open Edit) and plain boxes for staff (view only, mockup screen 7).
// Each box shows the class name AND its time, so color is never the only cue.
//
// Props:
//   days        [1..7] to show (one for the phone)
//   slots       the shown schedule's slots { id, weekday, start, end, classIds }
//               (several classes taught together share ONE box: "White + Little Tiger", v0.141)
//   classNames  Map classId → name;  colors  { classId: colorKey }
//   pxPerMin    vertical scale (CSS pixels per minute)
//   showDayHeads  true for the week (the phone has its own day buttons)
//   onOpen      (slot, element) => void, or null for view only
//   selectedId  the slot open in a dialog (gets the blue "selected" look)
import { colorOf } from '../../lib/schedule/colors.js';
import { formatRange, hourLabel, hourRange } from '../../lib/schedule/time.js';
import { DAY_SHORT, slotLabel } from './text.js';

// Places overlapping slots of one day side by side: each gets a lane and the number of lanes in
// its group. (A "group" = slots that overlap each other, directly or through a chain.)
// Also used by the Calendar's week view (any items with start / end).
export function layoutDay(daySlots) {
  const sorted = [...daySlots].sort((a, b) => a.start - b.start || a.end - b.end);
  const placed = [];
  let group = [];
  let groupEnd = -1;
  const finish = () => {
    const lanes = Math.max(1, ...group.map((p) => p.lane + 1));
    for (const p of group) p.lanes = lanes;
  };
  for (const slot of sorted) {
    if (slot.start >= groupEnd && group.length) {
      finish();
      group = [];
    }
    const used = new Set(group.filter((p) => p.slot.end > slot.start).map((p) => p.lane));
    let lane = 0;
    while (used.has(lane)) lane += 1;
    const item = { slot, lane, lanes: 1 };
    group.push(item);
    placed.push(item);
    groupEnd = Math.max(groupEnd, slot.end);
  }
  if (group.length) finish();
  return placed;
}

export default function TimeGrid({ days, slots, classNames, colors, pxPerMin, showDayHeads, onOpen, selectedId, rangeSlots }) {
  // The hours come from the whole schedule (rangeSlots), so the phone's day view keeps the same
  // scale from day to day.
  const { from, to } = hourRange(rangeSlots ?? slots);
  const height = (to - from) * pxPerMin;
  const hours = [];
  for (let m = from; m <= to; m += 60) hours.push(m);
  const halves = [];
  for (let m = from + 30; m < to; m += 60) halves.push(m);

  return (
    <div className={`sgrid${showDayHeads ? '' : ' sgrid--one'}`} style={{ '--sg-days': days.length }}>
      {showDayHeads && (
        <div className="sgrid-heads" aria-hidden="true">
          <span />
          {days.map((d) => (
            <span key={d} className="sgrid-head">
              {DAY_SHORT[d]}
            </span>
          ))}
        </div>
      )}
      <div className="sgrid-body" style={{ height }}>
        <div className="sgrid-axis" aria-hidden="true">
          {hours.map((m) => (
            <span key={m} className="sgrid-hour" style={{ top: (m - from) * pxPerMin }}>
              {hourLabel(m)}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const placed = layoutDay(slots.filter((s) => s.weekday === d));
          return (
            <div key={d} className="sgrid-col" role="list" aria-label={DAY_SHORT[d]}>
              {hours.map((m) => (
                <span key={`h${m}`} className="sgrid-line" style={{ top: (m - from) * pxPerMin }} aria-hidden="true" />
              ))}
              {halves.map((m) => (
                <span key={`m${m}`} className="sgrid-line sgrid-line--half" style={{ top: (m - from) * pxPerMin }} aria-hidden="true" />
              ))}
              {placed.map(({ slot, lane, lanes }) => {
                const slotColors = slot.classIds.map((id) => colorOf(colors[id]));
                const color = slotColors[0];
                const name = slot.classIds.map((id) => classNames.get(id) ?? '').join(' + ');
                // A combined slot shows each class's color side by side (sharp split, no blend).
                const fill =
                  slotColors.length === 1
                    ? color.fill
                    : `linear-gradient(90deg, ${slotColors
                        .map((c, i) => `${c.fill} ${(i * 100) / slotColors.length}% ${((i + 1) * 100) / slotColors.length}%`)
                        .join(', ')})`;
                const boxHeight = (slot.end - slot.start) * pxPerMin;
                const style = {
                  top: (slot.start - from) * pxPerMin,
                  height: boxHeight,
                  left: `calc(${(lane / lanes) * 100}% + 2px)`,
                  width: `calc(${100 / lanes}% - 4px)`,
                  '--slot-fill': fill,
                  '--slot-edge': color.edge,
                  '--slot-text': color.text,
                };
                const content = (
                  <>
                    <span className="sslot-name">{name}</span>
                    {/* Too short for two lines (under ~34px): the name only; the time is on the side. */}
                    {boxHeight >= 34 && <span className="sslot-time">{formatRange(slot.start, slot.end)}</span>}
                  </>
                );
                const className = `sslot${selectedId === slot.id ? ' is-selected' : ''}`;
                return (
                  <div key={slot.id} role="listitem" className="sslot-wrap" style={style}>
                    {onOpen ? (
                      <button type="button" className={className} data-slot={slot.id} aria-label={slotLabel(slot, name)} title={`${name} · ${formatRange(slot.start, slot.end, true)}`} onClick={(e) => onOpen(slot, e.currentTarget)}>
                        {content}
                      </button>
                    ) : (
                      <div className={className} aria-label={slotLabel(slot, name)} title={`${name} · ${formatRange(slot.start, slot.end, true)}`} role="img">
                        {content}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
