// turnstile.js — Cloudflare Turnstile, the "are you human?" check, on the public forms page.
// Why it exists: the forms Function refuses a Send without a fresh token (build plan §3), like
// Color Belt's family page. This is the same code as src/register/turnstile.js (read that file
// for the details) with ONE difference: the action is 'form', which the forms Function checks.
// (Color Belt's file is not shared because it is fixed to its own action 'register'.)
// A token is asked for only when the family taps Submit: it can be used once and expires after
// 5 minutes. "explicit" rendering = Turnstile does nothing until we call it.
// Not used in preview mode (the page never calls this there).

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise = null; // the script is loaded once per page
let widgetId = null; // the current widget, removed before making a new one

// Loads Turnstile's script (allowed by the page's Content-Security-Policy, public/_headers).
function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
      script.onerror = () => {
        scriptPromise = null; // let the next Send try loading it again
        reject(new Error('turnstile'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

// Removes the current widget (when the family leaves the last step, or before a new Send).
export function removeTurnstile() {
  if (widgetId !== null && window.turnstile) {
    try {
      window.turnstile.remove(widgetId);
    } catch {
      // already gone
    }
  }
  widgetId = null;
}

// Gets a fresh one-time token. `container` is the empty box above Send where Turnstile may
// show its check. Resolves to the token, or rejects if the check can't run or fails (the page
// then shows "We couldn't check this browser…").
export async function getTurnstileToken(siteKey, container) {
  const turnstile = await loadScript();
  removeTurnstile();
  return new Promise((resolve, reject) => {
    widgetId = turnstile.render(container, {
      sitekey: siteKey,
      action: 'form', // the forms Function checks this matches
      appearance: 'interaction-only', // invisible unless Cloudflare needs a click
      execution: 'execute', // don't start until execute() below
      retry: 'never', // a failure is reported straight away; the next Send tries again
      'refresh-expired': 'never',
      callback: (token) => resolve(token),
      'error-callback': () => {
        reject(new Error('turnstile'));
        return true; // tells Turnstile we handled the error
      },
      'expired-callback': () => reject(new Error('turnstile')),
      'timeout-callback': () => reject(new Error('turnstile')),
      'unsupported-callback': () => reject(new Error('turnstile')),
    });
    turnstile.execute(widgetId);
  });
}
