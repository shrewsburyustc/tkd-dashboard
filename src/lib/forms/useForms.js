// useForms.js — a React hook that loads the Forms list and keeps it fresh.
// Why it exists: like useCalendar — load once, reload quietly after every change (no skeleton
// flash), and never let an old, slow answer overwrite a newer one.
//
//   const f = useForms({ enabled });
//   f.status   'loading' | 'ready' | 'error' (first load failed) | 'noAccess'
//   f.data     { forms, monthCounts (Map formId → n) } once 'ready'
//   f.reload() quiet reload; resolves 'ok' | 'error' | 'noAccess'
//
// Reloads when the screen unlocks and when the browser tab becomes visible again.
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadForms } from './api.js';

// The first day of this month in Massachusetts, 'YYYY-MM-01' ("This month" counts).
const monthStart = () => `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()).slice(0, 7)}-01`;

export function useForms({ enabled }) {
  const [state, setState] = useState({ data: null, status: 'loading' });
  const seqRef = useRef(0);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  });

  const load = useCallback(async () => {
    if (!enabledRef.current) return 'noAccess';
    const seq = ++seqRef.current;
    const res = await loadForms({ since: monthStart() });
    if (seq !== seqRef.current) return res.status === 'ok' ? 'ok' : 'error';
    if (res.status === 'no_access') {
      setState((prev) => ({ ...prev, status: 'noAccess' }));
      return 'noAccess';
    }
    if (res.status === 'ok') {
      setState({ data: { forms: res.forms, monthCounts: res.monthCounts }, status: 'ready' });
      return 'ok';
    }
    setState((prev) => ({ data: prev.data, status: prev.data ? 'ready' : 'error' }));
    return 'error';
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

  return { status: state.status, data: state.data, reload: load };
}
