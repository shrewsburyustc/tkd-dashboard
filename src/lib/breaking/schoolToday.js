// schoolToday.js — "today" at the school, and a few date helpers the Board breaking dialogs share.
// Why it exists: the Add student box needs to know whether today is the event day (the event-day price), and
// the refund / payment boxes need today as the newest allowed date. In preview mode the "Today" can be moved
// with __tkdPreview.setToday('YYYY-MM-DD'), exactly as Camps does (campToday in lib/camps/campsApi.js), so this
// file reads the same storage key. Vite replaces isPreview with false in the real build, so that branch vanishes.
import { isPreview } from './../supabase.js';
import { readStorage } from './../storage.js';
import { PREVIEW_TODAY_KEY, isIsoDate, todayInSchoolTime } from './../testing/eventRules.js';

export { isIsoDate };

// Today in Massachusetts, 'YYYY-MM-DD' (or the date the preview pretends).
export function schoolToday() {
  if (isPreview) {
    const pretend = readStorage(PREVIEW_TODAY_KEY);
    if (isIsoDate(pretend)) return pretend;
  }
  return todayInSchoolTime(new Date());
}

// The Year list of a date calendar: every year from the earliest to the latest of today's year and the given
// dates (non-dates are skipped). yearsAround('2026-11-12', ['2025-03-01']) → [2025, 2026]
export function yearsAround(today, dates = []) {
  const found = [today, ...dates].filter(isIsoDate).map((iso) => Number(iso.slice(0, 4)));
  if (found.length === 0) return [];
  const years = [];
  for (let year = Math.min(...found); year <= Math.max(...found); year += 1) years.push(year);
  return years;
}
