// StudentHistoryDialog.jsx — "History · Eli Park": who changed a student, when, newest first (roster ⋯ → History).
// Why it exists: staff and admins need to see what happened to one student (boards changed, paid, undone, moved to
// another class) without asking the database owner. The reader (brk_registration_history, migration 0051) gives the
// change-log rows with no login ids; breakingHistory.js groups them by save and words each save in plain English
// ("Boards 4 → 3 Technical; Paid $12 by check"), and this box lists them as the shared History line does:
// what changed, then "Oct 22 · Jeffrey Berg" (lib/historyDates.js: the date in Massachusetts time).
//   - Hide private details on: money changes are left out and one gray line says so (as components/HistoryLine.jsx).
//   - A failed read shows the shared amber bar with Retry; a locked sign-in (no_access) calls onNoAccess.
//   - Loads when the box opens, and again on Retry. Closing while it loads ignores the late answer.
//
// Props: registration (the roster row: id, firstName, lastName), classes (optional [{ id, name }] so a class change
//   can name the classes), isPhone, onClose(), onNoAccess().
import { useCallback, useEffect, useState } from 'react';
import Dialog from '../../../components/Dialog.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import { loadRegistrationHistory } from '../../../lib/breaking/breakingApi.js';
import { describeBatch, groupHistory } from '../../../lib/breaking/breakingHistory.js';
import { historyDate, newestFirst } from '../../../lib/historyDates.js';
import { usePrivateDetailsHidden } from '../../../lib/privateDetails.js';
import * as T from '../../../lib/breaking/text/dialogs.js';
import '../../../styles/breaking-dialogs.css';

export default function StudentHistoryDialog({ registration, classes = null, isPhone = false, onClose, onNoAccess }) {
  const [hidden] = usePrivateDetailsHidden();
  const [state, setState] = useState({ phase: 'loading' }); // loading · ok (+ rows) · failed
  const [retrying, setRetrying] = useState(false);
  const name = `${registration.firstName} ${registration.lastName}`;

  const read = useCallback(
    async (isCurrent) => {
      const answer = await loadRegistrationHistory(registration.id);
      if (!isCurrent()) return;
      if (answer.status === 'ok') setState({ phase: 'ok', rows: answer.rows });
      else {
        if (answer.status === 'no_access') onNoAccess?.();
        setState({ phase: 'failed' });
      }
    },
    [registration.id, onNoAccess],
  );
  useEffect(() => {
    let current = true;
    read(() => current);
    return () => {
      current = false;
    };
  }, [read]);

  async function retry() {
    setRetrying(true);
    setState({ phase: 'loading' });
    await read(() => true);
    setRetrying(false);
  }

  // The saves in words, newest first; money saves are left out while hidden.
  let entries = [];
  if (state.phase === 'ok') {
    entries = groupHistory(state.rows).map((batch) => describeBatch(batch, { hidden, classes })).filter((e) => e && !e.hiddenPayment).sort(newestFirst);
  }

  return (
    <Dialog title={T.historyTitle(name)} size="detail" fullScreen={isPhone} onRequestClose={onClose}>
      <div className="brk-history">
        {state.phase === 'loading' && <p className="brk-history-note">{T.HISTORY_LOADING}</p>}
        {state.phase === 'failed' && <ErrorBanner text={T.HISTORY_FAILED} onRetry={retry} retrying={retrying} />}
        {state.phase === 'ok' && entries.length === 0 && <p className="brk-history-note">{T.HISTORY_NONE_YET}</p>}
        {entries.length > 0 && (
          <ul className="hist-list" aria-label={T.historyTitle(name)}>
            {entries.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="hist-item">
                <span className="hist-text">{entry.text}</span>
                <span className="hist-meta">{T.historyWhen(historyDate(entry.at), entry.who)}</span>
              </li>
            ))}
          </ul>
        )}
        {hidden && state.phase === 'ok' && <p className="field-hint hist-hidden-line">{T.HISTORY_HIDDEN}</p>}
      </div>
      {!isPhone && (
        <div className="dialog-actions">
          <button type="button" className="btn" data-autofocus="true" onClick={onClose}>
            {T.CLOSE}
          </button>
        </div>
      )}
    </Dialog>
  );
}
