// Toast.jsx — the small "done" message, e.g. "PIN set", "PIN changed", "Password changed".
// Why it exists: guidelines 8 — success is shown as a toast that goes away by itself after
// 5 seconds, never as a pop-up you have to close. Bottom-right on PC and tablet; on phones it
// sits bottom-center, just above the bottom navigation bar (app.css, "Toast").
// These account toasts have no Undo: typing the new PIN/password twice was the confirmation.
//
// Props:
//   toast     { id, text } or null. A new id restarts the 5 seconds (even for the same text).
//   onDismiss called when the 5 seconds are up
//
// The outer box is ALWAYS on the page with role="status": screen readers only announce text
// that appears inside a "live" area that already existed, so it can't come and go with the toast.
import { useEffect, useRef } from 'react';
import { IconCheck } from '@tabler/icons-react';

const TOAST_MS = 5000; // 5 seconds

export default function Toast({ toast, onDismiss }) {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  // Start the 5-second timer each time a new toast appears; cancel it if the toast goes early.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => onDismissRef.current(), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div className="toast-region" role="status">
      {toast && (
        <div key={toast.id} className="toast">
          {/* ti-check = "done" in the icon map (guidelines 2.4) */}
          <IconCheck size={16} aria-hidden="true" className="toast-icon" />
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
