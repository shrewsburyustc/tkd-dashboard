// DanSettingsDialog.jsx — "Edit Dan settings" (approved mockup screen 7).
// Why it exists: v0.61 — per Dan, admins change the pass mark and the highest star. Opened
// straight from the Edit icon on the Dan line (no menu in between). Two number fields:
//   - Pass mark, with "Out of 315" under it (the Dan's max score)
//   - Highest star, with "Candidates can test up to this many stars."
// and a gray preview box that updates while typing:
//   "Progressions: 0→1, 1→2, 2→3, 3→4 stars" — the choices candidates see when they register
//   "Max score 315 (70 credits × 4.5)"
// The Dan's fees are saved by the same database call (with the same version), but are edited in
// their own dialog (FeesDialog.jsx); this one sends the saved fees back unchanged.
import Notice from '../../../components/Notice.jsx';
import { checkDanForm } from './rubricRules.js';
import StarFormDialog, { NumberField, describe } from './StarFormDialog.jsx';
import * as T from './text.js';

export default function DanSettingsDialog({ state, dan, grades, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const check = checkDanForm(state, dan, grades);
  const readOnly = state.saving;
  const idBase = `star-dan-${state.key}`;
  const { facts } = check;

  return (
    <StarFormDialog
      title={T.EDIT_DAN_SETTINGS}
      subtitle={dan.label}
      isPhone={isPhone}
      note={state.note}
      canSave={check.canSave}
      saving={state.saving}
      meta={{ name: dan.updatedByName, at: dan.updatedAt }}
      onSave={onSave}
      onCancel={onCancel}
      onRequestClose={onRequestClose}
    >
      <div className="field">
        <label htmlFor={`${idBase}-pass`}>{T.PASS_MARK}</label>
        <NumberField
          id={`${idBase}-pass`}
          value={state.values.passMark}
          decimal
          autoFocus
          readOnly={readOnly}
          invalid={Boolean(check.passError)}
          describedBy={describe(`${idBase}-pass-hint`, check.passError && `${idBase}-pass-error`)}
          onChange={(value) => {
            onChange({ passMark: value });
            onTouch('passMark');
          }}
          onBlur={() => onTouch('passMark')}
        />
        <p id={`${idBase}-pass-hint`} className="field-hint">
          {T.outOf(facts.max)}
        </p>
        {check.passError && <Notice id={`${idBase}-pass-error`}>{check.passError}</Notice>}
      </div>

      <div className="field">
        <label htmlFor={`${idBase}-star`}>{T.HIGHEST_STAR}</label>
        <NumberField
          id={`${idBase}-star`}
          value={state.values.starLimit}
          readOnly={readOnly}
          invalid={Boolean(check.starError)}
          describedBy={describe(`${idBase}-star-hint`, check.starError && `${idBase}-star-error`)}
          onChange={(value) => {
            onChange({ starLimit: value });
            onTouch('starLimit');
          }}
          onBlur={() => onTouch('starLimit')}
        />
        <p id={`${idBase}-star-hint`} className="field-hint">
          {T.HIGHEST_STAR_HINT}
        </p>
        {check.starError && <Notice id={`${idBase}-star-error`}>{check.starError}</Notice>}
      </div>

      {/* aria-live: screen readers hear the preview change while typing */}
      <div className="st-preview" aria-live="polite">
        <div>{T.progressions(check.previewLimit)}</div>
        <div>{T.maxScoreLine(facts.max, facts.credits, facts.aPlus)}</div>
      </div>
    </StarFormDialog>
  );
}
