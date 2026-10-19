// versions.js — which schedule is current, planned or past (the same rule as the database).
// Why it exists: a school can have many schedules, each with a start date (rulebook v0.233).
// The app shows one at a time and needs to know what each one is:
//   current = the one with the LATEST start date that is on or before today
//   planned = starts after today (any number; editable; can be moved or deleted)
//   past    = started on or before today but isn't the current one (view only)
// "today" is Massachusetts' date, sent by the database (schedule_today) as 'YYYY-MM-DD'.
// Dates are compared as 'YYYY-MM-DD' text, which sorts the same as the dates themselves.

// Each version gets `state`. Returned in date order (oldest first).
export function classifyVersions(versions, today) {
  const sorted = [...versions].sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0));
  const started = sorted.filter((v) => v.startsOn <= today);
  const currentId = started.length ? started[started.length - 1].id : null;
  return sorted.map((v) => ({
    ...v,
    state: v.startsOn > today ? 'planned' : v.id === currentId ? 'current' : 'past',
  }));
}

export const currentOf = (classified) => classified.find((v) => v.state === 'current') ?? null;
export const plannedOf = (classified) => classified.filter((v) => v.state === 'planned');
export const pastOf = (classified) => classified.filter((v) => v.state === 'past').reverse(); // newest first

// The schedule a new planned one copies: the one starting just before `startsOn`.
export function copySourceFor(classified, startsOn) {
  const before = classified.filter((v) => v.startsOn < startsOn);
  return before.length ? before[before.length - 1] : null;
}

// When a schedule stops (the day before the next one starts), or null if it's the last one.
export function endsBefore(classified, version) {
  const later = classified.filter((v) => v.startsOn > version.startsOn);
  return later.length ? later[0].startsOn : null;
}

// 'YYYY-MM-DD' + n days → 'YYYY-MM-DD' (calendar days, no time zone surprises).
export function addDays(dateText, days) {
  const d = new Date(`${dateText}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The weekday (1 Mon … 7 Sun) of a 'YYYY-MM-DD' date.
export function weekdayOf(dateText) {
  const day = new Date(`${dateText}T12:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  return day === 0 ? 7 : day;
}

// 'YYYY-MM-DD' → 'Mon, Jan 4, 2027' (or without the weekday / year).
export function formatDate(dateText, { weekday = true, year = true } = {}) {
  if (!dateText) return '';
  const d = new Date(`${dateText}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: weekday ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
    year: year ? 'numeric' : undefined,
  }).format(d);
}
