// WaiverPanel.jsx — "Read all" on step 2: the school's whole waiver (mockup Form 5, rulebook
// v0.213; contract 0016-B1 §4.5).
// Why it exists: step 2 shows only the first lines of the waiver; Read all opens the whole text
// in the same panel as the requirements (full screen on phones, a dialog on tablets and PCs),
// with its version ("Version 2027-1" — the version the page sends with the registration, v0.905).
// The text is plain text drawn by React (line breaks kept by CSS), never as HTML.
import Panel from './Panel.jsx';
import * as T from './text.js';

export default function WaiverPanel({ waiver, onClose }) {
  return (
    <Panel title={T.WAIVER_TITLE} levelKey="waiver" onBack={null} onClose={onClose}>
      <p className="bbf-panel__intro">{T.waiverVersion(waiver?.version_name ?? '')}</p>
      <div className="bbf-waiver__full">{waiver?.body ?? ''}</div>
    </Panel>
  );
}
