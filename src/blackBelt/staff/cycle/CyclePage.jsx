// CyclePage.jsx — one Black Belt testing cycle's page.
// Why it exists: approved mockup Cycles 8 (contract CONTRACT-0016-B1 §3, OP-7). It shows:
//   - "← Black Belt testing", the cycle name as the page title, and the summary line
//     "First day Sat, Apr 3, 2027 · 3 testing days · both schools · 9 candidates"
//     (14px, normal text color; it wraps under the title on phones)
//   - a ⋯ menu opposite the title: Edit cycle (admins) · Registration links · Close / Open
//     registration (staff: Open grayed after the application date, with the reason)
//   - the tabs. In B1 only Candidates exists, with a preview-only line until B2 builds the list;
//     Grading and Results appear when they are built (P7: no placeholders).
// A cycle that no longer exists (deleted elsewhere) → "This cycle was deleted." and back to the
// Cycles tab.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconDots, IconEdit, IconLock, IconLockOpen, IconQrcode } from '@tabler/icons-react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import IconButton from '../../../components/IconButton.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { isPreview } from '../../../lib/supabase.js';
import { loadCycle, schoolToday } from '../../../lib/blackBelt/api.js';
import { PHONE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../screens/testing/events/useLiveLoad.js';
import { useCycleActions } from '../cycles/useCycleActions.js';
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

export default function CyclePage({ cycleId, isAdmin, onBack, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange }) {
  const live = useLiveLoad({ key: cycleId, enabled: !screenLocked, load, refreshMs: LIVE_REFRESH_MS });
  const cycle = live.data?.cycle ?? null;
  const today = schoolToday();
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });
  const isPhone = useMediaQuery(PHONE_QUERY);

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

  // Deleted (here or elsewhere): say so and go back to the Cycles tab.
  useEffect(() => {
    if (live.status !== 'notFound') return;
    showToast(T.CYCLE_DELETED, { icon: false });
    onBack();
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

  const modalShown = (editor.isOpen || links !== null) && !screenLocked;
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

  function menuItems() {
    const items = [];
    if (isAdmin) items.push({ key: 'edit', label: T.EDIT_CYCLE, Icon: IconEdit, disabled: busy, onSelect: () => editor.openEdit(cycle.id, moreRef.current) });
    items.push({ key: 'links', label: T.REGISTRATION_LINKS, Icon: IconQrcode, onSelect: () => setLinks({ opener: moreRef.current }) });
    if (!isPast) {
      if (state.registration === 'open') {
        items.push({ key: 'close', label: T.CLOSE_REGISTRATION, Icon: IconLock, disabled: busy, onSelect: () => actions.switchRegistration(cycle, false) });
      } else {
        const allowed = actions.canOpen(cycle);
        items.push({
          key: 'open',
          label: allowed ? T.OPEN_REGISTRATION : <TwoLines label={T.OPEN_REGISTRATION} reason={T.REOPEN_NEEDS_ADMIN} />,
          Icon: IconLockOpen,
          disabled: busy || !allowed,
          onSelect: () => actions.switchRegistration(cycle, true),
        });
      }
    }
    return items;
  }

  const firstDay = state.firstDay ?? cycle.days?.[0]?.date ?? null;

  return (
    <>
      {backLink}
      <div className="phead ev-phead bb-cycle-head">
        <div className="phead-titles">
          <h1 className="ptitle">{cycle.name}</h1>
          <p className="ev-summary bb-summary">{T.cycleSummary(firstDay, cycle.days?.length ?? 0, cycle.candidateCount ?? 0)}</p>
        </div>
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
      <div className="ttabs ev-tabs" role="tablist" aria-label={cycle.name}>
        <button type="button" id={`bb-cycle-tab-${cycle.id}`} className="ttab is-current" role="tab" aria-selected="true" aria-controls={`bb-cycle-panel-${cycle.id}`} tabIndex={0}>
          {T.TAB_CANDIDATES}
        </button>
      </div>
      {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy} onDismiss={() => setBanner(null)} />}
      <div id={`bb-cycle-panel-${cycle.id}`} role="tabpanel" aria-labelledby={`bb-cycle-tab-${cycle.id}`} className="tpanel">
        {/* OP-7: the Candidates list is built in B2. This line shows in preview only. */}
        {isPreview && <p className="tempty ev-empty">{T.candidatesComingLine(cycle.candidateCount ?? 0)}</p>}
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
