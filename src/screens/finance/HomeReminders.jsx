// HomeReminders.jsx — the close-the-day reminder lines on Home (mockup D10, v0.202, v0.207).
// Why it exists: on a day the school took payments and hasn't closed its drawer yet, from the
// reminder time set in Finance → Settings onward, Home shows an amber line:
// "Today's drawer isn't closed yet.  Close the day ›" — the whole line is one link (44px tall on
// touch screens) to the Daily report. No dollar amounts (rule 5: Home is seen near the mat).
// On Both, one line per school ("Shrewsbury's drawer isn't closed yet."). Admins also see how
// many earlier days (last 30) weren't closed, linking to History: with one school chosen, that
// school's days only ("…at Shrewsbury…"); on Both, one line for both schools. The link opens
// History for the same school choice, at the month of the first unclosed day.
// While "Hide payments" is on for this device (v0.215) the lines still show, but without a link.
// The earlier-days line has an OK button (v0.811): OK remembers on this device which unclosed
// (school, day) pairs were seen (lib/finance/reminderAck.js). The line then stays away while only
// seen days are unclosed, and comes back for NEW ones: "1 new earlier day at Worcester wasn't
// closed: Mon, Oct 19 (21 seen before)." To know WHICH days are unclosed (finance_home only gives
// a count), Home reads finance_history for the months of the 30-day window — only when the count
// is above 0 and something changed. If that read fails, the line shows as before, without OK: a
// failed call never hides a reminder. That line is two controls side by side: the text + "Open
// History" (one button), and OK — so pressing OK never opens History. After OK, Home moves the
// keyboard focus (onAcknowledged) and says "Hidden until a new day isn't closed." to screen readers.
//
// The database decides who needs a reminder (finance_home). Home asks again every minute (the
// reminder time may pass while Home is open), when the browser tab becomes visible again, when
// the school changes and after unlocking.
//
//   const { lines, pending } = useHomeReminders({ location, screenLocked });
//   <ReminderLines lines={lines} linked={!paymentsHidden} onOpenReport={…} onOpenHistory={…}
//                  onAcknowledged={…} />
import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconChevronRight } from '@tabler/icons-react';
import { LOCATIONS, LOCATION_CODE } from '../../lib/device.js';
import { financeHistory, financeHome } from '../../lib/finance/financeApi.js';
import {
  getSeen, markSeen, monthsToLoad, newDays, pruneSeen, SEEN_EVENT, SEEN_KEY, splitPair, unclosedPairsFrom,
} from '../../lib/finance/reminderAck.js';
// eventsApi's schoolToday also follows the preview's __tkdPreview.setToday (like Finance.jsx).
import { schoolToday } from '../../lib/testing/eventsApi.js';
import * as T from './text.js';
import * as R from './reminderText.js';

const EVERY_MINUTE = 60 * 1000;

// → { lines, pending }
//   lines: [{ key, text, link, kind: 'report' | 'history', school, firstDay, ackPairs }] (empty
//   when nothing is due). ackPairs (earlier line only): the pairs OK marks as seen; missing = no OK.
//   pending: true while the History read for the earlier line is still running (Home then waits
//   before saying "Nothing on Home yet", so that text doesn't flash).
export function useHomeReminders({ location, screenLocked }) {
  const [answer, setAnswer] = useState(null);
  // The exact unclosed days for the earlier line: { sig, pairs } or { sig, failed: true }.
  const [detail, setDetail] = useState(null);
  // Bumped when OK is pressed (here, in another view or another tab) so "seen" is read again.
  const [, setSeenTick] = useState(0);

  useEffect(() => {
    if (screenLocked) return undefined;
    let stale = false;
    const ask = () => {
      if (document.visibilityState !== 'visible') return;
      financeHome().then((result) => {
        // A failed call keeps what was shown (a reminder is a nudge, not an error to report).
        if (!stale && result.status === 'ok') setAnswer(result);
      });
    };
    ask();
    const timer = window.setInterval(ask, EVERY_MINUTE);
    document.addEventListener('visibilitychange', ask);
    return () => {
      stale = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', ask);
    };
  }, [screenLocked, location]);

  // The earlier days for the school choice: on Both all of them, else that school's part
  // (by_school is keyed by location code). Only admins get `earlier` at all.
  const code = location === 'Both' ? null : LOCATION_CODE[location];
  const earlier = answer?.earlier ?? null;
  const scoped = !earlier ? null : code === null ? earlier : earlier.by_school?.[code] ?? null;
  const scopedCount = scoped?.count ?? 0;
  const today = schoolToday();
  // A "signature": changes when the summary, the school choice or the date changes. Only then is
  // History read again (not every minute).
  const sig = scopedCount > 0 ? `${today}|${code}|${scopedCount}|${scoped.first_day}|${JSON.stringify(earlier.by_school ?? {})}` : null;

  useEffect(() => {
    if (sig === null || screenLocked) return undefined;
    let stale = false;
    Promise.all(monthsToLoad(today).map((month) => financeHistory({ locationCode: code, month }))).then((results) => {
      if (stale) return;
      if (results.some((r) => r.status !== 'ok')) {
        setDetail({ sig, failed: true });
        return;
      }
      pruneSeen(today); // forget seen days that left the 30-day window
      setDetail({ sig, pairs: unclosedPairsFrom(results.flatMap((r) => r.days ?? []), today) });
    });
    return () => {
      stale = true;
    };
    // `today` and `code` are part of sig, so sig alone decides when to read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, screenLocked]);

  // OK pressed here, in another open view, or in another browser tab → show the change at once.
  useEffect(() => {
    const bump = () => setSeenTick((n) => n + 1);
    const onStorage = (event) => {
      if (event.key === SEEN_KEY || event.key === null) bump();
    };
    window.addEventListener(SEEN_EVENT, bump);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SEEN_EVENT, bump);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  if (!answer) return { lines: [], pending: false };
  const due = new Set(answer.today ?? []);
  const lines = [];
  if (location === 'Both') {
    for (const school of LOCATIONS) {
      if (due.has(LOCATION_CODE[school])) {
        lines.push({ key: school, text: T.schoolDrawerNotClosed(school), link: T.CLOSE_THE_DAY_LINK, kind: 'report', school });
      }
    }
  } else if (due.has(LOCATION_CODE[location])) {
    lines.push({ key: location, text: T.DRAWER_NOT_CLOSED, link: T.CLOSE_THE_DAY_LINK, kind: 'report', school: location });
  }
  const current = detail?.sig === sig ? detail : null;
  if (scopedCount > 0) {
    const line = earlierLine({ location, scoped, detail: current });
    if (line) lines.push(line);
  }
  return { lines, pending: scopedCount > 0 && !current };
}

// 'worcester' → 'Worcester'
const schoolName = (code) => LOCATIONS.find((name) => LOCATION_CODE[name] === code) ?? code;

// The earlier-days line, or null when every unclosed day was already seen (OK).
function earlierLine({ location, scoped, detail }) {
  const both = location === 'Both';
  const wording = (count, firstDay) => (both ? T.earlierNotClosed(count, firstDay) : T.earlierNotClosedAt(location, count, firstDay));
  const line = { key: 'earlier', link: T.OPEN_HISTORY, kind: 'history', school: both ? null : location };
  // The approved line with finance_home's own count and first day, without OK.
  const plain = { ...line, text: wording(scoped.count, scoped.first_day), firstDay: scoped.first_day };

  // History couldn't be read, or disagrees (no unclosed days although finance_home counted some):
  // show the line as before — never hide a reminder because of an error.
  if (detail?.failed || (detail && detail.pairs.length === 0)) return plain;

  const seen = getSeen();
  if (!detail) {
    // Still reading History: show the line now only if nothing was ever seen on this device (the
    // words are the same either way); otherwise wait a moment instead of flashing it.
    return seen.length === 0 ? plain : null;
  }

  const fresh = newDays(detail.pairs, seen);
  if (fresh.length === 0) return null; // only seen days are unclosed
  const seenBefore = detail.pairs.length - fresh.length;
  const firstNew = splitPair(fresh[0]).day; // pairs are oldest first; History opens at its month
  // On Both, name the school when every NEW day is at one school; no school only when they span both.
  const newSchools = new Set(fresh.map((pair) => splitPair(pair).school));
  const at = !both ? location : newSchools.size === 1 ? schoolName([...newSchools][0]) : null;
  const text = seenBefore === 0
    ? wording(fresh.length, firstNew) // nothing seen yet: the approved words, unchanged
    : at
      ? R.newEarlierNotClosedAt(at, fresh.length, firstNew, seenBefore)
      : R.newEarlierNotClosed(fresh.length, firstNew, seenBefore);
  // OK marks every day unclosed now (seen and new) as seen.
  return { ...line, text, firstDay: firstNew, ackPairs: detail.pairs };
}

// onAcknowledged(): called after OK hid a line, so Home can move the focus and announce it.
export function ReminderLines({ lines, linked, onOpenReport, onOpenHistory, onAcknowledged }) {
  if (lines.length === 0) return null;
  return (
    <div className="fin-home-lines">
      {lines.map((line) => {
        const open = () => (line.kind === 'history' ? onOpenHistory(line.firstDay) : onOpenReport(line.school));
        const content = (
          <>
            <IconAlertTriangle size={16} aria-hidden="true" />
            <span className="fin-grow">{line.text}</span>
            {linked && <span className="fin-home-link">{line.link}</span>}
            {linked && <IconChevronRight size={16} aria-hidden="true" />}
          </>
        );
        if (line.ackPairs) {
          // Two separate controls side by side: the link (text + Open History) and OK.
          return (
            <div key={line.key} className="fin-home-line fin-home-line--split">
              {linked ? (
                <button type="button" className="fin-home-main fin-home-line--link" onClick={open}>
                  {content}
                </button>
              ) : (
                <p className="fin-home-main">{content}</p>
              )}
              <button
                type="button"
                className="btn fin-home-ok"
                aria-label={R.OK_ARIA}
                onClick={() => {
                  markSeen(line.ackPairs);
                  onAcknowledged?.();
                }}
              >
                {R.OK}
              </button>
            </div>
          );
        }
        return linked ? (
          <button key={line.key} type="button" className="fin-home-line fin-home-line--link" onClick={open}>
            {content}
          </button>
        ) : (
          <p key={line.key} className="fin-home-line">
            {content}
          </p>
        );
      })}
    </div>
  );
}
