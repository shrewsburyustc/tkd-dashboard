// NoIcon.jsx — a blank icon slot for a ⋯ menu item that has no icon.
// Why it exists: rulebook v1.016 (design review BB11) — Close registration and Open registration
// lose their lock icons, because elsewhere in the dashboard a lock means "Lock now". RowMenu always
// draws an item's Icon, so these two items get this empty box the size of an icon instead: their
// words stay lined up with the items above and below. Color Belt (EventsTab.jsx) and Star
// (StarEventsTab.jsx) draw the same blank slot with the same shared class (.ev-noicon, shared.css).
export default function NoIcon() {
  return <span className="menu-icon ev-noicon" aria-hidden="true" />;
}
