// CampsTab.jsx — the "Camps" tab: the camps of the chosen school (C1).
// Why it exists: approved mockup C1 (Color Belt's Events list, with a camp's days instead of one
// testing date). This file:
//   - loads the camps (campsApi.loadCamps) and keeps them fresh every 15 seconds (useLiveLoad,
//     reused from Color Belt), so new family sign-ups show up in the Campers column
//   - shows them on an Upcoming / Past switch with counts (Past = the last day has gone by)
//   - one status tag per camp: Open until … (green), Not open yet, Closed, Camp today, Done
//   - "Both schools · held at Worcester" under a both-schools camp's name; on the switcher's Both
//     a School column instead (phone: a line on the card)
//   - admins: the Edit pencil (PC / tablet) and the ⋯ menu (CampRowMenu.jsx); staff: ⋯ with Close
//     / Reopen sign-up and Print roster only
//   - a click on a row opens the camp's page (App.jsx gives it the #camps/camp/<id> address)
//
// Columns (PC and tablet): Camp · [School on Both] · Dates (all days + how many) · Campers ·
// Status · Edit + ⋯. Phone: a card per camp — name, "dates · N days · N campers", school line, tag.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconDots, IconEdit } from '@tabler/icons-react';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import IconButton from '../../components/IconButton.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import { loadCamps, campToday } from '../../lib/camps/campsApi.js';
import { campTag, firstDay } from '../../lib/camps/campRules.js';
import { PHONE_QUERY, TOUCH_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import { useRowArrowNav } from '../../lib/useRowArrowNav.js';
import ChoiceGroup from '../testing/events/ChoiceGroup.jsx';
import { LIVE_REFRESH_MS, useLiveLoad } from '../testing/events/useLiveLoad.js';
import { useCampActions } from './CampRowMenu.jsx';
import * as T from './text.js';

// Upcoming / Past, per school, kept while the page is open (like Color Belt's Events tab).
const sideBySchool = new Map();

const byDay = (a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);

// The list answer → one object per camp with its sorted days and active camper count. The data
// layer may give each camp its own `days` and `camperCount`, or the days and counts beside the
// list (§5.2: "then the camps' days … and camperCount") — both are read here.
export function campsOf(result) {
  const list = result?.camps ?? [];
  return list.map((camp) => {
    const own = Array.isArray(camp.days) ? camp.days : (result.days ?? []).filter((d) => d.campId === camp.id);
    const days = own.map((d) => ({ dayId: d.dayId ?? d.id, day: d.day })).sort(byDay);
    const camperCount = camp.camperCount ?? result.camperCounts?.[camp.id] ?? result.counts?.[camp.id] ?? 0;
    return { ...camp, days, camperCount };
  });
}

const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
  school: (a, b) => T.schoolColumn(a).localeCompare(T.schoolColumn(b)),
  date: (a, b) => ((firstDay(a.days) ?? '') < (firstDay(b.days) ?? '') ? -1 : (firstDay(a.days) ?? '') > (firstDay(b.days) ?? '') ? 1 : 0),
  campers: (a, b) => a.camperCount - b.camperCount,
  status: (a, b) => T.campTagText(a.tag).localeCompare(T.campTagText(b.tag)),
};

const find = (selector) => document.querySelector(selector);
const moreEl = (id) => find(`[data-camp-more="${id}"]`);

export default function CampsTab({
  locationKey,
  isAdmin,
  panelId,
  tabId,
  refreshKey,
  onOpenCamp,
  onEditCamp,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
}) {
  const live = useLiveLoad({ key: locationKey, enabled: !screenLocked, load: loadCamps, refreshMs: LIVE_REFRESH_MS });
  const today = live.data?.today ?? campToday();
  const camps = campsOf(live.data);
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });

  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const showSchool = locationKey === 'both';

  const [side, setSideState] = useState(() => sideBySchool.get(locationKey) ?? 'upcoming');
  const [sort, setSort] = useState(null);
  const [menu, setMenu] = useState(null); // { id, anchor }
  const [banner, setBanner] = useState(null);

  function setSide(next) {
    sideBySchool.set(locationKey, next);
    setSideState(next);
    setSort(null);
  }
  // Another school: its own remembered side; menus and banners belonged to the old one.
  const previousRef = useRef(locationKey);
  useEffect(() => {
    if (previousRef.current === locationKey) return;
    previousRef.current = locationKey;
    setSideState(sideBySchool.get(locationKey) ?? 'upcoming');
    setSort(null);
    setBanner(null);
    setMenu(null);
  }, [locationKey]);

  async function reloadQuiet() {
    const result = await liveRef.current.reload();
    if (result === 'error') setBanner({ text: T.LOAD_CAMPS_FAILED, retry: retryLoad });
    return result;
  }
  async function retryLoad() {
    const result = await liveRef.current.reload();
    if (result === 'ok') setBanner(null);
  }
  // A save in the Add / Edit camp dialog (Camps.jsx) asks for a reload.
  useEffect(() => {
    if (refreshKey > 0) liveRef.current.reload();
  }, [refreshKey]);
  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  const actions = useCampActions({
    isAdmin,
    today,
    screenLocked,
    showToast,
    clearToast,
    onNoAccess,
    onRefreshProfile,
    setBanner,
    reload: reloadQuiet,
  });
  useEffect(() => {
    onModalOpenChange(actions.dialogOpen);
  }, [actions.dialogOpen, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  // Locking closes the ⋯ menu; focus goes back to its button after unlocking.
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
    const frame = window.requestAnimationFrame(() => moreEl(id)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [screenLocked]);

  // ===== Rows =====
  const rows = camps.map((camp) => ({ ...camp, tag: campTag(camp, camp.days, today) }));
  const upcoming = rows.filter((camp) => camp.tag.kind !== 'done');
  const past = rows.filter((camp) => camp.tag.kind === 'done');
  // Upcoming: soonest first. Past: most recent first. A clicked column header re-sorts.
  let shown = [...(side === 'past' ? past : upcoming)].sort((a, b) => (side === 'past' ? -1 : 1) * SORTERS.date(a, b));
  if (sort) shown = [...shown].sort((a, b) => sort.dir * SORTERS[sort.key](a, b));

  function toggleSort(key) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: 1 };
      if (current.dir === 1) return { key, dir: -1 };
      return null;
    });
  }

  // ===== The ⋯ menu =====
  function openMenu(camp, anchor) {
    if (isPhone) clearToast(); // a phone sheet: no toast floating over it
    setMenu((current) => (current && current.id === camp.id ? null : { id: camp.id, anchor }));
  }
  function closeMenu(reason) {
    const current = menu;
    setMenu(null);
    if (current && (reason === 'escape' || reason === 'tab')) current.anchor?.focus();
  }
  const menuCamp = menu && !screenLocked ? rows.find((c) => c.id === menu.id) : null;

  const nav = useRowArrowNav({ rowKeys: shown.map((c) => c.id), onOpen: (id) => onOpenCamp(id) });

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
  const tagFor = (camp) => <span className={`ttag${camp.tag.kind === 'open' ? ' ttag--ok' : ''}`}>{T.campTagText(camp.tag)}</span>;

  let body;
  if (live.status === 'loading' || live.status === 'idle') {
    body = (
      <div className="clist tskeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING_CAMPS}</span>
        {[0, 1, 2].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (live.status === 'error') {
    body = <ErrorBanner text={T.LOAD_CAMPS_FAILED} onRetry={() => liveRef.current.reload()} />;
  } else if (live.status === 'noAccess') {
    body = null;
  } else if (shown.length === 0) {
    let text;
    if (rows.length === 0) text = isAdmin ? T.NO_CAMPS_ADMIN : T.NO_CAMPS_STAFF;
    else text = side === 'past' ? T.NO_PAST : T.NO_UPCOMING;
    body = <p className="tempty ev-empty">{text}</p>;
  } else {
    body = (
      <div
        className={`clist ev-list cp-list${showSchool ? ' has-school' : ''}${isTouch ? ' is-touch' : ''}`}
        role="table"
        aria-label={side === 'past' ? T.PAST : T.UPCOMING}
      >
        {!isPhone && (
          <div className="ev-row ev-head cp-row" role="row">
            {header('name', T.COL_CAMP)}
            {showSchool && header('school', T.COL_SCHOOL)}
            {header('date', T.COL_DATES)}
            {header('campers', T.COL_CAMPERS, true)}
            {header('status', T.COL_STATUS)}
            <span className="ev-th" role="columnheader" aria-label={T.ACTIONS_COL} />
          </div>
        )}
        <div role="rowgroup" {...nav.containerProps}>
          {shown.map((camp) => {
            const open = menu?.id === camp.id;
            const isoDays = camp.days.map((d) => d.day);
            const more = (
              <IconButton
                label={T.moreFor(camp.name)}
                Icon={IconDots}
                aria-haspopup="menu"
                aria-expanded={open ? 'true' : 'false'}
                data-camp-more={camp.id}
                tabIndex={nav.itemTabIndex(camp.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  openMenu(camp, event.currentTarget);
                }}
              />
            );
            const edit =
              isAdmin && !isPhone ? (
                <IconButton
                  label={T.editCampLabel(camp.name)}
                  Icon={IconEdit}
                  tabIndex={nav.itemTabIndex(camp.id)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditCamp(camp, event.currentTarget);
                  }}
                />
              ) : null;
            const heldAt = camp.bothSchools && !showSchool ? <span className="ev-ssub cp-heldat">{T.heldAtLine(camp.locationCode)}</span> : null;
            return (
              <div
                key={camp.id}
                className={`ev-row cp-row${open ? ' is-selected' : ''}${isPhone ? ' is-phone' : ''}`}
                role="row"
                aria-label={T.openCampLabel(camp.name)}
                {...nav.rowProps(camp.id)}
                onClick={() => onOpenCamp(camp.id)}
              >
                {isPhone ? (
                  <>
                    <span className="ev-phone-main" role="cell">
                      <span className="ev-name">{camp.name}</span>
                      <span className="l2">{T.campPhoneLine(isoDays, camp.camperCount)}</span>
                      {camp.bothSchools && <span className="l2">{T.heldAtLine(camp.locationCode)}</span>}
                      <span className="ev-phone-tag">{tagFor(camp)}</span>
                    </span>
                    <span className="acts" role="cell">
                      {more}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="cp-name-cell" role="cell">
                      <span className="ev-name">{camp.name}</span>
                      {heldAt}
                    </span>
                    {showSchool && <span role="cell">{T.schoolColumn(camp)}</span>}
                    <span role="cell">{T.campDatesLine(isoDays)}</span>
                    <span role="cell" className="num">
                      {camp.camperCount}
                    </span>
                    <span role="cell">{tagFor(camp)}</span>
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

  const sideLabelId = `${panelId}-side`;
  return (
    <>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel">
        {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={actions.busy} onDismiss={() => setBanner(null)} />}
        {live.status === 'ready' && (
          <div className="ev-side">
            <span id={sideLabelId} className="visually-hidden">
              {T.SIDE_SWITCH_LABEL}
            </span>
            <ChoiceGroup
              labelId={sideLabelId}
              value={side}
              onChange={setSide}
              options={[
                { key: 'upcoming', label: `${T.UPCOMING} ${upcoming.length}`, content: <>{T.UPCOMING}<span className="ev-side-count">{upcoming.length}</span></> },
                { key: 'past', label: `${T.PAST} ${past.length}`, content: <>{T.PAST}<span className="ev-side-count">{past.length}</span></> },
              ]}
            />
          </div>
        )}
        {body}
      </div>
      {menuCamp && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={menuCamp.name}
          subtitle={T.campDatesText(menuCamp.days.map((d) => d.day))}
          label={T.moreFor(menuCamp.name)}
          items={actions.items(menuCamp, menuCamp.days, { includeEdit: isPhone, onEdit: onEditCamp, anchor: menu.anchor })}
          onClose={closeMenu}
        />
      )}
      {actions.elements}
    </>
  );
}

