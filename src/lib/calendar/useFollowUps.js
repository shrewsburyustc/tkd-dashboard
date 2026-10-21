// useFollowUps.js — a React hook that loads prospects' open follow-ups for the Calendar
// (rulebook v0.612, v0.615 answer Q1-A).
// Why it exists: the Calendar shows follow-up dates, but the prospects table can only be read
// through the database's own functions. This asks the SAME one the Prospects list uses
// (prospects_list, one call per school on screen) and keeps only what the Calendar shows —
// { id, code, childFirstName, initial, followUpOn } — dropping the rest of each answer at once.
//
//   const f = useFollowUps({ codes: ['worcester'], enabled });
//   f.status     'loading' | 'ready' | 'error' | 'noAccess' | 'off'
//   f.followUps  [follow-up] (empty until ready)
//
// Kept apart from useCalendar on purpose:
//   - it does NOT reload on every month / week click or after Calendar saves (that list is a whole
//     school's prospects, and loading it also runs the automatic clean-up, v0.244 / v0.611) —
//     only when the school(s) change, the screen unlocks or the browser tab comes back;
//   - if it fails, the rest of the Calendar still shows (the day panel says so).
// While Follow-ups are hidden in the Show menu, `enabled` is false and nothing is loaded.
import { useCallback, useEffect, useRef, useState } from 'react';
import { listProspects, loadStatuses } from '../prospects/api.js';
import { calendarFollowUps } from '../prospects/followUps.js';

const NONE = []; // one shared empty list, so the Calendar doesn't rebuild every day on each redraw

export function useFollowUps({ codes, enabled }) {
  const key = codes.join('+');
  const [state, setState] = useState({ key: null, followUps: NONE, status: 'loading' });
  const seqRef = useRef(0);
  const argsRef = useRef({ codes, enabled, key });
  useEffect(() => {
    argsRef.current = { codes, enabled, key };
  });

  const load = useCallback(async () => {
    const { codes: list, enabled: on, key: k } = argsRef.current;
    if (!on) return 'off';
    const seq = ++seqRef.current;
    const failed = () => {
      // Failed: keep what we had for these schools (a quiet reload that fails changes nothing).
      setState((prev) => (prev.key === k && prev.status === 'ready' ? prev : { key: k, followUps: NONE, status: 'error' }));
      return 'error';
    };
    try {
      // the lists first (as Prospects does: they also make a school's starting statuses), then statuses
      const lists = await Promise.all(list.map((code) => listProspects(code)));
      const statuses = await loadStatuses();
      if (seq !== seqRef.current) return 'ok'; // a newer request took over
      const all = [statuses, ...lists];
      if (all.some((r) => r.status === 'no_access')) {
        setState({ key: k, followUps: NONE, status: 'noAccess' });
        return 'noAccess';
      }
      if (!all.every((r) => r.status === 'ok')) return failed();
      const followUps = list.flatMap((code, i) => calendarFollowUps(lists[i].prospects, statuses.statuses, code));
      setState({ key: k, followUps, status: 'ready' });
      return 'ok';
    } catch {
      // something unexpected (never leave the day panel waiting forever)
      return seq === seqRef.current ? failed() : 'ok';
    }
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

  if (!enabled) return { status: 'off', followUps: NONE };
  const current = state.key === key;
  return { status: current ? state.status : 'loading', followUps: current ? state.followUps : NONE };
}
