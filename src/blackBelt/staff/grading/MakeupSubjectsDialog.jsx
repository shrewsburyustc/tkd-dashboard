// MakeupSubjectsDialog.jsx — "Make-up subjects for Zoe Martin": an admin chooses which subjects a
// candidate retests when every subject is graded, there is no D, and the total is below the pass
// mark (rulebook v0.940 / G3; approved Grading mockup G05, proposals G 21–G 23; Star v0.130 / v0.513).
// Why it exists: below the mark with no D there is no single obvious subject to retest, so an admin
// picks. The database checks it is an admin (bb_set_makeup_subjects is admin-only, contract 0025
// §7.1) — staff never see the link ("· an admin chooses subjects", G 31).
// Used from the Grading tab (the Result column, the phone card), the Results tab (C2) and the
// make-up picker (C3).
//
//   Make-up subjects for Zoe Martin
//   260 of 339 + 3 extra = 263 · 275 needed · no D. Lowest grades are ticked to start.
//   [x] Power Break         Curriculum · 5 credits              C-     (lowest grade first, then
//   [x] 1/2 or 1 mile       Physical · 3 credits · 11:30 min    C       rubric order; measured: the
//   [ ] Sprint 4x10 m       Physical · 2 credits · 11.4 sec     B       number)
//   If the ticked subjects all get A+: 289 (275 needed).                 (amber when still below)
//   Zoe retests the ticked subjects at a later cycle (no fee). The rest keep their grades.
//                                                          [Cancel] [Save]
// Phones: full screen with Save at the top (G 23).
// Starting ticks (Star v0.513 word for word, grading.js startingTicks): every subject below B, or —
// when none is below B — every subject tied for the lowest grade. If subjects were already chosen
// (the result has `needs` and no choice is needed), those are ticked instead. Nothing saves until Save.
// The dialog WAITS for the database's answer:
//   ok             onSaved(answer) then onClose(true) — the caller reloads its data
//   stale          someone chose meanwhile → amber note, Close only
//   already_added  a make-up of this candidate is already on a later cycle → amber note, Close only
//   invalid / not_found / withdrawn   the result no longer needs a choice → amber note, Close only
//   not_allowed    only an admin can choose → amber note
//   no_access      close, then lock the screen (onNoAccess)
//   error          "Couldn't save. Check the connection, then try again." (Save stays)
//
// PROPS (C2 and C3 import this file from '../grading/MakeupSubjectsDialog.jsx'):
//   candidate   { id, firstName, lastName } (or { id, name, firstName }) — whose subjects
//   result      the candidate's result as gradingApi returns it (snake_case: subjects, total,
//               maximum, pass_mark, extra, needs, choice_needed …)
//   rubric      the candidate's Dan object of the cycle's rubric (gradingApi's `rubric` from
//               loadGradingGrid, or one of loadResults' `rubrics`) — names, parts, credits, A+ points
//   open        false draws nothing (default true)
//   isAdmin     false draws nothing (staff never choose)
//   isPhone     optional; full screen on phones (worked out from the screen when left out)
//   onClose(changed)   the dialog closed; changed = true when the caller should reload
//   onSaved(answer)    optional: after an 'ok' save ({ status:'ok', ids, result })
//   onNoAccess()       the database says this sign-in is locked
//   onModalOpenChange(open)   optional: tells the App a dialog is open (the page behind turns inert)
import { useEffect, useId, useState } from 'react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { bestCase, startingTicks, subjectIndex } from '../../../lib/blackBelt/grading.js';
import { setMakeupSubjects } from '../../../lib/blackBelt/gradingApi.js';
import { PHONE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { measuredWithShortUnit, partName } from './model.js';
import * as T from './text.js';
import './grading.css';

const list = (v) => (Array.isArray(v) ? v : []);

// The offered subjects with what each line says, and the ticks to start with.
function startState(result, rubric) {
  const { offered, ticked } = startingTicks(result);
  const index = subjectIndex(rubric);
  const rows = offered.map((s) => {
    const found = index.get(s.id);
    const subject = found?.subject ?? null;
    return {
      id: s.id,
      name: subject?.name ?? '',
      line: T.chooseLine(partName(rubric, s.part), subject?.credits ?? 0, s.measured !== null ? measuredWithShortUnit(subject, s.way, s.measured) : null),
      letter: s.letter,
    };
  });
  const chosen = !result?.choice_needed && list(result?.needs).length > 0 ? list(result.needs).filter((id) => rows.some((r) => r.id === id)) : null;
  return { rows, ticked: chosen ?? ticked };
}

export default function MakeupSubjectsDialog({ open = true, ...props }) {
  if (!open || !props.isAdmin || !props.candidate || !props.result) return null;
  return <ChooseDialog {...props} />;
}

function ChooseDialog({ candidate, result, rubric, isPhone: isPhoneProp, onClose, onSaved, onNoAccess, onModalOpenChange }) {
  const idBase = useId();
  const phoneQuery = useMediaQuery(PHONE_QUERY);
  const isPhone = isPhoneProp ?? phoneQuery;
  const [{ rows, ticked: firstTicked }] = useState(() => startState(result, rubric));
  const [ticked, setTicked] = useState(firstTicked);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null); // { text, closeOnly }
  const [showNone, setShowNone] = useState(false);
  const firstName = candidate.firstName ?? String(candidate.name ?? '').split(' ')[0];
  const name = candidate.name ?? `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim();

  // The page behind turns inert while this is open (App.jsx).
  useEffect(() => {
    if (!onModalOpenChange) return undefined;
    onModalOpenChange(true);
    return () => onModalOpenChange(false);
  }, [onModalOpenChange]);

  const extra = result?.extra?.counted ? result.extra.total ?? 0 : 0;
  const sub = T.chooseSub({
    base: (result?.total ?? 0) - extra, maximum: result?.maximum, extra, total: result?.total, passMark: result?.pass_mark, hasExtra: extra > 0,
  });
  const best = bestCase(result, rubric, ticked);

  function toggle(id, on) {
    setShowNone(false);
    // Keep the list's order so "expected" and "ids" never depend on click order.
    setTicked((current) => rows.map((r) => r.id).filter((x) => (x === id ? on : current.includes(x))));
  }

  async function save() {
    if (saving || note?.closeOnly) return;
    if (ticked.length === 0) {
      setShowNone(true);
      return;
    }
    setSaving(true);
    setNote(null);
    const answer = await setMakeupSubjects({
      candidateId: candidate.id,
      // What this dialog showed as already chosen (nothing while a choice is still needed).
      expectedIds: result?.choice_needed ? [] : list(result?.needs),
      ids: ticked,
    });
    setSaving(false);
    switch (answer.status) {
      case 'ok':
        onSaved?.(answer);
        onClose(true);
        return;
      case 'no_access':
        onClose(false);
        onNoAccess?.();
        return;
      case 'stale':
        setNote({ text: T.S.CHOOSE_STALE, closeOnly: true });
        return;
      case 'already_added':
        setNote({ text: T.CHOOSE_ALREADY_ADDED(firstName), closeOnly: true });
        return;
      case 'not_allowed':
        setNote({ text: T.S.CHOOSE_NOT_ALLOWED, closeOnly: true });
        return;
      case 'invalid':
      case 'not_found':
      case 'withdrawn':
        setNote({ text: T.S.CHOOSE_INVALID, closeOnly: true });
        return;
      default:
        setNote({ text: T.S.CHOOSE_FAILED, closeOnly: false });
    }
  }

  const closeOnly = note?.closeOnly === true;
  const requestClose = () => onClose(closeOnly);
  const noteBlock = note && (
    <div className="tdialog-note">
      <Notice>{note.text}</Notice>
    </div>
  );
  const saveButton = (
    <button
      type="submit"
      className={`btn btn-primary${saving ? ' is-unavailable' : ''}`}
      aria-disabled={saving ? 'true' : undefined}
      form={`${idBase}-form`}
    >
      {saving ? T.SAVING : T.SAVE}
    </button>
  );

  return (
    <Dialog title={T.chooseTitle(name)} size="medium" fullScreen={isPhone} onRequestClose={requestClose}>
      {/* Phones: Save at the top, in the page's title row (G 23). After a refusal: Close. */}
      {isPhone && (
        <div className="bbg-page-save">
          {closeOnly ? (
            <button type="button" className="btn btn-primary" onClick={() => onClose(true)}>
              {T.CLOSE}
            </button>
          ) : (
            saveButton
          )}
        </div>
      )}
      <p className="tdialog-sub">{sub}</p>
      <form
        id={`${idBase}-form`}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        noValidate
      >
        {isPhone && noteBlock}
        <fieldset className="bbg-choose-list" aria-describedby={showNone ? `${idBase}-none` : undefined}>
          <legend className="visually-hidden">{T.SUBJECTS_LABEL}</legend>
          {rows.map((r, index) => (
            <label key={r.id} className="cbrow bbg-choose-row" htmlFor={`${idBase}-${r.id}`}>
              <input
                id={`${idBase}-${r.id}`}
                type="checkbox"
                className="cb"
                checked={ticked.includes(r.id)}
                disabled={saving || closeOnly}
                data-autofocus={index === 0 && !isPhone ? true : undefined}
                onChange={(event) => toggle(r.id, event.target.checked)}
              />
              <span className="bbg-choose-name">
                {r.name}
                <small>{r.line}</small>
              </span>
              <span className={`bbg-choose-grade${r.letter === 'D' ? ' is-d' : ''}`}>{r.letter}</span>
            </label>
          ))}
        </fieldset>
        {showNone && (
          <p id={`${idBase}-none`} className="field-hint bbg-warn-text">
            {T.CHOOSE_NONE}
          </p>
        )}
        {/* G 22: the best case, amber when even all A+ stays below the pass mark */}
        {best.passMark !== null && (
          <p className={`bbg-bestcase${best.stillBelow ? ' is-below' : ''}`} aria-live="polite">
            {T.bestCaseLine(best.total, best.passMark)}
          </p>
        )}
        <p className="field-hint">{T.chooseNote(firstName)}</p>
        {!isPhone && (
          <div className="dialog-footer">
            <div className="dialog-actions">
              {closeOnly ? (
                <button type="button" className="btn btn-primary" data-autofocus onClick={() => onClose(true)}>
                  {T.CLOSE}
                </button>
              ) : (
                <>
                  <button type="button" className="btn" onClick={() => onClose(false)}>
                    {T.CANCEL}
                  </button>
                  {saveButton}
                </>
              )}
            </div>
            {noteBlock}
          </div>
        )}
      </form>
    </Dialog>
  );
}

