// CyclesTab.jsx — the "Cycles" tab of Black Belt testing: every testing cycle, both schools.
// Why it exists: approved mockups Cycles 2 and 3 (contract CONTRACT-0016-B1 §3). It:
//   - loads the cycles (useLiveLoad + loadCycles — reloads quietly every 15 s while visible,
//     after every change, after unlocking and when the browser tab comes back, v0.157)
//   - shows them on an Upcoming / Past switch with counts (the selected side gray, v0.89):
//     Upcoming = not past, soonest first day first; Past = newest first
//   - one row per cycle: name · first testing day · candidates (active, both schools) · one tag
//   - row click → the cycle page; Edit (admins, PC and tablet) → Edit cycle; ⋯ → Copy Worcester
//     link · Copy Shrewsbury link · Close / Open registration · (phones, admins) Edit cycle ·
//     Delete cycle (admins, red; grayed with its reason once a payment or a form waiver exists;
//     0025, Q-G3 v0.950: a cycle with grades is refused too — the list doesn't know about grades,
//     so the grading state is read when Delete is chosen and, with grades, the banner says
//     "Grades are entered for this cycle, so it can't be deleted." instead of the confirmation)
//   - "+ Add cycle" in the page header (admins; N on the PC)
// Add / Edit cycle themselves live in ../cycle/useCycleEditor.jsx (the cycle page uses it too).
//
// Rules worth knowing (as Color Belt's Events tab):
//   - ONE change at a time: while a save is on its way, other changes are ignored.
//   - "stale" = someone else changed the cycle since it was loaded: nothing is overwritten,
//     the person is told, and the list reloads.
//   - Admin vs staff only changes what is SHOWN — the database enforces who may do what.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconCopy, IconDots, IconEdit, IconLock, IconLockOpen, IconPlus, IconTrash } from '@tabler/icons-react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import IconButton from '../../../components/IconButton.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { deleteCycle, loadCycle, loadCycles, schoolToday } from '../../../lib/blackBelt/api.js';
import { loadGradingState } from '../../../lib/blackBelt/gradingApi.js';
import { cycleTag } from '../../../lib/blackBelt/rules.js';
import { PHONE_QUERY, TOUCH_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { useRowArrowNav } from '../../../lib/useRowArrowNav.js';
import { useShortcutN } from '../../../lib/useShortcutN.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../screens/testing/events/useLiveLoad.js';
import Choice from '../parts/Choice.jsx';
import ConfirmDialog from '../parts/ConfirmDialog.jsx';
import { useCycleEditor } from '../cycle/useCycleEditor.jsx';
import { useCycleActions } from './useCycleActions.js';
import * as T from '../text.js';

// The one thing this tab loads (Black Belt is joint, so there is no school in the key).
const LIVE_KEY = 'black-belt-cycles';
const load = () => loadCycles();

// Upcoming / Past, kept while the dashboard is open.
let lastSide = 'upcoming';

const find = (selector) => document.querySelector(selector);
const rowEl = (id) => find(`[data-nav-row="${id}"]`);
const moreEl = (id) => find(`[data-cycle-more="${id}"]`);
const addEl = () => find('[data-add-cycle]');
const usable = (element) => (element && element.isConnected && element.getClientRects().length > 0 ? element : null);

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
  date: (a, b) => byText(a.firstDay ?? '', b.firstDay ?? ''),
  candidates: (a, b) => a.candidateCount - b.candidateCount,
  status: (a, b) => T.tagText(a.tag).localeCompare(T.tagText(b.tag)),
};

// A menu item with its reason under it (grayed, v0.66).
function TwoLines({ label, reason }) {
  return (
    <span className="ev-menu-two">
      <span>{label}</span>
      <span className="ev-menu-reason">{reason}</span>
    </span>
  );
}

export default function CyclesTab({
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
  onOpenCycle,
}) {
  const live = useLiveLoad({ key: LIVE_KEY, enabled: !screenLocked, load, refreshMs: LIVE_REFRESH_MS });
  const cycles = live.data?.cycles ?? [];
  const today = live.data?.today ?? schoolToday();
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });

  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);

  const [side, setSideState] = useState(lastSide);
  const [sort, setSort] = useState(null); // { key, dir } or null (the side's own order)
  const [menu, setMenu] = useState(null); // { id, anchor }
  const [banner, setBanner] = useState(null); // { text, retry?, kind? }
  const [confirm, setConfirm] = useState(null); // the Delete cycle confirmation
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  function setSide(next) {
    lastSide = next;
    setSideState(next);
    setSort(null);
  }

  // ----- One change at a time -----
  function beginWrite() {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }
  function endWrite(status) {
    busyRef.current = false;
    setBusy(false);
    if (status && status !== 'ok') clearToast();
  }

  function reloadQuiet() {
    return liveRef.current.reload().then((result) => {
      if (result === 'error') setBanner({ text: T.LOAD_FAILED, retry: () => liveRef.current.reload().then((r) => r === 'ok' && setBanner(null)) });
      return result;
    });
  }

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  // ----- Keyboard focus after something closes -----
  const focusRef = useRef(null);
  const [, setTick] = useState(0);
  function focusLater(findTarget, fallback = null) {
    focusRef.current = { findTarget, fallback, tries: 0 };
    setTick((n) => n + 1);
  }

  const actions = useCycleActions({ isAdmin, today, beginWrite, endWrite, reload: reloadQuiet, setBanner, showToast, clearToast, onNoAccess, onRefreshProfile });

  const editor = useCycleEditor({
    isAdmin,
    today,
    cycles,
    screenLocked,
    beginWrite,
    endWrite,
    setBanner,
    onNoAccess,
    onRefreshProfile,
    showToast,
    clearToast,
    onSaved: ({ mode, id, opener }) => {
      if (mode === 'add' && side !== 'upcoming') setSide('upcoming'); // a new cycle is always upcoming
      reloadQuiet().then(() => focusLater(() => (mode === 'add' ? rowEl(id) : opener), addEl));
    },
    onClosed: ({ opener }) => focusLater(() => opener, addEl),
    onGone: () => reloadQuiet(),
  });

  const modalShown = (editor.isOpen || confirm !== null) && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  useEffect(() => {
    const request = focusRef.current;
    if (!request || screenLocked || modalShown) return undefined;
    const target = usable(request.findTarget()) ?? usable(request.fallback?.());
    request.tries += 1;
    if (target && target.closest('[inert]') && request.tries < 30) {
      const frame = window.requestAnimationFrame(() => setTick((n) => n + 1));
      return () => window.cancelAnimationFrame(frame);
    }
    focusRef.current = null;
    target?.focus();
    return undefined;
  });

  // Locking closes the ⋯ menu.
  useEffect(() => {
    if (screenLocked) setMenu(null);
  }, [screenLocked]);

  // ===== Rows =====
  const rows = cycles.map((cycle) => ({ ...cycle, tag: cycleTag(cycle, today) }));
  const isPast = (cycle) => cycle.state?.state === 'past' || cycle.state?.past === true;
  const upcoming = rows.filter((c) => !isPast(c)).sort(SORTERS.date);
  const past = rows.filter(isPast).sort((a, b) => -byText(a.lastDay ?? a.firstDay ?? '', b.lastDay ?? b.firstDay ?? ''));
  let shown = side === 'past' ? past : upcoming;
  if (sort) shown = [...shown].sort((a, b) => sort.dir * SORTERS[sort.key](a, b));
  const shownRef = useRef(shown);
  useLayoutEffect(() => {
    shownRef.current = shown;
  });

  function toggleSort(key) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: 1 };
      if (current.dir === 1) return { key, dir: -1 };
      return null;
    });
  }

  // ===== Delete cycle (permanent; the count is read fresh first, contract OP-5 / OP-6) =====
  async function startDelete(cycle, anchor) {
    if (!isAdmin || !beginWrite()) return;
    const [fresh, grading] = await Promise.all([loadCycle({ cycleId: cycle.id }), loadGradingState({ cycleId: cycle.id })]);
    endWrite(fresh.status === 'not_found' ? 'ok' : fresh.status);
    if (fresh.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (fresh.status === 'not_found') {
      setBanner({ text: T.CYCLE_DELETED });
      reloadQuiet();
      return;
    }
    if (fresh.status !== 'ok') {
      setBanner({ text: T.LOAD_FAILED });
      return;
    }
    // 0025 (Q-G3): real grades block deleting (unreadable grading state → the database decides)
    if (grading.status === 'ok' && grading.partsWithGrades.length > 0) {
      setBanner({ text: T.CYCLE_HAS_GRADES });
      return;
    }
    const detail = fresh.cycle;
    setConfirm({
      key: Date.now(),
      id: cycle.id,
      title: T.deleteCycleTitle(detail.name),
      body: T.deleteCycleBody(detail.candidateCountAll ?? detail.candidateCount ?? 0),
      args: { cycleId: cycle.id, expectedVersion: detail.version, expectedCandidateCount: detail.candidateCountAll ?? 0 },
      index: shownRef.current.findIndex((c) => c.id === cycle.id),
      saving: false,
      failed: false,
      opener: anchor,
    });
  }

  async function confirmDelete() {
    const d = confirm;
    if (!d || d.saving || !beginWrite()) return;
    setConfirm({ ...d, saving: true, failed: false });
    const result = await deleteCycle(d.args);
    endWrite(result.status);
    const status = result.status;
    if (status === 'ok') {
      setConfirm(null);
      showToast(T.TOAST_CYCLE_DELETED, { icon: false }); // permanent: no Undo
      reloadQuiet().then(() =>
        focusLater(() => {
          const list = shownRef.current;
          const target = list[d.index] ?? list[d.index - 1];
          return target ? rowEl(target.id) : null;
        }, addEl),
      );
      return;
    }
    if (status === 'no_access') {
      setConfirm({ ...d, saving: false });
      onNoAccess();
      return;
    }
    if (status === 'error') {
      setConfirm({ ...d, saving: false, failed: true });
      return;
    }
    setConfirm(null);
    if (status === 'not_allowed') {
      setBanner({ text: T.NOT_ALLOWED });
      onRefreshProfile();
    } else if (status === 'has_payments') setBanner({ text: T.HAS_PAYMENTS });
    else if (status === 'has_waivers') setBanner({ text: T.HAS_WAIVERS });
    else if (status === 'has_grades') setBanner({ text: T.CYCLE_HAS_GRADES });
    else if (status === 'not_found') setBanner({ text: T.CYCLE_DELETED });
    else setBanner({ text: T.DELETE_STALE });
    reloadQuiet();
    focusLater(() => moreEl(d.id));
  }

  // ===== Copy a school's link =====
  // The cycle list doesn't carry the two link codes (bb_cycles_list has none), so they are read
  // with the cycle's details when its ⋯ opens, and kept here for the copy.
  const codesRef = useRef(new Map());
  function prefetchCodes(id) {
    if (codesRef.current.has(id)) return;
    const pending = loadCycle({ cycleId: id }).then((result) => {
      if (result.status === 'ok') return result.cycle.codes;
      codesRef.current.delete(id);
      return null;
    });
    codesRef.current.set(id, pending);
  }
  async function copySchoolLink(id, school) {
    prefetchCodes(id);
    const codes = await codesRef.current.get(id);
    if (!codes) {
      setBanner({ text: T.COPY_FAILED });
      return;
    }
    actions.copyLink(codes[school]);
  }

  // ===== The ⋯ menu =====
  function closeMenu(reason) {
    const current = menu;
    setMenu(null);
    if (current && (reason === 'escape' || reason === 'tab')) current.anchor?.focus();
  }

  function menuContent() {
    if (!menu) return null;
    const cycle = rows.find((c) => c.id === menu.id);
    if (!cycle) return null;
    const items = [
      { key: 'copyW', label: T.COPY_WORCESTER_LINK, Icon: IconCopy, onSelect: () => copySchoolLink(cycle.id, 'worcester') },
      { key: 'copyS', label: T.COPY_SHREWSBURY_LINK, Icon: IconCopy, onSelect: () => copySchoolLink(cycle.id, 'shrewsbury') },
    ];
    if (!isPast(cycle)) {
      if (cycle.state?.registration === 'open') {
        items.push({ key: 'close', label: T.CLOSE_REGISTRATION, Icon: IconLock, disabled: busy, onSelect: () => actions.switchRegistration(cycle, false) });
      } else {
        // Grayed with its reason for staff: the first opening (it locks the rubric, v0.930) and
        // reopening after the application date are admin-only.
        const blocked = actions.openBlockedReason(cycle);
        items.push({
          key: 'open',
          label: blocked ? <TwoLines label={T.OPEN_REGISTRATION} reason={blocked} /> : T.OPEN_REGISTRATION,
          Icon: IconLockOpen,
          disabled: busy || Boolean(blocked),
          onSelect: () => actions.switchRegistration(cycle, true),
        });
      }
    }
    // Phones have no pencil on the row, so Edit cycle is in the menu there (rule 1.1).
    if (isAdmin && isPhone) items.push({ key: 'edit', label: T.EDIT_CYCLE, Icon: IconEdit, disabled: busy, onSelect: () => editor.openEdit(cycle.id, menu.anchor) });
    if (isAdmin) {
      const reason = cycle.hasPayments ? T.HAS_PAYMENTS : cycle.hasFormWaivers ? T.HAS_WAIVERS : null;
      items.push({
        key: 'delete',
        label: reason ? <TwoLines label={T.DELETE_CYCLE} reason={reason} /> : T.DELETE_CYCLE,
        Icon: IconTrash,
        danger: !reason,
        separatorBefore: true,
        disabled: busy || Boolean(reason),
        onSelect: () => startDelete(cycle, menu.anchor),
      });
    }
    return { title: cycle.name, subtitle: T.phoneLine(cycle.firstDay, cycle.candidateCount), label: T.moreFor(cycle.name), items };
  }

  // ===== Keyboard: ↑ ↓ Enter on rows, N for Add cycle =====
  const nav = useRowArrowNav({ rowKeys: shown.map((c) => c.id), onOpen: (id) => onOpenCycle(id) });
  const addShown = isAdmin && live.status === 'ready';
  useShortcutN({
    enabled: addShown && !editor.isOpen && confirm === null && menu === null && !screenLocked && !busy,
    onPress: () => editor.openAdd(addEl()),
  });

  // ===== Drawing =====
  const addButton = addShown ? (
    <button type="button" className="btn btn-primary" data-add-cycle onClick={(event) => editor.openAdd(event.currentTarget)}>
      {/* ti-plus = add new */}
      <IconPlus size={16} aria-hidden="true" />
      {T.ADD_CYCLE}
    </button>
  ) : null;

  function tagFor(cycle) {
    return <span className={`ttag${T.tagIsOk(cycle.tag) ? ' ttag--ok' : ''}`}>{T.tagText(cycle.tag)}</span>;
  }

  function header(key, label, numeric = false) {
    const active = sort?.key === key;
    return (
      <span className={`ev-th${numeric ? ' num' : ''}`} role="columnheader" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="ev-sort" onClick={() => toggleSort(key)} aria-label={T.sortBy(label)}>
          {label}
          {active && <span aria-hidden="true">{sort.dir === 1 ? ' ↑' : ' ↓'}</span>}
        </button>
      </span>
    );
  }

  let body;
  if (live.status === 'loading' || live.status === 'idle') {
    body = (
      <div className="clist tskeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING_CYCLES}</span>
        {[0, 1, 2].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (live.status === 'error') {
    body = <ErrorBanner text={T.LOAD_FAILED} onRetry={() => liveRef.current.reload()} />;
  } else if (live.status === 'noAccess') {
    body = null;
  } else if (shown.length === 0) {
    let text;
    if (rows.length === 0) text = isAdmin ? T.NO_CYCLES_ADMIN : T.NO_CYCLES_STAFF;
    else text = side === 'past' ? T.NO_PAST : T.NO_UPCOMING;
    body = <p className="tempty ev-empty">{text}</p>;
  } else {
    body = (
      <div className={`clist ev-list bb-list${isTouch ? ' is-touch' : ''}${isAdmin && !isPhone ? ' has-edit' : ''}`} role="table" aria-label={side === 'past' ? T.PAST : T.UPCOMING}>
        {!isPhone && (
          <div className="ev-row bb-row ev-head" role="row">
            {header('name', T.COL_CYCLE)}
            {header('date', T.COL_FIRST_DAY)}
            {header('candidates', T.COL_CANDIDATES, true)}
            {header('status', T.COL_STATUS)}
            <span className="ev-th" role="columnheader" aria-label={T.ACTIONS_COL} />
          </div>
        )}
        <div role="rowgroup" {...nav.containerProps}>
          {shown.map((cycle) => {
            const open = menu?.id === cycle.id;
            const selected = open || (editor.openId === cycle.id && !screenLocked) || (confirm?.id === cycle.id && !screenLocked);
            const more = (
              <IconButton
                label={T.moreFor(cycle.name)}
                Icon={IconDots}
                aria-haspopup="menu"
                aria-expanded={open ? 'true' : 'false'}
                data-cycle-more={cycle.id}
                tabIndex={nav.itemTabIndex(cycle.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  const anchor = event.currentTarget;
                  prefetchCodes(cycle.id);
                  setMenu((current) => (current && current.id === cycle.id ? null : { id: cycle.id, anchor }));
                }}
              />
            );
            const edit =
              isAdmin && !isPhone ? (
                <IconButton
                  label={T.editCycleLabel(cycle.name)}
                  Icon={IconEdit}
                  tabIndex={nav.itemTabIndex(cycle.id)}
                  onClick={(event) => {
                    event.stopPropagation();
                    editor.openEdit(cycle.id, event.currentTarget);
                  }}
                />
              ) : null;
            return (
              <div
                key={cycle.id}
                className={`ev-row bb-row${selected ? ' is-selected' : ''}${isPhone ? ' is-phone' : ''}`}
                role="row"
                aria-label={T.openCycleLabel(cycle.name)}
                {...nav.rowProps(cycle.id)}
                onClick={() => onOpenCycle(cycle.id)}
              >
                {isPhone ? (
                  <>
                    <span className="ev-phone-main" role="cell">
                      <span className="ev-name">{cycle.name}</span>
                      <span className="l2">{T.phoneLine(cycle.firstDay, cycle.candidateCount)}</span>
                      <span className="ev-phone-tag">{tagFor(cycle)}</span>
                    </span>
                    <span className="acts" role="cell">
                      {more}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="ev-name" role="cell">
                      {cycle.name}
                    </span>
                    <span role="cell" className="nowrap">
                      {T.shortDate(cycle.firstDay)}
                    </span>
                    <span role="cell" className="num">
                      {cycle.candidateCount}
                    </span>
                    <span role="cell">{tagFor(cycle)}</span>
                    <span className="acts" role="cell">
                      {edit}
                      {more}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const content = menu && !screenLocked ? menuContent() : null;
  const sideLabelId = `${panelId}-side`;
  // The staff line only when there are cycles to use ⋯ on (Cycles 3 shows just the empty line).
  const staffLine = isAdmin || (live.status === 'ready' && rows.length === 0) ? null : T.STAFF_CYCLES_LINE;

  return (
    <>
      {renderHeader(addButton, staffLine)}
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel">
        {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy} onDismiss={() => setBanner(null)} />}
        {live.status === 'ready' && (
          <div className="ev-side">
            <span id={sideLabelId} className="visually-hidden">
              {T.SIDE_SWITCH_LABEL}
            </span>
            <Choice
              labelId={sideLabelId}
              value={side}
              onChange={setSide}
              options={[
                {
                  key: 'upcoming',
                  label: `${T.UPCOMING} ${upcoming.length}`,
                  content: (
                    <>
                      {T.UPCOMING}
                      <span className="ev-side-count">{upcoming.length}</span>
                    </>
                  ),
                },
                {
                  key: 'past',
                  label: `${T.PAST} ${past.length}`,
                  content: (
                    <>
                      {T.PAST}
                      <span className="ev-side-count">{past.length}</span>
                    </>
                  ),
                },
              ]}
            />
          </div>
        )}
        {body}
      </div>
      {content && <RowMenu anchor={menu.anchor} isSheet={isPhone} title={content.title} subtitle={content.subtitle} label={content.label} items={content.items} onClose={closeMenu} />}
      {!screenLocked && editor.element}
      {confirm && !screenLocked && (
        <ConfirmDialog
          key={confirm.key}
          title={confirm.title}
          body={confirm.body}
          cancelLabel={T.CANCEL}
          confirmLabel={T.DELETE_CYCLE}
          danger
          failed={confirm.failed ? T.DELETE_FAILED : null}
          busy={confirm.saving}
          onConfirm={confirmDelete}
          onCancel={() => {
            if (confirm.saving) return;
            const opener = confirm.opener;
            const id = confirm.id;
            setConfirm(null);
            focusLater(() => moreEl(id), () => opener);
          }}
        />
      )}
    </>
  );
}
