// mockEventReport.js — the PREVIEW (fake) database's version of the event Money report (migration 0054):
// finance_event_report and finance_event_export.
// Why it exists: preview mode (npm run dev:preview-mode) runs without Supabase. mockFinance.js already builds
// every payment of all five sections into the same "items" the Daily report uses (allItems); the real
// functions read the same rows (finance_money_rows_core) and keep the ones of one event. These two pure
// functions do exactly that on the items, in the answer's shape from CONTRACT-0054-0055.md, so what the
// preview shows is what the real report will show — the numbers are Finance's own.
// Pure (no browser, no storage): mockFinance.js calls them and Node's checks test them.
import { summarize } from './financeRules.js';

export const EVENT_REPORT_SOURCES = ['color_belt', 'star', 'camp', 'black_belt', 'board_breaking'];
const SCHOOL_ORDER = ['worcester', 'shrewsbury']; // by_school: Worcester, then Shrewsbury

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The checks both functions share, in the contract's order (the has_data_access / admin checks come before
// these, in mockFinance's rpc wrapper). Returns { status } or { ok: true, rows, event }.
//   args    { p_source, p_event_id, p_location_code }
//   items   every payment item of all five sections (mockFinance's allItems)
//   findEvent(source, id) → { id, name } | null    schools: ['worcester', 'shrewsbury']
function pick({ args, items, findEvent, schools }) {
  if (args.p_event_id === null || args.p_source === null || !EVENT_REPORT_SOURCES.includes(args.p_source)) return { status: 'invalid' };
  if (args.p_location_code !== null && !schools.includes(args.p_location_code)) return { status: 'not_found' };
  const event = findEvent(args.p_source, args.p_event_id);
  if (!event) return { status: 'not_found' };
  const rows = items
    .filter((it) => it.source === args.p_source && it.event_id === args.p_event_id && it.state !== 'hidden'
      && (args.p_location_code === null || it.school === args.p_location_code))
    .sort((a, b) => byText(a.recorded_at, b.recorded_at) || byText(a.last_name, b.last_name) || byText(a.first_name, b.first_name) || byText(a.payment_id, b.payment_id));
  return { ok: true, rows, event };
}

// The figures of a list of items, as finance_day keeps them: { totals, refunds, returned }.
const figures = (list) => summarize(list);

// finance_event_report: { status:'ok', source, school, event, totals, refunds, returned, by_school, days[] }
//   itemOut(it)  one item as finance_day sends it (mockFinance's itemOut, with school)
export function buildEventReport({ args, items, findEvent, schools = SCHOOL_ORDER, itemOut }) {
  const picked = pick({ args, items, findEvent, schools });
  if (!picked.ok) return { status: picked.status };
  const { rows, event } = picked;
  const days = [...new Set(rows.map((it) => it.day))].sort().reverse(); // newest first
  const haveSchools = SCHOOL_ORDER.filter((s) => rows.some((it) => it.school === s));
  return {
    status: 'ok',
    source: args.p_source,
    school: args.p_location_code,
    event: { id: event.id, name: event.name },
    ...figures(rows),
    by_school: haveSchools.map((school) => ({ school, ...figures(rows.filter((it) => it.school === school)) })),
    days: days.map((day) => {
      const list = rows.filter((it) => it.day === day);
      return { day, ...figures(list), items: list.map((it) => itemOut(it, { withSchool: true })) };
    }),
  };
}

// finance_event_export: { status:'ok', source, event_name, school, rows[] } — the rows of finance_export, ordered by
// day, recorded time, last name, first name, payment id. exportRow(it) builds one row (mockFinance's own).
export function buildEventExport({ args, items, findEvent, schools = SCHOOL_ORDER, exportRow }) {
  const picked = pick({ args, items, findEvent, schools });
  if (!picked.ok) return { status: picked.status };
  const rows = [...picked.rows]
    .sort((a, b) => byText(a.day, b.day) || byText(a.recorded_at, b.recorded_at) || byText(a.last_name, b.last_name) || byText(a.first_name, b.first_name) || byText(a.payment_id, b.payment_id))
    .map((it) => ({ ...exportRow(it), event_name: picked.event.name }));
  return { status: 'ok', source: args.p_source, event_name: picked.event.name, school: args.p_location_code, rows };
}
