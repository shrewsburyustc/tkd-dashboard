// Rail.jsx — the left navigation column on PC and tablet.
// Why it exists: it lists the dashboard sections (only Home for now).
//   - PC (≥1024px, mouse): 52px wide, icon only; a dark label bubble appears on hover
//     and on keyboard focus.
//   - Tablet (640–1023px, or any touch screen ≥640px): 72px wide, label always shown.
//   - Phone (<640px): hidden — BottomBar.jsx is used instead.
// All of that switching is done in CSS (src/styles/app.css, "Rail" section).
// A section with pages of its own (navItems.js "pages" — Testing, once Star testing exists) is
// drawn by RailMenu.jsx instead: same icon, plus the dark hover menu on mouse devices (v0.59).
import { NAV_ITEMS } from './navItems.js';
import RailMenu from './RailMenu.jsx';

// currentPage: the open page inside the current section (e.g. Testing's 'star'), or null.
export default function Rail({ current, currentPage = null, onNavigate }) {
  return (
    <nav className="rail" aria-label="Sections">
      {NAV_ITEMS.map((item) => {
        const { id, label, Icon } = item;
        const isCurrent = id === current;
        if (item.pages) {
          return <RailMenu key={id} item={item} isCurrent={isCurrent} currentPage={currentPage} onNavigate={onNavigate} />;
        }
        return (
          <button
            key={id}
            type="button"
            className={isCurrent ? 'rail-item is-current' : 'rail-item'}
            aria-label={label} // the name a screen reader reads; matches the bubble text exactly
            aria-current={isCurrent ? 'page' : undefined}
            onClick={() => onNavigate(id)}
          >
            <span className="rail-icon">
              <Icon size={20} aria-hidden="true" />
            </span>
            {/* On PC this is the hover/focus bubble; on tablet it's the label under the icon.
                aria-hidden because aria-label above already gives the name. */}
            <span className="rail-label" aria-hidden="true">
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
