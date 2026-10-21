// icons.js — every icon the Black Belt Candidates screens use, in one place.
// Why it exists: contract CONTRACT-0016-B2 §3.11 and open point OP-B3. The approved mockups drew
// ti-cash on Record payment and the Not paid card, but the rulebook's icon map (v0.303) now says
// ti-cash means CASH ONLY. Jeffrey chose OP-B3 option A (rulebook v0.914): payment actions use the
// banknote family like Color Belt (ti-cash-plus to record, ti-cash-edit to edit, as v0.409) and
// the Not paid card uses ti-circle-x. Only this file decides the icons.
// Tabler outline icons only (rulebook 2.3). The comment after each line is its map name.
import {
  IconAlertTriangle, // ti-alert-triangle — Late card, warnings
  IconArrowBackUp, // ti-arrow-back-up — Undo, Restore
  IconBan, // ti-ban — Mark check returned
  IconCashEdit, // ti-cash-edit — Edit payment (as Color Belt, v0.409)
  IconCashPlus, // ti-cash-plus — Record payment (OP-B3, v0.914)
  IconCheck, // ti-check — Save / done, Paid in full card
  IconCircleX, // ti-circle-x — Not paid card (OP-B3, v0.914)
  IconClock, // ti-clock — Paying on schedule card
  IconDots, // ti-dots — More actions (⋯)
  IconEdit, // ti-edit — Edit details
  IconPlus, // ti-plus — Add candidate
  IconPrinter, // ti-printer — Print receipt
  IconReceiptRefund, // ti-receipt-refund — Record refund
  IconSearch, // ti-search — Search candidates
  IconSwitchHorizontal, // ti-switch-horizontal — Change plan or Kukkiwon
  IconTrash, // ti-trash — Delete permanently
  IconUserMinus, // ti-user-minus — Remove candidate / Withdraw
  IconX, // ti-x — clear the search
} from '@tabler/icons-react';

export const ICONS = {
  add: IconPlus,
  recordPayment: IconCashPlus,
  editDetails: IconEdit,
  editPayment: IconCashEdit,
  changePlan: IconSwitchHorizontal,
  refund: IconReceiptRefund,
  returned: IconBan,
  undo: IconArrowBackUp,
  restore: IconArrowBackUp,
  print: IconPrinter,
  remove: IconUserMinus,
  withdraw: IconUserMinus,
  deleteForever: IconTrash,
  more: IconDots,
  search: IconSearch,
  clear: IconX,
  save: IconCheck,
  warn: IconAlertTriangle,
  cardPaidInFull: IconCheck,
  cardOnSchedule: IconClock,
  cardLate: IconAlertTriangle,
  cardNotPaid: IconCircleX,
};
