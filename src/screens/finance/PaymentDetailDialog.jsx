// PaymentDetailDialog.jsx — one payment's details, view only (mockup D12, v0.207).
// Why it exists: rule 8 says clicking a row opens its detail view. The Daily report is
// read-only, so this shows the payment's facts and its history of changes, and "Open in
// Testing" goes to Testing, where payments are recorded and changed. No date of birth or other
// private details — only payment facts (rule 5; the database never sends them, contract §1.1).
// PC / tablet: a centered dialog with Close. Phone: a full page with a back arrow (rule 6).
//
// Props:
//   item       the row that was clicked (finance_day item): shown at once while the rest loads
//   school     the school's name (Worcester / Shrewsbury)
//   isPhone
//   onClose    () => void
//   onOpenInTesting  (eventId, source, options) => void — the answer's event_id (null until it has loaded);
//                    for a camp payment (source 'camp', Camps v0.707) it opens the camp's page;
//                    a Color Belt private testing payment has no event: options.privateTab = true
//                    opens the Private testing tab (v0.813)
//   onNoAccess       the database says this sign-in is locked
import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconChevronRight } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import { financePaymentDetail } from '../../lib/finance/financeApi.js';
import { dayAndTime, dayShort, dayShortYear, money, timeOfDay } from './format.js';
import { whatText } from './PaymentsList.jsx';
import { LOCATION_NAME } from '../../lib/device.js';
import * as T from './text.js';

export default function PaymentDetailDialog({ item, school, isPhone, onClose, onOpenInTesting, onNoAccess }) {
  const [state, setState] = useState({ status: 'loading', data: null });
  const [attempt, setAttempt] = useState(0); // bumped by Retry

  useEffect(() => {
    let stale = false;
    financePaymentDetail({ source: item.source, paymentId: item.payment_id }).then((answer) => {
      if (stale) return;
      if (answer.status === 'ok') setState({ status: 'ok', data: answer });
      else if (answer.status === 'no_access') onNoAccess();
      else setState({ status: 'error', data: null });
    });
    return () => {
      stale = true;
    };
    // onNoAccess is stable (App.jsx); only a new item or Retry loads again
  }, [item.source, item.payment_id, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // The answer's item is the whole chain's truth; until it arrives, show the clicked row.
  const shown = state.data?.item ?? item;
  const name = `${shown.first_name ?? ''} ${shown.last_name ?? ''}`.trim();
  const isRefund = shown.kind === 'refund';
  const isCamp = (shown.source ?? item.source) === 'camp' || shown.what === 'camp';
  // A camp payment: "Camp · April Vacation Camp", and the camp's days on their own line (v0.707).
  const campName = state.data?.event_name ?? shown.event_name ?? item.event_name ?? '';
  const campDays = state.data?.camp_days ?? state.data?.days ?? [];
  // A Color Belt private testing payment (migration 0018, v0.813): no event; changed on the Private testing tab.
  const isPrivateColorBelt = !isCamp && shown.what === 'color_belt' && shown.is_private === true;
  const what = isCamp ? `${T.WHAT_CAMP} · ${campName}` : state.data?.event_name || whatText(shown);
  const edited = shown.state === 'edited' || shown.state === 'moved_in';
  // Oldest first (whatever order the answer used), so each edit can be compared with the line before it.
  const history = [...(state.data?.history ?? [])].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const recorded = history.find((h) => h.what === 'recorded' || h.what === 'refunded') ?? null;
  const tag = shown.state === 'undone' ? T.TAG_UNDONE : edited ? T.TAG_EDITED : shown.state === 'moved_out' ? T.TAG_MOVED : null;

  const row = (label, value) => (
    <div className="fin-drow">
      <span className="fin-drow-k">{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <Dialog title={T.detailTitle(name, isRefund)} size="medium" fullScreen={isPhone} onRequestClose={onClose}>
      <div className="fin-detail">
        <div className="fin-drows">
          {/* A camp payment: "Camp · April Vacation Camp", and "Paid at" on its own line — the school
              whose drawer has it, which can differ from the camp's (v0.707). */}
          {isCamp ? row(T.D_FOR, what) : row(T.D_FOR, T.detailFor(what, dayShort(shown.event_date), school))}
          {isCamp && row(T.D_PAID_AT, LOCATION_NAME[shown.school ?? item.school] ?? school ?? '')}
          {isCamp && campDays.length > 0 && row(T.D_CAMP_DAYS, campDays.map((d) => dayShort(typeof d === 'string' ? d : d.day)).join(' · '))}
          {row(isRefund ? T.D_REFUNDED_BY : T.D_PAID_BY, T.METHOD[shown.method] ?? shown.method)}
          {row(
            T.D_AMOUNT,
            <>
              <span className={shown.state === 'undone' || shown.state === 'moved_out' ? 'fin-strike' : undefined}>{money(shown.amount_cents)}</span>
              {tag && <span className="ttag fin-drow-tag">{tag}</span>}
            </>,
          )}
          {row(T.D_DATE_PAID, dayShortYear(shown.day))}
          {row(
            T.D_RECORDED,
            recorded
              ? T.recordedAt(dayAndTime(recorded.at), recorded.by_name ?? '')
              : T.recordedAt(`${dayShort(item.day)}, ${timeOfDay(item.time)}`, item.recorded_by_name ?? ''),
          )}
        </div>

        <p className="fin-lbl">{T.D_HISTORY}</p>
        {state.status === 'loading' && <p className="fin-hint">{T.DETAIL_LOADING}</p>}
        {state.status === 'error' && (
          <div className="fin-detail-error" role="alert">
            <IconAlertTriangle size={16} aria-hidden="true" />
            <span>{T.DETAIL_LOAD_FAILED}</span>
            <button type="button" className="btn btn-sm" onClick={() => setAttempt((n) => n + 1)}>
              {T.RETRY}
            </button>
          </div>
        )}
        {state.status === 'ok' && (
          <ul className="fin-history">
            {/* Newest first, as drawn in D12. */}
            {[...history]
              .map((entry, index) => ({ entry, previous: history[index - 1] ?? null }))
              .reverse()
              .map(({ entry, previous }, index) => (
                <li key={`${entry.at}-${index}`}>
                  {dayAndTime(entry.at)} · {T.historyLine(entry, previous)}
                </li>
              ))}
          </ul>
        )}
        <p className="fin-hint fin-detail-hint">{isCamp ? T.DETAIL_HINT_CAMP : isPrivateColorBelt ? T.DETAIL_HINT_PRIVATE : T.DETAIL_HINT}</p>
      </div>
      <div className="dialog-actions fin-detail-actions">
        <button type="button" className={`btn${isPhone ? ' btn-block' : ''}`} onClick={() => onOpenInTesting(state.data?.event_id ?? null, shown.source ?? item.source, { privateTab: isPrivateColorBelt })}>
          {isCamp ? T.OPEN_IN_CAMPS : T.OPEN_IN_TESTING}
          <IconChevronRight size={16} aria-hidden="true" />
        </button>
        {!isPhone && (
          <button type="button" className="btn" data-autofocus onClick={onClose}>
            {T.CLOSE}
          </button>
        )}
      </div>
    </Dialog>
  );
}
