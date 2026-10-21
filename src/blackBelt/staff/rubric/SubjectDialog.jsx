// SubjectDialog.jsx — one subject of the Dan being edited (mockups R4, R5).
// Why it exists: CONTRACT-0024 §10.3. Everything about a subject that doesn't fit in its row:
//   - Name and Credits (whole number 1–20; also typed in the row on PC and tablet)
//   - Scoring: Graded A+ to D, or Measured: per way its unit, what a grade needs (at least / at
//     most / under the number) and its own age brackets with the cut-offs A+ A B+ B C; + Add age
//     bracket, a trash per bracket; + Add another way (at most two, v0.927) — each way then has a
//     name and its own trash
//   - Points: Worked out (credits × this Dan's grade points for the part, shown) or Own points
//     (each grade typed; the worked-out values are shown next to them for comparison) (v0.924)
//   - Who does it: Everyone, or Only some brackets of the Dan's pass-mark list (v0.926)
//   - Tags: Outdoor, Handed in; a Note
// Done puts the changes into the draft (the row is tinted); nothing is saved until Save [Dan].
// Cancel leaves the row as it was. Esc / clicking outside / the back arrow with changes keeps
// it open with "Unsaved changes. Save or cancel first." (v0.46); phones add a Discard changes
// link (v0.56, v0.928). Switching Measured → Graded keeps the ways in the draft until Save
// (useRubricDraft keeps them aside), so switching back brings them back.
// PC and tablet: a dialog (over the inline editor). Phones: a full-screen page over the
// full-screen editor (InnerDialog, so the editor below keeps the one browser-history step).
import { Fragment, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconCheck, IconPlus, IconTrash } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import IconButton from '../../../components/IconButton.jsx';
import Notice from '../../../components/Notice.jsx';
import { bracketLabel, CUTOFF_LETTERS, MAX_BRACKETS, sameBracket, subjectLetters } from '../../../lib/blackBelt/rubric.js';
import Choice from '../parts/Choice.jsx';
import InnerDialog from '../parts/InnerDialog.jsx';
import SelectField from '../parts/SelectField.jsx';
import { checkDraft, prepareDan } from './draft.js';
import { FieldNote, NumberBox, TextBox } from './fields.jsx';
import { describe } from './problemText.js';
import { pointsForLetters, workedNow } from './useRubricDraft.js';
import * as T from '../text.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : String(v ?? ''));
const lettersLine = (letters, values) => letters.map((l) => `${l} ${values?.[l] === undefined ? '—' : num(values[l])}`).join(' · ');
const newBracket = () => ({ from: '', to: null, cutoffs: Object.fromEntries(CUTOFF_LETTERS.map((l) => [l, ''])) });
const newWay = (name) => ({ name, unit: T.NEW_WAY_UNIT, direction: 'at_least', brackets: [{ from: null, to: null, cutoffs: Object.fromEntries(CUTOFF_LETTERS.map((l) => [l, ''])) }] });

// requestCloseRef: the editor below calls requestCloseRef.current() when the phone's Back is
// pressed while this page is open (the editor's frame owns the browser-history step).
export default function SubjectDialog({ draft, partCode, subject: original, isNew, keptWays, where, isPhone, onDone, onCancel, requestCloseRef }) {
  const id = useId();
  const part = draft.parts.find((p) => p.code === partCode);
  const [s, setS] = useState(original);
  const [kept, setKept] = useState(keptWays ?? null); // the ways while Graded is chosen
  const [note, setNote] = useState(false);
  const sRef = useRef(s);
  useLayoutEffect(() => {
    sRef.current = s;
  });
  const change = (changes) => {
    setS((current) => ({ ...current, ...changes }));
    setNote(false);
  };
  const dirty = isNew || !same(s, original);

  // ----- The problems of this subject, checked as it is typed -----
  const withThis = { ...draft, parts: draft.parts.map((p) => (p.code === partCode ? { ...p, subjects: p.subjects.some((x) => x.id === s.id) ? p.subjects.map((x) => (x.id === s.id ? s : x)) : [...p.subjects, s] } : p)) };
  const checked = checkDraft(withThis, draft.dan);
  const mine = checked.problems.filter((p) => p.subject === s.id && !(p.code === 'not_a_number' && p.empty) && !(p.code === 'subject_name' && !String(s.name ?? '').trim()));
  const first = (test) => {
    const p = mine.find(test);
    return p ? describe(p, checked.dan).field : null;
  };
  const nameMsg = first((p) => p.code === 'subject_name' || p.code === 'subject_name_duplicate');
  const creditsMsg = first((p) => p.code === 'credits' || (p.code === 'not_a_number' && p.field === 'credits'));
  const pointsMsg = first((p) => ['points_range', 'points_order', 'points_not_worked_out'].includes(p.code) || (p.code === 'not_a_number' && p.field === 'points'));
  const whoMsg = first((p) => p.code === 'limited_to');
  const noteMsg = first((p) => p.code === 'note');
  const wayMsg = (wi, test) => first((p) => p.way === wi && test(p));

  const passBrackets = prepareDan(draft).dan.pass.brackets;
  const nowPart = checked.dan.parts.find((p) => p.code === partCode);
  const letters = subjectLetters(partCode, s.scoring);
  const worked = workedNow(part, { ...s });

  // ----- Changes -----
  function setScoring(scoring) {
    if (scoring === s.scoring) return;
    let ways = s.ways;
    if (scoring === 'graded') {
      setKept(s.ways.length > 0 ? s.ways : kept);
      ways = [];
    } else {
      ways = kept && kept.length > 0 ? kept : [newWay(null)];
    }
    const next = { ...s, scoring, ways };
    change({ scoring, ways, points: pointsForLetters(part, next) });
  }
  function setWay(wi, changes) {
    change({ ways: s.ways.map((w, k) => (k === wi ? { ...w, ...changes } : w)) });
  }
  function setBracket(wi, bi, changes) {
    setWay(wi, { brackets: s.ways[wi].brackets.map((b, k) => (k === bi ? { ...b, ...changes } : b)) });
  }
  function setPointsMode(mode) {
    if (mode === s.points_mode) return;
    // Own points start as today's worked-out values, so nothing changes until a grade is typed.
    if (mode === 'own') change({ points_mode: mode, points: Object.fromEntries(letters.map((l) => [l, worked[l] ?? ''])) });
    else change({ points_mode: mode, points: Object.fromEntries(letters.map((l) => [l, worked[l] ?? ''])) });
  }
  function toggleBracket(b, on) {
    const list = Array.isArray(s.limited_to) ? s.limited_to : [];
    const next = on ? [...list.filter((x) => !sameBracket(x, b)), { from: b.from, to: b.to }] : list.filter((x) => !sameBracket(x, b));
    // Keep the pass list's order.
    change({ limited_to: passBrackets.filter((p) => next.some((x) => sameBracket(x, p))).map((p) => ({ from: p.from, to: p.to })) });
  }

  // ----- Closing -----
  function requestClose() {
    if (!dirty || same(sRef.current, original)) {
      onCancel();
      return;
    }
    setNote(true);
  }
  useLayoutEffect(() => {
    if (!requestCloseRef) return undefined;
    requestCloseRef.current = requestClose;
    return () => {
      requestCloseRef.current = null;
    };
  });

  function done() {
    const out = { ...s };
    if (out.points_mode === 'worked') out.points = Object.fromEntries(letters.map((l) => [l, worked[l] ?? '']));
    onDone(out, s.scoring === 'graded' ? kept : null);
  }

  // ----- One way (R4, R5) -----
  function wayBlock(way, wi) {
    const two = s.ways.length === 2;
    const unitMsg = wayMsg(wi, (p) => p.code === 'unit');
    const nameMsgW = wayMsg(wi, (p) => p.code === 'way_name');
    const listMsg = wayMsg(wi, (p) => ['brackets_count', 'brackets_order', 'brackets_gap', 'brackets_overlap', 'brackets_ends', 'direction'].includes(p.code));
    const bracketMsg = (bi) => first((p) => p.way === wi && p.bracket === bi && ['bracket_ages', 'cutoffs_range', 'cutoffs_order'].includes(p.code)) ?? first((p) => p.way === wi && p.bracket === bi && p.code === 'not_a_number');
    const nowWay = checked.dan.parts.find((p) => p.code === partCode)?.subjects.find((x) => x.id === s.id)?.ways?.[wi];
    return (
      <div key={wi} className={`bbs-way${two ? ' bbs-way--boxed' : ''}`}>
        {two && (
          <div className="bbs-way-head">
            <div className="field bbs-grow">
              <label htmlFor={`${id}-way-${wi}`}>{T.wayName(wi + 1)}</label>
              <TextBox id={`${id}-way-${wi}`} value={way.name ?? ''} onChange={(text) => setWay(wi, { name: text })} invalid={Boolean(nameMsgW)} maxLength={60} />
              <FieldNote text={nameMsgW} />
            </div>
            <IconButton label={T.removeWayLabel(way.name)} Icon={IconTrash} onClick={() => change({ ways: s.ways.filter((_, k) => k !== wi) })} />
          </div>
        )}
        <div className="bbs-two">
          <div className="field">
            <label htmlFor={`${id}-unit-${wi}`}>{T.UNIT}</label>
            <TextBox id={`${id}-unit-${wi}`} value={way.unit ?? ''} onChange={(text) => setWay(wi, { unit: text })} invalid={Boolean(unitMsg)} maxLength={40} />
            <FieldNote text={unitMsg} />
          </div>
          <div className="field">
            <span id={`${id}-dir-${wi}-label`} className="bbe-label">
              {T.GRADE_NEEDS}
            </span>
            <SelectField
              id={`${id}-dir-${wi}`}
              labelId={`${id}-dir-${wi}-label`}
              value={way.direction}
              options={['at_least', 'at_most', 'under'].map((v) => ({ value: v, label: T.DIRECTION_CHOICES[v] }))}
              onChange={(value) => setWay(wi, { direction: value })}
            />
          </div>
        </div>
        <p className="bbe-label">{T.AGE_BRACKETS_CUTOFFS}</p>
        {!isPhone && (
          <div className="bbs-crow bbs-crow--head" aria-hidden="true">
            <span>{T.COL_FROM_AGE}</span>
            <span>{T.COL_TO_AGE}</span>
            <span>{T.COL_BRACKET}</span>
            {CUTOFF_LETTERS.map((l) => (
              <span key={l} className="num">
                {l}
              </span>
            ))}
            <span />
          </div>
        )}
        {way.brackets.map((b, bi) => {
          const label = bracketLabel(nowWay?.brackets?.[bi] ?? b);
          const msg = bracketMsg(bi);
          const ages = (
            <>
              <NumberBox whole label={T.fromAgeLabel(bi + 1)} placeholder="–" value={b.from} onChange={(v) => setBracket(wi, bi, { from: v })} invalid={Boolean(msg)} />
              <NumberBox whole label={T.toAgeLabel(bi + 1)} placeholder="–" value={b.to} onChange={(v) => setBracket(wi, bi, { to: v })} invalid={Boolean(msg)} />
            </>
          );
          const cuts = CUTOFF_LETTERS.map((l) => (
            <label key={l} className="bbs-cut">
              {isPhone && (
                <span className="bbs-cut-letter" aria-hidden="true">
                  {l}
                </span>
              )}
              <NumberBox
                label={T.cutoffLabel(label, l)}
                value={b.cutoffs?.[l]}
                onChange={(v) => setBracket(wi, bi, { cutoffs: { ...b.cutoffs, [l]: v } })}
                invalid={Boolean(msg)}
              />
            </label>
          ));
          const trash =
            way.brackets.length > 1 ? (
              <IconButton label={T.removeAgeBracketLabel(label)} Icon={IconTrash} onClick={() => setWay(wi, { brackets: way.brackets.filter((_, k) => k !== bi) })} />
            ) : (
              <span />
            );
          return isPhone ? (
            <div key={bi} className="bbs-ccard">
              <div className="bbs-ccard-head">
                <span className="bbe-bcard-title">{label}</span>
                {trash}
              </div>
              <div className="bbe-two">
                <label className="field">
                  <span className="bbe-label">{T.COL_FROM_AGE}</span>
                  <NumberBox whole label={T.fromAgeLabel(bi + 1)} placeholder={T.YOUNGEST} value={b.from} onChange={(v) => setBracket(wi, bi, { from: v })} invalid={Boolean(msg)} />
                </label>
                <label className="field">
                  <span className="bbe-label">{T.COL_TO_AGE}</span>
                  <NumberBox whole label={T.toAgeLabel(bi + 1)} placeholder={T.OLDEST} value={b.to} onChange={(v) => setBracket(wi, bi, { to: v })} invalid={Boolean(msg)} />
                </label>
              </div>
              <div className="bbs-cuts-phone">{cuts}</div>
              <FieldNote text={msg} />
            </div>
          ) : (
            <Fragment key={bi}>
              <div className="bbs-crow">
                {ages}
                <span className="bbs-clabel">{label}</span>
                {cuts}
                {trash}
              </div>
              <FieldNote text={msg} />
            </Fragment>
          );
        })}
        <FieldNote text={listMsg} />
        {way.brackets.length < MAX_BRACKETS && (
          <button type="button" className="btn btn-sm bbe-add" onClick={() => setWay(wi, { brackets: [...way.brackets, newBracket()] })}>
            <IconPlus size={16} aria-hidden="true" />
            {T.ADD_AGE_BRACKET}
          </button>
        )}
      </div>
    );
  }

  const nowSubject = nowPart?.subjects.find((x) => x.id === s.id);
  const credits = typeof nowSubject?.credits === 'number' ? nowSubject.credits : s.credits;

  const content = (
    <form
      className="bbs-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        done();
      }}
    >
      <p className="tdialog-sub">{T.subjectDialogSub(part.name, draft.dan, where)}</p>
      <div className="bbs-two bbs-two--name">
        <div className="field">
          <label htmlFor={`${id}-name`}>{T.NAME}</label>
          <TextBox id={`${id}-name`} value={s.name} onChange={(text) => change({ name: text })} invalid={Boolean(nameMsg)} autoFocus maxLength={60} />
          <FieldNote text={nameMsg} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-credits`}>{T.CREDITS}</label>
          <NumberBox id={`${id}-credits`} whole value={s.credits} onChange={(v) => change({ credits: v })} invalid={Boolean(creditsMsg)} describedBy={`${id}-credits-hint`} className="bbs-credits" />
          {creditsMsg ? <FieldNote text={creditsMsg} /> : <p id={`${id}-credits-hint`} className="field-hint">{T.CREDITS_HINT}</p>}
        </div>
      </div>

      <div className="field">
        <span id={`${id}-scoring`} className="bbe-label">
          {T.SCORING}
        </span>
        <Choice
          labelId={`${id}-scoring`}
          options={[
            { key: 'graded', label: T.GRADED_A_TO_D },
            { key: 'measured', label: T.MEASURED },
          ]}
          value={s.scoring}
          onChange={setScoring}
        />
      </div>
      {s.scoring === 'graded' ? (
        <p className="field-hint bbs-graded-hint">{T.GRADER_PICKS}</p>
      ) : (
        <>
          {s.ways.map(wayBlock)}
          {s.ways.length < 2 && (
            <button type="button" className="btn btn-sm bbe-add" onClick={() => change({ ways: [{ ...s.ways[0], name: s.ways[0]?.name ?? '' }, newWay('')] })}>
              <IconPlus size={16} aria-hidden="true" />
              {T.ADD_ANOTHER_WAY}
            </button>
          )}
          {s.ways.length === 2 && <p className="field-hint">{T.TWO_WAYS_HINT}</p>}
          <p className="field-hint">{T.AGES_HINT}</p>
        </>
      )}

      <div className="field">
        <span id={`${id}-points`} className="bbe-label">
          {T.POINTS_LABEL}
        </span>
        <Choice
          labelId={`${id}-points`}
          options={[
            { key: 'worked', label: T.WORKED_OUT },
            { key: 'own', label: T.OWN_POINTS },
          ]}
          value={s.points_mode}
          onChange={setPointsMode}
        />
      </div>
      {s.points_mode === 'worked' ? (
        <div className="bbs-worked">
          <p>{lettersLine(letters, worked)}</p>
          <p className="field-hint">{T.workedOutWhy(num(credits), draft.dan, part.name)}</p>
        </div>
      ) : (
        <>
          <div className="bbs-own">
            {letters.map((l) => (
              <label key={l} className="bbe-gp-box">
                <span className="bbe-gp-letter" aria-hidden="true">
                  {l}
                </span>
                <NumberBox label={T.ownPointLabel(l)} value={s.points?.[l]} onChange={(v) => change({ points: { ...s.points, [l]: v } })} invalid={Boolean(pointsMsg)} />
              </label>
            ))}
          </div>
          <p className="field-hint">{T.ownPointsWhy(lettersLine(letters, worked))}</p>
        </>
      )}
      <FieldNote text={pointsMsg} />

      <div className="field">
        <span id={`${id}-who`} className="bbe-label">
          {T.WHO_DOES_IT}
        </span>
        <Choice
          labelId={`${id}-who`}
          options={[
            { key: 'everyone', label: T.EVERYONE },
            { key: 'some', label: T.ONLY_SOME_BRACKETS },
          ]}
          value={Array.isArray(s.limited_to) ? 'some' : 'everyone'}
          onChange={(key) => change({ limited_to: key === 'everyone' ? null : [] })}
        />
      </div>
      {Array.isArray(s.limited_to) && (
        <div className="bbs-who">
          {passBrackets.map((b, i) => (
            <label key={i} className="cbrow">
              <input type="checkbox" className="cb" checked={s.limited_to.some((x) => sameBracket(x, b))} onChange={(event) => toggleBracket(b, event.target.checked)} />
              <span>{bracketLabel(b)}</span>
            </label>
          ))}
          <p className="field-hint">{T.WHO_HINT}</p>
        </div>
      )}
      <FieldNote text={whoMsg} />

      <div className="field">
        <span className="bbe-label">{T.TAGS}</span>
        <div className="bbs-tags">
          <label className="cbrow">
            <input type="checkbox" className="cb" checked={Boolean(s.outdoor)} onChange={(event) => change({ outdoor: event.target.checked })} />
            <span>{T.OUTDOOR}</span>
          </label>
          <label className="cbrow">
            <input type="checkbox" className="cb" checked={Boolean(s.handed_in)} onChange={(event) => change({ handed_in: event.target.checked })} />
            <span>{T.HANDED_IN_TAG}</span>
          </label>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-note`}>{T.NOTE_OPTIONAL}</label>
        <TextBox id={`${id}-note`} value={s.note ?? ''} onChange={(text) => change({ note: text })} invalid={Boolean(noteMsg)} maxLength={200} />
        <FieldNote text={noteMsg} />
      </div>

      <p className="field-hint">{isPhone ? T.DONE_KEEPS_PHONE : T.doneKeepsDraft(draft.dan)}</p>
      {note && (
        <div className="tdialog-note">
          <Notice>
            {T.UNSAVED}
            {isPhone && (
              <button type="button" className="note-action" onClick={onCancel}>
                {T.DISCARD_CHANGES}
              </button>
            )}
          </Notice>
        </div>
      )}
      {isPhone ? (
        <div className="dialog-page-submit">
          <button type="submit" className="btn btn-primary btn-block">
            <IconCheck size={16} aria-hidden="true" />
            {T.DONE}
          </button>
        </div>
      ) : (
        <div className="dialog-footer">
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onCancel}>
              {T.CANCEL}
            </button>
            <button type="submit" className="btn btn-primary">
              <IconCheck size={16} aria-hidden="true" />
              {T.DONE}
            </button>
          </div>
        </div>
      )}
    </form>
  );

  const title = s.name?.trim() ? s.name : original.name?.trim() ? original.name : T.ADD_SUBJECT;
  if (isPhone) {
    return (
      <InnerDialog title={title} fullScreen onRequestClose={requestClose}>
        {content}
      </InnerDialog>
    );
  }
  return (
    <Dialog title={title} size="wide" onRequestClose={requestClose}>
      {content}
    </Dialog>
  );
}
