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
//   - History · N changes › (BB8, v0.972: the shared line, CandidateHistory.jsx; not in Edit details)
//   - Close · Print receipt (only with a payment or refund that still stands) · Record payment (primary), and ⋯: Edit details · Change plan or
//     Kukkiwon — (admins) Withdraw · Delete permanently, or on a withdrawn candidate Restore ·
//     Delete permanently (v1.007 / v0.963: no "Remove candidate" choice box any more)
// Edit details (Star v0.112) turns the same dialog into fields with Cancel and Save.
// A make-up from an earlier cycle (contract 0025 §14.5, G 27): the gray "Make-up" tag and the line
// "Make-up from Spring 2027 · retests Free sparring" under the title, its earlier BB reference,
// Plan "No fee" and no payments part; no Record payment, no Change plan, no refund; Edit details
// shows the Dan as text, not a field (Q-G4: a make-up's Dan can't change). Delete permanently is
// grayed while the candidate has grades (Q-G3, v0.950).
// Privacy (§5): the date of birth and email appear only here, and with the device's Hide payments
// switch on they read the gray "Hidden on this tablet" (OP-B7, v0.974; gray .ev-hidden-value,
// R4-03); so do the payments. View signature stays for admins (M-04, v1.055 (c), as Star's;
// a signature opened while hidden stays open). Nothing in the ⋯ tells who has
// paid (R1-04, R4-01 / v1.036): Change plan or Kukkiwon is grayed "Change the plan at the desk."
// for everyone and Delete permanently "Delete candidates at the desk." on every candidate. Edit
// details opens (R4-04, v1.037, as Star's): the date of birth and email are gray boxes reading
// "Hidden on this tablet" with "Change the date of birth or email at the desk." under them (Save
// keeps the stored values); for staff the Dan is grayed on every candidate with "Change the Dan at
// the desk."; an admin's "$X is already paid" line is left out. The data lives in
// useCandidateActions only while this dialog is open.
// Focus: Edit details puts the cursor in First name; back from it, or from a dialog opened here,
// focus returns to the button that opened it (its data-focus-key).
import { useEffect, useId, useRef, useState } from 'react';
import Dialog from '../../../components/Dialog.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import IconButton from '../../../components/IconButton.jsx';
import Notice from '../../../components/Notice.jsx';
import RowMenu from '../../../components/RowMenu.jsx';
import { HISTORY } from '../../../components/text.js'; // the History section's name for screen readers
import { formatCents } from '../../../lib/blackBelt/money.js';
import { dueNowItems, hasLivePayment } from '../../../lib/blackBelt/rules.js';
import Choice from '../parts/Choice.jsx';
import DateField from '../parts/DateField.jsx';
import { dobYears } from '../../../lib/blackBelt/dateLimits.js';
import { canRecordPayment, detailsProblems, printReceiptOffered } from './checks.js';
import CandidateHistory from './CandidateHistory.jsx';
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
  // A make-up has no plan and no fee (the database refuses any payment for it)
  if (c.isMakeup) {
    return (
      <>
        <dl className="ev-sum bb-sum">
          <Row label={T.ROW_PLAN}>{T.PLAN_NO_FEE}</Row>
        </dl>
        <p className="field-hint bb-no-payments">{T.MAKEUP_NO_PAYMENTS}</p>
      </>
    );
  }
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
// hidden = Hide private details on (R4-04, v1.037, Star's v0.507 Q1 / v0.508 (3)): the date of
// birth and email are gray boxes reading "Hidden on this tablet" with Star's hint under them (Save
// keeps the stored values, editValuesToSave); for staff the Dan is grayed on EVERY candidate with
// "Change the Dan at the desk." and shows the stored Dan (never the paid-only lock, which would
// tell who has paid); an admin's "$X is already paid" line is left out.
function EditFields({ edit, data, isAdmin, hidden, today, isPhone, onChange }) {
  const id = useId();
  const v = edit.values;
  const c = data.candidate;
  const purged = c.dateOfBirth === null;
  // (hidden: the date of birth and email can't be changed, so they aren't checked here)
  const problems = detailsProblems(v, { today, purged: purged || hidden });
  const show = (field) => (edit.triedSave ? problems[field] : null);
  const paidLive = hasLivePayment(data.payments);
  const makeup = c.isMakeup === true;
  const danAtDesk = hidden && !isAdmin; // the same look on every row (no paid / unpaid difference)
  const danLocked = danAtDesk || (paidLive && !isAdmin);
  const danValue = danAtDesk ? Number(edit.initial.dan) : Number(v.dan);
  const danChangedAfterPay = !hidden && paidLive && isAdmin && Number(v.dan) !== Number(edit.initial.dan);
  const ro = edit.saving;
  // A hidden value in the field's place: a gray box (Star's st-hidden-box), no input to change.
  // Plain text, read in order after its label (and before the hint) by a screen reader.
  // role="group" ties the box to its label and to the one desk hint under Email.
  const hiddenBox = (fieldId, labelId) => (
    <div id={fieldId} role="group" aria-labelledby={labelId} aria-describedby={`${id}-email-hint`} className="input bb-hidden-box ev-hidden-value">
      {T.HIDDEN_ON_DEVICE}
    </div>
  );
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
        {hidden ? (
          // Hidden: the gray box (Star's: no hint here; the one hint is under Email)
          <>
            <span id={`${id}-dob-label`} className="field-label">{T.DOB}</span>
            {hiddenBox(`${id}-dob`, `${id}-dob-label`)}
          </>
        ) : purged ? (
          <>
            <label htmlFor={`${id}-dob`}>{T.DOB}</label>
            <p id={`${id}-dob`} className="bb-readonly">{T.DELETED_AFTER_KEEPING}</p>
          </>
        ) : (
          <>
            {/* A span, not a <label>: the field is a button (the calendar), named by its own label */}
            <span className="field-label">{T.DOB}</span>
            {/* Star's staff birthday field (v1.018): future days gray, the Year list back 80 years */}
            <DateField
              id={`${id}-dob`}
              label={T.DOB}
              value={v.dob}
              today={today}
              max={today}
              years={dobYears(today)}
              hint={T.DOB_CALENDAR_HINT}
              isPhone={isPhone}
              disabled={ro}
              invalid={Boolean(dobMsg)}
              describedBy={dobMsg ? err('dob') : undefined}
              onChange={(dob) => onChange({ dob })}
            />
          </>
        )}
        {dobMsg && <Notice id={err('dob')}>{dobMsg}</Notice>}
      </div>
      <div className="field">
        {hidden ? (
          // Hidden: the gray box with Star's hint under it ("Change the date of birth or email at the desk.")
          <>
            <span id={`${id}-email-label`} className="field-label">{T.EMAIL}</span>
            {hiddenBox(`${id}-email`, `${id}-email-label`)}
            <p id={`${id}-email-hint`} className="field-hint">{T.HIDDEN_EDIT_HINT}</p>
          </>
        ) : (
          <>
            <label htmlFor={`${id}-email`}>{T.EMAIL}</label>
            {purged ? (
              <p id={`${id}-email`} className="bb-readonly">{T.DELETED_AFTER_KEEPING}</p>
            ) : (
              <input id={`${id}-email`} className="input" type="email" autoComplete="off" readOnly={ro} value={v.email} aria-invalid={emailMsg ? 'true' : undefined} aria-describedby={emailMsg ? err('email') : undefined} onChange={(e) => onChange({ email: e.target.value })} />
            )}
            {emailMsg && <Notice id={err('email')}>{emailMsg}</Notice>}
          </>
        )}
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
        {makeup ? (
          // A make-up has no Dan field (Q-G4, DC 4): it keeps the earlier cycle's Dan
          <>
            <p className="bb-readonly" aria-labelledby={`${id}-dan`}>
              {T.danMakeupReadonly(c.dan, c.makeupOfCycleName)}
            </p>
            <p className="field-hint">{T.DAN_MAKEUP_HINT}</p>
          </>
        ) : (
          <Choice labelId={`${id}-dan`} className={`bb-segmented--fill${danLocked ? ' is-locked' : ''}`} options={DANS.map((dan) => ({ key: dan, label: T.DAN_LABELS[dan] }))} value={danValue} readOnly={ro || danLocked} ariaDisabled={danAtDesk} describedBy={danAtDesk ? `${id}-dan-hint` : undefined} onChange={(dan) => onChange({ dan })} />
        )}
        {/* Staff while hidden: one look on every row (Star's v0.508 (3)); else the paid-only lock */}
        {danLocked && !makeup && <p id={`${id}-dan-hint`} className="field-hint">{danAtDesk ? T.DAN_AT_DESK_HINT : T.DAN_LOCKED_STAFF}</p>}
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

export default function CandidateDialog({ actions, cycle, isAdmin, isPhone, hidden, today, onNoAccess }) {
  const d = actions.dlg.detail;
  const data = d.data;
  const c = data?.candidate ?? null;
  const editing = d.mode === 'edit' && d.edit;
  const moreRef = useRef(null);
  const title = c ? T.candidateName(c) : T.SECTION_CANDIDATE;
  const withdrawn = c?.status === 'withdrawn';
  const moreButtonElement = () => moreRef.current?.querySelector('button') ?? null;

  // A problem while this detail is open (v0.966, BB4): the shared amber bar INSIDE the detail —
  // under its header on the PC and tablet, at the top of the full-screen page on phones — never
  // the tab's bar behind the dialog. It stays until × (or a Retry that works) and goes away with
  // the detail. Retry clears it first; a retry that fails puts it back.
  const banner = d.banner ?? null;
  // A new problem is brought into view: the detail may be scrolled down to the ⋯ that was used, and
  // the bar sits near its top, so the part of the dialog that scrolls goes back to the top.
  const bannerRef = useRef(null);
  useEffect(() => {
    if (!banner) return;
    let box = bannerRef.current?.parentElement ?? null;
    while (box && box.scrollHeight <= box.clientHeight) box = box.parentElement;
    if (box && box !== document.documentElement && box !== document.body) box.scrollTop = 0;
  }, [banner]);
  const bannerElement = banner && (
    <div ref={bannerRef}>
      <ErrorBanner
      text={banner.text}
      onRetry={
        banner.retry
          ? () => {
              actions.dismissDetailBanner();
              banner.retry();
            }
          : undefined
      }
      retrying={actions.busy}
      onDismiss={actions.dismissDetailBanner}
      />
    </div>
  );

  // Phones (BB5, v0.967): the toast ("Changes saved · Undo") must sit ABOVE the detail's bottom
  // buttons, never over Record payment (a tap meant for it could hit Undo). The buttons' height
  // changes (one or two buttons, the safe area), so it is measured here and handed to the CSS as
  // --bb-toast-lift (blackBelt.css moves the toast up by it while the buttons are on screen).
  // The buttons' bar as an element in state (a "callback ref"): when it appears — the detail
  // finished loading, Edit details closed — the effect below runs again and measures it at once.
  const [phoneButtons, setPhoneButtons] = useState(null);
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty('--bb-toast-lift');
    if (!isPhone) return clear;
    const update = () => {
      const element = phoneButtons;
      if (!element?.isConnected) {
        clear();
        return;
      }
      // from the bottom of the window up to the top edge of the buttons' bar (at least the bar's
      // own height: it is stuck to the bottom of the page)
      const box = element.getBoundingClientRect();
      const lift = Math.max(box.height, window.innerHeight - box.top);
      root.style.setProperty('--bb-toast-lift', `${Math.round(lift)}px`);
    };
    update();
    const frame = window.requestAnimationFrame(update); // again once the page has settled
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    if (observer && phoneButtons) observer.observe(phoneButtons);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true); // true: the full-screen page scrolls, not the window
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      clear();
    };
  }, [isPhone, phoneButtons]);

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
        // (not on screen, e.g. the ⋯ while Edit details shows: the dialog's first button instead,
        // so focus never ends up outside the open dialog)
        const target = document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`) ?? document.querySelector('[role="dialog"] button');
        if (target) target.focus();
      }),
    );
    clearFocusKey();
  }, [focusKey, hasData, clearFocusKey]);

  // ----- The detail's ⋯ (Edit details · Change plan — Withdraw or Restore · Delete permanently) -----
  function detailItems() {
    // Edit details opens also with Hide private details on (R4-04, v1.037): its date of birth and
    // email then read the gray "Hidden on this tablet" (EditFields).
    const items = [
      {
        key: 'edit',
        label: T.EDIT_DETAILS,
        Icon: ICONS.editDetails,
        onSelect: () => actions.startEdit(),
      },
    ];
    // A make-up has no plan, so no Change plan (G 27). Hidden (R1-04, R4-01 / v1.036): desk-only,
    // grayed for admins and staff alike with a line that names no payment.
    if (!withdrawn && !c.isMakeup) {
      const locked = hidden || (!isAdmin && hasLivePayment(data.payments));
      const reason = hidden ? T.CHANGE_PLAN_AT_DESK : data.money.paidCents <= 0 ? T.PAYMENT_RECORDED_ASK_ADMIN : T.alreadyPaidAskAdmin(data.money.paidCents);
      items.push({
        key: 'plan',
        label: locked ? <TwoLines label={T.CHANGE_PLAN} reason={reason} /> : T.CHANGE_PLAN,
        Icon: ICONS.changePlan,
        disabled: locked,
        onSelect: () => actions.openChangePlan(c.id, moreButtonElement()),
      });
    }
    const target = { id: c.id, firstName: c.firstName, lastName: c.lastName, version: c.version, hasPaymentRows: data.payments.length > 0, hasGrades: c.hasGrades, withdrawnReason: c.withdrawnReason };
    if (isAdmin) {
      // The last group (v1.007): Withdraw (plain, at once, with Undo) or Restore, then Delete
      // permanently — red and it asks first. The database refuses a delete while ANY payment row
      // exists (even an undone one); the detail only sees live lines, so it may offer Delete and
      // get has_payments back. …and (0025, Q-G3) while they have grades. An active candidate's
      // reason says what to do instead (v0.904); a withdrawn one's only why. Hidden (R1-04): the
      // same desk line on every candidate, so it can't tell who has paid.
      const name = T.candidateName(c);
      if (withdrawn) items.push({ key: 'restore', label: T.RESTORE, Icon: ICONS.restore, separatorBefore: true, disabled: actions.busy, onSelect: () => actions.restore(target, moreButtonElement()) });
      else items.push({ key: 'withdraw', label: T.WITHDRAW, Icon: ICONS.withdraw, separatorBefore: true, disabled: actions.busy, onSelect: () => actions.withdraw(target, moreButtonElement()) });
      const reason = hidden
        ? T.DELETE_AT_DESK
        : data.payments.length > 0
        ? (withdrawn ? T.hasPaymentRecordsShort(name) : T.hasPaymentRecords(name))
        : c.hasGrades ? (withdrawn ? T.hasGradesShort(name) : T.hasGrades(name)) : null;
      items.push({
        key: 'delete',
        label: reason ? <TwoLines label={T.DELETE_PERMANENTLY} reason={reason} /> : T.DELETE_PERMANENTLY,
        Icon: ICONS.deleteForever,
        // On a removed person's ⋯, Restore sits above the line and Delete permanently below it (C-04, v1.055 (f))
        separatorBefore: withdrawn,
        danger: !reason,
        disabled: Boolean(reason),
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
        {bannerElement}
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
      <button type="submit" data-edit-save className={`btn btn-primary${isPhone ? ' btn-block' : ''}${e.saving || e.blocking ? ' is-unavailable' : ''}`} aria-disabled={e.saving || e.blocking ? 'true' : undefined}>
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
        {bannerElement}
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            actions.saveEdit();
          }}
        >
          {e.failed && <ErrorBanner text={T.SAVE_FAILED} onRetry={() => actions.saveEdit()} retrying={e.saving} />}
          <EditFields edit={e} data={data} isAdmin={isAdmin} hidden={hidden} today={today} isPhone={isPhone} onChange={actions.changeEdit} />
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
  // Hidden values keep their row and read gray (v0.507 Q2, R4-03: the shared .ev-hidden-value)
  const hiddenValue = <span className="ev-hidden-value">{T.HIDDEN_ON_DEVICE}</span>;
  const dob = hidden ? hiddenValue : c.dateOfBirth ? T.dobLine(c.dateOfBirth, c.ageOnFirstDay, firstDay) : T.DELETED_AFTER_KEEPING;
  const email = hidden ? hiddenValue : c.emailForResults ?? T.DELETED_AFTER_KEEPING;
  const tag =
    withdrawn ? (
      <span className="ttag">{c.withdrawnReason === 'duplicate_copy' ? T.TAG_DUPLICATE_COPY : T.TAG_REMOVED}</span>
    ) : c.duplicateState === 'possible' ? (
      <span className="ttag ttag--warn">
        <ICONS.warn size={12} aria-hidden="true" />
        {T.TAG_POSSIBLE_DUPLICATE}
      </span>
    ) : c.isMakeup ? (
      <span className="ttag">{T.TAG_MAKEUP}</span>
    ) : hidden ? null : (
      <MoneyTag money={data.money} />
    );
  // A possible duplicate offers no Record payment until the pair is resolved (R3-02, v1.046 (8))
  const showRecord = !hidden && canRecordPayment({ withdrawn, isMakeup: c.isMakeup, duplicateState: c.duplicateState });
  const RecordIcon = ICONS.recordPayment;
  const PrintIcon = ICONS.print;
  const recordButton = showRecord && (
    <button type="button" className={`btn btn-primary${isPhone ? ' btn-block' : ''}`} data-focus-key="detail-record" onClick={(event) => actions.openRecordPayment(c.id, event.currentTarget)}>
      <RecordIcon size={16} aria-hidden="true" />
      {T.RECORD_PAYMENT}
    </button>
  );
  // Print receipt only with a payment or refund that still stands (the detail knows the live lines
  // exactly), active or withdrawn; never while hidden (BB2 / M-03, v1.055 (b))
  const printButton = printReceiptOffered({ hidden, isMakeup: c.isMakeup === true, lines: data.payments }) && (
    <button type="button" className={`btn${isPhone ? ' btn-block' : ''}`} data-focus-key="detail-print" onClick={(event) => actions.openReceipt(c.id, event.currentTarget)}>
      <PrintIcon size={16} aria-hidden="true" />
      {T.PRINT_RECEIPT}
    </button>
  );

  return (
    <Dialog title={title} size="wide" fullScreen={isPhone} onRequestClose={actions.requestCloseDetail}>
      {isPhone && moreButton}
      {/* phones: the amber bar at the top of the full-screen page */}
      {isPhone && bannerElement}
      <div className="bb-detail-head">
        {tag}
        <p className="tdialog-sub bb-detail-sub">{T.detailSub(cycle.name, c.dan, c.locationCode)}</p>
        {c.isMakeup && <p className="bb-cline bb-makeup-line bb-detail-makeup">{T.makeupLine(c.makeupOfCycleName, c.retestNames)}</p>}
      </div>
      {/* PC and tablet: the amber bar under the header, above the first section */}
      {!isPhone && bannerElement}

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
          <Row label={T.ROW_REGISTERED}>{c.isMakeup ? T.registeredMakeup(c.registeredOn, c.makeupOfCycleName) : T.registeredLine(c.registeredOn, c.source, c.locationCode)}</Row>
          <Row label={T.ROW_REFERENCE}>{c.reference}</Row>
          <Row label={T.ROW_WAIVER}>
            {c.isMakeup && !w ? T.WAIVER_MAKEUP : T.waiverLine(w)}
            {/* Admins also while private details are hidden, as Star's View signature (M-04,
                v1.055 (c)). "· View signature" never wraps apart, so no lone "on file ·" is left
                at a line's end. */}
            {isAdmin && w &&w.how === 'drawn' && !w.removedAt && (
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

      {/* BB8 (v0.972): the shared one-line History after the payment totals — also for a
          withdrawn candidate and a make-up; on phones it scrolls with the page,
          above the bottom buttons. It reads the history itself when it appears; the key reads it
          again after a change to the candidate (a payment, an edit: a new version). */}
      <section className="bb-detail-section bb-detail-history" aria-label={HISTORY}>
        <CandidateHistory key={`${c.id}-${c.version}`} candidateId={c.id} cycle={cycle} hidden={hidden} onNoAccess={onNoAccess} />
      </section>

      {isPhone ? (
        (recordButton || printButton) && (
          <div ref={setPhoneButtons} className="dialog-page-submit bb-detail-phone-buttons">
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
