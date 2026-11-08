// saveLine.js — one page's line of saves: one at a time, and an Undo pressed meanwhile waits its turn
// (rulebook v1.125, v1.127, v1.129; design review R2-05).
// Why it exists: each page kept its own "one change at a time" flag (begin / end). An Undo pressed
// while another save ran found the flag up and was dropped without a word, and staff believed it was
// undone. Now the Undo waits and runs as soon as that save ends, even when that save fails (v1.127);
// its toast says "Undoing…" meanwhile (lib/toastLine.js). When the person leaves the page while it
// waits or runs, it still runs (v1.129): if it fails after they left, the bar under the top bar of
// the page they're on names the change and the section (useLeftUndoBar, drawn by Shell.jsx).
//
// A page keeps one line in place of its own busy flag:
//   const line = useSaveLine({ section: 'Camps', showToast, undoBar });
//   const token = line.begin()   false while a save or an Undo runs, as today's begin (the page's
//                                buttons are unavailable meanwhile: line.busy). Otherwise a token for
//                                THIS save: keep it and give it back to end().
//   line.end(status, { retry, token })  the save ended. status: 'ok' or a failure. retry: how to do it
//                                again (what the page's own bar's Retry calls), kept for v1.127. Call
//                                it exactly once per begin(), from a finally, even when the save threw,
//                                or a waiting Undo waits forever. With the token, a stale or second
//                                end() does nothing (it can't free the line under a running Undo);
//                                without it, an end() while an Undo holds the line does nothing too.
//   line.busy                    true while anything runs.
//   line.undoAction(run, { words, doneText })   the toast's Undo button (the toast's `action`):
//       showToast(text, { icon: false, action: line.undoAction(run, { words: text }) })
//     run() does the Undo and returns { status, reason?, noRetry?, doneText? }:
//       'ok'     it worked. The page reloads what it shows inside run(); the toast then says
//                "Undone" (or doneText, e.g. "Undone. The day is open again.", v1.051).
//       'error'  it didn't reach the database. The page's bar says "Undo didn't save. Check the
//                connection, then retry.", with Retry. When the save it waited for failed too, one
//                bar covers both, "Neither change saved. …", and its Retry redoes that save, then
//                the Undo, in turn (v1.127). reason replaces the words and noRetry drops Retry (e.g.
//                a payment's Undo while private details are hidden on arrival).
//       'no_access'  the database locked this sign-in: the page locks the screen, and the line leaves
//                the same "Undo didn't save" bar with Retry, so after unlocking it is not silent.
//       other    the database refused it: reason (the page's own words) shows in the bar, without
//                Retry. No reason: no bar. (An 'error' or 'no_access' answer WITH a reason shows
//                that reason and does get a Retry, unless noRetry is set.)
//     An Undo whose run() never answers is given up on after 30 seconds and counts as not reached
//     ('error'), so it can't hold the line for good. An answer that comes in after the give-up is
//     ignored, so a later Retry may meet "already undone": the section's run() should answer 'ok'
//     for a change that is already undone (as for a double press).
//     So the page no longer shows "Undone" or its Undo's bars itself: the line does.
//   undoBar(bar | null)   the page's setter for the bar the line shows. One bar per page: the page
//                keeps it with its other bars and draws it with PageBar. bar = { text, retry,
//                retrying, takeFocus }: PageBar gets `retrying` so a Retry that is on its way can't be
//                pressed twice. null = an Undo worked: clear the bar if it's one of the line's (the
//                failed save's own bar stays, v1.127).
//   showToast    the app's showToast: "Undone" after a Retry from a bar.
//   section      the section's name, for the bar after leaving: "… (Camps)."
//
// createSaveLine is the same line outside React (the checks, src/lib/shared/checks.mjs).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { NEITHER_SAVED, UNDO, UNDO_DIDNT_SAVE, UNDONE, undoLeftDidntSave, undoLeftRefused } from '../components/text.js';

const UNDO_GIVE_UP_MS = 30000; // an Undo that never answers counts as not reached after this long

// ----- The bar for an Undo whose page has closed (v1.129): one, under the top bar -----
let leftBar = null; // { text, retry, retrying } or null
let epoch = 0; // one number per signed-in person: signing out moves it on (below)
const leftListeners = new Set();
function setLeftBar(bar) {
  leftBar = bar;
  for (const listener of leftListeners) listener();
}
function subscribeLeftBar(listener) {
  leftListeners.add(listener);
  return () => leftListeners.delete(listener);
}
export const leftUndoBar = () => leftBar;
export function useLeftUndoBar() {
  return useSyncExternalStore(subscribeLeftBar, leftUndoBar, () => null);
}
// Its × (Shell.jsx): the person closes the bar.
export function dismissLeftUndoBar() {
  setLeftBar(null);
}
// Signing out (App.jsx): the bar belongs to the person who pressed Undo. It goes, and an Undo still
// running for them can't bring one back for the next person: every Undo remembers the number it
// started under, and shows a left bar only if it is still the same.
export function endLeftUndoBarSession() {
  epoch += 1;
  setLeftBar(null);
}

// getOptions() answers the page's newest { section, showToast, undoBar, onBusyChange }.
export function createSaveLine(getOptions, { giveUpMs = UNDO_GIVE_UP_MS } = {}) {
  let busy = false; // a save or an Undo holds the line
  let holder = null; // who: a save's token (a number), or 'undo'
  let tokens = 0;
  let open = true; // the page is still showing
  const waiting = []; // the Undos waiting for the line, in order
  const options = () => getOptions() ?? {};
  const setBusy = (value) => {
    busy = value;
    options().onBusyChange?.(value);
  };

  // Hands the line on to the next Undo that waits (it runs at once, told how this save ended), or
  // frees it. An Undo never waits behind a save that started after it.
  function release(ended) {
    const next = waiting.shift();
    if (next) {
      holder = 'undo';
      next(ended);
    } else {
      holder = null;
      setBusy(false);
    }
  }
  // Holds the line: at once when it's free, else when it's handed on. Answers how the save it waited
  // for ended ({ failed, retry }), or null when it didn't wait.
  function take() {
    if (!busy) {
      holder = 'undo';
      setBusy(true);
      return Promise.resolve(null);
    }
    return new Promise((resolve) => waiting.push(resolve));
  }

  function begin() {
    if (busy) return false;
    tokens += 1;
    holder = tokens;
    setBusy(true);
    return holder;
  }
  function end(status, { retry = null, token } = {}) {
    if (!busy) return;
    // A save's end() frees the line only while that save holds it: a stale token, or an end() with
    // no token while an Undo holds it, does nothing.
    if (token !== undefined ? token !== holder : typeof holder !== 'number') return;
    release({ failed: status != null && status !== 'ok', retry });
  }

  // While a Retry from the bar under the top bar runs, that bar shows it (its Retry is unavailable).
  function leftRetry(again) {
    return async () => {
      if (!leftBar || leftBar.retrying) return;
      const trying = { ...leftBar, retrying: true };
      setLeftBar(trying);
      await again();
      // An Undo that ends with nothing to say (no bar of its own) must not leave the Retry unavailable.
      if (leftBar === trying) setLeftBar({ ...trying, retrying: false });
    };
  }

  // One Undo: waits its turn, runs, and says how it went (the toast, the page's bar, or after the
  // page has closed, the bar under the top bar). guard is shared by every Retry of this one Undo, so
  // a double press on a bar's Retry runs it once.
  async function undo(run, { words = '', doneText = null, fromBar = false, guard = { running: false } } = {}) {
    const startEpoch = epoch;
    const showLeft = (bar) => {
      if (epoch === startEpoch) setLeftBar(bar); // not for the next person after a sign-out
    };
    const before = await take();
    let result;
    let timer = 0;
    try {
      const tooLong = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ status: 'error' }), giveUpMs);
      });
      result = (await Promise.race([Promise.resolve().then(run), tooLong])) ?? { status: 'error' };
    } catch {
      result = { status: 'error' };
    }
    clearTimeout(timer);
    const { status } = result;
    const again = () => undo(run, { words, doneText, fromBar: true, guard });
    // An Undo that waits behind this one is told how this one went (v1.127 holds for it too).
    release({ failed: status !== 'ok', retry: again });
    const { undoBar, showToast, section } = options();

    if (status === 'ok') {
      if (open) undoBar?.(null);
      else if (fromBar && epoch === startEpoch) setLeftBar(null);
      // From a toast, the toast says "Undone" (lib/toastLine.js); from a bar's Retry, it's said here.
      // (Not for the next person after a sign-out: the epoch moved on.)
      if (fromBar && epoch === startEpoch) showToast?.(result.doneText ?? doneText ?? UNDONE, { icon: false });
      return { undone: true, doneText: result.doneText ?? doneText };
    }

    // It didn't work: which bar, if any. (no_access: the page locks the screen; the bar waits for
    // after the unlock, so it isn't silent.)
    const notReached = status === 'error' || status === 'no_access';
    // The page's own bar gets its Retry through here: one press at a time, shown as "retrying".
    const retryOnce = (inner, bar) => async () => {
      if (guard.running) return null;
      guard.running = true;
      if (open) options().undoBar?.({ ...bar, retrying: true });
      let outcome = null;
      try {
        outcome = await inner();
        return outcome;
      } finally {
        guard.running = false;
        // Nothing new to say (no bar of its own, not undone): the Retry must not stay unavailable.
        if (open && outcome && !outcome.undone && !outcome.barShown) options().undoBar?.({ ...bar, retrying: false });
      }
    };
    let bar = null;
    if (notReached && !result.reason) {
      bar =
        before?.failed && before.retry
          ? { text: NEITHER_SAVED, retry: async () => {
              // The first save is redone, but not waited for forever: a save that hangs is given up
              // on after the limit, and the Undo runs anyway (so the bar can't stay "retrying").
              let giveUp = 0;
              await Promise.race([
                Promise.resolve().then(before.retry).catch(() => {}),
                new Promise((resolve) => {
                  giveUp = setTimeout(resolve, giveUpMs);
                }),
              ]);
              clearTimeout(giveUp);
              return again();
            } }
          : { text: UNDO_DIDNT_SAVE, retry: again };
    } else if (result.reason) {
      bar = { text: result.reason, retry: notReached ? again : null };
    }
    if (!bar) return { undone: false, barShown: false };
    if (result.noRetry) bar.retry = null;

    if (open) {
      if (bar.retry) bar.retry = retryOnce(bar.retry, bar);
      undoBar?.({ ...bar, takeFocus: true });
    } else if (notReached && !result.reason) {
      // v1.129: the person left; the bar under the top bar names the change and the section.
      showLeft({ text: undoLeftDidntSave(words, section), retry: result.noRetry ? null : leftRetry(again), retrying: false });
    } else {
      showLeft({ text: undoLeftRefused(words, section, bar.text), retry: bar.retry ? leftRetry(again) : null, retrying: false });
    }
    return { undone: false, barShown: true };
  }

  function undoAction(run, { words = '', doneText = null, label = UNDO } = {}) {
    let pressed = false; // one press per toast: a second does nothing
    return {
      label,
      queued: true, // lib/toastLine.js: the toast says "Undoing…" until this settles
      onAction() {
        if (pressed) return Promise.resolve(null);
        pressed = true;
        return undo(run, { words, doneText });
      },
    };
  }

  return {
    begin,
    end,
    undoAction,
    isBusy: () => busy,
    open() {
      open = true;
    },
    close() {
      open = false;
    },
  };
}

// For a page: one line, kept for as long as the page shows. When the page closes, the line goes on
// running what's in it (v1.129); it only stops showing things on the page.
export function useSaveLine({ section, showToast, undoBar }) {
  const [busy, setBusy] = useState(false);
  const optionsRef = useRef({ section, showToast, undoBar, onBusyChange: setBusy });
  // The newest callbacks, before anything the page does after this render can call them.
  useLayoutEffect(() => {
    optionsRef.current = { section, showToast, undoBar, onBusyChange: setBusy };
  });
  const [line] = useState(() => createSaveLine(() => optionsRef.current));
  useEffect(() => {
    line.open();
    return () => line.close();
  }, [line]);
  return { begin: line.begin, end: line.end, undoAction: line.undoAction, isBusy: line.isBusy, busy };
}
