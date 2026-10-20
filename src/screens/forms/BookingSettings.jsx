// BookingSettings.jsx — the settings of the "Book a class" block (mockup screen 4).
// Why it exists: which classes this form offers, which of their times, how many free-class
// spots each time has, and the booking window ("Show the next … days", "Book at least …
// hours ahead"). The times come from the Schedule in effect today; nothing is pre-chosen.
// These settings take effect RIGHT AWAY, also on a Live form (rulebook v0.242), so — unlike the
// fields, which save as you go and wait for Publish — they have their own Save button and say
// "Changes here go live right away". Closures and full times never show to families.
//
// draft = { offered: [classId], times: { 'classId|weekday|HH:MM': { on, spots } }, daysAhead, minHoursAhead }
import { IconCheck } from '@tabler/icons-react';
import Notice from '../../components/Notice.jsx';
import * as T from './text.js';

export const timeSlotKey = (classId, weekday, start) => `${classId}|${weekday}|${start}`;

export function bookingProblem(draft) {
  const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!intIn(draft.daysAhead, 1, 60) || !intIn(draft.minHoursAhead, 0, 72)) return true;
  return Object.values(draft.times).some((t) => t.on && !intIn(t.spots, 1, 20));
}

export default function BookingSettings({ draft, dirty, classes, timesFor, readOnly, saving, note, idBase, onChange, onSave }) {
  const bad = bookingProblem(draft);
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
