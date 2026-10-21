// resultsCore.js — the real work behind resultsApi.js (every database call of Star testing RESULTS)
// and the PURE rules the Results tab uses (build phase 6).
// Why it exists: resultsApi.js imports the app's one connection (supabase.js), which reads Vite
// settings that don't exist when Node runs the checks. Keeping the logic here — with the client
// passed in — lets star/resultsChecks.mjs run the exact same code against the preview database
// (mockStarCandidates.js + mockStarResults.js) without a browser. The screens import resultsApi.js
// (its header comment is the API).
//
// Contract 0006: §5.5 (the result and its result_key; the screens never work a result out, v0.158),
// §6.6 (star_mark_result_sent / star_undo_result_sent / star_results_csv), §7 (star_event_results with
// the sent state, star_candidate_detail). Contract 0023: star_result_texts + star_set_result_text.
// Every call returns a plain object with a `status` CODE and NEVER throws.
// Wording: resultsText.js. The email itself: resultEmail.js. The file: csv.js.
//
// PRIVACY (v0.160, §4.2): the Results list never holds a date of birth, an email or a payment.
// loadEmailAddress reads ONE candidate's detail at the click and passes on the address ONLY.
// The CSV (admins only, v0.144) is the one place DOB, email and payments leave the database; it is
// built in memory and handed to the browser as a file — never put into a web address.
import { toResult, toSent } from './candidatesCore.js';
import { todayInSchoolTime } from '../testing/eventRules.js';
import { trimEmail } from './emailRule.js';
import { totalText as gradingTotalText } from './gradingCore.js';
import { ordinal, resultTextProblem, RESULT_KINDS, canEmailResult } from './resultEmail.js';
import { toCsv } from './csv.js';
import * as T from './resultsText.js';

// Every status a results call can return. 'no_email' is the app's own (an empty address).
export const STAR_RESULTS_STATUSES = ['ok', 'no_access', 'not_allowed', 'invalid', 'not_found', 'withdrawn', 'stale', 'not_finished', 'duplicate_name', 'no_email', 'error'];
const SERVER_STATUSES = /*#__PURE__*/ (() => new Set(STAR_RESULTS_STATUSES.filter((s) => s !== 'error' && s !== 'no_email')))();

// Mark as sent's Undo: the toast shows 5 s (pausing under the pointer / focus, rule 8) but Undo goes
// away 9 s after the click at the LATEST — the database allows staff 10 s from marked_at (OPEN-16),
// the 1-second margin covers the round trip (proposal 20).
export const UNDO_TOAST_MS = 5000;
export const UNDO_CAP_MS = 9000;
// How long Undo may still show: ms left until the cap (0 = remove it now). clickedAtMs = the click.
export const undoTimeLeft = (clickedAtMs, nowMs) => Math.max(0, clickedAtMs + UNDO_CAP_MS - nowMs);

const failure = (error) => ({ status: 'error', error }); // error: for the console and checks only
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_PATTERN.test(v);
const isInt = (v) => Number.isInteger(v);
// A timestamp → its Massachusetts date 'YYYY-MM-DD' (contract §1.6). null when it isn't one.
export function schoolDateOf(stamp) {
  const ms = typeof stamp === 'string' ? Date.parse(stamp) : NaN;
  return Number.isFinite(ms) ? todayInSchoolTime(ms) : null;
}

// What the Results screens read from the roster view: no fee, DOB or email columns.
const RESULTS_ROSTER_COLUMNS = 'id, is_makeup, makeup_of_event_name';
// The grade rows' dates for the late-grade note (proposal 26): granted columns only.
const GRADE_DATE_COLUMNS = 'candidate_id, event_category_id, kept, updated_at';
// star_result_texts: everything granted except nothing private (there is nothing private in it).
const TEXT_COLUMNS = 'id, kind, body, version, updated_at, updated_by_name';
// Lists of ids are read in slices, so a web address never gets too long.
const ID_SLICE = 100;

// ----- Converting answers -----

// One Results row: the candidate's names + the result (§5.5) + the sent state + extras.
//   { id, firstName, lastName, locationCode, dan, starsFrom, starsTo, isMakeup, makeupOfEventName,
//     result, sent: { sent: { id, markedAt, markedByName, resultStatus } | null, matches },
//     grades: [{ eventCategoryId, gradedOn: 'YYYY-MM-DD', kept }] }   (gradedOn = Massachusetts date)
function toResultRow(r, roster, gradeRows) {
  const extra = roster.get(r.candidate_id) ?? {};
  return {
    id: r.candidate_id,
    firstName: r.first_name,
    lastName: r.last_name,
    locationCode: r.location_code,
    dan: r.dan,
    starsFrom: r.stars_from,
    starsTo: r.stars_to,
    isMakeup: extra.is_makeup === true,
    makeupOfEventName: extra.makeup_of_event_name ?? null,
    result: toResult(r),
    sent: toSent(r.sent),
    grades: (gradeRows.get(r.candidate_id) ?? []).map((g) => ({
      eventCategoryId: g.event_category_id, gradedOn: schoolDateOf(g.updated_at), kept: g.kept === true,
    })),
  };
}

// Builds the API around a client.
//   getClient() → the Supabase client (or a look-alike), or null
//   getToday()  → 'YYYY-MM-DD' at the school (the CSV's file name)
//   saveFile(fileName, text) → hands the CSV to the browser (csv.js saveCsvFile); null in the checks
export function createStarResultsApi(getClient, { getToday = () => todayInSchoolTime(new Date()), nowMs = () => Date.now(), saveFile = null } = {}) {
  async function callRpc(name, args, readOk) {
    try {
      const client = getClient();
      if (!client) return failure(new Error('No connection is set up'));
      const { data, error } = await client.rpc(name, args); // a normal POST (never { get: true }, §7)
      if (error) return failure(error);
      const status = data?.status;
      if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return unexpected(name);
      if (status !== 'ok') return { status };
      const result = readOk(data);
      return result ? { status: 'ok', ...result } : unexpected(name);
    } catch (error) {
      return failure(error);
    }
  }
  // A table read → { data } or a failure. filters: [[col, value]] (eq) or [[col, values, 'in']].
  async function readTable(table, columns, filters = []) {
    const client = getClient();
    if (!client) return failure(new Error('No connection is set up'));
    let q = client.from(table).select(columns);
    for (const [col, value, op] of filters) q = op === 'in' ? q.in(col, value) : q.eq(col, value);
    const res = await q;
    if (res?.error) return failure(res.error);
    if (!Array.isArray(res?.data)) return unexpected(table);
    return { status: 'ok', data: res.data };
  }
  // The same read for a long list of ids, in slices.
  async function readByIds(table, columns, col, ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += ID_SLICE) {
      const part = await readTable(table, columns, [[col, ids.slice(i, i + ID_SLICE), 'in']]);
      if (part.status !== 'ok') return part;
      out.push(...part.data);
    }
    return { status: 'ok', data: out };
  }
  const idProblem = (...ids) => (ids.some((v) => v === null || v === undefined) ? 'invalid' : ids.some((v) => !isUuid(v)) ? 'not_found' : null);

  // ----- Reading -----

  // The Results tab: every Dan asked for (the event copy's Dans), ONE star_event_results call per
  // Dan, plus the roster's make-up columns and the grade rows' dates (proposal 26). Private
  // candidates are INCLUDED (they show as "Testing privately", v0.150), unlike Grading.
  //   → { status:'ok', loadedAt, dans: { [dan]: { dan, passMark, maxScore, counts, rows:[ResultRow] } } }
  //     counts = the database's { candidates, passed, makeup, notFinished, testingPrivately } (both
  //     schools; a one-school device works its own out with summaryCounts(rows))
  async function loadResults(eventId, dans) {
    const loadedAt = nowMs();
    const bad = idProblem(eventId);
    if (bad) return { status: bad };
    if (!Array.isArray(dans) || !dans.every(isInt)) return { status: 'invalid' };
    try {
      const answers = await Promise.all(dans.map((dan) => callRpc('star_event_results', { p_event_id: eventId, p_dan: dan },
        (d) => (Array.isArray(d.rows) ? { data: d } : null))));
      const refused = answers.find((a) => a.status !== 'ok');
      if (refused) return refused; // no_access, not_found, invalid, error …
      const ids = answers.flatMap((a) => a.data.rows.map((r) => r.candidate_id));
      const [rosterRes, gradesRes] = await Promise.all([
        readTable('star_roster', RESULTS_ROSTER_COLUMNS, [['event_id', eventId]]),
        ids.length > 0 ? readByIds('star_grades', GRADE_DATE_COLUMNS, 'candidate_id', ids) : Promise.resolve({ status: 'ok', data: [] }),
      ]);
      if (rosterRes.status !== 'ok') return rosterRes;
      if (gradesRes.status !== 'ok') return gradesRes;
      const roster = new Map(rosterRes.data.map((r) => [r.id, r]));
      const gradeRows = new Map();
      for (const g of gradesRes.data) {
        if (!gradeRows.has(g.candidate_id)) gradeRows.set(g.candidate_id, []);
        gradeRows.get(g.candidate_id).push(g);
      }
      const out = {};
      answers.forEach(({ data: d }, i) => {
        out[dans[i]] = {
          dan: dans[i],
          passMark: Number(d.pass_mark),
          maxScore: Number(d.max_score),
          counts: {
            candidates: d.counts?.candidates ?? d.rows.length,
            passed: d.counts?.passed ?? 0,
            makeup: d.counts?.makeup ?? 0,
            notFinished: d.counts?.not_finished ?? 0,
            testingPrivately: d.counts?.testing_privately ?? 0,
          },
          rows: d.rows.map((r) => toResultRow(r, roster, gradeRows)),
        };
      });
      return { status: 'ok', loadedAt, dans: out };
    } catch (error) {
      return failure(error);
    }
  }

  // Email result, step 2 (R2): ONE candidate's email address, read at the click. Everything else
  // star_candidate_detail sends (date of birth, payments, signature state …) is dropped right here.
  //   → { status:'ok', email } · 'no_email' (blank: R4's safety-net banner) · not_found · no_access · error
  async function loadEmailAddress(candidateId) {
    const bad = idProblem(candidateId);
    if (bad) return { status: bad };
    const answer = await callRpc('star_candidate_detail', { p_candidate_id: candidateId },
      (d) => (d.candidate && typeof d.candidate === 'object' ? { email: d.candidate.email_for_results ?? null } : null));
    if (answer.status !== 'ok') return { status: answer.status, ...(answer.error ? { error: answer.error } : {}) };
    const email = typeof answer.email === 'string' ? trimEmail(answer.email) : '';
    return email ? { status: 'ok', email } : { status: 'no_email' };
  }

  // The three result email texts (R11; read with the column grants, contract 0023 §3).
  //   → { status:'ok', texts: { passed|makeup_d|makeup_below: { id, kind, body, version, updatedAt, updatedByName } } }
  //   A locked session sees no rows (RLS): that's 'no_access' for the screen.
  async function loadResultTexts() {
    try {
      const res = await readTable('star_result_texts', TEXT_COLUMNS);
      if (res.status !== 'ok') return res;
      if (res.data.length === 0) return { status: 'no_access' };
      const texts = {};
      for (const t of res.data) {
        if (!RESULT_KINDS.includes(t.kind)) continue;
        texts[t.kind] = { id: t.id, kind: t.kind, body: t.body, version: t.version, updatedAt: t.updated_at, updatedByName: t.updated_by_name };
      }
      return { status: 'ok', texts };
    } catch (error) {
      return failure(error);
    }
  }

  // ----- Writing -----

  // Mark as sent (proposal 20): sends the result_key the row SHOWED (row.result.resultKey).
  //   → { status:'ok', sentId, markedAt } · not_finished · stale (the result changed) · withdrawn ·
  //     not_found · invalid · no_access · error
  async function markSent({ candidateId, resultKey } = {}) {
    const bad = idProblem(candidateId);
    if (bad) return { status: bad };
    if (typeof resultKey !== 'string' || resultKey === '') return { status: 'invalid' };
    return callRpc('star_mark_result_sent', { p_candidate_id: candidateId, p_expected_result_key: resultKey },
      (d) => (isUuid(d.sent_id) ? { sentId: d.sent_id, markedAt: d.marked_at } : null));
  }

  // Undo Mark as sent (the toast's Undo, or an admin's ⋯ → Undo Mark as sent). sentId = row.sent.sent.id
  // or markSent's sentId.  → { status:'ok' } · not_allowed (staff after 10 s) · stale (already undone) ·
  //   not_found · invalid · no_access · error
  async function undoSent(sentId) {
    const bad = idProblem(sentId);
    if (bad) return { status: bad };
    return callRpc('star_undo_result_sent', { p_sent_id: sentId }, () => ({}));
  }

  // Admin: save one result email text (R11). expectedVersion = the version the dialog opened with.
  // The text is sent exactly as typed (no trimming). A text breaking the rules isn't sent at all.
  //   → { status:'ok', version, body } · not_allowed · invalid · stale · not_found · no_access · error
  async function setResultText({ kind, expectedVersion, body } = {}) {
    if (!isInt(expectedVersion) || typeof body !== 'string' || resultTextProblem(kind, body) !== null) return { status: 'invalid' };
    return callRpc('star_set_result_text', { p_kind: kind, p_expected_version: expectedVersion, p_body: body },
      (d) => (isInt(d.version) ? { version: d.version, body: typeof d.body === 'string' ? d.body : body } : null));
  }

  // Admin: Download CSV (R8) — the WHOLE event, both schools (Q2 = A). star_results_csv is volatile
  // (it logs the download), so this is a normal POST. ONE call: since migration 0023 each row
  // carries its own candidate_id, paid_on and sent.result_status, so nothing else is read.
  //   event: { id, name }  ·  dans: the event copy's Dans ([{ dan, label }]) for "1st Dan"
  //   → { status:'ok', fileName, rowCount, text } (and the file is saved when saveFile is set) ·
  //     not_allowed (staff) · not_found · invalid · no_access · error
  async function downloadCsv({ event, dans = [] } = {}) {
    const bad = idProblem(event?.id);
    if (bad) return { status: bad };
    try {
      const answer = await callRpc('star_results_csv', { p_event_id: event.id, p_dan: null },
        (d) => (Array.isArray(d.rows) ? { rows: d.rows } : null));
      if (answer.status !== 'ok') return answer;
      const lines = csvRows(answer.rows, { dans });
      const text = toCsv(T.CSV_HEADINGS, lines);
      const fileName = csvFileName(event.name, getToday());
      if (saveFile) saveFile(fileName, text);
      return { status: 'ok', fileName, rowCount: answer.rows.length, text };
    } catch (error) {
      return failure(error);
    }
  }

  return { loadResults, loadEmailAddress, loadResultTexts, markSent, undoSent, setResultText, downloadCsv };
}

// =====================================================================================
// Pure rules (no database). The Results tab uses these; resultsChecks.mjs checks them.
// =====================================================================================

// The summary counts of the rows on screen (a one-school device counts its school only, R10).
export function summaryCounts(rows) {
  const n = (status) => rows.filter((r) => r.result?.status === status).length;
  return { candidates: rows.length, passed: n('passed'), makeup: n('makeup'), notFinished: n('not_finished'), testingPrivately: n('testing_privately') };
}

// The Result column's tag: { tone: 'green'|'amber'|'gray', text, icon: 'calendar'|null }
export function resultTag(result) {
  switch (result?.status) {
    case 'passed': return { tone: 'green', text: T.TAG_PASSED, icon: null };
    case 'makeup': return { tone: 'amber', text: T.TAG_MAKEUP, icon: null };
    case 'testing_privately': return { tone: 'gray', text: T.TAG_TESTING_PRIVATELY, icon: 'calendar' };
    default: return { tone: 'gray', text: T.TAG_NOT_FINISHED, icon: null };
  }
}

// The late-grade note (proposal 26), or '' — for Passed / Make-up rows only.
//   day to compare with = the testing day, or a private student's own private day
//   newest judged grade (kept grades from an earlier event don't count) later than that day →
//     "Korean Terminology graded Dec 3" / "2 subjects graded Dec 3" (the newest date)
//   a private student with nothing later → "private testing Dec 1"
// Class counts have no date per count (the database keeps none), so they never show here.
export function lateNote(row, testingDate) {
  const r = row?.result;
  if (!r || (r.status !== 'passed' && r.status !== 'makeup')) return '';
  const day = r.private?.on ?? testingDate;
  const late = (row.grades ?? []).filter((g) => !g.kept && g.gradedOn && day && g.gradedOn > day);
  if (late.length === 0) return r.private?.on ? T.privateTestingOn(r.private.on) : '';
  const newest = late.reduce((m, g) => (g.gradedOn > m ? g.gradedOn : m), late[0].gradedOn);
  if (late.length === 1) {
    const name = r.subjects?.find((s) => s.eventCategoryId === late[0].eventCategoryId)?.name ?? '1 subject';
    return T.lateOne(name, newest);
  }
  return T.lateMany(late.length, newest);
}

// The reason under the tag (proposal 4), with the late-grade note (26) joined by " · ".
// → { text, link: 'choose_subjects'|null }   (link: an admin's "Choose subjects" after the text)
export function resultReason(row, { testingDate, isAdmin = false } = {}) {
  const r = row?.result;
  if (!r) return { text: '', link: null };
  const withLate = (text) => [text, lateNote(row, testingDate)].filter(Boolean).join(' · ');
  switch (r.status) {
    case 'passed':
      return { text: withLate(T.earnsStar(row.starsTo ?? r.starsTo)), link: null };
    case 'makeup': {
      const parts = [];
      const hasD = r.makeupReasons.includes('d');
      if (hasD) parts.push(T.dIn(r.dSubjects));
      if (r.makeupReasons.includes('below')) parts.push(hasD ? T.belowAfterD(r.passMark) : T.belowFirst(r.passMark));
      if (r.choiceNeeded) {
        parts.push(T.ADMIN_CHOOSES);
        return { text: withLate(parts.join(' · ')), link: isAdmin ? 'choose_subjects' : null };
      }
      parts.push(T.retests(r.needs));
      return { text: withLate(parts.join(' · ')), link: null };
    }
    case 'testing_privately':
      return { text: T.privateWhen(r.private?.on, r.private?.time), link: null };
    default: { // not_finished
      if (r.gradedCount === 0) return { text: T.NOTHING_GRADED_YET, link: null };
      const judged = r.subjects.filter((s) => !s.fromClassCount && s.grade === null).map((s) => s.name);
      const parts = [];
      if (judged.length > 2) parts.push(T.subjectsNotGradedYet(judged.length));
      else if (judged.length > 0) parts.push(T.notGradedYet(judged));
      if (r.subjects.some((s) => s.fromClassCount && s.grade === null)) parts.push(T.ASSISTANT_NOT_ENTERED);
      return { text: parts.join(' · '), link: null };
    }
  }
}

// The Total column: complete → "280"; a make-up's running total → "250 so far"; else "—"
// (Testing privately always "—", proposal 5).
export function resultsTotalText(result, isMakeup) {
  if (!result || result.status === 'testing_privately') return T.TOTAL_NONE;
  return gradingTotalText(result, isMakeup);
}

// "Jeffrey Berg" → "Jeffrey" (the sent line shows the first word: "Sent Nov 16 · Jeffrey", 20)
const firstWord = (name) => String(name ?? '').trim().split(/\s+/)[0] || '';

// The sent line (R1, 20, 25) — what the row says about the email, from the DATABASE's sent state.
// (The screen's own "Message copied … / Email opened — did you send it?" after a click is page memory.)
// → { kind: 'sent'|'changed'|'not_sent', text } or null (Not finished / Testing privately: no line)
export function sentLine(row) {
  const r = row?.result;
  if (!r || (r.status !== 'passed' && r.status !== 'makeup')) return null;
  const s = row.sent?.sent;
  if (!s) return { kind: 'not_sent', text: T.NOT_SENT_YET };
  const day = schoolDateOf(s.markedAt);
  if (row.sent.matches) return { kind: 'sent', text: T.sentOn(day, firstWord(s.markedByName)) };
  return { kind: 'changed', text: T.earlierSent(s.resultStatus, day) };
}
// Is the row's current result sent? (⋯ shows Mark as sent while not, Undo Mark as sent while so.)
export const isSent = (row) => sentLine(row)?.kind === 'sent';
// Can the row be marked as sent / emailed? (Passed and Make-up rows that say what to work on, 7)
export const canMarkSent = (row) => canEmailResult(row?.result);

// ----- The CSV (proposals 31, 32) -----

// "Fall 2026 Star Testing", "2026-11-16" → "Fall-2026-Star-Testing-results-2026-11-16.csv": the event
// name with hyphens (characters a file name can't hold are left out), "results", the download day.
export function csvFileName(eventName, today) {
  const base = String(eventName ?? '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return `${base || 'Star-testing'}-results-${today}.csv`;
}

const numberText = (v) => (v === null || v === undefined || v === '' ? '' : String(v));

// The CSV's rows: one per row of star_results_csv (active candidates, belt order), the 15 columns of
// v0.144 in order (T.CSV_HEADINGS). Values as proposal 32:
//   Dan "1st Dan" · Name "Jordan Kim" · School · Stars from / to (numbers) · Date of birth (blank if
//   none) · Email · Paying by Cash / Check / Card / No fee (a make-up) · Paid = the newest payment that
//   still counts (the row's paid_on, 0023: unreversed payments only; refunds never change it), blank
//   when nothing counted is paid · the two counts · Total (the plain number; blank while Testing
//   privately or nothing is graded) · Result · Needs (a make-up's subjects, or "Admin chooses") ·
//   Result sent "2026-11-16 Staff" / "Not sent yet (Make-up sent 2026-11-16)" / "Not sent yet".
// Every value comes from the row itself (migration 0023 section 7 added candidate_id, paid_on and
//   sent.result_status), so two candidates who look the same each keep their own paid date and send.
export function csvRows(rows, { dans = [] } = {}) {
  const label = new Map(dans.map((d) => [d.dan, d.label]));
  return rows.map((row) => {
    const status = row.result_status;
    const isMakeup = row.is_makeup === true;
    // Result sent
    let sent = '';
    const s = row.sent;
    if (s && s.marked_at) {
      const day = schoolDateOf(s.marked_at);
      if (s.matches) sent = `${day} ${s.marked_by_name ?? ''}`.trim();
      else sent = T.csvEarlierSent(s.result_status ?? null, day);
    } else if (status === 'passed' || status === 'makeup') sent = T.NOT_SENT_YET;
    const total = status === 'testing_privately' || (status === 'not_finished' && Number(row.total) === 0) ? '' : numberText(row.total);
    let needs = '';
    if (status === 'makeup') needs = (row.needs ?? []).length > 0 ? row.needs.join(', ') : T.ADMIN_CHOOSES_CSV;
    return [
      label.get(row.dan) ?? `${ordinal(row.dan)} Dan`,
      `${row.first_name} ${row.last_name}`,
      T.schoolName(row.location_code),
      numberText(row.stars_from),
      numberText(row.stars_to),
      row.date_of_birth ?? '',
      row.email_for_results ?? '',
      isMakeup ? T.NO_FEE : T.PAYING_BY_WORD[row.paying_by] ?? '',
      row.paid && row.paid_on ? row.paid_on : '',
      numberText(row.classes_attended),
      numberText(row.assistant_classes),
      total,
      T.STATUS_WORD[status] ?? '',
      needs,
      sent,
    ];
  });
}
