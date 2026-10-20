// StarEventPage.jsx — one Star testing event's page (address #testing/star/event/<id>).
// Why it exists: Events mockup screen 11 (v0.90, v0.92), gap mockups G2–G3 (v0.500), and from build
// phase 3 the Candidates tab (Candidates mockups v0.121, gap mockups G1–G16, v0.508):
//   ← Star testing
//   Fall 2026 Star Testing                [+ Add candidate] [Registration link]
//   Sat, Nov 14, 2026 · 10:00 AM at Shrewsbury school · both schools · 23 candidates
//   (14px in the normal text color, v0.92; on phones the buttons sit under this line)
//   [Candidates]                          the tab bar — ONLY Candidates until Grading (phase 5) and
//                                         Results (phase 6) are built: no placeholder tabs (rule P7,
//                                         v0.50, v0.177 — the same as Star's phase 1 home had only
//                                         Rubrics and prices)
//   the Candidates tab (candidates/CandidatesTab.jsx)
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
// The event's details and the candidate count only in the header; the roster's privacy rules are
// in the Candidates tab (no date of birth or email in a list, v0.160; Hide private details, v0.506).
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconQrcode } from '@tabler/icons-react';
import ErrorBanner from '../../../../components/ErrorBanner.jsx';
import { loadStarEvent } from '../../../../lib/star/eventsApi.js';
import { loadCandidates } from '../../../../lib/star/candidatesApi.js';
import { usePrivateDetailsHidden } from '../../../../lib/privateDetails.js';
import { loadSchools } from '../../../../lib/settings/schoolsApi.js';
import { PHONE_QUERY, useMediaQuery } from '../../../../lib/useMediaQuery.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../events/useLiveLoad.js';
import CandidatesTab from '../candidates/CandidatesTab.jsx';
import { TAB_CANDIDATES } from '../candidates/text.js';
import StarLinksDialog from './StarLinksDialog.jsx';
import * as T from '../events/text.js';

// The event and its candidates, read together (one "couldn't load" state, G11). Never throws.
async function loadEventPage(eventId) {
  const [e, c] = await Promise.all([loadStarEvent(eventId), loadCandidates(eventId)]);
  if (e.status !== 'ok') return e;
  if (c.status !== 'ok') return c.status === 'not_found' ? { status: 'error' } : c;
  return { status: 'ok', today: c.today ?? e.today, event: e.event, copy: e.copy, candidates: c.candidates };
}

export default function StarEventPage({
  eventId,
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
  const [hidden] = usePrivateDetailsHidden(); // Hide private details (v0.506)
  const [tabModal, setTabModal] = useState(false); // a Candidates dialog is open
  const baseId = useId();
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });

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

  const modalShown = (dialog !== null || tabModal) && !screenLocked && event !== null;
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
          <span className="ttab is-current">{TAB_CANDIDATES}</span>
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

  const tabId = `${baseId}-tab-candidates`;
  const panelId = `${baseId}-panel-candidates`;
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
      {/* One tab until Grading and Results are built (P7). A tab list with one tab still tells
          screen readers what the area is. */}
      <div className="ttabs" role="tablist" aria-label={event.name}>
        <button id={tabId} type="button" className="ttab is-current" role="tab" aria-selected="true" aria-controls={panelId} tabIndex={0}>
          {TAB_CANDIDATES}
        </button>
      </div>
    </>
  );

  return (
    <div className="testing st-page">
      <CandidatesTab
        event={event}
        copy={live.data.copy}
        candidates={live.data.candidates}
        today={live.data.today}
        reload={() => liveRef.current.reload()}
        isAdmin={isAdmin}
        hidden={hidden}
        location={location}
        onLocationChange={onLocationChange}
        panelId={panelId}
        tabId={tabId}
        renderHeader={renderHeader}
        screenLocked={screenLocked}
        onNoAccess={onNoAccess}
        onRefreshProfile={onRefreshProfile}
        showToast={showToast}
        clearToast={clearToast}
        onModalOpenChange={setTabModal}
      />
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
