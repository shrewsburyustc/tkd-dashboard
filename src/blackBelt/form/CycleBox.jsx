// CycleBox.jsx — the box at the top of the Black Belt family form (Form 1, 8).
// Why it exists: rulebook v0.211 / mockup Form 1 — the cycle's name, one line per testing day
// ("Physical · Sat, Apr 3 · Worcester": the day's name, date and place only — times are in the
// requirements panel and on the Registered page, so the box stays short), and
// "Apply by Saturday, March 27" (Application due) while registration is open.
// The can't-register screens (Form 8) show the same box without the Apply-by line.
import { longDay, placeShort, shortDay } from './format.js';
import * as T from './text.js';

export default function CycleBox({ cycle, showApplyBy }) {
  if (!cycle) return null;
  const title = T.cycleTitle(cycle.name);
  return (
    <section className="bbf-hero" aria-label={title}>
      <h1 className="bbf-hero__title">{title}</h1>
      <ul className="bbf-hero__days">
        {(cycle.days ?? []).map((day, i) => (
          <li key={`${day.day_date}-${i}`}>
            {day.name} · {shortDay(day.day_date)} · {placeShort(day.place)}
          </li>
        ))}
      </ul>
      {showApplyBy && cycle.application_due ? (
        <div className="bbf-hero__by">{T.applyBy(longDay(cycle.application_due))}</div>
      ) : null}
    </section>
  );
}
