// eventReportCsv.js — the CSV file of one event's money report ("Download CSV" on the report page).
// Why it exists: the boss wants each event's money as a spreadsheet, like Finance's Export… but for ONE
// event. The database (finance_event_export, migration 0054) sends the same rows as finance_export, plus
// each row's event_name; this file turns them into the file text with csv.js's own rules (quoting, the
// formula guard, CRLF lines, the byte-order mark), adding ONE extra first column, "Event", so a file
// opened later (or several files put together) still says which event each line belongs to.
// It also names the file and hands it to the browser. The first two are PURE (no browser), so Node's
// checks can test them; only downloadCsvFile touches the page.
import { toCsv } from './csv.js';

// The header words. Same as Finance's Export file, plus "Event" first. "Event date" (not "Testing date"):
// a camp or a Board breaking event is not a testing.
export const EVENT_CSV_HEADERS = {
  event_name: 'Event', day: 'Date', school: 'School', time: 'Time', first_name: 'First name', last_name: 'Last name',
  what: 'For', event_date: 'Event date', kind: 'Kind', method: 'Paid by', amount_cents: 'Amount',
  counted_cents: 'Counted in total', recorded_by_name: 'Recorded by', state: 'Status', note: 'Note',
};

// rows: finance_event_export's `rows` (snake_case, exactly as the database sends them)
export function eventReportCsv(rows) {
  return toCsv(rows, { headers: EVENT_CSV_HEADERS, leading: [['event_name', 'text']] });
}

// 'April-Vacation-Camp-Both-schools-money-report.csv' / 'Fall-Star-Test-Worcester-money-report.csv'
// schoolName: 'Worcester' | 'Shrewsbury' | 'Both' (the top bar's words).
export function eventReportFileName(eventName, schoolName) {
  const clean = (text, fallback) => {
    const safe = String(text ?? '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return safe || fallback;
  };
  const school = schoolName === 'Both' ? 'Both-schools' : clean(schoolName, 'School');
  return `${clean(eventName, 'Event')}-${school}-money-report.csv`;
}

// Builds the file in the browser and starts the download (the same steps as the Export… dialog).
export function downloadCsvFile(text, fileName) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000); // free the memory once the download started
}
