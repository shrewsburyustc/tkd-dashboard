// camperHistoryWords.js — turns a camper's change log into the History list's plain words
// (design review C7, rulebook v0.736; Star's style, v0.518: "what: before → after").
// Why it exists: camp_camper_history (migration 0033) gives the raw change-log rows — one row per
// table row a save touched. Staff need one line per SAVE in plain words: "Days: Wed, Nov 25 → Wed,
// Nov 25 · Fri, Nov 27", "Payment recorded: $186 check, paid Nov 3" (Star's words, v1.135), "Parent phone: (508) 555-0141 → (508)
// 555-0109 (whole family)". This file is plain JavaScript with no React, so the Node checks
// (src/lib/camps/checks.mjs) can test every word; CamperHistory.jsx draws it with the shared line.
//
// Two steps:
//   1. groupCamperHistory(rows, current) — the reader's rows (newest first) → one "batch" per save
//      (rows with the same batch id: an Edit details save writes the camper, days and extras rows
//      with one batch id). A day or extra row says only which day was added or taken off, so the
//      days and extras BEFORE and AFTER each save are worked out by walking back from today's
//      (current = the camper's days and extras now, from Camper detail): the newest save's "after"
//      is today; its "before" is today minus what it added plus what it took off; and so on back.
//   2. describeCamperBatch(batch, { hidden, campDays, campExtras, familySize }) — the shared
//      line's `describe`: { text, at, who }, { hiddenPayment: true } or null (nothing to say).
//      - The sign-up save is one line, "Signed up on the family form · CP-4409" (its days and
//        extras are part of signing up, not changes). A desk sign-up (Fill in, migration 0043,
//        rulebook v0.741) says "Signed up (entered by Jeffrey Berg) · CP-4821" and its "who" is
//        that staff member (the log's actor).
//      - The parts of one save are joined with "; ", in this order: payments, Paying by, name /
//        age / member, days, extras, withdrawn / restored / duplicates, the family part.
//      - The family part (the sign-up, shared by brothers and sisters) ends "(whole family)" when
//        the form has more than one child (familySize = the campers on this sign-up, from the roster).
//      - Check-ins never come (the database leaves them out; Camper detail's Check-in part shows them).
//      - A refund (Record refund, migration 0039, rulebook v0.743) is "Refund recorded: $23 cash,
//        Apr 21"; its Undo "Refund undone: $23" (Star's words).
//      - While Hide private details is on, money parts (payments, refunds, undo, edit, Paying by) are
//        left out; a save that was only money gives { hiddenPayment: true } (left out of the count and
//        the list). The shared history line shows its gray "Payment history is hidden on this
//        tablet." in EVERY history while hidden, money changes or not, so seeing it doesn't tell
//        paid from unpaid (Dashboard core's v1.122, design review R4-07).
// The rows' keys are camelCase (campsApi turns every key, also inside before / after, to camelCase).
import { formatPhone, reversesRefund } from '../../lib/camps/campRules.js';
import * as T from './text.js';

const time = (iso) => {
  const ms = Date.parse(iso ?? '');
  return Number.isNaN(ms) ? 0 : ms;
};
const extraKey = (extraId, dayId) => `${extraId}|${dayId ?? ''}`;
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// Step 1. rows = camp_camper_history's rows (camelCase); current = { dayIds: [the camper's day ids
// now], extras: [{ extraId, dayId }] now }. → batches, newest first:
//   { key, occurredAt, actorName, rows, days?: { before:Set, after:Set }, extras?: { before:Set, after:Set } }
export function groupCamperHistory(rows, current = {}) {
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
  batches.sort((a, b) => time(b.occurredAt) - time(a.occurredAt)); // stable: ties keep the reader's order

  // Walk back from today's days and extras.
  let days = new Set(current.dayIds ?? []);
  let extras = new Set((current.extras ?? []).map((e) => extraKey(e.extraId, e.dayId)));
  for (const batch of batches) {
    const dayRows = batch.rows.filter((r) => r.tableName === 'camp_camper_days' && r.op !== 'update');
    if (dayRows.length > 0) {
      const after = new Set(days);
      for (const r of dayRows) {
        if (r.op === 'insert') days.delete(r.after?.dayId);
        else days.add(r.before?.dayId);
      }
      batch.days = { before: new Set(days), after };
    }
    const extraRows = batch.rows.filter((r) => r.tableName === 'camp_camper_extras' && r.op !== 'update');
    if (extraRows.length > 0) {
      const after = new Set(extras);
      for (const r of extraRows) {
        if (r.op === 'insert') extras.delete(extraKey(r.after?.extraId, r.after?.dayId));
        else extras.add(extraKey(r.before?.extraId, r.before?.dayId));
      }
      batch.extras = { before: new Set(extras), after };
    }
    days = new Set(days);
    extras = new Set(extras);
  }
  return batches;
}

// "Yes" / "No", "(508) 555-0109", a blank shown as "—".
function shown(value, kind) {
  if (value === null || value === undefined || value === '') return T.HISTORY_EMPTY_VALUE;
  if (kind === 'yesno') return T.historyYesNo(value);
  if (kind === 'phone') return formatPhone(String(value));
  if (kind === 'paying') return T.payingByText(value) || String(value);
  return String(value);
}

const CAMPER_FIELDS = [
  ['firstName', T.HISTORY_FIRST_NAME],
  ['lastName', T.HISTORY_LAST_NAME],
  ['age', T.HISTORY_AGE],
  ['member', T.HISTORY_MEMBER, 'yesno'],
];
const FAMILY_FIELDS = [
  ['parentName', T.HISTORY_PARENT],
  ['parentRelation', T.HISTORY_PARENT_RELATION],
  ['parentPhone', T.HISTORY_PARENT_PHONE, 'phone'],
  ['emergencyName', T.HISTORY_EMERGENCY],
  ['emergencyRelation', T.HISTORY_EMERGENCY_RELATION],
  ['emergencyPhone', T.HISTORY_EMERGENCY_PHONE, 'phone'],
];

// The parts of one save, in order. Each part: { text, money?, family? }.
function partsOf(batch, { campDays = [], campExtras = [] }) {
  const rows = batch.rows;
  const isInsert = (table) => rows.some((r) => r.tableName === table && r.op === 'insert');

  // The sign-up save: one line (its days and extras are part of signing up).
  if (isInsert('camp_campers') || isInsert('camp_signups')) {
    const signup = rows.find((r) => r.tableName === 'camp_signups' && r.op === 'insert');
    const camper = rows.find((r) => r.tableName === 'camp_campers' && r.op === 'insert');
    // A desk sign-up (Fill in, migration 0043): its sign-up row says source 'desk' and who entered it.
    const enteredBy = signup?.after?.source === 'desk' && typeof signup.after.enteredBy === 'string' && signup.after.enteredBy !== '' ? signup.after.enteredBy : null;
    const parts = [{ text: T.historySignedUp(signup?.after?.reference ?? null, enteredBy) }];
    if (camper?.after?.duplicateState === 'possible') parts.push({ text: T.HISTORY_DUPLICATE_FOUND });
    return parts;
  }

  const money = [];
  const payingBy = [];
  const fields = [];
  const dayParts = [];
  const extraParts = [];
  const status = [];
  const family = [];

  // Payments: an undo and a new payment in one save = Edit payment.
  const inserted = rows.filter((r) => r.tableName === 'camp_payments' && r.op === 'insert').map((r) => r.after ?? {});
  const newPayments = inserted.filter((p) => p.kind === 'payment');
  // Record refund (migration 0039, rulebook v0.743): "Refund recorded: $23 cash, Apr 21" — a refund
  // row is a minus amount, dated the day the money went back. Its Undo is a reversal with a PLUS
  // amount (campRules.reversesRefund): "Refund undone: $23".
  for (const refund of inserted.filter((p) => p.kind === 'refund')) {
    money.push({ text: T.historyRefund(Math.abs(refund.amountCents ?? 0), refund.method, refund.paidOn), money: true });
  }
  for (const reversal of inserted.filter((p) => reversesRefund(p))) {
    money.push({ text: T.historyRefundUndone(reversal.amountCents), money: true });
  }
  for (const reversal of inserted.filter((p) => p.kind === 'reversal' && !reversesRefund(p))) {
    const cents = Math.abs(reversal.amountCents ?? 0);
    const replacement = newPayments.shift();
    money.push({
      text: replacement
        ? T.historyPaymentChanged(cents, reversal.method, replacement.amountCents ?? 0, replacement.method)
        : T.historyPaymentUndone(cents),
      money: true,
    });
  }
  for (const p of newPayments) money.push({ text: T.historyMarkedPaid(p.amountCents ?? 0, p.method, p.paidOn), money: true });

  // The camper's own columns.
  for (const r of rows.filter((x) => x.tableName === 'camp_campers' && x.op === 'update')) {
    const before = r.before ?? {};
    const after = r.after ?? {};
    if ('payingBy' in after) payingBy.push({ text: T.historyChange(T.HISTORY_PAYING_BY, shown(before.payingBy, 'paying'), shown(after.payingBy, 'paying')), money: true });
    for (const [key, label, kind] of CAMPER_FIELDS) {
      if (key in after) fields.push({ text: T.historyChange(label, shown(before[key], kind), shown(after[key], kind)) });
    }
    if ('status' in after) {
      if (after.status === 'withdrawn') status.push({ text: (after.withdrawnReason ?? before.withdrawnReason) === 'duplicate_copy' ? T.HISTORY_DUPLICATE_COPY : T.HISTORY_WITHDRAWN });
      else if (before.status === 'withdrawn') status.push({ text: T.HISTORY_RESTORED });
    }
    if ('duplicateState' in after) {
      if (after.duplicateState === 'possible') status.push({ text: T.HISTORY_DUPLICATE_FOUND });
      else if (after.duplicateState === 'kept_both') status.push({ text: T.HISTORY_KEPT_BOTH });
      // possible → none on its own (the other copy went): nothing to say here.
    }
  }

  // Days: "Days: Wed, Nov 25 → Wed, Nov 25 · Fri, Nov 27".
  const dateOf = new Map(campDays.map((d) => [d.dayId, d.day]));
  const datesOf = (ids) => [...ids].map((id) => dateOf.get(id)).filter(Boolean).sort();
  const listOf = (ids) => (datesOf(ids).length > 0 ? T.historyDayList(datesOf(ids)) : T.HISTORY_EMPTY_VALUE);
  if (batch.days && !sameSet(batch.days.before, batch.days.after)) {
    dayParts.push({ text: T.historyChange(T.HISTORY_DAYS, listOf(batch.days.before), listOf(batch.days.after)) });
  }

  // Extras: "Pizza party added" / "Late pick-up removed". A per-day extra that only followed the
  // camper's days (a day added or taken off) says nothing of its own; one whose days changed
  // otherwise says "Late pick-up: Wed, Nov 25 → Wed, Nov 25 · Fri, Nov 27".
  if (batch.extras) {
    const nameOf = (extraId) => campExtras.find((e) => e.extraId === extraId)?.name ?? T.HISTORY_AN_EXTRA;
    const split = (keys) => {
      const map = new Map();
      for (const key of keys) {
        const [extraId, dayId] = key.split('|');
        if (!map.has(extraId)) map.set(extraId, new Set());
        if (dayId) map.get(extraId).add(dayId);
      }
      return map;
    };
    const before = split(batch.extras.before);
    const after = split(batch.extras.after);
    const daysAdded = batch.days ? [...batch.days.after].filter((d) => !batch.days.before.has(d)) : [];
    const daysRemoved = batch.days ? [...batch.days.before].filter((d) => !batch.days.after.has(d)) : [];
    const order = campExtras.map((e) => e.extraId);
    const ids = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    for (const extraId of ids) {
      const was = before.get(extraId);
      const now = after.get(extraId);
      if (!was && now) extraParts.push({ text: T.historyExtraAdded(nameOf(extraId)) });
      else if (was && !now) extraParts.push({ text: T.historyExtraRemoved(nameOf(extraId)) });
      else if (!sameSet(was, now)) {
        const added = [...now].filter((d) => !was.has(d));
        const removed = [...was].filter((d) => !now.has(d));
        const followsDays = added.every((d) => daysAdded.includes(d)) && removed.every((d) => daysRemoved.includes(d));
        if (!followsDays) extraParts.push({ text: T.historyChange(nameOf(extraId), listOf(was), listOf(now)) });
      }
    }
  }

  // The family part (the sign-up).
  for (const r of rows.filter((x) => x.tableName === 'camp_signups' && x.op === 'update')) {
    const before = r.before ?? {};
    const after = r.after ?? {};
    for (const [key, label, kind] of FAMILY_FIELDS) {
      if (key in after) family.push({ text: T.historyChange(label, shown(before[key], kind), shown(after[key], kind)), family: true });
    }
    if ('signature' in after && after.signature === null && before.signature) family.push({ text: T.HISTORY_SIGNATURE_DELETED, family: true });
  }

  return [...money, ...payingBy, ...fields, ...dayParts, ...extraParts, ...status, ...family];
}

// Step 2: the shared line's describe(batch, { hidden }) — with the camp's days and extras and the
// number of children on this camper's form.
export function describeCamperBatch(batch, { hidden = false, campDays = [], campExtras = [], familySize = 1 } = {}) {
  const parts = partsOf(batch, { campDays, campExtras });
  if (parts.length === 0) return null; // e.g. a save that only moved the row's version
  const shownParts = hidden ? parts.filter((p) => !p.money) : parts;
  if (shownParts.length === 0) return { hiddenPayment: true };
  const texts = shownParts.map((p) => p.text);
  // "(whole family)" once, at the end of the family part (it is always last).
  if (familySize > 1 && shownParts[shownParts.length - 1].family) texts[texts.length - 1] += T.HISTORY_WHOLE_FAMILY;
  return { text: texts.join(T.HISTORY_JOIN), at: batch.occurredAt, who: batch.actorName || T.HISTORY_STAFF };
}
