// PartsPage.jsx — the shared parts page (parts.html), preview only (Dashboard core step 1, plan §4).
// Why it exists: the eight shared parts (M1–M8) are built before any section uses them (rulebook
// v1.030), so they need a page of their own where they can be seen and checked: every part in every
// state, with sample data and sample actions, no database. The design reviewer compares it with the
// approved mockups at the four sizes; the picture tool (docs/Dashboard Core/tools/shoot-parts.mjs)
// photographs it.
// After step 1, DP: the shared date picker opened from a section's own button (rulebook v0.817,
// Finance's Daily report), which has no mockup of its own (Finance's F1 picture draws it).
// Addresses: parts.html            → the list of every part and state (links)
//            parts.html#M2/busy    → that one state on its own (dialogs open as real dialogs)
// The state ids are the mockups' own (Mockups/shots/M#/states.json). A few extra states exist only
// for the behaviour checks (e.g. #M2/ontop) and are listed apart.
// It is not part of the build (vite.config.js doesn't list parts.html), and src/parts/main.jsx
// refuses to draw it outside preview mode.
import { useEffect, useState } from 'react';
import { PART as M1 } from './M1.jsx';
import { PART as M2 } from './M2.jsx';
import { PART as M3 } from './M3.jsx';
import { PART as M4 } from './M4.jsx';
import { PART as M5 } from './M5.jsx';
import { PART as M6 } from './M6.jsx';
import { PART as M7 } from './M7.jsx';
import { PART as M8 } from './M8.jsx';
import { PART as DP } from './DP.jsx';

const PARTS = [M1, M2, M3, M4, M5, M6, M7, M8, DP];

// "#M2/busy" → { part, state } (either may be missing)
function readAddress() {
  const [partId, stateId] = window.location.hash.replace(/^#/, '').split('/');
  const part = PARTS.find((p) => p.id === partId) ?? null;
  const state = part ? [...part.states, ...(part.extra ?? [])].find((s) => s.id === stateId) ?? null : null;
  return { part, state };
}

function Index() {
  return (
    <main className="parts-page">
      <h1 className="parts-h1">Shared parts</h1>
      <p className="parts-intro">
        Dashboard core step 1: the eight shared parts approved as mockups M1–M8 (rulebook v1.102–v1.109), each in every state, with sample data. Then DP: the date
        picker opened from a section's own button (v0.817). Preview only; nothing here reads or saves anything. Each link opens one state on its own.
      </p>
      {PARTS.map((part) => (
        <section key={part.id} className="parts-part">
          <h2 className="parts-h2">
            {part.id} · {part.title} <span className="parts-file">{part.file}</span>
          </h2>
          <ul className="parts-links">
            {part.states.map((state) => (
              <li key={state.id}>
                <a href={`#${part.id}/${state.id}`}>
                  <code>{state.id}</code> {state.title}
                </a>
              </li>
            ))}
            {(part.extra ?? []).map((state) => (
              <li key={state.id} className="parts-extra">
                <a href={`#${part.id}/${state.id}`}>
                  <code>{state.id}</code> {state.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

function StatePage({ part, state }) {
  return (
    <main className="parts-page" data-part={part.id} data-state={state.id} data-kind={state.dialog ? 'dialog' : state.print ? 'print' : 'inline'}>
      <p className="parts-head">
        <a href="#">All parts</a>
        <span className="parts-title">
          {part.id} · {state.title}
        </span>
        <code>
          #{part.id}/{state.id}
        </code>
      </p>
      {state.render()}
    </main>
  );
}

export default function PartsPage() {
  const [address, setAddress] = useState(readAddress);
  useEffect(() => {
    const update = () => setAddress(readAddress());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const { part, state } = address;
  if (!part || !state) return <Index />;
  // key: a new state starts from scratch (nothing left over from the last one)
  return <StatePage key={`${part.id}/${state.id}`} part={part} state={state} />;
}
