// useLiveLoad.js — a React hook that loads something from the database and keeps it fresh.
// Why it exists: the Events list and the event page both need what Classes and ranks already
// has (useClassesRanks.js): show a gray skeleton only the FIRST time, reload quietly after
// every change, reload when the school changes / the screen unlocks / the browser tab becomes
// visible again, and never let an old, slow answer overwrite a newer one. This is the same
// idea written once, for any loader.
//
//   const live = useLiveLoad({ key, enabled, load, refreshMs });
//   key      what to load, e.g. 'worcester' or an event id. null = nothing (e.g. "Both").
//   enabled  false while the screen is locked (nothing is requested then)
//   load     (key) => Promise<{ status, ... }> — a data-layer function that never throws
//   refreshMs  optional: also reload quietly every this many milliseconds while the browser
//            tab is visible and the screen unlocked, so registrations families send from the
//            form show up without anyone refreshing (rulebook v0.157: every 15 seconds).
//
//   live.status  'idle' (no key) | 'loading' (first load, nothing to show yet) | 'ready' |
//                'error' (the first load failed) | 'noAccess' (this sign-in can't see data) |
//                'notFound' (the thing doesn't exist, e.g. a deleted event)
//   live.data    the last good answer for this key (the whole { status:'ok', ... } object) or null
//   live.reload()  quiet reload. Resolves 'ok' | 'error' | 'noAccess' | 'notFound'.
//   live.refreshFailing  true after 2 reloads IN A ROW failed while something is on screen (the
//                page would otherwise look frozen); back to false after the next good answer.
//   live.updatedAt  when the last good answer for this key arrived (a Date.now() number) or null.
//   (refreshFailing and updatedAt were added for the camp roster, 2026-10-21; screens that don't
//   read them behave exactly as before.)
import { useCallback, useEffect, useRef, useState } from 'react';

// How often the Events list and the event page reload on their own (rulebook v0.157).
export const LIVE_REFRESH_MS = 15 * 1000;
// A request still unanswered after this long is treated as lost; the timer asks again.
const HUNG_MS = 60 * 1000;
// How many failed reloads in a row before refreshFailing turns true (one blip is ignored).
const FAILS_BEFORE_WARNING = 2;

export function useLiveLoad({ key, enabled, load, refreshMs }) {
  const [state, setState] = useState({ key: null, data: null, status: 'idle' });
  const cacheRef = useRef(new Map()); // last good answer per key, while the page is open
  const seqRef = useRef(0); // numbers every request; only the newest may change the screen
  const latestRef = useRef(Promise.resolve('ok'));
  // When the newest request started (null = answered). The timer skips a beat while it is out,
  // but only for HUNG_MS: a request that never answers (a bad Wi-Fi drop) can't stop it for good.
  const pendingSinceRef = useRef(null);
  const statusRef = useRef('idle'); // what the screen shows now (read by the timer)
  const keyRef = useRef(key);
  const enabledRef = useRef(enabled);
  const loadRef = useRef(load);
  // Failed reloads in a row for the current key ({ key, count }); a good answer resets it.
  const [fails, setFails] = useState({ key: null, count: 0 });

  useEffect(() => {
    keyRef.current = key;
    enabledRef.current = enabled;
    loadRef.current = load;
  });

  // background: true = the regular timer. It never swaps in the gray skeleton (an error screen
  // stays as it is until an answer arrives), so nothing flashes every 15 seconds.
  const reload = useCallback(({ background = false } = {}) => {
    const current = keyRef.current;
    if (current === null || current === undefined) return Promise.resolve('ok');
    if (!enabledRef.current) return Promise.resolve('noAccess');
    const seq = ++seqRef.current;
    const cache = cacheRef.current;
    setState((prev) => {
      if (prev.key === current) return prev.data || background ? prev : { ...prev, status: 'loading' };
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
        setState({ key: current, data: result, status: 'ready', okAt: Date.now() });
        // Reset the failure count. Returning the same object when it is already 0 tells React
        // nothing changed, so screens that don't use it get no extra redraw.
        setFails((prev) => (prev.key === current && prev.count === 0 ? prev : { key: current, count: 0 }));
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
        return { key: current, data, status: data ? 'ready' : 'error', okAt: prev.key === current ? prev.okAt : null };
      });
      // Count it (only the newest request gets here, so a replaced one never counts).
      setFails((prev) => ({ key: current, count: prev.key === current ? prev.count + 1 : 1 }));
      return 'error';
    };

    pendingSinceRef.current = Date.now();
    const promise = run().finally(() => {
      if (seq === seqRef.current) pendingSinceRef.current = null;
    });
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

  // The regular quiet reload (refreshMs). It runs only while the tab is visible and the screen
  // unlocked, skips a beat while the newest request is still out (slow connection, so requests
  // never pile up), and stops asking about something that no longer exists (a deleted event).
  // A failed attempt changes nothing on screen; the next one tries again.
  useEffect(() => {
    if (!refreshMs) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!keyRef.current || !enabledRef.current || statusRef.current === 'notFound') return;
      const since = pendingSinceRef.current;
      if (since !== null && Date.now() - since < HUNG_MS) return;
      reload({ background: true });
    }, refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs, reload]);

  // Replace the shown answer right away (e.g. with data just re-read before a delete).
  const setLocal = useCallback((data) => {
    const current = keyRef.current;
    cacheRef.current.set(current, data);
    setState({ key: current, data, status: 'ready', okAt: Date.now() });
  }, []);

  // What the screen sees for THIS key — never another key's answer.
  let data = null;
  let status;
  let updatedAt = null;
  if (key === null || key === undefined) status = 'idle';
  else if (state.key === key) {
    data = state.data;
    status = state.status;
    updatedAt = state.okAt ?? null;
  } else if (cacheRef.current.has(key)) {
    data = cacheRef.current.get(key);
    status = 'ready';
  } else status = 'loading';

  useEffect(() => {
    statusRef.current = status;
  });

  // Only a warning while there IS something on screen ('ready'); a first load that failed already
  // shows its own error screen.
  const refreshFailing = status === 'ready' && fails.key === key && fails.count >= FAILS_BEFORE_WARNING;

  return { status, data, reload, setLocal, refreshFailing, updatedAt };
}
