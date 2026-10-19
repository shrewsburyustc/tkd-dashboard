// StatusesDialog.jsx — "Edit statuses" (mockup screen 7; rulebook v0.140, v0.191 answers 5 and 7).
// Why it exists: each school has its own status list. Admins AND staff rename, recolor, reorder
// (drag the grip, or ⋯ → Move up / Move down, like the Calendar's event types) and add statuses —
// each is a stage (in the bar) or a side exit (a chip). Only ADMINS delete a custom status, and
// its people move to another status first. The six built-in statuses (New, Booked, Came, Joined,
// No-show, Not interested) can be renamed and recolored but not deleted, and keep where they show.
// One dialog with four steps (state.step): 'list' | 'add' | 'edit' | 'delete'.
import { useState } from 'react';
import { IconArrowDown, IconArrowLeft, IconArrowUp, IconCheck, IconDots, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import { useReorderDrag } from '../../lib/useReorderDrag.js';
import { CLASS_COLORS, colorOf } from '../../lib/schedule/colors.js';
import { cleanText, textProblem } from '../../lib/calendar/rules.js';
import { Grip } from '../testing/RankRows.jsx';
import * as T from './text.js';

export const isStatusFormDirty = (state) => (state.step === 'add' || state.step === 'edit') && JSON.stringify(state.values) !== JSON.stringify(state.initial);

export function checkStatusForm(state, statuses) {
  const problem = textProblem(state.values.name, 40);
  const name = cleanText(state.values.name);
  const taken = problem === null && statuses.some((s) => s.id !== state.statusId && s.name.toLowerCase() === name.toLowerCase());
  return {
    nameError: problem && (state.touched?.name || state.touched?.submit) ? T.NAME_BAD : taken ? T.DUPLICATE_NAME : null,
    canSave: problem === null && !taken && !state.saving,
    payload: { name, kind: state.values.kind, color: state.values.color },
  };
}

const NOTES = { STALE: T.STALE, SAVE_FAILED: T.SAVE_FAILED, INVALID: T.INVALID, NOT_ALLOWED: T.ADMIN_ONLY, DUPLICATE: T.DUPLICATE_NAME };

export default function StatusesDialog({ state, statuses, counts, schoolName, isAdmin, isPhone, onStep, onChange, onTouch, onSave, onDelete, onReorder, onCancel, onRequestClose }) {
  const idBase = `statuses-${state.key}`;
  const [menu, setMenu] = useState(null);
  const drag = useReorderDrag({ enabled: state.step === 'list' && !state.saving && menu === null, onDrop: (group, id, toIndex) => onReorder(statuses.find((s) => s.id === id), toIndex) });
  const status = statuses.find((s) => s.id === state.statusId) ?? null;
  const noteBlock = state.note && NOTES[state.note] && (
    <div className="tdialog-note">
      <Notice>{NOTES[state.note]}</Notice>
    </div>
  );

  if (state.step === 'list') {
    return (
      <Dialog title={T.STATUSES_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
        <p className="tdialog-sub">{T.statusesSub(schoolName)}</p>
        <ul className="ctypes">
          {statuses.map((s, i) => {
            const c = colorOf(s.color);
            return [
              drag.state && drag.state.gap === i && <li key="gap" className="ctypes-gap" aria-hidden="true" />,
              <li key={s.id} className={`ctypes-item${drag.state?.id === s.id ? ' is-lifted' : ''}`} data-drag-group="statuses" data-drag-id={s.id}>
                <Grip label={T.dragStatus(s.name)} gripProps={drag.gripProps('statuses', s.id)} />
                <button type="button" className="ctypes-row" data-autofocus={i === 0 ? true : undefined} onClick={() => onStep('edit', s)}>
                  <i className="cpanel-swatch" style={{ background: c.fill, borderColor: c.edge }} aria-hidden="true" />
                  <span className="ctypes-name">{s.name}</span>
                  <span className="pkind">{s.kind === 'stage' ? T.KIND_STAGE : T.KIND_EXIT}{s.builtin ? ` · ${T.BUILTIN_TAG}` : ''}</span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={T.statusMore(s.name)}
                  aria-haspopup="menu"
                  disabled={state.saving}
                  onClick={(e) => setMenu(menu ? null : { anchor: e.currentTarget, status: s, index: i })}
                >
                  <IconDots size={20} aria-hidden="true" />
                </button>
              </li>,
            ];
          })}
          {drag.state && drag.state.gap === statuses.length && <li className="ctypes-gap" aria-hidden="true" />}
        </ul>
        {statuses.length < 30 && (
          <button type="button" className="btn ctypes-add" onClick={() => onStep('add')}>
            <IconPlus size={16} aria-hidden="true" />
            {T.ADD_STATUS}
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
            title={menu.status.name}
            subtitle={T.STATUSES_TITLE}
            label={T.statusMore(menu.status.name)}
            items={[
              { key: 'edit', label: T.EDIT, Icon: IconEdit, onSelect: () => onStep('edit', menu.status) },
              { key: 'up', label: T.MOVE_UP, Icon: IconArrowUp, disabled: menu.index === 0, onSelect: () => onReorder(menu.status, menu.index - 1) },
              { key: 'down', label: T.MOVE_DOWN, Icon: IconArrowDown, disabled: menu.index === statuses.length - 1, onSelect: () => onReorder(menu.status, menu.index + 1) },
              { key: 'delete', label: T.DELETE_STATUS, Icon: IconTrash, danger: true, separatorBefore: true, disabled: !isAdmin || Boolean(menu.status.builtin), onSelect: () => onStep('delete', menu.status) },
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

  if (state.step === 'delete') {
    const n = counts.get(state.statusId) ?? 0;
    const others = statuses.filter((s) => s.id !== state.statusId);
    const canDelete = !state.saving && (n === 0 || Boolean(state.moveTo));
    return (
      <Dialog title={T.deleteStatusTitle(status?.name ?? '')} variant="confirm" describedBy={`${idBase}-del`} onRequestClose={() => onStep('list')}>
        <p id={`${idBase}-del`} className="tdialog-sub tdialog-body">
          {T.deleteStatusBody(status?.name ?? '', n)}
        </p>
        {n > 0 && (
          <div className="field">
            <label htmlFor={`${idBase}-move`}>{T.MOVE_TO}</label>
            <select id={`${idBase}-move`} className="input sdialog-select" value={state.moveTo ?? ''} disabled={state.saving} onChange={(e) => onChange({ moveTo: e.target.value || null }, 'delete')}>
              <option value="">{T.CHOOSE}</option>
              {others.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" data-autofocus onClick={() => onStep('list')}>
            {T.CANCEL}
          </button>
          <button type="button" className={`btn btn-delete${canDelete ? '' : ' is-unavailable'}`} aria-disabled={canDelete ? undefined : 'true'} onClick={() => canDelete && onDelete()}>
            <IconTrash size={16} aria-hidden="true" />
            {state.saving ? T.DELETING : T.DELETE}
          </button>
        </div>
        {noteBlock}
      </Dialog>
    );
  }

  const check = checkStatusForm(state, statuses);
  const isAdd = state.step === 'add';
  const builtin = !isAdd && Boolean(status?.builtin);
  function submit(e) {
    e.preventDefault();
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
    <Dialog title={isAdd ? T.ADD_STATUS : T.EDIT_STATUS} size="detail" fullScreen={isPhone} onRequestClose={onRequestClose}>
      {builtin && <p className="tdialog-sub">{T.BUILTIN_NOTE}</p>}
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={`${idBase}-name`}>{T.NAME}</label>
          <input
            id={`${idBase}-name`}
            className="input"
            data-autofocus
            readOnly={state.saving}
            value={state.values.name}
            maxLength={80}
            aria-invalid={check.nameError ? true : undefined}
            onChange={(e) => onChange({ name: e.target.value })}
            onBlur={() => onTouch(['name'])}
          />
          {check.nameError && <Notice>{check.nameError}</Notice>}
        </div>
        <fieldset className="field cfieldset">
          <legend className="field-label">{T.KIND}</legend>
          {[['stage', T.KIND_STAGE], ['exit', T.KIND_EXIT]].map(([k, label]) => (
            <label key={k} className="sday-check cbox">
              <input type="radio" name={`${idBase}-kind`} checked={state.values.kind === k} disabled={state.saving || builtin} onChange={() => onChange({ kind: k })} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="field sdialog-fieldset">
          <legend id={`${idBase}-color`} className="field-label">
            {T.COLOR}
          </legend>
          <div className="sswatches" role="radiogroup" aria-labelledby={`${idBase}-color`}>
            {CLASS_COLORS.map((c) => {
              const on = state.values.color === c.key;
              return (
                <label key={c.key} className={`sswatch${on ? ' is-on' : ''}`} style={{ '--sw-fill': c.fill, '--sw-edge': c.edge }}>
                  <input type="radio" name={`${idBase}-color`} className="sswatch-input" checked={on} disabled={state.saving} aria-label={c.label} onChange={() => onChange({ color: c.key })} />
                  <span className="sswatch-dot" aria-hidden="true" />
                </label>
              );
            })}
          </div>
        </fieldset>
        {noteBlock}
        {isPhone ? (
          <div className="dialog-page-submit">{saveButton}</div>
        ) : (
          <div className="dialog-actions sdialog-actions">
            <button type="button" className="btn" onClick={() => onStep('list')}>
              <IconArrowLeft size={16} aria-hidden="true" />
              {T.STATUSES_TITLE}
            </button>
            <span className="sdialog-actions-right">{saveButton}</span>
          </div>
        )}
      </form>
    </Dialog>
  );
}
