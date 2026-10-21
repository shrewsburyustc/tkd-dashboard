// followUps.js — what counts as a prospect's follow-up, in ONE place (rulebook v0.612, v0.615).
// Why it exists: the Prospects screen ("Follow up today") and the Calendar (follow-up chips) must
// never disagree about which children still need a call. Both import these plain functions.
//
// Rules:
//   - A Joined or Not interested child is finished: an old follow-up date left on it never counts
//     (marking a child Joined doesn't clear the date in the database).
//   - Everyone else with a follow-up date has an open follow-up on that date.
//   - A child is named "Ava R.": first name + the parent's last initial (v0.245) — never the
//     parent's full name, phone or age.
// Dates are 'YYYY-MM-DD' text (Massachusetts dates).

const FINISHED = ['joined', 'not_interested'];

// True for the statuses whose children are done (no follow-ups, not "due").
export const isFinished = (builtin) => FINISHED.includes(builtin ?? '');

// "Rivera" → "R" (the parent's last initial); one-word names give ''.
export function lastInitial(name) {
  const parts = String(name ?? '').trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : '';
}

// The date of this child's open follow-up, or null.
export function openFollowUpOn(p, builtin) {
  if (isFinished(builtin)) return null;
  return p.followUpOn || null;
}

// Is this prospect in Prospects' "Follow up today" list?
export function isDueToday(p, builtin, today) {
  if (isFinished(builtin)) return false;
  const followUp = openFollowUpOn(p, builtin);
  return Boolean(followUp && followUp <= today) || builtin === 'new' || p.askCame
    || Boolean(p.booking && p.booking.status === 'booked' && !p.booking.classRunning);
}

// For the Calendar: one school's prospect list → only the open follow-ups, with only what the
// Calendar shows: [{ id, code, childFirstName, initial, followUpOn }]. Everything else in the
// list answer (booking, family, sign-up date …) is dropped here on purpose.
export function calendarFollowUps(list, statuses, code) {
  const builtinOf = new Map((statuses ?? []).map((s) => [s.id, s.builtin]));
  const out = [];
  for (const p of list ?? []) {
    const on = openFollowUpOn(p, builtinOf.get(p.statusId));
    if (on) out.push({ id: p.id, code, childFirstName: p.childFirstName, initial: lastInitial(p.parentName), followUpOn: on });
  }
  return out;
}
