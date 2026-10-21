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
//   - when an event is open (address #testing/event/<id>): that event's page instead
// Everything inside a tab lives in testing/events/EventsTab.jsx and testing/ClassesRanksTab.jsx;
// the event page in testing/event/EventPage.jsx.
// Phase 4 (contract 0014 §5.1, rulebook v0.401): a third tab, "Private testing", at the far right
// (testing/private/PrivateTestingTab.jsx), and a private testing's grading page
// (#testing/private/<id>, testing/private/PrivateGradingPage.jsx). Closing the grading page lands
// on the Private testing tab. On narrow phones the tab bar scrolls sideways (testing.css).
//
// Props (from App.jsx):
//   location           'Worcester' | 'Shrewsbury' | 'Both' (the top-bar switcher)
//   onLocationChange   switches the whole dashboard (used by the Both buttons)
//   isAdmin            show edit controls? (only for the screen — the database enforces the rule)
//   eventId            the open event's id, or null for the tabs
//   onOpenEvent(id)    open an event's page (App.jsx adds a browser history step)
//   onCloseEvent()     back to the Events tab
//   screenLocked       true while the lock screen shows (dialogs and menus are hidden, no requests)
//   onNoAccess         the database refused data because this sign-in is locked: lock the screen
//   onRefreshProfile   re-read "who am I?" (e.g. after the database said "not allowed")
//   showToast / clearToast   the toast at the bottom (with Undo)
//   onModalOpenChange  tells the App a Testing dialog is open (the page behind becomes inert)
//   privateId          phase 4: the open private testing's id (its grading page), or null
//   onOpenPrivate(id) / onClosePrivate(options)   open / close that grading page (App.jsx)
//
// Black Belt testing (contract CONTRACT-0016-B1 §3): until step C2 brings the Testing chooser and
// the #testing/black-belt addresses (they wait for Star's chooser, §7 OP-1), Black Belt is reached
// from a "Black Belt testing ›" link at the top of this page, in EVERY build (Jeffrey, rulebook
// v0.917: Black Belt goes live without waiting for Star). The screens are loaded with a lazy
// import, so they're only downloaded when someone opens Black Belt.
// Black Belt is joint for both schools, so the link shows on Both too.
import { Suspense, lazy, useEffect, useId, useRef, useState } from 'react';
import { IconAward, IconChevronRight } from '@tabler/icons-react';
import BlockedOnBoth from './testing/BlockedOnBoth.jsx';
import ClassesRanksTab from './testing/ClassesRanksTab.jsx';
import EventsTab from './testing/events/EventsTab.jsx';
import EventPage from './testing/event/EventPage.jsx';
import PrivateGradingPage from './testing/private/PrivateGradingPage.jsx';
import PrivateTestingTab from './testing/private/PrivateTestingTab.jsx';
import { PAGE_TITLE, TAB_CLASSES_RANKS, TAB_EVENTS, TAB_PRIVATE, VIEW_ONLY_LINE } from './testing/text.js';
import '../styles/testing-events.css';

// Black Belt testing's staff screens, loaded only when opened (v0.917: every build, until C2
// moves the way in into the Testing chooser).
const BlackBeltTesting = lazy(() => import('../blackBelt/staff/BlackBeltTesting.jsx'));
const BLACK_BELT_LINK = 'Black Belt testing'; // the link's words (Black Belt's own text.js has the rest)
// Is Black Belt open? Kept while the dashboard is open, like the tab.
let blackBeltOpen = false;

const TABS = [
  { key: 'events', label: TAB_EVENTS },
  { key: 'classes', label: TAB_CLASSES_RANKS },
  { key: 'private', label: TAB_PRIVATE }, // phase 4: last, far right
];

// The tab last used, kept while the page is open (coming back from an event page or from Home
// lands on the same tab). Events is the first tab and the default.
let lastTab = 'events';

// The header + tab bar, drawn by the tab itself (it knows when its add button may show).
//   action     the add button element, or null
//   staffLine  the gray line for staff under the tabs, or null
function TestingHeader({ school, action, staffLine, tab, onTab, ids }) {
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
          <h1 className="ptitle">{PAGE_TITLE}</h1>
          <p className="psub">{school}</p>
        </div>
        {action}
      </div>
      <div className="ttabs" role="tablist" aria-label={PAGE_TITLE} onKeyDown={handleKeyDown}>
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

export default function Testing({ location, onLocationChange, isAdmin, eventId, onOpenEvent, onCloseEvent, ...tabProps }) {
  const baseId = useId();
  const [showBlackBelt, setShowBlackBeltState] = useState(blackBeltOpen);
  function setShowBlackBelt(next) {
    blackBeltOpen = next;
    setShowBlackBeltState(next);
  }
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

  if (BlackBeltTesting && showBlackBelt && !eventId) {
    const { screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange } = tabProps;
    return (
      <Suspense fallback={null}>
        <BlackBeltTesting
          isAdmin={isAdmin}
          onBack={() => setShowBlackBelt(false)}
          screenLocked={screenLocked}
          onNoAccess={onNoAccess}
          onRefreshProfile={onRefreshProfile}
          showToast={showToast}
          clearToast={clearToast}
          onModalOpenChange={onModalOpenChange}
          location={location} onLocationChange={onLocationChange}
        />
      </Suspense>
    );
  }
  // The preview-only way in (see the header comment).
  const blackBeltLink = BlackBeltTesting ? (
    <button type="button" className="link-button ev-back" onClick={() => setShowBlackBelt(true)}>
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
            <h1 className="ptitle">{PAGE_TITLE}</h1>
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
    <TestingHeader school={location} action={action} staffLine={staffLine} tab={tab} onTab={setTab} ids={ids} />
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
