// RankDialog.jsx — one dialog for a rank, in three modes:
//   'edit'  Edit rank   (admin) — name, the three prices, sparring gear; Cancel + Save
//   'add'   Add rank    (admin) — same fields; the new rank goes at the END of its class
//   'view'  the rank's name as the title (staff) — the same information as plain text; Close
// Why it exists: approved mockup screens 2, 3 and 8 (v0.44, v0.46). It shows EVERY field,
// including the columns the tablet and phone lists leave out (Private, Sparring gear).
// PC and tablet: a centered dialog with the three prices side by side. Phone: a full screen
// with a back arrow, the prices stacked, and one full-width Save.
//
// This component only DRAWS the form. Its values live in ClassesRanksTab (the `state` prop),
// so that if the screen locks while the dialog is open, the dialog can disappear and come back
// after unlocking with everything still typed in (contract 0003 §8.5).
//
// Field checks happen while typing (guidelines 8) with the same rules as the database:
// names via src/lib/testing/names.js, prices via src/lib/money.js (whole dollars, $0–$1,000).
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { findDuplicateRank, nameProblem, normalizeName } from '../../lib/testing/names.js';
import { formatDollars, parseDollars } from '../../lib/money.js';
import { beltOf, describeBelt, sameBelt } from '../../lib/testing/belts.js';
import Belt from '../../components/Belt.jsx';
import BeltPicker, { beltFormProblem } from './BeltPicker.jsx';
import * as T from './text.js';

// The three price fields: key in the form values, label, and the record's cents column.
const PRICE_FIELDS = [
  { key: 'early', label: T.EARLY, column: 'earlyCents' },
  { key: 'day', label: T.TESTING_DAY, column: 'dayCents' },
  { key: 'priv', label: T.PRIVATE_TESTING, column: 'privateCents' },
];

// Did anything change since the dialog opened? (Decides whether Esc may close it.)
export function isRankFormDirty(state) {
  const a = state.values;
  const b = state.initial;
  return (
    a.name !== b.name ||
    a.early !== b.early ||
    a.day !== b.day ||
    a.priv !== b.priv ||
    a.sparring !== b.sparring ||
    !sameBelt(a.belt, b.belt) // changing the belt counts as a change (v0.65)
  );
}

// Checks the form. Returns the messages to show and whether Save is available.
//   classView  the rank's class (for the duplicate-name check)
//   record     the saved rank (edit mode), to tell "really changed" from "typed the same value"
export function checkRankForm(state, classView, record) {
  const { values, touched } = state;
  const className = classView?.name ?? '';

  // ----- Name -----
  const problem = nameProblem(values.name);
  let nameError = null;
  const typed = normalizeName(values.name);
  // The server said "duplicate" for exactly this name (it may know a rank we haven't loaded).
  const serverDuplicate = state.duplicateName !== null && state.duplicateName === typed;
  const localDuplicate = problem ? null : findDuplicateRank(classView, values.name, state.rankId ?? null);
  if (serverDuplicate) nameError = T.duplicateRank(className, typed);
  else if (problem === 'empty') nameError = touched.name ? T.nameProblemText('empty', 'rank') : null;
  else if (problem) nameError = T.nameProblemText(problem, 'rank');
  else if (localDuplicate) nameError = T.duplicateRank(className, localDuplicate);

  // ----- Prices -----
  const parsed = {};
  const priceErrors = {};
  let pricesOk = true;
  for (const field of PRICE_FIELDS) {
    const result = parseDollars(values[field.key]);
    if (result.problem) {
      pricesOk = false;
      // "Enter a price" only once someone has been in the field; other problems right away.
      if (result.problem !== 'empty' || touched[field.key]) priceErrors[field.key] = T.priceProblemText(result.problem);
    } else {
      parsed[field.column] = result.cents;
    }
  }

  // The belt (v0.65): the picker only offers valid parts, but a stripe in the belt's own color
  // isn't allowed (it would look solid) — BeltPicker shows that message.
  const beltOk = beltFormProblem(values.belt) === null;

  const valid = !problem && !localDuplicate && !serverDuplicate && pricesOk && beltOk;
  // For an edit: is the result the same as what's saved? (Then Save just closes.)
  const sameAsSaved =
    state.mode === 'edit' &&
    record &&
    valid &&
    typed === record.name &&
    parsed.earlyCents === record.earlyCents &&
    parsed.dayCents === record.dayCents &&
    parsed.privateCents === record.privateCents &&
    values.sparring === record.sparringGear &&
    sameBelt(values.belt, record);

  // Save is blue whenever the form can be saved — also when nothing changed (v0.57); saving an
  // unchanged form just closes the dialog (sameAsSaved). Gray only while it can't be used:
  // a field problem, a save on its way, or a refused save (someone else changed it, not allowed).
  const canSave = valid && !state.saving && !state.blocked;

  return {
    nameError,
    priceErrors,
    canSave,
    sameAsSaved,
    payload: valid ? { name: typed, ...parsed, sparringGear: values.sparring, ...beltOf(values.belt) } : null,
  };
}

// The "Testing for" line (read-only).
function TestingForText({ rankView, isAdmin }) {
  if (!rankView) return null;
  // The next rank's belt picture goes in front of its name (v0.64 review).
  const nextBelt = rankView.nextBelt ?? null;
  if (!rankView.isLast) {
    return (
      <p className="ro-value ro-belt-line">
        <Belt belt={nextBelt} />
        <span>
          {rankView.testingFor?.name}
          <span className="ro-muted">{T.TESTING_FOR_NEXT_SUFFIX}</span>
        </span>
      </p>
    );
  }
  if (rankView.finalAwardState === 'none') {
    // None (v0.62): the last rank doesn't promote, on purpose — neutral, not amber.
    return (
      <p className="ro-value">
        {T.TESTING_FOR_NONE}
        {isAdmin && <span className="ro-muted">{T.TESTING_FOR_NONE_SUFFIX}</span>}
      </p>
    );
  }
  if (rankView.finalAwardState === 'set') {
    return (
      <p className="ro-value ro-belt-line">
        <Belt belt={nextBelt} />
        <span>
          {rankView.testingFor.name}
          <span className="ro-muted">{T.TESTING_FOR_AWARD_SUFFIX}</span>
        </span>
      </p>
    );
  }
  return (
    <p className="tfwarn">
      <IconAlertTriangle size={16} aria-hidden="true" />
      <span>{isAdmin ? T.AWARD_NOT_SET_ADMIN : T.AWARD_NOT_SET_STAFF}</span>
    </p>
  );
}

// The note above the buttons (amber): unsaved changes, someone else changed it, etc.
// Notes that get the "Discard changes" link on phones.
const PHONE_DISCARD_NOTES = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED'];

const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
};

export default function RankDialog({
  state, // the form (see ClassesRanksTab: openRankDialog)
  school, // 'Worcester' | 'Shrewsbury'
  classView, // the rank's class, as loaded (or as it was when the dialog opened)
  rankView, // edit / view: the rank, as loaded (or as it was)
  addInfo, // add: describeAddRank(...) → { className, lastRankName, copied }
  isAdmin,
  isPhone,
  isWide, // PC width: the two-column edit dialog
  onChange, // (patch of values) => void
  onTouch, // (field) => void — the person typed in / left that field
  onSave,
  onCancel,
  onRequestClose,
}) {
  const className = classView?.name ?? addInfo?.className ?? '';

  // ----- View only (staff) -----
  if (state.mode === 'view') {
    const rank = rankView;
    return (
      <Dialog
        title={rank.name}
        ariaLabel={T.viewOnlyDialogLabel(rank.name)}
        size="detail"
        fullScreen={isPhone}
        onRequestClose={onRequestClose}
      >
        <p className="tdialog-sub">{T.viewOnlySubtitle(className, school)}</p>
        <div className="ro">
          <p className="ro-label">{T.RANK_NAME}</p>
          <p className="ro-value">{rank.name}</p>
        </div>
        <div className="ro">
          <p className="ro-label">{T.TESTING_FOR}</p>
          <TestingForText rankView={rank} isAdmin={false} />
        </div>
        <div className="ro">
          <p className="ro-label">{T.BELT}</p>
          <p className="ro-value belt-preview">
            <Belt belt={rank} size="dialog" />
            <span>{describeBelt(beltOf(rank)) ?? ''}</span>
          </p>
        </div>
        <div className="tdialog-divider" />
        <p className="ro-label tdialog-group">{T.PRICES}</p>
        <div className={isPhone ? 'ro-prices is-stacked' : 'ro-prices'}>
          {PRICE_FIELDS.map((field) => (
            <div key={field.key} className="ro">
              <p className="ro-label">{field.label}</p>
              <p className="ro-value">
                {formatDollars(rank[field.column])}
                {isPhone && field.key === 'early' && <span className="ro-muted">{T.EARLY_VIEW_PHONE_SUFFIX}</span>}
              </p>
            </div>
          ))}
        </div>
        {!isPhone && <p className="field-hint tdialog-hint">{T.EARLY_HINT}</p>}
        <div className="ro">
          <p className="ro-label">{T.SPARRING_REQUIRED}</p>
          <p className="ro-value">{rank.sparringGear ? T.YES : T.NO}</p>
        </div>
        <p className="tmeta">{T.lastChanged(rank.updatedByName, rank.updatedAt)}</p>
        {!isPhone && (
          <div className="dialog-actions">
            <button type="button" className="btn" data-autofocus onClick={onCancel}>
              {T.CLOSE}
            </button>
          </div>
        )}
      </Dialog>
    );
  }

  // ----- Edit / Add (admin) -----
  const isAdd = state.mode === 'add';
  // Compared with the rank as it was when the dialog opened (the version the save will send).
  const check = checkRankForm(state, classView, state.snapshot?.rank ?? rankView);
  const readOnly = state.saving; // fields can't change while the save is on its way
  const idBase = `rank-dialog-${state.key}`;
  const describe = (...ids) => ids.filter(Boolean).join(' ') || undefined;

  function handleSubmit(event) {
    event.preventDefault(); // stop the browser from reloading the page
    if (check.canSave) onSave(); // Enter in a field = Save, but only when Save is available
  }

  const saveButton = (
    <button
      type="submit"
      className={`btn btn-primary${isPhone ? ' btn-block' : ''}${check.canSave ? '' : ' is-unavailable'}`}
      aria-disabled={check.canSave ? undefined : 'true'}
    >
      {/* ti-check = Save (and only Save) */}
      <IconCheck size={16} aria-hidden="true" />
      {state.saving ? T.SAVING : T.SAVE}
    </button>
  );

  // The "Testing for" line: for Add it says where the new rank goes.
  let testingFor;
  if (isAdd) {
    testingFor = (
      <p className="ro-muted-line">
        {addInfo?.lastRankName ? T.addRankAtEnd(className, addInfo.lastRankName) : T.addRankFirst(className)}
      </p>
    );
  } else {
    testingFor = <TestingForText rankView={rankView} isAdmin={isAdmin} />;
  }

  // ----- The pieces of the form (arranged below by screen size) -----
  const nameField = (
    <div className="field">
      <label htmlFor={`${idBase}-name`}>{T.RANK_NAME}</label>
      <input
        id={`${idBase}-name`}
        className="input"
        type="text"
        autoComplete="off"
        data-autofocus
        readOnly={readOnly}
        value={state.values.name}
        aria-invalid={check.nameError ? true : undefined}
        aria-describedby={describe(check.nameError && `${idBase}-name-error`)}
        onChange={(event) => {
          onChange({ name: event.target.value });
          onTouch('name');
        }}
      />
      {check.nameError && <Notice id={`${idBase}-name-error`}>{check.nameError}</Notice>}
    </div>
  );

  const testingForBlock = (
    <div className="ro">
      <p className="ro-label">{T.TESTING_FOR}</p>
      {testingFor}
    </div>
  );

  // Belt (v0.65): live preview, pattern, colors, end stripes
  const beltBlock = (
    <div className="rank-belt">
      <p className="ro-label tdialog-group">{T.BELT}</p>
      <BeltPicker
        belt={state.values.belt}
        name={normalizeName(state.values.name)}
        readOnly={readOnly}
        onChange={(belt) => onChange({ belt })}
      />
    </div>
  );

  const pricesBlock = (
    <>
      <p className="ro-label tdialog-group">{T.PRICES}</p>
      {isAdd && (
        <p className="field-hint tdialog-copied">
          {addInfo?.copied ? T.copiedFrom(addInfo.lastRankName) : T.FIRST_RANK_PRICES}
        </p>
      )}
      <div className={isPhone ? 'tprices is-stacked' : 'tprices'}>
        {PRICE_FIELDS.map((field) => {
          const error = check.priceErrors[field.key];
          const hintId = isPhone && field.key === 'early' ? `${idBase}-early-hint` : null;
          return (
            <div key={field.key} className="field tprice">
              <label htmlFor={`${idBase}-${field.key}`}>{field.label}</label>
              <div className={`money${readOnly ? ' is-readonly' : ''}`}>
                <span className="money-prefix" aria-hidden="true">
                  $
                </span>
                <input
                  id={`${idBase}-${field.key}`}
                  className="money-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  readOnly={readOnly}
                  value={state.values[field.key]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describe(hintId, error && `${idBase}-${field.key}-error`)}
                  onChange={(event) => {
                    onChange({ [field.key]: event.target.value });
                    onTouch(field.key);
                  }}
                  onBlur={() => onTouch(field.key)}
                />
              </div>
              {hintId && (
                <p id={hintId} className="field-hint">
                  {T.EARLY_HINT_PHONE}
                </p>
              )}
              {error && <Notice id={`${idBase}-${field.key}-error`}>{error}</Notice>}
            </div>
          );
        })}
      </div>
      {!isPhone && <p className="field-hint tdialog-hint">{T.EARLY_HINT}</p>}

      <label className="cbrow">
        <input
          type="checkbox"
          className="cb"
          checked={state.values.sparring}
          disabled={readOnly}
          onChange={(event) => onChange({ sparring: event.target.checked })}
        />
        <span>{T.SPARRING_REQUIRED}</span>
      </label>

      {!isAdd && rankView && <p className="tmeta">{T.lastChanged(rankView.updatedByName, rankView.updatedAt)}</p>}
    </>
  );

  return (
    <Dialog
      title={isAdd ? T.ADD_RANK_TITLE : T.EDIT_RANK}
      // PC: a wide two-column dialog (details left, Belt right) so it never needs much
      // scrolling; tablet: one 520px column (nine color swatches fit in a row); phone: full screen.
      size={isWide ? 'wide' : 'medium'}
      fullScreen={isPhone}
      onRequestClose={onRequestClose}
    >
      <p className="tdialog-sub">{T.classAtSchool(className, school)}</p>
      {/* noValidate: our own plain-language messages instead of the browser's pop-ups */}
      <form onSubmit={handleSubmit} noValidate>
        {isWide ? (
          <div className="rank-cols">
            <div className="rank-col">
              {nameField}
              {testingForBlock}
              <div className="tdialog-divider" />
              {pricesBlock}
            </div>
            <div className="rank-col">{beltBlock}</div>
          </div>
        ) : (
          // Tablet and phone: the Belt section comes right after the name (approved mockup).
          <>
            {nameField}
            <div className="tdialog-divider" />
            {beltBlock}
            {testingForBlock}
            <div className="tdialog-divider" />
            {pricesBlock}
          </>
        )}

        {state.note && (
          <div className="tdialog-note">
            <Notice>
              {isPhone && state.note === 'STALE_DIALOG' ? T.STALE_DIALOG_PHONE : NOTES[state.note]}
              {/* Phone only (v0.56): the page has no Cancel button, so these notes offer the way
                  out themselves (Save is unavailable after "stale" / "not allowed").
                  Closes without saving, like Cancel. */}
              {isPhone && PHONE_DISCARD_NOTES.includes(state.note) && (
                <button type="button" className="note-action" onClick={onCancel}>
                  {T.DISCARD_CHANGES}
                </button>
              )}
            </Notice>
          </div>
        )}

        {isPhone ? (
          <div className="dialog-page-submit">{saveButton}</div>
        ) : (
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onCancel}>
              {T.CANCEL}
            </button>
            {saveButton}
          </div>
        )}
      </form>
    </Dialog>
  );
}
