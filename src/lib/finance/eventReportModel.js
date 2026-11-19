// eventReportModel.js — small pure helpers for the event Money report's data (finance_event_report, migration 0054).
// Why it exists: the page, the printed page and the checks all need the same few facts (which figures a
// day or a school box holds, the first and last day money was taken, the net), and the answer's day and
// school entries may carry their figures either under `totals` / `refunds` / `returned` (like the whole
// report does — the contract's wording) or flat on the entry. normalizeEventReport() makes every entry
// nested once, right after the answer arrives, so no screen has to care. No browser code here.

const FIGURE_KEYS = ['count', 'total_cents', 'in_cents', 'net_cents', 'cash', 'check', 'card'];
const ZERO_PART = { count: 0, cents: 0 };

// One entry (a day, a school) with its figures under .totals, .refunds and .returned, always present.
export function normalizeEntry(entry) {
  const flat = entry.totals ? entry.totals : Object.fromEntries(FIGURE_KEYS.filter((k) => k in entry).map((k) => [k, entry[k]]));
  const totals = {
    count: 0, total_cents: 0, in_cents: 0, net_cents: 0, cash: { ...ZERO_PART }, check: { ...ZERO_PART }, card: { ...ZERO_PART }, ...flat,
  };
  if (totals.net_cents === 0 && totals.total_cents !== 0) totals.net_cents = totals.total_cents;
  return {
    ...entry,
    totals,
    refunds: entry.refunds ?? { count: 0, cents: 0, cash_cents: 0, check_cents: 0, card_cents: 0 },
    returned: entry.returned ?? { count: 0, cents: 0 },
  };
}

// The whole answer with every day and school entry normalised (the answer itself is not changed).
export function normalizeEventReport(data) {
  if (!data) return data;
  return {
    ...data,
    ...normalizeEntry(data),
    days: (data.days ?? []).map(normalizeEntry),
    by_school: (data.by_school ?? []).map(normalizeEntry),
  };
}

// The net of one normalised entry (what Finance calls its Total: payments minus refunds and returned checks).
export const netOf = (entry) => entry?.totals?.net_cents ?? entry?.totals?.total_cents ?? 0;

// The first and last day money was taken, 'YYYY-MM-DD' (or null when there are no days).
export function dayRange(days) {
  const list = (days ?? []).map((d) => d.day).filter(Boolean).sort();
  return list.length ? { first: list[0], last: list[list.length - 1] } : { first: null, last: null };
}
