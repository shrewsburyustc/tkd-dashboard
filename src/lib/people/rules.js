// rules.js — the top-bar people search's plain rules (M16; rulebook v1.031, v1.144; migration 0049).
// Why it exists: the words and rules of the search live here, apart from the screen, so Node checks can test
// them (src/lib/people/checks.mjs) and the database function people_search and the preview's sample agree.
//   - It starts at 2 letters (MIN_CHARS) and the text is at most 80 (MAX_CHARS), as the database says.
//   - The school searched is the top bar's: "Worcester" -> 'worcester', "Shrewsbury" -> 'shrewsbury',
//     "Both" -> 'both' (v1.144 B).
//   - Results come grouped by section, in this order, and carry name, event and school ONLY (plus the ids
//     the app needs to open a summary). New students show "Ava R.".
export const MIN_CHARS = 2;
export const MAX_CHARS = 80;
export const PAUSE_MS = 250; // results come this long after the last key

// The words (v1.144)
export const SEARCH_PEOPLE = 'Search people';
export const TYPE_MORE = 'Type at least 2 letters.';
export const SEARCHING = 'Searching…';
export const SEARCH_FAILED = "Couldn't search. Check the connection, then retry.";
export const noMatch = (text, schoolName) =>
  schoolName ? `No one matches “${text}” at ${schoolName}. Check the spelling, or search both schools.` : `No one matches “${text}”. Check the spelling.`;
export const SEARCH_BOTH = 'Search both schools';
export const CLOSE_SEARCH = 'Close search';
export const PRIVATE_TESTING = 'Private testing';

// The kinds the database returns, in the order the sections are listed, with the heading of each group.
// colorbelt and colorbelt_private share one group, as the picture shows.
export const GROUPS = [
  { key: 'colorbelt', title: 'Color belt testing', kinds: ['colorbelt', 'colorbelt_private'] },
  { key: 'star', title: 'Star testing', kinds: ['star'] },
  { key: 'black_belt', title: 'Black Belt testing', kinds: ['black_belt'] },
  { key: 'camp', title: 'Camps', kinds: ['camp'] },
  { key: 'prospect', title: 'New students', kinds: ['prospect'] },
];

const SCHOOL_NAME = { worcester: 'Worcester', shrewsbury: 'Shrewsbury' };
export const schoolName = (code) => SCHOOL_NAME[code] ?? null;

// The top bar's value ('Worcester' | 'Shrewsbury' | 'Both') as the database wants it.
export function schoolArg(location) {
  const value = String(location ?? '').toLowerCase();
  return value === 'worcester' || value === 'shrewsbury' ? value : 'both';
}

// The text as it is searched: trimmed, one space between words. null = too short or too long (don't search yet).
export function cleanQuery(text) {
  const value = String(text ?? '').trim().replace(/\s+/g, ' ');
  return value.length >= MIN_CHARS && value.length <= MAX_CHARS ? value : null;
}

// One database row -> what the screen uses (camelCase). A row without a kind or id is dropped.
export function toResult(row) {
  if (!row || typeof row.kind !== 'string' || typeof row.id !== 'string' || typeof row.name !== 'string') return null;
  if (!GROUPS.some((g) => g.kinds.includes(row.kind))) return null;
  return { kind: row.kind, id: row.id, eventId: row.event_id ?? null, name: row.name, event: row.event ?? null, school: row.school ?? null };
}

// The line under a name: "November Children Testing · Worcester". A private testing has no event.
export function detailLine(result) {
  const event = result.event ?? (result.kind === 'colorbelt_private' ? PRIVATE_TESTING : null);
  return [event, schoolName(result.school)].filter(Boolean).join(' · ');
}

// Results grouped by section, in the listed order; empty groups are left out.
export function groupResults(results) {
  return GROUPS.map((g) => ({ ...g, items: results.filter((r) => g.kinds.includes(r.kind)) })).filter((g) => g.items.length > 0);
}