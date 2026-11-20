// MoneyReportButton.jsx — the "Money report" button for the header of an event's page (picture ER1, answer A).
// Why it exists: the boss wants every event to have its own report like Finance's Daily report. One button,
// the same words everywhere (Color belt event, Star event, Black Belt cycle, camp, Board breaking event),
// opens that event's Money report page (finance/EventReport.jsx, address #finance/event-report/<source>/<id>).
//
// Who sees it (picture ER1 D): admins only, and not while "Hide private details" is on for this device
// (the report is all payments). For staff and for a hidden-details device it draws NOTHING. This is for
// showing or hiding only: the database (finance_event_report) refuses staff on its own.
//
// How it opens the report: it sets the page address (the part after "#"). The app already listens for
// address changes (Back / Forward and typed addresses) and opens whatever page the address names, so the
// button needs nothing from the event page but the two ids — and Back from the report works as everywhere.
//
// Use (one line in the page header's button row):
//   <MoneyReportButton source="camp" eventId={camp.id} isAdmin={isAdmin} />
//   source: 'color_belt' | 'star' | 'camp' | 'black_belt' | 'board_breaking'
//   eventId: the event's id (a Color Belt / Star / Board breaking event, a camp, or a Black Belt cycle)
//   isAdmin: the page's own admin flag (every event page already has one)
import { IconReportMoney } from '@tabler/icons-react';
import { EVENT_REPORT_SOURCES } from '../../lib/pageAddress.js';
import { usePaymentsHidden } from './usePaymentsHidden.js';
import * as T from './text.js';

export default function MoneyReportButton({ source, eventId, isAdmin, className = '' }) {
  const [hidden] = usePaymentsHidden();
  if (!isAdmin || hidden || !eventId || !EVENT_REPORT_SOURCES.includes(source)) return null;
  return (
    <button
      type="button"
      className={`btn ${className}`.trim()}
      onClick={() => {
        // Setting the hash adds a history step and fires the app's address listener (popstate).
        window.location.hash = `#finance/event-report/${source}/${eventId}`;
      }}
    >
      {/* ti-report-money = the same icon as the Finance section */}
      <IconReportMoney size={16} aria-hidden="true" />
      {T.MONEY_REPORT}
    </button>
  );
}
