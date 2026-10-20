// BlackBeltTesting.jsx — the Black Belt testing section of the dashboard (staff screens).
// Why it exists: contract CONTRACT-0016-B1 §3, approved mockups Cycles 2–8. Black Belt testing is
// joint for both schools (v0.204), so it works the same on Worcester, Shrewsbury AND Both and
// never asks to choose a school. This file draws the frame:
//   - "← Testing", the page title "Black Belt testing" and, for admins on the Cycles tab,
//     "+ Add cycle" in the page header (v0.45)
//   - the tabs Cycles · Rubric and prices (← → move between them)
//   - the gray line under the tabs: for staff on Cycles (when there are cycles) the "Staff can
//     open or close registration…" line; for staff on Rubric and prices "View only…"
//   - when a cycle is open: that cycle's page instead (CyclePage.jsx)
// Everything inside a tab lives in cycles/CyclesTab.jsx and rubric/RubricTab.jsx.
//
// Until step C2 (the Testing chooser and the #testing/black-belt addresses, which wait for Star's
// chooser to reach main — contract §7 OP-1) the open tab and the open cycle are kept here in
// memory instead of in the page address.
//
// Props (from src/screens/Testing.jsx):
//   isAdmin            show admin controls? (the database enforces the real rule)
//   onBack()           "← Testing"
//   screenLocked       true while the lock screen shows (no requests, dialogs hidden)
//   onNoAccess         the database refused data because this sign-in is locked
//   onRefreshProfile   re-read "who am I?" (after the database said "not allowed")
//   showToast / clearToast   the toast at the bottom (with Undo)
//   onModalOpenChange  tells the App a dialog is open (the page behind becomes inert)
//   location / onLocationChange   the top bar's location switcher (phase B2: the cycle page's
//                      Candidates tab follows it — v0.118; Cycles and Rubric don't)
import { useId, useRef, useState } from 'react';
import { IconArrowLeft } from '@tabler/icons-react';
import CyclesTab from './cycles/CyclesTab.jsx';
import CyclePage from './cycle/CyclePage.jsx';
import RubricTab from './rubric/RubricTab.jsx';
import * as T from './text.js';
import './blackBelt.css';

const TABS = [
  { key: 'cycles', label: T.TAB_CYCLES },
  { key: 'rubric', label: T.TAB_RUBRIC },
];

// The tab and cycle last used, kept while the dashboard is open (coming back lands there).
let lastTab = 'cycles';
let lastCycleId = null;

function Header({ action, staffLine, tab, onTab, onBack, ids }) {
  const tabRefs = useRef({});
  function handleKeyDown(event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TABS.findIndex((t) => t.key === tab);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length];
    onTab(next.key);
    tabRefs.current[next.key]?.focus();
  }
  return (
    <>
      <button type="button" className="link-button ev-back bb-back" onClick={onBack}>
        {/* ti-arrow-left = back */}
        <IconArrowLeft size={16} aria-hidden="true" />
        {T.BACK_TO_TESTING}
      </button>
      <div className="phead">
        <div className="phead-titles">
          <h1 className="ptitle">{T.PAGE_TITLE}</h1>
        </div>
        {action}
      </div>
      <div className="ttabs" role="tablist" aria-label={T.PAGE_TITLE} onKeyDown={handleKeyDown}>
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

export default function BlackBeltTesting({ isAdmin, onBack, location, onLocationChange, ...shared }) {
  const baseId = useId();
  const ids = { tab: (key) => `${baseId}-tab-${key}`, panel: (key) => `${baseId}-panel-${key}` };
  const [tab, setTabState] = useState(lastTab);
  const [cycleId, setCycleIdState] = useState(lastCycleId);

  function setTab(key) {
    lastTab = key;
    setTabState(key);
  }
  function openCycle(id) {
    lastCycleId = id;
    setCycleIdState(id);
    window.scrollTo?.(0, 0);
  }
  function closeCycle() {
    lastCycleId = null;
    setCycleIdState(null);
    lastTab = 'cycles';
    setTabState('cycles');
  }

  if (cycleId) {
    return (
      <div className="testing bb">
        <CyclePage key={cycleId} cycleId={cycleId} isAdmin={isAdmin} onBack={closeCycle} location={location} onLocationChange={onLocationChange} {...shared} />
      </div>
    );
  }

  const renderHeader = (action, staffLine) => (
    <Header action={action} staffLine={staffLine} tab={tab} onTab={setTab} onBack={onBack} ids={ids} />
  );

  return (
    <div className="testing bb">
      {tab === 'cycles' ? (
        <CyclesTab
          isAdmin={isAdmin}
          panelId={ids.panel('cycles')}
          tabId={ids.tab('cycles')}
          renderHeader={renderHeader}
          onOpenCycle={openCycle}
          {...shared}
        />
      ) : (
        <RubricTab
          isAdmin={isAdmin}
          panelId={ids.panel('rubric')}
          tabId={ids.tab('rubric')}
          renderHeader={(action) => renderHeader(action, isAdmin ? null : T.VIEW_ONLY)}
          {...shared}
        />
      )}
    </div>
  );
}
