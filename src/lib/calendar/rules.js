// rules.js — the Calendar's input rules, written once for the screens AND the preview database.
// Why it exists: the database checks every title, reason, type name, note, date and time
// (migration 0008: calendar_text_is_valid, calendar_notes_is_valid, calendar_dates_are_valid,
// calendar_event_times_are_valid). The dialogs use the SAME rules so they can warn while you
// type, and mockCalendar.js uses them so preview refuses exactly what the server refuses.
// If a rule changes, change it in the database AND here.
import { normalizeName } from '../testing/names.js';

export const TITLE_MAX = 80; // event title, closure reason
export const TYPE_NAME_MAX = 40; // event type name
export const NOTES_MAX = 1000; // "More details"
export const MAX_DAYS = 31; // an event or closure runs at most 31 days (rulebook v0.143)
export const MAX_TYPES = 50;
const FIRST_DAY = '2020-01-01';
const LAST_DAY = '2100-12-31';

// Builds a "one of these characters" pattern from code-point ranges, so the source has no
// invisible characters in it (they are easy to lose when copying).
const ch = (code) => String.fromCharCode(code);
const charClass = (ranges) => new RegExp(`[${ranges.map(([a, b]) => `${ch(a)}-${ch(b)}`).join('')}]`);
// The same list as the database (and Testing's names.js): control characters, zero-width
// characters and direction marks, direction overrides and isolates, invisible operators, BOM.
const INVISIBLE = [[0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff]];
const BAD_IN_TEXT = charClass([[0x01, 0x08], [0x0e, 0x1f], [0x7f, 0x9f], ...INVISIBLE]);
// Notes may have line breaks; tabs and every other control character are refused.
const BAD_IN_NOTES = charClass([[0x01, 0x09], [0x0b, 0x1f], [0x7f, 0x9f], ...INVISIBLE]);

export { normalizeName as cleanText };

// What's wrong with a title / reason / type name: null | 'empty' | 'tooLong' | 'badCharacter'.
export function textProblem(text, max) {
  const value = normalizeName(text);
  if (BAD_IN_TEXT.test(value)) return 'badCharacter';
  const length = [...value].length;
  if (length === 0) return 'empty';
  if (length > max) return 'tooLong';
  return null;
}

// Notes as the database keeps them: Windows / old Mac line ends become plain ones, the start and
// end are trimmed (spaces, tabs, line breaks); empty → null.
export function cleanNotes(text) {
  if (text === null || text === undefined) return null;
  const value = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^[ \t\n]+|[ \t\n]+$/g, '');
  return value === '' ? null : value;
}

// null | 'tooLong' | 'badCharacter' (no notes at all is fine).
export function notesProblem(text) {
  const value = cleanNotes(text);
  if (value === null) return null;
  if (BAD_IN_NOTES.test(value)) return 'badCharacter';
  if ([...value].length > NOTES_MAX) return 'tooLong';
  return null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (text) => {
  if (typeof text !== 'string' || !DATE_PATTERN.test(text)) return false;
  const d = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
};

// Whole days from one 'YYYY-MM-DD' to another (to - from).
export function daysBetween(from, to) {
  return Math.round((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000);
}

// null | 'missing' | 'endsBefore' | 'tooLong' (more than 31 days) | 'outOfRange'
export function datesProblem(from, to) {
  if (!isRealDate(from) || !isRealDate(to)) return 'missing';
  if (to < from) return 'endsBefore';
  if (from < FIRST_DAY || to > LAST_DAY) return 'outOfRange';
  if (daysBetween(from, to) > MAX_DAYS - 1) return 'tooLong';
  return null;
}

// Times are minutes after midnight (schedule/time.js). Not all day: both times, whole 5-minute
// steps; a one-day event ends after it starts. A several-day event may end at any time.
// null | 'missing' | 'step' | 'endsBefore' | any datesProblem code
export function eventTimesProblem({ startsOn, endsOn, allDay, start, end }) {
  const dates = datesProblem(startsOn, endsOn);
  if (dates) return dates;
  if (allDay) return null;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return 'missing';
  if (start % 5 !== 0 || end % 5 !== 0 || start < 0 || end < 0 || start >= 1440 || end >= 1440) return 'step';
  if (startsOn === endsOn && end <= start) return 'endsBefore';
  return null;
}
