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
// Step C2 (rulebook v0.937): the open tab and the open cycle live in the page address
// (#testing/black-belt, /rubric, /cycle/<id>, /cycle/<id>/rubric — lib/pageAddress.js), so a
// reload, a bookmark and the browser's Back / Forward all land on the right page. App.jsx keeps
// them; this file only asks for changes.
//
// Props (from src/screens/Testing.jsx):
//   isAdmin            show admin controls? (the database enforces the real rule)
//   onBack()           "← Testing" (App.jsx asks the unsaved-rubric question for it, through
//                      onLeaveGuardChange — so it isn't asked here as well)
//   cycleId            the open cycle's id, or null for the tabs
//   tab                without a cycle 'cycles' | 'rubric'; on a cycle's page 'candidates' | 'grading' |
//                      'results' | 'rubric' (contract 0025 §14.1)
//   onTab(key)         switch tab on the same page (no new history step)
//   onOpen({ cycleId, tab, replace })   go to another Black Belt page (a history step; replace:
//                      true swaps the step, used when the open cycle was deleted)
//   screenLocked       true while the lock screen shows (no requests, dialogs hidden)
//   onNoAccess         the database refused data because this sign-in is locked
//   onRefreshProfile   re-read "who am I?" (after the database said "not allowed")
//   showToast / clearToast   the toast at the bottom (with Undo)
//   onModalOpenChange  tells the App a dialog is open (the page behind becomes inert)
//   location / onLocationChange   the top bar's location switcher (phase B2: the cycle page's
//                      Candidates tab follows it — v0.118; Cycles and Rubric don't)
//   onLeaveGuardChange (fn | null) — App.jsx asks fn before it leaves this page (the rail, the
//                      account menu, the browser's Back …). Migration 0024: while a rubric Dan has
//                      unsaved changes, every way out asks "Discard changes to 1st Dan?" (R10). The
//                      rubric card registers its question through setGuard; the ways out inside
//                      Black Belt (the tabs, ← Testing, opening or leaving a cycle) ask it too.
import { useCallback, useEffect, useId, useRef } from 'react';
import { IconArrowLeft } from '@tabler/icons-react';
import CyclesTab from './cycles/CyclesTab.jsx';
import CyclePage from './cycle/CyclePage.jsx';
import RubricTab from './rubric/RubricTab.jsx';
import * as T from './text.js';
import './blackBelt.css';

// A cycle page's tabs besides Candidates (contract 0025 §14.1: /grading, /results, /rubric).
const CYCLE_TABS = ['grading', 'results', 'rubric'];

const TABS = [
  { key: 'cycles', label: T.TAB_CYCLES },
  { key: 'rubric', label: T.TAB_RUBRIC },
];

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

export default function BlackBeltTesting({ isAdmin, onBack, cycleId = null, tab: askedTab, onTab, onOpen, location, onLocationChange, onLeaveGuardChange, ...shared }) {
  const baseId = useId();

  // ----- The leave guard (R10) -----
  // guardRef holds the open rubric card's question (or null). guarded(action) runs the action now,
  // or — when the question opened — later, from its Discard button.
  const guardRef = useRef(null);
  const setGuard = useCallback((fn) => {
    guardRef.current = fn;
  }, []);
  const guarded = useCallback((action) => {
    if (guardRef.current && guardRef.current(action)) return;
    action();
  }, []);
  const appGuard = useCallback((proceed) => (guardRef.current ? guardRef.current(proceed) : false), []);
  useEffect(() => {
    if (!onLeaveGuardChange) return undefined;
    onLeaveGuardChange(appGuard);
    return () => onLeaveGuardChange(null);
  }, [onLeaveGuardChange, appGuard]);
  const ids = { tab: (key) => `${baseId}-tab-${key}`, panel: (key) => `${baseId}-panel-${key}` };
  // The page's tab (without a cycle: Cycles unless Rubric and prices was asked for).
  const tab = askedTab === 'rubric' ? 'rubric' : 'cycles';
  const setTab = (key) => onTab(key);
  function openCycle(id) {
    onOpen({ cycleId: id });
    window.scrollTo?.(0, 0);
  }
  // { replace: true } when the cycle closes by itself (deleted): Back then doesn't return to it.
  function closeCycle(replace = false) {
    onOpen({ cycleId: null, tab: 'cycles', replace });
  }

  // "Go to the default rubric" on a locked cycle's Rubric tab (R13).
  function goToDefaultRubric() {
    onOpen({ cycleId: null, tab: 'rubric' });
    window.scrollTo?.(0, 0);
  }

  if (cycleId) {
    return (
      <div className="testing bb">
        <CyclePage
          key={cycleId}
          cycleId={cycleId}
          isAdmin={isAdmin}
          tab={CYCLE_TABS.includes(askedTab) ? askedTab : 'candidates'}
          onTab={onTab}
          onBack={(options) => (options?.unguarded ? closeCycle(true) : guarded(() => closeCycle()))}
          onGoToDefaultRubric={() => guarded(goToDefaultRubric)}
          setGuard={setGuard}
          guarded={guarded}
          location={location}
          onLocationChange={onLocationChange}
          {...shared}
        />
      </div>
    );
  }

  const renderHeader = (action, staffLine) => (
    <Header action={action} staffLine={staffLine} tab={tab} onTab={(key) => guarded(() => setTab(key))} onBack={onBack} ids={ids} />
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
          setGuard={setGuard}
          {...shared}
        />
      )}
    </div>
  );
}
