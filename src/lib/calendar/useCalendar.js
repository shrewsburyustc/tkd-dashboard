// useCalendar.js — a React hook that loads what the Calendar shows and keeps it fresh.
// Why it exists: the Calendar needs three things at once — each shown school's Schedule (its
// classes come from there), the calendar rows for the dates on screen, and "today". This hook
// loads them together, reloads quietly after every save (no skeleton flash), keeps what's on
// screen while a new month loads, and never lets an old, slow answer overwrite a newer one.
//
//   const c = useCalendar({ codes: ['worcester'], from, to, enabled });
//   c.status   'loading' | 'ready' | 'error' (first load failed) | 'noAccess'
//   c.data     { today, schools: [{ code, versions, slots, classes, colors }], types, events,
//                closures, closureClasses (Map), testingEvents, bookings } once 'ready' (else null)
//   bookings = free-class bookings from Forms (v0.145 answer 6). If they can't be read (e.g. the
//   Forms tables aren't in the database yet) the Calendar still shows, without them.
//   c.reload() quiet reload; resolves 'ok' | 'error' | 'noAccess'
//
// Reloads by itself when the schools or dates change, the screen unlocks, and the browser tab
// becomes visible again (another admin may have changed things).
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSchedule } from '../schedule/api.js';
import { loadCalendar, loadTestingEvents } from './api.js';
import { bookingsBetween } from '../forms/api.js';

export function useCalendar({ codes, from, to, enabled }) {
  const key = `${codes.join('+')}`;
  const [state, setState] = useState({ key: null, data: null, status: 'loading' });
  const seqRef = useRef(0);
  const latestRef = useRef(Promise.resolve('ok'));
  const argsRef = useRef({ codes, from, to, enabled, key });
  useEffect(() => {
    argsRef.current = { codes, from, to, enabled, key };
  });

  const load = useCallback(() => {
    const { codes: list, from: a, to: b, enabled: on, key: k } = argsRef.current;
    if (!on) return Promise.resolve('noAccess');
    const seq = ++seqRef.current;
    setState((prev) => (prev.key === k ? (prev.data ? prev : { ...prev, status: 'loading' }) : { key: k, data: null, status: 'loading' }));
    const run = async () => {
      const [calendar, testing, bookings, ...schedules] = await Promise.all([
        loadCalendar({ from: a, to: b }),
        loadTestingEvents({ from: a, to: b }),
        bookingsBetween({ locationCode: null, from: a, to: b }),
        ...list.map((code) => loadSchedule(code)),
      ]);
      if (seq !== seqRef.current) return latestRef.current; // a newer request took over
      const all = [calendar, testing, ...schedules];
      if (all.some((r) => r.status === 'no_access')) {
        setState((prev) => ({ key: k, data: prev.key === k ? prev.data : null, status: 'noAccess' }));
        return 'noAccess';
      }
      if (all.every((r) => r.status === 'ok')) {
        const data = {
          today: schedules[0]?.today ?? null,
          from: a,
          to: b,
          schools: list.map((code, i) => ({
            code,
            versions: schedules[i].versions,
            slots: schedules[i].slots,
            classes: schedules[i].classes,
            colors: schedules[i].colors,
          })),
          types: calendar.types,
          events: calendar.events,
          closures: calendar.closures,
          closureClasses: calendar.closureClasses,
          testingEvents: testing.events,
          bookings: bookings.status === 'ok' ? bookings.bookings : [],
        };
        setState({ key: k, data, status: 'ready' });
        return 'ok';
      }
      // Failed: keep what we have on screen; with nothing to show it's 'error'.
      setState((prev) => {
        const data = prev.key === k ? prev.data : null;
        return { key: k, data, status: data ? 'ready' : 'error' };
      });
      return 'error';
    };
    const promise = run();
    latestRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [key, from, to, enabled, load]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && argsRef.current.enabled) load();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const current = state.key === key;
  return {
    status: current ? state.status : 'loading',
    data: current ? state.data : null,
    reload: load,
  };
}
