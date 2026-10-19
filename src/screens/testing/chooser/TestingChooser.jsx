// TestingChooser.jsx — the Testing choice page (address #testing, rulebook v0.59 / v0.177).
// Why it exists: Testing now has two kinds — Color belt testing and Star testing — so clicking
// Testing in the rail or the phone bottom bar opens this short page first. It shows only while the
// Star testing build switch is on (lib/features.js); with it off, Testing opens Color Belt directly.
//
// What it shows (approved Chooser mockups, screen 1):
//   Testing                                        (the page title)
//   [ti-certificate] Color belt testing         >  (+ "Next: Jan 9 · Shrewsbury" once there is one)
//   [ti-star]        Star testing               >  (no line in phase 1: Star has no events yet)
// The same for staff and admins, and it works on Both (it reads Color Belt's events of both schools).
// Each row is one big button: the whole row opens that testing page.
//
// Props:
//   location        'Worcester' | 'Shrewsbury' | 'Both' (the top-bar switcher)
//   screenLocked    true while the lock screen shows (nothing is read then)
//   onNoAccess()    the database said this sign-in is locked: lock the screen (App.jsx), like every
//                   other Testing read
//   onOpen(page)    open 'colorBelt' or 'star' (App.jsx adds a browser Back step)
//   focusPage       the row to give keyboard focus to when this page appears (e.g. after "← Testing"
//                   from Star testing, focus lands back on the Star row), or null
import { useEffect, useRef, useState } from 'react';
import { IconCertificate, IconChevronRight, IconStar } from '@tabler/icons-react';
import { loadNextColorBeltEvent } from '../../../lib/testingChooserApi.js';
import { CHOOSER_TITLE, COLOR_BELT_ROW, STAR_ROW, nextEventLine } from './text.js';
import './chooser.css';

// The last answer per switcher value, kept while the app is open: coming back to the chooser
// shows the line straight away instead of the row growing a moment later (it is re-checked anyway).
const lastNext = {};

export default function TestingChooser({ location, screenLocked = false, onNoAccess, onOpen, focusPage = null }) {
  const [next, setNext] = useState(() => lastNext[location] ?? null);
  const rowRefs = useRef({});

  // Read Color Belt's next event for the school(s) shown. Not while locked (no requests then).
  useEffect(() => {
    setNext(lastNext[location] ?? null);
    if (screenLocked) return undefined;
    let stale = false; // the switcher moved on (or the page closed) before the answer came
    loadNextColorBeltEvent(location).then((answer) => {
      if (stale) return;
      if (answer.status === 'no_access') {
        onNoAccess?.(); // the lock screen shows; this reads again after unlocking
        return;
      }
      if (answer.status !== 'ok') return; // offline etc.: keep what we had (no line if nothing)
      lastNext[location] = answer.next;
      setNext(answer.next);
    });
    return () => {
      stale = true;
    };
  }, [location, screenLocked, onNoAccess]);

  // Coming back here with the keyboard: focus the row of the page we came from.
  useEffect(() => {
    if (focusPage) rowRefs.current[focusPage]?.focus();
  }, [focusPage]);

  const rows = [
    { key: 'colorBelt', label: COLOR_BELT_ROW, Icon: IconCertificate, line: next ? nextEventLine(next.date, next.school) : null },
    { key: 'star', label: STAR_ROW, Icon: IconStar, line: null }, // Star's events come in phase 2
  ];

  return (
    <div className="testing tc-page">
      <div className="phead">
        <div className="phead-titles">
          <h1 className="ptitle">{CHOOSER_TITLE}</h1>
        </div>
      </div>
      <ul className="tc-list">
        {rows.map(({ key, label, Icon, line }) => (
          <li key={key}>
            <button
              ref={(element) => {
                rowRefs.current[key] = element;
              }}
              type="button"
              className="tc-row"
              onClick={() => onOpen(key)}
            >
              {/* ti-certificate = Color belt testing, ti-star = Star testing (icon map, v0.59) */}
              <span className="tc-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className="tc-text">
                <span className="tc-name">{label}</span>
                {line && <span className="tc-next">{line}</span>}
              </span>
              {/* ti-chevron-right = go to a page */}
              <IconChevronRight className="tc-chevron" size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
