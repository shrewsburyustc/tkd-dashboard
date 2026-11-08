// Prospects.jsx — the Prospects section (rail icon ti-address-book, "Prospects"; rulebook v0.236, v0.244).
// Why it exists: every sign-up from a form becomes one prospect per child, and staff work them
// here until they join (or drop out). This file is the "brain" of the section, like Forms.jsx:
//   - loads the shown school's prospects and statuses (useProspects); on Both, Worcester's and
//     Shrewsbury's sections show one after the other, each with its own bar — never mixed
//   - the stage bar + chips (PipelineBar), the gray "Showing … only · Show all" line while the List
//     is filtered (R3-03), "Find a prospect" (SearchBox, left, above the list — R3-09; one box above
//     both schools on Both), the list (ProspectList), opening on
//     "Follow up today" (follow-ups due today or overdue, new sign-ups, "Did … come?", and free
//     classes whose class was cancelled)
//   - List or Board (v0.246): the switch next to the chips; each person's choice is remembered on
//     this device (the List the first time). The Board (Board.jsx) shows one column per stage;
//     cards drag to another column (useCardDrag.js) — New / Contacted save at once, Booked, Came
//     and Joined open their dialog first and Cancel leaves the card where it was
//   - a child's name is "Ava N." — the child's own last initial (v0.637; the parent's for children
//     who signed up before last names were asked)
//   - the profile window (ProspectPanel, v0.639): clicking a child opens it over the list on every
//     device (about 960px wide on a PC, nearly the whole width on a tablet, the whole page on a
//     phone). Book / Change time, Joined, Delete and the status menu open ON TOP of it (v1.100), so
//     Back closes only them. Focus: the window's heading when it opens, the child's row when it
//     closes. A typed note keeps the window open until it is saved or cancelled. While it is open,
//     the amber bar (a save refused, someone else's change) shows at the top of the window instead
//     of on the page behind it — never both.
//   - "+ Add prospect" (which form → Fill in, shared with Forms), Edit statuses, Book / Change /
//     Cancel a free class, Joined date, Delete (admins only)
// Admin vs staff only changes what is SHOWN — the database enforces who may change what.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconCurrencyDollarOff, IconDots, IconEdit, IconMapPin, IconPlus } from '@tabler/icons-react';
import ErrorBanner from '../components/ErrorBanner.jsx';
import IconButton from '../components/IconButton.jsx';
import RowMenu from '../components/RowMenu.jsx';
import { LOCATION_CODE } from '../lib/device.js';
import { PC_QUERY, PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { readStorage, writeStorage } from '../lib/storage.js';
import { useShortcutN } from '../lib/useShortcutN.js';
import { addDays } from '../lib/schedule/versions.js';
import { loadForms } from '../lib/forms/api.js';
import { useProspects } from '../lib/prospects/useProspects.js';
import { childInitial, isDueToday } from '../lib/prospects/followUps.js';
import { childFullName } from '../lib/prospects/child.js';
import { takeOpenProspect } from '../lib/prospects/openRequest.js';
import { usePrivateDetailsHidden } from '../lib/privateDetails.js';
import {
  addNote, addStatus, bookTime, cancelTime, checkIn, deleteProspect, deleteStatus, getProspect, markOpened, openTimesFor, reorderStatuses,
  searchProspects, setFollowUp, setStatus, undoCheckIn, updateStatus,
} from '../lib/prospects/api.js';
import { useFillIn } from './forms/useFillIn.js';
import PipelineBar, { SearchBox } from './prospects/PipelineBar.jsx';
import ProspectList from './prospects/ProspectList.jsx';
import Board from './prospects/Board.jsx';
import { useCardDrag } from './prospects/useCardDrag.js';
import ProspectPanel from './prospects/ProspectPanel.jsx';
import StatusesDialog, { checkStatusForm, isStatusFormDirty } from './prospects/StatusesDialog.jsx';
import { AddProspectDialog, BookTimeDialog, CameDialog, DeleteDialog, JoinedDialog, timeKey } from './prospects/Dialogs.jsx';
import * as T from './prospects/text.js';

const ALL_CODES = ['worcester', 'shrewsbury'];
// 'list' | 'board', remembered per person on this device (v0.246) — the front-desk PC is shared
const viewKey = (staffId) => `tkd.prospects.view.${staffId ?? 'anyone'}`;
const savedView = (staffId) => (readStorage(viewKey(staffId)) === 'board' ? 'board' : 'list');
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const emptyNote = () => ({ body: '', when: 'tomorrow', picked: null });
const usable = (el) => (el && el.isConnected && el.getClientRects().length > 0 ? el : null);
// A save that failed on the connection (lib/prospects/api.js answers 'error' for no connection or
// an answer it can't read), not a refusal: the box that asked for it (Delete prospect, Came,
// Joined, Book a free class) stays open with its amber note, and pressing its button again tries
// again (pass 2 U-01, rulebook v1.103). Every other answer is handled as before: a refusal
// (someone else changed it, it's gone, not allowed) closes the box and uses the page's bar.
const connectionFailed = (status) => status === 'error';
// "Follow up today" and the "Ava N." name come from followUps.js, shared with the Calendar (v0.615).

// Focus what `find` returns as soon as it can take focus. The page behind the profile window stays
// "inert" (unclickable, unfocusable) until the App has seen the window close, so this tries again
// on the next few screen frames (about a third of a second at most).
function focusSoon(find, tries = 20, preventScroll = false) {
  window.requestAnimationFrame(() => {
    const el = find();
    el?.focus({ preventScroll });
    if ((!el || document.activeElement !== el) && tries > 0) focusSoon(find, tries - 1, preventScroll);
  });
}

// profileName: the signed-in person's name, for the printed sheet's "Printed … by …" (v0.636)
export default function Prospects({ location, staffId, isAdmin, profileName = '', screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange, onBadgeRefresh }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const isPc = useMediaQuery(PC_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const both = location === 'Both';
  const codes = useMemo(() => (both ? ALL_CODES : [LOCATION_CODE[location]]), [both, location]);
  const pros = useProspects({ codes, enabled: !screenLocked });
  const data = pros.data;
  const today = data?.today ?? localToday();

  const [filters, setFilters] = useState({}); // code -> { kind: 'today' | 'all' | 'status', id }
  const [view, setViewState] = useState(() => savedView(staffId));
  const [boardCols, setBoardCols] = useState({}); // phone Board: code -> the stage shown
  const [search, setSearch] = useState('');
  // This device's "Hide private details" switch: while on, + Add prospect is desk-only (v0.616),
  // because its form always asks the parent's email and shows every answer as it is typed.
  const [privateHidden] = usePrivateDetailsHidden();
  // If the switch goes on (from another tab) while Add prospect's form chooser is open, close it.
  useEffect(() => {
    if (privateHidden) setDialog((d) => (d?.type === 'add' ? null : d));
  }, [privateHidden]);
  const [found, setFound] = useState(null); // { text, ids: code -> Set of ids }, while searching
  const [selected, setSelected] = useState(null); // { id, code, opener } — the child whose profile is open
  const [detail, setDetail] = useState(null); // the profile window's prospect
  const [detailFailed, setDetailFailed] = useState(null); // the child whose profile couldn't be read (P-02)
  const [note, setNote] = useState(emptyNote);
  const [noteWarning, setNoteWarning] = useState(false); // a typed note would be lost: say so
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef({});
  useLayoutEffect(() => {
    ref.current = { selected, detail, dialog, data, busy };
  });

  useEffect(() => {
    if (pros.status === 'noAccess') onNoAccess();
  }, [pros.status, onNoAccess]);
  const fill = useFillIn({
    isPhone,
    screenLocked,
    onNoAccess,
    onSent: () => {
      pros.reload();
      onBadgeRefresh?.();
    },
  });
  // The profile window is a dialog on every device (v0.639): the App makes the page behind it inert.
  const modalShown = (dialog !== null || fill.isOpen || selected !== null) && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);
  useEffect(() => {
    if (screenLocked) setMenu(null);
  }, [screenLocked]);

  // ----- Per school -----
  const schools = useMemo(() => {
    if (!data) return [];
    return codes.map((code) => {
      const statuses = data.statuses.filter((s) => s.locationCode === code).sort((a, b) => a.position - b.position);
      const statusById = new Map(statuses.map((s) => [s.id, s]));
      const all = data.lists[code] ?? [];
      const counts = new Map();
      for (const p of all) counts.set(p.statusId, (counts.get(p.statusId) ?? 0) + 1);
      // A No-show stays with the Booked children until staff change it (rulebook v0.610): it is a
      // card in the Booked column and is counted in the Booked tile. (`counts` stays the plain
      // count per status — deleting a status checks it.)
      const bookedStage = statuses.find((s) => s.builtin === 'booked') ?? null;
      const noShowIds = new Set(statuses.filter((s) => s.builtin === 'no_show').map((s) => s.id));
      const barCounts = new Map(counts);
      if (bookedStage) {
        const extra = all.filter((p) => noShowIds.has(p.statusId)).length;
        barCounts.set(bookedStage.id, (counts.get(bookedStage.id) ?? 0) + extra);
      }
      const due = all.filter((p) => isDueToday(p, statusById.get(p.statusId)?.builtin, today));
      // "Ava N." - the child's first name and own last initial (v0.637; the parent's for older sign-ups)
      const initials = new Map(all.map((p) => [p.id, childInitial(p)]));
      return { code, name: T.SCHOOL_NAME[code], statuses, statusById, all, counts, barCounts, bookedStage, noShowIds, due, initials };
    });
  }, [data, codes, today]);

  // ----- Search (in the database: names, or 4+ phone digits) -----
  useEffect(() => {
    const text = search.trim();
    if (text.length < 2) {
      setFound(null);
      return undefined;
    }
    let cancelled = false; // an answer that comes back after the text changed is thrown away
    const timer = window.setTimeout(async () => {
      const results = await Promise.all(codes.map((code) => searchProspects(code, text)));
      if (cancelled) return undefined;
      if (results.some((r) => r.status === 'no_access')) return onNoAccess();
      // `text` says which search these results belong to (the no-match line waits for the current one)
      setFound({ text, ids: Object.fromEntries(codes.map((code, i) => [code, new Set(results[i].status === 'ok' ? results[i].ids : [])])) });
      return undefined;
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, codes, onNoAccess]);

  // ----- The profile window -----
  // The id of the child the window shows, kept in a ref that changes at once (the `selected` state
  // only reaches ref.current after React re-draws, and an answer can come back before that).
  const selectedIdRef = useRef(null);
  function select(next) {
    selectedIdRef.current = next?.id ?? null;
    setSelected(next);
  }
  // A failure bar shown in a child's window goes when that window closes or another child opens,
  // however that happens (pass 2 X-1); a bar without a window owner stays until fixed or ×.
  useEffect(() => {
    setBanner((b) => (b?.scope === 'window' && b.owner !== (selected?.id ?? null) ? null : b));
  }, [selected?.id]);
  // The window's heading (PC / tablet) or its back arrow (phone): where focus goes inside it.
  const windowFocus = () => document.querySelector('.pp-dialog [data-profile-heading]') ?? document.querySelector('.dialog-page.pp-dialog [data-back]');
  // Loads a child's profile. An answer that comes back after another child was opened (a brother
  // or sister clicked while it loaded) or after the window closed is ignored: it must not replace
  // the profile shown, or leave the window on "Loading…". → the answer's status, or 'ignored'
  async function loadDetail(id) {
    const res = await getProspect(id);
    if (selectedIdRef.current !== id) return 'ignored';
    if (res.status === 'ok') {
      setDetail(res.prospect);
      setDetailFailed(null);
    } else if (res.status === 'no_access') {
      onNoAccess();
      // after the screen is unlocked the window offers Retry instead of "Loading…" for good
      if (ref.current.detail?.id !== id) setDetailFailed(id);
    } else if (res.status === 'not_found') {
      select(null);
      setDetail(null);
    } else if (ref.current.detail?.id !== id) {
      // the first read failed (a dropped connection): the window shows the amber bar with Retry
      // instead of "Loading…" for good (pass 2 P-02). A failed re-read after a save keeps the
      // profile already shown.
      setDetailFailed(id);
    }
    return res.status;
  }
  // Retry in the window's bar: read again (it shows "Loading…" meanwhile). The Retry button goes
  // away while it reads, so focus moves at once to the window's heading (or its back arrow on
  // phones), where Esc and Tab keep working; it stays there whatever the answer.
  async function retryDetail() {
    const id = selectedIdRef.current;
    if (!id) return;
    setDetailFailed(null);
    focusSoon(windowFocus);
    await loadDetail(id);
  }
  // A box whose save failed on the connection stays open with its note (U-01) — only if it is
  // still the same box (its key) when the answer comes back
  function keepOpenWithNote(g, note) {
    setDialog((x) => (x && x.key === g.key ? { ...x, saving: false, note } : x));
  }
  // After a save re-draws the window, the button that was pressed may be gone (Book became Change
  // time, a Check-in box closed, the status menu closed) or grayed while it saved; focus then sits
  // on the page itself, where Esc and Tab do nothing. Watch the next few frames and put it back in
  // the window (its heading, or the back arrow on phones).
  function keepFocusInWindow(frames = 10) {
    window.requestAnimationFrame(() => {
      if (!selectedIdRef.current) return; // the window closed
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) focusSoon(windowFocus);
      else if (frames > 0) keepFocusInWindow(frames - 1);
    });
  }
  // A note being typed is never silently lost (rulebook section 6): opening someone else (a brother
  // or sister) or closing the window waits until it is saved or cancelled.
  const noteRef = useRef(note);
  useLayoutEffect(() => {
    noteRef.current = note;
  });
  function noteInTheWay(nextId) {
    if (noteRef.current.body.trim() && ref.current.selected && ref.current.selected.id !== nextId) {
      setNoteWarning(true);
      return true;
    }
    return false;
  }
  async function openProspect(p, code, opener) {
    if (noteInTheWay(p.id)) return;
    clearToast();
    // A failure bar belongs to the child (or Board drop) it was made for: opening another child
    // clears it, so its Retry can never repeat that save inside this child's window (pass 2 X-1).
    setBanner(null);
    setNoteWarning(false);
    if (ref.current.selected?.id !== p.id) setNote(emptyNote());
    // the row that opened the window (a brother or sister opened inside it keeps the first one)
    const inWindow = Boolean(ref.current.selected); // a brother or sister opened inside the open window
    select({ id: p.id, code, opener: ref.current.selected?.opener ?? opener ?? null });
    setDetail(null);
    setDetailFailed(null);
    // Inside the window the link that was pressed goes away with the profile ("Loading…" takes its
    // place), so focus moves to the window's heading (or its back arrow on phones) at once —
    // never left on the page, where Esc and Tab do nothing (pass 2 P-02 review). A window that is
    // just opening puts it there itself.
    if (inWindow) focusSoon(windowFocus);
    const status = await loadDetail(p.id);
    // the window starts at its top, with focus on its heading (PC / tablet) or its back arrow (phone)
    // — unless another child was opened meanwhile (that one does this itself). When the read failed
    // the window shows the bar with Retry, and focus stays in the window too.
    if (status === 'ok') {
      window.requestAnimationFrame(() => {
        const box = document.querySelector('.tdialog.pp-dialog') ?? document.querySelector('.dialog-page.pp-dialog .dialog-page-body');
        if (box) box.scrollTop = 0;
      });
      focusSoon(windowFocus);
    } else if (status !== 'ignored' && selectedIdRef.current === p.id) focusSoon(windowFocus);
    if (!p.openedByMe) {
      await markOpened(p.id);
      pros.reload();
      onBadgeRefresh?.();
    }
  }
  // A follow-up tapped in the Calendar (v0.615): once the list has loaded, open that child. If it
  // was deleted meanwhile (e.g. by the automatic clean-up), say so instead of an empty panel —
  // in the amber bar, which stays until closed (v1.004: a problem never goes in a toast; N1).
  // (The request is taken only once the list is ready, so it is used exactly once.)
  useEffect(() => {
    if (pros.status !== 'ready' || !pros.data) return;
    const wanted = takeOpenProspect();
    if (!wanted) return;
    const code = codes.find((c) => (pros.data.lists[c] ?? []).some((p) => p.id === wanted));
    const item = code ? pros.data.lists[code].find((p) => p.id === wanted) : null;
    if (item) openProspect(item, code);
    else setBanner({ text: T.PROSPECT_GONE });
  }, [pros.status, pros.data]);
  function closePanel() {
    if (noteInTheWay(null)) return;
    const s = ref.current.selected;
    select(null);
    setDetail(null);
    setBanner((b) => (b?.scope === 'window' ? null : b)); // the window's own failure bar goes with it (X-1)
    // back on the child's row (or, when that child isn't in the list shown, the row that opened it)
    focusSoon(() => usable(document.querySelector(`[data-prospect-row="${s?.id}"]`)) ?? usable(s?.opener));
  }
  // `retry` = { key, run, undo, childId, windowOnly } (R2-01): what Retry does when this save fails on
  // the connection. The failure bar keeps `run` (Retry repeats the same call) and the `key`; a later
  // save with the same key that works takes that bar away. `undo: true` = it is an Undo, so the bar
  // says "Undo didn't save …". `childId` = the child the save was for; `windowOnly` = `run` works on
  // "the child in the open window", so it is dropped when that window is gone. `scope` says where
  // the bar shows: 'window' (the child's profile, and only while that child is open) or 'page'
  // (a Board drop, or a bar whose window closed). (Pass 2 X-1.)
  async function afterWrite(result, toastText, undo, retry) {
    setBusy(false);
    if (result.status === 'ok') {
      // this save worked: its own failure bar goes, and so does a failed-Undo bar for the same child
      // (it could only undo something older than this save)
      setBanner((b) => {
        if (!b) return b;
        if (retry && b.retryKey === retry.key) return null;
        if (retry?.childId && b.retryKey === `undo:${retry.childId}`) return null;
        return b;
      });
      await Promise.all([pros.reload(), selectedIdRef.current ? loadDetail(selectedIdRef.current) : null]);
      // no ✓ on any Prospects toast (R2-09, v1.046 (7)); a reversible change has a 5-second Undo
      if (toastText) showToast(toastText, undo ? { icon: false, action: { label: T.UNDO, onAction: undo } } : { icon: false });
      keepFocusInWindow();
      return true;
    }
    if (result.status === 'no_access') {
      onNoAccess();
      return false;
    }
    if (result.status === 'stale' || result.status === 'not_found') {
      setBanner({ text: T.STALE });
      pros.reload();
      if (selectedIdRef.current) loadDetail(selectedIdRef.current);
    } else if (result.status === 'not_allowed') {
      setBanner({ text: T.NOT_ALLOWED });
      onRefreshProfile();
    } else if (result.status === 'invalid') setBanner({ text: T.INVALID });
    else {
      // Whose bar is it? A save made in a child's window (`childId`) shows its bar there only while
      // that same child is still open. If the window closed or another child opened while the save
      // was on its way, the bar goes to the page, and a retry that reads "the open child" is dropped:
      // it could only change the wrong child (pass 2 X-1). Board drops and Undos know their child
      // themselves, so they keep their Retry.
      const mine = !retry?.childId || selectedIdRef.current === retry.childId;
      setBanner({
        text: retry?.undo ? T.UNDO_FAILED : T.SAVE_FAILED,
        retry: retry && (mine || !retry.windowOnly) ? retry.run : undefined,
        retryKey: retry?.key,
        scope: retry?.childId && mine ? 'window' : 'page',
        owner: retry?.childId ?? null,
      });
    }
    keepFocusInWindow();
    return false;
  }
  // The end of every Undo: the same checks as any save, then a short "Undone" when it worked
  // (v0.618 — no tick, no button, like Calendar, Schedule and the Testing sections). `run` is the
  // Undo itself, so a failed one keeps a bar whose Retry runs it again (R2-01): the toast is gone by then.
  async function afterUndo(result, run, key, childId) {
    if (await afterWrite(result, undefined, undefined, run ? { key, run, undo: true, childId } : undefined)) showToast(T.UNDONE, { icon: false });
  }
  const statusOfDetail = () => schools.find((s) => s.code === ref.current.selected?.code)?.statusById;

  // Undo for a status change (v1.006, N2; Joined too, v0.617): puts the old status back — and the
  // old joined date when the child was Joined before, otherwise none. Like the Board drop's Undo.
  function statusUndo(p, wasJoined, savedVersion) {
    const run = async () => {
      if (ref.current.busy) return;
      setBusy(true);
      const u = await setStatus({ id: p.id, expectedVersion: savedVersion, statusId: p.statusId, joinedOn: wasJoined ? p.joinedOn : null });
      afterUndo(u, run, `undo:${p.id}`, p.id);
    };
    return run;
  }

  async function changeStatus(statusId, opener = null) {
    const d = ref.current.detail;
    if (!d || busy || statusId === d.statusId) return;
    const st = statusOfDetail()?.get(statusId);
    if (st?.builtin === 'joined') {
      setDialog({ type: 'joined', key: Date.now(), name: d.childFirstName, statusId, date: today, saving: false, note: null, opener });
      return;
    }
    const wasJoined = statusOfDetail()?.get(d.statusId)?.builtin === 'joined'; // before the save (the panel may change school)
    setBusy(true);
    const r = await setStatus({ id: d.id, expectedVersion: d.version, statusId, joinedOn: null });
    afterWrite(r, T.STATUS_SAVED(st?.name ?? ''), statusUndo(d, wasJoined, r.version), { key: `status:${d.id}`, run: () => changeStatus(statusId, opener), childId: d.id, windowOnly: true });
  }
  async function saveJoined() {
    const g = ref.current.dialog;
    const d = g?.prospect ?? ref.current.detail;
    if (!d || !g) return;
    setDialog({ ...g, saving: true, note: null });
    const r = await setStatus({ id: d.id, expectedVersion: d.version, statusId: g.statusId, joinedOn: g.date });
    if (connectionFailed(r.status)) {
      // stays open with the picked date and the note; Save again tries again (U-01)
      keepOpenWithNote(g, 'BOX_SAVE_FAILED');
      return;
    }
    setDialog(null);
    // the status it had before: from the dropped card's school on the Board, else the open panel's
    const before = g.dropCode ? schools.find((s) => s.code === g.dropCode)?.statusById : statusOfDetail();
    const wasJoined = before?.get(d.statusId)?.builtin === 'joined';
    if ((await afterWrite(r, T.STATUS_SAVED(T.JOINED_TITLE), statusUndo(d, wasJoined, r.version))) && g.dropCode) flashStage(g.dropCode, g.statusId);
  }
  async function changeFollowUp(date) {
    const d = ref.current.detail;
    if (!d || busy) return;
    setBusy(true);
    const r = await setFollowUp({ id: d.id, expectedVersion: d.version, followUpOn: date });
    // A new follow-up date has a 5-second Undo that puts the old date back (v1.006, default 3); a
    // failed one keeps a bar whose Retry runs it again (R2-01)
    const undoRun = async () => {
      if (ref.current.busy) return;
      setBusy(true);
      const u = await setFollowUp({ id: d.id, expectedVersion: r.version, followUpOn: d.followUpOn ?? null });
      afterUndo(u, undoRun, `undo:${d.id}`, d.id);
    };
    afterWrite(r, T.FOLLOW_UP_SAVED(date), undoRun, { key: `followup:${d.id}`, run: () => changeFollowUp(date), childId: d.id, windowOnly: true });
  }
  async function saveNote({ set, date }) {
    const d = ref.current.detail;
    if (!d || busy) return;
    // A Retry pressed after the note was cleared or cancelled must not send an empty note: drop its bar
    if (!noteRef.current.body.trim()) {
      setBanner((b) => (b?.retryKey === `note:${d.id}` ? null : b));
      return;
    }
    setBusy(true);
    // the note as it is NOW (noteRef), not as it was when this function was made: a Retry pressed
    // after more typing must save, and then clear, that newer text
    const r = await addNote({ id: d.id, body: noteRef.current.body.trim(), setFollowUp: set, followUpOn: date });
    if (await afterWrite(r, T.NOTE_SAVED, undefined, { key: `note:${d.id}`, run: () => saveNote({ set, date }), childId: d.id, windowOnly: true })) {
      setNote(emptyNote());
      setNoteWarning(false);
    }
  }
  // Check in (or No-show) from the open window. (A Board card dropped on Came checks in inside its
  // own box instead: saveCame.)
  async function doCheckIn(came, afterClass) {
    const d = ref.current.detail;
    if (!d || busy) return;
    setBusy(true);
    const r = await checkIn({ id: d.id, expectedVersion: d.version, came, afterClass });
    return checkInDone(r, came, d, { key: `checkin:${d.id}`, run: () => doCheckIn(came, afterClass), childId: d.id, windowOnly: true });
  }
  // The end of a check-in (or No-show): the usual checks, the toast and its Undo (and, from the
  // window, the Retry of a failed one — R2-01)
  function checkInDone(r, came, d, retry) {
    const undoRun = async () => {
      if (ref.current.busy) return; // a second press of Retry while it runs does nothing
      setBusy(true);
      const u = await undoCheckIn({ id: d.id, expectedVersion: r.version, previousStatusId: r.previousStatusId, previousFollowUpOn: r.previousFollowUpOn });
      afterUndo(u, undoRun, `undo:${d.id}`, d.id);
    };
    return afterWrite(r, came ? T.CHECKED_IN(d.childFirstName) : T.MARKED_NOSHOW(d.childFirstName), undoRun, retry);
  }

  // ----- Book / change / cancel a free class -----
  async function openBook(target = null, dropCode = null, opener = null) {
    const d = target ?? ref.current.detail;
    if (!d) return;
    const change = Boolean(d.booking && d.booking.status === 'booked');
    setDialog({ type: 'book', key: Date.now(), prospect: d, dropCode, name: d.childFirstName, change, times: null, pick: null, saving: false, note: null, opener });
    const res = await openTimesFor({ id: d.id, from: today, to: addDays(today, 60) });
    setDialog((g) => (g && g.type === 'book' ? { ...g, times: res.status === 'ok' ? res.times : 'error' } : g));
    if (res.status === 'no_access') onNoAccess();
  }
  async function saveBook() {
    const g = ref.current.dialog;
    const d = g?.prospect ?? ref.current.detail;
    if (!d || !g || !g.pick) return;
    const t = g.times.find((x) => timeKey(x) === g.pick);
    setDialog({ ...g, saving: true, note: null });
    const r = await bookTime({ id: d.id, expectedVersion: d.version, formId: t.formId, classId: t.classId, date: t.date, start: t.start });
    if (r.status === 'time_taken') {
      const res = await openTimesFor({ id: d.id, from: today, to: addDays(today, 60) });
      setDialog((x) => (x ? { ...x, saving: false, note: 'TIME_TAKEN', pick: null, times: res.status === 'ok' ? res.times : x.times } : x));
      return;
    }
    if (connectionFailed(r.status)) {
      // stays open with the picked time and the note; Book again tries again (U-01)
      keepOpenWithNote(g, 'BOX_SAVE_FAILED');
      return;
    }
    if (r.status !== 'ok') {
      setDialog(null);
      afterWrite(r);
      return;
    }
    setDialog(null);
    // A first booking has a 5-second Undo that cancels it, like Cancel booking (v1.006, default 3). A
    // changed time has none: cancelling it would leave the child with no class at all.
    const undoRun = g.change ? undefined : async () => {
      if (ref.current.busy) return;
      setBusy(true);
      const u = await cancelTime({ id: d.id, expectedVersion: r.version });
      afterUndo(u, undoRun, `undo:${d.id}`, d.id);
    };
    if ((await afterWrite(r, T.BOOKED(d.childFirstName), undoRun)) && g.dropCode) {
      const booked = schools.find((x) => x.code === g.dropCode)?.statuses.find((s) => s.builtin === 'booked');
      if (booked) flashStage(g.dropCode, booked.id);
    }
  }
  async function doCancelBooking() {
    const d = ref.current.detail;
    if (!d || busy) return;
    setBusy(true);
    const r = await cancelTime({ id: d.id, expectedVersion: d.version });
    // the Undo books the same time again; a failed one keeps a bar whose Retry runs it again (R2-01)
    const undoRun = async () => {
      if (ref.current.busy) return; // a second press of Retry while it runs does nothing
      setBusy(true);
      const c = r.cancelled;
      const again = await bookTime({ id: d.id, expectedVersion: r.version, formId: c.formId, classId: c.classId, date: c.date, start: c.start });
      afterUndo(again.status === 'time_taken' ? { status: 'stale' } : again, undoRun, `undo:${d.id}`, d.id);
    };
    afterWrite(r, T.CANCELLED_BOOKING(d.childFirstName), undoRun, { key: `cancel:${d.id}`, run: doCancelBooking, childId: d.id, windowOnly: true });
  }

  // ----- The Board: List / Board, and dropping a card on another stage (v0.246) -----
  function setView(next, code = null, filter = null) {
    writeStorage(viewKey(staffId), next);
    setViewState(next);
    // each view starts on its own filter: the List on "Follow up today", the Board on everyone
    setFilters(code && filter ? { [code]: filter } : {});
    setSearch('');
  }
  // "Show all" in the gray "Showing … only" line (R3-03): shows everyone. The link goes away as it is
  // pressed, so when it had the keyboard focus, the focus goes to the chip or stage that was on (v1.119,
  // as the shared count cards do) — never lost to the page. A click or a tap must not scroll the page
  // (event.detail counts clicks; a key press is 0).
  function showAll(code, filter, event) {
    const wasFocused = document.activeElement === event.currentTarget;
    const keyOf = filter.kind === 'today' ? 'today' : filter.id;
    setFilters((x) => ({ ...x, [code]: { kind: 'all' } }));
    if (wasFocused) {
      const preventScroll = event.detail > 0;
      focusSoon(() => document.querySelector(`[data-prospects-school="${code}"] [data-filter-key="${keyOf}"]`), 3, preventScroll);
    }
  }
  // "Clear search" in the no-match line: empties the box and puts the focus back in it (the box's own ✕
  // does the same)
  function clearSearch(event) {
    setSearch('');
    const preventScroll = (event?.detail ?? 0) > 0;
    window.requestAnimationFrame(() => document.querySelector('.prospects input[type=search]')?.focus({ preventScroll }));
  }
  function goToStage(code, statusId) {
    if (isPhone) {
      setBoardCols((x) => ({ ...x, [code]: statusId }));
      return;
    }
    const col = document.querySelector(`[data-prospects-school="${code}"] [data-board-col="${statusId}"]`);
    col?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    col?.querySelector('.pbcol-head')?.focus({ preventScroll: true });
  }
  // After a drop is saved, the stage the card went to glows green for a moment (difference E):
  // the Board stays on its column, so this shows where the card landed.
  function flashStage(code, statusId) {
    window.requestAnimationFrame(() => {
      document.querySelectorAll(`[data-prospects-school="${code}"] [data-drop-status="${statusId}"]:is(.ptile, .pstage)`).forEach((el) => {
        el.classList.remove('is-flash');
        void el.offsetWidth; // restart the glow if it is already running
        el.classList.add('is-flash');
        window.setTimeout(() => el.classList.remove('is-flash'), 1500);
      });
    });
  }
  // The full prospect for a dialog (the list doesn't carry everything the dialogs need)
  // `retry` runs when the read fails on the connection (the bar's Retry, R2-01)
  async function fetchProspect(id, retry) {
    setBusy(true);
    const res = await getProspect(id);
    setBusy(false);
    if (res.status === 'ok') {
      // an earlier "Couldn't load that child" bar for this child is fixed now: it goes
      setBanner((b) => (b?.retryKey === `fetch:${id}` ? null : b));
      return res.prospect;
    }
    if (res.status === 'no_access') onNoAccess();
    else if (res.status === 'not_found') {
      setBanner({ text: T.STALE });
      pros.reload();
    } else {
      setBanner({ text: T.LOAD_ONE_FAILED, retry, retryKey: `fetch:${id}`, scope: 'page' });
      pros.reload();
    }
    return null;
  }
  async function dropCard(p, code, statusId) {
    const school = schools.find((x) => x.code === code);
    const to = school?.statusById.get(statusId);
    const from = school?.statusById.get(p.statusId);
    if (!to || busy || statusId === p.statusId) return;
    // a No-show sits in the Booked column (v0.610): letting it go there again changes nothing
    if (from?.builtin === 'no_show' && to.builtin === 'booked') return;
    clearToast();
    const booked = Boolean(p.booking && p.booking.status === 'booked');
    const again = () => dropCard(p, code, statusId); // what Retry does if reading the child fails
    if (to.builtin === 'booked' && !booked) {
      const d = await fetchProspect(p.id, again);
      if (d) openBook(d, code);
      return;
    }
    if (to.builtin === 'came') {
      const d = await fetchProspect(p.id, again);
      // a class still ahead can't be checked in yet: the dialog says when, with only "Keep in …"
      const ahead = Boolean(d?.booking && d.booking.status === 'booked' && d.booking.classRunning && !d.checkedInAt && d.booking.date > today);
      // the Board column the card sits in now, for "Keep in Booked" (N3): a No-show's card sits
      // in the Booked column (v0.610), every other card in its own status's column
      const column = from?.builtin === 'no_show' ? school?.bookedStage?.name ?? from.name : from?.name ?? '';
      if (d) setDialog({ type: 'came', key: Date.now(), prospect: d, statusId, askCame: p.askCame, ahead, column, dropCode: code, saving: false, note: null });
      return;
    }
    if (to.builtin === 'joined') {
      const d = await fetchProspect(p.id, again);
      if (d) setDialog({ type: 'joined', key: Date.now(), prospect: d, name: d.childFirstName, statusId, date: today, dropCode: code, saving: false, note: null });
      return;
    }
    setBusy(true);
    const r = await setStatus({ id: p.id, expectedVersion: p.version, statusId, joinedOn: null });
    if (r.status === 'ok') flashStage(code, statusId);
    const undoRun = async () => {
      if (ref.current.busy) return;
      setBusy(true);
      const u = await setStatus({ id: p.id, expectedVersion: r.version, statusId: p.statusId, joinedOn: from?.builtin === 'joined' ? p.joinedOn : null });
      afterUndo(u, undoRun, `undo:${p.id}`, p.id);
    };
    // a failed drop keeps a bar whose Retry drops the card again (R2-01)
    afterWrite(r, T.MOVED(p.childFirstName, to.name), undoRun, { key: `drop:${p.id}`, run: () => dropCard(p, code, statusId) });
  }
  // "Came": check the child in when there is a class to check in to, otherwise save the status
  async function saveCame() {
    const g = ref.current.dialog;
    if (!g) return;
    const d = g.prospect;
    const b = d.booking;
    const canCheckIn = Boolean(b && b.status === 'booked' && b.classRunning && !d.checkedInAt) && (g.askCame || b.date === today);
    if (canCheckIn) {
      // the check-in runs inside the box, like the status below: "Saving…" shows, and a dropped
      // connection keeps the box open with its note (pass 2 U-01)
      setDialog({ ...g, saving: true, note: null });
      setBusy(true);
      const c = await checkIn({ id: d.id, expectedVersion: d.version, came: true, afterClass: Boolean(g.askCame) });
      if (connectionFailed(c.status)) {
        setBusy(false);
        keepOpenWithNote(g, 'BOX_SAVE_FAILED');
        return;
      }
      setDialog(null);
      if (await checkInDone(c, true, d)) flashStage(g.dropCode, g.statusId);
      return;
    }
    // no class to check in to: save Came as the status (a class still ahead never gets here —
    // CameDialog only offers "Keep in …" then)
    setDialog({ ...g, saving: true, note: null });
    setBusy(true);
    const wasJoined = schools.find((s) => s.code === g.dropCode)?.statusById?.get(d.statusId)?.builtin === 'joined';
    const r = await setStatus({ id: d.id, expectedVersion: d.version, statusId: g.statusId, joinedOn: null });
    if (connectionFailed(r.status)) {
      // stays open with the note; Came again tries again (U-01)
      setBusy(false);
      keepOpenWithNote(g, 'BOX_SAVE_FAILED');
      return;
    }
    setDialog(null);
    // Undo like every other Board drop (v1.006)
    if (await afterWrite(r, T.MOVED(d.childFirstName, T.STEP_CAME), statusUndo(d, wasJoined, r.version))) flashStage(g.dropCode, g.statusId);
  }
  const drag = useCardDrag({ enabled: view === 'board' && !busy && !dialog && !selected && !screenLocked && !fill.isOpen, resetKey: location, onDrop: dropCard });

  // ----- Delete (admins) -----
  async function confirmDelete() {
    const d = ref.current.detail;
    const g = ref.current.dialog;
    if (!d || !g) return;
    setDialog({ ...g, saving: true, note: null });
    const r = await deleteProspect({ id: d.id, expectedVersion: d.version });
    if (connectionFailed(r.status)) {
      // stays open with "Couldn't delete …" under its buttons; Delete again tries again (U-01, U-08)
      keepOpenWithNote(g, 'DELETE_FAILED');
      return;
    }
    setDialog(null);
    if (r.status === 'ok') {
      select(null);
      setDetail(null);
      await pros.reload();
      onBadgeRefresh?.();
      showToast(T.DELETED(d.childFirstName), { icon: false });
    } else afterWrite(r);
  }

  // ----- Add prospect -----
  async function openAdd(opener) {
    if (privateHidden) return; // desk-only while private details are hidden (v0.616)
    clearToast();
    const school = both ? 'worcester' : codes[0];
    setDialog({ type: 'add', key: Date.now(), both, school, forms: null, allForms: null, opener });
    const res = await loadForms({ since: `${today.slice(0, 7)}-01` });
    const live = res.status === 'ok' ? res.forms.filter((f) => f.status === 'live') : 'error';
    setDialog((g) => (g && g.type === 'add' ? { ...g, allForms: live, forms: live === 'error' ? 'error' : live.filter((f) => f.locationCode === g.school) } : g));
  }
  function pickAddForm(form, opener) {
    setDialog(null);
    if (privateHidden) return; // the switch went on while the form chooser was open (another tab)
    fill.open(form, opener ?? document.querySelector('[data-prospects-add]'), { mode: 'fill' });
  }

  // ----- Statuses -----
  const statusSchool = dialog?.type === 'statuses' ? schools.find((s) => s.code === dialog.code) : null;
  function openStatuses(code) {
    const opener = menu?.anchor ?? null; // the page's ⋯, where focus goes back when it closes
    setMenu(null);
    setDialog({ type: 'statuses', key: Date.now(), code, opener, step: 'list', statusId: null, values: null, initial: null, touched: {}, saving: false, note: null, moveTo: null });
  }
  // Closing Edit statuses puts focus back on the ⋯ that opened it (as the Calendar's Event types
  // does), instead of leaving it on the page (WCAG 2.4.3; found while checking pass 1 step 1b).
  function closeStatuses() {
    const opener = ref.current.dialog?.opener;
    setDialog(null);
    focusSoon(() => usable(opener));
  }
  // Edit statuses changes steps inside one box (list ↔ Add / Edit status): move focus to the new
  // step's first field, or the box itself — otherwise Cancel / Discard changes / "← Edit statuses"
  // would leave focus nowhere and Esc would stop working (copied from Calendar's event types).
  const statusesStepNow = dialog?.type === 'statuses' ? dialog.step : null;
  useEffect(() => {
    if (!statusesStepNow) return;
    // Two frames: the new step has rendered (and a closing confirmation is gone) by then.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const role = statusesStepNow === 'delete' ? 'alertdialog' : 'dialog';
        const boxes = document.querySelectorAll(`[role="${role}"]`);
        const box = boxes[boxes.length - 1];
        (box?.querySelector('[data-autofocus]') ?? box)?.focus();
      }),
    );
  }, [statusesStepNow]);
  function statusesStep(step, s = null) {
    setDialog((g) => {
      if (!g) return g;
      const values = step === 'add' ? { name: '', kind: 'stage', color: 'gray' } : s ? { name: s.name, kind: s.kind, color: s.color } : null;
      // back on the list, focus goes to the row it came from (or "+ Add status" after Add), not the
      // first row (pass 1 step 1b; as Star's signature link, G5): `from` is read by the list step
      const from = step === 'list' ? (g.step === 'add' ? 'add' : g.statusId) : g.from;
      return { ...g, step, statusId: s?.id ?? null, from, values, initial: values, touched: {}, note: null, moveTo: null };
    });
  }
  async function saveStatusForm() {
    const g = ref.current.dialog;
    const school = schools.find((s) => s.code === g.code);
    const check = checkStatusForm(g, school.statuses);
    if (!check.canSave) return;
    setDialog({ ...g, saving: true, note: null });
    const st = school.statuses.find((s) => s.id === g.statusId);
    const r = g.step === 'add'
      ? await addStatus({ locationCode: g.code, ...check.payload })
      : await updateStatus({ id: g.statusId, expectedVersion: st.version, ...check.payload });
    if (r.status === 'ok') {
      await pros.reload();
      // back on the list with focus on the status just saved (a new one by its new id)
      setDialog((x) => (x ? { ...x, saving: false, step: 'list', from: g.step === 'add' ? r.id ?? 'add' : g.statusId } : x));
    } else {
      setDialog((x) => (x ? { ...x, saving: false, note: r.status === 'duplicate_name' ? 'DUPLICATE' : r.status === 'stale' ? 'STALE' : r.status === 'not_allowed' ? 'NOT_ALLOWED' : 'SAVE_FAILED' } : x));
      if (r.status === 'stale') pros.reload();
      if (r.status === 'no_access') onNoAccess();
    }
  }
  async function reorderStatus(s, toIndex) {
    const g = ref.current.dialog;
    const school = schools.find((x) => x.code === g.code);
    const ids = school.statuses.map((x) => x.id);
    const from = ids.indexOf(s.id);
    if (from < 0 || toIndex < 0 || toIndex >= ids.length || from === toIndex) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(toIndex, 0, s.id);
    const r = await reorderStatuses({ locationCode: g.code, expectedIds: ids, newIds: next });
    await pros.reload();
    if (r.status !== 'ok') setDialog((x) => (x ? { ...x, note: r.status === 'stale' ? 'STALE' : 'SAVE_FAILED' } : x));
  }
  async function confirmDeleteStatus() {
    const g = ref.current.dialog;
    const school = schools.find((x) => x.code === g.code);
    const st = school.statuses.find((s) => s.id === g.statusId);
    setDialog({ ...g, saving: true, note: null });
    const r = await deleteStatus({ id: st.id, expectedVersion: st.version, expectedCount: school.counts.get(st.id) ?? 0, moveToId: g.moveTo });
    await pros.reload();
    if (r.status === 'ok') setDialog((x) => (x ? { ...x, saving: false, step: 'list', statusId: null, from: null } : x));
    else if (r.status === 'no_access') {
      setDialog((x) => (x ? { ...x, saving: false } : x));
      onNoAccess();
    } else if (r.status === 'stale' || r.status === 'not_found') {
      // Someone else changed (or deleted) the status: the box steps back to the list, which was just
      // reloaded and shows their change, with a note that names it — as Calendar's Delete type does
      // (pass 2 U-03). Pressing Delete again could not work from the old box.
      setDialog((x) => (x ? { ...x, saving: false, step: 'list', statusId: null, from: g.statusId, moveTo: null, note: 'STALE_STATUS', noteName: st.name } : x));
    } else {
      // only a connection failure says "Couldn't delete … connection …" (pass 2 U-08); a refused
      // value keeps its own note
      const note = connectionFailed(r.status) ? 'DELETE_FAILED' : r.status === 'not_allowed' ? 'NOT_ALLOWED' : 'INVALID';
      setDialog((x) => (x ? { ...x, saving: false, note } : x));
    }
  }

  useShortcutN({ enabled: !privateHidden && !dialog && !selected && !screenLocked && pros.status === 'ready' && !fill.isOpen, onPress: () => openAdd(document.querySelector('[data-prospects-add]')) });

  // ===== What is on screen =====
  const stagesOf = (school) => school.statuses.filter((s) => s.kind === 'stage');
  // The profile window (v0.639): one child at a time, over the whole page, on every device.
  const profileSchool = selected ? schools.find((s) => s.code === selected.code) ?? null : null;
  const shownDetail = detail && selected && detail.id === selected.id ? detail : null;
  const selectedItem = selected ? profileSchool?.all.find((p) => p.id === selected.id) ?? null : null;
  let profileElement = null;
  if (selected && profileSchool && !screenLocked) {
    profileElement = (
      <ProspectPanel
        // "Ava Nguyen" (from the list while the profile loads)
        name={childFullName(shownDetail ?? selectedItem ?? {}) || T.LOADING_PANEL}
        detail={shownDetail}
        // the first read failed: the bar's words, and its Retry (P-02)
        loadFailed={!shownDetail && detailFailed === selected.id ? T.loadDetailFailed(selectedItem?.childFirstName ?? '') : null}
        onRetryLoad={retryDetail}
        listItem={selectedItem}
        statuses={profileSchool.statuses}
        statusById={profileSchool.statusById}
        today={today}
        isPc={isPc}
        isWide={isWide}
        isPhone={isPhone}
        isAdmin={isAdmin}
        busy={busy}
        note={note}
        idBase={`prospect-${selected.id}`}
        // every free-class date of the sign-up: the signature picture is kept 90 days after the latest
        familyBookingDates={shownDetail ? profileSchool.all.filter((p) => p.familyId === shownDetail.familyId).map((p) => p.booking?.date ?? null) : []}
        printedBy={profileName}
        // the amber bar shows in the window while it is open (the page's own bar is behind it)
        banner={banner && banner.scope !== 'page' ? banner : null} // a 'page' bar (a Board drop) waits on the page until the window closes
        onDismissBanner={() => setBanner(null)}
        // Print on a child that was deleted elsewhere (or by the 6-month clean-up): the window closes
        // and the page's bar says so; Retry could never work (pass 2 U-04)
        onGone={() => {
          select(null);
          setDetail(null);
          setBanner({ text: T.PROSPECT_GONE });
          pros.reload();
        }}
        onNote={(patch) => {
          setNote((n) => ({ ...n, ...patch }));
          if (patch.body === '') setNoteWarning(false);
        }}
        noteWarning={noteWarning}
        onClose={closePanel}
        onSaveNote={saveNote}
        onStatus={changeStatus}
        onFollowUp={changeFollowUp}
        onCheckIn={(came, afterClass) => doCheckIn(came, afterClass)}
        onBook={(e) => openBook(null, null, e?.currentTarget ?? null)}
        onCancelBooking={doCancelBooking}
        // a brother or sister opens in the same window (marked opened, like a row of the list)
        onOpenSibling={(id, opener) => openProspect(profileSchool.all.find((p) => p.id === id) ?? { id, openedByMe: true }, profileSchool.code, opener)}
        onDelete={(e) => setDialog({ type: 'delete', key: Date.now(), name: shownDetail.childFirstName, siblings: shownDetail.siblings.length > 0, saving: false, note: null, opener: e?.currentTarget ?? null })}
        onNoAccess={onNoAccess}
      />
    );
  }

  let body;
  if (pros.status === 'loading' && !data) {
    body = (
      <div className="sskeleton" aria-busy="true" aria-label={T.LOADING}>
        <div className="tskeleton-row">
          <span className="tskeleton-bar" />
        </div>
        <div className="tskeleton-row">
          <span className="tskeleton-bar" />
        </div>
      </div>
    );
  } else if (pros.status === 'error') {
    body = <ErrorBanner text={T.LOAD_FAILED} onRetry={() => pros.reload()} />;
  } else if (!data) {
    body = null;
  } else {
    body = schools.map((school) => {
      const board = view === 'board';
      // the Board always shows everyone (difference C); only search narrows it
      // a filter that points at a status that is gone (deleted meanwhile) counts as "everyone"
      const picked = filters[school.code];
      const pickedGone = picked?.kind === 'status' && !school.statusById.has(picked.id);
      const filter = board ? { kind: 'all' } : pickedGone ? { kind: 'all' } : picked ?? { kind: 'today' };
      const searching = found !== null;
      // the no-match line is only for the text the results were computed for (not during the 300 ms wait)
      const resultsFresh = searching && found.text === search.trim();
      let items = school.all;
      if (searching) items = items.filter((p) => found.ids[school.code]?.has(p.id));
      else if (filter.kind === 'today') items = school.due;
      else if (filter.kind === 'status' && !board) {
        // the Booked tile shows the No-shows too, like the Booked column (v0.610)
        const withNoShows = filter.id === school.bookedStage?.id;
        items = items.filter((p) => p.statusId === filter.id || (withNoShows && school.noShowIds.has(p.statusId)));
      }
      const onBoard = (p) => school.statusById.get(p.statusId)?.kind === 'stage' || school.noShowIds.has(p.statusId);
      const emptyText = school.all.length === 0 ? T.NO_PROSPECTS : filter.kind === 'today' ? T.NOBODY_TODAY : T.NOBODY;
      // "Showing follow up today only · Show all" (R3-03, v1.047 (10)): one gray line under the bar
      // while the List is filtered (the opening filter included, search not on). The Board always
      // shows everyone, so it gets none.
      const filterName = filter.kind === 'today' ? T.FOLLOW_UP_TODAY : filter.kind === 'status' ? school.statusById.get(filter.id)?.name ?? '' : null;
      const showingLine = !board && !searching && filterName !== null && (
        <p className="ev-filter-line cards-showing">
          {T.showingOnly(filterName)} ·{' '}
          <button type="button" className="link-button inline-link" onClick={(e) => showAll(school.code, filter, e)}>
            {T.SHOW_ALL}
          </button>
        </p>
      );
      // A search that finds nobody (R3-09): one line in the list's place, with a "Clear search" link
      // drawn like the "Showing … only" line. On the Board the same line replaces its own note.
      // Only when the school has no match at all: on the Board a match that is not a card (a Not
      // interested child) keeps the Board's own "Showing 0 of N" note, because the List would find them.
      const noMatchLine = resultsFresh && school.all.length > 0 && items.length === 0 && (
        <p className="ev-filter-line cards-showing pnomatch">
          {T.noMatch(search.trim())} ·{' '}
          <button type="button" className="link-button inline-link" aria-label={both ? T.clearSearchFor(school.name) : undefined} onClick={clearSearch}>
            {T.CLEAR_SEARCH}
          </button>
        </p>
      );
      return (
        <section key={school.code} className="psection" data-prospects-school={school.code} aria-label={both ? school.name : undefined}>
          {both && (
            <h2 className="pschool">
              <IconMapPin size={16} aria-hidden="true" />
              {school.name}
            </h2>
          )}
          <PipelineBar
            idBase={`prospects-${school.code}`}
            code={school.code}
            view={view}
            onView={(v) => v !== view && setView(v)}
            boardColumn={boardCols[school.code] ?? stagesOf(school)[0]?.id}
            onStage={(id) => goToStage(school.code, id)}
            stages={school.statuses.filter((s) => s.kind === 'stage')}
            exits={school.statuses.filter((s) => s.kind === 'exit')}
            counts={school.barCounts}
            todayCount={school.due.length}
            filter={searching ? { kind: 'search' } : filter}
            isPhone={isPhone}
            onFilter={(f) => {
              // on the Board, a side exit (No-show, Not interested) shows those children in the List
              if (board && f.kind === 'status') {
                setView('list', school.code, f);
                return;
              }
              setSearch('');
              setFilters((x) => ({ ...x, [school.code]: f }));
            }}
          />
          {/* In this order (v1.047 (15)): the stage bar and chips, "Showing … only", Find a prospect,
              then the list. On Both there is one box above the two schools instead. */}
          {showingLine}
          {!both && <SearchBox id={`prospects-${school.code}-search`} search={search} onSearch={setSearch} />}
          <div className="pbody">
            {board ? (
              <Board
                code={school.code}
                label={T.BOARD_LABEL(both ? school.name : '')}
                headingLevel={both ? 3 : 2}
                stages={stagesOf(school)}
                items={items}
                statusById={school.statusById}
                initials={school.initials}
                today={today}
                selectedId={selected?.id}
                isPhone={isPhone}
                isTouch={isTouch}
                column={boardCols[school.code]}
                onColumn={(id) => setBoardCols((x) => ({ ...x, [school.code]: id }))}
                drag={drag}
                noMatch={noMatchLine}
                searchNote={searching && !noMatchLine ? { shown: items.filter(onBoard).length, total: school.all.filter(onBoard).length, text: search.trim(), onClear: () => setSearch('') } : null}
                onOpen={(p, opener) => openProspect(p, school.code, opener)}
              />
            ) : noMatchLine ? (
              noMatchLine
            ) : (
              <ProspectList
                items={items}
                label={both ? `${T.PAGE_TITLE} · ${school.name}` : T.PAGE_TITLE}
                statusById={school.statusById}
                initials={school.initials}
                today={today}
                selectedId={selected?.id}
                isPhone={isPhone}
                emptyText={emptyText}
                onOpen={(p, opener) => openProspect(p, school.code, opener)}
              />
            )}
          </div>
        </section>
      );
    });
  }

  let dialogElement = null;
  // The profile window is itself a dialog (on every device since v0.639): a dialog opened from it
  // (Book / Change time, Joined, Delete) is drawn ON TOP of it (rulebook v1.100), so Back and Esc
  // close only that one and focus goes back to the window's button that opened it.
  const overProfile = Boolean(selected && !screenLocked);
  if (dialog && !screenLocked) {
    if (dialog.type === 'book') {
      dialogElement = <BookTimeDialog state={dialog} today={today} isPhone={isPhone} onTop={overProfile} onPick={(pick) => setDialog((g) => ({ ...g, pick, note: pick ? null : 'PICK' }))} onSave={saveBook} onCancel={() => !dialog.saving && setDialog(null)} />;
    } else if (dialog.type === 'joined') {
      dialogElement = <JoinedDialog state={dialog} today={today} isPhone={isPhone} onTop={overProfile} onChange={(date) => setDialog((g) => ({ ...g, date }))} onSave={saveJoined} onCancel={() => !dialog.saving && setDialog(null)} />;
    } else if (dialog.type === 'add') {
      dialogElement = (
        <AddProspectDialog
          state={dialog}
          isPhone={isPhone}
          onPickSchool={(school) => setDialog((g) => ({ ...g, school, forms: Array.isArray(g.allForms) ? g.allForms.filter((f) => f.locationCode === school) : g.forms }))}
          onPick={pickAddForm}
          onCancel={() => {
            const opener = dialog.opener;
            setDialog(null);
            window.requestAnimationFrame(() => usable(opener)?.focus());
          }}
        />
      );
    } else if (dialog.type === 'came') {
      dialogElement = <CameDialog state={dialog} onSave={saveCame} onCancel={() => !dialog.saving && setDialog(null)} />;
    } else if (dialog.type === 'delete') {
      dialogElement = <DeleteDialog state={dialog} onTop={overProfile} onConfirm={confirmDelete} onCancel={() => !dialog.saving && setDialog(null)} />;
    } else if (dialog.type === 'statuses' && statusSchool) {
      dialogElement = (
        <StatusesDialog
          state={dialog}
          statuses={statusSchool.statuses}
          counts={statusSchool.counts}
          schoolName={statusSchool.name}
          isAdmin={isAdmin}
          isPhone={isPhone}
          onStep={statusesStep}
          onChange={(patch, what) => setDialog((g) => (what === 'delete' ? { ...g, ...patch } : { ...g, values: { ...g.values, ...patch }, note: null }))}
          onTouch={(keys) => setDialog((g) => ({ ...g, touched: { ...g.touched, ...Object.fromEntries(keys.map((k) => [k, true])) } }))}
          onSave={saveStatusForm}
          onDelete={confirmDeleteStatus}
          onReorder={reorderStatus}
          onCancel={closeStatuses}
          onRequestClose={() => {
            // Esc / Back: the list closes; an Add / Edit status step goes back to the list, but with
            // a change it stays open with "Unsaved changes…" until Save or Cancel (like Calendar's
            // Event types; rulebook v0.46 / v1.027, design review N15).
            const g = ref.current.dialog;
            if (g.saving) return;
            if (g.step === 'list') closeStatuses();
            else if (!isStatusFormDirty(g)) statusesStep('list');
            else if (!g.note) setDialog({ ...g, note: 'UNSAVED' });
          }}
        />
      );
    }
  }

  const moreItems = codes.map((code) => ({ key: code, label: both ? `${T.EDIT_STATUSES} · ${T.SCHOOL_NAME[code]}` : T.EDIT_STATUSES, Icon: IconEdit, onSelect: () => openStatuses(code) }));

  return (
    <div className="prospects">
      <div className="phead">
        <div className="phead-titles">
          <h1 className="ptitle">{T.PAGE_TITLE}</h1>
          <p className="psub">{both ? T.BOTH_SCHOOLS : location}</p>
        </div>
        {/* grayed but still focusable while private details are hidden (v0.616); the line below says why */}
        <button
          type="button"
          className={`btn btn-primary${privateHidden ? ' is-unavailable' : ''}`}
          data-prospects-add
          aria-disabled={privateHidden ? 'true' : undefined}
          aria-describedby={privateHidden ? 'prospects-add-at-desk' : undefined}
          onClick={(e) => openAdd(e.currentTarget)}
        >
          <IconPlus size={16} aria-hidden="true" />
          {isPhone ? T.ADD_SHORT : T.ADD_PROSPECT}
        </button>
        {/* the page's ⋯ comes last, to the right of the blue button (R3-11, v1.047 (16)) */}
        <IconButton label={T.MORE_ACTIONS} aria-haspopup="menu" aria-expanded={menu ? 'true' : 'false'} onClick={(e) => setMenu(menu ? null : { anchor: e.currentTarget })} Icon={IconDots} />
      </div>
      {privateHidden && (
        <p className="phidden-line pdesk-line" id="prospects-add-at-desk">
          {/* ti-currency-dollar-off = private details hidden (the top bar's chip) */}
          <IconCurrencyDollarOff size={16} aria-hidden="true" />
          {T.ADD_AT_DESK}
        </p>
      )}
      {/* the amber bar: here while no profile window is open, else at the top of the window — never both */}
      {/* a bar with `retry` gets Retry, which does the same call again (v1.004, R2-01) */}
      {banner && !profileElement && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy} onDismiss={() => setBanner(null)} />}
      {/* On Both, ONE search for the two schools (each section shows its own matches), on the left above them */}
      {both && data && <SearchBox id="prospects-both-search" search={search} onSearch={setSearch} both />}
      {body}
      {profileElement}
      {menu && !screenLocked && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={T.PAGE_TITLE}
          subtitle={both ? T.BOTH_SCHOOLS : location}
          label={T.MORE_ACTIONS}
          items={moreItems}
          onClose={(reason) => {
            const el = menu.anchor;
            setMenu(null);
            if (reason === 'escape' || reason === 'tab') el?.focus();
          }}
        />
      )}
      {dialogElement}
      {fill.element}
    </div>
  );
}
