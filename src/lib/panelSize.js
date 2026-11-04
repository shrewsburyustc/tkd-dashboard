// panelSize.js — "Panel size": each person's own choice of how big the side panel (the rail) is
// (rulebook v1.118). Standard is today's panel. Large shows the names under the icons on PC too, at
// 14px. Largest is 96px wide with 24px icons and 14px names. A phone held upright has no side panel,
// so nothing changes there.
// Why it exists: the Grandmaster needs a bigger panel; other staff don't. Each person picks a size
// in their own account menu (AccountMenu.jsx, under "This device"), and it is saved with their
// account, so it follows them to every PC and tablet they sign in on.
//
// Where it is saved: Supabase's own per-person settings, `user_metadata` (key `panel_size`). No
// migration: Supabase keeps these settings itself.
//   - Display only. The person can change it, so it must never decide what anyone can see or do.
//   - It is the second exception, after Change password, to "writes go through the database's own
//     functions" (handoff §6): supabase.auth.updateUser changes only the signed-in person's settings.
//   - It isn't a school record, so it isn't written to change_log.
//
// How a copy of the account reaches this device (each copy carries the size):
//   - signing in, and the saved sign-in when the page opens (it opens at that size straight away);
//   - at page load, one question to the account itself (getUser), because the saved sign-in can be
//     up to an hour old: a change made on another device shows the next time the dashboard opens;
//   - Supabase's sign-in refresh, about once an hour (so an open dashboard catches up);
//   - our own save.
// The newest copy wins (by the account's updated_at), so an old saved copy can't undo a newer one
// (Supabase also re-sends this browser's saved copy whenever the tab is shown again).
// A size chosen here that isn't saved yet (saving, or the save failed) wins over every copy, so
// the panel never jumps back while the person is looking at it.
// A copy of ANOTHER person's account (the next person signed in) starts afresh: nothing unsaved,
// no amber bar. That matters when a sign-out sent no signal: Supabase sends none when it can't
// reach the server with an expired sign-in.
// Known and accepted (code review, 2026-11-03): two tabs saving different sizes at the same moment
// can leave one tab showing the other size until its next sign-in refresh (about an hour).
//
// ----- API -----
//   const panel = usePanelSize();   (App.jsx, once)
//   panel.size          'standard' | 'large' | 'largest' — what the panel shows now
//   panel.choose(size)  shows it at once and saves it with the account (the size already shown and
//                       saved: nothing to do; the size shown but not saved: saves it again)
//   panel.saveFailed    true after a failed save: the shared amber bar shows (Shell.jsx)
//   panel.retrying      true while Retry is on its way
//   panel.retry()       saves the chosen size again
//   panel.dismiss()     closes the bar (×); the size stays on this device until the page reloads
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';

export const PANEL_SIZES = ['standard', 'large', 'largest'];

// ----- The words (v1.118; the approved mockup Mockups/SP-panel-size.png) -----
export const PANEL_SIZE = 'Panel size'; // the account-menu row, and its choices' group name
export const PANEL_SIZE_LABELS = { standard: 'Standard', large: 'Large', largest: 'Largest' };
export const PANEL_SIZE_NOT_SAVED =
  "Couldn't save your panel size, so your other devices keep the old one. Check the internet, then Retry.";

const METADATA_KEY = 'panel_size'; // the key in Supabase's per-person settings
const START = { size: 'standard', userId: null, changedAt: 0 }; // nobody signed in

// The size in a copy of the account. Anything other than the three sizes counts as Standard.
export function panelSizeOf(user) {
  const value = user?.user_metadata?.[METADATA_KEY];
  return PANEL_SIZES.includes(value) ? value : 'standard';
}

// When the account was last changed, as a number (0 if the copy doesn't say).
function changedAtOf(user) {
  return Date.parse(user?.updated_at ?? '') || 0;
}

export function usePanelSize() {
  // What the panel shows, and which copy of the account it came from (whose, and how new).
  const [shown, setShown] = useState(START);
  const [saveFailed, setSaveFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const unsavedRef = useRef(null); // a size chosen here that isn't saved yet, or null
  const saveCountRef = useRef(0); // numbers each save; only the newest one's answer counts
  const userIdRef = useRef(null); // whose account the panel follows now (null: nobody signed in)
  const sizeRef = useRef(START.size); // the size shown, for choose() (kept in step below)

  useEffect(() => {
    sizeRef.current = shown.size;
  }, [shown.size]);

  // Forgets anything unsaved from the last person (and any save still on its way).
  const startAfresh = useCallback(() => {
    unsavedRef.current = null;
    saveCountRef.current += 1;
    setSaveFailed(false);
    setRetrying(false);
  }, []);

  // A copy of the person's account arrived.
  const take = useCallback((user) => {
    if (!user) return;
    if (userIdRef.current !== user.id) {
      userIdRef.current = user.id;
      startAfresh(); // another person (or the first copy since the page opened)
    }
    setShown((current) => {
      if (current.userId === user.id) {
        if (unsavedRef.current) return current; // a size chosen here, not saved yet, wins
        if (changedAtOf(user) < current.changedAt) return current; // older than the copy shown
      }
      return { size: panelSizeOf(user), userId: user.id, changedAt: changedAtOf(user) };
    });
  }, [startAfresh]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        // Signed out (or nobody signed in at load): the next person starts from their own copy.
        userIdRef.current = null;
        startAfresh();
        setShown(START);
        return;
      }
      take(session.user);
      if (event === 'INITIAL_SESSION') {
        // The saved sign-in can be up to an hour old: ask the account itself once. Supabase asks
        // us not to call it from inside this callback, so it runs just after (as in App.jsx).
        setTimeout(() => {
          supabase.auth
            .getUser()
            .then(({ data: answer }) => take(answer?.user))
            .catch(() => {}); // offline: the saved copy stays
        }, 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [take, startAfresh]);

  // Saves `size` with the account. Supabase runs its account calls one at a time, in order.
  const save = useCallback(
    async (size) => {
      const ticket = ++saveCountRef.current;
      let user = null;
      try {
        const { data, error } = await supabase.auth.updateUser({ data: { [METADATA_KEY]: size } });
        if (!error) user = data?.user ?? null;
      } catch {
        // e.g. no connection: handled below like any other failure
      }
      if (ticket !== saveCountRef.current) return; // a newer choice (or a sign-out) came since
      setRetrying(false);
      if (!user) {
        setSaveFailed(true); // §3.5: a failed save is never silent; the size stays on this device
        return;
      }
      unsavedRef.current = null;
      setSaveFailed(false);
      take(user);
    },
    [take],
  );

  const choose = useCallback(
    (size) => {
      if (!PANEL_SIZES.includes(size)) return;
      if (size === sizeRef.current && !unsavedRef.current) return; // shown and saved already
      unsavedRef.current = size;
      setShown((current) => ({ ...current, size })); // the panel changes at once
      save(size);
    },
    [save],
  );

  const retry = useCallback(() => {
    if (!unsavedRef.current) return;
    setRetrying(true);
    save(unsavedRef.current);
  }, [save]);

  const dismiss = useCallback(() => setSaveFailed(false), []);

  return { size: shown.size, choose, saveFailed, retrying, retry, dismiss };
}
