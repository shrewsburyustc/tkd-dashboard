// financeRules.js — the rules of the Finance Daily report, written once for everyone.
// Why it exists: the screens, the preview database (mockFinance.js) and the automatic checks
// (checks.mjs) must agree with the real database (migration 0011, contract 0011 §1.3–§1.4) on:
//   - how a payment's corrections are followed ("chains": edited, moved, undone, hidden),
//   - what adds to the totals and what the drawer should hold (cash in − cash refunded),
//   - Matches / Short / Over when someone counts the drawer,
//   - "today" and "now" at the school (America/New_York),
//   - when the Home reminder is due.
// It is PURE: no React, no database, no browser — so Node can import it (node checks.mjs).
// It returns CODES, never words (the screens' text.js owns all wording).
//
// Words used:
//   row      one stored row of testing_payments (Color Belt) or star_payments (Star): kind
//            'payment' | 'refund' (Star only) | 'reversal' (a correction pointing at another row)
//   owner    the registration (Color Belt) or candidate (Star) a row belongs to
//   chain    a first payment / refund followed through its edits to the row that is true now
//   item     one line of the report: a chain shown on one day, with a state:
//            'counted' · 'edited' · 'moved_in' · 'moved_out' · 'undone' · 'hidden'
//   cents    all money is whole cents (6500 = $65.00); refunds are negative
import { addDays, isIsoDate, SCHOOL_TIME_ZONE } from '../testing/eventRules.js';

export { toCsv } from './csv.js'; // contract 0011 §3 lists toCsv with these rules; it lives in csv.js

// ----- Constants -----

// A payment undone by the same person this soon after recording it is a mis-click: hidden (§1.3 rule 4).
export const HIDE_WINDOW_MS = 10 * 1000;
// The person who closed a day may undo it for this long (finance_undo_close).
export const UNDO_CLOSE_WINDOW_MS = 10 * 1000;
// Item states (§1.3). Only the first three add to the totals (rule 5).
export const ITEM_STATES = ['counted', 'edited', 'moved_in', 'moved_out', 'undone', 'hidden'];
const COUNTING_STATES = new Set(['counted', 'edited', 'moved_in']);
// Payment methods, in drawer order (the order of the groups on the report).
export const METHODS = ['cash', 'check', 'card'];
// Refund layouts (v0.209): 'own' = a Refunds group at the end; 'in' = inside Cash / Check.
export const REFUND_LAYOUTS = ['own', 'in'];
// History tags, most important first (finance_history).
export const HISTORY_TAGS = ['today_open', 'changed_after_closing', 'short', 'over', 'not_closed', 'closed', 'no_payments'];
// Count limits the database checks (finance_close_day).
export const MAX_COUNT_CENTS = 10000000; // $100,000
export const MAX_CHECKS = 500;
export const NOTE_MAX = 500;

// Does an item with this state add to the totals?
export function countsInTotals(state) {
  return COUNTING_STATES.has(state);
}

// ----- Chains (§1.3) -----

const msOf = (iso) => Date.parse(iso);
// Same login? Like SQL "a = b": two empty (null) logins are NOT the same person.
const sameLogin = (a, b) => a !== null && a !== undefined && a === b;

// Reads one stored row into the shape the chain rules use. Color Belt rows name their owner
// registration_id, Star rows candidate_id, Camp rows camper_id (v0.707); any may be given as owner_id instead.
function normalizeRow(row) {
  return {
    ...row,
    owner_id: row.owner_id ?? row.registration_id ?? row.candidate_id ?? row.camper_id ?? null,
    reverses_payment_id: row.reverses_payment_id ?? null,
    recorded_by: row.recorded_by ?? null,
    ms: msOf(row.recorded_at),
  };
}

// Follows every payment / refund through its corrections. rows = ALL rows of the owners
// involved (never rows filtered by date first — an undo is dated the day it is made).
// → [{ first, rows: [first, …edit rows, final], final, edits: [{ reversal, row }], undo }]
//   undo = the reversal that ended the chain (null when the final row is still live).
export function buildChains(rows) {
  const list = (rows ?? []).map(normalizeRow);
  // Which reversal points at each row (a row is reversed at most once — 0005 / 0006 guards).
  const reversalOf = new Map();
  for (const r of list) if (r.kind === 'reversal' && r.reverses_payment_id) reversalOf.set(r.reverses_payment_id, r);

  // Rule 2 — an EDIT is a reversal R plus a payment N of the same owner written in the same
  // transaction: same recorded_at and same recorded_by. Sorted by id so the pairing never
  // depends on the order the rows arrived in.
  const editRowOf = new Map(); // reversal id → N
  const isEditRow = new Set(); // ids of rows that are the new row of an edit
  const byId = [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of byId) {
    if (r.kind !== 'reversal') continue;
    const n = byId.find((x) => x.kind === 'payment' && x.id !== r.reverses_payment_id && !isEditRow.has(x.id)
      && x.owner_id === r.owner_id && x.ms === r.ms && sameLogin(x.recorded_by, r.recorded_by));
    if (n) {
      editRowOf.set(r.id, n);
      isEditRow.add(n.id);
    }
  }

  // Rule 1 — a chain starts at a payment or refund that is not the new row of an edit.
  const chains = [];
  for (const first of list) {
    if ((first.kind !== 'payment' && first.kind !== 'refund') || isEditRow.has(first.id)) continue;
    const chainRows = [first];
    const edits = [];
    let current = first;
    let undo = null;
    // Walk forward: reversed + new row = edit (continue); reversed alone = undone (rule 3).
    while (reversalOf.has(current.id)) {
      const reversal = reversalOf.get(current.id);
      const next = editRowOf.get(reversal.id);
      if (!next || chainRows.includes(next)) {
        undo = reversal;
        break;
      }
      edits.push({ reversal, row: next });
      chainRows.push(next);
      current = next;
    }
    chains.push({ first, rows: chainRows, final: current, edits, undo });
  }
  return chains;
}

// The §1.3 items of every chain. Each item:
//   { source, payment_id (the chain's first row), owner_id, row_id (the row shown), day, kind,
//     method, amount_cents, state, was_amount_cents, was_method, moved_to, moved_from,
//     changed_by_name, changed_on, recorded_at (of the row shown), recorded_by_name,
//     chain_started_at (first row's recorded_at — for "Added after closing") }
// Hidden items ARE returned (state 'hidden') so they can be tested; every screen answer drops them.
export function chainItems(rows) {
  const items = [];
  for (const chain of buildChains(rows)) {
    const { first, final, edits, undo } = chain;
    // "Who / which school date made the last correction" — a reversal is dated the day it's made.
    const last = undo ?? edits.at(-1)?.reversal ?? null;
    const base = {
      source: first.source ?? null,
      payment_id: first.id,
      owner_id: first.owner_id,
      kind: first.kind,
      was_amount_cents: null, was_method: null, moved_to: null, moved_from: null,
      changed_by_name: last?.recorded_by_name ?? null,
      changed_on: last?.paid_on ?? null,
      chain_started_at: first.recorded_at,
    };
    const itemOf = (row, state, day) => ({
      ...base, row_id: row.id, day, method: row.method, amount_cents: row.amount_cents, state,
      recorded_at: row.recorded_at, recorded_by_name: row.recorded_by_name ?? null,
    });
    // The first row of the chain dated d (the row shown on that day).
    const rowOn = (d) => chain.rows.find((r) => r.paid_on === d);
    const dates = [...new Set(chain.rows.map((r) => r.paid_on))];

    if (!undo) {
      if (edits.length === 0) {
        items.push(itemOf(first, 'counted', first.paid_on));
        continue;
      }
      // Rule 4 — edited: shown once on the final row's date ("moved_in" when the date changed),
      // and every OTHER date the chain touched gets "moved_out" (Moved to <final date>).
      const moved = final.paid_on !== first.paid_on;
      items.push({
        ...itemOf(final, moved ? 'moved_in' : 'edited', final.paid_on),
        was_amount_cents: first.amount_cents, was_method: first.method, moved_from: moved ? first.paid_on : null,
      });
      for (const d of dates) if (d !== final.paid_on) items.push({ ...itemOf(rowOn(d), 'moved_out', d), moved_to: final.paid_on });
      continue;
    }

    // Ended by an undo. A mis-click — no edit, undone by the same login within 10 seconds — is
    // hidden everywhere; otherwise every date the chain touched shows it as undone.
    const misClick = edits.length === 0 && sameLogin(undo.recorded_by, first.recorded_by)
      && undo.ms - first.ms <= HIDE_WINDOW_MS;
    if (misClick) {
      items.push(itemOf(first, 'hidden', first.paid_on));
      continue;
    }
    items.push(itemOf(first, 'undone', first.paid_on));
    for (const d of dates) if (d !== first.paid_on) items.push(itemOf(rowOn(d), 'undone', d));
  }
  return items;
}

// ----- Totals and expected values (§1.4, "Refunds and the drawer" v0.209) -----

// The day's totals from its (non-hidden) items, in finance_day's shape:
//   totals:  { count (counted PAYMENTS), total_cents (= net_cents), in_cents (payments),
//              net_cents (payments + refunds), cash/check/card: { count, cents } (payments only) }
//   refunds: { count, cents, cash_cents, check_cents }  (cents are negative, like the rows)
export function summarize(items) {
  const totals = { count: 0, total_cents: 0, in_cents: 0, net_cents: 0, cash: { count: 0, cents: 0 }, check: { count: 0, cents: 0 }, card: { count: 0, cents: 0 } };
  const refunds = { count: 0, cents: 0, cash_cents: 0, check_cents: 0 };
  for (const item of items ?? []) {
    if (!countsInTotals(item.state)) continue;
    if (item.kind === 'refund') {
      refunds.count += 1;
      refunds.cents += item.amount_cents;
      if (item.method === 'cash') refunds.cash_cents += item.amount_cents;
      if (item.method === 'check') refunds.check_cents += item.amount_cents;
    } else {
      totals.count += 1;
      totals.in_cents += item.amount_cents;
      if (totals[item.method]) {
        totals[item.method].count += 1;
        totals[item.method].cents += item.amount_cents;
      }
    }
  }
  totals.net_cents = totals.in_cents + refunds.cents;
  totals.total_cents = totals.net_cents;
  return { totals, refunds };
}

// What the drawer should hold in cash: cash payments − cash refunded (may be negative).
export function expectedCash(totals, refunds) {
  return (totals?.cash?.cents ?? 0) + (refunds?.cash_cents ?? 0);
}

// Everything Close the day compares against. Checks count PAYMENTS only — a check refund is
// the school's own check and never sits in the drawer. Card = card payments.
//   → { count (every counted item), cashCents, checksCount, checksCents, cardCents }
export function expectedValues(totals, refunds) {
  return {
    count: (totals?.count ?? 0) + (refunds?.count ?? 0),
    cashCents: expectedCash(totals, refunds),
    checksCount: totals?.check?.count ?? 0,
    checksCents: totals?.check?.cents ?? 0,
    cardCents: totals?.card?.cents ?? 0,
  };
}

// The four cards at the top of the report for a refund layout (v0.209):
//   'own' → Cash / Check / Card show money IN; Total is net, its sub-line says "after $X refunds".
//   'in'  → Cash / Check show net (refunds taken off); Total is net.
// → { total: { cents, count, sub: 'payments' | 'after_refunds', refundCents },
//     cash / check / card: { cents, count, refundCents } }   refundCents are positive amounts.
export function cardsFor(totals, refunds, layout = 'own') {
  const inGroups = layout === 'in';
  const refundOf = { cash: -(refunds?.cash_cents ?? 0), check: -(refunds?.check_cents ?? 0), card: 0 };
  const card = (method) => ({
    cents: (totals?.[method]?.cents ?? 0) - (inGroups ? refundOf[method] : 0),
    count: totals?.[method]?.count ?? 0,
    refundCents: refundOf[method],
  });
  const refundCents = -(refunds?.cents ?? 0);
  return {
    total: {
      cents: (totals?.in_cents ?? 0) - refundCents,
      count: totals?.count ?? 0,
      sub: (refunds?.count ?? 0) > 0 ? 'after_refunds' : 'payments',
      refundCents,
    },
    cash: card('cash'),
    check: card('check'),
    card: card('card'),
  };
}

// The payment list's groups in drawer order: Cash, Check, Card (and, in the 'own' layout,
// Refunds at the end). Groups with no items at all are dropped; a group whose items are all
// undone still shows (its rows are struck through). Items keep the order they came in.
// → [{ key: 'cash' | 'check' | 'card' | 'refunds', items, count, cents, refundCount }]
//   count = counted payments, refundCount = counted refunds, cents = counted net total.
export function groupItems(items, layout = 'own') {
  const keys = layout === 'in' ? METHODS : [...METHODS, 'refunds'];
  const groups = Object.fromEntries(keys.map((key) => [key, { key, items: [], count: 0, cents: 0, refundCount: 0 }]));
  for (const item of items ?? []) {
    if (item.state === 'hidden') continue;
    const key = item.kind === 'refund' && layout !== 'in' ? 'refunds' : item.method;
    const group = groups[key];
    if (!group) continue;
    group.items.push(item);
    if (!countsInTotals(item.state)) continue;
    group.cents += item.amount_cents;
    if (item.kind === 'refund') group.refundCount += 1;
    else group.count += 1;
  }
  return keys.map((key) => groups[key]).filter((g) => g.items.length > 0);
}

// ----- Counting the drawer -----

// One count against what was expected, to the cent.
// → { result: 'matches' | 'short' | 'over', diffCents }  diffCents is how far off (never negative).
export function compareCount(expected, counted) {
  const diff = counted - expected;
  if (diff === 0) return { result: 'matches', diffCents: 0 };
  return { result: diff < 0 ? 'short' : 'over', diffCents: Math.abs(diff) };
}

// All three parts of Close the day. expected = expectedValues(…); counted =
// { cashCents, checksCount, checksCents, cardCents }. Checks have two parts (how many, total):
// the checks result is 'matches' only when both match; otherwise the total decides short / over
// (or the count, when the total matches). countResult / countDiff say how the number of checks did.
// → { cash: { result, diffCents }, checks: { result, diffCents, countResult, countDiff }, card: { … } }
export function closeResults(expected, counted) {
  const cash = compareCount(expected.cashCents, counted.cashCents);
  const card = compareCount(expected.cardCents, counted.cardCents);
  const total = compareCount(expected.checksCents, counted.checksCents);
  const number = compareCount(expected.checksCount, counted.checksCount);
  const checks = {
    result: total.result !== 'matches' ? total.result : number.result,
    diffCents: total.diffCents,
    countResult: number.result,
    countDiff: number.diffCents,
  };
  return { cash, checks, card };
}

// Is any part short or over? (Then a note is needed.)
export function anyDifference(results) {
  return ['cash', 'checks', 'card'].some((part) => results?.[part]?.result && results[part].result !== 'matches');
}

// ----- School time -----

const SCHOOL_NOW_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// ISO weekday of a 'YYYY-MM-DD' date: 1 = Monday … 7 = Sunday (like the database's isodow).
export function weekdayOf(dateIso) {
  if (!isIsoDate(dateIso)) return null;
  const [y, m, d] = dateIso.split('-').map(Number);
  const sunday0 = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return sunday0 === 0 ? 7 : sunday0;
}

// The date and clock at the school right now (or at `now`: a Date, milliseconds or an ISO text).
// → { day: 'YYYY-MM-DD', time: 'HH:MM' (24-hour), minutes (since midnight), weekday (1 = Monday) }
export function schoolNow(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const p = Object.fromEntries(SCHOOL_NOW_FORMAT.formatToParts(date).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour; // some engines write midnight as 24
  const day = `${p.year}-${p.month}-${p.day}`;
  return { day, time: `${hour}:${p.minute}`, minutes: Number(hour) * 60 + Number(p.minute), weekday: weekdayOf(day) };
}

// Today's date at the school, 'YYYY-MM-DD'.
export function schoolToday(now = new Date()) {
  return schoolNow(now).day;
}

// 'HH:MM' or 'HH:MM:SS' → minutes since midnight; anything else → null.
export function timeToMinutes(text) {
  const m = typeof text === 'string' ? /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(text) : null;
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  return h < 24 && min < 60 ? h * 60 + min : null;
}

// Reminder times are Off or 11:00 AM–11:00 PM in 15-minute steps (finance_set_reminder_time).
export function isReminderTime(text) {
  const minutes = timeToMinutes(text);
  return minutes !== null && minutes % 15 === 0 && minutes >= 11 * 60 && minutes <= 23 * 60;
}

// Every choice of the reminder time dropdown, 'HH:MM', 11:00 → 23:00 (Off is null, not listed).
export const REMINDER_TIME_CHOICES = Array.from({ length: (23 - 11) * 4 + 1 }, (_, i) => {
  const minutes = 11 * 60 + i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

// Is the Home reminder due for one school now? (finance_home's rule.)
//   times: [{ school, weekday, remind_at: 'HH:MM' | null }] (finance_settings_get's `times`)
//   now:   a schoolNow() result ({ weekday, minutes }), or a Date / milliseconds
//   opts:  { school (filter times by school code), reminderOn, hasPayments, closed }
// Due when the reminder is On, the day took payments, it isn't closed, today's weekday has a
// time (not Off) and the school clock is at or past it (7:29:59 PM is not yet 7:30 PM).
export function isReminderDue(times, now, { school = null, reminderOn = true, hasPayments = true, closed = false } = {}) {
  if (!reminderOn || !hasPayments || closed) return false;
  const clock = now && typeof now === 'object' && !(now instanceof Date) ? now : schoolNow(now ?? new Date());
  const row = (times ?? []).find((t) => t.weekday === clock.weekday && (school === null || t.school === school));
  const at = timeToMinutes(row?.remind_at ?? null);
  return at !== null && clock.minutes >= at;
}

// ----- Days and months -----

// The first day of the month a date is in: '2026-10-24' → '2026-10-01'.
export function monthOf(dateIso) {
  return isIsoDate(dateIso) ? `${dateIso.slice(0, 7)}-01` : null;
}

// Every day of a month, oldest first, never after `lastDay` (e.g. today).
export function daysOfMonth(monthIso, lastDay = null) {
  const first = monthOf(monthIso);
  if (!first) return [];
  const days = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) {
    if (lastDay !== null && d > lastDay) break;
    days.push(d);
  }
  return days;
}

// Days from `from` to `to`, counting both ends ('2026-10-01'…'2026-10-31' → 31).
export function daysBetweenInclusive(from, to) {
  if (!isIsoDate(from) || !isIsoDate(to)) return null;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

// ----- Fingerprint (§1.4) -----

// A short code standing for "exactly these items": the shown items' row_id|amount|method|state,
// sorted. finance_day returns it; finance_close_day answers 'stale' when it no longer matches, so
// even a method-only edit between loading and closing is caught. The real database uses md5;
// this preview uses a smaller hash — a fingerprint is only ever compared with one from the same place.
export function fingerprintOf(items) {
  const text = (items ?? [])
    .filter((i) => i.state !== 'hidden')
    .map((i) => `${i.row_id}|${i.amount_cents}|${i.method}|${i.state}`)
    .sort()
    .join(',');
  // cyrb53: a well-known 53-bit string hash (two 32-bit halves mixed together).
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
