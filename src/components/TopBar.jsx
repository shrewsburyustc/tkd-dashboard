// TopBar.jsx — the 48px bar across the top of every signed-in screen.
// Why it exists: it holds the controls that apply to every page. On day one that is ONLY
// the location switcher and the account menu (guidelines 6) — search, notifications and
// add-new arrive later, with the first section that needs them.
import LocationSwitcher from './LocationSwitcher.jsx';
import AccountMenu from './AccountMenu.jsx';

export default function TopBar({ location, onLocationChange, ...accountMenuProps }) {
  return (
    <header className="topbar">
      <div className="topbar-spacer" />
      <LocationSwitcher value={location} onChange={onLocationChange} />
      {/* ...accountMenuProps passes the remaining props straight through to AccountMenu */}
      <AccountMenu {...accountMenuProps} />
    </header>
  );
}
