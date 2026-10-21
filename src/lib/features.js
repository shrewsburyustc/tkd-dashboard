// features.js — the dashboard's build switches ("feature flags").
// Why it exists: some parts of the dashboard are merged into `main` in small steps but must stay
// hidden on the live site until they're ready (rulebook v0.176). One switch per hidden part lives
// here, so every screen asks ONE place "is this part on?".
//
// ----- STAR_TESTING_ON: Star testing and the Testing chooser (v0.176, v0.177) -----
// When it is OFF, the dashboard behaves exactly as before Star testing existed: the Testing button
// opens Color Belt straight away at #testing, its header says "Testing" with no back link, and
// there is no chooser and no hover menu. A Star address (#testing/star) shows Color Belt.
// When it is ON: #testing is the chooser (Color belt testing / Star testing), the rail's Testing
// icon gets its hover menu, Color Belt moves to #testing/color-belt with "← Testing" above the
// title "Color belt testing", and Star testing lives at #testing/star.
//
// How it is decided — at BUILD time, from the setting VITE_STAR_TESTING:
//   'on'          → ON
//   'off'         → OFF (also in preview mode — handy to see what the live site shows)
//   anything else → ON in preview mode (npm run dev:preview-mode / build:preview-mode), OFF otherwise
// Vite writes the value into the built files ("import.meta.env" is replaced by plain text), so the
// live build does not even contain the Star screens while the switch is off.
//
// How Jeffrey turns it on for the live site later (planned for Star phase 2):
//   Cloudflare dashboard → Workers & Pages → tkd-dashboard → Settings → Variables and secrets →
//   add VITE_STAR_TESTING = on (Production) → then redeploy (a new push to main, or "Retry
//   deployment"), because the value is read when the site is BUILT, not when a page is opened.
// To try the live-site look on this PC: put VITE_STAR_TESTING=off (or on) in .env.local, or run
//   VITE_STAR_TESTING=off npm run dev:preview-mode   (Git Bash)
const starSetting = import.meta.env.VITE_STAR_TESTING;

export const STAR_TESTING_ON =
  starSetting === 'on' || (starSetting !== 'off' && import.meta.env.MODE === 'preview');

// Loads Star testing's screens (Testing.jsx shows them with React's lazy(): fetched the first time
// Star testing opens). It lives HERE, next to the switch, on purpose: the build tool can only see
// that the import is never used, and leave Star out of the live build, when the switch's test and
// the import are in the same file. Switch off → null, and Star's screens are not in the build.
export const loadStarTesting = STAR_TESTING_ON ? () => import('../screens/testing/star/StarTesting.jsx') : null;
