// lineSave.js — the two small pieces every Camps page needs to use the page's line of saves
// (src/lib/saveLine.js; rulebook v1.125–v1.129, design review R2-05). Plain JavaScript with no
// React in it, so src/lib/camps/checks.mjs can run it in Node.
// Why it exists: before, CampPage.jsx, CampRowMenu.jsx and Camps.jsx each kept their own "one change
// at a time" flag (begin / end), and their own Undo that returned early while another save ran, so an
// Undo pressed during another save was dropped without a word. Now the page has one line
// (useSaveLine). These two helpers keep the pages from repeating the same careful code:
//
//   saveOnLine(line, call, { retry, onNotOk })
//       One save (or read) on the line. Takes the line's turn with line.begin() (false while
//       something else runs: the helper then does nothing and answers null, as the old begin() did),
//       runs call(), and ALWAYS ends the line exactly once, from a `finally`, even when call() throws
//       (a save that threw and never ended the line would make a waiting Undo wait forever).
//       retry = how to do this save again: the line uses it for the "Neither change saved" bar when
//       an Undo that waited for this save fails too (v1.127). onNotOk(status) runs after a save that
//       did not work (the pages clear the toast there, as the old end() did).
//       Answers call()'s own answer ({ status, … }), or null when the line was busy.
//
//   undoAnswer(result, words)
//       Turns the database's answer to an Undo into the answer the line wants from an Undo's run():
//       { status, reason? } (saveLine.js header). 'ok', 'no_access' and 'error' pass through (the line
//       says "Undo didn't save" for the last two, with Retry); 'not_allowed' says why in the page's
//       words; any other refusal (stale, not_found, invalid, refund_stands, …) says why too: the
//       reason the call named (result.undoText), else the refund sentence for 'refund_stands', else
//       "Someone else changed [Name] just now …". The pages do the side effects (reload, lock the
//       screen) themselves, because those need the page's own state.
//       words = { notAllowed, stale, refundStands?, general? }; general = the page's three general
//       sentences { error, notAllowed, stale } while Hide private details is on for a money Undo
//       (no amount, no Retry that would record money: noRetry).
//
//   reloadBounded(reload, ms = 4000)
//       The reload an Undo does after it saved ("the page shows what it shows inside run()"), but
//       bounded: it races the reload against a timer, never throws, and answers 'ok', 'error' or
//       'timeout'. An Undo's answer never depends on it. Without the bound, a reload that hangs would
//       hold the line until its 30-second give-up, and a saved Undo would then be reported as
//       "Undo didn't save". (A slow reload still finishes by itself and the page shows it then.)
export async function saveOnLine(line, call, { retry = null, onNotOk = null } = {}) {
  const token = line.begin();
  if (!token) return null;
  let status = 'error'; // if call() throws, the save counts as not reached
  try {
    const result = await call();
    status = result?.status ?? 'error';
    return result;
  } finally {
    line.end(status, { retry, token });
    if (status !== 'ok') onNotOk?.(status);
  }
}

export function undoAnswer(result, words) {
  const status = result?.status ?? 'error';
  const general = words.general ?? null;
  if (status === 'ok') return { status: 'ok' };
  // no_access while private details are hidden: no Retry on the line's bar either (a money Undo's
  // Retry could record money after the unlock).
  if (status === 'no_access') return general ? { status: 'no_access', noRetry: true } : { status: 'no_access' };
  if (general) {
    // Hide private details is on: the general words only, never a Retry (it could record money).
    if (status === 'error') return { status: 'error', reason: general.error, noRetry: true };
    if (status === 'not_allowed') return { status: 'not_allowed', reason: general.notAllowed };
    return { status, reason: general.stale };
  }
  if (status === 'error') return { status: 'error' };
  if (status === 'not_allowed') return { status: 'not_allowed', reason: words.notAllowed };
  return { status, reason: result.undoText ?? (status === 'refund_stands' && words.refundStands ? words.refundStands : words.stale) };
}

export async function reloadBounded(reload, ms = 4000) {
  let timer = 0;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve('timeout'), ms);
    });
    const result = await Promise.race([Promise.resolve().then(reload), timeout]);
    return result === 'timeout' ? 'timeout' : result ?? 'ok';
  } catch {
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}