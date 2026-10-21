// TopBar.jsx — the 48px bar across the top of every signed-in screen.
// Why it exists: it holds the controls that apply to every page. On day one that is ONLY
// the location switcher and the account menu (guidelines 6) — search, notifications and
// add-new arrive later, with the first section that needs them.
// Hide private details (Finance's switch, v0.215, renamed and made dashboard-wide v0.506): while it
// is on for this device, a gray "Private details hidden" chip shows at the left of the bar; tapping
// it turns the switch off (44px tap area on touch).
// On phones the chip shows its icon only (the bar has no room for the words at 320px); its
// screen-reader name and tooltip still say "Private details hidden. Tap to show them again."
import { IconCurrencyDollarOff } from '@tabler/icons-react';
import LocationSwitcher from './LocationSwitcher.jsx';
import AccountMenu from './AccountMenu.jsx';
import {
  usePrivateDetailsHidden,
  PRIVATE_DETAILS_HIDDEN,
  SHOW_PRIVATE_DETAILS,
} from '../lib/privateDetails.js';

export default function TopBar({ location, onLocationChange, ...accountMenuProps }) {
  const [detailsHidden, setDetailsHidden] = usePrivateDetailsHidden();
  return (
    <header className="topbar">
      {detailsHidden && (
        <button type="button" className="fin-hidden-chip" aria-label={SHOW_PRIVATE_DETAILS} title={SHOW_PRIVATE_DETAILS} onClick={() => setDetailsHidden(false)}>
          <IconCurrencyDollarOff size={16} aria-hidden="true" />
          <span className="fin-hidden-chip-text">{PRIVATE_DETAILS_HIDDEN}</span>
        </button>
      )}
      <div className="topbar-spacer" />
      <LocationSwitcher value={location} onChange={onLocationChange} />
      {/* ...accountMenuProps passes the remaining props straight through to AccountMenu */}
      <AccountMenu {...accountMenuProps} />
    </header>
  );
}
