// L02.jsx — the parts page's sample of the room beside the panel (lib/pageRoom.js; rulebook v1.053,
// v1.130; design review rolling check pass 2, L-02).
// Why it exists: the room hook is built before any roster uses it, so it needs a page where it can be
// seen and checked. The sample is a small "window": a gray strip standing in for the left panel, and a
// page area measured the way Shell.jsx measures the real one. Inside it, a sample roster asks
// usePageRoomBelow(640) and switches to its phone layout (stacked rows) below that, and says the room
// in px. Buttons choose the window's width and the panel's (Standard 72 px or Largest 96 px), as a
// narrow tablet window or Panel size would; the real browser window can be narrowed too. The chosen
// width is the window's inside, as a real window's; on a screen too narrow for it, the sample takes the
// room there is and says so. A second state opens with a 683 px window and Largest pressed, so its
// picture shows the roster stacked. The browser check (docs/Dashboard Core/tools/check-room.mjs) uses
// it as well.
// The sample's look is the parts page's own (parts.css), not a section's roster.
import { useId, useRef, useState } from 'react';
import ChoiceGroup from '../components/ChoiceGroup.jsx';
import { useMeasurePageRoom, usePageRoom, usePageRoomBelow } from '../lib/pageRoom.js';

const SAMPLE_ROOM = 640; // the sample roster's limit: the narrowest room its columns fit in
const WINDOWS = [
  { key: 'full', label: 'Full width', width: null },
  { key: '683', label: '683 px', width: 683 },
  { key: '768', label: '768 px', width: 768 },
  { key: '820', label: '820 px', width: 820 },
];
const PANELS = [
  { key: 'standard', label: 'Standard 72 px', width: 72 },
  { key: 'largest', label: 'Largest 96 px', width: 96 },
];
const STUDENTS = [
  { name: 'Ava Chen', from: 'LT White', to: 'LT Yellow', paying: 'Cash' },
  { name: 'Noah Kim', from: 'LT Yellow', to: 'LT Green', paying: 'Check' },
  { name: 'Lily Brooks', from: 'LT Green', to: 'LT Blue', paying: 'Cash' },
];

// The sample roster: tablet columns, or its phone layout while the room is under its limit. The
// class is-stacked is how a real roster's styles would follow the answer (lib/pageRoom.js).
function SampleRoster() {
  const room = usePageRoom();
  const stacked = usePageRoomBelow(SAMPLE_ROOM);
  return (
    <div className={`parts-room-roster${stacked ? ' is-stacked' : ''}`}>
      <p className="parts-room-readout">
        Room beside the panel: <b>{room === null ? '…' : `${room} px`}</b>. This roster's limit is {SAMPLE_ROOM}&nbsp;px, so it shows{' '}
        <b>{stacked ? 'its phone layout' : 'its tablet columns'}</b>.
      </p>
      {stacked ? (
        <ul className="parts-room-cards" aria-label="Sample roster">
          {STUDENTS.map((s) => (
            <li key={s.name} className="parts-room-card">
              <b>{s.name}</b>
              <span>
                {s.from} → {s.to}
              </span>
              <span>{s.paying} · Not paid</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="parts-room-table" role="table" aria-label="Sample roster">
          <div className="parts-room-row is-head" role="row">
            <span role="columnheader">Student</span>
            <span role="columnheader">Testing for</span>
            <span role="columnheader">Paying by</span>
            <span role="columnheader">Payment</span>
          </div>
          {STUDENTS.map((s) => (
            <div key={s.name} className="parts-room-row" role="row">
              <span role="cell">{s.name}</span>
              <span role="cell">
                {s.from} → {s.to}
              </span>
              <span role="cell">{s.paying}</span>
              <span role="cell">Not paid</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// startWindow / startPanel: the choices it opens with (the "narrow" state opens pressed).
function RoomSample({ startWindow = 'full', startPanel = 'standard' }) {
  const windowLabel = useId();
  const panelLabel = useId();
  const [windowKey, setWindowKey] = useState(startWindow);
  const [panelKey, setPanelKey] = useState(startPanel);
  const pageRef = useRef(null);
  useMeasurePageRoom(pageRef);
  const room = usePageRoom();
  const windowWidth = WINDOWS.find((w) => w.key === windowKey).width;
  const panelWidth = PANELS.find((p) => p.key === panelKey).width;
  // A chosen window wider than the screen can be is drawn as wide as there's room for, and says so.
  const tooWide = windowWidth !== null && room !== null && room + panelWidth < windowWidth;
  return (
    <div className="parts-frame" data-shot>
      <div className="parts-room-controls">
        <div className="parts-room-control">
          <span id={windowLabel} className="parts-room-label">
            Window
          </span>
          <ChoiceGroup labelId={windowLabel} variant="segmented" options={WINDOWS} value={windowKey} onChange={setWindowKey} />
        </div>
        <div className="parts-room-control">
          <span id={panelLabel} className="parts-room-label">
            Panel
          </span>
          <ChoiceGroup labelId={panelLabel} variant="segmented" options={PANELS} value={panelKey} onChange={setPanelKey} />
        </div>
      </div>
      {tooWide && (
        <p className="parts-room-note">
          This screen is narrower than a {windowWidth}&nbsp;px window, so the sample window takes the room there is.
        </p>
      )}
      <div className="parts-room-window" style={windowWidth ? { width: `${windowWidth}px` } : undefined}>
        <div className="parts-room-rail" style={{ width: `${panelWidth}px` }} aria-hidden="true" />
        <div ref={pageRef} className="parts-room-page">
          <SampleRoster />
        </div>
      </div>
    </div>
  );
}

export const PART = {
  id: 'L02',
  title: 'Room beside the panel',
  file: 'lib/pageRoom.js',
  states: [
    { id: 'room', title: 'A sample window: the roster follows the room beside the panel', render: () => <RoomSample /> },
    { id: 'narrow', title: 'A 683 px window with the Largest panel: the roster stacks', render: () => <RoomSample startWindow="683" startPanel="largest" /> },
  ],
};
