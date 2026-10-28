// CompareDialog.jsx — "Mia Lopez is registered twice": the two registrations side by side
// (design review M1, rulebook v1.102; Star v0.114 first).
// Why it exists: Color Belt, Star, Camps and Black Belt each had their own copy of one design.
// Before deciding, staff look at both registrations next to each other:
//   - "Keep this one" under each: the section moves the OTHER one to Removed (its own words say how)
//   - "Not the same person — keep both"
//   - Close (PC / tablet; the first focus): nothing changes. Phones: a full-screen page with ←.
// What this shared copy adds (approved in the mockup, v1.102):
//   (a) a difference is amber AND says "⚠ different" next to each differing value, for everyone
//       (Black Belt's mark; rule §4, never color alone);
//   (b) while it works the pressed button says "Keeping…" ("Keeping both…") and every button grays
//       until it's done; Esc, a click outside and Back wait, so the phone's back arrow grays too;
//   - the buttons and any note under them share the dialog's bottom area (.dialog-footer, v0.81),
//     so a failure note is never hidden under the pinned buttons; it stays until the dialog closes;
//   - with Hide private details on, the rows the section marks `hidden` read gray "Hidden on this
//     tablet" on both sides and are never marked different;
//   - Star's records load when Review is pressed: gray placeholder rows meanwhile; if they can't
//     load, the shared amber bar with Retry takes the table's place.
// The section builds the rows (its words, its order) and keeps its own rule for who may keep one.
// Nothing switches to it in Dashboard core step 1; each section does, in its own prompt.
//
// Props:
//   title          "Mia Lopez is registered twice" (the section's noun)
//   sub            the gray line under it ("Same name in the same class. Differences are highlighted.")
//   heads          the two column names ['First registration', 'Second registration']
//   rows           [{ key?, label, first, second, plain?, hidden? }] in the section's order:
//                    plain  never marked different (e.g. the date registered, the reference)
//                    hidden Hide private details is on: both sides read "Hidden on this tablet"
//   canKeepOne     false: no Keep this one buttons (staff after the testing day). Default true
//   note           the gray line under the table (what Keep this one does, or who can do it)
//   keepLabel      optional (which) => screen-reader name of a Keep this one; `which` is that
//                  column's name. Default "Keep this one: First registration". A section's own name
//                  must contain the visible words "Keep this one" (WCAG 2.5.3, label in name: a voice
//                  user says what they see). While that button says "Keeping…" it has no separate
//                  name, so screen readers hear the busy words.
//   loading        true while the two records load (Star): gray placeholder rows
//   loadError      the section's words when they couldn't load (amber bar with Retry), or null
//   onRetry        Retry on that bar
//   busy           'keep-first' | 'keep-second' | 'keep-both' | null — what is being saved
//   failed         the section's amber words after a failed save, or null
//   blockingNote   the section's amber words when nothing may be kept now (Black Belt's "These
//                  registrations changed just now. Close and open them again."): every button but
//                  Close grays
//   hiddenText     optional: the words a hidden value shows; default "Hidden on this tablet"
//   onKeep(index)  Keep this one under column 0 or 1
//   onKeepBoth()   Not the same person — keep both
//   onClose()      Close / ← / Esc / a click outside / Back (ignored while busy)
//   isPhone        true on phones (the full-screen page with one card per registration)
//   onTop          optional: true when it opens on top of another dialog (Dialog.jsx, v1.100)
//   returnFocusTo  optional, with onTop: the button that opened it (DuplicateBox's onReview gets
//                  it), so focus goes back there when it closes — also in Safari / iPadOS
import { IconAlertTriangle } from '@tabler/icons-react';
import Dialog from './Dialog.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import Notice from './Notice.jsx';
import { CLOSE, DIFFERENT, KEEP_BOTH, KEEP_THIS_ONE, KEEPING, KEEPING_BOTH, keepThisOneLabel } from './text.js';
import { HIDDEN_ON_THIS_TABLET } from '../lib/privateDetails.js';

export default function CompareDialog({
  title,
  sub,
  heads,
  rows,
  canKeepOne = true,
  note,
  keepLabel = keepThisOneLabel,
  loading = false,
  loadError = null,
  onRetry,
  busy = null,
  failed = null,
  blockingNote = null,
  hiddenText = HIDDEN_ON_THIS_TABLET,
  onKeep,
  onKeepBoth,
  onClose,
  isPhone = false,
  onTop = false,
  returnFocusTo = null,
}) {
  const working = Boolean(busy);
  const ready = !loading && !loadError; // the two records are there
  const stopped = working || Boolean(blockingNote); // Keep this one and keep both wait
  const message = failed || blockingNote; // the amber note under the buttons

  // A row's two values differ (and are marked) unless the row is plain or hidden.
  const differs = (row) => !row.plain && !row.hidden && row.first !== row.second;

  // One value: gray "Hidden on this tablet", or the value with "⚠ different" after it. The space
  // before "different" is for screen readers ("Cash different"); on screen the mark keeps its gap.
  const cell = (row, value) =>
    row.hidden ? (
      <span className="cmp-hidden">{hiddenText}</span>
    ) : (
      <>
        {value}
        {differs(row) && (
          <span className="cmp-diff">
            {/* ti-alert-triangle = different (with the word, never color alone) */}
            <IconAlertTriangle size={12} aria-hidden="true" /> {DIFFERENT}
          </span>
        )}
      </>
    );

  const keepButton = (index) => {
    if (!canKeepOne) return null;
    const pressed = busy === (index === 0 ? 'keep-first' : 'keep-second');
    return (
      <button
        type="button"
        className={`btn btn-sm${stopped ? ' is-unavailable' : ''}`}
        // While it says "Keeping…" it has no separate name, so screen readers hear the busy words.
        aria-label={pressed ? undefined : keepLabel(heads[index])}
        aria-disabled={stopped ? 'true' : undefined}
        aria-busy={pressed ? 'true' : undefined}
        onClick={() => {
          if (!stopped) onKeep(index);
        }}
      >
        {pressed ? KEEPING : KEEP_THIS_ONE}
      </button>
    );
  };

  const keepBothOff = stopped || !ready; // also waits while the records load or couldn't load
  const keepBoth = (
    <button
      type="button"
      className={`btn${keepBothOff ? ' is-unavailable' : ''}`}
      aria-disabled={keepBothOff ? 'true' : undefined}
      aria-busy={busy === 'keep-both' ? 'true' : undefined}
      onClick={() => {
        if (!keepBothOff) onKeepBoth();
      }}
    >
      {busy === 'keep-both' ? KEEPING_BOTH : KEEP_BOTH}
    </button>
  );

  const noteBlock = message && (
    <div className="tdialog-note">
      <Notice>{message}</Notice>
    </div>
  );

  // The table (PC / tablet) or one card per registration (phone); placeholders while loading; the
  // amber bar with Retry when they couldn't load.
  let content;
  if (loading) {
    content = (
      <div className="tskeleton" aria-busy="true">
        {[0, 1, 2].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (loadError) {
    content = <ErrorBanner text={loadError} onRetry={onRetry} />;
  } else if (isPhone) {
    content = heads.map((head, index) => (
      <section key={head} className="ev-cmp-card" aria-label={head}>
        <h3 className="ev-cmp-head">{head}</h3>
        <dl className="cmp-sum">
          {rows.map((row) => (
            <div key={row.key ?? row.label} className={`ev-sum-row${differs(row) ? ' is-diff' : ''}`}>
              <dt>{row.label}</dt>
              <dd>{cell(row, index === 0 ? row.first : row.second)}</dd>
            </div>
          ))}
        </dl>
        {keepButton(index)}
      </section>
    ));
  } else {
    content = (
      <table className="ev-cmp">
        <thead>
          <tr>
            <td />
            <th scope="col">{heads[0]}</th>
            <th scope="col">{heads[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key ?? row.label}>
              <th scope="row">{row.label}</th>
              <td className={differs(row) ? 'is-diff' : ''}>{cell(row, row.first)}</td>
              <td className={differs(row) ? 'is-diff' : ''}>{cell(row, row.second)}</td>
            </tr>
          ))}
          {canKeepOne && (
            <tr className="ev-cmp-keep">
              <td />
              <td>{keepButton(0)}</td>
              <td>{keepButton(1)}</td>
            </tr>
          )}
        </tbody>
      </table>
    );
  }

  return (
    <Dialog
      title={title}
      size="wide"
      fullScreen={isPhone}
      className="cmp-dialog"
      onTop={onTop}
      returnFocusTo={returnFocusTo}
      busy={working}
      onRequestClose={() => {
        if (!working) onClose(); // Esc, a click outside and Back wait while it works
      }}
    >
      {sub && <p className="tdialog-sub">{sub}</p>}
      {content}
      {ready && note && <p className="field-hint ev-cmp-note">{note}</p>}
      {isPhone ? (
        <>
          <div className="dialog-actions ev-cmp-actions">{keepBoth}</div>
          {noteBlock}
        </>
      ) : (
        // The buttons and the note share the dialog's bottom area (v0.81): the note can never
        // slide under the pinned buttons.
        <div className="dialog-footer">
          <div className="dialog-actions ev-cmp-actions">
            {keepBoth}
            <button
              type="button"
              className={`btn${working ? ' is-unavailable' : ''}`}
              aria-disabled={working ? 'true' : undefined}
              data-autofocus
              onClick={() => {
                if (!working) onClose();
              }}
            >
              {CLOSE}
            </button>
          </div>
          {noteBlock}
        </div>
      )}
    </Dialog>
  );
}
