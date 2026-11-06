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
// The one offline bar (v1.123, design review M12, OfflineBar.jsx) uses the same place, first: it
// shows while the device is offline or a screen's reloads keep failing (lib/connection.js).
// Both bars sit on the frame, not on a page, so they stay when the person changes page (§3.5), and
// outside the page's scrolling part, so they never cover what the keyboard is on (v1.033). They
// line up with the page's own edges, also when the page has a scrollbar of its own. When one comes
// or goes, the page stays still under the person's finger (v1.124).
import { useLayoutEffect, useRef, useState } from 'react';
import Rail from './Rail.jsx';
import TopBar from './TopBar.jsx';
import BottomBar from './BottomBar.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import OfflineBar from './OfflineBar.jsx';
import { PANEL_SIZE_NOT_SAVED } from '../lib/panelSize.js';
import { useConnectionTrouble } from '../lib/connection.js';

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
  // The one offline bar: true while the browser says offline or any screen's reloads keep failing.
  const offline = useConnectionTrouble();
  const barShown = offline || panel.saveFailed;

  // While an amber bar shows: the width of the page's own scrollbar (0 when it has none, or when
  // the device's scrollbars float over the page), so the bars end where the page does. Measured
  // before the screen is painted (useLayoutEffect), so a new bar never shows one frame too wide.
  const contentRef = useRef(null);
  const [pageScrollbar, setPageScrollbar] = useState(0);
  useLayoutEffect(() => {
    if (!barShown) return undefined;
    const content = contentRef.current;
    const measure = () => setPageScrollbar(content.offsetWidth - content.clientWidth);
    measure();
    const observer = new ResizeObserver(measure); // a scrollbar appearing narrows the page
    observer.observe(content);
    return () => observer.disconnect();
  }, [barShown]);

  // The page stays still when a bar comes or goes (v1.124). The bars take room above the page, so
  // when one comes or goes, the page's box moves down or up in the layout. Its own scroll then moves
  // by the same height, so whatever is under the person's finger stays put. It counts from where the
  // page is scrolled now, which keeps the browser's own scroll anchoring and any wheel or swipe step
  // made in the same moment. Only at the page's end, where the browser has already pulled the scroll
  // back by itself as the page grew, does it count from where the person had it before. A page at
  // its very top when a bar goes, or too short to scroll, still moves: there's nothing to scroll.
  //   - A ResizeObserver hears the page's box change size before the screen is painted.
  //   - The page's place is read from the layout (offsetTop), so a scroll of the whole frame (e.g.
  //     iOS's on-screen keyboard) can't throw it off. It's in whole pixels, so a bar coming and
  //     going cancel out exactly.
  //   - Behind the lock screen nothing is measured, so after unlocking the page is where it was.
  //   - The control the keyboard is on never goes out of sight (v1.033): if it was in view and
  //     keeping still pushed it above the page's top edge, the page comes back down just enough,
  //     with room for its focus ring.
  useLayoutEffect(() => {
    const content = contentRef.current;
    const RING_ROOM = 8; // px kept above a focused control (its focus ring takes 4), as Rail.jsx keeps
    let lastTop = null; // the page's place in the layout at the last look
    let lastHeight = null; // its height then
    let lastScroll = content.scrollTop; // where the person had it scrolled before a change
    // The person's own scrolling. (While a change waits, the browser may pull the scroll back by
    // itself; the page's height then differs from the last look, so that isn't recorded.)
    const onScroll = () => {
      if (content.clientHeight === lastHeight) lastScroll = content.scrollTop;
    };
    // A bar came, so the page's visible part now starts `moved` px lower. A control showing its focus
    // ring (reached with the keyboard, or a text box being typed in) that was in view before, and now
    // sits above that edge (or too close for its ring), brings the page back down just enough. One
    // focused long ago and scrolled away is left alone, and so is a button that was only tapped.
    const keepFocusInSight = (moved) => {
      const focused = document.activeElement;
      if (!focused || focused === content || !content.contains(focused)) return;
      let fromKeyboard = true;
      try {
        fromKeyboard = focused.matches(':focus-visible');
      } catch {
        // a browser without :focus-visible: every focus counts as the keyboard's
      }
      if (!fromKeyboard) return;
      const edge = content.getBoundingClientRect().top;
      const at = focused.getBoundingClientRect().top;
      if (at >= edge - moved && at < edge + RING_ROOM) content.scrollTop -= edge + RING_ROOM - at;
    };
    const keepStill = () => {
      if (content.offsetParent === null) return; // hidden behind the lock screen
      const top = content.offsetTop;
      if (lastTop !== null && top !== lastTop) {
        const moved = top - lastTop;
        const now = content.scrollTop;
        // At the page's end the browser already pulled the scroll back as the page grew: from before.
        const pulledBack = moved < 0 && lastScroll > now && now >= content.scrollHeight - content.clientHeight - 1;
        content.scrollTop = (pulledBack ? lastScroll : now) + moved;
        if (moved > 0) keepFocusInSight(moved);
      }
      lastTop = top;
      lastHeight = content.clientHeight;
      lastScroll = content.scrollTop;
    };
    content.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(keepStill);
    observer.observe(content);
    return () => {
      observer.disconnect();
      content.removeEventListener('scroll', onScroll);
    };
  }, []);

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
        {offline && (
          <div className="shell-errbar" style={{ '--page-scrollbar': `${pageScrollbar}px` }}>
            <OfflineBar />
          </div>
        )}
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
