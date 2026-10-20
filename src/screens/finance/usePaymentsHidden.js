// usePaymentsHidden.js — a React hook for the "Hide payments" switch of this device (v0.215).
// Why it exists: the switch lives in the account menu, but several places must react to it at
// once — the rail / More (no Finance item), the Finance addresses (go to Home), the Home reminder
// (no link) and the top bar ("Payments hidden" chip). The setting itself is stored in this
// browser by src/lib/finance/deviceFinance.js; this hook just reads it and re-reads it whenever
// it changes:
//   - in this tab: deviceFinance fires the window events 'tkd:finance-device' / 'tkd:hide-payments'
//   - in another tab of the same browser: the browser fires a 'storage' event
//
//   const [hidden, setHidden] = usePaymentsHidden();
//   hidden      true while payments are hidden on this device
//   setHidden(true | false)   flips the switch (saved for this device)
import { useCallback, useEffect, useState } from 'react';
import {
  FINANCE_DEVICE_EVENT,
  HIDE_PAYMENTS_EVENT,
  HIDE_PAYMENTS_KEY,
  getHidePayments,
  setHidePayments,
} from '../../lib/finance/deviceFinance.js';

export function usePaymentsHidden() {
  const [hidden, setHiddenState] = useState(getHidePayments);

  useEffect(() => {
    const reread = () => setHiddenState(getHidePayments());
    // A 'storage' event comes from ANOTHER tab; only our key matters (null = storage cleared).
    const onStorage = (event) => {
      if (event.key === null || event.key === HIDE_PAYMENTS_KEY) reread();
    };
    window.addEventListener(FINANCE_DEVICE_EVENT, reread);
    window.addEventListener(HIDE_PAYMENTS_EVENT, reread);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(FINANCE_DEVICE_EVENT, reread);
      window.removeEventListener(HIDE_PAYMENTS_EVENT, reread);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setHidden = useCallback((on) => {
    setHidePayments(on); // saves it and fires the events (which update every hook, this one too)
    setHiddenState(Boolean(on));
  }, []);

  return [hidden, setHidden];
}
