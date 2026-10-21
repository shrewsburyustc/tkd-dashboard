// privateDetails.js — the dashboard-wide "Hide private details" switch of THIS device (v0.506).
// Why it exists: rulebook v0.506 made ONE switch for the whole dashboard. Finance's live
// "Hide payments" switch (v0.215) was renamed "Hide private details" and widened: while it is on,
// every screen in every section hides date of birth, email and every payment detail (v0.249),
// shown as gray "Hidden on this tablet" (v0.507). Star builds no separate "Mat-side tablet" switch.
// The setting is still stored by Finance's src/lib/finance/deviceFinance.js under its OLD key
// 'tkd.device.hidePayments' (and the old event names), so a device that had Hide payments on keeps
// it on. This file only gives every section one name and one hook to use; it adds no new logic.
// It is a screen guard, not a security lock: the data still reaches the device (v0.161).
//
// ----- API: how a screen asks "are private details hidden?" -----
//   import { usePrivateDetailsHidden, HIDDEN_ON_THIS_TABLET } from '../lib/privateDetails.js';
//
//   const [hidden, setHidden] = usePrivateDetailsHidden();
//   hidden                    true while private details are hidden on this device
//   setHidden(true | false)   flips the switch (saved for this device; every open screen updates)
//
//   {hidden ? <span className="hint">{HIDDEN_ON_THIS_TABLET}</span> : formatDate(row.dob)}
//
// Outside React (plain functions, tests): getPrivateDetailsHidden() / setPrivateDetailsHidden(on).
// To listen yourself: window events PRIVATE_DETAILS_EVENT ('tkd:hide-payments') and
// FINANCE_DEVICE_EVENT ('tkd:finance-device'), plus the browser's 'storage' event for
// PRIVATE_DETAILS_KEY (another tab). The hook already does all of this.
// The words (menu row, top-bar chip, placeholders) are below, so every section uses the same ones.
import { useCallback, useEffect, useState } from 'react';
import {
  FINANCE_DEVICE_EVENT,
  HIDE_PAYMENTS_EVENT,
  HIDE_PAYMENTS_KEY,
  getHidePayments,
  setHidePayments,
} from './finance/deviceFinance.js';

// The stored key and event names are Finance's originals. Never rename them: devices keep their setting.
export const PRIVATE_DETAILS_KEY = HIDE_PAYMENTS_KEY; // 'tkd.device.hidePayments'
export const PRIVATE_DETAILS_EVENT = HIDE_PAYMENTS_EVENT; // 'tkd:hide-payments'
export { FINANCE_DEVICE_EVENT }; // 'tkd:finance-device'

// The same functions as Finance's, under the dashboard-wide names.
export const getPrivateDetailsHidden = getHidePayments;
export const setPrivateDetailsHidden = setHidePayments;

// ----- The words (v0.506; chip name and tooltip: v0.508 proposal 7; placeholders: v0.507) -----
export const HIDE_PRIVATE_DETAILS = 'Hide private details'; // the account-menu row
export const PRIVATE_DETAILS_HIDDEN = 'Private details hidden'; // the top-bar chip
export const SHOW_PRIVATE_DETAILS = 'Private details hidden. Tap to show them again.'; // the chip's screen-reader name and tooltip
export const HIDDEN_ON_THIS_TABLET = 'Hidden on this tablet'; // a hidden value keeps its row and says this
export const PAYMENT_DETAILS_HIDDEN = 'Payment details are hidden on this tablet.'; // a hidden payment part

// The React hook. Reads the switch and re-reads it whenever it changes:
//   - in this tab: deviceFinance fires the window events 'tkd:finance-device' / 'tkd:hide-payments'
//   - in another tab of the same browser: the browser fires a 'storage' event
export function usePrivateDetailsHidden() {
  const [hidden, setHiddenState] = useState(getPrivateDetailsHidden);

  useEffect(() => {
    const reread = () => setHiddenState(getPrivateDetailsHidden());
    // A 'storage' event comes from ANOTHER tab; only our key matters (null = storage cleared).
    const onStorage = (event) => {
      if (event.key === null || event.key === PRIVATE_DETAILS_KEY) reread();
    };
    window.addEventListener(FINANCE_DEVICE_EVENT, reread);
    window.addEventListener(PRIVATE_DETAILS_EVENT, reread);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(FINANCE_DEVICE_EVENT, reread);
      window.removeEventListener(PRIVATE_DETAILS_EVENT, reread);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setHidden = useCallback((on) => {
    setPrivateDetailsHidden(on); // saves it and fires the events (which update every hook, this one too)
    setHiddenState(Boolean(on));
  }, []);

  return [hidden, setHidden];
}
