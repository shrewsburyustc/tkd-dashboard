// useBbGrading.js — the Grading tab's DATA and its ONE save engine, kept by the cycle page
// (CyclePage.jsx) rather than by the tab (contract 0025 §14.2, Star's pattern, rulebook v0.512
// proposal 8).
// Why it exists: Not saved grades must keep retrying while the grader switches day, Dan or tab, and
// the leave question must count them wherever the grader is on the cycle page. So the grades are
// read here — every Dan of the cycle (gradingApi.loadGradingGrid once per Dan, together), on the
// 15-second quiet refresh (S22), paused while the browser says it's offline — and the one
// useBbGradingSaves lives here too.
// To keep requests low, it reads only while the Grading tab shows, or while something is Not saved.
//
//   const grading = useBbGrading({ cycleId, active, screenLocked, onNoAccess });
//   grading.live      useLiveLoad's answer: data = { status:'ok', today, cycle, rubrics: { [dan]: Dan },
//                     danCounts, rows (every Dan, own first then make-ups, each with `dan`), loadedAt }
//   grading.saves     the save engine (useBbGradingSaves)
//   grading.pageBanner, grading.dismissPageBanner()   answers that are never retried (✕ only)
//   grading.reload()  quiet reload (after Choose subjects, a Candidates change …)
//   grading.guard(proceed) → true when the leave question opened (App.jsx's leave guard)
//   grading.leave, grading.stayOnPage(), grading.leaveAnyway()   the leave question's state
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadGradingGrid } from '../../../lib/blackBelt/gradingApi.js';
import { subjectNames } from '../../../lib/blackBelt/grading.js';
import { RUBRIC_DANS } from '../../../lib/blackBelt/rubric.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../screens/testing/events/useLiveLoad.js';
import { useBbGradingSaves } from './useBbGradingSaves.js';
import * as T from './text.js';

const browserOnline = () => (typeof navigator === 'undefined' || navigator.onLine !== false);

// Every Dan's grid at once → one answer. Any no_access / not_found / error wins (in that order).
async function loadAllDans(cycleId) {
  const loadedAt = Date.now();
  const answers = await Promise.all(RUBRIC_DANS.map((dan) => loadGradingGrid({ cycleId, dan })));
  for (const status of ['no_access', 'not_found', 'error', 'invalid']) {
    if (answers.some((a) => a.status === status)) return { status: status === 'invalid' ? 'error' : status };
  }
  const first = answers[0];
  const rubrics = {};
  const rows = [];
  answers.forEach((a, index) => {
    const dan = RUBRIC_DANS[index];
    rubrics[dan] = a.rubric;
    for (const r of a.rows) {
      // subjectName: the leave question names the subjects ("Rina Patel (Static jump)")
      rows.push({ ...r, dan, subjectName: (id) => subjectNames(a.rubric, [id])[0] ?? id });
    }
  });
  return { status: 'ok', today: first.today, cycle: first.cycle, rubrics, danCounts: first.danCounts, rows, loadedAt };
}

export function useBbGrading({ cycleId, active, screenLocked, onNoAccess }) {
  const [online, setOnline] = useState(browserOnline);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Read while the tab shows; keep reading while something waits to be sent (set below).
  const [busy, setBusy] = useState(false);
  const live = useLiveLoad({ key: active || busy ? cycleId : null, enabled: !screenLocked && online, load: loadAllDans, refreshMs: LIVE_REFRESH_MS });
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });
  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  const reload = useCallback(() => liveRef.current.reload(), []);
  // After 'stale': is the candidate still in that Dan's grid?
  const stillThere = useCallback(async (candidateId, dan) => {
    const a = await loadGradingGrid({ cycleId, dan });
    if (a.status === 'no_access') return 'no_access';
    if (a.status !== 'ok') return 'error';
    return a.rows.some((r) => r.id === candidateId) ? 'yes' : 'no';
  }, [cycleId]);

  const [pageBanner, setPageBanner] = useState(null);
  const rows = live.data?.rows ?? [];
  const saves = useBbGradingSaves({
    rows,
    loadedAt: live.data?.loadedAt ?? null,
    reload,
    onNoAccess,
    showPageBanner: setPageBanner,
    screenLocked,
    stillThere,
  });
  const unsavedTotal = saves.unsaved.grades + saves.unsaved.counts;
  useEffect(() => {
    setBusy(unsavedTotal > 0);
  }, [unsavedTotal]);

  // ----- The leave question (G 8; Star's / Color Belt v0.192's box) -----
  const [leave, setLeave] = useState(null); // { key, proceed, title, body, opener }
  const leaveRef = useRef(leave);
  const savesRef = useRef(saves);
  useLayoutEffect(() => {
    leaveRef.current = leave;
    savesRef.current = saves;
  });
  const guard = useCallback((proceed) => {
    const u = savesRef.current.unsaved;
    if (u.grades + u.counts === 0) return false;
    if (leaveRef.current) return true; // already asking
    const opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    const next = { key: Date.now(), proceed, title: T.S.leaveTitle(u.grades, u.counts), body: T.S.leaveBody(u.people), opener };
    leaveRef.current = next;
    setLeave(next);
    return true;
  }, []);
  // Reloading or closing the browser tab: the browser's own "Leave site?".
  useEffect(() => {
    if (unsavedTotal === 0) return undefined;
    function handleBeforeUnload(unloadEvent) {
      unloadEvent.preventDefault();
      unloadEvent.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [unsavedTotal]);
  function focusBack(opener) {
    let tries = 0;
    const tryFocus = () => {
      if (!opener?.isConnected) return;
      if (opener.closest('[inert]') && tries++ < 30) window.requestAnimationFrame(tryFocus);
      else opener.focus();
    };
    window.requestAnimationFrame(tryFocus);
  }
  const stayOnPage = useCallback(() => {
    const opener = leaveRef.current?.opener;
    leaveRef.current = null;
    setLeave(null);
    focusBack(opener);
  }, []);
  const leaveAnyway = useCallback(() => {
    const d = leaveRef.current;
    if (!d) return;
    leaveRef.current = null;
    setLeave(null);
    // The dialog added a browser-history step (Dialog.jsx) and removes it as it closes: wait for
    // that, then leave (as Star and Color Belt).
    window.setTimeout(() => {
      if (!window.history.state?.tkdDialog) {
        d.proceed();
        return;
      }
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        window.removeEventListener('popstate', go);
        d.proceed();
      };
      window.addEventListener('popstate', go);
      window.setTimeout(go, 400);
    }, 0);
  }, []);

  return {
    live,
    saves,
    pageBanner,
    dismissPageBanner: () => setPageBanner(null),
    reload,
    guard,
    leave,
    stayOnPage,
    leaveAnyway,
  };
}
