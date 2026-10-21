// MakeupChoiceDialog.jsx — "Make-up subjects for Ethan Lopez": an admin chooses which subjects a
// candidate retests when the total is below the pass mark with no D (rulebook v0.130, Grading
// mockups screen 6; opened from the Result column's "Choose subjects" link, proposal 25).
// Why it exists: below 245 with no D there is no single obvious subject to retest, so an admin picks
// (v0.130 option C). The database checks it is an admin (star_set_makeup_subjects, "A" in contract
// 0006 §6.5) — staff never see the link ("· an admin chooses subjects").
//
//   Make-up subjects for Ethan Lopez
//   212.5 of 315 · 245 needed · no D. Lowest grades are ticked to start.
//   [x] Breaking · 5 credits              C        (lowest grade first, then the rubric's order)
//   [x] Advanced Motion · 5 credits       C+
//   [ ] White–Deputy Curriculum · 15 credits  B
//   Ethan retests the ticked subjects at the next star testing (no fee). The rest keep their grades.
//                                         [Cancel] [Save]
//
// Which are ticked to start (v0.130 "the lowest grades"; screen 6 ticks the C and C+ subjects and
// not the B ones) — decided by Jeffrey in the preview (rulebook v0.513, Option A): every subject
// graded below B; if there is none, every subject with the lowest grade. Assistant Instructor is not offered (it is worked out from
// the assistant-class count, v0.126).
// The dialog WAITS for the database's answer (one change at a time, like the Candidates dialogs):
//   ok          close; the grid reloads and the Result reads "⚠ Make-up · retests …"
//   stale       someone chose meanwhile — amber note, Close shows the latest
//   invalid / not_found / withdrawn   the result no longer needs a choice — amber note
//   not_allowed only an admin can choose — amber note
//   no_access   lock the screen;  error   "Couldn't save. Check the connection, then try again."
import { useId, useState } from 'react';
import Dialog from '../../../../components/Dialog.jsx';
import { setMakeupSubjects } from '../../../../lib/star/gradingApi.js';
import { Footer, NoteBlock } from '../candidates/dialogParts.jsx';
import * as T from './text.js';

const { G } = T;

// The subjects to offer, lowest grade first (then the rubric's order), and the ones ticked to start.
export function choiceStart(result, letters) {
  const rank = (grade) => letters.indexOf(grade); // A+ = 0 … D = last: a bigger number is a lower grade
  const subjects = (result?.subjects ?? [])
    .filter((s) => !s.fromClassCount && s.grade !== null)
    .sort((a, b) => rank(b.grade) - rank(a.grade) || a.position - b.position);
  // (A grade list without a B would make rank('B') -1 and tick everything: then use the fallback.)
  const belowB = letters.includes('B') ? subjects.filter((s) => rank(s.grade) > rank('B')) : [];
  const lowest = subjects.length > 0 ? rank(subjects[0].grade) : -1;
  const ticked = belowB.length > 0 ? belowB : subjects.filter((s) => rank(s.grade) === lowest);
  return { subjects, ticked: ticked.map((s) => s.eventCategoryId) };
}

export default function MakeupChoiceDialog({ row, result, letters, isPhone, onClose, onNoAccess }) {
  const idBase = useId();
  const [{ subjects, ticked: firstTicked }] = useState(() => choiceStart(result, letters));
  const [ticked, setTicked] = useState(firstTicked);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null); // { text } — amber, under the buttons
  const [showNone, setShowNone] = useState(false);
  const name = `${row.firstName} ${row.lastName}`;

  function toggle(id, on) {
    setShowNone(false);
    setTicked((current) => (on ? [...current, id] : current.filter((x) => x !== id)));
  }

  async function save() {
    if (saving) return;
    if (ticked.length === 0) {
      setShowNone(true);
      return;
    }
    setSaving(true);
    setNote(null);
    const answer = await setMakeupSubjects({
      candidateId: row.id,
      // What this dialog showed as already chosen: nothing (the link shows only while a choice is needed).
      expectedCategoryIds: result?.choiceNeeded ? [] : result?.needsIds ?? [],
      categoryIds: ticked,
    });
    setSaving(false);
    switch (answer.status) {
      case 'ok':
        onClose(true);
        return;
      case 'no_access':
        onClose(false);
        onNoAccess();
        return;
      case 'stale':
        setNote({ text: G.CHOOSE_STALE });
        return;
      case 'not_allowed':
        setNote({ text: G.CHOOSE_NOT_ALLOWED });
        return;
      case 'invalid':
      case 'not_found':
      case 'withdrawn':
        setNote({ text: G.CHOOSE_INVALID });
        return;
      default:
        setNote({ text: G.CHOOSE_FAILED });
    }
  }

  // After stale / invalid answers Save can't help any more: Close (reloads the grid) is the way out.
  const closeOnly = note !== null && note.text !== G.CHOOSE_FAILED;

  return (
    <Dialog title={T.chooseTitle(name)} size="medium" fullScreen={isPhone} onRequestClose={() => onClose(closeOnly)}>
      <p className="tdialog-sub">{T.chooseSub(G.scoreText(result?.total), G.scoreText(result?.maxScore), G.scoreText(result?.passMark))}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        noValidate
      >
        <fieldset className="stg-choose-list" aria-describedby={showNone ? `${idBase}-none` : undefined}>
          <legend className="visually-hidden">{T.SUBJECTS_LABEL}</legend>
          {subjects.map((s, index) => (
            <label key={s.eventCategoryId} className="cbrow stg-choose-row" htmlFor={`${idBase}-${s.eventCategoryId}`}>
              <input
                id={`${idBase}-${s.eventCategoryId}`}
                type="checkbox"
                className="cb"
                checked={ticked.includes(s.eventCategoryId)}
                disabled={saving || closeOnly}
                data-autofocus={index === 0 ? true : undefined}
                onChange={(event) => toggle(s.eventCategoryId, event.target.checked)}
              />
              <span className="stg-choose-name">{T.chooseSubjectLine(s.name, s.credits)}</span>
              <span className="stg-choose-grade">{s.grade}</span>
            </label>
          ))}
        </fieldset>
        {showNone && (
          <p id={`${idBase}-none`} className="field-hint stg-warn-text">
            {T.CHOOSE_NONE}
          </p>
        )}
        <p className="field-hint">{T.chooseNote(row.firstName)}</p>
        {closeOnly ? (
          <div className="dialog-footer">
            <div className="dialog-actions">
              <button type="button" className="btn btn-primary" data-autofocus onClick={() => onClose(true)}>
                {T.CLOSE}
              </button>
            </div>
            <NoteBlock note={note} isPhone={false} />
          </div>
        ) : (
          <Footer saving={saving} canSave={!saving} note={note} isPhone={isPhone} onCancel={() => onClose(false)} />
        )}
      </form>
    </Dialog>
  );
}
