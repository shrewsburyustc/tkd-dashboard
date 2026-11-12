// publicOrigin.js — THE ONE place that names the web address families' links and QR codes use.
// Why it exists (domain plan, rulebook v1.200): the address was written out three times (Color Belt's
// eventRules.js, Camps' campRules.js, the parts page). With the school's own domain coming, moving
// every link to the new address must be ONE line, not a hunt. Every public link the app makes —
// Color Belt /register/<code>, Camps /camp/<code>, Star /star/<code>, Black Belt /black-belt/<code>,
// Forms /f/<name>, and any new section's — is `${PUBLIC_ORIGIN}/<path>`.
//
// It is a FIXED address on purpose, never read from the address bar: a link copied while someone is
// on a preview or on localhost must still be the real one.
//
// What to know when changing it:
//   - Old links keep working. The app is served on EVERY address it has (the old
//     tkd-dashboard.pages.dev stays on for good), and the Functions accept all of them (the Cloudflare
//     setting PUBLIC_ORIGIN is a list, functions/_lib/origins.js). So changing THIS constant only
//     changes the links the app SHOWS from now on; links already printed or shared still work.
//   - Change it only AFTER the new address works (custom domain on the Pages project, DNS record,
//     Turnstile hostname, Cloudflare PUBLIC_ORIGIN list; docs/Domain/TKD-Domain-Plan.md §4), or the
//     links shown would lead nowhere.
//   - checks (src/lib/*/checks.mjs, eventsChecks.mjs) and functions/tests name the address too; they
//     import this constant where they can and spell it out only to prove the exact text.
//
// Pure data, no browser or database, so Node checks can import it.
export const PUBLIC_ORIGIN = 'https://tkd-dashboard.pages.dev';
