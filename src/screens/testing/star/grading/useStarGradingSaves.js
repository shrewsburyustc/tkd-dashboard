// useStarGradingSaves.js — the "save engine" of Star testing grading: the Grading grid and the private
// grading page (build phase 5; rulebook v0.512 proposals 1–12, v0.165 last save wins, v0.158).
// Why it exists: a grader picks a grade many times a minute, often on shaky mat-side Wi-Fi. Each
// choice must show at once, save in the background (one save per cell), never be overwritten by the
// 15-second refresh while it's on its way, and — if it fails — stay on screen as "Not saved" and
// keep trying by itself. That logic is the same for every cell, so it lives here once. It is copied
// in pattern from Color Belt's live engine (src/screens/testing/event/useGradingSaves.js, v0.192);
// the rules that are pure (and checked in Node) live in src/lib/star/gradingCore.js.
//
// Use it ONCE per event page (not per tab or per Dan), so saves keep going while the grader switches
// Dan, opens the Candidates tab or a private grading page of the same event (proposal 8).
//
//   const saves = useStarGradingSaves({ rows, loadedAt, reload, onNoAccess, showPageBanner, screenLocked });
//   rows            EVERY row the page has loaded, in screen order (Dan, then belt order): all Dans'
//                   gradingApi.loadGrading rows (+ the private page's row while it is open)
//   loadedAt        the `loadedAt` of that data (ms, when the read started)
//   reload()        quiet reload of the grading data (may return a Promise)
//   onNoAccess()    the database says this sign-in is locked: lock the screen
//   showPageBanner(text)  the page's amber banner with ✕ only (answers that are never retried)
//   screenLocked    true while the lock screen shows (no retries then; they start again after the PIN)
//   saveGrade / saveCount / lookupDan   optional: gradingApi's setGrade / setCount / loadCandidateDan
//
// What it gives back:
//   cell(row, kind, target) → { value, state, note }
//       kind 'grade' (target = eventCategoryId) or 'count' (target 'classesAttended'|'assistantClasses');
//       value: what the cell shows (this device's choice while unsaved, else the database's);
//       state: null | 'saving' | 'saved' | 'unsaved' (amber ⚠) | 'retrying' (still amber; the Result reads
//       "Saving…"); note: null or the gray "Changed on another device — your grade wasn't saved."
//   resultFor(row)   the Result to show: a save's answer until newer data is loaded, else row.result
//   rowSave(rowId)   { grades, counts, retrying } — this row's Not saved cells (for resultTag's `save`)
//   chooseGrade(row, eventCategoryId, grade|null) → false for a kept cell (open the kept note instead).
//                    Pass toggleGrade(current, chosen) so choosing the same grade again clears it.
//   setCount(row, field, value|null)
//   retryAll()       the banner's Retry (and the timer's): a fresh read first, then every Not saved
//                    cell that read made ready (never a retry on data older than the failure)
//   banner           null | { kind:'failed'|'offline', text }  (Retry + ✕; dismissBanner() hides it until
//                    the next NEW failure; the amber cells keep retrying)
//   dismissBanner(), clearNote(row, kind, target)
//   unsaved          { grades, counts, names, people:[{ id, name, dan, items }], dans:[dan] } — `dans` puts the
//                    amber ⚠ on the Dan switch; grades + counts > 0 → the leave guard asks first, with
//                    gradingText.leaveTitle(grades, counts) / leaveBody(people)
//   online           what the browser says (the 15-second refresh waits while false)
//   announcement     text for a polite live region ("Saved" / "Not saved")
// Nothing is kept in browser storage (v0.188): closing the page forgets unsaved choices (the leave
// guard asks first; reload / close tab get the browser's own "Leave site?").
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { setGrade, setCount as setCountCall, loadCandidateDan } from '../../../../lib/star/gradingApi.js';
import {
  answerKind, answerStep, cellKey, keptSubject, parseCellKey, refreshStep, refusalText, retryDecision, retryReady,
  serverValue, unsavedSummary,
} from '../../../../lib/star/gradingCore.js';
import * as T from '../../../../lib/star/gradingText.js';

// Not saved cells are sent again this often, by themselves (proposal 4, Color Belt v0.192).
export const STAR_GRADING_RETRY_MS = 10000;
// One quiet reload this long after the last save of a burst answered.
const RELOAD_AFTER_SAVES_MS = 500;

let nextToken = 1;
const browserOnline = () => (typeof navigator === 'undefined' || navigator.onLine !== false);
const defaultSubjectName = (row, id) => row.result?.subjects?.find((s) => s.eventCategoryId === id)?.name ?? '';

export function useStarGradingSaves({
  rows,
  loadedAt,
  reload,
  onNoAccess,
  showPageBanner,
  screenLocked,
  saveGrade = setGrade,
  saveCount = setCountCall,
  lookupDan = loadCandidateDan,
}) {
  // The overlay lives in refs (so the async answers always see the newest one); `tick` only makes
  // React draw again after a change.
  //   overlayRef: { [cellKey]: { kind, candidateId, target, value, wanted, base, latest, chosenAt,
  //                              state, inFlight, token, answeredAt, failedAt, checkedAt } }
  //     failedAt: when its save last failed · checkedAt: when the newest read that set `latest` started
  //     (a retry waits until checkedAt > failedAt — gradingCore.retryReady)
  //   resultsRef: { [candidateId]: { result, answeredAt } } — the newest result a save answered with
  //   notesRef:   { [cellKey]: text } — "Changed on another device …"
  const overlayRef = useRef({});
  const resultsRef = useRef({});
  const notesRef = useRef({});
  const [, setTick] = useState(0);
  const redraw = useCallback(() => setTick((n) => n + 1), []);
  const [bannerHidden, setBannerHidden] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [online, setOnline] = useState(browserOnline);
  const noAccessRef = useRef(false); // retries stop until the screen is unlocked again
  const retryAfterRefreshRef = useRef(false); // back online: refresh first, then retry (proposal 6)
  const reloadTimerRef = useRef(null);

  // The newest props, for the async code below.
  const propsRef = useRef({ rows, reload, onNoAccess, showPageBanner, saveGrade, saveCount, lookupDan });
  useLayoutEffect(() => {
    propsRef.current = { rows, reload, onNoAccess, showPageBanner, saveGrade, saveCount, lookupDan };
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
  // The polite live region: cleared first, so the same word twice is announced twice.
  const announce = useCallback((text) => {
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(text), 50);
  }, []);
  function scheduleReload() {
    window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      // Still saving something? The next answer starts the wait again.
      if (Object.values(overlayRef.current).some((e) => e.inFlight)) return;
      propsRef.current.reload();
    }, RELOAD_AFTER_SAVES_MS);
  }
  // A refused answer: the cell goes back to the database's value, banner with ✕, the grid reloads.
  function refuse(key, status, kind, candidateId, newDanLabel = null) {
    dropEntry(key);
    redraw();
    const p = propsRef.current;
    p.showPageBanner(refusalText(status, kind, nameOf(candidateId), newDanLabel));
    p.reload();
  }

  // ----- Sending one cell (at most one save per cell on its way) -----
  // retrying: true when a Not saved cell is sent again (its row's Result reads "Saving…").
  async function send(key, retrying = false) {
    const start = overlayRef.current[key];
    if (!start || start.inFlight) return;
    if (retrying) {
      // Proposal 4: compare with the latest refreshed value before sending again.
      const decision = retryDecision(start);
      if (decision === 'already_saved') {
        dropEntry(key); // an earlier save went through; its answer was lost
        redraw();
        return;
      }
      if (decision === 'changed_elsewhere') {
        dropEntry(key); // the cell shows the other device's value…
        setNote(key, start.kind === 'count' ? T.CHANGED_ELSEWHERE_COUNT : T.CHANGED_ELSEWHERE_GRADE); // …with the gray note
        redraw();
        return;
      }
    }
    const value = start.wanted;
    const { token, kind, candidateId, target } = start;
    setEntry(key, { ...start, inFlight: true, state: retrying ? 'retrying' : 'saving' });
    redraw();

    const p = propsRef.current;
    const answer = kind === 'grade'
      ? await p.saveGrade({ candidateId, eventCategoryId: target, grade: value })
      : await p.saveCount({ candidateId, field: target, value });
    let status = answer?.status ?? 'error';
    let what = answerKind(status, kind);
    let newDanLabel = null;
    if (what === 'check_dan') {
      // stale: was this candidate moved to another Dan on another device (v0.164)?
      const d = await propsRef.current.lookupDan(candidateId);
      const row = rowOf(candidateId);
      if (d?.status === 'ok' && (d.candidateStatus === 'withdrawn')) {
        status = 'withdrawn';
        what = 'refused';
      } else if (d?.status === 'ok' && row && d.dan !== row.dan) {
        newDanLabel = d.danLabel;
        what = 'refused';
      } else if (d?.status === 'no_access') {
        what = 'lock';
      } else if (d?.status === 'not_found') {
        status = 'not_found';
        what = 'refused';
      } else {
        what = 'retry'; // a rare lock problem (the SQL maps those to stale too): try again later
      }
    }
    const now = overlayRef.current[key];
    if (!now || now.token !== token) return; // dropped meanwhile (row gone, refused …)

    // Chosen again while this one was on its way (gradingCore.answerStep): whatever this answer was —
    // saved, failed, or even refused — it belongs to the OLDER value. Only that send's state is
    // cleared; the newer pick stays on screen and is sent now, and its own answer decides.
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
      announce(T.ANNOUNCE_SAVED);
      scheduleReload();
      return;
    }
    if (what === 'retry') {
      const wasUnsaved = retrying || now.state === 'retrying';
      // failedAt: the next retry waits for a refresh that starts after this moment (proposal 4);
      // the old `latest` is forgotten, it was read before this failure.
      setEntry(key, { ...now, inFlight: false, state: 'unsaved', failedAt: Date.now(), checkedAt: null, latest: undefined });
      // A NEW failure brings the banner back; a retry that fails again doesn't (v0.192).
      if (!wasUnsaved) setBannerHidden(false);
      redraw();
      announce(T.ANNOUNCE_NOT_SAVED);
      return;
    }
    if (what === 'lock') {
      setEntry(key, { ...now, inFlight: false, state: 'unsaved', failedAt: Date.now(), checkedAt: null, latest: undefined });
      noAccessRef.current = true;
      redraw();
      propsRef.current.onNoAccess();
      return;
    }
    // Never retried, never "Not saved", not in the leave guard (proposals 10–12).
    refuse(key, status, kind, candidateId, newDanLabel);
  }

  // A choice in one cell. Returns false when nothing happened (a kept cell, an unknown row).
  function choose(row, kind, target, value) {
    if (!row) return false;
    const key = cellKey(row.id, kind, target);
    setNote(key, null);
    const current = overlayRef.current[key];
    const chosenAt = Date.now();
    if (current) {
      // An unsaved cell chosen again: only the newest choice is sent (proposal 4).
      setEntry(key, { ...current, value, wanted: value, chosenAt, latest: undefined, state: current.inFlight ? current.state : 'saving' });
    } else {
      setEntry(key, {
        kind, candidateId: row.id, target, value, wanted: value, base: serverValue(row, kind, target), latest: undefined,
        chosenAt, state: 'saving', inFlight: false, token: nextToken++, answeredAt: null,
      });
    }
    redraw();
    send(key);
    return true;
  }
  function chooseGrade(row, eventCategoryId, grade) {
    if (keptSubject(row, eventCategoryId)) return false; // kept: the screen opens the note (proposal 9)
    return choose(row, 'grade', eventCategoryId, grade ?? null);
  }
  function setCount(row, field, value) {
    return choose(row, 'count', field, value ?? null);
  }

  // Retrying Not saved cells (proposal 4) — the 10-second timer, back online, and the banner's Retry
  // all work the same way, in two steps, so a retry is NEVER sent on stale data:
  //   1. retryAll() asks for a fresh read (reload) and remembers that retries are wanted;
  //   2. when a read that STARTED after a cell's failure has answered, the effect below records the
  //      cell's newest value (`latest`, `checkedAt`) and then sends the ready cells (sendReady):
  //      retryDecision compares with that fresh value and drops the retry with the gray note if the
  //      cell was changed on another device.
  // A read that fails, or one that started before the failure, sends nothing; the next tick asks again.
  function sendReady() {
    let waiting = false;
    for (const [key, entry] of Object.entries(overlayRef.current)) {
      if (retryReady(entry)) send(key, true);
      else if (entry.state === 'unsaved' && !entry.inFlight) waiting = true;
    }
    return waiting; // true: some Not saved cell still waits for a newer read
  }
  function retryAll() {
    if (noAccessRef.current) return;
    if (!Object.values(overlayRef.current).some((e) => e.state === 'unsaved' && !e.inFlight)) return;
    retryAfterRefreshRef.current = true;
    Promise.resolve(propsRef.current.reload()).catch(() => {}); // a failed read: the next tick asks again
  }
  const retryRef = useRef(retryAll);
  const sendReadyRef = useRef(sendReady);
  useLayoutEffect(() => {
    retryRef.current = retryAll;
    sendReadyRef.current = sendReady;
  });

  // ----- Keeping the overlay honest when fresh data arrives -----
  // * a "saved" cell or a save's result is replaced by data read AFTER the answer (never an older read)
  // * a Not saved cell remembers the newest value read after its choice (`latest`) and when that read
  //   started (`checkedAt`, for proposal 4); a refresh never overwrites what it shows
  //   (gradingCore.refreshStep decides which)
  // * retries were asked for (the timer, Retry, back online — proposal 6): send the cells this read
  //   made ready; the request stays open while a cell still waits for a newer read
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
    if (retryAfterRefreshRef.current && !noAccessRef.current) {
      retryAfterRefreshRef.current = sendReadyRef.current();
    }
  }, [loadedAt, redraw]);

  // Rows that left (withdrawn, moved to another Dan, deleted elsewhere) lose their cells.
  const rowsKey = rows.map((r) => r.id).join('|');
  useEffect(() => {
    const ids = new Set(rowsKey.split('|'));
    const gone = Object.keys(overlayRef.current).filter((key) => !ids.has(parseCellKey(key).candidateId));
    if (gone.length === 0) return;
    const next = { ...overlayRef.current };
    for (const key of gone) delete next[key];
    overlayRef.current = next;
    redraw();
  }, [rowsKey, redraw]);

  // no_access stopped the retries: they start again once the screen is unlocked.
  const wasLockedRef = useRef(screenLocked);
  useEffect(() => {
    if (wasLockedRef.current && !screenLocked) noAccessRef.current = false;
    wasLockedRef.current = screenLocked;
  }, [screenLocked]);

  // Online / offline, as the browser says. Back online: refresh first, then retry (proposal 6).
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      // Refresh first, then the ready cells go (retryAll); if the refresh fails, the timer asks again.
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

  // ----- Counting -----
  const summary = unsavedSummary(overlayRef.current, rows, defaultSubjectName);
  const unsavedTotal = summary.grades + summary.counts;

  // Automatic retry (proposal 4): every 10 seconds while something is Not saved, the screen is
  // unlocked and the browser is online (offline: the 'online' event starts them).
  const retryActive = unsavedTotal > 0 && !screenLocked && online;
  useEffect(() => {
    if (!retryActive) return undefined;
    const timer = window.setInterval(() => retryRef.current(), STAR_GRADING_RETRY_MS);
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
      if (e.kind === 'grade') grades += 1;
      else counts += 1;
      if (e.state === 'retrying') retrying = true;
    }
    return { grades, counts, retrying };
  }
  function clearNote(row, kind, target) {
    setNote(cellKey(row.id, kind, target), null);
    redraw();
  }

  // The banner (proposals 3 and 6): while anything is Not saved, unless dismissed.
  let banner = null;
  if (unsavedTotal > 0 && !bannerHidden) {
    banner = online
      ? { kind: 'failed', text: T.saveFailedBanner(summary.grades, summary.counts, summary.names) }
      : { kind: 'offline', text: T.offlineBanner(summary.grades, summary.counts) };
  }

  return {
    cell,
    resultFor,
    rowSave,
    chooseGrade,
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
