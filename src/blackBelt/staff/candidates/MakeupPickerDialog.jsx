// MakeupPickerDialog.jsx — "Make-up from an earlier cycle" (contract 0025 §14.5; mockup G06,
// proposals 25 and 26; copied in pattern from Star's MakeupPickerDialog.jsx).
// Why it exists: a make-up is never typed in — it comes from an earlier Black Belt cycle in the
// dashboard (v0.941 / Star v0.223). Top to bottom:
//   - the lead "Candidates who owe a make-up from an earlier Black Belt cycle. Add copies their
//     Dan, kept grades and the subjects to retest. No fee."
//   - Search by name (filters on the screen)
//   - one group per earlier cycle, newest first, headed "Spring 2027 · 3"; each row:
//       Mia Chen
//       1st Dan · Worcester · 18 and over
//       Retests Free sparring
//       (Subjects chosen by an admin)          — a below-the-pass-mark result an admin chose for
//       (+ Breaking class, new in Fall 2027)   — G 26: a subject new in this cycle's rubric
//       (Not in Fall 2027's rubric, so not copied: …) — a subject or extra item that is gone
//     and on the right: Add · "Already added" (gray) · for a below-the-pass-mark result with no
//     subjects chosen yet: "Choose subjects" (admins, 44px on touch) or the gray "An admin
//     chooses the subjects first" (staff) — Star OPEN-11
//   - Close (PC / tablet); phones: a full screen with the back arrow
// Shows no date of birth, email or reference (the list doesn't have them).
// This file only draws; useMakeupPicker.js keeps the state and makes the calls.
import { useId } from 'react';
import { IconSearch } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import { bracketLabel } from '../../../lib/blackBelt/rubric.js';
import * as T from '../text.js';

// The rows in their groups (the list comes newest earlier cycle first; the order is kept).
function groupByCycle(rows) {
  const groups = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.cycleId === row.cycleId) last.rows.push(row);
    else groups.push({ cycleId: row.cycleId, cycleName: row.cycleName, rows: [row] });
  }
  return groups;
}

function MakeupRow({ row, cycleName, answer, isAdmin, saving, onAdd, onChoose }) {
  const name = `${row.firstName} ${row.lastName}`;
  const already = row.alreadyAdded || answer === 'already_added';
  const choiceNeeded = row.choiceNeeded || answer === 'choice_needed';
  const bracket = row.ageGroup ? bracketLabel(row.ageGroup) : null;
  const p = row.preview ?? {};
  const retest = p.retest?.length ? p.retest : row.needs ?? [];
  const dropped = [...(p.dropped ?? []), ...(p.droppedExtra ?? [])];
  const chosenByAdmin = !choiceNeeded && (row.reasons ?? []).includes('below') && !(row.reasons ?? []).includes('d');

  let action;
  if (already) action = <span className="bb-mk-state">{T.ALREADY_ADDED}</span>;
  else if (choiceNeeded && isAdmin) {
    action = (
      <button type="button" className="btn btn-sm bb-mk-btn" aria-label={T.chooseSubjectsLabel(name)} aria-disabled={saving ? 'true' : undefined} onClick={() => !saving && onChoose(row)}>
        {T.CHOOSE_SUBJECTS}
      </button>
    );
  } else if (choiceNeeded) action = <span className="bb-mk-state">{T.ADMIN_CHOOSES_FIRST}</span>;
  else {
    action = (
      <button type="button" className="btn btn-sm bb-mk-btn" aria-label={T.addMakeupLabel(name)} aria-disabled={saving ? 'true' : undefined} onClick={() => !saving && onAdd(row)}>
        {T.MAKEUP_ADD}
      </button>
    );
  }

  return (
    <li className="bb-mk-row">
      <span className="bb-mk-text">
        <span className="bb-mk-name">{name}</span>
        <span className="bb-mk-sub">{T.makeupRowLine(row, bracket)}</span>
        {choiceNeeded ? (
          <span className="bb-mk-sub">{T.choiceNeededLine(row.cycleName)}</span>
        ) : (
          retest.length > 0 && <span className="bb-mk-sub">{T.retestsLine(retest)}</span>
        )}
        {chosenByAdmin && <span className="bb-mk-sub">{T.SUBJECTS_CHOSEN_BY_ADMIN}</span>}
        {!choiceNeeded && p.new?.length > 0 && <span className="bb-mk-sub">{T.newInCycle(p.new, cycleName)}</span>}
        {!choiceNeeded && dropped.length > 0 && <span className="bb-mk-sub">{T.droppedFromCycle(dropped, cycleName)}</span>}
      </span>
      <span className="bb-mk-act">{action}</span>
    </li>
  );
}

export default function MakeupPickerDialog({ state, cycle, isAdmin, isPhone, onSearch, onAdd, onChoose, onRetry, onClose }) {
  const id = useId();
  const search = state.search.trim().toLowerCase();
  const rows = state.rows ?? [];
  const shown = search ? rows.filter((r) => `${r.firstName} ${r.lastName}`.toLowerCase().includes(search)) : rows;
  const answers = state.added ?? {};

  let body;
  if (state.failed) {
    body = <ErrorBanner text={T.LOAD_FAILED} onRetry={onRetry} />;
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
    body = <p className="field-hint bb-mk-empty">{T.MAKEUP_LIST_EMPTY}</p>;
  } else if (shown.length === 0) {
    body = <p className="field-hint bb-mk-empty">{T.makeupNoMatch(state.search.trim())}</p>;
  } else {
    body = (
      <div className="bb-mk-groups">
        {groupByCycle(shown).map((group) => (
          <section key={group.cycleId} className="bb-mk-group" aria-labelledby={`${id}-${group.cycleId}`}>
            <h3 id={`${id}-${group.cycleId}`} className="bb-mk-group-title">
              {T.makeupGroupTitle(group.cycleName, group.rows.length)}
            </h3>
            <ul className="bb-mk-list">
              {group.rows.map((row) => (
                <MakeupRow key={row.id} row={row} cycleName={cycle.name} answer={answers[row.id]} isAdmin={isAdmin} saving={state.saving} onAdd={onAdd} onChoose={onChoose} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <Dialog title={T.MAKEUP_TITLE} size="medium" fullScreen={isPhone} onRequestClose={onClose}>
      <p className="tdialog-sub">{T.MAKEUP_LEAD}</p>
      <div className="field bb-mk-search">
        <label htmlFor={`${id}-search`} className="visually-hidden">
          {T.SEARCH_BY_NAME}
        </label>
        <span className="bb-mk-search-icon" aria-hidden="true">
          {/* ti-search = search */}
          <IconSearch size={16} />
        </span>
        <input
          id={`${id}-search`}
          className="input bb-mk-input"
          type="search"
          autoComplete="off"
          maxLength={80}
          placeholder={T.SEARCH_BY_NAME}
          data-autofocus
          value={state.search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
      {body}
      {state.note && (
        <div className="tdialog-note">
          <Notice>{state.note}</Notice>
        </div>
      )}
      {!isPhone && (
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {T.CLOSE}
          </button>
        </div>
      )}
    </Dialog>
  );
}
