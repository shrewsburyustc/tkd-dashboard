// CamperRowMenu.jsx — the items of a camper's ⋯ menu on the camp page (contract §6.4).
// Why it exists: who may do what differs between staff and admins (v0.700), and the menu must
// show only what the person can do (Star v0.110). One function builds the list so the roster's ⋯
// (mouse) and Camper detail's "More" (touch, CP5) always agree:
//   Active camper — staff and admins: Change how they'll pay (while they still owe), Edit details,
//     Review possible duplicate (when flagged), Withdraw (ti-user-minus, instant with Undo)
//     — admins only, under "Admin": Edit payment, Undo payment (when something is paid),
//     Delete permanently (red, asks first)
//   Removed camper — Restore (staff and admins for an ordinary withdrawal; a "Duplicate copy"
//     only for admins — staff get the 5-second Undo right after Keep this one), and for admins
//     Delete permanently
import { IconAlertTriangle, IconArrowBackUp, IconCashEdit, IconEdit, IconTrash, IconUserMinus } from '@tabler/icons-react';
import { NoIcon } from './CampRowMenu.jsx';
import * as T from './text.js';

// The gray "Admin" heading inside the menu (not a choice: unavailable, so nothing happens on it).
const adminHeading = (separatorBefore) => ({
  key: 'admin-heading',
  label: <span className="cp-menu-heading">{T.ADMIN_GROUP}</span>,
  Icon: NoIcon,
  disabled: true,
  separatorBefore,
  onSelect: () => {},
});

// h = { onPayingBy, onEdit, onReview, onWithdraw, onRestore, onEditPayment, onUndoPayment, onDelete }
export function camperMenuItems(row, { isAdmin, busy, anchor, h }) {
  const items = [];
  if (row.status === 'active') {
    if ((row.owesCents ?? 0) > 0) items.push({ key: 'paying', label: T.CHANGE_PAYING_BY, Icon: NoIcon, onSelect: () => h.onPayingBy(row, anchor) });
    items.push({ key: 'edit', label: T.EDIT_DETAILS, Icon: IconEdit, onSelect: () => h.onEdit(row, anchor) });
    if (row.duplicateState === 'possible') items.push({ key: 'review', label: T.REVIEW, Icon: IconAlertTriangle, onSelect: () => h.onReview(row, anchor) });
    items.push({ key: 'withdraw', label: T.WITHDRAW, Icon: IconUserMinus, disabled: busy, onSelect: () => h.onWithdraw(row) });
    if (isAdmin) {
      items.push(adminHeading(true));
      if ((row.paidCents ?? 0) > 0 && row.lastPaymentId) {
        items.push({ key: 'editpay', label: T.EDIT_PAYMENT, Icon: IconCashEdit, onSelect: () => h.onEditPayment(row, anchor) });
        items.push({ key: 'undopay', label: T.UNDO_PAYMENT, Icon: IconArrowBackUp, disabled: busy, onSelect: () => h.onUndoPayment(row) });
      }
      items.push({ key: 'delete', label: T.DELETE_PERMANENTLY, Icon: IconTrash, danger: true, disabled: busy, onSelect: () => h.onDelete(row, anchor) });
    }
  } else {
    const canRestore = row.withdrawnReason !== 'duplicate_copy' || isAdmin;
    if (canRestore) items.push({ key: 'restore', label: T.RESTORE, Icon: NoIcon, disabled: busy, onSelect: () => h.onRestore(row) });
    if (isAdmin) items.push({ key: 'delete', label: T.DELETE_PERMANENTLY, Icon: IconTrash, danger: true, separatorBefore: items.length > 0, disabled: busy, onSelect: () => h.onDelete(row, anchor) });
  }
  return items;
}

