// RubricReadView.jsx — one Dan of a rubric, shown read-only (mockups R1, R2, R12, R13).
// Why it exists: CONTRACT-0024 §10.3. The default rubric (Rubric and prices) and a cycle's own
// copy (the cycle's Rubric tab) are drawn the same way, for admins and staff:
//   - To pass: one pass mark per age bracket ("17 and under 275 points · 18 and over 293 points ·
//     no D in any subject"), the most points per bracket before extra points, and the make-up
//     sentence under it
//   - the four parts, each a card: name, its worked-out maximum ("up to 135 points (157.5 for 18
//     and over)"), this Dan's grade points (A+ … D), and one row per subject: credits, scoring,
//     tags (Outdoor, Handed in, "Only 18 and over", a dashed "Own points"), a note, and Up to (the
//     subject's A+ points). A measured subject has a Cut-offs toggle (its own age brackets; a
//     subject done two ways shows a small table per way); a subject with its own points has a
//     Points toggle (A+ … D), so nobody works out Egg test's B as 5 × 2.5 (it is 11).
//   - Extra points (added to the total or not, the limit, amber "To confirm with Master Jeong")
//   - Handed in by Submissions due (worked out from the subjects tagged Handed in)
//   - "Last changed by …" (admins only, and only when the Dan was saved by someone — v0.921 R2)
// Phones: subject rows stack ("2 credits · up to 8 · count, at least"); grade points become one
// line of text; in a cut-off table each bracket's name sits on its own line above its numbers,
// so nothing scrolls sideways at 320px.
// Everything is drawn as React text (no innerHTML).
import { Fragment, useId, useState } from 'react';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { bracketLabel, CUTOFF_LETTERS, handedIn, mostPoints, partLetters, partMaxByBracket, subjectLetters } from '../../../lib/blackBelt/rubric.js';
import * as T from '../text.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : String(v ?? ''));

// "17 and under 275 points · 18 and over 293 points" — or "261 points" for one bracket.
export function passText(dan) {
  const brackets = dan?.pass?.brackets ?? [];
  if (brackets.length === 1) return T.toPassPoints(num(brackets[0].pass_mark));
  return brackets.map((b) => T.bracketPoints(bracketLabel(b), num(b.pass_mark))).join(' · ');
}

// "Most points 339 (17 and under) · 361.5 (18 and over) before extra points"
export function mostText(dan) {
  const brackets = dan?.pass?.brackets ?? [];
  if (brackets.length === 1) return T.mostPointsOne(num(mostPoints(dan, brackets[0])));
  return T.mostPointsMany(brackets.map((b) => T.mostPointsItem(num(mostPoints(dan, b)), bracketLabel(b))).join(' · '));
}

// "up to 135 points (157.5 for 18 and over)" — a part's maximum per pass bracket, grouped.
export function partUpToText(dan, part) {
  const groups = partMaxByBracket(dan, part);
  if (groups.length <= 1) return T.partUpTo(num(groups[0]?.max ?? 0));
  const [first, ...rest] = groups;
  return T.partUpToMany(num(first.max), rest.map((g) => T.forBracket(num(g.max), g.brackets.map(bracketLabel).join(', '))).join('; '));
}

// "Only 18 and over" for a subject limited to some pass brackets (null when everyone does it).
export function onlyText(subject) {
  return Array.isArray(subject?.limited_to) ? T.onlyBrackets(subject.limited_to.map(bracketLabel).join(', ')) : null;
}

// How a subject is scored, in words (the Scoring column).
export function scoringText(subject) {
  if (subject.scoring !== 'measured') return T.GRADED_A_TO_D;
  const ways = subject.ways ?? [];
  if (ways.length === 2) return T.twoWaysLine(ways[0], ways[1]);
  const w = ways[0] ?? {};
  return T.measuredLine(w.unit ?? '', w.direction, (w.brackets ?? []).length);
}

// The short "how" at the end of a phone row: "count, at least" / "graded A+ to D".
export function phoneHow(subject) {
  if (subject.scoring !== 'measured') return T.PHONE_HOW_GRADED;
  const ways = subject.ways ?? [];
  if (ways.length === 2) return T.phoneHowTwoWays(ways[0], ways[1]);
  return T.phoneHowMeasured(ways[0]?.unit ?? '', ways[0]?.direction);
}

// The extra-points rule of one item: "1 point each" / "1+ → 3 · 2+ → 5 · 3+ → 7".
export function extraRuleText(item) {
  const rule = item?.rule ?? {};
  if (rule.kind === 'per_count') return T.pointEach(rule.points_each);
  return (rule.steps ?? []).map((s) => T.stepText(num(s.at_least), num(s.points))).join(' · ');
}

// ----- Small pieces (also used by the editor) -----

// The tags of a subject row: Outdoor, Handed in, Only 18 and over, and the dashed Own points.
export function SubjectTags({ subject, withOwn = true }) {
  const only = onlyText(subject);
  return (
    <>
      {subject.outdoor && <span className="ttag">{T.OUTDOOR}</span>}
      {subject.handed_in && <span className="ttag">{T.HANDED_IN_TAG}</span>}
      {only && <span className="ttag">{only}</span>}
      {withOwn && subject.points_mode === 'own' && <span className="ttag bbr-tag-own">{T.OWN_POINTS}</span>}
    </>
  );
}

// One way's cut-offs: a table on PC / tablet; on phones each bracket's name above its numbers.
export function CutoffTable({ way, isPhone }) {
  const brackets = way?.brackets ?? [];
  if (isPhone) {
    return (
      <div className="bbr-cuts-phone">
        {brackets.map((b, i) => (
          <div key={i} className="bbr-cuts-phone-row">
            <p className="bbr-cuts-phone-label">{bracketLabel(b)}</p>
            <dl className="bbr-letters">
              {CUTOFF_LETTERS.map((l) => (
                <div key={l} className="bbr-letter">
                  <dt>{l}</dt>
                  <dd>{num(b.cutoffs?.[l])}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    );
  }
  return (
    <table className="bbr-cuts">
      <thead>
        <tr>
          <th scope="col">{T.AGE_BRACKET}</th>
          {CUTOFF_LETTERS.map((l) => (
            <th key={l} scope="col" className="num">
              {l}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {brackets.map((b, i) => (
          <tr key={i}>
            <th scope="row">{bracketLabel(b)}</th>
            {CUTOFF_LETTERS.map((l) => (
              <td key={l} className="num">
                {num(b.cutoffs?.[l])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// A row of letters with their values (grade points, a subject's points).
export function LetterValues({ letters, values, className = '' }) {
  return (
    <dl className={`bbr-letters ${className}`.trim()}>
      {letters.map((l) => (
        <div key={l} className="bbr-letter">
          <dt>{l}</dt>
          <dd>{num(values?.[l])}</dd>
        </div>
      ))}
    </dl>
  );
}

// What a toggle opens under a subject row.
function SubjectMore({ subject, part, open, isPhone, id }) {
  const ways = subject.ways ?? [];
  return (
    <div id={id} className="bbr-more">
      {open.cut && (
        <div className="bbr-more-box">
          {ways.map((w, i) => (
            <Fragment key={i}>
              {ways.length > 1 && <p className="bbr-way-head">{T.wayHeading(w.name, w.unit, w.direction)}</p>}
              <CutoffTable way={w} isPhone={isPhone} />
            </Fragment>
          ))}
          <p className="bbr-more-foot">{ways.length > 1 ? T.TWO_WAYS_FOOT : T.cutOffsFoot(ways[0]?.direction, ways[0]?.unit ?? '')}</p>
        </div>
      )}
      {open.pts && (
        <div className="bbr-more-box">
          <LetterValues letters={subjectLetters(part.code, subject.scoring)} values={subject.points} className="bbr-letters--table" />
          <p className="bbr-more-foot">{T.OWN_POINTS_FOOT}</p>
        </div>
      )}
    </div>
  );
}

// The Cut-offs / Points toggles (text colour with a chevron).
function Toggle({ label, srLabel, open, controls, onToggle }) {
  const Icon = open ? IconChevronUp : IconChevronDown;
  return (
    <button type="button" className="bbr-toggle" aria-expanded={open ? 'true' : 'false'} aria-controls={controls} aria-label={srLabel} onClick={onToggle}>
      {label}
      <Icon size={14} aria-hidden="true" />
    </button>
  );
}

// ----- The read view -----

export default function RubricReadView({ dan, isPhone, showStamp }) {
  const baseId = useId();
  const [open, setOpen] = useState({}); // { '<subject id>:cut': true, '<subject id>:pts': true }
  if (!dan) return null;
  const toggle = (key) => setOpen((current) => ({ ...current, [key]: !current[key] }));
  const hand = handedIn(dan);
  const extra = dan.extra_points ?? {};
  const items = extra.items ?? [];

  return (
    <div className="bbr-view">
      <div className="bbr-pass">
        <p className="bbr-pass-line">
          <b>{T.TO_PASS}:</b> {passText(dan)}
          {dan.pass?.no_d ? ` · ${T.NO_D_ANY}` : ''}
          <span className="bbr-most">{mostText(dan)}</span>
        </p>
        {dan.pass?.makeup && <p className="bbr-makeup">{dan.pass.makeup}</p>}
      </div>

      {(dan.parts ?? []).map((part) => {
        const subjects = part.subjects ?? [];
        const limited = subjects.filter((s) => Array.isArray(s.limited_to));
        const limitedLabels = [...new Set(limited.flatMap((s) => s.limited_to.map(bracketLabel)))].join(', ');
        return (
          <section key={part.code} className="bbr-part" aria-labelledby={`${baseId}-${part.code}`}>
            <div className="bbr-part-head">
              <h3 id={`${baseId}-${part.code}`} className="bbr-part-name">
                {part.name}
              </h3>
              <span className="bbr-part-meta">
                {partUpToText(dan, part)} · {T.subjectsWord(subjects.length)}
              </span>
            </div>
            <div className="bbr-gp">
              <span className="bbr-gp-label">{T.GRADE_POINTS}</span>
              {isPhone ? (
                <span className="bbr-gp-line">{partLetters(part.code).map((l) => `${l} ${num(part.grade_points?.[l])}`).join(' · ')}</span>
              ) : (
                <LetterValues letters={partLetters(part.code)} values={part.grade_points} className="bbr-letters--boxes" />
              )}
            </div>
            {isPhone ? (
              <ul className="bbr-subjects-phone">
                {subjects.map((s) => {
                  const moreId = `${baseId}-${s.id}-more`;
                  const state = { cut: Boolean(open[`${s.id}:cut`]), pts: Boolean(open[`${s.id}:pts`]) };
                  return (
                    <li key={s.id} className="bbr-sphone">
                      <p className="bbr-sphone-name">
                        <span>{s.name}</span>
                        <SubjectTags subject={s} />
                      </p>
                      {s.note && <p className="bbr-note">{T.noteLine(s.note)}</p>}
                      <p className="bbr-sphone-line">{T.phoneSubjectLine(s.credits, num(s.points?.['A+']), phoneHow(s))}</p>
                      {(s.scoring === 'measured' || s.points_mode === 'own') && (
                        <p className="bbr-toggles">
                          {s.scoring === 'measured' && <Toggle label={T.CUT_OFFS} srLabel={T.showCutOffs(s.name)} open={state.cut} controls={moreId} onToggle={() => toggle(`${s.id}:cut`)} />}
                          {s.points_mode === 'own' && <Toggle label={T.POINTS_TOGGLE} srLabel={T.showPoints(s.name)} open={state.pts} controls={moreId} onToggle={() => toggle(`${s.id}:pts`)} />}
                        </p>
                      )}
                      {(state.cut || state.pts) && <SubjectMore subject={s} part={part} open={state} isPhone id={moreId} />}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <table className="bbr-subjects">
                <thead>
                  <tr>
                    <th scope="col">{T.COL_SUBJECT}</th>
                    <th scope="col" className="num">
                      {T.COL_CREDITS}
                    </th>
                    <th scope="col">{T.COL_SCORING}</th>
                    <th scope="col" className="num">
                      {T.COL_UP_TO}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s) => {
                    const moreId = `${baseId}-${s.id}-more`;
                    const state = { cut: Boolean(open[`${s.id}:cut`]), pts: Boolean(open[`${s.id}:pts`]) };
                    return (
                      <Fragment key={s.id}>
                        <tr className={state.cut || state.pts ? 'is-open' : undefined}>
                          <th scope="row" className="bbr-sname">
                            <span className="bbr-sname-line">
                              <span>{s.name}</span>
                              <SubjectTags subject={s} />
                            </span>
                            {s.note && <span className="bbr-note">{T.noteLine(s.note)}</span>}
                          </th>
                          <td className="num">{s.credits}</td>
                          <td className="bbr-scoring">
                            <span>{scoringText(s)}</span>{' '}
                            {s.scoring === 'measured' && <Toggle label={T.CUT_OFFS} srLabel={T.showCutOffs(s.name)} open={state.cut} controls={moreId} onToggle={() => toggle(`${s.id}:cut`)} />}
                            {s.points_mode === 'own' && <Toggle label={T.POINTS_TOGGLE} srLabel={T.showPoints(s.name)} open={state.pts} controls={moreId} onToggle={() => toggle(`${s.id}:pts`)} />}
                          </td>
                          <td className="num">{num(s.points?.['A+'])}</td>
                        </tr>
                        {(state.cut || state.pts) && (
                          <tr className="bbr-more-row">
                            <td colSpan={4}>
                              <SubjectMore subject={s} part={part} open={state} isPhone={false} id={moreId} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="bbr-part-foot">
              {T.PART_FOOT}
              {limited.length > 0 ? T.partFootLimited(limited.map((s) => s.name).join(' and '), limitedLabels) : ''}
            </p>
          </section>
        );
      })}

      <section className="bbr-part" aria-labelledby={`${baseId}-extra`}>
        <div className="bbr-part-head">
          <h3 id={`${baseId}-extra`} className="bbr-part-name">
            {T.EXTRA_POINTS_TITLE}
          </h3>
          <span className="bbr-part-meta">{T.extraHead(extra.counts_toward_total, extra.limit)}</span>
          {extra.to_confirm && <span className="ttag ttag--warn">{T.TO_CONFIRM_TAG}</span>}
        </div>
        {extra.note && <p className="bbr-note bbr-extra-note">{extra.note}</p>}
        <ul className="bbr-extras">
          {items.map((item, i) => (
            <li key={i} className="bbr-extra">
              <span className="bbr-extra-name">{item.name}</span>
              <span className="bbr-extra-rule">{extraRuleText(item)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bbr-part bbr-hand" aria-labelledby={`${baseId}-hand`}>
        <h3 id={`${baseId}-hand`} className="bbr-part-name">
          {T.HANDED_IN_BY}
        </h3>
        <p className="bbr-hand-list">{hand.length > 0 ? hand.map((h) => h.subject.name).join(' · ') : T.NOTHING_HANDED_IN}</p>
        <p className="bbr-part-foot">{T.HANDED_IN_FOOT}</p>
      </section>

      {showStamp && dan.saved_by_name && dan.saved_at && <p className="tmeta">{T.lastChangedRubric(dan.saved_by_name, dan.saved_at)}</p>}
    </div>
  );
}
