// time.js — the time rules of the Schedule, in one place (the database has the same rules).
// Why it exists: the dialogs check times as you type, the week grid places boxes by time, and
// the preview database refuses the same things the real one does — all from these functions.
//
// A time is kept as "minutes after midnight" (16:30 → 990). The database sends '16:30:00'.
// Weekdays are numbers 1 = Monday … 7 = Sunday (like the database, ISO).
//
// Rules for a time slot (migration 0007, schedule_time_is_valid):
//   - on 5-minute steps (4:00, 4:05 …)
//   - ends after it starts
//   - lasts 15 minutes to 4 hours

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
export const MIN_LENGTH = 15;
export const MAX_LENGTH = 240;

// '16:30', '16:30:00' or '4:30' → 990. Anything else → null.
export function parseTime(text) {
  const match = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(String(text ?? ''));
  if (!match) return null;
  const [hours, minutes, seconds = '0'] = [Number(match[1]), Number(match[2]), match[3]];
  if (hours > 23 || minutes > 59 || Number(seconds) !== 0) return null;
  return hours * 60 + minutes;
}

// 990 → '16:30' (what the database and <input type="time"> use).
export function toTimeText(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 990 → '4:30' and 960 → '4:00' (short, for the boxes; morning and evening are clear from the
// side labels). withSuffix → '4:30 pm'.
export function formatTime(minutes, withSuffix = false) {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const base = `${h12}:${String(m).padStart(2, '0')}`;
  return withSuffix ? `${base} ${h24 < 12 ? 'am' : 'pm'}` : base;
}

// 16:00–16:45 → '4:00–4:45'
export function formatRange(start, end, withSuffix = false) {
  return `${formatTime(start)}–${formatTime(end, withSuffix)}`;
}

// The side labels: 960 → '4 pm', 720 → '12 pm', 540 → '9 am'.
export function hourLabel(minutes) {
  const h24 = Math.floor(minutes / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12} ${h24 < 12 ? 'am' : 'pm'}`;
}

// What's wrong with a start/end pair (both minutes, or null when empty/unreadable):
//   'missing' | 'step' (not on 5 minutes) | 'order' (ends first) | 'short' | 'long' | null (fine)
export function timeProblem(start, end) {
  if (start === null || end === null) return 'missing';
  if (start % 5 !== 0 || end % 5 !== 0) return 'step';
  if (end <= start) return 'order';
  if (end - start < MIN_LENGTH) return 'short';
  if (end - start > MAX_LENGTH) return 'long';
  return null;
}

// Two time ranges overlap when each starts before the other ends (back-to-back is fine).
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

// The slots (from `slots`) on any of `weekdays` that overlap start–end, leaving out skipId.
export function findOverlaps(slots, weekdays, start, end, skipId = null) {
  return slots
    .filter((s) => s.id !== skipId && weekdays.includes(s.weekday) && overlaps(start, end, s.start, s.end))
    .sort((a, b) => a.weekday - b.weekday || a.start - b.start);
}

// The hours shown down the side of the week: every hour from the first class's hour to the
// last class's end, rounded out to whole hours (decided v0.137: "show every hour").
// With no slots: 4 pm to 8 pm, so an empty grid still looks like a week.
export function hourRange(slots) {
  if (slots.length === 0) return { from: 16 * 60, to: 20 * 60 };
  const from = Math.floor(Math.min(...slots.map((s) => s.start)) / 60) * 60;
  const to = Math.ceil(Math.max(...slots.map((s) => s.end)) / 60) * 60;
  return { from, to: Math.max(to, from + 60) };
}
