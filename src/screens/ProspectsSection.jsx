// ProspectsSection.jsx — the Prospects section: two tabs, Prospects (first) and Forms.
// Why it exists (Jeffrey 2026-11-17): Prospects and Forms were two rail entries; now they are one section.
// Clicking "Prospects" opens the Prospects tab; the Forms tab is next to it. This file only decides which of the two
// screens is shown and holds what has to survive a trip between the tabs: the picked forms of the Forms
// filter (so Prospects ↔ Forms ↔ Prospects keeps them). It resets on its own when the screen locks, when
// someone signs out (the section closes) and on a reload; leaving the section for another page also starts
// again on "All forms" — nobody, least of all at the shared front-desk computer, should start a day looking at
// half the prospects without knowing it.
// Each screen draws the tab bar itself, under its own page head (ProspectsTabs.jsx); the address says the tab
// (#prospects, #prospects/forms — pageAddress.js) and changing it adds no history step (App.jsx changeProspectsTab).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Forms from './Forms.jsx';
import Prospects from './Prospects.jsx';
import ProspectsTabs, { prospectsTabId } from './prospects/ProspectsTabs.jsx';
import { clearProspectFormsCache } from '../lib/prospects/useProspectForms.js';
import * as T from './prospects/text.js';

const NO_FORMS = [];

export default function ProspectsSection({ tab, onTab, staffId, profile, isAdmin, location, profileName, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange, onBadgeRefresh }) {
  const [pickedForms, setPickedForms] = useState(NO_FORMS);
  const changeForms = useCallback((ids) => setPickedForms(ids.length === 0 ? NO_FORMS : ids), []);

  // A locked screen forgets the filter and what was learned about each family's form; a sign-out does too.
  useEffect(() => {
    if (screenLocked) {
      setPickedForms(NO_FORMS);
      clearProspectFormsCache();
    }
  }, [screenLocked]);
  useEffect(() => {
    const forget = () => clearProspectFormsCache();
    window.addEventListener('tkd:signed-out', forget);
    return () => window.removeEventListener('tkd:signed-out', forget);
  }, []);

  // Each tab's screen draws the bar, so a tab change draws a new bar: the tab that was used (keyboard ← →) keeps focus.
  const focusTab = useRef(false);
  const changeTab = useCallback((next, { focus = false } = {}) => {
    focusTab.current = focus;
    onTab(next);
  }, [onTab]);
  useLayoutEffect(() => {
    if (!focusTab.current) return;
    focusTab.current = false;
    document.getElementById(prospectsTabId(tab))?.focus();
  }, [tab]);

  const tabs = <ProspectsTabs current={tab} onTab={changeTab} />;
  if (tab === 'forms') {
    return (
      <Forms
        location={location}
        profile={profile}
        isAdmin={isAdmin}
        screenLocked={screenLocked}
        onNoAccess={onNoAccess}
        onRefreshProfile={onRefreshProfile}
        showToast={showToast}
        clearToast={clearToast}
        onModalOpenChange={onModalOpenChange}
        // the section's title stays "Prospects" on both tabs; the tab says which one is open
        heading={T.PAGE_TITLE}
        tabs={tabs}
      />
    );
  }
  return (
    <Prospects
      location={location}
      staffId={staffId}
      isAdmin={isAdmin}
      profileName={profileName}
      screenLocked={screenLocked}
      onNoAccess={onNoAccess}
      onRefreshProfile={onRefreshProfile}
      showToast={showToast}
      clearToast={clearToast}
      onModalOpenChange={onModalOpenChange}
      onBadgeRefresh={onBadgeRefresh}
      tabs={tabs}
      formFilter={pickedForms}
      onFormFilter={changeForms}
    />
  );
}
