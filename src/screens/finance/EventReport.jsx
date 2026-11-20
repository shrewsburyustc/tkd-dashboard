// EventReport.jsx — one event's Money report (pictures ER2, ER3; layout B; migration 0054).
// Why it exists: the boss wants each event to have its own report like Finance's Daily report. This page
// shows ONE event's money, taken from Finance's own rows (so every number equals the Daily report's):
//   - four cards: Total taken · Cash · Check · Card, and a line "Refunded −$100.00 · 1 refund · Net $2,245.00"
//   - on Both schools: a box per school (the school stored on each payment — the desk that took the money)
//   - "By day": one compact row per day, tap to open that day's payments (EventReportDays.jsx)
//   - Print (every day, only this report) and Download CSV (every download is logged by the database)
// It opens from the "Money report" button on an event page (MoneyReportButton.jsx) at the address
// #finance/event-report/<source>/<id>, so reload and the browser's Back work like on every page. The back
// link above the title goes to the event's own page.
// Read-only: nothing here closes, edits or counts anything. Admins only (staff never reach it, and the
// database refuses them with 'not_allowed'); and it goes away while "Hide private details" is on (App.jsx
// sends the address to Home).
//
// It follows the top bar's school: one school → that school's payments only; Both → everything, with the
// school boxes. Loading is like the Daily report: a gray skeleton the first time, then quiet reloads when the
// school changes, the screen unlocks or the browser tab comes back (useLiveLoad).
//
// Props (from App.jsx): source ('color_belt' | 'star' | 'camp' | 'black_belt' | 'board_breaking'), eventId,
//   location ('Worcester' | 'Shrewsbury' | 'Both'), profileName, screenLocked, onNoAccess,
//   onBack(source, eventId) — go to the event's page, showToast, clearToast, onModalOpenChange(open)
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconCash, IconCreditCard, IconDots, IconDownload, IconMapPin, IconPrinter, IconReceipt, IconSum } from '@tabler/icons-react';
import BackLink from '../../components/BackLink.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import IconButton from '../../components/IconButton.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import { LOCATION_CODE, LOCATION_NAME } from '../../lib/device.js';
import { downloadCsvFile, eventReportCsv, eventReportFileName } from '../../lib/finance/eventReportCsv.js';
import { dayRange, netOf, normalizeEventReport } from '../../lib/finance/eventReportModel.js';
import { financeEventExport, financeEventReport } from '../../lib/finance/financeApi.js';
import { useLiveLoad } from '../../lib/useLiveLoad.js';
import { PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import EventReportDays from './EventReportDays.jsx';
import EventReportPrint from './EventReportPrint.jsx';
import PaymentDetailDialog from './PaymentDetailDialog.jsx';
import { money } from './format.js';
import * as T from './text.js';
import '../../styles/finance.css';
import '../../styles/finance-event-report.css';

export default function EventReport({ source, eventId, location, profileName, screenLocked, onNoAccess, onBack, showToast, clearToast, onModalOpenChange }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const wide = useMediaQuery(WIDE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const isBoth = location === 'Both';
  const code = isBoth ? null : LOCATION_CODE[location];
  const schoolText = isBoth ? T.EVENT_SCHOOL_BOTH : location;

  // ----- Loading -----
  const [blocked, setBlocked] = useState(false); // the database said 'not_allowed' (a staff login got here)
  const live = useLiveLoad({
    key: `${source}|${eventId}|${code ?? 'both'}`,
    enabled: !screenLocked,
    load: async () => {
      const answer = await financeEventReport({ source, eventId, locationCode: code });
      if (answer.status === 'not_allowed') setBlocked(true);
      return answer;
    },
  });
  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);
  // The answer with every day and school entry in one shape (eventReportModel.js).
  const data = useMemo(() => normalizeEventReport(live.data), [live.data]);
  const eventName = data?.event?.name ?? '';

  // ----- Parts of the page that open and close -----
  const [detail, setDetail] = useState(null); // the payment whose detail is open
  const [menu, setMenu] = useState(null); // the phone ⋯ sheet: { anchor }
  const [printing, setPrinting] = useState(null); // { printedAt } while the page prints
  const [busy, setBusy] = useState(false); // a CSV download is on its way
  const [banner, setBanner] = useState(null); // { text, retry? } — amber, until dismissed or fixed
  const openerRef = useRef(null);
  // Focus lands on the page title when the report opens (a screen reader reads where it is; Tab then starts at the back link's neighbours).
  const titleRef = useRef(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);
  function focusOpener() {
    const opener = openerRef.current;
    // The page behind a dialog is "inert" until the App has seen the dialog close, so try again a few times.
    let tries = 0;
    const attempt = () => {
      tries += 1;
      if (!opener || !opener.isConnected) return;
      if (!opener.closest('[inert]')) opener.focus();
      if (document.activeElement !== opener && tries < 20) window.setTimeout(attempt, 16);
    };
    window.setTimeout(attempt, 0);
  }
  useEffect(() => {
    onModalOpenChange(Boolean(detail));
  }, [detail, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);
  useEffect(() => {
    if (screenLocked) {
      setMenu(null);
      setDetail(null);
    }
  }, [screenLocked]);
  useEffect(() => setBanner(null), [code]); // a banner belongs to the school it was about

  // ----- Print: draw the page, print, remove it again (as the Daily report) -----
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

  // ----- Download CSV: asks the database for the rows (it logs the download), builds the file here -----
  async function download() {
    if (busy || !data) return;
    setBusy(true);
    setBanner(null);
    clearToast();
    const answer = await financeEventExport({ source, eventId, locationCode: code });
    setBusy(false);
    if (answer.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (answer.status === 'not_allowed') {
      setBanner({ text: T.EVENT_REPORT_NOT_ALLOWED });
      return;
    }
    if (answer.status !== 'ok') {
      setBanner({ text: T.EXPORT_FAILED, retry: download });
      return;
    }
    downloadCsvFile(eventReportCsv(answer.rows ?? []), eventReportFileName(answer.event_name ?? eventName, location));
    showToast(T.EXPORT_DONE, { icon: false }); // no ✓ (v1.046)
  }

  const hasRows = (data?.days ?? []).length > 0;
  // Print and Download CSV only mean something when the event has payments.
  const canAct = Boolean(data) && live.status === 'ready' && hasRows;
  const range = dayRange(data?.days);

  // ----- The top: back link, title, what it is, the buttons -----
  const menuItems = [];
  if (canAct) {
    menuItems.push({ key: 'csv', label: T.DOWNLOAD_CSV, Icon: IconDownload, disabled: busy, onSelect: download });
    menuItems.push({ key: 'print', label: T.PRINT, Icon: IconPrinter, onSelect: () => setPrinting({ printedAt: new Date() }) });
  }
  const top = (
    <>
      <BackLink label={eventName || T.BACK_TO_EVENT} ariaLabel={eventName ? undefined : T.BACK_TO_EVENT} onClick={() => onBack(source, eventId)} />
      <div className="fin-dayrow fin-er-head">
        <div className="fin-er-titles">
          <h1 className="ptitle fin-title" ref={titleRef} tabIndex={-1}>{T.MONEY_REPORT}</h1>
          {data && <p className="fin-hint fin-er-sub">{T.eventReportSub(eventName, range.first, range.last, schoolText)}</p>}
        </div>
        <span className="fin-grow" />
        {!isPhone && canAct && (
          <span className="fin-dayrow-actions">
            <button type="button" className="btn" aria-disabled={busy ? 'true' : undefined} onClick={download}>
              <IconDownload size={16} aria-hidden="true" />
              {T.DOWNLOAD_CSV}
            </button>
            <button type="button" className="btn" onClick={() => setPrinting({ printedAt: new Date() })}>
              <IconPrinter size={16} aria-hidden="true" />
              {T.PRINT}
            </button>
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
    </>
  );

  // ----- The body -----
  let body;
  if (blocked) {
    body = <ErrorBanner text={T.EVENT_REPORT_NOT_ALLOWED} />;
  } else if (live.status === 'loading' || live.status === 'idle') {
    body = (
      <div className="fin-skeleton" aria-busy="true">
        <span className="visually-hidden">{T.MONEY_REPORT_LOADING}</span>
        <div className="fin-skeleton-cards" aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} />
          ))}
        </div>
      </div>
    );
  } else if (live.status === 'notFound') {
    body = (
      <div className="fin-box fin-empty">
        <p className="fin-empty-line">{T.EVENT_REPORT_NOT_FOUND}</p>
      </div>
    );
  } else if (!data) {
    body = <ErrorBanner text={T.EVENT_REPORT_LOAD_FAILED} onRetry={() => live.reload()} />;
  } else {
    const t = data.totals;
    const net = T.netLine(data.refunds, data.returned, netOf(data));
    const cards = [
      { key: 'total', label: T.CARD_TAKEN, Icon: IconSum, cents: t.in_cents, count: t.count },
      { key: 'cash', label: T.CARD_CASH, Icon: IconCash, cents: t.cash.cents, count: t.cash.count },
      { key: 'check', label: T.CARD_CHECK, Icon: IconReceipt, cents: t.check.cents, count: t.check.count },
      { key: 'card', label: T.CARD_CARD, Icon: IconCreditCard, cents: t.card.cents, count: t.card.count },
    ];
    body = (
      <>
        <div className="fin-cards">
          {cards.map(({ key, label, Icon, cents, count }) => (
            <div key={key} className="fin-card">
              <span className="fin-card-label">
                <Icon size={16} aria-hidden="true" />
                {label}
              </span>
              <span className="fin-card-value">{money(cents)}</span>
              <span className="fin-card-sub">{T.paymentsCount(count)}</span>
            </div>
          ))}
        </div>
        {net && (
          <p className="fin-er-net">
            {net.slice(0, net.lastIndexOf(T.NET + ' ') )}
            <strong>{net.slice(net.lastIndexOf(T.NET + ' '))}</strong>
          </p>
        )}
        {!hasRows ? (
          <div className="fin-box fin-empty">
            <p className="fin-empty-line">{isBoth ? T.EVENT_REPORT_EMPTY : T.eventReportEmptySchool(location)}</p>
          </div>
        ) : (
          <>
            {isBoth && data.by_school.length > 0 && (
              <>
                <h2 className="fin-er-label">{T.BY_SCHOOL}</h2>
                <div className="fin-both fin-er-schools">
                  {data.by_school.map((school) => {
                    const name = LOCATION_NAME[school.school] ?? school.school;
                    const st = school.totals;
                    const after = T.bothAfter(-school.refunds.cents, -school.returned.cents, school.returned.count);
                    return (
                      <section key={school.school} className="fin-box fin-both-box" aria-label={name}>
                        <h3 className="fin-box-title">
                          <IconMapPin size={16} aria-hidden="true" className="fin-box-icon" />
                          {name}
                        </h3>
                        <p className="fin-both-total">{money(netOf(school))}</p>
                        <p className="fin-both-line fin-er-schoolline">
                          {T.paymentsCount(st.count)} · {T.bothBreakdown(st.cash.cents, st.check.cents, st.card.cents)}
                          {after ? ` · ${after}` : ''}
                        </p>
                      </section>
                    );
                  })}
                </div>
              </>
            )}
            <h2 className="fin-er-label">{T.BY_DAY}</h2>
            <EventReportDays
              data={data}
              wide={wide}
              isPhone={isPhone}
              isBoth={isBoth}
              onOpenPayment={(item, element) => {
                openerRef.current = element;
                setDetail(item);
              }}
            />
            <p className="fin-hint fin-table-hint">{isTouch ? T.EVENT_REPORT_HINT_TOUCH : T.EVENT_REPORT_HINT}</p>
          </>
        )}
      </>
    );
  }

  return (
    <div className="finance fin-er">
      {top}
      {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ?? undefined} retrying={busy} onDismiss={() => setBanner(null)} />}
      {body}

      {menu && !screenLocked && (
        <RowMenu
          anchor={menu.anchor}
          isSheet
          title={T.MONEY_REPORT}
          label={T.MORE_ACTIONS}
          items={menuItems}
          onClose={(reason) => {
            setMenu(null);
            // Esc / Cancel / a tap outside / an item (Download CSV, Print) all end back on ⋯, so focus is never lost.
            focusOpener();
          }}
        />
      )}
      {detail && (
        <PaymentDetailDialog
          item={detail}
          school={LOCATION_NAME[detail.school] ?? location}
          isPhone={isPhone}
          onClose={() => {
            setDetail(null);
            focusOpener();
          }}
          onNoAccess={onNoAccess}
          // "Open in …" goes to the event's own page, where payments are changed.
          onOpenInTesting={() => {
            setDetail(null);
            onBack(source, eventId);
          }}
        />
      )}
      {printing && data && <EventReportPrint data={data} schoolText={schoolText} isBoth={isBoth} printedAt={printing.printedAt} printedBy={profileName} />}
    </div>
  );
}
