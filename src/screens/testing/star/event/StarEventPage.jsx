// StarEventPage.jsx — one Star testing event's page (address #testing/star/event/<id>).
// Why it exists: Events mockup screen 11 (v0.90, v0.92) and gap mockups G2–G3 (v0.500). In build
// phase 2 the page is ONLY its header:
//   ← Star testing                                   (back to the Events list; ti-arrow-left)
//   Fall 2026 Star Testing                           [Registration link]   (outline, ti-qrcode)
//   Sat, Nov 14, 2026 · 10:00 AM at Shrewsbury school · both schools · 23 candidates
//   (14px in the normal text color, v0.92; on phones the button sits under this line)
// There is no Candidates tab and no placeholder until phase 3 (rule P7, v0.50, v0.177).
//
// States (G2, G3 — Color Belt's live wording and behaviour):
//   loading       "← Star testing", then gray bars where the name and summary will be
//   couldn't load "← Star testing" and the amber banner with Retry
//   deleted       on the next reload that answers not_found: only "← Star testing" and the gray line
//                 "This testing event was deleted, or the link is wrong." Open dialogs close; the
//                 page doesn't move by itself; no toast. Also for an old bookmark or a mistyped id.
// When it reloads: on opening, when the browser tab becomes visible again and after unlocking
// (useLiveLoad). The 15-second refresh (v0.157) is proposed for phase 3, so it is NOT used here.
//
// Nothing personal is shown: the event's details and the candidate count only.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconQrcode } from '@tabler/icons-react';
import ErrorBanner from '../../../../components/ErrorBanner.jsx';
import { loadStarEvent } from '../../../../lib/star/eventsApi.js';
import { loadSchools } from '../../../../lib/settings/schoolsApi.js';
import { PHONE_QUERY, useMediaQuery } from '../../../../lib/useMediaQuery.js';
import { useLiveLoad } from '../../events/useLiveLoad.js';
import StarLinksDialog from './StarLinksDialog.jsx';
import * as T from '../events/text.js';

export default function StarEventPage({ eventId, onBack, screenLocked, onNoAccess, showToast, clearToast, onModalOpenChange }) {
  const live = useLiveLoad({ key: eventId, enabled: !screenLocked, load: loadStarEvent });
  const event = live.data?.event ?? null;
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

  const modalShown = dialog !== null && !screenLocked && event !== null;
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

  return (
    <div className="testing st-page">
      <div className="phead st-event-head">
        <div className="phead-titles">
          {backLink}
          <h1 className="ptitle">{event.name}</h1>
          <p className="st-summary">{T.eventSummary(event)}</p>
        </div>
        <div className="st-event-buttons">
          <button type="button" className="btn" data-star-reg-link onClick={(clickEvent) => openLinks(clickEvent.currentTarget)}>
            {/* ti-qrcode = registration link / QR code */}
            <IconQrcode size={16} aria-hidden="true" />
            {T.REGISTRATION_LINK}
          </button>
        </div>
      </div>
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
