// useResultTexts.js — a React hook that loads the three result email texts (Passed, Make-up with a
// D, Make-up below 245) for the "Result emails" block on Star testing → Rubrics and prices.
// Why it exists: build phase 6, gap mockups R11 (proposals 42–53, rulebook v0.514), migration 0023
// (star_result_texts). It is kept SEPARATE from useRubrics on purpose: if the texts can't be read
// (no connection, or a database that doesn't have migration 0023 yet), only this one block shows
// a problem — the rubrics, grade scale and fees above it keep working.
// Same idea as useRubrics.js, just smaller:
//
//   const t = useResultTexts({ enabled });
//   enabled   false while the screen is locked (nothing is requested)
//   t.status  'loading' (first load) · 'ready' (t.texts is there) · 'error' (the FIRST load failed)
//             · 'noAccess' (the database says this sign-in can't see data → the screen locks)
//   t.texts   { passed, makeup_d, makeup_below: { id, kind, body, version, updatedAt, updatedByName } }
//             or null before the first 'ready'
//   t.reload()  quiet reload — keeps the current texts on screen. Resolves 'ok' | 'error' | 'noAccess'.
//
// Reloads by itself when the screen unlocks and when the browser tab becomes visible again.
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadResultTexts } from '../../../lib/star/resultsApi.js';

// The last good texts while the page is open: coming back to the tab shows them at once.
let cached = null;

export function useResultTexts({ enabled }) {
  const [state, setState] = useState(() => ({ texts: cached, status: cached ? 'ready' : 'loading' }));
  const seqRef = useRef(0); // numbers every request; only the newest may change the screen
  const latestRef = useRef(Promise.resolve('ok'));
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const load = useCallback(() => {
    if (!enabledRef.current) return Promise.resolve('noAccess'); // locked: no requests
    const seq = ++seqRef.current;
    const run = async () => {
      const result = await loadResultTexts();
      if (seq !== seqRef.current) return latestRef.current; // a newer request started meanwhile
      if (result.status === 'ok') {
        cached = result.texts;
        setState({ texts: result.texts, status: 'ready' });
        return 'ok';
      }
      if (result.status === 'no_access') {
        setState((prev) => ({ ...prev, status: 'noAccess' }));
        return 'noAccess';
      }
      // Failed: keep what we have; with nothing to show it's 'error'.
      setState((prev) => ({ texts: prev.texts, status: prev.texts ? 'ready' : 'error' }));
      return 'error';
    };
    const promise = run();
    latestRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && enabledRef.current) load();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  return { status: state.status, texts: state.texts, reload: load };
}
