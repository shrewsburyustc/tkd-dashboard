// BackToTesting.jsx — the "← Testing" link above Color Belt's page title (v0.59, v0.177).
// Why it exists: once Star testing exists, Testing opens a choice page first; each testing page then
// gets a way back to it, above its title, on every device. Star's page draws its own (StarTesting.jsx);
// this one is Color Belt's. Since pass 1 R3-06 (rulebook v1.048 (12)) it is the shared BackLink
// (src/components/BackLink.jsx, in the look this file's old `.tc-back` had, which was the model for it).
// It's a link-styled button: it moves inside the app (App.jsx changes the address and adds a Back
// step) rather than loading a new web page.
import BackLink from '../../../components/BackLink.jsx';
import { BACK_TO_TESTING, BACK_TO_TESTING_LABEL } from './text.js';

export default function BackToTesting({ onBack }) {
  return <BackLink label={BACK_TO_TESTING} ariaLabel={BACK_TO_TESTING_LABEL} onClick={() => onBack()} />;
}
