// DayReport.jsx — Finance → Daily report: one school's payments for one day (mockups D1–D4, D6–D8, D11–D14).
// Why it exists: families pay for Color belt and Star testing at the desk. This page lists the
// day's payments, grouped the way the drawer is counted (Cash, Check, Card), with the four
// totals on top and the "Close the day" box where staff type what they counted (v0.193–v0.209).
//
// Who sees what (v0.195, enforced by the database):
//   staff  — today only ("Staff see today only. Ask an admin for other days."), Close the day, Print
//   admins — any day: ‹ › arrows, a calendar, Today, History, Print, Export…, Reopen day
// On Both: one summary box per school instead (BothSummary.jsx, D6); no Print or Export there.
// Phones: the buttons of the date row sit under ⋯ (a sheet from the bottom, D14).
//
// Loading (like the Testing event page, v0.157): a gray skeleton only the first time; the day
// reloads quietly when the school or the day changes, when the screen unlocks, when the browser
// tab becomes visible again and after every change made here. If someone else changed the day
// in the meantime, a change is refused ('stale') and an amber line says so while it reloads.
//
// Props (from Finance.jsx): location, isAdmin, today, day, onDay(day), onOpenHistory(),
//   onLocationChange(name), profileName, screenLocked, onNoAccess, onRefreshProfile,
//   showToast, clearToast, onModalOpenChange, onOpenTesting(schoolName, eventId, source)
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconCalendar,
  IconCalendarEvent,
  IconCash,
  IconChevronLeft,
  IconChevronRight,
  IconCreditCard,
  IconDots,
  IconDownload,
  IconHistory,
  IconPrinter,
  IconReceipt,
  IconReceiptRefund,
  IconSum,
} from '@tabler/icons-react';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import IconButton from '../../components/IconButton.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import { LOCATION_CODE } from '../../lib/device.js';
import { getRefundLayout, setRefundLayout, FINANCE_DEVICE_EVENT } from '../../lib/finance/deviceFinance.js';
import {
  financeCloseDay,
  financeDay,
  financeDayBoth,
  financeReopenDay,
  financeUndoClose,
} from '../../lib/finance/financeApi.js';
import { cardsFor, expectedValues, groupItems } from '../../lib/finance/financeRules.js';
import { PHONE_QUERY, WIDE_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import ChoiceGroup from '../testing/events/ChoiceGroup.jsx';
import { useLiveLoad } from '../testing/events/useLiveLoad.js';
import BothSummary from './BothSummary.jsx';
import CloseDayBox, { checkDraft } from './CloseDayBox.jsx';
import ClosedBox from './ClosedBox.jsx';
import ExportDialog from './ExportDialog.jsx';
import PaymentDetailDialog from './PaymentDetailDialog.jsx';
import PaymentsList, { cardSub, groupAnchorId } from './PaymentsList.jsx';
import PrintPage from './PrintPage.jsx';
import { addDays, dayLong, dayLongNoYear, dayShort, dayShortYear, money } from './format.js';
import * as T from './text.js';

// What people typed in Close the day, per school and day, kept while the dashboard is open — so
// switching school or tab, a failed save (D13) or an Undo never loses it.
const drafts = new Map();
const EMPTY_DRAFT = { cash: '', count: '', checks: '', card: '', note: '', tried: false, failed: false };

// This device's refund layout ('own' | 'in'), re-read when it changes (deviceFinance.js).
function useRefundLayout() {
  const [layout, setLayout] = useState(getRefundLayout);
  useEffect(() => {
    const reread = () => setLayout(getRefundLayout());
    window.addEventListener(FINANCE_DEVICE_EVENT, reread);
    return () => window.removeEventListener(FINANCE_DEVICE_EVENT, reread);
  }, []);
  return [layout, setRefundLayout];
}

// The "Refunds: Own group | In groups" switch (v0.209), shown only on days with refunds.
function RefundSwitch({ layout, onChange }) {
  const labelId = useRef(`fin-refunds-${Math.random().toString(36).slice(2)}`).current;
  return (
    <span className="fin-refund-switch">
      <span id={labelId}>{T.REFUNDS}</span>
      <span className="fin-seg">
        <ChoiceGroup
          labelId={labelId}
          value={layout}
          onChange={onChange}
          options={[
            { key: 'own', label: T.LAYOUT_OWN },
            { key: 'in', label: T.LAYOUT_IN },
          ]}
        />
      </span>
    </span>
  );
}

// The four metric cards (D1). Cash / Check / Card jump to their group (rule 8).
function Cards({ data, layout, onJump, groupsShown }) {
  const cards = cardsFor(data.totals, data.refunds, layout);
  // In groups, a Cash / Check card says how many refunds it holds ("4 payments, 1 refund").
  const sub = (key) => cardSub(data.items ?? [], cards, key, layout);
  const list = [
    { key: 'cash', label: T.CARD_CASH, Icon: IconCash },
    { key: 'check', label: T.CARD_CHECK, Icon: IconReceipt },
    { key: 'card', label: T.CARD_CARD, Icon: IconCreditCard },
  ];
  const inner = (Icon, label, cents, subText) => (
    <>
      <span className="fin-card-label">
        <Icon size={16} aria-hidden="true" />
        {label}
      </span>
      <span className="fin-card-value">{money(cents)}</span>
      <span className="fin-card-sub">{subText}</span>
    </>
  );
  return (
    <div className="fin-cards">
      <div className="fin-card">
        {inner(
          IconSum,
          T.CARD_TOTAL,
          cards.total.cents,
          cards.total.sub === 'after_refunds' ? T.afterRefunds(cards.total.refundCents) : T.paymentsCount(cards.total.count),
        )}
      </div>
      {list.map(({ key, label, Icon }) =>
        groupsShown.has(key) ? (
          <button
            key={key}
            type="button"
            className="fin-card fin-card--button"
            // The card's figures, then what clicking does ("Show the Cash payments").
            aria-label={`${label} ${money(cards[key].cents)}, ${sub(key)}. ${T.jumpToGroup(label)}`}
            onClick={() => onJump(key)}
          >
            {inner(Icon, label, cards[key].cents, sub(key))}
          </button>
        ) : (
          <div key={key} className="fin-card">
            {inner(Icon, label, cards[key].cents, sub(key))}
          </div>
        ),
      )}
    </div>
  );
}

export default function DayReport({
  location,
  isAdmin,
  today,
  day,
  onDay,
  onOpenHistory,
  onLocationChange,
  profileName,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
  onOpenTesting,
}) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const wide = useMediaQuery(WIDE_QUERY);
  const [layout, setLayout] = useRefundLayout();
  const isBoth = location === 'Both';
  const code = isBoth ? null : LOCATION_CODE[location];
  const isToday = day === today;

  // ----- Loading -----
  const key = isBoth ? `both|${day}` : `${code}|${day}`;
  const live = useLiveLoad({
    key,
    enabled: !screenLocked,
    load: () => (isBoth ? financeDayBoth({ day }) : financeDay({ locationCode: code, day })),
  });
  const data = live.data;
  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  // ----- Close the day: the typed counts of this school and day -----
  const [, setDraftVersion] = useState(0); // bumped to redraw after a draft changes
  const draftKey = `${code}|${day}`;
  const draft = drafts.get(draftKey) ?? EMPTY_DRAFT;
  const changeDraft = useCallback(
    (patch, forKey = draftKey) => {
      drafts.set(forKey, { ...(drafts.get(forKey) ?? EMPTY_DRAFT), ...patch });
      setDraftVersion((n) => n + 1);
    },
    [draftKey],
  );

  const [banner, setBanner] = useState(null); // { text, retry? } — amber, until dismissed or fixed
  const [saving, setSaving] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [detail, setDetail] = useState(null); // the payment whose detail is open
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(null); // { printedAt } while the page prints
  const [menu, setMenu] = useState(null); // the phone ⋯ sheet: { anchor }
  // The control that opened a dialog or the ⋯ sheet (a payment row, Export…, ⋯): keyboard focus
  // goes back to it when that closes, so keyboard and screen-reader users don't lose their place.
  const openerRef = useRef(null);
  function focusOpener() {
    const opener = openerRef.current;
    // The page behind a dialog is "inert" (unfocusable) until the App has seen the dialog close,
    // which takes a moment — so try again a few times (about every 16 ms) until focus can land.
    let tries = 0;
    const attempt = () => {
      tries += 1;
      if (!opener || !opener.isConnected) return;
      if (!opener.closest('[inert]')) opener.focus();
      if (document.activeElement !== opener && tries < 20) window.setTimeout(attempt, 16);
    };
    window.setTimeout(attempt, 0);
  }

  // A banner belongs to the school and day it was about.
  useEffect(() => setBanner(null), [key]);

  // Tell the App when a dialog is open (the page behind becomes inert).
  useEffect(() => {
    onModalOpenChange(Boolean(detail || exporting));
  }, [detail, exporting, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);
  // The lock screen closes menus and dialogs (nothing typed in them is lost: they hold nothing).
  useEffect(() => {
    if (screenLocked) {
      setMenu(null);
      setDetail(null);
      setExporting(false);
    }
  }, [screenLocked]);

  // ----- Print (D8): draw the page, print, remove it again -----
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done);
    const frame = window.requestAnimationFrame(() => window.print()); // wait one frame so the page is drawn
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  // The database answered with a problem code: say so (amber), reload, and react.
  function handleProblem(answer, failedText, retry) {
    switch (answer.status) {
      case 'no_access':
        onNoAccess();
        return;
      case 'stale':
        setBanner({ text: T.STALE });
        break;
      case 'already_closed':
        setBanner({ text: T.ALREADY_CLOSED });
        break;
      case 'nothing_to_close':
        setBanner({ text: T.NOTHING_TO_CLOSE_NOW });
        break;
      case 'not_closed':
        setBanner({ text: T.NOT_CLOSED_ANY_MORE });
        break;
      case 'too_late':
        setBanner({ text: T.TOO_LATE_UNDO });
        break;
      case 'not_allowed':
        setBanner({ text: T.NOT_ALLOWED });
        onRefreshProfile();
        break;
      default:
        setBanner({ text: failedText, retry });
        return; // a failed call changed nothing: no reload needed
    }
    live.reload();
  }

  // ----- Close the day -----
  async function closeDay() {
    if (!data || saving) return;
    const forKey = draftKey;
    const expected = expectedValues(data.totals, data.refunds);
    const current = drafts.get(forKey) ?? EMPTY_DRAFT;
    const check = checkDraft(current, expected);
    if (!check.valid || !check.noteOk) {
      changeDraft({ tried: true }, forKey);
      // Put the cursor where the problem is: the note, or the first field with an error.
      window.requestAnimationFrame(() => {
        const target = !check.valid ? document.querySelector('.fin-box [aria-invalid="true"]') : document.querySelector('[data-close-note]');
        target?.focus();
      });
      return;
    }
    setSaving(true);
    setBanner(null);
    clearToast();
    const answer = await financeCloseDay({
      locationCode: code,
      day,
      expectedFingerprint: data.fingerprint,
      cashCents: check.counted.cashCents,
      checksCount: check.counted.checksCount,
      checksCents: check.counted.checksCents,
      cardCents: check.counted.cardCents,
      note: current.note.trim() || null,
    });
    setSaving(false);
    if (answer.status === 'ok') {
      changeDraft({ failed: false, tried: false }, forKey);
      const closingId = answer.closing_id;
      showToast(isToday ? T.DRAWER_CLOSED : T.drawerClosedOn(day), {
        action: { label: T.UNDO, onAction: () => undoClose(closingId) },
      });
      live.reload();
      return;
    }
    if (answer.status === 'note_required') {
      changeDraft({ tried: true }, forKey);
      window.requestAnimationFrame(() => document.querySelector('[data-close-note]')?.focus());
      return;
    }
    if (answer.status === 'network_error' || answer.status === 'invalid') {
      // D13: the box keeps everything typed, says Not saved, and offers Retry close the day.
      changeDraft({ failed: true }, forKey);
      return;
    }
    handleProblem(answer, T.CLOSE_FAILED, null);
  }

  // The toast's Undo (10 seconds for the person who closed, enforced by the database).
  async function undoClose(closingId) {
    const answer = await financeUndoClose({ closingId });
    if (answer.status === 'ok') {
      showToast(T.CLOSE_UNDONE, { icon: false });
      live.reload();
      return;
    }
    handleProblem(answer, T.UNDO_FAILED, null);
  }

  // ----- Reopen day (admins, D4) -----
  async function reopen() {
    if (!data?.closing || reopening) return;
    setReopening(true);
    setBanner(null);
    clearToast();
    const answer = await financeReopenDay({ locationCode: code, day, expectedClosingId: data.closing.id });
    setReopening(false);
    if (answer.status === 'ok') {
      showToast(T.DAY_REOPENED, { icon: false });
      live.reload();
      return;
    }
    handleProblem(answer, T.REOPEN_FAILED, () => reopen());
  }

  // ----- Jumping from a card to its group -----
  function jumpTo(groupKey) {
    const target = document.getElementById(groupAnchorId(groupKey));
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    target.focus({ preventScroll: true });
  }

  // ----- Calendar (admins): the browser's own date picker -----
  const dateInputRef = useRef(null);
  function openCalendar() {
    const input = dateInputRef.current;
    if (!input) return;
    try {
      input.showPicker(); // opens the date picker (modern browsers)
    } catch {
      input.focus();
      input.click();
    }
  }

  // ----- The date row -----
  const hasRefunds = !isBoth && (data?.refunds?.count ?? 0) > 0;
  const canPrint = !isBoth && data && !live.status.startsWith('load');
  const titleText = isAdmin
    ? isPhone
      ? dayShort(day)
      : wide
        ? dayLong(day)
        : dayShortYear(day)
    : T.todayTitle(isPhone ? dayShort(day) : dayLongNoYear(day));

  // The phone ⋯ sheet items (D14): staff Print; admins Today, History, Print, Export… (Both: History).
  const menuItems = [];
  if (isAdmin && !isToday) menuItems.push({ key: 'today', label: T.TODAY, Icon: IconCalendarEvent, onSelect: () => onDay(null) });
  if (isAdmin) menuItems.push({ key: 'history', label: T.HISTORY, Icon: IconHistory, onSelect: onOpenHistory });
  if (canPrint) menuItems.push({ key: 'print', label: T.PRINT, Icon: IconPrinter, onSelect: () => setPrinting({ printedAt: new Date() }) });
  // (Export from the sheet: focus comes back to the ⋯ button afterwards.)
  if (isAdmin && !isBoth) menuItems.push({ key: 'export', label: T.EXPORT, Icon: IconDownload, onSelect: () => setExporting(true) });
  if (hasRefunds) {
    menuItems.push({
      key: 'layout',
      label: layout === 'own' ? T.LAYOUT_TO_IN : T.LAYOUT_TO_OWN,
      Icon: IconReceiptRefund,
      onSelect: () => setLayout(layout === 'own' ? 'in' : 'own'),
    });
  }

  const dayRow = (
    <div className="fin-dayrow">
      {isAdmin && (
        <>
          <IconButton label={T.PREVIOUS_DAY} Icon={IconChevronLeft} className="fin-ibtn" onClick={() => onDay(addDays(day, -1))} />
          <h2 className="fin-day">{titleText}</h2>
          <IconButton
            label={T.NEXT_DAY}
            Icon={IconChevronRight}
            className={`fin-ibtn${isToday ? ' is-unavailable' : ''}`}
            aria-disabled={isToday ? 'true' : undefined}
            onClick={() => {
              if (!isToday) onDay(addDays(day, 1) >= today ? null : addDays(day, 1));
            }}
          />
          <span className="fin-cal">
            <IconButton label={T.PICK_DATE} Icon={IconCalendar} className="fin-ibtn" onClick={openCalendar} />
            {/* The real date field, invisible, under the calendar button: showPicker() opens it. */}
            <input
              ref={dateInputRef}
              className="fin-cal-input"
              type="date"
              tabIndex={-1}
              aria-hidden="true"
              max={today}
              value={day}
              onChange={(event) => {
                const picked = event.target.value;
                if (picked) onDay(picked >= today ? null : picked);
              }}
            />
          </span>
          {!isPhone && !isToday && (
            <button type="button" className="btn" onClick={() => onDay(null)}>
              {T.TODAY}
            </button>
          )}
          {!isPhone && (
            <button type="button" className="btn" onClick={onOpenHistory}>
              <IconHistory size={16} aria-hidden="true" />
              {T.HISTORY}
            </button>
          )}
        </>
      )}
      {!isAdmin && <h2 className="fin-day">{titleText}</h2>}
      {!isAdmin && !isPhone && <span className="fin-hint">{T.STAFF_HINT}</span>}
      <span className="fin-grow" />
      {/* The right-hand actions stay together: when the row is too narrow (tablet) they move to
          the next line as one group, still on the right — never one button alone. */}
      {!isPhone && (hasRefunds || canPrint || (isAdmin && !isBoth)) && (
        <span className="fin-dayrow-actions">
          {hasRefunds && <RefundSwitch layout={layout} onChange={setLayout} />}
          {canPrint && (
            <button type="button" className="btn" onClick={() => setPrinting({ printedAt: new Date() })}>
              <IconPrinter size={16} aria-hidden="true" />
              {T.PRINT}
            </button>
          )}
          {isAdmin && !isBoth && (
            <button
              type="button"
              className="btn"
              onClick={(event) => {
                openerRef.current = event.currentTarget;
                setExporting(true);
              }}
            >
              <IconDownload size={16} aria-hidden="true" />
              {T.EXPORT}
            </button>
          )}
        </span>
      )}
      {isPhone && menuItems.length > 0 && (
        <IconButton
          label={T.MORE_ACTIONS}
          Icon={IconDots}
          className="fin-more"
          aria-haspopup="menu"
          aria-expanded={menu ? 'true' : 'false'}
          onClick={(event) => {
            openerRef.current = event.currentTarget;
            setMenu(menu ? null : { anchor: event.currentTarget });
          }}
        />
      )}
    </div>
  );

  // ----- The body -----
  let body;
  if (live.status === 'loading' || live.status === 'idle') {
    body = (
      <div className="fin-skeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING}</span>
        <div className="fin-skeleton-cards" aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} />
          ))}
        </div>
      </div>
    );
  } else if (!data) {
    body = <ErrorBanner text={T.LOAD_FAILED} onRetry={() => live.reload()} />;
  } else if (isBoth) {
    body = <BothSummary data={data} onOpenSchool={(name) => onLocationChange(name)} />;
  } else {
    const items = data.items ?? [];
    const closing = data.closing && (data.closing.kind ?? 'close') === 'close' ? data.closing : null;
    const countedSomething = (data.totals?.count ?? 0) + (data.refunds?.count ?? 0) > 0;
    const groupsShown = new Set(groupItems(items, layout).map((g) => g.key));
    let box = null;
    if (closing) {
      box = <ClosedBox closing={closing} items={items} isAdmin={isAdmin} reopening={reopening} onReopen={reopen} />;
    } else if (!countedSomething) {
      // D11: nothing to close on a day with no payments.
      box = (
        <div className="fin-box fin-empty">
          <p className="fin-empty-line">{isToday ? T.NO_PAYMENTS_TODAY : T.NO_PAYMENTS_DAY}</p>
          <p className="fin-hint">{T.NOTHING_TO_CLOSE}</p>
        </div>
      );
    } else if (data.can_close !== false) {
      box = (
        <CloseDayBox
          draft={draft}
          onDraftChange={(patch) => changeDraft(patch)}
          expected={expectedValues(data.totals, data.refunds)}
          totals={data.totals}
          refunds={data.refunds}
          isToday={isToday}
          saving={saving}
          isPhone={isPhone}
          onCloseDay={closeDay}
        />
      );
    }
    body = (
      <>
        <Cards data={data} layout={layout} groupsShown={groupsShown} onJump={jumpTo} />
        {box}
        <PaymentsList items={items} layout={layout} refunds={data.refunds} wide={wide} isPhone={isPhone} onOpen={(item, row) => {
            openerRef.current = row;
            setDetail(item);
          }}
        />
      </>
    );
  }

  return (
    <>
      {dayRow}
      {!isAdmin && isPhone && <p className="fin-hint fin-staff-hint">{T.STAFF_HINT}</p>}
      {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ?? undefined} retrying={reopening} onDismiss={() => setBanner(null)} />}
      {body}

      {menu && !screenLocked && (
        <RowMenu
          anchor={menu.anchor}
          isSheet
          title={titleText}
          label={T.MORE_ACTIONS}
          items={menuItems}
          onClose={(reason) => {
            setMenu(null);
            // Esc / Cancel / a tap outside: back to ⋯. An item that opens a dialog keeps ⋯ as the
            // opener, so focus returns there when the dialog closes.
            if (reason !== 'select') focusOpener();
          }}
        />
      )}
      {detail && (
        <PaymentDetailDialog
          item={detail}
          school={location}
          isPhone={isPhone}
          onClose={() => {
            setDetail(null);
            focusOpener();
          }}
          onNoAccess={onNoAccess}
          onOpenInTesting={(eventId, source) => {
            setDetail(null);
            onOpenTesting(location, eventId, source);
          }}
        />
      )}
      {exporting && (
        <ExportDialog
          school={location}
          locationCode={code}
          today={today}
          isPhone={isPhone}
          onClose={() => {
            setExporting(false);
            focusOpener();
          }}
          onNoAccess={onNoAccess}
          onDone={() => {
            setExporting(false);
            focusOpener();
            showToast(T.EXPORT_DONE, { icon: true });
          }}
        />
      )}
      {printing && data && !isBoth && (
        <PrintPage data={data} school={location} layout={layout} printedAt={printing.printedAt} printedBy={profileName} />
      )}
    </>
  );
}
