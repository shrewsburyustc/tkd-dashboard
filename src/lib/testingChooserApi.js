// testingChooserApi.js — the reads the Testing chooser page makes: Color Belt's and Star's next event,
// and Black Belt's next testing day.
// Why it exists: the chooser's "Color belt testing" row shows its next event (rulebook v0.177):
//   one school:  that school's next event        → "Next: Jan 16 · Worcester"
//   Both:        the earliest one of either school → "Next: Jan 9 · Shrewsbury"
//   none coming: no line at all (v0.59 — no filler text)
// It reads only three columns of Color Belt's events table (no names, no students, nothing
// private) — the same table and the same permission check (row-level security) the Events tab uses.
//
// Like the other api files it NEVER throws, and answers with a status:
//   { status: 'ok', next: { date: 'YYYY-MM-DD', school } }   next is null when none is coming
//   { status: 'no_access' }   this sign-in is locked on the database side: the screen should lock
//                             too (the house "no access" path). A locked sign-in gets an EMPTY list
//                             from the database, which would look like "no events" — so, like
//                             loadRubrics, has_data_access is asked at the same time to tell them apart.
//   { status: 'error' }       offline or an unexpected answer: the chooser just shows no line
import { supabase } from './supabase.js';
import { LOCATION_CODE, LOCATION_NAME } from './device.js';
import { schoolToday } from './testing/eventsApi.js';

const ERROR = { status: 'error' };

// location: the top-bar switcher's value ('Worcester' | 'Shrewsbury' | 'Both').
export async function loadNextColorBeltEvent(location) {
  try {
    if (!supabase) return ERROR;
    const codes = location === 'Both' ? Object.values(LOCATION_CODE) : [LOCATION_CODE[location]].filter(Boolean);
    if (codes.length === 0) return ERROR;
    const [eventRes, accessRes] = await Promise.all([
      supabase
        .from('testing_events')
        .select('id, location_code, testing_date')
        .in('location_code', codes)
        .order('testing_date', { ascending: true }),
      supabase.rpc('has_data_access'),
    ]);
    // "No access" wins: never treat a locked sign-in's empty list as "no events".
    if (!accessRes?.error && accessRes?.data === false) return { status: 'no_access' };
    if (accessRes?.error || accessRes?.data !== true) return ERROR;
    if (eventRes?.error || !Array.isArray(eventRes?.data)) return ERROR;
    // "Upcoming" = on or after today at the school (an event happening today still counts).
    // Dates are 'YYYY-MM-DD' text, so comparing them as text puts them in date order.
    const today = schoolToday();
    const next = eventRes.data
      .filter((row) => typeof row.testing_date === 'string' && row.testing_date >= today && codes.includes(row.location_code))
      .sort((a, b) => (a.testing_date < b.testing_date ? -1 : a.testing_date > b.testing_date ? 1 : 0))[0];
    return { status: 'ok', next: next ? { date: next.testing_date, school: LOCATION_NAME[next.location_code] ?? '' } : null };
  } catch {
    return ERROR;
  }
}

// Star testing's next event, for the chooser's "Star testing" row (Star phase 2, v0.177: Star's row
// has no line until it has events). Star events cover BOTH schools (v0.58), so the location
// switcher doesn't filter them: the next one is the earliest Star event on or after today.
// "Where" (the place it is held, information only, v0.87) comes with it, for the screen to word.
// Reads three columns of star_events (no names, nothing about candidates), with the same
// has_data_access check as above.
//   { status: 'ok', next: { date: 'YYYY-MM-DD', whereCode, where: 'Shrewsbury' } }   next null when none
//   { status: 'no_access' } · { status: 'error' }
export async function loadNextStarEvent() {
  try {
    if (!supabase) return ERROR;
    const [eventRes, accessRes] = await Promise.all([
      supabase.from('star_events').select('id, testing_date, where_code').order('testing_date', { ascending: true }),
      supabase.rpc('has_data_access'),
    ]);
    if (!accessRes?.error && accessRes?.data === false) return { status: 'no_access' };
    if (accessRes?.error || accessRes?.data !== true) return ERROR;
    if (eventRes?.error || !Array.isArray(eventRes?.data)) return ERROR;
    const today = schoolToday();
    const next = eventRes.data
      .filter((row) => typeof row.testing_date === 'string' && row.testing_date >= today)
      .sort((a, b) => (a.testing_date < b.testing_date ? -1 : a.testing_date > b.testing_date ? 1 : 0))[0];
    return {
      status: 'ok',
      next: next ? { date: next.testing_date, whereCode: next.where_code, where: LOCATION_NAME[next.where_code] ?? '' } : null,
    };
  } catch {
    return ERROR;
  }
}

// Black Belt testing's next testing day, for the chooser's "Black Belt testing" row (C2, rulebook
// v0.937): the earliest testing day on or after today of ANY cycle (registration open or not). A
// cycle is for both schools, so the switcher doesn't filter it. Reads one column of bb_cycle_days
// (dates only, nothing about candidates; the database sends only the days from today on),
// with the same has_data_access check as above. It lives here, not in lib/blackBelt/api.js, so
// the chooser doesn't download Black Belt's whole data layer.
//   { status: 'ok', next: { date: 'YYYY-MM-DD' } }   next null when none is coming
//   { status: 'no_access' } · { status: 'error' }
export async function loadNextBlackBeltDay() {
  try {
    if (!supabase) return ERROR;
    const today = schoolToday();
    const [dayRes, accessRes] = await Promise.all([
      supabase.from('bb_cycle_days').select('day_date').gte('day_date', today).order('day_date', { ascending: true }),
      supabase.rpc('has_data_access'),
    ]);
    if (!accessRes?.error && accessRes?.data === false) return { status: 'no_access' };
    if (accessRes?.error || accessRes?.data !== true) return ERROR;
    if (dayRes?.error || !Array.isArray(dayRes?.data)) return ERROR;
    const next = dayRes.data
      .map((row) => row.day_date)
      .filter((date) => typeof date === 'string' && date >= today)
      .sort()[0];
    return { status: 'ok', next: next ? { date: next } : null };
  } catch {
    return ERROR;
  }
}
