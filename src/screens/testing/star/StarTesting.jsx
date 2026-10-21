// StarTesting.jsx — the Star testing pages: the home with its two tabs, and one event's page.
// Why it exists: Star testing lives inside Testing next to Color belt testing (v0.58) and is
// joint for both schools, so — unlike Color Belt — it works on Both: there is no "choose a
// school" block and no school line. Addresses (v0.83, phase 1 plan §1c; App.jsx + pageAddress.js):
//   #testing/star              the home, Events tab (the default, build phase 2)
//   #testing/star/rubrics      the home, Rubrics and prices tab (build phase 1)
//   #testing/star/event/<id>   one event's page (StarEventPage.jsx)
// The home header (Chooser mockups screen 5, v0.177; Events mockups screen 1, v0.92):
//   ← Testing                                   [+ Add event]   (Events tab, admins only)
//   Star testing
//   [Events] [Rubrics and prices]               (Events joined in phase 2 without the page
//                                                jumping: the tab bar was already there, v0.177)
//   Events, staff:   "Staff can open or close registration from ⋯ until the closing date. Ask an
//                    admin to add or change events." (v0.86)
//   Rubrics, staff:  "View only. Ask an admin to make changes." — then for everyone "Same for both
//                    schools. Events keep the rubric and prices they were created with."
// Switching tabs changes the address in place (no new Back step — the same as Color Belt's
// Students | Grading tabs), so Back leaves Star testing and a reload stays on the tab.
//
// Props (from Testing.jsx / App.jsx):
//   isAdmin            show edit controls? (only for the screen — the database enforces the rule)
//   onBack()           "← Testing": back to the Testing choice page
//   eventTab           the home's tab from the address: 'events' | 'rubrics'; on an event's page its
//                      tab: 'students' (Candidates) | 'grading' (build phase 5)
//   onEventTab(tab)    switch the tab (App.jsx updates the address without a new history step)
//   onLeaveGuardChange(fn|null)   the event page's leave guard while grades aren't saved (phase 5;
//                      App.jsx asks fn before leaving, contract 0010 §4.9)
//   eventId            the open Star event's id (#testing/star/event/<id>), or null for the home
//   onOpenEvent(id)    open an event's page (App.jsx adds a browser history step)
//   onCloseEvent()     "← Star testing": back to the Events tab
//   location, onLocationChange   the top-bar switcher (the Candidates tab follows it, v0.118, and
//                      its "Show both schools" sets it to Both for now, G12)
//   screenLocked       true while the lock screen shows (dialogs and menus are hidden, no requests)
//   onNoAccess()       the database refused data because this sign-in is locked: lock the screen
//   onRefreshProfile() re-read "who am I?" (e.g. after the database said "not allowed")
//   showToast(text, { action, icon }) / clearToast()   the toast at the bottom (with Undo)
//   onModalOpenChange(open)  tells the App a dialog is open (the page behind becomes inert)
import { useId, useRef } from 'react';
import { IconArrowLeft } from '@tabler/icons-react';
import RubricsTab from './RubricsTab.jsx';
import StarEventsTab, { returnFocusTo } from './events/StarEventsTab.jsx';
import StarEventPage from './event/StarEventPage.jsx';
import * as T from './text.js';
import { TAB_EVENTS } from './events/text.js';
import './star.css';

const TABS = [
  { key: 'events', label: TAB_EVENTS },
  { key: 'rubrics', label: T.TAB_RUBRICS },
];

export default function StarTesting({
  isAdmin,
  onBack,
  eventTab,
  onEventTab,
  eventId = null,
  onOpenEvent,
  onCloseEvent,
  location = 'Both',
  onLocationChange,
  screenLocked = false,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
  onLeaveGuardChange,
}) {
  const baseId = useId();
  const tabRefs = useRef({});
  const tab = eventTab === 'rubrics' ? 'rubrics' : 'events';
  const ids = { tab: (key) => `${baseId}-tab-${key}`, panel: (key) => `${baseId}-panel-${key}` };

  // ----- One event's page -----
  if (eventId) {
    return (
      <StarEventPage
        key={eventId}
        eventId={eventId}
        eventTab={eventTab}
        onEventTab={onEventTab}
        onLeaveGuardChange={onLeaveGuardChange}
        onBack={(id) => {
          returnFocusTo(id); // the list focuses this event's row again
          onCloseEvent?.();
        }}
        isAdmin={isAdmin}
        location={location}
        onLocationChange={onLocationChange}
        screenLocked={screenLocked}
        onNoAccess={onNoAccess}
        onRefreshProfile={onRefreshProfile}
        showToast={showToast}
        clearToast={clearToast}
        onModalOpenChange={onModalOpenChange}
      />
    );
  }

  // ----- The home: header, tabs, the open tab -----
  function chooseTab(key) {
    if (key !== tab) onEventTab?.(key);
  }
  // ← → move between the tabs (and choose), like Color Belt's tab bar.
  function handleTabKeyDown(event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TABS.findIndex((t) => t.key === tab);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length];
    chooseTab(next.key);
    tabRefs.current[next.key]?.focus();
  }

  // The header and tab bar. action = the tab's header button (Add event) or null; lines = the gray
  // lines under the tabs.
  const renderHeader = (action, lines) => (
    <>
      <div className="phead st-phead">
        <div className="phead-titles">
          {/* A link-styled button: it goes back inside the app (App.jsx changes the address). */}
          <button type="button" className="link-button st-back" aria-label={T.BACK_TO_TESTING_LABEL} onClick={() => onBack()}>
            {/* ti-arrow-left = back */}
            <IconArrowLeft size={16} aria-hidden="true" />
            {T.BACK_TO_TESTING}
          </button>
          <h1 className="ptitle">{T.PAGE_TITLE}</h1>
        </div>
        {action}
      </div>
      <div className="ttabs" role="tablist" aria-label={T.PAGE_TITLE} onKeyDown={handleTabKeyDown}>
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
              className={`ttab${current ? ' is-current' : ''}`}
              role="tab"
              aria-selected={current ? 'true' : 'false'}
              aria-controls={ids.panel(t.key)}
              tabIndex={current ? 0 : -1}
              onClick={() => chooseTab(t.key)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {(lines ?? []).map((line) => (
        <p key={line} className="viewonly">
          {line}
        </p>
      ))}
    </>
  );

  const shared = { isAdmin, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange };

  return (
    <div className="testing st-page">
      {tab === 'events' ? (
        <StarEventsTab
          {...shared}
          panelId={ids.panel('events')}
          tabId={ids.tab('events')}
          renderHeader={(action, staffLine) => renderHeader(action, staffLine ? [staffLine] : [])}
          onOpenEvent={onOpenEvent}
        />
      ) : (
        <>
          {renderHeader(null, isAdmin ? [T.SAME_FOR_BOTH] : [T.VIEW_ONLY_LINE, T.SAME_FOR_BOTH])}
          <RubricsTab {...shared} panelId={ids.panel('rubrics')} tabId={ids.tab('rubrics')} />
        </>
      )}
    </div>
  );
}

