// CamperRowMenu.jsx — the items of a camper's ⋯ menu on the camp page (contract §6.4).
// Why it exists: who may do what differs between staff and admins (v0.700), and the menu must
// show only what the person can do (Star v0.110). One function builds the list so the roster's ⋯
// (mouse) and Camper detail's "More" (touch, CP5) always agree.
// The order is Color Belt's (rulebook v1.011; for Camps v0.724, design review C8): three groups,
// with a line between two groups that both have items (never a line above the first item):
//   1. About the person — Edit details (always first), Change how they'll pay (ti-switch-horizontal,
//      while they still owe), Review possible duplicate (when flagged)
//   2. Money — admins, when something is paid: Edit payment, Undo payment (asks first, v0.730),
//      then the refund items (rulebook v0.743, Star's place): Record refund (ti-receipt-refund)
//      while the camper paid more than the total, and Undo refund (ti-arrow-back-up, asks first)
//      while a refund stands — after a partial refund both show, Record refund first (v0.744,
//      picture 22y, option A); then Print receipt (ti-printer, design review C3, rulebook v0.734),
//      LAST in the group, for staff and admins on an active camper with money paid that still
//      stands (a REMOVED camper's Print receipt comes first on its own row, below; v0.748). Staff, who see no other money item, get a money group holding only Print receipt (as
//      Star v0.518). While a refund stands, Edit payment and Undo payment stay in place but gray,
//      with "Undo the refund first." under their words (v0.743 (4), as Star's) — pressing them does
//      nothing (`grayed`: Camper detail's More draws them gray too).
//   3. Taking someone off — Withdraw (ti-user-minus, instant with Undo), then for admins Delete
//      permanently (red, asks first, always last)
//   Removed camper — Print receipt first (ti-printer; staff and admins, while money still stands and
//     Hide private details is off — rulebook v0.748, design review M-03), then after a line Restore
//     (ti-arrow-back-up, C16; staff and admins for an ordinary withdrawal, a "Duplicate copy" only for
//     admins — staff get the 5-second Undo right after Keep this one), then for admins Delete
//     permanently, after a line. A staff member on a duplicate copy that paid sees just Print receipt.
// No "Admin" heading (v1.012, C9): staff simply don't see the admin-only items; admins see them
// all in this same order. Items that don't apply are left out; the rest never move.
// While "Hide private details" is on (detailsHidden, rulebook v0.722 / design review C1): the
// money items — Change how they'll pay, Edit payment, Undo payment, Record refund / Undo refund,
// and Print receipt (v0.734, option A) — are left out (as Color Belt v0.412), so the money group
// is empty and gets no line; Delete permanently stays for admins.
import {
  IconAlertTriangle, IconArrowBackUp, IconCashEdit, IconEdit, IconPrinter, IconReceiptRefund, IconSwitchHorizontal, IconTrash, IconUserMinus,
} from '@tabler/icons-react';
import { canPrintReceipt } from '../../lib/camps/campReceipt.js';
import { refundMenuItems, refundStands } from '../../lib/camps/campRules.js';
import * as T from './text.js';

// A gray item's words with its reason under them (the shared .ev-menu-two look, as Camps' Fill in
// and Open sign-up items): "Edit payment" / "Undo the refund first."
function grayedLabel(text, reason) {
  return (
    <span className="ev-menu-two">
      <span>{text}</span>
      <span className="ev-menu-reason">{reason}</span>
    </span>
  );
}

// h = { onPayingBy, onEdit, onReview, onWithdraw, onRestore, onEditPayment, onUndoPayment,
//       onRecordRefund, onUndoRefund, onPrintReceipt, onDelete }
// Print receipt's onSelect takes the pressed button when there is one (Camper detail's "More"
// passes it, so focus goes back there when the receipt on top closes); else the ⋯ menu's anchor.
// detailsHidden = Hide private details is on (no money items).
// An item may carry `grayed: true` (a refund stands): it is also `disabled`, and Camper detail's
// More draws it gray with its reason (the menu grays every disabled item by itself).
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
    // 2. Money — Edit payment and Undo payment for admins when there is a payment to fix (or a
    //    refund standing on it), then the refund item, then Print receipt last, for staff and admins
    //    (v0.734). Only the group's first item gets the line.
    const moneyStart = items.length;
    const moneyLine = () => items.length === moneyStart && groupStart();
    const standing = refundStands(row);
    if (isAdmin && !detailsHidden && ((row.paidCents ?? 0) > 0 || standing) && row.lastPaymentId) {
      items.push({
        key: 'editpay',
        label: standing ? grayedLabel(T.EDIT_PAYMENT, T.UNDO_REFUND_FIRST) : T.EDIT_PAYMENT,
        Icon: IconCashEdit,
        separatorBefore: moneyLine(),
        disabled: standing,
        grayed: standing,
        onSelect: () => h.onEditPayment(row, anchor),
      });
      items.push({
        key: 'undopay',
        label: standing ? grayedLabel(T.UNDO_PAYMENT, T.UNDO_REFUND_FIRST) : T.UNDO_PAYMENT,
        Icon: IconArrowBackUp,
        disabled: busy || standing,
        grayed: standing,
        onSelect: () => h.onUndoPayment(row, anchor),
      });
      // Record refund while the camper paid more than the total (v0.743 (1)); Undo refund while a
      // refund stands (v0.743 (4)). After a partial refund both show, Record refund first, so the
      // rest goes back in one step (v0.744, Jeffrey chose A on picture 22y).
      // ti-receipt-refund = record a refund (Star's); ti-arrow-back-up = undo (Undo payment's icon)
      for (const refundItem of refundMenuItems(row)) {
        if (refundItem === 'record') items.push({ key: 'refund', label: T.RECORD_REFUND, Icon: IconReceiptRefund, disabled: busy, onSelect: () => h.onRecordRefund(row, anchor) });
        else items.push({ key: 'undorefund', label: T.UNDO_REFUND, Icon: IconArrowBackUp, disabled: busy, onSelect: () => h.onUndoRefund(row, anchor) });
      }
    }
    if (h.onPrintReceipt && canPrintReceipt(row, detailsHidden)) {
      // ti-printer = print
      items.push({ key: 'receipt', label: T.PRINT_RECEIPT, Icon: IconPrinter, separatorBefore: moneyLine(), onSelect: (opener) => h.onPrintReceipt(row, opener ?? anchor) });
    }
    // 3. Taking someone off — Delete permanently always last
    items.push({ key: 'withdraw', label: T.WITHDRAW, Icon: IconUserMinus, separatorBefore: groupStart(), disabled: busy, onSelect: () => h.onWithdraw(row) });
    if (isAdmin) items.push({ key: 'delete', label: T.DELETE_PERMANENTLY, Icon: IconTrash, danger: true, disabled: busy, onSelect: () => h.onDelete(row, anchor) });
  } else {
    // Print receipt first, in its own group (money before taking someone off, §8; M-03, v1.055 (b)):
    // for staff and admins, only while money still stands and Hide private details is off.
    if (h.onPrintReceipt && canPrintReceipt(row, detailsHidden)) {
      items.push({ key: 'receipt', label: T.PRINT_RECEIPT, Icon: IconPrinter, onSelect: (opener) => h.onPrintReceipt(row, opener ?? anchor) });
    }
    const canRestore = row.withdrawnReason !== 'duplicate_copy' || isAdmin;
    if (canRestore) items.push({ key: 'restore', label: T.RESTORE, Icon: IconArrowBackUp, separatorBefore: groupStart(), disabled: busy, onSelect: () => h.onRestore(row) });
    if (isAdmin) items.push({ key: 'delete', label: T.DELETE_PERMANENTLY, Icon: IconTrash, danger: true, separatorBefore: groupStart(), disabled: busy, onSelect: () => h.onDelete(row, anchor) });
  }
  return items;
}
