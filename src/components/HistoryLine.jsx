// HistoryLine.jsx — the history line at the end of a person's summary, and its list (design review
// M7, rulebook v1.010 / v1.108).
// Why it exists: rulebook v1.010 — every person's summary ends with Prospects' one line,
// "History · 3 changes ›"; a tap opens the list right there, newest first: what changed, then
// when · who. Star has a five-row block today, Prospects its own line; Color Belt, Camps and Black
// Belt have none. This is the one line:
//   - a button (screen readers hear collapsed / expanded) whose arrow points right while closed
//     and down while open (detail a, §2.4 — the one place › doesn't open a page);
//   - the list: the section's words for what changed, then the date and the name the same way
//     everywhere — the date only, in Massachusetts time: "Oct 22 · Jeffrey Berg";
//   - (b) while it reads: "History" with a gray "Loading…" (not yet a button); if it can't read:
//     the shared amber bar with Retry under the line, until it works or the summary closes
//     (v1.004); with nothing recorded: plain text, "History · no changes yet", nothing to open;
//   - with Hide private details on, changes about money are left out of the count and the list,
//     and one gray line says so: "Payment history is hidden on this tablet." (Star's words, v0.506).
// Each section reads its own history and words it (Color Belt, Camps and Black Belt each need a
// reader first, in their own prompts). Nothing switches to it in Dashboard core step 1.
//
// Props:
//   load()            the section's reader: a promise of its history rows (any shape); it is
//                     called once when the line appears (the summary opens) and again on Retry
//   describe(row, { hidden })   the section's words for one row:
//                       { text, at, who }        a line: what changed; when (a timestamp — text,
//                                                milliseconds or a Date — or a school date
//                                                'YYYY-MM-DD'; lib/historyDates.js); who
//                                                ("Jeffrey Berg")
//                       { hiddenPayment: true }  a change about money while hidden (left out, counted
//                                                for the gray line)
//                       null                     nothing to show for this row
//   hidden            Hide private details is on
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import ErrorBanner from './ErrorBanner.jsx';
import { HISTORY, HISTORY_LOADING, HISTORY_LOAD_FAILED, HISTORY_NONE, HISTORY_PAYMENTS_HIDDEN, historyCount, historyWhen } from './text.js';
// The dates: "Oct 22" (a timestamp in Massachusetts time, a school date as it is) and newest first
// by real time — one reading of a date for both, so a row never shows one date and sorts by another.
import { historyDate, newestFirst } from '../lib/historyDates.js';

export default function HistoryLine({ load, describe, hidden = false }) {
  const listId = useId();
  // { phase: 'loading' } · { phase: 'ok', rows } · { phase: 'failed' }
  const [state, setState] = useState({ phase: 'loading' });
  const [open, setOpen] = useState(false);

  // The newest load function, kept in a "ref" (a box React doesn't watch), so a new function from
  // the section never makes the history load again.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  // Reads the history. `isCurrent` says whether the line is still waiting for this answer (the
  // summary may have closed meanwhile).
  const read = useCallback(async (isCurrent = () => true) => {
    setState({ phase: 'loading' });
    try {
      const rows = await loadRef.current();
      if (isCurrent()) setState({ phase: 'ok', rows: Array.isArray(rows) ? rows : [] });
    } catch {
      if (isCurrent()) setState({ phase: 'failed' });
    }
  }, []);

  useEffect(() => {
    let current = true;
    read(() => current);
    return () => {
      current = false;
    };
  }, [read]);

  if (state.phase === 'loading') {
    return (
      <div className="hist-none">
        <span className="hist-label">{HISTORY}</span>
        <span className="hist-wait">{HISTORY_LOADING}</span>
      </div>
    );
  }
  if (state.phase === 'failed') {
    return (
      <>
        <div className="hist-none">
          <span className="hist-label">{HISTORY}</span>
        </div>
        <div className="hist-error">
          <ErrorBanner text={HISTORY_LOAD_FAILED} onRetry={() => read()} />
        </div>
      </>
    );
  }

  // The section's words for each row; money rows left out while hidden (and counted for the line).
  let hiddenPayments = 0;
  const entries = [];
  for (const row of state.rows) {
    const words = describe(row, { hidden });
    if (!words) continue;
    if (words.hiddenPayment) {
      if (hidden) hiddenPayments += 1;
      continue;
    }
    entries.push(words);
  }
  entries.sort(newestFirst);
  const hiddenLine = hidden && hiddenPayments > 0 && <p className="field-hint hist-hidden-line">{HISTORY_PAYMENTS_HIDDEN}</p>;

  if (entries.length === 0) {
    // Nothing to open. (Only money changes, and they're hidden: the line says "History" and the
    // gray line says why there is nothing to show.)
    return hiddenLine ? (
      <>
        <div className="hist-none">
          <span className="hist-label">{HISTORY}</span>
        </div>
        {hiddenLine}
      </>
    ) : (
      <div className="hist-none">
        <span className="hist-label">{HISTORY} ·</span>
        <span>{HISTORY_NONE}</span>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="hist-btn" aria-expanded={open ? 'true' : 'false'} aria-controls={listId} onClick={() => setOpen((now) => !now)}>
        <span className="hist-label">{historyCount(entries.length)}</span>
        {/* ti-chevron-right while closed, ti-chevron-down while open (rulebook v1.108, §2.4) */}
        {open ? <IconChevronDown size={16} aria-hidden="true" /> : <IconChevronRight size={16} aria-hidden="true" />}
      </button>
      {open && (
        <>
          <ul id={listId} className="hist-list" aria-label={HISTORY}>
            {entries.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="hist-item">
                <span className="hist-text">{entry.text}</span>
                <span className="hist-meta">{historyWhen(historyDate(entry.at), entry.who)}</span>
              </li>
            ))}
          </ul>
          {hiddenLine}
        </>
      )}
    </>
  );
}
