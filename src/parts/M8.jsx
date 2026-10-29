// M8.jsx — the parts page's samples of the shared time list (components/TimeList.jsx; mockup M8,
// rulebook v1.109).
// Why it exists: the parts page (plan §4) shows every state in a piece of a dialog (two time fields
// side by side, as in the Schedule's Add time slot; sample context, parts.css). The open states are
// reached the way a person gets there: a press on the field opens the list (with the chosen time in
// the middle), and in "Moving with the keyboard" the ↓ key is pressed twice.
// After step 1: "Turned off" (the `disabled` prop, rulebook v1.116 / v0.823), Finance's reminder
// times while the reminder is Off, with a sample switch that turns them on and off.
import { useId, useRef, useState } from 'react';
import Dialog from '../components/Dialog.jsx';
import Notice from '../components/Notice.jsx';
import TimeList from '../components/TimeList.jsx';
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { pressKey, useLater } from './act.js';

// One labelled time field (a section draws its own label and any problem under the field).
function TimeField({ label, value: start, problem = null, readOnly = false, fieldRef, ...rest }) {
  const labelId = useId();
  const problemId = useId();
  const [value, setValue] = useState(start);
  return (
    <div className="field" ref={fieldRef}>
      <span id={labelId} className="field-label">
        {label}
      </span>
      <TimeList value={value} onChange={setValue} labelId={labelId} describedBy={problem ? problemId : undefined} invalid={Boolean(problem)} readOnly={readOnly} {...rest} />
      {problem && (
        <div className="parts-problem">
          <Notice id={problemId}>{problem}</Notice>
        </div>
      )}
    </div>
  );
}

// The two fields. `open` = the field (0 or 1) whose list opens, as a press would open it; then
// `keys` are pressed on it.
function SamplePair({ fields, open = null, keys = [] }) {
  const refs = [useRef(null), useRef(null)];
  useLater(() => {
    const field = refs[open]?.current?.querySelector('[role=combobox]');
    if (!field) return;
    field.click();
    // One key at a time, as a person types: the list draws itself again between two presses.
    keys.forEach((key, index) => window.setTimeout(() => pressKey(field, key), 150 * (index + 1)));
  }, 200);
  return (
    <div className={`parts-tframe${open !== null ? ' is-tall' : ''}`} data-shot>
      <div className="parts-pair">
        {fields.map((field, index) => (
          <TimeField key={field.label} fieldRef={refs[index]} {...field} />
        ))}
      </div>
    </div>
  );
}

const STARTS = { label: 'Starts', value: '16:00' };
const ENDS = { label: 'Ends', value: '16:40' };

// Finance's reminder times (11:00 AM–11:00 PM, with Off first). The first one has autoFocus (a dialog
// would put the focus there when it opens), which a turned-off field must ignore.
const REMINDER = { from: '11:00', to: '23:00', offLabel: 'Off' };
const OFF_FIELDS = [
  { label: 'Monday · Shrewsbury', value: '20:45', autoFocus: true, ...REMINDER },
  { label: 'Monday · Worcester', value: '21:00', ...REMINDER },
];

// Turned off (rulebook v1.116 / v0.823; Finance's F2 picture draws it, there is no mockup of its
// own): gray, skipped by Tab, they never open. Sample context: a switch before the fields turns them
// on and off (as Finance's reminder switch), and a button after them is where Tab lands from the
// switch while they are off.
// `closeCheck` (a behaviour check, not a picture): they start on, a press opens the second field's
// list, then the sample turns them off — as when another admin turns the reminder Off and the screen
// redraws. The list must close.
function OffState({ closeCheck = false }) {
  const [on, setOn] = useState(closeCheck);
  const pairRef = useRef(null);
  useLater(() => {
    if (!closeCheck) return;
    pairRef.current?.querySelectorAll('[role=combobox]')[1]?.click();
    window.setTimeout(() => setOn(false), 1000);
  }, 200);
  return (
    <div className={`parts-tframe${closeCheck ? ' is-tall' : ''}`} data-shot>
      <p className="parts-note">
        <button type="button" className="btn btn-sm" role="switch" aria-checked={on ? 'true' : 'false'} onClick={() => setOn(!on)}>
          Reminder: {on ? 'On' : 'Off'}
        </button>
      </p>
      <div className="parts-pair" ref={pairRef}>
        {OFF_FIELDS.map((field) => (
          <TimeField key={field.label} {...field} disabled={!on} />
        ))}
      </div>
      <p className="parts-note">
        <button type="button" className="btn btn-sm">
          Copy Monday to Tue–Fri
        </button>
      </p>
    </div>
  );
}

// Not a mockup state: the two fields inside a real dialog, for the behaviour check "Esc closes the
// list only" (the dialog stays; a second Esc closes the dialog).
function InDialogState() {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(true);
  return (
    <>
      {!open && (
        <p className="parts-note">
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            Open the dialog again
          </button>
        </p>
      )}
      {open && (
        <Dialog title="Add time slot" fullScreen={isPhone} onRequestClose={() => setOpen(false)}>
          <div className="parts-pair">
            <TimeField {...STARTS} />
            <TimeField {...ENDS} />
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

export const PART = {
  id: 'M8',
  title: 'The time list',
  file: 'TimeList.jsx (on Select.jsx), src/lib/times.js',
  states: [
    { id: 'closed', title: 'Closed', render: () => <SamplePair fields={[STARTS, ENDS]} /> },
    { id: 'open', title: 'Open at the chosen time', render: () => <SamplePair fields={[STARTS, ENDS]} open={1} /> },
    { id: 'keys', title: 'Moving with the keyboard', render: () => <SamplePair fields={[STARTS, ENDS]} open={1} keys={['ArrowDown', 'ArrowDown']} /> },
    {
      id: 'empty',
      title: 'Nothing chosen yet, and Finance’s Off',
      render: () => <SamplePair fields={[{ label: 'Start time', value: null }, { label: 'Monday reminder', value: null, from: '11:00', to: '23:00', offLabel: 'Off' }]} open={1} />,
    },
    { id: 'saving', title: 'While the dialog saves', render: () => <SamplePair fields={[{ ...STARTS, readOnly: true }, { ...ENDS, readOnly: true }]} /> },
    {
      id: 'problem',
      title: 'With a problem',
      render: () => <SamplePair fields={[STARTS, { label: 'Ends', value: '15:30', problem: 'The end time must be after the start time.' }]} />,
    },
  ],
  // Not mockup states, so listed apart: "Turned off" (v1.116; Finance's F2 picture draws it), and two
  // for the behaviour checks only.
  extra: [
    { id: 'off', title: 'Turned off (Finance’s reminder is Off; v1.116)', render: () => <OffState /> },
    { id: 'indialog', title: 'Inside a dialog (behaviour check)', dialog: true, render: () => <InDialogState /> },
    { id: 'offwhileopen', title: 'Turned off while its list is open (behaviour check)', render: () => <OffState closeCheck /> },
  ],
};
