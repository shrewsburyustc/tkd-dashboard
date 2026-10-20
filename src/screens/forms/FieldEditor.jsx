// FieldEditor.jsx — the settings of the chosen field (right panel of the builder; mockup screens 3, 5).
// Why it exists: one place to change a field: its label, help text, Required, the options of a
// choice, "Show only if…", the waiver wording, a heading's text, a step's name. Changes go
// straight into the draft (the builder saves as you go). The four contact fields can only be
// relabelled (the lock); Book a class has its own settings below its label (BookingSettings).
import { IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import Notice from '../../components/Notice.jsx';
import { textProblem } from '../../lib/calendar/rules.js';
import { CHOICE_TYPES, HELP_MAX, LABEL_MAX, LOCKED_TYPES, MAX_OPTIONS, OPTION_MAX, WAIVER_MAX, longTextProblem } from '../../lib/forms/fields.js';
import { FieldIcon } from './FieldPalette.jsx';
import * as T from './text.js';

export default function FieldEditor({ field, fields, readOnly, idBase, onChange, onDelete, children }) {
  const id = `${idBase}-${field.id}`;
  const locked = LOCKED_TYPES.includes(field.type);
  const labelProblem = textProblem(field.label, LABEL_MAX);
  const index = fields.findIndex((f) => f.id === field.id);
  const earlier = fields.slice(0, index).filter((f) => ['choice', 'dropdown'].includes(f.type));
  const target = field.show_if ? fields.find((f) => f.id === field.show_if.field) : null;
  // The waiver is always shown — everyone who sends a form with a waiver signs it (F5 difference 8).
  const canShowIf = !locked && !['step', 'waiver'].includes(field.type);
  const canRequire = !locked && !['heading', 'step', 'booking', 'waiver'].includes(field.type);
  const options = field.options ?? [];
  const badOptions = CHOICE_TYPES.includes(field.type)
    && (options.some((o) => textProblem(o, OPTION_MAX) !== null) || new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length);

  const labelText = field.type === 'step' ? T.STEP_NAME : T.LABEL;
  return (
    <div className="fset">
      <h2 className="fset-title">
        <FieldIcon type={field.type} />
        {T.fieldTitle(field.type)}
      </h2>
      <div className="field">
        <label htmlFor={`${id}-label`}>{labelText}</label>
        <input
          id={`${id}-label`}
          className="input"
          value={field.label}
          maxLength={200}
          readOnly={readOnly}
          aria-invalid={labelProblem ? true : undefined}
          onChange={(e) => onChange({ label: e.target.value })}
        />
        {labelProblem && <Notice>{T.LABEL_PROBLEM[labelProblem]}</Notice>}
      </div>

      {!['step', 'children', 'waiver'].includes(field.type) && (
        <div className="field">
          <label htmlFor={`${id}-help`}>{field.type === 'heading' ? T.HEADING_TEXT : T.HELP}</label>
          <input id={`${id}-help`} className="input" value={field.help ?? ''} maxLength={HELP_MAX} readOnly={readOnly} onChange={(e) => onChange({ help: e.target.value || undefined })} />
        </div>
      )}

      {['parent_name', 'parent_phone', 'parent_email'].includes(field.type) && <p className="field-hint">{T.ALWAYS_REQUIRED}</p>}
      {field.type === 'children' && <p className="field-hint">{T.CHILDREN_HINT}</p>}
      {field.type === 'booking' && <p className="field-hint">{T.BOOKING_NEVER_REQUIRED}</p>}

      {canRequire && (
        <label className="ftoggle">
          <span>{T.REQUIRED}</span>
          <input type="checkbox" role="switch" checked={field.required === true} disabled={readOnly} onChange={(e) => onChange({ required: e.target.checked })} />
        </label>
      )}

      {CHOICE_TYPES.includes(field.type) && (
        <fieldset className="field cfieldset">
          <legend className="field-label">{T.OPTIONS}</legend>
          <ul className="foptions">
            {options.map((o, i) => (
              <li key={i} className="foption">
                <input
                  className="input"
                  aria-label={T.option(i + 1)}
                  value={o}
                  maxLength={OPTION_MAX + 20}
                  readOnly={readOnly}
                  onChange={(e) => onChange({ options: options.map((x, j) => (j === i ? e.target.value : x)) }, { renameOption: { from: o, to: e.target.value } })}
                />
                {options.length > 2 && (
                  <button type="button" className="icon-button" aria-label={T.removeOption(o)} disabled={readOnly} onClick={() => onChange({ options: options.filter((_, j) => j !== i) }, { removeOption: o })}>
                    <IconX size={16} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {options.length < MAX_OPTIONS && (
            <button type="button" className="btn btn-sm" disabled={readOnly} onClick={() => onChange({ options: [...options, T.option(options.length + 1)] })}>
              <IconPlus size={16} aria-hidden="true" />
              {T.ADD_OPTION}
            </button>
          )}
          {badOptions && <Notice>{T.OPTION_PROBLEM}</Notice>}
        </fieldset>
      )}

      {field.type === 'waiver' && (
        <div className="field">
          <label htmlFor={`${id}-text`}>{T.WAIVER_TEXT}</label>
          <textarea
            id={`${id}-text`}
            className="input ctextarea fwaiver-edit"
            rows={8}
            maxLength={WAIVER_MAX}
            readOnly={readOnly}
            value={field.text ?? ''}
            aria-describedby={`${id}-text-hint`}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <p id={`${id}-text-hint`} className="field-hint">
            {T.WAIVER_TEXT_HINT}
          </p>
          <p className="field-hint">{T.WAIVER_ALWAYS}</p>
          {!(field.text ?? '').trim() && <Notice>{T.WAIVER_EMPTY}</Notice>}
          {(field.text ?? '').trim() && longTextProblem(field.text, WAIVER_MAX) && <Notice>{T.THANK_YOU_BAD}</Notice>}
        </div>
      )}

      {canShowIf && (
        <>
          <label className="ftoggle">
            <span>{T.SHOW_IF}</span>
            <input
              type="checkbox"
              role="switch"
              checked={Boolean(field.show_if)}
              disabled={readOnly || (earlier.length === 0 && !field.show_if)}
              onChange={(e) => onChange({ show_if: e.target.checked ? { field: earlier[0].id, value: earlier[0].options[0] } : undefined })}
            />
          </label>
          {earlier.length === 0 && !field.show_if && <p className="field-hint">{T.NO_EARLIER_CHOICE}</p>}
          {field.show_if && (
            <>
              <div className="field">
                <label htmlFor={`${id}-si-q`}>{T.SHOW_IF_QUESTION}</label>
                <select
                  id={`${id}-si-q`}
                  className="input sdialog-select"
                  disabled={readOnly}
                  value={field.show_if.field}
                  onChange={(e) => {
                    const q = earlier.find((f) => f.id === e.target.value);
                    onChange({ show_if: { field: q.id, value: q.options[0] } });
                  }}
                >
                  {earlier.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${id}-si-a`}>{T.SHOW_IF_ANSWER}</label>
                <select id={`${id}-si-a`} className="input sdialog-select" disabled={readOnly} value={field.show_if.value} onChange={(e) => onChange({ show_if: { ...field.show_if, value: e.target.value } })}>
                  {(target?.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </>
      )}

      {children}

      {!locked && (
        <button type="button" className="btn sdialog-remove fset-delete" disabled={readOnly} onClick={onDelete}>
          <IconTrash size={16} aria-hidden="true" />
          {T.DELETE_THIS_FIELD}
        </button>
      )}
    </div>
  );
}
