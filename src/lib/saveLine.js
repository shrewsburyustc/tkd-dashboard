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
//   line.begin()                 false while a save or an Undo runs, as today's begin (the page's
//                                buttons are unavailable meanwhile: line.busy).
//   line.end(status, { retry })  the save ended. status: 'ok' or a failure. retry: how to do it again
//                                (what the page's own bar's Retry calls), kept for v1.127. Call it
//                                every time, even when the save threw, or a waiting Undo waits forever.
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
//       other    the database refused it: reason (the page's own words) shows in the bar, without
//                Retry. No reason (e.g. 'no_access', where the page locks the screen): no bar.
//     So the page no longer shows "Undone" or its Undo's bars itself: the line does.
//   undoBar(bar | null)   the page's setter for the bar the line shows. One bar per page: the page
//                keeps it with its other bars and draws it with PageBar. bar = { text, retry,
//                takeFocus }. null = an Undo worked: clear the bar if it's one of the line's (the
//                failed save's own bar stays, v1.127).
//   showToast    the app's showToast: "Undone" after a Retry from a bar.
//   section      the section's name, for the bar after leaving: "… (Camps)."
//
// createSaveLine is the same line outside React (the checks, src/lib/shared/checks.mjs).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { NEITHER_SAVED, UNDO, UNDO_DIDNT_SAVE, UNDONE, undoLeftDidntSave, undoLeftRefused } from '../components/text.js';

// ----- The bar for an Undo whose page has closed (v1.129): one, under the top bar -----
let leftBar = null; // { text, retry, retrying } or null
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
// Its × (Shell.jsx), and signing out (App.jsx): it belongs to the person who pressed Undo.
export function dismissLeftUndoBar() {
  setLeftBar(null);
}

// getOptions() answers the page's newest { section, showToast, undoBar, onBusyChange }.
export function createSaveLine(getOptions) {
  let busy = false; // a save or an Undo holds the line
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
    if (next) next(ended);
    else setBusy(false);
  }
  // Holds the line: at once when it's free, else when it's handed on. Answers how the save it waited
  // for ended ({ failed, retry }), or null when it didn't wait.
  function take() {
    if (!busy) {
      setBusy(true);
      return Promise.resolve(null);
    }
    return new Promise((resolve) => waiting.push(resolve));
  }

  function begin() {
    if (busy) return false;
    setBusy(true);
    return true;
  }
  function end(status, { retry = null } = {}) {
    if (!busy) return;
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
  // page has closed, the bar under the top bar).
  async function undo(run, { words = '', doneText = null, fromBar = false } = {}) {
    const before = await take();
    let result;
    try {
      result = (await run()) ?? { status: 'error' };
    } catch {
      result = { status: 'error' };
    }
    const { status } = result;
    const again = () => undo(run, { words, doneText, fromBar: true });
    // An Undo that waits behind this one is told how this one went (v1.127 holds for it too).
    release({ failed: status !== 'ok', retry: again });
    const { undoBar, showToast, section } = options();

    if (status === 'ok') {
      if (open) undoBar?.(null);
      else if (fromBar) setLeftBar(null);
      // From a toast, the toast says "Undone" (lib/toastLine.js); from a bar's Retry, it's said here.
      if (fromBar) showToast?.(result.doneText ?? doneText ?? UNDONE, { icon: false });
      return { undone: true, doneText: result.doneText ?? doneText };
    }

    // It didn't work: which bar, if any.
    const notReached = status === 'error';
    let bar = null;
    if (notReached && !result.reason) {
      bar =
        before?.failed && before.retry
          ? {
              text: NEITHER_SAVED,
              retry: async () => {
                await before.retry();
                await again();
              },
            }
          : { text: UNDO_DIDNT_SAVE, retry: again };
    } else if (result.reason) {
      bar = { text: result.reason, retry: notReached ? again : null };
    }
    if (!bar) return { undone: false };
    if (result.noRetry) bar.retry = null;

    if (open) {
      undoBar?.({ ...bar, takeFocus: true });
    } else if (notReached && !result.reason) {
      // v1.129: the person left; the bar under the top bar names the change and the section.
      setLeftBar({ text: undoLeftDidntSave(words, section), retry: result.noRetry ? null : leftRetry(again), retrying: false });
    } else {
      setLeftBar({ text: undoLeftRefused(words, section, bar.text), retry: bar.retry ? leftRetry(again) : null, retrying: false });
    }
    return { undone: false };
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
