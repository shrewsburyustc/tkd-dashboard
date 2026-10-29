// CamperRowMenu.jsx — the items of a camper's ⋯ menu on the camp page (contract §6.4).
// Why it exists: who may do what differs between staff and admins (v0.700), and the menu must
// show only what the person can do (Star v0.110). One function builds the list so the roster's ⋯
// (mouse) and Camper detail's "More" (touch, CP5) always agree.
// The order is Color Belt's (rulebook v1.011; for Camps v0.724, design review C8): three groups,
// with a line between two groups that both have items (never a line above the first item):
//   1. About the person — Edit details (always first), Change how they'll pay (ti-switch-horizontal,
//      while they still owe), Review possible duplicate (when flagged)
//   2. Money — admins only, when something is paid: Edit payment, Undo payment (asks first, v0.730)
//   3. Taking someone off — Withdraw (ti-user-minus, instant with Undo), then for admins Delete
//      permanently (red, asks first, always last)
//   Removed camper — Restore (ti-arrow-back-up, C16; staff and admins for an ordinary withdrawal,
//     a "Duplicate copy" only for admins — staff get the 5-second Undo right after Keep this one),
//     then for admins Delete permanently, after a line.
// No "Admin" heading (v1.012, C9): staff simply don't see the admin-only items; admins see them
// all in this same order. Items that don't apply are left out; the rest never move.
// While "Hide private details" is on (detailsHidden, rulebook v0.722 / design review C1): the
// money items — Change how they'll pay, Edit payment, Undo payment — are left out (as Color Belt
// v0.412), so the money group is empty and gets no line; Delete permanently stays for admins.
import { IconAlertTriangle, IconArrowBackUp, IconCashEdit, IconEdit, IconSwitchHorizontal, IconTrash, IconUserMinus } from '@tabler/icons-react';
import * as T from './text.js';

// h = { onPayingBy, onEdit, onReview, onWithdraw, onRestore, onEditPayment, onUndoPayment, onDelete }
// detailsHidden = Hide private details is on (no money items).
export function camperMenuItems(row, { isAdmin, busy, anchor, h, detailsHidden = false }) {
  const items = [];
  // A line (separatorBefore) starts each later group — but only if something is above it, so the
  // menu never begins with a line (copied from Color Belt's menu, EventPage.jsx).
  const groupStart = () => items.length > 0;
  if (row.status === 'active') {
    // 1. About the person
    items.push({ key: 'edit', label: T.EDIT_DETAILS, Icon: IconEdit, onSelect: () => h.onEdit(row, anchor) });
    if (!detailsHidden && (row.owesCents ?? 0) > 0) items.push({ key: 'paying', label: T.CHANGE_PAYING_BY, Icon: IconSwitchHorizontal, onSelect: () => h.onPayingBy(row, anchor) });
    if (row.duplicateState === 'possible') items.push({ key: 'review', label: T.REVIEW_DUPLICATE, Icon: IconAlertTriangle, onSelect: () => h.onReview(row, anchor) });
    // 2. Money — admins only, and only when there is a payment to fix
    if (isAdmin && !detailsHidden && (row.paidCents ?? 0) > 0 && row.lastPaymentId) {
      items.push({ key: 'editpay', label: T.EDIT_PAYMENT, Icon: IconCashEdit, separatorBefore: groupStart(), onSelect: () => h.onEditPayment(row, anchor) });
      items.push({ key: 'undopay', label: T.UNDO_PAYMENT, Icon: IconArrowBackUp, disabled: busy, onSelect: () => h.onUndoPayment(row, anchor) });
    }
    // 3. Taking someone off — Delete permanently always last
    items.push({ key: 'withdraw', label: T.WITHDRAW, Icon: IconUserMinus, separatorBefore: groupStart(), disabled: busy, onSelect: () => h.onWithdraw(row) });
    if (isAdmin) items.push({ key: 'delete', label: T.DELETE_PERMANENTLY, Icon: IconTrash, danger: true, disabled: busy, onSelect: () => h.onDelete(row, anchor) });
  } else {
    const canRestore = row.withdrawnReason !== 'duplicate_copy' || isAdmin;
    if (canRestore) items.push({ key: 'restore', label: T.RESTORE, Icon: IconArrowBackUp, disabled: busy, onSelect: () => h.onRestore(row) });
    if (isAdmin) items.push({ key: 'delete', label: T.DELETE_PERMANENTLY, Icon: IconTrash, danger: true, separatorBefore: groupStart(), disabled: busy, onSelect: () => h.onDelete(row, anchor) });
  }
  return items;
}
