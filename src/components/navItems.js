// navItems.js — the list of dashboard sections shown in the rail and the phone bottom bar.
// Why it exists: both navigation bars read from this ONE list, so adding a section later
// means adding one line here. Rule P7: only sections that really exist are listed.
// Order decided v0.54: Home, then Testing (color belt testing, icon ti-certificate — v0.39).
//
// `pages` (optional): a section with pages of its own. On a mouse device the rail shows them as a
// dark menu beside the icon (RailMenu.jsx, rulebook v0.59); clicking the icon itself still opens
// the section's choice page. Testing gets its pages only while the Star testing build switch is on
// (lib/features.js) — with it off, Testing is one page, exactly as before.
//
// Camps comes after Testing (icon ti-tent, contract 0013 §6.1; rulebook v0.229).
// Schedule comes after Camps (ti-clock, v0.233); Calendar after Schedule (ti-calendar-month, v0.234);
// Forms after Calendar (ti-clipboard-text, v0.235); Prospects after Forms (ti-address-book, v0.236).
// phone: true = on the phone's bottom bar; the others go under More (ti-menu-2) on a phone
// (too many sections to fit: Home, Calendar, Prospects, More - rulebook v0.236).
// Finance (v0.201): icon ti-report-money, LAST on the rail; on phones it is under More.
//
// "Hide private details" (v0.215, renamed v0.506): while it is on for this device, Finance is left out of the list.
// Rail.jsx and BottomBar.jsx read NAV_ITEMS directly, so App.jsx calls showFinanceInNav() each
// time it draws; it refills the SAME list (in place) with or without Finance, and the bars, which
// are drawn again right after, pick it up. (Testing's `pages` are part of its item, so they stay.)
import {
  IconAddressBook, IconCalendarMonth, IconCertificate, IconClipboardText, IconClock, IconHome, IconReportMoney, IconStar,
  IconTent, IconAward,
} from '@tabler/icons-react';
import { STAR_TESTING_ON } from '../lib/features.js';

// Testing's pages (v0.59): ti-certificate = Color belt testing, ti-star = Star testing,
// ti-award = Black Belt testing (C2, v0.937).
export const TESTING_PAGES = [
  { key: 'colorBelt', label: 'Color belt testing', Icon: IconCertificate },
  { key: 'star', label: 'Star testing', Icon: IconStar },
  { key: 'blackBelt', label: 'Black Belt testing', Icon: IconAward },
];

const ALL_ITEMS = [
  { id: 'home', label: 'Home', Icon: IconHome, phone: true },
  { id: 'testing', label: 'Testing', Icon: IconCertificate, pages: STAR_TESTING_ON ? TESTING_PAGES : null },
  { id: 'camps', label: 'Camps', Icon: IconTent },
  { id: 'schedule', label: 'Schedule', Icon: IconClock },
  { id: 'calendar', label: 'Calendar', Icon: IconCalendarMonth, phone: true },
  { id: 'forms', label: 'Forms', Icon: IconClipboardText },
  { id: 'prospects', label: 'Prospects', Icon: IconAddressBook, phone: true },
  { id: 'finance', label: 'Finance', Icon: IconReportMoney },
];

export const NAV_ITEMS = [...ALL_ITEMS];

// show = false while payments are hidden on this device.
export function showFinanceInNav(show) {
  const next = show ? ALL_ITEMS : ALL_ITEMS.filter((item) => item.id !== 'finance');
  NAV_ITEMS.splice(0, NAV_ITEMS.length, ...next); // replace the contents, keep the same array
}
