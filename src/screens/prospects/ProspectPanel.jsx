// ProspectPanel.jsx — one child's profile window (rulebook v0.639; approved mockup
// docs/Prospects/TKD-Prospect-Profile-Mockups.html rev 3, screens 3a–3c). It replaced the side
// panel beside the list (v0.236) in November 2026; the file keeps its old name.
// Why it exists: clicking a child in the List or the Board opens everything about them in one big
// window, with what staff need easy to see at a glance:
//   - the window: the dashboard's detail view (the shared Dialog, v0.46) sized for a big record —
//     about 960px wide over the list on a PC, nearly the whole width on a tablet, the whole page
//     with the back arrow on a phone. Its heading is the child's full name ("Ava Nguyen"; children
//     who signed up before last names were asked show their first name, v0.637) with × beside it
//     (PC / tablet); the heading row stays at the top while the window scrolls.
//   - a gray strip with the form the family filled out: its name; "Sent online", "Sent on the
//     kiosk at the desk" or "Entered at the desk by …"; the date, time and school
//   - the age ("7 years old": from the date of birth on the school's today, else the age typed on
//     the form), the status tag button (its menu: stages, a line, side exits — P4 difference 2) and
//     Print with its word on every size (v0.636)
//   - the big progress track (v0.246) and under it the boxes that need staff: Check in on the
//     free-class day, "Did … come?" after it, "Class cancelled — call the family". While a box
//     shows, the track's own "Next:" line is left out (the box says what to do).
//   - then the dashboard's label · value rows (shared.css .ev-sum-row, §1.2 — no boxed cards):
//       Child and family: date of birth, parent or guardian, phone, email, home address (the
//         form's Address answer; "Not asked on this form" when it had no Address question), each
//         brother or sister (opens their own profile); Call / Text / Email open the device's own
//         apps (nothing is sent by the dashboard) — on a PC, Call shows the number large with Copy
//       Form answers: every other question of the form, the question above its answer (two
//         columns; one on phones; a long one takes the whole row)
//       Waiver: Agreed, Date signed (v0.635), the signature picture behind Show signature (each look
//         recorded, v0.242) with how long it is kept, and "Read the waiver" (the text they signed)
//       Free class and follow-up: Follow up as words with a clock — its quick choices and "Pick a
//         date" (P4 difference 3, N6); the free class; Book a free class / Change time / Cancel booking
//       Notes and calls: a note + one-tap follow-up; typed notes always show; the automatic changes
//         sit in a closed "History · 6 changes" row (v0.255)
//       Delete prospect (admins)
//     PC (1024px and wider): two columns — family, answers, waiver on the left; free class and
//     notes on the right. Tablet and phone: one column — family, free class, answers, waiver, notes.
//   - "Hide private details" on (v1.000, v0.639): date of birth, email, home address and every
//     answer read "Hidden on this tablet"; Email and Print gray (still focusable), each with one gray
//     line saying why; Call, Text, the phone, the date signed and Show signature stay.
//   - Print (v0.636): one child prints straight away; with brothers or sisters in the same sign-up a
//     small menu (a sheet on phones) asks "Ava only" or "Ava and Noah · 2 sheets". Each child's
//     profile and the signature are loaded first — loading the signature records a look (printing
//     counts as one) — then PrintSheet.jsx prints one letter page per child.
// Book / Change time, Joined, Delete and the status menu open ON TOP of this window (Prospects.jsx).
// The note being typed lives in Prospects.jsx, so a lock or a brother's profile never loses it.
//
// Props: name (the heading; while loading, the name from the list), detail (null while loading),
//   listItem, statuses, statusById, today, isPc, isWide, isPhone, isAdmin, busy, note, noteWarning,
//   idBase, familyBookingDates (every free-class date of the sign-up, for "Kept until"),
//   printedBy (the signed-in person's name, for "Printed … by …"), banner ({ text } — the
//   section's amber bar, shown at the top of the window while it is open) and onDismissBanner,
//   loadFailed (the words when the first read failed: the bar with Retry instead of "Loading…",
//   pass 2 P-02) and onRetryLoad, onGone (Print found the child deleted elsewhere: Prospects closes
//   the window, pass 2 U-04); a `banner` with `retry` shows Retry (R2-01); and the actions: onNote,
//   onSaveNote, onStatus, onFollowUp, onCheckIn, onBook, onCancelBooking, onOpenSibling, onDelete,
//   onClose (Esc, ×, the back arrow, a click outside), onNoAccess.
import { useEffect, useRef, useState } from 'react';
import {
  IconAlertTriangle, IconCalendarPlus, IconCheck, IconChevronDown, IconChevronRight, IconClipboardText, IconClockEdit, IconClockHour4, IconCopy,
  IconCurrencyDollarOff, IconMail, IconMessage, IconPhone, IconPrinter, IconTrash, IconUserCheck, IconUserX, IconX,
} from '@tabler/icons-react';
import DatePicker, { datePickerOpener } from '../../components/DatePicker.jsx';
import Dialog from '../../components/Dialog.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import IconButton from '../../components/IconButton.jsx';
import Notice from '../../components/Notice.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import { colorOf } from '../../lib/schedule/colors.js';
import { addDays } from '../../lib/schedule/versions.js';
import { longTextProblem } from '../../lib/forms/fields.js';
import { loadSignature } from '../../lib/forms/api.js';
import { getProspect } from '../../lib/prospects/api.js';
import { addressFieldOf, addressLine, answerFieldsOf, childAge, childFullName, freeClassState, isWideAnswer, signatureKeptUntil, waiverFieldOf } from '../../lib/prospects/child.js';
import { HIDDEN_ON_THIS_TABLET, usePrivateDetailsHidden } from '../../lib/privateDetails.js';
import { StatusTag } from './ProspectList.jsx';
import { BigTrack } from './Progress.jsx';
import { localDay, progressOf } from './progress.js';
import PrintSheet from './PrintSheet.jsx';
import * as T from './text.js';

const telOf = (phone) => `tel:${String(phone).replace(/[^0-9+]/g, '')}`;
const smsOf = (phone) => `sms:${String(phone).replace(/[^0-9+]/g, '')}`;

function followUpDate(choice, today, picked) {
  if (choice === 'tomorrow') return addDays(today, 1);
  if (choice === '3') return addDays(today, 3);
  if (choice === 'week') return addDays(today, 7);
  if (choice === 'pick') return picked || null;
  return null;
}

// One label · value row of a detail list (shared.css .ev-sum-row)
function Row({ label, link = false, children }) {
  return (
    <div className={`ev-sum-row${link ? ' is-link' : ''}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// A gray value: "Hidden on this tablet", "Not asked on this form", an empty answer
const Muted = ({ children }) => <span className="pp-hid">{children}</span>;

// Everything inside the window once the child has loaded (a new key for each child, so the menus,
// the signature, the open History and the waiver text start closed again).
function Profile({
  detail: p, listItem, statuses, statusById, today, isPc, isWide, isPhone, isAdmin, busy, note, noteWarning, idBase, familyBookingDates, printedBy,
  onNote, onSaveNote, onStatus, onFollowUp, onCheckIn, onBook, onCancelBooking, onOpenSibling, onDelete, onNoAccess, onGone,
}) {
  // This device's "Hide private details" switch (v0.506; what it hides here: v1.000, v0.639); updates live.
  const [hidden] = usePrivateDetailsHidden();
  const hiddenRef = useRef(hidden);
  const mountedRef = useRef(true);
  useEffect(() => {
    hiddenRef.current = hidden;
  });
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const [showNumber, setShowNumber] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false); // the clipboard refused: a note beside the button (U-05)
  const [sig, setSig] = useState(null); // { loading } | { signature } | { error }
  const [statusMenu, setStatusMenu] = useState(null); // the menu under the status tag
  const [followOpen, setFollowOpen] = useState(false); // the quick follow-up choices
  const [followCal, setFollowCal] = useState(false); // the follow-up calendar ("Pick a date") is open
  const followPickRef = useRef(null); // the "Pick a date" button the calendar opens from
  const [historyOpen, setHistoryOpen] = useState(false); // the automatic changes start closed (v0.255)
  const [waiverOpen, setWaiverOpen] = useState(false); // "Read the waiver"
  const [printMenu, setPrintMenu] = useState(null); // "Ava only" / "Ava and Noah · 2 sheets"
  const [preparing, setPreparing] = useState(false); // loading the pages to print
  const [printError, setPrintError] = useState(null); // { ids } — the amber bar's Retry prints these again
  const [printJob, setPrintJob] = useState(null); // what PrintSheet prints

  // The switch going on (from another tab) closes the Print menu and drops a print that hasn't
  // opened yet (its sheet leaves the page); one still loading stops before it prints (print below).
  useEffect(() => {
    if (!hidden) return;
    setPrintMenu(null);
    setPrintJob(null);
  }, [hidden]);

  const status = statusById.get(p.statusId);
  const builtin = status?.builtin ?? null;
  const b = p.booking;
  const booked = Boolean(b && b.status === 'booked');
  const canCheckIn = booked && b.classRunning && b.date === today && !p.checkedInAt && !['joined', 'not_interested', 'came', 'no_show'].includes(builtin ?? '');
  const askCame = Boolean(listItem?.askCame && !p.checkedInAt);
  const classGone = freeClassState(b) === 'class_gone'; // the same state as the List and the printed sheet (P-01)
  const stages = statuses.filter((s) => s.kind === 'stage');
  const exits = statuses.filter((s) => s.kind === 'exit');
  const age = childAge(p, today);
  const addressField = addressFieldOf(p.fields);
  const waiver = waiverFieldOf(p.fields);
  const answers = answerFieldsOf(p.fields);
  const noteProblem = note.body.trim() ? longTextProblem(note.body.trim(), 1000) : null;
  // The Year lists of the follow-up and note calendars: this year and next (past days are gray).
  const thisYear = Number(today.slice(0, 4));
  const followYears = [thisYear, thisYear + 1];
  const canSaveNote = note.body.trim() !== '' && !noteProblem && !busy && (note.when !== 'pick' || Boolean(note.picked));
  const hiddenValue = <Muted>{HIDDEN_ON_THIS_TABLET}</Muted>;

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(p.parentPhone);
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // never silent (v1.004, U-05): the note stays until a copy works or the number is hidden again
      setCopied(false);
      setCopyFailed(true);
    }
  }
  async function showSignature() {
    setSig({ loading: true });
    const res = await loadSignature(p.familyId); // every look is recorded (v0.242)
    if (!mountedRef.current) return;
    if (res.status === 'no_access') onNoAccess();
    setSig(res.status === 'ok' ? { signature: res.signature } : { error: true });
  }

  // ----- Print (v0.636) -----
  // Loads each child's profile and the family's signature (one look, recorded), then hands the
  // pages to PrintSheet. Nothing prints while private details are hidden.
  const preparingRef = useRef(false); // a second press while the first is still loading does nothing
  async function print(ids) {
    if (hiddenRef.current || preparingRef.current) return;
    preparingRef.current = true;
    setPrintError(null);
    setPreparing(true);
    const loaded = await Promise.all(ids.map((id) => getProspect(id)));
    let failed = loaded.find((r) => r.status !== 'ok') ?? null;
    let signature = null;
    const first = loaded[0]?.prospect;
    if (!failed && first?.signedAt && first.hasSignature) {
      const s = await loadSignature(first.familyId); // brothers and sisters share one sign-up and one signature
      if (s.status === 'ok') signature = s.signature; // null when it was just deleted: "Signed on …"
      else failed = s;
    }
    preparingRef.current = false;
    if (!mountedRef.current) return; // the window closed meanwhile
    setPreparing(false);
    if (failed) {
      if (failed.status === 'no_access') onNoAccess();
      else if (failed.status === 'not_found') onGone?.(); // deleted elsewhere: Retry could never work (pass 2 U-04)
      else setPrintError({ ids });
      return;
    }
    if (hiddenRef.current) return; // the switch went on while the pages loaded
    setPrintJob({ key: Date.now(), children: loaded.map((r) => ({ detail: r.prospect, signature })), today, printedBy });
  }
  const familyIds = [p.id, ...p.siblings.map((s) => s.id)];
  const printOff = hidden || preparing;
  function onPrintClick(event) {
    if (printOff) return; // the gray look: still focusable, pressing it does nothing
    if (p.siblings.length === 0) print([p.id]);
    else setPrintMenu(printMenu ? null : { anchor: event.currentTarget });
  }

  // ----- The parts -----
  const followText = T.followUpText(p.followUpOn, today);
  const addressValue = addressField ? addressLine(p.answers?.[addressField.id]) : '';
  const kept = signatureKeptUntil(familyBookingDates, p.signedAt);
  const sigGone = !p.hasSignature || Boolean(sig && !sig.loading && !sig.error && !sig.signature);
  const answerRows = answers.map((f) => {
    const words = T.answerWords(f, p.answers?.[f.id]);
    return { f, words, wide: isWideAnswer(f, words) };
  });
  // The items in the answers' first row have no line above them (one item, or two narrow ones).
  const topRow = new Set([0]);
  if (answerRows.length > 1 && !answerRows[0].wide && !answerRows[1].wide) topRow.add(1);

  const family = (
    <div className="pp-section">
      <h3 className="pp-sec">{T.HEAD_FAMILY}</h3>
      <dl className="pp-sum">
        <Row label={T.DATE_OF_BIRTH}>{hidden ? hiddenValue : p.childDob ? T.longDate(p.childDob, false) : <Muted>{T.notAskedAge(p.childAge)}</Muted>}</Row>
        <Row label={T.PARENT}>{p.parentName}</Row>
        <Row label={T.PHONE}>{p.parentPhone}</Row>
        <Row label={T.EMAIL}>{hidden ? hiddenValue : p.parentEmail}</Row>
        <Row label={T.HOME_ADDRESS}>{hidden ? hiddenValue : !addressField ? <Muted>{T.NOT_ASKED_ON_FORM}</Muted> : addressValue || <Muted>{T.NONE}</Muted>}</Row>
        {p.siblings.map((s) => {
          // the age from the date of birth on today, like the child's own (the typed age for older sign-ups)
          const line = T.siblingLine(childFullName(s), childAge(s, today), statusById.get(s.statusId)?.name);
          return (
            <Row key={s.id} label={T.SIBLING} link>
              <button type="button" className="pp-link" aria-label={T.openSibling(line)} onClick={(e) => onOpenSibling(s.id, e.currentTarget)}>
                <span className="pp-link-text">{line}</span>
                <IconChevronRight size={16} aria-hidden="true" />
              </button>
            </Row>
          );
        })}
      </dl>
      <div className="pcontact">
        {isPc ? (
          <button type="button" className="btn btn-sm" aria-expanded={showNumber} onClick={() => setShowNumber((x) => !x)}>
            <IconPhone size={16} aria-hidden="true" />
            {T.CALL}
          </button>
        ) : (
          <a className="btn btn-sm" href={telOf(p.parentPhone)}>
            <IconPhone size={16} aria-hidden="true" />
            {T.CALL}
          </a>
        )}
        <a className="btn btn-sm" href={smsOf(p.parentPhone)}>
          <IconMessage size={16} aria-hidden="true" />
          {T.TEXT}
        </a>
        {hidden ? (
          // Private details hidden (v1.000 / D2a): a grayed button that does nothing — never a
          // mailto: link, so the family's address isn't in the page at all (a link shows it on hover).
          // aria-disabled (not disabled) keeps it reachable with Tab, so the reason can be read.
          <button type="button" className="btn btn-sm pemail-off" aria-disabled="true" aria-describedby={`${idBase}-email-off`}>
            <IconMail size={16} aria-hidden="true" />
            {T.EMAIL}
          </button>
        ) : (
          <a className="btn btn-sm" href={`mailto:${p.parentEmail}`}>
            <IconMail size={16} aria-hidden="true" />
            {T.EMAIL}
          </a>
        )}
      </div>
      {hidden && (
        <p className="phidden-line" id={`${idBase}-email-off`}>
          {/* ti-currency-dollar-off = private details hidden (the top bar's chip) */}
          <IconCurrencyDollarOff size={16} aria-hidden="true" />
          {T.EMAIL_OFF_WHILE_HIDDEN}
        </p>
      )}
      {isPc && showNumber && (
        <div className="pbignumber">
          <span className="pbignumber-n">{p.parentPhone}</span>
          <button type="button" className="btn btn-sm" onClick={copyNumber}>
            <IconCopy size={16} aria-hidden="true" />
            {copied ? T.COPIED : T.COPY_NUMBER}
          </button>
          {copyFailed && (
            <div className="pbignumber-fail">
              <Notice>{T.COPY_NUMBER_FAILED}</Notice>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const free = (
    <div className="pp-section">
      <h3 className="pp-sec">{T.HEAD_FREE}</h3>
      <dl className="pp-sum">
        <Row label={T.FOLLOW_UP} link>
          <button
            type="button"
            className="pp-link"
            aria-label={T.followUpButton(followText ? followText.text : T.NONE)}
            aria-expanded={followOpen}
            aria-controls={`${idBase}-follow`}
            disabled={busy}
            onClick={() => {
              setFollowOpen((x) => !x);
              setFollowCal(false);
            }}
          >
            <span className={`pp-link-text${followText?.warn ? ' is-warn' : ''}`}>
              {followText?.warn && <IconAlertTriangle size={16} aria-hidden="true" className="plist-warn" />}
              {followText ? followText.text : T.NONE}
            </span>
            <IconClockHour4 size={16} aria-hidden="true" />
          </button>
        </Row>
      </dl>
      {followOpen && (
        <div id={`${idBase}-follow`} className="pfollow">
          <div className="pwhen" role="group" aria-label={T.FOLLOW_UP}>
            {T.WHEN_OPTIONS.filter(([key]) => key !== 'pick').map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="pwhen-item"
                disabled={busy}
                onClick={() => {
                  setFollowOpen(false);
                  onFollowUp(key === 'none' ? null : followUpDate(key, today, null));
                }}
              >
                {label}
              </button>
            ))}
            {/* "Pick a date" opens the dashboard's calendar (N6) under itself (on phones: in the page,
                under these choices). Picking a day saves it straight away, like the choices beside it. */}
            <button ref={followPickRef} type="button" className="pwhen-item" disabled={busy} {...datePickerOpener(followCal, setFollowCal, { disabled: busy })}>
              {T.WHEN_OPTIONS.find(([key]) => key === 'pick')[1]}
            </button>
          </div>
          <DatePicker
            opener={followPickRef}
            open={followCal}
            onOpenChange={setFollowCal}
            label={T.PICK_DATE}
            value={p.followUpOn ?? null}
            today={today}
            min={today}
            years={followYears}
            hint={T.PAST_DAYS_HINT}
            inline={isPhone}
            disabled={busy}
            onChange={(date) => {
              setFollowCal(false);
              setFollowOpen(false);
              onFollowUp(date);
            }}
          />
        </div>
      )}
      <dl className="pp-sum pp-sum--after">
        <Row label={T.FREE_CLASS}>{booked ? T.classLine(b) : b?.status === 'cancelled' ? `${T.BOOKING_CANCELLED} (${T.classLine(b)})` : T.NO_TIME_YET}</Row>
      </dl>
      {p.checkedInAt && <p className="field-hint pp-line">{T.checkedIn(p.checkedInByName, p.checkedInAt)}</p>}
      {!p.checkedInAt && (
        <div className="pfree-acts">
          {booked ? (
            <>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={onBook}>
                <IconClockEdit size={16} aria-hidden="true" />
                {T.CHANGE_TIME}
              </button>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={onCancelBooking}>
                {T.CANCEL_BOOKING}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={onBook}>
              <IconCalendarPlus size={16} aria-hidden="true" />
              {T.BOOK}
            </button>
          )}
        </div>
      )}
    </div>
  );

  const answersPart = (
    <div className="pp-section">
      <h3 className="pp-sec">
        <span>{T.HEAD_ANSWERS}</span>
        {p.signedUpAt && <span className="pp-sec-hint">{T.asSentOn(localDay(p.signedUpAt))}</span>}
      </h3>
      {answerRows.length === 0 ? (
        <p className="pp-line pp-hid">{T.NO_QUESTIONS}</p>
      ) : (
        <dl className="pp-answers">
          {answerRows.map(({ f, words, wide }, i) => (
            <div key={f.id} className={`pp-answer${wide ? ' is-wide' : ''}${topRow.has(i) ? ' is-top' : ''}`}>
              <dt>{f.label}</dt>
              {/* hidden: every answer, because a form can ask a birthday, an email or health notes (v1.000) */}
              <dd className={hidden || !words ? 'pp-hid' : undefined}>{hidden ? HIDDEN_ON_THIS_TABLET : words || T.NONE}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );

  const waiverPart = (
    <div className="pp-section">
      <h3 className="pp-sec">{T.HEAD_WAIVER}</h3>
      <dl className="pp-sum">
        {waiver ? (
          <>
            <Row label={T.HEAD_WAIVER}>
              {p.answers?.[waiver.id] === true ? (
                <span className="pp-agreed">
                  <IconCheck size={16} aria-hidden="true" />
                  {T.AGREED}
                </span>
              ) : (
                <Muted>{T.NONE}</Muted>
              )}
            </Row>
            <Row label={T.DATE_SIGNED}>{p.signedAt ? T.dayOf(p.signedAt) : <Muted>{T.NONE}</Muted>}</Row>
            {p.signedAt && (
              <Row label={T.SIGNATURE}>
                {sigGone ? (
                  <Muted>{T.signatureGone(Boolean(kept?.afterClass))}</Muted>
                ) : (
                  <>
                    {sig?.signature ? (
                      <img className="psig" src={sig.signature} alt={T.SIGNATURE} />
                    ) : (
                      <button type="button" className="btn btn-sm" disabled={Boolean(sig?.loading)} onClick={showSignature}>
                        {T.SHOW_SIGNATURE}
                      </button>
                    )}
                    {kept && <span className="pp-sig-hint">{T.keptUntil(T.longDate(kept.until, false), kept.afterClass)}</span>}
                    {sig?.error && <Notice>{T.SIGNATURE_FAILED}</Notice>}
                  </>
                )}
              </Row>
            )}
          </>
        ) : (
          <Row label={T.HEAD_WAIVER}>
            <Muted>{T.WAIVER_NOT_ON_FORM}</Muted>
          </Row>
        )}
      </dl>
      {waiver && (
        <>
          <button type="button" className="pp-rowlink" aria-expanded={waiverOpen} aria-controls={`${idBase}-waiver`} onClick={() => setWaiverOpen((x) => !x)}>
            <span>{T.READ_WAIVER}</span>
            {waiverOpen ? <IconChevronDown size={16} aria-hidden="true" /> : <IconChevronRight size={16} aria-hidden="true" />}
          </button>
          {waiverOpen && (
            // the school's own wording as it was signed (the form's fields are kept with the sign-up)
            <div id={`${idBase}-waiver`} className="pp-waiver-text" tabIndex={0} role="region" aria-label={T.WAIVER_TEXT}>
              {waiver.text || T.NONE}
            </div>
          )}
        </>
      )}
    </div>
  );

  const notesPart = (
    <div className="pp-section">
      <h3 className="pp-sec">{T.NOTES}</h3>
      <label className="visually-hidden" htmlFor={`${idBase}-note`}>
        {T.NOTE_LABEL}
      </label>
      <textarea
        id={`${idBase}-note`}
        className="input ctextarea pnote"
        rows={2}
        maxLength={1100}
        placeholder={T.ADD_NOTE}
        value={note.body}
        disabled={busy}
        onChange={(e) => onNote({ body: e.target.value })}
      />
      {note.body.trim() !== '' && (
        <>
          <div className="pwhen" role="radiogroup" aria-label={T.WHEN}>
            {T.WHEN_OPTIONS.map(([key, label]) => (
              <label key={key} className={`pwhen-item${note.when === key ? ' is-on' : ''}`}>
                <input type="radio" name={`${idBase}-when`} className="visually-hidden" checked={note.when === key} onChange={() => onNote({ when: key })} />
                {label}
              </label>
            ))}
          </div>
          {note.when === 'pick' && (
            // The dashboard's own calendar (N6), today or later. The wrapper keeps the old box's gap below.
            <div className="pnote-date">
              <DatePicker
                id={`${idBase}-note-date`}
                label={T.PICK_DATE}
                value={note.picked ?? null}
                today={today}
                min={today}
                years={followYears}
                hint={T.PAST_DAYS_HINT}
                placeholder={T.CHOOSE}
                inline={isPhone}
                onChange={(picked) => onNote({ picked })}
              />
            </div>
          )}
          {noteProblem && <Notice>{T.NOTE_BAD}</Notice>}
          {noteWarning && <Notice>{T.UNSAVED_NOTE}</Notice>}
          <div className="pnote-acts">
            <button type="button" className="btn btn-sm" onClick={() => onNote({ body: '', when: 'tomorrow', picked: null })}>
              {T.CANCEL}
            </button>
            <button
              type="button"
              className={`btn btn-sm btn-primary${canSaveNote ? '' : ' is-unavailable'}`}
              aria-disabled={canSaveNote ? undefined : 'true'}
              onClick={() => canSaveNote && onSaveNote(note.when === 'none' ? { set: true, date: null } : { set: true, date: followUpDate(note.when, today, note.picked) })}
            >
              <IconCheck size={16} aria-hidden="true" />
              {T.SAVE_NOTE}
            </button>
          </div>
        </>
      )}
      {p.notes.length > 0 && (
        <ul className="plog pp-log">
          {[...p.notes].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).map((n) => (
            <li key={n.id} className="plog-item is-note">
              <span className="plog-text">{n.body}</span>
              <span className="plog-meta">{T.whenLine(n.createdAt, n.createdByName)}</span>
            </li>
          ))}
        </ul>
      )}
      {p.activity.length > 0 && (
        <>
          <button type="button" className="pp-rowlink" aria-expanded={historyOpen} aria-controls={`${idBase}-history`} onClick={() => setHistoryOpen((x) => !x)}>
            <span>{T.historyLine(p.activity.length)}</span>
            {historyOpen ? <IconChevronDown size={16} aria-hidden="true" /> : <IconChevronRight size={16} aria-hidden="true" />}
          </button>
          {historyOpen && (
            <ul className="plog" id={`${idBase}-history`} aria-label={T.HISTORY}>
              {[...p.activity].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).map((a, i) => (
                <li key={i} className="plog-item">
                  <span className="plog-text">{T.activityText(a)}</span>
                  <span className="plog-meta">{T.whenLine(a.createdAt, a.createdByName)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );

  const deletePart = isAdmin && (
    <button type="button" className="btn btn-sm sdialog-remove pdelete" disabled={busy} onClick={onDelete}>
      <IconTrash size={16} aria-hidden="true" />
      {T.DELETE_PROSPECT}
    </button>
  );

  return (
    <>
      {/* The form they filled out (v0.639): name; how and when it was sent; the school */}
      <div className="pp-strip">
        <IconClipboardText size={20} aria-hidden="true" />
        <div className="pp-strip-text">
          <p className="pp-strip-form">{p.formName}</p>
          <p className="pp-strip-sent">{T.stripLine(T.sentHow(p), T.dayOf(p.signedUpAt), T.clockOf(p.signedUpAt), T.SCHOOL_NAME[p.locationCode])}</p>
        </div>
      </div>

      <div className="pp-meta">
        {age !== null && <span>{T.yearsOld(age)}</span>}
        <button
          type="button"
          className="pstatus-btn"
          aria-haspopup="menu"
          aria-expanded={statusMenu ? 'true' : 'false'}
          aria-label={T.statusButton(status?.name ?? '')}
          disabled={busy}
          onClick={(e) => setStatusMenu(statusMenu ? null : { anchor: e.currentTarget })}
        >
          <StatusTag status={status} />
          <IconChevronDown size={16} aria-hidden="true" />
        </button>
        {builtin === 'joined' && p.joinedOn && <span className="field-hint">{T.joinedLine(p.joinedOn)}</span>}
        <span className="pp-grow" />
        {/* Print (v0.636): grayed but still focusable while private details are hidden (the line
            under it says why) and while the pages are being prepared */}
        <button
          type="button"
          className={`btn btn-sm${printOff ? ' is-unavailable' : ''}`}
          aria-disabled={printOff ? 'true' : undefined}
          aria-describedby={hidden ? `${idBase}-print-off` : undefined}
          aria-haspopup={p.siblings.length > 0 ? 'menu' : undefined}
          aria-expanded={p.siblings.length > 0 ? (printMenu ? 'true' : 'false') : undefined}
          onClick={onPrintClick}
        >
          {/* ti-printer = print */}
          <IconPrinter size={16} aria-hidden="true" />
          {preparing ? T.PRINT_PREPARING : T.PRINT}
        </button>
      </div>
      {hidden && (
        <p className="phidden-line pp-print-off" id={`${idBase}-print-off`}>
          <IconCurrencyDollarOff size={16} aria-hidden="true" />
          <span>{T.PRINT_OFF_WHILE_HIDDEN}</span>
        </p>
      )}
      {printError && (
        <div className="pp-banner">
          <ErrorBanner text={T.PRINT_FAILED} onRetry={() => print(printError.ids)} onDismiss={() => setPrintError(null)} />
        </div>
      )}

      {/* The track; under it, the box that needs staff (then the box says what's next, not the track) */}
      <BigTrack progress={progressOf({ ...p, askCame }, status, today)} showNext={!canCheckIn && !askCame && !classGone} />
      {canCheckIn && (
        <div className="pask">
          <b>{T.freeToday(b)}</b>
          <div className="pask-row">
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onCheckIn(true, false)}>
              <IconUserCheck size={16} aria-hidden="true" />
              {T.CHECK_IN}
            </button>
          </div>
        </div>
      )}
      {askCame && (
        <div className="pask">
          <p>
            <b>{T.didCome(p.childFirstName)}</b> <span className="field-hint">{T.classLine(b)}</span>
          </p>
          <div className="pask-row">
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onCheckIn(true, true)}>
              <IconUserCheck size={16} aria-hidden="true" />
              {T.CAME}
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onCheckIn(false, true)}>
              <IconUserX size={16} aria-hidden="true" />
              {T.NO_SHOW}
            </button>
          </div>
        </div>
      )}
      {classGone && (
        <div className="pp-gone">
          <IconAlertTriangle size={16} aria-hidden="true" />
          <p className="pp-gone-text">
            <b>{T.CLASS_GONE}</b> <span>{T.classLine(b)}</span>
          </p>
        </div>
      )}

      {/* PC: two columns. Tablet and phone: one column, the free class right after the family. */}
      {isWide ? (
        <div className="pp-cols">
          <div className="pp-col">
            {family}
            {answersPart}
            {waiverPart}
          </div>
          <div className="pp-col">
            {free}
            {notesPart}
            {deletePart}
          </div>
        </div>
      ) : (
        <>
          {family}
          {free}
          {answersPart}
          {waiverPart}
          {notesPart}
          {deletePart}
        </>
      )}

      {statusMenu && (
        <RowMenu
          anchor={statusMenu.anchor}
          isSheet={isPhone}
          title={T.STATUS}
          subtitle={age !== null ? `${p.childFirstName}, ${age}` : p.childFirstName}
          label={T.STATUS}
          items={[...stages, ...exits].map((s, i) => ({
            key: s.id,
            label: s.id === p.statusId ? `${s.name} ${T.CURRENT}` : s.name,
            Icon: s.id === p.statusId ? IconCheck : ({ className }) => <i className={`pdot-menu ${className ?? ''}`} style={{ background: colorOf(s.color).edge }} aria-hidden="true" />,
            separatorBefore: i === stages.length && exits.length > 0,
            // the Status button, so a dialog this opens (Joined) gives focus back to it
            onSelect: () => s.id !== p.statusId && onStatus(s.id, statusMenu.anchor),
          }))}
          onClose={(reason) => {
            const el = statusMenu.anchor;
            setStatusMenu(null);
            if (reason === 'escape' || reason === 'tab') el?.focus();
          }}
        />
      )}
      {printMenu && (
        <RowMenu
          anchor={printMenu.anchor}
          isSheet={isPhone}
          title={T.PRINT}
          subtitle={age !== null ? `${p.childFirstName}, ${age}` : p.childFirstName}
          label={T.PRINT}
          items={[
            { key: 'one', label: T.printOnly(p.childFirstName), Icon: IconPrinter, onSelect: () => print([p.id]) },
            { key: 'family', label: T.printFamily([p.childFirstName, ...p.siblings.map((s) => s.childFirstName)]), Icon: IconPrinter, onSelect: () => print(familyIds) },
          ]}
          onClose={(reason) => {
            const el = printMenu.anchor;
            setPrintMenu(null);
            if (reason !== 'outside') el?.focus();
          }}
        />
      )}
      {printJob && <PrintSheet key={printJob.key} job={printJob} onDone={() => setPrintJob(null)} />}
    </>
  );
}

export default function ProspectPanel(props) {
  // loadFailed: the words when the first read failed (pass 2 P-02) — the shared amber bar with
  // Retry (onRetryLoad) shows in place of "Loading…", as in Black Belt's candidate window
  const { name, detail, isPhone, onClose, banner = null, onDismissBanner, loadFailed = null, onRetryLoad, busy = false } = props;
  // A problem while the window is open (a save refused, someone else's change — v1.004's amber bar)
  // shows at the top of the window's body: the page's own bar would be hidden behind the window.
  // When it appears, it is scrolled into view (under the heading row that stays on top); like the
  // page's bar it never takes the focus — its role="alert" has screen readers read it out.
  const barRef = useRef(null);
  useEffect(() => {
    if (banner) barRef.current?.scrollIntoView({ block: 'nearest' });
  }, [banner]);
  return (
    // The shared detail view (v0.46). className: the profile's own size and heading row (prospects.css).
    // ariaLabel names the window; the box's own heading is replaced by the row below (PC / tablet).
    <Dialog title={name} ariaLabel={name} className="pp-dialog" fullScreen={isPhone} onRequestClose={onClose}>
      {!isPhone && (
        <div className="pp-head">
          {/* focused when the window opens (data-autofocus) and when a brother or sister opens in it */}
          <h2 className="pp-name" tabIndex={-1} data-autofocus data-profile-heading>
            {name}
          </h2>
          <IconButton label={T.CLOSE_PANEL} Icon={IconX} onClick={onClose} />
        </div>
      )}
      <div className="pp-body">
        {banner && (
          <div ref={barRef} className="pp-window-bar">
            {/* a bar with `retry` gets Retry, which repeats the same call (v1.004, R2-01) */}
            <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={busy} onDismiss={onDismissBanner} />
          </div>
        )}
        {detail ? (
          <Profile key={detail.id} {...props} />
        ) : loadFailed ? (
          <div className="pp-window-bar">
            <ErrorBanner text={loadFailed} onRetry={onRetryLoad} />
          </div>
        ) : (
          <p className="pp-loading" aria-busy="true">
            {T.LOADING_PANEL}
          </p>
        )}
      </div>
    </Dialog>
  );
}
