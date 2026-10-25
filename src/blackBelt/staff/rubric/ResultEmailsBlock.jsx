// ResultEmailsBlock.jsx — the always-open "Result emails" block on Black Belt testing → Rubric and
// prices, between the Keeping block and the Default rubric card (migration 0025, contract 0025
// §14.4; approved Results mockup R03, proposals 21–28).
// Why it exists: admins choose the wording of the three result emails that Email result copies on
// a cycle's Results tab. Staff see the same block READ-ONLY — they send these emails, so they can
// read what goes out; the tab's "View only. Ask an admin to make changes." line already covers them.
// Copied from Star's ResultEmailsBlock.jsx, with Black Belt's names:
//   - the head "Result emails" and the gray line under it
//   - "Subject": the fixed subject line, as plain text, with "the same for every email; it can’t be
//     changed." (it goes into the email link, so it never carries a name or a result)
//   - one row per email (Passed · Make-up with a D · Make-up below the pass mark) with the START of
//     its text (PC / tablet: one line, cut with "…"; phone: up to two lines under the name) and an
//     Edit icon (ti-edit) for admins
//   - the foot line: Email result uses the text as it is when it's clicked
// It is self-contained, so Rubric and prices only needs to place it: it loads the texts on its own
// (a problem reading them shows only here — the waiver, keeping and rubric blocks keep working),
// keeps the "Edit result email" dialog's typing (so a screen lock while it is open brings it back
// with the text still there), saves with the version the dialog opened with, and shows the toast
// "Result email saved" with Undo (the old text saved back with the NEW version). A text change never
// resets "Sent" on the Results tab.
// PLAIN TEXT ONLY: the texts are whatever an admin typed (they may hold < > &), so they are shown
// as React text — never as HTML.
//
// Props: isAdmin, isPhone, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast,
//        onModalChange(open) — true while its dialog is open (Rubric and prices makes the page inert)
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconEdit } from '@tabler/icons-react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import IconButton from '../../../components/IconButton.jsx';
import { loadResultTexts, setResultText } from '../../../lib/blackBelt/gradingApi.js';
import { RESULT_KINDS, RESULT_SUBJECT, resultTextProblem } from '../../../lib/blackBelt/resultEmail.js';
import { TOUCH_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../screens/testing/events/useLiveLoad.js';
import ResultTextDialog from './ResultTextDialog.jsx';
import * as T from '../results/text.js';
import '../results/results.css';

const LIVE_KEY = 'black-belt-result-texts';
const load = () => loadResultTexts();
// The start of a text on one line: line breaks and runs of spaces become one space.
const oneLine = (body) => String(body ?? '').replace(/\s+/g, ' ').trim();
const editButtonOf = (kind) => document.querySelector(`[data-bbrem-edit="${kind}"]`);

export default function ResultEmailsBlock({ isAdmin, isPhone, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalChange }) {
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const live = useLiveLoad({ key: LIVE_KEY, enabled: !screenLocked, load, refreshMs: LIVE_REFRESH_MS });
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });
  const texts = live.data?.texts ?? null;
  const [dialog, setDialog] = useState(null); // { key, kind, body, initialBody, snapshot, note, saving, blocked, opener }
  const dialogRef = useRef(dialog);
  useLayoutEffect(() => {
    dialogRef.current = dialog;
  });
  const [banner, setBanner] = useState(null); // an Undo that didn't work: { text, retry? }
  const busyRef = useRef(false);

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);
  const open = dialog !== null && !screenLocked;
  useEffect(() => {
    onModalChange?.(open);
  }, [open, onModalChange]);
  useEffect(() => () => onModalChange?.(false), [onModalChange]);

  function focusLater(getTarget) {
    let tries = 0;
    const tryFocus = () => {
      const target = getTarget();
      if (target && target.closest('[inert]') && tries++ < 30) window.requestAnimationFrame(tryFocus);
      else target?.focus();
    };
    window.requestAnimationFrame(tryFocus);
  }

  // ----- The dialog -----
  function openText(kind, opener) {
    const record = texts?.[kind];
    if (!isAdmin || !record) return;
    setDialog({ key: Date.now(), kind, body: record.body, initialBody: record.body, snapshot: record, note: null, saving: false, blocked: false, opener });
  }
  function patch(p) {
    setDialog((current) => (current ? { ...current, ...p } : current));
  }
  function close() {
    const d = dialogRef.current;
    setDialog(null);
    if (d) focusLater(() => (d.opener?.isConnected ? d.opener : editButtonOf(d.kind)));
  }
  function cancel() {
    if (dialogRef.current?.saving) return;
    close();
  }
  // Esc, a click on the dim backdrop, the back arrow or the browser's Back: close only if nothing
  // was typed; otherwise "Unsaved changes. Save or cancel first."
  function requestClose() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    if (d.body === d.initialBody) close();
    else if (!d.blocked) patch({ note: 'UNSAVED' });
  }
  function change(body) {
    setDialog((current) => {
      if (!current || current.saving) return current;
      // Typing again clears "Unsaved changes" / "didn't save" (but not the blocking notes).
      const note = current.blocked ? current.note : null;
      return { ...current, body, note };
    });
  }

  async function save() {
    const d = dialogRef.current;
    if (!d || d.saving || d.blocked || resultTextProblem(d.kind, d.body) !== null) return;
    if (d.body === d.snapshot.body) {
      close(); // nothing changed: no call, no toast
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    patch({ saving: true, note: null });
    const answer = await setResultText({ kind: d.kind, expectedVersion: d.snapshot.version, body: d.body });
    busyRef.current = false;
    if (answer.status === 'ok') {
      const opened = d.snapshot;
      close();
      liveRef.current.reload();
      showToast(T.RESULT_TEXT_SAVED, {
        icon: false,
        action: { label: T.UNDO, onAction: () => undo(d.kind, answer.version, opened.body) },
      });
      return;
    }
    clearToast();
    if (answer.status === 'no_access') {
      patch({ saving: false });
      onNoAccess(); // the screen locks; the dialog comes back after unlocking
    } else if (answer.status === 'not_allowed') {
      patch({ saving: false, note: 'NOT_ALLOWED', blocked: true });
      onRefreshProfile?.();
    } else if (answer.status === 'stale' || answer.status === 'not_found') {
      patch({ saving: false, note: 'STALE', blocked: true });
      liveRef.current.reload();
    } else if (answer.status === 'invalid') {
      patch({ saving: false, note: 'INVALID' });
    } else {
      patch({ saving: false, note: 'SAVE_FAILED' }); // the connection: Save stays available
    }
  }

  // The toast's Undo: the old text back, with the version the save answered.
  async function undo(kind, version, body) {
    if (busyRef.current) return;
    busyRef.current = true;
    const answer = await setResultText({ kind, expectedVersion: version, body });
    busyRef.current = false;
    if (answer.status === 'ok') {
      setBanner(null);
      showToast(T.TOAST_UNDONE, { icon: false });
    } else if (answer.status === 'no_access') {
      onNoAccess();
    } else if (answer.status === 'not_allowed') {
      setBanner({ text: T.TEXT_NOT_ALLOWED });
      onRefreshProfile?.();
    } else if (['stale', 'not_found', 'invalid'].includes(answer.status)) {
      setBanner({ text: T.UNDO_STALE });
    } else {
      setBanner({ text: T.UNDO_FAILED, retry: () => undo(kind, version, body) });
    }
    liveRef.current.reload();
  }

  // ----- Drawing -----
  const rowClass = (extra = '') => `bbrem-row${isPhone ? ' is-phone' : isTouch ? ' is-touch' : ''}${isAdmin ? '' : ' is-staff'}${extra}`;
  let rows;
  if (!texts && (live.status === 'loading' || live.status === 'idle')) {
    rows = (
      <div className="tskeleton" aria-busy="true">
        {RESULT_KINDS.map((kind) => (
          <div key={kind} className="tskeleton-row bbrem-skel" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (!texts) {
    rows = (
      <div className="bbrem-error">
        <ErrorBanner text={T.TEXTS_LOAD_FAILED} onRetry={() => liveRef.current.reload()} />
      </div>
    );
  } else {
    rows = RESULT_KINDS.map((kind) => {
      const name = T.KIND_NAME[kind];
      const start = oneLine(texts[kind]?.body);
      const selected = dialog?.kind === kind && !screenLocked;
      return (
        <div key={kind} className={rowClass(selected ? ' is-selected' : '')}>
          {isPhone ? (
            <span className="bbrem-main">
              <b>{name}</b>
              <span className="bbrem-text">{start}</span>
            </span>
          ) : (
            <>
              <span>
                <b>{name}</b>
              </span>
              <span className="bbrem-text">{start}</span>
            </>
          )}
          {isAdmin && (
            <span className="bbrem-edit">
              <IconButton label={T.editTextLabel(kind)} Icon={IconEdit} data-bbrem-edit={kind} onClick={(event) => openText(kind, event.currentTarget)} />
            </span>
          )}
        </div>
      );
    });
  }

  return (
    <section className="bb-block bbrem" aria-labelledby="bbrem-title">
      <div className="bb-block-head">
        <h2 id="bbrem-title" className="bb-block-title">
          {T.RESULT_EMAILS_TITLE}
        </h2>
      </div>
      <p className="bbrem-sub">{T.RESULT_EMAILS_SUB}</p>
      {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} onDismiss={() => setBanner(null)} />}
      {/* The subject line: fixed in the app, never stored */}
      <div className={rowClass()}>
        {isPhone ? (
          <span className="bbrem-main">
            <b>{T.SUBJECT_LABEL}</b>
            <span className="bbrem-text bbrem-text--subject">
              {RESULT_SUBJECT}
              <br />
              {T.SUBJECT_FIXED_NOTE}
            </span>
          </span>
        ) : (
          <>
            <span>
              <b>{T.SUBJECT_LABEL}</b>
            </span>
            <span className="bbrem-subject">
              {RESULT_SUBJECT} <span className="bbrem-muted">· {T.SUBJECT_FIXED_NOTE_INLINE}</span>
            </span>
          </>
        )}
        {isAdmin && <span aria-hidden="true" />}
      </div>
      {rows}
      <p className="bbrem-foot">{T.TEXTS_USED_WHEN_CLICKED}</p>
      {dialog && !screenLocked && (
        <ResultTextDialog
          key={dialog.key}
          state={dialog}
          record={texts?.[dialog.kind] ?? dialog.snapshot}
          isPhone={isPhone}
          isTouch={isTouch}
          onChange={change}
          onSave={save}
          onCancel={cancel}
          onRequestClose={requestClose}
          onNoAccess={onNoAccess}
        />
      )}
    </section>
  );
}
