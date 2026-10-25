// ResultTextDialog.jsx — "Edit result email": an admin changes the wording of ONE of the three
// Black Belt result emails (Passed · Make-up with a D · Make-up below the pass mark).
// Why it exists: approved Results mockup R03 (proposals 24–27, migration 0025's bb_result_texts),
// copied from Star's ResultTextDialog.jsx with Black Belt's blanks and names:
//   - the frame: Black Belt's dialogs (KeepYearsDialog.jsx): PC and tablet a centered dialog with
//     Cancel + Save; phones a full-screen page with the pinned Save (Discard changes is a plain link
//     inside the note, v0.932); the notes "Unsaved changes…", "Someone else changed this…", "Only an
//     admin…"; "Last changed by …"
//   - blanks typed in {braces} (Forms' and Star's): the blanks that work for this kind of email are
//     small OUTLINE buttons that insert the blank where the cursor is (44px tall on touch screens)
//   - the checks under the box, as you type: resultEmail.resultTextProblemDetail gives exactly the
//     database's answer (bb_result_text_problem), so Save is gray whenever the database would refuse
//   - the live preview: the text filled in for a REAL candidate of this kind from the newest cycle
//     that has one ("Preview with: Mia Chen ▾ · Spring 2027"), else a made-up "Sam Example". It reads
//     only the Results list (names, Dan, result) — never a date of birth, an email or a payment.
//   - "Reset to the starting text" puts the R03 starting text back in the box; nothing saves until
//     Save, and Cancel keeps the old text.
// PLAIN TEXT ONLY: an admin can type < > & — the box, the blank highlights and the preview are all
// React text, never HTML.
//
// The typed text lives in ResultEmailsBlock (state), so a screen lock while the dialog is open
// hides it and brings it back afterwards with the text still there.
// The gray blank highlights inside the box: a <textarea> can't color parts of its text, so a
// "mirror" <div> with exactly the same font, padding and wrapping sits BEHIND a transparent
// textarea and paints a gray (or amber, for a wrong blank) background under each {blank}.
//
// Props:
//   state      { key, kind, body, note, saving, blocked } (ResultEmailsBlock's)
//   record     the text as stored now ({ updatedByName, updatedAt } for "Last changed by …")
//   isPhone, isTouch
//   onChange(body), onSave(), onCancel(), onRequestClose(), onNoAccess()
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { loadCycles } from '../../../lib/blackBelt/api.js';
import { loadResults } from '../../../lib/blackBelt/gradingApi.js';
import { BLANKS_BY_KIND, STARTING_TEXTS, buildResultMessage, resultKind, resultTextProblemDetail } from '../../../lib/blackBelt/resultEmail.js';
import { emailAnswerFromRow } from '../results/resultLines.js';
import * as T from '../results/text.js';
import { lastChanged } from '../text.js';
import '../results/results.css';

// How many cycles (newest first testing day first) the preview looks through.
const CYCLES_TO_SEARCH = 10;
const NOTES = { UNSAVED: T.UNSAVED, STALE: T.TEXT_STALE, NOT_ALLOWED: T.TEXT_NOT_ALLOWED, INVALID: T.TEXT_INVALID, SAVE_FAILED: T.TEXT_SAVE_FAILED };
const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE', 'NOT_ALLOWED'];

// ----- The preview candidates -----
// The newest cycle that has at least one candidate whose email is this kind.
// → { status:'ok', cycleName, candidates: [{ id, name, answer }] } (sorted by name) ·
//   { status:'none' } · { status:'no_access' }
async function findPreviewCandidates(kind) {
  const list = await loadCycles();
  if (list.status === 'no_access') return { status: 'no_access' };
  if (list.status !== 'ok') return { status: 'none' };
  const cycles = [...list.cycles]
    .filter((c) => c.candidateCount > 0)
    .sort((a, b) => String(b.firstDay ?? '').localeCompare(String(a.firstDay ?? '')))
    .slice(0, CYCLES_TO_SEARCH);
  for (const cycle of cycles) {
    const res = await loadResults({ cycleId: cycle.id, dan: null });
    if (res.status === 'no_access') return { status: 'no_access' };
    if (res.status !== 'ok') continue;
    const candidates = [];
    for (const row of res.rows) {
      if (resultKind(row.result) !== kind) continue;
      const danObj = res.rubrics.find((d) => d.dan === row.dan) ?? null;
      candidates.push({ id: row.id, name: `${row.firstName} ${row.lastName}`, answer: emailAnswerFromRow(row, danObj, res.cycle.name, kind) });
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.name.localeCompare(b.name, 'en-US'));
      return { status: 'ok', cycleName: res.cycle.name, candidates };
    }
  }
  return { status: 'none' };
}

// The made-up "Sam Example" for a kind (only when no real candidate has this result yet).
function sampleCandidate(kind) {
  const base = { kind, firstName: T.SAMPLE_CANDIDATE.firstName, lastName: T.SAMPLE_CANDIDATE.lastName, cycleName: T.SAMPLE_CYCLE_NAME, dan: 1, passMark: 275 };
  const byKind = {
    passed: { total: 301.5, reasons: [], needs: [], dSubjects: [] },
    makeup_d: { total: 268, reasons: ['d', 'below'], needs: ['Free sparring'], dSubjects: ['Free sparring'] },
    makeup_below: { total: 263, reasons: ['below'], needs: ['Korean terminology', 'Power Break'], dSubjects: [] },
  };
  return { cycleName: T.SAMPLE_CYCLE_NAME, candidates: [{ id: 'sample', name: `${base.firstName} ${base.lastName}`, answer: { ...base, ...byKind[kind] } }] };
}

// The text cut into pieces: plain text and {blanks}, each blank marked ok (gray) or wrong (amber).
function textPieces(body, allowed) {
  const pieces = [];
  const pattern = /\{([^{}]*)\}/g;
  let last = 0;
  for (const m of body.matchAll(pattern)) {
    if (m.index > last) pieces.push({ text: body.slice(last, m.index) });
    pieces.push({ text: m[0], blank: allowed.includes(m[1]) ? 'ok' : 'bad' });
    last = m.index + m[0].length;
  }
  if (last < body.length) pieces.push({ text: body.slice(last) });
  return pieces;
}

export default function ResultTextDialog({ state, record, isPhone, isTouch, onChange, onSave, onCancel, onRequestClose, onNoAccess }) {
  const kind = state.kind;
  const body = state.body;
  const readOnly = state.saving;
  const idBase = `bb-rtext-${state.key}`;
  const allowed = BLANKS_BY_KIND[kind] ?? [];
  const problem = resultTextProblemDetail(kind, body);
  const problemText = T.resultTextProblemText(problem);
  const canSave = !problem && !state.blocked && !state.saving;

  // ----- The box: grows with its text; the caret goes after an inserted blank -----
  const areaRef = useRef(null);
  const caretRef = useRef(null);
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`; // + the 1px border top and bottom
    if (caretRef.current !== null) {
      const at = caretRef.current;
      caretRef.current = null;
      el.focus();
      el.setSelectionRange(at, at);
    }
  }, [body]);

  function insertBlank(name) {
    if (readOnly) return;
    const el = areaRef.current;
    const start = el ? el.selectionStart : body.length;
    const end = el ? el.selectionEnd : body.length;
    const blank = `{${name}}`;
    caretRef.current = start + blank.length;
    onChange(body.slice(0, start) + blank + body.slice(end));
  }

  // ----- The preview candidates (loaded once per opening) -----
  const [preview, setPreview] = useState({ status: 'loading' });
  const [pickedId, setPickedId] = useState(null);
  const noAccessRef = useRef(onNoAccess);
  useEffect(() => {
    noAccessRef.current = onNoAccess;
  });
  useEffect(() => {
    let alive = true;
    findPreviewCandidates(kind).then((found) => {
      if (!alive) return;
      if (found.status === 'no_access') {
        noAccessRef.current?.();
        return;
      }
      const ready = found.status === 'ok' ? { ...found, sample: false } : { ...sampleCandidate(kind), sample: true };
      setPreview({ ...ready, status: 'ready' }); // 'ready' last: found.status ('ok') must not win
      setPickedId(ready.candidates[0]?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, [kind, state.key]);

  const picked = preview.status === 'ready' ? (preview.candidates.find((c) => c.id === pickedId) ?? preview.candidates[0]) : null;
  let previewBody = null;
  if (!problem && picked) {
    const built = buildResultMessage({ texts: { [kind]: { body } }, answer: picked.answer });
    if (built.status === 'ok') previewBody = built.body;
  }
  const hint = isTouch ? T.BLANKS_HINT_TOUCH : T.BLANKS_HINT;

  const saveButton = (
    <button type="submit" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`} aria-disabled={canSave ? undefined : 'true'}>
      {/* ti-check = Save */}
      <IconCheck size={16} aria-hidden="true" />
      {state.saving ? T.SAVING : T.SAVE}
    </button>
  );
  const noteBlock = state.note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && state.note === 'STALE' ? T.TEXT_STALE_PHONE : NOTES[state.note]}
        {isPhone && PHONE_DISCARD_NOTES.includes(state.note) && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );

  return (
    <Dialog title={T.EDIT_RESULT_EMAIL} size="bb-email" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub bbrt-sub">{`${T.KIND_NAME[kind]} · ${T.KIND_USE[kind]}`}</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onSave();
        }}
      >
        <div className="field bbrt-field">
          <div className="bbrt-head">
            <label htmlFor={`${idBase}-body`}>{T.MESSAGE_LABEL}</label>
            <button
              type="button"
              className="btn btn-sm"
              disabled={readOnly}
              onClick={() => {
                caretRef.current = null;
                onChange(STARTING_TEXTS[kind]);
              }}
            >
              {T.RESET_TO_STARTING_TEXT}
            </button>
          </div>
          <div className={`bbrt-box${problem ? ' is-bad' : ''}${readOnly ? ' is-readonly' : ''}`}>
            {/* The mirror behind the box: only the blanks' backgrounds show (its text is invisible) */}
            <div className="bbrt-mirror" aria-hidden="true">
              {textPieces(body, allowed).map((p, i) =>
                p.blank ? (
                  <mark key={i} className={p.blank === 'ok' ? 'bbrt-blank' : 'bbrt-blank is-bad'}>
                    {p.text}
                  </mark>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )}
              {'\u200B' /* a zero-width space: keeps a last empty line the same height as the textarea's */}
            </div>
            <textarea
              ref={areaRef}
              id={`${idBase}-body`}
              className="bbrt-area"
              rows={8}
              spellCheck
              data-autofocus
              readOnly={readOnly}
              value={body}
              aria-invalid={problem ? true : undefined}
              aria-describedby={`${problem ? `${idBase}-error ` : ''}${idBase}-hint`}
              onChange={(event) => onChange(event.target.value)}
            />
          </div>
          {problemText && <Notice id={`${idBase}-error`}>{problemText}</Notice>}
        </div>

        <div className="bbrt-blanks">
          <div className="bbrt-lbl" id={`${idBase}-insert`}>
            {T.INSERT_A_BLANK}
          </div>
          <div className="bbrt-chips" role="group" aria-labelledby={`${idBase}-insert`}>
            {allowed.map((name) => (
              <button
                key={name}
                type="button"
                className="bbrt-chip"
                disabled={readOnly}
                aria-label={T.insertBlankLabel(name)}
                // Keep the caret in the box on a mouse click (the button doesn't take focus).
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertBlank(name)}
              >
                {`{${name}}`}
              </button>
            ))}
          </div>
          <p id={`${idBase}-hint`} className="field-hint bbrt-hint">
            {hint}
          </p>
        </div>

        <div className="bbrt-prev">
          <div className="bbrt-lbl bbrt-prevline">
            {preview.status === 'ready' && !preview.sample && (
              <>
                <label htmlFor={`${idBase}-who`}>{T.PREVIEW_WITH}</label>
                <select id={`${idBase}-who`} className="input bbrt-select" value={picked?.id ?? ''} onChange={(event) => setPickedId(event.target.value)}>
                  {preview.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span>· {preview.cycleName}</span>
              </>
            )}
            {preview.status === 'ready' && preview.sample && (
              <span>
                {T.PREVIEW_WITH} {picked?.name} · {T.SAMPLE_NOTE}
              </span>
            )}
            {preview.status === 'loading' && <span>{T.PREVIEW_WITH}</span>}
          </div>
          <div className="bbrt-prevbox">
            {problem ? (
              <span className="bbrt-prevnote">{T.PREVIEW_NEEDS_NO_ERRORS}</span>
            ) : previewBody !== null ? (
              previewBody
            ) : (
              <span className="bbrt-prevnote">{T.PREVIEW_LOADING}</span>
            )}
          </div>
        </div>

        {record?.updatedByName && record?.updatedAt && <p className="tmeta">{lastChanged(record.updatedByName, record.updatedAt)}</p>}
        {isPhone && noteBlock}
        {isPhone ? (
          <div className="dialog-page-submit">{saveButton}</div>
        ) : (
          <div className="dialog-footer">
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={onCancel}>
                {T.CANCEL}
              </button>
              {saveButton}
            </div>
            {noteBlock}
          </div>
        )}
      </form>
    </Dialog>
  );
}
