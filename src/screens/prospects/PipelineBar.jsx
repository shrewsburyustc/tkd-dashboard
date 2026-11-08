// PipelineBar.jsx — the stage counts and the chips above the list (mockup screens 1, 2), and the
// "Find a prospect" box (SearchBox, drawn by Prospects.jsx below the bar — R3-09, v1.050).
// Why it exists: one look at how many children are at each stage of this school.
//   - PC / tablet: the stages side by side (count, name, a bar); Joined's bar is green. Below:
//     the amber "Follow up today" chip and the side exits (No-show, Not interested, …).
//   - Phone: the stages as tiles plus a "Today" tile, then the side-exit chips (only those with
//     someone in them).
// Every filter button carries data-filter-key (a status id, or "today"), so "Show all" can put the
// focus back on the one that was on (v1.119).
// Click a stage (or chip) to show only those; click it again for everyone. The List opens on
// "Follow up today".
// List / Board switch (v0.246) first in the chips row. On the Board:
//   - a stage in the bar jumps to its column (PC / tablet); a phone stage tile picks the one
//     column shown
//   - the stages and tiles are also places to drop a dragged card (data-drop-status)
//   - the Board always shows everyone, so "Follow up today" (chip / Today tile) is only in the List
//     (Prospects difference C); a side-exit chip shows those children in the List
import { IconClockHour4, IconLayoutKanban, IconList, IconSearch, IconX } from '@tabler/icons-react';
import IconButton from '../../components/IconButton.jsx';
import * as T from './text.js';

export function ViewSwitch({ view, onView }) {
  return (
    <span className="pview" role="group" aria-label={T.VIEW}>
      <button type="button" className={`pview-btn${view === 'list' ? ' is-on' : ''}`} aria-pressed={view === 'list'} onClick={() => onView('list')}>
        <IconList size={16} aria-hidden="true" />
        {T.VIEW_LIST}
      </button>
      <button type="button" className={`pview-btn${view === 'board' ? ' is-on' : ''}`} aria-pressed={view === 'board'} onClick={() => onView('board')}>
        <IconLayoutKanban size={16} aria-hidden="true" />
        {T.VIEW_BOARD}
      </button>
    </span>
  );
}

// "Find a prospect" (R3-09, v1.050): the search box. It sits on the LEFT, above the list (after the
// "Showing … only" line), not in the chip row; on Both there is ONE box above the two schools. Its ✕ is
// the shared icon button: 28px, "Clear search" tooltip, 44px on touch (v0.631). It disappears when
// pressed, so focus goes back into the box. The box still finds by phone (4+ digits): the screen-reader
// name says so.
export function SearchBox({ id, search, onSearch, both = false }) {
  // role="search" makes the box a landmark screen readers can jump to; it is a plain wrapper (display: contents
  // keeps the look the same). On a school's own page it carries "Find a prospect", on Both too.
  return (
    <div role="search" aria-label={T.SEARCH} style={{ display: 'contents' }}>
    <label className={`psearch${both ? ' psearch--both' : ''}`}>
      <IconSearch size={16} aria-hidden="true" />
      <span className="visually-hidden">{T.SEARCH_LABEL}</span>
      <input id={id} type="search" className="psearch-input" placeholder={T.SEARCH} value={search} maxLength={80} autoComplete="off" onChange={(e) => onSearch(e.target.value)} />
      {search && (
        <IconButton
          label={T.CLEAR_SEARCH}
          Icon={IconX}
          onClick={(e) => {
            const input = e.currentTarget.closest('label')?.querySelector('input');
            onSearch('');
            input?.focus();
          }}
        />
      )}
    </label>
    </div>
  );
}

export default function PipelineBar({
  idBase, code, stages, exits, counts, todayCount, filter, isPhone, onFilter,
  view = 'list', onView, boardColumn, onStage,
}) {
  const max = Math.max(1, ...stages.map((s) => counts.get(s.id) ?? 0));
  const board = view === 'board';
  const isOn = (id) => (board ? isPhone && boardColumn === id : filter.kind === 'status' && filter.id === id);
  const toggle = (id) => (board ? onStage(id) : onFilter(isOn(id) ? { kind: 'all' } : { kind: 'status', id }));
  const todayOn = filter.kind === 'today';
  // on the Board, a stage is also a place to drop a card
  const drop = (id) => (board ? { 'data-drop-status': id, 'data-drop-code': code } : {});
  const pressed = (id) => (board && !isPhone ? undefined : isOn(id));
  const viewSwitch = onView && <ViewSwitch view={view} onView={onView} />;

  // phone: a side exit with nobody in it is hidden, so the row fits (difference F) — unless it is
  // the one being shown
  const shownExits = isPhone ? exits.filter((s) => (counts.get(s.id) ?? 0) > 0 || isOn(s.id)) : exits;
  const exitChips = shownExits.map((s) => (
    <button key={s.id} type="button" className={`pchip${isOn(s.id) ? ' is-on' : ''}`} aria-pressed={isOn(s.id)} data-filter-key={s.id} onClick={() => toggle(s.id)}>
      {T.chipCount(s.name, counts.get(s.id) ?? 0)}
    </button>
  ));

  if (isPhone) {
    return (
      <div className="pbar pbar--phone">
        <div className="ptiles" role="group" aria-label={T.STAGES}>
          {stages.map((s) => (
            <button key={s.id} type="button" className={`ptile${isOn(s.id) ? ' is-on' : ''}`} aria-pressed={isOn(s.id)} aria-label={T.stageButton(s.name, counts.get(s.id) ?? 0, isOn(s.id))} data-filter-key={s.id} onClick={() => toggle(s.id)} {...drop(s.id)}>
              <b>{counts.get(s.id) ?? 0}</b>
              <span>{s.name}</span>
            </button>
          ))}
          {!board && (
          <button type="button" className={`ptile ptile--today${todayOn ? ' is-on' : ''}`} aria-pressed={todayOn} data-filter-key="today" onClick={() => onFilter(todayOn ? { kind: 'all' } : { kind: 'today' })}>
            <b>{todayCount}</b>
            <span>
              <IconClockHour4 size={16} aria-hidden="true" /> {T.TODAY_TILE}
            </span>
          </button>
          )}
        </div>
        {(shownExits.length > 0 || viewSwitch) && (
          <div className="pchips">
            {viewSwitch}
            {shownExits.length > 0 && (
              <span className="pchips-exits" role="group" aria-label={T.SIDE_EXITS}>
                {exitChips}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pbar">
      <div className="pstages" role="group" aria-label={T.STAGES}>
        {stages.map((s) => {
          const n = counts.get(s.id) ?? 0;
          return (
            <button
              key={s.id}
              type="button"
              className={`pstage${isOn(s.id) ? ' is-on' : ''}${s.builtin === 'joined' ? ' is-joined' : ''}`}
              aria-pressed={pressed(s.id)}
              data-filter-key={s.id}
              aria-label={board ? T.stageJump(s.name, n) : T.stageButton(s.name, n, isOn(s.id))}
              onClick={() => toggle(s.id)}
              {...drop(s.id)}
            >
              <span className="pstage-n">{n}</span>
              <span className="pstage-l">{s.name}</span>
              <span className="pstage-bar" style={{ width: `${Math.max(8, (n / max) * 100)}%` }} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="pchips">
        {viewSwitch}
        {!board && (
          <button type="button" className={`pchip pchip--today${todayOn ? ' is-on' : ''}`} aria-pressed={todayOn} data-filter-key="today" onClick={() => onFilter(todayOn ? { kind: 'all' } : { kind: 'today' })}>
            <IconClockHour4 size={16} aria-hidden="true" />
            {T.chipCount(T.FOLLOW_UP_TODAY, todayCount)}
          </button>
        )}
        {exitChips}
      </div>
    </div>
  );
}
