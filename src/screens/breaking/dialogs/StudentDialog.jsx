// StudentDialog.jsx — Add student (a walk-in at the desk) and Edit student, on the Board breaking event page.
// Why it exists: approved pictures "Add student", "The Rank list, open" and "Edit student"
// (docs/Board Breaking/Mockups/B-staff-gen.mjs; rulebook v1.300–v1.303). One box does both, because they ask for
// the same things: first and last name, age, rank (one long list with belt pictures), class, the two board
// counts, Paying by and the amount.
//   - THE DATABASE STAYS THE TRUTH: the "Amount" line is only a preview worked out here with breakingRules.js
//     (the same maths as brk_add_student / brk_edit_registration). The saved amount comes back from the database.
//   - Boards: in Add they are filled in from the chart (age + rank, Child / Teen / Little Tiger / Black Belt chart)
//     until someone touches a stepper; in Edit they start from what is saved and are never overwritten.
//   - Class: Add starts on the class that rank usually comes to (a hint only); Edit starts on the student's class
//     and says "Eli will move from White / Little Tiger to Group D." when it changes.
//   - Edit, a student with a Square link: moving Paying by off Card, or changing the amount while the link is still
//     unpaid, cancels the link (v1.303); an amber note says so BEFORE saving.
//   - Override price (admins only, Edit): a tick and a $ box; saved with brk_set_override after the edit succeeds.
//   - Hide private details (this device's switch): the box follows Color Belt's and Camps' dialogs (src/screens/testing/event/StudentDialog.jsx
//     lines 17-19 and 471; src/screens/camps/CamperDialog.jsx lines 40-46): no Paying by, no Amount line, no override, no Square-link note
//     and no money words while it is on. A new student then starts as Cash (Mark paid asks the way anyway); Edit keeps the saved Paying by.
//   - Ranks: the list holds only the ranks that exist in the groups the typed age selects (a rank deleted from that group never shows); a
//     chosen rank that the new age no longer allows is cleared, so the person picks again.
//   - Saving: one save at a time (the fields turn read-only), a refused or failed save keeps the box open with the
//     amber note (guidelines 3.5), "Someone else changed this" for a stale version, Esc / back with changes asks
//     "Unsaved changes. Save or cancel first." (Dialog.jsx handles Esc, the backdrop and the browser's Back).
//   - Phones: the same box as a full-screen page with one full-width Save.
//
// Props:
//   mode 'add' | 'edit'
//   event            { id, name, locationCode, eventDate }
//   classes          [{ id, name, startTime, endTime, sort }]
//   settings         { techCents, adultCents, cardExtraCents, sameDayExtraCents, childMaxAge }
//   chart            [{ band, rankName, sort, techBoards, adultBoards, technique }]
//   registration     the roster row (Edit only)
//   isAdmin, isPhone
//   onClose()        close the box
//   onSaved({ kind: 'added' | 'edited', name, amountCents })   after a successful save (the page reloads)
//   onNoAccess()     the database says this sign-in is locked: the page locks the screen
//   onRefreshProfile()  re-read who I am (the database said "only an admin")
//   showToast / clearToast   the toast at the bottom
import { useId, useRef, useState } from 'react';
import ChoiceGroup from '../../../components/ChoiceGroup.jsx';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { addStudent, editRegistration, setOverride } from '../../../lib/breaking/breakingApi.js';
import { usePrivateDetailsHidden } from '../../../lib/privateDetails.js';
import {
  ageProblem, beltFor, boardsProblem, centsToDollarsText, classChipLabel, dollarsToCents, MAX_BOARDS, nameFieldProblem, OVERRIDE_MAX_CENTS,
  paidCents, owedCents, priceCents, priceLine, rankLabel, rankOptionsFor, recommendedBoards, recommendedClass, PAYING_BY,
} from '../../../lib/breaking/breakingRules.js';
import { schoolToday } from '../../../lib/breaking/schoolToday.js';
import * as T from '../../../lib/breaking/text/dialogs.js';
import DialogFooter, { NOTES, noteForStatus } from './DialogFooter.jsx';
import RankSelect from './RankSelect.jsx';
import '../../../styles/breaking-dialogs.css';

// The − n + stepper (BeltPicker's, with plain − / + text: the plus icon means "Add new" in this dashboard).
function BoardStepper({ label, value, readOnly, onChange }) {
  const labelId = useId();
  return (
    <div className="field">
      <span id={labelId} className="field-label">
        {label}
      </span>
      <div className="stepper" role="group" aria-labelledby={labelId}>
        <button type="button" className="btn stepper-btn" aria-label={T.fewer(label)} aria-disabled={value <= 0 || readOnly ? 'true' : undefined} onClick={() => !readOnly && value > 0 && onChange(value - 1)}>
          <span aria-hidden="true">−</span>
        </button>
        <output className="stepper-value" aria-live="polite">
          {value}
        </output>
        <button type="button" className="btn stepper-btn" aria-label={T.more(label)} aria-disabled={value >= MAX_BOARDS || readOnly ? 'true' : undefined} onClick={() => !readOnly && value < MAX_BOARDS && onChange(value + 1)}>
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  );
}

const problemWords = {
  first: { empty: T.NAME_EMPTY, long: T.NAME_LONG },
  last: { empty: T.NAME_EMPTY, long: T.NAME_LONG },
  age: { empty: T.AGE_EMPTY, notNumber: T.AGE_BAD, range: T.AGE_BAD },
  boards: { noBoards: T.BOARDS_NONE, boards: T.BOARDS_BAD },
};
// The database's field names → this box's field names (for 'invalid' answers).
const SERVER_FIELD = { first_name: 'first', last_name: 'last', age: 'age', rank_name: 'rank', class_id: 'class', boards: 'boards' };
const SERVER_WORDS = { first: T.NAME_EMPTY, last: T.NAME_EMPTY, age: T.AGE_BAD, rank: T.RANK_EMPTY, class: T.CLASS_EMPTY, boards: T.BOARDS_BAD };

export default function StudentDialog({ mode, event, classes, settings, chart, registration = null, isAdmin = false, isPhone = false, onClose, onSaved, onNoAccess, onRefreshProfile, showToast }) {
  const idBase = useId();
  const [hidden] = usePrivateDetailsHidden(); // Hide private details: no money in this box
  const editing = mode === 'edit';
  const sortedClasses = [...classes].sort((a, b) => a.sort - b.sort);

  // ----- The form -----
  const [first, setFirst] = useState(registration?.firstName ?? '');
  const [last, setLast] = useState(registration?.lastName ?? '');
  const [age, setAge] = useState(registration ? String(registration.age) : '');
  const [rankPick, setRank] = useState(registration?.rankName ?? null);
  const [classPick, setClassPick] = useState(registration?.classId ?? null); // null = not chosen yet (Add: the recommended one)
  const [boards, setBoards] = useState(registration ? { tech: registration.techBoards, adult: registration.adultBoards } : null); // null = from the chart
  const [payingBy, setPayingBy] = useState(registration?.payingBy ?? 'cash');
  const startOverride = registration?.overrideCents ?? null;
  const [overrideOn, setOverrideOn] = useState(Number.isInteger(startOverride));
  const [overrideText, setOverrideText] = useState(Number.isInteger(startOverride) ? (startOverride % 100 === 0 ? String(startOverride / 100) : centsToDollarsText(startOverride)) : '');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);
  const [serverErrors, setServerErrors] = useState({}); // { field: words } from an 'invalid' answer, until that field changes
  const [belowPaid, setBelowPaid] = useState(null); // cents already paid, from an 'amount_below_paid' answer
  const versionRef = useRef(registration?.version ?? null); // moves forward if the edit saved but the override didn't

  // ----- What the chart and the prices say right now -----
  const ageNumber = /^\d+$/.test(age.trim()) ? Number(age.trim()) : null;
  // Only ranks that exist in the group the age selects; a chosen rank that is not in it counts as not chosen.
  const rankChoices = rankOptionsFor(chart, ageNumber, settings.childMaxAge);
  const rank = rankPick && rankChoices.some((r) => r.name === rankPick) ? rankPick : null;
  const rec = rank ? recommendedBoards(chart, rank, ageNumber ?? settings.childMaxAge, settings.childMaxAge) : null;
  const effective = boards ?? (rec && rec.tech !== null ? { tech: rec.tech, adult: rec.adult } : { tech: 0, adult: 0 });
  const recClass = !editing && rank ? recommendedClass(sortedClasses, rank, rec?.band) : null;
  const classId = classPick ?? recClass?.id ?? sortedClasses[0]?.id ?? null;
  const card = payingBy === 'card';
  const sameDay = editing ? registration.sameDay : schoolToday() >= event.eventDate;
  const amount = priceCents({ tech: effective.tech, adult: effective.adult, card, sameDay }, settings);
  const overrideCents = overrideOn ? dollarsToCents(overrideText) : null;
  const overrideValid = !overrideOn || (overrideCents !== null && overrideCents <= OVERRIDE_MAX_CENTS);
  const shownCents = overrideOn && overrideCents !== null && overrideValid ? overrideCents : amount;

  // Edit, a student with a Square link: will saving cancel it?
  const hadUnpaidLink = editing && registration.hasLink && paidCents(registration) < owedCents(registration);
  // The database clears the link when Paying by leaves Card, or when the amount OWED changes (the price, or the admin's set price).
  const linkWords = hidden || !hadUnpaidLink ? null : !card ? T.linkCancelOffCard(payingBy) : shownCents !== owedCents(registration) ? T.LINK_CANCEL_AMOUNT : null;

  // ----- Problems (shown after Save was pressed) -----
  const problems = {
    first: nameFieldProblem(first),
    last: nameFieldProblem(last),
    age: ageProblem(age),
    rank: rank ? null : 'empty',
    class: classId ? null : 'empty',
    boards: boardsProblem(effective.tech, effective.adult),
    override: overrideValid ? null : 'bad',
  };
  const hasProblem = Object.values(problems).some(Boolean);
  const words = (field) => serverErrors[field] ?? (tried && problems[field] ? (field === 'rank' ? T.RANK_EMPTY : field === 'class' ? T.CLASS_EMPTY : field === 'override' ? T.OVERRIDE_BAD : problemWords[field][problems[field]]) : null);
  const blocked = Boolean(note?.blocking);
  const canSave = !saving && !blocked;

  const dirty = editing
    ? first !== registration.firstName || last !== registration.lastName || age !== String(registration.age) || rank !== registration.rankName || classId !== registration.classId
      || effective.tech !== registration.techBoards || effective.adult !== registration.adultBoards || payingBy !== registration.payingBy
      || (overrideOn ? overrideCents : null) !== startOverride
    : first !== '' || last !== '' || age !== '' || rank !== null || boards !== null || classPick !== null || payingBy !== 'cash';

  // A change in any field: the database's words for it, and any note saving again could fix, go away.
  function touchedForm() {
    setServerErrors({});
    setBelowPaid(null);
    if (note && !note.blocking) setNote(null);
  }
  const edit = (setter) => (value) => {
    touchedForm();
    setter(value);
  };
  function chooseBoards(patch) {
    touchedForm();
    setBoards({ ...effective, ...patch });
  }
  function toggleOverride(on) {
    touchedForm();
    setOverrideOn(on);
    if (on && overrideText === '') setOverrideText(amount % 100 === 0 ? String(amount / 100) : centsToDollarsText(amount));
  }

  function focusFirstProblem() {
    const order = [['first', 'first'], ['last', 'last'], ['age', 'age'], ['rank', 'rank'], ['override', 'override']];
    for (const [field, suffix] of order) {
      if (problems[field]) {
        document.getElementById(`${idBase}-${suffix}`)?.focus();
        return;
      }
    }
  }

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    setTried(true);
    if (!canSave) return;
    if (hasProblem) {
      window.setTimeout(focusFirstProblem, 0);
      return;
    }
    setSaving(true);
    setNote(null);
    setServerErrors({});
    setBelowPaid(null);
    const student = {
      firstName: first.trim(), lastName: last.trim(), age: ageNumber, rankName: rank, classId, tech: effective.tech, adult: effective.adult, payingBy,
    };
    const name = `${student.firstName} ${student.lastName}`.replace(/\s+/g, ' ');
    let result;
    let status;
    if (editing) {
      result = await editRegistration(registration.id, versionRef.current, student);
      status = result.status;
      // The admin's price set by hand, only when it changed, after the edit saved.
      if (status === 'ok') {
        versionRef.current = result.version;
        const nextOverride = overrideOn ? overrideCents : null;
        if (nextOverride !== startOverride) {
          const set = await setOverride(registration.id, versionRef.current, nextOverride);
          if (set.status === 'ok') versionRef.current = set.version;
          else {
            result = set;
            status = set.status === 'error' ? 'override_failed' : set.status;
          }
        }
      }
    } else {
      result = await addStudent(event.id, student);
      status = result.status;
    }
    setSaving(false);
    if (status === 'ok') {
      showToast?.(editing ? T.updatedToast(name) : T.addedToast(name));
      onSaved?.({ kind: editing ? 'edited' : 'added', name, amountCents: result.amountCents });
      onClose();
      return;
    }
    if (status === 'no_access') {
      onNoAccess?.();
      return;
    }
    if (status === 'not_allowed') onRefreshProfile?.();
    if (status === 'amount_below_paid') {
      setBelowPaid(result.paidCents ?? paidCents(registration));
      return;
    }
    if (status === 'override_failed') {
      setNote({ text: T.OVERRIDE_NOT_SAVED });
      return;
    }
    if (status === 'invalid' && result.field && SERVER_FIELD[result.field]) {
      const field = SERVER_FIELD[result.field];
      setServerErrors({ [field]: SERVER_WORDS[field] });
      return;
    }
    setNote(noteForStatus(status));
  }

  function requestClose() {
    if (saving) return;
    if (!dirty || blocked) onClose();
    else setNote(NOTES.unsaved);
  }

  // ----- The words under the fields -----
  const options = rankChoices.map((r) => ({ value: r.name, label: rankLabel(r.name), belt: beltFor(r.name, { danStripe: true }) }));
  const chosenClass = sortedClasses.find((c) => c.id === classId);
  let classHint = null;
  if (editing) {
    const was = sortedClasses.find((c) => c.id === registration.classId);
    if (chosenClass && was && chosenClass.id !== was.id) classHint = T.moveHint(first.trim() || registration.firstName, was.name, chosenClass.name);
  } else if (recClass) classHint = T.recommendedClassHint(recClass.name, rankLabel(rank));
  let boardsHint = null;
  if (rec && rec.tech !== null && ageNumber !== null) {
    const chartName = T.CHART_NAMES[rec.band];
    if (boards === null) boardsHint = T.chartFill(ageNumber, rankLabel(rank), chartName);
    else if (boards.tech !== rec.tech || boards.adult !== rec.adult) boardsHint = T.chartDiffers(ageNumber, rankLabel(rank), chartName, rec.tech, rec.adult);
  }
  const lineExtras = [sameDay ? T.eventDayNote(settings.sameDayExtraCents) : null, card ? T.cardNote(settings.cardExtraCents) : null].filter(Boolean).join(' ');
  const sum = priceLine({ tech: effective.tech, adult: effective.adult, card, sameDay }, settings);
  const amountSmall = overrideOn && overrideCents !== null && overrideValid
    ? T.overrideLine(amount, `${sum.split(' = ')[0] || '0 boards'}, ${payingBy}`)
    : [lineExtras, sum ? `${sum}.` : ''].filter(Boolean).join(' ');

  const err = (field, id) => {
    const text = words(field);
    return text ? <Notice id={id}>{text}</Notice> : null;
  };
  const title = editing ? T.EDIT_STUDENT_TITLE : T.ADD_STUDENT_TITLE;
  const sub = editing ? T.editStudentSub(`${registration.firstName} ${registration.lastName}`, event) : T.addStudentSub(event);

  return (
    <Dialog title={title} size="medium" fullScreen={isPhone} onRequestClose={requestClose} busy={saving}>
      <p className="tdialog-sub">{sub}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="ev-two">
          <div className="field">
            <label htmlFor={`${idBase}-first`}>{T.FIRST_NAME}</label>
            <input id={`${idBase}-first`} className="input" type="text" autoComplete="off" data-autofocus="true" readOnly={saving} value={first}
              aria-invalid={words('first') ? true : undefined} aria-describedby={words('first') ? `${idBase}-first-msg` : undefined} onChange={(e) => edit(setFirst)(e.target.value)} />
            {err('first', `${idBase}-first-msg`)}
          </div>
          <div className="field">
            <label htmlFor={`${idBase}-last`}>{T.LAST_NAME}</label>
            <input id={`${idBase}-last`} className="input" type="text" autoComplete="off" readOnly={saving} value={last}
              aria-invalid={words('last') ? true : undefined} aria-describedby={words('last') ? `${idBase}-last-msg` : undefined} onChange={(e) => edit(setLast)(e.target.value)} />
            {err('last', `${idBase}-last-msg`)}
          </div>
        </div>
        <div className="ev-two">
          <div className="field">
            <label htmlFor={`${idBase}-age`}>{T.AGE}</label>
            <input id={`${idBase}-age`} className="input" type="text" inputMode="numeric" autoComplete="off" readOnly={saving} value={age}
              aria-invalid={words('age') ? true : undefined} aria-describedby={words('age') ? `${idBase}-age-msg` : undefined} onChange={(e) => edit(setAge)(e.target.value)} />
            {err('age', `${idBase}-age-msg`)}
          </div>
          <div className="field">
            <span id={`${idBase}-rank-label`} className="field-label">
              {T.RANK}
            </span>
            <RankSelect id={`${idBase}-rank`} labelId={`${idBase}-rank-label`} describedBy={words('rank') ? `${idBase}-rank-msg` : undefined} value={rank} options={options}
              placeholder={T.RANK_PLACEHOLDER} readOnly={saving} invalid={Boolean(words('rank'))} onChange={edit(setRank)} />
            {err('rank', `${idBase}-rank-msg`)}
          </div>
        </div>
        <div className="field">
          <span id={`${idBase}-class`} className="field-label">
            {T.CLASS_LABEL}
          </span>
          <ChoiceGroup labelId={`${idBase}-class`} variant="chips" value={classId} readOnly={saving} options={sortedClasses.map((c) => ({ key: c.id, label: classChipLabel(c) }))} onChange={edit(setClassPick)} />
          {err('class', `${idBase}-class-msg`)}
        </div>
        {classHint && <p className="field-hint brk-hint">{classHint}</p>}
        <div className="ev-two brk-steppers">
          <BoardStepper label={T.TECH_BOARDS} value={effective.tech} readOnly={saving} onChange={(tech) => chooseBoards({ tech })} />
          <BoardStepper label={T.ADULT_BOARDS} value={effective.adult} readOnly={saving} onChange={(adult) => chooseBoards({ adult })} />
        </div>
        {err('boards', `${idBase}-boards-msg`)}
        {boardsHint && <p className="field-hint brk-hint">{boardsHint}</p>}
        {!hidden && (
          <div className="field">
            <span id={`${idBase}-way`} className="field-label">
              {T.PAYING_BY}
            </span>
            <div>
              <ChoiceGroup labelId={`${idBase}-way`} value={payingBy} readOnly={saving} options={PAYING_BY.map((key) => ({ key, label: T.PAYING_BY_TEXT[key] }))} onChange={edit(setPayingBy)} />
            </div>
          </div>
        )}
        {linkWords && (
          <div className="field">
            <Notice>{linkWords}</Notice>
          </div>
        )}
        {editing && isAdmin && !hidden && (
          <div className="field">
            <label className="cbrow">
              <input className="cb" type="checkbox" checked={overrideOn} disabled={saving} onChange={(e) => toggleOverride(e.target.checked)} />
              <span>{T.OVERRIDE_LABEL}</span>
            </label>
            {overrideOn && (
              <>
                <div className="brk-override">
                  <span className="brk-dollar" aria-hidden="true">
                    $
                  </span>
                  <input id={`${idBase}-override`} className="input brk-override-input" type="text" inputMode="decimal" autoComplete="off" readOnly={saving} value={overrideText}
                    aria-label={T.OVERRIDE_INPUT_LABEL} aria-invalid={words('override') ? true : undefined} onChange={(e) => edit(setOverrideText)(e.target.value)} />
                </div>
                {err('override', `${idBase}-override-msg`)}
              </>
            )}
          </div>
        )}
        {!hidden && (
          <p className="brk-amount">
            <strong>{T.amountBig(shownCents)}</strong>
            {amountSmall && <span>{amountSmall}</span>}
          </p>
        )}
        {belowPaid !== null && <Notice>{hidden ? T.AMOUNT_BELOW_PAID_HIDDEN : T.amountBelowPaid(belowPaid)}</Notice>}
        {!editing && !hidden && <p className="field-hint">{T.ADD_FOOTNOTE}</p>}
        <DialogFooter saving={saving} note={note} isPhone={isPhone} canSave={canSave} onCancel={() => !saving && onClose()} saveLabel={editing ? T.SAVE : T.ADD_BUTTON} />
      </form>
    </Dialog>
  );
}
