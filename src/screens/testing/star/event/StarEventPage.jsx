// StarEventPage.jsx — one Star testing event's page (address #testing/star/event/<id>, and its
// Grading tab #testing/star/event/<id>/grading).
// Why it exists: Events mockup screen 11 (v0.90, v0.92), gap mockups G2–G3 (v0.500), from build
// phase 3 the Candidates tab (Candidates mockups v0.121, gap mockups G1–G16, v0.508) and from build
// phase 5 the Grading tab (Grading mockups v0.137, Phase 5 gap mockups H1–H7, v0.512):
//   ← Star testing
//   Fall 2026 Star Testing                [+ Add candidate] [Registration link]
//   Sat, Nov 14, 2026 · 10:00 AM at Shrewsbury school · both schools · 23 candidates
//   (14px in the normal text color, v0.92; on phones the buttons sit under this line)
//   [Candidates] [Grading]                the tab bar — Results joins in phase 6: no placeholder tab
//                                         (rule P7, v0.50, v0.177). Switching tabs changes the
//                                         address in place (App.jsx: no new Back step, a reload
//                                         keeps the tab), as Color Belt's Students | Grading.
//   the Candidates tab (candidates/CandidatesTab.jsx) or the Grading tab (grading/GradingTab.jsx)
//
// Grading's data and its save engine live HERE, not in the Grading tab (proposal 8): the grades
// are read with the page (gradingApi.loadGrading, every Dan, on the same 15-second refresh — paused
// while the browser says it's offline, proposal 6) and the ONE useStarGradingSaves keeps sending
// Not saved cells while the grader switches Dan or opens the Candidates tab. The leave guard
// (proposal 7, Color Belt's v0.192 / contract 0010 §4.9): while anything is Not saved, leaving the
// page (← Star testing, the rail, the bottom bar, the top-bar school switch, browser Back, Sign out
// — every step App.jsx sends through `guarded`) asks "3 grades and 1 count aren't saved" (Leave
// anyway / Stay on this page); reloading or closing the browser tab gets the browser's own "Leave
// site?". Switching tab or Dan never asks.
//
// States (G2, G3, G11 — Color Belt's live wording and behaviour):
//   loading       "← Star testing", gray bars where the name and summary will be, then the tab bar
//                 and 4 gray rows (G11); the buttons, cards and Dan switch come with the data
//   couldn't load "← Star testing" and the amber banner with Retry (the candidates are read with
//                 the event, so they share this state)
//   deleted       on the next reload that answers not_found: only "← Star testing" and the gray line
//                 "This testing event was deleted, or the link is wrong." Open dialogs close; the
//                 page doesn't move by itself; no toast. Also for an old bookmark or a mistyped id.
// When it reloads: on opening, every 15 seconds while the browser tab is visible and the screen
// unlocked (v0.507 Q3, Color Belt's v0.157 refresh, through useLiveLoad), when the tab becomes
// visible again, after unlocking, and after every change made here.
//
// Phase 5 also adds (Builder C):
//   * the PRIVATE GRADING PAGE (H5, proposals 18–21, Q1 = A): page state only — Candidates ⋯ →
//     "Grade private testing" shows grading/PrivateGradingPage.jsx in place of the tabs; the address
//     never changes (no candidate id in it), a reload comes back to the Candidates tab, and ← goes
//     back to Candidates without asking — so does the browser's / phone's Back (v0.513: one history
//     step with the same address while the page is open). Its row (gradingApi.loadPrivateGrading, refreshed every 15
//     seconds) joins the save engine's rows — and STAYS there after ← while it has a save on its way
//     or Not saved cells, so those keep retrying and the leave guard counts them. If the candidate
//     stops being private, is withdrawn or deleted while the page is open, it returns to Candidates
//     with a short banner (✕ only).
//   * PRINT GRADING SHEET (H3, proposals 13–17; Q2 = B): grading/StarGradingSheet.jsx, drawn into the
//     page, printed, removed again (as Color Belt's sheet and the Star flyer). The Grading tab prints
//     the selected Dan, both schools, never private students; the private page prints its one row.
//
// The event's details and the candidate count only in the header; the roster's privacy rules are
// in the Candidates tab (no date of birth or email in a list, v0.160; Hide private details, v0.506).
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconQrcode } from '@tabler/icons-react';
import Dialog from '../../../../components/Dialog.jsx';
import ErrorBanner from '../../../../components/ErrorBanner.jsx';
import { loadStarEvent } from '../../../../lib/star/eventsApi.js';
import { loadCandidates } from '../../../../lib/star/candidatesApi.js';
import { loadGrading, loadPrivateGrading, judgedSubjects } from '../../../../lib/star/gradingApi.js';
import { shortDate, whereText } from '../../../../lib/star/eventsText.js';
import { startTimeLabel } from '../../../../lib/star/starEventRules.js';
import * as G from '../../../../lib/star/gradingText.js';
import { usePrivateDetailsHidden } from '../../../../lib/privateDetails.js';
import { loadSchools } from '../../../../lib/settings/schoolsApi.js';
import { PHONE_QUERY, useMediaQuery } from '../../../../lib/useMediaQuery.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../events/useLiveLoad.js';
import CandidatesTab from '../candidates/CandidatesTab.jsx';
import { TAB_CANDIDATES, testingFor } from '../candidates/text.js';
import GradingTab from '../grading/GradingTab.jsx';
import { TAB_GRADING } from '../grading/text.js';
import * as GT from '../grading/text.js';
import PrivateGradingPage from '../grading/PrivateGradingPage.jsx';
import StarGradingSheet from '../grading/StarGradingSheet.jsx';
import { useStarGradingSaves } from '../grading/useStarGradingSaves.js';
import StarLinksDialog from './StarLinksDialog.jsx';
import * as T from '../events/text.js';

// The event and its candidates, read together (one "couldn't load" state, G11). Never throws.
async function loadEventPage(eventId) {
  const [e, c] = await Promise.all([loadStarEvent(eventId), loadCandidates(eventId)]);
  if (e.status !== 'ok') return e;
  if (c.status !== 'ok') return c.status === 'not_found' ? { status: 'error' } : c;
  return { status: 'ok', today: c.today ?? e.today, event: e.event, copy: e.copy, candidates: c.candidates };
}

// The private grading page's rows (Builder C): one loadPrivateGrading per candidate id in the key
// ("id1|id2"). A deleted candidate is listed in `gone` (not a failure of the whole read).
//   → { status:'ok', loadedAt (the OLDEST read's start), rows: { [id]: row }, gone: [id] }
async function loadPrivateRows(key) {
  const ids = key.split('|');
  const answers = await Promise.all(ids.map((id) => loadPrivateGrading(id)));
  if (answers.some((a) => a.status === 'no_access')) return { status: 'no_access' };
  if (answers.some((a) => a.status !== 'ok' && a.status !== 'not_found')) return { status: 'error' };
  const rows = {};
  const gone = [];
  let loadedAt = Infinity;
  answers.forEach((a, i) => {
    if (a.status === 'ok') {
      rows[ids[i]] = a.row;
      loadedAt = Math.min(loadedAt, a.loadedAt);
    } else gone.push(ids[i]);
  });
  return { status: 'ok', loadedAt: Number.isFinite(loadedAt) ? loadedAt : Date.now(), rows, gone };
}

// The two tabs: the address's 'students' is the Candidates tab (pageAddress.js).
const TABS = ['candidates', 'grading'];
const browserOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

export default function StarEventPage({
  eventId,
  eventTab = 'students',
  onEventTab,
  onLeaveGuardChange,
  onBack,
  isAdmin,
  location,
  onLocationChange,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
}) {
  const live = useLiveLoad({ key: eventId, enabled: !screenLocked, load: loadEventPage, refreshMs: LIVE_REFRESH_MS });
  const event = live.data?.event ?? null;
  const copy = live.data?.copy ?? null;
  const [hidden] = usePrivateDetailsHidden(); // Hide private details (v0.506)
  const [tabModal, setTabModal] = useState(false); // a Candidates or Grading dialog is open
  const baseId = useId();
  const liveRef = useRef(live);
  const tab = eventTab === 'grading' ? 'grading' : 'candidates';

  // ----- Grading's data (every Dan of the event copy) and its ONE save engine (proposal 8) -----
  // Read once the event (and so its copy) has loaded, then every 15 seconds like the event —
  // except while the browser says it's offline (proposal 6; the save engine refreshes first when
  // the connection is back).
  const [online, setOnline] = useState(browserOnline);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  const copyRef = useRef(copy);
  useLayoutEffect(() => {
    copyRef.current = copy;
  });
  const loadGradingNow = useCallback(async (id) => {
    const dans = copyRef.current?.dans?.map((d) => d.dan);
    if (!dans) return { status: 'error' };
    return loadGrading(id, dans);
  }, []);
  const gradingLive = useLiveLoad({ key: copy ? eventId : null, enabled: !screenLocked && online, load: loadGradingNow, refreshMs: LIVE_REFRESH_MS });
  const gradingLiveRef = useRef(gradingLive);
  useLayoutEffect(() => {
    liveRef.current = live;
    gradingLiveRef.current = gradingLive;
  });
  useEffect(() => {
    if (gradingLive.status === 'noAccess') onNoAccess();
  }, [gradingLive.status, onNoAccess]);
  // ----- The private grading page (H5, Q1 = A: page state only, never in the address) -----
  // privatePage: { id } while it shows. privateIds: the rows the save engine keeps — the open one,
  // plus any earlier one that still has a save on its way or Not saved cells (pruned on refresh).
  const [privatePage, setPrivatePage] = useState(null);
  const [privateIds, setPrivateIds] = useState([]);
  const [privateNotice, setPrivateNotice] = useState(null); // the banner back on Candidates (✕ only)
  const privateKey = privateIds.length > 0 ? privateIds.join('|') : null;
  const privateLive = useLiveLoad({ key: privateKey, enabled: !screenLocked && online, load: loadPrivateRows, refreshMs: LIVE_REFRESH_MS });
  const privateLiveRef = useRef(privateLive);
  useLayoutEffect(() => {
    privateLiveRef.current = privateLive;
  });
  useEffect(() => {
    if (privateLive.status === 'noAccess') onNoAccess();
  }, [privateLive.status, onNoAccess]);
  // The last good row of each private id, kept across key changes (opening a second private page
  // must never make the first one's row — and so its Not saved cells — vanish while it loads).
  const [privateState, setPrivateState] = useState({ rows: {}, loadedAt: null, gone: [] });
  useEffect(() => {
    const d = privateLive.data;
    if (!d) return;
    setPrivateState((prev) => {
      const rows = { ...prev.rows, ...d.rows };
      for (const id of d.gone) delete rows[id];
      return { rows, loadedAt: d.loadedAt, gone: d.gone };
    });
  }, [privateLive.data]);

  // Every grid row, in screen order (Dan, then belt order), both schools: the engine counts them all,
  // then the private rows it keeps (a candidate already back on the grid is counted once, as its
  // grid row).
  const gridRows = (copy?.dans ?? []).flatMap((d) => gradingLive.data?.dans?.[d.dan]?.rows ?? []);
  const gridIds = new Set(gridRows.map((r) => r.id));
  const privateRows = privateIds.map((id) => privateState.rows[id]).filter((r) => r && !gridIds.has(r.id));
  const gradingRows = [...gridRows, ...privateRows];
  // The data is as fresh as its OLDEST read: a saved cell is only replaced by data read after its
  // save answered (useStarGradingSaves), so with two reads the older one decides.
  const gridLoadedAt = gradingLive.data?.loadedAt ?? null;
  const gradingLoadedAt = privateRows.length > 0 && privateState.loadedAt !== null && gridLoadedAt !== null
    ? Math.min(gridLoadedAt, privateState.loadedAt)
    : gridLoadedAt ?? (privateRows.length > 0 ? privateState.loadedAt : null);
  const [pageBanner, setPageBanner] = useState(null); // never-retried answers (H2): ✕ only
  // After a save (or a refused one) the engine reloads: the grid AND the private rows.
  const reloadGrading = useCallback(() => {
    privateLiveRef.current.reload();
    return gradingLiveRef.current.reload();
  }, []);
  const saves = useStarGradingSaves({
    rows: gradingRows,
    loadedAt: gradingLoadedAt,
    reload: reloadGrading,
    onNoAccess,
    showPageBanner: setPageBanner,
    screenLocked,
  });
  const unsavedTotal = saves.unsaved.grades + saves.unsaved.counts;
  // A change on the Candidates tab (a Dan change, a withdrawal …) reloads the grades too.
  const reloadAll = useCallback(() => {
    gradingLiveRef.current.reload();
    privateLiveRef.current.reload();
    return liveRef.current.reload();
  }, []);

  // Does this private row still have a save on its way or a Not saved cell? (then the engine keeps it)
  const savesRef = useRef(saves);
  const privateStateRef = useRef(privateState);
  const privatePageRef = useRef(privatePage);
  useLayoutEffect(() => {
    savesRef.current = saves;
    privateStateRef.current = privateState;
    privatePageRef.current = privatePage;
  });
  const rowBusy = useCallback((row) => {
    const sv = savesRef.current;
    if (!row) return false;
    const u = sv.rowSave(row.id);
    if (u.grades + u.counts > 0) return true;
    const targets = [
      ...(row.result?.subjects ?? []).filter((x) => !x.fromClassCount).map((x) => ['grade', x.eventCategoryId]),
      ['count', 'classesAttended'],
      ['count', 'assistantClasses'],
    ];
    return targets.some(([kind, target]) => sv.cell(row, kind, target).state === 'saving');
  }, []);
  // Keep only the open private row and the busy ones (after ← and on every refresh).
  const prunePrivate = useCallback((openId) => {
    setPrivateIds((ids) => {
      const next = ids.filter((id) => id === openId || rowBusy(privateStateRef.current.rows[id]));
      return next.length === ids.length ? ids : next;
    });
  }, [rowBusy]);

  // The open private page's candidate changed on another device (stopped being private, withdrawn,
  // deleted): back to Candidates with a short banner. Its Not saved cells stay with the engine only
  // while the candidate is still in the testing (the engine refuses saves for the others anyway).
  // Every other refresh lets go of earlier private rows that have nothing left to save.
  const privateNameRef = useRef('');
  useEffect(() => {
    const open = privatePageRef.current;
    if (!open) {
      prunePrivate(null);
      return;
    }
    const row = privateState.rows[open.id];
    if (row) privateNameRef.current = `${row.firstName} ${row.lastName}`;
    let notice = null;
    if (privateState.gone.includes(open.id)) notice = GT.privateDeleted(privateNameRef.current);
    else if (row && row.status === 'withdrawn') notice = GT.privateWithdrawn(privateNameRef.current);
    else if (row && !row.privateOn) notice = GT.privateMovedBack(privateNameRef.current);
    if (!notice) {
      prunePrivate(open.id);
      return;
    }
    setPrivatePage(null);
    setPrivateNotice(notice);
    if (!row || row.status === 'withdrawn') setPrivateIds((ids) => ids.filter((id) => id !== open.id));
    else {
      gradingLiveRef.current.reload(); // it is back on the grid
      prunePrivate(null);
    }
    focusSoon(() => document.querySelector('.st-page .ttab.is-current'));
    // (runs on every refreshed answer; focusSoon is a plain function of this component)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privateState, prunePrivate]);

  function focusSoon(getTarget) {
    let tries = 0;
    const tryFocus = () => {
      const target = getTarget();
      if ((!target || target.closest('[inert]')) && tries++ < 30) window.requestAnimationFrame(tryFocus);
      else target?.focus();
    };
    window.requestAnimationFrame(tryFocus);
  }
  function openPrivatePage(row) {
    clearToast();
    setPrivateNotice(null);
    setPageBanner(null);
    setPrivateIds((ids) => (ids.includes(row.id) ? ids : [...ids, row.id]));
    setPrivatePage({ id: row.id });
    window.scrollTo(0, 0);
  }
  function closePrivatePage() {
    const id = privatePage?.id;
    setPrivatePage(null);
    setPageBanner(null);
    prunePrivate(null);
    // Back to the candidate's ⋯ button on the Candidates tab (or its row).
    focusSoon(() => document.querySelector(`[data-star-cand-more="${id}"]`) ?? document.querySelector(`[data-nav-row="${id}"]`));
  }

  // ----- Browser / phone Back on the private grading page (Jeffrey, rulebook v0.513: B) -----
  // The private page has no address of its own (Q1 = A), so on its own the browser's Back would
  // leave the whole event. Instead, while the page is open it adds ONE history step with the SAME
  // address (no candidate id anywhere), marked { tkdStarPrivate: token }. Back uses up that step:
  // App.jsx sees the same page and does nothing, and the listener below closes the private page —
  // the same as its own ← (never asked; the Not saved cells stay in the save engine).
  // Not the dialogs' { tkdDialog } marker: a dialog opened on top would reuse that step and take it
  // away again when it closes (Dialog.jsx).
  const privateOpenId = privatePage?.id ?? null;
  const closePrivateRef = useRef(closePrivatePage);
  const lockedRef = useRef(screenLocked);
  const privateStepRef = useRef(null); // the token of the step in use while the page is open
  useLayoutEffect(() => {
    closePrivateRef.current = closePrivatePage;
    lockedRef.current = screenLocked;
  });
  useEffect(() => {
    if (!privateOpenId) return undefined;
    const token = `star-private-${Date.now()}-${Math.random()}`;
    const marker = { tkdPage: true, tkdStarPrivate: token };
    privateStepRef.current = token;
    window.history.pushState(marker, '');
    function handleBack() {
      if (window.history.state?.tkdStarPrivate === token) return; // e.g. Back closed a dialog on top
      if (lockedRef.current) {
        window.history.pushState(marker, ''); // nothing changes behind the lock screen
        return;
      }
      closePrivateRef.current();
    }
    window.addEventListener('popstate', handleBack);
    return () => {
      privateStepRef.current = null;
      window.removeEventListener('popstate', handleBack);
      // Closed some other way (←, or it closed itself): take our step off again, a moment later
      // and only if it is still on top, so the next Back doesn't land on an empty step.
      window.setTimeout(() => {
        if (window.history.state?.tkdStarPrivate === token) window.history.back();
      }, 0);
    };
  }, [privateOpenId]);
  // A reload (or Forward) can land on a private step whose page is closed: step off it to the
  // plain step under it (the same address, so nothing changes on screen), so the next Back
  // isn't spent on it. (Leaving the event page replaces the step instead — App.jsx's navigate.)
  useEffect(() => {
    if (window.history.state?.tkdStarPrivate) window.history.back();
    function handleForward() {
      const step = window.history.state?.tkdStarPrivate;
      if (step && step !== privateStepRef.current) window.history.back();
    }
    window.addEventListener('popstate', handleForward);
    return () => window.removeEventListener('popstate', handleForward);
  }, []);

  // ----- Print grading sheet (H3; Q2 = B): draw the sheet, print, remove it again -----
  const [printing, setPrinting] = useState(null); // { sheet: StarGradingSheet's props, opener } while it prints
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => {
      setPrinting(null);
      focusSoon(() => (printing.opener?.isConnected ? printing.opener : document.querySelector('.stg-print')));
    };
    window.addEventListener('afterprint', done);
    // Wait one frame so the sheet is on the page before the print window opens.
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
    // (Only a new print matters here; focusSoon is a plain function of this component.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printing]);

  // ----- The leave guard (proposal 7; contract 0010 §4.9) -----
  // App.jsx calls this before it leaves the page. false = nothing unsaved, go ahead. true = the
  // question is open; it calls proceed() itself on "Leave anyway".
  const [leave, setLeave] = useState(null); // { key, proceed, title, body, opener }
  const leaveRef = useRef(leave);
  useLayoutEffect(() => {
    leaveRef.current = leave;
  });
  const guardRef = useRef(null);
  useLayoutEffect(() => {
    guardRef.current = (proceed) => {
      const u = saves.unsaved;
      if (u.grades + u.counts === 0) return false;
      if (leaveRef.current) return true; // already asking
      const opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      const next = { key: Date.now(), proceed, title: G.leaveTitle(u.grades, u.counts), body: G.leaveBody(u.people), opener };
      leaveRef.current = next;
      setLeave(next);
      return true;
    };
  });
  const leaveGuard = useCallback((proceed) => guardRef.current?.(proceed) ?? false, []);
  useEffect(() => {
    if (!onLeaveGuardChange) return undefined;
    onLeaveGuardChange(leaveGuard);
    return () => onLeaveGuardChange(null);
  }, [onLeaveGuardChange, leaveGuard]);
  // Reloading or closing the browser tab: the browser's own "Leave site?" (its words can't change).
  const hasUnsaved = unsavedTotal > 0;
  useEffect(() => {
    if (!hasUnsaved) return undefined;
    function handleBeforeUnload(unloadEvent) {
      unloadEvent.preventDefault();
      unloadEvent.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsaved]);
  function focusBack(opener) {
    let tries = 0;
    const tryFocus = () => {
      if (!opener?.isConnected) return;
      if (opener.closest('[inert]') && tries++ < 30) window.requestAnimationFrame(tryFocus);
      else opener.focus();
    };
    window.requestAnimationFrame(tryFocus);
  }
  function stayOnPage() {
    const opener = leaveRef.current?.opener;
    leaveRef.current = null;
    setLeave(null);
    focusBack(opener);
  }
  function leaveAnyway() {
    const d = leaveRef.current;
    if (!d) return;
    leaveRef.current = null;
    setLeave(null);
    // The dialog added a step to the browser's history (Dialog.jsx) and removes it as it closes.
    // Wait for that, so the next page's step lands in the right place, then leave (as Color Belt).
    window.setTimeout(() => {
      if (!window.history.state?.tkdDialog) {
        d.proceed();
        return;
      }
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        window.removeEventListener('popstate', go);
        d.proceed();
      };
      window.addEventListener('popstate', go);
      window.setTimeout(go, 400); // in case the step was already gone
    }, 0);
  }

  // ----- Tabs: Candidates | Grading (never guarded, proposal 8) -----
  const [addMenu, setAddMenu] = useState(false); // Grading's "Add candidate": open Candidates' add menu
  function switchTab(next) {
    if (next === tab) return;
    onEventTab?.(next === 'grading' ? 'grading' : 'students');
  }
  function handleTabKeyDown(keyEvent) {
    const index = TABS.indexOf(tab);
    let next = null;
    if (keyEvent.key === 'ArrowRight') next = TABS[(index + 1) % TABS.length];
    else if (keyEvent.key === 'ArrowLeft') next = TABS[(index - 1 + TABS.length) % TABS.length];
    else if (keyEvent.key === 'Home') next = TABS[0];
    else if (keyEvent.key === 'End') next = TABS[TABS.length - 1];
    if (!next) return;
    keyEvent.preventDefault();
    switchTab(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  const isPhone = useMediaQuery(PHONE_QUERY);
  const [dialog, setDialog] = useState(null); // { key, opener, copyFailed } while Registration links is open
  const [schools, setSchools] = useState(null); // Settings → Schools, for the flyer's address

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  // The event was deleted elsewhere (G3): close the dialog, or it would stay "open" without being
  // drawn and keep the rest of the dashboard blocked.
  // Keyboard focus then goes to "← Star testing", the one thing left on the page.
  const dialogOpenRef = useRef(false);
  useLayoutEffect(() => {
    dialogOpenRef.current = dialog !== null;
  });
  useEffect(() => {
    if (live.status !== 'notFound' || !dialogOpenRef.current) return;
    setDialog(null);
    focusBackLinkSoon();
    // (focusBackLinkSoon only reads the page; it needs no dependency.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.status]);

  const modalShown = (dialog !== null || tabModal || leave !== null) && !screenLocked && event !== null;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  // Focus "← Star testing" once the page is no longer inert (the App lifts "inert" a moment after
  // a dialog closes, so try again on the next frames).
  function focusBackLinkSoon() {
    let tries = 0;
    const tryFocus = () => {
      const link = document.querySelector('.st-page .st-back');
      if (!link || link.closest('[inert]')) {
        if (tries++ < 30) window.requestAnimationFrame(tryFocus);
        return;
      }
      link.focus();
    };
    window.requestAnimationFrame(tryFocus);
  }

  async function openLinks(opener) {
    clearToast();
    setDialog({ key: Date.now(), opener, copyFailed: false });
    if (schools === null) {
      const result = await loadSchools();
      if (result.status === 'ok') setSchools(result.schools);
      else if (result.status === 'no_access') onNoAccess();
      // Offline: the flyer shows just the school name in "Location:" (nothing else changes).
    }
  }
  function closeLinks() {
    const opener = dialog?.opener;
    setDialog(null);
    // Back to the button that opened it, once the page is no longer inert (the App lifts "inert"
    // a moment after the dialog closes, so try again on the next frames, as Color Belt does).
    let tries = 0;
    const tryFocus = () => {
      if (!opener?.isConnected) return;
      if (opener.closest('[inert]') && tries++ < 30) window.requestAnimationFrame(tryFocus);
      else opener.focus();
    };
    window.requestAnimationFrame(tryFocus);
  }
  async function copyLink(link) {
    try {
      if (!link || !navigator.clipboard) throw new Error('No clipboard');
      await navigator.clipboard.writeText(link);
      setDialog((current) => (current ? { ...current, copyFailed: false } : current));
      showToast(T.TOAST_LINK_COPIED, { icon: false });
    } catch {
      setDialog((current) => (current ? { ...current, copyFailed: true } : current));
    }
  }

  // Print grading sheet (H3, proposals 13–17). The Grading tab calls it with { dan, danLabel, opener }:
  // the selected Dan, BOTH schools always (the unfiltered rows, also on a one-school device), belt
  // order, private candidates left out (loadGrading never returns them); the button hides on an
  // empty Dan (proposal 27). The private page calls it with { privateRow, opener } (Q2 = B): that
  // one row, no "Added on the day" lines.
  function printSheet({ dan, danLabel, privateRow = null, opener = null }) {
    if (!event || !copy) return;
    const printedAt = new Date();
    if (privateRow) {
      const name = `${privateRow.firstName} ${privateRow.lastName}`;
      setPrinting({
        opener,
        sheet: {
          // H4 option B: "Fall 2026 Star Testing · Private testing · Alex Kim" /
          // "Tue, Dec 1, 2026 · 4:00 PM · Shrewsbury school · 1st Dan · 1 star → 2 stars"
          // (a private testing happens at the candidate's own school)
          title: GT.privateSheetTitle(event.name, name),
          whenLine: GT.privateSheetWhenLine(
            shortDate(privateRow.privateOn),
            startTimeLabel(privateRow.privateTime),
            whereText(privateRow.locationCode),
            privateRow.danLabel,
            testingFor(privateRow),
          ),
          footWhat: GT.privateSheetFootWhat(event.name),
          subjects: judgedSubjects(copy, privateRow.dan),
          rows: [privateRow],
          addedRows: 0,
          printedAt,
        },
      });
      return;
    }
    setPrinting({
      opener,
      sheet: {
        title: GT.sheetTitle(event.name, danLabel),
        whenLine: GT.sheetWhenLine(shortDate(event.testingDate), startTimeLabel(event.startTime), whereText(event.whereCode)),
        footWhat: `${event.name} · ${danLabel}`,
        subjects: judgedSubjects(copy, dan),
        rows: gradingLive.data?.dans?.[dan]?.rows ?? [],
        addedRows: 2,
        printedAt,
      },
    });
  }

  const backLink = (
    <button type="button" className="link-button st-back" aria-label={T.BACK_TO_STAR_LABEL} onClick={() => onBack(eventId)}>
      {/* ti-arrow-left = back */}
      <IconArrowLeft size={16} aria-hidden="true" />
      {T.BACK_TO_STAR}
    </button>
  );

  // G2: loading — gray bars for the name and the summary line (three on phones, where it wraps)
  if (live.status === 'loading' || live.status === 'idle' || live.status === 'noAccess') {
    return (
      <div className="testing st-page">
        <div className="phead st-event-head">
          <div className="phead-titles">
            {backLink}
            <div className="st-head-skeleton" aria-busy="true">
              <span className="visually-hidden">{T.LOADING_EVENT}</span>
              <span className="st-skel-bar st-skel-title" aria-hidden="true" />
              <span className="st-skel-bar st-skel-line" aria-hidden="true" />
              {isPhone && <span className="st-skel-bar st-skel-line st-skel-short" aria-hidden="true" />}
            </div>
          </div>
        </div>
        {/* G11: the tab bar and 4 gray rows under it */}
        <div className="ttabs" aria-hidden="true">
          <span className={`ttab${tab === 'candidates' ? ' is-current' : ''}`}>{TAB_CANDIDATES}</span>
          <span className={`ttab${tab === 'grading' ? ' is-current' : ''}`}>{TAB_GRADING}</span>
        </div>
        <div className="clist tskeleton" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="tskeleton-row">
              <span className="tskeleton-bar" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  // G3: deleted (or a wrong link)
  if (live.status === 'notFound') {
    return (
      <div className="testing st-page">
        <div className="phead st-event-head">
          <div className="phead-titles">{backLink}</div>
        </div>
        <p className="tempty st-gone">{T.EVENT_GONE}</p>
      </div>
    );
  }
  // G2: couldn't load
  if (live.status === 'error' || !event) {
    return (
      <div className="testing st-page">
        <div className="phead st-event-head">
          <div className="phead-titles">{backLink}</div>
        </div>
        <ErrorBanner text={T.LOAD_EVENT_FAILED} onRetry={() => liveRef.current.reload()} />
      </div>
    );
  }

  const tabId = `${baseId}-tab-${tab}`;
  const panelId = `${baseId}-panel-${tab}`;
  // The header (with the tab's Add candidate button) and the tab bar — drawn by the tab, which knows
  // its button (the same pattern as StarTesting's renderHeader).
  const renderHeader = (addButton) => (
    <>
      <div className="phead st-event-head">
        <div className="phead-titles">
          {backLink}
          <h1 className="ptitle">{event.name}</h1>
          <p className="st-summary">{T.eventSummary(event)}</p>
        </div>
        <div className="st-event-buttons">
          {addButton}
          <button type="button" className="btn" data-star-reg-link onClick={(clickEvent) => openLinks(clickEvent.currentTarget)}>
            {/* ti-qrcode = registration link / QR code */}
            <IconQrcode size={16} aria-hidden="true" />
            {T.REGISTRATION_LINK}
          </button>
        </div>
      </div>
      {/* Candidates | Grading (Results joins in phase 6, P7). ← → Home End move and switch. */}
      <div className="ttabs" role="tablist" aria-label={event.name} onKeyDown={handleTabKeyDown}>
        {TABS.map((key) => {
          const current = key === tab;
          return (
            <button
              key={key}
              id={`${baseId}-tab-${key}`}
              type="button"
              className={`ttab${current ? ' is-current' : ''}`}
              role="tab"
              aria-selected={current ? 'true' : 'false'}
              aria-controls={current ? panelId : undefined}
              tabIndex={current ? 0 : -1}
              onClick={() => switchTab(key)}
            >
              {key === 'grading' ? TAB_GRADING : TAB_CANDIDATES}
            </button>
          );
        })}
      </div>
      {/* Back from a private grading page that had to close (not drawn; ✕ only) */}
      {tab === 'candidates' && privateNotice && <ErrorBanner text={privateNotice} onDismiss={() => setPrivateNotice(null)} />}
    </>
  );

  const privateRow = privatePage ? privateState.rows[privatePage.id] ?? null : null;

  return (
    <div className="testing st-page">
      {privatePage ? (
        <PrivateGradingPage
          key={privatePage.id}
          event={event}
          copy={copy}
          row={privateRow}
          loadFailed={!privateRow && privateLive.status === 'error'}
          saves={saves}
          isAdmin={isAdmin}
          onBack={closePrivatePage}
          onPrint={(opener) => privateRow && printSheet({ privateRow, opener })}
          onRetryLoad={() => privateLiveRef.current.reload()}
          onGradingChanged={reloadGrading}
          pageBanner={pageBanner}
          onDismissPageBanner={() => setPageBanner(null)}
          screenLocked={screenLocked}
          onNoAccess={onNoAccess}
          onModalOpenChange={setTabModal}
        />
      ) : tab === 'grading' ? (
        <GradingTab
          event={event}
          copy={copy}
          grading={{ status: gradingLive.status, data: gradingLive.data }}
          saves={saves}
          isAdmin={isAdmin}
          location={location}
          onLocationChange={onLocationChange}
          panelId={panelId}
          tabId={tabId}
          renderHeader={renderHeader}
          onAddCandidate={() => {
            setAddMenu(true);
            switchTab('candidates');
          }}
          onPrint={printSheet}
          pageBanner={pageBanner}
          onDismissPageBanner={() => setPageBanner(null)}
          onRetryLoad={reloadGrading}
          onGradingChanged={reloadGrading}
          screenLocked={screenLocked}
          onNoAccess={onNoAccess}
          onModalOpenChange={setTabModal}
        />
      ) : (
        <CandidatesTab
          event={event}
          copy={copy}
          candidates={live.data.candidates}
          today={live.data.today}
          reload={reloadAll}
          isAdmin={isAdmin}
          hidden={hidden}
          location={location}
          onLocationChange={onLocationChange}
          panelId={panelId}
          tabId={tabId}
          renderHeader={renderHeader}
          openAddMenu={addMenu}
          onAddMenuOpened={() => setAddMenu(false)}
          onGradePrivate={(row) => openPrivatePage(row)}
          screenLocked={screenLocked}
          onNoAccess={onNoAccess}
          onRefreshProfile={onRefreshProfile}
          showToast={showToast}
          clearToast={clearToast}
          onModalOpenChange={setTabModal}
        />
      )}
      {/* "Saved" / "Not saved" for screen readers (proposal 1), on either tab */}
      <div className="visually-hidden" aria-live="polite">
        {saves.announcement}
      </div>
      {leave && !screenLocked && (
        // v0.192's box (proposal 7): nothing is deleted, so no red — "Stay on this page" is the blue
        // default (Enter, Esc, backdrop, Back).
        <Dialog key={leave.key} title={leave.title} variant="confirm" describedBy={`${baseId}-leave-body`} onRequestClose={stayOnPage}>
          <p id={`${baseId}-leave-body`} className="tdialog-sub tdialog-body">
            {leave.body}
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={leaveAnyway}>
              {G.LEAVE_ANYWAY}
            </button>
            <button type="button" className="btn btn-primary" data-autofocus onClick={stayOnPage}>
              {G.STAY_ON_PAGE}
            </button>
          </div>
        </Dialog>
      )}
      {printing && <StarGradingSheet {...printing.sheet} grades={copy?.grades ?? []} />}
      {dialog && !screenLocked && (
        <StarLinksDialog
          key={dialog.key}
          event={event}
          schools={schools}
          isPhone={isPhone}
          copyFailed={dialog.copyFailed}
          onCopy={copyLink}
          onClose={closeLinks}
        />
      )}
    </div>
  );
}
