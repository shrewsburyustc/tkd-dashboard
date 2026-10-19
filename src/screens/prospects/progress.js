// progress.js — where one child is on the way to joining (rulebook v0.214, mockup screens 11 and 13).
// Why it exists: staff asked to SEE the progression. Every child has the same four steps:
//   Signed up → Class booked → Came → Joined
// Each step is 'done' (green), 'next' (blue ring), 'todo' (gray), 'stopped' (amber: a No-show at
// Came) or 'off' (gray filled: the child left at a side exit such as Not interested).
// Nothing new is stored: the steps come from what the list already knows — the sign-up date, the
// free-class booking, the check-in and the Joined date. The List rows, the panel's big track and
// the Board cards' one line all come from this one function, so they never disagree.
import { addDays } from '../../lib/schedule/versions.js';
import { formatTime, parseTime } from '../../lib/schedule/time.js';
import * as T from './text.js';

export const STEP_NAMES = [T.STEP_SIGNED, T.STEP_BOOKED, T.STEP_CAME, T.STEP_JOINED];

// The day something happened, in Massachusetts (a sign-up at 9 pm is still that day, not the
// next day as the UTC time would say). Plain dates ("2026-10-19") are kept as they are.
const NY_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
export function localDay(value) {
  const v = String(value ?? '');
  if (v.length <= 10) return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? v.slice(0, 10) : NY_DAY.format(new Date(t));
}

// "today", "tomorrow", "in 3 days" (only for dates still ahead)
function inDays(date, today) {
  if (date === today) return T.TODAY_WORD;
  if (date === addDays(today, 1)) return T.TOMORROW_WORD;
  const n = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  return n > 1 ? T.inNDays(n) : null;
}

// p: a list item or the panel's prospect (both have booking, statusId, joinedOn, childFirstName).
// status: the child's status ({ kind, builtin, name }). Returns:
//   steps: [{ state, date }] for the four steps (date is words, or '')
//   line:  { text, tone } — one line for the List (tone 'next' = blue, 'warn' = amber, '' = plain)
//   short: { text, tone } — the shorter line for a Board card (the column already says the stage)
//   next:  { text, warn } | null — the panel's "Next:" line
export function progressOf(p, status, today) {
  const builtin = status?.builtin ?? null;
  const exit = status?.kind === 'exit';
  const b = p.booking;
  const booked = Boolean(b && b.status === 'booked');
  const checkedIn = p.checkedIn === true || Boolean(p.checkedInAt);
  const joined = builtin === 'joined';
  const signedOn = localDay(p.signedUpAt ?? p.createdAt);
  const name = p.childFirstName;

  // a No-show or a check-in means a class was booked, even if that booking has since changed
  const done = [true, booked || checkedIn || joined || ['came', 'no_show'].includes(builtin ?? ''), checkedIn || builtin === 'came' || joined, joined];
  const steps = done.map((d) => ({ state: d ? 'done' : 'todo', date: '' }));
  steps[0].date = signedOn ? T.shortDate(signedOn).slice(4) : '';
  if (b && booked) steps[1].date = `${T.shortDate(b.date)} · ${formatTime(parseTime(b.start))}`;
  if (joined && p.joinedOn) steps[3].date = T.shortDate(p.joinedOn).slice(4);

  const firstOpen = done.indexOf(false);
  if (builtin === 'no_show') {
    steps[2] = { state: 'stopped', date: b ? T.shortDate(b.date).slice(4) : '' };
  } else if (exit && firstOpen >= 0) {
    steps[firstOpen] = { state: 'off', date: status.name };
  } else if (firstOpen >= 0) {
    steps[firstOpen].state = 'next';
    if (firstOpen === 2 && booked && b.classRunning && b.date >= today) steps[2].date = inDays(b.date, today) ?? '';
  }
  if (checkedIn && b) steps[2].date = T.shortDate(b.date).slice(4);

  // The one line (most urgent first)
  let line;
  let short;
  let next = null;
  if (joined) {
    line = { text: p.joinedOn ? T.joinedLine(p.joinedOn) : T.STEP_JOINED, tone: '' };
    short = line;
  } else if (builtin === 'no_show') {
    line = { text: b ? T.noShowLine(b.date) : T.NO_SHOW_CALL, tone: 'warn' };
    short = line;
    next = { text: T.NEXT_NO_SHOW, warn: true };
  } else if (exit) {
    line = { text: status.name, tone: '' };
    short = line;
  } else if (p.askCame && !checkedIn) {
    line = { text: T.askCame(name), tone: 'warn' };
    short = line;
    next = { text: T.nextAskCame(name), warn: true };
  } else if (checkedIn || builtin === 'came') {
    line = { text: b ? T.cameAskLine(b.date) : T.ASK_TO_JOIN, tone: 'next' };
    short = line;
    next = { text: T.NEXT_ASK_JOIN, warn: false };
  } else if (booked && !b.classRunning) {
    line = { text: `${T.classShort(b)} · ${T.CLASS_GONE_SHORT}`, tone: 'warn' };
    short = { text: T.CLASS_GONE_CARD, tone: 'warn' };
    next = { text: T.NEXT_CLASS_GONE, warn: true };
  } else if (booked) {
    line = { text: b.date === today ? T.classTodayLine(b) : T.classShort(b), tone: b.date === today ? 'next' : '' };
    short = { text: b.date === today ? T.classTodayLine(b) : T.freeClassLine(b), tone: line.tone };
    next = { text: b.date === today ? T.nextCheckInToday(name, b) : T.nextCheckIn(name, b), warn: false };
  } else {
    line = { text: signedOn ? T.needsClassLine(signedOn) : T.NEEDS_CLASS, tone: 'next' };
    short = { text: T.NEEDS_CLASS, tone: 'next' };
    next = { text: T.NEXT_BOOK, warn: false };
  }

  // A Board card has one line: a due follow-up shows when nothing more urgent does
  const follow = T.followUpText(p.followUpOn, today);
  if (follow?.warn && short.tone !== 'warn' && !joined && !exit) short = { text: T.followCard(follow.text), tone: 'warn' };

  return { steps, line, short, next };
}

// For screen readers: "Signed up, Class booked done; next: Came"
export function progressWords(steps) {
  const doneNames = steps.map((s, i) => (s.state === 'done' ? STEP_NAMES[i] : null)).filter(Boolean);
  const nextI = steps.findIndex((s) => s.state === 'next');
  const stopI = steps.findIndex((s) => s.state === 'stopped' || s.state === 'off');
  const parts = [];
  if (doneNames.length) parts.push(T.doneWords(doneNames));
  if (nextI >= 0) parts.push(T.nextWords(STEP_NAMES[nextI]));
  if (stopI >= 0) parts.push(T.stoppedWords(STEP_NAMES[stopI]));
  return parts.join('; ');
}
