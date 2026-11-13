// BoardBreaking.jsx — the Board breaking page of the dashboard (a Testing page of its own; rulebook v1.300).
// Why it exists: Board breaking is the fourth page inside Testing (after Color belt, Star and Black Belt). This
// file draws the FRAME, as BlackBeltTesting.jsx does for Black Belt:
//   - "← Testing", the page title "Board breaking" and the school under it ("Both schools" on Both)
//   - the tabs: Events · Chart and prices. Chart and prices is for admins only: staff see just the Events tab
//     (picture C-admin-staffview), and an address that asks staff for the chart shows Events instead
//   - the primary button of the tab (Add event) and the gray line for staff, which each tab hands to renderHeader
//   - when an event is open: that event's page instead (EventPage.jsx — its roster)
// Everything inside a tab lives in EventsTab.jsx and ChartAndPricesTab.jsx; the event page in EventPage.jsx.
//
// The open event and the open tab live in the page address (#testing/breaking, /chart, /event/<id> —
// lib/pageAddress.js), so a reload, a bookmark and the browser's Back / Forward land on the right page. App.jsx
// keeps them; this file only asks for changes.
//
// Props (from src/screens/Testing.jsx):
//   isAdmin            show admin controls? (the database enforces the real rule)
//   onBack()           "← Testing"
//   eventId            the open event's id, or null for the tabs
//   tab                'events' | 'chart' (without an event)
//   onTab(key)         switch tab on the same page (no new history step)
//   onOpen({ eventId, tab, replace })   go to another Board breaking page (a history step; replace: true swaps
//                      the step, used when the open event was deleted)
//   screenLocked       true while the lock screen shows (no requests, dialogs hidden)
//   onNoAccess         the database refused data because this sign-in is locked
//   onRefreshProfile   re-read "who am I?" (after the database said "not allowed")
//   showToast / clearToast   the toast at the bottom (with Undo)
//   onModalOpenChange  tells the App a dialog is open (the page behind becomes inert)
//   location / onLocationChange   the top bar's school switcher (Worcester · Shrewsbury · Both)
//   deviceLocation     This device's school from the account menu: the desk a payment counts at
import { useEffect, useId, useRef } from 'react';
import BackLink from '../../components/BackLink.jsx';
import ChartAndPricesTab from './ChartAndPricesTab.jsx';
import EventPage from './EventPage.jsx';
import EventsTab from './EventsTab.jsx';
import * as T from '../../lib/breaking/text/events.js';
import '../../styles/breaking.css';

export default function BoardBreaking({
  isAdmin,
  onBack,
  eventId = null,
  tab: askedTab,
  onTab,
  onOpen,
  location,
  deviceLocation,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
}) {
  const baseId = useId();
  const ids = { tab: (key) => `${baseId}-tab-${key}`, panel: (key) => `${baseId}-panel-${key}` };
  const tabRefs = useRef({});

  // Staff have one tab (Events); an admin has two.
  const tabs = isAdmin
    ? [{ key: 'events', label: T.TAB_EVENTS }, { key: 'chart', label: T.TAB_CHART }]
    : [{ key: 'events', label: T.TAB_EVENTS }];
  const tab = isAdmin && askedTab === 'chart' ? 'chart' : 'events';
  // Staff who open #testing/breaking/chart (a bookmark, an old link) land on Events, and the address is corrected in place
  // (the step is replaced, so Back doesn't return to a page they can't use).
  useEffect(() => {
    if (!isAdmin && !eventId && askedTab === 'chart') onOpen({ eventId: null, tab: 'events', replace: true });
  }, [isAdmin, eventId, askedTab, onOpen]);
  const shared = { screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange };

  // ← → move between the tabs (wrapping round), Home / End to the first / last one.
  function handleKeyDown(event) {
    const index = tabs.findIndex((t) => t.key === tab);
    let next = null;
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
    else if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
    else if (event.key === 'Home') next = tabs[0];
    else if (event.key === 'End') next = tabs[tabs.length - 1];
    if (!next) return;
    event.preventDefault();
    onTab(next.key);
    tabRefs.current[next.key]?.focus();
  }

  // The header and tab bar, drawn by the tab itself (it knows when its add button may show).
  //   action     the primary button element, or null
  //   staffLine  the gray line under the tabs, or null
  const renderHeader = (action, staffLine) => (
    <>
      {/* the shared back link: 24px with a mouse, a 44px tap box on touch, the title never moves */}
      <BackLink label={T.BACK_TO_TESTING} ariaLabel={T.BACK_ARIA} onClick={onBack} />
      <div className="phead">
        <div className="phead-titles">
          <h1 className="ptitle">{T.PAGE_TITLE}</h1>
          <p className="psub">{T.schoolLine(location)}</p>
        </div>
        {action}
      </div>
      <div className="ttabs" role="tablist" aria-label={T.PAGE_TITLE} onKeyDown={handleKeyDown}>
        {tabs.map((t) => {
          const current = t.key === tab;
          return (
            <button
              key={t.key}
              ref={(element) => {
                tabRefs.current[t.key] = element;
              }}
              id={ids.tab(t.key)}
              type="button"
              className={`ttab${current ? ' is-current' : ''}`}
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

  // An event's page (its roster) takes the whole page.
  if (eventId) {
    return (
      <div className="testing brk">
        <EventPage
          key={eventId}
          eventId={eventId}
          isAdmin={isAdmin}
          location={location}
          deviceLocation={deviceLocation}
          onBack={() => onOpen({ eventId: null, tab: 'events' })}
          onGone={() => onOpen({ eventId: null, tab: 'events', replace: true })}
          {...shared}
        />
      </div>
    );
  }

  return (
    <div className="testing brk">
      {tab === 'chart' ? (
        <ChartAndPricesTab isAdmin={isAdmin} panelId={ids.panel('chart')} tabId={ids.tab('chart')} renderHeader={renderHeader} {...shared} />
      ) : (
        <EventsTab
          isAdmin={isAdmin}
          location={location}
          panelId={ids.panel('events')}
          tabId={ids.tab('events')}
          renderHeader={renderHeader}
          onOpenEvent={(id) => onOpen({ eventId: id })}
          {...shared}
        />
      )}
    </div>
  );
}
