// ClosedBox.jsx — the "Day closed" summary that replaces the Close the day box (mockups D3, D4).
// Why it exists: once a day is closed, staff and admins need to see who counted it and when,
// what they counted, whether anything was short or over, and the note. If payments changed
// AFTER the count (a late payment, an undo, an edit), the day gets the amber "Changed after
// closing" tag and a line saying what changed, because the totals no longer match the count
// (v0.199, v0.207). Admins get "Reopen day" so the day can be counted again (v0.195).
//
// Props:
//   closing     finance_day's `closing` (kind 'close')
//   items       the day's items (to say how many were added / corrected after closing)
//   isAdmin     show Reopen day
//   reopening   true while Reopen is on its way
//   onReopen    () => void
import { IconAlertTriangle, IconLockCheck, IconLockOpen } from '@tabler/icons-react';
import { dayShort, timeOfDay, weekdayShort } from './format.js';
import * as T from './text.js';

// closing.results.<part> may be a code ('short') with <part>_diff_cents next to it, or an object
// { result, diff_cents }. Both are read into { result, diffCents }.
export function partResult(closing, part) {
  const raw = closing?.results?.[part];
  if (!raw) return { result: 'matches', diffCents: 0, countDiff: 0 };
  if (typeof raw === 'string') return { result: raw, diffCents: closing.results[`${part}_diff_cents`] ?? 0, countDiff: 0 };
  // Checks also say how far the NUMBER of checks was off (count_diff), e.g. one check missing.
  return { result: raw.result ?? 'matches', diffCents: raw.diff_cents ?? raw.diffCents ?? 0, countDiff: raw.count_diff ?? 0 };
}

// "(short $20.00)" / "(over $5.00)" / "(matches)" — the words after a count. On screen a match
// says nothing (D3); the printed page says "matches" (D8).
export function resultWords(r, sayMatches = false) {
  // Only the number of checks was off: "short 1 check"
  if (r.result !== 'matches' && r.diffCents === 0 && r.countDiff) return T.resultCount(r.result === 'short', r.countDiff);
  if (r.result === 'short') return T.resultShort(r.diffCents);
  if (r.result === 'over') return T.resultOver(r.diffCents);
  return sayMatches ? T.RESULT_MATCHES : '';
}

// The count line: "Closed by Staff at 1:42 PM · Cash counted $300.00 (short $20.00) · Checks 2, $210.00 · Card machine $135.00"
export function closingLine(closing, sayMatches = false) {
  const cash = partResult(closing, 'cash');
  const checks = partResult(closing, 'checks');
  const card = partResult(closing, 'card');
  const cashCents = closing.cash_counted_cents ?? 0;
  const cashText = cashCents < 0 ? T.cashOutPart(-cashCents, resultWords(cash, sayMatches)) : T.cashCountedPart(cashCents, resultWords(cash, sayMatches));
  return [
    T.closedBy(closing.by_name, closing.at),
    cashText,
    T.checksPart(closing.checks_counted ?? 0, closing.checks_counted_cents ?? 0, resultWords(checks, sayMatches)),
    T.cardPart(closing.card_counted_cents ?? 0, resultWords(card, sayMatches)),
  ].join(' · ');
}

// The one tag of the box (warning before success, rule 8).
export function closedTag(closing) {
  if (closing.changed_after) return { text: T.CHANGED_AFTER_CLOSING, warn: true };
  const words = {
    cash: [T.cashShortTag, T.cashOverTag],
    checks: [T.checksShortTag, T.checksOverTag],
    card: [T.cardShortTag, T.cardOverTag],
  };
  for (const part of ['cash', 'checks', 'card']) {
    const r = partResult(closing, part);
    if (r.result !== 'matches' && r.diffCents === 0 && r.countDiff) return { text: T.checksCountTag(r.result === 'short', r.countDiff), warn: true };
    if (r.result === 'short') return { text: words[part][0](r.diffCents), warn: true };
    if (r.result === 'over') return { text: words[part][1](r.diffCents), warn: true };
  }
  return { text: T.CLOSED_TAG, warn: false };
}

// "3 payments changed after closing: 1 added on Sat at 4:05 PM, 2 corrected on Mon, Oct 26 by Jeffrey. …"
export function changedLine(closing, items) {
  const count = closing.changed_count ?? 0;
  const added = items.filter((i) => i.added_after_closing);
  const corrected = Math.max(0, count - added.length);
  // Who / when made the corrections: said only when it was one person on one day.
  const fixes = items.filter((i) => i.changed_by_name && i.changed_on && i.state !== 'counted');
  const names = [...new Set(fixes.map((i) => i.changed_by_name))];
  const days = [...new Set(fixes.map((i) => i.changed_on))];
  return T.changedAfterLine({
    count,
    added: added.length,
    addedAt: added.length === 1 ? `${weekdayShort(added[0].day)} at ${timeOfDay(added[0].time)}` : null,
    corrected,
    correctedOn: corrected > 0 && days.length === 1 ? dayShort(days[0]) : null,
    correctedBy: corrected > 0 && names.length === 1 ? names[0] : null,
  });
}

export default function ClosedBox({ closing, items, isAdmin, reopening, onReopen }) {
  const tag = closedTag(closing);
  return (
    // tabIndex -1 + data-day-closed: focus lands here right after closing the day (the button that
    // opened the dialog is gone by then).
    <section className="fin-box" aria-label={T.DAY_CLOSED} tabIndex={-1} data-day-closed>
      <h2 className="fin-box-title">
        <IconLockCheck size={18} aria-hidden="true" className="fin-box-icon" />
        {T.DAY_CLOSED}
        <span className="fin-grow" />
        {tag.warn ? (
          <span className="ttag ttag--warn">
            <IconAlertTriangle size={14} aria-hidden="true" />
            {tag.text}
          </span>
        ) : (
          <span className="ttag fin-tag-ok">{tag.text}</span>
        )}
      </h2>
      <p className="fin-closed-line">{closingLine(closing)}</p>
      {closing.note && <p className="fin-closed-line fin-closed-note">{T.noteLine(closing.note)}</p>}
      {closing.changed_after && (
        <div className="fin-banner" role="status">
          <IconAlertTriangle size={16} aria-hidden="true" />
          <span>{changedLine(closing, items)}</span>
        </div>
      )}
      {isAdmin && (
        <div className="fin-boxfoot">
          <button
            type="button"
            className="btn"
            aria-disabled={reopening ? 'true' : undefined}
            onClick={() => {
              if (!reopening) onReopen();
            }}
          >
            <IconLockOpen size={16} aria-hidden="true" />
            {T.REOPEN_DAY}
          </button>
          <span className="fin-hint">{T.REOPEN_HINT}</span>
        </div>
      )}
    </section>
  );
}
