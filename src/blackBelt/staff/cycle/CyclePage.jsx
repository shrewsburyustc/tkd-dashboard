// CyclePage.jsx — one Black Belt testing cycle's page.
// Why it exists: approved mockup Cycles 8 (contract CONTRACT-0016-B1 §3, OP-7). It shows:
//   - "← Black Belt testing", the cycle name as the page title, and the summary line
//     "First day Sat, Apr 3, 2027 · 3 testing days · both schools · 9 candidates"
//     (14px, normal text color; it wraps under the title on phones)
//   - a ⋯ menu opposite the title: Edit cycle (admins) · Registration links · Close / Open
//     registration (staff: Open grayed after the application date, with the reason)
//   - "+ Add candidate" (primary; N on the PC) beside the ⋯ (phones: both under the summary line)
//     — phase B2, contract CONTRACT-0016-B2 §3.2 / §3.7. Grayed with its reason while the device's
//     Hide payments switch is on ("Add new candidates at the desk.", OP-B7) or the cycle is past.
//   - the tabs (v0.946): Candidates (candidates/CandidatesTab.jsx, phase B2) · Grading
//     (grading/GradingTab.jsx, migration 0025, contract 0025 §14.2) · Results (results/ResultsTab.jsx,
//     §14.3) · Rubric (this cycle's own copy of the rubric, CycleRubricTab.jsx — migration 0024,
//     mockups R12 / R13). ← → move between the tabs; leaving the Rubric tab with unsaved changes
//     asks first (guarded, R10). The tab lives in the page address (C2, v0.937 / contract §14.1).
//   - Grading's data and its ONE save engine live HERE (grading/useBbGrading.js), not in the tab, so
//     Not saved grades keep retrying while the grader switches tabs (Star's pattern). Switching tabs
//     never asks; leaving the cycle page with Not saved grades asks "N grades aren't saved" first
//     (G 8) — the same leave guard as the rubric's question.
//   - Results' "Open grades" switches to Grading on that Dan and testing day (`gradingFocus`, app
//     state only — the address just says /grading, §14.1).
//   - on the Rubric tab, under the tabs: "This cycle's rubric can be changed until registration
//     first opens…" (admins), "View only…" (staff), and the lock line with "Go to the default
//     rubric" once registration has opened.
//   - for staff, once registration has closed by its date: the gray line "Registration closed on
//     Sat, Mar 27. Ask an admin to reopen it." under the tabs (approved on Candidates 2).
// A cycle that no longer exists (deleted elsewhere) → "This cycle was deleted." and back to the
// Cycles tab.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconDots, IconEdit, IconLock, IconLockOpen, IconPlus, IconQrcode } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import IconButton from '../../../components/IconButton.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { loadCycle, schoolToday } from '../../../lib/blackBelt/api.js';
import { PHONE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { useShortcutN } from '../../../lib/useShortcutN.js';
import { usePaymentsHidden } from '../../../screens/finance/usePaymentsHidden.js';
import CandidatesTab from '../candidates/CandidatesTab.jsx';
import GradingTab from '../grading/GradingTab.jsx';
import { useBbGrading } from '../grading/useBbGrading.js';
import * as GT from '../grading/text.js';
import ResultsTab from '../results/ResultsTab.jsx';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../screens/testing/events/useLiveLoad.js';
import { openNeedsAdmin, useCycleActions } from '../cycles/useCycleActions.js';
import CycleRubricTab, { CycleRubricLine, useCycleRubricLoad } from './CycleRubricTab.jsx';
import LinksDialog from './LinksDialog.jsx';
import { useCycleEditor } from './useCycleEditor.jsx';
import * as T from '../text.js';

const load = (cycleId) => loadCycle({ cycleId });

function TwoLines({ label, reason }) {
  return (
    <span className="ev-menu-two">
      <span>{label}</span>
      <span className="ev-menu-reason">{reason}</span>
    </span>
  );
}

export default function CyclePage({ cycleId, isAdmin, tab = 'candidates', onTab, onBack, onGoToDefaultRubric, setGuard, guarded = (action) => action(), location, onLocationChange, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange }) {
  const live = useLiveLoad({ key: cycleId, enabled: !screenLocked, load, refreshMs: LIVE_REFRESH_MS });
  const cycle = live.data?.cycle ?? null;
  const today = schoolToday();
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });
  const isPhone = useMediaQuery(PHONE_QUERY);
  // Candidates · Grading · Results · Rubric (v0.946). The tab lives in the page address (C2,
  // v0.937; contract 0025 §14.1): #testing/black-belt/cycle/<id>(/grading|/results|/rubric) —
  // BlackBeltTesting.jsx passes it in.
  const setTab = (key) => onTab(key);
  const [rubricModal, setRubricModal] = useState(false);
  const [gradingModal, setGradingModal] = useState(false);
  const [resultsModal, setResultsModal] = useState(false);

  // ----- Grading (contract 0025 §14.2): its data and ONE save engine, kept on this page -----
  const grading = useBbGrading({ cycleId, active: tab === 'grading', screenLocked, onNoAccess });
  // Results' "Open grades": that Dan and testing day on the Grading tab (app state only, §14.1).
  const [gradingFocus, setGradingFocus] = useState(null); // { dan, dayKey, candidateId, key }
  const openGrades = useCallback(({ dan, dayKey, candidateId } = {}) => {
    setGradingFocus({ dan: dan ?? null, dayKey: dayKey ?? null, candidateId: candidateId ?? null, key: Date.now() });
    onTab('grading');
    window.scrollTo?.(0, 0);
  }, [onTab]);
  // The mark goes when Grading is left (as Star's).
  useEffect(() => {
    if (tab !== 'grading') setGradingFocus(null);
  }, [tab]);

  // ----- The leave guard: the rubric card's question (R10) and Grading's Not saved grades (G 8) -----
  // BlackBeltTesting keeps ONE guard for this page; it asks Grading first, then the rubric card.
  // Switching tabs inside the page asks only the rubric card (Grading's saves go on in the background).
  const rubricGuardRef = useRef(null);
  const setRubricGuard = useCallback((fn) => {
    rubricGuardRef.current = fn;
  }, []);
  const gradingGuardRef = useRef(grading.guard);
  useLayoutEffect(() => {
    gradingGuardRef.current = grading.guard;
  });
  useEffect(() => {
    if (!setGuard) return undefined;
    setGuard((proceed) => gradingGuardRef.current(proceed) || (rubricGuardRef.current ? rubricGuardRef.current(proceed) : false));
    return () => setGuard(null);
  }, [setGuard]);
  const guardedTab = (action) => {
    if (rubricGuardRef.current && rubricGuardRef.current(action)) return;
    action();
  };
  const rubricLive = useCycleRubricLoad({ cycleId, version: cycle?.version ?? null, enabled: !screenLocked && tab === 'rubric', onNoAccess });

  const [menu, setMenu] = useState(null); // { anchor }
  const [links, setLinks] = useState(null); // { opener } while Registration links is open
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  function beginWrite() {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }
  function endWrite(status) {
    busyRef.current = false;
    setBusy(false);
    if (status && status !== 'ok') clearToast();
  }
  const reloadQuiet = () => liveRef.current.reload();

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  // Deleted (here or elsewhere), or an address with a wrong id: go back to the Cycles tab and say
  // so. In this order: going back is a page change, and a page change clears the toast (App.jsx).
  useEffect(() => {
    if (live.status !== 'notFound') return;
    onBack({ unguarded: true });
    showToast(T.CYCLE_DELETED, { icon: false });
  }, [live.status, onBack, showToast]);

  useEffect(() => {
    if (screenLocked) setMenu(null);
  }, [screenLocked]);

  const moreRef = useRef(null);
  const actions = useCycleActions({ isAdmin, today, beginWrite, endWrite, reload: reloadQuiet, setBanner, showToast, clearToast, onNoAccess, onRefreshProfile });
  const editor = useCycleEditor({
    isAdmin,
    today,
    cycles: null,
    screenLocked,
    beginWrite,
    endWrite,
    setBanner,
    onNoAccess,
    onRefreshProfile,
    showToast,
    clearToast,
    onSaved: () => {
      reloadQuiet();
      window.requestAnimationFrame(() => moreRef.current?.querySelector('button')?.focus());
    },
    onClosed: () => window.requestAnimationFrame(() => moreRef.current?.querySelector('button')?.focus()),
    onGone: () => reloadQuiet(),
  });

  // The Candidates tab (B2): its dialogs count as "a dialog is open" too, and its Add candidate
  // dialog opens from this page's header button through candidatesRef.
  const candidatesRef = useRef(null);
  const addRef = useRef(null);
  const [candidatesModal, setCandidatesModal] = useState(false);
  const [paymentsHidden] = usePaymentsHidden();
  const cyclePast = cycle ? cycle.state?.state === 'past' || cycle.state?.past === true : false;
  // Why Add candidate is grayed (null = it can be used).
  const addBlocked = paymentsHidden ? T.ADD_AT_DESK : cyclePast ? T.CANDIDATE_FINISHED : null;
  function pressAdd() {
    if (addBlocked) {
      showToast(addBlocked, { icon: false });
      return;
    }
    candidatesRef.current?.openAdd(addRef.current);
  }

  const modalShown = (editor.isOpen || links !== null || candidatesModal || rubricModal || gradingModal || resultsModal || grading.leave !== null) && !screenLocked;
  useShortcutN({ enabled: Boolean(cycle) && !addBlocked && !modalShown && !screenLocked && !menu && !busy, onPress: pressAdd });
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  const backLink = (
    <button type="button" className="link-button ev-back bb-back" onClick={() => onBack()}>
      {/* ti-arrow-left = back */}
      <IconArrowLeft size={16} aria-hidden="true" />
      {T.BACK_TO_BLACK_BELT}
    </button>
  );

  if (live.status === 'loading' || live.status === 'idle' || live.status === 'noAccess' || live.status === 'notFound') {
    return (
      <>
        {backLink}
        <div className="clist tskeleton ev-page-skeleton" aria-busy="true">
          <span className="visually-hidden">{T.LOADING_CYCLE}</span>
          {[0, 1, 2].map((index) => (
            <div key={index} className="tskeleton-row" aria-hidden="true">
              <span className="tskeleton-bar" />
            </div>
          ))}
        </div>
      </>
    );
  }
  if (live.status === 'error' || !cycle) {
    return (
      <>
        {backLink}
        <ErrorBanner text={T.LOAD_FAILED} onRetry={() => liveRef.current.reload()} />
      </>
    );
  }

  const state = cycle.state ?? {};
  const isPast = state.state === 'past' || state.past === true;

  const addButton = (
    <>
      <button
        ref={addRef}
        type="button"
        className={`btn btn-primary bb-add-candidate${addBlocked ? ' is-unavailable' : ''}`}
        aria-disabled={addBlocked ? 'true' : undefined}
        aria-describedby={addBlocked ? `bb-add-reason-${cycle.id}` : undefined}
        onClick={pressAdd}
      >
        {/* ti-plus = add new */}
        <IconPlus size={16} aria-hidden="true" />
        {T.ADD_CANDIDATE}
      </button>
      {/* The reason, read with the button (outside it, so it isn't part of the button's name) */}
      {addBlocked && (
        <span id={`bb-add-reason-${cycle.id}`} className="visually-hidden">
          {addBlocked}
        </span>
      )}
    </>
  );
  // Staff, after registration closed by its date (only an admin can reopen then).
  const staffLine = !isAdmin && !isPast && state.registration !== 'open' && openNeedsAdmin(cycle, today) ? T.registrationClosedStaff(cycle.applicationDue) : null;

  function menuItems() {
    const items = [];
    if (isAdmin) items.push({ key: 'edit', label: T.EDIT_CYCLE, Icon: IconEdit, disabled: busy, onSelect: () => editor.openEdit(cycle.id, moreRef.current) });
    items.push({ key: 'links', label: T.REGISTRATION_LINKS, Icon: IconQrcode, onSelect: () => setLinks({ opener: moreRef.current }) });
    if (!isPast) {
      if (state.registration === 'open') {
        items.push({ key: 'close', label: T.CLOSE_REGISTRATION, Icon: IconLock, disabled: busy, onSelect: () => actions.switchRegistration(cycle, false) });
      } else {
        // Grayed with its reason for staff: the first opening (it locks the rubric, v0.930) and
        // reopening after the application date are admin-only.
        const blocked = actions.openBlockedReason(cycle);
        items.push({
          key: 'open',
          label: blocked ? <TwoLines label={T.OPEN_REGISTRATION} reason={blocked} /> : T.OPEN_REGISTRATION,
          Icon: IconLockOpen,
          disabled: busy || Boolean(blocked),
          onSelect: () => actions.switchRegistration(cycle, true),
        });
      }
    }
    return items;
  }

  const firstDay = state.firstDay ?? cycle.days?.[0]?.date ?? null;
  // The tabs, in order (v0.946). The ids match what each tab's panel names (ResultsTab: bb-cycle-results-…).
  const cycleTabs = [
    { key: 'candidates', label: T.TAB_CANDIDATES, id: `bb-cycle-tab-${cycle.id}`, panel: `bb-cycle-panel-${cycle.id}` },
    { key: 'grading', label: GT.TAB_GRADING, id: `bb-cycle-tab-grading-${cycle.id}`, panel: `bb-cycle-grading-${cycle.id}` },
    { key: 'results', label: GT.TAB_RESULTS, id: `bb-cycle-tab-results-${cycle.id}`, panel: `bb-cycle-results-${cycle.id}` },
    { key: 'rubric', label: T.TAB_CYCLE_RUBRIC, id: `bb-cycle-tab-rubric-${cycle.id}`, panel: `bb-cycle-rubric-${cycle.id}` },
  ];

  return (
    <>
      {backLink}
      <div className="phead ev-phead bb-cycle-head">
        <div className="phead-titles">
          <h1 className="ptitle">{cycle.name}</h1>
          <p className="ev-summary bb-summary">{T.cycleSummary(firstDay, cycle.days?.length ?? 0, cycle.candidateCount ?? 0)}</p>
        </div>
        {!isPhone && addButton}
        <span ref={moreRef} className="bb-head-more">
          <IconButton
            label={T.moreFor(cycle.name)}
            Icon={IconDots}
            aria-haspopup="menu"
            aria-expanded={menu ? 'true' : 'false'}
            onClick={(event) => {
              const anchor = event.currentTarget;
              setMenu((current) => (current ? null : { anchor }));
            }}
          />
        </span>
      </div>
      {isPhone && <div className="bb-phone-add">{addButton}</div>}
      <div
        className="ttabs ev-tabs"
        role="tablist"
        aria-label={cycle.name}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          event.preventDefault();
          const index = cycleTabs.findIndex((t) => t.key === tab);
          const next = cycleTabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + cycleTabs.length) % cycleTabs.length];
          guardedTab(() => setTab(next.key));
          document.getElementById(next.id)?.focus();
        }}
      >
        {cycleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            id={t.id}
            className={`ttab${tab === t.key ? ' is-current' : ''}`}
            role="tab"
            aria-selected={tab === t.key ? 'true' : 'false'}
            aria-controls={t.panel}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => tab !== t.key && guardedTab(() => setTab(t.key))}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'candidates' && staffLine && <p className="viewonly">{staffLine}</p>}
      {tab === 'rubric' && !isAdmin && <p className="viewonly">{T.VIEW_ONLY}</p>}
      {tab === 'rubric' && rubricLive.status === 'ready' && rubricLive.data && (
        <CycleRubricLine locked={rubricLive.data.locked} firstOpenedAt={rubricLive.data.firstOpenedAt} gradingStartedAt={rubricLive.data.gradingStartedAt ?? null} onGoToDefaultRubric={onGoToDefaultRubric} />
      )}
      {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy} onDismiss={() => setBanner(null)} />}
      {tab === 'rubric' && (
        <CycleRubricTab
          cycle={cycle}
          live={rubricLive}
          isAdmin={isAdmin}
          isPhone={isPhone}
          screenLocked={screenLocked}
          panelId={`bb-cycle-rubric-${cycle.id}`}
          tabId={`bb-cycle-tab-rubric-${cycle.id}`}
          setGuard={setRubricGuard}
          onModalChange={setRubricModal}
          onLockedNow={reloadQuiet}
          showToast={showToast}
          clearToast={clearToast}
          onNoAccess={onNoAccess}
          onRefreshProfile={onRefreshProfile}
        />
      )}
      {tab === 'grading' && (
        <GradingTab
          cycle={cycle}
          grading={grading}
          isAdmin={isAdmin}
          location={location}
          onLocationChange={onLocationChange}
          screenLocked={screenLocked}
          onNoAccess={onNoAccess}
          focus={gradingFocus}
          onModalChange={setGradingModal}
          panelId={`bb-cycle-grading-${cycle.id}`}
          tabId={`bb-cycle-tab-grading-${cycle.id}`}
        />
      )}
      {tab === 'results' && (
        <ResultsTab
          cycle={cycle}
          cycleId={cycle.id}
          isAdmin={isAdmin}
          location={location}
          onLocationChange={onLocationChange}
          screenLocked={screenLocked}
          onNoAccess={onNoAccess}
          onRefreshProfile={onRefreshProfile}
          showToast={showToast}
          clearToast={clearToast}
          onModalOpenChange={setResultsModal}
          onOpenGrades={openGrades}
        />
      )}
      {/* Candidates stays mounted (hidden) while another tab is open, so its list and the
          header's Add candidate keep working. */}
      <div hidden={tab !== 'candidates'}>
      <CandidatesTab
        cycle={cycle}
        isAdmin={isAdmin}
        location={location}
        onLocationChange={onLocationChange}
        screenLocked={screenLocked}
        onNoAccess={onNoAccess}
        onRefreshProfile={onRefreshProfile}
        showToast={showToast}
        clearToast={clearToast}
        onModalChange={setCandidatesModal}
        onCandidatesChanged={reloadQuiet}
        actionsRef={candidatesRef}
        panelId={`bb-cycle-panel-${cycle.id}`}
        tabId={`bb-cycle-tab-${cycle.id}`}
      />
      </div>

      {menu && !screenLocked && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={cycle.name}
          subtitle={T.cycleSummary(firstDay, cycle.days?.length ?? 0, cycle.candidateCount ?? 0)}
          label={T.moreFor(cycle.name)}
          items={menuItems()}
          onClose={(reason) => {
            const anchor = menu.anchor;
            setMenu(null);
            if (reason === 'escape' || reason === 'tab') anchor?.focus();
          }}
        />
      )}
      {!screenLocked && editor.element}
      {grading.leave && !screenLocked && (
        // Star's / Color Belt v0.192's box (G 8): nothing is deleted, so no red — "Stay on this page"
        // is the blue default (Enter, Esc, backdrop, Back).
        <Dialog key={grading.leave.key} title={grading.leave.title} variant="confirm" describedBy={`bb-leave-${cycle.id}`} onRequestClose={grading.stayOnPage}>
          <p id={`bb-leave-${cycle.id}`} className="tdialog-sub tdialog-body">
            {grading.leave.body}
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={grading.leaveAnyway}>
              {GT.S.LEAVE_ANYWAY}
            </button>
            <button type="button" className="btn btn-primary" data-autofocus onClick={grading.stayOnPage}>
              {GT.S.STAY_ON_PAGE}
            </button>
          </div>
        </Dialog>
      )}
      {links && !screenLocked && (
        <LinksDialog
          cycle={cycle}
          isPhone={isPhone}
          onCopy={(code) => actions.copyLink(code)}
          showToast={showToast}
          onClose={() => {
            const opener = links.opener;
            setLinks(null);
            window.requestAnimationFrame(() => opener?.querySelector?.('button')?.focus());
          }}
        />
      )}
    </>
  );
}
