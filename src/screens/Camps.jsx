// Camps.jsx — the Camps section (rail icon ti-tent, "Camps"; contract 0013 §6, mockups C1–C6).
// Why it exists: school-vacation camps (one or more days, a price grid, extras, a family sign-up
// form, check-in at the door and payments) get their own section after Testing. This file draws
// the frame of the section and decides which part shows:
//   - the page header: "Camps", the school under it ("Both schools" on Both: rulebook v0.723,
//     design review C15), and + Add camp for admins (N on the PC)
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
// says which one is open and reloads the lists after a save. Every save's toast has Undo for 5
// seconds (rulebook v0.726); an Undo the database refuses shows why in the amber bar here.
//
// The list page's line of saves (design review R2-05, rulebook v1.125–v1.129): `Camps` only decides
// which page shows (a camp's page, or the list page `CampsList` below). The list page keeps ONE save
// line (useSaveLine, src/lib/saveLine.js) and ONE amber bar (a PageBar under the top bar, v1.128),
// shared by the frame, the Camps tab and the Templates tab: the Undo of "Camp added", "Camp saved"
// and "Template saved" is line.undoAction(…), and so are the Camps tab's Close / Open sign-up and
// Save as template (CampRowMenu.jsx), so an Undo pressed during another save WAITS its turn instead of
// being dropped, and the line says "Undone" or shows the bar. It is a page of its own (not kept in
// `Camps`) so that when a camp's page opens, this one closes: an Undo that is still running and then
// fails is shown by the bar under the top bar of the page the person is on, naming the change and
// the section (v1.129).
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
import PageBar from '../components/PageBar.jsx';
import { useSaveLine } from '../lib/saveLine.js';
import { useShortcutN } from '../lib/useShortcutN.js';
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import CampsTab from './camps/CampsTab.jsx';
import TemplatesTab from './camps/TemplatesTab.jsx';
import CampPage from './camps/CampPage.jsx';
import CampDialog from './camps/CampDialog.jsx';
import { focusSoon } from './camps/focusSoon.js';
import { undoAnswer } from './camps/lineSave.js';
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
  const locationKey = LOCATION_KEY[location] ?? 'worcester';
  // ----- One camp's page (it keeps its own save line and bar: camps/CampPage.jsx) -----
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
  return (
    <CampsList
      location={location}
      locationKey={locationKey}
      isAdmin={isAdmin}
      campTab={campTab}
      onCampTab={onCampTab}
      onOpenCamp={onOpenCamp}
      screenLocked={screenLocked}
      onNoAccess={onNoAccess}
      onRefreshProfile={onRefreshProfile}
      showToast={showToast}
      clearToast={clearToast}
      onModalOpenChange={onModalOpenChange}
    />
  );
}

// The list page: the header, the Camps / Templates tabs, the Add / Edit camp dialog, and the page's
// one save line and one amber bar.
function CampsList({
  location,
  locationKey,
  isAdmin,
  campTab,
  onCampTab,
  onOpenCamp,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
}) {
  const baseId = useId();
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
  // The page's one amber bar (a PageBar, drawn below): { kind?, text, retry?, retrying?, takeFocus? }.
  // The tabs put their own bars here too (Camps tab: a failed Close / Open sign-up, a failed read;
  // Templates tab: a refused delete); kind 'undo' is the one the save line makes for an Undo that
  // didn't save or was refused (a family signed up already, no connection, a day picked …).
  const [banner, setBanner] = useState(null);
  // The list page's line of saves (R2-05): one save at a time, and an Undo pressed meanwhile waits.
  const line = useSaveLine({
    section: 'Camps',
    showToast,
    undoBar: (next) => setBanner((current) => (next ? { kind: 'undo', ...next } : current?.kind === 'undo' ? null : current)),
  });

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
    // The page is "inert" until the App hears the dialog closed — that can take more than one
    // frame, and focus() on an inert button does nothing (focus fell to <body> after Cancel in
    // Edit camp, design review). focusSoon waits until it is usable, as the camp page does.
    focusSoon(() => (target.isConnected ? target : document.querySelector('[data-add-camp]')));
    return undefined;
  }, [editor, screenLocked]);

  // After a save: close, reload, toast with Undo for 5 seconds (rulebook v0.726, design review C5):
  //   Add camp      → "Camp added" · Undo = delete the new, empty camp (reports via onUndoResult)
  //   Edit camp     → "Camp saved" · Undo = save the camp's old values again
  //   Edit template → "Template saved" · Undo = save the template's old values again
  // The dialog's onSaved result may carry `name` (the camp's or template's name); without it the
  // refusal says "this camp" / "this template" (R2-07: it names what it can).
  function handleSaved(result) {
    closeEditor();
    setRefreshKey((n) => n + 1);
    if (result.kind === 'added') {
      // Add camp's undo() reports through onUndoResult (below) and answers nothing: runAddUndo makes it
      // an answer for the line.
      showToast(T.TOAST_CAMP_ADDED, {
        icon: false,
        action: result.undo
          ? line.undoAction(() => runAddUndo(result.undo, result.name ?? T.THIS_CAMP), { words: T.TOAST_CAMP_ADDED })
          : null,
      });
      return;
    }
    const text = result.kind === 'camp' ? T.TOAST_CAMP_SAVED : T.TOAST_TEMPLATE_SAVED_EDIT;
    const undo = result.undo;
    const name = result.name ?? (result.kind === 'camp' ? T.THIS_CAMP : T.THIS_TEMPLATE);
    showToast(text, { icon: false, action: undo ? line.undoAction(() => runUndo(undo, name), { words: text }) : null });
  }

  // The Undo of Edit camp / Edit template, as the line wants it (its run(): { status, reason? }).
  // undo() → the database's answer + undoText. The list reloads whatever the answer. A refusal says
  // why when the database said (a family picked a newly added day, 0027's guard …, "Couldn't undo: …"),
  // else "Someone else changed [Name] just now …" (stale, not_found, a template name taken …).
  async function runUndo(undo, name) {
    const result = await undo();
    setRefreshKey((n) => n + 1);
    return finishUndo(undoAnswer(result, { notAllowed: T.CAMPS_NOT_ALLOWED, stale: T.someoneElseChanged(name) }));
  }
  // Add camp's Undo: undo() deletes the new camp and reports its status through onUndoResult, which
  // leaves it in addUndoStatus (a ref: the dialog is gone by then and its callbacks are old).
  const addUndoStatus = useRef(null);
  async function runAddUndo(undo, name) {
    addUndoStatus.current = null;
    await undo();
    const status = addUndoStatus.current ?? 'error';
    addUndoStatus.current = null;
    setRefreshKey((n) => n + 1);
    return finishUndo(undoAnswer({ status }, { notAllowed: T.CAMPS_NOT_ALLOWED, stale: T.someoneElseChanged(name) }));
  }
  // What this page does itself after an Undo's answer (the line says the rest): lock the screen when
  // the database locked this sign-in; refresh the profile after "only an admin".
  function finishUndo(answer) {
    if (answer.status === 'no_access') onNoAccess();
    else if (answer.status === 'not_allowed') onRefreshProfile();
    return answer;
  }

  // A toast and its Undo belong to the tab they were made on (as App drops them when the page
  // changes): switching Camps ↔ Templates drops it, so an Undo never runs behind another tab.
  function changeTab(next) {
    if (next !== tab) {
      clearToast();
      // A tab's own bar goes with the tab; a failed Undo's bar stays (it belongs to the page).
      setBanner((current) => (current?.kind === 'undo' ? current : null));
    }
    onCampTab(next);
  }

  // ----- The header's + Add camp (admins; both tabs; N on the PC) -----
  const addShown = isAdmin;
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
      // The Undo of "Camp added" finished: runAddUndo (above) picks the status up from here.
      onUndoResult={(status) => {
        addUndoStatus.current = status;
      }}
    />
  ) : null;

  // What both tabs get: the page's line and bar setter (they put their own bars in the page's one bar).
  const shared = { screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange: setChildModal, line, setBanner };

  // ----- The tabs -----
  const tabId = (key) => `${baseId}-tab-${key}`;
  const panelId = (key) => `${baseId}-panel-${key}`;
  function handleTabKeyDown(event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    changeTab(next);
    document.getElementById(tabId(next))?.focus();
  }

  return (
    <div className="testing camps">
      <div className="phead">
        <div className="phead-titles">
          <h1 className="ptitle">{T.PAGE_TITLE}</h1>
          <p className="psub">{location === 'Both' ? T.BOTH_SCHOOLS : location}</p>
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
              onClick={() => changeTab(key)}
            >
              {key === 'camps' ? T.TAB_CAMPS : T.TAB_TEMPLATES}
            </button>
          );
        })}
      </div>
      {!isAdmin && <p className="viewonly">{T.STAFF_LINE}</p>}
      {/* The page's amber bar, under the top bar (PageBar, v1.128): in view however far the list is scrolled. */}
      {banner && (
        <PageBar
          text={banner.text}
          onRetry={banner.retry ? () => banner.retry() : undefined}
          retrying={Boolean(banner.retrying) || line.busy}
          onDismiss={() => setBanner(null)}
          takeFocus={Boolean(banner.takeFocus)}
        />
      )}

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
