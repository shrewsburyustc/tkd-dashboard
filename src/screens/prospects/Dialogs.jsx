// Dialogs.jsx — the smaller Prospects dialogs.
// Why it exists: four short dialogs that belong together:
//   BookTimeDialog    Book a free class / Change time (v0.244 answer 2): the open times of the
//                     school's Live booking forms, grouped by week, as cards (like Fill in)
//   JoinedDialog      choosing Joined asks the date joined (default today, v0.236), picked in the
//                     dashboard's own calendar (DatePicker, design review N6), today or earlier
//   CameDialog        a Board card dropped on Came asks "Did … come?" first (v0.246)
//   AddProspectDialog "+ Add prospect" asks which Live form to fill in for the family (v0.236)
//   DeleteDialog      delete a prospect — admins only, with a confirmation
// CameDialog and DeleteDialog are the dashboard's shared "are you sure?" box (ConfirmBox, design
// review N3, rulebook v1.008 / v1.103).
// The values being typed live in Prospects.jsx (so a lock while one is open loses nothing).
import { IconCheck, IconClipboardText, IconTrash, IconUserCheck } from '@tabler/icons-react';
import ConfirmBox from '../../components/ConfirmBox.jsx';
import DatePicker from '../../components/DatePicker.jsx';
import Dialog from '../../components/Dialog.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import Notice from '../../components/Notice.jsx';
import { weekStart } from '../../lib/calendar/days.js';
import { addDays } from '../../lib/schedule/versions.js';
import { formatTime, parseTime } from '../../lib/schedule/time.js';
import { classWithAges } from '../../lib/schedule/ages.js';
import * as T from './text.js';

export const timeKey = (t) => `${t.formId}|${t.classId}|${t.date}|${t.start}`;

// DELETE_FAILED / BOX_SAVE_FAILED: a save that failed on the connection; the box stays open with
// this note and pressing its button again tries again (pass 2 U-01, rulebook v1.103)
const NOTES = { TIME_TAKEN: T.TIME_TAKEN, STALE: T.STALE, SAVE_FAILED: T.SAVE_FAILED, INVALID: T.INVALID, NOT_ALLOWED: T.NOT_ALLOWED, PICK: T.PICK_A_TIME, DELETE_FAILED: T.DELETE_FAILED, BOX_SAVE_FAILED: T.BOX_SAVE_FAILED };

// The button row, with the dialog's amber note (if any) in its place (rulebook v0.81; Jeffrey
// 2026-11-06, "A: under the buttons", pass 2 U-01): on PC and tablet the note sits UNDER Cancel /
// Save, inside .dialog-footer, so the buttons don't move down when it appears and a second click
// lands on the button again; on phones it sits above the button pinned at the bottom.
function Footer({ isPhone, onCancel, note = null, children }) {
  const noteBlock = note && (
    <div className="tdialog-note">
      <Notice>{note}</Notice>
    </div>
  );
  return isPhone ? (
    <>
      {noteBlock}
      <div className="dialog-page-submit">{children}</div>
    </>
  ) : (
    <div className="dialog-footer">
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {T.CANCEL}
        </button>
        {children}
      </div>
      {noteBlock}
    </div>
  );
}

export function BookTimeDialog({ state, today, isPhone, onPick, onSave, onCancel, onRetryTimes, onTop = false }) {
  const times = state.times;
  const groups = [];
  if (Array.isArray(times)) {
    const thisWeek = weekStart(today);
    const nextWeek = addDays(thisWeek, 7);
    for (const t of times) {
      const w = weekStart(t.date);
      const label = w === thisWeek ? T.THIS_WEEK : w === nextWeek ? T.NEXT_WEEK : T.weekOf(w);
      if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, times: [] });
      groups[groups.length - 1].times.push(t);
    }
  }
  const canSave = Boolean(state.pick) && !state.saving;
  return (
    <Dialog title={T.bookTitle(state.name, state.change)} size="detail" fullScreen={isPhone} onTop={onTop} returnFocusTo={onTop ? state.opener ?? null : null} onRequestClose={onCancel}>
      {times === null && <p className="field-hint">{T.LOADING_TIMES}</p>}
      {/* S-2: a read that fails inside a box ends "then retry" and has its own Retry */}
      {times === 'error' && <ErrorBanner text={T.TIMES_FAILED} onRetry={onRetryTimes} />}
      {Array.isArray(times) && times.length === 0 && <p className="fnotimes">{T.NO_TIMES}</p>}
      {groups.length > 0 && (
        <fieldset className="field cfieldset">
          <legend className="visually-hidden">{T.bookTitle(state.name, state.change)}</legend>
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <p className="ftday">{g.label}</p>
              {g.times.map((t) => {
                const key = timeKey(t);
                return (
                  <label key={key} className={`ftslot${state.pick === key ? ' is-on' : ''}`}>
                    <input type="radio" name={`book-${state.key}`} checked={state.pick === key} disabled={state.saving} onChange={() => onPick(key)} />
                    <span className="ftslot-text">
                      {T.shortDate(t.date)} · {formatTime(parseTime(t.start), true)} · {classWithAges(t) /* with its ages, v0.619 */}
                    </span>
                    <span className={`ftslot-right${t.spotsLeft === 1 ? ' is-last' : ''}`}>{T.spotsLeft(t.spotsLeft)}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </fieldset>
      )}
      <Footer isPhone={isPhone} onCancel={onCancel} note={state.note ? NOTES[state.note] ?? state.note : null}>
        <button type="button" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`} aria-disabled={canSave ? undefined : 'true'} onClick={() => (canSave ? onSave() : onPick(state.pick))}>
          <IconCheck size={16} aria-hidden="true" />
          {state.saving ? T.SAVING : T.BOOK_IT}
        </button>
      </Footer>
    </Dialog>
  );
}

export function JoinedDialog({ state, today, isPhone, onChange, onSave, onCancel, onTop = false }) {
  const ok = Boolean(state.date) && state.date <= today && !state.saving;
  return (
    <Dialog title={T.JOINED_TITLE} size="small" fullScreen={isPhone} onTop={onTop} returnFocusTo={onTop ? state.opener ?? null : null} onRequestClose={onCancel}>
      <p className="tdialog-sub">{state.name}</p>
      <div className="field">
        {/* plain text, not a <label>: a label would open the calendar when clicked (as Star's fields) */}
        <span className="field-label">{T.JOINED_DATE}</span>
        {/* The dashboard's own calendar (N6): today or earlier, last year and this year in the Year
            list; on phones it opens in the page under the field. DatePicker takes no extra props, so
            its field can't carry data-autofocus: the Dialog then puts the focus on its own box, and
            the first Tab reaches this field. */}
        <DatePicker
          id={`joined-${state.key}`}
          label={T.JOINED_DATE}
          value={state.date}
          today={today}
          max={today}
          years={[Number(today.slice(0, 4)) - 1, Number(today.slice(0, 4))]}
          hint={T.JOINED_DATE_HINT}
          placeholder={T.CHOOSE}
          inline={isPhone}
          onChange={onChange}
        />
        <p className="field-hint">{T.JOINED_HINT}</p>
      </div>
      <Footer isPhone={isPhone} onCancel={onCancel} note={state.note ? NOTES[state.note] ?? state.note : null}>
        <button type="button" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${ok ? '' : ' is-unavailable'}`} aria-disabled={ok ? undefined : 'true'} onClick={() => ok && onSave()}>
          <IconCheck size={16} aria-hidden="true" />
          {state.saving ? T.SAVING : T.SAVE}
        </button>
      </Footer>
    </Dialog>
  );
}

// A Board card dropped on Came (v0.246): "Did Ava come to the free class?" — Came checks the
// child in (on the class day, or after it) or, with no class to check in to, saves Came as the status.
// The same small box on every device (design review N3, v1.103): never a full page on phones.
//   33  the shared ConfirmBox: "Keep in <column>" · "Came" (blue, first focus on Came: nothing is lost)
//   34  the class is still ahead: ONE button, "Keep in <column>". ConfirmBox always draws two, so
//       this one is a plain small confirm Dialog whose button row has ConfirmBox's classes
//       (`dialog-actions cfm-actions`), so it is never pinned to the bottom on short screens.
// state.column is the name of the Board column the card sits in now ("Booked", "New"; a No-show's
// card sits in Booked, v0.610) — Prospects.jsx works it out when the card is dropped.
export function CameDialog({ state, onSave, onCancel }) {
  const b = state.prospect.booking;
  const name = state.prospect.childFirstName;
  const keepLabel = T.keepIn(state.column);
  if (state.ahead) {
    return (
      <Dialog title={T.cameAheadTitle(name)} variant="confirm" describedBy={`pcame-${state.key}`} onRequestClose={onCancel}>
        <p id={`pcame-${state.key}`} className="tdialog-sub tdialog-body">
          {T.cameAhead(name, b)}
        </p>
        <div className="dialog-actions cfm-actions">
          <button type="button" className="btn" data-autofocus onClick={onCancel}>
            {keepLabel}
          </button>
        </div>
      </Dialog>
    );
  }
  return (
    <ConfirmBox
      title={T.cameTitle(name)}
      keepLabel={keepLabel}
      actionLabel={T.MARK_CAME}
      actionIcon={IconUserCheck}
      busyLabel={T.SAVING}
      loses="nothing"
      busy={state.saving}
      failed={state.note ? NOTES[state.note] ?? state.note : null}
      onKeep={onCancel}
      onConfirm={onSave}
    >
      {b && b.status === 'booked' ? T.classLine(b) : T.NO_CLASS_BOOKED}
    </ConfirmBox>
  );
}

export function AddProspectDialog({ state, isPhone, onPickSchool, onPick, onCancel, onRetryForms }) {
  return (
    <Dialog title={T.ADD_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onCancel}>
      {state.both && (
        <fieldset className="field cfieldset">
          <legend className="field-label">{T.WHICH_SCHOOL}</legend>
          <div className="cseg" role="radiogroup" aria-label={T.WHICH_SCHOOL}>
            {['worcester', 'shrewsbury'].map((code) => (
              <label key={code} className={`cseg-item${state.school === code ? ' is-on' : ''}`}>
                <input type="radio" name={`add-school-${state.key}`} checked={state.school === code} onChange={() => onPickSchool(code)} />
                <span>{T.SCHOOL_NAME[code]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p className="tdialog-sub">{T.WHICH_FORM}</p>
      {state.forms === null && <p className="field-hint">{T.LOADING_PANEL}</p>}
      {/* S-2: the words name the forms (not "the prospects") and the bar has Retry */}
      {state.forms === 'error' && <ErrorBanner text={T.FORMS_LOAD_FAILED} onRetry={onRetryForms} />}
      {Array.isArray(state.forms) && (state.forms.length === 0 ? (
        <p className="fnotimes">{T.NO_LIVE_FORMS}</p>
      ) : (
        <ul className="paddforms">
          {state.forms.map((f, i) => (
            <li key={f.id}>
              <button type="button" className="paddform" data-autofocus={i === 0 ? true : undefined} onClick={(e) => onPick(f, e.currentTarget)}>
                <IconClipboardText size={16} aria-hidden="true" />
                <span>{f.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ))}
      {!isPhone && (
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {T.CANCEL}
          </button>
        </div>
      )}
    </Dialog>
  );
}

// Delete a prospect (admins): the shared ConfirmBox (design review N3) — "Keep prospect" ·
// "Delete prospect" (red, first focus on Keep). The sentence always stays; a problem shows as the
// amber note under the buttons. On phones it opens on top of the panel page (onTop, v1.100).
export function DeleteDialog({ state, onConfirm, onCancel, onTop = false }) {
  return (
    <ConfirmBox
      title={T.deleteTitle(state.name)}
      keepLabel={T.KEEP_PROSPECT}
      actionLabel={T.DELETE_PROSPECT}
      actionIcon={IconTrash}
      busyLabel={T.DELETING}
      loses="forGood"
      busy={state.saving}
      failed={state.note ? NOTES[state.note] ?? state.note : null}
      onKeep={onCancel}
      onConfirm={onConfirm}
      onTop={onTop}
      returnFocusTo={onTop ? state.opener ?? null : null}
    >
      {T.deleteBody(state.name, state.siblings)}
    </ConfirmBox>
  );
}
