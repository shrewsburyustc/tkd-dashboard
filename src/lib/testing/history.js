// history.js — Color Belt's words for the History line (design review CB7, rulebook v1.010 / v1.108,
// Color Belt v0.418 Q4 and v0.421, mockup P3; modelled on Star's candidates/CandidateHistory.jsx).
// Why it exists: both summaries (the event student's and the private testing's) end with the shared
// History line (components/HistoryLine.jsx). That part draws the line and the list; each section
// gives it two things:
//   load()                  the change-log rows (eventsApi.loadRegistrationHistory /
//                           privateApi.loadPrivateHistory; migration 0030's readers), and
//   describe(row, {hidden}) the words for ONE row: { text, at, who } · { hiddenPayment: true } (a
//                           money change while Hide private details is on) · null (nothing to show).
// This file is that describe, plus combineHistoryRows (below), for both kinds of record.
//
// What a change-log row looks like (0030 §5): { occurred_at, actor_name, action, table_name, op,
// before, after }. before / after hold the row's columns (for an update only the ones that changed),
// with login ids already taken out by the database and a signature only ever "on file". The rows
// come from six tables:
//   event registration: testing_registrations, testing_payments, testing_results
//   private testing:    testing_private, testing_private_payments, testing_private_results
// `action` is the database function's name for what it did (tkd.action, migrations 0005, 0010, 0014,
// 0030): public_register, add_student, update_student, change_paying_by, mark_paid, undo_payment,
// edit_payment, resolve_duplicate, withdraw_student, restore_student, purge_old_signatures,
// set_result, set_result_note, clear_result, move_to_private, undo_move_to_private, private_add,
// private_update, private_change_day, private_change_paying_by, private_mark_paid,
// private_undo_payment, private_edit_payment, private_cancel, private_restore,
// private_set_result, private_set_result_note, delete_student, private_delete (and 'manual' for a
// change made in the SQL Editor).
// Most words come from WHAT changed (before / after); the action only tells apart changes that look
// the same — a reversal from Undo payment, from Edit payment or from a move.
//
// The rules (P3, as Star's v0.518):
//   - one entry per change: an update that only moved the row's version (Mark paid touches the
//     registration too) says nothing; an edit of several details is ONE entry, joined with "; ";
//     Edit payment (a reversal + a new payment in one save) is ONE entry, "Payment changed: …";
//     a move or its Undo is ONE entry too — the payments that move with it say nothing of their own;
//     a payment save that also changed Paying by is ONE entry, money first (pass 2 M-02, v1.055 (a));
//   - money rows (payments, undos, edits, Paying by, a private price) are left out while Hide
//     private details is on — the shared line then says "Payment history is hidden on this tablet.";
//     "Registered on the family form" / "Added at the desk" stay (Star's Q4 A);
//   - a moved private testing starts at the move, which names the event (v0.418 Q4: the reader
//     only gives its own rows).
// It is PURE (no React, no database), so src/lib/testing/checks.mjs can check every action.
import {
  HISTORY_STAFF,
  HISTORY_REGISTERED_FORM,
  HISTORY_ADDED_DESK,
  historyAddedPrivate,
  historyMovedIn,
  historyDayTime,
  HISTORY_MOVED_OUT,
  HISTORY_MOVE_UNDONE,
  historyPaymentRecorded,
  historyPaymentUndone,
  historyPaymentChanged,
  HISTORY_PAYMENT_CHANGED,
  historyPaidOn,
  historyPaymentMovedOut,
  historyPaymentMovedIn,
  historyPaymentMovedBack,
  historyPayingBy,
  historyField,
  FIRST_NAME,
  LAST_NAME,
  HISTORY_BELT,
  HISTORY_CLASS,
  HISTORY_PRICE,
  historyDayChanged,
  HISTORY_CANCELLED,
  HISTORY_RESTORED,
  HISTORY_WITHDRAWN,
  HISTORY_DUPLICATE_COPY,
  HISTORY_DUPLICATE_FOUND,
  HISTORY_KEPT_BOTH,
  HISTORY_KEPT_THIS,
  HISTORY_SIGNATURE_DELETED,
  HISTORY_DELETED,
  historyResult,
  historyResultChanged,
  historyResultCleared,
  historyNote,
  HISTORY_NOTE_REMOVED,
  payingByLower,
  weekdayMonthDay,
  timeLabel,
} from '../../screens/testing/text.js';
import { formatMoney } from '../money.js';

// The tables, by what they hold.
const RECORD_TABLES = new Set(['testing_registrations', 'testing_private']);
const PAYMENT_TABLES = new Set(['testing_payments', 'testing_private_payments']);
const RESULT_TABLES = new Set(['testing_results', 'testing_private_results']);
// The actions whose rows are part of a move between the event and a private testing.
const MOVE = 'move_to_private';
const UNDO_MOVE = 'undo_move_to_private';
const EDIT_ACTIONS = new Set(['edit_payment', 'private_edit_payment']);

const has = (obj, key) => obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);

// ----- Edit payment: one entry, not two -----
// Edit payment saves a reversal of the old payment and a new payment in the same moment (one
// database transaction). The History shows that as ONE entry, "Payment changed: check → cash",
// so before describe() runs, each edit's reversal row is joined to its new payment row:
// the payment row gets `editedFrom` (the reversal's values: the old amount, way and day) and the
// reversal row is left out. Pairs are found by table + action and the nearest time (the same
// transaction has the same time in the database; the preview's can differ by a few milliseconds).
// rows: the reader's rows (any order) → a new list (same order, edit reversals and the payment rows
// of a move removed — see foldMovePayments below).
export function combineHistoryRows(list) {
  if (!Array.isArray(list)) return [];
  const rows = fillPrivateDays(list);
  const isEdit = (r) => PAYMENT_TABLES.has(r?.table_name) && r.op === 'insert' && EDIT_ACTIONS.has(r.action);
  const reversals = rows.filter((r) => isEdit(r) && r.after?.kind === 'reversal');
  const used = new Set();
  const out = [];
  for (const row of rows) {
    if (isEdit(row) && row.after?.kind === 'reversal') continue; // joined to its payment below (or dropped)
    if (!(isEdit(row) && row.after?.kind === 'payment')) {
      out.push(row);
      continue;
    }
    const at = Date.parse(row.occurred_at);
    let best = null;
    for (const r of reversals) {
      if (used.has(r) || r.table_name !== row.table_name || r.action !== row.action) continue;
      const gap = Math.abs(Date.parse(r.occurred_at) - at);
      if (gap <= 5000 && (best === null || gap < best.gap)) best = { r, gap };
    }
    if (best) used.add(best.r);
    out.push(best ? { ...row, editedFrom: editedFromOf(rows, best.r) } : row);
  }
  // A reversal of an edit whose new payment isn't in the list (the 500-row limit cut it off) still
  // says that the payment changed.
  for (const r of reversals) if (!used.has(r)) out.push({ ...r, editLeftover: true });
  return foldPayingBy(foldMovePayments(out));
}

// ----- A payment that also changed Paying by: one entry, not two (pass 2 M-02, v1.055 (a)) -----
// Mark paid, Undo payment or Edit payment by another way changes Paying by too (v0.418 / v0.419),
// in the same save (one database transaction). Its two rows, the payment row and the record's own
// update ("Paying by changed: …"), are ONE entry, money first: "Payment recorded: $20 cash, paid
// Nov 5; Paying by changed: Card → Cash", as Camps does (v0.736: one save that changes several
// things is one entry). Pairs are the record's table with its payment table, the same action and
// the nearest time within 5 seconds (the database gives both rows the same time; the preview's can
// differ by a few milliseconds). The payment row gets `payingByChange` ({ from, to }) and the
// record's row `payingByJoined`, so it no longer says it. Without the payment row (the 500-row
// limit), or for ⋯ Change how they'll pay (no payment in that save), Paying by keeps its own entry.
const PAYMENT_TABLE_OF = { testing_registrations: 'testing_payments', testing_private: 'testing_private_payments' };
const PAY_ACTIONS = new Set(['mark_paid', 'undo_payment', 'edit_payment', 'private_mark_paid', 'private_undo_payment', 'private_edit_payment']);
function foldPayingBy(rows) {
  const isChange = (r) => RECORD_TABLES.has(r?.table_name) && r.op === 'update' && PAY_ACTIONS.has(r.action)
    && has(r.after, 'paying_by') && Boolean(r.before?.paying_by) && Boolean(r.after?.paying_by)
    && r.before.paying_by !== r.after.paying_by;
  const changes = rows.filter(isChange);
  if (changes.length === 0) return rows;
  const joinedTo = new Map(); // payment row → { from, to }
  const absorbed = new Set(); // record rows whose Paying by part moved to their payment row
  for (const change of changes) {
    const at = Date.parse(change.occurred_at);
    let best = null;
    for (const r of rows) {
      if (joinedTo.has(r) || r.table_name !== PAYMENT_TABLE_OF[change.table_name] || r.op !== 'insert' || r.action !== change.action) continue;
      // The way to pay must match too, so a Paying by change whose own payment row was cut off (the
      // 500-row limit) never joins another save's payment: Mark paid / Edit payment record the new
      // way (Paying by after); Undo payment's reversal undoes the old one (Paying by before).
      const wantMethod = r.after?.kind === 'reversal' ? change.before.paying_by : change.after.paying_by;
      if (r.after?.method !== wantMethod) continue;
      const gap = Math.abs(Date.parse(r.occurred_at) - at);
      if (gap <= 5000 && (best === null || gap < best.gap)) best = { r, gap };
    }
    if (!best) continue;
    joinedTo.set(best.r, { from: change.before.paying_by, to: change.after.paying_by });
    absorbed.add(change);
  }
  return rows.map((r) => {
    if (joinedTo.has(r)) return { ...r, payingByChange: joinedTo.get(r) };
    if (absorbed.has(r)) return { ...r, payingByJoined: true };
    return r;
  });
}

// ----- A move: one entry, not one per payment -----
// Move to private testing (and its Undo) saves the record's own row plus one row per payment that
// moves with it (the event side's reversals, the private side's new payments; on Undo the event's
// payments coming back). P3 draws a move as ONE entry — "Moved to private testing from … (…)" on
// the private side, "Moved to private testing" on the event side — so each move / undo-move payment
// row is left out when the record's own row of the same action is in the list (same transaction:
// within 5 seconds). Without that row (the 500-row limit) the payment row keeps its own words.
// The move's other rows (a cleared No show is its own 'clear_result' row) are not touched.
const MOVE_ACTIONS = new Set([MOVE, UNDO_MOVE]);
function foldMovePayments(rows) {
  const anchors = rows.filter((r) => RECORD_TABLES.has(r?.table_name) && MOVE_ACTIONS.has(r.action));
  if (anchors.length === 0) return rows;
  const folded = (r) => PAYMENT_TABLES.has(r?.table_name) && MOVE_ACTIONS.has(r.action)
    && anchors.some((a) => a.action === r.action && Math.abs(Date.parse(a.occurred_at) - Date.parse(r.occurred_at)) <= 5000);
  return rows.filter((r) => !folded(r));
}

// A private testing's day or time: an update row holds only what changed (a new time alone has no
// date), but P3's words name both sides in full ("Tue, Dec 1, 4:00 PM → Tue, Dec 1, 4:30 PM"). So
// the rows are walked oldest first (the reader gives newest first, so backwards), starting from the
// insert row's day and time, and each day / time update gets `dayBefore` and `dayAfter` — both
// { private_date, private_time }. Without the insert row (the 500-row limit) the update keeps only
// its own values, and describe() shows what it has.
function fillPrivateDays(rows) {
  let known = null; // { private_date, private_time } as of the row being walked
  const filled = new Map();
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const r = rows[i];
    if (r?.table_name !== 'testing_private') continue;
    if (r.op === 'insert') {
      known = { private_date: r.after?.private_date ?? null, private_time: r.after?.private_time ?? null };
    } else if (r.op === 'update' && known && (has(r.after, 'private_date') || has(r.after, 'private_time'))) {
      const next = {
        private_date: has(r.after, 'private_date') ? r.after.private_date : known.private_date,
        private_time: has(r.after, 'private_time') ? r.after.private_time : known.private_time,
      };
      filled.set(r, { dayBefore: known, dayAfter: next });
      known = next;
    }
  }
  return filled.size === 0 ? rows : rows.map((r) => (filled.has(r) ? { ...r, ...filled.get(r) } : r));
}

// What the edited payment was: its own insert row when it is in the list (the reversal points at it
// with reverses_payment_id) — amount, way and day — otherwise the reversal's amount and way (a
// reversal is dated the day it was made, so it can't tell the old payment's day).
function editedFromOf(rows, reversal) {
  const oldId = reversal.after?.reverses_payment_id ?? null;
  const original = oldId
    ? rows.find((r) => r.table_name === reversal.table_name && r.op === 'insert' && r.after?.id === oldId)?.after
    : null;
  if (original) return { amount_cents: original.amount_cents, method: original.method, paid_on: original.paid_on };
  return { amount_cents: Math.abs(reversal.after?.amount_cents ?? 0), method: reversal.after?.method };
}

// ----- The words for each kind of row -----
// Each returns a list of parts: { text, money } — money parts are left out while hidden.

const money = (text) => ({ text, money: true });
const plain = (text) => ({ text, money: false });

// "Tue, Dec 1, 4:00 PM" from a private testing's private_date + private_time ('16:00:00').
const dayTimeOf = (values) => historyDayTime(values?.private_date ?? '', values?.private_time ?? '');

// "$65 check, paid Nov 1" → only the parts that differ: "check → cash", "$65 → $50",
// "paid Oct 30 → paid Oct 31" (P3 drew "Payment changed: check → cash").
function paymentChange(old, now) {
  if (!old) return HISTORY_PAYMENT_CHANGED;
  const from = [];
  const to = [];
  const oldCents = Math.abs(old.amount_cents ?? 0);
  if (oldCents !== now.amount_cents) {
    from.push(formatMoney(oldCents));
    to.push(formatMoney(now.amount_cents));
  }
  if (old.method !== now.method) {
    from.push(payingByLower(old.method));
    to.push(payingByLower(now.method));
  }
  // The day only when the old payment's own row told it (editedFromOf).
  if (has(old, 'paid_on') && old.paid_on !== now.paid_on) {
    from.push(historyPaidOn(old.paid_on));
    to.push(historyPaidOn(now.paid_on));
  }
  if (from.length === 0) return HISTORY_PAYMENT_CHANGED;
  // "$65 check" then ", paid Nov 1" — the same shape as "Payment recorded: $65 check, paid Nov 1"
  const join = (list) => list.join(' ').replace(/ (paid )/, ', $1');
  return historyPaymentChanged(join(from), join(to));
}

// A payment row (event or private). Every part is about money. A Paying by change of the same save
// follows the payment's own words (foldPayingBy, M-02).
function paymentParts(row) {
  const parts = paymentMoneyParts(row);
  if (row.payingByChange) parts.push(money(historyPayingBy(row.payingByChange.from, row.payingByChange.to)));
  return parts;
}
function paymentMoneyParts(row) {
  if (row.op !== 'insert') return [money(HISTORY_PAYMENT_CHANGED)]; // payments are append-only; never expected
  const a = row.after ?? {};
  const cents = Math.abs(a.amount_cents ?? 0);
  if (row.editLeftover) return [money(HISTORY_PAYMENT_CHANGED)];
  if (a.kind === 'reversal') {
    if (row.action === MOVE) return [money(historyPaymentMovedOut(cents, a.method))];
    return [money(historyPaymentUndone(cents))];
  }
  if (EDIT_ACTIONS.has(row.action)) return [money(paymentChange(row.editedFrom ?? null, a))];
  if (row.action === MOVE || a.moved_from_payment_id) return [money(historyPaymentMovedIn(cents, a.method, a.paid_on))];
  if (row.action === UNDO_MOVE) return [money(historyPaymentMovedBack(cents, a.method, a.paid_on))];
  return [money(historyPaymentRecorded(cents, a.method, a.paid_on))];
}

// A result row (event or private): the result and the grading note.
function resultParts(row) {
  const before = row.before ?? {};
  const after = row.after ?? {};
  if (row.op === 'delete') {
    const parts = [];
    if (before.result) parts.push(plain(historyResultCleared(before.result)));
    if (before.note) parts.push(plain(HISTORY_NOTE_REMOVED));
    return parts.length > 0 ? parts : [plain(historyResultCleared(null))];
  }
  const parts = [];
  if (has(after, 'result')) {
    if (after.result === null) {
      if (row.op === 'update') parts.push(plain(historyResultCleared(before.result ?? null)));
    } else if (row.op === 'update' && before.result) {
      parts.push(plain(historyResultChanged(before.result, after.result)));
    } else {
      parts.push(plain(historyResult(after.result)));
    }
  }
  if (has(after, 'note')) {
    if (after.note === null) {
      if (row.op === 'update') parts.push(plain(HISTORY_NOTE_REMOVED));
    } else {
      parts.push(plain(historyNote(after.note)));
    }
  }
  return parts;
}

// The record itself (an event registration or a private testing).
// ctx.rankName(eventRankId) names an event registration's belt (the event's copy of the rank).
function recordParts(row, ctx) {
  const before = row.before ?? {};
  const after = row.after ?? {};
  const isPrivate = row.table_name === 'testing_private';
  if (row.op === 'insert') {
    let first;
    if (isPrivate) {
      // A moved private testing starts at the move, naming the event (v0.418 Q4, P3).
      first = after.moved_from_event_name ? historyMovedIn(after.moved_from_event_name, dayTimeOf(after)) : historyAddedPrivate(dayTimeOf(after));
    } else {
      first = after.source === 'form' ? HISTORY_REGISTERED_FORM : HISTORY_ADDED_DESK;
    }
    const parts = [plain(first)];
    if (after.duplicate_state === 'possible') parts.push(plain(HISTORY_DUPLICATE_FOUND));
    return parts;
  }
  if (row.op === 'delete') return [plain(HISTORY_DELETED)];

  const parts = [];
  // Status first: removed, restored, moved, cancelled.
  if (has(after, 'status')) {
    if (isPrivate) {
      if (after.status === 'cancelled') parts.push(plain(HISTORY_CANCELLED));
      else if (before.status === 'cancelled') parts.push(plain(HISTORY_RESTORED));
    } else if (after.status === 'withdrawn') {
      if (row.action === MOVE) parts.push(plain(HISTORY_MOVED_OUT));
      else if (after.withdrawn_reason === 'duplicate_copy') parts.push(plain(HISTORY_DUPLICATE_COPY));
      else parts.push(plain(HISTORY_WITHDRAWN));
    } else if (before.status === 'withdrawn') {
      parts.push(plain(row.action === UNDO_MOVE ? HISTORY_MOVE_UNDONE : HISTORY_RESTORED));
    }
  }
  // The duplicate check (event registrations).
  if (has(after, 'duplicate_state')) {
    if (after.duplicate_state === 'kept_both') parts.push(plain(HISTORY_KEPT_BOTH));
    else if (after.duplicate_state === 'possible') parts.push(plain(HISTORY_DUPLICATE_FOUND));
    // possible → none on a registration that stays active: this one was kept. (A move or a
    // withdraw also clears it; that is already said by the status part.)
    else if (before.duplicate_state === 'possible' && !has(after, 'status') && row.action === 'resolve_duplicate') parts.push(plain(HISTORY_KEPT_THIS));
  }
  // Names.
  if (has(after, 'first_name')) parts.push(plain(historyField(FIRST_NAME, before.first_name, after.first_name)));
  if (has(after, 'last_name')) parts.push(plain(historyField(LAST_NAME, before.last_name, after.last_name)));
  // The belt (and with it the class and what they test for).
  if (has(after, 'event_rank_id')) {
    const name = (id) => ctx?.rankName?.(id) ?? '';
    const from = name(before.event_rank_id);
    const to = name(after.event_rank_id);
    parts.push(plain(from || to ? historyField(HISTORY_BELT, from, to) : `${HISTORY_BELT} changed`));
  }
  if (has(after, 'rank_name')) parts.push(plain(historyField(HISTORY_BELT, before.rank_name, after.rank_name)));
  if (has(after, 'class_name')) parts.push(plain(historyField(HISTORY_CLASS, before.class_name, after.class_name)));
  if (has(after, 'private_cents')) {
    parts.push(money(historyField(HISTORY_PRICE, formatMoney(before.private_cents ?? 0), formatMoney(after.private_cents ?? 0))));
  }
  // A private testing's day or time.
  if (has(after, 'private_date') || has(after, 'private_time')) {
    // Both sides in full when combineHistoryRows could work them out (dayBefore / dayAfter);
    // otherwise only what the row itself holds: "Tue, Dec 1 → Thu, Dec 3" or "4:00 PM → 4:30 PM".
    let from;
    let to;
    if (row.dayBefore && row.dayAfter) {
      from = dayTimeOf(row.dayBefore);
      to = dayTimeOf(row.dayAfter);
    } else {
      const side = (values) => [
        has(after, 'private_date') ? weekdayMonthDay(values.private_date ?? '') : null,
        has(after, 'private_time') ? timeLabel(values.private_time ?? '') : null,
      ].filter((x) => x !== null).join(', ');
      from = side(before);
      to = side(after);
    }
    parts.push(plain(historyDayChanged(from, to)));
  }
  // How they'll pay (P3: Mark paid or Edit payment by another way changes it too, v0.418 / v0.419).
  // When it was part of a payment's save, the payment's entry says it (foldPayingBy, M-02).
  if (has(after, 'paying_by') && before.paying_by && after.paying_by && !row.payingByJoined) {
    parts.push(money(historyPayingBy(before.paying_by, after.paying_by)));
  }
  // The 90-day signature clean-up.
  if (has(after, 'signature') && after.signature === null && before.signature) parts.push(plain(HISTORY_SIGNATURE_DELETED));
  // Anything else (version, updated_at, *_by_name, withdrawn_at …) says nothing on its own.
  return parts;
}

// The parts of one row, by its table. Unknown tables say nothing.
function partsOf(row, ctx) {
  if (!row || typeof row !== 'object') return [];
  if (PAYMENT_TABLES.has(row.table_name)) return paymentParts(row);
  if (RESULT_TABLES.has(row.table_name)) return resultParts(row);
  if (RECORD_TABLES.has(row.table_name)) return recordParts(row, ctx);
  return [];
}

// The shared line's describe for one row: { text, at, who }, { hiddenPayment: true } (only money
// while Hide private details is on), or null (nothing to show).
//   ctx: { hidden, rankName } — hidden comes from HistoryLine; rankName from the event page.
export function describeHistoryRow(row, ctx = {}) {
  const parts = partsOf(row, ctx);
  if (parts.length === 0) return null;
  const shown = ctx.hidden ? parts.filter((p) => !p.money) : parts;
  if (shown.length === 0) return { hiddenPayment: true };
  return { text: shown.map((p) => p.text).join('; '), at: row.occurred_at, who: row.actor_name || HISTORY_STAFF };
}

// The History line's load(): calls the reader (eventsApi.loadRegistrationHistory or
// privateApi.loadPrivateHistory, which never throw) and THROWS unless the answer is ok, so a failed
// read shows the shared amber bar with Retry — never "History · no changes yet" (v1.108 (b)).
// no_access also takes the house path (onNoAccess: the lock screen), as every other read does.
// → the rows, with each Edit payment's two rows joined (combineHistoryRows).
export function historyReader(readFn, id, onNoAccess = null) {
  return async () => {
    const answer = await readFn(id);
    if (answer?.status === 'ok') return combineHistoryRows(answer.rows);
    if (answer?.status === 'no_access') onNoAccess?.();
    throw new Error(`Color Belt history: ${answer?.status ?? 'no answer'}`);
  };
}

// A describe for HistoryLine that also knows the event's rank names (event registrations).
// rankName: (eventRankId) => 'Yellow' | ''.
export const historyDescriber = (rankName = null) => (row, { hidden } = {}) => describeHistoryRow(row, { hidden, rankName });
