// BothSummary.jsx — what Color Belt testing shows while the location switcher is on "Both".
// Why it exists: decided v1.022 / v0.415 (CB13, screen 3 of Color Belt's design review, option B).
// Each school's testing stays separate (v0.34 / v0.35: nothing can be changed on Both), but
// instead of a blank "Choose a school" page, Both now shows one READ-ONLY box per school, the way
// Finance's Daily report does on Both (screens/finance/BothSummary.jsx, v0.198):
//   - the school's name with a map-pin icon (switcher order: Worcester, Shrewsbury)
//   - its UPCOMING events: name, "Fri, Nov 20, 2026 · 15 students" and the status tag exactly as
//     the Events tab shows it — or "No upcoming events."
//   - one private-testing line: "3 upcoming · next Tue, Dec 1, 4:00 PM" — or "No upcoming
//     private testings." No names and no money on Both: only counts and dates.
//   - "Open Worcester" / "Open Shrewsbury", which switch the WHOLE dashboard to that school
//     (the same as today's Both buttons; picking Both again comes back here)
// and under the boxes a gray hint saying why. Tablet and PC: boxes side by side; phones: stacked.
//
// Each school is read the same way its own page reads it (eventsApi.loadEvents and
// privateApi.loadPrivateTestings) — no database change. Loading shows a gray skeleton the first
// time; a failed first load shows the red bar with Retry (both copied from Finance's Both page).
// It reloads quietly every 15 seconds, like the Events tab, so new registrations show up.
//
// Props: onChoose(school)  switches the whole dashboard (Testing.jsx's chooseSchool)
//        screenLocked      true while the lock screen shows (nothing is requested then)
//        onNoAccess()      the database refused data because this sign-in is locked
import { useEffect } from 'react';
import { IconMapPin } from '@tabler/icons-react';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import { LOCATIONS, LOCATION_CODE } from '../../lib/device.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../lib/useLiveLoad.js';
import { loadEvents } from '../../lib/testing/eventsApi.js';
import { stateTag } from '../../lib/testing/eventRules.js';
import { loadPrivateTestings } from '../../lib/testing/privateApi.js';
import { splitPrivate } from '../../lib/testing/privateRules.js';
import * as T from './text.js';
import '../../styles/testing-both.css';

// One school's summary, worked out from its two answers. Only what the box shows is kept (no
// student names, no payments), so nothing private stays in memory for this page.
function schoolSummary(name, eventsAnswer, privateAnswer) {
  const today = eventsAnswer.today;
  // Upcoming = not finished yet (the Events tab's Upcoming side), soonest first.
  const events = eventsAnswer.events
    .filter((event) => event.state !== 'finished')
    .sort((a, b) => (a.testingDate < b.testingDate ? -1 : a.testingDate > b.testingDate ? 1 : 0))
    .map((event) => ({
      id: event.id,
      name: event.name,
      testingDate: event.testingDate,
      activeCount: event.activeCount ?? 0,
      tag: stateTag(event.state, event, today),
    }));
  // Upcoming private testings: active and today or later (privateRules.privateSide), soonest first.
  const { upcoming } = splitPrivate(privateAnswer.rows, privateAnswer.today);
  const next = upcoming[0] ?? null;
  return {
    name,
    events,
    privateCount: upcoming.length,
    privateNext: next ? { date: next.privateDate, time: next.privateTime } : null,
  };
}

// Reads both schools at once (4 reads in parallel). Never throws.
// → { status:'ok', schools:[…] } · { status:'no_access' } · { status:'error' }
async function loadBoth() {
  const answers = await Promise.all(
    LOCATIONS.map(async (name) => {
      const code = LOCATION_CODE[name];
      const [eventsAnswer, privateAnswer] = await Promise.all([loadEvents(code), loadPrivateTestings(code)]);
      return { name, eventsAnswer, privateAnswer };
    }),
  );
  const all = answers.flatMap((a) => [a.eventsAnswer, a.privateAnswer]);
  // A locked sign-in wins over any other problem: the screen locks.
  if (all.some((answer) => answer?.status === 'no_access')) return { status: 'no_access' };
  if (all.some((answer) => answer?.status !== 'ok')) return { status: 'error' };
  return {
    status: 'ok',
    schools: answers.map((a) => schoolSummary(a.name, a.eventsAnswer, a.privateAnswer)),
  };
}

export default function BothSummary({ onChoose, screenLocked, onNoAccess }) {
  // The key never changes ('both'): this page only exists while the switcher is on Both.
  const live = useLiveLoad({ key: 'both', enabled: !screenLocked, load: loadBoth, refreshMs: LIVE_REFRESH_MS });
  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess?.();
  }, [live.status, onNoAccess]);

  // First load: two gray boxes where the school boxes will be (Finance's skeleton idea).
  if (live.status === 'loading' || live.status === 'idle') {
    return (
      <div className="tb-skeleton" aria-busy="true">
        <span className="visually-hidden">{T.BOTH_LOADING}</span>
        {LOCATIONS.map((name) => (
          <span key={name} aria-hidden="true" />
        ))}
      </div>
    );
  }
  if (live.status === 'noAccess') return null; // the lock screen takes over
  if (!live.data) return <ErrorBanner text={T.BOTH_LOAD_FAILED} onRetry={() => live.reload()} />;

  return (
    <>
      <div className="tb-both">
        {live.data.schools.map((school) => (
          <section key={school.name} className="tb-box" aria-label={school.name}>
            <h2 className="tb-box-title">
              {/* ti-map-pin = location */}
              <IconMapPin size={16} aria-hidden="true" className="tb-box-icon" />
              {school.name}
            </h2>

            {school.events.length === 0 ? (
              <p className="tb-empty">{T.BOTH_NO_EVENTS}</p>
            ) : (
              <ul className="tb-events">
                {school.events.map((event) => {
                  // The same green "open" tag as the Events tab (EventsTab.jsx tagFor).
                  const ok = event.tag.code === 'open' || event.tag.code === 'open_until';
                  return (
                    <li key={event.id} className="tb-event">
                      <h3 className="tb-heading">{event.name}</h3>
                      <p className="tb-line">
                        {T.eventPhoneLine(event.testingDate, event.activeCount)}
                        <span className={`ttag${ok ? ' ttag--ok' : ''}`}>{T.eventTagText(event.tag)}</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}

            <h3 className="tb-heading tb-private-heading">{T.BOTH_PRIVATE_HEADING}</h3>
            {school.privateNext ? (
              <p className="tb-line">{T.bothPrivateLine(school.privateCount, school.privateNext.date, school.privateNext.time)}</p>
            ) : (
              <p className="tb-empty">{T.BOTH_NO_PRIVATE}</p>
            )}

            {/* Not the main choice of the page, so an outline button (rule 1.1), as before */}
            <button type="button" className="btn tb-open" onClick={() => onChoose(school.name)}>
              {T.bothOpenSchool(school.name)}
            </button>
          </section>
        ))}
      </div>
      <p className="tb-hint">{T.BOTH_HINT}</p>
    </>
  );
}
