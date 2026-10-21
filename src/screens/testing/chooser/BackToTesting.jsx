// BackToTesting.jsx — the "← Testing" link above Color Belt's page title (v0.59, v0.177).
// Why it exists: once Star testing exists, Testing opens a choice page first; each testing page then
// gets a way back to it, above its title, on every device. Star's page draws its own (StarTesting.jsx);
// this one is Color Belt's, with the same look. It's a link-styled button: it moves inside the app
// (App.jsx changes the address and adds a Back step) rather than loading a new web page.
import { IconArrowLeft } from '@tabler/icons-react';
import { BACK_TO_TESTING, BACK_TO_TESTING_LABEL } from './text.js';
import './chooser.css';

export default function BackToTesting({ onBack }) {
  return (
    <button type="button" className="link-button tc-back" aria-label={BACK_TO_TESTING_LABEL} onClick={() => onBack()}>
      {/* ti-arrow-left = back */}
      <IconArrowLeft size={16} aria-hidden="true" />
      {BACK_TO_TESTING}
    </button>
  );
}
