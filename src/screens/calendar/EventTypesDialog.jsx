// EventTypesDialog.jsx — ⋯ → "Event types" (approved mockup screen 6, rulebook v0.138 / v0.143).
// Why it exists: an event's color comes from its TYPE. Admins add, rename and recolor types here
// (recoloring a type recolors all its events). Types are shared by both schools. Five come ready
// (Testing, Tournament, Camp, Meeting, Party); any can be renamed, recolored or deleted.
// One dialog with four steps (state.step):
//   'list'   — every type with its color; click one to edit it; arrows change the order; "+ Add type"
//   'add'    — Name + Color
//   'edit'   — Name + Color, "Used by 3 events", Delete
//   'delete' — the confirmation: if events use the type, it says how many and asks which type
//              they move to (Delete is permanent — no Undo)
import { IconArrowDown, IconArrowLeft, IconArrowUp, IconCheck, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { CLASS_COLORS, colorOf } from '../../lib/schedule/colors.js';
import { cleanText, MAX_TYPES, textProblem, TYPE_NAME_MAX } from '../../lib/calendar/rules.js';
import * as T from './text.js';

export const isTypeFormDirty = (state) => (state.step === 'add' || state.step === 'edit') && JSON.stringify(state.values) !== JSON.stringify(state.initial);

export function checkTypeForm(state, types) {
  const problem = textProblem(state.values.name, TYPE_NAME_MAX);
  const name = cleanText(state.values.name);
  const taken = problem === null && types.some((t) => t.id !== state.typeId && t.name.toLowerCase() === name.toLowerCase());
  return {
    nameError: problem && (state.touched.name || state.touched.submit) ? T.textProblemText(problem, TYPE_NAME_MAX) : taken || state.note === 'DUPLICATE' ? T.DUPLICATE_TYPE : null,
    canSave: problem === null && !taken && !state.saving && !state.blocked,
    sameAsSaved: state.step === 'edit' && !isTypeFormDirty(state),
    payload: { name, color: state.values.color },
  };
}

const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
  DELETE_FAILED: T.DELETE_FAILED,
};

export default function EventTypesDialog({ state, types, isPhone, onStep, onChange, onTouch, onSave, onDelete, onMove, onCancel, onRequestClose }) {
  const idBase = `types-dialog-${state.key}`;
  const type = types.find((t) => t.id === state.typeId) ?? null;
  const noteBlock = state.note && NOTES[state.note] && (
    <div className="tdialog-note">
      <Notice>{NOTES[state.note]}</Notice>
    </div>
  );

  // ----- The list -----
  if (state.step === 'list') {
    return (
      <Dialog title={T.EVENT_TYPES} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
        <p className="tdialog-sub">{T.TYPES_SUB}</p>
        {types.length === 0 ? (
          <p className="cpanel-empty">{T.NO_TYPES_YET}</p>
        ) : (
          <ul className="ctypes">
            {types.map((t, i) => {
              const c = colorOf(t.color);
              return (
                <li key={t.id} className="ctypes-item">
                  <button type="button" className="ctypes-row" data-type={t.id} data-autofocus={i === 0 ? true : undefined} aria-label={T.editTypeLabel(t.name)} onClick={() => onStep('edit', t)}>
                    <i className="cpanel-swatch" style={{ background: c.fill, borderColor: c.edge }} aria-hidden="true" />
                    <span className="ctypes-name">{t.name}</span>
                    <IconEdit size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="icon-button ctypes-move" data-move={`${t.id}:-1`} aria-label={T.MOVE_UP(t.name)} disabled={i === 0 || state.saving} onClick={() => onMove(t, -1)}>
                    <IconArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="icon-button ctypes-move" data-move={`${t.id}:1`} aria-label={T.MOVE_DOWN(t.name)} disabled={i === types.length - 1 || state.saving} onClick={() => onMove(t, 1)}>
                    <IconArrowDown size={16} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {types.length < MAX_TYPES && (
          <button type="button" className="btn ctypes-add" onClick={() => onStep('add')}>
            <IconPlus size={16} aria-hidden="true" />
            {T.ADD_TYPE}
          </button>
        )}
        {noteBlock}
        {!isPhone && (
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onCancel}>
              {T.CLOSE}
            </button>
          </div>
        )}
      </Dialog>
    );
  }

  // ----- Delete (confirmation) -----
  if (state.step === 'delete') {
    const others = types.filter((t) => t.id !== state.typeId);
    const count = state.count ?? 0;
    const blockedLast = count > 0 && others.length === 0;
    const canDelete = !state.saving && !blockedLast && (count === 0 || Boolean(state.moveTo));
    return (
      <Dialog title={T.deleteTypeTitle(type?.name ?? '')} variant="confirm" describedBy={`${idBase}-del`} onRequestClose={() => onStep('edit', type)}>
        <p id={`${idBase}-del`} className="tdialog-sub tdialog-body">
          {blockedLast ? T.LAST_TYPE_IN_USE : T.deleteTypeBody(type?.name ?? '', count)}
        </p>
        {count > 0 && !blockedLast && (
          <div className="field">
            <label htmlFor={`${idBase}-move`}>{T.MOVE_TO}</label>
            <select id={`${idBase}-move`} className="input sdialog-select" value={state.moveTo ?? ''} disabled={state.saving} onChange={(e) => onChange({ moveTo: e.target.value || null }, 'delete')}>
              <option value="">{T.CHOOSE_TYPE}</option>
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" data-autofocus onClick={() => onStep('edit', type)}>
            {T.CANCEL}
          </button>
          {!blockedLast && (
            <button type="button" className={`btn btn-delete${canDelete ? '' : ' is-unavailable'}`} aria-disabled={canDelete ? undefined : 'true'} onClick={() => canDelete && onDelete()}>
              <IconTrash size={16} aria-hidden="true" />
              {state.saving ? T.DELETING : T.DELETE}
            </button>
          )}
        </div>
        {noteBlock}
      </Dialog>
    );
  }

  // ----- Add / edit -----
  const check = checkTypeForm(state, types);
  const isAdd = state.step === 'add';
  function handleSubmit(event) {
    event.preventDefault();
    if (check.canSave) onSave();
    else onTouch(['submit', 'name']);
  }
  const saveButton = (
    <button type="submit" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${check.canSave ? '' : ' is-unavailable'}`} aria-disabled={check.canSave ? undefined : 'true'}>
      <IconCheck size={16} aria-hidden="true" />
      {state.saving ? T.SAVING : T.SAVE}
    </button>
  );
  return (
    <Dialog title={isAdd ? T.ADD_TYPE_TITLE : T.EDIT_TYPE_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
      {!isAdd && <p className="tdialog-sub">{T.usedBy(state.count)}</p>}
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor={`${idBase}-name`}>{T.NAME}</label>
          <input
            id={`${idBase}-name`}
            className="input"
            data-autofocus
            readOnly={state.saving}
            value={state.values.name}
            maxLength={120}
            aria-invalid={check.nameError ? true : undefined}
            aria-describedby={check.nameError ? `${idBase}-name-error` : undefined}
            onChange={(e) => onChange({ name: e.target.value })}
            onBlur={() => onTouch(['name'])}
          />
          {check.nameError && <Notice id={`${idBase}-name-error`}>{check.nameError}</Notice>}
        </div>
        <fieldset className="field sdialog-fieldset">
          <legend id={`${idBase}-color`} className="field-label">
            {T.COLOR}
          </legend>
          <div className="sswatches" role="radiogroup" aria-labelledby={`${idBase}-color`}>
            {CLASS_COLORS.map((c) => {
              const on = state.values.color === c.key;
              return (
                <label key={c.key} className={`sswatch${on ? ' is-on' : ''}`} style={{ '--sw-fill': c.fill, '--sw-edge': c.edge }}>
                  <input type="radio" name={`${idBase}-color`} className="sswatch-input" value={c.key} checked={on} disabled={state.saving} aria-label={c.label} onChange={() => onChange({ color: c.key })} />
                  <span className="sswatch-dot" aria-hidden="true" />
                </label>
              );
            })}
          </div>
        </fieldset>

        {isPhone && noteBlock}
        {isPhone ? (
          <>
            <div className="dialog-page-submit">{saveButton}</div>
            {!isAdd && (
              <div className="sdialog-remove-row">
                <button type="button" className="btn sdialog-remove" disabled={state.saving} onClick={() => onStep('delete', type)}>
                  <IconTrash size={16} aria-hidden="true" />
                  {T.DELETE}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="dialog-footer">
            <div className="dialog-actions sdialog-actions">
              {isAdd ? (
                <button type="button" className="btn" onClick={() => onStep('list')}>
                  <IconArrowLeft size={16} aria-hidden="true" />
                  {T.EVENT_TYPES}
                </button>
              ) : (
                <button type="button" className="btn sdialog-remove" disabled={state.saving} onClick={() => onStep('delete', type)}>
                  <IconTrash size={16} aria-hidden="true" />
                  {T.DELETE}
                </button>
              )}
              <span className="sdialog-actions-right">
                <button type="button" className="btn" onClick={() => onStep('list')}>
                  {T.CANCEL}
                </button>
                {saveButton}
              </span>
            </div>
            {noteBlock}
          </div>
        )}
      </form>
    </Dialog>
  );
}
