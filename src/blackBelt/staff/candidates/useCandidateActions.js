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
//                Remove, Delete, Compare, View signature, Receipt), or null
// Only ONE of them is on screen at a time: while a child is open the detail waits behind the
// scenes and comes back (re-read from the database) when the child closes. Two dialogs on top of
// each other would fight over the browser's Back button (Dialog.jsx adds one history step each).
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
  withdrawCandidate,
} from '../../../lib/blackBelt/api.js';
import { amountInputText } from '../../../lib/blackBelt/money.js';
import { defaultTicks, sumRemaining, trimSpaces } from '../../../lib/blackBelt/rules.js';
import { normalizeName } from '../../../lib/testing/names.js';
import { addProblems, anyProblem, detailsProblems, paymentProblems } from './checks.js';
import * as T from '../text.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const focusSoon = (element) =>
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    if (element?.isConnected) element.focus();
  }));
// The items of a payment in the plan's item order (the order the checklist shows them).
const inItemOrder = (codes, money) => {
  const order = (money?.items ?? []).map((x) => x.item);
  return [...codes].sort((a, b) => order.indexOf(a) - order.indexOf(b));
};

export function useCandidateActions({ cycle, isAdmin, today, paymentsHidden, reloadRoster, onCandidatesChanged, showToast, clearToast, onNoAccess, onRefreshProfile, setBanner }) {
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
    latest.current = { cycle, isAdmin, today, paymentsHidden, reloadRoster, onCandidatesChanged, showToast, clearToast, onNoAccess, onRefreshProfile, setBanner };
  });

  // One write at a time (a double click must not record a payment twice).
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  function beginWrite() {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }
  function endWrite() {
    busyRef.current = false;
    setBusy(false);
  }

  const patchChild = (changes) =>
    setDlg((d) => (d?.child ? { ...d, child: { ...d.child, ...(typeof changes === 'function' ? changes(d.child) : changes) } } : d));
  const patchDetail = (changes) =>
    setDlg((d) => (d?.detail ? { ...d, detail: { ...d.detail, ...(typeof changes === 'function' ? changes(d.detail) : changes) } } : d));

  // After any saved change: the roster again (and the cycle's candidate count when it moved).
  function afterWrite({ countChanged = false } = {}) {
    latest.current.reloadRoster();
    if (countChanged) latest.current.onCandidatesChanged();
  }

  // ----- Loading one candidate (the detail and every dialog that needs the money items) -----
  // → the detail's data { candidate, waiver, needsParentSignature, payments, money } or null
  // (the problem is already shown: lock screen, banner or toast).
  function loadProblem(status) {
    const a = latest.current;
    if (status === 'no_access') a.onNoAccess();
    else if (status === 'not_found') {
      a.showToast(T.CANDIDATE_GONE, { icon: false });
      a.reloadRoster();
    } else a.setBanner({ text: T.LOAD_FAILED });
  }
  async function fetchCandidate(candidateId) {
    const result = await loadCandidate({ candidateId });
    if (result.status !== 'ok') return { problem: result.status };
    const { status: _status, ...data } = result;
    return { data };
  }
  async function withCandidate(candidateId, use) {
    if (!beginWrite()) return;
    const { data, problem } = await fetchCandidate(candidateId);
    endWrite();
    if (problem) {
      loadProblem(problem);
      return;
    }
    use(data);
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
  function closeChild() {
    const d = dlgRef.current;
    if (!d) return;
    if (d.detail) {
      setDlg({ detail: d.detail, child: null });
      refreshDetail();
      return;
    }
    setDlg(null);
    focusSoon(d.child?.opener);
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
      patchChild({ saving: false, note: T.candidateStale(name), blocking: true });
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

  // A toast's Undo (or a one-click action): its own small write, with a banner + Retry if the
  // connection drops.
  async function runQuick(call, { ok, statuses = {}, countChanged = false, retryLabel = null }) {
    const a = latest.current;
    if (!beginWrite()) return;
    const result = await call();
    endWrite();
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
      a.setBanner({ text: retryLabel ?? T.ACTION_FAILED, retry: () => runQuick(call, { ok, statuses, countChanged, retryLabel }) });
      return;
    }
    if (result.status === 'not_allowed') a.onRefreshProfile();
    const words = statuses[result.status] ?? (result.status === 'not_allowed' ? T.NOT_ALLOWED : T.INVALID);
    a.showToast(words, { icon: false });
    afterWrite({ countChanged });
    if (dlgRef.current?.detail) refreshDetail();
  }
  const undoAction = (onAction) => ({ action: { label: T.UNDO, onAction }, icon: false });

  // ===== Record payment (Candidates 4) =====
  function paymentValues(money, method = null) {
    const ticks = defaultTicks(money, latest.current.today);
    const cents = sumRemaining(money, ticks);
    return { ticks, amount: cents > 0 ? amountInputText(cents) : '', amountTyped: false, method, note: '' };
  }
  function openRecordPayment(candidateId, opener) {
    const from = dlgRef.current?.detail?.data;
    const start = (data) => openChild({ kind: 'record', candidateId, data, version: data.candidate.version, values: paymentValues(data.money) }, opener);
    if (from && dlgRef.current.detail.candidateId === candidateId) start(from);
    else withCandidate(candidateId, start);
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
    const result = await recordPayment({
      candidateId: c.candidateId,
      expectedVersion: c.version,
      amountCents: cents,
      method: c.values.method,
      forItems: inItemOrder(c.values.ticks, c.data.money),
      note: trimSpaces(c.values.note),
    });
    endWrite();
    if (result.status === 'ok') {
      afterWrite();
      const paymentId = result.paymentId;
      latest.current.showToast(
        T.toastPaymentRecorded(cents, name),
        undoAction(() =>
          runQuick(() => undoPayment({ paymentId }), {
            ok: () => latest.current.showToast(T.TOAST_UNDONE, { icon: false }),
            statuses: { not_allowed: T.TOO_LATE_TO_UNDO, stale: T.PAYMENT_GONE, invalid: T.INVALID },
          }),
        ),
      );
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
  function openEditPayment(line) {
    const d = dlgRef.current?.detail;
    if (!d?.data) return;
    const values = { ticks: [...(line.forItems ?? [])], amount: amountInputText(line.amountCents), amountTyped: true, method: line.method, note: line.note ?? '', reason: '' };
    openChild({ kind: 'editPayment', candidateId: d.candidateId, data: d.data, line, values });
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
    const result = await editPayment({
      paymentId: old.id,
      amountCents: cents,
      method: c.values.method,
      forItems: inItemOrder(c.values.ticks, c.data.money),
      note: trimSpaces(c.values.note),
      reason: trimSpaces(c.values.reason),
    });
    endWrite();
    if (result.status === 'ok') {
      afterWrite();
      const newId = result.paymentId;
      latest.current.showToast(
        T.TOAST_PAYMENT_CHANGED,
        undoAction(() =>
          runQuick(
            () => editPayment({ paymentId: newId, amountCents: old.amountCents, method: old.method, forItems: old.forItems, note: old.note ?? '', reason: T.UNDO_EDIT_REASON }),
            { ok: () => latest.current.showToast(T.TOAST_UNDONE, { icon: false }), statuses: { stale: T.PAYMENT_GONE } },
          ),
        ),
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

  // OP-B1 working default: a short confirmation, then a toast WITHOUT Undo (an undo can't be undone).
  function openUndoPayment(line, what) {
    const d = dlgRef.current?.detail;
    if (!d?.data) return;
    openChild({ kind: 'undo', candidateId: d.candidateId, data: d.data, line, what, values: null });
  }
  async function confirmUndoPayment() {
    const c = dlgRef.current?.child;
    if (!c || c.saving || c.blocking) return;
    if (!beginWrite()) return;
    patchChild({ saving: true, failed: false, note: null });
    const name = T.candidateName(c.data.candidate);
    const line = c.line;
    const result = await undoPayment({ paymentId: line.id });
    endWrite();
    if (result.status === 'ok') {
      afterWrite();
      const cents = Math.abs(line.amountCents);
      const text =
        line.kind === 'refund'
          ? T.toastRefundUndone(cents, name)
          : line.kind === 'returned'
            ? T.toastReturnedUndone(cents, name)
            : T.toastPaymentUndone(c.what ?? T.FOR_REFUND, cents, name);
      latest.current.showToast(text, { icon: false });
      patchChild({ saving: false });
      closeChild();
      return;
    }
    if (result.status === 'stale') {
      patchChild({ saving: false, note: T.PAYMENT_GONE, blocking: true });
      return;
    }
    if (result.status === 'invalid') {
      patchChild({ saving: false, note: line.returned ? T.RETURNED_FIRST : line.kind === 'payment' ? T.UNDO_NET_FLOOR : T.INVALID, blocking: true });
      return;
    }
    if (commonProblem(result.status, name)) return;
    patchChild({ saving: false, note: T.INVALID });
  }

  function openRefund(candidateId, opener) {
    const start = (data) => {
      const over = data.money?.overpaidCents ?? 0;
      openChild({ kind: 'refund', candidateId, data, version: data.candidate.version, values: { amount: over > 0 ? amountInputText(over) : '', method: null, note: '' } }, opener);
    };
    const from = dlgRef.current?.detail;
    if (from?.data && from.candidateId === candidateId) start(from.data);
    else withCandidate(candidateId, start);
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
    const result = await recordRefund({ candidateId: c.candidateId, expectedVersion: c.version, amountCents: cents, method: c.values.method, note: trimSpaces(c.values.note) });
    endWrite();
    if (result.status === 'ok') {
      afterWrite();
      const refundId = result.paymentId;
      latest.current.showToast(
        T.toastRefund(cents, name),
        undoAction(() =>
          runQuick(() => undoPayment({ paymentId: refundId }), {
            ok: () => latest.current.showToast(T.TOAST_UNDONE, { icon: false }),
            statuses: { stale: T.PAYMENT_GONE },
          }),
        ),
      );
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

  function openReturned(line, what) {
    const d = dlgRef.current?.detail;
    if (!d?.data) return;
    openChild({ kind: 'returned', candidateId: d.candidateId, data: d.data, line, what, values: { note: '' } });
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
    const result = await markCheckReturned({ paymentId: c.line.id, note: trimSpaces(c.values.note) });
    endWrite();
    if (result.status === 'ok') {
      afterWrite();
      const returnedId = result.paymentId;
      latest.current.showToast(
        T.toastReturned(cents, name),
        undoAction(() =>
          runQuick(() => undoPayment({ paymentId: returnedId }), {
            ok: () => latest.current.showToast(T.TOAST_UNDONE, { icon: false }),
            statuses: { stale: T.PAYMENT_GONE },
          }),
        ),
      );
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
    const start = (data) =>
      openChild({ kind: 'plan', candidateId, data, version: data.candidate.version, values: { planId: data.candidate.cyclePlanId, kukkiwon: data.candidate.kukkiwon === true } }, opener);
    const from = dlgRef.current?.detail;
    if (from?.data && from.candidateId === candidateId) start(from.data);
    else withCandidate(candidateId, start);
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
    const result = await changePlan({ candidateId, expectedVersion: c.version, planId: c.values.planId, kukkiwon: c.values.kukkiwon });
    endWrite();
    if (result.status === 'ok') {
      afterWrite();
      const version = result.version;
      latest.current.showToast(
        T.toastPlanChanged(name),
        undoAction(() =>
          runQuick(() => changePlan({ candidateId, expectedVersion: version, planId: old.planId, kukkiwon: old.kukkiwon }), {
            ok: () => latest.current.showToast(T.TOAST_UNDONE, { icon: false }),
            statuses: { stale: T.UNDO_STALE_CANDIDATE, not_allowed: T.PAYMENT_RECORDED_ASK_ADMIN, withdrawn: T.planWithdrawn(name) },
          }),
        ),
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
    if (dlgRef.current) return;
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
    const result = await addCandidate({
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
    });
    endWrite();
    if (result.status === 'ok') {
      afterWrite({ countChanged: true });
      const { id, version, reference } = result;
      // OP-B2: admins get Undo (= Delete permanently; nothing is paid yet). Staff don't, unless
      // Jeffrey decides otherwise (text.js ADD_UNDO_FOR_STAFF).
      const canUndo = a.isAdmin || T.ADD_UNDO_FOR_STAFF;
      a.showToast(
        T.toastAdded(name, reference),
        canUndo
          ? undoAction(() =>
              runQuick(() => deleteCandidate({ candidateId: id, expectedVersion: version }), {
                ok: () => latest.current.showToast(T.TOAST_UNDONE, { icon: false }),
                countChanged: true,
                statuses: { stale: T.UNDO_STALE_CANDIDATE, has_payments: T.hasPaymentRecords(name) },
              }),
            )
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
    if (ask && !same(d.edit.values, d.edit.initial) && !d.edit.blocking) {
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
    const problems = detailsProblems(e.values, { today: latest.current.today, purged });
    if (anyProblem(problems)) {
      patchDetail({ edit: { ...e, triedSave: true } });
      return;
    }
    if (same(e.values, e.initial)) {
      patchDetail({ mode: 'view', edit: null });
      return;
    }
    if (!beginWrite()) return;
    patchDetail({ edit: { ...e, saving: true, failed: false, note: null } });
    const name = T.candidateName(c);
    const result = await updateCandidate({
      candidateId: c.id,
      expectedVersion: e.version,
      first: e.values.first,
      last: e.values.last,
      dateOfBirth: purged ? null : e.values.dob,
      email: purged ? null : trimSpaces(e.values.email),
      locationCode: e.values.school,
      dan: Number(e.values.dan),
    });
    endWrite();
    const setEdit = (changes) => patchDetail((x) => (x.edit ? { edit: { ...x.edit, ...changes } } : {}));
    if (result.status === 'ok') {
      afterWrite();
      latest.current.showToast(T.TOAST_CHANGES_SAVED, { icon: false });
      patchDetail({ mode: 'view', edit: null });
      refreshDetail();
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
    if (result.status === 'stale') {
      setEdit({ saving: false, note: T.candidateStale(name), blocking: true });
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

  // ===== Remove · Withdraw / Delete permanently / Restore (v0.113) =====
  // target: { id, firstName, lastName, version, hasPaymentRows }
  function openRemove(target, opener) {
    openChild({ kind: 'remove', target, values: null }, opener);
  }
  async function withdraw() {
    const c = dlgRef.current?.child;
    if (!c || c.saving || c.blocking) return;
    if (!beginWrite()) return;
    patchChild({ saving: true, failed: false, note: null });
    const t = c.target;
    const name = T.candidateName(t);
    const result = await withdrawCandidate({ candidateId: t.id, expectedVersion: t.version });
    endWrite();
    if (result.status === 'ok' || result.status === 'withdrawn') {
      afterWrite({ countChanged: true });
      const version = result.version;
      latest.current.showToast(
        T.toastWithdrawn(name),
        result.status === 'ok'
          ? undoAction(() =>
              runQuick(() => restoreCandidate({ candidateId: t.id, expectedVersion: version }), {
                ok: () => latest.current.showToast(T.TOAST_UNDONE, { icon: false }),
                countChanged: true,
                statuses: { stale: T.UNDO_STALE_CANDIDATE },
              }),
            )
          : { icon: false },
      );
      patchChild({ saving: false });
      closeChild();
      return;
    }
    if (commonProblem(result.status, name)) return;
    patchChild({ saving: false, note: T.INVALID });
  }
  function askDelete() {
    const c = dlgRef.current?.child;
    if (!c || c.saving) return;
    patchChild({ kind: 'deleteConfirm', note: null, blocking: false, failed: false });
  }
  function openDelete(target, opener) {
    openChild({ kind: 'deleteConfirm', target, values: null }, opener);
  }
  async function confirmDelete() {
    const c = dlgRef.current?.child;
    if (!c || c.saving || c.blocking) return;
    if (!beginWrite()) return;
    patchChild({ saving: true, failed: false, note: null });
    const t = c.target;
    const name = T.candidateName(t);
    const result = await deleteCandidate({ candidateId: t.id, expectedVersion: t.version });
    endWrite();
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
    if (commonProblem(result.status, name)) return;
    patchChild({ saving: false, note: T.INVALID });
  }
  function restore(target) {
    const name = T.candidateName(target);
    runQuick(() => restoreCandidate({ candidateId: target.id, expectedVersion: target.version }), {
      ok: () => latest.current.showToast(T.toastRestored(name), { icon: false }),
      countChanged: true,
      statuses: { stale: T.candidateStale(name) },
    });
  }

  // ===== Possible duplicates · compare (Star v0.114) =====
  async function openCompare(row, partner, opener) {
    if (dlgRef.current || !partner) return;
    if (!beginWrite()) return;
    const [a, b] = await Promise.all([fetchCandidate(row.id), fetchCandidate(partner.id)]);
    endWrite();
    const problem = a.problem ?? b.problem;
    if (problem) {
      loadProblem(problem);
      return;
    }
    // The earlier registration is "First registration".
    const [first, second] = a.data.candidate.registeredAt <= b.data.candidate.registeredAt ? [a.data, b.data] : [b.data, a.data];
    openChild({ kind: 'compare', first, second, values: null }, opener);
  }
  async function resolve(keep, other, keepBoth) {
    const c = dlgRef.current?.child;
    if (!c || c.saving || c.blocking) return;
    if (!beginWrite()) return;
    patchChild({ saving: true, failed: false, note: null });
    const name = T.candidateName(keep.candidate);
    const result = await resolveDuplicate({ keepId: keep.candidate.id, keepVersion: keep.candidate.version, otherId: other.candidate.id, otherVersion: other.candidate.version, keepBoth });
    endWrite();
    if (result.status === 'ok') {
      afterWrite({ countChanged: !keepBoth });
      if (keepBoth) latest.current.showToast(T.TOAST_BOTH_KEPT, { icon: false });
      else {
        const otherId = other.candidate.id;
        const otherVersion = result.otherVersion;
        // Staff may undo their own "keep one" for 10 seconds (the database checks it).
        latest.current.showToast(
          T.toastKeptOne(name),
          undoAction(() =>
            runQuick(() => restoreCandidate({ candidateId: otherId, expectedVersion: otherVersion }), {
              ok: () => latest.current.showToast(T.TOAST_UNDONE, { icon: false }),
              countChanged: true,
              statuses: { not_allowed: T.TOO_LATE_TO_UNDO, stale: T.DUPLICATE_CHANGED },
            }),
          ),
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
  async function openSignature() {
    const d = dlgRef.current?.detail;
    if (!d?.data) return;
    openChild({ kind: 'signature', candidateId: d.candidateId, status: 'loading', result: null, values: null });
    const result = await loadSignature({ candidateId: d.candidateId });
    if (dlgRef.current?.child?.kind !== 'signature') return; // closed meanwhile
    if (result.status === 'no_access') {
      latest.current.onNoAccess();
      return;
    }
    if (result.status === 'not_allowed') latest.current.onRefreshProfile();
    patchChild({ status: result.status === 'ok' ? 'ready' : result.status, result: result.status === 'ok' ? result : null });
  }
  function openReceipt(candidateId, opener) {
    if (latest.current.paymentsHidden) return;
    openChild({ kind: 'receipt', candidateId, values: null }, opener);
  }

  // ----- Menus inside the detail -----
  function setDetailMenu(menu) {
    patchDetail({ menu });
  }

  return {
    dlg,
    busy,
    openDetail,
    refreshDetail,
    requestCloseDetail,
    closeAll,
    closeChild,
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
    openRemove,
    withdraw,
    askDelete,
    openDelete,
    confirmDelete,
    restore,
    openCompare,
    resolve,
    openSignature,
    openReceipt,
    setDetailMenu,
  };
}
