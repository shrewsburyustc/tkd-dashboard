// MakeupPickerDialog.jsx — "Add a make-up": everyone who owes a make-up from an earlier Star testing
// (Candidates screen 7, v0.111; gap mockup G10).
// Why it exists: a make-up is never typed in — it comes from an earlier testing on the dashboard
// (v0.223). The list (loadMakeupList, a POST) is newest earlier testing first; a name search filters
// it on the screen. Each row: "Grace Liu · Shrewsbury", "1st Dan · 2 stars → 3 stars",
// "Spring 2026 · retest Two Step Sparring", then:
//   Add            → addMakeup; the row turns "Already added" and the roster gets the make-up row
//   Already added  gray, no button (someone already in this event; also after an already_added answer)
//   Can't add yet  gray, no button — a choice_needed row: "Fall 2026 · scored below 245. An admin
//                  chooses the subjects to retest on Fall 2026's Grading tab first."
// Empty: the search box plus two gray lines. A search with no match: 'No one matches "Lee".'
// The foot line says what Add does. Done (phone: the back arrow) closes it.
// Works while "Hide private details" is on (it shows no private details, v0.507).
import { IconPlus, IconSearch } from '@tabler/icons-react';
import Dialog from '../../../../components/Dialog.jsx';
import Notice from '../../../../components/Notice.jsx';
import * as T from './text.js';

export default function MakeupPickerDialog({ state, eventName, passMark, isPhone, onSearch, onAdd, onRetry, onClose }) {
  const search = state.search.trim().toLowerCase();
  const rows = state.rows ?? [];
  const shown = search ? rows.filter((r) => `${r.firstName} ${r.lastName}`.toLowerCase().includes(search)) : rows;
  const added = state.added ?? {}; // { [candidateId]: 'already_added' | 'choice_needed' } from answers

  let body;
  if (state.failed) {
    body = (
      <div className="tdialog-note">
        <Notice>
          {T.LOAD_LIST_FAILED}{' '}
          <button type="button" className="note-action" onClick={onRetry}>
            {T.RETRY}
          </button>
        </Notice>
      </div>
    );
  } else if (state.rows === null) {
    body = (
      <div className="tskeleton" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <div className="st-mk-empty">
        {T.MAKEUP_LIST_EMPTY.map((line) => (
          <p key={line} className="field-hint">
            {line}
          </p>
        ))}
      </div>
    );
  } else if (shown.length === 0) {
    body = <p className="field-hint st-mk-empty">{T.makeupNoMatch(state.search.trim())}</p>;
  } else {
    body = (
      <ul className="st-mk-list">
        {shown.map((row) => {
          const name = `${row.firstName} ${row.lastName}`;
          const already = row.alreadyAdded || added[row.candidateId] === 'already_added';
          const blocked = row.choiceNeeded || added[row.candidateId] === 'choice_needed';
          return (
            <li key={row.candidateId} className="st-mk-row">
              <span className="st-mk-text">
                <span className="st-mk-name">{T.makeupRowLine(row)}</span>
                <span className="st-mk-sub">{T.makeupRowStars(row)}</span>
                <span className="st-mk-sub">{blocked ? T.choiceNeededLine(T.shortEventName(row.earlierEventName), passMark) : T.makeupRowRetest(row)}</span>
              </span>
              <span className="st-mk-act">
                {already ? (
                  <span className="st-mk-state">{T.ALREADY_ADDED}</span>
                ) : blocked ? (
                  <span className="st-mk-state">{T.CANT_ADD_YET}</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-label={T.addMakeupLabel(name)}
                    aria-disabled={state.saving ? 'true' : undefined}
                    onClick={() => !state.saving && onAdd(row)}
                  >
                    {/* ti-plus = add */}
                    <IconPlus size={16} aria-hidden="true" />
                    {T.MAKEUP_ADD}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Dialog title={T.MAKEUP_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onClose}>
      {!isPhone && <p className="tdialog-sub">{eventName}</p>}
      <div className="field st-mk-search">
        <label htmlFor={`star-mk-${state.key}`} className="visually-hidden">
          {T.SEARCH_BY_NAME}
        </label>
        <span className="st-mk-search-icon" aria-hidden="true">
          {/* ti-search = search */}
          <IconSearch size={16} />
        </span>
        <input
          id={`star-mk-${state.key}`}
          className="input st-mk-input"
          type="search"
          autoComplete="off"
          placeholder={T.SEARCH_BY_NAME}
          data-autofocus
          value={state.search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      {body}
      {state.note && (
        <div className="tdialog-note">
          <Notice>{state.note}</Notice>
        </div>
      )}
      {rows.length > 0 && <p className="field-hint st-mk-foot">{T.MAKEUP_FOOT}</p>}
      {!isPhone && (
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {T.DONE}
          </button>
        </div>
      )}
    </Dialog>
  );
}
