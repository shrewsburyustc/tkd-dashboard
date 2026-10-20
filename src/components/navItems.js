// navItems.js — the list of dashboard sections shown in the rail and the phone bottom bar.
// Why it exists: both navigation bars read from this ONE list, so adding a section later
// means adding one line here. Rule P7: only sections that really exist are listed.
// Order decided v0.54: Home, then Testing (color belt testing, icon ti-certificate — v0.39).
// Camps comes after Testing (icon ti-tent, contract 0013 §6.1).
// Finance (v0.201): icon ti-report-money, LAST on the rail. On phones it belongs under More once
// the bottom bar has more than 5 sections (v0.140); with three sections it still fits in the bar.
//
// "Hide payments" (v0.215): while it is on for this device, Finance is left out of the list.
// Rail.jsx and BottomBar.jsx read NAV_ITEMS directly, so App.jsx calls showFinanceInNav() each
// time it draws; it refills the SAME list (in place) with or without Finance, and the bars, which
// are drawn again right after, pick it up.
import { IconCertificate, IconHome, IconReportMoney, IconTent } from '@tabler/icons-react';

const ALL_ITEMS = [
  { id: 'home', label: 'Home', Icon: IconHome },
  { id: 'testing', label: 'Testing', Icon: IconCertificate },
  { id: 'camps', label: 'Camps', Icon: IconTent },
  { id: 'finance', label: 'Finance', Icon: IconReportMoney },
];

export const NAV_ITEMS = [...ALL_ITEMS];

// show = false while payments are hidden on this device.
export function showFinanceInNav(show) {
  const next = show ? ALL_ITEMS : ALL_ITEMS.filter((item) => item.id !== 'finance');
  NAV_ITEMS.splice(0, NAV_ITEMS.length, ...next); // replace the contents, keep the same array
}
