// TemplateRowMenu.jsx — the ⋯ menu of one template on the Templates tab (C2).
// Why it exists: the approved menu has exactly two items — Edit template (ti-edit: the same
// folded dialog as Add camp, without days; renaming happens here too) and, after a separator,
// Delete template (ti-trash, red, asks first). Deleting a template never changes the camps that
// were made from it. Kept in its own small file like CampRowMenu.jsx, so the list file only draws.
import { IconEdit, IconTrash } from '@tabler/icons-react';
import * as T from './text.js';

// template: the row · onEdit / onDelete: (template, anchor) => void · busy: a change is on its way
export function templateMenuItems(template, anchor, { onEdit, onDelete, busy }) {
  return [
    { key: 'edit', label: T.EDIT_TEMPLATE, Icon: IconEdit, disabled: busy, onSelect: () => onEdit(template, anchor) },
    { key: 'delete', label: T.DELETE_TEMPLATE, Icon: IconTrash, danger: true, separatorBefore: true, disabled: busy, onSelect: () => onDelete(template, anchor) },
  ];
}
