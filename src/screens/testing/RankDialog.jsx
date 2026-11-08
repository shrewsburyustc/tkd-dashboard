// RankDialog.jsx — one dialog for a rank, in three forms (CB14, rulebook v0.427 / v0.432):
//   Edit rank    (Settings → Classes and ranks; state.part 'structure') — rank name, belt, and the
//                read-only "Testing for". No prices.
//   Edit prices  (Color belt testing → Prices; state.part 'prices') — Early, Testing day, Private
//                testing, Sparring gear. Titled "Edit prices", rank · class · school under it.
//   Add rank     (Settings; mode 'add', part 'all') — everything: name, belt AND the prices and
//                Sparring gear, pre-filled from the rank above ("Copied from …", Jeffrey 2026-11-07:
//                "A"), so a new rank never goes live with prices nobody saw. It goes at the END of its class.
// Why it exists: approved mockup screens 2 and 3 (v0.44, v0.46), split by the dialog sheet of
// 2026-11-07 (docs/Testing/Color Belt Testing/Design Review mockups/cb14-dialogs/). Staff have no
// dialog any more: the Prices tab is view only and shows every price on every size.
// PC: a centered dialog (Edit rank: details left, Belt right). Phone: a full screen with a back
// arrow, the prices stacked, and one full-width Save.
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
import { normalizeName } from '../../lib/testing/names.js';
import Belt from '../../components/Belt.jsx';
import BeltPicker from './BeltPicker.jsx';
import { PRICE_FIELDS, checkRankForm } from '../../lib/testing/classRankForms.js';
import * as T from './text.js';

// The form checks live in lib/testing/classRankForms.js (plain JavaScript, so node can test them); ClassesRanksTab
// still imports them from here.
export { checkRankForm, isRankFormDirty } from '../../lib/testing/classRankForms.js';

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
  isWide, // PC width: the two-column Edit rank / Add rank dialog
  onChange, // (patch of values) => void
  onTouch, // (field) => void — the person typed in / left that field
  onSave,
  onCancel,
  onRequestClose,
}) {
  const className = classView?.name ?? addInfo?.className ?? '';

  // ----- Edit rank / Edit prices / Add rank (admins) -----
  const isAdd = state.mode === 'add';
  const isPrices = state.part === 'prices'; // Edit prices: only the price fields
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
      {!isPrices && <p className="ro-label tdialog-group">{T.PRICES}</p>}
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
                  data-autofocus={isPrices && field.key === 'early' ? true : undefined}
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

  // The note (unsaved / stale / failed …). Phones: above the Save button; PC / tablet: under
  // the Cancel / Save row, so the buttons never move when it appears (v0.81).
  const noteBlock = state.note && (
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
  );

  const rankName = rankView?.name ?? state.snapshot?.rank?.name ?? '';
  return (
    <Dialog
      title={isAdd ? T.ADD_RANK_TITLE : isPrices ? T.EDIT_PRICES : T.EDIT_RANK}
      // PC: Edit rank / Add rank are wide two-column dialogs (details left, Belt right) so they never
      // need much scrolling; Edit prices is a single 520px column; tablet: one 520px column (nine
      // color swatches fit in a row); phone: full screen.
      size={isWide && !isPrices ? 'wide' : 'medium'}
      fullScreen={isPhone}
      onRequestClose={onRequestClose}
    >
      <p className="tdialog-sub">{isPrices ? T.pricesSubtitle(rankName, className, school) : T.classAtSchool(className, school)}</p>
      {/* noValidate: our own plain-language messages instead of the browser's pop-ups */}
      <form onSubmit={handleSubmit} noValidate>
        {isPrices ? (
          pricesBlock
        ) : isWide ? (
          <div className="rank-cols">
            <div className="rank-col">
              {nameField}
              {testingForBlock}
              {isAdd && (
                <>
                  <div className="tdialog-divider" />
                  {pricesBlock}
                </>
              )}
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
            {isAdd && (
              <>
                <div className="tdialog-divider" />
                {pricesBlock}
              </>
            )}
          </>
        )}

        {/* Edit rank: the "Last changed by" line (Edit prices and Add rank carry it in the prices block) */}
        {!isAdd && !isPrices && rankView && <p className="tmeta">{T.lastChanged(rankView.updatedByName, rankView.updatedAt)}</p>}

        {isPhone && noteBlock}

        {isPhone ? (
          <div className="dialog-page-submit">{saveButton}</div>
        ) : (
          <div className="dialog-footer">
            {/* PC / tablet (v0.81): buttons and, under them, the note share one bottom area, so the
                buttons never move and, on a short screen, both stay pinned in view. */}
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
