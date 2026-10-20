// Progress.jsx — the progress track, drawn two ways (rulebook v0.246, mockup screens 11 and 13).
// Why it exists: one look shows where a child is: Signed up → Class booked → Came → Joined.
//   Track     the small dots + one line, in each List row (and on the phone's list cards)
//   BigTrack  the large track at the top of the side panel: each step's name and date under it,
//             then a "Next:" line saying what to do
// Green = done, blue ring = the next step, gray = not yet; a No-show is amber, a side exit gray.
// The colors never carry the meaning alone: the line, the step names and the screen-reader words
// say it too (rulebook section 5).
import { IconAlertTriangle, IconArrowRight, IconCheck, IconX } from '@tabler/icons-react';
import { STEP_NAMES, progressWords } from './progress.js';
import * as T from './text.js';

function Dots({ steps }) {
  return (
    <span className="ptrk" aria-hidden="true">
      {steps.map((s, i) => (
        <span key={i} className="ptrk-step">
          {i > 0 && <span className={`ptrk-line${['done', 'next', 'stopped'].includes(s.state) ? ' is-done' : ''}`} />}
          <span className={`ptrk-dot is-${s.state}`} />
        </span>
      ))}
    </span>
  );
}

// The small one: dots + the line (List rows, phone cards)
export function Track({ progress }) {
  const { steps, line } = progress;
  return (
    <span className="ptrack">
      <Dots steps={steps} />
      <span className="visually-hidden">{progressWords(steps)}. </span>
      <span className={`ptrack-text${line.tone ? ` is-${line.tone}` : ''}`}>
        {line.tone === 'warn' && <IconAlertTriangle size={16} aria-hidden="true" className="plist-warn" />}
        {line.text}
      </span>
    </span>
  );
}

// The big one at the top of the panel
export function BigTrack({ progress }) {
  const { steps, next } = progress;
  return (
    <div className="pbigtrack">
      <ol className="pbigtrack-steps" aria-label={T.PROGRESS_LABEL}>
        {steps.map((s, i) => (
          <li key={i} className={`pbigtrack-step is-${s.state}`}>
            <span className="pbigtrack-dot" aria-hidden="true">
              {s.state === 'done' && <IconCheck size={12} stroke={3} />}
              {s.state === 'stopped' && <IconX size={12} stroke={3} />}
            </span>
            <span className="pbigtrack-name">{STEP_NAMES[i]}</span>
            {s.date && <span className="pbigtrack-date">{s.date}</span>}
            <span className="visually-hidden">
              {T.STEP_STATE[s.state]}
            </span>
          </li>
        ))}
      </ol>
      {next && (
        <p className={`pbigtrack-next${next.warn ? ' is-warn' : ''}`}>
          {next.warn ? <IconAlertTriangle size={16} aria-hidden="true" /> : <IconArrowRight size={16} aria-hidden="true" />}
          <span>
            {T.NEXT} {next.text}
          </span>
        </p>
      )}
    </div>
  );
}
