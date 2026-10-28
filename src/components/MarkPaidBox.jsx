// MarkPaidBox.jsx — the small Mark paid box under a roster's button (design review M3,
// rulebook v1.001 / v1.104).
// Why it exists: rulebook v1.001 chose one small box for taking a payment everywhere (Camps' box
// under its "$X due" tag, made shared): Mark paid → the person and the amount, then **Paid by**
// Cash / Check / Card preset to the family's choice, with the hint "They chose Check on the form."
// → **Mark paid $50**. Two taps; staff see what will be recorded before it saves. The amount is
// shown, never typed (a different amount or date is fixed afterwards with Edit payment, admins).
//   - It opens under whatever the section's opener is (Color Belt's and Star's Mark paid button,
//     Camps' "$X due" / "Owes $X" tag), its right edge under the opener's, and is kept 8px inside
//     the screen; above the opener when there's no room below. The same small box on phones.
//   - "Mark paid $X" has the first focus (detail a): nothing is lost, so Enter does the usual thing.
//     Its screen-reader name says the way: "Mark paid $50 by check".
//   - No choice on record (detail b): nothing is preset, no hint, the first focus goes on Cash, and
//     "Mark paid $X" stays gray (still focusable) with the gray line "Choose how they paid." until
//     a way is picked.
//   - Esc closes it and puts focus back on the opener; a click outside closes it. Tab moves
//     between its two stops (Paid by, Mark paid $X); a Tab that would leave the box (Tab on the
//     last, Shift+Tab on the first) closes it and puts focus back on the opener — as the ⋯ menu
//     does (RowMenu.jsx: Tab closes it, and the screen returns focus to the ⋯ button), so focus
//     never wanders off to the end of the page while the box stays open; inside a dialog too.
// The box only hands the section the chosen way (onMarkPaid). Saving it, the toast and a failure
// stay the section's, as today. Nothing switches to it in Dashboard core step 1.
//
// Two exports:
//   MarkPaidBox (default)  the box
//   PaidByField            the "Paid by" label, the Cash / Check / Card choice and the hint — for
//                          Black Belt's own Record payment dialog, which keeps its dialog (v1.001)
//
// MarkPaidBox props:
//   anchor         the element it opens from (the section's button or tag)
//   name           the person ("Noah Kim")
//   amountCents    what is being paid, in cents (shown with the shared money helper: "$15.50")
//   familyChoice   'cash' | 'check' | 'card' | null — what the family chose
//   choiceWhere    'form' | 'desk' — where they chose it ("… on the form." / "… at the desk.")
//   onMarkPaid(method)    Mark paid $X pressed: 'cash' | 'check' | 'card'
//   onClose(restoreFocus) the box asks to close; true = put focus back on the opener (Esc, and
//                         after Mark paid), false = a click outside (focus goes where it was clicked)
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck } from '@tabler/icons-react';
import ChoiceGroup from './ChoiceGroup.jsx';
import { formatMoney } from '../lib/money.js';
import { CHOOSE_HOW_PAID, PAID_BY, PAY_METHODS, markPaidAmount, markPaidAmountBy, markPaidBoxLabel, theyChose } from './text.js';

const METHOD_KEYS = Object.keys(PAY_METHODS); // cash, check, card
const METHOD_OPTIONS = METHOD_KEYS.map((key) => ({ key, label: PAY_METHODS[key] }));
const isMethod = (value) => METHOD_KEYS.includes(value);

// "Paid by": the label, the joined Cash / Check / Card buttons (ChoiceGroup.jsx) and, when the
// family chose one, the gray hint. Drawn as two pieces (the field, then the hint) so the box's
// column spacing applies to both.
//   value / onChange     the chosen way ('cash' | 'check' | 'card' | null)
//   familyChoice, choiceWhere   as MarkPaidBox
//   readOnly             true while the section saves
export function PaidByField({ value, onChange, familyChoice = null, choiceWhere = 'form', readOnly = false }) {
  const labelId = useId();
  return (
    <>
      <div className="mpb-field">
        <span id={labelId} className="field-label">
          {PAID_BY}
        </span>
        <ChoiceGroup labelId={labelId} options={METHOD_OPTIONS} value={value} onChange={onChange} variant="segmented" readOnly={readOnly} />
      </div>
      {isMethod(familyChoice) && <p className="mpb-hint">{theyChose(PAY_METHODS[familyChoice], choiceWhere)}</p>}
    </>
  );
}

export default function MarkPaidBox({ anchor, name, amountCents, familyChoice = null, choiceWhere = 'form', onMarkPaid, onClose }) {
  const boxRef = useRef(null);
  const reasonId = useId();
  const [method, setMethod] = useState(isMethod(familyChoice) ? familyChoice : null);
  const [position, setPosition] = useState(null); // { top, left } once it is placed
  const money = formatMoney(amountCents);

  // The newest onClose, kept in a "ref" (a box React doesn't watch) for the listeners below.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Under the opener, right edges lined up, kept 8px inside the screen; above it when there's no
  // room below. Placed again when the page scrolls or the window changes size.
  useLayoutEffect(() => {
    function place() {
      if (!anchor || !boxRef.current) return;
      const rect = anchor.getBoundingClientRect();
      const width = boxRef.current.offsetWidth;
      const height = boxRef.current.offsetHeight;
      let top = rect.bottom + 4;
      if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - 4 - height);
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      setPosition({ top, left });
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor]);

  // Once placed, focus goes into the box: on Mark paid $X, or on Cash when there's no choice.
  const placed = position !== null;
  useEffect(() => {
    if (!placed) return;
    const box = boxRef.current;
    const target = isMethod(familyChoice) ? box?.querySelector('[data-mark-paid]') : box?.querySelector('[role="radio"]');
    target?.focus();
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed]);

  // A click or tap outside (not on the box, not on its opener) closes it.
  useEffect(() => {
    function outside(event) {
      const path = event.composedPath();
      if (path.includes(boxRef.current) || (anchor && path.includes(anchor))) return;
      onCloseRef.current(false);
    }
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [anchor]);

  const ready = method !== null;
  return createPortal(
    <div
      ref={boxRef}
      className="mpb"
      role="dialog"
      aria-label={markPaidBoxLabel(name)}
      style={position ?? { top: -9999, left: -9999 }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onCloseRef.current(true);
          return;
        }
        if (event.key !== 'Tab') return;
        // The box's Tab stops: the chosen (or first) Paid by button and Mark paid $X.
        const stops = [...boxRef.current.querySelectorAll('button')].filter((button) => button.tabIndex >= 0);
        const leaving = event.shiftKey ? document.activeElement === stops[0] : document.activeElement === stops[stops.length - 1];
        if (leaving) {
          event.preventDefault();
          // … and no further: drawn inside a dialog, the dialog's own Tab wrap-around would
          // otherwise move focus on from the opener the section has just put it back on.
          event.stopPropagation();
          onCloseRef.current(true); // as the ⋯ menu: Tab out closes it, focus back on the opener
        }
      }}
    >
      <p className="mpb-line">
        <span className="mpb-name">{name}</span> · {money}
      </p>
      <PaidByField value={method} onChange={setMethod} familyChoice={familyChoice} choiceWhere={choiceWhere} />
      <button
        type="button"
        data-mark-paid
        className={`btn btn-sm mpb-go${ready ? '' : ' is-unavailable'}`}
        aria-label={ready ? markPaidAmountBy(money, PAY_METHODS[method]) : undefined}
        aria-disabled={ready ? undefined : 'true'}
        aria-describedby={ready ? undefined : reasonId}
        onClick={() => {
          if (!ready) return;
          onCloseRef.current(true);
          onMarkPaid(method);
        }}
      >
        {/* ti-check: the Mark paid button's icon (Color Belt's) */}
        <IconCheck size={16} aria-hidden="true" />
        {markPaidAmount(money)}
      </button>
      {!ready && (
        <p id={reasonId} className="mpb-reason">
          {CHOOSE_HOW_PAID}
        </p>
      )}
    </div>,
    document.body,
  );
}
