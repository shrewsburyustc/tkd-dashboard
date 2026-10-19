// PipelineBar.jsx — the stage counts, the chips and search above the list (mockup screens 1, 2).
// Why it exists: one look at how many children are at each stage of this school.
//   - PC / tablet: the stages side by side (count, name, a bar); Joined's bar is green. Below:
//     the amber "Follow up today" chip, the side exits (No-show, Not interested, …) and search.
//   - Phone: the stages as tiles plus a "Today" tile, then the side-exit chips (only those with
//     someone in them) and search.
// Click a stage (or chip) to show only those; click it again for everyone. The List opens on
// "Follow up today".
// List / Board switch (v0.214) first in the chips row. On the Board:
//   - a stage in the bar jumps to its column (PC / tablet); a phone stage tile picks the one
//     column shown
//   - the stages and tiles are also places to drop a dragged card (data-drop-status)
//   - the Board always shows everyone, so "Follow up today" (chip / Today tile) is only in the List
//     (Prospects difference C); a side-exit chip shows those children in the List
import { IconClockHour4, IconLayoutKanban, IconList, IconSearch, IconX } from '@tabler/icons-react';
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

export default function PipelineBar({
  idBase, code, stages, exits, counts, todayCount, filter, isPhone, search, showSearch = true, onFilter, onSearch,
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

  const searchBox = showSearch && (
    <label className="psearch">
      <IconSearch size={16} aria-hidden="true" />
      <span className="visually-hidden">{T.SEARCH_LABEL}</span>
      <input id={`${idBase}-search`} type="search" className="psearch-input" placeholder={T.SEARCH} value={search} maxLength={80} onChange={(e) => onSearch(e.target.value)} />
      {search && (
        <button type="button" className="psearch-clear" aria-label={T.CLEAR_SEARCH} onClick={() => onSearch('')}>
          <IconX size={14} aria-hidden="true" />
        </button>
      )}
    </label>
  );

  // phone: a side exit with nobody in it is hidden, so the row fits (difference F) — unless it is
  // the one being shown
  const shownExits = isPhone ? exits.filter((s) => (counts.get(s.id) ?? 0) > 0 || isOn(s.id)) : exits;
  const exitChips = shownExits.map((s) => (
    <button key={s.id} type="button" className={`pchip${isOn(s.id) ? ' is-on' : ''}`} aria-pressed={isOn(s.id)} onClick={() => toggle(s.id)}>
      {T.chipCount(s.name, counts.get(s.id) ?? 0)}
    </button>
  ));

  if (isPhone) {
    return (
      <div className="pbar pbar--phone">
        <div className="ptiles" role="group" aria-label={T.STAGES}>
          {stages.map((s) => (
            <button key={s.id} type="button" className={`ptile${isOn(s.id) ? ' is-on' : ''}`} aria-pressed={isOn(s.id)} aria-label={T.stageButton(s.name, counts.get(s.id) ?? 0, isOn(s.id))} onClick={() => toggle(s.id)} {...drop(s.id)}>
              <b>{counts.get(s.id) ?? 0}</b>
              <span>{s.name}</span>
            </button>
          ))}
          {!board && (
          <button type="button" className={`ptile ptile--today${todayOn ? ' is-on' : ''}`} aria-pressed={todayOn} onClick={() => onFilter(todayOn ? { kind: 'all' } : { kind: 'today' })}>
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
        {searchBox}
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
          <button type="button" className={`pchip pchip--today${todayOn ? ' is-on' : ''}`} aria-pressed={todayOn} onClick={() => onFilter(todayOn ? { kind: 'all' } : { kind: 'today' })}>
            <IconClockHour4 size={16} aria-hidden="true" />
            {T.chipCount(T.FOLLOW_UP_TODAY, todayCount)}
          </button>
        )}
        {exitChips}
        <span className="pchips-gap" />
        {searchBox}
      </div>
    </div>
  );
}
