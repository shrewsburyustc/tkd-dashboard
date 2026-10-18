// BlockedOnBoth.jsx — what Testing shows while the location switcher is on "Both".
// Why it exists: decided v0.35 — each school's testing is kept completely separate, so Testing
// shows no data on Both (a recorded exception to rule 3.3). Instead: one line saying why, and
// two equal outline buttons that switch the WHOLE dashboard to that school (the same as
// clicking it in the switcher). Neither is the main choice, so neither is blue (rule 1.1).
import { IconMapPin } from '@tabler/icons-react';
import { LOCATIONS } from '../../lib/device.js';
import { BLOCKED_ON_BOTH } from './text.js';

export default function BlockedOnBoth({ onChoose }) {
  return (
    <div className="blocked">
      <p>{BLOCKED_ON_BOTH}</p>
      <div className="blocked-buttons">
        {LOCATIONS.map((school) => (
          <button key={school} type="button" className="btn" onClick={() => onChoose(school)}>
            {/* ti-map-pin = location */}
            <IconMapPin size={16} aria-hidden="true" />
            {school}
          </button>
        ))}
      </div>
    </div>
  );
}
