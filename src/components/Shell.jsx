// Shell.jsx — the frame around every signed-in page: rail + top bar + content + bottom bar.
// Why it exists: each section (only Home today) is drawn INSIDE this frame, so navigation
// and the top bar are built once and look the same everywhere.
//
// `hidden` is true while the lock screen is showing. The shell stays in memory (so you land
// back exactly where you were after unlocking) but is removed from view and from the Tab order.
// `inert` is true while a dialog (account, Testing or Staff accounts) is open: the page stays
// visible behind the dimmed backdrop, but can't be clicked or reached with Tab.
// `panel` is the person's Panel size (v1.118, lib/panelSize.js): the rail's size, the account
// menu's "Panel size" row, and — when saving it failed — the shared amber bar under the top bar.
// The bar sits on the frame, not on a page, so it stays when the person changes page (§3.5). It
// lines up with the page's own edges, also when the page has a scrollbar of its own.
import { useEffect, useRef, useState } from 'react';
import Rail from './Rail.jsx';
import TopBar from './TopBar.jsx';
import BottomBar from './BottomBar.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import { PANEL_SIZE_NOT_SAVED } from '../lib/panelSize.js';

export default function Shell({
  hidden,
  inert,
  currentSection,
  currentTestingPage = null, // the open Testing page ('chooser' | 'colorBelt' | 'star'), for the rail's menu
  onNavigate,
  location,
  onLocationChange,
  profile,
  deviceLocation,
  onDeviceLocationChange,
  onLockNow,
  onChangePin,
  onSetPin,
  onChangePassword,
  onStaffAccounts,
  onSettings,
  onSignOut,
  badges,
  panel,
  children,
}) {
  // While the amber bar shows: the width of the page's own scrollbar (0 when it has none, or when
  // the device's scrollbars float over the page), so the bar ends where the page does.
  const contentRef = useRef(null);
  const [pageScrollbar, setPageScrollbar] = useState(0);
  useEffect(() => {
    if (!panel.saveFailed) return undefined;
    const content = contentRef.current;
    const measure = () => setPageScrollbar(content.offsetWidth - content.clientWidth);
    measure();
    const observer = new ResizeObserver(measure); // a scrollbar appearing narrows the page
    observer.observe(content);
    return () => observer.disconnect();
  }, [panel.saveFailed]);

  return (
    <div className="shell" hidden={hidden} inert={inert}>
      <Rail
        current={currentSection}
        currentPage={currentTestingPage}
        onNavigate={onNavigate}
        badges={badges}
        size={panel.size}
        shown={!hidden}
      />
      <div className="shell-main">
        <TopBar
          location={location}
          onLocationChange={onLocationChange}
          profile={profile}
          deviceLocation={deviceLocation}
          onDeviceLocationChange={onDeviceLocationChange}
          onLockNow={onLockNow}
          onChangePin={onChangePin}
          onSetPin={onSetPin}
          onChangePassword={onChangePassword}
          onStaffAccounts={onStaffAccounts}
          onSettings={onSettings}
          onSignOut={onSignOut}
          isScreenLocked={hidden}
          panelSize={panel.size}
          onPanelSizeChange={panel.choose}
        />
        {panel.saveFailed && (
          <div className="shell-errbar" style={{ '--page-scrollbar': `${pageScrollbar}px` }}>
            <ErrorBanner
              text={PANEL_SIZE_NOT_SAVED}
              onRetry={panel.retry}
              onDismiss={panel.dismiss}
              retrying={panel.retrying}
            />
          </div>
        )}
        <main ref={contentRef} className="shell-content">
          {children}
        </main>
        <BottomBar current={currentSection} onNavigate={onNavigate} badges={badges} />
      </div>
    </div>
  );
}
