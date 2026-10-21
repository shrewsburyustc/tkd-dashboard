// usePaymentsHidden.js — Finance's old name for this device's "Hide private details" switch.
// Why it exists: Finance's "Hide payments" switch (v0.215) became the dashboard-wide
// "Hide private details" switch (v0.506). The hook now lives in src/lib/privateDetails.js so every
// section can use it; this file only keeps Finance's old import name working (no logic here).
//
//   const [hidden, setHidden] = usePaymentsHidden();   // the same as usePrivateDetailsHidden()
//   hidden      true while private details (payments too) are hidden on this device
//   setHidden(true | false)   flips the switch (saved for this device)
export { usePrivateDetailsHidden as usePaymentsHidden } from '../../lib/privateDetails.js';
