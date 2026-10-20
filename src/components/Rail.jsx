// Rail.jsx — the left navigation column on PC and tablet.
// Why it exists: it lists the dashboard sections. Prospects shows a dark count badge: the new
// sign-ups this person hasn't opened yet (rulebook v0.236, counted per person v0.244).
//   - PC (≥1024px, mouse): 52px wide, icon only; a dark label bubble appears on hover
//     and on keyboard focus.
//   - Tablet (640–1023px, or any touch screen ≥640px): 72px wide, label always shown.
//   - Phone (<640px): hidden — BottomBar.jsx is used instead.
// All of that switching is done in CSS (src/styles/app.css, "Rail" section).
import { NAV_ITEMS } from './navItems.js';

export default function Rail({ current, onNavigate, badges = {} }) {
  return (
    <nav className="rail" aria-label="Sections">
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const isCurrent = id === current;
        return (
          <button
            key={id}
            type="button"
            className={isCurrent ? 'rail-item is-current' : 'rail-item'}
            aria-label={badges[id] ? `${label}, ${badges[id]} new` : label} // the name a screen reader reads
            aria-current={isCurrent ? 'page' : undefined}
            onClick={() => onNavigate(id)}
          >
            <span className="rail-icon">
              <Icon size={20} aria-hidden="true" />
              {badges[id] > 0 && (
                <span className="nav-badge" aria-hidden="true">
                  {badges[id] > 99 ? '99+' : badges[id]}
                </span>
              )}
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
