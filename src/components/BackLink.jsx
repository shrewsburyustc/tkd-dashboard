// BackLink.jsx — the "← Testing" / "← Camps" link above a page's title, one for every section
// (pass 1 R3-06; rulebook v1.048 (12)).
// Why it exists: the back link had six copies in two sizes (.st-back, .tc-back and .fb-back at 24px
// and pulled back on touch; .ev-back, .bb-back and .fin-back-link at 28px with a plain 44px touch box
// that pushed the title down: at 820 touch the title sat at 146px instead of 124). Now there is one,
// in .tc-back's look: 24px tall with a 16px arrow, and on touch a 44px tap box pulled back with
// negative margins, so the title never moves (shared.css ".back-link"). Each section switches to it.
// It is a link-styled button: it moves inside the app (the section changes the address) rather than
// loading a new web page.
//
// Props:
//   label       the words, e.g. "Testing" (the section's)
//   ariaLabel   optional screen-reader name when it says more than the words, e.g. "Back to Testing"
//   onClick     what to do (go back to the list)
//   className   optional extra class for a section's own tweak
// Testing's focus helper (screens/Testing.jsx) finds a back link by this class: ".back-link".
import { IconArrowLeft } from '@tabler/icons-react';

export default function BackLink({ label, ariaLabel, onClick, className = '' }) {
  return (
    <button type="button" className={`link-button back-link ${className}`.trim()} aria-label={ariaLabel} onClick={onClick}>
      {/* ti-arrow-left = back */}
      <IconArrowLeft size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
