// CandidatesTab.jsx — the Candidates tab of a Black Belt testing cycle's page.
// Why it exists: contract CONTRACT-0016-B2 §3.2, approved mockups Candidates 1–7 and 9. Top to
// bottom:
//   - (one school on the location switcher) "Showing Worcester candidates only · Show both schools"
//   - the amber possible-duplicate box with Review (DuplicateBox.jsx)
//   - the four summary cards that filter the list (phones: two pills) (SummaryCards.jsx)
//   - Search candidates, and on the PC the caption "9 candidates · Dan, then school, then last name"
//   - the roster (RosterRows.jsx) with each row's ⋯ menu, and the Removed group at the bottom
//   - every dialog: the candidate detail and what opens from it (useCandidateActions.js decides)
// "+ Add candidate" sits in the cycle page's header (CyclePage.jsx); it opens the Add dialog here
// through `actionsRef`.
//
// It follows the location switcher (v0.118): on Worcester or Shrewsbury the list, the cards and
// the duplicate box show that school only; Both shows everyone. With the device's Hide payments
// switch on (v0.215, OP-B7) there are no cards, no money columns and no payment actions.
// The list reloads by itself (useLiveLoad): on open, after every own change, when the screen
// unlocks or the browser tab comes back, and quietly every 15 seconds — never touching an open
// dialog or what someone is typing.
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { loadRoster, schoolToday } from '../../../lib/blackBelt/api.js';
import { duplicatePairs, rosterCards, rosterFilter } from '../../../lib/blackBelt/rules.js';
import { PHONE_QUERY, WIDE_QUERY, TOUCH_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { useRowArrowNav } from '../../../lib/useRowArrowNav.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../screens/testing/events/useLiveLoad.js';
import { usePaymentsHidden } from '../../../screens/finance/usePaymentsHidden.js';
import ReceiptDialog from '../receipt/ReceiptDialog.jsx';
import AddCandidateDialog from './AddCandidateDialog.jsx';
import CandidateDialog from './CandidateDialog.jsx';
import ChangePlanDialog from './ChangePlanDialog.jsx';
import CompareDialog from './CompareDialog.jsx';
import DuplicateBox from './DuplicateBox.jsx';
import EditPaymentDialog from './EditPaymentDialog.jsx';
import RecordPaymentDialog from './RecordPaymentDialog.jsx';
import RefundDialog from './RefundDialog.jsx';
import RemoveDialog, { DeleteConfirm } from './RemoveDialog.jsx';
import ReturnedDialog from './ReturnedDialog.jsx';
import RosterRows from './RosterRows.jsx';
import SignatureDialog from './SignatureDialog.jsx';
import SummaryCards from './SummaryCards.jsx';
import UndoPaymentDialog from './UndoPaymentDialog.jsx';
import { useCandidateActions } from './useCandidateActions.js';
import { ICONS } from './icons.js';
import * as T from '../text.js';

const load = (cycleId) => loadRoster({ cycleId });
const SCHOOL_CODE = { Worcester: 'worcester', Shrewsbury: 'shrewsbury' };

// A grayed menu item with its reason under it ("$330 is already paid. Ask an admin.")
function TwoLines({ label, reason }) {
  return (
    <span className="ev-menu-two">
      <span>{label}</span>
      <span className="ev-menu-reason">{reason}</span>
    </span>
  );
}

export default function CandidatesTab({
  cycle,
  isAdmin,
  location = 'Both',
  onLocationChange,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalChange,
  onCandidatesChanged,
  actionsRef,
  panelId,
  tabId,
}) {
  const live = useLiveLoad({ key: cycle.id, enabled: !screenLocked, load, refreshMs: LIVE_REFRESH_MS });
  const rows = useMemo(() => live.data?.rows ?? [], [live.data]);
  const today = schoolToday();
  const [hidden] = usePaymentsHidden();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const layout = { isPhone, isWide: isWide && !isPhone, isTouch };

  const [search, setSearch] = useState('');
  const [card, setCard] = useState(null);
  const [removedOpen, setRemovedOpen] = useState(false);
  const [menu, setMenu] = useState(null); // { row, anchor }
  const [banner, setBanner] = useState(null);

  const reloadRoster = useCallback(() => live.reload(), [live]);
  const actions = useCandidateActions({
    cycle,
    isAdmin,
    today,
    paymentsHidden: hidden,
    reloadRoster,
    onCandidatesChanged,
    showToast,
    clearToast,
    onNoAccess,
    onRefreshProfile,
    setBanner,
  });
  const { dlg } = actions;

  // The page header's "+ Add candidate" (and N) reach the Add dialog through this.
  const schoolCode = SCHOOL_CODE[location] ?? null;
  useLayoutEffect(() => {
    if (!actionsRef) return undefined;
    actionsRef.current = { openAdd: (opener) => actions.openAdd(opener, schoolCode), isOpen: Boolean(dlg) };
    return () => {
      actionsRef.current = null;
    };
  });

  // Tell the cycle page (and through it the App) when a dialog is on screen.
  const modalShown = Boolean(dlg) && !screenLocked;
  useEffect(() => {
    onModalChange(modalShown);
  }, [modalShown, onModalChange]);
  useEffect(() => () => onModalChange(false), [onModalChange]);

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);
  useEffect(() => {
    if (screenLocked) setMenu(null);
  }, [screenLocked]);
  // Hide payments switched on while a card filter was on: the cards are gone, so is the filter.
  useEffect(() => {
    if (hidden) setCard(null);
  }, [hidden]);

  // ----- What the list shows -----
  const school = location ?? 'Both';
  const counts = useMemo(() => rosterCards(rows, { school }), [rows, school]);
  const shown = useMemo(() => rosterFilter(rows, { school, card, search }), [rows, school, card, search]);
  const activeRows = shown.filter((r) => r.status === 'active');
  const removedRows = card ? [] : shown.filter((r) => r.status === 'withdrawn');
  const pairs = useMemo(() => duplicatePairs(rosterFilter(rows, { school })), [rows, school]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const partnerOf = (row) => (row.duplicateOf ? rowById.get(row.duplicateOf) ?? null : rows.find((r) => r.duplicateOf === row.id && r.status === 'active') ?? null);

  const rowKeys = [...activeRows, ...(removedOpen ? removedRows : [])].map((r) => r.id);
  const nav = useRowArrowNav({
    rowKeys,
    onOpen: (key) => {
      const element = document.querySelector(`[data-nav-row="${CSS.escape(key)}"]`);
      actions.openDetail(key, element);
    },
  });

  // ----- The row ⋯ menu (only what this person may do; contract §3.2) -----
  function rowMenuItems(row) {
    const name = T.candidateName(row);
    const m = row.money ?? {};
    const items = [];
    const target = { id: row.id, firstName: row.firstName, lastName: row.lastName, version: row.version, hasPaymentRows: row.hasPaymentRows };
    const anchor = menu?.anchor;
    if (row.status === 'withdrawn') {
      if (isAdmin) items.push({ key: 'restore', label: T.RESTORE, Icon: ICONS.restore, disabled: actions.busy, onSelect: () => actions.restore(target) });
      if (isAdmin && !hidden && m.paidCents > 0) items.push({ key: 'refund', label: T.RECORD_REFUND, Icon: ICONS.refund, onSelect: () => actions.openRefund(row.id, anchor) });
      if (!hidden) items.push({ key: 'print', label: T.PRINT_RECEIPT, Icon: ICONS.print, onSelect: () => actions.openReceipt(row.id, anchor) });
      if (isAdmin) {
        items.push({
          key: 'delete',
          label: row.hasPaymentRows ? <TwoLines label={T.DELETE_PERMANENTLY} reason={T.hasPaymentRecordsShort(name)} /> : T.DELETE_PERMANENTLY,
          Icon: ICONS.deleteForever,
          danger: !row.hasPaymentRows,
          disabled: row.hasPaymentRows,
          separatorBefore: items.length > 0,
          onSelect: () => actions.openDelete(target, anchor),
        });
      }
      return items;
    }
    if (!hidden && !layout.isWide && m.balanceCents > 0) items.push({ key: 'record', label: T.RECORD_PAYMENT, Icon: ICONS.recordPayment, onSelect: () => actions.openRecordPayment(row.id, anchor) });
    items.push({ key: 'edit', label: T.EDIT_DETAILS, Icon: ICONS.editDetails, onSelect: () => actions.openDetail(row.id, anchor, { edit: true }) });
    // Staff can change the plan only until something is paid; the database decides (not_allowed).
    const planLocked = !isAdmin && m.paidCents > 0;
    items.push({
      key: 'plan',
      label: planLocked ? <TwoLines label={T.CHANGE_PLAN} reason={hidden ? T.PAYMENT_RECORDED_ASK_ADMIN : T.alreadyPaidAskAdmin(m.paidCents)} /> : T.CHANGE_PLAN,
      Icon: ICONS.changePlan,
      disabled: planLocked,
      onSelect: () => actions.openChangePlan(row.id, anchor),
    });
    if (isAdmin && !hidden && m.overpaidCents > 0) {
      items.push({ key: 'refund', label: T.recordRefundOverpaid(m.overpaidCents), Icon: ICONS.refund, onSelect: () => actions.openRefund(row.id, anchor) });
    }
    if (!hidden) items.push({ key: 'print', label: T.PRINT_RECEIPT, Icon: ICONS.print, onSelect: () => actions.openReceipt(row.id, anchor) });
    if (isAdmin) items.push({ key: 'remove', label: T.REMOVE_CANDIDATE, Icon: ICONS.remove, separatorBefore: true, onSelect: () => actions.openRemove(target, anchor) });
    return items;
  }

  const ctx = {
    layout,
    nav,
    hidden,
    busy: actions.busy,
    menuFor: menu?.row?.id ?? null,
    hasMenu: (row) => rowMenuItems(row).length > 0,
    onOpen: (row, element) => actions.openDetail(row.id, element),
    onMore: (row, anchor) => setMenu((current) => (current?.row?.id === row.id ? null : { row, anchor })),
    onRecord: (row, opener) => actions.openRecordPayment(row.id, opener),
    onReview: (row, opener) => actions.openCompare(row, partnerOf(row), opener),
  };

  // ----- Loading and errors -----
  if (live.status === 'loading' || live.status === 'idle' || live.status === 'noAccess') {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="tpanel">
        <div className="clist tskeleton" aria-busy="true">
          <span className="visually-hidden">{T.LOADING_CANDIDATES}</span>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="tskeleton-row" aria-hidden="true">
              <span className="tskeleton-bar" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (live.status === 'error' || live.status === 'notFound') {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="tpanel">
        <ErrorBanner text={T.LOAD_FAILED} onRetry={() => live.reload()} />
      </div>
    );
  }

  const searchText = search.trim();
  let emptyText = T.NO_CANDIDATES;
  if (searchText) emptyText = T.noMatch(searchText);
  else if (card) emptyText = T.NO_FILTER_MATCH;
  const SearchIcon = ICONS.search;
  const ClearIcon = ICONS.clear;

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="tpanel bb-candidates">
      {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => { setBanner(null); banner.retry(); } : undefined} retrying={actions.busy} onDismiss={() => setBanner(null)} />}
      {schoolCode && (
        <p className="bb-school-line">
          {T.showingSchoolOnly(location)} ·{' '}
          <button type="button" className="link-button" onClick={() => onLocationChange?.('Both')}>
            {T.SHOW_BOTH_SCHOOLS}
          </button>
        </p>
      )}
      <DuplicateBox pairs={pairs} busy={actions.busy} onReview={(row, partner, opener) => actions.openCompare(row, partner, opener)} />
      {!hidden && <SummaryCards counts={counts} card={card} onCard={setCard} isPhone={isPhone} />}

      <div className="bb-list-bar">
        <label className="bb-search">
          <SearchIcon size={16} aria-hidden="true" className="bb-search-icon" />
          <span className="visually-hidden">{T.SEARCH_CANDIDATES}</span>
          <input type="search" className="bb-search-input" placeholder={T.SEARCH_CANDIDATES} value={search} maxLength={80} autoComplete="off" onChange={(event) => setSearch(event.target.value)} />
          {search && (
            <button type="button" className="bb-search-clear" aria-label={T.CLEAR_SEARCH} onClick={() => setSearch('')}>
              <ClearIcon size={16} aria-hidden="true" />
            </button>
          )}
        </label>
        {layout.isWide && <p className="bb-caption">{T.listCaption(activeRows.length)}</p>}
      </div>

      <RosterRows
        rows={activeRows}
        removedRows={removedRows}
        removedOpen={removedOpen}
        onToggleRemoved={() => setRemovedOpen(!removedOpen)}
        emptyText={emptyText}
        caption={T.listCaption(activeRows.length)}
        ctx={ctx}
      />

      {menu && !screenLocked && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={T.candidateName(menu.row)}
          subtitle={T.phoneSubline(menu.row)}
          label={T.moreForCandidate(T.candidateName(menu.row))}
          items={rowMenuItems(menu.row)}
          onClose={(reason) => {
            const anchor = menu.anchor;
            setMenu(null);
            if (reason === 'escape' || reason === 'tab') anchor?.focus();
          }}
        />
      )}

      {!screenLocked && dlg && <Dialogs actions={actions} cycle={cycle} isAdmin={isAdmin} isPhone={isPhone} hidden={hidden} today={today} showToast={showToast} />}
    </div>
  );
}

// The one dialog on screen: a child (Record payment, …) or else the detail.
function Dialogs({ actions, cycle, isAdmin, isPhone, hidden, today, showToast }) {
  const { dlg } = actions;
  const c = dlg.child;
  const common = { state: c, cycle, isPhone, today, onChange: actions.changeChild, onCancel: actions.closeChild, onRequestClose: actions.requestCloseChild };
  if (c) {
    switch (c.kind) {
      case 'record':
        return <RecordPaymentDialog {...common} onTicks={actions.setTicks} onSave={actions.saveRecordPayment} />;
      case 'editPayment':
        return <EditPaymentDialog {...common} onTicks={(ticks) => actions.changeChild({ ticks })} onSave={actions.saveEditPayment} />;
      case 'undo':
        return <UndoPaymentDialog {...common} onConfirm={actions.confirmUndoPayment} />;
      case 'refund':
        return <RefundDialog {...common} onSave={actions.saveRefund} />;
      case 'returned':
        return <ReturnedDialog {...common} onSave={actions.saveReturned} />;
      case 'plan':
        return <ChangePlanDialog {...common} isAdmin={isAdmin} hidden={hidden} onSave={actions.saveChangePlan} />;
      case 'add':
        return <AddCandidateDialog {...common} hidden={hidden} onSave={actions.saveAdd} />;
      case 'remove':
        return <RemoveDialog {...common} onWithdraw={actions.withdraw} onDelete={actions.askDelete} />;
      case 'deleteConfirm':
        return <DeleteConfirm {...common} onConfirm={actions.confirmDelete} />;
      case 'compare':
        return <CompareDialog {...common} hidden={hidden} onKeep={(keep, other) => actions.resolve(keep, other, false)} onKeepBoth={() => actions.resolve(c.first, c.second, true)} />;
      case 'signature':
        return <SignatureDialog {...common} />;
      case 'receipt':
        return <ReceiptDialog candidateId={c.candidateId} cycle={cycle} isPhone={isPhone} onClose={actions.closeChild} showToast={showToast} nested={false} />;
      default:
        return null;
    }
  }
  if (dlg.detail) return <CandidateDialog actions={actions} cycle={cycle} isAdmin={isAdmin} isPhone={isPhone} hidden={hidden} today={today} />;
  return null;
}
