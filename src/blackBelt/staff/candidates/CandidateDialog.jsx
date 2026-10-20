// CandidateDialog.jsx — one Black Belt candidate: the read-only summary and Edit details.
// Why it exists: approved mockups Candidates 3 (detail) and 5 (the payment ⋯ for admins), contract
// CONTRACT-0016-B2 §3.3. Clicking a roster row opens it (PC / tablet: a centered dialog; phone: a
// full screen with ← and ⋯ in the header). It reads, top to bottom:
//   - the name, the one tag (as on the roster) and "Spring 2027 · 1st Dan · Shrewsbury"
//   - (only when needed) the amber "needs a parent's signature" box with "Waiver signed on paper"
//   - Candidate: Name · Date of birth "Mar 4, 2012 (15 on Apr 3, 2027)" · Email for results ·
//     School · Testing for
//   - Registration: Registered · Reference · Waiver (+ View signature for admins) · Removed
//   - Payments: Plan · Kukkiwon certificate · every payment (Date · For · How · Amount · Note ·
//     Recorded by; phones: two lines each) with a ⋯ per line for admins · the totals
//   - Close · Print receipt · Record payment (primary), and ⋯: Edit details · Change plan or
//     Kukkiwon · Remove candidate / Restore / Delete permanently (admins)
// Edit details (Star v0.112) turns the same dialog into fields with Cancel and Save.
// Privacy (§5): the date of birth and email appear only here, and with the device's Hide payments
// switch on they read "Hidden on this device" (OP-B7); so do the payments, Edit details is grayed
// ("Edit details at the desk.") and View signature isn't offered. The data lives in
// useCandidateActions only while this dialog is open.
// Focus: Edit details puts the cursor in First name; back from it, or from a dialog opened here,
// focus returns to the button that opened it (its data-focus-key).
import { useEffect, useId, useRef } from 'react';
import Dialog from '../../../components/Dialog.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import IconButton from '../../../components/IconButton.jsx';
import Notice from '../../../components/Notice.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { formatCents } from '../../../lib/blackBelt/money.js';
import { dueNowItems, hasLivePayment } from '../../../lib/blackBelt/rules.js';
import Choice from '../parts/Choice.jsx';
import DateField from '../parts/DateField.jsx';
import { detailsProblems } from './checks.js';
import { ICONS } from './icons.js';
import { MoneyTag } from './RosterRows.jsx';
import * as T from '../text.js';

const DANS = [1, 2, 3, 4];

function TwoLines({ label, reason }) {
  return (
    <span className="ev-menu-two">
      <span>{label}</span>
      <span className="ev-menu-reason">{reason}</span>
    </span>
  );
}

// One "label | value" line of the summary.
function Row({ label, children }) {
  return (
    <div className="ev-sum-row bb-sum-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// The words of one payment line: what it was for, how, the note.
export function lineWords(line, payments, plan) {
  const ctx = { paymentsCount: plan?.paymentsCount ?? null, planName: plan?.name ?? '' };
  if (line.kind === 'refund') return { what: T.FOR_REFUND, how: T.methodName(line.method) };
  if (line.kind === 'returned') {
    const original = payments.find((p) => p.id === line.reversesPaymentId);
    return { what: original ? T.forText(original.forItems, ctx) : T.RETURNED_CHECK, how: T.RETURNED_CHECK };
  }
  return { what: T.forText(line.forItems, ctx), how: T.methodName(line.method) };
}
function noteWords(line) {
  if (line.returned) return line.note ? `${line.note} · ${T.RETURNED_NOTE}` : T.RETURNED_NOTE;
  return line.note || T.NO_NOTE;
}

// ----- The payments part -----
function Payments({ data, cycle, isAdmin, isPhone, today, onLineMore, menuLineId }) {
  const { candidate: c, payments, money } = data;
  const plan = cycle.plans?.find((p) => p.id === c.cyclePlanId) ?? null;
  const amounts = plan?.amounts?.[c.dan] ?? [];
  // The plan's payment dates for THIS candidate (a late family's passed dates count from the day
  // they registered — S4), in payment order.
  const payItems = (money.items ?? []).filter((x) => x.item !== 'kukkiwon').sort((a, b) => Number(a.item.slice(1)) - Number(b.item.slice(1)));
  const kukItem = (money.items ?? []).find((x) => x.item === 'kukkiwon') ?? null;
  const p1 = payItems.find((x) => x.item === 'p1') ?? null;
  const planName = c.plan?.name ?? plan?.name ?? '';
  const words = (line) => lineWords(line, payments, c.plan);
  const more = (line) => {
    if (!isAdmin) return null;
    const w = words(line);
    return (
      <IconButton
        label={T.paymentMoreLabel(w.what, line.paidOn)}
        Icon={ICONS.more}
        aria-haspopup="menu"
        aria-expanded={menuLineId === line.id ? 'true' : 'false'}
        data-focus-key={`line-${line.id}`}
        onClick={(event) => onLineMore(line, w.what, event.currentTarget)}
      />
    );
  };

  return (
    <>
      <dl className="ev-sum bb-sum">
        <Row label={T.ROW_PLAN}>{T.planLine(planName, amounts, payItems, today)}</Row>
        <Row label={T.ROW_KUKKIWON}>{T.kukkiwonLine(c.kukkiwon ? kukItem : null, p1)}</Row>
      </dl>
      {payments.length === 0 ? (
        <p className="field-hint bb-no-payments">{T.NO_PAYMENTS_YET}</p>
      ) : isPhone ? (
        <ul className="bb-pay-blocks">
          {payments.map((line) => {
            const w = words(line);
            // Phones leave the note out when there is none (no lone "—" between the dots)
            const note = line.note || line.returned ? noteWords(line) : null;
            const second = [T.monthDay(line.paidOn), w.how, note, T.byName(line.recordedByName)].filter(Boolean);
            return (
              <li key={line.id} className={`bb-pay-block${line.returned ? ' is-returned' : ''}`}>
                <span className="bb-pay-block-text">
                  <span className="bb-pay-block-top">
                    <span className="bb-pay-what">{w.what}</span>
                    <span className="bb-num">{formatCents(line.amountCents)}</span>
                  </span>
                  <span className="bb-pay-block-sub">{second.join(' · ')}</span>
                </span>
                {more(line)}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="bb-scroll-x">
          <table className="bb-pay-table">
            <thead>
              <tr>
                <th scope="col">{T.COL_DATE}</th>
                <th scope="col">{T.COL_FOR}</th>
                <th scope="col">{T.COL_HOW}</th>
                <th scope="col" className="bb-num">
                  {T.COL_AMOUNT}
                </th>
                <th scope="col">{T.COL_NOTE}</th>
                <th scope="col">{T.COL_RECORDED_BY}</th>
                {isAdmin && (
                  <th scope="col">
                    <span className="visually-hidden">{T.ACTIONS_COL}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {payments.map((line) => {
                const w = words(line);
                return (
                  <tr key={line.id} className={line.returned ? 'is-returned' : undefined}>
                    <td className="nowrap">{T.monthDay(line.paidOn)}</td>
                    <td>{w.what}</td>
                    <td>{w.how}</td>
                    <td className="bb-num nowrap">{formatCents(line.amountCents)}</td>
                    <td className="bb-pay-note">{noteWords(line)}</td>
                    <td>{line.recordedByName}</td>
                    {isAdmin && <td className="bb-pay-acts">{more(line)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <dl className="bb-totals">
        <div>
          <dt>{T.TOTAL_DUE}</dt>
          <dd>{formatCents(money.totalDueCents)}</dd>
        </div>
        <div>
          <dt>{T.PAID}</dt>
          <dd>{formatCents(money.paidCents)}</dd>
        </div>
        <div>
          <dt>{T.BALANCE}</dt>
          <dd className={money.overpaidCents > 0 ? 'bb-balance is-over' : undefined}>{formatCents(money.balanceCents)}</dd>
        </div>
        <div>
          <dt>{T.NEXT_DUE}</dt>
          <dd>{T.nextDueText(money, dueNowItems(money, today))}</dd>
        </div>
      </dl>
    </>
  );
}

// ----- Edit details -----
function EditFields({ edit, data, isAdmin, today, onChange }) {
  const id = useId();
  const v = edit.values;
  const c = data.candidate;
  const purged = c.dateOfBirth === null;
  const problems = detailsProblems(v, { today, purged });
  const show = (field) => (edit.triedSave ? problems[field] : null);
  const paidLive = hasLivePayment(data.payments);
  const danLocked = paidLive && !isAdmin;
  const danChangedAfterPay = paidLive && isAdmin && Number(v.dan) !== Number(edit.initial.dan);
  const ro = edit.saving;
  const err = (field) => `${id}-${field}-err`;
  const firstMsg = T.nameError(show('first'), T.ERR_FIRST);
  const lastMsg = T.nameError(show('last'), T.ERR_LAST);
  const dobMsg = show('dob') ? T.ERR_DOB : null;
  const emailMsg = show('email') ? T.ERR_EMAIL : null;

  return (
    <div className="bb-edit">
      <div className="field">
        <label htmlFor={`${id}-first`}>{T.FIRST_NAME}</label>
        <input id={`${id}-first`} className="input" type="text" autoComplete="off" data-autofocus data-edit-first readOnly={ro} value={v.first} aria-invalid={firstMsg ? 'true' : undefined} aria-describedby={firstMsg ? err('first') : undefined} onChange={(e) => onChange({ first: e.target.value })} />
        {firstMsg && <Notice id={err('first')}>{firstMsg}</Notice>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-last`}>{T.LAST_NAME}</label>
        <input id={`${id}-last`} className="input" type="text" autoComplete="off" readOnly={ro} value={v.last} aria-invalid={lastMsg ? 'true' : undefined} aria-describedby={lastMsg ? err('last') : `${id}-last-hint`} onChange={(e) => onChange({ last: e.target.value })} />
        {lastMsg ? <Notice id={err('last')}>{lastMsg}</Notice> : <p id={`${id}-last-hint`} className="field-hint">{T.LAST_NAME_HINT}</p>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-dob`}>{T.DOB}</label>
        {purged ? (
          <p id={`${id}-dob`} className="bb-readonly">{T.DELETED_AFTER_KEEPING}</p>
        ) : (
          <DateField id={`${id}-dob`} value={v.dob} readOnly={ro} invalid={Boolean(dobMsg)} describedBy={dobMsg ? err('dob') : undefined} onChange={(dob) => onChange({ dob })} />
        )}
        {dobMsg && <Notice id={err('dob')}>{dobMsg}</Notice>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-email`}>{T.EMAIL}</label>
        {purged ? (
          <p id={`${id}-email`} className="bb-readonly">{T.DELETED_AFTER_KEEPING}</p>
        ) : (
          <input id={`${id}-email`} className="input" type="email" autoComplete="off" readOnly={ro} value={v.email} aria-invalid={emailMsg ? 'true' : undefined} aria-describedby={emailMsg ? err('email') : undefined} onChange={(e) => onChange({ email: e.target.value })} />
        )}
        {emailMsg && <Notice id={err('email')}>{emailMsg}</Notice>}
      </div>
      <div className="field">
        <span id={`${id}-school`} className="field-label">
          {T.SCHOOL}
        </span>
        <Choice labelId={`${id}-school`} className="bb-segmented--fill" options={[{ key: 'worcester', label: T.schoolName('worcester') }, { key: 'shrewsbury', label: T.schoolName('shrewsbury') }]} value={v.school} readOnly={ro} onChange={(school) => onChange({ school })} />
      </div>
      <div className="field">
        <span id={`${id}-dan`} className="field-label">
          {T.TESTING_FOR}
        </span>
        <Choice labelId={`${id}-dan`} className={`bb-segmented--fill${danLocked ? ' is-locked' : ''}`} options={DANS.map((dan) => ({ key: dan, label: T.DAN_LABELS[dan] }))} value={Number(v.dan)} readOnly={ro || danLocked} onChange={(dan) => onChange({ dan })} />
        {danLocked && <p className="field-hint">{T.DAN_LOCKED_STAFF}</p>}
        {danChangedAfterPay && (
          <p className="bb-amber-line">
            <ICONS.warn size={16} aria-hidden="true" />
            <span>{T.alreadyPaidAdmin(data.money.paidCents)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export default function CandidateDialog({ actions, cycle, isAdmin, isPhone, hidden, today }) {
  const d = actions.dlg.detail;
  const data = d.data;
  const c = data?.candidate ?? null;
  const editing = d.mode === 'edit' && d.edit;
  const moreRef = useRef(null);
  const title = c ? T.candidateName(c) : T.SECTION_CANDIDATE;
  const withdrawn = c?.status === 'withdrawn';
  const moreButtonElement = () => moreRef.current?.querySelector('button') ?? null;

  // Edit details turns this same dialog into fields (React keeps the same dialog box, so its
  // "focus the first field on open" doesn't run again): put the cursor in First name, so typing
  // and Esc work at once. Back from Edit details: focus returns to the ⋯ it was opened from.
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editing && !wasEditing.current) {
      window.requestAnimationFrame(() => document.querySelector('[data-edit-first]')?.focus());
    } else if (!editing && wasEditing.current) {
      window.requestAnimationFrame(() => moreButtonElement()?.focus());
    }
    wasEditing.current = Boolean(editing);
  }, [editing]);

  // Back from a dialog opened here (Record payment, Change plan, a payment line's ⋯ …): the detail
  // is drawn again, so focus goes back to the button that opened it (found by its data-focus-key).
  const focusKey = d.focusKey ?? null;
  const hasData = Boolean(data);
  const { clearFocusKey } = actions;
  useEffect(() => {
    if (!focusKey || !hasData) return;
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const target = document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
        if (target) target.focus();
      }),
    );
    clearFocusKey();
  }, [focusKey, hasData, clearFocusKey]);

  // ----- The detail's ⋯ (Edit details · Change plan · Remove / Restore / Delete) -----
  function detailItems() {
    // Hide payments on (mat-side): Edit details would show the date of birth and email, so it is
    // grayed with its reason, like Add candidate.
    const items = [
      {
        key: 'edit',
        label: hidden ? <TwoLines label={T.EDIT_DETAILS} reason={T.EDIT_AT_DESK} /> : T.EDIT_DETAILS,
        Icon: ICONS.editDetails,
        disabled: hidden,
        onSelect: () => actions.startEdit(),
      },
    ];
    if (!withdrawn) {
      const locked = !isAdmin && hasLivePayment(data.payments);
      const reason = hidden || data.money.paidCents <= 0 ? T.PAYMENT_RECORDED_ASK_ADMIN : T.alreadyPaidAskAdmin(data.money.paidCents);
      items.push({
        key: 'plan',
        label: locked ? <TwoLines label={T.CHANGE_PLAN} reason={reason} /> : T.CHANGE_PLAN,
        Icon: ICONS.changePlan,
        disabled: locked,
        onSelect: () => actions.openChangePlan(c.id, moreButtonElement()),
      });
    }
    const target = { id: c.id, firstName: c.firstName, lastName: c.lastName, version: c.version, hasPaymentRows: data.payments.length > 0 };
    if (isAdmin && !withdrawn) items.push({ key: 'remove', label: T.REMOVE_CANDIDATE, Icon: ICONS.remove, separatorBefore: true, onSelect: () => actions.openRemove(target, moreButtonElement()) });
    if (isAdmin && withdrawn) {
      items.push({ key: 'restore', label: T.RESTORE, Icon: ICONS.restore, separatorBefore: true, disabled: actions.busy, onSelect: () => actions.restore(target) });
      // The database refuses a delete while ANY payment row exists (even an undone one); the
      // detail only sees live lines, so it may offer Delete and get has_payments back.
      const has = data.payments.length > 0;
      items.push({
        key: 'delete',
        label: has ? <TwoLines label={T.DELETE_PERMANENTLY} reason={T.hasPaymentRecordsShort(T.candidateName(c))} /> : T.DELETE_PERMANENTLY,
        Icon: ICONS.deleteForever,
        danger: !has,
        disabled: has,
        onSelect: () => actions.openDelete(target, moreButtonElement()),
      });
    }
    return items;
  }

  // ----- A payment line's ⋯ (admins only; contract §3.3 "Payment line ⋯") -----
  function lineItems(line, what) {
    const items = [];
    const opener = menu?.anchor ?? null; // the line's ⋯ (focus goes back to it)
    const refundActive = data.payments.some((p) => p.kind === 'refund');
    if (line.kind === 'payment') {
      if (!withdrawn) {
        const editReason = line.returned ? T.RETURNED_FIRST : refundActive ? T.REFUND_FIRST : null;
        items.push({ key: 'edit', label: editReason ? <TwoLines label={T.EDIT_PAYMENT} reason={editReason} /> : T.EDIT_PAYMENT, Icon: ICONS.editPayment, disabled: Boolean(editReason), onSelect: () => actions.openEditPayment(line, opener) });
      }
      items.push({
        key: 'undo',
        label: line.returned ? <TwoLines label={T.UNDO_PAYMENT} reason={T.RETURNED_FIRST} /> : T.UNDO_PAYMENT,
        Icon: ICONS.undo,
        disabled: line.returned,
        onSelect: () => actions.openUndoPayment(line, what, opener),
      });
      if (data.money.paidCents > 0) items.push({ key: 'refund', label: T.RECORD_REFUND, Icon: ICONS.refund, onSelect: () => actions.openRefund(c.id, opener) });
      if (line.method === 'check' && !line.returned) items.push({ key: 'returned', label: T.MARK_CHECK_RETURNED, Icon: ICONS.returned, onSelect: () => actions.openReturned(line, what, opener) });
    } else if (line.kind === 'returned') {
      items.push({ key: 'undo', label: T.UNDO_RETURNED, Icon: ICONS.undo, onSelect: () => actions.openUndoPayment(line, what, opener) });
    } else if (line.kind === 'refund') {
      items.push({ key: 'undo', label: T.UNDO_REFUND, Icon: ICONS.undo, onSelect: () => actions.openUndoPayment(line, what, opener) });
    }
    return items;
  }

  const menu = d.menu;
  const menuElement =
    menu && data ? (
      <RowMenu
        anchor={menu.anchor}
        isSheet={isPhone}
        title={menu.kind === 'line' ? menu.what : title}
        subtitle={menu.kind === 'line' ? `${T.monthDay(menu.line.paidOn)} · ${formatCents(menu.line.amountCents)}` : T.detailSub(cycle.name, c.dan, c.locationCode)}
        label={menu.kind === 'line' ? T.paymentMoreLabel(menu.what, menu.line.paidOn) : T.MORE_FOR_DETAIL(title)}
        items={menu.kind === 'line' ? lineItems(menu.line, menu.what) : detailItems()}
        onClose={(reason) => {
          const anchor = menu.anchor;
          actions.setDetailMenu(null);
          if (reason === 'escape' || reason === 'tab') anchor?.focus();
        }}
      />
    ) : null;

  const moreButton = data && !editing && (
    <span ref={moreRef} className={isPhone ? 'bb-detail-more--phone' : 'bb-detail-more'}>
      <IconButton
        label={T.MORE_FOR_DETAIL(title)}
        Icon={ICONS.more}
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'detail' ? 'true' : 'false'}
        data-focus-key="detail-more"
        onClick={(event) => {
          const anchor = event.currentTarget;
          actions.setDetailMenu(menu?.kind === 'detail' ? null : { kind: 'detail', anchor });
        }}
      />
    </span>
  );

  // ----- Loading / failed -----
  if (!data) {
    return (
      <Dialog title={title} size="wide" fullScreen={isPhone} onRequestClose={actions.requestCloseDetail}>
        {d.status === 'error' ? (
          <ErrorBanner text={T.LOAD_FAILED} onRetry={() => actions.refreshDetail()} />
        ) : (
          <div className="tskeleton" aria-busy="true">
            <span className="visually-hidden">{T.LOADING_CANDIDATES}</span>
            {[0, 1, 2].map((index) => (
              <div key={index} className="tskeleton-row" aria-hidden="true">
                <span className="tskeleton-bar" />
              </div>
            ))}
          </div>
        )}
      </Dialog>
    );
  }

  // ----- Edit details -----
  if (editing) {
    const e = d.edit;
    const saveButton = (
      <button type="submit" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${e.saving || e.blocking ? ' is-unavailable' : ''}`} aria-disabled={e.saving || e.blocking ? 'true' : undefined}>
        <ICONS.save size={16} aria-hidden="true" />
        {e.saving ? T.SAVING : T.SAVE}
      </button>
    );
    const note = e.note && (
      <div className="tdialog-note">
        <Notice>
          {e.note}
          {isPhone && (
            <button type="button" className="note-action" onClick={() => actions.cancelEdit()}>
              {T.DISCARD_CHANGES}
            </button>
          )}
        </Notice>
      </div>
    );
    return (
      <Dialog title={T.EDIT_DETAILS} size="medium" fullScreen={isPhone} onRequestClose={actions.requestCloseDetail}>
        <p className="tdialog-sub">{T.editDetailsSub(T.candidateName(c), cycle.name, c.dan, c.locationCode)}</p>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            actions.saveEdit();
          }}
        >
          {e.failed && <ErrorBanner text={T.SAVE_FAILED} onRetry={() => actions.saveEdit()} retrying={e.saving} />}
          <EditFields edit={e} data={data} isAdmin={isAdmin} today={today} onChange={actions.changeEdit} />
          {isPhone ? (
            <>
              {note}
              <div className="dialog-page-submit">{saveButton}</div>
            </>
          ) : (
            <div className="dialog-footer">
              <div className="dialog-actions">
                <button type="button" className="btn" onClick={() => actions.cancelEdit()}>
                  {T.CANCEL}
                </button>
                {saveButton}
              </div>
              {note}
            </div>
          )}
        </form>
      </Dialog>
    );
  }

  // ----- The summary -----
  const w = data.waiver;
  const firstDay = cycle.state?.firstDay ?? cycle.days?.[0]?.date ?? null;
  const dob = hidden ? T.HIDDEN_ON_DEVICE : c.dateOfBirth ? T.dobLine(c.dateOfBirth, c.ageOnFirstDay, firstDay) : T.DELETED_AFTER_KEEPING;
  const email = hidden ? T.HIDDEN_ON_DEVICE : c.emailForResults ?? T.DELETED_AFTER_KEEPING;
  const tag =
    withdrawn ? (
      <span className="ttag">{c.withdrawnReason === 'duplicate_copy' ? T.TAG_DUPLICATE_COPY : T.TAG_REMOVED}</span>
    ) : c.duplicateState === 'possible' ? (
      <span className="ttag ttag--warn">
        <ICONS.warn size={12} aria-hidden="true" />
        {T.TAG_POSSIBLE_DUPLICATE}
      </span>
    ) : hidden ? null : (
      <MoneyTag money={data.money} />
    );
  const showRecord = !hidden && !withdrawn;
  const RecordIcon = ICONS.recordPayment;
  const PrintIcon = ICONS.print;
  const recordButton = showRecord && (
    <button type="button" className={`btn btn-primary${isPhone ? ' btn-block' : ''}`} data-focus-key="detail-record" onClick={(event) => actions.openRecordPayment(c.id, event.currentTarget)}>
      <RecordIcon size={16} aria-hidden="true" />
      {T.RECORD_PAYMENT}
    </button>
  );
  const printButton = !hidden && (
    <button type="button" className={`btn${isPhone ? ' btn-block' : ''}`} data-focus-key="detail-print" onClick={(event) => actions.openReceipt(c.id, event.currentTarget)}>
      <PrintIcon size={16} aria-hidden="true" />
      {T.PRINT_RECEIPT}
    </button>
  );

  return (
    <Dialog title={title} size="wide" fullScreen={isPhone} onRequestClose={actions.requestCloseDetail}>
      {isPhone && moreButton}
      <div className="bb-detail-head">
        {tag}
        <p className="tdialog-sub bb-detail-sub">{T.detailSub(cycle.name, c.dan, c.locationCode)}</p>
      </div>

      {data.needsParentSignature && !withdrawn && (
        <div className="bb-parent-box" role="status">
          <ICONS.warn size={16} aria-hidden="true" className="bb-parent-icon" />
          <div>
            <p>{T.needsParentSignature(c.firstName, firstDay)}</p>
            <label className="cbrow">
              <input type="checkbox" className="cb" checked={false} disabled={actions.busy} onChange={() => actions.savePaperWaiver()} />
              <span>{T.WAIVER_SIGNED_ON_PAPER}</span>
            </label>
          </div>
        </div>
      )}

      <section className="bb-detail-section" aria-label={T.SECTION_CANDIDATE}>
        <h3 className="bb-section-title">{T.SECTION_CANDIDATE}</h3>
        <dl className="ev-sum bb-sum">
          <Row label={T.ROW_NAME}>{T.candidateName(c)}</Row>
          <Row label={T.ROW_DOB}>{dob}</Row>
          <Row label={T.ROW_EMAIL}>{email}</Row>
          <Row label={T.ROW_SCHOOL}>{T.schoolName(c.locationCode)}</Row>
          <Row label={T.ROW_TESTING_FOR}>{T.DAN_LABELS[c.dan]}</Row>
        </dl>
      </section>

      <section className="bb-detail-section" aria-label={T.SECTION_REGISTRATION}>
        <h3 className="bb-section-title">{T.SECTION_REGISTRATION}</h3>
        <dl className="ev-sum bb-sum">
          <Row label={T.ROW_REGISTERED}>{T.registeredLine(c.registeredOn, c.source, c.locationCode)}</Row>
          <Row label={T.ROW_REFERENCE}>{c.reference}</Row>
          <Row label={T.ROW_WAIVER}>
            {T.waiverLine(w)}
            {/* Not with Hide payments on (mat-side): the signature stays at the desk. "· View
                signature" never wraps apart, so no lone "on file ·" is left at a line's end. */}
            {isAdmin && !hidden && w && w.how === 'drawn' && !w.removedAt && (
              <>
                {' '}
                <span className="bb-nowrap">
                  {'· '}
                  <button type="button" className="link-button bb-inline-link" data-focus-key="detail-signature" onClick={(event) => actions.openSignature(event.currentTarget)}>
                    {T.VIEW_SIGNATURE}
                  </button>
                </span>
              </>
            )}
          </Row>
          {withdrawn && <Row label={T.ROW_REMOVED}>{T.removedLine(c)}</Row>}
        </dl>
      </section>

      <section className="bb-detail-section" aria-label={T.SECTION_PAYMENTS}>
        <h3 className="bb-section-title">{T.SECTION_PAYMENTS}</h3>
        {hidden ? (
          <p className="field-hint">{T.PAYMENTS_HIDDEN}</p>
        ) : (
          <Payments
            data={data}
            cycle={cycle}
            isAdmin={isAdmin}
            isPhone={isPhone}
            today={today}
            menuLineId={menu?.kind === 'line' ? menu.line.id : null}
            onLineMore={(line, what, anchor) => actions.setDetailMenu(menu?.kind === 'line' && menu.line.id === line.id ? null : { kind: 'line', line, what, anchor })}
          />
        )}
      </section>

      {isPhone ? (
        (recordButton || printButton) && (
          <div className="dialog-page-submit bb-detail-phone-buttons">
            {recordButton}
            {printButton}
          </div>
        )
      ) : (
        <div className="dialog-footer">
          <div className="dialog-actions bb-detail-actions">
            {moreButton}
            <span className="bb-grow" />
            <button type="button" className="btn" data-autofocus onClick={() => actions.requestCloseDetail()}>
              {T.CLOSE}
            </button>
            {printButton}
            {recordButton}
          </div>
        </div>
      )}
      {menuElement}
    </Dialog>
  );
}
