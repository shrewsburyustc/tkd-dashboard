// navItems.js — the list of dashboard sections shown in the rail and the phone bottom bar.
// Why it exists: both navigation bars read from this ONE list, so adding a section later
// means adding one line here. Rule P7: only sections that really exist are listed.
// Order decided v0.54: Home, then Testing (color belt testing, icon ti-certificate — v0.39).
// Schedule comes after Testing (ti-clock, v0.137); Calendar after Schedule (ti-calendar-month, v0.138);
// Forms after Calendar (ti-clipboard-text, v0.139); Prospects after Forms (ti-address-book, v0.140).
// phone: true = on the phone's bottom bar; the others go under More (ti-menu-2) on a phone
// (six sections don't fit: Home, Calendar, Prospects, More - rulebook v0.140).
import { IconAddressBook, IconCalendarMonth, IconCertificate, IconClipboardText, IconClock, IconHome } from '@tabler/icons-react';

export const NAV_ITEMS = [
  { id: 'home', label: 'Home', Icon: IconHome, phone: true },
  { id: 'testing', label: 'Testing', Icon: IconCertificate },
  { id: 'schedule', label: 'Schedule', Icon: IconClock },
  { id: 'calendar', label: 'Calendar', Icon: IconCalendarMonth, phone: true },
  { id: 'forms', label: 'Forms', Icon: IconClipboardText },
  { id: 'prospects', label: 'Prospects', Icon: IconAddressBook, phone: true },
];
