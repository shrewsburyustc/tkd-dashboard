// useClassesRanks.js — a React hook that loads one school's classes and ranks and keeps them fresh.
// Why it exists: the Testing screen needs the list, needs to know whether it's still loading,
// and needs to reload after every save — without flashing a skeleton every time, and without
// an old, slow answer overwriting a newer one. This hook does all that in one place.
//
//   const t = useClassesRanks({ locationCode, enabled });
//   locationCode — 'worcester' | 'shrewsbury' | null (null = "Both": nothing is requested)
//   enabled      — false while the screen is locked (nothing is requested)
//
//   t.status   'idle'     nothing to show (Both)
//              'loading'  first load of this school, no data yet → the screen shows the skeleton
//              'ready'    t.classes is the list
//              'error'    the FIRST load failed (no data to show) → the screen shows Retry
//              'noAccess' the database says this sign-in can't see data → the screen locks
//   t.classes  the list with "Testing for" worked out (withTestingFor); [] until the first 'ready'
//   t.reload() quiet reload — keeps the current list on screen. Resolves 'ok' | 'error' | 'noAccess'.
//   t.setLocalClasses(updater)  change the list right away, before the server answers
//              (used for drag-to-reorder). updater(rawClasses) → new rawClasses.
//
// Reloads happen by themselves when: the school changes, the screen unlocks (enabled goes
// false → true), and the browser tab becomes visible again.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadClassesAndRanks } from './api.js';
import { withTestingFor } from './rankOrder.js';

export function useClassesRanks({ locationCode, enabled }) {
  // What is on screen: which school, its raw list (null = none yet), and the status.
  const [state, setState] = useState({ code: null, raw: null, status: 'idle' });

  // Last good list per school, kept while the page is open — switching back to a school
  // shows its list at once (and reloads it quietly) instead of the skeleton again.
  const cacheRef = useRef(new Map());
  const requestSeqRef = useRef(0); // numbers every request; only the newest one may change the screen
  const latestRef = useRef(Promise.resolve('ok')); // the newest request's promise
  const localEditRef = useRef({ code: null, seq: -1 }); // see setLocalClasses
  const codeRef = useRef(locationCode);
  const enabledRef = useRef(enabled);

  // Keep the refs current so load() (which never changes) reads the latest values.
  useEffect(() => {
    codeRef.current = locationCode;
    enabledRef.current = enabled;
  }, [locationCode, enabled]);

  const load = useCallback(() => {
    const code = codeRef.current;
    if (!code) return Promise.resolve('ok'); // Both: nothing to load
    if (!enabledRef.current) return Promise.resolve('noAccess'); // locked: no requests

    const seq = ++requestSeqRef.current;
    const cache = cacheRef.current;
    setState((prev) => {
      if (prev.code === code) return prev.raw ? prev : { ...prev, status: 'loading' };
      // Another school: show its saved list if we have one, otherwise the skeleton.
      return cache.has(code) ? { code, raw: cache.get(code), status: 'ready' } : { code, raw: null, status: 'loading' };
    });

    const run = async () => {
      const result = await loadClassesAndRanks(code);
      // A newer request started meanwhile: ignore this answer and report the newer one's.
      if (seq !== requestSeqRef.current) return latestRef.current;

      if (result.status === 'ok') {
        // If the list was changed on screen (optimistic reorder) after this request started,
        // keep the on-screen version: the save that follows will reload again.
        const editedSince = localEditRef.current.code === code && localEditRef.current.seq >= seq;
        if (!editedSince) cache.set(code, result.classes);
        setState((prev) => ({
          code,
          raw: editedSince && prev.code === code ? prev.raw : result.classes,
          status: 'ready',
        }));
        return 'ok';
      }
      if (result.status === 'no_access') {
        setState((prev) => (prev.code === code ? { ...prev, status: 'noAccess' } : { code, raw: null, status: 'noAccess' }));
        return 'noAccess';
      }
      // Failed: keep any list we have ('ready'); with nothing to show it's 'error'.
      setState((prev) => {
        const raw = prev.code === code ? prev.raw : cache.get(code) ?? null;
        return { code, raw, status: raw ? 'ready' : 'error' };
      });
      return 'error';
    };

    const promise = run();
    latestRef.current = promise;
    return promise;
  }, []);

  // Load when the school changes or the screen unlocks.
  useEffect(() => {
    if (locationCode && enabled) load();
  }, [locationCode, enabled, load]);

  // Reload when the tab comes back into view (another admin may have changed things).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && codeRef.current && enabledRef.current) load();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const setLocalClasses = useCallback((updater) => {
    // Remember that the screen now shows a local change, so an answer to a request that was
    // already on its way can't put the old order back (localEditRef above).
    localEditRef.current = { code: codeRef.current, seq: requestSeqRef.current };
    setState((prev) => {
      if (!prev.raw || prev.code !== codeRef.current) return prev;
      const raw = updater(prev.raw);
      cacheRef.current.set(prev.code, raw);
      return { ...prev, raw };
    });
  }, []);

  // What the screen sees. Until the effect above runs for a new school, show that school's
  // saved list (or the skeleton) — never the previous school's list.
  let raw = null;
  let status;
  if (!locationCode) {
    status = 'idle';
  } else if (state.code === locationCode) {
    raw = state.raw;
    status = state.status;
  } else if (cacheRef.current.has(locationCode)) {
    raw = cacheRef.current.get(locationCode);
    status = 'ready';
  } else {
    status = 'loading';
  }
  const classes = useMemo(() => (raw ? withTestingFor(raw) : []), [raw]);

  return { status, classes, reload: load, setLocalClasses };
}
