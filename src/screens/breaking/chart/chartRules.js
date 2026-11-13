// chartRules.js — the pure rules behind the "Chart and prices" tab: form checks and the list edits.
// Why it exists: the tab saves the WHOLE chart at once (brk_save_chart replaces every row), so every change —
// edit a rank, add one, delete one, move one — is "make a new full list, then send it". Keeping those list
// edits and the dialog checks here, with no React and no database, keeps the screen file short and lets plain
// `node` test them. The database checks the same rules again; these only give people an answer while typing.
//
// A rank is identified by its KEY, `${band}|${rankName}` (a name is unique inside its group, and the database
// rebuilds the rows' ids on every save, so ids can't be trusted between saves).
import { BANDS, MAX_BOARDS, centsToDollarsText, dollarsToCents } from '../../../lib/breaking/breakingRules.js';

export const MAX_CENTS = 100000; // brk_save_settings: each price 0 … $1,000
export const MAX_CHILD_AGE = 98; // the database takes 1–99; 98 keeps "99 and up" meaningful
export const RANK_NAME_MAX = 60;
export const TECHNIQUE_MAX = 100;

export const rankKey = (row) => `${row.band}|${row.rankName}`;
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// The chart as four groups, each in its saved order: [{ band, rows }]
export function groupChart(chart) {
  return BANDS.map((band) => ({ band, rows: chart.filter((r) => r.band === band).sort((a, b) => a.sort - b.sort) }));
}

// The rows brk_save_chart wants (sort = position inside the group, counted again from 1).
export function chartForSave(groups) {
  return groups.flatMap(({ band, rows }) =>
    rows.map((r, index) => ({ band, rankName: r.rankName, sort: index + 1, technique: r.technique ?? '', techBoards: r.techBoards, adultBoards: r.adultBoards })),
  );
}
// The same, from a flat list of rows.
export const chartRowsForSave = (chart) => chartForSave(groupChart(chart));

// ----- List edits (each returns a NEW flat chart) -----
function mapGroup(chart, band, change) {
  return groupChart(chart).flatMap((g) => (g.band === band ? change(g.rows) : g.rows)).map((r, i, all) => ({ ...r, sort: sortWithin(all, r, i) }));
}
// Keeps `sort` meaningful after an edit: the position inside its own group.
function sortWithin(all, row, index) {
  let n = 0;
  for (let i = 0; i <= index; i += 1) if (all[i].band === row.band) n += 1;
  return n;
}
const plain = (r) => ({ band: r.band, rankName: r.rankName, technique: r.technique ?? '', techBoards: r.techBoards, adultBoards: r.adultBoards });

export function replaceRank(chart, key, values) {
  const found = chart.find((r) => rankKey(r) === key);
  if (!found) return chart;
  return mapGroup(chart, found.band, (rows) => rows.map((r) => (rankKey(r) === key ? { ...r, ...plain({ ...r, ...values }) } : r)));
}
export function appendRank(chart, band, values) {
  return mapGroup(chart, band, (rows) => [...rows, { ...plain({ band, ...values }), sort: rows.length + 1 }]);
}
export function removeRank(chart, key) {
  const found = chart.find((r) => rankKey(r) === key);
  if (!found) return chart;
  return mapGroup(chart, found.band, (rows) => rows.filter((r) => rankKey(r) !== key));
}
// delta −1 = up, +1 = down. Unchanged when it can't move.
export function moveRank(chart, key, delta) {
  const found = chart.find((r) => rankKey(r) === key);
  if (!found) return chart;
  return mapGroup(chart, found.band, (rows) => {
    const from = rows.findIndex((r) => rankKey(r) === key);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= rows.length) return rows;
    const next = [...rows];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  });
}

// ----- The rank dialog -----
// state.values = { name, technique, tech, adult } (tech / adult are numbers). → { canSave, nameError, techniqueError, sameAsSaved, payload }
export function checkRankForm(state, chart, ownKey) {
  const name = clean(state.values.name);
  const technique = clean(state.values.technique);
  let nameError = null;
  if (name === '') nameError = 'empty';
  else if (name.length > RANK_NAME_MAX) nameError = 'long';
  else if (chart.some((r) => r.band === state.band && rankKey(r) !== ownKey && same(r.rankName, name))) nameError = 'duplicate';
  const techniqueError = technique.length > TECHNIQUE_MAX ? 'long' : null;
  const boardsOk = [state.values.tech, state.values.adult].every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_BOARDS);
  const payload = { rankName: name, technique, techBoards: state.values.tech, adultBoards: state.values.adult };
  const old = state.initial;
  const sameAsSaved = state.mode === 'edit'
    && clean(old.name) === name && clean(old.technique) === technique && old.tech === state.values.tech && old.adult === state.values.adult;
  return { canSave: !state.blocked && !nameError && !techniqueError && boardsOk, nameError, techniqueError, sameAsSaved, payload };
}
export const isRankDirty = (state) => {
  const a = state.values;
  const b = state.initial;
  return clean(a.name) !== clean(b.name) || clean(a.technique) !== clean(b.technique) || a.tech !== b.tech || a.adult !== b.adult;
};

// ----- The prices dialog -----
export const PRICE_FIELDS = [
  { key: 'tech', setting: 'techCents' },
  { key: 'adult', setting: 'adultCents' },
  { key: 'card', setting: 'cardExtraCents' },
  { key: 'sameDay', setting: 'sameDayExtraCents' },
];
export function pricesToValues(settings) {
  return Object.fromEntries(PRICE_FIELDS.map((f) => [f.key, centsToDollarsText(settings[f.setting])]));
}
// One typed box → { cents } or { problem: 'empty' | 'notMoney' | 'tooHigh' }
export function parseMoneyBox(text) {
  if (String(text ?? '').trim() === '') return { problem: 'empty' };
  const cents = dollarsToCents(text);
  if (cents === null) return { problem: 'notMoney' };
  if (cents > MAX_CENTS) return { problem: 'tooHigh' };
  return { cents };
}
// → { canSave, errors: { tech, adult, card, sameDay }, sameAsSaved, settings (the numbers, where they parse), payload }
export function checkPricesForm(state, saved) {
  const errors = {};
  const cents = {};
  for (const f of PRICE_FIELDS) {
    const r = parseMoneyBox(state.values[f.key]);
    if (r.problem) errors[f.key] = r.problem;
    else cents[f.setting] = r.cents;
  }
  const ok = Object.keys(errors).length === 0;
  const sameAsSaved = ok && PRICE_FIELDS.every((f) => cents[f.setting] === saved[f.setting]);
  return {
    canSave: !state.blocked && ok,
    errors,
    sameAsSaved,
    cents,
    payload: ok ? { techCents: cents.techCents, adultCents: cents.adultCents, cardExtraCents: cents.cardExtraCents, sameDayExtraCents: cents.sameDayExtraCents } : null,
  };
}
export const isPricesDirty = (state) => PRICE_FIELDS.some((f) => state.values[f.key].trim() !== state.initial[f.key].trim());

// ----- The age dialog -----
export function checkAgeForm(state, saved) {
  const text = state.values.age.trim();
  const n = /^\d+$/.test(text) ? Number(text) : null;
  const ok = n !== null && n >= 1 && n <= MAX_CHILD_AGE;
  return { canSave: !state.blocked && ok, error: ok ? null : 'age', sameAsSaved: ok && n === saved.childMaxAge, age: ok ? n : null };
}
export const isAgeDirty = (state) => state.values.age.trim() !== state.initial.age.trim();
