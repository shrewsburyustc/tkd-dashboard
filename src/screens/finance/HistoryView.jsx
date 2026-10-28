// HistoryView.jsx — History: one month's days, newest first (mockup D5, v0.197, v0.207). Admins only.
// Why it exists: an overview so a day nobody closed is found at once, instead of one day at a
// time. Each row: the day, its total, who closed it and when, and ONE tag (warnings first:
// Changed after closing · Cash short / over · Not closed; then Closed; then No payments; today
// shows "Today · open" until it is closed). An amber line at the top counts this month's days
// that weren't closed. Clicking a row opens that day's report. ‹ › change the month.
// On Both, both schools' days are listed with a School column (v0.207).
// Address: #finance/history (App.jsx). The database refuses staff (contract §1.4).
//
// Layouts: PC table (Day · Total · Closed by · Status) · tablet (Closed by under the day) ·
// phone stacked rows with a back arrow.
//
// Props: location, today, month ('YYYY-MM-01'), onMonth(month), onBack(), onOpenDay(day, schoolName),
//        screenLocked, onNoAccess, wide, isPhone, isTouch
import { useEffect } from 'react';
import { IconAlertTriangle, IconArrowLeft, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import IconButton from '../../components/IconButton.jsx';
import { LOCATION_CODE, LOCATION_NAME } from '../../lib/device.js';
import { financeHistory } from '../../lib/finance/financeApi.js';
import { useRowArrowNav } from '../../lib/useRowArrowNav.js';
import { useLiveLoad } from '../testing/events/useLiveLoad.js';
import { addMonths, dayShort, money, monthShortYear, monthStart, monthYear } from './format.js';
import * as T from './text.js';

// The tag of a day row: { text, kind: 'warn' | 'ok' | 'neutral' }.
function dayTag(row) {
  const diff = row.diff_cents ?? 0;
  // Only the number of checks was off (no cents): "Checks short".
  if (diff === 0 && (row.part ?? row.diff_part) === 'checks' && (row.tag === 'short' || row.tag === 'over')) {
    return { text: row.tag === 'short' ? T.checksShortPlain : T.checksOverPlain, kind: 'warn' };
  }
  // The answer may say which part was off (cash / checks / card); otherwise a plain "Short $X".
  const part = row.part ?? row.diff_part ?? null;
  switch (row.tag) {
    case 'today_open':
      return { text: T.TAG_TODAY_OPEN, kind: 'neutral' };
    case 'changed_after_closing':
      return { text: T.CHANGED_AFTER_CLOSING, kind: 'warn' };
    case 'short':
      return { text: part === 'cash' ? T.cashShortTag(diff) : part === 'checks' ? T.checksShortTag(diff) : part === 'card' ? T.cardShortTag(diff) : T.shortTag(diff), kind: 'warn' };
    case 'over':
      return { text: part === 'cash' ? T.cashOverTag(diff) : part === 'checks' ? T.checksOverTag(diff) : part === 'card' ? T.cardOverTag(diff) : T.overTag(diff), kind: 'warn' };
    case 'not_closed':
      return { text: T.TAG_NOT_CLOSED, kind: 'warn' };
    case 'closed':
      return { text: T.CLOSED_TAG, kind: 'ok' };
    // A day with only Black Belt returned checks (mockup B7, v0.815): nothing to close, so not
    // "Not closed". The database sends it as a day with no closable payments ('no_payments')
    // whose total isn't zero — or as 'nothing_to_close', if it names it.
    case 'nothing_to_close':
      return { text: T.TAG_NOTHING_TO_CLOSE, kind: 'neutral' };
    default:
      if ((row.total_cents ?? 0) !== 0) return { text: T.TAG_NOTHING_TO_CLOSE, kind: 'neutral' };
      return { text: T.TAG_NO_PAYMENTS, kind: 'neutral' };
  }
}

function Tag({ tag }) {
  if (tag.kind === 'warn') {
    return (
      <span className="ttag ttag--warn">
        <IconAlertTriangle size={14} aria-hidden="true" />
        {tag.text}
      </span>
    );
  }
  return <span className={`ttag${tag.kind === 'ok' ? ' fin-tag-ok' : ''}`}>{tag.text}</span>;
}

const schoolName = (code) => LOCATION_NAME[code] ?? code ?? '';

export default function HistoryView({ location, today, month, onMonth, onBack, onOpenDay, screenLocked, onNoAccess, wide, isPhone, isTouch }) {
  const isBoth = location === 'Both';
  const code = isBoth ? null : LOCATION_CODE[location];
  const live = useLiveLoad({
    key: `${code ?? 'both'}|${month}`,
    enabled: !screenLocked,
    load: () => financeHistory({ locationCode: code, month }),
  });
  // The database says this sign-in is locked: lock the screen too.
  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  const rows = live.data?.days ?? [];
  const keyOf = (row) => `${row.day}|${row.school ?? code}`;
  const nav = useRowArrowNav({
    rowKeys: rows.map(keyOf),
    onOpen: (key) => {
      const row = rows.find((r) => keyOf(r) === key);
      if (row) onOpenDay(row.day, isBoth ? schoolName(row.school) : null);
    },
  });
  const atThisMonth = month >= monthStart(today);
  const unclosed = rows.filter((r) => r.tag === 'not_closed');
  const unclosedCount = live.data?.unclosed_count ?? unclosed.length;

  const top = (
    <div className="fin-dayrow">
      {isPhone ? (
        <button type="button" className="icon-button fin-back" aria-label={T.BACK_TO_DAY} onClick={onBack}>
          <IconArrowLeft size={20} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className="btn" onClick={onBack}>
          <IconArrowLeft size={16} aria-hidden="true" />
          {T.BACK_TO_DAY}
        </button>
      )}
      <h2 className="fin-day">{T.HISTORY}</h2>
      <span className="fin-grow" />
      <IconButton label={T.PREVIOUS_MONTH} Icon={IconChevronLeft} className="fin-ibtn" onClick={() => onMonth(addMonths(month, -1))} />
      {/* Phones: "Oct 2026", so the row fits on one line at 320px */}
      <strong className="fin-month">{isPhone ? monthShortYear(month) : monthYear(month)}</strong>
      <IconButton
        label={T.NEXT_MONTH}
        Icon={IconChevronRight}
        className={`fin-ibtn${atThisMonth ? ' is-unavailable' : ''}`}
        aria-disabled={atThisMonth ? 'true' : undefined}
        onClick={() => {
          if (!atThisMonth) onMonth(addMonths(month, 1));
        }}
      />
    </div>
  );

  let body;
  if (live.status === 'loading') {
    body = (
      <div className="fin-skeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING}</span>
      </div>
    );
  } else if (live.status === 'error' && !live.data) {
    body = <ErrorBanner text={T.LOAD_HISTORY_FAILED} onRetry={() => live.reload()} />;
  } else if (rows.length === 0) {
    body = <p className="tempty">{T.NO_DAYS_YET}</p>;
  } else if (isPhone) {
    body = (
      <div className="fin-hlist" {...nav.containerProps}>
        {rows.map((row) => {
          const key = keyOf(row);
          return (
            <div key={key} className="fin-hrow" role="button" {...nav.rowProps(key)} onClick={() => onOpenDay(row.day, isBoth ? schoolName(row.school) : null)}>
              <div>
                {dayShort(row.day)}
                {isBoth && <span className="fin-sub"> · {schoolName(row.school)}</span>}
                {row.closed_by_name && <span className="fin-sub fin-line2">{T.closedByLine(row.closed_by_name, row.closed_at)}</span>}
              </div>
              <div className="fin-r">
                {money(row.total_cents ?? 0)}
                <div>
                  <Tag tag={dayTag(row)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  } else {
    body = (
      <>
        <table className="fin-table fin-htable" {...nav.containerProps}>
          <thead>
            <tr>
              <th>{T.COL_DAY}</th>
              {isBoth && <th>{T.COL_SCHOOL}</th>}
              <th className="fin-r">{T.COL_TOTAL}</th>
              {wide && <th>{T.COL_CLOSED_BY}</th>}
              <th>{T.COL_STATUS}</th>
              <th className="fin-col-chev" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = keyOf(row);
              return (
                <tr key={key} className="fin-row" {...nav.rowProps(key)} onClick={() => onOpenDay(row.day, isBoth ? schoolName(row.school) : null)}>
                  <td>
                    {dayShort(row.day)}
                    {!wide && row.closed_by_name && <span className="fin-sub fin-line2">{T.closedByLine(row.closed_by_name, row.closed_at)}</span>}
                  </td>
                  {isBoth && <td>{schoolName(row.school)}</td>}
                  <td className="fin-r">{money(row.total_cents ?? 0)}</td>
                  {wide && <td className="fin-sub">{row.closed_by_name ? T.closedByShort(row.closed_by_name, row.closed_at) : '—'}</td>}
                  <td>
                    <Tag tag={dayTag(row)} />
                  </td>
                  <td className="fin-r fin-sub fin-col-chev">
                    <IconChevronRight size={16} aria-hidden="true" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="fin-hint fin-table-hint">{isTouch ? T.HISTORY_HINT_TOUCH : T.HISTORY_HINT}</p>
      </>
    );
  }

  return (
    <>
      {top}
      {unclosedCount > 0 && (
        <div className="fin-banner" role="status">
          <IconAlertTriangle size={16} aria-hidden="true" />
          <span>
            {T.unclosedLine(
              unclosedCount,
              unclosed.map((r) => (isBoth ? `${dayShort(r.day)} (${schoolName(r.school)})` : dayShort(r.day))),
            )}
          </span>
        </div>
      )}
      {body}
    </>
  );
}
