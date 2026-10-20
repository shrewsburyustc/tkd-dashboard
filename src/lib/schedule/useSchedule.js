// useSchedule.js — a React hook that loads one school's schedule and keeps it fresh.
// Why it exists: the same job useClassesRanks does for Testing — know whether it's still
// loading, reload quietly after every save (no skeleton flash), and never let an old, slow
// answer overwrite a newer one.
//
//   const s = useSchedule({ locationCode, enabled });
//   s.status   'loading' | 'ready' | 'error' (first load failed) | 'noAccess'
//   s.data     { today, versions, slots, classes, colors } once 'ready' (else null)
//   s.reload() quiet reload; resolves 'ok' | 'error' | 'noAccess'
//
// Reloads by itself when the school changes, the screen unlocks, and the browser tab becomes
// visible again (another admin may have changed things).
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSchedule } from './api.js';

export function useSchedule({ locationCode, enabled }) {
  const [state, setState] = useState({ code: null, data: null, status: 'loading' });
  const seqRef = useRef(0); // numbers every request; only the newest may change the screen
  const latestRef = useRef(Promise.resolve('ok'));
  const codeRef = useRef(locationCode);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    codeRef.current = locationCode;
    enabledRef.current = enabled;
  }, [locationCode, enabled]);

  const load = useCallback(() => {
    const code = codeRef.current;
    if (!code) return Promise.resolve('ok');
    if (!enabledRef.current) return Promise.resolve('noAccess');
    const seq = ++seqRef.current;
    setState((prev) => (prev.code === code ? (prev.data ? prev : { ...prev, status: 'loading' }) : { code, data: null, status: 'loading' }));
    const run = async () => {
      const result = await loadSchedule(code);
      if (seq !== seqRef.current) return latestRef.current; // a newer request took over
      if (result.status === 'ok') {
        const { status, ...data } = result;
        setState({ code, data, status: 'ready' });
        return 'ok';
      }
      if (result.status === 'no_access') {
        setState((prev) => ({ code, data: prev.code === code ? prev.data : null, status: 'noAccess' }));
        return 'noAccess';
      }
      // Failed: keep what we have on screen; with nothing to show it's 'error'.
      setState((prev) => {
        const data = prev.code === code ? prev.data : null;
        return { code, data, status: data ? 'ready' : 'error' };
      });
      return 'error';
    };
    const promise = run();
    latestRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    if (locationCode && enabled) load();
  }, [locationCode, enabled, load]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && codeRef.current && enabledRef.current) load();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const current = state.code === locationCode;
  return {
    status: current ? state.status : 'loading',
    data: current ? state.data : null,
    reload: load,
  };
}
