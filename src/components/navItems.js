// navItems.js — the list of dashboard sections shown in the rail and the phone bottom bar.
// Why it exists: both navigation bars read from this ONE list, so adding a section later
// means adding one line here. Rule P7: only sections that really exist are listed.
// Order decided v0.54: Home, then Testing (color belt testing, icon ti-certificate — v0.39).
// Schedule comes after Testing (ti-clock, v0.137); Calendar after Schedule (ti-calendar-month, v0.138).
import { IconCalendarMonth, IconCertificate, IconClock, IconHome } from '@tabler/icons-react';

export const NAV_ITEMS = [
  { id: 'home', label: 'Home', Icon: IconHome },
  { id: 'testing', label: 'Testing', Icon: IconCertificate },
  { id: 'schedule', label: 'Schedule', Icon: IconClock },
  { id: 'calendar', label: 'Calendar', Icon: IconCalendarMonth },
];
