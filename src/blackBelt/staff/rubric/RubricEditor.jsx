// RubricEditor.jsx — "Edit 1st Dan": the whole Dan as fields (mockups R3, R6, R7, R8, R11).
// Why it exists: CONTRACT-0024 §10.3. An admin edits one Dan of the default rubric (or of a
// cycle's copy before its registration first opens) and saves it once (rulebook v0.923):
//   - the edit bar: "Editing 1st Dan" over "default rubric · 3 changes not saved" (or "Fall 2027
//     only"), Copy from Dan…, Cancel, Save 1st Dan — it sticks to the top while the page scrolls.
//     Phones: the editor is a full-screen page (RubricCard draws the frame) with Copy from Dan… at
//     the top and a footer that stays at the bottom ("3 changes not saved" + Save 1st Dan).
//   - To pass: one row per pass-mark bracket (from age, to age, the worked-out name, the pass
//     mark, the most points "339 → 343"), ⋯ Split this bracket… / Remove bracket, + Add bracket,
//     the No D tick and the make-up sentence (R6)
//   - each part: its name, this Dan's grade points A+ … D, and one row per subject: grip, name
//     and credits typed in the row (PC and tablet), scoring and tags, Up to, Edit (the subject's
//     dialog, R4) and ⋯ (Move up, Move down, Remove subject); + Add subject with the credit total
//   - extra points: Added to the total, Limit, To confirm with Master Jeong; one row per item
//     (Per count or Steps), ⋯ Move up / Move down / Remove item; + Add extra-points item (R7)
//   - Handed in by Submissions due (worked out, read-only)
// Rows changed but not saved are tinted pale amber (--color-warning-bg, rulebook v0.935). The
// amber "Can't save 1st Dan yet" list (R8) appears after Save is pressed; each line jumps to its
// field. Fields are checked as they are typed (rubric.js danProblems, the twin of the database's
// check). This file only draws: the draft lives in useRubricDraft.js, saving in RubricCard.jsx.
import { Fragment, useId, useState } from 'react';
import { IconAlertTriangle, IconArrowDown, IconArrowsSplit2, IconArrowUp, IconCheck, IconDots, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import IconButton from '../../../components/IconButton.jsx';
import Notice from '../../../components/Notice.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { bracketLabel, handedIn, mostPoints, partLetters, partMaxByBracket } from '../../../lib/blackBelt/rubric.js';
import { nameKey as nameMatchKey } from '../../../lib/testing/names.js';
import { useReorderDrag } from '../../../lib/useReorderDrag.js';
import Choice from '../parts/Choice.jsx';
import Grip from '../parts/Grip.jsx';
import { innerKind, isQuiet, where as whereOf } from './draft.js';
import { FieldNote, NumberBox, TextBox } from './fields.jsx';
import { describe } from './problemText.js';
import { partUpToText, phoneHow, scoringText, SubjectTags } from './RubricReadView.jsx';
import * as T from '../text.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : String(v ?? ''));

function TwoLines({ label, reason }) {
  return (
    <span className="ev-menu-two">
      <span>{label}</span>
      <span className="ev-menu-reason">{reason}</span>
    </span>
  );
}

// "up to 80 → 84 points" when the part has one maximum, else the grouped text of now.
function upToLine(base, now, part, basePart) {
  const a = partMaxByBracket(base, basePart ?? part);
  const b = partMaxByBracket(now, part);
  if (a.length === 1 && b.length === 1) return T.upToChange(num(a[0].max), num(b[0].max));
  return partUpToText(now, part);
}

// "339 → 343" / "up to 80 → 84 points": the NEW number after the arrow in bold, so a change
// stands out (mockups R3, R6). A text without an arrow comes back as it is.
function boldNew(text) {
  if (typeof text !== 'string') return text;
  const at = text.lastIndexOf('→ ');
  if (at < 0) return text;
  const rest = text.slice(at + 2);
  const number = /^[\d.,]+/.exec(rest);
  if (!number) return text;
  return (
    <>
      {text.slice(0, at + 2)}
      <strong>{number[0]}</strong>
      {rest.slice(number[0].length)}
    </>
  );
}

export default function RubricEditor({
  d, // the draft (useRubricDraft)
  isPhone,
  where, // "default rubric" / "Fall 2027 only"
  phoneWhere, // "Default rubric" / "Fall 2027"
  editorLine, // the gray line under the Dan switcher
  switcher, // the Dan switcher element (PC and tablet)
  triedSave,
  serverProblems, // problems the database sent back (null = none)
  stale, // another admin saved this Dan: Save is disabled with the gray reason
  saving,
  topBanners, // banners (another admin saved, couldn't save …) drawn under the bar
  afterReload, // { theirLine, yours: [lines] } after Reload, or null
  footerNote, // phones: the amber "Unsaved changes…" note above Save (v0.56), or null
  onHideReload,
  onCancel,
  onSave,
  onCopy,
  onEditSubject, // (code, id, opener)
  onAddSubject, // (code, opener)
  onSplit, // (index, opener)
}) {
  const baseId = useId();
  const [menu, setMenu] = useState(null); // { kind: 'bracket'|'subject'|'item', key, anchor, … }
  const draft = d.draft;
  const base = d.base;
  const now = d.check.dan; // the draft as numbers (tidied, worked-out points recomputed)
  const danNo = draft.dan;

  // ----- Problems: the list (after Save) and the reasons under each field -----
  const local = d.check.problems;
  const problems = local.length === 0 && serverProblems?.length ? serverProblems : local;
  const shown = triedSave ? problems : problems.filter((p) => !isQuiet(p, draft));
  const byPlace = new Map();
  for (const p of shown) {
    const key = whereOf(p);
    if (!byPlace.has(key)) byPlace.set(key, []);
    byPlace.get(key).push(p);
  }
  // A name used twice is marked on BOTH rows (D3). The problem list names only the second
  // one (as the database does), so the first row with the same name gets the same reason here.
  const sameName = (a, b) => typeof a === 'string' && typeof b === 'string' && nameMatchKey(a) === nameMatchKey(b);
  const echo = (key, p) => {
    if (!byPlace.has(key)) byPlace.set(key, [p]);
  };
  for (const p of shown) {
    if (p.code === 'subject_name_duplicate') {
      const part = now.parts?.find((x) => x.code === p.part);
      const me = part?.subjects?.find((x) => x.id === p.subject);
      for (const o of me ? part.subjects : []) if (o.id !== me.id && sameName(o.name, me.name)) echo(`subject:${o.id}:name`, p);
    } else if (p.code === 'part_name_duplicate') {
      const me = now.parts?.find((x) => x.code === p.part);
      for (const o of me ? now.parts : []) if (o.code !== me.code && sameName(o.name, me.name)) echo(`part:${o.code}:name`, p);
    } else if (p.code === 'extra_item_name_duplicate') {
      const items = now.extra_points?.items ?? [];
      const me = items[p.item];
      items.forEach((o, j) => {
        if (me && j !== p.item && sameName(o?.name, me.name)) echo(`extra:item:${j}`, p);
      });
    }
  }
  const fieldText = (key) => {
    const list = byPlace.get(key);
    return list ? describe(list[0], now).field : null;
  };
  const noteId = (key) => `${baseId}-${key.replace(/[^a-z0-9]/gi, '-')}`;

  // A line of the "Can't save" list was pressed: go to its field (or open the subject's dialog).
  function jump(problem) {
    const key = whereOf(problem);
    if (key.endsWith(':inner')) {
      const [, id] = key.split(':');
      const part = draft.parts.find((p) => p.subjects.some((s) => s.id === id));
      if (part) onEditSubject(part.code, id, document.querySelector(`[data-place="subject:${id}:edit"]`));
      return;
    }
    const target =
      document.querySelector(`[data-place="${key}"]`) ??
      document.querySelector(`[data-place^="${key.split(':').slice(0, 2).join(':')}"]`);
    if (target) {
      target.scrollIntoView?.({ block: 'center' });
      target.focus?.();
    }
  }

  // ----- Dragging rows by the grip (subjects within a part, extra-points items) -----
  const drag = useReorderDrag({
    enabled: !saving,
    onDrop: (group, key, toIndex) => {
      if (group.startsWith('bbe-subjects-')) d.moveSubject(group.slice('bbe-subjects-'.length), key, toIndex);
      else if (group === 'bbe-items') d.moveItem(Number(key), toIndex);
    },
  });

  const count = d.changes.length;
  const countText = d.copiedFrom ? `${T.copiedFrom(d.copiedFrom)} · ${T.changesNotSaved(count)}` : T.changesNotSaved(count);
  const saveBlocked = stale || saving;

  const saveButton = (
    <button
      type="button"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${saveBlocked ? ' is-unavailable' : ''}`}
      aria-disabled={saveBlocked ? 'true' : undefined}
      aria-describedby={stale ? `${baseId}-stale` : undefined}
      onClick={() => !saveBlocked && onSave()}
    >
      {/* ti-check = save */}
      <IconCheck size={16} aria-hidden="true" />
      {saving ? T.SAVING : T.saveDan(danNo)}
    </button>
  );

  // ----- The amber "Can't save 1st Dan yet" list (R8) -----
  const errorList =
    triedSave && problems.length > 0 ? (
      <div className="bbe-errors" role="alert">
        <p className="bbe-errors-head">
          <IconAlertTriangle size={16} aria-hidden="true" />
          {T.cantSaveYet(danNo, problems.length)}
        </p>
        {/* numbered 1., 2., ... like the mockup; the number stays beside the FIRST line of a
            wrapped line on phones (blackBelt.css .bbe-errors-list) */}
        <ol className="bbe-errors-list">
          {problems.map((p, i) => (
            <li key={i}>
              <button type="button" className="link-button bbe-errors-line" onClick={() => jump(p)}>
                {describe(p, now).list}
              </button>
            </li>
          ))}
        </ol>
        <p className="bbe-errors-foot">{T.ERRORS_FOOT}</p>
      </div>
    ) : null;

  // ----- To pass (R6) -----
  const brackets = draft.pass.brackets;
  const baseBrackets = base.pass?.brackets ?? [];
  function bracketMost(i) {
    const nowB = now.pass.brackets[i];
    const after = nowB ? num(mostPoints(now, nowB)) : '';
    const old = baseBrackets.find((b) => b.from === nowB?.from && b.to === nowB?.to);
    const before = old ? num(mostPoints(base, old)) : after;
    return T.mostPointsChange(before, after);
  }
  const passSection = (
    <section className="bbe-card" aria-labelledby={`${baseId}-pass`}>
      <div className="bbe-card-head">
        <h3 id={`${baseId}-pass`} className="bbe-card-title">
          {T.TO_PASS}
        </h3>
        <span className="bbe-card-meta">{T.PASS_MARK_PER_BRACKET}</span>
      </div>
      {!isPhone && (
        <div className="bbe-brow bbe-brow--head" aria-hidden="true">
          <span>{T.COL_FROM_AGE}</span>
          <span>{T.COL_TO_AGE}</span>
          <span>{T.COL_BRACKET}</span>
          <span>{T.COL_PASS_MARK}</span>
          <span>{T.COL_MOST_POINTS}</span>
          <span />
        </div>
      )}
      {brackets.map((b, i) => {
        const nowB = now.pass.brackets[i] ?? {};
        const label = bracketLabel(nowB);
        const key = `pass:${i}`;
        const message = fieldText(key);
        const tinted = d.changed.has(key);
        const more = (
          <IconButton
            label={T.bracketMore(label)}
            Icon={IconDots}
            aria-haspopup="menu"
            aria-expanded={menu?.kind === 'bracket' && menu.key === i ? 'true' : 'false'}
            onClick={(event) => {
              const anchor = event.currentTarget;
              setMenu((m) => (m?.kind === 'bracket' && m.key === i ? null : { kind: 'bracket', key: i, anchor, label }));
            }}
          />
        );
        const fromBox = (
          <NumberBox whole label={T.bracketFromLabel(i + 1)} placeholder={T.YOUNGEST} value={b.from} onChange={(v) => d.setPassBracket(i, { from: v })} invalid={Boolean(message)} place={`${key}:from`} />
        );
        const toBox = <NumberBox whole label={T.bracketToLabel(i + 1)} placeholder={T.OLDEST} value={b.to} onChange={(v) => d.setPassBracket(i, { to: v })} invalid={Boolean(message)} place={`${key}:to`} />;
        const markBox = (
          <NumberBox
            label={T.passMarkLabel(label)}
            unit={T.POINTS_UNIT}
            value={b.pass_mark}
            onChange={(v) => d.setPassBracket(i, { pass_mark: v })}
            invalid={Boolean(message)}
            describedBy={message ? noteId(key) : undefined}
            place={key}
          />
        );
        if (isPhone) {
          return (
            <div key={i} className={`bbe-bcard${tinted ? ' is-changed' : ''}`}>
              <div className="bbe-bcard-head">
                <span className="bbe-bcard-title">{label}</span>
                {more}
              </div>
              <div className="bbe-two">
                <label className="field">
                  <span className="bbe-label">{T.COL_FROM_AGE}</span>
                  {fromBox}
                </label>
                <label className="field">
                  <span className="bbe-label">{T.COL_TO_AGE}</span>
                  {toBox}
                </label>
              </div>
              <label className="field bbe-field-narrow">
                <span className="bbe-label">{T.COL_PASS_MARK}</span>
                {markBox}
              </label>
              <FieldNote id={noteId(key)} text={message} />
              <p className="bbe-hint">{boldNew(T.mostPointsBefore(bracketMost(i)))}</p>
            </div>
          );
        }
        return (
          <Fragment key={i}>
            <div className={`bbe-brow${tinted ? ' is-changed' : ''}`}>
              {fromBox}
              {toBox}
              <span className="bbe-blabel">{label}</span>
              {markBox}
              <span className="bbe-bmost">{boldNew(bracketMost(i))}</span>
              {more}
            </div>
            <FieldNote id={noteId(key)} text={message} />
          </Fragment>
        );
      })}
      <FieldNote text={fieldText('pass:list')} />
      <button type="button" className="btn btn-sm bbe-add" onClick={() => d.addPassBracket()}>
        {/* ti-plus = add new */}
        <IconPlus size={16} aria-hidden="true" />
        {T.ADD_BRACKET}
      </button>
      <p className="bbe-hint">{T.BRACKETS_HINT}</p>
      <label className={`cbrow bbe-tick${d.changed.has('pass:no_d') ? ' is-changed' : ''}`}>
        <input type="checkbox" className="cb" checked={Boolean(draft.pass.no_d)} onChange={(event) => d.setNoD(event.target.checked)} />
        <span>{T.NO_D_TICK}</span>
      </label>
      <div className={`field bbe-makeup${d.changed.has('pass:makeup') ? ' is-changed' : ''}`}>
        <label htmlFor={`${baseId}-makeup`} className="bbe-label">
          {T.MAKEUP_SENTENCE}
        </label>
        {isPhone ? (
          // Phones: a box that wraps, so the whole sentence can be read while typing (D7).
          // It is still one line of text: Enter does nothing, and a pasted line break is
          // turned into a space when the Dan is tidied for saving.
          <textarea
            id={`${baseId}-makeup`}
            className="input bbe-text bbe-makeup-area"
            rows={3}
            value={draft.pass.makeup ?? ''}
            onChange={(event) => d.setMakeup(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
            aria-invalid={fieldText('pass:makeup') ? 'true' : undefined}
            aria-describedby={`${baseId}-makeup-hint`}
            data-place="pass:makeup"
            maxLength={300}
          />
        ) : (
          <TextBox
            id={`${baseId}-makeup`}
            value={draft.pass.makeup ?? ''}
            onChange={(text) => d.setMakeup(text)}
            invalid={Boolean(fieldText('pass:makeup'))}
            describedBy={`${baseId}-makeup-hint`}
            place="pass:makeup"
            maxLength={300}
          />
        )}
        <FieldNote text={fieldText('pass:makeup')} />
        <p id={`${baseId}-makeup-hint`} className="bbe-hint">
          {T.MAKEUP_HINT}
        </p>
      </div>
    </section>
  );

  // ----- One part -----
  function partSection(part) {
    const nowPart = now.parts.find((p) => p.code === part.code) ?? part;
    const basePart = base.parts.find((p) => p.code === part.code);
    const letters = partLetters(part.code);
    const nameKey = `part:${part.code}:name`;
    const gpKey = `part:${part.code}:gp`;
    const nameMsg = fieldText(nameKey);
    const gpMsg = fieldText(gpKey);
    const credits = nowPart.subjects.reduce((sum, s) => sum + (typeof s.credits === 'number' ? s.credits : 0), 0);
    const group = `bbe-subjects-${part.code}`;
    const moving = drag.state && drag.state.group === group && drag.state.toIndex !== drag.state.fromIndex ? drag.state : null;
    return (
      <section key={part.code} className="bbe-card" aria-label={part.name || part.code}>
        <div className={`bbe-card-head bbe-part-head${d.changed.has(nameKey) ? ' is-changed' : ''}`}>
          {isPhone ? (
            <label className="field bbe-partname">
              <span className="bbe-label">{T.PART_NAME}</span>
              <TextBox value={part.name} onChange={(text) => d.setPartName(part.code, text)} invalid={Boolean(nameMsg)} place={nameKey} maxLength={60} />
            </label>
          ) : (
            <TextBox label={T.PART_NAME} value={part.name} onChange={(text) => d.setPartName(part.code, text)} invalid={Boolean(nameMsg)} place={nameKey} className="bbe-partname-box" maxLength={60} />
          )}
          <span className="bbe-card-meta">
            {boldNew(upToLine(base, now, nowPart, basePart))} · {T.subjectsWord(part.subjects.length)}
          </span>
        </div>
        <FieldNote text={nameMsg} />
        <div className={`bbe-gp${d.changed.has(gpKey) ? ' is-changed' : ''}`}>
          <span className="bbe-gp-label">{T.GRADE_POINTS}</span>
          <div className="bbe-gp-boxes">
            {letters.map((l, li) => (
              <label key={l} className="bbe-gp-box">
                <span className="bbe-gp-letter" aria-hidden="true">
                  {l}
                </span>
                <NumberBox label={T.gradePointLabel(part.name, l)} value={part.grade_points?.[l]} onChange={(v) => d.setGradePoint(part.code, l, v)} invalid={Boolean(gpMsg)} place={li === 0 ? gpKey : undefined} />
              </label>
            ))}
          </div>
        </div>
        <FieldNote text={gpMsg} />
        <p className="bbe-hint">{T.gradePointsHint(danNo, part.name)}</p>

        {!isPhone && (
          <div className="bbe-srow bbe-srow--head" aria-hidden="true">
            <span />
            <span>{T.COL_SUBJECT}</span>
            <span>{T.COL_CREDITS}</span>
            <span>{T.COL_SCORING_TAGS}</span>
            <span className="num">{T.COL_UP_TO}</span>
            <span />
          </div>
        )}
        <div className="bbe-subjects">
          {part.subjects.map((s, index) => {
            const nowS = nowPart.subjects.find((x) => x.id === s.id) ?? s;
            const nameMsgS = fieldText(`subject:${s.id}:name`);
            const creditsMsg = fieldText(`subject:${s.id}:credits`);
            const inner = byPlace.get(`subject:${s.id}:inner`);
            const innerLine = inner ? { cutoffs: T.CHECK_CUTOFFS, points: T.CHECK_POINTS, who: T.CHECK_WHO }[innerKind(inner[0])] ?? T.CHECK_SUBJECT : null;
            const tinted = d.changed.has(`subject:${s.id}`);
            const dragging = drag.state?.id === s.id;
            const actions = (
              <span className="bbe-acts">
                <IconButton label={T.editSubjectLabel(s.name)} Icon={IconEdit} data-place={`subject:${s.id}:edit`} onClick={(event) => onEditSubject(part.code, s.id, event.currentTarget)} />
                <IconButton
                  label={T.subjectMore(s.name)}
                  Icon={IconDots}
                  aria-haspopup="menu"
                  aria-expanded={menu?.kind === 'subject' && menu.key === s.id ? 'true' : 'false'}
                  onClick={(event) => {
                    const anchor = event.currentTarget;
                    setMenu((m) => (m?.kind === 'subject' && m.key === s.id ? null : { kind: 'subject', key: s.id, code: part.code, index, anchor, name: s.name }));
                  }}
                />
              </span>
            );
            const innerNote = innerLine ? (
              <button type="button" className="bbe-inner-note" onClick={(event) => onEditSubject(part.code, s.id, event.currentTarget)}>
                <IconAlertTriangle size={16} aria-hidden="true" />
                {innerLine}
              </button>
            ) : null;
            return (
              <Fragment key={s.id}>
                {moving && moving.gap === index && <div className="dropline" aria-hidden="true" />}
                {isPhone ? (
                  <div className={`bbe-sphone${tinted ? ' is-changed' : ''}${dragging ? ' is-dragging' : ''}`} data-drag-group={group} data-drag-id={s.id}>
                    <Grip label={T.dragSubjectLabel(s.name)} gripProps={drag.gripProps(group, s.id)} disabled={saving} />
                    <div className="bbe-sphone-text">
                      <p className="bbe-sphone-name">
                        <span>{s.name || '—'}</span>
                        <SubjectTags subject={s} />
                      </p>
                      <p className="bbe-sphone-line">{T.phoneSubjectLine(nowS.credits, num(nowS.points?.['A+']), phoneHow(s))}</p>
                      {(nameMsgS || creditsMsg) && <FieldNote text={nameMsgS ?? creditsMsg} />}
                      {innerNote}
                    </div>
                    {actions}
                  </div>
                ) : (
                  <div className={`bbe-srow${tinted ? ' is-changed' : ''}${dragging ? ' is-dragging' : ''}`} data-drag-group={group} data-drag-id={s.id}>
                    <Grip label={T.dragSubjectLabel(s.name)} gripProps={drag.gripProps(group, s.id)} disabled={saving} />
                    <TextBox
                      label={T.subjectNameLabel(s.name)}
                      value={s.name}
                      onChange={(text) => d.setSubject(part.code, s.id, { name: text })}
                      invalid={Boolean(nameMsgS)}
                      place={`subject:${s.id}:name`}
                      maxLength={60}
                    />
                    <NumberBox whole label={T.creditsLabel(s.name)} value={s.credits} onChange={(v) => d.setSubject(part.code, s.id, { credits: v })} invalid={Boolean(creditsMsg)} place={`subject:${s.id}:credits`} />
                    <span className="bbe-scoring">
                      <span>{scoringText(s)}</span> <SubjectTags subject={s} />
                      {innerNote}
                    </span>
                    <span className="num bbe-upto">{num(nowS.points?.['A+'])}</span>
                    {actions}
                  </div>
                )}
                {!isPhone && (nameMsgS || creditsMsg) && <FieldNote text={nameMsgS ?? creditsMsg} />}
              </Fragment>
            );
          })}
          {moving && moving.gap === part.subjects.length && <div className="dropline" aria-hidden="true" />}
        </div>
        <FieldNote text={fieldText(`part:${part.code}:list`)} />
        <div className="bbe-card-foot">
          <button type="button" className="btn btn-sm bbe-add" onClick={(event) => onAddSubject(part.code, event.currentTarget)}>
            <IconPlus size={16} aria-hidden="true" />
            {T.ADD_SUBJECT}
          </button>
          <span className="bbe-credits">{T.creditsTotal(credits)}</span>
        </div>
      </section>
    );
  }

  // ----- Extra points (R7) -----
  const extra = draft.extra_points;
  const items = extra.items ?? [];
  const settingsMsg = fieldText('extra:settings');
  const itemsMoving = drag.state && drag.state.group === 'bbe-items' && drag.state.toIndex !== drag.state.fromIndex ? drag.state : null;
  const extraSection = (
    <section className="bbe-card" aria-labelledby={`${baseId}-extra`}>
      <div className="bbe-card-head">
        <h3 id={`${baseId}-extra`} className="bbe-card-title">
          {T.EXTRA_POINTS_TITLE}
        </h3>
        <span className="bbe-card-meta">{T.extraHead(now.extra_points.counts_toward_total, now.extra_points.limit)}</span>
      </div>
      <div className={`bbe-extra-settings${d.changed.has('extra:settings') ? ' is-changed' : ''}`}>
        <label className="cbrow">
          <input type="checkbox" className="cb" checked={Boolean(extra.counts_toward_total)} onChange={(event) => d.setExtra({ counts_toward_total: event.target.checked })} />
          <span>{T.ADDED_TO_TOTAL}</span>
        </label>
        <label className="bbe-limit">
          <span className="bbe-label-inline">{T.LIMIT}</span>
          <NumberBox label={T.LIMIT} placeholder={T.NO_LIMIT} unit={T.POINTS_UNIT} value={extra.limit} onChange={(v) => d.setExtra({ limit: v })} invalid={Boolean(settingsMsg)} place="extra:settings" />
        </label>
        <label className="cbrow">
          <input type="checkbox" className="cb" checked={Boolean(extra.to_confirm)} onChange={(event) => d.setExtra({ to_confirm: event.target.checked })} />
          <span>{T.TO_CONFIRM_TICK}</span>
        </label>
      </div>
      <FieldNote text={settingsMsg} />
      <p className="bbe-hint">{T.EXTRA_SETTINGS_HINT}</p>
      <div className="bbe-items">
        {items.map((item, i) => {
          const key = `extra:item:${i}`;
          const msg = fieldText(key);
          const tinted = d.changed.has(key);
          const rule = item.rule ?? {};
          const dragging = drag.state?.group === 'bbe-items' && drag.state?.id === String(i);
          return (
            <Fragment key={i}>
              {itemsMoving && itemsMoving.gap === i && <div className="dropline" aria-hidden="true" />}
              <div className={`bbe-item${tinted ? ' is-changed' : ''}${dragging ? ' is-dragging' : ''}`} data-drag-group="bbe-items" data-drag-id={String(i)}>
                <Grip label={T.dragItemLabel(item.name)} gripProps={drag.gripProps('bbe-items', String(i))} disabled={saving} />
                <div className="bbe-item-main">
                  <div className="bbe-item-top">
                    <TextBox label={T.itemNameLabel(item.name)} value={item.name} onChange={(text) => d.setItem(i, { name: text })} invalid={Boolean(msg)} place={key} className="bbe-item-name" maxLength={60} />
                    <Choice
                      labelId={`${baseId}-how-${i}`}
                      className="bbr-gray bbe-kind"
                      options={[
                        { key: 'per_count', label: T.PER_COUNT },
                        { key: 'steps', label: T.STEPS },
                      ]}
                      value={rule.kind}
                      onChange={(kind) => d.setItemKind(i, kind)}
                    />
                    <span id={`${baseId}-how-${i}`} className="visually-hidden">
                      {T.howCountsLabel(item.name)}
                    </span>
                  </div>
                  {rule.kind === 'per_count' ? (
                    <div className="bbe-steps">
                      <span className="bbe-step">
                        <NumberBox label={T.pointsEachLabel(item.name)} value={rule.points_each} onChange={(v) => d.setItem(i, { rule: { ...rule, points_each: v } })} invalid={Boolean(msg)} />
                        <span>{T.POINT_EACH_UNIT}</span>
                      </span>
                    </div>
                  ) : (
                    <div className="bbe-steps">
                      {(rule.steps ?? []).map((st, si) => (
                        <span key={si} className="bbe-step">
                          <span>{T.AT_LEAST}</span>
                          <NumberBox whole label={T.stepAtLeastLabel(item.name, si + 1)} value={st.at_least} onChange={(v) => d.setStep(i, si, { at_least: v })} invalid={Boolean(msg)} />
                          <span aria-hidden="true">→</span>
                          <NumberBox label={T.stepPointsLabel(item.name, si + 1)} value={st.points} onChange={(v) => d.setStep(i, si, { points: v })} invalid={Boolean(msg)} />
                          <span>{T.POINTS_UNIT}</span>
                          {(rule.steps ?? []).length > 1 && <IconButton label={T.removeStepLabel(si + 1)} Icon={IconTrash} onClick={() => d.removeStep(i, si)} />}
                        </span>
                      ))}
                      {(rule.steps ?? []).length < 10 && (
                        <button type="button" className="btn btn-sm bbe-add" onClick={() => d.addStep(i)}>
                          <IconPlus size={16} aria-hidden="true" />
                          {T.ADD_STEP}
                        </button>
                      )}
                    </div>
                  )}
                  <FieldNote text={msg} />
                </div>
                <IconButton
                  label={T.itemMore(item.name)}
                  Icon={IconDots}
                  aria-haspopup="menu"
                  aria-expanded={menu?.kind === 'item' && menu.key === i ? 'true' : 'false'}
                  onClick={(event) => {
                    const anchor = event.currentTarget;
                    setMenu((m) => (m?.kind === 'item' && m.key === i ? null : { kind: 'item', key: i, anchor, name: item.name }));
                  }}
                />
              </div>
            </Fragment>
          );
        })}
        {itemsMoving && itemsMoving.gap === items.length && <div className="dropline" aria-hidden="true" />}
      </div>
      {items.length < 12 && (
        <button type="button" className="btn btn-sm bbe-add" onClick={() => d.addItem('')}>
          <IconPlus size={16} aria-hidden="true" />
          {T.ADD_EXTRA_ITEM}
        </button>
      )}
      <p className="bbe-hint">{T.STEPS_FOOT}</p>
    </section>
  );

  const hand = handedIn(now);
  const handSection = (
    <section className="bbe-card" aria-labelledby={`${baseId}-hand`}>
      <h3 id={`${baseId}-hand`} className="bbe-card-title">
        {T.HANDED_IN_BY}
      </h3>
      <p className="bbe-hand">{hand.length > 0 ? hand.map((h) => h.subject.name).join(' · ') : T.NOTHING_HANDED_IN}</p>
      <p className="bbe-hint">{T.HANDED_IN_FOOT}</p>
    </section>
  );

  // ----- The ⋯ menus -----
  let menuElement = null;
  if (menu) {
    const close = (reason) => {
      const anchor = menu.anchor;
      setMenu(null);
      if (reason === 'escape' || reason === 'tab' || reason === 'select') window.requestAnimationFrame(() => anchor?.isConnected && anchor.focus());
    };
    let items2 = [];
    let title = '';
    if (menu.kind === 'bracket') {
      const only = brackets.length < 2;
      title = menu.label;
      items2 = [
        { key: 'split', label: T.SPLIT_BRACKET, Icon: IconArrowsSplit2, onSelect: () => onSplit(menu.key, menu.anchor) },
        {
          key: 'remove',
          label: only ? <TwoLines label={T.REMOVE_BRACKET} reason={T.ONLY_BRACKET} /> : T.REMOVE_BRACKET,
          Icon: IconTrash,
          danger: !only,
          disabled: only,
          separatorBefore: true,
          onSelect: () => d.removePassBracket(menu.key),
        },
      ];
    } else if (menu.kind === 'subject') {
      const list = draft.parts.find((p) => p.code === menu.code)?.subjects ?? [];
      const index = list.findIndex((s) => s.id === menu.key);
      title = menu.name;
      items2 = [
        { key: 'up', label: T.MOVE_UP, Icon: IconArrowUp, disabled: index <= 0, onSelect: () => d.moveSubject(menu.code, menu.key, index - 1) },
        { key: 'down', label: T.MOVE_DOWN, Icon: IconArrowDown, disabled: index === list.length - 1, onSelect: () => d.moveSubject(menu.code, menu.key, index + 1) },
        { key: 'remove', label: T.REMOVE_SUBJECT, Icon: IconTrash, danger: true, separatorBefore: true, onSelect: () => d.removeSubject(menu.code, menu.key) },
      ];
    } else {
      title = menu.name;
      items2 = [
        { key: 'up', label: T.MOVE_UP, Icon: IconArrowUp, disabled: menu.key === 0, onSelect: () => d.moveItem(menu.key, menu.key - 1) },
        { key: 'down', label: T.MOVE_DOWN, Icon: IconArrowDown, disabled: menu.key === items.length - 1, onSelect: () => d.moveItem(menu.key, menu.key + 1) },
        { key: 'remove', label: T.REMOVE_ITEM, Icon: IconTrash, danger: true, separatorBefore: true, onSelect: () => d.removeItem(menu.key) },
      ];
    }
    menuElement = <RowMenu anchor={menu.anchor} isSheet={isPhone} title={title || '—'} label={title || '—'} items={items2} onClose={close} />;
  }

  // ----- After Reload (R11): their change, and the admin's own changes that weren't saved -----
  const reloadBoxes = afterReload ? (
    <>
      {afterReload.theirLine && <p className="bbe-gray-line">{afterReload.theirLine}</p>}
      {afterReload.yours.length > 0 && (
        <div className="bbe-lost">
          <p className="bbe-lost-head">{T.yourChangesLost(afterReload.yours.length)}</p>
          <ul>
            {afterReload.yours.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <button type="button" className="btn btn-sm" onClick={onHideReload}>
            {T.HIDE}
          </button>
        </div>
      )}
    </>
  ) : null;

  const body = (
    <>
      {errorList}
      {passSection}
      {draft.parts.map(partSection)}
      {extraSection}
      {handSection}
      {menuElement}
    </>
  );

  if (isPhone) {
    return (
      <div className="bbe bbe--phone">
        <div className="bbe-phone-top">
          <span className="bbe-phone-where">{T.phoneEditorSub(phoneWhere, danNo)}</span>
          <button type="button" className="btn btn-sm" onClick={(event) => onCopy(event.currentTarget)}>
            {T.COPY_FROM_DAN}
          </button>
        </div>
        {editorLine && <p className="bbe-gray-line">{editorLine}</p>}
        {topBanners}
        {reloadBoxes}
        {body}
        <div className="bbe-phone-foot">
          <p className="bbe-phone-count">{d.copiedFrom ? `${T.copiedFrom(d.copiedFrom)} · ${T.changesNotSaved(count)}` : T.changesNotSavedPhone(count)}</p>
          {stale && (
            <p id={`${baseId}-stale`} className="bbe-hint bbe-stale-reason">
              {T.RELOAD_FIRST}
            </p>
          )}
          {footerNote}
          {saveButton}
        </div>
      </div>
    );
  }

  return (
    <div className="bbe">
      <div className="bbe-bar" role="region" aria-label={T.editingDan(danNo)}>
        <div className="bbe-bar-text">
          <p className="bbe-bar-title">{T.editingDan(danNo)}</p>
          <p className="bbe-bar-sub">
            {where} · {countText}
          </p>
        </div>
        <div className="bbe-bar-acts">
          <button type="button" className="btn" onClick={(event) => onCopy(event.currentTarget)}>
            {T.COPY_FROM_DAN}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            {T.CANCEL}
          </button>
          <span className="bbe-save-wrap">
            {saveButton}
            {stale && (
              <span id={`${baseId}-stale`} className="bbe-stale-reason">
                {T.RELOAD_FIRST}
              </span>
            )}
          </span>
        </div>
      </div>
      {switcher}
      {editorLine && <p className="bbe-gray-line">{editorLine}</p>}
      {topBanners}
      {reloadBoxes}
      {body}
    </div>
  );
}

// The amber unsaved note for the phone page (v0.56): "Unsaved changes. Save or cancel first." with
// a Discard changes link inside it.
export function PhoneUnsavedNote({ onDiscard }) {
  return (
    <div className="tdialog-note bbe-phone-note">
      <Notice>
        {T.UNSAVED}
        <button type="button" className="note-action" onClick={onDiscard}>
          {T.DISCARD_CHANGES}
        </button>
      </Notice>
    </div>
  );
}
