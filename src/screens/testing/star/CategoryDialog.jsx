// CategoryDialog.jsx — "Edit category" and "Add category" (approved mockup screens 2 and 3).
// Why it exists: v0.61 — admins rename, re-credit and add the categories of each Dan, with live
// totals. The dialog has two fields, Name and Credits (a number with "credits" written inside):
//   - under Credits, a live gray line: the most points the category can give ("Max points 45"
//     = credits × the A+ value)
//   - if the save would take the Dan away from 70 credits, an amber reminder right away:
//     "1st Dan total will be 75 credits (usually 70). Max becomes 337.5; pass mark stays 245."
//     It is a reminder, not a block — Save still works (v0.61: 70 is shown, not required)
//   - names must be different inside one Dan ("1st Dan already has a category called
//     Breaking. Try another name.")
//   - Add: both fields start empty, Save stays gray until both are filled, and a hint says
//     where it goes ("Added at the end of 1st Dan, after Korean Terminology."). A new category
//     is always judged on testing day.
//   - Assistant Instructor (the "from class count" category): the same two fields plus a
//     read-only "Grade — Grade comes from the assistant-class count."
// The checks are in rubricRules.js (checkCategoryForm); the frame in StarFormDialog.jsx.
import Notice from '../../../components/Notice.jsx';
import { checkCategoryForm } from './rubricRules.js';
import StarFormDialog, { NumberField, describe } from './StarFormDialog.jsx';
import * as T from './text.js';

export default function CategoryDialog({ state, dan, record, grades, isPhone, onChange, onTouch, onSave, onCancel, onRequestClose }) {
  const isAdd = state.mode === 'add';
  const check = checkCategoryForm(state, dan, record, grades);
  const readOnly = state.saving;
  const idBase = `star-category-${state.key}`;

  // "1st Dan · 7 of 11" (edit) — where the category sits now.
  let subtitle = dan.label;
  if (!isAdd && record) {
    const index = dan.categories.findIndex((c) => c.id === record.id);
    if (index !== -1) subtitle = T.categoryPlace(dan.label, index + 1, dan.categories.length);
  }
  const last = dan.categories[dan.categories.length - 1];
  const addHint = last ? T.addedAtEnd(dan.label, last.name) : T.addedFirst(dan.label);

  return (
    <StarFormDialog
      title={isAdd ? T.ADD_CATEGORY_TITLE : T.EDIT_CATEGORY}
      subtitle={subtitle}
      isPhone={isPhone}
      note={state.note}
      canSave={check.canSave}
      saving={state.saving}
      meta={!isAdd && record ? { name: record.updatedByName, at: record.updatedAt } : null}
      onSave={onSave}
      onCancel={onCancel}
      onRequestClose={onRequestClose}
    >
      <div className="field">
        <label htmlFor={`${idBase}-name`}>{T.NAME}</label>
        <input
          id={`${idBase}-name`}
          className="input"
          type="text"
          autoComplete="off"
          data-autofocus
          readOnly={readOnly}
          value={state.values.name}
          aria-invalid={check.nameError ? true : undefined}
          aria-describedby={check.nameError ? `${idBase}-name-error` : undefined}
          onChange={(event) => {
            onChange({ name: event.target.value });
            onTouch('name');
          }}
        />
        {check.nameError && <Notice id={`${idBase}-name-error`}>{check.nameError}</Notice>}
      </div>

      <div className="field">
        <label htmlFor={`${idBase}-credits`}>{T.CREDITS}</label>
        <NumberField
          id={`${idBase}-credits`}
          value={state.values.credits}
          suffix={T.CREDITS_SUFFIX}
          readOnly={readOnly}
          invalid={Boolean(check.creditsError)}
          describedBy={describe(check.maxPoints !== null && `${idBase}-max`, check.creditsError && `${idBase}-credits-error`)}
          onChange={(value) => {
            onChange({ credits: value });
            onTouch('credits');
          }}
          onBlur={() => onTouch('credits')}
        />
        {check.maxPoints !== null && (
          <p id={`${idBase}-max`} className="field-hint">
            {T.maxPoints(check.maxPoints)}
          </p>
        )}
        {check.creditsError && <Notice id={`${idBase}-credits-error`}>{check.creditsError}</Notice>}
      </div>

      {/* Assistant Instructor: its grade is never judged (v0.61). */}
      {record?.fromClassCount && (
        <div className="ro">
          <span className="ro-label">{T.GRADE_LABEL}</span>
          <div className="ro-value">{T.GRADE_FROM_COUNT}</div>
        </div>
      )}

      {check.totalNote && (
        <div className="st-total-note">
          <Notice>{check.totalNote}</Notice>
        </div>
      )}

      {isAdd && <p className="field-hint st-add-hint">{addHint}</p>}
    </StarFormDialog>
  );
}
