// TopBar.jsx — the 48px bar across the top of every signed-in screen.
// Why it exists: it holds the controls that apply to every page. On day one that is ONLY
// the location switcher and the account menu (guidelines 6) — search, notifications and
// add-new arrive later, with the first section that needs them.
// Finance (v0.215): while "Hide payments" is on for this device, a gray "Payments hidden" chip
// shows at the left of the bar; tapping it shows payments again (44px tap area on touch).
// On phones the chip shows its icon only (the bar has no room for the words at 320px); its
// screen-reader name and tooltip still say "Payments hidden".
import { IconCurrencyDollarOff } from '@tabler/icons-react';
import LocationSwitcher from './LocationSwitcher.jsx';
import AccountMenu from './AccountMenu.jsx';
import { usePaymentsHidden } from '../screens/finance/usePaymentsHidden.js';
import { PAYMENTS_HIDDEN, SHOW_PAYMENTS } from '../screens/finance/text.js';

export default function TopBar({ location, onLocationChange, ...accountMenuProps }) {
  const [paymentsHidden, setPaymentsHidden] = usePaymentsHidden();
  return (
    <header className="topbar">
      {paymentsHidden && (
        <button type="button" className="fin-hidden-chip" aria-label={SHOW_PAYMENTS} title={SHOW_PAYMENTS} onClick={() => setPaymentsHidden(false)}>
          <IconCurrencyDollarOff size={16} aria-hidden="true" />
          <span className="fin-hidden-chip-text">{PAYMENTS_HIDDEN}</span>
        </button>
      )}
      <div className="topbar-spacer" />
      <LocationSwitcher value={location} onChange={onLocationChange} />
      {/* ...accountMenuProps passes the remaining props straight through to AccountMenu */}
      <AccountMenu {...accountMenuProps} />
    </header>
  );
}
