// FieldPalette.jsx — the field types on the left of the builder (mockup screen 3), and their icons.
// Why it exists: click a type to add it to the form — after the chosen field, or at the end.
// (The mockup also shows dragging a type into the form; adding by click covers it on every
// device, and the added field can then be dragged into place by its grip.)
// Book a class and Waiver can be on a form once; they are dimmed when already there.
import {
  Icon123,
  IconAlignLeft,
  IconCalendar,
  IconCheckbox,
  IconCircleDot,
  IconCursorText,
  IconHeading,
  IconMail,
  IconPhone,
  IconSelector,
  IconSeparatorHorizontal,
  IconSignature,
  IconUser,
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react';
import { PALETTE } from '../../lib/forms/fields.js';
import * as T from './text.js';

const ICONS = {
  short_text: IconCursorText, long_text: IconAlignLeft, phone: IconPhone, email: IconMail, number: Icon123, date: IconCalendar,
  choice: IconCircleDot, checkboxes: IconCheckbox, dropdown: IconSelector, booking: IconUserPlus, waiver: IconSignature,
  heading: IconHeading, step: IconSeparatorHorizontal,
  parent_name: IconUser, parent_phone: IconPhone, parent_email: IconMail, children: IconUsers,
};

export function FieldIcon({ type, size = 16 }) {
  const Icon = ICONS[type] ?? IconCursorText;
  return <Icon size={size} aria-hidden="true" />;
}

// Is this type unavailable right now? → the reason text, or null.
export function addBlocked(type, fields) {
  if (fields.length >= 60) return T.TOO_MANY;
  if (['booking', 'waiver'].includes(type) && fields.some((f) => f.type === type)) return T.ONLY_ONE[type];
  return null;
}

export default function FieldPalette({ fields, disabled, onAdd }) {
  return (
    <nav className="fpal" aria-label={T.ADD_FIELD}>
      {PALETTE.map((g) => (
        <div key={g.group} className="fpal-group">
          <h3 className="fpal-head">{T.PALETTE_GROUPS[g.group]}</h3>
          {g.types.map((type) => {
            const blocked = addBlocked(type, fields);
            return (
              <button
                key={type}
                type="button"
                className="fpal-item"
                aria-label={T.addType(type)}
                aria-disabled={blocked || disabled ? 'true' : undefined}
                title={blocked ?? undefined}
                onClick={() => !blocked && !disabled && onAdd(type)}
              >
                <FieldIcon type={type} />
                {T.TYPE_LABEL[type]}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
