// ChartAndPricesTab.jsx — Board breaking's admin-only "Chart and prices" tab: the prices, the age line and the board chart.
// Why it exists: approved pictures C-admin-prices / C-admin-chart / C-admin-staffview, rulebook v1.300 (decisions Q4, Q5,
// Q7, v1.301). One price setting and one board chart serve every Board breaking event at both schools; only admins
// change them, so staff never see this tab (BoardBreaking.jsx doesn't mount it for them).
// This file is the "brain" of the tab, built the same way as Star's RubricsTab.jsx and Color belt's ClassesRanksTab.jsx:
//   - loads prices, age line and chart with ONE read (brk_settings_get, through useLiveLoad: quiet reload every 15
//     seconds, after unlocking and when the browser tab shows again, a skeleton only the first time)
//   - decides which dialog, ⋯ menu or banner is showing, and sends every change to the database (breakingApi.js)
//   - offers Undo for every save and every move (rule 1.4), never for Delete rank (the box says it can't be undone)
// The drawing is done by smaller files: chart/ChartViews.jsx (cards, groups, rows), chart/ChartDialogs.jsx (the three
// forms), chart/ChartFormDialog.jsx (their frame), chart/chartRules.js (the list edits and form checks).
//
// Rules worth knowing (the same as Classes and ranks):
//   - ONE change at a time: while a save is on its way, other changes are ignored (the save line, lib/saveLine.js; an
//     Undo pressed meanwhile waits its turn and the toast says "Undoing…").
//   - Dialog saves WAIT for the database. The typed values live HERE, not in the dialog, so a screen lock while a
//     dialog is open hides it and brings it back afterwards with everything still filled in.
//   - ONE version guards the prices, the age line and the WHOLE chart (the settings row's). Every chart change — edit,
//     add, delete, move — sends the whole new list (brk_save_chart replaces every row). A dialog sends the version it
//     was opened with, so a change someone else made meanwhile answers "stale": nothing is overwritten, the person is
//     told and the data reloads. After a good save the screen takes the new list and version at once (the database
//     remakes the rows' ids, so a rank is found by its group + name, chartRules.rankKey), then reloads quietly.
//   - Admin vs staff only changes what is SHOWN — the database enforces who may change what.
//   - No personal data here at all.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowDown, IconArrowUp, IconTrash } from '@tabler/icons-react';
import ConfirmBox from '../../components/ConfirmBox.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import PageBar from '../../components/PageBar.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import { loadSettings, saveChart, saveSettings } from '../../lib/breaking/breakingApi.js';
import { BANDS } from '../../lib/breaking/breakingRules.js';
import * as T from '../../lib/breaking/text/chart.js';
import { focusAfterDialog } from '../../lib/quietFocus.js';
import { useSaveLine } from '../../lib/saveLine.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../lib/useLiveLoad.js';
import { PHONE_QUERY, TOUCH_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import { AgeDialog, PricesDialog, RankDialog } from './chart/ChartDialogs.jsx';
import { AgeCard, ChartBlock, PricesCard } from './chart/ChartViews.jsx';
import {
  appendRank,
  checkAgeForm,
  checkPricesForm,
  checkRankForm,
  chartRowsForSave,
  groupChart,
  isAgeDirty,
  isPricesDirty,
  isRankDirty,
  moveRank,
  pricesToValues,
  rankKey,
  removeRank,
  replaceRank,
} from './chart/chartRules.js';
import '../testing/star/star.css'; // the cards' look (st-blk, st-bhead, st-trow …), shared with Star testing's Fees block
import '../../styles/breaking-chart.css';

// Which groups are open (all four at first). Kept outside the component so it survives leaving the page and coming
// back, for as long as the page is open (same as Color belt's open classes).
let openBands = [...BANDS];

// Notes that make Save unavailable until the dialog is closed and opened again.
const BLOCKING_NOTES = ['STALE_DIALOG', 'NOT_ALLOWED'];

// Finding things on the page (to put keyboard focus back after a dialog closes).
const find = (selector) => document.querySelector(selector);
const attr = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const editEl = (key) => find(`[data-brk-edit="${attr(key)}"]`);
const moreEl = (key) => find(`[data-brk-more="${attr(key)}"]`);
const addEl = (band) => find(`[data-brk-add="${band}"]`);
const toggleEl = (band) => find(`[data-brk-toggle="${band}"]`);
const pricesEl = () => find('[data-brk-edit-prices]');
const ageEl = () => find('[data-brk-edit-age]');
// The element, if it's still on the page and visible; otherwise null.
const usable = (element) => (element && element.isConnected && element.getClientRects().length > 0 ? element : null);

// The numbers a settings save sends, out of a settings object.
const settingsPayload = (s) => ({
  techCents: s.techCents,
  adultCents: s.adultCents,
  cardExtraCents: s.cardExtraCents,
  sameDayExtraCents: s.sameDayExtraCents,
  childMaxAge: s.childMaxAge,
});

export default function ChartAndPricesTab({ isAdmin, panelId, tabId, renderHeader, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange }) {
  const live = useLiveLoad({ key: 'settings', enabled: !screenLocked && isAdmin, load: () => loadSettings(), refreshMs: LIVE_REFRESH_MS });
  const settings = live.data?.settings ?? null;
  const chart = live.data?.chart ?? null;

  // Newest values for callbacks that run later (after a save, from a toast's Undo, …).
  const liveRef = useRef(live);
  const settingsRef = useRef(settings);
  const chartRef = useRef(chart);
  useLayoutEffect(() => {
    liveRef.current = live;
    settingsRef.current = settings;
    chartRef.current = chart;
  });

  // ----- Device -----
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);

  // ----- State -----
  const [openList, setOpenList] = useState(() => openBands);
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null); // { key, anchor }
  const [banner, setBanner] = useState(null); // { text, retry?, kind?, retrying?, takeFocus? }

  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
  });

  // This page's line of saves (lib/saveLine.js, R2-05): one at a time; an Undo pressed while a save runs waits its turn.
  // A failed Undo's bar goes to `banner` (kind 'undo').
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
  // Runs the call a save makes and ends the line from a `finally`, as lib/saveLine.js asks: a throw between begin and
  // end frees the line as "didn't save" instead of leaving it busy for good.
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

  // ----- Keyboard focus after a dialog closes (the same mechanism as Classes and ranks) -----
  // focusLater(findTarget, fallback, waitFor): after the next redraw (or once `waitFor` — a reload — has finished),
  // focus findTarget(); if that finds nothing, focus fallback().
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
    focusAfterDialog(target); // after a tap or click, without the focus ring (quietFocus.js)
    return undefined;
  });

  // ----- Reloading -----
  async function reloadQuiet() {
    const result = await liveRef.current.reload();
    if (result === 'error') setBanner({ text: T.LOAD_FAILED, retry: retryLoad });
    return result;
  }
  async function retryLoad() {
    const result = await liveRef.current.reload();
    if (result === 'ok') setBanner(null);
  }
  // After a good save: show the new numbers at once (with the version the database gave back), then read the truth.
  function applyLocal({ settings: nextSettings = null, chart: nextChart = null, version }) {
    const current = liveRef.current.data;
    if (!current) return;
    liveRef.current.setLocal({
      ...current,
      settings: { ...current.settings, ...(nextSettings ?? {}), version: Number.isInteger(version) ? version : current.settings.version },
      chart: nextChart ?? current.chart,
    });
  }

  // The database says this sign-in can't see data (locked on its side): lock the screen too.
  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  // Locking closes menus (they aren't brought back); focus returns to that ⋯ after unlocking.
  const menuBeforeLockRef = useRef(null);
  useEffect(() => {
    if (screenLocked) {
      setMenu((current) => {
        if (current) menuBeforeLockRef.current = current.key;
        return null;
      });
      return undefined;
    }
    const key = menuBeforeLockRef.current;
    if (!key) return undefined;
    menuBeforeLockRef.current = null;
    const frame = window.requestAnimationFrame(() => usable(moreEl(key))?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [screenLocked]);

  // Tell the App whether a dialog is showing (it makes the page behind unclickable).
  const modalShown = dialog !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange?.(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange?.(false), [onModalOpenChange]);

  // ----- Open / closed groups -----
  function toggleBand(band) {
    setOpenList((previous) => {
      const next = previous.includes(band) ? previous.filter((b) => b !== band) : [...previous, band];
      openBands = next;
      return next;
    });
  }

  // ===== Dialogs =====
  function openDialog(next) {
    clearToast(); // an old toast shouldn't float over the dialog
    setMenu(null);
    setDialog({ key: Date.now(), touched: {}, note: null, blocked: false, saving: false, ...next });
  }

  function openPrices(opener) {
    if (!isAdmin || !settingsRef.current) return;
    const values = pricesToValues(settingsRef.current);
    openDialog({ type: 'prices', values, initial: values, snapshot: settingsRef.current, opener });
  }
  function openAge(opener) {
    if (!isAdmin || !settingsRef.current) return;
    const values = { age: String(settingsRef.current.childMaxAge) };
    openDialog({ type: 'age', values, initial: values, snapshot: settingsRef.current, opener });
  }
  function openEditRank(row, opener) {
    if (!isAdmin || !settingsRef.current) return;
    const values = { name: row.rankName, technique: row.technique ?? '', tech: row.techBoards, adult: row.adultBoards };
    openDialog({ type: 'rank', mode: 'edit', band: row.band, rowKey: rankKey(row), values, initial: values, snapshot: settingsRef.current, opener });
  }
  function openAddRank(band, opener) {
    if (!isAdmin || !settingsRef.current) return;
    // A new rank starts like the one above it (the boards are the part people change least).
    const last = groupChart(chartRef.current ?? []).find((g) => g.band === band)?.rows.at(-1);
    const values = { name: '', technique: '', tech: last?.techBoards ?? 3, adult: last?.adultBoards ?? 0 };
    openDialog({ type: 'rank', mode: 'add', band, rowKey: null, values, initial: values, snapshot: settingsRef.current, opener });
  }

  function patchDialog(patch) {
    setDialog((current) => (current ? { ...current, ...patch } : current));
  }
  // update(values) → new values. Typing again clears "Unsaved changes" / "didn't save" (but not the blocking notes).
  function changeValues(patch) {
    setDialog((current) => {
      if (!current || current.saving) return current;
      const note = current.note && !BLOCKING_NOTES.includes(current.note) ? null : current.note;
      return { ...current, values: { ...current.values, ...patch }, note };
    });
  }
  function touch(field) {
    setDialog((current) => (current && !current.touched[field] ? { ...current, touched: { ...current.touched, [field]: true } } : current));
  }

  // Where focus goes when a dialog closes without saving.
  function focusAfterCancel(d) {
    if (d.type === 'prices') focusLater(() => d.opener, pricesEl);
    else if (d.type === 'age') focusLater(() => d.opener, ageEl);
    else if (d.type === 'delete') focusLater(() => moreEl(d.key2), () => d.opener);
    else if (d.mode === 'add') focusLater(() => d.opener, () => addEl(d.band));
    else focusLater(() => d.opener, () => editEl(d.rowKey));
  }

  function cancelDialog() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    setDialog(null);
    focusAfterCancel(d);
  }

  function isDirty(d) {
    if (d.type === 'prices') return isPricesDirty(d);
    if (d.type === 'age') return isAgeDirty(d);
    if (d.type === 'rank') return isRankDirty(d);
    return false;
  }

  // Esc, a click on the dim backdrop, the back arrow or the browser's Back: close only if nothing was typed; otherwise
  // "Unsaved changes. Save or cancel first."
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
  function handleDialogProblem(status) {
    if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess(); // the screen locks; the dialog comes back after unlocking
    } else if (status === 'not_allowed') {
      patchDialog({ saving: false, note: 'NOT_ALLOWED', blocked: true });
      onRefreshProfile();
    } else if (status === 'stale' || status === 'not_found') {
      patchDialog({ saving: false, note: 'STALE_DIALOG', blocked: true });
      reloadQuiet();
    } else if (status === 'invalid') {
      patchDialog({ saving: false, note: 'INVALID_DIALOG' });
    } else {
      patchDialog({ saving: false, note: 'SAVE_FAILED' }); // network etc.: Save stays available
    }
  }

  // The shared shape of every dialog save: check → (unchanged: just close) → call → toast.
  //   check   the form check (canSave, sameAsSaved)
  //   send    () → Promise of the database answer
  //   after   (result) → runs after "ok" (local update, toast, focus)
  async function runSave(check, send, after) {
    const d = dialogRef.current;
    if (!d || d.saving || !check.canSave) return;
    if (check.sameAsSaved) {
      // Nothing really changed: just close, no call, no toast.
      setDialog(null);
      focusAfterCancel(d);
      return;
    }
    if (!beginWrite()) return;
    patchDialog({ saving: true, note: null });
    const result = await inWrite(send);
    if (result.status !== 'ok') {
      handleDialogProblem(result.status);
      return;
    }
    setDialog(null);
    after(result);
    reloadQuiet();
  }

  // A toast with Undo (the save line's queued one: it waits for a save that is running).
  // focus: { find, fallback, name } — where keyboard focus goes after it worked, and what "Someone else changed [name]
  // just now …" names if the database refuses the Undo (R2-07).
  function toastWithUndo(text, undoCall, focus) {
    showToast(text, { icon: false, action: saveLine.undoAction(() => runUndo(undoCall, focus), { words: text }) });
  }

  // The toast's Undo, run by the save line: "Undone" when it worked, "Undo didn't save. …" with Retry when it didn't
  // reach the database, a refusal's own words (no Retry) when the database said no.
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
    if (['stale', 'not_found', 'invalid'].includes(status)) {
      reloadQuiet();
      return { status, reason: T.stale(focus?.name) };
    }
    return { status: 'error' }; // network etc.: the line's bar offers Retry, which sends the same undo again
  }

  // ----- Save: prices and age line (one database call, one version; Undo sends all five old values back) -----
  function savePrices() {
    const d = dialogRef.current;
    if (!d) return;
    const opened = d.snapshot;
    const check = checkPricesForm(d, opened);
    const old = settingsPayload(opened);
    runSave(
      check,
      () => saveSettings(opened.version, { ...old, ...check.payload }),
      (result) => {
        applyLocal({ settings: check.payload, version: result.version });
        toastWithUndo(T.TOAST_PRICES_SAVED, () => undoSettings(result.version, old), { find: pricesEl, name: T.NAME_PRICES });
        focusLater(() => d.opener, pricesEl);
      },
    );
  }
  function saveAge() {
    const d = dialogRef.current;
    if (!d) return;
    const opened = d.snapshot;
    const check = checkAgeForm(d, opened);
    const old = settingsPayload(opened);
    runSave(
      check,
      () => saveSettings(opened.version, { ...old, childMaxAge: check.age }),
      (result) => {
        applyLocal({ settings: { childMaxAge: check.age }, version: result.version });
        toastWithUndo(T.TOAST_AGE_SAVED, () => undoSettings(result.version, old), { find: ageEl, name: T.NAME_AGE });
        focusLater(() => d.opener, ageEl);
      },
    );
  }
  // Undo of a settings save: the old five numbers, with the NEW version the save returned.
  async function undoSettings(version, old) {
    const result = await saveSettings(version, old);
    if (result.status === 'ok') applyLocal({ settings: old, version: result.version });
    return result;
  }

  // ----- Save: the chart (always the WHOLE list; Undo sends the whole old list back) -----
  async function undoChart(version, previous) {
    const result = await saveChart(version, chartRowsForSave(previous));
    if (result.status === 'ok') applyLocal({ chart: previous, version: result.version });
    return result;
  }
  function saveRank() {
    const d = dialogRef.current;
    if (!d) return;
    const opened = d.snapshot; // its version goes with Save; a change by someone else meanwhile answers "stale"
    const current = chartRef.current ?? [];
    const check = checkRankForm(d, current, d.rowKey);
    const next = d.mode === 'add' ? appendRank(current, d.band, check.payload) : replaceRank(current, d.rowKey, check.payload);
    const newKey = rankKey({ band: d.band, rankName: check.payload.rankName });
    runSave(
      check,
      () => saveChart(opened.version, chartRowsForSave(next)),
      (result) => {
        applyLocal({ chart: next, version: result.version });
        // Undo: the old list. For Add, that takes the new rank away again.
        toastWithUndo(d.mode === 'add' ? T.TOAST_RANK_ADDED : T.TOAST_RANK_SAVED, () => undoChart(result.version, current), {
          find: () => editEl(d.mode === 'add' ? newKey : d.rowKey),
          fallback: () => addEl(d.band),
          name: T.NAME_CHART,
        });
        focusLater(() => editEl(newKey), () => addEl(d.band));
      },
    );
  }

  // ===== Move (Move up / Move down in the ⋯ menu) =====
  async function doMove(key, delta, retryFrom = null) {
    const current = retryFrom?.previous ?? chartRef.current;
    const version = retryFrom?.version ?? settingsRef.current?.version;
    if (!current || version === undefined) return;
    const next = moveRank(current, key, delta);
    if (next === current) return;
    if (!beginWrite()) return;
    const result = await inWrite(() => saveChart(version, chartRowsForSave(next)));
    const status = result.status;
    if (status === 'ok') {
      setBanner((b) => (b?.kind === 'move' ? null : b));
      applyLocal({ chart: next, version: result.version });
      toastWithUndo(T.TOAST_RANK_MOVED, () => undoChart(result.version, current), { find: () => moreEl(key), fallback: () => pricesEl(), name: T.NAME_CHART });
      reloadQuiet();
      focusLater(() => moreEl(key)); // keep focus on the moved rank's ⋯ button
    } else if (status === 'no_access') {
      onNoAccess(); // the data reloads by itself after unlocking
    } else if (status === 'not_allowed') {
      setBanner({ text: T.NOT_ALLOWED });
      reloadQuiet();
      onRefreshProfile();
    } else if (['stale', 'not_found', 'invalid'].includes(status)) {
      setBanner({ text: T.stale(T.NAME_CHART) });
      reloadQuiet();
    } else {
      // Didn't reach the database: nothing changed; offer Retry (the same move, same version).
      setBanner({ kind: 'move', text: T.MOVE_FAILED, retry: () => doMove(key, delta, { previous: current, version }) });
    }
  }

  // ===== Delete (the shared "are you sure?" box; permanent) =====
  function startDelete(row, anchor) {
    if (!settingsRef.current) return;
    openDialog({
      type: 'delete',
      band: row.band,
      key2: rankKey(row),
      name: row.rankName,
      title: T.deleteTitle(row.band, row.rankName),
      snapshot: settingsRef.current,
      failed: false,
      opener: anchor,
    });
  }
  async function confirmDelete() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const current = chartRef.current ?? [];
    const next = removeRank(current, d.key2);
    if (!beginWrite()) return;
    patchDialog({ saving: true, failed: false });
    const result = await inWrite(() => saveChart(d.snapshot.version, chartRowsForSave(next)));
    const status = result.status;
    if (status === 'ok') {
      setDialog(null);
      applyLocal({ chart: next, version: result.version });
      showToast(T.TOAST_RANK_DELETED, { icon: false }); // no Undo: the box said it can't be undone
      const reloaded = reloadQuiet();
      focusLater(() => addEl(d.band), () => toggleEl(d.band), reloaded);
    } else if (status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess();
    } else if (status === 'not_allowed') {
      setDialog(null);
      setBanner({ text: T.NOT_ALLOWED });
      onRefreshProfile();
      focusLater(() => moreEl(d.key2));
    } else if (['stale', 'not_found', 'invalid'].includes(status)) {
      setDialog(null);
      setBanner({ text: T.stale(T.NAME_CHART) });
      reloadQuiet();
      focusLater(() => moreEl(d.key2));
    } else {
      patchDialog({ saving: false, failed: true }); // Delete stays available
    }
  }

  // ===== The ⋯ menu =====
  function openMenu(row, anchor) {
    const key = rankKey(row);
    setMenu((current) => (current && current.key === key ? null : { key, anchor }));
  }
  function closeMenu(reason) {
    const current = menu;
    setMenu(null);
    if (current && (reason === 'escape' || reason === 'tab')) current.anchor?.focus();
  }
  // What the open menu shows (looked up in the current data, so it's never out of date).
  function menuContent() {
    if (!menu || !chart) return null;
    const group = groupChart(chart).find((g) => g.rows.some((r) => rankKey(r) === menu.key));
    const index = group ? group.rows.findIndex((r) => rankKey(r) === menu.key) : -1;
    if (index === -1) return null;
    const row = group.rows[index];
    const onlyOne = group.rows.length === 1;
    return {
      title: row.rankName,
      subtitle: T.sheetLine(row.band, row.technique, row.techBoards, row.adultBoards),
      label: T.moreFor(row.band, row.rankName),
      items: [
        { key: 'up', label: T.MOVE_UP, Icon: IconArrowUp, disabled: busy || index === 0, onSelect: () => doMove(menu.key, -1) },
        { key: 'down', label: T.MOVE_DOWN, Icon: IconArrowDown, disabled: busy || index === group.rows.length - 1, onSelect: () => doMove(menu.key, 1) },
        {
          key: 'delete',
          // The last rank of a group: shown gray WITH the reason (never red while it can't be used).
          label: onlyOne ? (
            <span className="st-menu-two">
              <span>{T.DELETE_RANK}</span>
              <span className="ev-menu-reason">{T.LAST_IN_GROUP}</span>
            </span>
          ) : (
            T.DELETE_RANK
          ),
          Icon: IconTrash,
          danger: !onlyOne,
          separatorBefore: true,
          disabled: busy || onlyOne,
          onSelect: () => startDelete(row, menu.anchor),
        },
      ],
    };
  }

  // ===== Drawing =====
  let body;
  if (live.status === 'loading' || live.status === 'idle') {
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
  } else if (live.status === 'error' && !settings) {
    // The first load failed: nothing to show, so the banner takes the page's place.
    body = <ErrorBanner text={T.LOAD_FAILED} onRetry={() => liveRef.current.reload()} />;
  } else if (!settings || !chart) {
    body = null; // noAccess: the screen is about to lock
  } else {
    const ctx = {
      isPhone,
      isTouch,
      childMaxAge: settings.childMaxAge,
      selectedKey: dialog?.type === 'rank' && dialog.mode === 'edit' && !screenLocked ? dialog.rowKey : null,
      menuFor: menu?.key ?? null,
      handlers: { onToggle: toggleBand, onEditRank: openEditRank, onMoreRank: openMenu, onAddRank: openAddRank },
    };
    body = (
      <>
        <PricesCard settings={settings} selected={dialog?.type === 'prices' && !screenLocked} onEdit={openPrices} />
        <AgeCard settings={settings} onEdit={openAge} />
        <ChartBlock groups={groupChart(chart)} openList={openList} ctx={ctx} />
      </>
    );
  }

  // ----- The open dialog (never while locked: it comes back after unlocking) -----
  let dialogElement = null;
  if (dialog && !screenLocked && settings) {
    const common = { state: dialog, isPhone, onChange: changeValues, onTouch: touch, onCancel: cancelDialog, onRequestClose: requestClose };
    if (dialog.type === 'prices') dialogElement = <PricesDialog key={dialog.key} {...common} saved={dialog.snapshot} onSave={savePrices} />;
    else if (dialog.type === 'age') dialogElement = <AgeDialog key={dialog.key} {...common} saved={dialog.snapshot} onSave={saveAge} />;
    else if (dialog.type === 'rank') dialogElement = <RankDialog key={dialog.key} {...common} chart={chart ?? []} onSave={saveRank} />;
    else {
      dialogElement = (
        <ConfirmBox
          key={dialog.key}
          title={dialog.title}
          keepLabel={T.KEEP_RANK}
          actionLabel={T.DELETE_RANK}
          actionIcon={IconTrash}
          busyLabel={T.DELETING}
          loses="forGood"
          busy={dialog.saving}
          failed={dialog.failed ? T.DELETE_FAILED : null}
          onKeep={cancelDialog}
          onConfirm={confirmDelete}
        >
          {T.DELETE_BODY}
        </ConfirmBox>
      );
    }
  }

  const content = menu && !screenLocked ? menuContent() : null;

  // Staff never get this tab; if the page is ever asked for anyway, it shows its header and nothing else.
  if (!isAdmin) return <>{renderHeader(null, null)}</>;

  return (
    <>
      {/* The header and tab bar, with the gray line the picture shows under the tabs (the parent draws both). */}
      {renderHeader(null, T.TAB_LINE)}
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel brk-chart">
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
        <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />
      )}
      {dialogElement}
    </>
  );
}
