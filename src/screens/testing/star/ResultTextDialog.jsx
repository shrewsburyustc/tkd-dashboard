// ResultTextDialog.jsx — "Edit result email": an admin changes the wording of ONE of the three
// result emails (Passed · Make-up with a D · Make-up below 245).
// Why it exists: build phase 6, gap mockups R11 (proposals 46–52, rulebook v0.514; R3 = B — admins
// edit the texts in the dashboard). Built from parts the app already has:
//   - the frame, Save with the version the dialog opened with, the notes ("Someone else changed
//     this just now…", "Only an admin can change Rubrics and prices…") and "Last changed by …":
//     StarFormDialog.jsx, exactly like Edit fees / Edit grade values (proposal 51)
//   - blanks typed in {braces}: Forms' thank-you message (FormSettings.jsx). Because there are up to
//     eleven blanks (not two), the hint's blanks are small OUTLINE buttons that insert the blank
//     where the cursor is (44px tall on touch screens). Only the blanks that work for this kind of
//     email are offered (BLANKS_BY_KIND, proposal 47).
//   - the checks under the box, as you type (proposal 48): resultEmail.resultTextProblemDetail gives
//     exactly the database's answer (star_result_text_problem, migration 0023), so Save is gray
//     whenever the database would refuse the text.
//   - the live preview (proposal 49): the text filled in for a REAL candidate of this kind from the
//     most recent event that has one ("Preview with: Noah Chen ▾ · Fall 2026 Star Testing"), else a
//     made-up "Sam Example". It reads only the Results list (names, Dan, result) — never a date of
//     birth, an email or a payment.
//   - "Reset to the starting text" (proposal 50) puts the R3 starting text back in the box; nothing
//     saves until Save, and Cancel keeps the old text.
// PLAIN TEXT ONLY: an admin can type < > & — the box, the blank highlights and the preview are all
// React text, never HTML.
//
// The typed text lives in RubricsTab (like every Star dialog), so a screen lock while the dialog is
// open hides it and brings it back afterwards with the text still there.
//
// The gray blank highlights inside the box: a <textarea> can't color parts of its text, so a
// "mirror" <div> with exactly the same font, padding and wrapping sits BEHIND a transparent
// textarea and paints a gray (or amber, for a wrong blank) background under each {blank}. The
// textarea grows with its text (no inner scrollbar), so the two always line up.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Notice from '../../../components/Notice.jsx';
import { loadStarEvents, loadStarEvent } from '../../../lib/star/eventsApi.js';
import { loadResults } from '../../../lib/star/resultsApi.js';
import { BLANKS_BY_KIND, STARTING_TEXTS, buildResultMessage, resultKind, resultTextProblemDetail } from '../../../lib/star/resultEmail.js';
import * as R from '../../../lib/star/resultsText.js';
import { maxFor, topGradeValue, totalCredits } from './rubricRules.js';
import StarFormDialog from './StarFormDialog.jsx';

// How many events (newest testing day first) the preview looks through for a candidate of this kind.
const EVENTS_TO_SEARCH = 10;

// ----- The preview candidates -----
// The most recent event (by testing day) that has at least one candidate whose email is this kind.
// → { status:'ok', event: { name, testingDate }, candidates: [{ id, name, row, danLabel }] } (sorted by
//   name) · { status:'none' } (no such candidate anywhere) · { status:'no_access' } · { status:'error' }
async function findPreviewCandidates(kind) {
  const list = await loadStarEvents();
  if (list.status !== 'ok') return { status: list.status === 'no_access' ? 'no_access' : 'error' };
  const events = [...list.events]
    .sort((a, b) => String(b.testingDate).localeCompare(String(a.testingDate)) || String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, EVENTS_TO_SEARCH);
  for (const event of events) {
    if (event.activeCount === 0) continue; // nobody to look at
    const one = await loadStarEvent(event.id);
    if (one.status === 'no_access') return { status: 'no_access' };
    if (one.status !== 'ok') continue;
    const dans = one.copy?.dans ?? [];
    if (dans.length === 0) continue;
    const res = await loadResults(event.id, dans.map((d) => d.dan));
    if (res.status === 'no_access') return { status: 'no_access' };
    if (res.status !== 'ok') continue;
    const candidates = [];
    for (const d of dans) {
      for (const row of res.dans[d.dan]?.rows ?? []) {
        if (resultKind(row.result) !== kind) continue;
        candidates.push({ id: row.id, name: `${row.firstName} ${row.lastName}`, row, danLabel: d.label });
      }
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.name.localeCompare(b.name, 'en-US'));
      return { status: 'ok', event: { name: event.name, testingDate: event.testingDate }, candidates };
    }
  }
  return { status: 'none' };
}

// The made-up "Sam Example" for a kind, from the first Dan's current rubric (its pass mark, its max
// and its first category names), testing today. Only used when no real candidate has this result.
function sampleCandidate(kind, rubrics, today) {
  const dan = rubrics?.dans?.[0];
  const passMark = dan?.passMark ?? 245;
  const maxScore = dan ? maxFor(totalCredits(dan.categories), topGradeValue(rubrics.grades)) : 315;
  const names = (dan?.categories ?? []).map((c) => c.name);
  const first = names[0] ?? 'Breaking';
  const two = names.length >= 2 ? names.slice(0, 2) : [first];
  const result = {
    passed: { status: 'passed', total: Math.min(maxScore, passMark + 35), makeupReasons: [], needs: [], dSubjects: [] },
    makeup_d: { status: 'makeup', total: Math.max(0, passMark - 17.5), makeupReasons: ['d', 'below'], needs: [first], dSubjects: [first] },
    makeup_below: { status: 'makeup', total: Math.max(0, passMark - 15), makeupReasons: ['below'], needs: two, dSubjects: [] },
  }[kind];
  const row = {
    id: 'sample',
    firstName: R.SAMPLE_CANDIDATE.firstName,
    lastName: R.SAMPLE_CANDIDATE.lastName,
    starsTo: 1,
    result: { ...result, passMark, maxScore, choiceNeeded: false, private: null },
  };
  return {
    event: { name: R.SAMPLE_EVENT_NAME, testingDate: today },
    candidates: [{ id: 'sample', name: `${row.firstName} ${row.lastName}`, row, danLabel: dan?.label ?? '1st Dan' }],
  };
}

// 'YYYY-MM-DD' today on this device (only for the made-up candidate's testing day).
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

export default function ResultTextDialog({ state, record, passMark, rubrics, isPhone, isTouch, onChange, onSave, onCancel, onRequestClose, onNoAccess }) {
  const kind = state.kind;
  const body = state.values.body;
  const readOnly = state.saving;
  const idBase = `star-rtext-${state.key}`;
  const allowed = BLANKS_BY_KIND[kind] ?? [];
  const problem = resultTextProblemDetail(kind, body);
  const problemText = R.resultTextProblemText(problem);

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
      // No real candidate (or the lists couldn't be read): the made-up one.
      const ready = found.status === 'ok' ? { ...found, sample: false } : { ...sampleCandidate(kind, rubrics, localToday()), sample: true };
      setPreview({ ...ready, status: 'ready' }); // 'ready' last: found.status ('ok') must not win
      setPickedId(ready.candidates[0]?.id ?? null);
    });
    return () => {
      alive = false;
    };
    // Only when the dialog opens (its key) — not on every keystroke. `rubrics` is read once on
    // purpose (the made-up candidate only needs the pass mark and category names).
  }, [kind, state.key]);

  const picked = preview.status === 'ready' ? (preview.candidates.find((c) => c.id === pickedId) ?? preview.candidates[0]) : null;
  let previewBody = null;
  if (!problem && picked) {
    const built = buildResultMessage({
      texts: { [kind]: { body } },
      row: picked.row,
      eventName: preview.event.name,
      testingDate: preview.event.testingDate,
      danLabel: picked.danLabel,
    });
    if (built.status === 'ok') previewBody = built.body;
  }

  const meta = record ? { name: record.updatedByName, at: record.updatedAt } : null;
  const hint = isTouch ? R.BLANKS_HINT_TOUCH : R.BLANKS_HINT;

  return (
    <StarFormDialog
      title={R.EDIT_RESULT_EMAIL}
      subtitle={`${R.kindName(kind, passMark)} · ${R.kindUse(kind, passMark)}`}
      size="star-email"
      isPhone={isPhone}
      note={state.note}
      canSave={!problem && !state.blocked}
      saving={state.saving}
      meta={meta}
      onSave={onSave}
      onCancel={onCancel}
      onRequestClose={onRequestClose}
    >
      <div className="field st-rtext-field">
        <div className="st-rtext-head">
          <label htmlFor={`${idBase}-body`}>{R.MESSAGE_LABEL}</label>
          <button
            type="button"
            className="btn btn-sm"
            disabled={readOnly}
            onClick={() => {
              caretRef.current = null;
              onChange(STARTING_TEXTS[kind]);
            }}
          >
            {R.RESET_TO_STARTING_TEXT}
          </button>
        </div>
        <div className={`st-rtext-box${problem ? ' is-bad' : ''}${readOnly ? ' is-readonly' : ''}`}>
          {/* The mirror behind the box: only the blanks' backgrounds show (its text is invisible) */}
          <div className="st-rtext-mirror" aria-hidden="true">
            {textPieces(body, allowed).map((p, i) =>
              p.blank ? (
                <mark key={i} className={p.blank === 'ok' ? 'st-blank' : 'st-blank is-bad'}>
                  {p.text}
                </mark>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
            {'​'}
          </div>
          <textarea
            ref={areaRef}
            id={`${idBase}-body`}
            className="st-rtext-area"
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

      <div className="st-rtext-blanks">
        <div className="st-rtext-lbl" id={`${idBase}-insert`}>
          {R.INSERT_A_BLANK}
        </div>
        <div className="st-chips" role="group" aria-labelledby={`${idBase}-insert`}>
          {allowed.map((name) => (
            <button
              key={name}
              type="button"
              className="st-chip"
              disabled={readOnly}
              aria-label={R.insertBlankLabel(name)}
              // Keep the caret in the box on a mouse click (the button doesn't take focus).
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertBlank(name)}
            >
              {`{${name}}`}
            </button>
          ))}
        </div>
        <p id={`${idBase}-hint`} className="field-hint st-rtext-hint">
          {hint}
        </p>
      </div>

      <div className="st-rtext-prev">
        <div className="st-rtext-lbl st-rtext-prevline">
          {preview.status === 'ready' && !preview.sample && (
            <>
              <label htmlFor={`${idBase}-who`}>{R.PREVIEW_WITH}</label>
              <select
                id={`${idBase}-who`}
                className="input st-rtext-select"
                value={picked?.id ?? ''}
                onChange={(event) => setPickedId(event.target.value)}
              >
                {preview.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span>· {preview.event.name}</span>
            </>
          )}
          {preview.status === 'ready' && preview.sample && (
            <span>
              {R.PREVIEW_WITH} {picked?.name} · {R.SAMPLE_NOTE}
            </span>
          )}
          {preview.status === 'loading' && <span>{R.PREVIEW_WITH}</span>}
        </div>
        <div className="st-preview st-rtext-prevbox">
          {problem ? (
            <span className="st-rtext-prevnote">{R.PREVIEW_NEEDS_NO_ERRORS}</span>
          ) : previewBody !== null ? (
            previewBody
          ) : (
            <span className="st-rtext-prevnote">{R.PREVIEW_LOADING}</span>
          )}
        </div>
      </div>
    </StarFormDialog>
  );
}
