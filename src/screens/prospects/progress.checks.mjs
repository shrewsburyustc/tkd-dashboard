// progress.checks.mjs — plain checks for progress.js (the progress track, rulebook v0.214).
// Why it exists: the List, the panel and the Board cards all trust progressOf() to say where a
// child is; these checks pin down each case. Runs in Node without a browser:
//   node src/screens/prospects/progress.checks.mjs
// Prints "ALL PROGRESS CHECKS PASSED", or stops at the first failed check.
import assert from 'node:assert/strict';
import { localDay, progressOf, progressWords } from './progress.js';

const TODAY = '2026-10-19';
const st = (builtin, kind = 'stage', name = builtin) => ({ builtin, kind, name });
const states = (r) => r.steps.map((s) => s.state).join(' ');
const base = { childFirstName: 'Ava', createdAt: '2026-10-13T14:00:00Z', followUpOn: null, joinedOn: null, checkedIn: false, askCame: false, booking: null };
const booking = (date, extra = {}) => ({ status: 'booked', date, start: '16:00:00', className: 'White', classRunning: true, ...extra });

// New, no class yet: next is "Class booked"
let r = progressOf(base, st('new'), TODAY);
assert.equal(states(r), 'done next todo todo');
assert.equal(r.line.text, 'Signed up Oct 13 · needs a class');
assert.equal(r.short.text, 'Needs a class');
assert.equal(r.next.text, 'Book a free class');

// Booked for a later day: next is "Came", "in 2 days"
r = progressOf({ ...base, booking: booking('2026-10-21') }, st('booked'), TODAY);
assert.equal(states(r), 'done done next todo');
assert.equal(r.steps[2].date, 'in 2 days');
assert.equal(r.line.text, 'Class Wed Oct 21 · 4:00');
assert.match(r.next.text, /^Check in on Wed Oct 21 when Ava arrives$/);

// The booked class no longer runs: amber everywhere
r = progressOf({ ...base, booking: booking('2026-10-26', { classRunning: false }) }, st('booked'), TODAY);
assert.equal(r.line.tone, 'warn');
assert.equal(r.short.text, 'Class cancelled — call');
assert.equal(r.next.warn, true);

// After the class, not checked in: "Did Ava come?"
r = progressOf({ ...base, askCame: true, booking: booking('2026-10-16') }, st('booked'), TODAY);
assert.equal(r.line.text, 'Did Ava come?');
assert.equal(r.line.tone, 'warn');

// Came: next is Joined
r = progressOf({ ...base, checkedIn: true, booking: booking('2026-10-15') }, st('came'), TODAY);
assert.equal(states(r), 'done done done next');
assert.equal(r.line.text, 'Came Oct 15 · ask to join');

// No-show: stopped (amber) at Came, and the class still counts as booked
r = progressOf({ ...base, booking: null }, st('no_show', 'exit', 'No-show'), TODAY);
assert.equal(states(r), 'done done stopped todo');
assert.equal(r.line.tone, 'warn');

// Not interested before booking: the gray stop sits on "Class booked"
r = progressOf(base, st('not_interested', 'exit', 'Not interested'), TODAY);
assert.equal(states(r), 'done off todo todo');
assert.equal(r.next, null);
assert.equal(r.line.text, 'Not interested');

// Joined: all four done, with the date
r = progressOf({ ...base, joinedOn: '2026-10-04' }, st('joined'), TODAY);
assert.equal(states(r), 'done done done done');
assert.equal(r.line.text, 'Joined Oct 4');
assert.equal(r.next, null);

// A due follow-up shows on a Board card unless something more urgent does
r = progressOf({ ...base, followUpOn: TODAY }, st(null, 'stage', 'Contacted'), TODAY);
assert.equal(r.short.text, 'Call today');
assert.equal(r.short.tone, 'warn');

// A sign-up at 9 pm in Massachusetts is that day, not the next (UTC) day
assert.equal(localDay('2026-10-19T01:30:00Z'), '2026-10-18');
assert.equal(localDay('2026-10-19'), '2026-10-19');

// A cancelled class gets no countdown
r = progressOf({ ...base, booking: booking('2026-10-26', { classRunning: false }) }, st('booked'), TODAY);
assert.equal(r.steps[2].date, '');

// Screen-reader words
assert.equal(progressWords(progressOf(base, st('new'), TODAY).steps), 'Signed up done; next: Class booked');

console.log('ALL PROGRESS CHECKS PASSED');
