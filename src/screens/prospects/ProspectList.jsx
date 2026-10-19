// ProspectList.jsx — the list of prospects (mockup screens 1, 2, 8).
// Why it exists: one row per child: Child · Parent · Free class · Follow up · Status.
//   - PC: a table-like list; with the side panel open, only Child · Parent · Status fit.
//   - Tablet: the full list (the panel is below it).
//   - Phone: cards (child · parent, then free class · follow-up) with the status tag.
// Never a phone number, email, age or answer here (rulebook section 5; the list function doesn't
// even return them). Overdue / today follow-ups, "Did … come?" and a cancelled class are amber,
// always with words. In the Joined view the free-class and follow-up columns say when they came
// and joined.
import { IconAlertTriangle } from '@tabler/icons-react';
import { colorOf } from '../../lib/schedule/colors.js';
import * as T from './text.js';

export function StatusTag({ status }) {
  if (!status) return null;
  const c = colorOf(status.color);
  return (
    <span className="pstatus" style={{ background: c.fill, borderColor: c.edge, color: c.text }}>
      {status.name}
    </span>
  );
}

// What the Free class and Follow up columns say for one prospect.
export function rowCells(p, statusById, today) {
  const builtin = statusById.get(p.statusId)?.builtin;
  let free = { text: T.NONE, warn: false };
  if (p.booking && p.booking.status === 'booked') {
    free = p.booking.classRunning ? { text: T.freeClassLine(p.booking), warn: false } : { text: `${T.freeClassLine(p.booking)} · ${T.CLASS_GONE_SHORT}`, warn: true };
  }
  let follow = T.followUpText(p.followUpOn, today) ?? { text: builtin === 'new' ? T.NEW_SIGNUP : T.NONE, warn: false };
  if (p.askCame) follow = { text: T.askCame(p.childFirstName), warn: true };
  if (builtin === 'joined') {
    free = { text: p.booking ? T.cameLine(p.booking) : T.NONE, warn: false };
    follow = { text: p.joinedOn ? T.joinedLine(p.joinedOn) : T.NONE, warn: false };
  }
  return { free, follow };
}

function Cell({ value, className = '' }) {
  return (
    <span role="cell" className={`${className}${value.warn ? ' is-warn' : ''}`}>
      {value.warn && <IconAlertTriangle size={16} aria-hidden="true" className="plist-warn" />}
      {value.text}
    </span>
  );
}

// The blue dot = a new sign-up you haven't opened (what the rail badge counts: New / Booked).
const isUnopened = (p, statusById) => !p.openedByMe && ['new', 'booked'].includes(statusById.get(p.statusId)?.builtin ?? '');

export default function ProspectList({ items, label, statusById, initials, today, selectedId, narrow, isPhone, emptyText, onOpen }) {
  if (items.length === 0) return <p className="tempty pempty">{emptyText}</p>;

  if (isPhone) {
    return (
      <ul className="pcards" aria-label={label}>
        {items.map((p) => {
          const { free, follow } = rowCells(p, statusById, today);
          const name = T.childLabel(p, initials.get(p.id));
          return (
            <li key={p.id}>
              <button type="button" className={`pcard${selectedId === p.id ? ' is-selected' : ''}`} data-prospect-row={p.id} aria-label={T.openLabel(name, isUnopened(p, statusById))} onClick={(e) => onOpen(p, e.currentTarget)}>
                <span className="pcard-text">
                  <span className="pcard-l1">
                    {isUnopened(p, statusById) && <span className="pdot" aria-hidden="true" />}
                    {name} · {p.parentName}
                  </span>
                  <span className="pcard-l2">
                    <span className={free.warn ? 'is-warn' : undefined}>
                      {free.warn && <IconAlertTriangle size={16} aria-hidden="true" className="plist-warn" />}
                      {free.text}
                    </span>
                    {follow.text !== T.NONE && (
                      <>
                        {' · '}
                        <span className={follow.warn ? 'is-warn' : undefined}>
                          {follow.warn && <IconAlertTriangle size={16} aria-hidden="true" className="plist-warn" />}
                          {follow.text}
                        </span>
                      </>
                    )}
                  </span>
                </span>
                <StatusTag status={statusById.get(p.statusId)} />
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className={`plist${narrow ? ' plist--narrow' : ''}`} role="table" aria-label={label}>
      <div className="plist-row plist-head" role="row">
        <span role="columnheader">{T.COL_CHILD}</span>
        <span role="columnheader">{T.COL_PARENT}</span>
        {!narrow && <span role="columnheader">{T.COL_FREE}</span>}
        {!narrow && <span role="columnheader">{T.COL_FOLLOW}</span>}
        <span role="columnheader">{T.COL_STATUS}</span>
      </div>
      {items.map((p) => {
        const { free, follow } = rowCells(p, statusById, today);
        const name = T.childLabel(p, initials.get(p.id));
        return (
          <div key={p.id} role="row" className={`plist-row${selectedId === p.id ? ' is-selected' : ''}`}>
            <span role="cell" className="plist-name">
              {isUnopened(p, statusById) && <span className="pdot" aria-hidden="true" />}
              <button type="button" className="link-button plist-open" data-prospect-row={p.id} aria-label={T.openLabel(name, isUnopened(p, statusById))} onClick={(e) => onOpen(p, e.currentTarget)}>
                {name}
              </button>
            </span>
            <span role="cell">{p.parentName}</span>
            {!narrow && <Cell value={free} />}
            {!narrow && <Cell value={follow} />}
            <span role="cell">
              <StatusTag status={statusById.get(p.statusId)} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
