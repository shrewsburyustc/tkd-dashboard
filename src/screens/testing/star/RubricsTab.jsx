// RubricsTab.jsx — the "Rubrics and prices" tab of Star testing: the list and everything you can
// do with it.
// Why it exists: approved mockup screens 1–12 (v0.66), decisions v0.58, v0.61, v0.63, v0.171.
// This file is the "brain" of the tab, built the same way as Color Belt's ClassesRanksTab.jsx:
//   - loads the shared rubrics and prices (useRubrics — reloads quietly after every change,
//     after unlocking, and when the browser tab becomes visible again). One set for both
//     schools, so it works on Both (v0.58).
//   - decides which dialog, ⋯ menu or banner is showing
//   - sends every change to the database (src/lib/star/rubricsApi.js) and reacts to the answer
//   - offers Undo for every save and every reorder (rule 1.4) — never for delete. Each Undo is
//     a second call that sends the NEW version the save returned; Undo of Add is a delete.
// The drawing is done by smaller files: DanBlock (Dan lines + category rows), SettingsBlocks
// (grade scale, assistant-class table, fees), the five dialogs, and the shared Dialog /
// RowMenu / ErrorBanner, and the shared "are you sure?" box (ConfirmBox) for Delete category
// (design review part 2, rulebook v0.518: "Keep category · Delete category", "Deleting…" while it
// works; Esc, a click outside and Back wait until it is done).
// Build phase 6 (gap mockups R11, rulebook v0.514) adds the "Result emails" block under Fees
// (ResultEmailsBlock) and its "Edit result email" dialog (ResultTextDialog). Its texts load with
// their own hook (useResultTexts), so a problem reading them never hides the rubrics; they save
// through resultsApi.setResultText with the version the dialog opened with, like the fees.
//
// Rules worth knowing (the same as Classes and ranks):
//   - ONE change at a time: while a save is on its way, other changes are ignored.
//   - Dialog saves WAIT for the database. Only reordering is "optimistic" (shown at once).
//   - The dialog's typed values live HERE, not in the dialog, so a screen lock while a dialog is
//     open hides it and brings it back afterwards with everything still filled in.
//   - "stale" = someone else changed the same thing since it was loaded. Nothing is overwritten;
//     the person is told and the data reloads. Fees and Dan settings save through ONE database
//     call with ONE version, so they can go stale against each other — handled the same way.
//   - Admin vs staff only changes what is SHOWN — the database enforces who may change what.
//   - No personal data here at all (no names of people except "last changed by", no dates of
//     birth, no emails).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowDown, IconArrowUp, IconTrash } from '@tabler/icons-react';
import ConfirmBox from '../../../components/ConfirmBox.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import PageBar from '../../../components/PageBar.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { someoneElseChanged } from '../../../components/text.js';
import { useSaveLine } from '../../../lib/saveLine.js';
import { centsToInputText } from '../../../lib/money.js';
import {
  addCategory,
  deleteCategory,
  loadRubrics,
  reorderCategories,
  updateAssistantTable,
  updateCategory,
  updateDanSettings,
  updateGradeValues,
} from '../../../lib/star/rubricsApi.js';
import { PHONE_QUERY, TOUCH_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { useReorderDrag } from '../../../lib/useReorderDrag.js';
import { useRowArrowNav } from '../../../lib/useRowArrowNav.js';
import AssistantTableDialog from './AssistantTableDialog.jsx';
import CategoryDialog from './CategoryDialog.jsx';
import DanBlock, { categoryColumns, danNavKey, dragGroup } from './DanBlock.jsx';
import DanSettingsDialog from './DanSettingsDialog.jsx';
import FeesDialog from './FeesDialog.jsx';
import GradeValuesDialog from './GradeValuesDialog.jsx';
import {
  categoryIds,
  checkAssistantForm,
  checkCategoryForm,
  checkDanForm,
  checkFeesForm,
  checkGradesForm,
  danFacts,
  isAssistantDirty,
  isCategoryDirty,
  isDanDirty,
  isFeesDirty,
  isGradesDirty,
  isOnlyFromClassCount,
  maxFor,
  moveId,
  reorderLocal,
  topGradeValue,
  totalCredits,
} from './rubricRules.js';
import { AssistantBlock, FeesBlock, GradeScaleBlock } from './SettingsBlocks.jsx';
import { useRubrics } from './useRubrics.js';
import { setResultText } from '../../../lib/star/resultsApi.js';
import { resultTextProblem } from '../../../lib/star/resultEmail.js';
import * as R from '../../../lib/star/resultsText.js';
import ResultEmailsBlock from './ResultEmailsBlock.jsx';
import ResultTextDialog from './ResultTextDialog.jsx';
import { useResultTexts } from './useResultTexts.js';
import * as T from './text.js';
import { focusAfterDialog } from '../../../lib/quietFocus.js';

// Which Dans are open. Kept outside the component so it survives leaving the page and coming
// back, for as long as the page is open (same as Color Belt's open classes).
let openDans = [];

// Notes that make Save unavailable until the dialog is closed and opened again.
const BLOCKING_NOTES = ['STALE_DIALOG', 'NOT_ALLOWED'];

// Finding things on the page (for putting keyboard focus back after a dialog closes).
const find = (selector) => document.querySelector(selector);
const rowEl = (id) => find(`[data-star-row="${id}"]`);
const moreEl = (id) => find(`[data-star-more="${id}"]`);
const addEl = (dan) => find(`[data-star-add="${dan}"]`);
const danToggleEl = (dan) => find(`[data-star-dan-toggle="${dan}"]`);
const danEditEl = (dan) => find(`[data-star-dan-edit="${dan}"]`);
const feesEditEl = (dan) => find(`[data-star-edit-fees="${dan}"]`);
const gradesEditEl = () => find('[data-star-edit-grades]');
const assistantEditEl = () => find('[data-star-edit-assistant]');
const textEditEl = (kind) => find(`[data-star-edit-text="${kind}"]`);
// The element, if it's still on the page and visible; otherwise null.
const usable = (element) => (element && element.isConnected && element.getClientRects().length > 0 ? element : null);

const sameIds = (a, b) => a.length === b.length && a.every((id, index) => id === b[index]);

// What a number field shows when a dialog opens.
const numberText = (n) => (typeof n === 'number' && Number.isFinite(n) ? String(n) : '');
const gradeText = (n) => T.formatGrade(n);

export default function RubricsTab({ isAdmin, panelId, tabId, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange }) {
  const data = useRubrics({ enabled: !screenLocked });
  const rubrics = data.data; // { dans, grades, assistant } or null
  const dans = rubrics?.dans ?? [];
  const grades = rubrics?.grades ?? [];
  // The three result email texts (R11) — their own load, see useResultTexts.js.
  const textsData = useResultTexts({ enabled: !screenLocked });
  // The pass mark the Result emails block names ("Make-up below 245"): the Dans' shared one, or
  // null ("the pass mark") if they ever differ.
  const passMarks = [...new Set(dans.map((d) => d.passMark))];
  const sharedPassMark = passMarks.length === 1 ? passMarks[0] : null;

  // Newest values for callbacks that run later (after a save, from a toast's Undo, …).
  const dataRef = useRef(data);
  const rubricsRef = useRef(rubrics);
  const textsRef = useRef(textsData);
  useLayoutEffect(() => {
    dataRef.current = data;
    rubricsRef.current = rubrics;
    textsRef.current = textsData;
  });
  const danOf = (number) => rubricsRef.current?.dans.find((d) => d.dan === number) ?? null;
  const categoryOf = (id) => {
    for (const d of rubricsRef.current?.dans ?? []) {
      const c = d.categories.find((x) => x.id === id);
      if (c) return { dan: d, category: c };
    }
    return null;
  };

  // ----- Device -----
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const layout = { isPhone, isTouch };

  // ----- State -----
  const [openList, setOpenList] = useState(() => openDans);
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null); // { id, anchor }
  const [banner, setBanner] = useState(null); // { text, retry?, kind?, retrying?, takeFocus? }
  const [failedReorder, setFailedReorder] = useState(null); // { dan, newIds, movedId }

  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
  });
  // R2-05 (v1.125–v1.129): this page's line of saves. One at a time; an Undo pressed while a save runs
  // waits its turn ("Undoing…" on the toast). A failed Undo's bar goes to `banner` (kind 'undo').
  const saveLine = useSaveLine({
    section: T.SECTION_NAME,
    showToast,
    undoBar: (next) => setBanner((current) => (next ? { kind: 'undo', ...next } : current?.kind === 'undo' ? null : current)),
  });
  const busy = saveLine.busy;

  // ----- One change at a time (the save line holds it; an Undo waits for it) -----
  const tokenRef = useRef(null); // the token of the save that holds the line (only one does)
  function beginWrite() {
    const token = saveLine.begin();
    if (!token) return false;
    tokenRef.current = token;
    return true;
  }
  // Anything but "ok" also removes a visible Undo toast (it belonged to an earlier change).
  function endWrite(status) {
    saveLine.end(status, { token: tokenRef.current });
    if (status && status !== 'ok') clearToast();
  }
  // Runs the call a save makes (arguments included) and ends the line from a `finally`, as
  // lib/saveLine.js asks: a throw between begin and end frees the line as "didn't save" and goes on,
  // instead of leaving it busy for good with a queued Undo waiting.
  async function inWrite(call) {
    let ended = 'error'; // stays so when the call throws
    try {
      const answer = await call();
      ended = answer.status;
      return answer;
    } finally {
      endWrite(ended);
    }
  }

  // ----- Keyboard focus after a dialog closes (same mechanism as Classes and ranks) -----
  // focusLater(findTarget, fallback, waitFor): after the next redraw (or once `waitFor` — a
  // reload — has finished), focus findTarget(); if that finds nothing, focus fallback().
  const pendingFocusRef = useRef(null);
  const [, setFocusTick] = useState(0);
  function focusLater(findTarget, fallback = null, waitFor = null) {
    const request = { findTarget, fallback, waiting: Boolean(waitFor) };
    pendingFocusRef.current = request;
    setFocusTick((n) => n + 1);
    if (waitFor) {
      waitFor.finally(() => {
        if (pendingFocusRef.current !== request) return;
        request.waiting = false;
        setFocusTick((n) => n + 1);
      });
    }
  }
  useEffect(() => {
    const request = pendingFocusRef.current;
    if (!request || request.waiting || screenLocked || dialog) return undefined;
    const target = usable(request.findTarget?.()) ?? usable(request.fallback?.());
    // Right after a dialog closes the page is still "inert" for a moment: try the next frame.
    const stillInert = target && target.closest('[inert]');
    request.tries = (request.tries ?? 0) + 1;
    if (stillInert && request.tries < 30) {
      const frame = window.requestAnimationFrame(() => setFocusTick((n) => n + 1));
      return () => window.cancelAnimationFrame(frame);
    }
    pendingFocusRef.current = null;
    // After a tap or click, without the focus ring (it's for keyboard focus only — quietFocus.js).
    focusAfterDialog(target);
    return undefined;
  });

  // ----- Reloading -----
  async function reloadQuiet() {
    textsRef.current.reload(); // the result email texts too (quietly: a failure keeps the old ones)
    const result = await dataRef.current.reload();
    if (result === 'error') setBanner({ text: T.LOAD_FAILED, retry: retryLoad });
    return result;
  }
  async function retryLoad() {
    const result = await dataRef.current.reload();
    if (result === 'ok') setBanner(null);
  }

  // The database says this sign-in can't see data (locked on its side): lock the screen too.
  useEffect(() => {
    if (data.status === 'noAccess' || textsData.status === 'noAccess') onNoAccess();
  }, [data.status, textsData.status, onNoAccess]);

  // Locking closes menus (they aren't brought back); focus returns to that ⋯ after unlocking.
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
    const frame = window.requestAnimationFrame(() => usable(moreEl(id))?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [screenLocked]);

  // Tell the App whether a dialog is showing (it makes the page behind unclickable).
  const modalShown = dialog !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange?.(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange?.(false), [onModalOpenChange]);

  // A failed reorder keeps its "Not saved" tag until a reload shows the server's order again.
  useEffect(() => {
    if (!failedReorder) return;
    const dan = dans.find((d) => d.dan === failedReorder.dan);
    if (!dan || !sameIds(categoryIds(dan), failedReorder.newIds)) setFailedReorder(null);
  }, [dans, failedReorder]);

  // ----- Open / closed Dans -----
  function setOpen(danNumber, open) {
    setOpenList((previous) => {
      const next = open ? [...new Set([...previous, danNumber])] : previous.filter((d) => d !== danNumber);
      openDans = next;
      return next;
    });
  }
  const isOpen = (danNumber) => openList.includes(danNumber);

  // ===== Dialogs =====
  function openDialog(next) {
    clearToast(); // an old toast shouldn't float over the dialog
    setMenu(null);
    setDialog({ key: Date.now(), touched: {}, note: null, blocked: false, duplicateName: null, saving: false, ...next });
  }

  function openEditCategory(category, opener) {
    if (!isAdmin) return;
    const owner = categoryOf(category.id);
    if (!owner) return;
    const values = { name: category.name, credits: numberText(category.credits) };
    openDialog({ type: 'category', mode: 'edit', dan: owner.dan.dan, categoryId: category.id, values, initial: values, snapshot: category, opener });
  }

  function openAddCategory(dan, opener) {
    if (!isAdmin) return;
    const values = { name: '', credits: '' };
    openDialog({ type: 'category', mode: 'add', dan: dan.dan, categoryId: null, values, initial: values, snapshot: null, opener });
  }

  function openDanSettings(dan, opener) {
    if (!isAdmin) return;
    const values = { passMark: numberText(dan.passMark), starLimit: numberText(dan.starLimit) };
    openDialog({ type: 'dan', dan: dan.dan, values, initial: values, snapshot: dan, opener });
  }

  function openFees(dan, opener) {
    if (!isAdmin) return;
    const values = {
      standard: centsToInputText(dan.standardCents),
      sameDay: centsToInputText(dan.sameDayCents),
      private: centsToInputText(dan.privateCents),
    };
    openDialog({ type: 'fees', dan: dan.dan, values, initial: values, snapshot: dan, opener });
  }

  function openGrades(opener) {
    if (!isAdmin || !rubricsRef.current) return;
    const sorted = [...rubricsRef.current.grades].sort((a, b) => a.position - b.position);
    const values = sorted.map((g) => gradeText(g.value));
    openDialog({ type: 'grades', values, initial: values, snapshot: sorted, opener });
  }

  function openAssistant(opener) {
    if (!isAdmin || !rubricsRef.current) return;
    const a = rubricsRef.current.assistant;
    const values = { age: numberText(a.childMaxAge), child: a.childMins.map(numberText), adult: a.adultMins.map(numberText) };
    openDialog({ type: 'assistant', values, initial: values, snapshot: a, opener });
  }

  // Edit result email (R11): the text as it was when the dialog opened is the snapshot — its
  // version goes with Save, its body comes back with Undo.
  function openResultText(kind, opener) {
    const record = textsRef.current.texts?.[kind];
    if (!isAdmin || !record) return;
    const values = { body: record.body };
    openDialog({ type: 'resultText', kind, values, initial: values, snapshot: record, opener });
  }

  function patchDialog(patch) {
    setDialog((current) => (current ? { ...current, ...patch } : current));
  }

  // update(values) → new values. Typing again clears "Unsaved changes" / "didn't save" (but not
  // the blocking notes).
  function changeValues(update) {
    setDialog((current) => {
      if (!current || current.saving) return current;
      const note = current.note && !BLOCKING_NOTES.includes(current.note) ? null : current.note;
      return { ...current, values: update(current.values), note };
    });
  }

  function touch(field) {
    setDialog((current) => (current && !current.touched[field] ? { ...current, touched: { ...current.touched, [field]: true } } : current));
  }

  // Where focus goes when a dialog closes without saving.
  function focusAfterCancel(d) {
    if (d.type === 'delete') focusLater(() => moreEl(d.id), () => d.opener);
    else if (d.type === 'category' && d.mode === 'add') focusLater(() => d.opener, () => addEl(d.dan));
    else if (d.type === 'category') focusLater(() => d.opener, () => rowEl(d.categoryId));
    else if (d.type === 'dan') focusLater(() => d.opener, () => danEditEl(d.dan));
    else if (d.type === 'fees') focusLater(() => d.opener, () => feesEditEl(d.dan));
    else if (d.type === 'grades') focusLater(() => d.opener, gradesEditEl);
    else if (d.type === 'resultText') focusLater(() => d.opener, () => textEditEl(d.kind));
    else focusLater(() => d.opener, assistantEditEl);
  }

  function cancelDialog() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    setDialog(null);
    focusAfterCancel(d);
  }

  function isDirty(d) {
    if (d.type === 'category') return isCategoryDirty(d);
    if (d.type === 'dan') return isDanDirty(d);
    if (d.type === 'fees') return isFeesDirty(d);
    if (d.type === 'grades') return isGradesDirty(d);
    if (d.type === 'assistant') return isAssistantDirty(d);
    if (d.type === 'resultText') return d.values.body !== d.initial.body;
    return false;
  }

  // Esc, a click on the dim backdrop, the back arrow or the browser's Back: close only if
  // nothing was typed; otherwise "Unsaved changes. Save or cancel first."
  function requestClose() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    if (d.type === 'delete' || !isDirty(d)) {
      cancelDialog();
      return;
    }
    if (!BLOCKING_NOTES.includes(d.note)) patchDialog({ note: 'UNSAVED' });
  }

  // How a dialog save reacts to anything but "ok" (as Classes and ranks).
  function handleDialogProblem(status, typedName = null) {
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

  // The shared shape of every dialog save: check → (unchanged: just close) → call → toast.
  //   check     the form check (canSave, sameAsSaved, payload)
  //   send      (payload) → Promise of the database answer
  //   after     (result, payload) → runs after "ok" (toast, focus)
  async function runSave(check, send, after, typedName) {
    const d = dialogRef.current;
    if (!d || d.saving || !check.canSave) return;
    if (check.sameAsSaved) {
      // Nothing really changed (e.g. "245" → "245.0"): just close, no call, no toast.
      setDialog(null);
      focusAfterCancel(d);
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const result = await inWrite(() => send(check.payload));
    if (result.status !== 'ok') {
      handleDialogProblem(result.status, typedName);
      return;
    }
    setDialog(null);
    const reloaded = reloadQuiet();
    after(result, check.payload, reloaded, d);
  }

  // A toast with Undo. undoCall: () → Promise of the undo's database answer.
  // focus: { find, fallback, name } — where keyboard focus goes after it worked, and what "Someone
  // else changed [name] just now …" names if the database refuses the Undo (R2-07).
  // The Undo is the save line's queued one (R2-05): it waits for a save that is running.
  function toastWithUndo(text, undoCall, focus) {
    showToast(text, { icon: false, action: saveLine.undoAction(() => runUndo(undoCall, focus), { words: text }) });
  }

  // ----- Save: category -----
  function saveCategory() {
    const d = dialogRef.current;
    if (!d) return;
    const dan = danOf(d.dan);
    if (!dan) return;
    const record = d.mode === 'edit' ? (dan.categories.find((c) => c.id === d.categoryId) ?? d.snapshot) : null;
    // The version and old values are those of the category as it was when the dialog opened.
    const opened = d.snapshot;
    const check = checkCategoryForm(d, dan, record, rubricsRef.current.grades);
    if (d.mode === 'add') {
      runSave(
        check,
        (p) => addCategory(d.dan, p.name, p.credits),
        (result, p, reloaded) => {
          const newId = result.id;
          toastWithUndo(T.TOAST_CATEGORY_ADDED, () => deleteCategory(newId, result.version ?? 1), {
            find: () => addEl(d.dan),
            fallback: () => danToggleEl(d.dan),
            name: p.name,
          });
          focusLater(() => rowEl(newId), () => addEl(d.dan), reloaded);
        },
        check.payload?.name,
      );
    } else {
      runSave(
        check,
        (p) => updateCategory(d.categoryId, opened.version, p.name, p.credits),
        (result, p) => {
          toastWithUndo(T.TOAST_CATEGORY_SAVED, () => updateCategory(d.categoryId, result.version, opened.name, opened.credits), {
            find: () => rowEl(d.categoryId),
            fallback: () => addEl(d.dan),
            name: p.name,
          });
          focusLater(() => d.opener, () => rowEl(d.categoryId));
        },
        check.payload?.name,
      );
    }
  }

  // ----- Save: Dan settings and fees (one database call, one version) -----
  // Undo sends back ALL five old values with the new version.
  const danValues = (dan) => ({
    passMark: dan.passMark,
    starLimit: dan.starLimit,
    standardCents: dan.standardCents,
    sameDayCents: dan.sameDayCents,
    privateCents: dan.privateCents,
  });

  function saveDan() {
    const d = dialogRef.current;
    if (!d) return;
    const dan = danOf(d.dan) ?? d.snapshot;
    const opened = d.snapshot;
    const check = checkDanForm(d, opened, rubricsRef.current.grades);
    runSave(
      check,
      (p) => updateDanSettings(d.dan, opened.version, { ...danValues(opened), passMark: p.passMark, starLimit: p.starLimit }),
      (result) => {
        toastWithUndo(T.TOAST_DAN_SAVED, () => updateDanSettings(d.dan, result.version, danValues(opened)), {
          find: () => danEditEl(d.dan),
          fallback: () => danToggleEl(d.dan),
          name: dan.label,
        });
        focusLater(() => d.opener, () => danEditEl(dan.dan));
      },
    );
  }

  function saveFees() {
    const d = dialogRef.current;
    if (!d) return;
    const opened = d.snapshot;
    const check = checkFeesForm(d, opened);
    runSave(
      check,
      (p) => updateDanSettings(d.dan, opened.version, { ...danValues(opened), ...p }),
      (result) => {
        toastWithUndo(T.TOAST_FEES_SAVED, () => updateDanSettings(d.dan, result.version, danValues(opened)), {
          find: () => feesEditEl(d.dan),
          name: `${opened.label} fees`,
        });
        focusLater(() => d.opener, () => feesEditEl(d.dan));
      },
    );
  }

  // ----- Save: grade values -----
  function saveGrades() {
    const d = dialogRef.current;
    if (!d) return;
    const opened = d.snapshot; // the 7 grades (A+ … D) as they were when the dialog opened
    const check = checkGradesForm(d, opened, rubricsRef.current.dans);
    runSave(
      check,
      (p) => updateGradeValues(opened.map((g) => g.version), p.values),
      (result) => {
        toastWithUndo(T.TOAST_GRADES_SAVED, () => updateGradeValues(result.versions, opened.map((g) => g.value)), { find: gradesEditEl, name: 'the grade values' });
        focusLater(() => d.opener, gradesEditEl);
      },
    );
  }

  // ----- Save: assistant-class table -----
  function saveAssistant() {
    const d = dialogRef.current;
    if (!d) return;
    const opened = d.snapshot;
    const check = checkAssistantForm(d, opened);
    runSave(
      check,
      (p) => updateAssistantTable(opened.version, p.childMaxAge, p.childMins, p.adultMins),
      (result) => {
        toastWithUndo(
          T.TOAST_ASSISTANT_SAVED,
          () => updateAssistantTable(result.version, opened.childMaxAge, opened.childMins, opened.adultMins),
          { find: assistantEditEl, name: 'the assistant-class table' },
        );
        focusLater(() => d.opener, assistantEditEl);
      },
    );
  }

  // ----- Save: one result email text (R11, proposal 51) -----
  // The database checks the same rules as the dialog (migration 0023: invalid), the version (stale)
  // and that it's an admin (not_allowed), and logs the change. Undo sends the old text back with
  // the NEW version.
  function saveResultText() {
    const d = dialogRef.current;
    if (!d) return;
    const opened = d.snapshot;
    const body = d.values.body;
    const check = {
      canSave: !d.blocked && resultTextProblem(d.kind, body) === null,
      sameAsSaved: body === opened.body,
      payload: { body },
    };
    runSave(
      check,
      (p) => setResultText({ kind: d.kind, expectedVersion: opened.version, body: p.body }),
      (result) => {
        toastWithUndo(R.RESULT_TEXT_SAVED, () => setResultText({ kind: d.kind, expectedVersion: result.version, body: opened.body }), {
          find: () => textEditEl(d.kind),
          name: R.KIND_LABEL[d.kind] ? `the “${R.KIND_LABEL[d.kind]}” email` : 'this email',
        });
        focusLater(() => d.opener, () => textEditEl(d.kind));
      },
    );
  }

  // ===== Undo =====
  // The toast's Undo, run by the save line (R2-05): sends the undo call, and the line says how it went
  // — "Undone" when it worked, "Undo didn't save. Check the connection, then retry." with Retry when it
  // didn't reach the database, a refusal's own words (no Retry) when the database said no.
  // focus: { find, fallback, name } — where keyboard focus goes after it worked; the name for R2-07.
  async function runUndo(call, focus = null) {
    const result = await call();
    const status = result.status;
    if (status === 'ok') {
      const reloaded = reloadQuiet();
      if (focus) focusLater(focus.find, focus.fallback, reloaded);
      await reloaded;
      return { status: 'ok' };
    }
    if (status === 'no_access') {
      onNoAccess();
      return { status };
    }
    if (status === 'not_allowed') {
      onRefreshProfile();
      return { status, reason: T.NOT_ALLOWED };
    }
    if (['stale', 'not_found', 'duplicate_name', 'invalid'].includes(status)) {
      reloadQuiet();
      return { status, reason: T.stale(focus?.name) };
    }
    return { status: 'error' }; // network etc.: the line's bar offers Retry, which sends the same undo again
  }

  // ===== Reordering (optimistic: shown at once, saved right after) =====
  // The reorder call itself, shared by the move and its Undo: the new order shows at once, then the
  // database answers. Returns { status, version?, name } (name: the moved category's, for R2-07).
  async function sendReorder({ dan, expectedIds, newIds, movedId }) {
    dataRef.current.setLocal((current) => reorderLocal(current, dan, newIds));
    const result = await reorderCategories(dan, expectedIds, newIds);
    return { ...result, name: categoryOf(movedId)?.category.name ?? null };
  }
  async function doReorder({ dan, expectedIds, newIds, movedId }) {
    if (!beginWrite()) return;
    const result = await inWrite(() => sendReorder({ dan, expectedIds, newIds, movedId }));
    const status = result.status;
    if (status === 'ok') {
      setFailedReorder(null);
      setBanner((current) => (current?.kind === 'reorder' ? null : current));
      showToast(T.TOAST_ORDER_SAVED, {
        icon: false,
        // Undo = the reverse order, as the save line's queued Undo (R2-05)
        action: saveLine.undoAction(() => undoReorder({ dan, expectedIds: newIds, newIds: expectedIds, movedId }), { words: T.TOAST_ORDER_SAVED }),
      });
      reloadQuiet();
    } else if (status === 'no_access') {
      onNoAccess(); // the data reloads by itself after unlocking
    } else if (status === 'not_allowed') {
      setBanner({ text: T.NOT_ALLOWED });
      reloadQuiet();
      onRefreshProfile();
    } else if (['stale', 'not_found', 'invalid'].includes(status)) {
      setBanner({ text: T.stale(result.name) });
      reloadQuiet();
    } else {
      // Didn't reach the database: keep the new order on screen, mark the row, offer Retry.
      setFailedReorder({ dan, newIds, movedId });
      setBanner({ kind: 'reorder', text: T.ORDER_FAILED, retry: () => doReorder({ dan, expectedIds, newIds, movedId }) });
    }
  }
  // The Undo of a move: the same reorder the other way, run by the save line.
  async function undoReorder({ dan, expectedIds, newIds, movedId }) {
    const result = await sendReorder({ dan, expectedIds, newIds, movedId });
    const status = result.status;
    if (status === 'ok') {
      setFailedReorder(null);
      focusLater(() => rowEl(movedId), () => danToggleEl(dan));
      await reloadQuiet();
      return { status: 'ok' };
    }
    if (status === 'no_access') {
      onNoAccess();
      return { status };
    }
    if (status === 'not_allowed') {
      reloadQuiet();
      onRefreshProfile();
      return { status, reason: T.NOT_ALLOWED };
    }
    if (['stale', 'not_found', 'invalid'].includes(status)) {
      reloadQuiet();
      return { status, reason: T.stale(result.name) };
    }
    // Didn't reach the database: keep the order on screen, mark the row; the line's bar offers Retry.
    setFailedReorder({ dan, newIds, movedId });
    return { status: 'error' };
  }

  function moveCategory(category, delta) {
    const owner = categoryOf(category.id);
    if (!owner) return;
    const ids = categoryIds(owner.dan);
    const from = ids.indexOf(category.id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    doReorder({ dan: owner.dan.dan, expectedIds: ids, newIds: moveId(ids, from, to), movedId: category.id });
    focusLater(() => moreEl(category.id)); // keep focus on the moved category's ⋯ button
  }

  // Drag by the grip, every device (v0.63). group = dragGroup(dan).
  const drag = useReorderDrag({
    enabled: isAdmin && !busy && !screenLocked && dialog === null && data.status === 'ready',
    onDrop: (group, id, toIndex) => {
      const dan = rubricsRef.current?.dans.find((d) => dragGroup(d.dan) === group);
      if (!dan) return;
      const ids = categoryIds(dan);
      doReorder({ dan: dan.dan, expectedIds: ids, newIds: moveId(ids, ids.indexOf(id), toIndex), movedId: id });
    },
  });

  // ===== Delete (permanent, with a confirmation built from freshly re-read data) =====
  async function startDelete(categoryId, anchor) {
    if (!beginWrite()) return;
    // Re-read first, so the confirmation states what is true right now.
    const fresh = await inWrite(() => loadRubrics());
    if (fresh.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (fresh.status !== 'ok') {
      setBanner({ text: T.LOAD_FAILED, retry: retryLoad });
      return;
    }
    dataRef.current.setLocal(() => ({ dans: fresh.dans, grades: fresh.grades, assistant: fresh.assistant }));
    const dan = fresh.dans.find((d) => d.categories.some((c) => c.id === categoryId));
    const category = dan?.categories.find((c) => c.id === categoryId);
    if (!dan || !category) {
      setBanner({ text: T.stale(category?.name) }); // it's already gone
      return;
    }
    if (isOnlyFromClassCount(dan, category)) return; // can't be deleted (the menu item is gray)
    const newTotal = totalCredits(dan.categories) - category.credits;
    const newMax = maxFor(newTotal, topGradeValue(fresh.grades));
    openDialog({
      type: 'delete',
      id: categoryId,
      version: category.version,
      name: category.name,
      dan: dan.dan,
      index: dan.categories.findIndex((c) => c.id === categoryId),
      title: T.deleteTitle(category.name, dan.label),
      body: T.deleteBody(newTotal, newMax, dan.passMark),
      failed: false,
      opener: anchor,
    });
  }

  async function confirmDelete() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    if (!beginWrite()) return;
    patchDialog({ saving: true, failed: false });
    const result = await inWrite(() => deleteCategory(d.id, d.version));
    const status = result.status;
    if (status === 'ok') {
      setDialog(null);
      showToast(T.deletedToast(d.name), { icon: false }); // no Undo: deleting is permanent
      const reloaded = reloadQuiet();
      // The row now at the same place, else the one before, else the Dan's Add category button.
      focusLater(
        () => {
          const cats = danOf(d.dan)?.categories ?? [];
          const target = cats[d.index] ?? cats[d.index - 1];
          return target ? rowEl(target.id) : null;
        },
        () => addEl(d.dan),
        reloaded,
      );
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
      setBanner({ text: T.stale(d.name) });
      reloadQuiet();
      focusLater(() => moreEl(d.id));
    } else {
      patchDialog({ saving: false, failed: true }); // Delete stays available
    }
  }

  // ===== The ⋯ menu =====
  function openMenu(category, anchor) {
    setMenu((current) => (current && current.id === category.id ? null : { id: category.id, anchor }));
  }

  function closeMenu(reason) {
    const current = menu;
    setMenu(null);
    if (current && (reason === 'escape' || reason === 'tab')) current.anchor?.focus();
  }

  // What the open menu shows (looked up in the current data, so it's never out of date).
  function menuContent() {
    if (!menu) return null;
    const owner = categoryOf(menu.id);
    if (!owner) return null;
    const { dan, category } = owner;
    const index = dan.categories.findIndex((c) => c.id === category.id);
    const cantDelete = isOnlyFromClassCount(dan, category);
    return {
      title: category.name,
      subtitle: T.sheetLine(dan.label, category.credits),
      label: T.moreFor(category.name),
      items: [
        { key: 'up', label: T.MOVE_UP, Icon: IconArrowUp, disabled: busy || index === 0, onSelect: () => moveCategory(category, -1) },
        {
          key: 'down',
          label: T.MOVE_DOWN,
          Icon: IconArrowDown,
          disabled: busy || index === dan.categories.length - 1,
          onSelect: () => moveCategory(category, 1),
        },
        {
          key: 'delete',
          // Assistant Instructor: shown gray WITH the reason, so an admin who looks for it learns
          // why (approved detail, screen 5) — never red while it can't be used.
          label: cantDelete ? (
            <span className="st-menu-two">
              <span>{T.DELETE_CATEGORY}</span>
              <span className="ev-menu-reason">{T.CANT_DELETE_REASON}</span>
            </span>
          ) : (
            T.DELETE_CATEGORY
          ),
          Icon: IconTrash,
          danger: !cantDelete,
          separatorBefore: true,
          disabled: busy || cantDelete,
          onSelect: () => startDelete(category.id, menu.anchor),
        },
      ],
    };
  }

  // ===== Keyboard: ↑ ↓ Enter =====
  // Every Dan line, then (if open, admins) its categories — the order they appear on the page.
  const rowKeys = dans.flatMap((d) => [danNavKey(d.dan), ...(isAdmin && isOpen(d.dan) ? d.categories.map((c) => c.id) : [])]);
  const nav = useRowArrowNav({
    rowKeys,
    onOpen: (key) => {
      const owner = categoryOf(key);
      if (owner) openEditCategory(owner.category, rowEl(key));
    },
  });

  // ===== Drawing =====
  const aPlus = topGradeValue(grades);
  const ctx = {
    isAdmin,
    layout,
    columns: categoryColumns({ isAdmin, isTouch }),
    aPlus,
    notSavedId: failedReorder?.movedId ?? null,
    drag: drag.state,
    gripProps: drag.gripProps,
    gripsOff: busy, // L-06: while a save runs every grip is gray and aria-disabled (the shared Grip's `disabled`)
    nav,
    menuFor: menu?.id ?? null,
    // The category open in a dialog right now gets the blue "selected" tint behind the dialog.
    selectedId: dialog?.type === 'category' && dialog.mode === 'edit' && !screenLocked ? dialog.categoryId : null,
    handlers: {
      onToggleDan: (number) => setOpen(number, !isOpen(number)),
      onEditDan: (dan, el) => openDanSettings(dan, el),
      onEditCategory: (category, el) => openEditCategory(category, el),
      onMoreCategory: (category, el) => openMenu(category, el),
      onAddCategory: (dan, el) => openAddCategory(dan, el),
    },
  };

  let body;
  if (data.status === 'loading') {
    body = (
      <div className="clist tskeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING}</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (data.status === 'error' && !rubrics) {
    // The first load failed: nothing to show, so the banner takes the list's place.
    body = <ErrorBanner text={T.LOAD_FAILED} onRetry={() => dataRef.current.reload()} />;
  } else if (!rubrics) {
    body = null; // noAccess: the screen is about to lock
  } else {
    body = (
      <>
        <div className={`clist st-dlist${isTouch ? ' is-touch' : ''}${isAdmin ? '' : ' is-staff'}`} {...nav.containerProps}>
          {dans.map((dan) => (
            <DanBlock key={dan.dan} dan={dan} facts={danFacts(dan, grades)} isOpen={isOpen(dan.dan)} ctx={ctx} />
          ))}
        </div>
        <GradeScaleBlock grades={grades} isAdmin={isAdmin} onEdit={openGrades} />
        <AssistantBlock assistant={rubrics.assistant} isAdmin={isAdmin} isPhone={isPhone} onEdit={openAssistant} />
        <FeesBlock
          dans={dans}
          isAdmin={isAdmin}
          isPhone={isPhone}
          isTouch={isTouch}
          // The fees row stays tinted while its dialog is open (approved detail, screen 10).
          selectedDan={dialog?.type === 'fees' && !screenLocked ? dialog.dan : null}
          onEdit={openFees}
        />
        <ResultEmailsBlock
          status={textsData.status}
          texts={textsData.texts}
          passMark={sharedPassMark}
          isAdmin={isAdmin}
          isPhone={isPhone}
          isTouch={isTouch}
          // The row stays tinted while its dialog is open (as the fees rows).
          selectedKind={dialog?.type === 'resultText' && !screenLocked ? dialog.kind : null}
          onEdit={openResultText}
          onRetry={() => textsRef.current.reload()}
        />
      </>
    );
  }

  // ----- The open dialog (never while locked: it comes back after unlocking) -----
  let dialogElement = null;
  if (dialog && !screenLocked && rubrics) {
    const common = { state: dialog, isPhone, onCancel: cancelDialog, onRequestClose: requestClose, onTouch: touch };
    const setFields = (patch) => changeValues((values) => ({ ...values, ...patch }));
    if (dialog.type === 'category') {
      const dan = danOf(dialog.dan);
      const record = dialog.categoryId ? (dan?.categories.find((c) => c.id === dialog.categoryId) ?? dialog.snapshot) : null;
      if (dan) {
        dialogElement = (
          <CategoryDialog key={dialog.key} {...common} dan={dan} record={record} grades={grades} onChange={setFields} onSave={saveCategory} />
        );
      }
    } else if (dialog.type === 'dan') {
      dialogElement = <DanSettingsDialog key={dialog.key} {...common} dan={danOf(dialog.dan) ?? dialog.snapshot} grades={grades} onChange={setFields} onSave={saveDan} />;
    } else if (dialog.type === 'fees') {
      dialogElement = <FeesDialog key={dialog.key} {...common} dan={dialog.snapshot} onChange={setFields} onSave={saveFees} />;
    } else if (dialog.type === 'grades') {
      dialogElement = (
        <GradeValuesDialog
          key={dialog.key}
          {...common}
          grades={dialog.snapshot}
          dans={dans}
          onChange={(index, value) => changeValues((values) => values.map((v, i) => (i === index ? value : v)))}
          onSave={saveGrades}
        />
      );
    } else if (dialog.type === 'assistant') {
      dialogElement = (
        <AssistantTableDialog
          key={dialog.key}
          {...common}
          assistant={dialog.snapshot}
          dans={dans}
          onChange={(field, index, value) =>
            changeValues((values) =>
              field === 'age' ? { ...values, age: value } : { ...values, [field]: values[field].map((v, i) => (i === index ? value : v)) },
            )
          }
          onSave={saveAssistant}
        />
      );
    } else if (dialog.type === 'resultText') {
      dialogElement = (
        <ResultTextDialog
          key={dialog.key}
          state={dialog}
          record={textsData.texts?.[dialog.kind] ?? dialog.snapshot}
          passMark={sharedPassMark}
          rubrics={rubrics}
          isPhone={isPhone}
          isTouch={isTouch}
          onChange={(body) => changeValues((values) => ({ ...values, body }))}
          onSave={saveResultText}
          onCancel={cancelDialog}
          onRequestClose={requestClose}
          onNoAccess={onNoAccess}
        />
      );
    } else {
      dialogElement = (
        <ConfirmBox
          key={dialog.key}
          title={dialog.title}
          keepLabel={T.KEEP_CATEGORY}
          actionLabel={T.DELETE_CATEGORY}
          actionIcon={IconTrash}
          busyLabel={T.DELETING}
          loses="forGood"
          busy={dialog.saving}
          failed={dialog.failed ? T.DELETE_FAILED : null}
          onKeep={cancelDialog}
          onConfirm={confirmDelete}
        >
          {dialog.body}
        </ConfirmBox>
      );
    }
  }

  const content = menu && !screenLocked ? menuContent() : null;

  return (
    <>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel st-panel">
        {/* The page's bar shows under the top bar (PageBar, v1.128); an Undo's bar comes with takeFocus */}
        {banner && (
          <PageBar
            text={banner.text}
            onRetry={banner.retry ? () => banner.retry() : undefined}
            retrying={busy || Boolean(banner.retrying)}
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
