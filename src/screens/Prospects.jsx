// Prospects.jsx — the Prospects section (rail icon ti-address-book, "Prospects"; rulebook v0.140, v0.191).
// Why it exists: every sign-up from a form becomes one prospect per child, and staff work them
// here until they join (or drop out). This file is the "brain" of the section, like Forms.jsx:
//   - loads the shown school's prospects and statuses (useProspects); on Both, Worcester's and
//     Shrewsbury's sections show one after the other, each with its own bar — never mixed
//   - the stage bar + chips + search (PipelineBar), the list (ProspectList), opening on
//     "Follow up today" (follow-ups due today or overdue, new sign-ups, "Did … come?", and free
//     classes whose class was cancelled)
//   - List or Board (v0.214): the switch next to the chips; each person's choice is remembered on
//     this device (the List the first time). The Board (Board.jsx) shows one column per stage;
//     cards drag to another column (useCardDrag.js) — New / Contacted save at once, Booked, Came
//     and Joined open their dialog first and Cancel leaves the card where it was
//   - the side panel (ProspectPanel): beside the list on a PC, under it on a tablet, full screen
//     on a phone
//   - "+ Add prospect" (which form → Fill in, shared with Forms), Edit statuses, Book / Change /
//     Cancel a free class, Joined date, Delete (admins only)
// Admin vs staff only changes what is SHOWN — the database enforces who may change what.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconDots, IconEdit, IconMapPin, IconPlus, IconSearch, IconX } from '@tabler/icons-react';
import Dialog from '../components/Dialog.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import RowMenu from '../components/RowMenu.jsx';
import { LOCATION_CODE } from '../lib/device.js';
import { PC_QUERY, PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { readStorage, writeStorage } from '../lib/storage.js';
import { useShortcutN } from '../lib/useShortcutN.js';
import { addDays } from '../lib/schedule/versions.js';
import { loadForms } from '../lib/forms/api.js';
import { useProspects } from '../lib/prospects/useProspects.js';
import {
  addNote, addStatus, bookTime, cancelTime, checkIn, deleteProspect, deleteStatus, getProspect, markOpened, openTimesFor, reorderStatuses,
  searchProspects, setFollowUp, setStatus, undoCheckIn, updateStatus,
} from '../lib/prospects/api.js';
import { useFillIn } from './forms/useFillIn.js';
import PipelineBar from './prospects/PipelineBar.jsx';
import ProspectList from './prospects/ProspectList.jsx';
import Board from './prospects/Board.jsx';
import { useCardDrag } from './prospects/useCardDrag.js';
import ProspectPanel from './prospects/ProspectPanel.jsx';
import StatusesDialog, { checkStatusForm, isStatusFormDirty } from './prospects/StatusesDialog.jsx';
import { AddProspectDialog, BookTimeDialog, CameDialog, DeleteDialog, JoinedDialog, timeKey } from './prospects/Dialogs.jsx';
import * as T from './prospects/text.js';

const ALL_CODES = ['worcester', 'shrewsbury'];
// 'list' | 'board', remembered per person on this device (v0.214) — the front-desk PC is shared
const viewKey = (staffId) => `tkd.prospects.view.${staffId ?? 'anyone'}`;
const savedView = (staffId) => (readStorage(viewKey(staffId)) === 'board' ? 'board' : 'list');
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const emptyNote = () => ({ body: '', when: 'tomorrow', picked: null });
const usable = (el) => (el && el.isConnected && el.getClientRects().length > 0 ? el : null);
const lastInitial = (name) => {
  const parts = String(name ?? '').trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : '';
};

// Is this prospect in "Follow up today"?
function isDueToday(p, builtin, today) {
  if (['joined', 'not_interested'].includes(builtin ?? '')) return false;
  return (p.followUpOn && p.followUpOn <= today) || builtin === 'new' || p.askCame
    || Boolean(p.booking && p.booking.status === 'booked' && !p.booking.classRunning);
}

export default function Prospects({ location, staffId, isAdmin, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange, onBadgeRefresh }) {
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
  const [found, setFound] = useState(null); // code -> Set of ids, while searching
  const [selected, setSelected] = useState(null); // { id, code, opener }
  const [detail, setDetail] = useState(null); // the panel's prospect
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
  const phonePanel = isPhone && selected !== null;
  const modalShown = (dialog !== null || fill.isOpen || phonePanel) && !screenLocked;
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
      const due = all.filter((p) => isDueToday(p, statusById.get(p.statusId)?.builtin, today));
      // "Ava R." - the child's first name and the parent's last initial (as in the mockup)
      const initials = new Map(all.map((p) => [p.id, lastInitial(p.parentName)]));
      return { code, name: T.SCHOOL_NAME[code], statuses, statusById, all, counts, due, initials };
    });
  }, [data, codes, today]);

  // ----- Search (in the database: names, or 4+ phone digits) -----
  useEffect(() => {
    const text = search.trim();
    if (text.length < 2) {
      setFound(null);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      const results = await Promise.all(codes.map((code) => searchProspects(code, text)));
      if (results.some((r) => r.status === 'no_access')) return onNoAccess();
      setFound(Object.fromEntries(codes.map((code, i) => [code, new Set(results[i].status === 'ok' ? results[i].ids : [])])));
      return undefined;
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, codes, onNoAccess]);

  // ----- The panel -----
  async function loadDetail(id) {
    const res = await getProspect(id);
    if (res.status === 'ok') setDetail(res.prospect);
    else if (res.status === 'no_access') onNoAccess();
    else if (res.status === 'not_found') {
      setSelected(null);
      setDetail(null);
    }
    return res.status;
  }
  // A note being typed is never silently lost (rulebook section 6): opening someone else or
  // closing the panel waits until it is saved or cancelled.
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
    setNoteWarning(false);
    if (ref.current.selected?.id !== p.id) setNote(emptyNote());
    setSelected({ id: p.id, code, opener });
    setDetail(null);
    await loadDetail(p.id);
    // tablet / phone: the panel is below the list or a new page — bring it into view, focus its name
    window.requestAnimationFrame(() => {
      const h = document.querySelector('.ppanel [data-panel-heading]');
      if (h) {
        if (!isWide) h.scrollIntoView({ block: 'start', behavior: 'smooth' });
        h.focus({ preventScroll: true });
      }
    });
    if (!p.openedByMe) {
      await markOpened(p.id);
      pros.reload();
      onBadgeRefresh?.();
    }
  }
  function closePanel() {
    if (noteInTheWay(null)) return;
    const s = ref.current.selected;
    setSelected(null);
    setDetail(null);
    window.requestAnimationFrame(() => usable(document.querySelector(`[data-prospect-row="${s?.id}"]`))?.focus());
  }
  async function afterWrite(result, toastText, undo) {
    setBusy(false);
    if (result.status === 'ok') {
      await Promise.all([pros.reload(), ref.current.selected ? loadDetail(ref.current.selected.id) : null]);
      if (toastText) showToast(toastText, undo ? { icon: false, action: { label: T.UNDO, onAction: undo } } : {});
      return true;
    }
    if (result.status === 'no_access') onNoAccess();
    else if (result.status === 'stale' || result.status === 'not_found') {
      setBanner({ text: T.STALE });
      pros.reload();
      if (ref.current.selected) loadDetail(ref.current.selected.id);
    } else if (result.status === 'not_allowed') {
      setBanner({ text: T.NOT_ALLOWED });
      onRefreshProfile();
    } else if (result.status === 'invalid') setBanner({ text: T.INVALID });
    else setBanner({ text: T.SAVE_FAILED });
    return false;
  }
  const statusOfDetail = () => schools.find((s) => s.code === ref.current.selected?.code)?.statusById;

  async function changeStatus(statusId) {
    const d = ref.current.detail;
    if (!d || busy || statusId === d.statusId) return;
    const st = statusOfDetail()?.get(statusId);
    if (st?.builtin === 'joined') {
      setDialog({ type: 'joined', key: Date.now(), name: d.childFirstName, statusId, date: today, saving: false, note: null });
      return;
    }
    setBusy(true);
    const r = await setStatus({ id: d.id, expectedVersion: d.version, statusId, joinedOn: null });
    afterWrite(r, T.STATUS_SAVED(st?.name ?? ''));
  }
  async function saveJoined() {
    const g = ref.current.dialog;
    const d = g?.prospect ?? ref.current.detail;
    if (!d || !g) return;
    setDialog({ ...g, saving: true });
    const r = await setStatus({ id: d.id, expectedVersion: d.version, statusId: g.statusId, joinedOn: g.date });
    setDialog(null);
    if ((await afterWrite(r, T.STATUS_SAVED(T.JOINED_TITLE))) && g.dropCode) flashStage(g.dropCode, g.statusId);
  }
  async function changeFollowUp(date) {
    const d = ref.current.detail;
    if (!d || busy) return;
    setBusy(true);
    afterWrite(await setFollowUp({ id: d.id, expectedVersion: d.version, followUpOn: date }));
  }
  async function saveNote({ set, date }) {
    const d = ref.current.detail;
    if (!d || busy) return;
    setBusy(true);
    const r = await addNote({ id: d.id, body: note.body.trim(), setFollowUp: set, followUpOn: date });
    if (await afterWrite(r, T.NOTE_SAVED)) {
      setNote(emptyNote());
      setNoteWarning(false);
    }
  }
  async function doCheckIn(came, afterClass, target = null) {
    const d = target ?? ref.current.detail;
    if (!d || busy) return;
    setBusy(true);
    const r = await checkIn({ id: d.id, expectedVersion: d.version, came, afterClass });
    return afterWrite(r, came ? T.CHECKED_IN(d.childFirstName) : T.MARKED_NOSHOW(d.childFirstName), async () => {
      const u = await undoCheckIn({ id: d.id, expectedVersion: r.version, previousStatusId: r.previousStatusId, previousFollowUpOn: r.previousFollowUpOn });
      afterWrite(u);
    });
  }

  // ----- Book / change / cancel a free class -----
  async function openBook(target = null, dropCode = null) {
    const d = target ?? ref.current.detail;
    if (!d) return;
    const change = Boolean(d.booking && d.booking.status === 'booked');
    setDialog({ type: 'book', key: Date.now(), prospect: d, dropCode, name: d.childFirstName, change, times: null, pick: null, saving: false, note: null });
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
    if (r.status !== 'ok') {
      setDialog((x) => (x ? { ...x, saving: false } : x));
      setDialog(null);
      afterWrite(r);
      return;
    }
    setDialog(null);
    if ((await afterWrite(r, T.BOOKED(d.childFirstName))) && g.dropCode) {
      const booked = schools.find((x) => x.code === g.dropCode)?.statuses.find((s) => s.builtin === 'booked');
      if (booked) flashStage(g.dropCode, booked.id);
    }
  }
  async function doCancelBooking() {
    const d = ref.current.detail;
    if (!d || busy) return;
    setBusy(true);
    const r = await cancelTime({ id: d.id, expectedVersion: d.version });
    afterWrite(r, T.CANCELLED_BOOKING(d.childFirstName), async () => {
      const c = r.cancelled;
      const again = await bookTime({ id: d.id, expectedVersion: r.version, formId: c.formId, classId: c.classId, date: c.date, start: c.start });
      afterWrite(again.status === 'time_taken' ? { status: 'stale' } : again);
    });
  }

  // ----- The Board: List / Board, and dropping a card on another stage (v0.214) -----
  function setView(next, code = null, filter = null) {
    writeStorage(viewKey(staffId), next);
    setViewState(next);
    // each view starts on its own filter: the List on "Follow up today", the Board on everyone
    setFilters(code && filter ? { [code]: filter } : {});
    setSearch('');
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
  async function fetchProspect(id) {
    setBusy(true);
    const res = await getProspect(id);
    setBusy(false);
    if (res.status === 'ok') return res.prospect;
    if (res.status === 'no_access') onNoAccess();
    else {
      setBanner({ text: res.status === 'not_found' ? T.STALE : T.SAVE_FAILED });
      pros.reload();
    }
    return null;
  }
  async function dropCard(p, code, statusId) {
    const school = schools.find((x) => x.code === code);
    const to = school?.statusById.get(statusId);
    const from = school?.statusById.get(p.statusId);
    if (!to || busy || statusId === p.statusId) return;
    clearToast();
    const booked = Boolean(p.booking && p.booking.status === 'booked');
    if (to.builtin === 'booked' && !booked) {
      const d = await fetchProspect(p.id);
      if (d) openBook(d, code);
      return;
    }
    if (to.builtin === 'came') {
      const d = await fetchProspect(p.id);
      // a class still ahead can't be checked in yet: the dialog says when, with only Cancel
      const ahead = Boolean(d?.booking && d.booking.status === 'booked' && d.booking.classRunning && !d.checkedInAt && d.booking.date > today);
      if (d) setDialog({ type: 'came', key: Date.now(), prospect: d, statusId, askCame: p.askCame, ahead, dropCode: code, saving: false, note: null });
      return;
    }
    if (to.builtin === 'joined') {
      const d = await fetchProspect(p.id);
      if (d) setDialog({ type: 'joined', key: Date.now(), prospect: d, name: d.childFirstName, statusId, date: today, dropCode: code, saving: false, note: null });
      return;
    }
    setBusy(true);
    const r = await setStatus({ id: p.id, expectedVersion: p.version, statusId, joinedOn: null });
    if (r.status === 'ok') flashStage(code, statusId);
    afterWrite(r, T.MOVED(p.childFirstName, to.name), async () => {
      if (ref.current.busy) return;
      setBusy(true);
      const u = await setStatus({ id: p.id, expectedVersion: r.version, statusId: p.statusId, joinedOn: from?.builtin === 'joined' ? p.joinedOn : null });
      afterWrite(u);
    });
  }
  // "Came": check the child in when there is a class to check in to, otherwise save the status
  async function saveCame() {
    const g = ref.current.dialog;
    if (!g) return;
    const d = g.prospect;
    const b = d.booking;
    const canCheckIn = Boolean(b && b.status === 'booked' && b.classRunning && !d.checkedInAt) && (g.askCame || b.date === today);
    if (canCheckIn) {
      setDialog(null);
      if (await doCheckIn(true, Boolean(g.askCame), d)) flashStage(g.dropCode, g.statusId);
      return;
    }
    // no class to check in to: save Came as the status (a class still ahead never gets here —
    // CameDialog only offers Cancel then)
    setDialog({ ...g, saving: true });
    setBusy(true);
    const r = await setStatus({ id: d.id, expectedVersion: d.version, statusId: g.statusId, joinedOn: null });
    setDialog(null);
    if (await afterWrite(r, T.MOVED(d.childFirstName, T.STEP_CAME))) flashStage(g.dropCode, g.statusId);
  }
  const drag = useCardDrag({ enabled: view === 'board' && !busy && !dialog && !screenLocked && !fill.isOpen, resetKey: location, onDrop: dropCard });

  // ----- Delete (admins) -----
  async function confirmDelete() {
    const d = ref.current.detail;
    const g = ref.current.dialog;
    if (!d || !g) return;
    setDialog({ ...g, saving: true });
    const r = await deleteProspect({ id: d.id, expectedVersion: d.version });
    setDialog(null);
    if (r.status === 'ok') {
      setSelected(null);
      setDetail(null);
      await pros.reload();
      onBadgeRefresh?.();
      showToast(T.DELETED(d.childFirstName));
    } else afterWrite(r);
  }

  // ----- Add prospect -----
  async function openAdd(opener) {
    clearToast();
    const school = both ? 'worcester' : codes[0];
    setDialog({ type: 'add', key: Date.now(), both, school, forms: null, allForms: null, opener });
    const res = await loadForms({ since: `${today.slice(0, 7)}-01` });
    const live = res.status === 'ok' ? res.forms.filter((f) => f.status === 'live') : 'error';
    setDialog((g) => (g && g.type === 'add' ? { ...g, allForms: live, forms: live === 'error' ? 'error' : live.filter((f) => f.locationCode === g.school) } : g));
  }
  function pickAddForm(form, opener) {
    setDialog(null);
    fill.open(form, opener ?? document.querySelector('[data-prospects-add]'), { mode: 'fill' });
  }

  // ----- Statuses -----
  const statusSchool = dialog?.type === 'statuses' ? schools.find((s) => s.code === dialog.code) : null;
  function openStatuses(code) {
    setMenu(null);
    setDialog({ type: 'statuses', key: Date.now(), code, step: 'list', statusId: null, values: null, initial: null, touched: {}, saving: false, note: null, moveTo: null });
  }
  function statusesStep(step, s = null) {
    setDialog((g) => {
      if (!g) return g;
      const values = step === 'add' ? { name: '', kind: 'stage', color: 'gray' } : s ? { name: s.name, kind: s.kind, color: s.color } : null;
      return { ...g, step, statusId: s?.id ?? null, values, initial: values, touched: {}, note: null, moveTo: null };
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
      setDialog((x) => (x ? { ...x, saving: false, step: 'list' } : x));
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
    if (r.status === 'ok') setDialog((x) => (x ? { ...x, saving: false, step: 'list', statusId: null } : x));
    else setDialog((x) => (x ? { ...x, saving: false, note: r.status === 'not_allowed' ? 'NOT_ALLOWED' : r.status === 'stale' ? 'STALE' : 'SAVE_FAILED' } : x));
  }

  useShortcutN({ enabled: !dialog && !selected && !screenLocked && pros.status === 'ready' && !fill.isOpen, onPress: () => openAdd(document.querySelector('[data-prospects-add]')) });

  // ===== What is on screen =====
  const stagesOf = (school) => school.statuses.filter((s) => s.kind === 'stage');
  const panelFor = (school) => {
    if (!selected || selected.code !== school.code) return null;
    if (!detail) return <div className="ppanel ppanel--loading" aria-busy="true">{T.LOADING_PANEL}</div>;
    return (
      <ProspectPanel
        key={detail.id}
        detail={detail}
        listItem={school.all.find((p) => p.id === detail.id)}
        statuses={school.statuses}
        statusById={school.statusById}
        today={today}
        isPc={isPc}
        isPhone={isPhone}
        isAdmin={isAdmin}
        busy={busy}
        note={note}
        idBase={`prospect-${detail.id}`}
        onNote={(patch) => {
          setNote((n) => ({ ...n, ...patch }));
          if (patch.body === '') setNoteWarning(false);
        }}
        noteWarning={noteWarning}
        onClose={isPhone ? null : closePanel}
        onSaveNote={saveNote}
        onStatus={changeStatus}
        onFollowUp={changeFollowUp}
        onCheckIn={(came, afterClass) => doCheckIn(came, afterClass)}
        onBook={() => openBook()}
        onCancelBooking={doCancelBooking}
        onOpenSibling={(id, opener) => openProspect({ id, openedByMe: true }, school.code, opener)}
        onDelete={() => setDialog({ type: 'delete', key: Date.now(), name: detail.childFirstName, siblings: detail.siblings.length > 0, saving: false, note: null })}
      />
    );
  };

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
      const filter = board ? { kind: 'all' } : filters[school.code] ?? { kind: 'today' };
      const searching = found !== null;
      let items = school.all;
      if (searching) items = items.filter((p) => found[school.code]?.has(p.id));
      else if (filter.kind === 'today') items = school.due;
      else if (filter.kind === 'status' && !board) items = items.filter((p) => p.statusId === filter.id);
      const onBoard = (p) => school.statusById.get(p.statusId)?.kind === 'stage';
      const emptyText = school.all.length === 0 ? T.NO_PROSPECTS : searching ? T.NO_MATCH : filter.kind === 'today' ? T.NOBODY_TODAY : T.NOBODY;
      const panel = !isPhone ? panelFor(school) : null;
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
            counts={school.counts}
            todayCount={school.due.length}
            filter={searching ? { kind: 'search' } : filter}
            isPhone={isPhone}
            search={search}
            showSearch={!both}
            onFilter={(f) => {
              // on the Board, a side exit (No-show, Not interested) shows those children in the List
              if (board && f.kind === 'status') {
                setView('list', school.code, f);
                return;
              }
              setSearch('');
              setFilters((x) => ({ ...x, [school.code]: f }));
            }}
            onSearch={setSearch}
          />
          <div className={`pbody${panel && isWide ? ' pbody--side' : ''}`}>
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
                searchNote={searching ? { shown: items.filter(onBoard).length, total: school.all.filter(onBoard).length, text: search.trim(), onClear: () => setSearch('') } : null}
                onOpen={(p, opener) => openProspect(p, school.code, opener)}
              />
            ) : (
              <ProspectList
                items={items}
                label={both ? `${T.PAGE_TITLE} · ${school.name}` : T.PAGE_TITLE}
                statusById={school.statusById}
                initials={school.initials}
                today={today}
                selectedId={selected?.id}
                narrow={Boolean(panel) && isWide}
                isPhone={isPhone}
                emptyText={emptyText}
                onOpen={(p, opener) => openProspect(p, school.code, opener)}
              />
            )}
            {panel}
          </div>
        </section>
      );
    });
  }

  let dialogElement = null;
  if (dialog && !screenLocked) {
    if (dialog.type === 'book') {
      dialogElement = <BookTimeDialog state={dialog} today={today} isPhone={isPhone} onPick={(pick) => setDialog((g) => ({ ...g, pick, note: pick ? null : 'PICK' }))} onSave={saveBook} onCancel={() => !dialog.saving && setDialog(null)} />;
    } else if (dialog.type === 'joined') {
      dialogElement = <JoinedDialog state={dialog} today={today} isPhone={isPhone} onChange={(date) => setDialog((g) => ({ ...g, date }))} onSave={saveJoined} onCancel={() => !dialog.saving && setDialog(null)} />;
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
      dialogElement = <CameDialog state={dialog} isPhone={isPhone} onSave={saveCame} onCancel={() => !dialog.saving && setDialog(null)} />;
    } else if (dialog.type === 'delete') {
      dialogElement = <DeleteDialog state={dialog} onConfirm={confirmDelete} onCancel={() => !dialog.saving && setDialog(null)} />;
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
          onCancel={() => setDialog(null)}
          onRequestClose={() => {
            const g = ref.current.dialog;
            if (g.step === 'list') setDialog(null);
            else if (!isStatusFormDirty(g)) statusesStep('list');
            else setDialog({ ...g, note: null, step: 'list' });
          }}
        />
      );
    }
  }

  const phoneSchool = isPhone && selected ? schools.find((s) => s.code === selected.code) : null;
  const moreItems = codes.map((code) => ({ key: code, label: both ? `${T.EDIT_STATUSES} · ${T.SCHOOL_NAME[code]}` : T.EDIT_STATUSES, Icon: IconEdit, onSelect: () => openStatuses(code) }));

  return (
    <div className="prospects">
      <div className="phead">
        <div className="phead-titles">
          <h1 className="ptitle">{T.PAGE_TITLE}</h1>
          <p className="psub">{both ? T.BOTH_SCHOOLS : location}</p>
        </div>
        <button type="button" className="icon-button" aria-label={T.MORE_ACTIONS} aria-haspopup="menu" onClick={(e) => setMenu(menu ? null : { anchor: e.currentTarget })}>
          <IconDots size={20} aria-hidden="true" />
        </button>
        <button type="button" className="btn btn-primary" data-prospects-add onClick={(e) => openAdd(e.currentTarget)}>
          <IconPlus size={16} aria-hidden="true" />
          {isPhone ? T.ADD_SHORT : T.ADD_PROSPECT}
        </button>
      </div>
      {banner && <ErrorBanner text={banner.text} onDismiss={() => setBanner(null)} />}
      {both && data && (
        // On Both, ONE search for the two schools (each section shows its own matches)
        <label className="psearch psearch--both">
          <IconSearch size={16} aria-hidden="true" />
          <span className="visually-hidden">{T.SEARCH_LABEL}</span>
          <input type="search" className="psearch-input" placeholder={T.SEARCH} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button type="button" className="psearch-clear" aria-label={T.CLEAR_SEARCH} onClick={() => setSearch('')}>
              <IconX size={14} aria-hidden="true" />
            </button>
          )}
        </label>
      )}
      {body}
      {phoneSchool && !screenLocked && (
        <Dialog title={detail ? `${detail.childFirstName}, ${detail.childAge}` : T.LOADING_PANEL} fullScreen onRequestClose={closePanel}>
          {panelFor(phoneSchool)}
        </Dialog>
      )}
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
