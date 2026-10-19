// StarTesting.jsx — the Star testing home page (address #testing/star, phase 1).
// Why it exists: Star testing lives inside Testing next to Color belt testing (v0.58) and is
// joint for both schools, so — unlike Color Belt — it works on Both: there is no "choose a
// school" block and no school line. The approved phase 1 header (Chooser mockups screen 5,
// v0.177) is:
//   ← Testing                      (back to the Testing choice page, v0.59; ti-arrow-left)
//   Star testing                   (the page title)
//   [Rubrics and prices]           (the tab bar — ONLY this tab in phase 1; Events joins it in
//                                   phase 2 without the page jumping, rule P7)
//   View only. Ask an admin to make changes.      (staff only, v0.40 pattern)
//   Same for both schools. Events keep the rubric and prices they were created with.
// The tab itself is RubricsTab.jsx. This tab has no page-header button (nothing to "add" at page
// level, approved screen 1).
//
// Props (from the screen that shows it — wired in by Testing.jsx / App.jsx):
//   isAdmin            show edit controls? (only for the screen — the database enforces the rule)
//   onBack()           "← Testing": back to the Testing choice page
//   screenLocked       true while the lock screen shows (dialogs and menus are hidden, no requests)
//   onNoAccess()       the database refused data because this sign-in is locked: lock the screen
//   onRefreshProfile() re-read "who am I?" (e.g. after the database said "not allowed")
//   showToast(text, { action, icon }) / clearToast()   the toast at the bottom (with Undo)
//   onModalOpenChange(open)  tells the App a dialog is open (the page behind becomes inert)
import { useId } from 'react';
import { IconArrowLeft } from '@tabler/icons-react';
import RubricsTab from './RubricsTab.jsx';
import * as T from './text.js';
import './star.css';

export default function StarTesting({
  isAdmin,
  onBack,
  screenLocked = false,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
}) {
  const baseId = useId();
  const tabId = `${baseId}-tab-rubrics`;
  const panelId = `${baseId}-panel-rubrics`;

  return (
    <div className="testing st-page">
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
      </div>
      {/* One tab for now. A tab list with one tab still tells screen readers what the area is. */}
      <div className="ttabs" role="tablist" aria-label={T.PAGE_TITLE}>
        <button id={tabId} type="button" className="ttab is-current" role="tab" aria-selected="true" aria-controls={panelId} tabIndex={0}>
          {T.TAB_RUBRICS}
        </button>
      </div>
      {!isAdmin && <p className="viewonly">{T.VIEW_ONLY_LINE}</p>}
      <p className="viewonly">{T.SAME_FOR_BOTH}</p>
      <RubricsTab
        isAdmin={isAdmin}
        panelId={panelId}
        tabId={tabId}
        screenLocked={screenLocked}
        onNoAccess={onNoAccess}
        onRefreshProfile={onRefreshProfile}
        showToast={showToast}
        clearToast={clearToast}
        onModalOpenChange={onModalOpenChange}
      />
    </div>
  );
}
