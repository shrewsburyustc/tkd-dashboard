// Toast.jsx — the small dark message at the bottom, e.g. "PIN set" or "Rank saved · Undo".
// Why it exists: guidelines 8 — success is shown as a toast that goes away by itself after
// 5 seconds, never as a pop-up you have to close. Bottom-right on PC and tablet; on phones it
// sits bottom-center, just above the bottom navigation bar (app.css, "Toast").
//
// Two kinds:
//   - Account toasts ("PIN set", "PIN changed", "Password changed") have a check icon and no
//     Undo: typing the new PIN/password twice was the confirmation.
//   - Testing toasts ("Rank saved · Undo", "High Green deleted") have no icon (as mocked up);
//     the ones for reversible changes carry an Undo button (guidelines 1.4).
//
// The 5-second timer PAUSES while the pointer is over the toast or keyboard focus is inside it,
// and resumes with the time that was left (decided v0.54 — people need time to reach Undo).
//
// The queued Undo (rulebook v1.125; design review R2-05; lib/toastLine.js decides what happens):
//   - pressing Undo turns the toast's button into "Undoing…" until the Undo is done, in the busy look
//     of the "Are you sure?" box's pressed button (v1.008, v1.103): grayed words and the busy cursor.
//     It stays a Tab stop, marked unavailable for screen readers, and a second press does nothing.
//     The toast doesn't go after 5 seconds meanwhile.
//   - the button is as wide as "Undoing…" from the start, so nothing moves when its words change:
//     both words sit in one spot, and the hidden one keeps the width (CSS only, no measuring).
//
// Props:
//   toast     { id, text, action: { label, onAction, queued? } | null, icon: boolean, busy: boolean }
//             or null. A new id restarts the 5 seconds (even for the same text).
//   onDismiss(id)  the 5 seconds are up
//   onUndo(id)     the Undo button was pressed (the toast line runs it and says how it went)
//
// The outer box is ALWAYS on the page with role="status": screen readers only announce text
// that appears inside a "live" area that already existed, so it can't come and go with the toast.
import { useEffect, useRef } from 'react';
import { IconArrowBackUp, IconCheck } from '@tabler/icons-react';
import { UNDOING } from './text.js';

const TOAST_MS = 5000; // 5 seconds

export default function Toast({ toast, onDismiss, onUndo }) {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  // The pausable timer. remainingRef = how much of the 5 seconds is left; startedAtRef = when
  // the current countdown started (null while paused). hoverRef / focusRef = why it's paused.
  const timerRef = useRef(null);
  const remainingRef = useRef(TOAST_MS);
  const startedAtRef = useRef(null);
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const idRef = useRef(null); // the toast the countdown is for

  function startCountdown() {
    window.clearTimeout(timerRef.current);
    startedAtRef.current = Date.now();
    const id = idRef.current;
    timerRef.current = window.setTimeout(() => onDismissRef.current(id), remainingRef.current);
  }

  function pause() {
    if (startedAtRef.current === null) return; // already paused
    window.clearTimeout(timerRef.current);
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
    startedAtRef.current = null;
  }

  function resumeIfFree() {
    // Only resume when neither the pointer nor the keyboard focus is on the toast, and no Undo runs.
    if (hoverRef.current || focusRef.current || startedAtRef.current !== null || toast?.busy) return;
    startCountdown();
  }

  // A new toast: a fresh 5 seconds. Cancel the timer if the toast goes early. While its Undo runs
  // ("Undoing…") there is no countdown: the toast stays until the Undo is done.
  const id = toast ? toast.id : null;
  const busy = Boolean(toast?.busy);
  useEffect(() => {
    if (id === null || busy) return undefined;
    idRef.current = id;
    remainingRef.current = TOAST_MS;
    hoverRef.current = false;
    focusRef.current = false;
    startCountdown();
    return () => {
      window.clearTimeout(timerRef.current);
      startedAtRef.current = null;
    };
    // (Only the toast's id and its busy state restart this: startCountdown reads nothing but refs.)
  }, [id, busy]);

  // Account toasts keep their check icon unless the caller says icon: false.
  const showIcon = toast ? toast.icon !== false : false;

  return (
    <div className="toast-region" role="status">
      {toast && (
        <div
          key={toast.id}
          className={toast.action ? 'toast toast--action' : 'toast'}
          onPointerEnter={() => {
            hoverRef.current = true;
            pause();
          }}
          onPointerLeave={() => {
            hoverRef.current = false;
            resumeIfFree();
          }}
          onFocus={() => {
            focusRef.current = true;
            pause();
          }}
          onBlur={(event) => {
            // relatedTarget = where focus went. Still inside the toast → stay paused.
            if (event.currentTarget.contains(event.relatedTarget)) return;
            focusRef.current = false;
            resumeIfFree();
          }}
        >
          {/* ti-check = "done" in the icon map (guidelines 2.4) */}
          {showIcon && <IconCheck size={16} aria-hidden="true" className="toast-icon" />}
          <span className="toast-text">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="toast-undo"
              aria-disabled={busy ? 'true' : undefined}
              onClick={() => {
                if (!busy) onUndo(toast.id);
              }}
            >
              {/* Both words in one spot: the hidden one keeps the button as wide as "Undoing…" */}
              <span className="toast-undo-words">
                <span className={`toast-undo-word${busy ? ' is-hidden' : ''}`}>
                  {/* ti-arrow-back-up = Undo */}
                  <IconArrowBackUp size={16} aria-hidden="true" />
                  {toast.action.label}
                </span>
                <span className={`toast-undo-word${busy ? '' : ' is-hidden'}`}>
                  <IconArrowBackUp size={16} aria-hidden="true" />
                  {UNDOING}
                </span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
