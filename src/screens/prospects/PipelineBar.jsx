// PipelineBar.jsx — the stage counts, the chips and search above the list (mockup screens 1, 2).
// Why it exists: one look at how many children are at each stage of this school.
//   - PC / tablet: the stages side by side (count, name, a bar); Joined's bar is green. Below:
//     the amber "Follow up today" chip, the side exits (No-show, Not interested, …) and search.
//   - Phone: the stages as tiles plus a "Today" tile, then the side-exit chips and search.
// Click a stage (or chip) to show only those; click it again for everyone. The screen opens on
// "Follow up today".
import { IconClockHour4, IconSearch, IconX } from '@tabler/icons-react';
import * as T from './text.js';

export default function PipelineBar({ idBase, stages, exits, counts, todayCount, filter, isPhone, search, showSearch = true, onFilter, onSearch }) {
  const max = Math.max(1, ...stages.map((s) => counts.get(s.id) ?? 0));
  const isOn = (id) => filter.kind === 'status' && filter.id === id;
  const toggle = (id) => onFilter(isOn(id) ? { kind: 'all' } : { kind: 'status', id });
  const todayOn = filter.kind === 'today';

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

  const exitChips = exits.map((s) => (
    <button key={s.id} type="button" className={`pchip${isOn(s.id) ? ' is-on' : ''}`} aria-pressed={isOn(s.id)} onClick={() => toggle(s.id)}>
      {T.chipCount(s.name, counts.get(s.id) ?? 0)}
    </button>
  ));

  if (isPhone) {
    return (
      <div className="pbar pbar--phone">
        <div className="ptiles" role="group" aria-label={T.STAGES}>
          {stages.map((s) => (
            <button key={s.id} type="button" className={`ptile${isOn(s.id) ? ' is-on' : ''}`} aria-pressed={isOn(s.id)} aria-label={T.stageButton(s.name, counts.get(s.id) ?? 0, isOn(s.id))} onClick={() => toggle(s.id)}>
              <b>{counts.get(s.id) ?? 0}</b>
              <span>{s.name}</span>
            </button>
          ))}
          <button type="button" className={`ptile ptile--today${todayOn ? ' is-on' : ''}`} aria-pressed={todayOn} onClick={() => onFilter(todayOn ? { kind: 'all' } : { kind: 'today' })}>
            <b>{todayCount}</b>
            <span>
              <IconClockHour4 size={16} aria-hidden="true" /> {T.TODAY_TILE}
            </span>
          </button>
        </div>
        {exits.length > 0 && (
          <div className="pchips" role="group" aria-label={T.SIDE_EXITS}>
            {exitChips}
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
              aria-pressed={isOn(s.id)}
              aria-label={T.stageButton(s.name, n, isOn(s.id))}
              onClick={() => toggle(s.id)}
            >
              <span className="pstage-n">{n}</span>
              <span className="pstage-l">{s.name}</span>
              <span className="pstage-bar" style={{ width: `${Math.max(8, (n / max) * 100)}%` }} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="pchips">
        <button type="button" className={`pchip pchip--today${todayOn ? ' is-on' : ''}`} aria-pressed={todayOn} onClick={() => onFilter(todayOn ? { kind: 'all' } : { kind: 'today' })}>
          <IconClockHour4 size={16} aria-hidden="true" />
          {T.chipCount(T.FOLLOW_UP_TODAY, todayCount)}
        </button>
        {exitChips}
        <span className="pchips-gap" />
        {searchBox}
      </div>
    </div>
  );
}
