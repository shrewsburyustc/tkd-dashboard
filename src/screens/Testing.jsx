// Testing.jsx — the Testing section (rail icon ti-certificate, "Testing").
// Why it exists: color belt testing is being rebuilt inside the dashboard, one phase at a time
// (guidelines 10b, v0.37). Phase 1 is the "Classes and ranks" tab: each school's list of
// classes, their ranks in belt order, and the three prices for each rank.
//
// This file draws the frame of the section:
//   - the page header: "Testing", the school under it, and (for admins) the "Add class" button
//   - the tab bar — only "Classes and ranks" until the Events tab is built (decided v0.50)
//   - for staff, the line "View only. Ask an admin to make changes." (v0.40)
//   - when the location switcher is on Both: no tabs and no data, just the choose-a-school
//     message (decided v0.35) — and NO request is sent to the database
// Everything inside the tab lives in testing/ClassesRanksTab.jsx.
//
// Props (from App.jsx):
//   location           'Worcester' | 'Shrewsbury' | 'Both' (the top-bar switcher)
//   onLocationChange   switches the whole dashboard (used by the Both buttons)
//   isAdmin            show edit controls? (only for the screen — the database enforces the rule)
//   screenLocked       true while the lock screen shows (dialogs and menus are hidden, no requests)
//   onNoAccess         the database refused data because this sign-in is locked: lock the screen
//   onRefreshProfile   re-read "who am I?" (e.g. after the database said "not allowed")
//   showToast / clearToast   the toast at the bottom (with Undo)
//   onModalOpenChange  tells the App a Testing dialog is open (the page behind becomes inert)
import { useEffect, useId, useRef } from 'react';
import BlockedOnBoth from './testing/BlockedOnBoth.jsx';
import ClassesRanksTab from './testing/ClassesRanksTab.jsx';
import { PAGE_TITLE, TAB_CLASSES_RANKS, VIEW_ONLY_LINE } from './testing/text.js';

// The header + tab bar, drawn by the tab itself (it knows when "Add class" may show).
// action: the "Add class" button element, or null.
function TestingHeader({ school, action, isAdmin, tabId, panelId }) {
  return (
    <>
      <div className="phead">
        <div className="phead-titles">
          <h1 className="ptitle">{PAGE_TITLE}</h1>
          <p className="psub">{school}</p>
        </div>
        {action}
      </div>
      <div className="ttabs" role="tablist" aria-label={PAGE_TITLE}>
        {/* The only tab for now (v0.50); Events is added to its left in phase 2. */}
        <span id={tabId} className="ttab is-current" role="tab" aria-selected="true" aria-controls={panelId} tabIndex={0}>
          {TAB_CLASSES_RANKS}
        </span>
      </div>
      {!isAdmin && <p className="viewonly">{VIEW_ONLY_LINE}</p>}
    </>
  );
}

export default function Testing({ location, onLocationChange, isAdmin, ...tabProps }) {
  const tabId = useId();
  const panelId = useId();

  // After choosing a school on the Both page, the buttons are gone: keyboard focus goes to the
  // "Classes and ranks" tab of that school's page instead of getting lost.
  const focusTabRef = useRef(false);
  function chooseSchool(school) {
    focusTabRef.current = true;
    onLocationChange(school);
  }
  useEffect(() => {
    if (location === 'Both' || !focusTabRef.current) return;
    focusTabRef.current = false;
    document.getElementById(tabId)?.focus();
  }, [location, tabId]);

  if (location === 'Both') {
    // Title only — no school line, no tabs (there's nothing in either tab to show).
    return (
      <div className="testing">
        <div className="phead">
          <div className="phead-titles">
            <h1 className="ptitle">{PAGE_TITLE}</h1>
          </div>
        </div>
        <BlockedOnBoth onChoose={chooseSchool} />
      </div>
    );
  }

  return (
    <div className="testing">
      <ClassesRanksTab
        school={location}
        isAdmin={isAdmin}
        panelId={panelId}
        tabId={tabId}
        renderHeader={(action) => (
          <TestingHeader school={location} action={action} isAdmin={isAdmin} tabId={tabId} panelId={panelId} />
        )}
        {...tabProps}
      />
    </div>
  );
}
