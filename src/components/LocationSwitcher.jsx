// LocationSwitcher.jsx — the Worcester | Shrewsbury | Both control in the top bar.
// Why it exists: it picks which school the page shows (guidelines 3.3). It starts on this
// device's default, but changing it here does NOT change the device default — that's done
// from "This device" in the account menu.
//
// Accessibility: it behaves like a group of radio buttons. Only the selected option is in
// the Tab order; the arrow keys move the selection (the standard radio-group pattern).
import { useRef } from 'react';
import { IconMapPin } from '@tabler/icons-react';
import { SWITCHER_OPTIONS } from '../lib/device.js';

export default function LocationSwitcher({ value, onChange }) {
  const optionRefs = useRef([]); // the three buttons, so arrow keys can move focus

  function selectIndex(index) {
    onChange(SWITCHER_OPTIONS[index]);
    optionRefs.current[index]?.focus();
  }

  function handleKeyDown(event, index) {
    const count = SWITCHER_OPTIONS.length;
    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % count;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + count) % count;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = count - 1;
    if (next !== null) {
      event.preventDefault(); // stop the page from scrolling
      selectIndex(next);
    }
  }

  return (
    <div className="loc" role="radiogroup" aria-label="Location">
      {SWITCHER_OPTIONS.map((option, index) => {
        const checked = option === value;
        return (
          <button
            key={option}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1} // "roving tab index": only the selected option is tabbable
            className={checked ? 'loc-option is-active' : 'loc-option'}
            onClick={() => onChange(option)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {checked && <IconMapPin size={16} aria-hidden="true" />}
            {option}
          </button>
        );
      })}
    </div>
  );
}
