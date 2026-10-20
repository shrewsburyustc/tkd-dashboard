// RequirementsPanel.jsx — "What 1st Dan is tested on" (mockup Form 3, rulebook v0.216, B8
// compact A; contract 0016-B1 §4.5).
// Why it exists: families see what the chosen Dan is tested on, from the cycle's own
// requirements sheet and testing days (the same data grading uses, so it can't disagree):
//   Level 1  one row per testing part ("1 · Physical", its day(s) and place, how many events or
//            subjects), Other requirements (what is handed in, by the Submissions due date),
//            Extra points, and the pass rule.
//   Level 2  one part: when and where, each subject with its credits ("Outdoor:" before an
//            outdoor subject, "Adults only", a note under its name), and the part's maximum.
//   Level 3  + / − opens one subject in place: the cut-offs per age group, or the points for
//            each grade.
// It is shown inside Panel.jsx (full screen on phones, a dialog on tablets and PCs).
//
// RequirementsPrint (below) draws the SAME content with every level opened, for the printout of
// the Registered page (Form 7: "the printout adds the chosen Dan's requirements").
//
// Everything is drawn as React text (no innerHTML), so nothing in the sheet can run as code.
import { useState } from 'react';
import Panel from './Panel.jsx';
import { Icon } from './parts.jsx';
import { handInList, num, placeMedium, placeShort, secondPlaceDiffers, shortDay, timeLabel, timeRange } from './format.js';
import * as T from './text.js';

const TESTING_PARTS = ['physical', 'technical', 'curriculum'];

// The chosen Dan's sheet and the parts in the order they are drawn (testing parts numbered
// 1, 2, 3 …; the "other" part — Other requirements — after them).
function sheetFor(cycle, dan) {
  const requirements = cycle?.requirements ?? {};
  const sheet = (requirements.dans ?? []).find((d) => d?.dan === dan) ?? null;
  const parts = Array.isArray(sheet?.parts) ? sheet.parts : [];
  const days = cycle?.days ?? [];
  const testing = parts
    .filter((p) => TESTING_PARTS.includes(p.code))
    .map((part, i) => ({ part, number: i + 1, days: days.filter((d) => (d.parts ?? []).includes(part.code)) }));
  const other = parts.find((p) => p.code === 'other') ?? null;
  return { sheet, testing, other, scales: requirements.grade_scales ?? {} };
}

const subjectsOf = (part) => (Array.isArray(part?.subjects) ? part.subjects : []);
const allByAge = (part) => subjectsOf(part).length > 0 && subjectsOf(part).every((s) => s?.scoring?.kind === 'table');

// Level 1, the line under a part's name: "Sat, Apr 3 · Worcester + Horgan Arena (outdoor)".
function daysShortLine(days) {
  return days
    .map((d) => `${shortDay(d.day_date)} · ${placeShort(d.place)}${secondPlaceDiffers(d) ? T.plusOutdoor(placeShort(d.second.place)) : ''}`)
    .join('; ');
}

// Level 2, the part's first line: "Sat, Apr 3 · 12:30 PM, Worcester school; outdoor part 2:30 PM,
// Horgan Arena. Each event graded A+ to D by age group."
function daysLongLine(part, days) {
  const when = days
    .map((d) => {
      const time = d.second ? timeLabel(d.start_time) : timeRange(d.start_time, d.end_time);
      const outdoor = d.second ? T.outdoorPartAt(timeLabel(d.second.start_time), placeMedium(d.second.place)) : '';
      return `${shortDay(d.day_date)} · ${time}, ${placeMedium(d.place)}${outdoor}`;
    })
    .join('; ');
  const each = allByAge(part) ? T.EACH_EVENT_BY_AGE : T.EACH_SUBJECT;
  return when ? `${when}.${each}` : each.trim();
}

// "Physical: up to 80 points." / "Curriculum: up to 135 points (157.5 for adults, with One Step Sparring)."
function maxLine(part) {
  if (typeof part.max_points_adult === 'number') {
    const adultOnly = subjectsOf(part)
      .filter((s) => s.adults_only)
      .map((s) => s.name.replace(/\s*\([^)]*\)\s*$/, ''))
      .join(' and ');
    return T.upToPointsAdult(part.name, num(part.max_points), num(part.max_points_adult), adultOnly);
  }
  return T.upToPoints(part.name, num(part.max_points));
}

// "Hand in by Sat, May 29: egg test, meditation, appreciation letter, TKD project"
function handInLine(cycle, sheet) {
  const list = handInList(sheet);
  if (!list) return '';
  return cycle?.submissions_due ? T.handInBy(shortDay(cycle.submissions_due), list) : list;
}

// ----- Pieces -----

function PassRule({ sheet }) {
  const rule = sheet?.pass_rule;
  if (!rule || typeof rule.points !== 'number') return null;
  const [points, pointsWord] = T.passPoints(num(rule.points));
  return (
    <div className="bbf-pass">
      {T.PASS_TO}
      <b>{points}</b>
      {pointsWord}
      {typeof rule.points_adult === 'number'
        ? T.passAdult(num(rule.points_adult)).map((piece, i) => (i === 1 ? <b key={i}>{piece}</b> : piece))
        : null}
      {rule.no_d ? T.PASS_NO_D : T.PASS_END}
      {sheet?.extra_points?.counts_toward_total ? T.EXTRA_COUNT : null}
    </div>
  );
}

// "A+ 4 · A 3.5 · B+ 3 · B 2.5 · C 2 · D 0"
const scaleText = (scale) =>
  Object.entries(scale ?? {})
    .map(([grade, points]) => `${grade} ${num(points)}`)
    .join(' · ');

// Level 3: how one subject is graded.
function Scoring({ subject, part, scales }) {
  const scoring = subject?.scoring ?? {};
  if (scoring.kind === 'table') {
    const groups = Array.isArray(scoring.groups) ? scoring.groups : [];
    const grades = (groups[0]?.cutoffs ?? []).map((c) => c.grade);
    const meet = scoring.direction === 'at_most' ? T.MEET_AT_MOST : scoring.direction === 'under' ? T.MEET_UNDER : T.MEET_AT_LEAST;
    const unit = scoring.unit && scoring.unit !== 'count' ? T.measuredIn(scoring.unit) : '';
    const scale = scales?.[part.code];
    return (
      <div className="bbf-score">
        <p className="bbf-score__text">
          {unit}
          {meet}
        </p>
        <div className="bbf-tablewrap">
          <table className="bbf-grid">
            <thead>
              <tr>
                <th scope="col">{T.AGE}</th>
                {grades.map((g) => (
                  <th scope="col" key={g}>
                    {g}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group, i) => (
                <tr key={i}>
                  <th scope="row">{group?.ages?.label ?? ''}</th>
                  {grades.map((g) => (
                    <td key={g}>{num((group.cutoffs ?? []).find((c) => c.grade === g)?.value ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="bbf-score__text">
          {scale ? T.pointsLine(num(subject.credits), scaleText(scale)) : T.pointsLinePlain(scaleText(scoring.points))}
        </p>
      </div>
    );
  }
  // 'grades': the examiner gives a grade; each grade is worth some points.
  const entries = Object.entries(scoring.points ?? {});
  return (
    <div className="bbf-score">
      <p className="bbf-score__text">{T.GRADED_BY_EXAMINER}</p>
      <div className="bbf-tablewrap">
        <table className="bbf-grid">
          <tbody>
            <tr>
              <th scope="row">{T.GRADE}</th>
              {entries.map(([grade]) => (
                <td key={grade}>{grade}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">{T.POINTS}</th>
              {entries.map(([grade, points]) => (
                <td key={grade}>{num(points)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="bbf-score__text">{T.D_MAKEUP}</p>
    </div>
  );
}

// The name side of a subject row: "Outdoor: Sprint 100 m", a note and "Adults only" under it.
function SubjectName({ subject }) {
  const note = subject.note ?? subject.scoring?.note ?? null;
  return (
    <span className="bbf-subj__name">
      <span>
        {subject.outdoor ? T.OUTDOOR_PREFIX : ''}
        {subject.name}
      </span>
      {note ? <span className="bbf-subj__note">{note}</span> : null}
      {subject.adults_only ? <span className="bbf-subj__note">{T.ADULTS_ONLY}</span> : null}
    </span>
  );
}

// Level 2's subject list. `opened` = the set of open subject indexes; `printAll` opens every one
// and draws no buttons.
function SubjectList({ part, scales, opened, onToggle, printAll, idPrefix }) {
  return (
    <ul className="bbf-subjs">
      {subjectsOf(part).map((subject, i) => {
        const open = printAll || opened.has(i);
        const moreId = `${idPrefix}-${i}`;
        return (
          <li key={i} className="bbf-subj">
            {printAll ? (
              <div className="bbf-subj__row">
                <SubjectName subject={subject} />
                <span className="bbf-subj__credits">{T.creditsCount(subject.credits)}</span>
              </div>
            ) : (
              <button
                type="button"
                className="bbf-subj__row bbf-subj__btn"
                aria-expanded={open}
                aria-controls={moreId}
                aria-label={`${open ? T.closeSubject(subject.name) : T.openSubject(subject.name)}, ${T.creditsCount(subject.credits)}`}
                onClick={() => onToggle(i)}
              >
                <SubjectName subject={subject} />
                <span className="bbf-subj__credits">{T.creditsCount(subject.credits)}</span>
                <span className="bbf-subj__toggle">
                  <Icon name={open ? 'minus' : 'plus'} />
                </span>
              </button>
            )}
            {open ? (
              <div id={moreId} className="bbf-subj__more">
                <Scoring subject={subject} part={part} scales={scales} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// "1 point each" / "5 points with 5 or more" / "320 classes → 3 · 375 → 5 · 400 → 10 points" /
// "1 → 3 · 2 → 5 · 3 → 7 · 4 → 10 · 5 or more → 15 points" (a run of counts 1, 2, 3 … ends "or more").
function extraRuleText(item) {
  const unit = /\(([^)]+)\)\s*$/.exec(item?.name ?? '')?.[1] ?? null;
  const rule = item?.rule ?? {};
  if (rule.kind === 'per_count') return T.pointEach(rule.points_each);
  if (rule.kind === 'steps' && Array.isArray(rule.steps) && rule.steps.length > 0) {
    const steps = rule.steps;
    if (steps.length === 1) return T.pointsWith(num(steps[0].points), `${num(steps[0].at_least)}${unit ? ` ${unit}` : ''}`);
    const consecutive = steps.every((s, i) => i === 0 || s.at_least === steps[i - 1].at_least + 1);
    const parts = steps.map((s, i) => {
      let left = num(s.at_least);
      if (i === 0 && unit) left += ` ${unit}`;
      if (i === steps.length - 1 && consecutive) left += T.OR_MORE;
      return `${left} ${T.ARROW} ${num(s.points)}`;
    });
    return parts.join(' · ') + T.POINTS_WORD;
  }
  return '';
}
const extraName = (item) => String(item?.name ?? '').replace(/\s*\([^)]*\)\s*$/, '');

function ExtraList({ sheet }) {
  const items = Array.isArray(sheet?.extra_points?.items) ? sheet.extra_points.items : [];
  return (
    <ul className="bbf-extras">
      {items.map((item, i) => (
        <li key={i} className="bbf-extra">
          <span>{extraName(item)}</span>
          <span className="bbf-subj__note">{extraRuleText(item)}</span>
        </li>
      ))}
    </ul>
  );
}

// Level 1: the list of parts.
function PartsList({ cycle, data, onOpen }) {
  const { sheet, testing, other } = data;
  return (
    <>
      <ul className="bbf-parts">
        {testing.map(({ part, number, days }, i) => (
          <li key={part.code}>
            <button type="button" className="bbf-partrow" onClick={() => onOpen({ view: 'part', index: i })}>
              <span className="bbf-partrow__text">
                <span className="bbf-partrow__title">{T.partTitle(number, part.name)}</span>
                {days.length ? <span className="bbf-partrow__line">{daysShortLine(days)}</span> : null}
                <span className="bbf-partrow__line">
                  {allByAge(part) ? T.eventsByAge(subjectsOf(part).length) : T.subjectsCount(subjectsOf(part).length)}
                </span>
              </span>
              <Icon name="chevronRight" />
            </button>
          </li>
        ))}
        {other ? (
          <li>
            <button type="button" className="bbf-partrow" onClick={() => onOpen({ view: 'other' })}>
              <span className="bbf-partrow__text">
                <span className="bbf-partrow__title">{other.name}</span>
                {handInLine(cycle, sheet) ? <span className="bbf-partrow__line">{handInLine(cycle, sheet)}</span> : null}
                <span className="bbf-partrow__line">{T.itemsCount(subjectsOf(other).length)}</span>
              </span>
              <Icon name="chevronRight" />
            </button>
          </li>
        ) : null}
        {sheet?.extra_points ? (
          <li>
            <button type="button" className="bbf-partrow" onClick={() => onOpen({ view: 'extra' })}>
              <span className="bbf-partrow__text">
                <span className="bbf-partrow__title">{T.EXTRA_POINTS}</span>
                <span className="bbf-partrow__line">{T.EXTRA_POINTS_LINE}</span>
              </span>
              <Icon name="chevronRight" />
            </button>
          </li>
        ) : null}
      </ul>
      <PassRule sheet={sheet} />
    </>
  );
}

// One part's level 2 content (also used, fully opened, for the printout).
function PartDetail({ part, days, scales, opened, onToggle, printAll, idPrefix }) {
  return (
    <>
      <p className="bbf-panel__intro">{daysLongLine(part, days)}</p>
      <SubjectList part={part} scales={scales} opened={opened} onToggle={onToggle} printAll={printAll} idPrefix={idPrefix} />
      {typeof part.max_points === 'number' ? <p className="bbf-panel__foot">{maxLine(part)}</p> : null}
    </>
  );
}

function OtherDetail({ cycle, data, opened, onToggle, printAll }) {
  const { sheet, other, scales } = data;
  const line = handInLine(cycle, sheet);
  return (
    <>
      <p className="bbf-panel__intro">{line ? `${line}.${T.EACH_ITEM}` : T.EACH_ITEM.trim()}</p>
      <SubjectList part={other} scales={scales} opened={opened} onToggle={onToggle} printAll={printAll} idPrefix="bbf-other" />
      {typeof other.max_points === 'number' ? <p className="bbf-panel__foot">{maxLine(other)}</p> : null}
    </>
  );
}

function ExtraDetail({ data, dan }) {
  const extra = data.sheet?.extra_points ?? {};
  return (
    <>
      <p className="bbf-panel__intro">{T.extraIntro(T.DAN[dan], extra.limit !== null && extra.limit !== undefined)}</p>
      <ExtraList sheet={data.sheet} />
    </>
  );
}

// ----- The panel -----

export default function RequirementsPanel({ cycle, dan, onClose }) {
  const data = sheetFor(cycle, dan);
  const [level, setLevel] = useState({ view: 'parts' });
  const [opened, setOpened] = useState(() => new Set());

  const open = (next) => {
    setOpened(new Set());
    setLevel(next);
  };
  const toggle = (i) =>
    setOpened((set) => {
      const next = new Set(set);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const back = () => open({ view: 'parts' });

  let title = T.whatDanTested(T.DAN[dan]);
  let content = <PartsList cycle={cycle} data={data} onOpen={open} />;
  let levelKey = 'parts';
  if (level.view === 'part' && data.testing[level.index]) {
    const { part, number, days } = data.testing[level.index];
    title = T.partTitle(number, part.name);
    levelKey = `part-${level.index}`;
    content = <PartDetail part={part} days={days} scales={data.scales} opened={opened} onToggle={toggle} idPrefix={`bbf-part-${level.index}`} />;
  } else if (level.view === 'other' && data.other) {
    title = data.other.name;
    levelKey = 'other';
    content = <OtherDetail cycle={cycle} data={data} opened={opened} onToggle={toggle} />;
  } else if (level.view === 'extra') {
    title = T.EXTRA_POINTS;
    levelKey = 'extra';
    content = <ExtraDetail data={data} dan={dan} />;
  }

  return (
    <Panel title={title} levelKey={levelKey} onBack={levelKey === 'parts' ? null : back} onClose={onClose}>
      {content}
    </Panel>
  );
}

// The printout's copy: every part, subject and scoring opened (Form 7, print).
export function RequirementsPrint({ cycle, dan }) {
  const data = sheetFor(cycle, dan);
  if (!data.sheet) return null;
  const none = new Set();
  return (
    <section className="bbf-print-only bbf-printreq">
      <h2 className="bbf-card__title">{T.whatDanTested(T.DAN[dan])}</h2>
      <PassRule sheet={data.sheet} />
      {data.testing.map(({ part, number, days }) => (
        <div key={part.code} className="bbf-printreq__part">
          <h3 className="bbf-printreq__title">{T.partTitle(number, part.name)}</h3>
          <PartDetail part={part} days={days} scales={data.scales} opened={none} onToggle={() => {}} printAll idPrefix={`bbf-print-${part.code}`} />
        </div>
      ))}
      {data.other ? (
        <div className="bbf-printreq__part">
          <h3 className="bbf-printreq__title">{data.other.name}</h3>
          <OtherDetail cycle={cycle} data={data} opened={none} onToggle={() => {}} printAll />
        </div>
      ) : null}
      {data.sheet.extra_points ? (
        <div className="bbf-printreq__part">
          <h3 className="bbf-printreq__title">{T.EXTRA_POINTS}</h3>
          <ExtraDetail data={data} dan={dan} />
        </div>
      ) : null}
    </section>
  );
}
