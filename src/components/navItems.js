// navItems.js — the list of dashboard sections shown in the rail and the phone bottom bar.
// Why it exists: both navigation bars read from this ONE list, so adding a section later
// means adding one line here. Rule P7: only sections that really exist are listed —
// today that's just Home.
import { IconHome } from '@tabler/icons-react';

export const NAV_ITEMS = [{ id: 'home', label: 'Home', Icon: IconHome }];
