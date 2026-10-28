// BookingSettings.jsx — the settings of the "Book a class" block (mockup screen 4).
// Why it exists: which classes this form offers, which of their times, how many free-class
// spots each time has, and the booking window ("Show the next … days", "Book at least …
// hours ahead"). The times come from the Schedule in effect today; nothing is pre-chosen.
// These settings take effect RIGHT AWAY, also on a Live form (rulebook v0.242), so — unlike the
// fields, which save as you go and wait for Publish — they have their own Save button and say
// "Changes here go live right away". Closures and full times never show to families.
//
// draft = { offered: [classId], times: { 'classId|weekday|HH:MM': { on, spots } },
//           groups: { 'weekday|HH:MM|id,id': { on, spots } }, daysAhead, minHoursAhead }
// Classes taught together (v0.620): a time of a Schedule slot with 2+ offered classes is listed ONCE,
// under "Taught together", with one spot number for the whole time; it leaves the classes' own lists.
import { IconCheck } from '@tabler/icons-react';
import Notice from '../../components/Notice.jsx';
import { agesLabel, joinAges } from '../../lib/schedule/ages.js';
import * as T from './text.js';

export const timeSlotKey = (classId, weekday, start) => `${classId}|${weekday}|${start}`;
// a combined time: its weekday, start and classes (sorted, so the order of ticking doesn't matter)
export const groupSlotKey = (classIds, weekday, start) => `${weekday}|${start}|${[...classIds].sort().join(',')}`;

export function bookingProblem(draft) {
  const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!intIn(draft.daysAhead, 1, 60) || !intIn(draft.minHoursAhead, 0, 72)) return true;
  return [...Object.values(draft.times), ...Object.values(draft.groups ?? {})].some((t) => t.on && !intIn(t.spots, 1, 20));
}

// groups = [{ key, classIds, weekday, start, end }] (Builder works them out from today's schedule);
// groupDefault(classIds) = the number a combined time starts with; agesOf(classId) = { from, to }.
export default function BookingSettings({ draft, dirty, classes, timesFor, groups = [], groupDefault, agesOf, readOnly, saving, note, idBase, onChange, onSave }) {
  const bad = bookingProblem(draft);
  // What the forms show for a combined time: its classes and their joined ages (v0.620).
  const exampleOf = (classIds) => {
    const names = classIds.map((id) => classes.find((c) => c.id === id)?.name ?? '').join(' + ');
    const a = joinAges(classIds.map((id) => agesOf?.(id) ?? { from: null, to: null }));
    const label = agesLabel(a.from, a.to);
    return label ? `${names} · ${label}` : names;
  };
  // A time with no row of its own yet uses the class's usual number of spots.
  const usual = (classId) => ({ on: true, spots: draft.defaults?.[classId] ?? 3 });
  const setTime = (key, classId, patch) => onChange({ times: { ...draft.times, [key]: { ...(draft.times[key] ?? usual(classId)), ...patch } } });
  const num = (text) => (text === '' ? null : Number(text));
  return (
    <div className="fbookset">
      <p className="fbookset-live">
        <strong>{T.LIVE_RIGHT_AWAY}</strong>
      </p>
      <fieldset className="field cfieldset">
        <legend className="field-label">{T.CLASSES_OFFERED}</legend>
        {classes.length === 0 && <p className="field-hint">{T.NO_CLASSES}</p>}
        {classes.map((c) => (
          <label key={c.id} className="cbox">
            <input
              type="checkbox"
              checked={draft.offered.includes(c.id)}
              disabled={readOnly}
              onChange={(e) => onChange({ offered: e.target.checked ? [...draft.offered, c.id] : draft.offered.filter((x) => x !== c.id) })}
            />
            <span>{c.name}</span>
          </label>
        ))}
      </fieldset>
      {groups.length > 0 && (
        <fieldset className="field cfieldset">
          <legend className="field-label">{T.TOGETHER_TITLE}</legend>
          {groups.map((g) => {
            const names = g.classIds.map((id) => classes.find((c) => c.id === id)?.name ?? '').join(' + ');
            const v = draft.groups?.[g.key] ?? { on: true, spots: groupDefault ? groupDefault(g.classIds) : 3 };
            const setGroup = (patch) => onChange({ groups: { ...(draft.groups ?? {}), [g.key]: { ...v, ...patch } } });
            const label = T.togetherTime(T.weekdayTime(g.weekday, g.start, g.end), names);
            return (
              <div key={g.key} className="fslotrow">
                <label className="cbox">
                  <input type="checkbox" checked={v.on} disabled={readOnly} aria-label={T.offerTime(label)} onChange={(e) => setGroup({ on: e.target.checked })} />
                  <span>{label}</span>
                </label>
                <input
                  className="input fslot-spots"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  aria-label={T.spotsFor(label)}
                  disabled={readOnly || !v.on}
                  value={v.spots ?? ''}
                  onChange={(e) => setGroup({ spots: num(e.target.value) })}
                />
              </div>
            );
          })}
          {/* e.g. "White + Little Tiger · Ages 3–12": what the forms will show for the first combined time */}
          <p className="field-hint">{T.togetherHint(groups.length === 1 ? exampleOf(groups[0].classIds) : '')}</p>
        </fieldset>
      )}
      {draft.offered.map((classId) => {
        const cls = classes.find((c) => c.id === classId);
        if (!cls) return null;
        const times = timesFor(classId);
        return (
          <fieldset key={classId} className="field cfieldset">
            <legend className="field-label">{T.timesAndSpots(cls.name)}</legend>
            {times.length === 0 && <p className="field-hint">{T.NO_TIMES}</p>}
            {times.map((t) => {
              const key = timeSlotKey(classId, t.weekday, t.start);
              const v = draft.times[key] ?? usual(classId);
              const label = T.weekdayTime(t.weekday, t.start, t.end);
              return (
                <div key={key} className="fslotrow">
                  <label className="cbox">
                    <input type="checkbox" checked={v.on} disabled={readOnly} aria-label={T.offerTime(label)} onChange={(e) => setTime(key, classId, { on: e.target.checked })} />
                    <span>{label}</span>
                  </label>
                  <input
                    className="input fslot-spots"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={20}
                    aria-label={T.spotsFor(label)}
                    disabled={readOnly || !v.on}
                    value={v.spots ?? ''}
                    onChange={(e) => setTime(key, classId, { spots: num(e.target.value) })}
                  />
                </div>
              );
            })}
            {times.length > 0 && <p className="field-hint">{T.SPOTS_HINT}</p>}
          </fieldset>
        );
      })}
      <div className="fwindow">
        <div className="field">
          <label htmlFor={`${idBase}-days`}>{T.SHOW_NEXT}</label>
          <span className="fwindow-row">
            <input id={`${idBase}-days`} className="input" type="number" inputMode="numeric" min={1} max={60} disabled={readOnly} value={draft.daysAhead ?? ''} onChange={(e) => onChange({ daysAhead: num(e.target.value) })} />
            {T.DAYS}
          </span>
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-hours`}>{T.BOOK_AHEAD}</label>
          <span className="fwindow-row">
            <input id={`${idBase}-hours`} className="input" type="number" inputMode="numeric" min={0} max={72} disabled={readOnly} value={draft.minHoursAhead ?? ''} onChange={(e) => onChange({ minHoursAhead: num(e.target.value) })} />
            {T.HOURS_AHEAD}
          </span>
        </div>
      </div>
      {bad && <Notice>{T.BOOKING_BAD}</Notice>}
      {note && <Notice>{note}</Notice>}
      {!readOnly && (
        <button
          type="button"
          className={`btn btn-primary fbookset-save${!dirty || bad || saving ? ' is-unavailable' : ''}`}
          aria-disabled={!dirty || bad || saving ? 'true' : undefined}
          onClick={() => dirty && !bad && !saving && onSave()}
        >
          <IconCheck size={16} aria-hidden="true" />
          {saving ? T.SAVING : T.SAVE_BOOKING}
        </button>
      )}
    </div>
  );
}
