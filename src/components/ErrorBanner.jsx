// ErrorBanner.jsx — the amber bar at the top of a list when something didn't work.
// Why it exists: guidelines 3.5 — a failed save is never silent. The banner says what happened
// and what to do, offers Retry where trying again makes sense, and NEVER closes by itself:
// it stays until Retry works or the person dismisses it (the X button).
// Amber with the warning triangle and words — never red, never color alone (guidelines 7).
//
// Props:
//   text       the message (from src/screens/testing/text.js)
//   onRetry    optional — shows the "Retry" button
//   onDismiss  optional — shows the X ("Dismiss") button
//   retrying   true while a retry is on its way (the Retry button is then unavailable)
import { IconAlertTriangle, IconRefresh, IconX } from '@tabler/icons-react';
import IconButton from './IconButton.jsx';
import { DISMISS, RETRY } from '../screens/testing/text.js';

export default function ErrorBanner({ text, onRetry, onDismiss, retrying = false }) {
  return (
    // role="alert": screen readers announce it as soon as it appears.
    <div className="errbar" role="alert">
      <IconAlertTriangle size={16} aria-hidden="true" className="errbar-icon" />
      <span className="errbar-text">{text}</span>
      {(onRetry || onDismiss) && (
        <span className="errbar-actions">
          {onRetry && (
            <button
              type="button"
              className="btn errbar-retry"
              aria-disabled={retrying ? 'true' : undefined}
              onClick={() => {
                if (!retrying) onRetry();
              }}
            >
              {/* ti-refresh = Retry */}
              <IconRefresh size={16} aria-hidden="true" />
              {RETRY}
            </button>
          )}
          {/* ti-x = close; icon-only, so it gets the "Dismiss" tooltip too */}
          {onDismiss && <IconButton label={DISMISS} Icon={IconX} className="errbar-dismiss" onClick={onDismiss} />}
        </span>
      )}
    </div>
  );
}
