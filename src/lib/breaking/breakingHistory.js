// breakingHistory.js — turns a student's change log into the History list's plain words
// (Board breaking, migration 0051's brk_registration_history; a small copy of Camps' camperHistoryWords.js).
// Why it exists: the database gives the raw change-log rows, one per table row a save touched
// ({ occurredAt, actorName, tableName: 'brk_registrations' | 'brk_payments', op, batchId, action, before, after },
// camelCase from breakingApi). Staff need ONE line per SAVE in plain words: "Boards 4 → 3 Technical; Paid $12 by
// check". This file is plain JavaScript with no React, so Node checks can test every word.
//
//   groupHistory(rows)                  → one "batch" per save (rows sharing a batch id), newest first:
//                                         { key, occurredAt, actorName, rows }
//   describeBatch(batch, { hidden, classes }) → { text, at, who } · { hiddenPayment: true } (a save that was only
//                                         about money, while Hide private details is on) · null (nothing to say)
// An update row holds only the columns that CHANGED (before / after), so a line says what changed.
// classes (optional, [{ id, name }]) lets a class change name the classes ("Group D → Group A"); without it the
// line says "Class changed". While hidden, money parts (payments, refunds, Paying by, amounts, a price set by hand)
// are left out.
import { formatMoney } from '../money.js';
import { rankLabel } from './breakingRules.js';

const METHOD = { cash: 'cash', check: 'check', card: 'card' };
const WAY = { cash: 'Cash', check: 'Check', card: 'Card' };

const time = (value) => {
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
};

// The reader's rows → batches, newest first (a stable sort: rows of one moment keep the reader's order).
export function groupHistory(rows) {
  const batches = [];
  const byKey = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const key = row.batchId ?? `row-${index}`; // a row without a batch id is its own save
    let batch = byKey.get(key);
    if (!batch) {
      batch = { key, occurredAt: row.occurredAt, actorName: row.actorName, rows: [] };
      byKey.set(key, batch);
      batches.push(batch);
    }
    batch.rows.push(row);
    if (time(row.occurredAt) > time(batch.occurredAt)) batch.occurredAt = row.occurredAt;
  });
  return batches.sort((a, b) => time(b.occurredAt) - time(a.occurredAt));
}

// "Group D → Group A" (or just "Class changed" when the names aren't known).
function classChange(before, after, classes) {
  const name = (id) => (classes ?? []).find((c) => c.id === id)?.name ?? null;
  const a = name(before);
  const b = name(after);
  return a && b ? `Class ${a} → ${b}` : 'Class changed';
}

// What one registration update changed, as parts (money parts flagged).
function registrationParts(row, classes) {
  const before = row.before ?? {};
  const after = row.after ?? {};
  const has = (key) => Object.prototype.hasOwnProperty.call(after, key);
  const parts = [];
  if (has('firstName')) parts.push({ text: `First name: ${before.firstName ?? ''} → ${after.firstName}` });
  if (has('lastName')) parts.push({ text: `Last name: ${before.lastName ?? ''} → ${after.lastName}` });
  if (has('age')) parts.push({ text: `Age: ${before.age ?? ''} → ${after.age}` });
  if (has('rankName')) parts.push({ text: `Rank: ${rankLabel(before.rankName)} → ${rankLabel(after.rankName)}` });
  if (has('classId')) parts.push({ text: classChange(before.classId, after.classId, classes) });
  if (has('techBoards')) parts.push({ text: `Boards ${before.techBoards} → ${after.techBoards} Technical` });
  if (has('adultBoards')) parts.push({ text: `Boards ${before.adultBoards} → ${after.adultBoards} Adult` });
  if (has('payingBy')) parts.push({ text: `Paying by ${WAY[before.payingBy] ?? before.payingBy} → ${WAY[after.payingBy] ?? after.payingBy}`, money: true });
  if (has('amountCents')) parts.push({ text: `Amount ${formatMoney(before.amountCents)} → ${formatMoney(after.amountCents)}`, money: true });
  if (has('overrideCents')) {
    parts.push({ text: Number.isInteger(after.overrideCents) ? `Price set by hand ${formatMoney(after.overrideCents)}` : 'Price set by hand removed', money: true });
  }
  if (has('broke')) parts.push({ text: after.broke ? 'Marked broke' : 'Broke undone' });
  return parts;
}

// One payment row (an insert is a payment, a refund or a reversal; later edits of a payment row don't happen).
function paymentParts(row) {
  if (row.op !== 'insert') return [];
  const a = row.after ?? {};
  if (a.kind === 'payment') return [{ text: `Paid ${formatMoney(a.amountCents)} by ${METHOD[a.method] ?? a.method}`, money: true }];
  if (a.kind === 'refund') return [{ text: `Refund recorded: ${formatMoney(-a.amountCents)} ${METHOD[a.method] ?? a.method}`, money: true }];
  if (a.kind === 'reversal') {
    return [{ text: a.amountCents < 0 ? `Payment undone: ${formatMoney(-a.amountCents)}` : `Refund undone: ${formatMoney(a.amountCents)}`, money: true }];
  }
  return [];
}

export function describeBatch(batch, { hidden = false, classes = null } = {}) {
  const regRows = batch.rows.filter((r) => r.tableName === 'brk_registrations');
  const payRows = batch.rows.filter((r) => r.tableName === 'brk_payments');
  const parts = [];
  // The sign-up itself is one line; its columns are part of signing up, not changes.
  const created = regRows.find((r) => r.op === 'insert');
  if (created) parts.push({ text: created.after?.source === 'desk' ? 'Added at the desk' : 'Signed up on the family form' });
  for (const row of payRows) parts.push(...paymentParts(row));
  for (const row of regRows) if (row.op === 'update') parts.push(...registrationParts(row, classes));
  if (parts.length === 0) return null;
  const shown = hidden ? parts.filter((p) => !p.money) : parts;
  if (shown.length === 0) return { hiddenPayment: true };
  return { text: shown.map((p) => p.text).join('; '), at: batch.occurredAt, who: batch.actorName };
}
