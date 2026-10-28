// ProspectPanel.jsx — one prospect, beside the list (mockup screens 1, 3, 4, 5, 10).
// Why it exists: everything staff need while calling a family:
//   - Call / Text / Email open the device's own apps (nothing is sent by the dashboard); on a PC,
//     Call shows the number large with Copy
//   - Check in on the free-class day, or "Did … come?" Came / No-show after the class
//   - The big progress track at the top: Signed up → Class booked → Came → Joined with dates,
//     and a "Next:" line (v0.246)
//   - Status: the colored tag with a chevron opens a menu (stages, then side exits; P4 difference 2)
//   - Follow up: the date as words ("Today", "Overdue · Oct 16") with a clock; click for the quick
//     choices Tomorrow / In 3 days / Next week / Pick a date / No follow-up (P4 difference 3)
//   - Free class: the time, amber "Class cancelled — call the family" when it no longer runs,
//     Book a free class / Change time / Cancel booking (v0.244 answer 2)
//   - Siblings (same sign-up), Notes and calls (a note + one-tap follow-up); the notes people
//     typed always show, the automatic changes (status, follow-up, booking, sign-up) sit in a
//     closed "History · 6 changes" dropdown (v0.255)
//   - Form answers and waiver: every answer as the form was, and the signature picture while it
//     is kept (each look recorded), then "signed on <date>" (v0.242)
//   - While this device's "Hide private details" switch is on (v1.000, D2a): Email grays with one
//     line saying why, and every form answer reads "Hidden on this tablet"; Call, Text and the
//     phone number stay (N17)
// PC: a column beside the list; tablet upright: under the list; phone: a full-screen page
// (Prospects.jsx wraps it in a Dialog). The note being typed lives in Prospects.jsx.
import { useState } from 'react';
import {
  IconAlertTriangle, IconCalendarPlus, IconCheck, IconChevronDown, IconChevronRight, IconClockEdit, IconClockHour4, IconCopy, IconCurrencyDollarOff, IconMail, IconMessage,
  IconPhone, IconTrash, IconUserCheck, IconUserX, IconX,
} from '@tabler/icons-react';
import Notice from '../../components/Notice.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import { colorOf } from '../../lib/schedule/colors.js';
import { addDays } from '../../lib/schedule/versions.js';
import { longTextProblem } from '../../lib/forms/fields.js';
import { loadSignature } from '../../lib/forms/api.js';
import { StatusTag } from './ProspectList.jsx';
import { BigTrack } from './Progress.jsx';
import { localDay, progressOf } from './progress.js';
import { HIDDEN_ON_THIS_TABLET, usePrivateDetailsHidden } from '../../lib/privateDetails.js';
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

function answerText(f, v) {
  if (v === undefined || v === null || v === '') return T.NONE;
  if (Array.isArray(v)) return v.join(', ');
  if (v === true) return 'Yes';
  return String(v);
}

export default function ProspectPanel({
  detail, listItem, statuses, statusById, today, isPc, isPhone, isAdmin, busy, note, idBase,
  onNote, onSaveNote, onStatus, onFollowUp, onCheckIn, onBook, onCancelBooking, onOpenSibling, onDelete, onClose, noteWarning,
}) {
  const p = detail;
  // This device's "Hide private details" switch (v0.506; what it hides here: v1.000); updates live.
  const [hidden] = usePrivateDetailsHidden();
  const [showNumber, setShowNumber] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openAnswers, setOpenAnswers] = useState(false);
  const [sig, setSig] = useState(null); // { loading } | { signature, signedAt } | { error }
  const [statusMenu, setStatusMenu] = useState(null); // the ⋯-style menu under the status tag
  const [followOpen, setFollowOpen] = useState(false); // the quick follow-up choices
  const [followPick, setFollowPick] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false); // the automatic changes start closed (v0.255)
  const status = statusById.get(p.statusId);
  const builtin = status?.builtin ?? null;
  const b = p.booking;
  const booked = b && b.status === 'booked';
  const canCheckIn = booked && b.classRunning && b.date === today && !p.checkedInAt && !['joined', 'not_interested', 'came', 'no_show'].includes(builtin ?? '');
  const askCame = listItem?.askCame && !p.checkedInAt;
  const stages = statuses.filter((s) => s.kind === 'stage');
  const exits = statuses.filter((s) => s.kind === 'exit');
  const answers = p.fields.filter((f) => !['heading', 'step', 'children', 'booking', 'waiver', 'parent_name', 'parent_phone', 'parent_email'].includes(f.type));
  const noteProblem = note.body.trim() ? longTextProblem(note.body.trim(), 1000) : null;
  const canSaveNote = note.body.trim() !== '' && !noteProblem && !busy && (note.when !== 'pick' || Boolean(note.picked));

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(p.parentPhone);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  async function showSignature() {
    setSig({ loading: true });
    const res = await loadSignature(p.familyId);
    setSig(res.status === 'ok' ? { signature: res.signature, signedAt: res.signedAt } : { error: true });
  }

  return (
    // Esc anywhere in the panel closes it (PC / tablet; the phone page has its own back arrow)
    <div className="ppanel" onKeyDown={(e) => {
      if (e.key === 'Escape' && onClose && !e.defaultPrevented && !e.target.closest('select')) {
        e.preventDefault();
        onClose();
      }
    }}>
      <div className="ppanel-top">
        <h2 className="ppanel-name" tabIndex={-1} data-panel-heading>
          {p.childFirstName}, {p.childAge}
        </h2>
        {onClose && (
          <button type="button" className="icon-button" aria-label={T.CLOSE_PANEL} onClick={onClose}>
            <IconX size={20} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="ppanel-who">
        {p.parentName} · {T.fromForm(p.formName, localDay(p.signedUpAt))}
        {p.enteredBy && ` · ${T.enteredBy(p.enteredBy)}`}
      </p>
      <BigTrack progress={progressOf({ ...p, askCame: Boolean(askCame) }, status, today)} />

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
        </div>
      )}

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
          <b>{T.didCome(p.childFirstName)}</b>
          <span className="field-hint">{T.classLine(b)}</span>
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

      <div className="pkv">
        <span className="pkv-k" id={`${idBase}-status-k`}>
          {T.STATUS}
        </span>
        <span className="pkv-v">
          <button
            type="button"
            className="pstatus-btn"
            aria-haspopup="menu"
            aria-expanded={statusMenu ? 'true' : 'false'}
            aria-labelledby={`${idBase}-status-k ${idBase}-status-v`}
            disabled={busy}
            onClick={(e) => setStatusMenu(statusMenu ? null : { anchor: e.currentTarget })}
          >
            <span id={`${idBase}-status-v`}>
              <StatusTag status={status} />
            </span>
            <IconChevronDown size={16} aria-hidden="true" />
          </button>
        </span>
      </div>
      {statusMenu && (
        <RowMenu
          anchor={statusMenu.anchor}
          isSheet={isPhone}
          title={T.STATUS}
          subtitle={`${p.childFirstName}, ${p.childAge}`}
          label={T.STATUS}
          items={[...stages, ...exits].map((s, i) => ({
            key: s.id,
            label: s.id === p.statusId ? `${s.name} ${T.CURRENT}` : s.name,
            Icon: s.id === p.statusId ? IconCheck : ({ className }) => <i className={`pdot-menu ${className ?? ''}`} style={{ background: colorOf(s.color).edge }} aria-hidden="true" />,
            separatorBefore: i === stages.length && exits.length > 0,
            onSelect: () => s.id !== p.statusId && onStatus(s.id),
          }))}
          onClose={(reason) => {
            const el = statusMenu.anchor;
            setStatusMenu(null);
            if (reason === 'escape' || reason === 'tab') el?.focus();
          }}
        />
      )}
      {builtin === 'joined' && p.joinedOn && <p className="field-hint pkv-note">{T.joinedLine(p.joinedOn)}</p>}
      <button
        type="button"
        className="pkv pkv-btn"
        aria-expanded={followOpen}
        aria-controls={`${idBase}-follow`}
        disabled={busy}
        onClick={() => setFollowOpen((x) => !x)}
      >
        <span className="pkv-k">{T.FOLLOW_UP}</span>
        {(() => {
          const f = T.followUpText(p.followUpOn, today);
          return (
            <span className={`pkv-v${f?.warn ? ' is-warn' : ''}`}>
              {f?.warn && <IconAlertTriangle size={16} aria-hidden="true" className="plist-warn" />}
              {f ? f.text : T.NONE}
            </span>
          );
        })()}
        <IconClockHour4 size={16} aria-hidden="true" />
      </button>
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
          </div>
          <span className="pfollow-pick">
            <input className="input" type="date" aria-label={T.PICK_DATE} min={today} value={followPick} onChange={(e) => setFollowPick(e.target.value)} />
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy || !followPick}
              onClick={() => {
                setFollowOpen(false);
                onFollowUp(followPick);
                setFollowPick('');
              }}
            >
              {T.SET_DATE}
            </button>
          </span>
        </div>
      )}

      <div className="pkv pkv--block">
        <span className="pkv-k">{T.FREE_CLASS}</span>
        <span className="pkv-v">
          {booked ? T.classLine(b) : b?.status === 'cancelled' ? `${T.BOOKING_CANCELLED} (${T.classLine(b)})` : T.NO_TIME_YET}
        </span>
      </div>
      {booked && !b.classRunning && (
        <div className="pwarn">
          <IconAlertTriangle size={16} aria-hidden="true" />
          <span>{T.CLASS_GONE}</span>
        </div>
      )}
      {p.checkedInAt && <p className="field-hint pkv-note">{T.checkedIn(p.checkedInByName, p.checkedInAt)}</p>}
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

      <div className="pkv">
        <span className="pkv-k">{T.PHONE}</span>
        <span className="pkv-v">{p.parentPhone}</span>
      </div>
      {p.siblings.map((s) => (
        <button key={s.id} type="button" className="pkv pkv-btn" onClick={(e) => onOpenSibling(s.id, e.currentTarget)}>
          <span className="pkv-k">{T.SIBLINGS}</span>
          <span className="pkv-v">
            {s.childFirstName}, {s.childAge} · {statusById.get(s.statusId)?.name}
          </span>
          <IconChevronRight size={16} aria-hidden="true" />
        </button>
      ))}

      <h3 className="psec">{T.NOTES}</h3>
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
            <input className="input pnote-date" type="date" aria-label={T.PICK_DATE} min={today} value={note.picked ?? ''} onChange={(e) => onNote({ picked: e.target.value })} />
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
        <ul className="plog">
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
          <button type="button" className="pkv pkv-btn phistory-btn" aria-expanded={historyOpen} aria-controls={`${idBase}-history`} onClick={() => setHistoryOpen((x) => !x)}>
            <span className="pkv-v phistory-label">{T.historyLine(p.activity.length)}</span>
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

      <h3 className="psec">{T.FORM_AND_WAIVER}</h3>
      <button type="button" className="pkv pkv-btn" aria-expanded={openAnswers} onClick={() => setOpenAnswers((x) => !x)}>
        <span className="pkv-v">
          {T.answersLine(answers.length)} · {T.signedLine(p.signedAt, p.hasSignature)}
        </span>
        {openAnswers ? <IconChevronDown size={16} aria-hidden="true" /> : <IconChevronRight size={16} aria-hidden="true" />}
      </button>
      {openAnswers && (
        <div className="panswers">
          <dl>
            {answers.map((f) => (
              <div key={f.id} className="panswer">
                <dt>{f.label}</dt>
                {/* hidden: every answer, because a form can ask a birthday, an email or health notes (v1.000) */}
                <dd className={hidden ? 'panswer-hidden' : undefined}>{hidden ? HIDDEN_ON_THIS_TABLET : answerText(f, p.answers[f.id])}</dd>
              </div>
            ))}
          </dl>
          {p.signedAt && (p.hasSignature ? (
            sig?.signature ? (
              <img className="psig" src={sig.signature} alt={T.SIGNATURE} />
            ) : (
              <button type="button" className="btn btn-sm" disabled={sig?.loading} onClick={showSignature}>
                {T.SHOW_SIGNATURE}
              </button>
            )
          ) : (
            <p className="field-hint">{T.SIGNATURE_GONE}</p>
          ))}
          {sig?.error && <Notice>{T.SAVE_FAILED}</Notice>}
        </div>
      )}

      {isAdmin && (
        <button type="button" className="btn sdialog-remove pdelete" disabled={busy} onClick={onDelete}>
          <IconTrash size={16} aria-hidden="true" />
          {T.DELETE_PROSPECT}
        </button>
      )}
    </div>
  );
}
