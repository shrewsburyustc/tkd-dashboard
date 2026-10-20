// CloseDayBox.jsx — the "Close the day" dialog of the Daily report (mockups D1, D2, D13; v0.805, v0.207,
// v0.209; moved into a dialog by v0.800).
// Why it exists: at the end of the day staff count the drawer and type three things — the cash
// in the drawer, the checks (how many + their total) and the card machine's total. The box
// shows what the dashboard EXPECTS under each count, and as they type, each count gets a tag:
// Matches (green, no icon) or Short / Over $X (amber, with the warning icon and words). When
// anything is short or over a note is required. "Close the day" (the page's one blue button)
// stays gray until all three counts are filled in.
//
// v0.800: the counting is no longer on the report itself. "Close the day…" (an outline button in
// the date row; phones: the ⋯ sheet) opens this dialog — centered on PC / tablet (12px corners),
// a full page with a back arrow on phones (Dialog.jsx). Closing it before the day is closed
// (Cancel, Esc, the back arrow) never asks "Unsaved changes": what was typed is simply kept as a
// draft for this school and day, and is back when the dialog opens again (DayReport.jsx).
//
// The tags here are only a preview worked out in the browser (financeRules.closeResults); the
// database checks everything again when the day is closed and has the last word.
//
// Refunds (v0.209): the cash expected is cash in − cash refunded, and the Expected line says so.
// When more cash went out than came in, the cash line asks "Cash taken out of the drawer"
// instead (a positive number, sent to the database as a minus amount).
//
// If saving fails (D13) the dialog keeps everything typed, shows a Not saved tag and the error
// INSIDE the dialog right above the button, and the button becomes "Retry close the day".
// If someone else changed the day meanwhile ('stale'), an amber line says so inside the dialog
// while the day reloads, so the Expected lines are fresh before closing again.
//
// Props:
//   draft          { cash, count, checks, card, note, tried, failed } — what is typed (strings)
//   onDraftChange  (patch) => void
//   expected       financeRules.expectedValues(totals, refunds)
//   totals, refunds  from finance_day (for the Expected cash breakdown)
//   isToday        the hint says "today's payments" on today
//   saving         true while the close is on its way
//   isPhone        full-width button (the single submit button of a phone form, rule 2.1)
//   onCloseDay     () => void
//   onCancel       () => void — Cancel / Esc / back arrow (the draft is kept)
//   notice         an amber line to show inside the dialog (e.g. "Someone else changed this…"), or null
import { useId } from 'react';
import { IconAlertTriangle, IconLockCheck, IconRefresh } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import { closeResults, compareCount, anyDifference } from '../../lib/finance/financeRules.js';
import { parseCount, parseMoney } from './format.js';
import * as T from './text.js';

// Reads the typed counts and works out the preview. Used by the box AND by DayReport before it
// sends the close, so both always agree.
//   → { filled, errors: { cash, count, checks, card }, counted, results, needsNote, noteOk, firstOff }
export function checkDraft(draft, expected) {
  const cash = parseMoney(draft.cash);
  const count = parseCount(draft.count);
  const checks = parseMoney(draft.checks);
  const card = parseMoney(draft.card);
  const filled = [cash, count, checks, card].every((p) => p.problem !== 'empty');
  const moneyError = (p) => (p.problem === 'notNumber' ? T.FIELD_NOT_NUMBER : p.problem === 'tooHigh' ? T.FIELD_TOO_HIGH : null);
  const countError = (p) => (p.problem === 'notNumber' ? T.FIELD_COUNT_NOT_NUMBER : p.problem === 'tooHigh' ? T.FIELD_COUNT_TOO_HIGH : null);
  const errors = { cash: moneyError(cash), count: countError(count), checks: moneyError(checks), card: moneyError(card) };
  const valid = filled && !errors.cash && !errors.count && !errors.checks && !errors.card;

  // Cash taken out of the drawer (expected below zero) is typed as a positive number.
  const cashOut = expected.cashCents < 0;
  const counted = valid
    ? { cashCents: cashOut ? -cash.cents : cash.cents, checksCount: count.count, checksCents: checks.cents, cardCents: card.cents }
    : null;
  const results = counted ? closeResults(expected, counted) : null;
  const needsNote = results ? anyDifference(results) : false;
  // The first part that is off, for the "Add a note" message (drawer order: cash, checks, card).
  const firstOff = results ? ['cash', 'checks', 'card'].find((p) => results[p].result !== 'matches') ?? null : null;
  return { filled, valid, errors, counted, results, needsNote, noteOk: !needsNote || draft.note.trim() !== '', firstOff };
}

// The "Add a note…" sentence for the first part that is off.
export function noteMessage(check) {
  const part = check.firstOff;
  if (!part) return null;
  const r = check.results[part];
  if (part === 'checks' && r.diffCents === 0) return T.noteMissing('checks', r.countResult === 'short', 0, r.countDiff);
  return T.noteMissing(part, r.result === 'short', r.diffCents, 0);
}

// A green or amber tag. Success tags carry no icon (v0.207: ti-check means save / done only).
function ResultTag({ text, ok }) {
  if (!text) return null;
  return ok ? (
    <span className="ttag fin-tag-ok">{text}</span>
  ) : (
    <span className="ttag ttag--warn">
      <IconAlertTriangle size={14} aria-hidden="true" />
      {text}
    </span>
  );
}

// Cash or card: Matches / Short $X / Over $X.
function moneyTag(result) {
  if (!result) return null;
  if (result.result === 'matches') return { text: T.MATCHES, ok: true };
  return { text: result.result === 'short' ? T.shortBy(result.diffCents) : T.overBy(result.diffCents), ok: false };
}

// Checks: the tag says which part is off ("Total short $5.00", "1 check short", or both).
function checksTag(r) {
  if (!r) return null;
  const totalOff = r.diffCents !== 0;
  const countOff = r.countResult !== 'matches';
  if (!totalOff && !countOff) return { text: T.MATCHES, ok: true };
  const countText = countOff ? (r.countResult === 'short' ? T.checksShort(r.countDiff) : T.checksOver(r.countDiff)) : null;
  const totalShort = r.result === 'short';
  if (totalOff && countOff) return { text: T.checksBothOff(countText, r.diffCents, totalShort), ok: false };
  if (totalOff) return { text: totalShort ? T.totalShortBy(r.diffCents) : T.totalOverBy(r.diffCents), ok: false };
  return { text: countText, ok: false };
}

// One money field with a "$" in front (the same look as Testing's price fields).
function MoneyField({ id, value, onChange, invalid, describedBy, className = '', autoFocus = false }) {
  return (
    <span className={`money fin-money ${className}`.trim()}>
      <span className="money-prefix" aria-hidden="true">
        $
      </span>
      <input
        id={id}
        className="money-input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        data-autofocus={autoFocus ? true : undefined}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  );
}

export default function CloseDayBox({ draft, onDraftChange, expected, totals, refunds, isToday, saving, isPhone, onCloseDay, onCancel, notice }) {
  const id = useId();
  const check = checkDraft(draft, expected);
  const results = check.results;

  // Expected lines (D1 / v0.209).
  const cashRefunded = -(refunds?.cash_cents ?? 0); // a positive amount
  const cashIn = totals?.cash?.cents ?? 0;
  const cashOut = expected.cashCents < 0;
  let cashExpected;
  if (cashOut) cashExpected = T.expectedCashOut(-expected.cashCents, cashIn, cashRefunded);
  else if (cashRefunded > 0) cashExpected = T.expectedCashWithRefunds(expected.cashCents, cashIn, cashRefunded);
  else cashExpected = T.expectedCash(expected.cashCents);

  // A field's tag shows once that field holds a valid number (the preview, as people type).
  const cashParsed = parseMoney(draft.cash);
  const cardParsed = parseMoney(draft.card);
  const cashTag = cashParsed.cents !== undefined
    ? moneyTag(compareCount(expected.cashCents, cashOut ? -cashParsed.cents : cashParsed.cents))
    : null;
  const cardTag = cardParsed.cents !== undefined ? moneyTag(compareCount(expected.cardCents, cardParsed.cents)) : null;
  const countParsed = parseCount(draft.count);
  const checksParsed = parseMoney(draft.checks);
  const chkTag =
    countParsed.count !== undefined && checksParsed.cents !== undefined
      ? checksTag(closeResults(expected, { cashCents: 0, checksCount: countParsed.count, checksCents: checksParsed.cents, cardCents: 0 }).checks)
      : null;

  // Field errors show after the person tried to close (or once the field has text that isn't a number).
  const showError = (key) => (draft.tried || draft[key] !== '' ? check.errors[key] : null);
  const noteError = draft.tried && check.valid && !check.noteOk ? noteMessage(check) : null;
  const ready = check.filled; // all three counts typed in → the button turns blue

  const fieldError = (key) =>
    showError(key) ? (
      <p id={`${id}-${key}-err`} className="fin-field-error">
        <IconAlertTriangle size={14} aria-hidden="true" />
        {showError(key)}
      </p>
    ) : null;

  return (
    <Dialog title={T.CLOSE_TITLE} size="medium" fullScreen={isPhone} onRequestClose={onCancel}>
      <div className="fin-close-dialog">
      {draft.failed && (
        <span className="ttag ttag--warn fin-close-notsaved">
          <IconAlertTriangle size={14} aria-hidden="true" />
          {T.NOT_SAVED}
        </span>
      )}
      <p className="fin-hint fin-box-hint">{isToday ? T.CLOSE_HINT : T.CLOSE_HINT_OTHER_DAY}</p>
      {notice && (
        <div className="notice" role="alert">
          <IconAlertTriangle size={16} aria-hidden="true" className="notice-icon" />
          <span>{notice}</span>
        </div>
      )}

      {/* Cash */}
      <div className="fin-crow">
        <div className="fin-crow-label">
          <label htmlFor={`${id}-cash`}>{cashOut ? T.CASH_OUT_LABEL : T.CASH_LABEL}</label>
          <p id={`${id}-cash-exp`} className="fin-exp">
            {cashExpected}
          </p>
        </div>
        <div className="fin-crow-field">
          <MoneyField
            id={`${id}-cash`}
            autoFocus
            value={draft.cash}
            invalid={Boolean(showError('cash'))}
            describedBy={`${id}-cash-exp${showError('cash') ? ` ${id}-cash-err` : ''}`}
            onChange={(cash) => onDraftChange({ cash })}
          />
          {fieldError('cash')}
        </div>
        <div className="fin-crow-tag" aria-live="polite">
          {cashTag && <ResultTag {...cashTag} />}
        </div>
      </div>

      {/* Checks: How many + Total (v0.207) */}
      <div className="fin-crow">
        <div className="fin-crow-label">
          <span id={`${id}-checks-label`}>{T.CHECKS_LABEL}</span>
          <p id={`${id}-checks-exp`} className="fin-exp">
            {T.expectedChecks(expected.checksCount, expected.checksCents)}
          </p>
        </div>
        <div className="fin-crow-field fin-checks" role="group" aria-labelledby={`${id}-checks-label`}>
          <div>
            <label className="fin-lbl" htmlFor={`${id}-count`}>
              {T.CHECKS_HOW_MANY}
            </label>
            <input
              id={`${id}-count`}
              className="input fin-count"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft.count}
              aria-invalid={showError('count') ? 'true' : undefined}
              aria-describedby={`${id}-checks-exp${showError('count') ? ` ${id}-count-err` : ''}`}
              onChange={(event) => onDraftChange({ count: event.target.value })}
            />
          </div>
          <div>
            <label className="fin-lbl" htmlFor={`${id}-checks`}>
              {T.CHECKS_TOTAL}
            </label>
            <MoneyField
              id={`${id}-checks`}
              className="fin-money--checks"
              value={draft.checks}
              invalid={Boolean(showError('checks'))}
              describedBy={`${id}-checks-exp${showError('checks') ? ` ${id}-checks-err` : ''}`}
              onChange={(checks) => onDraftChange({ checks })}
            />
          </div>
          {fieldError('count')}
          {fieldError('checks')}
        </div>
        <div className="fin-crow-tag" aria-live="polite">
          {chkTag && <ResultTag {...chkTag} />}
        </div>
      </div>

      {/* Card machine */}
      <div className="fin-crow">
        <div className="fin-crow-label">
          <label htmlFor={`${id}-card`}>{T.CARD_LABEL}</label>
          <p id={`${id}-card-exp`} className="fin-exp">
            {T.expectedCard(expected.cardCents)}
          </p>
        </div>
        <div className="fin-crow-field">
          <MoneyField
            id={`${id}-card`}
            value={draft.card}
            invalid={Boolean(showError('card'))}
            describedBy={`${id}-card-exp${showError('card') ? ` ${id}-card-err` : ''}`}
            onChange={(card) => onDraftChange({ card })}
          />
          {fieldError('card')}
        </div>
        <div className="fin-crow-tag" aria-live="polite">
          {cardTag && <ResultTag {...cardTag} />}
        </div>
      </div>

      {/* The note appears once all three counts are filled in (D2). */}
      {ready && (
        <div className="fin-note">
          <label className="fin-lbl" htmlFor={`${id}-note`}>
            {T.NOTE_LABEL} <span>{T.NOTE_NEEDED}</span>
          </label>
          <textarea
            id={`${id}-note`}
            className={`input fin-textarea${noteError ? ' is-bad' : ''}`}
            rows={2}
            maxLength={500}
            value={draft.note}
            data-close-note
            aria-invalid={noteError ? 'true' : undefined}
            aria-describedby={noteError ? `${id}-note-err` : undefined}
            onChange={(event) => onDraftChange({ note: event.target.value })}
          />
          {noteError && (
            <p id={`${id}-note-err`} className="fin-field-error" role="alert">
              <IconAlertTriangle size={14} aria-hidden="true" />
              {noteError}
            </p>
          )}
        </div>
      )}

      {/* D13: the error sits inside the box, right above the button, until the close works. */}
      {draft.failed && (
        <p className="fin-box-error" role="alert">
          <IconAlertTriangle size={16} aria-hidden="true" />
          {T.CLOSE_FAILED}
        </p>
      )}

      <p id={`${id}-foot`} className="fin-hint fin-close-foot">
        {!ready ? T.FILL_ALL_FIRST : draft.failed ? '' : T.SAVES_WITH_NAME}
      </p>
      </div>
      {/* Cancel keeps the draft; Close the day is the dialog's one blue button. Phones: the back
          arrow is the way out, and the one submit button is full width (rule 2.1). */}
      <div className="dialog-actions">
        {!isPhone && (
          <button type="button" className="btn" onClick={onCancel}>
            {T.CANCEL}
          </button>
        )}
        <button
          type="button"
          className={`btn btn-primary fin-close-btn${ready ? '' : ' is-unavailable'}${isPhone ? ' btn-block' : ''}`}
          aria-disabled={!ready || saving ? 'true' : undefined}
          aria-describedby={`${id}-foot`}
          data-close-day
          onClick={() => {
            if (ready && !saving) onCloseDay();
          }}
        >
          {draft.failed ? <IconRefresh size={16} aria-hidden="true" /> : <IconLockCheck size={16} aria-hidden="true" />}
          {draft.failed ? T.RETRY_CLOSE : T.CLOSE_BUTTON}
        </button>
      </div>
    </Dialog>
  );
}
