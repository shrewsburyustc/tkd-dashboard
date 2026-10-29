// TimeList.jsx — the shared time list: a field that opens a list of times (design review M8).
// Why it exists: rulebook v1.019 / v1.109 — one time list everywhere, instead of Star's and Black
// Belt's own dropdowns and the browser's own lists in Color Belt, Camps, Finance, Schedule and
// Calendar. It is the shared dropdown (Select.jsx) filled with times (src/lib/times.js):
//   - every time with AM/PM ("4:40 PM"), every 5 minutes; the range is set per use:
//     6:00 AM–10:00 PM by default (classes, testing, camps); Finance passes 11:00–23:00 and "Off";
//   - it opens with the chosen time in the middle, tinted blue; nothing chosen → a gray
//     "Choose a time", and the list opens at its first time;
//   - ↑ ↓ move (the row the arrow keys are on gets the 2px blue focus ring, detail a), Enter
//     chooses, Esc closes the list only; typing a number jumps to that hour ("6" → 6:00 AM, "6"
//     again → 6:00 PM, detail b);
//   - a saved time that isn't on the list (another step, or outside the range) is still shown,
//     added in its place;
//   - gray and closed while the dialog saves (readOnly); with a problem, the section draws its amber
//     words under the field and passes `invalid` + `describedBy`, so screen readers hear it too;
//   - turned off (disabled, rulebook v1.116 / v0.823 — Finance's reminder times while the reminder
//     is Off): gray words and chevron, skipped by Tab, heard as "unavailable", never opens.
// The same list on every device, not the phone's own picker (v0.51). Nothing switches to it in
// Dashboard core step 1; each section does, in its own prompt.
//
// Props:
//   value        the saved time 'HH:MM' (the database's 'HH:MM:SS' works too), or null
//   onChange     (time) => void — 'HH:MM'; with offLabel, null when Off is chosen
//   from, to     the first and last time ('HH:MM'); default '06:00' and '22:00'
//   step         minutes between times; default 5
//   offLabel     optional: a first choice that means "no time" (Finance's "Off")
//   placeholder  the gray words when nothing is chosen; default "Choose a time"
//   id, labelId, describedBy, invalid, readOnly, disabled, autoFocus   as Select.jsx (disabled ≠
//                readOnly: turned off vs busy saving; default false)
import { useMemo } from 'react';
import Select from './Select.jsx';
import { CHOOSE_A_TIME } from './text.js';
import { DEFAULT_FROM, DEFAULT_STEP, DEFAULT_TO, OFF_VALUE, hourJump, selectValue, timeOptions } from '../lib/times.js';

export default function TimeList({
  value,
  onChange,
  from = DEFAULT_FROM,
  to = DEFAULT_TO,
  step = DEFAULT_STEP,
  offLabel = null,
  placeholder = CHOOSE_A_TIME,
  id,
  labelId,
  describedBy,
  invalid = false,
  readOnly = false,
  disabled = false,
  autoFocus = false,
}) {
  // The choices; a saved time that isn't on the list is added in its place.
  const options = useMemo(() => timeOptions({ from, to, step, value, offLabel }), [from, to, step, value, offLabel]);

  return (
    <Select
      id={id}
      labelId={labelId}
      describedBy={describedBy}
      value={selectValue(value, offLabel)}
      options={options}
      placeholder={placeholder}
      onChange={(chosen) => onChange(chosen === OFF_VALUE ? null : chosen)}
      readOnly={readOnly}
      disabled={disabled}
      invalid={invalid}
      autoFocus={autoFocus}
      matcher={hourJump}
    />
  );
}
