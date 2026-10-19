// useProspects.js — a React hook that loads what the Prospects list shows and keeps it fresh.
// Why it exists: like useForms / useCalendar — load the shown school(s) (on Both: both, each kept
// separate), reload quietly after every change (no skeleton flash), and never let an old, slow
// answer overwrite a newer one.
//
//   const p = useProspects({ codes: ['worcester'], enabled });
//   p.status   'loading' | 'ready' | 'error' (first load failed) | 'noAccess'
//   p.data     { today, statuses: [all schools'], lists: { code: [list item] } } once 'ready'
//   p.reload() quiet reload; resolves 'ok' | 'error' | 'noAccess'
// Reloads when the school(s) change, the screen unlocks and the browser tab becomes visible again.
import { useCallback, useEffect, useRef, useState } from 'react';
import { listProspects, loadStatuses } from './api.js';

export function useProspects({ codes, enabled }) {
  const key = codes.join('+');
  const [state, setState] = useState({ key: null, data: null, status: 'loading' });
  const seqRef = useRef(0);
  const argsRef = useRef({ codes, enabled, key });
  useEffect(() => {
    argsRef.current = { codes, enabled, key };
  });

  const load = useCallback(async () => {
    const { codes: list, enabled: on, key: k } = argsRef.current;
    if (!on) return 'noAccess';
    const seq = ++seqRef.current;
    setState((prev) => (prev.key === k ? (prev.data ? prev : { ...prev, status: 'loading' }) : { key: k, data: null, status: 'loading' }));
    // the lists first (they also make each school's starting statuses), then the statuses
    const lists = await Promise.all(list.map((code) => listProspects(code)));
    const statuses = await loadStatuses();
    if (seq !== seqRef.current) return 'ok';
    const all = [statuses, ...lists];
    if (all.some((r) => r.status === 'no_access')) {
      setState((prev) => ({ key: k, data: prev.key === k ? prev.data : null, status: 'noAccess' }));
      return 'noAccess';
    }
    if (all.every((r) => r.status === 'ok')) {
      setState({
        key: k,
        status: 'ready',
        data: { today: lists[0]?.today ?? null, statuses: statuses.statuses, lists: Object.fromEntries(list.map((code, i) => [code, lists[i].prospects])) },
      });
      return 'ok';
    }
    setState((prev) => {
      const data = prev.key === k ? prev.data : null;
      return { key: k, data, status: data ? 'ready' : 'error' };
    });
    return 'error';
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [key, enabled, load]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && argsRef.current.enabled) load();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const current = state.key === key;
  return { status: current ? state.status : 'loading', data: current ? state.data : null, reload: load };
}
