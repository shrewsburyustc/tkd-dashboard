// Shell.jsx — the frame around every signed-in page: rail + top bar + content + bottom bar.
// Why it exists: each section (only Home today) is drawn INSIDE this frame, so navigation
// and the top bar are built once and look the same everywhere.
//
// `hidden` is true while the lock screen is showing. The shell stays in memory (so you land
// back exactly where you were after unlocking) but is removed from view and from the Tab order.
// `inert` is true while a dialog (account, Testing or Staff accounts) is open: the page stays
// visible behind the dimmed backdrop, but can't be clicked or reached with Tab.
import Rail from './Rail.jsx';
import TopBar from './TopBar.jsx';
import BottomBar from './BottomBar.jsx';

export default function Shell({
  hidden,
  inert,
  currentSection,
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
  onSignOut,
  badges,
  children,
}) {
  return (
    <div className="shell" hidden={hidden} inert={inert}>
      <Rail current={currentSection} onNavigate={onNavigate} badges={badges} />
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
          onSignOut={onSignOut}
          isScreenLocked={hidden}
        />
        <main className="shell-content">{children}</main>
        <BottomBar current={currentSection} onNavigate={onNavigate} badges={badges} />
      </div>
    </div>
  );
}
