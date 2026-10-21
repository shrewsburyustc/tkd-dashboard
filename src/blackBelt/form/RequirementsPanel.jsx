// RequirementsPanel.jsx — "What 1st Dan is tested on" (mockup Form 3, rulebook v0.919, B8
// compact A; contract 0016-B1 §4.5; rubric v2 since migration 0024, contract 0024 §10.4).
// Why it exists: families see what the chosen Dan is tested on, from the cycle's own rubric and
// testing days (the same data grading uses, so it can't disagree):
//   Level 1  one row per testing part ("1 · Physical", its day(s) and place, how many events or
//            subjects), Other requirements (what is handed in, by the Submissions due date),
//            Extra points, and the pass rule — one pass mark per age bracket ("17 and under 275
//            points · 18 and over 293 points"), the no-D rule and the make-up sentence.
//   Level 2  one part: when and where, each subject with its credits ("Outdoor:" before an
//            outdoor subject, "Only 18 and over", a note under its name), and the part's maximum
//            per bracket ("Curriculum: up to 135 points (157.5 for 18 and over).").
//   Level 3  + / − opens one subject in place: the cut-offs per age bracket — one table per way
//            for a subject done two ways ("Pull-up · reps, at least", "Hold · seconds, at least")
//            — and the points for each grade.
// Every number comes from the stored rubric: a subject's points are its stored `points` (worked
// out or its own, rubric v0.924) — never recomputed here. (This fixes the live bug where 4th Dan
// Target kick B showed credits × 2.5 = 10 instead of its own 9.)
// It is shown inside Panel.jsx (full screen on phones, a dialog on tablets and PCs).
// The cycle's `requirements` is null until the cycle's registration first opens (0024 §7): then
// there is nothing to show.
//
// RequirementsPrint (below) draws the SAME content with every level opened, for the printout of
// the Registered page (Form 7: "the printout adds the chosen Dan's requirements").
//
// Everything is drawn as React text (no innerHTML), so nothing in the rubric can run as code.
import { useState } from 'react';
import { bracketLabel, CUTOFF_LETTERS, partMaxByBracket, subjectLetters } from '../../lib/blackBelt/rubric.js';
import Panel from './Panel.jsx';
import { Icon } from './parts.jsx';
import { handInList, num, placeMedium, placeShort, secondPlaceDiffers, shortDay, timeLabel, timeRange } from './format.js';
import * as T from './text.js';

const TESTING_PARTS = ['physical', 'technical', 'curriculum'];

// The chosen Dan's rubric and the parts in the order they are drawn (testing parts numbered
// 1, 2, 3 …; the "other" part — Other requirements — after them).
function sheetFor(cycle, dan) {
  const requirements = cycle?.requirements ?? null;
  const sheet = requirements?.schema_version === 2 ? (requirements.dans ?? []).find((d) => d?.dan === dan) ?? null : null;
  const parts = Array.isArray(sheet?.parts) ? sheet.parts : [];
  const days = cycle?.days ?? [];
  const testing = parts
    .filter((p) => TESTING_PARTS.includes(p.code))
    .map((part, i) => ({ part, number: i + 1, days: days.filter((d) => (d.parts ?? []).includes(part.code)) }));
  const other = parts.find((p) => p.code === 'other') ?? null;
  return { sheet, testing, other };
}

const subjectsOf = (part) => (Array.isArray(part?.subjects) ? part.subjects : []);
const allByAge = (part) => subjectsOf(part).length > 0 && subjectsOf(part).every((s) => s?.scoring === 'measured');

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

// "Physical: up to 80 points." / "Curriculum: up to 135 points (157.5 for 18 and over)."
function maxLine(sheet, part) {
  const groups = partMaxByBracket(sheet, part);
  if (groups.length <= 1) return T.upToPoints(part.name, num(groups[0]?.max ?? 0));
  const [first, ...rest] = groups;
  return T.upToPointsBrackets(part.name, num(first.max), rest.map((g) => T.forBrackets(num(g.max), g.brackets.map(bracketLabel).join(', '))).join('; '));
}

// "Hand in by Sat, May 29: egg test, meditation, appreciation letter, TKD project"
function handInLine(cycle, sheet) {
  const list = handInList(sheet);
  if (!list) return '';
  return cycle?.submissions_due ? T.handInBy(shortDay(cycle.submissions_due), list) : list;
}

// ----- Pieces -----

// "To pass: 17 and under 275 points · 18 and over 293 points, and no D in any subject." + the
// make-up sentence (its own line) + "Extra points count toward the total."
function PassRule({ sheet }) {
  const pass = sheet?.pass;
  const brackets = Array.isArray(pass?.brackets) ? pass.brackets : [];
  if (brackets.length === 0) return null;
  const marks =
    brackets.length === 1
      ? T.passPoints(num(brackets[0].pass_mark)).map((piece, i) => (i === 0 ? <b key={i}>{piece}</b> : piece))
      : brackets.map((b, k) => (
          <span key={k}>
            {k > 0 ? T.PASS_BRACKET_JOIN : null}
            {T.passBracket(bracketLabel(b), num(b.pass_mark)).map((piece, i) => (i === 1 ? <b key={i}>{piece}</b> : piece))}
          </span>
        ));
  return (
    <div className="bbf-pass">
      {T.PASS_TO}
      {marks}
      {pass.no_d ? T.PASS_NO_D_ONLY : T.PASS_END}
      {pass.makeup ? ` ${pass.makeup}` : null}
      {sheet?.extra_points?.counts_toward_total ? T.EXTRA_COUNT : null}
    </div>
  );
}

// "A+ 8 · A 7 · B+ 6 · B 5 · C 4 · D 0" — a subject's stored points, in letter order.
const pointsText = (letters, points) => letters.map((l) => `${l} ${num(points?.[l])}`).join(' · ');

// One way's cut-offs: "Meet the number …" and a table of age brackets × A+ A B+ B C.
function WayTable({ way, showHeading }) {
  const meet = way.direction === 'at_most' ? T.MEET_AT_MOST : way.direction === 'under' ? T.MEET_UNDER : T.MEET_AT_LEAST;
  const unit = way.unit && way.unit !== 'count' ? T.measuredIn(way.unit) : '';
  const brackets = Array.isArray(way.brackets) ? way.brackets : [];
  return (
    <>
      {showHeading ? <p className="bbf-score__way">{T.wayHeading(way.name, way.unit, way.direction)}</p> : null}
      <p className="bbf-score__text">
        {showHeading ? '' : unit}
        {meet}
      </p>
      <div className="bbf-tablewrap">
        <table className="bbf-grid">
          <thead>
            <tr>
              <th scope="col">{T.AGE}</th>
              {CUTOFF_LETTERS.map((g) => (
                <th scope="col" key={g}>
                  {g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {brackets.map((b, i) => (
              <tr key={i}>
                <th scope="row">{bracketLabel(b)}</th>
                {CUTOFF_LETTERS.map((g) => (
                  <td key={g}>{num(b.cutoffs?.[g])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Level 3: how one subject is graded.
function Scoring({ subject, part }) {
  const letters = subjectLetters(part.code, subject?.scoring);
  if (subject?.scoring === 'measured') {
    const ways = Array.isArray(subject.ways) ? subject.ways : [];
    const two = ways.length > 1;
    return (
      <div className="bbf-score">
        {two ? <p className="bbf-score__text">{T.ONE_OF_TWO_WAYS}</p> : null}
        {ways.map((way, i) => (
          <WayTable key={i} way={way} showHeading={two || Boolean(way.name)} />
        ))}
        <p className="bbf-score__text">{T.pointsLinePlain(pointsText(letters, subject.points))}</p>
      </div>
    );
  }
  // graded: the examiner gives a grade; each grade is worth the subject's stored points.
  return (
    <div className="bbf-score">
      <p className="bbf-score__text">{T.GRADED_BY_EXAMINER}</p>
      <div className="bbf-tablewrap">
        <table className="bbf-grid">
          <tbody>
            <tr>
              <th scope="row">{T.GRADE}</th>
              {letters.map((grade) => (
                <td key={grade}>{grade}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">{T.POINTS}</th>
              {letters.map((grade) => (
                <td key={grade}>{num(subject.points?.[grade])}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="bbf-score__text">{T.D_MAKEUP}</p>
    </div>
  );
}

// The name side of a subject row: "Outdoor: Sprint 100 m", a note and "Only 18 and over" under it.
function SubjectName({ subject }) {
  const only = Array.isArray(subject.limited_to) ? T.onlyFor(subject.limited_to.map(bracketLabel).join(', ')) : null;
  return (
    <span className="bbf-subj__name">
      <span>
        {subject.outdoor ? T.OUTDOOR_PREFIX : ''}
        {subject.name}
      </span>
      {subject.note ? <span className="bbf-subj__note">{subject.note}</span> : null}
      {only ? <span className="bbf-subj__note">{only}</span> : null}
    </span>
  );
}

// Level 2's subject list. `opened` = the set of open subject indexes; `printAll` opens every one
// and draws no buttons.
function SubjectList({ part, opened, onToggle, printAll, idPrefix }) {
  return (
    <ul className="bbf-subjs">
      {subjectsOf(part).map((subject, i) => {
        const open = printAll || opened.has(i);
        const moreId = `${idPrefix}-${i}`;
        return (
          <li key={subject.id ?? i} className="bbf-subj">
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
                <Scoring subject={subject} part={part} />
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
function PartDetail({ sheet, part, days, opened, onToggle, printAll, idPrefix }) {
  return (
    <>
      <p className="bbf-panel__intro">{daysLongLine(part, days)}</p>
      <SubjectList part={part} opened={opened} onToggle={onToggle} printAll={printAll} idPrefix={idPrefix} />
      <p className="bbf-panel__foot">{maxLine(sheet, part)}</p>
    </>
  );
}

function OtherDetail({ cycle, data, opened, onToggle, printAll }) {
  const { sheet, other } = data;
  const line = handInLine(cycle, sheet);
  return (
    <>
      <p className="bbf-panel__intro">{line ? `${line}.${T.EACH_ITEM}` : T.EACH_ITEM.trim()}</p>
      <SubjectList part={other} opened={opened} onToggle={onToggle} printAll={printAll} idPrefix="bbf-other" />
      <p className="bbf-panel__foot">{maxLine(sheet, other)}</p>
    </>
  );
}

function ExtraDetail({ data, dan }) {
  const extra = data.sheet?.extra_points ?? {};
  const hasLimit = typeof extra.limit === 'number';
  return (
    <>
      <p className="bbf-panel__intro">
        {extra.counts_toward_total === false ? T.EXTRA_NOT_COUNTED : T.extraIntro(T.DAN[dan], hasLimit)}
        {hasLimit ? T.extraLimit(num(extra.limit)) : null}
      </p>
      {extra.note ? <p className="bbf-panel__intro">{extra.note}</p> : null}
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
  let content = data.sheet ? <PartsList cycle={cycle} data={data} onOpen={open} /> : null;
  let levelKey = 'parts';
  if (data.sheet && level.view === 'part' && data.testing[level.index]) {
    const { part, number, days } = data.testing[level.index];
    title = T.partTitle(number, part.name);
    levelKey = `part-${level.index}`;
    content = <PartDetail sheet={data.sheet} part={part} days={days} opened={opened} onToggle={toggle} idPrefix={`bbf-part-${level.index}`} />;
  } else if (data.sheet && level.view === 'other' && data.other) {
    title = data.other.name;
    levelKey = 'other';
    content = <OtherDetail cycle={cycle} data={data} opened={opened} onToggle={toggle} />;
  } else if (data.sheet && level.view === 'extra') {
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
          <PartDetail sheet={data.sheet} part={part} days={days} opened={none} onToggle={() => {}} printAll idPrefix={`bbf-print-${part.code}`} />
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
