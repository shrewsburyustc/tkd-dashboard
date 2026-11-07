// DateSigned.jsx — the "Date signed" line under a signature on a family form (rulebook v0.635, v0.638,
// v0.430; design review rolling check pass 2, L-08).
// Why it exists: rule v0.638 — every signature in the dashboard has its date signed. On a family form it
// is a gray box that can't be changed, under the signature pad, holding the day the form is sent (the
// database saves that same day with the signature: signed_at). New students' forms drew it first
// (v0.635); this is the one shared version, so Color Belt's, Star's, Camps' and Black Belt's family forms
// look the same. Color Belt builds it first (v0.430); the others switch to it through Main.
//
//   <DateSigned id="reg-signed" day={today} />
//
//   id    the box's id (its label points at it)
//   day   the day it's signed, 'YYYY-MM-DD' at the school: the family form's "today at the school" (the
//         page's own clock, so the preview's pretend day shows too)
//
// It shows "Date signed", the day as "Fri, Nov 6, 2026" in a gray box, and "Filled in automatically
// with today's date." under it. The box is read-only: it is still read out by screen readers, but it
// can't be typed in. The look is New students' (their .fsigned box) written with the shared tokens only,
// in its own small stylesheet, because the family pages load tokens.css and their own CSS, not
// shared.css (as the public forms' icon-button-public.css does for the icon button). On touch devices
// and phones it takes the family form's own text-box sizes (40px, 16px text) in that stylesheet.
//
// The day is the page's "today" at each drawing, so a form left open past midnight shows yesterday until
// it next draws (a stroke, a tap, Send); Send draws first, and the database stamps its own clock when
// the form arrives, so the day that is SAVED is always the real one.
import { shortDate } from '../lib/calendarDates.js';
import { DATE_SIGNED, DATE_SIGNED_HINT } from './text.js';
import '../styles/date-signed-public.css';

export default function DateSigned({ id, day }) {
  return (
    <div className="ds-field">
      <label className="ds-label" htmlFor={id}>
        {DATE_SIGNED}
      </label>
      <input id={id} className="ds-box" type="text" readOnly value={shortDate(day)} aria-describedby={`${id}-hint`} />
      <div className="ds-hint" id={`${id}-hint`}>
        {DATE_SIGNED_HINT}
      </div>
    </div>
  );
}
