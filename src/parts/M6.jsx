// M6.jsx — the parts page's samples of the shared count cards (components/CountCards.jsx; mockup M6,
// rulebook v1.107).
// Why it exists: the parts page (plan §4) shows every state with fake numbers (no database). A
// sample roster keeps the chosen filter, as a section would; "A card tapped" taps Not paid the way a
// finger does. Under the filtered row a few faint sample rows give the gray line its context.
import { useState } from 'react';
import { IconAlertTriangle, IconCalendar, IconCheck, IconCircleX, IconClock, IconSum, IconUsers } from '@tabler/icons-react';
import CountCards from '../components/CountCards.jsx';
import { findByWords, pressLikeMouse, useLater } from './act.js';

const COLOR_BELT = [
  { key: 'all', Icon: IconUsers, label: 'Students · all classes', value: 15, kind: 'all' },
  { key: 'paid', Icon: IconCheck, label: 'Paid', value: 6, kind: 'filter' },
  { key: 'notPaid', Icon: IconCircleX, label: 'Not paid', value: 9, kind: 'filter' },
  { key: 'money', Icon: IconSum, label: 'Payments recorded', value: '$410', kind: 'total' },
];
const SHOWING = { paid: 'Showing paid only', notPaid: 'Showing not paid only' };

const CAMPS = [
  { key: 'all', Icon: IconUsers, label: 'Campers', value: 19, kind: 'all' },
  { key: 'coming', Icon: IconCalendar, label: 'Coming Mon, Apr 19', value: 15, kind: 'filter' },
  { key: 'collect', Icon: IconCircleX, label: 'To collect', value: 6, note: '$1,355', kind: 'filter' },
  { key: 'money', Icon: IconSum, label: 'Payments recorded', value: '$3,795', kind: 'total' },
];

const blackBelt = (late, notPaid) => [
  { key: 'paidInFull', Icon: IconCheck, label: 'Paid in full', value: 1, kind: 'filter' },
  { key: 'onSchedule', Icon: IconClock, label: 'Paying on schedule', value: 2, kind: 'filter' },
  { key: 'late', Icon: IconAlertTriangle, label: 'Late', value: late, kind: 'filter' },
  { key: 'notPaid', Icon: IconCircleX, label: 'Not paid', value: notPaid, kind: 'filter' },
];
const BB_NOTE = 'The possible duplicate row isn’t counted in the cards until it’s resolved.';

// A sample roster: the cards and the filter they set (plus faint rows, when `rows`).
function SampleCards({ cards, showing = SHOWING, note = null, rows = false }) {
  const [selected, setSelected] = useState(null);
  return (
    <div className="parts-frame" data-shot>
      <CountCards cards={cards} selected={selected} onSelect={setSelected} showingText={showing[selected] ?? ''} note={note} />
      {rows && (
        <div className="parts-ghost" aria-hidden="true">
          <div>Student</div>
          <div>Ava Chen</div>
          <div>Noah Kim</div>
        </div>
      )}
    </div>
  );
}

function FilteredState() {
  useLater(() => pressLikeMouse(findByWords('.ev-card', 'Not paid9')), 200);
  return <SampleCards cards={COLOR_BELT} rows />;
}

// Black Belt's four, with the keyboard's focus ring on Late (as the mockup shows it)
function BlackBeltState() {
  useLater(() => findByWords('.ev-card', 'Late1')?.focus(), 200);
  return <SampleCards cards={blackBelt(1, 0)} note={BB_NOTE} />;
}

export const PART = {
  id: 'M6',
  title: 'Count cards',
  file: 'CountCards.jsx',
  states: [
    { id: 'rest', title: 'As it opens', render: () => <SampleCards cards={COLOR_BELT} /> },
    { id: 'filtered', title: 'A card tapped', render: () => <FilteredState /> },
    { id: 'camps', title: 'Camps’ four cards', render: () => <SampleCards cards={CAMPS} showing={{ coming: 'Showing coming Mon, Apr 19 only', collect: 'Showing to collect only' }} /> },
    { id: 'blackbelt', title: 'Black Belt’s four plan cards', render: () => <BlackBeltState /> },
    { id: 'hidden', title: 'Hide private details on', render: () => <SampleCards cards={COLOR_BELT.slice(0, 1)} /> },
    { id: 'bbphone', title: 'Black Belt on phones (2×2)', render: () => <SampleCards cards={blackBelt(2, 1)} /> },
  ],
};
