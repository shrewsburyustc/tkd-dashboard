// Board.jsx — the Board view of the Prospects (rulebook v0.246, mockup screens 12 and 13).
// Why it exists: the List shows one row per child; the Board shows the same children as one
// column per stage (New, Contacted, Booked, Came, Joined — the stage bar's order, and any stage an
// admin adds), so you see at a glance how many are where and who is stuck.
//   - each child is a card: name (blue dot = a new sign-up you haven't opened), parent, and one
//     line saying where they are or what's next (amber with the warning icon when it needs a call).
//     The Board cards have no progress dots — the column already says the stage (v0.246 answer 3).
//   - click / tap a card → the same side panel as the List
//   - drag a card to another column (useCardDrag.js): mouse on PC, press-and-hold on touch
//   - PC: all columns side by side (they scroll sideways only when there are too many)
//   - tablet: the columns scroll sideways
//   - phone: one column at a time — tap a stage tile above, or swipe left / right
// Side exits (No-show, Not interested) are not columns; their chips show those children in the List.
import { createPortal } from 'react-dom';
import { useRef } from 'react';
import { IconAlertTriangle, IconArrowsHorizontal } from '@tabler/icons-react';
import { isUnopened } from './ProspectList.jsx';
import { progressOf } from './progress.js';
import * as T from './text.js';

function Card({ p, status, name, today, selected, dragging, props, onOpen }) {
  const { short } = progressOf(p, status, today);
  const unopened = props.unopened;
  return (
    <li>
      <button
        type="button"
        className={`pbcard${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
        data-prospect-row={p.id}
        {...props.drag}
        onClick={(e) => onOpen(p, e.currentTarget)}
      >
        <span className="pbcard-name">
          {unopened && <span className="pdot" aria-hidden="true" />}
          {name}
          {unopened && <span className="visually-hidden">, {T.NEW_WORD}</span>}
        </span>
        <span className="pbcard-parent">{p.parentName}</span>
        <span className={`pbcard-line${short.tone ? ` is-${short.tone}` : ''}`}>
          {short.tone === 'warn' && <IconAlertTriangle size={14} aria-hidden="true" className="plist-warn" />}
          {short.text}
        </span>
      </button>
    </li>
  );
}

export default function Board({ code, label, headingLevel = 2, stages, items, statusById, initials, today, selectedId, isPhone, isTouch, column, onColumn, drag, searchNote, onOpen }) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const swipe = useRef(null);
  const byStage = new Map(stages.map((s) => [s.id, []]));
  for (const p of items) byStage.get(p.statusId)?.push(p);

  const col = (s) => {
    const list = byStage.get(s.id) ?? [];
    const headId = `pbcol-${code}-${s.id}`;
    return (
      <div key={s.id} className="pbcol" role="group" data-drop-status={s.id} data-drop-code={code} data-board-col={s.id} aria-labelledby={headId}>
        <Heading className="pbcol-head" id={headId} tabIndex={-1}>
          <span className="pbcol-name">{s.name}</span>
          <span className="pbcol-n" aria-hidden="true">{list.length}</span>
          <span className="visually-hidden">, {T.childrenCount(list.length)}</span>
        </Heading>
        {list.length === 0 ? (
          <p className="pbcol-empty">{T.NOBODY_COLUMN}</p>
        ) : (
          <ul className="pbcol-cards">
            {list.map((p) => {
              const name = T.childLabel(p, initials.get(p.id));
              return (
                <Card
                  key={p.id}
                  p={p}
                  status={statusById.get(p.statusId)}
                  name={name}
                  today={today}
                  selected={selectedId === p.id}
                  dragging={drag.drag?.id === p.id}
                  props={{ unopened: isUnopened(p, statusById), drag: drag.cardProps(p, code, name) }}
                  onOpen={onOpen}
                />
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  // while searching, say how many of the school's children are shown (the bar counts everyone)
  const note = searchNote && (
    <p className="pboard-note">
      {T.searchShowing(searchNote.shown, searchNote.total, searchNote.text)}{' '}
      <button type="button" className="link-button" onClick={searchNote.onClear}>
        {T.SHOW_EVERYONE}
      </button>
    </p>
  );

  // the copy of the card that follows the pointer while dragging
  const ghost = drag.drag && byStage.size > 0 && items.some((p) => p.id === drag.drag.id) && createPortal(
    <div className="pbghost" aria-hidden="true" style={{ left: drag.drag.x - drag.drag.dx, top: drag.drag.y - drag.drag.dy, width: drag.drag.width }}>
      {drag.drag.label}
    </div>,
    document.body,
  );

  if (isPhone) {
    const shown = stages.find((s) => s.id === column) ?? stages[0];
    const at = stages.indexOf(shown);
    return (
      <div className="pboard pboard--phone" role="region" aria-label={label}>
        {note}
        <div
          className="pboard-one"
          onTouchStart={(e) => {
            const t = e.touches[0];
            swipe.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
          }}
          onTouchEnd={(e) => {
            const s = swipe.current;
            swipe.current = null;
            if (!s || drag.busyDragging()) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - s.x;
            const dy = t.clientY - s.y;
            if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            const next = stages[at + (dx < 0 ? 1 : -1)];
            if (next) onColumn(next.id);
          }}
        >
          {shown && col(shown)}
        </div>
        <p className="visually-hidden" aria-live="polite">
          {shown ? T.showingColumn(shown.name, (byStage.get(shown.id) ?? []).length) : ''}
        </p>
        <p className="pboard-hint">
          <IconArrowsHorizontal size={16} aria-hidden="true" /> {T.SWIPE_HINT}
        </p>
        <p className="pboard-hint">{T.DRAG_HINT_TOUCH}</p>
        {ghost}
      </div>
    );
  }

  return (
    <div className="pboard-wrap">
      {note}
      <div className="pboard" data-board-scroll role="region" aria-label={label} style={{ '--pboard-cols': stages.length }}>
        {stages.map(col)}
      </div>
      {isTouch && (
        <p className="pboard-hint">
          <IconArrowsHorizontal size={16} aria-hidden="true" /> {T.SCROLL_HINT}
        </p>
      )}
      <p className="pboard-hint">{isTouch ? T.DRAG_HINT_TOUCH : T.DRAG_HINT}</p>
      {ghost}
    </div>
  );
}
