// parts.jsx — small pieces the Star family page's screens share: the event box, the loading
// placeholder, the "can't register" pages, and a few word helpers.
// Why it exists: StarRegisterApp, StepDetails, StepCheck and Registered reuse these so every screen
// matches the approved mockups (Form screens 1, 11; gap mockups F2, F4, F5). The plain pieces that
// don't carry any words of their own (field errors, the top banner, the tick box, the state box)
// come unchanged from Color Belt's src/register/parts.jsx.
import { StateMessage } from '../register/parts.jsx';
import { locationLine, longDate, longDateWithYear } from '../register/format.js';
import { startTimeLabel } from '../lib/star/starEventRules.js';
import * as T from './text.js';

// 'YYYY-MM-DD' → "Mar 4, 2012" (the date-of-birth field and the check page, Form screens 2 and 6).
const SHORT_WITH_YEAR = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
export function monthDayYear(dateIso) {
  const [y, m, d] = String(dateIso).split('-').map(Number);
  return SHORT_WITH_YEAR.format(new Date(Date.UTC(y, m - 1, d)));
}

// 2 → "2nd Dan" (the top-star note names the next Dan, which may not be in the event: 3rd → 4th).
export function danLabelOf(dan) {
  const n = Number(dan);
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix} Dan`;
}

// "245.0" / 245 → "245"; 244.5 stays "244.5".
export const scoreText = (n) => (Number.isFinite(Number(n)) ? String(Number(n)) : '');

// The "Location: …" line: where the testing is held, with the school's street address.
export const whereLine = (where) => locationLine(where?.name ?? '', where?.address ?? null);

// The event box (Form screen 1): title, date, time, location, "Register by …" (only while open),
// the note for families (left out on the finished page, v0.104).
export function EventBox({ event, showRegisterBy, showNote = true }) {
  if (!event) return null;
  const time = startTimeLabel(event.start_time);
  return (
    <section className="reg-hero" aria-label={event.name}>
      <h1 className="reg-hero__title">{event.name}</h1>
      <div className="reg-hero__when">
        {longDateWithYear(event.testing_date)}
        {time ? (
          <>
            <br />
            {time}
          </>
        ) : null}
      </div>
      <div className="reg-hero__where">
        {T.LOCATION}: {whereLine(event.where)}
      </div>
      {showRegisterBy && event.auto_close_on ? (
        <div className="reg-hero__by">
          <b>{T.REGISTER_BY(longDate(event.auto_close_on))}</b>
        </div>
      ) : null}
      {showNote && event.note ? <div className="reg-hero__note">{event.note}</div> : null}
    </section>
  );
}

// F5: while the event is fetched — a gray box the shape of the event box, then "Loading…".
export function Loading() {
  return (
    <>
      <div className="sreg-skhero" aria-hidden="true">
        <span className="sreg-skb sreg-skb--title" />
        <span className="sreg-skb" style={{ width: '45%' }} />
        <span className="sreg-skb" style={{ width: '30%' }} />
        <span className="sreg-skb" style={{ width: '70%' }} />
      </div>
      <p className="reg-loading" role="status">
        {T.LOADING}
      </p>
    </>
  );
}

// The pages when families can't register (Form screen 11, F2) and the two load problems (F4).
// `answer` is the GET answer: an ok answer whose state isn't open, or a refusal.
export function Message({ answer, onRetry }) {
  const ok = answer?.status === 'ok';
  const status = ok ? answer.state : answer?.status;
  const event = ok ? answer.event : null; // no event box without event details
  let box;
  let showNote = true;
  let retry = false;
  if (status === 'not_open') box = <StateMessage title={T.NOT_OPEN_TITLE} text={T.NOT_OPEN_TEXT} />;
  else if (status === 'closed') {
    const closedOn = ok ? answer.closed_on : null;
    box = <StateMessage title={T.CLOSED_TITLE} text={closedOn ? T.closedOn(longDate(closedOn)) : T.CLOSED_TEXT} />;
  } else if (status === 'finished') {
    showNote = false;
    box = <StateMessage title={T.FINISHED_TITLE} text={T.FINISHED_TEXT} />;
  } else if (status === 'not_found') box = <StateMessage title={T.NOT_FOUND_TITLE} text={T.NOT_FOUND_TEXT} />;
  else if (status === 'rate_limited') {
    retry = true;
    box = <StateMessage title={T.RATE_TITLE} text={T.RATE_LIMITED} />;
  } else {
    // unavailable, bad_request, network, or anything unexpected
    retry = true;
    box = <StateMessage title={T.LOAD_FAILED_TITLE} text={T.LOAD_FAILED_TEXT} />;
  }
  return (
    <>
      <EventBox event={event} showRegisterBy={false} showNote={showNote} />
      {box}
      {retry ? (
        <div className="sreg-retry">
          <button type="button" className="reg-btn reg-btn--primary reg-btn--main" onClick={onRetry}>
            {T.TRY_AGAIN}
          </button>
        </div>
      ) : null}
    </>
  );
}
