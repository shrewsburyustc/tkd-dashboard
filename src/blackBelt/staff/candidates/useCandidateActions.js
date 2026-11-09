// useCandidateActions.js — the "brain" of the Candidates tab: which dialog is open, what is typed
// in it, and every call to the database (contract CONTRACT-0016-B2 §3).
// Why it exists: the dialogs only DRAW (they get `state` and call back). Their values live here,
// so a screen lock can hide a dialog and bring it back exactly as it was, and so one place turns
// the data layer's status CODES into the words of text.js (B returns codes, never words).
//
// What is open is one object, `dlg`:
//   dlg.detail   the candidate detail (Candidates 3), or null
//   dlg.child    a dialog opened from the detail or from a row (Record payment, Edit payment,
//                Undo payment, Record refund, Mark check returned, Change plan, Add candidate,
//                Delete permanently, Compare, View signature, Receipt), or null
// Only ONE of them is on screen at a time: while a child is open the detail waits behind the
// scenes and comes back (re-read from the database) when the child closes. Two dialogs on top of
// each other would fight over the browser's Back button (Dialog.jsx adds one history step each).
//
// Contract 0025 §14.5 (builder C3) adds: the Dan-change dialog (child 'danChange', v0.955 — Edit
// details answered has_grades, so nothing was saved yet; the red button calls
// updateCandidateClear with the counts it showed), the has-grades refusal of Delete permanently
// (v0.950), Restore's already_added (a second make-up of the same earlier candidate) and Edit
// details' already_added (OI-4: this candidate's make-up is on a later cycle).
//
// Design review BB4 (v0.966): no problem is a toast any more — refusals and failures go in the
// shared amber bar (report(): inside the open detail, else the Candidates tab's bar). BB5 (v0.967):
// Edit details and Restore get "· Undo" for 5 seconds (not a Dan change that cleared grades, and
// not a restored "Duplicate copy", R2-03). A saved Edit details closes the detail back to the
// roster, with focus on the candidate's row (v1.047 (21)); a refused save keeps it open.
// R4-11 / S-2 (v0.966 (1), v1.051): a lost connection while reading a candidate (the detail, a
// payment dialog's data, the compare, an admin's row ⋯) shows the bar with Retry, which repeats
// THAT read; the row ⋯ shows busy while it reads (`menuLoading`). A refusal has × only.
// Pass-1 shared-parts switch: every save and read goes through the shared save line (lib/saveLine.js,
// R2-05), so a toast's Undo pressed during another save WAITS ("Undoing…") and the line, not this file,
// says how it went; refusals and failures use the shared sentences (R2-07, via text.js); the payment toasts
// are the shared "marked paid" / "Payment undone" words (R1-07); a read that can't load always has Retry (S-2).
// BB15 / BB7 (v1.008 / v1.102): the compare, the duplicate box and the confirm boxes are the shared
// parts; this file only says which button is busy (`busyKind`) and keeps the state.
//
// Privacy (§3.1): the detail's date of birth, email and the signature live only inside `dlg`,
// which is emptied when the dialog closes. Nothing here writes them to storage, the console, a
// toast or the page address.
import { useLayoutEffect, useRef, useState } from 'react';
import {
  addCandidate,
  changePlan,
  deleteCandidate,
  editPayment,
  loadCandidate,
  loadSignature,
  markCheckReturned,
  recordPaperWaiver,
  recordPayment,
  recordRefund,
  resolveDuplicate,
  restoreCandidate,
  undoPayment,
  updateCandidate,
  updateCandidateClear,
  withdrawCandidate,
} from '../../../lib/blackBelt/api.js';
import { amountInputText } from '../../../lib/blackBelt/money.js';
import { useSaveLine } from '../../../lib/saveLine.js';
import { defaultTicks, sumRemaining, trimSpaces } from '../../../lib/blackBelt/rules.js';
import { normalizeName } from '../../../lib/testing/names.js';
import { addProblems, anyProblem, detailsProblems, editValuesToSave, isMoneyChild, paymentProblems, restoreHasUndo } from './checks.js';
import * as T from '../text.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Focus goes back to the button that opened a dialog once the dialog is gone. The page behind a
// dialog is "inert" (can't take focus) until the App hears that the dialog closed, which takes a
// few frames — so this waits, frame by frame (at most about half a second), until the button can
// take focus again.
const focusSoon = (element) => {
  let frames = 0;
  const attempt = () => {
    if (!element?.isConnected) return;
    if (element.closest('[inert]') && frames < 30) {
      frames += 1;
      window.requestAnimationFrame(attempt);
      return;
    }
    element.focus();
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(attempt));
};
// Focus goes to a candidate's ROW on the roster (not to a button): used after Edit details saves
// and closes. The row is looked up fresh on every frame, because the roster reloads after the save
// and may redraw (or move) the row; it waits for the row to exist and for the page to stop being
// inert, for about half a second at most.
const focusRowSoon = (candidateId) => {
  let frames = 0;
  const attempt = () => {
    const row = document.querySelector(`[data-nav-row="${CSS.escape(String(candidateId))}"]`);
    if ((!row || row.closest('[inert]')) && frames < 30) {
      frames += 1;
      window.requestAnimationFrame(attempt);
      return;
    }
    row?.focus();
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(attempt));
};
// The items of a payment in the plan's item order (the order the checklist shows them).
const inItemOrder = (codes, money) => {
  const order = (money?.items ?? []).map((x) => x.item);
  return [...codes].sort((a, b) => order.indexOf(a) - order.indexOf(b));
};

export function useCandidateActions({ cycle, isAdmin, today, paymentsHidden, deviceLocation, reloadRoster, onCandidatesChanged, showToast, clearToast, onNoAccess, onRefreshProfile, setBanner }) {
  const [dlg, setDlgState] = useState(null);
  const dlgRef = useRef(null);
  const setDlg = (next) => {
    const value = typeof next === 'function' ? next(dlgRef.current) : next;
    dlgRef.current = value;
    setDlgState(value);
  };
  // The newest props, for the async calls below (an answer may arrive after a re-render).
  const latest = useRef({});
  useLayoutEffect(() => {
    latest.current = { cycle, isAdmin, today, paymentsHidden, deviceLocation, reloadRoster, onCandidatesChanged, showToast, clearToast, onNoAccess, onRefreshProfile, setBanner };
  });

  // One write at a time (a double click must not record a payment twice), through the shared save line
  // (lib/saveLine.js, R2-05): a toast's Undo pressed while a save or a read runs WAITS its turn ("Undoing…")
  // and runs when that ends, instead of being dropped without a word. The Make-up picker uses the same
  // line (it gets `line` from here), so the whole Candidates tab has one.
  //   beginWrite()  true when this call got the line (it is false while a save or an Undo runs)
  //   endWrite(status, retry)  the save ended — exactly once per beginWrite. status: the answer's status
  //                 ('ok' or a failure); retry: how to do the same save again (kept for "Neither change saved").
  const saveLine = useSaveLine({ section: T.UNDO_SECTION, showToast: (text, options) => latest.current.showToast(text, options), undoBar });
  const tokenRef = useRef(null);
  function beginWrite() {
    const token = saveLine.begin();
    if (!token) return false;
    tokenRef.current = token; // only one save holds the line at a time, so one token is enough
    return true;
  }
  function endWrite(status = 'ok', retry = null) {
    saveLine.end(status, { retry, token: tokenRef.current });
  }
  // One save call on the line, always ended (C8): even if the call throws, the line is freed (as 'error')
  // in a finally, so a waiting Undo never waits forever. The throw itself still goes on up.
  //   call   the database call → { status, … }
  //   retry  how to do the same save again (kept for "Neither change saved", v1.127)
  async function saveCall(call, retry) {
    let result = { status: 'error' };
    try {
      result = await call();
    } finally {
      endWrite(result.status, retry);
    }
    return result;
  }
  const busy = saveLine.busy;

  // True while the amber bar on screen is the Retry of a MONEY opener's failed read (Record payment,
  // Record refund, Edit / Undo payment from a row's ⋯): it goes away when Hide private details turns on
  // (paymentsHiddenNow), so its Retry can never open a money dialog on a mat tablet (P1).
  const moneyBannerRef = useRef(false);

  // A money toast (payment recorded / undone / changed, refund, returned check, plan change, and the
  // Undo answers) is never shown while Hide private details is on: a save that was already in flight
  // may finish after the switch turned on (P2). The save itself still counts; only the words are held back.
  function showMoneyToast(text, options) {
    if (latest.current.paymentsHidden) return;
    latest.current.showToast(text, options);
  }

  const patchChild = (changes) =>
    setDlg((d) => (d?.child ? { ...d, child: { ...d.child, ...(typeof changes === 'function' ? changes(d.child) : changes) } } : d));
  const patchDetail = (changes) =>
    setDlg((d) => (d?.detail ? { ...d, detail: { ...d.detail, ...(typeof changes === 'function' ? changes(d.detail) : changes) } } : d));

  // After any saved change: the roster again (and the cycle's candidate count when it moved).
  // Returns the roster's reload, so a refusal can wait until the other person's change is shown.
  function afterWrite({ countChanged = false } = {}) {
    const reloaded = latest.current.reloadRoster();
    if (countChanged) latest.current.onCandidatesChanged();
    return reloaded;
  }

  // ----- Problems stay on screen (v0.966, BB4) -----
  // A refusal or a failure goes in the shared amber bar, never in a toast. Which bar:
  //   - while the candidate detail is open: the bar INSIDE the detail (dlg.detail.banner), so it is
  //     never hidden behind the dialog; it goes away with the detail
  //   - otherwise the Candidates tab's bar (setBanner, from the tab)
  // banner = { text, retry? } — retry only for a connection failure (a true refusal has only ×).
  // One bar at a time: a new problem replaces the old one.
  //   from     the props as they were when the action STARTED (latest.current then): the tab's
  //            bar setter belongs to the tab that was open, so an answer that arrives after a tab
  //            change is dropped instead of showing on the new tab (CyclePage.jsx).
  //   opener   the ⋯ the action came from: focus goes back to it (v0.966 review: never the page
  //            body). Inside an open detail, to the detail's ⋯ when that one is gone.
  function report(banner, { from = latest.current, opener = null } = {}) {
    moneyBannerRef.current = false; // a new bar replaces the old one (loadProblem marks a money one after this)
    if (dlgRef.current?.detail) {
      const inside = opener?.isConnected && opener.closest('[role="dialog"]');
      patchDetail({ banner, focusKey: inside ? null : 'detail-more' });
      if (inside) focusSoon(opener);
    } else {
      from.setBanner(banner);
      if (opener?.isConnected) focusSoon(opener);
    }
  }
  // The bar the save line (R2-05) shows when an Undo didn't work: "Undo didn't save. Check the connection,
  // then retry." with Retry, or "Couldn't undo: …" / "Someone else changed … Their change is shown." with ×
  // only. It goes the same way every other problem goes (report): inside the open detail, else the tab's
  // bar. bar = { text, retry, retrying, takeFocus } or null — null means an Undo worked: the bar goes, but only
  // if it is still the line's own, never another problem's.
  // C7: the line's bar carries its own mark (fromUndo), so "is it still the line's?" is read from the bar
  // that is on screen, not from a flag that could go stale when the person closes the bar with ×. S2: a bar
  // of a MONEY Undo also carries moneyUndo, so turning on Hide private details can remove it (paymentsHiddenNow).
  const lastUndoMoney = useRef(false); // whether the Undo that ran last was a money one (set by undoRun)
  function undoBar(bar) {
    const ours = (b) => Boolean(b?.fromUndo);
    if (!bar) {
      latest.current.setBanner((current) => (ours(current) ? null : current));
      if (ours(dlgRef.current?.detail?.banner)) patchDetail({ banner: null });
      return;
    }
    report({ text: bar.text, retry: bar.retry ?? undefined, retrying: bar.retrying, takeFocus: bar.takeFocus, fromUndo: true, moneyUndo: lastUndoMoney.current });
  }
  // × on the detail's bar: the bar goes and focus moves to the detail's ⋯ (the shared ErrorBanner
  // would leave it on the page body).
  function dismissDetailBanner() {
    patchDetail({ banner: null, focusKey: 'detail-more' });
  }

  // ----- Loading one candidate (the detail and every dialog that needs the money items) -----
  // → the detail's data { candidate, waiver, needsParentSignature, payments, money } or null
  // (the problem is already shown: lock screen or the amber bar).
  // retry: what the amber bar's Retry does — it repeats THIS read (v0.966 (1), R4-11, S-2: a read that
  // didn't load always has Retry in the bar, whatever the status was).
  function loadProblem(status, retry = null, { money = false } = {}) {
    const a = latest.current;
    if (status === 'no_access') a.onNoAccess();
    else if (status === 'not_found') {
      // "This candidate was deleted." goes in the Candidates tab's bar: the detail closes (v0.966).
      a.setBanner({ text: T.CANDIDATE_GONE });
      a.reloadRoster();
    } else {
      // S-2 (v1.051 (2)): the one shared sentence, always with Retry that repeats THIS read — a lost
      // connection and any other read that didn't answer ok (the old no-Retry "try again" line is gone here).
      report({ text: T.LOAD_FAILED, retry: retry ?? undefined });
      moneyBannerRef.current = money && Boolean(retry);
    }
  }
  async function fetchCandidate(candidateId) {
    const result = await loadCandidate({ candidateId });
    if (result.status !== 'ok') return { problem: result.status };
    const { status: _status, ...data } = result;
    return { data };
  }
  // Reads one candidate, then `use(data)`. A lost connection shows the bar with Retry, and Retry
  // repeats THIS read (`retry` — by default the same call again; the row ⋯ passes its own so the
  // ⋯ shows busy again while it reads).
  // money: true when use opens a money dialog (its Retry bar is cleared when the switch turns on).
  async function withCandidate(candidateId, use, { retry = () => withCandidate(candidateId, use, { money }), onSettled = null, money = false } = {}) {
    if (!beginWrite()) return; // another read or write is running: this call did not start, so it settles nothing
    let fetched = { problem: 'error' };
    try {
      fetched = await fetchCandidate(candidateId);
    } finally {
      endWrite();
    }
    const { data, problem } = fetched;
    onSettled?.();
    if (problem) {
      loadProblem(problem, retry, { money });
      return;
    }
    use(data);
  }
  // The roster row's ⋯ for an admin (v0.963): Edit payment and Undo payment act on the candidate's
  // LATEST payment, which the row doesn't carry — so the candidate is read first, exactly as the
  // detail is, and `use(data)` opens the menu with it. While it loads the tab is busy (a second
  // press does nothing); a problem is shown the usual way (lock screen or the amber bar) and no
  // menu opens. Nothing opens either if a dialog came up meanwhile.
  // Privacy (§3.1): the menu keeps only what Edit / Undo payment need — the name, version and
  // plan, the payment lines and the money — never the date of birth, the email or the waiver.
  // While it reads, `menuLoading` holds the candidate's id, so the row's ⋯ can show busy (R4-11);
  // after a lost connection the bar's Retry reads again, and the ⋯ shows busy again.
  const [menuLoading, setMenuLoading] = useState(null);
  function loadForMenu(candidateId, use) {
    const useData = (data) => {
      if (dlgRef.current) return;
      const c = data.candidate;
      use({
        candidate: { id: c.id, firstName: c.firstName, lastName: c.lastName, version: c.version, plan: c.plan ?? null, isMakeup: c.isMakeup === true },
        payments: data.payments ?? [],
        money: data.money,
      });
    };
    const run = () => {
      // Only a call that really starts the read shows the ⋯ busy and clears it again (C8): while
      // another read is running nothing starts, and that read's own end must not be cut short.
      if (saveLine.isBusy()) return;
      setMenuLoading(candidateId);
      return withCandidate(candidateId, useData, { retry: run, onSettled: () => setMenuLoading(null), money: true });
    };
    return run();
  }

  // ----- The detail (Candidates 3) -----
  // edit: true opens it straight in Edit details (the row ⋯ → Edit details).
  async function openDetail(candidateId, opener, { edit = false } = {}) {
    if (dlgRef.current) return;
    latest.current.clearToast();
    setDlg({ detail: { candidateId, status: 'loading', data: null, mode: 'view', edit: null, menu: null, opener }, child: null });
    await refreshDetail();
    if (edit && dlgRef.current?.detail?.data && !dlgRef.current.child) startEdit();
  }
  async function refreshDetail() {
    const d = dlgRef.current?.detail;
    if (!d) return;
    const { data, problem } = await fetchCandidate(d.candidateId);
    if (dlgRef.current?.detail?.candidateId !== d.candidateId) return; // closed or changed meanwhile
    if (problem === 'not_found') {
      closeAll();
      loadProblem('not_found');
      return;
    }
    if (problem === 'no_access') {
      latest.current.onNoAccess();
      return;
    }
    if (problem) {
      patchDetail((x) => (x.data ? {} : { status: 'error' })); // keep what is on screen
      return;
    }
    patchDetail({ status: 'ready', data });
  }
  function closeAll() {
    const d = dlgRef.current;
    setDlg(null);
    focusSoon(d?.detail?.opener ?? d?.child?.opener);
  }
  function requestCloseDetail() {
    const d = dlgRef.current?.detail;
    if (!d) return;
    if (d.mode === 'edit') {
      cancelEdit({ ask: true });
      return;
    }
    closeAll();
  }

  // ----- A child dialog -----
  function openChild(child, opener) {
    latest.current.clearToast();
    setDlg((d) => ({ detail: d?.detail ? { ...d.detail, menu: null } : null, child: { key: Date.now(), note: null, blocking: false, saving: false, failed: false, triedSave: false, opener, ...child, initial: child.values } }));
  }
  // Back to the detail (re-read: something may have changed) or, without one, to the list.
  // Focus goes back to the button that opened the child: on the list it is still on screen; in
  // the detail the buttons are drawn again, so the detail finds it by its data-focus-key
  // (CandidateDialog.jsx).
  function closeChild() {
    const d = dlgRef.current;
    if (!d) return;
    if (d.detail) {
      const focusKey = d.child?.opener?.dataset?.focusKey ?? null;
      setDlg({ detail: { ...d.detail, focusKey }, child: null });
      refreshDetail();
      return;
    }
    setDlg(null);
    focusSoon(d.child?.opener);
  }
  function clearFocusKey() {
    if (dlgRef.current?.detail?.focusKey) patchDetail({ focusKey: null });
  }

  // The device's Hide payments switch was just turned on (mat-side, OP-B7): nothing about money,
  // the date of birth or the email may stay on screen. Close every money dialog (Record / Edit /
  // Undo payment, refund, returned check, receipt, and Change plan or Kukkiwon — the plan is a
  // payment detail, v1.036), close a payment line's ⋯ and clear a money toast. Edit details STAYS
  // open (R4-04, v1.037, as Star's): its date of birth and email turn into the gray "Hidden on this
  // tablet" (CandidateDialog.jsx) and Save keeps their stored values (editValuesToSave). The
  // detail itself redraws with "Hidden on this tablet"; Compare and Add hide their parts themselves.
  // Also closed when the switch turns on: Add candidate and the Delete confirm.
  // (Not the signature: View signature now also shows for admins while hidden, M-04, v1.055 (c).)
  const CLOSE_ON_HIDE = ['add', 'deleteConfirm'];
  function paymentsHiddenNow() {
    const d = dlgRef.current;
    // (A money toast whose Undo is already running ("Undoing…") is NOT removed by clearToast: the shared toast
    // line keeps a busy toast. Dropping it needs App.jsx — see the report of review batch 4 / S1.)
    latest.current.clearToast();
    // The Retry bar of a failed money read goes too (P1): its Retry would reopen a money dialog.
    if (moneyBannerRef.current) {
      moneyBannerRef.current = false;
      latest.current.setBanner(null);
      if (d?.detail?.banner) patchDetail({ banner: null });
    }
    // S2: so does the failed-Undo bar of a MONEY Undo (its words are neutral now, but its Retry would run a
    // payment Undo on a mat tablet). Only the line's own money bar goes, never another problem's.
    latest.current.setBanner((current) => (current?.moneyUndo ? null : current));
    if (d?.detail?.banner?.moneyUndo) patchDetail({ banner: null });
    if (!d) return;
    if (d.child && isMoneyChild(d.child.kind)) {
      if (d.detail) {
        // (back to the detail's view, as before; a money dialog never opens over Edit details)
        setDlg({ detail: { ...d.detail, mode: 'view', edit: null, menu: null }, child: null });
        refreshDetail();
      } else {
        setDlg(null);
        focusSoon(d.child.opener);
      }
      return;
    }
    // The Add candidate form and the Delete permanently confirm must not stay on a mat tablet
    // either (an admin's View signature may, M-04): they close the way any child
    // closes (focus goes back to the button that opened them).
    if (d.child && CLOSE_ON_HIDE.includes(d.child.kind)) {
      closeChild();
      return;
    }
    // A payment line's ⋯ closes.
    if (d.detail && d.detail.menu?.kind === 'line') patchDetail({ menu: null });
    // Edit details STAYS open, but its date of birth and email now read gray and can't change, so
    // anything typed there goes back to the stored values — nothing is left looking pending.
    if (d.detail?.edit && !d.detail.edit.saving) {
      const e = d.detail.edit;
      patchDetail({ edit: { ...e, values: { ...e.values, dob: e.initial.dob, email: e.initial.email } } });
    }
  }

  // The screen locked: the signature picture is dropped at once (it is opened again on purpose,
  // never brought back by the unlock). The other dialogs wait hidden behind the lock screen.
  function screenLockedNow() {
    const d = dlgRef.current;
    if (d?.child?.kind === 'signature') setDlg({ detail: d.detail ? { ...d.detail, focusKey: 'detail-signature' } : null, child: null });
  }
  function requestCloseChild() {
    const c = dlgRef.current?.child;
    if (!c || c.saving) return;
    if (c.values && !same(c.values, c.initial) && !c.blocking) {
      patchChild({ note: T.UNSAVED, noteAt: Date.now() });
      return;
    }
    closeChild();
  }
  // Typing clears a note that doesn't block ("Unsaved changes…", "That didn't save…").
  function changeChild(changes) {
    patchChild((c) => (c.saving ? {} : { values: { ...c.values, ...changes }, note: c.blocking ? c.note : null, failed: false }));
  }

  // The statuses every save shares. Returns true when it was handled here.
  function commonProblem(status, name) {
    const a = latest.current;
    if (status === 'no_access') {
      patchChild({ saving: false });
      a.onNoAccess();
      return true;
    }
    if (status === 'not_allowed') {
      patchChild({ saving: false, note: T.NOT_ALLOWED, blocking: true });
      a.onRefreshProfile();
      return true;
    }
    if (status === 'stale') {
      patchChild({ saving: false, note: T.candidateStaleInDialog(name), blocking: true });
      return true;
    }
    if (status === 'not_found') {
      closeAll();
      loadProblem('not_found');
      return true;
    }
    if (status === 'error') {
      patchChild({ saving: false, failed: true });
      return true;
    }
    return false;
  }

  // A one-click action (Restore, Waiver signed on paper): its own small write on the save line. A lost
  // connection → the amber bar with Retry; a refusal → the amber bar with × only, shown once the
  // list (and the open detail) has been read again, so "Their change is shown" is true (v0.966).
  // (A toast's Undo is not run here any more: it goes through undoToast, so it waits its turn, R2-05.)
  // opener: the ⋯ a menu item came from (focus goes back there after a problem), or null.
  async function runQuick(call, { ok, statuses = {}, countChanged = false, opener = null }) {
    const a = latest.current;
    if (!beginWrite()) return;
    const result = await saveCall(() => call(), () => runQuick(call, { ok, statuses, countChanged, opener }));
    if (result.status === 'ok') {
      afterWrite({ countChanged });
      if (dlgRef.current?.detail) refreshDetail();
      ok?.(result);
      return;
    }
    if (result.status === 'no_access') {
      a.onNoAccess();
      return;
    }
    a.clearToast();
    if (result.status === 'error') {
      report({ text: T.ACTION_FAILED, retry: () => runQuick(call, { ok, statuses, countChanged, opener }) }, { from: a, opener });
      return;
    }
    if (result.status === 'not_found' && !statuses.not_found) {
      if (dlgRef.current?.detail) closeAll();
      loadProblem('not_found');
      return;
    }
    if (result.status === 'not_allowed') a.onRefreshProfile();
    const words = statuses[result.status] ?? (result.status === 'not_allowed' ? T.NOT_ALLOWED : T.INVALID);
    await Promise.all([afterWrite({ countChanged }), dlgRef.current?.detail ? refreshDetail() : null]);
    report({ text: words }, { from: a, opener });
  }
  // A toast's Undo (R2-05): it goes through the save line, so pressed while another save or read runs it
  // WAITS its turn (the toast says "Undoing…") and runs when that ends. The line, not this file, then says
  // how it went: "Undone" when it worked, "Undo didn't save. Check the connection, then retry." with Retry
  // when the connection failed, and a refusal's own words (below) with × only.
  //   words    the toast's own words — the line names them if the person has left the page meanwhile
  //   call     the database call that undoes it → { status, … }
  //   statuses what to say for each refusal status (a "Couldn't undo: …" reason or "Someone else changed …")
  // Returns the toast's options: { icon: false, action }.
  //   money    true for a payment, refund, returned-check or plan Undo: its failed-Undo bar is removed when Hide
  //            private details turns on (S2). The `words` of a money Undo never hold an amount (S4): the line shows
  //            them on any page, after the person left (text.js paymentUndoWords and its siblings).
  function undoToast(words, call, { statuses = {}, countChanged = false, money = false } = {}) {
    return { icon: false, action: saveLine.undoAction(undoRun(call, { statuses, countChanged, money }), { words }) };
  }
  // What the line runs for an Undo: the call, then the roster (and the open detail) read again, and a
  // { status, reason } answer for the line. A refusal is shown once the list has been read again, so
  // "Their change is shown" is true.
  function undoRun(call, { statuses, countChanged, money = false }) {
    return async () => {
      const a = latest.current;
      lastUndoMoney.current = money; // the bar the line may show for this Undo is a money bar (undoBar)
      const result = await call();
      if (result.status === 'ok') {
        afterWrite({ countChanged });
        if (dlgRef.current?.detail) refreshDetail();
        return { status: 'ok' };
      }
      if (result.status === 'no_access') {
        a.onNoAccess();
        return { status: 'no_access' };
      }
      if (result.status === 'error') return { status: 'error' };
      if (result.status === 'not_found' && !statuses.not_found) {
        // The candidate is gone: "This candidate was deleted." (the tab's bar), nothing more to say here
        if (dlgRef.current?.detail) closeAll();
        loadProblem('not_found');
        return { status: 'not_found' };
      }
      if (result.status === 'not_allowed') a.onRefreshProfile();
      // S3: an Undo queued before Hide private details turned on must not say WHY it was refused ("a payment is
      // recorded", "has payment records", "already undone"): that tells paid from unpaid on a mat tablet.
      const reason = latest.current.paymentsHidden
        ? T.UNDO_AT_DESK
        : (statuses[result.status] ?? (result.status === 'not_allowed' ? T.undoWhy.notAllowed : T.undoWhy.invalid));
      await Promise.all([afterWrite({ countChanged }), dlgRef.current?.detail ? refreshDetail() : null]);
      return { status: result.status, reason };
    };
  }

  // ===== Record payment (Candidates 4) =====
  function paymentValues(money, method = null) {
    const ticks = defaultTicks(money, latest.current.today);
    const cents = sumRemaining(money, ticks);
    return { ticks, amount: cents > 0 ? amountInputText(cents) : '', amountTyped: false, method, note: '' };
  }
  function openRecordPayment(candidateId, opener) {
    if (latest.current.paymentsHidden) return; // money waits for the desk (also after a failed read's Retry)
    const from = dlgRef.current?.detail?.data;
    const start = (data) => !latest.current.paymentsHidden && openChild({ kind: 'record', candidateId, data, version: data.candidate.version, values: paymentValues(data.money) }, opener);
    if (from && dlgRef.current.detail.candidateId === candidateId) start(from);
    else withCandidate(candidateId, start, { money: true });
  }
  // A tick changes: the Amount follows the ticked items until someone types in it (OP-B6).
  function setTicks(ticks) {
    patchChild((c) => {
      if (c.saving) return {};
      const values = { ...c.values, ticks };
      if (!c.values.amountTyped) {
        const cents = sumRemaining(c.data.money, ticks);
        values.amount = cents > 0 ? amountInputText(cents) : '';
      }
      return { values, note: c.blocking ? c.note : null, failed: false };
    });
  }
  async function saveRecordPayment({ another = false } = {}) {
    const c = dlgRef.current?.child;
    if (!c || c.saving || c.blocking) return;
    const { problems, cents } = paymentProblems(c.values);
    if (anyProblem(problems)) {
      patchChild({ triedSave: true });
      return;
    }
    if (!beginWrite()) return;
    patchChild({ saving: true, failed: false, note: null });
    const name = T.candidateName(c.data.candidate);
    const result = await saveCall(() => recordPayment({
      candidateId: c.candidateId,
      expectedVersion: c.version,
      amountCents: cents,
      method: c.values.method,
      forItems: inItemOrder(c.values.ticks, c.data.money),
      note: trimSpaces(c.values.note),
      school: latest.current.deviceLocation, // the desk's school (R1-01); unknown → nothing sent
    }), () => saveRecordPayment({ another }));
    if (result.status === 'ok') {
      afterWrite();
      const paymentId = result.paymentId;
      // R1-07: "Sam Lee marked paid · $330 cash" (the shared words); none while hidden (showMoneyToast)
      const words = T.toastPaymentRecorded(cents, c.values.method, name);
      showMoneyToast(words, undoToast(T.paymentUndoWords(name), () => undoPayment({ paymentId }), { money: true, statuses: { not_allowed: T.undoWhy.tooLate, stale: T.undoWhy.paymentGone, invalid: T.undoWhy.invalid } }));
      if (another) {
        // The dialog stays with the answer's money: the next unpaid item ticked, its amount, the
        // method kept, the note cleared, the new version.
        const data = { ...c.data, money: result.money, candidate: { ...c.data.candidate, version: result.version } };
        const values = paymentValues(result.money, c.values.method);
        patchChild({ saving: false, data, version: result.version, values, initial: values, triedSave: false, key: Date.now() });
      } else {
        patchChild({ saving: false });
        closeChild();
      }
      return;
    }
    if (result.status === 'withdrawn') {
      patchChild({ saving: false, note: T.withdrawnNoPayment(name), blocking: true });
      return;
    }
    if (commonProblem(result.status, name)) return;
    patchChild({ saving: false, note: T.INVALID });
  }

  // ===== Admin payment actions (Candidates 5) =====
  // Only the line's items the plan still has are ticked (the plan may have changed since it was
  // recorded — e.g. Kukkiwon taken off). When none is left, nothing is ticked and the dialog says
  // why ("This payment was for an item no longer in the plan.") with "Tick what this payment is
  // for." under the list.
  const stillInPlan = (codes, money) => {
    const known = new Set((money?.items ?? []).map((x) => x.item));
    return (codes ?? []).filter((code) => known.has(code));
  };
  // Which candidate's data a payment dialog uses: the open detail's when it is the same candidate
  // (a payment line's ⋯), else the data the roster row's ⋯ just read (loadForMenu) — as openRefund.
  function paymentData(loaded) {
    const d = dlgRef.current?.detail;
    if (d?.data && (!loaded || d.candidateId === loaded.candidate.id)) return d.data;
    return loaded ?? null;
  }
  // loaded: from the roster row's ⋯ only (its line is the candidate's latest payment, v0.963)
  function openEditPayment(line, opener, loaded = null) {
    if (latest.current.paymentsHidden) return;
    const data = paymentData(loaded);
    if (!data) return;
    const ticks = stillInPlan(line.forItems, data.money);
    const values = { ticks, amount: amountInputText(line.amountCents), amountTyped: true, method: line.method, note: line.note ?? '', reason: '' };
    openChild({ kind: 'editPayment', candidateId: data.candidate.id, data, line, values, itemGone: ticks.length === 0 }, opener);
  }
  async function saveEditPayment() {
    const c = dlgRef.current?.child;
    if (!c || c.saving || c.blocking) return;
    const { problems, cents } = paymentProblems(c.values, { needReason: true });
    if (anyProblem(problems)) {
      patchChild({ triedSave: true });
      return;
    }
    if (!beginWrite()) return;
    patchChild({ saving: true, failed: false, note: null });
    const name = T.candidateName(c.data.candidate);
    const old = c.line;
    // The toast's Undo puts the old values back — with the old items the plan still has (else the
    // items just saved), so the undo is never refused for an item that no longer exists.
    const oldTicks = stillInPlan(old.forItems, c.data.money);
    const undoTicks = oldTicks.length > 0 ? inItemOrder(oldTicks, c.data.money) : inItemOrder(c.values.ticks, c.data.money);
    const result = await saveCall(() => editPayment({
      paymentId: old.id,
      amountCents: cents,
      method: c.values.method,
      forItems: inItemOrder(c.values.ticks, c.data.money),
      note: trimSpaces(c.values.note),
      reason: trimSpaces(c.values.reason),
    }), () => saveEditPayment());
    if (result.status === 'ok') {
      afterWrite();
      const newId = result.paymentId;
      showMoneyToast(
        T.TOAST_PAYMENT_CHANGED,
        undoToast(T.paymentUndoWords(name), () => editPayment({ paymentId: newId, amountCents: old.amountCents, method: old.method, forItems: undoTicks, note: old.note ?? '', reason: T.UNDO_EDIT_REASON }), {
          money: true,
          statuses: { stale: T.undoWhy.paymentGone },
        }),
      );
      patchChild({ saving: false });
      closeChild();
      return;
    }
    if (result.status === 'withdrawn') {
      patchChild({ saving: false, note: T.withdrawnNoPayment(name), blocking: true });
      return;
    }
    if (result.status === 'stale') {
      patchChild({ saving: false, note: T.PAYMENT_GONE, blocking: true });
      return;
    }
    if (commonProblem(result.status, name)) return;
    patchChild({ saving: false, note: T.INVALID });
  }

  // OP-B1: a short confirmation, then a toast WITHOUT Undo (an undo can't be undone).
  // loaded: from the roster row's ⋯ only (as openEditPayment)
  function openUndoPayment(line, what, opener, loaded = null) {
    if (latest.current.paymentsHidden) return;
    const data = paymentData(loaded);
    if (!data) return;
    openChild({ kind: 'undo', candidateId: data.candidate.id, data, line, what, values: null }, opener);
  }
  async function confirmUndoPayment() {
    const c = dlgRef.current?.child;
    if (!c || c.saving || c.blocking) return;
    if (!beginWrite()) return;
    patchChild({ saving: true, failed: false, note: null });
    const name = T.candidateName(c.data.candidate);
    const payment = c.line;
    const result = await saveCall(() => undoPayment({ paymentId: payment.id }), () => confirmUndoPayment());
    if (result.status === 'ok') {
      afterWrite();
      const cents = Math.abs(payment.amountCents);
      const text =
        payment.kind === 'refund'
          ? T.toastRefundUndone(cents, name)
          : payment.kind === 'returned'
            ? T.toastReturnedUndone(cents, name)
            : T.toastPaymentUndone(name); // R1-07: "Payment undone for Sam Lee" (the shared words)
      showMoneyToast(text, { icon: false });
      patchChild({ saving: false });
      closeChild();
      return;
    }
    if (result.status === 'stale') {
      patchChild({ saving: false, note: T.PAYMENT_GONE, blocking: true });
      return;
    }
    if (result.status === 'invalid') {
      patchChild({ saving: false, note: payment.returned ? T.RETURNED_FIRST : payment.kind === 'payment' ? T.UNDO_NET_FLOOR : T.INVALID, blocking: true });
      return;
    }
    if (commonProblem(result.status, name)) return;
    patchChild({ saving: false, note: T.INVALID });
  }

  function openRefund(candidateId, opener) {
    if (latest.current.paymentsHidden) return;
    const start = (data) => {
      if (latest.current.paymentsHidden) return;
      const over = data.money?.overpaidCents ?? 0;
      openChild({ kind: 'refund', candidateId, data, version: data.candidate.version, values: { amount: over > 0 ? amountInputText(over) : '', method: null, note: '' } }, opener);
    };
    const from = dlgRef.current?.detail;
    if (from?.data && from.candidateId === candidateId) start(from.data);
    else withCandidate(candidateId, start, { money: true });
  }
  async function saveRefund() {
    const c = dlgRef.current?.child;
    if (!c || c.saving || c.blocking) return;
    const paid = c.data.money?.paidCents ?? 0;
    const { problems, cents } = paymentProblems(c.values, { needTicks: false, maxCents: paid });
    if (anyProblem(problems)) {
      patchChild({ triedSave: true });
      return;
    }
    if (!beginWrite()) return;
    patchChild({ saving: true, failed: false, note: null });
    const name = T.candidateName(c.data.candidate);
    const result = await saveCall(() => recordRefund({ candidateId: c.candidateId, expectedVersion: c.version, amountCents: cents, method: c.values.method, note: trimSpaces(c.values.note), school: latest.current.deviceLocation }), () => saveRefund());
    if (result.status === 'ok') {
      afterWrite();
      const refundId = result.paymentId;
      const words = T.toastRefund(cents, name);
      showMoneyToast(words, undoToast(T.refundUndoWords(name), () => undoPayment({ paymentId: refundId }), { money: true, statuses: { stale: T.undoWhy.paymentGone } }));
      patchChild({ saving: false });
      closeChild();
      return;
    }
    if (result.status === 'refund_too_large') {
      patchChild({ saving: false, note: T.refundTooLarge(result.paidCents ?? paid), blocking: false });
      return;
    }
    if (commonProblem(result.status, name)) return;
    patchChild({ saving: false, note: T.INVALID });
  }

  function openReturned(line, what, opener) {
    if (latest.current.paymentsHidden) return;
    const d = dlgRef.current?.detail;
    if (!d?.data) return;
    openChild({ kind: 'returned', candidateId: d.candidateId, data: d.data, line, what, values: { note: '' } }, opener);
  }
  async function saveReturned() {
    const c = dlgRef.current?.child;
    if (!c || c.saving || c.blocking) return;
    if (paymentProblems({ ...c.values, amount: '1', method: 'check' }, { needTicks: false }).problems.note) {
      patchChild({ triedSave: true });
      return;
    }
    if (!beginWrite()) return;
    patchChild({ saving: true, failed: false, note: null });
    const name = T.candidateName(c.data.candidate);
    const cents = c.line.amountCents;
    const result = await saveCall(() => markCheckReturned({ paymentId: c.line.id, note: trimSpaces(c.values.note) }), () => saveReturned());
    if (result.status === 'ok') {
      afterWrite();
      const returnedId = result.paymentId;
      const words = T.toastReturned(cents, name);
      showMoneyToast(words, undoToast(T.returnedUndoWords(name), () => undoPayment({ paymentId: returnedId }), { money: true, statuses: { stale: T.undoWhy.paymentGone } }));
      patchChild({ saving: false });
      closeChild();
      return;
    }
    if (result.status === 'stale') {
      patchChild({ saving: false, note: T.RETURNED_TWICE, blocking: true });
      return;
    }
    if (result.status === 'invalid') {
      patchChild({ saving: false, note: T.NOT_A_CHECK, blocking: true });
      return;
    }
    if (commonProblem(result.status, name)) return;
    patchChild({ saving: false, note: T.INVALID });
  }

  // ===== Change plan or Kukkiwon (Candidates 6) =====
  function openChangePlan(candidateId, opener) {
    // Hide private details on: the plan is desk-only (v1.036) — the ⋯ items are grayed, and this
    // never opens (also when the switch turned on while the candidate was being read).
    if (latest.current.paymentsHidden) return;
    const start = (data) =>
      !latest.current.paymentsHidden &&
      openChild({ kind: 'plan', candidateId, data, version: data.candidate.version, values: { planId: data.candidate.cyclePlanId, kukkiwon: data.candidate.kukkiwon === true } }, opener);
    const from = dlgRef.current?.detail;
    if (from?.data && from.candidateId === candidateId) start(from.data);
    else withCandidate(candidateId, start, { money: true });
  }
  async function saveChangePlan() {
    const c = dlgRef.current?.child;
    if (!c || c.saving || c.blocking) return;
    if (same(c.values, c.initial)) {
      closeChild();
      return;
    }
    if (!beginWrite()) return;
    patchChild({ saving: true, failed: false, note: null });
    const name = T.candidateName(c.data.candidate);
    const candidateId = c.candidateId;
    const old = c.initial;
    const result = await saveCall(() => changePlan({ candidateId, expectedVersion: c.version, planId: c.values.planId, kukkiwon: c.values.kukkiwon }), () => saveChangePlan());
    if (result.status === 'ok') {
      afterWrite();
      const version = result.version;
      const words = T.toastPlanChanged(name);
      showMoneyToast(
        words,
        undoToast(T.planUndoWords(name), () => changePlan({ candidateId, expectedVersion: version, planId: old.planId, kukkiwon: old.kukkiwon }), {
          money: true,
          statuses: { stale: T.candidateStale(name), not_allowed: T.undoWhy.planPaid, withdrawn: T.undoWhy.planWithdrawn(name) },
        }),
      );
      patchChild({ saving: false });
      closeChild();
      return;
    }
    if (result.status === 'not_allowed') {
      patchChild({ saving: false, note: T.PAYMENT_RECORDED_ASK_ADMIN, blocking: true });
      latest.current.onRefreshProfile();
      return;
    }
    if (result.status === 'withdrawn') {
      patchChild({ saving: false, note: T.planWithdrawn(name), blocking: true });
      return;
    }
    if (result.status === 'invalid') {
      patchChild({ saving: false, note: c.data.candidate.dateOfBirth === null ? T.PLAN_PURGED : T.INVALID, blocking: c.data.candidate.dateOfBirth === null });
      return;
    }
    if (commonProblem(result.status, name)) return;
    patchChild({ saving: false, note: T.INVALID });
  }

  // ===== Add candidate (Candidates 7) =====
  function openAdd(opener, schoolCode) {
    // Hide private details on: New candidate waits for the desk (grayed in the Add candidate menu)
    if (dlgRef.current || latest.current.paymentsHidden) return;
    const values = { school: schoolCode ?? null, first: '', last: '', dob: '', dan: null, kukkiwon: false, planId: null, email: '', paperWaiver: false };
    openChild({ kind: 'add', values, touched: {} }, opener);
  }
  async function saveAdd() {
    const c = dlgRef.current?.child;
    if (!c || c.saving || c.blocking) return;
    const a = latest.current;
    const v = c.values;
    const problems = addProblems(v, { today: a.today, planIds: (a.cycle?.plans ?? []).map((p) => p.id) });
    if (anyProblem(problems)) {
      patchChild({ triedSave: true });
      return;
    }
    if (!beginWrite()) return;
    patchChild({ saving: true, failed: false, note: null });
    const name = `${normalizeName(v.first)} ${normalizeName(v.last)}`;
    const result = await saveCall(() => addCandidate({
      cycleId: a.cycle.id,
      first: v.first,
      last: v.last,
      dateOfBirth: v.dob,
      email: trimSpaces(v.email),
      locationCode: v.school,
      dan: Number(v.dan),
      planId: v.planId,
      kukkiwon: v.kukkiwon === true,
      paperWaiver: true,
    }), () => saveAdd());
    if (result.status === 'ok') {
      afterWrite({ countChanged: true });
      const { id, version, reference } = result;
      // OP-B2: admins get Undo (= Delete permanently; nothing is paid yet). Staff don't, unless
      // Jeffrey decides otherwise (text.js ADD_UNDO_FOR_STAFF).
      const canUndo = a.isAdmin || T.ADD_UNDO_FOR_STAFF;
      const words = T.toastAdded(name, reference);
      a.showToast(
        words,
        canUndo
          ? undoToast(words, () => deleteCandidate({ candidateId: id, expectedVersion: version }), {
              countChanged: true,
              statuses: { stale: T.candidateStale(name), has_payments: T.undoWhy.hasPayments(name), has_grades: T.undoWhy.hasGrades(name) },
            })
          : { icon: false },
      );
      patchChild({ saving: false });
      closeChild();
      return;
    }
    if (result.status === 'finished') {
      patchChild({ saving: false, note: T.CANDIDATE_FINISHED, blocking: true });
      return;
    }
    if (result.status === 'not_found') {
      patchChild({ saving: false, note: T.CYCLE_DELETED, blocking: true });
      return;
    }
    if (commonProblem(result.status, name)) return;
    patchChild({ saving: false, note: T.INVALID });
  }

  // ===== Edit details (inside the detail, Star v0.112) =====
  function startEdit() {
    const d = dlgRef.current?.detail;
    // Hide private details on (R4-04, v1.037): Edit details opens too; the date of birth and email
    // read "Hidden on this tablet" and Save keeps their stored values (editValuesToSave).
    if (!d?.data) return;
    const c = d.data.candidate;
    const values = { first: c.firstName, last: c.lastName, dob: c.dateOfBirth ?? '', email: c.emailForResults ?? '', school: c.locationCode, dan: c.dan };
    patchDetail({ mode: 'edit', menu: null, edit: { values, initial: values, triedSave: false, note: null, blocking: false, saving: false, failed: false, version: c.version } });
  }
  function changeEdit(changes) {
    patchDetail((d) => (d.edit?.saving ? {} : { edit: { ...d.edit, values: { ...d.edit.values, ...changes }, note: d.edit.blocking ? d.edit.note : null, failed: false } }));
  }
  function cancelEdit({ ask = false } = {}) {
    const d = dlgRef.current?.detail;
    if (!d?.edit || d.edit.saving) return;
    // Compare what Save WOULD send (a locked Dan or a reset date of birth/email isn't a change).
    const wouldSave = editValuesToSave(d.edit.values, d.edit.initial, { hidden: latest.current.paymentsHidden, isAdmin: latest.current.isAdmin });
    if (ask && !same(wouldSave, d.edit.initial) && !d.edit.blocking) {
      patchDetail({ edit: { ...d.edit, note: T.UNSAVED, noteAt: Date.now() } });
      return;
    }
    patchDetail({ mode: 'view', edit: null });
  }
  async function saveEdit() {
    const d = dlgRef.current?.detail;
    const e = d?.edit;
    if (!e || e.saving || e.blocking) return;
    const c = d.data.candidate;
    const purged = c.dateOfBirth === null;
    // Hide private details on: the stored date of birth and email (and, for staff, the stored Dan)
    // go back unchanged — the fields can't be seen or changed (editValuesToSave, checks.js).
    const hiddenNow = latest.current.paymentsHidden;
    const v = editValuesToSave(e.values, e.initial, { hidden: hiddenNow, isAdmin: latest.current.isAdmin });
    // (while hidden the stored date of birth and email aren't checked here — no error can show
    // under a field that can't be seen; the database still checks them)
    const problems = detailsProblems(v, { today: latest.current.today, purged: purged || hiddenNow });
    if (anyProblem(problems)) {
      patchDetail({ edit: { ...e, triedSave: true } });
      return;
    }
    if (same(v, e.initial)) {
      patchDetail({ mode: 'view', edit: null });
      return;
    }
    if (!beginWrite()) return;
    patchDetail({ edit: { ...e, saving: true, failed: false, note: null } });
    const name = T.candidateName(c);
    const result = await saveCall(() => updateCandidate({
      candidateId: c.id,
      expectedVersion: e.version,
      first: v.first,
      last: v.last,
      dateOfBirth: purged ? null : v.dob,
      email: purged ? null : trimSpaces(v.email),
      locationCode: v.school,
      dan: Number(v.dan),
    }), () => saveEdit());
    const setEdit = (changes) => patchDetail((x) => (x.edit ? { edit: { ...x.edit, ...changes } } : {}));
    if (result.status === 'ok') {
      afterWrite();
      // BB5 (v0.967): "Changes saved · Undo" for 5 seconds. Undo saves the values from before
      // back, with the version this save returned (someone else's change since → stale, refused
      // in the amber bar). It never opens the Dan-change box: if grades were entered for the new
      // Dan meanwhile the database answers has_grades and the bar says so.
      const old = e.initial;
      const savedName = T.candidateName({ firstName: normalizeName(e.values.first), lastName: normalizeName(e.values.last) });
      const candidateId = c.id;
      const newVersion = result.version;
      latest.current.showToast(
        T.TOAST_CHANGES_SAVED,
        undoToast(
          T.TOAST_CHANGES_SAVED,
          () =>
            updateCandidate({
              candidateId,
              expectedVersion: newVersion,
              first: old.first,
              last: old.last,
              dateOfBirth: purged ? null : old.dob,
              email: purged ? null : trimSpaces(old.email),
              locationCode: old.school,
              dan: Number(old.dan),
            }),
          {
            statuses: {
              stale: T.candidateStale(savedName),
              has_grades: T.undoWhy.danHasGrades(savedName),
              already_added: T.undoWhy.makeupLater(savedName),
              not_allowed: T.undoWhy.danLockedStaff,
            },
          },
        ),
      );
      // A save that worked closes the detail back to the roster, as Star and Camps do (v1.047
      // (21)); focus goes to the candidate's row, and the toast with its Undo stays. A refused
      // save (below) keeps the detail open.
      setDlg(null);
      focusRowSoon(candidateId);
      return;
    }
    if (result.status === 'no_access') {
      setEdit({ saving: false });
      latest.current.onNoAccess();
      return;
    }
    if (result.status === 'not_allowed') {
      setEdit({ saving: false, note: T.DAN_LOCKED_STAFF, blocking: true });
      latest.current.onRefreshProfile();
      return;
    }
    // 0025 (Q-G4): the old Dan has grades — nothing was saved; ask first (DanChangeDialog).
    if (result.status === 'has_grades') {
      setEdit({ saving: false });
      openDanChange(result, v);
      return;
    }
    // 0025 (OI-4): a make-up of this candidate is already on a later cycle
    if (result.status === 'already_added') {
      setEdit({ saving: false, note: T.danChangeMakeupLater(name), blocking: true });
      return;
    }
    if (result.status === 'stale') {
      setEdit({ saving: false, note: T.candidateStaleInDialog(name), blocking: true });
      return;
    }
    if (result.status === 'not_found') {
      closeAll();
      loadProblem('not_found');
      return;
    }
    if (result.status === 'error') {
      setEdit({ saving: false, failed: true });
      return;
    }
    setEdit({ saving: false, note: T.INVALID });
  }

  // ===== The Dan-change dialog (0025 Q-G4, v0.955, mockup DC 1–5) =====
  // counts = { gradeCount, countCount, chosenCount } from the has_grades answer. It opens from Edit
  // details (which waits behind it with what was typed): Cancel goes back there, nothing saved.
  // values = what Save sent (editValuesToSave: the stored date of birth and email while hidden).
  function openDanChange(counts, values) {
    const d = dlgRef.current?.detail;
    if (!d?.edit) return;
    const shown = { gradeCount: counts.gradeCount ?? 0, countCount: counts.countCount ?? 0, chosenCount: counts.chosenCount ?? 0 };
    const opener = document.querySelector('[data-edit-save]');
    const sent = values ?? d.edit.values;
    openChild({ kind: 'danChange', candidate: d.data.candidate, editValues: sent, oldDan: d.edit.initial.dan, newDan: Number(sent.dan), counts: shown, values: null }, opener);
  }
  async function confirmDanChange() {
    const c = dlgRef.current?.child;
    const d = dlgRef.current?.detail;
    if (!c || c.kind !== 'danChange' || c.saving || c.blocking || !d?.edit) return;
    if (!beginWrite()) return;
    patchChild({ saving: true, failed: false, note: null });
    const cand = c.candidate;
    const v = c.editValues;
    const purged = cand.dateOfBirth === null;
    const name = T.candidateName(cand);
    const result = await saveCall(() => updateCandidateClear({
      candidateId: cand.id,
      expectedVersion: d.edit.version,
      first: v.first,
      last: v.last,
      dateOfBirth: purged ? null : v.dob,
      email: purged ? null : trimSpaces(v.email),
      locationCode: v.school,
      dan: Number(v.dan),
      expectedGradeCount: c.counts.gradeCount,
      expectedCountCount: c.counts.countCount,
      expectedChosenCount: c.counts.chosenCount,
    }), () => confirmDanChange());
    if (result.status === 'ok') {
      afterWrite();
      latest.current.showToast(T.TOAST_CHANGES_SAVED, { icon: false });
      // The Dan change is Edit details saved too: the detail closes back to the roster with focus
      // on the candidate's row, as after a plain save (v1.047 (21)).
      setDlg(null);
      focusRowSoon(cand.id);
      return;
    }
    // DC 5: someone graded meanwhile — the question stays open with the NEW counts
    if (result.status === 'has_grades') {
      patchChild({ saving: false, counts: { gradeCount: result.gradeCount ?? 0, countCount: result.countCount ?? 0, chosenCount: result.chosenCount ?? 0 }, note: T.gradesChanged(name) });
      return;
    }
    if (result.status === 'already_added') {
      patchChild({ saving: false, note: T.danChangeMakeupLater(name), blocking: true });
      return;
    }
    if (result.status === 'not_allowed') {
      patchChild({ saving: false, note: T.DAN_LOCKED_STAFF, blocking: true });
      latest.current.onRefreshProfile();
      return;
    }
    if (commonProblem(result.status, name)) return;
    patchChild({ saving: false, note: T.INVALID });
  }

  // The amber "needs a parent's signature" box → "Waiver signed on paper" (no Undo: rows stay).
  async function savePaperWaiver() {
    const d = dlgRef.current?.detail;
    if (!d?.data) return;
    const c = d.data.candidate;
    await runQuick(() => recordPaperWaiver({ candidateId: c.id, expectedVersion: c.version }), {
      ok: () => latest.current.showToast(T.TOAST_PAPER_WAIVER, { icon: false }),
      statuses: { finished: T.PAPER_WAIVER_FINISHED, stale: T.candidateStale(T.candidateName(c)), invalid: T.PURGED_INVALID },
    });
  }

  // ===== Withdraw / Delete permanently / Restore (v0.113; v1.007 / v0.963) =====
  // target: { id, firstName, lastName, version, hasPaymentRows, hasGrades }
  // Withdraw is a menu item (the row's ⋯ or the detail's ⋯) that acts AT ONCE — no box first —
  // with "Alex Kim withdrawn · Undo" (Undo = Restore). No dialog is open to hold a note, so a
  // lost connection shows the amber bar with Retry and any other problem the bar with × (as runQuick).
  // opener: the ⋯ that was used; focus goes back to it when it is still on screen.
  async function withdraw(target, opener = null) {
    const a = latest.current;
    if (!beginWrite()) return;
    const name = T.candidateName(target);
    const result = await saveCall(() => withdrawCandidate({ candidateId: target.id, expectedVersion: target.version }), () => withdraw(target, opener));
    const inDetail = Boolean(dlgRef.current?.detail);
    if (result.status === 'ok' || result.status === 'withdrawn') {
      afterWrite({ countChanged: true });
      const version = result.version;
      const words = T.toastWithdrawn(name);
      a.showToast(
        words,
        result.status === 'ok'
          ? undoToast(words, () => restoreCandidate({ candidateId: target.id, expectedVersion: version }), {
              countChanged: true,
              statuses: { stale: T.candidateStale(name), already_added: T.undoWhy.alreadyAdded(name) },
            })
          : { icon: false },
      );
      if (inDetail) {
        patchDetail({ focusKey: 'detail-more' }); // back to the detail's ⋯ (its data-focus-key)
        refreshDetail();
      } else focusSoon(opener);
      return;
    }
    if (result.status === 'no_access') {
      a.onNoAccess();
      return;
    }
    a.clearToast();
    // Problems go in the amber bar — inside the detail when it is open (v0.966), never behind it.
    if (result.status === 'error') {
      report({ text: T.ACTION_FAILED, retry: () => withdraw(target, opener) }, { from: a, opener });
      return;
    }
    if (result.status === 'not_found') {
      if (inDetail) closeAll();
      loadProblem('not_found');
      return;
    }
    if (result.status === 'not_allowed') a.onRefreshProfile();
    const words = result.status === 'not_allowed' ? T.NOT_ALLOWED : result.status === 'stale' ? T.candidateStale(name) : T.INVALID;
    // read again first, so "Their change is shown" is true when the bar appears
    await Promise.all([afterWrite(), inDetail ? refreshDetail() : null]);
    report({ text: words }, { from: a, opener });
  }
  function openDelete(target, opener) {
    if (latest.current.paymentsHidden) return; // Hide private details on: delete at the desk (grayed in every ⋯)
    openChild({ kind: 'deleteConfirm', target, values: null }, opener);
  }
  async function confirmDelete() {
    const c = dlgRef.current?.child;
    if (!c || c.saving || c.blocking) return;
    if (latest.current.paymentsHidden) return; // Hide private details on: delete at the desk
    if (!beginWrite()) return;
    patchChild({ saving: true, failed: false, note: null });
    const t = c.target;
    const name = T.candidateName(t);
    const result = await saveCall(() => deleteCandidate({ candidateId: t.id, expectedVersion: t.version }), () => confirmDelete());
    if (result.status === 'ok') {
      afterWrite({ countChanged: true });
      latest.current.showToast(T.toastDeleted(name), { icon: false });
      // The detail of a deleted candidate has nothing left to show.
      const opener = dlgRef.current?.detail?.opener ?? c.opener;
      setDlg(null);
      focusSoon(opener);
      return;
    }
    if (result.status === 'has_payments') {
      patchChild({ saving: false, note: T.hasPaymentRecordsShort(name), blocking: true });
      return;
    }
    // 0025 (Q-G3, v0.950): grades block deleting
    if (result.status === 'has_grades') {
      patchChild({ saving: false, note: T.hasGradesShort(name), blocking: true });
      return;
    }
    if (commonProblem(result.status, name)) return;
    patchChild({ saving: false, note: T.INVALID });
  }
  // Restore → "[Name] restored · Undo" (BB5, v0.967). Undo withdraws them again, with the version
  // Restore returned; it is refused in the amber bar the same ways Withdraw is.
  // opener: the ⋯ Restore was chosen from (focus goes back there after a problem).
  function restore(target, opener = null) {
    const name = T.candidateName(target);
    runQuick(() => restoreCandidate({ candidateId: target.id, expectedVersion: target.version }), {
      opener,
      ok: (result) =>
        latest.current.showToast(
          T.toastRestored(name),
          // A "Duplicate copy" restored: no Undo (R2-03, v1.043; restoreHasUndo in checks.js)
          !restoreHasUndo(target)
            ? { icon: false }
            : undoToast(T.toastRestored(name), () => withdrawCandidate({ candidateId: target.id, expectedVersion: result.version }), {
                countChanged: true,
                // 'withdrawn' = someone else withdrew them meanwhile: nothing was done here either
                statuses: { stale: T.candidateStale(name), withdrawn: T.candidateStale(name) },
              }),
        ),
      countChanged: true,
      statuses: { stale: T.candidateStale(name), already_added: T.restoreAlreadyAdded(name) },
    });
  }

  // ===== Possible duplicates · compare (Star v0.114) =====
  async function openCompare(row, partner, opener) {
    if (dlgRef.current || !partner) return;
    if (!beginWrite()) return;
    let pair = [{ problem: 'error' }, { problem: 'error' }];
    try {
      pair = await Promise.all([fetchCandidate(row.id), fetchCandidate(partner.id)]);
    } finally {
      endWrite();
    }
    const [a, b] = pair;
    const problem = a.problem ?? b.problem;
    if (problem) {
      loadProblem(problem, () => openCompare(row, partner, opener));
      return;
    }
    // The earlier registration is "First registration" (by the moment itself, not its text — two
    // stamps may be written differently); the same moment → the lower reference first. The same
    // order at every size, whichever row's Review was used.
    const when = (x) => Date.parse(x.candidate.registeredAt) || 0;
    const ref = (x) => String(x.candidate.reference ?? '');
    const aFirst = when(a.data) - when(b.data) || ref(a.data).localeCompare(ref(b.data), 'en', { numeric: true });
    const [first, second] = aFirst <= 0 ? [a.data, b.data] : [b.data, a.data];
    openChild({ kind: 'compare', first, second, values: null }, opener);
  }
  async function resolve(keep, other, keepBoth) {
    const c = dlgRef.current?.child;
    if (!c || c.saving || c.blocking) return;
    if (!beginWrite()) return;
    // busyKind: which button was pressed, so the shared compare can say "Keeping…" on that one
    const busyKind = keepBoth ? 'keep-both' : keep.candidate.id === c.first?.candidate?.id ? 'keep-first' : 'keep-second';
    patchChild({ saving: true, busyKind, failed: false, note: null });
    const name = T.candidateName(keep.candidate);
    const result = await saveCall(() => resolveDuplicate({ keepId: keep.candidate.id, keepVersion: keep.candidate.version, otherId: other.candidate.id, otherVersion: other.candidate.version, keepBoth }), () => resolve(keep, other, keepBoth));
    if (result.status === 'ok') {
      afterWrite({ countChanged: !keepBoth });
      if (keepBoth) latest.current.showToast(T.TOAST_BOTH_KEPT, { icon: false });
      else {
        const otherId = other.candidate.id;
        const otherVersion = result.otherVersion;
        // Staff may undo their own "keep one" for 10 seconds (the database checks it).
        const words = T.toastKeptOne(name);
        const otherName = T.candidateName(other.candidate);
        latest.current.showToast(
          words,
          undoToast(words, () => restoreCandidate({ candidateId: otherId, expectedVersion: otherVersion }), {
            countChanged: true,
            statuses: { not_allowed: T.undoWhy.tooLate, stale: T.candidateStale(otherName) },
          }),
        );
      }
      patchChild({ saving: false });
      closeChild();
      return;
    }
    if (result.status === 'withdrawn' || result.status === 'stale') {
      patchChild({ saving: false, note: T.DUPLICATE_CHANGED, blocking: true });
      return;
    }
    if (commonProblem(result.status, name)) return;
    patchChild({ saving: false, note: T.INVALID });
  }

  // ===== View signature (admins) and the receipt =====
  async function openSignature(opener) {
    const d = dlgRef.current?.detail;
    // Admins may open View signature while private details are hidden, as Star's (v1.055 (c))
    if (!d?.data) return;
    openChild({ kind: 'signature', candidateId: d.candidateId, status: 'loading', result: null, values: null }, opener);
    await readSignature(d.candidateId);
  }
  async function readSignature(candidateId) {
    const result = await loadSignature({ candidateId });
    if (dlgRef.current?.child?.kind !== 'signature') return; // closed meanwhile
    if (result.status === 'no_access') {
      latest.current.onNoAccess();
      return;
    }
    if (result.status === 'not_allowed') latest.current.onRefreshProfile();
    patchChild({ status: result.status === 'ok' ? 'ready' : result.status, result: result.status === 'ok' ? result : null });
  }
  // S-2 (v1.051 (2)): the signature box's "Couldn't load. Check the connection, then retry." has a Retry
  // that reads the signature again (the box shows its loading lines meanwhile).
  function retrySignature() {
    const c = dlgRef.current?.child;
    if (c?.kind !== 'signature' || c.status === 'loading') return;
    patchChild({ status: 'loading', result: null });
    readSignature(c.candidateId);
  }
  // The receipt reads its own data (CandidateReceipt, which hands it to the shared receipt box). It also needs the day the Kukkiwon fee was
  // added (the receipt data doesn't carry it): from the open detail, or — from a row's ⋯ — read
  // once here, keeping ONLY those two dates (nothing else of the detail is kept).
  function openReceipt(candidateId, opener) {
    if (latest.current.paymentsHidden) return;
    const from = dlgRef.current?.detail;
    const known = from?.data && from.candidateId === candidateId ? from.data.candidate : null;
    const dates = (c) => ({ kukkiwonAddedOn: c.kukkiwonAddedOn ?? null, registeredOn: c.registeredOn ?? null });
    openChild({ kind: 'receipt', candidateId, values: null, kukkiwonDates: known ? dates(known) : null }, opener);
    if (known) return;
    fetchCandidate(candidateId).then(({ data }) => {
      const c = dlgRef.current?.child;
      if (data && c?.kind === 'receipt' && c.candidateId === candidateId) patchChild({ kukkiwonDates: dates(data.candidate) });
    });
  }

  // ----- Menus inside the detail -----
  function setDetailMenu(menu) {
    patchDetail({ menu });
  }

  return {
    dlg,
    busy,
    saveLine, // the tab's one save line: the make-up picker's Add and Undo use it too (R2-05)
    menuLoading,
    openDetail,
    refreshDetail,
    requestCloseDetail,
    closeAll,
    closeChild,
    clearFocusKey,
    paymentsHiddenNow,
    screenLockedNow,
    requestCloseChild,
    changeChild,
    setTicks,
    openRecordPayment,
    saveRecordPayment,
    openEditPayment,
    saveEditPayment,
    openUndoPayment,
    confirmUndoPayment,
    openRefund,
    saveRefund,
    openReturned,
    saveReturned,
    openChangePlan,
    saveChangePlan,
    openAdd,
    saveAdd,
    startEdit,
    changeEdit,
    cancelEdit,
    saveEdit,
    savePaperWaiver,
    withdraw,
    openDelete,
    confirmDelete,
    restore,
    loadForMenu,
    openCompare,
    resolve,
    openSignature,
    retrySignature,
    openReceipt,
    setDetailMenu,
    confirmDanChange,
    dismissDetailBanner,
  };
}
