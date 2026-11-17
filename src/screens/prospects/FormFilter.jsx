// FormFilter.jsx — the "Forms" button beside "Find a prospect" and the menu under it.
// Why it exists (Jeffrey 2026-11-17: "I need to be able to view prospects from a specific form ... allow me
// to filter which forms I can see in the prospects area"): pick one form, several, or "All forms" (the
// default). The menu is the app's tick-box menu (RowMenu `checked`, the Calendar's Show menu): a PC / tablet
// dropdown, a bottom sheet on a phone. A tick takes effect at once and the menu stays open; Esc, Tab or a
// click outside closes it. "All forms" is the same as nothing picked, and choosing it clears the picks.
// Only forms that have prospects at the shown school(s) are listed, each with its number of prospects;
// on Both the school is named in each row. The button turns blue while forms are picked, and the page
// says what is filtered in a gray line under the search row (Prospects.jsx), as it does for a stage.
import { useState } from 'react';
import { IconChevronDown, IconFilter } from '@tabler/icons-react';
import RowMenu from '../../components/RowMenu.jsx';
import * as T from './text.js';

const MENU_WIDTH = 340; // px: form names are long ("Al-Hamra Special 4-Week Introductory Taekwondo Program")

// listed: [{ id, name, locationCode, n }] in the order shown; picked: the picked form ids (only listed ones)
// loading: the forms are still being read — a grayed "Forms: All forms" button holds the place (no menu yet)
export default function FormFilter({ listed, picked, both, isPhone, subtitle, onChange, loading = false }) {
  const [menu, setMenu] = useState(null); // { anchor } while the menu is open
  const pickedForms = listed.filter((f) => picked.includes(f.id));
  const on = pickedForms.length > 0;
  const items = [
    { key: 'all', label: T.ALL_FORMS, checked: !on, onSelect: () => onChange([]) },
    ...listed.map((f, i) => ({
      key: f.id,
      label: T.formOption(f.name, f.n, both ? T.SCHOOL_NAME[f.locationCode] : ''),
      checked: picked.includes(f.id),
      wrap: true,
      // on Both a line separates Worcester's forms from Shrewsbury's
      separatorBefore: i === 0 || (both && listed[i - 1].locationCode !== f.locationCode),
      onSelect: () => onChange(picked.includes(f.id) ? picked.filter((id) => id !== f.id) : [...picked, f.id]),
    })),
  ];
  return (
    <>
      <button
        type="button"
        className={`pformbtn${on ? ' is-on' : ''}`}
        data-forms-filter
        aria-haspopup="menu"
        aria-expanded={menu ? 'true' : 'false'}
        aria-disabled={loading ? 'true' : undefined}
        onClick={(e) => !loading && setMenu(menu ? null : { anchor: e.currentTarget })}
      >
        <IconFilter size={16} aria-hidden="true" />
        <span className="pformbtn-text">{T.formsButton(pickedForms.length, pickedForms.map((f) => f.name), listed.length)}</span>
        <IconChevronDown size={16} aria-hidden="true" />
      </button>
      {menu && !loading && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={T.FILTER_MENU}
          subtitle={subtitle}
          label={T.FILTER_MENU}
          items={items}
          width={MENU_WIDTH}
          onClose={(reason) => {
            const el = menu.anchor;
            setMenu(null);
            if (reason === 'escape' || reason === 'tab') el?.focus();
          }}
        />
      )}
    </>
  );
}
