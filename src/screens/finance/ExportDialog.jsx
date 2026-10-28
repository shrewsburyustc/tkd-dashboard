// ExportDialog.jsx — "Export…": download a date range of payments as a CSV file (mockup D7, v0.200).
// Why it exists: the bookkeeper wants the numbers in a spreadsheet instead of retyping them.
// Admins pick From and To (default: this month so far), the school comes from the top bar, a
// line shows how many payments and their total, then "Download CSV". Each download is logged by
// the database (finance_export writes one log row per call), because the file holds students'
// names and amounts. File name: <School>-<from>-to-<to>.csv (v0.207).
//
// The count line comes from finance_export_preview (count + total only, nothing logged), asked
// 300 ms after the dates stop changing — so just LOOKING at the dialog never writes a log row;
// only Download does.
// Dates: the dashboard's own calendar, components/DatePicker.jsx (Star's, used as it is — v0.818,
// which carries out v1.018 for Export). The field shows the date in words ("Thu, Oct 1, 2026"),
// so the gray weekday line that used to sit under each box is gone. Days after today are gray and
// the calendar's gray line says so. To's calendar does NOT gray the days before From: picking one
// shows the error line "To must be on or after From." instead (as before).
// PC / tablet: a centered dialog; the calendar floats under the field. Phone: a full page with a
// back arrow; Download is full width; From and To stack on touch phones (their 16 px dates in
// words don't fit side by side; Jeffrey's choice, v0.818) and side by side with a mouse, and
// the calendar opens in the page under the field, edge to edge.
//
// Props: school (name), locationCode, today ('YYYY-MM-DD'), isPhone, onClose, onDone(), onNoAccess
import { useEffect, useId, useState } from 'react';
import { IconAlertTriangle, IconDownload } from '@tabler/icons-react';
import DatePicker from '../../components/DatePicker.jsx';
import Dialog from '../../components/Dialog.jsx';
import { csvFileName, toCsv } from '../../lib/finance/csv.js';
import { financeExport, financeExportPreview } from '../../lib/finance/financeApi.js';
import { daysBetween, monthStart } from './format.js';
import * as T from './text.js';

const PREVIEW_DELAY_MS = 300; // wait this long after the last date change before asking
const YEARS_BACK = 2; // the calendar's Year list: this year and the two before it

// What's wrong with the two dates, if anything: { from, to } messages (or null).
function checkDates(from, to, today) {
  const errors = { from: null, to: null };
  if (!from) errors.from = T.DATE_MISSING;
  else if (from > today) errors.from = T.DATE_FUTURE;
  if (!to) errors.to = T.DATE_MISSING;
  else if (to > today) errors.to = T.DATE_FUTURE;
  else if (from && to < from) errors.to = T.DATE_ORDER;
  else if (from && daysBetween(from, to) > 365) errors.to = T.DATE_TOO_LONG; // at most 366 days (Q4)
  return errors;
}

// The text of the CSV file. Header words and labels come from the screens' wording.
const CSV_HEADERS = {
  day: 'Date', school: 'School', time: 'Time', first_name: 'First name', last_name: 'Last name', what: 'For',
  event_date: 'Testing date', kind: 'Kind', method: 'Paid by', amount_cents: 'Amount', counted_cents: 'Counted in total',
  recorded_by_name: 'Recorded by', state: 'Status', note: 'Note',
}; // NOT IN MOCKUPS — for CP1 (D7 lists the columns, not their exact words)

export default function ExportDialog({ school, locationCode, today, isPhone, onClose, onDone, onNoAccess }) {
  const id = useId();
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [summary, setSummary] = useState(null); // { count, cents } or null while counting

  const errors = checkDates(from, to, today);
  const datesOk = !errors.from && !errors.to;

  // The Year list in each calendar (the picker itself adds the year on show).
  const thisYear = Number(today.slice(0, 4));
  const years = Array.from({ length: YEARS_BACK + 1 }, (_, i) => thisYear - YEARS_BACK + i);

  // Opening: keyboard focus on From. (The picker's field is drawn by the shared part, which has no
  // data-autofocus prop, so this screen moves focus there itself. It runs after the Dialog's own
  // "focus the box" step, because a parent's effects run after its children's.)
  useEffect(() => {
    document.getElementById(`${id}-from`)?.focus();
  }, [id]);

  // The count line: one preview call, once the dates have been still for 300 ms.
  useEffect(() => {
    setSummary(null);
    if (!datesOk) return undefined;
    let stale = false;
    const timer = window.setTimeout(() => {
      financeExportPreview({ locationCode, from, to }).then((answer) => {
        // A failed preview just leaves the line empty; Download still works.
        if (stale) return;
        setSummary(answer.status === 'ok' ? { count: answer.count ?? 0, cents: answer.total_cents ?? 0 } : { failed: true });
      });
    }, PREVIEW_DELAY_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [from, to, locationCode, datesOk]);

  async function download() {
    setTried(true);
    if (!datesOk || busy) return;
    setBusy(true);
    setFailed(false);
    const answer = await financeExport({ locationCode, from, to });
    setBusy(false);
    if (answer.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (answer.status !== 'ok') {
      setFailed(true);
      return;
    }
    // Build the file in the browser and hand it to the browser's download.
    const text = toCsv(answer.rows ?? [], { headers: CSV_HEADERS });
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = csvFileName(school, from, to);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000); // free the memory once the download started
    onDone();
  }

  // One date: its small label, the picker's field (and, on phones, its calendar in the page),
  // then the error line when there is one.
  const dateField = (key, label, value, onChange) => {
    const error = tried || value ? errors[key] : null;
    return (
      <div className="fin-date-field">
        <span className="fin-lbl" aria-hidden="true">
          {label}
        </span>
        <DatePicker
          id={`${id}-${key}`}
          label={label}
          value={value}
          today={today}
          max={today}
          years={years}
          hint={T.DAYS_AFTER_TODAY}
          invalid={Boolean(error)}
          describedBy={error ? `${id}-${key}-err` : undefined}
          inline={isPhone}
          onChange={onChange}
        />
        {error && (
          <p id={`${id}-${key}-err`} className="fin-field-error">
            <IconAlertTriangle size={14} aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <Dialog title={T.EXPORT_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onClose}>
      <p className="tdialog-sub fin-export-hint">{T.EXPORT_HINT}</p>
      <div className="fin-dates">
        {dateField('from', T.FROM, from, setFrom)}
        {dateField('to', T.TO, to, setTo)}
      </div>
      <div className="fin-export-school">
        <p className="fin-lbl">{T.SCHOOL}</p>
        <p>
          {school} <span className="fin-hint">{T.FROM_TOP_BAR}</span>
        </p>
      </div>
      <p className="fin-export-summary" aria-live="polite">
        {!datesOk || summary?.failed ? '' : summary ? T.exportSummary(summary.count, summary.cents) : T.EXPORT_COUNTING}
      </p>
      {failed && (
        <div className="notice" role="alert">
          <IconAlertTriangle size={16} aria-hidden="true" className="notice-icon" />
          <span>{T.EXPORT_FAILED}</span>
        </div>
      )}
      <div className="dialog-actions">
        {!isPhone && (
          <button type="button" className="btn" onClick={onClose}>
            {T.CANCEL}
          </button>
        )}
        <button
          type="button"
          className={`btn btn-primary${isPhone ? ' btn-block' : ''}`}
          aria-disabled={busy ? 'true' : undefined}
          onClick={download}
        >
          <IconDownload size={16} aria-hidden="true" />
          {T.DOWNLOAD_CSV}
        </button>
      </div>
    </Dialog>
  );
}
