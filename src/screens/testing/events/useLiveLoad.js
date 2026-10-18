// useLiveLoad.js — a React hook that loads something from the database and keeps it fresh.
// Why it exists: the Events list and the event page both need what Classes and ranks already
// has (useClassesRanks.js): show a gray skeleton only the FIRST time, reload quietly after
// every change, reload when the school changes / the screen unlocks / the browser tab becomes
// visible again, and never let an old, slow answer overwrite a newer one. This is the same
// idea written once, for any loader.
//
//   const live = useLiveLoad({ key, enabled, load });
//   key      what to load, e.g. 'worcester' or an event id. null = nothing (e.g. "Both").
//   enabled  false while the screen is locked (nothing is requested then)
//   load     (key) => Promise<{ status, ... }> — a data-layer function that never throws
//
//   live.status  'idle' (no key) | 'loading' (first load, nothing to show yet) | 'ready' |
//                'error' (the first load failed) | 'noAccess' (this sign-in can't see data) |
//                'notFound' (the thing doesn't exist, e.g. a deleted event)
//   live.data    the last good answer for this key (the whole { status:'ok', ... } object) or null
//   live.reload()  quiet reload. Resolves 'ok' | 'error' | 'noAccess' | 'notFound'.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useLiveLoad({ key, enabled, load }) {
  const [state, setState] = useState({ key: null, data: null, status: 'idle' });
  const cacheRef = useRef(new Map()); // last good answer per key, while the page is open
  const seqRef = useRef(0); // numbers every request; only the newest may change the screen
  const latestRef = useRef(Promise.resolve('ok'));
  const keyRef = useRef(key);
  const enabledRef = useRef(enabled);
  const loadRef = useRef(load);

  useEffect(() => {
    keyRef.current = key;
    enabledRef.current = enabled;
    loadRef.current = load;
  });

  const reload = useCallback(() => {
    const current = keyRef.current;
    if (current === null || current === undefined) return Promise.resolve('ok');
    if (!enabledRef.current) return Promise.resolve('noAccess');
    const seq = ++seqRef.current;
    const cache = cacheRef.current;
    setState((prev) => {
      if (prev.key === current) return prev.data ? prev : { ...prev, status: 'loading' };
      return cache.has(current)
        ? { key: current, data: cache.get(current), status: 'ready' }
        : { key: current, data: null, status: 'loading' };
    });

    const run = async () => {
      let result;
      try {
        result = await loadRef.current(current);
      } catch {
        result = { status: 'error' };
      }
      if (seq !== seqRef.current) return latestRef.current; // a newer request took over
      if (result?.status === 'ok') {
        cache.set(current, result);
        setState({ key: current, data: result, status: 'ready' });
        return 'ok';
      }
      if (result?.status === 'no_access') {
        setState((prev) => ({ key: current, data: prev.key === current ? prev.data : null, status: 'noAccess' }));
        return 'noAccess';
      }
      if (result?.status === 'not_found') {
        cache.delete(current);
        setState({ key: current, data: null, status: 'notFound' });
        return 'notFound';
      }
      // Failed: keep what we have on screen ('ready'); with nothing to show it's 'error'.
      setState((prev) => {
        const data = prev.key === current ? prev.data : (cache.get(current) ?? null);
        return { key: current, data, status: data ? 'ready' : 'error' };
      });
      return 'error';
    };

    const promise = run();
    latestRef.current = promise;
    return promise;
  }, []);

  // Load when the key changes or the screen unlocks.
  useEffect(() => {
    if (key !== null && key !== undefined && enabled) reload();
  }, [key, enabled, reload]);

  // Reload when the browser tab comes back into view (someone else may have changed things).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && keyRef.current && enabledRef.current) reload();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  // Replace the shown answer right away (e.g. with data just re-read before a delete).
  const setLocal = useCallback((data) => {
    const current = keyRef.current;
    cacheRef.current.set(current, data);
    setState({ key: current, data, status: 'ready' });
  }, []);

  // What the screen sees for THIS key — never another key's answer.
  let data = null;
  let status;
  if (key === null || key === undefined) status = 'idle';
  else if (state.key === key) {
    data = state.data;
    status = state.status;
  } else if (cacheRef.current.has(key)) {
    data = cacheRef.current.get(key);
    status = 'ready';
  } else status = 'loading';

  return { status, data, reload, setLocal };
}
