// ConfirmBox.jsx — the shared "are you sure?" box (design review M2, rulebook v1.008 / v1.103).
// Why it exists: 39 asks in 20 files were drawn four different ways (plan §9). This box draws the
// one rule for every section; each section passes its own question, sentence and button words:
//   - The button that changes nothing says what stays ("Keep student", "Stay on this page") and is
//     on the LEFT; the action repeats the words pressed ("Delete permanently") and is on the RIGHT.
//   - `loses` says what the action loses:
//       'forGood'   → red action, first focus on "Keep …"   (Delete permanently, Leave anyway, Discard)
//       'something' → blue action, first focus on "Keep …"  (Undo payment)
//       'nothing'   → blue action, first focus on the action (Prospects' "Came", Forms' kiosk asks)
//   - While it works (detail a): the pressed button grays and says what it is doing ("Deleting…"),
//     "Keep …" grays too (the plain button's unavailable look), both stay focusable for the keyboard
//     (aria-disabled, never disabled), and Esc, a click outside and Back wait until it's done.
//   - The buttons never move while it works (v1.103, §8; v0.81): the action is as wide as the wider
//     of its usual and busy words, at rest too ("Came" sits in a button as wide as "Saving…";
//     "Deleting…" in one as wide as "Delete permanently"), so "Keep …" stays where it was; and the
//     two buttons stack, each the full width of the box, when at that width they don't fit side by
//     side — measured, not by screen size (detail b), so a pair that fits at rest fits while it
//     works, and a stacked pair stays stacked.
//   - Never the form dialogs' pinned button row, at any height (detail c; shared.css .cfm-actions).
//   - If it fails, the box stays open with the section's amber note under the buttons (v0.81)
//     until it closes (v1.004); pressing the action again tries again.
//   - role="alertdialog"; the same small box on every device (Dialog.jsx's 'confirm', never full
//     screen); `onTop` when it opens on top of another dialog (Dialog.jsx, v1.100).
// Nothing switches to it in Dashboard core step 1; each section does, in its own prompt.
//
// Two exports:
//   ConfirmBox (default)  the whole box
//   ConfirmButtons        the button row alone, for an ask drawn inside another dialog (Forms' kiosk
//                         asks in its Share dialog). It has the same order, colors, busy look, width
//                         and stacking; the section passes `busy` while its action works. Its first
//                         focus: inside ConfirmBox, the dialog puts it on the right button when it
//                         opens (data-autofocus). Drawn inside a dialog that is already open, pass
//                         `autoFocus` so the row moves focus there itself when it appears.
//
// ConfirmBox props:
//   title         the question ("Delete Owen Reed permanently?")
//   children      the sentence under it (what happens)
//   hint          optional gray line under the sentence ("To keep the record, use Withdraw instead.")
//   keepLabel     the button that changes nothing ("Keep student", "Stay on this page")
//   actionLabel   the action, the words pressed ("Delete permanently")
//   actionIcon    optional Tabler icon component for the action (e.g. IconTrash)
//   busyLabel     the action's words while it works ("Deleting…"); default: actionLabel. When they
//                 are longer than actionLabel, the action is that much wider at rest too.
//   loses         'forGood' | 'something' | 'nothing' (see above)
//   failed        optional amber note under the buttons — the section's own failure sentence. The
//                 box never words a failure itself: when the action fails, the section sets this.
//   busy          optional: true while the section's action works, for a section that tracks it itself
//   onKeep()      "Keep …", Esc, a click outside, Back (ignored while it works)
//   onConfirm()   the action; may return a promise — the box shows the busy look until it settles.
//                 A promise that fails is the section's to handle (it sets `failed`); one it leaves
//                 unhandled is logged to the console, so it never vanishes silently.
//   onTop         true when it opens on top of another dialog
//   returnFocusTo optional, with onTop: the button that opened it (event.currentTarget), so focus
//                 goes back there when it closes — also in Safari / iPadOS, where a tapped button
//                 doesn't take the focus (Dialog.jsx)
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Dialog from './Dialog.jsx';
import Notice from './Notice.jsx';

// The action's look: red only when something is lost for good (guidelines 7), blue otherwise.
const actionClass = (loses) => (loses === 'forGood' ? 'btn btn-delete' : 'btn btn-primary');

export function ConfirmButtons({ keepLabel, actionLabel, actionIcon: ActionIcon = null, busyLabel, loses = 'forGood', busy = false, autoFocus = false, onKeep, onConfirm }) {
  const rowRef = useRef(null);
  const sizerRef = useRef(null);
  const [stacked, setStacked] = useState(false);
  const [usualWidth, setUsualWidth] = useState(null); // the action's width with its usual words, px
  const [busyWidth, setBusyWidth] = useState(null); // … and with its busy words, px
  const focusAction = loses === 'nothing'; // the first focus (D1c)
  const busyWords = busyLabel ?? actionLabel;
  const hasBusyWords = busyWords !== actionLabel;

  // Measured from the hidden "sizer" below: a copy of "Keep …" and, in one spot on top of each
  // other, the action with its usual words and with its busy words — so the sizer is exactly as
  // wide as the pair at its widest. The two buttons stack when that doesn't fit side by side (D1b,
  // detail b), so a pair that fits at rest fits while it works too. (A right-aligned row that is
  // too narrow spills out on the LEFT, which the browser doesn't count as overflow — so the widths
  // are added up instead.) The action's two widths set its own width below. A ResizeObserver (a
  // browser helper that reports size changes) re-checks when the box or the words change size, one
  // frame later, so stacking (which changes the row's height) never trips the browser's
  // "ResizeObserver loop" warning.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const sizer = sizerRef.current;
    if (!row || !sizer) return undefined;
    const usual = sizer.querySelector('[data-words="usual"]');
    const busyCopy = sizer.querySelector('[data-words="busy"]');
    const measure = () => {
      setStacked(sizer.getBoundingClientRect().width > row.clientWidth + 0.5);
      const usualNow = usual.getBoundingClientRect().width;
      setUsualWidth(usualNow);
      setBusyWidth(busyCopy ? busyCopy.getBoundingClientRect().width : usualNow);
    };
    measure(); // before the box is first drawn: it never shows in the wrong arrangement
    if (typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    });
    for (const element of [row, sizer, usual, busyCopy]) if (element) observer.observe(element);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [keepLabel, actionLabel, busyWords]);

  // The action's width (v1.103: nothing moves while it works), side by side only — stacked, both
  // buttons are already the box's full width. It is the wider of its two widths: while it works
  // always, and at rest when the busy words are the wider ones ("Came" → "Saving…"). With shorter
  // busy words the action is that wide on its own at rest, so it gets no width of its own and looks
  // exactly as without this.
  const widest = usualWidth === null ? null : Math.max(usualWidth, busyWidth ?? usualWidth);
  const busyIsWider = usualWidth !== null && busyWidth !== null && busyWidth > usualWidth;
  const holdWidth = !stacked && widest !== null && (busy || busyIsWider);

  // autoFocus: when the row appears inside a dialog that is already open, focus goes to the button
  // that gets the first focus (the dialog's own data-autofocus only works when a dialog opens).
  useEffect(() => {
    if (!autoFocus) return;
    rowRef.current?.querySelector('[data-autofocus]')?.focus();
    // Only when the row appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rowRef} className={`dialog-actions cfm-actions${stacked ? ' is-stacked' : ''}`}>
      <button
        type="button"
        className={`btn${busy ? ' is-unavailable' : ''}`}
        aria-disabled={busy ? 'true' : undefined}
        data-autofocus={focusAction ? undefined : true}
        onClick={() => {
          if (!busy) onKeep();
        }}
      >
        {keepLabel}
      </button>
      <button
        type="button"
        className={`${actionClass(loses)}${busy ? ' is-unavailable' : ''}`}
        aria-disabled={busy ? 'true' : undefined}
        aria-busy={busy ? 'true' : undefined}
        data-autofocus={focusAction ? true : undefined}
        style={holdWidth ? { minWidth: widest } : undefined}
        onClick={() => {
          if (!busy) onConfirm();
        }}
      >
        {ActionIcon && <ActionIcon size={16} aria-hidden="true" />}
        {busy ? busyWords : actionLabel}
      </button>
      {/* The sizer: "Keep …", and the action with its usual and its busy words in one spot,
          invisible and out of the way (shared.css .cfm-sizer). Plain <span>s, so nothing in it can
          be focused or pressed. */}
      <span ref={sizerRef} className="cfm-sizer" aria-hidden="true">
        <span className="btn">{keepLabel}</span>
        <span className="cfm-sizer-action">
          <span className={actionClass(loses)} data-words="usual">
            {ActionIcon && <ActionIcon size={16} aria-hidden="true" />}
            {actionLabel}
          </span>
          {hasBusyWords && (
            <span className={actionClass(loses)} data-words="busy">
              {ActionIcon && <ActionIcon size={16} aria-hidden="true" />}
              {busyWords}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

export default function ConfirmBox({
  title,
  children,
  hint = null,
  keepLabel,
  actionLabel,
  actionIcon = null,
  busyLabel,
  loses = 'forGood',
  failed = null,
  busy = false,
  onKeep,
  onConfirm,
  onTop = false,
  returnFocusTo = null,
}) {
  const bodyId = useId();
  // The action's promise, while it is on its way: the box shows the busy look until it settles.
  const [pending, setPending] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const working = busy || pending;

  function confirm() {
    const result = onConfirm();
    if (result && typeof result.then === 'function') {
      setPending(true);
      const done = () => {
        if (mountedRef.current) setPending(false);
      };
      result.then(done, (error) => {
        // The section shows its own failure sentence through `failed`; a failure it left
        // unhandled is logged here instead of disappearing without a trace.
        console.error('ConfirmBox: the action failed and the section did not handle it', error);
        done();
      });
    }
  }

  return (
    <Dialog
      title={title}
      variant="confirm"
      describedBy={bodyId}
      onTop={onTop}
      returnFocusTo={returnFocusTo}
      busy={working}
      onRequestClose={() => {
        if (!working) onKeep(); // Esc, a click outside and Back wait while it works
      }}
    >
      <p id={bodyId} className="tdialog-sub tdialog-body">
        {children}
      </p>
      {hint && <p className="field-hint cfm-hint">{hint}</p>}
      <ConfirmButtons
        keepLabel={keepLabel}
        actionLabel={actionLabel}
        actionIcon={actionIcon}
        busyLabel={busyLabel}
        loses={loses}
        busy={working}
        onKeep={onKeep}
        onConfirm={confirm}
      />
      {/* Under the buttons (v0.81), so they never move when it appears; until the box closes (v1.004). */}
      {failed && (
        <div className="tdialog-note">
          <Notice>{failed}</Notice>
        </div>
      )}
    </Dialog>
  );
}
