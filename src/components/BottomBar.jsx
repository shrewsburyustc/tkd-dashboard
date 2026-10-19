// BottomBar.jsx — the navigation bar along the bottom of the screen on phones (<640px).
// Why it exists: on a phone the left rail would waste width, and the bottom is within
// thumb reach. Labels are always visible. Hidden on tablet and PC (see app.css).
// With six sections there isn't room for all of them (rulebook v0.140): the bar shows the
// sections marked phone: true in navItems.js (Home, Calendar, Prospects) and More (ti-menu-2),
// which opens a sheet with the others (Testing, Schedule, Forms). More is highlighted while one
// of those is open. Prospects carries the same count badge as on the rail.
import { useState } from 'react';
import { IconMenu2 } from '@tabler/icons-react';
import RowMenu from './RowMenu.jsx';
import { NAV_ITEMS } from './navItems.js';

const MORE = 'More';

export default function BottomBar({ current, onNavigate, badges = {} }) {
  const [menu, setMenu] = useState(null);
  const shown = NAV_ITEMS.filter((item) => item.phone);
  const rest = NAV_ITEMS.filter((item) => !item.phone);
  const moreCurrent = rest.some((item) => item.id === current);
  return (
    <nav className="bottombar" aria-label="Sections">
      {shown.map(({ id, label, Icon }) => {
        const isCurrent = id === current;
        return (
          <button
            key={id}
            type="button"
            className={isCurrent ? 'bottombar-item is-current' : 'bottombar-item'}
            aria-current={isCurrent ? 'page' : undefined}
            aria-label={badges[id] ? `${label}, ${badges[id]} new` : undefined}
            onClick={() => onNavigate(id)}
          >
            <span className="bottombar-icon">
              <Icon size={20} aria-hidden="true" />
              {badges[id] > 0 && (
                <span className="nav-badge" aria-hidden="true">
                  {badges[id] > 99 ? '99+' : badges[id]}
                </span>
              )}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
      {rest.length > 0 && (
        <button
          type="button"
          className={moreCurrent ? 'bottombar-item is-current' : 'bottombar-item'}
          aria-haspopup="menu"
          aria-expanded={menu ? 'true' : 'false'}
          aria-current={moreCurrent ? 'page' : undefined}
          onClick={(e) => setMenu(menu ? null : { anchor: e.currentTarget })}
        >
          <span className="bottombar-icon">
            <IconMenu2 size={20} aria-hidden="true" />
          </span>
          <span>{MORE}</span>
        </button>
      )}
      {menu && (
        <RowMenu
          anchor={menu.anchor}
          isSheet
          title={MORE}
          label={MORE}
          items={rest.map(({ id, label, Icon }) => ({ key: id, label, Icon, onSelect: () => onNavigate(id) }))}
          onClose={(reason) => {
            const el = menu.anchor;
            setMenu(null);
            if (reason === 'escape' || reason === 'tab') el?.focus();
          }}
        />
      )}
    </nav>
  );
}
