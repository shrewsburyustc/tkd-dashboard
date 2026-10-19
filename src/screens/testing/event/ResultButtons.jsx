// ResultButtons.jsx — the three result buttons of one student on the Grading tab:
// Pass · Not passed · No show (G1, rulebook v0.181).
// Why it exists: a grader records a result with ONE tap, and taps the chosen button again to
// clear it. The three buttons are drawn as one joined control (a "segmented" control):
//   - the chosen one shows its icon and bold words on a soft color — Pass ti-check on green,
//     Not passed ti-x on amber, No show ti-user-off on solid gray with a darker inside border —
//     so meaning never depends on color alone (ti-check / ti-x here are the recorded exception
//     to guidelines 2.4, v0.190)
//   - 28px tall with a mouse, 44px on touch screens; full width on phones
//   - screen readers hear a group "Result for Mia Lopez" with three toggle buttons
//     (aria-pressed = "pressed" / "not pressed"); Tab moves through them, Enter / Space chooses
//
// Props:
//   name       the student's name (for the group's label)
//   value      'pass' | 'not_passed' | 'no_show' | null
//   disabled   true before the testing day (grayed, can't be pressed)
//   onChoose(next)  next = the tapped result, or null when the tapped one was already chosen
//   layout     { isPhone, isTouch }
//   rowId      the student's registration id (data-result-btn: lets the page find the row's buttons)
//
// ResultTag (also here): the same result as a read-only tag — staff after the testing day, and
// the Students tab's detail view.
import { IconCheck, IconUserOff, IconX } from '@tabler/icons-react';
import * as T from '../text.js';

const BUTTONS = [
  { key: 'pass', label: T.RESULT_PASS, Icon: IconCheck },
  { key: 'not_passed', label: T.RESULT_NOT_PASSED, Icon: IconX },
  { key: 'no_show', label: T.RESULT_NO_SHOW, Icon: IconUserOff },
];

// The read-only result of a row (staff after the testing day; also the Students detail view).
export function ResultTag({ result }) {
  if (result === 'pass') {
    return (
      <span className="ttag ttag--ok">
        <IconCheck size={12} aria-hidden="true" />
        {T.TAG_PASSED}
      </span>
    );
  }
  if (result === 'not_passed') {
    return (
      <span className="ttag ttag--warn">
        <IconX size={12} aria-hidden="true" />
        {T.TAG_NOT_PASSED}
      </span>
    );
  }
  if (result === 'no_show') {
    return (
      <span className="ttag">
        <IconUserOff size={12} aria-hidden="true" />
        {T.TAG_NO_SHOW}
      </span>
    );
  }
  return <span className="gr-notrec">{T.NOT_RECORDED}</span>;
}

export default function ResultButtons({ name, value, disabled = false, onChoose, layout, rowId }) {
  return (
    <div
      className={`gr-res${layout.isPhone ? ' is-phone' : ''}${disabled ? ' is-disabled' : ''}`}
      role="group"
      aria-label={T.resultGroupLabel(name)}
    >
      {BUTTONS.map(({ key, label, Icon }) => {
        const chosen = value === key;
        return (
          <button
            key={key}
            type="button"
            className={`gr-res-btn gr-res-${key}${chosen ? ' is-chosen' : ''}`}
            aria-pressed={chosen ? 'true' : 'false'}
            disabled={disabled}
            data-result-btn={rowId}
            onClick={() => onChoose(chosen ? null : key)}
          >
            {/* The icon shows only on the chosen button (icon + bold word, never color alone). */}
            {chosen && <Icon size={16} aria-hidden="true" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
