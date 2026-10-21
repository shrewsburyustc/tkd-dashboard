// Camps.jsx — the Camps section (rail icon ti-tent, "Camps"; contract 0013 §6, mockups C1–C6).
// Why it exists: school-vacation camps (one or more days, a price grid, extras, a family sign-up
// form, check-in at the door and payments) get their own section after Testing. This file draws
// the frame of the section and decides which part shows:
//   - the page header: "Camps", the school under it, and + Add camp for admins (N on the PC)
//   - the tab bar: Camps · Templates (Templates is admin-only: staff don't see the tab at all)
//   - for staff, the gray line "Ask an admin to add or change camps."
//   - an open camp (address #camps/camp/<id>): that camp's page (camps/CampPage.jsx) instead
// The list itself lives in camps/CampsTab.jsx, the templates in camps/TemplatesTab.jsx.
//
// Unlike Testing, Camps works on "Both": the list then shows every camp with a School column
// (a camp can be for one school or for both, v0.710).
//
// Add camp / Edit camp / Use template / Edit template all open the same dialog
// (camps/CampDialog.jsx). It is kept HERE, above both tabs, because the header's + Add camp
// button belongs to both tabs. The dialog loads what it needs and saves by itself; this file only
// says which one is open and reloads the lists after a save.
//
// Props (from App.jsx):
//   location        'Worcester' | 'Shrewsbury' | 'Both' (the top-bar switcher)
//   isAdmin         show admin controls? (only for the screen — the database enforces the rules)
//   campId          the open camp's id, or null for the tabs
//   campTab         on the list: 'camps' | 'templates'; on a camp page: 'default' | 'checkin' |
//                   'payments' | 'attendance' (from the address)
//   onCampTab(tab)  switch the tab (App.jsx updates the address without a new history step)
//   onOpenCamp(id)  open a camp's page (App.jsx adds a browser history step)
//   onCloseCamp()   back to the list
//   followSchoolFor the camp id opened from Finance ("Open in Camps"), or null
//   onLocationChange(name)  moves the top-bar switcher (only used for that case)
//   screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange — as Testing
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { IconPlus } from '@tabler/icons-react';
import ErrorBanner from '../components/ErrorBanner.jsx';
import { useShortcutN } from '../lib/useShortcutN.js';
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import CampsTab from './camps/CampsTab.jsx';
import TemplatesTab from './camps/TemplatesTab.jsx';
import CampPage from './camps/CampPage.jsx';
import CampDialog from './camps/CampDialog.jsx';
import * as T from './camps/text.js';
import '../styles/testing-events.css';
import '../styles/camps.css';

// The switcher's name → the code the data layer uses (campsApi.loadCamps, §5.2).
const LOCATION_KEY = { Worcester: 'worcester', Shrewsbury: 'shrewsbury', Both: 'both' };

export default function Camps({
  location,
  isAdmin,
  campId,
  campTab,
  onCampTab,
  onOpenCamp,
  onCloseCamp,
  deviceLocation, // this device's home school ('Worcester' | 'Shrewsbury'): where Mark paid's money goes
  followSchoolFor = null, // a camp opened from Finance: its page may move the switcher once
  onLocationChange = null,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
}) {
  const baseId = useId();
  const locationKey = LOCATION_KEY[location] ?? 'worcester';
  const isPhone = useMediaQuery(PHONE_QUERY);
  // Staff never see Templates (C1 2026-10-19): an address "#camps/templates" shows Camps for them.
  const tab = campTab === 'templates' && isAdmin ? 'templates' : 'camps';
  const tabs = isAdmin ? ['camps', 'templates'] : ['camps'];

  // ----- The Add / Edit camp dialog (null = closed) -----
  // { key, mode: 'add' | 'edit' | 'template', campId?, template?, startTemplate?, opener }
  const [editor, setEditor] = useState(null);
  // Bumped after every save, so the open tab reloads its list quietly.
  const [refreshKey, setRefreshKey] = useState(0);
  // A dialog inside a tab or on the camp page is open (those report it here).
  const [childModal, setChildModal] = useState(false);
  // An Undo of "Camp added" that didn't work (a family signed up already, or no connection).
  const [banner, setBanner] = useState(null);

  const editorShown = editor !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange(editorShown || childModal);
  }, [editorShown, childModal, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  const openEditor = useCallback(
    (next) => {
      clearToast();
      setEditor({ key: Date.now(), ...next });
    },
    [clearToast],
  );

  // The opener (the button pressed) gets keyboard focus back when the dialog closes.
  const focusBackRef = useRef(null);
  function closeEditor() {
    const opener = editor?.opener ?? null;
    setEditor(null);
    focusBackRef.current = opener;
  }
  useEffect(() => {
    if (editor || screenLocked || !focusBackRef.current) return undefined;
    const target = focusBackRef.current;
    focusBackRef.current = null;
    // Wait a frame: the page is "inert" until the App hears the dialog closed.
    const frame = window.requestAnimationFrame(() => {
      if (target.isConnected) target.focus();
      else document.querySelector('[data-add-camp]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editor, screenLocked]);

  // After a save: close, reload, toast (Add camp gets Undo = delete the new, empty camp).
  function handleSaved(result) {
    closeEditor();
    setRefreshKey((n) => n + 1);
    if (result.kind === 'added') {
      showToast(T.TOAST_CAMP_ADDED, { icon: false, action: result.undo ? { label: T.UNDO, onAction: result.undo } : null });
    } else if (result.kind === 'camp') {
      showToast(T.TOAST_CAMP_SAVED, { icon: false });
    } else {
      showToast(T.TOAST_TEMPLATE_SAVED_EDIT, { icon: false });
    }
  }

  // ----- The header's + Add camp (admins; both tabs; N on the PC) -----
  const addShown = isAdmin && !campId;
  useShortcutN({
    enabled: addShown && editor === null && !childModal && !screenLocked,
    onPress: () => openEditor({ mode: 'add', opener: document.querySelector('[data-add-camp]') }),
  });
  const addButton = addShown ? (
    <button
      type="button"
      className="btn btn-primary"
      data-add-camp
      onClick={(event) => openEditor({ mode: 'add', opener: event.currentTarget })}
    >
      {/* ti-plus = add new */}
      <IconPlus size={16} aria-hidden="true" />
      {T.ADD_CAMP}
    </button>
  ) : null;

  const editorElement = editor ? (
    <CampDialog
      key={editor.key}
      mode={editor.mode}
      campId={editor.campId ?? null}
      template={editor.template ?? null}
      startTemplate={editor.startTemplate ?? null}
      defaultLocation={locationKey}
      isPhone={isPhone}
      hidden={screenLocked}
      onClose={closeEditor}
      onSaved={handleSaved}
      onNoAccess={onNoAccess}
      onRefreshProfile={onRefreshProfile}
      onUndoResult={(status) => {
        // The Undo of "Camp added" finished: reload, and say so.
        setRefreshKey((n) => n + 1);
        if (status === 'ok') showToast(T.TOAST_UNDONE, { icon: false });
        else if (status === 'no_access') onNoAccess();
        else setBanner({ text: status === 'error' ? T.UNDO_FAILED : T.UNDO_STALE });
      }}
    />
  ) : null;

  const shared = { screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange: setChildModal };

  // ----- One camp's page -----
  if (campId) {
    return (
      <div className="testing camps">
        <CampPage
          key={campId}
          campId={campId}
          locationKey={locationKey}
          isAdmin={isAdmin}
          tab={campTab}
          onTab={onCampTab}
          onBack={onCloseCamp}
          deviceLocation={deviceLocation}
          followSchool={followSchoolFor === campId}
          onLocationChange={onLocationChange}
          {...shared}
        />
      </div>
    );
  }

  // ----- The tabs -----
  const tabId = (key) => `${baseId}-tab-${key}`;
  const panelId = (key) => `${baseId}-panel-${key}`;
  function handleTabKeyDown(event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    onCampTab(next);
    document.getElementById(tabId(next))?.focus();
  }

  return (
    <div className="testing camps">
      <div className="phead">
        <div className="phead-titles">
          <h1 className="ptitle">{T.PAGE_TITLE}</h1>
          <p className="psub">{location === 'Both' ? T.BOTH_SCHOOLS_SUB : location}</p>
        </div>
        {addButton}
      </div>
      <div className={`ttabs${isPhone ? ' cp-tabs-phone' : ''}`} role="tablist" aria-label={T.PAGE_TITLE} onKeyDown={handleTabKeyDown}>
        {tabs.map((key) => {
          const current = key === tab;
          return (
            <button
              key={key}
              id={tabId(key)}
              type="button"
              className={`ttab${current ? ' is-current' : ''}`}
              role="tab"
              aria-selected={current ? 'true' : 'false'}
              aria-controls={panelId(key)}
              tabIndex={current ? 0 : -1}
              onClick={() => onCampTab(key)}
            >
              {key === 'camps' ? T.TAB_CAMPS : T.TAB_TEMPLATES}
            </button>
          );
        })}
      </div>
      {!isAdmin && <p className="viewonly">{T.STAFF_LINE}</p>}
      {banner && <ErrorBanner text={banner.text} onDismiss={() => setBanner(null)} />}

      {tab === 'templates' ? (
        <TemplatesTab
          panelId={panelId('templates')}
          tabId={tabId('templates')}
          refreshKey={refreshKey}
          isPhone={isPhone}
          onUse={(template, opener) => openEditor({ mode: 'add', startTemplate: template, opener })}
          onEdit={(template, opener) => openEditor({ mode: 'template', template, opener })}
          {...shared}
        />
      ) : (
        <CampsTab
          locationKey={locationKey}
          isAdmin={isAdmin}
          panelId={panelId('camps')}
          tabId={tabId('camps')}
          refreshKey={refreshKey}
          onOpenCamp={onOpenCamp}
          onEditCamp={(camp, opener) => openEditor({ mode: 'edit', campId: camp.id, opener })}
          {...shared}
        />
      )}
      {editorElement}
    </div>
  );
}
