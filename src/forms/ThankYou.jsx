// ThankYou.jsx — the screen after a sign-up is saved (mockup screen 8, last phone).
// Why it exists: the family sees a short "Thanks, Maria!" heading, the form's own thank-you
// message under it ({parent} and {class time} filled in; F3 difference 3), each child's booked free class, and "Add to calendar" (an .ics file made in the
// browser, when the form has that switch on). Emails are OFF at launch (rulebook v0.601), so
// this screen IS the confirmation: it asks the family to take a screenshot or write the time
// down, and never says an email was sent.
import { IconCalendarPlus, IconCheck } from '@tabler/icons-react';
import { downloadIcs, icsText } from './ics.js';
import * as T from './text.js';

export default function ThankYou({ form, sent, headingRef }) {
  const { bookings, values } = sent;
  const childName = (i) => values.children[i]?.first_name?.trim() || `Child ${i + 1}`;
  const message = T.thankYouBody(form.thankYou, { parentName: values.answers.parent_name, bookings });

  function addToCalendar() {
    const text = icsText({
      events: bookings.map((b) => ({
        title: T.calendarTitle(childName(b.child), b.className), date: b.date, start: b.start, end: b.end,
        location: form.schoolName ? `${T.SCHOOL}, ${form.schoolName}` : T.SCHOOL,
      })),
    });
    downloadIcs(text, T.calendarFile);
  }

  return (
    <section className="fp-card fp-done" aria-labelledby="fp-done-title">
      <div className="fp-done__ok" aria-hidden="true">
        <IconCheck size={24} />
      </div>
      <h1 id="fp-done-title" className="fp-title" ref={headingRef} tabIndex={-1}>
        {T.thanksHeading(values.answers.parent_name)}
      </h1>
      {message && <p className="fp-done__text">{message}</p>}
      {bookings.length > 0 && (
        <div className="fp-done__times">
          <h2 className="fp-done__sub">{T.BOOKED_TITLE}</h2>
          <ul className="fp-done__list">
            {bookings.map((b) => (
              <li key={b.child}>{T.bookedLine(childName(b.child), b)}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="fp-done__keep">{bookings.length > 0 ? T.KEEP_TIME : T.KEEP_NO_TIME}</p>
      {form.addToCalendar && bookings.length > 0 && (
        <button type="button" className="btn fp-btn" onClick={addToCalendar}>
          <IconCalendarPlus size={16} aria-hidden="true" />
          {T.ADD_TO_CALENDAR}
        </button>
      )}
    </section>
  );
}
