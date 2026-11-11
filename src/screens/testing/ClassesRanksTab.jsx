// ClassesRanksTab.jsx — the class and rank list and everything you can do with it. Since CB14
// (rulebook v0.427 / v0.432) it is used in two places, chosen by the `part` prop:
//   part 'settings'  Settings → Classes and ranks (admins): names and order — add, edit, delete and
//                    reorder classes and ranks. No prices; the dialogs are Add/Edit class (name),
//                    Edit rank (name + belt) and Add rank (everything, prices pre-filled).
//   part 'prices'    Color belt testing → Prices: every rank's prices and each class's final award.
//                    Admins edit them (Edit prices on a rank, Final award on a class); staff see the list
//                    read-only. No add, no reorder, no delete, no ⋯ menu.
// Both parts read the same data and call the same database functions (which take every field), so a save
// from one half sends the other half back unchanged and the version check stops it if someone else changed it.
// Why it exists: approved mockup screens 1–8 and contract 0003 §8. This file is the "brain"
// of the list. It:
//   - loads the selected school's classes and ranks (useClassesRanks — reloads quietly after
//     every change, when the school changes, after unlocking, and when the browser tab
//     becomes visible again)
//   - decides which dialog, menu or banner is showing
//   - sends every change to the database (src/lib/testing/api.js) and reacts to the answer
//   - offers Undo for reversible changes (edit, add, reorder) — never for delete (v0.41)
// Batch 2 (design review R2-05 / R2-07, rulebook v1.125–v1.131): the saves and the Undos go through
// the shared save line (src/lib/saveLine.js) instead of this file's own "one change at a time" flag:
// an Undo pressed while a save runs now waits its turn ("Undoing…") instead of being dropped, the
// page's one amber bar is a PageBar under the top bar, and a refused save or Undo names the rank or
// class ("Someone else changed Yellow just now, …" / "Couldn't undo: …").
// The drawing is done by smaller files: ClassBlock / RankRows (the list), RankDialog,
// ClassDialog, FinalAwardSelect, and the shared Dialog / RowMenu / PageBar / ConfirmBox (the
// delete question: "Keep rank · Delete rank" / "Keep class · Delete class", v1.008, v0.422).
//
// Rules worth knowing (contract 0003 §8):
//   - ONE change at a time (the save line): while a save is on its way, other changes are ignored;
//     an Undo waits for it.
//   - Dialog saves WAIT for the database. Only reordering is "optimistic" (shown at once).
//   - The dialog's typed values live HERE, not in the dialog. If the screen locks while a
//     dialog is open, the dialog disappears with the lock and comes back after unlocking with
//     everything still filled in.
//   - "stale" = someone else changed the same thing since this screen loaded it. Nothing is
//     overwritten; the person is told and the list reloads.
//   - Admin vs staff only changes what is SHOWN here — the database enforces who may change what.
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowDown, IconArrowUp, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import PageBar from '../../components/PageBar.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import { LOCATION_CODE } from '../../lib/device.js';
import { useSaveLine } from '../../lib/saveLine.js';
import { centsToInputText } from '../../lib/money.js';
import {
  addClass,
  addRank,
  deleteClass,
  deleteRank,
  loadClassesAndRanks,
  reorderClasses,
  reorderRanks,
  updateClass,
  updateRank,
} from '../../lib/testing/api.js';
import { countSlotsForClass } from '../../lib/schedule/api.js';
import {
  checkUndoAddRank,
  classOrderIds,
  describeAddRank,
  describeClassDelete,
  describeRankDelete,
  FINAL_AWARD_NONE,
  finalAwardArgs,
  finalAwardChoiceOf,
  moveId,
  rankOrderIds,
  reorderClassesLocal,
  reorderRanksLocal,
} from '../../lib/testing/rankOrder.js';
import { useClassesRanks } from '../../lib/testing/useClassesRanks.js';
import { PLAIN_WHITE_BELT, beltOf, defaultBeltFor, validateBelt } from '../../lib/testing/belts.js';
import { NARROW_PHONE_QUERY, PC_QUERY, PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import { useReorderDrag } from '../../lib/useReorderDrag.js';
import { useRowArrowNav } from '../../lib/useRowArrowNav.js';
import { useShortcutN } from '../../lib/useShortcutN.js';
import ConfirmBox from '../../components/ConfirmBox.jsx';
import ClassBlock, { ClassLine, classNavKey } from './ClassBlock.jsx';
import ClassDialog, { checkClassForm, isClassFormDirty } from './ClassDialog.jsx';
import RankDialog, { checkRankForm, isRankFormDirty } from './RankDialog.jsx';
import { rankGridColumns } from './RankRows.jsx';
import TestingSkeleton from './TestingSkeleton.jsx';
import * as T from './text.js';

// Which classes are open, per school. Kept here (outside the component) so it survives
// switching to Home or to "Both" and back, for as long as the page is open (contract §8.2).
const openClassesBySchool = new Map();

// Notes that make Save unavailable until the dialog is closed and opened again.
const BLOCKING_NOTES = ['STALE_DIALOG', 'NOT_ALLOWED'];

// Finding things on the page (for putting keyboard focus back after a dialog closes).
const find = (selector) => document.querySelector(selector);
const rowEl = (id) => find(`[data-nav-row="${id}"]`);
const toggleEl = (id) => find(`[data-class-toggle="${id}"]`);
const moreEl = (id) => find(`[data-more-for="${id}"]`);
const addRankEl = (id) => find(`[data-add-rank="${id}"]`);
const addClassEl = () => find('[data-add-class]');
// The element, if it's still on the page and visible; otherwise null.
const usable = (element) => (element && element.isConnected && element.getClientRects().length > 0 ? element : null);

const sameIds = (a, b) => a.length === b.length && a.every((id, index) => id === b[index]);

// A rank's values as the dialog's text fields show them ("65" for 6500 cents).
function rankFormValues(rank) {
  return {
    name: rank.name,
    early: centsToInputText(rank.earlyCents),
    day: centsToInputText(rank.dayCents),
    priv: centsToInputText(rank.privateCents),
    sparring: rank.sparringGear,
    // The belt (v0.65). A rank with no valid belt yet starts as plain white.
    belt: validateBelt(beltOf(rank)) === null ? beltOf(rank) : { ...PLAIN_WHITE_BELT },
  };
}

export default function ClassesRanksTab({
  part = 'prices', // 'settings' | 'prices' (see the top of the file)
  addClassLabel, // Settings: the Add class button's name for screen readers ("Add class, Worcester"); the words on it stay "Add class"
  school,
  isAdmin,
  panelId,
  tabId,
  renderHeader,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
}) {
  const isPrices = part === 'prices';
  const loadFailedText = isPrices ? T.PRICES_LOAD_FAILED : T.LOAD_FAILED;
  const locationCode = LOCATION_CODE[school];
  const data = useClassesRanks({ locationCode, enabled: !screenLocked });
  const classes = data.classes;

  // Newest values for callbacks that run later (after a save, from a toast's Undo, …).
  const dataRef = useRef(data);
  const classesRef = useRef(classes);
  useLayoutEffect(() => {
    dataRef.current = data;
    classesRef.current = classes;
  });

  // ----- Device -----
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isPc = useMediaQuery(PC_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const isNarrowPhone = useMediaQuery(NARROW_PHONE_QUERY); // under 360px: no Edit pencil on rank rows (v0.68)
  // Grips (drag to reorder) for admins on EVERY device (v0.63), in Settings only; staff never see them.
  const layout = { isPhone, isNarrowPhone, isTouch, isWide, isPc, hasGrip: isAdmin && !isPrices };

  // ----- State -----
  const [openBySchool, setOpenBySchool] = useState(() => Object.fromEntries(openClassesBySchool));
  const openIds = openBySchool[locationCode] ?? [];
  const [dialog, setDialog] = useState(null); // the open dialog and its form (see open* below)
  const [menu, setMenu] = useState(null); // { kind: 'rank' | 'class', id, anchor }
  // The page's ONE amber bar: { text, retry?, kind?, retrying?, takeFocus? }. kind 'undo' is the bar
  // the save line shows for an Undo (undoBar below); 'reorder' is a failed first reorder's.
  const [banner, setBanner] = useState(null);
  const [failedReorder, setFailedReorder] = useState(null); // { kind, classId, newIds, movedId }

  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
  });

  // ----- One change at a time: the save line (lib/saveLine.js) -----
  // line.begin() → false while a save or an Undo runs, else a token; line.end(status, { token }) is
  // called exactly once per begin(), from a finally; line.busy is true while anything runs; an Undo
  // pressed meanwhile waits its turn (line.undoAction).
  // undoBar: how the line puts its bar (a failed or refused Undo) into this page's one bar; null
  // clears it, but only if it is the line's.
  function undoBar(next) {
    setBanner((current) => (next ? { kind: 'undo', ...next } : current?.kind === 'undo' ? null : current));
  }
  const line = useSaveLine({ section: part === 'settings' ? 'Settings' : 'Color belt testing', showToast, undoBar });
  // status: the database's answer. Anything but "ok" also removes a visible Undo toast — an
  // Undo offered for an earlier change shouldn't sit next to a change that just failed.
  // retry: how to redo this save (only when the page's own bar has a Retry that does exactly that).
  // (retry only for a plain failure: for a refused save, a waiting Undo's "Neither change saved … check the
  // connection" bar would be wrong and its Retry would only repeat a refusal)
  function endSave(token, status, retry = null) {
    line.end(status, { retry: status === 'error' ? retry : null, token });
    if (status && status !== 'ok') clearToast();
  }

  // ----- Keyboard focus after a dialog closes (contract §8.5) -----
  // focusLater(findTarget, fallback, waitFor, reveal): after the next redraw (or once `waitFor`
  // — a reload — has finished), focus findTarget(); if that finds nothing, focus fallback().
  // reveal: true scrolls the whole new item into view (a new class line + its empty row), with
  // room left at the bottom so the toast doesn't cover it (scroll-padding in testing.css).
  const pendingFocusRef = useRef(null);
  const [, setFocusTick] = useState(0);
  function focusLater(findTarget, fallback = null, waitFor = null, reveal = false) {
    const request = { findTarget, fallback, waiting: Boolean(waitFor), reveal };
    pendingFocusRef.current = request;
    setFocusTick((n) => n + 1);
    if (waitFor) {
      waitFor.finally(() => {
        if (pendingFocusRef.current !== request) return; // a newer request replaced this one
        request.waiting = false;
        setFocusTick((n) => n + 1);
      });
    }
  }
  useEffect(() => {
    const request = pendingFocusRef.current;
    if (!request || request.waiting || screenLocked || dialog) return undefined;
    const target = usable(request.findTarget()) ?? usable(request.fallback?.());
    // Right after a dialog closes, the page is still "inert" for a moment (the App switches
    // that off on its next redraw) and can't take focus yet: try again on the next frame.
    const stillInert = target && target.closest('[inert]');
    request.tries = (request.tries ?? 0) + 1;
    if (stillInert && request.tries < 30) {
      const frame = window.requestAnimationFrame(() => setFocusTick((n) => n + 1));
      return () => window.cancelAnimationFrame(frame);
    }
    pendingFocusRef.current = null;
    if (target && request.reveal) {
      target.focus({ preventScroll: true });
      (target.closest('.cblock') && target.hasAttribute('data-class-toggle') ? target.closest('.cblock') : target).scrollIntoView({
        block: 'nearest',
      });
    } else {
      target?.focus();
    }
    return undefined;
  });

  // ----- Reloading -----
  async function reloadQuiet() {
    const result = await dataRef.current.reload();
    // A quiet reload that fails keeps the list on screen and shows the load banner.
    if (result === 'error') setBanner({ text: loadFailedText, retry: retryLoad });
    return result;
  }
  async function retryLoad() {
    const result = await dataRef.current.reload();
    if (result === 'ok') setBanner(null);
  }

  // The database says this sign-in can't see data (locked on its side): lock the screen too.
  useEffect(() => {
    if (data.status === 'noAccess') onNoAccess();
  }, [data.status, onNoAccess]);

  // Another school: banners, menus and "Not saved" marks belonged to the old one.
  const previousCodeRef = useRef(locationCode);
  useEffect(() => {
    if (previousCodeRef.current === locationCode) return;
    previousCodeRef.current = locationCode;
    clearToast(); // an Undo offered for the other school's change must not sit over this one
    setBanner(null);
    setMenu(null);
    setFailedReorder(null);
  }, [locationCode, clearToast]);

  // Locking closes menus (they aren't brought back). Dialogs are only hidden — see render.
  // After unlocking, focus goes back to that menu's ⋯ button.
  const menuBeforeLockRef = useRef(null);
  useEffect(() => {
    if (screenLocked) {
      setMenu((current) => {
        if (current) menuBeforeLockRef.current = current.id;
        return null;
      });
      return undefined;
    }
    const id = menuBeforeLockRef.current;
    if (!id) return undefined;
    menuBeforeLockRef.current = null;
    // On the next frame: the App puts focus on the account button when the lock screen goes
    // away (its own rule); this runs just after that, so the ⋯ button wins.
    const frame = window.requestAnimationFrame(() => usable(moreEl(id))?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [screenLocked]);

  // Tell the App whether a dialog is showing (it makes the page behind unclickable).
  const modalShown = dialog !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  // A failed reorder keeps its "Not saved" tag until a reload shows the server's order again.
  useEffect(() => {
    if (!failedReorder) return;
    const current =
      failedReorder.kind === 'ranks' ? rankOrderIds(classes, failedReorder.classId) : classOrderIds(classes);
    if (!sameIds(current, failedReorder.newIds)) setFailedReorder(null);
  }, [classes, failedReorder]);

  // ----- Open / closed classes -----
  function setOpen(classId, open) {
    setOpenBySchool((previous) => {
      const current = previous[locationCode] ?? [];
      const next = open ? [...new Set([...current, classId])] : current.filter((id) => id !== classId);
      openClassesBySchool.set(locationCode, next);
      return { ...previous, [locationCode]: next };
    });
  }
  const isOpen = (classId) => openIds.includes(classId);

  // ===== Dialogs =====
  function openDialog(next) {
    clearToast(); // an old toast shouldn't float over the dialog (same as the account dialogs)
    setMenu(null);
    setDialog({ key: Date.now(), touched: {}, note: null, blocked: false, duplicateName: null, saving: false, ...next });
  }

  // Settings: Edit rank (name + belt). Prices: Edit prices. Staff have no dialog (view only).
  function openRank(rank, opener) {
    if (!isAdmin) return;
    const cls = classesRef.current.find((c) => c.id === rank.classId);
    const values = rankFormValues(rank);
    openDialog({
      type: 'rank',
      mode: 'edit',
      part: isPrices ? 'prices' : 'structure',
      classId: rank.classId,
      rankId: rank.id,
      values,
      initial: values,
      snapshot: { rank, cls }, // the rank as it was when the dialog opened (its version!)
      opener,
    });
  }

  function openAddRank(cls, opener) {
    if (!isAdmin) return;
    const addInfo = describeAddRank(classesRef.current, cls.id);
    const copied = addInfo?.copied;
    const values = {
      name: '',
      early: copied ? centsToInputText(copied.earlyCents) : '',
      day: copied ? centsToInputText(copied.dayCents) : '',
      priv: copied ? centsToInputText(copied.privateCents) : '',
      sparring: copied ? copied.sparringGear : false,
      // The new rank's belt starts as a copy of the class's last rank's (plain white if empty).
      belt: defaultBeltFor(classesRef.current.find((c) => c.id === cls.id) ?? cls),
    };
    openDialog({ type: 'rank', mode: 'add', part: 'all', classId: cls.id, rankId: null, values, initial: values, addInfo, snapshot: { cls }, opener });
  }

  function openAddClass(opener) {
    if (!isAdmin) return;
    const values = { name: '', awardId: null };
    openDialog({ type: 'class', mode: 'add', part: 'name', classId: null, values, initial: values, opener });
  }

  function openEditClass(cls, opener) {
    if (!isAdmin) return;
    // The SAVED final award: Not set, None (v0.62) or a rank. An award whose rank is gone shows
    // Not set. (awardId holds the "choice": null | FINAL_AWARD_NONE | rank id.)
    const saved = finalAwardChoiceOf(cls);
    const awardId = saved === FINAL_AWARD_NONE || cls.finalAward ? saved : null;
    const values = { name: cls.name, awardId };
    // Settings: Edit class (the name). Prices: Final award.
    openDialog({ type: 'class', mode: 'edit', part: isPrices ? 'award' : 'name', classId: cls.id, values, initial: values, snapshot: { cls }, opener });
  }

  function patchDialog(patch) {
    setDialog((current) => (current ? { ...current, ...patch } : current));
  }

  function changeValues(patch) {
    setDialog((current) => {
      if (!current || current.saving) return current;
      // Typing again clears "Unsaved changes" / "didn't save" (but not the blocking notes).
      const note = current.note && !BLOCKING_NOTES.includes(current.note) ? null : current.note;
      return { ...current, values: { ...current.values, ...patch }, note };
    });
  }

  function touch(field) {
    setDialog((current) => (current && !current.touched[field] ? { ...current, touched: { ...current.touched, [field]: true } } : current));
  }

  // Where focus goes when a dialog closes without saving.
  function focusAfterCancel(d) {
    if (d.type === 'delete') {
      focusLater(() => moreEl(d.id), () => d.opener);
    } else if (d.type === 'rank' && d.mode === 'add') {
      focusLater(() => d.opener, () => addRankEl(d.classId));
    } else if (d.type === 'rank') {
      focusLater(() => d.opener, () => rowEl(d.rankId));
    } else if (d.mode === 'add') {
      focusLater(() => d.opener, addClassEl);
    } else {
      focusLater(() => d.opener, () => toggleEl(d.classId));
    }
  }

  // Cancel / Close: always closes and throws changes away (but not while saving).
  function cancelDialog() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    setDialog(null);
    focusAfterCancel(d);
  }

  // Esc, a click on the dim backdrop, or the phone back arrow: close only if nothing changed.
  function requestClose() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    if (d.type === 'delete') {
      cancelDialog();
      return;
    }
    const dirty = d.type === 'rank' ? isRankFormDirty(d) : isClassFormDirty(d);
    if (!dirty) {
      cancelDialog();
      return;
    }
    if (!BLOCKING_NOTES.includes(d.note)) patchDialog({ note: 'UNSAVED' });
  }

  // How a dialog save reacts to anything but "ok" (contract §8.3, first column).
  function handleDialogProblem(status, typedName) {
    if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess(); // the screen locks; the dialog comes back after unlocking
    } else if (status === 'not_allowed') {
      patchDialog({ saving: false, note: 'NOT_ALLOWED', blocked: true });
      onRefreshProfile();
    } else if (status === 'stale' || status === 'not_found') {
      patchDialog({ saving: false, note: 'STALE_DIALOG', blocked: true });
      reloadQuiet();
    } else if (status === 'duplicate_name') {
      patchDialog({ saving: false, duplicateName: typedName });
    } else if (status === 'invalid') {
      patchDialog({ saving: false, note: 'INVALID_DIALOG' });
    } else {
      patchDialog({ saving: false, note: 'SAVE_FAILED' }); // network etc.: Save stays available
    }
  }

  // ----- Save: Add / Edit rank -----
  async function saveRank() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const classView = classesRef.current.find((c) => c.id === d.classId) ?? d.snapshot?.cls;
    const record = d.snapshot?.rank ?? null;
    const check = checkRankForm(d, classView, record);
    if (!check.canSave) return;
    if (check.sameAsSaved) {
      // Nothing really changed (e.g. "65" → "65.00"): just close, no call, no toast.
      setDialog(null);
      focusAfterCancel(d);
      return;
    }
    const token = line.begin();
    if (!token) return;
    patchDialog({ saving: true, note: null });
    const p = check.payload;
    // A save that throws counts as "didn't reach the database" (Save stays available in the dialog).
    // No retry for the line: the dialog's own Save is how this save is redone.
    let result = { status: 'error' };
    try {
      result =
        d.mode === 'add'
          ? await addRank({
              classId: d.classId,
              name: p.name,
              earlyCents: p.earlyCents,
              dayCents: p.dayCents,
              privateCents: p.privateCents,
              sparringGear: p.sparringGear,
              ...beltOf(p),
            })
          : await updateRank({
              rankId: d.rankId,
              expectedVersion: record.version,
              name: p.name,
              earlyCents: p.earlyCents,
              dayCents: p.dayCents,
              privateCents: p.privateCents,
              sparringGear: p.sparringGear,
              ...beltOf(p),
            });
    } catch {
      result = { status: 'error' };
    } finally {
      endSave(token, result.status);
    }
    if (result.status !== 'ok') {
      handleDialogProblem(result.status, p.name);
      return;
    }
    setDialog(null);
    const reloaded = reloadQuiet();
    if (d.mode === 'add') {
      const newId = result.id;
      showToast(T.TOAST_RANK_ADDED, {
        icon: false,
        action: line.undoAction(() => undoAddRank(newId, p.name, d.classId), { words: T.TOAST_RANK_ADDED }),
      });
      // Focus the new rank's row once it's on screen; else the Add rank button.
      focusLater(() => rowEl(newId), () => addRankEl(d.classId), reloaded, true);
    } else {
      const previous = {
        name: record.name,
        earlyCents: record.earlyCents,
        dayCents: record.dayCents,
        privateCents: record.privateCents,
        sparringGear: record.sparringGear,
        ...beltOf(record), // Undo puts the old belt back too
      };
      const savedVersion = result.version;
      const words = isPrices ? T.TOAST_PRICES_SAVED : T.TOAST_RANK_SAVED;
      showToast(words, {
        icon: false,
        action: line.undoAction(
          () =>
            runUndo(() => updateRank({ rankId: d.rankId, expectedVersion: savedVersion, ...previous }), {
              name: p.name,
              focus: { find: () => rowEl(d.rankId), fallback: () => addRankEl(d.classId) },
            }),
          { words },
        ),
      });
      focusLater(() => d.opener, () => rowEl(d.rankId));
    }
  }

  // ----- Save: Add / Edit class -----
  async function saveClass() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const record = d.snapshot?.cls ?? null;
    const check = checkClassForm(d, classesRef.current, school, record);
    if (!check.canSave) return;
    if (check.sameAsSaved) {
      setDialog(null);
      focusAfterCancel(d);
      return;
    }
    const token = line.begin();
    if (!token) return;
    patchDialog({ saving: true, note: null });
    const p = check.payload;
    let result = { status: 'error' }; // a save that throws counts as "didn't reach the database"
    try {
      result =
        d.mode === 'add'
          ? await addClass({ locationCode, name: p.name, ...finalAwardArgs(p.choice) })
          : await updateClass({ classId: d.classId, expectedVersion: record.version, name: p.name, ...finalAwardArgs(p.choice) });
    } catch {
      result = { status: 'error' };
    } finally {
      endSave(token, result.status);
    }
    if (result.status !== 'ok') {
      handleDialogProblem(result.status, p.name);
      return;
    }
    setDialog(null);
    const reloaded = reloadQuiet();
    if (d.mode === 'add') {
      const newId = result.id;
      setOpen(newId, true); // a newly added class opens, ready for its first rank
      showToast(T.TOAST_CLASS_ADDED, {
        icon: false,
        action: line.undoAction(() => undoAddClass(newId, p.name), { words: T.TOAST_CLASS_ADDED }),
      });
      focusLater(() => toggleEl(newId), addClassEl, reloaded, true);
    } else {
      // Both final-award values always go along (v0.62), so Undo puts None / Not set / a rank back.
      const previous = { name: record.name, ...finalAwardArgs(finalAwardChoiceOf(record)) };
      const savedVersion = result.version;
      const words = isPrices ? T.TOAST_AWARD_SAVED : T.TOAST_CLASS_SAVED;
      showToast(words, {
        icon: false,
        action: line.undoAction(
          () =>
            runUndo(() => updateClass({ classId: d.classId, expectedVersion: savedVersion, ...previous }), {
              name: p.name,
              focus: { find: () => toggleEl(d.classId), fallback: addClassEl },
            }),
          { words },
        ),
      });
      focusLater(() => d.opener, () => toggleEl(d.classId));
    }
  }

  // ===== Undo (contract §8.4) =====
  // Every toast's Undo button comes from line.undoAction(run, { words }): the save line runs `run`
  // as soon as no save is running (an Undo pressed during a save waits, and its toast says
  // "Undoing…"), shows "Undone" itself, and shows a failed or refused Undo in the page's bar. So each
  // run() below does the Undo, reloads and moves the keyboard focus itself, and answers the way the
  // line wants: { status: 'ok' }, { status: 'error' } (it never reached the database: the bar says so,
  // with Retry), { status: 'no_access' } (the screen locks), or a refusal { status, reason } where
  // reason is the sentence for the bar ("Couldn't undo: …", no Retry).

  // Turns the database's answer to an Undo into that answer.
  // name: the rank or class concerned (for "someone else changed …"); notEmptyName: the class that
  // "Undo add class" found with ranks in it.
  function undoAnswer(status, { name, notEmptyName = name }) {
    if (status === 'ok') return { status };
    if (status === 'no_access') {
      onNoAccess();
      return { status };
    }
    if (status === 'not_allowed') {
      onRefreshProfile();
      return { status, reason: T.couldntUndo(T.UNDO_REASON_NOT_ALLOWED_CLASSES) };
    }
    if (status === 'not_empty') return { status, reason: T.couldntUndo(T.undoReasonClassHasRanks(notEmptyName)) };
    if (['stale', 'not_found', 'duplicate_name', 'invalid'].includes(status)) {
      reloadQuiet(); // show what the other person did
      return { status, reason: T.couldntUndo(T.undoReasonSomeoneElse(name)) };
    }
    return { status: 'error' }; // network etc.: the bar's Retry sends the same undo again
  }

  // Sends the undo call and reacts to the answer (contract §8.3, last column).
  // focus: { find, fallback } — where keyboard focus goes after it worked: the row the Undo
  // changed, or (if that row is gone) the next sensible place, e.g. its class's Add rank button.
  async function runUndo(call, { name, notEmptyName = name, focus = null }) {
    const result = await call();
    const answer = undoAnswer(result.status, { name, notEmptyName });
    if (answer.status === 'ok') {
      const reloaded = reloadQuiet();
      if (focus) focusLater(focus.find, focus.fallback, reloaded);
    }
    return answer;
  }

  // "Undo" on "Rank added" deletes the new rank again — if nothing has touched it since.
  function undoAddRank(rankId, rankName, classId) {
    const check = checkUndoAddRank(classesRef.current, rankId);
    if (!check.ok) {
      if (check.reason === 'isFinalAward') {
        return { status: 'is_final_award', reason: T.couldntUndo(T.undoReasonRankIsFinalAward(check.rankName, check.className)) };
      }
      reloadQuiet();
      return { status: 'stale', reason: T.couldntUndo(T.undoReasonSomeoneElse(check.rankName ?? rankName)) };
    }
    return runUndo(() => deleteRank(check.rpcArgs), {
      name: rankName,
      focus: { find: () => rowEl(rankId), fallback: () => addRankEl(classId) },
    });
  }

  // "Undo" on "Class added" deletes the new class again — only while it has no ranks.
  function undoAddClass(classId, className) {
    const cls = classesRef.current.find((c) => c.id === classId);
    const name = cls?.name ?? className;
    if (cls && cls.ranks.length > 0) {
      return { status: 'not_empty', reason: T.couldntUndo(T.undoReasonClassHasRanks(cls.name)) };
    }
    return runUndo(
      () => deleteClass({ classId, expectedVersion: 1, expectedRankIds: [], expectedLostAwardClassIds: [], onlyIfEmpty: true }),
      { name, focus: { find: () => toggleEl(classId), fallback: addClassEl } },
    );
  }

  // ===== Reordering (optimistic: shown at once, saved right after) =====
  // kind 'ranks' (within classId) or 'classes'. movedId gets the "Not saved" tag if it fails.
  // The Undo of an order change is a toast action too (undoReorder): it saves the old order first and
  // shows it once the database has said yes (the line's bar reports a failed Undo, not this page).
  const saveOrder = (kind, classId, expectedIds, newIds) =>
    kind === 'ranks' ? reorderRanks({ classId, expectedIds, newIds }) : reorderClasses({ locationCode, expectedIds, newIds });
  const showOrder = (kind, classId, ids) =>
    dataRef.current.setLocalClasses((raw) => (kind === 'ranks' ? reorderRanksLocal(raw, classId, ids) : reorderClassesLocal(raw, ids)));
  // The moved rank's or class's name, for "Someone else changed … just now".
  function movedNameOf(kind, classId, movedId) {
    const list = classesRef.current;
    if (kind === 'ranks') return list.find((c) => c.id === classId)?.ranks.find((r) => r.id === movedId)?.name ?? 'this rank';
    return list.find((c) => c.id === movedId)?.name ?? 'this class';
  }

  async function doReorder({ kind, classId = null, expectedIds, newIds, movedId }) {
    const movedName = movedNameOf(kind, classId, movedId); // (read before the line is taken: nothing may throw between begin() and the try)
    const args = { kind, classId, expectedIds, newIds, movedId };
    const token = line.begin();
    if (!token) return;
    let result = { status: 'error' };
    try {
      showOrder(kind, classId, newIds);
      result = await saveOrder(kind, classId, expectedIds, newIds);
    } catch {
      result = { status: 'error' };
    } finally {
      endSave(token, result.status, () => doReorder(args));
    }
    const status = result.status;
    if (status === 'ok') {
      setFailedReorder(null);
      setBanner((current) => (current?.kind === 'reorder' ? null : current));
      const words = kind === 'ranks' ? T.TOAST_RANK_ORDER : T.TOAST_CLASS_ORDER;
      showToast(words, {
        icon: false,
        action: line.undoAction(
          () => undoReorder({ kind, classId, expectedIds: newIds, newIds: expectedIds, movedId, movedName }),
          { words },
        ),
      });
      reloadQuiet();
    } else if (status === 'no_access') {
      onNoAccess(); // the list reloads by itself after unlocking
    } else if (status === 'not_allowed') {
      setBanner({ text: T.NOT_ALLOWED });
      reloadQuiet();
      onRefreshProfile();
    } else if (['stale', 'not_found', 'invalid'].includes(status)) {
      setBanner({ text: T.someoneElseChanged(movedName) });
      reloadQuiet();
    } else {
      // Didn't reach the database: keep the new order on screen, mark the row, offer Retry.
      setFailedReorder({ kind, classId, newIds, movedId });
      setBanner({ kind: 'reorder', text: kind === 'classes' ? T.CLASS_ORDER_FAILED : T.RANK_ORDER_FAILED, retry: () => doReorder(args) });
    }
  }

  // The Undo of an order change (a toast action; expectedIds = the order saved now, newIds = the old one).
  async function undoReorder({ kind, classId, expectedIds, newIds, movedId, movedName }) {
    const result = await saveOrder(kind, classId, expectedIds, newIds);
    const answer = undoAnswer(result.status, { name: movedName });
    if (answer.status !== 'ok') return answer;
    setFailedReorder(null);
    setBanner((current) => (current?.kind === 'reorder' ? null : current));
    showOrder(kind, classId, newIds); // the old order, at once; the reload below confirms it
    // Focus the row that moved back (if its class is open), else its class line.
    focusLater(
      () => (kind === 'ranks' ? rowEl(movedId) : toggleEl(movedId)),
      () => (kind === 'ranks' ? toggleEl(classId) : addClassEl()),
    );
    reloadQuiet();
    return answer;
  }

  function moveRank(rank, delta) {
    const ids = rankOrderIds(classesRef.current, rank.classId);
    const from = ids.indexOf(rank.id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    doReorder({ kind: 'ranks', classId: rank.classId, expectedIds: ids, newIds: moveId(ids, from, to), movedId: rank.id });
    focusLater(() => moreEl(rank.id)); // keep focus on the moved rank's ⋯ button
  }

  function moveClass(cls, delta) {
    const ids = classOrderIds(classesRef.current);
    const from = ids.indexOf(cls.id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    doReorder({ kind: 'classes', expectedIds: ids, newIds: moveId(ids, from, to), movedId: cls.id });
    focusLater(() => moreEl(cls.id));
  }

  // Drag and drop (PC). group = 'classes' or a class id (its ranks).
  const drag = useReorderDrag({
    // Off while a save or an Undo runs (line.busy): the hook then marks every grip aria-disabled and
    // the shared Grip style grays it (L-06), so nothing is changed here per grip.
    enabled: isAdmin && layout.hasGrip && !line.busy && !screenLocked && dialog === null && data.status === 'ready',
    onDrop: (group, id, toIndex) => {
      if (group === 'classes') {
        const ids = classOrderIds(classesRef.current);
        doReorder({ kind: 'classes', expectedIds: ids, newIds: moveId(ids, ids.indexOf(id), toIndex), movedId: id });
      } else {
        const ids = rankOrderIds(classesRef.current, group);
        doReorder({ kind: 'ranks', classId: group, expectedIds: ids, newIds: moveId(ids, ids.indexOf(id), toIndex), movedId: id });
      }
    },
  });

  // ===== Delete (permanent, with a confirmation built from freshly re-read data) =====
  // The name of a rank or class as the screen shows it now (for "Someone else changed … just now").
  function nameOfItem(kind, id) {
    const list = classesRef.current;
    if (kind === 'rank') return list.flatMap((c) => c.ranks).find((r) => r.id === id)?.name ?? 'this rank';
    return list.find((c) => c.id === id)?.name ?? 'this class';
  }

  async function startDelete(kind, id, anchor) {
    const token = line.begin();
    if (!token) return;
    // The name for "Someone else changed … just now", read before the fresh list replaces the screen's.
    const askedName = nameOfItem(kind, id);
    // Re-read first, so the confirmation states what is true right now (contract §8.6).
    let fresh = { status: 'error' };
    try {
      fresh = await loadClassesAndRanks(locationCode);
    } catch {
      fresh = { status: 'error' };
    } finally {
      endSave(token, fresh.status); // a read, not a save: nothing for the line to redo
    }
    if (fresh.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (fresh.status !== 'ok') {
      setBanner({ text: loadFailedText, retry: retryLoad });
      return;
    }
    dataRef.current.setLocalClasses(() => fresh.classes); // show what was just read
    const description = kind === 'rank' ? describeRankDelete(fresh.classes, id) : describeClassDelete(fresh.classes, id);
    if (!description) {
      setBanner({ text: T.someoneElseChanged(askedName) }); // it's already gone
      return;
    }
    // A class's schedule time slots go with it (Schedule, decision Q1), so the confirmation
    // says how many. If the count can't be read, the dialog simply doesn't mention it.
    const slots = kind === 'class' ? await countSlotsForClass(id) : null;
    const slotCount = slots?.status === 'ok' ? slots.count : 0;
    const text = kind === 'rank' ? T.rankDeleteText(description) : T.classDeleteText(description, slotCount);
    // Remember where it was, for putting focus back afterwards.
    let classId = null;
    let index = -1;
    const sorted = [...fresh.classes].sort((a, b) => a.position - b.position);
    if (kind === 'rank') {
      const owner = sorted.find((c) => c.ranks.some((r) => r.id === id));
      classId = owner?.id ?? null;
      index = owner ? [...owner.ranks].sort((a, b) => a.position - b.position).findIndex((r) => r.id === id) : -1;
    } else {
      index = sorted.findIndex((c) => c.id === id);
    }
    openDialog({
      type: 'delete',
      kind,
      id,
      name: kind === 'rank' ? description.rankName : description.className,
      description,
      title: text.title,
      body: text.body,
      failed: false,
      classId,
      index,
      opener: anchor,
    });
  }

  async function confirmDelete() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const token = line.begin();
    if (!token) return;
    patchDialog({ saving: true, failed: false });
    const args = d.description.rpcArgs;
    let result = { status: 'error' }; // a delete that throws counts as "didn't reach the database"
    try {
      result = d.kind === 'rank' ? await deleteRank(args) : await deleteClass(args);
    } catch {
      result = { status: 'error' };
    } finally {
      endSave(token, result.status); // no retry for the line: the dialog's Delete is how it is redone
    }
    const status = result.status;
    if (status === 'ok') {
      setDialog(null);
      showToast(T.deletedToast(d.name), { icon: false }); // no Undo: deleting is permanent
      const reloaded = reloadQuiet();
      if (d.kind === 'rank') {
        // The row now at the same place, else the one before, else the class's Add rank button.
        focusLater(
          () => {
            const cls = classesRef.current.find((c) => c.id === d.classId);
            const ranks = cls?.ranks ?? [];
            const target = ranks[d.index] ?? ranks[d.index - 1];
            return target ? rowEl(target.id) : null;
          },
          () => addRankEl(d.classId),
          reloaded,
        );
      } else {
        // The next class's toggle, else the previous one's, else Add class.
        focusLater(
          () => {
            const list = classesRef.current;
            const target = list[d.index] ?? list[d.index - 1];
            return target ? toggleEl(target.id) : null;
          },
          addClassEl,
          reloaded,
        );
      }
    } else if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (status === 'not_allowed') {
      setDialog(null);
      setBanner({ text: T.NOT_ALLOWED });
      onRefreshProfile();
      focusLater(() => moreEl(d.id));
    } else if (['stale', 'not_found', 'invalid'].includes(status)) {
      setDialog(null);
      setBanner({ text: T.someoneElseChanged(d.name) });
      reloadQuiet();
      focusLater(() => moreEl(d.id));
    } else {
      patchDialog({ saving: false, failed: true }); // Delete stays available
    }
  }

  // ===== The ⋯ menu =====
  function openMenu(kind, item, anchor) {
    setMenu((current) => (current && current.id === item.id ? null : { kind, id: item.id, anchor }));
  }

  function closeMenu(reason) {
    const current = menu;
    setMenu(null);
    if (current && (reason === 'escape' || reason === 'tab')) current.anchor?.focus();
  }

  // What the open menu shows (looked up in the current data, so it's never out of date).
  function menuContent() {
    if (!menu) return null;
    if (menu.kind === 'rank') {
      const cls = classes.find((c) => c.ranks.some((r) => r.id === menu.id));
      const index = cls ? cls.ranks.findIndex((r) => r.id === menu.id) : -1;
      if (!cls) return null;
      const rank = cls.ranks[index];
      return {
        title: rank.name,
        subtitle: T.rankSheetLine(cls.name, rank),
        label: T.moreFor(rank.name),
        items: [
          // Under 360px the row has no pencil (v0.68), so Edit is offered here instead (v0.69).
          ...(isNarrowPhone ? [{ key: 'edit', label: T.EDIT_RANK, Icon: IconEdit, onSelect: () => openRank(rank, menu.anchor) }] : []),
          { key: 'up', label: T.MOVE_UP, Icon: IconArrowUp, disabled: line.busy || index === 0, onSelect: () => moveRank(rank, -1) },
          { key: 'down', label: T.MOVE_DOWN, Icon: IconArrowDown, disabled: line.busy || index === cls.ranks.length - 1, onSelect: () => moveRank(rank, 1) },
          { key: 'delete', label: T.DELETE_RANK, Icon: IconTrash, danger: true, separatorBefore: true, disabled: line.busy, onSelect: () => startDelete('rank', rank.id, menu.anchor) },
        ],
      };
    }
    const index = classes.findIndex((c) => c.id === menu.id);
    if (index === -1) return null;
    const cls = classes[index];
    return {
      title: cls.name,
      subtitle: T.rankCount(cls.rankCount),
      label: T.moreFor(cls.name),
      items: [
        { key: 'up', label: T.MOVE_UP, Icon: IconArrowUp, disabled: line.busy || index === 0, onSelect: () => moveClass(cls, -1) },
        { key: 'down', label: T.MOVE_DOWN, Icon: IconArrowDown, disabled: line.busy || index === classes.length - 1, onSelect: () => moveClass(cls, 1) },
        { key: 'delete', label: T.DELETE_CLASS, Icon: IconTrash, danger: true, separatorBefore: true, disabled: line.busy, onSelect: () => startDelete('class', cls.id, menu.anchor) },
      ],
    };
  }

  // ===== Keyboard: ↑ ↓ Enter on rank rows, and N for Add class =====
  // Every class line, then (if open) its ranks — the order they appear on the page.
  const rowKeys = classes.flatMap((c) => [classNavKey(c.id), ...(isOpen(c.id) ? c.ranks.map((r) => r.id) : [])]);
  const nav = useRowArrowNav({
    rowKeys,
    onOpen: (key) => {
      const rank = classesRef.current.flatMap((c) => c.ranks).find((r) => r.id === key);
      if (rank) openRank(rank, rowEl(key));
    },
  });

  const addClassShown = isAdmin && !isPrices && data.status === 'ready';
  useShortcutN({
    enabled: addClassShown && dialog === null && menu === null && !screenLocked && !line.busy && drag.state === null,
    onPress: () => openAddClass(addClassEl()),
  });

  // ===== Drawing =====
  const addClassButton = addClassShown ? (
    <button type="button" className="btn btn-primary" data-add-class aria-label={addClassLabel} onClick={(event) => openAddClass(event.currentTarget)}>
      {/* ti-plus = add new */}
      <IconPlus size={16} aria-hidden="true" />
      {T.ADD_CLASS}
    </button>
  ) : null;

  const ctx = {
    part,
    isAdmin,
    layout,
    columns: rankGridColumns({ hasGrip: layout.hasGrip, isWide, isTouch, isAdmin, part }),
    notSavedId: failedReorder?.movedId ?? null,
    drag: drag.state,
    gripProps: drag.gripProps,
    nav,
    // The rank open in a dialog right now gets the blue "selected" tint behind the dialog.
    // Every rank's belt by id — to draw the belt next to a "Testing for" name.
    beltById: new Map(classes.flatMap((c) => c.ranks.map((r) => [r.id, r]))),
    selectedRankId: dialog?.type === 'rank' && dialog.mode !== 'add' && !screenLocked ? dialog.rankId : null,
    menuFor: menu?.id ?? null,
    handlers: {
      onToggleClass: (id) => setOpen(id, !isOpen(id)),
      onEditClass: (cls, el) => openEditClass(cls, el),
      onMoreClass: (cls, el) => openMenu('class', cls, el),
      onOpenRank: (rank, el) => openRank(rank, el),
      onEditRank: (rank, el) => openRank(rank, el),
      onMoreRank: (rank, el) => openMenu('rank', rank, el),
      onAddRank: (cls, el) => openAddRank(cls, el),
    },
  };

  let body;
  if (data.status === 'loading' || data.status === 'idle') {
    body = <TestingSkeleton />;
  } else if (data.status === 'error') {
    // The first load failed: nothing to show. The bar shows under the top bar (PageBar).
    body = <PageBar text={loadFailedText} onRetry={() => dataRef.current.reload()} />;
  } else if (data.status === 'noAccess') {
    body = null; // the screen is about to lock
  } else if (classes.length === 0) {
    let emptyText = T.emptySchoolStaff(school);
    if (isAdmin) emptyText = isPrices ? T.emptySchoolPricesAdmin(school) : T.emptySchoolAdmin(school);
    body = <p className="tempty">{emptyText}</p>;
  } else {
    // A class being dragged to a new spot: a lifted copy of its line + the blue line go there.
    const classDrag = drag.state?.group === 'classes' ? drag.state : null;
    const moving = classDrag && classDrag.toIndex !== classDrag.fromIndex;
    const liftedClass = moving ? classes.find((c) => c.id === classDrag.id) : null;
    const landing = liftedClass ? (
      <>
        <div className="dropline dropline--class" aria-hidden="true" />
        <ClassLine cls={liftedClass} isOpen={false} ctx={ctx} lifted />
      </>
    ) : null;
    body = (
      <div
        className={`clist${layout.hasGrip ? ' has-grip' : ''}${isTouch ? ' is-touch' : ''}${isAdmin ? '' : ' is-staff'}`}
        {...nav.containerProps}
      >
        {classes.map((cls, index) => (
          <Fragment key={cls.id}>
            {moving && classDrag.gap === index && landing}
            <ClassBlock cls={cls} isOpen={isOpen(cls.id)} ctx={ctx} />
          </Fragment>
        ))}
        {moving && classDrag.gap === classes.length && landing}
      </div>
    );
  }

  // ----- The open dialog (never while locked: it comes back after unlocking) -----
  let dialogElement = null;
  if (dialog && !screenLocked) {
    const common = { isPhone, onCancel: cancelDialog, onRequestClose: requestClose, onChange: changeValues, onTouch: touch };
    if (dialog.type === 'rank') {
      const classView = classes.find((c) => c.id === dialog.classId) ?? dialog.snapshot?.cls;
      const rankView = dialog.rankId ? (classView?.ranks.find((r) => r.id === dialog.rankId) ?? dialog.snapshot?.rank) : null;
      dialogElement = (
        <RankDialog
          key={dialog.key}
          state={dialog}
          school={school}
          classView={classView}
          rankView={rankView}
          addInfo={dialog.addInfo}
          isAdmin={isAdmin}
          isWide={isWide}
          onSave={saveRank}
          {...common}
        />
      );
    } else if (dialog.type === 'class') {
      const record = dialog.classId ? (classes.find((c) => c.id === dialog.classId) ?? dialog.snapshot?.cls) : null;
      dialogElement = (
        <ClassDialog
          key={dialog.key}
          state={dialog}
          school={school}
          classes={classes}
          record={record}
          onSave={saveClass}
          {...common}
        />
      );
    } else {
      dialogElement = (
        // The shared confirm box (v1.008 / v1.103, v0.422): "Keep rank · Delete rank" or "Keep
        // class · Delete class", red (a delete is for good), first focus on Keep. While it works
        // the red button says "Deleting…" and Keep grays; a failure keeps its note under the buttons.
        <ConfirmBox
          key={dialog.key}
          title={dialog.title}
          keepLabel={dialog.kind === 'rank' ? T.KEEP_RANK : T.KEEP_CLASS}
          actionLabel={dialog.kind === 'rank' ? T.DELETE_RANK : T.DELETE_CLASS}
          actionIcon={IconTrash}
          busyLabel={T.DELETING}
          loses="forGood"
          busy={dialog.saving}
          failed={dialog.failed ? T.DELETE_FAILED : null}
          onConfirm={confirmDelete}
          onKeep={cancelDialog}
        >
          {dialog.body}
        </ConfirmBox>
      );
    }
  }

  const content = menu && !screenLocked ? menuContent() : null;

  return (
    <>
      {renderHeader(addClassButton)}
      {/* On the Prices tab this is the tab's panel; in Settings it is just a part of the page. */}
      <div {...(isPrices ? { role: 'tabpanel', id: panelId, 'aria-labelledby': tabId } : {})} className="tpanel">
        {banner && (
          // The line's bar (kind 'undo') says itself when its Retry is on its way; the page's own bars
          // (a failed reorder, a failed load) are "retrying" while anything runs.
          <PageBar
            text={banner.text}
            onRetry={banner.retry ? () => banner.retry() : undefined}
            retrying={banner.kind === 'undo' ? banner.retrying : line.busy}
            takeFocus={banner.takeFocus}
            onDismiss={() => setBanner(null)}
          />
        )}
        {body}
      </div>
      {content && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={content.title}
          subtitle={content.subtitle}
          label={content.label}
          items={content.items}
          onClose={closeMenu}
        />
      )}
      {dialogElement}
    </>
  );
}
