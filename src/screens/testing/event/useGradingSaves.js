// useGradingSaves.js — the "save engine" of the Grading tab (contract 0010 §4.3, G5, v0.187,
// v0.188, v0.192).
// Why it exists: a grader taps Pass / Not passed / No show many times a minute, often on shaky
// mat-side Wi-Fi. Each tap must show at once, save in the background, never be overwritten by
// the 15-second refresh while it is still on its way, and — if it fails — stay on screen as
// "Not saved" and keep trying by itself. That logic is the same for every row, so it lives here
// once instead of inside the screen.
//
//   const grading = useGradingSaves({ roster, classes, loadedAt, reload, onNoAccess,
//                                     showPageBanner, isReadOnly, screenLocked });
//   roster          the ACTIVE students, in class switch order, then roster order
//   classes         the event's classes (for class names in the banner and the leave dialog)
//   loadedAt        startedAt of the data on screen (eventsApi.loadEvent)
//   reload()        quiet reload of the event (EventPage.reloadQuiet)
//   onNoAccess()    the database says this sign-in is locked: lock the screen
//   showPageBanner(text)  the event page's amber banner (for the answers that aren't retried)
//   isReadOnly      true when this person can't change results now (before the day; staff after it)
//   screenLocked    true while the lock screen shows (no retries then)
//   isNowPrivate(id) phase 4 (contract 0014 §5.2, review L8): true when that student now tests
//                   privately (EventPage answers from its full roster). Such a row leaves this
//                   engine: its unsaved tap is dropped with the banner "… now tests privately …"
//                   and the OTHER rows' unsaved taps are kept (never dropAll for it). The private
//                   page's own engine passes a function that always answers false.
//
// The "overlay": for every row with a tap that the screen shows instead of the loaded value,
//   { result, state: 'saving' | 'unsaved' | 'retrying' | 'saved', sentResult, wanted,
//     answeredAt, inFlight, token }
// Nothing is kept in browser storage (v0.188): closing the page forgets unsaved taps (the leave
// guard in EventPage asks first).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { setResult, setResultNote } from '../../../lib/testing/eventsApi.js';
import * as T from '../text.js';

// Unsaved rows are sent again this often, by themselves (v0.192).
export const GRADING_RETRY_MS = 10000;
// One quiet reload this long after the last save of a burst answered.
const RELOAD_AFTER_SAVES_MS = 500;

let nextToken = 1;

export function useGradingSaves({
  roster,
  classes,
  loadedAt,
  reload,
  onNoAccess,
  showPageBanner,
  isReadOnly,
  screenLocked,
  isNowPrivate = () => false,
}) {
  // The overlay lives in a ref (so the async answers always see the newest one); `tick` only
  // makes React draw again after a change.
  const overlayRef = useRef({}); // { [registrationId]: entry }
  const notesRef = useRef({}); // { [registrationId]: { note, answeredAt } } — a note just saved
  const [, setTick] = useState(0);
  const redraw = useCallback(() => setTick((n) => n + 1), []);
  const [bannerHidden, setBannerHidden] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const noAccessRef = useRef(false); // retries stop until the screen is unlocked again
  const reloadTimerRef = useRef(null);

  // The newest props, for the async code below.
  const propsRef = useRef({ roster, classes, reload, onNoAccess, showPageBanner, isNowPrivate });
  useLayoutEffect(() => {
    propsRef.current = { roster, classes, reload, onNoAccess, showPageBanner, isNowPrivate };
  });

  // ----- Small helpers -----
  function setEntry(id, entry) {
    overlayRef.current = { ...overlayRef.current, [id]: entry };
  }
  function dropEntry(id) {
    const next = { ...overlayRef.current };
    delete next[id];
    overlayRef.current = next;
  }
  function dropAll() {
    overlayRef.current = {};
  }
  // The student's name: from the roster, else the name kept with the tap (a row that just left).
  function nameOf(id) {
    const row = propsRef.current.roster.find((r) => r.id === id);
    return row ? T.studentLabel(row) : (overlayRef.current[id]?.name ?? '');
  }
  function inRoster(id) {
    return propsRef.current.roster.some((r) => r.id === id);
  }
  // The polite live region: cleared first, so the same word twice is announced twice.
  const announce = useCallback((text) => {
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(text), 50);
  }, []);
  function scheduleReload() {
    window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      // Still saving something? The next answer starts the wait again.
      if (Object.values(overlayRef.current).some((e) => e.inFlight)) return;
      propsRef.current.reload();
    }, RELOAD_AFTER_SAVES_MS);
  }

  // ----- Sending one row (at most one save per row on its way) -----
  // retrying: true when a Not saved row is sent again (its tag reads "Saving…").
  async function send(id, retrying = false) {
    const start = overlayRef.current[id];
    if (!start || start.inFlight) return;
    const value = start.wanted;
    const token = start.token;
    setEntry(id, { ...start, inFlight: true, sentResult: value, state: retrying ? 'retrying' : 'saving' });
    redraw();

    const answer = await setResult({ registrationId: id, result: value });
    const now = overlayRef.current[id];
    if (!now || now.token !== token) return; // dropped meanwhile (finished, row gone …)
    const status = answer?.status ?? 'error';
    const p = propsRef.current;

    if (status === 'ok') {
      if (now.wanted !== value) {
        // Tapped again while this one was on its way: send only the latest choice.
        setEntry(id, { ...now, inFlight: false, state: 'saving' });
        send(id);
        return;
      }
      setEntry(id, { ...now, inFlight: false, result: answer.result ?? null, state: 'saved', answeredAt: Date.now() });
      redraw();
      announce(T.ANNOUNCE_SAVED);
      scheduleReload();
      return;
    }
    if (status === 'error' || status === 'stale') {
      if (now.wanted !== value) {
        // A newer choice is waiting: try that one straight away.
        setEntry(id, { ...now, inFlight: false });
        send(id, retrying || now.state === 'retrying');
        return;
      }
      const wasUnsaved = retrying || now.state === 'retrying';
      setEntry(id, { ...now, inFlight: false, state: 'unsaved' });
      // A NEW failure brings the banner back; a retry that fails again doesn't (v0.192).
      if (!wasUnsaved) setBannerHidden(false);
      redraw();
      announce(T.ANNOUNCE_NOT_SAVED);
      return;
    }
    if (status === 'no_access') {
      setEntry(id, { ...now, inFlight: false, state: 'unsaved' });
      noAccessRef.current = true;
      redraw();
      p.onNoAccess();
      return;
    }
    // Answers that are never retried: the screen goes back to the database's own values.
    // Phase 4 (L8): a row that now tests privately (or left this list) loses only its own tap —
    // the other rows' unsaved taps stay and keep retrying.
    if ((status === 'finished' || status === 'not_open') && (p.isNowPrivate(id) || !inRoster(id))) {
      const name = nameOf(id);
      const moved = p.isNowPrivate(id);
      dropEntry(id);
      p.showPageBanner(moved ? T.movedToPrivate(name) : status === 'finished' ? T.TOO_LATE_RESULTS : T.GRADING_NOT_OPEN);
    } else if (status === 'finished' || status === 'not_open') {
      dropAll();
      p.showPageBanner(status === 'finished' ? T.TOO_LATE_RESULTS : T.GRADING_NOT_OPEN);
    } else if (status === 'withdrawn') {
      const name = nameOf(id);
      dropEntry(id);
      p.showPageBanner(T.isWithdrawn(name));
    } else {
      // invalid, not_found
      dropEntry(id);
      p.showPageBanner(T.ROSTER_STALE);
    }
    redraw();
    p.reload();
  }

  // A tap. value = the tapped button, or null when the tapped button was already chosen
  // (tap again clears, v0.181).
  function chooseResult(row, value) {
    if (isReadOnly) return;
    const current = overlayRef.current[row.id];
    if (current) {
      setEntry(row.id, { ...current, result: value, wanted: value, state: current.inFlight ? current.state : 'saving' });
    } else {
      setEntry(row.id, {
        result: value,
        wanted: value,
        state: 'saving',
        sentResult: null,
        answeredAt: null,
        inFlight: false,
        token: nextToken++,
        name: T.studentLabel(row), // kept for the banner if the row leaves this list
      });
    }
    redraw();
    send(row.id);
  }

  // Every Not saved row, sent again now (the timer, the 'online' event, and Retry).
  function retryAll() {
    if (noAccessRef.current) return;
    for (const [id, entry] of Object.entries(overlayRef.current)) {
      if (entry.state === 'unsaved' && !entry.inFlight && inRoster(id)) send(id, true);
    }
  }
  const retryRef = useRef(retryAll);
  useLayoutEffect(() => {
    retryRef.current = retryAll;
  });

  // ----- Counting -----
  const entries = overlayRef.current;
  const rowById = new Map(roster.map((r) => [r.id, r]));
  // A row that already left this list isn't counted (its entry is dropped just after this draw).
  const unsavedIds = Object.keys(entries).filter((id) => rowById.has(id) && (entries[id].state === 'unsaved' || entries[id].state === 'retrying'));
  const unsavedCount = unsavedIds.length;
  const unsavedSet = new Set(unsavedIds);
  // Class ids with unsaved rows, in class switch order.
  const unsavedClassIds = classes.map((c) => c.id).filter((cid) => roster.some((r) => r.eventClassId === cid && unsavedSet.has(r.id)));
  const classNameOf = (cid) => classes.find((c) => c.id === cid)?.className ?? '';

  // For the leave dialog: [{ id, name, classId, className }] in switch order, then row order.
  function unsavedRows() {
    const list = [];
    for (const cid of unsavedClassIds) {
      for (const r of roster) {
        if (r.eventClassId === cid && unsavedSet.has(r.id)) list.push({ id: r.id, name: T.studentLabel(r), classId: cid, className: classNameOf(cid) });
      }
    }
    return list;
  }

  // What a row shows: { result, note, state } — the overlay wins over the loaded values.
  function view(row) {
    const entry = entries[row.id];
    const savedNote = notesRef.current[row.id];
    return {
      result: entry ? entry.result : (row.result ?? null),
      note: savedNote ? savedNote.note : (row.note ?? null),
      state: entry ? entry.state : null,
    };
  }

  // ----- Notes (no queue: the note dialog waits for the answer) -----
  async function saveNote(row, text) {
    const answer = await setResultNote({ registrationId: row.id, note: text });
    const status = answer?.status ?? 'error';
    if (status === 'ok') {
      notesRef.current = { ...notesRef.current, [row.id]: { note: answer.note ?? null, answeredAt: Date.now() } };
      redraw();
      propsRef.current.reload();
    }
    return status;
  }

  // ----- Keeping the overlay honest -----
  // Fresh data that was read AFTER a save answered replaces that row's "saved" entry, so the
  // screen shows the database's own value, never an older read (refresh merge, §4.3).
  // 'saving' / 'unsaved' / 'retrying' rows are never overwritten by a refresh.
  useEffect(() => {
    if (!loadedAt) return;
    let changed = false;
    const next = { ...overlayRef.current };
    for (const [id, entry] of Object.entries(next)) {
      if (entry.state === 'saved' && !entry.inFlight && entry.answeredAt !== null && loadedAt > entry.answeredAt) {
        delete next[id];
        changed = true;
      }
    }
    const notes = { ...notesRef.current };
    for (const [id, saved] of Object.entries(notes)) {
      if (loadedAt > saved.answeredAt) {
        delete notes[id];
        changed = true;
      }
    }
    if (changed) {
      overlayRef.current = next;
      notesRef.current = notes;
      redraw();
    }
  }, [loadedAt, redraw]);

  // Rows that left the active roster (withdrawn, deleted elsewhere) lose their entry. Phase 4:
  // a row that left because it now tests privately, with a tap not yet saved, says so in the
  // page banner (contract 0014 §5.2) — its tap is dropped, never retried here.
  const rosterKey = roster.map((r) => r.id).join('|');
  useEffect(() => {
    const ids = new Set(rosterKey.split('|'));
    const gone = Object.keys(overlayRef.current).filter((id) => !ids.has(id));
    if (gone.length === 0) return;
    const next = { ...overlayRef.current };
    let movedName = null;
    for (const id of gone) {
      const entry = next[id];
      if (entry.state !== 'saved' && propsRef.current.isNowPrivate(id)) movedName = entry.name ?? '';
      delete next[id];
    }
    overlayRef.current = next;
    if (movedName !== null) propsRef.current.showPageBanner(T.movedToPrivate(movedName));
    redraw();
  }, [rosterKey, redraw]);

  // Read-only now (staff after the testing day): every entry goes.
  useEffect(() => {
    if (!isReadOnly || Object.keys(overlayRef.current).length === 0) return;
    overlayRef.current = {};
    redraw();
  }, [isReadOnly, redraw]);

  // no_access stopped the retries: they start again once the screen is unlocked.
  const wasLockedRef = useRef(screenLocked);
  useEffect(() => {
    if (wasLockedRef.current && !screenLocked) noAccessRef.current = false;
    wasLockedRef.current = screenLocked;
  }, [screenLocked]);

  // Automatic retry (v0.192): every 10 seconds while something is unsaved and the screen is
  // unlocked, and at once when the browser says the connection is back ('online').
  const retryActive = unsavedCount > 0 && !screenLocked;
  useEffect(() => {
    if (!retryActive) return undefined;
    const run = () => retryRef.current();
    const timer = window.setInterval(run, GRADING_RETRY_MS);
    window.addEventListener('online', run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', run);
    };
  }, [retryActive]);

  useEffect(() => () => window.clearTimeout(reloadTimerRef.current), []);

  // The banner: shown while anything is unsaved, unless dismissed (a new failure shows it again).
  const banner =
    unsavedCount > 0 && !bannerHidden ? { text: T.gradingSaveFailed(unsavedCount, unsavedClassIds.map(classNameOf)) } : null;

  return {
    view,
    chooseResult,
    retryAll,
    dismissBanner: () => setBannerHidden(true),
    banner,
    unsavedCount,
    unsavedClassIds,
    unsavedRows,
    saveNote,
    announcement,
  };
}
