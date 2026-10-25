// resultLines.js — the small PURE helpers of Black Belt testing's Results tab: which tag a row
// gets, its Total and "pass 275" words, its reason line, its sent line, the summary counts, where
// "Open grades" goes, and the blank values of Email result's message built from a row.
// Why it exists: ResultRows.jsx (the drawing), ResultsTab.jsx (the buttons), ResultsSheet.jsx (the
// paper) and the email preview all need the SAME answers, so they are worked out here once. The
// result itself is always the DATABASE's (bb_cycle_results — rulebook v0.938: the screen never
// works a result out); these helpers only turn it into words. No React, no database.
//
// Words used:
//   row     a Results row of gradingApi.loadResults: { id, firstName, lastName, locationCode, dan,
//           isMakeup, makeupOfCycleName, result (snake_case, contract §4.2), sent: { sent, matches },
//           hasEmail }
//   danObj  the row's Dan object of the cycle's rubric copy (loadResults' `rubrics`) — only used for
//           the subjects' NAMES (the result holds ids)
import { notFinishedWords, subjectNames, trimScaleText } from '../../../lib/blackBelt/grading.js';
import { canEmailResult } from '../../../lib/blackBelt/resultEmail.js';
import { todayInSchoolTime } from '../../../lib/testing/eventRules.js';
import * as T from './text.js';

const list = (v) => (Array.isArray(v) ? v : []);

// A timestamp → its school date 'YYYY-MM-DD' (null when it isn't one).
export function schoolDateOf(stamp) {
  const ms = typeof stamp === 'string' ? Date.parse(stamp) : Number.NaN;
  return Number.isFinite(ms) ? todayInSchoolTime(ms) : null;
}

// The summary line's counts (no_age counts as Not finished; Late counts as Not finished, G2).
export function summaryCounts(rows) {
  const n = (status) => rows.filter((r) => r.result?.status === status).length;
  return { candidates: rows.length, passed: n('passed'), makeup: n('makeup'), notFinished: n('not_finished') + n('no_age') };
}

// The tag (proposal 6): one per row.
export function resultTag(result) {
  if (result?.status === 'passed') return { tone: 'green', text: T.TAG_PASSED };
  if (result?.status === 'makeup') return { tone: 'amber', text: T.TAG_MAKEUP };
  return { tone: 'gray', text: T.TAG_NOT_FINISHED };
}

// Has nothing been graded or counted yet? (proposal 32: Total "—")
export function nothingYet(result) {
  if (!result || result.status === 'no_age') return true;
  const graded = result.counts?.graded ?? 0;
  const counted = list(result.extra?.items).some((i) => i.count !== null && i.count !== undefined);
  return graded === 0 && !counted;
}

// The Total cell: { number: '305.75' | '—', soFar } — "so far" while the result isn't complete.
export function totalParts(result) {
  if (nothingYet(result)) return { number: T.TOTAL_NONE, soFar: false };
  return { number: trimScaleText(result.total), soFar: result.complete !== true };
}

// The reason under the tag (proposals 6, 10). → { text, link: 'choose_subjects' | null }
//   isAdmin: only admins get the Choose subjects link (v0.210)
export function reasonOf(row, danObj, submissionsDue, isAdmin) {
  const r = row.result;
  if (!r) return { text: '', link: null };
  const names = (ids) => subjectNames(danObj, ids);
  if (r.status === 'passed') return { text: T.earnsDan(row.dan), link: null };
  if (r.status === 'no_age') return { text: T.NO_AGE, link: null };
  if (r.status === 'makeup') {
    const reasons = list(r.reasons);
    if (reasons.includes('d')) {
      const parts = [T.dIn(names(r.d_subjects))];
      if (reasons.includes('below')) parts.push(T.belowAfterD(r.pass_mark));
      parts.push(T.retests(names(r.needs)));
      return { text: parts.join(' · '), link: null };
    }
    if (r.choice_needed || list(r.needs).length === 0) {
      return { text: `${T.belowFirst(r.pass_mark)} · ${T.ADMIN_CHOOSES}`, link: isAdmin ? 'choose_subjects' : null };
    }
    return { text: `${T.belowFirst(r.pass_mark)} · ${T.retests(names(r.needs))}`, link: null };
  }
  return { text: notFinishedWords(r, danObj, submissionsDue), link: null };
}

// Can the row be emailed / marked as sent? (proposal 8; Q-G6 B: also an unfinished Make-up · D)
export const canEmail = (row) => canEmailResult(row?.result);

// The sent line (proposals 15, 16). today = the school's 'YYYY-MM-DD' (a send from an earlier
// year shows its year, as R04's "years later" frame).
// → { kind: 'not_sent' | 'sent' | 'changed', text } or null (nothing to say)
export function sentLine(row, today) {
  const s = row?.sent?.sent;
  if (!s) return canEmail(row) ? { kind: 'not_sent', text: T.NOT_SENT_YET } : null;
  const day = schoolDateOf(s.markedAt);
  if (!day) return null;
  if (row.sent.matches) {
    const who = String(s.markedByName ?? '').trim().split(/\s+/)[0] ?? '';
    const withYear = typeof today === 'string' && today.slice(0, 4) !== day.slice(0, 4);
    return { kind: 'sent', text: T.sentOn(day, who, withYear) };
  }
  return { kind: 'changed', text: T.earlierSent(s.resultStatus, day) };
}
// Is the row's CURRENT result sent? (⋯ shows Mark as sent while not, Undo Mark as sent while so.)
export const isSent = (row) => Boolean(row?.sent?.sent) && row.sent.matches === true;

// Where "Open grades" goes (proposal 17): the Grading tab on the row's Dan and the testing day of
// the first subject that needs attention (a D or a subject to retest, then a late hand-in, then a
// subject not graded yet), else the first testing day.
//   days: the cycle's days [{ id, date, parts }] in date order
// → dayKey: a day's id, 'other' (Other requirements) or null (the Grading tab's own choice)
export function openGradesDay(row, days) {
  const r = row?.result;
  const subjects = list(r?.subjects);
  const firstOf = (ids) => subjects.find((s) => list(ids).includes(s.id)) ?? null;
  const target = firstOf(r?.needs) ?? firstOf(r?.d_subjects) ?? firstOf(r?.late) ?? firstOf(r?.missing);
  const dayOfPart = (part) => (part === 'other' ? 'other' : list(days).find((d) => list(d.parts).includes(part))?.id ?? null);
  if (target) {
    const key = dayOfPart(target.part);
    if (key) return key;
  }
  return list(days)[0]?.id ?? null;
}

// Email result's message, built from the ROW at the click (so the copy happens inside the click,
// before any database wait — Safari refuses to copy later). The same keys as loadResultEmail's
// answer, so resultEmail.buildResultMessage fills it. kind = resultEmail.resultKind(row.result).
export function emailAnswerFromRow(row, danObj, cycleName, kind) {
  const r = row.result;
  return {
    kind,
    firstName: row.firstName,
    lastName: row.lastName,
    cycleName,
    dan: row.dan,
    total: r.total,
    passMark: r.pass_mark,
    reasons: list(r.reasons),
    needs: subjectNames(danObj, r.needs),
    dSubjects: subjectNames(danObj, r.d_subjects),
    resultKey: r.result_key,
  };
}
