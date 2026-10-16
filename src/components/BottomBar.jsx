// BottomBar.jsx — the navigation bar along the bottom of the screen on phones (<640px).
// Why it exists: on a phone the left rail would waste width, and the bottom is within
// thumb reach. Labels are always visible. Hidden on tablet and PC (see app.css).
import { NAV_ITEMS } from './navItems.js';

export default function BottomBar({ current, onNavigate }) {
  return (
    <nav className="bottombar" aria-label="Sections">
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const isCurrent = id === current;
        return (
          <button
            key={id}
            type="button"
            className={isCurrent ? 'bottombar-item is-current' : 'bottombar-item'}
            aria-current={isCurrent ? 'page' : undefined}
            onClick={() => onNavigate(id)}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
