// EventTypesDialog.jsx — ⋯ → "Event types" (approved mockup screen 6, rulebook v0.234 / v0.239).
// Why it exists: an event's color comes from its TYPE. Admins add, rename and recolor types here
// (recoloring a type recolors all its events). Types are shared by both schools. Five come ready
// (Testing, Tournament, Camp, Meeting, Party); any can be renamed, recolored or deleted.
// One dialog with four steps (state.step):
//   'list'   — every type with its color; click one to edit it; reorder by dragging the grip
//              or with ⋯ → Move up / Move down, like Testing's lists (Jeffrey, C3); "+ Add type"
//   'add'    — Name + Color
//   'edit'   — Name + Color, "Used by 3 events", Delete
//   'delete' — the confirmation: if events use the type, it says how many and asks which type
//              they move to (Delete is permanent — no Undo)
import { useState } from 'react';
import { IconArrowDown, IconArrowLeft, IconArrowUp, IconCheck, IconDots, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import { useReorderDrag } from '../../lib/useReorderDrag.js';
import { Grip } from '../testing/RankRows.jsx';
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

export default function EventTypesDialog({ state, types, isPhone, onStep, onChange, onTouch, onSave, onDelete, onReorder, onCancel, onRequestClose }) {
  const idBase = `types-dialog-${state.key}`;
  const [menu, setMenu] = useState(null); // { anchor, type, index } — a row's ⋯ menu
  // Drag a row by its grip (mouse, finger or pen), as in Testing (v0.43 / v0.63).
  const drag = useReorderDrag({
    enabled: state.step === 'list' && !state.saving && menu === null,
    onDrop: (group, id, toIndex) => onReorder(types.find((t) => t.id === id), toIndex),
  });
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
              const lifted = drag.state?.id === t.id;
              return [
                drag.state && drag.state.gap === i && <li key="gap" className="ctypes-gap" aria-hidden="true" />,
                <li key={t.id} className={`ctypes-item${lifted ? ' is-lifted' : ''}`} data-drag-group="types" data-drag-id={t.id}>
                  <Grip label={T.dragType(t.name)} gripProps={drag.gripProps('types', t.id)} />
                  <button type="button" className="ctypes-row" data-type={t.id} data-autofocus={i === 0 ? true : undefined} aria-label={T.editTypeLabel(t.name)} onClick={() => onStep('edit', t)}>
                    <i className="cpanel-swatch" style={{ background: c.fill, borderColor: c.edge }} aria-hidden="true" />
                    <span className="ctypes-name">{t.name}</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    data-type-more={t.id}
                    aria-label={T.typeMore(t.name)}
                    aria-haspopup="menu"
                    aria-expanded={menu?.type.id === t.id ? 'true' : 'false'}
                    disabled={state.saving}
                    onClick={(e) => setMenu(menu ? null : { anchor: e.currentTarget, type: t, index: i })}
                  >
                    <IconDots size={20} aria-hidden="true" />
                  </button>
                </li>,
              ];
            })}
            {drag.state && drag.state.gap === types.length && <li className="ctypes-gap" aria-hidden="true" />}
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
        {menu && (
          <RowMenu
            anchor={menu.anchor}
            isSheet={isPhone}
            title={menu.type.name}
            subtitle={T.EVENT_TYPES}
            label={T.typeMore(menu.type.name)}
            items={[
              { key: 'edit', label: T.EDIT, Icon: IconEdit, onSelect: () => onStep('edit', menu.type) },
              { key: 'up', label: T.MOVE_UP_ITEM, Icon: IconArrowUp, disabled: menu.index === 0, onSelect: () => onReorder(menu.type, menu.index - 1) },
              { key: 'down', label: T.MOVE_DOWN_ITEM, Icon: IconArrowDown, disabled: menu.index === types.length - 1, onSelect: () => onReorder(menu.type, menu.index + 1) },
              { key: 'delete', label: T.DELETE_TYPE, Icon: IconTrash, danger: true, separatorBefore: true, onSelect: () => onStep('delete', menu.type) },
            ]}
            onClose={(reason) => {
              const anchor = menu.anchor;
              setMenu(null);
              if (reason === 'escape' || reason === 'tab') anchor?.focus();
            }}
          />
        )}
      </Dialog>
    );
  }

  // ----- Delete (confirmation) -----
  if (state.step === 'delete') {
    const others = types.filter((t) => t.id !== state.typeId);
    const loading = state.count === null;
    const count = state.count ?? 0;
    const blockedLast = count > 0 && others.length === 0;
    const canDelete = !state.saving && !loading && !blockedLast && (count === 0 || Boolean(state.moveTo));
    const back = () => onStep(state.deleteFrom ?? 'edit', type);
    return (
      <Dialog title={T.deleteTypeTitle(type?.name ?? '')} variant="confirm" describedBy={`${idBase}-del`} onRequestClose={back}>
        <p id={`${idBase}-del`} className="tdialog-sub tdialog-body">
          {loading ? T.CHECKING : blockedLast ? T.LAST_TYPE_IN_USE : T.deleteTypeBody(type?.name ?? '', count)}
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
          <button type="button" className="btn" data-autofocus onClick={back}>
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
                <button type="button" className="btn sdialog-remove" disabled={state.saving} onClick={() => onStep('delete', type, 'edit')}>
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
                <button type="button" className="btn sdialog-remove" disabled={state.saving} onClick={() => onStep('delete', type, 'edit')}>
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
