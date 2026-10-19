// useRubrics.js — a React hook that loads Star testing's rubrics and prices and keeps them fresh.
// Why it exists: the Rubrics and prices tab needs the data, needs to know whether it's still
// loading, and needs to reload after every save — without flashing a skeleton each time, and
// without an old, slow answer overwriting a newer one. Same idea as Color Belt's
// useClassesRanks.js, but simpler: Star has ONE shared set for both schools (v0.58), so there is
// no school to switch between.
//
//   const r = useRubrics({ enabled });
//   enabled   false while the screen is locked (nothing is requested)
//
//   r.status  'loading'  first load, no data yet → the tab shows the skeleton
//             'ready'    r.data is { dans, grades, assistant }
//             'error'    the FIRST load failed (nothing to show) → the tab shows Retry
//             'noAccess' the database says this sign-in can't see data → the screen locks
//   r.data    the data, or null before the first 'ready'
//   r.reload()  quiet reload — keeps the current data on screen. Resolves 'ok' | 'error' | 'noAccess'.
//   r.setLocal(updater)  change the data right away, before the server answers (drag to
//             reorder). updater(data) → new data.
//
// Reloads happen by themselves when the screen unlocks and when the browser tab becomes visible.
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadRubrics } from '../../../lib/star/rubricsApi.js';

// The last good data, kept while the page is open: coming back to the tab shows it at once (and
// reloads it quietly) instead of the skeleton again.
let cached = null;

export function useRubrics({ enabled }) {
  const [state, setState] = useState(() => ({ data: cached, status: cached ? 'ready' : 'loading' }));
  const requestSeqRef = useRef(0); // numbers every request; only the newest may change the screen
  const latestRef = useRef(Promise.resolve('ok'));
  const localEditSeqRef = useRef(-1); // see setLocal
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const load = useCallback(() => {
    if (!enabledRef.current) return Promise.resolve('noAccess'); // locked: no requests
    const seq = ++requestSeqRef.current;
    const run = async () => {
      const result = await loadRubrics();
      // A newer request started meanwhile: ignore this answer and report the newer one's.
      if (seq !== requestSeqRef.current) return latestRef.current;
      if (result.status === 'ok') {
        // Changed on screen (an optimistic reorder) after this request started: keep the screen's
        // version — the save that follows reloads again.
        if (localEditSeqRef.current >= seq) return 'ok';
        const data = { dans: result.dans, grades: result.grades, assistant: result.assistant };
        cached = data;
        setState({ data, status: 'ready' });
        return 'ok';
      }
      if (result.status === 'no_access') {
        setState((prev) => ({ ...prev, status: 'noAccess' }));
        return 'noAccess';
      }
      // Failed: keep any data we have ('ready'); with nothing to show it's 'error'.
      setState((prev) => ({ data: prev.data, status: prev.data ? 'ready' : 'error' }));
      return 'error';
    };
    const promise = run();
    latestRef.current = promise;
    return promise;
  }, []);

  // Load on the first show and whenever the screen unlocks.
  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  // Reload when the browser tab comes back into view (another admin may have changed things).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && enabledRef.current) load();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const setLocal = useCallback((updater) => {
    localEditSeqRef.current = requestSeqRef.current;
    setState((prev) => {
      if (!prev.data) return prev;
      const data = updater(prev.data);
      cached = data;
      return { ...prev, data };
    });
  }, []);

  return { status: state.status, data: state.data, reload: load, setLocal };
}
