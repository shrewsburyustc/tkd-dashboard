// navItems.js — the list of dashboard sections shown in the rail and the phone bottom bar.
// Why it exists: both navigation bars read from this ONE list, so adding a section later
// means adding one line here. Rule P7: only sections that really exist are listed.
// Order decided v0.54: Home, then Testing (color belt testing, icon ti-certificate — v0.39).
//
// `pages` (optional): a section with pages of its own. On a mouse device the rail shows them as a
// dark menu beside the icon (RailMenu.jsx, rulebook v0.59); clicking the icon itself still opens
// the section's choice page. Testing gets its pages only while the Star testing build switch is on
// (lib/features.js) — with it off, Testing is one page, exactly as before.
import { IconCertificate, IconHome, IconStar } from '@tabler/icons-react';
import { STAR_TESTING_ON } from '../lib/features.js';

// Testing's pages (v0.59): ti-certificate = Color belt testing, ti-star = Star testing.
export const TESTING_PAGES = [
  { key: 'colorBelt', label: 'Color belt testing', Icon: IconCertificate },
  { key: 'star', label: 'Star testing', Icon: IconStar },
];

export const NAV_ITEMS = [
  { id: 'home', label: 'Home', Icon: IconHome },
  { id: 'testing', label: 'Testing', Icon: IconCertificate, pages: STAR_TESTING_ON ? TESTING_PAGES : null },
];
