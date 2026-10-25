// useBbGradingSaves.js — the "save engine" of Black Belt grading: every grade, measured number and
// extra-points count typed on the Grading tab (contract 0025 §14.2; G 8, G 32).
// Why it exists: a grader enters many grades a minute, often on shaky mat-side or outdoor Wi-Fi.
// Each entry must show at once, save in the background (one save per cell), never be overwritten by
// the 15-second refresh while it's on its way, and — if it fails — stay on screen as "Not saved"
// and keep trying by itself. It is COPIED from Star's engine
// (src/screens/testing/star/grading/useStarGradingSaves.js, rulebook v0.512) and uses Star's pure,
// Node-checked rules for the hard parts (retryDecision, retryReady, refreshStep, answerStep in
// src/lib/star/gradingCore.js), so both sections behave the same. What is Black Belt's own:
//   * three kinds of cell: 'grade' (a letter; target = subject id), 'measured' (a number and its
//     way, kept as the text "<value>|<way>" so two values compare with ===; target = subject id) and
//     'count' (an extra-points count; target = the item's name);
//   * a measured number counts as a "grade" in every message, an extra count as a "count" (G 8);
//   * 'stale' means the candidate was moved to another Dan (the database refuses grades for the old
//     Dan): the engine reads that Dan's grid again — still there → a lock hiccup, retried; gone →
//     refused with a banner.
//
// Use it ONCE per cycle page (CyclePage via useBbGrading), so saves keep going while the grader
// switches day, Dan or tab.
//
//   const saves = useBbGradingSaves({ rows, loadedAt, reload, onNoAccess, showPageBanner, screenLocked, stillThere });
//   rows            EVERY loaded grid row, all Dans, in screen order; each row has `dan`
//   loadedAt        when that data's read STARTED (ms)
//   reload()        quiet reload of the grading data (may return a Promise)
//   onNoAccess()    the database says this sign-in is locked: lock the screen
//   showPageBanner(text)  the amber banner with ✕ only (answers that are never retried)
//   screenLocked    true while the lock screen shows (no retries then; they start again after the PIN)
//   stillThere(candidateId, dan) → Promise<'yes'|'no'|'no_access'|'error'>  (after 'stale')
//
// What it gives back:
//   cell(row, kind, target) → { value, state, note }  (value: this device's entry while unsaved, else
//       the database's; state: null | 'saving' | 'saved' | 'unsaved' | 'retrying')
//   resultFor(row)   the Result to show: a save's answer until newer data is loaded, else row.result
//   rowSave(rowId)   { grades, counts, retrying } — this row's Not saved cells
//   setGrade(row, subjectId, letter|null) · setMeasured(row, subjectId, value|null, way) ·
//   setCount(row, itemName, count|null) → false for a kept cell (nothing happens)
//   retryAll(), banner ({ kind:'failed'|'offline', text } | null), dismissBanner(), clearNote(row, kind, target)
//   unsaved          { grades, counts, names, people:[{ id, name, dan, items }], dans:[dan] }
//   online, announcement
// Nothing is kept in browser storage: closing the page forgets unsaved entries (the leave guard asks first).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { setCount as setCountCall, setGrade as setGradeCall, setMeasured as setMeasuredCall } from '../../../lib/blackBelt/gradingApi.js';
import { answerStep, refreshStep, retryDecision, retryReady } from '../../../lib/star/gradingCore.js';
import { measuredKey, parseMeasuredKey, resultItem, resultSubject } from './model.js';
import * as T from './text.js';

// Not saved cells are sent again this often, by themselves (Star's 10 seconds, G 1 "It also retries
// by itself every 10 seconds").
export const BB_GRADING_RETRY_MS = 10000;
// One quiet reload this long after the last save of a burst answered.
const RELOAD_AFTER_SAVES_MS = 500;

let nextToken = 1;
const browserOnline = () => (typeof navigator === 'undefined' || navigator.onLine !== false);

// A cell's key in the engine: "<candidateId>|<kind>|<target>". (A subject id never has "|"; an
// item name could, so the target is everything after the second "|".)
export const cellKey = (candidateId, kind, target) => `${candidateId}|${kind}|${target}`;
export function parseCellKey(key) {
  const [candidateId, kind, ...rest] = key.split('|');
  return { candidateId, kind, target: rest.join('|') };
}
// Messages count measured numbers as grades (G 8).
const wordKind = (kind) => (kind === 'count' ? 'count' : 'grade');

// A cell's value in a loaded row (undefined when the row doesn't have it).
export function serverValue(row, kind, target) {
  if (!row) return undefined;
  if (kind === 'count') {
    const item = resultItem(row.result, target);
    return item ? item.count ?? null : undefined;
  }
  const s = resultSubject(row.result, target);
  if (!s) return undefined;
  if (kind === 'measured') return measuredKey(s.measured, s.way);
  return s.measured !== null ? undefined : s.letter; // a measured subject is never a 'grade' cell
}
// Is that cell kept from an earlier cycle (never editable here)?
export function isKept(row, kind, target) {
  if (kind === 'count') return resultItem(row?.result, target)?.kept === true;
  return resultSubject(row?.result, target)?.kept === true;
}

// What a save answer means for the engine (Star's answerKind, with Black Belt's stale).
function answerKind(status) {
  if (status === 'ok') return 'saved';
  if (status === 'error') return 'retry';
  if (status === 'no_access') return 'lock';
  if (status === 'stale') return 'check_dan';
  return 'refused'; // kept / withdrawn / invalid / not_found / not_allowed …
}
function refusalText(status, kind, name) {
  const what = wordKind(kind);
  if (status === 'kept') return T.KEPT_REFUSED;
  if (status === 'stale') return T.movedElsewhere(name, what);
  if (status === 'withdrawn') return T.removedFromCycle(name, what);
  return T.reloadedAfter(what);
}

export function useBbGradingSaves({
  rows,
  loadedAt,
  reload,
  onNoAccess,
  showPageBanner,
  screenLocked,
  stillThere = async () => 'error',
  saveGrade = setGradeCall,
  saveMeasured = setMeasuredCall,
  saveCount = setCountCall,
}) {
  // overlayRef: { [cellKey]: { kind, candidateId, dan, target, value, wanted, base, latest, chosenAt,
  //                            state, inFlight, token, answeredAt, failedAt, checkedAt } }
  // resultsRef: { [candidateId]: { result, answeredAt } } — the newest result a save answered with
  // notesRef:   { [cellKey]: text } — "Changed on another device …"
  const overlayRef = useRef({});
  const resultsRef = useRef({});
  const notesRef = useRef({});
  const [, setTick] = useState(0);
  const redraw = useCallback(() => setTick((n) => n + 1), []);
  const [bannerHidden, setBannerHidden] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [online, setOnline] = useState(browserOnline);
  const noAccessRef = useRef(false);
  const retryAfterRefreshRef = useRef(false);
  const reloadTimerRef = useRef(null);

  const propsRef = useRef({ rows, reload, onNoAccess, showPageBanner, stillThere, saveGrade, saveMeasured, saveCount });
  useLayoutEffect(() => {
    propsRef.current = { rows, reload, onNoAccess, showPageBanner, stillThere, saveGrade, saveMeasured, saveCount };
  });

  // ----- Small helpers -----
  const rowOf = (id) => propsRef.current.rows.find((r) => r.id === id) ?? null;
  const nameOf = (id) => {
    const r = rowOf(id);
    return r ? `${r.firstName} ${r.lastName}` : '';
  };
  function setEntry(key, entry) {
    overlayRef.current = { ...overlayRef.current, [key]: entry };
  }
  function dropEntry(key) {
    const next = { ...overlayRef.current };
    delete next[key];
    overlayRef.current = next;
  }
  function setNote(key, text) {
    const next = { ...notesRef.current };
    if (text) next[key] = text;
    else delete next[key];
    notesRef.current = next;
  }
  const announce = useCallback((text) => {
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(text), 50);
  }, []);
  function scheduleReload() {
    window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      if (Object.values(overlayRef.current).some((e) => e.inFlight)) return;
      propsRef.current.reload();
    }, RELOAD_AFTER_SAVES_MS);
  }
  function refuse(key, status, kind, candidateId) {
    dropEntry(key);
    redraw();
    const p = propsRef.current;
    p.showPageBanner(refusalText(status, kind, nameOf(candidateId)));
    p.reload();
  }

  // ----- Sending one cell (at most one save per cell on its way) -----
  async function send(key, retrying = false) {
    const start = overlayRef.current[key];
    if (!start || start.inFlight) return;
    if (retrying) {
      // Compare with the latest refreshed value before sending again (Star proposal 4).
      const decision = retryDecision(start);
      if (decision === 'already_saved') {
        dropEntry(key);
        redraw();
        return;
      }
      if (decision === 'changed_elsewhere') {
        dropEntry(key);
        setNote(key, start.kind === 'count' ? T.S.CHANGED_ELSEWHERE_COUNT : T.S.CHANGED_ELSEWHERE_GRADE);
        redraw();
        return;
      }
    }
    const value = start.wanted;
    const { token, kind, candidateId, target, dan } = start;
    setEntry(key, { ...start, inFlight: true, state: retrying ? 'retrying' : 'saving' });
    redraw();

    const p = propsRef.current;
    let answer;
    if (kind === 'grade') answer = await p.saveGrade({ candidateId, dan, subjectId: target, letter: value });
    else if (kind === 'measured') {
      const m = parseMeasuredKey(value);
      answer = await p.saveMeasured({ candidateId, dan, subjectId: target, value: m.value, way: m.way });
    } else answer = await p.saveCount({ candidateId, dan, itemName: target, count: value });
    const status = answer?.status ?? 'error';
    let what = answerKind(status);
    if (what === 'check_dan') {
      // stale: is the candidate still in this Dan's grid? (moved to another Dan on another device)
      const there = await propsRef.current.stillThere(candidateId, dan);
      if (there === 'no') what = 'refused';
      else if (there === 'no_access') what = 'lock';
      else what = 'retry'; // still there (a rare lock hiccup) or couldn't tell: try again later
    }
    const now = overlayRef.current[key];
    if (!now || now.token !== token) return; // dropped meanwhile (row gone, refused …)

    // Changed again while this one was on its way: the newer entry is sent now (Star's answerStep).
    const step = answerStep(what, value, now.wanted);
    if (step === 'send_newer') {
      setEntry(key, { ...now, inFlight: false, state: 'saving' });
      redraw();
      send(key);
      return;
    }

    if (what === 'saved') {
      const answeredAt = Date.now();
      setEntry(key, { ...now, inFlight: false, state: 'saved', value, base: value, latest: undefined, answeredAt });
      if (answer.result) resultsRef.current = { ...resultsRef.current, [candidateId]: { result: answer.result, answeredAt } };
      redraw();
      announce(T.S.ANNOUNCE_SAVED);
      scheduleReload();
      return;
    }
    if (what === 'retry') {
      const wasUnsaved = retrying || now.state === 'retrying';
      setEntry(key, { ...now, inFlight: false, state: 'unsaved', failedAt: Date.now(), checkedAt: null, latest: undefined });
      if (!wasUnsaved) setBannerHidden(false); // a NEW failure brings the banner back
      redraw();
      announce(T.S.ANNOUNCE_NOT_SAVED);
      return;
    }
    if (what === 'lock') {
      setEntry(key, { ...now, inFlight: false, state: 'unsaved', failedAt: Date.now(), checkedAt: null, latest: undefined });
      noAccessRef.current = true;
      redraw();
      propsRef.current.onNoAccess();
      return;
    }
    refuse(key, status, kind, candidateId);
  }

  // One entry in one cell. Returns false when nothing happened (a kept cell, an unknown row).
  function choose(row, kind, target, value) {
    if (!row || isKept(row, kind, target)) return false;
    const key = cellKey(row.id, kind, target);
    setNote(key, null);
    const current = overlayRef.current[key];
    const chosenAt = Date.now();
    if (current) {
      setEntry(key, { ...current, value, wanted: value, chosenAt, latest: undefined, state: current.inFlight ? current.state : 'saving' });
    } else {
      setEntry(key, {
        kind, candidateId: row.id, dan: row.dan, target, value, wanted: value, base: serverValue(row, kind, target), latest: undefined,
        chosenAt, state: 'saving', inFlight: false, token: nextToken++, answeredAt: null,
      });
    }
    redraw();
    send(key);
    return true;
  }
  const setGrade = (row, subjectId, letter) => choose(row, 'grade', subjectId, letter ?? null);
  const setMeasured = (row, subjectId, value, way) => choose(row, 'measured', subjectId, measuredKey(value, way));
  const setCount = (row, itemName, count) => choose(row, 'count', itemName, count ?? null);

  // ----- Retrying (Star's two steps: a fresh read first, then only the cells it made ready) -----
  function sendReady() {
    let waiting = false;
    for (const [key, entry] of Object.entries(overlayRef.current)) {
      if (retryReady(entry)) send(key, true);
      else if (entry.state === 'unsaved' && !entry.inFlight) waiting = true;
    }
    return waiting;
  }
  function retryAll() {
    if (noAccessRef.current) return;
    if (!Object.values(overlayRef.current).some((e) => e.state === 'unsaved' && !e.inFlight)) return;
    retryAfterRefreshRef.current = true;
    Promise.resolve(propsRef.current.reload()).catch(() => {});
  }
  const retryRef = useRef(retryAll);
  const sendReadyRef = useRef(sendReady);
  useLayoutEffect(() => {
    retryRef.current = retryAll;
    sendReadyRef.current = sendReady;
  });

  // ----- Fresh data: keep the overlay honest (Star's refreshStep) -----
  useEffect(() => {
    if (!loadedAt) return;
    const byId = new Map(propsRef.current.rows.map((r) => [r.id, r]));
    const next = { ...overlayRef.current };
    for (const [key, e] of Object.entries(next)) {
      const latest = serverValue(byId.get(e.candidateId), e.kind, e.target);
      const step = refreshStep(e, loadedAt, latest);
      if (step === 'drop') delete next[key];
      else if (step === 'check') next[key] = { ...e, latest, checkedAt: loadedAt };
    }
    overlayRef.current = next;
    const results = { ...resultsRef.current };
    for (const [id, r] of Object.entries(results)) if (loadedAt > r.answeredAt) delete results[id];
    resultsRef.current = results;
    redraw();
    if (retryAfterRefreshRef.current && !noAccessRef.current) retryAfterRefreshRef.current = sendReadyRef.current();
  }, [loadedAt, redraw]);

  // Rows that left (withdrawn, moved to another Dan, deleted elsewhere) lose their cells — but only
  // once data has loaded (an empty list while loading isn't "everyone left").
  const rowsKey = rows.map((r) => r.id).join('|');
  useEffect(() => {
    if (!loadedAt) return;
    const ids = new Set(rowsKey.split('|'));
    const gone = Object.keys(overlayRef.current).filter((key) => !ids.has(parseCellKey(key).candidateId));
    if (gone.length === 0) return;
    const next = { ...overlayRef.current };
    for (const key of gone) delete next[key];
    overlayRef.current = next;
    redraw();
  }, [rowsKey, loadedAt, redraw]);

  // no_access stopped the retries: they start again once the screen is unlocked (G 32).
  const wasLockedRef = useRef(screenLocked);
  useEffect(() => {
    if (wasLockedRef.current && !screenLocked) {
      noAccessRef.current = false;
      retryRef.current();
    }
    wasLockedRef.current = screenLocked;
  }, [screenLocked]);

  // Online / offline. Back online: refresh first, then retry.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      retryRef.current();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ----- Counting (the banner, the leave question, the Dan switch's ⚠) -----
  const summary = unsavedSummary(overlayRef.current, rows);
  const unsavedTotal = summary.grades + summary.counts;

  const retryActive = unsavedTotal > 0 && !screenLocked && online;
  useEffect(() => {
    if (!retryActive) return undefined;
    const timer = window.setInterval(() => retryRef.current(), BB_GRADING_RETRY_MS);
    return () => window.clearInterval(timer);
  }, [retryActive]);

  useEffect(() => () => window.clearTimeout(reloadTimerRef.current), []);

  // ----- What the screens read -----
  function cell(row, kind, target) {
    const key = cellKey(row.id, kind, target);
    const e = overlayRef.current[key];
    return {
      value: e ? e.value : serverValue(row, kind, target) ?? null,
      state: e ? e.state : null,
      note: notesRef.current[key] ?? null,
    };
  }
  function resultFor(row) {
    return resultsRef.current[row.id]?.result ?? row.result ?? null;
  }
  function rowSave(rowId) {
    let grades = 0;
    let counts = 0;
    let retrying = false;
    for (const e of Object.values(overlayRef.current)) {
      if (e.candidateId !== rowId || (e.state !== 'unsaved' && e.state !== 'retrying')) continue;
      if (e.kind === 'count') counts += 1;
      else grades += 1;
      if (e.state === 'retrying') retrying = true;
    }
    return { grades, counts, retrying };
  }
  function clearNote(row, kind, target) {
    setNote(cellKey(row.id, kind, target), null);
    redraw();
  }

  let banner = null;
  if (unsavedTotal > 0 && !bannerHidden) {
    banner = online
      ? { kind: 'failed', text: T.S.saveFailedBanner(summary.grades, summary.counts, summary.names) }
      : { kind: 'offline', text: T.S.offlineBanner(summary.grades, summary.counts) };
  }

  return {
    cell,
    resultFor,
    rowSave,
    setGrade,
    setMeasured,
    setCount,
    retryAll,
    banner,
    dismissBanner: () => setBannerHidden(true),
    clearNote,
    unsaved: summary,
    online,
    announcement,
  };
}

// Sums the Not saved cells (measured numbers count as grades, G 8).
//   → { grades, counts, names, people: [{ id, name, dan, items }], dans }
export function unsavedSummary(entries, rows) {
  let grades = 0;
  let counts = 0;
  const byId = new Map();
  for (const [key, e] of Object.entries(entries ?? {})) {
    if (e.state !== 'unsaved' && e.state !== 'retrying') continue;
    const { candidateId, kind, target } = parseCellKey(key);
    if (kind === 'count') counts += 1;
    else grades += 1;
    if (!byId.has(candidateId)) byId.set(candidateId, []);
    byId.get(candidateId).push({ kind, target });
  }
  const people = [];
  for (const row of rows ?? []) {
    const cells = byId.get(row.id);
    if (!cells) continue;
    byId.delete(row.id);
    const order = (c) => {
      if (c.kind === 'count') return 1000 + (row.result?.extra?.items ?? []).findIndex((i) => i.name === c.target);
      return (row.result?.subjects ?? []).findIndex((s) => s.id === c.target);
    };
    const nameOfCell = (c) => (c.kind === 'count' ? c.target : row.subjectName?.(c.target) ?? c.target);
    const items = [...cells].sort((a, b) => order(a) - order(b)).map(nameOfCell);
    people.push({ id: row.id, name: `${row.firstName} ${row.lastName}`, dan: row.dan, items });
  }
  const dans = [...new Set(people.map((p) => p.dan))].sort((a, b) => a - b);
  return { grades, counts, names: people.map((p) => p.name), people, dans };
}
