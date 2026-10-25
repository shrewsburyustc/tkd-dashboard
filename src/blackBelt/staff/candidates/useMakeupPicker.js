// useMakeupPicker.js — the "brain" of Add candidate → "Make-up from an earlier cycle…"
// (contract 0025 §14.5, mockup G06, proposals 25–27; copied in pattern from Star's make-up list).
// Why it exists: the picker's list, search text and answers live HERE, not in the dialog, so a
// screen lock can hide the dialog and bring it back exactly as it was.
//
//   const picker = useMakeupPicker({ cycle, isAdmin, reloadRoster, onCandidatesChanged, showToast,
//                                    clearToast, onNoAccess, onRefreshProfile, onAdded });
//   picker.open(opener) · picker.state (null = closed) · picker.close() · picker.setSearch(text)
//   picker.add(row) · picker.retry() · picker.openChoose(row) · picker.closeChoose({ saved })
//
// What happens:
//   - open → loadMakeupList (everyone whose result on an EARLIER cycle is a Make-up, newest cycle
//     first; no date of birth, email or reference). The name search filters it on the screen.
//   - Add → addMakeup. OK: the picker closes, the roster reloads, the new row glows for a moment
//     (onAdded) and the toast says "Mia Chen added · make-up from Spring 2027" — with Undo for
//     admins only (v0.913: Undo = Delete permanently; only copied "kept" grades exist yet).
//   - already_added → the row turns "Already added"; choice_needed → the row says the subjects
//     aren't chosen yet and the list is read again; stale / not_found → a note and the list again.
//   - Choose subjects (admins, a below-the-pass-mark row with no subjects chosen yet — Star
//     OPEN-11) opens Grading's Choose subjects dialog for that earlier candidate (builder C1's
//     MakeupSubjectsDialog); closing it comes back here with the list read again. That dialog needs
//     the earlier candidate's result and its Dan's rubric, so the earlier cycle's Results for that
//     Dan are read first (loadResults — no date of birth, email or money).
// Status words come from text.js; the database decides everything.
import { useLayoutEffect, useRef, useState } from 'react';
import { deleteCandidate } from '../../../lib/blackBelt/api.js';
import { addMakeup, loadMakeupList, loadResults } from '../../../lib/blackBelt/gradingApi.js';
import * as T from '../text.js';

export function useMakeupPicker({ cycle, isAdmin, reloadRoster, onCandidatesChanged, showToast, clearToast, onNoAccess, onRefreshProfile, onAdded }) {
  const [state, setStateRaw] = useState(null);
  const stateRef = useRef(null);
  const setState = (next) => {
    const value = typeof next === 'function' ? next(stateRef.current) : next;
    stateRef.current = value;
    setStateRaw(value);
  };
  const patch = (changes) => setState((s) => (s ? { ...s, ...(typeof changes === 'function' ? changes(s) : changes) } : s));
  // The newest props for the answers that arrive later
  const latest = useRef({});
  useLayoutEffect(() => {
    latest.current = { cycle, isAdmin, reloadRoster, onCandidatesChanged, showToast, clearToast, onNoAccess, onRefreshProfile, onAdded };
  });
  const undoBusy = useRef(false);

  async function loadList() {
    const cycleId = latest.current.cycle.id;
    const result = await loadMakeupList({ cycleId });
    if (!stateRef.current) return; // closed meanwhile
    if (result.status === 'no_access') {
      latest.current.onNoAccess();
      return;
    }
    if (result.status === 'ok') patch({ rows: result.rows, failed: false });
    else patch({ failed: true });
  }

  function open(opener) {
    if (stateRef.current) return;
    latest.current.clearToast();
    setState({ key: Date.now(), rows: null, failed: false, search: '', added: {}, note: null, saving: false, choose: null, opener });
    loadList();
  }
  function close() {
    const s = stateRef.current;
    if (!s || s.saving) return;
    setState(null);
    focusSoon(s.opener);
  }
  function setSearch(search) {
    patch({ search });
  }
  function retry() {
    patch({ failed: false, rows: null });
    loadList();
  }

  async function add(row) {
    const s = stateRef.current;
    if (!s || s.saving) return;
    const a = latest.current;
    patch({ saving: true, note: null });
    const result = await addMakeup({ cycleId: a.cycle.id, earlierCandidateId: row.id });
    const name = `${row.firstName} ${row.lastName}`;
    const status = result.status;
    if (status === 'ok') {
      const opener = stateRef.current?.opener;
      setState(null);
      a.reloadRoster();
      a.onCandidatesChanged?.();
      a.onAdded?.(result.id);
      focusSoon(opener);
      // v0.913: Undo after Add is for admins only (= Delete permanently of the new row)
      const id = result.id;
      const version = result.version;
      a.showToast(
        T.makeupAddedToast(name, row.cycleName),
        a.isAdmin ? { icon: false, action: { label: T.UNDO, onAction: () => undoAdd(id, version, name) } } : { icon: false },
      );
      return;
    }
    if (status === 'no_access') {
      patch({ saving: false });
      a.onNoAccess();
      return;
    }
    if (status === 'already_added' || status === 'choice_needed') {
      patch((x) => ({ saving: false, added: { ...x.added, [row.id]: status } }));
      if (status === 'choice_needed') loadList();
      return;
    }
    if (status === 'stale') {
      patch({ saving: false, note: T.makeupStale(name, row.cycleName) });
      loadList();
      return;
    }
    if (status === 'not_found') {
      patch({ saving: false, note: T.MAKEUP_GONE });
      loadList();
      return;
    }
    if (status === 'finished') {
      patch({ saving: false, note: T.CANDIDATE_FINISHED });
      return;
    }
    if (status === 'not_allowed') {
      patch({ saving: false, note: T.NOT_ALLOWED });
      a.onRefreshProfile();
      return;
    }
    if (status === 'invalid') {
      patch({ saving: false, note: T.makeupInvalid(name) });
      loadList();
      return;
    }
    patch({ saving: false, note: T.SAVE_FAILED });
  }

  // The toast's Undo (admins): delete the just-added make-up row.
  async function undoAdd(id, version, name) {
    if (undoBusy.current) return;
    undoBusy.current = true;
    const result = await deleteCandidate({ candidateId: id, expectedVersion: version });
    undoBusy.current = false;
    const a = latest.current;
    if (result.status === 'no_access') {
      a.onNoAccess();
      return;
    }
    a.reloadRoster();
    a.onCandidatesChanged?.();
    if (result.status === 'ok') {
      a.showToast(T.TOAST_UNDONE, { icon: false });
      return;
    }
    if (result.status === 'not_allowed') a.onRefreshProfile();
    const words = {
      stale: T.UNDO_STALE_CANDIDATE,
      has_grades: T.hasGrades(name),
      has_payments: T.hasPaymentRecords(name),
      not_allowed: T.NOT_ALLOWED,
      not_found: T.CANDIDATE_GONE,
    }[result.status] ?? T.ACTION_FAILED;
    a.showToast(words, { icon: false });
  }

  // ----- Choose subjects (admins) for a choice-needed row -----
  async function openChoose(row) {
    const s = stateRef.current;
    if (!s || s.saving || !latest.current.isAdmin) return;
    patch({ saving: true, note: null });
    const answer = await loadResults({ cycleId: row.cycleId, dan: row.dan });
    if (!stateRef.current) return; // closed meanwhile
    if (answer.status === 'no_access') {
      patch({ saving: false });
      latest.current.onNoAccess();
      return;
    }
    const found = answer.status === 'ok' ? answer.rows.find((r) => r.id === row.id) ?? null : null;
    const rubric = answer.status === 'ok' ? answer.rubrics.find((d) => d.dan === row.dan) ?? null : null;
    if (!found || !rubric) {
      // gone from the earlier cycle's results (withdrawn meanwhile), or the connection dropped
      patch({ saving: false, note: answer.status === 'ok' ? T.makeupStale(`${row.firstName} ${row.lastName}`, row.cycleName) : T.LOAD_FAILED });
      if (answer.status === 'ok') loadList();
      return;
    }
    patch({ saving: false, choose: { row, result: found.result, rubric } });
  }
  // changed = the dialog saved (or someone else chose meanwhile): the list is read again either way.
  function closeChoose() {
    const s = stateRef.current;
    if (!s?.choose) return;
    const rowId = s.choose.row.id;
    patch((x) => {
      const added = { ...x.added };
      delete added[rowId];
      return { choose: null, added };
    });
    loadList();
  }

  return { state, open, close, setSearch, retry, add, openChoose, closeChoose, isOpen: state !== null };
}

// Focus back on the button that opened the picker once the page can take focus again.
function focusSoon(element) {
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
}
