// PrivateTestingsList.jsx — the "Private testings · 2" list on the Events tab (mockup P8,
// contract 0014 §5.10).
// Why it exists: a private testing happens on its own day, away from the testing day, so it is
// easy to forget. This list sits above the Upcoming / Past switch for staff and admins and shows
// every private testing of this school that has no result yet, soonest first — also one whose day
// has passed (it stays until it is graded, v0.228). Open goes to the student's private grading page.
//   PC / tablet: a small table — Day · Time · Student · Class · Event · Open
//   Phone: stacked rows — the name, "Tue, Dec 1 · 4:00 PM · Group A", the event; Open on the right
// No Private tag on these rows (the list title says it). EventsTab hides the whole list while
// loading, on a load error, and when there is nothing to show.
// This file only DRAWS; EventsTab loads the rows (eventsApi.loadEvents → privateTestings).
import * as T from '../text.js';

// rows: [{ registrationId, eventId, eventName, firstName, lastName, className, privateDate,
//          privateTime }] already sorted (eventRules.privateTestingsList)
// onOpen(row): open that student's private grading page
export default function PrivateTestingsList({ rows, isPhone, isTouch, onOpen }) {
  const headingId = 'private-testings-heading';
  const openButton = (row) => {
    const name = T.studentLabel(row);
    return (
      <button type="button" className="btn btn-sm pt-open" aria-label={T.openPrivateLabel(name)} onClick={() => onOpen(row)}>
        {T.OPEN}
      </button>
    );
  };
  return (
    <section className={`clist pt-list${isPhone ? ' is-phone' : ''}${isTouch ? ' is-touch' : ''}`} aria-labelledby={headingId}>
      {/* "Private testings · 2" — the count in gray, as drawn */}
      <h2 id={headingId} className="pt-heading" aria-label={T.privateTestingsHeading(rows.length)}>
        {T.PRIVATE_TESTINGS}
        <span className="pt-count">{T.privateTestingsCount(rows.length)}</span>
      </h2>
      {isPhone ? (
        <ul className="pt-rows">
          {rows.map((row) => (
            <li key={row.registrationId} className="pt-row is-phone">
              <span className="pt-phone-main">
                <span className="ev-sname">{T.studentLabel(row)}</span>
                <span className="pt-l2">{T.privateListPhoneLine(row.privateDate, row.privateTime, row.className)}</span>
                <span className="pt-l2">{row.eventName}</span>
              </span>
              {openButton(row)}
            </li>
          ))}
        </ul>
      ) : (
        <table className="pt-table">
          <thead>
            <tr>
              <th scope="col">{T.COL_DAY}</th>
              <th scope="col">{T.COL_TIME}</th>
              <th scope="col">{T.COL_STUDENT}</th>
              <th scope="col">{T.COL_CLASS}</th>
              <th scope="col">{T.COL_EVENT}</th>
              <th scope="col">
                <span className="visually-hidden">{T.ACTIONS_COL}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.registrationId}>
                <td className="nowrap">{T.weekdayMonthDay(row.privateDate)}</td>
                <td className="nowrap">{T.timeLabel(row.privateTime)}</td>
                <td className="pt-name">{T.studentLabel(row)}</td>
                <td>{row.className}</td>
                <td>{row.eventName}</td>
                <td className="pt-acts">{openButton(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
