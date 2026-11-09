// SH.jsx — the parts page's sample of the shared looks added with the shared-parts batch (rulebook
// v1.048 (12), v1.103 detail 8, v1.116/v1.120; pass 1 R3-06, R1-08, R4-09; pass 2 L-03, L-06):
//   - the shared back link (components/BackLink.jsx) above a title;
//   - grips: ready, and turned off (aria-disabled, gray, no grab cursor);
//   - a plain button and a clickable tag that can't be used right now (the page-wide unavailable look,
//     still focusable), next to their usable twins.
// Why it exists: the looks are built before any section switches to them, so they need a page where
// they can be seen and measured. The browser check (docs/Dashboard Core/tools/check-batch.mjs) uses it.
import { useId, useState } from 'react';
import BackLink from '../components/BackLink.jsx';
import Grip from '../components/Grip.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Select from '../components/Select.jsx';
import ChoiceGroup from '../components/ChoiceGroup.jsx';
import { PaidByField } from '../components/MarkPaidBox.jsx';

// A grouped list (Select's `group`): "Current" and "Planned" headings above their choices
const GROUPED = [
  { value: 'a', label: 'Spring', group: 'Current' },
  { value: 'b', label: 'Summer', group: 'Current' },
  { value: 'c', label: 'Fall', group: 'Planned' },
  { value: 'd', label: 'Winter', group: 'Planned' },
];

const DANS = [
  { key: 'first', label: '1st Dan' },
  { key: 'second', label: '2nd Dan' },
  { key: 'third', label: '3rd Dan' },
];

function Looks() {
  const [picked, setPicked] = useState('a');
  const labelId = useId();
  return (
    <div className="parts-frame" data-shot>
      <BackLink label="Camps" ariaLabel="Back to Camps" onClick={() => {}} />
      <h2 className="parts-sh-title" data-sh="title">
        Thanksgiving Camp
      </h2>
      <div className="parts-sh-row" data-sh="grips">
        <Grip label="Drag to reorder Yellow" gripProps={{}} />
        <span>Ready to drag</span>
        <Grip label="Drag to reorder Green (saving)" gripProps={{}} disabled />
        <span>Turned off while saving</span>
      </div>
      <div className="parts-sh-row" data-sh="buttons">
        <button type="button" className="btn">
          Cancel
        </button>
        <button type="button" className="btn is-unavailable" aria-disabled="true">
          Cancel (busy)
        </button>
        <button type="button" className="btn btn-primary">
          Mark paid
        </button>
        <button type="button" className="btn btn-primary" aria-disabled="true">
          Mark paid (busy)
        </button>
      </div>
      <div className="parts-sh-row" data-sh="select">
        <span id={labelId}>Schedule</span>
        <div style={{ width: 240 }}>
          <Select id="sh-select" labelId={labelId} value={picked} options={GROUPED} placeholder="Choose…" onChange={setPicked} />
        </div>
      </div>
      {/* R3-12: staff can't change this right now. Gray, not-allowed cursor, still a Tab stop, the reason is read on focus */}
      <div className="parts-sh-row" data-sh="unavailable-select">
        <span id={`${labelId}-dan`}>Dan (staff)</span>
        <div style={{ width: 240 }}>
          <Select id="sh-select-unavailable" labelId={`${labelId}-dan`} describedBy="sh-select-why" value="b" options={GROUPED} placeholder="Choose…" onChange={() => {}} unavailable />
        </div>
        <span id="sh-select-why" className="field-hint">
          Only an admin can change this. Ask an admin.
        </span>
      </div>
      <div className="parts-sh-row" data-sh="choices">
        <span id={`${labelId}-locked`}>Dan (locked)</span>
        <ChoiceGroup labelId={`${labelId}-locked`} options={DANS} value="first" onChange={() => {}} locked fill />
      </div>
      {/* Paid by in a wide parent: its joined buttons are only as wide as their words (compact) */}
      <div className="parts-sh-row" data-sh="paidby" style={{ display: 'block', width: 520 }}>
        <PaidByField value="cash" onChange={() => {}} label="Refunded by" />
      </div>
      {/* An amber bar with Retry and Dismiss, as the failed-Undo bar: its Retry is a 44px tap target on touch */}
      <div data-sh="bar" style={{ marginBottom: 16 }}>
        <ErrorBanner text="Undo didn't save. Check the connection, then retry." onRetry={() => {}} onDismiss={() => {}} />
      </div>
      <div className="parts-sh-row" data-sh="tags">
        <button type="button" className="ttag ev-tag-button">
          $140 due
        </button>
        <button type="button" className="ttag ev-tag-button" aria-disabled="true">
          $140 due (busy)
        </button>
      </div>
    </div>
  );
}

export const PART = {
  id: 'SH',
  title: 'Shared looks: back link, grips, unavailable',
  file: 'BackLink.jsx, shared.css',
  states: [{ id: 'looks', title: 'The back link, grips, and a button and tag that are unavailable', render: () => <Looks /> }],
};
