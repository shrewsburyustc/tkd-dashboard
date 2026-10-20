// ProspectList.jsx — the list of prospects (mockup screens 1, 2, 8, 11).
// Why it exists: one row per child: Child · Parent · Progress · Follow up · Status.
//   - Progress (v0.246): the small track (Signed up → Class booked → Came → Joined) plus one line
//     saying where the child is or what's next ("Signed up Oct 18 · needs a class").
//   - PC: a table-like list; with the side panel open, only Child · Progress · Status fit.
//   - Tablet: the full list (the panel is below it).
//   - Phone: cards (child · parent, then the track and its line) with the status tag; an amber
//     "Follow up · Today" line under it when due, unless the track's line is already amber.
// Never a phone number, email, age or answer here (rulebook section 5; the list function doesn't
// even return them). Overdue / today follow-ups, "Did … come?" and a cancelled class are amber,
// always with words.
import { IconAlertTriangle } from '@tabler/icons-react';
import { colorOf } from '../../lib/schedule/colors.js';
import { progressOf } from './progress.js';
import { Track } from './Progress.jsx';
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

// What the Follow up column says for one prospect (the Progress column says the rest).
export function followCell(p, statusById, today) {
  const builtin = statusById.get(p.statusId)?.builtin;
  if (builtin === 'joined') return { text: T.NONE, warn: false };
  return T.followUpText(p.followUpOn, today) ?? { text: builtin === 'new' ? T.NEW_SIGNUP : T.NONE, warn: false };
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
export const isUnopened = (p, statusById) => !p.openedByMe && ['new', 'booked'].includes(statusById.get(p.statusId)?.builtin ?? '');

export default function ProspectList({ items, label, statusById, initials, today, selectedId, narrow, isPhone, emptyText, onOpen }) {
  if (items.length === 0) return <p className="tempty pempty">{emptyText}</p>;

  if (isPhone) {
    return (
      <ul className="pcards" aria-label={label}>
        {items.map((p) => {
          const follow = followCell(p, statusById, today);
          const progress = progressOf(p, statusById.get(p.statusId), today);
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
                    <Track progress={progress} />
                  </span>
                  {/* a due follow-up, unless the line above is already amber (difference D) */}
                  {follow.warn && progress.line.tone !== 'warn' && (
                    <span className="pcard-l2 is-warn">
                      <IconAlertTriangle size={16} aria-hidden="true" className="plist-warn" />
                      {T.FOLLOW_UP} · {follow.text}
                    </span>
                  )}
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
        {!narrow && <span role="columnheader">{T.COL_PARENT}</span>}
        <span role="columnheader">{T.COL_PROGRESS}</span>
        {!narrow && <span role="columnheader">{T.COL_FOLLOW}</span>}
        <span role="columnheader">{T.COL_STATUS}</span>
      </div>
      {items.map((p) => {
        const name = T.childLabel(p, initials.get(p.id));
        return (
          <div key={p.id} role="row" className={`plist-row${selectedId === p.id ? ' is-selected' : ''}`}>
            <span role="cell" className="plist-name">
              {isUnopened(p, statusById) && <span className="pdot" aria-hidden="true" />}
              <button type="button" className="link-button plist-open" data-prospect-row={p.id} aria-label={T.openLabel(name, isUnopened(p, statusById))} onClick={(e) => onOpen(p, e.currentTarget)}>
                {name}
              </button>
            </span>
            {!narrow && <span role="cell">{p.parentName}</span>}
            <span role="cell" className="plist-progress">
              <Track progress={progressOf(p, statusById.get(p.statusId), today)} />
            </span>
            {!narrow && <Cell value={followCell(p, statusById, today)} />}
            <span role="cell">
              <StatusTag status={statusById.get(p.statusId)} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
