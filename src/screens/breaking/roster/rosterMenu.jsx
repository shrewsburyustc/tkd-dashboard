// rosterMenu.jsx — the items of a student's ⋯ menu on the event page.
// Why it exists: who may do what differs between staff and admins (the database enforces it), and the menu must
// show only what the person can do (Star v0.110). One function builds the list for the mouse menu and the phone's
// bottom sheet. The order is the approved picture's (B-staff-roster, "rowmenu"):
//   1. About the student — Edit student · Move to class… · History
//   2. Money (not while Hide private details is on) — Undo payment (gray until a payment stands; staff can undo
//      only their own payment in its first 10 seconds, admins any) · for admins also Edit payment, Record refund
//      (while the student paid more than they owe) and Undo refund (while a refund stands). While a refund
//      stands, Undo payment and Edit payment stay in place but gray, "Undo the refund first." under their words.
//   3. Delete student — admins only, red, last, after a line.
// Edit payment, Record refund and Undo refund are admin-only ADDITIONS to the picture (Camps and Star have the
// same items; the database functions exist for them).
//
// build(row, { isAdmin, busy, hidden, h }) — h = { onEdit, onMove, onHistory, onUndoPayment, onEditPayment,
// onRecordRefund, onUndoRefund, onDelete }, each called with the row.
import { IconArrowBackUp, IconArrowRight, IconCashEdit, IconEdit, IconHistory, IconReceiptRefund, IconTrash } from '@tabler/icons-react';
import * as T from '../../../lib/breaking/text/roster.js';
import { canUndoPayment, overpaidCents, standingPayment, standingRefunds } from './rosterRules.js';

// A gray item's words with its reason under them (the shared .ev-menu-two look).
function grayedLabel(text, reason) {
  return (
    <span className="ev-menu-two">
      <span>{text}</span>
      <span className="ev-menu-reason">{reason}</span>
    </span>
  );
}

export function rosterMenuItems(row, { isAdmin, busy, hidden, h }) {
  const items = [
    { key: 'edit', label: T.EDIT_STUDENT, Icon: IconEdit, disabled: busy, onSelect: () => h.onEdit(row) },
    { key: 'move', label: T.MOVE_TO_CLASS, Icon: IconArrowRight, disabled: busy, onSelect: () => h.onMove(row) },
    { key: 'history', label: T.HISTORY, Icon: IconHistory, onSelect: () => h.onHistory(row) },
  ];
  if (!hidden) {
    const payment = standingPayment(row);
    const refunds = standingRefunds(row);
    const standing = refunds.length > 0;
    items.push({
      key: 'undopay',
      label: standing ? grayedLabel(T.UNDO_PAYMENT, T.UNDO_REFUND_FIRST) : T.UNDO_PAYMENT,
      Icon: IconArrowBackUp,
      disabled: busy || standing || !canUndoPayment(payment, isAdmin),
      onSelect: () => h.onUndoPayment(row),
    });
    if (isAdmin && payment) {
      items.push({
        key: 'editpay',
        label: standing ? grayedLabel(T.EDIT_PAYMENT, T.UNDO_REFUND_FIRST) : T.EDIT_PAYMENT,
        Icon: IconCashEdit,
        disabled: busy || standing,
        onSelect: () => h.onEditPayment(row),
      });
    }
    if (isAdmin && overpaidCents(row) > 0) items.push({ key: 'refund', label: T.RECORD_REFUND, Icon: IconReceiptRefund, disabled: busy, onSelect: () => h.onRecordRefund(row) });
    if (isAdmin && standing) items.push({ key: 'undorefund', label: T.UNDO_REFUND, Icon: IconArrowBackUp, disabled: busy, onSelect: () => h.onUndoRefund(row) });
  }
  if (isAdmin) items.push({ key: 'delete', label: T.DELETE_STUDENT, Icon: IconTrash, danger: true, separatorBefore: true, disabled: busy, onSelect: () => h.onDelete(row) });
  return items;
}
