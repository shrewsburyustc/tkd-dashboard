// Testing.jsx — the Testing section (rail icon ti-certificate, "Testing").
// Why it exists: color belt testing is being rebuilt inside the dashboard, one phase at a time
// (guidelines 10b, v0.37 / v0.133). Phase 1 built the "Classes and ranks" tab; phase 2 adds the
// "Events" tab to its left (contract 0005 §6) and each event's own page (the Students roster).
//
// This file draws the frame of the section:
//   - the page header: "Testing", the school under it, and the tab's add button for admins
//     ("Add event" on Events, "Add class" on Classes and ranks — v0.45)
//   - the tab bar: Events · Classes and ranks (← → move between the tabs)
//   - for staff, a gray line under the tabs: the Events line (Star v0.86) or "View only. Ask an
//     admin to make changes." (v0.40)
//   - when the location switcher is on Both: no tabs and no data, just the choose-a-school
//     message (decided v0.35) — and NO request is sent to the database
//   - when an event is open (address #testing/event/<id>, or .../grading for its Grading tab):
//     that event's page instead (with the switch on: #testing/color-belt/event/<id>…)
// Everything inside a tab lives in testing/events/EventsTab.jsx and testing/ClassesRanksTab.jsx;
// the event page in testing/event/EventPage.jsx.
// Phase 4 (contract 0014 §5.1, rulebook v0.401): a third tab, "Private testing", at the far right
// (testing/private/PrivateTestingTab.jsx), and a private testing's grading page
// (#testing/private/<id>; with the switch on #testing/color-belt/private/<id>, still inside the
// Color Belt page — testing/private/PrivateGradingPage.jsx). Closing the grading page lands
// on the Private testing tab. On narrow phones the tab bar scrolls sideways (testing.css).
//
// Star testing (v0.59, v0.177) — only while its build switch is on (lib/features.js):
//   - Testing has three pages: the CHOOSER (#testing, testing/chooser/TestingChooser.jsx), COLOR BELT
//     (#testing/color-belt — everything described above) and STAR TESTING (#testing/star with its
//     Events tab, #testing/star/rubrics, and an event's page #testing/star/event/<id> —
//     testing/star/StarTesting.jsx).
//   - Color Belt's header gets "← Testing" above its title, and the title "Color belt testing".
//   - The chooser and Star testing work on Both; only Color Belt's own pages show the Both block.
// With the switch off this file draws exactly what it drew before Star testing existed.
//
// Props (from App.jsx):
//   location           'Worcester' | 'Shrewsbury' | 'Both' (the top-bar switcher)
//   onLocationChange   switches the whole dashboard (used by the Both buttons)
//   isAdmin            show edit controls? (only for the screen — the database enforces the rule)
//   testingPage        'chooser' | 'colorBelt' | 'star' | 'blackBelt' (switch off: 'colorBelt' or 'blackBelt')
//   onOpenTestingPage(page)  go to another Testing page (App.jsx adds a browser history step)
//   eventId            the open event's id, or null for the tabs
//   onOpenEvent(id)    open an event's page (App.jsx adds a browser history step)
//   onCloseEvent()     back to the Events tab
//   eventTab, onEventTab, onLeaveGuardChange   the event page's tab and leave guard (phase 3;
//                      passed on to EventPage untouched). On Star testing, eventTab / onEventTab
//                      are Star's home tab ('events' | 'rubrics') and eventId is a Star event.
//   onOpenStarEvent(id), onCloseStarEvent()   open a Star event's page / back to Star's Events tab
//   screenLocked       true while the lock screen shows (dialogs and menus are hidden, no requests)
//   onNoAccess         the database refused data because this sign-in is locked: lock the screen
//   onRefreshProfile   re-read "who am I?" (e.g. after the database said "not allowed")
//   showToast / clearToast   the toast at the bottom (with Undo)
//   onModalOpenChange  tells the App a Testing dialog is open (the page behind becomes inert)
//   privateId          phase 4: the open private testing's id (its grading page), or null.
//                      Always a Color Belt page: with the switch on, testingPage is 'colorBelt'.
//   onOpenPrivate(id) / onClosePrivate(options)   open / close that grading page (App.jsx)
//
// Black Belt testing (contract CONTRACT-0016-B1 §3; C2, rulebook v0.937): a Testing page of its own,
// testingPage 'blackBelt', with its own addresses (#testing/black-belt…, lib/pageAddress.js) — with
// the Star switch on OR off. Ways in: with the switch on, the chooser's third row and the rail's
// Testing menu; with it off, the "Black Belt testing ›" link at the top of the Color Belt page
// (v0.917). The screens are loaded with a lazy import, so they're only downloaded when someone opens
// Black Belt. Black Belt is joint for both schools, so the link shows on Both too.
//   onOpenBlackBelt({ cycleId, tab, replace })   open a Black Belt page (App.jsx; a history step)
//   (eventId / eventTab / onEventTab carry Black Belt's open cycle and tab while it is the page)
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { IconAward, IconChevronRight } from '@tabler/icons-react';
import BlockedOnBoth from './testing/BlockedOnBoth.jsx';
import ClassesRanksTab from './testing/ClassesRanksTab.jsx';
import EventsTab from './testing/events/EventsTab.jsx';
import EventPage from './testing/event/EventPage.jsx';
import PrivateGradingPage from './testing/private/PrivateGradingPage.jsx';
import PrivateTestingTab from './testing/private/PrivateTestingTab.jsx';
import TestingChooser from './testing/chooser/TestingChooser.jsx';
import BackToTesting from './testing/chooser/BackToTesting.jsx';
import { COLOR_BELT_TITLE } from './testing/chooser/text.js';
import { PAGE_TITLE, TAB_CLASSES_RANKS, TAB_EVENTS, TAB_PRIVATE, VIEW_ONLY_LINE } from './testing/text.js';
import { loadStarTesting, STAR_TESTING_ON } from '../lib/features.js';
import '../styles/testing-events.css';

// Star testing's screens are loaded only when its page is first opened ("lazy"). With the build
// switch off there is no loader (features.js), so the live build doesn't contain Star's screens.
const StarTesting = loadStarTesting ? lazy(loadStarTesting) : null;

// Color Belt's page title: "Testing" as before, or "Color belt testing" once the chooser exists.
const COLOR_BELT_PAGE_TITLE = STAR_TESTING_ON ? COLOR_BELT_TITLE : PAGE_TITLE;

// Black Belt testing's staff screens, loaded only when opened (every build, v0.917).
const BlackBeltTesting = lazy(() => import('../blackBelt/staff/BlackBeltTesting.jsx'));
const BLACK_BELT_LINK = 'Black Belt testing'; // the link's words (Black Belt's own text.js has the rest)

const TABS = [
  { key: 'events', label: TAB_EVENTS },
  { key: 'classes', label: TAB_CLASSES_RANKS },
  { key: 'private', label: TAB_PRIVATE }, // phase 4: last, far right
];

// The tab last used, kept while the page is open (coming back from an event page or from Home
// lands on the same tab). Events is the first tab and the default.
let lastTab = 'events';

// Finance's "Open in Testing" on a private testing payment (rulebook v0.813): the next time Color
// Belt testing opens, it shows the Private testing tab. Testing isn't on screen while Finance is,
// so the tab is simply chosen before the page opens.
export function showPrivateTestingTabNext() {
  lastTab = 'private';
}

// The header + tab bar, drawn by the tab itself (it knows when its add button may show).
//   action     the add button element, or null
//   staffLine  the gray line for staff under the tabs, or null
//   onBack     "← Testing" (only while the Star testing switch is on), or null for no back link
function TestingHeader({ school, action, staffLine, tab, onTab, ids, onBack }) {
  const tabRefs = useRef({});
  // ← → move to the next / previous tab (wrapping round), Home / End to the first / last one.
  function handleKeyDown(event) {
    const index = TABS.findIndex((t) => t.key === tab);
    let next = null;
    if (event.key === 'ArrowRight') next = TABS[(index + 1) % TABS.length];
    else if (event.key === 'ArrowLeft') next = TABS[(index - 1 + TABS.length) % TABS.length];
    else if (event.key === 'Home') next = TABS[0];
    else if (event.key === 'End') next = TABS[TABS.length - 1];
    if (!next) return;
    event.preventDefault();
    onTab(next.key);
    tabRefs.current[next.key]?.focus();
  }
  // Narrow phones: the tab bar scrolls sideways — keep the current tab in view.
  useEffect(() => {
    tabRefs.current[tab]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [tab]);
  return (
    <>
      <div className="phead">
        <div className="phead-titles">
          {onBack && <BackToTesting onBack={onBack} />}
          <h1 className="ptitle">{COLOR_BELT_PAGE_TITLE}</h1>
          <p className="psub">{school}</p>
        </div>
        {action}
      </div>
      <div className="ttabs" role="tablist" aria-label={COLOR_BELT_PAGE_TITLE} onKeyDown={handleKeyDown}>
        {TABS.map((t) => {
          const current = t.key === tab;
          return (
            <button
              key={t.key}
              ref={(element) => {
                tabRefs.current[t.key] = element;
              }}
              id={ids.tab(t.key)}
              type="button"
              className={`ttab${current ? ' is-current' : ''}${t.key === 'private' ? ' ttab--end' : ''}`}
              role="tab"
              aria-selected={current ? 'true' : 'false'}
              aria-controls={ids.panel(t.key)}
              tabIndex={current ? 0 : -1}
              onClick={() => onTab(t.key)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {staffLine && <p className="viewonly">{staffLine}</p>}
    </>
  );
}

export default function Testing({
  location,
  onLocationChange,
  isAdmin,
  testingPage = 'colorBelt',
  onOpenTestingPage,
  eventId,
  onOpenEvent,
  onCloseEvent,
  onOpenStarEvent,
  onCloseStarEvent,
  onOpenBlackBelt,
  ...tabProps
}) {
  // Switch off: Color Belt, or Black Belt (reached from the Color Belt page's link, C2).
  const page = STAR_TESTING_ON ? testingPage : testingPage === 'blackBelt' ? 'blackBelt' : 'colorBelt';
  const baseId = useId();
  const ids = { tab: (key) => `${baseId}-tab-${key}`, panel: (key) => `${baseId}-panel-${key}` };
  const [tab, setTabState] = useState(lastTab);
  // Phase 4: while a private testing's grading page is open, the tab underneath becomes Private
  // testing, so closing the page lands there.
  useEffect(() => {
    if (tabProps.privateId) setTabState('private');
  }, [tabProps.privateId]);
  function setTab(key) {
    lastTab = key;
    setTabState(key);
  }

  // After choosing a school on the Both page, the buttons are gone: keyboard focus goes to the
  // current tab of that school's page instead of getting lost.
  const focusTabRef = useRef(false);
  function chooseSchool(school) {
    focusTabRef.current = true;
    onLocationChange(school);
  }
  useEffect(() => {
    if (location === 'Both' || !focusTabRef.current) return;
    focusTabRef.current = false;
    document.getElementById(`${baseId}-tab-${lastTab}`)?.focus();
  }, [location, baseId]);

  // ----- Moving between the chooser and a testing page (switch on) -----
  // The button that was pressed disappears with its page, so keyboard focus would fall to the top
  // of the document. Instead: a chooser row → focus the new page's "← Testing"; "← Testing" →
  // focus the chooser row of the page we came from. (Browser Back/Forward leave focus alone.)
  const [chooserFocus, setChooserFocus] = useState(null); // the row to focus on the chooser
  const focusBackLinkRef = useRef(false);
  // Switch off: coming back from Black Belt focuses the Color Belt page's "Black Belt testing ›".
  const focusBlackBeltLinkRef = useRef(false);
  const blackBeltLinkRef = useRef(null);
  useEffect(() => {
    if (page !== 'colorBelt' || !focusBlackBeltLinkRef.current) return;
    focusBlackBeltLinkRef.current = false;
    blackBeltLinkRef.current?.focus();
  }, [page]);
  function openFromChooser(next) {
    if (next === 'star') loadStarTesting?.(); // start loading Star's screens straight away
    focusBackLinkRef.current = true;
    setChooserFocus(null);
    onOpenTestingPage(next);
  }
  function backToChooser() {
    setChooserFocus(page);
    onOpenTestingPage('chooser');
  }
  // Black Belt's own "← Testing": with the switch on, back to the chooser with its row focused;
  // with it off, back to the Color Belt page it was opened from.
  function blackBeltBack() {
    if (!STAR_TESTING_ON) {
      focusBlackBeltLinkRef.current = true; // the "Black Belt testing ›" link gets keyboard focus
      onOpenTestingPage('colorBelt');
      return;
    }
    setChooserFocus('blackBelt');
    onOpenTestingPage('chooser');
  }
  useEffect(() => {
    if (page === 'chooser' || !focusBackLinkRef.current) return undefined;
    // Star's and Black Belt's pages may still be loading their screens: look for the back link
    // every 50ms, up to 3s.
    let timer = 0;
    let tries = 0;
    function tryFocus() {
      const link = document.querySelector('.tc-back, .st-back, .bb-back');
      if (link) {
        focusBackLinkRef.current = false;
        link.focus();
      } else if (tries++ < 60) {
        timer = window.setTimeout(tryFocus, 50);
      }
    }
    tryFocus();
    return () => window.clearTimeout(timer);
  }, [page, location]);
  // The chooser has used its "focus this row" (its own effect runs first): forget it, so arriving
  // later by the rail doesn't move focus.
  useEffect(() => {
    if (page === 'chooser' && chooserFocus) setChooserFocus(null);
  }, [page, chooserFocus]);
  const onBack = STAR_TESTING_ON ? backToChooser : null;

  if (page === 'chooser') {
    return (
      <TestingChooser
        location={location}
        screenLocked={tabProps.screenLocked}
        onNoAccess={tabProps.onNoAccess}
        onOpen={openFromChooser}
        focusPage={chooserFocus}
      />
    );
  }

  if (page === 'star' && StarTesting) {
    // Star testing is the same for both schools (v0.58): no Both block, no school line.
    return (
      <Suspense fallback={null}>
        <StarTesting
          isAdmin={isAdmin}
          onBack={backToChooser}
          eventId={eventId}
          onOpenEvent={onOpenStarEvent}
          onCloseEvent={onCloseStarEvent}
          location={location}
          onLocationChange={onLocationChange}
          {...tabProps}
        />
      </Suspense>
    );
  }

  // Black Belt testing (C2, v0.937): its own page. eventId = the open cycle, eventTab = its tab.
  if (page === 'blackBelt') {
    const { screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange } = tabProps;
    return (
      <Suspense fallback={null}>
        <BlackBeltTesting
          isAdmin={isAdmin}
          onBack={blackBeltBack}
          cycleId={eventId}
          tab={tabProps.eventTab}
          onTab={tabProps.onEventTab}
          onOpen={onOpenBlackBelt}
          screenLocked={screenLocked}
          onNoAccess={onNoAccess}
          onRefreshProfile={onRefreshProfile}
          showToast={showToast}
          clearToast={clearToast}
          onModalOpenChange={onModalOpenChange}
          location={location} onLocationChange={onLocationChange}
          onLeaveGuardChange={tabProps.onLeaveGuardChange}
        />
      </Suspense>
    );
  }
  // The way in from the Color Belt page (see the header comment) — only while the Star switch is
  // off; with it on, the chooser has a Black Belt row instead.
  const blackBeltLink = BlackBeltTesting && !STAR_TESTING_ON ? (
    <button
      ref={blackBeltLinkRef}
      type="button"
      className="link-button ev-back"
      onClick={() => {
        focusBackLinkRef.current = true; // Black Belt's "← Testing" gets keyboard focus
        onOpenTestingPage('blackBelt');
      }}
    >
      {/* ti-award = Black Belt testing (rulebook icon map); ti-chevron-right = go there */}
      <IconAward size={16} aria-hidden="true" />
      {BLACK_BELT_LINK}
      <IconChevronRight size={16} aria-hidden="true" />
    </button>
  ) : null;

  if (location === 'Both') {
    // Title only — no school line, no tabs (there's nothing in either tab to show).
    return (
      <div className="testing">
        {blackBeltLink}
        <div className="phead">
          <div className="phead-titles">
            {onBack && <BackToTesting onBack={onBack} />}
            <h1 className="ptitle">{COLOR_BELT_PAGE_TITLE}</h1>
          </div>
        </div>
        <BlockedOnBoth onChoose={chooseSchool} />
      </div>
    );
  }

  // Phase 4: a private testing's grading page. Closing it lands on the Private testing tab.
  if (tabProps.privateId) {
    lastTab = 'private';
    return (
      <div className="testing">
        <PrivateGradingPage key={tabProps.privateId} school={location} isAdmin={isAdmin} {...tabProps} />
      </div>
    );
  }

  if (eventId) {
    return (
      <div className="testing">
        <EventPage key={eventId} eventId={eventId} school={location} isAdmin={isAdmin} onBack={onCloseEvent} {...tabProps} />
      </div>
    );
  }

  const renderHeader = (action, staffLine) => (
    <TestingHeader school={location} action={action} staffLine={staffLine} tab={tab} onTab={setTab} ids={ids} onBack={onBack} />
  );

  return (
    <div className="testing">
      {blackBeltLink}
      {tab === 'private' ? (
        <PrivateTestingTab
          school={location}
          isAdmin={isAdmin}
          panelId={ids.panel('private')}
          tabId={ids.tab('private')}
          renderHeader={(action) => renderHeader(action, null)}
          {...tabProps}
        />
      ) : tab === 'events' ? (
        <EventsTab
          school={location}
          isAdmin={isAdmin}
          panelId={ids.panel('events')}
          tabId={ids.tab('events')}
          renderHeader={renderHeader}
          onOpenEvent={onOpenEvent}
          {...tabProps}
        />
      ) : (
        <ClassesRanksTab
          school={location}
          isAdmin={isAdmin}
          panelId={ids.panel('classes')}
          tabId={ids.tab('classes')}
          renderHeader={(action) => renderHeader(action, isAdmin ? null : VIEW_ONLY_LINE)}
          {...tabProps}
        />
      )}
    </div>
  );
}
