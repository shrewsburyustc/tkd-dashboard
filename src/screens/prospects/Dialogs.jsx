// Dialogs.jsx — the smaller Prospects dialogs.
// Why it exists: four short dialogs that belong together:
//   BookTimeDialog    Book a free class / Change time (v0.191 answer 2): the open times of the
//                     school's Live booking forms, grouped by week, as cards (like Fill in)
//   JoinedDialog      choosing Joined asks the date joined (default today, v0.140)
//   AddProspectDialog "+ Add prospect" asks which Live form to fill in for the family (v0.140)
//   DeleteDialog      delete a prospect — admins only, with a confirmation
// The values being typed live in Prospects.jsx (so a lock while one is open loses nothing).
import { IconCheck, IconClipboardText, IconTrash } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { weekStart } from '../../lib/calendar/days.js';
import { addDays } from '../../lib/schedule/versions.js';
import { formatTime, parseTime } from '../../lib/schedule/time.js';
import * as T from './text.js';

export const timeKey = (t) => `${t.formId}|${t.classId}|${t.date}|${t.start}`;

const NOTES = { TIME_TAKEN: T.TIME_TAKEN, STALE: T.STALE, SAVE_FAILED: T.SAVE_FAILED, INVALID: T.INVALID, NOT_ALLOWED: T.NOT_ALLOWED, PICK: T.PICK_A_TIME };

function Footer({ isPhone, onCancel, children }) {
  return isPhone ? (
    <div className="dialog-page-submit">{children}</div>
  ) : (
    <div className="dialog-actions">
      <button type="button" className="btn" onClick={onCancel}>
        {T.CANCEL}
      </button>
      {children}
    </div>
  );
}

export function BookTimeDialog({ state, today, isPhone, onPick, onSave, onCancel }) {
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
    <Dialog title={T.bookTitle(state.name, state.change)} size="detail" fullScreen={isPhone} onRequestClose={onCancel}>
      {times === null && <p className="field-hint">{T.LOADING_TIMES}</p>}
      {times === 'error' && <Notice>{T.SAVE_FAILED}</Notice>}
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
                      {T.shortDate(t.date)} · {formatTime(parseTime(t.start), true)} · {t.className}
                    </span>
                    <span className={`ftslot-right${t.spotsLeft === 1 ? ' is-last' : ''}`}>{T.spotsLeft(t.spotsLeft)}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </fieldset>
      )}
      {state.note && (
        <div className="tdialog-note">
          <Notice>{NOTES[state.note] ?? state.note}</Notice>
        </div>
      )}
      <Footer isPhone={isPhone} onCancel={onCancel}>
        <button type="button" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`} aria-disabled={canSave ? undefined : 'true'} onClick={() => (canSave ? onSave() : onPick(state.pick))}>
          <IconCheck size={16} aria-hidden="true" />
          {state.saving ? T.SAVING : T.BOOK_IT}
        </button>
      </Footer>
    </Dialog>
  );
}

export function JoinedDialog({ state, today, isPhone, onChange, onSave, onCancel }) {
  const ok = Boolean(state.date) && state.date <= today && !state.saving;
  return (
    <Dialog title={T.JOINED_TITLE} size="small" fullScreen={isPhone} onRequestClose={onCancel}>
      <p className="tdialog-sub">{state.name}</p>
      <div className="field">
        <label htmlFor={`joined-${state.key}`}>{T.JOINED_DATE}</label>
        <input id={`joined-${state.key}`} className="input" type="date" data-autofocus max={today} value={state.date} onChange={(e) => onChange(e.target.value)} />
        <p className="field-hint">{T.JOINED_HINT}</p>
      </div>
      {state.note && <Notice>{NOTES[state.note] ?? state.note}</Notice>}
      <Footer isPhone={isPhone} onCancel={onCancel}>
        <button type="button" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${ok ? '' : ' is-unavailable'}`} aria-disabled={ok ? undefined : 'true'} onClick={() => ok && onSave()}>
          <IconCheck size={16} aria-hidden="true" />
          {state.saving ? T.SAVING : T.SAVE}
        </button>
      </Footer>
    </Dialog>
  );
}

export function AddProspectDialog({ state, isPhone, onPickSchool, onPick, onCancel }) {
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
      {state.forms === 'error' && <Notice>{T.LOAD_FAILED}</Notice>}
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

export function DeleteDialog({ state, onConfirm, onCancel }) {
  return (
    <Dialog title={T.deleteTitle(state.name)} variant="confirm" describedBy={`pdel-${state.key}`} onRequestClose={onCancel}>
      <p id={`pdel-${state.key}`} className="tdialog-sub tdialog-body">
        {state.note ? NOTES[state.note] ?? state.note : T.deleteBody(state.name, state.siblings)}
      </p>
      <div className="dialog-actions">
        <button type="button" className="btn" data-autofocus onClick={onCancel}>
          {T.CANCEL}
        </button>
        <button type="button" className={`btn btn-delete${state.saving ? ' is-unavailable' : ''}`} onClick={() => !state.saving && onConfirm()}>
          <IconTrash size={16} aria-hidden="true" />
          {state.saving ? T.DELETING : T.DELETE}
        </button>
      </div>
    </Dialog>
  );
}
