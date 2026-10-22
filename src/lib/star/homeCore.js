// homeCore.js — the logic behind Home's Star "Today" cards (Star build phase 7, rulebook v0.154,
// v0.155, v0.515; contract 0006 §7 star_home_today).
// Why it exists: Home asks the database ONE question — "what Star testing is on today?" — and turns
// the answer into cards. That logic lives here, apart from React and the browser, so Node can check
// it (homeChecks.mjs). homeApi.js connects it to the app's one connection (supabase.js).
//
//   const api = createStarHomeApi(getClient);
//   api.loadStarHomeToday()
//     → { status:'ok', today:'YYYY-MM-DD', events:[HomeEvent], privates:[HomePrivate] }
//     or { status:'no_access' | 'stale' | 'invalid' } (the database said so)
//     or { status:'error', error }  (no connection, or an answer that doesn't look right)
//     It NEVER throws. star_home_today runs the 90-day signature clean-up as its last step, so it
//     WRITES: it must be a normal POST call — never rpc(…, { get: true }) (contract §7).
//   HomeEvent:   { id, name, startTime:'10:00', whereCode, whereName, counts:{ worcester, shrewsbury } }
//                counts = active candidates WITHOUT a private day, per school (the database counts;
//                Home never counts anything itself — proposal 4)
//   HomePrivate: { candidateId, eventId, eventName, time:'16:00', firstName, lastName, locationCode,
//                  dan, starsFrom, starsTo }
//
//   homeItems(answer, schoolCode)  → the cards to show, in order (pure)
//     schoolCode: 'worcester' | 'shrewsbury' for one school, null for Both (the location switcher).
//     Proposal 12: an event card always shows (the event takes both schools), with that school's
//     count on one school, the total on Both. Proposal 14: private cards only for students of that
//     school (the candidate's own school); Both shows all. The filtering happens HERE, in the browser,
//     on the same answer (contract §7) — switching school asks nothing new.
//     Proposal 6: by time; at the same time the event first, then private testings by last name.
//     → [{ kind:'event', key, eventId, name, time, whereCode, count, schoolCode }
//        | { kind:'private', key, eventId, candidateId, time, firstName, lastName, dan, starsFrom, starsTo }]
import { isIsoDate } from '../testing/eventRules.js';
import { startTimeMinutes, shortStartTime } from './starEventRules.js';

export const STAR_HOME_STATUSES = ['ok', 'no_access', 'stale', 'invalid', 'error'];
const SERVER_STATUSES = new Set(STAR_HOME_STATUSES.filter((s) => s !== 'error'));
export const SCHOOL_CODES = ['worcester', 'shrewsbury'];

const failure = (error) => ({ status: 'error', error });
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_PATTERN.test(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isTime = (v) => typeof v === 'string' && startTimeMinutes(v) !== null;

// One event of the answer → a HomeEvent, or null when something is missing or odd.
function toEvent(row) {
  if (!row || typeof row !== 'object') return null;
  const counts = row.counts ?? {};
  if (!isUuid(row.id) || !isText(row.name) || !isTime(row.start_time) || !SCHOOL_CODES.includes(row.where_code)) return null;
  if (!isCount(counts.worcester) || !isCount(counts.shrewsbury)) return null;
  return {
    id: row.id,
    name: row.name,
    startTime: shortStartTime(row.start_time), // '10:00'
    whereCode: row.where_code,
    whereName: typeof row.where_name === 'string' ? row.where_name : null,
    counts: { worcester: counts.worcester, shrewsbury: counts.shrewsbury },
  };
}

// One private testing of the answer → a HomePrivate, or null.
function toPrivate(row) {
  if (!row || typeof row !== 'object') return null;
  if (!isUuid(row.candidate_id) || !isUuid(row.event_id) || !isTime(row.private_time)) return null;
  if (!isText(row.first_name) || !isText(row.last_name) || !SCHOOL_CODES.includes(row.location_code)) return null;
  if (!Number.isInteger(row.dan) || !isCount(row.stars_from) || !isCount(row.stars_to)) return null;
  return {
    candidateId: row.candidate_id,
    eventId: row.event_id,
    eventName: typeof row.event_name === 'string' ? row.event_name : '',
    time: shortStartTime(row.private_time), // '16:00'
    firstName: row.first_name,
    lastName: row.last_name,
    locationCode: row.location_code,
    dan: row.dan,
    starsFrom: row.stars_from,
    starsTo: row.stars_to,
  };
}

// The whole 'ok' answer → { today, events, privates }, or null if any part doesn't look right
// (then the ask counts as failed and Home keeps what it showed — proposal 16).
export function toHomeAnswer(data) {
  if (!data || !isIsoDate(data.today) || !Array.isArray(data.events) || !Array.isArray(data.private)) return null;
  const events = data.events.map(toEvent);
  const privates = data.private.map(toPrivate);
  if (events.includes(null) || privates.includes(null)) return null;
  return { today: data.today, events, privates };
}

export function createStarHomeApi(getClient) {
  async function loadStarHomeToday() {
    try {
      const client = getClient();
      if (!client) return failure(new Error('No connection is set up'));
      // A normal POST (no { get: true }): the function writes (the signature clean-up).
      const { data, error } = await client.rpc('star_home_today');
      if (error) return failure(error);
      const status = data?.status;
      if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return failure(new Error('Unexpected answer from star_home_today'));
      if (status !== 'ok') return { status };
      const answer = toHomeAnswer(data);
      return answer ? { status: 'ok', ...answer } : failure(new Error('Unexpected answer from star_home_today'));
    } catch (error) {
      return failure(error);
    }
  }
  return { loadStarHomeToday };
}

// What Home does with an answer (proposal 16, Q2 = B):
//   'show'  an ok answer — show it (and Star has now answered at least once)
//   'lock'  no_access — lock the screen, as everywhere
//   'keep'  anything else (stale, invalid, a lost connection, an odd answer) — a failed ask: keep
//           what was shown, say nothing, try again on the next minute
export function answerAction(result) {
  if (result?.status === 'ok') return 'show';
  if (result?.status === 'no_access') return 'lock';
  return 'keep';
}

const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const lower = (text) => String(text ?? '').toLowerCase();

export function homeItems(answer, schoolCode = null) {
  if (!answer) return [];
  const events = (answer.events ?? []).map((e) => ({
    kind: 'event',
    key: `event-${e.id}`,
    eventId: e.id,
    name: e.name,
    time: e.startTime,
    whereCode: e.whereCode,
    count: schoolCode ? e.counts[schoolCode] ?? 0 : e.counts.worcester + e.counts.shrewsbury,
    schoolCode,
  }));
  const privates = (answer.privates ?? [])
    .filter((p) => !schoolCode || p.locationCode === schoolCode)
    .map((p) => ({
      kind: 'private',
      key: `private-${p.candidateId}`,
      eventId: p.eventId,
      candidateId: p.candidateId,
      time: p.time,
      firstName: p.firstName,
      lastName: p.lastName,
      dan: p.dan,
      starsFrom: p.starsFrom,
      starsTo: p.starsTo,
    }));
  // '09:30' < '10:00' as text too (always two digits), so plain text order is time order.
  return [...events, ...privates].sort((x, y) => cmp(x.time, y.time)
    || (x.kind === y.kind ? 0 : x.kind === 'event' ? -1 : 1)
    || (x.kind === 'event'
      ? cmp(x.name, y.name) || cmp(x.eventId, y.eventId)
      : cmp(lower(x.lastName), lower(y.lastName)) || cmp(lower(x.firstName), lower(y.firstName)) || cmp(x.candidateId, y.candidateId)));
}
