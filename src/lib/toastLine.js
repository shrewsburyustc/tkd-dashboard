// toastLine.js — the one toast at the bottom of the screen, its "Undoing…" state and its waiting
// slot (rulebook v1.125, v1.126; design review R2-05). App.jsx keeps one of these and draws it with
// components/Toast.jsx; the parts page keeps its own for its sample.
// Why it exists: before, pressing Undo removed the toast at once, and an Undo pressed while another
// save was running was dropped without a word. Now (v1.125) the toast stays and says "Undoing…"
// until the Undo is done, then "Undone"; and a toast that arrives meanwhile waits for it (v1.126).
//
// How it works (a small "store": plain JavaScript that React reads with useSyncExternalStore, as
// lib/connection.js does):
//   show(text, { action, icon })  a new toast. While an Undo runs, it waits instead; only the newest
//                                 waiting one is kept. When the Undo is done, that one shows with its
//                                 full 5 seconds, and "Undone" is skipped (the page shows the Undo
//                                 worked).
//   clear()                       a section's clearToast (e.g. after a failed save): drops the toast
//                                 and the waiting one, but never the "Undoing…" one (v1.127: the
//                                 failed save no longer clears it).
//   drop()                        the page changed, the screen locked, the school changed or an
//                                 account dialog opened: everything goes. An Undo that is running
//                                 goes on (lib/saveLine.js), but nothing more is said here (v1.129).
//   dismiss(id)                   its 5 seconds are up (never an "Undoing…" toast).
//   pressUndo(id)                 the toast's Undo was pressed (Toast.jsx). An action made by the save
//                                 line (`queued: true`, lib/saveLine.js) turns the toast into
//                                 "Undoing…" until it settles; a second press does nothing. A section
//                                 that hasn't switched to the save line yet keeps today's way: the
//                                 toast goes first, then its Undo runs.
// A toast is { id, text, action: { label, onAction, queued? } | null, icon, busy }.
import { useState, useSyncExternalStore } from 'react';
import { UNDONE } from '../components/text.js';

const UNDO_GIVE_UP_MS = 30000; // see pressUndo

export function createToastLine() {
  let current = null; // the toast on screen, or null
  let waiting = null; // a toast that came while "Undoing…" showed (v1.126)
  let nextId = 1;
  const listeners = new Set();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  const make = (text, { action = null, icon = true } = {}) => ({ id: nextId++, text, action, icon, busy: false });
  const set = (toast) => {
    current = toast;
    changed();
  };

  const line = {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    show(text, options) {
      const toast = make(text, options);
      if (current?.busy) waiting = toast;
      else set(toast);
    },
    clear() {
      waiting = null;
      if (current && !current.busy) set(null);
    },
    drop() {
      waiting = null;
      if (current) set(null);
    },
    dismiss(id) {
      if (current && current.id === id && !current.busy) set(null);
    },
    async pressUndo(id) {
      const toast = current;
      if (!toast || toast.id !== id || !toast.action || toast.busy) return; // a second press does nothing
      const { action } = toast;
      if (!action.queued) {
        // Not switched to the save line yet: as before, the toast goes first, so only one Undo runs.
        set(null);
        action.onAction();
        return;
      }
      set({ ...toast, busy: true });
      let result = null;
      // A safety net: an Undo that never answers (a call with no time limit) would leave "Undoing…"
      // up for good, with every later toast waiting behind it. After 30 seconds it counts as not done.
      let timer = 0;
      const tooLong = new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), UNDO_GIVE_UP_MS);
      });
      try {
        result = await Promise.race([action.onAction(), tooLong]);
      } catch {
        result = null;
      }
      clearTimeout(timer);
      // Dropped meanwhile (the person left the page): nothing more is said here (v1.129).
      if (!current || current.id !== id) return;
      if (waiting) {
        // v1.126: the newest toast that waited shows now, with its full 5 seconds; "Undone" is skipped.
        const next = { ...waiting, id: nextId++ };
        waiting = null;
        set(next);
      } else if (result?.undone) {
        set(make(result.doneText ?? UNDONE, { icon: false }));
      } else {
        set(null); // it didn't work: the amber bar says why
      }
    },
  };
  return line;
}

// For a React screen: one toast line, kept for as long as the screen, and the toast it shows now.
export function useToastLine() {
  const [line] = useState(createToastLine);
  const toast = useSyncExternalStore(line.subscribe, line.get, () => null);
  return { toast, line };
}
